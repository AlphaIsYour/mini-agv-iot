/* ══════════════════════════════════════════════════════════════════════════════
   CONTROLS.JS — D-Pad, Keyboard, Arena AGV Animation
   Arena: Track lurus BASE → A → B → C
══════════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════════
   ARENA — Node positions & track routes
   Koordinat sesuai SVG viewBox="0 0 120 360":
   BASE : (70, 332)
   A    : (70, 248)
   B    : (70, 150)
   C    : (70, 28)
══════════════════════════════════════════════════════════════════════════════ */
const NODE_POS = {
  BASE: { x: 70, y: 332 },
  A: { x: 70, y: 248 },
  B: { x: 70, y: 150 },
  C: { x: 70, y: 28 },
};

const RETURN_LEFT = {
  TOP: { x: 24, y: 62 },
  A_JOIN: { x: 24, y: 286 },
  BASE_LEFT: { x: 34, y: 332 },
};

// Rute pergi: BASE → tujuan
const ROUTE_TO_A = [
  NODE_POS.BASE,
  NODE_POS.A,
];
const ROUTE_TO_B = [
  NODE_POS.BASE,
  NODE_POS.A,
  NODE_POS.B,
];
const ROUTE_TO_C = [
  NODE_POS.BASE,
  NODE_POS.A,
  NODE_POS.B,
  NODE_POS.C,
];

// Rute pulang: tujuan → BASE
const ROUTE_FROM_A = [
  NODE_POS.A,
  { x: 52, y: 250 },
  { x: 34, y: 262 },
  RETURN_LEFT.A_JOIN,
  RETURN_LEFT.BASE_LEFT,
  NODE_POS.BASE,
];
const ROUTE_FROM_B = [
  NODE_POS.B,
  NODE_POS.A,
  { x: 52, y: 250 },
  { x: 34, y: 262 },
  RETURN_LEFT.A_JOIN,
  RETURN_LEFT.BASE_LEFT,
  NODE_POS.BASE,
];
const ROUTE_FROM_C = [
  NODE_POS.C,
  RETURN_LEFT.TOP,
  RETURN_LEFT.A_JOIN,
  RETURN_LEFT.BASE_LEFT,
  NODE_POS.BASE,
];

/* ── Animation state ─────────────────────────────────────────────────────── */
let agvPos = { ...NODE_POS.BASE };
let animFrame = null;
let currentWaypoints = null;
let animStartTime = null;
let animDuration = 1000;
let currentRouteKey = "";
let currentVisualState = "";

window.currentMode = "AUTO";
window.aliveModeActive = false;

window.setControlMode = function (mode) {
  const normalized = mode === "MAN" ? "MANUAL" : mode || "AUTO";
  window.currentMode = normalized;
  document
    .querySelectorAll(".mchip")
    .forEach((chip) => chip.classList.toggle("active", chip.dataset.mode === normalized));

  const sfMode = document.getElementById("sf-mode");
  const sysMode = document.getElementById("sys-mode");
  if (sfMode) sfMode.textContent = normalized;
  if (sysMode) sysMode.textContent = normalized;
};

/* ══════════════════════════════════════════════════════════════════════════════
   AGV VISUAL STATE
   Dipanggil dari ui.js setiap kali state berubah
══════════════════════════════════════════════════════════════════════════════ */
window.updateAGVVisual = function (state, mission) {
  const marker = document.getElementById("agv-marker");
  const trail = document.getElementById("agv-trail");
  if (!marker) return;

  marker.setAttribute("class", "");
  const visualKey = `${state}:${mission || 0}`;

  // Moving states
  if (state === "KEBERANGKATAN" || state === "PULANG") {
    marker.classList.add("agv-moving");
    if (trail) trail.classList.add("visible");

    let route = null;
    let routeKey = "";
    if (state === "KEBERANGKATAN") {
      if (mission === 1) route = ROUTE_TO_A;
      else if (mission === 2) route = ROUTE_TO_B;
      else if (mission === 3) route = ROUTE_TO_C;
    } else if (state === "PULANG") {
      if (mission === 1) route = ROUTE_FROM_A;
      else if (mission === 2) route = ROUTE_FROM_B;
      else if (mission === 3) route = ROUTE_FROM_C;
    }

    routeKey = route ? `${visualKey}:${pointsToPath(route)}` : "";
    if (route && currentRouteKey !== routeKey) {
      animateAGVAlongTrack(route, routeKey);
    }
  } else if (state === "SAMPAI") {
    marker.classList.add("agv-arrived");
    stopAnimation();
    currentRouteKey = "";
    // Snap ke posisi tujuan
    if (mission === 1) snapAGV(NODE_POS.A);
    else if (mission === 2) snapAGV(NODE_POS.B);
    else if (mission === 3) snapAGV(NODE_POS.C);
  } else if (state === "SELESAI") {
    marker.classList.add("agv-arrived");
    stopAnimation();
    currentRouteKey = "";
    snapAGV(NODE_POS.BASE);
  } else {
    // IDLE
    stopAnimation();
    currentRouteKey = "";
    if (trail) trail.classList.remove("visible");
    snapAGV(NODE_POS.BASE);
  }

  currentVisualState = visualKey;
};

/* ── Snap AGV ke posisi tanpa animasi ────────────────────────────────────── */
function snapAGV(pos) {
  agvPos = { ...pos };
  document
    .getElementById("agv-marker")
    ?.setAttribute("transform", `translate(${pos.x},${pos.y})`);
}

window.snapAGVToNode = function (name) {
  const pos = NODE_POS[name];
  if (!pos) return;
  stopAnimation();
  currentRouteKey = "";
  currentWaypoints = null;
  snapAGV(pos);
};

/* ══════════════════════════════════════════════════════════════════════════════
   AGV ANIMATION — bergerak sepanjang waypoints
══════════════════════════════════════════════════════════════════════════════ */
window.animateAGVAlongTrack = function (waypoints, routeKey = "") {
  if (!waypoints || waypoints.length < 2) return;

  const dx0 = agvPos.x - waypoints[0].x;
  const dy0 = agvPos.y - waypoints[0].y;
  const fullPath =
    Math.sqrt(dx0 * dx0 + dy0 * dy0) > 3
      ? [{ ...agvPos }, ...waypoints]
      : waypoints;

  const trail = document.getElementById("agv-trail");
  if (trail) trail.setAttribute("d", pointsToPath(waypoints));

  animDuration = Math.max(1100, (routeLength(fullPath) / 70) * 1000);
  currentWaypoints = fullPath;
  currentRouteKey = routeKey || pointsToPath(fullPath);
  animStartTime = null;

  stopAnimation();

  function step(now) {
    if (!animStartTime) animStartTime = now;
    const t = Math.min(1, (now - animStartTime) / animDuration);
    const eased = easeInOut(t);
    const pos = posAlongRoute(currentWaypoints, eased);
    const ahead = posAlongRoute(currentWaypoints, Math.min(1, eased + 0.015));
    const angle = Math.atan2(ahead.y - pos.y, ahead.x - pos.x) * (180 / Math.PI) + 90;

    agvPos = { ...pos };
    document
      .getElementById("agv-marker")
      ?.setAttribute(
        "transform",
        `translate(${pos.x.toFixed(2)},${pos.y.toFixed(2)}) rotate(${angle.toFixed(1)})`,
      );

    if (t < 1) {
      animFrame = requestAnimationFrame(step);
    } else {
      agvPos = { ...currentWaypoints[currentWaypoints.length - 1] };
      animFrame = null;
    }
  }

  animFrame = requestAnimationFrame(step);
};

function stopAnimation() {
  if (animFrame) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }
  animStartTime = null;
}

/* ── Path helpers ─────────────────────────────────────────────────────────── */
function pointsToPath(pts) {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
}

function routeLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

function posAlongRoute(pts, t) {
  if (!pts || !pts.length) return { x: 0, y: 0 };
  if (pts.length === 1) return { ...pts[0] };

  const total = routeLength(pts);
  const target = total * t;
  let covered = 0;

  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const seg = Math.sqrt(dx * dx + dy * dy);

    if (covered + seg >= target || i === pts.length - 1) {
      const rem = target - covered;
      const frac = seg > 0 ? rem / seg : 0;
      return {
        x: pts[i - 1].x + dx * frac,
        y: pts[i - 1].y + dy * frac,
      };
    }
    covered += seg;
  }
  return { ...pts[pts.length - 1] };
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/* ══════════════════════════════════════════════════════════════════════════════
   sendCmd — kirim command ke server via WebSocket
══════════════════════════════════════════════════════════════════════════════ */
window.sendCmd = function (cmd) {
  // Block guest from sending commands
  if (window.sessionUser?.role === "guest") {
    if (typeof toast === "function") toast("Access Denied", "Guest mode — cannot control AGV", "warning", 2000);
    return;
  }
  if (typeof window.wsSend === "function") {
    if (/^(GOTO_|RETURN)/.test(cmd)) window.setControlMode("AUTO");
    window.wsSend({
      type: "command",
      command: cmd,
    });
    console.log(`[CMD] Sent: ${cmd}`);
  } else {
    console.warn("[CMD] wsSend not available — WebSocket belum siap?");
  }
};

/* ══════════════════════════════════════════════════════════════════════════════
   sendManual — kirim command manual drive
══════════════════════════════════════════════════════════════════════════════ */
window.sendManual = function (cmd) {
  // Block guest from sending commands
  if (window.sessionUser?.role === "guest") return;
  window.setControlMode("MANUAL");
  if (typeof window.wsSend === "function") {
    window.wsSend({
      type: "manual",
      command: cmd,
    });
  }
};

/* ══════════════════════════════════════════════════════════════════════════════
   TOGGLE MANUAL D-PAD
══════════════════════════════════════════════════════════════════════════════ */
window.toggleManual = function () {
  const dpad = document.getElementById("dpad");
  const txt = document.getElementById("manual-toggle-txt");
  if (!dpad) return;

  const visible = dpad.style.display !== "none";
  dpad.style.display = visible ? "none" : "flex";
  if (txt) txt.textContent = visible ? "Show D-Pad" : "Hide D-Pad";
  if (!visible) window.setControlMode("MANUAL");
};

/* ══════════════════════════════════════════════════════════════════════════════
   TOGGLE ALIVE MODE — AGV bergerak natural saat idle
   Kirim command ke firmware: alive:on / alive:off
══════════════════════════════════════════════════════════════════════════════ */
window.toggleAliveMode = function () {
  const cmd = window.aliveModeActive ? "ALIVE_OFF" : "ALIVE_ON";
  sendCmd(cmd);
};

window.updateAliveModeUI = function (active) {
  window.aliveModeActive = active;
  const btn = document.getElementById("btn-alive-mode");
  const txt = document.getElementById("alive-mode-txt");
  if (btn) {
    btn.classList.toggle("active", active);
  }
  if (txt) {
    txt.textContent = active ? "Alive: ON" : "Alive Mode";
  }
};

/* ══════════════════════════════════════════════════════════════════════════════
   D-PAD CONTROLS
══════════════════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  // ── D-pad buttons ──────────────────────────────────────────────────────────
  document.querySelectorAll(".dpad-btn").forEach((btn) => {
    const cmd = btn.dataset.cmd;
    if (!cmd) return;

    btn.addEventListener("mousedown", () => {
      btn.classList.add("pressed");
      sendManual(cmd);
    });
    btn.addEventListener("mouseup", () => {
      btn.classList.remove("pressed");
      if (cmd !== "STOP") sendManual("STOP");
    });
    btn.addEventListener("mouseleave", () => {
      btn.classList.remove("pressed");
    });

    btn.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        btn.classList.add("pressed");
        sendManual(cmd);
      },
      { passive: false },
    );

    btn.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        btn.classList.remove("pressed");
        if (cmd !== "STOP") sendManual("STOP");
      },
      { passive: false },
    );
  });

  // ── Keyboard controls ─────────────────────────────────────────────────────
  const KEY_MAP = {
    ArrowUp: "FORWARD",
    ArrowDown: "BACKWARD",
    ArrowLeft: "LEFT",
    ArrowRight: "RIGHT",
    w: "FORWARD",
    s: "BACKWARD",
    a: "LEFT",
    d: "RIGHT",
    " ": "STOP",
  };

  const activeKeys = new Set();

  document.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
    // Skip jika tab 3D Sim aktif — keyboard masuk ke iframe folio
    const sim3dPage = document.getElementById("page-simulation3d");
    if (sim3dPage && sim3dPage.classList.contains("active")) return;
    const cmd = KEY_MAP[e.key];
    if (!cmd) return;
    e.preventDefault();

    if (!activeKeys.has(e.key)) {
      activeKeys.add(e.key);
      sendManual(cmd);
    }
  });

  document.addEventListener("keyup", (e) => {
    // Skip jika tab 3D Sim aktif
    const sim3dPage = document.getElementById("page-simulation3d");
    if (sim3dPage && sim3dPage.classList.contains("active")) return;
    const cmd = KEY_MAP[e.key];
    if (!cmd) return;
    activeKeys.delete(e.key);
    if (cmd !== "STOP" && activeKeys.size === 0) {
      sendManual("STOP");
    }
  });
});
