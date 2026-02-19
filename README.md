# Mini AGV IoT Project

## Overview

The **Mini AGV IoT Project** is a small-scale indoor logistics simulation using an ESP32-based Automated Guided Vehicle (AGV).  
This project was developed as a **final semester assignment (UAS)** with a focus on **automation systems**, **IoT-based control**, and **human–machine interaction**.

The system demonstrates how autonomous vehicles can be applied in controlled indoor environments such as warehouses, laboratories, or educational simulations.

---

## Project Description

The Mini AGV is designed to transport small items placed on its platform to predefined destinations (A, B, or C) within an indoor arena.

Navigation is performed using **IR line follower sensors**, while system control and monitoring are handled through a **web-based dashboard**.  
Before execution, the system validates delivery conditions such as object presence and destination selection to ensure safe operation.

---

## Key Features

- Automatic navigation using IR line follower sensors
- Destination selection via web dashboard (A, B, C)
- Manual mode and automatic mode
- Delivery condition validation (object detection and valid destination)
- System status feedback with visual and/or audio indicators
- Modular architecture prepared for TinyML integration (decision-making logic)

---

## System Architecture

The system consists of three main layers:

1. **Hardware Layer**  
   ESP32, IR sensors, DC motors, motor driver, and mechanical platform.

2. **Firmware Layer**  
   Handles sensor processing, navigation logic, motor control, and communication.

3. **Application Layer**  
   Web dashboard for monitoring, control, and interaction.

The architecture is intentionally modular to support future expansion, including machine learning–based decision systems.

---

## Technologies Used

- ESP32 microcontroller
- IR Line Follower Sensors
- DC Motors and Motor Driver
- Web Dashboard
  - HTML
  - CSS
  - JavaScript
- TinyML (optional, for decision classification)

---

## Repository Structure

```text
mini-agv-iot/
├─ firmware/        # ESP32 firmware and system logic
├─ web-dashboard/   # Web interface for control and monitoring
├─ docs/            # Project documentation
├─ diagrams/        # System diagrams and flowcharts
└─ README.md
```

# Development Team

This project was developed by a student team as part of a university final assessment.
Team responsibilities were divided into:

- Mechanical design
- Electronics and wiring
- Firmware development
- Web interface and user interaction

---

# Limitations

This project is a simulation of an indoor logistics system and is not intended for real industrial deployment.
Performance, safety, and reliability are limited by its educational scope.

---

Future Improvements

- Integration of TinyML for adaptive route or decision selection
- Obstacle detection and avoidance
- Data logging and analytics
- Multi-AGV coordination
- Mobile-responsive dashboard

---

# License

This project is licensed under the MIT License.

MIT License

Copyright (c) 2026 Mini AGV IoT Project

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

---

# Disclaimer

This project is intended for educational and research purposes only.
