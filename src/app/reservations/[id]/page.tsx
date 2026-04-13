"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  Save,
  Loader2,
  Pencil,
  Trash2,
  FileText,
  X,
  UserPlus,
  AlertTriangle,
} from "lucide-react";
import {
  cn,
  formatDate,
  formatAmount,
  stayTypeLabels,
  unitTypeLabels,
  statusLabels,
} from "@/lib/utils";

interface Unit {
  id: number;
  unitNumber: string;
  unitType: string;
  status: string;
}

interface GuestData {
  id?: number;
  fullName: string;
  idNumber: string;
  nationality: string;
  guestOrder?: number;
}

interface ReservationData {
  id: number;
  unitId: number;
  guestName: string;
  phone: string | null;
  numNights: number;
  stayType: string;
  checkIn: string;
  checkOut: string;
  unitPrice: string;
  totalAmount: string;
  paidAmount: string;
  remaining: string;
  paymentMethod: string | null;
  status: string;
  numGuests: number;
  notes: string | null;
  createdAt: string;
  unit: Unit;
  guests: GuestData[];
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-800",
};

export default function ReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);

  const [reservation, setReservation] = useState<ReservationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit form state
  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("");
  const [numGuests, setNumGuests] = useState(1);
  const [stayType, setStayType] = useState("daily");
  const [checkIn, setCheckIn] = useState("");
  const [numNights, setNumNights] = useState(1);
  const [unitPrice, setUnitPrice] = useState("");
  const [paidAmount, setPaidAmount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");
  const [guests, setGuests] = useState<GuestData[]>([]);

  const fetchReservation = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reservations/${id}`);
      if (!res.ok) throw new Error("Not found");
      const data: ReservationData = await res.json();
      setReservation(data);
      populateForm(data);
    } catch {
      setReservation(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchReservation();
  }, [fetchReservation]);

  const populateForm = (r: ReservationData) => {
    setGuestName(r.guestName);
    setPhone(r.phone || "");
    setNumGuests(r.numGuests);
    setStayType(r.stayType);
    setCheckIn(r.checkIn.split("T")[0]);
    setNumNights(r.numNights);
    setUnitPrice(String(r.unitPrice));
    setPaidAmount(String(r.paidAmount));
    setPaymentMethod(r.paymentMethod || "cash");
    setStatus(r.status);
    setNotes(r.notes || "");
    setGuests(
      r.guests.length > 0
        ? r.guests.map((g) => ({
            fullName: g.fullName,
            idNumber: g.idNumber,
            nationality: g.nationality,
          }))
        : [{ fullName: "", idNumber: "", nationality: "" }]
    );
  };

  const checkOut = (() => {
    if (!checkIn || !numNights) return "";
    const d = new Date(checkIn);
    if (stayType === "monthly") {
      d.setMonth(d.getMonth() + numNights);
    } else if (stayType === "weekly") {
      d.setDate(d.getDate() + numNights * 7);
    } else {
      d.setDate(d.getDate() + numNights);
    }
    return d.toISOString().split("T")[0];
  })();

  const totalAmount = unitPrice
    ? (parseFloat(unitPrice) * numNights).toFixed(2)
    : "0.00";
  const remaining = (
    parseFloat(totalAmount) - parseFloat(paidAmount || "0")
  ).toFixed(2);

  const stayLabel =
    stayType === "monthly" ? "شهر" : stayType === "weekly" ? "أسبوع" : "ليلة";

  const updateGuest = (
    index: number,
    field: keyof GuestData,
    value: string
  ) => {
    setGuests((prev) =>
      prev.map((g, i) => (i === index ? { ...g, [field]: value } : g))
    );
  };

  const handleStartEdit = () => {
    if (reservation) populateForm(reservation);
    setEditing(true);
    setError("");
  };

  const handleCancelEdit = () => {
    if (reservation) populateForm(reservation);
    setEditing(false);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!guestName.trim()) {
      setError("يرجى إدخال اسم الضيف");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const body = {
        guestName: guestName.trim(),
        phone: phone.trim() || null,
        numNights,
        stayType,
        checkIn,
        checkOut,
        unitPrice,
        totalAmount,
        paidAmount: paidAmount || "0",
        paymentMethod,
        numGuests,
        status,
        notes: notes.trim() || null,
        guests: guests
          .filter((g) => g.fullName.trim() || g.idNumber.trim())
          .map((g) => ({
            fullName: g.fullName.trim(),
            idNumber: g.idNumber.trim(),
            nationality: g.nationality.trim(),
          })),
      };

      const res = await fetch(`/api/reservations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "فشل في تحديث الحجز");
      }

      const updated = await res.json();
      setReservation(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/reservations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("فشل في حذف الحجز");
      router.push("/reservations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ في الحذف");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="animate-spin text-primary" size={36} />
        <span className="mr-3 text-gray-500 text-lg">
          جاري تحميل بيانات الحجز...
        </span>
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-gray-400">
        <AlertTriangle size={48} className="mb-3 text-amber-400" />
        <p className="text-lg font-medium text-gray-600">الحجز غير موجود</p>
        <Link
          href="/reservations"
          className="mt-4 text-primary hover:underline"
        >
          العودة لسجل الحجوزات
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/reservations"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowRight size={20} className="text-gray-600" />
          </Link>
          <CalendarCheck className="text-primary" size={24} />
          <h1 className="text-lg sm:text-2xl font-bold text-gray-800">
            حجز #{reservation.id}
          </h1>
          <span
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium",
              STATUS_COLORS[reservation.status] || "bg-gray-100"
            )}
          >
            {statusLabels[reservation.status] || reservation.status}
          </span>
        </div>
        {!editing && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium flex-1 sm:flex-none justify-center"
            >
              <Pencil size={16} />
              تعديل
            </button>
            <Link
              href={`/reservations/${reservation.id}/contract`}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium flex-1 sm:flex-none justify-center"
            >
              <FileText size={16} />
              طباعة العقد
            </Link>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium flex-1 sm:flex-none justify-center"
            >
              <Trash2 size={16} />
              حذف
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="text-red-600" size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-800">تأكيد الحذف</h3>
            </div>
            <p className="text-gray-600 mb-6">
              هل أنت متأكد من حذف هذا الحجز؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-lg transition-colors font-medium disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                {deleting ? "جاري الحذف..." : "نعم، احذف"}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors font-medium"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {editing ? (
        /* ===== EDIT MODE ===== */
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* بيانات الضيف */}
          <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
              <div className="w-1 h-6 bg-primary rounded-full" />
              بيانات الضيف
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">
                  اسم الضيف <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">
                  رقم الهاتف
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">
                  عدد النزلاء
                </label>
                <input
                  type="number"
                  min={1}
                  value={numGuests}
                  onChange={(e) =>
                    setNumGuests(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                />
              </div>
            </div>
          </div>

          {/* مدة الإقامة */}
          <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
              <div className="w-1 h-6 bg-primary rounded-full" />
              مدة الإقامة
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">
                  نوع الإقامة
                </label>
                <select
                  value={stayType}
                  onChange={(e) => setStayType(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                >
                  {Object.entries(stayTypeLabels).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">
                  تاريخ الدخول
                </label>
                <input
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">
                  عدد{" "}
                  {stayLabel === "ليلة"
                    ? "الليالي"
                    : stayLabel === "أسبوع"
                    ? "الأسابيع"
                    : "الأشهر"}
                </label>
                <input
                  type="number"
                  min={1}
                  value={numNights}
                  onChange={(e) =>
                    setNumNights(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">
                  تاريخ الخروج
                </label>
                <input
                  type="date"
                  value={checkOut}
                  readOnly
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-sm cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* البيانات المالية */}
          <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
              <div className="w-1 h-6 bg-primary rounded-full" />
              البيانات المالية
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">
                  سعر الوحدة / {stayLabel}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">
                  الإجمالي
                </label>
                <input
                  type="text"
                  value={totalAmount}
                  readOnly
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 font-bold text-sm cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">
                  المدفوع
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">
                  المتبقي
                </label>
                <input
                  type="text"
                  value={remaining}
                  readOnly
                  className={cn(
                    "w-full px-4 py-2.5 border border-gray-200 rounded-lg font-bold text-sm cursor-not-allowed",
                    parseFloat(remaining) > 0
                      ? "bg-red-50 text-red-700"
                      : "bg-green-50 text-green-700"
                  )}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">
                  طريقة الدفع
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                >
                  <option value="cash">نقدي</option>
                  <option value="bank">تحويل بنكي</option>
                  <option value="card">بطاقة</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">
                  حالة الحجز
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                >
                  <option value="active">نشط</option>
                  <option value="completed">منتهي</option>
                  <option value="cancelled">ملغي</option>
                </select>
              </div>
            </div>
          </div>

          {/* بيانات النزلاء */}
          <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-700 flex items-center gap-2">
                <div className="w-1 h-6 bg-primary rounded-full" />
                بيانات النزلاء
              </h2>
              <button
                type="button"
                onClick={() => {
                  setGuests((prev) => [
                    ...prev,
                    { fullName: "", idNumber: "", nationality: "" },
                  ]);
                  setNumGuests((n) => n + 1);
                }}
                className="flex items-center gap-1 text-sm text-primary hover:text-primary-dark font-medium"
              >
                <UserPlus size={16} />
                إضافة نزيل
              </button>
            </div>
            <div className="space-y-4">
              {guests.map((guest, idx) => (
                <div
                  key={idx}
                  className="border border-gray-100 rounded-lg p-4 bg-gray-50/50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-500">
                      النزيل {idx + 1}
                    </span>
                    {guests.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setGuests((prev) =>
                            prev.filter((_, i) => i !== idx)
                          );
                          setNumGuests((n) => Math.max(1, n - 1));
                        }}
                        className="p-1 text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input
                      type="text"
                      placeholder="الاسم الكامل"
                      value={guest.fullName}
                      onChange={(e) =>
                        updateGuest(idx, "fullName", e.target.value)
                      }
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                    />
                    <input
                      type="text"
                      placeholder="رقم الهوية"
                      value={guest.idNumber}
                      onChange={(e) =>
                        updateGuest(idx, "idNumber", e.target.value)
                      }
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                    />
                    <input
                      type="text"
                      placeholder="الجنسية"
                      value={guest.nationality}
                      onChange={(e) =>
                        updateGuest(idx, "nationality", e.target.value)
                      }
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ملاحظات */}
          <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
              <div className="w-1 h-6 bg-primary rounded-full" />
              ملاحظات
            </h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="أي ملاحظات إضافية..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="flex items-center justify-center gap-2 px-6 py-3 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors font-medium"
            >
              <X size={18} />
              إلغاء التعديل
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex-1 sm:flex-none"
            >
              {submitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Save size={18} />
              )}
              {submitting ? "جاري الحفظ..." : "حفظ التعديلات"}
            </button>
          </div>
        </form>
      ) : (
        /* ===== VIEW MODE ===== */
        <div className="space-y-6">
          {/* بيانات الحجز الأساسية */}
          <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
              <div className="w-1 h-6 bg-primary rounded-full" />
              بيانات الحجز
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-5 gap-x-8">
              <DetailRow label="اسم الضيف" value={reservation.guestName} />
              <DetailRow label="رقم الهاتف" value={reservation.phone || "—"} />
              <DetailRow
                label="الوحدة"
                value={`${reservation.unit.unitNumber} (${unitTypeLabels[reservation.unit.unitType] || reservation.unit.unitType})`}
              />
              <DetailRow
                label="نوع الإقامة"
                value={stayTypeLabels[reservation.stayType] || reservation.stayType}
              />
              <DetailRow
                label="تاريخ الدخول"
                value={formatDate(reservation.checkIn)}
              />
              <DetailRow
                label="تاريخ الخروج"
                value={formatDate(reservation.checkOut)}
              />
              <DetailRow
                label="عدد الليالي"
                value={String(reservation.numNights)}
              />
              <DetailRow
                label="عدد النزلاء"
                value={String(reservation.numGuests)}
              />
              <DetailRow
                label="تاريخ الإنشاء"
                value={formatDate(reservation.createdAt)}
              />
            </div>
          </div>

          {/* البيانات المالية */}
          <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
              <div className="w-1 h-6 bg-primary rounded-full" />
              البيانات المالية
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <FinanceCard
                label="سعر الوحدة"
                value={formatAmount(reservation.unitPrice)}
                color="text-gray-700"
              />
              <FinanceCard
                label="الإجمالي"
                value={formatAmount(reservation.totalAmount)}
                color="text-gray-800"
                bold
              />
              <FinanceCard
                label="المدفوع"
                value={formatAmount(reservation.paidAmount)}
                color="text-green-700"
              />
              <FinanceCard
                label="المتبقي"
                value={formatAmount(reservation.remaining)}
                color={
                  parseFloat(String(reservation.remaining)) > 0
                    ? "text-red-600"
                    : "text-green-700"
                }
                bold
              />
            </div>
            {reservation.paymentMethod && (
              <p className="text-sm text-gray-500 mt-3">
                طريقة الدفع:{" "}
                <span className="font-medium text-gray-700">
                  {reservation.paymentMethod === "cash"
                    ? "نقدي"
                    : reservation.paymentMethod === "bank"
                    ? "تحويل بنكي"
                    : "بطاقة"}
                </span>
              </p>
            )}
          </div>

          {/* النزلاء */}
          {reservation.guests.length > 0 && (
            <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                <div className="w-1 h-6 bg-primary rounded-full" />
                النزلاء ({reservation.guests.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-2.5 text-right font-semibold text-gray-600">
                        #
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold text-gray-600">
                        الاسم
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold text-gray-600">
                        رقم الهوية
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold text-gray-600">
                        الجنسية
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservation.guests.map((g, idx) => (
                      <tr
                        key={g.id || idx}
                        className="border-b border-gray-50"
                      >
                        <td className="px-4 py-2.5 text-gray-500">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-gray-800">
                          {g.fullName}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 font-mono">
                          {g.idNumber}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {g.nationality || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ملاحظات */}
          {reservation.notes && (
            <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-700 mb-3 flex items-center gap-2">
                <div className="w-1 h-6 bg-primary rounded-full" />
                ملاحظات
              </h2>
              <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">
                {reservation.notes}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-400 mb-1">{label}</dt>
      <dd className="text-sm font-medium text-gray-800">{value}</dd>
    </div>
  );
}

function FinanceCard({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: string;
  color: string;
  bold?: boolean;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={cn("text-lg", color, bold && "font-bold")}>{value}</p>
    </div>
  );
}
