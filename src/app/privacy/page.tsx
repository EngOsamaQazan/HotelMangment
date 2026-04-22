import type { Metadata } from "next";
import { PublicLayout } from "@/components/public/PublicLayout";

export const metadata: Metadata = {
  title: "سياسة الخصوصية — فندق المفرق",
  description:
    "سياسة الخصوصية لفندق المفرق تشرح كيف نجمع بياناتك الشخصية وكيف نستخدمها ونحميها، بما في ذلك استخدام WhatsApp Business للتواصل.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <PublicLayout activeHref="/privacy">
      <article className="prose prose-lg max-w-none text-gray-800 leading-relaxed">
        <h1 className="text-3xl md:text-4xl font-extrabold text-primary mb-2">
          سياسة الخصوصية
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          آخر تحديث: {new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
        </p>

        <p>
          يلتزم <strong>فندق المفرق</strong> («نحن»، «الفندق») بحماية خصوصية
          ضيوفه وزوار موقعه الإلكتروني. توضح هذه السياسة نوع المعلومات التي
          نجمعها، وكيف نستخدمها ونحميها، وحقوقك تجاه بياناتك الشخصية.
        </p>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          1. البيانات التي نجمعها
        </h2>
        <ul className="list-disc pr-6 space-y-2">
          <li>
            <strong>بيانات الحجز:</strong> الاسم الكامل، رقم الهاتف، رقم الهوية
            أو جواز السفر، تاريخ الوصول والمغادرة، نوع الغرفة، تفاصيل الدفع.
          </li>
          <li>
            <strong>بيانات التواصل:</strong> رقم الواتساب والبريد الإلكتروني
            وتفاصيل المحادثات التي تجريها معنا لأغراض خدمة العملاء وتأكيد
            الحجوزات.
          </li>
          <li>
            <strong>بيانات الموقع الإلكتروني:</strong> سجل الدخول، عنوان IP،
            نوع المتصفح، الصفحات التي تزورها — تُستخدم لأغراض أمنية وإحصائية
            فقط.
          </li>
        </ul>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          2. كيف نستخدم بياناتك
        </h2>
        <ul className="list-disc pr-6 space-y-2">
          <li>تأكيد الحجوزات وإدارة الإقامة (الدخول، المغادرة، الفواتير).</li>
          <li>
            التواصل معك عبر واتساب الأعمال (WhatsApp Business) لإرسال تأكيدات
            الحجز، تنبيهات الدخول/الخروج، الفواتير، الرد على استفساراتك، وطلبات
            التقييم.
          </li>
          <li>
            الالتزام بالمتطلبات القانونية والتنظيمية في المملكة الأردنية
            الهاشمية (سجلات الضيوف والضرائب).
          </li>
          <li>تحسين جودة الخدمة وتجربة الضيوف.</li>
        </ul>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          3. واتساب الأعمال (WhatsApp Business)
        </h2>
        <p>
          نستخدم <strong>WhatsApp Business Platform</strong> التابعة لشركة Meta
          للتواصل مع ضيوفنا. عند التواصل معنا عبر واتساب، فإن المحادثة تخضع
          أيضًا لسياسة خصوصية Meta وسياسة WhatsApp. نحن نستخدم واتساب فقط
          للأغراض التالية:
        </p>
        <ul className="list-disc pr-6 space-y-2">
          <li>الرد على استفساراتك عن الحجوزات والخدمات.</li>
          <li>
            إرسال رسائل خدمة العملاء خلال نافذة 24 ساعة بعد تواصلك معنا.
          </li>
          <li>
            إرسال قوالب معتمدة مسبقًا من Meta (تأكيد حجز، تذكير بالدخول،
            فواتير، رموز تحقق OTP) لا تحمل محتوى ترويجيًا ما لم تعطِ موافقتك
            الصريحة.
          </li>
        </ul>
        <p>
          لن نقوم أبدًا ببيع رقم هاتفك أو مشاركته مع أطراف ثالثة لأغراض تسويقية
          دون إذنك الصريح. يمكنك طلب إيقاف التواصل عبر واتساب في أي وقت
          بالرد برسالة <em>STOP</em> أو <em>إيقاف</em>.
        </p>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          4. مشاركة البيانات
        </h2>
        <p>
          لا نشارك بياناتك الشخصية مع أي طرف ثالث إلا في الحالات التالية:
        </p>
        <ul className="list-disc pr-6 space-y-2">
          <li>الجهات الحكومية المختصة عند طلبها رسميًا.</li>
          <li>
            مزودو الخدمة التقنية الذين نتعامل معهم (Meta Platforms لخدمة
            WhatsApp، مزودو الاستضافة، بوابات الدفع) وفق اتفاقيات سرية صارمة.
          </li>
          <li>عند موافقتك الصريحة على المشاركة.</li>
        </ul>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          5. الاحتفاظ بالبيانات وحمايتها
        </h2>
        <p>
          نحتفظ ببيانات الحجوزات وسجلات المحادثات للمدة التي يتطلبها القانون
          المحلي (عادة 5 سنوات للسجلات المحاسبية)، وتُخزَّن في خوادم محمية
          بتقنيات التشفير. الأسرار الحساسة (مثل رموز واجهات برمجة التطبيقات)
          مُشفّرة بالكامل (AES‑256‑GCM) داخل قاعدة البيانات.
        </p>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          6. حقوقك
        </h2>
        <ul className="list-disc pr-6 space-y-2">
          <li>الحق في الاطلاع على بياناتك التي لدينا.</li>
          <li>الحق في طلب تصحيح أي بيانات غير دقيقة.</li>
          <li>
            الحق في طلب حذف بياناتك (ما لم نكن مُلزَمين قانونيًا بالاحتفاظ بها).
          </li>
          <li>الحق في الاعتراض على استخدام بياناتك لأغراض التسويق.</li>
        </ul>
        <p>
          لممارسة أيٍّ من هذه الحقوق، يُرجى التواصل معنا على{" "}
          <a href="mailto:info@mafhotel.com">info@mafhotel.com</a> أو عبر
          الهاتف: +962 78 109 9910.
        </p>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          7. التعديلات على هذه السياسة
        </h2>
        <p>
          قد نقوم بتحديث سياسة الخصوصية من وقت لآخر. ستُنشر النسخة المحدَّثة
          على هذه الصفحة مع تاريخ التحديث. استمرار استخدامك لخدماتنا بعد
          التحديث يُعدّ قبولًا للنسخة الجديدة.
        </p>

        <h2 className="text-2xl font-bold text-primary mt-8 mb-3">
          8. التواصل
        </h2>
        <p>
          فندق المفرق — المفرق، حي الزهور، خلف سكة حديد الحجاز، الأردن.
          <br />
          البريد الإلكتروني: info@mafhotel.com
          <br />
          الهاتف/واتساب:{" "}
          <span dir="ltr">+962 78 109 9910</span>
        </p>
      </article>
    </PublicLayout>
  );
}
