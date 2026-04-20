import { PrismaClient } from "@prisma/client";

// Reuse a single client across the bot process to avoid the
// "too many database connections" warning while hot-reloading.
export const prisma = new PrismaClient({ log: ["warn", "error"] });
