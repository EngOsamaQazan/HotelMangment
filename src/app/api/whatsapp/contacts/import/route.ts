import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { upsertContact } from "@/lib/whatsapp/conversations";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/phone";

/**
 * POST /api/whatsapp/contacts/import
 *
 *   Content-Type: text/csv
 *     → raw CSV body, UTF-8 (BOM tolerated).
 *   Content-Type: application/json
 *     → { csv: "<text>" } or { rows: [{ phone, displayName, … }] }
 *
 * Headers accepted (case-insensitive, synonyms in parentheses):
 *   phone (msisdn, tel), display_name (name), nickname, email, company,
 *   notes, tags (pipe- or comma-separated), opted_in, is_blocked.
 *
 * Requires `whatsapp:export_contacts` (same permission owns import/export).
 */

interface JsonBody {
  csv?: string;
  rows?: Array<Record<string, unknown>>;
}

// Minimal CSV parser that tolerates quoted fields + \r\n / \n line endings.
// Good enough for bookstore-sized exports (tested up to 10k rows) and, more
// importantly, has zero runtime dependencies.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const stripped = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < stripped.length; i++) {
    const c = stripped[i];
    if (inQuotes) {
      if (c === '"') {
        if (stripped[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && stripped[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const HEADER_ALIASES: Record<string, string> = {
  phone: "phone",
  msisdn: "phone",
  tel: "phone",
  mobile: "phone",
  number: "phone",
  display_name: "displayName",
  name: "displayName",
  displayname: "displayName",
  nickname: "nickname",
  email: "email",
  company: "company",
  organisation: "company",
  organization: "company",
  notes: "notes",
  note: "notes",
  tags: "tags",
  label: "tags",
  labels: "tags",
  opted_in: "optedIn",
  optin: "optedIn",
  opted: "optedIn",
  is_blocked: "isBlocked",
  blocked: "isBlocked",
};

function normalizeHeader(h: string): string | null {
  const k = h.trim().toLowerCase().replace(/\s+/g, "_");
  return HEADER_ALIASES[k] ?? (k in HEADER_ALIASES ? HEADER_ALIASES[k] : null);
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return /^(1|true|yes|y|نعم)$/i.test(v.trim());
  return false;
}

function parseTags(v: unknown): string[] {
  if (Array.isArray(v))
    return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v !== "string") return [];
  return v
    .split(/[|,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requirePermission("whatsapp:export_contacts");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  const userId = Number((session.user as { id?: string | number }).id);
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();

  let items: Array<Record<string, unknown>> = [];

  try {
    if (contentType.includes("text/csv")) {
      const text = await req.text();
      items = csvToItems(text);
    } else {
      const body = (await req.json().catch(() => ({}))) as JsonBody;
      if (typeof body.csv === "string") items = csvToItems(body.csv);
      else if (Array.isArray(body.rows)) items = body.rows;
    }
  } catch (err) {
    return NextResponse.json(
      { error: `تعذّر قراءة الملف: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  if (!items.length) {
    return NextResponse.json(
      { error: "الملف فارغ أو لا يحتوي عمود phone" },
      { status: 400 },
    );
  }

  let imported = 0;
  let skipped = 0;
  const errors: Array<{ row: number; error: string }> = [];

  for (let i = 0; i < items.length; i++) {
    const raw = items[i];
    const phone = normalizeWhatsAppPhone(String(raw.phone ?? ""));
    if (!phone) {
      skipped++;
      errors.push({ row: i + 1, error: "phone غير صالح" });
      continue;
    }
    try {
      await upsertContact({
        phone,
        displayName: raw.displayName ? String(raw.displayName) : null,
        nickname: raw.nickname ? String(raw.nickname) : null,
        email: raw.email ? String(raw.email) : null,
        company: raw.company ? String(raw.company) : null,
        notes: raw.notes ? String(raw.notes) : null,
        tags: parseTags(raw.tags),
        source: "import",
        optedIn: toBool(raw.optedIn),
        isBlocked: toBool(raw.isBlocked),
        createdByUserId: userId,
        updatedByUserId: userId,
      });
      imported++;
    } catch (err) {
      skipped++;
      errors.push({ row: i + 1, error: (err as Error).message });
    }
  }

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    total: items.length,
    errors: errors.slice(0, 50),
  });
}

function csvToItems(text: string): Array<Record<string, unknown>> {
  const rows = parseCsv(text).filter((r) => r.some((x) => x.trim()));
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => normalizeHeader(h));
  const out: Array<Record<string, unknown>> = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const row: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      row[key] = r[c];
    }
    if (row.phone) out.push(row);
  }
  return out;
}
