/* ══════════════════════════════════════════════════════════════════════════════
   UI.JS — DOM updaters: state, dest, mode, battery, sensors, events, log
══════════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════════
   SNAPSHOT
══════════════════════════════════════════════════════════════════════════════ */
window.applySnapshot = function (s) {
  if (!s) return;
  applyState(s.state);
  applyDest(s.destination);
  applyMode(s.mode);
  applyBat(s.battery);
  if (s.blackboxCount != null) applyBlackbox(s.blackboxCount);
  if (s.waiting != null) applyWaiting(s.waiting);
  if (s.sensors) {
    applyIR(s.sensors.ir);
    applyUS(s.sensors.ultrasonic);
    applyLC(s.sensors.loadcell);
  }
  if (s.events) {
    s.events
      .slice(0, 20)
      .reverse()
      .forEach((ev) => appendLog(ev));
    if (s.events.length) showLastEvent(s.events[0]);
  }
  setMQTTStatus(true);
};

/* ══════════════════════════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════════════════════════ */
let prevState = "";

window.applyState = function (raw) {
  if (!raw) return;
  const s = typeof raw === "string" ? raw : raw.state || raw;
  const prev = prevState;
  prevState = s;
  window.prevState = s; // expose for Robo Eyes

  // Header state chip
  const hst = document.getElementById("h-state");
  if (hst) {
    hst.textContent = s.replace(/_/g, " ");
    hst.className = "h-state " + s;
  }

  // FSM state in panel
  const fEl = document.getElementById("fsm-state");
  if (fEl) {
    fEl.textContent = s;
    fEl.className = "sb-val " + stateClass(s);
  }

  // System page
  const sysState = document.getElementById("sys-state");
  if (sysState) sysState.textContent = s;

  // Sensor page
  const sensorChip = document.getElementById("sensor-state-chip");
  if (sensorChip) {
    sensorChip.textContent = s.replace(/_/g, " ");
    sensorChip.className = "h-state " + s;
  }
  const sensorFsm = document.getElementById("sensor-fsm");
  if (sensorFsm) {
    sensorFsm.textContent = s;
    sensorFsm.className = "status-val " + stateClass(s);
  }

  // Sidebar footer
  const sfState = document.getElementById("sf-state");
  if (sfState) sfState.textContent = s;

  // AGV visual — pass mission for animation
  const missionNum = window.currentMission || 0;
  updateAGVVisual(s, missionNum);

  // Robo Eyes sync
  if (window.updateRoboEyes) updateRoboEyes(s);

  // ── Alert logic ───────────────────────────────────────────────────────────
  const alertError = document.getElementById("toggle-alert-error")?.checked;
  const alertArrived = document.getElementById("toggle-alert-arrived")?.checked;

  if (s === "ERROR_STATE" && prev !== s && alertError) {
    beepError();
    toast("ERROR STATE", "AGV entered error state!", "error");
  }
  if (s === "SAMPAI" && prev !== s && alertArrived) {
    beepSuccess();
    toast("Sampai!", "AGV sudah di titik tujuan", "success");
  }
  if (s === "SELESAI" && prev !== s && alertArrived) {
    beepSuccess();
    toast("Selesai!", "AGV sudah kembali ke base", "success");
  }
};

function stateClass(s) {
  if (s === "ERROR_STATE") return "err";
  if (s === "SAMPAI" || s === "SELESAI") return "ok";
  if (s === "KEBERANGKATAN" || s === "PULANG") return "purple";
  return "";
}

/* ══════════════════════════════════════════════════════════════════════════════
   DESTINATION
══════════════════════════════════════════════════════════════════════════════ */
let prevDest = "BASE";

window.applyDest = function (raw) {
  if (!raw) return;
  const d = typeof raw === "string" ? raw : raw.destination || raw;
  prevDest = d;

  // Track current mission number for animation
  if (d === "A") window.currentMission = 1;
  else if (d === "B") window.currentMission = 2;
  else if (d === "C") window.currentMission = 3;
  else window.currentMission = 0;

  const curDest = document.getElementById("cur-dest");
  const sfDest = document.getElementById("sf-dest");
  const sysDest = document.getElementById("sys-dest");
  const sensorDest = document.getElementById("sensor-dest");
  if (curDest) curDest.textContent = d;
  if (sfDest) sfDest.textContent = d;
  if (sysDest) sysDest.textContent = d;
  if (sensorDest) sensorDest.textContent = d;

  // Highlight arena nodes
  ["A", "B", "C", "BASE"].forEach((n) => {
    const node = document.getElementById("node-" + n);
    const lbl = document.getElementById("lbl-" + n);
    const zone = document.getElementById("zone-" + n);
    if (!node) return;
    const active = n === d;
    const accentColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim();
    node.setAttribute(
      "stroke",
      active ? accentColor : "var(--arena-node-stroke)",
    );
    if (lbl)
      lbl.setAttribute("fill", active ? accentColor : "var(--arena-lbl)");
    if (zone)
      zone.setAttribute(
        "fill",
        active
          ? "color-mix(in srgb, var(--accent) 5%, transparent)"
          : "var(--arena-zone)",
      );
  });

  // Destination buttons
  ["A", "B", "C"].forEach((l) => {
    document.getElementById("btn-" + l)?.classList.toggle("active", l === d);
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   MODE
══════════════════════════════════════════════════════════════════════════════ */
window.applyMode = function (raw) {
  if (!raw) return;
  const m = typeof raw === "string" ? raw : raw.mode || raw;
  if (typeof window.setControlMode === "function") {
    window.setControlMode(m);
  } else {
    window.currentMode = m;
  }

  document
    .querySelectorAll(".mchip")
    .forEach((c) => c.classList.toggle("active", c.dataset.mode === m));
  ["auto", "manual", "pickup"].forEach((x) => {
    document
      .getElementById("mbtn-" + x)
      ?.classList.toggle("active", x.toUpperCase() === m);
  });

  const sfMode = document.getElementById("sf-mode");
  const sysMode = document.getElementById("sys-mode");
  const sensorMode = document.getElementById("sensor-mode");
  if (sfMode) sfMode.textContent = m;
  if (sysMode) sysMode.textContent = m;
  if (sensorMode) sensorMode.textContent = m;

  // Show/hide d-pad
  const dpad = document.getElementById("dpad");
  const txt = document.getElementById("manual-toggle-txt");
  if (dpad) {
    if (m === "MANUAL") {
      dpad.style.display = "flex";
      if (txt) txt.textContent = "Hide D-Pad";
    } else {
      dpad.style.display = "none";
      if (txt) txt.textContent = "Show D-Pad";
    }
  }
};

/* ══════════════════════════════════════════════════════════════════════════════
   BATTERY
══════════════════════════════════════════════════════════════════════════════ */
window.applyBat = function (v) {
  if (v == null) return;

  // Support both object {v, pct} and plain number
  let pctRaw, voltage;
  if (typeof v === "object" && "pct" in v) {
    pctRaw  = v.pct;
    voltage = v.v;
  } else {
    pctRaw  = v;
    voltage = null;
  }

  const pct = Math.max(0, Math.min(100, Number(pctRaw)));
  if (isNaN(pct)) return;

  const col =
    pct > 40
      ? "var(--clr-green)"
      : pct > 20
        ? "var(--clr-amber)"
        : "var(--clr-red)";

  // Header
  const pctEl = document.getElementById("bat-pct");
  const fill = document.getElementById("bat-fill");
  const voltEl = document.getElementById("bat-volt");
  if (pctEl) pctEl.textContent = pct + "%";
  if (fill) {
    fill.style.width = pct + "%";
    fill.style.background = col;
  }
  if (voltEl && voltage != null && !isNaN(voltage)) {
    voltEl.textContent = Number(voltage).toFixed(1) + "V";
  }

  // System page
  const sysBat = document.getElementById("sys-bat");
  if (sysBat) sysBat.textContent = pct + "%" + (voltage != null && !isNaN(voltage) ? ` (${Number(voltage).toFixed(2)}V)` : "");

  // Big gauge (Sensors page)
  const bigBat = document.getElementById("big-bat");
  if (bigBat) {
    bigBat.textContent = pct;
    bigBat.style.color = col;
    setGaugeArc("gauge-bat-arc", pct / 100, col);
    const batStatus = document.getElementById("big-bat-status");
    if (batStatus) {
      batStatus.textContent =
        pct > 40 ? "NORMAL" : pct > 20 ? "LOW" : "CRITICAL";
      batStatus.style.color = col;
    }
    const batVoltBig = document.getElementById("bat-volt-big");
    if (batVoltBig && voltage != null && !isNaN(voltage)) {
      batVoltBig.textContent = Number(voltage).toFixed(2) + "V";
    }
  }

  pushSpark("bat", pct);

  // Low battery alert (only once per threshold cross)
  if (pct <= 20 && pct > 0) {
    toast("Low Battery", `Battery at ${pct}%`, "warning", 5000);
    beepWarn();
  }
};

/* ══════════════════════════════════════════════════════════════════════════════
   ULTRASONIC
══════════════════════════════════════════════════════════════════════════════ */
window.applyUS = function (v) {
  if (v == null) return;
  const cm = Number(v);
  const pct = Math.min(100, (cm / 100) * 100);
  const col =
    cm > 0 && cm < 15
      ? "var(--clr-red)"
      : cm < 30
        ? "var(--clr-amber)"
        : "var(--accent)";

  // Small sensor card
  const usVal = document.getElementById("us-val");
  const usBar = document.getElementById("us-bar");
  const obsW = document.getElementById("obs-warn");
  const obsDist = document.getElementById("obs-dist");
  const obsStatus = document.getElementById("obs-status");
  const sysObstacle = document.getElementById("sys-obstacle");
  if (usVal) usVal.textContent = cm.toFixed(0);
  if (obsDist) obsDist.textContent = cm.toFixed(0);
  if (usBar) {
    usBar.style.width = pct + "%";
    usBar.style.background = col;
  }
  if (obsW) {
    obsW.textContent = cm > 0 && cm < 15 ? "OBSTACLE DETECTED" : "CLEAR";
    obsW.className = "obs-warn" + (cm > 0 && cm < 15 ? " alert" : "");
  }
  if (obsStatus) {
    obsStatus.textContent = cm > 0 && cm < 15 ? "OBSTACLE" : "CLEAR";
    obsStatus.className = "obs-warn" + (cm > 0 && cm < 15 ? " alert" : "");
  }
  if (sysObstacle) {
    sysObstacle.textContent = cm > 0 && cm < 15 ? `${cm.toFixed(0)} cm` : "Clear";
    sysObstacle.className = "sys-val " + (cm > 0 && cm < 15 ? "err" : "ok");
  }

  // Sensor page obstacle status
  const sensorObs = document.getElementById("sensor-obstacle");
  if (sensorObs) {
    const isObs = cm > 0 && cm < 25;
    sensorObs.textContent = isObs ? `${cm.toFixed(0)} cm` : "Clear";
    sensorObs.className = "status-val " + (isObs ? "err" : "ok");
  }

  // System page
  const sysUS = document.getElementById("sys-us");
  if (sysUS) sysUS.textContent = cm.toFixed(0) + " cm";

  // Big gauge (Sensors page)
  const bigUS = document.getElementById("big-us");
  if (bigUS) {
    bigUS.textContent = cm.toFixed(0);
    bigUS.style.color = col;
    setGaugeArc("gauge-us-arc", pct / 100, col);
    const bigObs = document.getElementById("big-obs-warn");
    if (bigObs) {
      bigObs.textContent = cm > 0 && cm < 15 ? "OBSTACLE" : "CLEAR";
      bigObs.className = "obs-warn" + (cm > 0 && cm < 15 ? " alert" : "");
    }
  }

  const bigObsDist = document.getElementById("big-obs-dist");
  const bigObsStatus = document.getElementById("big-obs-status");
  if (bigObsDist) {
    bigObsDist.textContent = cm.toFixed(0);
    bigObsDist.style.color = col;
    setGaugeArc("gauge-obs-arc", pct / 100, col);
  }
  if (bigObsStatus) {
    bigObsStatus.textContent = cm > 0 && cm < 15 ? "OBSTACLE" : "CLEAR";
    bigObsStatus.className = "obs-warn" + (cm > 0 && cm < 15 ? " alert" : "");
  }

  pushSpark("us", cm);
};

/* ══════════════════════════════════════════════════════════════════════════════
   LOAD CELL
══════════════════════════════════════════════════════════════════════════════ */
let lastLCGrams = 0;

window.tareLoadCellUI = function () {
  localStorage.removeItem("xora-lc-offset");
  if (typeof window.wsSend === "function") {
    window.wsSend({ type: "command", command: "TARE" });
  }
  if (typeof toast === "function") {
    toast("Tare Dikirim", "Menunggu nilai baru dari AGV", "success", 1800);
  }
};

window.resetLoadCellUI = function () {
  localStorage.removeItem("xora-lc-offset");
  applyLC(lastLCGrams);
  if (typeof toast === "function") {
    toast("Load Cell Reset", "Tampilan mengikuti telemetry AGV", "info", 1800);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-lc-tare")?.addEventListener("click", tareLoadCellUI);
  document.getElementById("btn-lc-reset")?.addEventListener("click", resetLoadCellUI);
  document.querySelectorAll(".lc-tare-btn").forEach(b => b.addEventListener("click", tareLoadCellUI));
  document.querySelectorAll(".lc-reset-btn").forEach(b => b.addEventListener("click", resetLoadCellUI));
});

window.applyLC = function (v) {
  if (v == null) return;
  const raw = Number(v);
  if (!Number.isFinite(raw)) return;

  const g = Math.max(0, raw);
  lastLCGrams = g;

  const lcVal = document.getElementById("lc-val");
  const lcBar = document.getElementById("lc-bar");
  const lcTag = document.getElementById("lc-tag");
  if (lcVal) {
    lcVal.textContent = g.toFixed(0);
    lcVal.title = raw !== g ? `Raw: ${raw}` : "";
  }
  if (lcBar) lcBar.style.width = Math.min(100, (g / 1000) * 100) + "%";
  if (lcTag) {
    lcTag.textContent = g > 50 ? "LOADED" : "NO LOAD";
    lcTag.className = "load-tag" + (g > 50 ? " loaded" : "");
  }

  // Big gauge
  const bigLC = document.getElementById("big-lc");
  if (bigLC) {
    bigLC.textContent = g.toFixed(0);
    bigLC.title = raw !== g ? `Raw: ${raw}` : "";
    setGaugeArc("gauge-lc-arc", Math.min(1, g / 1000), "var(--clr-green)");
    const bigTag = document.getElementById("big-lc-tag");
    if (bigTag) {
      bigTag.textContent = g > 50 ? "LOADED" : "NO LOAD";
      bigTag.className = "load-tag" + (g > 50 ? " loaded" : "");
    }
  }

  pushSpark("lc", g);

  // System page
  const sysLC = document.getElementById("sys-lc");
  if (sysLC) sysLC.textContent = g.toFixed(0) + " g";
};

/* ══════════════════════════════════════════════════════════════════════════════
   MOTOR PWM
══════════════════════════════════════════════════════════════════════════════ */
window.applyMotor = function (left, right) {
  if (left == null || right == null) return;
  const l = Number(left);
  const r = Number(right);
  if (isNaN(l) || isNaN(r)) return;

  const maxPWM = 255;

  // Left motor
  const lBar = document.getElementById("motor-left-bar");
  const lVal = document.getElementById("motor-left-val");
  if (lBar) {
    const lPct = Math.min(100, (Math.abs(l) / maxPWM) * 100);
    lBar.style.width = lPct + "%";
    lBar.style.background = l < 0 ? "var(--clr-amber)" : "var(--accent)";
  }
  if (lVal) lVal.textContent = l;

  // Right motor
  const rBar = document.getElementById("motor-right-bar");
  const rVal = document.getElementById("motor-right-val");
  if (rBar) {
    const rPct = Math.min(100, (Math.abs(r) / maxPWM) * 100);
    rBar.style.width = rPct + "%";
    rBar.style.background = r < 0 ? "var(--clr-amber)" : "var(--accent)";
  }
  if (rVal) rVal.textContent = r;

  // Direction
  const dirEl = document.getElementById("motor-direction");
  if (dirEl) {
    if (l === 0 && r === 0) dirEl.textContent = "STOP";
    else if (l > 0 && r > 0) dirEl.textContent = "MAJU";
    else if (l < 0 && r < 0) dirEl.textContent = "MUNDUR";
    else if (l < 0 && r > 0) dirEl.textContent = "BELOK KIRI";
    else if (l > 0 && r < 0) dirEl.textContent = "BELOK KANAN";
    else dirEl.textContent = `${l}, ${r}`;
  }

  // System page
  const sysML = document.getElementById("sys-motor-l");
  const sysMR = document.getElementById("sys-motor-r");
  if (sysML) sysML.textContent = l;
  if (sysMR) sysMR.textContent = r;
};

/* ══════════════════════════════════════════════════════════════════════════════
   BLACKBOX COUNT
══════════════════════════════════════════════════════════════════════════════ */
window.applyBlackbox = function (count) {
  const el = document.getElementById("bb-count");
  if (el) el.textContent = count;
  const sf = document.getElementById("sf-bb");
  if (sf) sf.textContent = count;
  const sensorBb = document.getElementById("sensor-bb");
  if (sensorBb) sensorBb.textContent = count;
  const sysBb = document.getElementById("sys-bb");
  if (sysBb) sysBb.textContent = count;
};

/* ══════════════════════════════════════════════════════════════════════════════
   WAITING STATUS
══════════════════════════════════════════════════════════════════════════════ */
window.applyWaiting = function (waiting) {
  const el = document.getElementById("waiting-status");
  if (el) {
    el.textContent = waiting ? "Ya" : "Tidak";
    el.style.color = waiting ? "var(--clr-amber)" : "";
  }
  const sensorW = document.getElementById("sensor-waiting");
  if (sensorW) {
    sensorW.textContent = waiting ? "Ya" : "Tidak";
    sensorW.className = "status-val" + (waiting ? " warn" : "");
  }
  const sysW = document.getElementById("sys-waiting");
  if (sysW) {
    sysW.textContent = waiting ? "Ya" : "Tidak";
    sysW.className = "sys-val " + (waiting ? "warn" : "ok");
  }
};

/* ══════════════════════════════════════════════════════════════════════════════
   IR SENSORS
══════════════════════════════════════════════════════════════════════════════ */
window.applyIR = function (d) {
  if (!d) return;
  const keys = ["s1", "s2", "s3", "s4", "s5"];
  keys.forEach((k) => {
    const on = !!d[k] || d[k] === 1;
    // Small dots (Control page — uses old IDs for backward compat)
    document.getElementById("ir-" + k)?.classList.toggle("on", on);
    // Big chips (Sensors Live page — 5 channel)
    document.getElementById("big-ir-" + k)?.classList.toggle("on", on);
  });

  // Backward compat: update old 3-channel chips if they exist
  const oldKeys = [["s2","L"], ["s3","M"], ["s4","R"]];
  oldKeys.forEach(([k, id]) => {
    const on = !!d[k] || d[k] === 1;
    document.getElementById("ir-" + id)?.classList.toggle("on", on);
    document.getElementById("big-ir-" + id)?.classList.toggle("on", on);
  });

  const pat = keys.map((k) => (d[k] ? "■" : "□")).join(" ");
  const irPat = document.getElementById("ir-pat");
  const bigIrPatInline = document.getElementById("big-ir-pat-inline");
  if (irPat) irPat.textContent = pat;
  if (bigIrPatInline) bigIrPatInline.textContent = pat;

  // System page
  const sysIR = document.getElementById("sys-ir");
  if (sysIR) sysIR.textContent = pat;

  // 5-bit IR interpretation
  const bits = keys.map((k) => (d[k] ? 1 : 0)).join("");
  const interpret = document.getElementById("ir-interpret");
  if (interpret) {
    const info = interpretIR5(bits);
    interpret.textContent = info.text;
    interpret.className = "ir-interpret " + info.cls;
  }
};

function interpretIR5(bits) {
  // bits = "s1s2s3s4s5" = "ir_left line_left line_middle line_right ir_right"
  switch (bits) {
    case "01110": return { text: "On Track — Lurus", cls: "on-track" };
    case "00110": return { text: "Geser Kanan", cls: "turning" };
    case "01100": return { text: "Geser Kiri", cls: "turning" };
    case "00100": return { text: "Tengah Saja — Lurus", cls: "on-track" };
    case "11111": return { text: "⬛ BLACKBOX — Intersection", cls: "blackbox" };
    case "00000": return { text: "⚠ Garis Hilang — ERROR", cls: "lost" };
    case "10001": return { text: "Sensor Luar Saja — Koreksi", cls: "turning" };
    case "11000": return { text: "Belok Kiri Tajam", cls: "turning" };
    case "00011": return { text: "Belok Kanan Tajam", cls: "turning" };
    case "11100": return { text: "Tikungan Kiri", cls: "turning" };
    case "00111": return { text: "Tikungan Kanan", cls: "turning" };
    default:
      if (bits.includes("1")) return { text: "Pola: " + bits.split("").join(" "), cls: "" };
      return { text: "—", cls: "" };
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   EVENTS
══════════════════════════════════════════════════════════════════════════════ */
window.applyEvent = function (data) {
  if (!data) return;
  const ev =
    typeof data === "object"
      ? data
      : {
          code: "EVENT",
          message: String(data),
          timestamp: new Date().toISOString(),
        };

  appendLog(ev);
  showLastEvent(ev);

  const code = ev.code || "";
  const ERR_CODES = ["LINE_LOST", "OBSTACLE", "ERROR", "ESTOP", "FAIL", "LOST"];
  const WARN_CODES = ["WAITING", "NO_OBJECT", "TIMEOUT", "INVALID"];
  const OK_CODES = ["ARRIVED", "LOADED", "RETURNED"];

  const isErr = ERR_CODES.some((c) => code.includes(c));
  const isWarn = WARN_CODES.some((c) => code.includes(c));
  const isOk = OK_CODES.some((c) => code.includes(c));

  if (isErr) {
    // Show error badge on event log nav
    const badge = document.getElementById("err-badge");
    if (badge) badge.style.display = "flex";

    if (document.getElementById("toggle-alert-error")?.checked) {
      beepError();
      toast(code, ev.message || "", "error");
    }
  } else if (isWarn) {
    toast(code, ev.message || "", "warning", 3500);
  } else if (isOk) {
    if (document.getElementById("toggle-alert-arrived")?.checked)
      toast(code, ev.message || "", "success");
  }
};

function showLastEvent(ev) {
  const code = ev.code || "—";
  const evCode = document.getElementById("ev-code");
  const evMsg = document.getElementById("ev-msg");
  const evTs = document.getElementById("ev-ts");

  if (evCode) {
    evCode.textContent = code;
    const ERR = ["LINE_LOST", "OBSTACLE", "ERROR", "ESTOP", "FAIL", "LOST"];
    const WARN = ["WAITING", "NO_OBJECT", "TIMEOUT", "INVALID"];
    const OK = ["CMD", "ARRIVED", "LOADED", "RETURN", "IDLE", "ONLINE"];
    evCode.className =
      "ev-code" +
      (ERR.some((c) => code.includes(c))
        ? " err"
        : WARN.some((c) => code.includes(c))
          ? " warn"
          : OK.some((c) => code.includes(c))
            ? " ok"
            : "");
  }
  if (evMsg) evMsg.textContent = ev.message || "—";
  if (evTs)
    evTs.textContent = ev.timestamp
      ? new Date(ev.timestamp).toLocaleTimeString()
      : "—";
}

function appendLog(ev) {
  const list = document.getElementById("log-list");
  if (!list) return;

  const code = ev.code || "EVENT";
  const ERR = ["LINE_LOST", "OBSTACLE", "ERROR", "ESTOP", "FAIL"];
  const WARN = ["WAITING", "NO_OBJECT", "TIMEOUT", "INVALID"];
  const OK = ["CMD", "ARRIVED", "LOADED", "RETURN", "IDLE"];
  const lvl = ERR.some((c) => code.includes(c))
    ? "lerr"
    : WARN.some((c) => code.includes(c))
      ? "lwarn"
      : OK.some((c) => code.includes(c))
        ? "lok"
        : "";

  const ts = ev.timestamp
    ? new Date(ev.timestamp).toLocaleTimeString("en-US", { hour12: false })
    : "--:--:--";

  const el = document.createElement("div");
  el.className = `log-entry ${ev.source === "dashboard" ? "dash" : ""} ${lvl}`;
  el.innerHTML = `
    <span class="log-ts">${ts}</span>
    <span class="log-code">${code}</span>
    <span class="log-msg">${ev.message || ""}</span>
  `;
  list.insertBefore(el, list.firstChild);
  while (list.children.length > 60) list.removeChild(list.lastChild);
}

/* ══════════════════════════════════════════════════════════════════════════════
   GAUGE ARC HELPER
══════════════════════════════════════════════════════════════════════════════ */
window.setGaugeArc = function (id, fraction, color) {
  const el = document.getElementById(id);
  if (!el) return;
  const total = 220;
  const offset = total - total * Math.max(0, Math.min(1, fraction));
  el.style.strokeDashoffset = offset;
  if (color) el.style.stroke = color;
};

/* ══════════════════════════════════════════════════════════════════════════════
   SPARKLINES
══════════════════════════════════════════════════════════════════════════════ */
const SPARK_MAX = 40;
const sparkData = { us: [], lc: [], bat: [] };
const sparkCharts = {};

window.initSparklines = function () {
  const make = (canvasId, color) => {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    return new Chart(el, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            borderColor: color,
            backgroundColor: color.replace(/[\d.]+\)$/, "0.08)"),
            fill: true,
            borderWidth: 1.5,
            tension: 0.4,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        animation: { duration: 200 },
      },
    });
  };

  sparkCharts.us = make("spark-us", "rgba(0,212,255,1)");
  sparkCharts.lc = make("spark-lc", "rgba(0,255,136,1)");
  sparkCharts.bat = make("spark-bat", "rgba(255,179,0,1)");
};

window.pushSpark = function (key, val) {
  if (!document.getElementById("toggle-sparklines")?.checked) return;
  const arr = sparkData[key];
  arr.push(val);
  if (arr.length > SPARK_MAX) arr.shift();
  const c = sparkCharts[key];
  if (!c) return;
  c.data.labels = arr.map((_, i) => i);
  c.data.datasets[0].data = [...arr];
  c.update("none");
};

/* ══════════════════════════════════════════════════════════════════════════════
   SYSTEM INFO — apply server-side data to System page
══════════════════════════════════════════════════════════════════════════════ */
window.applySystemInfo = function (d) {
  if (!d) return;

  // Server
  if (d.server) {
    const uptime = document.getElementById("sys-server-uptime");
    if (uptime && d.server.uptime) {
      const ms = Date.now() - new Date(d.server.uptime).getTime();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      uptime.textContent = `${h}h ${m}m`;
    }
    const nodeEl = document.getElementById("sys-node");
    if (nodeEl) nodeEl.textContent = d.server.nodeVersion || "—";
    const platEl = document.getElementById("sys-platform");
    if (platEl) platEl.textContent = d.server.platform || "—";
  }

  // Database
  if (d.database) {
    const dbEl = document.getElementById("sys-db");
    if (dbEl) {
      dbEl.textContent = d.database.connected ? "Connected" : "Disconnected";
      dbEl.className = "sys-val " + (d.database.connected ? "ok" : "err");
    }
    const dbVer = document.getElementById("sys-db-version");
    if (dbVer) dbVer.textContent = d.database.version || "—";
    const totalEv = document.getElementById("sys-total-events");
    if (totalEv) totalEv.textContent = d.database.totalEvents || "0";
    const totalLogs = document.getElementById("sys-total-logs");
    if (totalLogs) totalLogs.textContent = d.database.totalSensorLogs || "0";
  }

  // MQTT
  if (d.mqtt) {
    const mqttEl = document.getElementById("sys-mqtt");
    if (mqttEl) {
      mqttEl.textContent = d.mqtt.connected ? "Connected" : "Disconnected";
      mqttEl.className = "sys-val " + (d.mqtt.connected ? "ok" : "err");
    }
    const mqttClient = document.getElementById("sys-mqtt-client");
    if (mqttClient) mqttClient.textContent = d.mqtt.clientId || "—";
    const deviceEl = document.getElementById("sys-device");
    if (deviceEl) deviceEl.textContent = d.mqtt.deviceId || "—";
  }

  // WebSocket
  if (d.websocket) {
    const wsClients = document.getElementById("sys-ws-clients");
    if (wsClients) {
      wsClients.textContent = `${d.websocket.authenticated} / ${d.websocket.clients}`;
    }
  }
};

window.loadSystemInfo = function () {
  requestAPI("system_info");
};

/* ══════════════════════════════════════════════════════════════════════════════
   API RESPONSE ROUTER (called from websocket.js)
══════════════════════════════════════════════════════════════════════════════ */
window.handleAPIResponse = function (api, data) {
  switch (api) {
    case "stats_summary":
      renderStats(data);
      break;
    case "event_counts":
      renderEventChart(data);
      break;
    case "sensor_history":
      renderSensorCharts(data);
      break;
    case "error_summary":
      renderErrorTable(data);
      break;
    case "event_log":
      renderEventLog(data);
      break;
    case "state_distribution":
      renderStateChart(data);
      break;
    case "system_info":
      applySystemInfo(data);
      break;
    case "mission_log":
      renderMissionLog(data);
      break;
  }
};
