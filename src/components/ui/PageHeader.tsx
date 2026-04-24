import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  /** Shown beside the title, typically the back arrow link target. */
  backHref?: string;
  /** Optional subtitle/description. Hidden on < md to save vertical space. */
  description?: ReactNode;
  /** Optional leading icon (e.g. from lucide-react). */
  icon?: ReactNode;
  /** Accent color dot (for entities like boards). */
  accentColor?: string;
  /** Right-side action slot — usually a primary CTA button. */
  actions?: ReactNode;
  /** Hide the description on every viewport (pages that don't need it). */
  hideDescription?: boolean;
  className?: string;
}

/**
 * PageHeader — unified page title row.
 *
 * Layout goals:
 *  - Title never causes overflow (truncates).
 *  - Description hidden < md (so mobile gets more vertical room).
 *  - Actions wrap onto their own row only when the title + actions don't fit.
 *  - Back button is always an anchor so long-press / middle-click behave natively.
 *  - RTL-safe: uses `start`/`end` logical flex alignment (flex + gap work
 *    correctly under `dir="rtl"` in our layout).
 */
export function PageHeader({
  title,
  backHref,
  description,
  icon,
  accentColor,
  actions,
  hideDescription,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-3 gap-y-2 min-w-0",
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {backHref && (
          <Link
            href={backHref}
            className="shrink-0 -me-1 p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-primary transition-colors tap-44"
            aria-label="رجوع"
          >
            <ArrowRight size={18} />
          </Link>
        )}
        {accentColor && (
          <span
            className="shrink-0 w-3 h-3 rounded-full border border-black/10"
            style={{ backgroundColor: accentColor }}
            aria-hidden
          />
        )}
        {icon && (
          <span className="shrink-0 text-primary" aria-hidden>
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="page-header-title">{title}</h1>
          {!hideDescription && description && (
            <p className="hidden md:block text-xs text-gray-500 mt-0.5 truncate">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
