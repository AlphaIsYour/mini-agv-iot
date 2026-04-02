#pragma once
#include <stdlib.h>

// ─── MovingAverage — inline agar tidak butuh scaler.cpp ──────────────────────
// Sebelumnya ada scaler.cpp terpisah yang menyebabkan "undefined reference"
// karena Arduino tidak otomatis compile .cpp di subfolder tinyml/
class MovingAverage {
public:
  MovingAverage(int size) {
    _size   = size;
    _index  = 0;
    _sum    = 0;
    _buffer = (float*) malloc(sizeof(float) * size);
    for (int i = 0; i < size; i++) _buffer[i] = 0;
  }

  float update(float value) {
    _sum -= _buffer[_index];
    _buffer[_index] = value;
    _sum += value;
    _index = (_index + 1) % _size;
    return _sum / _size;
  }

private:
  int    _size;
  int    _index;
  float* _buffer;
  float  _sum;
};