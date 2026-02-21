/**
 * Xora AGV — MQTT ↔ WebSocket Bridge Server
 *
 * Flow:
 *   ESP32 (Wokwi) → HiveMQ Cloud → [this server] → WebSocket → Dashboard
 *   Dashboard      → WebSocket    → [this server] → HiveMQ Cloud → ESP32
 */

const mqtt = require("mqtt");
const { WebSocketServer } = require("ws");

// ─── Config ──────────────────────────────────────────────────────────────────

const CONFIG = {
  mqtt: {
    broker: "mqtt://broker.hivemq.com:1883",
    clientId: `xora-bridge-${Math.random().toString(16).slice(2, 8)}`,
    keepalive: 60,
    reconnectPeriod: 3000,
  },
  ws: {
    port: 3001,
  },
  topics: {
    // ESP32 → Dashboard (subscribe)
    subscribe: [
      "xora/state", // FSM state: IDLE | FOLLOW_LINE | DECISION | ARRIVED | LOAD_UNLOAD | RETURN_BASE | MANUAL | ERROR
      "xora/destination", // Current destination: BASE | A | B | C
      "xora/sensor/ir", // IR sensor array: JSON {s1,s2,s3,s4,s5} (0=putih,1=hitam)
      "xora/sensor/ultrasonic", // Distance cm: number
      "xora/sensor/loadcell", // Weight grams: number
      "xora/event", // Event log: JSON {code, message, timestamp}
      "xora/mode", // Mode: AUTO | MANUAL | VOICE | PICKUP
      "xora/battery", // Battery %: number
    ],
    // Dashboard → ESP32 (publish)
    command: "xora/command", // Commands: SET_DEST_A | SET_DEST_B | SET_DEST_C | SET_MODE_AUTO | SET_MODE_MANUAL | EMERGENCY_STOP | RETURN_BASE
  },
};

// ─── State Snapshot (for new dashboard connections) ──────────────────────────

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
  events: [], // last 50 events
  connectedAt: new Date().toISOString(),
};

// ─── MQTT Client ─────────────────────────────────────────────────────────────

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
      if (err) console.error(`[MQTT] Subscribe error on ${topic}:`, err);
      else console.log(`[MQTT] Subscribed → ${topic}`);
    });
  });
});

mqttClient.on("reconnect", () => console.log("[MQTT] Reconnecting..."));
mqttClient.on("error", (err) => console.error("[MQTT] Error:", err.message));
mqttClient.on("offline", () => console.log("[MQTT] Offline"));

mqttClient.on("message", (topic, payload) => {
  const raw = payload.toString();
  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  // Update local state snapshot
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
      break;
  }

  // Forward to all WebSocket clients
  const wsMessage = JSON.stringify({
    topic,
    data,
    ts: new Date().toISOString(),
  });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(wsMessage);
  });

  console.log(`[MQTT→WS] ${topic}: ${raw.slice(0, 80)}`);
});

// ─── WebSocket Server ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: CONFIG.ws.port });
console.log(`[WS] Server listening on ws://localhost:${CONFIG.ws.port}`);

wss.on("connection", (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[WS] Client connected: ${clientIp}`);

  // Send full state snapshot to new client
  ws.send(
    JSON.stringify({
      topic: "xora/snapshot",
      data: agvState,
      ts: new Date().toISOString(),
    }),
  );

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      // msg = { command: "SET_DEST_A" } or { command: "SET_MODE_MANUAL" } etc.
      if (msg.command) {
        console.log(`[WS→MQTT] Command received: ${msg.command}`);
        mqttClient.publish(
          CONFIG.topics.command,
          JSON.stringify({
            command: msg.command,
            ts: new Date().toISOString(),
          }),
          { qos: 1 },
        );
        // Echo back as event
        const event = {
          code: "CMD_SENT",
          message: `Command sent: ${msg.command}`,
          timestamp: new Date().toISOString(),
          source: "dashboard",
        };
        agvState.events.unshift(event);
        if (agvState.events.length > 50) agvState.events.pop();
        // Broadcast to all clients
        const broadcast = JSON.stringify({
          topic: "xora/event",
          data: event,
          ts: event.timestamp,
        });
        wss.clients.forEach((c) => {
          if (c.readyState === 1) c.send(broadcast);
        });
      }
    } catch (err) {
      console.error("[WS] Invalid message:", err.message);
    }
  });

  ws.on("close", () => console.log(`[WS] Client disconnected: ${clientIp}`));
  ws.on("error", (err) => console.error(`[WS] Client error:`, err.message));
});

// ─── Mock Data Injector (for testing without ESP32) ──────────────────────────
// Uncomment the block below to simulate AGV data in dev mode

/*
const STATES = ["IDLE","FOLLOW_LINE","DECISION_AT_INTERSECTION","ARRIVED_AT_DESTINATION","RETURN_TO_BASE","ERROR_STATE"];
const DESTS  = ["BASE","A","B","C"];
let mockIdx = 0;

setInterval(() => {
  const state = STATES[mockIdx % STATES.length];
  const dest  = DESTS[Math.floor(mockIdx / 2) % DESTS.length];
  mqttClient.publish("xora/state",           state,                           { qos: 0 });
  mqttClient.publish("xora/destination",     dest,                            { qos: 0 });
  mqttClient.publish("xora/sensor/ultrasonic", String(10 + Math.floor(Math.random() * 80)), { qos: 0 });
  mqttClient.publish("xora/sensor/loadcell",   String(Math.floor(Math.random() * 500)),     { qos: 0 });
  mqttClient.publish("xora/sensor/ir",         JSON.stringify({s1:0,s2:0,s3:1,s4:0,s5:0}), { qos: 0 });
  mqttClient.publish("xora/battery",           String(90 - mockIdx),                        { qos: 0 });
  if (state === "ERROR_STATE") {
    const codes = ["NO_OBJECT","LINE_LOST","OBSTACLE_DETECTED","WAITING_PICKUP","INVALID_DEST"];
    mqttClient.publish("xora/event", JSON.stringify({
      code: codes[mockIdx % codes.length],
      message: `Simulated error: ${codes[mockIdx % codes.length]}`,
      timestamp: new Date().toISOString()
    }), { qos: 0 });
  }
  mockIdx++;
}, 2500);
*/

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  Xora AGV Bridge Server");
console.log(`  MQTT  → ${CONFIG.mqtt.broker}`);
console.log(`  WS    → ws://localhost:${CONFIG.ws.port}`);
console.log("  TIP   → Uncomment mock injector for testing");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
