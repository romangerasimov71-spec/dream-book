/* Автопроверка сонника в Chromium (Playwright).
   Запуск: node tools/check.js            — проверки
           SHOTS=/путь node tools/check.js — плюс скриншоты в папку */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const SHOTS = process.env.SHOTS || "";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

// Сервер изображает GitHub Pages: приложение лежит по адресу /dream-book/
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (!p.startsWith("/dream-book/")) { res.writeHead(404); return res.end(); }
      p = p.slice("/dream-book/".length) || "index.html";
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

let fails = 0;
function ok(cond, msg) {
  if (cond) console.log("  ok   " + msg);
  else { fails++; console.log("  FAIL " + msg); }
}

const hasRealBase = fs.existsSync(path.join(ROOT, "data", "dreams.js"));

async function newPage(browser, vp, opts = {}) {
  const ctx = await browser.newContext({
    viewport: vp, deviceScaleFactor: 1, hasTouch: !!opts.touch, isMobile: false, locale: "ru-RU"
  });
  if (opts.noShare) {
    await ctx.addInitScript(() => { try { delete Navigator.prototype.share; delete Navigator.prototype.canShare; } catch (e) {} });
  }
  const page = await ctx.newPage();
  page._errors = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // Пока Боря не свёл базу, data/dreams.js нет — браузер пишет одну строку 404. Это ожидаемо.
    if (!hasRealBase && /404|Failed to load resource/.test(t)) return;
    page._errors.push(t);
  });
  page.on("pageerror", (e) => page._errors.push(String(e)));
  page._demo = false;
  page.on("request", (r) => { if (/demo\.js/.test(r.url())) page._demo = true; });
  return page;
}

async function idOf(page, title) {
  return page.evaluate((t) => { const d = (window.DREAMS || []).find((x) => x.title === t); return d ? d.id : ""; }, title);
}

async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: true });
}

async function searchFor(page, q) {
  const input = page.locator(".search-input").first();
  await input.fill(q);
  await input.press("Enter");
  await page.waitForTimeout(120);
  return (await page.locator("main h1").first().textContent()).trim();
}

async function layoutChecks(page, label) {
  const r = await page.evaluate(() => {
    const small = [];
    document.querySelectorAll(".btn, .chip, .cat, .cat-tag, .item, .back-link, .search-input, .close, .suggest li").forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width && b.height < 47.5) small.push(el.className + " " + Math.round(b.height));
    });
    const txt = [];
    document.querySelectorAll(".dream .text p, .details dd, .details dt, .tip p, .item-short, .lead, .today p, .cat-count, .foot p, .modal .note, .s-cat, .also p").forEach((el) => {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 17.9) txt.push(el.className + " " + fs);
    });
    const cut = [];
    document.querySelectorAll("h1, h2, .mood, .btn, .cat-name, .chip").forEach((el) => {
      if (el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1) cut.push(el.tagName + "." + el.className + " «" + el.textContent.trim().slice(0, 20) + "»");
    });
    return { overflow: document.documentElement.scrollWidth - window.innerWidth, small, txt, cut };
  });
  ok(r.overflow <= 0, label + ": нет прокрутки вбок (" + r.overflow + ")");
  ok(!r.small.length, label + ": все кнопки не ниже 48px " + (r.small.length ? JSON.stringify(r.small) : ""));
  ok(!r.txt.length, label + ": основной текст не меньше 18px " + (r.txt.length ? JSON.stringify(r.txt) : ""));
  ok(!r.cut.length, label + ": ничего не обрезано " + (r.cut.length ? JSON.stringify(r.cut.slice(0, 5)) : ""));
}

// Только ширина страницы (для серии экранов).
async function noSideScroll(page, label) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  ok(r.sw <= r.w, label + ": нет прокрутки вбок (" + r.sw + " при ширине " + r.w + ")");
}

// Контраст по WCAG
function lum(hex) {
  const c = hex.replace("#", "").match(/../g).map((x) => parseInt(x, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

(async () => {
  console.log("Контраст:");
  [["#f5f2ea", "#142257", "текст на фоне"], ["#cdd3ea", "#142257", "серый текст на фоне"], ["#ffd98c", "#142257", "золото на фоне"],
   ["#1a1532", "#f4c76f", "кнопка"], ["#141a33", "#ffffff", "поле поиска"], ["#ffbf7a", "#142257", "метка warn"],
   ["#8fe0ae", "#142257", "метка good"], ["#c7b8ff", "#142257", "метка mixed"], ["#cdd3ea", "#241c55", "подвал внизу"],
   ["#ffffff", "#2f5f9e", "кнопка ВК"], ["#1d1203", "#f7a14a", "кнопка ОК"]]
    .forEach(([f, b, n]) => { const c = contrast(f, b); ok(c >= 4.5, n + " " + c.toFixed(1) + ":1"); });

  const srv = await serve();
  const BASE = "http://127.0.0.1:" + srv.address().port + "/dream-book/";
  const browser = await chromium.launch();

  const screens = [
    { name: "phone-portrait", vp: { width: 390, height: 844 }, touch: true },
    { name: "phone-landscape", vp: { width: 844, height: 390 }, touch: true },
    { name: "desktop", vp: { width: 1366, height: 768 }, touch: false }
  ];

  for (const sc of screens) {
    console.log("\nЭкран " + sc.name + ":");
    const page = await newPage(browser, sc.vp, { touch: sc.touch, noShare: true });
    await page.goto(BASE);
    await page.waitForSelector(".search-input");
    ok((await page.locator(".search-label").textContent()).includes("Что вам приснилось"), "главный экран открылся");
    const today = await page.evaluate(() => window.Sonnik.dreamOfDay(new Date()).title);
    ok((await page.locator("#todayTitle").textContent()) === today, "сон дня: " + today);
    ok(await page.locator(".cat").count() >= 11, "разделы показаны");
    await layoutChecks(page, "главная");
    await shot(page, sc.name + "-1-home");

    const cases = [
      ["собака", "Собака"], ["зуб", "Зубы"], ["мне снилась змея", "Змея"], ["ёлка", "Ёлка"], ["елка", "Ёлка"],
      ["мне снилась большая собака", "Собака"], ["к чему снится кот", "Кошка"], ["покойник", "Покойник"],
      ["бывший", "Бывший"], ["не могу пошевелиться", "Не могу пошевелиться"], ["ZMEYA", "Змея"], ["покойный муж", "Покойник"]
    ];
    if (!hasRealBase || sc.name === "phone-portrait") {
      for (const [q, want] of cases) {
        await page.goto(BASE);
        const got = await searchFor(page, q);
        ok(got === want, "поиск «" + q + "» → " + got);
      }
      for (const q of ["сабака", "школа", "дедушка"]) {
        await page.goto(BASE);
        const got = await searchFor(page, q);
        const first = await page.locator(".list .item-title").first().textContent().catch(() => "—");
        ok(/^(Точно такого сна нет|Такого сна пока нет в соннике)$/.test(got), "«" + q + "» не открывает чужой сон: " + got + (got.startsWith("Точно") ? " → " + first : ""));
      }
    }
    await page.goto(BASE);
    const nf = await searchFor(page, "абракадабра");
    ok(nf === "Такого сна пока нет в соннике", "несуществующее слово → «" + nf + "»");
    const simCount = await page.locator(".list .item").count();
    ok(simCount >= 3 && simCount <= 5, "похожих предложено: " + simCount);
    ok(await page.locator('a[href="#cats"]').count() === 1, "есть ссылка на разделы");
    await layoutChecks(page, "не найдено");
    await shot(page, sc.name + "-2-notfound");

    // Подсказки и клавиатура
    await page.goto(BASE);
    await page.locator(".search-input").first().click();
    await page.keyboard.type("соб");
    await page.waitForSelector(".suggest li");
    ok(await page.locator(".suggest li").count() <= 6, "подсказок не больше 6");
    await shot(page, sc.name + "-3-suggest");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
    ok((await page.locator("main h1").textContent()) === "Собака", "стрелка + Enter в подсказках открыли сон");

    // Открытие по ссылке
    const zmeya = await idOf(page, "Змея");
    await page.goto(BASE + "#dream=" + zmeya);
    await page.waitForSelector("main h1");
    ok((await page.locator("main h1").textContent()) === "Змея", "открытие по #dream=" + zmeya);
    ok(await page.locator(".mood").count() >= 1, "метка настроения есть");
    ok(await page.locator(".details .case").count() >= 2, "частные случаи показаны");
    ok(await page.locator(".tip").count() === 1, "совет на день есть");
    const simLinks = await page.locator(".similar .item").count();
    ok(simLinks >= 1 && simLinks <= 3, "похожие сны: " + simLinks);
    await layoutChecks(page, "толкование");
    await shot(page, sc.name + "-4-dream");

    // Поделиться — запасное окно (navigator.share выключен)
    const topShare = await page.locator(".btn-share-top").boundingBox();
    ok(topShare && topShare.y < sc.vp.height * 1.5, "«Поделиться» видно сразу под короткой фразой");
    const dts = await page.locator(".details dt").allTextContents();
    ok(dts.every((t) => /^Если /.test(t) && !/^Если если/i.test(t)), "случаи читаются «Если …»: " + dts[0]);
    await page.locator("button", { hasText: "Поделиться" }).first().click();
    await page.waitForSelector(".modal");
    const vk = await page.locator(".btn-vk").getAttribute("href");
    const okr = await page.locator(".btn-ok").getAttribute("href");
    ok(vk.startsWith("https://vk.com/share.php?url=") && decodeURIComponent(vk).includes("#dream=" + zmeya), "ссылка ВК правильная");
    ok(okr.startsWith("https://connect.ok.ru/offer?url=") && okr.includes("description="), "ссылка ОК правильная");
    const prev = await page.locator(".share-preview").textContent();
    ok(/^Мне приснилось: Змея.+ — Сонник http/.test(prev), "текст: " + prev.slice(0, 70) + "…");
    await layoutChecks(page, "окно поделиться");
    await shot(page, sc.name + "-5-share");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    ok(await page.locator(".modal").count() === 0, "Esc закрывает окно");
    ok((await page.locator("main h1").textContent()) === "Змея", "после закрытия окна остались на сне");

    // Открытка
    await page.locator("button", { hasText: "Открытка со сном" }).click();
    await page.waitForFunction(() => { const i = document.querySelector(".postcard-img"); return i && i.complete && i.naturalWidth === 1080; });
    ok(true, "открытка нарисована 1080×1080");
    await shot(page, sc.name + "-6-postcard");
    if (sc.name === "desktop") {
      const dl = page.waitForEvent("download", { timeout: 3000 }).catch(() => null);
      await page.locator("button", { hasText: "Сохранить открытку" }).click();
      const d = await dl;
      ok(d && d.suggestedFilename() === "sonnik-" + zmeya + ".png", "открытка сохраняется файлом");
    }
    // Кнопка «назад» браузера закрывает окно
    await page.goBack();
    await page.waitForTimeout(150);
    ok(await page.locator(".modal").count() === 0, "«назад» браузера закрывает окно");
    ok((await page.locator("main h1").textContent()) === "Змея", "…и остаёмся на сне");

    // История: главная → раздел → сон → назад → назад
    await page.goto(BASE);
    await page.locator(".cat", { hasText: "Животные" }).click();
    await page.waitForTimeout(80);
    ok((await page.locator("main h1").textContent()) === "Животные", "раздел открылся");
    await shot(page, sc.name + "-7-category");
    await page.locator(".item").first().click();
    await page.waitForTimeout(80);
    const opened = await page.locator("main h1").textContent();
    await page.goBack(); await page.waitForTimeout(80);
    ok((await page.locator("main h1").textContent()) === "Животные", "назад: из сна «" + opened + "» в раздел");
    await page.goBack(); await page.waitForTimeout(80);
    ok(await page.locator(".search-label").count() === 1, "назад: в главное меню");

    // Недавно смотрели — открытый из раздела сон тоже попадает
    const chips = await page.locator(".recent .chip").allTextContents();
    ok(chips[0] === opened, "«Недавно смотрели» начинается с «" + opened + "»: " + chips.join(", "));
    ok(!page._demo, "демо-база не загружается");

    ok(!page._errors.length, "ошибок в консоли нет " + (page._errors.length ? JSON.stringify(page._errors) : ""));
    await page.context().close();
  }

  // Узкие телефоны: никакой прокрутки вбок
  console.log("\nШирины телефонов:");
  const longId = await (async () => { const p = await newPage(browser, { width: 390, height: 844 }); await p.goto(BASE); const id = await idOf(p, "Не могу пошевелиться") || await idOf(p, "Собака"); await p.context().close(); return id; })();
  for (const w of [320, 360, 375, 390, 393, 412]) {
    const page = await newPage(browser, { width: w, height: 740 }, { touch: true, noShare: true });
    await page.goto(BASE); await page.waitForSelector(".cat");
    await noSideScroll(page, w + " главная");
    await page.goto(BASE + "#dream=" + longId); await page.reload(); await page.waitForSelector("main h1");
    await noSideScroll(page, w + " сон");
    await layoutChecks(page, w + " сон");
    await page.locator(".btn-share-top").click(); await page.waitForSelector(".modal");
    await noSideScroll(page, w + " окно поделиться");
    await page.keyboard.press("Escape");
    await page.goto(BASE + "#q=" + "а".repeat(3000)); await page.reload(); await page.waitForSelector("main h1");
    await noSideScroll(page, w + " длинный запрос");
    ok((await page.evaluate(() => decodeURIComponent(location.hash).length)) <= 103, w + ": длинный запрос укорочен в адресе");
    if (w === 320) await shot(page, "w320-longquery");
    ok(!page._errors.length, w + ": ошибок в консоли нет " + (page._errors.length ? JSON.stringify(page._errors) : ""));
    await page.context().close();
  }

  // Крупный шрифт системы (200%)
  console.log("\nКрупный шрифт 200%:");
  for (const w of [390, 1366]) {
    const page = await newPage(browser, { width: w, height: 844 }, { touch: w < 500, noShare: true });
    await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style"); st.textContent = "html{font-size:36px !important}"; document.head.appendChild(st);
    }));
    await page.goto(BASE); await page.waitForSelector(".cat");
    await noSideScroll(page, w + " главная");
    await shot(page, "font200-" + w + "-home");
    await page.goto(BASE + "#dream=" + longId); await page.reload(); await page.waitForSelector("main h1");
    await noSideScroll(page, w + " сон");
    const cut = await page.evaluate(() => [...document.querySelectorAll("h1, .mood, .btn")].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim()));
    ok(!cut.length, w + ": заголовок и плашки не обрезаны " + (cut.length ? JSON.stringify(cut) : ""));
    await shot(page, "font200-" + w + "-dream");
    await page.context().close();
  }

  // Альбом: окно «Поделиться» помещается, крестик не налезает
  console.log("\nАльбом, окна:");
  for (const vp of [{ width: 640, height: 360 }, { width: 844, height: 390 }]) {
    const page = await newPage(browser, vp, { touch: true, noShare: true });
    await page.goto(BASE + "#dream=" + longId); await page.reload(); await page.waitForSelector("main h1");
    await page.locator(".btn-share-top").click(); await page.waitForSelector(".modal");
    const r = await page.evaluate(() => {
      const H = window.innerHeight;
      const btns = [...document.querySelectorAll(".modal .stack .btn")].map((b) => b.getBoundingClientRect());
      const close = document.querySelector(".modal .close").getBoundingClientRect();
      const prev = document.querySelector(".share-preview").getBoundingClientRect();
      return { allVisible: btns.every((b) => b.bottom <= H && b.top >= 0), overlap: close.bottom > prev.top && close.left < prev.right };
    });
    ok(r.allVisible, vp.width + "×" + vp.height + ": все кнопки окна видны");
    ok(!r.overlap, vp.width + "×" + vp.height + ": крестик не налезает на текст");
    await shot(page, "land-" + vp.width + "-share");
    await page.locator("button", { hasText: "Открытка со сном" }).last().click();
    await page.waitForTimeout(200);
    const pc = await page.evaluate(() => { const b = document.querySelector(".modal").getBoundingClientRect(); return b.bottom <= window.innerHeight && b.top >= 0; });
    ok(pc, vp.width + "×" + vp.height + ": окно открытки помещается");
    await shot(page, "land-" + vp.width + "-postcard");
    await page.context().close();
  }

  // История и разделы
  console.log("\nИстория:");
  {
    const page = await newPage(browser, { width: 390, height: 844 }, { touch: true });
    await page.goto(BASE);
    await page.locator(".cat").first().click(); await page.waitForTimeout(60);
    await page.locator(".item").first().click(); await page.waitForTimeout(60);
    for (let i = 0; i < 5; i++) { await page.locator("button", { hasText: "Случайный сон" }).click(); await page.waitForTimeout(40); }
    await page.goBack(); await page.waitForTimeout(80);
    ok(await page.locator(".cat-ico + h1, .dream-head h1").count() === 1 && !(await page.locator(".dream").count()), "5 × «Случайный сон», потом один раз «назад» — снова в разделе");
    await page.goto(BASE + "#cat=Ерунда"); await page.reload(); await page.waitForTimeout(80);
    ok(await page.locator(".search-label").count() === 1, "#cat=Ерунда открывает главную");
    await page.context().close();
  }

  // Сон дня: одинаковый в течение дня и разный в разные дни
  console.log("\nСон дня:");
  {
    const page = await newPage(browser, { width: 390, height: 844 });
    await page.goto(BASE);
    const r = await page.evaluate(() => {
      const f = (y, m, d, hh) => window.Sonnik.dreamOfDay(new Date(y, m, d, hh)).id;
      const week = []; for (let i = 0; i < 7; i++) week.push(f(2026, 10, 10 + i, 12));
      return { morning: f(2026, 10, 11, 0), night: f(2026, 10, 11, 23), week };
    });
    ok(r.morning === r.night, "весь день один сон (" + r.morning + ")");
    ok(new Set(r.week).size === 7, "неделя без повторов: " + r.week.join(", "));
    await page.context().close();
  }

  // Открытие файлом (без сервера)
  console.log("\nОткрытие файлом:");
  {
    const page = await newPage(browser, { width: 390, height: 844 });
    await page.goto("file://" + path.join(ROOT, "index.html"));
    const sobaka = await idOf(page, "Собака");
    await page.goto("file://" + path.join(ROOT, "index.html") + "#dream=" + sobaka);
    await page.reload();
    await page.waitForSelector("main h1");
    ok((await page.locator("main h1").textContent()) === "Собака", "file:// + #dream=" + sobaka);
    await page.locator("button", { hasText: "Назад" }).first().click();
    await page.waitForTimeout(80);
    ok(await page.locator(".search-label").count() === 1, "кнопка «Назад» с прямой ссылки ведёт на главную");
    await page.context().close();
  }

  await browser.close();
  srv.close();
  console.log(fails ? "\nПРОВАЛЕНО: " + fails : "\nВсё в порядке.");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
