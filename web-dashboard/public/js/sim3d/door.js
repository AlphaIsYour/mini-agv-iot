/* ════════════════════════════════════════════════════════════════════════════
   DOOR.JS — Door system and exit guidance for 3D simulation
   Extracted from simulation3d.js
════════════════════════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { S, OUTER_W, OUTER_H, ARENA_W, ARENA_H } from "./state.js";
import { makeTextSprite } from "./arena.js";

/* ── Door Frame ── */
function buildDoorFrame(x, z, width) {
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0xffcc00, roughness: 0.3, metalness: 0.6,
  });
  const frameW = 0.15;
  const frameH = 3.5;

  // Left post
  const postL = new THREE.Mesh(new THREE.BoxGeometry(frameW, frameH, frameW), frameMat);
  postL.position.set(x, frameH / 2, z - width / 2);
  S.scene.add(postL);

  // Right post
  const postR = new THREE.Mesh(new THREE.BoxGeometry(frameW, frameH, frameW), frameMat);
  postR.position.set(x, frameH / 2, z + width / 2);
  S.scene.add(postR);

  // Top beam
  const beam = new THREE.Mesh(new THREE.BoxGeometry(frameW, frameW, width + frameW), frameMat);
  beam.position.set(x, frameH, z);
  S.scene.add(beam);

  // "EXIT" sign above door
  const exitSign = makeTextSprite("EXIT", 0xff4444);
  exitSign.position.set(x + 0.3, frameH + 0.6, z);
  exitSign.scale.set(1.5, 0.75, 1);
  S.scene.add(exitSign);
}

/* ── Door Mesh (sliding panel) ── */
function buildDoor(x, z, width) {
  S.doorGroup = new THREE.Group();

  // Door panel
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x666666, roughness: 0.4, metalness: 0.5,
  });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.2, width - 0.2), panelMat);
  panel.position.set(0, 1.6, 0);
  panel.castShadow = true;
  S.doorGroup.add(panel);

  // Door stripes (yellow-black hazard)
  for (let i = -3; i <= 3; i++) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.08, 0.2),
      new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xffcc00 : 0x222222 })
    );
    stripe.position.set(0, 1.6 + i * 0.2, 0);
    S.doorGroup.add(stripe);
  }

  // Door handle
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8),
    new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8 })
  );
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0.08, 1.6, 0.3);
  S.doorGroup.add(handle);

  // Status light (red = closed, green = open)
  S.doorLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  );
  S.doorLight.position.set(0.2, 3.0, 0);
  S.doorGroup.add(S.doorLight);

  S.doorGroup.position.set(x - 0.15, 0, z);
  S.doorGroup.userData = { type: "door", closedZ: 0, openZ: -width };
  S.scene.add(S.doorGroup);

  // Progress bar (3D sprite above door)
  S.doorProgressBar = createProgressBar();
  S.doorProgressBar.position.set(x - 0.5, 3.8, z);
  S.doorProgressBar.visible = false;
  S.scene.add(S.doorProgressBar);
}

function createProgressBar() {
  const group = new THREE.Group();

  // Background bar
  const bg = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.15, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x333333 })
  );
  group.add(bg);

  // Fill bar
  const fill = new THREE.Mesh(
    new THREE.BoxGeometry(0.01, 0.12, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x44ff88 })
  );
  fill.position.z = 0.01;
  fill.userData = { type: "progress-fill" };
  group.add(fill);

  // Label
  const label = makeTextSprite("MENUNGGU...", 0xffcc00);
  label.position.set(0, 0.4, 0);
  label.scale.set(1.8, 0.9, 1);
  group.add(label);

  return group;
}

/* ── Exit Guidance — hidden by default, shown when AGV near left area ── */

function buildOuterFloorMarkings() {
  const doorX = -ARENA_W / 2;  // Door is on arena left wall
  const doorZ = 0;

  // ── Small door frame indicator (always visible, subtle) ──
  const frameMat = new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.3 });
  // Two small posts
  [-1.5, 1.5].forEach((offset) => {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.5, 6),
      frameMat
    );
    post.position.set(doorX + 0.2, 1.25, doorZ + offset);
    S.scene.add(post);
  });
  // Top beam
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 3.0),
    frameMat
  );
  beam.position.set(doorX + 0.2, 2.5, doorZ);
  S.scene.add(beam);

  // ── Everything below: HIDDEN by default, shown when AGV approaches ──

  // Glowing path strip (short strip near the door)
  const pathStrip = new THREE.Mesh(
    new THREE.BoxGeometry(3, 0.01, 1.5),
    new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.25 })
  );
  pathStrip.position.set(doorX + 1.5, 0.015, doorZ);
  pathStrip.visible = false;
  pathStrip.userData = { type: "exit-guide" };
  S.scene.add(pathStrip);
  S.exitGuidanceObjects.push(pathStrip);

  // Direction arrows (pointing left toward door)
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.6 });
  [{ x: -2, z: 0 }, { x: -3.5, z: 0 }].forEach((pos) => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.2), arrowMat);
    body.position.set(pos.x, 0.02, pos.z);
    body.visible = false;
    body.userData = { type: "exit-guide" };
    S.scene.add(body);
    S.exitGuidanceObjects.push(body);

    const headL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.08), arrowMat);
    headL.position.set(pos.x - 0.5, 0.02, pos.z - 0.15);
    headL.rotation.z = 0.5;
    headL.visible = false;
    headL.userData = { type: "exit-guide" };
    S.scene.add(headL);
    S.exitGuidanceObjects.push(headL);

    const headR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.08), arrowMat);
    headR.position.set(pos.x - 0.5, 0.02, pos.z + 0.15);
    headR.rotation.z = -0.5;
    headR.visible = false;
    headR.userData = { type: "exit-guide" };
    S.scene.add(headR);
    S.exitGuidanceObjects.push(headR);
  });

  // EXIT sign
  const exitSprite = makeTextSprite(">>> EXIT <<<", 0x44ff88);
  exitSprite.position.set(doorX + 0.5, 3.5, doorZ);
  exitSprite.scale.set(3.0, 1.5, 1);
  exitSprite.visible = false;
  exitSprite.userData = { type: "exit-guide" };
  S.scene.add(exitSprite);
  S.exitGuidanceObjects.push(exitSprite);

  // STOP HERE indicator
  const stopSprite = makeTextSprite("STOP HERE", 0xff4444);
  stopSprite.position.set(doorX + 2.5, 0.5, doorZ);
  stopSprite.scale.set(2.5, 1.2, 1);
  stopSprite.visible = false;
  stopSprite.userData = { type: "exit-guide" };
  S.scene.add(stopSprite);
  S.exitGuidanceObjects.push(stopSprite);

  // Stop circle
  const stopCircle = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1.0, 24),
    new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
  );
  stopCircle.rotation.x = -Math.PI / 2;
  stopCircle.position.set(doorX + 2.5, 0.03, doorZ);
  stopCircle.visible = false;
  stopCircle.userData = { type: "exit-guide" };
  S.scene.add(stopCircle);
  S.exitGuidanceObjects.push(stopCircle);

  // Glowing pillars
  const pillarMat = new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.6 });
  [-1.5, 1.5].forEach((offset) => {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 3.5, 8),
      pillarMat
    );
    pillar.position.set(doorX + 0.3, 1.75, doorZ + offset);
    pillar.visible = false;
    pillar.userData = { type: "exit-guide" };
    S.scene.add(pillar);
    S.exitGuidanceObjects.push(pillar);

    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x44ff88 })
    );
    light.position.set(doorX + 0.3, 3.6, doorZ + offset);
    light.visible = false;
    light.userData = { type: "exit-guide" };
    S.scene.add(light);
    S.exitGuidanceObjects.push(light);
  });

  // Floor EXIT text
  const floorExit = makeTextSprite("EXIT", 0x44ff88);
  floorExit.position.set(doorX + 1.5, 0.3, doorZ);
  floorExit.scale.set(2.0, 1.0, 1);
  floorExit.visible = false;
  floorExit.userData = { type: "exit-guide" };
  S.scene.add(floorExit);
  S.exitGuidanceObjects.push(floorExit);

  // Point light at door
  const doorGlow = new THREE.PointLight(0x44ff88, 1.5, 8);
  doorGlow.position.set(doorX + 0.5, 2, doorZ);
  doorGlow.visible = false;
  doorGlow.userData = { type: "exit-guide" };
  S.scene.add(doorGlow);
  S.exitGuidanceObjects.push(doorGlow);
}

/* ── Show/hide exit guidance based on AGV position ── */
export function updateExitGuidance() {
  if (!S.agvGroup || S.arenaExpanded) {
    // Already outside — hide all guidance
    S.exitGuidanceObjects.forEach((obj) => { obj.visible = false; });
    return;
  }
  // Show guidance when AGV is in the left half of arena
  const show = S.agvGroup.position.x < -1;
  S.exitGuidanceObjects.forEach((obj) => { obj.visible = show; });
}

/* ── Door Popup ── */
function showDoorPopup(isInside) {
  const popup = document.getElementById("sim3d-door-popup");
  const title = document.getElementById("sim3d-door-popup-title");
  const yesBtn = document.getElementById("sim3d-door-yes");
  const noBtn = document.getElementById("sim3d-door-no");

  if (!popup) return;

  popup.classList.remove("hidden");
  title.textContent = isInside ? "🚪 Keluar dari arena?" : "🚪 Masuk ke arena?";

  // Remove old listeners
  const newYes = yesBtn.cloneNode(true);
  const newNo = noBtn.cloneNode(true);
  yesBtn.parentNode.replaceChild(newYes, yesBtn);
  noBtn.parentNode.replaceChild(newNo, noBtn);

  newYes.addEventListener("click", () => {
    popup.classList.add("hidden");
    S.doorState = "opening";
    // Auto-drive AGV through door
    S.agvSpeed = 2;
    S.agvGroup.rotation.y = isInside ? -Math.PI / 2 : Math.PI / 2;
    if (typeof window.showToast === "function") {
      window.showToast(isInside ? "🏭 Keluar ke area gudang utama!" : "📦 Masuk ke arena AGV!", "info");
    }
  });

  newNo.addEventListener("click", () => {
    popup.classList.add("hidden");
    S.doorState = "closed";
    S.doorTimer = 0;
  });
}

/* ── Update Door System ── */
export function updateDoorSystem(dt, elapsed) {
  if (!S.doorGroup || !S.agvGroup) return;

  const doorX = -ARENA_W / 2;  // Door is on arena left wall
  const doorZ = 0;
  const agvPos = S.agvGroup.position;

  // Check if AGV is near the door
  const isNearDoor =
    Math.abs(agvPos.x - doorX) < 2.0 &&
    Math.abs(agvPos.z - doorZ) < 2.0;

  // Is AGV inside arena?
  const isInsideArena =
    agvPos.x > -ARENA_W / 2 - 1 &&
    agvPos.x < ARENA_W / 2 + 1;

  if (S.doorState === "closed") {
    if (isNearDoor) {
      S.doorTimer += dt;
      S.doorProgressBar.visible = true;

      const fill = S.doorProgressBar.children.find(c => c.userData?.type === "progress-fill");
      if (fill) {
        const progress = Math.min(S.doorTimer / 3, 1);
        fill.scale.x = Math.max(0.01, progress * 1.4);
        fill.position.x = -0.7 + (progress * 0.7);
      }

      if (S.doorTimer >= 3) {
        S.doorState = "waiting";
        S.doorProgressBar.visible = false;
        showDoorPopup(isInsideArena);
      }
    } else {
      S.doorTimer = Math.max(0, S.doorTimer - dt * 2);
      S.doorProgressBar.visible = false;
    }
  }

  if (S.doorState === "opening") {
    // Slide door open
    const targetZ = S.doorGroup.userData.closedZ - 2.2;
    S.doorGroup.position.z += (targetZ - S.doorGroup.position.z) * 0.08;
    S.doorLight.material.color.setHex(0x00ff00);

    // Move AGV through the door
    S.agvSpeed = 2;
    S.agvHeading = -Math.PI / 2; // Move left (toward -X)

    // Once AGV is outside arena, mark as expanded
    if (S.agvGroup.position.x < -ARENA_W / 2 - 1) {
      S.doorState = "open";
      S.arenaExpanded = true;
      S.agvSpeed = 0;
    }
  }

  if (S.doorState === "open") {
    S.doorLight.material.color.setHex(
      Math.sin(elapsed * 4) > 0 ? 0x00ff00 : 0x00aa00
    );

    // Close door when AGV moves away
    if (S.agvGroup.position.x < -ARENA_W / 2 - 3 || S.agvGroup.position.x > -ARENA_W / 2 + 3) {
      S.doorState = "closing";
    }
  }

  if (S.doorState === "closing") {
    S.doorGroup.position.z += (S.doorGroup.userData.closedZ - S.doorGroup.position.z) * 0.05;
    S.doorLight.material.color.setHex(0xff4400);

    if (Math.abs(S.doorGroup.position.z - S.doorGroup.userData.closedZ) < 0.05) {
      S.doorState = "closed";
      S.doorLight.material.color.setHex(0xff0000);
      S.doorGroup.position.z = S.doorGroup.userData.closedZ;
    }
  }
}

/* ── Build Door System (public entry point) ── */
export function buildDoorSystem() {
  const doorX = -ARENA_W / 2;  // On the left wall of the arena
  const doorZ = 0;
  const doorWidth = 3;

  buildDoorFrame(doorX, doorZ, doorWidth);
  buildDoor(doorX, doorZ, doorWidth);
  buildOuterFloorMarkings();
}
