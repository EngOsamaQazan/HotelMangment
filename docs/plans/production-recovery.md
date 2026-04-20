# خطة استرداد الإنتاج — Hotel Management System

> وثيقة خطة متكاملة لاستعادة موقع `https://hotel.aqssat.co` بعد تعطّله الكامل، تحتوي على: الـ Context، التشخيص، خطوات التنفيذ بالترتيب، معايير النجاح، وخطة منع التكرار.

---

## 1. نظرة عامة على النظام (Context)

| العنصر | القيمة |
|---|---|
| المشروع | نظام إدارة فندق (Next.js 16 + TypeScript) |
| الـ Stack | Prisma + PostgreSQL، Next-Auth، Socket.IO microservice منفصل |
| الريبو | https://github.com/EngOsamaQazan/HotelMangment |
| الموقع | https://hotel.aqssat.co |
| السيرفر | Contabo VPS — IP `31.220.82.115` — Debian |
| مستخدم SSH | `osama` |
| مسار التطبيق | `/opt/hotel-app` |
| Entry point | `.next/standalone/server.js` (Next.js standalone output) |
| المنافذ الداخلية | Next.js `127.0.0.1:3000` • Socket.IO `127.0.0.1:3001` |
| Reverse proxy | Apache2 |
| DNS | `hotel.aqssat.co` و `db.hotel.aqssat.co` → نفس الـ IP |

---

## 2. التشخيص الحالي (Problem Statement)

تراكبت ثلاث مشاكل أدّت لانهيار الموقع بالكامل، سنحلّها بالترتيب العكسي للأولوية (من الأعمق للأسطح):

### 🔴 المشكلة #3 — البنيوية: SSH مقفول

- كل بورتات SSH (22, 2222, 22222, 2200) ترجع `TcpTestSucceeded=False` من جهاز المستخدم المحلي.
- نفس الظاهرة على GitHub Actions runners → كل deploys `#44` و `#45` تفشل بـ `exit code 1` بعد `1m 19s` ثابتة (مؤشر timeout في SSH handshake).
- Ping ينجح → السيرفر حي لكن SSH daemon أو firewall يحجب.
- **السبب المُرجَّح:** `ufw` / `iptables` / `sshd` أُغلقت بعد تثبيت `pgweb` (`deployment/pgweb/install.sh`) أو بسبب IP whitelist خاطئ.
- **ملاحظة مهمة:** المستخدم اكتشف أن جهازه المحلي تحديداً قد يكون السبب في بعض الحالات، لذلك إذا كنت تعمل من جهاز/شبكة أخرى جرّب SSH مباشرة أولاً.

### 🟠 المشكلة #2 — pm2 process مات

- الموقع حالياً يرد `503 Service Unavailable`.
- Apache2 شغّال لكن upstream Node على `127.0.0.1:3000` down.
- حتى لو أصلحنا SSH، لن يعود الموقع إلا بعد إحياء `hotel-app` في pm2.

### 🟡 المشكلة #1 — Static files ترجع 500 (الأصلية)

- كل طلبات `/_next/static/chunks/*.js`, `*.css`, `*.woff2` و `/logo.png` ترجع:
  ```http
  HTTP/1.1 500 Internal Server Error
  Content-Type: text/plain
  Content-Length: 21
  ETag: "66fci67lppl"
  Body: Internal Server Error
  ```
- نفس الـ ETag و body length لكل الطلبات → الرد مُوحَّد من Node نفسه (ليس Apache).
- صفحات HTML تعمل (login يرسم و يرجع `307 redirect`).
- **السبب الأرجح:**
  - `.next/standalone/.next/static/` و/أو `.next/standalone/public/` مفقودة أو فارغة أو غير قابلة للقراءة.
  - أو pm2 شغّال من CWD خاطئ فلا يجد الملفات النسبية.

---

## 3. ما تم فعله حتى الآن (Timeline)

| الكوميت | الحالة | الوصف |
|---|---|---|
| `f206c31` | قبل الكسر | `feat(infra): replace CloudBeaver with pgweb` — أضاف `deployment/pgweb/` — **مشتبه به رئيسي في كسر SSH** |
| `6afb7b8` | محاولة إصلاح | `fix(deploy): harden static asset copy + force pm2 cwd` — أضاف assertions و `pm2 delete` صريح |
| `82b5522` | HEAD حالياً | `chore(deploy): verbose step-by-step deploy` — deploy workflow verbose مع exit codes مميزة لكل خطوة |
| Deploy `#44`, `#45` | فشل | timeout ثابت على `1m 19s` — مؤشر SSH handshake fail |

**تعديلات غير مرفوعة في working tree:**
- `package.json` + `package-lock.json`: ترقية `xlsx` من `^0.18.5` إلى tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
- مجلد `deployment/pgweb/` قد يكون untracked محلياً.

---

## 4. الملفات المرجعية

قبل البدء، افحص:

- `.github/workflows/deploy.yml` — سكريبت النشر (النسخة verbose)
- `next.config.ts` — يستخدم `output: "standalone"` + `NO_STORE_HEADERS`
- `deploy/hotel.aqssat.co-le-ssl.conf` — Apache vhost للموقع الرئيسي
- `deployment/pgweb/install.sh` — سكريبت تثبيت pgweb (مشتبه به)
- `deployment/pgweb/db.hotel.aqssat.co.conf` — Apache vhost لـ pgweb
- `realtime/ecosystem.config.cjs` — pm2 config لـ Socket.IO

---

## 5. خطة التنفيذ بالترتيب

### المرحلة 0 — تحضير الأدوات المحلية (5 دقائق)

```powershell
# تحقق من الوصول للسيرفر
Test-NetConnection -ComputerName hotel.aqssat.co -Port 22
Test-NetConnection -ComputerName hotel.aqssat.co -Port 443
ping hotel.aqssat.co
```

- إذا `Port 22 = True` → انتقل للمرحلة 2 مباشرة.
- إذا `Port 22 = False` → انتقل للمرحلة 1 عبر Contabo Console.

---

### المرحلة 1 — استعادة الوصول (SSH) عبر Contabo VNC

**مطلوب من المستخدم:** تسجيل دخول https://my.contabo.com/ وفتح VNC/Web Console.

```bash
# داخل VNC console
# 1) افحص حالة sshd
systemctl status sshd
journalctl -u sshd --since "24 hours ago" | tail -50

# 2) افحص الجدار الناري
ufw status verbose
iptables -L -n -v | head -50
fail2ban-client status sshd 2>/dev/null

# 3) إصلاح sshd + ufw
systemctl enable --now sshd
ufw allow OpenSSH
ufw allow 22/tcp
ufw reload

# 4) إذا fail2ban حظر IPs
fail2ban-client set sshd unbanip <YOUR_IP>

# 5) تأكد أن sshd يستمع
ss -tlnp | grep :22
```

**معيار الخروج:** `Test-NetConnection ... -Port 22` من جهاز المستخدم أو GitHub Actions runner يرجع `True`.

---

### المرحلة 2 — تشخيص حالة التطبيق على السيرفر

```bash
ssh osama@hotel.aqssat.co
cd /opt/hotel-app

# (2.1) حالة pm2
pm2 list
pm2 show hotel-app || echo "hotel-app not in pm2"
pm2 logs hotel-app --lines 100 --nostream

# (2.2) Build artefacts
ls -la .next/standalone/server.js
ls -la .next/standalone/.next/static/ 2>&1 | head
ls -la .next/standalone/public/ 2>&1 | head
ls -la .next/static/ 2>&1 | head

# (2.3) موارد النظام
df -h /opt
free -h

# (2.4) Apache + تجربة upstream Node
systemctl status apache2 --no-pager | head -20
curl -sI http://127.0.0.1:3000/ 2>&1 | head
curl -sI http://127.0.0.1:3000/logo.png 2>&1 | head
```

**سجّل نتائج كل خطوة قبل الانتقال** — هذا يحدد مسار الحل لاحقاً.

---

### المرحلة 3 — إحياء pm2 للرد على الطلبات (حل المشكلة #2)

```bash
cd /opt/hotel-app

# (3.1) تنظيف أي instance قديم
pm2 delete hotel-app 2>/dev/null || true

# (3.2) تشغيل جديد مع ضمان CWD صحيح
PORT=3000 HOSTNAME=0.0.0.0 pm2 start .next/standalone/server.js \
  --name hotel-app \
  --cwd /opt/hotel-app

pm2 save
sleep 3

# (3.3) اختبار سريع
curl -sI http://127.0.0.1:3000/
curl -sI https://hotel.aqssat.co/
```

**إذا فشل `pm2 start`:**
```bash
pm2 logs hotel-app --lines 50 --nostream
# أسباب شائعة:
# - .env مفقود في .next/standalone/   → cp .env .next/standalone/.env
# - node_modules ناقصة                  → npm ci
# - standalone build قديم/تالف          → npm run build
```

**معيار الخروج:**
- `curl -sI http://127.0.0.1:3000/` يرجع `307` أو `200`.
- `pm2 list` يبيّن `hotel-app` بحالة `online`.

---

### المرحلة 4 — إصلاح static files 500 (حل المشكلة #1)

```bash
# (4.1) معرفة المستخدم الذي يشغّل pm2
ps -ef | grep "node .*standalone/server.js" | grep -v grep

# (4.2) فحص permissions على سلسلة المسار كاملة
namei -l /opt/hotel-app/.next/standalone/.next/static/
namei -l /opt/hotel-app/.next/standalone/public/logo.png

# (4.3) فحص CWD الفعلي للبروسيس
ls -la /proc/$(pgrep -f "standalone/server.js")/cwd
```

**إذا الملفات مفقودة أو الـ permissions خاطئة:**

```bash
cd /opt/hotel-app

# (4.4) إعادة build من الصفر
npm ci
npm run build

# (4.5) assertions
test -f .next/standalone/server.js || { echo "❌ STANDALONE BUILD MISSING"; exit 1; }
test -d .next/static                || { echo "❌ STATIC DIR MISSING"; exit 1; }

# (4.6) نسخ الأصول داخل standalone
rm -rf .next/standalone/public .next/standalone/.next/static
cp -r public             .next/standalone/public
cp -r .next/static       .next/standalone/.next/static
cp .env                  .next/standalone/.env

# (4.7) إصلاح permissions (استبدل www-data بالمستخدم من 4.1)
chown -R osama:osama .next/standalone
chmod -R u+rX        .next/standalone

# (4.8) restart
pm2 restart hotel-app
sleep 3

# (4.9) اختبار نهائي
curl -sI http://127.0.0.1:3000/logo.png
FIRST_CHUNK=$(ls .next/standalone/.next/static/chunks/ | head -1)
curl -sI "http://127.0.0.1:3000/_next/static/chunks/$FIRST_CHUNK"
```

**معيار الخروج:** كلا الـ `curl` يرجعان `200 OK` مع `Content-Type` صحيح.

---

### المرحلة 5 — تحقيق جذري (Root Cause Analysis)

لمنع تكرار المشكلة، نحتاج فهم لماذا انكسر SSH و لماذا اختفت static files:

```bash
# (5.1) timeline آخر تعديلات في standalone
ls -lat /opt/hotel-app/.next/standalone/ | head -20
ls -lat /opt/hotel-app/.next/standalone/.next/static/ | head -20

# (5.2) آخر جلسات و عمليات
last -n 30
journalctl --since "48 hours ago" | grep -Ei "sshd|ufw|iptables|fail2ban|pgweb" | tail -100

# (5.3) حالة الفايرول الحالية + القواعد
ufw status verbose
iptables -S
fail2ban-client status 2>/dev/null

# (5.4) فحص سكريبت pgweb — هل هو من كسر SSH؟
cat deployment/pgweb/install.sh
grep -Ei "ufw|iptables|sshd|port" deployment/pgweb/install.sh
```

**قم بتوثيق النتائج في `docs/plans/production-recovery-rca.md`.**

---

### المرحلة 6 — اعتماد deploy workflow التالي

بعد عودة SSH، ادفع أي تغييرات أو أعد تشغيل آخر deploy:

```bash
# من جهاز المستخدم
gh run rerun 24671090267 --repo EngOsamaQazan/HotelMangment
gh run watch --repo EngOsamaQazan/HotelMangment
```

- بما أن `set -x` و `echo "===== STEP: ..."` مفعّلة في workflow، ستظهر الخطوة المسببة للفشل بوضوح.
- إذا الـ run ينجح → المشكلة كانت SSH فقط.
- إذا الـ run يفشل في خطوة بناء/نسخ → ارجع للمرحلة 4.

---

### المرحلة 7 — (اختياري) دفع التعديلات المعلّقة

```bash
# من جهاز المستخدم
cd c:\Users\PC\Desktop\FakherHotelBasic\hotel-app
git status
git diff package.json package-lock.json

# تحديث xlsx إلى tarball مباشر
git add package.json package-lock.json
git commit -m "chore(deps): upgrade xlsx to 0.20.3 via sheetjs tarball"

# مراجعة deployment/pgweb/ إذا كان untracked
git status deployment/pgweb/

git push
```

---

## 6. معايير النجاح (Definition of Done)

- [ ] `curl -sI https://hotel.aqssat.co/` → `307` redirect
- [ ] `curl -sI https://hotel.aqssat.co/logo.png` → `200 OK` + `Content-Type: image/png`
- [ ] `curl -sI https://hotel.aqssat.co/_next/static/chunks/<أي ملف>` → `200 OK` + `Content-Type` صحيح
- [ ] المتصفح يفتح صفحة login بـ CSS و JS كاملاً
- [ ] تسجيل الدخول بـ `admin@fakher.jo / admin123` يعمل
- [ ] `pm2 list` يُظهر `hotel-app` = `online` و `hotel-realtime` = `online`
- [ ] deploy التالي على GitHub Actions ينجح
- [ ] (اختياري) RCA موثّقة في `docs/plans/production-recovery-rca.md`

---

## 7. معلومات حسّاسة قد نحتاجها من المستخدم

**لا تطلبها دفعة واحدة — اطلب كل واحدة فقط عند الحاجة:**

| عند الخطوة | المعلومة |
|---|---|
| المرحلة 1 | وصول Contabo Console (لو SSH مقفول) |
| المرحلة 2 | باسوورد SSH للمستخدم `osama` (لو ما في SSH key) |
| المرحلة 6 | GitHub PAT لـ `gh` CLI (لو مش مسجّل دخول) |

---

## 8. مبادئ العمل

1. **تنفيذ تدريجي:** أمر واحد أو سكريبت قصير في كل مرة، مع فحص الـ output قبل الخطوة التالية.
2. **لا `set -e` في التشخيص:** استخدم `|| true` أو exit codes مميزة حتى لا تنقطع السكريبتات في المنتصف.
3. **اختبر بعد كل تعديل:** بعد كل `pm2 restart` أو تعديل deploy، اعمل `curl -sI` قبل الانتقال.
4. **تحقق من الاتصال أولاً:** قبل أي أمر SSH، `Test-NetConnection` (PowerShell) أو `nc -vz host port`.
5. **سجّل كل شيء:** احتفظ بـ output كل أمر لأنه قد يكشف السبب الجذري لاحقاً.

---

## 9. مخطط الاعتماديات (Dependency Graph)

```
[المرحلة 0: تحقق محلي]
          │
          ▼
[المرحلة 1: VNC + إصلاح SSH]  ← بلوكر لكل ما بعده
          │
          ▼
[المرحلة 2: تشخيص pm2/build]
          │
          ▼
[المرحلة 3: إحياء pm2]  → الموقع يرد HTML
          │
          ▼
[المرحلة 4: إصلاح static 500]  → الموقع يعمل كاملاً
          │
          ▼
[المرحلة 5: RCA]  ← منع التكرار
          │
          ▼
[المرحلة 6: deploy workflow]  → أتمتة مستقرة
          │
          ▼
[المرحلة 7: دفع تغييرات معلّقة]  (اختياري)
```

---

## 10. ملاحظات ختامية

- الخطة مصمّمة لتكون **قابلة للاستئناف من أي مرحلة** إذا توقفت الجلسة.
- بعد انتهاء كل مرحلة، حدّث checklist في القسم 6.
- إذا ظهرت مشكلة غير متوقعة (مثلاً database migrations فشلت)، وثّقها كمشكلة #4 وأضف مرحلة جديدة قبل متابعة الباقي.
