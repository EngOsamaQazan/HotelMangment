import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { legacyTypeFromUnitTypeRef } from "@/lib/units/legacy-type";

// ---------------------------------------------------------------------------
// Guest CRM API
// ---------------------------------------------------------------------------
// Historically this endpoint returned a flat `Guest[]` — one row per person per
// reservation. That matched the DB but produced a "flat" UI with no way to see
// repeat visitors, lifetime value, or the guest's current stay status.
//
// The new shape is a *deduplicated guest profile* — one entry per real person,
// keyed by national-ID (fallback: name+phone) — with:
//   • aggregate metrics   (stayCount, totalSpent, totalOutstanding, first/last)
//   • behavioural tags    (inhouse, arriving_today, repeat, new, has_balance)
//   • the most-recent, in-house, and upcoming stays pre-extracted
//   • a compact `stays[]` timeline (capped) so the detail drawer is instant
//
// The list is still bounded in size (per-hotel), so we do the grouping in Node
// rather than SQL. This keeps the endpoint portable across Prisma adapters and
// avoids fiddly raw queries. If volume ever grows we can move to a dedicated
// materialised view.
// ---------------------------------------------------------------------------

interface StaySummary {
  reservationId: number;
  checkIn: string;
  checkOut: string;
  status: string;
  unitNumber: string;
  unitType: string;
  totalAmount: number;
  paidAmount: number;
  remaining: number;
  source: string;
  actualCheckInAt: string | null;
  actualCheckOutAt: string | null;
}

interface GuestProfile {
  /** Stable key used by the client to request the guest's detail. */
  key: string;
  fullName: string;
  idNumber: string;
  nationality: string;
  phone: string | null;
  /** Behavioural tags, computed server-side. */
  tags: string[];
  /** How many reservations this person has appeared on (primary or accompanying). */
  stayCount: number;
  /** Lifetime stats (cancelled stays are excluded from financial totals). */
  totalSpent: number;
  totalOutstanding: number;
  /** ISO timestamps of the first and last stay (checkIn). */
  firstStayAt: string | null;
  lastStayAt: string | null;
  /** Pre-extracted stays for the UI's "at-a-glance" badges. */
  inHouseStay: StaySummary | null;
  upcomingStay: StaySummary | null;
  lastStay: StaySummary | null;
  /** Up to the 10 most recent stays — used to render the side-drawer timeline. */
  stays: StaySummary[];
}

interface Summary {
  totalGuests: number;
  inHouse: number;
  arrivingToday: number;
  departingToday: number;
  repeat: number;
  withBalance: number;
  newThisMonth: number;
}

export async function GET(request: Request) {
  try {
    await requirePermission("guests:view");
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const segment = (searchParams.get("segment") || "all").toLowerCase();
    const nationality = (searchParams.get("nationality") || "").trim();

    // We iterate over *reservations*, not the `Guest` child table. Legacy
    // reservations (and most walk-ins) don't always have a row in `guests` —
    // their data lives on the reservation itself (`guestName`, `guestIdNumber`,
    // `nationality`, `phone`). Pulling from `guests` alone hides them all and
    // the list looks empty. For each reservation we:
    //   • process every `Guest` child (primary + accompanying), AND
    //   • if there are zero child rows, synthesise a single virtual "primary"
    //     guest from the reservation's own fields so it still shows up.
    // This matches the way the rest of the app already treats the reservation
    // as the source of truth for the lead guest's identity.
    const reservations = await prisma.reservation.findMany({
      // Exclude short-lived holds — they aren't real guests yet.
      where: { status: { not: "pending_hold" } },
      include: {
        unit: {
          include: {
            unitTypeRef: { select: { category: true } },
          },
        },
        guests: { orderBy: { guestOrder: "asc" } },
      },
      orderBy: { id: "desc" },
    });

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Build a map keyed by "best available" identity so the same physical
    // person collapses into one profile even across reservations.
    const profiles = new Map<string, GuestProfile>();

    interface NormalisedGuest {
      fullName: string;
      idNumber: string;
      nationality: string;
      phone: string;
    }

    for (const r of reservations) {
      const resPhone = (r.phone ?? "").trim();
      const resNationality = (r.nationality ?? "").trim();
      const resGuestName = r.guestName.trim();
      const resGuestId = (r.guestIdNumber ?? "").trim();

      // 1) Real `Guest` children if any; 2) synthesise a virtual primary guest
      //    from the reservation fields when the list is empty or when the
      //    reservation's primary guest isn't represented (legacy data).
      const peoples: NormalisedGuest[] = [];
      if (r.guests.length > 0) {
        for (const g of r.guests) {
          peoples.push({
            fullName: g.fullName.trim(),
            idNumber: g.idNumber.trim(),
            nationality: (g.nationality || resNationality).trim(),
            phone: resPhone,
          });
        }
      } else if (resGuestName) {
        peoples.push({
          fullName: resGuestName,
          idNumber: resGuestId,
          nationality: resNationality,
          phone: resPhone,
        });
      } else {
        // Nothing we can key on — skip. Avoids a "black hole" profile that
        // would swallow every nameless legacy reservation.
        continue;
      }

      const stay: StaySummary = {
        reservationId: r.id,
        checkIn: r.checkIn.toISOString(),
        checkOut: r.checkOut.toISOString(),
        status: r.status,
        unitNumber: r.unit.unitNumber,
        unitType: legacyTypeFromUnitTypeRef(r.unit.unitTypeRef),
        totalAmount: r.totalAmount,
        paidAmount: r.paidAmount,
        remaining: r.remaining,
        source: r.source,
        actualCheckInAt: r.actualCheckInAt ? r.actualCheckInAt.toISOString() : null,
        actualCheckOutAt: r.actualCheckOutAt ? r.actualCheckOutAt.toISOString() : null,
      };

      for (const person of peoples) {
        // Key priority: ID number (globally unique) → phone → name only.
        // Anonymous rows fall back to `res:<reservationId>:<name>` so they
        // never collide with unrelated people who happen to share the same
        // blank name.
        const key = person.idNumber
          ? `id:${person.idNumber}`
          : person.phone
            ? `np:${person.fullName.toLowerCase()}|${person.phone}`
            : person.fullName
              ? `name:${person.fullName.toLowerCase()}|res:${r.id}`
              : `res:${r.id}`;

        let profile = profiles.get(key);
        if (!profile) {
          profile = {
            key,
            fullName: person.fullName || resGuestName || "ضيف",
            idNumber: person.idNumber,
            nationality: person.nationality || "",
            phone: person.phone || null,
            tags: [],
            stayCount: 0,
            totalSpent: 0,
            totalOutstanding: 0,
            firstStayAt: null,
            lastStayAt: null,
            inHouseStay: null,
            upcomingStay: null,
            lastStay: null,
            stays: [],
          };
          profiles.set(key, profile);
        }

        // Stay-history bookkeeping --------------------------------------------
        profile.stayCount += 1;
        profile.stays.push(stay);
        if (!profile.nationality && person.nationality) {
          profile.nationality = person.nationality;
        }
        if (!profile.phone && person.phone) profile.phone = person.phone;

        const checkInTs = new Date(stay.checkIn).getTime();
        const checkOutTs = new Date(stay.checkOut).getTime();
        if (!profile.firstStayAt || checkInTs < new Date(profile.firstStayAt).getTime()) {
          profile.firstStayAt = stay.checkIn;
        }
        if (!profile.lastStayAt || checkInTs > new Date(profile.lastStayAt).getTime()) {
          profile.lastStayAt = stay.checkIn;
          profile.lastStay = stay;
        }

        // Exclude cancellations from financial totals.
        if (stay.status !== "cancelled") {
          profile.totalSpent += stay.paidAmount;
          if (stay.remaining > 0) profile.totalOutstanding += stay.remaining;
        }

        // Flag the *currently-open* stay (active & not yet checked out today).
        if (
          stay.status === "active" &&
          checkInTs <= now.getTime() &&
          checkOutTs >= startOfToday.getTime()
        ) {
          profile.inHouseStay = stay;
        }
        // Flag the next upcoming stay.
        if (stay.status === "upcoming" && checkInTs >= startOfToday.getTime()) {
          if (
            !profile.upcomingStay ||
            checkInTs < new Date(profile.upcomingStay.checkIn).getTime()
          ) {
            profile.upcomingStay = stay;
          }
        }
      }
    }

    // Finalise each profile: tags, sorted stays, capped timeline.
    const all: GuestProfile[] = [];
    for (const p of profiles.values()) {
      p.stays.sort(
        (a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime(),
      );
      // Keep the timeline compact to control payload size.
      const recent = p.stays.slice(0, 10);
      p.stays = recent;

      const tags: string[] = [];
      if (p.inHouseStay) tags.push("inhouse");
      if (p.upcomingStay) tags.push("upcoming");
      if (
        p.upcomingStay &&
        new Date(p.upcomingStay.checkIn).getTime() >= startOfToday.getTime() &&
        new Date(p.upcomingStay.checkIn).getTime() < endOfToday.getTime()
      ) {
        tags.push("arriving_today");
      }
      if (
        p.inHouseStay &&
        new Date(p.inHouseStay.checkOut).getTime() >= startOfToday.getTime() &&
        new Date(p.inHouseStay.checkOut).getTime() < endOfToday.getTime()
      ) {
        tags.push("departing_today");
      }
      if (p.stayCount >= 3) tags.push("repeat");
      else if (p.stayCount === 1) tags.push("new");
      if (p.totalOutstanding > 0) tags.push("has_balance");
      if (
        p.firstStayAt &&
        new Date(p.firstStayAt).getTime() >= startOfMonth.getTime()
      ) {
        tags.push("new_this_month");
      }
      p.tags = tags;
      all.push(p);
    }

    // Sort: in-house first, then arriving-today, then by lastStay desc.
    all.sort((a, b) => {
      const rank = (p: GuestProfile) => {
        if (p.inHouseStay) return 0;
        if (p.tags.includes("arriving_today")) return 1;
        if (p.upcomingStay) return 2;
        return 3;
      };
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      const la = a.lastStayAt ? new Date(a.lastStayAt).getTime() : 0;
      const lb = b.lastStayAt ? new Date(b.lastStayAt).getTime() : 0;
      return lb - la;
    });

    // Compute summary KPIs over the *full* profile set, before filtering.
    const summary: Summary = {
      totalGuests: all.length,
      inHouse: all.filter((p) => p.inHouseStay).length,
      arrivingToday: all.filter((p) => p.tags.includes("arriving_today")).length,
      departingToday: all.filter((p) => p.tags.includes("departing_today")).length,
      repeat: all.filter((p) => p.stayCount >= 3).length,
      withBalance: all.filter((p) => p.totalOutstanding > 0).length,
      newThisMonth: all.filter((p) => p.tags.includes("new_this_month")).length,
    };

    // Apply filters ----------------------------------------------------------
    const searchLower = search.toLowerCase();
    let filtered = all;
    if (searchLower) {
      filtered = filtered.filter((p) => {
        return (
          p.fullName.toLowerCase().includes(searchLower) ||
          p.idNumber.toLowerCase().includes(searchLower) ||
          (p.phone ?? "").toLowerCase().includes(searchLower) ||
          p.nationality.toLowerCase().includes(searchLower)
        );
      });
    }
    if (nationality) {
      filtered = filtered.filter((p) => p.nationality === nationality);
    }
    switch (segment) {
      case "inhouse":
        filtered = filtered.filter((p) => p.inHouseStay);
        break;
      case "arriving":
        filtered = filtered.filter((p) => p.tags.includes("arriving_today"));
        break;
      case "departing":
        filtered = filtered.filter((p) => p.tags.includes("departing_today"));
        break;
      case "upcoming":
        filtered = filtered.filter((p) => p.upcomingStay);
        break;
      case "repeat":
        filtered = filtered.filter((p) => p.stayCount >= 3);
        break;
      case "new":
        // "جدد" in the UI means "new guests this month" — which is what the
        // KPI card counts (tag `new_this_month` = single stay + first stay
        // falls within the current month). Keep the filter aligned so the
        // number on the tab always matches the rows rendered below it.
        filtered = filtered.filter((p) => p.tags.includes("new_this_month"));
        break;
      case "balance":
        filtered = filtered.filter((p) => p.totalOutstanding > 0);
        break;
      case "all":
      default:
        // no-op
        break;
    }

    // List of nationalities present in the dataset — feeds the filter dropdown.
    const nationalitySet = new Set<string>();
    for (const p of all) {
      if (p.nationality) nationalitySet.add(p.nationality);
    }
    const nationalities = [...nationalitySet].sort((a, b) => a.localeCompare(b));

    return NextResponse.json({
      guests: filtered,
      summary,
      nationalities,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/guests error:", error);
    return NextResponse.json(
      { error: "Failed to fetch guests" },
      { status: 500 },
    );
  }
}
