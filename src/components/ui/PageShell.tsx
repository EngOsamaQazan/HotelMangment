import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * PageShell — the outer wrapper every staff page should render at its root.
 *
 * Why this primitive exists:
 *  - Keeps horizontal padding responsive (clamp 12–24px).
 *  - Enforces `min-width: 0` so flex children (tables, kanban) cannot
 *    inflate the page and push siblings off-screen on narrow viewports.
 *  - Provides consistent vertical rhythm (`gap`) between sections without
 *    every page inventing its own spacing stack.
 *
 * Usage:
 *   export default function MyPage() {
 *     return (
 *       <PageShell>
 *         <PageHeader title="..." />
 *         <KpiGrid>...</KpiGrid>
 *         ...
 *       </PageShell>
 *     );
 *   }
 */
export function PageShell({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "main";
}) {
  return <Tag className={cn("page-stack", className)}>{children}</Tag>;
}
