/* ══════════════════════════════════════════════════════════════════════════════
   CONTROLS.JS — D-Pad, Keyboard, Arena AGV Animation
══════════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════════
   ARENA — Node positions & track routes
══════════════════════════════════════════════════════════════════════════════ */
const NODE_POS = {
  BASE: { x: 100, y: 160 },
  A: { x: 40, y: 40 },
  B: { x: 100, y: 40 },
  C: { x: 160, y: 40 },
};

const TRACK_ROUTES = {
  "BASE-A": [
    { x: 100, y: 160 },
    { x: 40, y: 160 },
    { x: 40, y: 40 },
  ],
  "BASE-B": [
    { x: 100, y: 160 },
    { x: 100, y: 40 },
  ],
  "BASE-C": [
    { x: 100, y: 160 },
    { x: 160, y: 160 },
    { x: 160, y: 40 },
  ],
  "A-BASE": [
    { x: 40, y: 40 },
    { x: 40, y: 160 },
    { x: 100, y: 160 },
  ],
  "B-BASE": [
    { x: 100, y: 40 },
    { x: 100, y: 160 },
  ],
  "C-BASE": [
    { x: 160, y: 40 },
    { x: 160, y: 160 },
    { x: 100, y: 160 },
  ],
  "A-B": [
    { x: 40, y: 40 },
    { x: 100, y: 40 },
  ],
  "A-C": [
    { x: 40, y: 40 },
    { x: 160, y: 40 },
  ],
  "B-A": [
    { x: 100, y: 40 },
    { x: 40, y: 40 },
  ],
  "B-C": [
    { x: 100, y: 40 },
    { x: 160, y: 40 },
  ],
  "C-A": [
    { x: 160, y: 40 },
    { x: 40, y: 40 },
  ],
  "C-B": [
    { x: 160, y: 40 },
    { x: 100, y: 40 },
  ],
};

/* ── Animation state ─────────────────────────────────────────────────────── */
let agvPos = { x: 100, y: 160 };
let animFrame = null;
let currentWaypoints = null;
let animStartTime = null;
let animDuration = 1000;

window.currentMode = "AUTO";

/* ══════════════════════════════════════════════════════════════════════════════
   AGV VISUAL STATE
══════════════════════════════════════════════════════════════════════════════ */
window.updateAGVVisual = function (state) {
  const marker = document.getElementById("agv-marker");
  const trail = document.getElementById("agv-trail");
  if (!marker) return;

  // Reset classes
  marker.className = "";

  if (
    state === "FOLLOW_LINE" ||
    state === "DECISION_AT_INTERSECTION" ||
    state === "RETURN_TO_BASE"
  ) {
    marker.classList.add("agv-moving");
    trail?.classList.add("visible");
  } else if (state === "ERROR_STATE") {
    marker.classList.add("agv-error");
    stopAnimation();
  } else if (state === "ARRIVED_AT_DESTINATION" || state === "LOAD_UNLOAD") {
    marker.classList.add("agv-arrived");
    stopAnimation();
  } else {
    stopAnimation();
    trail?.classList.remove("visible");
  }
};

/* ══════════════════════════════════════════════════════════════════════════════
   AGV ANIMATION
══════════════════════════════════════════════════════════════════════════════ */
window.animateAGVAlongTrack = function (from, to) {
  if (!from || !to || from === to) return;

  let waypoints = TRACK_ROUTES[`${from}-${to}`];

  // Fallback: route via BASE
  if (!waypoints) {
    const toBase = TRACK_ROUTES[`${from}-BASE`];
    const fromBase = TRACK_ROUTES[`BASE-${to}`];
    if (toBase && fromBase) {
      waypoints = [...toBase, ...fromBase.slice(1)];
    } else {
      // No route found — teleport
      const t = NODE_POS[to] || NODE_POS.BASE;
      agvPos = { ...t };
      document
        .getElementById("agv-marker")
        ?.setAttribute("transform", `translate(${t.x},${t.y})`);
      return;
    }
  }

  // Draw trail path
  const trail = document.getElementById("agv-trail");
  if (trail) trail.setAttribute("d", pointsToPath(waypoints));

  // Prepend current AGV position if far from first waypoint
  const dx0 = agvPos.x - waypoints[0].x;
  const dy0 = agvPos.y - waypoints[0].y;
  const fullPath =
    Math.sqrt(dx0 * dx0 + dy0 * dy0) > 2
      ? [{ ...agvPos }, ...waypoints]
      : waypoints;

  // Duration based on distance
  animDuration = Math.max(600, (routeLength(fullPath) / 80) * 1000);
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
   D-PAD CONTROLS
══════════════════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  // D-pad buttons
  document.querySelectorAll(".dpad-btn").forEach((btn) => {
    const cmd = btn.dataset.cmd;
    if (!cmd) return;

    // Mouse
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

    // Touch
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

  // Keyboard controls (only in MANUAL mode)
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
    if (window.currentMode !== "MANUAL") return;
    // Don't fire on input/textarea
    if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;

    const cmd = KEY_MAP[e.key];
    if (!cmd) return;
    e.preventDefault();

    if (!activeKeys.has(e.key)) {
      activeKeys.add(e.key);
      sendManual(cmd);

      // Visual feedback on dpad btn
      const btn = document.querySelector(`.dpad-btn[data-cmd="${cmd}"]`);
      btn?.classList.add("pressed");
    }
  });

  document.addEventListener("keyup", (e) => {
    if (window.currentMode !== "MANUAL") return;
    const cmd = KEY_MAP[e.key];
    if (!cmd) return;

    activeKeys.delete(e.key);

    const btn = document.querySelector(`.dpad-btn[data-cmd="${cmd}"]`);
    btn?.classList.remove("pressed");

    if (cmd !== "STOP" && activeKeys.size === 0) {
      sendManual("STOP");
    }
  });
});
