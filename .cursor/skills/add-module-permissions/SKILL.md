---
name: add-module-permissions
description: MANDATORY workflow when adding any new module, feature, page, or API route to the hotel-app. Use whenever the user asks to add a new section, CRUD page, API endpoint, sub-module, or settings screen. Ensures every new feature is registered in the permissions registry, seeded, and protected by `requirePermission()` / `<Can>`. Use when the user says "أضف قسم", "ابني صفحة", "add a module", "new feature", "new endpoint", or similar.
---

# Add Module Permissions — Contract

Every new UI section, page, or API route in this codebase **must** be represented in the centralized permissions registry. The permissions system is the source of truth; anything not in it is invisible to the roles/users UI and uncovered by the CI guard.

## Non-negotiable Checklist (follow in order)

When introducing a new resource (e.g. "suppliers", "invoices", "reports.occupancy", …):

### 1. Register the resource

Edit `src/lib/permissions/registry.ts` and append to the `RESOURCES` array:

```ts
{
  key: "<category>.<name>",          // dot-notation, snake-case, unique
  label: "<Arabic display name>",
  category: "<existing or new category>",
  actions: ["view", "create", "edit", "delete"], // only relevant base actions
  extraActions: [                     // OPTIONAL, for domain-specific verbs
    { key: "approve", label: "اعتماد" },
  ],
  routes: ["/foo", "/api/foo"],       // all pages + API paths under this resource
  sortOrder: 100,                     // group-wise ordering inside the category
}
```

Rules:
- `key` MUST match the URL-path family (e.g. `reports.debts` for `/reports/debts`).
- Use only the canonical base actions: `view`, `create`, `edit`, `delete`, `export`, `approve`, `post`, `void`, `close`. Anything else goes in `extraActions`.
- If the module is read-only, actions may be just `["view"]`.

### 2. Seed into the database

Run the permission seeder so the new resource/permissions propagate to `Resource`, `Permission`, and default `Role` links:

```bash
npm run db:seed-permissions
```

Do NOT hand-insert rows into `Resource` or `Permission`.

### 3. Protect every API route

In each `src/app/api/**/route.ts` handler you create (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`):

```ts
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function GET() {
  try {
    await requirePermission("<resource>:view");
    // …
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    // existing 500 fallback
  }
}
```

Map HTTP methods to actions:

| Method | Action   |
| ------ | -------- |
| GET    | `view`   |
| POST   | `create` |
| PUT    | `edit`   |
| PATCH  | `edit`   |
| DELETE | `delete` |

If the route performs a domain verb (approve, post, void, …), use that action key instead.

### 4. Gate the UI

- **Pages and buttons**: wrap with `<Can permission="<resource>:<action>">…</Can>` from `@/components/Can` or use `usePermissions().can(...)` from `@/lib/permissions/client`.
- **Navigation**: add a new entry in `src/components/Sidebar.tsx` `navItems` with the `permission` field set to `<resource>:view`. The Sidebar filters automatically.

### 5. Update default roles (when needed)

If the new resource should be visible to a non-admin role out of the box, edit `DEFAULT_ROLES` in `src/lib/permissions/registry.ts` and add the relevant keys (e.g. `"suppliers:view"`). Admin automatically gets everything.

### 6. Verify

Before committing, run:

```bash
npm run check:permissions   # CI guard — fails if any route is missing
npm run lint
```

The guard scans `src/app/api/**/route.ts` and every page under `src/app/**/page.tsx`, cross-references paths against `RESOURCES[].routes`, and fails on any uncovered route.

## When this skill applies

Activate this skill automatically whenever:

- A new file is created under `src/app/**/page.tsx` (new page).
- A new file is created under `src/app/api/**/route.ts` (new endpoint).
- A new sidebar item is added.
- The user asks for a new module, sub-section, dashboard widget with its own API, report, or settings screen.

If in doubt, **register the resource first**, then build the feature.

## Anti-patterns (REJECT)

- Creating an API route without `requirePermission()`.
- Inventing ad-hoc permission strings that are not in `RESOURCES` / `ACTIONS`.
- Hard-coding role checks (`if (user.role === "admin")`) instead of permission checks.
- Adding a sidebar link without a `permission` field.
- Bypassing the registry by hitting `prisma.permission.create()` directly in app code.
