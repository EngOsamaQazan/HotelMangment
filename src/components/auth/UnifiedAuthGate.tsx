"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { composePhone, formatPhoneDisplay } from "@/lib/phone";
import {
  MessageCircle,
  Loader2,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";

/**
 * `<UnifiedAuthGate>` — the single phone-first / social-secondary auth
 * surface used by:
 *   • /book/checkout (gating the booking funnel)
 *   • /signin        (returning guests)
 *   • /signup        (new guests)
 *
 * Visual hierarchy follows MENA-market best practices:
 *   🥇 رقم الهاتف + الاسم + OTP عبر واتساب (الطريق الافتراضي، الأكبر بصرياً)
 *   🥈 Google + Apple (ثانوي، لمن يفضّل One-Tap)
 *   🥉 رابط "تسجيل الدخول" للعائدين (تيرشري)
 *   ❌ بدون كلمة سر — البصمة كلها OTP / Social.
 *
 * The OTP step transparently supports WhatsApp Click-to-Login: while the
 * 6-digit input is shown, we poll `/api/guest-auth/otp/poll` so the user
 * can simply tap the link inside WhatsApp to complete sign-in without
 * ever retyping the code.
 */

export interface UnifiedAuthGateProps {
  /** Where to send the user after successful sign-in. Defaults to /account. */
  next?: string;
  /** Optional callback invoked once the user is authenticated. */
  onAuthenticated?: () => void;
  /**
   * "checkout" makes copy adapt to the booking funnel ("لمتابعة حجزك"
   * instead of "لتسجيل الدخول"). "signin" / "signup" tweak the heading
   * and CTAs accordingly.
   */
  variant?: "checkout" | "signin" | "signup";
  /** Whether the social-login row should appear. Defaults to true. */
  showSocial?: boolean;
  /** Public env flags from the page wrapper (server values get serialised). */
  socialEnabled?: { google: boolean; apple: boolean };
  /** Optional `runBeforeRedirect` (e.g. stash sessionStorage). */
  beforeRedirect?: () => void;
}

type Step = "form" | "verify";

export function UnifiedAuthGate({
  next = "/account",
  onAuthenticated,
  variant = "checkout",
  showSocial = true,
  socialEnabled = { google: false, apple: false },
  beforeRedirect,
}: UnifiedAuthGateProps) {
  const router = useRouter();

  const [step, setStep] = useState<Step>("form");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneDialCode, setPhoneDialCode] = useState("+962");
  const [otp, setOtp] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [pollingTapped, setPollingTapped] = useState(false);

  const normalizedPhone = useMemo(
    () => composePhone(phoneDialCode, phone),
    [phoneDialCode, phone],
  );

  const heading =
    variant === "signup"
      ? "إنشاء حساب ضيف"
      : variant === "signin"
        ? "تسجيل الدخول"
        : "متابعة الحجز";
  const subheading =
    variant === "signup"
      ? "احجز مباشرة مع الفندق واحصل على أفضل الأسعار وخدمة أسرع."
      : variant === "signin"
        ? "أهلاً بعودتك. أدخل رقمك ليصلك رمز فوري عبر واتساب."
        : "نحتاج رقم هاتفك فقط لإكمال الحجز وإرسال التأكيد عبر واتساب.";

  const ctaPrimary =
    variant === "signin" ? "إرسال رمز الدخول" : "إرسال رمز التحقّق";

  // Poll for the WhatsApp-tap once we're on the verify step.
  useEffect(() => {
    if (step !== "verify") return;
    if (!normalizedPhone) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch(
          `/api/guest-auth/otp/poll?phone=${encodeURIComponent(normalizedPhone!)}&purpose=login`,
          { credentials: "include", cache: "no-store" },
        );
        const json = await res.json();
        if (cancelled) return;
        if (json.status === "tapped" && json.signupToken) {
          setPollingTapped(true);
          await completeSignIn(json.signupToken as string);
          return;
        }
      } catch {
        /* network blip — keep polling */
      }
      if (!cancelled) timer = setTimeout(poll, 2500);
    }
    timer = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, normalizedPhone]);

  async function startOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (variant === "signup" && fullName.trim().length < 3) {
      setError("الاسم قصير جداً.");
      return;
    }
    if (!normalizedPhone) {
      setError("رقم الهاتف غير صالح. أدخل الرقم مع مفتاح الدولة.");
      return;
    }
    if (!agreed) {
      setError("يجب الموافقة على الشروط لإكمال العملية.");
      return;
    }
    setLoading(true);
    // We always request a "login" OTP — the verify endpoint accepts the
    // resulting token for both `signIn("guest-credentials", { otpToken })`
    // (existing accounts) and silent signup-via-OTP (handled below).
    const res = await fetch("/api/guest-auth/otp/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: normalizedPhone, purpose: "login" }),
      credentials: "include",
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "تعذّر إرسال الرمز.");
      return;
    }
    const data = (await res.json()) as { magicLinkSent?: boolean };
    setMagicSent(Boolean(data.magicLinkSent));
    setInfo(
      `أرسلنا رسالة إلى واتساب ${formatPhoneDisplay(normalizedPhone)}. اضغط الرابط داخلها للتحقّق التلقائي، أو اكتب الرمز يدوياً هنا.`,
    );
    setStep("verify");
  }

  async function ensureGuestAccount(signupToken: string): Promise<boolean> {
    // Tries to sign in. If the account doesn't exist yet (fresh phone),
    // calls /api/guest-auth/signup-otp to create it then retries.
    const trySignIn = await signIn("guest-credentials", {
      phone: normalizedPhone,
      otpToken: signupToken,
      redirect: false,
    });
    if (!trySignIn?.error) return true;

    // Account doesn't exist → create it on the fly.
    const createRes = await fetch("/api/guest-auth/signup-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signupToken,
        fullName: fullName.trim() || "ضيف",
      }),
    });
    if (!createRes.ok) {
      const j = await createRes.json().catch(() => ({}));
      setError(j.error ?? "تعذّر إنشاء الحساب.");
      return false;
    }
    const retry = await signIn("guest-credentials", {
      phone: normalizedPhone,
      otpToken: signupToken,
      redirect: false,
    });
    if (retry?.error) {
      setError("تم إنشاء الحساب لكن تعذّر إنشاء الجلسة. حاول مرة أخرى.");
      return false;
    }
    return true;
  }

  async function completeSignIn(signupToken: string) {
    const ok = await ensureGuestAccount(signupToken);
    if (!ok) return;
    beforeRedirect?.();
    if (onAuthenticated) {
      onAuthenticated();
    } else {
      router.push(next);
      router.refresh();
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (otp.length < 6 || !normalizedPhone) {
      setError("أدخل الرمز المكوّن من 6 أرقام.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/guest-auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: normalizedPhone,
        code: otp,
        purpose: "login",
      }),
    });
    if (!res.ok) {
      setLoading(false);
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "الرمز غير صحيح.");
      return;
    }
    const data = (await res.json()) as { signupToken?: string };
    if (!data.signupToken) {
      setLoading(false);
      setError("استجابة غير صالحة.");
      return;
    }
    await completeSignIn(data.signupToken);
    setLoading(false);
  }

  function startSocial(provider: "google" | "apple") {
    beforeRedirect?.();
    // After the OAuth round-trip we land on `next`. If the social account
    // has no phone yet, the destination page (or /account/complete-profile)
    // will redirect appropriately based on `session.user.phone`.
    void signIn(provider, { callbackUrl: next });
  }

  return (
    <section className="bg-white rounded-2xl border border-gold/30 shadow-sm overflow-hidden">
      <div className="p-6 sm:p-7">
        <div className="text-center mb-5">
          <div className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[11px] font-semibold mb-3">
            <ShieldCheck size={12} /> دخول آمن — بدون كلمة سر
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-primary">
            {heading}
          </h2>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            {subheading}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-danger text-sm p-3 rounded-lg text-center mb-4">
            {error}
          </div>
        )}
        {info && !error && step === "verify" && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm p-3 rounded-lg mb-4 leading-relaxed">
            {info}
          </div>
        )}

        {step === "form" && (
          <form onSubmit={startOtp} className="space-y-4">
            {variant === "signup" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  الاسم الكامل <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                  placeholder="مثال: محمد أحمد"
                  autoComplete="name"
                  required
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  كما في الهوية أو جواز السفر — يساعدنا في تسجيل وصولك أسرع.
                </p>
              </div>
            )}

            {variant !== "signup" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  الاسم الكامل (لحجزك الأول)
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                  placeholder="مثال: محمد أحمد"
                  autoComplete="name"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  يُستخدم فقط إذا كنت تحجز معنا للمرة الأولى.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                رقم الهاتف (واتساب) <span className="text-danger">*</span>
              </label>
              <PhoneInput
                value={phone}
                onValueChange={setPhone}
                dialCode={phoneDialCode}
                onDialCodeChange={setPhoneDialCode}
                placeholder="7XXXXXXXX"
                className="w-full text-sm"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                ضغطة واحدة على رابط داخل واتساب وتدخل تلقائياً — بدون نسخ
                ولصق.
              </p>
            </div>

            <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 accent-primary"
              />
              <span>
                أوافق على{" "}
                <Link
                  href="/terms"
                  className="text-primary hover:underline"
                  target="_blank"
                >
                  شروط الاستخدام
                </Link>{" "}
                و
                <Link
                  href="/privacy"
                  className="text-primary hover:underline"
                  target="_blank"
                >
                  سياسة الخصوصية
                </Link>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !normalizedPhone || !agreed}
              className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary-dark transition disabled:opacity-50 shadow-md inline-flex items-center justify-center gap-2 text-base"
            >
              <MessageCircle size={18} />
              {loading ? "جارٍ الإرسال…" : ctaPrimary}
            </button>

            {showSocial && (socialEnabled.google || socialEnabled.apple) && (
              <>
                <div className="flex items-center gap-3 my-2">
                  <span className="flex-1 h-px bg-gray-200" />
                  <span className="text-[11px] text-gray-400 uppercase tracking-wider">
                    أو متابعة بـ
                  </span>
                  <span className="flex-1 h-px bg-gray-200" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {socialEnabled.google && (
                    <button
                      type="button"
                      onClick={() => startSocial("google")}
                      className="flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                    >
                      <GoogleIcon className="w-4 h-4" />
                      <span>Google</span>
                    </button>
                  )}
                  {socialEnabled.apple && (
                    <button
                      type="button"
                      onClick={() => startSocial("apple")}
                      className="flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 text-sm font-semibold bg-black text-white hover:bg-gray-900 transition"
                    >
                      <AppleIcon className="w-4 h-4" />
                      <span>Apple</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </form>
        )}

        {step === "verify" && (
          <form onSubmit={verifyOtp} className="space-y-4">
            {magicSent && !pollingTapped && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2 text-xs text-blue-800">
                <Loader2 size={16} className="animate-spin shrink-0 mt-0.5" />
                <span>
                  إذا ضغطت الرابط داخل واتساب فسنُكمل الدخول تلقائياً — لا
                  تُغلق هذه الصفحة.
                </span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                الرمز المكوّن من 6 أرقام
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center tracking-[0.6em] text-xl font-bold focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                autoFocus
                dir="ltr"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary-dark transition disabled:opacity-50 shadow-md"
            >
              {loading ? "جارٍ الدخول…" : "تأكيد ودخول"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("form");
                setOtp("");
                setError("");
                setInfo("");
                setMagicSent(false);
                setPollingTapped(false);
              }}
              className="w-full text-xs text-gray-500 hover:text-primary inline-flex items-center justify-center gap-1"
            >
              <ArrowLeft size={12} />
              تغيير الرقم أو إعادة الإرسال
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  // Inline SVG keeps the bundle dependency-free and avoids loading an
  // extra image just for the auth screen.
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M22.501 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.07 5.07 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.22-4.74 3.22-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.05-3.72 1.05-2.86 0-5.28-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.85 14.1A6.59 6.59 0 0 1 5.5 12c0-.73.13-1.43.35-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.67-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.2 1.65l3.15-3.15C17.45 2.07 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.67 2.84C6.72 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16.365 1.43c0 1.14-.41 2.21-1.23 3.21-.98 1.18-2.17 1.86-3.45 1.76-.16-1.13.41-2.31 1.21-3.27.9-1.06 2.41-1.85 3.47-1.7Zm4.34 16.18c-.61 1.4-1.34 2.79-2.5 2.81-1.13.02-1.5-.67-2.79-.67-1.3 0-1.71.65-2.78.69-1.12.04-1.97-1.51-2.59-2.91-1.27-2.86-2.24-8.07.94-11.6.78-.86 2.1-1.41 3.43-1.43 1.09-.02 2.12.74 2.79.74.66 0 1.93-.91 3.25-.78.55.02 2.11.22 3.11 1.69-2.7 1.7-2.27 5.55.5 6.84-.39 1.16-.92 2.32-1.36 3.62Z" />
    </svg>
  );
}
