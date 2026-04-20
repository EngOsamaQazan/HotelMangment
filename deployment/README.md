# ملفات النشر

هذا المجلد يحوي ملفات إعداد البنية التحتية للإنتاج.

```
deployment/
├── apache/                  # ✅ المستخدم حالياً على السيرفر الإنتاجي
│   ├── hotel.aqssat.co-le-ssl.conf
│   └── README.md
├── pgweb/                   # 🛢️ واجهة ويب لإدارة قاعدة البيانات (بدون Docker)
│   ├── install.sh
│   ├── db.hotel.aqssat.co.conf
│   └── README.md
└── nginx/                   # ⚠️ غير مستخدم حالياً (مرجع احتياطي)
    └── nginx.conf
```

الإعداد الفعلي للإنتاج يستخدم **Apache + PM2** (بدون Docker). راجع الدليل الكامل:
[`../docs/DEPLOY.md`](../docs/DEPLOY.md)

لإعداد واجهة إدارة قاعدة البيانات (pgweb) راجع:
[`./pgweb/README.md`](./pgweb/README.md)
