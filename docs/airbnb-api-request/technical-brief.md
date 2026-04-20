# Al-Mafraq Hotel Group — Airbnb Connectivity Plan via SiteMinder

**Technical Brief for Channel-Manager-Based Airbnb Integration**

Date: April 2026
Property owner: Osama Qazan — `osamaqazan89@gmail.com`
Existing Airbnb account: `osamaqazan89@gmail.com` (currently guest-only — will be converted to Host)
Country / City: Jordan — Mafraq, Al-Zuhour district
Property: **Al-Mafraq Hotel** (hotel rooms + serviced apartments)

---

## 0. Why this brief exists

Airbnb does **not** accept direct API access requests from individual hotels. Per the
official partner page (`https://www.airbnb.com/partner`):

> "At this time, we are not accepting new access requests for our API. Our global
> team of partner managers will reach out to prospective partners based on the
> supply opportunity your business represents, strength of your technology, and
> ability to support our shared customers."

The only viable path for a single property to achieve real-time inventory, rate,
availability, and reservation sync with Airbnb is to integrate through an
**approved Connectivity Partner / Channel Manager**.

This brief documents the path we have chosen: **SiteMinder** as the channel
manager, with our in-house PMS integrating to SiteMinder's `pmsXchange` API.

---

## 1. Executive summary

We operate an **in-house Property Management System (PMS)** built specifically
for our hotel group (3 properties, 1 currently live on Booking.com as property
ID **14364167**, 2 more being onboarded).

We will use **SiteMinder** as our channel manager because:

- SiteMinder is an **officially approved Airbnb connectivity partner**
  (ref: `https://siteminder.com/channel-manager/airbnb-hotels`).
- SiteMinder provides a public, documented REST/SOAP API (`pmsXchange` for PMS→CM
  and `SiteMinder Exchange / SMX` for reservation retrieval).
- Single integration reaches **Airbnb + Booking.com + Expedia + Agoda + 420+
  other channels** — no per-OTA bespoke work on our side.

Our PMS becomes the **single source of truth**; SiteMinder acts as the
fan-out/fan-in layer for every distribution channel.

The system is already in production at `https://hotel.aqssat.co` and is used
daily by reception, housekeeping, and accounting teams.

---

## 2. Target topology

```
+-------------------+      pmsXchange (REST + SOAP)
|   Fakher PMS      |  <----------------------->  +-----------------+
|  (this codebase)  |                              |   SiteMinder    |
|                   |       SMX Reservations       |   Platform      |
|  Single source    |  <-----------------------    |                 |
|   of truth        |                              +-----------------+
+-------------------+                                     | |
                                                          | |
                                +-------------------------+ +--------+
                                |                                    |
                                v                                    v
                        +---------------+                    +---------------+
                        |    Airbnb     |                    | Booking.com,  |
                        |   (via CM)    |                    | Expedia, etc. |
                        +---------------+                    +---------------+
```

- **Push direction (ARI)**: PMS → SiteMinder → each OTA
  - Rates, availability, restrictions (MinLOS, CTA, CTD, stop-sell).
- **Pull direction (reservations)**: each OTA → SiteMinder → PMS
  - New reservations, modifications, cancellations; guest + payment details.
- **Mapping**: each PMS `UnitType` → SiteMinder `RoomType` → Airbnb `Listing` +
  Booking `RoomType` + Expedia `RoomType`.

---

## 3. System overview

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

All external integrations are encrypted at rest with AES-256-GCM via an HKDF-derived
key, seeded from `BOOKING_ENC_KEY`. See `src/lib/booking/encryption.ts`. The same
credentials vault will store SiteMinder API keys and the per-channel mapping
tokens Airbnb issues via SiteMinder.

---

## 4. Data model alignment

Our PMS schema already maps cleanly onto SiteMinder's `pmsXchange` objects:

| PMS concept (Prisma)   | SiteMinder object           | Airbnb concept            |
|------------------------|-----------------------------|---------------------------|
| `UnitType`             | `RoomType`                  | `Listing`                 |
| `UnitTypeBed`          | Room bed configuration      | Bed configuration         |
| `Unit`                 | (inventory count per type)  | (managed by SM)           |
| `Rate`                 | `RatePlan`                  | Nightly price / min stay  |
| `Reservation`          | `Reservation`               | Reservation               |
| `Guest`                | Guest profile               | Guest                     |
| `Amenity` / `Photo`    | Content attributes          | Amenities / photos        |

The current `UnitType` redesign (see `docs/plans/unit-types-redesign.md`)
normalizes these fields exactly to what SiteMinder expects: `maxOccupancy`,
`bedroomCount`, `livingRoomCount`, `bathroomCount`, per-type bed list,
amenity list, photo gallery, and seasonal `Rate` records.

A listing **is** a `UnitType` (one Airbnb listing per hotel room category,
with an inventory count equal to the number of physical units of that type).
This matches Airbnb's "Hotels / Boutique Hotel" model and avoids the
operational nightmare of maintaining 20+ identical per-room listings.

---

## 5. APIs we will consume from SiteMinder

Ordered by implementation priority:

1. **pmsXchange — Content / Room setup**
   Create and update room types, amenities, bed configurations, photos, and
   descriptions. Target endpoints: `OTA_HotelDescriptiveContentNotif`,
   `OTA_HotelRoomList`.

2. **pmsXchange — ARI (Availability, Rates, Inventory)**
   Push nightly availability, nightly rates, and restrictions.
   Target messages: `OTA_HotelAvailNotif`, `OTA_HotelRateAmountNotif`,
   `OTA_HotelInvCountNotif`.

3. **SiteMinder Exchange (SMX) — Reservation retrieval**
   Pull new, modified, and cancelled reservations from every connected channel
   (including Airbnb). We will consume the REST/JSON variant and fall back to
   SOAP/XML where required.

4. **Webhooks / notifications**
   Subscribe to SiteMinder reservation webhooks so we ingest bookings
   near-real-time (< 30s) rather than polling.

5. **Static content sync (photos, descriptions)**
   Nightly job that reconciles any drift between our PMS and SiteMinder's
   content store.

For each stream we will implement:

- **Idempotent consumers** keyed on SiteMinder message IDs.
- **Exponential-backoff retry** with a dead-letter queue.
- **Structured logging** with correlation IDs across PMS ↔ SiteMinder ↔ OTA.
- **Channel-level feature flags** so Airbnb can be paused without affecting
  Booking.com.

---

## 6. Internal modules that already exist

Most of the plumbing needed for a channel-manager integration is already live:

- **Reservations** — full CRUD with check-in/out flows, deposits, balance
  tracking, cancellation, and channel attribution (already supports a `source`
  field such as `BOOKING`, `AIRBNB`, `DIRECT`, `WALK_IN`).
- **Unit types, beds, amenities, photos** — the normalized model described
  in §4; upload UI and amenity picker already ship.
- **Seasons & Rates (`UnitTypePrice`, `Season`)** — seasonal pricing with
  per-unit-type rate calendars, exactly what SiteMinder ARI expects.
- **Booking integration skeleton** — `src/app/api/booking/*` already contains:
  - `credentials/` — encrypted store for third-party provider credentials
    (AES-256-GCM, HMAC-tagged).
  - `inbox/` — raw webhook capture with signature verification.
  - `jobs/` — job queue for outbound ARI pushes with retry + status history.
  - `property-map/` — mapping between our unit types and the external
    provider's room types.
- **Reports — Monthly** — revenue, occupancy, ADR, RevPAR, channel mix.
- **Tasks (Kanban)** — ops board for exceptions (mapping errors, rate
  mismatches, booking parity alerts).
- **Notifications** — realtime bell with unread counter; Postgres triggers
  fan out to Socket.IO.
- **Permissions registry** — 40+ capabilities, enforced on every API route.

**Only channel-specific adapters are missing.** We will add:

- `src/lib/channel-managers/siteminder/` — pmsXchange client + SMX client.
- New `ChannelProvider` enum value (`SITEMINDER`) alongside the existing
  `BOOKING_COM` helper.
- New module `src/app/settings/channel-managers/` — UI to store SiteMinder
  credentials, map room types to SiteMinder RoomTypes, and view push history.
- Permissions registered per `.cursor/skills/add-module-permissions/SKILL.md`.

---

## 7. Security & compliance

- TLS everywhere (Let's Encrypt, auto-renewed).
- Credentials at rest: AES-256-GCM + HMAC tags, no plaintext.
- Outbound webhooks verified via HMAC signatures (already implemented for
  Booking; reused for SiteMinder).
- Full audit log for sensitive operations (reservation edits, rate changes,
  permission changes, channel mapping changes).
- GDPR: guest data can be anonymized / exported on request.
- Edge rate limiting (`src/lib/rateLimit.ts`).
- We can sign and honor a DPA with SiteMinder.

---

## 8. Rollout plan

| Phase | Scope                                                                 | ETA     |
|-------|-----------------------------------------------------------------------|---------|
| 0     | Sign up for SiteMinder, list Al-Mafraq via SiteMinder's onboarding    | 2 weeks |
| 1     | Request SiteMinder developer credentials (sandbox + production)       | 1 week  |
| 2     | Build pmsXchange client (Content + ARI), map UnitTypes → RoomTypes    | 3 weeks |
| 3     | Build SMX client (REST/JSON reservations + webhooks), inbound ingest  | 2 weeks |
| 4     | End-to-end test in sandbox: push ARI → verify on Airbnb staging       | 1 week  |
| 5     | Certification + go-live for property 14364167                         | 1 week  |
| 6     | Onboard properties 2 & 3 under the same SiteMinder account            | 2 weeks |
| 7     | Monitoring dashboards, on-call rotation, parity alerts                | 1 week  |

Total: ~13 weeks from commitment to full production across 3 properties and
Airbnb + Booking + Expedia.

---

## 9. What we need next — action items

### On the business side

1. **Open a SiteMinder account** for Al-Mafraq Hotel Group.
2. **Convert Airbnb account** (`osamaqazan89@gmail.com`) from guest to host.
3. **Complete Airbnb host profile**: ID verification, payout method, tax
   information, host profile photo, cancellation policy.
4. **Create the Airbnb listing manually** as a "Boutique Hotel" (or
   equivalent Jordan-supported category) with photos and descriptions. This
   is a SiteMinder onboarding prerequisite before API mapping.
5. **Request SiteMinder ↔ Airbnb connection** from SiteMinder support once
   the Airbnb listing exists; provide both account IDs.

### On the technical side

1. Request SiteMinder **developer credentials** (sandbox + production).
2. Store them in our `booking/credentials` module under a new `SITEMINDER`
   provider entry.
3. Implement the adapter per §6.
4. Certify per SiteMinder's certification checklist.
5. Flip the production feature flag.

---

## 10. Alternatives considered

| Option                                      | Verdict                        |
|---------------------------------------------|--------------------------------|
| Apply directly to Airbnb for API access     | ❌ Closed to new applicants    |
| Use Hostaway (vacation-rental oriented)     | ❌ Less ideal for hotel rooms  |
| Use Cloudbeds (PMS + CM in one)             | ❌ Would replace our own PMS   |
| Use STAAH (Middle-East focused)             | ✅ Viable backup; similar plan |
| Use SiteMinder (chosen)                     | ✅ Strongest API + OTA reach   |
| Manage Airbnb manually (no API)             | ⚠️ Not scalable beyond 1 unit type |

---

## 11. Contact

- Owner & technical sponsor: **Osama Qazan**
- Email: **osamaqazan89@gmail.com**
- Existing Booking.com property ID: **14364167**
- Airbnb account (to be converted to host): **osamaqazan89@gmail.com**
- System URL: **https://hotel.aqssat.co**
- Country: Jordan — Mafraq, Al-Zuhour district

Happy to jump on a call with SiteMinder's partner manager or share
read-only demo access to our PMS on request.
