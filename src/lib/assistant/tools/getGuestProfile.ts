import "server-only";
import { prisma } from "@/lib/prisma";
import type { ToolJsonSchema } from "@/lib/llm/types";
import { normalizeArabic } from "../arabic";
import {
  err,
  ok,
  type AssistantToolContext,
  type AssistantToolResult,
} from "../types";

// ---------------------------------------------------------------------------
// getGuestProfile — answers "كم مرة زار؟ / كم دفع؟ / متى آخر زيارة؟"
// ---------------------------------------------------------------------------
// The guests page (src/app/guests/page.tsx) renders a deduplicated CRM-style
// profile per *physical person* by walking every reservation and grouping by
// idNumber → phone → name. We mirror that exact logic here, but for a single
// search query, so the model can answer aggregate questions in one tool call
// without resorting to free-form SQL.
//
// Matching is case- and Arabic-fold insensitive (same `normalizeArabic` used
// elsewhere) and runs against:
//   - the reservation's lead-guest fields (guestName, phone, guestIdNumber)
//   - every Guest child row (fullName, idNumber)
// so legacy reservations without Guest rows still match.
// ---------------------------------------------------------------------------

export interface GetGuestProfileInput {
  query: string;
  limit?: number;
}

interface StaySummary {
  reservationId: number;
  checkIn: string;
  checkOut: string;
  status: string;
  unitNumber: string;
  totalAmount: number;
  paidAmount: number;
  remaining: number;
  source: string;
}

interface GuestProfile {
  fullName: string;
  idNumber: string;
  nationality: string;
  phone: string | null;
  /** How many reservations this person appears on (any status). */
  stayCount: number;
  /** Stays excluding cancelled/pending_hold (the "real" visits). */
  realisedStayCount: number;
  /** Currently checked-in stay, if any. */
  inHouseStay: StaySummary | null;
  /** Next upcoming stay. */
  upcomingStay: StaySummary | null;
  /** Most recent stay (any status). */
  lastStay: StaySummary | null;
  firstStayAt: string | null;
  lastStayAt: string | null;
  totalSpent: number;
  totalOutstanding: number;
  /** Up to 5 most recent stays for quick reference. */
  recentStays: StaySummary[];
}

export interface GetGuestProfileOutput {
  profiles: GuestProfile[];
  /** Echo so the model knows what was searched. */
  query: string;
  hint: string;
}

export const getGuestProfileSchema: ToolJsonSchema = {
  name: "getGuestProfile",
  description:
    "ابحث عن ضيف باسمه أو رقم هاتفه أو رقم هويّته وأرجع ملفه المختصر: عدد الزيارات (stayCount), أول/آخر زيارة, مجموع ما دفعه, ما تبقى عليه, الإقامة الحالية إن كان نازلاً الآن, والإقامات الخمس الأخيرة. استعملها فوراً للإجابة على \"كم مرّة زار؟\", \"كم دفع؟\", \"متى آخر زيارة؟\", \"هل هو نازل الآن؟\". تعتمد على نفس منطق صفحة /guests, ودمج الأسماء يتم بحسب رقم الهويّة ثم الهاتف ثم الاسم.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "اسم الضيف أو رقم هاتفه أو رقم هويّته. يقبل أي شكل عربي (مع/بدون همزة، ألف ممدودة، …) ويتجاهل اختلافات الحروف الصغيرة/الكبيرة.",
      },
      limit: {
        type: ["integer", "null"],
        description: "أقصى عدد ضيوف مختلفين يُعادون (افتراضي 5، حد أقصى 15).",
      },
    },
    required: ["query", "limit"],
    additionalProperties: false,
  },
};

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 15;

export async function getGuestProfile(
  input: GetGuestProfileInput,
  _ctx: AssistantToolContext,
): Promise<AssistantToolResult<GetGuestProfileOutput>> {
  const raw = (input?.query ?? "").trim();
  if (!raw) return err({ code: "bad_input", message: "query فارغ", field: "query" });

  const limit = Math.max(1, Math.min(input?.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const folded = normalizeArabic(raw);
  const phoneQuery = raw.replace(/[^0-9+]/g, "");
  const idDigits = raw.replace(/\D+/g, "");

  // Pull every non-pending_hold reservation. The dataset is hotel-scoped and
  // the existing /api/guests endpoint walks the same set, so volume is fine.
  const reservations = await prisma.reservation.findMany({
    where: { status: { not: "pending_hold" } },
    include: {
      unit: { select: { unitNumber: true } },
      guests: { orderBy: { guestOrder: "asc" } },
    },
    orderBy: { id: "desc" },
  });

  interface NormalisedPerson {
    fullName: string;
    idNumber: string;
    nationality: string;
    phone: string;
  }

  const profiles = new Map<string, GuestProfile>();
  const matchedKeys = new Set<string>();

  const matchesQuery = (p: NormalisedPerson): boolean => {
    if (!folded && !phoneQuery && !idDigits) return false;
    const nameFolded = normalizeArabic(p.fullName);
    if (folded && nameFolded.includes(folded)) return true;
    if (
      phoneQuery.length >= 4 &&
      p.phone &&
      p.phone.replace(/[^0-9+]/g, "").includes(phoneQuery)
    ) {
      return true;
    }
    if (idDigits.length >= 4 && p.idNumber && p.idNumber.replace(/\D+/g, "").includes(idDigits)) {
      return true;
    }
    return false;
  };

  for (const r of reservations) {
    const resPhone = (r.phone ?? "").trim();
    const resNationality = (r.nationality ?? "").trim();
    const resGuestName = r.guestName.trim();
    const resGuestId = (r.guestIdNumber ?? "").trim();

    const peoples: NormalisedPerson[] = [];
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
      continue;
    }

    const stay: StaySummary = {
      reservationId: r.id,
      checkIn: r.checkIn.toISOString(),
      checkOut: r.checkOut.toISOString(),
      status: r.status,
      unitNumber: r.unit?.unitNumber ?? "—",
      totalAmount: r.totalAmount,
      paidAmount: r.paidAmount,
      remaining: r.remaining,
      source: r.source,
    };

    // Did *any* person on this reservation match the query? If yes, we want
    // to bring in their full history (not just this stay), so we record
    // their key, then in a 2nd pass we'll re-walk all reservations and
    // collect every stay that touches that key.
    for (const person of peoples) {
      if (!matchesQuery(person)) continue;
      const key = person.idNumber
        ? `id:${person.idNumber}`
        : person.phone
          ? `np:${person.fullName.toLowerCase()}|${person.phone}`
          : `name:${person.fullName.toLowerCase()}`;
      matchedKeys.add(key);

      let prof = profiles.get(key);
      if (!prof) {
        prof = {
          fullName: person.fullName || resGuestName || "ضيف",
          idNumber: person.idNumber,
          nationality: person.nationality || "",
          phone: person.phone || null,
          stayCount: 0,
          realisedStayCount: 0,
          inHouseStay: null,
          upcomingStay: null,
          lastStay: null,
          firstStayAt: null,
          lastStayAt: null,
          totalSpent: 0,
          totalOutstanding: 0,
          recentStays: [],
        };
        profiles.set(key, prof);
      }
      // Identity enrichment.
      if (!prof.nationality && person.nationality) prof.nationality = person.nationality;
      if (!prof.phone && person.phone) prof.phone = person.phone;
      if (!prof.idNumber && person.idNumber) prof.idNumber = person.idNumber;

      // Bookkeeping.
      prof.stayCount += 1;
      if (stay.status !== "cancelled") prof.realisedStayCount += 1;
      prof.recentStays.push(stay);

      const checkInTs = new Date(stay.checkIn).getTime();
      const checkOutTs = new Date(stay.checkOut).getTime();
      if (!prof.firstStayAt || checkInTs < new Date(prof.firstStayAt).getTime()) {
        prof.firstStayAt = stay.checkIn;
      }
      if (!prof.lastStayAt || checkInTs > new Date(prof.lastStayAt).getTime()) {
        prof.lastStayAt = stay.checkIn;
        prof.lastStay = stay;
      }
      if (stay.status !== "cancelled") {
        prof.totalSpent += stay.paidAmount;
        if (stay.remaining > 0) prof.totalOutstanding += stay.remaining;
      }
      const now = Date.now();
      if (stay.status === "active" && checkInTs <= now && checkOutTs >= now) {
        prof.inHouseStay = stay;
      }
      if (stay.status === "upcoming" && checkInTs >= now) {
        if (
          !prof.upcomingStay ||
          checkInTs < new Date(prof.upcomingStay.checkIn).getTime()
        ) {
          prof.upcomingStay = stay;
        }
      }
    }
  }

  // Trim recent stays per profile to 5 (most recent first).
  for (const p of profiles.values()) {
    p.recentStays.sort(
      (a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime(),
    );
    p.recentStays = p.recentStays.slice(0, 5);
  }

  // Order: in-house first, then by lastStayAt desc, then by stayCount desc.
  const ordered = [...profiles.values()].sort((a, b) => {
    const inA = a.inHouseStay ? 0 : 1;
    const inB = b.inHouseStay ? 0 : 1;
    if (inA !== inB) return inA - inB;
    const lastA = a.lastStayAt ? new Date(a.lastStayAt).getTime() : 0;
    const lastB = b.lastStayAt ? new Date(b.lastStayAt).getTime() : 0;
    if (lastA !== lastB) return lastB - lastA;
    return b.stayCount - a.stayCount;
  });

  const trimmed = ordered.slice(0, limit);
  const hint =
    trimmed.length === 0
      ? "لم أعثر على أي ضيف يطابق هذا البحث في سجل الحجوزات. تأكّد من الاسم/الهاتف أو جرّب كلمة أقصر."
      : trimmed.length === 1
        ? "تطابق واحد. استعمل الأرقام مباشرة في جوابك للموظف."
        : "عدّة ضيوف يطابقون البحث. اعرض على الموظف الأسماء وادعه يختار قبل المتابعة.";

  return ok({ profiles: trimmed, query: raw, hint });
}
