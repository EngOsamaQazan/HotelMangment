"use client";

import { useEffect, useState, useCallback } from "react";
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
  CalendarPlus,
  LogIn,
  LogOut,
  Ban,
  UserX,
  RotateCcw,
  History,
  CheckCircle2,
  Clock,
  Undo2,
} from "lucide-react";
import { NumberInput } from "@/components/ui/NumberInput";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { Can } from "@/components/Can";
import { WhatsAppQuickSendButton } from "@/components/whatsapp/QuickSendButton";
import { UserAvatar } from "@/components/tasks/shared";
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

  // Operational timestamps
  actualCheckInAt: string | null;
  actualCheckOutAt: string | null;
  noShow: boolean;
  noShowAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  statusLogs?: StatusLogEntry[];
}

interface StatusLogEntry {
  id: number;
  fromStatus: string;
  toStatus: string;
  action: string;
  reason: string | null;
  at: string;
  actor: {
    id: number;
    name: string;
    email: string;
    avatarUrl?: string | null;
  } | null;
}

interface ExtensionEntry {
  id: number;
  additionalNights: number;
  stayType: string;
  addedAmount: number | string;
  addedPaid: number | string;
  paymentMethod: string | null;
  note: string | null;
  previousCheckOut: string;
  newCheckOut: string;
  previousNumNights: number;
  newNumNights: number;
  previousStatus: string;
  createdAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
  createdBy: { id: number; name: string; avatarUrl?: string | null } | null;
  reversedBy: { id: number; name: string; avatarUrl?: string | null } | null;
}

const STATUS_LOG_ACTION_LABELS: Record<string, string> = {
  check_in: "تسجيل دخول",
  check_out: "تسجيل مغادرة",
  cancel: "إلغاء",
  no_show: "عدم حضور",
  reopen: "إعادة فتح",
  extend: "تمديد",
  reverse_extend: "عكس تمديد",
  edit: "تعديل مالي",
  auto_activate: "تفعيل تلقائي",
  auto_complete: "إنهاء تلقائي",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  upcoming: "bg-blue-100 text-blue-800",
  completed: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-800",
};

/**
 * Extension is allowed when:
 *   • status is `active` or `upcoming`, OR
 *   • status is `completed` AND the check-out date is today (same calendar
 *     day) — this covers the "الضيف قرر يكمّل بعد ما خرج" case, before the
 *     accounting period closes.
 */
function canExtendReservation(r: { status: string; checkOut: string }): boolean {
  if (r.status === "active" || r.status === "upcoming") return true;
  if (r.status !== "completed") return false;
  const co = new Date(r.checkOut);
  if (Number.isNaN(co.getTime())) return false;
  co.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return co.getTime() === today.getTime();
}

/** Extract `HH:mm` from an ISO string, falling back to `fallback`. */
function extractHHMM(iso: string, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function ReservationDetailClient({ id }: { id: string }) {
  const router = useRouter();

  const [reservation, setReservation] = useState<ReservationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Extend reservation state
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState("");
  const [extendNights, setExtendNights] = useState(1);
  const [extendAmount, setExtendAmount] = useState<string>("");
  const [extendPaid, setExtendPaid] = useState<string>("0");
  const [extendPaymentMethod, setExtendPaymentMethod] = useState("cash");

  // Edit form state
  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("");
  const [numGuests, setNumGuests] = useState(1);
  const [stayType, setStayType] = useState("daily");
  const [checkIn, setCheckIn] = useState("");
  const [checkInTime, setCheckInTime] = useState("14:00");
  const [checkOutTime, setCheckOutTime] = useState("12:00");
  const [numNights, setNumNights] = useState(1);
  const [unitPrice, setUnitPrice] = useState("");
  const [paidAmount, setPaidAmount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [guests, setGuests] = useState<GuestData[]>([]);

  // Status-change action state ------------------------------------------
  // All reservation state transitions go through dedicated action
  // endpoints (check-in / check-out / cancel / no-show / reopen) — never
  // through the edit form. These modals collect the reason / confirmation
  // required by each action and submit to the matching API.
  const [actionBusy, setActionBusy] = useState<null | string>(null);
  const [actionError, setActionError] = useState("");
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [checkinNote, setCheckinNote] = useState("");
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutNote, setCheckoutNote] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showNoShowModal, setShowNoShowModal] = useState(false);
  const [noShowReason, setNoShowReason] = useState("");
  const [noShowKeepCharge, setNoShowKeepCharge] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  // ---- Extensions history + reverse (undo) ----
  const [extensions, setExtensions] = useState<ExtensionEntry[]>([]);
  const [extensionsLoading, setExtensionsLoading] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<ExtensionEntry | null>(
    null,
  );
  const [reverseReason, setReverseReason] = useState("");
  const [reversing, setReversing] = useState(false);
  const [reverseError, setReverseError] = useState("");

  const fetchExtensions = useCallback(async () => {
    setExtensionsLoading(true);
    try {
      const res = await fetch(`/api/reservations/${id}/extensions`);
      if (!res.ok) throw new Error("Failed");
      const data: { extensions: ExtensionEntry[] } = await res.json();
      setExtensions(data.extensions || []);
    } catch {
      setExtensions([]);
    } finally {
      setExtensionsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchExtensions();
  }, [fetchExtensions]);

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
    // Preserve the HH:mm portion of stored DateTimes when editing.
    setCheckInTime(extractHHMM(r.checkIn, "14:00"));
    setCheckOutTime(extractHHMM(r.checkOut, "12:00"));
    setNumNights(r.numNights);
    setUnitPrice(String(r.unitPrice));
    setPaidAmount(String(r.paidAmount));
    setPaymentMethod(r.paymentMethod || "cash");
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
      const checkInIso = `${checkIn}T${checkInTime || "14:00"}:00`;
      const checkOutIso = `${checkOut}T${checkOutTime || "12:00"}:00`;

      const body = {
        guestName: guestName.trim(),
        phone: phone.trim() || null,
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

  const openExtendModal = () => {
    if (!reservation) return;
    const nightlyRate = Number(reservation.unitPrice) || 0;
    setExtendNights(1);
    setExtendAmount((nightlyRate * 1).toFixed(2));
    setExtendPaid("0");
    setExtendPaymentMethod(reservation.paymentMethod || "cash");
    setExtendError("");
    setShowExtendModal(true);
  };

  const handleExtendNightsChange = (n: number) => {
    setExtendNights(n);
    if (reservation) {
      const rate = Number(reservation.unitPrice) || 0;
      setExtendAmount((rate * Math.max(1, n)).toFixed(2));
    }
  };

  const handleSubmitExtend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reservation) return;
    if (extendNights <= 0) {
      setExtendError("أدخل عدد ليالي التمديد");
      return;
    }
    setExtending(true);
    setExtendError("");
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          additionalNights: extendNights,
          additionalAmount: extendAmount ? Number(extendAmount) : undefined,
          additionalPaid: extendPaid ? Number(extendPaid) : 0,
          paymentMethod: extendPaymentMethod,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "فشل تمديد الحجز");
      }
      const data = await res.json();
      if (data?.reservation) {
        setReservation(data.reservation);
        populateForm(data.reservation);
      } else {
        await fetchReservation();
      }
      await fetchExtensions();
      setShowExtendModal(false);
    } catch (err) {
      setExtendError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setExtending(false);
    }
  };

  const openReverseModal = (ext: ExtensionEntry) => {
    setReverseTarget(ext);
    setReverseReason("");
    setReverseError("");
  };

  const handleSubmitReverse = async () => {
    if (!reverseTarget) return;
    if (!reverseReason.trim()) {
      setReverseError("يرجى إدخال سبب عكس التمديد");
      return;
    }
    setReversing(true);
    setReverseError("");
    try {
      const res = await fetch(
        `/api/reservations/${id}/extensions/${reverseTarget.id}/reverse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reverseReason.trim() }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "تعذّر عكس التمديد");
      }
      await fetchReservation();
      await fetchExtensions();
      setReverseTarget(null);
      setReverseReason("");
    } catch (err) {
      setReverseError(
        err instanceof Error ? err.message : "حدث خطأ غير متوقع",
      );
    } finally {
      setReversing(false);
    }
  };

  /**
   * Generic wrapper for the five status-change endpoints. Keeps the
   * error / busy / modal-dismissal logic in one place so individual
   * handlers stay declarative.
   */
  const performStatusAction = useCallback(
    async (
      action:
        | "checkin"
        | "checkout"
        | "cancel"
        | "no-show"
        | "reopen",
      body: Record<string, unknown>,
      onSuccess?: () => void,
    ) => {
      setActionBusy(action);
      setActionError("");
      try {
        const res = await fetch(
          `/api/reservations/${id}/${action}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "تعذّر تنفيذ الإجراء");
        }
        // Reload full reservation + audit log.
        await fetchReservation();
        onSuccess?.();
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "حدث خطأ غير متوقع",
        );
      } finally {
        setActionBusy(null);
      }
    },
    [id, fetchReservation],
  );

  const handleCheckin = () =>
    performStatusAction(
      "checkin",
      { note: checkinNote.trim() || undefined },
      () => {
        setShowCheckinModal(false);
        setCheckinNote("");
      },
    );

  const handleCheckout = () =>
    performStatusAction(
      "checkout",
      { note: checkoutNote.trim() || undefined },
      () => {
        setShowCheckoutModal(false);
        setCheckoutNote("");
      },
    );

  const handleCancelReservation = () => {
    if (!cancelReason.trim()) {
      setActionError("يرجى إدخال سبب الإلغاء");
      return;
    }
    return performStatusAction(
      "cancel",
      { reason: cancelReason.trim() },
      () => {
        setShowCancelModal(false);
        setCancelReason("");
      },
    );
  };

  const handleNoShow = () =>
    performStatusAction(
      "no-show",
      {
        reason: noShowReason.trim() || undefined,
        keepCharge: noShowKeepCharge,
      },
      () => {
        setShowNoShowModal(false);
        setNoShowReason("");
        setNoShowKeepCharge(false);
      },
    );

  const handleReopen = () => {
    if (!reopenReason.trim()) {
      setActionError("يرجى إدخال سبب إعادة الفتح");
      return;
    }
    return performStatusAction(
      "reopen",
      { reason: reopenReason.trim() },
      () => {
        setShowReopenModal(false);
        setReopenReason("");
      },
    );
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/reservations"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowRight size={20} className="text-gray-600" />
          </Link>
          <CalendarCheck className="text-primary" size={28} />
          <h1 className="text-2xl font-bold text-primary">
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
        <div className="flex flex-wrap items-center gap-2">
          {!editing && (
            <>
              {/* ===== Front-desk lifecycle actions ===== */}
              {/* Each button is a single, auditable transition. No silent
                  status flips — every click writes a row to the audit log. */}
              {reservation.status === "upcoming" && (
                <>
                  <Can permission="reservations:checkin">
                    <button
                      onClick={() => {
                        setActionError("");
                        setShowCheckinModal(true);
                      }}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                      title="تسجيل حضور الضيف"
                    >
                      <LogIn size={16} />
                      تسجيل دخول
                    </button>
                  </Can>
                  <Can permission="reservations:noshow">
                    <button
                      onClick={() => {
                        setActionError("");
                        setShowNoShowModal(true);
                      }}
                      className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                      title="الضيف لم يحضر"
                    >
                      <UserX size={16} />
                      عدم حضور
                    </button>
                  </Can>
                </>
              )}
              {reservation.status === "active" && (
                <Can permission="reservations:checkout">
                  <button
                    onClick={() => {
                      setActionError("");
                      setShowCheckoutModal(true);
                    }}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                    title="تسجيل مغادرة الضيف"
                  >
                    <LogOut size={16} />
                    تسجيل مغادرة
                  </button>
                </Can>
              )}
              {(reservation.status === "upcoming" ||
                reservation.status === "active") && (
                <Can permission="reservations:cancel">
                  <button
                    onClick={() => {
                      setActionError("");
                      setShowCancelModal(true);
                    }}
                    className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                    title="إلغاء الحجز"
                  >
                    <Ban size={16} />
                    إلغاء
                  </button>
                </Can>
              )}
              {reservation.status === "completed" && (
                <Can permission="reservations:reopen">
                  <button
                    onClick={() => {
                      setActionError("");
                      setShowReopenModal(true);
                    }}
                    className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                    title="إعادة فتح الحجز (يتطلب صلاحية مدير)"
                  >
                    <RotateCcw size={16} />
                    إعادة فتح
                  </button>
                </Can>
              )}

              {canExtendReservation(reservation) && (
                <Can permission="reservations:extend">
                  <button
                    onClick={openExtendModal}
                    className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                    title={
                      reservation.status === "completed"
                        ? "إعادة تفعيل وتمديد حجز انتهى اليوم"
                        : "تمديد الحجز"
                    }
                  >
                    <CalendarPlus size={16} />
                    {reservation.status === "completed"
                      ? "إعادة تفعيل وتمديد"
                      : "تمديد الحجز"}
                  </button>
                </Can>
              )}
              <Can permission="reservations:edit">
                <button
                  onClick={handleStartEdit}
                  className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                >
                  <Pencil size={16} />
                  تعديل
                </button>
              </Can>
              <Can permission="reservations:print">
                <Link
                  href={`/reservations/${reservation.id}/contract`}
                  className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                >
                  <FileText size={16} />
                  طباعة العقد
                </Link>
              </Can>
              <Can permission="reservations:delete">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                >
                  <Trash2 size={16} />
                  حذف
                </button>
              </Can>
            </>
          )}
        </div>
      </div>

      {actionError && !editing && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {actionError}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl p-4 sm:p-6 max-w-sm w-full">
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

      {/* Check-in modal */}
      {showCheckinModal && (
        <ActionModal
          icon={<LogIn className="text-emerald-600" size={20} />}
          iconBg="bg-emerald-100"
          title={`تسجيل دخول — حجز #${reservation.id}`}
          description="سيتم تحديث حالة الحجز إلى «ساري» وتحويل الوحدة إلى «مشغولة»، مع تسجيل الإجراء في السجل الرسمي."
          confirmLabel="تأكيد الحضور"
          confirmClass="bg-emerald-600 hover:bg-emerald-700"
          busy={actionBusy === "checkin"}
          error={actionError}
          onConfirm={handleCheckin}
          onClose={() => {
            if (actionBusy) return;
            setShowCheckinModal(false);
            setCheckinNote("");
            setActionError("");
          }}
        >
          <label className="block text-xs font-medium text-gray-600 mb-1">
            ملاحظة (اختياري)
          </label>
          <textarea
            value={checkinNote}
            onChange={(e) => setCheckinNote(e.target.value)}
            rows={2}
            placeholder="مثل: تأخر الضيف ٣ ساعات، عنده مرافق إضافي..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-none"
          />
        </ActionModal>
      )}

      {/* Check-out modal */}
      {showCheckoutModal && (
        <ActionModal
          icon={<LogOut className="text-indigo-600" size={20} />}
          iconBg="bg-indigo-100"
          title={`تسجيل مغادرة — حجز #${reservation.id}`}
          description="سيتم تحديث حالة الحجز إلى «منتهي» وإرسال الوحدة إلى الصيانة لتنظيفها."
          confirmLabel="تأكيد المغادرة"
          confirmClass="bg-indigo-600 hover:bg-indigo-700"
          busy={actionBusy === "checkout"}
          error={actionError}
          onConfirm={handleCheckout}
          onClose={() => {
            if (actionBusy) return;
            setShowCheckoutModal(false);
            setCheckoutNote("");
            setActionError("");
          }}
        >
          <label className="block text-xs font-medium text-gray-600 mb-1">
            ملاحظة (اختياري)
          </label>
          <textarea
            value={checkoutNote}
            onChange={(e) => setCheckoutNote(e.target.value)}
            rows={2}
            placeholder="مثل: تمت تسوية المتبقي نقداً، لم يعد مفاتيح إضافية..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-none"
          />
        </ActionModal>
      )}

      {/* Cancel modal */}
      {showCancelModal && (
        <ActionModal
          icon={<Ban className="text-rose-600" size={20} />}
          iconBg="bg-rose-100"
          title={`إلغاء حجز #${reservation.id}`}
          description="سيتم إلغاء الحجز وعكس قيوده المحاسبية (قيد عكسي مرتبط بالقيد الأصلي)."
          confirmLabel="تأكيد الإلغاء"
          confirmClass="bg-rose-600 hover:bg-rose-700"
          busy={actionBusy === "cancel"}
          error={actionError}
          onConfirm={handleCancelReservation}
          onClose={() => {
            if (actionBusy) return;
            setShowCancelModal(false);
            setCancelReason("");
            setActionError("");
          }}
        >
          <label className="block text-xs font-medium text-gray-600 mb-1">
            سبب الإلغاء <span className="text-red-500">*</span>
          </label>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            placeholder="مثل: طلب الضيف الإلغاء، تعارض في التواريخ..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-none"
          />
        </ActionModal>
      )}

      {/* No-show modal */}
      {showNoShowModal && (
        <ActionModal
          icon={<UserX className="text-orange-600" size={20} />}
          iconBg="bg-orange-100"
          title={`تسجيل عدم حضور — حجز #${reservation.id}`}
          description="هذا الخيار متاح فقط قبل تسجيل الدخول. سيتم إلغاء الحجز مع الإشارة إلى عدم الحضور في السجل."
          confirmLabel="تسجيل عدم الحضور"
          confirmClass="bg-orange-600 hover:bg-orange-700"
          busy={actionBusy === "no-show"}
          error={actionError}
          onConfirm={handleNoShow}
          onClose={() => {
            if (actionBusy) return;
            setShowNoShowModal(false);
            setNoShowReason("");
            setNoShowKeepCharge(false);
            setActionError("");
          }}
        >
          <label className="block text-xs font-medium text-gray-600 mb-1">
            ملاحظة (اختياري)
          </label>
          <textarea
            value={noShowReason}
            onChange={(e) => setNoShowReason(e.target.value)}
            rows={2}
            placeholder="مثل: اتصلنا ولم يرد، إلغاء متأخر..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-none"
          />
          <label className="flex items-start gap-2 mt-3 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={noShowKeepCharge}
              onChange={(e) => setNoShowKeepCharge(e.target.checked)}
              className="mt-0.5 accent-orange-600"
            />
            <span>
              الإبقاء على قيمة الحجز محاسبياً (عربون غير مستردّ) — بدون
              تفعيل هذا الخيار سيتم عكس القيود بالكامل.
            </span>
          </label>
        </ActionModal>
      )}

      {/* Reopen modal (manager only) */}
      {showReopenModal && (
        <ActionModal
          icon={<RotateCcw className="text-slate-600" size={20} />}
          iconBg="bg-slate-100"
          title={`إعادة فتح حجز #${reservation.id}`}
          description="إجراء محجوز للمدير. سيتم إرجاع الحجز إلى «ساري» وإرجاع الوحدة إلى «مشغولة». يُكتب السبب في السجل."
          confirmLabel="تأكيد إعادة الفتح"
          confirmClass="bg-slate-700 hover:bg-slate-800"
          busy={actionBusy === "reopen"}
          error={actionError}
          onConfirm={handleReopen}
          onClose={() => {
            if (actionBusy) return;
            setShowReopenModal(false);
            setReopenReason("");
            setActionError("");
          }}
        >
          <label className="block text-xs font-medium text-gray-600 mb-1">
            سبب إعادة الفتح <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            rows={3}
            placeholder="مثل: تم إنهاء الحجز عن طريق الخطأ، الضيف ما زال في الغرفة..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-none"
          />
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
            ملاحظة: سيظل القيد المحاسبي للحجز كما هو. إذا احتجت إضافة
            ليالٍ جديدة استخدم «تمديد الحجز» بعد إعادة الفتح.
          </p>
        </ActionModal>
      )}

      {/* Extend reservation modal */}
      {showExtendModal && reservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSubmitExtend}
            className="bg-white rounded-xl shadow-xl p-5 sm:p-6 max-w-lg w-full space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-full">
                  <CalendarPlus className="text-emerald-600" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">
                    {reservation.status === "completed"
                      ? `إعادة تفعيل وتمديد الحجز #${reservation.id}`
                      : `تمديد الحجز #${reservation.id}`}
                  </h3>
                  {reservation.status === "completed" && (
                    <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 mt-1 inline-block">
                      الحجز منتهٍ اليوم — التمديد سيُعيد تفعيله ويضع الوحدة «مشغولة» مجدداً.
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    الخروج الحالي:{" "}
                    <span className="font-medium">
                      {formatDate(reservation.checkOut)}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !extending && setShowExtendModal(false)}
                className="p-1.5 rounded hover:bg-gray-100"
                aria-label="إغلاق"
              >
                <X size={16} />
              </button>
            </div>

            {extendError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
                {extendError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  عدد{" "}
                  {reservation.stayType === "monthly"
                    ? "الأشهر"
                    : reservation.stayType === "weekly"
                    ? "الأسابيع"
                    : "الليالي"}{" "}
                  الإضافية
                </label>
                <NumberInput
                  min={1}
                  value={extendNights}
                  onValueChange={handleExtendNightsChange}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  المبلغ الإضافي
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={extendAmount}
                  onChange={(e) => setExtendAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  المعدّل اليومي: {formatAmount(reservation.unitPrice)}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  دفعة عند التمديد (اختياري)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={extendPaid}
                  onChange={(e) => setExtendPaid(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  طريقة الدفع
                </label>
                <select
                  value={extendPaymentMethod}
                  onChange={(e) => setExtendPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                >
                  <option value="cash">نقدي</option>
                  <option value="bank">تحويل بنكي</option>
                  <option value="transfer">تحويل</option>
                </select>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 space-y-1">
              <div className="flex items-center justify-between">
                <span>إجمالي الحجز بعد التمديد:</span>
                <span className="font-bold">
                  {formatAmount(
                    (Number(reservation.totalAmount) + Number(extendAmount || 0)).toFixed(2),
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>المدفوع بعد التمديد:</span>
                <span className="font-bold">
                  {formatAmount(
                    (Number(reservation.paidAmount) + Number(extendPaid || 0)).toFixed(2),
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>المتبقي بعد التمديد:</span>
                <span className="font-bold">
                  {formatAmount(
                    (
                      Number(reservation.totalAmount) +
                      Number(extendAmount || 0) -
                      (Number(reservation.paidAmount) + Number(extendPaid || 0))
                    ).toFixed(2),
                  )}
                </span>
              </div>
              <p className="text-[11px] text-emerald-700 pt-1 border-t border-emerald-200">
                سيتم إصدار قيد محاسبي منفصل لمبلغ التمديد دون المساس بقيود الحجز الأصلي (مطابق لـ IAS 8 / SOX).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={extending}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg transition-colors font-medium disabled:opacity-50"
              >
                {extending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CalendarPlus size={16} />
                )}
                {extending ? "جاري التمديد..." : "تأكيد التمديد"}
              </button>
              <button
                type="button"
                onClick={() => setShowExtendModal(false)}
                disabled={extending}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
              >
                إلغاء
              </button>
            </div>
          </form>
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
                <NumberInput
                  min={1}
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
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                  />
                  <input
                    type="time"
                    value={checkInTime}
                    onChange={(e) => setCheckInTime(e.target.value)}
                    className="w-28 px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                    title="وقت الدخول"
                  />
                </div>
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
                  value={numNights}
                  readOnly
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 text-sm cursor-not-allowed"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  لإضافة ليالٍ استخدم زر{" "}
                  <span className="font-semibold text-primary">تمديد الحجز</span>{" "}
                  (للحفاظ على سجل القيود المحاسبية).
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">
                  تاريخ الخروج
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={checkOut}
                    readOnly
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-sm cursor-not-allowed"
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
                <div className="w-full px-4 py-2.5 border border-dashed border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-500 flex items-center justify-between">
                  <span>
                    {statusLabels[reservation?.status || "active"] ||
                      reservation?.status}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    تُحدَّد تلقائياً حسب إجراءات الاستقبال
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  الحالة لا تُعدَّل من شاشة التعديل — استخدم أزرار
                  «تسجيل دخول / مغادرة / إلغاء / عدم حضور» أعلى الصفحة
                  لضمان تسجيل إجراءات الموظف في السجل الرسمي (IFRS /
                  ISO 27001).
                </p>
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

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Save size={18} />
              )}
              {submitting ? "جاري الحفظ..." : "حفظ التعديلات"}
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="flex items-center gap-2 px-6 py-3 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors font-medium"
            >
              <X size={18} />
              إلغاء التعديل
            </button>
          </div>
        </form>
      ) : (
        /* ===== VIEW MODE ===== */
        <div className="space-y-6">
          {/* ===== Front-desk state summary ===== */}
          <FrontDeskSummary reservation={reservation} />

          {/* بيانات الحجز الأساسية */}
          <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
              <div className="w-1 h-6 bg-primary rounded-full" />
              بيانات الحجز
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-5 gap-x-8">
              <DetailRow label="اسم الضيف" value={reservation.guestName} />
              <div>
                <dt className="text-xs font-medium text-gray-400 mb-1">
                  رقم الهاتف
                </dt>
                <dd className="text-sm font-medium text-gray-800 flex items-center gap-2 flex-wrap">
                  <span className="direction-ltr">
                    {reservation.phone || "—"}
                  </span>
                  {reservation.phone && (
                    <WhatsAppQuickSendButton
                      phone={reservation.phone}
                      reservationId={reservation.id}
                      variant="pill"
                      defaultText={`مرحبًا ${reservation.guestName}،`}
                    />
                  )}
                </dd>
              </div>
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
                value={`${formatDate(reservation.checkIn)} - ${extractHHMM(reservation.checkIn, "14:00")}`}
              />
              <DetailRow
                label="تاريخ الخروج"
                value={`${formatDate(reservation.checkOut)} - ${extractHHMM(reservation.checkOut, "12:00")}`}
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
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
            <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-3 sm:p-6">
              <h2 className="text-base sm:text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                <div className="w-1 h-6 bg-primary rounded-full" />
                النزلاء ({reservation.guests.length})
              </h2>
              <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
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

          {/* ===== Extensions history (with undo) ===== */}
          <ExtensionsHistory
            loading={extensionsLoading}
            extensions={extensions}
            onReverse={openReverseModal}
          />

          {/* ===== Audit log / status timeline ===== */}
          <StatusTimeline logs={reservation.statusLogs ?? []} />
        </div>
      )}

      {/* ===== Reverse-extension modal ===== */}
      {reverseTarget && (
        <ActionModal
          icon={<Undo2 size={18} className="text-rose-600" />}
          iconBg="bg-rose-50"
          title="عكس تمديد الحجز"
          description="سيتم إلغاء هذا التمديد ماليًا ومحاسبيًا وإعادة الحجز إلى وضعه قبل التمديد. هذا الإجراء مُسجَّل في السجل ولا يمكن التراجع عنه إلا بتمديد جديد."
          confirmLabel="تأكيد العكس"
          confirmClass="bg-rose-600 hover:bg-rose-700"
          busy={reversing}
          error={reverseError}
          onConfirm={handleSubmitReverse}
          onClose={() => {
            if (!reversing) {
              setReverseTarget(null);
              setReverseReason("");
              setReverseError("");
            }
          }}
        >
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
              <p>
                <span className="font-semibold">عدد الليالي المُلغاة:</span>{" "}
                {reverseTarget.additionalNights}{" "}
                {reverseTarget.stayType === "monthly"
                  ? "شهر"
                  : reverseTarget.stayType === "weekly"
                    ? "أسبوع"
                    : "ليلة"}
              </p>
              <p>
                <span className="font-semibold">المبلغ الذي سيُعاد:</span>{" "}
                {Number(reverseTarget.addedAmount).toFixed(2)}
                {Number(reverseTarget.addedPaid) > 0 && (
                  <>
                    {" "}— <span className="font-semibold">دفعة مُلغاة:</span>{" "}
                    {Number(reverseTarget.addedPaid).toFixed(2)}
                  </>
                )}
              </p>
              <p>
                <span className="font-semibold">موعد الخروج سيعود إلى:</span>{" "}
                {formatDate(reverseTarget.previousCheckOut)}
              </p>
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">
                سبب العكس (إلزامي)
              </span>
              <textarea
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                rows={3}
                placeholder="مثلاً: تمديد خاطئ، الضيف لم يوافق، عدد ليالٍ غير صحيح…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
              />
            </label>
          </div>
        </ActionModal>
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

/** Generic confirm modal used by the 5 status-change actions. */
function ActionModal({
  icon,
  iconBg,
  title,
  description,
  confirmLabel,
  confirmClass,
  busy,
  error,
  onConfirm,
  onClose,
  children,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass: string;
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl p-5 sm:p-6 max-w-lg w-full space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-full", iconBg)}>{icon}</div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">{title}</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50"
            aria-label="إغلاق"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
            {error}
          </div>
        )}

        <div>{children}</div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 text-white py-2.5 rounded-lg transition-colors font-medium disabled:opacity-50",
              confirmClass,
            )}
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            {busy ? "جارٍ..." : confirmLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

/** At-a-glance panel showing arrival / departure / no-show status. */
function FrontDeskSummary({ reservation }: { reservation: ReservationData }) {
  const fmtDT = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString("ar", {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const arrival = fmtDT(reservation.actualCheckInAt);
  const departure = fmtDT(reservation.actualCheckOutAt);
  const noShowTs = fmtDT(reservation.noShowAt);
  const cancelledTs = fmtDT(reservation.cancelledAt);

  const scheduledCheckIn = new Date(reservation.checkIn);
  const scheduledOk = !Number.isNaN(scheduledCheckIn.getTime());
  const isLate =
    scheduledOk &&
    arrival &&
    new Date(reservation.actualCheckInAt as string).getTime() >
      scheduledCheckIn.getTime();

  return (
    <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-5">
      <h2 className="text-base font-bold text-gray-700 mb-3 flex items-center gap-2">
        <div className="w-1 h-5 bg-primary rounded-full" />
        حالة الاستقبال
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatusTile
          title="وصول الضيف"
          status={
            reservation.noShow
              ? "missed"
              : arrival
                ? "done"
                : reservation.status === "cancelled"
                  ? "cancelled"
                  : "pending"
          }
          main={
            reservation.noShow
              ? "لم يحضر"
              : arrival || "لم يُسجَّل بعد"
          }
          sub={
            reservation.noShow
              ? noShowTs
                ? `سُجّل في ${noShowTs}`
                : null
              : arrival
                ? isLate
                  ? "تأخر عن الموعد المحدد"
                  : "في الموعد"
                : `الموعد المقرر: ${scheduledCheckIn.toLocaleString("ar", { dateStyle: "short", timeStyle: "short" })}`
          }
        />
        <StatusTile
          title="مغادرة الضيف"
          status={
            reservation.status === "completed" && departure
              ? "done"
              : reservation.status === "active"
                ? "pending"
                : reservation.status === "cancelled"
                  ? "cancelled"
                  : "idle"
          }
          main={
            departure ||
            (reservation.status === "active"
              ? "قيد الإقامة"
              : reservation.status === "cancelled"
                ? "—"
                : "لم تُسجَّل بعد")
          }
          sub={
            reservation.status === "completed" && departure
              ? "تم تسجيل الخروج"
              : reservation.status === "active"
                ? `الخروج المقرر: ${new Date(reservation.checkOut).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" })}`
                : null
          }
        />
        <StatusTile
          title="حالة الحجز"
          status={reservationStatusTone(reservation.status)}
          main={statusLabels[reservation.status] || reservation.status}
          sub={
            reservation.status === "cancelled" && reservation.cancellationReason
              ? `السبب: ${reservation.cancellationReason}${cancelledTs ? ` • ${cancelledTs}` : ""}`
              : null
          }
        />
      </div>
    </div>
  );
}

function reservationStatusTone(
  status: string,
): "done" | "pending" | "cancelled" | "idle" | "missed" {
  switch (status) {
    case "active":
      return "done";
    case "upcoming":
      return "pending";
    case "completed":
      return "idle";
    case "cancelled":
      return "cancelled";
    default:
      return "idle";
  }
}

function StatusTile({
  title,
  status,
  main,
  sub,
}: {
  title: string;
  status: "done" | "pending" | "cancelled" | "idle" | "missed";
  main: string;
  sub: string | null;
}) {
  const palette: Record<typeof status, string> = {
    done: "bg-emerald-50 border-emerald-200 text-emerald-800",
    pending: "bg-blue-50 border-blue-200 text-blue-800",
    cancelled: "bg-rose-50 border-rose-200 text-rose-800",
    missed: "bg-orange-50 border-orange-200 text-orange-800",
    idle: "bg-gray-50 border-gray-200 text-gray-700",
  };
  return (
    <div className={cn("rounded-lg border px-4 py-3", palette[status])}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
        {title}
      </p>
      <p className="text-sm font-bold mt-1 truncate" title={main}>
        {main}
      </p>
      {sub && <p className="text-[11px] opacity-80 mt-1">{sub}</p>}
    </div>
  );
}

/**
 * Extensions history panel. Lists every extension posted against the
 * reservation, most-recent first. The latest *non-reversed* extension
 * exposes a "Reverse" button — reversing out of LIFO order is rejected
 * by the API so we only show the button on that single row.
 */
function ExtensionsHistory({
  loading,
  extensions,
  onReverse,
}: {
  loading: boolean;
  extensions: ExtensionEntry[];
  onReverse: (ext: ExtensionEntry) => void;
}) {
  const latestReversibleId = (() => {
    const latest = extensions.find((e) => !e.reversedAt);
    return latest ? latest.id : null;
  })();

  if (loading && extensions.length === 0) {
    return (
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-700 mb-3 flex items-center gap-2">
          <div className="w-1 h-6 bg-primary rounded-full" />
          <CalendarPlus size={18} />
          سجل التمديدات
        </h2>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 size={16} className="animate-spin" />
          جاري التحميل...
        </div>
      </div>
    );
  }

  if (extensions.length === 0) return null;

  return (
    <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
        <div className="w-1 h-6 bg-primary rounded-full" />
        <CalendarPlus size={18} />
        سجل التمديدات ({extensions.length})
      </h2>
      <ul className="space-y-3">
        {extensions.map((ext) => {
          const reversed = Boolean(ext.reversedAt);
          const canReverse = !reversed && ext.id === latestReversibleId;
          const unitLabel =
            ext.stayType === "monthly"
              ? "شهر"
              : ext.stayType === "weekly"
                ? "أسبوع"
                : "ليلة";
          const created = new Date(ext.createdAt);
          const reversedAt = ext.reversedAt ? new Date(ext.reversedAt) : null;
          return (
            <li
              key={ext.id}
              className={cn(
                "border rounded-lg p-4",
                reversed
                  ? "border-rose-200 bg-rose-50/40"
                  : "border-gray-100 bg-gray-50/50",
              )}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-gray-800">
                      +{ext.additionalNights} {unitLabel}
                    </span>
                    <span className="text-xs text-gray-500">
                      ({formatDate(ext.previousCheckOut)} →{" "}
                      {formatDate(ext.newCheckOut)})
                    </span>
                    {reversed && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[11px] font-medium">
                        معكوس
                      </span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <p className="text-gray-400">مبلغ إضافي</p>
                      <p className="font-semibold text-gray-700">
                        {formatAmount(ext.addedAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">دفعة مستلمة</p>
                      <p className="font-semibold text-emerald-700">
                        {formatAmount(ext.addedPaid)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">الموظف</p>
                      <p className="font-medium text-gray-700 flex items-center gap-1.5">
                        {ext.createdBy ? (
                          <>
                            <UserAvatar user={ext.createdBy} size={18} />
                            <span>{ext.createdBy.name}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">التاريخ</p>
                      <p className="font-medium text-gray-700">
                        {Number.isNaN(created.getTime())
                          ? ext.createdAt
                          : created.toLocaleString("ar", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                      </p>
                    </div>
                  </div>
                  {ext.note && (
                    <p className="mt-2 text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
                      ملاحظة: {ext.note}
                    </p>
                  )}
                  {reversed && ext.reversalReason && (
                    <div className="mt-2 border-t border-rose-200 pt-2 text-xs text-rose-700 space-y-1">
                      <p>
                        <span className="font-semibold">سبب العكس:</span>{" "}
                        {ext.reversalReason}
                      </p>
                      <p className="text-[11px] text-rose-500 flex items-center gap-1 flex-wrap">
                        <span>
                          {reversedAt && !Number.isNaN(reversedAt.getTime())
                            ? reversedAt.toLocaleString("ar", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : ""}
                        </span>
                        {ext.reversedBy && (
                          <>
                            <span>•</span>
                            <UserAvatar user={ext.reversedBy} size={14} />
                            <span>{ext.reversedBy.name}</span>
                          </>
                        )}
                      </p>
                    </div>
                  )}
                </div>
                {canReverse && (
                  <Can permission="reservations:reverse_extend">
                    <button
                      type="button"
                      onClick={() => onReverse(ext)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
                      title="عكس هذا التمديد (للمدير فقط)"
                    >
                      <Undo2 size={14} />
                      عكس التمديد
                    </button>
                  </Can>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Chronological audit trail of every status change. */
function StatusTimeline({ logs }: { logs: StatusLogEntry[] }) {
  if (!logs.length) {
    return (
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-700 mb-3 flex items-center gap-2">
          <div className="w-1 h-6 bg-primary rounded-full" />
          <History size={18} />
          سجل الإجراءات
        </h2>
        <p className="text-sm text-gray-500">لا توجد إجراءات مسجّلة بعد.</p>
      </div>
    );
  }

  return (
    <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
        <div className="w-1 h-6 bg-primary rounded-full" />
        <History size={18} />
        سجل الإجراءات ({logs.length})
      </h2>
      <ol className="relative border-r-2 border-gray-100 pr-5 space-y-4">
        {logs.map((log) => {
          const ts = new Date(log.at);
          return (
            <li key={log.id} className="relative">
              <span className="absolute -right-[29px] top-1 w-4 h-4 rounded-full bg-primary/90 border-4 border-white shadow" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800">
                    {STATUS_LOG_ACTION_LABELS[log.action] || log.action}
                    {log.fromStatus !== log.toStatus && (
                      <span className="text-xs font-normal text-gray-500 mr-2">
                        {statusLabels[log.fromStatus] || log.fromStatus} →{" "}
                        <span className="font-medium text-gray-700">
                          {statusLabels[log.toStatus] || log.toStatus}
                        </span>
                      </span>
                    )}
                  </p>
                  {log.reason && (
                    <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap leading-relaxed">
                      {log.reason}
                    </p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1 flex-wrap">
                    <Clock size={11} />
                    <span>
                      {Number.isNaN(ts.getTime())
                        ? log.at
                        : ts.toLocaleString("ar", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                    </span>
                    {log.actor ? (
                      <>
                        <span>•</span>
                        <UserAvatar user={log.actor} size={14} />
                        <span>{log.actor.name}</span>
                      </>
                    ) : (
                      <span>• النظام</span>
                    )}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
