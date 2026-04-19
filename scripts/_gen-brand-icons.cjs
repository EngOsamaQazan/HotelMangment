/**
 * scripts/_gen-brand-icons.cjs
 *
 * يولّد الأيقونات الرسمية لفندق المفرق انطلاقاً من public/logo.png:
 *   - src/app/icon.png           (512x512) — أيقونة تبويب المتصفح الحديثة
 *   - src/app/apple-icon.png     (180x180) — iOS home screen
 *   - src/app/opengraph-image.png (1200x630) — بطاقة المعاينة (واتساب/تويتر/iMessage)
 *   - src/app/favicon.ico        — (يُحذف لأنّ icon.png أحدث وأوضح)
 *
 * الخلفية أخضر زمرّدي (#0E3B33) مع إطار ذهبي خفيف لمطابقة الهوية البصرية.
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LOGO = path.join(ROOT, "public", "logo.png");
const APP_DIR = path.join(ROOT, "src", "app");

const EMERALD = "#0E3B33";
const EMERALD_DARK = "#092923";
const GOLD = "#D4B273";

async function compose({ size, logoScale = 0.7, out, caption = null }) {
  const [w, h] = Array.isArray(size) ? size : [size, size];
  const logoW = Math.round(Math.min(w, h) * logoScale);

  const logo = await sharp(LOGO)
    .resize({ width: logoW, withoutEnlargement: false })
    .png()
    .toBuffer();

  const logoMeta = await sharp(logo).metadata();
  const logoH = logoMeta.height ?? logoW;

  // Center logo; if caption, shift slightly up
  const shiftY = caption ? Math.round(h * 0.06) : 0;
  const top = Math.round((h - logoH) / 2 - shiftY);
  const left = Math.round((w - logoW) / 2);

  // Build SVG background: emerald gradient + subtle gold border + optional caption
  const captionSvg = caption
    ? `<text x="${w / 2}" y="${h * 0.82}" font-family="Arial, sans-serif" font-size="${Math.round(
        h * 0.07
      )}" fill="${GOLD}" text-anchor="middle" font-weight="700" letter-spacing="12">${caption}</text>`
    : "";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs>
        <radialGradient id="bg" cx="50%" cy="35%" r="85%">
          <stop offset="0%" stop-color="#155A4C"/>
          <stop offset="55%" stop-color="${EMERALD}"/>
          <stop offset="100%" stop-color="${EMERALD_DARK}"/>
        </radialGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#bg)"/>
      <rect x="${Math.round(w * 0.02)}" y="${Math.round(h * 0.02)}"
            width="${Math.round(w * 0.96)}" height="${Math.round(h * 0.96)}"
            fill="none" stroke="${GOLD}" stroke-width="${Math.max(
    2,
    Math.round(Math.min(w, h) * 0.006)
  )}" stroke-opacity="0.55" rx="${Math.round(Math.min(w, h) * 0.04)}"/>
      ${captionSvg}
    </svg>`;

  const bg = Buffer.from(svg);

  await sharp(bg)
    .composite([{ input: logo, top, left }])
    .png()
    .toFile(out);

  console.log(`✓ ${path.relative(ROOT, out)}  (${w}x${h})`);
}

(async () => {
  if (!fs.existsSync(LOGO)) {
    console.error("✗ public/logo.png not found");
    process.exit(1);
  }

  await compose({
    size: 512,
    logoScale: 0.72,
    out: path.join(APP_DIR, "icon.png"),
  });

  await compose({
    size: 180,
    logoScale: 0.78,
    out: path.join(APP_DIR, "apple-icon.png"),
  });

  await compose({
    size: [1200, 630],
    logoScale: 0.55,
    out: path.join(APP_DIR, "opengraph-image.png"),
  });

  // twitter-image same spec as OG
  await compose({
    size: [1200, 630],
    logoScale: 0.55,
    out: path.join(APP_DIR, "twitter-image.png"),
  });

  console.log("\nBrand icons generated successfully.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
