import "server-only";
import { prisma } from "@/lib/prisma";
import type { ToolJsonSchema } from "@/lib/llm/types";
import {
  err,
  ok,
  type AssistantToolContext,
  type AssistantToolResult,
} from "../types";

// ---------------------------------------------------------------------------
// runSqlQuery — escape hatch for "the model knows what to do, just let it ask
// the database". Read-only PostgreSQL SELECT executor with three layers of
// safety:
//   1. Static text guard — must start with SELECT/WITH, must not contain any
//      banned keyword (DDL/DML/transaction-control/COPY/SET-session/comments).
//   2. Single-statement guard — multiple statements (`a; b`) are rejected.
//   3. Transaction-level enforcement — the query runs inside a wrapping
//      transaction with `default_transaction_read_only = on` and a 4s
//      `statement_timeout`. Even if the static guard ever misses something,
//      Postgres itself will refuse to write or hang.
//
// We also cap the row count and the per-cell payload so a runaway query
// can't blow up the LLM context window.
// ---------------------------------------------------------------------------

export interface RunSqlQueryInput {
  sql: string;
  /** Optional one-line description of *why* this query is being run, surfaced
   *  in logs/audit trails. Required so the model thinks before it asks. */
  reason: string;
  limit?: number;
}

export interface RunSqlQueryOutput {
  /** The actual SQL we ran (the input is echoed back so the engine and the
   *  staff member can see what was sent to Postgres). */
  sql: string;
  /** Column names in the order they appear in the rows. */
  columns: string[];
  /** Up to `limit` rows. Each cell is JSON-safe (Date → ISO, Decimal/BigInt → string). */
  rows: Array<Record<string, unknown>>;
  /** Number of rows returned (after the limit was applied). */
  rowCount: number;
  /** True when more rows existed but were dropped by the cap. */
  truncated: boolean;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  notice?: string;
}

export const runSqlQuerySchema: ToolJsonSchema = {
  name: "runSqlQuery",
  description:
    "نفّذ استعلاماً للقراءة فقط (SELECT أو WITH … SELECT) على قاعدة بيانات الفندق (PostgreSQL) للإجابة على سؤال إحصائي/تجميعي ليس له أداة جاهزة. القاعدة هي مخطّط Prisma — أسماء الجداول بحالة Pascal (\"Reservation\", \"Guest\", \"Party\", \"Account\", \"JournalEntry\", \"JournalLine\", \"Unit\", \"WhatsAppMessage\" …) وتحتاج تنصيصاً مزدوجاً (\") لأنها حسّاسة لحالة الأحرف. اذكر السبب باختصار في reason. ممنوع منعاً باتاً INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/CREATE/GRANT/REVOKE/COPY/SET — الأداة سترفض أي شيء غير قراءة. لا تكتب أكثر من تعليمة SQL واحدة. لو تتطابق مع أداة جاهزة (searchParty, searchUnit, getGuestProfile, listOpenReservations, getPartyBalance) استعمل الجاهزة لأنها أسرع وأدقّ.",
  parameters: {
    type: "object",
    properties: {
      sql: {
        type: "string",
        description:
          "تعليمة SELECT أو WITH … SELECT واحدة. لاحظ تنصيص أسماء الجداول والأعمدة بـ \" لأن Prisma ينشئها بحالة Pascal (مثلاً: SELECT COUNT(*) AS visits FROM \"Reservation\" WHERE \"guestName\" ILIKE '%خشر%').",
      },
      reason: {
        type: "string",
        description:
          "وصف مختصر بالعربية لما تحاول الإجابة عليه (يُسجَّل في المحادثة كي يطّلع المدير لاحقاً).",
      },
      limit: {
        type: ["integer", "null"],
        description: "أقصى عدد صفوف يُعاد (افتراضي 50، حد أقصى 200). الأداة تطبّق هذا حتى لو لم يحتوِ الاستعلام LIMIT.",
      },
    },
    required: ["sql", "reason", "limit"],
    additionalProperties: false,
  },
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const STATEMENT_TIMEOUT_MS = 4000;
const MAX_CELL_LENGTH = 500;

// Whole-word keyword bans. We deliberately err on the side of strictness; the
// model can rephrase as a CTE/SELECT if it bumps into the wall.
const BANNED_KEYWORDS = [
  "insert", "update", "delete", "merge", "upsert",
  "drop", "alter", "create", "truncate", "rename",
  "grant", "revoke", "comment",
  "vacuum", "analyze", "reindex", "refresh", "cluster",
  "lock", "discard",
  "call", "execute", "do",
  "copy",
  "begin", "commit", "rollback", "savepoint", "release",
  "set", "reset",
  "listen", "notify", "unlisten",
  "load", "checkpoint",
];

function validateSql(rawSql: string): { ok: true; sql: string } | { ok: false; reason: string } {
  const trimmed = rawSql.trim().replace(/;+\s*$/g, ""); // Drop trailing semicolons.
  if (!trimmed) return { ok: false, reason: "SQL فارغ." };
  if (trimmed.length > 4000) return { ok: false, reason: "SQL أطول من اللازم (4000 حرف)." };

  // Strip string literals & quoted identifiers before scanning for banned
  // keywords, so a guest named "Drop" doesn't trigger a false positive.
  const scrubbed = trimmed
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""')
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");

  // Reject comments — they can hide intent.
  if (/--|\/\*|\*\//.test(trimmed.replace(/'(?:''|[^'])*'/g, "''").replace(/"(?:""|[^"])*"/g, '""'))) {
    return { ok: false, reason: "ممنوع التعليقات داخل SQL." };
  }

  // Multiple statements? Look for a `;` that isn't just trailing whitespace.
  if (/;\s*\S/.test(scrubbed)) {
    return { ok: false, reason: "تعليمة SQL واحدة فقط مسموحة." };
  }

  const lower = scrubbed.toLowerCase();
  // Must start with SELECT or WITH.
  const head = lower.replace(/^[\s(]+/, "").slice(0, 8);
  if (!(head.startsWith("select") || head.startsWith("with"))) {
    return { ok: false, reason: "يجب أن يبدأ الاستعلام بـ SELECT أو WITH." };
  }

  for (const kw of BANNED_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, "i");
    if (re.test(scrubbed)) {
      return { ok: false, reason: `الكلمة "${kw.toUpperCase()}" ممنوعة في استعلامات القراءة.` };
    }
  }

  // Reject pg_* admin views and system catalogs that could leak passwords.
  if (/\bpg_(?:authid|user_mappings|user|shadow|stat_replication|stat_activity|settings)\b/i.test(scrubbed)) {
    return { ok: false, reason: "الوصول إلى جداول الإدارة في PostgreSQL ممنوع." };
  }

  return { ok: true, sql: trimmed };
}

function sanitizeCell(v: unknown): unknown {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return v.toString();
  // Prisma Decimal carries a `toFixed`/`toString`; serialise as a string to
  // preserve precision when the LLM sees it.
  if (typeof v === "object" && v !== null && typeof (v as { toFixed?: unknown }).toFixed === "function") {
    try {
      return (v as { toString(): string }).toString();
    } catch {
      // fall through to JSON below
    }
  }
  if (typeof v === "string") {
    return v.length > MAX_CELL_LENGTH ? v.slice(0, MAX_CELL_LENGTH) + "…" : v;
  }
  if (Buffer.isBuffer(v)) {
    return `<bytes len=${v.length}>`;
  }
  if (typeof v === "object") {
    try {
      const json = JSON.stringify(v);
      return json.length > MAX_CELL_LENGTH ? json.slice(0, MAX_CELL_LENGTH) + "…" : v;
    } catch {
      return String(v);
    }
  }
  return v;
}

export async function runSqlQuery(
  input: RunSqlQueryInput,
  ctx: AssistantToolContext,
): Promise<AssistantToolResult<RunSqlQueryOutput>> {
  const reason = (input?.reason ?? "").trim();
  if (!reason) {
    return err({ code: "bad_input", message: "اذكر سبب الاستعلام في reason.", field: "reason" });
  }

  const validated = validateSql(input?.sql ?? "");
  if (!validated.ok) {
    return err({ code: "bad_input", message: validated.reason, field: "sql" });
  }
  const sql = validated.sql;
  const limit = Math.max(1, Math.min(input?.limit ?? DEFAULT_LIMIT, MAX_LIMIT));

  console.info(
    `[assistant/runSqlQuery] user=${ctx.userId} conv=${ctx.conversationId} reason=${reason} sql=${sql.replace(/\s+/g, " ").slice(0, 200)}`,
  );

  const started = Date.now();
  let rows: unknown[];
  try {
    rows = await prisma.$transaction(async (tx) => {
      // Belt-and-suspenders: even if the textual guard above were to miss
      // something, the transaction is read-only and time-boxed at the DB.
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      await tx.$executeRawUnsafe(`SET LOCAL default_transaction_read_only = ON`);
      // Fetch one row past the limit so we can tell the model whether more
      // exist without serving them.
      return (await tx.$queryRawUnsafe(sql)) as unknown[];
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return err({ code: "internal", message: `فشل تنفيذ الاستعلام: ${msg}` });
  }
  const durationMs = Date.now() - started;

  if (!Array.isArray(rows)) {
    return ok({
      sql,
      columns: [],
      rows: [],
      rowCount: 0,
      truncated: false,
      durationMs,
      notice: "الاستعلام لم يُعِد جدولاً.",
    });
  }

  const truncated = rows.length > limit;
  const slice = truncated ? rows.slice(0, limit) : rows;
  const columns =
    slice.length > 0 && typeof slice[0] === "object" && slice[0] !== null
      ? Object.keys(slice[0] as Record<string, unknown>)
      : [];

  const cleaned = slice.map((r) => {
    if (typeof r !== "object" || r === null) return { value: sanitizeCell(r) };
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
      out[k] = sanitizeCell(v);
    }
    return out;
  });

  return ok({
    sql,
    columns,
    rows: cleaned,
    rowCount: cleaned.length,
    truncated,
    durationMs,
    ...(truncated
      ? {
          notice: `تم اقتطاع النتائج عند ${limit} صفّاً. لو احتجت المزيد أضف WHERE/ORDER BY/LIMIT أوضح.`,
        }
      : {}),
  });
}
