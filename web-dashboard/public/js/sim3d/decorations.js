/* ════════════════════════════════════════════════════════════════════════════
   DECORATIONS.JS — Decorative props for the Roblox-style 3D warehouse island
   Road cones, tire stacks, warning signs, bench, water tower, fuel tank,
   generator, and rocks.
════════════════════════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { S } from "./state.js";

/* ── Local helper: text-on-canvas sprite (same pattern as arena.js) ── */
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

/* ── Shared materials (reuse across decorations) ── */
const mat = {
  cone: new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.6 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }),
  signPost: new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.3 }),
  signBoard: new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.4 }),
  benchWood: new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 }),
  benchLeg: new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.5, metalness: 0.3 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.4, metalness: 0.4 }),
  tankBody: new THREE.MeshStandardMaterial({ color: 0x4488aa, roughness: 0.3, metalness: 0.2 }),
  fuelTank: new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.4, metalness: 0.2 }),
  generatorBody: new THREE.MeshStandardMaterial({ color: 0x44aa44, roughness: 0.5 }),
  exhaust: new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, metalness: 0.5 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x888877, roughness: 0.9 }),
};

/* ════════════════════════════════════════════════════════════════════════════
   1. ROAD CONES
════════════════════════════════════════════════════════════════════════════ */
function buildRoadCones() {
  const coneGeo = new THREE.CylinderGeometry(0.15, 0.05, 0.5, 6);
  const positions = [
    [-5, 0.25, -20],
    [5, 0.25, -20],
    [-5, 0.25, 20],
    [5, 0.25, 20],
    [-30, 0.25, 0],
    [30, 0.25, 0],
    [-50, 0.25, -10],
    [50, 0.25, -10],
  ];

  positions.forEach(([x, y, z]) => {
    const cone = new THREE.Mesh(coneGeo, mat.cone);
    cone.position.set(x, y, z);
    cone.castShadow = true;
    S.scene.add(cone);
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   2. TIRE STACKS
════════════════════════════════════════════════════════════════════════════ */
function buildTireStacks() {
  const torusGeo = new THREE.TorusGeometry(0.3, 0.1, 6, 12);
  const stacks = [
    { x: -40, z: -50, count: 4 },
    { x: 60, z: 40, count: 3 },
    { x: -70, z: 20, count: 4 },
  ];

  stacks.forEach(({ x, z, count }) => {
    const group = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const tire = new THREE.Mesh(torusGeo, mat.tire);
      tire.position.y = i * 0.2; // stack vertically
      tire.rotation.x = -Math.PI / 2; // lay flat
      tire.castShadow = true;
      group.add(tire);
    }
    group.position.set(x, 0, z);
    S.scene.add(group);
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   3. WARNING SIGNS
════════════════════════════════════════════════════════════════════════════ */
function buildWarningSigns() {
  const postGeo = new THREE.BoxGeometry(0.08, 2, 0.08);
  const boardGeo = new THREE.BoxGeometry(0.8, 0.6, 0.05);

  const signs = [
    { x: -25, z: -25, ry: Math.PI * 0.25 },
    { x: 25, z: -25, ry: -Math.PI * 0.25 },
    { x: -25, z: 25, ry: Math.PI * 0.75 },
    { x: 25, z: 25, ry: -Math.PI * 0.75 },
  ];

  signs.forEach(({ x, z, ry }) => {
    const group = new THREE.Group();

    // Post
    const post = new THREE.Mesh(postGeo, mat.signPost);
    post.position.y = 1;
    post.castShadow = true;
    group.add(post);

    // Board
    const board = new THREE.Mesh(boardGeo, mat.signBoard);
    board.position.set(0, 1.7, 0.05);
    board.castShadow = true;
    group.add(board);

    // Label sprite
    const label = makeTextSprite("CAUTION", 0x222222);
    label.position.set(0, 1.7, 0.1);
    label.scale.set(1, 0.5, 1);
    group.add(label);

    group.position.set(x, 0, z);
    group.rotation.y = ry;
    S.scene.add(group);
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   4. BENCH / BREAK AREA
════════════════════════════════════════════════════════════════════════════ */
function buildBench() {
  const group = new THREE.Group();

  // Seat
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.1, 0.5),
    mat.benchWood
  );
  seat.position.y = 0.5;
  seat.castShadow = true;
  seat.receiveShadow = true;
  group.add(seat);

  // 4 Legs
  const legGeo = new THREE.BoxGeometry(0.08, 0.5, 0.08);
  const legPositions = [
    [-0.9, 0.25, -0.2],
    [0.9, 0.25, -0.2],
    [-0.9, 0.25, 0.2],
    [0.9, 0.25, 0.2],
  ];
  legPositions.forEach(([lx, ly, lz]) => {
    const leg = new THREE.Mesh(legGeo, mat.benchLeg);
    leg.position.set(lx, ly, lz);
    leg.castShadow = true;
    group.add(leg);
  });

  // Backrest
  const backrest = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.5, 0.08),
    mat.benchWood
  );
  backrest.position.set(0, 0.8, -0.22);
  backrest.castShadow = true;
  group.add(backrest);

  group.position.set(-30, 0, -70);
  S.scene.add(group);
}

/* ════════════════════════════════════════════════════════════════════════════
   5. WATER TOWER
════════════════════════════════════════════════════════════════════════════ */
function buildWaterTower() {
  const group = new THREE.Group();

  // 4 legs
  const legGeo = new THREE.BoxGeometry(0.2, 8, 0.2);
  const legOffsets = [
    [-1.2, 4, -1.2],
    [1.2, 4, -1.2],
    [-1.2, 4, 1.2],
    [1.2, 4, 1.2],
  ];
  legOffsets.forEach(([lx, ly, lz]) => {
    const leg = new THREE.Mesh(legGeo, mat.steel);
    leg.position.set(lx, ly, lz);
    leg.castShadow = true;
    group.add(leg);
  });

  // Tank
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(2, 2, 3, 8),
    mat.tankBody
  );
  tank.position.y = 9;
  tank.castShadow = true;
  group.add(tank);

  // Roof
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 1.5, 8),
    mat.steel
  );
  roof.position.y = 11;
  roof.castShadow = true;
  group.add(roof);

  group.position.set(-90, 0, -80);
  S.scene.add(group);
}

/* ════════════════════════════════════════════════════════════════════════════
   6. FUEL TANK
════════════════════════════════════════════════════════════════════════════ */
function buildFuelTank() {
  const group = new THREE.Group();

  // Tank body (rotated on side)
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 4, 8),
    mat.fuelTank
  );
  tank.position.y = 1.5;
  tank.rotation.z = Math.PI / 2; // lay on its side
  tank.castShadow = true;
  group.add(tank);

  // 2 support legs
  const legGeo = new THREE.BoxGeometry(0.1, 1.5, 0.1);
  [-1, 1].forEach((side) => {
    const leg = new THREE.Mesh(legGeo, mat.steel);
    leg.position.set(side * 1.2, 0.75, 0);
    leg.castShadow = true;
    group.add(leg);
  });

  group.position.set(90, 0, 80);
  S.scene.add(group);
}

/* ════════════════════════════════════════════════════════════════════════════
   7. GENERATOR
════════════════════════════════════════════════════════════════════════════ */
function buildGenerator() {
  const group = new THREE.Group();

  // Body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 1.5, 1.5),
    mat.generatorBody
  );
  body.position.y = 0.75;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Exhaust pipe
  const exhaust = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 1.5, 8),
    mat.exhaust
  );
  exhaust.position.set(0.7, 1.75, 0);
  exhaust.castShadow = true;
  group.add(exhaust);

  group.position.set(40, 0, 70);
  S.scene.add(group);
}

/* ════════════════════════════════════════════════════════════════════════════
   8. ROCKS (scattered around beach area)
════════════════════════════════════════════════════════════════════════════ */
function buildRocks() {
  const rockPositions = [
    { x: 100, z: -60, scale: 1.2 },
    { x: -110, z: 50, scale: 0.8 },
    { x: 80, z: 120, scale: 1.5 },
    { x: -90, z: -130, scale: 1.0 },
    { x: 130, z: 0, scale: 0.6 },
    { x: -60, z: 160, scale: 1.3 },
  ];

  rockPositions.forEach(({ x, z, scale }) => {
    const geo = new THREE.DodecahedronGeometry(scale, 0);
    const rock = new THREE.Mesh(geo, mat.rock);
    rock.position.set(x, scale * 0.4, z);
    rock.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    rock.castShadow = true;
    rock.receiveShadow = true;
    S.scene.add(rock);
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   PUBLIC — buildDecorations()
════════════════════════════════════════════════════════════════════════════ */
export function buildDecorations() {
  buildRoadCones();
  buildTireStacks();
  buildWarningSigns();
  buildBench();
  buildWaterTower();
  buildFuelTank();
  buildGenerator();
  buildRocks();
}
