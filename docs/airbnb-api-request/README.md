# Airbnb connectivity — documents index

This folder contains the technical brief for connecting **Al-Mafraq Hotel Group**
to **Airbnb** through a **channel manager** (SiteMinder), since Airbnb does not
accept direct API applications from individual properties at this time.

| File                          | Audience                            | Format   |
|-------------------------------|-------------------------------------|----------|
| `technical-brief.md`          | Engineers, SiteMinder partner team  | Markdown |
| `technical-brief-ar.md`       | Internal Arabic reviewers / owner   | Markdown |
| `technical-brief.html`        | Printable PDF, business counterpart | HTML     |

## Why we are **not** sending this to Airbnb directly

Quote from `https://www.airbnb.com/partner`:

> "At this time, we are not accepting new access requests for our API. Our global
> team of partner managers will reach out to prospective partners based on the
> supply opportunity your business represents..."

Direct API access is closed. The brief is instead aimed at:

1. **Our own team** — to agree on the channel-manager-based architecture.
2. **SiteMinder's partner / onboarding team** — as a capability summary when we
   request developer credentials and room-type mapping support.
3. **Future OTA conversations** (Booking.com already has its own brief in
   `../booking-api-request/`).

## Printing to PDF

Open `technical-brief.html` in a Chromium-based browser and use
`Ctrl/Cmd + P` → "Save as PDF" (A4, default margins). Screenshots are reused
from `../booking-api-request/screenshots/` — same production UI, same modules.

## Checklist before we contact SiteMinder

- [ ] Airbnb host profile completed (ID, payout, taxes, cancellation policy).
- [ ] Airbnb listing(s) manually created, one per `UnitType`.
- [ ] SiteMinder account opened for Al-Mafraq Hotel Group.
- [ ] PMS schema matches §4 of the brief (UnitType redesign completed).
- [ ] `booking/credentials` module confirmed ready to receive a new provider
      entry (`SITEMINDER`).
- [ ] Sandbox + production credentials requested from SiteMinder.
- [ ] Adapter implementation planned per §6.
