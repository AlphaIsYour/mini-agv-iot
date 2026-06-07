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

// Logic firmware: hitam = 1, putih = 0.
// Ubah ke true hanya jika sensor tengah terbukti kebalik dari sensor lain.
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
const int PWM_FREQ = 1000;  // 1kHz optimal untuk L298N (BJT-based)
const int PWM_RES  = 8;

// ================= PARAMETER KONTROL =================
// Ini dibuat dekat dengan kode lama, karena kode lama sudah terbukti membaca garis.
int baseSpeed = 145;
int curveSpeed = 145;
int sharpCurveSpeed = 130;
int maxSpeed  = 220;
int speedMin  = 88;
int curveTurnMin = 108;
int sharpTurnMin = 126;

// PID dibuat lebih responsif untuk jalur melengkung.
float Kp = 135.0;
float Kd = 62.0;

float lastError  = 0;
int lastLineSide = 0;
const float FULL_BLACK_MEMORY_GAIN = 0.78;
const float LOST_LINE_ERROR = 3.0;

// Kalibrasi motor.
// Kalau AGV berat belok kiri, biasanya motor kanan/kiri tidak seimbang.
// Nilai ini aman: 1.00 normal, 1.05 = +5%, 0.95 = -5%.
float trimKiri  = 1.00;
float trimKanan = 1.00;

// Boost khusus kondisi tertentu.
int speedBoostKiri = 0;
int rightTurnBoost = 20;  // Max boost roda kiri saat belok kanan (adaptif)

// Fase sederhana khusus pulang dari titik B:
// setelah belok kanan, cari garis dengan arc kanan tetap dulu, baru PID normal.
bool bReturnSearchLine = false;
unsigned long bReturnSearchStartedAt = 0;
unsigned long bReturnSearchMaxMs = 1800;
int bReturnSearchLeftPwm = 150;
int bReturnSearchRightPwm = -80;

// Power belok titik/mission.
int turnPowerKiri  = 220;
int turnPowerKanan = 230;

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

int missionTarget    = 0;   // 0=none, 1=A, 2=B, 3=C
int blackboxCount    = 0;
int turnDirection    = 0;   // -1=left, 1=right

bool waitingAtDest   = false;
unsigned long arrivedTimer = 0;
const unsigned long WAIT_AT_DEST_MS = 3000;

// ================= BLACKBOX & FOLLOW LINE =================
bool blackboxArmed = false;
bool newBlackboxDetected = false;
unsigned long lastBlackboxAt = 0;
unsigned long boxClearStartedAt = 0;
unsigned long boxSeenStartedAt = 0;
const unsigned long BLACKBOX_EXIT_STABLE_MS = 250;
const unsigned long BLACKBOX_ENTER_STABLE_MS = 80;
const unsigned long BLACKBOX_DEBOUNCE_MS = 250;

// ================= OBSTACLE =================
#define JARAK_HALANGAN_CM 25
const int AVOID_TURN_POWER = 175;
const int AVOID_FORWARD_SPEED = 145;
const unsigned long OBSTACLE_COOLDOWN_MS = 1200;
int avoidTurn60Ms = 600;
int avoidTurnLeftMs = 700;   // durasi pivot/arc kiri saat hindari
int avoidForward1Ms = 900;
int avoidForward2Ms = 700;
int avoidLeftInnerPwm = 110; // roda kiri mundur saat balik kiri
int avoidLeftOuterPwm = 210; // roda kanan maju saat balik kiri
int obstacleServoStepDeg = 10;
int obstacleServoStepDelayMs = 18;
int returnTurnAms = 600;
int returnTurnBms = 750;
int returnTurnCms = 650;

unsigned long jarakTimer   = 0;
long jarakTerakhir         = 999;
unsigned long durasiEchoTerakhir = 0;
unsigned long obstacleCooldownUntil = 0;

unsigned long telemetryTimer = 0;
const unsigned long TELEMETRY_INTERVAL_MS = 500;

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
void servoSweepHalangan();
void scanDanHindari();
void oledTulis(String b1, String b2, String b3);
void buzzerBeep(int durasi);
bool tareLoadcell(const char* reason);
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
  delay(2000);  // Tunggu power stabil (penting saat pakai baterai!)
  Serial.println();
  Serial.println("=== XORA AGV BOOT ===");

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
  delay(500);  // Tunggu ultrasonik stabil

  // Buzzer
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // OLED
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED: init failed, lanjut tanpa display");
  } else {
    display.clearDisplay();
    display.display();
  }

  // HX711 Loadcell
  Serial.println("HX711: Init...");
  Serial.print("HX711: DT="); Serial.print(HX711_DT);
  Serial.print(" SCK="); Serial.println(HX711_SCK);

  scale.begin(HX711_DT, HX711_SCK);
  delay(1000);

  // Tunggu HX711 siap
  int hx711Retry = 0;
  while (!scale.is_ready() && hx711Retry < 10) {
    delay(100);
    hx711Retry++;
  }
  Serial.print("HX711: is_ready = ");
  Serial.println(scale.is_ready() ? "YES" : "NO");

  scale.set_scale(loadcellCalibration);
  tareLoadcell("BOOT");
  long raw = scale.read();
  Serial.print("HX711: raw read = ");
  Serial.println(raw);

  stopMotor();
  oledTulis("SIAP", "Kalibrasi", "sensor...");
  buzzerBeep(200);

  // Warm-up sensor — baca beberapa kali untuk stabilisasi
  // Tunggu lebih lama karena WiFi baru selesai connect
  delay(2000);

  for (int i = 0; i < 10; i++) {
    jarakTerakhir = bacaJarak();
    Serial.print("Ultrasonik warm-up #");
    Serial.print(i + 1);
    Serial.print(": ");
    Serial.print(jarakTerakhir);
    Serial.println(" cm");
    if (jarakTerakhir < 999) break;  // sudah dapat sinyal
    delay(300);
  }

  if (jarakTerakhir >= 999) {
    Serial.println("Ultrasonik: GAGAL — cek kabel TRIG/ECHO dan VCC!");
    // Reset pin dan coba lagi
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);
    digitalWrite(TRIG_PIN, LOW);
    delay(500);
    jarakTerakhir = bacaJarak();
    Serial.print("Ultrasonik retry: ");
    Serial.print(jarakTerakhir);
    Serial.println(" cm");
  }

  delay(1000);
  oledTulis("IDLE", "Siap terima", "perintah");
  kirimState();

  Serial.println("=== XORA AGV STABLE VERSION READY ===");
  Serial.println("Tuning serial:");
  Serial.println("s145 = baseSpeed");
  Serial.println("cs145 = curveSpeed");
  Serial.println("ss130 = sharpCurveSpeed");
  Serial.println("p135 = Kp");
  Serial.println("d62  = Kd");
  Serial.println("n88  = speedMin");
  Serial.println("ct108 = curveTurnMin");
  Serial.println("st126 = sharpTurnMin");
  Serial.println("m220 = maxSpeed");
  Serial.println("l220 = turnPowerKiri");
  Serial.println("r230 = turnPowerKanan");
  Serial.println("tk1.00 = trimKiri");
  Serial.println("tn1.00 = trimKanan");
  Serial.println("tb25 = rightTurnBoost");
  Serial.println("bl150/br-80/bt1800 = cari garis pulang B");
  Serial.println("ra1250/rb1250/rc1150 = durasi belok pulang A/B/C");
  Serial.println("av1050/al1200 = obstacle belok kanan/kiri");
  Serial.println("af850/ag820 = obstacle maju 1/2");
  Serial.println("ai110/ao210 = obstacle balik kiri");
  Serial.println("os10/od18 = servo sweep halangan");
}

// ================================================
void loop() {
  jagaJaringan();

  // ===== LIVE TUNING via Serial =====
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    prosesPerintah(input);
  }

  // ===== BACA LOADCELL =====
  bacaLoadcell();

  // ===== BACA ULTRASONIK TERUS =====
  if (millis() - jarakTimer >= 300) {
    jarakTimer    = millis();
    jarakTerakhir = bacaJarak();

    // Auto-recovery: kalau gagal terus, re-init pin
    if (jarakTerakhir >= 999) {
      static int failCount = 0;
      failCount++;
      if (failCount >= 5) {
        failCount = 0;
        Serial.println("Ultrasonic: Re-init pin...");
        pinMode(TRIG_PIN, OUTPUT);
        pinMode(ECHO_PIN, INPUT);
        digitalWrite(TRIG_PIN, LOW);
        delay(100);
      }
    }
  }

  // ===== BACA SENSOR GARIS =====
  int vL  = digitalRead(S_KIRI);
  int vM  = bacaSensorTengah();
  int vR  = digitalRead(S_KANAN);
  int irL = digitalRead(IR_KIRI);
  int irR = digitalRead(IR_KANAN);

  bool blackbox = (vL == 1 && vM == 1 && vR == 1 && irL == 1 && irR == 1);

  // ===== CEK HALANGAN =====
  if (stateCekHalangan() && millis() >= obstacleCooldownUntil) {
    if (jarakTerakhir > 0 && jarakTerakhir <= JARAK_HALANGAN_CM) {
      stopMotor();
      buzzerBeep(300);
      oledTulis("HALANGAN!", String(jarakTerakhir) + " cm", "Scan...");
      jarakTerakhir = 999;
      scanDanHindari();
      obstacleCooldownUntil = millis() + OBSTACLE_COOLDOWN_MS;
      lastError = 0;
      lastLineSide = 0;
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
  Serial.print(irR);
  Serial.print(" | M: ");
  Serial.print(motorKiriTerakhir);
  Serial.print(" ");
  Serial.println(motorKananTerakhir);

  // ===== STATE MACHINE =====
  switch (missionState) {

    case IDLE:
      stopMotor();
      break;

    case MENUNGGU_BARANG:
      stopMotor();
      // Cek loadcell terus — kalau barang ditaruh, langsung berangkat
      if (cargoStablePresent()) {
        buzzerBeep(200);
        String nama = (missionTarget == 1) ? "A" : (missionTarget == 2) ? "B" : "C";
        oledTulis("BARANG ADA", "Ke titik " + nama, "Berangkat!");
        missionState = KEBERANGKATAN;
        kirimState();
        Serial.println("Barang terdeteksi — berangkat!");
      }
      break;

    case KEBERANGKATAN:
      hitungBlackbox(blackbox);

      if (newBlackboxDetected && blackboxCount == missionTarget) {
        stopMotor();
        buzzerBeep(200);

        missionState   = SAMPAI;
        waitingAtDest  = true;
        arrivedTimer   = 0;  // 0 = barang belum diambil

        oledTulis("SAMPAI!", "Tujuan " + String(missionTarget), "Tunggu barang...");
        kirimState();

        Serial.print("SAMPAI di titik ");
        Serial.println(missionTarget);
        break;
      }

      followLine(vL, vM, vR, irL, irR);
      break;

    case SAMPAI:
      stopMotor();

      // Tunggu barang diambil dulu
      if (waitingAtDest) {
        if (!cargoStableAbsent()) {
          // Masih ada barang — tampilkan di OLED
          oledTulis("SAMPAI!", "Barang: " + String(loadcellGram, 0) + "g", "Tunggu diambil...");
        } else {
          // Barang sudah diambil — tunggu 3 detik lalu pulang
          if (arrivedTimer == 0) {
            arrivedTimer = millis();
            oledTulis("BARANG DIAMBIL", "Tunggu 3dtk...", "");
            buzzerBeep(200);
            Serial.println("Barang diambil — mulai hitung 3 detik");
          }

          if (millis() - arrivedTimer >= WAIT_AT_DEST_MS) {
            waitingAtDest = false;

            // Maju sedikit hanya untuk titik B dan C.
            if (missionTarget != 1) {
              oledTulis("MAJU", "Sedikit...", "");
              majuLurus(baseSpeed);

              int majuMs = (missionTarget == 3) ? 200 : 400;
              delay(majuMs);

              stopMotor();
              delay(100);
            }

            oledTulis("BELOK", (turnDirection == 1) ? "Kanan" : "Kiri", "");

            if (turnDirection == 1) {
              putarKanan(turnPowerKanan);
            } else {
              putarKiri(turnPowerKiri);
            }

            int turnMs = durasiBelokPulang();
            delay(turnMs);

            stopMotor();
            delay(200);

            resetBlackbox();
            lastError = 0;
            lastLineSide = 0;
            speedBoostKiri = 0;
            if (missionTarget == 2) {
              mulaiCariGarisPulangB();
            } else {
              bReturnSearchLine = false;
            }

            // Khusus B: cari garis dengan arc kanan dulu, lalu PID normal.

            missionState = PULANG;
            kirimState();
            oledTulis("PULANG", "Ke base...", "");

            Serial.println("Auto pulang setelah barang diambil");
          }
        }
      }
      break;

    case PULANG:
      if (bReturnSearchLine) {
        bool anyLineSensor = (irL == 1 || vL == 1 || vM == 1 || vR == 1 || irR == 1);
        bool lineSeen = anyLineSensor && !blackbox;
        bool searchTimeout = (millis() - bReturnSearchStartedAt >= bReturnSearchMaxMs);

        if (!lineSeen && !searchTimeout) {
          setMotors(bReturnSearchLeftPwm, bReturnSearchRightPwm);
          oledTulis("PULANG B", "Cari garis", "kanan...");
          break;
        }

        bReturnSearchLine = false;
        stopMotor();
        delay(80);
        lastError = 0;
        lastLineSide = 1;
      }

      hitungBlackbox(blackbox);

      if (newBlackboxDetected && blackboxCount >= 1) {
        stopMotor();
        buzzerBeep(200);
        bReturnSearchLine = false;

        missionState = SELESAI;
        oledTulis("PULANG!", "Sampai base", ":)");
        kirimState();

        Serial.println("SAMPAI BASE!");
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

  // ===== KIRIM TELEMETRY =====
  if (millis() - telemetryTimer >= TELEMETRY_INTERVAL_MS) {
    telemetryTimer = millis();
    kirimTelemetry(vL, vM, vR, irL, irR, blackbox);
  }

  // ===== HEARTBEAT (setiap 5 detik) =====
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

// ================= MISSION CONTROL =================
void mulaiMisi(int target) {
  missionTarget    = target;
  resetBlackbox();
  lastError        = 0;
  lastLineSide     = 0;
  waitingAtDest    = false;
  bReturnSearchLine = false;

  // A=left, B=right, C=left
  turnDirection    = (target == 2) ? 1 : -1;
  speedBoostKiri   = 0;

  String nama = (target == 1) ? "A" : (target == 2) ? "B" : "C";

  // Cek loadcell — kalau tidak ada barang, tunggu dulu
  loadcellTimer = 0;
  bacaLoadcell();
  if (!cargoStablePresent()) {
    missionState = MENUNGGU_BARANG;
    oledTulis("MISI " + nama, "Tunggu barang", "ditaruh...");
    kirimState();
    Serial.println("MISI " + nama + " — menunggu barang di loadcell");
    return;
  }

  missionState = KEBERANGKATAN;

  oledTulis("MISI", "Ke titik " + nama, "Berangkat!");
  kirimState();

  Serial.print("MISI DIMULAI -> Titik ");
  Serial.println(nama);
}

void mulaiPulang() {
  resetBlackbox();
  lastError        = 0;
  lastLineSide     = 0;

  if (turnDirection == 0) {
    turnDirection = (missionTarget == 2) ? 1 : -1;
  }

  oledTulis("BELOK", (turnDirection == 1) ? "Kanan 90" : "Kiri 90", "");

  if (turnDirection == 1) {
    putarKanan(turnPowerKanan);
  } else {
    putarKiri(turnPowerKiri);
  }

  delay(durasiBelokPulang());
  stopMotor();
  delay(200);

  speedBoostKiri = 0;
  if (missionTarget == 2) {
    mulaiCariGarisPulangB();
  } else {
    bReturnSearchLine = false;
  }

  missionState = PULANG;
  kirimState();

  oledTulis("PULANG", "Ke base...", "");
  Serial.println("PULANG ke base");
}

void mulaiCariGarisPulangB() {
  bReturnSearchLine = true;
  bReturnSearchStartedAt = millis();
  lastError = 0;
  lastLineSide = 1;
}

int durasiBelokPulang() {
  // Pivot lama terlalu besar untuk titik A/C dan bisa berubah jadi ~180 derajat.
  // Angka ini dibuat konservatif agar mendekati 90 derajat dulu, lalu PID mencari garis.
  if (missionTarget == 1) return returnTurnAms; // A: kiri ke jalur balik
  if (missionTarget == 2) return returnTurnBms; // B: kanan
  if (missionTarget == 3) return returnTurnCms; // C: kiri, biasanya butuh lebih singkat
  return 1100;
}

// ================= BLACKBOX COUNTER =================
void hitungBlackbox(bool blackbox) {
  newBlackboxDetected = false;
  unsigned long now = millis();

  if (!blackboxArmed && !blackbox) {
    if (boxClearStartedAt == 0) boxClearStartedAt = now;
    boxSeenStartedAt = 0;

    if (now - boxClearStartedAt >= BLACKBOX_EXIT_STABLE_MS) {
      blackboxArmed = true;
    }
    return;
  }

  if (!blackbox) {
    boxSeenStartedAt = 0;
    return;
  }

  boxClearStartedAt = 0;

  if (!blackboxArmed) {
    boxSeenStartedAt = 0;
    return;
  }

  if (boxSeenStartedAt == 0) boxSeenStartedAt = now;

  if (now - boxSeenStartedAt >= BLACKBOX_ENTER_STABLE_MS &&
      now - lastBlackboxAt >= BLACKBOX_DEBOUNCE_MS) {
    blackboxCount++;
    blackboxArmed = false;
    newBlackboxDetected = true;
    lastBlackboxAt = now;
    boxSeenStartedAt = 0;

    Serial.print("BLACKBOX #");
    Serial.println(blackboxCount);
  }
}

void resetBlackbox() {
  blackboxCount = 0;
  blackboxArmed = false;
  newBlackboxDetected = false;
  lastBlackboxAt = 0;
  boxClearStartedAt = 0;
  boxSeenStartedAt = 0;
}

int bacaSensorTengah() {
  int raw = digitalRead(S_TENGAH);
  return S_TENGAH_ACTIVE_LOW ? !raw : raw;
}

// ================= FOLLOW LINE PID — STABLE =================
// Catatan penting:
// Versi ini sengaja mempertahankan kemampuan reverse dari kode lama.
// Jangan kunci constrain ke speedMin positif, karena itu membuat AGV gagal ambil tikungan tajam.
void followLine(int vL, int vM, int vR, int irL, int irR) {
  int sum = irL + vL + vM + vR + irR;
  float error = 0;

  if (sum >= 5) {
    // Pada tikungan tebal, semua sensor kadang membaca hitam.
    // Pertahankan arah koreksi terakhir agar robot tidak tiba-tiba lurus.
    if (lastLineSide != 0 && (lastError > 0.15 || lastError < -0.15)) {
      error = lastError * FULL_BLACK_MEMORY_GAIN;
    } else {
      error = 0;
    }
  }
  else if (sum > 0) {
    error =
      ((-3.5 * irL) + (-1.4 * vL) + (0.0 * vM) + (1.4 * vR) + (3.5 * irR)) /
      sum;

    if (error < 0) lastLineSide = -1;
    else if (error > 0) lastLineSide = 1;
  }
  else {
    if (lastLineSide == 0) {
      error = 0;
    } else {
      error = (lastLineSide == -1) ? -LOST_LINE_ERROR : LOST_LINE_ERROR;
    }
  }

  float absError = (error < 0) ? -error : error;
  int driveSpeed = baseSpeed;
  int turnMin = 0;
  if (sum == 0 || absError >= 1.35) {
    driveSpeed = sharpCurveSpeed;
    turnMin = sharpTurnMin;
  } else if (absError >= 0.30) {
    driveSpeed = curveSpeed;
    turnMin = curveTurnMin;
  }

  float derivative = constrain(error - lastError, -2.2, 2.2);
  float correction = (Kp * error) + (Kd * derivative);

  int leftSpeed  = driveSpeed + speedBoostKiri + (int)correction;
  int rightSpeed = driveSpeed - (int)correction;

  // Boost adaptif roda kiri saat belok kanan — makin besar belokan, makin besar boost.
  // Ini menghindari on/off tiba-tiba yang bikin goyang.
  if (correction > 3) {
    int boost = (int)(correction * 0.25);  // 25% dari correction
    if (boost > rightTurnBoost) boost = rightTurnBoost;
    if (boost < 4) boost = 4;  // minimum biar ada efek
    leftSpeed += boost;
  }

  // Ini bagian paling penting:
  // Nilai negatif tetap diizinkan agar robot bisa pivot saat tikungan tajam.
  leftSpeed  = constrain(leftSpeed,  -maxSpeed, maxSpeed);
  rightSpeed = constrain(rightSpeed, -maxSpeed, maxSpeed);

  bool rightInnerLimited = false;
  bool leftInnerLimited  = false;

  // Saat tikungan, PWM kecil sering tidak cukup melawan beban motor/L298N.
  // Minimum ini berlaku untuk maju dan mundur, tapi hanya saat mode curve aktif.
  if (turnMin > 0) {
    if (error < 0) {
      // Belok kiri: roda kanan adalah roda luar, roda kiri bebas melambat.
      if (rightSpeed > 0 && rightSpeed < turnMin) rightSpeed = turnMin;
      else if (rightSpeed < 0 && rightSpeed > -turnMin) rightSpeed = -turnMin;
      leftInnerLimited = true;
    } else {
      // General case: terapkan turnMin hanya ke roda LUAR.
      // Roda DALAM dibebaskan agar PID bisa melambatkan/mundur saat belok.
      if (error < 0) {
        // Belok KIRI → roda KANAN (luar) perlu minimum power, roda KIRI (dalam) bebas
        if (rightSpeed > 0 && rightSpeed < turnMin) rightSpeed = turnMin;
        else if (rightSpeed < 0 && rightSpeed > -turnMin) rightSpeed = -turnMin;
        leftInnerLimited = true;
      } else {
        // Belok KANAN → roda KIRI (luar) perlu minimum power, roda KANAN (dalam) bebas
        if (leftSpeed > 0 && leftSpeed < turnMin) leftSpeed = turnMin;
        else if (leftSpeed < 0 && leftSpeed > -turnMin) leftSpeed = -turnMin;
        rightInnerLimited = true;
      }
    }
  }

  // speedMin hanya berlaku untuk roda LUAR saat belok.
  // Roda DALAM (inner) dibebaskan agar PID bisa melambatkan sepenuhnya.
  if (!rightInnerLimited && rightSpeed > 0 && rightSpeed < speedMin) rightSpeed = speedMin;
  if (!leftInnerLimited  && leftSpeed  > 0 && leftSpeed  < speedMin) leftSpeed  = speedMin;

  setMotors(leftSpeed, rightSpeed);

  lastError = error;
}

// ================= SCAN & HINDARI =================
void scanDanHindari() {
  servoSweepHalangan();

  oledTulis("HINDARI", "Kanan 60", "");
  buzzerBeep(100);

  putarKanan(AVOID_TURN_POWER);
  delay(avoidTurn60Ms);
  stopMotor();
  delay(120);

  oledTulis("HINDARI", "Maju kanan", "");
  majuLurus(AVOID_FORWARD_SPEED);
  delay(avoidForward1Ms);
  stopMotor();
  delay(120);

  oledTulis("HINDARI", "Balik kiri", "");
  setMotors(-avoidLeftInnerPwm, avoidLeftOuterPwm);
  delay(avoidTurnLeftMs);
  stopMotor();
  delay(120);

  oledTulis("HINDARI", "Cari garis", "");
  majuLurus(AVOID_FORWARD_SPEED);
  delay(avoidForward2Ms);
  stopMotor();
  delay(120);

  lastError = 0;
  lastLineSide = 0;
  jarakTerakhir = 999;
  oledTulis("LANJUT", "Follow line...", "");
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

void servoSweepHalangan() {
  int stepDeg = constrain(obstacleServoStepDeg, 1, 45);
  int stepDelay = constrain(obstacleServoStepDelayMs, 5, 80);

  oledTulis("HALANGAN", "Scan servo", "0 -> 180");
  servoKe(SERVO_KANAN, 120);

  for (int sudut = SERVO_KANAN; sudut <= SERVO_KIRI; sudut += stepDeg) {
    servoScan.write(sudut);
    delay(stepDelay);
  }

  servoKe(SERVO_KIRI, 80);
  servoKe(SERVO_DEPAN, 120);
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

// ================= LOADCELL =================
void bacaLoadcell() {
  if (millis() - loadcellTimer < LOADCELL_INTERVAL_MS) return;
  loadcellTimer = millis();

  bool ready = scale.is_ready();

  // Auto-reconnect kalau HX711 hilang (masalah umum saat pakai baterai)
  if (!ready) {
    static unsigned long lastRetry = 0;
    if (millis() - lastRetry >= 3000) {
      lastRetry = millis();
      Serial.println("HX711: Reconnecting...");
      scale.begin(HX711_DT, HX711_SCK);
      delay(100);
      if (scale.is_ready()) {
        scale.set_scale(loadcellCalibration);
        tareLoadcell("RECONNECT");
        ready = true;
      } else {
        Serial.println("HX711: Masih belum terdeteksi");
      }
    }
  }

  if (ready) {
    long raw = scale.read();
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
        loadcellGram = filteredGram;
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
        loadcellGram = 0;
      }
    }

    if (cargoDetected != lastCargoDetected) {
      lastCargoDetected = cargoDetected;
      cargoStateChangedAt = millis();
    }

    // Debug setiap 2 detik
    static unsigned long lastDebug = 0;
    if (millis() - lastDebug >= 2000) {
      lastDebug = millis();
      Serial.print("HX711: raw="); Serial.print(raw);
      Serial.print(" offset="); Serial.print(loadcellRawOffset);
      Serial.print(" gram="); Serial.print(loadcellGram, 1);
      Serial.print(" cargo="); Serial.println(cargoDetected ? "YES" : "NO");
    }
  }
}

bool tareLoadcell(const char* reason) {
  if (!scale.is_ready()) {
    Serial.print("HX711: TARE gagal");
    if (reason) {
      Serial.print(" (");
      Serial.print(reason);
      Serial.print(")");
    }
    Serial.println(" - NOT READY");
    return false;
  }

  delay(250);
  long rawBefore = scale.read_average(5);
  loadcellRawOffset = scale.read_average(LOADCELL_TARE_READS);
  scale.set_offset(loadcellRawOffset);
  delay(100);
  long rawAfter = scale.read_average(5);

  loadcellGram = 0;
  loadcellFilterReady = false;
  cargoDetected = false;
  lastCargoDetected = false;
  loadcellCargoConfirm = 0;
  loadcellEmptyConfirm = 0;
  cargoStateChangedAt = millis() - CARGO_STABLE_MS;

  Serial.print("HX711: TARE OK");
  if (reason) {
    Serial.print(" (");
    Serial.print(reason);
    Serial.print(")");
  }
  Serial.print(" rawBefore=");
  Serial.print(rawBefore);
  Serial.print(" rawAfter=");
  Serial.print(rawAfter);
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
      clientId.c_str(),
      MQTT_USER,
      MQTT_PASSWORD,
      mqttTopicStatus.c_str(),
      0,
      true,
      offlinePayload.c_str()
    );
  } else {
    connected = mqttClient.connect(
      clientId.c_str(),
      mqttTopicStatus.c_str(),
      0,
      true,
      offlinePayload.c_str()
    );
  }

  if (connected) {
    mqttClient.subscribe(mqttTopicCmd.c_str());
    String onlinePayload = String("{\"device_id\":\"") + DEVICE_ID + "\",\"online\":true}";
    mqttClient.publish(mqttTopicStatus.c_str(), onlinePayload.c_str(), true);
    kirimState();
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

// ================= COMMAND =================
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
    waitingAtDest = false;
    speedBoostKiri = 0;
    bReturnSearchLine = false;
    resetBlackbox();
    stopMotor();
    oledTulis("STOP", "Emergency!", "");
    kirimState();
    return;
  }

  // Manual motor commands
  if (input == "forward") {
    missionState = MANUAL;
    speedBoostKiri = 0;
    majuLurus(baseSpeed);
    oledTulis("MANUAL", "Maju", "");
    kirimState();
    return;
  }

  if (input == "backward") {
    missionState = MANUAL;
    speedBoostKiri = 0;
    setMotors(-baseSpeed, -baseSpeed);
    oledTulis("MANUAL", "Mundur", "");
    kirimState();
    return;
  }

  if (input == "left") {
    missionState = MANUAL;
    speedBoostKiri = 0;
    putarKiri(turnPowerKiri);
    oledTulis("MANUAL", "Kiri", "");
    kirimState();
    return;
  }

  if (input == "right") {
    missionState = MANUAL;
    speedBoostKiri = 0;
    putarKanan(turnPowerKanan);
    oledTulis("MANUAL", "Kanan", "");
    kirimState();
    return;
  }

  // Tuning commands
  if (input.startsWith("tk")) {
    trimKiri = input.substring(2).toFloat();
  }
  else if (input.startsWith("tn")) {
    trimKanan = input.substring(2).toFloat();
  }
  else if (input.startsWith("tb")) {
    rightTurnBoost = input.substring(2).toInt();
  }
  else if (input.startsWith("bl")) {
    bReturnSearchLeftPwm = input.substring(2).toInt();
  }
  else if (input.startsWith("br")) {
    bReturnSearchRightPwm = input.substring(2).toInt();
  }
  else if (input.startsWith("bt")) {
    bReturnSearchMaxMs = input.substring(2).toInt();
  }
  else if (input.startsWith("ra")) {
    returnTurnAms = input.substring(2).toInt();
  }
  else if (input.startsWith("rb")) {
    returnTurnBms = input.substring(2).toInt();
  }
  else if (input.startsWith("rc")) {
    returnTurnCms = input.substring(2).toInt();
  }
  else if (input.startsWith("av")) {
    avoidTurn60Ms = input.substring(2).toInt();
  }
  else if (input.startsWith("af")) {
    avoidForward1Ms = input.substring(2).toInt();
  }
  else if (input.startsWith("ag")) {
    avoidForward2Ms = input.substring(2).toInt();
  }
  else if (input.startsWith("al")) {
    avoidTurnLeftMs = input.substring(2).toInt();
  }
  else if (input.startsWith("ai")) {
    avoidLeftInnerPwm = input.substring(2).toInt();
  }
  else if (input.startsWith("ao")) {
    avoidLeftOuterPwm = input.substring(2).toInt();
  }
  else if (input.startsWith("os")) {
    obstacleServoStepDeg = input.substring(2).toInt();
  }
  else if (input.startsWith("od")) {
    obstacleServoStepDelayMs = input.substring(2).toInt();
  }
  else if (input.startsWith("cs")) {
    curveSpeed = input.substring(2).toInt();
  }
  else if (input.startsWith("ss")) {
    sharpCurveSpeed = input.substring(2).toInt();
  }
  else if (input.startsWith("ct")) {
    curveTurnMin = input.substring(2).toInt();
  }
  else if (input.startsWith("st")) {
    sharpTurnMin = input.substring(2).toInt();
  }
  else if (input.startsWith("p")) {
    Kp = input.substring(1).toFloat();
  }
  else if (input.startsWith("d")) {
    Kd = input.substring(1).toFloat();
  }
  else if (input.startsWith("s")) {
    baseSpeed = input.substring(1).toInt();
  }
  else if (input.startsWith("n")) {
    speedMin = input.substring(1).toInt();
  }
  else if (input.startsWith("m")) {
    maxSpeed = input.substring(1).toInt();
  }
  else if (input.startsWith("l")) {
    turnPowerKiri = input.substring(1).toInt();
  }
  else if (input.startsWith("r")) {
    turnPowerKanan = input.substring(1).toInt();
  }
  else if (input == "tare") {
    if (tareLoadcell("CMD")) {
      kirimState();
      kirimTelemetry(digitalRead(S_KIRI), bacaSensorTengah(), digitalRead(S_KANAN), digitalRead(IR_KIRI), digitalRead(IR_KANAN), false);
    }
  }
  else if (input.startsWith("c")) {
    float cal = input.substring(1).toFloat();
    if (cal > 0) {
      loadcellCalibration = cal;
      scale.set_scale(loadcellCalibration);
      Serial.print("HX711: Calibration factor = ");
      Serial.println(loadcellCalibration);
    }
  }

  Serial.print("Kp="); Serial.print(Kp);
  Serial.print(" Kd="); Serial.print(Kd);
  Serial.print(" base="); Serial.print(baseSpeed);
  Serial.print(" curve="); Serial.print(curveSpeed);
  Serial.print(" sharp="); Serial.print(sharpCurveSpeed);
  Serial.print(" min="); Serial.print(speedMin);
  Serial.print(" curveTurnMin="); Serial.print(curveTurnMin);
  Serial.print(" sharpTurnMin="); Serial.print(sharpTurnMin);
  Serial.print(" max="); Serial.print(maxSpeed);
  Serial.print(" turnL="); Serial.print(turnPowerKiri);
  Serial.print(" turnR="); Serial.print(turnPowerKanan);
  Serial.print(" trimL="); Serial.print(trimKiri, 2);
  Serial.print(" trimR="); Serial.print(trimKanan, 2);
  Serial.print(" rtb="); Serial.print(rightTurnBoost);
  Serial.print(" bLeft="); Serial.print(bReturnSearchLeftPwm);
  Serial.print(" bRight="); Serial.print(bReturnSearchRightPwm);
  Serial.print(" bTime="); Serial.print(bReturnSearchMaxMs);
  Serial.print(" retA="); Serial.print(returnTurnAms);
  Serial.print(" retB="); Serial.print(returnTurnBms);
  Serial.print(" retC="); Serial.print(returnTurnCms);
  Serial.print(" av="); Serial.print(avoidTurn60Ms);
  Serial.print(" al="); Serial.print(avoidTurnLeftMs);
  Serial.print(" af="); Serial.print(avoidForward1Ms);
  Serial.print(" ag="); Serial.print(avoidForward2Ms);
  Serial.print(" ai="); Serial.print(avoidLeftInnerPwm);
  Serial.print(" ao="); Serial.print(avoidLeftOuterPwm);
  Serial.print(" os="); Serial.print(obstacleServoStepDeg);
  Serial.print(" od="); Serial.println(obstacleServoStepDelayMs);
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

  if (mqttClient.connected()) {
    mqttClient.publish(mqttTopicState.c_str(), payload.c_str(), true);
  }
}

bool stateCekHalangan() {
  return missionState == KEBERANGKATAN || missionState == PULANG || missionState == MANUAL;
}

const char* namaState(MissionState s) {
  switch (s) {
    case IDLE:             return "IDLE";
    case MENUNGGU_BARANG:  return "MENUNGGU_BARANG";
    case KEBERANGKATAN:    return "KEBERANGKATAN";
    case SAMPAI:           return "SAMPAI";
    case PULANG:           return "PULANG";
    case SELESAI:          return "SELESAI";
    case MANUAL:           return "MANUAL";
    default:               return "UNKNOWN";
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
  payload += ",\"wifi_rssi\":"; payload += (WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0);
  payload += ",\"mqtt_connected\":"; payload += (mqttClient.connected() ? "true" : "false");
  payload += "}";

  Serial.print("TELEMETRY ");
  Serial.println(payload);

  if (mqttClient.connected()) {
    bool ok = mqttClient.publish(mqttTopicTelemetry.c_str(), payload.c_str());
    if (!ok) {
      Serial.print("MQTT telemetry publish failed, len=");
      Serial.println(payload.length());
    }
  }
}

// ================= FUNGSI MOTOR =================
void putarKanan(int spd) {
  setMotors(spd, -spd);
}

void putarKiri(int spd) {
  setMotors(-spd, spd);
}

void majuLurus(int spd) {
  setMotors(spd, spd);
}

void setMotors(int leftPWM, int rightPWM) {
  // Simpan nilai asli sebelum trim untuk telemetry arah.
  motorKiriTerakhir  = leftPWM;
  motorKananTerakhir = rightPWM;

  leftPWM  = constrain(leftPWM,  -255, 255);
  rightPWM = constrain(rightPWM, -255, 255);

  int leftOut  = abs(leftPWM);
  int rightOut = abs(rightPWM);

  leftOut  = constrain((int)(leftOut  * trimKiri),  0, 255);
  rightOut = constrain((int)(rightOut * trimKanan), 0, 255);

  if (leftPWM >= 0) {
    digitalWrite(IN1, HIGH);
    digitalWrite(IN2, LOW);
  } else {
    digitalWrite(IN1, LOW);
    digitalWrite(IN2, HIGH);
  }

  if (rightPWM >= 0) {
    digitalWrite(IN3, HIGH);
    digitalWrite(IN4, LOW);
  } else {
    digitalWrite(IN3, LOW);
    digitalWrite(IN4, HIGH);
  }

  ledcWrite(ENA, leftOut);
  ledcWrite(ENB, rightOut);
}

void stopMotor() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);

  ledcWrite(ENA, 0);
  ledcWrite(ENB, 0);

  motorKiriTerakhir  = 0;
  motorKananTerakhir = 0;
}
