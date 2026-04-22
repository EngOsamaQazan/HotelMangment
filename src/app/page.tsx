import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DashboardHome } from "@/components/dashboard/DashboardHome";

/**
 * Root entry point. Two audiences share this URL:
 *
 *   • anonymous  → marketing site at /landing (never the staff login page)
 *   • guest      → their own /account area
 *   • staff      → the admin dashboard rendered inline below
 *
 * The middleware already performs this routing, but we duplicate it here as a
 * server-side safety net: even if the middleware is bypassed (stale cookie,
 * cached response, or an edge misconfiguration), visitors still land on the
 * correct page instead of the employee login.
 */
export default async function RootPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/landing");
  }

  if (session.user.audience === "guest") {
    redirect("/account");
  }

  return <DashboardHome />;
}
