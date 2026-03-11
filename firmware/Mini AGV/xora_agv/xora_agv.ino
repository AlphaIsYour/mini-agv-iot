// ============================================================
//  XORA Mini AGV — Firmware v0.5
//  + Line following (3 IR sensor)
//  + 180° turn di destination dan base
//  + Auto mode tidak perlu loadcell dulu
//  + Semua fungsionalitas v0.4 tetap ada
// ============================================================

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "HX711.h"
#include <WiFi.h>
#include <WiFiManager.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ─── MQTT ─────────────────────────────────────────────────────────────────────
const char* MQTT_BROKER    = "broker.hivemq.com";
const int   MQTT_PORT      = 1883;
const char* MQTT_CLIENT_ID = "xora-agv-001";

// ─── Topics ───────────────────────────────────────────────────────────────────
#define TOPIC_STATE       "xora/state"
#define TOPIC_DESTINATION "xora/destination"
#define TOPIC_MODE        "xora/mode"
#define TOPIC_SENSOR_US   "xora/sensor/ultrasonic"
#define TOPIC_SENSOR_LC   "xora/sensor/loadcell"
#define TOPIC_SENSOR_IR   "xora/sensor/ir"
#define TOPIC_EVENT       "xora/event"
#define TOPIC_BATTERY     "xora/battery"
#define TOPIC_COMMAND     "xora/command"
#define TOPIC_MANUAL_CMD  "agv/xora/cmd"

// ─── PIN ──────────────────────────────────────────────────────────────────────
// Sensor jarak
#define TRIG_PIN    18
#define ECHO_PIN    19

// Loadcell
#define HX_DT       35
#define HX_SCK      32

// Output
#define PIN_LED     2
#define PIN_BUZZER  33   // ⚠ bukan 35 (konflik HX_DT)

// Motor TB6612FNG
#define PIN_STBY  4
#define PIN_PWMA  25   // Motor KIRI  (A01/A02)
#define PIN_AIN1  26
#define PIN_AIN2  27
#define PIN_PWMB  14   // Motor KANAN (B01/B02)
#define PIN_BIN1  12
#define PIN_BIN2  13

// IR Line Sensor — input only pins (no internal pullup)
#define IR_LEFT   34   // GPIO34
#define IR_MID    36   // GPIO36
#define IR_RIGHT  39   // GPIO39
// LOW (0) = deteksi garis hitam
// HIGH(1) = permukaan putih

// ─── Motor speed ──────────────────────────────────────────────────────────────
#define SPD_NORMAL   110   // turunkan dari 160
#define SPD_TURN     80   // turunkan dari 120  
#define SPD_SPIN     100   // turunkan dari 150

// Durasi putar 180° — SESUAIKAN dengan AGV fisik
// Mulai dengan 900ms, naikkan/turunkan 100ms sampai pas
#define TURN_180_MS  900

// ─── OLED ─────────────────────────────────────────────────────────────────────
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT  64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// ─── Hardware ─────────────────────────────────────────────────────────────────
HX711        scale;
WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

// ─── State Machine ────────────────────────────────────────────────────────────
enum AGVState {
  IDLE,
  READY,
  FOLLOW_LINE,              // maju mengikuti garis ke tujuan
  TURN_180_AT_DEST,         // putar 180° di titik tujuan
  RETURN_TO_BASE,           // balik mengikuti garis ke base
  TURN_180_AT_BASE,         // putar 180° di base setelah kembali
  ARRIVED_AT_DESTINATION,   // (dipakai MQTT dashboard)
  LOAD_UNLOAD,
  DECISION_AT_INTERSECTION,
  MANUAL_OVERRIDE,
  ERROR_STATE
};

enum Destination { DEST_NONE, DEST_A, DEST_B, DEST_C };
enum AGVMode     { MODE_AUTO, MODE_MANUAL, MODE_PICKUP };

AGVState    currentState = IDLE;
Destination currentDest  = DEST_NONE;
AGVMode     currentMode  = MODE_AUTO;
AGVState    prevState    = (AGVState)-1;

// ─── Runtime vars ─────────────────────────────────────────────────────────────
bool  emergencyStop  = false;
bool  buttonPressed  = false;
float distanceCm     = 0;
float loadGrams      = 0;

// IR readings
bool irL=false, irM=false, irR=false;

// Timing
unsigned long tLastSensorPublish = 0;
unsigned long tLastMqttReconnect = 0;
unsigned long tTurn180Start      = 0;   // kapan mulai putar 180°
unsigned long tLineLost          = 0;   // kapan garis hilang

const unsigned long SENSOR_INTERVAL = 500;
const unsigned long MQTT_RETRY_MS   = 3000;
const unsigned long LINE_LOST_MS    = 2000; // toleransi garis hilang

// ─── Beeper ───────────────────────────────────────────────────────────────────
struct Beeper {
  bool active=false; unsigned long onAt=0; int duration=0;
  void start(int ms){ digitalWrite(PIN_BUZZER,HIGH);active=true;onAt=millis();duration=ms; }
  void tick(){ if(active&&millis()-onAt>=(unsigned long)duration){digitalWrite(PIN_BUZZER,LOW);active=false;} }
} beeper;

// ─── Motor ────────────────────────────────────────────────────────────────────
void motorStop();

void motorSetup(){
  pinMode(PIN_STBY,OUTPUT);
  pinMode(PIN_PWMA,OUTPUT);pinMode(PIN_AIN1,OUTPUT);pinMode(PIN_AIN2,OUTPUT);
  pinMode(PIN_PWMB,OUTPUT);pinMode(PIN_BIN1,OUTPUT);pinMode(PIN_BIN2,OUTPUT);
  digitalWrite(PIN_STBY,HIGH);
  motorStop();
}

void motorLeft(int speed,int dir){
  if(dir==0||speed==0){digitalWrite(PIN_AIN1,LOW);digitalWrite(PIN_AIN2,LOW);analogWrite(PIN_PWMA,0);return;}
  digitalWrite(PIN_AIN1,dir==1?HIGH:LOW);
  digitalWrite(PIN_AIN2,dir==1?LOW:HIGH);
  analogWrite(PIN_PWMA,speed);
}

void motorRight(int speed,int dir){
  if(dir==0||speed==0){digitalWrite(PIN_BIN1,LOW);digitalWrite(PIN_BIN2,LOW);analogWrite(PIN_PWMB,0);return;}
  digitalWrite(PIN_BIN1,dir==1?HIGH:LOW);
  digitalWrite(PIN_BIN2,dir==1?LOW:HIGH);
  analogWrite(PIN_PWMB,speed);
}

void motorForward (int s=SPD_NORMAL){ motorLeft(s,1); motorRight(s,1); }
void motorBackward(int s=SPD_NORMAL){ motorLeft(s,-1);motorRight(s,-1);}
// Putar kanan: roda kiri maju, roda kanan mundur
void motorSpinRight(int s=SPD_SPIN){ motorLeft(s,1); motorRight(s,-1);}
// Putar kiri: roda kiri mundur, roda kanan maju
void motorSpinLeft (int s=SPD_SPIN){ motorLeft(s,-1);motorRight(s,1); }
// Koreksi belok saat line following
void motorVeerLeft (int s=SPD_TURN){ motorLeft(s/2,1);motorRight(s,1); }
void motorVeerRight(int s=SPD_TURN){ motorLeft(s,1); motorRight(s/2,1);}
void motorStop(){ motorLeft(0,0);motorRight(0,0); }

void handleManualCommand(const char* cmd){
  if     (strcmp(cmd,"FORWARD") ==0) motorForward();
  else if(strcmp(cmd,"BACKWARD")==0) motorBackward();
  else if(strcmp(cmd,"LEFT")    ==0) motorSpinLeft();
  else if(strcmp(cmd,"RIGHT")   ==0) motorSpinRight();
  else if(strcmp(cmd,"STOP")    ==0) motorStop();
}

void readIR(){
  irL = (digitalRead(IR_LEFT)  == HIGH);
  irM = (digitalRead(IR_MID)   == HIGH);
  irR = (digitalRead(IR_RIGHT) == HIGH);
}


// Garis horizontal terdeteksi jika ketiga sensor ON
bool isHorizontalLine(){
  return irL && irM && irR;
}

// Line following logic — return true jika masih ada garis
bool doLineFollow(){
  readIR();
  if(isHorizontalLine()) return true;
  if(!irL && !irM && !irR) return false;

  if(!irL && irM && !irR)  motorForward(SPD_NORMAL);      // lurus
  else if(irL && irM && !irR)  motorVeerRight(SPD_TURN);  // serong kiri → koreksi kanan
  else if(!irL && irM && irR)  motorVeerLeft(SPD_TURN);   // serong kanan → koreksi kiri
  else if(irL && !irM && !irR) motorSpinRight(80);        // belok tajam pelan
  else if(!irL && !irM && irR) motorSpinLeft(80);         // belok tajam pelan
  else motorForward(SPD_NORMAL);
  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
float readDistance(){
  digitalWrite(TRIG_PIN,LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN,HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN,LOW);
  long dur=pulseIn(ECHO_PIN,HIGH,25000);
  return dur*0.034f/2.0f;
}

const char* stateStr(AGVState s){
  switch(s){
    case IDLE:                     return "IDLE";
    case READY:                    return "READY";
    case FOLLOW_LINE:              return "FOLLOW_LINE";
    case TURN_180_AT_DEST:         return "ARRIVED_AT_DESTINATION"; // dashboard baca ini
    case RETURN_TO_BASE:           return "RETURN_TO_BASE";
    case TURN_180_AT_BASE:         return "RETURN_TO_BASE";
    case ARRIVED_AT_DESTINATION:   return "ARRIVED_AT_DESTINATION";
    case LOAD_UNLOAD:              return "LOAD_UNLOAD";
    case DECISION_AT_INTERSECTION: return "DECISION_AT_INTERSECTION";
    case MANUAL_OVERRIDE:          return "MANUAL_OVERRIDE";
    case ERROR_STATE:              return "ERROR_STATE";
    default:                       return "UNKNOWN";
  }
}

const char* destStr(Destination d){
  switch(d){ case DEST_A:return "A";case DEST_B:return "B";case DEST_C:return "C";default:return "BASE"; }
}

const char* modeStr(AGVMode m){
  switch(m){ case MODE_MANUAL:return "MANUAL";case MODE_PICKUP:return "PICKUP";default:return "AUTO"; }
}

void drawOLED(const char* l1,const char* l2="",const char* l3=""){
  display.clearDisplay();
  display.setTextSize(1);display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,0);display.println("XORA AGV");
  display.println("----------------");
  display.setCursor(0,20);display.println(l1);
  display.setCursor(0,32);display.println(l2);
  display.setCursor(0,44);display.println(l3);
  display.display();
}

// ─── MQTT Publish ─────────────────────────────────────────────────────────────
void publishState(){
  mqtt.publish(TOPIC_STATE,      stateStr(currentState),true);
  mqtt.publish(TOPIC_DESTINATION,destStr(currentDest),  true);
  mqtt.publish(TOPIC_MODE,       modeStr(currentMode),  true);
}

void publishSensors(){
  char buf[64];
  snprintf(buf,sizeof(buf),"%.1f",distanceCm); mqtt.publish(TOPIC_SENSOR_US,buf);
  snprintf(buf,sizeof(buf),"%.0f",loadGrams);  mqtt.publish(TOPIC_SENSOR_LC,buf);
  // Publish IR ke dashboard
  snprintf(buf,sizeof(buf),"{\"s1\":%d,\"s2\":%d,\"s3\":%d,\"s4\":0,\"s5\":0}",
    irL?1:0, irM?1:0, irR?1:0);
  mqtt.publish(TOPIC_SENSOR_IR,buf);
}

void publishEvent(const char* code,const char* message){
  StaticJsonDocument<200> doc;
  doc["code"]=code; doc["message"]=message; doc["ts"]=millis();
  char buf[200]; serializeJson(doc,buf);
  mqtt.publish(TOPIC_EVENT,buf);
  Serial.printf("[EVENT] %s: %s\n",code,message);
}

// ─── MQTT Callback ────────────────────────────────────────────────────────────
void onMqttMessage(char* topic,byte* payload,unsigned int length){
  char msg[256];
  length=min(length,(unsigned int)255);
  memcpy(msg,payload,length); msg[length]='\0';
  Serial.printf("[MQTT IN] %s: %s\n",topic,msg);

  // Manual motor
  if(strcmp(topic,TOPIC_MANUAL_CMD)==0){
    if(currentMode==MODE_MANUAL) handleManualCommand(msg);
    return;
  }

  if(strcmp(topic,TOPIC_COMMAND)!=0) return;

  StaticJsonDocument<128> doc;
  if(deserializeJson(doc,msg)!=DeserializationError::Ok) return;
  const char* cmd=doc["command"];
  if(!cmd) return;

  // Emergency stop
  if(strcmp(cmd,"EMERGENCY_STOP")==0){
    emergencyStop=true; motorStop();
    currentState=ERROR_STATE;
    publishEvent("ESTOP","Emergency stop from dashboard");
    beeper.start(800); return;
  }

  // Mode AUTO
  if(strcmp(cmd,"SET_MODE_AUTO")==0){
    motorStop();
    currentMode=MODE_AUTO; currentState=IDLE; currentDest=DEST_NONE;
    publishState();
    publishEvent("MODE_AUTO","Switched to AUTO mode");
    drawOLED("AUTO MODE","Siap terima","perintah");
    return;
  }

  // Mode MANUAL
  if(strcmp(cmd,"SET_MODE_MANUAL")==0){
    motorStop(); currentMode=MODE_MANUAL;
    if(currentState==FOLLOW_LINE||currentState==RETURN_TO_BASE){
      currentState=RETURN_TO_BASE;
      publishEvent("FORCED_RETURN","Returning to base first");
    } else { currentState=MANUAL_OVERRIDE; }
    publishState(); return;
  }

  if(strcmp(cmd,"SET_MODE_PICKUP")==0){ currentMode=MODE_PICKUP; publishState(); return; }

  if(strcmp(cmd,"RETURN_BASE")==0){
    motorStop(); currentState=RETURN_TO_BASE;
    publishState(); publishEvent("CMD_RETURN","Return to base"); return;
  }

  if(strcmp(cmd,"RESET_ERROR")==0){
    motorStop(); emergencyStop=false;
    currentState=IDLE; currentDest=DEST_NONE;
    publishState(); publishEvent("RESET","Error cleared"); return;
  }

  // WiFi reset
  if(strcmp(cmd,"RESET_WIFI")==0){
    publishEvent("WIFI_RESET","Resetting WiFi...");
    drawOLED("WIFI RESET","Restart...","");
    delay(1000);
    WiFiManager wm; wm.resetSettings(); ESP.restart(); return;
  }

  // Destination — hanya saat IDLE/READY dan bukan MANUAL
  if(currentMode==MODE_MANUAL){
    publishEvent("INVALID_CMD","Destination ignored in MANUAL mode"); return;
  }

  if(currentState==IDLE||currentState==READY){
    Destination newDest=DEST_NONE;
    if     (strcmp(cmd,"SET_DEST_A")==0) newDest=DEST_A;
    else if(strcmp(cmd,"SET_DEST_B")==0) newDest=DEST_B;
    else if(strcmp(cmd,"SET_DEST_C")==0) newDest=DEST_C;
    if(newDest!=DEST_NONE){
      currentDest=newDest; currentState=READY;
      beeper.start(100); publishState();
      char ev[32]; snprintf(ev,sizeof(ev),"Destination: %s",destStr(newDest));
      publishEvent("DEST_SET",ev);
    }
  } else {
    publishEvent("INVALID_CMD","AGV busy");
  }
}

// ─── MQTT Connect ─────────────────────────────────────────────────────────────
void mqttConnect(){
  if(mqtt.connected()) return;
  unsigned long now=millis();
  if(now-tLastMqttReconnect<MQTT_RETRY_MS) return;
  tLastMqttReconnect=now;
  if(mqtt.connect(MQTT_CLIENT_ID)){
    Serial.println("[MQTT] Connected!");
    delay(100);
    mqtt.subscribe(TOPIC_COMMAND);
    mqtt.subscribe(TOPIC_MANUAL_CMD);
    publishState();
    publishEvent("ONLINE","Xora AGV online");
  } else {
    Serial.printf("[MQTT] Failed rc=%d\n",mqtt.state());
  }
}

// ─── WiFiManager ──────────────────────────────────────────────────────────────
void wifiSetup(){
  WiFiManager wm;
  wm.setAPCallback([](WiFiManager* wm){
    Serial.println("[WiFi] Hotspot: XORA-Setup");
    drawOLED("WIFI SETUP","Connect ke:","XORA-Setup");
  });
  wm.setConfigPortalTimeout(120);
  if(!wm.autoConnect("XORA-Setup")){
    Serial.println("[WiFi] Timeout — offline mode");
    drawOLED("WIFI GAGAL","Mode offline","");
    delay(2000);
  } else {
    Serial.printf("[WiFi] IP: %s\n",WiFi.localIP().toString().c_str());
    drawOLED("WIFI OK",WiFi.localIP().toString().c_str(),"");
    delay(1000);
  }
}

// ─── SETUP ────────────────────────────────────────────────────────────────────
void setup(){
  Serial.begin(115200);
  pinMode(PIN_LED,OUTPUT);
  pinMode(PIN_BUZZER,OUTPUT);
  pinMode(TRIG_PIN,OUTPUT);
  pinMode(ECHO_PIN,INPUT);

  // IR — input only, no pullup (modul punya output sendiri)
  pinMode(IR_LEFT, INPUT);
  pinMode(IR_MID,  INPUT);
  pinMode(IR_RIGHT,INPUT);

  motorSetup();

  Wire.begin(21,22);
  display.begin(SSD1306_SWITCHCAPVCC,0x3C);
  drawOLED("Booting...","","");

  scale.begin(HX_DT,HX_SCK);
  scale.set_scale();
  scale.tare();

  wifiSetup();

  mqtt.setServer(MQTT_BROKER,MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  if(WiFi.status()==WL_CONNECTED) mqttConnect();

  drawOLED("IDLE","Dest: --",modeStr(currentMode));
  beeper.start(150);
  Serial.println("[XORA] Ready.");
}

// ─── STATE MACHINE ────────────────────────────────────────────────────────────
void runStateMachine(){
  if(emergencyStop&&currentState!=ERROR_STATE){
    currentState=ERROR_STATE; emergencyStop=false;
  }

  switch(currentState){

    // ── IDLE: diam di BASE, siap terima perintah ──────────────────────────────
    case IDLE:
      digitalWrite(PIN_LED,LOW);
      drawOLED("IDLE","Tunggu perintah",modeStr(currentMode));
      break;

    // ── READY: tujuan sudah di-set, langsung mulai jalan ─────────────────────
    case READY:
      if(currentDest==DEST_NONE){ currentState=IDLE; break; }
      // v0.5: tidak perlu loadcell — langsung FOLLOW_LINE
      currentState=FOLLOW_LINE;
      digitalWrite(PIN_LED,HIGH);
      tLineLost=0;
      publishEvent("MOVING","AGV starting, following line");
      break;

    // ── FOLLOW_LINE: ikuti garis ke tujuan ───────────────────────────────────
    case FOLLOW_LINE:{
      char db[24]; snprintf(db,sizeof(db),"→ %s",destStr(currentDest));
      drawOLED("MOVING",db,"Follow line...");

      // Cek obstacle
      if(distanceCm>0&&distanceCm<10){
        motorStop(); currentState=ERROR_STATE;
        publishEvent("OBSTACLE_DETECTED","Too close");
        beeper.start(300); break;
      }

      readIR();

      // Deteksi garis horizontal = sampai di tujuan
      if(isHorizontalLine()){
        motorStop();
        publishEvent("ARRIVED","Arrived at destination");
        beeper.start(300);
        currentState=TURN_180_AT_DEST;
        tTurn180Start=millis();
        break;
      }

      // Line following
      bool lineOk = doLineFollow();
      if(!lineOk){
        if(tLineLost==0) tLineLost=millis();
        if(millis()-tLineLost>LINE_LOST_MS){
          motorStop(); currentState=ERROR_STATE;
          publishEvent("LINE_LOST","Line not detected");
          beeper.start(500);
        }
      } else {
        tLineLost=0;
      }
      break;
    }

    // ── TURN_180_AT_DEST: putar 180° di titik tujuan ─────────────────────────
    case TURN_180_AT_DEST:
      drawOLED("ARRIVED",destStr(currentDest),"Putar balik...");
      motorSpinRight(SPD_SPIN);   // putar kanan 180°
      if(millis()-tTurn180Start>=TURN_180_MS){
        motorStop();
        currentState=RETURN_TO_BASE;
        tLineLost=0;
        publishEvent("RETURNING","Returning to base");
      }
      break;

    // ── RETURN_TO_BASE: ikuti garis balik ke BASE ─────────────────────────────
    case RETURN_TO_BASE:{
      drawOLED("RETURNING","→ BASE","Follow line...");

      readIR();

      // Deteksi garis horizontal = sampai di BASE
      if(isHorizontalLine()){
        motorStop();
        publishEvent("AT_BASE","Arrived at base");
        beeper.start(200);
        currentState=TURN_180_AT_BASE;
        tTurn180Start=millis();
        break;
      }

      // Line following (logika sama, AGV sudah terbalik arah)
      bool lineOk = doLineFollow();
      if(!lineOk){
        if(tLineLost==0) tLineLost=millis();
        if(millis()-tLineLost>LINE_LOST_MS){
          motorStop(); currentState=ERROR_STATE;
          publishEvent("LINE_LOST","Line not detected on return");
          beeper.start(500);
        }
      } else {
        tLineLost=0;
      }
      break;
    }

    // ── TURN_180_AT_BASE: putar 180° di BASE, kembali hadap maju ─────────────
    case TURN_180_AT_BASE:
      drawOLED("AT BASE","Putar balik...","Siap berangkat");
      motorSpinRight(SPD_SPIN);
      if(millis()-tTurn180Start>=TURN_180_MS){
        motorStop();
        currentState=IDLE;
        currentDest=DEST_NONE;
        digitalWrite(PIN_LED,LOW);
        publishEvent("RETURNED","AGV ready at base");
        beeper.start(150);
      }
      break;

    // ── MANUAL_OVERRIDE ───────────────────────────────────────────────────────
    case MANUAL_OVERRIDE:
      drawOLED("MANUAL","Mode manual","WASD/Dashboard");
      break;

    // ── ERROR ─────────────────────────────────────────────────────────────────
    case ERROR_STATE:
      digitalWrite(PIN_LED,LOW); motorStop();
      drawOLED("!! ERROR !!","Dashboard:","Reset Error");
      break;

    default: currentState=IDLE; break;
  }
}

// ─── LOOP ─────────────────────────────────────────────────────────────────────
void loop(){
  unsigned long now=millis();

  if(WiFi.status()==WL_CONNECTED){
    if(!mqtt.connected()) mqttConnect();
    mqtt.loop();
  }

  beeper.tick();

  distanceCm=readDistance();
  readIR(); // update global irL,irM,irR untuk publishSensors

  // Loadcell — tetap dibaca untuk monitoring, tidak wajib untuk jalan
  if(currentMode!=MODE_MANUAL){
    if(scale.is_ready()){
      loadGrams=scale.get_units(1);
    }
  }

  runStateMachine();

  if(currentState!=prevState){
    publishState();
    Serial.printf("[STATE] %s → %s | Dest:%s | Mode:%s\n",
      stateStr(prevState),stateStr(currentState),
      destStr(currentDest),modeStr(currentMode));
    prevState=currentState;
  }

  if(now-tLastSensorPublish>=SENSOR_INTERVAL){
    tLastSensorPublish=now;
    if(mqtt.connected()) publishSensors();
  }
}
