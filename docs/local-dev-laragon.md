# تشغيل Hotel-App محلياً باستخدام Laragon

> هذا الدليل للمطوّرين اللي يستخدمون **Laragon** على Windows كبديل خفيف عن Docker.
> للتشغيل بدون Laragon راجع [`../README.md`](../README.md).

---

## لماذا Laragon؟

- **خفيف** (~200MB) وسريع، يبدأ في ثوانٍ.
- **واجهة Start/Stop واحدة** لكل الخدمات (Apache, MySQL, PostgreSQL, Node.js).
- **يدمج المشاريع مع مشاريع PHP** الأخرى — كل شيء تحت `C:\laragon\`.
- **يضيف الأدوات إلى PATH تلقائياً** → `psql`, `pg_dump`, `node`, `npm` يعملون من CMD مباشرة.

---

## المتطلبات

| الأداة | الإصدار | الموقع |
|---|---|---|
| Laragon Full | 6.0+ | https://laragon.org/ |
| PostgreSQL (عبر Laragon) | 16 أو 17 | Quick Add |
| Node.js (عبر Laragon) | 20 LTS+ | Quick Add |
| OpenSSH client | Windows built-in | `Settings → Apps → Optional features` |

---

## التثبيت (مرة واحدة)

### 1) إضافة PostgreSQL إلى Laragon

**الطريقة المفضّلة — Quick Add:**
```
Laragon → Menu → Tools → Quick Add → PostgreSQL
```
اختر إصدار `16` أو `17`. Laragon ينزّله وينصّبه تلقائياً في:
```
C:\laragon\bin\postgresql\postgresql-17\
```

**إذا Quick Add ما يحتوي على PostgreSQL:**
1. نزّل الـ ZIP من https://www.enterprisedb.com/download-postgresql-binaries
2. فكّ الضغط إلى `C:\laragon\bin\postgresql\postgresql-17\`
3. Laragon → **Reload**

### 2) إضافة Node.js إلى Laragon

```
Laragon → Menu → Tools → Quick Add → Node.js
```
اختر `node-v20.x-x64` (LTS). يُثبَّت في `C:\laragon\bin\nodejs\`.

### 3) إضافة pgAdmin (GUI اختياري)

```
Laragon → Menu → Tools → Quick Add → pgAdmin
```
أو يدوياً من https://www.pgadmin.org/download/pgadmin-4-windows/

### 4) إعدادات PATH

Laragon يضيف `bin\` تلقائياً، لكن تأكد من:
- `C:\laragon\bin\postgresql\postgresql-17\bin` (للـ `psql`, `pg_dump`)
- `C:\laragon\bin\nodejs\node-v20.x-x64` (للـ `node`, `npm`)

تحقّق:
```cmd
where psql
where pg_dump
where node
```

---

## التشغيل اليومي

### 1) تشغيل الخدمات

افتح Laragon → اضغط **Start All**.
يتحول اللون إلى أخضر = كل شيء شغّال.

### 2) إعداد قاعدة البيانات (مرة واحدة)

```cmd
:: أنشئ القاعدة
createdb -U postgres fakher_hotel_dev
```

إذا أول مرة تستخدم المشروع، اتبع خطوات `../README.md`:
```bash
npm install
npm run setup:env
npm run db:push
npm run db:seed
npm run db:seed-permissions
npm run dev
```

### 3) سحب بيانات الإنتاج (بديل `db:seed`)

بدل البيانات الأولية، اسحب نسخة الإنتاج كاملة:

```bash
npm run db:sync-from-prod
```

السكريبت:
- يتصل SSH بالسيرفر
- يعمل `pg_dump` للقاعدة الإنتاجية
- ينزّل الملف عبر `scp`
- يحذف قاعدتك المحلية ويعيد بناءها من الـ dump
- يتحقّق من تطابق عدد الصفوف في جداول رئيسية

متطلبات السكريبت:
- SSH key مُضاف للسيرفر (`osama@hotel.aqssat.co`)
- `pg_dump`, `pg_restore`, `psql`, `ssh`, `scp` في PATH

إذا السيرفر مختلف:
```bash
set SYNC_SSH_TARGET=user@another-host
npm run db:sync-from-prod
```

### 4) تشغيل التطبيق

**Next.js فقط (للواجهة والـ API):**
```bash
npm run dev
```
يفتح على http://localhost:3000

**Realtime (للإشعارات الفورية + Chat + Tasks):**
في terminal ثاني:
```bash
cd realtime
npm install
node src/server.js
```
يفتح على http://127.0.0.1:3001

**Bot (اختياري — مزامنة Booking):**
```bash
cd bot
npm install
npm run dev
```

---

## إدارة خدمات Laragon

### إيقاف/تشغيل PostgreSQL فقط

- Laragon → أيقونة PostgreSQL → **Stop** / **Start**
- أو من Services Manager: `services.msc` → ابحث عن `postgresql-x64-17`

### فتح psql بسرعة

Laragon → **Menu → PostgreSQL → psql**

### فتح pgAdmin

Laragon → **Menu → PostgreSQL → pgAdmin**
اتصال جديد:
- Host: `127.0.0.1`
- Port: `5432`
- User: `postgres`
- Password: (من وقت التثبيت)

### فتح Terminal في جذر المشروع

Laragon → **Menu → Terminal**
أو من أيقونة المشروع في قائمة www.

---

## أوامر مفيدة

### نسخ احتياطي يدوي للقاعدة المحلية

```bash
pg_dump -U postgres -Fc fakher_hotel_dev -f backup-local.dump
```

### استعادة نسخة احتياطية

```bash
pg_restore -U postgres --no-owner --no-privileges -d fakher_hotel_dev backup-local.dump
```

### إعادة إنشاء القاعدة من الصفر

```bash
dropdb -U postgres --if-exists fakher_hotel_dev
createdb -U postgres fakher_hotel_dev
npm run db:push
npm run db:seed
```

### فحص الاتصال

```bash
psql -U postgres -h 127.0.0.1 -d fakher_hotel_dev -c "SELECT version();"
```

---

## مقارنة بين Laragon و Docker Desktop

| المعيار | Laragon | Docker Desktop |
|---|---|---|
| الحجم | ~200MB | ~1GB+ |
| استهلاك الذاكرة | ~100MB | ~2GB+ (WSL2) |
| سرعة الإقلاع | ثوانٍ | دقائق |
| العزل | عمليات Windows | containers |
| تطابق مع الإنتاج | ✅ (نفس الأدوات) | ✅ (أفضل) |
| سهولة الإعداد | ✅ جداً | ⚠️ يتطلب معرفة |
| نقل لجهاز آخر | ⚠️ يدوي | ✅ Dockerfile |

**الخلاصة:** Laragon مثالي لبيئة تطوير شخصية خفيفة. Docker مثالي للفرق والمشاريع الكبيرة. لمشروعنا الحالي، Laragon كافٍ ويفوق Docker في سرعة التطوير اليومي.

---

## المشاكل الشائعة

### PostgreSQL لا يقلع

```cmd
:: افحص السجل
type C:\laragon\bin\postgresql\postgresql-17\data\log\postgresql-*.log
```

أسباب شائعة:
- البورت 5432 محجوز من عملية أخرى → غيّره في `postgresql.conf`
- مجلد `data` محذوف → أعد التهيئة:
  ```cmd
  cd C:\laragon\bin\postgresql\postgresql-17\bin
  initdb -D ..\data -U postgres
  ```

### `psql` لا يُعرَف

```cmd
:: أضف للـ PATH يدوياً
setx PATH "%PATH%;C:\laragon\bin\postgresql\postgresql-17\bin"
```
ثم أغلق CMD وافتحه من جديد.

### `npm run dev` يعطي خطأ Prisma

```bash
npx prisma generate
npm run db:push
```

### الأداء بطيء على قاعدة كبيرة

في `postgresql.conf`:
```
shared_buffers = 512MB
work_mem = 32MB
```
ثم أعد تشغيل PostgreSQL من Laragon.

---

## المراجع

- [Laragon Documentation](https://laragon.org/docs/)
- [PostgreSQL Windows](https://www.postgresql.org/download/windows/)
- [pgAdmin 4](https://www.pgadmin.org/)
- المشروع: [`../README.md`](../README.md) • [`DEPLOY.md`](DEPLOY.md)
