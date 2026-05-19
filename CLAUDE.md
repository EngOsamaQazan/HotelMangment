# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev                    # Start dev server (localhost:3000)
npm run build                  # Production build (runs check:permissions as prebuild)
npm run lint                   # ESLint
npm run db:push                # Apply Prisma schema to DB
npm run db:seed                # Seed initial users + data
npm run db:seed-permissions    # Sync permission registry → DB
npm run db:seed-cost-centers   # Seed cost centers
npm run check:permissions      # CI guard — verifies all routes have permission coverage
npm run db:reset               # Drop + recreate DB from scratch
```

Scripts that need `tsconfig.scripts.json` use: `npx ts-node --project tsconfig.scripts.json <file>`.

## Architecture

**Stack:** Next.js 16 (App Router, standalone output) · React 19 · TypeScript · Prisma ORM · PostgreSQL · Tailwind CSS 4 · NextAuth v4 · Socket.IO (separate process on port 3001).

**Dual-domain hosting:** A single Next.js process serves two audiences:
- `admin.mafhotel.com` — staff dashboard (admin UI + admin APIs)
- `mafhotel.com` — guest-facing site (landing, booking, `/account`)

Host routing is enforced by `src/middleware.ts` using helpers from `src/lib/hosts.ts`. When `ADMIN_HOST` env var is unset (local dev), the split is disabled and both audiences share `localhost:3000`.

**Authentication:** Two separate auth flows share one NextAuth installation:
- **Staff:** `/login` → credentials (email+password) → JWT with `audience: "staff"`
- **Guest:** `/signin` → phone OTP or Google/Apple social → JWT with `audience: "guest"`

The middleware segregates staff vs guest paths based on the `audience` claim in the JWT. Cross-subdomain sessions use `SESSION_COOKIE_DOMAIN=.mafhotel.com`.

**Double-entry accounting:** `src/lib/accounting.ts` provides `postEntry()`, `voidEntry()`, `getAccountBalance()`, `getPartyBalance()`, `ensurePartyAccounts()`. Chart of accounts uses hierarchical codes (1xxx assets, 2xxx liabilities, 3xxx equity, 4xxx revenue, 5xxx expenses). Partners get auto-generated sub-accounts `3010-{id}` (capital) and `3020-{id}` (drawings). Every journal entry must balance within ε=0.005. Voids create reversal entries (never delete). Cost centers (CC-1xx operations, CC-2xx revenue) are assigned per journal line.

**Party types:** guest, partner, supplier, employee, lender, other — each maps to specific liability/equity accounts.

**Realtime:** Separate Socket.IO server in `realtime/` (port 3001, managed by PM2). Client connects via `src/lib/realtime/`. Used for chat, notifications, and live collaboration.

**Environment:** Use `src/lib/env.ts` (`import { env } from "@/lib/env"`) instead of raw `process.env`. It validates required vars and gives clear errors.

## Key Directories

- `src/app/` — Next.js App Router pages and API routes
- `src/app/api/` — All backend API routes (REST)
- `src/lib/` — Shared business logic (accounting, auth, booking, permissions, payroll, notifications, WhatsApp, etc.)
- `src/lib/permissions/` — RBAC system: `registry.ts` (source of truth), `guard.ts` (backend), `client.tsx` (frontend)
- `src/components/` — UI components; `Can.tsx` for permission-gated rendering, `AppShell.tsx` for staff layout, `public/` for guest-facing layout
- `prisma/schema.prisma` — ~80 models, single-file schema
- `realtime/` — Socket.IO server (separate package.json)
- `scripts/` — CLI utilities, CI guards, data migration scripts

## Permissions (CRITICAL)

Every API route must call `await requirePermission("<resource>:<action>")` at the top. Every page/sidebar entry needs a `permission` field. The registry at `src/lib/permissions/registry.ts` is the single source of truth. After any registry change, run `npm run db:seed-permissions`. The CI guard (`npm run check:permissions`, runs on prebuild) fails the build if routes are uncovered.

HTTP method mapping: GET→view, POST→create, PUT/PATCH→edit, DELETE→delete. Domain verbs (approve, post, void, close) go in `extraActions`.

## Conventions

- **Language:** UI text and descriptions are in Arabic. Code (variable names, comments) is in English.
- **Prisma:** Single shared client via `src/lib/prisma.ts`. No raw SQL in app code — use Prisma queries.
- **Public files:** Static assets (icons, PWA images) live in `public/`. Content images (room photos, brand images) are served from `uploads/` via `/api/files/content/` (not checked into git).
- **Uploads dir:** `UPLOADS_DIR` env var (defaults to `./uploads`). User uploads (avatars, attachments) go here, served by authenticated API routes under `/api/files/`.
- **SEO:** Structured data builders in `src/lib/seo/jsonld.ts`, site constants in `src/lib/seo/site.ts`.
