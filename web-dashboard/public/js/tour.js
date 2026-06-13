/* ═══════════════════════════════════════════════════════════════════════════
   XORA TOUR — Cyberpunk User Guide Engine v2
   Tab-grouped flow · Transition screens · Correct selectors · Arrow fix
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const COOKIE_NAME = "xora_tour_done";
  const COOKIE_DAYS = 365;
  const HIGHLIGHT_PAD = 3;

  /* ── Tab Groups with Steps ─────────────────────────────────────────────── */
  const TAB_GROUPS = [
    {
      tab: "control",
      label: "Control",
      icon: "fa-gamepad",
      steps: [
        { target: "#panel-arena", title: "Arena Map", desc: "Peta arena AGV secara real-time. Titik <code>BASE</code>, <code>A</code>, <code>B</code>, <code>C</code> terlihat dengan marker AGV yang bergerak mengikuti posisi aktual.", pos: "right" },
        { target: "#mode-chips", title: "Mode Selector", desc: "<code>AUTO</code> = pengantaran otomatis. <code>MAN</code> = kontrol manual D-Pad. <code>JEMPUT</code> = mode penjemputan barang dari titik tujuan.", pos: "right" },
        { target: "#panel-commands .mission-section", title: "Mission Control", desc: "Pilih titik tujuan <code>A</code>, <code>B</code>, atau <code>C</code> untuk mengirim AGV. Tombol bisa dipencet meskipun barang belum terdeteksi.", pos: "left" },
        { target: ".pickup-section", title: "Penjemputan", desc: "Mode penjemputan: AGV langsung ke titik tujuan tanpa tunggu barang. Setelah sampai, AGV menunggu barang ditaruh lalu pulang ke base.", pos: "left" },
        { target: "#btn-manual-toggle", title: "Manual D-Pad", desc: "Kontrol manual dengan D-Pad atau keyboard <code>WASD</code> / <code>Arrow Keys</code>. Tahan tombol untuk bergerak, lepas untuk berhenti.", pos: "left" },
        { target: "#preflight-panel", title: "Pre-Flight Checklist", desc: "Status kesiapan AGV sebelum misi. Hijau = siap. Kuning = perlu perhatian. Merah = belum bisa jalan.", pos: "left" },
        { target: "#panel-log", title: "Mission Timeline", desc: "Log aktivitas misi secara real-time. Setiap perubahan state, blackbox detection, dan event penting tercatat di sini.", pos: "left" },
        { target: "#btn-alive-mode", title: "Alive & Demo Mode", desc: "<code>Alive</code>: AGV bergerak natural saat idle. <code>Demo</code>: simulasi telemetry tanpa AGV fisik.", pos: "bottom" },
      ],
    },
    {
      tab: "sensors",
      label: "Sensors Live",
      icon: "fa-satellite-dish",
      steps: [
        { target: ".sensor-big-card:nth-child(1)", title: "Ultrasonic HC-SR04", desc: "Sensor jarak depan. Range <code>0-200cm</code>. Obstacle terdeteksi di bawah <code>25cm</code>. Warna merah = bahaya.", pos: "bottom" },
        { target: ".sensor-big-card:nth-child(2)", title: "IR Line Follower", desc: "5 channel IR sensor: <code>IR-L</code>, <code>LN-L</code>, <code>LN-M</code>, <code>LN-R</code>, <code>IR-R</code>. Pattern <code>11111</code> = blackbox.", pos: "bottom" },
        { target: ".sensor-big-card:nth-child(3)", title: "Load Cell HX711", desc: "Sensor berat barang. Threshold: <code>50g</code> = barang terdeteksi. Tombol <code>Tare</code> untuk kalibrasi nol.", pos: "bottom" },
        { target: ".sensor-big-card:nth-child(5)", title: "Battery Monitor", desc: "Monitor battery AGV. Warna hijau >40%, kuning >20%, merah ≤20%. Voltage dan sparkline tersedia.", pos: "bottom" },
        { target: ".calibration-panel", title: "Calibration Bench", desc: "Referensi pattern IR dan panduan kalibrasi. Gunakan ini untuk verifikasi pembacaan sensor.", pos: "top" },
      ],
    },
    {
      tab: "analytics",
      label: "Analytics",
      icon: "fa-chart-bar",
      steps: [
        { target: "#page-analytics .range-row", title: "Time Range Selector", desc: "Pilih rentang waktu: <code>1H</code> (1 jam), <code>24H</code> (24 jam), <code>7D</code> (7 hari). Semua grafik menyesuaikan.", pos: "bottom" },
        { target: "#page-analytics .stats-row", title: "Stat Cards", desc: "Ringkasan: total events, deliveries sukses, error count, total events. Angka update real-time dari database.", pos: "bottom" },
        { target: "#page-analytics .chart-grid", title: "Event & State Charts", desc: "Grafik distribusi event dan state timeline. Hover untuk detail.", pos: "bottom" },
        { target: ".err-list-card", title: "Error Summary Table", desc: "Tabel error dan warning terbaru. Filter by time range. Berguna untuk troubleshooting.", pos: "top" },
      ],
    },
    {
      tab: "missions",
      label: "Missions",
      icon: "fa-truck-fast",
      steps: [
        { target: "#page-missions .stats-row", title: "Mission Statistics", desc: "Stat: total misi, completed, failed, rata-rata durasi, success rate. Data dari tabel <code>agv_missions</code>.", pos: "bottom" },
        { target: "#page-missions .range-row", title: "Filters & Range", desc: "Filter berdasarkan destination (A/B/C), status (completed/failed), dan time range.", pos: "bottom" },
        { target: "#mission-wrap", title: "Mission Log Table", desc: "Log lengkap semua misi. Setiap misi tercatat dengan timestamp, status, durasi, dan berat barang.", pos: "top" },
        { target: "#page-missions .page-actions", title: "Export CSV", desc: "Export data misi ke format CSV untuk analisis lebih lanjut di spreadsheet.", pos: "left" },
      ],
    },
    {
      tab: "eventlog",
      label: "Event Log",
      icon: "fa-clipboard-list",
      steps: [
        { target: "#page-eventlog .range-row", title: "Source Filter & Range", desc: "Filter berdasarkan sumber: <code>ESP32</code> (firmware) atau <code>Dashboard</code> (web). Time range selector.", pos: "bottom" },
        { target: "#evlog-filter", title: "Search Events", desc: "Search by code, message, state, atau destination. Real-time filtering.", pos: "bottom" },
        { target: "#evlog-wrap", title: "Event Table", desc: "Tabel event dengan kolom: timestamp, code, message, state, destination. Pagination tersedia.", pos: "top" },
        { target: "#page-eventlog .page-actions", title: "Export CSV & PDF", desc: "Export data event ke CSV atau PDF untuk reporting dan dokumentasi.", pos: "left" },
      ],
    },
    {
      tab: "system",
      label: "System",
      icon: "fa-microchip",
      steps: [
        { target: ".system-card:nth-child(1)", title: "Connection Status", desc: "Status koneksi: <code>WebSocket</code> (browser↔server), <code>MQTT</code> (server↔broker), <code>Database</code> (server↔PostgreSQL).", pos: "bottom" },
        { target: ".system-card:nth-child(2)", title: "AGV State Monitor", desc: "State, destination, mode, blackbox count, waiting status, obstacle, battery — semua info AGV di satu kartu.", pos: "bottom" },
        { target: ".system-card:nth-child(4)", title: "Server & Device", desc: "Info server: uptime, Node.js version, platform, total events/logs. Berguna untuk monitoring.", pos: "bottom" },
        { target: ".system-card:nth-child(5)", title: "Security Status", desc: "Status keamanan: bcrypt, CSRF, rate limiting, WS auth, Helmet CSP. Semua harus hijau.", pos: "top" },
      ],
    },
    {
      tab: "settings",
      label: "Settings",
      icon: "fa-gear",
      steps: [
        { target: ".settings-card:nth-child(1)", title: "Appearance", desc: "3 tema: <code>Cyberpunk</code>, <code>XORA</code>, <code>Tableau</code>. Accent color, font size, sidebar collapse, sparklines.", pos: "bottom" },
        { target: ".settings-card:nth-child(2)", title: "Alerts & Notifications", desc: "Atur: sound effects, toast popups, error alerts, arrival alerts. Matikan jika terasa mengganggu.", pos: "bottom" },
        { target: ".settings-card:nth-child(3)", title: "Change Password", desc: "Ganti password akun. Minimal 8 karakter. Di-hash dengan bcrypt (12 salt rounds).", pos: "bottom" },
        { target: ".settings-card:nth-child(4)", title: "Session & Logout", desc: "Info session aktif dan tombol logout. Session berlaku 8 jam.", pos: "top" },
      ],
    },
    {
      tab: "roboeyes",
      label: "Robo Eyes",
      icon: "fa-eye",
      steps: [
        { target: "#eyes-container", title: "Expression Display", desc: "Video ekspresi berubah otomatis sesuai state AGV. <code>ready</code> (idle), <code>moving</code> (jalan), <code>error</code> (masalah).", pos: "bottom" },
        { target: ".eyes-map", title: "Expression Map", desc: "Referensi mapping: IDLE→ready, KEBERANGKATAN→moving, ERROR→error. Tersedia mode fullscreen.", pos: "top" },
      ],
    },
    {
      tab: "simulation3d",
      label: "3D Simulation",
      icon: "fa-cube",
      steps: [
        { target: "#sim3d-iframe", title: "3D World", desc: "Visualisasi 3D dunia AGV menggunakan Three.js + Rapier3D. Di-embed dari Folio server via iframe.", pos: "bottom" },
        { target: "#page-simulation3d .page-actions", title: "Sim Controls", desc: "<code>Fullscreen</code>, <code>Open in Tab</code>, <code>Reload</code>. Jika Folio server tidak jalan, muncul fallback UI.", pos: "bottom" },
      ],
    },
  ];

  /* ── State ─────────────────────────────────────────────────────────────── */
  let groupIdx = 0;
  let stepIdx = 0;
  let overlay, highlight, tooltip, cookieBanner, transitionScreen;
  let isActive = false;

  /* ── Cookie helpers ────────────────────────────────────────────────────── */
  function setCookie(name, days) {
    const d = new Date();
    d.setTime(d.getTime() + days * 86400000);
    document.cookie = `${name}=1;expires=${d.toUTCString()};path=/;SameSite=Lax`;
  }
  function getCookie(name) {
    return document.cookie.split(";").some((c) => c.trim().startsWith(name + "="));
  }

  /* ── Total steps count ─────────────────────────────────────────────────── */
  function totalSteps() {
    return TAB_GROUPS.reduce((n, g) => n + g.steps.length, 0);
  }
  function currentGlobalStep() {
    let n = 0;
    for (let i = 0; i < groupIdx; i++) n += TAB_GROUPS[i].steps.length;
    return n + stepIdx;
  }

  /* ── Create DOM ────────────────────────────────────────────────────────── */
  function createDOM() {
    // Overlay + highlight
    overlay = document.createElement("div");
    overlay.className = "tour-overlay";
    overlay.innerHTML = '<div class="tour-highlight"></div>';
    highlight = overlay.querySelector(".tour-highlight");
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) nextStep();
    });
    document.body.appendChild(overlay);

    // Tooltip
    tooltip = document.createElement("div");
    tooltip.className = "tour-tooltip";
    tooltip.innerHTML = `
      <div class="tour-arrow"></div>
      <div class="tour-header">
        <div class="tour-header-left">
          <span class="tour-step-badge"></span>
          <span class="tour-tab-badge"></span>
        </div>
        <button class="tour-close" title="Close tour">&times;</button>
      </div>
      <div class="tour-body">
        <div class="tour-title"></div>
        <div class="tour-desc"></div>
      </div>
      <div class="tour-progress">
        <div class="tour-progress-bar"><div class="tour-progress-fill"></div></div>
      </div>
      <div class="tour-footer">
        <div class="tour-dots"></div>
        <div class="tour-nav">
          <button class="tour-btn" data-action="prev">Prev</button>
          <button class="tour-btn primary" data-action="next">Next</button>
        </div>
      </div>
    `;
    document.body.appendChild(tooltip);

    // Transition tooltip (reuses tooltip styling, no full-screen overlay)
    transitionScreen = document.createElement("div");
    transitionScreen.className = "tour-tooltip tour-transition-tip";
    transitionScreen.setAttribute("data-pos", "right");
    transitionScreen.innerHTML = `
      <div class="tour-arrow"></div>
      <div class="tour-body" style="padding:14px 16px;">
        <div class="tour-title" style="font-size:12px;margin-bottom:4px;">
          <i class="fa-solid fa-circle-check" style="color:var(--clr-green,#22c55e);margin-right:6px;"></i>
          <span class="tour-trans-label"></span>
        </div>
        <div class="tour-desc" style="margin-bottom:12px;">
          <span class="tour-trans-next-label"></span>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="tour-btn" data-action="trans-no">Selesai</button>
          <button class="tour-btn primary" data-action="trans-yes">Lanjut</button>
        </div>
      </div>
    `;
    document.body.appendChild(transitionScreen);

    // Cookie banner
    cookieBanner = document.createElement("div");
    cookieBanner.className = "tour-cookie";
    cookieBanner.innerHTML = `
      <div class="tour-cookie-icon"><i class="fa-solid fa-route"></i></div>
      <div class="tour-cookie-text">
        <h4>Welcome to XORA AGV Control Terminal</h4>
        <p>Mau dikenalkan dengan fitur-fitur dashboard? Tour akan memandu kamu melalui setiap halaman dan kontrol.</p>
      </div>
      <div class="tour-cookie-actions">
        <button class="tour-cookie-btn decline">Nanti Saja</button>
        <button class="tour-cookie-btn accept">Mulai Tour</button>
      </div>
    `;
    document.body.appendChild(cookieBanner);

    // Event listeners
    tooltip.querySelector(".tour-close").addEventListener("click", closeTour);
    tooltip.querySelector('[data-action="prev"]').addEventListener("click", prevStep);
    tooltip.querySelector('[data-action="next"]').addEventListener("click", nextStep);
    transitionScreen.querySelector('[data-action="trans-yes"]').addEventListener("click", transAccept);
    transitionScreen.querySelector('[data-action="trans-no"]').addEventListener("click", transDecline);
    cookieBanner.querySelector(".accept").addEventListener("click", acceptCookie);
    cookieBanner.querySelector(".decline").addEventListener("click", declineCookie);

    document.addEventListener("keydown", handleKey);
  }

  /* ── Keyboard ──────────────────────────────────────────────────────────── */
  function handleKey(e) {
    if (!isActive) return;
    if (e.key === "Escape") closeTour();
    if (e.key === "ArrowRight" || e.key === "Enter") nextStep();
    if (e.key === "ArrowLeft") prevStep();
  }

  /* ── Cookie banner ─────────────────────────────────────────────────────── */
  function showCookieBanner() {
    if (getCookie(COOKIE_NAME)) return;
    setTimeout(() => cookieBanner.classList.add("visible"), 800);
  }
  function acceptCookie() {
    setCookie(COOKIE_NAME, COOKIE_DAYS);
    cookieBanner.classList.remove("visible");
    setTimeout(() => startTour(), 400);
  }
  function declineCookie() {
    setCookie(COOKIE_NAME, COOKIE_DAYS);
    cookieBanner.classList.remove("visible");
  }

  /* ── Tour control ──────────────────────────────────────────────────────── */
  function startTour(gi, si) {
    groupIdx = gi || 0;
    stepIdx = si || 0;
    isActive = true;
    overlay.classList.add("active");
    showCurrentStep();
  }

  function closeTour() {
    isActive = false;
    overlay.classList.remove("active");
    tooltip.classList.remove("visible");
    transitionScreen.classList.remove("visible");
    highlight.classList.remove("no-overlay");
    highlight.style.cssText = "width:0;height:0;left:-9999px;top:-9999px;";
  }

  function nextStep() {
    const group = TAB_GROUPS[groupIdx];
    if (!group) { closeTour(); return; }

    if (stepIdx < group.steps.length - 1) {
      // Next step in same group
      stepIdx++;
      showCurrentStep();
    } else if (groupIdx < TAB_GROUPS.length - 1) {
      // Last step of group — show transition
      showTransition();
    } else {
      // Last step of last group — done
      closeTour();
    }
  }

  function prevStep() {
    if (stepIdx > 0) {
      stepIdx--;
      showCurrentStep();
    } else if (groupIdx > 0) {
      // Go to last step of previous group
      groupIdx--;
      stepIdx = TAB_GROUPS[groupIdx].steps.length - 1;
      showCurrentStep();
    }
  }

  /* ── Transition: highlight next tab nav item ───────────────────────────── */
  function showTransition() {
    tooltip.classList.remove("visible");
    overlay.classList.remove("active");
    highlight.classList.add("no-overlay"); // no dark box-shadow

    const nextGroup = TAB_GROUPS[groupIdx + 1];
    if (!nextGroup) { closeTour(); return; }

    // On mobile, open sidebar drawer so user can see the nav item
    const isMobile = window.innerWidth <= 768;
    const sidebar = document.getElementById("sidebar");
    if (isMobile && sidebar) {
      sidebar.classList.add("open");
      // Add backdrop
      const bd = document.querySelector(".sidebar-backdrop");
      if (bd) bd.classList.add("active");
    }

    // Highlight the next tab's nav item in sidebar
    const navTarget = document.querySelector(`.nav-item[data-page="${nextGroup.tab}"]`);
    if (!navTarget) { closeTour(); return; }

    // Position highlight on nav item (wait a bit if sidebar just opened)
    const positionHighlightOnNav = () => {
      const rect = navTarget.getBoundingClientRect();
      const p = HIGHLIGHT_PAD;
      highlight.style.left = (rect.left - p) + "px";
      highlight.style.top = (rect.top - p) + "px";
      highlight.style.width = (rect.width + p * 2) + "px";
      highlight.style.height = (rect.height + p * 2) + "px";
    };

    if (isMobile) {
      setTimeout(positionHighlightOnNav, 320); // wait for sidebar animation
    } else {
      positionHighlightOnNav();
    }

    // Update transition tooltip content
    const labelEl = transitionScreen.querySelector(".tour-trans-label");
    const nextLabelEl = transitionScreen.querySelector(".tour-trans-next-label");
    const yesBtn = transitionScreen.querySelector('[data-action="trans-yes"]');
    const noBtn = transitionScreen.querySelector('[data-action="trans-no"]');

    labelEl.textContent = `Tab ${TAB_GROUPS[groupIdx].label} selesai!`;
    nextLabelEl.innerHTML = nextGroup
      ? `Lanjut ke <code>${nextGroup.label}</code>?`
      : "Semua tab sudah dikenalkan!";

    yesBtn.textContent = nextGroup ? `Lanjut` : "Tutup";
    noBtn.textContent = "Selesai";
    yesBtn.style.display = "";

    // Position tooltip — on mobile CSS handles it (bottom center), desktop: right of nav item
    if (!isMobile) {
      const gap = 12;
      const tipW = 280;
      const tipH = transitionScreen.offsetHeight || 120;
      const navRect = navTarget.getBoundingClientRect();
      let left = navRect.right + gap;
      let top = navRect.top + navRect.height / 2 - tipH / 2;

      top = Math.max(8, Math.min(top, window.innerHeight - tipH - 8));
      if (left + tipW > window.innerWidth - 8) left = navRect.left - gap - tipW;

      transitionScreen.style.left = left + "px";
      transitionScreen.style.top = top + "px";
      transitionScreen.style.width = tipW + "px";

      // Arrow points to nav item
      const arrow = transitionScreen.querySelector(".tour-arrow");
      arrow.style.cssText = "";
      const arrowY = Math.max(14, Math.min(navRect.top + navRect.height / 2 - top, tipH - 14));
      arrow.style.top = arrowY + "px";
    } else {
      // Mobile: reset inline styles, let CSS handle positioning
      transitionScreen.style.left = "";
      transitionScreen.style.top = "";
      transitionScreen.style.width = "";
      transitionScreen.style.bottom = "";
    }

    transitionScreen.classList.add("visible");
  }

  function transAccept() {
    transitionScreen.classList.remove("visible");
    overlay.classList.add("active");
    highlight.classList.remove("no-overlay");

    // Close sidebar on mobile if we opened it
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.remove("open");
    const bd = document.querySelector(".sidebar-backdrop");
    if (bd) bd.classList.remove("active");

    groupIdx++;
    stepIdx = 0;
    const group = TAB_GROUPS[groupIdx];
    if (group && typeof window.navTo === "function") {
      window.navTo(group.tab);
    }
    setTimeout(() => showCurrentStep(), 200);
  }

  function transDecline() {
    transitionScreen.classList.remove("visible");
    // Close sidebar on mobile if we opened it
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.remove("open");
    const bd = document.querySelector(".sidebar-backdrop");
    if (bd) bd.classList.remove("active");
    closeTour();
  }

  /* ── Show current step ─────────────────────────────────────────────────── */
  function showCurrentStep() {
    const group = TAB_GROUPS[groupIdx];
    if (!group) { closeTour(); return; }
    const step = group.steps[stepIdx];
    if (!step) { closeTour(); return; }

    // Hide tooltip during transition
    tooltip.classList.remove("visible");

    // Navigate to tab if needed
    const currentPage = document.querySelector(".page-view.active")?.id?.replace("page-", "");
    if (group.tab && group.tab !== currentPage) {
      if (typeof window.navTo === "function") window.navTo(group.tab);
    }

    // Wait for tab render
    setTimeout(() => {
      const target = document.querySelector(step.target);
      if (!target) {
        // Skip to next step if target not found
        if (stepIdx < group.steps.length - 1) {
          stepIdx++;
          showCurrentStep();
        } else if (groupIdx < TAB_GROUPS.length - 1) {
          showTransition();
        } else {
          closeTour();
        }
        return;
      }

      // Scroll into view first
      const rect = target.getBoundingClientRect();
      const needsScroll = rect.top < 0 || rect.bottom > window.innerHeight;
      if (needsScroll) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => positionAndShow(target, step, group), 320);
      } else {
        positionAndShow(target, step, group);
      }
    }, 120);
  }

  /* ── Position highlight + tooltip ───────────────────────────────────────── */
  function positionAndShow(target, step, group) {
    // Highlight
    const rect = target.getBoundingClientRect();
    const p = HIGHLIGHT_PAD;
    highlight.style.left = (rect.left - p) + "px";
    highlight.style.top = (rect.top - p) + "px";
    highlight.style.width = (rect.width + p * 2) + "px";
    highlight.style.height = (rect.height + p * 2) + "px";

    // Tooltip content
    const global = currentGlobalStep();
    const total = totalSteps();
    const stepBadge = tooltip.querySelector(".tour-step-badge");
    const tabBadge = tooltip.querySelector(".tour-tab-badge");
    const titleEl = tooltip.querySelector(".tour-title");
    const descEl = tooltip.querySelector(".tour-desc");
    const progressFill = tooltip.querySelector(".tour-progress-fill");
    const prevBtn = tooltip.querySelector('[data-action="prev"]');
    const nextBtn = tooltip.querySelector('[data-action="next"]');

    stepBadge.textContent = `${global + 1}/${total}`;
    tabBadge.textContent = group.label.toUpperCase();
    titleEl.textContent = step.title;
    titleEl.classList.add("glitch");
    setTimeout(() => titleEl.classList.remove("glitch"), 350);
    descEl.innerHTML = step.desc;
    progressFill.style.width = ((global + 1) / total * 100) + "%";
    prevBtn.disabled = groupIdx === 0 && stepIdx === 0;

    const isLastStep = groupIdx === TAB_GROUPS.length - 1 && stepIdx === group.steps.length - 1;
    const isLastInGroup = stepIdx === group.steps.length - 1;
    nextBtn.textContent = isLastStep ? "Selesai" : isLastInGroup ? "Lanjut →" : "Next";

    // Dots — only for current group
    const dotsEl = tooltip.querySelector(".tour-dots");
    dotsEl.innerHTML = group.steps.map((_, i) => {
      let cls = "tour-dot";
      if (i === stepIdx) cls += " active";
      else if (i < stepIdx) cls += " done";
      return `<div class="${cls}"></div>`;
    }).join("");

    // Position tooltip
    positionTooltip(target, step.pos || "bottom");

    tooltip.classList.add("visible");
  }

  /* ── Position tooltip with correct arrow ────────────────────────────────── */
  function positionTooltip(target, preferredPos) {
    const rect = target.getBoundingClientRect();
    const gap = 12;
    const tw = 340;
    const th = tooltip.offsetHeight || 200;

    let pos = preferredPos;
    let left, top;

    // Fallback if not enough space
    if (pos === "bottom" && rect.bottom + gap + th > window.innerHeight) pos = "top";
    if (pos === "top" && rect.top - gap - th < 0) pos = "bottom";
    if (pos === "left" && rect.left - gap - tw < 0) pos = "right";
    if (pos === "right" && rect.right + gap + tw > window.innerWidth) pos = "left";

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    switch (pos) {
      case "bottom":
        left = cx - tw / 2;
        top = rect.bottom + gap;
        break;
      case "top":
        left = cx - tw / 2;
        top = rect.top - gap - th;
        break;
      case "left":
        left = rect.left - gap - tw;
        top = cy - th / 2;
        break;
      case "right":
        left = rect.right + gap;
        top = cy - th / 2;
        break;
    }

    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - th - 8));

    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
    tooltip.setAttribute("data-pos", pos);

    // Arrow — points toward target center
    const arrow = tooltip.querySelector(".tour-arrow");
    arrow.style.cssText = ""; // reset

    if (pos === "bottom" || pos === "top") {
      const arrowX = Math.max(14, Math.min(cx - left, tw - 14));
      arrow.style.left = arrowX + "px";
    } else {
      const arrowY = Math.max(14, Math.min(cy - top, th - 14));
      arrow.style.top = arrowY + "px";
    }
  }

  /* ── Replay from specific tab ──────────────────────────────────────────── */
  function startFromTab(tabName) {
    const gi = TAB_GROUPS.findIndex((g) => g.tab === tabName);
    if (gi >= 0) startTour(gi, 0);
    else startTour(0, 0);
  }

  /* ── Public API ────────────────────────────────────────────────────────── */
  window.XORA_TOUR = {
    start: startTour,
    startFromTab: startFromTab,
    close: closeTour,
    showCookie: showCookieBanner,
  };

  /* ── Init ──────────────────────────────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", () => {
    createDOM();
    if (!getCookie(COOKIE_NAME)) showCookieBanner();
  });
})();
