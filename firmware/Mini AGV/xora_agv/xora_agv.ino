// ============================================================
//  XORA Mini AGV — Firmware v0.4
//  ESP32 + MQTT + State Machine
//  Motor: lihat motor_control.ino (TB6612FNG)
// ============================================================

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "HX711.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ─── WiFi ─────────────────────────────────────────────────────────────────────
const char* WIFI_SSID     = "KOSTAN BUK NIE";
const char* WIFI_PASSWORD = "OMAHAPIK4B";
const char* MQTT_BROKER   = "192.168.1.34";

// ─── MQTT ─────────────────────────────────────────────────────────────────────
const int   MQTT_PORT      = 1883;
const char* MQTT_CLIENT_ID = "xora-agv-001";

#define TOPIC_STATE       "xora/state"
#define TOPIC_DESTINATION "xora/destination"
#define TOPIC_MODE        "xora/mode"
#define TOPIC_SENSOR_US   "xora/sensor/ultrasonic"
#define TOPIC_SENSOR_LC   "xora/sensor/loadcell"
#define TOPIC_SENSOR_IR   "xora/sensor/ir"
#define TOPIC_EVENT       "xora/event"
#define TOPIC_BATTERY     "xora/battery"
#define TOPIC_COMMAND     "xora/command"
#define TOPIC_MANUAL_CMD  "xora/manual"

// ─── OLED ─────────────────────────────────────────────────────────────────────
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT  64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// ─── Kecepatan Motor (harus di sini agar tersedia sebelum motor_control.ino) ──
#define MOTOR_SPEED_DEFAULT  180
#define MOTOR_SPEED_TURN     130

// ─── PIN Umum ─────────────────────────────────────────────────────────────────
// Tidak ada LED di hardware
#define PIN_BUZZER  15
#define PIN_BUTTON  16
#define TRIG_PIN     5
#define ECHO_PIN    18
#define HX_DT       32
#define HX_SCK      33

// ─── Hardware ─────────────────────────────────────────────────────────────────
HX711        scale;
WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

// ─── State Machine ────────────────────────────────────────────────────────────
enum AGVState {
  IDLE,
  READY,
  FOLLOW_LINE,
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
AGVState    prevState     = (AGVState)-1;

// ─── Runtime vars ─────────────────────────────────────────────────────────────
bool  objectDetected  = true;
bool  buttonPressed   = false;
bool  emergencyStop   = false;
float distanceCm      = 0;
float loadGrams       = 0;

// ─── Timing ───────────────────────────────────────────────────────────────────
unsigned long tLastSensorPublish = 0;
unsigned long tLastMqttReconnect = 0;
unsigned long tButtonDebounce    = 0;
unsigned long tArrivedAt         = 0;

const unsigned long SENSOR_INTERVAL = 500;
const unsigned long MQTT_RETRY_MS   = 3000;

// ─── Forward declarations (fungsi dari motor_control.ino & lokal) ─────────────
void motorSetup();
void motorForward(int speed);
void motorBackward(int speed);
void motorTurnLeft(int speed);
void motorTurnRight(int speed);
void motorStop();
void handleManualCommand(const char* cmd);
void drawOLED(const char* line1, const char* line2, const char* line3);

// ─── Beeper non-blocking ─────────────────────────────────────────────────────
struct Beeper {
  bool          active   = false;
  unsigned long onAt     = 0;
  int           duration = 0;

  void start(int ms) {
    digitalWrite(PIN_BUZZER, HIGH);
    active   = true;
    onAt     = millis();
    duration = ms;
  }

  void tick() {
    if (active && millis() - onAt >= (unsigned long)duration) {
      digitalWrite(PIN_BUZZER, LOW);
      active = false;
    }
  }
} beeper;

// ─── Helper: ultrasonic ───────────────────────────────────────────────────────
float readDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long dur = pulseIn(ECHO_PIN, HIGH, 25000);
  return dur * 0.034f / 2.0f;
}

// ─── Helper: string converters ────────────────────────────────────────────────
const char* stateStr(AGVState s) {
  switch (s) {
    case IDLE:                      return "IDLE";
    case READY:                     return "READY";
    case FOLLOW_LINE:               return "FOLLOW_LINE";
    case DECISION_AT_INTERSECTION:  return "DECISION_AT_INTERSECTION";
    case ARRIVED_AT_DESTINATION:    return "ARRIVED_AT_DESTINATION";
    case LOAD_UNLOAD:               return "LOAD_UNLOAD";
    case RETURN_TO_BASE:            return "RETURN_TO_BASE";
    case MANUAL_OVERRIDE:           return "MANUAL_OVERRIDE";
    case ERROR_STATE:               return "ERROR_STATE";
    default:                        return "UNKNOWN";
  }
}

const char* destStr(Destination d) {
  switch (d) {
    case DEST_A: return "A";
    case DEST_B: return "B";
    case DEST_C: return "C";
    default:     return "BASE";
  }
}

const char* modeStr(AGVMode m) {
  switch (m) {
    case MODE_AUTO:   return "AUTO";
    case MODE_MANUAL: return "MANUAL";
    case MODE_PICKUP: return "PICKUP";
    default:          return "AUTO";
  }
}

// ─── OLED ─────────────────────────────────────────────────────────────────────
void drawOLED(const char* line1, const char* line2 = "", const char* line3 = "") {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);  display.println("XORA AGV");
  display.println("----------------");
  display.setCursor(0, 20); display.println(line1);
  display.setCursor(0, 32); display.println(line2);
  display.setCursor(0, 44); display.println(line3);
  display.display();
}

// ─── MQTT publish ─────────────────────────────────────────────────────────────
void publishState() {
  mqtt.publish(TOPIC_STATE,       stateStr(currentState), true);
  mqtt.publish(TOPIC_DESTINATION, destStr(currentDest),   true);
  mqtt.publish(TOPIC_MODE,        modeStr(currentMode),   true);
}

void publishSensors() {
  char buf[32];
  snprintf(buf, sizeof(buf), "%.1f", distanceCm);
  mqtt.publish(TOPIC_SENSOR_US, buf);
  snprintf(buf, sizeof(buf), "%.0f", loadGrams);
  mqtt.publish(TOPIC_SENSOR_LC, buf);
  mqtt.publish(TOPIC_SENSOR_IR,
    objectDetected ? "{\"s1\":0,\"s2\":0,\"s3\":1,\"s4\":0,\"s5\":0}"
                   : "{\"s1\":0,\"s2\":0,\"s3\":0,\"s4\":0,\"s5\":0}");
}

void publishEvent(const char* code, const char* message) {
  StaticJsonDocument<200> doc;
  doc["code"]    = code;
  doc["message"] = message;
  doc["ts"]      = millis();
  char buf[200];
  serializeJson(doc, buf);
  mqtt.publish(TOPIC_EVENT, buf);
  Serial.printf("[EVENT] %s: %s\n", code, message);
}

// ─── MQTT callback ────────────────────────────────────────────────────────────
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  char msg[256];
  length = min(length, (unsigned int)255);
  memcpy(msg, payload, length);
  msg[length] = '\0';
  Serial.printf("[MQTT IN] %s: %s\n", topic, msg);

  // ── Manual direction command ──
  if (strcmp(topic, TOPIC_MANUAL_CMD) == 0) {
    handleManualCommand(msg);
    // Update OLED setelah motor command
    if      (strcmp(msg, "FORWARD")  == 0) drawOLED("MANUAL", "MAJU",     "");
    else if (strcmp(msg, "BACKWARD") == 0) drawOLED("MANUAL", "MUNDUR",   "");
    else if (strcmp(msg, "LEFT")     == 0) drawOLED("MANUAL", "KIRI",     "");
    else if (strcmp(msg, "RIGHT")    == 0) drawOLED("MANUAL", "KANAN",    "");
    else if (strcmp(msg, "STOP")     == 0) drawOLED("MANUAL", "BERHENTI", "");
    return;
  }

  if (strcmp(topic, TOPIC_COMMAND) != 0) return;

  StaticJsonDocument<128> doc;
  if (deserializeJson(doc, msg) != DeserializationError::Ok) return;
  const char* cmd = doc["command"];
  if (!cmd) return;

  if (strcmp(cmd, "EMERGENCY_STOP") == 0) {
    emergencyStop = true;
    currentState  = ERROR_STATE;
    motorStop();
    publishEvent("ESTOP", "Emergency stop from dashboard");
    beeper.start(800);
    return;
  }

  if (strcmp(cmd, "SET_MODE_AUTO") == 0) {
    currentMode = MODE_AUTO;
    publishState();
    return;
  }

  if (strcmp(cmd, "SET_MODE_MANUAL") == 0) {
    currentMode = MODE_MANUAL;
    if (currentState == FOLLOW_LINE || currentState == ARRIVED_AT_DESTINATION) {
      motorStop();
      currentState = RETURN_TO_BASE;
      publishEvent("FORCED_RETURN", "Mode manual: AGV returning to base first");
    } else {
      motorStop();
      currentState = MANUAL_OVERRIDE;
    }
    publishState();
    return;
  }

  if (strcmp(cmd, "SET_MODE_PICKUP") == 0) {
    currentMode = MODE_PICKUP;
    publishState();
    return;
  }

  if (strcmp(cmd, "RETURN_BASE") == 0) {
    currentState = RETURN_TO_BASE;
    publishState();
    publishEvent("CMD_RETURN", "Return to base commanded");
    return;
  }

  if (currentState == IDLE || currentState == READY) {
    if (strcmp(cmd, "SET_DEST_A") == 0) {
      currentDest  = DEST_A; currentState = READY;
      beeper.start(100); publishState();
      publishEvent("DEST_SET", "Destination set to A");
    } else if (strcmp(cmd, "SET_DEST_B") == 0) {
      currentDest  = DEST_B; currentState = READY;
      beeper.start(100); publishState();
      publishEvent("DEST_SET", "Destination set to B");
    } else if (strcmp(cmd, "SET_DEST_C") == 0) {
      currentDest  = DEST_C; currentState = READY;
      beeper.start(100); publishState();
      publishEvent("DEST_SET", "Destination set to C");
    }
  } else {
    publishEvent("INVALID_CMD", "Command ignored: AGV not idle");
  }
}

// ─── MQTT connect ─────────────────────────────────────────────────────────────
void mqttConnect() {
  if (mqtt.connected()) return;
  unsigned long now = millis();
  if (now - tLastMqttReconnect < MQTT_RETRY_MS) return;
  tLastMqttReconnect = now;

  Serial.printf("[MQTT] Connecting to %s...\n", MQTT_BROKER);
  if (mqtt.connect(MQTT_CLIENT_ID)) {
    Serial.println("[MQTT] Connected!");
    mqtt.subscribe(TOPIC_COMMAND);
    mqtt.subscribe(TOPIC_MANUAL_CMD);
    publishState();
    publishEvent("ONLINE", "Xora AGV online");
  } else {
    Serial.printf("[MQTT] Failed, rc=%d, retry in %lums\n", mqtt.state(), MQTT_RETRY_MS);
  }
}

// ─── WiFi ─────────────────────────────────────────────────────────────────────
void wifiConnect() {
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    delay(500); Serial.print("."); tries++; yield();
  }
  if (WiFi.status() == WL_CONNECTED)
    Serial.printf("\n[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  else
    Serial.println("\n[WiFi] Failed — check SSID/password");
}

// ─── SETUP ────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  motorSetup();

  
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(TRIG_PIN,   OUTPUT);
  pinMode(ECHO_PIN,   INPUT);

  delay(2000);
  Wire.begin(21, 22);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  drawOLED("Booting...", "", "");

  scale.begin(HX_DT, HX_SCK);
  scale.set_scale();
  scale.tare();

  wifiConnect();
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqttConnect();

  drawOLED("IDLE", "Dest: --", modeStr(currentMode));
  beeper.start(150);
  Serial.println("[XORA] System ready.");
}

// ─── STATE MACHINE ────────────────────────────────────────────────────────────
void runStateMachine() {

  if (emergencyStop && currentState != ERROR_STATE) {
    motorStop();
    currentState  = ERROR_STATE;
    emergencyStop = false;
  }

  switch (currentState) {

    case IDLE:
      motorStop();
      
      drawOLED("IDLE", "Tunggu perintah", modeStr(currentMode));
      if (buttonPressed && currentDest != DEST_NONE) {
        currentState = READY;
        beeper.start(100);
      }
      break;

    case READY: {
      char destBuf[20];
      snprintf(destBuf, sizeof(destBuf), "Tujuan: %s", destStr(currentDest));
      drawOLED("READY", destBuf, "Cek barang...");
      if (currentDest == DEST_NONE) {
        currentState = IDLE;
        publishEvent("INVALID_DEST", "No destination set");
        break;
      }
      if (!objectDetected) {
        currentState = ERROR_STATE;
        drawOLED("ERROR", "NO OBJECT", "Taruh barang!");
        publishEvent("NO_OBJECT", "Object not detected before moving");
        beeper.start(400);
      } else {
        currentState = FOLLOW_LINE;
        
        publishEvent("MOVING", "AGV starting to follow line");
      }
      break;
    }

    case FOLLOW_LINE: {
      char destBuf[20];
      snprintf(destBuf, sizeof(destBuf), "-> %s", destStr(currentDest));
      drawOLED("MOVING", destBuf, "Follow line...");
      motorForward(MOTOR_SPEED_DEFAULT);

      static unsigned long tStart = 0;
      if (tStart == 0) tStart = millis();
      if (millis() - tStart > 3000) {
        tStart = 0; motorStop();
        currentState = ARRIVED_AT_DESTINATION;
        publishEvent("ARRIVED", "AGV arrived at destination");
        beeper.start(200);
        break;
      }
      if (distanceCm > 0 && distanceCm < 10) {
        tStart = 0; motorStop();
        currentState = ERROR_STATE;
        publishEvent("OBSTACLE_DETECTED", "Object too close, stopping");
        beeper.start(300);
        break;
      }
      if (distanceCm > 0 && distanceCm < 20) {
        tStart = 0; motorStop();
        currentState = ARRIVED_AT_DESTINATION;
        publishEvent("ARRIVED", "AGV arrived at destination");
        beeper.start(200);
      }
      break;
    }

    case ARRIVED_AT_DESTINATION:
      motorStop();
      drawOLED("ARRIVED", destStr(currentDest), "Ambil barang...");
      if (tArrivedAt == 0) tArrivedAt = millis();
      if (millis() - tArrivedAt > 3000) objectDetected = false;
      if (!objectDetected) {
        publishEvent("UNLOADED", "Cargo picked up by operator");
        currentState = RETURN_TO_BASE;
        tArrivedAt   = 0;
        beeper.start(150);
      }
      break;

    case RETURN_TO_BASE:
      drawOLED("RETURNING", "-> BASE", "");
      motorBackward(MOTOR_SPEED_DEFAULT);
      {
        static unsigned long tReturn = 0;
        if (tReturn == 0) tReturn = millis();
        if (millis() - tReturn > 2000) {
          tReturn = 0; motorStop();
          currentState = IDLE;
          currentDest  = DEST_NONE;
          
          publishEvent("RETURNED", "AGV back at base");
        }
      }
      break;

    case MANUAL_OVERRIDE:
      drawOLED("MANUAL", "Mode manual", "Kontrol fisik");
      if (buttonPressed) {
        motorStop();
        currentMode  = MODE_AUTO;
        currentState = IDLE;
        publishState();
      }
      break;

    case ERROR_STATE:
      motorStop();
      
      drawOLED("!! ERROR !!", "Tekan tombol", "untuk reset");
      if (buttonPressed) {
        emergencyStop = false;
        currentState  = IDLE;
        currentDest   = DEST_NONE;
        publishEvent("RESET", "Error cleared by operator");
      }
      break;

    default:
      motorStop();
      currentState = IDLE;
      break;
  }
}

// ─── LOOP ─────────────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  if (WiFi.status() == WL_CONNECTED) {
    if (!mqtt.connected()) mqttConnect();
    mqtt.loop();
  }

  beeper.tick();

  if (now - tButtonDebounce > 50) {
    buttonPressed   = digitalRead(PIN_BUTTON) == LOW;
    tButtonDebounce = now;
  }

  distanceCm = readDistance();
  if (scale.is_ready()) {
    loadGrams      = scale.get_units(1);
    objectDetected = loadGrams > 10;
  }

  runStateMachine();

  if (currentState != prevState) {
    publishState();
    Serial.printf("[STATE] %s -> %s | Dest: %s\n",
      stateStr(prevState), stateStr(currentState), destStr(currentDest));
    prevState = currentState;
  }

  if (now - tLastSensorPublish >= SENSOR_INTERVAL) {
    tLastSensorPublish = now;
    if (mqtt.connected()) publishSensors();
  }
}
