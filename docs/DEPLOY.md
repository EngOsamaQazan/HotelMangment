# دليل نشر نظام فندق المفرق

## نظرة عامة

- **المسار على السيرفر**: `/opt/hotel-app`
- **قاعدة البيانات**: PostgreSQL محلّي على نفس السيرفر (`postgres` service على `127.0.0.1:5432`)
- **مدير العمليات**: PM2 (خدمة `hotel-app`)
- **الـ Reverse Proxy**: Apache 2، نطاقان يُقدَّمان من نفس عملية Next.js:
  - `mafhotel.com` — الموقع العام للضيوف (الهبوط + الحجز + `/account`).
  - `admin.mafhotel.com` — لوحة إدارة الفندق (الموظفون فقط، `/login`).
- **الشهادة**: Let's Encrypt عبر certbot (شهادة واحدة تغطي النطاقين).
- **النشر التلقائي**: GitHub Actions → SSH → git pull → npm ci → build → PM2 restart

راجع تفاصيل النشر الآلي في: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).

---

## البنية التحتية

- **السيرفر**: Ubuntu Linux
- **النطاقات**:
  - `mafhotel.com` (+ `www.mafhotel.com`) — واجهة الضيوف.
  - `admin.mafhotel.com` — واجهة الإدارة.
- **الـ IP**: `31.220.82.115`

### كيف يعمل فصل النطاقين

نسخة واحدة من Next.js تعمل على المنفذ `3000`؛ Apache يوجّه كِلا النطاقين إليها.
ملف `src/middleware.ts` يقرأ رأس `Host` ويوجِّه كل طلب للنطاق المناسب:

- مسارات الموظفين (`/`, `/reservations`, `/rooms`, `/settings`, …، `/login`)
  تعمل فقط على `admin.mafhotel.com`. لو أتى أحدهم من النطاق العام يُعاد توجيهه.
- مسارات الضيوف (`/landing`, `/book`, `/signin`, `/signup`, `/account`, `/about`,
  `/privacy`, `/terms`) تعمل فقط على `mafhotel.com`. زيارتها من نطاق الإدارة
  تُعاد توجيهها تلقائياً.
- `/api/auth/*` مشترك بين النطاقين ليتمكّن NextAuth من إنهاء جلسات من أيّهما.

الجلسة تُحفظ في كوكي واحد مدى النطاق الأصل (`SESSION_COOKIE_DOMAIN=.mafhotel.com`)
فلا يحتاج المستخدم إعادة الدخول عند التنقّل بين النطاقين.

### المتطلبات المثبّتة على السيرفر

- Node.js 20+ و npm
- PostgreSQL 14+
- Apache 2 + mod_proxy + mod_proxy_http + mod_ssl
- certbot (مع إضافة Apache)
- PM2 (مثبّت عالمياً: `npm i -g pm2`)
- Git

---

## الإعداد الأوّلي (مرة واحدة)

### 1) إنشاء قاعدة البيانات

```bash
sudo -u postgres psql <<SQL
CREATE USER fakher_user WITH PASSWORD 'FakherHotel2026Secure';
CREATE DATABASE fakher_hotel OWNER fakher_user;
GRANT ALL PRIVILEGES ON DATABASE fakher_hotel TO fakher_user;
SQL
```

### 2) جلب المشروع من GitHub

```bash
mkdir -p /opt
cd /opt
git clone https://github.com/EngOsamaQazan/HotelMangment.git hotel-app
cd hotel-app
```

### 3) إعداد متغيّرات البيئة

> **ملاحظة مهمة:** المشروع يعتمد نمطاً احترافياً لفصل البيئات:
> - على **جهاز المطوّر** يُستخدم `.env.local` مع قاعدة بيانات محلية (راجع [`../README.md`](../README.md)).
> - على **السيرفر** يُستخدم `.env` في `/opt/hotel-app/.env` فقط، ويحوي إعداد الإنتاج.
> - ملف النشر `deploy.yml` لا يلمس هذا الملف؛ تُعدّه يدوياً مرة واحدة.
> - القالب المرجعي لكل المتغيرات موجود في [`.env.example`](../.env.example).

انسخ القالب أو أنشئه مباشرةً:

```bash
# توليد NEXTAUTH_SECRET عشوائي
SECRET=$(openssl rand -base64 48)

cat > /opt/hotel-app/.env <<EOF
# Production environment for mafhotel.com + admin.mafhotel.com
NODE_ENV=production

# قاعدة البيانات الإنتاجية (Postgres محلي على السيرفر)
DATABASE_URL="postgresql://fakher_user:FakherHotel2026Secure@127.0.0.1:5432/fakher_hotel?schema=public"

# NextAuth — URL واجهة الإدارة (مكان صفحة /login)
NEXTAUTH_SECRET=${SECRET}
NEXTAUTH_URL=https://admin.mafhotel.com

# النطاق العام (للضيوف) — يُستخدم في canonical URLs و Meta tags
NEXT_PUBLIC_SITE_URL=https://mafhotel.com

# فصل النطاقات (إدارة ↔ عام) — اضبطها في الإنتاج فقط.
ADMIN_HOST=admin.mafhotel.com
PUBLIC_HOST=mafhotel.com
# أسماء إضافية تُعامَل كالنطاق العام (www مُضاف تلقائياً؛ أبقِها فارغة إن لم يوجد بديل)
PUBLIC_HOST_ALIASES=
# كوكي جلسة مشترك بين النطاقين (لاحظ النقطة في البداية)
SESSION_COOKIE_DOMAIN=.mafhotel.com

# Realtime (Socket.IO)
REALTIME_PORT=3001
REALTIME_HOST=127.0.0.1
EOF

chmod 600 /opt/hotel-app/.env
```

للتحقق من الإعداد قبل البناء:

```bash
cd /opt/hotel-app
npm run env:check
```

### 4) بناء التطبيق وتشغيله أول مرة

```bash
cd /opt/hotel-app
npm ci
npx prisma db push
npx prisma db seed     # بيانات أولية (مرة واحدة فقط)
npm run build

# نسخ الأصول الثابتة إلى مخرجات standalone
cp -r public  .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp .env .next/standalone/.env
cp google-vision-key.json .next/standalone/google-vision-key.json 2>/dev/null || true

# تشغيل التطبيق تحت PM2
PORT=3000 HOSTNAME=0.0.0.0 pm2 start .next/standalone/server.js --name hotel-app
pm2 save
pm2 startup   # يطبع أمراً يُنفَّذ مرة واحدة لتفعيل إقلاع PM2 تلقائياً
```

### 5) إعداد Apache VirtualHosts (نطاقان)

النطاقان يشتركان في نفس عملية Next.js (PORT 3000) والـ Socket.IO (PORT 3001).

```bash
# انسخ ملفات الإعداد الأربعة من المستودع (HTTP + HTTPS لكل نطاق)
cp /opt/hotel-app/deploy/apache/mafhotel.com.conf             /etc/apache2/sites-available/
cp /opt/hotel-app/deploy/apache/mafhotel.com-le-ssl.conf      /etc/apache2/sites-available/
cp /opt/hotel-app/deploy/apache/admin.mafhotel.com.conf       /etc/apache2/sites-available/
cp /opt/hotel-app/deploy/apache/admin.mafhotel.com-le-ssl.conf /etc/apache2/sites-available/

# الوحدات اللازمة
a2enmod proxy proxy_http proxy_wstunnel ssl headers expires rewrite

# فعّل المواقع الأربعة
a2ensite mafhotel.com
a2ensite mafhotel.com-le-ssl
a2ensite admin.mafhotel.com
a2ensite admin.mafhotel.com-le-ssl

# اختبار وإعادة التحميل
apache2ctl configtest && systemctl reload apache2
```

### 6) شهادة SSL لكلا النطاقين

أصدر شهادة Let's Encrypt واحدة تغطّي كلا النطاقين (و www):

```bash
certbot --apache \
        -d mafhotel.com -d www.mafhotel.com -d admin.mafhotel.com \
        --non-interactive --agree-tos -m admin@mafhotel.com
systemctl reload apache2
```

تحقّق من عمل النطاقين:

```bash
curl -sI https://mafhotel.com/landing        | head -n 1   # HTTP/2 200
curl -sI https://admin.mafhotel.com/login    | head -n 1   # HTTP/2 200
curl -sI https://mafhotel.com/reservations   | head -n 1   # HTTP/2 308 → admin.mafhotel.com
curl -sI https://admin.mafhotel.com/landing  | head -n 1   # HTTP/2 308 → mafhotel.com
```

---

## النشر المستمر (كل push إلى main)

يعمل `.github/workflows/deploy.yml` تلقائياً عند أي push على الفرع `main`:

1. SSH إلى السيرفر.
2. `git fetch` + `git reset --hard origin/main`.
3. `npm ci`.
4. `npx prisma db push --accept-data-loss` (يُطبّق أي تعديلات على المخطط).
5. `npm run build`.
6. نسخ `public/`, `.next/static`, `.env`, `google-vision-key.json` إلى `.next/standalone/`.
7. `pm2 restart hotel-app` (أو تشغيله إذا لم يكن شغّالاً).
8. `pm2 save`.

### أسرار GitHub المطلوبة

| الاسم | القيمة |
|---|---|
| `SERVER_HOST` | `31.220.82.115` |
| `SERVER_USER` | `root` |
| `SSH_PRIVATE_KEY` | مفتاح SSH الخاص للدخول على السيرفر |

---

## الحسابات الافتراضية (غيّرها بعد أول تسجيل دخول)

| الدور | البريد | كلمة المرور |
|---|---|---|
| مدير | `admin@fakher.jo` | `admin123` |
| استقبال | `reception@fakher.jo` | `reception123` |
| محاسب | `accountant@fakher.jo` | `accountant123` |

---

## أوامر إدارية مفيدة (على السيرفر)

```bash
# حالة التطبيق
pm2 status
pm2 logs hotel-app --lines 100

# إعادة تشغيل يدوي
pm2 restart hotel-app

# نسخ احتياطي لقاعدة البيانات
pg_dump -U fakher_user -h 127.0.0.1 fakher_hotel \
        > /root/backups/fakher_hotel_$(date +%Y%m%d).sql

# استعادة قاعدة البيانات
psql -U fakher_user -h 127.0.0.1 -d fakher_hotel < backup.sql

# اختبار تجديد SSL
certbot renew --dry-run

# مراقبة Apache
systemctl status apache2
tail -f /var/log/apache2/error.log
```

---

## استكشاف الأخطاء

### التطبيق لا يستجيب

```bash
pm2 status              # هل hotel-app حالته online؟
pm2 logs hotel-app      # آخر الأخطاء
ss -tlnp | grep 3000    # هل المنفذ 3000 يستمع؟
```

### Apache لا يوصل الطلبات

```bash
apache2ctl configtest
curl -sI http://127.0.0.1:3000                           # هل Next.js يستجيب محلياً؟
curl -sI https://mafhotel.com                            # الموقع العام
curl -sI https://admin.mafhotel.com                      # لوحة الإدارة
tail -f /var/log/apache2/mafhotel.com-ssl-error.log
tail -f /var/log/apache2/admin.mafhotel.com-ssl-error.log
```

### قاعدة البيانات لا تتصل

```bash
sudo -u postgres psql -c "\l"                          # قائمة القواعد
psql -U fakher_user -h 127.0.0.1 -d fakher_hotel -c \\dt
```

### الكاش يعرض بيانات قديمة

راجع [`deployment/apache/README.md`](../deployment/apache/README.md) — يجب أن يرجع
`/api/*` بـ `Cache-Control: no-store`.
