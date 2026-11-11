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

  // Корни слов о смерти: с ними ищем Покойника/Свою смерть, без них — не подмешиваем.
  var DEATH_RE = /^(покойн|умер|умир|мертв|усопш|помер|погиб|смерт)/;
  function deathRoot(w) { return DEATH_RE.test(w) ? w.slice(0, 4) : ""; }
  // Умирает сам человек: «я умерла», «моя смерть», «умираю», «умерла сама».
  var SELF = new Set("я сам сама сами моя мой мое моё себя собственная собственную своя свою".split(" "));
  var SELF_VERB = /^(умираю|умру|помираю|погибаю)$/;
  // Люди, которых нет отдельным сном: с ними «смерть» — это «Покойник».
  var PERSON = new Set(("человек человека мужчина мужчину женщина женщину друг друга подруга подругу сосед соседа соседка " +
    "соседку знакомый знакомого знакомая знакомую родственник родственника родственница родственницу родные родных " +
    "отец отца мать матери тетя тетю дядя дядю дед деда дедуля бабуля внук внучка ребенок ребенка мальчик девочка").split(" "));
  // «Потеряла ребенка», «потерял мужа»: не открываем «Потерять вещь» сразу — экран выбора.
  var LOSS_RE = /^(потер|теря)/;

  // Две ошибки допустимы только в длинных словах. В словах до 7 букв — одна, и только
  // замена гласной на гласную («сабака» → «собака»): «крыша» ≠ «крыса», «машина» ≠ «малина».
  var VOWELS = "аеиоуыэюяё";
  function vowelTypo(a, b) {
    if (a.length !== b.length) return false;
    var diff = -1;
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        if (diff >= 0) return false;
        diff = i;
      }
    }
    return diff > 0 && VOWELS.indexOf(a[diff]) >= 0 && VOWELS.indexOf(b[diff]) >= 0;
  }

  var LAT_PAIRS = [["shch", "щ"], ["sch", "щ"], ["sh", "ш"], ["ch", "ч"], ["zh", "ж"], ["kh", "х"], ["ts", "ц"],
    ["yo", "ё"], ["jo", "ё"], ["yu", "ю"], ["ju", "ю"], ["ya", "я"], ["ja", "я"], ["ye", "е"], ["je", "е"]];
  var LAT_ONE = { a: "а", b: "б", v: "в", g: "г", d: "д", e: "е", z: "з", i: "и", j: "й", k: "к", l: "л", m: "м",
    n: "н", o: "о", p: "п", r: "р", s: "с", t: "т", u: "у", f: "ф", h: "х", c: "к", y: "ы", w: "в", x: "кс", q: "к", "'": "ь" };

  // Простая транслитерация: «sobaka» → «собака», «ZMEYA» → «змея».
  function translit(s) {
    s = String(s == null ? "" : s).toLowerCase();
    if (!/[a-z]/.test(s)) return s;
    LAT_PAIRS.forEach(function (p) { s = s.split(p[0]).join(p[1]); });
    s = s.replace(/[a-z']/g, function (ch) { return LAT_ONE[ch] || ch; });
    return s.replace(/([аеёиоуыэюя])ы/g, "$1й");
  }

  function norm(s) {
    return translit(s)
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
        // Синоним с «~» — «на выбор»: находит сон, но не открывает его сразу (экран выбора).
        var weak = typeof t === "string" && t.charAt(0) === "~";
        var ws = words(weak ? t.slice(1) : t);
        var key = ws.filter(function (w) { return !STOP.has(w); });
        if (!key.length) key = ws;
        if (!key.length) return;
        terms.push({
          isTitle: i === 0,
          phrase: ws.join(" "),
          ws: key.map(function (w) { return { w: w, s: stem(w), death: deathRoot(w) }; }),
          death: key.some(function (w) { return DEATH_RE.test(w); }),
          weak: weak
        });
      });
      return { d: d, terms: terms };
    });
  }

  /* Сравнение слова запроса со СЛОВОМ ИЗ ОДНОСЛОВНОГО названия/синонима.
     Возвращает {s: очки, strong: уверенное ли совпадение} или null. */
  function singleMatch(q, t, isTitle, suggest) {
    var qw = q.w, tw = t.w;
    if (qw === tw) return { s: 100, strong: true };
    if (q.s.length >= 3 && q.s === t.s) return { s: 92, strong: true };
    if (tw.indexOf(qw) === 0) {
      var ratio = qw.length / tw.length;
      if (isTitle) {
        if (qw.length >= 4 && ratio >= 0.6) return { s: 70 + Math.round(18 * ratio), strong: true };
        if (qw.length >= (suggest ? 2 : 3)) return { s: 50 + Math.round(10 * ratio), strong: false };
      } else if (qw.length >= 4 && ratio >= 0.5) {
        return ratio >= 0.6 ? { s: 66 + Math.round(18 * ratio), strong: true } : { s: 48, strong: false };
      }
    }
    if (t.s.length >= 4 && qw.indexOf(t.s) === 0) return { s: 46, strong: false, typo: true };
    // Опечатки: только длинные слова, первая буква совпадает, сравниваем целые слова.
    if (qw.length >= 5 && qw[0] === tw[0]) {
      if (qw.length >= 8) {
        var max = qw.length >= 9 ? 2 : 1;
        var d = lev(qw, tw, max);
        if (d <= max) return { s: 52 - 6 * d, strong: false, typo: true };
        if (suggest && tw.length > qw.length) {
          d = lev(qw, tw.slice(0, qw.length), max);
          if (d <= max) return { s: 44 - 4 * d, strong: false, typo: true };
        }
      } else {
        // 6–7 букв: целое слово с одной заменой гласной; 5 букв — только начало в подсказках («сабак…»).
        if (qw.length >= 6 && vowelTypo(qw, tw)) return { s: 46, strong: false, typo: true };
        if (suggest && tw.length > qw.length && vowelTypo(qw, tw.slice(0, qw.length))) return { s: 40, strong: false, typo: true };
      }
    }
    return null;
  }

  /* Возвращает [{d, score, strong}]: сначала уверенные, потом «может быть». opts: {suggest, limit} */
  function search(index, q, opts) {
    opts = opts || {};
    var qws = queryWords(q);
    var rawNorm = norm(q);
    if (!qws.length && opts.suggest) {
      var raw = words(q).filter(function (w) { return w.length >= 2; });
      if (raw.length) qws = [raw[raw.length - 1]];
    }
    if (!qws.length) return [];
    var qinfo = qws.map(function (w) { return { w: w, s: stem(w), death: deathRoot(w) }; });
    var qHasDeath = qinfo.some(function (x) { return x.death; });
    var out = [];

    index.forEach(function (e) {
      var per = qinfo.map(function () { return null; });
      var bonus = 0, deathHit = false;
      var tWeak = false;
      function put(qi, s, strong, typo) {
        if (tWeak && strong) { strong = false; s = Math.min(s, 70); }
        var cur = per[qi];
        if (!cur || (strong && !cur.strong) || (strong === cur.strong && s > cur.s)) per[qi] = { s: s, strong: strong, typo: !!typo };
      }
      e.terms.forEach(function (t) {
        if (t.death && !qHasDeath && !(opts.suggest && t.ws.some(function (tw) {
          return qinfo.some(function (qq) { return qq.w.length >= 3 && tw.w.indexOf(qq.w) === 0; });
        }))) return;
        tWeak = !!t.weak;
        var tb = t.isTitle ? 4 : 0;
        if (t.ws.length === 1) {
          tb += 3;
          qinfo.forEach(function (qq, qi) {
            var m = singleMatch(qq, t.ws[0], t.isTitle, !!opts.suggest);
            if (m) put(qi, m.s + tb, m.strong, m.typo);
          });
        } else {
          // Многословный синоним: уверенно — только если в запросе есть все его слова.
          var hits = t.ws.map(function (tw) {
            for (var qi = 0; qi < qinfo.length; qi++) {
              if (qinfo[qi].w === tw.w) return { qi: qi, s: 100 };
              if (qinfo[qi].s.length >= 3 && qinfo[qi].s === tw.s) return { qi: qi, s: 92 };
            }
            return null;
          });
          // Совпало только одно слово из нескольких («дом» в «родильный дом») — это не тот сон:
          // такие частичные совпадения не показываем ни в вариантах, ни в подсказках.
          var all = hits.every(Boolean);
          if (all) hits.forEach(function (hh) { put(hh.qi, hh.s + tb, true); });
          if (all) bonus = Math.max(bonus, 12);
          if (opts.suggest && t.isTitle && rawNorm.length >= 3 && t.phrase.indexOf(rawNorm) === 0) put(qinfo.length - 1, 75, false);
        }
        // Слова о смерти: «умерший», «покойная» и т.п. — по общему корню.
        if (qHasDeath) {
          t.ws.forEach(function (tw) {
            if (!tw.death) return;
            qinfo.forEach(function (qq, qi) {
              if (qq.death && qq.death === tw.death) { put(qi, 85, true); deathHit = true; }
            });
          });
        }
      });
      var got = per.filter(Boolean);
      if (!got.length) return;
      var strong = got.some(function (x) { return x.strong; });
      var vals = got.map(function (x) { return x.s; });
      var best = Math.max.apply(null, vals);
      var sum = vals.reduce(function (a, b) { return a + b; }, 0);
      if (deathHit) bonus += 40;
      // typo — нашлось только по опечатке/похожему написанию (для заголовка «Точно такого сна нет»).
      out.push({ d: e.d, score: best + 0.35 * (sum - best) + bonus, strong: strong, deathHit: deathHit,
        typo: got.every(function (x) { return x.typo; }) });
    });

    var rawWs = words(q);
    var personHit = out.some(function (r) { return r.strong && !r.deathHit && r.d.cat === "Люди и родня"; }) ||
      rawWs.some(function (w) { return PERSON.has(w); });

    // Смерть: умирает сам человек — «Своя смерть»; умирает кто-то другой — «Покойник».
    if (qHasDeath) {
      var self = rawWs.some(function (w) { return SELF.has(w) || SELF_VERB.test(w); });
      var other = !self && personHit;
      if (self || other) {
        // «Покойник» — сон о смерти из раздела «Люди и родня», «Своя смерть» — остальные сны о смерти.
        index.forEach(function (e) {
          if (!e.terms.some(function (t) { return t.death; })) return;
          var isOther = e.d.cat === "Люди и родня";
          var r = out.filter(function (x) { return x.d === e.d; })[0];
          if (isOther === other) {
            if (!r) { r = { d: e.d, score: 0, strong: true, deathHit: true }; out.push(r); }
            r.strong = true; r.score = Math.max(r.score, 100) + 60;
          } else if (r) {
            r.drop = true;              // другой сон о смерти здесь не к месту — не показываем
          }
        });
        out = out.filter(function (x) { return !x.drop; });
      }
    }

    // «Потеряла ребенка»: потеря + человек — не открываем «Потерять вещь» сразу, а даём выбор.
    if (personHit && qinfo.some(function (x) { return LOSS_RE.test(x.w); })) {
      out.forEach(function (r) { r.strong = false; });
    }

    out.sort(function (a, b) {
      return (b.strong - a.strong) || b.score - a.score || a.d.title.length - b.d.title.length || a.d.title.localeCompare(b.d.title, "ru");
    });
    return opts.limit ? out.slice(0, opts.limit) : out;
  }

  /* Похожие по написанию — для экрана «ничего не нашлось». Только действительно близкие:
     слово от 6 букв — одна ошибка (от 10 — две), первая буква та же; короче — только замена
     гласной на гласную. Не больше n (по умолчанию 3). */
  function similar(index, q, n) {
    var qws = queryWords(q);
    if (!qws.length) return [];
    var out = [];
    index.forEach(function (e) {
      var best = 0;
      e.terms.forEach(function (t) {
        if (t.ws.length !== 1 || t.death || t.weak) return;
        var tw = t.ws[0].w;
        qws.forEach(function (qw) {
          if (qw.length < 4 || qw[0] !== tw[0]) return;
          var sim = 0;
          if (qw.length >= 6) {
            var max = qw.length >= 10 ? 2 : 1;
            var d = lev(qw, tw, max);
            // одна ошибка в начале слова допустима только как замена гласной («свекла» ≠ «стекла»)
            var startOk = qw.slice(0, 2) === tw.slice(0, 2) || vowelTypo(qw, tw);
            if (d <= max && (d === 0 || startOk)) sim = 1 - d / Math.max(qw.length, tw.length);
          } else if (vowelTypo(qw, tw)) sim = 1 - 1 / qw.length;
          if (sim > best) best = sim;
        });
      });
      if (best > 0) out.push({ d: e.d, score: best });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, n || 3).map(function (r) { return r.d; });
  }

  var api = {
    norm: norm, words: words, stem: stem, lev: lev, translit: translit, queryWords: queryWords,
    buildIndex: buildIndex, search: search, similar: similar
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SonnikSearch = api;
})(typeof window !== "undefined" ? window : this);
