"use client";

import { useEffect } from "react";
import { sendBookingConversion } from "@/lib/marketing/google";

interface Props {
  confirmationCode: string;
  totalAmount: number;
  currency: string;
}

export function BookingConversionTracker({
  confirmationCode,
  totalAmount,
  currency,
}: Props) {
  useEffect(() => {
    if (!confirmationCode) return;
    const key = `mafhotel:booking-conversion:${confirmationCode}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    sendBookingConversion({
      transactionId: confirmationCode,
      value: totalAmount,
      currency,
    });
  }, [confirmationCode, currency, totalAmount]);

  return null;
}
