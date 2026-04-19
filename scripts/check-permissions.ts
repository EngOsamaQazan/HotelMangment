/**
 * Permissions CI guard.
 *
 * Ensures every page and API route in the Next.js app is covered by an entry
 * in `src/lib/permissions/registry.ts` AND that every API route calls
 * `requirePermission()`.
 *
 * Runs on `prebuild` and in CI. Exits with code 1 on any violation.
 *
 * Allow-list (no permission required):
 *   - /api/auth/**            (NextAuth internals)
 *   - /api/me/permissions     (the endpoint consumed by PermissionsProvider)
 *   - /login                  (auth pages)
 *   - /unauthorized           (403 page)
 *   - /                       (root, redirects)
 *
 * Extend ALLOWLIST below ONLY for genuinely public routes.
 */

import fs from "fs";
import path from "path";
import { RESOURCES, type ResourceDef } from "../src/lib/permissions/registry";

const ROOT = path.resolve(__dirname, "..");
const APP_DIR = path.join(ROOT, "src", "app");

const ALLOWLIST: string[] = [
  "/",
  "/login",
  "/unauthorized",
  "/api/auth",
  "/api/me/permissions",
];

interface Finding {
  file: string;
  route: string;
  problem: string;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip private folders `_foo` (Next convention)
      if (entry.name.startsWith("_")) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function fileToRoute(file: string): string {
  // src/app/foo/[id]/page.tsx -> /foo/[id]
  // src/app/api/foo/route.ts -> /api/foo
  let rel = path.relative(APP_DIR, file).replace(/\\/g, "/");
  rel = rel.replace(/\/(page|route)\.(tsx?|jsx?)$/i, "");
  // Strip route groups: (group)
  rel = rel.replace(/\([^)]+\)\//g, "").replace(/\/\([^)]+\)/g, "");
  return "/" + rel;
}

function isAllowlisted(route: string): boolean {
  return ALLOWLIST.some(
    (prefix) => route === prefix || route.startsWith(prefix + "/"),
  );
}

function findMatchingResource(route: string): ResourceDef | undefined {
  // Prefer the longest registered route that is a prefix of `route`.
  let best: { res: ResourceDef; len: number } | undefined;
  for (const res of RESOURCES) {
    for (const r of res.routes ?? []) {
      if (route === r || route.startsWith(r + "/") || route.startsWith(r)) {
        const len = r.length;
        if (!best || len > best.len) {
          best = { res, len };
        }
      }
    }
  }
  return best?.res;
}

function checkApiGuards(file: string): string | null {
  const src = fs.readFileSync(file, "utf8");
  if (!/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/.test(src)) {
    // No exported HTTP handler — ignore.
    return null;
  }
  if (!/requirePermission\s*\(/.test(src)) {
    return "API route does not call requirePermission()";
  }
  return null;
}

function main() {
  const findings: Finding[] = [];
  const files = walk(APP_DIR)
    .map((f) => f.replace(/\\/g, "/"))
    .filter(
      (f) => /\/page\.(tsx?|jsx?)$/i.test(f) || /\/route\.(tsx?|jsx?)$/i.test(f),
    );

  for (const file of files) {
    const route = fileToRoute(file);
    const isApi = /\/route\.(tsx?|jsx?)$/i.test(file);

    if (isAllowlisted(route)) continue;

    const match = findMatchingResource(route);
    if (!match) {
      findings.push({
        file: path.relative(ROOT, file),
        route,
        problem:
          "route is not declared in src/lib/permissions/registry.ts (RESOURCES[].routes)",
      });
      continue;
    }

    if (isApi) {
      const err = checkApiGuards(file);
      if (err) {
        findings.push({
          file: path.relative(ROOT, file),
          route,
          problem: err,
        });
      }
    }
  }

  if (findings.length > 0) {
    console.error("\n❌ Permissions guard failed:\n");
    for (const f of findings) {
      console.error(`  • ${f.file}`);
      console.error(`      route:   ${f.route}`);
      console.error(`      problem: ${f.problem}\n`);
    }
    console.error(
      `Add the missing resource to src/lib/permissions/registry.ts,\n` +
        `run \`npm run db:seed-permissions\`, and protect the API route with\n` +
        `\`await requirePermission("<resource>:<action>")\`.\n`,
    );
    process.exit(1);
  }

  console.log(`✅ Permissions guard: ${files.length} routes checked, all good.`);
}

main();
