require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const CODES = {
  CASH: "1010",
  BANK: "1020",
  AR_GUESTS: "1100",
  REVENUE_ROOMS: "4010",
  REVENUE_OTHER: "4020",
  EXPENSE_MAINTENANCE: "5030",
  EXPENSE_MISC: "5050",
};

function round2(n) {
  return Math.round(n * 100) / 100;
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
  await tx.fiscalPeriod.upsert({
    where: { year_month: { year, month } },
    update: {},
    create: { year, month, status: "open" },
  });
}

async function getAccountIdByCode(tx, code) {
  const acc = await tx.account.findUnique({ where: { code } });
  if (!acc) throw new Error(`Account missing: ${code}`);
  return acc.id;
}

async function postEntry(tx, input) {
  const date = input.date instanceof Date ? input.date : new Date(input.date);
  await ensurePeriod(tx, date);

  let totalDebit = 0;
  let totalCredit = 0;
  const preparedLines = [];

  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i];
    const accountId = line.accountId || (await getAccountIdByCode(tx, line.accountCode));
    const debit = round2(line.debit || 0);
    const credit = round2(line.credit || 0);
    totalDebit += debit;
    totalCredit += credit;
    preparedLines.push({
      accountId,
      partyId: line.partyId ?? null,
      debit,
      credit,
      description: line.description ?? null,
      lineOrder: i + 1,
    });
  }

  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(`Unbalanced entry: DR=${totalDebit} CR=${totalCredit}`);
  }

  const entryNumber = await nextEntryNumber(tx, date.getFullYear());
  return tx.journalEntry.create({
    data: {
      entryNumber,
      date,
      description: input.description,
      source: input.source,
      sourceRefId: input.sourceRefId ?? null,
      status: "posted",
      totalDebit: round2(totalDebit),
      totalCredit: round2(totalCredit),
      lines: { create: preparedLines },
    },
  });
}

async function ensureGuestParty(tx, reservation, arAccountId) {
  let party = null;
  if (reservation.guestIdNumber) {
    party = await tx.party.findFirst({
      where: { type: "guest", nationalId: reservation.guestIdNumber },
    });
  }
  if (!party && reservation.phone) {
    party = await tx.party.findFirst({
      where: { type: "guest", phone: reservation.phone, name: reservation.guestName },
    });
  }
  if (!party) {
    party = await tx.party.findFirst({
      where: { type: "guest", name: reservation.guestName },
    });
  }
  if (!party) {
    party = await tx.party.create({
      data: {
        name: reservation.guestName,
        type: "guest",
        phone: reservation.phone || null,
        nationalId: reservation.guestIdNumber || null,
        arAccountId,
      },
    });
  } else if (!party.arAccountId) {
    await tx.party.update({
      where: { id: party.id },
      data: { arAccountId },
    });
  }
  return party.id;
}

async function main() {
  console.log("🔁 بدء ترحيل البيانات القديمة إلى نظام القيد المزدوج...\n");

  const arAccountId = await getAccountIdByCode(prisma, CODES.AR_GUESTS);

  const reservations = await prisma.reservation.findMany({
    include: { unit: true },
    orderBy: { id: "asc" },
  });
  console.log(`🏨 الحجوزات: ${reservations.length}`);

  let reservationEntries = 0;

  for (const r of reservations) {
    const total = Number(r.totalAmount);
    if (total <= 0) continue;

    const alreadyPosted = await prisma.journalEntry.findFirst({
      where: { source: "reservation", sourceRefId: r.id, status: "posted" },
    });
    if (alreadyPosted) continue;

    await prisma.$transaction(async (tx) => {
      const partyId = await ensureGuestParty(tx, r, arAccountId);

      await postEntry(tx, {
        date: r.checkIn,
        description: `[ترحيل] حجز #${r.id} - ${r.guestName} - ${r.unit.unitNumber}`,
        source: "reservation",
        sourceRefId: r.id,
        lines: [
          { accountCode: CODES.AR_GUESTS, partyId, debit: total },
          { accountCode: CODES.REVENUE_ROOMS, credit: total },
        ],
      });
      reservationEntries++;
    });
  }
  console.log(`✅ قيود الحجوزات المُرحّلة: ${reservationEntries}\n`);

  const transactions = await prisma.transaction.findMany({
    include: { reservation: { include: { unit: true } } },
    orderBy: { id: "asc" },
  });
  console.log(`💵 الحركات المالية: ${transactions.length}`);

  let transactionEntries = 0;
  for (const t of transactions) {
    const alreadyPosted = await prisma.journalEntry.findFirst({
      where: { source: "payment", sourceRefId: t.id, status: "posted" },
    });
    const alreadyPostedExpense = await prisma.journalEntry.findFirst({
      where: { source: "expense", sourceRefId: t.id, status: "posted" },
    });
    if (alreadyPosted || alreadyPostedExpense) continue;

    const amount = Number(t.amount);
    if (amount <= 0) continue;

    const cashCode = t.account === "bank" ? CODES.BANK : CODES.CASH;

    await prisma.$transaction(async (tx) => {
      if (t.type === "income") {
        let partyId = null;
        let counterCode = CODES.REVENUE_OTHER;
        if (t.reservation) {
          partyId = await ensureGuestParty(tx, t.reservation, arAccountId);
          counterCode = CODES.AR_GUESTS;
        }
        await postEntry(tx, {
          date: t.date,
          description: `[ترحيل] ${t.description}`,
          source: "payment",
          sourceRefId: t.id,
          lines: [
            { accountCode: cashCode, debit: amount },
            { accountCode: counterCode, partyId, credit: amount },
          ],
        });
      } else {
        const counterCode = t.description?.includes("صيانة")
          ? CODES.EXPENSE_MAINTENANCE
          : CODES.EXPENSE_MISC;
        await postEntry(tx, {
          date: t.date,
          description: `[ترحيل] ${t.description}`,
          source: "expense",
          sourceRefId: t.id,
          lines: [
            { accountCode: counterCode, debit: amount },
            { accountCode: cashCode, credit: amount },
          ],
        });
      }
      transactionEntries++;
    });
  }
  console.log(`✅ قيود الحركات المالية المُرحّلة: ${transactionEntries}\n`);

  const totals = await prisma.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: { entry: { status: "posted" } },
  });
  const dr = Number(totals._sum.debit || 0);
  const cr = Number(totals._sum.credit || 0);
  console.log("📊 الأرصدة الإجمالية بعد الترحيل:");
  console.log(`   مجموع المدين: ${dr.toFixed(2)}`);
  console.log(`   مجموع الدائن: ${cr.toFixed(2)}`);
  console.log(`   الفرق: ${(dr - cr).toFixed(2)}`);

  if (Math.abs(dr - cr) > 0.01) {
    console.warn("⚠️ الأرصدة غير متوازنة! يرجى المراجعة.");
  } else {
    console.log("✅ الأرصدة متوازنة.");
  }
}

main()
  .catch((e) => {
    console.error("❌ خطأ:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
