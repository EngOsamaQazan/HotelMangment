"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Phone,
  ShieldCheck,
  RefreshCw,
  Save,
  KeyRound,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import { Can } from "@/components/Can";

/**
 * PhoneNumberHealth — surfaces every operationally-relevant field Meta
 * exposes for the active WhatsApp number, plus inline actions:
 *
 *   • Quality rating (GREEN / YELLOW / RED)
 *   • Messaging tier (TIER_1K → TIER_UNLIMITED)
 *   • Health status (can_send_message)
 *   • Display name + request to change
 *   • Two-Step Verification PIN (set / replace)
 *
 * What the operator can do here = everything that used to require opening
 * WhatsApp Manager → Phone Numbers.
 */

interface PhoneDetail {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: "GREEN" | "YELLOW" | "RED" | "UNKNOWN";
  messaging_limit_tier?: string;
  name_status?: string;
  code_verification_status?: string;
  health_status?: {
    can_send_message?: "AVAILABLE" | "LIMITED" | "BLOCKED";
  };
  new_name_status?: string;
  platform_type?: string;
  is_pin_enabled?: boolean;
  is_official_business_account?: boolean;
}

export function PhoneNumberHealth() {
  const [active, setActive] = useState<PhoneDetail | null>(null);
  const [allNumbers, setAllNumbers] = useState<PhoneDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [pin, setPin] = useState("");
  const [pinSaving, setPinSaving] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/whatsapp/phone-numbers", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "تعذّر التحميل");
      setActive(j.active && !("_error" in j.active) ? j.active : null);
      setAllNumbers(Array.isArray(j.all) ? j.all : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر التحميل");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submitNameChange() {
    if (!newName.trim()) return;
    setSavingName(true);
    try {
      const res = await fetch("/api/whatsapp/phone-numbers/display-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName: newName.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "فشل");
      toast.success("تم إرسال طلب تغيير الاسم — Meta سيراجعه");
      setNewName("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setSavingName(false);
    }
  }

  async function submitPin() {
    if (!/^\d{6}$/.test(pin)) {
      toast.error("PIN يجب أن يكون 6 أرقام");
      return;
    }
    setPinSaving(true);
    try {
      const res = await fetch("/api/whatsapp/phone-numbers/two-step-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "فشل");
      toast.success("تم تحديث PIN التحقّق بخطوتين");
      setPin("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setPinSaving(false);
    }
  }

  return (
    <section className="bg-card-bg rounded-xl shadow-sm p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Phone size={20} className="text-primary" />
          <h2 className="text-lg font-bold text-gray-800">صحة رقم الواتساب</h2>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          تحديث من Meta
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      ) : !active ? (
        <div className="text-sm text-gray-500 py-4 text-center">
          لم يتم تحميل بيانات الرقم. أضف Access Token + Phone Number ID أولاً.
        </div>
      ) : (
        <>
          {/* Quick stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat
              label="الجودة"
              value={active.quality_rating ?? "UNKNOWN"}
              tone={qualityTone(active.quality_rating)}
              icon={<Activity size={14} />}
            />
            <Stat
              label="الفئة (Tier)"
              value={tierLabel(active.messaging_limit_tier)}
              tone="bg-gray-50 border-gray-200 text-gray-800"
            />
            <Stat
              label="الإرسال"
              value={
                active.health_status?.can_send_message === "AVAILABLE"
                  ? "متاح"
                  : active.health_status?.can_send_message === "LIMITED"
                    ? "محدود"
                    : active.health_status?.can_send_message === "BLOCKED"
                      ? "محظور"
                      : "غير معروف"
              }
              tone={
                active.health_status?.can_send_message === "AVAILABLE"
                  ? "bg-green-50 border-green-200 text-green-800"
                  : active.health_status?.can_send_message === "BLOCKED"
                    ? "bg-red-50 border-red-200 text-red-800"
                    : "bg-amber-50 border-amber-200 text-amber-800"
              }
            />
            <Stat
              label="حساب رسمي؟"
              value={active.is_official_business_account ? "نعم ✓" : "لا"}
              tone={
                active.is_official_business_account
                  ? "bg-blue-50 border-blue-200 text-blue-800"
                  : "bg-gray-50 border-gray-200 text-gray-800"
              }
            />
          </div>

          {/* Display name */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <ShieldCheck size={16} className="text-primary" />
                اسم العرض المعتمَد
              </div>
              <div className="text-lg font-bold text-gray-800">
                {active.verified_name || "—"}
              </div>
              <div className="text-[11px] text-gray-500 leading-relaxed">
                الحالة: <Badge>{active.name_status ?? "—"}</Badge>
                {active.new_name_status && (
                  <>
                    {" "}
                    • قيد المراجعة:{" "}
                    <Badge tone="amber">{active.new_name_status}</Badge>
                  </>
                )}
              </div>
              <Can permission="settings.whatsapp:edit">
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="اسم العرض الجديد (3-30 حرف)"
                    maxLength={30}
                    className="input flex-1"
                  />
                  <button
                    onClick={submitNameChange}
                    disabled={savingName || newName.length < 3}
                    className="flex items-center gap-1 px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-xs disabled:opacity-50"
                  >
                    {savingName ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Save size={12} />
                    )}
                    إرسال للمراجعة
                  </button>
                </div>
              </Can>
            </div>

            {/* 2FA PIN */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <KeyRound size={16} className="text-amber-600" />
                التحقّق بخطوتين (Two-Step PIN)
              </div>
              <div className="text-[11px] text-gray-500 leading-relaxed">
                الحالة:{" "}
                <Badge tone={active.is_pin_enabled ? "green" : "gray"}>
                  {active.is_pin_enabled ? "مُفعَّل" : "غير مُفعَّل"}
                </Badge>
              </div>
              <p className="text-[11px] text-gray-500">
                هذا PIN يحمي إعادة تسجيل الرقم على Cloud API. مطلوب من Meta
                لكل رقم. يجب حفظه في مكان آمن.
              </p>
              <Can permission="settings.whatsapp:edit">
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={pin}
                    onChange={(e) =>
                      setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="••••••"
                    className="input flex-1 direction-ltr text-center tracking-[0.4em] font-mono"
                  />
                  <button
                    onClick={submitPin}
                    disabled={pinSaving || pin.length !== 6}
                    className="flex items-center gap-1 px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-xs disabled:opacity-50"
                  >
                    {pinSaving ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <KeyRound size={12} />
                    )}
                    تعيين PIN
                  </button>
                </div>
              </Can>
            </div>
          </div>

          {/* Other numbers in WABA */}
          {allNumbers.length > 1 && (
            <div className="border border-gray-200 rounded-xl p-4 space-y-2">
              <div className="text-sm font-medium text-gray-700">
                أرقام أخرى في حساب الـ WABA
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-600 bg-gray-50 text-xs">
                    <tr>
                      <th className="text-right px-2 py-1.5 font-medium">الرقم</th>
                      <th className="text-right px-2 py-1.5 font-medium">الاسم</th>
                      <th className="text-right px-2 py-1.5 font-medium">الجودة</th>
                      <th className="text-right px-2 py-1.5 font-medium">Tier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {allNumbers.map((p) => (
                      <tr key={p.id}>
                        <td className="px-2 py-1.5 direction-ltr text-right">
                          +{p.display_phone_number?.replace(/^\+/, "")}
                        </td>
                        <td className="px-2 py-1.5 text-gray-700">
                          {p.verified_name ?? "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          <Badge tone={qualityBadgeTone(p.quality_rating)}>
                            {p.quality_rating ?? "—"}
                          </Badge>
                        </td>
                        <td className="px-2 py-1.5 text-gray-600 text-xs">
                          {tierLabel(p.messaging_limit_tier)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border: 1px solid rgb(229 231 235);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        :global(.input:focus) {
          outline: none;
          border-color: var(--color-primary, rgb(180 83 9));
          box-shadow: 0 0 0 2px rgba(180, 83, 9, 0.15);
        }
      `}</style>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-70">
        {icon}
        {label}
      </div>
      <div className="font-bold text-sm mt-1">{value}</div>
    </div>
  );
}

function Badge({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "gray" | "green" | "amber" | "red";
}) {
  const map = {
    gray: "bg-gray-100 text-gray-700",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${map[tone]}`}
    >
      {children}
    </span>
  );
}

function qualityTone(q?: string): string {
  if (q === "GREEN") return "bg-green-50 border-green-200 text-green-800";
  if (q === "YELLOW") return "bg-amber-50 border-amber-200 text-amber-800";
  if (q === "RED") return "bg-red-50 border-red-200 text-red-800";
  return "bg-gray-50 border-gray-200 text-gray-800";
}

function qualityBadgeTone(q?: string): "green" | "amber" | "red" | "gray" {
  if (q === "GREEN") return "green";
  if (q === "YELLOW") return "amber";
  if (q === "RED") return "red";
  return "gray";
}

function tierLabel(t?: string): string {
  if (!t) return "—";
  const map: Record<string, string> = {
    TIER_50: "50/يوم",
    TIER_250: "250/يوم",
    TIER_1K: "1,000/يوم",
    TIER_10K: "10,000/يوم",
    TIER_100K: "100,000/يوم",
    TIER_UNLIMITED: "غير محدود",
  };
  return map[t] ?? t;
}
