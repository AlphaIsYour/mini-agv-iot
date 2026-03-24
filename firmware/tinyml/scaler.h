#pragma once

class MovingAverage {
  public:
    MovingAverage(int size);
    float update(float value);

  private:
    int _size;
    int _index;
    float *_buffer;
    float _sum;
};