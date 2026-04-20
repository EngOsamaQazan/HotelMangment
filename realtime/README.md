# Hotel-app Realtime Service

Separate Socket.IO microservice that powers live updates for chat, tasks and
notifications. Runs alongside the Next.js app on a different port (3001) and
is proxied by Apache via `proxy_wstunnel_module`.

## How it works

```
Browser  ──WSS /socket.io──►  Apache  ──ws://127.0.0.1:3001──►  realtime (this)
                                                                    │
                                                              LISTEN chat_events
                                                                    │
Next.js  ──INSERT/UPDATE──►  Postgres  ──NOTIFY──►  realtime  ──emit──►  Browser
```

- Authenticates every incoming socket by decoding the NextAuth session cookie
  with the shared `NEXTAUTH_SECRET`.
- Joins every user to `user:<userId>` automatically for personal notifications.
- Exposes join/leave events for `conv:<id>` (chat) and `board:<id>` (Kanban).
- Relays Postgres `LISTEN/NOTIFY` events fired by DB triggers installed from
  `prisma/sql/realtime-triggers.sql`.

## Install / run

```bash
cd /opt/hotel-app/realtime
npm install --production
pm2 start ecosystem.config.cjs
pm2 save
```

## Environment

Reads the same `/opt/hotel-app/.env` that the Next.js app uses:

- `DATABASE_URL`      — Postgres connection for the LISTEN client.
- `NEXTAUTH_SECRET`   — shared secret for decoding session cookies.
- `REALTIME_PORT`     — defaults to `3001`.
- `REALTIME_HOST`     — defaults to `127.0.0.1`.
