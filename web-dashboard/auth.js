/**
 * auth.js — Xora AGV Auth Module
 * Multi-user bcrypt + role-based session validation
 */

"use strict";

const bcrypt = require("bcrypt");
const SALT_ROUNDS = 12;

// ─── In-memory user store ─────────────────────────────────────────────────────
// Multi-user: 4 admin + 1 guest
const USER_DEFS = [
  { username: "alphareno", password: process.env.ADMIN_PASSWORD_PLAIN || "alphareno77", role: "admin" },
  { username: "dzaki",     password: "xoraagv2026", role: "admin" },
  { username: "derby",     password: "xoraagv2026", role: "admin" },
  { username: "ilyas",     password: "xoraagv2026", role: "admin" },
  { username: "guest",     password: "guest",       role: "guest" },
];

let USERS = null;

async function initUsers() {
  USERS = {};
  for (const u of USER_DEFS) {
    if (!u.password) continue;
    const hash = await bcrypt.hash(u.password, SALT_ROUNDS);
    USERS[u.username] = { username: u.username, hash, role: u.role };
    console.log(`[AUTH] User '${u.username}' (${u.role}) initialized`);
  }
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
// Maps ws_token → { username, role, expires }
const WS_TOKENS = new Map();
const WS_TOKEN_TTL = 30 * 1000; // 30 detik untuk handshake

function issueWSToken(username) {
  const { v4: uuidv4 } = require("uuid");
  const token = uuidv4();
  const user = USERS ? USERS[username] : null;
  WS_TOKENS.set(token, {
    username,
    role: user ? user.role : "guest",
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
  return { username: entry.username, role: entry.role };
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
  // Only admins can change password
  if (USERS[username].role !== "admin") throw new Error("Guest cannot change password");
  const hash = await bcrypt.hash(newPlain, SALT_ROUNDS);
  USERS[username].hash = hash;
  console.log(`[AUTH] Password changed for '${username}'`);
}

// Re-export with changePassword added
module.exports.changePassword = changePassword;
