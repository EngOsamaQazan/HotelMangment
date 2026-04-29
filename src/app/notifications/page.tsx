import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { PageShell } from "@/components/ui/PageShell";

/**
 * Notification Center — `/notifications`
 *
 * The full-page inbox: tabs (الكل/غير المقروءة/المُهم/النظام), per-row
 * actions (mark read, archive, snooze), bulk select, search and filters,
 * and grouping by day. Inspired by the Tayseer notification center but
 * powered by our existing `Notification` Prisma model.
 *
 * Permission gating happens inside the API routes via `requirePermission`;
 * this page is a public client shell that renders nothing useful when
 * the user is unauthenticated (the bell + APIs return empty).
 */
export default function NotificationsPage() {
  return (
    <PageShell>
      <NotificationCenter />
    </PageShell>
  );
}
