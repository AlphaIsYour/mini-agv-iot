/* ── Forklift Model ── */

import * as THREE from "three";
import { S } from "../state.js";

export function buildForklift() {
  const forkliftGroup = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.5, metalness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 });

  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 1.4), bodyMat);
  body.position.y = 0.6;
  body.castShadow = true;
  forkliftGroup.add(body);

  // Cabin
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.6, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x88bbee, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.5 })
  );
  cabin.position.set(0, 1.1, -0.2);
  forkliftGroup.add(cabin);

  // Mast
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.0, 0.1), darkMat);
  mast.position.set(0, 1.2, 0.7);
  forkliftGroup.add(mast);
  const mast2 = mast.clone();
  mast2.position.x = 0.3;
  forkliftGroup.add(mast2);

  // Forks
  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 1.0), darkMat);
  fork.position.set(-0.15, 0.2, 1.2);
  forkliftGroup.add(fork);
  const fork2 = fork.clone();
  fork2.position.x = 0.45;
  forkliftGroup.add(fork2);

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  [[-0.5, 0.2, -0.5], [0.5, 0.2, -0.5], [-0.5, 0.2, 0.4], [0.5, 0.2, 0.4]].forEach((p) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(...p);
    forkliftGroup.add(w);
  });

  forkliftGroup.position.set(-10, 0, -14);
  forkliftGroup.rotation.y = 0.3;
  S.scene.add(forkliftGroup);
}
