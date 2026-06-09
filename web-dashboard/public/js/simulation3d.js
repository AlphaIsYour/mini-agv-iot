/* ════════════════════════════════════════════════════════════════════════════
   SIMULATION3D.JS — Stub (XORA World via iframe)

   3D simulation sekarang berjalan di folio/ (port 5173) dan di-embed
   via iframe di tab "3D Sim". File ini hanya stub untuk kompatibilitas
   dengan app.js yang memanggil initSimulation3D / pauseSimulation3D.
════════════════════════════════════════════════════════════════════════════ */

// No-op — 3D world runs independently in iframe
window.initSimulation3D = function () {
  // Health check already handled by inline script in index.html
};

window.pauseSimulation3D = function () {
  // Iframe keeps running in background — no action needed
};

window.syncAGV3DPosition = function () {
  // Position sync handled by folio's own WebSocket connection
};
