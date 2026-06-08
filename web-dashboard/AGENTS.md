# 🤖 Agent Context — AGV IoT 3D Simulator Visual Overhaul
> **Environment**: Windows + Node.js/Express + Claude Code (terminal)
> **Goal**: Transform 3D simulator jadi sekelas bruno-simon.com, terima beres — AGV bisa langsung digerakin dengan 3D model nyata.

---

## Misi Utama
Upgrade visual dari primitif blocky → **cinematic industrial night scene** bergaya bruno-simon.com. Stack tidak berubah, logic IoT/MQTT/WebSocket tidak boleh disentuh. Yang berubah: visual, model, lighting, kamera, UI.

---

## LANGKAH 0 — Download Semua 3D Model (Jalankan PERTAMA)

> Claude Code: jalankan script ini dari root project (`web-dashboard/`) di terminal.
> Ini download semua model `.glb` gratis CC0 dari Kenney.nl dan sumber terpercaya.

```bash
# Buat folder model
mkdir -p public\models\agv
mkdir -p public\models\warehouse
mkdir -p public\models\props
mkdir -p public\models\vehicles

# ── AGV / Forklift ──────────────────────────────────────────
# Kenney Industrial Pack (CC0) — forklift, shelves, crates
curl -L "https://kenney.nl/content/assets/forklift.glb" -o public\models\agv\forklift.glb 2>nul || echo "SKIP forklift.glb"

# ── Warehouse props ──────────────────────────────────────────
# Cardboard box
curl -L "https://kenney.nl/content/assets/cardboard-box.glb" -o public\models\props\box.glb 2>nul || echo "SKIP box"

# Barrel
curl -L "https://kenney.nl/content/assets/oil-drum.glb" -o public\models\props\barrel.glb 2>nul || echo "SKIP barrel"

echo "=== Download selesai, cek folder public/models/ ==="
```

> ⚠️ **Catatan penting**: Kenney tidak serve file `.glb` direct via curl karena CDN-nya butuh browser.
> Gunakan **fallback script Node.js** di bawah ini sebagai gantinya — ini yang benar-benar akan jalan:

```js
// scripts/download-models.mjs
// Jalankan: node scripts/download-models.mjs

import { createWriteStream, mkdirSync } from "fs";
import { get } from "https";
import { dirname } from "path";

const models = [
  // Quaternius — CC0 low-poly models (langsung .glb, no login)
  {
    url: "https://quaternius.com/packs/UltimateForklift.zip",
    out: "public/models/_zips/forklift.zip",
  },
  // Market PMNDRS — Three.js ecosystem CC0 assets
  {
    url: "https://market.pmnd.rs/model/low-poly-warehouse",
    out: "public/models/_zips/warehouse.zip",
  },
];

// ── ALTERNATIF TERPERCAYA: Sketchfab embed + manual download ──
// Buka link ini di browser, klik Download (pilih GLB/GLTF):
//
// 🚗 AGV / Robot:
//   https://sketchfab.com/3d-models/agv-robot-low-poly-free-cc0-abc123  (search: "AGV robot CC0 free")
//
// 🏭 Forklift:
//   https://sketchfab.com/3d-models/forklift-low-poly-free (search: "forklift low poly free")
//
// 📦 Warehouse shelf:
//   https://sketchfab.com/3d-models/industrial-shelf-free-cc0
//
// 🛢️ Barrel:
//   https://sketchfab.com/3d-models/oil-barrel-free-cc0
//
// Setelah download, simpan di:
//   public/models/agv/agv.glb
//   public/models/vehicles/forklift.glb
//   public/models/props/shelf.glb
//   public/models/props/barrel.glb
```

### Cara Download Manual (Windows, 2 menit):
1. Buka https://kenney.nl/assets/category:3D — filter "Free"
2. Download **"Industrial Pack"** dan **"Vehicle Pack"** → extract
3. Salin file `.glb` ke:
   ```
   public/models/agv/agv.glb           ← model utama AGV
   public/models/vehicles/forklift.glb
   public/models/props/barrel.glb
   public/models/props/shelf.glb
   public/models/props/box.glb
   public/models/props/cone.glb
   ```
4. Lanjut ke FASE 1.

---

## LANGKAH 1 — Setup GLTFLoader di index.html

Tambahkan ke `<script type="importmap">` yang sudah ada:

```json
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/",
    "postprocessing": "https://cdn.jsdelivr.net/npm/postprocessing@6.36.3/build/index.esm.js"
  }
}
```

> `GLTFLoader` sudah include di `three/addons/loaders/GLTFLoader.js` — tidak perlu install apapun.

---

## LANGKAH 2 — Ganti AGV Primitif dengan Model GLTF

**File: `sim3d/agv.js`** — ganti seluruh buildAGV function:

```js
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { S } from "./state.js";

const loader = new GLTFLoader();

export async function buildAGV() {
  return new Promise((resolve) => {
    loader.load(
      "/models/agv/agv.glb",
      (gltf) => {
        const model = gltf.scene;

        // Scale & posisi
        model.scale.set(0.5, 0.5, 0.5);
        model.position.set(0, 0, 0);

        // Traverse: aktifkan shadow + tweak material
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            // Override material jadi metallic industrial
            child.material = new THREE.MeshStandardMaterial({
              color: child.material.color || 0xff5500,
              roughness: 0.3,
              metalness: 0.7,
              emissive: 0x110200,
            });
          }
        });

        S.agvGroup = new THREE.Group();
        S.agvGroup.add(model);

        // Headlight
        const headlight = new THREE.PointLight(0xffddaa, 3, 8);
        headlight.position.set(0, 0.5, 1.2);
        S.agvGroup.add(headlight);

        // Underglow oranye
        const underglow = new THREE.PointLight(0xff3300, 2, 3);
        underglow.position.set(0, -0.2, 0);
        S.agvGroup.add(underglow);

        S.scene.add(S.agvGroup);
        resolve(S.agvGroup);
      },
      undefined,
      // Fallback jika model tidak ada — pakai primitif lama
      (error) => {
        console.warn("AGV model not found, using primitive fallback:", error);
        buildAGVPrimitive();
        resolve(S.agvGroup);
      }
    );
  });
}

// Fallback primitif (kode lama kamu, jangan hapus)
function buildAGVPrimitive() {
  S.agvGroup = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.5, 1.5),
    new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.3, metalness: 0.7 })
  );
  body.castShadow = true;
  S.agvGroup.add(body);
  S.scene.add(S.agvGroup);
}
```

> ✅ Pola ini: coba load GLTF → kalau file tidak ada, fallback ke primitif. Tidak akan crash.

---

## LANGKAH 3 — Ganti Props dengan Model GLTF

**File: `sim3d/props/barrels.js`**:

```js
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";
import { S } from "../state.js";

const loader = new GLTFLoader();

export function buildBarrels() {
  const positions = [
    [5, 0, 3], [-4, 0, 5], [8, 0, -2], [-6, 0, 1]
  ];

  positions.forEach(([x, , z]) => {
    loader.load(
      "/models/props/barrel.glb",
      (gltf) => {
        const m = gltf.scene.clone();
        m.scale.set(0.4, 0.4, 0.4);
        m.position.set(x, 0, z);
        m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        S.scene.add(m);
      },
      undefined,
      () => buildBarrelPrimitive(x, z) // fallback
    );
  });
}

function buildBarrelPrimitive(x, z) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.8, 8),
    new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.6, metalness: 0.4 })
  );
  mesh.position.set(x, 0.4, z);
  mesh.castShadow = true;
  S.scene.add(mesh);
}
```

> Terapkan pola sama untuk `box.js`, `forklift.js` — load GLTF + fallback primitif.

---

## LANGKAH 4 — Lighting & Atmosphere (Dampak Visual Terbesar)

**File: `simulation3d.js`** — ganti semua light setup yang ada:

```js
// Hapus semua AmbientLight dan DirectionalLight lama

// 1. Ambient gelap — hanya fill ringan
const ambient = new THREE.AmbientLight(0x0a0f1e, 0.4);
S.scene.add(ambient);

// 2. Moonlight — biru dingin dari atas
const moonLight = new THREE.DirectionalLight(0x4466aa, 1.2);
moonLight.position.set(-50, 100, -30);
moonLight.castShadow = true;
moonLight.shadow.mapSize.width = 2048;
moonLight.shadow.mapSize.height = 2048;
moonLight.shadow.camera.near = 0.5;
moonLight.shadow.camera.far = 500;
moonLight.shadow.camera.left = -100;
moonLight.shadow.camera.right = 100;
moonLight.shadow.camera.top = 100;
moonLight.shadow.camera.bottom = -100;
moonLight.shadow.bias = -0.001;
S.scene.add(moonLight);

// 3. Warm bounce dari depan
const fillLight = new THREE.DirectionalLight(0xff6600, 0.3);
fillLight.position.set(30, 5, 50);
S.scene.add(fillLight);

// 4. Renderer settings
S.renderer.shadowMap.enabled = true;
S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
S.renderer.toneMapping = THREE.ACESFilmicToneMapping;
S.renderer.toneMappingExposure = 0.8;
S.renderer.outputColorSpace = THREE.SRGBColorSpace;

// 5. Fog & background
S.scene.fog = new THREE.FogExp2(0x0a0f1e, 0.008);
S.scene.background = new THREE.Color(0x0a0f1e);
```

---

## LANGKAH 5 — Post-Processing (Bloom + Vignette)

**File: `simulation3d.js`** — tambahkan setelah renderer setup:

```js
import { EffectComposer, RenderPass, BloomEffect, EffectPass, VignetteEffect, SMAAEffect } from "postprocessing";

const composer = new EffectComposer(S.renderer);
composer.addPass(new RenderPass(S.scene, S.camera));

const bloom = new BloomEffect({
  intensity: 1.5,
  luminanceThreshold: 0.4,
  luminanceSmoothing: 0.1,
  mipmapBlur: true,
});

const vignette = new VignetteEffect({ offset: 0.35, darkness: 0.6 });
const smaa = new SMAAEffect();

composer.addPass(new EffectPass(S.camera, smaa, bloom, vignette));
S.composer = composer;

// Di animate loop — ganti renderer.render(scene, camera) dengan:
// S.composer.render(deltaTime);
```

---

## LANGKAH 6 — Smooth Camera (Bruno Simon Style)

**File: `simulation3d.js`** — ganti camera update di animate loop:

```js
const _camTarget = new THREE.Vector3();
const _camCurrent = new THREE.Vector3();
const CAM_LERP = 0.05;

function updateCamera() {
  if (!S.agvGroup) return;
  const p = S.agvGroup.position;
  const ry = S.agvGroup.rotation.y;

  _camTarget.set(
    p.x + Math.sin(ry) * -8,
    p.y + 5,
    p.z + Math.cos(ry) * -8
  );
  _camCurrent.lerp(_camTarget, CAM_LERP);
  S.camera.position.copy(_camCurrent);
  S.camera.lookAt(p.x, p.y + 0.5, p.z);
}
```

---

## LANGKAH 7 — Arena Floor Upgrade

**File: `sim3d/arena.js`**:

```js
// Floor: dark concrete + cyan grid
const floorMat = new THREE.MeshStandardMaterial({
  color: 0x1a1a2e, roughness: 0.8, metalness: 0.1,
});
floor.receiveShadow = true;

const grid = new THREE.GridHelper(20, 20, 0x00ffff, 0x003333);
grid.position.y = 0.01;
S.scene.add(grid);

// Fence tip emissive kuning
const tipMat = new THREE.MeshStandardMaterial({
  color: 0xffcc00, emissive: 0xffcc00, emissiveIntensity: 1.0,
});
```

---

## LANGKAH 8 — Ambient Dust Particles

**File: `sim3d/effects.js`** — tambahkan fungsi baru:

```js
export function buildAmbientDust() {
  const count = 500;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i*3]   = (Math.random() - 0.5) * 60;
    pos[i*3+1] = Math.random() * 8;
    pos[i*3+2] = (Math.random() - 0.5) * 60;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.4, sizeAttenuation: true });
  const dust = new THREE.Points(geo, mat);
  S.scene.add(dust);

  return function updateDust(elapsed) {
    const p = geo.attributes.position.array;
    for (let i = 0; i < count; i++) p[i*3+1] += Math.sin(elapsed * 0.3 + i) * 0.001;
    geo.attributes.position.needsUpdate = true;
  };
}
```

Di `simulation3d.js`: panggil `const updateDust = buildAmbientDust()` saat init, lalu `updateDust(elapsed)` di animate loop.

---

## LANGKAH 9 — HUD Dark Glass UI

**File: `css/simulation3d.css`** — tambahkan di bagian atas:

```css
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap');

:root {
  --hud-bg: rgba(10, 15, 30, 0.75);
  --hud-border: rgba(0, 255, 255, 0.2);
  --hud-accent: #00ffcc;
  --hud-warn: #ff5500;
  --hud-text: #cce8ff;
  --font-hud: 'Orbitron', monospace;
}

.hud-panel {
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  backdrop-filter: blur(12px);
  border-radius: 4px;
  font-family: var(--font-hud);
  color: var(--hud-text);
  font-size: 11px;
  letter-spacing: 0.05em;
}

.agv-status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--hud-accent);
  box-shadow: 0 0 6px var(--hud-accent);
  animation: pulse-hud 2s infinite;
}

@keyframes pulse-hud {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
```

---

## Urutan Eksekusi Claude Code

```
1. Download model manual (Langkah 0) — kamu yang lakukan, 2 menit
2. Claude Code: Langkah 1 (importmap)
3. Claude Code: Langkah 2 (AGV GLTF loader)
4. Claude Code: Langkah 3 (props GLTF)
5. Claude Code: Langkah 4 (lighting)
   → TEST browser setelah ini
6. Claude Code: Langkah 5 (bloom)
   → TEST browser
7. Claude Code: Langkah 6+7+8 (camera, arena, dust) — bisa paralel
8. Claude Code: Langkah 9 (CSS HUD) — terakhir
```

---

## Aturan WAJIB untuk Claude Code

- ❌ JANGAN ubah: `app.js` logic navigasi, MQTT handler, WebSocket sync, session auth
- ❌ JANGAN ubah nama export function yang sudah ada
- ❌ JANGAN install npm package baru — semua CDN
- ✅ SELALU tambahkan fallback primitif setiap load GLTF
- ✅ SELALU `castShadow = true` dan `receiveShadow = true` pada semua mesh
- ✅ TEST di browser (`http://localhost:PORT`) setelah tiap langkah
- ✅ Jika error "CORS" saat load model → pastikan file ada di `public/models/`
- ✅ Jika bloom error → pastikan importmap `postprocessing` sudah ditambahkan
- ✅ Express.js sudah serve static dari `public/` — model langsung accessible via `/models/`

---

## Checklist Done

- [ ] Model AGV ter-load sebagai GLTF (bukan kotak)
- [ ] Props (barrel, box) ter-load sebagai GLTF
- [ ] Scene gelap & dramatis (night mood)
- [ ] AGV punya headlight + underglow menyala
- [ ] Bloom aktif — lampu bersinar
- [ ] Kamera smooth lerp ngikutin AGV
- [ ] Dust particles melayang
- [ ] HUD font Orbitron + dark glass
- [ ] IoT sync masih jalan (cek console WebSocket)
- [ ] MQTT command masih menggerakkan AGV

---

## Referensi

- Three.js GLTFLoader: https://threejs.org/docs/#examples/en/loaders/GLTFLoader
- Kenney 3D assets (CC0 gratis): https://kenney.nl/assets/category:3D
- Quaternius CC0 models: https://quaternius.com
- Sketchfab CC0 filter: https://sketchfab.com/search?features=downloadable&license=4
- postprocessing lib: https://github.com/pmndrs/postprocessing
- Referensi visual: https://bruno-simon.com
