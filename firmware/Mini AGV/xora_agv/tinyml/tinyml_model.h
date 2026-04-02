#pragma once
#include "tinyml_model_data.h"

// ─── ML State ─────────────────────────────────────────────────────────────────
enum MLState {
  NO_OBJECT,
  OBJECT_PRESENT,
  OBJECT_PICKED,
  OBSTACLE_DETECTED,
  INVALID_LOAD
};

// ─── predictML — inline agar tidak butuh model.cpp ───────────────────────────
// Sebelumnya ada model.cpp terpisah yang menyebabkan "undefined reference"
// karena Arduino tidak otomatis compile .cpp di subfolder tinyml/
inline MLState predictML(float weight, float delta, float distance) {
  int r = predict(weight, delta, distance);
  switch (r) {
    case 0: return NO_OBJECT;
    case 1: return OBJECT_PRESENT;
    case 2: return OBJECT_PICKED;
    case 3: return OBSTACLE_DETECTED;
    default: return INVALID_LOAD;
  }
}