/* ════════════════════════════════════════════════════════════════════════════
   EFFECTS.JS — Particle effects and visual bursts for 3D simulation
   Extracted from simulation3d.js
════════════════════════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { S, NODE_COLORS, NODE_3D } from "./state.js";

/* ════════════════════════════════════════════════════════════════════════════
   PARTICLE EFFECTS — Game-like sparkles and bursts
════════════════════════════════════════════════════════════════════════════ */

export function spawnMovementTrail() {
  if (!S.agvGroup || Math.abs(S.agvSpeed) < 0.5) return;

  const geo = new THREE.SphereGeometry(0.04, 4, 4);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffaa00,
    transparent: true,
    opacity: 0.6,
  });
  const particle = new THREE.Mesh(geo, mat);

  // Behind the AGV
  const behind = new THREE.Vector3(
    -Math.sin(S.agvHeading) * 0.7,
    0.1,
    -Math.cos(S.agvHeading) * 0.7
  );
  particle.position.copy(S.agvGroup.position).add(behind);
  particle.userData = {
    vx: (Math.random() - 0.5) * 0.5,
    vy: 0.5 + Math.random() * 0.5,
    vz: (Math.random() - 0.5) * 0.5,
    life: 1.0,
    decay: 1.5,
  };

  S.scene.add(particle);
  S.activeParticles.push(particle);
}

export function updateParticles(dt) {
  for (let i = S.activeParticles.length - 1; i >= 0; i--) {
    const p = S.activeParticles[i];
    const d = p.userData;

    d.life -= d.decay * dt;
    d.vy -= 6 * dt; // gravity

    p.position.x += d.vx * dt;
    p.position.y += d.vy * dt;
    p.position.z += d.vz * dt;
    p.material.opacity = Math.max(0, d.life);

    if (d.life <= 0 || p.position.y < -1) {
      S.scene.remove(p);
      p.geometry.dispose();
      p.material.dispose();
      S.activeParticles.splice(i, 1);
    }
  }
}

export function arrivalFlash() {
  const dest = S.currentMission || "BASE";
  const dp = NODE_3D[dest];
  if (!dp) return;

  const color = NODE_COLORS[dest] || 0xffffff;
  const colors = [color, 0xffcc00, 0xffffff];

  // Multi-ring burst
  colors.forEach((c, i) => {
    setTimeout(() => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.5, 24),
        new THREE.MeshBasicMaterial({
          color: c,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
        })
      );
      ring.position.set(dp.x, 0.3 + i * 0.1, dp.z);
      ring.rotation.x = -Math.PI / 2;
      S.scene.add(ring);

      let scale = 1;
      const anim = () => {
        scale += 0.06;
        ring.scale.set(scale, scale, 1);
        ring.material.opacity -= 0.025;
        if (ring.material.opacity > 0) {
          requestAnimationFrame(anim);
        } else {
          S.scene.remove(ring);
          ring.geometry.dispose();
          ring.material.dispose();
        }
      };
      anim();
    }, i * 120);
  });

  // Sparkle burst at arrival
  const burstColors = [0xff4488, 0x44ff88, 0xffcc00, 0x4488ff, 0xff8844];
  for (let i = 0; i < 8; i++) {
    const geo = new THREE.SphereGeometry(0.05, 4, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: burstColors[i % burstColors.length],
      transparent: true,
      opacity: 1,
    });
    const spark = new THREE.Mesh(geo, mat);
    spark.position.set(dp.x, 0.5, dp.z);
    const angle = (i / 8) * Math.PI * 2;
    spark.userData = {
      vx: Math.cos(angle) * 2.5,
      vy: 3 + Math.random() * 2,
      vz: Math.sin(angle) * 2.5,
      life: 1.0,
      decay: 1.2,
    };
    S.scene.add(spark);
    S.activeParticles.push(spark);
  }
}
