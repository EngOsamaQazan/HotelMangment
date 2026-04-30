"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Loader2,
  Sparkles,
  Mic,
  Square,
  ImagePlus,
  X,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ActionDraftCard, type AssistantAction } from "./ActionDraftCard";

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
  conversation: {
    id: number;
    title: string;
    llmTurns: number;
    costUsdTotal: number;
  } | null;
  messages: AssistantMessage[];
  actions: AssistantAction[];
}

interface Props {
  conversationId: number;
}

interface PendingMedia {
  kind: "audio" | "image";
  blob: Blob;
  mimeType: string;
  durationSec?: number;
  previewUrl: string;
  filename: string;
}

export function AssistantChat({ conversationId }: Props) {
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

  // Voice recording.
  const [recording, setRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartRef = useRef<number>(0);

  // Pending media awaiting send (voice clip or image).
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

  // Scroll to bottom on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data.messages.length, data.actions.length, sending]);

  // Cleanup the object URL when pending media changes/clears.
  useEffect(() => {
    return () => {
      if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    };
  }, [pending]);

  // Cleanup recorder on unmount.
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stream.getTracks().forEach((t) => t.stop());
        recorderRef.current.stop();
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  const send = useCallback(async () => {
    if (sending) return;
    const text = input.trim();
    if (pending) {
      // Send media (audio/image) — caption is the textarea value.
      setSending(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.append("kind", pending.kind);
        fd.append(pending.kind, pending.blob, pending.filename);
        if (text) fd.append("caption", text);
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
          body: JSON.stringify({ message: text }),
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
  }, [conversationId, input, sending, pending]);

  const onAction = useCallback(
    async (actionId: number, kind: "confirm" | "reject") => {
      const res = await fetch(`/api/assistant/actions/${actionId}/${kind}`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error || "تعذّر تنفيذ العملية");
      }
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
      console.error("[assistant/chat] mic permission denied", err);
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

  // ── Image picker ──────────────────────────────────────────────────
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

  // Build a unified timeline: assistant messages mixed with action cards in
  // creation order.
  const timeline = useMemo(() => {
    type Item =
      | { kind: "msg"; key: string; msg: AssistantMessage }
      | { kind: "action"; key: string; action: AssistantAction };
    const items: Item[] = [];
    for (const m of data.messages) {
      if (m.role === "tool") continue; // Tool result rows are internal — don't render.
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
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }
  if (error && !data.conversation) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-red-500 max-w-md px-6">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const composerDisabled = sending || recording;
  const canSubmit =
    !composerDisabled && (pending != null || input.trim().length > 0);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-50">
      <div className="border-b border-gray-200 bg-white px-4 py-3 flex items-center gap-2">
        <Sparkles size={18} className="text-amber-500" />
        <h1 className="font-bold text-sm flex-1 truncate">
          {data.conversation?.title ?? "محادثة"}
        </h1>
        <div className="text-[11px] text-gray-400">
          {data.conversation?.llmTurns ?? 0} مرحلة •{" "}
          {(data.conversation?.costUsdTotal ?? 0).toFixed(4)}$
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {timeline.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-12">
            ابدأ بكتابة طلبك بالعربية، أو سجّل ملاحظة صوتية، أو أرفق صورة (هوية،
            إيصال، عداد...).
          </div>
        )}
        {timeline.map((item) =>
          item.kind === "msg" ? (
            <MessageBubble key={item.key} msg={item.msg} />
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
          <div className="flex items-center gap-2 text-xs text-gray-500 px-2">
            <Loader2 size={14} className="animate-spin" />
            <span>المساعد يفكّر…</span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border-t border-red-200 text-red-700 text-xs px-3 py-2 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="hover:text-red-900">
            <X size={14} />
          </button>
        </div>
      )}

      {pending && (
        <div className="bg-amber-50 border-t border-amber-200 px-3 py-2 flex items-center gap-2 text-xs">
          {pending.kind === "audio" ? (
            <>
              <Mic size={16} className="text-amber-600 shrink-0" />
              <audio controls src={pending.previewUrl} className="flex-1 max-w-full h-8" />
              <span className="text-amber-700 tabular-nums">
                {pending.durationSec ?? 0}ث
              </span>
            </>
          ) : (
            <>
              <ImagePlus size={16} className="text-amber-600 shrink-0" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pending.previewUrl}
                alt="معاينة"
                className="h-12 w-12 rounded object-cover border border-amber-200"
              />
              <span className="flex-1 text-amber-800 truncate">{pending.filename}</span>
            </>
          )}
          <button
            onClick={clearPending}
            disabled={sending}
            className="rounded-md p-1 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            aria-label="إزالة المرفق"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {recording && (
        <div className="bg-rose-50 border-t border-rose-200 px-3 py-2 flex items-center gap-2 text-xs">
          <span className="inline-block h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
          <span className="text-rose-700 flex-1">يجري التسجيل…</span>
          <span className="text-rose-700 tabular-nums">{recordingSec}ث</span>
          <button
            onClick={cancelRecording}
            className="rounded-md p-1 text-rose-700 hover:bg-rose-100"
            aria-label="إلغاء التسجيل"
          >
            <X size={14} />
          </button>
          <button
            onClick={stopRecording}
            className="rounded-md p-1 text-rose-700 hover:bg-rose-100"
            aria-label="إنهاء التسجيل"
          >
            <Square size={14} />
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
        className="border-t border-gray-200 bg-white p-3 flex items-end gap-2 safe-bottom"
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={composerDisabled || pending != null}
          className="h-10 w-10 shrink-0 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-amber-600 hover:border-amber-300 disabled:opacity-50 flex items-center justify-center"
          aria-label="إرفاق صورة"
          title="إرفاق صورة"
        >
          <Paperclip size={18} />
        </button>
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={sending || pending != null}
          className={cn(
            "h-10 w-10 shrink-0 rounded-lg border flex items-center justify-center disabled:opacity-50 transition-colors",
            recording
              ? "bg-rose-500 border-rose-500 text-white animate-pulse"
              : "bg-white border-gray-200 text-gray-500 hover:text-amber-600 hover:border-amber-300",
          )}
          aria-label={recording ? "إيقاف التسجيل" : "تسجيل صوتي"}
          title={recording ? "إيقاف التسجيل" : "تسجيل صوتي"}
        >
          {recording ? <Square size={18} /> : <Mic size={18} />}
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
          rows={2}
          placeholder={
            pending
              ? pending.kind === "audio"
                ? "أضف ملاحظة (اختياري) ثم أرسل التسجيل…"
                : "صف الصورة أو أضف تعليماً للمساعد (اختياري)…"
              : "مثال: اصرف سلفة 100 دينار لأبو زيد، أو سجّل قيد عن دفعة عميل…"
          }
          className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="h-10 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white flex items-center gap-1.5 text-sm font-medium"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          إرسال
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ msg }: { msg: AssistantMessage }) {
  const isUser = msg.role === "user";
  // Strip <<USER_TEXT>> sentinels added by the engine for prompt-injection defence.
  const content = isUser
    ? msg.content.replace(/^<<USER_TEXT>>\n?/, "").replace(/\n?<<END_USER_TEXT>>$/, "")
    : msg.content;
  if (!content && msg.role === "assistant") {
    // Assistant turn that only emitted tool calls — show a quiet placeholder.
    return (
      <div className="text-[11px] text-gray-400 italic px-2">المساعد يستدعي أداة…</div>
    );
  }
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "rounded-2xl px-3.5 py-2 max-w-[80%] whitespace-pre-wrap text-sm leading-relaxed shadow-sm",
          isUser
            ? "bg-amber-500 text-white rounded-tr-sm"
            : "bg-white text-gray-800 border border-gray-200 rounded-tl-sm",
        )}
      >
        {content}
      </div>
    </div>
  );
}
