"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Save,
  Clock,
  Zap,
  AlertTriangle,
  Sparkles,
  Sun,
  Hash,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Can } from "@/components/Can";
import { usePermissions } from "@/lib/permissions/client";

interface Rule {
  id: number;
  name: string;
  matchMode: "keyword" | "exact" | "regex" | "welcome" | "away";
  triggers: string;
  replyText: string;
  templateName: string | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  priority: number;
  cooldownMinutes: number;
  addTag: string | null;
  isActive: boolean;
  timesFired: number;
  lastFiredAt: string | null;
}

const emptyRule: Omit<Rule, "id" | "timesFired" | "lastFiredAt"> = {
  name: "",
  matchMode: "keyword",
  triggers: "",
  replyText: "",
  templateName: null,
  quietHoursStart: null,
  quietHoursEnd: null,
  priority: 100,
  cooldownMinutes: 60,
  addTag: null,
  isActive: true,
};

const PRESETS: {
  name: string;
  label: string;
  icon: React.ElementType;
  data: Partial<typeof emptyRule>;
}[] = [
  {
    name: "ترحيب",
    label: "رسالة ترحيب لأول تواصل",
    icon: Sparkles,
    data: {
      name: "رسالة ترحيب",
      matchMode: "welcome",
      triggers: "",
      replyText:
        "أهلاً وسهلاً بك في فندق المفرق 🌟\nشكراً لتواصلك معنا. أحد موظفي الاستقبال سيرد عليك خلال دقائق. للحجز الفوري يمكنك إخبارنا بـ:\n• تاريخ الوصول\n• عدد الليالي\n• نوع الغرفة المفضل",
      addTag: "عميل-جديد",
      cooldownMinutes: 0,
    },
  },
  {
    name: "أسعار",
    label: "الرد على استفسارات الأسعار",
    icon: Hash,
    data: {
      name: "استفسار عن الأسعار",
      matchMode: "keyword",
      triggers: "سعر|الأسعار|كم|price|rate",
      replyText:
        "شكراً لاستفسارك 💫\nأسعارنا تعتمد على الموسم ونوع الغرفة:\n• غرفة مفردة: ابتداءً من 35 د.أ / ليلة\n• شقة بغرفتين: ابتداءً من 55 د.أ / ليلة\nأخبرنا بتاريخ الوصول وعدد الليالي لنرسل لك العرض الأنسب.",
    },
  },
  {
    name: "خارج-الدوام",
    label: "رد خارج ساعات الدوام",
    icon: Sun,
    data: {
      name: "خارج ساعات الدوام",
      matchMode: "away",
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      replyText:
        "شكراً لتواصلك 🌙\nنحن حالياً خارج ساعات الدوام (7 صباحاً – 10 مساءً). سيتم الرد على رسالتك فور بدء يوم العمل. للحالات الطارئة اتصل بالاستقبال مباشرة.",
      cooldownMinutes: 180,
    },
  },
  {
    name: "حجز",
    label: "الرد على طلبات الحجز",
    icon: Zap,
    data: {
      name: "طلب حجز",
      matchMode: "keyword",
      triggers: "حجز|احجز|booking|reservation|book",
      replyText:
        "ممتاز! 🎉 لإتمام الحجز أرسل لنا:\n1️⃣ الاسم الثلاثي\n2️⃣ عدد الأشخاص (بالغين/أطفال)\n3️⃣ تاريخ الوصول والمغادرة\n4️⃣ نوع الغرفة المفضل (مفردة / مزدوجة / شقة)\nوسيتواصل معك موظف الاستقبال لتأكيد التوفر والسعر.",
      addTag: "مهتم-بالحجز",
    },
  },
];

export function AutoReplyRules() {
  const { can } = usePermissions();
  const canEdit = can("settings.whatsapp:edit");

  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState<Rule | null>(null);
  const [form, setForm] = useState<typeof emptyRule>(emptyRule);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/auto-replies", { cache: "no-store" });
      if (!res.ok) throw new Error("فشل التحميل");
      setRules(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate(preset?: (typeof PRESETS)[number]) {
    setEditRule(null);
    setForm({ ...emptyRule, ...(preset?.data ?? {}) });
    setShowModal(true);
  }

  function openEdit(rule: Rule) {
    setEditRule(rule);
    setForm({
      name: rule.name,
      matchMode: rule.matchMode,
      triggers: rule.triggers,
      replyText: rule.replyText,
      templateName: rule.templateName,
      quietHoursStart: rule.quietHoursStart,
      quietHoursEnd: rule.quietHoursEnd,
      priority: rule.priority,
      cooldownMinutes: rule.cooldownMinutes,
      addTag: rule.addTag,
      isActive: rule.isActive,
    });
    setShowModal(true);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("اسم القاعدة مطلوب");
      return;
    }
    if (!form.replyText.trim() && !form.templateName) {
      toast.error("نص الرد أو اسم القالب مطلوب");
      return;
    }
    setSaving(true);
    try {
      const url = editRule
        ? `/api/whatsapp/auto-replies/${editRule.id}`
        : "/api/whatsapp/auto-replies";
      const res = await fetch(url, {
        method: editRule ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "فشل الحفظ");
      }
      toast.success(editRule ? "تم تحديث القاعدة" : "تم إنشاء القاعدة");
      setShowModal(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(rule: Rule) {
    try {
      const res = await fetch(`/api/whatsapp/auto-replies/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      if (!res.ok) throw new Error("فشل التحديث");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    }
  }

  async function remove(rule: Rule) {
    if (!confirm(`حذف قاعدة «${rule.name}»؟`)) return;
    try {
      const res = await fetch(`/api/whatsapp/auto-replies/${rule.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("فشل الحذف");
      toast.success("تم الحذف");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    }
  }

  return (
    <section className="bg-card-bg rounded-xl shadow-sm p-4 sm:p-6 space-y-5">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center">
            <Bot size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">الردود التلقائية</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              ردود فورية على كلمات مفتاحية، رسائل ترحيب، وردود خارج الدوام — دون تدخل موظف.
            </p>
          </div>
        </div>
        <Can permission="settings.whatsapp:edit">
          <button
            type="button"
            onClick={() => openCreate()}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm"
          >
            <Plus size={14} />
            قاعدة جديدة
          </button>
        </Can>
      </div>

      {/* Quick-start presets */}
      {rules.length === 0 && canEdit && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">ابدأ من قالب جاهز:</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {PRESETS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.name}
                  onClick={() => openCreate(p)}
                  className="group text-start p-3 rounded-xl border border-gray-200 hover:border-primary hover:bg-gold-soft/50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon size={14} className="text-primary" />
                    <span className="text-xs font-bold text-gray-800">{p.name}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    {p.label}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : rules.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-6">
          لا توجد قواعد بعد.
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              canEdit={canEdit}
              onToggle={() => toggle(rule)}
              onEdit={() => openEdit(rule)}
              onDelete={() => remove(rule)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <RuleModal
          form={form}
          setForm={setForm}
          editing={!!editRule}
          saving={saving}
          onSave={save}
          onClose={() => setShowModal(false)}
        />
      )}
    </section>
  );
}

function RuleCard({
  rule,
  canEdit,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: Rule;
  canEdit: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const modeLabel: Record<string, string> = {
    keyword: "كلمة مفتاحية",
    exact: "تطابق تام",
    regex: "تعبير نمطي",
    welcome: "ترحيب",
    away: "خارج الدوام",
  };
  const modeColor: Record<string, string> = {
    keyword: "bg-blue-100 text-blue-700",
    exact: "bg-indigo-100 text-indigo-700",
    regex: "bg-violet-100 text-violet-700",
    welcome: "bg-emerald-100 text-emerald-700",
    away: "bg-amber-100 text-amber-700",
  };
  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-3 sm:p-4 space-y-2 transition-opacity",
        !rule.isActive && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-800">{rule.name}</h3>
            <span
              className={cn(
                "inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full",
                modeColor[rule.matchMode] ?? "bg-gray-100 text-gray-700",
              )}
            >
              {modeLabel[rule.matchMode] ?? rule.matchMode}
            </span>
            {!rule.isActive && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                موقوفة
              </span>
            )}
          </div>
          {rule.triggers && (
            <p className="text-xs text-gray-500 mt-1 break-words">
              <span className="font-medium">الكلمات: </span>
              <span className="direction-ltr">{rule.triggers}</span>
            </p>
          )}
          <p className="text-xs text-gray-700 mt-1.5 line-clamp-2 whitespace-pre-wrap">
            {rule.replyText || rule.templateName}
          </p>
          <div className="flex items-center gap-3 mt-2 flex-wrap text-[11px] text-gray-500">
            {rule.quietHoursStart && rule.quietHoursEnd && (
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {rule.quietHoursStart} – {rule.quietHoursEnd}
              </span>
            )}
            {rule.cooldownMinutes > 0 && (
              <span className="flex items-center gap-1">
                <AlertTriangle size={11} />
                تبريد {rule.cooldownMinutes} د
              </span>
            )}
            {rule.addTag && (
              <span className="flex items-center gap-1">
                <Tag size={11} />
                +{rule.addTag}
              </span>
            )}
            <span>أولوية: {rule.priority}</span>
            {rule.timesFired > 0 && <span>أُطلقت {rule.timesFired} مرة</span>}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onToggle}
              className={cn(
                "text-[11px] font-medium px-2.5 py-1 rounded-full",
                rule.isActive
                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              )}
              title={rule.isActive ? "إيقاف" : "تفعيل"}
            >
              {rule.isActive ? "نشطة" : "موقوفة"}
            </button>
            <button
              onClick={onEdit}
              className="p-1.5 text-primary hover:bg-gold-soft rounded-lg"
              title="تعديل"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
              title="حذف"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RuleModal({
  form,
  setForm,
  editing,
  saving,
  onSave,
  onClose,
}: {
  form: typeof emptyRule;
  setForm: (f: typeof emptyRule) => void;
  editing: boolean;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2">
            <Bot size={18} className="text-primary" />
            {editing ? "تعديل قاعدة" : "قاعدة رد تلقائي جديدة"}
          </h3>
          <button
            onClick={onClose}
            className="tap-44 w-10 h-10 rounded-lg hover:bg-gray-200 flex items-center justify-center text-gray-500"
            aria-label="إغلاق"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          <FormField label="اسم القاعدة (للاستخدام الداخلي)">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: ترحيب بالعميل الجديد"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </FormField>

          <FormField label="نمط التفعيل">
            <select
              value={form.matchMode}
              onChange={(e) =>
                setForm({ ...form, matchMode: e.target.value as Rule["matchMode"] })
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="keyword">يحتوي على كلمة (keyword)</option>
              <option value="exact">نص مطابق تماماً (exact)</option>
              <option value="regex">تعبير نمطي (regex)</option>
              <option value="welcome">عند أول رسالة من العميل (welcome)</option>
              <option value="away">خارج ساعات الدوام فقط (away)</option>
            </select>
          </FormField>

          {(form.matchMode === "keyword" ||
            form.matchMode === "exact" ||
            form.matchMode === "regex") && (
            <FormField
              label={
                form.matchMode === "regex"
                  ? "تعبير نمطي (regex)"
                  : "كلمات التفعيل (افصلها بـ |)"
              }
            >
              <input
                type="text"
                value={form.triggers}
                onChange={(e) => setForm({ ...form, triggers: e.target.value })}
                placeholder={
                  form.matchMode === "regex"
                    ? "^(سعر|احجز).*"
                    : "سعر|احجز|booking"
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm direction-ltr text-right focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                {form.matchMode === "keyword" &&
                  "المطابقة جزئية وبدون حساسية لحالة الأحرف."}
                {form.matchMode === "exact" &&
                  "يجب أن تكون رسالة العميل مطابقة تماماً بعد إزالة الفراغات."}
                {form.matchMode === "regex" &&
                  "تعبير JS regex — يُطبَّق بدون i flag."}
              </p>
            </FormField>
          )}

          <FormField label="نص الرد">
            <textarea
              value={form.replyText}
              onChange={(e) => setForm({ ...form, replyText: e.target.value })}
              rows={5}
              placeholder="أهلاً وسهلاً بك في فندق المفرق 🌟"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              متغيرات متاحة: <code>{"{{contactName}}"}</code>,{" "}
              <code>{"{{firstName}}"}</code>, <code>{"{{hotelName}}"}</code>.
            </p>
          </FormField>

          <details className="rounded-lg border border-gray-200">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              إعدادات متقدمة
            </summary>
            <div className="p-3 space-y-3 bg-gray-50/50">
              <FormField label="إرسال قالب بدلاً من النص (اختياري — يعمل خارج نافذة 24 ساعة)">
                <input
                  type="text"
                  value={form.templateName ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, templateName: e.target.value || null })
                  }
                  placeholder="مثال: hello_world"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm direction-ltr text-right focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </FormField>

              <div className="grid grid-cols-2 gap-2">
                <FormField label="ساعات الصمت — من">
                  <input
                    type="time"
                    value={form.quietHoursStart ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, quietHoursStart: e.target.value || null })
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </FormField>
                <FormField label="إلى">
                  <input
                    type="time"
                    value={form.quietHoursEnd ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, quietHoursEnd: e.target.value || null })
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <FormField label="تبريد للعميل نفسه (دقائق)">
                  <input
                    type="number"
                    min={0}
                    value={form.cooldownMinutes}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        cooldownMinutes: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </FormField>
                <FormField label="أولوية (أقل = أسبق)">
                  <input
                    type="number"
                    value={form.priority}
                    onChange={(e) =>
                      setForm({ ...form, priority: Number(e.target.value) || 100 })
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </FormField>
              </div>

              <FormField label="وسم يُضاف لجهة الاتصال عند التفعيل (اختياري)">
                <input
                  type="text"
                  value={form.addTag ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, addTag: e.target.value || null })
                  }
                  placeholder="مثال: عميل-جديد"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </FormField>

              <label className="flex items-center gap-2 text-sm text-gray-700 pt-1">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 accent-primary"
                />
                القاعدة نشطة
              </label>
            </div>
          </details>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 sm:px-6 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-white text-sm"
          >
            إلغاء
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 text-sm font-medium"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {editing ? "حفظ التعديلات" : "إنشاء القاعدة"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}
