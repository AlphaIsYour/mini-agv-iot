// XORA AGV — Mission-Based Firmware PERFECT/STABLE VERSION
// ESP32 + L298N + MQTT + OLED + Ultrasonic + Servo
//
// Basis: kode lama yang sensor garisnya sudah terbukti jalan.
// Revisi aman:
// 1. Follow line tetap boleh reverse saat koreksi tajam.
// 2. Power kiri/kanan bisa dikalibrasi.
// 3. Belok kiri diperkuat sedikit tanpa merusak PID.
// 4. Ada command tuning serial tambahan.
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
float loadcellThreshold = 50.0;  // dianggap "ada barang" jika > 50 gram
bool  cargoDetected     = false;
unsigned long loadcellTimer = 0;
const unsigned long LOADCELL_INTERVAL_MS = 200;

// ================= PARAMETER PWM =================
const int PWM_FREQ = 1000;
const int PWM_RES  = 8;

// ================= PARAMETER KONTROL =================
// Ini dibuat dekat dengan kode lama, karena kode lama sudah terbukti membaca garis.
int baseSpeed = 155;
int maxSpeed  = 210;
int speedMin  = 0;

// PID lama dipertahankan karena cocok dengan sensor/arena kamu.
float Kp = 110.0;
float Kd = 45.0;

float lastError  = 0;
int lastLineSide = 0;

// Kalibrasi motor.
// Kalau AGV berat belok kiri, biasanya motor kanan/kiri tidak seimbang.
// Nilai ini aman: 1.00 normal, 1.05 = +5%, 0.95 = -5%.
float trimKiri  = 1.00;
float trimKanan = 1.00;

// Boost khusus kondisi tertentu.
int speedBoostKiri = 0;

// Power belok titik/mission.
int turnPowerKiri  = 220;
int turnPowerKanan = 205;

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
  delay(2000);  // Tunggu power stabil (penting saat pakai baterai!)

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
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.display();

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

  scale.set_scale(420.0);
  scale.tare();
  Serial.println("HX711: TARED");
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
  Serial.println("s155 = baseSpeed");
  Serial.println("p110 = Kp");
  Serial.println("d45  = Kd");
  Serial.println("m210 = maxSpeed");
  Serial.println("l220 = turnPowerKiri");
  Serial.println("r205 = turnPowerKanan");
  Serial.println("tk1.00 = trimKiri");
  Serial.println("tn1.00 = trimKanan");
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
  int vM  = digitalRead(S_TENGAH);
  int vR  = digitalRead(S_KANAN);
  int irL = digitalRead(IR_KIRI);
  int irR = digitalRead(IR_KANAN);

  bool blackbox = (vL == 1 && vM == 1 && vR == 1 && irL == 1 && irR == 1);

  // ===== CEK HALANGAN =====
  if (stateCekHalangan()) {
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
      if (cargoDetected) {
        buzzerBeep(200);
        String nama = (missionTarget == 1) ? "A" : (missionTarget == 2) ? "B" : "C";
        oledTulis("BARANG ADA", "Ke titik " + nama, "Berangkat!");
        missionState = KEBERANGKATAN;
        stateTimer   = millis();
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
        if (cargoDetected) {
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

              int majuMs = (missionTarget == 3) ? 200 : 600;
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

            // Untuk A kiri biasanya perlu lebih lama.
            int turnMs = (missionTarget == 1) ? 2200 : 1700;
            delay(turnMs);

            stopMotor();
            delay(200);

            blackboxCount = 0;
            blackboxArmed = false;
            newBlackboxDetected = false;
            lastError = 0;
            lastLineSide = 0;

            // Khusus pulang dari B, boost kiri.
            speedBoostKiri = (missionTarget == 2) ? 70 : 0;

            missionState = PULANG;
            kirimState();
            oledTulis("PULANG", "Ke base...", "");

            Serial.println("Auto pulang setelah barang diambil");
          }
        }
      }
      break;

    case PULANG:
      hitungBlackbox(blackbox);

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
    Serial.print("g HX="); Serial.print(scale.is_ready() ? "OK" : "FAIL");
    Serial.print(" V="); Serial.println(analogRead(34));  // baca voltage reference
  }

  delay(2);
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
  speedBoostKiri   = 0;

  String nama = (target == 1) ? "A" : (target == 2) ? "B" : "C";

  // Cek loadcell — kalau tidak ada barang, tunggu dulu
  bacaLoadcell();
  if (!cargoDetected) {
    missionState = MENUNGGU_BARANG;
    oledTulis("MISI " + nama, "Tunggu barang", "ditaruh...");
    kirimState();
    Serial.println("MISI " + nama + " — menunggu barang di loadcell");
    return;
  }

  missionState = KEBERANGKATAN;
  stateTimer   = millis();

  oledTulis("MISI", "Ke titik " + nama, "Berangkat!");
  kirimState();

  Serial.print("MISI DIMULAI -> Titik ");
  Serial.println(nama);
}

void mulaiPulang() {
  blackboxCount    = 0;
  blackboxArmed    = false;
  newBlackboxDetected = false;
  lastError        = 0;
  lastLineSide     = 0;

  oledTulis("BELOK", (turnDirection == 1) ? "Kanan 90" : "Kiri 90", "");

  if (turnDirection == 1) {
    putarKanan(turnPowerKanan);
  } else {
    putarKiri(turnPowerKiri);
  }

  delay(1300);
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

// ================= FOLLOW LINE PID — STABLE =================
// Catatan penting:
// Versi ini sengaja mempertahankan kemampuan reverse dari kode lama.
// Jangan kunci constrain ke speedMin positif, karena itu membuat AGV gagal ambil tikungan tajam.
void followLine(int vL, int vM, int vR, int irL, int irR) {
  int sum = vL + vM + vR;
  float error = 0;

  if (sum > 0) {
    error = ((-1.0 * vL) + (0.0 * vM) + (1.0 * vR)) / sum;

    if (error < 0) lastLineSide = -1;
    else if (error > 0) lastLineSide = 1;
  }
  else if (irL == 1) {
    lastLineSide = -1;
    error = -1.5;
  }
  else if (irR == 1) {
    lastLineSide = 1;
    error = 1.5;
  }
  else {
    if (lastLineSide == 0) error = 0;
    else error = (lastLineSide == -1) ? -1.5 : 1.5;
  }

  float derivative = error - lastError;
  float correction = (Kp * error) + (Kd * derivative);

  int leftSpeed  = baseSpeed + speedBoostKiri + (int)correction;
  int rightSpeed = baseSpeed - (int)correction;

  // Ini bagian paling penting:
  // Nilai negatif tetap diizinkan agar robot bisa pivot saat tikungan tajam.
  leftSpeed  = constrain(leftSpeed,  -maxSpeed, maxSpeed);
  rightSpeed = constrain(rightSpeed, -maxSpeed, maxSpeed);

  // speedMin hanya berlaku untuk nilai positif kecil.
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
  ledcWrite(ENA, 140);
  ledcWrite(ENB, 140);
  motorKiriTerakhir  = 140;
  motorKananTerakhir = -140;
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
  ledcWrite(ENA, 140);
  ledcWrite(ENB, 140);
  motorKiriTerakhir  = -140;
  motorKananTerakhir = 140;
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
        scale.set_scale(420.0);
        scale.tare();
        Serial.println("HX711: Reconnected & tared");
        ready = true;
      } else {
        Serial.println("HX711: Masih belum terdeteksi");
      }
    }
  }

  if (ready) {
    loadcellGram = scale.get_units(3);  // baca 3x, rata-rata
    if (loadcellGram < 0) loadcellGram = 0;
    cargoDetected = (loadcellGram > loadcellThreshold);

    // Debug setiap 2 detik
    static unsigned long lastDebug = 0;
    if (millis() - lastDebug >= 2000) {
      lastDebug = millis();
      long raw = scale.read();
      Serial.print("HX711: raw="); Serial.print(raw);
      Serial.print(" gram="); Serial.print(loadcellGram, 1);
      Serial.print(" cargo="); Serial.println(cargoDetected ? "YES" : "NO");
    }
  }
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
    stopMotor();
    oledTulis("STOP", "Emergency!", "");
    kirimState();
    return;
  }

  // Manual motor commands
  if (input == "forward") {
    missionState = MANUAL;
    majuLurus(baseSpeed);
    oledTulis("MANUAL", "Maju", "");
    kirimState();
    return;
  }

  if (input == "backward") {
    missionState = MANUAL;
    setMotors(-baseSpeed, -baseSpeed);
    oledTulis("MANUAL", "Mundur", "");
    kirimState();
    return;
  }

  if (input == "left") {
    missionState = MANUAL;
    putarKiri(turnPowerKiri);
    oledTulis("MANUAL", "Kiri", "");
    kirimState();
    return;
  }

  if (input == "right") {
    missionState = MANUAL;
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
  else if (input.startsWith("p")) {
    Kp = input.substring(1).toFloat();
  }
  else if (input.startsWith("d")) {
    Kd = input.substring(1).toFloat();
  }
  else if (input.startsWith("s")) {
    baseSpeed = input.substring(1).toInt();
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
    if (scale.is_ready()) {
      scale.tare();
      Serial.println("HX711: TARE OK");
    } else {
      Serial.println("HX711: NOT READY");
    }
  }
  else if (input.startsWith("c")) {
    float cal = input.substring(1).toFloat();
    if (cal > 0) {
      scale.set_scale(cal);
      Serial.print("HX711: Calibration factor = ");
      Serial.println(cal);
    }
  }

  Serial.print("Kp="); Serial.print(Kp);
  Serial.print(" Kd="); Serial.print(Kd);
  Serial.print(" base="); Serial.print(baseSpeed);
  Serial.print(" max="); Serial.print(maxSpeed);
  Serial.print(" turnL="); Serial.print(turnPowerKiri);
  Serial.print(" turnR="); Serial.print(turnPowerKanan);
  Serial.print(" trimL="); Serial.print(trimKiri, 2);
  Serial.print(" trimR="); Serial.println(trimKanan, 2);
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
  payload += ",\"turn\":\""; payload += (turnDirection == -1 ? "left" : "right"); payload += "\"";
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
  payload.reserve(650);

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
  payload += ",\"max_speed\":"; payload += maxSpeed;
  payload += ",\"speed_min\":"; payload += speedMin;
  payload += ",\"turn_power_left\":"; payload += turnPowerKiri;
  payload += ",\"turn_power_right\":"; payload += turnPowerKanan;
  payload += ",\"trim_left\":"; payload += String(trimKiri, 2);
  payload += ",\"trim_right\":"; payload += String(trimKanan, 2);
  payload += ",\"motor_left\":"; payload += motorKiriTerakhir;
  payload += ",\"motor_right\":"; payload += motorKananTerakhir;
  payload += ",\"waiting\":"; payload += (waitingAtDest ? "true" : "false");
  payload += ",\"turn\":\""; payload += (turnDirection == -1 ? "left" : "right"); payload += "\"";
  payload += ",\"loadcell_g\":"; payload += String(loadcellGram, 1);
  payload += ",\"cargo\":"; payload += (cargoDetected ? "true" : "false");
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