import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  PRICING_LAST_UPDATED,
  PRICING_REFERENCE_URL,
  getRateTable,
} from "@/lib/whatsapp/pricing";

/**
 * GET /api/whatsapp/usage/pricing — exposes the static pricing table used to
 * estimate cost when Meta's analytics API does not return a cost field.
 * Useful for the admin UI to render a transparent "see Meta's pricing"
 * reference panel.
 */
export async function GET() {
  try {
    await requirePermission("settings.whatsapp:view");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  return NextResponse.json({
    referenceUrl: PRICING_REFERENCE_URL,
    lastUpdated: PRICING_LAST_UPDATED,
    rates: getRateTable(),
  });
}
