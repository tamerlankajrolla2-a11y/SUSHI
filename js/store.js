/* Sensei Sushi — слой данных.
   Два режима:
   1) Локальный (по умолчанию) — меню из data/menu.json, правки админа
      лежат в этом браузере (localStorage). Заказы уходят в WhatsApp.
   2) Облачный (Supabase) — меню и заказы в базе: заказы видны в админке
      с любого устройства, правки меню сразу у всех. Настраивается в админке.
*/
window.Store = (function () {
  'use strict';

  var LS_MENU = 'sensei_menu', LS_CFG = 'sensei_sb', LS_ORD = 'sensei_orders_local', LS_TOK = 'sensei_token';

  function ls(k, v) {
    try {
      if (v === undefined) { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; }
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v));
      return v;
    } catch (e) { return null; }
  }

  var cfg = ls(LS_CFG) || null;      // {url, key}
  var token = ls(LS_TOK) || null;    // {access_token, expires_at, email}
  function cloud() { return !!(cfg && cfg.url && cfg.key); }
  function base() { return String(cfg.url).replace(/\/+$/, ''); }
  function headers(auth) {
    var h = { 'apikey': cfg.key, 'Content-Type': 'application/json' };
    h.Authorization = 'Bearer ' + (auth && token && token.access_token ? token.access_token : cfg.key);
    return h;
  }
  function req(path, opt) {
    opt = opt || {};
    return fetch(base() + path, {
      method: opt.method || 'GET',
      headers: Object.assign(headers(opt.auth !== false), opt.headers || {}),
      body: opt.body ? JSON.stringify(opt.body) : undefined
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = t; }
        if (!r.ok) { var e2 = new Error((d && (d.message || d.error_description || d.msg || d.error)) || ('HTTP ' + r.status)); e2.status = r.status; throw e2; }
        return d;
      });
    });
  }

  /* ---------- меню ---------- */
  var cache = null;
  var DEFAULT_CATS = [
    { id: 'sets', name: 'Сеты', icon: '🍱', view: 'cards', sort: 'price', on: true },
    { id: 'rolls', name: 'Роллы', icon: '🍣', view: 'list', sort: 'manual', on: true },
    { id: 'pizza', name: 'Пиццы', icon: '🍕', view: 'list', sort: 'manual', on: true },
    { id: 'burgers', name: 'Суши-бургеры', icon: '🍔', view: 'list', sort: 'manual', on: true },
    { id: 'chicken', name: 'Крылышки и закуски', icon: '🍗', view: 'list', sort: 'manual', on: true },
    { id: 'new', name: 'Новинки', icon: '✨', view: 'list', sort: 'manual', on: true }
  ];

  function fromFile() {
    var p = location.pathname.replace(/[^/]*$/, '');
    return fetch(p + 'data/menu.json?v=' + Date.now()).then(function (r) {
      if (!r.ok) throw new Error('menu.json не найден');
      return r.json();
    });
  }

  // приводит любые версии данных к текущему виду
  function normalize(d) {
    d = d || {};
    var s = d.settings = d.settings || {};
    if (!d.items && d.sets) d.items = d.sets;
    delete d.sets;
    d.items = (d.items || []).map(function (x) {
      x.cat = x.cat || 'sets';
      x.on = x.on !== false;
      x.price = +x.price || 0;
      x.old = +x.old || 0;
      x.chips = x.chips || [];
      x.groups = x.groups || [];
      x.desc = x.desc || '';
      x.img = x.img || '';
      return x;
    });
    if (!d.cats || !d.cats.length) d.cats = JSON.parse(JSON.stringify(DEFAULT_CATS));
    var known = {};
    d.cats.forEach(function (c) { c.on = c.on !== false; c.view = c.view || 'list'; c.sort = c.sort || 'manual'; known[c.id] = 1; });
    d.items.forEach(function (x) {
      if (!known[x.cat]) { d.cats.push({ id: x.cat, name: x.cat, icon: '', view: 'list', sort: 'manual', on: true }); known[x.cat] = 1; }
    });
    d.promo = d.promo || {};
    if (!d.promo.gift) d.promo.gift = { on: !!s.gift, title: s.gift || 'Подарок при первом заказе', text: '' };
    d.promo.codes = d.promo.codes || [];
    // «Мега выгода»: зачёркнутая цена = настоящая + add, надпись на всех товарах
    if (!d.promo.mega) d.promo.mega = { on: true, title: 'Мега выгода', add: 2000 };
    d.promo.mega.on = d.promo.mega.on !== false;
    d.promo.mega.add = +d.promo.mega.add || 0;
    if (d.promo.mega.title == null) d.promo.mega.title = 'Мега выгода';
    // блок «О нас»
    var ab = d.about = d.about || {};
    ab.on = ab.on !== false;
    if (ab.title == null) ab.title = 'О нас';
    if (ab.text == null) ab.text = 'Sensei Sushi — суши, пицца и крылышки с доставкой по Петропавловску. Готовим каждый заказ и привозим горячим.';
    ab.address = ab.address || '';
    ab.points = Array.isArray(ab.points) ? ab.points : [];
    if (!s.delivery) s.delivery = { price: 0, freeFrom: 0, note: s.deliveryNote || 'доставку подтвердит оператор' };
    s.delivery.price = +s.delivery.price || 0;
    s.delivery.freeFrom = +s.delivery.freeFrom || 0;
    s.minOrder = +s.minOrder || 0;
    s.pay = s.pay && s.pay.length ? s.pay : ['Kaspi', 'Наличными'];
    d.rev = +d.rev || 1;
    return d;
  }
  function hasItems(d) { return !!(d && ((d.items && d.items.length) || (d.sets && d.sets.length))); }

  // keepLocal=true — для админки: локальные правки не трогаем, даже если файл сайта новее
  function loadMenu(force, keepLocal) {
    if (cache && !force) return Promise.resolve(cache);
    var local = ls(LS_MENU);
    if (!hasItems(local)) local = null;
    if (cloud()) {
      return req('/rest/v1/menu?id=eq.1&select=data', { auth: false })
        .then(function (rows) {
          var d = rows && rows[0] && rows[0].data;
          // в базе может лежать пустая заготовка — тогда берём файл сайта
          if (hasItems(d)) return normalize(d);
          return fromFile().then(normalize);
        })
        .catch(function () { return (local ? normalize(local) : fromFile().then(normalize)); })
        .then(function (d) { cache = d; return d; });
    }
    if (local && keepLocal) { cache = normalize(local); return Promise.resolve(cache); }
    return fromFile().then(normalize).then(function (file) {
      // локальная копия старее файла сайта — значит меню обновили, показываем новое
      cache = (local && (+local.rev || 1) >= file.rev) ? normalize(local) : file;
      return cache;
    }, function (e) {
      if (local) { cache = normalize(local); return cache; }
      throw e;
    });
  }

  function saveMenu(d) {
    cache = normalize(d);
    if (cloud()) {
      return req('/rest/v1/menu?id=eq.1', {
        method: 'PATCH', body: { data: cache, updated_at: new Date().toISOString() },
        headers: { Prefer: 'return=minimal' }
      }).then(function () { ls(LS_MENU, cache); return true; });
    }
    try { localStorage.setItem(LS_MENU, JSON.stringify(cache)); }
    catch (e) { return Promise.reject(new Error('в браузере кончилось место — уберите часть загруженных фото')); }
    return Promise.resolve(true);
  }

  function resetMenu() { ls(LS_MENU, null); cache = null; return fromFile().then(normalize).then(function (d) { cache = d; return d; }); }
  function fileRev() { return fromFile().then(function (d) { return +d.rev || 1; }); }

  /* ---------- заказы ---------- */
  var BASE_FIELDS = ['created_at', 'status', 'name', 'phone', 'address', 'when', 'pay', 'first', 'comment', 'items', 'total'];
  function createOrder(o) {
    o.created_at = o.created_at || new Date().toISOString();
    o.status = o.status || 'new';
    if (cloud()) {
      var post = function (body) { return req('/rest/v1/orders', { method: 'POST', auth: false, body: body, headers: { Prefer: 'return=minimal' } }); };
      return post(o).catch(function () {
        // таблица старого образца без новых колонок — шлём только базовые поля
        var b = {}; BASE_FIELDS.forEach(function (k) { if (o[k] !== undefined) b[k] = o[k]; });
        return post(b);
      }).then(function () { return true; }).catch(function () { return false; });
    }
    var all = ls(LS_ORD) || [];
    o.id = Date.now();
    all.unshift(o);
    ls(LS_ORD, all.slice(0, 300));
    return Promise.resolve(true);
  }

  function listOrders(limit) {
    limit = limit || 100;
    if (cloud()) return req('/rest/v1/orders?select=*&order=created_at.desc&limit=' + limit);
    return Promise.resolve((ls(LS_ORD) || []).slice(0, limit));
  }

  function setStatus(id, status) {
    if (cloud()) return req('/rest/v1/orders?id=eq.' + id, { method: 'PATCH', body: { status: status }, headers: { Prefer: 'return=minimal' } });
    var all = ls(LS_ORD) || [];
    all.forEach(function (o) { if (String(o.id) === String(id)) o.status = status; });
    ls(LS_ORD, all);
    return Promise.resolve(true);
  }

  /* ---------- вход в облако ---------- */
  function login(email, pass) {
    return req('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email: email, password: pass } })
      .then(function (d) {
        token = { access_token: d.access_token, email: email, expires_at: Date.now() + (d.expires_in || 3600) * 1000 };
        ls(LS_TOK, token);
        return token;
      });
  }
  function logout() { token = null; ls(LS_TOK, null); }
  function authed() { return !!(token && token.access_token && token.expires_at > Date.now()); }

  function setCloud(c) { cfg = (c && c.url && c.key) ? { url: c.url.trim(), key: c.key.trim() } : null; ls(LS_CFG, cfg); cache = null; }
  function getCloud() { return cfg; }
  function test() {
    if (!cloud()) return Promise.reject(new Error('Не заполнены адрес и ключ'));
    return req('/rest/v1/menu?select=id&limit=1', { auth: false }).then(function () { return true; });
  }

  return {
    loadMenu: loadMenu, saveMenu: saveMenu, resetMenu: resetMenu, fromFile: fromFile, fileRev: fileRev, normalize: normalize,
    createOrder: createOrder, listOrders: listOrders, setStatus: setStatus,
    login: login, logout: logout, authed: authed, user: function () { return token && token.email; },
    setCloud: setCloud, getCloud: getCloud, isCloud: cloud, test: test
  };
})();
