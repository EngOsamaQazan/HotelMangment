#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * setup-env.cjs
 * -----------------------------------------------------------
 * سكريبت تفاعلي لإنشاء ملف البيئة المحلي (.env.local) للمطوّرين.
 *
 * الاستخدام:
 *   npm run setup:env
 *
 * السلوك:
 *   • يتحقق من وجود .env.example (يتطلبه)
 *   • يسأل المستخدم عن إعدادات قاعدة البيانات المحلية
 *   • يولّد NEXTAUTH_SECRET عشوائياً آمناً
 *   • يكتب النتيجة إلى .env.local (يسأل قبل الكتابة فوق موجود)
 *
 * هذا الملف خاص بالتطوير المحلي فقط — الإنتاج يستخدم /opt/hotel-app/.env
 * المُنشأ يدوياً على السيرفر (راجع docs/DEPLOY.md).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const EXAMPLE_PATH = path.join(ROOT, ".env.example");
const TARGET_PATH = path.join(ROOT, ".env.local");

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

function log(msg) {
  console.log(msg);
}

function ok(msg) {
  log(`${GREEN}✓${RESET} ${msg}`);
}

function warn(msg) {
  log(`${YELLOW}!${RESET} ${msg}`);
}

function err(msg) {
  log(`${RED}✗${RESET} ${msg}`);
}

function title(msg) {
  log(`\n${BOLD}${CYAN}${msg}${RESET}`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question, defaultValue = "") {
  const suffix = defaultValue ? ` ${DIM}[${defaultValue}]${RESET}` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      const trimmed = (answer || "").trim();
      resolve(trimmed || defaultValue);
    });
  });
}

function askYesNo(question, defaultYes = true) {
  const hint = defaultYes ? "Y/n" : "y/N";
  return new Promise((resolve) => {
    rl.question(`${question} ${DIM}[${hint}]${RESET}: `, (answer) => {
      const a = (answer || "").trim().toLowerCase();
      if (!a) return resolve(defaultYes);
      resolve(a === "y" || a === "yes");
    });
  });
}

function generateSecret(bytes = 48) {
  return crypto.randomBytes(bytes).toString("base64");
}

function buildDatabaseUrl({ user, password, host, port, db }) {
  const encUser = encodeURIComponent(user);
  const encPass = encodeURIComponent(password);
  return `postgresql://${encUser}:${encPass}@${host}:${port}/${db}?schema=public`;
}

async function main() {
  log(
    `\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`,
  );
  log(`${BOLD}  إعداد بيئة التطوير المحلي — Hotel App${RESET}`);
  log(
    `${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`,
  );

  if (!fs.existsSync(EXAMPLE_PATH)) {
    err("ملف .env.example غير موجود في جذر المشروع.");
    process.exit(1);
  }

  if (fs.existsSync(TARGET_PATH)) {
    warn("الملف .env.local موجود بالفعل.");
    const overwrite = await askYesNo(
      "هل تريد استبداله بإعداد جديد؟",
      false,
    );
    if (!overwrite) {
      log(`\n${DIM}تم الإلغاء. لم يتم تعديل أي ملف.${RESET}\n`);
      rl.close();
      return;
    }
    const backup = `${TARGET_PATH}.backup-${Date.now()}`;
    fs.copyFileSync(TARGET_PATH, backup);
    ok(`نُسخت النسخة القديمة احتياطياً إلى: ${path.basename(backup)}`);
  }

  title("١) إعدادات قاعدة البيانات المحلية (PostgreSQL)");
  log(
    `${DIM}تأكد من تشغيل PostgreSQL محلياً وأن القاعدة موجودة.${RESET}`,
  );

  const dbHost = await ask("عنوان قاعدة البيانات", "127.0.0.1");
  const dbPort = await ask("المنفذ", "5432");
  const dbName = await ask("اسم القاعدة", "fakher_hotel_dev");
  const dbUser = await ask("اسم المستخدم", "postgres");
  const dbPass = await ask("كلمة المرور (اتركها فارغة إن لم تكن مطلوبة)", "");

  const databaseUrl = buildDatabaseUrl({
    user: dbUser,
    password: dbPass,
    host: dbHost,
    port: dbPort,
    db: dbName,
  });

  title("٢) إعدادات NextAuth");
  const genSecret = await askYesNo(
    "توليد NEXTAUTH_SECRET عشوائي آمن؟",
    true,
  );
  const nextAuthSecret = genSecret
    ? generateSecret(48)
    : await ask(
        "أدخل NEXTAUTH_SECRET يدوياً (32 حرف على الأقل)",
        generateSecret(48),
      );

  const nextAuthUrl = await ask(
    "NEXTAUTH_URL (رابط التطبيق محلياً)",
    "http://localhost:3000",
  );
  const publicSiteUrl = await ask(
    "NEXT_PUBLIC_SITE_URL",
    nextAuthUrl,
  );

  title("٣) إعدادات Realtime (Socket.IO)");
  const realtimePort = await ask("REALTIME_PORT", "3001");
  const realtimeHost = await ask("REALTIME_HOST", "127.0.0.1");

  // ── بناء محتوى الملف ─────────────────────────────────────
  const now = new Date().toISOString();
  const content = [
    "# ============================================================",
    "#  .env.local — إعداد جهاز المطوّر المحلي (مُولّد تلقائياً)",
    `#  أُنشئ في: ${now}`,
    "#  ⚠️ لا ترفع هذا الملف إلى Git.",
    "# ============================================================",
    "",
    "NODE_ENV=development",
    "",
    "# ── قاعدة البيانات ───────────────────────────────────────────",
    `DATABASE_URL="${databaseUrl}"`,
    "",
    "# ── NextAuth ────────────────────────────────────────────────",
    `NEXTAUTH_SECRET=${nextAuthSecret}`,
    `NEXTAUTH_URL=${nextAuthUrl}`,
    "",
    "# ── Public ──────────────────────────────────────────────────",
    `NEXT_PUBLIC_SITE_URL=${publicSiteUrl}`,
    "",
    "# ── Booking Encryption (اختياري) ────────────────────────────",
    "BOOKING_ENC_KEY=",
    "",
    "# ── Realtime (Socket.IO) ────────────────────────────────────",
    `REALTIME_PORT=${realtimePort}`,
    `REALTIME_HOST=${realtimeHost}`,
    "# REALTIME_DEBUG_AUTH=0",
    "",
    "# ── Uploads (اتركها فارغة لاستخدام مجلد المشروع) ────────────",
    "# UPLOADS_DIR=",
    "",
  ].join("\n");

  fs.writeFileSync(TARGET_PATH, content, { encoding: "utf8", mode: 0o600 });
  ok(`تم إنشاء .env.local بنجاح (${path.relative(ROOT, TARGET_PATH)})`);

  title("الخطوات التالية");
  log(`  ${CYAN}1.${RESET} تأكد من إنشاء قاعدة البيانات محلياً:`);
  log(`     ${DIM}createdb -h ${dbHost} -U ${dbUser} ${dbName}${RESET}`);
  log(`     ${DIM}# أو عبر psql: CREATE DATABASE ${dbName};${RESET}`);
  log(`  ${CYAN}2.${RESET} تطبيق مخطط Prisma:`);
  log(`     ${DIM}npm run db:push${RESET}`);
  log(`  ${CYAN}3.${RESET} تعبئة البيانات الأولية:`);
  log(`     ${DIM}npm run db:seed${RESET}`);
  log(`     ${DIM}npm run db:seed-permissions${RESET}`);
  log(`  ${CYAN}4.${RESET} تشغيل التطبيق:`);
  log(`     ${DIM}npm run dev${RESET}\n`);

  rl.close();
}

main().catch((e) => {
  err(`فشل الإعداد: ${e.message || e}`);
  rl.close();
  process.exit(1);
});
