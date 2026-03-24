/**
 * auth.js — Xora AGV Auth Module
 * bcrypt password hashing + session validation
 */

"use strict";

const bcrypt = require("bcrypt");
const SALT_ROUNDS = 12;

// ─── In-memory user store ─────────────────────────────────────────────────────
// Di produksi, simpan ke DB. Untuk AGV single-user ini cukup.
let USERS = null;

async function initUsers() {
  const user = process.env.ADMIN_USERNAME || "admin";
  const plain = process.env.ADMIN_PASSWORD_PLAIN;

  if (!plain) {
    console.error("[AUTH] ADMIN_PASSWORD_PLAIN not set in .env — exiting");
    process.exit(1);
  }

  const hash = await bcrypt.hash(plain, SALT_ROUNDS);
  USERS = { [user]: { username: user, hash, role: "admin" } };
  console.log(`[AUTH] User '${user}' initialized (bcrypt hash ready)`);
}

async function verifyCredentials(username, password) {
  if (!USERS) return null;
  const user = USERS[username];
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.hash);
  return ok ? { username: user.username, role: user.role } : null;
}

// ─── Session middleware guard ─────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  // AJAX request → 401 JSON
  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.redirect("/login");
}

// ─── WebSocket token store (simple in-memory) ────────────────────────────────
// Maps ws_token → { username, expires }
const WS_TOKENS = new Map();
const WS_TOKEN_TTL = 30 * 1000; // 30 detik untuk handshake

function issueWSToken(username) {
  const { v4: uuidv4 } = require("uuid");
  const token = uuidv4();
  WS_TOKENS.set(token, {
    username,
    expires: Date.now() + WS_TOKEN_TTL,
  });
  // Cleanup expired tokens setiap kali issue
  for (const [k, v] of WS_TOKENS) {
    if (v.expires < Date.now()) WS_TOKENS.delete(k);
  }
  return token;
}

function validateWSToken(token) {
  const entry = WS_TOKENS.get(token);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    WS_TOKENS.delete(token);
    return null;
  }
  // One-time use after connection established
  WS_TOKENS.delete(token);
  return entry.username;
}

module.exports = {
  initUsers,
  verifyCredentials,
  requireAuth,
  issueWSToken,
  validateWSToken,
};

async function changePassword(username, newPlain) {
  if (!USERS || !USERS[username]) throw new Error("User not found");
  const hash = await bcrypt.hash(newPlain, SALT_ROUNDS);
  USERS[username].hash = hash;
  console.log(`[AUTH] Password changed for '${username}'`);
}

// Re-export with changePassword added
module.exports.changePassword = changePassword;
