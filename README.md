# Hotel App — نظام إدارة الفندق

تطبيق Next.js 16 + TypeScript + Prisma + PostgreSQL لإدارة الحجوزات، الوحدات، المحاسبة، المهام والمحادثات.

---

## المتطلبات

| الأداة | الإصدار |
|---|---|
| Node.js | 20+ |
| npm | 10+ |
| PostgreSQL | 14+ (محلياً أو على السيرفر) |
| Git | أي إصدار حديث |

---

## التشغيل المحلي — في 5 خطوات

> التطبيق يعتمد على ملفات بيئة منفصلة: **محلياً** يقرأ `.env.local` (جهازك + قاعدة بيانات محلية)، و**على السيرفر** يقرأ `.env` (الإنتاج). هذا يضمن ألا تتلامس أبداً بيانات التطوير مع الإنتاج.
>
> 💡 **على Windows مع Laragon؟** راجع دليل [`docs/local-dev-laragon.md`](docs/local-dev-laragon.md) لتفاصيل إضافة PostgreSQL و Node.js عبر Laragon كبديل خفيف عن Docker.

### 1) استنساخ المشروع وتثبيت الحزم

```bash
git clone https://github.com/EngOsamaQazan/HotelMangment.git hotel-app
cd hotel-app
npm install
```

### 2) إنشاء قاعدة بيانات محلية

على جهازك (افترض Postgres مُشغَّل محلياً):

```bash
createdb fakher_hotel_dev
# أو عبر psql:
#   psql -U postgres -c "CREATE DATABASE fakher_hotel_dev;"
```

### 3) توليد ملف `.env.local` احترافي

```bash
npm run setup:env
```

السكريبت تفاعلي: يسألك عن اسم/منفذ/مستخدم قاعدة البيانات، ويولّد `NEXTAUTH_SECRET` عشوائياً آمناً، ثم يكتب `.env.local` في جذر المشروع.

أو يدوياً:

```bash
cp .env.example .env.local
# ثم عدّل القيم يدوياً
```

يمكنك التحقق من سلامة الإعداد في أي وقت بـ:

```bash
npm run env:check
```

### 4) تطبيق المخطط وتعبئة البيانات الأولية

```bash
npm run db:push              # تطبيق Prisma schema
npm run db:seed              # إنشاء المستخدمين الأوليين + البيانات
npm run db:seed-permissions  # مزامنة سجل الصلاحيات
```

### 5) تشغيل التطبيق

```bash
npm run dev
```

افتح <http://localhost:3000> وسجّل دخول بـ:

| الدور | البريد | كلمة المرور |
|---|---|---|
| مدير | `admin@fakher.jo` | `admin123` |
| استقبال | `reception@fakher.jo` | `reception123` |
| محاسب | `accountant@fakher.jo` | `accountant123` |

---

## بنية ملفات البيئة

| الملف | الغرض | يُرفع لـ Git؟ |
|---|---|---|
| `.env.example` | القالب الرسمي الموثّق لكل المتغيرات | ✅ نعم |
| `.env.local` | إعداد جهاز المطوّر (محلياً فقط) | ❌ لا |
| `.env.local.backup-*` | نسخ احتياطية يولّدها `setup:env` | ❌ لا |
| `.env` | **على السيرفر فقط** — إعداد الإنتاج في `/opt/hotel-app/.env` | ❌ لا |

Next.js يحمّل الملفات بالترتيب التالي (الأعلى أولوية في الأسفل):

- **development:** `.env` → `.env.development` → `.env.local` → `.env.development.local`
- **production:** `.env` → `.env.production` → `.env.local` → `.env.production.local`

لذا محلياً يكفي `.env.local`، وعلى السيرفر يكفي `.env` (المنشور في `/opt/hotel-app/`).

---

## قراءة المتغيرات من الكود

استخدم الوحدة الموحّدة `src/lib/env.ts` بدل `process.env` المباشر:

```ts
import { env } from "@/lib/env";

console.log(env.NEXTAUTH_URL);      // آمن + مع validation
if (env.isProduction) { /* … */ }
```

هذا يضمن رسائل خطأ واضحة إذا كان أي متغيّر مطلوب مفقوداً أو يحتوي قيمة نائبة.

---

## السكريبتات المتوفرة

| الأمر | الوصف |
|---|---|
| `npm run dev` | تشغيل وضع التطوير |
| `npm run build` | بناء إنتاجي (standalone) |
| `npm run start` | تشغيل إنتاجي |
| `npm run setup:env` | إنشاء `.env.local` تفاعلياً |
| `npm run env:check` | التحقق من سلامة متغيرات البيئة |
| `npm run db:push` | تطبيق مخطط Prisma |
| `npm run db:seed` | تعبئة البيانات الأولية |
| `npm run db:seed-permissions` | مزامنة سجل الصلاحيات |
| `npm run db:reset` | حذف القاعدة وإعادة بنائها من الصفر |
| `npm run check:permissions` | التحقق من تغطية الصلاحيات (CI guard) |

---

## النشر للإنتاج

راجع التفاصيل الكاملة في [`docs/DEPLOY.md`](docs/DEPLOY.md).

ملخّص: النشر تلقائي عبر GitHub Actions على أي push لـ `main`. ملف `.env` على السيرفر في `/opt/hotel-app/.env` لا يُلمس من قبل النشر الآلي — أنت تضبطه مرة واحدة يدوياً أو عند التبديل لقاعدة بيانات جديدة.

---

## البنية العامة

- `src/app/` — مسارات Next.js (App Router)
- `src/lib/` — الوحدات المشتركة (Prisma, env, permissions, …)
- `src/components/` — مكونات الواجهة
- `prisma/` — مخطط قاعدة البيانات + seeds
- `realtime/` — خدمة Socket.IO منفصلة (منفذ 3001)
- `bot/` — بوت مزامنة حجوزات Booking (اختياري)
- `scripts/` — أدوات مساعدة للـ CLI
- `deployment/` — ملفات Apache + سكريبتات النشر
- `docs/` — الوثائق

---

## الصلاحيات

هذا المشروع يستخدم نظام RBAC ديناميكي مدفوع بقاعدة البيانات. لا تُنشئ أي مسار API أو صفحة دون تسجيلها في `src/lib/permissions/registry.ts`. راجع [`AGENTS.md`](AGENTS.md) والمهارة `.cursor/skills/add-module-permissions/SKILL.md` للتفاصيل.
