#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * sync-from-prod.cjs
 * -----------------------------------------------------------
 * يسحب قاعدة البيانات الإنتاجية إلى جهازك المحلي بأمان.
 *
 * ماذا يفعل:
 *   1. يقرأ DATABASE_URL من .env.local (القاعدة المحلية المستهدفة).
 *   2. يتصل SSH بالسيرفر ويستخرج DATABASE_URL الإنتاجي من /opt/hotel-app/.env.
 *   3. يشغّل pg_dump على السيرفر بصيغة custom (-Fc).
 *   4. يُنزّل الـ dump عبر scp.
 *   5. يحذف القاعدة المحلية ويُعيد إنشاءها فارغة.
 *   6. يستعيد الـ dump عبر pg_restore (--no-owner --no-privileges).
 *   7. يتحقق من تطابق عدد الصفوف في جداول رئيسية.
 *   8. ينظّف الملفات المؤقتة على الطرفين.
 *
 * ⚠️ تحذيرات:
 *   • سيُحذَف محتوى القاعدة المحلية بالكامل. لا تشغّله على قاعدة إنتاج محلية.
 *   • يحتاج pg_dump/pg_restore/psql/ssh/scp في PATH.
 *   • العمليات على السيرفر للقراءة فقط (لا يُعدّل الإنتاج).
 *
 * الاستخدام:
 *   npm run db:sync-from-prod
 *   # أو مع سيرفر/مستخدم SSH مختلف:
 *   SYNC_SSH_TARGET=osama@1.2.3.4 npm run db:sync-from-prod
 *
 * متغيرات اختيارية (env):
 *   SYNC_SSH_TARGET      افتراضي: osama@hotel.aqssat.co
 *   SYNC_REMOTE_ENV      افتراضي: /opt/hotel-app/.env
 *   SYNC_SKIP_VERIFY     "1" لتخطي خطوة التحقق
 *   SYNC_KEEP_DUMP       "1" للاحتفاظ بالـ dump المحلي بعد الاستعادة
 */

"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
// يُفضِّل .env.local (أسلوب Next.js) ثم يرجع إلى .env (أسلوب Tayseer).
const LOCAL_ENV = fs.existsSync(path.join(ROOT, ".env.local"))
  ? path.join(ROOT, ".env.local")
  : path.join(ROOT, ".env");
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-");
const LOCAL_DUMP = path.join(os.tmpdir(), `hotel-app-prod-${TIMESTAMP}.dump`);
const REMOTE_DUMP = `/tmp/hotel-app-prod-${TIMESTAMP}.dump`;

const SSH_TARGET = process.env.SYNC_SSH_TARGET || "osama@hotel.aqssat.co";
const REMOTE_ENV = process.env.SYNC_REMOTE_ENV || "/opt/hotel-app/.env";
const SKIP_VERIFY = process.env.SYNC_SKIP_VERIFY === "1";
const KEEP_DUMP = process.env.SYNC_KEEP_DUMP === "1";

// ── UI helpers ─────────────────────────────────────────────
const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

let stepIndex = 0;
const STEP_COUNT = 8;

function step(title) {
  stepIndex++;
  console.log(
    `\n${COLORS.bold}${COLORS.cyan}[${stepIndex}/${STEP_COUNT}] ${title}${COLORS.reset}`,
  );
}

function ok(msg) {
  console.log(`${COLORS.green}  ✓${COLORS.reset} ${msg}`);
}

function info(msg) {
  console.log(`${COLORS.dim}    ${msg}${COLORS.reset}`);
}

function warn(msg) {
  console.log(`${COLORS.yellow}  !${COLORS.reset} ${msg}`);
}

function fail(msg) {
  console.error(`${COLORS.red}  ✗${COLORS.reset} ${msg}`);
}

function die(msg, extra) {
  fail(msg);
  if (extra) console.error(COLORS.dim + extra + COLORS.reset);
  process.exit(1);
}

// ── Small utilities ────────────────────────────────────────
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: false,
    encoding: "utf8",
    env: { ...process.env, ...(opts.env || {}) },
    ...opts,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const err = new Error(
      `الأمر فشل (${r.status}): ${cmd} ${args.join(" ")}`,
    );
    err.stdout = r.stdout;
    err.stderr = r.stderr;
    err.status = r.status;
    throw err;
  }
  return r;
}

function which(bin) {
  const isWin = process.platform === "win32";
  const cmd = isWin ? "where" : "which";
  const r = spawnSync(cmd, [bin], { encoding: "utf8" });
  if (r.status === 0 && r.stdout) return r.stdout.split(/\r?\n/)[0].trim();
  return null;
}

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function parsePgUrl(url) {
  const m = url.match(
    /^postgres(?:ql)?:\/\/([^:@/]+)(?::([^@/]*))?@([^:/]+)(?::(\d+))?\/([^?]+)(\?.*)?$/,
  );
  if (!m) throw new Error(`رابط PostgreSQL غير صالح: ${url}`);
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(m[2] || ""),
    host: m[3],
    port: m[4] ? Number(m[4]) : 5432,
    database: decodeURIComponent(m[5]),
    params: m[6] || "",
    raw: url,
  };
}

function mask(url) {
  return url.replace(/:([^:@/]+)@/, ":****@");
}

function sshCapture(cmd) {
  const r = spawnSync("ssh", [SSH_TARGET, cmd], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function sshRun(cmd, title) {
  if (title) info(title);
  const r = spawnSync("ssh", [SSH_TARGET, cmd], { stdio: "inherit" });
  if (r.status !== 0) {
    throw new Error(`SSH فشل: ${cmd}`);
  }
}

// ── Main flow ──────────────────────────────────────────────
async function main() {
  console.log(
    `\n${COLORS.bold}${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`,
  );
  console.log(
    `${COLORS.bold}  سحب قاعدة البيانات الإنتاجية → المحلية${COLORS.reset}`,
  );
  console.log(
    `${COLORS.bold}${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`,
  );
  console.log(`  ${COLORS.dim}SSH target:${COLORS.reset}  ${SSH_TARGET}`);
  console.log(`  ${COLORS.dim}Remote env:${COLORS.reset}  ${REMOTE_ENV}\n`);

  // ─── Step 1: فحص المتطلبات ────────────────────────────────
  step("فحص أدوات النظام المطلوبة");
  const tools = ["ssh", "scp", "pg_dump", "pg_restore", "psql"];
  const missing = [];
  for (const t of tools) {
    const p = which(t);
    if (p) ok(`${t} ← ${p}`);
    else {
      fail(`${t} غير موجود في PATH`);
      missing.push(t);
    }
  }
  if (missing.length) {
    die(
      `أدوات مفقودة: ${missing.join(", ")}`,
      "ثبّت PostgreSQL client tools وOpenSSH، وتأكد أنها في PATH.",
    );
  }

  // ─── Step 2: قراءة DATABASE_URL المحلي ───────────────────
  step("قراءة إعدادات قاعدة البيانات المحلية");
  if (!fs.existsSync(LOCAL_ENV)) {
    die(
      ".env.local غير موجود",
      "شغّل أولاً:  npm run setup:env",
    );
  }
  const localEnv = parseEnvFile(LOCAL_ENV);
  if (!localEnv.DATABASE_URL) {
    die("DATABASE_URL غير معرّف في .env.local");
  }
  const local = parsePgUrl(localEnv.DATABASE_URL);
  ok(`الوجهة: ${mask(local.raw)}`);
  info(
    `database="${local.database}", host="${local.host}:${local.port}", user="${local.user}"`,
  );

  // ─── Step 3: قراءة DATABASE_URL الإنتاجي عبر SSH ─────────
  step("قراءة إعدادات الإنتاج من السيرفر عبر SSH");
  info("اختبار اتصال SSH…");
  const sshTest = sshCapture("echo OK");
  if (sshTest.status !== 0 || !sshTest.stdout.includes("OK")) {
    die(
      `فشل اتصال SSH بـ ${SSH_TARGET}`,
      sshTest.stderr || "تحقق من المفاتيح والاتصال بالشبكة.",
    );
  }
  ok("SSH متصل بنجاح");

  info(`قراءة ${REMOTE_ENV}…`);
  const remoteEnvCmd = `grep -E '^DATABASE_URL=' ${REMOTE_ENV} | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"'`;
  const remoteUrlRes = sshCapture(remoteEnvCmd);
  if (remoteUrlRes.status !== 0) {
    die(
      `تعذّر قراءة ${REMOTE_ENV}`,
      remoteUrlRes.stderr,
    );
  }
  const remoteUrl = remoteUrlRes.stdout.trim();
  if (!remoteUrl) die(`DATABASE_URL غير موجود في ${REMOTE_ENV}`);
  const remote = parsePgUrl(remoteUrl);
  ok(`المصدر: ${mask(remote.raw)}`);
  info(
    `database="${remote.database}", host="${remote.host}:${remote.port}", user="${remote.user}"`,
  );

  // ─── Step 4: pg_dump على السيرفر ─────────────────────────
  step("تشغيل pg_dump على السيرفر (قد يستغرق دقائق)");
  // ملاحظة: نستخدم PGPASSWORD inline لأن url قد لا يعمل مع pg_dump القديم.
  const dumpCmd = [
    `export PGPASSWORD='${remote.password.replace(/'/g, "'\\''")}'`,
    `pg_dump`,
    `  -h ${remote.host}`,
    `  -p ${remote.port}`,
    `  -U ${remote.user}`,
    `  -d ${remote.database}`,
    `  --no-owner --no-privileges`,
    `  --format=custom`,
    `  --compress=9`,
    `  --verbose`,
    `  --file=${REMOTE_DUMP}`,
    `2>&1 | tail -20`,
  ].join(" ");
  info(`→ ${REMOTE_DUMP}`);
  sshRun(dumpCmd, "تنفيذ pg_dump…");
  const sizeRes = sshCapture(`du -h ${REMOTE_DUMP} | cut -f1`);
  ok(`تم إنشاء الـ dump (الحجم: ${sizeRes.stdout.trim() || "?"})`);

  // ─── Step 5: تنزيل الـ dump محلياً ───────────────────────
  step("تنزيل الـ dump إلى جهازك");
  info(`scp ${SSH_TARGET}:${REMOTE_DUMP} → ${LOCAL_DUMP}`);
  try {
    run("scp", [`${SSH_TARGET}:${REMOTE_DUMP}`, LOCAL_DUMP]);
    ok(`تم التنزيل: ${LOCAL_DUMP}`);
  } catch (e) {
    die(`فشل التنزيل: ${e.message}`);
  }

  // ─── Step 6: حذف وإعادة إنشاء القاعدة المحلية ────────────
  step("إعادة إنشاء القاعدة المحلية");
  warn(`سيُحذف محتوى ${local.database} محلياً بالكامل!`);

  const localBaseEnv = {
    PGPASSWORD: local.password,
    PGHOST: local.host,
    PGPORT: String(local.port),
    PGUSER: local.user,
  };

  // فصل الاتصالات النشطة ثم drop
  const terminateSql = `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${local.database}' AND pid <> pg_backend_pid();`;
  try {
    run(
      "psql",
      ["-d", "postgres", "-v", "ON_ERROR_STOP=0", "-c", terminateSql],
      { env: localBaseEnv, capture: true },
    );
  } catch {
    // متساهل — قد لا توجد اتصالات
  }

  try {
    run("dropdb", ["--if-exists", local.database], {
      env: localBaseEnv,
    });
    ok(`حُذفت القاعدة القديمة: ${local.database}`);
  } catch (e) {
    die(`فشل حذف القاعدة: ${e.message}`);
  }

  try {
    run("createdb", [local.database], { env: localBaseEnv });
    ok(`أُنشئت قاعدة فارغة: ${local.database}`);
  } catch (e) {
    die(`فشل إنشاء القاعدة: ${e.message}`);
  }

  // ─── Step 7: pg_restore ──────────────────────────────────
  step("استعادة الـ dump إلى القاعدة المحلية");
  const cpuCount = Math.max(1, Math.min(4, (os.cpus() || []).length || 2));
  info(`pg_restore -j ${cpuCount} (متوازي)`);
  try {
    run(
      "pg_restore",
      [
        "-d",
        local.database,
        "--no-owner",
        "--no-privileges",
        "--single-transaction",
        "-j",
        String(cpuCount),
        LOCAL_DUMP,
      ],
      { env: localBaseEnv },
    );
    ok("تمت الاستعادة بنجاح");
  } catch (e) {
    warn("single-transaction + jobs غير متوافقين أحياناً — إعادة المحاولة بدونها…");
    try {
      run(
        "pg_restore",
        [
          "-d",
          local.database,
          "--no-owner",
          "--no-privileges",
          "-j",
          String(cpuCount),
          LOCAL_DUMP,
        ],
        { env: localBaseEnv },
      );
      ok("تمت الاستعادة (وضع متسامح)");
    } catch (e2) {
      die(`فشلت الاستعادة: ${e2.message}`);
    }
  }

  // ─── Step 8: التحقق ──────────────────────────────────────
  step("التحقق من تطابق البيانات");
  if (SKIP_VERIFY) {
    warn("تم تخطي التحقق (SYNC_SKIP_VERIFY=1)");
  } else {
    const tablesToCheck = [
      "User",
      "Reservation",
      "Guest",
      "Room",
      "Unit",
      "Expense",
    ];
    const results = [];
    for (const t of tablesToCheck) {
      const sql = `SELECT COUNT(*)::text FROM "${t}";`;
      // remote
      const remoteCountRes = sshCapture(
        `PGPASSWORD='${remote.password.replace(/'/g, "'\\''")}' psql -h ${remote.host} -p ${remote.port} -U ${remote.user} -d ${remote.database} -tAc "${sql}" 2>/dev/null || echo "-"`,
      );
      const remoteCount = remoteCountRes.stdout.trim();

      // local
      let localCount = "-";
      try {
        const r = run(
          "psql",
          ["-d", local.database, "-tAc", sql],
          { env: localBaseEnv, capture: true },
        );
        localCount = (r.stdout || "").trim();
      } catch {
        localCount = "err";
      }

      const match =
        remoteCount === localCount && remoteCount !== "-" && remoteCount !== "";
      results.push({ table: t, remote: remoteCount, local: localCount, match });
    }

    console.log(
      `\n  ${COLORS.dim}${"الجدول".padEnd(16)}${"إنتاج".padEnd(12)}${"محلي".padEnd(12)}${COLORS.reset}`,
    );
    for (const r of results) {
      const mark = r.match
        ? `${COLORS.green}✓${COLORS.reset}`
        : r.remote === "-"
          ? `${COLORS.dim}—${COLORS.reset}`
          : `${COLORS.red}✗${COLORS.reset}`;
      console.log(
        `  ${mark} ${r.table.padEnd(14)}${String(r.remote).padEnd(12)}${String(r.local).padEnd(12)}`,
      );
    }
    const hard = results.filter((r) => r.remote !== "-" && !r.match);
    if (hard.length) {
      warn(`${hard.length} جدول/جداول بعدد صفوف مختلف — راجع السجلات.`);
    } else {
      ok("جميع الجداول المفحوصة متطابقة");
    }
  }

  // ─── تنظيف ───────────────────────────────────────────────
  console.log(`\n${COLORS.dim}تنظيف الملفات المؤقتة…${COLORS.reset}`);
  try {
    sshCapture(`rm -f ${REMOTE_DUMP}`);
    info(`حُذف ${REMOTE_DUMP} من السيرفر`);
  } catch {}
  if (!KEEP_DUMP) {
    try {
      fs.unlinkSync(LOCAL_DUMP);
      info(`حُذف ${LOCAL_DUMP} محلياً`);
    } catch {}
  } else {
    info(`أُبقي على الـ dump المحلي: ${LOCAL_DUMP}`);
  }

  console.log(
    `\n${COLORS.bold}${COLORS.green}✓ اكتملت المزامنة بنجاح!${COLORS.reset}\n`,
  );
  console.log(`${COLORS.dim}الخطوات التالية:${COLORS.reset}`);
  console.log(
    `  ${COLORS.cyan}•${COLORS.reset} شغّل ${COLORS.bold}npm run dev${COLORS.reset} وابدأ العمل على بيانات حقيقية.`,
  );
  console.log(
    `  ${COLORS.cyan}•${COLORS.reset} إن أضفت تعديلات على المخطط لاحقاً: ${COLORS.bold}npm run db:push${COLORS.reset}\n`,
  );
}

main().catch((e) => {
  fail(e.message || String(e));
  if (e.stderr) console.error(COLORS.dim + e.stderr + COLORS.reset);
  process.exit(1);
});
