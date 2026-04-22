"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GuestShell } from "@/components/public/GuestShell";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { composePhone, formatPhoneDisplay } from "@/lib/phone";

export default function ForgotPage() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "otp" | "reset">("phone");
  const [phone, setPhone] = useState("");
  const [phoneDialCode, setPhoneDialCode] = useState("+962");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupToken, setSignupToken] = useState<string | null>(null);

  const normalizedPhone = useMemo(
    () => composePhone(phoneDialCode, phone),
    [phoneDialCode, phone],
  );

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!normalizedPhone) {
      setError("رقم الهاتف غير صالح");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/guest-auth/otp/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: normalizedPhone, purpose: "reset" }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "تعذّر إرسال الرمز.");
      return;
    }
    setInfo(
      `إذا كان الرقم ${formatPhoneDisplay(normalizedPhone)} مسجّلاً، فقد أرسلنا إليه رمز إعادة التعيين.`,
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
        purpose: "reset",
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
      setError("رمز غير صالح");
      return;
    }
    setSignupToken(data.signupToken);
    setStep("reset");
    setInfo("تم التحقّق. اختر كلمة مرور جديدة.");
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!signupToken) {
      setError("انتهت صلاحية الجلسة. ابدأ من جديد.");
      return;
    }
    if (password.length < 6) {
      setError("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (password !== confirm) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/guest-auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signupToken, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "تعذّر تحديث كلمة المرور.");
      return;
    }
    router.push("/signin");
  }

  return (
    <GuestShell active="auth" lightHeader>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-primary">
            استعادة كلمة المرور
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            سنرسل إليك رمز تحقّق عبر واتساب لإعادة تعيين كلمة المرور.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 sm:p-7">
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

          {step === "phone" && (
            <form onSubmit={requestOtp} className="space-y-4">
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
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white py-2.5 rounded-lg font-bold hover:bg-primary-dark transition disabled:opacity-50 shadow-md"
              >
                {loading ? "جارٍ الإرسال…" : "إرسال رمز إعادة التعيين"}
              </button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={verifyOtp} className="space-y-4">
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
                {loading ? "جارٍ التحقّق…" : "تحقّق"}
              </button>
              <button
                type="button"
                onClick={() => setStep("phone")}
                className="w-full text-xs text-gray-500 hover:text-primary"
              >
                العودة وتغيير الرقم
              </button>
            </form>
          )}

          {step === "reset" && (
            <form onSubmit={resetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  كلمة المرور الجديدة
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  تأكيد كلمة المرور
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white py-2.5 rounded-lg font-bold hover:bg-primary-dark transition disabled:opacity-50 shadow-md"
              >
                {loading ? "جارٍ الحفظ…" : "تحديث كلمة المرور"}
              </button>
            </form>
          )}

          <p className="text-center text-xs text-gray-500 mt-5">
            <Link href="/signin" className="text-primary hover:underline">
              العودة إلى تسجيل الدخول
            </Link>
          </p>
        </div>
      </div>
    </GuestShell>
  );
}
