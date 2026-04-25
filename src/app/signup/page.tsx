"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { GuestShell } from "@/components/public/GuestShell";
import { resolveNextPath } from "@/lib/auth/next-url";
import { UnifiedAuthGate } from "@/components/auth/UnifiedAuthGate";

/**
 * /signup
 *
 * Passwordless guest registration. The unified gate collects:
 *   • Full name (passport-style)
 *   • Phone number → WhatsApp OTP / click-to-login magic link
 *   • Optional Google / Apple sign-in (which then redirects to
 *     /account/complete-profile so the guest can attach a verified phone)
 */
function SignUpInner() {
  const searchParams = useSearchParams();
  const next = resolveNextPath(searchParams, "/account");

  return (
    <GuestShell active="auth" lightHeader>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-primary">
            إنشاء حساب ضيف
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            احجز مباشرة مع الفندق واحصل على أفضل الأسعار وخدمة أسرع — بدون
            كلمة سر.
          </p>
        </div>

        <UnifiedAuthGate
          next={next}
          variant="signup"
          socialEnabled={{
            google: process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "1",
            apple: process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED === "1",
          }}
        />

        <p className="text-center text-xs text-gray-500 mt-6">
          لديك حساب؟{" "}
          <Link
            href={{
              pathname: "/signin",
              query: next !== "/account" ? { next } : undefined,
            }}
            className="text-primary font-semibold hover:underline"
          >
            سجّل دخولك
          </Link>
        </p>
      </div>
    </GuestShell>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpInner />
    </Suspense>
  );
}
