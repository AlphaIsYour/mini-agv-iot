import * as THREE from "three";
import { S } from "./state.js";

export function buildLampposts() {
  const positions = [
    [-20, -30], [20, -30], [-20, 30], [20, 30],
    [-50, 0], [50, 0], [0, -60], [0, 60],
    [-80, -40], [80, -40], [-80, 40], [80, 40],
  ];

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffeedd,
    emissive: 0xffeedd,
    emissiveIntensity: 1.0,
  });

  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 5, 6);
  const armGeo = new THREE.BoxGeometry(1.5, 0.06, 0.06);
  const housingGeo = new THREE.BoxGeometry(0.4, 0.15, 0.3);
  const bulbGeo = new THREE.SphereGeometry(0.08, 6, 6);

  for (const [x, z] of positions) {
    // Pole
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 2.5, z);
    pole.castShadow = true;
    S.scene.add(pole);

    // Arm
    const arm = new THREE.Mesh(armGeo, poleMat);
    arm.position.set(x + 0.75, 5, z);
    arm.castShadow = true;
    S.scene.add(arm);

    // Lamp housing
    const housing = new THREE.Mesh(housingGeo, housingMat);
    housing.position.set(x + 1.5, 4.9, z);
    housing.castShadow = true;
    S.scene.add(housing);

    // Light bulb
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(x + 1.5, 4.8, z);
    bulb.castShadow = true;
    S.scene.add(bulb);

    // Point light
    const light = new THREE.PointLight(0xffeedd, 0.4, 15);
    light.position.set(x + 1.5, 4.8, z);
    S.scene.add(light);
  }
}
