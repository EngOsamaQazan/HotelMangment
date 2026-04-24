/**
 * استيراد حجوزات من صور سجلات قديمة عبر OCR ثم تطبيقها على قاعدة البيانات.
 *
 * الاستخدام:
 *   node scripts/import-guests-from-images.cjs "C:\\path\\to\\folder\\with\\images"
 *
 * خيارات:
 *   --dry-run     طباعة نتائج الـ OCR والتحليل بدون كتابة في قاعدة البيانات
 *   --no-wipe     عدم حذف الحجوزات/الحركات/الصيانة قبل الاستيراد
 *
 * المتطلبات: DATABASE_URL في .env، ويفضل وجود google-vision-key.json لدقة أعلى؛
 *   وإلا يُستخدم Tesseract (أبطأ/أقل دقة).
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const {
  parseLegacyRegisterText,
  finalizeRecord,
  arabicToWestern,
} = require("./lib/legacy-register-parse.cjs");

const IMAGE_EXT = /\.(png|jpe?g|tif?f|webp|bmp)$/i;

async function ocrWithVision(imagePath) {
  const vision = require("@google-cloud/vision");
  const keyPath = path.resolve(process.cwd(), "google-vision-key.json");
  if (!fs.existsSync(keyPath)) return null;
  const client = new vision.ImageAnnotatorClient({ keyFilename: keyPath });
  const [result] = await client.textDetection({
    image: { content: fs.readFileSync(imagePath) },
  });
  return result.fullTextAnnotation?.text || "";
}

async function ocrWithTesseract(imagePath) {
  const Tesseract = require("tesseract.js");
  const {
    data: { text },
  } = await Tesseract.recognize(imagePath, "ara+eng", {
    logger: () => {},
  });
  return text || "";
}

async function ocrImage(imagePath) {
  let text = await ocrWithVision(imagePath);
  const engine = text && text.trim().length >= 8 ? "google-vision" : null;
  if (!engine) {
    text = await ocrWithTesseract(imagePath);
    return { text, engine: "tesseract" };
  }
  return { text, engine };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const noWipe = args.includes("--no-wipe");
  const folder = args.find((a) => !a.startsWith("--"));
  return { dryRun, noWipe, folder };
}

async function wipeDemoData(prisma) {
  await prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({});
    await tx.maintenance.deleteMany({});
    await tx.reservation.deleteMany({});
  });
  await prisma.unit.updateMany({
    data: { status: "available" },
  });
  console.log("تم حذف: الحركات المالية، الصيانة، الحجوزات (وبيانات الضيوف تلقائياً). تم ضبط جميع الوحدات إلى «متاح».");
}

async function main() {
  const { dryRun, noWipe, folder } = parseArgs();
  if (!folder || !fs.existsSync(folder)) {
    console.error("الاستخدام: node scripts/import-guests-from-images.cjs \"C:\\\\مسار\\\\المجلد\" [--dry-run] [--no-wipe]");
    process.exit(1);
  }

  const files = fs
    .readdirSync(folder)
    .filter((f) => IMAGE_EXT.test(f))
    .sort();
  if (files.length === 0) {
    console.error("لم يُعثر على صور (png, jpg, webp, …) في المجلد.");
    process.exit(1);
  }

  console.log(`تم العثور على ${files.length} ملفاً صورياً.\n`);

  const prisma = new PrismaClient();
  const preview = [];

  try {
    if (!dryRun && !noWipe) {
      await wipeDemoData(prisma);
    } else if (dryRun) {
      console.log("(وضع تجريبي: لن يُحذف شيء ولن يُدخل شيء)\n");
    } else {
      console.log("(--no-wipe: الاحتفاظ بالبيانات الحالية)\n");
    }

    const units = await prisma.unit.findMany();
    const unitByNumber = new Map(units.map((u) => [u.unitNumber, u]));

    let ok = 0;
    let fail = 0;

    for (const file of files) {
      const full = path.join(folder, file);
      console.log(`── ${file}`);
      const { text, engine } = await ocrImage(full);
      const trimmed = (text || "").trim();
      if (trimmed.length < 6) {
        console.log(`   تعذّر استخراج نص كافٍ (محرك: ${engine}).`);
        fail += 1;
        preview.push({ file, error: "ocr_empty", engine });
        continue;
      }

      const partial = parseLegacyRegisterText(trimmed);
      const done = finalizeRecord(partial);

      if (dryRun) {
        console.log(`   OCR [${engine}]: ${trimmed.slice(0, 220).replace(/\s+/g, " ")}…`);
        console.log(`   حقول مُستخرجة: ${JSON.stringify(partial, (_, v) => (v instanceof Date ? v.toISOString() : v))}`);
        console.log(`   بعد الإكمال: ${done ? JSON.stringify({ ...done, checkIn: done.checkIn.toISOString(), checkOut: done.checkOut.toISOString() }) : "null"}`);
        preview.push({ file, partial, finalized: done, engine });
        if (done) ok += 1;
        else fail += 1;
        continue;
      }

      if (!done) {
        console.log(`   لم يُستخرج سجل صالح. نص مطابق للمراجعة:\n   ${arabicToWestern(trimmed).slice(0, 400)}`);
        fail += 1;
        preview.push({ file, error: "parse_failed", partial });
        continue;
      }

      const unit = unitByNumber.get(done.unitNumber);
      if (!unit) {
        console.log(`   رقم الوحدة ${done.unitNumber} غير معروف في النظام (الغرف 101–109، الشقق 01–06).`);
        fail += 1;
        preview.push({ file, error: "unknown_unit", done });
        continue;
      }

      const res = await prisma.reservation.create({
        data: {
          unitId: unit.id,
          guestName: done.guestName,
          numNights: done.numNights,
          stayType: done.stayType,
          checkIn: done.checkIn,
          checkOut: done.checkOut,
          unitPrice: done.unitPrice,
          totalAmount: done.totalAmount,
          paidAmount: done.paidAmount,
          remaining: done.remaining,
          paymentMethod: done.paymentMethod,
          status: done.status,
          numGuests: done.numGuests,
          notes:
            (done.notes ? done.notes + " — " : "") +
            `استورد من صورة: ${file}`,
        },
      });

      await prisma.guest.create({
        data: {
          reservationId: res.id,
          guestOrder: 1,
          fullName: done.guestName,
          idNumber: "0000000000",
          nationality: "",
          notes: "استيراد OCR",
        },
      });

      if (done.paidAmount > 0) {
        await prisma.transaction.create({
          data: {
            date: done.checkIn,
            description: `إيجار (استيراد من ${file}) — حجز ${res.id}`,
            reservationId: res.id,
            amount: done.paidAmount,
            type: "income",
            account: "cash",
          },
        });
      }

      await prisma.unit.update({
        where: { id: unit.id },
        data: { status: done.status === "active" ? "occupied" : "available" },
      });

      console.log(`   تم إنشاء حجز #${res.id} — ${done.guestName} — وحدة ${done.unitNumber}`);
      ok += 1;
    }

    console.log(`\nاكتمل: نجح ${ok}، فشل/تجاوز ${fail}.`);

    if (dryRun) {
      const out = path.join(process.cwd(), "import-guests-preview.json");
      fs.writeFileSync(out, JSON.stringify(preview, null, 2), "utf8");
      console.log(`تم حفظ تفاصيل الوضع التجريبي في: ${out}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
