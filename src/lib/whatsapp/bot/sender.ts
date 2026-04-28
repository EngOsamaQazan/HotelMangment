import "server-only";
import {
  sendText,
  sendInteractiveButtons,
  sendInteractiveList,
  type InteractiveButton,
  type InteractiveListSection,
  type GraphSendResponse,
} from "@/lib/whatsapp/client";
import {
  beginOutboundLog,
  finishOutboundLog,
} from "@/lib/whatsapp/log-outbound";

/**
 * Bot-side wrappers around the raw WhatsApp send helpers. They:
 *
 *   • Funnel every send through `beginOutboundLog` / `finishOutboundLog`
 *     so messages show up in the staff inbox at /whatsapp.
 *   • Tag the row with `origin: "bot"` for analytics.
 *   • Return a small handle so callers can correlate replies later.
 *
 * The "humanlike pacing" layer (Phase 4) wraps these — keep this module
 * dumb so it can be reused by tests and the sandbox tester unchanged.
 */

export interface BotSendResult {
  messageId: number | null;
  wamid: string | null;
}

async function fanout<T extends GraphSendResponse>(
  origin: string,
  to: string,
  type: "text" | "interactive",
  body: string | null,
  send: () => Promise<T>,
): Promise<BotSendResult> {
  const handle = await beginOutboundLog({
    to,
    type,
    body,
    origin,
  });
  try {
    const res = await send();
    const wamid = res.messages?.[0]?.id ?? null;
    if (handle) {
      await finishOutboundLog({
        rowId: handle.rowId,
        conversationId: handle.conversationId,
        contactPhone: to,
        ok: { wamid, raw: res },
      });
    }
    return { messageId: handle?.rowId ?? null, wamid };
  } catch (e) {
    if (handle) {
      await finishOutboundLog({
        rowId: handle.rowId,
        conversationId: handle.conversationId,
        contactPhone: to,
        err: e,
      });
    }
    console.error(`[bot/sender:${origin}] send failed`, e);
    return { messageId: null, wamid: null };
  }
}

export async function sendBotText(
  to: string,
  text: string,
  opts?: { previewUrl?: boolean; origin?: string },
): Promise<BotSendResult> {
  return fanout(opts?.origin ?? "bot", to, "text", text, () =>
    sendText({ to, text, previewUrl: opts?.previewUrl ?? false }),
  );
}

export async function sendBotButtons(args: {
  to: string;
  bodyText: string;
  buttons: InteractiveButton[];
  headerText?: string;
  footerText?: string;
  origin?: string;
}): Promise<BotSendResult> {
  return fanout(args.origin ?? "bot", args.to, "interactive", args.bodyText, () =>
    sendInteractiveButtons({
      to: args.to,
      bodyText: args.bodyText,
      buttons: args.buttons,
      headerText: args.headerText,
      footerText: args.footerText,
    }),
  );
}

export async function sendBotList(args: {
  to: string;
  bodyText: string;
  buttonText: string;
  sections: InteractiveListSection[];
  headerText?: string;
  footerText?: string;
  origin?: string;
}): Promise<BotSendResult> {
  return fanout(args.origin ?? "bot", args.to, "interactive", args.bodyText, () =>
    sendInteractiveList({
      to: args.to,
      bodyText: args.bodyText,
      buttonText: args.buttonText,
      sections: args.sections,
      headerText: args.headerText,
      footerText: args.footerText,
    }),
  );
}
