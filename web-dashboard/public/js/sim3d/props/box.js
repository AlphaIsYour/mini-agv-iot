/* ── Interactive Knockable Boxes ── */

import * as THREE from "three";
import { S } from "../state.js";

export function buildInteractiveBoxes() {
  const boxPositions = [
    { x: -10, z: -6 }, { x: -12, z: 3 }, { x: -8, z: 7 },
    { x: -14, z: -2 }, { x: -11, z: 10 }, { x: -9, z: -10 },
    { x: -13, z: 6 }, { x: -7, z: -4 }, { x: -15, z: 0 },
    { x: -10, z: 12 }, { x: -12, z: -8 }, { x: -8, z: 2 },
  ];

  boxPositions.forEach((pos) => {
    const size = 0.3 + Math.random() * 0.3;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshStandardMaterial({
        color: 0xc8a050, roughness: 0.8,
      })
    );
    box.position.set(pos.x, size / 2, pos.z);
    box.castShadow = true;
    box.receiveShadow = true;

    // Tape stripe on box
    const tape = new THREE.Mesh(
      new THREE.BoxGeometry(size + 0.01, 0.02, size * 0.2),
      new THREE.MeshStandardMaterial({ color: 0x8B6914 })
    );
    tape.position.y = size / 2 + 0.01;
    box.add(tape);

    box.userData = {
      type: "interactive-box",
      velocity: new THREE.Vector3(0, 0, 0),
      angularVel: new THREE.Vector3(0, 0, 0),
      size: size,
      knocked: false,
      originalPos: new THREE.Vector3(pos.x, size / 2, pos.z),
      originalRot: new THREE.Euler(0, 0, 0),
      knockTime: 0,
    };

    S.scene.add(box);
    S.interactiveBoxes.push(box);
  });
}
