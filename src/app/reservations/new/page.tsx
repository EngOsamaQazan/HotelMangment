"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarCheck,
  Save,
  Loader2,
  Trash2,
  UserPlus,
  AlertTriangle,
  Users as UsersIcon,
  History,
} from "lucide-react";
import { ForbiddenCard } from "@/components/ForbiddenCard";
import {
  cn,
  stayTypeLabels,
  unitTypeLabels,
} from "@/lib/utils";
import IdScanner from "@/components/IdScanner";
import { NumberInput } from "@/components/ui/NumberInput";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { dialCodeForNationality } from "@/lib/dial-codes";
import {
  BookedDatePicker,
  type BlockedRange,
  isSpanBlocked,
} from "@/components/ui/BookedDatePicker";
import { BedIcon } from "@/components/unit-types/shared";
import { usePermissions } from "@/lib/permissions/client";

interface UnitTypeBed {
  id: number;
  bedType: string;
  count: number;
  sleepsExtra: boolean;
}

interface UnitTypeRoom {
  id: number;
  nameAr: string;
  kind: string;
  position: number;
  beds: UnitTypeBed[];
}

interface UnitTypeRef {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  hasKitchen: boolean;
  hasBalcony: boolean;
  rooms: UnitTypeRoom[];
}

interface Unit {
  id: number;
  unitNumber: string;
  unitType: string;
  status: string;
  unitTypeRef?: UnitTypeRef | null;
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
  // URL prefill: the Guest CRM ("/guests") links here with `?guestName=..&idNumber=..&nationality=..&phone=..`
  // so the operator can create a new booking for an existing guest without
  // retyping anything. Also supports deep-linking from other surfaces.
  const searchParams = useSearchParams();
  const prefillGuestName = searchParams?.get("guestName") ?? "";
  const prefillIdNumber = searchParams?.get("idNumber") ?? "";
  const prefillNationality = searchParams?.get("nationality") ?? "";
  const prefillPhone = searchParams?.get("phone") ?? "";

  const { can, isLoading: permsLoading } = usePermissions();
  const canCreate = can("reservations:create");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [units, setUnits] = useState<Unit[]>([]);
  const [seasonalPrice, setSeasonalPrice] = useState<SeasonalPrice | null>(null);

  const [unitType, setUnitType] = useState<string>("room");
  const [unitId, setUnitId] = useState<string>("");
  const [stayType, setStayType] = useState<string>("daily");
  const [guestName, setGuestName] = useState(prefillGuestName);
  const [guestIdNumber, setGuestIdNumber] = useState(prefillIdNumber);
  const [guestNationality, setGuestNationality] = useState(prefillNationality);
  const [phone, setPhone] = useState(prefillPhone);
  const [phoneDialCode, setPhoneDialCode] = useState("");
  const [numGuests, setNumGuests] = useState(1);
  const [numNights, setNumNights] = useState(1);
  const [checkIn, setCheckIn] = useState("");
  // Global hotel standards: check-in 14:00, check-out 12:00.
  const [checkInTime, setCheckInTime] = useState("14:00");
  const [checkOutTime, setCheckOutTime] = useState("12:00");
  const [unitPrice, setUnitPrice] = useState<string>("");
  const [paidAmount, setPaidAmount] = useState<string>("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [guests, setGuests] = useState<GuestEntry[]>([
    {
      fullName: prefillGuestName,
      idNumber: prefillIdNumber,
      nationality: prefillNationality,
    },
  ]);

  const selectedUnit = units.find((u) => String(u.id) === unitId) ?? null;
  const selectedType = selectedUnit?.unitTypeRef ?? null;
  const overCapacity = selectedType ? numGuests > selectedType.maxOccupancy : false;

  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // IDs of units that have a real conflict with the currently selected
  // window. Populated by /api/units/availability, so we let users book a
  // unit that is "occupied" today but free on a future date, and correctly
  // hide a unit that is "available" today but already booked for that range.
  const [unavailableUnitIds, setUnavailableUnitIds] = useState<Set<number>>(
    new Set(),
  );

  // Blocked ranges for the currently-selected unit, used by the date picker
  // to disable days that are already claimed by another reservation.
  const [unitBlockedRanges, setUnitBlockedRanges] = useState<BlockedRange[]>([]);
  const [unitMaintenance, setUnitMaintenance] = useState(false);

  // Back-office flow: when enabled, staff can pick a past check-in date to
  // register a reservation that already happened (walk-in that was forgotten).
  // The server will auto-derive the correct status (active/completed) and
  // post the accounting entries on the historical date, not today.
  const [backdated, setBackdated] = useState(false);

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

  // A unit is offered in the picker when:
  //   - it matches the selected unitType, AND
  //   - it is not under maintenance right now, AND
  //   - it has no active/upcoming reservation overlapping the requested range.
  // We no longer hard-filter on `status === 'available'`: a currently-occupied
  // unit may be free on a future date, which is exactly what we want to allow.
  const filteredUnits = units.filter(
    (u) =>
      u.unitType === unitType &&
      u.status !== "maintenance" &&
      !unavailableUnitIds.has(u.id),
  );

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
    if (!checkIn || !checkOut) return;
    const ciIso = `${checkIn}T${checkInTime || "14:00"}:00`;
    const coIso = `${checkOut}T${checkOutTime || "12:00"}:00`;
    const controller = new AbortController();
    fetch(
      `/api/units/availability?checkIn=${encodeURIComponent(ciIso)}&checkOut=${encodeURIComponent(coIso)}`,
      { signal: controller.signal },
    )
      .then((r) => r.json())
      .then((data: { id: number; available: boolean }[]) => {
        if (!Array.isArray(data)) return;
        const blocked = new Set(
          data.filter((u) => !u.available).map((u) => u.id),
        );
        setUnavailableUnitIds(blocked);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [checkIn, checkOut, checkInTime, checkOutTime]);

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

  // Auto-populate the phone dial code from the tenant's nationality whenever
  // the clerk picks/changes it (manually or via the ID scanner). The input
  // itself stays editable — if this clerk's guest is, say, a Saudi citizen
  // who hands over a Jordanian number, they can just overwrite it.
  useEffect(() => {
    const code = dialCodeForNationality(guestNationality);
    if (code) setPhoneDialCode(code);
  }, [guestNationality]);

  // Fetch the blocked windows for the selected unit so the date picker can
  // visually disable already-reserved days.
  useEffect(() => {
    if (!unitId) {
      setUnitBlockedRanges([]);
      setUnitMaintenance(false);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/units/${unitId}/booked-dates?months=12`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data && Array.isArray(data.ranges)) {
          setUnitBlockedRanges(data.ranges as BlockedRange[]);
          setUnitMaintenance(Boolean(data.maintenance));
        } else {
          setUnitBlockedRanges([]);
          setUnitMaintenance(false);
        }
      })
      .catch(() => {
        setUnitBlockedRanges([]);
        setUnitMaintenance(false);
      });
    return () => controller.abort();
  }, [unitId]);

  // Surface an inline error if the user picks a date range that would collide
  // with a booking on the selected unit (belt-and-suspenders with the server
  // side overlap check).
  const rangeConflict = useMemo(() => {
    if (!unitId || !checkIn || !checkOut) return null;
    return isSpanBlocked(checkIn, checkOut, unitBlockedRanges);
  }, [unitId, checkIn, checkOut, unitBlockedRanges]);

  // Preview of what status the server will assign, so back-office staff see
  // exactly what will be saved before they submit.
  const derivedStatus = useMemo<null | "upcoming" | "active" | "completed">(() => {
    if (!checkIn) return null;
    const now = new Date();
    const ciIso = `${checkIn}T${checkInTime || "14:00"}:00`;
    const coIso = `${checkOut}T${checkOutTime || "12:00"}:00`;
    const ci = new Date(ciIso);
    const co = new Date(coIso);
    if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) return null;
    if (ci > now) return "upcoming";
    if (co <= now) return "completed";
    return "active";
  }, [checkIn, checkOut, checkInTime, checkOutTime]);

  const isBackdatedSelection = useMemo(() => {
    if (!checkIn) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ci = new Date(`${checkIn}T00:00:00`);
    return ci.getTime() < today.getTime();
  }, [checkIn]);

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

  const reportError = (msg: string) => {
    setError(msg);
    toast.error(msg);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ unitId: true, guestName: true, checkIn: true, unitPrice: true });

    if (!canCreate) {
      reportError("ليس لديك صلاحية إنشاء حجز جديد");
      return;
    }

    if (!validate()) {
      reportError("يرجى تعبئة جميع الحقول المطلوبة");
      return;
    }

    if (rangeConflict) {
      reportError(
        `الفترة المحدّدة تتعارض مع حجز آخر على نفس الوحدة${
          rangeConflict.guestName ? ` (${rangeConflict.guestName})` : ""
        } — الرجاء اختيار تاريخ آخر.`,
      );
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // Compose full ISO datetimes from date + time inputs so the server stores
      // the actual hour (Prisma fields are DateTime).
      const checkInIso = `${checkIn}T${checkInTime || "14:00"}:00`;
      const checkOutIso = `${checkOut}T${checkOutTime || "12:00"}:00`;

      const body = {
        unitId: parseInt(unitId),
        guestName: guestName.trim(),
        guestIdNumber: guestIdNumber.trim() || null,
        nationality: guestNationality.trim() || null,
        phone: (() => {
          const local = phone.trim();
          if (!local) return null;
          const dial = phoneDialCode.trim();
          return dial ? `${dial} ${local}` : local;
        })(),
        numNights,
        stayType,
        checkIn: checkInIso,
        checkOut: checkOutIso,
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
        // Explicit flag so the server can audit/allow backdating. The server
        // derives the actual booking status from the dates regardless, but
        // this flag guards against accidental past-date submissions from
        // clients that haven't opted-in.
        backdated: backdated && isBackdatedSelection,
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
      reportError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  };

  const stayLabel =
    stayType === "monthly" ? "شهر" : stayType === "weekly" ? "أسبوع" : "ليلة";

  // Hard-gate the page: if the user lacks `reservations:create`, don't even
  // render the form — the API will 403 anyway, and letting them fill dozens
  // of fields just to fail at the end is a terrible UX. Wait until the
  // permissions context resolved (`permsLoading` flips false) so we don't
  // flash this card during the initial SSR/hydration tick.
  if (!permsLoading && !canCreate) {
    return (
      <ForbiddenCard
        title="لا تملك صلاحية إنشاء حجز جديد"
        description={
          <>
            تم حجب هذه الصفحة عنك لأنك لا تملك صلاحية «الحجوزات — إنشاء».
            راجع مدير النظام لمنحك الصلاحية، أو عُد إلى قائمة الحجوزات.
          </>
        }
        backHref="/reservations"
        backLabel="العودة إلى الحجوزات"
      />
    );
  }

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

      {backdated && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm flex items-start gap-2">
          <History size={18} className="shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold">وضع التسجيل بأثر رجعي مُفعّل</div>
            <div className="text-amber-700">
              سيتم نشر القيود المحاسبية (الإيراد والدفعة) على تاريخ الدخول المُدخل، وليس تاريخ اليوم.
              إذا كانت الفترة المحاسبية لذلك الشهر مقفلة، ستحتاج لفتحها أولاً من
              <Link href="/accounting/periods" className="underline font-medium mx-1">صفحة الفترات المحاسبية</Link>
              ثم إعادة المحاولة.
            </div>
          </div>
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
              {selectedUnit?.unitTypeRef && (
                <p className="text-xs text-gray-500 mt-1 truncate">
                  {selectedUnit.unitTypeRef.nameAr}
                </p>
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

          {selectedType && (
            <div className="mt-4 bg-gold-soft/40 border border-gold/20 rounded-lg p-3 space-y-2">
              <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="flex items-center gap-1.5 text-gray-700">
                  <UsersIcon size={14} className="text-primary-light" />
                  السعة: <b>{selectedType.maxOccupancy}</b>
                  <span className="text-gray-400">·</span>
                  بالغون: <b>{selectedType.maxAdults}</b>
                </span>
                {selectedType.hasKitchen && (
                  <span className="text-xs bg-white text-gray-600 px-2 py-0.5 rounded">
                    مطبخ
                  </span>
                )}
                {selectedType.hasBalcony && (
                  <span className="text-xs bg-white text-gray-600 px-2 py-0.5 rounded">
                    شرفة
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {selectedType.rooms.map((room) => (
                  <div key={room.id} className="text-xs">
                    <span className="font-medium text-gray-700">{room.nameAr}:</span>{" "}
                    {room.beds.length === 0 ? (
                      <span className="text-gray-400">بلا سرير</span>
                    ) : (
                      <span className="text-gray-600 inline-flex items-center gap-2 flex-wrap">
                        {room.beds.map((b) => (
                          <span
                            key={b.id}
                            className="inline-flex items-center gap-1"
                          >
                            <BedIcon
                              bedType={b.bedType}
                              size={11}
                              className="text-primary-light"
                            />
                            {b.count > 1 ? `${b.count}× ` : ""}
                            {(
                              {
                                single: "مفرد",
                                double: "مزدوج",
                                queen: "Queen",
                                king: "King",
                                sofa_bed: "كنبة سرير",
                                bunk_bed: "طابقين",
                                crib: "أطفال",
                                arabic_floor_seating: "جلسة عربية",
                              } as Record<string, string>
                            )[b.bedType] ?? b.bedType}
                            {b.sleepsExtra && (
                              <span className="text-[10px] text-green-600">
                                (نوم إضافي)
                              </span>
                            )}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {overCapacity && selectedType && (
            <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                عدد الضيوف ({numGuests}) يتجاوز السعة القصوى لهذا النوع ({selectedType.maxOccupancy}).
              </span>
            </div>
          )}
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
              <CountrySelect
                value={guestNationality}
                onValueChange={setGuestNationality}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">رقم الهاتف</label>
              <PhoneInput
                value={phone}
                onValueChange={setPhone}
                dialCode={phoneDialCode}
                onDialCodeChange={setPhoneDialCode}
                placeholder="07XXXXXXXX"
                className="w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">عدد الضيوف</label>
              <NumberInput
                min={1}
                max={20}
                value={numGuests}
                onValueChange={setNumGuests}
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
              <div className="flex gap-2">
                <div className="flex-1">
                  <BookedDatePicker
                    value={checkIn}
                    onChange={setCheckIn}
                    blockedRanges={unitBlockedRanges}
                    maintenance={unitMaintenance}
                    allowPastDates={backdated}
                    unavailableReason={
                      unitMaintenance
                        ? "الوحدة تحت الصيانة — حرّرها أولاً من لوحة الغرف"
                        : undefined
                    }
                    placeholder={unitId ? "اختر تاريخ الدخول" : "اختر الوحدة أولاً"}
                    disabled={!unitId}
                  />
                </div>
                <input
                  type="time"
                  value={checkInTime}
                  onChange={(e) => setCheckInTime(e.target.value)}
                  className="w-28 px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                  title="وقت الدخول"
                />
              </div>

              <label className="flex items-start gap-2 mt-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={backdated}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setBackdated(next);
                    if (!next && isBackdatedSelection) {
                      setCheckIn(new Date().toISOString().split("T")[0]);
                    }
                  }}
                  className="mt-0.5 w-4 h-4 accent-primary"
                />
                <span className="text-xs text-gray-700 leading-snug">
                  <span className="flex items-center gap-1 font-medium">
                    <History size={12} className="text-amber-600" />
                    تسجيل بأثر رجعي (تاريخ دخول قديم)
                  </span>
                  <span className="text-gray-500">
                    استخدمه لتسجيل حجز تمّ فعلياً ولم يُدخَل بوقته. القيود المحاسبية ستُسجّل على التاريخ الفعلي.
                  </span>
                </span>
              </label>

              {backdated && isBackdatedSelection && derivedStatus && (
                <p className="text-xs text-amber-700 mt-1.5 flex items-center gap-1">
                  <History size={12} />
                  الحالة التلقائية عند الحفظ:{" "}
                  <b>
                    {derivedStatus === "completed"
                      ? "مكتمل (مغادر)"
                      : derivedStatus === "active"
                      ? "نشط"
                      : "قادم"}
                  </b>
                </p>
              )}

              {rangeConflict && (
                <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  يتعارض التاريخ مع حجز سابق
                  {rangeConflict.guestName ? ` لصالح ${rangeConflict.guestName}` : ""}
                  {" — اختر تاريخاً آخر أو قلّص الليالي"}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">
                عدد {stayLabel === "ليلة" ? "الليالي" : stayLabel === "أسبوع" ? "الأسابيع" : "الأشهر"}
              </label>
              <NumberInput
                min={1}
                value={numNights}
                onValueChange={setNumNights}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">تاريخ الخروج</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={checkOut}
                  readOnly
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 text-sm cursor-not-allowed"
                />
                <input
                  type="time"
                  value={checkOutTime}
                  onChange={(e) => setCheckOutTime(e.target.value)}
                  className="w-28 px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                  title="وقت الخروج"
                />
              </div>
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

        {/* بيانات الضيوف */}
        <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-700 flex items-center gap-2">
              <div className="w-1 h-6 bg-primary rounded-full" />
              بيانات الضيوف
            </h2>
            <button
              type="button"
              onClick={() => setNumGuests((n) => Math.min(20, n + 1))}
              className="flex items-center gap-1 text-sm text-primary hover:text-primary-dark font-medium"
            >
              <UserPlus size={16} />
              إضافة ضيف
            </button>
          </div>

          <div className="space-y-4">
            {guests.map((guest, idx) => (
              <div key={idx} className="border border-gray-100 rounded-lg p-4 bg-gray-50/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-500">
                    الضيف {idx + 1} {idx === 0 && "(المستأجر)"}
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
                  <CountrySelect
                    value={guest.nationality}
                    onValueChange={(v) => updateGuest(idx, "nationality", v)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm bg-white"
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
