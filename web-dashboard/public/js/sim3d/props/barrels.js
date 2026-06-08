/* ── Industrial Barrels ── */

import * as THREE from "three";
import { S } from "../state.js";

export function buildBarrels() {
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x4477aa, roughness: 0.5, metalness: 0.3 });
  const barrelPositions = [
    { x: -14, z: -10 }, { x: -14.5, z: -9.3 }, { x: -13.5, z: -9.5 },
    { x: -7, z: 16 }, { x: -7.5, z: 15.3 },
    { x: -15, z: 12 },
  ];

  barrelPositions.forEach((pos) => {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.35, 0.8, 12),
      barrelMat
    );
    barrel.position.set(pos.x, 0.4, pos.z);
    barrel.castShadow = true;
    S.scene.add(barrel);

    // Barrel ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.02, 6, 16),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7 })
    );
    ring.position.set(pos.x, 0.7, pos.z);
    ring.rotation.x = Math.PI / 2;
    S.scene.add(ring);
  });
}
