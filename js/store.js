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
      method: opt.method || 'GET', headers: h, cache: 'no-store', keepalive: !!opt.keepalive,
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
    { id: 'daily', name: 'Акция дня', icon: '🔥', view: 'list', sort: 'manual', on: true, sub: 'Роллы по спеццене каждый день', noMega: true },
    { id: 'new', name: 'Новинки', icon: '✨', view: 'list', sort: 'manual', on: true },
    { id: 'rolls', name: 'Роллы', icon: '🍣', view: 'list', sort: 'manual', on: true, sub: 'Порционные роллы, по 8 шт' },
    { id: 'pizza', name: 'Пиццы', icon: '🍕', view: 'list', sort: 'manual', on: true, sub: 'Все пиццы 30 см' },
    { id: 'chicken', name: 'Чикен', icon: '🍗', view: 'list', sort: 'manual', on: true, sub: 'Комбо и крылышки' },
    { id: 'dops', name: 'Допы', icon: '🥢', view: 'list', sort: 'manual', on: true, sub: 'Соусы, закуски и напитки', noMega: true, upsell: true },
    { id: 'burgers', name: 'Суши-бургеры', icon: '🍔', view: 'list', sort: 'manual', on: true }
  ];
  // меню от заказчика (ноябрь 2026): порционные роллы, чикен, допы — добавляются в меню один раз
  var I = 'img/m/';
  function R8(id, name, price, img, grp) { return { id: id, cat: 'rolls', name: name, price: price, img: I + img + '.webp', desc: '8 шт', grp: grp }; }
  // v5: акция дня, пиццы, новинки (по сообщениям заказчика 13.11)
  function D(id, name, price, img) { var x = { id: id, cat: 'daily', name: name, price: price, img: img ? I + img + '.webp' : '', desc: '10 шт' }; if (!img) x.icon = '🍣'; return x; }
  function P(id, name, price) { return { id: id, cat: 'pizza', name: name, price: price, img: I + id + '.webp', desc: '30 см' }; }
  function N(id, name, price, desc, on) { return { id: id, cat: 'new', name: name, price: price, img: I + id + '.webp', desc: desc, on: on !== false }; }
  var NEW5 = [
    D('dl-cezar-t', 'Цезарь темпура', 990, 'cezar-t'), D('dl-cezar-z', 'Цезарь запечённый', 1200, 'cezar-z'),
    D('dl-saki-t', 'Саки темпура', 1100, 'saki-t'), D('dl-america-t', 'Америка темпура', 1100),
    D('dl-crab-t', 'Краб темпура', 990), D('dl-filo-g', 'Филадельфия гриль', 1290),
    D('dl-fila', 'Филадельфия', 1290, 'fila'), D('dl-kalif', 'Калифорния', 1100, 'kalif'),
    D('dl-kalif-z', 'Калифорния запечённая', 1190, 'z-kalif'), D('dl-kappa', 'Каппа маки', 790, 'kappa'),
    D('dl-saki', 'Саки маки', 890, 'saki-m'),
    P('pz-pepperoni', 'Пепперони', 1590), P('pz-cheese', 'Сырная', 1590), P('pz-margarita', 'Маргарита', 1390),
    P('pz-caesar', 'Цезарь', 1390), P('pz-chicken', 'Куриная', 1390), P('pz-4seasons', '4 сезона', 1590),
    P('pz-mushroom', 'Курица с грибами', 1090),
    N('sb-chicken', 'Суши-бургер с курицей', 2800, 'Горячий, в хрустящей панировке'),
    N('sb-crab', 'Суши-бургер со снежным крабом', 2590, 'Горячий, в хрустящей панировке'),
    N('sb-salmon', 'Суши-бургер с сёмгой', 3000, 'Горячий, в хрустящей панировке'),
    N('sa-crab', 'Саше с миксом краба', 2290, 'Суши-сэндвич в хрустящей панировке'),
    N('sa-salmon', 'Саше с сёмгой', 2990, 'Суши-сэндвич в хрустящей панировке'),
    N('sa-chicken', 'Саше с курицей терияки', 2290, 'Суши-сэндвич в хрустящей панировке'),
    N('sushi-pizza', 'Суши-пицца', 4400, 'Хит продаж')
  ];
  var NEW_ITEMS = [
    R8('r-lava', 'Лава ролл', 2490, 'lava', 'Запечённые'), R8('r-vulkan', 'Вулкан хот', 2390, 'vulkan', 'Запечённые'),
    R8('r-gejsha', 'Поцелуй гейши', 2690, 'gejsha', 'Запечённые'), R8('r-z-fila', 'Запечённая филадельфия', 2690, 'z-fila', 'Запечённые'),
    R8('r-cezar-z', 'Цезарь запечённый', 2390, 'cezar-z', 'Запечённые'), R8('r-syrnyj', 'Ролл сырный', 2490, 'syrnyj', 'Запечённые'),
    R8('r-chiken-z', 'Запечённый чикен', 2390, 'chiken-z', 'Запечённые'), R8('r-z-kalif', 'Запечённая калифорния', 2490, 'z-kalif', 'Запечённые'),
    R8('r-saki-t', 'Саки темпура', 2390, 'saki-t', 'Жареные'), R8('r-chiken-t', 'Чикен темпура', 2190, 'chiken-t', 'Жареные'),
    R8('r-cezar-t', 'Цезарь темпура', 2290, 'cezar-t', 'Жареные'), R8('r-hokkajdo', 'Хоккайдо', 2590, 'hokkajdo', 'Жареные'),
    R8('r-kamikadze', 'Камикадзе', 2490, 'kamikadze', 'Жареные'), R8('r-tomato', 'Томато чикен', 2490, 'tomato', 'Жареные'),
    R8('r-sendvich', 'Японский сэндвич', 2590, 'sendvich', 'Жареные'),
    R8('r-fila', 'Филадельфия', 2590, 'fila', 'Холодные'), R8('r-kappa', 'Каппа маки', 1190, 'kappa', 'Холодные'),
    R8('r-kanada', 'Канада маки', 2690, 'kanada', 'Холодные'), R8('r-saki-m', 'Саки маки', 1590, 'saki-m', 'Холодные'),
    R8('r-kalif', 'Калифорния', 2390, 'kalif', 'Холодные'), R8('r-asahi-m', 'Асахи маки', 2390, 'asahi-m', 'Холодные'),
    R8('r-katana', 'Катана маки', 2690, 'katana', 'Холодные'),
    { id: 'c-large', cat: 'chicken', grp: 'Комбо', name: 'Комбо Large', price: 14990, img: I + 'c-large.webp', desc: '50 крылышек + 2 фри + 2 л колы + 4 соуса', tag: '👑 Для компании', tagColor: 'y' },
    { id: 'c-friends', cat: 'chicken', grp: 'Комбо', name: 'Комбо Friends', price: 12990, img: I + 'c-friends.webp', desc: '40 крылышек + 2 фри + 2 л колы + 4 соуса' },
    { id: 'c-family', cat: 'chicken', grp: 'Комбо', name: 'Комбо Family', price: 8990, img: I + 'c-family.webp', desc: '30 крылышек + 1 фри + 1 л колы + 2 соуса', tag: '🔥 Хит' },
    { id: 'c-middle', cat: 'chicken', grp: 'Комбо', name: 'Комбо Middle', price: 6990, img: I + 'wings.webp', desc: '20 крылышек + 1 фри + 1 л колы + 2 соуса' },
    { id: 'c-wings', cat: 'chicken', grp: 'Крылышки', name: 'Крылышки', price: 5600, img: I + 'wings.webp', desc: 'Хрустящие, в панировке. Выберите количество',
      opts: [{ n: '20 шт', p: 5600 }, { n: '30 шт', p: 7700 }, { n: '40 шт', p: 9900 }, { n: '50 шт', p: 12500 }, { n: '60 шт', p: 14500 }, { n: '70 шт', p: 16600 }, { n: '100 шт', p: 22900 }] },
    { id: 'd-soy', cat: 'dops', grp: 'Соусы', name: 'Соевый соус', price: 400, img: I + 'd-soy.webp', desc: '250 г' },
    { id: 'd-wasabi', cat: 'dops', grp: 'Соусы', name: 'Васаби', price: 100, img: I + 'd-wasabi.webp', desc: '40 г' },
    { id: 'd-white', cat: 'dops', grp: 'Соусы', name: 'Белый соус', price: 200, img: I + 'd-white.webp', desc: '40 г' },
    { id: 'd-jalap', cat: 'dops', grp: 'Соусы', name: 'Халапеньо', price: 200, img: I + 'd-jalap.webp', desc: '30 г' },
    { id: 'd-fri', cat: 'dops', grp: 'Закуски', name: 'Картофель фри', price: 1150, img: I + 'd-fri.webp', desc: '150 г + соус' },
    { id: 'd-nugget', cat: 'dops', grp: 'Закуски', name: 'Наггетсы', price: 1250, img: I + 'd-nugget.webp', desc: '8 шт + соус' },
    { id: 'd-wings', cat: 'dops', grp: 'Закуски', name: 'Крылышки', price: 1750, img: I + 'wings.webp', desc: 'Небольшая порция к заказу',
      opts: [{ n: '5 шт', p: 1750 }, { n: '10 шт', p: 2950 }] },
    { id: 'd-cola', cat: 'dops', grp: 'Напитки', name: 'Coca-Cola', price: 800, img: I + 'd-cola.webp', desc: '1 л' }
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
    d.items = d.items || [];
    if (!d.cats || !d.cats.length) d.cats = JSON.parse(JSON.stringify(DEFAULT_CATS));
    // разделы и меню v3: Сеты, Новинки, Роллы, Пиццы, Чикен, Допы — один раз, правки из админки потом не трогаем
    if ((+d.catsV || 1) < 3) {
      var byId = {}; d.cats.forEach(function (c) { byId[c.id] = c; });
      var ordered = DEFAULT_CATS.map(function (dc) {
        var c = byId[dc.id]; delete byId[dc.id];
        if (!c) return JSON.parse(JSON.stringify(dc));
        if (dc.id === 'rolls' || dc.id === 'chicken' || dc.id === 'dops') { c.name = dc.name; c.icon = dc.icon; c.sub = dc.sub; c.view = 'list'; }
        if (dc.id === 'dops') { c.noMega = true; c.upsell = true; }
        return c;
      });
      var used = {}; d.items.forEach(function (x) { used[x.cat] = 1; });
      d.cats = ordered.concat(d.cats.filter(function (c) { return byId[c.id] && (c.id !== 'portion' || used.portion); }));
      d.catsV = 3;
    }
    if ((+d.menuV || 1) < 3) {
      var have = {}; d.items.forEach(function (x) { have[x.id] = 1; });
      NEW_ITEMS.forEach(function (x) { if (!have[x.id]) d.items.push(JSON.parse(JSON.stringify(x))); });
      d.menuV = 3;
    }
    // v4: фото колы (если в сохранённом меню его ещё нет)
    if ((+d.menuV || 1) < 4) {
      d.items.forEach(function (x) { if (x.id === 'd-cola' && !x.img) { x.img = I + 'd-cola.webp'; delete x.icon; } });
      d.menuV = 4;
    }
    // v5: раздел «Акция дня», пиццы 30 см, новые позиции
    if ((+d.catsV || 1) < 5) {
      if (!d.cats.some(function (c) { return c.id === 'daily'; })) {
        var at = d.cats.findIndex(function (c) { return c.id === 'sets'; });
        d.cats.splice(at + 1, 0, JSON.parse(JSON.stringify(DEFAULT_CATS.filter(function (c) { return c.id === 'daily'; })[0])));
      }
      d.cats.forEach(function (c) { if (c.id === 'pizza' && !c.sub) c.sub = 'Все пиццы 30 см'; });
      d.catsV = 5;
    }
    if ((+d.menuV || 1) < 5) {
      var have5 = {}; d.items.forEach(function (x) { have5[x.id] = 1; });
      NEW5.forEach(function (x) { if (!have5[x.id]) d.items.push(JSON.parse(JSON.stringify(x))); });
      d.menuV = 5;
    }
    // v6: ответы заказчика — суши-пицца 4 400, акция дня по 10 шт, «Филадельфия гриль», грибная 1 090
    if ((+d.menuV || 1) < 6) {
      d.items.forEach(function (x) {
        if (x.id === 'sushi-pizza' && !(+x.price)) { x.price = 4400; x.on = true; }
        if (x.cat === 'daily' && /^dl-/.test(x.id) && !x.desc) x.desc = '10 шт';
        if (x.id === 'dl-filo-g' && x.name === 'Философия гриль') x.name = 'Филадельфия гриль';
        if (x.id === 'pz-mushroom' && +x.price === 1390) x.price = 1090;
      });
      d.menuV = 6;
    }
    d.items = d.items.map(function (x) {
      x.cat = x.cat || 'sets';
      x.on = x.on !== false;
      x.price = +x.price || 0;
      x.old = +x.old || 0;
      x.chips = x.chips || [];
      x.groups = x.groups || [];
      x.desc = x.desc || '';
      x.img = x.img || '';
      x.grp = x.grp || '';
      x.opts = (Array.isArray(x.opts) ? x.opts : []).map(function (o) { return { n: String(o.n || '').trim(), p: +o.p || 0 }; }).filter(function (o) { return o.n && o.p > 0; });
      if (x.opts.length) x.price = Math.min.apply(null, x.opts.map(function (o) { return o.p; }));
      return x;
    });
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
    return req('/order', { method: 'POST', body: o, keepalive: true }).then(function (r) { return (r && r.id) || true; }).catch(function () { return false; });
  }
  // Telegram-уведомления о заказах (бот на сервере)
  function tgInfo() { return req('/tg', { auth: true }); }
  function tgLink() { return req('/tg/link', { method: 'POST', auth: true, body: {} }); }
  function tgOff() { return req('/tg', { method: 'DELETE', auth: true }); }
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
    createOrder: createOrder, promoCheck: promoCheck, promoStats: promoStats, promoReset: promoReset, listOrders: listOrders, setStatus: setStatus, tgInfo: tgInfo, tgLink: tgLink, tgOff: tgOff,
    login: login, logout: logout, authed: authed, changePassword: changePassword,
    isCloud: function () { return true; }, api: API
  };
})();
