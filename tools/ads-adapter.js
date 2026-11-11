// Адаптер набора проверки рекламы (tools/ads-test, копия kits/ads-test из game-studio) для сонника.
//   python3 -m http.server 8790 --bind 127.0.0.1 &
//   NODE_PATH=/opt/node-tools/node_modules node tools/ads-test/run.js --url http://127.0.0.1:8790/index.html --adapter tools/ads-adapter.js
//
// Награда — «Мой сонник на неделю» (экран #week, кнопка «Смотреть рекламу и открыть»).
// Опоздавшая реклама (началась после того, как мы перестали ждать), досмотренная до конца,
// даёт награду: человек её честно посмотрел (правка после проверки, 11 ноя).
// Межстраничной рекламы в соннике нет (решение Романа) — случаи interstitial-* не проверяются.
// «Уровней» и «попыток» нет: награда (неделя) не привязана к экрану, поэтому случаи
// late-restart / late-win / late-switch («ушёл с попытки — награды нет») к соннику не относятся
// и не проверяются (SKIP).
const trial = async (loc) => {
  try { await loc.click({ trial: true, timeout: 500 }); return true; } catch (e) { return false; }
};
const ready = (page) => page.waitForFunction(() => window.Sonnik && Sonnik.isReady(), null, { timeout: 15000 });

module.exports = {
  name: 'Сонник',
  viewport: { width: 390, height: 844 },
  contextOptions: { locale: 'ru-RU' },
  rewardTimeoutMs: 12000,          // config.js REWARDED_WAIT_SEC
  lateRewardGranted: true,

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

  async isPaused(page) { return page.evaluate(() => Platform.isPaused()); },
};
