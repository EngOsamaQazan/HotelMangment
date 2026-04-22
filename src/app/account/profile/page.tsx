"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GuestShell } from "@/components/public/GuestShell";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { formatPhoneDisplay } from "@/lib/phone";

interface Profile {
  id: number;
  phone: string;
  email: string | null;
  fullName: string;
  nationality: string | null;
  idNumber: string | null;
  preferredLang: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [nationality, setNationality] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [preferredLang, setPreferredLang] = useState<"ar" | "en">("ar");

  useEffect(() => {
    fetch("/api/guest-me")
      .then((r) => r.json())
      .then((p: Profile) => {
        setProfile(p);
        setFullName(p.fullName ?? "");
        setEmail(p.email ?? "");
        setNationality(p.nationality ?? "");
        setIdNumber(p.idNumber ?? "");
        setPreferredLang(p.preferredLang === "en" ? "en" : "ar");
      })
      .catch(() => setError("تعذّر جلب بياناتك"))
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    const res = await fetch("/api/guest-me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        email,
        nationality,
        idNumber,
        preferredLang,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "تعذّر حفظ التعديلات");
      return;
    }
    const updated = await res.json();
    setProfile(updated);
    setSuccess("تم حفظ التعديلات بنجاح.");
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
            className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-semibold"
          >
            ملفي
          </Link>
          <Link
            href="/account/security"
            className="px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100"
          >
            الأمان
          </Link>
        </nav>

        <h1 className="text-xl font-bold text-primary mb-4">معلومات الحساب</h1>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {loading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-gray-100 rounded w-1/3" />
              <div className="h-10 bg-gray-100 rounded" />
              <div className="h-10 bg-gray-100 rounded" />
              <div className="h-10 bg-gray-100 rounded" />
            </div>
          ) : (
            <>
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
              <form onSubmit={save} className="space-y-4">
                <Field label="رقم الهاتف (لا يمكن تعديله من هنا)">
                  <input
                    type="text"
                    dir="ltr"
                    value={formatPhoneDisplay(profile?.phone)}
                    disabled
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                  />
                </Field>
                <Field label="الاسم الكامل">
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                    required
                    minLength={3}
                  />
                </Field>
                <Field label="البريد الإلكتروني">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    dir="ltr"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                  />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="الجنسية">
                    <CountrySelect
                      value={nationality}
                      onValueChange={setNationality}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition bg-white"
                    />
                  </Field>
                  <Field label="رقم الهوية/جواز السفر">
                    <input
                      type="text"
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      dir="ltr"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                    />
                  </Field>
                </div>
                <Field label="اللغة المفضّلة">
                  <select
                    value={preferredLang}
                    onChange={(e) =>
                      setPreferredLang(e.target.value as "ar" | "en")
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition bg-white"
                  >
                    <option value="ar">العربية</option>
                    <option value="en">English</option>
                  </select>
                </Field>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 rounded-lg bg-primary text-white font-bold hover:bg-primary-dark shadow-md disabled:opacity-50"
                  >
                    {saving ? "جارٍ الحفظ…" : "حفظ التعديلات"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </GuestShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
