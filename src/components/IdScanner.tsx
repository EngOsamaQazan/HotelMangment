"use client";

import { useState, useRef } from "react";
import { Camera, Upload, Loader2, X, FileText, AlertTriangle, CheckCircle } from "lucide-react";

interface ExtractedData {
  fullName?: string;
  idNumber?: string;
  nationality?: string;
}

interface IdScannerProps {
  onExtracted: (data: ExtractedData) => void;
  label?: string;
}

export default function IdScanner({ onExtracted, label }: IdScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [partial, setPartial] = useState<ExtractedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const processImage = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);
      setScanning(true);
      setRawText(null);
      setPartial(null);
      setError(null);
      setProgress("جاري تحليل الوثيقة...");

      try {
        const res = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: dataUrl }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `خطأ في الخادم (${res.status})`);
        }

        const data = await res.json();
        setRawText(data.rawText || null);

        const result: ExtractedData = {
          fullName: data.fullName || undefined,
          idNumber: data.idNumber || undefined,
          nationality: data.nationality || undefined,
        };

        setPartial(result);
        onExtracted(result);
      } catch (err) {
        console.error("OCR Error:", err);
        const msg = err instanceof Error ? err.message : "فشل في تحليل الوثيقة";
        setError(msg);
        setRawText(null);
      } finally {
        setScanning(false);
        setProgress("");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
    e.target.value = "";
  };

  const clearPreview = () => {
    setPreview(null);
    setRawText(null);
    setShowRaw(false);
    setPartial(null);
    setError(null);
  };

  const hasResults = partial && (partial.fullName || partial.idNumber || partial.nationality);
  const resultCount = [partial?.fullName, partial?.idNumber, partial?.nationality].filter(Boolean).length;

  return (
    <div className="relative">
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />

      {!preview ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 bg-gold-soft text-primary border border-gold/40 rounded-lg hover:bg-gold/20 transition-colors text-xs font-medium"
          >
            <Upload size={14} />
            {label || "رفع وثيقة"}
          </button>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors text-xs font-medium"
          >
            <Camera size={14} />
            تصوير
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <div className="relative flex-shrink-0">
              <img src={preview} alt="الوثيقة" className="h-16 rounded-lg border border-gray-200 object-cover" />
              {!scanning && (
                <button
                  type="button"
                  onClick={clearPreview}
                  className="absolute -top-2 -left-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {scanning && (
              <div className="flex items-center gap-2 text-xs text-primary bg-gold-soft border border-gold/30 px-3 py-2 rounded-lg">
                <Loader2 size={14} className="animate-spin" />
                {progress}
              </div>
            )}

            {!scanning && error && (
              <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                <AlertTriangle size={14} />
                {error}
              </div>
            )}

            {!scanning && hasResults && (
              <div className="text-xs bg-green-50 border border-green-200 px-3 py-2 rounded-lg space-y-0.5">
                <div className="flex items-center gap-1 text-green-700 font-medium mb-1">
                  <CheckCircle size={12} />
                  تم استخراج {resultCount}/3 حقول
                </div>
                {partial?.fullName && (
                  <div>
                    <span className="text-gray-500">الاسم:</span>{" "}
                    <span className="font-medium text-green-800">{partial.fullName}</span>
                  </div>
                )}
                {partial?.idNumber && (
                  <div>
                    <span className="text-gray-500">الرقم:</span>{" "}
                    <span className="font-medium text-green-800">{partial.idNumber}</span>
                  </div>
                )}
                {partial?.nationality && (
                  <div>
                    <span className="text-gray-500">الجنسية:</span>{" "}
                    <span className="font-medium text-green-800">{partial.nationality}</span>
                  </div>
                )}
              </div>
            )}

            {!scanning && !hasResults && !error && rawText && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                <AlertTriangle size={14} />
                لم يتم التعرف على البيانات. أدخلها يدوياً.
              </div>
            )}
          </div>

          {rawText && !scanning && (
            <button
              type="button"
              onClick={() => setShowRaw(!showRaw)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <FileText size={12} />
              {showRaw ? "إخفاء النص المستخرج" : "عرض النص المستخرج"}
            </button>
          )}

          {showRaw && rawText && (
            <pre
              dir="auto"
              className="text-[10px] bg-gray-100 p-2 rounded max-h-40 overflow-auto border border-gray-200 whitespace-pre-wrap"
            >
              {rawText}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
