"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  Loader2,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

interface UsageResponse {
  range: { days: number; startMs: number; endMs: number };
  local: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    lastSentAt: string | null;
  };
  meta: {
    conversations: number;
    cost: number;
    currency: string;
    hasMetaCost: boolean;
    error: string | null;
    lastSyncedAt: string;
  };
  byCategory: {
    category: string;
    conversations: number;
    messages: number;
    cost: number;
    estimated: boolean;
  }[];
  byTemplate: {
    name: string;
    templateId: number | null;
    metaId: string | null;
    language: string | null;
    category: string | null;
    status: string | null;
    sent: number;
    sentLocal: number;
    delivered: number | null;
    read: number | null;
    estimatedCost: number;
    rateUsed: number;
    costEstimated: boolean;
  }[];
  daily: { date: string; sent: number }[];
  guessedCountry: string;
}

interface PricingResponse {
  referenceUrl: string;
  lastUpdated: string;
  rates: { country: string; rates: Record<string, number> }[];
}

const RANGE_OPTIONS = [
  { value: 7, label: "آخر 7 أيام" },
  { value: 30, label: "آخر 30 يوم" },
  { value: 90, label: "آخر 90 يوم" },
  { value: 180, label: "آخر 6 أشهر" },
];

const CATEGORY_LABELS: Record<string, string> = {
  AUTHENTICATION: "تحقق (OTP)",
  MARKETING: "تسويقي",
  UTILITY: "خدمي / إشعار",
  SERVICE: "خدمة عملاء",
  UNKNOWN: "غير مصنف",
};

const CATEGORY_COLORS: Record<string, string> = {
  AUTHENTICATION: "bg-purple-50 border-purple-200 text-purple-800",
  MARKETING: "bg-amber-50 border-amber-200 text-amber-800",
  UTILITY: "bg-emerald-50 border-emerald-200 text-emerald-800",
  SERVICE: "bg-sky-50 border-sky-200 text-sky-800",
  UNKNOWN: "bg-gray-50 border-gray-200 text-gray-700",
};

function fmtMoney(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("ar-EG").format(n);
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(s));
  } catch {
    return s;
  }
}

export function UsageCostCard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UsageResponse | null>(null);
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPricing, setShowPricing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`/api/whatsapp/usage?days=${days}`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "تعذّر تحميل بيانات الاستخدام");
      }
      const json = (await res.json()) as UsageResponse;
      setData(json);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل التحميل");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/whatsapp/usage/pricing", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setPricing(j))
      .catch(() => undefined);
  }, []);

  const dailyMax = useMemo(() => {
    if (!data?.daily?.length) return 0;
    return Math.max(...data.daily.map((d) => d.sent));
  }, [data?.daily]);

  if (loading && !data) {
    return (
      <section className="bg-card-bg rounded-xl shadow-sm p-4 sm:p-6">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>جارِ تحميل بيانات الاستخدام …</span>
        </div>
      </section>
    );
  }

  if (!data) return null;

  const deliveryRate =
    data.local.sent > 0 ? Math.round((data.local.delivered / data.local.sent) * 100) : 0;
  const readRate =
    data.local.sent > 0 ? Math.round((data.local.read / data.local.sent) * 100) : 0;

  return (
    <section className="bg-card-bg rounded-xl shadow-sm p-4 sm:p-6 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-gray-800">الاستخدام والتكلفة</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              مزامنة فورية مع Meta — يعتمد على API الرسمي للتحليلات
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
          >
            {RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm flex items-center gap-1.5 hover:bg-gray-50 disabled:opacity-50"
          >
            {refreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            تحديث
          </button>
        </div>
      </header>

      {/* Status banner */}
      {data.meta.error && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-amber-900">
            <strong className="block">تعذّر جلب أرقام Meta الموثوقة:</strong>
            <span className="text-xs">{data.meta.error}</span>
            <p className="text-xs mt-1">
              يتم عرض الأرقام من السجل المحلي مع تقدير التكلفة حسب جدول التسعير الرسمي.
            </p>
          </div>
        </div>
      )}

      {!data.meta.error && data.meta.hasMetaCost && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-sm text-emerald-900">
          <CheckCircle2 className="w-4 h-4" />
          <span>الأرقام مزامَنة مع Meta — التكلفة المعروضة هي الفعلية المُحاسبة.</span>
          <span className="text-xs text-emerald-700 mr-auto">
            آخر مزامنة: {fmtDate(data.meta.lastSyncedAt)}
          </span>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Activity className="w-5 h-5" />}
          label="إجمالي الرسائل المُرسلة"
          value={fmtNumber(data.local.sent)}
          hint={`فشل: ${fmtNumber(data.local.failed)}`}
          tone="indigo"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="عدد المحادثات (Meta)"
          value={fmtNumber(data.meta.conversations)}
          hint={
            data.meta.hasMetaCost
              ? "موثقة من Meta"
              : "تقدير من السجل المحلي"
          }
          tone="blue"
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          label="إجمالي التكلفة"
          value={fmtMoney(data.meta.cost, data.meta.currency)}
          hint={data.meta.hasMetaCost ? "محاسبة Meta" : "تقدير حسب جدول التسعير"}
          tone="green"
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="نسبة التسليم / القراءة"
          value={`${deliveryRate}% / ${readRate}%`}
          hint={`قُرئت ${fmtNumber(data.local.read)} رسالة`}
          tone="emerald"
        />
      </div>

      {/* Daily sparkline */}
      {data.daily.length > 0 && (
        <div className="border border-gray-100 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-2">الإرسال اليومي خلال {days} يوم</p>
          <div className="flex items-end gap-0.5 h-16">
            {data.daily.map((d) => {
              const h = dailyMax > 0 ? (d.sent / dailyMax) * 100 : 0;
              return (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.sent} رسالة`}
                  className="flex-1 bg-primary/20 hover:bg-primary/40 transition-colors min-w-[4px] rounded-t"
                  style={{ height: `${Math.max(2, h)}%` }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Breakdown by category */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">التوزيع حسب فئة Meta</h3>
        {data.byCategory.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-lg">
            لا توجد بيانات في النطاق المحدد.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {data.byCategory.map((c) => (
              <div
                key={c.category}
                className={`p-3 rounded-lg border ${
                  CATEGORY_COLORS[c.category] ?? CATEGORY_COLORS.UNKNOWN
                }`}
              >
                <p className="text-xs font-medium opacity-80">
                  {CATEGORY_LABELS[c.category] ?? c.category}
                </p>
                <p className="text-lg font-bold mt-1">
                  {fmtMoney(c.cost, data.meta.currency)}
                  {c.estimated && (
                    <span className="text-[10px] mr-1 opacity-70">(تقدير)</span>
                  )}
                </p>
                <p className="text-[11px] mt-0.5 opacity-70">
                  {fmtNumber(c.conversations || c.messages)} {c.conversations ? "محادثة" : "رسالة"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Per-template usage */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          الاستخدام والتكلفة لكل قالب
        </h3>
        {data.byTemplate.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-lg">
            لم يتم إرسال أي قالب في النطاق المحدد.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-right">القالب</th>
                  <th className="px-3 py-2 text-right">الفئة</th>
                  <th className="px-3 py-2 text-right">عدد الإرسال</th>
                  <th className="px-3 py-2 text-right">السعر/قالب</th>
                  <th className="px-3 py-2 text-right">إجمالي التكلفة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.byTemplate.map((t) => (
                  <tr key={t.name}>
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs font-medium">{t.name}</div>
                      {t.language && (
                        <div className="text-[11px] text-gray-500">{t.language}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {t.category ? (
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] border ${
                            CATEGORY_COLORS[t.category.toUpperCase()] ?? CATEGORY_COLORS.UNKNOWN
                          }`}
                        >
                          {CATEGORY_LABELS[t.category.toUpperCase()] ?? t.category}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-semibold">{fmtNumber(t.sent)}</span>
                      {t.sent !== t.sentLocal && (
                        <span className="text-[10px] text-gray-500 mr-1">
                          (محلي: {fmtNumber(t.sentLocal)})
                        </span>
                      )}
                      {t.delivered !== null && t.delivered > 0 && (
                        <div className="text-[11px] text-gray-500">
                          سُلّم: {fmtNumber(t.delivered)}
                          {t.read !== null && t.read > 0 && ` · قرأ: ${fmtNumber(t.read)}`}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">
                      {fmtMoney(t.rateUsed, data.meta.currency)}
                    </td>
                    <td className="px-3 py-2 font-semibold">
                      {fmtMoney(t.estimatedCost, data.meta.currency)}
                      {t.costEstimated && (
                        <span className="text-[10px] mr-1 text-gray-500">(تقدير)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pricing reference */}
      <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-700">
              مرجع تسعير Meta الرسمي
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              التسعير يحدّد لكل دولة وفئة (تحقق / تسويقي / خدمي). عند توفر تكلفة Meta
              يُحاسب الفعلي، وإلا يُستخدم الجدول أدناه كتقدير.
              {pricing && ` · جدول مرجعي محلي محدَّث في ${pricing.lastUpdated}.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPricing((v) => !v)}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-white"
            >
              {showPricing ? "إخفاء جدول التسعير" : "عرض جدول التسعير"}
            </button>
            {pricing && (
              <a
                href={pricing.referenceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-white flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                صفحة تسعير Meta
              </a>
            )}
          </div>
        </div>

        {showPricing && pricing && (
          <div className="mt-3 overflow-x-auto rounded-lg border border-gray-100 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-right">الدولة</th>
                  <th className="px-3 py-2 text-right">تحقق (OTP)</th>
                  <th className="px-3 py-2 text-right">تسويقي</th>
                  <th className="px-3 py-2 text-right">خدمي</th>
                  <th className="px-3 py-2 text-right">خدمة عملاء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pricing.rates.map((r) => (
                  <tr
                    key={r.country}
                    className={
                      r.country === data.guessedCountry ? "bg-amber-50/40" : undefined
                    }
                  >
                    <td className="px-3 py-1.5 font-mono">{r.country}</td>
                    <td className="px-3 py-1.5">
                      {fmtMoney(r.rates.AUTHENTICATION ?? 0)}
                    </td>
                    <td className="px-3 py-1.5">{fmtMoney(r.rates.MARKETING ?? 0)}</td>
                    <td className="px-3 py-1.5">{fmtMoney(r.rates.UTILITY ?? 0)}</td>
                    <td className="px-3 py-1.5">{fmtMoney(r.rates.SERVICE ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-gray-500 px-3 py-2">
              السعر بالدولار الأمريكي لكل محادثة 24 ساعة. الدولة المظلَّلة هي الأكثر
              انتشاراً بين أرقام عملائك ({data.guessedCountry}). راجع
              صفحة Meta لأحدث تسعيرة.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone: "indigo" | "blue" | "green" | "emerald";
}

const TONE_CLASS: Record<StatCardProps["tone"], string> = {
  indigo: "bg-indigo-50 border-indigo-200 text-indigo-900",
  blue: "bg-sky-50 border-sky-200 text-sky-900",
  green: "bg-emerald-50 border-emerald-200 text-emerald-900",
  emerald: "bg-teal-50 border-teal-200 text-teal-900",
};

function StatCard({ icon, label, value, hint, tone }: StatCardProps) {
  return (
    <div className={`p-3 rounded-lg border ${TONE_CLASS[tone]}`}>
      <div className="flex items-center gap-2 opacity-75">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold mt-1">{value}</p>
      {hint && <p className="text-[11px] mt-0.5 opacity-70">{hint}</p>}
    </div>
  );
}
