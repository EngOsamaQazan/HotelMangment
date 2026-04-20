# خطة نشر mafhotel.com — النشر الاحترافي

> **آخر تحديث:** 2026-04-20
> **الوضع:** قيد التنفيذ
> **المسؤول:** Agent + User
> **الأهداف:** Zero-downtime deploys, isolation, observability, auto-recovery, CI/CD

---

## 1 · ملخّص القرارات المعمارية

| القرار | الاختيار | السبب |
|---|---|---|
| **Domain** | `mafhotel.com` + `www.mafhotel.com` | — |
| **موقع الكود** | `/opt/mafhotel.com/` | معيار FHS لتطبيقات self-contained |
| **مستخدم النظام** | `mafhotel` (no shell login) | عزل أمني من `root` و `www-data` |
| **Node.js** | v24.15 via **nvm** (تحت مستخدم mafhotel) | معزول، سهل التحديث، لا يتضارب مع النظام |
| **Process manager** | **systemd** native (لا pm2) | overhead صفر، logs موحّدة، restart تلقائي |
| **Database** | PostgreSQL 15 الموجود (لم يُمَس) | سريع، native، جاهز |
| **Reverse proxy** | Apache 2.4 الموجود | نفس pattern المواقع الأخرى، SSL management موحّد |
| **SSL** | Let's Encrypt via certbot (HTTP-01) | مجاني، auto-renew |
| **CI/CD** | GitHub Actions + SSH deploy key | push-to-deploy، بدون تدخّل يدوي |
| **Zero-downtime** | بنية releases + symlink | rollback فوري بتغيير symlink |

---

## 2 · بنية المجلدات على السيرفر

```
/opt/mafhotel.com/                          # root directory (owner: mafhotel:mafhotel, 750)
├── current -> releases/20260420-220000/    # symlink → release نشط
├── releases/                               # تاريخ الإصدارات (نحفظ آخر 5)
│   ├── 20260420-220000/                    # release بتاريخه
│   │   ├── .next/                          # build output
│   │   ├── node_modules/
│   │   ├── src/
│   │   ├── package.json
│   │   └── .env -> ../../shared/.env       # symlink للسرية
│   └── 20260419-153000/
├── shared/                                 # data persistent بين releases
│   ├── .env                                # سري (chmod 600, owner mafhotel)
│   ├── logs/
│   │   ├── app.log
│   │   └── realtime.log
│   └── uploads/                            # user uploads (persistent)
└── .nvm/                                   # nvm installation (user-scoped)
```

**السبب:** هذه البنية هي **Capistrano-style** المعيارية — تستخدمها GitHub وGitLab وكل deployment tools.

---

## 3 · الطوبولوجيا الشبكية

```
Client (https://mafhotel.com)
        │
        ▼
  [443] Apache (SSL termination, gzip, http2)
        │
        ▼ ProxyPass
  [3000] Next.js (systemd: mafhotel-app.service)
        │
        ▼
  [5432] PostgreSQL (localhost only, DB: mafhotel)

  [3001] Realtime server (systemd: mafhotel-realtime.service)
   ↑     (WebSocket upgrade من Apache)
   └──── Apache ProxyPass /realtime → localhost:3001
```

**المنافذ المفتوحة خارجياً (UFW):** 22 (SSH) + 80 (HTTP→HTTPS redirect) + 443 (HTTPS) + 10000 (webmin). **لا يوجد 3000/3001 مكشوفة للعالم.**

---

## 4 · خطة التنفيذ (14 خطوة)

### Phase D — Deploy Pipeline

| # | المهمة | التبعية | المدة المتوقعة |
|---|---|---|---|
| D1 | [المستخدم] تحديث DNS على GoDaddy | — | 1-10 دقيقة (للانتشار) |
| D2 | إنشاء مستخدم `mafhotel` + بنية `/opt/mafhotel.com/` | — | 2 دقيقة |
| D3 | nvm + Node v24.15 | D2 | 3-5 دقائق |
| D4 | إنشاء DB `mafhotel` + user `mafhotel_user` + استرداد من dump | — | 2 دقيقة |
| D5 | كتابة `shared/.env` بقيم إنتاج | D4 | 2 دقيقة |
| D6 | systemd units (app + realtime) | D2 | 3 دقائق |
| D7 | Apache vhost HTTP على :80 | — | 2 دقيقة |
| D8 | first deploy: git clone + build + start | D2-D7 | 5-10 دقائق |
| D9 | التحقق من DNS | D1 | تلقائي (loop) |
| D10 | certbot لـ `mafhotel.com` + `www` | D9 | 1-2 دقيقة |
| D11 | تفعيل HTTPS vhost + redirect | D10 | 2 دقيقة |
| D12 | SSH deploy key + GitHub secrets | — | 3 دقائق |
| D13 | `.github/workflows/deploy.yml` | D12 | 5 دقائق |
| D14 | Smoke test شامل | الكل | 5 دقائق |

**الإجمالي:** ~30-45 دقيقة عمل فعلي (بعد انتشار DNS).

---

## 5 · Node v24.15 — ملاحظة

- Node 24 حاليًا **Current** (ليس LTS). يصبح LTS في أكتوبر 2026.
- تم اختياره لأن المطوّر يستخدمه محليًا (تطابق بيئة dev مع prod).
- سنثبّته عبر `nvm` ليسهل الانتقال إلى LTS لاحقًا (`nvm install 22 && nvm alias default 22`).

---

## 6 · systemd Unit Template

```ini
# /etc/systemd/system/mafhotel-app.service
[Unit]
Description=MafHotel Next.js application
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=mafhotel
Group=mafhotel
WorkingDirectory=/opt/mafhotel.com/current
EnvironmentFile=/opt/mafhotel.com/shared/.env
ExecStart=/opt/mafhotel.com/.nvm/versions/node/v24.15.0/bin/node node_modules/.bin/next start -p 3000
Restart=always
RestartSec=5
StartLimitBurst=3
StandardOutput=append:/opt/mafhotel.com/shared/logs/app.log
StandardError=append:/opt/mafhotel.com/shared/logs/app.log

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/mafhotel.com/shared /opt/mafhotel.com/releases
ProtectHome=true

# Resource limits
MemoryMax=1536M
CPUQuota=80%

[Install]
WantedBy=multi-user.target
```

---

## 7 · Apache vhost (HTTPS بعد certbot)

```apache
# /etc/apache2/sites-available/mafhotel.com.conf
<VirtualHost *:80>
    ServerName mafhotel.com
    ServerAlias www.mafhotel.com
    RewriteEngine On
    RewriteRule ^/?(.*) https://mafhotel.com/$1 [R=301,L]
</VirtualHost>

# /etc/apache2/sites-available/mafhotel.com-le-ssl.conf
<VirtualHost *:443>
    ServerName mafhotel.com
    ServerAlias www.mafhotel.com

    # Redirect www → apex (بعد SSL)
    RewriteEngine On
    RewriteCond %{HTTP_HOST} ^www\. [NC]
    RewriteRule ^(.*)$ https://mafhotel.com$1 [R=301,L]

    # Reverse proxy to Next.js
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/

    # WebSocket upgrade for realtime
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /realtime/(.*) ws://127.0.0.1:3001/$1 [P,L]
    ProxyPass /realtime http://127.0.0.1:3001
    ProxyPassReverse /realtime http://127.0.0.1:3001

    # SSL (certbot managed)
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/mafhotel.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/mafhotel.com/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf

    # Security headers
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"

    ErrorLog ${APACHE_LOG_DIR}/mafhotel.com-error.log
    CustomLog ${APACHE_LOG_DIR}/mafhotel.com-access.log combined
</VirtualHost>
```

---

## 8 · GitHub Actions Workflow (مختصر)

```yaml
# .github/workflows/deploy.yml
name: Deploy to mafhotel.com
on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24' }
      - run: npm ci
      - run: npm run build
      - name: Deploy via SSH
        env:
          SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          SSH_HOST: ${{ secrets.DEPLOY_HOST }}
        run: |
          mkdir -p ~/.ssh && echo "$SSH_KEY" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan "$SSH_HOST" >> ~/.ssh/known_hosts
          TS=$(date +%Y%m%d-%H%M%S)
          RELEASE="/opt/mafhotel.com/releases/$TS"
          # Transfer code
          rsync -az --delete \
            --exclude='.git' --exclude='node_modules' --exclude='.next/cache' \
            -e "ssh -i ~/.ssh/id_ed25519" \
            ./ mafhotel@$SSH_HOST:$RELEASE/
          # Activate release
          ssh -i ~/.ssh/id_ed25519 mafhotel@$SSH_HOST bash -s << EOF
            cd $RELEASE
            ln -sfn /opt/mafhotel.com/shared/.env .env
            source /opt/mafhotel.com/.nvm/nvm.sh
            npm ci --omit=dev
            npm run build
            ln -sfn $RELEASE /opt/mafhotel.com/current
            sudo systemctl restart mafhotel-app mafhotel-realtime
            # Cleanup old releases (keep last 5)
            ls -1dt /opt/mafhotel.com/releases/*/ | tail -n +6 | xargs rm -rf
          EOF
          # Health check
          for i in 1 2 3 4 5; do
            sleep 3
            curl -fsS https://mafhotel.com/api/health && exit 0
          done
          exit 1
```

---

## 9 · المخاطر والتخفيف

| الخطر | التخفيف |
|---|---|
| Deploy يكسر الإنتاج | Health check بعد deploy + rollback فوري عبر symlink |
| نفاد مساحة القرص من releases | cleanup تلقائي (آخر 5 releases فقط) |
| تسرّب `.env` إلى git | شرط `.gitignore` + تخزين في `shared/` خارج release |
| Memory leak في Node | `MemoryMax=1536M` في systemd → restart تلقائي |
| فشل certbot renewal | `certbot renew --dry-run` منتظم + webhook تنبيه |
| DB migration تفشل | `prisma migrate deploy` في deploy script مع rollback on failure |
| SSH key يتسرّب | key مخصص للـ deploy فقط + forced command + IP restriction |

---

## 10 · Post-deploy checks

- [ ] `https://mafhotel.com` يرجع 200
- [ ] `https://www.mafhotel.com` يعيد توجيه (301) لـ apex
- [ ] `http://mafhotel.com` يعيد توجيه (301) لـ HTTPS
- [ ] `curl -I https://mafhotel.com` يُظهر `Strict-Transport-Security`
- [ ] تسجيل الدخول بالحساب الموجود يعمل
- [ ] WebSocket realtime يتصل (`/realtime/*`)
- [ ] `systemctl status mafhotel-app mafhotel-realtime` = active
- [ ] `journalctl -u mafhotel-app -n 50` = لا errors
- [ ] اختبار rollback: تغيير symlink لـ release سابق + restart
- [ ] مواقع PHP (admin, jadal, namaa, …) ما زالت تعمل 100%
