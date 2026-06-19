// XORA AGV — Mission-Based Firmware
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
#include <WiFiManager.h>        // AP portal untuk config WiFi tanpa compile ulang
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <FluxGarage_RoboEyes.h> // RoboEyes library — mata ekspresif animasi
#include <ESP32Servo.h>
#include <HX711.h>

// ================= MQTT (WiFi via WiFiManager, tidak hardcoded) =================
// Domain xora.web.id dipakai untuk web dashboard. MQTT tetap lewat public broker
// karena port 1883 VPS tidak dibuka oleh provider/panel.
// IPv4 test.mosquitto.org dipakai agar VPS tidak nyangkut di resolusi IPv6.
const char* MQTT_HOST     = "54.36.178.49";
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

unsigned long mqttReconnectTimer = 0;

// ================= OLED =================
#define OLED_WIDTH  128
#define OLED_HEIGHT 64
Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);

// ================= ROBOEYES (FluxGarage Library) =================
RoboEyes<Adafruit_SSD1306> eyes(display);  // Instance RoboEyes dengan display SSD1306

// ================= OLED DISPLAY MODE =================
// Prinsip: TIDAK PERNAH tampilkan mata + text bersamaan.
// Mata = full screen. Text = full screen. Exclusive.

enum OledMode {
  OLED_BOOT_TEXT,    // Boot: text saja
  OLED_EYES,         // Idle: mata besar (default)
  OLED_EYES_MOOD,    // Ekspresi sementara (happy/confused/angry), lalu balik ke EYES
  OLED_TEXT           // Text mission/status, tanpa mata
};

OledMode oledMode = OLED_BOOT_TEXT;

// Mood sementara (auto-revert ke default)
enum TempMood { TEMP_MOOD_NONE, TEMP_MOOD_HAPPY, TEMP_MOOD_CONFUSED, TEMP_MOOD_SURPRISED, TEMP_MOOD_ANGRY };
TempMood currentTempMood = TEMP_MOOD_NONE;
unsigned long tempMoodStartedAt = 0;
const unsigned long TEMP_MOOD_DURATION_MS = 2500;

// Text display
String textLine1 = "";
String textLine2 = "";
String textLine3 = "";

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

int turnPowerKiri  = 245;
int turnPowerKanan = 245;

// ================= OBSTACLE — PARAMETER SEDERHANA =================
#define JARAK_HALANGAN_CM 25
const unsigned long OBSTACLE_COOLDOWN_MS = 1200;

int avoidTurnRightMs   = 500;
int avoidTurnRightPwm  = 205;

int avoidForward1Ms    = 900;
int avoidForward1Spd   = 145;

int avoidTurnLeftMs    = 800;
int avoidTurnLeftPwm   = 215;

int avoidForward2Ms    = 650;
int avoidForward2Spd   = 145;

int obstacleServoStepDeg   = 10;
int obstacleServoStepDelayMs = 18;

unsigned long obstacleCooldownUntil = 0;

// ================= RETURN TURN =================
int returnTurnAms = 750;
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
  MANUAL,
  MENUNGGU_BARANG_JEMPUT   // Pickup: tunggu barang di titik tujuan
};

MissionState missionState = IDLE;

int missionTarget  = 0;
int blackboxCount  = 0;
int turnDirection  = 0;
bool missionIsPickup = false;  // true = penjemputan, false = pengantaran

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

// ================= ALIVE MODE =================
// Mode "hidup" — AGV bergerak natural saat idle
// Trigger: MQTT "alive:on" / "alive:off"
bool aliveMode = false;

enum AliveState {
  ALIVE_IDLE,              // Diam, tunggu inisiasi
  ALIVE_TURN_RIGHT,        // Belok kanan sedikit
  ALIVE_PAUSE_1,           // Diam 5 detik, servo gerak
  ALIVE_RETURN_CENTER_1,   // Kembali ke posisi tengah
  ALIVE_TURN_LEFT,         // Belok kiri sedikit
  ALIVE_MAJU,              // Maju sedikit
  ALIVE_PAUSE_2,           // Diam 5 detik, servo gerak
  ALIVE_RETURN_CENTER_2,   // Kembali ke posisi tengah
  ALIVE_PAUSE_3,           // Diam 5 detik, servo gerak
  ALIVE_REST               // Diam sebentar sebelum ulang
};

AliveState aliveState = ALIVE_IDLE;
unsigned long aliveStateAt = 0;
unsigned long aliveServoLastMove = 0;
int aliveServoTarget = SERVO_DEPAN;
int aliveServoCurrent = SERVO_DEPAN;
bool aliveServoDirection = true;  // true = ke kanan, false = ke kiri
unsigned long aliveServoStepAt = 0;

const unsigned long ALIVE_TURN_DURATION_MS   = 800;   // Durasi belok
int                 ALIVE_TURN_PWM           = 140;   // Power belok alive
const unsigned long ALIVE_MAJU_DURATION_MS   = 600;   // Durasi maju
int                 ALIVE_MAJU_PWM           = 115;   // Power maju alive
const unsigned long ALIVE_PAUSE_DURATION_MS  = 5000;  // Diam 5 detik sambil servo gerak
const unsigned long ALIVE_REST_DURATION_MS   = 3000;  // Diam sebelum ulang
const unsigned long ALIVE_SERVO_INTERVAL_MS  = 1500;  // Servo gerak tiap 1.5 detik
const unsigned long ALIVE_SERVO_STEP_MS      = 15;    // Delay antar step servo (non-blocking)
const int           ALIVE_SERVO_RANGE        = 30;    // Servo belok ±30° dari tengah
const int           ALIVE_SERVO_STEP_DEG     = 2;     // Derajat per step servo

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

// OLED mode forward declarations
void setOledMode(OledMode mode);
void setOledMood(TempMood mood);
void setOledText(String l1, String l2, String l3);
void updateTempMood();
void updateAliveMode();
void aliveOff();

// ================================================
void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println();
  Serial.println("=== XORA AGV BOOT ===");

  // --- OLED init dulu agar WiFi portal bisa tampil ---
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED: init failed");
  } else {
    display.clearDisplay();
    display.display();
    // Init RoboEyes library — mata besar animasi
    eyes.setFramerate(20);           // 20 FPS untuk animasi smooth
    eyes.setAutoblinker(ON, 3, 2);  // Auto-blink: ON, interval 3-5 detik
    eyes.setMood(DEFAULT);           // Mood default = netral
    eyes.setIdleMode(ON, 2, 4);     // Idle look: ON, interval 2-4 detik
  }

  // --- WiFi via WiFiManager (AP Portal) ---
  setOledMode(OLED_BOOT_TEXT);
  setOledText("XORA AGV", "Connecting WiFi...", "");
  updateDisplay();

  WiFiManager wm;
  wm.setConfigPortalTimeout(180);  // Portal timeout 3 menit

  // Callback saat portal aktif
  wm.setAPCallback([](WiFiManager* mgr) {
    setOledMode(OLED_BOOT_TEXT);
    setOledText("WiFi Setup", "Hubungkan ke:", mgr->getConfigPortalSSID().c_str());
    updateDisplay();
  });

  // Auto-connect, gagal → buka AP portal
  if (!wm.autoConnect("XORA-AGV-Setup")) {
    setOledMode(OLED_BOOT_TEXT);
    setOledText("WiFi GAGAL", "Restarting...", "");
    updateDisplay();
    delay(2000);
    ESP.restart();
  }

  // WiFi connected
  setOledMode(OLED_BOOT_TEXT);
  setOledText("WiFi OK!", WiFi.localIP().toString().c_str(), "");
  updateDisplay();
  delay(1500);

  // --- MQTT ---
  setupJaringan();

  // --- Hardware ---
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

  // Boot: text saja
  setOledMode(OLED_BOOT_TEXT);
  setOledText("SIAP", "Kalibrasi sensor...", "");
  updateDisplay();
  buzzerBeep(200);
  delay(2000);

  for (int i = 0; i < 10; i++) {
    jarakTerakhir = bacaJarak();
    if (jarakTerakhir < 999) break;
    delay(300);
  }

  delay(1000);

  // Boot selesai → masuk mode idle (mata)
  setOledMode(OLED_EYES);
  kirimState();

  Serial.println("=== XORA AGV READY ===");
  Serial.println("Tuning obstacle baru (jalur lurus):");
  Serial.println("ar500 = avoidTurnRightMs");
  Serial.println("ap205 = avoidTurnRightPwm");
  Serial.println("af700 = avoidForward1Ms");
  Serial.println("al500 = avoidTurnLeftMs");
  Serial.println("aq215 = avoidTurnLeftPwm");
  Serial.println("ag800 = avoidForward2Ms");
  Serial.println("au140 = aliveTurnPwm");
  Serial.println("am115 = aliveMajuPwm");
}

// ================================================
void loop() {
  jagaJaringan();

  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    prosesPerintah(input);
  }

  bacaLoadcell();

  // Update OLED display
  updateTempMood();
  updateDisplay();

  // Alive mode (hanya saat idle dan tidak ada misi)
  if (aliveMode && missionState == IDLE) {
    updateAliveMode();
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
      setOledMood(TEMP_MOOD_SURPRISED);
      setOledText("HALANGAN!", String(jarakTerakhir) + " cm", "Menghindar...");
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
      // Saat idle tanpa alive mode → tampilkan mata netral
      if (!aliveMode && oledMode != OLED_EYES) {
        setOledMode(OLED_EYES);
      }
      break;

    case MENUNGGU_BARANG:
      stopMotor();
      if (cargoStablePresent()) {
        buzzerBeep(200);
        // Barang terdeteksi → mata senang dulu, lalu text
        String nama = (missionTarget == 1) ? "A" : (missionTarget == 2) ? "B" : "C";
        setOledMood(TEMP_MOOD_HAPPY);
        setOledText("BARANG ADA!", "Ke titik " + nama, "Berangkat!");
        missionState = KEBERANGKATAN;
        kirimState();
      } else {
        // Menunggu barang → mata bingung (full screen eyes, tanpa text)
        static unsigned long lastCargoWaitRefresh = 0;
        if (millis() - lastCargoWaitRefresh >= 300) {
          lastCargoWaitRefresh = millis();
          if (oledMode != OLED_EYES_MOOD) {
            setOledMood(TEMP_MOOD_CONFUSED);
          }
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
        // Sampai tujuan → mata senang dulu
        setOledMood(TEMP_MOOD_HAPPY);
        kirimState();
        break;
      }

      followLine(vL, vM, vR, irL, irR);
      break;

    case SAMPAI:
      stopMotor();

      // Pickup mode: langsung masuk state tunggu barang jemput
      if (missionIsPickup) {
        missionState = MENUNGGU_BARANG_JEMPUT;
        setOledMood(TEMP_MOOD_CONFUSED);
        kirimState();
        break;
      }

      // Delivery mode: tunggu barang diangkat
      if (waitingAtDest) {
        if (!cargoStableAbsent()) {
          // Menunggu barang diambil → mata netral (menunggu)
          static unsigned long lastDestRefresh = 0;
          if (millis() - lastDestRefresh >= 500) {
            lastDestRefresh = millis();
            if (oledMode != OLED_EYES_MOOD) {
              setOledMode(OLED_EYES);  // Mata netral menunggu
            }
          }
        } else {
          if (arrivedTimer == 0) {
            arrivedTimer = millis();
            // Barang diambil → mata senang
            setOledMood(TEMP_MOOD_HAPPY);
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

            // Text: belok
            setOledMode(OLED_TEXT);
            setOledText("BELOK", (turnDirection == 1) ? "Kanan" : "Kiri", "");

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
            // Text: pulang
            setOledMode(OLED_TEXT);
            setOledText("PULANG", "Ke base...", "");
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
          setOledMode(OLED_TEXT);
          setOledText("PULANG B", "Cari garis", "kanan...");
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
        // Sampai base → mata senang
        setOledMood(TEMP_MOOD_HAPPY);
        kirimState();
        break;
      }

      followLine(vL, vM, vR, irL, irR);
      break;

    case MENUNGGU_BARANG_JEMPUT:
      stopMotor();
      if (cargoStablePresent()) {
        buzzerBeep(200);
        setOledMood(TEMP_MOOD_HAPPY);
        setOledText("BARANG ADA!", "Pulang ke base", "");

        // Tunggu sebentar lalu pulang
        delay(WAIT_AT_DEST_MS);

        // Clear station marker jika bukan A
        if (missionTarget != 1) {
          majuLurus(baseSpeed);
          int majuMs = (missionTarget == 3) ? 200 : 400;
          delay(majuMs);
          stopMotor();
          delay(100);
        }

        // Belok balik
        setOledMode(OLED_TEXT);
        setOledText("BELOK", (turnDirection == 1) ? "Kanan" : "Kiri", "");
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
        setOledMode(OLED_TEXT);
        setOledText("PULANG", "Ke base...", "");
      } else {
        // Menunggu barang ditaruh → mata bingung
        static unsigned long lastJemputRefresh = 0;
        if (millis() - lastJemputRefresh >= 300) {
          lastJemputRefresh = millis();
          if (oledMode != OLED_EYES_MOOD) {
            setOledMood(TEMP_MOOD_CONFUSED);
          }
        }
      }
      break;

    case SELESAI:
      stopMotor();
      // Selesai → mata senang/neutral
      if (oledMode != OLED_EYES_MOOD) {
        setOledMode(OLED_EYES);
      }
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
    Serial.print("g HX="); Serial.print(scale.is_ready() ? "OK" : "FAIL");
    Serial.print(" Alive="); Serial.println(aliveMode ? "ON" : "OFF");
  }

  delay(2);
}

// ================= ALIVE MODE — GERAKAN NATURAL =================
// AGV bergerak lucu saat idle: belok kanan-diam-belok kiri-diam
// Trigger dari web: MQTT "alive:on" / "alive:off"
void updateAliveMode() {
  unsigned long now = millis();

  // Helper: gerakkan servo satu step non-blocking
  // Return true jika masih bergerak, false jika sudah sampai target
  auto servoStepNonBlocking = [&](int target) -> bool {
    if (now - aliveServoStepAt < ALIVE_SERVO_STEP_MS) return true;
    aliveServoStepAt = now;
    aliveServoCurrent = servoScan.read();
    if (aliveServoCurrent == target) return false;
    int step = (target > aliveServoCurrent) ? ALIVE_SERVO_STEP_DEG : -ALIVE_SERVO_STEP_DEG;
    int next = aliveServoCurrent + step;
    // Clamp ke target
    if ((step > 0 && next > target) || (step < 0 && next < target)) next = target;
    servoScan.write(next);
    return true;
  };

  switch (aliveState) {
    case ALIVE_IDLE:
      // Mulai sekuens: belok kanan sedikit
      aliveState = ALIVE_TURN_RIGHT;
      aliveStateAt = now;
      setMotors(ALIVE_TURN_PWM, -ALIVE_TURN_PWM);  // Belok kanan pelan
      setOledMode(OLED_EYES);
      break;

    case ALIVE_TURN_RIGHT:
      if (now - aliveStateAt >= ALIVE_TURN_DURATION_MS) {
        stopMotor();
        aliveState = ALIVE_PAUSE_1;
        aliveStateAt = now;
        aliveServoLastMove = 0;
        aliveServoTarget = SERVO_DEPAN + ALIVE_SERVO_RANGE;
        aliveServoDirection = true;
        aliveServoStepAt = now;
      }
      break;

    case ALIVE_PAUSE_1:
      // Diam 5 detik sambil servo gerak natural (NON-BLOCKING)
      if (now - aliveServoLastMove >= ALIVE_SERVO_INTERVAL_MS && aliveServoLastMove != 0) {
        // Ganti target servo
        aliveServoTarget = aliveServoDirection ? (SERVO_DEPAN + ALIVE_SERVO_RANGE) : (SERVO_DEPAN - ALIVE_SERVO_RANGE);
        aliveServoDirection = !aliveServoDirection;
        aliveServoLastMove = now;
        aliveServoStepAt = now;
      }
      if (aliveServoLastMove == 0) {
        // Pertama kali masuk state ini
        aliveServoLastMove = now;
        aliveServoStepAt = now;
      }
      // Servo gerak satu step (non-blocking)
      servoStepNonBlocking(aliveServoTarget);
      if (now - aliveStateAt >= ALIVE_PAUSE_DURATION_MS) {
        aliveState = ALIVE_RETURN_CENTER_1;
        aliveStateAt = now;
      }
      break;

    case ALIVE_RETURN_CENTER_1:
      // Kembali ke posisi tengah (NON-BLOCKING)
      if (!servoStepNonBlocking(SERVO_DEPAN)) {
        // Servo sudah di tengah, mulai belok kiri
        aliveState = ALIVE_TURN_LEFT;
        aliveStateAt = now;
        setMotors(-ALIVE_TURN_PWM, ALIVE_TURN_PWM);  // Belok kiri pelan
      }
      break;

    case ALIVE_TURN_LEFT:
      // Belok kiri saja
      if (now - aliveStateAt >= ALIVE_TURN_DURATION_MS) {
        // Setelah belok, maju lurus
        aliveState = ALIVE_MAJU;
        aliveStateAt = now;
        setMotors(ALIVE_MAJU_PWM, ALIVE_MAJU_PWM);   // Maju pelan
      }
      break;

    case ALIVE_MAJU:
      // Maju sedikit
      if (now - aliveStateAt >= ALIVE_MAJU_DURATION_MS) {
        stopMotor();
        aliveState = ALIVE_PAUSE_2;
        aliveStateAt = now;
        aliveServoLastMove = 0;
        aliveServoDirection = false;
        aliveServoStepAt = now;
      }
      break;

    case ALIVE_PAUSE_2:
      // Diam 5 detik sambil servo gerak (NON-BLOCKING)
      if (now - aliveServoLastMove >= ALIVE_SERVO_INTERVAL_MS && aliveServoLastMove != 0) {
        aliveServoTarget = aliveServoDirection ? (SERVO_DEPAN + ALIVE_SERVO_RANGE) : (SERVO_DEPAN - ALIVE_SERVO_RANGE);
        aliveServoDirection = !aliveServoDirection;
        aliveServoLastMove = now;
        aliveServoStepAt = now;
      }
      if (aliveServoLastMove == 0) {
        aliveServoLastMove = now;
        aliveServoStepAt = now;
      }
      servoStepNonBlocking(aliveServoTarget);
      if (now - aliveStateAt >= ALIVE_PAUSE_DURATION_MS) {
        aliveState = ALIVE_RETURN_CENTER_2;
        aliveStateAt = now;
      }
      break;

    case ALIVE_RETURN_CENTER_2:
      // Kembali ke posisi tengah (NON-BLOCKING)
      if (!servoStepNonBlocking(SERVO_DEPAN)) {
        aliveState = ALIVE_PAUSE_3;
        aliveStateAt = now;
        aliveServoLastMove = 0;
        aliveServoDirection = true;
        aliveServoStepAt = now;
      }
      break;

    case ALIVE_PAUSE_3:
      // Diam 5 detik terakhir sambil servo gerak halus (NON-BLOCKING)
      if (now - aliveServoLastMove >= ALIVE_SERVO_INTERVAL_MS && aliveServoLastMove != 0) {
        int halfRange = ALIVE_SERVO_RANGE / 2;
        aliveServoTarget = aliveServoDirection ? (SERVO_DEPAN + halfRange) : (SERVO_DEPAN - halfRange);
        aliveServoDirection = !aliveServoDirection;
        aliveServoLastMove = now;
        aliveServoStepAt = now;
      }
      if (aliveServoLastMove == 0) {
        aliveServoLastMove = now;
        aliveServoStepAt = now;
      }
      servoStepNonBlocking(aliveServoTarget);
      if (now - aliveStateAt >= ALIVE_PAUSE_DURATION_MS) {
        aliveState = ALIVE_REST;
        aliveStateAt = now;
      }
      break;

    case ALIVE_REST:
      // Diam sebentar sebelum ulang sekuens
      servoScan.write(SERVO_DEPAN);
      if (now - aliveStateAt >= ALIVE_REST_DURATION_MS) {
        aliveState = ALIVE_IDLE;  // Ulang sekuens
      }
      break;
  }
}

void aliveOff() {
  aliveMode = false;
  aliveState = ALIVE_IDLE;
  stopMotor();
  servoScan.write(SERVO_DEPAN);
}

// ================= OBSTACLE — LOGIC SEDERHANA =================
void scanDanHindari() {
  // Servo sweep
  setOledMode(OLED_TEXT);
  setOledText("HALANGAN", "Scan servo", "0->180->90");
  servoKe(SERVO_KANAN, 120);
  for (int s = SERVO_KANAN; s <= SERVO_KIRI; s += obstacleServoStepDeg) {
    servoScan.write(s);
    delay(obstacleServoStepDelayMs);
  }
  servoKe(SERVO_KIRI, 80);
  servoKe(SERVO_DEPAN, 120);

  // Step 1: Putar kanan
  setOledMode(OLED_TEXT);
  setOledText("HINDARI", "Putar kanan", "");
  putarKanan(avoidTurnRightPwm);
  delay(avoidTurnRightMs);
  stopMotor();
  delay(150);

  // Step 2: Maju lurus
  setOledMode(OLED_TEXT);
  setOledText("HINDARI", "Maju...", "");
  majuLurus(avoidForward1Spd);
  delay(avoidForward1Ms);
  stopMotor();
  delay(150);

  // Step 3: Putar kiri
  setOledMode(OLED_TEXT);
  setOledText("HINDARI", "Putar kiri", "");
  putarKiri(avoidTurnLeftPwm);
  delay(avoidTurnLeftMs);
  stopMotor();
  delay(150);

  // Step 4: Maju cari garis
  setOledMode(OLED_TEXT);
  setOledText("HINDARI", "Cari garis...", "");
  majuLurus(avoidForward2Spd);
  delay(avoidForward2Ms);
  stopMotor();
  delay(100);

  lastError    = 0;
  lastLineSide = 0;
  jarakTerakhir = 999;

  setOledMode(OLED_TEXT);
  setOledText("LANJUT", "Follow line", "");
  Serial.println("HINDARI selesai, lanjut follow line");
}

// ================= MISSION CONTROL =================
void mulaiMisi(int target) {
  // Matikan alive mode saat ada misi
  if (aliveMode) aliveOff();

  missionTarget  = target;
  missionIsPickup = false;  // Pengantaran mode
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
    // Mata bingung (full screen, tanpa text)
    setOledMood(TEMP_MOOD_CONFUSED);
    kirimState();
    return;
  }

  missionState = KEBERANGKATAN;
  // Mata senang dulu, lalu text
  setOledMood(TEMP_MOOD_HAPPY);
  setOledText("MISI", "Ke titik " + nama, "Berangkat!");
  kirimState();
}

// ================= PICKUP MODE =================
void mulaiMisiJemput(int target) {
  if (aliveMode) aliveOff();

  missionTarget   = target;
  missionIsPickup = true;
  resetBlackbox();
  lastError      = 0;
  lastLineSide   = 0;
  waitingAtDest  = false;
  bReturnSearchLine = false;
  turnDirection  = (target == 2) ? 1 : -1;
  speedBoostKiri = 0;

  String nama = (target == 1) ? "A" : (target == 2) ? "B" : "C";

  // Langsung berangkat — tidak tunggu barang di base
  missionState = KEBERANGKATAN;
  setOledMood(TEMP_MOOD_HAPPY);
  setOledText("JEMPUT", "Ke titik " + nama, "Jalan!");
  kirimState();
}

void mulaiPulang() {
  resetBlackbox();
  lastError    = 0;
  lastLineSide = 0;

  if (turnDirection == 0) turnDirection = (missionTarget == 2) ? 1 : -1;

  // Text: belok
  setOledMode(OLED_TEXT);
  setOledText("BELOK", (turnDirection == 1) ? "Kanan 90" : "Kiri 90", "");

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
  // Text: pulang
  setOledMode(OLED_TEXT);
  setOledText("PULANG", "Ke base...", "");
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

// ================= OLED DISPLAY SYSTEM =================
// Menggunakan FluxGarage RoboEyes library.
// Prinsip: TIDAK PERNAH tampilkan mata + text bersamaan.
// Mata = full screen. Text = full screen. Exclusive.

void setOledMode(OledMode mode) {
  oledMode = mode;
}

void setOledMood(TempMood mood) {
  // Set mood sementara via RoboEyes library
  switch (mood) {
    case TEMP_MOOD_HAPPY:
      eyes.setMood(HAPPY);
      break;
    case TEMP_MOOD_CONFUSED:
      eyes.setMood(TIRED);
      break;
    case TEMP_MOOD_SURPRISED:
      eyes.setMood(ANGRY);
      break;
    case TEMP_MOOD_ANGRY:
      eyes.setMood(ANGRY);
      break;
    default:
      eyes.setMood(DEFAULT);
      break;
  }
  currentTempMood = mood;
  tempMoodStartedAt = millis();
  oledMode = OLED_EYES_MOOD;
}

void setOledText(String l1, String l2, String l3) {
  textLine1 = l1;
  textLine2 = l2;
  textLine3 = l3;
  oledMode = OLED_TEXT;
}

void updateTempMood() {
  // Auto-revert mood sementara ke default setelah durasi
  if (currentTempMood != TEMP_MOOD_NONE &&
      millis() - tempMoodStartedAt >= TEMP_MOOD_DURATION_MS) {
    currentTempMood = TEMP_MOOD_NONE;
    eyes.setMood(DEFAULT);
    if (oledMode == OLED_EYES_MOOD) {
      oledMode = OLED_EYES;  // Kembali ke mata netral
    }
  }
}

void drawOledText() {
  // Gambar text full screen (tanpa mata)
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Line 1 — center, font besar
  display.setTextSize(2);
  int16_t x1, y1;
  uint16_t w, h;

  display.getTextBounds(textLine1, 0, 0, &x1, &y1, &w, &h);
  display.setCursor((OLED_WIDTH - w) / 2, 4);
  display.println(textLine1);

  // Line 2 — center, font kecil
  display.setTextSize(1);
  display.getTextBounds(textLine2, 0, 0, &x1, &y1, &w, &h);
  display.setCursor((OLED_WIDTH - w) / 2, 28);
  display.println(textLine2);

  // Line 3 — center, font kecil
  display.getTextBounds(textLine3, 0, 0, &x1, &y1, &w, &h);
  display.setCursor((OLED_WIDTH - w) / 2, 42);
  display.println(textLine3);

  display.display();
}

void updateDisplay() {
  // Refresh display berdasarkan mode
  // RoboEyes library handle rendering mata + animasi (blink, idle look)
  // Kita hanya pilih: mata ATAU text, tidak pernah keduanya

  switch (oledMode) {
    case OLED_BOOT_TEXT:
      // Text boot — kita handle sendiri (clear + draw + display)
      drawOledText();
      break;

    case OLED_EYES:
    case OLED_EYES_MOOD:
      // Mata full screen via RoboEyes library
      // Library handle SEMUA: clear, draw, display, framerate, animasi
      // JANGAN panggil display.clearDisplay() atau display.display() di sini
      // karena library sudah mengatur sendiri internal rendering cycle-nya
      eyes.update();
      break;

    case OLED_TEXT:
      // Text full screen (tanpa mata) — kita handle sendiri
      drawOledText();
      break;
  }
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

  // Power cycle HX711 — reset internal amplifier
  scale.power_down();
  delay(200);
  scale.power_up();
  delay(300);

  // Baca raw average tanpa offset (software tare)
  // Hindari scale.tare() / set_offset() karena bikin HX711 "tidur"
  loadcellRawOffset = scale.read_average(LOADCELL_TARE_READS);

  // Flush ADC — buang beberapa pembacaan pertama
  for (byte i = 0; i < 10; i++) {
    scale.read();
    delay(10);
  }

  loadcellGram        = 0;
  loadcellFilterReady = false;
  cargoDetected       = false;
  lastCargoDetected   = false;
  loadcellCargoConfirm = 0;
  loadcellEmptyConfirm = 0;
  cargoStateChangedAt  = millis() - CARGO_STABLE_MS;
  Serial.print("HX711: TARE OK (offset=");
  Serial.print(loadcellRawOffset);
  if (reason) { Serial.print(" "); Serial.print(reason); }
  Serial.println(")");
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

  // WiFi sudah di-handle oleh WiFiManager di setup()
  // Di sini hanya setup MQTT
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(768);
}

void jagaJaringan() {
  if (WiFi.status() != WL_CONNECTED) {
    // WiFi terputus, WiFiManager akan handle reconnect otomatis
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

  // Pickup mode — langsung jemput tanpa tunggu barang di base
  if (input == "pickup:a" || input == "pickup_a") { mulaiMisiJemput(1); return; }
  if (input == "pickup:b" || input == "pickup_b") { mulaiMisiJemput(2); return; }
  if (input == "pickup:c" || input == "pickup_c") { mulaiMisiJemput(3); return; }

  if (input == "return" || input == "return_base") {
    if (missionState == SAMPAI) mulaiPulang();
    return;
  }

  if (input == "stop" || input == "emergency_stop") {
    missionState = IDLE; missionTarget = 0;
    waitingAtDest = false; speedBoostKiri = 0; bReturnSearchLine = false;
    if (aliveMode) aliveOff();
    resetBlackbox(); stopMotor();
    // Emergency stop → mata kaget
    setOledMood(TEMP_MOOD_SURPRISED);
    kirimState();
    return;
  }

  // Alive mode trigger dari web
  if (input == "alive:on") {
    aliveMode = true;
    aliveState = ALIVE_IDLE;
    setOledMode(OLED_EYES);
    Serial.println("ALIVE MODE: ON");
    kirimState();
    return;
  }
  if (input == "alive:off") {
    aliveOff();
    setOledMode(OLED_EYES);
    Serial.println("ALIVE MODE: OFF");
    kirimState();
    return;
  }

  if (input == "forward") {
    if (aliveMode) aliveOff();
    missionState = MANUAL; speedBoostKiri = 0;
    majuLurus(baseSpeed);
    setOledMode(OLED_TEXT);
    setOledText("MANUAL", "Maju", "");
    kirimState(); return;
  }
  if (input == "backward") {
    if (aliveMode) aliveOff();
    missionState = MANUAL; speedBoostKiri = 0;
    setMotors(-baseSpeed, -baseSpeed);
    setOledMode(OLED_TEXT);
    setOledText("MANUAL", "Mundur", "");
    kirimState(); return;
  }
  if (input == "left") {
    if (aliveMode) aliveOff();
    missionState = MANUAL; speedBoostKiri = 0;
    putarKiri(turnPowerKiri);
    setOledMode(OLED_TEXT);
    setOledText("MANUAL", "Kiri", "");
    kirimState(); return;
  }
  if (input == "right") {
    if (aliveMode) aliveOff();
    missionState = MANUAL; speedBoostKiri = 0;
    putarKanan(turnPowerKanan);
    setOledMode(OLED_TEXT);
    setOledText("MANUAL", "Kanan", "");
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
  else if (input.startsWith("au"))  ALIVE_TURN_PWM    = input.substring(2).toInt();
  else if (input.startsWith("am"))  ALIVE_MAJU_PWM    = input.substring(2).toInt();

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
  Serial.print(" fwd2="); Serial.print(avoidForward2Ms);
  Serial.print(" aliveTurn="); Serial.print(ALIVE_TURN_PWM);
  Serial.print(" aliveMaju="); Serial.println(ALIVE_MAJU_PWM);
}

// ================= STATE & TELEMETRY =================
void kirimState() {
  String payload;
  payload.reserve(300);
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
  payload += ",\"alive_mode\":"; payload += (aliveMode ? "true" : "false");
  payload += ",\"mission_type\":\""; payload += (missionIsPickup ? "PICKUP" : "DELIVERY"); payload += "\"";
  payload += "}";

  if (mqttClient.connected()) mqttClient.publish(mqttTopicState.c_str(), payload.c_str(), true);
}

bool stateCekHalangan() {
  return missionState == KEBERANGKATAN || missionState == PULANG || missionState == MANUAL;
}

const char* namaState(MissionState s) {
  switch (s) {
    case IDLE:                   return "IDLE";
    case MENUNGGU_BARANG:        return "MENUNGGU_BARANG";
    case KEBERANGKATAN:          return "KEBERANGKATAN";
    case SAMPAI:                 return "SAMPAI";
    case PULANG:                 return "PULANG";
    case SELESAI:                return "SELESAI";
    case MANUAL:                 return "MANUAL";
    case MENUNGGU_BARANG_JEMPUT: return "MENUNGGU_BARANG_JEMPUT";
    default:                     return "UNKNOWN";
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
  payload += ",\"alive_mode\":"; payload += (aliveMode ? "true" : "false");
  payload += ",\"mission_type\":\""; payload += (missionIsPickup ? "PICKUP" : "DELIVERY"); payload += "\"";
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
