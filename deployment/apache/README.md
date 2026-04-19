# إعداد Apache للسيرفر الإنتاجي

هذا الملف يحتوي على الـ VirtualHost الخاص بموقع `hotel.aqssat.co` على السيرفر الإنتاجي.

## لماذا يوجد هنا؟

الإعداد العام للسيرفر في `/etc/apache2/conf-available/tayseer-performance.conf`
يضيف كاش افتراضي لمدة شهر لجميع المحتوى (`ExpiresDefault "access plus 1 month"`)،
وهذا كان يسبب مشكلة في تطبيق الفندق: متصفح Chrome كان يحتفظ بردود `/api/*`
القديمة مخبأة لمدة 30 يوماً، فلا تظهر البيانات الجديدة حتى بعد تحديث الصفحة.

الحل: تجاوز إعدادات الكاش لمسار `/api/*` و `_next/data/*` والصفحات الديناميكية
داخل VirtualHost الخاص بـ `hotel.aqssat.co` فقط، دون المساس بالمواقع الأخرى
على نفس السيرفر.

## مكان الملف على السيرفر

```
/etc/apache2/sites-available/hotel.aqssat.co-le-ssl.conf
```

## كيفية التحديث يدوياً

```bash
# ارفع نسخة احتياطية
cp /etc/apache2/sites-available/hotel.aqssat.co-le-ssl.conf \
   /etc/apache2/sites-available/hotel.aqssat.co-le-ssl.conf.bak.$(date +%Y%m%d_%H%M%S)

# انسخ الإعداد الجديد
cp hotel.aqssat.co-le-ssl.conf /etc/apache2/sites-available/

# اختبر ثم أعد التحميل
apache2ctl configtest && systemctl reload apache2

# تأكد من الاستجابة
curl -sI https://hotel.aqssat.co/api/rooms | grep -i cache-control
# يجب أن ترى: Cache-Control: no-store, no-cache, must-revalidate, max-age=0
```
