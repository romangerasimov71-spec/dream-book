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
    viewport: vp, deviceScaleFactor: 1, hasTouch: !!opts.touch, isMobile: !!opts.touch, locale: "ru-RU"
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
    document.querySelectorAll(".btn, .chip, .cat, .item, .back-link, .search-input, .close").forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width && b.height < 47.5) small.push(el.className + " " + Math.round(b.height));
    });
    const txt = [];
    document.querySelectorAll(".dream .text p, .details dd, .tip p, .item-short, .lead, .today p").forEach((el) => {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 18) txt.push(el.className + " " + fs);
    });
    return { overflow: document.documentElement.scrollWidth - window.innerWidth, small, txt };
  });
  ok(r.overflow <= 0, label + ": нет прокрутки вбок (" + r.overflow + ")");
  ok(!r.small.length, label + ": все кнопки не ниже 48px " + (r.small.length ? JSON.stringify(r.small) : ""));
  ok(!r.txt.length, label + ": основной текст не меньше 18px " + (r.txt.length ? JSON.stringify(r.txt) : ""));
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
      ["собака", "Собака"], ["сабака", "Собака"], ["зуб", "Зубы"], ["мне снилась змея", "Змея"],
      ["ёлка", "Ёлка"], ["елка", "Ёлка"], ["мне снилась большая собака", "Собака"], ["к чему снится кот", "Кошка"]
    ];
    if (!hasRealBase || sc.name === "phone-portrait") {
      for (const [q, want] of cases) {
        await page.goto(BASE);
        const got = await searchFor(page, q);
        ok(got === want, "поиск «" + q + "» → " + got);
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
    await page.locator("button", { hasText: "Поделиться" }).click();
    await page.waitForSelector(".modal");
    const vk = await page.locator(".btn-vk").getAttribute("href");
    const okr = await page.locator(".btn-ok").getAttribute("href");
    ok(vk.startsWith("https://vk.com/share.php?url=") && decodeURIComponent(vk).includes("#dream=" + zmeya), "ссылка ВК правильная");
    ok(okr.startsWith("https://connect.ok.ru/offer?url=") && okr.includes("description="), "ссылка ОК правильная");
    const prev = await page.locator(".share-preview").textContent();
    ok(/^Мне приснилась змея[:.] .+ — Сонник http/.test(prev), "текст: " + prev.slice(0, 70) + "…");
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

    // Недавно искали
    ok(await page.locator(".chip").count() >= 1, "«Недавно искали» заполнено: " + await page.locator(".chip").count());

    ok(!page._errors.length, "ошибок в консоли нет " + (page._errors.length ? JSON.stringify(page._errors) : ""));
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
