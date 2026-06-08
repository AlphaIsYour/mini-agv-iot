/* ══════════════════════════════════════════════════════════════════════════════
   PHYSICS.JS — Collision detection, object physics, and particle effects
   Extracted from simulation3d.js
══════════════════════════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { S, PHYSICS_FRICTION, PHYSICS_GRAVITY, AUTO_REPAIR_DELAY, OUTER_W, OUTER_H } from "./state.js";

/* ── Interactive Physics ───────────────────────────────────────────────── */

export function updateInteractivePhysics(dt, elapsed) {
  updateBoxPhysics(dt);
  updateStatuePhysics(dt, elapsed);
  checkAGVCollisions();
  autoRepairObjects(dt);
}

function checkAGVCollisions() {
  if (!S.agvGroup || Math.abs(S.agvSpeed) < 0.3) return;

  const agvPos = S.agvGroup.position;
  const agvRadius = 0.7;

  // Check box collisions
  S.interactiveBoxes.forEach((box) => {
    if (box.userData.knocked) return;
    const dist = agvPos.distanceTo(box.position);
    if (dist < agvRadius + box.userData.size / 2) {
      knockBox(box);
    }
  });

  // Check statue collisions — only break the letter that's hit
  S.destructibleStatues.forEach((statue) => {
    if (statue.broken) return;
    const letters = statue.letters || statue.cubes;
    letters.forEach((letter) => {
      if (letter.userData.broken) return;
      // Get letter world position
      const letterWorldPos = new THREE.Vector3();
      letter.getWorldPosition(letterWorldPos);
      const dist = agvPos.distanceTo(letterWorldPos);
      if (dist < agvRadius + 0.8) {
        breakSingleLetter(statue, letter);
      }
    });
  });
}

function knockBox(box) {
  box.userData.knocked = true;
  box.userData.knockTime = 0;

  // Apply impulse from AGV
  const force = S.agvSpeed * 2;
  box.userData.velocity.set(
    Math.sin(S.agvHeading) * force + (Math.random() - 0.5) * 2,
    2 + Math.random() * 2,
    Math.cos(S.agvHeading) * force + (Math.random() - 0.5) * 2
  );
  box.userData.angularVel.set(
    (Math.random() - 0.5) * 8,
    (Math.random() - 0.5) * 8,
    (Math.random() - 0.5) * 8
  );

  // Spawn impact particles
  spawnImpactParticles(box.position, 0xc8a050, 6);
}

function breakSingleLetter(statue, letter) {
  letter.userData.broken = true;
  letter.userData.breakTime = 0;

  // Store the world position for auto-repair
  const worldPos = new THREE.Vector3();
  letter.getWorldPosition(worldPos);
  letter.userData.breakWorldPos = worldPos.clone();

  // Calculate explosion direction from statue center
  const statueCenter = statue.group.position.clone();
  statueCenter.y += 1.0;
  const dir = worldPos.clone().sub(statueCenter).normalize();
  if (dir.length() < 0.1) dir.set(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();

  const force = 2 + Math.random() * 2;
  letter.userData.velocity = new THREE.Vector3(
    dir.x * force + (Math.random() - 0.5) * 1.5,
    3 + Math.random() * 3,
    dir.z * force + (Math.random() - 0.5) * 1.5
  );
  letter.userData.angularVel = new THREE.Vector3(
    (Math.random() - 0.5) * 6,
    (Math.random() - 0.5) * 6,
    (Math.random() - 0.5) * 6
  );

  // Detach from group, add to scene for independent physics
  letter.position.copy(worldPos);
  S.scene.add(letter);

  // Mark statue as having broken letters (for auto-repair tracking)
  if (!statue.brokenLetters) statue.brokenLetters = [];
  statue.brokenLetters.push(letter);

  // Explosion effect
  spawnImpactParticles(worldPos, 0xffcc00, 12);
}

function updateBoxPhysics(dt) {
  S.interactiveBoxes.forEach((box) => {
    if (!box.userData.knocked) return;

    const vel = box.userData.velocity;
    const angVel = box.userData.angularVel;

    // Gravity
    vel.y -= PHYSICS_GRAVITY * dt;

    // Apply velocity
    box.position.x += vel.x * dt;
    box.position.y += vel.y * dt;
    box.position.z += vel.z * dt;

    // Apply angular velocity
    box.rotation.x += angVel.x * dt;
    box.rotation.y += angVel.y * dt;
    box.rotation.z += angVel.z * dt;

    // Ground collision
    if (box.position.y < box.userData.size / 2) {
      box.position.y = box.userData.size / 2;
      vel.y = -vel.y * 0.3; // bounce
      if (Math.abs(vel.y) < 0.5) vel.y = 0;
    }

    // Friction
    vel.x *= PHYSICS_FRICTION;
    vel.z *= PHYSICS_FRICTION;
    angVel.x *= PHYSICS_FRICTION;
    angVel.y *= PHYSICS_FRICTION;
    angVel.z *= PHYSICS_FRICTION;

    // Wall clamping (outer area)
    const maxX = OUTER_W / 2 - 0.5;
    const maxZ = OUTER_H / 2 - 0.5;
    if (Math.abs(box.position.x) > maxX) {
      box.position.x = Math.sign(box.position.x) * maxX;
      vel.x *= -0.5;
    }
    if (Math.abs(box.position.z) > maxZ) {
      box.position.z = Math.sign(box.position.z) * maxZ;
      vel.z *= -0.5;
    }
  });
}

function updateStatuePhysics(dt, elapsed) {
  S.destructibleStatues.forEach((statue) => {
    if (!statue.brokenLetters || statue.brokenLetters.length === 0) return;

    statue.brokenLetters.forEach((letter) => {
      if (!letter.userData.broken) return;

      const vel = letter.userData.velocity;
      const angVel = letter.userData.angularVel;

      vel.y -= PHYSICS_GRAVITY * dt;

      letter.position.x += vel.x * dt;
      letter.position.y += vel.y * dt;
      letter.position.z += vel.z * dt;

      letter.rotation.x += angVel.x * dt;
      letter.rotation.y += angVel.y * dt;
      letter.rotation.z += angVel.z * dt;

      // Ground bounce
      const groundY = 0.3;
      if (letter.position.y < groundY) {
        letter.position.y = groundY;
        vel.y = -vel.y * 0.25;
        if (Math.abs(vel.y) < 0.3) vel.y = 0;
        // Rolling friction on ground
        vel.x *= 0.95;
        vel.z *= 0.95;
        angVel.x *= 0.95;
        angVel.z *= 0.95;
      }

      vel.x *= PHYSICS_FRICTION;
      vel.z *= PHYSICS_FRICTION;
      angVel.multiplyScalar(PHYSICS_FRICTION);
    });
  });
}

function autoRepairObjects(dt) {
  // Auto-repair knocked boxes
  S.interactiveBoxes.forEach((box) => {
    if (!box.userData.knocked) return;
    box.userData.knockTime += dt;

    if (box.userData.knockTime >= AUTO_REPAIR_DELAY) {
      // Animate back to original position
      const orig = box.userData.originalPos;
      box.position.lerp(orig, 0.05);
      box.rotation.x *= 0.95;
      box.rotation.y *= 0.95;
      box.rotation.z *= 0.95;

      if (box.position.distanceTo(orig) < 0.05) {
        box.position.copy(orig);
        box.rotation.set(0, 0, 0);
        box.userData.knocked = false;
        box.userData.velocity.set(0, 0, 0);
        box.userData.angularVel.set(0, 0, 0);
        box.userData.knockTime = 0;
      }
    }
  });

  // Auto-repair statues (only broken letters)
  S.destructibleStatues.forEach((statue) => {
    if (!statue.brokenLetters || statue.brokenLetters.length === 0) return;

    // Check if any broken letter needs repair
    const needsRepair = statue.brokenLetters.some(l => l.userData.broken);
    if (!needsRepair) return;

    // Update breakTime for all broken letters
    statue.brokenLetters.forEach((letter) => {
      if (letter.userData.broken) letter.userData.breakTime += dt;
    });

    // Attempt repair after delay
    const oldestBreak = Math.max(...statue.brokenLetters.map(l => l.userData.breakTime || 0));
    if (oldestBreak >= AUTO_REPAIR_DELAY) {
      let allSettled = true;

      statue.brokenLetters.forEach((letter) => {
        if (!letter.userData.broken) return;

        // Convert original local position to world coordinates
        const origWorld = statue.group.localToWorld(letter.userData.originalPos.clone());

        // Animate back to world position
        letter.position.lerp(origWorld, 0.06);
        letter.rotation.x *= 0.88;
        letter.rotation.y *= 0.88;
        letter.rotation.z *= 0.88;

        if (letter.position.distanceTo(origWorld) > 0.15) {
          allSettled = false;
        }
      });

      if (allSettled) {
        statue.brokenLetters.forEach((letter) => {
          // Re-attach to statue group at original local position
          statue.group.add(letter);
          letter.position.copy(letter.userData.originalPos);
          letter.rotation.set(0, 0, 0);
          letter.userData.broken = false;
          letter.userData.velocity.set(0, 0, 0);
          letter.userData.angularVel.set(0, 0, 0);
          letter.userData.breakTime = 0;
        });
        statue.brokenLetters = [];

        if (typeof window.showToast === "function") {
          window.showToast(`✨ ${statue.name} sudah diperbaiki!`, "success");
        }
      }
    }
  });
}

export function spawnImpactParticles(position, color, count) {
  const colors = [0xff4488, 0x44ff88, 0xffcc00, 0x4488ff, 0xff8844, color];
  for (let i = 0; i < count; i++) {
    const geo = new THREE.SphereGeometry(0.05, 4, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: colors[i % colors.length], transparent: true, opacity: 1.0,
    });
    const particle = new THREE.Mesh(geo, mat);
    particle.position.copy(position);
    particle.position.y += 0.5;

    const angle = (i / count) * Math.PI * 2;
    const speed = 2 + Math.random() * 3;
    particle.userData = {
      vx: Math.cos(angle) * speed * 0.3,
      vy: 3 + Math.random() * 3,
      vz: Math.sin(angle) * speed * 0.3,
      life: 1.0,
      decay: 0.8 + Math.random() * 0.4,
    };

    S.scene.add(particle);
    S.activeParticles.push(particle);
  }
}
