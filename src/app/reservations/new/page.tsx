"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  Save,
  Loader2,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  cn,
  stayTypeLabels,
  unitTypeLabels,
} from "@/lib/utils";
import IdScanner from "@/components/IdScanner";

interface Unit {
  id: number;
  unitNumber: string;
  unitType: string;
  status: string;
}

interface SeasonalPrice {
  id: number;
  seasonName: string;
  roomDaily: string;
  roomWeekly: string;
  roomMonthly: string;
  aptDaily: string;
  aptWeekly: string;
  aptMonthly: string;
}

interface GuestEntry {
  fullName: string;
  idNumber: string;
  nationality: string;
}

export default function NewReservationPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [units, setUnits] = useState<Unit[]>([]);
  const [seasonalPrice, setSeasonalPrice] = useState<SeasonalPrice | null>(null);

  const [unitType, setUnitType] = useState<string>("room");
  const [unitId, setUnitId] = useState<string>("");
  const [stayType, setStayType] = useState<string>("daily");
  const [guestName, setGuestName] = useState("");
  const [guestIdNumber, setGuestIdNumber] = useState("");
  const [guestNationality, setGuestNationality] = useState("");
  const [phone, setPhone] = useState("");
  const [numGuests, setNumGuests] = useState(1);
  const [checkIn, setCheckIn] = useState("");
  const [numNights, setNumNights] = useState(1);
  const [unitPrice, setUnitPrice] = useState<string>("");
  const [paidAmount, setPaidAmount] = useState<string>("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [guests, setGuests] = useState<GuestEntry[]>([
    { fullName: "", idNumber: "", nationality: "" },
  ]);

  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const filteredUnits = units.filter(
    (u) => u.unitType === unitType && u.status === "available"
  );

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

  const totalAmount = unitPrice ? (parseFloat(unitPrice) * numNights).toFixed(2) : "0.00";
  const remaining = (parseFloat(totalAmount) - parseFloat(paidAmount || "0")).toFixed(2);

  useEffect(() => {
    setCheckIn(new Date().toISOString().split("T")[0]);
    fetch("/api/units")
      .then((r) => r.json())
      .then((data) => setUnits(Array.isArray(data) ? data : []))
      .catch(() => setUnits([]));
  }, []);

  useEffect(() => {
    if (!checkIn) return;
    fetch(`/api/seasonal-prices?date=${checkIn}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.id) setSeasonalPrice(data);
        else setSeasonalPrice(null);
      })
      .catch(() => setSeasonalPrice(null));
  }, [checkIn]);

  useEffect(() => {
    if (!seasonalPrice) return;
    const key =
      unitType === "room"
        ? stayType === "monthly"
          ? "roomMonthly"
          : stayType === "weekly"
          ? "roomWeekly"
          : "roomDaily"
        : stayType === "monthly"
        ? "aptMonthly"
        : stayType === "weekly"
        ? "aptWeekly"
        : "aptDaily";
    const price = seasonalPrice[key as keyof SeasonalPrice];
    if (price) setUnitPrice(String(price));
  }, [seasonalPrice, unitType, stayType]);

  useEffect(() => {
    setGuests((prev) => {
      if (numGuests > prev.length) {
        return [
          ...prev,
          ...Array.from({ length: numGuests - prev.length }, () => ({
            fullName: "",
            idNumber: "",
            nationality: "",
          })),
        ];
      }
      return prev.slice(0, numGuests);
    });
  }, [numGuests]);

  useEffect(() => {
    setUnitId("");
  }, [unitType]);

  const updateGuest = (index: number, field: keyof GuestEntry, value: string) => {
    setGuests((prev) =>
      prev.map((g, i) => (i === index ? { ...g, [field]: value } : g))
    );
  };

  const validate = (): boolean => {
    if (!unitId) return false;
    if (!guestName.trim()) return false;
    if (!checkIn) return false;
    if (!unitPrice || parseFloat(unitPrice) <= 0) return false;
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ unitId: true, guestName: true, checkIn: true, unitPrice: true });

    if (!validate()) {
      setError("يرجى تعبئة جميع الحقول المطلوبة");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const body = {
        unitId: parseInt(unitId),
        guestName: guestName.trim(),
        guestIdNumber: guestIdNumber.trim() || null,
        nationality: guestNationality.trim() || null,
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
        notes: notes.trim() || null,
        guests: guests
          .filter((g) => g.fullName.trim() || g.idNumber.trim())
          .map((g) => ({
            fullName: g.fullName.trim(),
            idNumber: g.idNumber.trim(),
            nationality: g.nationality.trim(),
          })),
      };

      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "فشل في إنشاء الحجز");
      }

      router.push("/reservations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  };

  const stayLabel =
    stayType === "monthly" ? "شهر" : stayType === "weekly" ? "أسبوع" : "ليلة";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/reservations" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowRight size={20} className="text-gray-600" />
          </Link>
          <CalendarCheck className="text-primary" size={28} />
          <h1 className="text-2xl font-bold text-primary">حجز جديد</h1>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* بيانات الوحدة */}
        <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-primary rounded-full" />
            بيانات الوحدة
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">
                نوع الوحدة <span className="text-red-500">*</span>
              </label>
              <select
                value={unitType}
                onChange={(e) => setUnitType(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
              >
                {Object.entries(unitTypeLabels).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">
                رقم الوحدة <span className="text-red-500">*</span>
              </label>
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className={cn(
                  "w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm",
                  touched.unitId && !unitId ? "border-red-300 bg-red-50" : "border-gray-200"
                )}
              >
                <option value="">اختر الوحدة</option>
                {filteredUnits.map((u) => (
                  <option key={u.id} value={u.id}>{u.unitNumber}</option>
                ))}
              </select>
              {filteredUnits.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">لا توجد وحدات شاغرة من هذا النوع</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">نوع الإقامة</label>
              <select
                value={stayType}
                onChange={(e) => setStayType(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
              >
                {Object.entries(stayTypeLabels).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* بيانات المستأجر */}
        <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-700 flex items-center gap-2">
              <div className="w-1 h-6 bg-primary rounded-full" />
              بيانات المستأجر (الطرف الثاني)
            </h2>
            <IdScanner
              label="مسح هوية المستأجر"
              onExtracted={(data) => {
                if (data.fullName) setGuestName(data.fullName);
                if (data.idNumber) setGuestIdNumber(data.idNumber);
                if (data.nationality) setGuestNationality(data.nationality);
              }}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">
                اسم المستأجر <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, guestName: true }))}
                placeholder="الاسم الرباعي"
                className={cn(
                  "w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm",
                  touched.guestName && !guestName.trim() ? "border-red-300 bg-red-50" : "border-gray-200"
                )}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">
                رقم الهوية / الإقامة
              </label>
              <input
                type="text"
                value={guestIdNumber}
                onChange={(e) => setGuestIdNumber(e.target.value)}
                placeholder="رقم الهوية الوطنية أو جواز السفر"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">الجنسية</label>
              <input
                type="text"
                value={guestNationality}
                onChange={(e) => setGuestNationality(e.target.value)}
                placeholder="مثال: أردني"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">رقم الهاتف</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XXXXXXXX"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">عدد النزلاء</label>
              <input
                type="number"
                min={1}
                max={20}
                value={numGuests}
                onChange={(e) => setNumGuests(Math.max(1, parseInt(e.target.value) || 1))}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">
                تاريخ الدخول <span className="text-red-500">*</span>
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
                عدد {stayLabel === "ليلة" ? "الليالي" : stayLabel === "أسبوع" ? "الأسابيع" : "الأشهر"}
              </label>
              <input
                type="number"
                min={1}
                value={numNights}
                onChange={(e) => setNumNights(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">تاريخ الخروج</label>
              <input
                type="date"
                value={checkOut}
                readOnly
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 text-sm cursor-not-allowed"
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
                سعر الوحدة / {stayLabel} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, unitPrice: true }))}
                className={cn(
                  "w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm",
                  touched.unitPrice && (!unitPrice || parseFloat(unitPrice) <= 0) ? "border-red-300 bg-red-50" : "border-gray-200"
                )}
              />
              {seasonalPrice && (
                <p className="text-xs text-green-600 mt-1">سعر الموسم: {seasonalPrice.seasonName}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">الإجمالي</label>
              <input
                type="text"
                value={totalAmount}
                readOnly
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-bold text-sm cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">المبلغ المدفوع</label>
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
              <label className="block text-sm font-medium text-gray-600 mb-1.5">المتبقي</label>
              <input
                type="text"
                value={remaining}
                readOnly
                className={cn(
                  "w-full px-4 py-2.5 border border-gray-200 rounded-lg font-bold text-sm cursor-not-allowed",
                  parseFloat(remaining) > 0 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                )}
              />
            </div>
          </div>
          <div className="mt-4 max-w-xs">
            <label className="block text-sm font-medium text-gray-600 mb-1.5">طريقة الدفع</label>
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
              onClick={() => setNumGuests((n) => n + 1)}
              className="flex items-center gap-1 text-sm text-primary hover:text-primary-dark font-medium"
            >
              <UserPlus size={16} />
              إضافة نزيل
            </button>
          </div>

          <div className="space-y-4">
            {guests.map((guest, idx) => (
              <div key={idx} className="border border-gray-100 rounded-lg p-4 bg-gray-50/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-500">
                    النزيل {idx + 1} {idx === 0 && "(المستأجر)"}
                  </span>
                  <div className="flex items-center gap-2">
                    <IdScanner
                      label="مسح الهوية"
                      onExtracted={(data) => {
                        if (data.fullName) updateGuest(idx, "fullName", data.fullName);
                        if (data.idNumber) updateGuest(idx, "idNumber", data.idNumber);
                        if (data.nationality) updateGuest(idx, "nationality", data.nationality);
                        if (idx === 0) {
                          if (data.fullName && !guestName) setGuestName(data.fullName);
                          if (data.idNumber && !guestIdNumber) setGuestIdNumber(data.idNumber);
                          if (data.nationality && !guestNationality) setGuestNationality(data.nationality);
                        }
                      }}
                    />
                    {guests.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setGuests((prev) => prev.filter((_, i) => i !== idx));
                          setNumGuests((n) => Math.max(1, n - 1));
                        }}
                        className="p-1 text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    type="text"
                    placeholder="الاسم الكامل"
                    value={guest.fullName}
                    onChange={(e) => updateGuest(idx, "fullName", e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                  />
                  <input
                    type="text"
                    placeholder="رقم الهوية / الإقامة"
                    value={guest.idNumber}
                    onChange={(e) => updateGuest(idx, "idNumber", e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                  />
                  <input
                    type="text"
                    placeholder="الجنسية"
                    value={guest.nationality}
                    onChange={(e) => updateGuest(idx, "nationality", e.target.value)}
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

        {/* Submit */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3">
          <Link
            href="/reservations"
            className="px-6 py-3 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors font-medium text-center"
          >
            إلغاء
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex-1 sm:flex-none"
          >
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {submitting ? "جاري الحفظ..." : "حفظ الحجز"}
          </button>
        </div>
      </form>
    </div>
  );
}
