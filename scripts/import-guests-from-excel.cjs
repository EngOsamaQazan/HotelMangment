/**
 * استيراد سجل الضيوف من ملف Excel (سجل ضيوف فندق المفرق - شهر 4/2026).
 *
 * المعمارية المُحترَمة:
 *   - Unit      : تُنشَأ الوحدات المفقودة تلقائياً (room أو apartment) بدون حذف القائمة الحالية.
 *   - Reservation: صف واحد = حجز واحد. stayType=daily (كل القيم يومية في هذا الملف).
 *   - Guest     : ضيف رئيسي واحد لكل حجز (guestOrder=1).
 *   - Transaction: دخل نقدي (income/cash) بمبلغ المدفوع في تاريخ الدخول.
 *   - حالة الحجز: completed إذا مرّ checkOut (كل الصفوف فيها "غادر")، وإلا active.
 *
 * الاستخدام:
 *   node scripts/import-guests-from-excel.cjs <path-to-xlsx> [--dry-run] [--no-wipe]
 *
 * --dry-run: يعاين فقط ويحفظ تقريراً JSON بدون كتابة.
 * --no-wipe: لا يحذف الحجوزات الحالية قبل الاستيراد (الافتراضي: تنظيف الحجوزات/الضيوف/الحركات/الصيانة).
 */

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

// ----- أدوات صغيرة -----

function arabicToWestern(text) {
  const map = {
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
    "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  };
  return String(text).replace(/[٠-٩۰-۹]/g, (ch) => map[ch] || ch);
}

function str(v) {
  if (v == null) return "";
  return arabicToWestern(String(v)).trim();
}

function parseInteger(v, fallback = null) {
  const s = str(v).replace(/\D+/g, "");
  if (!s) return fallback;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseFloatSafe(v, fallback = null) {
  const s = str(v).replace(/[^0-9.]/g, "");
  if (!s) return fallback;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}

function parseExcelDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(Date.UTC(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, d.S || 0));
  }
  const s = str(v);
  // الشكل المتوقع من xlsx مع raw:false: YYYY-MM-DD
  const m = s.match(/(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
  if (m) {
    return new Date(Date.UTC(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * يحوّل سلسلة وقت عربية (3:00م، 10:00م، 10:00، 12:00) إلى {h,m}.
 * "م" = PM ، "ص" = AM. بدون لاحقة → 24 ساعة.
 */
function parseTime(v, defaultHour, defaultMinute = 0) {
  if (v == null || v === "") return { h: defaultHour, m: defaultMinute, missing: true };
  const s = str(v);
  const hasPM = /[م]|pm|p\.m/i.test(s);
  const hasAM = /[ص]|am|a\.m/i.test(s);
  const m = s.match(/(\d{1,2})\s*[:;]\s*(\d{1,2})?/);
  if (!m) return { h: defaultHour, m: defaultMinute, missing: true };
  let h = parseInt(m[1], 10);
  const mm = m[2] ? parseInt(m[2], 10) : 0;
  if (hasPM) {
    if (h < 12) h += 12;
  } else if (hasAM) {
    if (h === 12) h = 0;
  }
  if (h < 0 || h > 23) h = defaultHour;
  return { h, m: mm, missing: false };
}

function combineDateTime(date, t) {
  if (!date) return null;
  const d = new Date(date);
  d.setUTCHours(t.h, t.m, 0, 0);
  return d;
}

function diffNights(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  da.setUTCHours(0, 0, 0, 0);
  db.setUTCHours(0, 0, 0, 0);
  return Math.max(1, Math.round((db - da) / 86400000));
}

// ----- قراءة الإكسل -----

function readRegister(file) {
  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false,
  });

  // ابحث عن صف الرؤوس
  let headerIdx = rows.findIndex(
    (r) =>
      Array.isArray(r) &&
      r.some(
        (c) =>
          typeof c === "string" &&
          (c.includes("اسم الضيف") || c.includes("اسم النزيل")),
      ),
  );
  if (headerIdx === -1) headerIdx = 2;

  const COL = {
    page: 0,
    serial: 1,
    guest: 2,
    unit: 3,
    nights: 4,
    daily: 5,
    paid: 6,
    checkInDate: 7,
    checkInTime: 8,
    checkOutDate: 9,
    checkOutTime: 10,
    notes: 11,
  };

  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.every((c) => c == null || String(c).trim() === "")) continue;
    const guestCell = str(r[COL.guest]);
    if (!guestCell || /الإجمالي|المجموع|اجمالي/i.test(guestCell)) continue;

    out.push({
      __rowIndex: i + 1, // للاستخدام في السجلات
      page: str(r[COL.page]) || null,
      serial: str(r[COL.serial]) || null,
      guestName: guestCell,
      unitRaw: str(r[COL.unit]),
      nights: parseInteger(r[COL.nights], 1),
      daily: parseFloatSafe(r[COL.daily]),
      paid: parseFloatSafe(r[COL.paid]) ?? 0,
      checkInDate: parseExcelDate(r[COL.checkInDate]),
      checkInTime: r[COL.checkInTime],
      checkOutDate: parseExcelDate(r[COL.checkOutDate]),
      checkOutTime: r[COL.checkOutTime],
      notes: str(r[COL.notes]) || null,
    });
  }
  return out;
}

// ----- معالجة رقم الوحدة -----

/** يوحّد شكل رقم الوحدة ليطابق التخزين في النظام (مثلاً "2" → "02"). */
function normalizeUnitNumber(u) {
  const s = String(u || "").trim();
  if (!s) return s;
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    if (n >= 1 && n <= 9) return "0" + n;
  }
  return s;
}

function splitUnit(unitRaw) {
  if (!unitRaw) return [];
  const parts = unitRaw
    .split(/[\/,+\\]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(normalizeUnitNumber);
  return parts.length ? parts : [normalizeUnitNumber(unitRaw)];
}

function classifyUnitType(unitNumber) {
  if (/^\d+$/.test(unitNumber)) {
    const n = parseInt(unitNumber, 10);
    if (unitNumber.length >= 3 || n >= 100) return "apartment";
    return "room";
  }
  return "room"; // للحالات النصية مثل "كنف"
}

function unitFloor(unitNumber) {
  if (/^\d+$/.test(unitNumber)) {
    const n = parseInt(unitNumber, 10);
    if (n >= 100 && n < 200) return 1;
    if (n >= 200 && n < 300) return 2;
    if (n >= 10 && n < 20) return 0;
    return 1;
  }
  return 1;
}

// ----- التنفيذ -----

function buildReservations(rows) {
  const records = [];
  const issues = [];
  for (const r of rows) {
    if (!r.guestName) continue;
    const units = splitUnit(r.unitRaw);
    if (units.length === 0) {
      issues.push({ row: r.__rowIndex, reason: "no unit", data: r });
      continue;
    }
    if (!r.checkInDate) {
      issues.push({ row: r.__rowIndex, reason: "no check-in date", data: r });
      continue;
    }
    const tIn = parseTime(r.checkInTime, 14, 0);
    const checkIn = combineDateTime(r.checkInDate, tIn);
    let checkOut = null;
    if (r.checkOutDate) {
      const tOut = parseTime(r.checkOutTime, 12, 0);
      checkOut = combineDateTime(r.checkOutDate, tOut);
    } else if (r.nights && checkIn) {
      const co = new Date(checkIn);
      co.setUTCDate(co.getUTCDate() + r.nights);
      co.setUTCHours(12, 0, 0, 0);
      checkOut = co;
    }
    if (!checkOut) {
      issues.push({ row: r.__rowIndex, reason: "no check-out date", data: r });
      continue;
    }
    const computedNights = diffNights(checkIn, checkOut);
    const nights = r.nights && r.nights > 0 ? r.nights : computedNights;

    if (r.daily == null) {
      issues.push({ row: r.__rowIndex, reason: "no daily price", data: r });
      continue;
    }
    const perUnit = units.length;
    // لو تعدد الوحدات: نوزّع المبلغ والأجرة بالتساوي
    const dailyPerUnit = Math.round((r.daily / perUnit) * 100) / 100;
    const paidPerUnit = Math.round((r.paid / perUnit) * 100) / 100;

    const now = new Date();
    const status = checkOut < now ? "completed" : "active";
    const groupId = units.length > 1 ? `XL-${r.page || ""}-${r.serial || ""}` : null;

    for (const u of units) {
      const total = Math.round(dailyPerUnit * nights * 100) / 100;
      const remaining = Math.round((total - paidPerUnit) * 100) / 100;
      records.push({
        sourceRow: r.__rowIndex,
        sourcePage: r.page,
        sourceSerial: r.serial,
        unitNumber: u,
        guestName: r.guestName,
        numNights: nights,
        stayType: "daily",
        checkIn,
        checkOut,
        unitPrice: dailyPerUnit,
        totalAmount: total,
        paidAmount: paidPerUnit,
        remaining,
        paymentMethod: "نقد",
        status,
        numGuests: 1,
        groupId,
        notes: [
          r.notes,
          r.page ? `صفحة السجل: ${r.page}` : null,
          paidPerUnit > total ? `تحذير: المبلغ المدفوع (${paidPerUnit}) أكبر من الإجمالي (${total}) حسب السجل الأصلي` : null,
        ]
          .filter(Boolean)
          .join(" — "),
      });
    }
  }
  return { records, issues };
}

async function ensureUnits(prisma, records, dryRun) {
  const existing = await prisma.unit.findMany();
  const have = new Map(existing.map((u) => [u.unitNumber, u]));
  const needed = new Set(records.map((r) => r.unitNumber));
  const toCreate = [];
  for (const n of needed) {
    if (!have.has(n)) {
      toCreate.push({
        unitNumber: n,
        unitType: classifyUnitType(n),
        status: "available",
        floor: unitFloor(n),
        description: `وحدة رقم ${n} (فرع المفرق)`,
      });
    }
  }
  if (toCreate.length > 0) {
    console.log(
      `سيتم إنشاء ${toCreate.length} وحدة مفقودة: ` +
        toCreate.map((u) => `${u.unitNumber}(${u.unitType})`).join("، "),
    );
    if (!dryRun) {
      for (const u of toCreate) {
        const created = await prisma.unit.create({ data: u });
        have.set(created.unitNumber, created);
      }
    }
  }
  return have;
}

async function wipeIfNeeded(prisma, doWipe) {
  if (!doWipe) return;
  await prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({});
    await tx.maintenance.deleteMany({});
    await tx.guest.deleteMany({});
    await tx.reservation.deleteMany({});
  });
  await prisma.unit.updateMany({ data: { status: "available" } });
  console.log("تم تنظيف: الحجوزات، الضيوف، الحركات، الصيانة (قبل الاستيراد).");
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const noWipe = args.includes("--no-wipe");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("الاستخدام: node scripts/import-guests-from-excel.cjs <xlsx> [--dry-run] [--no-wipe]");
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`الملف غير موجود: ${file}`);
    process.exit(1);
  }

  const rawRows = readRegister(file);
  console.log(`عدد صفوف البيانات المقروءة من الإكسل: ${rawRows.length}`);

  const { records, issues } = buildReservations(rawRows);
  console.log(`عدد الحجوزات المقترحة للإدخال: ${records.length}`);
  if (issues.length) {
    console.log(`\nصفوف لم تُعالج (${issues.length}):`);
    for (const it of issues) console.log(`  صف ${it.row}: ${it.reason}`);
  }

  const prisma = new PrismaClient();
  try {
    const sample = records.slice(0, 3).map((r) => ({
      ...r,
      checkIn: r.checkIn.toISOString(),
      checkOut: r.checkOut.toISOString(),
    }));
    console.log("\nعيّنة من أول 3 حجوزات:");
    console.log(JSON.stringify(sample, null, 2));

    if (dryRun) {
      const report = { records: records.map((r) => ({ ...r, checkIn: r.checkIn.toISOString(), checkOut: r.checkOut.toISOString() })), issues };
      const out = path.join(process.cwd(), "excel-import-preview.json");
      fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
      console.log(`\n(--dry-run) لم تُكتب أي بيانات. التقرير: ${out}`);
      return;
    }

    await wipeIfNeeded(prisma, !noWipe);
    const unitMap = await ensureUnits(prisma, records, false);

    let inserted = 0;
    let withIncome = 0;
    for (const r of records) {
      const unit = unitMap.get(r.unitNumber);
      if (!unit) {
        console.warn(`تخطّي حجز: وحدة ${r.unitNumber} غير موجودة.`);
        continue;
      }
      const res = await prisma.reservation.create({
        data: {
          unitId: unit.id,
          guestName: r.guestName,
          numNights: r.numNights,
          stayType: r.stayType,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          unitPrice: r.unitPrice,
          totalAmount: r.totalAmount,
          paidAmount: r.paidAmount,
          remaining: r.remaining,
          paymentMethod: r.paymentMethod,
          status: r.status,
          groupId: r.groupId,
          numGuests: r.numGuests,
          notes: r.notes || null,
        },
      });
      await prisma.guest.create({
        data: {
          reservationId: res.id,
          guestOrder: 1,
          fullName: r.guestName,
          idNumber: "0000000000",
          nationality: "",
          notes: r.sourcePage ? `من سجل يدوي صفحة ${r.sourcePage}` : null,
        },
      });
      if (r.paidAmount > 0) {
        await prisma.transaction.create({
          data: {
            date: r.checkIn,
            description: `إيجار وحدة ${r.unitNumber} — ${r.guestName} (حجز ${res.id})`,
            reservationId: res.id,
            amount: r.paidAmount,
            type: "income",
            account: "cash",
          },
        });
        withIncome += 1;
      }
      // الحالة النهائية للوحدة: لو الحجز active أصبحت occupied
      if (r.status === "active") {
        await prisma.unit.update({ where: { id: unit.id }, data: { status: "occupied" } });
      }
      inserted += 1;
    }

    console.log(`\nأُدرج ${inserted} حجزاً، منها ${withIncome} حركة دخل.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
