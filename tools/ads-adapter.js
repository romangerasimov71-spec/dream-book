// Адаптер набора проверки рекламы (tools/ads-test, копия kits/ads-test из game-studio) для сонника.
//   python3 -m http.server 8790 --bind 127.0.0.1 &
//   NODE_PATH=/opt/node-tools/node_modules node tools/ads-test/run.js --url http://127.0.0.1:8790/index.html --adapter tools/ads-adapter.js
//
// Награда — «Мой сонник на неделю» (экран #week, кнопка «Смотреть рекламу и открыть»).
// Решение начальника к сборке: опоздавшая реклама награды не даёт (lateRewardGranted: false).
// Межстраничной рекламы в соннике нет (решение Романа) — случаи interstitial-* не проверяются.
// «Уровней» нет: «Заново» = ушёл на главную и вернулся к неделе, «другой уровень» = открыл сон дня.
const trial = async (loc) => {
  try { await loc.click({ trial: true, timeout: 500 }); return true; } catch (e) { return false; }
};
const ready = (page) => page.waitForFunction(() => window.Sonnik && Sonnik.isReady(), null, { timeout: 15000 });

module.exports = {
  name: 'Сонник',
  viewport: { width: 390, height: 844 },
  contextOptions: { locale: 'ru-RU' },
  rewardTimeoutMs: 12000,          // config.js REWARDED_WAIT_SEC
  lateRewardGranted: false,

  async prepare(page) {
    await ready(page);
    await page.evaluate(() => { location.hash = 'week'; });
    await page.waitForSelector('#weekAdBtn');
  },

  async clickRewarded(page) { await page.click('#weekAdBtn'); },

  // сколько раз за этот запуск выдана награда (неделя открыта)
  async rewardCount(page) { return page.evaluate(() => Sonnik.adGrants()); },

  // приложение отзывается: первая кнопка экрана нажимается (ничем не закрыта)
  async boardWorks(page) {
    if (await page.evaluate(() => document.body.classList.contains('is-ad-wait'))) return false;
    return trial(page.locator('main .btn:visible').first());
  },

  // «Назад» нажимается, нет окна «Загружаем рекламу»
  async buttonsWork(page) {
    if (await page.evaluate(() => document.body.classList.contains('is-ad-wait'))) return false;
    return trial(page.locator('main .back-link').first());
  },

  async restartLevel(page) {
    await page.click('#brand');
    await page.waitForSelector('.week-invite .btn');
    await page.click('.week-invite .btn');
    await page.waitForSelector('#weekAdBtn');
  },

  async switchLevel(page) {
    await page.click('#brand');
    await page.waitForSelector('#today .btn');
    await page.click('#today .btn');
    await page.waitForSelector('main h1');
  },

  async isPaused(page) { return page.evaluate(() => Platform.isPaused()); },
};
