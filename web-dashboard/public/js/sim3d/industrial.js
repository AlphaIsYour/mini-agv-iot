import * as THREE from "three";
import { S } from "./state.js";

export function buildIndustrial() {
  // ─── 1. Crane/Hoist at (90, 0, -30) ───
  const craneX = 90, craneZ = -30;
  const craneColor = 0xffcc00;

  // 4 vertical posts at corners of 8×6 rectangle
  const postGeo = new THREE.BoxGeometry(0.3, 12, 0.3);
  const postMat = new THREE.MeshStandardMaterial({ color: craneColor });
  const postPositions = [
    [craneX - 4, 6, craneZ - 3],
    [craneX + 4, 6, craneZ - 3],
    [craneX - 4, 6, craneZ + 3],
    [craneX + 4, 6, craneZ + 3],
  ];
  postPositions.forEach((pos) => {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(pos[0], pos[1], pos[2]);
    post.castShadow = true;
    S.scene.add(post);
  });

  // Top beam spanning the 8-unit width
  const topBeamGeo = new THREE.BoxGeometry(10, 0.4, 0.4);
  const topBeam = new THREE.Mesh(topBeamGeo, postMat);
  topBeam.position.set(craneX, 12, craneZ);
  topBeam.castShadow = true;
  S.scene.add(topBeam);

  // Cross beam spanning the 6-unit depth
  const crossBeamGeo = new THREE.BoxGeometry(0.4, 0.4, 8);
  const crossBeam = new THREE.Mesh(crossBeamGeo, postMat);
  crossBeam.position.set(craneX, 12, craneZ);
  crossBeam.castShadow = true;
  S.scene.add(crossBeam);

  // Hook hanging from center
  const hookGeo = new THREE.CylinderGeometry(0.1, 0.1, 3, 8);
  const hookMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const hook = new THREE.Mesh(hookGeo, hookMat);
  hook.position.set(craneX, 10.5, craneZ);
  hook.castShadow = true;
  S.scene.add(hook);

  // ─── 2. Pipe Network (ground pipes along z-axis) ───
  const pipeGeo = new THREE.CylinderGeometry(0.2, 0.2, 40, 8);
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
  const pipeXPositions = [30, 35, 40];

  pipeXPositions.forEach((px) => {
    const pipe = new THREE.Mesh(pipeGeo, pipeMat);
    pipe.position.set(px, 0.2, 0);
    pipe.rotation.x = Math.PI / 2; // lay on side along z-axis
    pipe.castShadow = true;
    S.scene.add(pipe);
  });

  // Pipe joints at ends
  const jointGeo = new THREE.SphereGeometry(0.25, 8, 8);
  const jointMat = new THREE.MeshStandardMaterial({ color: 0x777777 });
  pipeXPositions.forEach((px) => {
    [-20, 20].forEach((pz) => {
      const joint = new THREE.Mesh(jointGeo, jointMat);
      joint.position.set(px, 0.2, pz);
      S.scene.add(joint);
    });
  });

  // ─── 3. Fence with gate along x=100 (east side) ───
  const fenceX = 100;
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const postGeoFence = new THREE.BoxGeometry(0.1, 2, 0.1);

  // Posts every 4 units from z=-40 to z=40, skipping gate at z=-5 to z=5
  for (let z = -40; z <= 40; z += 4) {
    if (z >= -5 && z <= 5) continue; // gate gap
    const fp = new THREE.Mesh(postGeoFence, fenceMat);
    fp.position.set(fenceX, 1, z);
    fp.castShadow = true;
    S.scene.add(fp);
  }

  // Rails at y=0.8 and y=1.6
  const railGeo = new THREE.BoxGeometry(0.05, 0.05, 80);
  [0.8, 1.6].forEach((ry) => {
    const rail = new THREE.Mesh(railGeo, fenceMat);
    rail.position.set(fenceX, ry, 0);
    rail.castShadow = true;
    S.scene.add(rail);
  });

  // ─── 4. Bollards (yellow safety posts) ───
  const bollardGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 6);
  const bollardMat = new THREE.MeshStandardMaterial({ color: 0xffcc00 });
  const bollardPositions = [
    [-30, 0.4, -5],
    [-20, 0.4, -5],
    [-10, 0.4, -5],
    [0, 0.4, -5],
    [10, 0.4, -5],
    [20, 0.4, -5],
    [30, 0.4, -5],
    [40, 0.4, -5],
  ];
  bollardPositions.forEach((pos) => {
    const bollard = new THREE.Mesh(bollardGeo, bollardMat);
    bollard.position.set(pos[0], pos[1], pos[2]);
    bollard.castShadow = true;
    S.scene.add(bollard);
  });

  // ─── 5. Electrical Boxes ───
  const eBoxGeo = new THREE.BoxGeometry(1, 1.5, 0.5);
  const eBoxMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
  const stripeGeo = new THREE.BoxGeometry(0.8, 0.1, 0.52);
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffcc00 });
  const eBoxPositions = [
    [50, 0.75, -20],
    [-50, 0.75, 30],
    [70, 0.75, 70],
  ];
  eBoxPositions.forEach((pos) => {
    const box = new THREE.Mesh(eBoxGeo, eBoxMat);
    box.position.set(pos[0], pos[1], pos[2]);
    box.castShadow = true;
    S.scene.add(box);

    // Warning stripe on front face
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(pos[0], pos[1] + 0.5, pos[2] + 0.26);
    S.scene.add(stripe);
  });

  // ─── 6. Dumpster at (-60, 0, -40) ───
  const dumpX = -60, dumpZ = -40;
  const dumpBodyGeo = new THREE.BoxGeometry(2, 1.5, 1.5);
  const dumpBodyMat = new THREE.MeshStandardMaterial({ color: 0x336633 });
  const dumpBody = new THREE.Mesh(dumpBodyGeo, dumpBodyMat);
  dumpBody.position.set(dumpX, 0.75, dumpZ);
  dumpBody.castShadow = true;
  S.scene.add(dumpBody);

  // Lid slightly open (tilted back)
  const dumpLidGeo = new THREE.BoxGeometry(2.1, 0.1, 1.6);
  const dumpLidMat = new THREE.MeshStandardMaterial({ color: 0x2a5a2a });
  const dumpLid = new THREE.Mesh(dumpLidGeo, dumpLidMat);
  dumpLid.position.set(dumpX, 1.55, dumpZ - 0.6);
  dumpLid.rotation.x = -0.4; // slightly open angle
  dumpLid.castShadow = true;
  S.scene.add(dumpLid);
}
