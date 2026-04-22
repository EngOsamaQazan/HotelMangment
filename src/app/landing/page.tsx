import type { Metadata } from "next";
import Link from "next/link";
import {
  BedDouble,
  ShieldCheck,
  Sparkles,
  Wifi,
  MapPin,
  Phone,
  MessageCircle,
} from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";

export const metadata: Metadata = {
  title: "فندق المفرق — أفخم الغرف والشقق الفندقية في المفرق",
  description:
    "فندق المفرق يقدم أفخم الغرف والشقق الفندقية في مدينة المفرق — حي الزهور. راحة، نظافة، خصوصية، وخدمة متميزة على مدار الساعة.",
  alternates: { canonical: "/landing" },
};

export default function LandingPage() {
  return (
    <PublicLayout activeHref="/landing">
      <section className="text-center py-10 md:py-16 bg-gradient-to-b from-gold-soft/40 to-transparent rounded-2xl">
        <h1 className="text-3xl md:text-5xl font-extrabold text-primary mb-4 leading-tight">
          فندق المفرق
          <span className="block text-gold text-xl md:text-2xl font-semibold mt-2">
            راحة وخصوصية في قلب المفرق
          </span>
        </h1>
        <p className="max-w-2xl mx-auto text-gray-700 text-base md:text-lg leading-relaxed px-4">
          غرف وشقق فندقية فاخرة بمساحات ومواصفات متنوعة تناسب الأفراد والعائلات.
          نهتم بالتفاصيل: النظافة، الهدوء، الراحة، والخدمة على مدار الساعة.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-7 px-4">
          <a
            href="https://wa.me/962781099910"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#25D366] text-white font-semibold hover:opacity-90 transition shadow"
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={20} />
            تواصل عبر واتساب
          </a>
          <a
            href="tel:+962781099910"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark transition shadow"
          >
            <Phone size={20} />
            اتصل بنا
          </a>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10 md:mt-14">
        {[
          {
            icon: BedDouble,
            title: "غرف وشقق فندقية متنوعة",
            body: "خيارات متعددة من غرف مفردة ومزدوجة وشقق عائلية، مؤثثة بالكامل وجاهزة للإقامة.",
          },
          {
            icon: Sparkles,
            title: "نظافة وعناية بالتفاصيل",
            body: "فريق خدمة غرف يومي، أغطية فاخرة، ومنتجات عناية شخصية مختارة بعناية.",
          },
          {
            icon: ShieldCheck,
            title: "أمان وخصوصية",
            body: "بطاقات دخول إلكترونية، دخول منفصل للعائلات، وكاميرات مراقبة للمناطق العامة فقط.",
          },
          {
            icon: Wifi,
            title: "إنترنت عالي السرعة",
            body: "واي فاي مجاني في جميع الغرف والمرافق، مناسب للعمل عن بُعد والترفيه.",
          },
          {
            icon: MapPin,
            title: "موقع مميز",
            body: "في حي الزهور قرب سكة حديد الحجاز، قريب من الأسواق والمرافق الرئيسية في المفرق.",
          },
          {
            icon: Phone,
            title: "استقبال 24/7",
            body: "موظفو استقبال ودودون جاهزون لخدمتك في أي وقت من الليل أو النهار.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="bg-card-bg rounded-xl p-5 shadow-sm border border-gold/20 hover:shadow-md transition"
          >
            <div className="w-11 h-11 rounded-xl bg-gold-soft flex items-center justify-center mb-3">
              <Icon size={22} className="text-gold-dark" />
            </div>
            <h3 className="font-bold text-primary mb-1">{title}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
          </div>
        ))}
      </section>

      <section className="mt-12 md:mt-16 bg-card-bg rounded-2xl p-6 md:p-10 border border-gold/20 shadow-sm">
        <h2 className="text-2xl md:text-3xl font-bold text-primary mb-3">
          احجز إقامتك الآن
        </h2>
        <p className="text-gray-700 leading-relaxed mb-6">
          تواصل معنا مباشرةً عبر الهاتف أو واتساب وسنقترح لك أفضل الغرف المتاحة
          حسب تاريخ وصولك وعدد الضيوف. نؤكد الحجز خلال دقائق.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href="https://wa.me/962781099910?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85%D8%8C%20%D8%A3%D8%B1%D9%8A%D8%AF%20%D8%A7%D9%84%D8%A7%D8%B3%D8%AA%D9%81%D8%B3%D8%A7%D8%B1%20%D8%B9%D9%86%20%D8%AD%D8%AC%D8%B2"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#25D366] text-white font-semibold hover:opacity-90 transition"
          >
            <MessageCircle size={18} />
            واتساب: 0781099910
          </a>
          <a
            href="tel:+962781099910"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark transition"
          >
            <Phone size={18} />
            0781099910
          </a>
          <Link
            href="/about"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-gold/40 text-primary font-semibold hover:bg-gold-soft transition"
          >
            تعرّف علينا أكثر
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
