/**
 * scripts/_gen-brand-icons.cjs
 *
 * يولّد الأيقونات الرسمية لفندق المفرق — بالتصميم المبسّط الأصلي:
 * مربّع أخضر زمرّدي بحرف «م» ذهبي في المنتصف وإطار ذهبي خفيف،
 * كما كانت أيقونة التطبيق عند أوّل إصدار يُثبَّت على الموبايل.
 *
 * المخرجات:
 *   - src/app/icon.png            (512x512)  — أيقونة تبويب المتصفح
 *   - src/app/apple-icon.png      (180x180)  — iOS home screen
 *   - src/app/opengraph-image.png (1200x630) — بطاقة المعاينة
 *   - src/app/twitter-image.png   (1200x630) — Twitter card
 *   - public/icon-192.png         (192x192)  — PWA Android home screen
 *   - public/icon-512.png         (512x512)  — PWA Android (maskable)
 *
 * لضمان رسم متطابق على كل الأجهزة، نستخرج glyph حرف «م» مباشرةً من
 * خط Amiri (node_modules/@fontsource/amiri) كمسار SVG، بدلاً من الاعتماد
 * على خطوط النظام التي قد تختلف من جهاز لآخر.
 */
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const opentype = require("opentype.js");

const ROOT = path.resolve(__dirname, "..");
const APP_DIR = path.join(ROOT, "src", "app");
const PUBLIC_DIR = path.join(ROOT, "public");

const EMERALD = "#0E3B33";
const EMERALD_DARK = "#0B2F29";
const GOLD = "#D4B273";

const FONT_PATH = path.join(
  ROOT,
  "node_modules",
  "@fontsource",
  "amiri",
  "files",
  "amiri-arabic-700-normal.woff"
);

/**
 * يستخرج مسار SVG لحرف معيّن من ملف الخط، ويُعيد مربّعه المحيط
 * لنستطيع توسيطه داخل canvas الأيقونة بدقّة.
 *
 * opentype.js يعمل مع WOFF مباشرة؛ المنسّقات الأعقد (WOFF2) غير مدعومة.
 */
function extractGlyph(char) {
  const buffer = fs.readFileSync(FONT_PATH);
  // opentype يحتاج ArrayBuffer
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
  const font = opentype.parse(ab);
  const glyph = font.charToGlyph(char);
  // نرسم الحرف في unitsPerEm كامل، ثم نستخرج الـ path.
  const fontSize = font.unitsPerEm; // 1000 عادة
  // baseline عند y = fontSize (في إحداثيات opentype ascender/descender).
  const svgPath = glyph.getPath(0, fontSize, fontSize);
  const bbox = svgPath.getBoundingBox();
  return {
    d: svgPath.toPathData(3),
    bbox,
  };
}

const MEEM = extractGlyph("م");

function buildSvg({ width, height, caption = null }) {
  const side = Math.min(width, height);
  const cornerRadius = Math.round(side * 0.18);
  const borderOffset = Math.round(side * 0.035);
  const borderRadius = Math.round(side * 0.14);
  const borderStroke = Math.max(2, Math.round(side * 0.012));

  // نوسِّط glyph الميم داخل المربّع: نحسب الإطار الحقيقي للحرف ثم نقيسه.
  // الميم المعزولة في Amiri طويلة عموديًّا بسبب ذيل الـ descender، لذا
  // نجعل الارتفاع (لا العرض) هو المعيار لنحصل على أيقونة متوازنة.
  const glyphW = MEEM.bbox.x2 - MEEM.bbox.x1;
  const glyphH = MEEM.bbox.y2 - MEEM.bbox.y1;
  const targetHeight = side * 0.58;
  const scale = targetHeight / glyphH;
  const drawnW = glyphW * scale;
  const drawnH = glyphH * scale;

  const captionOffset = caption ? side * 0.06 : 0;
  const glyphTx = (width - drawnW) / 2 - MEEM.bbox.x1 * scale;
  const glyphTy = (height - drawnH) / 2 - MEEM.bbox.y1 * scale - captionOffset;

  const underlineWidth = Math.round(side * 0.28);
  const underlineHeight = Math.max(1, Math.round(side * 0.008));
  const underlineX = (width - underlineWidth) / 2;
  const underlineY =
    (height - drawnH) / 2 - captionOffset + drawnH + side * 0.045;

  const captionSvg = caption
    ? `<text x="${width / 2}" y="${height * 0.88}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(
        side * 0.07
      )}" fill="${GOLD}" text-anchor="middle" font-weight="700" letter-spacing="10">${caption}</text>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${EMERALD}"/>
      <stop offset="100%" stop-color="${EMERALD_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="${cornerRadius}" fill="url(#bg)"/>
  <rect x="${borderOffset}" y="${borderOffset}"
        width="${width - 2 * borderOffset}" height="${height - 2 * borderOffset}"
        fill="none" stroke="${GOLD}" stroke-width="${borderStroke}"
        stroke-opacity="0.55" rx="${borderRadius}"/>
  <g transform="translate(${glyphTx} ${glyphTy}) scale(${scale})">
    <path d="${MEEM.d}" fill="${GOLD}"/>
  </g>
  <rect x="${underlineX}" y="${underlineY}"
        width="${underlineWidth}" height="${underlineHeight}" fill="${GOLD}"/>
  ${captionSvg}
</svg>`;
}

async function renderTo({ width, height, out, caption }) {
  const svg = buildSvg({ width, height, caption });
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log(`✓ ${path.relative(ROOT, out)}  (${width}x${height})`);
}

(async () => {
  await renderTo({ width: 512, height: 512, out: path.join(APP_DIR, "icon.png") });
  await renderTo({ width: 180, height: 180, out: path.join(APP_DIR, "apple-icon.png") });
  await renderTo({ width: 192, height: 192, out: path.join(PUBLIC_DIR, "icon-192.png") });
  await renderTo({ width: 512, height: 512, out: path.join(PUBLIC_DIR, "icon-512.png") });

  await renderTo({
    width: 1200,
    height: 630,
    caption: "AL MAFRAQ HOTEL",
    out: path.join(APP_DIR, "opengraph-image.png"),
  });
  await renderTo({
    width: 1200,
    height: 630,
    caption: "AL MAFRAQ HOTEL",
    out: path.join(APP_DIR, "twitter-image.png"),
  });

  console.log("\nBrand icons generated successfully.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
