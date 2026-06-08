/* ════════════════════════════════════════════════════════════════════════════
   JOYSTICK.JS — MOBA-style on-screen joystick for manual AGV control
   Extracted from simulation3d.js
════════════════════════════════════════════════════════════════════════════ */

import { S } from "./state.js";

export function setupJoystick() {
  const base = document.querySelector(".sim3d-joystick-base");
  const stick = document.getElementById("sim3d-joystick-stick");
  if (!base || !stick) return null;

  // Hide joystick on desktop (WASD is default)
  const isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const joyWrap = document.getElementById("sim3d-joystick");
  if (joyWrap && !isMobile) {
    joyWrap.style.opacity = "0.3"; // dim on desktop, still usable
  }

  const baseRadius = 50;
  let dragging = false;
  let centerX = 0, centerY = 0;
  let joyTargetHeading = 0;
  let joyTargetSpeed = 0;
  let joyReverse = false;

  function updateFromPos(dx, dy) {
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, 1);

    if (clamped < 0.12) {
      // Dead zone — stop
      joyTargetSpeed = 0;
      joyTargetHeading = S.agvHeading;
      joyReverse = false;
      if (typeof window.wsSend === "function") {
        window.wsSend({ type: "manual", command: "STOP" });
      }
      if (speedLabel) speedLabel.textContent = "Speed: 0";
      if (dirLabel) dirLabel.textContent = "Dir: STOP";
      return;
    }

    // Joystick angle (screen space: up=0, right=PI/2, down=PI, left=-PI/2)
    const joyAngle = Math.atan2(dx, -dy);

    // Up component: how much the stick points "forward" (-1 to 1)
    const forward = -dy;
    joyReverse = forward < -0.2;

    if (joyReverse) {
      // Backward: just reverse, don't change heading
      joyTargetHeading = S.agvHeading;
      joyTargetSpeed = clamped * 1.5;
    } else {
      // Forward with steering
      const steerAngle = Math.atan2(-dx, -dy);
      joyTargetHeading = S.agvHeading + steerAngle;
      joyTargetSpeed = clamped * 2.0;
    }

    S.currentAGVState = "MANUAL";

    // Update labels
    if (speedLabel) speedLabel.textContent = "Speed: " + Math.round(clamped * 100);

    // Direction label
    const deg = ((joyAngle * 180 / Math.PI) + 360) % 360;
    let dirText = joyReverse ? "BWD" : "FWD";
    if (!joyReverse) {
      if (deg > 315 || deg <= 45) dirText = "FWD";
      else if (deg > 45 && deg <= 135) dirText = "RIGHT";
      else dirText = "LEFT";
    }
    if (dirLabel) dirLabel.textContent = "Dir: " + dirText;

    // Send to real AGV
    if (typeof window.wsSend === "function") {
      if (joyReverse) window.wsSend({ type: "manual", command: "BACKWARD" });
      else if (deg > 315 || deg <= 45) window.wsSend({ type: "manual", command: "FORWARD" });
      else if (deg > 45 && deg <= 135) window.wsSend({ type: "manual", command: "RIGHT" });
      else window.wsSend({ type: "manual", command: "LEFT" });
    }
  }

  function onStart(e) {
    e.preventDefault();
    dragging = true;
    const rect = base.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    stick.style.transition = "none";
  }

  function onMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > baseRadius) {
      dx = (dx / dist) * baseRadius;
      dy = (dy / dist) * baseRadius;
    }
    stick.style.transform = `translate(${dx}px, ${dy}px)`;
    updateFromPos(dx / baseRadius, dy / baseRadius);
  }

  function onEnd() {
    if (!dragging) return;
    dragging = false;
    stick.style.transition = "transform 0.15s ease";
    stick.style.transform = "translate(0, 0)";
    joyTargetSpeed = 0;
    joyTargetHeading = S.agvHeading;
    S.agvSpeed = 0;
    S.agvTurnRate = 0;
    if (typeof window.wsSend === "function") {
      window.wsSend({ type: "manual", command: "STOP" });
    }
    if (speedLabel) speedLabel.textContent = "Speed: 0";
    if (dirLabel) dirLabel.textContent = "Dir: STOP";
  }

  // Mouse events
  stick.addEventListener("mousedown", onStart);
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onEnd);

  // Touch events
  stick.addEventListener("touchstart", onStart);
  document.addEventListener("touchmove", onMove, { passive: false });
  document.addEventListener("touchend", onEnd);

  // Return control function — called each frame from animate()
  return function updateJoystick(dt) {
    if (joyTargetSpeed > 0.05) {
      if (joyReverse) {
        // Backward: smooth
        S.agvTurnRate = 0;
        S.agvSpeed += (-joyTargetSpeed - S.agvSpeed) * 0.1;
      } else {
        // Forward: smooth heading rotation + smooth speed
        let diff = joyTargetHeading - S.agvHeading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        const targetTurn = Math.max(-3, Math.min(3, diff * 3));
        S.agvTurnRate += (targetTurn - S.agvTurnRate) * 0.12;
        S.agvSpeed += (joyTargetSpeed - S.agvSpeed) * 0.1;
      }
    }
    // When joystick idle: decay handles slowdown naturally
  };
}
