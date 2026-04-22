"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", {
      identifier,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("بيانات الدخول غير صحيحة");
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4 sm:px-6 py-8 overflow-auto z-50"
      style={{
        background:
          "radial-gradient(ellipse at top, #155A4C 0%, #0E3B33 50%, #092923 100%)",
      }}
    >
      {/* Decorative gold ornaments */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 right-10 w-64 h-64 rounded-full bg-gold/5 blur-3xl" />
        <div className="absolute bottom-10 left-10 w-80 h-80 rounded-full bg-gold/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Brand lockup above card */}
        <div className="text-center mb-6">
          <BrandLogo size="xl" />
          <p className="text-gold-light/80 text-xs sm:text-sm mt-3 tracking-widest">
            نظام الإدارة المتكامل
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 border-t-4 border-gold">
          <div className="text-center mb-6">
            <span className="inline-block bg-primary/10 text-primary text-[11px] font-bold tracking-widest px-3 py-1 rounded-full mb-3">
              دخول فريق العمل
            </span>
            <h2 className="text-lg font-bold text-primary">تسجيل الدخول</h2>
            <p className="text-xs text-gray-500 mt-1">
              بوابة إدارة الفندق — للموظفين المعتمدين
            </p>
          </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-danger text-sm p-3 rounded-lg text-center font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              البريد الإلكتروني أو اسم المستخدم
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              placeholder="admin@fakher.jo أو osama"
              autoComplete="username"
              required
              dir="ltr"
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
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-2.5 rounded-lg font-bold hover:bg-primary-dark transition disabled:opacity-50 border border-gold/40 shadow-md"
          >
            {loading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
          </button>
        </form>

          <div className="mt-6 pt-4 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-500">
              ضيف؟{" "}
              <Link
                href="/signin"
                className="text-primary font-bold hover:text-primary-dark underline underline-offset-2"
              >
                سجّل دخولك من هنا
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-gold/60 text-[11px] mt-6 tracking-wider">
          © 2026 فندق المفرق — جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
