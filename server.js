"use strict";
const http = require("http");
const path = require("path");
const express = require("express");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const MAX_CLIENTS = 400;       // whole server
const MAX_PER_ROOM = 30;       // players in one room code
const MAX_MSG = 4096;          // bytes per message
const MAX_PRESENCE = 2048;     // bytes of presence per client

const app = express();
app.disable("x-powered-by");
app.get("/healthz", (_req, res) => res.type("text").send("ok"));
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
    if (after && after !== before && members(after).length >= MAX_PER_ROOM) {
      send(c, { type: "error", code: "room_full" });
      return;
    }
    c.presence = next;
    const rc = roomOf(c);
    if (before && before !== rc) pushRoom(before);
    pushRoom(rc, c);
  });
  ws.on("close", () => {
    const rc = roomOf(c);
    clients.delete(c.id);
    if (rc) pushRoom(rc);
  });
  ws.on("error", () => {});
});

// drop dead connections (also keeps proxies from closing idle sockets)
setInterval(() => {
  for (const c of clients.values()) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false;
    try { c.ws.ping(); } catch (_) {}
  }
}, 25000);

server.listen(PORT, () => console.log("French quiz live on port " + PORT));
module.exports = { server };
