/**
 * Imports "سجل مصاريف الفندق" Excel file into the double-entry accounting system.
 *
 * Default = DRY RUN (prints proposed entries without writing).
 * Pass --apply to actually post journal entries.
 *
 * Usage:
 *   node scripts/import-expenses-excel.cjs              # dry-run
 *   node scripts/import-expenses-excel.cjs --apply      # commit
 */
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const APPLY = process.argv.includes("--apply");
const FOLDER = "C:\\Users\\PC\\Desktop\\سجل مصاريف الفندق";

const prisma = new PrismaClient();

// ─────────── New accounts to ensure exist (codes 5060/5070/5080 + 1030) ───────────
const EXTRA_ACCOUNTS = [
  {
    code: "1030",
    name: "المحفظة الإلكترونية",
    type: "asset",
    subtype: "wallet",
    normalBalance: "debit",
    isSystem: false,
    description: "المحفظة الإلكترونية/الرقمية (CliQ, eFAWATEERcom, etc.)",
  },
  {
    code: "5060",
    name: "تسويق وإعلانات",
    type: "expense",
    subtype: "marketing",
    normalBalance: "debit",
    isSystem: false,
    description: "حملات فيسبوك/جوجل وغيرها من الإعلانات الرقمية",
  },
  {
    code: "5070",
    name: "أتعاب مهنية ورسوم حكومية",
    type: "expense",
    subtype: "fees",
    normalBalance: "debit",
    isSystem: false,
    description: "رسوم تراخيص، سجلات تجارية، أتعاب استشارات مهنية",
  },
  {
    code: "5080",
    name: "خدمات تقنية واشتراكات",
    type: "expense",
    subtype: "tech",
    normalBalance: "debit",
    isSystem: false,
    description: "اشتراكات برامج، خدمات سحابية، أدوات إدارة",
  },
];

// ─────────── Parties to ensure exist ───────────
const EMPLOYEES_TO_ENSURE = [
  { name: "إيهاب النشار", type: "employee" },
  { name: "عاصم قازان", type: "employee", notes: "موظف سابق — تسوية" },
];

// ─────────── Classification rules per row (by #) ───────────
// Each rule returns { category, accountCode, partyName?, note? }.
// category ∈ salary | advance | transfer | expense
const ROW_RULES = {
  1:  { category: "expense", accountCode: "5030" }, // maintenance
  2:  { category: "expense", accountCode: "5050" },
  3:  { category: "expense", accountCode: "5050" },
  4:  { category: "expense", accountCode: "5060", note: "إعلانات فيسبوك" },
  5:  { category: "advance", accountCode: "2110", partyName: "إيهاب النشار", note: "سلفة" },
  6:  { category: "expense", accountCode: "5050" },
  7:  { category: "expense", accountCode: "5030" },
  8:  { category: "expense", accountCode: "5060", note: "إعلانات فيسبوك/جوجل" },
  9:  { category: "expense", accountCode: "5060", note: "إعلانات فيسبوك" },
  10: { category: "expense", accountCode: "5050" },
  11: { category: "expense", accountCode: "5070", note: "سجلات تجارية" },
  12: { category: "salary",  accountCode: "5010", partyName: "إيهاب النشار", note: "دفعة راتب" },
  13: { category: "expense", accountCode: "5030" },
  14: { category: "expense", accountCode: "5030" },
  15: { category: "expense", accountCode: "5050" },
  16: { category: "salary",  accountCode: "5010", partyName: "إيهاب النشار", note: "دفعة راتب" },
  17: { category: "expense", accountCode: "5030" },
  18: { category: "salary",  accountCode: "5010", partyName: "عاصم قازان", note: "تسوية موظف سابق" },
  19: { category: "transfer", fromCode: "1010", toCode: "1030", note: "تحويل من الصندوق إلى المحفظة" },
  20: { category: "expense", accountCode: "5040" }, // hospitality
  21: { category: "expense", accountCode: "5020" }, // utilities
  22: { category: "expense", accountCode: "5030" },
  23: { category: "salary",  accountCode: "5010", partyName: "عاصم قازان", note: "تسوية موظف سابق" },
};

// ─────────── Helpers ───────────
function findExcelFile() {
  const files = fs
    .readdirSync(FOLDER)
    .filter((f) => f.toLowerCase().endsWith(".xlsx"));
  if (!files.length) throw new Error(`لا يوجد ملف xlsx في ${FOLDER}`);
  return path.join(FOLDER, files[0]);
}

function parseRows(file) {
  const wb = XLSX.readFile(file, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: "",
  });
  // header on row 3 (index 2). Data from row 4 onwards until "الإجمالي"
  const out = [];
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    const seq = r[0];
    if (!seq || String(seq).trim() === "" || String(seq).includes("الإجمالي")) break;
    const n = Math.round(Number(seq));
    if (!Number.isFinite(n) || n <= 0) break;
    out.push({
      row: n,
      description: String(r[1] || "").trim(),
      sheetCategory: String(r[2] || "").trim(),
      amount: Number(String(r[3] || "0").replace(/,/g, "")) || 0,
      currency: String(r[4] || "").trim(),
      notes: String(r[5] || "").trim(),
      page: String(r[6] || "").trim(),
    });
  }
  return { sheetName, entries: out };
}

async function ensureAccount(tx, def) {
  return tx.account.upsert({
    where: { code: def.code },
    update: {},
    create: def,
  });
}

async function ensureEmployee(tx, name) {
  let p = await tx.party.findFirst({ where: { type: "employee", name } });
  if (!p) {
    p = await tx.party.create({
      data: { name, type: "employee", isActive: true },
    });
  }
  if (!p.apAccountId) {
    const ap = await tx.account.findUnique({ where: { code: "2110" } });
    if (ap) {
      await tx.party.update({
        where: { id: p.id },
        data: { apAccountId: ap.id },
      });
      p.apAccountId = ap.id;
    }
  }
  return p;
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

function buildEntryDate() {
  // الملف يقول "أبريل 2026" — نستخدم آخر يوم من أبريل
  return new Date(2026, 3, 30, 12, 0, 0); // April = month 3 (0-indexed)
}

// ─────────── Main ───────────
async function main() {
  const file = findExcelFile();
  console.log("📂 الملف:", path.basename(file));
  console.log("🔧 الوضع:", APPLY ? "APPLY (كتابة فعلية)" : "DRY-RUN (عرض فقط)");
  console.log("─".repeat(70));

  const { entries } = parseRows(file);
  console.log(`📄 تم تحليل ${entries.length} بند`);

  const missingRules = entries.filter((e) => !ROW_RULES[e.row]);
  if (missingRules.length) {
    console.log("⚠️  بنود بلا قاعدة تصنيف:", missingRules.map((e) => e.row).join(","));
  }

  // ── Pre-check proposed entries ──
  const proposed = entries.map((e) => {
    const rule = ROW_RULES[e.row] || { category: "expense", accountCode: "5050" };
    return { ...e, rule };
  });

  const byAccount = {};
  let totalOut = 0;
  for (const e of proposed) {
    totalOut += e.amount;
    const key = e.rule.accountCode || e.rule.toCode || "?";
    byAccount[key] = (byAccount[key] || 0) + e.amount;
  }

  console.log("\n─── الخلاصة المقترحة ───");
  console.log(`إجمالي الحركات: ${totalOut.toFixed(2)} JD`);
  console.log("التوزيع على الحسابات:");
  for (const [code, amt] of Object.entries(byAccount).sort()) {
    console.log(`  ${code}: ${amt.toFixed(2)} JD`);
  }

  console.log("\n─── تفصيل القيود المقترحة ───");
  for (const e of proposed) {
    const r = e.rule;
    if (r.category === "transfer") {
      console.log(
        `#${e.row.toString().padStart(2)} [TRANSFER] ${e.amount.toFixed(2)} JD  DR ${r.toCode} / CR ${r.fromCode}  — ${e.description}`
      );
    } else if (r.category === "advance") {
      console.log(
        `#${e.row.toString().padStart(2)} [ADVANCE ] ${e.amount.toFixed(2)} JD  DR ${r.accountCode} (${r.partyName}) / CR 1010  — ${e.description}`
      );
    } else if (r.category === "salary") {
      console.log(
        `#${e.row.toString().padStart(2)} [SALARY  ] ${e.amount.toFixed(2)} JD  DR ${r.accountCode} / CR 1010  partyId=${r.partyName}  — ${e.description}`
      );
    } else {
      console.log(
        `#${e.row.toString().padStart(2)} [EXPENSE ] ${e.amount.toFixed(2)} JD  DR ${r.accountCode} / CR 1010  — ${e.description}`
      );
    }
  }

  if (!APPLY) {
    console.log("\n✅ DRY-RUN انتهى. لم يتم كتابة أي شيء.");
    console.log("   أعد التشغيل بـ --apply لترحيل القيود فعلياً.");
    return;
  }

  // ── APPLY ──
  console.log("\n🚀 بدء الترحيل الفعلي...");

  // 1) ensure extra accounts
  for (const def of EXTRA_ACCOUNTS) {
    await ensureAccount(prisma, def);
    console.log(`   ✓ حساب ${def.code} — ${def.name}`);
  }

  // 2) ensure employees
  const employees = {};
  for (const emp of EMPLOYEES_TO_ENSURE) {
    const p = await ensureEmployee(prisma, emp.name);
    employees[emp.name] = p;
    console.log(`   ✓ طرف #${p.id} — ${emp.name} (${emp.type})`);
  }

  // 3) post each row as its own journal entry
  const date = buildEntryDate();
  const cashAcc = await prisma.account.findUnique({ where: { code: "1010" } });
  if (!cashAcc) throw new Error("حساب الصندوق (1010) غير موجود!");

  let posted = 0;
  for (const e of proposed) {
    const r = e.rule;
    // build lines
    let lines = [];
    let description = e.description;
    let source = "expense";
    if (r.category === "transfer") {
      const from = await prisma.account.findUnique({ where: { code: r.fromCode } });
      const to = await prisma.account.findUnique({ where: { code: r.toCode } });
      lines = [
        { accountId: to.id, debit: e.amount, credit: 0, description: r.note },
        { accountId: from.id, debit: 0, credit: e.amount, description: r.note },
      ];
      source = "manual";
    } else if (r.category === "advance") {
      const apAcc = await prisma.account.findUnique({ where: { code: r.accountCode } });
      const party = employees[r.partyName];
      lines = [
        {
          accountId: apAcc.id,
          partyId: party.id,
          debit: e.amount,
          credit: 0,
          description: `سلفة — ${r.partyName}`,
        },
        {
          accountId: cashAcc.id,
          debit: 0,
          credit: e.amount,
          description: `من الصندوق`,
        },
      ];
      source = "expense";
    } else if (r.category === "salary") {
      const expAcc = await prisma.account.findUnique({ where: { code: r.accountCode } });
      const party = employees[r.partyName];
      lines = [
        {
          accountId: expAcc.id,
          partyId: party.id,
          debit: e.amount,
          credit: 0,
          description: `${r.note} — ${r.partyName}`,
        },
        {
          accountId: cashAcc.id,
          debit: 0,
          credit: e.amount,
          description: `من الصندوق`,
        },
      ];
      source = "salary";
    } else {
      const expAcc = await prisma.account.findUnique({ where: { code: r.accountCode } });
      lines = [
        {
          accountId: expAcc.id,
          debit: e.amount,
          credit: 0,
          description: e.description,
        },
        {
          accountId: cashAcc.id,
          debit: 0,
          credit: e.amount,
          description: `من الصندوق`,
        },
      ];
      source = "expense";
    }

    // transaction
    await prisma.$transaction(async (tx) => {
      const entryNumber = await nextEntryNumber(tx, date.getFullYear());
      await tx.journalEntry.create({
        data: {
          entryNumber,
          date,
          description,
          reference: `سجل مصاريف أبريل 2026 #${e.row}`,
          source,
          sourceRefId: null,
          status: "posted",
          totalDebit: e.amount,
          totalCredit: e.amount,
          lines: {
            create: lines.map((l, idx) => ({
              accountId: l.accountId,
              partyId: l.partyId ?? null,
              debit: l.debit || 0,
              credit: l.credit || 0,
              description: l.description ?? null,
              lineOrder: idx + 1,
            })),
          },
        },
      });
    });
    posted++;
  }

  console.log(`\n✅ تم ترحيل ${posted} قيد.`);

  // 4) balance check
  const agg = await prisma.journalLine.aggregate({
    where: {
      entry: {
        status: "posted",
        reference: { startsWith: "سجل مصاريف أبريل 2026" },
      },
    },
    _sum: { debit: true, credit: true },
  });
  console.log(`   مجموع المدين: ${Number(agg._sum.debit || 0).toFixed(2)}`);
  console.log(`   مجموع الدائن: ${Number(agg._sum.credit || 0).toFixed(2)}`);
}

main()
  .catch((err) => {
    console.error("❌ فشل:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
