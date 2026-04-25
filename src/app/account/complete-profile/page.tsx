"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { GuestShell } from "@/components/public/GuestShell";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { composePhone, formatPhoneDisplay } from "@/lib/phone";
import { resolveNextPath } from "@/lib/auth/next-url";
import { CheckCircle2, MessageCircle, Loader2 } from "lucide-react";

/**
 * `/account/complete-profile` — phone-link gate for guests who signed up
 * via Google or Apple (where the JWT lacks a `phone` claim).
 *
 * Flow:
 *   1. Show the user's social profile name + a phone-input form.
 *   2. POST /api/guest-auth/otp/start { phone, purpose: "change_phone" }.
 *      The server sends a WhatsApp OTP + magic link.
 *   3. User either taps the magic link in WhatsApp (we poll
 *      /api/guest-auth/otp/poll) or enters the 6-digit code manually.
 *   4. POST /api/guest-auth/otp/verify → returns a signupToken.
 *   5. POST /api/guest-auth/social/link-phone with that token.
 *   6. session.update() to refresh the JWT, then redirect to `next`.
 */

type Step = "intro" | "verify" | "done";

function CompleteProfileInner() {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = resolveNextPath(searchParams, "/account");

  const [step, setStep] = useState<Step>("intro");
  const [phone, setPhone] = useState("");
  const [phoneDialCode, setPhoneDialCode] = useState("+962");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [pollingTapped, setPollingTapped] = useState(false);

  const normalizedPhone = useMemo(
    () => composePhone(phoneDialCode, phone),
    [phoneDialCode, phone],
  );

  // If the guest already has a phone (e.g. they refreshed this page after
  // linking), bounce to `next` immediately.
  useEffect(() => {
    if (session?.user?.audience === "guest" && session.user.phone) {
      router.replace(next);
    }
  }, [session, router, next]);

  // Poll for the WhatsApp tap once we've sent an OTP.
  useEffect(() => {
    if (step !== "verify") return;
    if (!normalizedPhone) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch(
          `/api/guest-auth/otp/poll?phone=${encodeURIComponent(normalizedPhone!)}&purpose=change_phone`,
          { credentials: "include", cache: "no-store" },
        );
        const json = await res.json();
        if (cancelled) return;
        if (json.status === "tapped" && json.signupToken) {
          setPollingTapped(true);
          await completeLink(json.signupToken as string);
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
    if (!normalizedPhone) {
      setError("رقم الهاتف غير صالح. أدخل الرقم مع مفتاح الدولة.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/guest-auth/otp/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: normalizedPhone, purpose: "change_phone" }),
      credentials: "include",
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "تعذّر إرسال رمز التحقّق.");
      return;
    }
    const data = (await res.json()) as { magicLinkSent?: boolean };
    setMagicSent(Boolean(data.magicLinkSent));
    setInfo(
      `أرسلنا رسالة إلى واتساب ${formatPhoneDisplay(normalizedPhone)}. اضغط الرابط داخلها للتحقّق التلقائي، أو اكتب الرمز يدوياً هنا.`,
    );
    setStep("verify");
  }

  async function completeLink(signupToken: string) {
    const res = await fetch("/api/guest-auth/social/link-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: normalizedPhone, signupToken }),
      credentials: "include",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "تعذّر ربط الرقم بحسابك.");
      setLoading(false);
      return;
    }
    await updateSession();
    setStep("done");
    setTimeout(() => {
      router.replace(next);
      router.refresh();
    }, 1000);
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (otp.length < 6 || !normalizedPhone) {
      setError("أدخل الرمز المكوّن من 6 أرقام.");
      return;
    }
    setLoading(true);
    const verifyRes = await fetch("/api/guest-auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: normalizedPhone,
        code: otp,
        purpose: "change_phone",
      }),
    });
    if (!verifyRes.ok) {
      setLoading(false);
      const j = await verifyRes.json().catch(() => ({}));
      setError(j.error ?? "الرمز غير صحيح.");
      return;
    }
    const verifyData = (await verifyRes.json()) as { signupToken?: string };
    if (!verifyData.signupToken) {
      setLoading(false);
      setError("استجابة غير صالحة.");
      return;
    }
    await completeLink(verifyData.signupToken);
  }

  if (!session) {
    return (
      <GuestShell active="auth" lightHeader>
        <div className="max-w-md mx-auto text-center text-gray-500 py-10">
          جارٍ التحقّق من الجلسة…
        </div>
      </GuestShell>
    );
  }

  return (
    <GuestShell active="auth" lightHeader>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-primary">
            خطوة أخيرة
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            أهلاً {session.user?.name?.split(" ")[0] ?? ""} — أضف رقم هاتف
            للتواصل بشأن حجزك.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 sm:p-7">
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

          {step === "intro" && (
            <form onSubmit={startOtp} className="space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                نستخدم رقم هاتفك لإرسال تأكيد الحجز عبر واتساب وللتواصل
                السريع وقت الوصول. لن نشاركه مع أي طرف خارجي.
              </p>
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
                  سنرسل رمز تحقّق + رابط ضغطة واحدة عبر واتساب.
                </p>
              </div>
              <button
                type="submit"
                disabled={loading || !normalizedPhone}
                className="w-full bg-primary text-white py-2.5 rounded-lg font-bold hover:bg-primary-dark transition disabled:opacity-50 shadow-md inline-flex items-center justify-center gap-2"
              >
                <MessageCircle size={16} />
                {loading ? "جارٍ الإرسال…" : "إرسال رمز عبر واتساب"}
              </button>
            </form>
          )}

          {step === "verify" && (
            <form onSubmit={verifyOtp} className="space-y-4">
              {magicSent && !pollingTapped && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2 text-xs text-blue-800">
                  <Loader2
                    size={16}
                    className="animate-spin shrink-0 mt-0.5"
                  />
                  <span>
                    إذا ضغطت الرابط داخل واتساب فسنُكمل التحقّق تلقائياً —
                    لا تُغلق هذه الصفحة.
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
                className="w-full bg-primary text-white py-2.5 rounded-lg font-bold hover:bg-primary-dark transition disabled:opacity-50 shadow-md"
              >
                {loading ? "جارٍ التحقّق…" : "تأكيد ربط الرقم"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("intro");
                  setOtp("");
                  setError("");
                  setInfo("");
                }}
                className="w-full text-xs text-gray-500 hover:text-primary"
              >
                تغيير الرقم أو إعادة الإرسال
              </button>
            </form>
          )}

          {step === "done" && (
            <div className="text-center py-4">
              <CheckCircle2
                size={48}
                className="text-emerald-500 mx-auto mb-2"
              />
              <h2 className="text-lg font-bold text-primary">
                تمّ ربط الرقم بنجاح
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                ستُحوّل تلقائياً خلال لحظة…
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          تريد المتابعة لاحقاً؟{" "}
          <Link href="/account" className="text-primary hover:underline">
            تخطّي إلى حسابي
          </Link>
        </p>
      </div>
    </GuestShell>
  );
}

export default function CompleteProfilePage() {
  return (
    <Suspense fallback={null}>
      <CompleteProfileInner />
    </Suspense>
  );
}
