/**
 * إعادة تنظيم كتالوج أنواع الوحدات بعد أخطاء إدخال (خلط بين رقم الغرفة و«نوع الوحدة»).
 *
 * الخطوات:
 *  1) `seedUnitTypes()` — يحدّث الكتالوج الرسمي (يشمل نوع جناح شهر العسل VIP + جاكوزي إن وُجد في seed).
 *  2) ربط كل `Unit` بـ `unitTypeId` حسب خريطة `UNIT_TO_TYPE` في `backfill-unit-types.ts`.
 *  3) اختياريًا: حذف أنواع «يتيمة» بلا وحدات مرتبطة ولا تظهر في `UNIT_TYPES` داخل seed
 *     (أي أنواع دُخلت من الواجهة بالخطأ وتبقى فارغة بعد إعادة الربط).
 *
 * الاستخدام (وجّه DATABASE_URL لقاعدة الإنتاج):
 *   npx ts-node --project tsconfig.scripts.json prisma/scripts/reorganize-unit-types.ts
 *   npx ts-node --project tsconfig.scripts.json prisma/scripts/reorganize-unit-types.ts --apply
 *   npx ts-node --project tsconfig.scripts.json prisma/scripts/reorganize-unit-types.ts --apply --remove-strays
 *
 * افتراضيًا وضع جاف (dry-run) — لا كتابة إلا مع `--apply`.
 * `--remove-strays` يحذف الأنواع اليتيمة غير المعرّفة في seed فقط (مع `--apply`).
 */

import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { seedUnitTypes, UNIT_TYPES } from "../seed-unit-types";
import { UNIT_TO_TYPE } from "./backfill-unit-types";

loadEnv({ path: ".env.local" });
loadEnv();

const prisma = new PrismaClient();

const OFFICIAL_CODES = new Set(UNIT_TYPES.map((t) => t.code));

function parseArgs() {
  const argv = process.argv.slice(2);
  return {
    apply: argv.includes("--apply"),
    skipSeed: argv.includes("--skip-seed"),
    skipLink: argv.includes("--skip-link"),
    removeStrays: argv.includes("--remove-strays"),
  };
}

async function main() {
  const { apply, skipSeed, skipLink, removeStrays } = parseArgs();

  if (!process.env.DATABASE_URL) {
    console.error("❌ يرجى ضبط DATABASE_URL (مثلاً في .env أو .env.local).");
    process.exit(1);
  }

  console.log(
    apply
      ? "⚠️  وضع التنفيذ — سيتم الكتابة في القاعدة.\n"
      : "ℹ️  وضع المعاينة فقط (dry-run). أضف --apply للتنفيذ.\n",
  );

  if (!skipSeed) {
    if (apply) {
      await seedUnitTypes(prisma);
      console.log("✅ اكتملت تهيئة أنواع الوحدات من seed.\n");
    } else {
      console.log("[dry-run] سيتم تشغيل seedUnitTypes() عند استخدام --apply.\n");
    }
  }

  const typeIdByCode = new Map(
    (await prisma.unitType.findMany({ select: { id: true, code: true } })).map(
      (t) => [t.code, t.id],
    ),
  );

  if (!skipLink) {
    const units = await prisma.unit.findMany({
      select: { id: true, unitNumber: true, unitTypeId: true },
      orderBy: { unitNumber: "asc" },
    });

    let wouldLink = 0;
    let unchanged = 0;
    const missingMap: string[] = [];

    for (const u of units) {
      const code = UNIT_TO_TYPE[u.unitNumber];
      if (!code) {
        missingMap.push(u.unitNumber);
        continue;
      }
      const typeId = typeIdByCode.get(code);
      if (!typeId) {
        console.warn(`⚠️  النوع ${code} غير موجود في القاعدة — شغّل seed أولًا.`);
        missingMap.push(u.unitNumber);
        continue;
      }
      if (u.unitTypeId === typeId) {
        unchanged++;
        continue;
      }
      wouldLink++;
      if (apply) {
        await prisma.unit.update({
          where: { id: u.id },
          data: { unitTypeId: typeId },
        });
        console.log(`   • وحدة ${u.unitNumber} → ${code} (id=${typeId})`);
      } else {
        console.log(`   [dry-run] ${u.unitNumber} → ${code} (كان unitTypeId=${u.unitTypeId})`);
      }
    }

    console.log(
      `\n📌 ربط الوحدات: ${wouldLink} تغيير، ${unchanged} بدون تغيير، خريطة ناقصة لـ ${missingMap.length} رقم وحدة.`,
    );
    if (missingMap.length > 0) {
      console.log(`   أرقام بلا مدخل في UNIT_TO_TYPE: ${missingMap.join(", ")}`);
    }
  }

  // أنواع بلا وحدات ولا تنتمي للكتالوج الرسمي في الكود
  const strays = await prisma.unitType.findMany({
    where: {
      NOT: { code: { in: [...OFFICIAL_CODES] } },
    },
    select: {
      id: true,
      code: true,
      nameAr: true,
      _count: { select: { units: true } },
    },
    orderBy: { id: "asc" },
  });

  const strayEmpty = strays.filter((s) => s._count.units === 0);
  const strayBusy = strays.filter((s) => s._count.units > 0);

  console.log(
    `\n🧹 أنواع غير مذكورة في seed: ${strays.length} (منها ${strayEmpty.length} بلا وحدات مرتبطة).`,
  );
  for (const s of strayEmpty) {
    console.log(`   • حذف مرشح: id=${s.id} code=${s.code} nameAr=${s.nameAr}`);
  }
  if (strayBusy.length > 0) {
    console.log(
      "\n⚠️  أنواع غير رسمية ما زالت مرتبطة بوحدات — لن تُحذف تلقائيًا. أضف رمزها إلى seed أو ادمجها يدويًا من الإعدادات:",
    );
    for (const s of strayBusy) {
      console.log(
        `   • id=${s.id} code=${s.code} nameAr=${s.nameAr} (وحدات: ${s._count.units})`,
      );
    }
  }

  if (removeStrays) {
    if (!apply) {
      console.error("\n❌ --remove-strays يتطلب --apply.");
      process.exit(1);
    }
    for (const s of strayEmpty) {
      await prisma.bookingPropertyMap.deleteMany({ where: { unitTypeId: s.id } });
      await prisma.unitType.delete({ where: { id: s.id } });
      console.log(`   🗑️  حُذف نوع يتيم id=${s.id} (${s.code})`);
    }
    console.log(`\n✅ حُذف ${strayEmpty.length} نوعًا يتيمًا.`);
  } else if (strayEmpty.length > 0) {
    console.log(
      "\n💡 لحذف الأنواع اليتيمة أعلاه بعد مراجعتها: أعد التشغيل مع --apply --remove-strays",
    );
  }

  if (!apply) {
    console.log(
      "\n— انتهت المعاينة. للتنفيذ على الإنتاج: ضبط DATABASE_URL ثم --apply (واختياريًا --remove-strays).",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
