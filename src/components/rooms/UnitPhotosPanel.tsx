"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Trash2, Star, StarOff, Upload, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface UnitPhoto {
  id: number;
  unitId: number;
  url: string;
  captionAr: string | null;
  captionEn: string | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
}

export function UnitPhotosPanel({
  unitId,
  canUpload,
  canDelete,
}: {
  unitId: number;
  canUpload: boolean;
  canDelete: boolean;
}) {
  const [photos, setPhotos] = useState<UnitPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/rooms/${unitId}/photos`);
      if (!res.ok) throw new Error("فشل تحميل الصور");
      const json = (await res.json()) as UnitPhoto[];
      setPhotos(Array.isArray(json) ? json : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/rooms/${unitId}/photos`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "فشل رفع الصورة");
        }
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الرفع");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function togglePrimary(photo: UnitPhoto) {
    const res = await fetch(`/api/rooms/${unitId}/photos/${photo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPrimary: !photo.isPrimary }),
    });
    if (res.ok) await load();
  }

  async function deletePhoto(photo: UnitPhoto) {
    if (!confirm("هل تريد حذف هذه الصورة؟")) return;
    const res = await fetch(`/api/rooms/${unitId}/photos/${photo.id}`, {
      method: "DELETE",
    });
    if (res.ok) await load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <ImageIcon size={16} className="text-primary" />
          معرض الصور ({photos.length})
        </div>
        {canUpload && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => handleUpload(e.target.files)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-primary/30 text-primary hover:bg-primary/5 disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Upload size={13} />
              )}
              رفع صورة
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="aspect-square bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="text-center text-xs text-gray-500 py-6 border border-dashed border-gray-200 rounded-lg">
          لم يتم رفع أي صورة لهذه الوحدة بعد.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => {
            const src = `/api/files/unit-photo/${p.id}`;
            return (
              <div
                key={p.id}
                className={cn(
                  "relative group aspect-square rounded-lg overflow-hidden border-2",
                  p.isPrimary ? "border-gold shadow-sm" : "border-gray-100",
                )}
              >
                {}
                <img
                  src={src}
                  alt={p.captionAr ?? `صورة ${p.id}`}
                  className="w-full h-full object-cover"
                />
                {p.isPrimary && (
                  <span className="absolute top-1 right-1 bg-gold text-primary text-[10px] px-1.5 py-0.5 rounded font-bold">
                    رئيسية
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => togglePrimary(p)}
                    className="flex-1 bg-white/90 hover:bg-white rounded py-1 text-[10px] inline-flex items-center justify-center gap-0.5"
                    title={p.isPrimary ? "إلغاء كرئيسية" : "تعيين كرئيسية"}
                  >
                    {p.isPrimary ? <StarOff size={11} /> : <Star size={11} />}
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => deletePhoto(p)}
                      className="flex-1 bg-white/90 hover:bg-red-50 text-red-600 rounded py-1 text-[10px] inline-flex items-center justify-center gap-0.5"
                      title="حذف"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
