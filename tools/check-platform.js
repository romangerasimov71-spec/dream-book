/* Проверка площадочной части сонника (Playwright + Chromium):
   баннер, «Мой сонник на неделю» за рекламу, хранилище, «поделиться» в ВК/ОК, открытка, статистика.
   Запуск: NODE_PATH=/opt/node-tools/node_modules node tools/check-platform.js
           SHOTS=/путь … — плюс скриншоты.
   Реклама здесь — имитация из platform.js (?fakead=…). Настоящие состояния Bridge проверяет
   набор tools/ads-test (см. tools/ads-adapter.js). */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const SHOTS = process.env.SHOTS || "";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };

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
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: false });
}

async function open(browser, url, vp, opts = {}) {
  const ctx = opts.ctx || await browser.newContext({ viewport: vp || { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: !!opts.touch, locale: "ru-RU" });
  if (!opts.ctx) await ctx.addInitScript(() => { try { delete Navigator.prototype.share; delete Navigator.prototype.canShare; } catch (e) {} });
  if (opts.bigFont) await ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    const st = document.createElement("style"); st.textContent = "html{font-size:36px !important}"; document.head.appendChild(st);
  }));
  const page = await ctx.newPage();
  page._errors = [];
  page.on("console", (m) => { if (m.type() === "error") page._errors.push(m.text()); });
  page.on("pageerror", (e) => page._errors.push(String(e)));
  await page.goto(url);
  await ready(page);
  return page;
}
const ready = (page) => page.waitForFunction(() => window.Sonnik && window.Sonnik.isReady && window.Sonnik.isReady(), null, { timeout: 15000 });
const events = (page) => page.evaluate(() => window.Analytics._log.map((x) => ({ name: x.name, data: x.data })));

// Всё нажимаемое и текст можно докрутить так, чтобы баннер их не закрывал:
// при прокрутке до конца низ последнего блока выше баннера; ни одна кнопка не под баннером.
async function bannerClear(page, label) {
  const r = await page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((res) => setTimeout(res, 60));
    const ban = document.querySelector(".fake-banner");
    if (!ban || getComputedStyle(ban).display === "none") return { noBanner: true };
    const top = ban.getBoundingClientRect().top;
    const under = [];
    document.querySelectorAll(".wrap a, .wrap button, .wrap input, .wrap p, .wrap li, .wrap h1, .wrap h2").forEach((el) => {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || el.offsetParent === null) return;
      if (b.bottom > top + 0.5 && b.top < window.innerHeight) under.push((el.className || el.tagName) + " «" + el.textContent.trim().slice(0, 20) + "» " + Math.round(b.bottom) + ">" + Math.round(top));
    });
    return { under, h: Math.round(ban.getBoundingClientRect().height), top: Math.round(top), H: window.innerHeight };
  });
  ok(!r.noBanner, label + ": баннер на экране");
  if (r.noBanner) return;
  ok(!r.under.length, label + ": баннер (" + r.h + "px) не закрывает текст и кнопки " + (r.under.length ? JSON.stringify(r.under.slice(0, 4)) : ""));
}

const bannerHidden = (page) => page.evaluate(() => { const b = document.querySelector(".fake-banner"); if (!b) return true; const r = b.getBoundingClientRect(); return getComputedStyle(b).display === "none" || r.height === 0; });

async function layout(page, label) {
  const r = await page.evaluate(() => {
    const small = [];
    document.querySelectorAll("main .btn, main .chip, main .item, main .back-link, main .week-dream a, .modal .btn, .modal .close, .ad-wait .btn").forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width && b.height < 47.5) small.push(el.className + " " + Math.round(b.height));
    });
    const txt = [];
    document.querySelectorAll(".week-tip, .week-date, .week-text, .week-dream, .week-sample-label, .week-lock, .week-points li, .notice, .week-invite p, .lead, .postcard-full-hint").forEach((el) => {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (el.offsetParent !== null && fs < 17.9) txt.push(el.className + " " + fs);
    });
    const cut = [];
    document.querySelectorAll("h1, h2, .btn, .week-date, .mood").forEach((el) => {
      if (el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1) cut.push(el.className + " «" + el.textContent.trim().slice(0, 20) + "»");
    });
    // слова не рвутся (как в tools/check.js)
    const broken = [];
    document.querySelectorAll(".btn, h1, h2, .week-date, .week-dream a").forEach((el) => {
      if (el.offsetParent === null) return;
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) {
        const re = /\S+/g; let m;
        while ((m = re.exec(n.data))) {
          const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
          if ([...rg.getClientRects()].filter((x) => x.width > 0.5).length > 1) broken.push("«" + m[0] + "»");
        }
      }
    });
    return { over: document.documentElement.scrollWidth - window.innerWidth, small, txt, cut, broken };
  });
  ok(r.over <= 0, label + ": нет прокрутки вбок (" + r.over + ")");
  ok(!r.small.length, label + ": кнопки не ниже 48px " + (r.small.length ? JSON.stringify(r.small.slice(0, 4)) : ""));
  ok(!r.txt.length, label + ": текст не меньше 18px " + (r.txt.length ? JSON.stringify(r.txt.slice(0, 4)) : ""));
  ok(!r.cut.length, label + ": ничего не обрезано " + (r.cut.length ? JSON.stringify(r.cut.slice(0, 4)) : ""));
  ok(!r.broken.length, label + ": слова не разорваны " + (r.broken.length ? JSON.stringify(r.broken.slice(0, 4)) : ""));
}

async function unlockWeek(page) {
  await page.click("#weekAdBtn");
  await page.waitForSelector(".fake-ad");
  await page.waitForFunction(() => /досмотрена/.test(document.querySelector(".fake-ad p").textContent), null, { timeout: 5000 });
  await page.click(".fake-ad-close");
  await page.waitForSelector(".week-day", { timeout: 3000 });
}

(async () => {
  const srv = await serve();
  const BASE = "http://127.0.0.1:" + srv.address().port + "/dream-book/";
  const browser = await chromium.launch();

  console.log("Площадка без ВК/ОК (как на GitHub Pages):");
  {
    const page = await open(browser, BASE);
    const st = await page.evaluate(() => ({ id: Platform.id, bridge: Platform.hasBridge, rew: Platform.rewardedAvailable(), banner: Platform.banner.mode }));
    ok(st.bridge && st.id === "mock", "Playgama Bridge запущен, площадка — обычный браузер (" + st.id + ")");
    ok(st.rew && st.banner === "fake", "реклама за награду и баннер — имитация");
    ok(await page.locator("#weekInvite").count() === 1, "на главной есть приглашение «Мой сонник на неделю»");
    const order = await page.evaluate(() => { const t = document.getElementById("today"), w = document.getElementById("weekInvite"); return t && w && t.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING; });
    ok(!!order, "приглашение стоит под «Сном дня»");
    const day = await page.evaluate(() => Sonnik.dreamOfDay(new Date()).id);
    await page.click("#today .btn"); await page.waitForTimeout(100);
    ok(await page.locator(".week-invite").count() === 1, "на экране сна дня есть приглашение");
    await page.goto(BASE + "#dream=" + (day === "sobaka" ? "koshka" : "sobaka")); await page.reload(); await ready(page);
    ok(await page.locator(".week-invite").count() === 0, "на экране обычного сна приглашения нет");
    ok(!page._errors.length, "ошибок в консоли нет " + JSON.stringify(page._errors));
    await page.context().close();
  }

  console.log("\nБаннер не закрывает текст и кнопки:");
  for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }, { width: 1366, height: 768 }]) {
    const label = vp.width + "×" + vp.height;
    const page = await open(browser, BASE + "?fakeadsec=1", vp, { touch: true });
    await bannerClear(page, label + " главная");
    await shot(page, "banner-" + label + "-home");
    await page.goto(BASE + "?fakeadsec=1#dream=sobaka"); await page.reload(); await ready(page);
    await bannerClear(page, label + " сон");
    await shot(page, "banner-" + label + "-dream");
    await page.goto(BASE + "?fakeadsec=1#week"); await page.reload(); await ready(page);
    await bannerClear(page, label + " неделя (закрыта)");
    await layout(page, label + " неделя (закрыта)");
    await shot(page, "week-locked-" + label);
    await unlockWeek(page);
    await bannerClear(page, label + " неделя (открыта)");
    await layout(page, label + " неделя (открыта)");
    await shot(page, "week-open-" + label);
    // окна: пока открыто окно, баннера нет; закрыли — вернулся
    await page.goto(BASE + "?fakeadsec=1#dream=sobaka"); await page.reload(); await ready(page);
    await page.click(".btn-share-top"); await page.waitForSelector(".modal");
    ok(await bannerHidden(page), label + ": окно «поделиться» — баннер убран (не виден)");
    await page.click(".modal button:has-text('Открытка со сном')"); await page.waitForTimeout(200);
    ok(await bannerHidden(page), label + ": окно открытки — баннер убран (не виден)");
    await page.keyboard.press("Escape"); await page.waitForTimeout(150);
    ok(!(await bannerHidden(page)) && await page.evaluate(() => document.documentElement.classList.contains("has-banner")), label + ": окно закрыли — баннер вернулся");
    // экранная клавиатура: пока поле поиска в фокусе — баннера нет
    await page.goto(BASE + "?fakeadsec=1"); await page.reload(); await ready(page);
    await page.click(".search-input"); await page.waitForTimeout(150);
    ok(await bannerHidden(page) && !(await page.evaluate(() => document.documentElement.classList.contains("has-banner"))), label + ": поле поиска в фокусе — баннер убран");
    await page.keyboard.type("соб"); await page.waitForSelector(".suggest li");
    const sugOk = await page.evaluate(() => { const l = [...document.querySelectorAll(".suggest li")].pop().getBoundingClientRect(); const b = document.querySelector(".fake-banner"); return getComputedStyle(b).display === "none" || l.bottom <= b.getBoundingClientRect().top; });
    ok(sugOk, label + ": подсказки поиска не под баннером");
    await page.click(".brand-name"); await page.waitForTimeout(200);
    ok(!(await bannerHidden(page)), label + ": поле поиска без фокуса — баннер вернулся");
    const toast = await page.evaluate(() => { const t = document.getElementById("toast").getBoundingClientRect(), b = document.querySelector(".fake-banner").getBoundingClientRect(); return t.bottom <= b.top + 1; });
    ok(toast, label + ": подсказки (тосты) появляются над баннером");
    ok(!page._errors.length, label + ": ошибок в консоли нет " + JSON.stringify(page._errors));
    await page.context().close();
  }

  console.log("\n«Мой сонник на неделю» — только за досмотренную рекламу:");
  for (const [mode, reason, text] of [["cancel", "closed", /закрыта раньше/], ["fail", "error", /недоступна/]]) {
    const page = await open(browser, BASE + "?fakead=" + mode + "&fakeadsec=2#week");
    await page.click("#weekAdBtn");
    await page.waitForSelector(".notice", { timeout: 5000 });
    ok(!(await page.evaluate(() => Sonnik.weekState().open)) && await page.locator(".week-day").count() === 0, mode + ": неделя не открылась");
    ok(text.test(await page.locator(".notice").textContent()), mode + ": понятное сообщение «" + (await page.locator(".notice").textContent()).slice(0, 40) + "…»");
    ok(await page.locator(".ad-wait").count() === 0 && await page.locator("#weekAdBtn").isEnabled(), mode + ": приложение не зависло, кнопку можно нажать снова");
    const ev = await events(page);
    ok(ev.some((e) => e.name === "ad_reward_failed" && e.data.reason === reason), mode + ": отметка ad_reward_failed reason=" + reason);
    ok(!ev.some((e) => e.name === "week_unlocked"), mode + ": week_unlocked нет");
    await page.reload(); await ready(page);
    ok(await page.locator(".week-day").count() === 0, mode + ": после перезагрузки неделя по-прежнему закрыта");
    await page.context().close();
  }
  {
    // Реклама опоздала: «не загрузилась» → реклама всё-таки началась → сообщение убрано → досмотрена → неделя открыта
    const page = await open(browser, BASE + "?fakead=late&fakeadsec=1#week");
    await page.click("#weekAdBtn");
    await page.waitForSelector(".ad-wait");
    await layout(page, "окно «Загружаем рекламу»");
    await page.waitForSelector(".notice", { timeout: 15000 });
    ok(/не загрузилась/.test(await page.locator(".notice").textContent()) && await page.locator(".ad-wait").count() === 0, "молчит 12 с: «Реклама не загрузилась», приложение не зависло");
    await page.waitForSelector(".fake-ad", { timeout: 6000 });
    await page.waitForTimeout(100);
    ok(await page.locator(".notice").count() === 0 && !(await page.evaluate(() => document.getElementById("toast").classList.contains("show"))), "реклама началась — сообщение «не загрузилась» убрано");
    ok(!(await page.evaluate(() => Sonnik.weekState().open)), "пока опоздавшая реклама идёт, неделя закрыта");
    await page.waitForFunction(() => /досмотрена/.test(document.querySelector(".fake-ad p").textContent), null, { timeout: 5000 });
    await page.click(".fake-ad-close"); await page.waitForSelector(".week-day", { timeout: 3000 });
    ok(await page.evaluate(() => Sonnik.weekState().open && Sonnik.adGrants() === 1), "опоздавшая реклама досмотрена — неделя открыта (одна награда)");
    ok(/Готово/.test(await page.locator(".notice").textContent()), "сообщение «Готово!»");
    ok(!/не загрузилась/.test(await page.evaluate(() => document.getElementById("toast").textContent + document.querySelector("main").textContent)), "в живых областях для читалок не осталось «Реклама не загрузилась»");
    const ev = await events(page);
    ok(ev.some((e) => e.name === "ad_reward_failed" && e.data.reason === "timeout") && ev.some((e) => e.name === "week_unlocked" && e.data.late === true), "отметки: ad_reward_failed timeout, затем week_unlocked late=true");
    await page.context().close();
  }
  {
    // «Отмена» во время ожидания, реклама потом всё-таки пришла, но её закрыли раньше — награды нет
    const page = await open(browser, BASE + "?fakead=late&fakeadsec=5#week");
    await page.click("#weekAdBtn");
    await page.waitForSelector(".ad-wait");
    await page.click(".ad-wait .btn");
    await page.waitForSelector(".notice");
    ok(/закрыта раньше/.test(await page.locator(".notice").textContent()) && await page.locator(".ad-wait").count() === 0, "«Отмена» во время ожидания: окно закрылось, сообщение есть");
    await page.waitForSelector(".fake-ad", { timeout: 16000 });
    await page.click(".fake-ad-close"); await page.waitForTimeout(300);
    ok(!(await page.evaluate(() => Sonnik.weekState().open)), "опоздавшая реклама закрыта раньше конца — неделя не открылась");
    ok(/закрыта раньше/.test(await page.locator(".notice").textContent()), "понятное сообщение");
    ok((await events(page)).some((e) => e.name === "ad_reward_failed" && e.data.reason === "closed" && e.data.late === true), "отметка ad_reward_failed closed late=true");
    await page.context().close();
  }
  {
    // «Назад» во время «Загружаем рекламу…» = «Отмена»; устаревшего сообщения нет
    const page = await open(browser, BASE + "?fakead=silent");
    await page.click("#weekInvite .btn"); await page.waitForSelector("#weekAdBtn");
    await page.click("#weekAdBtn"); await page.waitForSelector(".ad-wait");
    await page.goBack(); await page.waitForTimeout(300);
    ok(await page.locator(".ad-wait").count() === 0 && await page.locator(".search-input").count() === 1, "«Назад» во время ожидания: ожидание отменено, открылась главная");
    ok((await events(page)).some((e) => e.name === "ad_reward_failed" && e.data.reason === "closed"), "отметка ad_reward_failed closed");
    await page.click("#weekInvite .btn"); await page.waitForSelector("#weekAdBtn");
    ok(await page.locator(".notice").count() === 0, "на экране недели нет устаревшего сообщения");
    ok(await page.evaluate(() => !Sonnik.adBusy()), "приложение не ждёт рекламу");
    await page.context().close();
  }
  {
    const page = await open(browser, BASE + "?fakeadsec=1");
    await page.click("#weekInvite .btn"); await page.waitForSelector("#weekAdBtn");
    let ev = await events(page);
    ok(ev.some((e) => e.name === "week_offer_shown" && e.data.source === "home"), "отметка week_offer_shown source=home");
    await page.click("#weekAdBtn");
    await page.waitForSelector(".fake-ad");
    // во время рекламы награды ещё нет
    ok(!(await page.evaluate(() => Sonnik.weekState().open)), "пока реклама идёт, неделя закрыта");
    await page.waitForFunction(() => /досмотрена/.test(document.querySelector(".fake-ad p").textContent));
    await page.click(".fake-ad-close");
    await page.waitForSelector(".week-day");
    ok(await page.locator(".week-day").count() === 8, "досмотрена: 8 карточек — сегодня и 7 следующих дней");
    const shown = await page.locator(".week-text").allTextContents();
    const want = await page.evaluate(() => { const n = new Date(); return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => Sonnik.predictionFor(new Date(n.getFullYear(), n.getMonth(), n.getDate() + i, 9)).text); });
    ok(JSON.stringify(shown) === JSON.stringify(want), "на экране — личные предсказания на сегодня … +7 по формуле: «" + shown[0].slice(0, 40) + "…»");
    ok(new Set(shown).size === 8, "8 разных предсказаний");
    ok(await page.locator(".week-day .week-tip").count() === 8 && await page.locator(".week-day .mood").count() === 8, "у каждого дня — значок настроения и совет");
    const dts = await page.locator(".week-date").allTextContents();
    ok(/^Сегодня, \d+ \S+$/.test(dts[0]) && /^Завтра, \d+ \S+$/.test(dts[1]) && /^[А-Я][а-я]+, \d+ \S+$/.test(dts[2]), "даты: «" + dts.slice(0, 3).join("», «") + "»");
    const dreamLine = await page.locator(".week-dream").nth(1).textContent();
    const dreamWant = await page.evaluate(() => Sonnik.weekDays(new Date())[0].dream.title);
    ok(dreamLine === "Сон дня в этот день: " + dreamWant, "строка «" + dreamLine + "» ведёт к сну дня");
    // поделиться днём и неделей
    await page.locator(".week-share").nth(2).click(); await page.waitForSelector(".modal");
    const dayTxt = await page.locator(".share-preview").textContent();
    ok(/^Моё предсказание на [а-я]+, \d+ \S+: .+ — Сонник http\S+#week$/.test(dayTxt) && dayTxt.includes(shown[2]), "«Поделиться» днём: " + dayTxt.slice(0, 60) + "…");
    ok(await page.locator(".modal button:has-text('Открытка')").count() === 0 && await page.locator(".modal .btn-vk").count() === 1 && await page.locator(".modal button:has-text('Скопировать текст')").count() === 1, "окно: ВК, ОК, скопировать (без открытки сна)");
    await page.click(".modal button:has-text('Скопировать текст')"); await page.waitForTimeout(100);
    await page.keyboard.press("Escape"); await page.waitForTimeout(100);
    await page.click("button:has-text('Поделиться неделей')"); await page.waitForSelector(".modal");
    const weekTxt = await page.locator(".share-preview").textContent();
    const parts = weekTxt.replace(/^Моя неделя в Соннике: /, "").replace(/\. Узнайте свою неделю! http\S+#week$/, "").split("; ");
    const okWeek = /^Моя неделя в Соннике: [а-я]+, \d+ [а-я]+ — .+\. Узнайте свою неделю! http\S+#week$/.test(weekTxt) && !weekTxt.includes("…") && !/Завтра|завтра/.test(weekTxt) &&
      parts.length >= 2 && parts.length <= 3 && parts.every((p, k) => { const m = p.match(/^[а-я]+, \d+ [а-я]+ — (.+)$/); if (!m) return false; const full = shown[k].replace(/^./, (c) => c.toLowerCase()); return full.startsWith(m[1]) && /[.!?]$|^$/.test(full.slice(m[1].length, m[1].length + 1)); });
    ok(okWeek, "«Поделиться неделей»: даты, целые первые предложения, без «…»: " + weekTxt.slice(0, 90) + "…");
    const weekLens = await page.evaluate(() => { const r = []; for (let s = 1; s < 300; s++) { const old = Sonnik.seed; } return true; });
    void weekLens;
    await page.click(".modal .btn-vk"); await page.waitForTimeout(100);
    await page.keyboard.press("Escape"); await page.waitForTimeout(100);
    const sh = (await events(page)).filter((e) => e.name === "share_clicked");
    ok(sh.some((e) => e.data.what === "day" && e.data.channel === "copy") && sh.some((e) => e.data.what === "week" && e.data.channel === "vk") && sh.every((e) => !("dream_id" in e.data)), "share_clicked what=day/week, без dream_id");
    ok((await page.locator(".notice").textContent()) === "Готово! Ваша неделя открыта." && (await page.locator("main").textContent()).split("Открыт до").length === 2, "«Готово!» одно, срок «Открыт до …» — один раз");
    ev = await events(page);
    ok(ev.some((e) => e.name === "week_unlocked" && e.data.source === "home" && Object.keys(e.data).sort().join() === "late,source"), "отметка week_unlocked source=home, ничего личного (только source, late)");
    // главная: «Ваше предсказание на сегодня»
    await page.goto(BASE); await page.reload(); await ready(page);
    const todayTxt = await page.locator("#weekInvite .week-text").textContent();
    ok(/Ваше предсказание на сегодня/.test(await page.locator("#weekInvite h2").textContent()) && todayTxt === await page.evaluate(() => Sonnik.predictionFor(new Date()).text), "главная: «Ваше предсказание на сегодня» по той же формуле");
    ok(await page.locator("#weekInvite a[href='#week']").count() === 1, "…и ссылка на всю неделю");
    await page.goto(BASE + "#week"); await page.reload(); await ready(page);
    // хранилище переживает перезагрузку
    await page.reload(); await ready(page);
    ok(await page.locator(".week-day").count() === 8, "после перезагрузки неделя открыта (хранилище)");
    await page.goto(BASE); await page.reload(); await ready(page);
    ok(/Ваше предсказание на сегодня/.test(await page.locator("#weekInvite h2").textContent()), "на главной: «Ваше предсказание на сегодня»");
    // 7 дней: день открытия + 6; на 8-й день — снова за рекламу
    const days = await page.evaluate(() => { const n = new Date(); return [0, 3, 6, 7, 30].map((i) => Sonnik.weekState(new Date(n.getFullYear(), n.getMonth(), n.getDate() + i, 12)).open); });
    ok(JSON.stringify(days) === "[true,true,true,false,false]", "держится 7 дней (0,3,6 — открыт; 7, 30 — закрыт): " + JSON.stringify(days));
    // «прошло 7 дней»: день открытия неделю назад — после перезагрузки снова закрыто
    await page.evaluate(() => { const n = new Date(); const d = Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 86400000); return Platform.save({ sonnik_week: { from: d - 7 } }); });
    await page.goto(BASE + "#week"); await page.reload(); await ready(page);
    ok(await page.locator("#weekAdBtn").count() === 1 && await page.locator(".week-day").count() === 0, "через 7 дней неделя снова закрыта — открыть можно за рекламу");
    ok(/Ваша неделя закончилась — откройте новую/.test(await page.locator("main").textContent()), "экран недели: «Ваша неделя закончилась — откройте новую»");
    await page.goto(BASE); await page.reload(); await ready(page);
    ok(/Ваша неделя закончилась/.test(await page.locator("#weekInvite").textContent()), "главная: «Ваша неделя закончилась»");
    await page.evaluate(() => { const n = new Date(); const d = Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 86400000); return Platform.save({ sonnik_week: { from: d - 6 } }); });
    await page.goto(BASE + "#week"); await page.reload(); await ready(page);
    ok(await page.locator(".week-day").count() === 8, "на 7-й день ещё открыта");
    ok(!page._errors.length, "ошибок в консоли нет " + JSON.stringify(page._errors));
    await page.context().close();
  }

  console.log("\nЛичные предсказания (формула):");
  {
    const page = await open(browser, BASE);
    const r = await page.evaluate(() => {
      const n0 = new Date(2026, 10, 1, 12);
      const day = (i) => new Date(n0.getFullYear(), n0.getMonth(), n0.getDate() + i, 12);
      let sameOk = true, distinctBad = 0, warnBad = 0, diffSeeds = 0, checked = 0;
      const prev = new Set();
      for (let s = 1; s <= 1000; s++) {
        const seed = s * 7919 + 13;
        const ids = [], warn = [];
        for (let i = 0; i < 66; i++) { const p = Sonnik.predictionFor(day(i), seed); ids.push(p.id); warn.push(p.mood === "warn" ? 1 : 0); }
        for (let i = 0; i + 7 <= 66; i++) {
          checked++;
          if (new Set(ids.slice(i, i + 7)).size !== 7) distinctBad++;
          if (warn.slice(i, i + 7).reduce((a, b) => a + b, 0) > 1) warnBad++;
        }
        if (Sonnik.predictionFor(day(5), seed).id !== ids[5] || Sonnik.predictionFor(new Date(day(5).getTime() - 11 * 3600e3), seed).id !== ids[5]) sameOk = false;
        const key = ids.slice(0, 7).join();
        if (!prev.has(key)) diffSeeds++;
        prev.add(key);
      }
      return { sameOk, distinctBad, warnBad, diffSeeds, checked, n: Sonnik.predCount };
    });
    ok(r.n === 100, "предсказаний загружено: " + r.n);
    ok(r.sameOk, "тот же seed + та же дата → то же предсказание (и утром, и вечером)");
    ok(r.distinctBad === 0, "7 дней подряд — 7 разных (проверено окон: " + r.checked + ", нарушений " + r.distinctBad + ")");
    ok(r.warnBad === 0, "не больше одного «будьте внимательнее» за любые 7 дней (1000 seed × 60 дат, нарушений " + r.warnBad + ")");
    ok(r.diffSeeds >= 990, "у разных seed разные недели: " + r.diffSeeds + " из 1000");
    // seed: создаётся один раз и переживает перезагрузку
    const s1 = await page.evaluate(() => Sonnik.seed());
    const stored = await page.evaluate(() => Platform.load(["sonnik_seed"]).then((d) => d.sonnik_seed));
    await page.reload(); await ready(page);
    const s2 = await page.evaluate(() => Sonnik.seed());
    ok(s1 > 1 && s1 === s2 && Number(stored) === s1, "личный seed хранится и переживает перезагрузку: " + s1);
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p2 = await ctx2.newPage(); await p2.goto(BASE); await ready(p2);
    ok(await p2.evaluate(() => Sonnik.seed()) !== s1, "у другого человека (новый браузер) — другой seed");
    await ctx2.close();
    // экран предложения: пример — завтрашний день, первые слова
    await page.goto(BASE + "#week"); await page.reload(); await ready(page);
    const sample = await page.evaluate(() => { const t = document.querySelector(".week-sample .week-text"); return { first: t.firstChild.textContent.trim(), date: document.querySelector(".week-sample .week-date").textContent }; });
    const tomorrow = await page.evaluate(() => Sonnik.weekDays(new Date())[0].pred.text);
    ok(/^Завтра, /.test(sample.date) && tomorrow.startsWith(sample.first) && sample.first.split(" ").length <= 4 && sample.first.length < tomorrow.length, "пример: «" + sample.date + "» — «" + sample.first + "…», остальное под замком");
    ok(!(await page.locator(".week-sample").textContent()).includes(tomorrow), "полный текст примера не показан");
    ok(/у каждого своё/.test(await page.locator("main").textContent()), "объяснение «у каждого своё»");
    await page.goto(BASE); await page.reload(); await ready(page);
    ok((await page.locator("#weekInvite .btn").textContent()).trim() === "Узнайте, что ждёт вас на неделе", "приглашение на главной: «Узнайте, что ждёт вас на неделе»");
    await page.context().close();
  }
  {
    // нет файла предсказаний — неделя недоступна, остальное работает
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU" });
    await ctx.route("**/data/predictions.js", (r) => r.abort());
    const page = await open(browser, BASE + "#week", null, { ctx });
    ok(await page.locator(".search-input").count() === 1 && await page.locator("#weekInvite").count() === 0, "без data/predictions.js: приложение работает, недели нет, #week → главная");
    await ctx.close();
  }

  console.log("\nПолночь на экране недели:");
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU" });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date(2026, 10, 11, 23, 59, 0) });
    await page.goto(BASE + "#week");
    await ready(page);
    // неделя открыта 6 дней назад: сегодня последний день
    await page.evaluate(() => { const n = new Date(); const d = Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 86400000); return Platform.save({ sonnik_week: { from: d - 6 } }); });
    await page.reload(); await ready(page);
    const before = await page.locator(".week-day").count();
    const firstBefore = await page.locator(".week-text").first().textContent();
    await page.clock.runFor(2 * 60 * 1000);
    await page.waitForTimeout(200);
    ok(before === 8 && await page.locator(".week-day").count() === 0 && /закончилась/.test(await page.locator("main").textContent()), "в полночь экран недели обновился: последний день прошёл — «неделя закончилась»");
    await page.evaluate(() => { const n = new Date(); const d = Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 86400000); return Platform.save({ sonnik_week: { from: d } }); });
    await page.reload(); await ready(page);
    const first = await page.locator(".week-text").first().textContent();
    const secondDay = await page.locator(".week-text").nth(1).textContent();
    // Часы перескочили через полночь без срабатывания таймеров (сон компьютера) — экран обновится сам за минуту.
    await page.clock.setSystemTime(new Date(2026, 10, 13, 0, 5, 0));
    await page.clock.runFor(61 * 1000);
    await page.waitForTimeout(200);
    const dt0 = await page.locator(".week-date").first().textContent();
    const second = await page.locator(".week-text").first().textContent();
    const want = await page.evaluate(() => Sonnik.predictionFor(new Date()).text);
    ok(/^Сегодня, 13 ноября$/.test(dt0) && second === secondDay, "открытая вкладка, часы перешли полночь: первая карточка «" + dt0 + "», это вчерашнее «завтра»");
    ok(second === want && first !== second, "в следующую полночь список сдвинулся на день: «" + first.slice(0, 25) + "…» → «" + second.slice(0, 25) + "…» (до полуночи: " + firstBefore.slice(0, 20) + "…)");
    await ctx.close();
  }

  console.log("\nХранилище и «Недавно смотрели»:");
  {
    // запись «недавно смотрели» — не чаще раза в несколько секунд
    const page = await open(browser, BASE);
    await page.evaluate(() => { window.__saves = []; const o = Platform.save; Platform.save = (x) => { window.__saves.push(Object.keys(x).join(",")); return o(x); }; });
    for (const id of ["sobaka", "koshka", "zmeya", "voda"]) { await page.evaluate((i) => { location.hash = "dream=" + i; }, id); await page.waitForTimeout(150); }
    const n0 = await page.evaluate(() => window.__saves.length);
    await page.waitForTimeout(4500);
    const n1 = await page.evaluate(() => window.__saves.slice());
    ok(n0 === 0 && n1.length === 1 && n1[0] === "sonnik_recent", "4 сна подряд — одна запись через несколько секунд (сразу: " + n0 + ", потом: " + JSON.stringify(n1) + ")");
    await page.evaluate(() => { location.hash = "dream=sobaka"; });
    await page.waitForTimeout(100);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.context().close();
  }
  {
    const page = await open(browser, BASE + "#dream=sobaka");
    await page.goto(BASE + "#dream=koshka"); await page.reload(); await ready(page);
    await page.goto(BASE); await page.reload(); await ready(page);
    const chips = await page.locator(".recent .chip").allTextContents();
    ok(chips[0] === "Кошка" && chips[1] === "Собака", "после перезагрузок: " + chips.join(", "));
    const viaBridge = await page.evaluate(() => Platform.hasBridge && Platform.load(["sonnik_recent"]).then((d) => d.sonnik_recent));
    ok(Array.isArray(viaBridge) && viaBridge[0] === "koshka", "сохранено через хранилище Bridge: " + JSON.stringify(viaBridge));
    await page.context().close();
  }
  {
    // Bridge не загрузился (заблокирован) — запасной localStorage, всё работает
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU" });
    await ctx.route("**/playgama-bridge.js", (r) => r.abort());
    const page = await open(browser, BASE + "#dream=zmeya", null, { ctx });
    ok(await page.evaluate(() => Platform.id === "none" && !Platform.hasBridge), "без Bridge: приложение открылось");
    await page.goto(BASE); await page.reload(); await ready(page);
    ok((await page.locator(".recent .chip").allTextContents())[0] === "Змея", "без Bridge: «Недавно смотрели» сохранились (localStorage)");
    ok(await page.locator("#weekInvite").count() === 1, "без Bridge: неделя открывается имитацией рекламы");
    ok(!page._errors.filter((e) => !/Failed to load resource|ERR_FAILED/.test(e)).length, "без Bridge: ошибок нет " + JSON.stringify(page._errors));
    await ctx.close();
  }

  console.log("\nДругой адрес (как внутри ВК/ОК): имитации рекламы нет");
  for (const blockBridge of [false, true]) {
    const label = blockBridge ? "Bridge не загрузился" : "Bridge без рекламы";
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU" });
    await ctx.route("http://sonnik.example/**", async (route) => {
      let p = new URL(route.request().url()).pathname.slice(1) || "index.html";
      if (blockBridge && p === "playgama-bridge.js") return route.abort();
      const file = path.join(ROOT, p);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
      route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) });
    });
    await ctx.route(/^(?!http:\/\/sonnik\.example)/, (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto("http://sonnik.example/");
    await ready(page);
    const st = await page.evaluate(() => ({ id: Platform.id, rew: Platform.rewardedAvailable(), banner: Platform.banner.mode }));
    ok(!st.rew && st.banner === "none", label + " (" + st.id + "): реклама недоступна, баннера нет");
    ok(await page.locator("#weekInvite, .week-invite").count() === 0 && await page.locator(".fake-banner").count() === 0, label + ": нет приглашения недели и серой полоски");
    await page.goto("http://sonnik.example/#week"); await page.reload(); await ready(page);
    ok(await page.locator(".search-input").count() === 1 && await page.locator("#weekAdBtn").count() === 0, label + ": #week открывает главную (нет обещания и неактивной кнопки)");
    await ctx.close();
  }

  console.log("\nВКонтакте и Одноклассники (Bridge подменён):");
  for (const ch of ["vk", "ok"]) {
    const page = await open(browser, BASE + "#dream=zmeya");
    await page.evaluate((c) => {
      window.__sh = [];
      Platform.id = c; Platform.isReal = true; Platform.isSocial = true;
      Platform.nativeShareChannel = () => c;
      Platform.externalLinksAllowed = () => c === "vk";
      Platform.shareNative = (d) => { window.__sh.push(d); return Promise.resolve(); };
    }, ch);
    await page.click(".btn-share-top"); await page.waitForSelector(".modal");
    const first = (await page.locator(".modal .stack .btn").first().textContent()).trim();
    ok(first === (ch === "vk" ? "Поделиться ВКонтакте" : "Поделиться в Одноклассниках"), ch + ": первая кнопка — «" + first + "»");
    await page.locator(".modal .stack .btn").first().click(); await page.waitForTimeout(100);
    const sh = await page.evaluate(() => window.__sh);
    ok(sh.length === 1 && /#dream=zmeya$/.test(sh[0].url) && /^Мне приснилось: Змея/.test(sh[0].text), ch + ": окно площадки получило текст и ссылку на сон " + (sh[0] ? sh[0].url : ""));
    const other = await page.locator(ch === "vk" ? ".modal .btn-ok" : ".modal .btn-vk").count();
    ok(other === 0, ch + ": кнопки другой сети нет (во ВК — ни слова про ОК, в ОК — про ВКонтакте)");
    ok((await events(page)).some((e) => e.name === "share_clicked" && e.data.channel === ch && e.data.dream_id === "zmeya"), ch + ": отметка share_clicked channel=" + ch);
    // открытка: скачивание не работает — картинка на весь экран
    await page.click(".modal button:has-text('Открытка со сном')"); await page.waitForTimeout(200);
    await page.click(".modal button:has-text('Сохранить открытку')"); await page.waitForTimeout(200);
    const full = await page.evaluate(() => { const i = document.querySelector(".modal-full .postcard-full-img"); const m = document.querySelector(".modal-full").getBoundingClientRect(); return i && i.complete && i.naturalWidth === 1080 && i.src.startsWith("data:image/png") && m.width >= window.innerWidth - 30 ? document.querySelector(".postcard-full-hint").textContent : ""; });
    ok(/удерживайте|правой кнопкой/.test(full), ch + ": открытка на весь экран + подпись «" + full.slice(0, 45) + "…»");
    await layout(page, ch + " открытка на весь экран");
    await shot(page, ch + "-postcard-full");
    ok((await events(page)).some((e) => e.name === "postcard_saved" && e.data.method === "fullscreen"), ch + ": отметка postcard_saved method=fullscreen");
    await page.click(".modal button:has-text('Назад к открытке')"); await page.waitForTimeout(150);
    ok(await page.locator(".postcard-img").count() === 1, ch + ": «Назад к открытке» работает");
    await page.keyboard.press("Escape"); await page.waitForTimeout(100);
    ok(await page.locator(".modal").count() === 0, ch + ": Esc закрывает");
    await page.context().close();
  }
  // Запуск по-настоящему: площадку узнаём по параметрам адреса (Bridge 2.4.1 в ОК отвечает 'vk').
  // fake — VK Bridge с unpkg подменён (Bridge поднимается), blocked — unpkg недоступен (Bridge не поднимается).
  console.log("\nЗапуск в ВК и ОК по параметрам адреса:");
  const APP_CONFIG_URL = (() => { const w = {}; require("vm").runInNewContext(require("fs").readFileSync(require("path").join(__dirname, "..", "config.js"), "utf8"), { window: w }); return w.APP_CONFIG.APP_URL; })();
  const FAKE_VKB = "window.vkBridge={send:function(m,p){window.__vkb=(window.__vkb||[]).concat([{m:m,p:p}]);" +
    "if(m==='VKWebAppStorageGet')return Promise.resolve({keys:(p.keys||[]).map(function(k){return {key:k,value:''}})});" +
    "if(m==='VKWebAppGetUserInfo')return Promise.resolve({id:1});return Promise.resolve({result:true});}," +
    "subscribe:function(){},supports:function(){return true},isWebView:function(){return false}};";
  for (const [where, query] of [["ok", "?vk_app_id=54891122&vk_client=ok&vk_platform=mobile_web_ok&vk_language=ru"],
    ["ok", "?logged_user_id=1&application_key=X&api_server=https%3A%2F%2Fapi.ok.ru%2F&session_key=s"],
    ["vk", "?vk_app_id=54891122&vk_platform=mobile_android&vk_language=ru"]]) {
    for (const net of ["fake", "blocked"]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU" });
      await ctx.route("https://unpkg.com/**", (r) => net === "fake" ? r.fulfill({ contentType: "text/javascript", body: FAKE_VKB }) : r.abort());
      const page = await open(browser, BASE + query + "#dream=zmeya", null, { ctx });
      const st = await page.evaluate(() => ({ id: Platform.id, launch: Platform.launch, bridgeId: Platform.bridgeId || "", url: Platform.appUrl(), native: Platform.nativeShareChannel(), links: Platform.externalLinksAllowed() }));
      const label = where + " (" + net + ", " + query.slice(1, 30) + "…)";
      ok(st.launch === where && st.id !== (where === "ok" ? "vk" : "ok"), label + ": площадка " + JSON.stringify(st));
      ok(st.url === APP_CONFIG_URL[where] && !st.links, label + ": ссылка " + st.url + ", ссылки наружу запрещены");
      await page.click(".btn-share-top"); await page.waitForSelector(".modal");
      const txt = await page.evaluate(() => document.body.innerText + " " + [...document.querySelectorAll("a[href]")].map((a) => a.href).join(" "));
      if (where === "ok") ok(!/ВКонтакте|vk\.com\/(app|share)|github\.io|connect\.ok/i.test(txt), label + ": в ОК нет ВКонтакте, vk.com/app, github.io и внешних ссылок");
      else ok(!/Одноклассник|ok\.ru|github\.io/i.test(txt), label + ": во ВК нет Одноклассников и ok.ru");
      ok(await page.locator(".modal a[target=_blank]").count() === 0, label + ": в окне «Поделиться» нет ссылок наружу");
      if (net === "fake" && st.native) {
        await page.locator(".modal .stack .btn").first().click(); await page.waitForTimeout(200);
        const calls = await page.evaluate(() => (window.__vkb || []).filter((c) => c.m === "VKWebAppShare"));
        ok(calls.length === 1 && calls[0].p.link === APP_CONFIG_URL[where] + "#dream=zmeya", label + ": VKWebAppShare со ссылкой " + (calls[0] && calls[0].p.link));
      }
      ok(page._errors.filter((e) => !/Failed to load resource|ERR_FAILED|unpkg/.test(e)).length === 0, label + ": ошибок нет " + JSON.stringify(page._errors.slice(0, 3)));
      await ctx.close();
    }
  }
  {
    // Ссылка из ВК: адрес приложения в config.js и payload
    const page = await open(browser, BASE + "#dream=zmeya");
    const url = await page.evaluate(() => { APP_CONFIG.APP_URL.vk = "https://vk.com/app123"; Platform.id = "vk"; return Sonnik.shareUrl({ id: "zmeya" }); });
    ok(url === "https://vk.com/app123#dream=zmeya", "ссылка «поделиться» во ВК берётся из config.js: " + url);
    const url2 = await page.evaluate(() => { Platform.id = "mock"; return Sonnik.shareUrl({ id: "zmeya" }); });
    ok(/^http:\/\/127\.0\.0\.1:\d+\/dream-book\/#dream=zmeya$/.test(url2), "без адреса площадки — текущий адрес: " + url2);
    await page.context().close();
  }

  console.log("\nОтметки для статистики:");
  {
    const page = await open(browser, BASE);
    const search = async (q) => { await page.goto(BASE); await page.reload(); await ready(page); await page.fill(".search-input", q); await page.press(".search-input", "Enter"); await page.waitForTimeout(150); return (await events(page)).filter((e) => e.name === "search").pop(); };
    let e = await search("собака");
    ok(e && e.data.found === "yes" && e.data.method === "enter" && !("query" in e.data), "search: «собака» → found=yes, enter, без запроса");
    let d = (await events(page)).filter((x) => x.name === "dream_opened").pop();
    ok(d && d.data.source === "search" && d.data.dream_id === "sobaka", "dream_opened source=search dream_id=sobaka");
    e = await search("абырвалг");
    ok(e && e.data.found === "no" && e.data.query === "абырвалг", "search: не найдено, одно слово строчными → запрос передан");
    for (const q of ["Абырвалг", "абыр валг", "абырвалг1", "ab", "аб", "абырвалгабырвалгабырвалг", "иван@mail.ru"]) {
      e = await search(q);
      ok(e && !("query" in e.data), "search: «" + q + "» → запрос НЕ передан (found=" + (e && e.data.found) + ")");
    }
    e = await search("сабака");
    ok(e && e.data.found === "choice" && !("query" in e.data), "search: «сабака» → found=choice");
    await page.goto(BASE); await page.reload(); await ready(page);
    await page.click(".search-input"); await page.keyboard.type("змея"); await page.waitForSelector(".suggest li");
    await page.click(".suggest li"); await page.waitForTimeout(100);
    ok((await events(page)).some((x) => x.name === "search" && x.data.method === "suggest"), "search method=suggest (подсказка)");
    await page.goto(BASE); await page.reload(); await ready(page);
    await page.click(".cat >> nth=0"); await page.waitForTimeout(80);
    ok((await events(page)).some((x) => x.name === "search" && x.data.method === "category"), "search method=category (раздел)");
    await page.click(".item >> nth=0"); await page.waitForTimeout(80);
    ok((await events(page)).filter((x) => x.name === "dream_opened").pop().data.source === "category", "dream_opened source=category");
    await page.click(".similar .item >> nth=0"); await page.waitForTimeout(80);
    ok((await events(page)).filter((x) => x.name === "dream_opened").pop().data.source === "similar", "dream_opened source=similar");
    await page.click("button:has-text('Случайный сон')"); await page.waitForTimeout(80);
    ok((await events(page)).filter((x) => x.name === "dream_opened").pop().data.source === "random", "dream_opened source=random");
    await page.goto(BASE); await page.reload(); await ready(page);
    await page.click("#today .btn"); await page.waitForTimeout(80);
    ok((await events(page)).filter((x) => x.name === "dream_opened").pop().data.source === "day", "dream_opened source=day");
    await page.goto(BASE + "#dream=kot"); await page.goto(BASE + "#dream=koshka"); await page.reload(); await ready(page);
    let ev = await events(page);
    ok(ev[0].name === "app_opened" && ev[0].data.entry === "dream" && ev[0].data.returning === true, "app_opened entry=dream returning=true");
    ok(ev.some((x) => x.name === "dream_opened" && x.data.source === "link"), "dream_opened source=link");
    await page.mouse.click(5, 300); await page.waitForTimeout(50);
    ev = await events(page);
    const fi = ev.find((x) => x.name === "first_input");
    ok(fi && fi.data.input === "mouse" && typeof fi.data.seconds === "number", "first_input: " + JSON.stringify(fi && fi.data));
    await page.click(".btn-share-top"); await page.click(".modal button:has-text('Скопировать текст')"); await page.waitForTimeout(100);
    ok((await events(page)).some((x) => x.name === "share_clicked" && x.data.channel === "copy"), "share_clicked channel=copy");
    await page.keyboard.press("Escape");
    // performance_sample: человек листает ~1,5 с, потом образец сбрасывается вручную
    for (let i = 0; i < 15; i++) { await page.mouse.wheel(0, i % 2 ? 200 : -200); await page.waitForTimeout(100); }
    await page.evaluate(() => Analytics._flush());
    const ps = (await events(page)).find((x) => x.name === "performance_sample");
    const need = ["target_fps", "window_ms", "active_ms", "frame_count", "fps_avg", "fps_p10", "frame_time_p50_ms", "frame_time_p95_ms", "frame_time_p99_ms", "frame_time_max_ms", "frames_over_50ms", "frames_over_100ms", "frames_over_250ms", "frames_over_500ms", "frames_over_1000ms", "game_version"];
    ok(ps && need.every((k) => k in ps.data), "performance_sample со всеми полями гайда: " + (ps ? "кадров " + ps.data.frame_count + ", fps " + ps.data.fps_avg : "нет"));
    // никаких личных данных и длинных строк
    const all = await events(page);
    ok(all.every((x) => Object.values(x.data).every((v) => typeof v !== "string" || (v.length <= 40 && !/https?:|@/.test(v)))), "в отметках нет адресов, почты, длинных текстов");
    const names = [...new Set(all.map((x) => x.name))].sort();
    const allowed = ["app_opened", "first_input", "search", "dream_opened", "share_clicked", "postcard_saved", "week_offer_shown", "week_unlocked", "ad_reward_failed", "performance_sample"];
    ok(names.every((n) => allowed.includes(n)), "только события из списка docs/analytics.md: " + names.join(", "));
    // через Bridge действительно уходят
    // Bridge оборачивает свои модули (подменить send для подсчёта нельзя): проверяем, что
    // модуль нашёл bridge.analytics.send и вызов прошёл без ошибки.
    const sent = await page.evaluate(() => typeof bridge.analytics.send === "function" && Analytics.event("app_opened", { entry: "home", returning: false }));
    ok(sent === true, "отметки уходят через bridge.analytics.send");
    ok(!page._errors.length, "ошибок в консоли нет " + JSON.stringify(page._errors));
    await page.context().close();
  }

  console.log("\nУзкие экраны и крупный шрифт (неделя):");
  for (const [w, hgt, big] of [[320, 568, false], [360, 760, false], [390, 844, true], [320, 568, true], [844, 390, true], [1366, 768, true]]) {
    const label = w + "×" + hgt + (big ? " шрифт 200%" : "");
    const page = await open(browser, BASE + "?fakeadsec=1#week", { width: w, height: hgt }, { touch: w < 900, bigFont: big });
    await bannerClear(page, label + " неделя (закрыта, пример)");
    await layout(page, label + " неделя (закрыта)");
    await page.goto(BASE + "?fakeadsec=1"); await page.reload(); await ready(page);
    await layout(page, label + " главная с приглашением");
    await page.goto(BASE + "?fakeadsec=1#week"); await page.reload(); await ready(page);
    await unlockWeek(page);
    await layout(page, label + " неделя (открыта)");
    await bannerClear(page, label + " неделя (открыта)");
    await page.goto(BASE + "?fakeadsec=1"); await page.reload(); await ready(page);
    await layout(page, label + " главная: предсказание на сегодня");
    if (big && w === 390) await shot(page, "week-open-font200");
    await page.context().close();
  }

  console.log("\nОткрытие файлом:");
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU" });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto("file://" + path.join(ROOT, "index.html") + "#week");
    await ready(page);
    ok(await page.locator("main h1").textContent() === "Мой сонник на неделю", "file:// открывается (Bridge без конфига — работает без него), площадка: " + await page.evaluate(() => Platform.id));
    ok(!errs.length, "file://: ошибок нет " + JSON.stringify(errs));
    await ctx.close();
  }

  await browser.close();
  srv.close();
  console.log(fails ? "\nПРОВАЛЕНО: " + fails : "\nВсё в порядке.");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
