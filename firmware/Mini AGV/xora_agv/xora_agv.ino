// ============================================================
//  XORA Mini AGV — Firmware v0.4
//  + WiFiManager: auto hotspot jika WiFi gagal
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
const char* MQTT_BROKER   = "broker.hivemq.com";
const int   MQTT_PORT     = 1883;
const char* MQTT_CLIENT_ID = "xora-agv-001";

// ─── MQTT Topics ──────────────────────────────────────────────────────────────
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
#define TRIG_PIN    18
#define ECHO_PIN    19
#define HX_DT       35
#define HX_SCK      32
#define PIN_LED     2
#define PIN_BUZZER  33

#define PIN_STBY  4
#define PIN_PWMA  25
#define PIN_AIN1  26
#define PIN_AIN2  27
#define PIN_PWMB  14
#define PIN_BIN1  12
#define PIN_BIN2  13

#define MOTOR_SPEED_DEFAULT  180
#define MOTOR_SPEED_TURN     130

// ─── OLED ─────────────────────────────────────────────────────────────────────
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// ─── Hardware ─────────────────────────────────────────────────────────────────
HX711        scale;
WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

// ─── State Machine ────────────────────────────────────────────────────────────
enum AGVState {
  IDLE, READY, FOLLOW_LINE,
  DECISION_AT_INTERSECTION,
  ARRIVED_AT_DESTINATION,
  LOAD_UNLOAD,
  RETURN_TO_BASE,
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
bool  objectDetected = false;
bool  emergencyStop  = false;
bool  buttonPressed  = false;
float distanceCm     = 0;
float loadGrams      = 0;

// ─── Timing ───────────────────────────────────────────────────────────────────
unsigned long tLastSensorPublish = 0;
unsigned long tLastMqttReconnect = 0;
unsigned long tArrivedAt         = 0;

const unsigned long SENSOR_INTERVAL = 500;
const unsigned long MQTT_RETRY_MS   = 3000;

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

void motorRight(int speed,int dir){
  if(dir==0||speed==0){digitalWrite(PIN_AIN1,LOW);digitalWrite(PIN_AIN2,LOW);analogWrite(PIN_PWMA,0);return;}
  digitalWrite(PIN_AIN1,dir==1?HIGH:LOW);
  digitalWrite(PIN_AIN2,dir==1?LOW:HIGH);
  analogWrite(PIN_PWMA,speed);
}

void motorLeft(int speed,int dir){
  if(dir==0||speed==0){digitalWrite(PIN_BIN1,LOW);digitalWrite(PIN_BIN2,LOW);analogWrite(PIN_PWMB,0);return;}
  digitalWrite(PIN_BIN1,dir==1?HIGH:LOW);
  digitalWrite(PIN_BIN2,dir==1?LOW:HIGH);
  analogWrite(PIN_PWMB,speed);
}

void motorForward(int speed=MOTOR_SPEED_DEFAULT){ motorLeft(speed,1);motorRight(speed,1); }
void motorBackward(int speed=MOTOR_SPEED_DEFAULT){ motorLeft(speed,-1);motorRight(speed,-1); }
void motorTurnLeft(int speed=MOTOR_SPEED_TURN){ motorLeft(speed,-1);motorRight(speed,1); }
void motorTurnRight(int speed=MOTOR_SPEED_TURN){ motorLeft(speed,1);motorRight(speed,-1); }
void motorStop(){ motorLeft(0,0);motorRight(0,0); }

void handleManualCommand(const char* cmd){
  if     (strcmp(cmd,"FORWARD") ==0) motorForward();
  else if(strcmp(cmd,"BACKWARD")==0) motorBackward();
  else if(strcmp(cmd,"LEFT")    ==0) motorTurnLeft();
  else if(strcmp(cmd,"RIGHT")   ==0) motorTurnRight();
  else if(strcmp(cmd,"STOP")    ==0) motorStop();
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
    case DECISION_AT_INTERSECTION: return "DECISION_AT_INTERSECTION";
    case ARRIVED_AT_DESTINATION:   return "ARRIVED_AT_DESTINATION";
    case LOAD_UNLOAD:              return "LOAD_UNLOAD";
    case RETURN_TO_BASE:           return "RETURN_TO_BASE";
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
  char buf[32];
  snprintf(buf,sizeof(buf),"%.1f",distanceCm); mqtt.publish(TOPIC_SENSOR_US,buf);
  snprintf(buf,sizeof(buf),"%.0f",loadGrams);  mqtt.publish(TOPIC_SENSOR_LC,buf);
  mqtt.publish(TOPIC_SENSOR_IR,
    objectDetected?"{\"s1\":0,\"s2\":0,\"s3\":1,\"s4\":0,\"s5\":0}"
                  :"{\"s1\":0,\"s2\":0,\"s3\":0,\"s4\":0,\"s5\":0}");
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

  if(strcmp(topic,TOPIC_MANUAL_CMD)==0){
    if(currentMode==MODE_MANUAL) handleManualCommand(msg);
    return;
  }

  if(strcmp(topic,TOPIC_COMMAND)!=0) return;

  StaticJsonDocument<128> doc;
  if(deserializeJson(doc,msg)!=DeserializationError::Ok) return;
  const char* cmd=doc["command"];
  if(!cmd) return;

  if(strcmp(cmd,"EMERGENCY_STOP")==0){
    emergencyStop=true; motorStop();
    currentState=ERROR_STATE;
    publishEvent("ESTOP","Emergency stop from dashboard");
    beeper.start(800); return;
  }

  if(strcmp(cmd,"SET_MODE_AUTO")==0){
    motorStop();
    currentMode=MODE_AUTO; currentState=IDLE; currentDest=DEST_NONE;
    publishState();
    publishEvent("MODE_AUTO","Switched to AUTO mode");
    drawOLED("AUTO MODE","Siap terima","perintah");
    return;
  }

  if(strcmp(cmd,"SET_MODE_MANUAL")==0){
    motorStop(); currentMode=MODE_MANUAL;
    if(currentState==FOLLOW_LINE||currentState==ARRIVED_AT_DESTINATION){
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

  // ── WiFiManager reset via MQTT ──
  if(strcmp(cmd,"RESET_WIFI")==0){
    publishEvent("WIFI_RESET","Resetting WiFi config...");
    drawOLED("WIFI RESET","Restart as","hotspot...");
    delay(1000);
    WiFiManager wm;
    wm.resetSettings();   // hapus kredensial tersimpan
    ESP.restart();        // restart → otomatis jadi hotspot
    return;
  }

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
      char ev[30]; snprintf(ev,sizeof(ev),"Destination set to %s",destStr(newDest));
      publishEvent("DEST_SET",ev);
    }
  } else {
    publishEvent("INVALID_CMD","Command ignored: AGV busy");
  }
}

// ─── MQTT Connect ─────────────────────────────────────────────────────────────
void mqttConnect(){
  if(mqtt.connected()) return;
  unsigned long now=millis();
  if(now-tLastMqttReconnect<MQTT_RETRY_MS) return;
  tLastMqttReconnect=now;
  Serial.printf("[MQTT] Connecting to %s...\n",MQTT_BROKER);
  if(mqtt.connect(MQTT_CLIENT_ID)){
    Serial.println("[MQTT] Connected!");
    mqtt.subscribe(TOPIC_COMMAND);
    mqtt.subscribe(TOPIC_MANUAL_CMD);
    publishState();
    publishEvent("ONLINE","Xora AGV online");
  } else {
    Serial.printf("[MQTT] Failed rc=%d\n",mqtt.state());
  }
}

// ─── WiFiManager Setup ────────────────────────────────────────────────────────
void wifiSetup(){
  WiFiManager wm;

  // Callback saat masuk mode hotspot
  wm.setAPCallback([](WiFiManager* wm){
    Serial.println("[WiFi] Hotspot aktif: XORA-Setup");
    drawOLED("WIFI SETUP","Connect ke:","XORA-Setup");
  });

  // Timeout hotspot 120 detik — kalau tidak ada yang connect, lanjut tanpa WiFi
  wm.setConfigPortalTimeout(120);

  // Coba connect ke WiFi tersimpan, kalau gagal → jadi hotspot "XORA-Setup"
  // tanpa password (bisa ditambah password sebagai argumen ke-2)
  if(!wm.autoConnect("XORA-Setup")){
    Serial.println("[WiFi] Timeout/gagal — lanjut tanpa WiFi");
    drawOLED("WIFI GAGAL","Mode offline","MQTT disabled");
    delay(2000);
  } else {
    Serial.printf("[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
    drawOLED("WIFI OK", WiFi.localIP().toString().c_str(), "");
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

  motorSetup();

  Wire.begin(21,22);
  display.begin(SSD1306_SWITCHCAPVCC,0x3C);
  drawOLED("Booting...","","");

  scale.begin(HX_DT,HX_SCK);
  scale.set_scale();
  scale.tare();

  // WiFiManager — gantikan wifiConnect() lama
  wifiSetup();

  mqtt.setServer(MQTT_BROKER,MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  if(WiFi.status()==WL_CONNECTED) mqttConnect();

  drawOLED("IDLE","Dest: --",modeStr(currentMode));
  beeper.start(150);
  Serial.println("[XORA] System ready.");
}

// ─── STATE MACHINE ────────────────────────────────────────────────────────────
void runStateMachine(){
  if(emergencyStop&&currentState!=ERROR_STATE){
    currentState=ERROR_STATE; emergencyStop=false;
  }

  switch(currentState){

    case IDLE:
      digitalWrite(PIN_LED,LOW);
      drawOLED("IDLE","Tunggu perintah",modeStr(currentMode));
      break;

    case READY:{
      char db[20]; snprintf(db,sizeof(db),"Tujuan: %s",destStr(currentDest));
      drawOLED("READY",db,"Cek barang...");
      if(currentDest==DEST_NONE){ currentState=IDLE;publishEvent("INVALID_DEST","No destination");break; }
      bool canMove=(currentMode==MODE_MANUAL)?true:objectDetected;
      if(!canMove){
        currentState=ERROR_STATE;
        drawOLED("ERROR","NO OBJECT","Taruh barang!");
        publishEvent("NO_OBJECT","Object not detected");
        beeper.start(400);
      } else {
        currentState=FOLLOW_LINE;
        digitalWrite(PIN_LED,HIGH);
        publishEvent("MOVING","AGV starting");
      }
      break;
    }

    case FOLLOW_LINE:{
      char db[20]; snprintf(db,sizeof(db),"→ %s",destStr(currentDest));
      drawOLED("MOVING",db,"Follow line...");
      if(distanceCm>0&&distanceCm<10){
        currentState=ERROR_STATE; motorStop();
        publishEvent("OBSTACLE_DETECTED","Object too close");
        beeper.start(300); break;
      }
      static unsigned long tStart=0;
      if(tStart==0) tStart=millis();
      if(millis()-tStart>3000){
        tStart=0;
        currentState=ARRIVED_AT_DESTINATION;
        publishEvent("ARRIVED","AGV arrived at destination");
        beeper.start(200);
      }
      break;
    }

    case ARRIVED_AT_DESTINATION:
      drawOLED("ARRIVED",destStr(currentDest),"Ambil barang...");
      if(tArrivedAt==0) tArrivedAt=millis();
      if(millis()-tArrivedAt>3000) objectDetected=false;
      if(!objectDetected){
        publishEvent("UNLOADED","Cargo picked up");
        currentState=RETURN_TO_BASE;
        tArrivedAt=0; beeper.start(150);
      } else if(millis()-tArrivedAt>30000){
        publishEvent("WAITING_PICKUP","Timeout waiting");
        tArrivedAt=millis();
      }
      break;

    case RETURN_TO_BASE:{
      drawOLED("RETURNING","→ BASE","");
      static unsigned long tReturn=0;
      if(tReturn==0) tReturn=millis();
      if(millis()-tReturn>2000){
        currentState=IDLE; currentDest=DEST_NONE;
        tReturn=0; digitalWrite(PIN_LED,LOW);
        if(currentMode==MODE_MANUAL) currentState=MANUAL_OVERRIDE;
        publishEvent("RETURNED","AGV back at base");
      }
      break;
    }

    case MANUAL_OVERRIDE:
      drawOLED("MANUAL","Mode manual","WASD/Dashboard");
      break;

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

  if(currentMode!=MODE_MANUAL){
    if(scale.is_ready()){
      loadGrams=scale.get_units(1);
      objectDetected=loadGrams>10;
    }
  }

  runStateMachine();

  if(currentState!=prevState){
    publishState();
    Serial.printf("[STATE] %s → %s | Dest: %s | Mode: %s\n",
      stateStr(prevState),stateStr(currentState),destStr(currentDest),modeStr(currentMode));
    prevState=currentState;
  }

  if(now-tLastSensorPublish>=SENSOR_INTERVAL){
    tLastSensorPublish=now;
    if(mqtt.connected()) publishSensors();
  }
}
