import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { renderContractHtml } from "@/lib/contract/render-html";
import { htmlToPdf } from "@/lib/pdf/browser";

/**
 * GET /api/reservations/:id/contract.pdf
 *
 * Returns the rendered booking-contract PDF as a binary stream. Uses the
 * shared `renderContractHtml` server-side template + headless Chromium
 * via `htmlToPdf`. Bypasses puppeteer's auth issues (which can't carry
 * the user's session cookies) by rendering HTML directly from DB data.
 *
 * Permission: `reservations:print`. Same gate the React contract page
 * uses for its print button.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("reservations:print");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  const { id } = await context.params;
  const reservationId = Number(id);
  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    return NextResponse.json(
      { error: `معرّف الحجز غير صالح: ${id}` },
      { status: 400 },
    );
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { unit: true, guests: { orderBy: { guestOrder: "asc" } } },
  });
  if (!reservation) {
    return NextResponse.json(
      { error: `الحجز #${reservationId} غير موجود` },
      { status: 404 },
    );
  }

  try {
    const html = await renderContractHtml({
      id: reservation.id,
      guestName: reservation.guestName,
      phone: reservation.phone,
      numNights: reservation.numNights,
      stayType: reservation.stayType,
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      unitPrice: reservation.unitPrice,
      totalAmount: reservation.totalAmount,
      paidAmount: reservation.paidAmount,
      remaining: reservation.remaining,
      paymentMethod: reservation.paymentMethod,
      numGuests: reservation.numGuests,
      unit: {
        unitNumber: reservation.unit.unitNumber,
        unitType: reservation.unit.unitType,
      },
      guests: reservation.guests.map((g) => ({
        fullName: g.fullName,
        idNumber: g.idNumber,
        nationality: g.nationality,
      })),
    });

    const pdf = await htmlToPdf(html);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition": `inline; filename="contract-${reservationId}.pdf"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    console.error("[contract.pdf] failed:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "فشل توليد PDF العقد",
      },
      { status: 500 },
    );
  }
}
