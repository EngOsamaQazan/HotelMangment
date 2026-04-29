import {
  Bell,
  CalendarCheck,
  ClipboardList,
  ListChecks,
  MessageCircle,
  MessageSquare,
  Wallet,
  Calculator,
  Wrench,
  Settings,
  Shield,
  AtSign,
  UserPlus,
  Calendar,
  AlertCircle,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import type { EventCategory } from "@/lib/notifications/events";

/**
 * Map an event `type` (or category) to a Lucide icon component. Exposed
 * as a function so the bell + center + preferences pages all stay
 * visually in sync.
 */
const TYPE_ICONS: Record<string, LucideIcon> = {
  "chat.message": MessageSquare,
  "chat.mention": AtSign,
  "task.assigned": UserPlus,
  "task.due": Calendar,
  "task.commented": MessageSquare,
  "task.completed": ListChecks,
  "reservation.created": CalendarCheck,
  "reservation.online": CalendarCheck,
  "reservation.checkin": CalendarCheck,
  "reservation.checkout": CalendarCheck,
  "reservation.cancelled": AlertCircle,
  "reservation.no_show": AlertCircle,
  "whatsapp.message": MessageCircle,
  "whatsapp.unassigned": MessageCircle,
  "whatsapp.assigned": MessageCircle,
  "maintenance.created": Wrench,
  "maintenance.completed": Wrench,
  "finance.payment": Wallet,
  "accounting.journal_posted": Calculator,
  "accounting.period_closed": Calculator,
  "security.login": Shield,
  "security.password_changed": Shield,
  "system.announcement": Megaphone,
};

const CATEGORY_ICONS: Record<EventCategory, LucideIcon> = {
  reservations: CalendarCheck,
  tasks: ClipboardList,
  chat: MessageSquare,
  whatsapp: MessageCircle,
  maintenance: Wrench,
  finance: Wallet,
  accounting: Calculator,
  security: Shield,
  system: Settings,
};

const CATEGORY_COLORS: Record<EventCategory, string> = {
  reservations: "#7367f0",
  tasks: "#00cfe8",
  chat: "#28c76f",
  whatsapp: "#25d366",
  maintenance: "#ff9f43",
  finance: "#9c27b0",
  accounting: "#3f51b5",
  security: "#ea5455",
  system: "#6c757d",
};

export function iconFor(type: string, category?: string | null): LucideIcon {
  return (
    TYPE_ICONS[type] ||
    (category && CATEGORY_ICONS[category as EventCategory]) ||
    Bell
  );
}

export function colorFor(category?: string | null): string {
  if (category && CATEGORY_COLORS[category as EventCategory]) {
    return CATEGORY_COLORS[category as EventCategory];
  }
  return "#7367f0";
}
