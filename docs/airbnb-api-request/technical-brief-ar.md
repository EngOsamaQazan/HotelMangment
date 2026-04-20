# مجموعة فندق المفرق — خطة الربط مع Airbnb عبر SiteMinder

**مستند فنّي: تكامل Airbnb من خلال Channel Manager**

التاريخ: نيسان 2026
مالك العقار: أسامة قزان — `osamaqazan89@gmail.com`
حساب Airbnb الحالي: `osamaqazan89@gmail.com` (حالياً Guest فقط — سيُحوَّل إلى Host)
الدولة / المدينة: الأردن — المفرق، حي الزهور
العقار: **فندق المفرق** (غرف فندقية + شقق مخدومة)

---

## 0. لماذا هذا المستند؟

Airbnb **لا تقبل** طلبات API مباشرة من الفنادق الفردية. حسب صفحة الشركاء
الرسمية (`https://www.airbnb.com/partner`):

> "At this time, we are not accepting new access requests for our API."
> (لا نقبل حالياً أي طلبات وصول جديدة لواجهة الـ API.)
>
> "Our global team of partner managers will reach out to prospective partners
> based on the supply opportunity your business represents..."
> (فريق مديري الشركاء العالميين هم من يتواصلون مع الشركاء المحتملين...)

بالتالي السبيل الوحيد لأي فندق واحد كي يحصل على مزامنة فورية للأسعار والتوفر
والحجوزات مع Airbnb هو **الربط عبر شريك Connectivity معتمد / Channel Manager**.

هذا المستند يوثّق المسار الذي اخترناه: **SiteMinder** كـ Channel Manager،
ونظامنا الداخلي يتكامل مع واجهة `pmsXchange` الخاصة بها.

---

## 1. الملخّص التنفيذي

نحن نشغّل **نظام إدارة فنادق داخلي (PMS)** مبنياً خصيصاً لمجموعتنا الفندقية
(3 عقارات: 1 منشور حالياً على Booking.com برقم **14364167**، 2 تحت الإعداد).

سنستخدم **SiteMinder** كـ Channel Manager للأسباب التالية:

- SiteMinder **شريك معتمد رسمياً من Airbnb**
  (المرجع: `https://siteminder.com/channel-manager/airbnb-hotels`).
- SiteMinder يوفّر واجهات برمجية عامة موثّقة (`pmsXchange` لاتصال PMS↔CM،
  و `SiteMinder Exchange / SMX` لاستقبال الحجوزات).
- تكامل واحد يصل إلى **Airbnb + Booking.com + Expedia + Agoda + أكثر من
  420 قناة أخرى** — دون الحاجة لعمل مخصص لكل OTA.

يبقى نظامنا هو **المصدر الوحيد للحقيقة**، وSiteMinder يلعب دور موزّع الأسعار
والتوفّر خارجاً، ومستقبِل الحجوزات داخلاً.

النظام قيد الإنتاج فعلياً على `https://hotel.aqssat.co` ويُستخدم يومياً من
قِبل الاستقبال والخدمة والمحاسبة.

---

## 2. البنية المستهدفة

```
+-------------------+      pmsXchange (REST + SOAP)
|   Fakher PMS      |  <----------------------->  +-----------------+
|  (الكود عندنا)    |                              |   SiteMinder    |
|                   |     SMX Reservations         |   Platform      |
|  مصدر وحيد        |  <-----------------------    |                 |
|    للحقيقة        |                              +-----------------+
+-------------------+                                     | |
                                                          | |
                                +-------------------------+ +--------+
                                |                                    |
                                v                                    v
                        +---------------+                    +---------------+
                        |    Airbnb     |                    | Booking.com,  |
                        |  (عبر CM)     |                    | Expedia, وغيرها|
                        +---------------+                    +---------------+
```

- **الإرسال (ARI)**: PMS → SiteMinder → كل قناة
  - الأسعار، التوفّر، القيود (MinLOS، CTA، CTD، stop-sell).
- **الاستقبال (الحجوزات)**: كل قناة → SiteMinder → PMS
  - حجوزات جديدة، تعديلات، إلغاءات؛ بيانات الضيف والدفع.
- **الربط (Mapping)**: كل `UnitType` في نظامنا → `RoomType` في SiteMinder →
  `Listing` في Airbnb + `RoomType` في Booking + `RoomType` في Expedia.

---

## 3. نظرة على النظام

| الطبقة            | التقنية                                                   |
|------------------|----------------------------------------------------------|
| البيئة            | Next.js 16 (App Router) على Node.js                      |
| اللغة             | TypeScript (وضع strict)                                  |
| قاعدة البيانات    | PostgreSQL مع Prisma ORM 6                               |
| المصادقة          | NextAuth.js (JWT، bcrypt، جاهز لـ 2FA)                   |
| اللحظي            | Socket.IO + Postgres LISTEN/NOTIFY                       |
| الصلاحيات         | RBAC مفصّل مع `requirePermission()`                      |
| النشر             | VPS منطقة واحدة، Nginx reverse proxy، PM2                |
| تخزين الأسرار     | تشفير AES-256-GCM لكل بيانات الطرف الثالث                |

جميع التكاملات الخارجية مُشفَّرة at rest بـ AES-256-GCM عبر مفتاح مستخرج
بـ HKDF من `BOOKING_ENC_KEY` — انظر `src/lib/booking/encryption.ts`. نفس
خزنة الأسرار ستُخزَّن فيها بيانات SiteMinder وروابط الربط مع Airbnb.

---

## 4. توافق نموذج البيانات

الـ schema عندنا يقابل تماماً كائنات `pmsXchange` في SiteMinder:

| المفهوم في PMS (Prisma) | كائن SiteMinder            | ما يقابله في Airbnb      |
|------------------------|----------------------------|--------------------------|
| `UnitType`             | `RoomType`                 | `Listing`                |
| `UnitTypeBed`          | Bed configuration          | ترتيب الأسرة             |
| `Unit`                 | عدد المخزون لكل نوع        | (يدار من SM)             |
| `Rate`                 | `RatePlan`                 | السعر الليلي / Min Stay  |
| `Reservation`          | `Reservation`              | الحجز                    |
| `Guest`                | Guest profile              | الضيف                    |
| `Amenity` / `Photo`    | سمات المحتوى               | المرافق / الصور          |

إعادة تصميم `UnitType` الحالية (راجع `docs/plans/unit-types-redesign.md`)
تطبّع هذه الحقول تماماً كما يتوقّعها SiteMinder: `maxOccupancy`،
`bedroomCount`، `livingRoomCount`، `bathroomCount`، قائمة الأسرة لكل نوع،
قائمة المرافق، معرض الصور، وسجلات `Rate` الموسمية.

**Listing واحد = UnitType واحد** (نوع غرفة فندقية واحد على Airbnb مع عدد
مخزون يساوي عدد الغرف الفعلية من هذا النوع). هذا يطابق نموذج "Hotels /
Boutique Hotel" في Airbnb ويتجنّب كابوس إدارة 20 listing متطابقاً لنفس
نوع الغرفة.

---

## 5. واجهات SiteMinder التي سنستهلكها

مرتّبة حسب أولوية التنفيذ:

1. **pmsXchange — إعداد المحتوى والغرف**
   إنشاء وتحديث أنواع الغرف، المرافق، ترتيب الأسرة، الصور، والأوصاف.
   الرسائل المستهدفة: `OTA_HotelDescriptiveContentNotif`،
   `OTA_HotelRoomList`.

2. **pmsXchange — ARI (التوفّر، الأسعار، المخزون)**
   إرسال التوفّر الليلي، الأسعار الليلية، والقيود.
   الرسائل المستهدفة: `OTA_HotelAvailNotif`،
   `OTA_HotelRateAmountNotif`، `OTA_HotelInvCountNotif`.

3. **SiteMinder Exchange (SMX) — استرجاع الحجوزات**
   استقبال الحجوزات الجديدة والمعدّلة والمُلغاة من كل القنوات المتصلة
   (بما فيها Airbnb). سنستخدم النسخة REST/JSON، ونعود إلى SOAP/XML
   عند الحاجة.

4. **Webhooks / الإشعارات**
   الاشتراك في webhooks الحجوزات ليصلنا الحجز في أقل من 30 ثانية
   بدل الـ polling.

5. **مزامنة المحتوى الثابت**
   مهمة ليلية تطابق أي تفاوت بين PMS و SiteMinder (صور، أوصاف).

لكل مسار سنطبّق:

- **مستهلكون Idempotent** مفهرسون بـ message IDs من SiteMinder.
- **إعادة محاولة بتراجع أسّي** مع dead-letter queue.
- **تسجيل منظّم** بمعرّفات Correlation عبر PMS ↔ SiteMinder ↔ OTA.
- **feature flags لكل قناة** بحيث نقدر نوقف Airbnb لوحدها دون أن نؤثر
  على Booking.com.

---

## 6. الموديولات الجاهزة حالياً

معظم البنية التحتية اللازمة للربط موجودة أصلاً:

- **الحجوزات** — CRUD كاملة مع check-in/out، عربون، رصيد، إلغاء،
  حقل `source` جاهز (`BOOKING`, `AIRBNB`, `DIRECT`, `WALK_IN`).
- **أنواع الغرف، الأسرة، المرافق، الصور** — النموذج المذكور في §4؛
  واجهة رفع الصور واختيار المرافق جاهزة.
- **المواسم والأسعار (`UnitTypePrice`, `Season`)** — تقويم أسعار موسمي
  لكل نوع غرفة، بالضبط ما يتوقّعه SiteMinder ARI.
- **بنية الربط (Booking integration)** — `src/app/api/booking/*`:
  - `credentials/` — خزنة بيانات الطرف الثالث مشفّرة AES-256-GCM.
  - `inbox/` — استقبال webhooks مع التحقق من التوقيع.
  - `jobs/` — طابور مهام للإرسالات الخارجية مع retry وسجل حالة.
  - `property-map/` — ربط أنواع الغرف بمعرّفات الطرف الثالث.
- **التقارير الشهرية** — الإيرادات، نسبة الإشغال، ADR، RevPAR، توزيع القنوات.
- **المهام (Kanban)** — لوحة استثناءات (أخطاء ربط، فروق أسعار، تنبيهات parity).
- **الإشعارات** — جرس لحظي مع عدّاد؛ Postgres triggers → Socket.IO.
- **سجل الصلاحيات** — أكثر من 40 صلاحية تُفرَض على كل route.

**الناقص فقط هو adapters الخاصة بكل قناة.** سنضيف:

- `src/lib/channel-managers/siteminder/` — عميل pmsXchange + عميل SMX.
- قيمة جديدة في `ChannelProvider` اسمها `SITEMINDER` بجانب `BOOKING_COM`.
- موديول جديد `src/app/settings/channel-managers/` — واجهة لحفظ بيانات
  SiteMinder، ربط أنواع الغرف، وعرض سجل الإرسالات.
- تسجيل الصلاحيات حسب `.cursor/skills/add-module-permissions/SKILL.md`.

---

## 7. الأمان والامتثال

- TLS في كل مكان (Let's Encrypt مع تجديد تلقائي).
- الأسرار at rest: AES-256-GCM + HMAC، بدون أي plaintext.
- webhooks واردة يُتحقَّق من توقيعها بـ HMAC (جاهز لـ Booking؛ نعيد استخدامه).
- سجل تدقيق كامل للعمليات الحسّاسة (تعديل الحجوزات، الأسعار، الصلاحيات، الربط).
- GDPR: يمكن إخفاء/تصدير بيانات الضيف عند الطلب.
- Rate limiting على الحافة (`src/lib/rateLimit.ts`).
- جاهزون لتوقيع DPA مع SiteMinder.

---

## 8. خطة الإطلاق

| المرحلة | النطاق                                                           | المدة    |
|---------|------------------------------------------------------------------|---------|
| 0       | فتح حساب SiteMinder وإدراج فندق المفرق عبر onboarding الخاص بهم   | 2 أسبوع  |
| 1       | طلب بيانات مطوّر SiteMinder (sandbox + production)                | 1 أسبوع  |
| 2       | بناء pmsXchange client (محتوى + ARI) وربط UnitTypes → RoomTypes   | 3 أسابيع |
| 3       | بناء SMX client (حجوزات REST/JSON + webhooks) واستقبال الحجوزات   | 2 أسبوع  |
| 4       | اختبار end-to-end في sandbox: دفع ARI والتحقق على Airbnb staging  | 1 أسبوع  |
| 5       | Certification + الإطلاق على العقار 14364167                       | 1 أسبوع  |
| 6       | إدراج العقارين 2 و 3 تحت نفس حساب SiteMinder                      | 2 أسبوع  |
| 7       | لوحات مراقبة + on-call + تنبيهات parity                           | 1 أسبوع  |

**المجموع: حوالي 13 أسبوع** من الالتزام إلى إنتاج كامل عبر 3 عقارات على
Airbnb + Booking + Expedia.

---

## 9. ما نحتاجه بعد — قائمة الإجراءات

### من الجانب التشغيلي

1. **فتح حساب SiteMinder** لمجموعة فندق المفرق.
2. **تحويل حساب Airbnb** (`osamaqazan89@gmail.com`) من Guest إلى Host.
3. **استكمال بروفايل المضيف**: التحقق من الهوية، وسيلة الدفع (Payout)،
   معلومات الضرائب، صورة المضيف، سياسة الإلغاء.
4. **إنشاء listing الفندق يدوياً** على Airbnb بصنف "Boutique Hotel"
   (أو الفئة المتاحة للأردن) مع الصور والأوصاف. هذا شرط مسبق
   لـ SiteMinder قبل الربط.
5. **طلب ربط SiteMinder ↔ Airbnb** من دعم SiteMinder بعد إنشاء الـ
   listing؛ تزويدهم بمعرّفَي الحسابين.

### من الجانب التقني

1. طلب **بيانات مطوّر SiteMinder** (sandbox + production).
2. تخزينها في موديول `booking/credentials` كمزوّد جديد `SITEMINDER`.
3. بناء الـ adapter حسب §6.
4. اجتياز Certification حسب قائمة SiteMinder.
5. تفعيل feature flag للإنتاج.

---

## 10. بدائل جرى النظر فيها

| الخيار                                            | التقييم                        |
|--------------------------------------------------|--------------------------------|
| التقديم مباشرة على Airbnb للحصول على API         | ❌ مغلق للمتقدمين الجدد         |
| استخدام Hostaway (موجّه للشقق)                   | ❌ أقل ملاءمة للفنادق           |
| استخدام Cloudbeds (PMS + CM في واحد)             | ❌ سيحل محل نظامنا              |
| استخدام STAAH (متخصص بالشرق الأوسط)              | ✅ بديل قابل؛ خطة مشابهة        |
| استخدام SiteMinder (الاختيار)                    | ✅ أقوى API وأوسع وصول OTA      |
| إدارة Airbnb يدوياً (بدون API)                   | ⚠️ لا يتوسّع لأكثر من نوع واحد  |

---

## 11. معلومات التواصل

- المالك والراعي الفني: **أسامة قزان**
- البريد: **osamaqazan89@gmail.com**
- رقم العقار على Booking.com: **14364167**
- حساب Airbnb (سيُحوَّل إلى Host): **osamaqazan89@gmail.com**
- رابط النظام: **https://hotel.aqssat.co**
- الموقع: الأردن — المفرق، حي الزهور

مستعدون لمكالمة مع مدير شركاء SiteMinder أو منح وصول تجريبي للقراءة على
نظامنا عند الطلب.
