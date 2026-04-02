#pragma once

// ─── Decision Tree predict ────────────────────────────────────────────────────
// CATATAN: distance <= 54.00 artinya obstacle terdeteksi jika objek < 54cm
// Sesuaikan nilai ini setelah kalibrasi sensor ultrasonik kamu
// Idealnya sekitar 10–15cm agar tidak false-positive
inline int predict(float weight, float delta, float distance) {
  if (distance <= 54.00) {
    return 3; // OBSTACLE_DETECTED
  } else {
    if (delta <= -12.50) {
      return 2; // OBJECT_PICKED
    } else {
      if (weight <= 42.50) {
        return 0; // NO_OBJECT
      } else {
        return 1; // OBJECT_PRESENT
      }
    }
  }
}