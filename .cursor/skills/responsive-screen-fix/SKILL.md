---
name: responsive-screen-fix
description: Make any page fully responsive across all screen sizes (mobile, tablet, desktop, large). Use when fixing responsive layout, adjusting for small screens, making tables scroll on mobile, fixing overflow, adapting cards/grids/forms for all devices, or when user says "اضبط الاستجابة" or "responsive" or "الشاشة مش مظبوطة على الجوال". Works with Bootstrap 3/4/5, Yii2, AdminLTE, Vuexy, and any CSS framework.
---

# Responsive Screen Fix — All Screen Sizes

## When to Use

- User says "اضبط الاستجابة" / "responsive" / "الشاشة مكسورة على الجوال"
- Any page overflows horizontally on mobile
- Tables break out of container on small screens
- Cards/grids don't stack on mobile
- Forms are too wide on phone screens
- Modal content overflows on tablet
- Dashboard widgets overlap or break layout
- Filter/search forms cause horizontal scroll
- Select2 dropdowns overflow their containers

## Breakpoint Reference

| Name | Width | Devices |
|------|-------|---------|
| XS | `< 576px` | Phones (portrait) |
| SM | `576–767px` | Phones (landscape), small tablets |
| MD | `768–991px` | Tablets |
| LG | `992–1199px` | Laptops, small desktops |
| XL | `1200–1399px` | Desktops |
| XXL | `≥ 1400px` | Large monitors |

## Step-by-Step Process

### Step 1: Audit the Page

Before writing CSS, identify what breaks:

1. Check for horizontal overflow: elements wider than viewport
2. Check tables: do they overflow or need horizontal scroll?
3. Check grids/cards: do they stack on mobile?
4. Check fonts: are they readable on small screens?
5. Check buttons/actions: are they tappable (min 44x44px)?
6. Check modals: do they fit on mobile?
7. Check navigation/sidebar: does it collapse?
8. Check filter/search form: do dropdowns overflow?

### Step 2: Apply Fixes by Component Type

---

#### **No-Horizontal-Scroll Filter Form Pattern** (CRITICAL)

This is the proven pattern from judiciary/index that eliminates horizontal scrolling on filter forms. It uses **flexbox** instead of CSS grid, with min/max width constraints that naturally wrap to fit any viewport.

##### Why Flex Instead of Grid for Filters?

- CSS Grid with fixed columns (e.g. `repeat(4, 1fr)`) creates rigid layouts that may cause overflow on intermediate screen sizes
- Flexbox with `flex-wrap: wrap` and `min-width`/`max-width` creates fluid layouts that naturally adapt
- Items flow to the next row automatically when they can't fit

##### CSS Pattern — Filter Row

```css
.filter-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.filter-row:last-child {
  margin-bottom: 0;
}

.filter-col {
  flex: 1;
  min-width: 120px;
  max-width: 220px;
}
.filter-col-wide {
  flex: 1.5;
  min-width: 160px;
  max-width: 280px;
}

.filter-col .form-group,
.filter-col-wide .form-group {
  margin-bottom: 0;
}
.filter-col label,
.filter-col-wide label {
  font-size: 10px;
  color: var(--clr-text-muted, #64748B);
  font-weight: 600;
  margin-bottom: 2px;
  letter-spacing: .3px;
}
.filter-col .form-control,
.filter-col-wide .form-control {
  font-size: 12px !important;
  height: 32px;
  padding: 4px 8px;
  border-radius: 6px;
}
```

##### Select2 — Compact, No Overflow

```css
.filter-col .select2-container,
.filter-col-wide .select2-container {
  font-size: 12px !important;
  width: 100% !important;
}
.filter-col .select2-container .select2-selection--single,
.filter-col-wide .select2-container .select2-selection--single {
  height: 32px !important;
  min-height: 32px !important;
  border-radius: 6px !important;
}
.filter-col .select2-container .select2-selection--single .select2-selection__rendered,
.filter-col-wide .select2-container .select2-selection--single .select2-selection__rendered {
  line-height: 30px !important;
  font-size: 12px !important;
  padding-right: 8px !important;
}
.select2-container--open {
  z-index: 99999 !important;
}
```

##### Search Actions Row

```css
.search-actions {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  min-width: 130px;
}
.search-actions .btn {
  height: 32px;
  font-size: 12px;
  padding: 0 16px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
  white-space: nowrap;
}
```

##### Mobile Responsive (≤767px)

```css
@media (max-width: 767px) {
  .filter-row {
    flex-direction: column;
    gap: 6px;
  }
  .filter-col,
  .filter-col-wide {
    flex: none;
    width: 100%;
    min-width: 0;
    max-width: none;
  }
  .filter-col .form-control,
  .filter-col-wide .form-control {
    width: 100% !important;
  }
  .filter-col .select2-container,
  .filter-col-wide .select2-container {
    width: 100% !important;
  }
  .search-actions {
    width: 100%;
    justify-content: stretch;
  }
  .search-actions .btn {
    flex: 1;
    justify-content: center;
    min-height: 40px;
  }
}
```

##### PHP — Select2 Configuration (Yii2)

Always use `dropdownAutoWidth => true` in Select2 to prevent dropdown overflow:

```php
$form->field($model, 'field_name')->widget(Select2::class, [
    'data' => $dataArray,
    'options' => ['placeholder' => 'الكل'],
    'pluginOptions' => [
        'allowClear' => true,
        'dir' => 'rtl',
        'dropdownAutoWidth' => true,  // CRITICAL — prevents dropdown from overflowing
    ],
])->label('العنوان')
```

##### HTML — Filter Form Structure

```html
<div class="filter-row">
    <div class="filter-col">
        <!-- text input or number input -->
    </div>
    <div class="filter-col-wide">
        <!-- Select2 dropdown or wider text input -->
    </div>
    <div class="filter-col">
        <!-- date picker or small dropdown -->
    </div>
</div>
<div class="filter-row">
    <div class="filter-col-wide">
        <!-- another Select2 -->
    </div>
    <div class="search-actions">
        <button>بحث</button>
        <a>مسح</a>
    </div>
</div>
```

---

#### **Page Container — Prevent Overflow**

The main page wrapper must clip horizontal overflow:

```css
.page-wrap {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: hidden;
}
.page-wrap *, .page-wrap *::before, .page-wrap *::after {
  box-sizing: border-box;
}
```

---

#### **Table — Fixed Layout, No Overflow**

Use `table-layout: fixed` to prevent tables from exceeding container width:

```css
.data-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}
.data-table td,
.data-table th {
  word-wrap: break-word;
  overflow-wrap: break-word;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

For long content columns, set explicit widths:

```css
.col-narrow { width: 60px; }
.col-medium { width: 120px; }
.col-wide { width: 200px; }
.col-actions { width: 50px; text-align: center; }
```

---

#### Tables — Horizontal Scroll Wrapper

Never let tables break the layout. Wrap in scrollable container:

```css
.table-responsive-wrap {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
}
```

```html
<div class="table-responsive-wrap">
    <table class="table">...</table>
</div>
```

For Kartik GridView in Yii2:

```php
<?= GridView::widget([
    'responsive' => true,
    'responsiveWrap' => true,
    // ...
]) ?>
```

#### CSS Grid — Responsive Columns

```css
.my-grid {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}
```

Or explicit breakpoints:

```css
.my-grid-3 { display:grid; gap:16px; grid-template-columns: repeat(3,1fr); }
.my-grid-4 { display:grid; gap:16px; grid-template-columns: repeat(4,1fr); }
.my-grid-2 { display:grid; gap:16px; grid-template-columns: repeat(2,1fr); }

@media (max-width: 992px) {
    .my-grid-3, .my-grid-4 { grid-template-columns: repeat(2,1fr); }
}
@media (max-width: 768px) {
    .my-grid-3, .my-grid-4, .my-grid-2 { grid-template-columns: 1fr; }
}
```

#### Cards — Stack on Mobile

```css
.card-row {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
}
.card-row > .card {
    flex: 1 1 300px;
    min-width: 0;
}
@media (max-width: 768px) {
    .card-row > .card { flex: 1 1 100%; }
}
```

#### Forms — Single Column on Mobile

```css
@media (max-width: 768px) {
    .form-row, .row {
        flex-direction: column;
    }
    .form-row > [class*="col-"],
    .row > [class*="col-"] {
        flex: 0 0 100%;
        max-width: 100%;
    }
}
```

#### Modals — Full Width on Mobile

```css
@media (max-width: 576px) {
    .modal-dialog {
        margin: 8px;
        max-width: calc(100vw - 16px);
    }
    .modal-body {
        max-height: 70vh;
        overflow-y: auto;
    }
}
```

#### Buttons/Actions — Stack Vertically

```css
@media (max-width: 576px) {
    .action-bar, .btn-group-responsive {
        flex-direction: column;
        gap: 8px;
    }
    .action-bar .btn, .btn-group-responsive .btn {
        width: 100%;
    }
}
```

#### Dashboard Stat Widgets

```css
.stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
}
```

#### Typography — Scale Down

```css
@media (max-width: 768px) {
    h1, .page-title { font-size: 1.4rem; }
    h2 { font-size: 1.2rem; }
    .stat-number { font-size: 1.5rem; }
    body { font-size: 13px; }
}
@media (max-width: 576px) {
    h1, .page-title { font-size: 1.2rem; }
    body { font-size: 12px; }
}
```

#### Sticky Elements — Disable on Mobile

```css
@media (max-width: 768px) {
    .sticky-bar, .save-bar {
        position: static !important;
        box-shadow: none;
    }
}
```

#### Action Rows (3-column grid to 1-column)

For list items with number + body + tools layout:

```css
@media (max-width: 768px) {
    .action-row {
        grid-template-columns: 1fr;
    }
    .action-num { display: none; }
    .action-tools {
        justify-content: flex-end;
        padding: 0 16px 12px;
    }
}
```

### Step 3: RTL Considerations (Arabic)

All responsive CSS must work with RTL:

```css
[dir="rtl"] .table-responsive-wrap {
    direction: rtl;
}
@media (max-width: 768px) {
    [dir="rtl"] .sidebar { right: -250px; left: auto; }
    [dir="rtl"] .sidebar.open { right: 0; }
}
```

### Step 4: Touch Target Sizes

Minimum 44x44px for all interactive elements on mobile:

```css
@media (max-width: 768px) {
    .btn, button, a.action-link {
        min-height: 44px;
        min-width: 44px;
        padding: 10px 16px;
    }
    .dropdown-menu a {
        padding: 12px 16px;
    }
}
```

### Step 5: Prevent Overflow (Global Safety)

Add to the page's `<style>` as a safety net:

```css
html, body {
    overflow-x: hidden;
    max-width: 100vw;
}
img, video, iframe, table {
    max-width: 100%;
}
```

## Quick Fix Template

When asked to make a page responsive, add this CSS block adapted to the page:

```css
/* ═══ Responsive ═══ */
@media (max-width: 992px) {
    .grid-3, .grid-4 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
    .grid-3, .grid-4, .grid-2 { grid-template-columns: 1fr; }
    .page-title { font-size: 1.2rem; }
    .action-row { grid-template-columns: 1fr; }
    .action-num { display: none; }
    .sticky-bar { position: static; box-shadow: none; }
}
@media (max-width: 576px) {
    .modal-dialog { margin: 8px; max-width: calc(100vw - 16px); }
    .btn-bar { flex-direction: column; }
    .btn-bar .btn { width: 100%; }
    body { font-size: 12px; }
}
```

## Yii2-Specific Patterns

### GridView Responsive

```php
<?= \kartik\grid\GridView::widget([
    'responsive' => true,
    'responsiveWrap' => true,
    'containerOptions' => ['style' => 'overflow-x:auto'],
    // ...
]) ?>
```

### DetailView Responsive

```php
<?= \yii\widgets\DetailView::widget([
    'options' => ['class' => 'table table-bordered', 'style' => 'table-layout:fixed;word-wrap:break-word'],
    // ...
]) ?>
```

### Form Layout Responsive

```php
<?php $form = ActiveForm::begin([
    'options' => ['class' => 'responsive-form'],
]) ?>
<div class="row">
    <div class="col-lg-4 col-md-6 col-xs-12">
        <?= $form->field($model, 'field1') ?>
    </div>
    <div class="col-lg-4 col-md-6 col-xs-12">
        <?= $form->field($model, 'field2') ?>
    </div>
</div>
```

## Reference Implementation

The best reference for this pattern in the Tayseer codebase is:
- **judiciary/index.php** — `jud-filter-row`, `jud-filter-col`, `jud-filter-col-wide`
- **judiciary-v2.css** — Section 9 (Search Panel) + responsive sections
- **contracts/index.php** — `ct-filter-grid` (converted from grid to flex layout)

## Checklist

- [ ] No horizontal overflow on any screen size
- [ ] Filter form uses flex-wrap layout (not rigid grid columns)
- [ ] Filter inputs are compact (32px height, 12px font)
- [ ] Select2 uses `dropdownAutoWidth: true`
- [ ] Page wrapper has `overflow-x: hidden`
- [ ] Tables use `table-layout: fixed` where appropriate
- [ ] Tables wrapped in `overflow-x: auto` container
- [ ] Grids collapse to single column on mobile (< 768px)
- [ ] Forms stack vertically on small screens
- [ ] Modals fit on mobile (margins, max-height)
- [ ] Buttons are tappable (min 44x44px)
- [ ] Font sizes scale down for readability
- [ ] Sticky elements become static on mobile
- [ ] RTL direction preserved in responsive CSS
- [ ] No fixed widths (px) — use %, vw, fr, auto-fit
- [ ] Images/videos have `max-width: 100%`
- [ ] Touch targets adequately sized
