/* Проверка поиска на настоящей базе: node tools/search-cases.js */
"use strict";
global.window = {};
require("../data/dreams.js");
const S = require("../search.js");
const idx = S.buildIndex(window.DREAMS);

// [запрос, что должно открыться сразу (или null — не открывать), что запрещено показывать]
const CASES = [
  ["собака", "Собака"], ["зуб", "Зубы"], ["мне снилась змея", "Змея"], ["ёлка", "Ёлка"], ["елка", "Ёлка"],
  ["мне снилась большая собака", "Собака"], ["к чему снится кот", "Кошка"], ["выпал зуб", "Зубы"],
  ["покойник", "Покойник"], ["бывший", "Бывший"], ["не могу пошевелиться", "Не могу пошевелиться"],
  ["sobaka", "Собака"], ["koshka", "Кошка"], ["ZMEYA", "Змея"],
  ["покойный муж", "Покойник"], ["умерший муж", "Покойник"], ["умерший отец", "Покойник"], ["покойная мама", "Покойник"],
  ["умерла бабушка", "Покойник"], ["мертвый", "Покойник"], ["дом горит", "Пожар"], ["дедушка домовой", "Домовой"],
  ["мама", "Мама", ["Покойник"]], ["папа", "Папа", ["Покойник"]], ["бабушка", "Бабушка", ["Покойник"]],
  ["суп", "Суп", ["Муж", "Жена"]], ["машина", "Машина", ["Стирка"]], ["банк", "Банк", ["Мёд"]], ["лёд", "Лёд", ["Конфеты"]], ["тарелки", "Посуда", ["НЛО"]],
  ["сабака", null], ["внук", "Внуки"], ["покойный дедушка", "Покойник"], ["клопы", "Клопы"], ["сын", "Сын"], ["бассейн", "Бассейн"], ["дедушка", "Дедушка"], ["школа", "Школа"], ["сестра", "Сестра"], ["брат", "Брат"], ["мухи", "Мухи"], ["водка", "Водка"],
  ["малина", "Малина"], ["вилка", null], ["ложка", "Ложка"], ["тёща", "Тёща"], ["капуста", "Капуста"], ["коза", "Коза"], ["сова", "Сова"],
  ["белка", "Белка"], ["вишня", "Вишня"], ["сало", null], ["овца", "Овца"], ["моча", null], ["мент", null], ["бабло", null], ["хата", null],
];
const SUGGEST_BAD = [["сес", "Поезд"], ["мух", "Грибы"], ["бра", "Свадьба"]];

let fails = 0;
for (const [q, want, banned] of CASES) {
  const res = S.search(idx, q);
  const strong = res.filter((r) => r.strong);
  const opened = strong.length ? strong[0].d.title : null;
  const alts = strong.slice(1).filter((r) => r.score >= strong[0].score - 15).slice(0, 3).map((r) => r.d.title);
  const maybe = strong.length ? [] : res.slice(0, 5).map((r) => r.d.title);
  let ok = opened === want;
  if (banned) ok = ok && !banned.some((b) => alts.includes(b) || (opened === b && want !== b));
  if (!ok) fails++;
  console.log((ok ? "  ok   " : "  FAIL ") + q.padEnd(26) + " → " + (opened || "не открывать") +
    (alts.length ? " | возможно: " + alts.join(", ") : "") + (maybe.length ? " | может быть: " + maybe.join(", ") : ""));
}
// Каждое название и каждый синоним открывают свой сон.
let selfMiss = [];
for (const d of window.DREAMS) {
  for (const t of [d.title].concat(d.aliases)) {
    const strong = S.search(idx, t).filter((r) => r.strong);
    if (!strong.length || strong[0].d.id !== d.id) selfMiss.push(t + " → " + (strong[0] ? strong[0].d.title : "ничего") + " (а надо " + d.title + ")");
  }
}
console.log((selfMiss.length ? "  info " : "  ok   ") + "названия и синонимы: промахов " + selfMiss.length);
selfMiss.forEach((m) => console.log("         " + m));
for (const [q, bad] of SUGGEST_BAD) {
  const sug = S.search(idx, q, { suggest: true, limit: 6 }).map((r) => r.d.title);
  const ok = !sug.includes(bad);
  if (!ok) fails++;
  console.log((ok ? "  ok   " : "  FAIL ") + ("подсказки «" + q + "»").padEnd(26) + " → " + (sug.join(", ") || "—"));
}
for (const q of ["соб", "зу", "не мо", "сабак", "покой"]) {
  console.log("       подсказки «" + q + "» → " + S.search(idx, q, { suggest: true, limit: 6 }).map((r) => r.d.title).join(", "));
}
console.log(fails ? "ПРОВАЛЕНО: " + fails : "Поиск в порядке.");
process.exit(fails ? 1 : 0);
