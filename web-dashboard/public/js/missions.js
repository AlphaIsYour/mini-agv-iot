/* ══════════════════════════════════════════════════════════════════════════════
   MISSIONS.JS — Mission log rendering, stats, export
══════════════════════════════════════════════════════════════════════════════ */

window.missionRange = "24h";
window.missionPage = 0;
window.missionDest = "all";
window.missionStatus = "all";
let missionData = [];
let missionTotal = 0;

/* ══════════════════════════════════════════════════════════════════════════════
   LOAD
══════════════════════════════════════════════════════════════════════════════ */
window.loadMissions = function () {
  requestAPI("mission_log", {
    range: missionRange,
    page: missionPage,
    dest: missionDest,
    status: missionStatus,
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   RENDER STATS
══════════════════════════════════════════════════════════════════════════════ */
window.renderMissionStats = function (stats) {
  if (!stats) return;
  setText("mission-total", stats.total_missions || "0");
  setText("mission-completed", stats.completed || "0");
  setText("mission-failed", stats.failed || "0");

  const total = Number(stats.total_missions || 0);
  const completed = Number(stats.completed || 0);
  setText("mission-success-rate", total > 0 ? `${Math.round((completed / total) * 100)}%` : "-");

  const avgDur = stats.avg_duration;
  if (avgDur && avgDur > 0) {
    const min = Math.floor(avgDur / 60);
    const sec = Math.floor(avgDur % 60);
    setText("mission-avg-duration", `${min}m ${sec}s`);
  } else {
    setText("mission-avg-duration", "—");
  }
};

/* ══════════════════════════════════════════════════════════════════════════════
   RENDER TABLE
══════════════════════════════════════════════════════════════════════════════ */
window.renderMissionLog = function (data) {
  if (Array.isArray(data)) {
    missionData = data;
    missionTotal = data.length;
  } else {
    missionData = data?.rows || [];
    missionTotal = data?.total || 0;
    if (data?.stats) renderMissionStats(data.stats);
  }
  renderFilteredMissions();

  const prevBtn = document.getElementById("mission-pg-prev");
  const nextBtn = document.getElementById("mission-pg-next");
  if (prevBtn) prevBtn.disabled = missionPage === 0;
  if (nextBtn) nextBtn.disabled = missionData.length < 20;

  const pageInfo = document.getElementById("mission-page-info");
  if (pageInfo) {
    const totalPages = Math.max(1, Math.ceil(missionTotal / 20));
    pageInfo.textContent = `Page ${missionPage + 1} of ${totalPages}`;
  }
};

window.renderFilteredMissions = function () {
  const filterEl = document.getElementById("mission-filter");
  const filter = (filterEl?.value || "").toLowerCase();

  const rows = missionData.filter(
    (r) =>
      !filter ||
      (r.destination || "").toLowerCase().includes(filter) ||
      (r.status || "").toLowerCase().includes(filter),
  );

  const infoEl = document.getElementById("mission-info");
  if (infoEl)
    infoEl.textContent = filter
      ? `${rows.length} of ${missionTotal} missions`
      : `${missionTotal} missions total`;

  const wrap = document.getElementById("mission-wrap");
  if (!wrap) return;

  if (!rows.length) {
    wrap.innerHTML = `<div class="loading">No missions found</div>`;
    return;
  }

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Dest</th>
          <th>Status</th>
          <th>Cargo (g)</th>
          <th>Started</th>
          <th>Cargo Detected</th>
          <th>Departed</th>
          <th>Arrived</th>
          <th>Cargo Removed</th>
          <th>Returned</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => missionRow(r)).join("")}
      </tbody>
    </table>
  `;
};

function missionRow(r) {
  const cls = missionRowClass(r.status);
  const badge = missionBadge(r.status);
  const dur = r.duration_seconds
    ? formatDuration(r.duration_seconds)
    : r.status === "IN_PROGRESS" || r.status === "WAITING_CARGO"
      ? "..."
      : "—";

  return `
    <tr class="${cls}">
      <td style="color:var(--text-dim)">${r.id}</td>
      <td><strong>${r.destination || "—"}</strong></td>
      <td>${badge}</td>
      <td>${r.cargo_weight != null ? r.cargo_weight.toFixed(0) : "—"}</td>
      <td class="ts-cell">${fmtTs(r.created_at)}</td>
      <td class="ts-cell">${fmtTs(r.cargo_detected_at)}</td>
      <td class="ts-cell">${fmtTs(r.departed_at)}</td>
      <td class="ts-cell">${fmtTs(r.arrived_at)}</td>
      <td class="ts-cell">${fmtTs(r.cargo_removed_at)}</td>
      <td class="ts-cell">${fmtTs(r.returned_at)}</td>
      <td style="font-family:var(--mono);font-size:10px">${dur}</td>
    </tr>
  `;
}

function missionRowClass(status) {
  switch (status) {
    case "COMPLETED": return "row-ok";
    case "FAILED": return "row-error";
    case "IN_PROGRESS": return "row-cmd";
    case "WAITING_CARGO": return "row-warn";
    default: return "";
  }
}

function missionBadge(status) {
  const colors = {
    COMPLETED: "background:var(--green-dim);color:var(--clr-green)",
    FAILED: "background:var(--red-dim);color:var(--clr-red)",
    IN_PROGRESS: "background:var(--accent-dim);color:var(--accent)",
    WAITING_CARGO: "background:var(--amber-dim);color:var(--clr-amber)",
  };
  const style = colors[status] || "";
  const label = (status || "—").replace(/_/g, " ");
  return `<span class="source-badge" style="${style}">${label}</span>`;
}

function fmtTs(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    hour12: false,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/* ══════════════════════════════════════════════════════════════════════════════
   PAGINATION
══════════════════════════════════════════════════════════════════════════════ */
window.changeMissionPage = function (dir) {
  missionPage = Math.max(0, missionPage + dir);
  loadMissions();
};

/* ══════════════════════════════════════════════════════════════════════════════
   EXPORT CSV
══════════════════════════════════════════════════════════════════════════════ */
window.exportMissionsCSV = function () {
  if (!missionData.length) {
    toast("No Data", "Load missions first", "warning");
    return;
  }

  const header =
    "ID,Destination,Status,Cargo Weight (g),Started,Cargo Detected,Departed,Arrived,Cargo Removed,Returned,Duration (s)\n";
  const rows = missionData
    .map((r) =>
      [
        r.id,
        r.destination,
        r.status,
        r.cargo_weight != null ? r.cargo_weight.toFixed(1) : "",
        r.created_at ? new Date(r.created_at).toISOString() : "",
        r.cargo_detected_at ? new Date(r.cargo_detected_at).toISOString() : "",
        r.departed_at ? new Date(r.departed_at).toISOString() : "",
        r.arrived_at ? new Date(r.arrived_at).toISOString() : "",
        r.cargo_removed_at ? new Date(r.cargo_removed_at).toISOString() : "",
        r.returned_at ? new Date(r.returned_at).toISOString() : "",
        r.duration_seconds ? r.duration_seconds.toFixed(0) : "",
      ].join(","),
    )
    .join("\n");

  const blob = new Blob([header + rows], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `xora-missions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);

  toast("Exported", `${missionData.length} missions downloaded`, "success", 3000);
};

/* ══════════════════════════════════════════════════════════════════════════════
   EVENT LISTENERS
══════════════════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  // Range buttons
  document.querySelectorAll(".mission-range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".mission-range-btn")
        .forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
      missionRange = btn.dataset.range;
      missionPage = 0;
      loadMissions();
    });
  });

  // Destination filter
  document.getElementById("mission-dest-filter")?.addEventListener("change", function () {
    missionDest = this.value;
    missionPage = 0;
    loadMissions();
  });

  // Status filter
  document.getElementById("mission-status-filter")?.addEventListener("change", function () {
    missionStatus = this.value;
    missionPage = 0;
    loadMissions();
  });

  // Search filter
  document.getElementById("mission-filter")?.addEventListener("input", () => {
    renderFilteredMissions();
  });
});
