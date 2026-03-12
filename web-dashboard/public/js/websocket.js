/* ══════════════════════════════════════════════════════════════════════════════
   WEBSOCKET.JS — WS connect, auth handshake, message router
══════════════════════════════════════════════════════════════════════════════ */

const WS_HOST = window.location.hostname;
const WS_URL = `ws://${WS_HOST}:3001`;

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
══════════════════════════════════════════════════════════════════════════════ */
window.sendCmd = function (cmd) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    toast("Not Connected", "WebSocket not ready", "warning", 2000);
    return;
  }
  ws.send(JSON.stringify({ command: cmd }));
};

window.sendManual = function (cmd) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ manualCmd: cmd }));
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
