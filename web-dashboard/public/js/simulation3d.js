/* ════════════════════════════════════════════════════════════════════════════
   SIMULATION3D.JS — Main Orchestrator
   Imports modular components and runs the simulation loop.
   ES Module — uses importmap for three + OrbitControls
════════════════════════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* ── Module Imports ── */
import { S, ARENA_W, ARENA_H, NODE_3D, NODE_COLORS, svgTo3D } from "./sim3d/state.js";
import { buildArena, makeTextSprite } from "./sim3d/arena.js";
import { buildAGV, updateCargoIndicatorAnimation, updateCargoIndicatorTelemetry } from "./sim3d/agv.js";
import { buildExpandedWorld } from "./sim3d/world.js";
import { updateDoorSystem, updateExitGuidance } from "./sim3d/door.js";
import { updateInteractivePhysics } from "./sim3d/physics.js";
import { updateParticles, spawnMovementTrail, arrivalFlash } from "./sim3d/effects.js";
import { setupJoystick } from "./sim3d/joystick.js";
import { updateOcean } from "./sim3d/ocean.js";
import { setupPostProcessing, renderWithPostProcessing } from "./sim3d/postprocessing.js";
import { buildSkybox } from "./sim3d/skybox.js";

/* ════════════════════════════════════════════════════════════════════════════
   INITIALIZATION
════════════════════════════════════════════════════════════════════════════ */
window.initSimulation3D = async function () {
  if (S.initialized) {
    if (!S.simActive) {
      S.simActive = true;
      animate();
    }
    onResize();
    return;
  }

  const loadingEl = document.getElementById("sim3d-loading");
  if (loadingEl) loadingEl.classList.remove("hidden");

  try {
    setupScene();
    buildSkybox();
    buildArena();
    buildExpandedWorld();
    buildAGV();
    setupOrbitControls();
    setupHUD();
    bindWebSocket();
    bindKeyboard();
    checkDemoMode();

    S.initialized = true;
    S.simActive = true;

    setupPostProcessing();

    if (loadingEl) loadingEl.classList.add("hidden");
    animate();
  } catch (err) {
    console.error("[3D Sim] Init failed:", err);
    if (loadingEl) {
      loadingEl.querySelector(".sim3d-loading-text").textContent = "Failed to load: " + err.message;
    }
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   SCENE SETUP
════════════════════════════════════════════════════════════════════════════ */
function setupScene() {
  const wrap = document.getElementById("sim3d-canvas-wrap");
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;

  S.scene = new THREE.Scene();
  S.scene.background = new THREE.Color(0x87ceeb);
  S.scene.fog = new THREE.Fog(0x87ceeb, 80, 200);

  S.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
  S.camera.position.set(0, 7, 10);
  S.camera.lookAt(0, 0, 0);

  S.renderer = new THREE.WebGLRenderer({ antialias: true });
  S.renderer.setSize(w, h);
  S.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  S.renderer.shadowMap.enabled = true;
  S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  S.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  S.renderer.toneMappingExposure = 1.2;
  wrap.appendChild(S.renderer.domElement);

  // Lights — bright Roblox outdoor style
  S.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
  sun.position.set(8, 15, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  sun.shadow.camera.near = 0.5;
  S.scene.add(sun);
  S.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x44aa44, 0.5));

  S.clock = new THREE.Clock();
  window.addEventListener("resize", onResize);
}

function onResize() {
  const wrap = document.getElementById("sim3d-canvas-wrap");
  if (!wrap || !S.renderer) return;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  S.camera.aspect = w / h;
  S.camera.updateProjectionMatrix();
  S.renderer.setSize(w, h);
}

/* ════════════════════════════════════════════════════════════════════════════
   ORBIT CONTROLS
════════════════════════════════════════════════════════════════════════════ */
function setupOrbitControls() {
  S.controls = new OrbitControls(S.camera, S.renderer.domElement);
  S.controls.enableDamping = true;
  S.controls.dampingFactor = 0.08;
  S.controls.maxPolarAngle = Math.PI / 2.1;
  S.controls.minDistance = 3;
  S.controls.maxDistance = 35;
  S.controls.target.set(0, 0, 0);
}

/* ════════════════════════════════════════════════════════════════════════════
   HUD — Button bindings
════════════════════════════════════════════════════════════════════════════ */
function setupHUD() {
  // Camera toggle
  const camBtn = document.getElementById("sim3d-cam-toggle");
  if (camBtn) camBtn.addEventListener("click", () => {
    S.followCamera = !S.followCamera;
    camBtn.classList.toggle("active", S.followCamera);
  });

  // Reset camera
  const resetBtn = document.getElementById("sim3d-cam-reset");
  if (resetBtn) resetBtn.addEventListener("click", () => {
    if (S.agvGroup) {
      const tp = S.agvGroup.position.clone();
      const camAngle = S.agvHeading + Math.PI;
      S.camera.position.set(tp.x + Math.sin(camAngle) * 10, 7, tp.z + Math.cos(camAngle) * 10);
      S.controls.target.copy(tp);
      S.controls.update();
    }
  });

  // Fullscreen
  const fsBtn = document.getElementById("sim3d-fullscreen");
  if (fsBtn) fsBtn.addEventListener("click", () => {
    const wrap = document.getElementById("sim3d-canvas-wrap");
    if (!wrap) return;
    if (!document.fullscreenElement) {
      wrap.requestFullscreen().then(() => {
        fsBtn.querySelector("i").className = "fa-solid fa-compress";
        fsBtn.classList.add("active");
        setTimeout(onResize, 100);
      }).catch(() => {});
    } else {
      document.exitFullscreen().then(() => {
        fsBtn.querySelector("i").className = "fa-solid fa-expand";
        fsBtn.classList.remove("active");
        setTimeout(onResize, 100);
      }).catch(() => {});
    }
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && fsBtn) {
      fsBtn.querySelector("i").className = "fa-solid fa-expand";
      fsBtn.classList.remove("active");
      setTimeout(onResize, 100);
    }
  });

  // Mission buttons
  ["A", "B", "C"].forEach((dest) => {
    const btn = document.getElementById("sim3d-mission-" + dest.toLowerCase());
    if (btn) btn.addEventListener("click", () => {
      if (typeof window.wsSend === "function") window.wsSend({ type: "command", command: "GOTO_" + dest });
      startMissionAnimation(dest);
    });
  });

  // Return
  const returnBtn = document.getElementById("sim3d-return");
  if (returnBtn) returnBtn.addEventListener("click", () => {
    if (typeof window.wsSend === "function") window.wsSend({ type: "command", command: "RETURN" });
    startReturnAnimation();
  });

  // Joystick
  S.joystickUpdater = setupJoystick();

  // Mode chips
  document.querySelectorAll(".sim3d-mode-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const mode = chip.dataset.mode;
      if (typeof window.wsSend === "function") {
        window.wsSend({ type: "command", command: mode === "AUTO" ? "SET_MODE_AUTO" : "SET_MODE_MANUAL" });
      }
    });
  });

  // Demo toggle
  const demoBtn = document.getElementById("sim3d-demo-toggle");
  if (demoBtn) demoBtn.addEventListener("click", () => {
    S.demoMode = !S.demoMode;
    demoBtn.classList.toggle("active", S.demoMode);
    if (S.demoMode) startDemoSequence(); else stopDemoSequence();
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   WEBSOCKET
════════════════════════════════════════════════════════════════════════════ */
function bindWebSocket() {
  window.onAGVMessage = function ({ topic, data }) {
    if (!data || typeof data !== "object") return;
    S.lastRealTelemetry = Date.now();
    if (S.demoMode) { S.demoMode = false; stopDemoSequence(); }

    if (topic === "agv/agv-01/telemetry" || topic === "agv/agv-01/state") {
      if (data.state) { S.currentAGVState = data.state; updateStateDisplay(data.state); }
      if (data.mission != null) S.currentMission = data.mission === 0 ? "BASE" : String.fromCharCode(64 + data.mission);
      if (data.motor_left != null) S.motorL = data.motor_left;
      if (data.motor_right != null) S.motorR = data.motor_right;
      updateTelemetryHUD(data);
      if (S.agvGroup) {
        const cargo = S.agvGroup.children.find((c) => c.userData?.type === "cargo");
        if (cargo && data.cargo != null) cargo.visible = data.cargo === true || data.cargo === 1;
      }
      updateCargoIndicatorTelemetry(data);
    }
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   KEYBOARD
════════════════════════════════════════════════════════════════════════════ */
function bindKeyboard() {
  const keyMap = { ArrowUp: "FORWARD", ArrowDown: "BACKWARD", ArrowLeft: "LEFT", ArrowRight: "RIGHT",
    w: "FORWARD", s: "BACKWARD", a: "LEFT", d: "RIGHT", W: "FORWARD", S: "BACKWARD", A: "LEFT", D: "RIGHT", " ": "STOP" };
  let held = null;
  document.addEventListener("keydown", (e) => {
    const page = document.getElementById("page-simulation3d");
    if (!page || !page.classList.contains("active")) return;
    const cmd = keyMap[e.key];
    if (cmd) {
      e.preventDefault();
      if (held !== cmd) { sendManualCmd(cmd); held = cmd; }
    }
  });
  document.addEventListener("keyup", (e) => {
    const cmd = keyMap[e.key];
    if (cmd && held === cmd) { if (cmd !== "STOP") sendManualCmd("STOP"); held = null; }
  });
}

function sendManualCmd(cmd) {
  if (typeof window.wsSend === "function") window.wsSend({ type: "manual", command: cmd });
  simulateManualInput(cmd);
}

function simulateManualInput(cmd) {
  S.currentAGVState = "MANUAL";
  switch (cmd) {
    case "FORWARD": S.agvSpeed = 2; S.agvTurnRate = 0; break;
    case "BACKWARD": S.agvSpeed = -1.5; S.agvTurnRate = 0; break;
    case "LEFT": S.agvSpeed = 1; S.agvTurnRate = 2; break;
    case "RIGHT": S.agvSpeed = 1; S.agvTurnRate = -2; break;
    case "STOP": S.agvSpeed = 0; S.agvTurnRate = 0; break;
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   DEMO MODE
════════════════════════════════════════════════════════════════════════════ */
function checkDemoMode() {
  setTimeout(() => {
    if (!S.initialized) return;
    const page = document.getElementById("page-simulation3d");
    if (!page || !page.classList.contains("active")) return;
    const hasWS = typeof window.wsSend === "function" && document.getElementById("hws")?.classList.contains("on");
    if (!hasWS || S.lastRealTelemetry === 0) {
      S.demoMode = true;
      const btn = document.getElementById("sim3d-demo-toggle");
      if (btn) btn.classList.add("active");
      if (typeof window.showToast === "function") window.showToast("🎮 Demo Mode active!", "info");
      startDemoSequence();
    }
  }, 3000);
}

function startDemoSequence() {
  S.demoPhase = 0; S.demoTimer = 0;
  if (S.demoTelemetryInterval) clearInterval(S.demoTelemetryInterval);
  S.demoTelemetryInterval = setInterval(generateDemoTelemetry, 500);
  const pill = document.getElementById("sim3d-conn-pill");
  if (pill) { pill.classList.add("online"); pill.querySelector("span:last-child").textContent = "DEMO"; }
}

function stopDemoSequence() {
  S.demoPhase = 0; S.demoTimer = 0;
  if (S.demoTelemetryInterval) { clearInterval(S.demoTelemetryInterval); S.demoTelemetryInterval = null; }
  const pill = document.getElementById("sim3d-conn-pill");
  if (pill) pill.classList.remove("online");
}

function generateDemoTelemetry() {
  if (!S.demoMode) return;
  const baseSpeed = S.currentAGVState === "KEBERANGKATAN" || S.currentAGVState === "PULANG" ? 150 : 0;
  const jitter = () => Math.floor(Math.random() * 10 - 5);
  updateTelemetryHUD({
    state: S.currentAGVState, mission: S.currentMission === "BASE" ? 0 : S.currentMission.charCodeAt(0) - 64,
    motor_left: baseSpeed + jitter(), motor_right: baseSpeed + jitter(),
    loadcell_g: S.demoPhase >= 2 && S.demoPhase <= 3 ? 250 + jitter() : 0,
    cargo: S.demoPhase >= 2 && S.demoPhase <= 3 ? 1 : 0, wifi_rssi: -45 + jitter(),
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   MISSION ANIMATION
════════════════════════════════════════════════════════════════════════════ */
function startMissionAnimation(dest) {
  const destPos = NODE_3D[dest];
  if (!destPos) return;
  const route = [];
  const nodeOrder = ["BASE", "A", "B", "C"];
  const startNode = findNearestNode(S.agvGroup.position);
  const startIdx = nodeOrder.indexOf(startNode);
  const destIdx = nodeOrder.indexOf(dest);
  for (let i = Math.min(startIdx, destIdx); i <= Math.max(startIdx, destIdx); i++) {
    const p = NODE_3D[nodeOrder[i]];
    route.push(new THREE.Vector3(p.x, 0, p.z));
  }
  if (destIdx < startIdx) route.reverse();
  S.missionRoute = route;
  S.missionStartTime = S.clock.getElapsedTime();
  S.currentAGVState = "KEBERANGKATAN";
  S.currentMission = dest;
}

function startReturnAnimation() {
  const cp = S.agvGroup.position.clone();
  const bp = NODE_3D.BASE;
  S.missionRoute = [cp.clone(), new THREE.Vector3(cp.x - 2, 0, cp.z), new THREE.Vector3(bp.x - 4, 0, 0),
    new THREE.Vector3(bp.x - 3, 0, bp.z), new THREE.Vector3(bp.x, 0, bp.z)];
  S.missionStartTime = S.clock.getElapsedTime();
  S.currentAGVState = "PULANG";
  S.currentMission = "BASE";
}

function findNearestNode(pos) {
  let nearest = "BASE", minD = Infinity;
  for (const [name, np] of Object.entries(NODE_3D)) {
    const d = Math.hypot(pos.x - np.x, pos.z - np.z);
    if (d < minD) { minD = d; nearest = name; }
  }
  return nearest;
}

/* ════════════════════════════════════════════════════════════════════════════
   ANIMATION LOOP
════════════════════════════════════════════════════════════════════════════ */
function animate() {
  if (!S.simActive) return;
  requestAnimationFrame(animate);

  const dt = S.clock.getDelta();
  const elapsed = S.clock.getElapsedTime();

  // Demo sequence
  if (S.demoMode) updateDemoSequence(dt);

  // Joystick
  if (S.joystickUpdater) S.joystickUpdater(dt);

  // Physics
  updateAGVMovement(dt);
  updateMissionAnimation(dt, elapsed);

  // Wheel spin
  S.agvWheels.forEach((w) => { w.rotation.x += S.agvSpeed * 5 * dt; });

  // Idle bob
  if (S.currentAGVState === "IDLE" || S.currentAGVState === "SELESAI") {
    S.agvGroup.position.y = Math.abs(Math.sin(elapsed * 2.5)) * 0.08;
    S.agvGroup.rotation.z = Math.sin(elapsed * 1.8) * 0.02;
    S.agvGroup.rotation.x = Math.sin(elapsed * 2.2) * 0.015;
  } else {
    S.agvGroup.rotation.z *= 0.95;
    S.agvGroup.rotation.x *= 0.95;
  }

  // Cargo indicator
  updateCargoIndicatorAnimation(elapsed);

  // Door + exit guidance
  updateDoorSystem(dt, elapsed);
  updateExitGuidance();

  // Interactive physics
  updateInteractivePhysics(dt, elapsed);

  // Particles
  updateParticles(dt);
  if (Math.abs(S.agvSpeed) > 0.5 && Math.random() < 0.3) spawnMovementTrail();

  // Ocean waves
  updateOcean(elapsed);

  // Cloud drift
  S.scene.traverse((obj) => {
    if (obj.userData?.type === "cloud") {
      obj.position.x = obj.userData.baseX + Math.sin(elapsed * obj.userData.speed) * 3;
    }
    if (obj.userData?.type === "waypoint-ring") {
      const s = 1 + Math.sin(elapsed * 3 + obj.position.x) * 0.08;
      obj.scale.set(s, s, 1);
    }
    if (obj.userData?.type === "exit-sign") {
      const s = 1 + Math.sin(elapsed * 3) * 0.1;
      obj.scale.set(3.0 * s, 1.5 * s, 1);
    }
    if (obj.userData?.type === "exit-pillar") obj.material.opacity = 0.4 + Math.sin(elapsed * 4) * 0.3;
    if (obj.userData?.type === "exit-light") obj.scale.setScalar(1 + Math.sin(elapsed * 5) * 0.3);
  });

  // Camera follow
  if (S.followCamera && S.agvGroup) {
    const tp = S.agvGroup.position.clone();
    tp.y = 0;
    S.controls.target.lerp(tp, 0.03);
    const camAngle = S.agvHeading + Math.PI;
    const desired = new THREE.Vector3(tp.x + Math.sin(camAngle) * 10, tp.y + 7, tp.z + Math.cos(camAngle) * 10);
    S.camera.position.lerp(desired, 0.025);
  }

  S.controls.update();
  renderWithPostProcessing();
}

/* ════════════════════════════════════════════════════════════════════════════
   AGV MOVEMENT
════════════════════════════════════════════════════════════════════════════ */
function updateAGVMovement(dt) {
  if (Math.abs(S.agvSpeed) > 0.01 || Math.abs(S.agvTurnRate) > 0.01) {
    S.agvHeading += S.agvTurnRate * dt;
    S.agvGroup.position.x += Math.sin(S.agvHeading) * S.agvSpeed * dt;
    S.agvGroup.position.z += Math.cos(S.agvHeading) * S.agvSpeed * dt;

    const m = 0.8;
    const doorZMin = -2.5, doorZMax = 2.5;
    const inDoorZone = S.agvGroup.position.z > doorZMin && S.agvGroup.position.z < doorZMax;

    if (S.arenaExpanded) {
      S.agvGroup.position.x = THREE.MathUtils.clamp(S.agvGroup.position.x, -140 + m, 140 - m);
      S.agvGroup.position.z = THREE.MathUtils.clamp(S.agvGroup.position.z, -190 + m, 190 - m);
    } else if (inDoorZone) {
      S.agvGroup.position.z = THREE.MathUtils.clamp(S.agvGroup.position.z, -ARENA_H / 2 + m, ARENA_H / 2 + m);
      S.agvGroup.position.x = Math.min(ARENA_W / 2 - m, S.agvGroup.position.x);
    } else {
      S.agvGroup.position.x = THREE.MathUtils.clamp(S.agvGroup.position.x, -ARENA_W / 2 + m, ARENA_W / 2 - m);
      S.agvGroup.position.z = THREE.MathUtils.clamp(S.agvGroup.position.z, -ARENA_H / 2 + m, ARENA_H / 2 - m);
    }
    S.agvGroup.rotation.y = S.agvHeading;
  }

  S.agvSpeed *= 0.92;
  S.agvTurnRate *= 0.85;
  if (Math.abs(S.agvSpeed) < 0.01) S.agvSpeed = 0;
  if (Math.abs(S.agvTurnRate) < 0.01) S.agvTurnRate = 0;
}

function updateMissionAnimation(dt, elapsed) {
  if (S.missionRoute.length < 2) return;
  const totalDist = routeLength(S.missionRoute);
  const duration = Math.max(totalDist / 2, 2);
  const t = Math.min((elapsed - S.missionStartTime) / duration, 1);
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const pos = getPointOnRoute(S.missionRoute, eased);
  if (pos) {
    const next = getPointOnRoute(S.missionRoute, Math.min(eased + 0.01, 1));
    if (next) {
      const dx = next.x - pos.x, dz = next.z - pos.z;
      if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) S.agvHeading = Math.atan2(dx, dz);
    }
    S.agvGroup.position.set(pos.x, 0, pos.z);
    S.agvGroup.rotation.y = S.agvHeading;
    S.agvSpeed = totalDist / duration;
  }
  if (t >= 1) {
    S.missionRoute = [];
    S.agvSpeed = 0;
    S.currentAGVState = S.currentAGVState === "PULANG" ? "SELESAI" : "SAMPAI";
    arrivalFlash();
    if (S.demoMode) { S.demoPhase++; S.demoTimer = 0; }
  }
}

function routeLength(route) {
  let len = 0;
  for (let i = 1; i < route.length; i++) len += route[i].distanceTo(route[i - 1]);
  return len;
}

function getPointOnRoute(route, t) {
  if (route.length < 2) return route[0]?.clone();
  const total = routeLength(route);
  let target = t * total, acc = 0;
  for (let i = 1; i < route.length; i++) {
    const seg = route[i].distanceTo(route[i - 1]);
    if (acc + seg >= target) return new THREE.Vector3().lerpVectors(route[i - 1], route[i], (target - acc) / seg);
    acc += seg;
  }
  return route[route.length - 1].clone();
}

/* ════════════════════════════════════════════════════════════════════════════
   DEMO AUTO-SEQUENCE
════════════════════════════════════════════════════════════════════════════ */
function updateDemoSequence(dt) {
  S.demoTimer += dt;
  if (S.demoPhase === 0 && S.demoTimer > 2) {
    S.demoPhase = 1; S.demoTimer = 0;
    S.currentAGVState = "MENUNGGU_BARANG"; S.cargoHasCargo = false;
  } else if (S.demoPhase === 1 && S.demoTimer > 2.5) {
    S.demoPhase = 2; S.demoTimer = 0; S.cargoHasCargo = true;
    startMissionAnimation("A"); S.currentAGVState = "KEBERANGKATAN";
  } else if (S.demoPhase === 2 && S.missionRoute.length === 0 && S.demoTimer > 2) {
    S.demoPhase = 3; S.demoTimer = 0; S.cargoHasCargo = false; S.currentAGVState = "SAMPAI";
  } else if (S.demoPhase === 3 && S.demoTimer > 2) {
    S.demoPhase = 4; S.demoTimer = 0; S.cargoHasCargo = true;
    startMissionAnimation("B"); S.currentAGVState = "KEBERANGKATAN";
  } else if (S.demoPhase === 4 && S.missionRoute.length === 0 && S.demoTimer > 2) {
    S.demoPhase = 5; S.demoTimer = 0;
    startMissionAnimation("C"); S.currentAGVState = "KEBERANGKATAN";
  } else if (S.demoPhase === 5 && S.missionRoute.length === 0 && S.demoTimer > 2) {
    S.demoPhase = 6; S.demoTimer = 0; S.cargoHasCargo = false;
    startReturnAnimation(); S.currentAGVState = "PULANG";
  } else if (S.demoPhase === 6 && S.missionRoute.length === 0 && S.demoTimer > 3) {
    S.demoPhase = 0; S.demoTimer = 0;
    S.currentAGVState = "IDLE"; S.currentMission = "BASE"; S.cargoHasCargo = false;
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   HUD UPDATES
════════════════════════════════════════════════════════════════════════════ */
function updateStateDisplay(state) {
  const el = document.getElementById("sim3d-state-value");
  if (el) el.textContent = state;
  const pill = document.getElementById("sim3d-conn-pill");
  if (pill && !S.demoMode) {
    pill.classList.toggle("driving", ["KEBERANGKATAN", "PULANG", "MANUAL"].includes(state));
    const pt = pill.querySelector("span:last-child");
    if (pt) pt.textContent = state;
  }
}

function updateTelemetryHUD(data) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  if (data.state) updateStateDisplay(data.state);
  if (data.distance_cm != null) set("sim3d-dist", Math.round(data.distance_cm));
  if (data.loadcell_g != null) set("sim3d-load", Math.round(data.loadcell_g));
  if (data.motor_left != null) set("sim3d-ml", Math.round(data.motor_left));
  if (data.motor_right != null) set("sim3d-mr", Math.round(data.motor_right));
  if (data.wifi_rssi != null) set("sim3d-rssi", data.wifi_rssi);
  if (data.motor_left != null && data.motor_right != null) set("sim3d-speed", Math.round((Math.abs(data.motor_left) + Math.abs(data.motor_right)) / 2));
}

/* ════════════════════════════════════════════════════════════════════════════
   CLEANUP
════════════════════════════════════════════════════════════════════════════ */
window.pauseSimulation3D = function () {
  S.simActive = false;
  if (S.demoMode) stopDemoSequence();
};

window.syncAGV3DPosition = function (svgX, svgY) {
  if (!S.agvGroup) return;
  const p = svgTo3D(svgX, svgY);
  S.agvGroup.position.set(p.x, 0, p.z);
};
