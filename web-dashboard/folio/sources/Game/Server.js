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

  // Event emitter
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
    this.connected = false;
    this.events = new Events(); // untuk kompatibilitas Options.js (connected/disconnected)

    this.connect();
  }

  connect() {
    try {
      this.ws = new WebSocket(AGV_WS_URL);

      this.ws.addEventListener("open", () => {
        console.log("[AGV] WebSocket connected");
        clearTimeout(this.reconnectTimer);
        this.connected = true;
        this.events.trigger("connected");

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
        this.connected = false;
        this.events.trigger("disconnected");
        agvState.events.trigger("disconnect");
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
    agvState.events.trigger("update", agvState);
    if (agvState.state !== prev.state)
      agvState.events.trigger("stateChange", agvState.state);
    if (agvState.destination !== prev.destination)
      agvState.events.trigger("destinationChange", agvState.destination);
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
    agvState.events.trigger("snapshot", agvState);
    agvState.events.trigger("update", agvState);
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
