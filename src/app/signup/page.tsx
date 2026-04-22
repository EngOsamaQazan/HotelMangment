"use client";

import { signIn } from "next-auth/react";
import { useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { GuestShell } from "@/components/public/GuestShell";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { composePhone, formatPhoneDisplay } from "@/lib/phone";
import { resolveNextPath } from "@/lib/auth/next-url";

type Step = "info" | "otp" | "password";

function SignUpInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = resolveNextPath(searchParams, "/account");

  const [step, setStep] = useState<Step>("info");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneDialCode, setPhoneDialCode] = useState("+962");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [signupToken, setSignupToken] = useState<string | null>(null);

  const normalizedPhone = useMemo(
    () => composePhone(phoneDialCode, phone),
    [phoneDialCode, phone],
  );

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (fullName.trim().length < 3) {
      setError("الاسم قصير جداً");
      return;
    }
    if (!normalizedPhone) {
      setError("رقم الهاتف غير صالح. أدخل الرقم مع مفتاح الدولة.");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("البريد الإلكتروني غير صالح");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/guest-auth/otp/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: normalizedPhone, purpose: "signup" }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "تعذّر إرسال رمز التحقّق.");
      return;
    }
    setInfo(
      `أرسلنا رمز التحقّق إلى واتساب ${formatPhoneDisplay(normalizedPhone)}. صالح لمدة 10 دقائق.`,
    );
    setStep("otp");
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (otp.length < 6) {
      setError("أدخل الرمز المكوّن من 6 أرقام");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/guest-auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: normalizedPhone,
        code: otp,
        purpose: "signup",
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "الرمز غير صحيح.");
      return;
    }
    const data = (await res.json()) as { signupToken?: string };
    if (!data.signupToken) {
      setError("رمز غير صالح. أعد المحاولة.");
      return;
    }
    setSignupToken(data.signupToken);
    setInfo("تم التحقّق من رقمك. اختر كلمة مرور لإكمال التسجيل.");
    setStep("password");
  }

  async function completeSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!signupToken) {
      setError("انتهت صلاحية الجلسة. ابدأ من جديد.");
      return;
    }
    if (password.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (password !== confirm) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    if (!agreed) {
      setError("يجب الموافقة على شروط الاستخدام قبل المتابعة");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/guest-auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signupToken,
        fullName: fullName.trim(),
        password,
        email: email.trim() || null,
      }),
    });
    if (!res.ok) {
      setLoading(false);
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "تعذّر إنشاء الحساب.");
      return;
    }
    // Silent sign-in using the password we just set.
    const signInRes = await signIn("guest-credentials", {
      phone: normalizedPhone,
      password,
      redirect: false,
    });
    setLoading(false);
    if (signInRes?.error) {
      setError("تم إنشاء الحساب. سجّل الدخول من فضلك.");
      router.push("/signin");
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
            إنشاء حساب ضيف
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            احجز مباشرة مع الفندق واحصل على أفضل الأسعار وخدمة أسرع.
          </p>
        </div>

        <Stepper step={step} />

        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 sm:p-7 mt-5">
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

          {step === "info" && (
            <form onSubmit={requestOtp} className="space-y-4">
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
              </div>
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
                  سنرسل رمز تحقّق عبر واتساب للتأكّد من الرقم.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  البريد الإلكتروني (اختياري)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                  placeholder="you@example.com"
                  dir="ltr"
                  autoComplete="email"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white py-2.5 rounded-lg font-bold hover:bg-primary-dark transition disabled:opacity-50 shadow-md"
              >
                {loading ? "جارٍ الإرسال…" : "إرسال رمز التحقّق"}
              </button>
              <p className="text-xs text-gray-500 text-center">
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
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={verifyOtp} className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                أدخل الرمز المكوّن من 6 أرقام الذي أرسلناه إلى واتساب{" "}
                <span className="font-bold text-primary" dir="ltr">
                  {formatPhoneDisplay(normalizedPhone)}
                </span>
              </p>
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
              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full bg-primary text-white py-2.5 rounded-lg font-bold hover:bg-primary-dark transition disabled:opacity-50 shadow-md"
              >
                {loading ? "جارٍ التحقّق…" : "تحقّق من الرمز"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("info");
                  setOtp("");
                }}
                className="w-full text-xs text-gray-500 hover:text-primary"
              >
                العودة لتعديل البيانات أو إعادة إرسال الرمز
              </button>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={completeSignup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  كلمة المرور <span className="text-danger">*</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  استخدم 6 أحرف على الأقل. يُفضَّل مزج الحروف مع الأرقام.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  تأكيد كلمة المرور <span className="text-danger">*</span>
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>
              <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5"
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
                disabled={loading || !agreed}
                className="w-full bg-primary text-white py-2.5 rounded-lg font-bold hover:bg-primary-dark transition disabled:opacity-50 shadow-md"
              >
                {loading ? "جارٍ إنشاء الحساب…" : "إنشاء الحساب"}
              </button>
            </form>
          )}
        </div>
      </div>
    </GuestShell>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "info", label: "البيانات" },
    { key: "otp", label: "التحقّق" },
    { key: "password", label: "كلمة المرور" },
  ];
  const activeIndex = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-2 max-w-sm mx-auto">
      {steps.map((s, i) => {
        const active = i <= activeIndex;
        return (
          <div key={s.key} className="flex-1 flex items-center gap-2">
            <div
              className={
                "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 " +
                (active
                  ? "bg-primary text-white"
                  : "bg-gray-200 text-gray-500")
              }
            >
              {i + 1}
            </div>
            <span
              className={
                "text-xs " +
                (active ? "text-primary font-semibold" : "text-gray-500")
              }
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span
                className={
                  "flex-1 h-px " +
                  (i < activeIndex ? "bg-primary" : "bg-gray-200")
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpInner />
    </Suspense>
  );
}
