"use client";

import Link from "next/link";
import { ShieldAlert, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

interface ForbiddenCardProps {
  /** Main heading (Arabic). */
  title?: string;
  /** Short explanation shown below the heading. */
  description?: ReactNode;
  /** Optional target for the primary action link. */
  backHref?: string;
  /** Label for the primary action link. */
  backLabel?: string;
}

/**
 * Unified "you are not allowed here" card. Used both by the central
 * `RoutePermissionGate` and by per-action gates that want to show a full
 * screen message instead of silently hiding.
 */
export function ForbiddenCard({
  title = "لا تملك صلاحية الوصول إلى هذه الصفحة",
  description = (
    <>
      تم حجب هذا القسم عنك لأنك لا تملك الصلاحية اللازمة.
      راجع مدير النظام لمنحك الصلاحية أو عُد إلى الصفحة الرئيسية.
    </>
  ),
  backHref = "/",
  backLabel = "العودة إلى الرئيسية",
}: ForbiddenCardProps) {
  return (
    <div className="max-w-xl mx-auto mt-10">
      <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6 space-y-4 text-center">
        <div className="flex justify-center">
          <div className="p-3 bg-red-50 rounded-full">
            <ShieldAlert size={32} className="text-red-500" />
          </div>
        </div>
        <h2 className="text-lg font-bold text-gray-800">{title}</h2>
        <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
        <div className="pt-2">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-5 py-2 rounded-lg transition-colors text-sm font-medium"
          >
            <ArrowRight size={16} />
            {backLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
