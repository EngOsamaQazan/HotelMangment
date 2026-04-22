"use client";

import { useState } from "react";
import Link from "next/link";
import { GuestShell } from "@/components/public/GuestShell";

export default function SecurityPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (next.length < 6) {
      setError("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (next !== confirm) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/guest-me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "تعذّر تغيير كلمة المرور");
      return;
    }
    setSuccess("تم تحديث كلمة المرور بنجاح.");
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  return (
    <GuestShell active="account" lightHeader>
      <div className="max-w-2xl mx-auto">
        <nav className="flex items-center gap-2 mb-6 text-sm">
          <Link
            href="/account"
            className="px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100"
          >
            حجوزاتي
          </Link>
          <Link
            href="/account/profile"
            className="px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100"
          >
            ملفي
          </Link>
          <Link
            href="/account/security"
            className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-semibold"
          >
            الأمان
          </Link>
        </nav>

        <h1 className="text-xl font-bold text-primary mb-4">
          الأمان وكلمة المرور
        </h1>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-danger text-sm p-3 rounded-lg mb-4">
              {error}
            </div>
          )}
          {success && !error && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm p-3 rounded-lg mb-4">
              {success}
            </div>
          )}

          <form onSubmit={save} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                كلمة المرور الحالية
              </label>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                كلمة المرور الجديدة
              </label>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                تأكيد كلمة المرور الجديدة
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-lg bg-primary text-white font-bold hover:bg-primary-dark shadow-md disabled:opacity-50"
            >
              {loading ? "جارٍ الحفظ…" : "تحديث كلمة المرور"}
            </button>
          </form>
        </div>
      </div>
    </GuestShell>
  );
}
