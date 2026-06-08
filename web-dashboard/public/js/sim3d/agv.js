/* ════════════════════════════════════════════════════════════════════════════
   AGV.JS — Build the AGV model, cargo indicator, and related effects
   Extracted from simulation3d.js
════════════════════════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { S, NODE_3D } from "./state.js";

/* ── Helper: text sprite ── */
function makeTextSprite(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.roundRect(20, 10, 88, 44, 12);
  ctx.fill();

  ctx.font = "bold 28px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#" + new THREE.Color(color).getHexString();
  ctx.fillText(text, 64, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true })
  );
  sprite.scale.set(1.5, 0.75, 1);
  return sprite;
}

/* ════════════════════════════════════════════════════════════════════════════
   BUILD AGV
════════════════════════════════════════════════════════════════════════════ */
export function buildAGV() {
  S.agvGroup = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff6622, roughness: 0.5, metalness: 0.1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.4, metalness: 0.2 });

  // Main body — blocky Roblox style
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.4, 1.5),
    bodyMat
  );
  body.position.y = 0.4;
  body.castShadow = true;
  S.agvGroup.add(body);

  // Top plate (yellow accent)
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.1, 1.3),
    accentMat
  );
  top.position.y = 0.65;
  top.castShadow = true;
  S.agvGroup.add(top);

  // Front bumper (rounded-ish)
  const bumper = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.15, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.5 })
  );
  bumper.position.set(0, 0.25, 0.78);
  S.agvGroup.add(bumper);

  // Cargo box
  const cargo = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.3, 0.5),
    new THREE.MeshStandardMaterial({
      color: 0x8855cc, emissive: 0x8855cc, emissiveIntensity: 0.12, roughness: 0.4,
    })
  );
  cargo.position.set(0, 0.85, -0.1);
  cargo.castShadow = true;
  cargo.visible = false;
  cargo.userData = { type: "cargo" };
  S.agvGroup.add(cargo);

  // Sensor bar (front)
  const sensor = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.1, 0.12),
    darkMat
  );
  sensor.position.set(0, 0.22, 0.78);
  S.agvGroup.add(sensor);

  // IR dots (green glow)
  const dotGeo = new THREE.SphereGeometry(0.05, 6, 6);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
  for (let i = -2; i <= 2; i++) {
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(i * 0.14, 0.22, 0.85);
    S.agvGroup.add(dot);
  }

  // Ultrasonic sensors
  const usGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 8);
  const usMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.5 });
  [-0.15, 0.15].forEach((x) => {
    const us = new THREE.Mesh(usGeo, usMat);
    us.rotation.x = Math.PI / 2;
    us.position.set(x, 0.35, 0.82);
    S.agvGroup.add(us);
  });

  // 4 Wheels (blocky Roblox style)
  const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.14, 8);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });
  [
    [-0.55, 0.22, 0.5],
    [0.55, 0.22, 0.5],
    [-0.55, 0.22, -0.5],
    [0.55, 0.22, -0.5],
  ].forEach((pos) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(...pos);
    w.castShadow = true;
    S.agvGroup.add(w);
    S.agvWheels.push(w);
  });

  // Headlights (bright Roblox colors)
  const hlGeo = new THREE.SphereGeometry(0.07, 6, 6);
  const hlL = new THREE.Mesh(hlGeo, new THREE.MeshBasicMaterial({ color: 0xff3333 }));
  hlL.position.set(-0.38, 0.35, 0.78);
  S.agvGroup.add(hlL);
  const hlR = new THREE.Mesh(hlGeo, new THREE.MeshBasicMaterial({ color: 0x33ff33 }));
  hlR.position.set(0.38, 0.35, 0.78);
  S.agvGroup.add(hlR);

  // Antenna (Roblox-style detail)
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4),
    darkMat
  );
  antenna.position.set(0.3, 1.0, -0.4);
  S.agvGroup.add(antenna);
  const antennaTop = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 4, 4),
    new THREE.MeshBasicMaterial({ color: 0xff4444 })
  );
  antennaTop.position.set(0.3, 1.3, -0.4);
  S.agvGroup.add(antennaTop);

  // Position at BASE
  const bp = NODE_3D.BASE;
  S.agvGroup.position.set(bp.x, 0, bp.z);
  S.agvHeading = 0;
  S.agvGroup.rotation.y = 0;

  S.scene.add(S.agvGroup);

  // "No cargo" indicator — cardboard box with bouncing arrows
  buildCargoIndicator();
}

/* ════════════════════════════════════════════════════════════════════════════
   CARGO INDICATOR — "Taruh Barang Disini!"
════════════════════════════════════════════════════════════════════════════ */

function buildCargoIndicator() {
  S.cargoIndicatorGroup = new THREE.Group();

  // ── Cardboard box ──
  const boxGeo = new THREE.BoxGeometry(0.5, 0.35, 0.4);
  const boxMat = new THREE.MeshLambertMaterial({
    color: 0xc8a050,
    emissive: 0xc8a050,
    emissiveIntensity: 0.2,
  });
  const box = new THREE.Mesh(boxGeo, boxMat);
  box.castShadow = true;
  box.userData = { type: "cargo-indicator-box" };
  S.cargoIndicatorGroup.add(box);

  // Box tape stripe (top)
  const tapeGeo = new THREE.BoxGeometry(0.52, 0.02, 0.12);
  const tapeMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
  const tape = new THREE.Mesh(tapeGeo, tapeMat);
  tape.position.y = 0.18;
  S.cargoIndicatorGroup.add(tape);

  // Box tape stripe (front)
  const tapeFront = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.36, 0.01),
    tapeMat
  );
  tapeFront.position.z = 0.205;
  S.cargoIndicatorGroup.add(tapeFront);

  // ── "TARUH DISINI" text sprite ──
  const label = makeTextSprite("📦 TARUH DISINI!", 0xffcc00);
  label.position.set(0, 0.9, 0);
  label.scale.set(2.0, 1.0, 1);
  label.userData = { type: "cargo-indicator-label" };
  S.cargoIndicatorGroup.add(label);

  // ── Animated arrows (4 arrows pointing down from corners) ──
  const arrowDir = new THREE.Vector3(0, -1, 0);
  const arrowOrigin = [
    new THREE.Vector3(-0.35, 1.4, -0.25),
    new THREE.Vector3(0.35, 1.4, -0.25),
    new THREE.Vector3(-0.35, 1.4, 0.25),
    new THREE.Vector3(0.35, 1.4, 0.25),
  ];
  const arrowColors = [0xff6644, 0x44ff66, 0x4488ff, 0xffaa00];

  arrowOrigin.forEach((origin, i) => {
    const arrow = new THREE.ArrowHelper(
      arrowDir.clone(),
      origin,
      0.6,
      arrowColors[i],
      0.15,
      0.12
    );
    arrow.userData = { type: "cargo-indicator-arrow", baseY: origin.y, idx: i };
    S.cargoIndicatorGroup.add(arrow);
    S.cargoArrowHelpers.push(arrow);
  });

  // ── Sparkle particles (small spheres that float around) ──
  const sparkleGeo = new THREE.SphereGeometry(0.04, 6, 6);
  const sparkleColors = [0xff4488, 0x44ff88, 0xffcc00, 0x4488ff, 0xff8844];
  for (let i = 0; i < 8; i++) {
    const sparkleMat = new THREE.MeshBasicMaterial({
      color: sparkleColors[i % sparkleColors.length],
      transparent: true,
      opacity: 0.8,
    });
    const sparkle = new THREE.Mesh(sparkleGeo, sparkleMat);
    sparkle.userData = {
      type: "cargo-sparkle",
      angle: (i / 8) * Math.PI * 2,
      radius: 0.6 + Math.random() * 0.3,
      speed: 1.5 + Math.random() * 1.0,
      yBase: 0.5 + Math.random() * 0.5,
      yAmp: 0.2 + Math.random() * 0.2,
    };
    S.cargoIndicatorGroup.add(sparkle);
  }

  // Position above AGV
  S.cargoIndicatorGroup.position.set(0, 0, 0);
  S.cargoIndicatorGroup.visible = false;
  S.agvGroup.add(S.cargoIndicatorGroup);
}

/* ════════════════════════════════════════════════════════════════════════════
   CARGO INDICATOR ANIMATION
════════════════════════════════════════════════════════════════════════════ */
export function updateCargoIndicatorAnimation(elapsed) {
  if (!S.cargoIndicatorGroup) return;

  // Show/hide based on cargo state and AGV state
  const needsCargo =
    (S.currentAGVState === "MENUNGGU_BARANG" ||
      S.currentAGVState === "IDLE" ||
      S.currentAGVState === "SELESAI") &&
    !S.cargoHasCargo;

  S.cargoIndicatorGroup.visible = needsCargo;
  if (!needsCargo) return;

  // ── Box bounce ──
  const box = S.cargoIndicatorGroup.children.find(
    (c) => c.userData?.type === "cargo-indicator-box"
  );
  if (box) {
    box.position.y = 0.2 + Math.abs(Math.sin(elapsed * 3)) * 0.15;
    box.rotation.y = Math.sin(elapsed * 1.5) * 0.15;
    box.scale.setScalar(1 + Math.sin(elapsed * 4) * 0.05);
  }

  // ── Label bounce (offset from box) ──
  const label = S.cargoIndicatorGroup.children.find(
    (c) => c.userData?.type === "cargo-indicator-label"
  );
  if (label) {
    label.position.y = 0.9 + Math.sin(elapsed * 2.5) * 0.12;
    const ls = 1 + Math.sin(elapsed * 5) * 0.06;
    label.scale.set(2.0 * ls, 1.0 * ls, 1);
  }

  // ── Arrows bounce up and down ──
  S.cargoArrowHelpers.forEach((arrow) => {
    const idx = arrow.userData.idx;
    const phase = idx * 0.4;
    const bounce = Math.sin(elapsed * 4 + phase) * 0.25;
    arrow.position.y = arrow.userData.baseY + bounce;
    const s = 0.8 + Math.sin(elapsed * 3 + phase) * 0.2;
    arrow.scale.set(s, s, s);
  });

  // ── Sparkles orbit ──
  S.cargoIndicatorGroup.children.forEach((child) => {
    if (child.userData?.type === "cargo-sparkle") {
      const d = child.userData;
      const a = d.angle + elapsed * d.speed;
      child.position.set(
        Math.cos(a) * d.radius,
        d.yBase + Math.sin(elapsed * 2 + d.angle) * d.yAmp,
        Math.sin(a) * d.radius
      );
      child.material.opacity = 0.5 + Math.sin(elapsed * 4 + d.angle) * 0.4;
      const ss = 0.7 + Math.sin(elapsed * 5 + d.angle) * 0.3;
      child.scale.setScalar(ss);
    }
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   CARGO TELEMETRY
════════════════════════════════════════════════════════════════════════════ */
export function updateCargoIndicatorTelemetry(data) {
  if (data.cargo != null) {
    const hadCargo = S.cargoHasCargo;
    S.cargoHasCargo = data.cargo === true || data.cargo === 1;
    // Fun burst effect when cargo is loaded
    if (!hadCargo && S.cargoHasCargo) {
      spawnCargoBurst();
    }
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   CARGO BURST PARTICLES
════════════════════════════════════════════════════════════════════════════ */
export function spawnCargoBurst() {
  if (!S.agvGroup) return;
  const colors = [0xff4488, 0x44ff88, 0xffcc00, 0x4488ff, 0xff8844, 0xaa44ff];
  const count = 12;

  for (let i = 0; i < count; i++) {
    const geo = new THREE.SphereGeometry(0.06, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: colors[i % colors.length],
      transparent: true,
      opacity: 1.0,
    });
    const particle = new THREE.Mesh(geo, mat);

    // Start from AGV top
    const startPos = S.agvGroup.position.clone();
    startPos.y += 1.0;
    particle.position.copy(startPos);

    // Random velocity (burst outward)
    const angle = (i / count) * Math.PI * 2;
    const speed = 2 + Math.random() * 3;
    particle.userData = {
      vx: Math.cos(angle) * speed * 0.3,
      vy: 2 + Math.random() * 3,
      vz: Math.sin(angle) * speed * 0.3,
      life: 1.0,
      decay: 0.8 + Math.random() * 0.4,
    };

    S.scene.add(particle);
    S.activeParticles.push(particle);
  }
}
