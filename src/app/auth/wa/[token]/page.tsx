"use client";

import { useEffect, useState, use as reactUse, Suspense } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { GuestShell } from "@/components/public/GuestShell";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  ArrowRight,
} from "lucide-react";

/**
 * `/auth/wa/[token]` — landing page for the WhatsApp click-to-login link.
 *
 * Flow:
 *   1. POST /api/guest-auth/wa/tap with the token from the URL.
 *   2. If `sameBrowser: true`, the originating browser tab also gets a
 *      session token from us (via the OTP poll endpoint, but that race is
 *      fine — we just sign in here directly). We call signIn() and bounce
 *      to the booking funnel (or wherever the user came from).
 *   3. If `sameBrowser: false` (mobile WhatsApp's in-app webview is a
 *      different cookie jar than Safari/Chrome), we show a "verified! go
 *      back to your other browser" message — the original tab will pick
 *      up the tap via polling.
 */

type State =
  | { kind: "loading" }
  | {
      kind: "ready";
      phone: string;
      sameBrowser: boolean;
      tapKind: "signup" | "login" | "change_phone" | "reset";
    }
  | { kind: "completing" }
  | { kind: "error"; message: string };

function MagicLinkInner({ token }: { token: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<State>({ kind: "loading" });

  // Where to land after sign-in. Default to /book/checkout if there's a
  // pending booking stash, otherwise /account.
  const next = (() => {
    const fromQuery = searchParams.get("next");
    if (fromQuery && fromQuery.startsWith("/")) return fromQuery;
    if (typeof window !== "undefined") {
      try {
        const stash = window.sessionStorage.getItem("fakher:pendingCheckout");
        if (stash) return "/book/checkout";
      } catch {
        /* sessionStorage unavailable */
      }
    }
    return "/account";
  })();

  // 1. Confirm the tap on the server.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/guest-auth/wa/tap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          credentials: "include",
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({
            kind: "error",
            message: json.error ?? "تعذّر التحقّق من الرابط.",
          });
          return;
        }
        setState({
          kind: "ready",
          phone: json.phone,
          sameBrowser: Boolean(json.sameBrowser),
          tapKind: json.kind,
        });
      } catch {
        if (!cancelled) {
          setState({
            kind: "error",
            message: "تعذّر الاتصال بالخادم. تحقّق من الإنترنت وأعد المحاولة.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // 2. If we're in the same browser that started the OTP, finish sign-in
  //    here too — the user shouldn't have to switch tabs.
  useEffect(() => {
    if (state.kind !== "ready") return;
    if (!state.sameBrowser) return;
    // If the user is already signed in (e.g. they tapped twice), just go.
    if (session?.user?.audience === "guest" && session.user.phone === state.phone) {
      router.replace(next);
      return;
    }
    let cancelled = false;
    setState({ kind: "completing" });
    (async () => {
      const signInRes = await signIn("guest-credentials", {
        phone: state.phone,
        otpToken: token,
        redirect: false,
      });
      if (cancelled) return;
      if (signInRes?.error) {
        setState({
          kind: "error",
          message:
            "تم التحقّق من الرابط لكن تعذّر إنشاء الجلسة. ابدأ من جديد من شاشة الحجز.",
        });
        return;
      }
      router.replace(next);
      router.refresh();
    })();
    return () => {
      cancelled = true;
    };
    // We intentionally only react to state changes, not session updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <GuestShell active="auth" lightHeader>
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-7 text-center">
          {state.kind === "loading" && (
            <>
              <Loader2
                size={42}
                className="animate-spin text-primary mx-auto mb-3"
              />
              <h1 className="text-xl font-bold text-primary">
                جارٍ التحقّق من الرابط…
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                لا تُغلق هذه الصفحة.
              </p>
            </>
          )}

          {(state.kind === "ready" && state.sameBrowser) ||
          state.kind === "completing" ? (
            <>
              <Loader2
                size={42}
                className="animate-spin text-primary mx-auto mb-3"
              />
              <h1 className="text-xl font-bold text-primary">
                جارٍ تسجيل دخولك…
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                ستنتقل تلقائياً خلال لحظات.
              </p>
            </>
          ) : null}

          {state.kind === "ready" && !state.sameBrowser && (
            <>
              <CheckCircle2
                size={48}
                className="text-emerald-500 mx-auto mb-3"
              />
              <h1 className="text-xl font-bold text-primary">
                تمّ التحقّق من رقمك بنجاح
              </h1>
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                ارجع الآن إلى المتصفح الذي بدأت منه الحجز — سيكتمل تسجيل
                دخولك تلقائياً خلال ثانيتين.
              </p>
              <div className="bg-gold-soft/30 border border-gold/20 rounded-xl p-3 mt-4 flex items-center gap-2 text-xs text-primary">
                <Smartphone size={16} />
                <span>{state.phone}</span>
              </div>
              <Link
                href="/book"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-5"
              >
                أو ابدأ حجزاً جديداً من هنا
                <ArrowRight size={12} />
              </Link>
            </>
          )}

          {state.kind === "error" && (
            <>
              <AlertTriangle
                size={42}
                className="text-danger mx-auto mb-3"
              />
              <h1 className="text-xl font-bold text-primary">
                تعذّر إكمال التحقّق
              </h1>
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                {state.message}
              </p>
              <Link
                href="/signin"
                className="inline-block mt-5 px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary-dark shadow"
              >
                العودة إلى تسجيل الدخول
              </Link>
            </>
          )}
        </div>
      </div>
    </GuestShell>
  );
}

export default function MagicLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // Next 16: dynamic route params are a Promise. `use` unwraps it cleanly
  // for client components (the `use` hook is exported from "react").
  const { token } = reactUse(params);
  return (
    <Suspense fallback={null}>
      <MagicLinkInner token={token} />
    </Suspense>
  );
}
