import { PrismaClient } from "@prisma/client";
import { getAuditContext } from "./audit-context";

const WRITE_OPS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
]);

const SKIP_MODELS = new Set(["AuditLog"]);

function actionFromOp(op: string): string {
  if (op.startsWith("create")) return "CREATE";
  if (op.startsWith("update") || op === "upsert") return "UPDATE";
  if (op.startsWith("delete")) return "DELETE";
  return op.toUpperCase();
}

function buildPrisma() {
  const base = new PrismaClient();

  return base.$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        if (!model || !WRITE_OPS.has(operation) || SKIP_MODELS.has(model)) {
          return query(args);
        }

        const ctx = getAuditContext();
        if (!ctx) return query(args);

        const action = actionFromOp(operation);

        return query(args).then(async (result) => {
          try {
            await base.auditLog.create({
              data: {
                action,
                resource: model,
                resourceId:
                  result && typeof result === "object" && "id" in result
                    ? String((result as { id: unknown }).id)
                    : null,
                summary: `${action} ${model}`,
                newValues:
                  action === "DELETE"
                    ? undefined
                    : result && typeof result === "object"
                      ? (JSON.parse(JSON.stringify(result)) as object)
                      : undefined,
                userId: ctx.userId,
                userEmail: ctx.userEmail,
                userName: ctx.userName,
                audience: ctx.audience,
                ipAddress: ctx.ipAddress,
                userAgent: ctx.userAgent,
                httpMethod: ctx.httpMethod,
                path: ctx.path,
                durationMs: Math.round(performance.now() - ctx.startedAt),
              },
            });
          } catch {
            // Never break the main operation.
          }
          return result;
        });
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof buildPrisma>;
};

export const prisma = globalForPrisma.prisma || buildPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
