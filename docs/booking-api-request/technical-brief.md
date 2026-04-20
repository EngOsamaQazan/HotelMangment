# Al-Mafraq Hotel Group — Connectivity API Request

**Technical Brief for Booking.com Connectivity Partner Support**

Date: April 2026
Property owner: Osama Qazan — `osamaqazan89@gmail.com`
Existing listed property ID: **14364167** (Al-Mafraq Hotel — hotel rooms + serviced apartments)
Country / City: Jordan — Mafraq

---

## 1. Executive summary

We operate an **in-house Property Management System (PMS)** built specifically for our
hotel group (3 properties, 1 currently listed on Booking.com, 2 more being onboarded).
We are requesting direct access to Booking.com's Connectivity APIs so we can:

- Maintain **a single source of truth** in our PMS for rooms, rates, availability, and
  reservations — without operating a third-party Channel Manager.
- Provide guests and our front-desk team with **real-time two-way sync** between our
  system and Booking.com.
- Scale to 3+ properties under one provider account.

The system is already in production at `https://hotel.aqssat.co` and is actively used by
reception, housekeeping, and accounting teams daily.

---

## 2. System overview

| Layer              | Technology                                             |
|--------------------|--------------------------------------------------------|
| Runtime            | Next.js 16 (App Router) on Node.js                     |
| Language           | TypeScript (strict mode)                               |
| Database           | PostgreSQL managed by Prisma ORM 6                     |
| Auth               | NextAuth.js (JWT sessions, bcrypt, 2FA-ready)          |
| Realtime           | Socket.IO backend + Postgres LISTEN/NOTIFY triggers    |
| Permissions        | Fine-grained RBAC registry with `requirePermission()`  |
| Deployment         | Single-region VPS, Nginx reverse proxy, PM2 processes  |
| Credential storage | AES-256-GCM encryption for all third-party secrets     |

All external integrations (including the Booking.com credentials for our automation
helpers) are encrypted at rest with AES-256-GCM via a keyed HKDF derived from
`BOOKING_ENC_KEY`. See `src/lib/booking/encryption.ts`.

---

## 3. Data model relevant to Booking.com mapping

The PMS data model already mirrors the shape of Booking.com's Content API:

- `UnitType` — property-level accommodation type (hotel room / apartment / suite).
  - `maxOccupancy`, `sizeSqm`, `bedroomCount`, `livingRoomCount`, `bathroomCount`.
- `UnitTypeBed` — per-type bed configuration
  (`BED_TYPE`, `count`, `location = BEDROOM | LIVING_ROOM | MAJLIS`).
- `Unit` — physical room/apartment tied to a `UnitType`.
- `Rate` — nightly/weekly/monthly rate plan per unit type.
- `Reservation` — guest booking with check-in/out, payment, channel, and status.
- `Guest` — de-duplicated guest profile with document IDs.

This schema was deliberately designed to map 1-to-1 onto Booking.com's
`Properties`, `Rooms`, `Rate Plans`, and `Reservations` objects documented at
`https://developers.booking.com/connectivity/docs/`.

A migration script (`prisma/scripts/backfill-unit-types.ts`) is already in place to
map our legacy units to the normalized unit-type model.

---

## 4. APIs we plan to integrate (in priority order)

1. **Content API (Properties + Rooms)** — push our unit types, beds, amenities,
   photos, and descriptions; read Booking.com's property status and validation
   feedback.
2. **Availability & Rates API (ARI)** — push nightly availability and rates from our
   rate calendar; handle restrictions (MinLOS, CTA, CTD).
3. **Reservations API (Retrieval + Notifications)** — pull new and modified
   reservations into our PMS, acknowledge them, and handle cancellations.
4. **Messaging API** — optional, to consolidate guest messaging into our internal
   chat module.
5. **Opportunities API** — ingest opportunities as tasks in our Kanban board.

For each stream we will implement idempotent consumers, exponential-backoff retry,
and end-to-end structured logging with correlation IDs.

---

## 5. Internal modules already built

- **Reservations** — full CRUD with check-in/out flows, deposits, balance tracking.
- **Unit types & beds** — the model described in §3; seed data for our current
  inventory is already loaded.
- **Reports — Monthly** — revenue, occupancy, ADR, RevPAR, channel mix.
- **Accounting & Payroll** — party ledger, payroll cycles per employee.
- **Tasks (Kanban)** — boards/columns/cards with assignees, labels, attachments,
  realtime updates.
- **Chat** — internal messaging (staff ↔ staff; extendable to guest ↔ staff).
- **Notifications** — realtime bell with unread counter; Postgres triggers fan out
  to Socket.IO.
- **Permissions registry** — 40+ capabilities, enforced on every API route.

---

## 6. Security & compliance

- TLS everywhere (Let's Encrypt, auto-renewed).
- Credentials: AES-256-GCM at rest, HMAC-tagged, no plaintext storage.
- Full audit log for sensitive operations (reservation edits, rate changes, user
  permission changes).
- GDPR-aware: guest data can be anonymized/exported per request.
- Rate limiting at the edge (`src/lib/rateLimit.ts`).
- We can sign and honor a DPA with Booking.com.

---

## 7. Rollout plan

| Phase | Scope                                                          | ETA     |
|-------|----------------------------------------------------------------|---------|
| 1     | Provider account + sandbox credentials; Content API read-only  | 2 weeks |
| 2     | Content API push for property 14364167 (single property)       | 3 weeks |
| 3     | ARI push + Reservations pull; certification                    | 4 weeks |
| 4     | Onboard remaining 2 properties under the same provider         | 2 weeks |
| 5     | Go-live + monitoring dashboards + on-call rotation             | 1 week  |

Total: ~12 weeks to full production.

---

## 8. What we need from Booking.com

1. A **Provider Account** on `https://developers.booking.com` tied to the hotel
   owner's account (`osamaqazan89@gmail.com`).
2. Sandbox + production credentials (XML or JSON endpoints as appropriate).
3. Certification checklist and mapping of our 3 properties to provider IDs.
4. A named point of contact on the Connectivity Partner Support team during
   onboarding.

---

## 9. Contact

- Owner & technical sponsor: **Osama Qazan**
- Email: **osamaqazan89@gmail.com**
- Existing Booking property ID: **14364167**
- System URL: **https://hotel.aqssat.co**
- Country: Jordan — Mafraq, Al-Zuhour district

Happy to jump on a call or share read-only demo access to our PMS on request.
