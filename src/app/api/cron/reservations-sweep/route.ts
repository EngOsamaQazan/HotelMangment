import { NextResponse } from "next/server";
import { sweepReservations } from "@/lib/reservations/sweeper";

/**
 * Scheduled reservation sweeper.
 *
 * Intended to be called by an external scheduler (systemd timer, cron,
 * Vercel Cron, …) every minute or so.
 *
 * Protection: pass `CRON_SECRET` either as `?secret=...` query param or as
 * `Authorization: Bearer <secret>` header. When `CRON_SECRET` is unset
 * (local dev) we accept any request — this is intentional to simplify
 * local testing.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(request.url);
    const fromQuery = url.searchParams.get("secret");
    const auth = request.headers.get("authorization") ?? "";
    const fromHeader = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";
    if (fromQuery !== secret && fromHeader !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await sweepReservations();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron] reservations-sweep failed:", err);
    return NextResponse.json(
      { ok: false, error: "Sweep failed" },
      { status: 500 },
    );
  }
}

export const POST = GET;
