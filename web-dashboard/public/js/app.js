/* ══════════════════════════════════════════════════════════════════════════════
   APP.JS — Init, Settings, Theme Switcher, Toast, Sound, Clock, Dropdown
══════════════════════════════════════════════════════════════════════════════ */

/* ── Globals (shared across modules) ────────────────────────────────────── */
window.XA = {
  soundEnabled: true,
  currentTheme: "cyberpunk",
  currentAccent: "#00d4ff",
  audioCtx: null,
};

/* ══════════════════════════════════════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Load saved settings (theme, accent, font size, etc)
  loadSettings();

  // 3. Fetch session user
  await fetchMe();

  // 4. Init sparklines
  initSparklines();

  // 5. Connect WebSocket
  connectWS();

  // 6. Start clock
  startClock();

  // 7. Bind all UI events
  bindUI();
});

/* ══════════════════════════════════════════════════════════════════════════════
   CLOCK & UPTIME
══════════════════════════════════════════════════════════════════════════════ */
const bootTime = Date.now();

function startClock() {
  function tick() {
    const now = new Date();
    const el = document.getElementById("h-clock");
    if (el) el.textContent = now.toLocaleTimeString("en-US", { hour12: false });

    const up = Math.floor((Date.now() - bootTime) / 1000);
    const h = Math.floor(up / 3600);
    const m = Math.floor((up % 3600) / 60);
    const upEl = document.getElementById("sf-uptime");
    if (upEl) upEl.textContent = `UP: ${h}h${String(m).padStart(2, "0")}m`;
  }
  tick();
  setInterval(tick, 1000);
}

/* ══════════════════════════════════════════════════════════════════════════════
   SESSION / AUTH
══════════════════════════════════════════════════════════════════════════════ */
window.sessionUser = {};

async function fetchMe() {
  try {
    const r = await fetch("/api/me");
    if (!r.ok) {
      window.location.href = "/login";
      return;
    }
    window.sessionUser = await r.json();
    const u = window.sessionUser;
    const hUser = document.getElementById("h-username");
    const sUser = document.getElementById("sys-user");
    const sLogin = document.getElementById("sys-login-at");
    if (hUser) hUser.textContent = u.username || "—";
    if (sUser) sUser.textContent = u.username || "—";
    if (sLogin)
      sLogin.textContent = u.loginAt
        ? new Date(u.loginAt).toLocaleString()
        : "—";
  } catch {
    window.location.href = "/login";
  }
}

window.fetchCSRF = async function () {
  const r = await fetch("/api/csrf-token");
  return (await r.json()).csrfToken;
};

window.doLogout = async function () {
  try {
    const csrf = await fetchCSRF();
    await fetch("/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    });
  } catch {}
  window.location.href = "/login";
};

/* ══════════════════════════════════════════════════════════════════════════════
   SOUND
══════════════════════════════════════════════════════════════════════════════ */
function getAudio() {
  if (!XA.audioCtx)
    XA.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return XA.audioCtx;
}

window.beep = function (freq = 440, type = "sine", dur = 0.15, vol = 0.3) {
  if (!XA.soundEnabled) return;
  try {
    const ac = getAudio();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.start();
    osc.stop(ac.currentTime + dur);
  } catch {}
};

window.beepError = () => {
  beep(220, "sawtooth", 0.3, 0.4);
  setTimeout(() => beep(180, "sawtooth", 0.3, 0.4), 200);
};
window.beepSuccess = () => {
  beep(880, "sine", 0.1, 0.2);
  setTimeout(() => beep(1100, "sine", 0.15, 0.2), 120);
};
window.beepWarn = () => {
  beep(440, "triangle", 0.2, 0.3);
};

/* ══════════════════════════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════════════════════════ */
const TOAST_ICONS = {
  info: "fa-circle-info",
  success: "fa-circle-check",
  warning: "fa-triangle-exclamation",
  error: "fa-circle-exclamation",
};
const TOAST_DUR = { info: 3500, success: 3000, warning: 4500, error: 6000 };

window.toast = function (title, msg = "", type = "info", dur) {
  const toastToggle = document.getElementById("toggle-toast");
  if (toastToggle && !toastToggle.checked && type !== "error") return;

  const d = dur || TOAST_DUR[type] || 3500;
  const el = document.createElement("div");
  el.className = `toast ${type}`;

  el.innerHTML = `
    <i class="fa-solid ${TOAST_ICONS[type] || "fa-circle-info"} toast-icon icon"></i>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ""}
    </div>
    <button class="toast-close" aria-label="close">
      <i class="fa-solid fa-xmark icon icon-sm"></i>
    </button>
    <div class="toast-timer"></div>
  `;

  const closeBtn = el.querySelector(".toast-close");
  closeBtn.addEventListener("click", () => removeToast(el));

  document.getElementById("toast-container").appendChild(el);

  // Animate timer bar
  const timer = el.querySelector(".toast-timer");
  timer.style.transitionDuration = d + "ms";
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      timer.style.width = "0%";
    }),
  );

  setTimeout(() => removeToast(el), d);
};

window.removeToast = function (el) {
  if (!el || !el.parentElement) return;
  el.classList.add("removing");
  el.addEventListener("animationend", () => el.remove(), { once: true });
};

/* ══════════════════════════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════════════════════════ */
window.navTo = function (page) {
  document
    .querySelectorAll(".nav-item")
    .forEach((i) => i.classList.remove("active"));
  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add("active");

  document
    .querySelectorAll(".page-view")
    .forEach((p) => p.classList.remove("active"));
  const pageEl = document.getElementById("page-" + page);
  if (pageEl) pageEl.classList.add("active");

  // Mobile: close sidebar
  if (window.innerWidth <= 768)
    document.getElementById("sidebar").classList.remove("open");

  // Lazy load analytics / eventlog
  if (page === "analytics" || page === "eventlog") loadAnalytics();

  // Clear error badge when visiting eventlog
  if (page === "eventlog") {
    const badge = document.getElementById("err-badge");
    if (badge) badge.style.display = "none";
  }
};

/* ══════════════════════════════════════════════════════════════════════════════
   THEME SWITCHER
══════════════════════════════════════════════════════════════════════════════ */
window.switchTheme = function (theme) {
  if (XA.currentTheme === theme) return;

  const overlay = document.getElementById("theme-transition");
  const ttLabel = document.getElementById("tt-label");
  const ttSub = document.getElementById("tt-sub");
  const html = document.documentElement;

  const labels = {
    cyberpunk: {
      label: "LOADING CYBERPUNK",
      sub: "Injecting neon render engine...",
    },
    tableau: {
      label: "LOADING TABLEAU",
      sub: "Initializing formal layout engine...",
    },
  };

  ttLabel.textContent = labels[theme]?.label || "SWITCHING THEME";
  ttSub.textContent = labels[theme]?.sub || "Please wait...";

  // Step 1: show overlay
  overlay.classList.add("active");

  setTimeout(() => {
    // Step 2: swap theme attribute
    html.setAttribute("data-theme", theme);
    XA.currentTheme = theme;

    // Step 3: toggle stylesheet disabled state
    const cpSheet = document.getElementById("theme-cyberpunk");
    const tbSheet = document.getElementById("theme-tableau");
    if (cpSheet) cpSheet.disabled = theme !== "cyberpunk";
    if (tbSheet) tbSheet.disabled = theme !== "tableau";

    // Step 4: show/hide accent picker (only for cyberpunk)
    const accentField = document.getElementById("accent-field");
    if (accentField)
      accentField.style.display = theme === "cyberpunk" ? "" : "none";

    // Step 5: update theme-opt active state
    document.querySelectorAll(".theme-opt").forEach((opt) => {
      opt.classList.toggle("active", opt.dataset.theme === theme);
    });

    // Step 7: save settings
    saveSettings();

    // Step 8: hide overlay after render
    setTimeout(() => {
      overlay.classList.remove("active");
      toast(
        theme === "cyberpunk" ? "Cyberpunk Theme" : "Tableau Theme",
        "Theme applied successfully",
        "success",
        2000,
      );
    }, 500);
  }, 400);
};

/* ══════════════════════════════════════════════════════════════════════════════
   ACCENT COLOR (cyberpunk only)
══════════════════════════════════════════════════════════════════════════════ */
window.applyAccent = function (color, save = true) {
  if (XA.currentTheme !== "cyberpunk") return;

  // Map hex to named data-accent for CSS overrides
  const accentMap = {
    "#00d4ff": "cyan",
    "#00ff88": "green",
    "#a855f7": "purple",
    "#ffb300": "amber",
    "#ff3366": "red",
    "#06b6d4": "teal",
  };

  const html = document.documentElement;

  // If named accent exists, use CSS class override
  const named = accentMap[color];
  if (named && named !== "cyan") {
    html.setAttribute("data-accent", named);
  } else {
    html.removeAttribute("data-accent");
    // For cyan or unknown, set CSS var directly
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    html.style.setProperty("--accent", color);
    html.style.setProperty("--accent-dim", `rgba(${r},${g},${b},0.25)`);
    html.style.setProperty("--accent-glow", `rgba(${r},${g},${b},0.12)`);
    html.style.setProperty("--accent-glow2", `rgba(${r},${g},${b},0.06)`);
    html.style.setProperty("--brand-glow", `0 0 20px rgba(${r},${g},${b},0.5)`);
  }

  XA.currentAccent = color;

  document
    .querySelectorAll(".color-swatch")
    .forEach((s) => s.classList.toggle("active", s.dataset.color === color));

  if (save) saveSettings();
};

/* ══════════════════════════════════════════════════════════════════════════════
   FONT SIZE
══════════════════════════════════════════════════════════════════════════════ */
window.applyFontSize = function (size, save = true) {
  document.documentElement.style.setProperty("--font-size-base", size + "px");
  document.documentElement.style.fontSize = size + "px";
  document
    .querySelectorAll(".font-btn")
    .forEach((b) =>
      b.classList.toggle("active", parseInt(b.dataset.size) === size),
    );
  if (save) saveSettings();
};

/* ══════════════════════════════════════════════════════════════════════════════
   SETTINGS PERSIST
══════════════════════════════════════════════════════════════════════════════ */
function saveSettings() {
  const s = {
    theme: XA.currentTheme,
    accent: XA.currentAccent,
    fontSize: parseInt(
      document.querySelector(".font-btn.active")?.dataset.size || "13",
    ),
    sidebarCollapsed: document
      .getElementById("app")
      ?.classList.contains("sb-col"),
    sound: XA.soundEnabled,
    sparklines: document.getElementById("toggle-sparklines")?.checked ?? true,
    toastEnabled: document.getElementById("toggle-toast")?.checked ?? true,
    alertError: document.getElementById("toggle-alert-error")?.checked ?? true,
    alertArrived:
      document.getElementById("toggle-alert-arrived")?.checked ?? true,
  };
  try {
    localStorage.setItem("xora-settings", JSON.stringify(s));
  } catch {}
}
window.saveSettings = saveSettings;

function loadSettings() {
  let s = {};
  try {
    s = JSON.parse(localStorage.getItem("xora-settings") || "{}");
  } catch {}

  // Theme
  const theme = s.theme || "cyberpunk";
  document.documentElement.setAttribute("data-theme", theme);
  XA.currentTheme = theme;

  const cpSheet = document.getElementById("theme-cyberpunk");
  const tbSheet = document.getElementById("theme-tableau");
  if (cpSheet) cpSheet.disabled = theme !== "cyberpunk";
  if (tbSheet) tbSheet.disabled = theme !== "tableau";

  document
    .querySelectorAll(".theme-opt")
    .forEach((opt) =>
      opt.classList.toggle("active", opt.dataset.theme === theme),
    );

  const accentField = document.getElementById("accent-field");
  if (accentField)
    accentField.style.display = theme === "cyberpunk" ? "" : "none";

  // Accent
  if (s.accent) applyAccent(s.accent, false);

  // Font size
  if (s.fontSize) applyFontSize(s.fontSize, false);

  // Sidebar
  if (s.sidebarCollapsed) {
    document.getElementById("app")?.classList.add("sb-col");
    const tog = document.getElementById("toggle-sidebar-default");
    if (tog) tog.checked = true;
  }

  // Sound
  XA.soundEnabled = s.sound !== false;
  const soundIcon = document.getElementById("sound-icon-el");
  if (soundIcon)
    soundIcon.className = `fa-solid ${XA.soundEnabled ? "fa-volume-high" : "fa-volume-xmark"} icon`;

  // Toggles
  setToggle("toggle-sparklines", s.sparklines !== false);
  setToggle("toggle-toast", s.toastEnabled !== false);
  setToggle("toggle-alert-error", s.alertError !== false);
  setToggle("toggle-alert-arrived", s.alertArrived !== false);
  setToggle("toggle-sound", XA.soundEnabled);
}

function setToggle(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = val;
}

/* ══════════════════════════════════════════════════════════════════════════════
   CHANGE PASSWORD
══════════════════════════════════════════════════════════════════════════════ */
window.changePassword = async function () {
  const curr = document.getElementById("pw-current")?.value || "";
  const nw = document.getElementById("pw-new")?.value || "";
  const confirm = document.getElementById("pw-confirm")?.value || "";

  if (!curr || !nw || !confirm) {
    toast("Missing Fields", "Fill all password fields", "warning");
    return;
  }
  if (nw.length < 8) {
    toast("Too Short", "Password min 8 characters", "warning");
    return;
  }
  if (nw !== confirm) {
    toast("Mismatch", "New passwords don't match", "warning");
    return;
  }

  try {
    const csrf = await fetchCSRF();
    const r = await fetch("/api/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify({ currentPassword: curr, newPassword: nw }),
    });
    const d = await r.json();
    if (r.ok && d.ok) {
      toast("Password Changed", "Login with new password next time", "success");
      beepSuccess();
      document.getElementById("pw-current").value = "";
      document.getElementById("pw-new").value = "";
      document.getElementById("pw-confirm").value = "";
    } else {
      toast("Failed", d.error || "Change password failed", "error");
    }
  } catch {
    toast("Error", "Server error", "error");
  }
};

/* ══════════════════════════════════════════════════════════════════════════════
   BIND UI EVENTS
══════════════════════════════════════════════════════════════════════════════ */
function bindUI() {
  // Sidebar toggle
  document
    .getElementById("btn-toggle-sidebar")
    ?.addEventListener("click", () => {
      const app = document.getElementById("app");
      const sb = document.getElementById("sidebar");
      if (window.innerWidth <= 768) sb.classList.toggle("open");
      else app.classList.toggle("sb-col");
      saveSettings();
    });

  // Nav items
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => navTo(item.dataset.page));
  });

  // User dropdown
  const dropdown = document.getElementById("user-dropdown");
  document.getElementById("btn-user-menu")?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle("hidden");
  });
  document.addEventListener("click", () => dropdown?.classList.add("hidden"));

  // Logout btn
  document.getElementById("btn-logout")?.addEventListener("click", doLogout);

  // Sound toggle (header button)
  document.getElementById("btn-sound")?.addEventListener("click", () => {
    XA.soundEnabled = !XA.soundEnabled;
    const icon = document.getElementById("sound-icon-el");
    if (icon) {
      icon.className = `fa-solid ${XA.soundEnabled ? "fa-volume-high" : "fa-volume-xmark"} icon`;
    }
    setToggle("toggle-sound", XA.soundEnabled);
    toast(
      XA.soundEnabled ? "Sound On" : "Sound Off",
      "",
      XA.soundEnabled ? "success" : "info",
      1500,
    );
    saveSettings();
  });

  // Sound toggle (settings)
  document
    .getElementById("toggle-sound")
    ?.addEventListener("change", function () {
      XA.soundEnabled = this.checked;
      const icon = document.getElementById("sound-icon-el");
      if (icon) {
        icon.className = `fa-solid ${XA.soundEnabled ? "fa-volume-high" : "fa-volume-xmark"} icon`;
      }
      saveSettings();
    });

  // Theme options
  document.querySelectorAll(".theme-opt").forEach((opt) => {
    opt.addEventListener("click", () => switchTheme(opt.dataset.theme));
  });

  // Accent color swatches
  document.querySelectorAll(".color-swatch").forEach((sw) => {
    sw.addEventListener("click", () => applyAccent(sw.dataset.color));
  });

  // Font size buttons
  document.querySelectorAll(".font-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      applyFontSize(parseInt(btn.dataset.size)),
    );
  });

  // Sidebar default toggle
  document
    .getElementById("toggle-sidebar-default")
    ?.addEventListener("change", function () {
      document.getElementById("app")?.classList.toggle("sb-col", this.checked);
      saveSettings();
    });

  // Other toggles — just save on change
  [
    "toggle-sparklines",
    "toggle-toast",
    "toggle-alert-error",
    "toggle-alert-arrived",
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", saveSettings);
  });

  // Analytics range buttons
  document.querySelectorAll(".range-btn").forEach((b) => {
    b.addEventListener("click", () => {
      document
        .querySelectorAll(".range-btn")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      window.analyticsRange = b.dataset.range;
      loadAnalytics();
    });
  });

  // Event log filter
  document.getElementById("evlog-filter")?.addEventListener("input", () => {
    if (window.renderFilteredLog) renderFilteredLog();
  });

  // Speed slider
  document.getElementById("spd-slider")?.addEventListener("input", function () {
    const el = document.getElementById("spd-val");
    if (el) el.textContent = this.value;
  });
}
