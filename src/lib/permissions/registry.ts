/**
 * Permissions Registry — Source of Truth
 * =========================================================================
 * This file is the SINGLE SOURCE OF TRUTH for every permission in the app.
 *
 * Whenever you add:
 *   - a new page under `src/app/**\/page.tsx`
 *   - a new API route under `src/app/api/**\/route.ts`
 *   - a new protected feature/module
 *
 * you MUST register the corresponding Resource + actions here, and run
 * `npm run check:perms` to verify.
 *
 * See: .cursor/skills/add-module-permissions/SKILL.md
 */

export const ACTIONS = ["view", "create", "edit", "delete"] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<string, string> = {
  view: "عرض",
  create: "إنشاء",
  edit: "تعديل",
  delete: "حذف",
  export: "تصدير",
  approve: "اعتماد",
  post: "ترحيل",
  void: "إلغاء",
  close: "إقفال",
};

export interface ExtraAction {
  key: string;
  label: string;
}

export interface ResourceDef {
  /** Canonical key, e.g. "reservations" or "accounting.journal" */
  key: string;
  /** Human-readable label (Arabic) */
  label: string;
  /** Grouping for UI — operations | accounting | reports | admin */
  category: "operations" | "accounting" | "reports" | "admin" | "general";
  /** Icon name for the roles matrix UI (optional) */
  icon?: string;
  /** Display order within the category */
  sortOrder?: number;
  /** Base actions — usually all four */
  actions: readonly Action[];
  /** Page / API route prefixes this resource owns.
   *  Used by `scripts/check-permissions.ts` to verify coverage. */
  routes: string[];
  /** Extra domain-specific actions (e.g. approve, export, post, void) */
  extraActions?: ExtraAction[];
  description?: string;
}

export const RESOURCES: ResourceDef[] = [
  // ─────────────── Operations ───────────────
  {
    key: "dashboard",
    label: "لوحة التحكم",
    category: "operations",
    actions: ["view"],
    routes: ["/", "/api/dashboard"],
    sortOrder: 0,
  },
  {
    key: "reservations",
    label: "الحجوزات",
    category: "operations",
    actions: ACTIONS,
    routes: [
      "/reservations",
      "/reservations/new",
      "/reservations/[id]",
      "/reservations/[id]/contract",
      "/api/reservations",
      "/api/reservations/[id]",
    ],
    extraActions: [
      { key: "cancel", label: "إلغاء حجز" },
      { key: "print", label: "طباعة عقد" },
    ],
    sortOrder: 10,
  },
  {
    key: "rooms",
    label: "الغرف والوحدات",
    category: "operations",
    actions: ACTIONS,
    routes: ["/rooms", "/api/rooms", "/api/rooms/[id]", "/api/units"],
    sortOrder: 20,
  },
  {
    key: "guests",
    label: "النزلاء",
    category: "operations",
    actions: ACTIONS,
    routes: ["/guests", "/api/guests", "/api/ocr"],
    extraActions: [{ key: "ocr", label: "مسح بطاقة هوية" }],
    sortOrder: 30,
  },
  {
    key: "maintenance",
    label: "الصيانة",
    category: "operations",
    actions: ACTIONS,
    routes: ["/maintenance", "/api/maintenance", "/api/maintenance/[id]"],
    sortOrder: 40,
  },

  // ─────────────── Accounting ───────────────
  {
    key: "accounting",
    label: "المحاسبة (نظرة عامة)",
    category: "accounting",
    actions: ["view"],
    routes: ["/accounting"],
    sortOrder: 100,
  },
  {
    key: "accounting.journal",
    label: "القيود اليومية",
    category: "accounting",
    actions: ACTIONS,
    routes: [
      "/accounting/journal",
      "/accounting/journal/[id]",
      "/api/accounting/journal",
      "/api/accounting/journal/[id]",
    ],
    extraActions: [
      { key: "post", label: "ترحيل" },
      { key: "void", label: "إلغاء قيد" },
    ],
    sortOrder: 110,
  },
  {
    key: "accounting.accounts",
    label: "شجرة الحسابات",
    category: "accounting",
    actions: ACTIONS,
    routes: [
      "/accounting/accounts",
      "/api/accounting/accounts",
      "/api/accounting/accounts/[id]",
    ],
    sortOrder: 120,
  },
  {
    key: "accounting.parties",
    label: "الأطراف (عملاء/موردين)",
    category: "accounting",
    actions: ACTIONS,
    routes: [
      "/accounting/parties",
      "/accounting/parties/[id]",
      "/api/accounting/parties",
      "/api/accounting/parties/[id]",
      "/api/accounting/parties/[id]/statement",
    ],
    sortOrder: 130,
  },
  {
    key: "accounting.ledger",
    label: "دفتر الأستاذ",
    category: "accounting",
    actions: ["view"],
    routes: ["/accounting/ledger", "/api/accounting/ledger"],
    extraActions: [{ key: "export", label: "تصدير" }],
    sortOrder: 140,
  },
  {
    key: "accounting.cashbook",
    label: "الصندوق / البنك",
    category: "accounting",
    actions: ["view"],
    routes: ["/accounting/cashbook"],
    sortOrder: 150,
  },
  {
    key: "accounting.periods",
    label: "الفترات المحاسبية",
    category: "accounting",
    actions: ACTIONS,
    routes: ["/accounting/periods", "/api/accounting/periods"],
    extraActions: [{ key: "close", label: "إقفال الفترة" }],
    sortOrder: 160,
  },
  {
    key: "accounting.reports",
    label: "التقارير المحاسبية",
    category: "accounting",
    actions: ["view"],
    routes: [
      "/accounting/reports/balance-sheet",
      "/accounting/reports/income-statement",
      "/accounting/reports/trial-balance",
      "/api/accounting/reports/balance-sheet",
      "/api/accounting/reports/income-statement",
      "/api/accounting/reports/trial-balance",
    ],
    extraActions: [{ key: "export", label: "تصدير" }],
    sortOrder: 170,
  },

  // ─────────────── Reports ───────────────
  {
    key: "finance",
    label: "الإدارة المالية",
    category: "reports",
    actions: ["view", "create", "edit", "delete"],
    routes: ["/finance", "/api/finance"],
    sortOrder: 200,
  },
  {
    key: "reports.monthly",
    label: "التقرير الشهري",
    category: "reports",
    actions: ["view"],
    routes: ["/reports/monthly", "/api/reports"],
    extraActions: [{ key: "export", label: "تصدير" }],
    sortOrder: 210,
  },
  {
    key: "reports.debts",
    label: "تقرير الديون",
    category: "reports",
    actions: ["view"],
    routes: ["/reports/debts"],
    extraActions: [{ key: "export", label: "تصدير" }],
    sortOrder: 220,
  },

  // ─────────────── Admin / Settings ───────────────
  {
    key: "settings",
    label: "الإعدادات (عام)",
    category: "admin",
    actions: ["view"],
    routes: ["/settings"],
    sortOrder: 300,
  },
  {
    key: "settings.users",
    label: "إدارة المستخدمين",
    category: "admin",
    actions: ACTIONS,
    routes: ["/api/users", "/api/users/[id]"],
    sortOrder: 310,
  },
  {
    key: "settings.roles",
    label: "إدارة الأدوار والصلاحيات",
    category: "admin",
    actions: ACTIONS,
    routes: [
      "/settings/roles",
      "/api/roles",
      "/api/roles/[id]",
      "/api/roles/[id]/permissions",
      "/api/permissions",
      "/api/users/[id]/roles",
      "/api/users/[id]/overrides",
      "/api/me/permissions",
    ],
    sortOrder: 320,
  },
  {
    key: "settings.prices",
    label: "الأسعار الموسمية",
    category: "admin",
    actions: ACTIONS,
    routes: ["/api/seasonal-prices"],
    sortOrder: 330,
  },
];

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

export function permissionKey(resource: string, action: string): string {
  return `${resource}:${action}`;
}

/** All permission keys in the system (including extraActions). */
export function allPermissionKeys(): string[] {
  const keys: string[] = [];
  for (const r of RESOURCES) {
    for (const a of r.actions) keys.push(permissionKey(r.key, a));
    for (const x of r.extraActions ?? [])
      keys.push(permissionKey(r.key, x.key));
  }
  return Array.from(new Set(keys));
}

/** Returns the resource that owns a given route path, if any. */
export function findResourceByRoute(route: string): ResourceDef | undefined {
  // Normalize dynamic segments in `route` by matching against stored patterns.
  const normalize = (p: string) =>
    p.replace(/\[[^\]]+\]/g, "[*]").replace(/\/+$/, "") || "/";
  const target = normalize(route);

  // First try exact match, then prefix match (longest first).
  const allRoutes: { r: ResourceDef; path: string }[] = [];
  for (const r of RESOURCES)
    for (const p of r.routes)
      allRoutes.push({ r, path: normalize(p) });

  const exact = allRoutes.find((x) => x.path === target);
  if (exact) return exact.r;

  const prefix = allRoutes
    .filter((x) => x.path !== "/" && target.startsWith(x.path + "/"))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return prefix?.r;
}

/** Map HTTP methods to default actions used by the CI guard. */
export const METHOD_ACTION_MAP: Record<string, string> = {
  GET: "view",
  HEAD: "view",
  OPTIONS: "view",
  POST: "create",
  PUT: "edit",
  PATCH: "edit",
  DELETE: "delete",
};

/** Default role presets — used by the seed script. */
export interface RolePreset {
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  /** "*" means all permissions; otherwise list of permission keys or `resource:*`. */
  permissions: string[] | "*";
}

export const DEFAULT_ROLES: RolePreset[] = [
  {
    key: "admin",
    name: "مدير",
    description: "صلاحية كاملة على النظام",
    isSystem: true,
    permissions: "*",
  },
  {
    key: "receptionist",
    name: "موظف استقبال",
    description: "إدارة الحجوزات والنزلاء والغرف",
    isSystem: true,
    permissions: [
      "dashboard:view",
      "reservations:*",
      "rooms:view",
      "rooms:edit",
      "guests:*",
      "maintenance:view",
      "maintenance:create",
      "finance:view",
      "reports.monthly:view",
      "reports.debts:view",
      "settings:view",
    ],
  },
  {
    key: "accountant",
    name: "محاسب",
    description: "إدارة كل ما يخص المحاسبة والتقارير المالية",
    isSystem: true,
    permissions: [
      "dashboard:view",
      "reservations:view",
      "rooms:view",
      "guests:view",
      "maintenance:view",
      "accounting:view",
      "accounting.journal:*",
      "accounting.accounts:*",
      "accounting.parties:*",
      "accounting.ledger:*",
      "accounting.cashbook:view",
      "accounting.periods:*",
      "accounting.reports:*",
      "finance:*",
      "reports.monthly:*",
      "reports.debts:*",
      "settings:view",
    ],
  },
  {
    key: "viewer",
    name: "مشاهد",
    description: "عرض فقط — لا يستطيع تعديل أي شيء",
    isSystem: true,
    permissions: [
      "dashboard:view",
      "reservations:view",
      "rooms:view",
      "guests:view",
      "maintenance:view",
      "finance:view",
      "reports.monthly:view",
      "reports.debts:view",
    ],
  },
];

/** Expand wildcard permission entries (`resource:*` or `*`) to concrete keys. */
export function expandPermissions(
  entries: string[] | "*",
): string[] {
  if (entries === "*") return allPermissionKeys();
  const out = new Set<string>();
  for (const entry of entries) {
    if (entry === "*") {
      allPermissionKeys().forEach((k) => out.add(k));
      continue;
    }
    const [resKey, action] = entry.split(":");
    if (action === "*") {
      const res = RESOURCES.find((r) => r.key === resKey);
      if (!res) continue;
      for (const a of res.actions) out.add(permissionKey(resKey, a));
      for (const x of res.extraActions ?? [])
        out.add(permissionKey(resKey, x.key));
    } else {
      out.add(entry);
    }
  }
  return Array.from(out);
}
