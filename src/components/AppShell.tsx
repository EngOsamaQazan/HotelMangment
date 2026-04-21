"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { NotificationsBell } from "@/components/NotificationsBell";
import { RoutePermissionGate } from "@/components/RoutePermissionGate";

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
      <main className="flex-1 md:mr-64 pt-16 md:pt-0 bg-page-bg min-h-screen flex flex-col">
        <div className="hidden md:flex items-center justify-end gap-2 px-6 py-2 border-b border-gray-200 bg-white/60 backdrop-blur-sm sticky top-0 z-30">
          <NotificationsBell iconClassName="text-gray-600 hover:bg-gray-100" />
        </div>
        <div className="flex-1 p-4 md:p-6">
          <RoutePermissionGate>{children}</RoutePermissionGate>
        </div>
      </main>
    </div>
  );
}
