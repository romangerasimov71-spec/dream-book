/* Поиск по соннику, прощающий ошибки.
   Работает и в браузере (window.SonnikSearch), и в node (require). */
(function (root) {
  "use strict";

  // Слова, которые люди пишут вокруг сна, но которые сами снами не являются.
  var STOP = new Set((
    "я мне меня мой моя моё мое мои мною ты тебе он она оно они мы вы его ее её их им ей нам вам " +
    "сон сне сны снов снах снится снился снилась снилось снились снятся приснился приснилась приснилось " +
    "приснились приснится присниться видел видела видели вижу увидел увидела увидеть видеть " +
    "сегодня ночью вчера недавно опять снова часто уже " +
    "что как будто якобы словно когда где кто чем чему зачем почему к ко и а но или да нет не ни " +
    "в во на с со у о об про по за из от до для при над под без это этот эта эти то тот та те " +
    "был была было были есть очень какой какая какое какие такой такая такое значит означает " +
    "толкование толковать сонник чего всё все весь вся меня мной себя свой своя свои"
  ).split(/\s+/));

  var ENDINGS = [
    "иями", "ями", "ами", "ого", "его", "ому", "ему", "ыми", "ими", "иях", "ией",
    "ях", "ах", "ов", "ев", "ей", "ий", "ый", "ой", "ая", "яя", "ое", "ее", "ые", "ие",
    "ую", "юю", "ом", "ем", "ам", "ям", "ия", "ья", "ье", "ьи", "ью", "ию", "ых", "их",
    "а", "я", "о", "е", "ы", "и", "у", "ю", "ь", "й"
  ];

  function norm(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function words(s) {
    var n = norm(s);
    return n ? n.split(" ") : [];
  }

  function stem(w) {
    for (var i = 0; i < ENDINGS.length; i++) {
      var e = ENDINGS[i];
      if (w.length - e.length >= 3 && w.slice(-e.length) === e) return w.slice(0, -e.length);
    }
    return w;
  }

  // Расстояние Левенштейна; если max задан и превышен — возвращает max+1.
  function lev(a, b, max) {
    if (a === b) return 0;
    var la = a.length, lb = b.length;
    if (max != null && Math.abs(la - lb) > max) return max + 1;
    if (!la) return lb;
    if (!lb) return la;
    var prev = new Array(lb + 1), cur = new Array(lb + 1), i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur[0] = i;
      var rowMin = cur[0];
      for (j = 1; j <= lb; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (max != null && rowMin > max) return max + 1;
      var t = prev; prev = cur; cur = t;
    }
    return prev[lb];
  }

  function queryWords(q) {
    return words(q).filter(function (w) { return w.length >= 2 && !STOP.has(w); });
  }

  function buildIndex(dreams) {
    return (dreams || []).map(function (d) {
      var all = [d.title].concat(Array.isArray(d.aliases) ? d.aliases : []);
      var terms = [];
      all.forEach(function (t, i) {
        var ws = words(t);
        if (!ws.length) return;
        terms.push({
          isTitle: i === 0,
          phrase: ws.join(" "),
          ws: ws.map(function (w) { return { w: w, s: stem(w) }; })
        });
      });
      return { d: d, terms: terms };
    });
  }

  function allowedTypos(len) {
    if (len <= 3) return 0;
    if (len <= 6) return 1;
    return 2;
  }

  function wordScore(qw, qs, tw, ts, suggest) {
    if (qw === tw) return 100;
    if (qs.length >= 3 && qs === ts) return 92;
    if (tw.indexOf(qw) === 0) {
      if (qw.length >= 3) return Math.min(88, 70 + Math.round(18 * qw.length / tw.length));
      if (suggest) return 50;
    }
    if (ts.length >= 4 && qw.indexOf(ts) === 0) return 68;
    var max = allowedTypos(qw.length);
    if (max) {
      var d = Math.min(lev(qs, ts, max), lev(qw, tw, max));
      if (d <= max) return 60 - 8 * d;
      if (suggest && tw.length > qw.length && qw.length >= 4) {
        d = lev(qw, tw.slice(0, qw.length), max);
        if (d <= max) return 46 - 6 * d;
      }
    }
    return 0;
  }

  var MIN_SCORE = 44;

  /* Возвращает [{d, score}] по убыванию. opts: {suggest: bool, limit: number} */
  function search(index, q, opts) {
    opts = opts || {};
    var qws = queryWords(q);
    if (!qws.length && opts.suggest) {
      // Человек ещё печатает: «со…» — служебное слово, но может стать «собакой».
      var raw = words(q).filter(function (w) { return w.length >= 2; });
      if (raw.length) qws = [raw[raw.length - 1]];
    }
    if (!qws.length) return [];
    var qphrase = " " + qws.join(" ") + " ";
    var qinfo = qws.map(function (w) { return { w: w, s: stem(w) }; });
    var out = [];
    index.forEach(function (e) {
      var per = qinfo.map(function () { return 0; });
      var phraseBonus = 0;
      e.terms.forEach(function (t) {
        var bonus = (t.isTitle ? 4 : 0) + (t.ws.length === 1 ? 3 : 0);
        if (t.ws.length > 1 && qphrase.indexOf(" " + t.phrase + " ") >= 0) phraseBonus = Math.max(phraseBonus, 12);
        qinfo.forEach(function (q, qi) {
          t.ws.forEach(function (tw) {
            var s = wordScore(q.w, q.s, tw.w, tw.s, !!opts.suggest);
            if (s) {
              s += bonus;
              if (s > per[qi]) per[qi] = s;
            }
          });
        });
      });
      var good = per.filter(function (s) { return s >= MIN_SCORE; });
      if (!good.length) return;
      var best = Math.max.apply(null, good);
      var sum = good.reduce(function (a, b) { return a + b; }, 0);
      var score = best + 0.35 * (sum - best) + phraseBonus;
      out.push({ d: e.d, score: score });
    });
    out.sort(function (a, b) {
      return b.score - a.score || a.d.title.length - b.d.title.length || a.d.title.localeCompare(b.d.title, "ru");
    });
    return opts.limit ? out.slice(0, opts.limit) : out;
  }

  /* Похожие по написанию — для экрана «ничего не нашлось». */
  function similar(index, q, n) {
    var qws = queryWords(q);
    if (!qws.length) qws = words(q);
    if (!qws.length) return [];
    var out = [];
    index.forEach(function (e) {
      var best = 0;
      e.terms.forEach(function (t) {
        t.ws.forEach(function (tw) {
          qws.forEach(function (qw) {
            var a = stem(qw), b = tw.s;
            var m = Math.max(a.length, b.length) || 1;
            var sim = 1 - lev(a, b) / m;
            if (a[0] === b[0]) sim += 0.15;
            if (a.slice(0, 2) === b.slice(0, 2)) sim += 0.1;
            if (sim > best) best = sim;
          });
        });
      });
      if (best > 0.34) out.push({ d: e.d, score: best });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, n || 5).map(function (r) { return r.d; });
  }

  var api = {
    norm: norm, words: words, stem: stem, lev: lev, queryWords: queryWords,
    buildIndex: buildIndex, search: search, similar: similar, MIN_SCORE: MIN_SCORE
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SonnikSearch = api;
})(typeof window !== "undefined" ? window : this);
