# SiteMinder Trial Account — Registration Log

**Date submitted:** 2026-04-20
**Channel Manager:** [SiteMinder](https://www.siteminder.com/)
**Plan track:** 14-day Free Trial (21–50 rooms tier)
**Status:** ⏳ Awaiting callback from SiteMinder sales expert (typically 24–48h)

---

## Why SiteMinder?

Chosen as the primary channel manager because it maximizes extensibility:

| Capability | SiteMinder |
|---|---|
| Airbnb official connectivity partner | ✅ Yes |
| Booking.com direct API (replaces our scraping bot) | ✅ Yes |
| Expedia, Agoda, Hotels.com, Trip.com | ✅ 450+ OTAs |
| Self-service trial available | ✅ 14 days |
| Documented developer APIs (pmsXchange + SMX) | ✅ Yes |
| GDS support (Amadeus, Sabre, Travelport) | ✅ Yes |
| Supports groups/chains (future upgrade) | ✅ Yes |

This single account becomes the hub through which all future OTA channels are added — no need to build a separate integration per OTA.

---

## Registration Details Submitted

| Field | Value |
|---|---|
| First Name | Osama |
| Last Name | Qazan |
| Email | osamaqazan89@gmail.com |
| Phone | +962 797707062 |
| Company / Property Name | Al Mafraq Hotel Group |
| Rooms tier | 21–50 rooms |
| Country code | +962 (Jordan) |
| Marketing consent | Accepted (newsletters, webinars) |
| How heard about us | Search engine |

**Confirmation page received:**
> "Thank you for choosing SiteMinder — It's nice to meet you Al Mafraq Hotel Group. You're on your way to unlocking more revenue for your business. One of our experts will be in touch shortly to get you started."

Redirect URL after submission: `https://www.siteminder.com/thank-you-free-trial/`

---

## What to expect next (from SiteMinder)

1. **Within 0–24h:** Welcome email to `osamaqazan89@gmail.com`. Check inbox + spam folder. Add `@siteminder.com` to trusted senders.
2. **Within 24–48h:** A sales rep (likely from the Dubai / EMEA office) will call **+962 797707062** to:
   - Qualify the property (number of rooms at Al Mafraq, occupancy, current OTAs used, existing PMS — tell them it's our in-house **Fakher PMS** built in Next.js/Prisma).
   - Offer a 15-min product demo.
   - Confirm pricing (typically ~USD 60–130/month per property for Channel Manager, depending on region).
   - Provision the trial dashboard (username, temporary password, login URL).
3. **After dashboard access:**
   - Verify login at `app.siteminder.com` (or `siteminder360.com` — the new platform name).
   - Upload property content (Al Mafraq Hotel details, photos, amenities, room types).
   - Request the **Airbnb connection** from inside the SiteMinder dashboard.
   - Link existing **Booking.com** listing (Extranet ID 14364167) — this replaces our Playwright bot long-term.
4. **Request developer credentials:**
   - Sandbox API credentials for `pmsXchange` (ARI + content push).
   - Sandbox API credentials for `SiteMinder Exchange (SMX)` (reservation pulls + webhooks).
   - Production credentials after certification.

---

## Talking Points for the Sales Call

When SiteMinder contacts Osama, these points will unlock faster provisioning:

1. **Primary goal:** connect Airbnb first, then migrate the existing Booking.com property (ID `14364167`) off of Extranet scraping onto the official SiteMinder connection.
2. **PMS:** in-house system called **Fakher** (Next.js 16 App Router + Prisma + PostgreSQL). We are an IT-capable property — request developer API access from day 1.
3. **Property count now:** 1 (Al Mafraq Hotel, ~21–50 rooms). **Near-term:** 3 properties (Al Mafraq Hotel + 2 more under setup). **Plan:** upgrade to Groups plan once all 3 are live.
4. **OTAs needed (priority order):**
   - Airbnb (new)
   - Booking.com (migrate existing)
   - Expedia (new)
   - Agoda (new)
   - Trip.com / Ctrip (optional)
5. **Technical integration:** we will consume `pmsXchange` (XML/REST) for ARI push and `SMX` (REST/JSON + webhooks) for reservation retrieval. We need sandbox access for development.

---

## Parallel Tasks (start now, while waiting for SiteMinder callback)

- [ ] Complete Airbnb host profile (ID verification, payout method, tax info).
- [ ] Set up PMS integration skeleton:
  - [ ] Refactor Prisma schema to add a `provider` enum field to existing `Booking*` tables (turn them into generic `Channel*` tables supporting multiple providers).
  - [ ] Create `src/lib/channel-managers/` directory with a unified `ChannelManagerAdapter` interface.
  - [ ] Scaffold `SiteMinderAdapter` with stub methods (`pushRates`, `pushAvailability`, `pullReservations`).
- [ ] Create `src/app/settings/channel-managers/` page to enter SiteMinder credentials (using existing `encryption.ts`).
- [ ] Generate PDF from `technical-brief.html` to send ahead of the SiteMinder call (shows we're serious).
- [ ] Store the technical brief in a shared drive for the sales rep's reference.

---

## Key URLs

| Purpose | URL |
|---|---|
| SiteMinder homepage | https://www.siteminder.com/ |
| Login (future) | https://app.siteminder.com/ |
| Developer portal | https://developer.siteminder.com/ |
| API docs (pmsXchange) | https://developer.siteminder.com/docs/pmsxchange |
| API docs (SMX) | https://developer.siteminder.com/docs/smx |
| Integrations catalog (verify Airbnb support) | https://www.siteminder.com/integrations/ |
| Support | https://www.siteminder.com/support/ |

---

## Audit Trail

- **2026-04-20 ~07:14 AM Amman time** — Account request submitted via in-product browser automation.
- **2026-04-20 ~07:14 AM** — Marketing consent given, survey ("How did you hear about us") answered: "Search engine".

When the sales email arrives, append its details below:

- [ ] Welcome email received: _(date / subject)_
- [ ] Callback received from: _(name / office / date)_
- [ ] Trial credentials provisioned: _(username / login URL / expiry date)_
- [ ] Sandbox API credentials received: _(date)_
- [ ] Production API credentials received: _(date)_
