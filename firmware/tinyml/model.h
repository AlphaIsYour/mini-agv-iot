#pragma once

enum MLState {
  NO_OBJECT,
  OBJECT_PRESENT,
  OBJECT_PICKED,
  OBSTACLE_DETECTED,
  INVALID_LOAD
};

MLState predictML(float weight, float delta, float distance);