"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Loader2,
  Save,
  KeyRound,
  Eye,
  EyeOff,
  PlayCircle,
  Trash2,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Users,
  CircleDollarSign,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Can } from "@/components/Can";
import type { BotPublicConfig } from "@/lib/whatsapp/bot/config";

// Shared Tailwind class fragments — keeps the JSX below readable while
// matching the visual language used by the existing settings pages.
const INPUT =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900";
const SELECT = INPUT;
const BTN_BASE =
  "inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition disabled:opacity-50";
const BTN_PRIMARY = `${BTN_BASE} bg-emerald-600 text-white hover:bg-emerald-700`;
const BTN_GHOST = `${BTN_BASE} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200`;

/**
 * Operator-facing settings for the WhatsApp AI Concierge bot.
 *
 * Sections:
 *   1. Mode + kill switch (the most important control on the page)
 *   2. Persona + LLM provider
 *   3. Stripe payment configuration
 *   4. Active hours + budget circuit breaker
 *   5. Allowlist (Layer 4 of staged rollout)
 *   6. Sandbox tester (chat with the bot without touching WhatsApp)
 *
 * Every section is independently saveable so an operator can flip the
 * kill switch without re-editing keys, etc.
 */
export default function BotSettingsPage() {
  return (
    <Can permission="whatsapp.bot:view">
      <BotSettingsContent />
    </Can>
  );
}

interface AllowlistRow {
  id: number;
  phone: string;
  note: string | null;
  isActive: boolean;
  createdAt: string;
  addedBy?: { id: number; name: string } | null;
}

function BotSettingsContent() {
  const [cfg, setCfg] = useState<BotPublicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/bot/config");
      if (!res.ok) throw new Error(await res.text());
      setCfg(await res.json());
    } catch (e) {
      toast.error("تعذّر تحميل الإعدادات: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaving(true);
      try {
        const res = await fetch("/api/whatsapp/bot/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(await res.text());
        const updated = (await res.json()) as BotPublicConfig;
        setCfg(updated);
        toast.success("تم الحفظ");
      } catch (e) {
        toast.error("تعذّر الحفظ: " + (e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  if (loading || !cfg) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="mx-auto max-w-5xl space-y-6 p-4 lg:p-8">
      <header className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">بوت الحجز عبر واتساب</h1>
            <p className="text-sm text-gray-500">
              مساعد ذكاء اصطناعي يدير محادثات الضيوف ويُتمّ الحجز حتى الدفع.
            </p>
          </div>
        </div>
        {saving && (
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
        )}
      </header>

      <ModeCard cfg={cfg} onSave={save} />
      <PersonaCard cfg={cfg} onSave={save} />
      <StripeCard cfg={cfg} onSave={save} />
      <BudgetHoursCard cfg={cfg} onSave={save} />
      <AllowlistCard />
      <SandboxCard />
    </div>
  );
}

// ─────────────────────────── Mode card ────────────────────────────
function ModeCard({
  cfg,
  onSave,
}: {
  cfg: BotPublicConfig;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [mode, setMode] = useState(cfg.botMode || "off");
  const [pct, setPct] = useState(toFiniteNumber(cfg.botRolloutPercentage, 0));
  const [breaker, setBreaker] = useState(!!cfg.botCircuitBreakerEnabled);

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <SectionTitle
        icon={<ShieldCheck className="h-4 w-4" />}
        title="وضع التشغيل (Kill Switch)"
        hint="غيِّر الوضع لإيقاف البوت فوراً أو لتفعيل اختبار آمن قبل الإطلاق العام."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="الوضع">
          <select
            className={SELECT}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="off">إيقاف كامل</option>
            <option value="shadow">Shadow — اعرض المسودات فقط</option>
            <option value="allowlist">Allowlist — أرقام محددة فقط</option>
            <option value="percentage">Percentage — نسبة تدريجية</option>
            <option value="full">تشغيل لكل الضيوف</option>
          </select>
        </Field>

        {mode === "percentage" && (
          <Field label={`نسبة التدرّج: ${pct}%`}>
            <input
              type="range"
              min={0}
              max={100}
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              className="w-full"
            />
          </Field>
        )}

        <Field label="قاطع الحماية التلقائي">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={breaker}
              onChange={(e) => setBreaker(e.target.checked)}
            />
            تفعيل قطع الخدمة عند تجاوز الميزانية اليومية
          </label>
        </Field>
      </div>
      <SaveBar
        onSave={() =>
          onSave({
            botMode: mode,
            botRolloutPercentage: pct,
            botCircuitBreakerEnabled: breaker,
          })
        }
      />
    </section>
  );
}

// ─────────────────────────── Persona card ───────────────────────────
function PersonaCard({
  cfg,
  onSave,
}: {
  cfg: BotPublicConfig;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(cfg.botPersonaName || "محمد");
  const [tone, setTone] = useState(cfg.botPersonaTone || "warm");
  const [provider, setProvider] = useState(cfg.botLlmProvider || "openai");
  const [model, setModel] = useState(cfg.botLlmModel || "gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [pacing, setPacing] = useState(!!cfg.botHumanlikePacing);
  const [hops, setHops] = useState(toFiniteNumber(cfg.botMaxToolHops, 5));
  const [turns, setTurns] = useState(toFiniteNumber(cfg.botMaxTurns, 12));

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <SectionTitle
        icon={<Sparkles className="h-4 w-4" />}
        title="الشخصية ومزوّد الذكاء الاصطناعي"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="اسم الموظف الافتراضي">
          <input
            className={INPUT}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="محمد"
          />
        </Field>
        <Field label="نبرة الحديث">
          <select className={SELECT} value={tone} onChange={(e) => setTone(e.target.value)}>
            <option value="warm">دافئة</option>
            <option value="formal">رسمية</option>
            <option value="playful">مرحة</option>
          </select>
        </Field>
        <Field label="مزوّد LLM">
          <select
            className={SELECT}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="openai">OpenAI</option>
            <option value="gemini" disabled>
              Google Gemini (قريباً)
            </option>
            <option value="anthropic" disabled>
              Anthropic (قريباً)
            </option>
          </select>
        </Field>
        <Field label="اسم الموديل">
          <input
            className={`${INPUT} font-mono`}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o-mini"
          />
        </Field>
        <Field
          label={
            <span className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              مفتاح OpenAI
              {cfg.hasBotLlmApiKey && (
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  محفوظ
                </span>
              )}
            </span>
          }
        >
          <div className="flex gap-2">
            <input
              type={showKey ? "text" : "password"}
              className={`${INPUT} flex-1 font-mono`}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={cfg.hasBotLlmApiKey ? "اترك الحقل فارغاً للاحتفاظ بالمفتاح الحالي" : "sk-..."}
            />
            <button type="button" className={BTN_GHOST} onClick={() => setShowKey((s) => !s)}>
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Field label="إيقاع شبيه بالإنسان">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pacing}
              onChange={(e) => setPacing(e.target.checked)}
            />
            تقسيم الردود الطويلة + تأخير زمني واقعي
          </label>
        </Field>
        <Field label="حد استدعاءات الأدوات لكل رسالة">
          <input
            type="number"
            min={1}
            max={12}
            className={INPUT}
            value={hops}
            onChange={(e) => setHops(Number(e.target.value))}
          />
        </Field>
        <Field label="حد دورات المحادثة المحفوظة">
          <input
            type="number"
            min={4}
            max={32}
            className={INPUT}
            value={turns}
            onChange={(e) => setTurns(Number(e.target.value))}
          />
        </Field>
      </div>
      <SaveBar
        onSave={() =>
          onSave({
            botPersonaName: name,
            botPersonaTone: tone,
            botLlmProvider: provider,
            botLlmModel: model,
            ...(apiKey ? { botLlmApiKey: apiKey } : {}),
            botHumanlikePacing: pacing,
            botMaxToolHops: hops,
            botMaxTurns: turns,
          })
        }
      />
    </section>
  );
}

// ─────────────────────────── Stripe card ───────────────────────────
function StripeCard({
  cfg,
  onSave,
}: {
  cfg: BotPublicConfig;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [currency, setCurrency] = useState(cfg.botPaymentCurrency || "JOD");
  const [secret, setSecret] = useState("");
  const [whSecret, setWhSecret] = useState("");
  const [baseUrl, setBaseUrl] = useState(cfg.botPublicBaseUrl ?? "");
  const [showSecret, setShowSecret] = useState(false);
  const [showWh, setShowWh] = useState(false);

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <SectionTitle
        icon={<CircleDollarSign className="h-4 w-4" />}
        title="إعدادات الدفع (Stripe)"
        hint="يستخدمها البوت لإنشاء روابط دفع تدعم Apple Pay و Google Pay والبطاقات الدولية."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="عملة الدفع (ISO 4217)">
          <input
            className={`${INPUT} font-mono`}
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
          />
        </Field>
        <Field label="رابط الموقع العام (لروابط النجاح/الإلغاء)">
          <input
            className={`${INPUT} ltr:text-left`}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://booking.example.com"
            dir="ltr"
          />
        </Field>
        <Field
          label={
            <span className="flex items-center gap-2">
              مفتاح Stripe السري
              {cfg.hasBotStripeSecret && (
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  محفوظ
                </span>
              )}
            </span>
          }
        >
          <div className="flex gap-2">
            <input
              type={showSecret ? "text" : "password"}
              className={`${INPUT} flex-1 font-mono`}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={cfg.hasBotStripeSecret ? "اتركه فارغاً للاحتفاظ بالمفتاح الحالي" : "sk_live_..."}
              dir="ltr"
            />
            <button
              type="button"
              className={BTN_GHOST}
              onClick={() => setShowSecret((s) => !s)}
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Field
          label={
            <span className="flex items-center gap-2">
              مفتاح توقيع الـwebhook
              {cfg.hasBotStripeWebhookSecret && (
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  محفوظ
                </span>
              )}
            </span>
          }
        >
          <div className="flex gap-2">
            <input
              type={showWh ? "text" : "password"}
              className={`${INPUT} flex-1 font-mono`}
              value={whSecret}
              onChange={(e) => setWhSecret(e.target.value)}
              placeholder={cfg.hasBotStripeWebhookSecret ? "محفوظ — اتركه فارغاً" : "whsec_..."}
              dir="ltr"
            />
            <button type="button" className={BTN_GHOST} onClick={() => setShowWh((s) => !s)}>
              {showWh ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
      </div>
      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
        <AlertTriangle className="mb-0.5 me-1 inline h-3.5 w-3.5" />
        أضف هذا الرابط في Stripe Dashboard → Webhooks:{" "}
        <code className="rounded bg-white/60 px-1 dark:bg-black/40">
          {(baseUrl || cfg.botPublicBaseUrl || "https://YOUR-DOMAIN").replace(/\/$/, "")}
          /api/payments/stripe/webhook
        </code>
        <br />
        الأحداث المطلوبة: <code>checkout.session.completed</code>, <code>checkout.session.expired</code>, <code>payment_intent.payment_failed</code>.
      </p>
      <SaveBar
        onSave={() =>
          onSave({
            botPaymentCurrency: currency,
            botPublicBaseUrl: baseUrl,
            ...(secret ? { botStripeSecretKey: secret } : {}),
            ...(whSecret ? { botStripeWebhookSecret: whSecret } : {}),
          })
        }
      />
    </section>
  );
}

// ─────────────────────────── Budget + hours card ─────────────────────
function BudgetHoursCard({
  cfg,
  onSave,
}: {
  cfg: BotPublicConfig;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  // Decimal columns from Prisma are serialised as strings over JSON; coerce
  // to numbers and tolerate the (theoretically impossible) null case so a
  // brand-new install never crashes the page on first render.
  const budgetNum = toFiniteNumber(cfg.botDailyBudgetUsd, 0);
  const spentNum = toFiniteNumber(cfg.botCostTodayUsd, 0);
  const [budget, setBudget] = useState(budgetNum);
  const [start, setStart] = useState(cfg.botActiveHoursStart ?? "");
  const [end, setEnd] = useState(cfg.botActiveHoursEnd ?? "");
  const remaining = useMemo(
    () => Math.max(0, budgetNum - spentNum),
    [budgetNum, spentNum],
  );

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <SectionTitle
        icon={<CircleDollarSign className="h-4 w-4" />}
        title="الميزانية وساعات العمل"
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="الميزانية اليومية (USD)">
          <input
            type="number"
            step="0.01"
            min={0}
            className={INPUT}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
          />
          <p className="mt-1 text-xs text-gray-500">
            تكلفة اليوم: ${spentNum.toFixed(4)} • المتبقي: ${remaining.toFixed(4)}
          </p>
        </Field>
        <Field label="بداية ساعات العمل (Asia/Amman)">
          <input
            type="time"
            className={INPUT}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="نهاية ساعات العمل">
          <input
            type="time"
            className={INPUT}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        خارج الساعات يحوّل البوت تلقائياً للموظف البشري. اتركها فارغة لتشغيل 24/7.
      </p>
      <SaveBar
        onSave={() =>
          onSave({
            botDailyBudgetUsd: budget,
            botActiveHoursStart: start || null,
            botActiveHoursEnd: end || null,
          })
        }
      />
    </section>
  );
}

// ─────────────────────────── Allowlist card ─────────────────────────
function AllowlistCard() {
  const [rows, setRows] = useState<AllowlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/bot/allowlist");
      if (!res.ok) throw new Error(await res.text());
      setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = useCallback(async () => {
    if (!phone.trim()) return;
    try {
      const res = await fetch("/api/whatsapp/bot/allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, note }),
      });
      if (!res.ok) throw new Error(await res.text());
      setPhone("");
      setNote("");
      await reload();
      toast.success("تمت الإضافة");
    } catch (e) {
      toast.error("تعذّر: " + (e as Error).message);
    }
  }, [phone, note, reload]);

  const toggle = useCallback(
    async (id: number, active: boolean) => {
      await fetch(`/api/whatsapp/bot/allowlist/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: active }),
      });
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: number) => {
      if (!confirm("حذف هذا الرقم من القائمة؟")) return;
      await fetch(`/api/whatsapp/bot/allowlist/${id}`, { method: "DELETE" });
      await reload();
    },
    [reload],
  );

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <SectionTitle
        icon={<Users className="h-4 w-4" />}
        title="قائمة الاختبار (Allowlist)"
        hint="عند تفعيل وضع Allowlist لا يردّ البوت إلا على هذه الأرقام."
      />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="رقم E.164 (مثل 962781099910)">
          <input
            className={`${INPUT} font-mono`}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label="ملاحظة">
          <input
            className={INPUT}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="موظف الاستقبال للاختبار"
          />
        </Field>
        <button onClick={add} className={BTN_PRIMARY}>
          <Plus className="me-1 h-4 w-4" />
          إضافة
        </button>
      </div>
      <div className="mt-4">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500">لا توجد أرقام بعد.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-start text-xs text-gray-500">
              <tr>
                <th className="py-2">الرقم</th>
                <th>ملاحظة</th>
                <th>أُضيف بواسطة</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-2 font-mono ltr:text-left" dir="ltr">
                    {r.phone}
                  </td>
                  <td>{r.note ?? "—"}</td>
                  <td>{r.addedBy?.name ?? "—"}</td>
                  <td>
                    <button
                      onClick={() => toggle(r.id, !r.isActive)}
                      className={`rounded px-2 py-0.5 text-xs ${
                        r.isActive
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-800"
                      }`}
                    >
                      {r.isActive ? "مفعّل" : "موقوف"}
                    </button>
                  </td>
                  <td>
                    <button onClick={() => remove(r.id)} className="text-red-600 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────── Sandbox card ──────────────────────────
function SandboxCard() {
  const [tag, setTag] = useState("");
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [trace, setTrace] = useState<unknown[] | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);

  const send = useCallback(async () => {
    if (!message.trim()) return;
    setRunning(true);
    setReply(null);
    setTrace(null);
    try {
      const res = await fetch("/api/whatsapp/bot/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sandboxPhone: tag, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطأ");
      setReply(data.finalText);
      setTrace(data.trace);
      setCost(data.costUsd);
      setMessage("");
    } catch (e) {
      toast.error("تعذّر: " + (e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [tag, message]);

  const reset = useCallback(async () => {
    setRunning(true);
    try {
      await fetch("/api/whatsapp/bot/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sandboxPhone: tag, reset: true }),
      });
      setTrace(null);
      setReply(null);
      setCost(null);
      toast.success("تمّ مسح الجلسة");
    } finally {
      setRunning(false);
    }
  }, [tag]);

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <SectionTitle
        icon={<Wand2 className="h-4 w-4" />}
        title="Sandbox — اختبار آمن"
        hint="حادث البوت من هنا قبل أي إطلاق. لا يتم إرسال أي رسالة لرقم حقيقي."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="هويّة الجلسة (لتمييز الاختبارات)">
          <input
            className={INPUT}
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="my-test-1"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="رسالة الضيف الافتراضي">
            <textarea
              className={INPUT}
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="بدي شقة لشخصين من 12-05-2026 إلى 14-05-2026"
            />
          </Field>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={send} disabled={running} className={BTN_PRIMARY}>
          {running ? (
            <Loader2 className="me-1 h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="me-1 h-4 w-4" />
          )}
          تشغيل
        </button>
        <button onClick={reset} disabled={running} className={BTN_GHOST}>
          مسح الجلسة
        </button>
      </div>
      {reply !== null && (
        <div className="mt-4 rounded-lg border bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> ردّ البوت
            {cost !== null && (
              <span className="ms-auto text-xs text-gray-500">${cost.toFixed(6)}</span>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm">{reply || "(لا ردّ)"}</p>
        </div>
      )}
      {trace && trace.length > 0 && (
        <details className="mt-3 rounded-lg border bg-gray-50 p-3 text-xs dark:border-gray-800 dark:bg-gray-800/40">
          <summary className="cursor-pointer font-semibold">تتبّع الأدوات ({trace.length})</summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-[11px]">
            {JSON.stringify(trace, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}

// ─────────────────────────── small UI helpers ───────────────────────
function SectionTitle({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3 border-b pb-2 dark:border-gray-800">
      <div className="flex items-center gap-2">
        <div className="text-emerald-600 dark:text-emerald-400">{icon}</div>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {hint && <p className="max-w-xs text-end text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Coerce any of (number | string | null | undefined) to a finite number.
 * Used because Prisma `Decimal` columns are JSON-serialised as strings (or
 * null) and `Number(null)` returns 0 silently — we want explicit fallback
 * handling for telemetry-style values.
 */
function toFiniteNumber(v: unknown, fallback: number): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function SaveBar({ onSave }: { onSave: () => void | Promise<void> }) {
  return (
    <div className="mt-4 flex justify-end border-t pt-3 dark:border-gray-800">
      <Can permission="whatsapp.bot:configure">
        <button onClick={() => onSave()} className={BTN_PRIMARY}>
          <Save className="me-1 h-4 w-4" /> حفظ القسم
        </button>
      </Can>
    </div>
  );
}
