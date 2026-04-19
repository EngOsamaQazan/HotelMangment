"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

const AUTH_ROUTES = new Set(["/login"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = AUTH_ROUTES.has(pathname);

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 md:mr-64 pt-16 md:pt-0 p-4 md:p-6 bg-page-bg min-h-screen">
        {children}
      </main>
    </div>
  );
}
