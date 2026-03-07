/**
 * Xora AGV — MQTT ↔ WebSocket Bridge Server v3
 * + NeonDB integration (log + analytics)
 */

const mqtt = require("mqtt");
const { WebSocketServer } = require("ws");
const { Pool } = require("pg");

// ─── NeonDB ───────────────────────────────────────────────────────────────────
const db = new Pool({
  connectionString:
    "postgresql://neondb_owner:npg_pLdZV7rq8ImD@ep-restless-mouse-a1f7dtbs-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  max: 5,
});

async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS agv_events (
      id         SERIAL PRIMARY KEY,
      code       TEXT,
      message    TEXT,
      state      TEXT,
      destination TEXT,
      mode       TEXT,
      source     TEXT DEFAULT 'esp32',
      ts         TIMESTAMPTZ DEFAULT NOW()
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
    console.error("[DB] insertEvent error:", e.message);
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
    console.error("[DB] insertSensorLog error:", e.message);
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────
const CONFIG = {
  mqtt: {
    broker: "mqtt://broker.hivemq.com:1883",
    clientId: `xora-bridge-${Math.random().toString(16).slice(2, 8)}`,
    keepalive: 60,
    reconnectPeriod: 3000,
  },
  ws: { port: 3001 },
  topics: {
    subscribe: [
      "xora/state",
      "xora/destination",
      "xora/sensor/ir",
      "xora/sensor/ultrasonic",
      "xora/sensor/loadcell",
      "xora/event",
      "xora/mode",
      "xora/battery",
    ],
    command: "xora/command",
    manualCmd: "agv/xora/cmd",
  },
};

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

// Sensor log interval: every 10s
let sensorLogTimer = null;

// ─── MQTT ─────────────────────────────────────────────────────────────────────
console.log(`[MQTT] Connecting to ${CONFIG.mqtt.broker}...`);

const mqttClient = mqtt.connect(CONFIG.mqtt.broker, {
  clientId: CONFIG.mqtt.clientId,
  keepalive: CONFIG.mqtt.keepalive,
  reconnectPeriod: CONFIG.mqtt.reconnectPeriod,
  clean: true,
});

mqttClient.on("connect", () => {
  console.log(`[MQTT] Connected → ${CONFIG.mqtt.broker}`);
  CONFIG.topics.subscribe.forEach((topic) => {
    mqttClient.subscribe(topic, { qos: 1 }, (err) => {
      if (err) console.error(`[MQTT] Subscribe error ${topic}:`, err);
      else console.log(`[MQTT] Subscribed → ${topic}`);
    });
  });
  // Start sensor logging
  sensorLogTimer = setInterval(insertSensorLog, 10000);
});

mqttClient.on("reconnect", () => console.log("[MQTT] Reconnecting..."));
mqttClient.on("error", (err) => console.error("[MQTT] Error:", err.message));
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
    case "xora/event":
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
      insertEvent(event); // → NeonDB
      break;
  }

  const wsMsg = JSON.stringify({ topic, data, ts: new Date().toISOString() });
  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(wsMsg);
  });
  console.log(`[MQTT→WS] ${topic}: ${raw.slice(0, 80)}`);
});

// ─── WebSocket ────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: CONFIG.ws.port });
console.log(`[WS] Server listening on ws://localhost:${CONFIG.ws.port}`);

wss.on("connection", (ws, req) => {
  console.log(`[WS] Client connected: ${req.socket.remoteAddress}`);
  ws.send(
    JSON.stringify({
      topic: "xora/snapshot",
      data: agvState,
      ts: new Date().toISOString(),
    }),
  );

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // Manual motor command
      if (msg.manualCmd) {
        console.log(`[WS→MQTT] Manual: ${msg.manualCmd}`);
        mqttClient.publish(CONFIG.topics.manualCmd, msg.manualCmd, { qos: 0 });
        return;
      }

      // State machine command
      if (msg.command) {
        console.log(`[WS→MQTT] Command: ${msg.command}`);
        mqttClient.publish(
          CONFIG.topics.command,
          JSON.stringify({
            command: msg.command,
            ts: new Date().toISOString(),
          }),
          { qos: 1 },
        );
        const event = {
          code: "CMD_SENT",
          message: `Command: ${msg.command}`,
          timestamp: new Date().toISOString(),
          source: "dashboard",
        };
        agvState.events.unshift(event);
        if (agvState.events.length > 50) agvState.events.pop();
        insertEvent(event); // → NeonDB
        const broadcast = JSON.stringify({
          topic: "xora/event",
          data: event,
          ts: event.timestamp,
        });
        wss.clients.forEach((c) => {
          if (c.readyState === 1) c.send(broadcast);
        });
      }

      // Analytics API requests
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
      console.error("[WS] Error:", err.message);
    }
  });

  ws.on("close", () => console.log("[WS] Client disconnected"));
  ws.on("error", (err) => console.error("[WS] Error:", err.message));
});

// ─── Analytics API ────────────────────────────────────────────────────────────
async function handleAPI(api, params) {
  const range = params.range || "24h";
  const interval =
    range === "7d" ? "1 hour" : range === "1h" ? "1 minute" : "10 minutes";
  const since =
    range === "7d" ? "7 days" : range === "24h" ? "24 hours" : "1 hour";

  switch (api) {
    case "event_counts":
      // Count per event code in range
      const { rows: ec } = await db.query(`
        SELECT code, COUNT(*) as count
        FROM agv_events
        WHERE ts > NOW() - INTERVAL '${since}'
        GROUP BY code ORDER BY count DESC LIMIT 15
      `);
      return ec;

    case "state_timeline":
      // State changes over time
      const { rows: st } = await db.query(`
        SELECT DATE_TRUNC('minute', ts) as t, state, COUNT(*) as count
        FROM agv_events
        WHERE ts > NOW() - INTERVAL '${since}' AND state IS NOT NULL
        GROUP BY t, state ORDER BY t ASC
      `);
      return st;

    case "sensor_history":
      // Sensor data over time (averaged per interval)
      const { rows: sh } = await db.query(`
        SELECT
          DATE_TRUNC('${interval}', ts) as t,
          AVG(ultrasonic)::numeric(6,1) as ultrasonic,
          AVG(loadcell)::numeric(6,1)   as loadcell,
          AVG(battery)::numeric(5,1)    as battery
        FROM agv_sensor_logs
        WHERE ts > NOW() - INTERVAL '${since}'
        GROUP BY t ORDER BY t ASC
      `);
      return sh;

    case "error_summary":
      // Error events only
      const { rows: es } = await db.query(`
        SELECT code, message, state, destination, ts
        FROM agv_events
        WHERE ts > NOW() - INTERVAL '${since}'
          AND (code LIKE '%ERROR%' OR code LIKE '%FAIL%' OR code LIKE '%LOST%'
               OR code = 'ESTOP' OR code = 'NO_OBJECT' OR code = 'OBSTACLE_DETECTED'
               OR code = 'WAITING_PICKUP')
        ORDER BY ts DESC LIMIT 50
      `);
      return es;

    case "event_log":
      // Full event log paginated
      const page = parseInt(params.page) || 0;
      const limit = 40;
      const { rows: el } = await db.query(
        `
        SELECT id, code, message, state, destination, mode, source, ts
        FROM agv_events
        ORDER BY ts DESC
        LIMIT $1 OFFSET $2
      `,
        [limit, page * limit],
      );
      return el;

    case "stats_summary":
      // Quick summary numbers
      const {
        rows: [ss],
      } = await db.query(`
        SELECT
          COUNT(*) FILTER (WHERE ts > NOW() - INTERVAL '24 hours') as events_24h,
          COUNT(*) FILTER (WHERE code='ARRIVED' AND ts > NOW() - INTERVAL '24 hours') as deliveries_24h,
          COUNT(*) FILTER (WHERE code='ERROR_STATE' OR code='ESTOP' OR code='OBSTACLE_DETECTED' AND ts > NOW() - INTERVAL '24 hours') as errors_24h,
          COUNT(*) as total_events
        FROM agv_events
      `);
      return ss;

    default:
      return { error: "Unknown API: " + api };
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
initDB()
  .then(() => {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  Xora AGV Bridge Server v3");
    console.log(`  MQTT  → ${CONFIG.mqtt.broker}`);
    console.log(`  WS    → ws://localhost:${CONFIG.ws.port}`);
    console.log(`  DB    → NeonDB (ap-southeast-1)`);
    console.log(`  Motor → ${CONFIG.topics.manualCmd}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  })
  .catch((e) => {
    console.error("[DB] Init failed:", e.message);
    console.log("[DB] Continuing without DB...");
  });
