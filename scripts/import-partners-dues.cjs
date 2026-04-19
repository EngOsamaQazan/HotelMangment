/**
 * ترحيل ذمم الشركاء من ملف Excel إلى النظام المحاسبي.
 *
 * - لا يُمسّ حساب الصندوق/البنك/المحفظة إطلاقاً.
 * - لكل صف دائن (مصروف دفعه الشريك من جيبه):
 *     DR 3100 الأرباح المحتجزة
 *     CR 2100 ذمم الشركاء (مع partyId)
 * - لكل صف مدين (دفعة وصلت للشريك):
 *     DR 2100 ذمم الشركاء (مع partyId)
 *     CR 3100 الأرباح المحتجزة
 * - Idempotent: يفحص وجود قيد سابق بنفس source/sourceRefId قبل الإنشاء.
 *
 * الاستخدام:
 *   node scripts/import-partners-dues.cjs            # تشغيل تجريبي
 *   node scripts/import-partners-dues.cjs --apply    # تشغيل فعلي
 */

require("dotenv").config();
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const FILE = String.raw`C:\Users\PC\Desktop\سجل مصاريف الفندق\سجل ذمم على الفندق للشركاء\سجل_ذمم_الشركاء_موحد.xlsx`;

const APPLY = process.argv.includes("--apply");

const CODES = {
  AP_PARTNERS: "2100",
  RETAINED_EARNINGS: "3100",
};

const SOURCE = "opening_partners";

// خريطة الأسماء كما تظهر في Excel → اسم الطرف في النظام
const PARTNER_NAME_MAP = {
  "ابو زيد الاصلي الغالي": "ابو زيد الاصلي الغالي",
  "اسامه ابو عمر": "اسامه قازان ابو عمر",
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

function parseAmount(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return round2(v);
  const s = String(v).replace(/[,\s]/g, "").trim();
  if (!s || s === "-") return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : round2(n);
}

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  // الشكل المتوقع من Excel: "YYYY/MM/DD"
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return new Date(Number(y), Number(mo) - 1, Number(d));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeName(name) {
  return String(name || "").trim();
}

async function ensureAccount(prisma, code) {
  const acc = await prisma.account.findUnique({ where: { code } });
  if (!acc) throw new Error(`حساب مفقود: ${code}. شغّل seed-accounting أولاً.`);
  return acc;
}

async function ensurePartnerParty(prisma, name, dryRun) {
  let party = await prisma.party.findFirst({
    where: { type: "partner", name },
  });

  if (!party) {
    if (dryRun) {
      return {
        id: -1,
        name,
        type: "partner",
        __willCreate: true,
      };
    }
    party = await prisma.party.create({
      data: {
        name,
        type: "partner",
        isActive: true,
      },
    });
  }

  // ربط حساب AP-Partners الرئيسي
  const apAccount = await ensureAccount(prisma, CODES.AP_PARTNERS);

  if (!dryRun && party.apAccountId !== apAccount.id) {
    party = await prisma.party.update({
      where: { id: party.id },
      data: { apAccountId: apAccount.id },
    });
  }

  // إنشاء حساب رأس المال والمسحوبات للشريك (لم يُستخدم هنا، لكن يجب أن يكون متاحاً)
  if (!dryRun) {
    const capitalCode = `3010-${party.id}`;
    await prisma.account.upsert({
      where: { code: capitalCode },
      update: {},
      create: {
        code: capitalCode,
        name: `رأس مال - ${name}`,
        type: "equity",
        subtype: "capital",
        normalBalance: "credit",
        parentId: (await prisma.account.findUnique({ where: { code: "3010" } }))?.id ?? null,
        isSystem: false,
        isActive: true,
      },
    });

    const drawCode = `3020-${party.id}`;
    await prisma.account.upsert({
      where: { code: drawCode },
      update: {},
      create: {
        code: drawCode,
        name: `مسحوبات - ${name}`,
        type: "equity",
        subtype: "drawing",
        normalBalance: "debit",
        parentId: (await prisma.account.findUnique({ where: { code: "3020" } }))?.id ?? null,
        isSystem: false,
        isActive: true,
      },
    });
  }

  return party;
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

async function ensurePeriod(tx, date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const period = await tx.fiscalPeriod.findUnique({
    where: { year_month: { year, month } },
  });
  if (period && period.status === "closed") {
    throw new Error(`الفترة ${month}/${year} مقفلة`);
  }
  if (!period) {
    await tx.fiscalPeriod.create({ data: { year, month, status: "open" } });
  }
}

async function postEntry(tx, input) {
  const date = input.date instanceof Date ? input.date : new Date(input.date);
  await ensurePeriod(tx, date);

  let totalDebit = 0;
  let totalCredit = 0;
  const prepared = [];
  for (let i = 0; i < input.lines.length; i++) {
    const l = input.lines[i];
    const d = round2(l.debit || 0);
    const c = round2(l.credit || 0);
    totalDebit += d;
    totalCredit += c;
    prepared.push({
      accountId: l.accountId,
      partyId: l.partyId ?? null,
      debit: d,
      credit: c,
      description: l.description ?? null,
      lineOrder: i + 1,
    });
  }
  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(`قيد غير متوازن: DR=${totalDebit}, CR=${totalCredit}`);
  }

  const entryNumber = await nextEntryNumber(tx, date.getFullYear());
  return tx.journalEntry.create({
    data: {
      entryNumber,
      date,
      description: input.description,
      reference: input.reference ?? null,
      source: input.source,
      sourceRefId: input.sourceRefId ?? null,
      status: "posted",
      totalDebit,
      totalCredit,
      lines: { create: prepared },
    },
  });
}

function readRows() {
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  // الصفوف الفعلية تبدأ من السطر 4 في Excel = index 3
  // كل صف: [#, التاريخ, الدائن, التفاصيل, مدين, دائن, الرصيد]
  const rows = [];
  for (let i = 3; i < raw.length; i++) {
    const r = raw[i];
    if (!r || r.length === 0) continue;
    const num = String(r[0] || "").trim();
    if (!num) continue;
    // تخطي صفوف الإجمالي في النهاية
    if (!/^\d+$/.test(num)) continue;
    rows.push({
      rowIndex: Number(num),
      dateRaw: r[1],
      creditor: normalizeName(r[2]),
      details: normalizeName(r[3]),
      debit: parseAmount(r[4]),
      credit: parseAmount(r[5]),
    });
  }
  return rows;
}

async function main() {
  const prisma = new PrismaClient();
  console.log(`🔁 ترحيل ذمم الشركاء ${APPLY ? "— تشغيل فعلي" : "— تشغيل تجريبي (dry-run)"}\n`);

  const rows = readRows();
  console.log(`📑 إجمالي الصفوف المقروءة: ${rows.length}\n`);

  // حسابات أساسية
  const apAccount = await ensureAccount(prisma, CODES.AP_PARTNERS);
  const reAccount = await ensureAccount(prisma, CODES.RETAINED_EARNINGS);

  // استخراج الشركاء الفريدين من الملف
  const uniqueCreditors = [...new Set(rows.map((r) => r.creditor))].filter(Boolean);
  console.log(`👥 الشركاء في الملف: ${uniqueCreditors.length}`);
  for (const c of uniqueCreditors) {
    const mapped = PARTNER_NAME_MAP[c] || c;
    console.log(`   • "${c}" ← سيُرحّل كـ "${mapped}"`);
  }
  console.log();

  // إنشاء/العثور على الأطراف
  const partyMap = {};
  for (const rawName of uniqueCreditors) {
    const name = PARTNER_NAME_MAP[rawName] || rawName;
    const party = await ensurePartnerParty(prisma, name, !APPLY);
    partyMap[rawName] = party;
    console.log(
      `   ${party.__willCreate ? "+ سيُنشأ" : "✓ موجود"} party: ${party.name} (id=${party.id})`
    );
  }
  console.log();

  let created = 0;
  let skipped = 0;
  let totalDR = 0;
  let totalCR = 0;
  const partnerTotals = {};

  for (const row of rows) {
    const party = partyMap[row.creditor];
    if (!party) {
      console.warn(`⚠️ تخطي الصف #${row.rowIndex}: لم يُعثر على الشريك "${row.creditor}"`);
      continue;
    }

    const date = parseDate(row.dateRaw);
    if (!date) {
      console.warn(`⚠️ تخطي الصف #${row.rowIndex}: تاريخ غير صالح "${row.dateRaw}"`);
      continue;
    }

    const amount = row.credit > 0 ? row.credit : row.debit;
    if (amount <= 0) {
      console.warn(`⚠️ تخطي الصف #${row.rowIndex}: لا مبلغ`);
      continue;
    }

    // هل هذا القيد مُرحَّل مسبقاً؟
    if (APPLY) {
      const existing = await prisma.journalEntry.findFirst({
        where: { source: SOURCE, sourceRefId: row.rowIndex, status: "posted" },
      });
      if (existing) {
        skipped++;
        continue;
      }
    }

    // تحديد المدين والدائن
    // credit > 0 في Excel (الشريك دفع) → CR AP-Partner
    // debit > 0 في Excel (تم الدفع للشريك) → DR AP-Partner
    const partnerIsCredited = row.credit > 0;

    const lines = partnerIsCredited
      ? [
          // DR 3100
          {
            accountId: reAccount.id,
            debit: amount,
            credit: 0,
            description: row.details,
          },
          // CR AP-Partner
          {
            accountId: apAccount.id,
            partyId: party.id > 0 ? party.id : null,
            debit: 0,
            credit: amount,
            description: `ذمة ${party.name} - ${row.details}`,
          },
        ]
      : [
          // DR AP-Partner
          {
            accountId: apAccount.id,
            partyId: party.id > 0 ? party.id : null,
            debit: amount,
            credit: 0,
            description: `تسوية ذمة ${party.name} - ${row.details}`,
          },
          // CR 3100
          {
            accountId: reAccount.id,
            debit: 0,
            credit: amount,
            description: row.details,
          },
        ];

    totalDR += amount;
    totalCR += amount;

    const partnerKey = party.name;
    if (!partnerTotals[partnerKey]) {
      partnerTotals[partnerKey] = { debit: 0, credit: 0 };
    }
    if (partnerIsCredited) partnerTotals[partnerKey].credit += amount;
    else partnerTotals[partnerKey].debit += amount;

    if (APPLY) {
      await prisma.$transaction(async (tx) => {
        await postEntry(tx, {
          date,
          description: `[ترحيل ذمم الشركاء] ${row.details}`,
          reference: `صف #${row.rowIndex}`,
          source: SOURCE,
          sourceRefId: row.rowIndex,
          lines,
        });
      });
      created++;
    }
  }

  console.log("\n━━━ الملخص ━━━\n");
  console.log(`القيود المُنشأة: ${created}`);
  if (skipped) console.log(`القيود المُتخطاة (مُرحّلة مسبقاً): ${skipped}`);
  console.log();

  console.log("الأرصدة المتوقعة لكل شريك (من ملف Excel):");
  for (const [name, t] of Object.entries(partnerTotals)) {
    const bal = round2(t.credit - t.debit);
    console.log(`  • ${name}: دائن=${t.credit.toFixed(3)} - مدين=${t.debit.toFixed(3)} = رصيد ${bal.toFixed(3)}`);
  }
  console.log();

  if (APPLY) {
    console.log("التحقق من الأرصدة في قاعدة البيانات...");
    for (const [rawName] of Object.entries(partnerTotals)) {
      const party = partyMap[Object.keys(PARTNER_NAME_MAP).find(k => (PARTNER_NAME_MAP[k] || k) === rawName) || rawName];
      if (!party || party.id < 0) continue;
      const agg = await prisma.journalLine.aggregate({
        where: { partyId: party.id, entry: { status: "posted" } },
        _sum: { debit: true, credit: true },
      });
      const dr = Number(agg._sum.debit || 0);
      const cr = Number(agg._sum.credit || 0);
      console.log(`  ✓ ${party.name}: DB → CR=${cr.toFixed(3)} DR=${dr.toFixed(3)} رصيد=${(cr - dr).toFixed(3)}`);
    }
  }

  console.log(`\nإجمالي مدين = ${round2(totalDR).toFixed(3)} | إجمالي دائن = ${round2(totalCR).toFixed(3)}`);
  console.log(Math.abs(totalDR - totalCR) < 0.01 ? "✅ متوازن" : "❌ غير متوازن");

  if (!APPLY) {
    console.log("\n💡 لم يتم حفظ أي شيء. أعد التشغيل مع --apply للحفظ الفعلي.");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ خطأ:", e);
  process.exit(1);
});
