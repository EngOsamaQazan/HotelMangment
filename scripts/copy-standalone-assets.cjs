#!/usr/bin/env node
/**
 * Post-build helper for Next.js `output: "standalone"` mode.
 *
 * Next.js produces `.next/standalone/` containing only the server bundle.
 * The static client assets (`.next/static`) and the `public/` folder are
 * NOT copied automatically. Without them the deployed app serves HTML
 * with broken CSS/JS and crashes when the runtime tries to write the
 * `.next/cache` directory.
 *
 * This script runs after every `npm run build` and:
 *   1. Mirrors `.next/static` into `.next/standalone/.next/static`.
 *   2. Mirrors `public/` into `.next/standalone/public`.
 *   3. Creates `.next/standalone/.next/cache` so runtime mkdir succeeds.
 *
 * Cross-platform (uses Node's fs.cpSync — Node >= 16.7).
 */
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(standalone)) {
  // Standalone mode disabled or build not yet run — nothing to do.
  process.exit(0);
}

function copyDir(src, dest, label) {
  if (!fs.existsSync(src)) {
    console.warn(`[copy-standalone-assets] skipped: ${label} (${src} missing)`);
    return;
  }
  fs.cpSync(src, dest, { recursive: true, force: true });
  console.log(`[copy-standalone-assets] copied ${label}`);
}

copyDir(
  path.join(root, ".next", "static"),
  path.join(standalone, ".next", "static"),
  ".next/static -> .next/standalone/.next/static"
);

copyDir(
  path.join(root, "public"),
  path.join(standalone, "public"),
  "public -> .next/standalone/public"
);

const cacheDir = path.join(standalone, ".next", "cache");
fs.mkdirSync(cacheDir, { recursive: true });
console.log(`[copy-standalone-assets] ensured ${cacheDir}`);

console.log("[copy-standalone-assets] done");
