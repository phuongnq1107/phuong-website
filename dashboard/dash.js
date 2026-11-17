// EFJ partner dashboard: admin sees every shop, a shop owner sees only their own shop.
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var nf = new Intl.NumberFormat('vi-VN');
  var dtParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  var dtf = { format: function (d) { var p = {}; dtParts.formatToParts(d).forEach(function (x) { p[x.type] = x.value; }); return p.day + '/' + p.month + ' ' + p.hour + ':' + p.minute; } };
  var dShort = function (d) { var p = d.split('-'); return p[2] + '/' + p[1]; };

  var STATUS = [
    ['new', 'Chưa liên hệ', 'var(--s1)', false],
    ['working', 'Đang tư vấn', 'var(--s2)', true],
    ['signed', 'Đã ký hợp đồng', 'var(--s3)', true],
    ['done', 'Hoàn tất', 'var(--s4)', true],
    ['cancel', 'Huỷ', 'var(--s5)', true]
  ];
  var STATUS_NAME = {}; STATUS.forEach(function (s) { STATUS_NAME[s[0]] = s; });
  var SERVICE = { buy: 'Mua nhà', sell: 'Bán nhà', rent: 'Thuê nhà', job: 'Tìm việc' };
  var CLICK = { buy: 'Mua, bán nhà', rent: 'Thuê nhà', furn: 'Nội thất', job: 'Việc làm' };

  var state = { role: null, shop: null, days: 30, overview: null, leads: [], leadTotal: 0, sort: { key: 'code', dir: 1 } };

  function api(path, opts) {
    opts = opts || {};
    return fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && path !== '/api/auth/login') { showLogin(j.error); throw new Error('auth'); }
        if (!r.ok) throw new Error(j.error || 'Có lỗi xảy ra');
        return j;
      });
    });
  }

  function toast(html) {
    var t = document.createElement('div');
    t.className = 'toast'; t.innerHTML = html;
    $('#toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, 6000);
  }

  // ================= LOGIN =================
  function showLogin(msg) {
    stopLive();
    $('#app').hidden = true; $('#login').hidden = false;
    $('#loginErr').textContent = msg || '';
    $('#shopCode').focus();
  }
  function selectTab(admin) {
    $('#tabShop').setAttribute('aria-selected', String(!admin));
    $('#tabAdmin').setAttribute('aria-selected', String(admin));
    $('#formShop').hidden = admin; $('#formAdmin').hidden = !admin;
    $('#loginErr').textContent = '';
    (admin ? $('#adminPw') : $('#shopCode')).focus();
  }
  $('#tabShop').addEventListener('click', function () { selectTab(false); });
  $('#tabAdmin').addEventListener('click', function () { selectTab(true); });
  $('#shopCode').addEventListener('input', function (e) {
    var v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    e.target.value = v.length > 4 ? v.slice(0, 4) + '-' + v.slice(4) : v;
  });
  function doLogin(form, body) {
    var btn = $('button[type=submit]', form); btn.disabled = true;
    api('/api/auth/login', { method: 'POST', body: body })
      .then(function () { form.reset(); boot(); })
      .catch(function (e) { $('#loginErr').textContent = e.message; })
      .then(function () { btn.disabled = false; });
  }
  $('#formShop').addEventListener('submit', function (e) { e.preventDefault(); doLogin(e.target, { code: $('#shopCode').value }); });
  $('#formAdmin').addEventListener('submit', function (e) { e.preventDefault(); doLogin(e.target, { password: $('#adminPw').value }); });
  $('#logout').addEventListener('click', function () { api('/api/auth/logout', { method: 'POST' }).then(function () { showLogin(); }); });

  // ================= BOOT =================
  function boot() {
    api('/api/auth/me').then(function (me) {
      state.role = me.role; state.shop = me.shop || null;
      document.body.className = 'role-' + me.role;
      $('#login').hidden = true; $('#app').hidden = false;
      if (me.role === 'admin') {
        $('#who').textContent = 'Quản trị viên';
        $('#title').textContent = 'Tổng quan chương trình';
        $('#shopsPanel').hidden = false; $('#myQr').hidden = true;
      } else {
        $('#who').textContent = 'Quán ' + me.shop.code;
        $('#title').textContent = me.shop.name;
        $('#shopsPanel').hidden = true; $('#myQr').hidden = false;
        paintMyQr(me.shop.code);
      }
      buildLeadFilters();
      refresh(true);
      startLive();
    }).catch(function () { /* login screen shown by api() */ });
  }

  function paintMyQr(code) {
    $('#myQrImg').src = '/api/dash/qr/' + code + '.png';
    $('#myQrPng').href = '/api/dash/qr/' + code + '.png';
    $('#myQrSvg').href = '/api/dash/qr/' + code + '.svg';
    api('/api/dash/shops/' + code).then(function (s) { $('#myQrUrl').textContent = s.url; });
  }

  // ================= DATA =================
  var refreshTimer = null;
  function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(function () { refresh(false); }, 700); }

  function refresh(first) {
    var prevLeads = state.overview ? state.overview.totals.leads : null;
    var prevScans = state.overview ? state.overview.totals.scans : null;
    return Promise.all([
      api('/api/dash/overview?days=' + state.days),
      loadLeads(0)
    ]).then(function (res) {
      state.overview = res[0];
      renderOverview(first ? null : { leads: prevLeads, scans: prevScans });
    }).catch(function (e) { if (e.message !== 'auth') toast(esc(e.message)); });
  }

  // ================= OVERVIEW =================
  function renderOverview(prev) {
    var o = state.overview, t = o.totals;
    var period = { 1: 'hôm nay', 7: '7 ngày qua', 30: '30 ngày qua', 0: 'từ khi bắt đầu' }[state.days];
    $('#subtitle').textContent = (state.role === 'admin' ? o.activeShops + ' quán đang tham gia. ' : '') + 'Số liệu ' + period + ', giờ Nhật Bản.';
    var clicks = t.clicks.buy + t.clicks.rent + t.clicks.furn + t.clicks.job;
    var rate = t.scans ? Math.round(t.leads / t.scans * 1000) / 10 : 0;
    var won = t.byStatus.signed + t.byStatus.done;
    var tiles = [
      { k: 'scans', label: 'Lượt quét QR', val: t.scans, sub: nf.format(t.uniqueScans) + ' lượt khách khác nhau' },
      { k: 'clicks', label: 'Lượt bấm ưu đãi', val: clicks, sub: 'Nội thất: ' + nf.format(t.clicks.furn) },
      { k: 'leads', label: 'Đăng ký tư vấn', val: t.leads, sub: rate + '% so với lượt quét', lead: true },
      { k: 'new', label: 'Chờ liên hệ', val: t.byStatus.new, sub: 'Đang tư vấn: ' + nf.format(t.byStatus.working) },
      { k: 'won', label: 'Ký hợp đồng, hoàn tất', val: won, sub: 'Huỷ: ' + nf.format(t.byStatus.cancel) }
    ];
    $('#kpis').innerHTML = tiles.map(function (x) {
      return '<div class="kpi' + (x.lead ? ' lead' : '') + '" data-k="' + x.k + '"><span class="k-label">' + x.label + '</span><span class="k-val">' + nf.format(x.val) + '</span><span class="k-sub">' + esc(x.sub) + '</span></div>';
    }).join('');
    if (prev && prev.leads !== null) {
      if (t.leads > prev.leads) $('.kpi[data-k=leads]').classList.add('flash');
      if (t.scans > prev.scans) $('.kpi[data-k=scans]').classList.add('flash');
    }

    barChart($('#chartScans'), o.daily, 'scans', 'var(--s1)', 'lượt quét');
    barChart($('#chartLeads'), o.daily, 'leads', 'var(--s2)', 'đăng ký');
    $('#dailyTable').innerHTML = '<thead><tr><th scope="col">Ngày</th><th scope="col" class="num">Lượt quét QR</th><th scope="col" class="num">Đăng ký</th></tr></thead><tbody>' +
      o.daily.slice().reverse().map(function (d) { return '<tr><td>' + dShort(d.d) + '/' + d.d.slice(0, 4) + '</td><td class="num">' + d.scans + '</td><td class="num">' + d.leads + '</td></tr>'; }).join('') + '</tbody>';

    renderPipeline(t);
    renderServices(t);
    if (state.role === 'admin') renderShops();
  }

  // single-series bar chart with hover tooltip (no second axis: scans and leads are separate charts)
  function barChart(el, data, key, color, unit) {
    var W = el.clientWidth || 500, H = el.clientHeight || 200, padL = 34, padB = 22, padT = 8;
    var max = Math.max.apply(null, data.map(function (d) { return d[key]; }).concat([0]));
    var nice = max <= 4 ? 4 : Math.ceil(max / 4 / Math.pow(10, Math.floor(Math.log10(max / 4)))) * Math.pow(10, Math.floor(Math.log10(max / 4))) * 4;
    var iw = W - padL, ih = H - padB - padT, n = data.length || 1;
    var step = iw / n, bw = Math.max(2, Math.min(24, step - 2));
    var y = function (v) { return padT + ih - (v / nice) * ih; };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Biểu đồ ' + unit + ' theo ngày, cao nhất ' + max + '">';
    for (var g = 0; g <= 4; g++) {
      var gv = nice / 4 * g, gy = y(gv);
      s += '<line class="gridline" x1="' + padL + '" x2="' + W + '" y1="' + gy + '" y2="' + gy + '"/>';
      s += '<text class="axis" x="' + (padL - 6) + '" y="' + (gy + 4) + '" text-anchor="end">' + nf.format(gv) + '</text>';
    }
    var every = Math.ceil(n / 8);
    data.forEach(function (d, i) {
      var x = padL + i * step + (step - bw) / 2, v = d[key], h = Math.max(0, ih * v / nice);
      if ((n - 1 - i) % every === 0) s += '<text class="axis" x="' + (x + bw / 2) + '" y="' + (H - 4) + '" text-anchor="middle">' + dShort(d.d) + '</text>';
      s += '<rect class="hit" x="' + (padL + i * step) + '" y="' + padT + '" width="' + step + '" height="' + ih + '" data-i="' + i + '"/>';
      if (v > 0) {
        var r = Math.min(4, bw / 2, h);
        // rounded top, square base on the baseline
        s += '<path class="barmark" fill="' + color + '" d="M' + x + ',' + (y(0)) + 'V' + (y(v) + r) + 'Q' + x + ',' + y(v) + ' ' + (x + r) + ',' + y(v) + 'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + y(v) + ' ' + (x + bw) + ',' + (y(v) + r) + 'V' + y(0) + 'Z"/>';
      }
    });
    if (!max) s += '<text class="empty" x="' + (padL + iw / 2) + '" y="' + (padT + ih / 2) + '" text-anchor="middle">Chưa có dữ liệu trong khoảng thời gian này</text>';
    s += '</svg>';
    el.innerHTML = s;
    $$('.hit', el).forEach(function (r) {
      r.addEventListener('mousemove', function (e) {
        var d = data[+r.getAttribute('data-i')];
        showTip(e, '<b>' + nf.format(d[key]) + '</b> ' + unit + '<br>' + dShort(d.d) + '/' + d.d.slice(0, 4));
      });
      r.addEventListener('mouseleave', hideTip);
    });
  }
  function showTip(e, html) {
    var tip = $('#tip'); tip.innerHTML = html; tip.hidden = false;
    var x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + 'px'; tip.style.top = (e.clientY - tip.offsetHeight - 12) + 'px';
  }
  function hideTip() { $('#tip').hidden = true; }

  function renderPipeline(t) {
    var total = STATUS.reduce(function (a, s) { return a + t.byStatus[s[0]]; }, 0);
    var bar = total
      ? '<div class="seg" role="img" aria-label="' + STATUS.map(function (s) { return s[1] + ' ' + t.byStatus[s[0]]; }).join(', ') + '">' +
        STATUS.filter(function (s) { return t.byStatus[s[0]] > 0; }).map(function (s) {
          var v = t.byStatus[s[0]], pct = Math.round(v / total * 100);
          return '<span class="' + (s[3] ? 'dark-ink' : '') + '" style="flex-grow:' + v + ';background:' + s[2] + '" title="' + s[1] + ': ' + v + ' (' + pct + '%)">' + (pct >= 8 ? pct + '%' : '') + '</span>';
        }).join('') + '</div>'
      : '<div class="seg empty" aria-label="Chưa có đăng ký"></div>';
    $('#pipeline').innerHTML = bar + '<ul class="legend">' + STATUS.map(function (s) {
      return '<li><i style="background:' + s[2] + '"></i><span>' + s[1] + '</span><b>' + nf.format(t.byStatus[s[0]]) + '</b></li>';
    }).join('') + '</ul>';
  }

  function renderServices(t) {
    var max = Math.max(1, t.byService.buy, t.byService.sell, t.byService.rent, t.byService.job);
    $('#services').innerHTML = '<ul class="svc">' + Object.keys(SERVICE).map(function (k) {
      return '<li><span>' + SERVICE[k] + '</span><span class="track"><i style="width:' + (t.byService[k] / max * 100) + '%"></i></span><b>' + nf.format(t.byService[k]) + '</b></li>';
    }).join('') + '</ul>' + (t.clicks.furn ? '<p class="muted small" style="margin-top:12px">Nội thất được đặt trực tiếp trên Eco-Life: ' + nf.format(t.clicks.furn) + ' lượt bấm sang ecolife.</p>' : '');
  }

  function thinBar(st) {
    var total = STATUS.reduce(function (a, s) { return a + st[s[0]]; }, 0);
    if (!total) return '<div class="thin empty" aria-label="Chưa có đăng ký"></div>';
    return '<div class="thin" role="img" aria-label="' + STATUS.map(function (s) { return s[1] + ' ' + st[s[0]]; }).join(', ') + '">' +
      STATUS.filter(function (s) { return st[s[0]]; }).map(function (s) { return '<span style="flex-grow:' + st[s[0]] + ';background:' + s[2] + '"></span>'; }).join('') + '</div>';
  }

  // ================= SHOPS TABLE (admin) =================
  function renderShops() {
    var pref = $('#fPref').value, q = $('#fShop').value.trim().toLowerCase();
    var rows = state.overview.shops.map(function (s) {
      s.clicksAll = s.clicks.buy + s.clicks.rent + s.clicks.furn + s.clicks.job;
      s.won = s.byStatus.signed + s.byStatus.done;
      return s;
    }).filter(function (s) {
      if (pref && s.pref !== pref) return false;
      if (q && (String(s.code || 'direct') + ' ' + s.name).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var k = state.sort.key, dir = state.sort.dir;
    rows.sort(function (a, b) {
      var x = a[k], y = b[k];
      if (k === 'code') { x = a.code || 'ZZZ'; y = b.code || 'ZZZ'; }
      return (x > y ? 1 : x < y ? -1 : 0) * dir;
    });
    $$('#shopsTable th').forEach(function (th) {
      var b = $('button', th);
      if (b && b.getAttribute('data-sort') === k) th.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
    });
    var cell = function (v) { return '<td class="num' + (v ? '' : ' zero') + '">' + nf.format(v) + '</td>'; };
    $('#shopsTable tbody').innerHTML = rows.length ? rows.map(function (s) {
      return '<tr class="' + (s.code ? 'click' : '') + '" data-code="' + (s.code || '') + '" tabindex="' + (s.code ? 0 : -1) + '">' +
        '<td><span class="chip">' + (s.code || 'Trực tiếp') + '</span></td>' +
        '<td>' + esc(s.name) + (s.active === 0 ? ' <span class="muted small">(tạm dừng)</span>' : '') + '<div class="muted small">' + esc(s.pref || 'Không qua QR') + (s.staff ? ', phụ trách: ' + esc(s.staff) : '') + '</div></td>' +
        cell(s.scans) + cell(s.clicksAll) + cell(s.leads) + cell(s.won) +
        '<td>' + thinBar(s.byStatus) + '</td></tr>';
    }).join('') : '<tr class="empty-row"><td colspan="7">Không có quán nào khớp bộ lọc.</td></tr>';
  }
  $('#fPref').addEventListener('change', renderShops);
  $('#fShop').addEventListener('input', renderShops);
  $$('#shopsTable th button').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-sort');
      state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : (k === 'code' || k === 'name' ? 1 : -1) };
      renderShops();
    });
  });
  function openShopFromRow(e) {
    var tr = e.target.closest('tr[data-code]');
    if (!tr || !tr.getAttribute('data-code')) return;
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    openShop(tr.getAttribute('data-code'));
  }
  $('#shopsTable tbody').addEventListener('click', openShopFromRow);
  $('#shopsTable tbody').addEventListener('keydown', openShopFromRow);

  // ================= SHOP DRAWER =================
  var curShop = null;
  function openShop(code) {
    api('/api/dash/shops/' + code).then(function (s) {
      curShop = s;
      $('#sdTitle').textContent = s.code + ', ' + s.name;
      $('#sdSub').textContent = s.pref;
      $('#sdCode').textContent = s.accessCode;
      $('#sdQr').src = '/api/dash/qr/' + s.code + '.png';
      $('#sdUrl').textContent = s.url;
      $('#sdPng').href = '/api/dash/qr/' + s.code + '.png';
      $('#sdSvg').href = '/api/dash/qr/' + s.code + '.svg';
      var f = $('#sdForm');
      ['name', 'address', 'contact', 'phone', 'staff'].forEach(function (k) { f.elements[k].value = s[k] || ''; });
      f.elements.active.checked = s.active;
      $('#sdSaved').textContent = '';
      $('#shopDlg').showModal();
    }).catch(function (e) { toast(esc(e.message)); });
  }
  $('#sdCopyCode').addEventListener('click', function () {
    var text = 'Mã truy cập dashboard EFJ của quán ' + curShop.code + ': ' + $('#sdCode').textContent + '\nĐăng nhập tại ' + location.origin + '/dashboard';
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Đã sao chép mã truy cập của <b>' + curShop.code + '</b>'); }).catch(function () { toast('Không sao chép được, hãy chép tay mã trên màn hình.'); });
  });
  $('#sdReset').addEventListener('click', function () {
    if (!confirm('Đổi mã truy cập mới cho quán ' + curShop.code + '? Mã cũ sẽ không dùng được nữa.')) return;
    api('/api/dash/shops/' + curShop.code + '/reset-code', { method: 'POST' }).then(function (r) {
      $('#sdCode').textContent = r.accessCode; toast('Đã tạo mã mới cho <b>' + curShop.code + '</b>');
    }).catch(function (e) { toast(esc(e.message)); });
  });
  $('#sdForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, body = { active: f.elements.active.checked };
    ['name', 'address', 'contact', 'phone', 'staff'].forEach(function (k) { body[k] = f.elements[k].value; });
    api('/api/dash/shops/' + curShop.code, { method: 'PATCH', body: body }).then(function () {
      $('#sdSaved').textContent = 'Đã lưu thông tin quán'; $('#sdTitle').textContent = curShop.code + ', ' + body.name; refresh(false);
    }).catch(function (err) { $('#sdSaved').textContent = ''; toast(esc(err.message)); });
  });

  // ================= LEADS =================
  function buildLeadFilters() {
    $('#fStatus').innerHTML = '<option value="">Tất cả</option>' + STATUS.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('');
    $('#fService').innerHTML = '<option value="">Tất cả</option>' + Object.keys(SERVICE).map(function (k) { return '<option value="' + k + '">' + SERVICE[k] + '</option>'; }).join('');
    var admin = state.role === 'admin';
    $('#leadsTable thead').innerHTML = '<tr><th scope="col">Thời gian</th>' + (admin ? '<th scope="col">Quán</th>' : '') +
      '<th scope="col">Dịch vụ</th><th scope="col">Khách</th>' + (admin ? '<th scope="col">Điện thoại</th>' : '') + '<th scope="col">Trạng thái</th></tr>';
  }
  var qTimer;
  $('#fStatus').addEventListener('change', function () { loadLeads(0); });
  $('#fService').addEventListener('change', function () { loadLeads(0); });
  $('#fQ').addEventListener('input', function () { clearTimeout(qTimer); qTimer = setTimeout(function () { loadLeads(0); }, 350); });
  $('#more').addEventListener('click', function () { loadLeads(state.leads.length); });

  var seenIds = null;
  function loadLeads(offset) {
    var qs = 'limit=50&offset=' + offset + '&days=' + state.days +
      '&status=' + $('#fStatus').value + '&service=' + $('#fService').value + '&q=' + encodeURIComponent($('#fQ').value.trim());
    return api('/api/dash/leads?' + qs).then(function (r) {
      state.leads = offset ? state.leads.concat(r.items) : r.items;
      state.leadTotal = r.total;
      renderLeads();
    });
  }
  function stChip(st) { var s = STATUS_NAME[st] || STATUS[0]; return '<span class="st"><i style="background:' + s[2] + '"></i>' + s[1] + '</span>'; }
  function renderLeads() {
    var admin = state.role === 'admin';
    var prev = seenIds; seenIds = {};
    $('#leadsTable tbody').innerHTML = state.leads.length ? state.leads.map(function (l) {
      seenIds[l.id] = 1;
      var fresh = prev && !prev[l.id];
      return '<tr class="' + (admin ? 'click' : '') + (fresh ? ' new-row' : '') + '" data-id="' + l.id + '"' + (admin ? ' tabindex="0"' : '') + '>' +
        '<td>' + dtf.format(new Date(l.createdAt)) + '</td>' +
        (admin ? '<td><span class="chip">' + (l.shop || 'Trực tiếp') + '</span></td>' : '') +
        '<td>' + SERVICE[l.service] + '</td>' +
        '<td>' + esc(l.name) + '</td>' +
        (admin ? '<td>' + esc(l.phone) + '</td>' : '') +
        '<td>' + (admin
          ? '<select class="status-sel" data-id="' + l.id + '" aria-label="Trạng thái của ' + esc(l.name) + '">' + STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === l.status ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select>'
          : stChip(l.status)) + '</td></tr>';
    }).join('') : '<tr class="empty-row"><td colspan="6">Chưa có đăng ký nào trong khoảng thời gian và bộ lọc này.</td></tr>';
    $('#leadCount').textContent = 'Hiển thị ' + nf.format(state.leads.length) + ' trên ' + nf.format(state.leadTotal) + ' đăng ký';
    $('#more').hidden = state.leads.length >= state.leadTotal;
  }
  $('#leadsTable tbody').addEventListener('change', function (e) {
    var sel = e.target.closest('.status-sel'); if (!sel) return;
    api('/api/dash/leads/' + sel.getAttribute('data-id'), { method: 'PATCH', body: { status: sel.value } })
      .then(function () { toast('Đã cập nhật trạng thái: <b>' + STATUS_NAME[sel.value][1] + '</b>'); scheduleRefresh(); })
      .catch(function (err) { toast(esc(err.message)); });
  });
  function openLeadFromRow(e) {
    if (state.role !== 'admin' || e.target.closest('select')) return;
    var tr = e.target.closest('tr[data-id]'); if (!tr) return;
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    var l = state.leads.filter(function (x) { return String(x.id) === tr.getAttribute('data-id'); })[0];
    if (l) openLead(l);
  }
  $('#leadsTable tbody').addEventListener('click', openLeadFromRow);
  $('#leadsTable tbody').addEventListener('keydown', openLeadFromRow);

  var curLead = null;
  var DETAIL = { jobNow: 'Công việc hiện tại', jobWant: 'Công việc mong muốn', jp: 'Tiếng Nhật', area: 'Khu vực làm việc', when: 'Thời điểm', budget: 'Ngân sách' };
  function openLead(l) {
    curLead = l;
    $('#ldTitle').textContent = l.name;
    $('#ldSub').textContent = SERVICE[l.service] + ', ' + dtf.format(new Date(l.createdAt));
    var rows = [
      ['Quán giới thiệu', (l.shop ? l.shop + ', ' : '') + l.shopName],
      ['Điện thoại', '<a href="tel:' + esc(l.phone.replace(/[^0-9+]/g, '')) + '">' + esc(l.phone) + '</a>', true],
      ['Email', l.email ? '<a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a>' : '', true],
      ['Khu vực', l.address]
    ];
    Object.keys(DETAIL).forEach(function (k) { if (l.details && l.details[k]) rows.push([DETAIL[k], l.details[k]]); });
    rows.push(['Ghi chú của khách', l.note]);
    $('#ldInfo').innerHTML = rows.filter(function (r) { return r[1]; }).map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + (r[2] ? r[1] : esc(r[1])) + '</dd>'; }).join('');
    $('#ldStatus').innerHTML = STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === l.status ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('');
    $('#ldForm').elements.staffNote.value = l.staffNote || '';
    $('#ldSaved').textContent = '';
    $('#leadDlg').showModal();
  }
  $('#ldForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    api('/api/dash/leads/' + curLead.id, { method: 'PATCH', body: { status: f.elements.status.value, staffNote: f.elements.staffNote.value } })
      .then(function () { $('#ldSaved').textContent = 'Đã lưu'; scheduleRefresh(); })
      .catch(function (err) { toast(esc(err.message)); });
  });

  // ================= DIALOG CLOSE / PERIOD =================
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) e.target.closest('dialog').close();
    if (e.target.tagName === 'DIALOG') e.target.close();
  });
  $$('.filters button').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('.filters button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      state.days = +b.getAttribute('data-days');
      seenIds = null;
      refresh(true);
    });
  });
  var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (state.overview) renderOverview(null); }, 200); });

  // ================= REALTIME =================
  // Server-Sent Events first; Hostinger ends each stream after ~90 s and the browser reconnects.
  // If streams are blocked, fall back to polling every 10 seconds.
  var es = null, pollTimer = null, errors = 0;
  function setLive(mode) {
    var el = $('#live');
    el.className = 'live ' + (mode === 'sse' ? 'on' : mode === 'poll' ? 'poll' : '');
    $('#liveTxt').textContent = mode === 'sse' ? 'Cập nhật trực tiếp' : mode === 'poll' ? 'Tự cập nhật mỗi 10 giây' : 'Đang kết nối';
  }
  function startLive() {
    stopLive();
    if (!window.EventSource) return startPoll();
    es = new EventSource('/api/dash/stream');
    es.addEventListener('hello', function () { errors = 0; setLive('sse'); });
    es.addEventListener('scan', scheduleRefresh);
    es.addEventListener('click', scheduleRefresh);
    es.addEventListener('lead-update', scheduleRefresh);
    es.addEventListener('lead', function (m) {
      var d = {}; try { d = JSON.parse(m.data); } catch (e) { /* ignore */ }
      toast('Đăng ký mới: <b>' + (SERVICE[d.service] || '') + '</b>' + (state.role === 'admin' ? ' từ ' + (d.shop || 'truy cập trực tiếp') : ''));
      scheduleRefresh();
    });
    es.onerror = function () {
      errors++;
      if (errors >= 3) { es.close(); es = null; startPoll(); }
    };
  }
  function startPoll() {
    setLive('poll');
    clearInterval(pollTimer);
    pollTimer = setInterval(function () { if (!document.hidden) refresh(false); }, 10000);
  }
  function stopLive() { if (es) { es.close(); es = null; } clearInterval(pollTimer); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && state.role) refresh(false); });

  boot();
})();
