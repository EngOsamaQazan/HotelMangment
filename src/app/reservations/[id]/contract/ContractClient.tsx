"use client";

import { useEffect, useState } from "react";
import { numberToArabicWords } from "@/lib/utils";

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
  guestIdNumber: string | null;
  nationality: string | null;
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

const unitTypeLabel: Record<string, string> = {
  room: "غرفة فندقية",
  apartment: "شقة مفروشة",
};

const stayTypeLabel: Record<string, string> = {
  daily: "يومي",
  weekly: "أسبوعي",
  monthly: "شهري",
};

const stayDurationLabel: Record<string, string> = {
  daily: "ليلة",
  weekly: "أسبوع",
  monthly: "شهر",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function fmtAmount(a: string | number): string {
  const n = typeof a === "string" ? parseFloat(a) : a;
  return n.toFixed(2);
}

function contractNumber(id: number): string {
  return `FH-${String(id).padStart(4, "0")}`;
}

export default function ContractClient({ id }: { id: string }) {
  const [reservation, setReservation] = useState<ReservationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/reservations/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data: ReservationData) => setReservation(data))
      .catch(() => setReservation(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", fontFamily: "Tajawal, sans-serif" }}>
        <p style={{ fontSize: 18, color: "#666" }}>جاري تحميل العقد...</p>
      </div>
    );
  }

  if (!reservation) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", fontFamily: "Tajawal, sans-serif" }}>
        <p style={{ fontSize: 18, color: "#c00" }}>الحجز غير موجود</p>
      </div>
    );
  }

  const r = reservation;
  const paidNum = parseFloat(r.paidAmount);
  const remainingNum = parseFloat(r.remaining);
  const todayStr = fmtDate(new Date().toISOString());
  const uType = unitTypeLabel[r.unit.unitType] || r.unit.unitType;
  const sType = stayTypeLabel[r.stayType] || r.stayType;
  const sDuration = stayDurationLabel[r.stayType] || "ليلة";
  const pm = r.paymentMethod || "نقد";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&family=Amiri:wght@400;700&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        @page { size:A4; margin:8mm 10mm; }
        body { direction:rtl; }
        .contract-page { width:210mm; margin:5mm auto; padding:8mm 12mm; background:#fff; box-shadow:0 2px 15px rgba(0,0,0,0.15); font-family:'Tajawal','Arial',sans-serif; font-size:11px; line-height:1.45; color:#1a1a1a; direction:rtl; }
        @media print {
          body { background:#fff !important; }
          .contract-page { box-shadow:none; margin:0; padding:6mm 10mm; width:100%; }
          .no-print, aside, nav, .sidebar, [class*="sidebar"], [class*="Sidebar"] { display:none !important; }
          main { margin:0 !important; padding:0 !important; max-width:100% !important; }
          .page-break { page-break-before:always; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
        @media screen { body { background:#f0f0f0; } }
        .header { text-align:center; border-bottom:3px double #1a5276; padding-bottom:6px; margin-bottom:6px; }
        .hotel-name { font-size:22px; font-weight:900; color:#1a5276; letter-spacing:1px; }
        .hotel-sub { font-size:11px; color:#555; margin-top:1px; }
        .contract-title { text-align:center; background:#1a5276; color:#fff; padding:5px; font-size:17px; font-weight:800; margin:6px 0; border-radius:4px; }
        .contract-number { text-align:center; font-size:10.5px; color:#777; margin-top:2px; }
        .section-title { background:#2c3e50; color:#fff; padding:4px 10px; font-size:12px; font-weight:700; margin:7px 0 4px 0; border-radius:3px; }
        .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:2px 15px; margin:3px 0; }
        .info-item { padding:2px 0; border-bottom:1px dotted #ccc; font-size:11px; }
        .info-label { font-weight:700; color:#1a5276; }
        .info-value { color:#333; }
        .payment-box { border:1.5px solid #1a5276; border-radius:6px; padding:6px 8px; margin:5px 0; background:#f8fbff; }
        .payment-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:5px; text-align:center; }
        .payment-item { background:#fff; border:1px solid #ddd; border-radius:4px; padding:4px; }
        .payment-amount { font-size:16px; font-weight:900; color:#1a5276; }
        .payment-label { font-size:9.5px; color:#777; }
        .clause { padding:1px 8px; margin:1px 0; font-size:10.5px; line-height:1.55; }
        .clause-number { display:inline-block; background:#1a5276; color:#fff; width:17px; height:17px; line-height:17px; text-align:center; border-radius:50%; font-size:9px; font-weight:700; margin-left:4px; }
        .warning-box { border:2px solid #c0392b; border-radius:6px; padding:6px 8px; margin:6px 0; background:#fef2f2; }
        .warning-title { color:#c0392b; font-size:13px; font-weight:900; text-align:center; margin-bottom:3px; }
        .warning-item { font-size:12px; font-weight:800; color:#c0392b; padding:3px 8px; margin:2px 0; background:#fff; border-right:3px solid #c0392b; border-radius:0 3px 3px 0; }
        .service-box { border:1.5px solid #27ae60; border-radius:6px; padding:5px 8px; margin:5px 0; background:#f0faf4; text-align:center; }
        .service-title { color:#27ae60; font-size:12px; font-weight:800; }
        .verse-box { border:1.5px solid #8e6f3e; border-radius:6px; padding:6px 8px; margin:6px 0; background:#fefcf5; text-align:center; }
        .verse-text { font-family:'Amiri',serif; font-size:14px; font-weight:700; color:#5a4020; line-height:1.7; margin-bottom:1px; }
        .verse-ref { font-size:9.5px; color:#8e6f3e; font-weight:700; }
        .hadith-text { font-family:'Amiri',serif; font-size:13px; color:#5a4020; line-height:1.6; margin-top:4px; }
        .hadith-ref { font-size:9.5px; color:#8e6f3e; }
        .signatures { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:10px; padding-top:8px; border-top:2px solid #1a5276; }
        .signature-block { text-align:center; }
        .signature-label { font-weight:700; color:#1a5276; font-size:11px; margin-bottom:25px; }
        .signature-line { border-bottom:1px solid #333; margin:0 15px; padding-top:30px; }
        .signature-name { font-size:10px; color:#777; margin-top:3px; }
        .contract-table { width:100%; border-collapse:collapse; }
        .contract-table th { background:#1a5276; color:#fff; padding:4px; font-size:10.5px; font-weight:700; border:1px solid #333; }
        .contract-table td { padding:8px; font-size:10.5px; border:1px solid #333; }
        .print-btn { position:fixed; top:15px; left:15px; background:#1a5276; color:#fff; border:none; padding:10px 25px; font-size:14px; font-family:'Tajawal',sans-serif; font-weight:700; border-radius:6px; cursor:pointer; box-shadow:0 3px 10px rgba(0,0,0,0.3); z-index:1000; }
        .print-btn:hover { background:#2c3e50; }
        .footer-note { text-align:center; font-size:9.5px; color:#999; margin-top:6px; border-top:1px solid #ddd; padding-top:4px; }
      `}</style>

      <button className="print-btn no-print" onClick={() => window.print()}>🖨️ طباعة العقد</button>

      <div className="contract-page">

        {/* ═══ HEADER ═══ */}
        <div className="header">
          <div className="hotel-name">🏨 فندق الفاخر 🏨</div>
          <div className="hotel-sub">Al-Fakher Hotel — المملكة الأردنية الهاشمية — للإقامة الفندقية والشقق المفروشة</div>
          <div className="hotel-sub">الغرف الفندقية (101–109) &bull; الشقق المفروشة (01–06)</div>
        </div>

        {/* ═══ CONTRACT TITLE ═══ */}
        <div className="contract-title">عقد إيجار وحدة فندقية</div>
        <div className="contract-number">
          رقم العقد: <strong>{contractNumber(r.id)}</strong> &nbsp;|&nbsp; تاريخ التحرير: <strong>{todayStr}</strong> &nbsp;|&nbsp; رقم الحجز: <strong>{r.id}</strong>
        </div>

        {/* ═══ PARTIES ═══ */}
        <div className="section-title">أولاً: بيانات أطراف العقد</div>
        <div className="info-grid">
          <div className="info-item"><span className="info-label">الطرف الأول (المؤجر):</span> <span className="info-value">إدارة فندق الفاخر</span></div>
          <div className="info-item"><span className="info-label">السجل التجاري:</span> <span className="info-value">_______________</span></div>
          <div className="info-item"><span className="info-label">الطرف الثاني (المستأجر):</span> <span className="info-value"><strong>{r.guestName}</strong></span></div>
          <div className="info-item"><span className="info-label">رقم الهاتف:</span> <span className="info-value">{r.phone || "—"}</span></div>
        </div>

        {/* ═══ GUESTS TABLE ═══ */}
        <div className="section-title">ثانياً: بيانات النزلاء المسجلين (عدد النزلاء: {r.guests.length || r.numGuests})</div>
        <table className="contract-table">
          <thead>
            <tr>
              <th style={{ width: "7%" }}>م</th>
              <th style={{ width: "38%" }}>الاسم الكامل</th>
              <th style={{ width: "30%" }}>رقم الهوية / الإقامة</th>
              <th style={{ width: "25%" }}>الجنسية</th>
            </tr>
          </thead>
          <tbody>
            {r.guests.length > 0 ? (
              r.guests.map((g, i) => (
                <tr key={g.id || i}>
                  <td style={{ textAlign: "center" }}>{i + 1}</td>
                  <td>{g.fullName}</td>
                  <td style={{ textAlign: "center" }}>{g.idNumber}</td>
                  <td style={{ textAlign: "center" }}>{g.nationality || "—"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td style={{ textAlign: "center" }}>1</td>
                <td>{r.guestName}</td>
                <td style={{ textAlign: "center" }}>—</td>
                <td style={{ textAlign: "center" }}>—</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* ═══ UNIT DETAILS ═══ */}
        <div className="section-title">ثالثاً: بيانات الوحدة المؤجرة</div>
        <div className="info-grid">
          <div className="info-item"><span className="info-label">نوع الوحدة:</span> <span className="info-value"><strong>{uType}</strong></span></div>
          <div className="info-item"><span className="info-label">رقم الوحدة:</span> <span className="info-value"><strong>{r.unit.unitNumber}</strong></span></div>
          <div className="info-item"><span className="info-label">نوع الإقامة:</span> <span className="info-value">{sType}</span></div>
          <div className="info-item"><span className="info-label">مدة الإقامة:</span> <span className="info-value">{r.numNights} {sDuration} (إقامة {sType === "يومي" ? "يومية" : sType === "أسبوعي" ? "أسبوعية" : "شهرية"})</span></div>
          <div className="info-item"><span className="info-label">تاريخ الدخول:</span> <span className="info-value"><strong>{fmtDate(r.checkIn)}</strong></span></div>
          <div className="info-item"><span className="info-label">تاريخ الخروج:</span> <span className="info-value"><strong>{fmtDate(r.checkOut)}</strong></span></div>
        </div>

        {/* ═══ PAYMENT DETAILS ═══ */}
        <div className="section-title">رابعاً: البيانات المالية وبيان الدفع</div>
        <div className="payment-box">
          <div className="payment-grid">
            <div className="payment-item">
              <div className="payment-label">سعر الوحدة ({sType})</div>
              <div className="payment-amount">{fmtAmount(r.unitPrice)}</div>
              <div className="payment-label">دينار أردني</div>
            </div>
            <div className="payment-item">
              <div className="payment-label">إجمالي المبلغ</div>
              <div className="payment-amount">{fmtAmount(r.totalAmount)}</div>
              <div className="payment-label">دينار أردني</div>
            </div>
            <div className="payment-item" style={{ border: "2px solid #27ae60" }}>
              <div className="payment-label" style={{ color: "#27ae60", fontWeight: 700 }}>المبلغ المدفوع</div>
              <div className="payment-amount" style={{ color: "#27ae60" }}>{fmtAmount(r.paidAmount)}</div>
              <div className="payment-label" style={{ color: "#27ae60", fontWeight: 700 }}>دينار أردني</div>
            </div>
          </div>
          <div style={{ marginTop: 4, textAlign: "center", fontSize: 10, color: "#555" }}>
            <strong>المبلغ المدفوع كتابةً:</strong> {numberToArabicWords(paidNum)} دينار أردني فقط لا غير
            &nbsp;|&nbsp; <strong>المتبقي:</strong> {fmtAmount(remainingNum)} د.أ
            &nbsp;|&nbsp; <strong>طريقة الدفع:</strong> {pm}
          </div>
        </div>

        {/* ═══ WARNING BOX ═══ */}
        <div className="warning-box">
          <div className="warning-title">⛔ تنبيهات هامة وإلزامية ⛔</div>
          <div className="warning-item">⚠️ يُمنع منعاً باتاً استقبال أو إيواء أي ضيوف أو زوار من غير المُسجلين في هذا العقد داخل الوحدة المؤجرة</div>
          <div className="warning-item">🚫 يُمنع منعاً باتاً إدخال أو تناول أو حيازة المشروبات الكحولية بأنواعها وأشكالها كافة داخل الفندق ومرافقه</div>
        </div>

        {/* ═══ TERMS AND CONDITIONS ═══ */}
        <div className="section-title">خامساً: الشروط والأحكام العامة</div>

        <div className="clause"><span className="clause-number">1</span> <strong>محل العقد:</strong> وافق الطرف الأول (إدارة فندق الفاخر) على تأجير الوحدة الفندقية المبيّنة أعلاه للطرف الثاني بالشروط الواردة في هذا العقد، ويُقرّ المستأجر بأنه عاين الوحدة وقبلها بحالتها الراهنة.</div>

        <div className="clause"><span className="clause-number">2</span> <strong>مدة الإيجار:</strong> تبدأ من <strong>{fmtDate(r.checkIn)}</strong> وتنتهي في <strong>{fmtDate(r.checkOut)}</strong> بمدة <strong>{r.numNights} {sDuration} (إقامة {sType === "يومي" ? "يومية" : sType === "أسبوعي" ? "أسبوعية" : "شهرية"})</strong>. لا يتم التجديد تلقائياً إلا باتفاق مكتوب.</div>

        <div className="clause"><span className="clause-number">3</span> <strong>السداد:</strong> يلتزم المستأجر بسداد كامل قيمة الإيجار وقدرها <strong>{fmtAmount(r.totalAmount)} د.أ</strong>. تم استلام <strong>{fmtAmount(r.paidAmount)} د.أ</strong> عند التوقيع، والمتبقي <strong>{fmtAmount(r.remaining)} د.أ</strong> يُسدَّد قبل نهاية الإقامة أو وفق الاتفاق.</div>

        <div className="clause"><span className="clause-number">4</span> <strong>تسجيل النزلاء:</strong> يلتزم المستأجر بتسجيل جميع المقيمين بالوحدة كما هو مبيّن أعلاه. <strong style={{ color: "#c0392b" }}>ويُمنع منعاً باتاً استقبال أي شخص غير مسجل في هذا العقد.</strong></div>

        <div className="clause"><span className="clause-number">5</span> <strong>حظر المشروبات الكحولية:</strong> <strong style={{ color: "#c0392b" }}>يُمنع منعاً باتاً إدخال أو تناول أو حيازة أو تخزين المشروبات الكحولية بأنواعها كافة</strong> داخل الوحدة أو مرافق الفندق، وذلك التزاماً بأحكام الشريعة الإسلامية.</div>

        <div className="clause"><span className="clause-number">6</span> <strong>المحافظة على الوحدة:</strong> يلتزم المستأجر بالمحافظة على الوحدة ومحتوياتها بحالتها الأصلية، ويتحمل المسؤولية عن أي تلف (باستثناء الاستهلاك الطبيعي).</div>

        <div className="clause"><span className="clause-number">7</span> <strong>الهدوء والنظام:</strong> يلتزم النزلاء بالمحافظة على الهدوء واحترام راحة الآخرين، ويُمنع الإزعاج خاصة من 10 مساءً حتى 8 صباحاً.</div>

        <div className="clause"><span className="clause-number">8</span> <strong>حظر التدخين:</strong> يُمنع التدخين داخل الوحدات والممرات والمرافق المغلقة. المخالف يتحمل تكاليف التنظيف والتعقيم.</div>

        <div className="clause"><span className="clause-number">9</span> <strong>حظر الأنشطة المخالفة:</strong> يُمنع أي نشاط مخالف للقوانين المعمول بها في المملكة الأردنية الهاشمية أو مخالف لأحكام الشريعة الإسلامية. ويتحمل المستأجر المسؤولية القانونية الكاملة.</div>

        <div className="clause"><span className="clause-number">10</span> <strong>الحيوانات:</strong> يُمنع اصطحاب أي حيوانات أليفة إلى الوحدة أو مرافق الفندق.</div>

        <div className="clause"><span className="clause-number">11</span> <strong>التأمين:</strong> يحق للإدارة طلب مبلغ تأمين مسترد عند تسليم المفتاح، يُعاد بعد التأكد من سلامة الوحدة.</div>

        <div className="clause"><span className="clause-number">12</span> <strong>مواعيد الدخول والخروج:</strong> الدخول من <strong>2:00 ظهراً</strong>، والخروج حتى <strong>12:00 ظهراً</strong>. التأخير قد يترتب عليه رسوم إضافية.</div>

        <div className="clause"><span className="clause-number">13</span> <strong>المفاتيح:</strong> يتسلم المستأجر المفتاح/البطاقة عند الدخول ويلتزم بإعادتها عند الخروج. فقدانها يتحمل تكلفتها المستأجر.</div>

        <div className="clause"><span className="clause-number">14</span> <strong>الصيانة:</strong> يلتزم الطرف الأول بالصيانة الأساسية (تكييف، سباكة، كهرباء). على المستأجر الإبلاغ فوراً عن أي عطل ولا يحق له الإصلاح بنفسه.</div>

        <div className="clause"><span className="clause-number">15</span> <strong>إخلاء المسؤولية:</strong> لا تتحمل الإدارة مسؤولية فقدان أو تلف الممتلكات الشخصية للنزلاء.</div>

        <div className="clause"><span className="clause-number">16</span> <strong>فسخ العقد:</strong> يحق للإدارة فسخ العقد فوراً دون إنذار عند مخالفة أي بند، مع حقها في المطالبة بالتعويض.</div>

        <div className="clause"><span className="clause-number">17</span> <strong>الاختصاص القضائي:</strong> تختص محاكم المملكة الأردنية الهاشمية بالفصل في أي نزاع يتعلق بهذا العقد وفقاً للأنظمة المعمول بها.</div>

        {/* ═══ HOUSEKEEPING ═══ */}
        <div className="service-box">
          <div className="service-title">🧹 خدمة تنظيف الغرف — House Keeping</div>
          <div style={{ marginTop: 2, fontSize: 10.5, color: "#333" }}>يتوفر لدى فندق الفاخر خدمة <strong>House Keeping</strong> لضمان راحة نزلائنا الكرام. يمكنكم طلب الخدمة من مكتب الاستقبال أو عبر الاتصال الداخلي.</div>
        </div>

        {/* ═══ QURAN & HADITH ═══ */}
        <div className="verse-box">
          <div className="verse-text">﴿ وَلَا تَقْرَبُوا الْفَوَاحِشَ مَا ظَهَرَ مِنْهَا وَمَا بَطَنَ ﴾</div>
          <div className="verse-ref">— سورة الأنعام، الآية 151</div>
          <div className="verse-text" style={{ marginTop: 4 }}>﴿ إِنَّمَا الْخَمْرُ وَالْمَيْسِرُ وَالْأَنصَابُ وَالْأَزْلَامُ رِجْسٌ مِّنْ عَمَلِ الشَّيْطَانِ فَاجْتَنِبُوهُ لَعَلَّكُمْ تُفْلِحُونَ ﴾</div>
          <div className="verse-ref">— سورة المائدة، الآية 90</div>
          <div className="hadith-text" style={{ marginTop: 4 }}>قال رسول الله ﷺ: «كلُّ مُسكرٍ خمرٌ، وكلُّ خمرٍ حرامٌ»</div>
          <div className="hadith-ref">— رواه مسلم</div>
          <div style={{ marginTop: 4, fontSize: 10.5, color: "#5a4020", fontWeight: 500, lineHeight: 1.6 }}>
            نذكّر نزلاءنا الكرام بتقوى الله عز وجل والالتزام بتعاليم الإسلام الحنيف، وأن هذا المكان أمانة في أعناقكم. فالله مطّلعٌ على كل خفيّة، وإنّ من صان عرضه ودينه في سفره وإقامته نال رضا الله وبركته. نسأل الله لكم إقامة طيبة مباركة.
          </div>
        </div>

        {/* ═══ TENANT ACKNOWLEDGMENT ═══ */}
        <div style={{ marginTop: 6, padding: "5px 8px", background: "#f8f8f8", borderRadius: 4, fontSize: 10.5, lineHeight: 1.6 }}>
          <strong>إقرار المستأجر:</strong> أقرّ أنا الموقع أدناه بأنني اطلعت على جميع بنود هذا العقد وفهمتها وقبلتها، وأتعهد بالالتزام بها كاملة طوال فترة إقامتي، وأتحمل كامل المسؤولية القانونية والمالية عن أي مخالفة.
        </div>

        {/* ═══ SIGNATURES ═══ */}
        <div className="signatures">
          <div className="signature-block">
            <div className="signature-label">الطرف الأول (المؤجر)</div>
            <div className="signature-line"></div>
            <div className="signature-name">إدارة فندق الفاخر</div>
          </div>
          <div className="signature-block">
            <div className="signature-label">الطرف الثاني (المستأجر)</div>
            <div className="signature-line"></div>
            <div className="signature-name">{r.guestName}</div>
          </div>
        </div>

        {/* ═══ FOOTER ═══ */}
        <div className="footer-note">
          حُرر هذا العقد من نسختين أصليتين، بيد كل طرف نسخة للعمل بموجبها — تاريخ التحرير: {todayStr}
          <br/>فندق الفاخر — المملكة الأردنية الهاشمية — جميع الحقوق محفوظة © 2026
        </div>

      </div>
    </>
  );
}
