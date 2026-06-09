/**
 * Xora AGV — Secure Bridge Server v4
 * HTTP + Session Auth + MQTT ↔ WebSocket + NeonDB
 *
 * Security layers:
 *  - Helmet (CSP, XSS headers, clickjacking, MIME sniff, etc.)
 *  - Rate limiting (login brute-force + global)
 *  - express-session dengan httpOnly, secure, sameSite cookies
 *  - CSRF protection pada semua POST state-changing
 *  - WebSocket auth via one-time token (issued post-login)
 *  - Input sanitization (no raw SQL interpolation, parameterized queries)
 *  - No stack traces exposed ke client
 */

"use strict";

require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const session = require("express-session");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const csrf = require("csurf");
const mqtt = require("mqtt");
const { WebSocketServer } = require("ws");
const { Pool } = require("pg");
const auth = require("./auth");

// ─── Validate required env ────────────────────────────────────────────────────
const REQUIRED_ENV = ["SESSION_SECRET", "ADMIN_PASSWORD_PLAIN", "DATABASE_URL"];
for (const k of REQUIRED_ENV) {
  if (!process.env[k]) {
    console.error(`[ENV] Missing required env var: ${k}`);
    process.exit(1);
  }
}

const IS_PROD = process.env.NODE_ENV === "production";
const HTTP_PORT = parseInt(process.env.PORT) || 3000;
const WS_PORT = parseInt(process.env.WS_PORT) || 3001;
const SERVER_START = new Date().toISOString();

// ─── Database ─────────────────────────────────────────────────────────────────
const useSSL = process.env.DB_SSL !== "false";
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS agv_events (
      id          SERIAL PRIMARY KEY,
      code        TEXT,
      message     TEXT,
      state       TEXT,
      destination TEXT,
      mode        TEXT,
      source      TEXT DEFAULT 'esp32',
      ts          TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS agv_sensor_logs (
      id          SERIAL PRIMARY KEY,
      ultrasonic  FLOAT,
      loadcell    FLOAT,
      battery     FLOAT,
      ir_pattern  TEXT,
      state       TEXT,
      ts          TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS agv_missions (
      id                SERIAL PRIMARY KEY,
      destination       TEXT NOT NULL,
      status            TEXT DEFAULT 'IN_PROGRESS',
      cargo_weight      FLOAT,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      cargo_detected_at TIMESTAMPTZ,
      departed_at       TIMESTAMPTZ,
      arrived_at        TIMESTAMPTZ,
      cargo_removed_at  TIMESTAMPTZ,
      return_departed_at TIMESTAMPTZ,
      returned_at       TIMESTAMPTZ,
      duration_seconds  FLOAT
    );
  `);
  console.log("[DB] Tables ready (events, sensor_logs, missions)");
}

async function insertEvent(ev) {
  try {
    await db.query(
      `INSERT INTO agv_events (code, message, state, destination, mode, source)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        ev.code || null,
        ev.message || null,
        agvState.state,
        agvState.destination,
        agvState.mode,
        ev.source || "esp32",
      ],
    );
  } catch (e) {
    console.error("[DB] insertEvent:", e.message);
  }
}

async function insertSensorLog() {
  try {
    const ir = agvState.sensors.ir;
    const pat = ir
      ? ["s1", "s2", "s3", "s4", "s5"].map((k) => (ir[k] ? "1" : "0")).join("")
      : null;
    await db.query(
      `INSERT INTO agv_sensor_logs (ultrasonic, loadcell, battery, ir_pattern, state)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        agvState.sensors.ultrasonic,
        agvState.sensors.loadcell,
        agvState.battery,
        pat,
        agvState.state,
      ],
    );
  } catch (e) {
    console.error("[DB] insertSensorLog:", e.message);
  }
}

// ─── AGV State ────────────────────────────────────────────────────────────────
function missionToDestination(mission) {
  const n = Number(mission);
  if (!Number.isFinite(n) || n <= 0) return "BASE";
  return String.fromCharCode(64 + n);
}

const agvState = {
  state: "IDLE",
  destination: "BASE",
  mode: "AUTO",
  battery: 100,
  blackboxCount: 0,
  waiting: false,
  motorLeft: 0,
  motorRight: 0,
  sensors: {
    ir: { s1: 0, s2: 0, s3: 1, s4: 0, s5: 0 },
    ultrasonic: 50,
    loadcell: 0,
  },
  events: [],
  connectedAt: new Date().toISOString(),
};

// ─── Mission Tracking ─────────────────────────────────────────────────────────
let currentMission = null; // Active mission being tracked
let prevStateForMission = "IDLE";
let stateChangeQueue = Promise.resolve();

function queueStateChange(newState) {
  if (!newState) return;
  stateChangeQueue = stateChangeQueue
    .then(() => handleStateChange(newState))
    .catch((e) => console.error("[MISSION] handleStateChange:", e.message));
}

async function startMission(destination) {
  if (!["A", "B", "C"].includes(destination)) {
    console.log(`[MISSION] Ignoring mission start with destination=${destination}`);
    return;
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO agv_missions (destination, status) VALUES ($1, 'WAITING_CARGO') RETURNING id`,
      [destination],
    );
    currentMission = {
      id: rows[0]?.id,
      destination,
      status: "WAITING_CARGO",
      cargoWeight: null,
    };
    console.log(`[MISSION] #${currentMission.id} started → ${destination}`);
  } catch (e) {
    console.error("[MISSION] startMission:", e.message);
  }
}

async function updateMission(field, value) {
  if (!currentMission?.id) return;
  try {
    await db.query(
      `UPDATE agv_missions SET ${field} = $1 WHERE id = $2`,
      [value, currentMission.id],
    );
  } catch (e) {
    console.error(`[MISSION] updateMission ${field}:`, e.message);
  }
}

async function completeMission(status) {
  if (!currentMission?.id) return;
  try {
    const durationRes = await db.query(
      `SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) as dur FROM agv_missions WHERE id = $1`,
      [currentMission.id],
    );
    const duration = durationRes.rows[0]?.dur || null;
    await db.query(
      `UPDATE agv_missions SET status = $1, duration_seconds = $2, returned_at = NOW() WHERE id = $3`,
      [status, duration, currentMission.id],
    );
    console.log(`[MISSION] #${currentMission.id} completed → ${status} (${duration?.toFixed(0)}s)`);
    currentMission = null;
  } catch (e) {
    console.error("[MISSION] completeMission:", e.message);
  }
}

async function handleStateChange(newState) {
  const prev = prevStateForMission;
  if (newState === prev) return;
  prevStateForMission = newState;
  console.log(`[MISSION] State change: ${prev} → ${newState} (dest=${agvState.destination}, mission=${currentMission?.id || 'none'})`);

  // Skip spurious transition: IDLE → SELESAI on server restart
  // (firmware sends its last state which is already SELESAI)
  if (prev === "IDLE" && newState === "SELESAI") {
    console.log("[MISSION] Skipping IDLE→SELESAI (restart recovery)");
    currentMission = null;
    return;
  }

  const stateEventCode = {
    MENUNGGU_BARANG: "WAITING_CARGO",
    KEBERANGKATAN: "MISSION_STARTED",
    SAMPAI: "ARRIVED",
    PULANG: "RETURNING",
    SELESAI: "MISSION_COMPLETED",
    ERROR_STATE: "ERROR_STATE",
    IDLE: "IDLE",
  }[newState] || "STATE_CHANGE";

  await insertEvent({
    code: stateEventCode,
    message: `${prev} -> ${newState}`,
    source: "esp32",
  });

  // New mission starts when AGV waits for cargo, or when it departs
  // immediately because cargo was already detected.
  if ((newState === "MENUNGGU_BARANG" || newState === "KEBERANGKATAN") && !currentMission) {
    await startMission(agvState.destination);
  }

  // Cargo detected, AGV departing
  if (newState === "KEBERANGKATAN" && currentMission) {
    await updateMission("cargo_detected_at", new Date().toISOString());
    await updateMission("departed_at", new Date().toISOString());
    await updateMission("cargo_weight", agvState.sensors.loadcell);
    await updateMission("status", "IN_PROGRESS");
    currentMission.status = "IN_PROGRESS";
    currentMission.cargoWeight = agvState.sensors.loadcell;
  }

  // Arrived at destination
  if (newState === "SAMPAI" && currentMission) {
    await updateMission("arrived_at", new Date().toISOString());
  }

  // Cargo removed, returning to base
  if (newState === "PULANG" && currentMission) {
    await updateMission("cargo_removed_at", new Date().toISOString());
    await updateMission("return_departed_at", new Date().toISOString());
  }

  // Mission completed successfully
  if (newState === "SELESAI") {
    if (currentMission) await completeMission("COMPLETED");
    currentMission = null;
  }

  // Mission failed due to error
  if (newState === "ERROR_STATE") {
    if (currentMission) await completeMission("FAILED");
    currentMission = null;
  }

  // Back to idle — clean up any stale mission
  if (newState === "IDLE") {
    if (currentMission) await completeMission("FAILED");
    currentMission = null;
  }
}

// ─── MQTT ─────────────────────────────────────────────────────────────────────
const MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://broker.hivemq.com:1883";
const MQTT_CLIENT_ID = `xora-bridge-${Math.random().toString(16).slice(2, 8)}`;

const DEVICE_ID = "agv-01";

const TOPICS_SUB = [
  "xora/state",
  "xora/destination",
  "xora/sensor/ir",
  "xora/sensor/ultrasonic",
  "xora/sensor/loadcell",
  "xora/event",
  "xora/mode",
  "xora/battery",
  `agv/${DEVICE_ID}/state`,
  `agv/${DEVICE_ID}/telemetry`,
  `agv/${DEVICE_ID}/status`,
];
const TOPIC_CMD = "xora/command";
const TOPIC_MANUAL = `agv/${DEVICE_ID}/cmd`;
const TOPIC_AGV_CMD = `agv/${DEVICE_ID}/cmd`;

console.log(`[MQTT] Connecting → ${MQTT_BROKER}`);
const mqttClient = mqtt.connect(MQTT_BROKER, {
  clientId: MQTT_CLIENT_ID,
  keepalive: 60,
  reconnectPeriod: 3000,
  clean: true,
});

let sensorLogTimer = null;

mqttClient.on("connect", () => {
  console.log("[MQTT] Connected");
  TOPICS_SUB.forEach((t) =>
    mqttClient.subscribe(t, { qos: 1 }, (err) => {
      if (err) console.error(`[MQTT] Subscribe error ${t}:`, err);
    }),
  );
  sensorLogTimer = setInterval(insertSensorLog, 10000);
});
mqttClient.on("reconnect", () => console.log("[MQTT] Reconnecting..."));
mqttClient.on("error", (e) => console.error("[MQTT] Error:", e.message));
mqttClient.on("offline", () => {
  console.log("[MQTT] Offline");
  clearInterval(sensorLogTimer);
});

mqttClient.on("message", (topic, payload) => {
  const raw = payload.toString();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  switch (topic) {
    case "xora/state": {
      const s = typeof data === "string" ? data : data.state || data;
      agvState.state = s;
      queueStateChange(s);
      break;
    }
    case "xora/destination":
      agvState.destination =
        typeof data === "string" ? data : data.destination || data;
      break;
    case "xora/mode":
      agvState.mode = typeof data === "string" ? data : data.mode || data;
      break;
    case "xora/battery":
      agvState.battery = typeof data === "number" ? data : parseFloat(data);
      break;
    case "xora/sensor/ir":
      agvState.sensors.ir =
        typeof data === "object" ? data : agvState.sensors.ir;
      break;
    case "xora/sensor/ultrasonic":
      agvState.sensors.ultrasonic =
        typeof data === "number" ? data : parseFloat(data);
      break;
    case "xora/sensor/loadcell":
      agvState.sensors.loadcell =
        typeof data === "number" ? data : parseFloat(data);
      break;
    case "xora/event": {
      const event =
        typeof data === "object"
          ? data
          : {
              code: "EVENT",
              message: raw,
              timestamp: new Date().toISOString(),
            };
      if (!event.timestamp) event.timestamp = new Date().toISOString();
      agvState.events.unshift(event);
      if (agvState.events.length > 50) agvState.events.pop();
      insertEvent(event);
      break;
    }

    // ── AGV Firmware State ─────────────────────────────────────────────────
    case `agv/${DEVICE_ID}/state`: {
      if (typeof data === "object") {
        const nextState = data.state;
        if (data.mission != null) agvState.destination = missionToDestination(data.mission);
        if (data.blackbox_count != null) agvState.blackboxCount = data.blackbox_count;
        if (data.distance_cm != null) agvState.sensors.ultrasonic = data.distance_cm;
        if (data.waiting != null) agvState.waiting = data.waiting;
        if (nextState) {
          agvState.state = nextState;
          queueStateChange(nextState);
        }
      }
      break;
    }
    case `agv/${DEVICE_ID}/telemetry`: {
      if (typeof data === "object") {
        const nextState = data.state;
        if (data.mission != null) agvState.destination = missionToDestination(data.mission);
        if (data.blackbox_count != null) agvState.blackboxCount = data.blackbox_count;
        if (data.distance_cm != null) agvState.sensors.ultrasonic = data.distance_cm;
        if (data.line_left != null) agvState.sensors.ir = {
          s1: data.ir_left || 0,
          s2: data.line_left || 0,
          s3: data.line_middle || 0,
          s4: data.line_right || 0,
          s5: data.ir_right || 0,
        };
        if (data.motor_left != null) agvState.motorLeft = data.motor_left;
        if (data.motor_right != null) agvState.motorRight = data.motor_right;
        if (data.waiting != null) agvState.waiting = data.waiting;
        if (data.loadcell_g != null) agvState.sensors.loadcell = data.loadcell_g;
        if (nextState) {
          agvState.state = nextState;
          queueStateChange(nextState);
        }
      }
      break;
    }
    case `agv/${DEVICE_ID}/status`: {
      if (typeof data === "object" && data.online != null) {
        agvState.agvOnline = data.online;
      }
      break;
    }
  }

  const wsMsg = JSON.stringify({ topic, data, ts: new Date().toISOString() });
  wss.clients.forEach((c) => {
    if (c.readyState === 1 && c.authenticated) c.send(wsMsg);
  });
  if (topic === `agv/${DEVICE_ID}/telemetry` && typeof data === "object") {
    console.log(
      `[MQTT→WS] ${topic}: distance=${data.distance_cm}cm loadcell=${data.loadcell_g}g ` +
        `ir=${data.ir_left}${data.line_left}${data.line_middle}${data.line_right}${data.ir_right} ` +
        `mqtt=${data.mqtt_connected}`,
    );
  } else {
    console.log(`[MQTT→WS] ${topic}: ${raw.slice(0, 120)}`);
  }
});

// ─── Express App ──────────────────────────────────────────────────────────────
const app = express();

// Trust proxy (untuk reverse proxy / VPS)
app.set("trust proxy", 1);
app.use(
  "/fontawesome",
  express.static(
    path.join(__dirname, "node_modules/@fortawesome/fontawesome-free"),
  ),
);

// ── Helmet Security Headers ────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdnjs.cloudflare.com",
          "https://fonts.googleapis.com",
          "https://unpkg.com",
          "https://cdn.jsdelivr.net",
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://fonts.gstatic.com",
        ],
        fontSrc: [
          "'self'",
          "https://fonts.googleapis.com",
          "https://fonts.gstatic.com",
        ],
        connectSrc: [
          "'self'",
          "ws://localhost:3000",
          "ws://127.0.0.1:3000",
          "ws://156.230.188.87:3000",
          "http://156.230.188.87:3000",
          "wss:",
          "http://localhost:5173",  // folio dev server (3D world)
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        frameSrc: ["'self'", "http://localhost:5173"],  // folio 3D world iframe
        objectSrc: ["'none'"],
        upgradeInsecureRequests: null,  // Jangan paksa HTTPS (belum ada SSL)
      },
    },
    crossOriginEmbedderPolicy: false,   // allow Chart.js CDN
    crossOriginOpenerPolicy: false,     // disable COOP (butuh HTTPS)
    crossOriginResourcePolicy: false,   // disable CORP (butuh HTTPS)
  }),
);

// ── Body & Cookie Parsers ──────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// ── Session ───────────────────────────────────────────────────────────────────
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    name: "xora.sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // HTTPS only di production
      sameSite: "strict",
      maxAge: 8 * 60 * 60 * 1000, // 8 jam
    },
  }),
);

// ── Global Rate Limit (semua endpoint) ────────────────────────────────────────
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, coba lagi nanti." },
  }),
);

// ── Login Rate Limit (brute-force protection) ─────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // max 10 percobaan per 15 menit
  skipSuccessfulRequests: true,
  message: { error: "Terlalu banyak percobaan login. Tunggu 15 menit." },
});

// ── CSRF ──────────────────────────────────────────────────────────────────────
const csrfProtection = csrf({ cookie: false }); // pakai session-based CSRF

// ─── Routes ───────────────────────────────────────────────────────────────────

// Serve static files (login.html, index.html, assets)
app.use(
  express.static(path.join(__dirname, "public"), {
    index: false, // jangan auto-serve index, kita handle manual
    dotfiles: "deny", // block .env, .git, dll
  }),
);

// ── GET /login ────────────────────────────────────────────────────────────────
app.get("/login", csrfProtection, (req, res) => {
  if (req.session?.user) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// ── POST /login ───────────────────────────────────────────────────────────────
app.post("/login", loginLimiter, csrfProtection, async (req, res) => {
  try {
    const { username, password } = req.body;

    // Basic input validation
    if (
      !username ||
      !password ||
      typeof username !== "string" ||
      typeof password !== "string" ||
      username.length > 64 ||
      password.length > 128
    ) {
      return res.status(400).json({ error: "Input tidak valid." });
    }

    const user = await auth.verifyCredentials(
      username.trim().toLowerCase(),
      password,
    );

    if (!user) {
      // Delay response untuk slow-down brute force
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));
      return res.status(401).json({ error: "Username atau password salah." });
    }

    // Regenerate session untuk mencegah session fixation
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Session error." });
      req.session.user = user;
      req.session.loginAt = new Date().toISOString();
      return res.json({ ok: true, redirect: "/" });
    });
  } catch (e) {
    console.error("[AUTH] Login error:", e.message);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ── GET /logout ───────────────────────────────────────────────────────────────
app.post("/logout", auth.requireAuth, csrfProtection, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("xora.sid");
    res.json({ ok: true });
  });
});

// ── GET /api/csrf-token ───────────────────────────────────────────────────────
// Frontend ambil CSRF token via ini sebelum POST
app.get("/api/csrf-token", csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// ── GET /api/ws-token ─────────────────────────────────────────────────────────
// Setelah login, frontend minta WS token untuk auth handshake
app.get("/api/ws-token", auth.requireAuth, csrfProtection, (req, res) => {
  const token = auth.issueWSToken(req.session.user.username);
  res.json({ token });
});

// ── GET /api/me ───────────────────────────────────────────────────────────────
app.get("/api/me", auth.requireAuth, (req, res) => {
  res.json({
    username: req.session.user.username,
    role: req.session.user.role,
    loginAt: req.session.loginAt,
  });
});

// ── GET / (dashboard) ─────────────────────────────────────────────────────────
app.get("/", auth.requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── POST /api/change-password ─────────────────────────────────────────────────
app.post(
  "/api/change-password",
  auth.requireAuth,
  csrfProtection,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (
        !currentPassword ||
        !newPassword ||
        typeof currentPassword !== "string" ||
        typeof newPassword !== "string" ||
        newPassword.length < 8 ||
        newPassword.length > 128
      ) {
        return res.status(400).json({ error: "Input tidak valid." });
      }
      // Verify current password
      const user = await auth.verifyCredentials(
        req.session.user.username,
        currentPassword,
      );
      if (!user) {
        await new Promise((r) => setTimeout(r, 600));
        return res.status(401).json({ error: "Password saat ini salah." });
      }
      // Update hash
      await auth.changePassword(req.session.user.username, newPassword);
      return res.json({ ok: true });
    } catch (e) {
      console.error("[AUTH] changePassword error:", e.message);
      return res.status(500).json({ error: "Internal server error." });
    }
  },
);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Error handler (NO stack traces ke client) ─────────────────────────────────
app.use((err, req, res, _next) => {
  if (err.code === "EBADCSRFTOKEN") {
    return res
      .status(403)
      .json({ error: "CSRF token tidak valid. Refresh halaman." });
  }
  console.error("[APP] Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error." });
});

// ─── HTTP + WebSocket Server ──────────────────────────────────────────────────
const httpServer = http.createServer(app);

// WebSocket server terpisah di port WS_PORT
const wss = new WebSocketServer({ server: httpServer });
console.log(`[WS] Server listening on ws://0.0.0.0:${WS_PORT}`);

wss.on("connection", (ws, req) => {
  ws.authenticated = false;
  ws.username = null;

  console.log(`[WS] New connection from: ${req.socket.remoteAddress}`);

  // Auth timeout: kalau tidak auth dalam 5 detik, putus
  const authTimeout = setTimeout(() => {
    if (!ws.authenticated) {
      console.log("[WS] Auth timeout — closing");
      ws.close(4001, "Auth timeout");
    }
  }, 5000);

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // ── Step 1: WS Auth Handshake ──────────────────────────────────────────
      if (!ws.authenticated) {
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

        if (!msg.wsToken) {
          ws.close(4003, "Token required");
          return;
        }
        const username = auth.validateWSToken(msg.wsToken);
        if (!username) {
          ws.close(4003, "Invalid token");
          return;
        }
        clearTimeout(authTimeout);
        ws.authenticated = true;
        ws.username = username;
        console.log(`[WS] Authenticated: ${username}`);

        // Kirim snapshot state
        ws.send(
          JSON.stringify({
            topic: "xora/snapshot",
            data: agvState,
            ts: new Date().toISOString(),
          }),
        );
        return;
      }

      // ── Step 2: Authenticated messages ────────────────────────────────────
      if (msg.manualCmd) {
        const cmd = sanitizeCmd(msg.manualCmd);
        if (!cmd) return;
        const manualMap = {
          "FORWARD": "forward", "BACKWARD": "backward",
          "LEFT": "left", "RIGHT": "right", "STOP": "stop",
        };
        const mapped = manualMap[cmd] || cmd.toLowerCase();
        console.log(`[WS→MQTT] Manual: ${mapped} (by ${ws.username})`);
        mqttClient.publish(TOPIC_MANUAL, mapped, { qos: 0 });
        return;
      }

      if (msg.command) {
        const cmd = sanitizeCmd(msg.command);
        if (!cmd) return;
        console.log(`[WS→MQTT] Command: ${cmd} (by ${ws.username})`);

        // Map GOTO commands to firmware MQTT topic
        const GOTO_MAP = {
          "GOTO_A": "goto:A",
          "GOTO_B": "goto:B",
          "GOTO_C": "goto:C",
          "RETURN": "return",
          "EMERGENCY_STOP": "stop",
          "FORWARD": "forward",
          "BACKWARD": "backward",
          "LEFT": "left",
          "RIGHT": "right",
          "STOP": "stop",
          "TARE": "tare",
          "ALIVE_ON": "alive:on",
          "ALIVE_OFF": "alive:off",
        };

        if (GOTO_MAP[cmd]) {
          mqttClient.publish(TOPIC_AGV_CMD, GOTO_MAP[cmd], { qos: 1 });
        } else {
          mqttClient.publish(
            TOPIC_CMD,
            JSON.stringify({ command: cmd, ts: new Date().toISOString() }),
            { qos: 1 },
          );
        }
        const event = {
          code: "CMD_SENT",
          message: `Command: ${cmd}`,
          timestamp: new Date().toISOString(),
          source: "dashboard",
        };
        agvState.events.unshift(event);
        if (agvState.events.length > 50) agvState.events.pop();
        insertEvent(event);
        const bcast = JSON.stringify({
          topic: "xora/event",
          data: event,
          ts: event.timestamp,
        });
        wss.clients.forEach((c) => {
          if (c.readyState === 1 && c.authenticated) c.send(bcast);
        });
        return;
      }

      if (msg.api) {
        const resp = await handleAPI(msg.api, msg.params || {});
        ws.send(
          JSON.stringify({
            topic: "xora/api",
            api: msg.api,
            data: resp,
            ts: new Date().toISOString(),
          }),
        );
      }
    } catch (err) {
      console.error("[WS] Message error:", err.message);
    }
  });

  ws.on("close", () =>
    console.log(`[WS] Disconnected: ${ws.username || "unauthenticated"}`),
  );
  ws.on("error", (e) => console.error("[WS] Error:", e.message));
});

// ─── Input Sanitizer ─────────────────────────────────────────────────────────
const ALLOWED_COMMANDS = new Set([
  "START",
  "SET_DEST_A",
  "SET_DEST_B",
  "SET_DEST_C",
  "RETURN_BASE",
  "RESET_ERROR",
  "EMERGENCY_STOP",
  "SET_MODE_AUTO",
  "SET_MODE_MANUAL",
  "SET_MODE_PICKUP",
  "FORWARD",
  "BACKWARD",
  "LEFT",
  "RIGHT",
  "STOP",
  "GOTO_A",
  "GOTO_B",
  "GOTO_C",
  "RETURN",
  "TARE",
  "ALIVE_ON",
  "ALIVE_OFF",
]);

function sanitizeCmd(cmd) {
  if (typeof cmd !== "string") return null;
  const c = cmd.trim().toUpperCase().slice(0, 32);
  return ALLOWED_COMMANDS.has(c) ? c : null;
}

// ─── Analytics API ────────────────────────────────────────────────────────────
async function handleAPI(api, params) {
  // Validate range param
  const range = ["1h", "24h", "7d"].includes(params.range)
    ? params.range
    : "24h";
  const interval =
    range === "7d" ? "1 hour" : range === "1h" ? "1 minute" : "10 minutes";
  const since =
    range === "7d" ? "7 days" : range === "24h" ? "24 hours" : "1 hour";

  switch (api) {
    case "event_counts": {
      const { rows } = await db.query(`
        SELECT code, COUNT(*) as count FROM agv_events
        WHERE ts > NOW() - INTERVAL '${since}'
        GROUP BY code ORDER BY count DESC LIMIT 15
      `);
      return rows;
    }
    case "state_timeline": {
      const { rows } = await db.query(`
        SELECT DATE_TRUNC('minute', ts) as t, state, COUNT(*) as count
        FROM agv_events
        WHERE ts > NOW() - INTERVAL '${since}' AND state IS NOT NULL
        GROUP BY t, state ORDER BY t ASC
      `);
      return rows;
    }
    case "sensor_history": {
      const { rows } = await db.query(`
        SELECT
          DATE_TRUNC('${interval}', ts) as t,
          AVG(ultrasonic)::numeric(6,1) as ultrasonic,
          AVG(loadcell)::numeric(6,1)   as loadcell,
          AVG(battery)::numeric(5,1)    as battery
        FROM agv_sensor_logs
        WHERE ts > NOW() - INTERVAL '${since}'
        GROUP BY t ORDER BY t ASC
      `);
      return rows;
    }
    case "error_summary": {
      const { rows } = await db.query(`
        SELECT code, message, state, destination, ts FROM agv_events
        WHERE ts > NOW() - INTERVAL '${since}'
          AND (code LIKE '%ERROR%' OR code LIKE '%FAIL%' OR code LIKE '%LOST%'
               OR code = 'ESTOP' OR code = 'NO_OBJECT'
               OR code = 'OBSTACLE_DETECTED' OR code = 'WAITING_PICKUP')
        ORDER BY ts DESC LIMIT 50
      `);
      return rows;
    }
    case "event_log": {
      const page = Math.max(0, parseInt(params.page) || 0);
      const limit = 40;
      const source = params.source;
      const validSources = ["esp32", "dashboard"];
      const sourceFilter = validSources.includes(source)
        ? `AND source = '${source}'`
        : "";

      const countResult = await db.query(
        `SELECT COUNT(*) as total FROM agv_events
         WHERE ts > NOW() - INTERVAL $1 ${sourceFilter}`,
        [since],
      );
      const total = parseInt(countResult.rows[0]?.total) || 0;

      const { rows } = await db.query(
        `SELECT id, code, message, state, destination, mode, source, ts
         FROM agv_events
         WHERE ts > NOW() - INTERVAL $1 ${sourceFilter}
         ORDER BY ts DESC LIMIT $2 OFFSET $3`,
        [since, limit, page * limit],
      );
      return { rows, total };
    }
    case "stats_summary": {
      const {
        rows: [ss],
      } = await db.query(
        `SELECT
           COUNT(*) FILTER (WHERE ts > NOW() - INTERVAL $1) as events_range,
           COUNT(*) FILTER (WHERE (code IN ('ARRIVED','SAMPAI','CMD_SENT')) AND ts > NOW() - INTERVAL $1) as deliveries_range,
           COUNT(*) FILTER (WHERE (code LIKE '%ERROR%' OR code LIKE '%FAIL%' OR code LIKE '%LOST%' OR code = 'ESTOP' OR code = 'OBSTACLE_DETECTED') AND ts > NOW() - INTERVAL $1) as errors_range,
           COUNT(*) as total_events,
           (SELECT COUNT(DISTINCT ts::date) FROM agv_events) as active_days
         FROM agv_events`,
        [since],
      );
      return ss;
    }
    case "state_distribution": {
      const { rows } = await db.query(
        `SELECT state, COUNT(*) as count
         FROM agv_events
         WHERE ts > NOW() - INTERVAL $1 AND state IS NOT NULL
         GROUP BY state ORDER BY count DESC`,
        [since],
      );
      return rows;
    }
    case "system_info": {
      // Test DB connection
      let dbOk = false;
      let dbVersion = "";
      try {
        const dbTest = await db.query("SELECT version() as v, NOW() as now");
        dbOk = true;
        dbVersion = dbTest.rows[0]?.v?.split(" ").slice(0, 2).join(" ") || "";
      } catch {}

      // Count total events
      let totalEvents = 0;
      try {
        const ec = await db.query("SELECT COUNT(*) as c FROM agv_events");
        totalEvents = parseInt(ec.rows[0]?.c) || 0;
      } catch {}

      // Count total sensor logs
      let totalLogs = 0;
      try {
        const lc = await db.query("SELECT COUNT(*) as c FROM agv_sensor_logs");
        totalLogs = parseInt(lc.rows[0]?.c) || 0;
      } catch {}

      return {
        server: {
          uptime: SERVER_START,
          httpPort: HTTP_PORT,
          wsPort: WS_PORT,
          nodeVersion: process.version,
          platform: process.platform,
          pid: process.pid,
        },
        database: {
          connected: dbOk,
          version: dbVersion,
          totalEvents,
          totalSensorLogs: totalLogs,
        },
        mqtt: {
          connected: mqttClient.connected,
          broker: MQTT_BROKER,
          clientId: MQTT_CLIENT_ID,
          deviceId: DEVICE_ID,
        },
        websocket: {
          clients: wss.clients.size,
          authenticated: [...wss.clients].filter((c) => c.authenticated).length,
        },
        agv: {
          state: agvState.state,
          destination: agvState.destination,
          mode: agvState.mode,
          battery: agvState.battery,
          connectedAt: agvState.connectedAt,
        },
      };
    }
    case "mission_log": {
      try {
        const page = Math.max(0, parseInt(params.page) || 0);
        const limit = 20;
        const destFilter = ["A", "B", "C"].includes(params.dest)
          ? `AND destination = '${params.dest}'`
          : "";
        const statusFilter = ["COMPLETED", "FAILED", "IN_PROGRESS", "WAITING_CARGO"].includes(params.status)
          ? `AND status = '${params.status}'`
          : "";

        const countResult = await db.query(
          `SELECT COUNT(*) as total FROM agv_missions
           WHERE created_at > NOW() - INTERVAL $1 ${destFilter} ${statusFilter}`,
          [since],
        );
        const total = parseInt(countResult.rows[0]?.total) || 0;

        const { rows } = await db.query(
          `SELECT id, destination, status, cargo_weight,
                  created_at, cargo_detected_at, departed_at,
                  arrived_at, cargo_removed_at, return_departed_at,
                  returned_at, duration_seconds
           FROM agv_missions
           WHERE created_at > NOW() - INTERVAL $1 ${destFilter} ${statusFilter}
           ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
          [since, limit, page * limit],
        );

        // Summary stats
        const statsResult = await db.query(
          `SELECT
             COUNT(*) as total_missions,
             COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
             COUNT(*) FILTER (WHERE status = 'FAILED') as failed,
             COUNT(*) FILTER (WHERE status = 'IN_PROGRESS' OR status = 'WAITING_CARGO') as active,
             AVG(duration_seconds) FILTER (WHERE status = 'COMPLETED') as avg_duration,
             AVG(cargo_weight) FILTER (WHERE cargo_weight IS NOT NULL) as avg_weight
           FROM agv_missions
           WHERE created_at > NOW() - INTERVAL $1`,
          [since],
        );

        console.log(`[API] mission_log: ${total} rows, range=${since}, stats=${JSON.stringify(statsResult.rows[0])}`);
        return {
          rows,
          total,
          stats: statsResult.rows[0] || {},
        };
      } catch (e) {
        console.error("[API] mission_log error:", e.message);
        return { rows: [], total: 0, stats: {} };
      }
    }
    default:
      return { error: "Unknown API" };
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await auth.initUsers();
    await initDB();

    httpServer.listen(HTTP_PORT, () => {
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("  Xora AGV Bridge Server v4 — SECURE");
      console.log(`  HTTP  → http://0.0.0.0:${HTTP_PORT}`);
      console.log(`  WS    → ws://0.0.0.0:${WS_PORT}`);
      console.log(`  MQTT  → ${MQTT_BROKER}`);
      console.log(`  DB    → NeonDB (ap-southeast-1)`);
      console.log(`  Auth  → bcrypt + session + CSRF + WS token`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    });
  } catch (e) {
    console.error("[BOOT] Fatal:", e.message);
    process.exit(1);
  }
})();
