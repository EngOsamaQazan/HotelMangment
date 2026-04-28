import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { numberToArabicWords } from "@/lib/utils";

/**
 * Server-side renderer for the booking contract HTML. Mirrors the look
 * of `src/app/reservations/[id]/contract/ContractClient.tsx` so the PDF
 * delivered to the guest is visually identical to the print preview a
 * desk clerk sees, but doesn't require a logged-in browser session
 * (puppeteer can't send our auth cookies).
 *
 * Kept intentionally framework-free (template literal). When the React
 * page changes, update both — there is no automatic sync.
 */

export interface ContractGuestData {
  fullName: string;
  idNumber: string;
  nationality?: string | null;
}

export interface ContractInput {
  id: number;
  guestName: string;
  phone: string | null;
  numNights: number;
  stayType: string;
  checkIn: Date | string;
  checkOut: Date | string;
  unitPrice: number;
  totalAmount: number;
  paidAmount: number;
  remaining: number;
  paymentMethod: string | null;
  numGuests: number;
  unit: { unitNumber: string; unitType: string };
  guests: ContractGuestData[];
}

const unitTypeLabel: Record<string, string> = {
  room: "غرفة فندقية",
  apartment: "شقة مفروشة",
  hotel_room: "غرفة فندقية",
  suite: "جناح فندقي",
  studio: "ستوديو",
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

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function fmtAmount(n: number): string {
  return Number(n).toFixed(2);
}

function contractNumber(id: number): string {
  return `MH-${String(id).padStart(4, "0")}`;
}

/** Cache the logo in memory — it's small and read repeatedly. */
let logoDataUriPromise: Promise<string> | null = null;
async function getLogoDataUri(): Promise<string> {
  if (!logoDataUriPromise) {
    logoDataUriPromise = (async () => {
      try {
        const buf = await readFile(join(process.cwd(), "public", "logo.png"));
        return `data:image/png;base64,${buf.toString("base64")}`;
      } catch {
        return ""; // graceful degradation if logo missing
      }
    })();
  }
  return logoDataUriPromise;
}

/** HTML-escape user-supplied strings before injection. */
function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function renderContractHtml(r: ContractInput): Promise<string> {
  const todayStr = fmtDate(new Date());
  const uType = unitTypeLabel[r.unit.unitType] || r.unit.unitType;
  const sType = stayTypeLabel[r.stayType] || r.stayType;
  const sDuration = stayDurationLabel[r.stayType] || "ليلة";
  const pm = r.paymentMethod || "نقد";
  const logo = await getLogoDataUri();

  const guestsRows =
    r.guests.length > 0
      ? r.guests
          .map(
            (g, i) => `
        <tr>
          <td style="text-align:center">${i + 1}</td>
          <td>${esc(g.fullName)}</td>
          <td style="text-align:center">${esc(g.idNumber)}</td>
          <td style="text-align:center">${esc(g.nationality) || "—"}</td>
        </tr>`,
          )
          .join("")
      : `
        <tr>
          <td style="text-align:center">1</td>
          <td>${esc(r.guestName)}</td>
          <td style="text-align:center">—</td>
          <td style="text-align:center">—</td>
        </tr>`;

  const stayLong =
    sType === "يومي" ? "يومية" : sType === "أسبوعي" ? "أسبوعية" : "شهرية";

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>عقد إيجار — ${contractNumber(r.id)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&family=Amiri:wght@400;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  @page { size:A4; margin:12mm 14mm; }
  html, body { background:#fff; }
  body { direction:rtl; font-family:'Tajawal','Arial',sans-serif; font-size:11px; line-height:1.45; color:#1a1a1a; }
  /* اعتمد على هوامش الصفحة (@page + Puppeteer margin) لتحديد المنطقة القابلة للطباعة،
     ولا تفرض عرضاً ثابتاً 210mm وإلا فاض المحتوى وقُصَّ من الجانب الأيسر في RTL. */
  .contract-page { width:100%; max-width:100%; margin:0; padding:0; background:#fff; }
  /* ═══ فندق المفرق — Brand Palette ═══
     Emerald: #0E3B33 / #092923 / #155A4C
     Gold:    #D4B273 / #B8945A / #E8D0A0 */
  .header { text-align:center; border-bottom:2px solid #0E3B33; margin-bottom:6px; position:relative; background:#0E3B33; border-radius:6px; padding:10px 8px 8px; }
  .header::after { content:""; display:block; width:60%; height:1px; background:#D4B273; margin:4px auto 0; }
  .brand-logo { display:block; max-width:220px; height:auto; margin:0 auto 2px; filter: brightness(1.05); }
  .brand-caption { font-size:11px; letter-spacing:7px; color:#fff; font-weight:600; text-transform:uppercase; margin-top:2px; }
  .hotel-sub { font-size:11px; color:#fff; margin-top:3px; opacity:0.92; }
  .contract-title { text-align:center; background:#0E3B33; color:#D4B273; padding:6px; font-size:17px; font-weight:800; margin:6px 0; border-radius:4px; border:1px solid #D4B273; letter-spacing:0.5px; }
  .contract-number { text-align:center; font-size:10.5px; color:#777; margin-top:2px; }
  .section-title { background:#092923; color:#D4B273; padding:4px 10px; font-size:12px; font-weight:700; margin:7px 0 4px 0; border-radius:3px; border-right:3px solid #D4B273; }
  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:2px 15px; margin:3px 0; }
  .info-item { padding:2px 0; border-bottom:1px dotted #ccc; font-size:11px; }
  .info-label { font-weight:700; color:#0E3B33; }
  .info-value { color:#333; }
  .payment-box { border:1.5px solid #0E3B33; border-radius:6px; padding:6px 8px; margin:5px 0; background:#FAF3E3; }
  .payment-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:5px; text-align:center; }
  .payment-item { background:#fff; border:1px solid #D4B273; border-radius:4px; padding:4px; }
  .payment-amount { font-size:16px; font-weight:900; color:#0E3B33; }
  .payment-label { font-size:9.5px; color:#777; }
  .clause { padding:1px 8px; margin:1px 0; font-size:10.5px; line-height:1.55; }
  .clause-number { display:inline-block; background:#0E3B33; color:#D4B273; width:17px; height:17px; line-height:17px; text-align:center; border-radius:50%; font-size:9px; font-weight:700; margin-left:4px; }
  .warning-box { border:2px solid #c0392b; border-radius:6px; padding:6px 8px; margin:6px 0; background:#fef2f2; }
  .warning-title { color:#c0392b; font-size:13px; font-weight:900; text-align:center; margin-bottom:3px; }
  .warning-item { font-size:12px; font-weight:800; color:#c0392b; padding:3px 8px; margin:2px 0; background:#fff; border-right:3px solid #c0392b; border-radius:0 3px 3px 0; }
  .service-box { border:1.5px solid #27ae60; border-radius:6px; padding:5px 8px; margin:5px 0; background:#f0faf4; text-align:center; }
  .service-title { color:#27ae60; font-size:12px; font-weight:800; }
  .verse-box { border:1.5px solid #D4B273; border-radius:6px; padding:6px 8px; margin:6px 0; background:#FAF3E3; text-align:center; }
  .verse-text { font-family:'Amiri',serif; font-size:14px; font-weight:700; color:#0E3B33; line-height:1.7; margin-bottom:1px; }
  .verse-ref { font-size:9.5px; color:#B8945A; font-weight:700; }
  .hadith-text { font-family:'Amiri',serif; font-size:13px; color:#0E3B33; line-height:1.6; margin-top:4px; }
  .hadith-ref { font-size:9.5px; color:#B8945A; }
  .signatures { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:10px; padding-top:8px; border-top:2px solid #0E3B33; }
  .signature-block { text-align:center; }
  .signature-label { font-weight:700; color:#0E3B33; font-size:11px; margin-bottom:25px; }
  .signature-line { border-bottom:1px solid #333; margin:0 15px; padding-top:30px; }
  .signature-name { font-size:10px; color:#777; margin-top:3px; }
  .contract-table { width:100%; border-collapse:collapse; }
  .contract-table th { background:#0E3B33; color:#D4B273; padding:4px; font-size:10.5px; font-weight:700; border:1px solid #092923; }
  .contract-table td { padding:8px; font-size:10.5px; border:1px solid #333; }
  .footer-note { text-align:center; font-size:9.5px; color:#999; margin-top:6px; border-top:1px solid #D4B273; padding-top:4px; }
</style>
</head>
<body>
<div class="contract-page">

  <div class="header">
    ${logo ? `<img src="${logo}" alt="فندق المفرق" class="brand-logo" />` : ""}
    <div class="brand-caption">Hotel</div>
    <div class="hotel-sub" style="margin-top:6px">فندق المفرق — Al-Mafraq Hotel</div>
    <div class="hotel-sub">للإقامة الفندقية والشقق المفروشة &bull; الغرف الفندقية (101–109) &bull; الشقق المفروشة (01–06)</div>
  </div>

  <div class="contract-title">عقد إيجار وحدة فندقية</div>
  <div class="contract-number">
    رقم العقد: <strong>${contractNumber(r.id)}</strong> &nbsp;|&nbsp; تاريخ التحرير: <strong>${todayStr}</strong> &nbsp;|&nbsp; رقم الحجز: <strong>${r.id}</strong>
  </div>

  <div class="section-title">أولاً: بيانات أطراف العقد</div>
  <div class="info-grid">
    <div class="info-item"><span class="info-label">الطرف الأول (المؤجر):</span> <span class="info-value">إدارة فندق المفرق</span></div>
    <div class="info-item"><span class="info-label">السجل التجاري:</span> <span class="info-value">_______________</span></div>
    <div class="info-item"><span class="info-label">الطرف الثاني (المستأجر):</span> <span class="info-value"><strong>${esc(r.guestName)}</strong></span></div>
    <div class="info-item"><span class="info-label">رقم الهاتف:</span> <span class="info-value">${esc(r.phone) || "—"}</span></div>
  </div>

  <div class="section-title">ثانياً: بيانات الضيوف المسجلين (عدد الضيوف: ${r.guests.length || r.numGuests})</div>
  <table class="contract-table">
    <thead>
      <tr>
        <th style="width:7%">م</th>
        <th style="width:38%">الاسم الكامل</th>
        <th style="width:30%">رقم الهوية / الإقامة</th>
        <th style="width:25%">الجنسية</th>
      </tr>
    </thead>
    <tbody>${guestsRows}</tbody>
  </table>

  <div class="section-title">ثالثاً: بيانات الوحدة المؤجرة</div>
  <div class="info-grid">
    <div class="info-item"><span class="info-label">نوع الوحدة:</span> <span class="info-value"><strong>${esc(uType)}</strong></span></div>
    <div class="info-item"><span class="info-label">رقم الوحدة:</span> <span class="info-value"><strong>${esc(r.unit.unitNumber)}</strong></span></div>
    <div class="info-item"><span class="info-label">نوع الإقامة:</span> <span class="info-value">${esc(sType)}</span></div>
    <div class="info-item"><span class="info-label">مدة الإقامة:</span> <span class="info-value">${r.numNights} ${esc(sDuration)} (إقامة ${esc(stayLong)})</span></div>
    <div class="info-item"><span class="info-label">تاريخ الدخول:</span> <span class="info-value"><strong>${fmtDate(r.checkIn)}</strong></span></div>
    <div class="info-item"><span class="info-label">تاريخ الخروج:</span> <span class="info-value"><strong>${fmtDate(r.checkOut)}</strong></span></div>
  </div>

  <div class="section-title">رابعاً: البيانات المالية وبيان الدفع</div>
  <div class="payment-box">
    <div class="payment-grid">
      <div class="payment-item">
        <div class="payment-label">سعر الوحدة (${esc(sType)})</div>
        <div class="payment-amount">${fmtAmount(r.unitPrice)}</div>
        <div class="payment-label">دينار أردني</div>
      </div>
      <div class="payment-item">
        <div class="payment-label">إجمالي المبلغ</div>
        <div class="payment-amount">${fmtAmount(r.totalAmount)}</div>
        <div class="payment-label">دينار أردني</div>
      </div>
      <div class="payment-item" style="border:2px solid #27ae60">
        <div class="payment-label" style="color:#27ae60;font-weight:700">المبلغ المدفوع</div>
        <div class="payment-amount" style="color:#27ae60">${fmtAmount(r.paidAmount)}</div>
        <div class="payment-label" style="color:#27ae60;font-weight:700">دينار أردني</div>
      </div>
    </div>
    <div style="margin-top:4px;text-align:center;font-size:10px;color:#555">
      <strong>المبلغ المدفوع كتابةً:</strong> ${esc(numberToArabicWords(r.paidAmount))} دينار أردني فقط لا غير
      &nbsp;|&nbsp; <strong>المتبقي:</strong> ${fmtAmount(r.remaining)} د.أ
      &nbsp;|&nbsp; <strong>طريقة الدفع:</strong> ${esc(pm)}
    </div>
  </div>

  <div class="warning-box">
    <div class="warning-title">⛔ تنبيهات هامة وإلزامية ⛔</div>
    <div class="warning-item">⚠️ يُمنع منعاً باتاً استقبال أو إيواء أي ضيوف أو زوار من غير المُسجلين في هذا العقد داخل الوحدة المؤجرة</div>
    <div class="warning-item">🚫 يُمنع منعاً باتاً إدخال أو تناول أو حيازة المشروبات الكحولية بأنواعها وأشكالها كافة داخل الفندق ومرافقه</div>
  </div>

  <div class="section-title">خامساً: الشروط والأحكام العامة</div>

  <div class="clause"><span class="clause-number">1</span> <strong>محل العقد:</strong> وافق الطرف الأول (إدارة فندق المفرق) على تأجير الوحدة الفندقية المبيّنة أعلاه للطرف الثاني بالشروط الواردة في هذا العقد، ويُقرّ المستأجر بأنه عاين الوحدة وقبلها بحالتها الراهنة.</div>
  <div class="clause"><span class="clause-number">2</span> <strong>مدة الإيجار:</strong> تبدأ من <strong>${fmtDate(r.checkIn)}</strong> وتنتهي في <strong>${fmtDate(r.checkOut)}</strong> بمدة <strong>${r.numNights} ${esc(sDuration)} (إقامة ${esc(stayLong)})</strong>. لا يتم التجديد تلقائياً إلا باتفاق مكتوب.</div>
  <div class="clause"><span class="clause-number">3</span> <strong>السداد:</strong> يلتزم المستأجر بسداد كامل قيمة الإيجار وقدرها <strong>${fmtAmount(r.totalAmount)} د.أ</strong>. تم استلام <strong>${fmtAmount(r.paidAmount)} د.أ</strong> عند التوقيع، والمتبقي <strong>${fmtAmount(r.remaining)} د.أ</strong> يُسدَّد قبل نهاية الإقامة أو وفق الاتفاق.</div>
  <div class="clause"><span class="clause-number">4</span> <strong>تسجيل الضيوف:</strong> يلتزم المستأجر بتسجيل جميع المقيمين بالوحدة كما هو مبيّن أعلاه. <strong style="color:#c0392b">ويُمنع منعاً باتاً استقبال أي شخص غير مسجل في هذا العقد.</strong></div>
  <div class="clause"><span class="clause-number">5</span> <strong>حظر المشروبات الكحولية:</strong> <strong style="color:#c0392b">يُمنع منعاً باتاً إدخال أو تناول أو حيازة أو تخزين المشروبات الكحولية بأنواعها كافة</strong> داخل الوحدة أو مرافق الفندق، وذلك التزاماً بأحكام الشريعة الإسلامية.</div>
  <div class="clause"><span class="clause-number">6</span> <strong>المحافظة على الوحدة:</strong> يلتزم المستأجر بالمحافظة على الوحدة ومحتوياتها بحالتها الأصلية، ويتحمل المسؤولية عن أي تلف (باستثناء الاستهلاك الطبيعي).</div>
  <div class="clause"><span class="clause-number">7</span> <strong>الهدوء والنظام:</strong> يلتزم الضيوف بالمحافظة على الهدوء واحترام راحة الآخرين، ويُمنع الإزعاج خاصة من 10 مساءً حتى 8 صباحاً.</div>
  <div class="clause"><span class="clause-number">8</span> <strong>حظر التدخين:</strong> يُمنع التدخين داخل الوحدات والممرات والمرافق المغلقة. المخالف يتحمل تكاليف التنظيف والتعقيم.</div>
  <div class="clause"><span class="clause-number">9</span> <strong>حظر الأنشطة المخالفة:</strong> يُمنع أي نشاط مخالف للقوانين المعمول بها في المملكة الأردنية الهاشمية أو مخالف لأحكام الشريعة الإسلامية. ويتحمل المستأجر المسؤولية القانونية الكاملة.</div>
  <div class="clause"><span class="clause-number">10</span> <strong>الحيوانات:</strong> يُمنع اصطحاب أي حيوانات أليفة إلى الوحدة أو مرافق الفندق.</div>
  <div class="clause"><span class="clause-number">11</span> <strong>التأمين:</strong> يحق للإدارة طلب مبلغ تأمين مسترد عند تسليم المفتاح، يُعاد بعد التأكد من سلامة الوحدة.</div>
  <div class="clause"><span class="clause-number">12</span> <strong>مواعيد الدخول والخروج:</strong> الدخول من <strong>2:00 ظهراً</strong>، والخروج حتى <strong>12:00 ظهراً</strong>. التأخير قد يترتب عليه رسوم إضافية.</div>
  <div class="clause"><span class="clause-number">13</span> <strong>المفاتيح:</strong> يتسلم المستأجر المفتاح/البطاقة عند الدخول ويلتزم بإعادتها عند الخروج. فقدانها يتحمل تكلفتها المستأجر.</div>
  <div class="clause"><span class="clause-number">14</span> <strong>الصيانة:</strong> يلتزم الطرف الأول بالصيانة الأساسية (تكييف، سباكة، كهرباء). على المستأجر الإبلاغ فوراً عن أي عطل ولا يحق له الإصلاح بنفسه.</div>
  <div class="clause"><span class="clause-number">15</span> <strong>إخلاء المسؤولية:</strong> لا تتحمل الإدارة مسؤولية فقدان أو تلف الممتلكات الشخصية للضيوف.</div>
  <div class="clause"><span class="clause-number">16</span> <strong>فسخ العقد:</strong> يحق للإدارة فسخ العقد فوراً دون إنذار عند مخالفة أي بند، مع حقها في المطالبة بالتعويض.</div>
  <div class="clause"><span class="clause-number">17</span> <strong>الاختصاص القضائي:</strong> تختص محاكم المملكة الأردنية الهاشمية بالفصل في أي نزاع يتعلق بهذا العقد وفقاً للأنظمة المعمول بها.</div>

  <div class="service-box">
    <div class="service-title">🧹 خدمة تنظيف الغرف — House Keeping</div>
    <div style="margin-top:2px;font-size:10.5px;color:#333">يتوفر لدى فندق المفرق خدمة <strong>House Keeping</strong> لضمان راحة نزلائنا الكرام. يمكنكم طلب الخدمة من مكتب الاستقبال أو عبر الاتصال الداخلي.</div>
  </div>

  <div class="verse-box">
    <div class="verse-text">﴿ وَلَا تَقْرَبُوا الْفَوَاحِشَ مَا ظَهَرَ مِنْهَا وَمَا بَطَنَ ﴾</div>
    <div class="verse-ref">— سورة الأنعام، الآية 151</div>
    <div class="verse-text" style="margin-top:4px">﴿ إِنَّمَا الْخَمْرُ وَالْمَيْسِرُ وَالْأَنصَابُ وَالْأَزْلَامُ رِجْسٌ مِّنْ عَمَلِ الشَّيْطَانِ فَاجْتَنِبُوهُ لَعَلَّكُمْ تُفْلِحُونَ ﴾</div>
    <div class="verse-ref">— سورة المائدة، الآية 90</div>
    <div class="hadith-text" style="margin-top:4px">قال رسول الله ﷺ: «كلُّ مُسكرٍ خمرٌ، وكلُّ خمرٍ حرامٌ»</div>
    <div class="hadith-ref">— رواه مسلم</div>
    <div style="margin-top:4px;font-size:10.5px;color:#5a4020;font-weight:500;line-height:1.6">
      نذكّر ضيوفنا الكرام بتقوى الله عز وجل والالتزام بتعاليم الإسلام الحنيف، وأن هذا المكان أمانة في أعناقكم. فالله مطّلعٌ على كل خفيّة، وإنّ من صان عرضه ودينه في سفره وإقامته نال رضا الله وبركته. نسأل الله لكم إقامة طيبة مباركة.
    </div>
  </div>

  <div style="margin-top:6px;padding:5px 8px;background:#f8f8f8;border-radius:4px;font-size:10.5px;line-height:1.6">
    <strong>إقرار المستأجر:</strong> أقرّ أنا الموقع أدناه بأنني اطلعت على جميع بنود هذا العقد وفهمتها وقبلتها، وأتعهد بالالتزام بها كاملة طوال فترة إقامتي، وأتحمل كامل المسؤولية القانونية والمالية عن أي مخالفة.
  </div>

  <div class="signatures">
    <div class="signature-block">
      <div class="signature-label">الطرف الأول (المؤجر)</div>
      <div class="signature-line"></div>
      <div class="signature-name">إدارة فندق المفرق</div>
    </div>
    <div class="signature-block">
      <div class="signature-label">الطرف الثاني (المستأجر)</div>
      <div class="signature-line"></div>
      <div class="signature-name">${esc(r.guestName)}</div>
    </div>
  </div>

  <div class="footer-note">
    حُرر هذا العقد من نسختين أصليتين، بيد كل طرف نسخة للعمل بموجبها — تاريخ التحرير: ${todayStr}
    <br/>فندق المفرق — جميع الحقوق محفوظة © 2026
  </div>

</div>
</body>
</html>`;
}
