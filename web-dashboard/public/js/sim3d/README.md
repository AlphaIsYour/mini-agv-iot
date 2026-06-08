# AGV IoT — 3D Simulator Module Structure

## Overview
A Three.js-based 3D digital twin simulator for an AGV (Automated Guided Vehicle) warehouse system. Built with ES modules, modular architecture.

## Tech Stack
- **Three.js** v0.160.0 (via CDN importmap)
- **WebGL** renderer
- **ES Modules** (import/export)
- **No build tools** — runs directly in browser

## File Structure

```
web-dashboard/
├── public/
│   ├── index.html                    ← Main HTML (simulation page at line ~1693)
│   ├── css/
│   │   └── simulation3d.css          ← Game-style floating UI + responsive
│   └── js/
│       ├── simulation3d.js           ← Main orchestrator (animate loop, camera, HUD)
│       ├── app.js                    ← Page navigation, calls initSimulation3D()
│       └── sim3d/
│           ├── state.js              ← Shared mutable state + constants
│           ├── arena.js              ← AGV arena: floor, fence, waypoints
│           ├── agv.js                ← AGV 3D model + cargo indicator
│           ├── world.js              ← Open world orchestrator
│           ├── terrain.js            ← Island terrain, beach, concrete
│           ├── ocean.js              ← Animated ocean with waves
│           ├── door.js               ← Exit door system + popup
│           ├── buildings.js          ← Warehouse, guard booth, shed
│           ├── vehicles.js           ← Truck, containers, pallet jack
│           ├── industrial.js         ← Crane, pipes, fence, bollards
│           ├── lampposts.js          ← Street lights with point lights
│           ├── decorations.js        ← Cones, tires, signs, benches, rocks
│           ├── physics.js            ← Collision detection, knock/break
│           ├── effects.js            ← Particles, arrival flash
│           ├── joystick.js           ← Mobile analog joystick
│           └── props/
│               ├── index.js          ← Re-exports
│               ├── box.js            ← Knockable cardboard boxes
│               ├── statue.js         ← Destructible 3D letter statues
│               ├── forklift.js       ← Forklift model
│               └── barrels.js        ← Industrial barrels
```

## Architecture

### State Management
`state.js` exports a shared mutable state object `S` that all modules import and modify directly:
```js
import { S } from "./state.js";
S.scene.add(mesh);
S.agvSpeed = 2;
```

### Module Pattern
Each module exports functions that operate on `S`:
```js
// sim3d/buildings.js
import * as THREE from "three";
import { S } from "./state.js";

export function buildBuildings() {
  const box = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 10), ...);
  S.scene.add(box);
}
```

### Main Orchestrator
`simulation3d.js` imports all modules and runs the animate loop:
```js
import { buildArena } from "./sim3d/arena.js";
import { buildExpandedWorld } from "./sim3d/world.js";
// ... etc

function animate() {
  updateOcean(elapsed);
  updateDoorSystem(dt, elapsed);
  updateInteractivePhysics(dt, elapsed);
  updateParticles(dt);
  // ... etc
  renderer.render(scene, camera);
}
```

### Global API (for non-module app.js)
```js
window.initSimulation3D = async function() { ... }
window.pauseSimulation3D = function() { ... }
window.syncAGV3DPosition = function(svgX, svgY) { ... }
```

## World Design
- **Island**: Elliptical (300×400 units), surrounded by ocean
- **Terrain layers**: Ocean → Beach sand → Concrete → Arena (grass)
- **Theme**: Industrial/warehouse with Roblox-style blocky geometry
- **AGV Arena**: 10×20 units, green floor, yellow fence posts

## Current Limitations
- All geometry is primitive (Box, Cylinder, Sphere) — no imported 3D models
- No textures — only solid colors (MeshStandardMaterial)
- No post-processing effects
- Simple physics (distance-based collision, no physics engine)
- Ocean waves via vertex displacement (no water shader)

## How to Add a New Object
1. Create `sim3d/props/myobject.js`:
   ```js
   import * as THREE from "three";
   import { S } from "../state.js";
   export function buildMyObject(x, z) {
     const mesh = new THREE.Mesh(...);
     mesh.position.set(x, 0, z);
     S.scene.add(mesh);
   }
   ```
2. Import in `world.js` and call it in `buildExpandedWorld()`
3. Done!

## Key Technologies
- Three.js: https://threejs.org
- OrbitControls: camera rotation/zoom
- ES Modules: native browser modules
- Canvas 2D: text sprites (makeTextSprite)
- Fullscreen API: canvas fullscreen
- Touch events: mobile joystick
