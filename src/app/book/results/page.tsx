import { redirect } from "next/navigation";

/**
 * Legacy URL kept alive for bookmarks / shared links. The search experience
 * now lives entirely on `/book` (results render inline under the form), so
 * we forward any query-string to the new canonical URL.
 */
export default async function BookResultsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v) params.set(k, v);
  }
  const qs = params.toString();
  redirect(qs ? `/book?${qs}` : "/book");
}
