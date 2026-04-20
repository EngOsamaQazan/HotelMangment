"use strict";

require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const { parse: parseCookie } = require("cookie");
const { decode } = require("next-auth/jwt");
const { Client } = require("pg");

const PORT = Number(process.env.REALTIME_PORT || 3001);
const HOST = process.env.REALTIME_HOST || "127.0.0.1";
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (!NEXTAUTH_SECRET) {
  console.error("[realtime] NEXTAUTH_SECRET is required");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("[realtime] DATABASE_URL is required");
  process.exit(1);
}

// ────────────────────────────────────────────────────────────────
// Session-token name detection
//   dev:  next-auth.session-token
//   prod (https): __Secure-next-auth.session-token
// ────────────────────────────────────────────────────────────────
const SESSION_COOKIE_NAMES = [
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
];

async function verifySessionFromCookie(rawCookie) {
  if (!rawCookie) return null;
  const cookies = parseCookie(rawCookie);
  for (const name of SESSION_COOKIE_NAMES) {
    const token = cookies[name];
    if (!token) continue;
    try {
      const decoded = await decode({
        token,
        secret: NEXTAUTH_SECRET,
        salt: name,
      });
      // Older next-auth versions don't use salt; fall back:
      const payload =
        decoded ||
        (await decode({ token, secret: NEXTAUTH_SECRET }).catch(() => null));
      if (payload && (payload.sub || payload.id)) {
        const userId = Number(payload.sub || payload.id);
        if (Number.isFinite(userId)) return { userId };
      }
    } catch {
      // try next name
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────────
// HTTP server + Socket.IO
// ────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok\n");
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(server, {
  path: "/socket.io/",
  serveClient: false,
  cors: { origin: false },
  // Fine-tuned pingTimeout keeps mobile clients connected longer.
  pingInterval: 25000,
  pingTimeout: 20000,
});

io.use(async (socket, next) => {
  try {
    const auth = await verifySessionFromCookie(
      socket.handshake.headers.cookie,
    );
    if (!auth) return next(new Error("unauthenticated"));
    socket.data.userId = auth.userId;
    next();
  } catch (e) {
    next(new Error("auth_failed"));
  }
});

io.on("connection", (socket) => {
  const uid = socket.data.userId;
  // Personal room for notifications.
  socket.join(`user:${uid}`);
  console.log(`[realtime] user ${uid} connected (${socket.id})`);

  socket.on("conv:join", (conversationId) => {
    const id = Number(conversationId);
    if (!Number.isFinite(id)) return;
    socket.join(`conv:${id}`);
  });
  socket.on("conv:leave", (conversationId) => {
    const id = Number(conversationId);
    if (!Number.isFinite(id)) return;
    socket.leave(`conv:${id}`);
  });
  socket.on("board:join", (boardId) => {
    const id = Number(boardId);
    if (!Number.isFinite(id)) return;
    socket.join(`board:${id}`);
  });
  socket.on("board:leave", (boardId) => {
    const id = Number(boardId);
    if (!Number.isFinite(id)) return;
    socket.leave(`board:${id}`);
  });

  // Typing indicator — broadcast only, never touches DB.
  socket.on("chat:typing", ({ conversationId, typing }) => {
    const id = Number(conversationId);
    if (!Number.isFinite(id)) return;
    socket.to(`conv:${id}`).emit("chat:typing", {
      conversationId: id,
      userId: uid,
      typing: !!typing,
    });
  });

  socket.on("disconnect", () => {
    console.log(`[realtime] user ${uid} disconnected (${socket.id})`);
  });
});

// ────────────────────────────────────────────────────────────────
// Postgres LISTEN → Socket.IO emit
// ────────────────────────────────────────────────────────────────
const pg = new Client({ connectionString: DATABASE_URL });

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function handleChatEvent(payload) {
  if (!payload || !payload.conversationId) return;
  io.to(`conv:${payload.conversationId}`).emit("chat:event", payload);
}
function handleChatReactionEvent(payload) {
  if (!payload || !payload.conversationId) return;
  io.to(`conv:${payload.conversationId}`).emit("chat:reaction", payload);
}
function handleChatReadEvent(payload) {
  if (!payload || !payload.conversationId) return;
  io.to(`conv:${payload.conversationId}`).emit("chat:read", payload);
}
function handleTaskEvent(payload) {
  if (!payload || !payload.boardId) return;
  io.to(`board:${payload.boardId}`).emit("task:event", payload);
}
function handleNotifEvent(payload) {
  if (!payload || !payload.userId) return;
  io.to(`user:${payload.userId}`).emit("notification:new", payload);
}

async function startPgListener() {
  await pg.connect();
  pg.on("notification", (msg) => {
    const payload = safeParse(msg.payload || "");
    if (!payload) return;
    switch (msg.channel) {
      case "chat_events":
        return handleChatEvent(payload);
      case "chat_reaction_events":
        return handleChatReactionEvent(payload);
      case "chat_read_events":
        return handleChatReadEvent(payload);
      case "task_events":
        return handleTaskEvent(payload);
      case "notif_events":
        return handleNotifEvent(payload);
    }
  });
  pg.on("error", (err) => {
    console.error("[realtime] pg error:", err);
  });
  await pg.query(
    "LISTEN chat_events; LISTEN chat_reaction_events; LISTEN chat_read_events; LISTEN task_events; LISTEN notif_events;",
  );
  console.log("[realtime] LISTEN on chat_events, task_events, notif_events");
}

// ────────────────────────────────────────────────────────────────
// Boot
// ────────────────────────────────────────────────────────────────
async function main() {
  await startPgListener();
  server.listen(PORT, HOST, () => {
    console.log(`[realtime] listening on http://${HOST}:${PORT}`);
  });
}

main().catch((err) => {
  console.error("[realtime] fatal:", err);
  process.exit(1);
});

const shutdown = async (sig) => {
  console.log(`[realtime] ${sig} received, shutting down…`);
  try {
    await pg.end();
  } catch {}
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
