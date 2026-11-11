/* Скриншоты 600x1200 для карточки ВК/ОК: локальная копия приложения, Chromium 400x800 x1.5.
   Баннер-имитация выключена параметром ?nobanner, сам код не меняется.
   Запуск: NODE_PATH=/opt/node-tools/node_modules node tools/release-shots.js */
"use strict";
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "release", "vk", "screens");
fs.mkdirSync(OUT, { recursive: true });
const T = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (!p.startsWith("/dream-book/")) { res.writeHead(404); return res.end(); }
  const f = path.join(ROOT, p.slice(12) || "index.html");
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": T[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}/dream-book/`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, locale: "ru-RU" });
  const page = await ctx.newPage();
  const snap = async (n) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(OUT, n + ".png") }); };
  await page.goto(base + "?nobanner&fakead=ok&fakeadsec=1");
  await page.waitForSelector(".item, .cat, .btn", { timeout: 15000 });
  await snap("1-glavnaya");
  await page.goto(base + "?nobanner&fakead=ok&fakeadsec=1#dream=koshka");
  await snap("2-koshka");
  await page.goto(base + "?nobanner&fakead=ok&fakeadsec=1#cats");
  await page.waitForTimeout(900); await page.evaluate(() => { const e = document.getElementById("cats"); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 70); });
  await snap("3-razdely");
  // неделя: открыть за рекламу
  await page.goto(base + "?nobanner&fakead=ok&fakeadsec=1#week");
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(require("os").tmpdir(), "sonnik_week-closed.png") });
  const adBtn = page.locator("button.btn-primary").first();
  console.log("кнопка:", await adBtn.innerText());
  await adBtn.click();
  await page.waitForFunction(() => /досмотрена/.test((document.querySelector(".fake-ad") || {}).innerText || ""), null, { timeout: 20000 });
  await page.locator(".fake-ad-close").click();
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const n = document.querySelector(".notice"); if (n) n.remove(); window.scrollTo(0, 0); });
  await snap("4-nedelya");
  await page.evaluate(() => { const d = document.querySelectorAll(".week-day")[1]; window.scrollTo(0, d.getBoundingClientRect().top + window.scrollY - 16); });
  await snap("5-nedelya-dni");
  await page.goto(base + "?nobanner#dream=zmeya");
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator("button.btn-primary", { hasText: "Поделиться" }).first().click();
  await page.locator("button", { hasText: "Открытка со сном" }).click();
  await page.waitForTimeout(1500);
  await snap("6-otkrytka");
  fs.writeFileSync(path.join(require("os").tmpdir(), "sonnik_body.txt"), await page.evaluate(() => document.body.innerText));
  await b.close(); srv.close();
})();
