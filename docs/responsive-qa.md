# Responsive QA Matrix — Staff Screens

خطة اختبار يدوي/آلي للتأكّد من أنّ كل شاشة طاقم داخل النظام متجاوبة مع
WCAG 2.2 AA و Apple HIG و Material 3 و ISO 9241-110 على جميع مقاسات
الأجهزة المستهدفة.

## Breakpoints المُختبَرة

| الاسم | العرض (px) | الجهاز المرجعي |
|---|---|---|
| xs | 280 | Galaxy Fold (مغلق) |
| sm | 360 | معظم هواتف أندرويد |
| md | 414 | iPhone 14 Pro Max |
| tablet | 768 | iPad portrait |
| laptop | 1024 | MacBook Air 13" (scaled) |
| desktop | 1280 | لابتوب متوسّط |
| large | 1536 | شاشة 4K مقتطعة |

## Checklist لكلّ صفحة (لكلّ breakpoint)

- [ ] لا overflow أفقي (لا scroll على `<body>`).
- [ ] touch targets ≥ 44×44 CSS px (WCAG 2.5.5/2.5.8).
- [ ] النص الأساسي مقروء بدون zoom (≥ 14px على الموبايل).
- [ ] الأزرار الأساسيّة تظهر ضمن viewport الابتدائي.
- [ ] لا console error/warning (خاصّة hydration).
- [ ] RTL سليم (لا يوجد `pl/pr` بدل `ps/pe`).
- [ ] safe-area-inset-* محترمة على العناصر sticky/fixed.
- [ ] التقارير الماليّة: عمود أوّل sticky + scroll أفقي سلس.

## الصفحات المستهدفة

### Phase 1 — صفحات الجداول (9)

- [ ] `/reservations`
- [ ] `/guests`
- [ ] `/maintenance`
- [ ] `/accounting/cashbook`
- [ ] `/accounting/journal`
- [ ] `/accounting/accounts`
- [ ] `/accounting/parties`
- [ ] `/accounting/ledger`
- [ ] `/accounting/payroll`

### Phase 2 — التقارير الماليّة (5)

- [ ] `/accounting/reports/trial-balance`
- [ ] `/accounting/reports/balance-sheet`
- [ ] `/accounting/reports/income-statement`
- [ ] `/accounting/reports/guest-debts`
- [ ] `/reports/monthly`

تحقّق إضافي:

- [ ] الطباعة (Ctrl+P): العمود الأول لم يعد sticky، لا gradient fade، الصفّ لا يُقطع في منتصف الجدول.
- [ ] الخط مقروء عند الطباعة (≥ 12pt).

### Phase 3 — صفحات التفاصيل والنماذج (7)

- [ ] `/reservations/[id]` (ReservationDetailClient)
- [ ] `/accounting/parties/[id]`
- [ ] `/accounting/journal/[id]`
- [ ] `/accounting/payroll/[partyId]`
- [ ] `/reservations/new`
- [ ] `/profile`
- [ ] `/settings/whatsapp/notifications`

تحقّق إضافي:

- [ ] `<ActionBar variant="sticky-mobile">` يظهر ثابتاً أسفل الشاشة على `< md`.
- [ ] حقول الأرقام تفتح keypad رقمي (`inputmode="numeric"`).

### Phase 4 — Chat/WhatsApp (4)

- [ ] `/chat`
- [ ] `/chat/[conversationId]`
- [ ] `/whatsapp`
- [ ] `/whatsapp/phonebook`

تحقّق إضافي:

- [ ] على `< md`: إمّا القائمة وإمّا الخيط، وزر "رجوع" موجود.
- [ ] ارتفاع المحادثة يستخدم `dvh - env(safe-area-inset-bottom)` بحيث لا يُخفي الـ keyboard حقل الإدخال.

### Phase 5 — Card-grid + Settings (11)

- [ ] `/rooms`
- [ ] `/tasks`
- [ ] `/settings/unit-types`
- [ ] `/accounting`
- [ ] `/settings`
- [ ] `/settings/booking`
- [ ] `/settings/prices`
- [ ] `/settings/roles`
- [ ] `/settings/whatsapp`
- [ ] `/settings/unit-merges`
- [ ] `/accounting/periods`

تحقّق إضافي:

- [ ] شبكة البطاقات تستخدم `repeat(auto-fit, minmax(...))` — عدد الأعمدة ينمو تلقائيّاً مع العرض.
- [ ] شريط التبويبات (booking) يدعم scroll أفقي على الموبايل.

## التشغيل اليدوي

1. شغّل الخادم: `npm run dev` (localhost:3001).
2. افتح Chrome DevTools → Toggle device toolbar (Ctrl+Shift+M).
3. اختر "Responsive" وجرّب العروض أعلاه.
4. على كلّ breakpoint:
   - تحقّق من Checklist العام + Checklist الخاص بالمرحلة.
   - سجّل أي ملاحظة هنا.

## أتمتة (اختياري)

إن تمّ تثبيت Playwright:

```bash
npm i -D @playwright/test
npx playwright install
```

يمكن توليد lقطات أساسيّة عبر سكربت مخصّص يمرّ على قائمة المسارات
والعروض أعلاه ويحفظ screenshots في `tests/responsive/baseline/`.

## حالة التنفيذ

| Phase | الحالة |
|---|---|
| 0 — Primitives + globals tokens | ✓ |
| 0.1 — Sidebar hydration fix | ✓ |
| 1 — Data-table cluster (9) | ✓ |
| 2 — Report cluster (5) + print CSS | ✓ |
| 3 — Detail + forms + ActionBar | ✓ |
| 4 — Chat/WhatsApp master-detail | ✓ |
| 5 — Card-grid + Settings | ✓ |
| 6 — QA matrix (هذا الملف) | ✓ (توثيق + نقاط تحقّق) |

## ملاحظات

- `browser_resize` في Cursor MCP لا يصل إلى 280/360 بدقّة — استخدم Chrome DevTools يدويّاً
  أو Playwright عند الحاجة لقطات مرجعية.
- الصفحات العامّة (`/book/*`, `/landing`, `/login`, ...) خارج نطاق هذا المشروع.
