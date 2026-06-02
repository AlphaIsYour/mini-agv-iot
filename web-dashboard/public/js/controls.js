/* ══════════════════════════════════════════════════════════════════════════════
   CONTROLS.JS — D-Pad, Keyboard, Arena AGV Animation
   Arena: Track lurus BASE → A → B → C
══════════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════════
   ARENA — Node positions & track routes
   Koordinat sesuai SVG viewBox="0 0 200 200":
   BASE : (100, 170)
   A    : (100, 130)
   B    : (100, 80)
   C    : (100, 30)
══════════════════════════════════════════════════════════════════════════════ */
const NODE_POS = {
  BASE: { x: 100, y: 170 },
  A: { x: 100, y: 130 },
  B: { x: 100, y: 80 },
  C: { x: 100, y: 30 },
};

// Rute pergi: BASE → tujuan
const ROUTE_TO_A = [
  { x: 100, y: 170 },
  { x: 100, y: 130 },
];
const ROUTE_TO_B = [
  { x: 100, y: 170 },
  { x: 100, y: 80 },
];
const ROUTE_TO_C = [
  { x: 100, y: 170 },
  { x: 100, y: 30 },
];

// Rute pulang: tujuan → BASE
const ROUTE_FROM_A = [
  { x: 100, y: 130 },
  { x: 100, y: 170 },
];
const ROUTE_FROM_B = [
  { x: 100, y: 80 },
  { x: 100, y: 170 },
];
const ROUTE_FROM_C = [
  { x: 100, y: 30 },
  { x: 100, y: 170 },
];

/* ── Animation state ─────────────────────────────────────────────────────── */
let agvPos = { x: 100, y: 170 };
let animFrame = null;
let currentWaypoints = null;
let animStartTime = null;
let animDuration = 1000;

window.currentMode = "AUTO";

/* ══════════════════════════════════════════════════════════════════════════════
   AGV VISUAL STATE
   Dipanggil dari ui.js setiap kali state berubah
══════════════════════════════════════════════════════════════════════════════ */
window.updateAGVVisual = function (state, mission) {
  const marker = document.getElementById("agv-marker");
  const trail = document.getElementById("agv-trail");
  if (!marker) return;

  marker.className = "";

  // Moving states
  if (state === "KEBERANGKATAN" || state === "PULANG") {
    marker.classList.add("agv-moving");
    if (trail) trail.classList.add("visible");

    if (state === "KEBERANGKATAN") {
      // Pergi ke tujuan
      if (mission === 1) animateAGVAlongTrack(ROUTE_TO_A);
      else if (mission === 2) animateAGVAlongTrack(ROUTE_TO_B);
      else if (mission === 3) animateAGVAlongTrack(ROUTE_TO_C);
    } else if (state === "PULANG") {
      // Pulang ke base
      if (mission === 1) animateAGVAlongTrack(ROUTE_FROM_A);
      else if (mission === 2) animateAGVAlongTrack(ROUTE_FROM_B);
      else if (mission === 3) animateAGVAlongTrack(ROUTE_FROM_C);
    }
  } else if (state === "SAMPAI") {
    marker.classList.add("agv-arrived");
    stopAnimation();
    // Snap ke posisi tujuan
    if (mission === 1) snapAGV(NODE_POS.A);
    else if (mission === 2) snapAGV(NODE_POS.B);
    else if (mission === 3) snapAGV(NODE_POS.C);
  } else if (state === "SELESAI") {
    marker.classList.add("agv-arrived");
    stopAnimation();
    snapAGV(NODE_POS.BASE);
  } else {
    // IDLE
    stopAnimation();
    if (trail) trail.classList.remove("visible");
    snapAGV(NODE_POS.BASE);
  }
};

/* ── Snap AGV ke posisi tanpa animasi ────────────────────────────────────── */
function snapAGV(pos) {
  agvPos = { ...pos };
  document
    .getElementById("agv-marker")
    ?.setAttribute("transform", `translate(${pos.x},${pos.y})`);
}

/* ══════════════════════════════════════════════════════════════════════════════
   AGV ANIMATION — bergerak sepanjang waypoints
══════════════════════════════════════════════════════════════════════════════ */
window.animateAGVAlongTrack = function (waypoints) {
  if (!waypoints || waypoints.length < 2) return;

  const dx0 = agvPos.x - waypoints[0].x;
  const dy0 = agvPos.y - waypoints[0].y;
  const fullPath =
    Math.sqrt(dx0 * dx0 + dy0 * dy0) > 3
      ? [{ ...agvPos }, ...waypoints]
      : waypoints;

  const trail = document.getElementById("agv-trail");
  if (trail) trail.setAttribute("d", pointsToPath(waypoints));

  animDuration = Math.max(800, (routeLength(fullPath) / 80) * 1000);
  currentWaypoints = fullPath;
  animStartTime = null;

  stopAnimation();

  function step(now) {
    if (!animStartTime) animStartTime = now;
    const t = Math.min(1, (now - animStartTime) / animDuration);
    const pos = posAlongRoute(currentWaypoints, easeInOut(t));

    agvPos = { ...pos };
    document
      .getElementById("agv-marker")
      ?.setAttribute(
        "transform",
        `translate(${pos.x.toFixed(2)},${pos.y.toFixed(2)})`,
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
  if (typeof window.wsSend === "function") {
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
  if (typeof window.wsSend === "function") {
    window.wsSend({
      type: "manual",
      command: cmd,
    });
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
    const cmd = KEY_MAP[e.key];
    if (!cmd) return;
    e.preventDefault();

    if (!activeKeys.has(e.key)) {
      activeKeys.add(e.key);
      sendManual(cmd);
    }
  });

  document.addEventListener("keyup", (e) => {
    const cmd = KEY_MAP[e.key];
    if (!cmd) return;
    activeKeys.delete(e.key);
    if (cmd !== "STOP" && activeKeys.size === 0) {
      sendManual("STOP");
    }
  });
});
