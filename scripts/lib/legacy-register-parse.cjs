/**
 * استخراج حقول سجل الحجز القديم من نص OCR (عربي/إنجليزي، أرقام عربية/هندية).
 * يعيد كائناً جزئياً؛ السكربت الرئيسي يكمّل القيم الناقصة.
 */

function arabicToWestern(text) {
  const map = {
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
    "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  };
  return text.replace(/[٠-٩۰-۹]/g, (ch) => map[ch] || ch);
}

const UNIT_RE = /\b(10[1-9]|0[1-6])\b/;

function parseMoneyLine(line) {
  const w = arabicToWestern(line).replace(/,/g, "");
  const nums = w.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  return parseFloat(nums[nums.length - 1]);
}

function parseDateTimeParts(str) {
  const w = arabicToWestern(str);
  const dm = w.match(
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/,
  );
  let d = null;
  if (dm) {
    const day = parseInt(dm[1], 10);
    const month = parseInt(dm[2], 10) - 1;
    let year = parseInt(dm[3], 10);
    if (year < 100) year += 2000;
    d = new Date(year, month, day);
  }
  const tm = w.match(/(\d{1,2})[:؛؛.](\d{2})/);
  if (d && tm) {
    d.setHours(parseInt(tm[1], 10), parseInt(tm[2], 10), 0, 0);
  } else if (d) {
    d.setHours(14, 0, 0, 0);
  }
  return d;
}

function findBestArabicName(lines) {
  let best = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!/[\u0621-\u064A]/.test(line)) continue;
    if (/دينار|فلس|د\.|مدفوع|تاريخ|ساعة|غرفة|شقة|مدة|ملاحظات|الإجمالي|المجموع/i.test(line)) continue;
    const cleaned = line
      .replace(/[^\u0621-\u064A\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const parts = cleaned.split(/\s+/).filter((x) => x.length >= 2);
    if (parts.length < 2 || parts.length > 12) continue;
    if (cleaned.length > best.length) best = cleaned;
  }
  return best || null;
}

/**
 * @param {string} fullText
 * @returns {Record<string, unknown>}
 */
function parseLegacyRegisterText(fullText) {
  const text = arabicToWestern(fullText);
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out = {
    guestName: null,
    unitNumber: null,
    numNights: null,
    unitPrice: null,
    totalAmount: null,
    paidAmount: null,
    checkIn: null,
    checkOut: null,
    notes: null,
    stayType: "daily",
  };

  const joined = text.replace(/\s+/g, " ");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // اسم / نزيل / ضيف
    if (
      /^(ال)?(اسم|نزيل|ضيف|المستأجر|الزائر|العميل)\s*[:：\-–]?\s*/i.test(line) ||
      /\b(name|guest)\s*[:：]/i.test(line)
    ) {
      const rest = line
        .replace(/^.*?(?:الاسم|اسم|نزيل|ضيف|المستأجر|الزائر|العميل|name|guest)\s*[:：\-–]?\s*/i, "")
        .trim();
      if (rest.length >= 3 && /[\u0621-\u064A]/.test(rest)) {
        out.guestName = rest.replace(/\s+/g, " ");
      }
    }

    if (
      /(غرفة|شقة|شقه|وحدة|الغرفة|رقم\s*الشقة|رقم\s*الغرفة|r\.?\s*oom|apartment)/i.test(
        line,
      )
    ) {
      const m = line.match(UNIT_RE);
      if (m) out.unitNumber = m[1];
    }

    if (/(دخول|وصول|من\s*تاريخ|check\s*-?in)/i.test(line)) {
      const d = parseDateTimeParts(line);
      if (d) out.checkIn = d;
    }

    if (/(خروج|مغادرة|إلى\s*تاريخ|check\s*-?out)/i.test(line)) {
      const d = parseDateTimeParts(line);
      if (d) out.checkOut = d;
    }

    if (
      /(أجر|إيجار\s*يومي|يومي|السعر\s*اليومي|سعر\s*اليوم|daily)/i.test(
        line,
      )
    ) {
      const v = parseMoneyLine(line);
      if (v != null && v > 0 && v < 100000) out.unitPrice = v;
    }

    if (/(إجمالي|المجموع|مبلغ\s*الإيجار|الكل)/i.test(line)) {
      const v = parseMoneyLine(line);
      if (v != null && v > 0 && v < 1000000) out.totalAmount = v;
    }

    if (/(مدفوع|واصل|المبلغ\s*المدفوع|المدفوع|paid)/i.test(line)) {
      const v = parseMoneyLine(line);
      if (v != null && v >= 0 && v < 1000000) out.paidAmount = v;
    }

    if (/(مدة|ليالي|ليالي|ليلة|nights?)/i.test(line)) {
      const m = arabicToWestern(line).match(/(\d+)\s*(ليالي|ليلة|يوم|أيام|night)?/i);
      if (m) out.numNights = parseInt(m[1], 10);
    }

    if (/(شهري|شهر|monthly)/i.test(lower)) out.stayType = "monthly";
    else if (/(أسبوعي|أسبوع|weekly)/i.test(lower)) out.stayType = "weekly";

    if (/(ملاحظات|ملاحظة|notes?)/i.test(line)) {
      const rest = line.replace(/^.*?(ملاحظات|ملاحظة|notes?)\s*[:：\-–]?\s*/i, "").trim();
      if (rest.length > 0) out.notes = rest;
    }
  }

  if (!out.unitNumber) {
    const m = joined.match(UNIT_RE);
    if (m) out.unitNumber = m[1];
  }

  if (!out.guestName) {
    out.guestName = findBestArabicName(lines);
  }

  // تاريخ من سطر لاحق إن وُجدت كلمات دخول/خروج بلا رقم في نفس السطر
  for (let i = 0; i < lines.length; i++) {
    if (/دخول|وصول|check\s*-?in/i.test(lines[i]) && !out.checkIn) {
      const next = lines[i + 1];
      if (next) {
        const d = parseDateTimeParts(next);
        if (d) out.checkIn = d;
      }
    }
    if (/خروج|مغادرة|check\s*-?out/i.test(lines[i]) && !out.checkOut) {
      const next = lines[i + 1];
      if (next) {
        const d = parseDateTimeParts(next);
        if (d) out.checkOut = d;
      }
    }
  }

  return out;
}

function diffNightsDays(checkIn, checkOut) {
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  const n = Math.round((b.getTime() - a.getTime()) / 86400000);
  return Math.max(1, n);
}

/**
 * يكمّل الحقول ويحسب المبالغ حسب نوع الإقامة.
 */
function finalizeRecord(partial) {
  const guestName = partial.guestName
    ? String(partial.guestName).trim()
    : null;
  const unitNumber = partial.unitNumber
    ? String(partial.unitNumber).trim()
    : null;
  if (!guestName || !unitNumber) return null;

  let checkIn = partial.checkIn ? new Date(partial.checkIn) : null;
  let checkOut = partial.checkOut ? new Date(partial.checkOut) : null;
  const stayType = partial.stayType || "daily";

  let numNights =
    partial.numNights != null ? Math.max(1, Number(partial.numNights)) : null;

  if (checkIn && checkOut) {
    const dn = diffNightsDays(checkIn, checkOut);
    if (!numNights || numNights < 1) numNights = dn;
  } else if (checkIn && numNights && !checkOut) {
    const co = new Date(checkIn);
    if (stayType === "monthly") co.setMonth(co.getMonth() + numNights);
    else if (stayType === "weekly") co.setDate(co.getDate() + numNights * 7);
    else co.setDate(co.getDate() + numNights);
    checkOut = co;
  }

  if (!checkIn || !checkOut) return null;

  if (!numNights || numNights < 1) {
    numNights = diffNightsDays(checkIn, checkOut);
  }

  let unitPrice = partial.unitPrice != null ? Number(partial.unitPrice) : null;
  let totalAmount =
    partial.totalAmount != null ? Number(partial.totalAmount) : null;
  const paidAmount =
    partial.paidAmount != null && !Number.isNaN(Number(partial.paidAmount))
      ? Number(partial.paidAmount)
      : 0;

  if (unitPrice == null && totalAmount != null && numNights > 0) {
    unitPrice = Math.round((totalAmount / numNights) * 100) / 100;
  }
  if (totalAmount == null && unitPrice != null && numNights > 0) {
    totalAmount = Math.round(unitPrice * numNights * 100) / 100;
  }
  if (unitPrice == null || totalAmount == null) return null;

  const remaining = Math.round((totalAmount - paidAmount) * 100) / 100;

  const now = new Date();
  const status = checkOut < now ? "completed" : "active";

  return {
    guestName,
    unitNumber,
    numNights,
    stayType,
    checkIn,
    checkOut,
    unitPrice,
    totalAmount,
    paidAmount,
    remaining,
    paymentMethod: "نقد",
    status,
    numGuests: 1,
    notes: partial.notes ? String(partial.notes).slice(0, 2000) : null,
  };
}

module.exports = {
  arabicToWestern,
  parseLegacyRegisterText,
  finalizeRecord,
  UNIT_RE,
};
