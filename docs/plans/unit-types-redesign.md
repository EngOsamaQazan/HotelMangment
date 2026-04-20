# خطة: إعادة تصميم الوحدات والغرف (Unit Types Redesign)

> **الحالة:** مسودّة بانتظار الموافقة  
> **التاريخ:** 2026-04-20  
> **النطاق:** تطوير نموذج بيانات الغرف والشقق + تمهيد للربط مع Booking.com

---

## 1. الهدف

توسيع تعريف الغرف والشقق بحيث:
- كل وحدة تُظهر تفاصيل الأسرّة (عدد ونوع) والسعة.
- الشقق متعدّدة الغرف تُوصف بشكل صحيح (غرف نوم + صالة).
- البنية متوافقة مع نموذج Booking.com / Channel Managers.
- دعم حالات خاصة: أسرّة مفردة قابلة للدمج، جلسة عربية أرضية.

---

## 2. الوضع الحالي (المشكلة)

جدول `Unit` في `prisma/schema.prisma` بسيط جدًا:

```prisma
model Unit {
  id          Int    @id @default(autoincrement())
  unitNumber  String @unique
  unitType    String                     // نص حر فقط!
  status      String @default("available")
  floor       Int    @default(1)
  description String?
}
```

- `unitType` حقل نصّي حر بلا هيكل.
- لا توجد معلومة عن الأسرّة أو عددها أو نوعها.
- الشقق متعدّدة الغرف لا تُمثَّل بشكل صحيح.
- التسعير الموسمي فيه حقلان فقط (`room_*` و `apt_*`) وهذا قاصر.
- لا يوجد أي ربط قابل للتوسّع مع Booking.com.

---

## 3. المخزون الفعلي للفندق

### الشقق (الدور الأرضي)

| الرقم | الوصف | التفاصيل المنطقية |
|---|---|---|
| 01 | ثنائي مجوز | 1 غرفة نوم — سرير مزدوج (Queen) |
| 02 | ثنائي مجوز | 1 غرفة نوم — سرير مزدوج (Queen) |
| 03 | ثنائي مجوز | 1 غرفة نوم — سرير مزدوج (Queen) |
| 04 | غرفتين + صالة (مجوز + ثلاثي مفرد) | غ1: Queen · غ2: 3 أسرّة مفردة · صالة بجلسة عربية أرضية |
| 05 | ثنائي مفارد | غرفة نوم: سريران مفردان (قابلة للدمج) + جلسة عربية أرضية |
| 06 | غرفتين + صالة (مجوز + ثنائي مفرد) | غ1: Queen · غ2: سريران مفردان · صالة بجلسة عربية أرضية |

### الغرف الفندقية (الأدوار العلوية)

| الرقم | الوصف | التفاصيل المنطقية |
|---|---|---|
| 101 | جناح فندقي (Suite) | غرفة نوم بسرير Queen + صالة جلوس (غير مخصصة للنوم) |
| 102, 103 | ثنائي مفرد | سريران مفردان قابلان للدمج → King |
| 104, 106, 107 | ثلاثي مفرد | 3 أسرّة مفردة (2 يدمجان إلى King + 1 مفرد) |
| 105, 108 | غرفة مزدوجة كينج | سرير King |
| 109 | رباعي مفرد | 4 أسرّة مفردة (قابلة للدمج → 2 King) |

**ملاحظة:** جميع الأسرّة المفردة في الغرف الفندقية قابلة للدمج لسرير مزدوج.

---

## 4. الأنواع الثمانية (Unit Types)

| الكود | الاسم العربي | الفئة | الوحدات | السعة |
|---|---|---|---|---|
| `APT-1BR-DBL` | شقة غرفة نوم — سرير مزدوج | apartment | 01, 02, 03 | 2 بالغ |
| `APT-1BR-TWIN` | شقة غرفة نوم — سريران مفردان | apartment | 05 | 2 بالغ (+1 على الجلسة) |
| `APT-2BR-MIX-A` | شقة غرفتين وصالة (مجوز + ثلاثي مفرد) | apartment | 04 | 5 بالغين (+1 على الجلسة) |
| `APT-2BR-MIX-B` | شقة غرفتين وصالة (مجوز + ثنائي مفرد) | apartment | 06 | 4 بالغين (+1 على الجلسة) |
| `HTL-SUITE` | جناح فندقي | suite | 101 | 2 بالغ |
| `HTL-KING` | غرفة مزدوجة كينج | hotel_room | 105, 108 | 2 بالغ |
| `HTL-TWIN` | غرفة ثنائية مفردة | hotel_room | 102, 103 | 2 بالغ |
| `HTL-TRIPLE` | غرفة ثلاثية مفردة | hotel_room | 104, 106, 107 | 3 بالغين |
| `HTL-QUAD` | غرفة رباعية مفردة | hotel_room | 109 | 4 بالغين |

---

## 5. التصميم المقترح (Prisma Schema)

### 5.1 الجداول الجديدة

```prisma
model UnitType {
  id              Int      @id @default(autoincrement())
  code            String   @unique
  nameAr          String   @map("name_ar")
  nameEn          String   @map("name_en")
  category        String                                 // apartment | hotel_room | suite | studio
  descriptionAr   String?  @map("description_ar")
  descriptionEn   String?  @map("description_en")

  maxAdults       Int      @default(2) @map("max_adults")
  maxChildren     Int      @default(0) @map("max_children")
  maxOccupancy    Int      @map("max_occupancy")

  sizeSqm         Float?   @map("size_sqm")
  hasKitchen      Boolean  @default(false) @map("has_kitchen")
  hasBalcony      Boolean  @default(false) @map("has_balcony")
  smokingAllowed  Boolean  @default(false) @map("smoking_allowed")
  view            String?

  bookingRoomId   String?  @unique @map("booking_room_id")
  channelSync     Boolean  @default(false) @map("channel_sync")

  isActive        Boolean  @default(true) @map("is_active")
  sortOrder       Int      @default(0) @map("sort_order")
  createdAt       DateTime @default(now()) @map("created_at")

  rooms           UnitTypeRoom[]
  amenities       UnitTypeAmenity[]
  photos          UnitTypePhoto[]
  units           Unit[]

  @@index([category])
  @@map("unit_types")
}

model UnitTypeRoom {
  id           Int      @id @default(autoincrement())
  unitTypeId   Int      @map("unit_type_id")
  nameAr       String   @map("name_ar")
  nameEn       String   @map("name_en")
  kind         String                                   // bedroom | living_room | studio | bathroom
  position     Int      @default(0)

  unitType     UnitType @relation(fields: [unitTypeId], references: [id], onDelete: Cascade)
  beds         UnitTypeBed[]

  @@index([unitTypeId, position])
  @@map("unit_type_rooms")
}

model UnitTypeBed {
  id             Int      @id @default(autoincrement())
  roomId         Int      @map("room_id")
  bedType        String   @map("bed_type")              // single | double | queen | king | sofa_bed | bunk_bed | crib | arabic_floor_seating
  count          Int      @default(1)
  combinable     Boolean  @default(false)
  combinesToType String?  @map("combines_to_type")
  sleepsExtra    Boolean  @default(false) @map("sleeps_extra")   // طاقة نوم إضافية اختيارية
  notes          String?

  room           UnitTypeRoom @relation(fields: [roomId], references: [id], onDelete: Cascade)

  @@index([roomId])
  @@map("unit_type_beds")
}

model Amenity {
  id       Int    @id @default(autoincrement())
  code     String @unique
  nameAr   String @map("name_ar")
  nameEn   String @map("name_en")
  icon     String?
  category String @default("general")

  unitTypes UnitTypeAmenity[]

  @@map("amenities")
}

model UnitTypeAmenity {
  unitTypeId Int @map("unit_type_id")
  amenityId  Int @map("amenity_id")

  unitType UnitType @relation(fields: [unitTypeId], references: [id], onDelete: Cascade)
  amenity  Amenity  @relation(fields: [amenityId],  references: [id], onDelete: Cascade)

  @@id([unitTypeId, amenityId])
  @@map("unit_type_amenities")
}

model UnitTypePhoto {
  id         Int      @id @default(autoincrement())
  unitTypeId Int      @map("unit_type_id")
  url        String
  captionAr  String?  @map("caption_ar")
  captionEn  String?  @map("caption_en")
  isPrimary  Boolean  @default(false) @map("is_primary")
  sortOrder  Int      @default(0) @map("sort_order")

  unitType   UnitType @relation(fields: [unitTypeId], references: [id], onDelete: Cascade)

  @@index([unitTypeId, sortOrder])
  @@map("unit_type_photos")
}
```

### 5.2 تعديل جدول `Unit`

```prisma
model Unit {
  id              Int     @id @default(autoincrement())
  unitNumber      String  @unique @map("unit_number")
  unitTypeId      Int     @map("unit_type_id")
  floor           Int     @default(1)
  status          String  @default("available")
  notes           String?
  bedSetup        String  @default("default") @map("bed_setup")   // default | combined | separated
  bookingRoomCode String? @map("booking_room_code")

  unitType        UnitType      @relation(fields: [unitTypeId], references: [id])
  reservations    Reservation[]
  maintenance     Maintenance[]

  @@index([unitTypeId])
  @@index([status])
  @@map("units")
}
```

### 5.3 قاموس أنواع الأسرّة (متوافق مع Booking.com)

```
single                 | سرير مفرد
double                 | سرير مزدوج عادي
queen                  | سرير كوين
king                   | سرير كينج
sofa_bed               | كنبة سرير
bunk_bed               | سرير بطابقين
crib                   | سرير أطفال
arabic_floor_seating   | جلسة عربية أرضية (خاصة بالنظام)
```

---

## 6. مراحل التنفيذ

### المرحلة 1 — قاعدة البيانات
**المخرجات:**
- تعديل `prisma/schema.prisma` (إضافة 6 جداول + تعديل `Unit`).
- `prisma/seed-unit-types.ts` (جديد) يُنشئ:
  - 8 أنواع (`UnitType`).
  - 13 `Unit` مرتبطة بأنواعها الصحيحة.
  - قاموس مرافق أساسي (wifi, ac, tv, fridge, kitchen, balcony, safe, minibar, hairdryer, iron, heater, washer, kettle, coffee, wardrobe).
- دمج استدعاء `seedUnitTypes()` داخل `prisma/seed.ts` بعد قسم Users وقبل قسم Units القديم.
- تحديث قسم Units في `prisma/seed.ts` ليستخدم الأنواع الجديدة بدل النص الحر.

**استراتيجية Migration آمنة (DB موجودة + حجوزات فعلية):**
1. تعديل `schema.prisma`: إضافة الجداول الجديدة + إضافة `unitTypeId` على `Unit` كـ `Int?` (nullable) و`bedSetup` و`notes` و`bookingRoomCode`.
2. تشغيل `npx prisma db push` (حسب نمط المشروع — يستخدم `db:push` لا `migrate`).
3. تشغيل سكربت `prisma/scripts/backfill-unit-types.ts` (جديد) يقوم بـ:
   - إنشاء الأنواع الثمانية + غرفها + أسرّتها.
   - ربط الوحدات الموجودة بالنوع المناسب حسب `unitNumber` (خريطة ثابتة).
4. بعد التأكد: تعديل `schema.prisma` ليصبح `unitTypeId` NOT NULL + `unitType` النصّي القديم يصبح `@deprecated` (يُحتفظ به مؤقتًا لعدم كسر `/api/units?type=...`).
5. تحديث `src/app/api/units/route.ts` ليفلتر عبر `unitType.category` بدل الحقل النصّي.
6. إزالة الحقل النصّي لاحقًا في المرحلة 3 بعد تحديث الـ UI.

**الملفات المتأثرة بالضبط:**

| الملف | العملية |
|---|---|
| [prisma/schema.prisma](prisma/schema.prisma) | تعديل: إضافة الجداول الجديدة + تعديل `Unit` |
| `prisma/seed-unit-types.ts` | ملف جديد |
| `prisma/scripts/backfill-unit-types.ts` | ملف جديد |
| [prisma/seed.ts](prisma/seed.ts) | تعديل: استدعاء seedUnitTypes + تحديث قسم الوحدات |
| [package.json](package.json) | إضافة سكربتَي `db:seed-unit-types` و `db:backfill-units` |
| [src/app/api/units/route.ts](src/app/api/units/route.ts) | تعديل: الفلترة عبر `unitType.category` |

**معايير القبول:**
- `npx prisma db push` ينجح بدون أخطاء.
- `npm run db:seed-unit-types` ينشئ الأنواع الثمانية وغرفها وأسرّتها.
- `npm run db:backfill-units` يربط الـ 13 وحدة بالأنواع الصحيحة.
- `npm run check:permissions` ينجح (بعد تسجيل `settings.unit_types`).
- جميع الحجوزات القائمة تظل تعمل بلا خطأ.
- `GET /api/units` يُرجع الوحدات مع `unitType` مرفق.

---

### المرحلة 2 — CRUD لإدارة أنواع الوحدات

**الصلاحيات الجديدة** (تُسجَّل في `src/lib/permissions/registry.ts` حسب `add-module-permissions` skill):

Resource key: `settings.unit_types` (category: `admin`).

- `settings.unit_types:view`
- `settings.unit_types:create`
- `settings.unit_types:edit`
- `settings.unit_types:delete`

**توزيع الصلاحيات الافتراضي على الأدوار:**
- `admin`: كل الصلاحيات (تلقائي عبر `*`).
- `receptionist`: `settings.unit_types:view` فقط (لرؤية تفاصيل الأسرّة وقت الحجز).
- `accountant`: `settings.unit_types:view` فقط.
- `viewer`: `settings.unit_types:view` فقط.

**API Routes:**
| Route | الوصف |
|---|---|
| `GET /api/unit-types` | قائمة + ملخص الأسرّة |
| `POST /api/unit-types` | إنشاء (nested rooms/beds) |
| `GET /api/unit-types/[id]` | تفاصيل كاملة |
| `PATCH /api/unit-types/[id]` | تحديث |
| `DELETE /api/unit-types/[id]` | حذف (لا وحدات مرتبطة) |
| `POST /api/unit-types/[id]/photos` | رفع صورة |
| `DELETE /api/unit-types/[id]/photos/[photoId]` | حذف صورة |
| `GET /api/amenities` | قاموس المرافق |

**الصفحات:**
- `src/app/settings/unit-types/page.tsx`
- `src/app/settings/unit-types/new/page.tsx`
- `src/app/settings/unit-types/[id]/page.tsx`

**المكوّنات:**
- `UnitTypeForm.tsx` — نموذج بتبويبات.
- `BedConfigurator.tsx` — محرّر بصري للغرف والأسرّة.
- `BedIcon.tsx` — أيقونة لكل نوع سرير.
- `AmenitiesPicker.tsx`.
- `PhotoUploader.tsx`.

---

### المرحلة 3 — ربط الوحدات الفعلية بالأنواع

- استبدال حقل `unitType` النصّي بـ Dropdown يختار `UnitType`.
- عرض ملخص الأسرّة والسعة في قائمة الوحدات.
- زر سريع "تغيير ترتيب الأسرّة" (`combined` ⇄ `separated`).
- حقل ملاحظات على الوحدة (مستقل عن وصف النوع).

---

### المرحلة 4 — تحديث شاشة الحجوزات

- عرض معلومات الأسرّة والسعة عند اختيار الوحدة.
- تحذير لو `numGuests > maxOccupancy`.
- اقتراح `bedSetup` تلقائي حسب عدد الضيوف.
- حقل `bedSetupRequested` على `Reservation` لتذكير التنظيف.
- تقرير Check-in اليومي يعرض ترتيب الأسرّة.

---

### المرحلة 5 — نقل التسعير إلى مستوى UnitType

**السكيمة:**
```prisma
model UnitTypePrice {
  id         Int   @id @default(autoincrement())
  unitTypeId Int   @map("unit_type_id")
  seasonId   Int   @map("season_id")
  daily      Float
  weekly     Float
  monthly    Float

  @@unique([unitTypeId, seasonId])
  @@map("unit_type_prices")
}
```

- تحويل `SeasonalPrice` إلى `Season` (اسم + تواريخ).
- Migration يوزّع الأسعار القديمة: `room_*` → hotel_room/suite، `apt_*` → apartment.
- شاشة الأسعار: جدول بأعمدة الأنواع وصفوف المواسم.
- تحديث دالة حساب سعر الحجز.

---

### المرحلة 6 — ربط Booking.com عبر Playwright (بدون وسيط)

**القرار:** بما أنه لا يوجد Channel Manager وسيط، سنستخدم **Playwright** (Headless Chrome) لأتمتة التعامل مع **Booking.com Extranet** مباشرة — نظامنا يسجّل الدخول بحساب الفندق، ويقرأ/يكتب البيانات من نفس الواجهة التي يستخدمها البشر.

**تحذيرات مهمة (يجب إبلاغ المالك):**
- هذا الأسلوب **غير مدعوم رسميًا** من بوكينج (ضد ToS تقنيًا).
- عرضة للكسر عند أي تحديث في واجهة الإكسترانت → يحتاج صيانة دورية للـ selectors.
- لا يمكن أن يعمل بمعدّل عالٍ (خطر Rate-limit / Ban للحساب).
- بعض العمليات (مثل Import حجوزات كبيرة) ستكون بطيئة.
- البديل الآمن يبقى الاشتراك في Channel Manager لاحقًا.

**التكنولوجيا:**
- `playwright` + `@playwright/test` (npm package).
- يعمل على سيرفر Node.js مستقل (ليس داخل Next.js runtime لأنها heavyweight).
- Chromium أو Chrome الداخلي.

**البنية التقنية:**

| المكوّن | الوصف |
|---|---|
| `realtime/` أو `bot/` (جديد) | خدمة Node.js مستقلة تشغّل Playwright بشكل دائم |
| جدول `booking_credentials` | بيانات الدخول للإكسترانت (مشفّرة) + `last_login_at` |
| جدول `booking_property_map` | ربط `UnitType` بـ Room ID في بوكينج |
| جدول `booking_sync_jobs` | طابور المهام (update_price, update_availability, fetch_reservations) |
| جدول `booking_sync_log` | سجل كل عملية (نجاح/فشل + screenshot عند الفشل) |
| `booking_inbox_reservations` | حجوزات مستقبلة بانتظار الاعتماد |
| `POST /api/booking/sync/trigger` | يدفع مهمة إلى الطابور |
| `GET /api/booking/sync/status` | حالة آخر مزامنة |
| شاشة `/settings/booking` | تسجيل الدخول + حالة المزامنة + السجلات |

**مكونات الـ Bot (Playwright):**
- `bot/login.ts` — تسجيل دخول + حفظ session (cookies).
- `bot/fetch-reservations.ts` — قراءة الحجوزات الجديدة من Inbox.
- `bot/update-rates.ts` — تحديث الأسعار اليومية لكل نوع.
- `bot/update-availability.ts` — تحديث التوفّر اليومي.
- `bot/update-room-info.ts` — تحديث وصف/صور نوع الغرفة (نادر).
- `bot/runner.ts` — حلقة رئيسية تقرأ `booking_sync_jobs` وتنفّذ.

**تدفّق الحجز الخارجي:**
1. ضيف يحجز على Booking.com.
2. Bot ينفّذ `fetch-reservations` كل 5–15 دقيقة.
3. إذا وجد حجزًا جديدًا → يُسجَّل في `booking_inbox_reservations`.
4. إشعار للريسبشن → يراجع ويُعتمد.
5. عند الاعتماد: يُحوَّل إلى `Reservation` + تُسند `Unit` متاحة.

**تدفّق تحديث السعر/التوفّر:**
1. المستخدم يغيّر السعر في نظامنا.
2. Trigger يُضيف مهمة إلى `booking_sync_jobs`.
3. Bot يقرأ المهمة → يسجّل دخول (إن لزم) → يحدّث الإكسترانت.
4. يسجّل نتيجة في `booking_sync_log` (+ screenshot عند الفشل).

**مرونة Defensive:**
- Timeout 60 ثانية لكل عملية.
- Retry (3 محاولات) مع Exponential backoff.
- CAPTCHA detection → إيقاف المزامنة وإرسال تنبيه للمدير.
- Screenshot يُحفظ لكل خطأ.

---

## 7. الجدول الزمني المقترح

| المرحلة | الجهد | مستقلة؟ |
|---|---|---|
| 1. Schema + Seed | ½ يوم | ✅ |
| 2. CRUD الأنواع | 1.5 يوم | ✅ |
| 3. ربط الوحدات | ½ يوم | ✅ |
| 4. شاشة الحجوزات | يوم | ✅ |
| 5. التسعير | يوم | ✅ |
| 6. Booking.com | 2–3 أيام | بعد اختيار الوسيط |

---

## 8. قرارات تمت الموافقة عليها

- [x] التصميم المعماري (UnitType + UnitTypeRoom + UnitTypeBed + Amenity + Photos).
- [x] الأكواد والأسماء في قسم 4.
- [x] صلاحيات `settings.unit_types` (admin edit, الباقي view).
- [x] المرحلة 6: Playwright على Booking.com Extranet (بدل Channel Manager).

---

## 9. سجل التغييرات

| التاريخ | التغيير |
|---|---|
| 2026-04-20 | إنشاء المسودّة الأولى. |
| 2026-04-20 | تحديث المرحلة 6 لاستخدام Playwright بدل Channel Manager. تثبيت قرار الصلاحيات. تفصيل استراتيجية Migration حسب نمط `db:push`. |
