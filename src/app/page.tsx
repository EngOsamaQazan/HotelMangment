import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { classifyHost, getAdminHost, getPublicHost } from "@/lib/hosts";

/**
 * Root entry point. Behaviour depends on the host and audience:
 *
 *   • admin.mafhotel.com
 *       – anonymous  → /login
 *       – guest      → `https://mafhotel.com/account`
 *       – staff      → admin dashboard (rendered inline)
 *   • mafhotel.com / www.mafhotel.com
 *       – anonymous  → /landing
 *       – guest      → /account
 *       – staff      → `https://admin.mafhotel.com/`
 *
 * The middleware already performs this routing, but we duplicate it here as a
 * server-side safety net: even if the middleware is bypassed (stale cookie,
 * cached response, or an edge misconfiguration), visitors still land on the
 * correct page instead of the wrong UI.
 */
export default async function RootPage() {
  const session = await getServerSession(authOptions);
  const hostKind = classifyHost((await headers()).get("host"));

  if (!session?.user) {
    redirect(hostKind === "admin" ? "/login" : "/landing");
  }

  if (session.user.audience === "guest") {
    if (hostKind === "admin") {
      redirect(`https://${getPublicHost()}/account`);
    }
    redirect("/account");
  }

  // Staff session. On the public host → bounce them to the admin subdomain.
  if (hostKind === "public") {
    redirect(`https://${getAdminHost()}/`);
  }

  return <DashboardHome />;
}
