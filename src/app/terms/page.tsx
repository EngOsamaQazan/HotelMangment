import type { Metadata } from "next";
import { PublicLayout } from "@/components/public/PublicLayout";

export const metadata: Metadata = {
  title: "شروط الاستخدام — فندق المفرق",
  description:
    "شروط وأحكام استخدام موقع فندق المفرق وخدماته، بما في ذلك سياسة الحجز والإلغاء والتواصل عبر واتساب الأعمال.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <PublicLayout activeHref="/terms">
      <article className="prose prose-lg max-w-none text-gray-800 leading-relaxed">
        <h1 className="text-3xl md:text-4xl font-extrabold text-primary mb-2">
          شروط الاستخدام
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          آخر تحديث: {new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
        </p>

        <p>
          باستخدامك لموقع <strong>فندق المفرق</strong> أو خدماته (بما في ذلك
          الحجز والتواصل عبر واتساب) فإنك توافق على الشروط والأحكام التالية.
          يُرجى قراءتها بعناية.
        </p>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          1. تعريفات
        </h2>
        <ul className="list-disc pr-6 space-y-2">
          <li>
            <strong>«الفندق»</strong>: فندق المفرق، مؤسسة سياحية مرخّصة في
            المملكة الأردنية الهاشمية.
          </li>
          <li>
            <strong>«الضيف»</strong>: أي شخص يقوم بحجز أو يستفسر عن خدمات
            الفندق.
          </li>
          <li>
            <strong>«الخدمات»</strong>: الإقامة الفندقية، الاستقبال، خدمة
            الغرف، وأي خدمات أخرى يقدمها الفندق.
          </li>
        </ul>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          2. الحجز والدفع
        </h2>
        <ul className="list-disc pr-6 space-y-2">
          <li>
            يتم تأكيد الحجز بعد تقديم الوثائق الرسمية المطلوبة (الهوية أو جواز
            السفر) ودفع مقدَّم أو تأمين الحجز حسب نوع الوحدة.
          </li>
          <li>
            الأسعار المعلنة تشمل ضريبة المبيعات المعمول بها في الأردن ما لم
            يُذكر غير ذلك.
          </li>
          <li>
            وسائل الدفع المقبولة: كاش، بطاقات ائتمانية، حوالات بنكية، أو
            بوابات الدفع الإلكتروني المدعومة.
          </li>
        </ul>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          3. سياسة الإلغاء
        </h2>
        <ul className="list-disc pr-6 space-y-2">
          <li>الإلغاء قبل 48 ساعة من تاريخ الوصول: استرداد كامل.</li>
          <li>الإلغاء خلال 48 ساعة من الوصول: يُستحق ليلة واحدة.</li>
          <li>
            عدم الحضور بدون إبلاغ مسبق: تُحتسب كامل قيمة الحجز (No‑show).
          </li>
        </ul>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          4. قواعد الإقامة
        </h2>
        <ul className="list-disc pr-6 space-y-2">
          <li>موعد الدخول (Check‑in): الساعة 2:00 ظهرًا.</li>
          <li>موعد المغادرة (Check‑out): الساعة 12:00 ظهرًا.</li>
          <li>التدخين ممنوع داخل الغرف. مخصّصة أماكن خارجية للتدخين.</li>
          <li>
            الفندق غير مسؤول عن أي ممتلكات شخصية يتم تركها في الغرف بعد
            المغادرة، ويرجى استخدام الخزنة المتوفرة.
          </li>
          <li>
            يحق للفندق رفض استقبال أي ضيف أو إنهاء إقامته في حال الإخلال
            بالآداب العامة أو القوانين المحلية.
          </li>
        </ul>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          5. التواصل عبر واتساب
        </h2>
        <p>
          يستخدم الفندق <strong>WhatsApp Business Platform</strong> للتواصل مع
          الضيوف. بإعطائك رقمك وقت الحجز أو بمراسلتنا على رقم الفندق، فإنك
          توافق على:
        </p>
        <ul className="list-disc pr-6 space-y-2">
          <li>استقبال رسائل تأكيد الحجز وتنبيهات الدخول/الخروج.</li>
          <li>استقبال الفواتير وسجلات الإقامة عبر واتساب.</li>
          <li>
            استقبال رسائل خدمة العملاء خلال نافذة 24 ساعة من آخر تواصل.
          </li>
        </ul>
        <p>
          يمكنك إيقاف التواصل عبر واتساب في أي وقت بالرد بـ <em>STOP</em> أو{" "}
          <em>إيقاف</em>. سيستمر الفندق عندها بالتواصل معك عبر الوسائل الأخرى
          (مكالمة هاتفية أو بريد إلكتروني).
        </p>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          6. الملكية الفكرية
        </h2>
        <p>
          جميع محتويات الموقع (الشعار، الصور، النصوص، التصميم) ملك حصري لفندق
          المفرق ولا يجوز نسخها أو إعادة نشرها دون إذن خطي مسبق.
        </p>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          7. تحديد المسؤولية
        </h2>
        <p>
          يبذل الفندق قصارى جهده لضمان دقة المعلومات المنشورة، لكنه لا يتحمّل
          أي مسؤولية عن أخطاء عرضية أو توقف مؤقت في الخدمة الإلكترونية.
          الاستخدام الأقصى هو على مسؤولية الضيف.
        </p>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          8. القانون المُطبَّق
        </h2>
        <p>
          تخضع هذه الشروط لقوانين المملكة الأردنية الهاشمية، وتكون المحاكم
          الأردنية المختصة هي صاحبة الاختصاص في أي نزاع ينشأ عن استخدام الموقع
          أو الخدمات.
        </p>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          9. التواصل
        </h2>
        <p>
          لأي استفسار بخصوص الشروط والأحكام، يرجى التواصل معنا على{" "}
          <a href="mailto:info@mafhotel.com">info@mafhotel.com</a> أو الهاتف:{" "}
          <span dir="ltr">+962 78 109 9910</span>.
        </p>
      </article>
    </PublicLayout>
  );
}
