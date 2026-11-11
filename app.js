/* Сонник — мини-приложение. Без движков и сборщиков. */
(function () {
  "use strict";

  var S = window.SonnikSearch;
  var CFG = window.APP_CONFIG || {};
  var PF = window.Platform || null;
  var AN = window.Analytics || { event: function () {}, once: function () {}, ready: function () {}, init: function () {} };
  var WEEK_DAYS = CFG.WEEK_DAYS || 7;

  /* ================= данные ================= */

  var CATS = [
    "Животные", "Люди и родня", "Дом и вещи", "Природа и стихии", "Еда и напитки",
    "Тело и здоровье", "События и действия", "Деньги и работа", "Транспорт и дорога",
    "Праздники и обряды", "Страхи и необычное"
  ];

  var MOODS = {
    good: { label: "к хорошему", cls: "mood-good" },
    warn: { label: "будьте внимательны", cls: "mood-warn" },
    mixed: { label: "зависит от деталей", cls: "mood-mixed" }
  };

  var DREAMS = (function () {
    var raw = Array.isArray(window.DREAMS) ? window.DREAMS : [];
    var seen = Object.create(null);
    var out = [];
    raw.forEach(function (d) {
      if (!d || typeof d !== "object" || !d.id || !d.title) return;
      var id = String(d.id);
      if (seen[id]) return;
      seen[id] = true;
      out.push({
        id: id,
        title: String(d.title),
        aliases: Array.isArray(d.aliases) ? d.aliases.map(String) : [],
        cat: d.cat ? String(d.cat) : "Страхи и необычное",
        mood: MOODS[d.mood] ? d.mood : "mixed",
        short: d.short ? String(d.short) : "",
        text: d.text ? String(d.text) : "",
        details: Array.isArray(d.details) ? d.details.filter(function (x) { return x && x.if && x.then; }) : [],
        tip: d.tip ? String(d.tip) : ""
      });
    });
    return out;
  })();

  var BY_ID = Object.create(null);
  DREAMS.forEach(function (d) { BY_ID[d.id] = d; });
  DREAMS.forEach(function (d) { if (CATS.indexOf(d.cat) < 0) CATS.push(d.cat); });

  var INDEX = S ? S.buildIndex(DREAMS) : [];

  /* ================= мелкие помощники ================= */

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : v);
      });
    }
    (Array.isArray(children) ? children : children == null ? [] : [children]).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }

  var ICONS = {
    "Животные": '<circle cx="6.5" cy="10" r="2"/><circle cx="10" cy="5.5" r="2"/><circle cx="14" cy="5.5" r="2"/><circle cx="17.5" cy="10" r="2"/><path d="M7.5 17.5c0-3 2-5.5 4.5-5.5s4.5 2.5 4.5 5.5c0 2-1.8 2.5-4.5 2.5s-4.5-.5-4.5-2.5z"/>',
    "Люди и родня": '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20c0-4 2.7-6 6-6s6 2 6 6"/><path d="M15.5 14.3c3 0 5.5 1.8 5.5 5.7"/>',
    "Дом и вещи": '<path d="M3 11l9-7 9 7"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
    "Природа и стихии": '<path d="M12 3c4 3.5 6 6.5 6 9.5a6 6 0 0 1-12 0C6 9.5 8 6.5 12 3z"/><path d="M12 21v-9"/><path d="M12 15l-2.5-2M12 13.5l2.5-2"/>',
    "Еда и напитки": '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z"/><path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3c0 2 2 2 2 4M12 3c0 2 2 2 2 4"/>',
    "Тело и здоровье": '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
    "События и действия": '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7z"/>',
    "Деньги и работа": '<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.4c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1 1.6 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.1 0-2.1-.5-2.6-1.4M12 6.3V8M12 16v1.7"/>',
    "Транспорт и дорога": '<path d="M4 16.5V12l2-5h12l2 5v4.5z"/><circle cx="8" cy="16.5" r="1.8"/><circle cx="16" cy="16.5" r="1.8"/><path d="M4 12h16"/>',
    "Праздники и обряды": '<rect x="4" y="10" width="16" height="10" rx="1.5"/><path d="M3 7h18v3H3zM12 7v13"/><path d="M12 7c-1.8-3-5-3.2-5-1.2S10 7 12 7zm0 0c1.8-3 5-3.2 5-1.2S14 7 12 7z"/>',
    "Страхи и необычное": '<path d="M6 20V10.5a6 6 0 0 1 12 0V20l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z"/><circle cx="10" cy="10.5" r="1"/><circle cx="14" cy="10.5" r="1"/>',
    moon: '<path d="M15 3.5a8.5 8.5 0 1 0 5.5 14.6A7 7 0 0 1 15 3.5z"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/>',
    card: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14.5 8.5a3 3 0 1 0 2 5 2.4 2.4 0 0 1-2-5z"/><path d="M6 16h6"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="15" r="1.2"/><circle cx="15" cy="9" r="1.2"/><circle cx="9" cy="15" r="1.2"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    save: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 19h14"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M15.5 13.2a2.3 2.3 0 1 0 1.5 4 1.9 1.9 0 0 1-1.5-4z"/>'
  };

  function icon(name) {
    var span = document.createElement("span");
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      (ICONS[name] || ICONS.moon) + "</svg>";
    return span.firstChild;
  }

  function catIcon(cat) {
    return h("span", { class: "cat-ico", "aria-hidden": "true" }, icon(cat));
  }

  function moodBadge(mood) {
    var m = MOODS[mood] || MOODS.mixed;
    return h("span", { class: "mood " + m.cls, text: m.label });
  }

  /* Сохранённое: читаем один раз при запуске (Platform.load), дальше держим в памяти и
     сохраняем изменённое через Platform.save (хранилище площадки, без неё — localStorage). */
  var KEY_RECENT = "sonnik_recent", KEY_WEEK = "sonnik_week";
  var store = {};
  store[KEY_RECENT] = [];
  store[KEY_WEEK] = null;
  function saveKeys(obj) {
    Object.keys(obj).forEach(function (k) { store[k] = obj[k]; });
    if (PF) PF.save(obj);
  }

  function seeded(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  function strSeed(str) {
    var x = 2166136261;
    for (var i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); }
    return x >>> 0;
  }

  function lowerFirst(s) { return s ? s.charAt(0).toLocaleLowerCase("ru") + s.slice(1) : s; }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  var toastTimer;
  function toast(msg, ms) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, ms || 2600);
  }

  /* ================= сон дня ================= */

  function dayNumber(date) {
    return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  }
  var dayOrder = null;
  function dreamOfDay(date) {
    if (!DREAMS.length) return null;
    if (!dayOrder) {
      // Постоянный «перемешанный» порядок: за N дней ни один сон не повторится.
      dayOrder = DREAMS.map(function (d) { return d.id; }).sort();
      var rnd = seeded(20261111);
      for (var i = dayOrder.length - 1; i > 0; i--) {
        var j = Math.floor(rnd() * (i + 1));
        var t = dayOrder[i]; dayOrder[i] = dayOrder[j]; dayOrder[j] = t;
      }
    }
    var n = dayNumber(date || new Date());
    return BY_ID[dayOrder[((n % dayOrder.length) + dayOrder.length) % dayOrder.length]];
  }
  function dateLabel(date) {
    try { return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }); }
    catch (e) { return ""; }
  }

  /* ================= недавно искали ================= */

  function getRecent() {
    var r = store[KEY_RECENT];
    return Array.isArray(r) ? r.filter(function (id) { return BY_ID[id]; }) : [];
  }
  function addRecent(id) {
    var old = getRecent();
    if (old[0] === id) return;           // уже первым — сохранять нечего
    var r = old.filter(function (x) { return x !== id; });
    r.unshift(id);
    saveKeys((function () { var o = {}; o[KEY_RECENT] = r.slice(0, 8); return o; })());
  }

  /* ================= текст для «поделиться» ================= */

  // Без угадывания рода: «Мне приснилось: Яйца. …». Если short уже начинается с названия — не повторяем его.
  function shareText(d) {
    var sh = (d.short || "").trim();
    if (!sh) return "Мне приснилось: " + d.title + " — Сонник";
    if (S.norm(sh).indexOf(S.norm(d.title)) === 0) return "Мне приснилось: " + sh + " — Сонник";
    return "Мне приснилось: " + d.title + ". " + sh + " — Сонник";
  }

  // Ссылка на сон: адрес приложения в площадке (config.js APP_URL), без него — текущий адрес.
  function shareUrl(d) {
    var base = PF ? PF.appUrl() : location.href.split("#")[0].split("?")[0];
    return base.split("#")[0] + "#dream=" + encodeURIComponent(d.id);
  }

  /* ================= навигация ================= */

  function parseHash() {
    var raw = location.hash.replace(/^#/, "");
    if (!raw) return { name: "home" };
    var eq = raw.indexOf("=");
    var key = eq >= 0 ? raw.slice(0, eq) : raw;
    var val = eq >= 0 ? raw.slice(eq + 1) : "";
    try { val = decodeURIComponent(val); } catch (e) { /* оставим как есть */ }
    if (key === "dream") return { name: "dream", id: val };
    if (key === "cat") return { name: "cat", cat: val };
    if (key === "q") return { name: "q", q: val.slice(0, MAX_Q) };
    if (key === "cats") return { name: "home", anchor: "cats" };
    if (key === "week") return { name: "week" };
    return { name: "home" };
  }

  var MAX_Q = 100;

  function depth() { return (history.state && history.state.depth) || 0; }

  function navigate(hash, replace) {
    var url = location.href.split("#")[0] + (hash ? "#" + hash : "");
    try {
      if (replace) history.replaceState({ depth: depth() }, "", url);
      else history.pushState({ depth: depth() + 1 }, "", url);
    } catch (e) {
      location.hash = hash;
      return;
    }
    render();
  }

  function goBack() {
    if (depth() > 0) history.back();
    else navigate("", true);
  }

  var lastHash = null;
  var firstRender = true;
  var alts = null; // {id, list} — «возможно, вы искали»
  // Откуда человек пришёл на следующий экран (для статистики): ставится перед переходом.
  var pendingSource = null;

  function render(force) {
    var hash = location.hash;
    if (!force && hash === lastHash) { pendingSource = null; return; }
    lastHash = hash;
    var app = document.getElementById("app");
    var r = parseHash();
    if (r.name === "cat" && CATS.indexOf(r.cat) < 0) {
      // Неизвестный раздел — просто главная.
      try { history.replaceState({ depth: depth() }, "", location.href.split("#")[0]); } catch (e) { /* ничего */ }
      lastHash = location.hash;
      r = { name: "home" };
    }
    if (r.name === "q") {
      // Слишком длинный запрос в адресе — укорачиваем и адрес.
      var want = "#q=" + encodeURIComponent(r.q);
      if (location.hash.length > want.length) {
        try { history.replaceState(history.state, "", location.href.split("#")[0] + want); } catch (e) { /* ничего */ }
        lastHash = location.hash;
      }
    }
    app.textContent = "";
    var focusEl = null;
    var src = pendingSource || (firstRender ? "link" : null);
    pendingSource = null;
    if (r.name === "dream") {
      focusEl = renderDream(app, r.id);
      if (src && BY_ID[r.id]) AN.event("dream_opened", { source: src, dream_id: r.id });
    }
    else if (r.name === "cat") focusEl = renderCat(app, r.cat);
    else if (r.name === "q") focusEl = renderNotFound(app, r.q);
    else if (r.name === "week") focusEl = renderWeek(app, src);
    else renderHome(app);

    if (r.anchor === "cats") {
      var c = document.getElementById("cats");
      if (c) { c.scrollIntoView(); c.focus({ preventScroll: true }); }
    } else {
      window.scrollTo(0, 0);
      if (!firstRender && focusEl) focusEl.focus({ preventScroll: true });
      else if (!firstRender) app.focus({ preventScroll: true });
    }
    document.title = r.name === "dream" && BY_ID[r.id] ? BY_ID[r.id].title + " — к чему снится | Сонник"
      : r.name === "week" ? "Мой сонник на неделю | Сонник" : "Сонник — что означает ваш сон";
    firstRender = false;
  }

  /* ================= поиск (поле + подсказки) ================= */

  var searchUid = 0;
  function searchForm(initial, labelText) {
    var uid = ++searchUid;
    var inputId = "q" + uid, listId = "sugg" + uid;
    var active = -1, items = [], timer;

    var input = h("input", {
      id: inputId, class: "search-input", type: "search", inputmode: "search",
      autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "search",
      placeholder: "Например: собака", maxlength: String(MAX_Q),
      role: "combobox", "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": listId
    });
    if (initial) input.value = initial;
    var list = h("ul", { id: listId, class: "suggest", role: "listbox", "aria-label": "Подсказки", hidden: true });
    var hint = h("p", { class: "search-hint", "aria-live": "polite" });

    function close() {
      list.hidden = true; list.textContent = "";
      items = []; active = -1;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }
    function setActive(i) {
      active = i;
      Array.prototype.forEach.call(list.children, function (li, k) { li.setAttribute("aria-selected", k === i ? "true" : "false"); });
      if (i >= 0) input.setAttribute("aria-activedescendant", list.children[i].id);
      else input.removeAttribute("aria-activedescendant");
    }
    function update() {
      var q = input.value.trim();
      if (q.length < 2) { close(); return; }
      items = S.search(INDEX, q, { suggest: true, limit: 6 }).map(function (r) { return r.d; });
      if (!items.length) { close(); return; }
      list.textContent = "";
      items.forEach(function (d, k) {
        list.appendChild(h("li", { id: listId + "-" + k, role: "option", "aria-selected": "false", "data-id": d.id }, [
          h("span", { text: d.title }), h("span", { class: "s-cat", text: d.cat })
        ]));
      });
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      active = -1;
      fitList();
    }
    // Список не должен уходить под экранную клавиатуру.
    function fitList() {
      if (list.hidden) return;
      var vv = window.visualViewport;
      var bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      var avail = Math.floor(bottom - list.getBoundingClientRect().top - 8);
      list.style.maxHeight = Math.max(avail, 110) + "px";
    }
    if (window.visualViewport) window.visualViewport.addEventListener("resize", fitList);
    input.addEventListener("focus", function () {
      if (!window.matchMedia || !window.matchMedia("(pointer: coarse)").matches) return;
      setTimeout(function () {
        var vv = window.visualViewport;
        var hgt = vv ? vv.height : window.innerHeight;
        if (input.getBoundingClientRect().top > hgt * 0.3) input.scrollIntoView({ block: "start", behavior: "smooth" });
        setTimeout(fitList, 350);
      }, 300);
    });
    function pick(d) {
      close();
      alts = null;
      AN.event("search", { found: "yes", method: "suggest" });
      pendingSource = "search";
      navigate("dream=" + encodeURIComponent(d.id));
    }
    function submit() {
      if (active >= 0 && items[active]) { pick(items[active]); return; }
      var q = input.value.trim().slice(0, MAX_Q);
      if (!q) {
        hint.textContent = "Напишите слово из сна — например, «собака» или «вода».";
        input.focus();
        return;
      }
      close();
      var strong = S.search(INDEX, q).filter(function (r) { return r.strong; });
      if (strong.length) {
        // Сразу открываем только уверенное совпадение; рядом — близкие уверенные варианты.
        var best = strong[0];
        var others = strong.slice(1).filter(function (r) { return r.score >= best.score - 15; }).slice(0, 3).map(function (r) { return r.d.id; });
        alts = others.length ? { id: best.d.id, list: others } : null;
        AN.event("search", { found: "yes", method: "enter" });
        pendingSource = "search";
        navigate("dream=" + encodeURIComponent(best.d.id));
      } else {
        // Только «похоже» или ничего — экран с вариантами на выбор.
        var found = S.search(INDEX, q).length ? "choice" : "no";
        var ev = { found: found, method: "enter" };
        // Чего не хватает в базе: сам запрос — только одно слово из строчных русских букв, 3–20.
        if (found === "no" && /^[а-яё]{3,20}$/.test(q)) ev.query = q;
        AN.event("search", ev);
        navigate("q=" + encodeURIComponent(q));
      }
    }

    input.addEventListener("input", function () { hint.textContent = ""; clearTimeout(timer); timer = setTimeout(update, 60); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" && items.length) { e.preventDefault(); setActive((active + 1) % items.length); }
      else if (e.key === "ArrowUp" && items.length) { e.preventDefault(); setActive(active <= 0 ? items.length - 1 : active - 1); }
      else if (e.key === "Escape" && !list.hidden) { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === "Enter") { e.preventDefault(); submit(); }
    });
    input.addEventListener("blur", function () { setTimeout(close, 150); });
    list.addEventListener("mousedown", function (e) { e.preventDefault(); });
    list.addEventListener("click", function (e) {
      var li = e.target.closest("li");
      if (li && BY_ID[li.getAttribute("data-id")]) pick(BY_ID[li.getAttribute("data-id")]);
    });

    var form = h("form", { class: "search", role: "search", action: "#", onsubmit: function (e) { e.preventDefault(); submit(); } }, [
      h("label", { class: "search-label", for: inputId, text: labelText || "Что вам приснилось?" }),
      h("div", { class: "search-box" }, [input, list]),
      h("button", { type: "submit", class: "btn btn-primary" }, "Толковать"),
      hint
    ]);
    form._input = input;
    return form;
  }

  /* ================= экраны ================= */

  function dreamLink(d, withShort, src) {
    return h("a", { class: "item", href: "#dream=" + encodeURIComponent(d.id), "data-src": src || null }, [
      h("span", { class: "item-title" }, [h("span", { text: d.title })]),
      withShort && d.short ? h("span", { class: "item-short", text: d.short }) : null
    ]);
  }

  function backButton() {
    return h("button", { type: "button", class: "back-link", onclick: goBack }, [icon("back"), "Назад"]);
  }

  function renderHome(app) {
    app.appendChild(searchForm(""));

    if (!DREAMS.length) {
      app.appendChild(h("div", { class: "card" }, h("p", { class: "lead", text: "База снов пока не загружена. Загляните чуть позже." })));
      return;
    }

    var recent = getRecent();
    if (recent.length) {
      app.appendChild(h("section", { class: "recent", "aria-label": "Недавно смотрели" }, [
        h("p", { class: "recent-title", text: "Недавно смотрели:" }),
        h("div", { class: "chips" }, recent.map(function (id) {
          return h("a", { class: "chip", href: "#dream=" + encodeURIComponent(id), "data-src": "recent", text: BY_ID[id].title });
        }))
      ]));
    }

    app.appendChild(todayCard());
    var inv = weekInvite("home");
    if (inv) app.appendChild(inv);

    var counts = {};
    DREAMS.forEach(function (d) { counts[d.cat] = (counts[d.cat] || 0) + 1; });
    app.appendChild(h("h2", { class: "section-title", id: "cats", tabindex: "-1", text: "Разделы сонника" }));
    app.appendChild(h("nav", { class: "cats", "aria-label": "Разделы" }, CATS.map(function (c) {
      var n = counts[c] || 0;
      return h("a", { class: "cat", href: "#cat=" + encodeURIComponent(c), "data-search": "category" }, [
        catIcon(c),
        h("span", null, [
          h("span", { class: "cat-name", text: c }),
          h("span", { class: "cat-count", text: n ? n + " " + plural(n, "сон", "сна", "снов") : "скоро" })
        ])
      ]);
    })));
  }

  function todayCard() {
    var now = new Date();
    var d = dreamOfDay(now);
    var card = h("section", { class: "card today", id: "today", "aria-labelledby": "todayTitle" });
    if (!d) return card;
    card.appendChild(h("div", { class: "today-label" }, [icon("star"), "Сон дня · " + dateLabel(now)]));
    card.appendChild(h("h2", { id: "todayTitle", text: d.title }));
    card.appendChild(moodBadge(d.mood));
    card.appendChild(h("p", { text: d.short }));
    card.appendChild(h("a", { class: "btn btn-primary btn-wide", href: "#dream=" + encodeURIComponent(d.id), "data-src": "day" }, "Читать толкование"));
    return card;
  }

  /* ================= «Мой сонник на неделю» (за рекламу) ================= */

  // Открыт ли сонник на неделю: день открытия хранится в sonnik_week.from (номер дня).
  // Держится WEEK_DAYS дней, включая день открытия. Вчерашний «завтрашний» день (смена
  // часового пояса) тоже считаем: разница -1 допустима.
  function weekState(date) {
    var w = store[KEY_WEEK];
    var from = w && typeof w.from === "number" ? w.from : null;
    if (from == null) return { open: false };
    var diff = dayNumber(date || new Date()) - from;
    if (diff < -1 || diff >= WEEK_DAYS) return { open: false, expired: diff >= WEEK_DAYS };
    return { open: true, from: from, left: WEEK_DAYS - Math.max(diff, 0) };
  }
  function weekUntilLabel(date) {
    var st = weekState(date);
    if (!st.open) return "";
    var now = date || new Date();
    return dateLabel(new Date(now.getFullYear(), now.getMonth(), now.getDate() + st.left - 1));
  }
  // 7 снов дня вперёд — тем же правилом, что «сон дня»: на завтра … +7 дней.
  function weekDreams(date) {
    var now = date || new Date(), out = [];
    for (var i = 1; i <= 7; i++) {
      var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12);
      out.push({ date: day, dream: dreamOfDay(day) });
    }
    return out;
  }
  function weekAvailable() { return weekState().open || !!(PF && PF.rewardedAvailable()); }

  // Приглашение (на главной под «Сном дня» и на экране сна дня).
  function weekInvite(src) {
    if (!DREAMS.length || !weekAvailable()) return null;
    var st = weekState();
    return h("section", { class: "card week-invite", id: src === "home" ? "weekInvite" : null, "aria-labelledby": "weekInvTitle-" + src }, [
      h("div", { class: "week-invite-head" }, [icon("calendar"), h("h2", { id: "weekInvTitle-" + src, text: "Мой сонник на неделю" })]),
      h("p", { text: st.open
        ? "Открыт до " + weekUntilLabel() + " включительно: сны дня на 7 дней вперёд с советом на каждый день."
        : "Сны дня на 7 дней вперёд — с коротким советом на каждый день." }),
      h("a", { class: "btn btn-wide" + (st.open ? " btn-primary" : ""), href: "#week", "data-src": src }, st.open ? "Смотреть мою неделю" : "Узнать, что ждёт на неделе")
    ]);
  }

  var weekNotice = null;   // {kind: 'ok'|'fail', text} — показать на экране недели один раз
  var adGrants = 0;        // сколько раз за этот запуск выдана награда (для автотеста)
  var adBusy = false;
  var weekSrc = "link";    // откуда пришли к предложению недели (home / day / link)

  var AD_FAIL_TEXT = {
    closed: "Реклама закрыта раньше конца — неделя не открылась. Можно попробовать ещё раз.",
    error: "Реклама сейчас недоступна. Попробуйте чуть позже.",
    timeout: "Реклама не загрузилась. Попробуйте чуть позже.",
    late: "Реклама пришла слишком поздно, поэтому неделя не открылась. Попробуйте ещё раз."
  };

  function renderWeek(app, src) {
    app.appendChild(backButton());
    var st = weekState();
    var t = h("h1", { tabindex: "-1", text: "Мой сонник на неделю" });
    var notice = null;
    if (weekNotice) {
      notice = h("p", { class: "notice notice-" + weekNotice.kind, role: "status", text: weekNotice.text });
      weekNotice = null;
    }
    if (st.open) {
      app.appendChild(h("div", { class: "card week-head" }, [t,
        h("p", { class: "lead", text: "Открыт до " + weekUntilLabel() + " включительно. Каждый день здесь — сны дня на 7 дней вперёд." })]));
      if (notice) app.appendChild(notice);
      var today = new Date();
      app.appendChild(h("ol", { class: "week-list" }, weekDreams(today).map(function (x, i) {
        var d = x.dream;
        if (!d) return null;
        return h("li", { class: "card week-day" }, [
          h("p", { class: "week-date", text: (i === 0 ? "Завтра, " : weekdayLabel(x.date) + ", ") + dateLabel(x.date) }),
          h("a", { class: "week-title", href: "#dream=" + encodeURIComponent(d.id), "data-src": "week" }, d.title),
          moodBadge(d.mood),
          d.tip ? h("p", { class: "week-tip" }, [h("b", { text: "Совет: " }), d.tip]) : null
        ]);
      })));
      app.appendChild(h("p", { style: "margin:18px 0" }, h("a", { class: "btn btn-wide", href: "#" }, "На главную")));
      return t;
    }
    var available = PF && PF.rewardedAvailable();
    var adBtn = h("button", { type: "button", class: "btn btn-primary btn-wide", id: "weekAdBtn" }, available ? "Смотреть рекламу и открыть" : "Пока недоступно");
    if (!available) adBtn.disabled = true;
    if (src && src !== "rerender") weekSrc = src;
    adBtn.addEventListener("click", function () { startWeekAd(weekSrc); });
    app.appendChild(h("div", { class: "card week-head" }, [t,
      h("p", { class: "lead", text: "Сны дня на 7 дней вперёд — с коротким советом на каждый день." }),
      h("ul", { class: "week-points" }, [
        h("li", { text: "Посмотрите короткую рекламу — неделя откроется сразу." }),
        h("li", { text: "Открывается на " + WEEK_DAYS + " дней, потом можно открыть снова." }),
        h("li", { text: "Толкования снов всегда бесплатны — реклама нужна только для недели." })
      ])
    ]));
    if (notice) app.appendChild(notice);
    app.appendChild(h("div", { class: "actions" }, [adBtn, h("a", { class: "btn btn-wide", href: "#" }, "На главную")]));
    if (available && src && src !== "rerender") AN.event("week_offer_shown", { source: src });
    return t;
  }

  function weekdayLabel(date) {
    try {
      var s = date.toLocaleDateString("ru-RU", { weekday: "long" });
      return s.charAt(0).toLocaleUpperCase("ru") + s.slice(1);
    } catch (e) { return ""; }
  }

  // Окно «ждём рекламу»: всё остальное не нажимается, есть «Отмена».
  function adWaitOverlay() {
    var cancel = h("button", { type: "button", class: "btn btn-wide" }, "Отмена");
    var box = h("div", { class: "ad-wait", role: "dialog", "aria-modal": "true", "aria-label": "Загружаем рекламу" }, [
      h("div", { class: "ad-wait-box" }, [
        h("div", { class: "spinner", "aria-hidden": "true" }),
        h("p", { role: "status", text: "Загружаем рекламу…" }),
        cancel
      ])
    ]);
    cancel.addEventListener("click", function () { if (PF) PF.cancelRewarded(); });
    function trap(e) { if (e.key === "Escape") { e.preventDefault(); if (PF) PF.cancelRewarded(); } }
    document.addEventListener("keydown", trap, true);
    document.body.appendChild(box);
    document.body.classList.add("is-ad-wait");
    var main = document.querySelector(".wrap");
    if (main) main.setAttribute("inert", "");
    cancel.focus();
    return function () {
      document.removeEventListener("keydown", trap, true);
      box.remove();
      document.body.classList.remove("is-ad-wait");
      if (main) main.removeAttribute("inert");
    };
  }

  function startWeekAd(src) {
    if (adBusy || !PF || weekState().open) return;
    adBusy = true;
    if (PF.banner) PF.banner.hide();
    var done = adWaitOverlay();
    PF.showRewarded({
      placement: "week",
      onLate: function () {
        AN.event("ad_reward_failed", { reason: "late" });
        weekNotice = { kind: "fail", text: AD_FAIL_TEXT.late };
        toast(AD_FAIL_TEXT.late, 5000);
        if (parseHash().name === "week") { pendingSource = "rerender"; render(true); }
      }
    }).then(function (res) {
      done();
      adBusy = false;
      if (PF.banner && !modal) PF.banner.show();
      if (res && res.ok) {
        adGrants++;
        var o = {}; o[KEY_WEEK] = { from: dayNumber(new Date()) };
        saveKeys(o);
        AN.event("week_unlocked", { source: src });
        weekNotice = { kind: "ok", text: "Готово! Сонник на неделю открыт до " + weekUntilLabel() + " включительно." };
        refreshInvite();
        pendingSource = "rerender";
        if (parseHash().name === "week") render(true); else navigate("week");
        return;
      }
      var reason = res && AD_FAIL_TEXT[res.reason] ? res.reason : "error";
      AN.event("ad_reward_failed", { reason: reason });
      weekNotice = { kind: "fail", text: AD_FAIL_TEXT[reason] };
      toast(AD_FAIL_TEXT[reason], 4500);
      if (parseHash().name === "week") {
        pendingSource = "rerender";
        render(true);
        var b = document.getElementById("weekAdBtn");
        if (b) b.focus({ preventScroll: true });
      }
    });
  }

  function refreshInvite() {
    var old = document.getElementById("weekInvite");
    if (!old) return;
    var inv = weekInvite("home");
    if (inv) old.parentNode.replaceChild(inv, old); else old.remove();
  }

  function renderDream(app, id) {
    var d = BY_ID[id];
    app.appendChild(backButton());
    if (!d) {
      var t = h("h1", { tabindex: "-1", text: "Такого сна пока нет в соннике" });
      app.appendChild(h("div", { class: "card empty" }, [t,
        h("p", { class: "lead", text: "Возможно, ссылка устарела. Попробуйте найти сон по слову." })]));
      app.appendChild(searchForm(""));
      return t;
    }

    addRecent(d.id);
    var title = h("h1", { tabindex: "-1", text: d.title });
    var topShare = h("button", { type: "button", class: "btn btn-share-top" }, [icon("share"), "Поделиться"]);
    topShare.addEventListener("click", function () { share(d, topShare); });
    var paras = d.text.split(/\n\s*\n/).filter(Boolean).map(function (p) { return h("p", { text: p }); });
    var art = h("article", { class: "card dream" }, [
      h("div", { class: "dream-head" }, [
        h("a", { class: "cat-tag", href: "#cat=" + encodeURIComponent(d.cat) }, [catIcon(d.cat), d.cat]),
        moodBadge(d.mood)
      ]),
      title,
      d.short ? h("p", { class: "short", text: d.short }) : null,
      topShare,
      h("div", { class: "text" }, paras)
    ]);
    app.appendChild(art);

    if (alts && alts.id === d.id) {
      var links = alts.list.filter(function (x) { return BY_ID[x]; });
      if (links.length) {
        app.appendChild(h("div", { class: "also" }, [
          h("p", { text: "Возможно, вы искали:" }),
          h("div", { class: "chips" }, links.map(function (x) {
            return h("a", { class: "chip", href: "#dream=" + encodeURIComponent(x), "data-src": "search", text: BY_ID[x].title });
          }))
        ]));
      }
    }

    if (d.details.length) {
      app.appendChild(h("section", { class: "card details", "aria-labelledby": "detTitle" }, [
        h("h2", { id: "detTitle", text: "Если во сне…" }),
        h("dl", null, d.details.map(function (x) {
          return h("div", { class: "case" }, [h("dt", { text: ifText(x.if) }), h("dd", { text: String(x.then) })]);
        }))
      ]));
    }

    if (d.tip) {
      app.appendChild(h("div", { class: "card tip" }, [icon("bulb"), h("div", null, [h("b", { text: "Совет на день" }), h("p", { text: d.tip })])]));
    }

    // Экран сна дня — приглашение в «Мой сонник на неделю».
    var tod = dreamOfDay(new Date());
    if (tod && tod.id === d.id) {
      var inv = weekInvite("day");
      if (inv) app.appendChild(inv);
    }

    var shareBtn = h("button", { type: "button", class: "btn btn-primary btn-wide" }, [icon("share"), "Поделиться"]);
    shareBtn.addEventListener("click", function () { share(d, shareBtn); });
    var cardBtn = h("button", { type: "button", class: "btn btn-wide" }, [icon("card"), "Открытка"]);
    cardBtn.addEventListener("click", function () { openPostcard(d, cardBtn); });
    app.appendChild(h("div", { class: "actions" }, [
      shareBtn,
      h("div", { class: "btn-row" }, [
        cardBtn,
        h("button", { type: "button", class: "btn", onclick: function () { anotherDream(d.id); } }, [icon("dice"), "Случайный сон"])
      ]),
      h("div", { class: "btn-row" }, [
        h("button", { type: "button", class: "btn", onclick: goBack }, [icon("back"), "Назад"]),
        h("a", { class: "btn", href: "#" }, "На главную")
      ])
    ]));

    var sim = similarInCat(d, 3);
    if (sim.length) {
      app.appendChild(h("section", { class: "similar" }, [
        h("h2", { class: "section-title", text: "Похожие сны" }),
        h("ul", { class: "list" }, sim.map(function (x) { return h("li", null, dreamLink(x, true, "similar")); }))
      ]));
    }
    return title;
  }

  // «Если …»: в части данных «Если» уже есть, в части — нет. Показываем везде одинаково.
  function ifText(s) {
    s = String(s).trim();
    if (/^если[\s,]/i.test(s)) return s.charAt(0).toLocaleUpperCase("ru") + s.slice(1);
    var first = s.split(/\s/)[0];
    var keep = first.length > 1 && first === first.toLocaleUpperCase("ru"); // НЛО и т.п.
    return "Если " + (keep ? s : lowerFirst(s));
  }

  // Тревожные сны не подсовываем как «похожие» к спокойным.
  var SCARY = ["Своя смерть", "Похороны", "Гроб", "Кладбище", "Покойник"];
  function isScary(x) { return SCARY.indexOf(x.title) >= 0; }

  function similarInCat(d, n) {
    var calm = !isScary(d) && d.mood !== "warn";
    var pool = DREAMS.filter(function (x) {
      if (x.cat !== d.cat || x.id === d.id) return false;
      if (isScary(x) && !isScary(d)) return false;
      if (calm && x.mood === "warn") return false;
      return true;
    });
    var rnd = seeded(strSeed(d.id));
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, n);
  }

  function anotherDream(currentId) {
    if (DREAMS.length < 2) return;
    var d;
    do { d = DREAMS[Math.floor(Math.random() * DREAMS.length)]; } while (d.id === currentId);
    alts = null;
    pendingSource = "random";
    navigate("dream=" + encodeURIComponent(d.id), true); // заменяем запись: «назад» не копит случайные сны
  }

  function renderCat(app, cat) {
    app.appendChild(backButton());
    var list = DREAMS.filter(function (d) { return d.cat === cat; })
      .sort(function (a, b) { return a.title.localeCompare(b.title, "ru"); });
    var t = h("h1", { tabindex: "-1", class: "section-title", style: "font-size:1.75rem;margin-top:8px" }, cat || "Раздел");
    app.appendChild(h("div", { class: "dream-head" }, [catIcon(cat), t]));
    if (!list.length) {
      app.appendChild(h("p", { class: "lead", text: "В этом разделе снов пока нет — скоро добавим." }));
    } else {
      app.appendChild(h("p", { class: "lead", text: list.length + " " + plural(list.length, "сон", "сна", "снов") + " — выберите, чтобы прочитать толкование." }));
      app.appendChild(h("ul", { class: "list" }, list.map(function (d) { return h("li", null, dreamLink(d, true, "category")); })));
    }
    return t;
  }

  function renderNotFound(app, q) {
    q = String(q || "").slice(0, MAX_Q);
    app.appendChild(backButton());
    var maybe = S.search(INDEX, q).slice(0, 5).map(function (r) { return r.d; });
    var t;
    if (maybe.length) {
      t = h("h1", { tabindex: "-1", text: "Точно такого сна нет" });
      app.appendChild(h("div", { class: "card empty" }, [
        t,
        h("p", { class: "lead" }, ["Вы искали: ", h("span", { class: "query", text: "«" + q + "»" })])
      ]));
      app.appendChild(h("h2", { class: "section-title", text: "Может быть, вы имели в виду:" }));
      app.appendChild(h("ul", { class: "list" }, maybe.map(function (d) { return h("li", null, dreamLink(d, true, "search")); })));
    } else {
      t = h("h1", { tabindex: "-1", text: "Такого сна пока нет в соннике" });
      app.appendChild(h("div", { class: "card empty" }, [
        t,
        h("p", { class: "lead" }, ["Вы искали: ", h("span", { class: "query", text: "«" + q + "»" })]),
        h("p", { class: "lead", text: "Попробуйте написать одно главное слово из сна — например, «собака», а не «большая лохматая собака»." })
      ]));
      var sim = S.similar(INDEX, q, 5);
      if (sim.length) {
        app.appendChild(h("h2", { class: "section-title", text: "Похоже по написанию:" }));
        app.appendChild(h("ul", { class: "list" }, sim.map(function (d) { return h("li", null, dreamLink(d, true, "search")); })));
      }
      if (sim.length < 3) {
        var extra = [], cand = [dreamOfDay(new Date())].concat(similarInCat(dreamOfDay(new Date()) || DREAMS[0] || {}, 4));
        cand.forEach(function (d) { if (d && d.id && sim.indexOf(d) < 0 && extra.indexOf(d) < 0 && extra.length < 3) extra.push(d); });
        if (extra.length) {
          app.appendChild(h("h2", { class: "section-title", text: "Почитайте другие сны:" }));
          app.appendChild(h("ul", { class: "list" }, extra.map(function (d) { return h("li", null, dreamLink(d, true, "search")); })));
        }
      }
    }
    app.appendChild(h("p", { style: "margin:18px 0" }, h("a", { class: "btn btn-wide", href: "#cats" }, "Посмотреть все разделы")));
    app.appendChild(searchForm(q, "Поискать другое слово"));
    return t;
  }

  /* ================= окна ================= */

  var modal = null; // {overlay, opener, onKey}

  function focusables(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'),
      function (el) { return el.offsetParent !== null || el === document.activeElement; }
    );
  }

  function openModal(titleText, body, opener, extraClass) {
    if (modal) {
      // Меняем содержимое уже открытого окна, история не трогается.
      var box = modal.overlay.querySelector(".modal");
      box.className = "modal" + (extraClass ? " " + extraClass : "");
      box.querySelector("h2").textContent = titleText;
      var old = box.querySelector(".modal-body");
      box.replaceChild(body, old);
      body.classList.add("modal-body");
      var f0 = focusables(body)[0];
      if (f0) f0.focus();
      return;
    }
    body.classList.add("modal-body");
    var closeBtn = h("button", { type: "button", class: "close", "aria-label": "Закрыть" }, icon("close"));
    var box2 = h("div", { class: "modal" + (extraClass ? " " + extraClass : ""), role: "dialog", "aria-modal": "true", "aria-labelledby": "modalTitle" }, [
      h("div", { class: "modal-head" }, [h("h2", { id: "modalTitle", text: titleText }), closeBtn]),
      body
    ]);
    var overlay = h("div", { class: "overlay" }, box2);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
    closeBtn.addEventListener("click", function () { closeModal(); });
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); closeModal(); return; }
      if (e.key === "Tab") {
        var f = focusables(box2);
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    document.getElementById("modalRoot").appendChild(overlay);
    document.body.style.overflow = "hidden";
    // Баннер не мешает окнам: пока окно открыто, баннера нет.
    if (PF && PF.banner) PF.banner.hide();
    modal = { overlay: overlay, opener: opener, onKey: onKey, url: null };
    try { history.pushState({ depth: depth(), modal: true }, "", location.href); } catch (e) { /* без истории тоже работает */ }
    var first = focusables(body)[0] || closeBtn;
    first.focus();
  }

  function closeModal(fromHistory) {
    if (!modal) return;
    var m = modal;
    modal = null;
    document.removeEventListener("keydown", m.onKey);
    m.overlay.remove();
    document.body.style.overflow = "";
    if (PF && PF.banner && !adBusy) PF.banner.show();
    if (m.url) { try { URL.revokeObjectURL(m.url); } catch (e) { /* ничего */ } }
    if (m.opener && document.contains(m.opener)) m.opener.focus();
    if (!fromHistory && history.state && history.state.modal) history.back();
  }

  /* ================= кнопки: слова не рвём ================= */

  // Слова на кнопках не переносятся посередине (CSS). Если подпись не влезает
  // в половину ширины — ряд встаёт в одну колонку; если и так тесно — ужимаем поля.
  function overflows(el) { return el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1; }
  function fitButtons() {
    var rows = document.querySelectorAll(".btn-row, .modal .stack");
    var btns = document.querySelectorAll(".btn");
    var i, j;
    for (i = 0; i < rows.length; i++) rows[i].classList.remove("one-col");
    for (i = 0; i < btns.length; i++) { btns[i].classList.remove("btn-tight"); btns[i].style.fontSize = ""; }
    for (i = 0; i < rows.length; i++) {
      var kids = rows[i].querySelectorAll(".btn");
      for (j = 0; j < kids.length; j++) if (overflows(kids[j])) { rows[i].classList.add("one-col"); break; }
    }
    var tight = [];
    for (i = 0; i < btns.length; i++) if (overflows(btns[i])) { btns[i].classList.add("btn-tight"); tight.push(btns[i]); }
    // Совсем крайний случай (узкий телефон и шрифт 200%): одно длинное слово шире
    // кнопки — чуть уменьшаем шрифт этой кнопки, но не рвём слово.
    tight.forEach(function (b) {
      for (var k = 0; k < 6 && overflows(b); k++) {
        var fs = parseFloat(getComputedStyle(b).fontSize);
        b.style.fontSize = Math.floor(fs * Math.max(0.8, (b.clientWidth - 2) / b.scrollWidth)) + "px";
      }
    });
  }
  var fitQueued = false;
  function queueFit() {
    if (fitQueued) return;
    fitQueued = true;
    (window.requestAnimationFrame || setTimeout)(function () { fitQueued = false; fitButtons(); });
  }
  function watchButtons() {
    if (window.MutationObserver) new MutationObserver(queueFit).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", queueFit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueFit, function () {});
    queueFit();
  }

  /* ================= поделиться ================= */

  // Компьютер: главный указатель — мышь (точный и с наведением), или тача нет вовсе.
  // Ноутбук с сенсорным экраном и мышью — тоже компьютер.
  function isDesktop() {
    var mm = window.matchMedia;
    var mouse = !!(mm && mm("(pointer: fine)").matches && mm("(hover: hover)").matches);
    var noTouch = typeof navigator.maxTouchPoints === "number"
      ? navigator.maxTouchPoints === 0
      : !("ontouchstart" in window);
    return mouse || noTouch;
  }

  // Решение Романа 11 ноя: на компьютере всегда наше окно (в системном меню
  // ВК и ОК обычно нет); на телефоне и планшете — системное меню, если оно есть.
  // В ВК и ОК — всегда наше окно: первая кнопка там — «поделиться» самой площадки.
  function share(d, opener) {
    var text = shareText(d), url = shareUrl(d);
    if (navigator.share && !isDesktop() && !(PF && PF.nativeShareChannel())) {
      AN.event("share_clicked", { channel: "system", dream_id: d.id });
      navigator.share({ title: "Сонник: " + d.title, text: text, url: url }).catch(function (e) {
        if (e && e.name === "AbortError") return;
        openShareModal(d, opener);
      });
      return;
    }
    openShareModal(d, opener);
  }

  function openShareModal(d, opener) {
    var text = shareText(d), url = shareUrl(d);
    var vk = "https://vk.com/share.php?url=" + encodeURIComponent(url) + "&title=" + encodeURIComponent(text);
    var ok = "https://connect.ok.ru/offer?url=" + encodeURIComponent(url) +
      "&title=" + encodeURIComponent("Сонник: " + d.title) + "&description=" + encodeURIComponent(text);
    var native = PF ? PF.nativeShareChannel() : "";
    var links = !PF || PF.externalLinksAllowed();
    var mark = function (ch) { return function () { AN.event("share_clicked", { channel: ch, dream_id: d.id }); }; };
    // Своя площадка — её окном «поделиться»; другая сеть — ссылкой, если площадка разрешает ссылки.
    function netButton(ch, cls, label, href) {
      if (native === ch) {
        var b = h("button", { type: "button", class: "btn " + cls + " btn-wide" }, label);
        b.addEventListener("click", function () {
          mark(ch)();
          PF.shareNative({ text: text, url: url }).catch(function () { /* закрыли окно площадки — ничего */ });
        });
        return b;
      }
      if (!links) return null;
      return h("a", { class: "btn " + cls + " btn-wide", href: href, target: "_blank", rel: "noopener", onclick: mark(ch) }, label);
    }
    var copyBtn = h("button", { type: "button", class: "btn btn-wide" }, [icon("copy"), "Скопировать текст"]);
    copyBtn.addEventListener("click", function () {
      mark("copy")();
      copyText(text + "\n" + url).then(function (okk) {
        toast(okk ? "Текст скопирован — вставьте его в сообщение" : "Не получилось скопировать");
      });
    });
    var cardBtn = h("button", { type: "button", class: "btn btn-wide" }, [icon("card"), "Открытка со сном"]);
    cardBtn.addEventListener("click", function () { openPostcard(d, opener); });
    var vkBtn = netButton("vk", "btn-vk", native === "vk" ? "Поделиться ВКонтакте" : "ВКонтакте", vk);
    var okBtn = netButton("ok", "btn-ok", native === "ok" ? "Поделиться в Одноклассниках" : "Одноклассники", ok);
    var nets = native === "ok" ? [okBtn, vkBtn] : [vkBtn, okBtn];
    var parts = [
      h("p", { class: "share-preview", text: text + " " + url }),
      h("div", { class: "stack" }, nets.concat([copyBtn, cardBtn]))
    ];
    // На компьютере (и в ВК/ОК) системное меню — маленькой второстепенной кнопкой.
    if (navigator.share && (isDesktop() || native)) {
      var other = h("button", { type: "button", class: "link-btn share-other" }, "Другие приложения…");
      other.addEventListener("click", function () {
        mark("system")();
        navigator.share({ title: "Сонник: " + d.title, text: text, url: url }).catch(function () { /* закрыли меню — ничего */ });
      });
      parts.push(h("p", { class: "share-other-wrap" }, other));
    }
    var body = h("div", null, parts);
    openModal("Поделиться сном", body, opener);
  }

  function copyText(str) {
    return PF ? PF.copyText(str) : Promise.resolve(false);
  }

  /* ================= открытка ================= */

  function wrapLines(ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], line = "";
    words.forEach(function (w) {
      var test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }

  function drawMoon(ctx, x, y, r) {
    var glow = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.6);
    glow.addColorStop(0, "rgba(255,226,150,0.35)");
    glow.addColorStop(1, "rgba(255,226,150,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill();
    var off = document.createElement("canvas");
    off.width = off.height = Math.ceil(r * 2 + 4);
    var o = off.getContext("2d");
    o.fillStyle = "#f6d27f";
    o.beginPath(); o.arc(r + 2, r + 2, r, 0, Math.PI * 2); o.fill();
    o.globalCompositeOperation = "destination-out";
    o.beginPath(); o.arc(r + 2 + r * 0.55, r + 2 - r * 0.25, r * 0.85, 0, Math.PI * 2); o.fill();
    ctx.drawImage(off, x - r - 2, y - r - 2);
  }

  function makePostcard(d) {
    var W = 1080, H = 1080;
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var ctx = c.getContext("2d");
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0a1230"); g.addColorStop(0.55, "#17276a"); g.addColorStop(1, "#33246e");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    var rnd = seeded(strSeed(d.id) || 7);
    for (var i = 0; i < 170; i++) {
      var sx = rnd() * W, sy = rnd() * H, sr = rnd() * 2.2 + 0.4;
      ctx.globalAlpha = 0.35 + rnd() * 0.65;
      ctx.fillStyle = rnd() > 0.85 ? "#ffe3a3" : "#ffffff";
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawMoon(ctx, 860, 200, 90);

    var serif = 'Georgia, "Times New Roman", serif';
    var sans = '-apple-system, "Segoe UI", Roboto, Arial, sans-serif';

    ctx.textAlign = "center";
    ctx.fillStyle = "#cdd3ea";
    ctx.font = "600 46px " + sans;
    ctx.fillText("Мне приснилось:", W / 2, 390);

    ctx.fillStyle = "#ffd98c";
    var size = 132;
    ctx.font = "bold " + size + "px " + serif;
    while (ctx.measureText(d.title).width > W - 140 && size > 60) { size -= 6; ctx.font = "bold " + size + "px " + serif; }
    ctx.fillText(d.title, W / 2, 520);

    var m = MOODS[d.mood] || MOODS.mixed;
    var moodColor = { good: "#8fe0ae", warn: "#ffbf7a", mixed: "#c7b8ff" }[d.mood] || "#c7b8ff";
    ctx.font = "bold 42px " + sans;
    var mw = ctx.measureText(m.label).width + 64;
    ctx.strokeStyle = moodColor; ctx.lineWidth = 3;
    roundRect(ctx, W / 2 - mw / 2, 566, mw, 70, 35); ctx.stroke();
    ctx.fillStyle = moodColor;
    ctx.fillText(m.label, W / 2, 616);

    ctx.fillStyle = "#f5f2ea";
    ctx.font = "54px " + sans;
    var lines = wrapLines(ctx, d.short, W - 160).slice(0, 3);
    lines.forEach(function (ln, k) { ctx.fillText(ln, W / 2, 740 + k * 70); });

    ctx.fillStyle = "rgba(244,199,111,0.35)";
    ctx.fillRect(W / 2 - 140, 950, 280, 2);
    ctx.fillStyle = "#ffd98c";
    ctx.font = "bold 60px " + serif;
    ctx.fillText("Сонник", W / 2, 1025);
    return c;
  }

  function roundRect(ctx, x, y, w, hgt, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + hgt, r);
    ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
    ctx.arcTo(x, y + hgt, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function openPostcard(d, opener, again) {
    if (!again) AN.event("share_clicked", { channel: "postcard", dream_id: d.id });
    var canvas = makePostcard(d);
    var img = h("img", { class: "postcard-img", alt: "Открытка: " + d.title + ". " + d.short, width: "360", height: "360" });
    var fileName = "sonnik-" + d.id + ".png";
    var saveBtn = h("button", { type: "button", class: "btn btn-primary btn-wide" }, [icon("save"), "Сохранить открытку"]);
    var stack = h("div", { class: "stack" }, [saveBtn]);
    var note = h("p", { class: "note", text: "Открытку можно отправить в сообщении или поставить в пост." });
    var body = h("div", { class: "postcard-body" }, [img, h("div", null, [stack, note])]);
    openModal("Открытка со сном", body, opener);

    img.src = canvas.toDataURL("image/png");
    var blobUrl = null, blob = null;
    function ready(b) {
      blob = b;
      if (b) {
        blobUrl = URL.createObjectURL(b);
        if (modal) modal.url = blobUrl;
      }
      if (b && navigator.canShare && typeof File === "function") {
        try {
          var file = new File([b], fileName, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            var sendBtn = h("button", { type: "button", class: "btn btn-wide" }, [icon("share"), "Отправить открытку"]);
            sendBtn.addEventListener("click", function () {
              navigator.share({ files: [file], title: "Сонник: " + d.title, text: shareText(d) + " " + shareUrl(d) })
                .then(function () { AN.event("postcard_saved", { method: "share_file", dream_id: d.id }); })
                .catch(function () { /* человек передумал */ });
            });
            stack.appendChild(sendBtn);
          }
        } catch (e) { /* без отправки файлом */ }
      }
    }
    try { canvas.toBlob(ready, "image/png"); } catch (e) { ready(null); }

    saveBtn.addEventListener("click", function () {
      // Во ВК и ОК приложение открыто внутри площадки, и скачивание файла там часто не работает:
      // показываем открытку на весь экран, чтобы сохранить её как обычную картинку.
      if (PF && PF.isSocial) {
        AN.event("postcard_saved", { method: "fullscreen", dream_id: d.id });
        showPostcardFull(d, canvas, opener);
        return;
      }
      var a = h("a", { href: blobUrl || canvas.toDataURL("image/png"), download: fileName, style: "display:none" });
      document.body.appendChild(a);
      a.click();
      a.remove();
      AN.event("postcard_saved", { method: "download", dream_id: d.id });
      toast("Открытка сохраняется в загрузки");
    });
  }

  function showPostcardFull(d, canvas, opener) {
    var img = h("img", { class: "postcard-full-img", alt: "Открытка: " + d.title + ". " + d.short });
    img.src = canvas.toDataURL("image/png");
    var hint = isDesktop()
      ? "Нажмите на открытку правой кнопкой мыши и выберите «Сохранить изображение как…»."
      : "Нажмите на открытку и удерживайте палец, чтобы сохранить её.";
    var back = h("button", { type: "button", class: "btn btn-wide" }, [icon("back"), "Назад к открытке"]);
    back.addEventListener("click", function () { openPostcard(d, opener, true); });
    openModal("Сохранить открытку", h("div", { class: "postcard-full" }, [img, h("p", { class: "note postcard-full-hint", text: hint }), back]), opener, "modal-full");
  }

  /* ================= звёздное небо ================= */

  function drawSky() {
    var c = document.getElementById("sky");
    if (!c || !c.getContext) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth, hh = window.innerHeight;
    c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr);
    var ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);
    var rnd = seeded(12345);
    var n = Math.round(Math.min(220, w * hh / 5000));
    for (var i = 0; i < n; i++) {
      var x = rnd() * w, y = rnd() * hh, r = rnd() * 1.3 + 0.3;
      ctx.globalAlpha = 0.25 + rnd() * 0.6 * (1 - y / hh * 0.5);
      ctx.fillStyle = rnd() > 0.88 ? "#ffe3a3" : "#ffffff";
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // несколько «искорок»-крестиков
    ctx.strokeStyle = "#fff3cf";
    ctx.lineWidth = 1;
    for (var k = 0; k < 6; k++) {
      var sx = rnd() * w, sy = rnd() * hh * 0.7, s = 3 + rnd() * 3;
      ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(sx - s, sy); ctx.lineTo(sx + s, sy); ctx.moveTo(sx, sy - s); ctx.lineTo(sx, sy + s); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ================= запуск ================= */

  function scheduleMidnight() {
    var now = new Date();
    var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
    setTimeout(function () { refreshToday(); scheduleMidnight(); }, Math.min(next - now, 2147483000));
  }
  var shownDay = dayNumber(new Date());
  function refreshToday() {
    var n = dayNumber(new Date());
    if (n === shownDay) return;
    shownDay = n;
    var old = document.getElementById("today");
    if (old) old.parentNode.replaceChild(todayCard(), old);
    refreshInvite();
  }

  function start() {
    // Ссылка из площадки: во ВК всё после # в адресе приложения приходит как payload.
    var pl = PF && PF.payload;
    if (!location.hash && typeof pl === "string" && /^(dream|cat|q|week)(=|$)/.test(pl)) {
      try { history.replaceState(null, "", location.href.split("#")[0] + "#" + pl); } catch (e) { /* ничего */ }
    }
    try { history.replaceState({ depth: 0 }, "", location.href); } catch (e) { /* file:// в старых браузерах */ }

    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest("a[href^='#']");
      if (!a) return;
      e.preventDefault();
      if (modal) closeModal(true);
      if (a.getAttribute("data-src")) pendingSource = a.getAttribute("data-src");
      if (a.getAttribute("data-search") === "category") AN.event("search", { found: "yes", method: "category" });
      navigate(a.getAttribute("href").slice(1));
    });

    window.addEventListener("popstate", function () {
      if (modal) { closeModal(true); return; }
      render();
    });
    window.addEventListener("hashchange", function () { render(); });

    var resizeTimer;
    window.addEventListener("resize", function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawSky, 150); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refreshToday(); });

    if (window.DREAMS_DEMO) {
      var note = document.getElementById("demoNote");
      note.textContent = "Пробная база: " + DREAMS.length + " " + plural(DREAMS.length, "сон", "сна", "снов") + ".";
      note.hidden = false;
    }

    drawSky();
    watchButtons();
    AN.init(PF && PF.hasBridge ? PF.bridge : null, { appVersion: CFG.version || "" });
    var load = PF ? PF.load([KEY_RECENT, KEY_WEEK]) : Promise.resolve({});
    load.then(function (data) {
      if (data && Array.isArray(data[KEY_RECENT])) store[KEY_RECENT] = data[KEY_RECENT].map(String).slice(0, 8);
      if (data && data[KEY_WEEK] && typeof data[KEY_WEEK] === "object") store[KEY_WEEK] = data[KEY_WEEK];
    }, function () { /* без сохранённого */ }).then(function () {
      var entry = parseHash().name;
      var returning = getRecent().length > 0 || !!store[KEY_WEEK];
      render(true);
      scheduleMidnight();
      if (PF && PF.banner) PF.banner.show();
      if (PF) PF.gameReady();
      AN.ready();
      AN.event("app_opened", { entry: entry, returning: returning });
      ready = true;
    });
  }
  var ready = false;

  // Для автотеста.
  window.Sonnik = {
    isDesktop: isDesktop, dreamOfDay: dreamOfDay, shareText: shareText, shareUrl: shareUrl, count: DREAMS.length,
    weekDreams: weekDreams, weekState: weekState,
    isReady: function () { return ready; },
    adGrants: function () { return adGrants; },
    adBusy: function () { return adBusy; }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
