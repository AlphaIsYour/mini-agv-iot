#pragma once

inline int predict(float weight, float delta, float distance) {

  if (distance <= 54.00) {
    return 3;
  } else {
    
    if (delta <= -12.50) {
      return 2;
    } else {
      
      if (weight <= 42.50) {
        return 0;
      } else {
        return 1;
      }

    }

  }
}