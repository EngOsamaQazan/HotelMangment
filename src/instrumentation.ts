/**
 * Next.js runtime instrumentation entry point.
 *
 * `register()` is called once per Node.js worker on boot — both in dev
 * (with hot-reload caveats) and in production (`output: standalone`).
 * We use it to recover any background jobs that were lost during a
 * previous crash / hot-reload cycle, so the user-visible behaviour is
 * always "messages eventually arrive" rather than "silently dropped".
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return; // skip Edge runtime

  // Defer the import so this file stays light when the runtime doesn't
  // need it (Edge/middleware/workers).
  const { recoverPendingBookingConfirmations } = await import(
    "./lib/whatsapp/auto-trigger"
  );

  // Run after the server has finished its synchronous boot — gives the
  // Prisma client time to connect and the rest of Next.js time to settle.
  setTimeout(async () => {
    try {
      const { scanned, refired } = await recoverPendingBookingConfirmations();
      if (refired > 0) {
        console.log(
          `[instrumentation] booking recovery: re-fired ${refired}/${scanned} reservation(s) missing a confirmation send.`,
        );
      } else if (scanned > 0) {
        console.log(
          `[instrumentation] booking recovery: ${scanned} recent reservation(s) — all already covered.`,
        );
      }
    } catch (err) {
      console.error("[instrumentation] booking recovery error:", err);
    }
  }, 2_000);
}
