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
      "/api/reservations/[id]/extend",
      "/api/reservations/[id]/extensions",
      "/api/reservations/[id]/extensions/[extId]/reverse",
      "/api/reservations/[id]/checkin",
      "/api/reservations/[id]/checkout",
      "/api/reservations/[id]/cancel",
      "/api/reservations/[id]/no-show",
      "/api/reservations/[id]/reopen",
      "/api/reservations/[id]/status-log",
      "/api/reservations/summary",
    ],
    extraActions: [
      { key: "cancel", label: "إلغاء حجز" },
      { key: "print", label: "طباعة عقد" },
      { key: "checkin", label: "تسجيل دخول الضيف" },
      { key: "checkout", label: "تسجيل مغادرة الضيف" },
      { key: "noshow", label: "تسجيل عدم حضور" },
      { key: "extend", label: "تمديد حجز" },
      { key: "reverse_extend", label: "عكس تمديد حجز" },
      { key: "reopen", label: "إعادة فتح حجز منتهٍ" },
    ],
    sortOrder: 10,
  },
  {
    key: "rooms",
    label: "الغرف والوحدات",
    category: "operations",
    actions: ACTIONS,
    routes: [
      "/rooms",
      "/api/rooms",
      "/api/rooms/[id]",
      "/api/units",
      "/api/units/[id]/merge-candidates",
      "/api/unit-merges",
      "/api/unit-merges/[id]",
      "/settings/unit-merges",
    ],
    sortOrder: 20,
  },
  {
    key: "unit-photos",
    label: "صور الوحدات (قِبلي الموقع)",
    category: "operations",
    actions: ["view", "create", "delete"],
    routes: [
      "/api/rooms/[id]/photos",
      "/api/rooms/[id]/photos/[photoId]",
      "/api/unit-types/[id]/photos",
    ],
    extraActions: [{ key: "upload", label: "رفع صور" }],
    sortOrder: 22,
    description:
      "إدارة معرض صور الوحدات ونوع الغرفة التي تُعرض على موقع الحجز العام.",
  },
  {
    key: "reservations.online",
    label: "الحجوزات عبر الموقع",
    category: "operations",
    actions: ["view"],
    routes: [],
    extraActions: [{ key: "manage", label: "إدارة الحجوزات المباشرة" }],
    sortOrder: 24,
    description:
      "استعراض وإدارة الحجوزات القادمة من الموقع (source = direct_web).",
  },
  {
    key: "guests",
    label: "الضيوف",
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
    routes: [
      "/maintenance",
      "/api/maintenance",
      "/api/maintenance/[id]",
      "/api/maintenance/[id]/convert-to-task",
    ],
    extraActions: [
      { key: "convert_to_task", label: "تحويل إلى مهمة" },
    ],
    sortOrder: 40,
  },
  {
    key: "tasks.boards",
    label: "لوحات المهام",
    category: "operations",
    actions: ACTIONS,
    routes: [
      "/tasks",
      "/tasks/[boardId]",
      "/api/tasks/boards",
      "/api/tasks/boards/[boardId]",
      "/api/tasks/boards/[boardId]/members",
      "/api/tasks/boards/[boardId]/columns",
      "/api/tasks/boards/[boardId]/columns/reorder",
      "/api/tasks/boards/[boardId]/labels",
    ],
    extraActions: [
      { key: "manage_members", label: "إدارة الأعضاء" },
      { key: "archive", label: "أرشفة" },
    ],
    sortOrder: 50,
  },
  {
    key: "tasks.cards",
    label: "بطاقات المهام",
    category: "operations",
    actions: ACTIONS,
    routes: [
      "/api/tasks/cards",
      "/api/tasks/cards/[cardId]",
      "/api/tasks/cards/[cardId]/move",
      "/api/tasks/cards/[cardId]/assignees",
      "/api/tasks/cards/[cardId]/labels",
      "/api/tasks/cards/[cardId]/checklist",
      "/api/tasks/cards/[cardId]/checklist/[itemId]",
      "/api/tasks/cards/[cardId]/comments",
      "/api/tasks/cards/[cardId]/comments/[commentId]",
      "/api/tasks/cards/[cardId]/attachments",
      "/api/tasks/cards/[cardId]/attachments/[attachmentId]",
      "/api/tasks/cards/[cardId]/activity",
    ],
    extraActions: [
      { key: "assign", label: "إسناد" },
      { key: "complete", label: "إنجاز" },
    ],
    sortOrder: 55,
  },
  {
    key: "chat",
    label: "المحادثات",
    category: "operations",
    actions: ["view", "create"],
    routes: [
      "/chat",
      "/chat/[conversationId]",
      "/api/chat/conversations",
      "/api/chat/conversations/[id]",
      "/api/chat/conversations/[id]/messages",
      "/api/chat/conversations/[id]/read",
      "/api/chat/conversations/[id]/participants",
      "/api/chat/messages/[id]",
      "/api/chat/messages/[id]/reactions",
      "/api/chat/messages/[id]/attachments",
    ],
    extraActions: [
      { key: "create_group", label: "إنشاء مجموعة" },
      { key: "moderate", label: "إشراف" },
    ],
    sortOrder: 60,
  },
  {
    key: "notifications",
    label: "الإشعارات",
    category: "general",
    actions: ["view"],
    routes: [
      "/api/notifications",
      "/api/notifications/mark-read",
      "/api/notifications/unread-count",
    ],
    sortOrder: 70,
  },
  {
    key: "profile",
    label: "الملف الشخصي",
    category: "general",
    actions: ["view", "edit"],
    routes: [
      "/profile",
      "/api/me",
      "/api/me/avatar",
      "/api/me/password",
    ],
    sortOrder: 75,
  },
  {
    key: "files",
    label: "الملفات المرفقة",
    category: "general",
    actions: ["view"],
    routes: ["/api/files"],
    sortOrder: 80,
  },
  {
    key: "chat.users",
    label: "دليل المستخدمين للمحادثة",
    category: "general",
    actions: ["view"],
    routes: ["/api/chat/users"],
    sortOrder: 90,
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
    extraActions: [
      { key: "close", label: "إقفال الفترة" },
      { key: "open", label: "إعادة فتح الفترة" },
    ],
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

  // ─────────────── WhatsApp ───────────────
  {
    key: "whatsapp",
    label: "واتساب — المحادثات والقوالب",
    category: "operations",
    icon: "message-circle",
    actions: ["view", "create"],
    routes: [
      "/whatsapp",
      "/whatsapp/[contact]",
      "/whatsapp/phonebook",
      "/api/whatsapp/messages",
      "/api/whatsapp/messages/read",
      "/api/whatsapp/unread-count",
      "/api/whatsapp/send",
      "/api/whatsapp/send-template",
      "/api/whatsapp/templates",
      "/api/whatsapp/profile",
      "/api/whatsapp/profile/picture",
      "/api/whatsapp/register",
      "/api/whatsapp/conversations",
      "/api/whatsapp/conversations/counts",
      "/api/whatsapp/conversations/[phone]",
      "/api/whatsapp/conversations/[phone]/assign",
      "/api/whatsapp/conversations/[phone]/claim",
      "/api/whatsapp/conversations/[phone]/unassign",
      "/api/whatsapp/conversations/[phone]/status",
      "/api/whatsapp/conversations/[phone]/priority",
      "/api/whatsapp/conversations/[phone]/notes",
      "/api/whatsapp/conversations/[phone]/events",
      "/api/whatsapp/contacts",
      "/api/whatsapp/contacts/[phone]",
      "/api/whatsapp/contacts/import",
      "/api/whatsapp/contacts/export",
      "/api/whatsapp/push/subscribe",
      "/api/whatsapp/push/unsubscribe",
      "/api/whatsapp/push/vapid-public-key",
      "/api/whatsapp/push/test",
      "/api/whatsapp/notification-prefs",
    ],
    extraActions: [
      { key: "send", label: "إرسال رسالة" },
      { key: "send_template", label: "إرسال قالب" },
      { key: "sync_templates", label: "مزامنة القوالب من Meta" },
      { key: "assign", label: "إسناد المحادثات" },
      { key: "manage_status", label: "إغلاق / أرشفة / استئناف" },
      { key: "notes", label: "إضافة ملاحظات داخلية" },
      { key: "manage_contacts", label: "إدارة دفتر الهاتف" },
      { key: "export_contacts", label: "تصدير / استيراد CSV" },
      { key: "receive_notifications", label: "استلام إشعار المحادثات غير المسندة" },
    ],
    sortOrder: 65,
    description:
      "إدارة محادثات العملاء عبر WhatsApp Business Cloud API، دفتر الهاتف (CRM)، إسناد المحادثات، الملاحظات الداخلية، وإشعارات الويب.",
  },
  {
    key: "settings.whatsapp",
    label: "إعدادات واتساب (API)",
    category: "admin",
    actions: ACTIONS,
    routes: [
      "/settings/whatsapp",
      "/settings/whatsapp/notifications",
      "/api/whatsapp/config",
      "/api/whatsapp/probe",
      "/api/whatsapp/deploy",
    ],
    extraActions: [
      { key: "probe", label: "اختبار الاتصال بالـ API" },
      { key: "deploy", label: "نشر الإعدادات إلى الإنتاج" },
    ],
    sortOrder: 360,
    description:
      "إعداد تكامل WhatsApp Business Cloud API: App ID/Secret, WABA ID, Phone Number ID, Access Token, Webhook verify token.",
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
      "/api/permissions/sync",
      "/api/users/[id]/roles",
      "/api/users/[id]/overrides",
      "/api/me/permissions",
    ],
    extraActions: [
      { key: "sync", label: "تحديث الصلاحيات من الكود" },
    ],
    sortOrder: 320,
  },
  {
    key: "settings.prices",
    label: "الأسعار الموسمية",
    category: "admin",
    actions: ACTIONS,
    routes: [
      "/api/seasonal-prices",
      "/api/seasons",
      "/api/seasons/[id]",
      "/api/unit-type-prices",
    ],
    sortOrder: 330,
  },
  {
    key: "settings.unit_types",
    label: "أنواع الوحدات (قوالب الغرف والشقق)",
    category: "admin",
    actions: ACTIONS,
    routes: [
      "/settings/unit-types",
      "/settings/unit-types/new",
      "/settings/unit-types/[id]",
      "/api/unit-types",
      "/api/unit-types/[id]",
      "/api/unit-types/[id]/photos",
      "/api/unit-types/[id]/photos/[photoId]",
      "/api/amenities",
    ],
    sortOrder: 340,
    description:
      "إدارة قوالب الوحدات (الأسرّة، الغرف، المرافق، الصور) — مصدر البيانات الذي سيُزامن مع Booking.com.",
  },
  {
    key: "settings.booking",
    label: "تكامل Booking.com",
    category: "admin",
    actions: ACTIONS,
    extraActions: [
      { key: "trigger", label: "تشغيل مهمة" },
      { key: "map", label: "ربط الغرف" },
    ],
    routes: [
      "/settings/booking",
      "/api/booking/credentials",
      "/api/booking/credentials/[id]",
      "/api/booking/property-map",
      "/api/booking/jobs",
      "/api/booking/jobs/[id]",
      "/api/booking/inbox",
      "/api/booking/inbox/[id]",
    ],
    sortOrder: 350,
    description:
      "بيانات دخول Booking.com، تعيين الغرف، جدولة ومتابعة مهام المزامنة (عبر Playwright).",
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
    description: "إدارة الحجوزات والضيوف والغرف",
    isSystem: true,
    permissions: [
      "dashboard:view",
      // Everything on reservations EXCEPT `reopen` — reopening a
      // completed reservation is a manager-only privileged action.
      "reservations:view",
      "reservations:create",
      "reservations:edit",
      "reservations:delete",
      "reservations:cancel",
      "reservations:print",
      "reservations:checkin",
      "reservations:checkout",
      "reservations:noshow",
      "reservations:extend",
      "reservations.online:view",
      "reservations.online:manage",
      "rooms:view",
      "rooms:edit",
      "unit-photos:view",
      "unit-photos:create",
      "unit-photos:upload",
      "unit-photos:delete",
      "guests:*",
      "maintenance:view",
      "maintenance:create",
      "finance:view",
      "reports.monthly:view",
      "reports.debts:view",
      "settings:view",
      "settings.unit_types:view",
      "tasks.boards:view",
      "tasks.boards:create",
      "tasks.boards:edit",
      "tasks.cards:*",
      "chat:view",
      "chat:create",
      "whatsapp:view",
      "whatsapp:create",
      "whatsapp:send",
      "whatsapp:send_template",
      "whatsapp:notes",
      "whatsapp:manage_contacts",
      "whatsapp:receive_notifications",
      "notifications:view",
      "files:view",
      "chat.users:view",
      "profile:view",
      "profile:edit",
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
      "reservations.online:view",
      "rooms:view",
      "unit-photos:view",
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
      "settings.unit_types:view",
      "tasks.boards:view",
      "tasks.boards:create",
      "tasks.boards:edit",
      "tasks.cards:*",
      "chat:view",
      "chat:create",
      "notifications:view",
      "files:view",
      "chat.users:view",
      "profile:view",
      "profile:edit",
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
      "reservations.online:view",
      "rooms:view",
      "unit-photos:view",
      "guests:view",
      "maintenance:view",
      "finance:view",
      "reports.monthly:view",
      "reports.debts:view",
      "settings.unit_types:view",
      "tasks.boards:view",
      "tasks.cards:view",
      "chat:view",
      "notifications:view",
      "files:view",
      "chat.users:view",
      "profile:view",
      "profile:edit",
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
