import type { Metadata } from "next";
import { MapPin, Phone, Mail, Globe } from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";

export const metadata: Metadata = {
  title: "من نحن — فندق المفرق",
  description:
    "فندق المفرق — منشأة سياحية مرخّصة في المملكة الأردنية الهاشمية تقدم غرفًا وشققًا فندقية فاخرة في مدينة المفرق.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <PublicLayout activeHref="/about">
      <article className="prose prose-lg max-w-none text-gray-800 leading-relaxed rtl:text-right">
        <h1 className="text-3xl md:text-4xl font-extrabold text-primary mb-4">
          من نحن
        </h1>

        <p>
          <strong>فندق المفرق</strong> (بالإنجليزية: MafHotel) منشأة سياحية
          مرخّصة في المملكة الأردنية الهاشمية، متخصصة في الإقامة الفندقية
          قصيرة ومتوسطة المدى للأفراد والعائلات وضيوف الأعمال. نؤمن بأن الإقامة
          الفندقية ليست مجرد سرير وأربعة جدران — بل تجربة متكاملة من الراحة
          والخصوصية والعناية بالتفاصيل.
        </p>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">رسالتنا</h2>
        <p>
          أن نكون الخيار الأول لكل زائر أو مقيم في محافظة المفرق، من خلال تقديم
          غرف وشقق فندقية نظيفة وحديثة بأسعار عادلة، مع خدمة ضيافة أردنية أصيلة
          على مدار الساعة.
        </p>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">خدماتنا</h2>
        <ul className="list-disc pr-6 space-y-2">
          <li>غرف فندقية مفردة ومزدوجة بمواصفات مختلفة.</li>
          <li>شقق فندقية مجهّزة بالكامل للعائلات والإقامات الطويلة.</li>
          <li>إنترنت عالي السرعة في جميع الغرف والمرافق العامة.</li>
          <li>استقبال على مدار 24 ساعة.</li>
          <li>خدمة تنظيف يومية، وخدمة غرف عند الطلب.</li>
          <li>تواصل مباشر مع الضيوف عبر الهاتف وواتساب لتأكيد الحجز وتقديم
          الدعم.</li>
        </ul>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          معلومات التواصل
        </h2>
        <div className="not-prose grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <div className="flex items-start gap-3 bg-card-bg border border-gold/20 rounded-xl p-4">
            <MapPin className="text-gold-dark shrink-0" size={22} />
            <div>
              <p className="font-semibold text-primary">العنوان</p>
              <p className="text-gray-700 text-sm">
                المفرق — حي الزهور، خلف سكة حديد الحجاز، المملكة الأردنية
                الهاشمية.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-card-bg border border-gold/20 rounded-xl p-4">
            <Phone className="text-gold-dark shrink-0" size={22} />
            <div>
              <p className="font-semibold text-primary">الهاتف / واتساب</p>
              <p className="text-gray-700 text-sm" dir="ltr">
                +962 78 109 9910
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-card-bg border border-gold/20 rounded-xl p-4">
            <Mail className="text-gold-dark shrink-0" size={22} />
            <div>
              <p className="font-semibold text-primary">البريد الإلكتروني</p>
              <p className="text-gray-700 text-sm">info@mafhotel.com</p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-card-bg border border-gold/20 rounded-xl p-4">
            <Globe className="text-gold-dark shrink-0" size={22} />
            <div>
              <p className="font-semibold text-primary">الموقع الإلكتروني</p>
              <p className="text-gray-700 text-sm" dir="ltr">
                https://mafhotel.com
              </p>
            </div>
          </div>
        </div>
      </article>
    </PublicLayout>
  );
}
