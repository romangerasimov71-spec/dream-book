/* Сонник — мини-приложение. Без движков и сборщиков. */
(function () {
  "use strict";

  var S = window.SonnikSearch;

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
    star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7z"/>'
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

  function lsGet(key, fallback) {
    try {
      var v = window.localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* приватный режим — не страшно */ }
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
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
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

  var RECENT_KEY = "sonnik.recent";
  function getRecent() {
    var r = lsGet(RECENT_KEY, []);
    return Array.isArray(r) ? r.filter(function (id) { return BY_ID[id]; }) : [];
  }
  function addRecent(id) {
    var r = getRecent().filter(function (x) { return x !== id; });
    r.unshift(id);
    lsSet(RECENT_KEY, r.slice(0, 8));
  }

  /* ================= текст для «поделиться» ================= */

  var FEM_SOFT = ("лошадь соль кровь дверь постель тень смерть грязь обувь церковь моль рысь сирень морковь " +
    "площадь печь пыль боль любовь свекровь сеть нить мать тетрадь грудь бровь ладонь осень метель " +
    "медь ртуть ель лань мазь цепь кровать шаль вуаль").split(" ");
  var MASC_A = ("папа дядя дедушка мужчина юноша дедуля батюшка папочка слуга судья староста дядюшка").split(" ");
  var MASC_SOFT = ("путь гость конь огонь дождь день корень камень ремень медведь лебедь голубь гвоздь ноготь " +
    "локоть уголь царь король учитель руль портфель рубль").split(" ");

  function dreamtVerb(title) {
    var ws = S.words(title);
    var w = ws[0] || "";
    if (ws.length > 1 && /(ый|ий|ой|ая|яя|ое|ее|ые|ие)$/.test(w) && !/(ние|тие|ье)$/.test(w)) {
      if (/(ые|ие)$/.test(w)) return "приснились";
      if (/(ая|яя)$/.test(w)) return "приснилась";
      if (/(ое|ее)$/.test(w)) return "приснилось";
      return "приснился";
    }
    if (/[ыи]$/.test(w)) return "приснились";
    if (/[ая]$/.test(w)) return MASC_A.indexOf(w) >= 0 ? "приснился" : "приснилась";
    if (/[оеё]$/.test(w)) return "приснилось";
    if (/ь$/.test(w)) {
      if (MASC_SOFT.indexOf(w) >= 0) return "приснился";
      if (/(ость|есть|[жшчщ]ь)$/.test(w) || FEM_SOFT.indexOf(w) >= 0) return "приснилась";
      if (/(ть|ться)$/.test(w)) return null; // похоже на действие: «Летать»
      return "приснился";
    }
    return "приснился";
  }

  function shareText(d) {
    var verb = dreamtVerb(d.title);
    var head = verb ? "Мне " + verb + " " + lowerFirst(d.title) : "Мне приснился сон «" + d.title + "»";
    var sh = d.short || "";
    if (sh.length > 1 && sh.charAt(1) === sh.charAt(1).toLocaleLowerCase("ru")) sh = lowerFirst(sh);
    return head + ": " + sh + " — Сонник";
  }

  function shareUrl(d) {
    var base = location.href.split("#")[0].split("?")[0];
    return base + "#dream=" + encodeURIComponent(d.id);
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
    if (key === "q") return { name: "q", q: val };
    if (key === "cats") return { name: "home", anchor: "cats" };
    return { name: "home" };
  }

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

  function render(force) {
    var hash = location.hash;
    if (!force && hash === lastHash) return;
    lastHash = hash;
    var app = document.getElementById("app");
    var r = parseHash();
    app.textContent = "";
    var focusEl = null;
    if (r.name === "dream") focusEl = renderDream(app, r.id);
    else if (r.name === "cat") focusEl = renderCat(app, r.cat);
    else if (r.name === "q") focusEl = renderNotFound(app, r.q);
    else renderHome(app);

    if (r.anchor === "cats") {
      var c = document.getElementById("cats");
      if (c) { c.scrollIntoView(); c.focus({ preventScroll: true }); }
    } else {
      window.scrollTo(0, 0);
      if (!firstRender && focusEl) focusEl.focus({ preventScroll: true });
      else if (!firstRender) app.focus({ preventScroll: true });
    }
    document.title = r.name === "dream" && BY_ID[r.id] ? BY_ID[r.id].title + " — к чему снится | Сонник" : "Сонник — что означает ваш сон";
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
      placeholder: "Например: собака",
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
    }
    function pick(d) {
      close();
      addRecent(d.id);
      alts = null;
      navigate("dream=" + encodeURIComponent(d.id));
    }
    function submit() {
      if (active >= 0 && items[active]) { pick(items[active]); return; }
      var q = input.value.trim();
      if (!q) {
        hint.textContent = "Напишите слово из сна — например, «собака» или «вода».";
        input.focus();
        return;
      }
      close();
      var res = S.search(INDEX, q);
      if (res.length) {
        var best = res[0];
        var others = res.slice(1).filter(function (r) { return r.score >= best.score - 30; }).slice(0, 3).map(function (r) { return r.d.id; });
        addRecent(best.d.id);
        alts = others.length ? { id: best.d.id, list: others } : null;
        navigate("dream=" + encodeURIComponent(best.d.id));
      } else {
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

  function dreamLink(d, withShort) {
    return h("a", { class: "item", href: "#dream=" + encodeURIComponent(d.id) }, [
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
      app.appendChild(h("section", { class: "recent", "aria-label": "Недавно искали" }, [
        h("p", { class: "recent-title", text: "Недавно искали:" }),
        h("div", { class: "chips" }, recent.map(function (id) {
          return h("a", { class: "chip", href: "#dream=" + encodeURIComponent(id), text: BY_ID[id].title });
        }))
      ]));
    }

    app.appendChild(todayCard());

    var counts = {};
    DREAMS.forEach(function (d) { counts[d.cat] = (counts[d.cat] || 0) + 1; });
    app.appendChild(h("h2", { class: "section-title", id: "cats", tabindex: "-1", text: "Разделы сонника" }));
    app.appendChild(h("nav", { class: "cats", "aria-label": "Разделы" }, CATS.map(function (c) {
      var n = counts[c] || 0;
      return h("a", { class: "cat", href: "#cat=" + encodeURIComponent(c) }, [
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
    card.appendChild(h("a", { class: "btn btn-primary btn-wide", href: "#dream=" + encodeURIComponent(d.id) }, "Читать толкование"));
    return card;
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

    var title = h("h1", { tabindex: "-1", text: d.title });
    var paras = d.text.split(/\n\s*\n/).filter(Boolean).map(function (p) { return h("p", { text: p }); });
    var art = h("article", { class: "card dream" }, [
      h("div", { class: "dream-head" }, [
        h("a", { class: "cat-tag", href: "#cat=" + encodeURIComponent(d.cat) }, [catIcon(d.cat), d.cat]),
        moodBadge(d.mood)
      ]),
      title,
      d.short ? h("p", { class: "short", text: d.short }) : null,
      h("div", { class: "text" }, paras)
    ]);
    app.appendChild(art);

    if (alts && alts.id === d.id) {
      var links = alts.list.filter(function (x) { return BY_ID[x]; });
      if (links.length) {
        app.appendChild(h("p", { class: "also" }, ["Возможно, вы искали: "].concat(links.map(function (x) {
          return h("a", { href: "#dream=" + encodeURIComponent(x), text: BY_ID[x].title });
        }))));
      }
    }

    if (d.details.length) {
      app.appendChild(h("section", { class: "card details", "aria-labelledby": "detTitle" }, [
        h("h2", { id: "detTitle", text: "Если во сне…" }),
        h("dl", null, d.details.map(function (x) {
          return h("div", { class: "case" }, [h("dt", { text: String(x.if) }), h("dd", { text: String(x.then) })]);
        }))
      ]));
    }

    if (d.tip) {
      app.appendChild(h("div", { class: "card tip" }, [icon("bulb"), h("div", null, [h("b", { text: "Совет на день" }), h("p", { text: d.tip })])]));
    }

    var shareBtn = h("button", { type: "button", class: "btn btn-primary btn-wide" }, [icon("share"), "Поделиться"]);
    shareBtn.addEventListener("click", function () { share(d, shareBtn); });
    var cardBtn = h("button", { type: "button", class: "btn btn-wide" }, [icon("card"), "Открытка со сном"]);
    cardBtn.addEventListener("click", function () { openPostcard(d, cardBtn); });
    app.appendChild(h("div", { class: "actions" }, [
      shareBtn,
      h("div", { class: "btn-row" }, [
        cardBtn,
        h("button", { type: "button", class: "btn", onclick: function () { anotherDream(d.id); } }, [icon("dice"), "Ещё сон"])
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
        h("ul", { class: "list" }, sim.map(function (x) { return h("li", null, dreamLink(x, true)); }))
      ]));
    }
    return title;
  }

  function similarInCat(d, n) {
    var pool = DREAMS.filter(function (x) { return x.cat === d.cat && x.id !== d.id; });
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
    navigate("dream=" + encodeURIComponent(d.id));
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
      app.appendChild(h("ul", { class: "list" }, list.map(function (d) { return h("li", null, dreamLink(d, true)); })));
    }
    return t;
  }

  function renderNotFound(app, q) {
    app.appendChild(backButton());
    var t = h("h1", { tabindex: "-1", text: "Такого сна пока нет в соннике" });
    app.appendChild(h("div", { class: "card empty" }, [
      t,
      h("p", { class: "lead" }, ["Вы искали: ", h("span", { class: "query", text: "«" + q + "»" })]),
      h("p", { class: "lead", text: "Попробуйте написать одно главное слово из сна — например, «собака», а не «большая лохматая собака»." })
    ]));

    var sim = S.similar(INDEX, q, 5);
    if (sim.length < 3) {
      // Добавим сон дня и пару других, чтобы было что почитать.
      var extra = [dreamOfDay(new Date())].concat(DREAMS);
      for (var i = 0; i < extra.length && sim.length < 3; i++) {
        if (extra[i] && sim.indexOf(extra[i]) < 0) sim.push(extra[i]);
      }
    }
    if (sim.length) {
      app.appendChild(h("h2", { class: "section-title", text: "Может быть, подойдёт:" }));
      app.appendChild(h("ul", { class: "list" }, sim.map(function (d) { return h("li", null, dreamLink(d, true)); })));
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

  function openModal(titleText, body, opener) {
    if (modal) {
      // Меняем содержимое уже открытого окна, история не трогается.
      var box = modal.overlay.querySelector(".modal");
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
    var box2 = h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "modalTitle" }, [
      h("h2", { id: "modalTitle", text: titleText }),
      closeBtn,
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
    if (m.url) { try { URL.revokeObjectURL(m.url); } catch (e) { /* ничего */ } }
    if (m.opener && document.contains(m.opener)) m.opener.focus();
    if (!fromHistory && history.state && history.state.modal) history.back();
  }

  /* ================= поделиться ================= */

  function share(d, opener) {
    var text = shareText(d), url = shareUrl(d);
    if (navigator.share) {
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
    var copyBtn = h("button", { type: "button", class: "btn btn-wide" }, [icon("copy"), "Скопировать текст"]);
    copyBtn.addEventListener("click", function () {
      copyText(text + "\n" + url).then(function (okk) {
        toast(okk ? "Текст скопирован — вставьте его в сообщение" : "Не получилось скопировать");
      });
    });
    var cardBtn = h("button", { type: "button", class: "btn btn-wide" }, [icon("card"), "Открытка со сном"]);
    cardBtn.addEventListener("click", function () { openPostcard(d, opener); });
    var body = h("div", null, [
      h("p", { class: "share-preview", text: text + " " + url }),
      h("div", { class: "stack" }, [
        h("a", { class: "btn btn-vk btn-wide", href: vk, target: "_blank", rel: "noopener" }, "ВКонтакте"),
        h("a", { class: "btn btn-ok btn-wide", href: ok, target: "_blank", rel: "noopener" }, "Одноклассники"),
        copyBtn,
        cardBtn
      ])
    ]);
    openModal("Поделиться сном", body, opener);
  }

  function copyText(str) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(str).then(function () { return true; }, function () { return legacyCopy(str); });
    }
    return Promise.resolve(legacyCopy(str));
  }
  function legacyCopy(str) {
    var ta = h("textarea", { readonly: true, style: "position:fixed;top:0;left:0;opacity:0;font-size:16px" });
    ta.value = str;
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove();
    return ok;
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

  function openPostcard(d, opener) {
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
                .catch(function () { /* человек передумал */ });
            });
            stack.appendChild(sendBtn);
          }
        } catch (e) { /* без отправки файлом */ }
      }
    }
    try { canvas.toBlob(ready, "image/png"); } catch (e) { ready(null); }

    saveBtn.addEventListener("click", function () {
      var a = h("a", { href: blobUrl || canvas.toDataURL("image/png"), download: fileName, style: "display:none" });
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("Открытка сохраняется в загрузки");
    });
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
  }

  function start() {
    try { history.replaceState({ depth: 0 }, "", location.href); } catch (e) { /* file:// в старых браузерах */ }

    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest("a[href^='#']");
      if (!a) return;
      e.preventDefault();
      if (modal) closeModal(true);
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
    render(true);
    scheduleMidnight();
  }

  // Для автотеста.
  window.Sonnik = { dreamOfDay: dreamOfDay, shareText: shareText, shareUrl: shareUrl, dreamtVerb: dreamtVerb, count: DREAMS.length };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
