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
} from "lucide-react";

const SECTIONS = [
  {
    href: "/accounting/accounts",
    title: "دليل الحسابات",
    desc: "إدارة شجرة الحسابات الأصول، الخصوم، الإيرادات، المصروفات",
    icon: BookOpen,
    color: "bg-blue-100 text-blue-700",
  },
  {
    href: "/accounting/parties",
    title: "الأطراف",
    desc: "الشركاء، الموردون، الموظفون، المُقرضون + كشف حساب",
    icon: Users,
    color: "bg-purple-100 text-purple-700",
  },
  {
    href: "/accounting/journal",
    title: "القيود اليومية",
    desc: "عرض كافة القيود وإنشاء قيد يدوي متعدد السطور",
    icon: BookText,
    color: "bg-green-100 text-green-700",
  },
  {
    href: "/accounting/ledger",
    title: "الأستاذ العام",
    desc: "حركات حساب محدد مع أرصدة جارية",
    icon: Calculator,
    color: "bg-orange-100 text-orange-700",
  },
  {
    href: "/accounting/reports/trial-balance",
    title: "ميزان المراجعة",
    desc: "التحقق من توازن الحسابات بتاريخ معين",
    icon: Scale,
    color: "bg-indigo-100 text-indigo-700",
  },
  {
    href: "/accounting/reports/income-statement",
    title: "قائمة الدخل",
    desc: "الإيرادات والمصروفات وصافي الربح/الخسارة",
    icon: TrendingUp,
    color: "bg-emerald-100 text-emerald-700",
  },
  {
    href: "/accounting/reports/balance-sheet",
    title: "الميزانية العمومية",
    desc: "الأصول = الخصوم + حقوق الملكية",
    icon: Wallet,
    color: "bg-pink-100 text-pink-700",
  },
  {
    href: "/accounting/periods",
    title: "الفترات المالية",
    desc: "فتح/إقفال الفترات وقيد إقفال سنوي",
    icon: CalendarRange,
    color: "bg-red-100 text-red-700",
  },
];

export default function AccountingHomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
          النظام المحاسبي
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          نظام قيد مزدوج كامل مع أطراف متعددة وتقارير مالية احترافية
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="bg-card-bg rounded-xl p-5 shadow-sm hover:shadow-md transition-all border border-transparent hover:border-primary/20 group"
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center ${s.color} mb-3`}
              >
                <Icon size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-800 group-hover:text-primary">
                {s.title}
              </h3>
              <p className="text-sm text-gray-500 mt-1">{s.desc}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
