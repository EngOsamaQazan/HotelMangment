import { NextResponse } from "next/server";
import type { WhatsAppContact } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * GET /api/whatsapp/contacts/export
 * Returns a CSV dump of every phonebook row.
 * Requires `whatsapp:export_contacts`.
 */

const CSV_HEADERS = [
  "phone",
  "display_name",
  "nickname",
  "email",
  "company",
  "notes",
  "tags",
  "source",
  "opted_in",
  "is_blocked",
  "last_message_at",
  "created_at",
];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  try {
    try {
      await requirePermission("whatsapp:export_contacts");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    // Stream in chunks to keep memory bounded even with 100k rows.
    const chunks: string[] = [CSV_HEADERS.join(",")];
    const take = 1000;
    let cursor: number | null = null;
    // Simple keyset pagination loop.
    // biome-ignore lint/correctness/noConstantCondition: loop break inside.
    while (true) {
      const page: WhatsAppContact[] = await prisma.whatsAppContact.findMany({
        orderBy: { id: "asc" },
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const r of page) {
        chunks.push(
          [
            r.phone,
            r.displayName ?? "",
            r.nickname ?? "",
            r.email ?? "",
            r.company ?? "",
            r.notes ?? "",
            (r.tags ?? []).join("|"),
            r.source,
            r.optedIn ? "1" : "0",
            r.isBlocked ? "1" : "0",
            r.lastMessageAt ? r.lastMessageAt.toISOString() : "",
            r.createdAt.toISOString(),
          ]
            .map(csvEscape)
            .join(","),
        );
      }
      if (page.length < take) break;
      cursor = page[page.length - 1].id;
    }

    const body = chunks.join("\n") + "\n";
    // UTF-8 BOM — Excel on Windows needs it to render Arabic correctly.
    return new NextResponse("\uFEFF" + body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="whatsapp-contacts-${Date.now()}.csv"`,
      },
    });
  } catch (err) {
    console.error("[GET /api/whatsapp/contacts/export]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تصدير الملف" },
      { status: 500 },
    );
  }
}
