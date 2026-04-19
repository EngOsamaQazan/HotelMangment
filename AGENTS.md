<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Permissions Contract (MANDATORY)

This project uses a **dynamic, database-driven RBAC system** with per-user overrides. Every new module, page, or API route MUST be wired into it. The full step-by-step workflow lives in the Cursor skill:

- **Skill**: `.cursor/skills/add-module-permissions/SKILL.md` — read and follow it whenever you create a new section.
- **Registry (source of truth)**: `src/lib/permissions/registry.ts` — every resource + action is declared here.
- **Seeder**: `prisma/seed-permissions.ts` — propagates the registry into the DB (`npm run db:seed-permissions`).
- **Backend guard**: `src/lib/permissions/guard.ts` — `requirePermission()`, `handleAuthError()`.
- **Frontend guard**: `src/lib/permissions/client.tsx` + `src/components/Can.tsx` — `usePermissions`, `<Can>`.
- **Admin UI**: `/settings/roles` (permission matrix) and the user list on `/settings` (role assignment + overrides).
- **CI guard**: `npm run check:permissions` (runs on `prebuild`). It fails if any API route or page is not covered by an entry in `RESOURCES[].routes`.

## Hard rules

1. **Never** create an `src/app/api/**/route.ts` handler without an `await requirePermission("<resource>:<action>")` at the top and a `handleAuthError(error)` short-circuit in the catch block.
2. **Never** invent a new permission string that is not derivable from the registry. Add the resource to `RESOURCES` first.
3. **Never** perform role checks with string literals (`user.role === "admin"`). Use permissions only.
4. **Every** sidebar entry in `src/components/Sidebar.tsx` must include a `permission` field.
5. HTTP method → action mapping: `GET=view`, `POST=create`, `PUT/PATCH=edit`, `DELETE=delete`. Use `extraActions` for domain verbs (`approve`, `post`, `void`, `close`, …).
6. After editing the registry, run `npm run db:seed-permissions` so the DB, roles UI, and CI guard stay in sync.

If the CI guard (`scripts/check-permissions.ts`) fails, do NOT work around it by editing the guard — fix the registry or add the missing `requirePermission()` call.
