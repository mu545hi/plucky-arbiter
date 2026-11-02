// Compare mode on a phone, against a mocked Sheets API (made-up data in fixture.mjs).
//   node tests/compare_page.test.mjs            (needs the playwright package and its Chromium)
// Serves index.html from disk, answers sheets.googleapis.com from in-memory tabs, and records what
// the page appends to <TAB>_COMPARE. Exits non-zero on the first failed check.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import F from './fixture.mjs';

const { chromium, devices } = createRequire(import.meta.url)('playwright');   // a global install works too

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(HERE, '..', 'index.html'), 'utf8');
const OUT = process.env.SHOTS || join(HERE, 'shots');
mkdirSync(OUT, {recursive: true});
const TAB = F.tab;

let failed = 0;
function check(ok, msg) { console.log(`${ok ? '  ok ' : '  FAIL'} ${msg}`); if (!ok) failed++; }

function makeSheet(queueRows) {
  return {
    [TAB]: F.main.map(r => r.slice()),
    [TAB + '_PHOTOS']: F.photos.map(r => r.slice()),
    [TAB + '_MARKS']: [['Reviewer', 'Photo Key', 'Mark', 'At'], ['J', 'air:1001|1', 'like', '2026-11-01T10:00:00']],
    [TAB + '_COMPARE_QUEUE']: [F.queueHeaders, ...queueRows],
    [TAB + '_COMPARE']: [['Reviewer', 'Question ID', 'Answer', 'At']],
  };
}
const tabOf = range => decodeURIComponent(range).replace(/^'/, '').replace(/'?!.*$/, '').replace(/''/g, "'");

async function setup(browser, sheet) {
  const ctx = await browser.newContext({...devices['iPhone 13'], hasTouch: true});
  await ctx.addInitScript(() => {
    sessionStorage.setItem('pa_token', JSON.stringify({t: 'test-token', expires: Date.now() + 3600e3}));
    localStorage.setItem('pa_reviewer', 'J');
  });
  const appended = [];
  await ctx.route('http://pa.test/**', r => r.fulfill({contentType: 'text/html', body: HTML}));
  await ctx.route('https://img.test/**', r => {
    const label = r.request().url().split('/').slice(-2).join(' ');
    r.fulfill({contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#345"/><text x="20" y="160" font-size="22" fill="#fff">${label}</text></svg>`});
  });
  await ctx.route('https://sheets.googleapis.com/**', async r => {
    const url = new URL(r.request().url()), method = r.request().method();
    if (url.pathname.endsWith('values:batchGet')) {
      const ranges = url.searchParams.getAll('ranges');
      return r.fulfill({json: {valueRanges: ranges.map(rg => ({range: rg, values: sheet[tabOf(rg)] || []}))}});
    }
    if (method === 'GET' && url.searchParams.get('fields')) {
      return r.fulfill({json: {sheets: Object.keys(sheet).map(title => ({properties: {title}}))}});
    }
    const m = /\/values\/([^/]+):append$/.exec(url.pathname);
    if (m && method === 'POST') {
      const tab = tabOf(m[1]), rows = JSON.parse(r.request().postData()).values;
      sheet[tab].push(...rows);
      if (tab === TAB + '_COMPARE') appended.push(...rows);
      return r.fulfill({json: {updates: {updatedRows: rows.length}}});
    }
    if (url.pathname.endsWith('values:batchUpdate')) return r.fulfill({json: {}});
    return r.fulfill({status: 404, json: {error: {message: 'not mocked: ' + url.pathname}}});
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('  page error:', e.message); failed++; });
  page.on('dialog', d => d.accept());   // the drop confirmation
  return {ctx, page, appended};
}
const progress = page => page.locator('#cmp-progress').innerText();
const qid = (page, rows) => page.evaluate(() => cmpQ && cmpQ.id);
async function waitAppended(appended, n) {
  for (let i = 0; i < 100 && appended.length < n; i++) await new Promise(r => setTimeout(r, 50));
  return appended.length >= n;
}
const tapButton = (page, i) => page.locator('#cq-buttons button').nth(i).tap();

const browser = await chromium.launch();
try {
  // ── 0. The photo review still works, and offers compare mode ──
  console.log('Photo review');
  {
    const sheet = makeSheet(F.tierRows);
    const {ctx, page} = await setup(browser, sheet);
    await page.goto(`http://pa.test/index.html?tab=${TAB}`);
    await page.waitForSelector('#photo[src^="https://img.test/"]');
    check(await page.locator('#cmp-btn').isVisible(), 'Compare button offered when the tab has a queue');
    check(!(await page.locator('#cmp-view').isVisible()), 'compare view hidden in photo review');
    const n = sheet[TAB + '_MARKS'].length;
    await page.locator('#act-like').tap();
    for (let i = 0; i < 60 && sheet[TAB + '_MARKS'].length === n; i++) await page.waitForTimeout(50);
    check(sheet[TAB + '_MARKS'].length > n && sheet[TAB + '_MARKS'].at(-1)[2] === 'like', 'a like is still logged to _MARKS');
    await page.locator('#cmp-btn').tap();
    check(await page.locator('#cq-buttons button').first().isVisible(), 'Compare switches to the questions');
    check(page.url().includes('compare=1'), 'and puts compare=1 in the address');
    await ctx.close();
  }

  // ── 1. A tier batch: answer, undo, drop, reload mid-batch, finish, flag it done ──
  console.log('Tier batch');
  const tierQs = F.tierRows.filter(r => r[4] !== 'status');
  const sheet = makeSheet(F.tierRows);
  let {ctx, page, appended} = await setup(browser, sheet);
  await page.goto(`http://pa.test/index.html?tab=${TAB}&compare=1`);
  await page.waitForSelector('#cq-buttons button');
  check((await page.locator('#cq-buttons button').count()) === 3, 'tier question: three answer buttons');
  check((await page.locator('#cq-prompt').innerText()).includes('Placing a new option'), 'tier prompt from the queue');
  check((await page.locator('.cq-info .reveal').count()) === 2, 'prices hidden on both sides');
  check((await progress(page)).includes('1 / ' + tierQs.length), 'progress 1 / ' + tierQs.length);
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  check(w[0] <= w[1], `no sideways scroll on the phone (${w[0]} ≤ ${w[1]})`);
  check((await page.locator('#cq-0 .cq-photo img').getAttribute('src'))?.startsWith('https://img.test/'), 'left photo shown');
  await page.screenshot({path: join(OUT, 'tier-question.png')});
  const first = await qid(page);
  await tapButton(page, 1);   // same tier
  check(await waitAppended(appended, 1), 'answer saved to the sheet');
  check(JSON.stringify(appended[0].slice(0, 3)) === JSON.stringify(['J', first, 'same']), `logged ${appended[0].slice(0, 3)}`);
  check((await progress(page)).includes('2 / '), 'moved to question 2');
  await page.locator('#cmp-undo').tap();
  check(await waitAppended(appended, 2), 'undo saved');
  check(JSON.stringify(appended[1].slice(0, 3)) === JSON.stringify(['J', first, 'undo']), 'undo row for that question');
  check((await qid(page)) === first, 'back on the undone question');
  await page.keyboard.press('3');   // keys work too: right is a higher tier
  check(await waitAppended(appended, 3), 'answer by key saved');
  check(appended[2][2] === 'higher', 'key 3 = higher');
  // drop the right option of question 2
  const second = await qid(page);
  await page.locator('#cq-1 .cq-drop').tap();
  check(await waitAppended(appended, 4), 'drop saved');
  check(JSON.stringify(appended[3].slice(0, 3)) === JSON.stringify(['J', second, 'drop right']), 'drop right logged');
  // photos: tap a thumbnail, open and step the lightbox
  await page.locator('#cq-0 .cq-strip img').nth(1).tap();
  check((await page.locator('#cq-0 .cq-n').innerText()).startsWith('2 /'), 'thumbnail picks the photo');
  await page.locator('#cq-0 .cq-photo').tap();
  check(await page.locator('#cmp-lb').isVisible(), 'photo enlarges');
  await page.screenshot({path: join(OUT, 'lightbox.png')});
  await page.mouse.click(195, 420);   // middle: close
  check(!(await page.locator('#cmp-lb').isVisible()), 'lightbox closes');
  // answer two more, then reload: resumes at the first open question
  await tapButton(page, 0); await waitAppended(appended, 5);
  await tapButton(page, 2); await waitAppended(appended, 6);
  const before = await qid(page), prog = await progress(page);
  await page.reload();
  await page.waitForSelector('#cq-buttons button');
  check((await qid(page)) === before, `reload resumes at ${before}`);
  check((await progress(page)) === prog, `same progress after reload (${prog})`);
  // finish the batch
  for (let n = 0; n < 20 && await page.locator('#cq-buttons button').first().isVisible(); n++) {
    const k = appended.length;
    await tapButton(page, n % 3);
    await waitAppended(appended, k + 1);
  }
  await page.waitForSelector('#cmp-done h2');
  check((await page.locator('#cmp-done h2').innerText()).includes('Batch done: ranking runs next'), 'batch done message');
  check((await page.locator('#cmp-done table tr').count()) > 3, 'ranking columns shown as they stand');
  await page.screenshot({path: join(OUT, 'batch-done.png'), fullPage: true});
  const k = appended.length;
  await page.locator('#cmp-flag').tap();
  check(await waitAppended(appended, k + 1), 'flag saved');
  check(JSON.stringify(appended[k].slice(0, 3)) === JSON.stringify(['J', tierQs[0][1], 'batch done']), `flag row ${appended[k].slice(0, 3)}`);
  check(await page.locator('#cmp-flag').isDisabled(), 'flag button shows it is done');
  writeFileSync(join(OUT, 'tier-log.mjs'), 'export default ' + JSON.stringify(sheet[TAB + '_COMPARE']) + ';\n');
  await ctx.close();

  // ── 2. A value batch: five-point scale with prices, the cancellation question, drop + skip ──
  console.log('Value batch');
  ({ctx, page, appended} = await setup(browser, makeSheet(F.valueRows)));
  await page.goto(`http://pa.test/index.html?tab=${TAB}&compare=1`);
  await page.waitForSelector('#cq-buttons button');
  const valueQs = F.valueRows.filter(r => r[4] !== 'status');
  check((await page.locator('#cq-buttons button').count()) === 5, 'value question: five answer buttons');
  check((await page.locator('.cq-info .price').count()) === 2, 'prices shown');
  check((await page.locator('#cq-note').innerText()).startsWith('Right costs'), 'price gap shown');
  const titles = await page.locator('#cq-buttons .t').allInnerTexts();
  check(titles[0].includes('Left much better') && titles[4].includes('Right much better'), 'labels from the queue');
  await page.screenshot({path: join(OUT, 'value-question.png')});
  // drop an option that later questions share: they're skipped
  const cancelUnit = valueQs.find(r => r[4] === 'cancel')[5];   // keep the cancellation question askable
  const later = (i, u) => u !== cancelUnit && valueQs.slice(i + 1).some(o => o[5] === u || o[6] === u);
  const si = valueQs.findIndex((r, i) => r[4] !== 'cancel' && (later(i, r[5]) || later(i, r[6])));
  const shared = valueQs[si], dropSide = later(si, shared[5]) ? 'left' : 'right';   // a later question has it too
  const openBefore = await page.evaluate(() => cmpState().open.length);
  // walk to the question with the shared option
  while ((await qid(page)) !== shared[2]) { const n = appended.length; await tapButton(page, 2); await waitAppended(appended, n + 1); }
  const open2 = await page.evaluate(() => cmpState().open.length);
  const nDrop = appended.length;
  await page.keyboard.press(dropSide === 'left' ? 'Shift+ArrowLeft' : 'Shift+ArrowRight');
  check(await waitAppended(appended, nDrop + 1), 'drop by key saved');
  const open3 = await page.evaluate(() => cmpState().open.length);
  check(open3 < open2 - 1, `dropping a shared option skips its other questions (${open2} → ${open3} open)`);
  check(appended[appended.length - 1][2] === 'drop ' + dropSide, `drop ${dropSide} by ⇧ + arrow`);
  // on to the cancellation question
  for (let n = 0; n < 20 && (await page.evaluate(() => cmpQ && cmpQ.phase)) && (await page.evaluate(() => cmpQ.phase)) !== 'cancel'; n++) {
    const k2 = appended.length; await tapButton(page, 2); await waitAppended(appended, k2 + 1);
  }
  check((await page.evaluate(() => cmpQ && cmpQ.phase)) === 'cancel', 'reached the cancellation question');
  check((await page.locator('#cq-prompt').innerText()).includes('free cancellation'), 'cancellation prompt');
  check((await page.locator('.cq-drop').count()) === 0, 'no drop on the cancellation question');
  await page.screenshot({path: join(OUT, 'cancel-question.png')});
  const k3 = appended.length;
  await page.keyboard.press('4');
  check(await waitAppended(appended, k3 + 1), 'cancellation answer saved');
  check(appended[k3][2] === 'right', 'key 4 = right slightly better');
  check(await page.locator('#cmp-done h2').isVisible(), `batch done after ${openBefore} questions`);
  // undo after the batch is done brings the last question back
  await page.keyboard.press('u');
  await waitAppended(appended, k3 + 2);
  check((await page.evaluate(() => cmpQ && cmpQ.phase)) === 'cancel', 'undo reopens the last question');
  await ctx.close();
} finally {
  await browser.close();
}
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
