"use client";

import { signIn } from "next-auth/react";
import { useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { GuestShell } from "@/components/public/GuestShell";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { composePhone } from "@/lib/phone";
import { resolveNextPath } from "@/lib/auth/next-url";
import { UnifiedAuthGate } from "@/components/auth/UnifiedAuthGate";

/**
 * /signin
 *
 * Phone-first OTP via WhatsApp is the default and most prominent flow
 * (driven by `<UnifiedAuthGate>`). Legacy guests who set a password
 * before the passwordless migration can still log in via the
 * "كلمة المرور" tab — but it is intentionally secondary.
 */
function SignInInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = resolveNextPath(searchParams, "/account");

  const [showPasswordFallback, setShowPasswordFallback] = useState(false);

  return (
    <GuestShell active="auth" lightHeader>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-primary">
            تسجيل الدخول
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            أهلاً بعودتك. أدخل رقمك ليصلك رمز فوري عبر واتساب.
          </p>
        </div>

        {!showPasswordFallback ? (
          <>
            <UnifiedAuthGate
              next={next}
              variant="signin"
              socialEnabled={{
                google: process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "1",
                apple: process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED === "1",
              }}
            />
            <div className="text-center mt-4 text-xs text-gray-500">
              حساب قديم بكلمة مرور؟{" "}
              <button
                type="button"
                onClick={() => setShowPasswordFallback(true)}
                className="text-primary hover:underline font-semibold"
              >
                استخدم كلمة المرور
              </button>
            </div>
          </>
        ) : (
          <PasswordFallback
            onCancel={() => setShowPasswordFallback(false)}
            next={next}
            router={router}
          />
        )}

        <div className="text-center mt-6 text-xs text-gray-500">
          ليس لديك حساب؟{" "}
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

        <p className="text-center text-xs text-gray-400 mt-6">
          فريق العمل؟{" "}
          <a href="/login" className="text-primary hover:underline">
            استخدم بوابة الموظفين
          </a>
        </p>
      </div>
    </GuestShell>
  );
}

function PasswordFallback({
  onCancel,
  next,
  router,
}: {
  onCancel: () => void;
  next: string;
  router: ReturnType<typeof useRouter>;
}) {
  const [phone, setPhone] = useState("");
  const [phoneDialCode, setPhoneDialCode] = useState("+962");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const normalizedPhone = useMemo(
    () => composePhone(phoneDialCode, phone),
    [phoneDialCode, phone],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
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
      setError(
        "بيانات الدخول غير صحيحة. تحقّق من الرقم وكلمة المرور، أو ادخل بـ OTP.",
      );
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <section className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 sm:p-7">
      <div className="text-center mb-4">
        <h2 className="text-lg font-bold text-primary">دخول بكلمة المرور</h2>
        <p className="text-xs text-gray-500 mt-1">
          متاح فقط للحسابات القديمة. الحسابات الجديدة تستخدم رمز واتساب.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-danger text-sm p-3 rounded-lg text-center mb-4">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
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
          <button
            type="button"
            onClick={onCancel}
            className="text-primary hover:underline font-semibold"
          >
            عودة لتسجيل الدخول برمز واتساب
          </button>
        </div>
      </form>
    </section>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}
