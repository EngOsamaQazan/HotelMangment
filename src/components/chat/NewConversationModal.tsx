"use client";

import { useEffect, useState } from "react";
import { X, Plus, Loader2, Search, CircleDot, Users, Hash } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { UserLite } from "@/lib/collab/types";
import { UserAvatar } from "@/components/tasks/shared";

interface Props {
  onClose: () => void;
  onCreated: (conversationId: number) => void;
}

export function NewConversationModal({ onClose, onCreated }: Props) {
  const [type, setType] = useState<"dm" | "group">("dm");
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserLite[]>([]);
  const [selected, setSelected] = useState<UserLite[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/chat/users?q=${encodeURIComponent(search)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => {
          if (!cancelled) setUsers(Array.isArray(d) ? d : []);
        })
        .catch(() => {});
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search]);

  async function create() {
    if (type === "dm" && selected.length !== 1) {
      toast.error("اختر مستخدماً واحداً للمحادثة الثنائية");
      return;
    }
    if (type === "group") {
      if (!title.trim()) {
        toast.error("أدخل عنوان المجموعة");
        return;
      }
      if (selected.length < 1) {
        toast.error("أضف عضواً واحداً على الأقل");
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: type === "group" ? title.trim() : undefined,
          userIds: selected.map((u) => u.id),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "فشل الإنشاء");
      }
      const conv = await res.json();
      onCreated(conv.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setBusy(false);
    }
  }

  function toggleUser(u: UserLite) {
    if (type === "dm") {
      setSelected([u]);
    } else {
      setSelected((prev) =>
        prev.find((x) => x.id === u.id)
          ? prev.filter((x) => x.id !== u.id)
          : [...prev, u],
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 bg-gray-50 flex items-center justify-between border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">محادثة جديدة</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="flex gap-2">
            {([
              { k: "dm", label: "ثنائية", icon: CircleDot },
              { k: "group", label: "مجموعة", icon: Users },
            ] as const).map((o) => (
              <button
                key={o.k}
                onClick={() => {
                  setType(o.k);
                  setSelected([]);
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border transition-colors text-sm",
                  type === o.k
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50",
                )}
              >
                <o.icon size={14} /> {o.label}
              </button>
            ))}
          </div>

          {type === "group" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                عنوان المجموعة
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: فريق الاستقبال"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          )}

          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full ps-1 pe-2 py-0.5 text-xs"
                >
                  <UserAvatar user={u} size={20} />
                  {u.name}
                  <button
                    onClick={() =>
                      setSelected(selected.filter((x) => x.id !== u.id))
                    }
                    className="hover:bg-primary/20 rounded p-0.5"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div>
            <div className="relative mb-2">
              <Search
                size={14}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن مستخدم..."
                className="w-full bg-gray-50 border border-gray-200 rounded-lg ps-8 pe-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
              {users.length === 0 && (
                <div className="p-3 text-xs text-gray-400 text-center">
                  اكتب للبحث...
                </div>
              )}
              {users.map((u) => {
                const isSel = !!selected.find((x) => x.id === u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => toggleUser(u)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-start",
                      isSel && "bg-primary/5",
                    )}
                  >
                    <UserAvatar user={u} size={28} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">
                        {u.name}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {u.email}
                      </p>
                    </div>
                    {isSel && (
                      <span className="text-xs text-primary font-bold">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-2">
          <button
            type="button"
            onClick={create}
            disabled={busy || selected.length === 0}
            className="flex-1 flex items-center justify-center gap-1 bg-primary text-white rounded-lg py-2 text-sm hover:bg-primary-dark disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            {busy ? "..." : "إنشاء"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 text-sm text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

void Hash;
