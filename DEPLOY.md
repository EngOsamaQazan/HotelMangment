# دليل نشر نظام فندق الفاخر على السيرفر

## المتطلبات
- سيرفر Linux (Ubuntu 22.04+)
- Domain: hotel.aqssat.co (مُعد مسبقاً على GoDaddy)
- IP: 31.220.82.115

---

## الخطوة 1: تحديث السيرفر وتثبيت الأدوات

```bash
# تسجيل الدخول
ssh root@31.220.82.115

# تحديث النظام
apt update && apt upgrade -y

# تثبيت الأدوات الأساسية
apt install -y curl git ufw
```

## الخطوة 2: تثبيت Docker و Docker Compose

```bash
# تثبيت Docker
curl -fsSL https://get.docker.com | sh

# تثبيت Docker Compose
apt install -y docker-compose-plugin

# التحقق
docker --version
docker compose version
```

## الخطوة 3: تثبيت Nginx و Certbot (SSL)

```bash
apt install -y nginx certbot python3-certbot-nginx

# إعداد الجدار الناري
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

## الخطوة 4: رفع المشروع للسيرفر

من جهازك المحلي (PowerShell):
```powershell
# ضغط المشروع
cd C:\Users\PC\Desktop\FakherHotelBasic\hotel-app
tar -czf hotel-app.tar.gz --exclude=node_modules --exclude=.next .

# رفع الملف للسيرفر
scp hotel-app.tar.gz root@31.220.82.115:/root/
```

على السيرفر:
```bash
mkdir -p /opt/hotel-app
cd /opt/hotel-app
tar -xzf /root/hotel-app.tar.gz
```

## الخطوة 5: إعداد متغيرات البيئة

```bash
cd /opt/hotel-app

# تعديل ملف .env
cat > .env << 'EOF'
DATABASE_URL="postgresql://fakher_user:FakherHotel2026Secure@db:5432/fakher_hotel?schema=public"
NEXTAUTH_SECRET="your-very-long-random-secret-here-change-this"
NEXTAUTH_URL="https://hotel.aqssat.co"
EOF
```

> **مهم:** غيّر NEXTAUTH_SECRET إلى قيمة عشوائية طويلة. يمكنك توليدها بالأمر:
> ```bash
> openssl rand -base64 32
> ```

## الخطوة 6: بناء وتشغيل التطبيق

```bash
cd /opt/hotel-app

# بناء وتشغيل عبر Docker Compose
docker compose up -d --build

# الانتظار حتى تجهز قاعدة البيانات (30 ثانية)
sleep 30

# تطبيق مخطط قاعدة البيانات
docker compose exec app npx prisma db push

# تعبئة البيانات الأولية
docker compose exec app npx prisma db seed

# التحقق من أن الحاويات تعمل
docker compose ps
```

## الخطوة 7: إعداد Nginx كـ Reverse Proxy

```bash
# نسخ إعدادات Nginx
cp /opt/hotel-app/nginx.conf /etc/nginx/sites-available/hotel.aqssat.co

# تفعيل الموقع
ln -sf /etc/nginx/sites-available/hotel.aqssat.co /etc/nginx/sites-enabled/

# حذف الإعداد الافتراضي
rm -f /etc/nginx/sites-enabled/default

# اختبار الإعدادات (سيفشل بسبب SSL، هذا طبيعي)
nginx -t
```

## الخطوة 8: الحصول على شهادة SSL

```bash
# إعداد Nginx مؤقت بدون SSL أولاً
cat > /etc/nginx/sites-available/hotel.aqssat.co << 'EOF'
server {
    listen 80;
    server_name hotel.aqssat.co;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# إعادة تشغيل Nginx
nginx -t && systemctl restart nginx

# الحصول على شهادة SSL
certbot --nginx -d hotel.aqssat.co --non-interactive --agree-tos -m your-email@example.com

# إعادة تشغيل Nginx
systemctl restart nginx
```

## الخطوة 9: التحقق

```bash
# فتح الموقع في المتصفح
# https://hotel.aqssat.co

# التحقق من السجلات
docker compose logs -f app
```

---

## الحسابات الافتراضية

| الدور | البريد الإلكتروني | كلمة المرور |
|-------|-------------------|-------------|
| مدير | admin@fakher.jo | admin123 |
| استقبال | reception@fakher.jo | reception123 |
| محاسب | accountant@fakher.jo | accountant123 |

> **مهم جداً:** غيّر كلمات المرور فور تسجيل الدخول الأول!

---

## أوامر مفيدة

```bash
# إعادة تشغيل التطبيق
cd /opt/hotel-app && docker compose restart

# عرض السجلات
docker compose logs -f app

# إيقاف التطبيق
docker compose down

# تحديث التطبيق (بعد رفع ملفات جديدة)
docker compose up -d --build

# نسخ احتياطي لقاعدة البيانات
docker compose exec db pg_dump -U fakher_user fakher_hotel > backup_$(date +%Y%m%d).sql

# استعادة قاعدة البيانات
cat backup.sql | docker compose exec -T db psql -U fakher_user fakher_hotel

# تغيير كلمة سر الـ root
passwd
```

---

## استكشاف الأخطاء

### التطبيق لا يعمل
```bash
docker compose logs app    # عرض سجلات التطبيق
docker compose ps          # التحقق من حالة الحاويات
```

### قاعدة البيانات لا تتصل
```bash
docker compose logs db     # سجلات قاعدة البيانات
docker compose exec db psql -U fakher_user -d fakher_hotel  # اختبار الاتصال
```

### مشكلة SSL
```bash
certbot renew --dry-run    # اختبار تجديد الشهادة
```
