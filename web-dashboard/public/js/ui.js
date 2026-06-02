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
  if (curDest) curDest.textContent = d;
  if (sfDest) sfDest.textContent = d;
  if (sysDest) sysDest.textContent = d;

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
  window.currentMode = m;

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
  if (sfMode) sfMode.textContent = m;
  if (sysMode) sysMode.textContent = m;

  // Show/hide d-pad
  const dpad = document.getElementById("dpad");
  if (dpad) {
    if (m === "MANUAL") {
      dpad.style.display = "flex";
    } else {
      dpad.style.display = "none";
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
  if (usVal) usVal.textContent = cm.toFixed(0);
  if (usBar) {
    usBar.style.width = pct + "%";
    usBar.style.background = col;
  }
  if (obsW) {
    obsW.textContent = cm > 0 && cm < 15 ? "OBSTACLE DETECTED" : "CLEAR";
    obsW.className = "obs-warn" + (cm > 0 && cm < 15 ? " alert" : "");
  }

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

  pushSpark("us", cm);
};

/* ══════════════════════════════════════════════════════════════════════════════
   LOAD CELL
══════════════════════════════════════════════════════════════════════════════ */
window.applyLC = function (v) {
  if (v == null) return;
  const g = Number(v);

  const lcVal = document.getElementById("lc-val");
  const lcBar = document.getElementById("lc-bar");
  const lcTag = document.getElementById("lc-tag");
  if (lcVal) lcVal.textContent = g.toFixed(0);
  if (lcBar) lcBar.style.width = Math.min(100, (g / 1000) * 100) + "%";
  if (lcTag) {
    lcTag.textContent = g > 50 ? "LOADED" : "NO LOAD";
    lcTag.className = "load-tag" + (g > 50 ? " loaded" : "");
  }

  // Big gauge
  const bigLC = document.getElementById("big-lc");
  if (bigLC) {
    bigLC.textContent = g.toFixed(0);
    setGaugeArc("gauge-lc-arc", Math.min(1, g / 1000), "var(--clr-green)");
    const bigTag = document.getElementById("big-lc-tag");
    if (bigTag) {
      bigTag.textContent = g > 50 ? "LOADED" : "NO LOAD";
      bigTag.className = "load-tag" + (g > 50 ? " loaded" : "");
    }
  }

  pushSpark("lc", g);
};

/* ══════════════════════════════════════════════════════════════════════════════
   BLACKBOX COUNT
══════════════════════════════════════════════════════════════════════════════ */
window.applyBlackbox = function (count) {
  const el = document.getElementById("bb-count");
  if (el) el.textContent = count;
  const sf = document.getElementById("sf-bb");
  if (sf) sf.textContent = count;
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
};

/* ══════════════════════════════════════════════════════════════════════════════
   IR SENSORS
══════════════════════════════════════════════════════════════════════════════ */
window.applyIR = function (d) {
  if (!d) return;
  const keys = ["s1", "s2", "s3", "s4", "s5"];
  keys.forEach((k) => {
    const on = !!d[k] || d[k] === 1;
    // Small dots
    document.getElementById("ir-" + k)?.classList.toggle("on", on);
    // Big chips
    document.getElementById("big-ir-" + k)?.classList.toggle("on", on);
  });
  const pat = keys.map((k) => (d[k] ? "■" : "□")).join(" ");
  const irPat = document.getElementById("ir-pat");
  const bigIrPat = document.getElementById("big-ir-pat");
  if (irPat) irPat.textContent = pat;
  if (bigIrPat) bigIrPat.textContent = pat;
};

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
  }
};
