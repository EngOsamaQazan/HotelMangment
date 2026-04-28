---
name: realtime-ajax-modal
description: Replace broken ajaxcrud/modal-remote with vanilla JS async modal + live list refresh. Use when fixing stuck loading modals, implementing real-time CRUD updates without page reload, replacing role="modal-remote" with custom AJAX, or when ajaxcrud ModalRemote causes frozen UI. Works with Yii2, Vite, Bootstrap 5, and any PHP MVC framework.
---

# Real-Time AJAX Modal + Live Refresh Pattern

## When to Use

- Modal stuck loading (empty `modal-body`, spinner never stops)
- `role="modal-remote"` with ajaxcrud causing frozen browser (`async: false`)
- `$.pjax.reload()` crashing because pjax is not loaded
- jQuery not available when inline scripts execute (Vite async bundle)
- Need CRUD operations to update a list in real-time without page reload
- Bootstrap version conflicts (BS3 ajaxcrud vs BS5 Vuexy)

## Solution Architecture

One self-contained JavaScript object (e.g. `JCA`) written in **pure vanilla JS** — zero jQuery dependency. It handles:

1. **Modal open/close** via Bootstrap 5 API or manual CSS
2. **Form loading** via `fetch()` GET → JSON `{title, content, footer}`
3. **Form submission** via `fetch()` POST with `FormData`
4. **Delete** via `fetch()` POST with native `confirm()`
5. **Inline actions** (approve/reject) via `fetch()` POST
6. **Live refresh** via `fetch()` GET → `DOMParser` → `innerHTML` swap

## Implementation

### Step 1: Add Container ID

Wrap the list you want to refresh with a unique ID:

```html
<div id="my-items-container">
  <!-- items rendered by PHP -->
</div>
```

### Step 2: Add Custom Modal HTML

Replace `\yii\bootstrap\Modal` / ajaxcrud modal with plain HTML:

```html
<div class="modal fade" id="myModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="myModalTitle"></h5>
        <button type="button" class="btn-close" onclick="MC.hideModal()"></button>
      </div>
      <div class="modal-body" id="myModalBody"></div>
      <div class="modal-footer" id="myModalFooter"></div>
    </div>
  </div>
</div>
```

### Step 3: JavaScript Controller (Vanilla JS)

```javascript
var MC = (function(){
    var modalEl = document.getElementById('myModal');

    // ── CSRF (Yii2 backend uses _csrf-backend) ──
    function getCsrfParam() {
        var m = document.querySelector('meta[name="csrf-param"]');
        return m ? m.getAttribute('content') : '_csrf-backend';
    }
    function getCsrfToken() {
        var m = document.querySelector('meta[name="csrf-token"]');
        return m ? m.getAttribute('content') : '';
    }

    // ── Must send this for Yii2's $request->isAjax ──
    function ajaxHeaders() {
        return { 'X-Requested-With': 'XMLHttpRequest' };
    }

    // ── Modal show/hide (Bootstrap 5 compatible) ──
    function showModal() {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            var inst = bootstrap.Modal.getInstance(modalEl)
                       || new bootstrap.Modal(modalEl);
            inst.show();
        } else {
            modalEl.classList.add('show');
            modalEl.style.display = 'block';
            var bd = document.createElement('div');
            bd.className = 'modal-backdrop fade show';
            document.body.appendChild(bd);
            document.body.classList.add('modal-open');
        }
    }
    function hideModal() {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            var inst = bootstrap.Modal.getInstance(modalEl);
            if (inst) try { inst.hide(); } catch(e) {}
        }
        modalEl.classList.remove('show');
        modalEl.style.display = 'none';
        document.querySelectorAll('.modal-backdrop').forEach(function(b){ b.remove(); });
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
    }

    function setLoading() {
        document.getElementById('myModalTitle').textContent = 'جاري التحميل...';
        document.getElementById('myModalBody').innerHTML =
            '<div style="text-align:center;padding:40px"><i class="fa fa-spinner fa-spin fa-2x"></i></div>';
        document.getElementById('myModalFooter').innerHTML = '';
    }

    // ── Live refresh: fetch page, swap container innerHTML ──
    function refreshList() {
        // No X-Requested-With so server returns full HTML, not JSON
        fetch(location.href).then(function(r){ return r.text(); }).then(function(html){
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var newC = doc.getElementById('my-items-container');
            var curC = document.getElementById('my-items-container');
            if (newC && curC) curC.innerHTML = newC.innerHTML;
        });
    }

    // ── Open modal with form ──
    function openModal(url) {
        setLoading(); showModal();
        fetch(url, {headers: ajaxHeaders()})
            .then(function(r){ return r.json(); })
            .then(function(resp){
                if (resp.title) document.getElementById('myModalTitle').innerHTML = resp.title;
                if (resp.content) document.getElementById('myModalBody').innerHTML = resp.content;
                if (resp.footer) document.getElementById('myModalFooter').innerHTML = resp.footer;
                bindFormSubmit(url);
            })
            .catch(function(){
                document.getElementById('myModalTitle').textContent = 'خطأ';
                document.getElementById('myModalBody').innerHTML = '<p style="color:red">فشل التحميل</p>';
                document.getElementById('myModalFooter').innerHTML =
                    '<button class="btn btn-default" onclick="MC.hideModal()">إغلاق</button>';
            });
    }

    function bindFormSubmit(fallbackUrl) {
        var form = document.querySelector('#myModalBody form');
        var btn = document.querySelector('#myModalFooter [type="submit"]');
        if (!form || !btn) return;
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            submitForm(form.getAttribute('action') || fallbackUrl, new FormData(form));
        });
    }

    function submitForm(url, formData) {
        var btn = document.querySelector('#myModalFooter [type="submit"]');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>'; }
        fetch(url, {method:'POST', body:formData, headers:ajaxHeaders()})
            .then(function(r){ return r.json(); })
            .then(function(resp){
                if (resp.forceClose) { hideModal(); setTimeout(refreshList, 200); return; }
                if (resp.title) document.getElementById('myModalTitle').innerHTML = resp.title;
                if (resp.content) document.getElementById('myModalBody').innerHTML = resp.content;
                if (resp.footer) document.getElementById('myModalFooter').innerHTML = resp.footer;
                bindFormSubmit(url);
            })
            .catch(function(){ if (btn) { btn.disabled = false; } alert('حدث خطأ'); });
    }

    // ── Delete with confirm ──
    function deleteItem(url, el) {
        if (!confirm('هل أنت متأكد؟')) return;
        var row = el.closest('.item-row');
        if (row) { row.style.opacity = '0.4'; row.style.pointerEvents = 'none'; }
        var fd = new FormData();
        fd.append(getCsrfParam(), getCsrfToken());
        fetch(url, {method:'POST', body:fd, headers:ajaxHeaders()})
            .then(function(){ setTimeout(refreshList, 200); })
            .catch(function(){ if (row) { row.style.opacity='1'; row.style.pointerEvents=''; } });
    }

    return { openModal:openModal, hideModal:hideModal, deleteItem:deleteItem };
})();
```

### Step 4: Button Markup

Replace `role="modal-remote"` links with `onclick`:

```php
<!-- Add -->
<button onclick="MC.openModal('<?= Url::to([...]) ?>')">إضافة</button>

<!-- Edit -->
<a href="javascript:void(0)" onclick="MC.openModal('<?= $editUrl ?>')">تعديل</a>

<!-- Delete -->
<a href="javascript:void(0)" onclick="MC.deleteItem('<?= $delUrl ?>', this)">حذف</a>
```

### Step 5: Controller Response

Controller must return JSON for AJAX with `forceClose` on success (NO `forceReload`):

```php
if ($request->isAjax) {
    Yii::$app->response->format = Response::FORMAT_JSON;
    if ($request->isGet) {
        return [
            'title'   => 'عنوان النموذج',
            'content' => $this->renderAjax('_form', ['model' => $model]),
            'footer'  => Html::button('إغلاق', [...]) . Html::button('حفظ', ['type'=>'submit',...]),
            'size'    => 'large',
        ];
    }
    if ($model->load($request->post()) && $model->save()) {
        return ['forceClose' => true];
    }
    // Validation failed: re-render form
    return [
        'title'   => 'عنوان النموذج',
        'content' => $this->renderAjax('_form', ['model' => $model]),
        'footer'  => Html::button('إغلاق', [...]) . Html::button('حفظ', ['type'=>'submit',...]),
    ];
}
```

## Critical Rules

| Rule | Why |
|------|-----|
| **Zero jQuery** — use `fetch()`, `document.querySelector`, vanilla DOM | jQuery loads async via Vite, causes `$ is not defined` |
| **CSRF from meta tags** — `getCsrfParam()` + `getCsrfToken()` | Yii2 backend uses `_csrf-backend`, not `_csrf` |
| **`X-Requested-With: XMLHttpRequest`** header on all AJAX | Yii2's `$request->isAjax` checks this header |
| **No `X-Requested-With`** on refresh fetch | Must get full HTML page, not JSON |
| **`forceClose: true`** only — never `forceReload` | `$.pjax.reload()` crashes if pjax absent |
| **Remove `CrudAsset::register`** | ajaxcrud's `async:false` freezes browser |
| **`innerHTML` swap** for live refresh | Simplest reliable method, works after any CRUD |
| **`data-pjax="0"` on modal-remote links inside PJAX** | PJAX intercepts all link clicks in its container; without `data-pjax="0"`, the modal handler never fires |
| **Modal must parse JSON, not raw HTML** | Controllers return `{title, content, footer}`; treating response as HTML shows nothing |
| **Modal HTML must include `modal-footer` div** | Without it, controller-provided footer buttons (إغلاق, حفظ) are silently lost |

## Checklist

- [ ] Container div has unique `id`
- [ ] Custom modal HTML added (not ajaxcrud modal)
- [ ] `CrudAsset::register()` removed
- [ ] All `role="modal-remote"` replaced with `onclick="MC.openModal(...)"`
- [ ] Delete uses `onclick` + `confirm()` (not modal-remote with data-confirm)
- [ ] CSRF reads from `<meta name="csrf-param">` and `<meta name="csrf-token">`
- [ ] Controller returns `forceClose: true` only (no `forceReload`)
- [ ] Script uses zero jQuery — all vanilla JS + `fetch()`
