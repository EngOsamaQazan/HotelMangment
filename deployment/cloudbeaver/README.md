# تثبيت CloudBeaver على السيرفر الإنتاجي (بدون Docker)

واجهة ويب لإدارة قاعدة بيانات PostgreSQL الخاصة بنظام الفندق، مثبّتة كخدمة `systemd`
خلف Apache + SSL، على نطاق فرعي مستقل: **`https://db.hotel.aqssat.co`**.

## نظرة عامة

| المكوّن | القيمة |
|---|---|
| التطبيق | CloudBeaver Community Edition |
| طريقة التشغيل | Native (Java 17 + systemd) — **بدون Docker** |
| المنفذ المحلي | `127.0.0.1:8978` (مغلق على الإنترنت) |
| Reverse Proxy | Apache 2 (نفس Apache الحالي للتطبيق) |
| النطاق العام | `db.hotel.aqssat.co` |
| الشهادة | Let's Encrypt |
| طبقات الحماية | IP Whitelist + Basic Auth + SSL + مستخدم Postgres محدود |

---

## الملفات في هذا المجلد

```
deployment/cloudbeaver/
├── install.sh                       # سكربت التثبيت الكامل (يُشغَّل مرة واحدة)
├── db.hotel.aqssat.co.conf          # إعداد Apache VirtualHost
└── README.md                        # هذا الملف
```

---

## خطوات النشر على السيرفر (تنفّذ مرة واحدة)

### 1) أضف سجل DNS من نوع A

من لوحة تحكم النطاق `aqssat.co`:

```
Type: A
Name: db.hotel
Value: 31.220.82.115
TTL: 300
```

تحقّق من الانتشار:
```bash
dig +short db.hotel.aqssat.co
# يجب أن يطبع: 31.220.82.115
```

### 2) ارفع آخر تحديث للمستودع على السيرفر

```bash
cd /opt/hotel-app
git pull origin main
```

### 3) شغّل سكربت التثبيت

```bash
sudo bash /opt/hotel-app/deployment/cloudbeaver/install.sh
```

السكربت يقوم تلقائياً بـ:
- تثبيت Java 17 و `apache2-utils`.
- إنشاء مستخدم نظام `cloudbeaver`.
- تنزيل CloudBeaver وتثبيته في `/opt/cloudbeaver`.
- نقل بيانات الـ workspace إلى `/var/lib/cloudbeaver` (لسهولة الترقية لاحقاً).
- ربط الخدمة بـ `127.0.0.1:8978` فقط.
- تسجيل خدمة `systemd` وتفعيلها لتعمل عند الإقلاع.

تحقّق:
```bash
systemctl status cloudbeaver
curl -sI http://127.0.0.1:8978
```

### 4) أنشئ مستخدم Basic Auth

طبقة حماية إضافية قبل ما يوصل أي طلب لـ CloudBeaver:

```bash
sudo htpasswd -c /etc/apache2/.htpasswd-cloudbeaver admin
# أدخل كلمة مرور قوية (تختلف عن كلمة مرور CloudBeaver نفسه)
```

> ⚠️ استخدم `-c` فقط أول مرة (ينشئ الملف). لإضافة مستخدمين لاحقاً استخدم `htpasswd` بدون `-c`.

### 5) عدّل ملف Apache vhost قبل تفعيله

افتح الملف وضع IP الخاص بك (شغّل `curl ifconfig.me` من جهازك للحصول عليه):

```bash
sudo cp /opt/hotel-app/deployment/cloudbeaver/db.hotel.aqssat.co.conf \
        /etc/apache2/sites-available/db.hotel.aqssat.co.conf

sudo nano /etc/apache2/sites-available/db.hotel.aqssat.co.conf
# في قسم <RequireAny> أزل التعليق وضع IPك:
#   Require ip 41.234.56.78
```

### 6) فعّل الوحدات والـ vhost (مرحلة HTTP فقط مؤقتاً)

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers ssl auth_basic authn_file
```

قبل تشغيل certbot، احتاج تفعّل النسخة البسيطة (HTTP فقط) عشان certbot يقدر يثبت بنفسه. أسهل طريقة: استخدم certbot مباشرة وهو هيظبط الـ HTTPS تلقائياً.

أنشئ نسخة HTTP-only مؤقتة:

```bash
sudo tee /etc/apache2/sites-available/db.hotel.aqssat.co-temp.conf > /dev/null <<'CONF'
<VirtualHost *:80>
    ServerName db.hotel.aqssat.co
    DocumentRoot /var/www/html
</VirtualHost>
CONF

sudo a2ensite db.hotel.aqssat.co-temp
sudo apache2ctl configtest && sudo systemctl reload apache2
```

### 7) أصدر شهادة SSL

```bash
sudo certbot --apache -d db.hotel.aqssat.co \
     --non-interactive --agree-tos -m admin@aqssat.co
```

### 8) فعّل الـ vhost النهائي

```bash
# ألغِ المؤقت
sudo a2dissite db.hotel.aqssat.co-temp
sudo rm /etc/apache2/sites-available/db.hotel.aqssat.co-temp.conf

# فعّل النهائي (الذي يحوي IP whitelist + Basic Auth + WebSocket)
sudo a2ensite db.hotel.aqssat.co

sudo apache2ctl configtest && sudo systemctl reload apache2
```

### 9) أنشئ مستخدم Postgres محدود الصلاحيات (اختياري لكن موصى به)

بدل ما تستخدم `fakher_user` (له صلاحيات كاملة) داخل CloudBeaver، أنشئ مستخدم خاص:

```bash
sudo -u postgres psql <<SQL
-- مستخدم للقراءة فقط (للاستعراض اليومي)
CREATE USER cb_readonly WITH PASSWORD 'CHANGE_ME_strong_pass_1';
GRANT CONNECT ON DATABASE fakher_hotel TO cb_readonly;
\c fakher_hotel
GRANT USAGE ON SCHEMA public TO cb_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO cb_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO cb_readonly;

-- مستخدم للكتابة المحدودة (تعديل البيانات فقط، بدون DDL)
CREATE USER cb_editor WITH PASSWORD 'CHANGE_ME_strong_pass_2';
GRANT CONNECT ON DATABASE fakher_hotel TO cb_editor;
GRANT USAGE ON SCHEMA public TO cb_editor;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cb_editor;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cb_editor;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cb_editor;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cb_editor;
SQL
```

> ⚠️ استخدم `fakher_user` فقط للحالات التي تحتاج فيها تعديلات Schema (وهذا نادر — يفترض أن يتم عبر Prisma Migrations).

---

## كيف تدخل على CloudBeaver أول مرة؟

### 1) افتح الرابط

من المتصفح:
```
https://db.hotel.aqssat.co
```

سيظهر لك أولاً مربع **HTTP Basic Auth** — أدخل بيانات `admin` التي أنشأتها بـ `htpasswd`.

### 2) أكمل إعداد CloudBeaver لأول مرة

CloudBeaver سيعرض شاشة **Initial Setup**:

- **Server name**: `Fakher Hotel DB`
- **Server URL**: `https://db.hotel.aqssat.co`
- **Admin username**: اختر اسم (مثلاً `cbadmin`)
- **Admin password**: كلمة مرور قوية ومختلفة عن أي شيء سابق
- **Anonymous access**: ❌ متفعّلش
- **Authentication methods**: Local فقط

اضغط **Finish**.

### 3) سجّل دخول كأدمن CloudBeaver

استخدم `cbadmin` + كلمة المرور التي أنشأتها للتو.

### 4) أنشئ اتصال بقاعدة البيانات

من القائمة العلوية اضغط **+** → **New Connection** → اختر **PostgreSQL**:

| الحقل | القيمة |
|---|---|
| **Host** | `127.0.0.1` |
| **Port** | `5432` |
| **Database** | `fakher_hotel` |
| **Username** | `cb_readonly` (للاستعراض) أو `cb_editor` (للتعديل) |
| **Password** | كلمة المرور التي اخترتها في الخطوة 9 |
| **SSL** | غير مطلوب (الاتصال محلي بين CloudBeaver و Postgres على نفس السيرفر) |

اضغط **Test Connection** ثم **Create**.

### 5) ابدأ الاستخدام

- اعرض الجداول من الشريط الجانبي.
- شغّل استعلامات من **SQL Editor**.
- عدّل البيانات بشكل مباشر من شبكة العرض (Data Editor) — تأكد من Commit بعد كل تعديل.
- صدّر/استورد البيانات بصيغ متعددة (CSV, JSON, SQL).

---

## أوامر إدارية مفيدة

```bash
# حالة الخدمة
sudo systemctl status cloudbeaver

# مشاهدة اللوج المباشر
sudo journalctl -u cloudbeaver -f

# إعادة تشغيل
sudo systemctl restart cloudbeaver

# إيقاف
sudo systemctl stop cloudbeaver

# تعطيل الإقلاع التلقائي
sudo systemctl disable cloudbeaver

# نسخة احتياطية للـ workspace (يحتوي إعدادات + اتصالات + أدمن CloudBeaver)
sudo tar -czf /root/backups/cloudbeaver_$(date +%Y%m%d).tar.gz /var/lib/cloudbeaver

# عرض الإصدار المثبت
ls /opt/cloudbeaver
```

---

## الترقية لإصدار أحدث

لأن الـ workspace خارج `/opt/cloudbeaver` (في `/var/lib/cloudbeaver`)، الترقية آمنة:

```bash
sudo systemctl stop cloudbeaver
sudo mv /opt/cloudbeaver /opt/cloudbeaver.old

# نزّل النسخة الجديدة (عدّل CB_VERSION)
sudo CB_VERSION=25.2.0 bash /opt/hotel-app/deployment/cloudbeaver/install.sh

# لو كل شيء تمام
sudo rm -rf /opt/cloudbeaver.old
```

---

## استكشاف الأخطاء

### CloudBeaver لا يقلع
```bash
sudo journalctl -u cloudbeaver -n 200 --no-pager
sudo -u cloudbeaver /opt/cloudbeaver/run-server.sh   # شغّله يدوياً لرؤية الخطأ
java -version                                          # تأكد أن 17+
```

### Apache يرجّع 502 Bad Gateway
```bash
curl -sI http://127.0.0.1:8978          # هل CloudBeaver يستجيب محلياً؟
sudo systemctl status cloudbeaver
sudo tail -f /var/log/apache2/db.hotel.aqssat.co-error.log
```

### Apache يرجّع 403 Forbidden
معناها IP بتاعك مش في الـ whitelist. اعرف IPك:
```bash
curl ifconfig.me
```
وعدّل ملف vhost وضعه تحت `<RequireAny>`، ثم:
```bash
sudo apache2ctl configtest && sudo systemctl reload apache2
```

### CloudBeaver لا يقدر يتصل بـ Postgres
```bash
# تأكد أن المستخدم موجود وله صلاحيات
sudo -u postgres psql -c "\du cb_readonly"
sudo -u postgres psql -d fakher_hotel -c "\dp" | head

# تأكد من listen_addresses في postgresql.conf (يكفي 'localhost' لأن الاتصال محلي)
sudo grep -E '^listen_addresses' /etc/postgresql/*/main/postgresql.conf
```

### الـ WebSocket لا يعمل (CloudBeaver يعرض "Disconnected")
```bash
# تأكد أن mod_proxy_wstunnel مفعّل
apache2ctl -M | grep proxy_wstunnel
sudo a2enmod proxy_wstunnel
sudo systemctl reload apache2
```

---

## ملخص الأمان (Defense in Depth)

| الطبقة | الحماية |
|---|---|
| 1. الشبكة | CloudBeaver يستمع على `127.0.0.1` فقط — لا يمكن الوصول له من الإنترنت مباشرة |
| 2. Apache IP whitelist | فقط IPك المعرّف يمر |
| 3. Apache Basic Auth | كلمة مرور قبل الوصول لشاشة CloudBeaver |
| 4. CloudBeaver Login | حساب أدمن داخلي بكلمة مرور قوية |
| 5. Postgres User | مستخدم محدود الصلاحيات (readonly/editor) — ليس superuser |
| 6. SSL/TLS | كل الاتصالات بين المتصفح والسيرفر مشفّرة |
| 7. systemd Hardening | `NoNewPrivileges`, `ProtectSystem`, `PrivateTmp` |

---

## مراجع

- الموقع الرسمي: <https://cloudbeaver.io>
- التوثيق: <https://github.com/dbeaver/cloudbeaver/wiki>
- إصدارات التحميل: <https://dbeaver.io/files/cloudbeaver/>
