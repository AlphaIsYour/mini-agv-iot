// ================================================
// XORA AGV — Mission-Based Firmware
// ESP32 + L298N + MQTT + OLED + Ultrasonic + Servo
// ================================================

// ================= PIN MOTOR (L298N) =================
#define ENA 25
#define IN1 26
#define IN2 27
#define ENB 14
#define IN3 12
#define IN4 13

// ================= PIN SENSOR GARIS =================
#define S_KIRI   35
#define S_TENGAH 34
#define S_KANAN  33
#define IR_KIRI  23
#define IR_KANAN 32

// ================= PIN MODUL =================
#define SERVO_PIN  4
#define BUZZER_PIN 2
#define TRIG_PIN   18
#define ECHO_PIN   19
#define OLED_SDA   21
#define OLED_SCL   22

// ================= LIBRARY =================
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>

// ================= WIFI & MQTT =================
const char* WIFI_SSID     = "KOSTAN BUK NIE";
const char* WIFI_PASSWORD = "OMAHAPIK4B";

const char* MQTT_HOST     = "broker.hivemq.com";
const uint16_t MQTT_PORT  = 1883;
const char* MQTT_USER     = "";
const char* MQTT_PASSWORD = "";
const char* DEVICE_ID     = "agv-01";

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
String mqttTopicCmd;
String mqttTopicState;
String mqttTopicTelemetry;
String mqttTopicStatus;
unsigned long wifiReconnectTimer = 0;
unsigned long mqttReconnectTimer = 0;

// ================= OLED =================
#define OLED_WIDTH  128
#define OLED_HEIGHT 64
Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);

// ================= SERVO =================
Servo servoScan;
#define SERVO_DEPAN 90
#define SERVO_KANAN 0
#define SERVO_KIRI  180

// ================= PARAMETER PWM =================
const int PWM_FREQ = 1000;
const int PWM_RES  = 8;

// ================= PARAMETER KONTROL =================
int baseSpeed = 120;
int maxSpeed  = 200;
int speedMin  = 0;  

float Kp = 80.0;
float Kd = 25.0;

float lastError  = 0;
int lastLineSide = 0;

// ================= MISSION STATE =================
enum MissionState {
  IDLE,
  KEBERANGKATAN,
  SAMPAI,
  PULANG,
  SELESAI
};

MissionState missionState = IDLE;
int missionTarget    = 0;   // 0=none, 1=A, 2=B, 3=C
int blackboxCount    = 0;
int turnDirection    = 0;   // -1=left, 1=right
bool waitingAtDest   = false;
unsigned long arrivedTimer = 0;
const unsigned long WAIT_AT_DEST_MS = 3000;

// ================= BLACKBOX & FOLLOW LINE =================
bool blackboxArmed = false;
bool newBlackboxDetected = false;
unsigned long stateTimer = 0;
const int KELUAR_BOX_MS  = 500;

// ================= OBSTACLE =================
#define JARAK_HALANGAN_CM 25
#define AVOID_STEP_MS     600

unsigned long jarakTimer   = 0;
long jarakTerakhir         = 999;
unsigned long durasiEchoTerakhir = 0;
unsigned long telemetryTimer = 0;
const unsigned long TELEMETRY_INTERVAL_MS = 200;

int motorKiriTerakhir  = 0;
int motorKananTerakhir = 0;

// ================= FORWARD DECLARATION =================
void followLine(int vL, int vM, int vR, int irL, int irR);
void majuLurus(int spd);
void setMotors(int leftPWM, int rightPWM);
void stopMotor();
void putarKanan(int spd);
void putarKiri(int spd);
long bacaJarak();
void servoKe(int sudut, int tunda);
void scanDanHindari();
void oledTulis(String b1, String b2, String b3);
void buzzerBeep(int durasi);
void kirimState();
void kirimTelemetry(int vL, int vM, int vR, int irL, int irR, bool blackbox);
void setupJaringan();
void jagaJaringan();
void reconnectMqtt();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void prosesPerintah(String input);
const char* namaState(MissionState s);
void mulaiMisi(int target);
void mulaiPulang();
void hitungBlackbox(bool blackbox);
bool stateCekHalangan();

// ================================================
void setup() {
  Serial.begin(115200);
  setupJaringan();

  // Servo DULU sebelum ledcAttach
  servoScan.setPeriodHertz(50);
  servoScan.attach(SERVO_PIN, 500, 2400);
  delay(100);
  servoScan.write(SERVO_DEPAN);
  delay(1500);

  // Motor
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  ledcAttach(ENA, PWM_FREQ, PWM_RES);
  ledcAttach(ENB, PWM_FREQ, PWM_RES);

  // Sensor garis
  pinMode(S_KIRI,   INPUT);
  pinMode(S_TENGAH, INPUT);
  pinMode(S_KANAN,  INPUT);
  pinMode(IR_KIRI,  INPUT);
  pinMode(IR_KANAN, INPUT);

  // Ultrasonik
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  // Buzzer
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // OLED
  Wire.begin(OLED_SDA, OLED_SCL);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.display();

  stopMotor();
  oledTulis("SIAP", "Menunggu", "misi...");
  buzzerBeep(200);

  delay(2000);
  oledTulis("IDLE", "Siap terima", "perintah");
  kirimState();
}

// ================================================
void loop() {
  jagaJaringan();

  // ===== LIVE TUNING via Serial =====
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    prosesPerintah(input);
  }

  // ===== BACA SENSOR GARIS =====
  int vL  = digitalRead(S_KIRI);
  int vM  = digitalRead(S_TENGAH);
  int vR  = digitalRead(S_KANAN);
  int irL = digitalRead(IR_KIRI);
  int irR = digitalRead(IR_KANAN);

  bool blackbox = (vL == 1 && vM == 1 && vR == 1 && irL == 1 && irR == 1);

  // ===== CEK HALANGAN (saat bergerak) =====
  if (stateCekHalangan()) {
    if (millis() - jarakTimer >= 100) {
      jarakTimer     = millis();
      jarakTerakhir  = bacaJarak();
    }
    if (jarakTerakhir > 0 && jarakTerakhir <= JARAK_HALANGAN_CM) {
      stopMotor();
      buzzerBeep(300);
      oledTulis("HALANGAN!", String(jarakTerakhir) + " cm", "Scan...");
      jarakTerakhir = 999;
      scanDanHindari();
      kirimState();
    }
  }

  // ===== DEBUG =====
  Serial.print("STATE="); Serial.print(namaState(missionState));
  Serial.print(" MISSION="); Serial.print(missionTarget);
  Serial.print(" BB="); Serial.print(blackboxCount);
  Serial.print(" | S: ");
  Serial.print(irL); Serial.print(" ");
  Serial.print(vL);  Serial.print(" ");
  Serial.print(vM);  Serial.print(" ");
  Serial.print(vR);  Serial.print(" ");
  Serial.println(irR);

  // ===== STATE MACHINE =====
  switch (missionState) {

    // ===== IDLE =====
    case IDLE:
      stopMotor();
      break;

    // ===== KEBERANGKATAN =====
    case KEBERANGKATAN:
      // Hitung blackbox yang dilewati
      hitungBlackbox(blackbox);

      // Sampai di target? (newBlackboxDetected = baru saja hit blackbox)
      if (newBlackboxDetected && blackboxCount == missionTarget) {
        stopMotor();
        buzzerBeep(200);
        missionState   = SAMPAI;
        waitingAtDest  = true;
        arrivedTimer   = millis();
        oledTulis("SAMPAI!", "Tujuan " + String(missionTarget), "Tunggu 3dtk");
        kirimState();
        Serial.print("SAMPAI di titik ");
        Serial.println(missionTarget);
        break;
      }

      followLine(vL, vM, vR, irL, irR);
      break;

    // ===== SAMPAI =====
    case SAMPAI:
      stopMotor();
      if (waitingAtDest && (millis() - arrivedTimer >= WAIT_AT_DEST_MS)) {
        waitingAtDest = false;
        oledTulis("PULANG", "Otomatis...", "");
        Serial.println("Auto pulang setelah 3 detik");
        mulaiPulang();
      }
      break;

    // ===== PULANG =====
    case PULANG:
      hitungBlackbox(blackbox);

      // Sampai di base? (blackbox pertama = base)
      if (newBlackboxDetected && blackboxCount >= 1) {
        stopMotor();
        buzzerBeep(200);
        missionState = SELESAI;
        oledTulis("PULANG!", "Sampai base", ":)");
        kirimState();
        Serial.println("SAMPAI BASE!");
        break;
      }

      followLine(vL, vM, vR, irL, irR);
      break;

    // ===== SELESAI =====
    case SELESAI:
      stopMotor();
      break;
  }

  // ===== KIRIM TELEMETRY =====
  if (millis() - telemetryTimer >= TELEMETRY_INTERVAL_MS) {
    telemetryTimer = millis();
    kirimTelemetry(vL, vM, vR, irL, irR, blackbox);
  }

  delay(5);
}

// ================= MISSION CONTROL =================
void mulaiMisi(int target) {
  missionTarget    = target;
  blackboxCount    = 0;
  blackboxArmed    = false;
  newBlackboxDetected = false;
  lastError        = 0;
  lastLineSide     = 0;
  waitingAtDest    = false;
  // A=left, B=right, C=left
  turnDirection    = (target == 2) ? 1 : -1;

  missionState     = KEBERANGKATAN;
  stateTimer       = millis();

  String nama = (target == 1) ? "A" : (target == 2) ? "B" : "C";
  oledTulis("MISI", "Ke titik " + nama, "Berangkat!");
  kirimState();

  Serial.print("MISI DIMULAI → Titik ");
  Serial.println(nama);
}

void mulaiPulang() {
  blackboxCount    = 0;
  blackboxArmed    = false;
  newBlackboxDetected = false;
  lastError        = 0;
  lastLineSide     = 0;

  // Langsung belok 90° sesuai arah (tanpa maju dulu)
  oledTulis("BELOK", (turnDirection == 1) ? "Kanan 90" : "Kiri 90", "");
  if (turnDirection == 1) {
    putarKanan(210);
  } else {
    putarKiri(210);
  }
  delay(1000);
  stopMotor();
  delay(200);

  missionState = PULANG;
  kirimState();
  oledTulis("PULANG", "Ke base...", "");
  Serial.println("PULANG ke base");
}

// ================= BLACKBOX COUNTER =================
void hitungBlackbox(bool blackbox) {
  newBlackboxDetected = false;
  if (!blackboxArmed && !blackbox) {
    blackboxArmed = true;
  }
  if (blackboxArmed && blackbox) {
    blackboxCount++;
    blackboxArmed = false;
    newBlackboxDetected = true;
    Serial.print("BLACKBOX #");
    Serial.println(blackboxCount);
    delay(300);  // debounce
  }
}

// ================= FOLLOW LINE PID =================
void followLine(int vL, int vM, int vR, int irL, int irR) {
  int sum = vL + vM + vR;
  float error = 0;

  if (sum > 0) {
    error = ((-1.0*vL) + (0.0*vM) + (1.0*vR)) / sum;
    if (error < 0) lastLineSide = -1;
    else if (error > 0) lastLineSide = 1;
  } else if (irL == 1) {
    lastLineSide = -1;
    error = -1.5;
  } else if (irR == 1) {
    lastLineSide = 1;
    error = 1.5;
  } else {
    if (lastLineSide == 0) error = 0;
    else error = (lastLineSide == -1) ? -1.5 : 1.5;
  }

  float derivative = error - lastError;
  float correction = (Kp * error) + (Kd * derivative);

  int leftSpeed  = constrain(baseSpeed + (int)correction, -maxSpeed, maxSpeed);
  int rightSpeed = constrain(baseSpeed - (int)correction, -maxSpeed, maxSpeed);

  if (leftSpeed  > 0 && leftSpeed  < speedMin) leftSpeed  = speedMin;
  if (rightSpeed > 0 && rightSpeed < speedMin) rightSpeed = speedMin;

  setMotors(leftSpeed, rightSpeed);
  lastError = error;
}

// ================= SCAN & HINDARI =================
void scanDanHindari() {
  servoKe(SERVO_KANAN, 500);
  long jarakKanan = bacaJarak();
  oledTulis("SCAN KANAN", String(jarakKanan) + " cm", "");
  delay(300);

  servoKe(SERVO_KIRI, 500);
  long jarakKiri = bacaJarak();
  oledTulis("SCAN KIRI", String(jarakKiri) + " cm", "");
  delay(300);

  servoKe(SERVO_DEPAN, 400);
  oledTulis("HINDARI", "KN:" + String(jarakKanan), "KI:" + String(jarakKiri));
  buzzerBeep(100);

  // Geser kanan
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);  digitalWrite(IN4, HIGH);
  ledcWrite(ENA, 130);
  ledcWrite(ENB, 130);
  motorKiriTerakhir  = 130;
  motorKananTerakhir = -130;
  delay(AVOID_STEP_MS);
  stopMotor();
  delay(150);

  // Maju lewati halangan
  majuLurus(baseSpeed);
  delay(400);
  stopMotor();
  delay(150);

  // Geser kiri balik ke jalur
  digitalWrite(IN1, LOW);  digitalWrite(IN2, HIGH);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  ledcWrite(ENA, 130);
  ledcWrite(ENB, 130);
  motorKiriTerakhir  = -130;
  motorKananTerakhir = 130;
  delay(AVOID_STEP_MS);
  stopMotor();
  delay(150);

  servoKe(SERVO_DEPAN, 500);
  oledTulis("LANJUT", "Follow line...", "");
}

// ================= ULTRASONIK =================
long bacaJarak() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long durasi = pulseIn(ECHO_PIN, HIGH, 25000);
  durasiEchoTerakhir = durasi;
  if (durasi == 0) return 999;
  return durasi * 0.034 / 2;
}

// ================= SERVO =================
void servoKe(int sudut, int tunda) {
  servoScan.write(sudut);
  if (tunda > 0) delay(tunda);
}

// ================= OLED =================
void oledTulis(String b1, String b2, String b3) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(0, 0);
  display.println(b1);
  display.setTextSize(1);
  display.setCursor(0, 22);
  display.println(b2);
  display.setCursor(0, 34);
  display.println(b3);
  display.display();
}

// ================= BUZZER =================
void buzzerBeep(int durasi) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(durasi);
  digitalWrite(BUZZER_PIN, LOW);
}

// ================= WIFI & MQTT =================
void setupJaringan() {
  mqttTopicCmd       = String("agv/") + DEVICE_ID + "/cmd";
  mqttTopicState     = String("agv/") + DEVICE_ID + "/state";
  mqttTopicTelemetry = String("agv/") + DEVICE_ID + "/telemetry";
  mqttTopicStatus    = String("agv/") + DEVICE_ID + "/status";

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(768);
}

void jagaJaringan() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - wifiReconnectTimer >= 10000) {
      wifiReconnectTimer = millis();
      WiFi.reconnect();
    }
    return;
  }

  if (!mqttClient.connected() && millis() - mqttReconnectTimer >= 5000) {
    mqttReconnectTimer = millis();
    reconnectMqtt();
  }

  if (mqttClient.connected()) {
    mqttClient.loop();
  }
}

void reconnectMqtt() {
  String clientId = String(DEVICE_ID) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  String offlinePayload = String("{\"device_id\":\"") + DEVICE_ID + "\",\"online\":false}";

  bool connected = false;
  if (strlen(MQTT_USER) > 0) {
    connected = mqttClient.connect(
      clientId.c_str(), MQTT_USER, MQTT_PASSWORD,
      mqttTopicStatus.c_str(), 0, true, offlinePayload.c_str()
    );
  } else {
    connected = mqttClient.connect(
      clientId.c_str(),
      mqttTopicStatus.c_str(), 0, true, offlinePayload.c_str()
    );
  }

  if (connected) {
    mqttClient.subscribe(mqttTopicCmd.c_str());
    Serial.println("MQTT Connected & subscribed to: " + mqttTopicCmd);
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String input;
  input.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++) {
    input += (char)payload[i];
  }
  Serial.println("MQTT CMD: " + input);
  prosesPerintah(input);
}

void prosesPerintah(String input) {
  input.trim();
  input.toLowerCase();

  // Mission commands
  if (input == "goto:a" || input == "goto_a") {
    mulaiMisi(1);
    return;
  }
  if (input == "goto:b" || input == "goto_b") {
    mulaiMisi(2);
    return;
  }
  if (input == "goto:c" || input == "goto_c") {
    mulaiMisi(3);
    return;
  }
  if (input == "return" || input == "return_base") {
    if (missionState == SAMPAI) {
      mulaiPulang();
    }
    return;
  }
  if (input == "stop" || input == "emergency_stop") {
    missionState = IDLE;
    missionTarget = 0;
    stopMotor();
    oledTulis("STOP", "Emergency!", "");
    kirimState();
    return;
  }

  // Tuning commands
  if (input.startsWith("p")) Kp = input.substring(1).toFloat();
  if (input.startsWith("d")) Kd = input.substring(1).toFloat();
  if (input.startsWith("s")) baseSpeed = input.substring(1).toInt();

  Serial.print("Kp="); Serial.print(Kp);
  Serial.print(" Kd="); Serial.print(Kd);
  Serial.print(" base="); Serial.println(baseSpeed);
}

// ================= STATE & TELEMETRY =================
void kirimState() {
  String payload;
  payload.reserve(200);
  payload += "{\"device_id\":\""; payload += DEVICE_ID;
  payload += "\",\"state\":\""; payload += namaState(missionState); payload += "\"";
  payload += ",\"mission\":"; payload += missionTarget;
  payload += ",\"blackbox_count\":"; payload += blackboxCount;
  payload += ",\"distance_cm\":"; payload += jarakTerakhir;
  payload += ",\"waiting\":"; payload += (waitingAtDest ? "true" : "false");
  payload += ",\"turn\":\""; payload += (turnDirection == -1 ? "left" : "right"); payload += "\"";
  payload += ",\"wifi_rssi\":"; payload += (WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0);
  payload += ",\"mqtt\":"; payload += (mqttClient.connected() ? "true" : "false");
  payload += "}";

  if (mqttClient.connected()) {
    mqttClient.publish(mqttTopicState.c_str(), payload.c_str(), true);
  }
}

bool stateCekHalangan() {
  return missionState == KEBERANGKATAN || missionState == PULANG;
}

const char* namaState(MissionState s) {
  switch (s) {
    case IDLE:           return "IDLE";
    case KEBERANGKATAN:  return "KEBERANGKATAN";
    case SAMPAI:         return "SAMPAI";
    case PULANG:         return "PULANG";
    case SELESAI:        return "SELESAI";
    default:             return "UNKNOWN";
  }
}

void kirimTelemetry(int vL, int vM, int vR, int irL, int irR, bool blackbox) {
  String payload;
  payload.reserve(520);
  payload += "{\"device_id\":\""; payload += DEVICE_ID;
  payload += "\",\"ms\":"; payload += millis();
  payload += ",\"state\":\""; payload += namaState(missionState); payload += "\"";
  payload += ",\"mission\":"; payload += missionTarget;
  payload += ",\"blackbox_count\":"; payload += blackboxCount;
  payload += ",\"distance_cm\":"; payload += jarakTerakhir;
  payload += ",\"echo_us\":"; payload += durasiEchoTerakhir;
  payload += ",\"obstacle\":"; payload += ((jarakTerakhir > 0 && jarakTerakhir <= JARAK_HALANGAN_CM) ? "true" : "false");
  payload += ",\"threshold_cm\":"; payload += JARAK_HALANGAN_CM;
  payload += ",\"line_left\":"; payload += vL;
  payload += ",\"line_middle\":"; payload += vM;
  payload += ",\"line_right\":"; payload += vR;
  payload += ",\"ir_left\":"; payload += irL;
  payload += ",\"ir_right\":"; payload += irR;
  payload += ",\"blackbox\":"; payload += (blackbox ? "true" : "false");
  payload += ",\"kp\":"; payload += String(Kp, 2);
  payload += ",\"kd\":"; payload += String(Kd, 2);
  payload += ",\"base_speed\":"; payload += baseSpeed;
  payload += ",\"motor_left\":"; payload += motorKiriTerakhir;
  payload += ",\"motor_right\":"; payload += motorKananTerakhir;
  payload += ",\"waiting\":"; payload += (waitingAtDest ? "true" : "false");
  payload += ",\"turn\":\""; payload += (turnDirection == -1 ? "left" : "right"); payload += "\"";
  payload += ",\"wifi_rssi\":"; payload += (WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0);
  payload += ",\"mqtt_connected\":"; payload += (mqttClient.connected() ? "true" : "false");
  payload += "}";

  Serial.print("TELEMETRY ");
  Serial.println(payload);

  if (mqttClient.connected()) {
    mqttClient.publish(mqttTopicTelemetry.c_str(), payload.c_str());
  }
}

// ================= FUNGSI MOTOR =================
void putarKanan(int spd) {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);  digitalWrite(IN4, HIGH);
  ledcWrite(ENA, spd);
  ledcWrite(ENB, spd);
  motorKiriTerakhir  = spd;
  motorKananTerakhir = -spd;
}

void putarKiri(int spd) {
  digitalWrite(IN1, LOW);  digitalWrite(IN2, HIGH);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  ledcWrite(ENA, spd);
  ledcWrite(ENB, spd);
  motorKiriTerakhir  = -spd;
  motorKananTerakhir = spd;
}

void majuLurus(int spd) {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  ledcWrite(ENA, spd);
  ledcWrite(ENB, spd);
  motorKiriTerakhir  = spd;
  motorKananTerakhir = spd;
}

void setMotors(int leftPWM, int rightPWM) {
  motorKiriTerakhir  = leftPWM;
  motorKananTerakhir = rightPWM;

  if (leftPWM >= 0) {
    digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
  } else {
    digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
    leftPWM = -leftPWM;
  }
  if (rightPWM >= 0) {
    digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
  } else {
    digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
    rightPWM = -rightPWM;
  }
  ledcWrite(ENA, leftPWM);
  ledcWrite(ENB, rightPWM);
}

void stopMotor() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW); digitalWrite(IN4, LOW);
  ledcWrite(ENA, 0);
  ledcWrite(ENB, 0);
  motorKiriTerakhir  = 0;
  motorKananTerakhir = 0;
}
