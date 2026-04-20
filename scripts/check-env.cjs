#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * check-env.cjs
 * -----------------------------------------------------------
 * يتحقق من وجود وسلامة متغيرات البيئة الحرجة قبل التشغيل أو البناء.
 *
 * Usage:
 *   npm run env:check
 *
 * Exit codes:
 *   0 = OK
 *   1 = متغيّر مطلوب مفقود أو يحتوي قيمة نائبة
 *   2 = ملف .env (أو .env.local) غير موجود أصلاً
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const CANDIDATES = [".env.local", ".env"];
const REQUIRED = ["DATABASE_URL", "NEXTAUTH_SECRET"];
const PLACEHOLDERS = [
  "CHANGE_ME",
  "YOUR_PROJECT_REF",
  "YOUR_DB_PASSWORD",
  "PASTE_DB_PASSWORD_FROM_SERVER",
];

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function main() {
  console.log(`${BOLD}فحص متغيرات البيئة…${RESET}`);

  const found = CANDIDATES.map((f) => ({
    name: f,
    full: path.join(ROOT, f),
    exists: fs.existsSync(path.join(ROOT, f)),
  }));

  const existing = found.filter((f) => f.exists);
  if (existing.length === 0) {
    console.error(
      `${RED}✗${RESET} لم أجد أي ملف بيئة (${CANDIDATES.join(" أو ")}).`,
    );
    console.error(
      `${DIM}  شغّل: ${BOLD}npm run setup:env${RESET}${DIM} لإنشاء .env.local${RESET}`,
    );
    process.exit(2);
  }

  // دمج كل الملفات الموجودة (كما يفعل Next.js: .env.local يغلب)
  const merged = {};
  for (const f of [...existing].reverse()) {
    Object.assign(merged, parseEnvFile(f.full));
  }
  // process.env يتفوّق (نحكي كأننا في runtime)
  for (const k of Object.keys(process.env)) {
    if (process.env[k] != null && process.env[k] !== "") {
      merged[k] = process.env[k];
    }
  }

  const problems = [];
  for (const key of REQUIRED) {
    const value = (merged[key] || "").trim();
    if (!value) {
      problems.push(`${key} مفقود`);
      continue;
    }
    for (const ph of PLACEHOLDERS) {
      if (value.includes(ph)) {
        problems.push(`${key} يحتوي قيمة نائبة "${ph}"`);
        break;
      }
    }
    if (
      key === "DATABASE_URL" &&
      !value.startsWith("postgresql://") &&
      !value.startsWith("postgres://")
    ) {
      problems.push(`${key} ليس رابط PostgreSQL صالحاً`);
    }
    if (key === "NEXTAUTH_SECRET" && value.length < 16) {
      problems.push(`${key} قصير جداً (أقل من 16 حرفاً)`);
    }
  }

  console.log(
    `${GREEN}✓${RESET} مصادر البيئة: ${existing
      .map((f) => f.name)
      .join(", ")}`,
  );

  if (problems.length) {
    console.error(`${RED}✗ مشاكل في الإعداد:${RESET}`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      `\n${YELLOW}→${RESET} ${DIM}أصلح ${existing[0].name} أو شغّل:${RESET} ${BOLD}npm run setup:env${RESET}`,
    );
    process.exit(1);
  }

  console.log(`${GREEN}✓${RESET} جميع المتغيرات الحرجة مضبوطة بشكل صحيح.`);
  process.exit(0);
}

main();
