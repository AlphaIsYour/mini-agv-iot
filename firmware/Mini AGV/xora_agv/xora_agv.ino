#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "HX711.h"
#include <WiFi.h>
#include <WiFiManager.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ─── TinyML ───────────────────────────────────────────────────────────────────
#include "tinyml/tinyml_model.h"
#include "tinyml/tinyml_scaler.h"

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
#define TOPIC_ML_STATE    "xora/ml_state"

// ─── PIN ──────────────────────────────────────────────────────────────────────
#define TRIG_PIN    18
#define ECHO_PIN    19
#define HX_DT       35
#define HX_SCK      32
#define PIN_LED     2
#define PIN_BUZZER  15
#define PIN_VOLTAGE 33

#define PIN_STBY  4
#define PIN_PWMA  25
#define PIN_AIN1  26
#define PIN_AIN2  27
#define PIN_PWMB  14
#define PIN_BIN1  12
#define PIN_BIN2  13

#define IR_LEFT   34
#define IR_MID    36
#define IR_RIGHT  39

// ─── Kalibrasi loadcell ───────────────────────────────────────────────────────
// Cara kalibrasi:
//   1. Tare (kosong), catat nilai raw dari scale.get_units()
//   2. Taruh benda dengan berat diketahui (misal 100g)
//   3. Hitung: CALIBRATION_FACTOR = (raw_value - tare) / berat_gram
// Ubah nilai ini sesuai hasil kalibrasi fisik kamu:
#define CALIBRATION_FACTOR  420.0f  // <-- sesuaikan!

// ─── Battery ──────────────────────────────────────────────────────────────────
#define VOLTAGE_MAX_RAW   4095.0f
#define VOLTAGE_REF       3.3f
#define VOLTAGE_DIVIDER   7.8f
#define BATTERY_MAX_V     8.4f
#define BATTERY_MIN_V     6.0f
float batteryVoltage  = 0.0f;
int   batteryPercent  = 0;

// ─── Konfigurasi ──────────────────────────────────────────────────────────────
#define SPD_NORMAL   180
#define SPD_TURN     130
#define SPD_SPIN     160

#define STOP_AT_DEST_MS          3000
#define TURN_180_MS              1500
#define TURN_AT_INTERSECTION_MS  400

// ─── Ultrasonic ───────────────────────────────────────────────────────────────
// Jarak (cm) yang dianggap ada obstacle di depan
#define OBSTACLE_DIST_CM  20.0f

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
  IDLE, READY, FOLLOW_LINE,
  DECISION_AT_INTERSECTION,
  TURN_180_AT_DEST,
  RETURN_TO_BASE,
  DECISION_AT_INTERSECTION_RETURN,
  TURN_180_AT_BASE,
  ARRIVED_AT_DESTINATION,
  LOAD_UNLOAD,
  MANUAL_OVERRIDE,
  ERROR_STATE
};

enum Destination { DEST_NONE, DEST_A, DEST_B, DEST_C };
enum AGVMode     { MODE_AUTO, MODE_MANUAL, MODE_PICKUP };

AGVState    currentState = IDLE;
Destination currentDest  = DEST_NONE;
AGVMode     currentMode  = MODE_AUTO;
AGVState    prevState    = (AGVState)-1;

// ─── Intersection counter ─────────────────────────────────────────────────────
uint8_t intersectionCount = 0;
bool    onIntersection    = false;

// ─── TinyML State ─────────────────────────────────────────────────────────────
MovingAverage weightFilter(5);
float         lastWeight = 0;
MLState       mlState    = NO_OBJECT;

// ─── Runtime vars ─────────────────────────────────────────────────────────────
bool  emergencyStop  = false;
bool  buttonPressed  = false;
float distanceCm     = 0;
float loadGrams      = 0;
bool irL=false, irM=false, irR=false;

// ─── Timing ───────────────────────────────────────────────────────────────────
unsigned long tLastSensorPublish    = 0;
unsigned long tLastMqttReconnect    = 0;
unsigned long tTurn180Start         = 0;
unsigned long tStopAtDest           = 0;
unsigned long tLineLost             = 0;
unsigned long tLastScaleReady       = 0;
unsigned long tIntersectionTurn     = 0;
bool          scaleWarned           = false;
uint8_t       noObjectCount         = 0;

const unsigned long SENSOR_INTERVAL     = 500;
const unsigned long MQTT_RETRY_MS       = 3000;
const unsigned long LINE_LOST_MS        = 2000;
const unsigned long LOADCELL_TIMEOUT_MS = 2000;
const uint8_t       NO_OBJECT_DEBOUNCE  = 5;

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
void motorSpinRight(int s=SPD_SPIN){ motorLeft(s,1); motorRight(s,-1);}
void motorSpinLeft (int s=SPD_SPIN){ motorLeft(s,-1);motorRight(s,1); }
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

// ─── IR ───────────────────────────────────────────────────────────────────────
void readIR(){
  irL = (digitalRead(IR_LEFT)  == HIGH);
  irM = (digitalRead(IR_MID)   == HIGH);
  irR = (digitalRead(IR_RIGHT) == HIGH);
}

bool isAllSensor(){ return irL && irM && irR; }

bool doLineFollow(){
  if(irL && irM && irR)    return true;
  if(!irL && !irM && !irR) return false;

  if(!irL && irM && !irR)       motorForward(SPD_NORMAL);
  else if(irL && irM && !irR)   motorVeerRight(SPD_TURN);
  else if(!irL && irM && irR)   motorVeerLeft(SPD_TURN);
  else if(irL && !irM && !irR)  motorSpinRight(80);
  else if(!irL && !irM && irR)  motorSpinLeft(80);
  else                          motorForward(SPD_NORMAL);
  return true;
}

// ─── Ultrasonic (median filter 5 sampel) ──────────────────────────────────────
float readDistance(){
  float readings[5];
  for(int i=0;i<5;i++){
    digitalWrite(TRIG_PIN,LOW);  delayMicroseconds(2);
    digitalWrite(TRIG_PIN,HIGH); delayMicroseconds(10);
    digitalWrite(TRIG_PIN,LOW);
    long dur = pulseIn(ECHO_PIN, HIGH, 25000);
    readings[i] = (dur == 0) ? 999.0f : dur * 0.034f / 2.0f;
    delay(5);
  }
  // Insertion sort → ambil median (index 2)
  for(int i=1;i<5;i++){
    float key = readings[i]; int j = i-1;
    while(j>=0 && readings[j]>key){ readings[j+1]=readings[j]; j--; }
    readings[j+1]=key;
  }
  return readings[2];
}

// ─── Battery ──────────────────────────────────────────────────────────────────
void readBattery(){
  long sum = 0;
  for(int i=0;i<10;i++) sum += analogRead(PIN_VOLTAGE);
  int raw = sum / 10;
  batteryVoltage = (raw / VOLTAGE_MAX_RAW) * VOLTAGE_REF * VOLTAGE_DIVIDER;
  batteryPercent = constrain(
    (int)((batteryVoltage - BATTERY_MIN_V) / (BATTERY_MAX_V - BATTERY_MIN_V) * 100),
    0, 100);
}

// ─── String helpers ───────────────────────────────────────────────────────────
const char* stateStr(AGVState s){
  switch(s){
    case IDLE:                            return "IDLE";
    case READY:                           return "READY";
    case FOLLOW_LINE:                     return "FOLLOW_LINE";
    case DECISION_AT_INTERSECTION:        return "INTERSECTION_GO";
    case TURN_180_AT_DEST:                return "TURN_AT_DEST";
    case RETURN_TO_BASE:                  return "RETURN_TO_BASE";
    case DECISION_AT_INTERSECTION_RETURN: return "INTERSECTION_RETURN";
    case TURN_180_AT_BASE:                return "TURN_AT_BASE";
    case ARRIVED_AT_DESTINATION:          return "ARRIVED";
    case LOAD_UNLOAD:                     return "LOAD_UNLOAD";
    case MANUAL_OVERRIDE:                 return "MANUAL";
    case ERROR_STATE:                     return "ERROR";
    default:                              return "UNKNOWN";
  }
}

const char* destStr(Destination d){
  switch(d){ case DEST_A:return "A";case DEST_B:return "B";case DEST_C:return "C";default:return "BASE"; }
}

const char* modeStr(AGVMode m){
  switch(m){ case MODE_MANUAL:return "MANUAL";case MODE_PICKUP:return "PICKUP";default:return "AUTO"; }
}

const char* mlStateStr(MLState s){
  switch(s){
    case NO_OBJECT:         return "NO_OBJECT";
    case OBJECT_PRESENT:    return "OBJECT_PRESENT";
    case OBJECT_PICKED:     return "OBJECT_PICKED";
    case OBSTACLE_DETECTED: return "OBSTACLE";
    case INVALID_LOAD:      return "INVALID";
    default:                return "UNKNOWN";
  }
}

void drawOLED(const char* l1,const char* l2="",const char* l3=""){
  display.clearDisplay();
  display.setTextSize(1); display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,0);  display.println("XORA AGV");
  display.println("----------------");
  display.setCursor(0,20); display.println(l1);
  display.setCursor(0,32); display.println(l2);
  display.setCursor(0,44); display.println(l3);
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
  snprintf(buf,sizeof(buf),"%.1f",loadGrams);  mqtt.publish(TOPIC_SENSOR_LC,buf);
  snprintf(buf,sizeof(buf),"{\"s1\":%d,\"s2\":%d,\"s3\":%d,\"s4\":0,\"s5\":0}",
    irL?1:0, irM?1:0, irR?1:0);
  mqtt.publish(TOPIC_SENSOR_IR,buf);
  char batBuf[32];
  snprintf(batBuf,sizeof(batBuf),"{\"v\":%.2f,\"pct\":%d}",batteryVoltage,batteryPercent);
  mqtt.publish(TOPIC_BATTERY,batBuf);
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
    intersectionCount=0; onIntersection=false;
    tStopAtDest=0; tTurn180Start=0; tIntersectionTurn=0;
    publishState();
    publishEvent("MODE_AUTO","Switched to AUTO mode");
    drawOLED("AUTO MODE","Siap terima","perintah");
    return;
  }

  if(strcmp(cmd,"SET_MODE_MANUAL")==0){
    motorStop(); currentMode=MODE_MANUAL;
    intersectionCount=0; onIntersection=false;
    tStopAtDest=0; tTurn180Start=0; tIntersectionTurn=0;
    if(currentState==FOLLOW_LINE||currentState==RETURN_TO_BASE){
      currentState=RETURN_TO_BASE;
      publishEvent("FORCED_RETURN","Returning to base first");
    } else { currentState=MANUAL_OVERRIDE; }
    publishState(); return;
  }

  if(strcmp(cmd,"SET_MODE_PICKUP")==0){ currentMode=MODE_PICKUP; publishState(); return; }

  if(strcmp(cmd,"RETURN_BASE")==0){
    motorStop();
    intersectionCount=0; onIntersection=false;
    currentState=RETURN_TO_BASE;
    publishState(); publishEvent("CMD_RETURN","Return to base"); return;
  }

  if(strcmp(cmd,"RESET_ERROR")==0){
    motorStop(); emergencyStop=false;
    currentState=IDLE; currentDest=DEST_NONE;
    intersectionCount=0; onIntersection=false;
    tStopAtDest=0; tTurn180Start=0; tIntersectionTurn=0;
    publishState(); publishEvent("RESET","Error cleared"); return;
  }

  if(strcmp(cmd,"RESET_WIFI")==0){
    publishEvent("WIFI_RESET","Resetting WiFi...");
    drawOLED("WIFI RESET","Restart...","");
    delay(1000);
    WiFiManager wm; wm.resetSettings(); ESP.restart(); return;
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

// ─── Baca loadcell (dipanggil dari loop) ─────────────────────────────────────
// Menggunakan rata-rata 3 sampel + moving average filter.
// Hasil disimpan di loadGrams dan mlState diperbarui via predictML().
void updateLoadcell(unsigned long now){
  if(scale.is_ready()){
    float rawWeight  = scale.get_units(3);           // rata-rata 3 sampel
    float weight     = weightFilter.update(rawWeight);
    float delta      = weight - lastWeight;
    lastWeight       = weight;
    loadGrams        = max(weight, 0.0f);            // clamp agar tidak negatif
    tLastScaleReady  = now;
    scaleWarned      = false;

    mlState = predictML(weight, delta, distanceCm);

  } else if(now - tLastScaleReady > LOADCELL_TIMEOUT_MS){
    // Loadcell tidak merespons → jalankan ML dengan berat terakhir yang diketahui
    mlState = predictML(lastWeight, 0.0f, distanceCm);

    if(!scaleWarned){
      scaleWarned = true;
      publishEvent("SCALE_TIMEOUT","Loadcell not responding, using last value");
      Serial.println("[WARN] Loadcell timeout — ML pakai berat terakhir");
    }
  }
}

// ─── SETUP ────────────────────────────────────────────────────────────────────
void setup(){
  Serial.begin(115200);
  pinMode(PIN_LED,    OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(TRIG_PIN,   OUTPUT);
  pinMode(ECHO_PIN,   INPUT);
  pinMode(IR_LEFT,    INPUT);
  pinMode(IR_MID,     INPUT);
  pinMode(IR_RIGHT,   INPUT);
  pinMode(PIN_VOLTAGE,INPUT);
  analogSetAttenuation(ADC_11db);

  motorSetup();

  Wire.begin(21,22);
  if(!display.begin(SSD1306_SWITCHCAPVCC,0x3C)){
    Serial.println("[OLED] Init gagal!");
  }
  drawOLED("Booting...","","");

  // ── Inisialisasi HX711 ───────────────────────────────────────────────────
  scale.begin(HX_DT, HX_SCK);
  delay(200);

  if(scale.is_ready()){
    scale.set_scale(CALIBRATION_FACTOR);  // terapkan faktor kalibrasi
    scale.tare();                         // nol-kan timbangan
    Serial.println("[SCALE] HX711 siap, tare selesai.");
    drawOLED("SCALE OK","Tare selesai","");
  } else {
    Serial.println("[SCALE] HX711 TIDAK terdeteksi! Cek kabel DT/SCK.");
    drawOLED("SCALE ERROR","Cek kabel","HX711");
  }
  delay(1000);

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

    // ── IDLE ─────────────────────────────────────────────────────────────────
    case IDLE:
      digitalWrite(PIN_LED,LOW);
      drawOLED("IDLE","Tunggu perintah",modeStr(currentMode));
      if(mlState==OBJECT_PRESENT && currentMode==MODE_AUTO){
        currentState=READY;
      }
      break;

    // ── READY ────────────────────────────────────────────────────────────────
    case READY:
      if(currentDest==DEST_NONE){ currentState=IDLE; break; }

      if(mlState==NO_OBJECT){
        currentState=IDLE;
        publishEvent("NO_OBJECT","Object gone, back to IDLE");
        break;
      }

      intersectionCount = 0;
      onIntersection    = false;
      tLineLost         = 0;
      noObjectCount     = 0;
      tIntersectionTurn = 0;

      currentState = FOLLOW_LINE;
      digitalWrite(PIN_LED,HIGH);
      publishEvent("MOVING","AGV starting, following line");
      break;

    // ── FOLLOW_LINE ──────────────────────────────────────────────────────────
    case FOLLOW_LINE:{
      char db[32]; snprintf(db,sizeof(db),"-> %s [X:%d]",destStr(currentDest),intersectionCount);
      drawOLED("MOVING",db,"Follow line...");

      // ── Obstacle via ultrasonic + ML ─────────────────────────────────────
      if(mlState==OBSTACLE_DETECTED || distanceCm < OBSTACLE_DIST_CM){
        motorStop(); currentState=ERROR_STATE;
        publishEvent("OBSTACLE_DETECTED","Obstacle di depan!");
        beeper.start(300); break;
      }

      // ── Payload check dengan debounce ────────────────────────────────────
      if(mlState==NO_OBJECT){
        noObjectCount++;
        if(noObjectCount >= NO_OBJECT_DEBOUNCE){
          noObjectCount = 0;
          motorStop(); currentState=ERROR_STATE;
          publishEvent("NO_OBJECT","Payload lost during transit");
          beeper.start(400);
        }
        break;
      }
      noObjectCount = 0;

      // ── Deteksi pertigaan / kotak ─────────────────────────────────────────
      if(isAllSensor()){
        if(!onIntersection){
          onIntersection = true;
          intersectionCount++;
          Serial.printf("[INTERSECT] Count=%d\n", intersectionCount);

          if(intersectionCount == 1){
            motorStop();
            currentState = DECISION_AT_INTERSECTION;
            tIntersectionTurn = 0;
            publishEvent("INTERSECTION","Pertigaan ke-1, belok sesuai tujuan");
          } else {
            motorStop();
            publishEvent("ARRIVED","Arrived at destination");
            beeper.start(300);
            currentState  = TURN_180_AT_DEST;
            tStopAtDest   = 0;
            tTurn180Start = 0;
          }
        }
        break;
      } else {
        onIntersection = false;
      }

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

    // ── DECISION_AT_INTERSECTION ─────────────────────────────────────────────
    case DECISION_AT_INTERSECTION:{
      if(tIntersectionTurn==0){
        tIntersectionTurn = millis();
        switch(currentDest){
          case DEST_A:
            motorSpinLeft(SPD_SPIN);
            drawOLED("INTERSECTION","Belok KIRI","-> A");
            break;
          case DEST_B:
            motorForward(SPD_NORMAL);
            drawOLED("INTERSECTION","LURUS","-> B");
            break;
          case DEST_C:
            motorSpinRight(SPD_SPIN);
            drawOLED("INTERSECTION","Belok KANAN","-> C");
            break;
          default:
            motorForward(SPD_NORMAL);
            break;
        }
      }

      if(millis()-tIntersectionTurn >= TURN_AT_INTERSECTION_MS){
        tIntersectionTurn = 0;
        onIntersection    = false;
        currentState      = FOLLOW_LINE;
        publishEvent("TURN_DONE","Selesai belok, lanjut follow line");
      }
      break;
    }

    // ── TURN_180_AT_DEST ─────────────────────────────────────────────────────
    case TURN_180_AT_DEST:
      if(tStopAtDest==0){
        tStopAtDest=millis();
        motorStop();
        drawOLED("ARRIVED",destStr(currentDest),"Tunggu unload...");
      }

      if(mlState==OBJECT_PICKED){
        drawOLED("ARRIVED",destStr(currentDest),"Objek diambil!");
        tStopAtDest = millis() - STOP_AT_DEST_MS;
        publishEvent("OBJECT_PICKED","Payload taken, skip wait");
      }

      if(millis()-tStopAtDest < STOP_AT_DEST_MS) break;

      if(tTurn180Start==0){
        tTurn180Start=millis();
        drawOLED("ARRIVED",destStr(currentDest),"Putar balik...");
      }
      motorSpinRight(SPD_SPIN);
      if(millis()-tTurn180Start>=TURN_180_MS){
        motorStop();
        tStopAtDest   = 0;
        tTurn180Start = 0;
        intersectionCount = 0;
        onIntersection    = false;
        tIntersectionTurn = 0;
        tLineLost         = 0;
        currentState      = RETURN_TO_BASE;
        publishEvent("RETURNING","Returning to base");
      }
      break;

    // ── RETURN_TO_BASE ───────────────────────────────────────────────────────
    case RETURN_TO_BASE:{
      char db[32]; snprintf(db,sizeof(db),"-> BASE [X:%d]",intersectionCount);
      drawOLED("RETURNING",db,"Follow line...");

      if(mlState==OBSTACLE_DETECTED || distanceCm < OBSTACLE_DIST_CM){
        motorStop(); currentState=ERROR_STATE;
        publishEvent("OBSTACLE_DETECTED","Stop on return");
        beeper.start(300); break;
      }

      if(isAllSensor()){
        if(!onIntersection){
          onIntersection = true;
          intersectionCount++;
          Serial.printf("[INTERSECT RETURN] Count=%d\n", intersectionCount);

          if(intersectionCount == 1){
            motorStop();
            currentState      = DECISION_AT_INTERSECTION_RETURN;
            tIntersectionTurn = 0;
            publishEvent("INTERSECTION_RETURN","Pertigaan ke-1 pulang, belok reverse");
          } else {
            motorStop();
            publishEvent("AT_BASE","Arrived at base");
            beeper.start(200);
            currentState  = TURN_180_AT_BASE;
            tTurn180Start = 0;
          }
        }
        break;
      } else {
        onIntersection = false;
      }

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

    // ── DECISION_AT_INTERSECTION_RETURN ──────────────────────────────────────
    case DECISION_AT_INTERSECTION_RETURN:{
      if(tIntersectionTurn==0){
        tIntersectionTurn = millis();
        switch(currentDest){
          case DEST_A:
            motorSpinRight(SPD_SPIN);
            drawOLED("RETURN X","Belok KANAN","-> BASE");
            break;
          case DEST_B:
            motorForward(SPD_NORMAL);
            drawOLED("RETURN X","LURUS","-> BASE");
            break;
          case DEST_C:
            motorSpinLeft(SPD_SPIN);
            drawOLED("RETURN X","Belok KIRI","-> BASE");
            break;
          default:
            motorForward(SPD_NORMAL);
            break;
        }
      }

      if(millis()-tIntersectionTurn >= TURN_AT_INTERSECTION_MS){
        tIntersectionTurn = 0;
        onIntersection    = false;
        currentState      = RETURN_TO_BASE;
        publishEvent("TURN_RETURN_DONE","Selesai belok, menuju base");
      }
      break;
    }

    // ── TURN_180_AT_BASE ─────────────────────────────────────────────────────
    case TURN_180_AT_BASE:
      if(tTurn180Start==0){
        tTurn180Start=millis();
        drawOLED("AT BASE","Putar balik...","Siap berangkat");
      }
      motorSpinRight(SPD_SPIN);
      if(millis()-tTurn180Start>=TURN_180_MS){
        motorStop();
        tTurn180Start     = 0;
        intersectionCount = 0;
        onIntersection    = false;
        currentState      = IDLE;
        currentDest       = DEST_NONE;
        digitalWrite(PIN_LED,LOW);
        publishEvent("RETURNED","AGV ready at base");
        beeper.start(150);
      }
      break;

    // ── MANUAL_OVERRIDE ──────────────────────────────────────────────────────
    case MANUAL_OVERRIDE:
      drawOLED("MANUAL","Mode manual","WASD/Dashboard");
      break;

    // ── ERROR_STATE ──────────────────────────────────────────────────────────
    case ERROR_STATE:
      digitalWrite(PIN_LED,LOW); motorStop();
      drawOLED("!! ERROR !!","Dashboard:","Reset Error");
      break;

    default: currentState=IDLE; break;
  }
}

// ─── LOOP ─────────────────────────────────────────────────────────────────────
void loop(){
  unsigned long now = millis();

  // ── WiFi & MQTT ────────────────────────────────────────────────────────────
  if(WiFi.status()==WL_CONNECTED){
    if(!mqtt.connected()) mqttConnect();
    mqtt.loop();
  }

  beeper.tick();

  // ── Baca sensor ────────────────────────────────────────────────────────────
  distanceCm = readDistance();
  readIR();
  readBattery();

  // ── Loadcell + TinyML (hanya di luar mode manual) ─────────────────────────
  if(currentMode != MODE_MANUAL){
    updateLoadcell(now);
  }

  // ── State machine ──────────────────────────────────────────────────────────
  runStateMachine();

  // ── Publish perubahan state ────────────────────────────────────────────────
  if(currentState != prevState){
    publishState();
    Serial.printf("[STATE] %s -> %s | Dest:%s | Mode:%s | ML:%s | Berat:%.1fg | Jarak:%.1fcm | X:%d\n",
      stateStr(prevState), stateStr(currentState),
      destStr(currentDest), modeStr(currentMode),
      mlStateStr(mlState), loadGrams, distanceCm,
      intersectionCount);
    prevState = currentState;
  }

  // ── Publish sensor berkala ────────────────────────────────────────────────
  if(now - tLastSensorPublish >= SENSOR_INTERVAL){
    tLastSensorPublish = now;
    if(mqtt.connected()){
      publishSensors();
      mqtt.publish(TOPIC_ML_STATE, mlStateStr(mlState));
    }
  }
}
