/**
 * Reservation status-transition audit log.
 *
 * Every state change a reservation goes through — whether triggered by a
 * front-desk action, a cron sweep, or an edit — is recorded here as an
 * append-only row in `reservation_status_logs`. The row captures:
 *   • who did it (actorUserId, nullable for cron/system)
 *   • when it happened (server time)
 *   • what changed (fromStatus → toStatus)
 *   • why (reason, free text, optional)
 *
 * This is the backbone of the action-driven workflow:
 * no status change happens without writing here.
 *
 * Consumers:
 *   • POST /api/reservations/[id]/{checkin,checkout,cancel,no-show,reopen,extend}
 *   • PUT  /api/reservations/[id]  (financial edits → `edit`)
 *   • sweeper (auto transitions → `auto_activate` / `auto_complete`)
 *   • GET  /api/reservations/[id]/status-log  (UI history timeline)
 */

import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export type StatusLogAction =
  | "check_in"
  | "check_out"
  | "cancel"
  | "no_show"
  | "reopen"
  | "extend"
  | "edit"
  | "auto_activate"
  | "auto_complete";

export const STATUS_LOG_ACTION_LABELS: Record<StatusLogAction, string> = {
  check_in: "تسجيل دخول",
  check_out: "تسجيل مغادرة",
  cancel: "إلغاء",
  no_show: "عدم حضور",
  reopen: "إعادة فتح",
  extend: "تمديد",
  edit: "تعديل مالي",
  auto_activate: "تفعيل تلقائي",
  auto_complete: "إنهاء تلقائي",
};

export interface LogStatusTransitionArgs {
  reservationId: number;
  fromStatus: string;
  toStatus: string;
  action: StatusLogAction;
  reason?: string | null;
  actorUserId?: number | null;
}

export async function logStatusTransition(
  tx: Tx,
  args: LogStatusTransitionArgs,
): Promise<void> {
  await tx.reservationStatusLog.create({
    data: {
      reservationId: args.reservationId,
      fromStatus: args.fromStatus,
      toStatus: args.toStatus,
      action: args.action,
      reason: args.reason ?? null,
      actorUserId: args.actorUserId ?? null,
    },
  });
}

/**
 * State machine: given a current status and an action, return whether the
 * transition is allowed. Centralized here so APIs/UI can query the same
 * rules (and we don't duplicate the logic across routes).
 *
 * Allowed transitions:
 *   upcoming → active       via check_in
 *   upcoming → cancelled    via cancel | no_show
 *   active   → completed    via check_out
 *   active   → cancelled    via cancel  (rare — early termination)
 *   completed → active      via reopen
 *
 * Anything else returns `false`.
 */
export function isTransitionAllowed(
  fromStatus: string,
  action: StatusLogAction,
): boolean {
  switch (action) {
    case "check_in":
      return fromStatus === "upcoming";
    case "check_out":
      return fromStatus === "active";
    case "cancel":
      return fromStatus === "upcoming" || fromStatus === "active";
    case "no_show":
      return fromStatus === "upcoming";
    case "reopen":
      return fromStatus === "completed";
    case "extend":
      // `extend` does not change state by itself (stays `active` or is
      // reopened by the extend endpoint). We log it purely for the trail.
      return (
        fromStatus === "active" ||
        fromStatus === "upcoming" ||
        fromStatus === "completed"
      );
    case "edit":
      // Edits never change the status; they're logged for financial trail.
      return true;
    case "auto_activate":
      return fromStatus === "upcoming";
    case "auto_complete":
      return fromStatus === "active";
    default:
      return false;
  }
}
