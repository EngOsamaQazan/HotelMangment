import "server-only";
import { prisma } from "./prisma";
import { getAuditContext, type AuditContext } from "./audit-context";

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "secret",
  "token",
  "refreshToken",
  "accessToken",
  "otp",
  "otpHash",
  "apiKey",
  "secretKey",
  "encryptedKey",
  "creditCard",
]);

function redact(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k) || k.toLowerCase().includes("password")) {
      out[k] = "***REDACTED***";
    } else if (typeof v === "object" && v !== null) {
      out[k] = redact(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function diff(
  oldObj: Record<string, unknown> | null,
  newObj: Record<string, unknown> | null,
): { old: Record<string, unknown>; new: Record<string, unknown> } | null {
  if (!oldObj || !newObj) return null;
  const changedOld: Record<string, unknown> = {};
  const changedNew: Record<string, unknown> = {};
  let hasChanges = false;
  for (const key of new Set([...Object.keys(oldObj), ...Object.keys(newObj)])) {
    const a = JSON.stringify(oldObj[key]);
    const b = JSON.stringify(newObj[key]);
    if (a !== b) {
      changedOld[key] = oldObj[key];
      changedNew[key] = newObj[key];
      hasChanges = true;
    }
  }
  return hasChanges ? { old: changedOld, new: changedNew } : null;
}

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "EXPORT"
  | "VOID"
  | "APPROVE"
  | "VIEW_SENSITIVE";

export interface AuditEntry {
  action: AuditAction;
  resource: string;
  resourceId?: string | number | null;
  summary?: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  userId?: number | null;
  userEmail?: string | null;
  userName?: string | null;
  audience?: "staff" | "guest" | "system";
  ipAddress?: string | null;
  userAgent?: string | null;
  httpMethod?: string | null;
  path?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const ctx = getAuditContext();
    const changes = diff(
      entry.oldValues as Record<string, unknown> | null,
      entry.newValues as Record<string, unknown> | null,
    );

    await prisma.auditLog.create({
      data: {
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId != null ? String(entry.resourceId) : null,
        summary: entry.summary ?? null,
        oldValues: changes
          ? (redact(changes.old) as object)
          : entry.oldValues
            ? (redact(entry.oldValues) as object)
            : undefined,
        newValues: changes
          ? (redact(changes.new) as object)
          : entry.newValues
            ? (redact(entry.newValues) as object)
            : undefined,
        metadata: entry.metadata ? (redact(entry.metadata) as object) : undefined,
        userId: entry.userId ?? ctx?.userId ?? null,
        userEmail: entry.userEmail ?? ctx?.userEmail ?? null,
        userName: entry.userName ?? ctx?.userName ?? null,
        audience: entry.audience ?? ctx?.audience ?? "system",
        ipAddress: entry.ipAddress ?? ctx?.ipAddress ?? null,
        userAgent: entry.userAgent ?? ctx?.userAgent ?? null,
        httpMethod: entry.httpMethod ?? ctx?.httpMethod ?? null,
        path: entry.path ?? ctx?.path ?? null,
        statusCode: entry.statusCode ?? null,
        durationMs:
          entry.durationMs ?? (ctx ? Math.round(performance.now() - ctx.startedAt) : null),
      },
    });
  } catch {
    // Audit logging must never break the main operation.
    console.error("[audit] failed to write audit log");
  }
}

export function logAuditAsync(entry: AuditEntry): void {
  logAudit(entry).catch(() => {});
}
