/* ════════════════════════════════════════════════════════════════════════════
   STATE.JS — Shared mutable state for 3D simulation
   All modules import from here to read/write shared variables.
════════════════════════════════════════════════════════════════════════════ */

import * as THREE from "three";

/* ── Constants ── */
export const ARENA_W = 10;
export const ARENA_H = 20;

// Open world — island dimensions (10× bigger)
export const WORLD_W = 300;
export const WORLD_H = 400;
export const ISLAND_RADIUS_X = 140;  // elliptical island
export const ISLAND_RADIUS_Z = 190;

// Keep OUTER_* for backward compat (door system)
export const OUTER_W = WORLD_W;
export const OUTER_H = WORLD_H;

export const PHYSICS_FRICTION = 0.97;
export const PHYSICS_GRAVITY = 9.8;
export const AUTO_REPAIR_DELAY = 30;

// SVG viewBox "0 0 120 360" → 3D mapping (portrait)
export function svgTo3D(sx, sy) {
  return {
    x: (sx - 60) / 12,
    z: (180 - sy) / 18,
  };
}

export const NODE_SVG = {
  BASE: { x: 70, y: 332 },
  A:    { x: 70, y: 248 },
  B:    { x: 70, y: 150 },
  C:    { x: 70, y: 28 },
};

export const NODE_3D = {};
for (const [k, v] of Object.entries(NODE_SVG)) {
  NODE_3D[k] = svgTo3D(v.x, v.y);
}

export const NODE_COLORS = {
  BASE: 0x4488ff,
  A: 0x00cc66,
  B: 0xffaa00,
  C: 0xff4466,
};

export const TRACK_MAIN = [
  { x: 70, y: 332 },
  { x: 70, y: 28 },
];

export const TRACK_RETURN_LEFT = [
  { x: 70, y: 332 },
  { x: 34, y: 332 },
  { x: 24, y: 316 },
  { x: 24, y: 286 },
  { x: 24, y: 62 },
  { x: 24, y: 36 },
  { x: 40, y: 28 },
  { x: 70, y: 28 },
];

export const TRACK_A_JOIN = [
  { x: 70, y: 248 },
  { x: 42, y: 248 },
  { x: 24, y: 260 },
  { x: 24, y: 286 },
];

export const TRACK_RETURN_RIGHT = [
  { x: 70, y: 150 },
  { x: 104, y: 150 },
  { x: 106, y: 176 },
  { x: 106, y: 190 },
  { x: 106, y: 294 },
  { x: 106, y: 320 },
  { x: 96, y: 332 },
  { x: 70, y: 332 },
];

/* ── Mutable State ── */
export const S = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  clock: null,

  // AGV
  agvGroup: null,
  agvWheels: [],
  agvHeading: 0,
  agvSpeed: 0,
  agvTurnRate: 0,
  motorL: 0,
  motorR: 0,
  currentAGVState: "IDLE",
  currentMission: "BASE",
  followCamera: true,
  simActive: false,
  initialized: false,
  joystickUpdater: null,

  // Mission
  missionRoute: [],
  missionStartTime: 0,

  // Demo
  demoMode: false,
  demoTimer: 0,
  demoPhase: 0,
  demoTelemetryInterval: null,
  lastRealTelemetry: 0,

  // Door / expanded
  arenaExpanded: false,
  doorState: "closed",
  doorTimer: 0,
  doorMesh: null,
  doorLight: null,
  doorProgressBar: null,
  doorGroup: null,

  // Interactive objects
  interactiveBoxes: [],
  destructibleStatues: [],
  exitGuidanceObjects: [],
  activeParticles: [],

  // Cargo indicator
  cargoIndicatorGroup: null,
  cargoArrowHelpers: [],
  cargoHasCargo: false,
};
