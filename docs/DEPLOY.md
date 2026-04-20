# دليل نشر نظام فندق المفرق

## نظرة عامة

- **المسار على السيرفر**: `/opt/hotel-app`
- **قاعدة البيانات**: PostgreSQL محلّي على نفس السيرفر (`postgres` service على `127.0.0.1:5432`)
- **مدير العمليات**: PM2 (خدمة `hotel-app`)
- **الـ Reverse Proxy**: Apache 2 (VirtualHost: `hotel.aqssat.co`)
- **الشهادة**: Let's Encrypt عبر certbot
- **النشر التلقائي**: GitHub Actions → SSH → git pull → npm ci → build → PM2 restart

راجع تفاصيل النشر الآلي في: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).

---

## البنية التحتية

- **السيرفر**: Ubuntu Linux
- **النطاق**: `hotel.aqssat.co`
- **الـ IP**: `31.220.82.115`

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

```bash
cat > /opt/hotel-app/.env <<EOF
DATABASE_URL="postgresql://fakher_user:FakherHotel2026Secure@127.0.0.1:5432/fakher_hotel?schema=public"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="https://hotel.aqssat.co"
EOF
chmod 600 /opt/hotel-app/.env
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

### 5) إعداد Apache VirtualHost

```bash
# نسخ ملف الإعداد من المستودع
cp /opt/hotel-app/deployment/apache/hotel.aqssat.co-le-ssl.conf \
   /etc/apache2/sites-available/

# تفعيل الوحدات اللازمة والموقع
a2enmod proxy proxy_http ssl headers expires
a2ensite hotel.aqssat.co-le-ssl

# اختبار الإعدادات وإعادة التحميل
apache2ctl configtest && systemctl reload apache2
```

راجع تفاصيل إعداد Apache وسبب تجاوز الكاش لمسار `/api/*` في:
[`deployment/apache/README.md`](../deployment/apache/README.md).

### 6) الحصول على شهادة SSL

```bash
certbot --apache -d hotel.aqssat.co \
        --non-interactive --agree-tos -m YOUR_EMAIL@example.com
systemctl reload apache2
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
curl -sI http://127.0.0.1:3000      # هل Next.js يستجيب محلياً؟
curl -sI https://hotel.aqssat.co    # من الخارج؟
tail -f /var/log/apache2/hotel.aqssat.co_error.log
```

### قاعدة البيانات لا تتصل

```bash
sudo -u postgres psql -c "\l"                          # قائمة القواعد
psql -U fakher_user -h 127.0.0.1 -d fakher_hotel -c \\dt
```

### الكاش يعرض بيانات قديمة

راجع [`deployment/apache/README.md`](../deployment/apache/README.md) — يجب أن يرجع
`/api/*` بـ `Cache-Control: no-store`.
