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
  AlertTriangle,
  Receipt,
} from "lucide-react";
import { Can } from "@/components/Can";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";

const SECTIONS: Array<{
  href: string;
  title: string;
  desc: string;
  icon: typeof BookOpen;
  permission: string;
}> = [
  {
    href: "/accounting/cashbook",
    title: "الدفتر النقدي",
    desc: "الصندوق والبنك والمحفظة الإلكترونية مع أرصدة فورية",
    icon: Banknote,
    permission: "accounting.cashbook:view",
  },
  {
    href: "/accounting/accounts",
    title: "دليل الحسابات",
    desc: "إدارة شجرة الحسابات الأصول، الخصوم، الإيرادات، المصروفات",
    icon: BookOpen,
    permission: "accounting.accounts:view",
  },
  {
    href: "/accounting/parties",
    title: "الأطراف",
    desc: "الشركاء، الموردون، الموظفون، المُقرضون + كشف حساب",
    icon: Users,
    permission: "accounting.parties:view",
  },
  {
    href: "/accounting/payroll",
    title: "الرواتب والأجور",
    desc: "استحقاقات شهرية، عمولات، سلف، وسليبات رواتب قابلة للطباعة",
    icon: Receipt,
    permission: "accounting.parties:view",
  },
  {
    href: "/accounting/journal",
    title: "القيود اليومية",
    desc: "عرض كافة القيود وإنشاء قيد يدوي متعدد السطور",
    icon: BookText,
    permission: "accounting.journal:view",
  },
  {
    href: "/accounting/ledger",
    title: "الأستاذ العام",
    desc: "حركات حساب محدد مع أرصدة جارية",
    icon: Calculator,
    permission: "accounting.ledger:view",
  },
  {
    href: "/accounting/reports/trial-balance",
    title: "ميزان المراجعة",
    desc: "التحقق من توازن الحسابات بتاريخ معين",
    icon: Scale,
    permission: "accounting.reports:view",
  },
  {
    href: "/accounting/reports/income-statement",
    title: "قائمة الدخل",
    desc: "الإيرادات والمصروفات وصافي الربح/الخسارة",
    icon: TrendingUp,
    permission: "accounting.reports:view",
  },
  {
    href: "/accounting/reports/balance-sheet",
    title: "الميزانية العمومية",
    desc: "الأصول = الخصوم + حقوق الملكية",
    icon: Wallet,
    permission: "accounting.reports:view",
  },
  {
    href: "/accounting/reports/guest-debts",
    title: "تقرير ذمم الضيوف",
    desc: "الحجوزات غير المسددة — مربوطة بحساب 1100",
    icon: AlertTriangle,
    permission: "accounting.reports:view",
  },
  {
    href: "/accounting/periods",
    title: "الفترات المالية",
    desc: "فتح/إقفال الفترات وقيد إقفال سنوي",
    icon: CalendarRange,
    permission: "accounting.periods:view",
  },
];

export default function AccountingHomePage() {
  return (
    <PageShell>
      <PageHeader
        title="النظام المحاسبي"
        description="نظام قيد مزدوج كامل مع أطراف متعددة وتقارير مالية احترافية"
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-4">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Can key={s.href} permission={s.permission}>
            <Link
              href={s.href}
              className="relative bg-primary rounded-xl p-5 shadow-md hover:shadow-xl transition-all border border-gold/25 hover:border-gold/70 hover:-translate-y-0.5 group overflow-hidden"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -top-10 -left-10 w-32 h-32 rounded-full bg-gold/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity"
              />
              <div className="relative flex items-start justify-between gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gold/20 border border-gold/40 group-hover:bg-gold/30 transition-colors">
                  <Icon size={22} className="text-gold" />
                </div>
              </div>
              <h3 className="relative text-xl font-bold text-gold leading-tight inline-flex items-baseline gap-2 font-[family-name:var(--font-amiri)] mt-4">
                <span className="text-gold-light text-lg leading-none select-none">
                  ◆
                </span>
                {s.title}
              </h3>
              <span
                aria-hidden
                className="relative block h-px w-10 bg-gradient-to-l from-gold via-gold/50 to-transparent mt-2 mb-2 group-hover:w-16 transition-all"
              />
              <p className="relative text-sm text-gold-light/75 leading-relaxed">
                {s.desc}
              </p>
            </Link>
            </Can>
          );
        })}
      </div>
    </PageShell>
  );
}
