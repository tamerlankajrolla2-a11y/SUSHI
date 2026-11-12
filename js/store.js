/* Sensei Sushi — слой данных.
   Меню, заказы и вход в админку хранятся на сервере sites-api (Cloudflare Worker + база D1):
   что поменяли в админке — сразу видно на сайте у всех, заказы видны в админке с любого устройства.
   Если сервер недоступен, сайт показывает меню из data/menu.json (или последнюю сохранённую копию).
*/
window.Store = (function () {
  'use strict';

  var API = 'https://sites-api.tamerlankajrolla2.workers.dev', SITE = 'sensei';
  var LS_MENU = 'sensei_menu', LS_TOK = 'sensei_api_token';

  function ls(k, v) {
    try {
      if (v === undefined) { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; }
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v));
      return v;
    } catch (e) { return null; }
  }

  var token = ls(LS_TOK) || null;    // {token, exp}
  function authed() { return !!(token && token.token && token.exp > Date.now()); }
  function req(path, opt) {
    opt = opt || {};
    var h = { 'Content-Type': 'application/json' };
    if (opt.auth && authed()) h.Authorization = 'Bearer ' + token.token;
    return fetch(API + path + (path.indexOf('?') < 0 ? '?' : '&') + 'site=' + SITE, {
      method: opt.method || 'GET', headers: h, cache: 'no-store',
      body: opt.body !== undefined ? (typeof opt.body === 'string' ? opt.body : JSON.stringify(opt.body)) : undefined
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = t; }
        if (!r.ok) {
          var msg = (d && d.error) || ('HTTP ' + r.status);
          if (r.status === 401 && opt.auth) { logout(); msg = 'вход истёк, обновите страницу и войдите снова'; }
          if (r.status === 401 && !opt.auth) msg = 'неверный пароль';
          if (r.status === 413) msg = 'меню слишком большое — уберите часть загруженных фото';
          var e2 = new Error(msg); e2.status = r.status; throw e2;
        }
        return d;
      });
    });
  }

  /* ---------- меню ---------- */
  var cache = null;
  var DEFAULT_CATS = [
    { id: 'sets', name: 'Сеты', icon: '🍱', view: 'cards', sort: 'price', on: true },
    { id: 'new', name: 'Новинки', icon: '✨', view: 'list', sort: 'manual', on: true },
    { id: 'portion', name: 'Порционные роллы', icon: '🍙', view: 'list', sort: 'manual', on: true },
    { id: 'rolls', name: 'Роллы', icon: '🍣', view: 'list', sort: 'manual', on: true },
    { id: 'pizza', name: 'Пиццы', icon: '🍕', view: 'list', sort: 'manual', on: true },
    { id: 'chicken', name: 'Чикен', icon: '🍗', view: 'list', sort: 'manual', on: true },
    { id: 'dops', name: 'Допы', icon: '🥢', view: 'list', sort: 'manual', on: true },
    { id: 'burgers', name: 'Суши-бургеры', icon: '🍔', view: 'list', sort: 'manual', on: true }
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
    // разделы v2 (по просьбе заказчика): Сеты, Новинки, Порционные роллы, Роллы, Пиццы, Чикен, Допы — один раз
    if ((+d.catsV || 1) < 2) {
      var byId = {}; d.cats.forEach(function (c) { byId[c.id] = c; });
      var ordered = DEFAULT_CATS.map(function (dc) {
        var c = byId[dc.id]; delete byId[dc.id];
        if (!c) return JSON.parse(JSON.stringify(dc));
        if (dc.id === 'chicken' || dc.id === 'portion' || dc.id === 'dops') { c.name = dc.name; c.icon = dc.icon; }
        return c;
      });
      d.cats = ordered.concat(d.cats.filter(function (c) { return byId[c.id]; }));
      d.catsV = 2;
    }
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

  function loadMenu(force) {
    if (cache && !force) return Promise.resolve(cache);
    return req('/menu').then(function (r) {
      var d = r && r.data;
      if (hasItems(d)) { ls(LS_MENU, d); return normalize(d); }
      return fromFile().then(normalize);          // на сервере меню ещё нет — берём файл сайта
    }).catch(function () {
      var local = ls(LS_MENU);
      return hasItems(local) ? normalize(local) : fromFile().then(normalize);
    }).then(function (d) { cache = d; return d; });
  }

  function saveMenu(d) {
    cache = normalize(d);
    return req('/menu', { method: 'PUT', auth: true, body: JSON.stringify(cache) })
      .then(function () { ls(LS_MENU, cache); return true; });
  }

  // взять меню из файла data/menu.json и записать на сервер
  function resetMenu() {
    return fromFile().then(normalize).then(function (d) { return saveMenu(d).then(function () { return cache; }); });
  }
  function fileRev() { return fromFile().then(function (d) { return +d.rev || 1; }); }

  /* ---------- заказы ---------- */
  function createOrder(o) {
    return req('/order', { method: 'POST', body: o }).then(function () { return true; }).catch(function () { return false; });
  }
  // промокод: можно ли применить (сервер помнит номера телефонов). Старый сервер или нет сети — не мешаем заказу.
  function promoCheck(code, phone) {
    var t = new Promise(function (res) { setTimeout(function () { res({ allowed: true, offline: true }); }, 6000); });
    var q = req('/promo?code=' + encodeURIComponent(code) + '&phone=' + encodeURIComponent(phone || '')).then(function (r) {
      return r && typeof r.allowed === 'boolean' ? r : { allowed: true, offline: true };
    }).catch(function () { return { allowed: true, offline: true }; });
    return Promise.race([q, t]);
  }
  function promoStats() { return req('/promo/stats', { auth: true }); }
  function promoReset(code) { return req('/promo/uses?code=' + encodeURIComponent(code), { method: 'DELETE', auth: true }); }
  function listOrders(limit) { return req('/orders?limit=' + (limit || 200), { auth: true }); }
  function setStatus(id, status) { return req('/order?id=' + encodeURIComponent(id), { method: 'PATCH', auth: true, body: { status: status } }); }

  /* ---------- вход ---------- */
  function login(pass) {
    return req('/login', { method: 'POST', body: { password: pass } }).then(function (d) {
      token = { token: d.token, exp: d.exp }; ls(LS_TOK, token); return token;
    });
  }
  function logout() { token = null; ls(LS_TOK, null); }
  function changePassword(pw) { return req('/password', { method: 'POST', auth: true, body: { password: pw } }); }

  return {
    loadMenu: loadMenu, saveMenu: saveMenu, resetMenu: resetMenu, fromFile: fromFile, fileRev: fileRev, normalize: normalize,
    createOrder: createOrder, promoCheck: promoCheck, promoStats: promoStats, promoReset: promoReset, listOrders: listOrders, setStatus: setStatus,
    login: login, logout: logout, authed: authed, changePassword: changePassword,
    isCloud: function () { return true; }, api: API
  };
})();
