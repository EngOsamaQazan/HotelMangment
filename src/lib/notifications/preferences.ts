import "server-only";
import { prisma } from "@/lib/prisma";
import { EVENTS, EVENT_BY_CODE, type EventDef } from "./events";
import {
  CHANNEL_KEYS,
  type EventChannel,
  type DigestMode,
} from "./channels";

/**
 * Server-side preferences helpers.
 *
 * The preferences table holds two row shapes:
 *   - `eventCode = "*"` → channel-master row (one per channel per user).
 *     Setting `isEnabled=false` mutes the entire channel.
 *   - `eventCode = "<event>"` → per-event row (one per channel per event).
 *
 * Quiet hours + timezone live on the global in_app master row to keep
 * them user-wide rather than per-event.
 */

export interface PreferenceRow {
  eventCode: string;
  channel: string;
  isEnabled: boolean;
  digestMode: DigestMode;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
}

/**
 * Read every preference row owned by `userId`, keyed by `${eventCode}:${channel}`.
 */
export async function getUserPreferences(
  userId: number,
): Promise<Record<string, PreferenceRow>> {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId },
  });
  const out: Record<string, PreferenceRow> = {};
  for (const r of rows) {
    out[`${r.eventCode}:${r.channel}`] = {
      eventCode: r.eventCode,
      channel: r.channel,
      isEnabled: r.isEnabled,
      digestMode: r.digestMode as DigestMode,
      quietHoursStart: r.quietHoursStart,
      quietHoursEnd: r.quietHoursEnd,
      timezone: r.timezone,
    };
  }
  return out;
}

/**
 * Resolve the effective set of channels that should fire for one event.
 *
 *   1. Start with `event.defaultChannels` if no per-event row exists,
 *      otherwise take the union of every `<event>:<channel>` row that has
 *      `isEnabled=true`.
 *   2. Subtract any channel whose `*:<channel>` master row is disabled.
 *   3. Critical events (`event.isCritical`) bypass step 2 — they ALWAYS
 *      deliver on their declared default channels.
 */
export async function resolveDeliveryChannels(
  userId: number,
  eventCode: string,
): Promise<EventChannel[]> {
  const event = EVENT_BY_CODE[eventCode];
  if (!event) return ["in_app"]; // fail-safe: still bell-notify
  const prefs = await getUserPreferences(userId);

  const enabled = new Set<EventChannel>();
  let hasPerEventRow = false;
  for (const ch of CHANNEL_KEYS) {
    const row = prefs[`${eventCode}:${ch}`];
    if (row) {
      hasPerEventRow = true;
      if (row.isEnabled) enabled.add(ch);
    } else if (event.defaultChannels.includes(ch)) {
      enabled.add(ch);
    }
  }
  if (!hasPerEventRow && enabled.size === 0) {
    for (const ch of event.defaultChannels) enabled.add(ch);
  }

  if (!event.isCritical) {
    for (const ch of CHANNEL_KEYS) {
      const master = prefs[`*:${ch}`];
      if (master && !master.isEnabled) enabled.delete(ch);
    }
  }
  return Array.from(enabled);
}

/**
 * Bulk replace the user's preferences with the given rows. Each input row
 * is upserted under its `(userId, eventCode, channel)` unique key. Rows
 * not present in the input are left untouched (so partial saves are safe).
 */
export interface PreferencePatch {
  eventCode: string;
  channel: string;
  isEnabled: boolean;
  digestMode?: DigestMode | string;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  timezone?: string | null;
}

export async function savePreferences(
  userId: number,
  patches: PreferencePatch[],
): Promise<void> {
  if (!patches.length) return;
  await prisma.$transaction(
    patches.map((p) =>
      prisma.notificationPreference.upsert({
        where: {
          userId_eventCode_channel: {
            userId,
            eventCode: p.eventCode || "*",
            channel: p.channel,
          },
        },
        create: {
          userId,
          eventCode: p.eventCode || "*",
          channel: p.channel,
          isEnabled: !!p.isEnabled,
          digestMode: (p.digestMode as string) || "instant",
          quietHoursStart: p.quietHoursStart ?? null,
          quietHoursEnd: p.quietHoursEnd ?? null,
          timezone: p.timezone || "Asia/Amman",
        },
        update: {
          isEnabled: !!p.isEnabled,
          digestMode: (p.digestMode as string) || "instant",
          quietHoursStart: p.quietHoursStart ?? null,
          quietHoursEnd: p.quietHoursEnd ?? null,
          timezone: p.timezone || "Asia/Amman",
        },
      }),
    ),
  );
}

/**
 * Lightweight summary used by the preferences hero card.
 * Counts how many channels and how many user-facing events are currently
 * enabled given the user's stored preferences.
 */
export async function summarizePreferences(
  userId: number,
): Promise<{ activeChannels: number; activeEvents: number; totalEvents: number }> {
  const prefs = await getUserPreferences(userId);
  const userFacing: EventDef[] = EVENTS.filter((e) => e.isUserFacing !== false);

  let activeChannels = 0;
  for (const ch of CHANNEL_KEYS) {
    const master = prefs[`*:${ch}`];
    if (!master || master.isEnabled) activeChannels++;
  }

  let activeEvents = 0;
  for (const ev of userFacing) {
    let any = false;
    for (const ch of CHANNEL_KEYS) {
      const row = prefs[`${ev.code}:${ch}`];
      if (row) {
        if (row.isEnabled) {
          any = true;
          break;
        }
      } else if (ev.defaultChannels.includes(ch)) {
        any = true;
        break;
      }
    }
    if (any) activeEvents++;
  }

  return {
    activeChannels,
    activeEvents,
    totalEvents: userFacing.length,
  };
}
