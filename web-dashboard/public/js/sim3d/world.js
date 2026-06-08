/* ════════════════════════════════════════════════════════════════════════════
   WORLD.JS — Open World Orchestrator
   Builds the entire island: terrain, ocean, buildings, props, decorations
════════════════════════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { S, ISLAND_RADIUS_X, ISLAND_RADIUS_Z } from "./state.js";
import { buildTerrain } from "./terrain.js";
import { buildOcean } from "./ocean.js";
import { buildDoorSystem } from "./door.js";
import { buildInteractiveBoxes, buildDestructibleStatues, buildForklift, buildBarrels } from "./props/index.js";
import { buildBuildings } from "./buildings.js";
import { buildVehicles } from "./vehicles.js";
import { buildIndustrial } from "./industrial.js";
import { buildLampposts } from "./lampposts.js";
import { buildDecorations } from "./decorations.js";

export function buildExpandedWorld() {
  /* ── Terrain: island shape, beach, concrete ── */
  buildTerrain();

  /* ── Ocean: animated water surrounding island ── */
  buildOcean();

  /* ── Door system (exit from AGV arena) ── */
  buildDoorSystem();

  /* ── Buildings ── */
  buildBuildings();

  /* ── Vehicles & containers ── */
  buildVehicles();

  /* ── Industrial: crane, pipes, fence, bollards ── */
  buildIndustrial();

  /* ── Lampposts with lights ── */
  buildLampposts();

  /* ── Decorations: cones, tires, signs, benches ── */
  buildDecorations();

  /* ── Interactive props (existing) ── */
  buildInteractiveBoxes();
  buildDestructibleStatues();
  buildForklift();
  buildBarrels();

  /* ── Nature: clouds & trees ── */
  buildClouds();
  buildRobloxTrees();
}

/* ── Clouds ── */
function buildClouds() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85,
  });
  const positions = [
    { x: -30, y: 25, z: -40, s: 3 }, { x: 40, y: 30, z: -20, s: 4 },
    { x: -20, y: 22, z: 50, s: 2.5 }, { x: 60, y: 28, z: 30, s: 3.5 },
    { x: -50, y: 35, z: 60, s: 2 }, { x: 0, y: 32, z: -80, s: 4.5 },
    { x: 30, y: 26, z: 70, s: 3 }, { x: -60, y: 24, z: -20, s: 2.8 },
    { x: 80, y: 29, z: -50, s: 3.2 }, { x: -40, y: 31, z: 80, s: 2.5 },
  ];
  positions.forEach((pos) => {
    const g = new THREE.Group();
    [{ x: 0, r: 2 }, { x: 1.5, r: 1.5 }, { x: -1.2, r: 1.3 }, { x: 0.5, r: 1 }].forEach((p) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(p.r, 6, 5), mat);
      s.position.x = p.x;
      g.add(s);
    });
    g.position.set(pos.x, pos.y, pos.z);
    g.scale.setScalar(pos.s);
    g.userData = { type: "cloud", baseX: pos.x, speed: 0.05 + Math.random() * 0.1 };
    S.scene.add(g);
  });
}

/* ── Trees (Roblox blocky style, scattered around island) ── */
function buildRobloxTrees() {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.8 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a8c2d, roughness: 0.7 });

  // Trees scattered around the island edges and between buildings
  const treePositions = [
    // Around arena
    { x: -15, z: -18 }, { x: 15, z: -18 }, { x: -15, z: 18 }, { x: 15, z: 18 },
    // Near buildings
    { x: 45, z: -40 }, { x: 75, z: -40 }, { x: 45, z: -60 },
    // East side
    { x: 80, z: 0 }, { x: 90, z: 20 }, { x: 85, z: -20 },
    // West side
    { x: -80, z: 10 }, { x: -90, z: -10 }, { x: -70, z: 30 },
    // North
    { x: -20, z: -90 }, { x: 20, z: -90 }, { x: 0, z: -100 },
    // South
    { x: -30, z: 80 }, { x: 30, z: 80 }, { x: 0, z: 100 },
    // Scattered
    { x: -60, z: -50 }, { x: 60, z: 50 }, { x: -50, z: 60 },
    { x: 50, z: -70 }, { x: -70, z: -30 }, { x: 70, z: 30 },
  ];

  treePositions.forEach((pos) => {
    // Check if position is within island
    const dist = Math.sqrt((pos.x * pos.x) / (ISLAND_RADIUS_X * ISLAND_RADIUS_X) + (pos.z * pos.z) / (ISLAND_RADIUS_Z * ISLAND_RADIUS_Z));
    if (dist > 0.85) return; // Skip if too close to edge

    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3, 0.5), trunkMat);
    trunk.position.y = 1.5;
    trunk.castShadow = true;
    g.add(trunk);

    const leaves = new THREE.Mesh(new THREE.SphereGeometry(1.5, 6, 5), leafMat);
    leaves.position.y = 4;
    leaves.castShadow = true;
    g.add(leaves);

    const leaves2 = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 5), leafMat);
    leaves2.position.set(0.6, 4.5, 0.4);
    g.add(leaves2);

    g.position.set(pos.x, 0, pos.z);
    S.scene.add(g);
  });
}
