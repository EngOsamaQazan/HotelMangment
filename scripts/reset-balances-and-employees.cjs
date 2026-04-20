/**
 * قيد تسوية افتتاحية + تحديث بيانات الموظفين.
 *
 * يُطبَّق على كلا القاعدتين (الإنتاج + المحلي) للحفاظ على التطابق.
 *
 * Idempotent: يفحص وجود القيد عبر `source="adjustment"` و`reference="OPENING-2026-04-20"`
 * قبل الإنشاء.
 *
 * الاستخدام:
 *   node scripts/reset-balances-and-employees.cjs           # تشغيل تجريبي
 *   node scripts/reset-balances-and-employees.cjs --apply   # تطبيق فعلي
 *
 *   TARGET_DB=prod node ...    # فقط على الإنتاج
 *   TARGET_DB=local node ...   # فقط على المحلي
 */

const LOCAL =
  "postgresql://fakher_user:FakherHotel2026Secure@127.0.0.1:5432/fakher_hotel?schema=public";
const PROD =
  "postgresql://fakher_user:FakherHotel2026Secure@127.0.0.1:15432/fakher_hotel?schema=public";

const APPLY = process.argv.includes("--apply");
const TARGET = (process.env.TARGET_DB || "both").toLowerCase();

const ADJUSTMENT_DATE = new Date("2026-04-20T12:00:00.000Z");
const ADJUSTMENT_REF = "OPENING-2026-04-20";

// Target balances (reality, per user):
const TARGET_CASH = 100.0;
const TARGET_WALLET = 55.193;

function round2(n) {
  return Math.round(n * 100) / 100;
}
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

async function nextEntryNumber(tx, year) {
  const key = `je:${year}`;
  const counter = await tx.accountingCounter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
  });
  return `JE-${year}-${String(counter.value).padStart(6, "0")}`;
}

async function run(label, url) {
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient({ datasources: { db: { url } } });
  console.log(`\n══════ ${label} ══════`);

  // ---- 1) Gather current balances ----
  const [cashAcc, walletAcc, retainedAcc] = await Promise.all([
    p.account.findUnique({ where: { code: "1010" } }),
    p.account.findUnique({ where: { code: "1030" } }),
    p.account.findUnique({ where: { code: "3100" } }),
  ]);
  if (!cashAcc || !walletAcc || !retainedAcc) {
    console.log("❌ حسابات أساسية غير موجودة (1010/1030/3100). تخطّي.");
    await p.$disconnect();
    return;
  }

  const balFor = async (accId) => {
    const agg = await p.journalLine.aggregate({
      where: { accountId: accId, entry: { status: "posted" } },
      _sum: { debit: true, credit: true },
    });
    return round3(Number(agg._sum.debit || 0) - Number(agg._sum.credit || 0));
  };

  const cashBal = await balFor(cashAcc.id);
  const walletBal = await balFor(walletAcc.id);
  const cashDelta = round3(TARGET_CASH - cashBal);
  const walletDelta = round3(TARGET_WALLET - walletBal);

  console.log(`الصندوق:   حالي=${cashBal}   هدف=${TARGET_CASH}   فرق=${cashDelta}`);
  console.log(`المحفظة:  حالي=${walletBal}   هدف=${TARGET_WALLET}   فرق=${walletDelta}`);

  // ---- 2) Upsert employees ----
  const asem = await p.party.findFirst({
    where: { type: "employee", name: { contains: "عاصم" } },
  });
  const ihab = await p.party.findFirst({
    where: { type: "employee", name: { contains: "إيهاب" } },
  });

  console.log(`عاصم: id=${asem?.id ?? "(غير موجود)"}`);
  console.log(`إيهاب: id=${ihab?.id ?? "(غير موجود)"}`);

  // ---- 3) Check if adjustment already applied ----
  const existing = await p.journalEntry.findFirst({
    where: { source: "adjustment", reference: ADJUSTMENT_REF },
  });
  if (existing) {
    console.log(`⚠ القيد ${ADJUSTMENT_REF} موجود مسبقاً (id=${existing.id}). لن يُنشأ مجدداً.`);
  }

  if (!APPLY) {
    console.log("\n[تشغيل تجريبي — لم يُحفظ شيء]");
    await p.$disconnect();
    return;
  }

  // ---- 4) Apply ----
  await p.$transaction(async (tx) => {
    // a) Create adjustment entry (if absent and non-zero deltas)
    const needsAdjustment = !existing && (Math.abs(cashDelta) > 0.001 || Math.abs(walletDelta) > 0.001);
    if (needsAdjustment) {
      const lines = [];
      let order = 1;
      if (Math.abs(cashDelta) > 0.001) {
        const isDR = cashDelta > 0;
        lines.push({
          accountId: isDR ? cashAcc.id : cashAcc.id,
          debit: isDR ? Math.abs(cashDelta) : 0,
          credit: isDR ? 0 : Math.abs(cashDelta),
          description: `تسوية رصيد الصندوق ليطابق الواقع (${TARGET_CASH} د.أ)`,
          lineOrder: order++,
        });
      }
      if (Math.abs(walletDelta) > 0.001) {
        const isDR = walletDelta > 0;
        lines.push({
          accountId: walletAcc.id,
          debit: isDR ? Math.abs(walletDelta) : 0,
          credit: isDR ? 0 : Math.abs(walletDelta),
          description: `تسوية رصيد المحفظة الإلكترونية ليطابق الواقع (${TARGET_WALLET} د.أ)`,
          lineOrder: order++,
        });
      }
      const totalDR = lines.reduce((s, l) => s + l.debit, 0);
      const totalCR = lines.reduce((s, l) => s + l.credit, 0);
      const counterAmt = round3(totalDR - totalCR);
      if (Math.abs(counterAmt) > 0.001) {
        lines.push({
          accountId: retainedAcc.id,
          debit: counterAmt < 0 ? Math.abs(counterAmt) : 0,
          credit: counterAmt > 0 ? counterAmt : 0,
          description: "تسوية افتتاحية — رصيد مقابل",
          lineOrder: order++,
        });
      }

      const finalDR = lines.reduce((s, l) => s + l.debit, 0);
      const finalCR = lines.reduce((s, l) => s + l.credit, 0);

      const entryNumber = await nextEntryNumber(tx, 2026);
      const entry = await tx.journalEntry.create({
        data: {
          entryNumber,
          date: ADJUSTMENT_DATE,
          description: "قيد تسوية افتتاحية لتطابق الأرصدة مع الواقع في 2026-04-20",
          source: "adjustment",
          sourceRefId: null,
          reference: ADJUSTMENT_REF,
          status: "posted",
          totalDebit: round2(finalDR),
          totalCredit: round2(finalCR),
          lines: { create: lines.map((l) => ({ ...l, debit: round3(l.debit), credit: round3(l.credit) })) },
        },
      });
      console.log(`✅ قيد التسوية أُنشئ: ${entry.entryNumber}`);
    } else if (existing) {
      console.log(`   تخطّي إنشاء قيد التسوية (موجود)`);
    } else {
      console.log(`   لا حاجة لقيد تسوية (الأرصدة تطابق الواقع)`);
    }

    // b) Update Asem: terminated
    if (asem) {
      await tx.party.update({
        where: { id: asem.id },
        data: {
          isActive: false,
          terminationDate: ADJUSTMENT_DATE,
          notes:
            "تم إنهاء خدماته في 2026-04-20. حساب مصفّر — لا ذمم متبادلة.",
        },
      });
      console.log(`✅ عاصم قازان: isActive=false + terminationDate + ملاحظة`);
    }

    // c) Update Ihab: salary metadata
    if (ihab) {
      await tx.party.update({
        where: { id: ihab.id },
        data: {
          baseSalary: 380,
          commissionRate: 0.05,
          salaryPayDay: 1,
          jobTitle: "موظف فندق",
          notes:
            "راتب أساسي 380 د.أ شهرياً + عمولة 5% على إيرادات الإيجار. يُصرف الراتب أول كل شهر. يتم خصم السلف من الراتب عند الصرف.",
        },
      });
      console.log(`✅ إيهاب النشار: baseSalary=380, commissionRate=5%, payDay=1`);
    }
  });

  // ---- 5) Verify final balances ----
  const [newCash, newWallet] = await Promise.all([
    balFor(cashAcc.id),
    balFor(walletAcc.id),
  ]);
  console.log(`\nبعد التطبيق:`);
  console.log(`  الصندوق: ${newCash} (هدف: ${TARGET_CASH})  ${Math.abs(newCash - TARGET_CASH) < 0.001 ? "✅" : "⚠"}`);
  console.log(`  المحفظة: ${newWallet} (هدف: ${TARGET_WALLET})  ${Math.abs(newWallet - TARGET_WALLET) < 0.001 ? "✅" : "⚠"}`);

  await p.$disconnect();
}

(async () => {
  console.log(APPLY ? "🔧 وضع التطبيق الفعلي" : "👁  وضع التشغيل التجريبي");
  console.log(`الهدف: ${TARGET}`);
  if (TARGET === "prod" || TARGET === "both") await run("PROD ", PROD);
  if (TARGET === "local" || TARGET === "both") await run("LOCAL", LOCAL);
})().catch((e) => {
  console.error("❌", e.message);
  console.error(e.stack);
  process.exit(1);
});
