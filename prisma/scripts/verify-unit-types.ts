/**
 * One-off verification for Phase 1 acceptance criteria.
 * Run via: npx ts-node --project tsconfig.scripts.json prisma/scripts/verify-unit-types.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const units = await prisma.unit.findMany({
    include: { unitTypeRef: { select: { code: true, nameAr: true } } },
    orderBy: { unitNumber: "asc" },
  });

  console.log(`\n📦 Units (total: ${units.length}):`);
  for (const u of units) {
    const linked = u.unitTypeRef
      ? `${u.unitTypeRef.code}  (${u.unitTypeRef.nameAr})`
      : "— NOT LINKED —";
    console.log(`   ${u.unitNumber.padEnd(4)} → ${linked}`);
  }

  const unlinked = units.filter((u) => !u.unitTypeRef).length;
  const reservations = await prisma.reservation.count();
  const amenities = await prisma.amenity.count();
  const unitTypes = await prisma.unitType.count();
  const rooms = await prisma.unitTypeRoom.count();
  const beds = await prisma.unitTypeBed.count();
  const amenityLinks = await prisma.unitTypeAmenity.count();

  console.log(`\n📊 Counts:`);
  console.log(`   Unlinked units : ${unlinked}`);
  console.log(`   Reservations   : ${reservations}`);
  console.log(`   Amenities      : ${amenities}`);
  console.log(`   UnitTypes      : ${unitTypes}`);
  console.log(`   Rooms          : ${rooms}`);
  console.log(`   Beds           : ${beds}`);
  console.log(`   Amenity links  : ${amenityLinks}`);

  console.log(`\n🛏️  Bed composition per type:`);
  const types = await prisma.unitType.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      rooms: {
        orderBy: { position: "asc" },
        include: { beds: true },
      },
    },
  });
  for (const t of types) {
    console.log(`\n   ${t.code}  |  ${t.nameAr}  (maxOcc=${t.maxOccupancy})`);
    for (const r of t.rooms) {
      const bedsDesc = r.beds.length
        ? r.beds
            .map(
              (b) =>
                `${b.count}×${b.bedType}${b.sleepsExtra ? " [extra]" : ""}`,
            )
            .join(", ")
        : "no beds";
      console.log(`     • ${r.nameAr.padEnd(20)} [${r.kind}]  →  ${bedsDesc}`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
