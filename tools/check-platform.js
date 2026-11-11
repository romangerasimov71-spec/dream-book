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
    if (!ban || ban.hidden) return { noBanner: true };
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

async function layout(page, label) {
  const r = await page.evaluate(() => {
    const small = [];
    document.querySelectorAll("main .btn, main .chip, main .item, main .back-link, main .week-title, .modal .btn, .modal .close, .ad-wait .btn").forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width && b.height < 47.5) small.push(el.className + " " + Math.round(b.height));
    });
    const txt = [];
    document.querySelectorAll(".week-tip, .week-date, .week-points li, .notice, .week-invite p, .lead, .postcard-full-hint").forEach((el) => {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (el.offsetParent !== null && fs < 17.9) txt.push(el.className + " " + fs);
    });
    const cut = [];
    document.querySelectorAll("h1, h2, .btn, .week-title, .mood").forEach((el) => {
      if (el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1) cut.push(el.className + " «" + el.textContent.trim().slice(0, 20) + "»");
    });
    // слова не рвутся (как в tools/check.js)
    const broken = [];
    document.querySelectorAll(".btn, h1, h2, .week-title").forEach((el) => {
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
  for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
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
    ok(await page.evaluate(() => document.querySelector(".fake-banner").hidden), label + ": окно «поделиться» — баннер убран");
    await page.click(".modal button:has-text('Открытка со сном')"); await page.waitForTimeout(200);
    ok(await page.evaluate(() => document.querySelector(".fake-banner").hidden), label + ": окно открытки — баннер убран");
    await page.keyboard.press("Escape"); await page.waitForTimeout(150);
    ok(await page.evaluate(() => !document.querySelector(".fake-banner").hidden && document.documentElement.classList.contains("has-banner")), label + ": окно закрыли — баннер вернулся");
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
    // «Отмена» в окне ожидания, потом реклама всё-таки пришла — награды нет
    const page = await open(browser, BASE + "?fakead=late&fakeadsec=1#week");
    await page.click("#weekAdBtn");
    await page.waitForSelector(".ad-wait");
    await layout(page, "окно «Загружаем рекламу»");
    await page.click(".ad-wait .btn");
    await page.waitForSelector(".notice");
    ok(/закрыта раньше/.test(await page.locator(".notice").textContent()) && await page.locator(".ad-wait").count() === 0, "«Отмена» во время ожидания: окно закрылось, сообщение есть");
    await page.waitForSelector(".fake-ad", { timeout: 16000 });
    await page.waitForFunction(() => /досмотрена/.test(document.querySelector(".fake-ad p").textContent), null, { timeout: 5000 });
    await page.click(".fake-ad-close"); await page.waitForTimeout(300);
    ok(!(await page.evaluate(() => Sonnik.weekState().open)), "опоздавшая реклама досмотрена — неделя не открылась");
    ok(/слишком поздно/.test(await page.locator(".notice").textContent()), "опоздала: понятное сообщение");
    ok((await events(page)).some((e) => e.name === "ad_reward_failed" && e.data.reason === "late"), "отметка ad_reward_failed reason=late");
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
    ok(await page.locator(".week-day").count() === 7, "досмотрена: 7 снов дня вперёд");
    const shown = await page.locator(".week-title").allTextContents();
    const want = await page.evaluate(() => Sonnik.weekDreams(new Date()).map((x) => x.dream.title));
    ok(JSON.stringify(shown) === JSON.stringify(want), "те же сны, что будут «снами дня» на завтра … +7: " + shown.slice(0, 3).join(", ") + "…");
    const want2 = await page.evaluate(() => { const n = new Date(); return [1, 2, 3, 4, 5, 6, 7].map((i) => Sonnik.dreamOfDay(new Date(n.getFullYear(), n.getMonth(), n.getDate() + i, 9)).title); });
    ok(JSON.stringify(shown) === JSON.stringify(want2), "совпадает с правилом «сон дня» по датам");
    ok(await page.locator(".week-tip").count() === 7, "у каждого дня — совет");
    ok(/Завтра/.test(await page.locator(".week-date").first().textContent()), "первый день подписан «Завтра»");
    ok(/Готово/.test(await page.locator(".notice").textContent()), "сообщение «Готово! … открыт до …»");
    ev = await events(page);
    ok(ev.some((e) => e.name === "week_unlocked" && e.data.source === "home"), "отметка week_unlocked source=home");
    // хранилище переживает перезагрузку
    await page.reload(); await ready(page);
    ok(await page.locator(".week-day").count() === 7, "после перезагрузки неделя открыта (хранилище)");
    await page.goto(BASE); await page.reload(); await ready(page);
    ok(/Открыт до/.test(await page.locator("#weekInvite p").textContent()), "на главной: «Открыт до …»");
    // 7 дней: день открытия + 6; на 8-й день — снова за рекламу
    const days = await page.evaluate(() => { const n = new Date(); return [0, 3, 6, 7, 30].map((i) => Sonnik.weekState(new Date(n.getFullYear(), n.getMonth(), n.getDate() + i, 12)).open); });
    ok(JSON.stringify(days) === "[true,true,true,false,false]", "держится 7 дней (0,3,6 — открыт; 7, 30 — закрыт): " + JSON.stringify(days));
    // «прошло 7 дней»: день открытия неделю назад — после перезагрузки снова закрыто
    await page.evaluate(() => { const n = new Date(); const d = Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 86400000); return Platform.save({ sonnik_week: { from: d - 7 } }); });
    await page.goto(BASE + "#week"); await page.reload(); await ready(page);
    ok(await page.locator("#weekAdBtn").count() === 1 && await page.locator(".week-day").count() === 0, "через 7 дней неделя снова закрыта — открыть можно за рекламу");
    await page.evaluate(() => { const n = new Date(); const d = Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 86400000); return Platform.save({ sonnik_week: { from: d - 6 } }); });
    await page.reload(); await ready(page);
    ok(await page.locator(".week-day").count() === 7, "на 7-й день ещё открыта");
    ok(!page._errors.length, "ошибок в консоли нет " + JSON.stringify(page._errors));
    await page.context().close();
  }

  console.log("\nХранилище и «Недавно смотрели»:");
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
    ok(ch === "vk" ? other === 1 : other === 0, ch + ": кнопка другой сети " + (ch === "vk" ? "есть (ссылки разрешены)" : "спрятана (ссылки наружу запрещены)"));
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
  for (const [w, big] of [[320, false], [360, false], [390, true], [1366, true]]) {
    const label = w + (big ? " шрифт 200%" : "");
    const page = await open(browser, BASE + "?fakeadsec=1#week", { width: w, height: 760 }, { touch: w < 500, bigFont: big });
    await layout(page, label + " неделя (закрыта)");
    await page.goto(BASE + "?fakeadsec=1"); await page.reload(); await ready(page);
    await layout(page, label + " главная с приглашением");
    await page.goto(BASE + "?fakeadsec=1#week"); await page.reload(); await ready(page);
    await unlockWeek(page);
    await layout(page, label + " неделя (открыта)");
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
