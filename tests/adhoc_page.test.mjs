// Adhoc mode on a phone, against a mocked Sheets API (made-up listings, no trip data).
//   node tests/adhoc_page.test.mjs            (needs the playwright package and its Chromium)
// Checks the order (Rate Rank, blanks last, ?order=, &desc=1), a Booking room shown once at its
// best-ordered rate, copy groups collapsed, rows without photos listed, touch / key navigation,
// the empty state, that the mode is URL-only, and that nothing at all is sent to the sheet.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(HERE, '..', 'index.html'), 'utf8');
const OUT = process.env.SHOTS || join(HERE, 'shots');
mkdirSync(OUT, {recursive: true});
const TAB = 'T_TEST_1117_1123';

let failed = 0;
function check(ok, msg) { console.log(`${ok ? '  ok ' : '  FAIL'} ${msg}`); if (!ok) failed++; }

const H = ['Site', 'Name', 'District', 'URL', 'Room [BOOK]', 'Meal Plan [BOOK]', 'Free Cancellation [BOOK]', 'Price / Night (USD)',
           'Rating', 'Est. Commute (min)', 'Commute Station', 'Review Flags', 'Deal Scan',
           'J Review', 'J Compare', 'J Adhoc', 'J Ranking', 'J Tier', 'J Rate Rank', 'J Value', 'J Surplus'];
const air = id => `https://www.airbnb.com/rooms/${id}?check_in=2026-11-17&check_out=2026-11-23&adults=2`;
const book = (hotel, room, meal, cancel) => `https://www.booking.com/hotel/jp/${hotel}.html?checkin=2026-11-17&unit=jp/${hotel}~${room}~${meal}~${cancel}#RD${room}`;
// [site, name, district, url, room, meal, free, price, commute, rank, adhoc, extra]
const ROWS = [
  ['Airbnb', 'Canal loft', 'Kawasaki', air(2001), '', '', '', '95', '30', '3', true],
  ['Booking', 'Harbor Hotel', 'Kawasaki', book('harbor', 71, 'room-only', 'nonref'), 'Twin', 'room only', 'no', '120', '25', '5', true],
  ['Booking', 'Harbor Hotel', 'Kawasaki', book('harbor', 71, 'room-only', 'free'), 'Twin', 'room only', 'yes', '132', '25', '1', true],
  ['Booking', 'Harbor Hotel', 'Kawasaki', book('harbor', 71, 'breakfast', 'free'), 'Twin', 'breakfast', 'yes', '150', '25', '7', true],
  ['Booking', 'Harbor Hotel', 'Kawasaki', book('harbor', 72, 'room-only', 'free'), 'Suite', 'room only', 'yes', '210', '25', '2', true],
  ['Airbnb', 'Hill house', 'Yokohama', air(2002), '', '', '', '80', '50', '', true],
  ['Airbnb', 'Old mill', 'Kawasaki', air(2003), '', '', '', '70', '45', '10\nchecked twice', true],
  ['Airbnb', 'Unticked flat', 'Kawasaki', air(2004), '', '', '', '60', '20', '4', false],
  ['Airbnb', 'No-photo flat', 'Kawasaki', air(2005), '', '', '', '65', '35', '6', true],
  ['Booking', 'Station Inn', 'Kawasaki', book('station', 81, 'room-only', 'free'), 'Double', 'room only', 'yes', '99', '15', '8', true],
];
function mainTab(adhoc = true) {
  return [H, ...ROWS.map(([site, name, district, url, room, meal, free, price, commute, rank, tick], i) => {
    const r = Object.fromEntries(H.map(h => [h, '']));
    Object.assign(r, {Site: site, Name: name, District: district, URL: url, 'Room [BOOK]': room, 'Meal Plan [BOOK]': meal,
      'Free Cancellation [BOOK]': free, 'Price / Night (USD)': price, 'Est. Commute (min)': commute,
      'Commute Station': commute ? 'Kawasaki Station' : '', 'J Rate Rank': rank, 'J Adhoc': adhoc && tick ? 'TRUE' : 'FALSE',
      'J Compare': 'TRUE', 'J Tier': rank ? '2' : '', 'J Value': rank ? String(100 + i) : '', 'J Surplus': rank ? String(5 - i) : '',
      Rating: '8.5', 'Review Flags': i === 2 ? '40 reviews · noise 3' : '', 'Deal Scan': i === 9 ? '2026-11-01: Late Escape Deal -15%' : ''});
    return H.map(h => r[h]);
  })];
}
const KEY = {loft: 'air:2001', twin: 'book:jp/harbor#71', suite: 'book:jp/harbor#72', hill: 'air:2002', mill: 'air:2003', inn: 'book:jp/station#81', none: 'air:2005'};
function photosTab() {
  const rows = [['Key', 'Photo ID', 'URL', 'Thumb', 'Label', 'Room', 'Class', 'Bath', 'Group', 'Twin', 'Also In', 'Flag']];
  for (const k of [KEY.loft, KEY.twin, KEY.suite, KEY.hill, KEY.mill, KEY.inn, 'air:2004']) {
    for (let n = 1; n <= 3; n++) {
      const u = `https://img.test/${k.replace(/[:/#]/g, '_')}/${n}.svg`;
      const group = (k === KEY.twin || k === KEY.suite) && n === 1 ? `${KEY.twin}|1` : '';   // the same lobby photo in both rooms
      rows.push([k, String(n), u, u, `Photo ${n}`, n < 3 ? 'Bedroom' : '', n < 3 ? 'room' : 'unknown', n === 3 ? '1' : '', group, '', '',
                 k === KEY.mill && n === 2 ? 'Bath Separation · separated: no' : '']);
    }
  }
  return rows;
}
const tabOf = range => decodeURIComponent(range).replace(/^'/, '').replace(/'?!.*$/, '').replace(/''/g, "'");

async function setup(browser, sheet) {
  const ctx = await browser.newContext({...devices['iPhone 13'], hasTouch: true});
  await ctx.addInitScript(() => {
    sessionStorage.setItem('pa_token', JSON.stringify({t: 'test-token', expires: Date.now() + 3600e3}));
    localStorage.setItem('pa_reviewer', 'J');
  });
  const writes = [];
  await ctx.route('http://pa.test/**', r => r.fulfill({contentType: 'text/html', body: HTML}));
  await ctx.route('https://img.test/**', r => r.fulfill({contentType: 'image/svg+xml',
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#354"/><text x="20" y="160" font-size="22" fill="#fff">${r.request().url().split('/').slice(-2).join(' ')}</text></svg>`}));
  await ctx.route('https://sheets.googleapis.com/**', async r => {
    const url = new URL(r.request().url()), method = r.request().method();
    if (method !== 'GET') { writes.push(`${method} ${url.pathname}`); return r.fulfill({json: {}}); }
    if (url.pathname.endsWith('values:batchGet'))
      return r.fulfill({json: {valueRanges: url.searchParams.getAll('ranges').map(g => ({values: sheet[tabOf(g)] || []}))}});
    if (url.searchParams.get('fields')) return r.fulfill({json: {sheets: Object.keys(sheet).map(title => ({properties: {title}}))}});
    return r.fulfill({status: 404, json: {error: {message: 'not mocked'}}});
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('  page error:', e.message); failed++; });
  return {ctx, page, writes};
}
const sheetWith = main => ({[TAB]: main, [TAB + '_PHOTOS']: photosTab(), [TAB + '_MARKS']: [['Reviewer', 'Photo Key', 'Mark', 'At']]});
const order = page => page.evaluate(() => ADH.map(x => x.r.key));
const cur = page => page.evaluate(() => ({key: ADH[adhLi]?.r.key, pi: adhPi, n: ADH[adhLi]?.photos.length}));
async function swipe(page, x1, y1, x2, y2) {   // a one-finger swipe on the photo, as real touch events
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: x1, y: y1}]});
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x1 + (x2 - x1) * i / 6, y: y1 + (y2 - y1) * i / 6}]});
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await page.waitForTimeout(60);
}
async function stageTap(page, fx, fy) {
  const b = await page.locator('#stage').boundingBox();
  await page.touchscreen.tap(b.x + b.width * fx, b.y + b.height * fy);
  await page.waitForTimeout(60);
}

const browser = await chromium.launch();
try {
  console.log('Adhoc mode');
  let {ctx, page, writes} = await setup(browser, sheetWith(mainTab()));
  // a plain review link opens the review screen, with an Adhoc button
  await page.goto(`http://pa.test/index.html?tab=${TAB}`);
  await page.waitForSelector('#app.visible');
  check(!(await page.locator('#app').getAttribute('class')).includes('adhoc'), 'a plain link opens the photo review');
  check(await page.locator('#adh-btn').isVisible(), 'Adhoc button offered (the tab has “J Adhoc”)');
  await page.locator('#adh-btn').tap();
  await page.waitForFunction(() => ADHOC && ADH.length > 0);
  check(page.url().includes('adhoc=1'), 'Adhoc puts adhoc=1 in the address');
  check((await order(page)).join(' ') === [KEY.twin, KEY.suite, KEY.loft, KEY.inn, KEY.mill, KEY.hill].join(' '),
        `ordered by J Rate Rank, blanks last: ${(await order(page)).join(' ')}`);
  check((await page.evaluate(() => ADH[0].r.ranking.rateRank)) === '1', 'the Twin room shows once, at its best-ordered rate (rank 1 of 1 / 5 / 7)');
  check((await page.evaluate(() => ADH.filter(x => x.r.key === 'book:jp/harbor#71').length)) === 1, 'room dedupe: one entry for three rate rows');
  check((await page.evaluate(() => ADH.some(x => x.r.key === 'air:2004'))) === false, 'unticked rows left out');
  const suite = await page.evaluate(() => ADH[1]);
  check(suite.photos.length === 1 && suite.skipped === 1, `copy group: the Suite's shared photo shows once, under the Twin (${suite.photos.length} shown, ${suite.skipped} skipped; rooms view)`);
  check((await page.locator('#l-notes').innerText()).includes('No-photo flat'), 'a ticked row without photos is listed');
  const meta = await page.locator('#l-meta').innerText();
  for (const want of ['J Rate Rank: 1', 'Booking', 'Twin', '$132/night', 'free cancellation', 'Tier 2', 'Rate Rank 1', 'Value $102', 'Surplus +$3',
                      '25 min via Kawasaki Station', '40 reviews · noise 3'])
    check(meta.includes(want), `details show “${want}”`);
  check((await page.locator('#adh-progress').innerText()).includes('listing 1 / 6'), 'progress: listing 1 / 6');
  check(await page.locator('#side').isVisible(), 'listing details visible on the phone');
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  check(w[0] <= w[1], `no sideways scroll (${w[0]} ≤ ${w[1]})`);
  await page.screenshot({path: join(OUT, 'adhoc.png')});

  // navigation: tap zones, swipes, keys, filmstrip, the bottom bar
  await stageTap(page, 0.85, 0.5);
  check((await cur(page)).pi === 1, 'tap the right third: next photo');
  await stageTap(page, 0.15, 0.5);
  check((await cur(page)).pi === 0, 'tap the left third: previous photo');
  await stageTap(page, 0.5, 0.8);
  check((await cur(page)).key === KEY.suite, 'tap the lower middle: next listing');
  await stageTap(page, 0.5, 0.2);
  check((await cur(page)).key === KEY.twin, 'tap the upper middle: previous listing');
  const box = await page.locator('#stage').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await swipe(page, cx + 80, cy, cx - 80, cy);
  check((await cur(page)).pi === 1, 'swipe left: next photo');
  await swipe(page, cx, cy + 70, cx, cy - 70);
  check((await cur(page)).key === KEY.suite && (await cur(page)).pi === 0, 'swipe up: next listing, first photo');
  await swipe(page, cx, cy - 70, cx, cy + 70);
  check((await cur(page)).key === KEY.twin, 'swipe down: previous listing');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  check((await cur(page)).key === KEY.loft, '↓ ↓: third listing');
  await page.keyboard.press('ArrowRight');
  check((await cur(page)).pi === 1, '→: next photo');
  await page.locator('#strip img').nth(0).tap();
  check((await cur(page)).pi === 0, 'filmstrip: tap a thumbnail');
  await page.locator('#adh-next-l').tap();
  check((await cur(page)).key === KEY.inn, 'bottom bar: next listing');
  check((await page.locator('#l-meta').innerText()).includes('Late Escape Deal'), 'Deal Scan shown');
  await page.keyboard.press('ArrowDown');
  check((await page.locator('#l-meta').innerText()).includes('⚑ 1 photo flagged: Bath Separation'), 'photo-rule flags shown');
  check((await page.locator('#l-meta').innerText()).includes('J Rate Rank: 10'), 'a multi-line cell orders by its first line');
  await page.keyboard.press('r');
  check((await page.evaluate(() => photoView)) === 'bathroom' && (await cur(page)).n === 1, 'R: bathroom view');
  for (const k of ['r', 'r', 'r', 'r']) await page.keyboard.press(k);   // back to rooms
  // marking keys and the middle tap do nothing
  for (const k of ['1', '2', '0', 'b']) await page.keyboard.press(k);
  check(!(await page.locator('#bulk-overlay').isVisible()), 'review keys do nothing (no bulk dialog)');

  // ?order= and &desc=1
  await page.goto(`http://pa.test/index.html?tab=${TAB}&adhoc=1&order=${encodeURIComponent('Est. Commute (min)')}`);
  await page.waitForFunction(() => ADHOC && ADH.length > 0);
  check((await order(page)).join(' ') === [KEY.inn, KEY.twin, KEY.suite, KEY.loft, KEY.mill, KEY.hill].join(' '),
        `?order=Est. Commute (min): ${(await order(page)).join(' ')}`);
  check((await page.locator('#adh-order').inputValue()) === 'Est. Commute (min)', 'the picker shows the column');
  await page.locator('#info-btn').tap();
  await page.locator('#adh-dir').tap();
  check(page.url().includes('desc=1'), 'reversing puts desc=1 in the address');
  check((await order(page))[0] === KEY.hill, 'highest first');
  await page.locator('#adh-order').selectOption('J Rate Rank');
  check(page.url().includes('order=J+Rate+Rank') || page.url().includes('order=J%20Rate%20Rank'), 'the picker updates order=');
  check((await order(page)).join(' ') === [KEY.mill, KEY.inn, KEY.loft, KEY.suite, KEY.twin, KEY.hill].join(' '), 'Rate Rank highest first, blanks still last');
  await page.locator('#region-sel').selectOption('Yokohama');
  check((await order(page)).join(' ') === KEY.hill, 'region menu: Yokohama only');
  // ↻ sheet re-reads, the help dialog, back to Photos
  await page.locator('#refresh-btn').tap();
  await page.waitForTimeout(300);
  check((await order(page)).join(' ') === KEY.hill, '↻ sheet keeps the view');
  await page.locator('#help-btn').tap();
  check((await page.locator('#help-dialog').innerText()).toLowerCase().includes('adhoc look'), 'help lists adhoc mode');
  await page.locator('#help-close').tap();
  await page.locator('#adh-btn').tap();
  check(!page.url().includes('adhoc=') && !page.url().includes('order='), 'Photos clears adhoc / order from the address');
  check(await page.locator('#act-like').isVisible(), 'back on the photo review');
  // URL-only: the plain link still opens the review after visiting adhoc mode
  await page.goto(`http://pa.test/index.html?tab=${TAB}`);
  await page.waitForSelector('#app.visible');
  check(!(await page.locator('#app').getAttribute('class')).includes('adhoc'), 'adhoc mode isn’t remembered');
  check(writes.length === 0, `no writes to the sheet in adhoc mode (${writes.join(', ') || 'none'})`);
  await ctx.close();

  // empty state
  ({ctx, page, writes} = await setup(browser, sheetWith(mainTab(false))));
  await page.goto(`http://pa.test/index.html?tab=${TAB}&adhoc=1`);
  await page.waitForFunction(() => ADHOC);
  await page.waitForSelector('#empty:visible');
  check((await page.locator('#empty').innerText()).includes('No rows ticked “J Adhoc”: tick some in the sheet, then ↻ sheet.'), 'empty state');
  check(writes.length === 0, 'no writes');
  await page.screenshot({path: join(OUT, 'adhoc-empty.png')});
  await ctx.close();
} finally {
  await browser.close();
}
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
