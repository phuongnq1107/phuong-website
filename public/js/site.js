// EFJ - Kết nối cộng đồng: landing page behaviour
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var STORE = 'efj-shop';
  var KEEP_MS = 30 * 24 * 3600 * 1000; // a scan is remembered for 30 days

  function ga(name, params) { try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) { /* ignore */ } }
  var store = {
    get: function () { try { var v = JSON.parse(localStorage.getItem(STORE) || 'null'); return v && Date.now() - v.at < KEEP_MS ? v : null; } catch (e) { return null; } },
    set: function (v) { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };

  var shop = store.get(); // { code, name, pref, at }

  // ---------- which shop sent this visitor? ----------
  function paintShop() {
    var has = !!(shop && shop.code);
    $('#fromShop').hidden = !has;
    if (has) $('#fromName').textContent = shop.name + ' (' + shop.code + ')';
    $('#standeeCode').textContent = has ? shop.code : 'EFJ';
    $('#standeeShop').textContent = has ? shop.name : 'Mã QR đặt tại quán đối tác';
    var eco = $('#ecoLink');
    if (eco) {
      try {
        var u = new URL(eco.getAttribute('href'), location.href);
        if (has) u.searchParams.set('ref', shop.code); else u.searchParams.delete('ref');
        eco.href = u.toString();
      } catch (e) { /* keep default */ }
    }
    $('#shopNote').innerHTML = has
      ? 'Ưu đãi được ghi nhận cho mã quán <b>' + shop.code + '</b>, ' + escapeHtml(shop.name) + '.'
      : 'Bạn đang vào trực tiếp, không qua mã QR của quán. Bạn vẫn được tư vấn và nhận ưu đãi bình thường.';
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var params = new URLSearchParams(location.search);
  var scanned = (params.get('s') || '').toUpperCase();
  if (/^[A-Z]{2}\d{2,3}$/.test(scanned)) {
    // tidy the address bar so a shared link does not count as a new scan
    params.delete('s');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
    fetch('/api/public/shop/' + scanned).then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
      if (!s) return;
      shop = { code: s.code, name: s.name, pref: s.pref, at: Date.now() };
      store.set(shop);
      paintShop();
      ga('qr_scan', { shop_code: s.code, prefecture: s.pref });
    }).catch(function () {});
  }
  paintShop();

  // ---------- click tracking ----------
  function track(target) {
    var body = JSON.stringify({ target: target, shop: shop ? shop.code : null });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon('/api/public/click', new Blob([body], { type: 'application/json' }));
      else fetch('/api/public/click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
    } catch (e) { /* ignore */ }
    ga('select_promotion', { promotion_id: target, shop_code: shop ? shop.code : 'DIRECT' });
  }

  // ---------- dialog ----------
  var dlg = $('#lead');
  var form = $('#leadForm');
  var TITLES = {
    buy: ['Tư vấn mua nhà', 'Estate Plus, giảm từ 20% phí môi giới'],
    sell: ['Tư vấn bán nhà', 'Estate Plus, giảm từ 20% phí môi giới'],
    rent: ['Tìm nhà thuê', 'Estate Plus, giảm từ 20% phí môi giới'],
    job: ['Đăng ký tìm việc', 'Yoko Japan, ưu đãi phí giới thiệu']
  };
  var DONE = {
    buy: 'Chuyên viên Estate Plus', sell: 'Chuyên viên Estate Plus', rent: 'Chuyên viên Estate Plus', job: 'Chuyên viên Yoko Japan'
  };
  var lastFocus = null;

  function setService(svc) {
    var input = form.querySelector('input[name=service][value="' + svc + '"]');
    if (input) input.checked = true;
    var isJob = svc === 'job';
    $('.only-job', form).hidden = !isJob;
    $('.only-home', form).hidden = isJob;
    $('#leadTitle').textContent = TITLES[svc][0];
    $('#leadSub').textContent = TITLES[svc][1];
  }

  function openForm(svc) {
    lastFocus = document.activeElement;
    form.hidden = false;
    $('#leadDone').hidden = true;
    clearErrors();
    setService(svc || 'buy');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    setTimeout(function () { $('#fName').focus(); }, 60);
    ga('begin_checkout', { item_category: svc, shop_code: shop ? shop.code : 'DIRECT' });
  }

  function closeForm() {
    if (dlg.open) dlg.close();
  }
  dlg.addEventListener('close', function () { if (lastFocus && lastFocus.focus) lastFocus.focus(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) closeForm(); }); // click on backdrop

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-track]');
    if (t) track(t.getAttribute('data-track'));
    var o = e.target.closest('[data-open]');
    if (o) { e.preventDefault(); openForm(o.getAttribute('data-open')); }
    if (e.target.closest('[data-close]')) closeForm();
  });
  $$('input[name=service]', form).forEach(function (r) { r.addEventListener('change', function () { setService(r.value); }); });

  // ---------- validation ----------
  var FIELDS = { name: '#fName', phone: '#fPhone', email: '#fEmail', consent: '#fConsent' };
  var ERR = { name: '#eName', phone: '#ePhone', email: '#eEmail', consent: '#eConsent' };

  function clearErrors() {
    Object.keys(ERR).forEach(function (k) { $(ERR[k]).textContent = ''; $(FIELDS[k]).removeAttribute('aria-invalid'); });
    $('#formErr').textContent = '';
  }
  function showErrors(errs) {
    var first = null;
    Object.keys(errs).forEach(function (k) {
      if (!ERR[k]) return;
      $(ERR[k]).textContent = errs[k];
      $(FIELDS[k]).setAttribute('aria-invalid', 'true');
      if (!first) first = $(FIELDS[k]);
    });
    if (first) first.focus();
  }
  function validate(d) {
    var e = {};
    if ((d.name || '').trim().length < 2) e.name = 'Vui lòng nhập họ và tên.';
    var digits = (d.phone || '').replace(/\D/g, '');
    if (!/^[0-9+\-\s()]{9,20}$/.test((d.phone || '').trim()) || digits.length < 9) e.phone = 'Số điện thoại chưa đúng. Ví dụ: 090-1234-5678.';
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = 'Email chưa đúng định dạng.';
    if (!d.consent) e.consent = 'Vui lòng đồng ý với chính sách bảo mật để gửi đăng ký.';
    return e;
  }
  ['#fName', '#fPhone', '#fEmail'].forEach(function (sel) {
    $(sel).addEventListener('blur', function () {
      var k = sel === '#fName' ? 'name' : sel === '#fPhone' ? 'phone' : 'email';
      if (!$(sel).value) return;
      var data = {}; data[k] = $(sel).value; data.consent = true; if (k !== 'name') data.name = 'ok'; if (k !== 'phone') data.phone = '0901234567';
      var err = validate(data)[k] || '';
      $(ERR[k]).textContent = err;
      if (err) $(sel).setAttribute('aria-invalid', 'true'); else $(sel).removeAttribute('aria-invalid');
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();
    var fd = new FormData(form);
    var data = {};
    fd.forEach(function (v, k) { data[k] = typeof v === 'string' ? v.trim() : v; });
    data.consent = $('#fConsent').checked;
    data.shop = shop ? shop.code : null;
    var errs = validate(data);
    if (Object.keys(errs).length) return showErrors(errs);

    var btn = $('#submitBtn');
    btn.disabled = true;
    btn.textContent = 'Đang gửi…';
    fetch('/api/public/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); })
      .then(function (res) {
        if (!res.ok) {
          if (res.body && res.body.errors) return showErrors(res.body.errors);
          $('#formErr').textContent = (res.body && res.body.error) || 'Chưa gửi được đăng ký. Vui lòng thử lại.';
          return;
        }
        ga('generate_lead', { service: data.service, shop_code: data.shop || 'DIRECT' });
        form.reset();
        form.hidden = true;
        $('#doneText').textContent = DONE[data.service] + ' sẽ gọi lại cho bạn sớm' +
          (data.shop ? '. Ưu đãi đã được ghi nhận theo mã quán ' + data.shop + '.' : '.');
        $('#leadDone').hidden = false;
        $('#doneTitle').focus();
      })
      .catch(function () { $('#formErr').textContent = 'Mất kết nối mạng. Kiểm tra kết nối và bấm Gửi đăng ký lần nữa.'; })
      .then(function () { btn.disabled = false; btn.textContent = 'Gửi đăng ký'; });
  });

  // ---------- header border, mobile dock, network bars ----------
  var top = $('.top'), dock = $('#dock'), hero = $('.hero');
  function onScroll() {
    var y = window.scrollY;
    top.classList.toggle('scrolled', y > 8);
    var pastHero = y > hero.offsetHeight * 0.6;
    var nearEnd = window.innerHeight + y > document.body.scrollHeight - 260;
    dock.classList.toggle('show', pastHero && !nearEnd);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var net = $('#mang-luoi');
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es, ob) {
      es.forEach(function (en) { if (en.isIntersecting) { net.classList.add('seen'); ob.disconnect(); } });
    }, { threshold: .35 }).observe(net);
  }

  $('#yr').textContent = new Date().getFullYear();
})();
