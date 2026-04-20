import { prisma } from "./prisma";

export type Level = "info" | "warn" | "error";

export async function log(jobId: number, level: Level, message: string, meta?: unknown) {
  // Console output is mirrored so `pm2 logs` shows the same stream as the DB.
  const stamp = new Date().toISOString();
  const metaStr = meta ? ` · ${JSON.stringify(meta)}` : "";
  const line = `[${stamp}] [job ${jobId}] [${level}] ${message}${metaStr}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  try {
    await prisma.bookingSyncLog.create({
      data: {
        jobId,
        level,
        message,
        metaJson: meta === undefined ? undefined : (meta as object),
      },
    });
  } catch (err) {
    console.error("Failed to persist log line:", err);
  }
}
