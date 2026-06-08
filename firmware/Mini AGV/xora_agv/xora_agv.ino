// XORA AGV — Mission-Based Firmware PERFECT/STABLE VERSION
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

#define S_TENGAH_ACTIVE_LOW false

// ================= PIN MODUL =================
#define SERVO_PIN  4
#define BUZZER_PIN 2
#define TRIG_PIN   18
#define ECHO_PIN   19
#define OLED_SDA   21
#define OLED_SCL   22

// ================= HX711 LOADCELL =================
#define HX711_DT   17
#define HX711_SCK  5

// ================= LIBRARY =================
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>
#include <HX711.h>

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

// ================= LOADCELL =================
HX711 scale;
float loadcellGram      = 0;
bool  cargoDetected     = false;
unsigned long loadcellTimer = 0;
const unsigned long LOADCELL_INTERVAL_MS = 120;
float loadcellCalibration = 420.0;
const float LOADCELL_ZERO_DEADBAND = 5.0;
const float LOADCELL_CARGO_ON_GRAM = 50.0;
const float LOADCELL_CARGO_OFF_GRAM = 35.0;
const float LOADCELL_EMA_ALPHA = 0.20;
const byte LOADCELL_TARE_READS = 20;
const byte LOADCELL_CARGO_CONFIRM_SAMPLES = 4;
const byte LOADCELL_EMPTY_CONFIRM_SAMPLES = 4;
long loadcellRawOffset = 0;
bool loadcellFilterReady = false;
bool lastCargoDetected = false;
byte loadcellCargoConfirm = 0;
byte loadcellEmptyConfirm = 0;
unsigned long cargoStateChangedAt = 0;
const unsigned long CARGO_STABLE_MS = 500;

// ================= PARAMETER PWM =================
const int PWM_FREQ = 1000;
const int PWM_RES  = 8;

// ================= PARAMETER KONTROL =================
int baseSpeed       = 145;
int curveSpeed      = 145;
int sharpCurveSpeed = 130;
int maxSpeed        = 220;
int speedMin        = 88;
int curveTurnMin    = 108;
int sharpTurnMin    = 126;

float Kp = 135.0;
float Kd = 62.0;

float lastError  = 0;
int lastLineSide = 0;
const float FULL_BLACK_MEMORY_GAIN = 0.78;
const float LOST_LINE_ERROR = 3.0;

float trimKiri  = 1.00;
float trimKanan = 1.00;

int speedBoostKiri = 0;
int rightTurnBoost = 20;

// Fase cari garis pulang B
bool bReturnSearchLine = false;
unsigned long bReturnSearchStartedAt = 0;
unsigned long bReturnSearchMaxMs = 1800;
int bReturnSearchLeftPwm  = 150;
int bReturnSearchRightPwm = -80;

int turnPowerKiri  = 220;
int turnPowerKanan = 230;

// ================= OBSTACLE — PARAMETER SEDERHANA =================
// Pola: Kanan → Maju → Kiri → Maju cari garis
#define JARAK_HALANGAN_CM 25
const unsigned long OBSTACLE_COOLDOWN_MS = 1200;

int avoidTurnRightMs   = 500;   // durasi putar kanan
int avoidTurnRightPwm  = 180;   // power putar kanan

int avoidForward1Ms    = 900;   // maju setelah kanan (lewati halangan)
int avoidForward1Spd   = 145;   // speed maju 1

int avoidTurnLeftMs    = 800;   // durasi putar kiri (balik ke arah semula)
int avoidTurnLeftPwm   = 180;   // power putar kiri

int avoidForward2Ms    = 650;   // maju cari garis setelah kiri
int avoidForward2Spd   = 145;   // speed maju 2

int obstacleServoStepDeg   = 10;
int obstacleServoStepDelayMs = 18;

unsigned long obstacleCooldownUntil = 0;

// ================= RETURN TURN =================
int returnTurnAms = 600;
int returnTurnBms = 750;
int returnTurnCms = 650;

// ================= ULTRASONIK =================
unsigned long jarakTimer   = 0;
long jarakTerakhir         = 999;
unsigned long durasiEchoTerakhir = 0;

// ================= TELEMETRY =================
unsigned long telemetryTimer = 0;
const unsigned long TELEMETRY_INTERVAL_MS = 500;

int motorKiriTerakhir  = 0;
int motorKananTerakhir = 0;

// ================= MISSION STATE =================
enum MissionState {
  IDLE,
  MENUNGGU_BARANG,
  KEBERANGKATAN,
  SAMPAI,
  PULANG,
  SELESAI,
  MANUAL
};

MissionState missionState = IDLE;

int missionTarget  = 0;
int blackboxCount  = 0;
int turnDirection  = 0;

bool waitingAtDest = false;
unsigned long arrivedTimer = 0;
const unsigned long WAIT_AT_DEST_MS = 3000;

// ================= BLACKBOX =================
bool blackboxArmed = false;
bool newBlackboxDetected = false;
unsigned long lastBlackboxAt = 0;
unsigned long boxClearStartedAt = 0;
unsigned long boxSeenStartedAt = 0;
const unsigned long BLACKBOX_EXIT_STABLE_MS  = 250;
const unsigned long BLACKBOX_ENTER_STABLE_MS = 80;
const unsigned long BLACKBOX_DEBOUNCE_MS     = 250;

// ================= ROBOT EYES - EXPRESSION SYSTEM =================
enum EyeExpression {
  EYE_HAPPY,      // Senang - mata senyum lengkung atas
  EYE_NEUTRAL,    // Netral - mata bulat normal
  EYE_BLINK,      // Kedip - mata setengah tutup
  EYE_SLEEPY,     // Ngantuk - mata setengah terpejam, idle lama
  EYE_CONFUSED,   // Bingung - mata tidak simetris, satu besar satu kecil
  EYE_ERROR,      // Error - mata X
  EYE_EXCITED,    // Semangat - mata besar dengan sparkle
  EYE_WINK,       // Kedip sebelah - playful
  EYE_LOOK_LEFT,  // Lihat kiri
  EYE_LOOK_RIGHT  // Lihat kanan
};

EyeExpression currentEyeExpr = EYE_NEUTRAL;
unsigned long lastEventTime = 0;
unsigned long lastBlinkTime = 0;
unsigned long lastEyeAnimTime = 0;
bool isBlinking = false;
int eyeAnimPhase = 0;

// Idle detection threshold (ms)
const unsigned long IDLE_THRESHOLD_NORMAL = 5000;   // 5 detik -> mulai blink
const unsigned long IDLE_THRESHOLD_SLEEPY  = 15000;  // 15 detik -> sleepy eyes
const unsigned long BLINK_INTERVAL = 3000;           // Kedip tiap 3 detik
const unsigned long BLINK_DURATION = 150;            // Durasi kedip 150ms

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
void oledDisplay(EyeExpression expr, String b1, String b2, String b3);
void oledDisplayWithText(EyeExpression expr, String b1, String b2);
void drawRobotEyes(EyeExpression expr);
void drawHappyEyes();
void drawNeutralEyes();
void drawBlinkEyes();
void drawSleepyEyes();
void drawConfusedEyes();
void drawErrorEyes();
void drawExcitedEyes();
void drawWinkEyes();
void drawLookLeftEyes();
void drawLookRightEyes();
void updateEyeExpression();
void setEyeExpression(EyeExpression expr);
void markEvent();
void buzzerBeep(int durasi);
bool tareLoadcell(const char* reason);
void bacaLoadcell();
int bacaSensorTengah();
void resetBlackbox();
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
bool cargoStablePresent();
bool cargoStableAbsent();
int durasiBelokPulang();
void mulaiCariGarisPulangB();

// ================================================
void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println();
  Serial.println("=== XORA AGV BOOT ===");

  setupJaringan();

  servoScan.setPeriodHertz(50);
  servoScan.attach(SERVO_PIN, 500, 2400);
  delay(100);
  servoScan.write(SERVO_DEPAN);
  delay(1500);

  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);

  ledcAttach(ENA, PWM_FREQ, PWM_RES);
  ledcAttach(ENB, PWM_FREQ, PWM_RES);

  pinMode(S_KIRI,   INPUT);
  pinMode(S_TENGAH, INPUT);
  pinMode(S_KANAN,  INPUT);
  pinMode(IR_KIRI,  INPUT);
  pinMode(IR_KANAN, INPUT);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);
  delay(500);

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED: init failed");
  } else {
    display.clearDisplay();
    display.display();
  }

  Serial.println("HX711: Init...");
  scale.begin(HX711_DT, HX711_SCK);
  delay(1000);

  int hx711Retry = 0;
  while (!scale.is_ready() && hx711Retry < 10) {
    delay(100);
    hx711Retry++;
  }

  scale.set_scale(loadcellCalibration);
  tareLoadcell("BOOT");

  stopMotor();
  oledDisplay(EYE_EXCITED, "SIAP", "Kalibrasi", "sensor...");
  buzzerBeep(200);

  delay(2000);

  for (int i = 0; i < 10; i++) {
    jarakTerakhir = bacaJarak();
    if (jarakTerakhir < 999) break;
    delay(300);
  }

  delay(1000);
  oledDisplay(EYE_HAPPY, "IDLE", "Siap terima", "perintah");
  markEvent();
  kirimState();

  Serial.println("=== XORA AGV READY ===");
  Serial.println("Tuning obstacle baru (jalur lurus):");
  Serial.println("ar500 = avoidTurnRightMs");
  Serial.println("ap180 = avoidTurnRightPwm");
  Serial.println("af700 = avoidForward1Ms");
  Serial.println("al500 = avoidTurnLeftMs");
  Serial.println("aq180 = avoidTurnLeftPwm");
  Serial.println("ag800 = avoidForward2Ms");
}

// ================================================
void loop() {
  jagaJaringan();

  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    prosesPerintah(input);
  }

  bacaLoadcell();

  // Update robot eyes animation - idle detection & blink
  updateEyeExpression();

  // Refresh OLED display periodically when idle (for eye animations)
  static unsigned long lastDisplayRefresh = 0;
  if (missionState == IDLE || missionState == SELESAI) {
    if (millis() - lastDisplayRefresh >= 200) {  // Refresh 5x per second for smooth animation
      lastDisplayRefresh = millis();
      display.clearDisplay();
      display.setTextColor(SSD1306_WHITE);
      drawRobotEyes(currentEyeExpr);
      display.setTextSize(1);
      display.setCursor(0, 30);
      if (missionState == IDLE) {
        display.println("IDLE");
        display.setCursor(0, 42);
        display.println("Siap terima");
        display.setCursor(0, 54);
        display.println("perintah");
      } else {
        display.println("SELESAI");
        display.setCursor(0, 42);
        display.println("Sampai base");
        display.setCursor(0, 54);
        display.println(":)");
      }
      display.display();
    }
  }

  // Baca ultrasonik
  if (millis() - jarakTimer >= 300) {
    jarakTimer    = millis();
    jarakTerakhir = bacaJarak();

    if (jarakTerakhir >= 999) {
      static int failCount = 0;
      failCount++;
      if (failCount >= 5) {
        failCount = 0;
        pinMode(TRIG_PIN, OUTPUT);
        pinMode(ECHO_PIN, INPUT);
        digitalWrite(TRIG_PIN, LOW);
        delay(100);
      }
    }
  }

  // Baca sensor garis
  int vL  = digitalRead(S_KIRI);
  int vM  = bacaSensorTengah();
  int vR  = digitalRead(S_KANAN);
  int irL = digitalRead(IR_KIRI);
  int irR = digitalRead(IR_KANAN);

  bool blackbox = (vL == 1 && vM == 1 && vR == 1 && irL == 1 && irR == 1);

  // Cek halangan
  if (stateCekHalangan() && millis() >= obstacleCooldownUntil) {
    if (jarakTerakhir > 0 && jarakTerakhir <= JARAK_HALANGAN_CM) {
      stopMotor();
      buzzerBeep(300);
      oledDisplay(EYE_ERROR, "HALANGAN!", String(jarakTerakhir) + " cm", "Menghindar...");
      markEvent();
      jarakTerakhir = 999;
      scanDanHindari();
      obstacleCooldownUntil = millis() + OBSTACLE_COOLDOWN_MS;
      lastError    = 0;
      lastLineSide = 0;
      kirimState();
    }
  }

  // Debug
  Serial.print("STATE="); Serial.print(namaState(missionState));
  Serial.print(" MISSION="); Serial.print(missionTarget);
  Serial.print(" BB="); Serial.print(blackboxCount);
  Serial.print(" | S: ");
  Serial.print(irL); Serial.print(" ");
  Serial.print(vL);  Serial.print(" ");
  Serial.print(vM);  Serial.print(" ");
  Serial.print(vR);  Serial.print(" ");
  Serial.print(irR);
  Serial.print(" | M: ");
  Serial.print(motorKiriTerakhir);
  Serial.print(" ");
  Serial.println(motorKananTerakhir);

  // State machine
  switch (missionState) {

    case IDLE:
      stopMotor();
      break;

    case MENUNGGU_BARANG:
      stopMotor();
      if (cargoStablePresent()) {
        buzzerBeep(200);
        String nama = (missionTarget == 1) ? "A" : (missionTarget == 2) ? "B" : "C";
        oledDisplay(EYE_EXCITED, "BARANG ADA!", "Ke titik " + nama, "Berangkat!");
        markEvent();
        missionState = KEBERANGKATAN;
        kirimState();
      } else {
        // Refresh display periodically when waiting for cargo
        static unsigned long lastCargoWaitRefresh = 0;
        if (millis() - lastCargoWaitRefresh >= 500) {
          lastCargoWaitRefresh = millis();
          String nama = (missionTarget == 1) ? "A" : (missionTarget == 2) ? "B" : "C";
          oledDisplay(EYE_CONFUSED, "MISI " + nama, "Tunggu barang...", String(loadcellGram, 0) + "g");
          markEvent();
        }
      }
      break;

    case KEBERANGKATAN:
      hitungBlackbox(blackbox);

      if (newBlackboxDetected && blackboxCount == missionTarget) {
        stopMotor();
        buzzerBeep(200);
        missionState  = SAMPAI;
        waitingAtDest = true;
        arrivedTimer  = 0;
        oledDisplay(EYE_HAPPY, "SAMPAI!", "Tujuan " + String(missionTarget), "Tunggu barang...");
        markEvent();
        kirimState();
        break;
      }

      followLine(vL, vM, vR, irL, irR);
      break;

    case SAMPAI:
      stopMotor();

      if (waitingAtDest) {
        if (!cargoStableAbsent()) {
          oledDisplay(EYE_CONFUSED, "SAMPAI!", "Barang: " + String(loadcellGram, 0) + "g", "Tunggu diambil...");
          markEvent();
        } else {
          if (arrivedTimer == 0) {
            arrivedTimer = millis();
            oledDisplay(EYE_WINK, "BARANG DIAMBIL", "Tunggu 3dtk...", "");
            markEvent();
            buzzerBeep(200);
          }

          if (millis() - arrivedTimer >= WAIT_AT_DEST_MS) {
            waitingAtDest = false;

            if (missionTarget != 1) {
              majuLurus(baseSpeed);
              int majuMs = (missionTarget == 3) ? 200 : 400;
              delay(majuMs);
              stopMotor();
              delay(100);
            }

            oledDisplay((turnDirection == 1) ? EYE_LOOK_RIGHT : EYE_LOOK_LEFT, "BELOK", (turnDirection == 1) ? "Kanan" : "Kiri", "");
            markEvent();

            if (turnDirection == 1) putarKanan(turnPowerKanan);
            else                    putarKiri(turnPowerKiri);

            delay(durasiBelokPulang());
            stopMotor();
            delay(200);

            resetBlackbox();
            lastError = 0;
            lastLineSide = 0;
            speedBoostKiri = 0;

            if (missionTarget == 2) mulaiCariGarisPulangB();
            else                    bReturnSearchLine = false;

            missionState = PULANG;
            kirimState();
            oledDisplay(EYE_LOOK_LEFT, "PULANG", "Ke base...", "");
            markEvent();
          }
        }
      }
      break;

    case PULANG:
      if (bReturnSearchLine) {
        bool anyLine     = (irL == 1 || vL == 1 || vM == 1 || vR == 1 || irR == 1);
        bool lineSeen    = anyLine && !blackbox;
        bool searchTimeout = (millis() - bReturnSearchStartedAt >= bReturnSearchMaxMs);

        if (!lineSeen && !searchTimeout) {
          setMotors(bReturnSearchLeftPwm, bReturnSearchRightPwm);
          oledDisplay(EYE_LOOK_RIGHT, "PULANG B", "Cari garis", "kanan...");
          markEvent();
          break;
        }

        bReturnSearchLine = false;
        stopMotor();
        delay(80);
        lastError    = 0;
        lastLineSide = 1;
      }

      hitungBlackbox(blackbox);

      if (newBlackboxDetected && blackboxCount >= 1) {
        stopMotor();
        buzzerBeep(200);
        bReturnSearchLine = false;
        missionState = SELESAI;
        oledDisplay(EYE_HAPPY, "PULANG!", "Sampai base", ":)");
        markEvent();
        kirimState();
        break;
      }

      followLine(vL, vM, vR, irL, irR);
      break;

    case SELESAI:
      stopMotor();
      break;

    case MANUAL:
      break;
  }

  // Telemetry
  if (millis() - telemetryTimer >= TELEMETRY_INTERVAL_MS) {
    telemetryTimer = millis();
    kirimTelemetry(vL, vM, vR, irL, irR, blackbox);
  }

  // Heartbeat
  static unsigned long lastHeartbeat = 0;
  if (millis() - lastHeartbeat >= 5000) {
    lastHeartbeat = millis();
    Serial.print("HEARTBEAT | WiFi="); Serial.print(WiFi.status() == WL_CONNECTED ? "OK" : "FAIL");
    Serial.print(" MQTT="); Serial.print(mqttClient.connected() ? "OK" : "FAIL");
    Serial.print(" US="); Serial.print(jarakTerakhir);
    Serial.print("cm LC="); Serial.print(loadcellGram, 1);
    Serial.print("g HX="); Serial.println(scale.is_ready() ? "OK" : "FAIL");
  }

  delay(2);
}

// ================= OBSTACLE — LOGIC BARU SEDERHANA =================
// Pola: STOP → Kanan → Maju → Kiri → Maju cari garis → lanjut follow line
void scanDanHindari() {
    // Servo sweep dulu sebelum hindari
  oledDisplay(EYE_CONFUSED, "HALANGAN", "Scan servo", "0->180->90");
  markEvent();
  servoKe(SERVO_KANAN, 120);   // ke 0°
  for (int s = SERVO_KANAN; s <= SERVO_KIRI; s += obstacleServoStepDeg) {
      servoScan.write(s);
      delay(obstacleServoStepDelayMs);
  }
  servoKe(SERVO_KIRI, 80);     // tahan di 180° sebentar
  servoKe(SERVO_DEPAN, 120);   // balik ke 90°

  // Step 1: Putar kanan
  oledDisplay(EYE_LOOK_RIGHT, "HINDARI", "Putar kanan", "");
  markEvent();
  putarKanan(avoidTurnRightPwm);
  delay(avoidTurnRightMs);
  stopMotor();
  delay(150);

  // Step 2: Maju lurus (lewati halangan)
  oledDisplay(EYE_NEUTRAL, "HINDARI", "Maju...", "");
  markEvent();
  majuLurus(avoidForward1Spd);
  delay(avoidForward1Ms);
  stopMotor();
  delay(150);

  // Step 3: Putar kiri (balik ke arah garis)
  oledDisplay(EYE_LOOK_LEFT, "HINDARI", "Putar kiri", "");
  markEvent();
  putarKiri(avoidTurnLeftPwm);
  delay(avoidTurnLeftMs);
  stopMotor();
  delay(150);

  // Step 4: Maju cari garis
  oledDisplay(EYE_LOOK_RIGHT, "HINDARI", "Cari garis...", "");
  markEvent();
  majuLurus(avoidForward2Spd);
  delay(avoidForward2Ms);
  stopMotor();
  delay(100);

  // Reset state follow line
  lastError    = 0;
  lastLineSide = 0;
  jarakTerakhir = 999;

  oledDisplay(EYE_HAPPY, "LANJUT", "Follow line", "");
  markEvent();
  Serial.println("HINDARI selesai, lanjut follow line");
}

// ================= MISSION CONTROL =================
void mulaiMisi(int target) {
  missionTarget  = target;
  resetBlackbox();
  lastError      = 0;
  lastLineSide   = 0;
  waitingAtDest  = false;
  bReturnSearchLine = false;
  turnDirection  = (target == 2) ? 1 : -1;
  speedBoostKiri = 0;

  String nama = (target == 1) ? "A" : (target == 2) ? "B" : "C";

  loadcellTimer = 0;
  bacaLoadcell();
  if (!cargoStablePresent()) {
    missionState = MENUNGGU_BARANG;
    oledDisplay(EYE_CONFUSED, "MISI " + nama, "Tunggu barang", "ditaruh...");
    markEvent();
    kirimState();
    return;
  }

  missionState = KEBERANGKATAN;
  oledDisplay(EYE_EXCITED, "MISI", "Ke titik " + nama, "Berangkat!");
  markEvent();
  kirimState();
}

void mulaiPulang() {
  resetBlackbox();
  lastError    = 0;
  lastLineSide = 0;

  if (turnDirection == 0) turnDirection = (missionTarget == 2) ? 1 : -1;

  oledDisplay((turnDirection == 1) ? EYE_LOOK_RIGHT : EYE_LOOK_LEFT, "BELOK", (turnDirection == 1) ? "Kanan 90" : "Kiri 90", "");
  markEvent();

  if (turnDirection == 1) putarKanan(turnPowerKanan);
  else                    putarKiri(turnPowerKiri);

  delay(durasiBelokPulang());
  stopMotor();
  delay(200);

  speedBoostKiri = 0;
  if (missionTarget == 2) mulaiCariGarisPulangB();
  else                    bReturnSearchLine = false;

  missionState = PULANG;
  kirimState();
  oledDisplay(EYE_LOOK_LEFT, "PULANG", "Ke base...", "");
  markEvent();
}

void mulaiCariGarisPulangB() {
  bReturnSearchLine      = true;
  bReturnSearchStartedAt = millis();
  lastError    = 0;
  lastLineSide = 1;
}

int durasiBelokPulang() {
  if (missionTarget == 1) return returnTurnAms;
  if (missionTarget == 2) return returnTurnBms;
  if (missionTarget == 3) return returnTurnCms;
  return 1100;
}

// ================= BLACKBOX =================
void hitungBlackbox(bool blackbox) {
  newBlackboxDetected = false;
  unsigned long now   = millis();

  if (!blackboxArmed && !blackbox) {
    if (boxClearStartedAt == 0) boxClearStartedAt = now;
    boxSeenStartedAt = 0;
    if (now - boxClearStartedAt >= BLACKBOX_EXIT_STABLE_MS) blackboxArmed = true;
    return;
  }

  if (!blackbox) {
    boxSeenStartedAt = 0;
    return;
  }

  boxClearStartedAt = 0;
  if (!blackboxArmed) { boxSeenStartedAt = 0; return; }
  if (boxSeenStartedAt == 0) boxSeenStartedAt = now;

  if (now - boxSeenStartedAt >= BLACKBOX_ENTER_STABLE_MS &&
      now - lastBlackboxAt   >= BLACKBOX_DEBOUNCE_MS) {
    blackboxCount++;
    blackboxArmed       = false;
    newBlackboxDetected = true;
    lastBlackboxAt      = now;
    boxSeenStartedAt    = 0;
    Serial.print("BLACKBOX #"); Serial.println(blackboxCount);
  }
}

void resetBlackbox() {
  blackboxCount       = 0;
  blackboxArmed       = false;
  newBlackboxDetected = false;
  lastBlackboxAt      = 0;
  boxClearStartedAt   = 0;
  boxSeenStartedAt    = 0;
}

int bacaSensorTengah() {
  int raw = digitalRead(S_TENGAH);
  return S_TENGAH_ACTIVE_LOW ? !raw : raw;
}

// ================= FOLLOW LINE PID =================
void followLine(int vL, int vM, int vR, int irL, int irR) {
  int sum    = irL + vL + vM + vR + irR;
  float error = 0;

  if (sum >= 5) {
    if (lastLineSide != 0 && (lastError > 0.15 || lastError < -0.15)) {
      error = lastError * FULL_BLACK_MEMORY_GAIN;
    } else {
      error = 0;
    }
  }
  else if (sum > 0) {
    error = ((-3.5 * irL) + (-1.4 * vL) + (0.0 * vM) + (1.4 * vR) + (3.5 * irR)) / sum;
    if (error < 0) lastLineSide = -1;
    else if (error > 0) lastLineSide = 1;
  }
  else {
    if (lastLineSide == 0) error = 0;
    else error = (lastLineSide == -1) ? -LOST_LINE_ERROR : LOST_LINE_ERROR;
  }

  float absError  = (error < 0) ? -error : error;
  int driveSpeed  = baseSpeed;
  int turnMin     = 0;

  if (sum == 0 || absError >= 1.35) {
    driveSpeed = sharpCurveSpeed;
    turnMin    = sharpTurnMin;
  } else if (absError >= 0.30) {
    driveSpeed = curveSpeed;
    turnMin    = curveTurnMin;
  }

  float derivative = constrain(error - lastError, -2.2, 2.2);
  float correction = (Kp * error) + (Kd * derivative);

  int leftSpeed  = driveSpeed + speedBoostKiri + (int)correction;
  int rightSpeed = driveSpeed - (int)correction;

  if (correction > 3) {
    int boost = (int)(correction * 0.25);
    if (boost > rightTurnBoost) boost = rightTurnBoost;
    if (boost < 4) boost = 4;
    leftSpeed += boost;
  }

  leftSpeed  = constrain(leftSpeed,  -maxSpeed, maxSpeed);
  rightSpeed = constrain(rightSpeed, -maxSpeed, maxSpeed);

  bool rightInnerLimited = false;
  bool leftInnerLimited  = false;

  if (turnMin > 0) {
    if (error < 0) {
      if (rightSpeed > 0 && rightSpeed < turnMin) rightSpeed = turnMin;
      else if (rightSpeed < 0 && rightSpeed > -turnMin) rightSpeed = -turnMin;
      leftInnerLimited = true;
    } else {
      if (leftSpeed > 0 && leftSpeed < turnMin) leftSpeed = turnMin;
      else if (leftSpeed < 0 && leftSpeed > -turnMin) leftSpeed = -turnMin;
      rightInnerLimited = true;
    }
  }

  if (!rightInnerLimited && rightSpeed > 0 && rightSpeed < speedMin) rightSpeed = speedMin;
  if (!leftInnerLimited  && leftSpeed  > 0 && leftSpeed  < speedMin) leftSpeed  = speedMin;

  setMotors(leftSpeed, rightSpeed);
  lastError = error;
}

// ================= ULTRASONIK =================
long bacaJarak() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long durasi = pulseIn(ECHO_PIN, HIGH, 30000);
  durasiEchoTerakhir = durasi;
  if (durasi == 0) return 999;
  return durasi * 0.034 / 2;
}

// ================= SERVO =================
void servoKe(int sudut, int tunda) {
  servoScan.write(sudut);
  if (tunda > 0) delay(tunda);
}

// ================= OLED - LEGACY =================
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

// ================= OLED - ROBOT EYES SYSTEM =================
void oledDisplay(EyeExpression expr, String b1, String b2, String b3) {
  currentEyeExpr = expr;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Draw robot eyes di bagian atas (y: 0-28)
  drawRobotEyes(expr);

  // Text di bagian bawah (y: 30-63)
  display.setTextSize(1);

  // Baris 1 - bold/size 2 untuk status utama
  display.setTextSize(1);
  display.setCursor(0, 30);
  display.println(b1);

  // Baris 2
  display.setCursor(0, 42);
  display.println(b2);

  // Baris 3
  display.setCursor(0, 54);
  display.println(b3);

  display.display();
}

void oledDisplayWithText(EyeExpression expr, String b1, String b2) {
  oledDisplay(expr, b1, b2, "");
}

void markEvent() {
  lastEventTime = millis();
  isBlinking = false;
}

void setEyeExpression(EyeExpression expr) {
  currentEyeExpr = expr;
  markEvent();
}

void updateEyeExpression() {
  unsigned long now = millis();
  unsigned long idleTime = now - lastEventTime;

  // Blink logic - hanya saat idle normal
  if (idleTime > IDLE_THRESHOLD_NORMAL && idleTime < IDLE_THRESHOLD_SLEEPY) {
    if (!isBlinking && now - lastBlinkTime >= BLINK_INTERVAL) {
      isBlinking = true;
      lastBlinkTime = now;
      lastEyeAnimTime = now;
    }

    if (isBlinking && now - lastEyeAnimTime >= BLINK_DURATION) {
      isBlinking = false;
      lastEyeAnimTime = now;
    }

    if (isBlinking) {
      currentEyeExpr = EYE_BLINK;
    } else {
      currentEyeExpr = EYE_HAPPY;
    }
  }
  // Sleepy eyes - idle sangat lama
  else if (idleTime >= IDLE_THRESHOLD_SLEEPY) {
    currentEyeExpr = EYE_SLEEPY;
  }
  // Active - jangan override expression yang sudah di-set
  else if (idleTime < IDLE_THRESHOLD_NORMAL) {
    // Expression sudah di-set oleh event, jangan override
  }
}

// ================= DRAW ROBOT EYES =================
void drawRobotEyes(EyeExpression expr) {
  switch (expr) {
    case EYE_HAPPY:     drawHappyEyes(); break;
    case EYE_NEUTRAL:   drawNeutralEyes(); break;
    case EYE_BLINK:     drawBlinkEyes(); break;
    case EYE_SLEEPY:    drawSleepyEyes(); break;
    case EYE_CONFUSED:  drawConfusedEyes(); break;
    case EYE_ERROR:     drawErrorEyes(); break;
    case EYE_EXCITED:   drawExcitedEyes(); break;
    case EYE_WINK:      drawWinkEyes(); break;
    case EYE_LOOK_LEFT: drawLookLeftEyes(); break;
    case EYE_LOOK_RIGHT:drawLookRightEyes(); break;
    default:            drawNeutralEyes(); break;
  }
}

// Happy eyes - lengkung senyum di atas (U shape inverted)
void drawHappyEyes() {
  int leftEyeX = 32;
  int rightEyeX = 88;
  int eyeY = 14;
  int eyeW = 18;
  int eyeH = 12;

  // Mata kiri - lengkung senyum
  display.drawRoundRect(leftEyeX - eyeW/2, eyeY - eyeH/2, eyeW, eyeH, 6, SSD1306_WHITE);
  // Highlight senyum - isi bagian atas
  display.fillRoundRect(leftEyeX - eyeW/2 + 2, eyeY - eyeH/2 + 2, eyeW - 4, eyeH/2, 4, SSD1306_WHITE);

  // Mata kanan - lengkung senyum
  display.drawRoundRect(rightEyeX - eyeW/2, eyeY - eyeH/2, eyeW, eyeH, 6, SSD1306_WHITE);
  display.fillRoundRect(rightEyeX - eyeW/2 + 2, eyeY - eyeH/2 + 2, eyeW - 4, eyeH/2, 4, SSD1306_WHITE);

  // Mulut kecil senyum
  display.drawPixel(64, 26, SSD1306_WHITE);
  display.drawPixel(63, 27, SSD1306_WHITE);
  display.drawPixel(64, 27, SSD1306_WHITE);
  display.drawPixel(65, 27, SSD1306_WHITE);
}

// Neutral eyes - bulat normal dengan pupil
void drawNeutralEyes() {
  int leftEyeX = 36;
  int rightEyeX = 88;
  int eyeY = 14;
  int eyeR = 10;

  // Lingkaran mata kiri
  display.drawCircle(leftEyeX, eyeY, eyeR, SSD1306_WHITE);
  display.fillCircle(leftEyeX, eyeY, eyeR - 1, SSD1306_BLACK);
  // Pupil
  display.fillCircle(leftEyeX + 2, eyeY, 4, SSD1306_WHITE);
  // Highlight
  display.fillCircle(leftEyeX + 4, eyeY - 3, 2, SSD1306_WHITE);

  // Lingkaran mata kanan
  display.drawCircle(rightEyeX, eyeY, eyeR, SSD1306_WHITE);
  display.fillCircle(rightEyeX, eyeY, eyeR - 1, SSD1306_BLACK);
  // Pupil
  display.fillCircle(rightEyeX + 2, eyeY, 4, SSD1306_WHITE);
  // Highlight
  display.fillCircle(rightEyeX + 4, eyeY - 3, 2, SSD1306_WHITE);
}

// Blink eyes - garis horizontal (mata setengah tutup)
void drawBlinkEyes() {
  int leftEyeX = 36;
  int rightEyeX = 88;
  int eyeY = 14;
  int eyeW = 16;

  // Mata kiri - garis dengan sedikit lengkung
  display.drawLine(leftEyeX - eyeW/2, eyeY, leftEyeX + eyeW/2, eyeY, SSD1306_WHITE);
  display.drawLine(leftEyeX - eyeW/2 + 2, eyeY - 1, leftEyeX + eyeW/2 - 2, eyeY - 1, SSD1306_WHITE);
  display.drawLine(leftEyeX - eyeW/2 + 2, eyeY + 1, leftEyeX + eyeW/2 - 2, eyeY + 1, SSD1306_WHITE);

  // Mata kanan - garis dengan sedikit lengkung
  display.drawLine(rightEyeX - eyeW/2, eyeY, rightEyeX + eyeW/2, eyeY, SSD1306_WHITE);
  display.drawLine(rightEyeX - eyeW/2 + 2, eyeY - 1, rightEyeX + eyeW/2 - 2, eyeY - 1, SSD1306_WHITE);
  display.drawLine(rightEyeX - eyeW/2 + 2, eyeY + 1, rightEyeX + eyeW/2 - 2, eyeY + 1, SSD1306_WHITE);
}

// Sleepy eyes - setengah terpejam dengan efek Zzz
void drawSleepyEyes() {
  int leftEyeX = 36;
  int rightEyeX = 88;
  int eyeY = 16;
  int eyeW = 14;

  // Mata kiri - garis miring ke bawah
  display.drawLine(leftEyeX - eyeW/2, eyeY - 2, leftEyeX + eyeW/2, eyeY, SSD1306_WHITE);
  display.drawLine(leftEyeX - eyeW/2 + 1, eyeY - 3, leftEyeX + eyeW/2 - 1, eyeY - 1, SSD1306_WHITE);

  // Mata kanan - garis miring ke bawah
  display.drawLine(rightEyeX - eyeW/2, eyeY, rightEyeX + eyeW/2, eyeY - 2, SSD1306_WHITE);
  display.drawLine(rightEyeX - eyeW/2 + 1, eyeY - 1, rightEyeX + eyeW/2 - 1, eyeY - 3, SSD1306_WHITE);

  // Zzz effect
  display.setTextSize(1);
  display.setCursor(108, 4);
  display.print("z");
  display.setCursor(114, 8);
  display.print("Z");
  display.setCursor(118, 2);
  display.print("z");
}

// Confused eyes - tidak simetris, satu besar satu kecil, alis miring
void drawConfusedEyes() {
  int leftEyeX = 36;
  int rightEyeX = 88;
  int eyeY = 14;

  // Mata kiri - lebih besar, normal
  display.drawCircle(leftEyeX, eyeY, 10, SSD1306_WHITE);
  display.fillCircle(leftEyeX, eyeY, 9, SSD1306_BLACK);
  display.fillCircle(leftEyeX, eyeY, 4, SSD1306_WHITE);

  // Mata kanan - lebih kecil, heran
  display.drawCircle(rightEyeX, eyeY, 7, SSD1306_WHITE);
  display.fillCircle(rightEyeX, eyeY, 6, SSD1306_BLACK);
  display.fillCircle(rightEyeX, eyeY, 3, SSD1306_WHITE);

  // Alis kiri - datar
  display.drawLine(leftEyeX - 12, eyeY - 14, leftEyeX + 12, eyeY - 14, SSD1306_WHITE);
  display.drawLine(leftEyeX - 12, eyeY - 13, leftEyeX + 12, eyeY - 13, SSD1306_WHITE);

  // Alis kanan - miring ke atas (bingung)
  display.drawLine(rightEyeX - 10, eyeY - 12, rightEyeX + 10, eyeY - 16, SSD1306_WHITE);
  display.drawLine(rightEyeX - 10, eyeY - 11, rightEyeX + 10, eyeY - 15, SSD1306_WHITE);

  // Mulut bingung - zigzag kecil
  display.drawLine(58, 26, 62, 24, SSD1306_WHITE);
  display.drawLine(62, 24, 66, 26, SSD1306_WHITE);
  display.drawLine(66, 26, 70, 24, SSD1306_WHITE);
}

// Error eyes - X mark
void drawErrorEyes() {
  int leftEyeX = 36;
  int rightEyeX = 88;
  int eyeY = 14;
  int crossSize = 8;

  // Mata kiri - X
  display.drawLine(leftEyeX - crossSize, eyeY - crossSize, leftEyeX + crossSize, eyeY + crossSize, SSD1306_WHITE);
  display.drawLine(leftEyeX + crossSize, eyeY - crossSize, leftEyeX - crossSize, eyeY + crossSize, SSD1306_WHITE);
  display.drawLine(leftEyeX - crossSize + 1, eyeY - crossSize, leftEyeX + crossSize + 1, eyeY + crossSize, SSD1306_WHITE);
  display.drawLine(leftEyeX + crossSize - 1, eyeY - crossSize, leftEyeX - crossSize - 1, eyeY + crossSize, SSD1306_WHITE);

  // Mata kanan - X
  display.drawLine(rightEyeX - crossSize, eyeY - crossSize, rightEyeX + crossSize, eyeY + crossSize, SSD1306_WHITE);
  display.drawLine(rightEyeX + crossSize, eyeY - crossSize, rightEyeX - crossSize, eyeY + crossSize, SSD1306_WHITE);
  display.drawLine(rightEyeX - crossSize + 1, eyeY - crossSize, rightEyeX + crossSize + 1, eyeY + crossSize, SSD1306_WHITE);
  display.drawLine(rightEyeX + crossSize - 1, eyeY - crossSize, rightEyeX - crossSize - 1, eyeY + crossSize, SSD1306_WHITE);

  // Alis marah - miring ke dalam
  display.drawLine(leftEyeX - 12, eyeY - 12, leftEyeX + 8, eyeY - 16, SSD1306_WHITE);
  display.drawLine(rightEyeX + 12, eyeY - 12, rightEyeX - 8, eyeY - 16, SSD1306_WHITE);
}

// Excited eyes - besar dengan sparkle
void drawExcitedEyes() {
  int leftEyeX = 36;
  int rightEyeX = 88;
  int eyeY = 14;

  // Mata kiri - besar dan cerah
  display.fillCircle(leftEyeX, eyeY, 11, SSD1306_WHITE);
  display.fillCircle(leftEyeX, eyeY, 8, SSD1306_BLACK);
  display.fillCircle(leftEyeX, eyeY, 6, SSD1306_WHITE);
  // Sparkle
  display.fillCircle(leftEyeX + 4, eyeY - 4, 2, SSD1306_BLACK);
  display.fillCircle(leftEyeX - 3, eyeY + 3, 1, SSD1306_BLACK);

  // Mata kanan - besar dan cerah
  display.fillCircle(rightEyeX, eyeY, 11, SSD1306_WHITE);
  display.fillCircle(rightEyeX, eyeY, 8, SSD1306_BLACK);
  display.fillCircle(rightEyeX, eyeY, 6, SSD1306_WHITE);
  // Sparkle
  display.fillCircle(rightEyeX + 4, eyeY - 4, 2, SSD1306_BLACK);
  display.fillCircle(rightEyeX - 3, eyeY + 3, 1, SSD1306_BLACK);

  // Sparkle stars di sekitar mata
  display.drawPixel(18, 6, SSD1306_WHITE);
  display.drawPixel(16, 8, SSD1306_WHITE);
  display.drawPixel(20, 8, SSD1306_WHITE);
  display.drawPixel(18, 10, SSD1306_WHITE);

  display.drawPixel(106, 6, SSD1306_WHITE);
  display.drawPixel(104, 8, SSD1306_WHITE);
  display.drawPixel(108, 8, SSD1306_WHITE);
  display.drawPixel(106, 10, SSD1306_WHITE);
}

// Wink eyes - satu terbuka, satu kedip
void drawWinkEyes() {
  int leftEyeX = 36;
  int rightEyeX = 88;
  int eyeY = 14;

  // Mata kiri - terbuka (normal)
  display.drawCircle(leftEyeX, eyeY, 10, SSD1306_WHITE);
  display.fillCircle(leftEyeX, eyeY, 9, SSD1306_BLACK);
  display.fillCircle(leftEyeX + 2, eyeY, 4, SSD1306_WHITE);
  display.fillCircle(leftEyeX + 4, eyeY - 3, 2, SSD1306_WHITE);

  // Mata kanan - kedip (garis lengkung)
  int eyeW = 16;
  display.drawLine(rightEyeX - eyeW/2, eyeY, rightEyeX + eyeW/2, eyeY, SSD1306_WHITE);
  display.drawLine(rightEyeX - eyeW/2 + 2, eyeY - 1, rightEyeX + eyeW/2 - 2, eyeY - 1, SSD1306_WHITE);
  display.drawLine(rightEyeX - eyeW/2 + 2, eyeY + 1, rightEyeX + eyeW/2 - 2, eyeY + 1, SSD1306_WHITE);
}

// Look left eyes - pupil ke kiri
void drawLookLeftEyes() {
  int leftEyeX = 36;
  int rightEyeX = 88;
  int eyeY = 14;
  int eyeR = 10;

  // Mata kiri
  display.drawCircle(leftEyeX, eyeY, eyeR, SSD1306_WHITE);
  display.fillCircle(leftEyeX, eyeY, eyeR - 1, SSD1306_BLACK);
  display.fillCircle(leftEyeX - 4, eyeY, 4, SSD1306_WHITE);
  display.fillCircle(leftEyeX - 2, eyeY - 3, 2, SSD1306_WHITE);

  // Mata kanan
  display.drawCircle(rightEyeX, eyeY, eyeR, SSD1306_WHITE);
  display.fillCircle(rightEyeX, eyeY, eyeR - 1, SSD1306_BLACK);
  display.fillCircle(rightEyeX - 4, eyeY, 4, SSD1306_WHITE);
  display.fillCircle(rightEyeX - 2, eyeY - 3, 2, SSD1306_WHITE);
}

// Look right eyes - pupil ke kanan
void drawLookRightEyes() {
  int leftEyeX = 36;
  int rightEyeX = 88;
  int eyeY = 14;
  int eyeR = 10;

  // Mata kiri
  display.drawCircle(leftEyeX, eyeY, eyeR, SSD1306_WHITE);
  display.fillCircle(leftEyeX, eyeY, eyeR - 1, SSD1306_BLACK);
  display.fillCircle(leftEyeX + 4, eyeY, 4, SSD1306_WHITE);
  display.fillCircle(leftEyeX + 6, eyeY - 3, 2, SSD1306_WHITE);

  // Mata kanan
  display.drawCircle(rightEyeX, eyeY, eyeR, SSD1306_WHITE);
  display.fillCircle(rightEyeX, eyeY, eyeR - 1, SSD1306_BLACK);
  display.fillCircle(rightEyeX + 4, eyeY, 4, SSD1306_WHITE);
  display.fillCircle(rightEyeX + 6, eyeY - 3, 2, SSD1306_WHITE);
}

// ================= BUZZER =================
void buzzerBeep(int durasi) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(durasi);
  digitalWrite(BUZZER_PIN, LOW);
}

// ================= LOADCELL =================
void bacaLoadcell() {
  if (millis() - loadcellTimer < LOADCELL_INTERVAL_MS) return;
  loadcellTimer = millis();

  bool ready = scale.is_ready();

  if (!ready) {
    static unsigned long lastRetry = 0;
    if (millis() - lastRetry >= 3000) {
      lastRetry = millis();
      scale.begin(HX711_DT, HX711_SCK);
      delay(100);
      if (scale.is_ready()) {
        scale.set_scale(loadcellCalibration);
        tareLoadcell("RECONNECT");
        ready = true;
      }
    }
  }

  if (ready) {
    long raw        = scale.read();
    float sampleGram = (raw - loadcellRawOffset) / loadcellCalibration;
    if (sampleGram < 0) sampleGram = 0;

    if (!loadcellFilterReady) {
      loadcellGram = sampleGram;
      loadcellFilterReady = true;
    } else {
      loadcellGram = (LOADCELL_EMA_ALPHA * sampleGram) + ((1.0 - LOADCELL_EMA_ALPHA) * loadcellGram);
    }

    float filteredGram = loadcellGram;
    if (filteredGram < LOADCELL_ZERO_DEADBAND) filteredGram = 0;

    if (!cargoDetected) {
      if (filteredGram > LOADCELL_CARGO_ON_GRAM) {
        if (loadcellCargoConfirm < LOADCELL_CARGO_CONFIRM_SAMPLES) loadcellCargoConfirm++;
      } else {
        loadcellCargoConfirm = 0;
      }
      loadcellEmptyConfirm = 0;
      if (loadcellCargoConfirm >= LOADCELL_CARGO_CONFIRM_SAMPLES) {
        cargoDetected = true;
        loadcellGram  = filteredGram;
      } else {
        loadcellGram = 0;
      }
    } else {
      loadcellGram = filteredGram;
      if (filteredGram < LOADCELL_CARGO_OFF_GRAM) {
        if (loadcellEmptyConfirm < LOADCELL_EMPTY_CONFIRM_SAMPLES) loadcellEmptyConfirm++;
      } else {
        loadcellEmptyConfirm = 0;
      }
      loadcellCargoConfirm = 0;
      if (loadcellEmptyConfirm >= LOADCELL_EMPTY_CONFIRM_SAMPLES) {
        cargoDetected = false;
        loadcellGram  = 0;
      }
    }

    if (cargoDetected != lastCargoDetected) {
      lastCargoDetected   = cargoDetected;
      cargoStateChangedAt = millis();
    }

    static unsigned long lastDebug = 0;
    if (millis() - lastDebug >= 2000) {
      lastDebug = millis();
      Serial.print("HX711: gram="); Serial.print(loadcellGram, 1);
      Serial.print(" cargo="); Serial.println(cargoDetected ? "YES" : "NO");
    }
  }
}

bool tareLoadcell(const char* reason) {
  if (!scale.is_ready()) {
    Serial.print("HX711: TARE gagal"); Serial.println(" - NOT READY");
    return false;
  }
  delay(250);
  loadcellRawOffset = scale.read_average(LOADCELL_TARE_READS);
  scale.set_offset(loadcellRawOffset);
  delay(100);
  loadcellGram        = 0;
  loadcellFilterReady = false;
  cargoDetected       = false;
  lastCargoDetected   = false;
  loadcellCargoConfirm = 0;
  loadcellEmptyConfirm = 0;
  cargoStateChangedAt  = millis() - CARGO_STABLE_MS;
  Serial.print("HX711: TARE OK");
  if (reason) { Serial.print(" ("); Serial.print(reason); Serial.print(")"); }
  Serial.println();
  return true;
}

bool cargoStablePresent() {
  return cargoDetected && (millis() - cargoStateChangedAt >= CARGO_STABLE_MS);
}

bool cargoStableAbsent() {
  return !cargoDetected && (millis() - cargoStateChangedAt >= CARGO_STABLE_MS);
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

  if (mqttClient.connected()) mqttClient.loop();
}

void reconnectMqtt() {
  String clientId      = String(DEVICE_ID) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  String offlinePayload = String("{\"device_id\":\"") + DEVICE_ID + "\",\"online\":false}";

  bool connected = false;
  if (strlen(MQTT_USER) > 0) {
    connected = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWORD,
                                   mqttTopicStatus.c_str(), 0, true, offlinePayload.c_str());
  } else {
    connected = mqttClient.connect(clientId.c_str(), mqttTopicStatus.c_str(), 0, true, offlinePayload.c_str());
  }

  if (connected) {
    mqttClient.subscribe(mqttTopicCmd.c_str());
    String onlinePayload = String("{\"device_id\":\"") + DEVICE_ID + "\",\"online\":true}";
    mqttClient.publish(mqttTopicStatus.c_str(), onlinePayload.c_str(), true);
    kirimState();
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String input;
  input.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++) input += (char)payload[i];
  prosesPerintah(input);
}

// ================= COMMAND =================
void prosesPerintah(String input) {
  input.trim();
  input.toLowerCase();

  if (input == "goto:a" || input == "goto_a") { mulaiMisi(1); return; }
  if (input == "goto:b" || input == "goto_b") { mulaiMisi(2); return; }
  if (input == "goto:c" || input == "goto_c") { mulaiMisi(3); return; }

  if (input == "return" || input == "return_base") {
    if (missionState == SAMPAI) mulaiPulang();
    return;
  }

  if (input == "stop" || input == "emergency_stop") {
    missionState = IDLE; missionTarget = 0;
    waitingAtDest = false; speedBoostKiri = 0; bReturnSearchLine = false;
    resetBlackbox(); stopMotor();
    oledDisplay(EYE_ERROR, "STOP", "Emergency!", "");
    markEvent();
    kirimState();
    return;
  }

  if (input == "forward") {
    missionState = MANUAL; speedBoostKiri = 0;
    majuLurus(baseSpeed);
    oledDisplay(EYE_NEUTRAL, "MANUAL", "Maju", "");
    markEvent();
    kirimState(); return;
  }
  if (input == "backward") {
    missionState = MANUAL; speedBoostKiri = 0;
    setMotors(-baseSpeed, -baseSpeed);
    oledDisplay(EYE_NEUTRAL, "MANUAL", "Mundur", "");
    markEvent();
    kirimState(); return;
  }
  if (input == "left") {
    missionState = MANUAL; speedBoostKiri = 0;
    putarKiri(turnPowerKiri);
    oledDisplay(EYE_LOOK_LEFT, "MANUAL", "Kiri", "");
    markEvent();
    kirimState(); return;
  }
  if (input == "right") {
    missionState = MANUAL; speedBoostKiri = 0;
    putarKanan(turnPowerKanan);
    oledDisplay(EYE_LOOK_RIGHT, "MANUAL", "Kanan", "");
    markEvent();
    kirimState(); return;
  }

  // Tuning lama
  if      (input.startsWith("tk"))  trimKiri              = input.substring(2).toFloat();
  else if (input.startsWith("tn"))  trimKanan             = input.substring(2).toFloat();
  else if (input.startsWith("tb"))  rightTurnBoost        = input.substring(2).toInt();
  else if (input.startsWith("bl"))  bReturnSearchLeftPwm  = input.substring(2).toInt();
  else if (input.startsWith("br"))  bReturnSearchRightPwm = input.substring(2).toInt();
  else if (input.startsWith("bt"))  bReturnSearchMaxMs    = input.substring(2).toInt();
  else if (input.startsWith("ra"))  returnTurnAms         = input.substring(2).toInt();
  else if (input.startsWith("rb"))  returnTurnBms         = input.substring(2).toInt();
  else if (input.startsWith("rc"))  returnTurnCms         = input.substring(2).toInt();
  else if (input.startsWith("cs"))  curveSpeed            = input.substring(2).toInt();
  else if (input.startsWith("ss"))  sharpCurveSpeed       = input.substring(2).toInt();
  else if (input.startsWith("ct"))  curveTurnMin          = input.substring(2).toInt();
  else if (input.startsWith("st"))  sharpTurnMin          = input.substring(2).toInt();

  // Tuning obstacle baru
  else if (input.startsWith("ar"))  avoidTurnRightMs  = input.substring(2).toInt();
  else if (input.startsWith("ap"))  avoidTurnRightPwm = input.substring(2).toInt();
  else if (input.startsWith("af"))  avoidForward1Ms   = input.substring(2).toInt();
  else if (input.startsWith("al"))  avoidTurnLeftMs   = input.substring(2).toInt();
  else if (input.startsWith("aq"))  avoidTurnLeftPwm  = input.substring(2).toInt();
  else if (input.startsWith("ag"))  avoidForward2Ms   = input.substring(2).toInt();

  else if (input.startsWith("p"))   Kp             = input.substring(1).toFloat();
  else if (input.startsWith("d"))   Kd             = input.substring(1).toFloat();
  else if (input.startsWith("s"))   baseSpeed      = input.substring(1).toInt();
  else if (input.startsWith("n"))   speedMin       = input.substring(1).toInt();
  else if (input.startsWith("m"))   maxSpeed       = input.substring(1).toInt();
  else if (input.startsWith("l"))   turnPowerKiri  = input.substring(1).toInt();
  else if (input.startsWith("r"))   turnPowerKanan = input.substring(1).toInt();
  else if (input == "tare") {
    if (tareLoadcell("CMD")) kirimState();
  }
  else if (input.startsWith("c")) {
    float cal = input.substring(1).toFloat();
    if (cal > 0) { loadcellCalibration = cal; scale.set_scale(loadcellCalibration); }
  }

  Serial.print("Kp="); Serial.print(Kp);
  Serial.print(" Kd="); Serial.print(Kd);
  Serial.print(" base="); Serial.print(baseSpeed);
  Serial.print(" avoidR="); Serial.print(avoidTurnRightMs);
  Serial.print("ms/"); Serial.print(avoidTurnRightPwm);
  Serial.print(" fwd1="); Serial.print(avoidForward1Ms);
  Serial.print("ms avoidL="); Serial.print(avoidTurnLeftMs);
  Serial.print("ms/"); Serial.print(avoidTurnLeftPwm);
  Serial.print(" fwd2="); Serial.println(avoidForward2Ms);
}

// ================= STATE & TELEMETRY =================
void kirimState() {
  String payload;
  payload.reserve(260);
  payload += "{\"device_id\":\""; payload += DEVICE_ID;
  payload += "\",\"state\":\""; payload += namaState(missionState); payload += "\"";
  payload += ",\"mission\":"; payload += missionTarget;
  payload += ",\"blackbox_count\":"; payload += blackboxCount;
  payload += ",\"distance_cm\":"; payload += jarakTerakhir;
  payload += ",\"waiting\":"; payload += (waitingAtDest ? "true" : "false");
  payload += ",\"turn\":\"";
  payload += (turnDirection == -1 ? "left" : (turnDirection == 1 ? "right" : "none"));
  payload += "\"";
  payload += ",\"loadcell_g\":"; payload += String(loadcellGram, 1);
  payload += ",\"cargo\":"; payload += (cargoDetected ? "true" : "false");
  payload += ",\"wifi_rssi\":"; payload += (WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0);
  payload += ",\"mqtt\":"; payload += (mqttClient.connected() ? "true" : "false");
  payload += "}";

  if (mqttClient.connected()) mqttClient.publish(mqttTopicState.c_str(), payload.c_str(), true);
}

bool stateCekHalangan() {
  return missionState == KEBERANGKATAN || missionState == PULANG || missionState == MANUAL;
}

const char* namaState(MissionState s) {
  switch (s) {
    case IDLE:            return "IDLE";
    case MENUNGGU_BARANG: return "MENUNGGU_BARANG";
    case KEBERANGKATAN:   return "KEBERANGKATAN";
    case SAMPAI:          return "SAMPAI";
    case PULANG:          return "PULANG";
    case SELESAI:         return "SELESAI";
    case MANUAL:          return "MANUAL";
    default:              return "UNKNOWN";
  }
}

void kirimTelemetry(int vL, int vM, int vR, int irL, int irR, bool blackbox) {
  String payload;
  payload.reserve(420);
  payload += "{\"device_id\":\""; payload += DEVICE_ID;
  payload += "\",\"ms\":"; payload += millis();
  payload += ",\"state\":\""; payload += namaState(missionState); payload += "\"";
  payload += ",\"mission\":"; payload += missionTarget;
  payload += ",\"blackbox_count\":"; payload += blackboxCount;
  payload += ",\"distance_cm\":"; payload += jarakTerakhir;
  payload += ",\"obstacle\":"; payload += ((jarakTerakhir > 0 && jarakTerakhir <= JARAK_HALANGAN_CM) ? "true" : "false");
  payload += ",\"line_left\":"; payload += vL;
  payload += ",\"line_middle\":"; payload += vM;
  payload += ",\"line_right\":"; payload += vR;
  payload += ",\"ir_left\":"; payload += irL;
  payload += ",\"ir_right\":"; payload += irR;
  payload += ",\"blackbox\":"; payload += (blackbox ? "true" : "false");
  payload += ",\"motor_left\":"; payload += motorKiriTerakhir;
  payload += ",\"motor_right\":"; payload += motorKananTerakhir;
  payload += ",\"waiting\":"; payload += (waitingAtDest ? "true" : "false");
  payload += ",\"loadcell_g\":"; payload += String(loadcellGram, 1);
  payload += ",\"cargo\":"; payload += (cargoDetected ? "true" : "false");
  payload += "}";

  if (mqttClient.connected()) mqttClient.publish(mqttTopicTelemetry.c_str(), payload.c_str());
}

// ================= FUNGSI MOTOR =================
void putarKanan(int spd) { setMotors(spd, -spd); }
void putarKiri(int spd)  { setMotors(-spd, spd); }
void majuLurus(int spd)  { setMotors(spd, spd); }

void setMotors(int leftPWM, int rightPWM) {
  motorKiriTerakhir  = leftPWM;
  motorKananTerakhir = rightPWM;

  leftPWM  = constrain(leftPWM,  -255, 255);
  rightPWM = constrain(rightPWM, -255, 255);

  int leftOut  = constrain((int)(abs(leftPWM)  * trimKiri),  0, 255);
  int rightOut = constrain((int)(abs(rightPWM) * trimKanan), 0, 255);

  digitalWrite(IN1, leftPWM  >= 0 ? HIGH : LOW);
  digitalWrite(IN2, leftPWM  >= 0 ? LOW  : HIGH);
  digitalWrite(IN3, rightPWM >= 0 ? HIGH : LOW);
  digitalWrite(IN4, rightPWM >= 0 ? LOW  : HIGH);

  ledcWrite(ENA, leftOut);
  ledcWrite(ENB, rightOut);
}

void stopMotor() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW); digitalWrite(IN4, LOW);
  ledcWrite(ENA, 0); ledcWrite(ENB, 0);
  motorKiriTerakhir = 0; motorKananTerakhir = 0;
}
