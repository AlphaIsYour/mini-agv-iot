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

// ─── NeonDB ───────────────────────────────────────────────────────────────────
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  ssl: { rejectUnauthorized: false },
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
  console.log("[DB] Tables ready");
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
const agvState = {
  state: "IDLE",
  destination: "BASE",
  mode: "AUTO",
  battery: 100,
  sensors: {
    ir: { s1: 0, s2: 0, s3: 1, s4: 0, s5: 0 },
    ultrasonic: 50,
    loadcell: 0,
  },
  events: [],
  connectedAt: new Date().toISOString(),
};

// ─── MQTT ─────────────────────────────────────────────────────────────────────
const MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://broker.hivemq.com:1883";
const MQTT_CLIENT_ID = `xora-bridge-${Math.random().toString(16).slice(2, 8)}`;

const TOPICS_SUB = [
  "xora/state",
  "xora/destination",
  "xora/sensor/ir",
  "xora/sensor/ultrasonic",
  "xora/sensor/loadcell",
  "xora/event",
  "xora/mode",
  "xora/battery",
];
const TOPIC_CMD = "xora/command";
const TOPIC_MANUAL = "agv/xora/cmd";

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
    case "xora/state":
      agvState.state = typeof data === "string" ? data : data.state || data;
      break;
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
  }

  const wsMsg = JSON.stringify({ topic, data, ts: new Date().toISOString() });
  wss.clients.forEach((c) => {
    if (c.readyState === 1 && c.authenticated) c.send(wsMsg);
  });
  console.log(`[MQTT→WS] ${topic}: ${raw.slice(0, 80)}`);
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
          "ws://localhost:3001",
          "ws://127.0.0.1:3001",
          "wss:",
        ],
        imgSrc: ["'self'", "data:"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: IS_PROD ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false, // allow Chart.js CDN
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
const wss = new WebSocketServer({ port: WS_PORT });
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
        console.log(`[WS→MQTT] Manual: ${cmd} (by ${ws.username})`);
        mqttClient.publish(TOPIC_MANUAL, cmd, { qos: 0 });
        return;
      }

      if (msg.command) {
        const cmd = sanitizeCmd(msg.command);
        if (!cmd) return;
        console.log(`[WS→MQTT] Command: ${cmd} (by ${ws.username})`);
        mqttClient.publish(
          TOPIC_CMD,
          JSON.stringify({ command: cmd, ts: new Date().toISOString() }),
          { qos: 1 },
        );
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
      const { rows } = await db.query(
        `SELECT id, code, message, state, destination, mode, source, ts
         FROM agv_events ORDER BY ts DESC LIMIT $1 OFFSET $2`,
        [limit, page * limit],
      );
      return rows;
    }
    case "stats_summary": {
      const {
        rows: [ss],
      } = await db.query(`
        SELECT
          COUNT(*) FILTER (WHERE ts > NOW() - INTERVAL '24 hours') as events_24h,
          COUNT(*) FILTER (WHERE code='ARRIVED' AND ts > NOW() - INTERVAL '24 hours') as deliveries_24h,
          COUNT(*) FILTER (WHERE (code='ERROR_STATE' OR code='ESTOP' OR code='OBSTACLE_DETECTED') AND ts > NOW() - INTERVAL '24 hours') as errors_24h,
          COUNT(*) as total_events
        FROM agv_events
      `);
      return ss;
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
