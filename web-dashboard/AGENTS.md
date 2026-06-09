# 🤖 AGENTS.md — Integrasi Bruno Simon World ke AGV IoT Dashboard

> **Strategi**: "Copy & Own" — folio-2025 adalah **sumber aset dan referensi kode**, TIDAK PERNAH disentuh.
> Semua pekerjaan dilakukan di dalam `agv-iot/web-dashboard/folio/` (copy dari folio-2025).
> **Prinsip**: folio-2025 = patokan read-only. agv-iot = project aktif yang dimodifikasi.

---

## GAMBARAN BESAR

```
agv-iot/web-dashboard/
├── public/               → dashboard lama (tetap jalan, tidak diubah)
├── folio/                → ← FOLDER BARU: copy folio-2025 yang sudah dimodifikasi
│   ├── sources/          → copy dari folio-2025/sources/ lalu dimodifikasi
│   ├── static/           → copy dari folio-2025/static/ (assets GLB, KTX, dll)
│   ├── resources/        → copy dari folio-2025/resources/
│   ├── index.html        → copy lalu dimodifikasi (hapus UI Bruno, inject AGV HUD)
│   ├── vite.config.js    → copy persis dari folio-2025 (JANGAN ubah)
│   └── package.json      → copy persis dari folio-2025 (JANGAN ubah)
└── server.js             → TIDAK DIUBAH (backend tetap)
```

**Dua server jalan bersamaan:**

- `agv-iot/web-dashboard/` → `node server.js` di port 3000 (HTTP + WS)
- `agv-iot/web-dashboard/folio/` → `npm run dev` di port 5173 (Vite dev / Three.js world)

Komunikasi: folio (port 5173) terhubung ke agv-iot WebSocket (port 3001) untuk terima telemetry AGV.

---

## FASE 0 — PERSIAPAN (Lakukan PERTAMA, sekali saja)

### 0A. Pastikan kedua project berjalan normal dulu

```bash
# Terminal 1 — agv-iot backend
cd C:/laragon/www/agv-iot/web-dashboard
node server.js
# Pastikan: HTTP port 3000, WS port 3001

# Terminal 2 — folio-2025 original (untuk verifikasi saja)
cd C:/laragon/www/folio-2025
npm run dev
# Buka browser localhost:5173 → pastikan world Bruno jalan normal
# Setelah verifikasi, CTRL+C, jangan ubah apapun
```

### 0B. Copy folio-2025 ke dalam agv-iot

```bash
# Copy seluruh folio-2025 ke dalam agv-iot/web-dashboard/folio/
cp -r C:/laragon/www/folio-2025 C:/laragon/www/agv-iot/web-dashboard/folio

# Masuk ke folder copy-an
cd C:/laragon/www/agv-iot/web-dashboard/folio

# Install dependencies (sama persis dengan folio-2025)
npm install

# Verifikasi: harus jalan normal persis seperti folio-2025 asli
npm run dev
# Buka localhost:5173 → world Bruno harus muncul
```

> ✅ Setelah ini, **folio-2025 asli tidak pernah disentuh lagi**.
> Semua pekerjaan selanjutnya hanya di `agv-iot/web-dashboard/folio/`.

### 0C. Verifikasi WebSocket agv-iot

Pastikan port WS yang dipakai. Buka `agv-iot/web-dashboard/server.js`, cari:

```js
const WS_PORT = parseInt(process.env.WS_PORT) || 3001;
```

Catat portnya → default **3001**. Ini yang akan dipakai folio untuk konek.

---

## FASE 1 — BERSIHKAN KONTEN PORTFOLIO BRUNO

> ⚠️ Semua perubahan ini di `agv-iot/web-dashboard/folio/` — BUKAN folio-2025 asli.

### 1A. Kosongkan data portfolio

File-file ini berisi data pribadi Bruno — kosongkan isinya, JANGAN hapus file-nya:

**`sources/data/projects.js`**:

```js
export const projects = [];
```

**`sources/data/social.js`**:

```js
export const social = [];
```

**`sources/data/lab.js`**:

```js
export const lab = [];
```

**`sources/data/achievements.js`** → **BIARKAN**, bisa dipakai untuk gamifikasi AGV nanti.

### 1B. Disable area-area portfolio di `sources/Game/World/Areas/Areas.js`

Ganti `list` array — pertahankan hanya area yang relevan:

```js
// GANTI isi list array:
const list = [
  ["landing", LandingArea], // spawn point AGV
  ["circuit", CircuitArea], // lintasan/track AGV
  // HAPUS: career, projects, social, toilet, bowling,
  //        altar, behindTheScene, timeMachine, lab, cookie
];
```

Hapus juga import yang tidak dipakai di bagian atas file (semua import Area yang dihapus dari list).

---

## FASE 2 — GANTI SERVER.JS FOLIO DENGAN AGV BRIDGE

> folio-2025 punya `sources/Game/Server.js` — ini yang handle multiplayer Bruno.
> Kita GANTI seluruh isinya dengan koneksi ke agv-iot WebSocket.

Buka **`agv-iot/web-dashboard/folio/sources/Game/Server.js`**, ganti seluruh isi dengan:

```js
/**
 * Server.js — AGV WebSocket Bridge
 * Menggantikan multiplayer server Bruno Simon.
 * Konek ke agv-iot backend (Express + WS di port 3001).
 *
 * Auth flow agv-iot:
 *   1. GET /api/ws-token (butuh session cookie dari login)
 *   2. Kirim { wsToken } sebagai pesan pertama ke WebSocket
 *
 * Karena folio jalan di port berbeda (5173) dan agv-iot di 3000,
 * kita pakai token yang di-inject dari agv-iot saat serve halaman folio.
 * Untuk dev: gunakan mode bypass (lihat DEV_MODE di bawah).
 */

import { Events } from "./Events.js";

// ─── Konfigurasi ──────────────────────────────────────────────────────────────
// SESUAIKAN jika port WS agv-iot berbeda
const AGV_WS_URL = "ws://localhost:3001";

// Mode dev: bypass auth (hanya untuk development lokal)
// Set ke false saat production / integrasi penuh dengan agv-iot auth
const DEV_BYPASS_AUTH = true;

// ─── AGV State (shared state untuk semua modul) ───────────────────────────────
export const agvState = {
  // Identitas
  id: "agv-01",

  // Status
  state: "IDLE", // IDLE, MENUNGGU_BARANG, KEBERANGKATAN, SAMPAI, PULANG, SELESAI
  destination: "BASE", // BASE, A, B, C
  mode: "AUTO", // AUTO, MANUAL

  // Motor
  motorLeft: 0,
  motorRight: 0,

  // Sensor
  distanceCm: 0,
  loadcellG: 0,
  battery: 100,
  ir: { s1: 0, s2: 0, s3: 1, s4: 0, s5: 0 },

  // Koneksi
  connected: false,
  lastUpdate: 0,

  // Event emitter (gunakan Events.js milik Bruno)
  events: new Events(),
};

// Helper: konversi mission number → label
function missionToLabel(mission) {
  const n = Number(mission);
  if (!Number.isFinite(n) || n <= 0) return "BASE";
  return String.fromCharCode(64 + n); // 1→A, 2→B, 3→C
}

// ─── Server Class ─────────────────────────────────────────────────────────────
export class Server {
  constructor() {
    this.ws = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 3000;

    this.connect();
  }

  connect() {
    try {
      this.ws = new WebSocket(AGV_WS_URL);

      this.ws.addEventListener("open", () => {
        console.log("[AGV] WebSocket connected");
        clearTimeout(this.reconnectTimer);

        // Auth handshake
        if (DEV_BYPASS_AUTH) {
          // Dev mode: kirim token dummy, agv-iot server.js perlu
          // ditambahkan bypass untuk ini (lihat catatan Fase 2B)
          this.ws.send(JSON.stringify({ wsToken: "__DEV__" }));
        } else {
          // Production: ambil token dari cookie/meta tag yang
          // di-inject agv-iot saat serve halaman folio
          const token = document.querySelector(
            'meta[name="ws-token"]',
          )?.content;
          if (token) this.ws.send(JSON.stringify({ wsToken: token }));
        }
      });

      this.ws.addEventListener("message", (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handleMessage(msg);
        } catch (e) {
          console.warn("[AGV] Invalid message:", e);
        }
      });

      this.ws.addEventListener("close", () => {
        console.log("[AGV] Disconnected, retrying...");
        agvState.connected = false;
        agvState.events.emit("disconnect");
        this.reconnectTimer = setTimeout(
          () => this.connect(),
          this.reconnectDelay,
        );
      });

      this.ws.addEventListener("error", () => {
        this.ws.close();
      });
    } catch (e) {
      console.warn("[AGV] Connect error:", e);
    }
  }

  _handleMessage(msg) {
    const { topic, data } = msg;
    if (!data || typeof data !== "object") return;

    const prev = { state: agvState.state, destination: agvState.destination };

    // Snapshot awal saat koneksi
    if (topic === "xora/snapshot") {
      agvState.connected = true;
      this._applySnapshot(data);
      return;
    }

    // Telemetry real-time dari firmware
    if (topic === `agv/agv-01/telemetry`) {
      if (data.state) agvState.state = data.state;
      if (data.mission != null)
        agvState.destination = missionToLabel(data.mission);
      if (data.motor_left != null) agvState.motorLeft = data.motor_left;
      if (data.motor_right != null) agvState.motorRight = data.motor_right;
      if (data.distance_cm != null) agvState.distanceCm = data.distance_cm;
      if (data.loadcell_g != null) agvState.loadcellG = data.loadcell_g;
    }

    // State dari firmware
    if (topic === `agv/agv-01/state`) {
      if (data.state) agvState.state = data.state;
      if (data.mission != null)
        agvState.destination = missionToLabel(data.mission);
    }

    // Topic lama (xora/)
    if (topic === "xora/state")
      agvState.state =
        typeof data === "string" ? data : data.state || agvState.state;
    if (topic === "xora/destination")
      agvState.destination =
        typeof data === "string"
          ? data
          : data.destination || agvState.destination;
    if (topic === "xora/mode")
      agvState.mode =
        typeof data === "string" ? data : data.mode || agvState.mode;
    if (topic === "xora/battery")
      agvState.battery = typeof data === "number" ? data : parseFloat(data);
    if (topic === "xora/sensor/ir")
      agvState.ir = typeof data === "object" ? data : agvState.ir;
    if (topic === "xora/sensor/ultrasonic")
      agvState.distanceCm = typeof data === "number" ? data : parseFloat(data);
    if (topic === "xora/sensor/loadcell")
      agvState.loadcellG = typeof data === "number" ? data : parseFloat(data);

    agvState.lastUpdate = Date.now();
    agvState.connected = true;

    // Emit events jika ada perubahan
    agvState.events.emit("update", agvState);
    if (agvState.state !== prev.state)
      agvState.events.emit("stateChange", agvState.state);
    if (agvState.destination !== prev.destination)
      agvState.events.emit("destinationChange", agvState.destination);
  }

  _applySnapshot(data) {
    if (data.state) agvState.state = data.state;
    if (data.destination) agvState.destination = data.destination;
    if (data.mode) agvState.mode = data.mode;
    if (data.battery) agvState.battery = data.battery;
    if (data.motorLeft != null) agvState.motorLeft = data.motorLeft;
    if (data.motorRight != null) agvState.motorRight = data.motorRight;
    if (data.sensors?.ultrasonic != null)
      agvState.distanceCm = data.sensors.ultrasonic;
    if (data.sensors?.loadcell != null)
      agvState.loadcellG = data.sensors.loadcell;
    if (data.sensors?.ir) agvState.ir = data.sensors.ir;
    agvState.connected = true;
    agvState.events.emit("snapshot", agvState);
    agvState.events.emit("update", agvState);
    console.log(
      "[AGV] Snapshot received:",
      agvState.state,
      "→",
      agvState.destination,
    );
  }

  sendCommand(command) {
    this._send({ command });
  }

  sendManual(command) {
    this._send({ manualCmd: command });
  }

  _send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }
}
```

### 2B. Tambahkan DEV bypass di agv-iot server.js (khusus development)

Di `agv-iot/web-dashboard/server.js`, cari bagian auth WebSocket:

```js
// Cari ini:
if (!msg.wsToken) {
  ws.close(4003, "Token required");
  return;
}
const username = auth.validateWSToken(msg.wsToken);
if (!username) {
  ws.close(4003, "Invalid token");
  return;
}
```

Tambahkan bypass DEV di atasnya:

```js
// DEV BYPASS — hapus di production!
if (msg.wsToken === "__DEV__" && process.env.NODE_ENV !== "production") {
  clearTimeout(authTimeout);
  ws.authenticated = true;
  ws.username = "dev";
  console.log("[WS] DEV bypass auth");
  ws.send(
    JSON.stringify({
      topic: "xora/snapshot",
      data: agvState,
      ts: new Date().toISOString(),
    }),
  );
  return;
}
```

> ⚠️ Blok ini hanya untuk development. Wajib dihapus sebelum deploy production.

---

## FASE 3 — EXPOSE agvState KE GAME.JS

Buka **`agv-iot/web-dashboard/folio/sources/Game/Game.js`**.

Cari baris yang ada `this.server = new Server()`. Tambahkan setelahnya:

```js
this.server = new Server();
this.agvState = agvState; // import { agvState } from './Server.js'
```

Pastikan import di atas Game.js sudah include `agvState`:

```js
import { Server, agvState } from "./Server.js";
```

---

## FASE 4 — MODIFIKASI PLAYER.JS UNTUK HYBRID CONTROL

Buka **`agv-iot/web-dashboard/folio/sources/Game/Player.js`**.

Tambahkan method baru di dalam class Player:

```js
// Tambahkan method ini di Player class
syncFromAGV() {
    const state = this.game.agvState
    if (!state || state.mode !== 'AUTO') return

    const ml = state.motorLeft
    const mr = state.motorRight

    // Differential drive → normalized steering & acceleration
    // SESUAIKAN 255 dengan max motor value AGV kamu
    const MAX_MOTOR = 255
    const avgSpeed = (ml + mr) / 2
    const diff = ml - mr

    this.accelerating = avgSpeed / MAX_MOTOR
    this.steering = -(diff / MAX_MOTOR) * 0.5
}
```

Di method `update()` / `tick()` Player.js, tambahkan di paling awal:

```js
// Sync dari AGV jika mode AUTO
if (this.game.agvState?.mode === "AUTO") {
  this.syncFromAGV();
  return; // skip keyboard input
}
```

---

## FASE 5 — BUAT AGV STATIONS

Buat file baru **`agv-iot/web-dashboard/folio/sources/Game/AGV/Stations.js`**:

```js
/**
 * Stations.js — Visual marker untuk 4 station AGV: BASE, A, B, C
 * Menggunakan Three.js dari folio-2025 (sudah tersedia via import)
 */
import * as THREE from "three/webgpu";
import { Game } from "../Game.js";

// Koordinat station di world Bruno Simon
// Jalankan game, aktifkan debug (tekan H), cari area flat yang kosong
// lalu update koordinat ini
const STATIONS = {
  BASE: { x: 0, z: 10, color: 0x4488ff, label: "STN BASE" },
  A: { x: 0, z: -5, color: 0x00cc66, label: "STN A" },
  B: { x: 15, z: -20, color: 0xffaa00, label: "STN B" },
  C: { x: -15, z: -35, color: 0xff4466, label: "STN C" },
};

export class Stations {
  constructor() {
    this.game = Game.getInstance();
    this.items = {};

    for (const [name, cfg] of Object.entries(STATIONS)) {
      this.items[name] = this._build(name, cfg);
    }

    // Highlight station aktif saat destination berubah
    this.game.agvState.events.on("destinationChange", (dest) => {
      this._highlight(dest);
    });

    // Highlight berdasarkan state awal
    this._highlight(this.game.agvState.destination);
  }

  _build(name, cfg) {
    const group = new THREE.Group();
    group.position.set(cfg.x, 0, cfg.z);

    // Platform
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 0.05, 32),
      new THREE.MeshStandardMaterial({
        color: cfg.color,
        emissive: cfg.color,
        emissiveIntensity: 0.3,
        roughness: 0.4,
      }),
    );
    platform.receiveShadow = true;
    group.add(platform);

    // Ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.8, 0.05, 8, 32),
      new THREE.MeshBasicMaterial({ color: cfg.color }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    group.add(ring);

    // Point light
    const light = new THREE.PointLight(cfg.color, 2, 6);
    light.position.y = 1;
    group.add(light);

    this.game.scene.add(group);
    return { group, platform, ring, light, cfg };
  }

  _highlight(activeName) {
    for (const [name, station] of Object.entries(this.items)) {
      const isActive = name === activeName;
      station.light.intensity = isActive ? 5 : 2;
      station.platform.material.emissiveIntensity = isActive ? 1.0 : 0.3;
    }
  }

  update(elapsed) {
    for (const station of Object.values(this.items)) {
      station.ring.rotation.z = elapsed * 0.5;
    }
  }
}
```

---

## FASE 6 — BUAT AGV HUD

Buat file baru **`agv-iot/web-dashboard/folio/sources/Game/AGV/AGVHud.js`**:

```js
/**
 * AGVHud.js — Overlay HUD telemetry AGV di atas world Bruno Simon
 * Inject ke DOM, pointer-events only pada elemen interaktif
 */
import { Game } from "../Game.js";

export class AGVHud {
  constructor() {
    this.game = Game.getInstance();
    this.agvState = this.game.agvState;
    this._buildDOM();
    this._bindEvents();
  }

  _buildDOM() {
    const hud = document.createElement("div");
    hud.id = "agv-hud";
    hud.innerHTML = `
        <style>
            #agv-hud {
                position: fixed; inset: 0;
                pointer-events: none;
                font-family: 'Courier New', monospace;
                z-index: 100;
            }
            #agv-status {
                position: absolute; top: 16px; left: 16px;
                background: rgba(8,12,24,0.85);
                border: 1px solid rgba(0,220,180,0.35);
                backdrop-filter: blur(10px);
                border-radius: 6px;
                padding: 10px 14px;
                color: #b8ddf0;
                font-size: 12px;
                line-height: 2;
                pointer-events: all;
                min-width: 200px;
            }
            .hud-row { display: flex; justify-content: space-between; gap: 12px; }
            .hud-label { color: #556677; }
            .hud-val { color: #00e8c0; font-weight: bold; }
            #hud-state-badge {
                font-size: 13px; font-weight: bold; color: #00e8c0;
                letter-spacing: 1px; margin-bottom: 4px;
            }
            .dot {
                display: inline-block; width: 7px; height: 7px;
                border-radius: 50%; background: #00e8c0;
                box-shadow: 0 0 6px #00e8c0;
                animation: blink 2s infinite; margin-right: 6px;
                vertical-align: middle;
            }
            @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.25} }

            #agv-cmd {
                position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
                display: flex; gap: 8px;
                pointer-events: all;
            }
            #agv-mode {
                position: absolute; bottom: 20px; left: 16px;
                display: flex; gap: 6px;
                pointer-events: all;
            }
            .hud-btn {
                background: rgba(8,12,24,0.88);
                border: 1px solid rgba(0,220,180,0.35);
                color: #b8ddf0;
                padding: 7px 14px; border-radius: 4px;
                cursor: pointer;
                font-family: 'Courier New', monospace; font-size: 12px;
                transition: background 0.15s, border-color 0.15s;
            }
            .hud-btn:hover { background: rgba(0,220,180,0.12); border-color: #00e8c0; }
            .hud-btn.active { color: #00e8c0; border-color: #00e8c0; box-shadow: 0 0 8px rgba(0,220,180,0.25); }
        </style>

        <div id="agv-status">
            <div id="hud-state-badge"><span class="dot"></span><span id="hud-state">IDLE</span></div>
            <div class="hud-row"><span class="hud-label">Dest</span><span class="hud-val" id="hud-dest">BASE</span></div>
            <div class="hud-row"><span class="hud-label">Motor L/R</span><span class="hud-val" id="hud-motor">0 / 0</span></div>
            <div class="hud-row"><span class="hud-label">Load</span><span class="hud-val" id="hud-load">0 g</span></div>
            <div class="hud-row"><span class="hud-label">Dist</span><span class="hud-val" id="hud-dist">0 cm</span></div>
            <div class="hud-row"><span class="hud-label">Battery</span><span class="hud-val" id="hud-batt">100%</span></div>
        </div>

        <div id="agv-cmd">
            <button class="hud-btn" id="btn-a">📍 STN A</button>
            <button class="hud-btn" id="btn-b">📍 STN B</button>
            <button class="hud-btn" id="btn-c">📍 STN C</button>
            <button class="hud-btn" id="btn-return">🏠 Return</button>
        </div>

        <div id="agv-mode">
            <button class="hud-btn active" id="btn-auto">AUTO</button>
            <button class="hud-btn" id="btn-manual">MANUAL</button>
        </div>
        `;
    document.body.appendChild(hud);
  }

  _bindEvents() {
    this.agvState.events.on("update", (s) => this._refresh(s));

    const $ = (id) => document.getElementById(id);
    $("btn-a")?.addEventListener("click", () =>
      this.game.server.sendCommand("GOTO_A"),
    );
    $("btn-b")?.addEventListener("click", () =>
      this.game.server.sendCommand("GOTO_B"),
    );
    $("btn-c")?.addEventListener("click", () =>
      this.game.server.sendCommand("GOTO_C"),
    );
    $("btn-return")?.addEventListener("click", () =>
      this.game.server.sendCommand("RETURN"),
    );

    $("btn-auto")?.addEventListener("click", () => {
      this.game.server.sendCommand("SET_MODE_AUTO");
      $("btn-auto").classList.add("active");
      $("btn-manual").classList.remove("active");
    });
    $("btn-manual")?.addEventListener("click", () => {
      this.game.server.sendCommand("SET_MODE_MANUAL");
      $("btn-manual").classList.add("active");
      $("btn-auto").classList.remove("active");
    });
  }

  _refresh(s) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set("hud-state", s.state);
    set("hud-dest", s.destination);
    set(
      "hud-motor",
      `${Math.round(s.motorLeft)} / ${Math.round(s.motorRight)}`,
    );
    set("hud-load", `${Math.round(s.loadcellG)} g`);
    set("hud-dist", `${Math.round(s.distanceCm)} cm`);
    set("hud-batt", `${Math.round(s.battery)}%`);
  }
}
```

---

## FASE 7 — REGISTER MODUL AGV KE GAME.JS

Buka **`agv-iot/web-dashboard/folio/sources/Game/Game.js`**.

Tambahkan import di bagian atas:

```js
import { Server, agvState } from "./Server.js"; // ganti import Server lama jika ada
import { Stations } from "./AGV/Stations.js";
import { AGVHud } from "./AGV/AGVHud.js";
```

Cari baris `this.server = new Server()`, ubah menjadi:

```js
this.server = new Server();
this.agvState = agvState;
```

Cari bagian akhir init() setelah world/terrain sudah siap, tambahkan:

```js
// AGV modules — init setelah world selesai loading
this.stations = new Stations();
this.agvHud = new AGVHud();
```

---

## FASE 8 — SESUAIKAN SPAWN POINT

Di **`agv-iot/web-dashboard/folio/sources/Game/Respawns.js`** (atau di mana spawn 'landing' didefinisikan):

Ubah koordinat spawn `'landing'` agar kendaraan spawn di dekat STN BASE:

```js
// Cari posisi spawn 'landing', ubah y ke 1 (sedikit di atas terrain)
// dan x/z ke dekat koordinat BASE di Stations.js:
// x: 0, y: 1, z: 8
```

> Cara mudah: jalankan game, tekan H untuk debug mode,
> arahkan kendaraan ke lokasi yang diinginkan, catat koordinat, hardcode.

---

## FASE 9 — UPDATE VITE CONFIG UNTUK CORS (opsional)

Agar Vite dev server (5173) bisa request ke agv-iot (3000) tanpa CORS error,
tambahkan proxy di **`agv-iot/web-dashboard/folio/vite.config.js`**:

```js
// Tambahkan di dalam defineConfig({...}):
server: {
    proxy: {
        '/api': 'http://localhost:3000',
        '/login': 'http://localhost:3000',
    }
}
```

> ⚠️ vite.config.js boleh diubah HANYA untuk menambahkan proxy ini.
> Jangan ubah plugin WASM, top-level-await, atau setting lainnya.

---

## URUTAN EKSEKUSI

```
FASE 0  — Copy folio-2025 → agv-iot/web-dashboard/folio/, verifikasi jalan
FASE 1  — Bersihkan data portfolio Bruno (non-destructive)
FASE 2  — Ganti Server.js + DEV bypass di agv-iot server.js
FASE 3  — Expose agvState di Game.js
FASE 4  — Tambah syncFromAGV di Player.js
FASE 5  — Buat AGV/Stations.js (file baru)
FASE 6  — Buat AGV/AGVHud.js (file baru)
FASE 7  — Register ke Game.js
FASE 8  — Sesuaikan spawn point
          → TEST: npm run dev di folio/, + node server.js di web-dashboard/
          → Buka localhost:5173, cek console, pastikan WS connect ke 3001
FASE 9  — Tambahkan Vite proxy (opsional, jika perlu akses /api)
```

**Setelah setiap fase: `npm run dev`, buka browser, cek console tidak ada error.**

---

## ATURAN WAJIB

### ❌ JANGAN PERNAH:

- Menyentuh `C:/laragon/www/folio-2025/` — itu read-only reference selamanya
- Mengubah `vite.config.js` folio (kecuali proxy di Fase 9)
- Mengubah `package.json` folio
- Menginstall package baru di folio (semua sudah tersedia)
- Mengubah `agv-iot/web-dashboard/server.js` kecuali DEV bypass di Fase 2B
- Mengubah `PhysicsVehicle.js`, `VisualVehicle.js`, `Terrain.js`, `Lighting.js`, `World.js`

### ✅ BOLEH DAN HARUS:

- Semua file AGV baru masuk ke `agv-iot/web-dashboard/folio/sources/Game/AGV/`
- Selalu `npm run dev` dan cek browser setelah setiap fase
- Jika import error: cek path relatif (`../` vs `./`)
- Jika WS tidak connect: pastikan `node server.js` agv-iot jalan, cek port 3001
- Jika physics/visual error: jangan ubah physics — cek apakah agvState sudah terdefinisi

### Referensi saat bingung:

- Cara class di-init → lihat `folio-2025/sources/Game/Game.js` asli
- Cara Events dipakai → lihat `folio-2025/sources/Game/Events.js` asli
- Koordinat terrain → jalankan folio, tekan H (debug), gerakkan kendaraan

---

## STRUKTUR AKHIR YANG DIHARAPKAN

```
Terminal 1: cd agv-iot/web-dashboard && node server.js
            → HTTP :3000, WS :3001, MQTT bridge, DB

Terminal 2: cd agv-iot/web-dashboard/folio && npm run dev
            → Vite :5173, Three.js world Bruno Simon

Browser: localhost:5173
  ✅ Dunia Bruno Simon muncul (terrain, trees, lighting, physics)
  ✅ Kendaraan bisa dikontrol keyboard (MANUAL) atau dari MQTT (AUTO)
  ✅ 4 station bercahaya: BASE, A, B, C
  ✅ HUD overlay: telemetry real-time (state, motor, sensor, battery)
  ✅ Tombol command: GOTO A/B/C, Return, toggle AUTO/MANUAL
  ✅ Console: "[AGV] WebSocket connected", "[AGV] Snapshot received"
```
