# ملفات النشر

هذا المجلد يحوي ملفات إعداد البنية التحتية للإنتاج.

```
deployment/
├── apache/              # ✅ المستخدم حالياً على السيرفر الإنتاجي
│   ├── hotel.aqssat.co-le-ssl.conf
│   └── README.md
└── nginx/               # ⚠️ غير مستخدم حالياً (مرجع احتياطي)
    └── nginx.conf
```

الإعداد الفعلي للإنتاج يستخدم **Apache + PM2** (بدون Docker). راجع الدليل الكامل:
[`../docs/DEPLOY.md`](../docs/DEPLOY.md)
