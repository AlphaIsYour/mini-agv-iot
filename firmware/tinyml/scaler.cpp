#include "scaler.h"
#include <stdlib.h>

MovingAverage::MovingAverage(int size) {
  _size = size;
  _index = 0;
  _sum = 0;
  _buffer = (float*) malloc(sizeof(float) * size);

  for (int i = 0; i < size; i++) {
    _buffer[i] = 0;
  }
}

float MovingAverage::update(float value) {
  _sum -= _buffer[_index];
  _buffer[_index] = value;
  _sum += value;

  _index = (_index + 1) % _size;

  return _sum / _size;
}