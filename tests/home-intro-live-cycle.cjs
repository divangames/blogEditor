// Observe actual timers in the published page, without accelerating its clock.
const assert = require('node:assert/strict');
module.exports = async (context, base) => {
  await Promise.all([1440, 390].map(async width => {
    const page = await context.newPage();
    try {
      await page.setViewportSize({width, height: 1000});
      await page.emulateMedia({reducedMotion: 'reduce'});
      await page.goto(base + '/', {waitUntil: 'domcontentloaded'});
      await page.waitForFunction(() => document.querySelector('#home-intro')?.dataset.introPhase === 'static');
      await page.waitForFunction(() => document.querySelector('#load-state')?.textContent !== 'Загружаем ваши материалы…');
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => {
        const host = document.querySelector('#home-intro');
        const rects = () => [...document.querySelectorAll('#tools,.recent-head,#recent')].map(n => {
          const r = n.getBoundingClientRect(); return [r.top, r.height];
        });
        const baseline = rects(), completed = new Set();
        let current = -1, hidden = false, pairs = 0;
        window.introCycleQA = {done: false, errors: [], widths: innerWidth};
        const fail = message => window.introCycleQA.errors.push(message);
        const observer = new MutationObserver(() => {
          const after = rects();
          if (after.some((r, i) => r.some((v, j) => Math.abs(v - baseline[i][j]) >= 1))) fail('Cards moved');
          const index = +host.dataset.introIndex;
          if (host.dataset.introPhase === 'typing') {
            if (current === 5 && index === 0 && completed.size === 6) {
              window.introCycleQA.done = true; observer.disconnect();
            }
            if (index !== current) {current = index; hidden = false; pairs = 0;}
            return;
          }
          if (host.dataset.introPhase !== 'blink') return;
          const opacity = getComputedStyle(host.querySelector('.intro-caret')).opacity;
          if (opacity === '0') hidden = true;
          else if (hidden) {hidden = false; pairs++;}
          if (+host.dataset.introBlinks === 5) {
            if (pairs !== 5) fail('Expected five visible cursor blink pairs: ' + index);
            const expected = host.querySelectorAll('.intro-measure')[index].textContent.slice(0, -2);
            if (host.querySelector('.intro-copy').textContent !== expected) fail('Incomplete phrase: ' + index);
            completed.add(index);
          }
        });
        observer.observe(host, {attributes: true, childList: true, subtree: true, characterData: true});
      });
      await page.emulateMedia({reducedMotion: 'no-preference'});
      await page.waitForFunction(() => window.introCycleQA.done, null, {timeout: 90000});
      assert.deepEqual(await page.evaluate(() => window.introCycleQA.errors), []);
      assert.equal(await page.locator('#home-intro button').count(), 0);
      console.log('LIVE_REAL_CYCLE_PASS ' + width + ': six complete phrases, five cursor blink pairs, loop, stable cards, no pause icon');
    } finally {await page.close();}
  }));
};
