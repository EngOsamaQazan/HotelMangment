/**
 * Snapshot legacy bed-level combinability data before dropping the columns.
 *
 * Writes a machine-readable dump to `.maintenance/legacy-combinable-beds.json`
 * and a human-readable summary to `.maintenance/legacy-combinable-beds.md`.
 *
 * Usage: `npx tsx prisma/scripts/snapshot-legacy-combinable.ts`
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface LegacyRow {
  unitTypeId: number;
  unitTypeCode: string;
  unitTypeNameAr: string;
  roomId: number;
  roomNameAr: string;
  bedId: number;
  bedType: string;
  count: number;
  combinable: boolean;
  combinesToType: string | null;
  sleepsExtra: boolean;
  notes: string | null;
}

async function main() {
  const outDir = path.join(process.cwd(), ".maintenance");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const beds = await prisma.unitTypeBed.findMany({
    where: { combinable: true },
    include: {
      room: {
        include: {
          unitType: {
            select: { id: true, code: true, nameAr: true },
          },
        },
      },
    },
    orderBy: [{ room: { unitTypeId: "asc" } }, { roomId: "asc" }, { id: "asc" }],
  });

  const rows: LegacyRow[] = beds.map((b) => ({
    unitTypeId: b.room.unitType.id,
    unitTypeCode: b.room.unitType.code,
    unitTypeNameAr: b.room.unitType.nameAr,
    roomId: b.room.id,
    roomNameAr: b.room.nameAr,
    bedId: b.id,
    bedType: b.bedType,
    count: b.count,
    combinable: b.combinable,
    combinesToType: b.combinesToType,
    sleepsExtra: b.sleepsExtra,
    notes: b.notes,
  }));

  const jsonPath = path.join(outDir, "legacy-combinable-beds.json");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      { capturedAt: new Date().toISOString(), count: rows.length, rows },
      null,
      2,
    ),
    "utf8",
  );

  const mdLines: string[] = [
    "# Legacy bed-level combinability snapshot",
    "",
    `Captured at: ${new Date().toISOString()}`,
    `Total rows with \`combinable=true\`: **${rows.length}**`,
    "",
    "This snapshot was taken right before the `combinable` / `combines_to_type`",
    "columns on `unit_type_beds` were dropped. Use it if you later need to",
    "identify which unit types historically had bed-level combinability set, so",
    "you can create the equivalent `UnitMerge` rows (room-to-room merging).",
    "",
    "| UnitType (AR) | Code | Room | Bed | Count | CombinesTo | SleepsExtra | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    mdLines.push(
      `| ${r.unitTypeNameAr} | ${r.unitTypeCode} | ${r.roomNameAr} | ${r.bedType} | ${r.count} | ${r.combinesToType ?? "—"} | ${r.sleepsExtra ? "✓" : "—"} | ${r.notes ?? ""} |`,
    );
  }
  if (rows.length === 0) {
    mdLines.push("| _no rows_ | | | | | | | |");
  }
  fs.writeFileSync(path.join(outDir, "legacy-combinable-beds.md"), mdLines.join("\n") + "\n", "utf8");

  console.log(`✓ Snapshot written:`);
  console.log(`  - ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`  - rows: ${rows.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
