import { NotificationPreferencesScreen } from "@/components/notifications/NotificationPreferences";
import { PageShell } from "@/components/ui/PageShell";

/**
 * Notification preferences — `/notifications/preferences`
 *
 * Per-user customisation:
 *   - Master toggles for every channel (in-app, push, sound, WhatsApp, email).
 *   - Per-event toggles grouped by category (reservations, tasks, chat, …).
 *   - Per-event channel chips + digest mode (instant / hourly / daily / weekly).
 *   - Quiet hours window with timezone.
 *   - Quick presets (enable all / minimal / reset to defaults).
 *   - Send-test-to-self button.
 */
export default function NotificationPreferencesPage() {
  return (
    <PageShell>
      <NotificationPreferencesScreen />
    </PageShell>
  );
}
