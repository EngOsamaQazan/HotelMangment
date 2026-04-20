# تثبيت pgweb على السيرفر الإنتاجي (بدون Docker)

واجهة ويب لإدارة قاعدة بيانات PostgreSQL الخاصة بنظام الفندق، مبنيّة على
**pgweb** (ملف Go تنفيذي واحد، 7MB)، مثبّتة كخدمة `systemd` خلف Apache + SSL،
على نطاق فرعي مستقل: **`https://db.hotel.aqssat.co`**.

> 💡 **ليه pgweb بدل CloudBeaver؟** DBeaver أوقفوا توزيع CloudBeaver كـ tarball
> جاهز (Docker فقط الآن). pgweb بديل ممتاز: ملف تنفيذي واحد، بدون Java، بدون
> اعتماديّات، خفيف وسريع، ومخصّص لـ PostgreSQL تحديداً.

## نظرة عامة

| المكوّن | القيمة |
|---|---|
| التطبيق | [pgweb](https://github.com/sosedoff/pgweb) (Go binary) |
| طريقة التشغيل | Native (systemd) — **بدون Docker، بدون Java، بدون أي runtime** |
| المنفذ المحلي | `127.0.0.1:8081` (مغلق على الإنترنت) |
| Reverse Proxy | Apache 2 (نفس Apache الحالي للتطبيق) |
| النطاق العام | `db.hotel.aqssat.co` |
| الشهادة | Let's Encrypt |
| طبقات الحماية | IP Whitelist + Basic Auth + SSL + مستخدم Postgres محدود |

---

## الملفات في هذا المجلد

```
deployment/pgweb/
├── install.sh                       # سكربت التثبيت الكامل (يُشغَّل مرة واحدة)
├── db.hotel.aqssat.co.conf          # إعداد Apache VirtualHost
└── README.md                        # هذا الملف
```

---

## خطوات النشر على السيرفر

### 0) تنظيف بقايا محاولة CloudBeaver السابقة (لو وُجدت)

```bash
# احذف مستخدم cloudbeaver اللي اتعمل في المحاولة السابقة (لو موجود)
sudo userdel cloudbeaver 2>/dev/null || true
sudo rm -rf /opt/cloudbeaver /var/lib/cloudbeaver
sudo rm -f /etc/systemd/system/cloudbeaver.service
sudo systemctl daemon-reload
```

> Java 21 المثبّتة من المحاولة السابقة لن نحتاجها لـ pgweb لكن لا داعي لإزالتها
> (قد تفيد لاحقاً). لو حابب تشيلها: `sudo apt-get autoremove openjdk-21-jre-headless`.

### 1) أضف سجل DNS من نوع A (لو لسه ما عملته)

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

### 2) اسحب آخر تحديث للمستودع على السيرفر

```bash
cd /opt/hotel-app
git pull origin main
ls deployment/pgweb/
# README.md  db.hotel.aqssat.co.conf  install.sh
```

### 3) شغّل سكربت التثبيت

```bash
sudo bash /opt/hotel-app/deployment/pgweb/install.sh
```

السكربت يقوم تلقائياً بـ:
- تثبيت `curl`, `unzip`, `apache2-utils`, `jq`.
- اكتشاف معمارية السيرفر (`amd64` / `arm64`).
- جلب آخر إصدار pgweb من GitHub API.
- تنزيل الباينري وتثبيته في `/usr/local/bin/pgweb`.
- إنشاء مستخدم نظام `pgweb`.
- تسجيل خدمة `systemd` مع تحصينات أمنية كاملة.
- تشغيل الخدمة على `127.0.0.1:8081`.

تحقّق:
```bash
sudo systemctl status pgweb
curl -sI http://127.0.0.1:8081
# المفروض يرجّع: HTTP/1.1 200 OK
```

### 4) أنشئ مستخدم Basic Auth

طبقة حماية إضافية قبل ما يوصل أي طلب لـ pgweb:

```bash
sudo htpasswd -c /etc/apache2/.htpasswd-pgweb admin
# أدخل كلمة مرور قوية (مختلفة عن كل شيء آخر)
```

> ⚠️ استخدم `-c` فقط أول مرة (ينشئ الملف). لإضافة مستخدمين لاحقاً استخدم
> `htpasswd` بدون `-c`.

### 5) عدّل ملف Apache vhost قبل تفعيله

افتح الملف وضع IP الخاص بك. اعرف IPك أولاً:

```bash
# من جهازك المحلي:
curl ifconfig.me
```

ثم:

```bash
sudo cp /opt/hotel-app/deployment/pgweb/db.hotel.aqssat.co.conf \
        /etc/apache2/sites-available/db.hotel.aqssat.co.conf

sudo nano /etc/apache2/sites-available/db.hotel.aqssat.co.conf
# في قسم <RequireAny> أزل التعليق وضع IPك:
#   Require ip 41.234.56.78
```

### 6) فعّل وحدات Apache المطلوبة

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers ssl auth_basic authn_file
```

### 7) أصدر شهادة SSL

أنشئ vhost HTTP بسيط مؤقت لـ certbot:

```bash
sudo tee /etc/apache2/sites-available/db.hotel.aqssat.co-temp.conf > /dev/null <<'CONF'
<VirtualHost *:80>
    ServerName db.hotel.aqssat.co
    DocumentRoot /var/www/html
</VirtualHost>
CONF

sudo a2ensite db.hotel.aqssat.co-temp
sudo apache2ctl configtest && sudo systemctl reload apache2

# أصدر الشهادة
sudo certbot --apache -d db.hotel.aqssat.co \
     --non-interactive --agree-tos -m admin@aqssat.co

# نظّف المؤقت
sudo a2dissite db.hotel.aqssat.co-temp
sudo rm /etc/apache2/sites-available/db.hotel.aqssat.co-temp.conf
```

### 8) فعّل الـ vhost النهائي

```bash
sudo a2ensite db.hotel.aqssat.co
sudo apache2ctl configtest && sudo systemctl reload apache2
```

### 9) أنشئ مستخدمي Postgres محدودي الصلاحيات (موصى به)

بدل ما تستخدم `fakher_user` (له صلاحيات كاملة)، أنشئ مستخدمين خاصين لـ pgweb:

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

> ⚠️ استخدم `fakher_user` فقط عند الحاجة لتعديلات Schema (وهذا نادر — يفترض أن
> يتم عبر Prisma Migrations).

---

## كيف تدخل على pgweb أول مرة؟

### 1) افتح الرابط

من المتصفح:
```
https://db.hotel.aqssat.co
```

سيظهر لك أولاً مربع **HTTP Basic Auth** — أدخل بيانات `admin` التي أنشأتها بـ
`htpasswd` في الخطوة 4.

### 2) شاشة الاتصال بقاعدة البيانات

pgweb سيعرض شاشة Connect. اختار **Standard** واملأ:

| الحقل | القيمة |
|---|---|
| **Host** | `127.0.0.1` |
| **Port** | `5432` |
| **Username** | `cb_readonly` (للاستعراض) أو `cb_editor` (للتعديل) |
| **Password** | كلمة المرور التي اخترتها في الخطوة 9 |
| **Database** | `fakher_hotel` |
| **SSL Mode** | `disable` (الاتصال محلي على نفس السيرفر) |

اضغط **Connect**.

> 💡 لو سجّلت الـ session بـ ✅ "Save session"، تقدر ترجع للاتصال بسرعة من قائمة
> Sessions في الأعلى.

### 3) ابدأ الاستخدام

- **Tables**: تصفّح الجداول من الشريط الجانبي.
- **Rows**: اعرض البيانات وعدّلها بشكل مباشر (لو استخدمت `cb_editor`).
- **SQL Query**: شغّل استعلامات حرّة من تاب SQL.
- **History**: استرجع آخر استعلامات شغّلتها.
- **Export**: حمّل النتائج بصيغ CSV / JSON / XML.
- **Activity**: شوف الاتصالات النشطة على Postgres.
- **Schema**: عاين الـ Indexes / Constraints / Triggers / Sequences.

---

## أوامر إدارية مفيدة

```bash
# حالة الخدمة
sudo systemctl status pgweb

# مشاهدة اللوج المباشر
sudo journalctl -u pgweb -f

# إعادة تشغيل
sudo systemctl restart pgweb

# إيقاف
sudo systemctl stop pgweb

# تعطيل الإقلاع التلقائي
sudo systemctl disable pgweb

# عرض إصدار pgweb المثبت
/usr/local/bin/pgweb --version

# نسخة احتياطية لقاعدة البيانات
sudo pg_dump -U fakher_user -h 127.0.0.1 fakher_hotel \
     > /root/backups/fakher_hotel_$(date +%Y%m%d).sql
```

---

## الترقية لإصدار أحدث من pgweb

أعد تشغيل سكربت التثبيت وهيجلب آخر إصدار تلقائياً:

```bash
cd /opt/hotel-app
git pull origin main
sudo bash deployment/pgweb/install.sh
```

(السكربت يستبدل الباينري ويعيد تشغيل الخدمة بأمان.)

---

## استكشاف الأخطاء

### pgweb لا يقلع
```bash
sudo journalctl -u pgweb -n 200 --no-pager
sudo -u pgweb /usr/local/bin/pgweb --bind=127.0.0.1 --listen=8081 --sessions
# شغّله يدوياً لرؤية الخطأ
```

### Apache يرجّع 502 Bad Gateway
```bash
curl -sI http://127.0.0.1:8081          # هل pgweb يستجيب محلياً؟
sudo systemctl status pgweb
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

### pgweb لا يقدر يتصل بـ Postgres
```bash
# تأكد أن المستخدم موجود وله صلاحيات
sudo -u postgres psql -c "\du cb_readonly"
sudo -u postgres psql -d fakher_hotel -c "\dp" | head

# اختبر الاتصال يدوياً
psql -h 127.0.0.1 -U cb_readonly -d fakher_hotel -c "SELECT 1"
```

### تظهر شاشة Basic Auth بشكل متكرر
```bash
# تأكد أن ملف htpasswd موجود وقابل للقراءة من Apache
sudo ls -l /etc/apache2/.htpasswd-pgweb
# الصلاحيات الموصى بها:
sudo chmod 640 /etc/apache2/.htpasswd-pgweb
sudo chgrp www-data /etc/apache2/.htpasswd-pgweb
```

---

## ملخص الأمان (Defense in Depth)

| الطبقة | الحماية |
|---|---|
| 1. الشبكة | pgweb يستمع على `127.0.0.1` فقط — لا يمكن الوصول له من الإنترنت مباشرة |
| 2. Apache IP whitelist | فقط IPك المعرّف يمر |
| 3. Apache Basic Auth | كلمة مرور قبل الوصول لشاشة pgweb |
| 4. Postgres User | مستخدم محدود الصلاحيات (readonly/editor) — ليس superuser |
| 5. SSL/TLS | كل الاتصالات بين المتصفح والسيرفر مشفّرة (Let's Encrypt) |
| 6. systemd Hardening | `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`, `MemoryDenyWriteExecute`, ... |
| 7. Sessions Mode | pgweb لا يخزّن كلمات مرور قاعدة البيانات على القرص |

---

## مراجع

- المستودع: <https://github.com/sosedoff/pgweb>
- التوثيق: <https://github.com/sosedoff/pgweb/wiki>
- الإصدارات: <https://github.com/sosedoff/pgweb/releases>
