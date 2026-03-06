// ============================================================
//  XORA AGV — Motor Control Module (TB6612FNG)
//  ESP32 core v3.x — pakai ledcAttach + ledcWrite (bukan analogWrite)
//
//  Wiring TB6612FNG:
//  STBY  → PIN_STBY (GPIO 19)
//  PWMA  → PIN_PWMA (GPIO 13)  — Motor KANAN
//  AIN1  → PIN_AIN1 (GPIO 12)
//  AIN2  → PIN_AIN2 (GPIO 11)
//  PWMB  → PIN_PWMB (GPIO 10)  — Motor KIRI
//  BIN1  → PIN_BIN1 (GPIO 9)
//  BIN2  → PIN_BIN2 (GPIO 8)
//  VM    → baterai (7.4V / 12V)
//  VCC   → 3.3V
//  GND   → GND
// ============================================================

// ─── PIN TB6612FNG ────────────────────────────────────────────────────────────
#define PIN_STBY   4

// Motor KANAN (A)
#define PIN_PWMA  25
#define PIN_AIN1  26
#define PIN_AIN2  27

// Motor KIRI (B)
#define PIN_PWMB  14
#define PIN_BIN1  12
#define PIN_BIN2  13

// ─── LEDC PWM config ─────────────────────────────────────────────────────────
#define PWM_FREQ  1000
#define PWM_RES   8      // 8-bit: 0-255

// Kecepatan default didefinisikan di xora_agv.ino
// #define MOTOR_SPEED_DEFAULT  180
// #define MOTOR_SPEED_TURN     130

// ─── Setup Motor ──────────────────────────────────────────────────────────────
void motorSetup() {
  pinMode(PIN_STBY, OUTPUT);
  pinMode(PIN_AIN1, OUTPUT);
  pinMode(PIN_AIN2, OUTPUT);
  pinMode(PIN_BIN1, OUTPUT);
  pinMode(PIN_BIN2, OUTPUT);

  // ESP32 core v3.x: ledcAttach(pin, freq, resolution) — tanpa channel
  ledcAttach(PIN_PWMA, PWM_FREQ, PWM_RES);
  ledcAttach(PIN_PWMB, PWM_FREQ, PWM_RES);

  digitalWrite(PIN_STBY, HIGH);
  motorStop();
}

// ─── Kontrol motor individual ─────────────────────────────────────────────────
void motorRight(int speed, int dir) {
  if (dir == 0 || speed == 0) {
    digitalWrite(PIN_AIN1, LOW);
    digitalWrite(PIN_AIN2, LOW);
    ledcWrite(PIN_PWMA, 0);
    return;
  }
  digitalWrite(PIN_AIN1, dir == 1 ? HIGH : LOW);
  digitalWrite(PIN_AIN2, dir == 1 ? LOW  : HIGH);
  ledcWrite(PIN_PWMA, speed);
}

void motorLeft(int speed, int dir) {
  if (dir == 0 || speed == 0) {
    digitalWrite(PIN_BIN1, LOW);
    digitalWrite(PIN_BIN2, LOW);
    ledcWrite(PIN_PWMB, 0);
    return;
  }
  digitalWrite(PIN_BIN1, dir == 1 ? HIGH : LOW);
  digitalWrite(PIN_BIN2, dir == 1 ? LOW  : HIGH);
  ledcWrite(PIN_PWMB, speed);
}

// ─── Fungsi gerak utama ───────────────────────────────────────────────────────
void motorForward(int speed = MOTOR_SPEED_DEFAULT) {
  motorLeft(speed,  1);
  motorRight(speed, 1);
  Serial.println("[MOTOR] FORWARD");
}

void motorBackward(int speed = MOTOR_SPEED_DEFAULT) {
  motorLeft(speed,  -1);
  motorRight(speed, -1);
  Serial.println("[MOTOR] BACKWARD");
}

void motorTurnLeft(int speed = MOTOR_SPEED_TURN) {
  motorLeft(speed,  -1);
  motorRight(speed,  1);
  Serial.println("[MOTOR] LEFT");
}

void motorTurnRight(int speed = MOTOR_SPEED_TURN) {
  motorLeft(speed,   1);
  motorRight(speed, -1);
  Serial.println("[MOTOR] RIGHT");
}

void motorStop() {
  motorLeft(0,  0);
  motorRight(0, 0);
}

void motorStandby(bool on) {
  digitalWrite(PIN_STBY, on ? LOW : HIGH);
}

// ─── Parser command MQTT ──────────────────────────────────────────────────────
void handleManualCommand(const char* cmd) {
  if (currentMode != MODE_MANUAL) {
    Serial.println("[MOTOR] Ignored -- not in MANUAL mode");
    return;
  }
  if      (strcmp(cmd, "FORWARD")  == 0) motorForward();
  else if (strcmp(cmd, "BACKWARD") == 0) motorBackward();
  else if (strcmp(cmd, "LEFT")     == 0) motorTurnLeft();
  else if (strcmp(cmd, "RIGHT")    == 0) motorTurnRight();
  else if (strcmp(cmd, "STOP")     == 0) motorStop();
  else Serial.printf("[MOTOR] Unknown command: %s\n", cmd);
}
