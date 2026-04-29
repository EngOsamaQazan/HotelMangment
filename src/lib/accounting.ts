import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

type Tx = Prisma.TransactionClient | PrismaClient;

const EPS = 0.005;

export const ACCOUNT_CODES = {
  CASH: "1010",
  BANK: "1020",
  AR_GUESTS: "1100",
  AR_OTHERS: "1110",
  AP_SUPPLIERS: "2010",
  AP_PARTNERS: "2100",
  AP_EMPLOYEES: "2110",
  LIABILITY_HEALTH_INSURANCE: "2120",
  LIABILITY_COURT: "2130",
  LIABILITY_PERMITS: "2140",
  LIABILITY_DEDUCTIONS_OTHER: "2150",
  LOANS_PAYABLE: "2200",
  OWNER_CAPITAL: "3010",
  OWNER_DRAWINGS: "3020",
  RETAINED_EARNINGS: "3100",
  REVENUE_ROOMS: "4010",
  REVENUE_OTHER: "4020",
  EXPENSE_SALARIES: "5010",
  EXPENSE_UTILITIES: "5020",
  EXPENSE_MAINTENANCE: "5030",
  EXPENSE_HOSPITALITY: "5040",
  EXPENSE_MISC: "5050",
} as const;

export type AccountCode = (typeof ACCOUNT_CODES)[keyof typeof ACCOUNT_CODES];

export interface PostEntryLine {
  accountId?: number;
  accountCode?: string;
  partyId?: number | null;
  /** Analytical dimension. Pass either id or code (registry seeds use codes). */
  costCenterId?: number | null;
  costCenterCode?: string | null;
  debit?: number;
  credit?: number;
  description?: string | null;
}

export interface PostEntryInput {
  date: Date | string;
  description: string;
  reference?: string | null;
  source: string;
  sourceRefId?: number | null;
  createdById?: number | null;
  lines: PostEntryLine[];
}

export class AccountingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountingError";
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function resolveAccountId(
  tx: Tx,
  line: PostEntryLine
): Promise<number> {
  if (line.accountId) return line.accountId;
  if (line.accountCode) {
    const acc = await tx.account.findUnique({
      where: { code: line.accountCode },
    });
    if (!acc) {
      throw new AccountingError(
        `حساب غير موجود في دليل الحسابات: ${line.accountCode}`
      );
    }
    return acc.id;
  }
  throw new AccountingError("يجب تمرير accountId أو accountCode لكل سطر قيد");
}

async function resolveCostCenterId(
  tx: Tx,
  line: PostEntryLine,
): Promise<number | null> {
  if (line.costCenterId != null) return line.costCenterId;
  if (line.costCenterCode) {
    const cc = await tx.costCenter.findUnique({
      where: { code: line.costCenterCode },
    });
    // Soft-resolve: if the seeded center isn't present (e.g. fresh DB before
    // `db:seed-cost-centers`), skip the tag rather than blocking the post.
    return cc?.id ?? null;
  }
  return null;
}

async function ensurePeriodOpen(tx: Tx, date: Date): Promise<void> {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const period = await tx.fiscalPeriod.findUnique({
    where: { year_month: { year, month } },
  });
  if (period && period.status === "closed") {
    throw new AccountingError(
      `الفترة ${month}/${year} مقفلة، لا يمكن الترحيل عليها`
    );
  }
  if (!period) {
    await tx.fiscalPeriod.create({ data: { year, month, status: "open" } });
  }
}

async function nextEntryNumber(tx: Tx, year: number): Promise<string> {
  const key = `je:${year}`;
  const counter = await tx.accountingCounter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
  });
  return `JE-${year}-${String(counter.value).padStart(6, "0")}`;
}

export async function postEntry(
  tx: Tx,
  input: PostEntryInput
): Promise<{ id: number; entryNumber: string }> {
  const date = input.date instanceof Date ? input.date : new Date(input.date);

  if (!input.lines || input.lines.length < 2) {
    throw new AccountingError("القيد يجب أن يحتوي على سطرين على الأقل");
  }

  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of input.lines) {
    const d = round2(line.debit || 0);
    const c = round2(line.credit || 0);
    if (d < 0 || c < 0) {
      throw new AccountingError("المدين والدائن يجب أن يكونا موجبين");
    }
    if (d > 0 && c > 0) {
      throw new AccountingError("لا يسمح بمدين ودائن في نفس السطر");
    }
    if (d === 0 && c === 0) {
      throw new AccountingError("كل سطر يجب أن يحتوي مدين أو دائن");
    }
    totalDebit += d;
    totalCredit += c;
  }

  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);

  if (Math.abs(totalDebit - totalCredit) > EPS) {
    throw new AccountingError(
      `القيد غير متوازن: مدين=${totalDebit}، دائن=${totalCredit}`
    );
  }

  await ensurePeriodOpen(tx, date);

  const entryNumber = await nextEntryNumber(tx, date.getFullYear());

  const lineData = await Promise.all(
    input.lines.map(async (line, idx) => {
      const accountId = await resolveAccountId(tx, line);
      const costCenterId = await resolveCostCenterId(tx, line);
      return {
        accountId,
        partyId: line.partyId ?? null,
        costCenterId,
        debit: round2(line.debit || 0),
        credit: round2(line.credit || 0),
        description: line.description ?? null,
        lineOrder: idx + 1,
      };
    })
  );

  const entry = await tx.journalEntry.create({
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
      createdById: input.createdById ?? null,
      lines: { create: lineData },
    },
  });

  return { id: entry.id, entryNumber: entry.entryNumber };
}

/**
 * Void an existing journal entry by creating an opposing **reversal** entry.
 *
 * Accounting convention (GAAP/IFRS): a posted journal entry must never be
 * "unposted" or deleted. To undo its effect we post a second, equal-and-opposite
 * entry. Both the original and the reversal stay with `status = 'posted'` so
 * they appear together in the ledger and mathematically cancel out. The
 * original carries `voidedAt / voidedById / voidReason` as a **metadata flag**
 * for display/audit — NOT as a filter criterion for balance computation.
 *
 * This avoids the double-subtraction bug that would arise if the balance
 * query excluded the original (status='void') while including the reversal
 * (status='posted'), which would remove the amount twice.
 */
export async function voidEntry(
  tx: Tx,
  entryId: number,
  reason: string,
  voidedById?: number | null
): Promise<{ id: number; entryNumber: string }> {
  const original = await tx.journalEntry.findUnique({
    where: { id: entryId },
    include: { lines: true },
  });
  if (!original) throw new AccountingError("القيد غير موجود");
  if (original.voidedAt) {
    throw new AccountingError("القيد معكوس مسبقاً");
  }
  if (original.status !== "posted") {
    throw new AccountingError("لا يمكن عكس قيد غير مُرحَّل");
  }
  if (original.source === "reversal") {
    throw new AccountingError("لا يمكن عكس قيد عكسي");
  }

  await ensurePeriodOpen(tx, original.date);

  const reversalNumber = await nextEntryNumber(
    tx,
    original.date.getFullYear()
  );

  const reversal = await tx.journalEntry.create({
    data: {
      entryNumber: reversalNumber,
      date: original.date,
      description: `عكس قيد ${original.entryNumber} — ${reason}`,
      reference: original.reference,
      source: "reversal",
      sourceRefId: original.id,
      status: "posted",
      totalDebit: original.totalCredit,
      totalCredit: original.totalDebit,
      createdById: voidedById ?? null,
      reversalOfId: original.id,
      lines: {
        create: original.lines.map((l, idx) => ({
          accountId: l.accountId,
          partyId: l.partyId,
          debit: l.credit,
          credit: l.debit,
          description: `عكس: ${l.description ?? ""}`,
          lineOrder: idx + 1,
        })),
      },
    },
  });

  // Keep original status as "posted" — the reversal cancels it mathematically.
  // Only stamp the audit metadata so the UI can render a strike-through marker.
  await tx.journalEntry.update({
    where: { id: entryId },
    data: {
      voidedAt: new Date(),
      voidedById: voidedById ?? null,
      voidReason: reason,
    },
  });

  return { id: reversal.id, entryNumber: reversal.entryNumber };
}

export async function getAccountBalance(
  accountId: number,
  asOf?: Date
): Promise<{ debit: number; credit: number; balance: number; type: string; normalBalance: string }> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new AccountingError("الحساب غير موجود");

  const where: Prisma.JournalLineWhereInput = {
    accountId,
    entry: { status: "posted", ...(asOf ? { date: { lte: asOf } } : {}) },
  };

  const agg = await prisma.journalLine.aggregate({
    where,
    _sum: { debit: true, credit: true },
  });

  const debit = Number(agg._sum.debit || 0);
  const credit = Number(agg._sum.credit || 0);
  const balance =
    account.normalBalance === "debit" ? debit - credit : credit - debit;

  return {
    debit: round2(debit),
    credit: round2(credit),
    balance: round2(balance),
    type: account.type,
    normalBalance: account.normalBalance,
  };
}

/**
 * A party's running balance is a *receivable/payable* concept and must be
 * computed only on balance-sheet accounts (asset / liability / equity).
 * Expense and revenue accounts close to retained earnings at period end and
 * don't represent an ongoing obligation between a party and the hotel — even
 * if a `partyId` is attached on those lines for reporting purposes (e.g.
 * tracking salary expense per employee on 5010, or commission per partner on
 * 4010). Including them here would inflate balances by the cumulative
 * expense/revenue ever booked against the party.
 */
export const PARTY_BALANCE_ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
] as const;

export async function getPartyBalance(
  partyId: number,
  asOf?: Date
): Promise<{ debit: number; credit: number; balance: number }> {
  const where: Prisma.JournalLineWhereInput = {
    partyId,
    account: { type: { in: [...PARTY_BALANCE_ACCOUNT_TYPES] } },
    entry: { status: "posted", ...(asOf ? { date: { lte: asOf } } : {}) },
  };

  const agg = await prisma.journalLine.aggregate({
    where,
    _sum: { debit: true, credit: true },
  });

  const debit = Number(agg._sum.debit || 0);
  const credit = Number(agg._sum.credit || 0);
  const balance = debit - credit;

  return {
    debit: round2(debit),
    credit: round2(credit),
    balance: round2(balance),
  };
}

export async function ensurePartyAccounts(
  tx: Tx,
  partyId: number
): Promise<void> {
  const party = await tx.party.findUnique({ where: { id: partyId } });
  if (!party) throw new AccountingError("الطرف غير موجود");

  const getAccId = async (code: string) => {
    const a = await tx.account.findUnique({ where: { code } });
    return a?.id ?? null;
  };

  const data: Prisma.PartyUpdateInput = {};
  let changed = false;

  if (party.type === "guest" && !party.arAccountId) {
    const id = await getAccId(ACCOUNT_CODES.AR_GUESTS);
    if (id) {
      data.arAccount = { connect: { id } };
      changed = true;
    }
  }

  if (party.type === "supplier" && !party.apAccountId) {
    const id = await getAccId(ACCOUNT_CODES.AP_SUPPLIERS);
    if (id) {
      data.apAccount = { connect: { id } };
      changed = true;
    }
  }

  if (party.type === "employee" && !party.apAccountId) {
    const id = await getAccId(ACCOUNT_CODES.AP_EMPLOYEES);
    if (id) {
      data.apAccount = { connect: { id } };
      changed = true;
    }
  }

  if (party.type === "lender" && !party.apAccountId) {
    const id = await getAccId(ACCOUNT_CODES.LOANS_PAYABLE);
    if (id) {
      data.apAccount = { connect: { id } };
      changed = true;
    }
  }

  if (party.type === "partner") {
    if (!party.apAccountId) {
      const id = await getAccId(ACCOUNT_CODES.AP_PARTNERS);
      if (id) {
        data.apAccount = { connect: { id } };
        changed = true;
      }
    }
    if (!party.equityAccountId) {
      const capital = await tx.account.upsert({
        where: { code: `3010-${party.id}` },
        update: {},
        create: {
          code: `3010-${party.id}`,
          name: `رأس مال - ${party.name}`,
          type: "equity",
          subtype: "capital",
          normalBalance: "credit",
          parentId: (await getAccId(ACCOUNT_CODES.OWNER_CAPITAL)) ?? undefined,
          isSystem: false,
          isActive: true,
        },
      });
      data.equityAccount = { connect: { id: capital.id } };
      changed = true;
    }
    if (!party.drawAccountId) {
      const draw = await tx.account.upsert({
        where: { code: `3020-${party.id}` },
        update: {},
        create: {
          code: `3020-${party.id}`,
          name: `مسحوبات - ${party.name}`,
          type: "equity",
          subtype: "drawing",
          normalBalance: "debit",
          parentId: (await getAccId(ACCOUNT_CODES.OWNER_DRAWINGS)) ?? undefined,
          isSystem: false,
          isActive: true,
        },
      });
      data.drawAccount = { connect: { id: draw.id } };
      changed = true;
    }
  }

  if (changed) {
    await tx.party.update({ where: { id: partyId }, data });
  }
}

export async function getOrCreateGuestParty(
  tx: Tx,
  args: { name: string; phone?: string | null; nationalId?: string | null; reservationId?: number }
): Promise<number> {
  let party = null;
  if (args.nationalId) {
    party = await tx.party.findFirst({
      where: { type: "guest", nationalId: args.nationalId },
    });
  }
  if (!party && args.phone) {
    party = await tx.party.findFirst({
      where: { type: "guest", phone: args.phone, name: args.name },
    });
  }
  if (!party) {
    party = await tx.party.findFirst({
      where: { type: "guest", name: args.name },
    });
  }
  if (!party) {
    party = await tx.party.create({
      data: {
        name: args.name,
        type: "guest",
        phone: args.phone ?? null,
        nationalId: args.nationalId ?? null,
      },
    });
  }
  await ensurePartyAccounts(tx, party.id);
  return party.id;
}

export const CASH_ACCOUNT_CODES = {
  CASH: "1010",
  BANK: "1020",
  WALLET: "1030",
} as const;

/**
 * Map a payment-method string (stored on reservations/extensions/transactions)
 * to the corresponding cash-family account code in the chart of accounts.
 *
 * Accepted values (case-insensitive):
 *   - "cash" / "نقدي"              → 1010 الصندوق النقدي
 *   - "bank" / "تحويل بنكي" / "بنك" → 1020 الحساب البنكي
 *   - "wallet" / "محفظة"           → 1030 المحفظة الإلكترونية
 *   - "card" / "بطاقة"             → 1020 (card payments settle through bank)
 *   - a raw account code like "1010" passes through if it's a cash-family code
 *   - anything else / null         → 1010 (safe default)
 */
export function cashAccountCodeFromMethod(method: string | null | undefined): string {
  if (!method) return CASH_ACCOUNT_CODES.CASH;
  const m = method.trim().toLowerCase();

  if (m === CASH_ACCOUNT_CODES.CASH || m === CASH_ACCOUNT_CODES.BANK || m === CASH_ACCOUNT_CODES.WALLET) {
    return m;
  }

  if (m === "wallet" || m.includes("محفظ") || m.includes("wallet")) {
    return CASH_ACCOUNT_CODES.WALLET;
  }
  if (m === "bank" || m === "card" || m.includes("bank") || m.includes("card") || m.includes("تحويل") || m.includes("بنك") || m.includes("بطاقة")) {
    return CASH_ACCOUNT_CODES.BANK;
  }
  return CASH_ACCOUNT_CODES.CASH;
}
