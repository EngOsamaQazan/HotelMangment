"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Phone,
  Loader2,
  Save,
  ShieldCheck,
  XCircle,
  Clock,
  PlayCircle,
  RefreshCcw,
  Send,
} from "lucide-react";
import { Can } from "@/components/Can";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";
import { ActionDraftCard, type AssistantAction } from "@/components/assistant/ActionDraftCard";

export const dynamic = "force-dynamic";

interface ConfigData {
  assistantEnabled: boolean;
  assistantDailyBudgetUsd: number;
  assistantCostTodayUsd: number;
  assistantCostResetAt: string | null;
  assistantWaEnabled: boolean;
  assistantWaSessionMinutes: number;
  assistantWaMaxSessionHours: number;
  provider: string | null;
  model: string | null;
  hasApiKey: boolean;
}

interface SessionRow {
  id: number;
  status: string;
  phone: string;
  userId: number;
  userName: string;
  userEmail: string;
  lastActivityAt: string;
  sessionExpiresAt: string;
  otpExpiresAt: string | null;
  otpAttempts: number;
  conversationId: number | null;
  createdAt: string;
}

export default function AssistantSettingsPage() {
  return (
    <Can permission="assistant:configure" fallback={<NoAccess />}>
      <Inner />
    </Can>
  );
}

function NoAccess() {
  return (
    <PageShell>
      <PageHeader title="إعدادات المساعد الذكي" />
      <div className="text-center py-12 text-gray-500">
        ليس لديك صلاحية الوصول إلى هذه الصفحة.
      </div>
    </PageShell>
  );
}

function Inner() {
  const [cfg, setCfg] = useState<ConfigData | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/assistant/config", { cache: "no-store" }),
        fetch("/api/assistant/wa/sessions", { cache: "no-store" }),
      ]);
      if (r1.ok) setCfg(await r1.json());
      if (r2.ok) {
        const j = await r2.json();
        setSessions(Array.isArray(j.sessions) ? j.sessions : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const save = useCallback(async () => {
    if (!cfg) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/assistant/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantEnabled: cfg.assistantEnabled,
          assistantDailyBudgetUsd: cfg.assistantDailyBudgetUsd,
          assistantWaEnabled: cfg.assistantWaEnabled,
          assistantWaSessionMinutes: cfg.assistantWaSessionMinutes,
          assistantWaMaxSessionHours: cfg.assistantWaMaxSessionHours,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "تعذّر الحفظ");
      }
    } finally {
      setSaving(false);
    }
  }, [cfg]);

  const revoke = useCallback(
    async (id: number) => {
      if (!confirm("إنهاء هذه الجلسة الآن؟")) return;
      const res = await fetch(`/api/assistant/wa/sessions/${id}/revoke`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "تعذّر الإنهاء");
      }
      await load();
    },
    [load],
  );

  if (loading || !cfg) {
    return (
      <PageShell>
        <PageHeader title="إعدادات المساعد الذكي" />
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="animate-spin" size={32} />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="إعدادات المساعد الذكي"
        description="تفعيل المساعد، الميزانية اليومية، تكامل الواتس، وإدارة الجلسات."
        icon={<Sparkles className="text-amber-500" />}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {/* General toggle */}
      <Section title="المساعد على الويب" icon={Sparkles}>
        <Toggle
          label="تفعيل المساعد"
          checked={cfg.assistantEnabled}
          onChange={(v) => setCfg({ ...cfg, assistantEnabled: v })}
        />
        <Field label="الميزانية اليومية (USD)">
          <input
            type="number"
            min={0}
            step={0.5}
            value={cfg.assistantDailyBudgetUsd}
            onChange={(e) =>
              setCfg({ ...cfg, assistantDailyBudgetUsd: Number(e.target.value) || 0 })
            }
            className="w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </Field>
        <div className="text-xs text-gray-500 mt-1">
          المُستهلك اليوم:{" "}
          <span className="font-semibold text-gray-700 tabular-nums">
            ${cfg.assistantCostTodayUsd.toFixed(4)}
          </span>{" "}
          من ${cfg.assistantDailyBudgetUsd.toFixed(2)}.
        </div>
        <div className="text-xs text-gray-500 mt-1">
          المزوّد: {cfg.provider ?? "—"} · الموديل: {cfg.model ?? "—"} ·
          المفتاح: {cfg.hasApiKey ? "مضبوط ✓" : "غير مضبوط"}
        </div>
      </Section>

      <Section title="المساعد على الواتس" icon={Phone}>
        <Toggle
          label="تفعيل الوصول للمساعد عبر الواتس"
          checked={cfg.assistantWaEnabled}
          onChange={(v) => setCfg({ ...cfg, assistantWaEnabled: v })}
        />
        <Field label="مدة خمول الجلسة (دقائق)">
          <input
            type="number"
            min={1}
            max={240}
            value={cfg.assistantWaSessionMinutes}
            onChange={(e) =>
              setCfg({
                ...cfg,
                assistantWaSessionMinutes: Math.max(1, Number(e.target.value) || 30),
              })
            }
            className="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </Field>
        <Field label="الحد الأقصى للجلسة (ساعات)">
          <input
            type="number"
            min={1}
            max={24}
            value={cfg.assistantWaMaxSessionHours}
            onChange={(e) =>
              setCfg({
                ...cfg,
                assistantWaMaxSessionHours: Math.max(1, Number(e.target.value) || 8),
              })
            }
            className="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </Field>
        <div className="text-xs text-gray-600 mt-2 leading-relaxed">
          تعمل المصادقة عبر OTP يُرسَل تلقائياً للموظف عند أول رسالة. لا يمكن
          استخدام المساعد دون التحقق. لكل موظف رقم واحد مسجَّل في
          <code className="bg-gray-100 px-1 rounded mx-1">User.whatsappPhone</code>.
        </div>
      </Section>

      <div className="flex justify-end mb-8">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          حفظ الإعدادات
        </button>
      </div>

      <Section title="تجربة محلية (Sandbox)" icon={PlayCircle}>
        <SandboxTester />
      </Section>

      <Section title="الجلسات النشطة" icon={ShieldCheck}>
        {sessions.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-4">لا توجد جلسات نشطة الآن.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-right px-2 py-2">الموظف</th>
                  <th className="text-right px-2 py-2">الهاتف</th>
                  <th className="text-right px-2 py-2">الحالة</th>
                  <th className="text-right px-2 py-2">آخر نشاط</th>
                  <th className="text-right px-2 py-2">انتهاء</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-2 py-1.5 font-medium">{s.userName}</td>
                    <td className="px-2 py-1.5 font-mono direction-ltr">{s.phone}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={
                          s.status === "active"
                            ? "text-emerald-700 font-bold"
                            : s.status === "pending_otp"
                              ? "text-amber-700"
                              : "text-red-700"
                        }
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-gray-600 flex items-center gap-1">
                      <Clock size={11} />
                      {new Date(s.lastActivityAt).toLocaleTimeString("ar")}
                    </td>
                    <td className="px-2 py-1.5 text-gray-600">
                      {new Date(s.sessionExpiresAt).toLocaleString("ar")}
                    </td>
                    <td className="px-2 py-1.5">
                      <Can permission="assistant:wa_revoke">
                        <button
                          onClick={() => revoke(s.id)}
                          className="text-red-600 hover:text-red-800 inline-flex items-center gap-1"
                        >
                          <XCircle size={12} /> إنهاء
                        </button>
                      </Can>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </PageShell>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Sparkles;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
      <h2 className="font-bold text-sm text-gray-800 flex items-center gap-2">
        <Icon size={16} className="text-amber-500" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-amber-500"
      />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 min-w-[180px]">{label}</span>
      {children}
    </div>
  );
}

type SandboxItem =
  | { kind: "msg"; key: string; who: "you" | "bot"; text: string; ts: string }
  | { kind: "action"; key: string; action: AssistantAction; ts: string };

function SandboxTester() {
  const [input, setInput] = useState("");
  const [items, setItems] = useState<SandboxItem[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ status: string; otpAttempts: number } | null>(null);
  const seqRef = useRef(0);

  const send = useCallback(async () => {
    const t = input.trim();
    if (!t || sending) return;
    setInput("");
    setSending(true);
    setError(null);
    seqRef.current += 1;
    const userKey = `u${seqRef.current}`;
    const ts = new Date().toISOString();
    setItems((prev) => [
      ...prev,
      { kind: "msg", key: userKey, who: "you", text: t, ts },
    ]);
    try {
      const res = await fetch("/api/assistant/wa/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: t }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "فشل");
        return;
      }
      const replies = Array.isArray(json.replies) ? (json.replies as string[]) : [];
      const newActions: AssistantAction[] = Array.isArray(json.actions)
        ? (json.actions as AssistantAction[])
        : [];
      const now = new Date().toISOString();
      const additions: SandboxItem[] = [];
      replies.forEach((r) => {
        seqRef.current += 1;
        additions.push({ kind: "msg", key: `b${seqRef.current}`, who: "bot", text: r, ts: now });
      });
      newActions.forEach((a) => {
        additions.push({ kind: "action", key: `a${a.id}`, action: a, ts: now });
      });
      setItems((prev) => [...prev, ...additions]);
      if (json.session) {
        setInfo({
          status: json.session.status,
          otpAttempts: json.session.otpAttempts,
        });
      }
    } catch {
      setError("خطأ شبكة");
    } finally {
      setSending(false);
    }
  }, [input, sending]);

  const reset = useCallback(async () => {
    if (!confirm("إعادة ضبط الجلسة الحالية؟ سيتم إصدار OTP جديد عند الرسالة التالية.")) return;
    await fetch("/api/assistant/wa/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    });
    setItems([]);
    setInfo(null);
  }, []);

  const onAction = useCallback(async (actionId: number, kind: "confirm" | "reject") => {
    const res = await fetch(`/api/assistant/actions/${actionId}/${kind}`, {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || "تعذّر تنفيذ العملية");
      return;
    }
    // Refresh the action row in-place so the card re-renders with the new
    // status (executed / rejected). Refetch via the conversation endpoint
    // is cleaner; here we patch the local item directly to avoid an extra
    // round-trip.
    setItems((prev) =>
      prev.map((it): SandboxItem => {
        if (it.kind !== "action" || it.action.id !== actionId) return it;
        const updated: AssistantAction = {
          ...it.action,
          status: kind === "confirm" ? "executed" : "rejected",
          executedAt: new Date().toISOString(),
          executedRefId:
            kind === "confirm"
              ? (json.refId as string | null) ?? it.action.executedRefId
              : it.action.executedRefId,
        };
        return { ...it, action: updated };
      }),
    );
    seqRef.current += 1;
    setItems((prev) => [
      ...prev,
      {
        kind: "msg",
        key: `b${seqRef.current}`,
        who: "bot",
        text: json.message || (kind === "confirm" ? "تم التنفيذ." : "تم الإلغاء."),
        ts: new Date().toISOString(),
      },
    ]);
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-600 leading-relaxed">
        تجرب رحلة المساعد عبر الواتس بدون إرسال أي رسائل فعلية. كل ما تكتبه
        يمر بنفس المنطق الإنتاجي (OTP، فحص الصلاحيات، اقتراح المسودات،
        التنفيذ). الردود تظهر هنا فقط — لا شيء يصل إلى رقمك في واتس.
      </p>
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2 max-h-[32rem] overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-6">
            ابدأ بأي رسالة (مثلاً «مرحبا») — البوت سيُصدر OTP. ثم أرسل الأرقام الستة لتفعيل الجلسة.
          </div>
        ) : (
          items.map((item) =>
            item.kind === "msg" ? (
              <div
                key={item.key}
                className={cn("flex", item.who === "you" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "rounded-2xl px-3 py-1.5 text-xs whitespace-pre-wrap max-w-[85%] leading-relaxed shadow-sm",
                    item.who === "you"
                      ? "bg-amber-500 text-white rounded-tr-sm"
                      : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm",
                  )}
                >
                  {item.text}
                </div>
              </div>
            ) : (
              <ActionDraftCard
                key={item.key}
                action={item.action}
                onConfirm={() => onAction(item.action.id, "confirm")}
                onReject={() => onAction(item.action.id, "reject")}
              />
            ),
          )
        )}
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}
      {info && (
        <div className="text-[11px] text-gray-500">
          حالة الجلسة: <span className="font-bold">{info.status}</span>
          {info.otpAttempts > 0 ? ` — محاولات OTP فاشلة: ${info.otpAttempts}` : ""}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-end gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="اكتب رسالة كما لو كنت تكتبها على الواتس..."
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="h-9 px-3 rounded-md bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white flex items-center gap-1 text-sm"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          إرسال
        </button>
        <button
          type="button"
          onClick={reset}
          className="h-9 px-3 rounded-md border border-gray-300 hover:border-amber-500 hover:text-amber-700 text-gray-600 text-xs inline-flex items-center gap-1"
        >
          <RefreshCcw size={12} /> إعادة ضبط
        </button>
      </form>
    </div>
  );
}

