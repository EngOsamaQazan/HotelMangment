import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  BedDouble,
  ShieldCheck,
  Sparkles,
  Wifi,
  MapPin,
  Phone,
  MessageCircle,
  Utensils,
  Tv,
  Wind,
  Car,
  Coffee,
  DoorOpen,
  ChevronDown,
} from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { RoomGallery, type RoomImage } from "@/components/public/RoomGallery";

export const metadata: Metadata = {
  title: "فندق المفرق — أفخم الغرف والشقق الفندقية في المفرق",
  description:
    "فندق المفرق يقدم أفخم الغرف والشقق الفندقية في مدينة المفرق — حي الزهور. كل غرفة تحتوي مطبخ صغير، تلفاز، تكييف، وإنترنت مجاني. إمكانية دمج غرفتين عبر الباب الجانبي لتكوين شقة عائلية متكاملة.",
  alternates: { canonical: "/landing" },
  openGraph: {
    title: "فندق المفرق",
    description:
      "غرف فندقية فاخرة مع مطبخ صغير داخل الغرفة. إقامة هادئة وخدمة ٢٤/٧ في قلب المفرق.",
    images: ["/rooms/30.jpg"],
    locale: "ar_JO",
    type: "website",
  },
};

/** Curated ordering: we lead with statement rooms, then mix bedrooms,
 *  kitchenettes, and family layouts so the gallery tells a story instead
 *  of feeling like a dump of 35 thumbnails. `span: 2` promotes a few tiles
 *  to hero cells on md+ for visual rhythm. */
const GALLERY: RoomImage[] = [
  { src: "/rooms/30.jpg", caption: "غرفة مزدوجة أنيقة بتفاصيل دافئة", span: 2 },
  { src: "/rooms/01.jpg", caption: "مطبخ صغير مجهّز داخل الغرفة" },
  { src: "/rooms/10.jpg", caption: "غرفة واسعة مع شاشة ومنطقة جلوس" },
  { src: "/rooms/12.jpg", caption: "غرفة عائلية بأربعة أسرّة" },
  { src: "/rooms/02.jpg", caption: "غرفة بتشطيبات خشبية ومرآة توالِت" },
  { src: "/rooms/25.jpg", caption: "ركن مطبخ عملي بخزائن داكنة" },
  { src: "/rooms/05.jpg", caption: "سريران مفردان بملاءات بيضاء" },
  { src: "/rooms/33.jpg", caption: "غرفة ثلاثية بإطلالة على النوافذ", span: 2 },
  { src: "/rooms/15.jpg", caption: "مطبخ متكامل مع كاونتر أبيض" },
  { src: "/rooms/22.jpg", caption: "غرفة بسريرين وشاشة كبيرة" },
  { src: "/rooms/17.jpg", caption: "تفاصيل غرفة النوم مع الإضاءة الجانبية" },
  { src: "/rooms/28.jpg", caption: "غرفة بثلاثة أسرّة بمساحة مريحة" },
  { src: "/rooms/26.jpg", caption: "مطبخ صغير بتجهيزات كاملة" },
  { src: "/rooms/20.jpg", caption: "منطقة نوم واسعة مع تلفاز" },
  { src: "/rooms/35.jpg", caption: "جناح بخزانة ملابس ومنطقة توالِت" },
  { src: "/rooms/14.jpg", caption: "غرفة عائلية من زاوية مختلفة" },
  { src: "/rooms/03.jpg", caption: "سريران مفردان بتنسيق متناظر" },
  { src: "/rooms/08.jpg", caption: "تفاصيل حائط التلفاز" },
  { src: "/rooms/11.jpg", caption: "غرفة بسريرين وستائر خفيفة" },
  { src: "/rooms/23.jpg", caption: "منظر قريب للأسرّة والمفروشات" },
  { src: "/rooms/04.jpg", caption: "غرفة نوم مضيئة بإطلالة خارجية" },
  { src: "/rooms/06.jpg", caption: "غرفة هادئة بألوان محايدة" },
  { src: "/rooms/07.jpg", caption: "مساحة نوم بترتيب فندقي" },
  { src: "/rooms/09.jpg", caption: "تفاصيل الوسائد والمفروشات" },
  { src: "/rooms/13.jpg", caption: "غرفة عائلية بمساحة إضافية" },
  { src: "/rooms/16.jpg", caption: "زاوية جلوس داخل الغرفة" },
  { src: "/rooms/18.jpg", caption: "تفاصيل الحائط والديكور" },
  { src: "/rooms/19.jpg", caption: "غرفة مزدوجة بإطلالة جانبية" },
  { src: "/rooms/21.jpg", caption: "منطقة نوم بترتيب مريح" },
  { src: "/rooms/24.jpg", caption: "تفاصيل الأثاث والمنسوجات" },
  { src: "/rooms/27.jpg", caption: "غرفة بتفاصيل دافئة" },
  { src: "/rooms/29.jpg", caption: "مساحة نوم منظمة" },
  { src: "/rooms/31.jpg", caption: "زاوية غرفة بإضاءة طبيعية" },
  { src: "/rooms/32.jpg", caption: "ديكور غرفة فاخرة" },
  { src: "/rooms/34.jpg", caption: "غرفة مجهّزة لإقامة طويلة" },
];

export default function LandingPage() {
  return (
    <PublicLayout activeHref="/landing" transparentHeader fullBleed>
      {/* ---------- HERO ---------- */}
      <section className="relative h-[92vh] min-h-[560px] w-full overflow-hidden">
        <Image
          src="/rooms/30.jpg"
          alt="غرفة فاخرة في فندق المفرق"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/45 to-[#0E3B33]/90" />

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="max-w-3xl text-center px-4 sm:px-6">
            <p className="text-gold tracking-[0.3em] text-xs md:text-sm mb-4">
              MAFRAQ · HOTEL
            </p>
            <h1 className="text-white font-extrabold text-4xl sm:text-5xl md:text-7xl leading-tight mb-4 drop-shadow-lg">
              فندق المفرق
            </h1>
            <div className="flex items-center justify-center gap-3 mb-6">
              <span className="h-px w-10 md:w-16 bg-gold/80" />
              <span className="text-gold text-base md:text-lg font-semibold">
                راحة وخصوصية في قلب المفرق
              </span>
              <span className="h-px w-10 md:w-16 bg-gold/80" />
            </div>
            <p className="text-white/90 text-base md:text-xl leading-relaxed max-w-2xl mx-auto mb-8">
              غرف فندقية مؤثثة بالكامل، كل غرفة فيها مطبخ صغير، تلفاز، تكييف،
              وإنترنت مجاني. وعند الحاجة تُدمج غرفتان عبر الباب الجانبي لتكوين
              شقة عائلية متكاملة.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="https://wa.me/962781099910?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85%D8%8C%20%D8%A3%D8%B1%D9%8A%D8%AF%20%D8%A7%D9%84%D8%A7%D8%B3%D8%AA%D9%81%D8%B3%D8%A7%D8%B1%20%D8%B9%D9%86%20%D8%AD%D8%AC%D8%B2"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#25D366] text-white font-semibold hover:opacity-90 transition shadow-lg"
              >
                <MessageCircle size={20} />
                احجز الآن عبر واتساب
              </a>
              <a
                href="tel:+962781099910"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gold text-primary font-semibold hover:bg-gold-dark transition shadow-lg"
              >
                <Phone size={20} />
                ٠٧٨١٠٩٩٩١٠
              </a>
            </div>
          </div>
        </div>

        <a
          href="#features"
          className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 hover:text-gold transition animate-bounce"
          aria-label="اعرف المزيد"
        >
          <ChevronDown size={32} />
        </a>
      </section>

      {/* ---------- STATS STRIP ---------- */}
      <section className="bg-primary text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {[
            { n: "٣٥+", l: "غرفة فندقية" },
            { n: "٢٤/٧", l: "استقبال مستمر" },
            { n: "١٠٠٪", l: "تكييف وتدفئة" },
            { n: "مجاناً", l: "إنترنت عالي السرعة" },
          ].map((s) => (
            <div key={s.l}>
              <div className="text-gold text-2xl md:text-4xl font-extrabold">
                {s.n}
              </div>
              <div className="text-white/80 text-xs md:text-sm mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- FEATURES ---------- */}
      <section
        id="features"
        className="py-14 md:py-20 px-4 sm:px-6 max-w-6xl mx-auto"
      >
        <div className="text-center mb-10 md:mb-14">
          <p className="text-gold font-semibold tracking-wider text-sm mb-2">
            لماذا فندق المفرق
          </p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-primary">
            تفاصيل تصنع الفرق في إقامتك
          </h2>
          <div className="mx-auto mt-3 h-1 w-20 bg-gold rounded-full" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              icon: BedDouble,
              title: "غرف فندقية متنوعة",
              body: "مفردة، مزدوجة، ثلاثية وعائلية، مؤثثة بذوق رفيع وجاهزة للإقامة الفورية.",
            },
            {
              icon: Utensils,
              title: "مطبخ صغير داخل كل غرفة",
              body: "كاونتر، خزائن، ثلاجة، وتجهيزات أساسية — تحضّر قهوتك ووجباتك الخفيفة بخصوصية.",
            },
            {
              icon: Sparkles,
              title: "نظافة يومية",
              body: "فريق خدمة غرف، أغطية فاخرة، ومنتجات عناية شخصية في كل غرفة.",
            },
            {
              icon: ShieldCheck,
              title: "أمان وخصوصية",
              body: "بطاقات دخول إلكترونية، مدخل منفصل للعائلات، وكاميرات للمناطق العامة فقط.",
            },
            {
              icon: Wifi,
              title: "إنترنت عالي السرعة",
              body: "واي فاي مجاني في الغرف والمرافق — مناسب للعمل عن بُعد والترفيه.",
            },
            {
              icon: MapPin,
              title: "موقع استراتيجي",
              body: "حي الزهور قرب سكة حديد الحجاز، بالقرب من الأسواق والمرافق الرئيسية.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group bg-white rounded-2xl p-6 shadow-sm border border-gold/20 hover:shadow-lg hover:border-gold/50 transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-gold-soft flex items-center justify-center mb-4 group-hover:bg-gold group-hover:scale-110 transition-all">
                <Icon
                  size={24}
                  className="text-gold-dark group-hover:text-white transition-colors"
                />
              </div>
              <h3 className="font-bold text-primary text-lg mb-2">{title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- CONVERTIBLE ROOMS CALLOUT ---------- */}
      <section className="bg-gradient-to-br from-primary via-primary-dark to-primary text-white py-14 md:py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 items-center">
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-gold/30 order-2 md:order-1">
            <Image
              src="/rooms/12.jpg"
              alt="غرفة عائلية يمكن تكوينها بدمج غرفتين"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
          <div className="order-1 md:order-2">
            <div className="inline-flex items-center gap-2 bg-gold/20 text-gold border border-gold/40 rounded-full px-4 py-1.5 text-xs md:text-sm font-semibold mb-4">
              <DoorOpen size={16} />
              ميزة حصرية
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold mb-4 leading-tight">
              غرفة اليوم —
              <br />
              <span className="text-gold">شقة عائلية غداً</span>
            </h2>
            <p className="text-white/85 text-base md:text-lg leading-relaxed mb-4">
              معظم غرفنا مصممة بأبواب جانبية تسمح بدمج غرفتين متجاورتين لتكوين
              شقة فندقية كاملة للعائلات الكبيرة أو المجموعات — مع الحفاظ على
              إمكانية فصلها متى شئت.
            </p>
            <ul className="space-y-2 text-white/90 text-sm md:text-base mb-6">
              <li className="flex items-start gap-2">
                <span className="text-gold mt-0.5">✓</span> غرفتا نوم مستقلتان
                بحماميْن منفصليْن.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gold mt-0.5">✓</span> مطبخ داخلي في كل
                غرفة — تطبخ العائلة بكل راحة.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gold mt-0.5">✓</span> مرونة كاملة: احجز
                غرفة واحدة، أو اطلب الدمج وقت الحجز.
              </li>
            </ul>
            <a
              href="https://wa.me/962781099910?text=%D8%A3%D8%B1%D9%8A%D8%AF%20%D8%A7%D9%84%D8%A7%D8%B3%D8%AA%D9%81%D8%B3%D8%A7%D8%B1%20%D8%B9%D9%86%20%D8%AF%D9%85%D8%AC%20%D8%BA%D8%B1%D9%81%D8%AA%D9%8A%D9%86"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-gold text-primary font-semibold hover:bg-gold-light transition"
            >
              <MessageCircle size={18} />
              استفسر عن الدمج
            </a>
          </div>
        </div>
      </section>

      {/* ---------- GALLERY ---------- */}
      <section className="py-14 md:py-20 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="text-center mb-10 md:mb-14">
          <p className="text-gold font-semibold tracking-wider text-sm mb-2">
            معرض الغرف
          </p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-primary">
            جولة داخل غرفنا
          </h2>
          <div className="mx-auto mt-3 h-1 w-20 bg-gold rounded-full" />
          <p className="text-gray-600 mt-4 max-w-2xl mx-auto text-sm md:text-base">
            اضغط على أي صورة لعرضها بالحجم الكامل وتصفّح كامل المعرض.
          </p>
        </div>

        <RoomGallery images={GALLERY} />
      </section>

      {/* ---------- IN-ROOM AMENITIES ---------- */}
      <section className="bg-gold-soft/40 py-14 md:py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-gold-dark font-semibold tracking-wider text-sm mb-2">
              وسائل راحة في كل غرفة
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-primary">
              كل ما تحتاجه خلال إقامتك
            </h2>
            <div className="mx-auto mt-3 h-1 w-20 bg-gold rounded-full" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Utensils, label: "مطبخ صغير مجهّز" },
              { icon: Tv, label: "تلفاز بشاشة مسطحة" },
              { icon: Wind, label: "تكييف وتدفئة" },
              { icon: Wifi, label: "إنترنت مجاني" },
              { icon: Coffee, label: "غلاية وأدوات قهوة" },
              { icon: ShieldCheck, label: "قفل إلكتروني" },
              { icon: BedDouble, label: "أغطية فاخرة" },
              { icon: Car, label: "مواقف خاصة" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="bg-white rounded-xl p-5 text-center border border-gold/20 hover:border-gold hover:shadow-md transition"
              >
                <Icon size={28} className="mx-auto text-gold-dark mb-2" />
                <div className="text-sm md:text-base font-semibold text-primary">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="relative py-16 md:py-24 px-4 sm:px-6 overflow-hidden">
        <Image
          src="/rooms/02.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          aria-hidden
        />
        <div className="absolute inset-0 bg-primary/92" />
        <div className="relative max-w-3xl mx-auto text-center text-white">
          <h2 className="text-3xl md:text-5xl font-extrabold mb-4">
            جاهز تحجز إقامتك؟
          </h2>
          <p className="text-white/85 text-base md:text-lg leading-relaxed mb-8">
            تواصل معنا مباشرةً عبر واتساب أو الهاتف، ونقترح لك أفضل الغرف
            المتاحة حسب تاريخ وصولك وعدد ضيوفك. نؤكد الحجز خلال دقائق.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="https://wa.me/962781099910?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85%D8%8C%20%D8%A3%D8%B1%D9%8A%D8%AF%20%D8%A7%D9%84%D8%A7%D8%B3%D8%AA%D9%81%D8%B3%D8%A7%D8%B1%20%D8%B9%D9%86%20%D8%AD%D8%AC%D8%B2"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#25D366] text-white font-semibold hover:opacity-90 transition shadow-lg"
            >
              <MessageCircle size={20} />
              واتساب: ٠٧٨١٠٩٩٩١٠
            </a>
            <a
              href="tel:+962781099910"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gold text-primary font-semibold hover:bg-gold-light transition shadow-lg"
            >
              <Phone size={20} />
              اتصل الآن
            </a>
            <Link
              href="/about"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/40 text-white font-semibold hover:bg-white/10 transition"
            >
              تعرّف علينا أكثر
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
