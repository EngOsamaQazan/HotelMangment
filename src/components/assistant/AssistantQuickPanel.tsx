"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Loader2,
  Mic,
  Square,
  Paperclip,
  X,
  ImagePlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ActionDraftCard, type AssistantAction } from "./ActionDraftCard";

/**
 * Compact assistant chat used inside the floating popover. Shares the same
 * REST endpoints as the full-page chat in [AssistantChat](AssistantChat.tsx)
 * but adds a `pageContext` envelope so the LLM knows which screen the staff
 * member is currently looking at — that's what makes "كيف أفعل كذا؟"
 * answers contextual ("you're on /accounting/journal, click the +
 * button on the toolbar, …") instead of generic.
 *
 * Mirrors the full-page chat's voice + image upload affordances so a
 * member with a one-handed hold on the FAB can still record a voice note
 * or snap a receipt without switching to the dedicated page.
 */

interface AssistantMessage {
  id: number;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls: unknown;
  toolName: string | null;
  toolCallId: string | null;
  createdAt: string;
}

interface ConversationData {
  conversation: { id: number; title: string } | null;
  messages: AssistantMessage[];
  actions: AssistantAction[];
}

interface Props {
  conversationId: number;
  pathname: string;
}

interface PendingMedia {
  kind: "audio" | "image";
  blob: Blob;
  mimeType: string;
  durationSec?: number;
  previewUrl: string;
  filename: string;
}

export function AssistantQuickPanel({ conversationId, pathname }: Props) {
  const [data, setData] = useState<ConversationData>({
    conversation: null,
    messages: [],
    actions: [],
  });
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Voice recording state.
  const [recording, setRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartRef = useRef<number>(0);

  // Pending media (recorded clip or picked image).
  const [pending, setPending] = useState<PendingMedia | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/assistant/conversations/${conversationId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError(res.status === 404 ? "المحادثة غير موجودة" : "تعذّر تحميل المحادثة");
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data.messages.length, data.actions.length, sending]);

  useEffect(() => {
    return () => {
      if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    };
  }, [pending]);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stream.getTracks().forEach((t) => t.stop());
        recorderRef.current.stop();
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  const pageContext = useMemo(
    () => ({
      path: pathname,
      title: typeof document !== "undefined" ? document.title : null,
    }),
    [pathname],
  );

  const send = useCallback(async () => {
    if (sending) return;
    const text = input.trim();
    if (pending) {
      setSending(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.append("kind", pending.kind);
        fd.append(pending.kind, pending.blob, pending.filename);
        if (text) fd.append("caption", text);
        fd.append("pageContext", JSON.stringify(pageContext));
        const res = await fetch(
          `/api/assistant/conversations/${conversationId}/media`,
          { method: "POST", body: fd },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error || "تعذّر إرسال الملف");
        } else {
          setData((prev) => ({
            conversation: prev.conversation,
            messages: json.messages ?? prev.messages,
            actions: json.actions ?? prev.actions,
          }));
          setInput("");
          if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
          setPending(null);
        }
      } catch {
        setError("خطأ في الاتصال");
      } finally {
        setSending(false);
      }
      return;
    }

    if (!text) return;
    setInput("");
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/assistant/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, pageContext }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "تعذّر إرسال الرسالة");
      } else {
        setData((prev) => ({
          conversation: prev.conversation,
          messages: json.messages ?? prev.messages,
          actions: json.actions ?? prev.actions,
        }));
      }
    } catch {
      setError("خطأ في الاتصال");
    } finally {
      setSending(false);
    }
  }, [conversationId, input, pending, pageContext, sending]);

  const onAction = useCallback(
    async (actionId: number, kind: "confirm" | "reject") => {
      const res = await fetch(`/api/assistant/actions/${actionId}/${kind}`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) alert(json.error || "تعذّر تنفيذ العملية");
      await load();
    },
    [load],
  );

  // ── Voice recording handlers ──────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (recording || sending) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("متصفحك لا يدعم تسجيل الصوت");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supported = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "";
      const recorder = supported
        ? new MediaRecorder(stream, { mimeType: supported })
        : new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const mime = recorder.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mime });
        const previewUrl = URL.createObjectURL(blob);
        const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
        const durationSec = Math.max(
          1,
          Math.round((Date.now() - recordStartRef.current) / 1000),
        );
        setPending({
          kind: "audio",
          blob,
          mimeType: mime,
          durationSec,
          previewUrl,
          filename: `voice-${Date.now()}.${ext}`,
        });
        stream.getTracks().forEach((t) => t.stop());
      };
      recorderRef.current = recorder;
      recorder.start();
      recordStartRef.current = Date.now();
      setRecordingSec(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSec((s) => s + 1);
      }, 1000);
      setRecording(true);
      setError(null);
    } catch (err) {
      console.error("[assistant/quick-panel] mic permission denied", err);
      setError("لم يتم منح إذن المايكروفون");
    }
  }, [recording, sending]);

  const stopRecording = useCallback(() => {
    if (!recording) return;
    recorderRef.current?.stop();
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecording(false);
  }, [recording]);

  const cancelRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stream.getTracks().forEach((t) => t.stop());
      recorderRef.current.stop();
      audioChunksRef.current = [];
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecording(false);
    setPending(null);
  }, []);

  const onPickFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("الرجاء اختيار صورة");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("الصورة أكبر من 8 ميجابايت");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPending({
      kind: "image",
      blob: file,
      mimeType: file.type,
      previewUrl,
      filename: file.name || `image-${Date.now()}.jpg`,
    });
    setError(null);
  }, []);

  const clearPending = useCallback(() => {
    if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
  }, [pending]);

  const timeline = useMemo(() => {
    type Item =
      | { kind: "msg"; key: string; msg: AssistantMessage }
      | { kind: "action"; key: string; action: AssistantAction };
    const items: Item[] = [];
    for (const m of data.messages) {
      if (m.role === "tool") continue;
      items.push({ kind: "msg", key: `m${m.id}`, msg: m });
    }
    for (const a of data.actions) {
      items.push({ kind: "action", key: `a${a.id}`, action: a });
    }
    items.sort((a, b) => {
      const ta = a.kind === "msg" ? a.msg.createdAt : a.action.createdAt;
      const tb = b.kind === "msg" ? b.msg.createdAt : b.action.createdAt;
      return new Date(ta).getTime() - new Date(tb).getTime();
    });
    return items;
  }, [data.messages, data.actions]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <Loader2 className="animate-spin" size={24} />
      </div>
    );
  }
  if (error && !data.conversation && !pending && !recording) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-500 text-sm px-4 text-center">
        {error}
      </div>
    );
  }

  const canSubmit = !sending && !recording && (pending != null || input.trim().length > 0);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2.5 py-3 space-y-2 bg-gray-50">
        {timeline.length === 0 && (
          <div className="text-center text-gray-400 text-xs py-10 leading-relaxed px-2">
            اسأل عن أي شيء في النظام، أو اطلب عملية: قيد، حجز، صيانة، سُلفة…
            <br />
            تستطيع أيضاً تسجيل صوت أو إرفاق صورة (إيصال، هوية، عداد).
          </div>
        )}
        {timeline.map((item) =>
          item.kind === "msg" ? (
            <Bubble key={item.key} msg={item.msg} />
          ) : (
            <ActionDraftCard
              key={item.key}
              action={item.action}
              onConfirm={() => onAction(item.action.id, "confirm")}
              onReject={() => onAction(item.action.id, "reject")}
            />
          ),
        )}
        {sending && (
          <div className="text-[11px] text-gray-500 flex items-center gap-1.5 px-1">
            <Loader2 size={12} className="animate-spin" />
            <span>المساعد يفكّر…</span>
          </div>
        )}
      </div>

      {error && data.conversation && (
        <div className="bg-red-50 border-t border-red-200 text-red-700 text-[11px] px-2 py-1.5 flex items-center justify-between">
          <span className="truncate">{error}</span>
          <button onClick={() => setError(null)} className="hover:text-red-900 shrink-0 ms-1">
            <X size={12} />
          </button>
        </div>
      )}

      {pending && (
        <div className="bg-amber-50 border-t border-amber-200 px-2 py-1.5 flex items-center gap-1.5 text-[11px]">
          {pending.kind === "audio" ? (
            <>
              <Mic size={12} className="text-amber-600 shrink-0" />
              <audio
                controls
                src={pending.previewUrl}
                className="flex-1 max-w-full h-7 min-w-0"
              />
              <span className="text-amber-700 tabular-nums shrink-0">
                {pending.durationSec ?? 0}ث
              </span>
            </>
          ) : (
            <>
              <ImagePlus size={12} className="text-amber-600 shrink-0" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pending.previewUrl}
                alt="معاينة"
                className="h-9 w-9 rounded object-cover border border-amber-200 shrink-0"
              />
              <span className="flex-1 text-amber-800 truncate">{pending.filename}</span>
            </>
          )}
          <button
            onClick={clearPending}
            disabled={sending}
            className="rounded p-0.5 text-amber-700 hover:bg-amber-100 disabled:opacity-50 shrink-0"
            aria-label="إزالة المرفق"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {recording && (
        <div className="bg-rose-50 border-t border-rose-200 px-2 py-1.5 flex items-center gap-1.5 text-[11px]">
          <span className="inline-block h-2 w-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
          <span className="text-rose-700 flex-1">يجري التسجيل…</span>
          <span className="text-rose-700 tabular-nums shrink-0">{recordingSec}ث</span>
          <button
            onClick={cancelRecording}
            className="rounded p-0.5 text-rose-700 hover:bg-rose-100 shrink-0"
            aria-label="إلغاء"
          >
            <X size={12} />
          </button>
          <button
            onClick={stopRecording}
            className="rounded p-0.5 text-rose-700 hover:bg-rose-100 shrink-0"
            aria-label="إنهاء"
          >
            <Square size={12} />
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPickFile(file);
          e.target.value = "";
        }}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t border-gray-200 bg-white p-2 flex items-end gap-1.5"
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || recording || pending != null}
          className="h-9 w-9 shrink-0 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-amber-600 hover:border-amber-300 disabled:opacity-50 flex items-center justify-center"
          aria-label="إرفاق صورة"
          title="إرفاق صورة"
        >
          <Paperclip size={14} />
        </button>
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={sending || pending != null}
          className={cn(
            "h-9 w-9 shrink-0 rounded-lg border flex items-center justify-center disabled:opacity-50 transition-colors",
            recording
              ? "bg-rose-500 border-rose-500 text-white animate-pulse"
              : "bg-white border-gray-200 text-gray-500 hover:text-amber-600 hover:border-amber-300",
          )}
          aria-label={recording ? "إيقاف التسجيل" : "تسجيل صوتي"}
          title={recording ? "إيقاف التسجيل" : "تسجيل صوتي"}
        >
          {recording ? <Square size={14} /> : <Mic size={14} />}
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder={
            pending
              ? pending.kind === "audio"
                ? "أضف ملاحظة (اختياري)…"
                : "صف الصورة (اختياري)…"
              : "اكتب طلبك أو سؤالك…"
          }
          className="flex-1 resize-none rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="h-9 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white flex items-center text-sm shrink-0"
          aria-label="إرسال"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </form>
    </div>
  );
}

function Bubble({ msg }: { msg: AssistantMessage }) {
  const isUser = msg.role === "user";
  const content = isUser
    ? msg.content.replace(/^<<USER_TEXT>>\n?/, "").replace(/\n?<<END_USER_TEXT>>$/, "")
    : msg.content;
  if (!content && msg.role === "assistant") {
    return <div className="text-[10px] text-gray-400 italic px-1">يستدعي أداة…</div>;
  }
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "rounded-xl px-3 py-1.5 max-w-[85%] text-xs whitespace-pre-wrap leading-relaxed",
          isUser
            ? "bg-amber-500 text-white"
            : "bg-white text-gray-800 border border-gray-200",
        )}
      >
        {content}
      </div>
    </div>
  );
}
