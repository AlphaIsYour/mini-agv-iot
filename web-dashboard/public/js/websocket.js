/* ══════════════════════════════════════════════════════════════════════════════
   WEBSOCKET.JS — WS connect, auth handshake, message router
══════════════════════════════════════════════════════════════════════════════ */

const WS_HOST = window.location.hostname;
const WS_PORT = window.location.port; // ikut port HTTP
const WS_URL = `ws://${WS_HOST}:${WS_PORT}/ws`;

let ws = null;
let reconnectT = null;
let pingInterval = null;
let wsConnectedAt = null;

/* ══════════════════════════════════════════════════════════════════════════════
   CONNECT
══════════════════════════════════════════════════════════════════════════════ */
window.connectWS = async function () {
  if (reconnectT) {
    clearTimeout(reconnectT);
    reconnectT = null;
  }

  // Get one-time WS token
  let wsToken;
  try {
    const csrf = await fetchCSRF();
    const r = await fetch("/api/ws-token", {
      headers: { "X-CSRF-Token": csrf },
    });
    if (!r.ok) throw new Error("Token fetch failed");
    wsToken = (await r.json()).token;
  } catch (e) {
    console.warn("[WS] Token fetch failed, retry in 4s", e.message);
    setWSStatus(false);
    reconnectT = setTimeout(connectWS, 4000);
    return;
  }

  ws = new WebSocket(WS_URL);

  ws.addEventListener("open", () => {
    // Send auth token immediately
    ws.send(JSON.stringify({ wsToken }));
    wsConnectedAt = Date.now();
    setWSStatus(true);

    // Hide connect overlay
    const overlay = document.getElementById("overlay");
    if (overlay) overlay.classList.add("hidden");

    // Start ping for latency measurement
    startPing();

    toast("Connected", "WebSocket bridge online", "success", 2500);
    console.log("[WS] Connected");
  });

  ws.addEventListener("close", () => {
    setWSStatus(false);
    stopPing();

    const overlay = document.getElementById("overlay");
    if (overlay) overlay.classList.remove("hidden");

    const ovSub = document.getElementById("ov-sub");
    if (ovSub) ovSub.textContent = "Reconnecting in 3.5s...";

    console.warn("[WS] Disconnected, reconnecting...");
    reconnectT = setTimeout(connectWS, 3500);
  });

  ws.addEventListener("error", () => {
    // error event always followed by close, handled there
  });

  ws.addEventListener("message", (e) => {
    try {
      handleMessage(JSON.parse(e.data));
    } catch (err) {
      console.warn("[WS] Bad message", err);
    }
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   SEND HELPERS
   wsSend  — dipanggil dari controls.js dengan { type, command }
   sendCmd / sendManual TIDAK didefinisikan di sini karena controls.js
   yang mendefinisikan keduanya (di-load terakhir, jadi berlaku).
══════════════════════════════════════════════════════════════════════════════ */

/**
 * window.wsSend — entry point tunggal dari controls.js
 * Format dari controls.js:
 *   { type: "command", command: "START" }   → kirim { command }
 *   { type: "manual",  command: "FORWARD" } → kirim { manualCmd }
 */
window.wsSend = function (payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    if (typeof toast === "function") {
      toast("Not Connected", "WebSocket not ready", "warning", 2000);
    }
    console.warn("[WS] wsSend called but WS not open:", payload);
    return;
  }

  let msg;
  if (payload.type === "manual") {
    msg = { manualCmd: payload.command };
  } else {
    // type === "command" atau format lain
    msg = { command: payload.command };
  }

  ws.send(JSON.stringify(msg));
  console.log("[WS] Sent:", msg);
};

window.requestAPI = function (api, params = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ api, params }));
};

/* ══════════════════════════════════════════════════════════════════════════════
   PING / LATENCY
══════════════════════════════════════════════════════════════════════════════ */
let lastPingSent = 0;

function startPing() {
  stopPing();
  pingInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      lastPingSent = Date.now();
      ws.send(JSON.stringify({ ping: lastPingSent }));
    }
  }, 10000);
}

function stopPing() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

function handlePong(ts) {
  if (!ts) return;
  const latency = Date.now() - ts;
  const el = document.getElementById("sys-latency");
  if (el) {
    el.textContent = latency + "ms";
    el.className =
      "sys-val " + (latency < 100 ? "ok" : latency < 300 ? "warn" : "err");
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   MESSAGE ROUTER
══════════════════════════════════════════════════════════════════════════════ */
function handleMessage({ topic, data, pong }) {
  // Pong response
  if (pong !== undefined) {
    handlePong(pong);
    return;
  }

  switch (topic) {
    case "xora/snapshot":
      applySnapshot(data);
      break;
    case "xora/state":
      applyState(data);
      break;
    case "xora/destination":
      applyDest(data);
      break;
    case "xora/mode":
      applyMode(data);
      break;
    case "xora/battery":
      applyBat(data);
      break;
    case "xora/sensor/ir":
      applyIR(data);
      break;
    case "xora/sensor/ultrasonic":
      applyUS(data);
      break;
    case "xora/sensor/loadcell":
      applyLC(data);
      break;
    case "xora/event":
      applyEvent(data);
      break;
    case "xora/api":
      handleAPIResponse(data?.api || "", data?.data);
      break;

    // ── AGV Firmware direct topics ────────────────────────────────────────
    case "agv/agv-01/state":
    case "agv/agv-01/telemetry":
      if (typeof data === "object") {
        if (data.state) applyState(data.state);
        if (data.mission != null) {
          const dest = data.mission === 0 ? "BASE" : String.fromCharCode(64 + data.mission);
          applyDest(dest);
        }
        if (data.blackbox_count != null) applyBlackbox(data.blackbox_count);
        if (data.waiting != null) applyWaiting(data.waiting);
        if (data.distance_cm != null) applyUS(data.distance_cm);
        if (data.line_left != null) {
          applyIR({
            s1: data.ir_left || 0,
            s2: data.line_left || 0,
            s3: data.line_middle || 0,
            s4: data.line_right || 0,
            s5: data.ir_right || 0,
          });
        }
      }
      setMQTTStatus(true);
      break;
    case "agv/agv-01/status":
      if (typeof data === "object" && data.online != null) {
        setMQTTStatus(data.online);
      }
      break;

    default:
      break;
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   STATUS HELPERS
══════════════════════════════════════════════════════════════════════════════ */
function setWSStatus(online) {
  const pill = document.getElementById("hws");
  const txt = document.getElementById("hws-txt");
  const sys = document.getElementById("sys-ws");

  if (pill) pill.className = "h-pill " + (online ? "on" : "err");
  if (txt) txt.textContent = "WS: " + (online ? "ONLINE" : "OFFLINE");
  if (sys) {
    sys.textContent = online ? "Connected" : "Disconnected";
    sys.className = "sys-val " + (online ? "ok" : "err");
  }
}

window.setMQTTStatus = function (online) {
  const pill = document.getElementById("hmqtt");
  const txt = document.getElementById("hmqtt-txt");
  const sys = document.getElementById("sys-mqtt");

  if (pill) pill.className = "h-pill " + (online ? "on" : "err");
  if (txt) txt.textContent = "MQTT: " + (online ? "Connected" : "Offline");
  if (sys) {
    sys.textContent = online ? "Connected" : "Offline";
    sys.className = "sys-val " + (online ? "ok" : "err");
  }
};
