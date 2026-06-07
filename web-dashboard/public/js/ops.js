/*
   OPS.JS - safety checklist, mission timeline, route progress, demo mode
*/

(function () {
  const CARGO_THRESHOLD_G = 50;
  const TARE_WINDOW_G = 20;
  const TELEMETRY_STALE_MS = 4500;

  const state = {
    telemetry: {
      online: false,
      mqtt: false,
      fsm: "IDLE",
      mission: 0,
      blackbox: 0,
      waiting: false,
      distance: null,
      loadcell: null,
      ir: "",
      lastSeen: 0,
    },
    lastFsm: "",
    lastMission: 0,
    lastBlackbox: 0,
    lastCargo: false,
    lastMqtt: false,
    lastObstacle: false,
    lastLineLost: false,
    taredSeen: false,
    timeline: [],
    counters: {
      mqttLost: 0,
      obstacle: 0,
      lineLost: 0,
    },
    demoActive: false,
    demoTimer: null,
    demoStep: 0,
    demoMission: 1,
    originalSendCmd: window.sendCmd,
  };

  window.XORA_OPS = state;

  function el(id) {
    return document.getElementById(id);
  }

  function setText(id, text) {
    const node = el(id);
    if (node) node.textContent = text;
  }

  function bit(v) {
    return v === true || v === 1 || v === "1" ? "1" : "0";
  }

  function irFromData(data) {
    if (!data) return "";
    if (typeof data.ir === "string") return data.ir.replace(/[^01]/g, "").slice(0, 5);
    if (typeof data.ir_pattern === "string") return data.ir_pattern.replace(/[^01]/g, "").slice(0, 5);
    if (data.s1 != null) {
      return ["s1", "s2", "s3", "s4", "s5"].map((k) => bit(data[k])).join("");
    }
    if (data.line_left != null || data.ir_left != null) {
      return [
        data.ir_left,
        data.line_left,
        data.line_middle,
        data.line_right,
        data.ir_right,
      ].map(bit).join("");
    }
    return "";
  }

  function normalizeTelemetry(data) {
    const t = state.telemetry;
    const ir = irFromData(data);
    if (data.online != null) t.online = !!data.online;
    if (data.mqtt != null) t.mqtt = !!data.mqtt;
    if (data.mqtt_connected != null) t.mqtt = !!data.mqtt_connected;
    if (data.state) t.fsm = data.state;
    if (data.mission != null) t.mission = Number(data.mission) || 0;
    if (data.blackbox_count != null) t.blackbox = Number(data.blackbox_count) || 0;
    if (data.waiting != null) t.waiting = !!data.waiting;
    if (data.distance_cm != null) t.distance = Number(data.distance_cm);
    if (data.loadcell_g != null) t.loadcell = Number(data.loadcell_g);
    if (ir.length === 5) t.ir = ir;
    if (Object.keys(data || {}).length) {
      t.lastSeen = Date.now();
      t.online = true;
    }
    if (Number.isFinite(t.loadcell) && Math.abs(t.loadcell) <= TARE_WINDOW_G) {
      state.taredSeen = true;
    }
    return t;
  }

  function missionName(mission) {
    return mission === 1 ? "A" : mission === 2 ? "B" : mission === 3 ? "C" : "BASE";
  }

  function setCheck(name, status, title) {
    const node = document.querySelector(`[data-check="${name}"]`);
    if (!node) return;
    node.classList.remove("ok", "warn", "bad");
    node.classList.add(status);
    node.title = title || "";
    const icon = node.querySelector(".icon");
    if (icon) {
      icon.className =
        "fa-solid icon " +
        (status === "ok" ? "fa-circle-check" : status === "warn" ? "fa-triangle-exclamation" : "fa-circle-xmark");
    }
  }

  function evaluateChecks() {
    const t = state.telemetry;
    const fresh = Date.now() - t.lastSeen <= TELEMETRY_STALE_MS;
    const cargo = Number.isFinite(t.loadcell) && t.loadcell > CARGO_THRESHOLD_G;
    const irValid = /^[01]{5}$/.test(t.ir);
    const atBase = irValid && t.ir === "11111" && (t.fsm === "IDLE" || t.fsm === "SELESAI" || t.mission === 0);
    const ultrasonicOk = Number.isFinite(t.distance) && t.distance > 0 && t.distance < 999;
    const ultrasonicWarn = Number.isFinite(t.distance) && t.distance >= 999;
    const obstacle = Number.isFinite(t.distance) && t.distance > 0 && t.distance < 15;
    const lineLost = irValid && t.ir === "00000";

    if (!t.mqtt && state.lastMqtt) state.counters.mqttLost++;
    if (obstacle && !state.lastObstacle) state.counters.obstacle++;
    if (lineLost && !state.lastLineLost) state.counters.lineLost++;
    state.lastMqtt = !!t.mqtt;
    state.lastObstacle = obstacle;
    state.lastLineLost = lineLost;
    renderCounters();

    setCheck("esp", fresh && t.online ? "ok" : "bad", fresh ? "Telemetry AGV masuk." : "Belum ada telemetry terbaru.");
    setCheck("mqtt", t.mqtt ? "ok" : "bad", t.mqtt ? "Firmware terhubung broker." : "MQTT belum terkonfirmasi.");
    setCheck("tare", state.taredSeen ? "ok" : "warn", state.taredSeen ? "Loadcell pernah terbaca nol." : "Tekan Tare saat kosong.");
    setCheck("cargo", cargo ? "ok" : "bad", cargo ? `${t.loadcell.toFixed(0)} g` : "Barang belum terdeteksi.");
    setCheck("ir", irValid ? "ok" : "bad", irValid ? `Pattern ${t.ir}` : "Pattern IR belum lengkap.");
    setCheck("ultrasonic", ultrasonicOk ? "ok" : ultrasonicWarn ? "warn" : "bad", ultrasonicWarn ? "999 cm: tidak ada pantulan." : "Cek jarak depan.");
    setCheck("base", atBase ? "ok" : "warn", atBase ? "AGV berada di blackbox base." : "Pastikan AGV start dari base.");

    const criticalReady = state.demoActive || (fresh && t.online && t.mqtt && cargo && irValid && (atBase || t.fsm !== "IDLE"));
    ["A", "B", "C"].forEach((dest) => {
      const btn = el(`btn-${dest}`);
      if (!btn) return;
      btn.disabled = !criticalReady || ["KEBERANGKATAN", "PULANG", "SAMPAI"].includes(t.fsm);
      btn.title = btn.disabled ? "Pre-flight belum aman untuk mulai misi." : "";
    });

    const summary = el("preflight-summary");
    if (summary) {
      summary.className = "preflight-summary " + (criticalReady ? "ok" : cargo ? "warn" : "bad");
      summary.textContent = state.demoActive
        ? "Demo Mode aktif: command disimulasikan di dashboard."
        : criticalReady
          ? "Ready: misi bisa dimulai."
          : cargo
            ? "Cek koneksi/base sebelum GOTO."
            : "Tahan GOTO: barang belum terdeteksi.";
    }
  }

  function renderCounters() {
    setText("cnt-mqtt-lost", state.counters.mqttLost);
    setText("cnt-obstacle", state.counters.obstacle);
    setText("cnt-line-lost", state.counters.lineLost);
  }

  function updateDecision() {
    const t = state.telemetry;
    let decision = "WAITING_FOR_COMMAND";
    let sub = "AGV siap menerima perintah.";

    if (!t.online || Date.now() - t.lastSeen > TELEMETRY_STALE_MS) {
      decision = "WAITING_FOR_TELEMETRY";
      sub = "Belum ada telemetry terbaru dari AGV.";
    } else if (Number.isFinite(t.distance) && t.distance > 0 && t.distance < 15) {
      decision = "AVOIDING_OBSTACLE";
      sub = `Obstacle terdeteksi ${t.distance.toFixed(0)} cm.`;
    } else if (window.currentMode === "MANUAL" || t.fsm === "MANUAL") {
      decision = "MANUAL_OVERRIDE";
      sub = "Dashboard sedang mengirim kontrol manual.";
    } else if (t.fsm === "MENUNGGU_BARANG") {
      decision = "WAITING_FOR_CARGO";
      sub = "Loadcell harus mendeteksi barang sebelum berangkat.";
    } else if (t.fsm === "KEBERANGKATAN") {
      decision = `FOLLOWING_LINE_TO_${missionName(t.mission)}`;
      sub = `Menuju titik ${missionName(t.mission)}, blackbox ${t.blackbox}.`;
    } else if (t.fsm === "SAMPAI") {
      decision = "WAITING_UNLOAD";
      sub = "Menunggu barang diambil dari loadcell.";
    } else if (t.fsm === "PULANG") {
      decision = "RETURNING_TO_BASE";
      sub = `Kembali dari titik ${missionName(t.mission)}.`;
    } else if (t.fsm === "SELESAI") {
      decision = "MISSION_COMPLETED";
      sub = "Misi selesai dan AGV kembali ke base.";
    } else if (t.fsm === "ERROR_STATE") {
      decision = "ERROR_RECOVERY_REQUIRED";
      sub = "Reset error setelah penyebabnya dicek.";
    }

    setText("current-decision", decision);
    setText("decision-sub", sub);
  }

  function addTimeline(label, tone = "") {
    if (!label) return;
    const last = state.timeline[0];
    if (last && last.label === label) return;
    state.timeline.unshift({ label, tone, ts: new Date() });
    state.timeline = state.timeline.slice(0, 12);
    renderTimeline();
  }

  function renderTimeline() {
    const list = el("mission-timeline");
    if (!list) return;
    if (!state.timeline.length) {
      list.innerHTML = '<div class="timeline-empty">Menunggu misi dimulai...</div>';
      return;
    }
    list.innerHTML = state.timeline
      .map((item) => {
        const time = item.ts.toLocaleTimeString("id-ID", { hour12: false });
        return `
          <div class="timeline-item ${item.tone}">
            <span class="timeline-dot"></span>
            <span>${item.label}</span>
            <span class="timeline-time">${time}</span>
          </div>
        `;
      })
      .join("");
  }

  function updateTimelineAndRoute() {
    const t = state.telemetry;
    const cargo = Number.isFinite(t.loadcell) && t.loadcell > CARGO_THRESHOLD_G;

    if (cargo && !state.lastCargo) addTimeline("Cargo loaded", "ok");
    if (!cargo && state.lastCargo && t.fsm === "SAMPAI") addTimeline("Cargo removed", "ok");

    if (t.fsm !== state.lastFsm || t.mission !== state.lastMission) {
      if (t.fsm === "KEBERANGKATAN") addTimeline(`Mission ${missionName(t.mission)} started`, "");
      if (t.fsm === "SAMPAI") addTimeline(`Arrived at ${missionName(t.mission)}`, "ok");
      if (t.fsm === "PULANG") addTimeline("Returning to base", "");
      if (t.fsm === "SELESAI") addTimeline("Mission completed", "ok");
      if (t.fsm === "ERROR_STATE") addTimeline("Error state entered", "warn");
    }
    if (t.waiting && (t.fsm !== state.lastFsm || t.waiting !== state.lastWaiting)) {
      addTimeline("Waiting cargo removal", "warn");
    }
    if (t.blackbox > state.lastBlackbox) {
      addTimeline(`Blackbox #${t.blackbox} detected`, "");
      if (t.fsm === "KEBERANGKATAN") {
        const node = t.blackbox === 1 ? "A" : t.blackbox === 2 ? "B" : t.blackbox === 3 ? "C" : "";
        if (node && typeof window.snapAGVToNode === "function") window.snapAGVToNode(node);
      } else if (t.fsm === "PULANG" && typeof window.snapAGVToNode === "function") {
        window.snapAGVToNode("BASE");
      }
    }

    state.lastCargo = cargo;
    state.lastFsm = t.fsm;
    state.lastMission = t.mission;
    state.lastBlackbox = t.blackbox;
    state.lastWaiting = t.waiting;
  }

  function updateCalibration() {
    const t = state.telemetry;
    setText("cal-loadcell", Number.isFinite(t.loadcell) ? `${Math.max(0, t.loadcell).toFixed(0)} g` : "- g");
    setText("cal-ir", t.ir || "-----");
    setText("cal-ultrasonic", Number.isFinite(t.distance) ? `${t.distance.toFixed(0)} cm` : "- cm");

    const irHint = el("cal-ir-hint");
    if (irHint) {
      irHint.className = "cal-hint";
      if (t.ir === "11111") {
        irHint.textContent = "Blackbox/base valid.";
        irHint.classList.add("ok");
      } else if (t.ir === "00100" || t.ir === "01110") {
        irHint.textContent = "Line center valid.";
        irHint.classList.add("ok");
      } else if (t.ir === "00000") {
        irHint.textContent = "Line lost, cek posisi sensor.";
        irHint.classList.add("bad");
      } else if (t.ir) {
        irHint.textContent = `Pattern ${t.ir} terbaca.`;
        irHint.classList.add("warn");
      } else {
        irHint.textContent = "Target: 00000 / 00100 / 11111";
      }
    }

    const ultraHint = el("cal-ultra-hint");
    if (ultraHint) {
      ultraHint.className = "cal-hint";
      if (Number.isFinite(t.distance) && t.distance > 0 && t.distance < 400) {
        ultraHint.textContent = "Ultrasonic merespons.";
        ultraHint.classList.add("ok");
      } else if (t.distance >= 999) {
        ultraHint.textContent = "No echo, coba dekatkan tangan.";
        ultraHint.classList.add("warn");
      } else {
        ultraHint.textContent = "Dekatkan tangan untuk validasi.";
      }
    }
  }

  window.opsHandleTelemetry = function (data) {
    normalizeTelemetry(data || {});
    evaluateChecks();
    updateDecision();
    updateTimelineAndRoute();
    updateCalibration();
  };

  window.opsHandleStatus = function (data) {
    if (data && data.online != null) {
      state.telemetry.online = !!data.online;
      state.telemetry.mqtt = !!data.online;
      if (data.online) state.telemetry.lastSeen = Date.now();
    }
    evaluateChecks();
    updateDecision();
  };

  window.opsHandleEvent = function (ev) {
    const code = ev?.code || "";
    if (code.includes("ESTOP")) addTimeline("Emergency stop triggered", "warn");
    if (code.includes("OBSTACLE")) {
      state.counters.obstacle++;
      renderCounters();
      addTimeline("Obstacle detected", "warn");
    }
    if (code.includes("LINE_LOST")) {
      state.counters.lineLost++;
      renderCounters();
      addTimeline("Line lost", "warn");
    }
  };

  window.confirmEmergencyStop = function () {
    if (window.confirm("Kirim EMERGENCY STOP ke AGV sekarang?")) {
      state.originalSendCmd?.("EMERGENCY_STOP");
      addTimeline("Emergency stop sent", "warn");
    }
  };

  function applyDemoFrame(frame) {
    const demoMission = frame.mission > 0 ? state.demoMission : 0;
    const data = {
      device_id: "demo",
      mqtt_connected: true,
      ...frame,
      mission: demoMission,
    };
    if (data.blackbox_count === 1 && (data.state === "KEBERANGKATAN" || data.state === "SAMPAI")) {
      data.blackbox_count = state.demoMission;
    }
    if (typeof applyState === "function") applyState(data.state);
    if (typeof applyDest === "function") applyDest(missionName(data.mission));
    if (typeof applyBlackbox === "function") applyBlackbox(data.blackbox_count || 0);
    if (typeof applyWaiting === "function") applyWaiting(!!data.waiting);
    if (typeof applyUS === "function") applyUS(data.distance_cm);
    if (typeof applyLC === "function") applyLC(data.loadcell_g);
    if (typeof applyIR === "function" && data.ir_pattern) {
      const bits = data.ir_pattern.split("");
      applyIR({ s1: bits[0], s2: bits[1], s3: bits[2], s4: bits[3], s5: bits[4] });
    }
    if (typeof setMQTTStatus === "function") setMQTTStatus(true);
    window.opsHandleTelemetry(data);
  }

  const demoFrames = [
    { state: "IDLE", mission: 0, blackbox_count: 0, waiting: false, distance_cm: 120, loadcell_g: 0, ir_pattern: "11111" },
    { state: "MENUNGGU_BARANG", mission: 1, blackbox_count: 0, waiting: false, distance_cm: 95, loadcell_g: 0, ir_pattern: "11111" },
    { state: "KEBERANGKATAN", mission: 1, blackbox_count: 0, waiting: false, distance_cm: 80, loadcell_g: 135, ir_pattern: "00100" },
    { state: "KEBERANGKATAN", mission: 1, blackbox_count: 1, waiting: false, distance_cm: 72, loadcell_g: 132, ir_pattern: "11111" },
    { state: "SAMPAI", mission: 1, blackbox_count: 1, waiting: true, distance_cm: 70, loadcell_g: 130, ir_pattern: "11111" },
    { state: "SAMPAI", mission: 1, blackbox_count: 1, waiting: true, distance_cm: 70, loadcell_g: 0, ir_pattern: "11111" },
    { state: "PULANG", mission: 1, blackbox_count: 0, waiting: false, distance_cm: 88, loadcell_g: 0, ir_pattern: "00100" },
    { state: "SELESAI", mission: 0, blackbox_count: 1, waiting: false, distance_cm: 105, loadcell_g: 0, ir_pattern: "11111" },
  ];

  window.toggleDemoMode = function () {
    state.demoActive = !state.demoActive;
    const btn = el("btn-demo-mode");
    if (btn) {
      btn.classList.toggle("active", state.demoActive);
      btn.setAttribute("aria-pressed", state.demoActive ? "true" : "false");
      btn.title = state.demoActive ? "Demo Mode aktif - klik untuk berhenti" : "Aktifkan simulasi dashboard";
      btn.innerHTML = state.demoActive
        ? '<i class="fa-solid fa-vial-circle-check icon"></i>Demo On'
        : '<i class="fa-solid fa-vial-circle-check icon"></i>Demo Mode';
    }

    if (state.demoTimer) {
      clearInterval(state.demoTimer);
      state.demoTimer = null;
    }

    if (state.demoActive) {
      state.timeline = [];
      state.demoMission = 1;
      state.demoStep = 0;
      applyDemoFrame(demoFrames[state.demoStep]);
      state.demoTimer = setInterval(() => {
        state.demoStep = (state.demoStep + 1) % demoFrames.length;
        applyDemoFrame(demoFrames[state.demoStep]);
      }, 1800);
      if (typeof toast === "function") toast("Demo Mode", "Simulasi telemetry aktif", "success", 2200);
    } else {
      if (typeof toast === "function") toast("Demo Mode", "Simulasi dimatikan", "info", 1800);
      evaluateChecks();
      updateDecision();
    }
  };

  if (typeof window.sendCmd === "function") {
    state.originalSendCmd = window.sendCmd;
    window.sendCmd = function (cmd) {
      if (state.demoActive && /^GOTO_/.test(cmd)) {
        const mission = cmd.endsWith("_A") ? 1 : cmd.endsWith("_B") ? 2 : 3;
        state.demoMission = mission;
        state.timeline = [];
        state.demoStep = 2;
        applyDemoFrame({ ...demoFrames[2], mission });
        if (typeof toast === "function") toast("Demo Mission", `Simulasi menuju ${missionName(mission)}`, "success", 1800);
        return;
      }

      if (/^GOTO_/.test(cmd)) {
        const checks = document.querySelectorAll(".preflight-item.bad");
        if (checks.length) {
          if (typeof toast === "function") toast("Pre-flight belum aman", "Cek checklist sebelum mulai misi.", "warning", 2500);
          return;
        }
      }
      state.originalSendCmd(cmd);
    };
  }

  document.addEventListener("DOMContentLoaded", () => {
    evaluateChecks();
    updateDecision();
    renderTimeline();
  });
})();
