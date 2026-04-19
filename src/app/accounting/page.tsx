"use client";

import Link from "next/link";
import {
  BookOpen,
  Users,
  BookText,
  Scale,
  TrendingUp,
  Wallet,
  CalendarRange,
  Calculator,
  Banknote,
} from "lucide-react";

type Accent = "primary" | "gold";

const SECTIONS: Array<{
  href: string;
  title: string;
  desc: string;
  icon: typeof BookOpen;
  accent: Accent;
}> = [
  {
    href: "/accounting/cashbook",
    title: "الدفتر النقدي",
    desc: "الصندوق والبنك والمحفظة الإلكترونية مع أرصدة فورية",
    icon: Banknote,
    accent: "gold",
  },
  {
    href: "/accounting/accounts",
    title: "دليل الحسابات",
    desc: "إدارة شجرة الحسابات الأصول، الخصوم، الإيرادات، المصروفات",
    icon: BookOpen,
    accent: "primary",
  },
  {
    href: "/accounting/parties",
    title: "الأطراف",
    desc: "الشركاء، الموردون، الموظفون، المُقرضون + كشف حساب",
    icon: Users,
    accent: "primary",
  },
  {
    href: "/accounting/journal",
    title: "القيود اليومية",
    desc: "عرض كافة القيود وإنشاء قيد يدوي متعدد السطور",
    icon: BookText,
    accent: "gold",
  },
  {
    href: "/accounting/ledger",
    title: "الأستاذ العام",
    desc: "حركات حساب محدد مع أرصدة جارية",
    icon: Calculator,
    accent: "primary",
  },
  {
    href: "/accounting/reports/trial-balance",
    title: "ميزان المراجعة",
    desc: "التحقق من توازن الحسابات بتاريخ معين",
    icon: Scale,
    accent: "gold",
  },
  {
    href: "/accounting/reports/income-statement",
    title: "قائمة الدخل",
    desc: "الإيرادات والمصروفات وصافي الربح/الخسارة",
    icon: TrendingUp,
    accent: "primary",
  },
  {
    href: "/accounting/reports/balance-sheet",
    title: "الميزانية العمومية",
    desc: "الأصول = الخصوم + حقوق الملكية",
    icon: Wallet,
    accent: "gold",
  },
  {
    href: "/accounting/periods",
    title: "الفترات المالية",
    desc: "فتح/إقفال الفترات وقيد إقفال سنوي",
    icon: CalendarRange,
    accent: "primary",
  },
];

const ACCENT_STYLES: Record<
  Accent,
  { iconBox: string; iconColor: string; hoverRing: string }
> = {
  primary: {
    iconBox: "bg-primary/10 border border-primary/20",
    iconColor: "text-primary",
    hoverRing: "group-hover:border-primary/40 group-hover:bg-primary/15",
  },
  gold: {
    iconBox: "bg-gold-soft border border-gold/40",
    iconColor: "text-gold-dark",
    hoverRing: "group-hover:border-gold/70 group-hover:bg-gold/20",
  },
};

export default function AccountingHomePage() {
  return (
    <div className="space-y-6">
      <div className="border-b-2 border-gold/30 pb-3">
        <div className="flex items-center gap-3">
          <span className="inline-block w-1 h-8 bg-gold rounded-full" />
          <h1 className="text-2xl sm:text-3xl font-bold text-primary font-[family-name:var(--font-amiri)] tracking-tight">
            النظام المحاسبي
          </h1>
        </div>
        <p className="text-sm text-gray-500 mt-1 ms-4">
          نظام قيد مزدوج كامل مع أطراف متعددة وتقارير مالية احترافية
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const style = ACCENT_STYLES[s.accent];
          return (
            <Link
              key={s.href}
              href={s.href}
              className="relative bg-card-bg rounded-xl p-5 shadow-sm hover:shadow-lg transition-all border border-gold/15 hover:border-gold/50 hover:-translate-y-0.5 group overflow-hidden"
            >
              <span
                aria-hidden
                className="absolute inset-y-0 right-0 w-1 bg-gold/0 group-hover:bg-gold transition-colors"
              />
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${style.iconBox} ${style.hoverRing} mb-3`}
              >
                <Icon size={22} className={style.iconColor} />
              </div>
              <h3
                className="text-xl font-bold text-primary group-hover:text-primary-dark leading-tight inline-flex items-baseline gap-2 font-[family-name:var(--font-amiri)]"
              >
                <span className="text-gold-dark text-lg leading-none select-none">
                  ◆
                </span>
                {s.title}
              </h3>
              <span
                aria-hidden
                className="block h-px w-10 bg-gradient-to-l from-gold/80 via-gold/40 to-transparent mt-2 mb-2 group-hover:w-16 transition-all"
              />
              <p className="text-sm text-gray-500 leading-relaxed">
                {s.desc}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
