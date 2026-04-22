"use client";

import { signIn } from "next-auth/react";
import { useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { GuestShell } from "@/components/public/GuestShell";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { composePhone, formatPhoneDisplay } from "@/lib/phone";
import { resolveNextPath } from "@/lib/auth/next-url";

function SignInInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = resolveNextPath(searchParams, "/account");

  const [mode, setMode] = useState<"password" | "otp">("password");
  const [phone, setPhone] = useState("");
  const [phoneDialCode, setPhoneDialCode] = useState("+962");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const normalizedPhone = useMemo(
    () => composePhone(phoneDialCode, phone),
    [phoneDialCode, phone],
  );

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!normalizedPhone) {
      setError("رقم الهاتف غير صالح. أدخل الرقم مع مفتاح الدولة.");
      return;
    }
    if (password.length < 6) {
      setError("كلمة المرور قصيرة جداً.");
      return;
    }
    setLoading(true);
    const res = await signIn("guest-credentials", {
      phone: normalizedPhone,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("بيانات الدخول غير صحيحة. تحقّق من الرقم وكلمة المرور.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function handleRequestOtp() {
    setError("");
    setInfo("");
    if (!normalizedPhone) {
      setError("رقم الهاتف غير صالح.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/guest-auth/otp/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: normalizedPhone, purpose: "login" }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "تعذّر إرسال الرمز.");
      return;
    }
    setStep("verify");
    setInfo(
      `أرسلنا رمز التحقّق إلى واتساب ${formatPhoneDisplay(normalizedPhone)}. صالح لمدة 10 دقائق.`,
    );
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!normalizedPhone || otp.length < 6) {
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
      setError(j.error ?? "تعذّر التحقّق من الرمز.");
      return;
    }
    const verifyData = (await res.json()) as { signupToken?: string };
    const signInRes = await signIn("guest-credentials", {
      phone: normalizedPhone,
      otpToken: verifyData.signupToken ?? "",
      redirect: false,
    });
    setLoading(false);
    if (signInRes?.error) {
      setError(
        "تم التحقّق من الرمز لكن تعذّر إنشاء الجلسة. الرجاء استخدام كلمة المرور.",
      );
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <GuestShell active="auth" lightHeader>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-primary">
            تسجيل الدخول
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            أهلاً بعودتك. سجّل دخولك لمتابعة حجوزاتك والاطّلاع على قسيمتك.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 sm:p-7">
          <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-xl mb-5">
            <button
              type="button"
              onClick={() => {
                setMode("password");
                setStep("request");
                setError("");
                setInfo("");
              }}
              className={
                "flex-1 text-sm py-2 rounded-lg transition " +
                (mode === "password"
                  ? "bg-white text-primary shadow font-semibold"
                  : "text-gray-600")
              }
            >
              كلمة المرور
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("otp");
                setStep("request");
                setError("");
                setInfo("");
              }}
              className={
                "flex-1 text-sm py-2 rounded-lg transition " +
                (mode === "otp"
                  ? "bg-white text-primary shadow font-semibold"
                  : "text-gray-600")
              }
            >
              رمز واتساب
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-danger text-sm p-3 rounded-lg text-center mb-4">
              {error}
            </div>
          )}
          {info && !error && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm p-3 rounded-lg mb-4">
              {info}
            </div>
          )}

          {mode === "password" ? (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  رقم الهاتف
                </label>
                <PhoneInput
                  value={phone}
                  onValueChange={setPhone}
                  dialCode={phoneDialCode}
                  onDialCodeChange={setPhoneDialCode}
                  placeholder="7XXXXXXXX"
                  className="w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  كلمة المرور
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white py-2.5 rounded-lg font-bold hover:bg-primary-dark transition disabled:opacity-50 shadow-md"
              >
                {loading ? "جارٍ التحقّق…" : "دخول"}
              </button>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <Link
                  href="/signin/forgot"
                  className="text-primary hover:underline"
                >
                  نسيت كلمة المرور؟
                </Link>
                <Link
                  href={{
                    pathname: "/signup",
                    query: next !== "/account" ? { next } : undefined,
                  }}
                  className="text-primary hover:underline font-semibold"
                >
                  إنشاء حساب جديد
                </Link>
              </div>
            </form>
          ) : step === "request" ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  رقم الهاتف المسجّل
                </label>
                <PhoneInput
                  value={phone}
                  onValueChange={setPhone}
                  dialCode={phoneDialCode}
                  onDialCodeChange={setPhoneDialCode}
                  placeholder="7XXXXXXXX"
                  className="w-full text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleRequestOtp}
                disabled={loading || !normalizedPhone}
                className="w-full bg-primary text-white py-2.5 rounded-lg font-bold hover:bg-primary-dark transition disabled:opacity-50 shadow-md"
              >
                {loading ? "جارٍ الإرسال…" : "إرسال رمز عبر واتساب"}
              </button>
              <p className="text-xs text-gray-500 text-center">
                سنرسل رمزاً مؤلّفاً من 6 أرقام صالحاً لمدة 10 دقائق.
              </p>
            </div>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  رمز التحقّق
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center tracking-[0.6em] text-xl font-bold focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  required
                  autoFocus
                  dir="ltr"
                />
              </div>
              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full bg-primary text-white py-2.5 rounded-lg font-bold hover:bg-primary-dark transition disabled:opacity-50 shadow-md"
              >
                {loading ? "جارٍ الدخول…" : "تأكيد ودخول"}
              </button>
              <button
                type="button"
                onClick={() => setStep("request")}
                className="w-full text-xs text-gray-500 hover:text-primary"
              >
                إعادة إرسال أو تغيير الرقم
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          فريق العمل؟{" "}
          <Link href="/login" className="text-primary hover:underline">
            استخدم بوابة الموظفين
          </Link>
        </p>
      </div>
    </GuestShell>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}
