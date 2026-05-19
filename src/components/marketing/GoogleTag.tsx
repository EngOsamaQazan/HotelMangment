"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import {
  GA_MEASUREMENT_ID,
  GOOGLE_ADS_ID,
  GOOGLE_TAG_ID,
  hasGoogleTag,
  sendGooglePageView,
} from "@/lib/marketing/google";

function GooglePageViewReporter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!hasGoogleTag()) return;
    const query = searchParams.toString();
    sendGooglePageView(query ? `${pathname}?${query}` : pathname);
  }, [pathname, searchParams]);

  return null;
}

export function GoogleTag() {
  if (!hasGoogleTag()) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
          GOOGLE_TAG_ID,
        )}`}
        strategy="afterInteractive"
      />
      <Script id="google-tag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          ${GOOGLE_ADS_ID ? `gtag('config', '${GOOGLE_ADS_ID}', { send_page_view: false });` : ""}
          ${GA_MEASUREMENT_ID ? `gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });` : ""}
        `}
      </Script>
      <Suspense fallback={null}>
        <GooglePageViewReporter />
      </Suspense>
    </>
  );
}
