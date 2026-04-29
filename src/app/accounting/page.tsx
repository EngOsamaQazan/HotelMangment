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
  Target,
  type LucideIcon,
} from "lucide-react";
import { Can } from "@/components/Can";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";

/**
 * Per-card accent palette.
 *
 * We intentionally use full Tailwind class names (no string concatenation)
 * so the JIT compiler does not purge the variants. Each token contains the
 * matching tones for: icon tile background, icon color, border ring,
 * decorative glow blob, and the title gradient underline.
 */
type Tone =
  | "emerald"
  | "indigo"
  | "blue"
  | "rose"
  | "amber"
  | "violet"
  | "cyan"
  | "teal"
  | "green"
  | "sky"
  | "red"
  | "orange";

const TONE_STYLES: Record<
  Tone,
  {
    iconWrap: string;
    iconColor: string;
    border: string;
    hoverBorder: string;
    glow: string;
    title: string;
    rule: string;
  }
> = {
  emerald: {
    iconWrap: "bg-emerald-500/15 border-emerald-400/40 group-hover:bg-emerald-500/25",
    iconColor: "text-emerald-300",
    border: "border-emerald-400/25",
    hoverBorder: "hover:border-emerald-400/70",
    glow: "bg-emerald-400/15",
    title: "text-emerald-200",
    rule: "from-emerald-300 via-emerald-300/40",
  },
  indigo: {
    iconWrap: "bg-indigo-500/15 border-indigo-400/40 group-hover:bg-indigo-500/25",
    iconColor: "text-indigo-300",
    border: "border-indigo-400/25",
    hoverBorder: "hover:border-indigo-400/70",
    glow: "bg-indigo-400/15",
    title: "text-indigo-200",
    rule: "from-indigo-300 via-indigo-300/40",
  },
  blue: {
    iconWrap: "bg-blue-500/15 border-blue-400/40 group-hover:bg-blue-500/25",
    iconColor: "text-blue-300",
    border: "border-blue-400/25",
    hoverBorder: "hover:border-blue-400/70",
    glow: "bg-blue-400/15",
    title: "text-blue-200",
    rule: "from-blue-300 via-blue-300/40",
  },
  rose: {
    iconWrap: "bg-rose-500/15 border-rose-400/40 group-hover:bg-rose-500/25",
    iconColor: "text-rose-300",
    border: "border-rose-400/25",
    hoverBorder: "hover:border-rose-400/70",
    glow: "bg-rose-400/15",
    title: "text-rose-200",
    rule: "from-rose-300 via-rose-300/40",
  },
  amber: {
    iconWrap: "bg-amber-500/15 border-amber-400/40 group-hover:bg-amber-500/25",
    iconColor: "text-amber-300",
    border: "border-amber-400/25",
    hoverBorder: "hover:border-amber-400/70",
    glow: "bg-amber-400/15",
    title: "text-amber-200",
    rule: "from-amber-300 via-amber-300/40",
  },
  violet: {
    iconWrap: "bg-violet-500/15 border-violet-400/40 group-hover:bg-violet-500/25",
    iconColor: "text-violet-300",
    border: "border-violet-400/25",
    hoverBorder: "hover:border-violet-400/70",
    glow: "bg-violet-400/15",
    title: "text-violet-200",
    rule: "from-violet-300 via-violet-300/40",
  },
  cyan: {
    iconWrap: "bg-cyan-500/15 border-cyan-400/40 group-hover:bg-cyan-500/25",
    iconColor: "text-cyan-300",
    border: "border-cyan-400/25",
    hoverBorder: "hover:border-cyan-400/70",
    glow: "bg-cyan-400/15",
    title: "text-cyan-200",
    rule: "from-cyan-300 via-cyan-300/40",
  },
  teal: {
    iconWrap: "bg-teal-500/15 border-teal-400/40 group-hover:bg-teal-500/25",
    iconColor: "text-teal-300",
    border: "border-teal-400/25",
    hoverBorder: "hover:border-teal-400/70",
    glow: "bg-teal-400/15",
    title: "text-teal-200",
    rule: "from-teal-300 via-teal-300/40",
  },
  green: {
    iconWrap: "bg-green-500/15 border-green-400/40 group-hover:bg-green-500/25",
    iconColor: "text-green-300",
    border: "border-green-400/25",
    hoverBorder: "hover:border-green-400/70",
    glow: "bg-green-400/15",
    title: "text-green-200",
    rule: "from-green-300 via-green-300/40",
  },
  sky: {
    iconWrap: "bg-sky-500/15 border-sky-400/40 group-hover:bg-sky-500/25",
    iconColor: "text-sky-300",
    border: "border-sky-400/25",
    hoverBorder: "hover:border-sky-400/70",
    glow: "bg-sky-400/15",
    title: "text-sky-200",
    rule: "from-sky-300 via-sky-300/40",
  },
  red: {
    iconWrap: "bg-red-500/15 border-red-400/40 group-hover:bg-red-500/25",
    iconColor: "text-red-300",
    border: "border-red-400/25",
    hoverBorder: "hover:border-red-400/70",
    glow: "bg-red-400/15",
    title: "text-red-200",
    rule: "from-red-300 via-red-300/40",
  },
  orange: {
    iconWrap: "bg-orange-500/15 border-orange-400/40 group-hover:bg-orange-500/25",
    iconColor: "text-orange-300",
    border: "border-orange-400/25",
    hoverBorder: "hover:border-orange-400/70",
    glow: "bg-orange-400/15",
    title: "text-orange-200",
    rule: "from-orange-300 via-orange-300/40",
  },
};

interface Section {
  href: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  permission: string;
  tone: Tone;
}

const SECTIONS: Section[] = [
  {
    href: "/accounting/cashbook",
    title: "الدفتر النقدي",
    desc: "الصندوق والبنك والمحفظة الإلكترونية مع أرصدة فورية",
    icon: Banknote,
    permission: "accounting.cashbook:view",
    tone: "emerald",
  },
  {
    href: "/accounting/accounts",
    title: "دليل الحسابات",
    desc: "إدارة شجرة الحسابات الأصول، الخصوم، الإيرادات، المصروفات",
    icon: BookOpen,
    permission: "accounting.accounts:view",
    tone: "indigo",
  },
  {
    href: "/accounting/parties",
    title: "الأطراف",
    desc: "الشركاء، الموردون، الموظفون، المُقرضون + كشف حساب",
    icon: Users,
    permission: "accounting.parties:view",
    tone: "blue",
  },
  {
    href: "/accounting/cost-centers",
    title: "مراكز التكلفة",
    desc: "تصنيف المصروفات والإيرادات حسب الإدارة أو المشروع أو الفرع",
    icon: Target,
    permission: "accounting.cost-centers:view",
    tone: "rose",
  },
  {
    href: "/accounting/payroll",
    title: "الرواتب والأجور",
    desc: "استحقاقات شهرية، عمولات، سلف، وسليبات رواتب قابلة للطباعة",
    icon: Receipt,
    permission: "accounting.parties:view",
    tone: "amber",
  },
  {
    href: "/accounting/journal",
    title: "القيود اليومية",
    desc: "عرض كافة القيود وإنشاء قيد يدوي متعدد السطور",
    icon: BookText,
    permission: "accounting.journal:view",
    tone: "violet",
  },
  {
    href: "/accounting/ledger",
    title: "الأستاذ العام",
    desc: "حركات حساب محدد مع أرصدة جارية",
    icon: Calculator,
    permission: "accounting.ledger:view",
    tone: "cyan",
  },
  {
    href: "/accounting/reports/trial-balance",
    title: "ميزان المراجعة",
    desc: "التحقق من توازن الحسابات بتاريخ معين",
    icon: Scale,
    permission: "accounting.reports:view",
    tone: "teal",
  },
  {
    href: "/accounting/reports/income-statement",
    title: "قائمة الدخل",
    desc: "الإيرادات والمصروفات وصافي الربح/الخسارة",
    icon: TrendingUp,
    permission: "accounting.reports:view",
    tone: "green",
  },
  {
    href: "/accounting/reports/balance-sheet",
    title: "الميزانية العمومية",
    desc: "الأصول = الخصوم + حقوق الملكية",
    icon: Wallet,
    permission: "accounting.reports:view",
    tone: "sky",
  },
  {
    href: "/accounting/reports/guest-debts",
    title: "تقرير ذمم الضيوف",
    desc: "الحجوزات غير المسددة — مربوطة بحساب 1100",
    icon: AlertTriangle,
    permission: "accounting.reports:view",
    tone: "red",
  },
  {
    href: "/accounting/periods",
    title: "الفترات المالية",
    desc: "فتح/إقفال الفترات وقيد إقفال سنوي",
    icon: CalendarRange,
    permission: "accounting.periods:view",
    tone: "orange",
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
          const t = TONE_STYLES[s.tone];
          return (
            <Can key={s.href} permission={s.permission}>
              <Link
                href={s.href}
                className={`relative bg-primary rounded-xl p-5 shadow-md hover:shadow-xl transition-all border ${t.border} ${t.hoverBorder} hover:-translate-y-0.5 group overflow-hidden`}
              >
                <span
                  aria-hidden
                  className={`pointer-events-none absolute -top-10 -left-10 w-32 h-32 rounded-full ${t.glow} blur-2xl opacity-60 group-hover:opacity-100 transition-opacity`}
                />
                <div className="relative flex items-start justify-between gap-3">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-colors ${t.iconWrap}`}
                  >
                    <Icon size={22} className={t.iconColor} />
                  </div>
                </div>
                <h3
                  className={`relative text-xl font-bold leading-tight inline-flex items-baseline gap-2 font-[family-name:var(--font-amiri)] mt-4 ${t.title}`}
                >
                  <span className={`${t.iconColor} text-lg leading-none select-none`}>
                    ◆
                  </span>
                  {s.title}
                </h3>
                <span
                  aria-hidden
                  className={`relative block h-px w-10 bg-gradient-to-l ${t.rule} to-transparent mt-2 mb-2 group-hover:w-16 transition-all`}
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
