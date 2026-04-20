# Fakher Booking Bot

Node.js worker that drives **Booking.com Extranet** via Playwright on behalf of
the hotel-app. Runs as a **separate process** from Next.js so the site itself
never imports Playwright (avoids browser-download & RAM cost during requests).

## ⚠️ Important warnings

- Automating the Extranet is **against Booking.com's ToS** and the UI/DOM
  changes frequently. Expect breakage every few weeks.
- Every selector here must be treated as a **best-effort heuristic**; we keep
  screenshots and a structured log of every step so you can debug.
- Prefer the **official "Connectivity Provider"** channel-manager API the moment
  you're able to onboard a CM (e.g. Lodgify, Cloudbeds, SiteMinder) — this bot
  is a *bridge for small properties only*.
- Never commit real credentials. The hotel-app stores them encrypted
  (AES-256-GCM) and exposes only the decrypted password to this bot at runtime.

## Data flow

```
 Hotel-app (Next.js)           Postgres                Booking.com Extranet
 ─────────────────    ────────────────────────    ─────────────────────────
  UI → POST /jobs ─▶  BookingSyncJob row     ◀──▶  Playwright session
  UI ← logs/status ◀── BookingSyncLog append ─── (bot writes every step)
                                              ─▶ push prices / availability
                                              ◀─ scrape new reservations
                                              ─▶ BookingInboxReservation
```

## Supported job types

| type                 | input (payloadJson)                                             | output                                 |
| -------------------- | --------------------------------------------------------------- | -------------------------------------- |
| `login_check`        | `{ credentialId }`                                              | updates `lastLoginAt`, `lastLoginOk`   |
| `push_prices`        | `{ credentialId, seasonId }`                                    | count of rooms updated                 |
| `push_availability`  | `{ credentialId, fromDate, toDate, unitIds?: number[] }`        | count of days updated                  |
| `pull_reservations`  | `{ credentialId, fromDate?, toDate? }`                          | adds rows to `BookingInboxReservation` |

## Installation

```bash
cd bot
npm install
npm run install-browsers   # downloads Chromium (~250 MB)
```

## Running

```bash
# production: continuous polling loop (poll every 15s)
npm run build && npm start

# one-shot: process one pending job and exit (useful for cron)
npm run once
```

Environment:

- `DATABASE_URL` – same as hotel-app
- `BOOKING_ENC_KEY` – 64-hex master key (must match hotel-app)
- `BOOKING_HEADLESS` – `true` in prod, `false` to debug visually
- `BOOKING_SLOWMO_MS` – slow-motion delay between actions (default `0`)
- `BOOKING_SCREENSHOT_DIR` – absolute path for per-step screenshots

## Project layout

```
bot/src
 ├─ runner.ts            ← main loop: pick next pending job, dispatch, finalise
 ├─ lib/
 │   ├─ prisma.ts        ← shared Prisma client
 │   ├─ logger.ts        ← appends BookingSyncLog rows
 │   ├─ credentials.ts   ← decrypts BookingCredential password
 │   └─ browser.ts       ← Playwright context factory
 └─ operations/
     ├─ login.ts               ← email / password / 2FA / captcha detection
     ├─ push-prices.ts         ← open Rates & Availability → save price grid
     ├─ push-availability.ts   ← toggle room nights open / closed
     └─ pull-reservations.ts   ← scrape the Reservations tab into the Inbox
```
