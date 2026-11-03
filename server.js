"use strict";
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const MAX_CLIENTS = 400;       // whole server
const MAX_PER_ROOM = 30;       // players in one room code
const MAX_MSG = 4096;          // bytes per message
const MAX_PRESENCE = 2048;     // bytes of presence per client
const MAX_GAMES = 5000;        // open game codes kept in memory
const GAME_IDLE_MS = 60 * 60 * 1000; // an empty game is forgotten after 1 hour

// Game codes are created by the server and kept here. Joining any other code is refused,
// so a typo can never drop someone into a stranger's room.
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i look-alikes
const CODE_RE = /^[a-hjkmnp-z2-9]{5}$/;
const games = new Map(); // code -> { createdAt, lastActive }

const app = express();
app.disable("x-powered-by");
app.get("/healthz", (_req, res) => res.type("text").send("ok"));
app.post("/api/games", (_req, res) => {
  pruneGames();
  if (games.size >= MAX_GAMES) return res.status(503).json({ error: "busy" });
  let code = null;
  for (let k = 0; k < 50 && !code; k++) {
    let c = "";
    for (let i = 0; i < 5; i++) c += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (!games.has(c)) code = c;
  }
  if (!code) return res.status(503).json({ error: "busy" });
  const now = Date.now();
  games.set(code, { createdAt: now, lastActive: now });
  res.status(201).json({ code });
});
app.get("/api/games/:code", (req, res) => {
  const code = String(req.params.code || "").trim().toLowerCase();
  if (!CODE_RE.test(code) || !games.has(code)) return res.status(404).json({ error: "not_found" });
  res.set("Cache-Control", "no-store").json({ code, players: members(code).length });
});
app.use(express.static(path.join(__dirname, "public"), { maxAge: "5m" }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: MAX_MSG });

let nextId = 1;
const clients = new Map(); // id -> {id, ws, presence, alive}

function roomOf(c) {
  const rc = c.presence && c.presence.rc;
  return typeof rc === "string" && rc ? rc : null;
}
function members(rc) {
  const out = [];
  for (const c of clients.values()) if (roomOf(c) === rc) out.push(c);
  return out;
}
function snapshotFor(me) {
  const rc = roomOf(me);
  const list = [{ peer: me.id, isMe: true, sameTab: true, kind: "viewer", presence: me.presence }];
  if (rc) for (const c of members(rc)) if (c !== me) {
    list.push({ peer: c.id, isMe: false, sameTab: false, kind: "viewer", presence: c.presence });
  }
  return list;
}
function send(c, obj) {
  if (c.ws.readyState === 1) c.ws.send(JSON.stringify(obj));
}
function pushRoom(rc, extra) {
  const seen = new Set();
  if (rc) for (const c of members(rc)) { seen.add(c); send(c, { type: "peers", peers: snapshotFor(c) }); }
  if (extra && !seen.has(extra)) send(extra, { type: "peers", peers: snapshotFor(extra) });
}

wss.on("connection", (ws) => {
  if (clients.size >= MAX_CLIENTS) { ws.close(1013, "busy"); return; }
  const c = { id: "p" + (nextId++).toString(36), ws, presence: {}, alive: true };
  clients.set(c.id, c);
  send(c, { type: "hello", id: c.id, now: Date.now() });
  ws.on("pong", () => { c.alive = true; });
  ws.on("message", (data) => {
    c.alive = true;
    let m;
    try { m = JSON.parse(data.toString()); } catch (_) { return; }
    if (!m || m.type !== "presence" || !m.patch || typeof m.patch !== "object") return;
    const before = roomOf(c);
    const next = Object.assign({}, c.presence);
    for (const k of Object.keys(m.patch).slice(0, 20)) {
      if (m.patch[k] === null) delete next[k]; else next[k] = m.patch[k];
    }
    if (JSON.stringify(next).length > MAX_PRESENCE) return;
    const after = typeof next.rc === "string" ? next.rc.slice(0, 40) : null;
    if (after) next.rc = after;
    if (after && after !== before) {
      if (!games.has(after)) { send(c, { type: "error", code: "no_game" }); return; }
      if (members(after).length >= MAX_PER_ROOM) { send(c, { type: "error", code: "room_full" }); return; }
    }
    c.presence = next;
    const rc = roomOf(c);
    touch(rc); touch(before);
    if (before && before !== rc) pushRoom(before);
    pushRoom(rc, c);
  });
  ws.on("close", () => {
    const rc = roomOf(c);
    clients.delete(c.id);
    touch(rc);
    if (rc) pushRoom(rc);
  });
  ws.on("error", () => {});
});

function touch(rc) { const g = rc && games.get(rc); if (g) g.lastActive = Date.now(); }
function pruneGames() {
  const now = Date.now();
  for (const [code, g] of games) {
    if (now - g.lastActive > GAME_IDLE_MS && members(code).length === 0) games.delete(code);
  }
}
setInterval(pruneGames, 60000).unref();

// drop dead connections (also keeps proxies from closing idle sockets)
setInterval(() => {
  for (const c of clients.values()) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false;
    try { c.ws.ping(); } catch (_) {}
  }
}, 25000);

server.listen(PORT, () => console.log("French quiz live on port " + PORT));
module.exports = { server, games };
