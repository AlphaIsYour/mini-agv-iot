/* ════════════════════════════════════════════════════════════════════════════
   TERRAIN.JS — Island terrain with beach, concrete, and industrial zones
   Elliptical island shape with layered ground materials
════════════════════════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { S, WORLD_W, WORLD_H, ISLAND_RADIUS_X, ISLAND_RADIUS_Z, ARENA_W, ARENA_H } from "./state.js";

export function buildTerrain() {
  buildOceanFloor();
  buildBeachRing();
  buildIndustrialGround();
  buildArenaFloor();
  buildRoadMarkings();
  buildIslandEdge();
}

/* ── Ocean floor (dark, below water) ── */
function buildOceanFloor() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W * 3, WORLD_H * 3),
    new THREE.MeshStandardMaterial({ color: 0x1a3a4a, roughness: 1.0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2;
  S.scene.add(floor);
}

/* ── Beach ring (sand) ── */
function buildBeachRing() {
  // Create beach as a ring shape around the island
  const beachWidth = 15;
  const segments = 64;

  const beachGeo = new THREE.RingGeometry(
    Math.min(ISLAND_RADIUS_X, ISLAND_RADIUS_Z) - beachWidth,
    Math.min(ISLAND_RADIUS_X, ISLAND_RADIUS_Z),
    segments
  );
  beachGeo.rotateX(-Math.PI / 2);

  const beachMat = new THREE.MeshStandardMaterial({
    color: 0xd4a574,
    roughness: 0.9,
    metalness: 0.0,
  });

  const beach = new THREE.Mesh(beachGeo, beachMat);
  beach.position.y = 0.01;
  beach.receiveShadow = true;
  // Scale to match elliptical island
  beach.scale.set(ISLAND_RADIUS_X / Math.min(ISLAND_RADIUS_X, ISLAND_RADIUS_Z), 1, ISLAND_RADIUS_Z / Math.min(ISLAND_RADIUS_X, ISLAND_RADIUS_Z));
  S.scene.add(beach);

  // Beach scatter — shells, pebbles
  const pebbleGeo = new THREE.SphereGeometry(0.1, 4, 4);
  const pebbleMat = new THREE.MeshStandardMaterial({ color: 0xc4a882, roughness: 0.8 });
  for (let i = 0; i < 40; i++) {
    const angle = (i / 40) * Math.PI * 2;
    const r = Math.min(ISLAND_RADIUS_X, ISLAND_RADIUS_Z) - beachWidth / 2 + (Math.random() - 0.5) * beachWidth * 0.8;
    const x = Math.cos(angle) * r * (ISLAND_RADIUS_X / Math.min(ISLAND_RADIUS_X, ISLAND_RADIUS_Z));
    const z = Math.sin(angle) * r * (ISLAND_RADIUS_Z / Math.min(ISLAND_RADIUS_X, ISLAND_RADIUS_Z));
    const pebble = new THREE.Mesh(pebbleGeo, pebbleMat);
    pebble.position.set(x, 0.05, z);
    pebble.scale.setScalar(0.5 + Math.random() * 1.0);
    S.scene.add(pebble);
  }
}

/* ── Industrial ground (concrete) ── */
function buildIndustrialGround() {
  // Main concrete area — elliptical, slightly smaller than island
  const concreteGeo = new THREE.CircleGeometry(1, 64);
  concreteGeo.rotateX(-Math.PI / 2);

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x7a7a7a,
    roughness: 0.85,
    metalness: 0.05,
  });

  const concrete = new THREE.Mesh(concreteGeo, concreteMat);
  concrete.position.y = 0.02;
  concrete.scale.set(ISLAND_RADIUS_X * 0.85, 1, ISLAND_RADIUS_Z * 0.85);
  concrete.receiveShadow = true;
  S.scene.add(concrete);

  // Concrete seams (grid lines)
  const seamMat = new THREE.LineBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.3 });
  const seamStep = 10;
  for (let x = -120; x <= 120; x += seamStep) {
    const pts = [new THREE.Vector3(x, 0.03, -160), new THREE.Vector3(x, 0.03, 160)];
    S.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), seamMat));
  }
  for (let z = -160; z <= 160; z += seamStep) {
    const pts = [new THREE.Vector3(-120, 0.03, z), new THREE.Vector3(120, 0.03, z)];
    S.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), seamMat));
  }

  // Oil stains (dark patches)
  const stainMat = new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.15 });
  const stainPositions = [
    { x: 20, z: -30, s: 3 }, { x: -40, z: 50, s: 2 }, { x: 60, z: 20, s: 4 },
    { x: -20, z: -60, s: 2.5 }, { x: 80, z: -40, s: 3 },
  ];
  stainPositions.forEach((pos) => {
    const stain = new THREE.Mesh(new THREE.CircleGeometry(1, 12), stainMat);
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(pos.x, 0.025, pos.z);
    stain.scale.setScalar(pos.s);
    S.scene.add(stain);
  });
}

/* ── Arena floor (where AGV operates) ── */
function buildArenaFloor() {
  const arenaFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_W + 4, ARENA_H + 4),
    new THREE.MeshStandardMaterial({ color: 0x3a8c2d, roughness: 0.9 })
  );
  arenaFloor.rotation.x = -Math.PI / 2;
  arenaFloor.position.y = 0.03;
  arenaFloor.receiveShadow = true;
  S.scene.add(arenaFloor);

  // Arena border (colorful fence posts)
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.4 });
  const hw = ARENA_W / 2 + 2;
  const hh = ARENA_H / 2 + 2;
  const step = 3;

  for (let x = -hw; x <= hw; x += step) {
    addFencePost(x, -hh, postMat);
    addFencePost(x, hh, postMat);
  }
  for (let z = -hh; z <= hh; z += step) {
    addFencePost(-hw, z, postMat);
    addFencePost(hw, z, postMat);
  }
}

function addFencePost(x, z, mat) {
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), mat);
  post.position.set(x, 0.4, z);
  post.castShadow = true;
  S.scene.add(post);
}

/* ── Road markings (yellow lines on concrete) ── */
function buildRoadMarkings() {
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.4 });

  // Main road from arena to north
  const roadPts = [
    new THREE.Vector3(0, 0.04, -ARENA_H / 2 - 2),
    new THREE.Vector3(0, 0.04, -100),
  ];
  S.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(roadPts), lineMat));

  // Cross road
  const crossPts = [
    new THREE.Vector3(-80, 0.04, 0),
    new THREE.Vector3(80, 0.04, 0),
  ];
  S.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(crossPts), lineMat));

  // Dashed center lines
  const dashMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 2, gapSize: 2, transparent: true, opacity: 0.3 });
  const centerLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.04, -100), new THREE.Vector3(0, 0.04, 100)]),
    dashMat
  );
  centerLine.computeLineDistances();
  S.scene.add(centerLine);
}

/* ── Island edge (subtle ring showing where land meets water) ── */
function buildIslandEdge() {
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x8B7355, transparent: true, opacity: 0.4 });
  const points = [];
  const segments = 64;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(
      Math.cos(angle) * ISLAND_RADIUS_X,
      0.05,
      Math.sin(angle) * ISLAND_RADIUS_Z
    ));
  }
  S.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), edgeMat));
}
