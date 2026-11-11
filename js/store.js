/* Sensei Sushi — слой данных.
   Работает в двух режимах:
   1) Локальный (по умолчанию) — меню берётся из data/menu.json,
      правки админа лежат в этом браузере (localStorage).
      Заказы уходят только в WhatsApp.
   2) Облачный (Supabase) — меню и заказы в базе. Заказы видны
      в админке с любого устройства. Настраивается в админке.
*/
window.Store = (function () {
  'use strict';

  var LS_MENU = 'sensei_menu';
  var LS_CFG = 'sensei_sb';
  var LS_ORD = 'sensei_orders_local';
  var LS_TOK = 'sensei_token';

  function ls(k, v) {
    try {
      if (v === undefined) { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; }
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v));
      return v;
    } catch (e) { return null; }
  }

  var cfg = ls(LS_CFG) || null;          // {url, key}
  var token = ls(LS_TOK) || null;        // {access_token, expires_at, email}
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
        if (!r.ok) { var e2 = new Error((d && (d.message || d.error_description || d.error)) || ('HTTP ' + r.status)); e2.status = r.status; throw e2; }
        return d;
      });
    });
  }

  /* ---------- меню ---------- */
  var cache = null;

  function fromFile() {
    var p = location.pathname.replace(/[^/]*$/, '');
    return fetch(p + 'data/menu.json?v=' + Date.now()).then(function (r) {
      if (!r.ok) throw new Error('menu.json не найден');
      return r.json();
    });
  }

  function normalize(d) {
    d = d || {};
    d.settings = d.settings || {};
    d.sets = (d.sets || []).map(function (s) {
      s.on = s.on !== false;
      s.price = +s.price || 0;
      s.old = +s.old || 0;
      s.chips = s.chips || [];
      s.groups = s.groups || [];
      return s;
    });
    return d;
  }

  function loadMenu(force) {
    if (cache && !force) return Promise.resolve(cache);
    var local = ls(LS_MENU);
    if (local && !(local.sets && local.sets.length)) local = null;
    if (cloud()) {
      return req('/rest/v1/menu?id=eq.1&select=data', { auth: false })
        .then(function (rows) {
          var d = rows && rows[0] && rows[0].data;
          // в базе может лежать пустая заготовка — тогда берём файл сайта
          if (d && d.sets && d.sets.length) return normalize(d);
          return fromFile().then(normalize);
        })
        .catch(function () { return (local ? normalize(local) : fromFile().then(normalize)); })
        .then(function (d) { cache = d; return d; });
    }
    if (local) { cache = normalize(local); return Promise.resolve(cache); }
    return fromFile().then(normalize).then(function (d) { cache = d; return d; });
  }

  function saveMenu(d) {
    cache = normalize(d);
    if (cloud()) {
      return req('/rest/v1/menu?id=eq.1', {
        method: 'PATCH', body: { data: cache, updated_at: new Date().toISOString() },
        headers: { Prefer: 'return=minimal' }
      }).then(function () { ls(LS_MENU, cache); return true; });
    }
    ls(LS_MENU, cache);
    return Promise.resolve(true);
  }

  function resetMenu() { ls(LS_MENU, null); cache = null; return fromFile().then(normalize).then(function (d) { cache = d; return d; }); }

  /* ---------- заказы ---------- */
  function createOrder(o) {
    o.created_at = o.created_at || new Date().toISOString();
    o.status = o.status || 'new';
    if (cloud()) {
      return req('/rest/v1/orders', { method: 'POST', auth: false, body: o, headers: { Prefer: 'return=minimal' } })
        .then(function () { return true; }).catch(function () { return false; });
    }
    var all = ls(LS_ORD) || [];
    o.id = Date.now();
    all.unshift(o);
    ls(LS_ORD, all.slice(0, 200));
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
    all.forEach(function (o) { if (o.id === id) o.status = status; });
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
    loadMenu: loadMenu, saveMenu: saveMenu, resetMenu: resetMenu, fromFile: fromFile,
    createOrder: createOrder, listOrders: listOrders, setStatus: setStatus,
    login: login, logout: logout, authed: authed, user: function () { return token && token.email; },
    setCloud: setCloud, getCloud: getCloud, isCloud: cloud, test: test
  };
})();
