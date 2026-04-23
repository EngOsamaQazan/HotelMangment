"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertOctagon,
  BookUser,
  Check,
  ChevronLeft,
  Download,
  Loader2,
  Plus,
  Search,
  Tag as TagIcon,
  Trash2,
  Upload,
  UserCircle2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Can } from "@/components/Can";
import { useHasPermission } from "@/lib/permissions/client";
import { CombinedPhoneInput } from "@/components/ui/CombinedPhoneInput";
import type { ContactDetail } from "../_types";
import { readJsonSafe, relativeTime } from "../_utils";

interface ContactRow {
  id: number;
  phone: string;
  displayName: string | null;
  nickname: string | null;
  company: string | null;
  email: string | null;
  tags: string[];
  source: string;
  optedIn: boolean;
  isBlocked: boolean;
  lastMessageAt: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: "واتساب",
  manual: "يدوي",
  reservation: "حجز",
  guest_account: "حساب نزيل",
  import: "استيراد",
  webhook: "Webhook",
};

/**
 * Full CRM phonebook — search/filter, create/edit/delete, block, tag, and
 * import/export CSV. Deep links to `/whatsapp?contact=<phone>` to open the
 * conversation view.
 */
export default function PhonebookPage() {
  const canManage = useHasPermission("whatsapp:manage_contacts");
  const canExport = useHasPermission("whatsapp:export_contacts");

  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [source, setSource] = useState("");
  const [blocked, setBlocked] = useState<"any" | "1" | "0">("any");

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (cursor?: number) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (search.trim()) qs.set("search", search.trim());
        if (tag.trim()) qs.set("tag", tag.trim());
        if (source) qs.set("source", source);
        if (blocked !== "any") qs.set("blocked", blocked);
        qs.set("limit", "100");
        if (cursor) qs.set("cursor", String(cursor));
        const res = await fetch(`/api/whatsapp/contacts?${qs}`, {
          cache: "no-store",
        });
        const data = await readJsonSafe<{
          contacts: ContactRow[];
          nextCursor: number | null;
        }>(res, "فشل التحميل");
        if (cursor)
          setContacts((prev) => [...prev, ...data.contacts]);
        else setContacts(data.contacts);
        setNextCursor(data.nextCursor);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "فشل التحميل");
      } finally {
        setLoading(false);
      }
    },
    [search, tag, source, blocked],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function exportCsv() {
    try {
      const res = await fetch("/api/whatsapp/contacts/export");
      if (!res.ok) throw new Error("فشل التصدير");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `whatsapp-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل التصدير");
    }
  }

  async function importCsv(f: File) {
    try {
      const csv = await f.text();
      const res = await fetch("/api/whatsapp/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: csv,
      });
      const data = await readJsonSafe<{ inserted: number; updated: number; errors: number }>(
        res,
        "فشل الاستيراد",
      );
      toast.success(
        `تم: ${data.inserted} إضافة، ${data.updated} تحديث، ${data.errors} خطأ`,
      );
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الاستيراد");
    }
  }

  async function remove(id: number) {
    const c = contacts.find((x) => x.id === id);
    if (!c) return;
    if (!confirm(`حذف ${c.displayName ?? c.phone}؟`)) return;
    try {
      const res = await fetch(
        `/api/whatsapp/contacts/${encodeURIComponent(c.phone)}`,
        { method: "DELETE" },
      );
      await readJsonSafe(res, "فشل الحذف");
      setContacts((prev) => prev.filter((x) => x.id !== id));
      setSelectedId(null);
      toast.success("تم الحذف");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    }
  }

  const selected = useMemo(
    () => contacts.find((c) => c.id === selectedId) ?? null,
    [contacts, selectedId],
  );

  return (
    <div className="space-y-4">
      <div className="pt-2 sm:pt-4 border-b-2 border-gold/30 pb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span aria-hidden className="inline-block w-1 h-8 bg-gold rounded-full" />
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20">
            <BookUser size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary font-[family-name:var(--font-amiri)] tracking-tight">
              دفتر الهاتف
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              جميع جهات اتصال واتساب — بحث، إدارة، استيراد/تصدير
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/whatsapp"
            className="flex items-center gap-1 text-sm px-3 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            <ChevronLeft size={16} />
            صندوق الوارد
          </Link>
          {canExport && (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Upload size={16} />
                استيراد CSV
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importCsv(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Download size={16} />
                تصدير CSV
              </button>
            </>
          )}
          <Can permission="whatsapp:manage_contacts">
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark"
            >
              <Plus size={16} />
              جهة اتصال جديدة
            </button>
          </Can>
        </div>
      </div>

      <div className="bg-card-bg rounded-xl shadow-sm p-3 flex items-center gap-2 flex-wrap">
        <label className="flex-1 min-w-[200px] flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
          <Search size={14} className="text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث برقم، اسم، بريد، شركة…"
            className="bg-transparent text-sm w-full focus:outline-none"
          />
        </label>
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="وسم…"
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-32"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white"
        >
          <option value="">كل المصادر</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={blocked}
          onChange={(e) => setBlocked(e.target.value as "any" | "1" | "0")}
          className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white"
        >
          <option value="any">الكل</option>
          <option value="0">غير محظورة</option>
          <option value="1">المحظورة فقط</option>
        </select>
      </div>

      <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-[11px] uppercase">
              <tr>
                <th className="px-3 py-2 text-right">الاسم</th>
                <th className="px-3 py-2 text-right">الرقم</th>
                <th className="px-3 py-2 text-right">الشركة</th>
                <th className="px-3 py-2 text-right">الوسوم</th>
                <th className="px-3 py-2 text-right">المصدر</th>
                <th className="px-3 py-2 text-right">آخر رسالة</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && contacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center">
                    <Loader2
                      size={20}
                      className="animate-spin text-primary inline-block"
                    />
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400 text-sm">
                    لا توجد جهات اتصال مطابقة.
                  </td>
                </tr>
              ) : (
                contacts.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-gray-50 hover:bg-gray-50/70"
                  >
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setSelectedId(c.id)}
                        className="flex items-center gap-2 text-right"
                      >
                        <span
                          className={cn(
                            "w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center",
                            c.isBlocked
                              ? "bg-red-50 text-red-500"
                              : "bg-primary/10 text-primary",
                          )}
                        >
                          {(c.displayName ?? c.phone).slice(0, 2)}
                        </span>
                        <span className="truncate">
                          <span className="font-medium text-gray-800">
                            {c.displayName ?? `+${c.phone}`}
                          </span>
                          {c.isBlocked && (
                            <span className="ms-2 inline-flex items-center gap-0.5 text-[10px] text-red-500">
                              <AlertOctagon size={9} />
                              محظور
                            </span>
                          )}
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-2 text-gray-600 direction-ltr">
                      +{c.phone}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{c.company ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5 rounded"
                          >
                            <TagIcon size={8} />
                            {t}
                          </span>
                        ))}
                        {c.tags.length > 3 && (
                          <span className="text-[10px] text-gray-400">
                            +{c.tags.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-gray-500">
                      {SOURCE_LABELS[c.source] ?? c.source}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-gray-500">
                      {c.lastMessageAt ? relativeTime(c.lastMessageAt) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        <Link
                          href={`/whatsapp?contact=${encodeURIComponent(c.phone)}`}
                          className="text-[11px] px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20"
                        >
                          محادثة
                        </Link>
                        {canManage && (
                          <button
                            onClick={() => remove(c.id)}
                            className="p-1 rounded text-red-500 hover:bg-red-50"
                            aria-label="حذف"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {nextCursor && !loading && (
          <div className="p-3 text-center">
            <button
              onClick={() => load(nextCursor)}
              className="text-xs px-4 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              تحميل المزيد
            </button>
          </div>
        )}
      </div>

      {creating && (
        <CreateContactModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {selected && (
        <ContactDrawer
          phone={selected.phone}
          canManage={canManage}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ─────────── Create modal ───────────
function CreateContactModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          displayName: name || null,
          email: email || null,
          company: company || null,
          tags: tags
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          optedIn: true,
        }),
      });
      await readJsonSafe(res, "فشل الإنشاء");
      toast.success("تم إنشاء جهة الاتصال");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <form
        onSubmit={submit}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <UserCircle2 size={22} className="text-primary" />
            جهة اتصال جديدة
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-gray-500 hover:bg-gray-100"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-gray-500">الرقم</span>
            <CombinedPhoneInput
              value={phone}
              onChange={setPhone}
              placeholder="07XXXXXXXX"
              className="text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">الاسم</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">البريد</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">الشركة / الجهة</span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">
              وسوم (افصل بفواصل)
            </span>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="vip, corporate"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving || !phone.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 text-sm"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            حفظ
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────── Detail drawer ───────────
function ContactDrawer({
  phone,
  canManage,
  onClose,
  onChanged,
}: {
  phone: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/whatsapp/contacts/${encodeURIComponent(phone)}`,
      );
      const data = await readJsonSafe<ContactDetail>(res, "فشل التحميل");
      setContact(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(patch: Partial<ContactDetail>) {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/whatsapp/contacts/${encodeURIComponent(phone)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const updated = await readJsonSafe<ContactDetail>(res, "فشل الحفظ");
      setContact(updated);
      onChanged();
      toast.success("تم الحفظ");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex"
      onClick={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div className="flex-1 bg-black/40" />
      <aside className="w-full max-w-md bg-white shadow-2xl h-full overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between z-10">
          <h3 className="text-sm font-bold text-gray-800">تفاصيل جهة الاتصال</h3>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-500 hover:bg-gray-100"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        </div>
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 size={20} className="animate-spin text-primary inline-block" />
          </div>
        ) : contact ? (
          <ContactEditor
            contact={contact}
            canManage={canManage}
            saving={saving}
            onSave={save}
          />
        ) : (
          <div className="p-8 text-center text-sm text-gray-400">
            لم نجد جهة الاتصال.
          </div>
        )}
      </aside>
    </div>
  );
}

function ContactEditor({
  contact,
  canManage,
  saving,
  onSave,
}: {
  contact: ContactDetail;
  canManage: boolean;
  saving: boolean;
  onSave: (p: Partial<ContactDetail>) => void;
}) {
  const [name, setName] = useState(contact.displayName ?? "");
  const [nickname, setNickname] = useState(contact.nickname ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [company, setCompany] = useState(contact.company ?? "");
  const [notes, setNotes] = useState(contact.notes ?? "");
  const [tags, setTags] = useState<string[]>(contact.tags ?? []);
  const [tagInput, setTagInput] = useState("");

  const readonly = !canManage;

  return (
    <div className="p-4 space-y-4 text-sm">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-14 h-14 rounded-full text-base font-bold flex items-center justify-center",
            contact.isBlocked
              ? "bg-red-50 text-red-500"
              : "bg-primary/10 text-primary",
          )}
        >
          {(contact.displayName ?? contact.phone).slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-gray-800">
            {contact.displayName ?? `+${contact.phone}`}
          </div>
          <div className="text-[12px] text-gray-500 direction-ltr">
            +{contact.phone}
          </div>
          <div className="text-[11px] text-gray-400">
            منذ {relativeTime(contact.createdAt)} · {SOURCE_LABELS[contact.source] ?? contact.source}
          </div>
        </div>
        <Link
          href={`/whatsapp?contact=${encodeURIComponent(contact.phone)}`}
          className="text-xs px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20"
        >
          فتح المحادثة
        </Link>
      </div>

      <DrawerField label="الاسم المعروض">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          readOnly={readonly}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </DrawerField>
      <DrawerField label="كنية">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          readOnly={readonly}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </DrawerField>
      <DrawerField label="البريد">
        <input
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          readOnly={readonly}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </DrawerField>
      <DrawerField label="الشركة / الجهة">
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          readOnly={readonly}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </DrawerField>
      <DrawerField label="ملاحظات داخلية">
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          readOnly={readonly}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </DrawerField>
      <DrawerField label="الوسوم">
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-[11px] px-2 py-0.5 rounded-full"
            >
              <TagIcon size={9} />
              {t}
              {canManage && (
                <button
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  className="text-gray-400 hover:text-red-500"
                  aria-label={`حذف الوسم ${t}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        {canManage && (
          <div className="flex gap-1.5">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const v = tagInput.trim();
                  if (v && !tags.includes(v)) setTags([...tags, v]);
                  setTagInput("");
                }
              }}
              placeholder="+ وسم جديد"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        )}
      </DrawerField>

      {canManage && (
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={() =>
              onSave({
                displayName: name || null,
                nickname: nickname || null,
                email: email || null,
                company: company || null,
                notes: notes || null,
                tags,
              })
            }
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-white rounded-lg py-2 text-sm hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            حفظ
          </button>
          <button
            onClick={() => onSave({ isBlocked: !contact.isBlocked })}
            disabled={saving}
            className={cn(
              "text-xs px-3 py-2 rounded-lg border",
              contact.isBlocked
                ? "border-green-200 text-green-700 hover:bg-green-50"
                : "border-red-200 text-red-600 hover:bg-red-50",
            )}
          >
            {contact.isBlocked ? "إلغاء الحظر" : "حظر"}
          </button>
        </div>
      )}
    </div>
  );
}

function DrawerField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-gray-500">{label}</span>
      {children}
    </label>
  );
}
