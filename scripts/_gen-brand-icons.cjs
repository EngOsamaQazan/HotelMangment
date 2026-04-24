/**
 * scripts/_gen-brand-icons.cjs
 *
 * يولّد كل أيقونات فندق المفرق انطلاقًا من صورة الهوية المعتمدة
 * الموجودة في `public/brand-icon-source.png` (المربّع الأخضر مع كاليغرافي
 * «المفرق HOTEL» الذهبي). هذه الصورة نفسها هي ما يُراد أن تظهر على شاشة
 * الموبايل الرئيسية عند تثبيت التطبيق كـ PWA.
 *
 * المخرجات:
 *   - src/app/icon.png              (512x512)  — أيقونة تبويب المتصفح
 *   - src/app/apple-icon.png        (180x180)  — iOS home screen
 *   - src/app/opengraph-image.png   (1200x630) — بطاقة المعاينة في واتساب/تويتر
 *   - src/app/twitter-image.png     (1200x630) — Twitter card
 *   - public/icon-192.png           (192x192)  — PWA Android home screen
 *   - public/icon-512.png           (512x512)  — PWA Android (any)
 *   - public/icon-maskable-512.png  (512x512)  — PWA Android adaptive (maskable)
 *   - public/whatsapp-icon.png      (512x512)  — الأيقونة الكبيرة لإشعار Web Push
 *   - public/whatsapp-badge.png     (96x96)    — شارة أحاديّة اللون (بيضاء على شفاف)
 *                                                 لشريط حالة أندرويد — بدونها
 *                                                 يظهر مربّع أبيض فارغ.
 *
 * ملاحظات:
 *   1. الشعار في الصورة الأصلية يشغل ~44% من المركز. نقصّ مربّعًا مركزيًّا
 *      من المصدر ليصبح الشعار واضحًا (~70% من مساحة الأيقونة)، مع الحفاظ
 *      على مساحة أمان (safe zone) للأيقونات القابلة للقصّ (maskable).
 *   2. في بطاقات OG/Twitter (أبعاد عريضة) نستخدم الشعار الأصلي متوسَّطًا
 *      داخل خلفية خضراء ممتدّة بنفس لون المصدر.
 */
const sharp = require("sharp");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const APP_DIR = path.join(ROOT, "src", "app");
const PUBLIC_DIR = path.join(ROOT, "public");
const SOURCE = path.join(PUBLIC_DIR, "brand-icon-source.png");

// لون خلفية الهوية (يطابق متوسّط الخلفية الخضراء في الصورة المعتمدة).
const BRAND_BG = "#0E3B33";

/**
 * نقصّ مربّعًا من مركز الصورة المصدر. نسبة الاقتصاص تحدّد كم سيملأ
 * الشعار الأيقونة النهائية.
 *   tightRatio = 0.62  → الشعار يملأ ~70% من الأيقونة (أنسب لشاشة الموبايل)
 *   tightRatio = 0.80  → فراغ أكبر حول الشعار (maskable لتوفير safe zone)
 *   tightRatio = 1.00  → استخدام الصورة كاملةً
 */
async function cropCenterSquare(tightRatio) {
  const meta = await sharp(SOURCE).metadata();
  const side = Math.min(meta.width, meta.height);
  const cropSide = Math.round(side * tightRatio);
  const left = Math.round((meta.width - cropSide) / 2);
  const top = Math.round((meta.height - cropSide) / 2);
  return sharp(SOURCE)
    .extract({ left, top, width: cropSide, height: cropSide })
    .toBuffer();
}

async function writeSquareIcon({ size, out, tightRatio = 0.62 }) {
  const cropped = await cropCenterSquare(tightRatio);
  await sharp(cropped)
    .resize(size, size, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`✓ ${path.relative(ROOT, out)}  (${size}x${size})`);
}

async function writeOgCard({ out }) {
  const width = 1200;
  const height = 630;
  // نستخدم الصورة المصدر كاملةً (1:1) ونضعها متوسَّطة داخل canvas عريض
  // بلون الهوية، لإنتاج بطاقة مشاركة أنيقة في واتساب/تويتر/iMessage.
  const logoH = Math.round(height * 0.86);
  const logo = await sharp(SOURCE)
    .resize(logoH, logoH, { fit: "cover" })
    .png()
    .toBuffer();

  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       <rect width="${width}" height="${height}" fill="${BRAND_BG}"/>
     </svg>`
  );

  await sharp(bg)
    .composite([
      {
        input: logo,
        left: Math.round((width - logoH) / 2),
        top: Math.round((height - logoH) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`✓ ${path.relative(ROOT, out)}  (${width}x${height})`);
}

(async () => {
  // icons مربّعة: الشعار محكم (tightRatio 0.62) ليظهر كبيرًا وواضحًا على الشاشة.
  await writeSquareIcon({
    size: 512,
    out: path.join(APP_DIR, "icon.png"),
  });
  await writeSquareIcon({
    size: 180,
    out: path.join(APP_DIR, "apple-icon.png"),
  });
  await writeSquareIcon({
    size: 192,
    out: path.join(PUBLIC_DIR, "icon-192.png"),
  });
  await writeSquareIcon({
    size: 512,
    out: path.join(PUBLIC_DIR, "icon-512.png"),
  });

  // maskable يحتاج safe zone أكبر (الشعار داخل دائرة ~80%)، لذلك
  // نقصّ أعرض حتى لا يُقصّ الشعار عند تطبيق قناع الأندرويد.
  await writeSquareIcon({
    size: 512,
    tightRatio: 0.9,
    out: path.join(PUBLIC_DIR, "icon-maskable-512.png"),
  });

  // الأيقونة الكبيرة لإشعار Web Push — نفس الأيقونة المربّعة مقاس 512
  // (Chrome/Android يقصّها دائريّة تلقائيًّا في الإشعار).
  await writeSquareIcon({
    size: 512,
    out: path.join(PUBLIC_DIR, "whatsapp-icon.png"),
  });

  // شارة status-bar أحاديّة اللون (requirement أندرويد): نستخرج صورة
  // أبيض على شفاف من صورة الهوية، فالأندرويد يرفض أي ألوان في الشارة
  // ويحوّلها إلى مربع أبيض فارغ إذا لم تكن بالتنسيق الصحيح.
  await writeMonochromeBadge({
    size: 96,
    out: path.join(PUBLIC_DIR, "whatsapp-badge.png"),
  });

  // بطاقات OG/Twitter بنسبة أوسع.
  await writeOgCard({ out: path.join(APP_DIR, "opengraph-image.png") });
  await writeOgCard({ out: path.join(APP_DIR, "twitter-image.png") });

  console.log("\nBrand icons generated successfully.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
