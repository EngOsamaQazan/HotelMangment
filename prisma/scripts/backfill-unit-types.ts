/**
 * Backfill script: maps existing physical units to their canonical UnitType.
 *
 * Steps:
 *  1. Ensures the UnitType catalog is seeded.
 *  2. Updates each Unit.unitTypeId based on a fixed unitNumber → code map.
 *
 * Safe to re-run (idempotent). Call via `npm run db:backfill-units`.
 */

import { PrismaClient } from "@prisma/client";
import { seedUnitTypes } from "../seed-unit-types";

const prisma = new PrismaClient();

// ────────────────────────────────────────────────────────────────────────
// Canonical mapping: unitNumber → UnitType.code
// (agreed with business; do not change without a new plan)
// ────────────────────────────────────────────────────────────────────────
/**
 * Physical unit number → canonical `UnitType.code` (single source of truth
 * for re-linking).
 *
 * Confirmed with the owner on 2026-04-29:
 *   • 01-03         : STUDIOs (open-plan room + kitchenette), 20 JOD
 *   • 04            : 2-bedroom apartment "MIX-A" (queen + 3 singles), 35 JOD
 *   • 05            : 1-bedroom apartment, double bed, 25 JOD
 *   • 06            : 2-bedroom apartment "MIX-B" (queen + 2 singles), 35 JOD
 *   • 101           : VIP honeymoon suite with private jacuzzi, 65 JOD
 *   • 102, 103      : twin-single hotel rooms, 40 JOD
 *   • 104, 106, 107 : triple-single hotel rooms, 45 JOD
 *   • 105, 108      : king double rooms, 45 JOD
 *   • 109           : quadruple-single room, 50 JOD
 *
 * Note: the previous map sent units 01-03 to APT-1BR-DBL by mistake — they
 * are actually studios. HTL-SUITE was also removed from the catalogue
 * (the hotel doesn't own a standalone "suite" — what looked like one was
 * always two adjoining rooms via `unit_merges`).
 */
export const UNIT_TO_TYPE: Record<string, string> = {
  "01":  "STUDIO",
  "02":  "STUDIO",
  "03":  "STUDIO",
  "04":  "APT-2BR-MIX-A",
  "05":  "APT-1BR-DBL",
  "06":  "APT-2BR-MIX-B",
  "101": "HTL-VIP-HONEYMOON-JAC",
  "102": "HTL-TWIN",
  "103": "HTL-TWIN",
  "104": "HTL-TRIPLE",
  "105": "HTL-KING",
  "106": "HTL-TRIPLE",
  "107": "HTL-TRIPLE",
  "108": "HTL-KING",
  "109": "HTL-QUAD",
};

async function main() {
  console.log("🔁 بدء backfill لوحدات الفندق...\n");

  // 1) Ensure catalog exists
  await seedUnitTypes(prisma);

  // 2) Build code → id lookup
  const types = await prisma.unitType.findMany({ select: { id: true, code: true } });
  const typeIdByCode = new Map(types.map((t) => [t.code, t.id]));

  // 3) Link each physical unit
  const units = await prisma.unit.findMany({
    select: { id: true, unitNumber: true, unitTypeId: true },
    orderBy: { unitNumber: "asc" },
  });

  let linked = 0;
  let alreadyLinked = 0;
  const missing: string[] = [];

  for (const u of units) {
    const code = UNIT_TO_TYPE[u.unitNumber];
    if (!code) {
      missing.push(u.unitNumber);
      continue;
    }
    const typeId = typeIdByCode.get(code);
    if (!typeId) {
      console.warn(`⚠️  النوع ${code} غير موجود للوحدة ${u.unitNumber} (seed ناقص؟)`);
      missing.push(u.unitNumber);
      continue;
    }

    if (u.unitTypeId === typeId) {
      alreadyLinked++;
      continue;
    }

    await prisma.unit.update({
      where: { id: u.id },
      data: { unitTypeId: typeId },
    });
    console.log(`   • ${u.unitNumber.padEnd(4)} → ${code}`);
    linked++;
  }

  const total = units.length;
  const done = linked + alreadyLinked;
  console.log(
    `\n📊 ربط ${done}/${total} وحدة بنجاح (${linked} جديدة، ${alreadyLinked} مسبقًا).`,
  );
  if (missing.length > 0) {
    console.log(`⚠️  وحدات بلا نوع مطابق (${missing.length}): ${missing.join(", ")}`);
  }

  // 4) Final sanity check
  const unlinked = await prisma.unit.count({ where: { unitTypeId: null } });
  if (unlinked > 0) {
    console.log(`⚠️  ما زال هناك ${unlinked} وحدة بدون unitTypeId. راجع الخريطة.`);
  } else {
    console.log("✅ جميع الوحدات مرتبطة بأنواعها.");
  }
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error("❌ فشل backfill:", e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
