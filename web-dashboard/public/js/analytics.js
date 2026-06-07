/* ══════════════════════════════════════════════════════════════════════════════
   ANALYTICS.JS — Charts, Event Log, Export CSV
══════════════════════════════════════════════════════════════════════════════ */

window.analyticsRange = "24h";
window.evlogRange = "24h";
window.evlogPage = 0;
window.evlogSource = "all";
let evlogData = [];
let evlogTotal = 0;
const charts = {};

/* ══════════════════════════════════════════════════════════════════════════════
   LOAD
══════════════════════════════════════════════════════════════════════════════ */
window.loadAnalytics = function () {
  requestAPI("stats_summary", { range: analyticsRange });
  requestAPI("event_counts", { range: analyticsRange });
  requestAPI("sensor_history", { range: analyticsRange });
  requestAPI("error_summary", { range: analyticsRange });
  requestAPI("state_distribution", { range: analyticsRange });
};

window.loadEventLog = function () {
  requestAPI("event_log", {
    range: evlogRange,
    page: evlogPage,
    source: evlogSource,
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   CHART DEFAULTS — reads CSS vars so it works in both themes
══════════════════════════════════════════════════════════════════════════════ */
function chartDefaults() {
  const style = getComputedStyle(document.documentElement);
  const gridCol = style.getPropertyValue("--border").trim() || "#1a2438";
  const tickCol = style.getPropertyValue("--text-dim").trim() || "#3a5070";
  const mono =
    style.getPropertyValue("--mono").trim() || "JetBrains Mono, monospace";

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor:
          style.getPropertyValue("--panel-bg").trim() || "#0f1520",
        borderColor: style.getPropertyValue("--border2").trim() || "#223050",
        borderWidth: 1,
        titleColor: style.getPropertyValue("--text").trim() || "#c8daf0",
        bodyColor: style.getPropertyValue("--text-mid").trim() || "#6a8aaa",
        titleFont: { family: mono, size: 10 },
        bodyFont: { family: mono, size: 9 },
        padding: 8,
      },
    },
    scales: {
      x: {
        ticks: { color: tickCol, font: { family: mono, size: 8 } },
        grid: { color: gridCol },
      },
      y: {
        ticks: { color: tickCol, font: { family: mono, size: 8 } },
        grid: { color: gridCol },
      },
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
   STATS SUMMARY
══════════════════════════════════════════════════════════════════════════════ */
window.renderStats = function (d) {
  if (!d) return;
  setText("stat-events", d.events_range || "0");
  setText("stat-deliveries", d.deliveries_range || "0");
  setText("stat-errors", d.errors_range || "0");
  setText("stat-total", d.total_events || "0");
};

/* ══════════════════════════════════════════════════════════════════════════════
   EVENT DISTRIBUTION CHART
══════════════════════════════════════════════════════════════════════════════ */
window.renderEventChart = function (rows) {
  if (!rows || !rows.length) return;

  const style = getComputedStyle(document.documentElement);
  const accent = style.getPropertyValue("--accent").trim() || "#00d4ff";
  const red = style.getPropertyValue("--clr-red").trim() || "#ff3366";
  const amber = style.getPropertyValue("--clr-amber").trim() || "#ffb300";
  const green = style.getPropertyValue("--clr-green").trim() || "#00ff88";

  const ERR_CODES = [
    "ESTOP",
    "LINE_LOST",
    "OBSTACLE_DETECTED",
    "ERROR",
    "FAIL",
  ];
  const WARN_CODES = ["NO_OBJECT", "WAITING", "TIMEOUT", "INVALID"];
  const OK_CODES = ["ARRIVED", "LOADED", "RETURNED", "CMD_SENT"];

  const labels = rows.map((r) => r.code);
  const values = rows.map((r) => parseInt(r.count));
  const colors = rows.map((r) => {
    if (ERR_CODES.some((c) => r.code.includes(c))) return hexAlpha(red, 0.75);
    if (WARN_CODES.some((c) => r.code.includes(c)))
      return hexAlpha(amber, 0.75);
    if (OK_CODES.some((c) => r.code.includes(c))) return hexAlpha(green, 0.75);
    return hexAlpha(accent, 0.6);
  });
  const borders = colors.map((c) => c.replace(/[\d.]+\)$/, "1)"));

  destroyChart("events");
  const canvas = document.getElementById("chart-events");
  if (!canvas) return;

  charts.events = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderColor: borders,
          borderWidth: 1,
          borderRadius: 2,
        },
      ],
    },
    options: {
      ...chartDefaults(),
      indexAxis: "y",
      plugins: {
        ...chartDefaults().plugins,
        tooltip: {
          ...chartDefaults().plugins.tooltip,
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.x} events`,
          },
        },
      },
    },
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   STATE DISTRIBUTION CHART (Doughnut)
══════════════════════════════════════════════════════════════════════════════ */
window.renderStateChart = function (rows) {
  if (!rows || !rows.length) return;

  const style = getComputedStyle(document.documentElement);
  const accent = style.getPropertyValue("--accent").trim() || "#00d4ff";
  const green = style.getPropertyValue("--clr-green").trim() || "#00ff88";
  const amber = style.getPropertyValue("--clr-amber").trim() || "#ffb300";
  const red = style.getPropertyValue("--clr-red").trim() || "#ff3366";

  const STATE_COLORS = {
    IDLE: hexAlpha(accent, 0.7),
    MENUNGGU_BARANG: hexAlpha(amber, 0.7),
    KEBERANGKATAN: hexAlpha(green, 0.7),
    SAMPAI: "#a855f7",
    PULANG: hexAlpha(accent, 0.5),
    SELESAI: hexAlpha(green, 0.5),
    MANUAL: hexAlpha(amber, 0.5),
    ERROR_STATE: hexAlpha(red, 0.7),
  };
  const DEFAULT_COLOR = hexAlpha(accent, 0.3);

  const labels = rows.map((r) => (r.state || "UNKNOWN").replace(/_/g, " "));
  const values = rows.map((r) => parseInt(r.count));
  const colors = rows.map((r) => STATE_COLORS[r.state] || DEFAULT_COLOR);

  destroyChart("states");
  const canvas = document.getElementById("chart-states");
  if (!canvas) return;

  const mono =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--mono")
      .trim() || "JetBrains Mono, monospace";

  charts.states = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderColor: "transparent",
          borderWidth: 0,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "55%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            color:
              style.getPropertyValue("--text-mid").trim() || "#6a8aaa",
            font: { family: mono, size: 9 },
            padding: 8,
            boxWidth: 10,
            boxHeight: 10,
          },
        },
        tooltip: {
          backgroundColor:
            style.getPropertyValue("--panel-bg").trim() || "#0f1520",
          borderColor: style.getPropertyValue("--border2").trim() || "#223050",
          borderWidth: 1,
          titleColor: style.getPropertyValue("--text").trim() || "#c8daf0",
          bodyColor: style.getPropertyValue("--text-mid").trim() || "#6a8aaa",
          titleFont: { family: mono, size: 10 },
          bodyFont: { family: mono, size: 9 },
          padding: 8,
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            },
          },
        },
      },
    },
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   SENSOR HISTORY CHARTS
══════════════════════════════════════════════════════════════════════════════ */
window.renderSensorCharts = function (rows) {
  if (!rows || !rows.length) return;

  const style = getComputedStyle(document.documentElement);
  const accent = style.getPropertyValue("--accent").trim() || "#00d4ff";
  const green = style.getPropertyValue("--clr-green").trim() || "#00ff88";
  const amber = style.getPropertyValue("--clr-amber").trim() || "#ffb300";

  const labels = rows.map((r) =>
    new Date(r.t).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }),
  );

  const makeLine = (canvasId, key, color, label, chartKey) => {
    destroyChart(chartKey);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const def = chartDefaults();
    charts[chartKey] = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label,
            data: rows.map((r) => parseFloat(r[key]) || 0),
            borderColor: color,
            backgroundColor: hexAlpha(color, 0.06),
            fill: true,
            borderWidth: 1.5,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 3,
          },
        ],
      },
      options: {
        ...def,
        plugins: {
          ...def.plugins,
          tooltip: {
            ...def.plugins.tooltip,
            callbacks: {
              label: (ctx) => ` ${ctx.parsed.y.toFixed(1)} ${label}`,
            },
          },
        },
        scales: {
          ...def.scales,
          x: {
            ...def.scales.x,
            ticks: { ...def.scales.x.ticks, maxTicksLimit: 8 },
          },
        },
      },
    });
  };

  makeLine("chart-us", "ultrasonic", accent, "cm", "us");
  makeLine("chart-lc", "loadcell", green, "g", "lc");
  makeLine("chart-bat", "battery", amber, "%", "bat");
};

/* ══════════════════════════════════════════════════════════════════════════════
   ERROR TABLE
══════════════════════════════════════════════════════════════════════════════ */
window.renderErrorTable = function (rows) {
  const wrap = document.getElementById("err-table-wrap");
  if (!wrap) return;

  if (!rows || !rows.length) {
    wrap.innerHTML = `<div class="loading">No errors in this period</div>`;
    return;
  }

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Code</th>
          <th>Message</th>
          <th>State</th>
          <th>Dest</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td class="code-cell">${r.code || "—"}</td>
            <td>${(r.message || "").slice(0, 48)}</td>
            <td>${r.state || "—"}</td>
            <td>${r.destination || "—"}</td>
            <td class="ts-cell">${new Date(r.ts).toLocaleString()}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
};

/* ══════════════════════════════════════════════════════════════════════════════
   EVENT LOG
══════════════════════════════════════════════════════════════════════════════ */
window.renderEventLog = function (data) {
  // Support both old format (array) and new format ({ rows, total })
  if (Array.isArray(data)) {
    evlogData = data;
    evlogTotal = data.length;
  } else {
    evlogData = data?.rows || [];
    evlogTotal = data?.total || 0;
  }
  renderFilteredLog();

  const prevBtn = document.getElementById("pg-prev");
  const nextBtn = document.getElementById("pg-next");
  if (prevBtn) prevBtn.disabled = evlogPage === 0;
  if (nextBtn) nextBtn.disabled = evlogData.length < 40;

  const pageInfo = document.getElementById("evlog-page-info");
  if (pageInfo) {
    const totalPages = Math.max(1, Math.ceil(evlogTotal / 40));
    pageInfo.textContent = `Page ${evlogPage + 1} of ${totalPages}`;
  }
};

window.renderFilteredLog = function () {
  const filterEl = document.getElementById("evlog-filter");
  const filter = (filterEl?.value || "").toLowerCase();

  const rows = evlogData.filter(
    (r) =>
      !filter ||
      (r.code || "").toLowerCase().includes(filter) ||
      (r.message || "").toLowerCase().includes(filter) ||
      (r.state || "").toLowerCase().includes(filter) ||
      (r.destination || "").toLowerCase().includes(filter) ||
      (r.source || "").toLowerCase().includes(filter),
  );

  const infoEl = document.getElementById("evlog-info");
  if (infoEl)
    infoEl.textContent = filter
      ? `${rows.length} of ${evlogTotal} events`
      : `${evlogTotal} events total`;

  const wrap = document.getElementById("evlog-wrap");
  if (!wrap) return;

  if (!rows.length) {
    wrap.innerHTML = `<div class="loading">No events found</div>`;
    return;
  }

  const ERR_CODES = ["LINE_LOST", "OBSTACLE", "ERROR", "ESTOP", "FAIL", "LOST"];
  const WARN_CODES = ["WAITING", "NO_OBJECT", "TIMEOUT", "INVALID"];
  const OK_CODES = ["ARRIVED", "LOADED", "RETURNED", "SAMPAI", "SELESAI"];
  const CMD_CODES = ["CMD_SENT"];

  function rowClass(code) {
    if (!code) return "";
    if (ERR_CODES.some((c) => code.includes(c))) return "row-error";
    if (WARN_CODES.some((c) => code.includes(c))) return "row-warn";
    if (OK_CODES.some((c) => code.includes(c))) return "row-ok";
    if (CMD_CODES.some((c) => code.includes(c))) return "row-cmd";
    return "";
  }

  function sourceBadge(src) {
    if (!src) return "—";
    const cls = src === "dashboard" ? "dashboard" : "esp32";
    return `<span class="source-badge ${cls}">${src}</span>`;
  }

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Code</th>
          <th>Message</th>
          <th>State</th>
          <th>Dest</th>
          <th>Source</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr class="${rowClass(r.code)}">
            <td style="color:var(--text-dim)">${r.id}</td>
            <td class="code-cell">${r.code || "—"}</td>
            <td>${(r.message || "").slice(0, 50)}</td>
            <td>${r.state || "—"}</td>
            <td>${r.destination || "—"}</td>
            <td>${sourceBadge(r.source)}</td>
            <td class="ts-cell">${new Date(r.ts).toLocaleString()}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
};

window.changePage = function (dir) {
  evlogPage = Math.max(0, evlogPage + dir);
  window.evlogPage = evlogPage;
  loadEventLog();
};

/* ══════════════════════════════════════════════════════════════════════════════
   EXPORT CSV
══════════════════════════════════════════════════════════════════════════════ */
window.exportCSV = function () {
  if (!evlogData.length) {
    toast("No Data", "Load event log first", "warning");
    return;
  }

  const header = "ID,Code,Message,State,Destination,Source,Time\n";
  const rows = evlogData
    .map((r) =>
      [
        r.id,
        r.code,
        `"${(r.message || "").replace(/"/g, '""')}"`,
        r.state,
        r.destination,
        r.source,
        new Date(r.ts).toISOString(),
      ].join(","),
    )
    .join("\n");

  const blob = new Blob([header + rows], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `xora-events-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);

  toast("Exported", `${evlogData.length} rows downloaded`, "success", 3000);
};

/* ══════════════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════════════ */
window.exportLogPDF = function () {
  if (!evlogData.length) {
    toast("No Data", "Load event log first", "warning");
    return;
  }

  const esc = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const rows = evlogData
    .map(
      (r) => `
        <tr>
          <td>${esc(r.id)}</td>
          <td>${esc(r.code)}</td>
          <td>${esc(String(r.message || "").slice(0, 90))}</td>
          <td>${esc(r.state)}</td>
          <td>${esc(r.destination)}</td>
          <td>${esc(r.source)}</td>
          <td>${esc(r.ts ? new Date(r.ts).toLocaleString() : "")}</td>
        </tr>
      `,
    )
    .join("");

  const win = window.open("", "_blank", "width=1100,height=760");
  if (!win) {
    toast("Popup Blocked", "Allow popups to export PDF", "warning");
    return;
  }

  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>XORA Event Log</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; padding: 24px; }
          h1 { font-size: 20px; margin: 0 0 4px; }
          p { margin: 0 0 16px; color: #4b5563; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th, td { border: 1px solid #d1d5db; padding: 6px; vertical-align: top; }
          th { background: #f3f4f6; text-align: left; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>XORA AGV Event Log</h1>
        <p>Generated ${new Date().toLocaleString()} - ${evlogData.length} rows</p>
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Code</th><th>Message</th><th>State</th><th>Dest</th><th>Source</th><th>Time</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <script>window.onload = () => { window.print(); };</script>
      </body>
    </html>
  `);
  win.document.close();
  toast("PDF Ready", "Print dialog opened", "success", 2500);
};

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// Convert any color string + alpha to rgba
// Works for hex (#rrggbb) and css var resolved values
function hexAlpha(color, alpha) {
  // If already rgba/rgb, just return with alpha
  if (color.startsWith("rgb")) {
    return color.replace(/[\d.]+\)$/, alpha + ")");
  }
  // Hex
  const hex = color.replace("#", "");
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}

/* ══════════════════════════════════════════════════════════════════════════════
   EVENT LOG FILTERS — Range & Source
══════════════════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  // Event log range buttons
  document.querySelectorAll(".evlog-range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".evlog-range-btn")
        .forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
      evlogRange = btn.dataset.range;
      evlogPage = 0;
      window.evlogRange = evlogRange;
      window.evlogPage = 0;
      loadEventLog();
    });
  });

  // Source filter
  document.getElementById("evlog-source")?.addEventListener("change", function () {
    evlogSource = this.value;
    evlogPage = 0;
    window.evlogSource = evlogSource;
    window.evlogPage = 0;
    loadEventLog();
  });
});
