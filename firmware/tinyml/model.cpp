#include "model.h"
#include "model_data.h"

MLState predictML(float weight, float delta, float distance) {
  int r = predict(weight, delta, distance);

  switch (r) {
    case 0: return NO_OBJECT;
    case 1: return OBJECT_PRESENT;
    case 2: return OBJECT_PICKED;
    case 3: return OBSTACLE_DETECTED;
    default: return INVALID_LOAD;
  }
}