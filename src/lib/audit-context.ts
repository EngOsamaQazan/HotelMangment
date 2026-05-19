import { AsyncLocalStorage } from "node:async_hooks";

export interface AuditContext {
  userId: number | null;
  userEmail: string | null;
  userName: string | null;
  audience: "staff" | "guest" | "system";
  ipAddress: string | null;
  userAgent: string | null;
  httpMethod: string | null;
  path: string | null;
  startedAt: number;
}

export const auditStore = new AsyncLocalStorage<AuditContext>();

export function getAuditContext(): AuditContext | undefined {
  return auditStore.getStore();
}
