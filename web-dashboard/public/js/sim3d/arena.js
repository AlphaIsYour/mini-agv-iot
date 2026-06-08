/* ══════════════════════════════════════════════════════════════════════════════
   ARENA.JS — Roblox Bright & Cheerful Arena construction
   Extracted from simulation3d.js
══════════════════════════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { S, ARENA_W, ARENA_H, svgTo3D, NODE_3D, NODE_COLORS, TRACK_MAIN, TRACK_RETURN_LEFT, TRACK_A_JOIN, TRACK_RETURN_RIGHT } from "./state.js";

/* ════════════════════════════════════════════════════════════════════════════
   ARENA — Roblox Bright & Cheerful Style
════════════════════════════════════════════════════════════════════════════ */
export function buildArena() {
  /* ── Floor — bright green grass ── */
  const floorGeo = new THREE.PlaneGeometry(ARENA_W, ARENA_H, 1, 1);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x5cba4c,
    roughness: 0.9,
    metalness: 0.0,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  floor.receiveShadow = true;
  S.scene.add(floor);

  // Subtle grid on grass (path guides)
  const tileGrid = new THREE.GridHelper(
    Math.max(ARENA_W, ARENA_H),
    20,
    0x4a9e3f,
    0x4a9e3f
  );
  tileGrid.material.opacity = 0.15;
  tileGrid.material.transparent = true;
  tileGrid.position.y = 0.005;
  S.scene.add(tileGrid);

  /* ── AGV Track — yellow dashed guide lines ── */
  const trackMat = new THREE.LineBasicMaterial({ color: 0xffcc00, linewidth: 2 });
  const trackMatSec = new THREE.LineBasicMaterial({
    color: 0xffcc00,
    transparent: true,
    opacity: 0.35,
  });

  function drawTrack(svgPts, mat) {
    const pts = svgPts.map((p) => {
      const v = svgTo3D(p.x, p.y);
      return new THREE.Vector3(v.x, 0.04, v.z);
    });
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.2);
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(60));
    S.scene.add(new THREE.Line(geo, mat));
  }

  drawTrack(TRACK_MAIN, trackMat);
  drawTrack(TRACK_RETURN_LEFT, trackMatSec);
  drawTrack(TRACK_A_JOIN, trackMatSec);
  drawTrack(TRACK_RETURN_RIGHT, trackMatSec);

  // Main road surface (dark asphalt)
  const p0 = svgTo3D(70, 332);
  const p1 = svgTo3D(70, 28);
  const roadLen = Math.abs(p1.z - p0.z);
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, roadLen),
    new THREE.MeshStandardMaterial({
      color: 0x999999,
      roughness: 0.7,
      metalness: 0.0,
    })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.015, (p0.z + p1.z) / 2);
  road.receiveShadow = true;
  S.scene.add(road);

  // Center line (white dashed — painted on road)
  const centerLineMat = new THREE.LineDashedMaterial({
    color: 0xffffff,
    dashSize: 0.3,
    gapSize: 0.3,
    transparent: true,
    opacity: 0.5,
  });
  const clPts = [new THREE.Vector3(0, 0.04, p0.z), new THREE.Vector3(0, 0.04, p1.z)];
  const clGeo = new THREE.BufferGeometry().setFromPoints(clPts);
  const centerLine = new THREE.Line(clGeo, centerLineMat);
  centerLine.computeLineDistances();
  S.scene.add(centerLine);

  /* ── Safety zone markings (yellow-black stripes near waypoints) ── */
  for (const [name, pos] of Object.entries(NODE_3D)) {
    buildSafetyZone(pos.x, pos.z, NODE_COLORS[name]);
  }

  /* ── Walls — solid industrial concrete ── */
  buildWarehouseWalls();

  /* ── Warehouse shelving racks ── */
  buildShelvingRacks();

  /* ── Overhead industrial lights ── */
  buildOverheadLights();

  /* ── Decorative pallets & boxes ── */
  buildDecorativeBoxes();

  /* ── Safety signs ── */
  buildSafetySigns();

  // Waypoints (on top of everything else)
  for (const [name, pos] of Object.entries(NODE_3D)) {
    buildWaypoint(name, pos.x, pos.z, NODE_COLORS[name]);
  }
}

/* ── Safety Zone — colored border around waypoint ── */
function buildSafetyZone(x, z, color) {
  const s = 1.0;
  const stripeW = 0.08;

  // Corner brackets (L-shaped markers)
  const bracketMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
  const corners = [
    { px: x - s, pz: z - s, rx: 0, rz: 0 },
    { px: x + s, pz: z - s, rx: 0, rz: Math.PI },
    { px: x - s, pz: z + s, rx: Math.PI, rz: 0 },
    { px: x + s, pz: z + s, rx: Math.PI, rz: Math.PI },
  ];

  corners.forEach((c) => {
    // Horizontal arm
    const h = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.02, stripeW),
      bracketMat
    );
    h.position.set(c.px + (c.rz ? -0.2 : 0.2), 0.02, c.pz);
    S.scene.add(h);
    // Vertical arm
    const v = new THREE.Mesh(
      new THREE.BoxGeometry(stripeW, 0.02, 0.4),
      bracketMat
    );
    v.position.set(c.px, 0.02, c.pz + (c.rx ? -0.2 : 0.2));
    S.scene.add(v);
  });

  // Hazard stripes (diagonal lines on floor around zone)
  const hazardMat = new THREE.LineBasicMaterial({
    color: 0xff8800,
    transparent: true,
    opacity: 0.3,
  });
  for (let i = -3; i <= 3; i++) {
    const offset = i * 0.12;
    const pts = [
      new THREE.Vector3(x - s, 0.02, z + offset - 0.3),
      new THREE.Vector3(x - s + 0.4, 0.02, z + offset + 0.3),
    ];
    S.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), hazardMat));
    const pts2 = [
      new THREE.Vector3(x + s, 0.02, z + offset - 0.3),
      new THREE.Vector3(x + s - 0.4, 0.02, z + offset + 0.3),
    ];
    S.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), hazardMat));
  }
}

/* ── Arena Boundary — Roblox-style colorful fence ── */
function buildWarehouseWalls() {
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.4, metalness: 0.2 });
  const fenceH = 0.6;
  const postH = 0.9;

  // Fence posts along arena boundary
  const step = 2.0;
  const hw = ARENA_W / 2;
  const hh = ARENA_H / 2;

  // Build fence segments on each side
  const sides = [
    { start: [-hw, -hh], end: [hw, -hh] },   // front
    { start: [hw, -hh], end: [hw, hh] },      // right
    { start: [hw, hh], end: [-hw, hh] },      // back
    { start: [-hw, hh], end: [-hw, -hh] },    // left (with door gap)
  ];

  sides.forEach((side, si) => {
    const dx = side.end[0] - side.start[0];
    const dz = side.end[1] - side.start[1];
    const len = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.floor(len / step);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = side.start[0] + dx * t;
      const z = side.start[1] + dz * t;

      // Skip posts near door gap on left wall
      if (si === 3 && Math.abs(z) < 2.5) continue;

      // Post
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, postH, 0.1),
        postMat
      );
      post.position.set(x, postH / 2, z);
      post.castShadow = true;
      S.scene.add(post);
    }

    // Horizontal rail between posts
    // Skip left wall near door
    if (si === 3) {
      // Upper segment (above door)
      const railAbove = new THREE.Mesh(
        new THREE.BoxGeometry(Math.abs(dx) > 0.01 ? (hh - 2.5) : 0.05, 0.06, Math.abs(dz) > 0.01 ? (hh - 2.5) : 0.05),
        fenceMat
      );
      // This is complex, just skip rails on left wall
    }
  });

  // Simple corner posts (larger, colorful)
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => {
    const x = sx * hw;
    const z = sz * hh;
    const cornerPost = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 1.2, 0.2),
      postMat
    );
    cornerPost.position.set(x, 0.6, z);
    cornerPost.castShadow = true;
    S.scene.add(cornerPost);

    // Top ball on corner post
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0xff6622, roughness: 0.4 })
    );
    ball.position.set(x, 1.3, z);
    S.scene.add(ball);
  });
}

/* ── Shelving Racks — industrial storage along walls ── */
function buildShelvingRacks() {
  const rackMat = new THREE.MeshStandardMaterial({
    color: 0xcc6633,
    roughness: 0.6,
    metalness: 0.3,
  });
  const shelfMat = new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.5,
    metalness: 0.4,
  });
  const boxColors = [0xc8a050, 0x8b6914, 0xaa7744, 0x996633, 0xbbaa77];

  // Left side racks (along z-axis)
  for (let i = 0; i < 3; i++) {
    const zPos = -6 + i * 6;
    buildSingleRack(-ARENA_W / 2 + 1.0, zPos, 0, rackMat, shelfMat, boxColors);
  }

  // Right side racks
  for (let i = 0; i < 3; i++) {
    const zPos = -6 + i * 6;
    buildSingleRack(ARENA_W / 2 - 1.0, zPos, Math.PI, rackMat, shelfMat, boxColors);
  }
}

export function buildSingleRack(x, z, ry, rackMat, shelfMat, boxColors) {
  const rackGroup = new THREE.Group();

  // Vertical posts (4 legs)
  const postGeo = new THREE.BoxGeometry(0.06, 2.2, 0.06);
  const postPositions = [
    [-0.6, 1.1, -0.3],
    [0.6, 1.1, -0.3],
    [-0.6, 1.1, 0.3],
    [0.6, 1.1, 0.3],
  ];
  postPositions.forEach((pos) => {
    const post = new THREE.Mesh(postGeo, rackMat);
    post.position.set(...pos);
    post.castShadow = true;
    rackGroup.add(post);
  });

  // Shelves (3 levels)
  const shelfGeo = new THREE.BoxGeometry(1.3, 0.04, 0.65);
  [0.4, 1.0, 1.6].forEach((y) => {
    const shelf = new THREE.Mesh(shelfGeo, shelfMat);
    shelf.position.set(0, y, 0);
    shelf.castShadow = true;
    shelf.receiveShadow = true;
    rackGroup.add(shelf);
  });

  // Boxes on shelves (decorative)
  [0.45, 1.05, 1.65].forEach((y, level) => {
    const numBoxes = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < numBoxes; i++) {
      const bw = 0.2 + Math.random() * 0.3;
      const bh = 0.15 + Math.random() * 0.2;
      const bd = 0.15 + Math.random() * 0.2;
      const bx = -0.3 + i * 0.35;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(bw, bh, bd),
        new THREE.MeshStandardMaterial({
          color: boxColors[level % boxColors.length],
          roughness: 0.8,
        })
      );
      box.position.set(bx, y + bh / 2 + 0.02, 0);
      box.castShadow = true;
      rackGroup.add(box);
    }
  });

  rackGroup.position.set(x, 0, z);
  rackGroup.rotation.y = ry;
  S.scene.add(rackGroup);
}

/* ── Overhead Industrial Lights ── */
function buildOverheadLights() {
  const lightFixtureMat = new THREE.MeshStandardMaterial({
    color: 0x666666,
    roughness: 0.4,
    metalness: 0.6,
  });
  const bulbMat = new THREE.MeshBasicMaterial({
    color: 0xffeedd,
    transparent: true,
    opacity: 0.9,
  });

  // 6 overhead light fixtures in a 2×3 grid
  const positions = [
    [-2.5, -6], [2.5, -6],
    [-2.5, 0],  [2.5, 0],
    [-2.5, 6],  [2.5, 6],
  ];

  positions.forEach(([x, z]) => {
    const fixtureGroup = new THREE.Group();

    // Mounting bar
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.05, 0.08),
      lightFixtureMat
    );
    bar.position.y = 3.4;
    fixtureGroup.add(bar);

    // Fixture housing
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.1, 0.15),
      lightFixtureMat
    );
    housing.position.set(0, 3.3, 0);
    fixtureGroup.add(housing);

    // Light bulb (glowing strip)
    const bulb = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.03, 0.1),
      bulbMat
    );
    bulb.position.set(0, 3.2, 0);
    fixtureGroup.add(bulb);

    // Point light for glow effect
    const pLight = new THREE.PointLight(0xffeedd, 0.3, 8);
    pLight.position.set(0, 3.0, 0);
    fixtureGroup.add(pLight);

    fixtureGroup.position.set(x, 0, z);
    S.scene.add(fixtureGroup);
  });
}

/* ── Decorative Pallets & Boxes ── */
function buildDecorativeBoxes() {
  const palletMat = new THREE.MeshStandardMaterial({
    color: 0x8B6914,
    roughness: 0.85,
  });
  const boxMat = new THREE.MeshStandardMaterial({
    color: 0xc8a050,
    roughness: 0.8,
  });

  // Scattered pallets near walls
  const palletPositions = [
    { x: -3.5, z: -8, ry: 0.3 },
    { x: 3.0, z: 7, ry: -0.5 },
    { x: -3.0, z: 4, ry: 0.1 },
    { x: 3.5, z: -3, ry: 0.8 },
  ];

  palletPositions.forEach((pos) => {
    // Pallet base (flat wooden platform)
    const pallet = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.08, 0.6),
      palletMat
    );
    pallet.position.set(pos.x, 0.04, pos.z);
    pallet.rotation.y = pos.ry;
    pallet.castShadow = true;
    pallet.receiveShadow = true;
    S.scene.add(pallet);

    // Pallet slats
    for (let i = -2; i <= 2; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.03, 0.06),
        palletMat
      );
      slat.position.set(pos.x + i * 0.15 * Math.cos(pos.ry), 0.065, pos.z + i * 0.15 * Math.sin(pos.ry));
      slat.rotation.y = pos.ry;
      S.scene.add(slat);
    }

    // Box stack on pallet
    const stackH = 1 + Math.floor(Math.random() * 2);
    for (let h = 0; h < stackH; h++) {
      const bw = 0.3 + Math.random() * 0.2;
      const bh = 0.2 + Math.random() * 0.15;
      const bd = 0.2 + Math.random() * 0.15;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(bw, bh, bd),
        boxMat
      );
      box.position.set(
        pos.x + (Math.random() - 0.5) * 0.2,
        0.08 + h * 0.22 + bh / 2,
        pos.z + (Math.random() - 0.5) * 0.2
      );
      box.rotation.y = Math.random() * 0.5;
      box.castShadow = true;
      S.scene.add(box);
    }
  });

  // Empty pallet leaning against wall
  const leanPallet = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.6, 0.06),
    palletMat
  );
  leanPallet.position.set(-ARENA_W / 2 + 0.3, 0.3, 2);
  leanPallet.rotation.z = 0.15;
  S.scene.add(leanPallet);
}

/* ── Safety Signs ── */
function buildSafetySigns() {
  const signs = [
    { text: "SAFETY", color: 0xffcc00, x: -ARENA_W / 2 + 0.2, z: -4, ry: Math.PI / 2 },
    { text: "NO ENTRY", color: 0xff4444, x: ARENA_W / 2 - 0.2, z: 4, ry: -Math.PI / 2 },
    { text: "AGV ZONE", color: 0x4488ff, x: 0, z: -ARENA_H / 2 + 0.2, ry: 0 },
  ];

  signs.forEach((s) => {
    const signGroup = new THREE.Group();

    // Sign board
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.5, 0.05),
      new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.3 })
    );
    board.position.y = 2.0;
    signGroup.add(board);

    // Sign text (sprite)
    const label = makeTextSprite(s.text, 0xffffff);
    label.position.set(0, 2.0, 0.04);
    label.scale.set(1.8, 0.9, 1);
    signGroup.add(label);

    signGroup.position.set(s.x, 0, s.z);
    signGroup.rotation.y = s.ry;
    S.scene.add(signGroup);
  });
}

function buildWaypoint(name, x, z, color) {
  // Roblox-style colorful platform
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 0.12, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 })
  );
  platform.position.set(x, 0.06, z);
  platform.castShadow = true;
  platform.receiveShadow = true;
  S.scene.add(platform);

  // Glowing ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.75, 0.06, 8, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 })
  );
  ring.position.set(x, 0.15, z);
  ring.rotation.x = -Math.PI / 2;
  ring.userData = { type: "waypoint-ring", name };
  S.scene.add(ring);

  // Blocky post (Roblox style)
  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 1.2, 0.15),
    new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 })
  );
  post.position.set(x, 0.7, z);
  post.castShadow = true;
  S.scene.add(post);

  // Colorful top cube
  const topCube = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.25, 0.25),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, roughness: 0.3 })
  );
  topCube.position.set(x, 1.4, z);
  topCube.castShadow = true;
  S.scene.add(topCube);

  // Station label
  const label = makeTextSprite("STN " + name, color);
  label.position.set(x, 1.9, z);
  label.scale.set(1.8, 0.9, 1);
  S.scene.add(label);
}

export function makeTextSprite(text, color) {
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
