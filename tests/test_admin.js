// Fixture-driven tests for admin.html. Serves the page with API_URL pointed at a fake endpoint, intercepts that
// endpoint with an in-memory model of the sheet (same validation rules as tools/admin-api.gs), and asserts the UI.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SITE_DIR = path.resolve(__dirname, '..');
const OUT = path.resolve(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

const API = 'https://api.test/exec';
const KEY = 'k7test';

// ---------- in-memory "sheet" ----------
const teamsBase = [
  [1, 'Juan Manuel Rouges', 'Amir Guezaiel', 8, 0], [2, "Nick D'Urso", 'Michael Bukati', 8, 0], [3, 'Ryan Vrba', 'El Tony', 9, 1],
  [4, 'Mackenzie Dobbs', 'Peter Pacheco', 9, 1], [5, 'Igor Przhegalinskii', 'Heath Admiral', 9, 1], [6, 'Mike Kuzma', 'Chris Bernard', 9, 1],
  [7, 'Vicente Posadas', 'Richard Bounds', 9, 1], [8, 'Ronald Nazon', 'Chris McKenzie', 9, 1], [9, 'William McIlroy', 'Karl Rourke', 9, 1],
  [10, 'Marc Fuentes', 'Darren Davis', 8, 0],
];
function freshSheet() {
  return {
    gross: { 3: 66, 5: 70 },
    lines: { Format: '2-Man Scramble', Handicap: '35% low + 15% high (USGA scramble). Strokes off the low team.', Rules: 'No gimmies / Play the ball as it lies', Notice: '' },
    log: [],
  };
}
let sheet = freshSheet();
let mode = 'ok';           // ok | badkey | down | garbage
let lastPost = null;

function state() {
  const nets = teamsBase.filter(t => sheet.gross[t[0]] != null).map(t => sheet.gross[t[0]] - t[4]).sort((a, b) => a - b);
  return {
    ok: true,
    teams: teamsBase.map(t => {
      const g = sheet.gross[t[0]]; const net = g == null ? null : g - t[4];
      return { team: t[0], a: t[1], b: t[2], hcp: t[3], strokes: t[4], gross: g == null ? null : g, net, vsPar: net == null ? null : net - 72, rank: net == null ? null : nets.indexOf(net) + 1 };
    }),
    par: 72,
    lines: Object.assign({}, sheet.lines),
    info: { Event: '2nd Annual Cuntini Cup', Date: 'Saturday 26 September 2026', Venue: 'El Camaleón at Mayakoba' },
    editable: ['Format', 'Handicap', 'Rules', 'Notice'],
    scoreMin: 50, scoreMax: 120, lineMaxLength: 300, readAt: new Date().toISOString(),
  };
}
function apply(body) {
  // mirrors applyChanges_ in admin-api.gs: validate everything, then write
  const scores = body.scores || {}, lines = body.lines || {};
  const writes = [];
  for (const k of Object.keys(scores)) {
    if (!teamsBase.find(t => String(t[0]) === String(k))) return { ok: false, error: `Unknown team "${k}". Nothing was saved.` };
    const raw = scores[k];
    let v = '';
    if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
      const s = String(raw).trim();
      if (!/^\d{1,3}$/.test(s)) return { ok: false, error: `Team ${k}: "${s}" is not a whole number. Nothing was saved.` };
      v = Number(s);
      if (v < 50 || v > 120) return { ok: false, error: `Team ${k}: ${v} is outside 50–120. Nothing was saved.` };
    }
    writes.push(() => { const old = sheet.gross[k]; if ((old == null ? '' : old) !== v) { if (v === '') delete sheet.gross[k]; else sheet.gross[k] = v; sheet.log.push([`Team ${k} gross`, old == null ? '(blank)' : old, v === '' ? '(blank)' : v]); } });
  }
  for (const label of Object.keys(lines)) {
    if (!['Format', 'Handicap', 'Rules', 'Notice'].includes(label)) return { ok: false, error: `"${label}" cannot be changed from the admin page. Nothing was saved.` };
    const text = String(lines[label] == null ? '' : lines[label]).replace(/\s+/g, ' ').trim();
    if (text.length > 300) return { ok: false, error: `${label} is too long (max 300 characters). Nothing was saved.` };
    writes.push(() => { const old = sheet.lines[label]; if (old !== text) { sheet.lines[label] = text; sheet.log.push([`${label} line`, old || '(blank)', text || '(blank)']); } });
  }
  const before = sheet.log.length;
  writes.forEach(w => w());
  return Object.assign({ ok: true, changed: sheet.log.length - before }, state());
}

// ---------- static server that points admin.html at the fake API ----------
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, r) => {
      const f = path.join(SITE_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
      if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
      const type = /\.jpe?g$/i.test(f) ? 'image/jpeg' : /\.png$/i.test(f) ? 'image/png' : 'text/html; charset=utf-8';
      let body = fs.readFileSync(f);
      if (/admin\.html$/.test(f)) {
        const src = body.toString('utf8');
        if (!/const API_URL = '[^']*';/.test(src)) throw new Error('API_URL line not found in admin.html');
        body = Buffer.from(src.replace(/const API_URL = '[^']*';/, `const API_URL = '${API}';`));
      }
      r.writeHead(200, { 'Content-Type': type }); r.end(body);
    }).listen(0, () => res(srv));
  });
}

let failures = 0;
function check(name, ok, extra = '') { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`); if (!ok) failures++; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/admin.html`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && mode === 'ok') errors.push('[' + mode + '] ' + m.text()); });

  await page.route(API + '**', async route => {
    const req = route.request();
    if (mode === 'down') return route.abort('failed');
    if (mode === 'garbage') return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Sign in</html>' });
    let body = {};
    if (req.method() === 'POST') { body = JSON.parse(req.postData() || '{}'); lastPost = body; }
    const k = req.method() === 'GET' ? new URL(req.url()).searchParams.get('k') : body.k;
    if (mode === 'badkey' || k !== KEY) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'This link is not valid. Ask Willis for the organizer link.' }) });
    const out = req.method() === 'GET' ? state() : apply(body);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
  });

  // ----- 1. Load with the key -----
  await page.goto(base + '?k=' + KEY, { waitUntil: 'networkidle' });
  await page.waitForSelector('#main:not([hidden])');
  check('10 team rows', (await page.$$('#teams .row')).length === 10);
  check('event name from sheet', (await page.textContent('#event-name')).trim() === '2nd Annual Cuntini Cup');
  const vals = await page.$$eval('#teams .row input', is => is.map(i => i.value));
  check('scores prefilled (T3=66, T5=70, others blank)', vals.join(',') === ',,66,,70,,,,,', vals.join(','));
  const meta3 = await page.$eval('#teams .row[data-team="3"] .meta', e => e.textContent.replace(/\s+/g, ' ').trim());
  check('team 3 shows strokes, net and rank', /Strokes 1.*Net 65.*1st/.test(meta3), meta3);
  const meta1 = await page.$eval('#teams .row[data-team="1"] .meta', e => e.textContent.replace(/\s+/g, ' ').trim());
  check('unscored team shows "No score yet"', /Strokes 0.*No score yet/.test(meta1), meta1);
  const labels = await page.$$eval('#lines .field label', ls => ls.map(l => l.textContent.trim()));
  check('four editable lines in order', labels.join('|') === 'Format|Handicap|Rules|Notice', labels.join('|'));
  check('rules prefilled', (await page.inputValue('#line-Rules')) === 'No gimmies / Play the ball as it lies');
  check('save disabled with no changes', await page.isDisabled('#save'));
  check('no horizontal overflow at 390', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(OUT, 'admin-1-loaded.png'), fullPage: true });

  // ----- 2. Validation -----
  await page.fill('#teams .row[data-team="1"] input', '49');
  check('49 flagged out of range', /between 50 and 120/.test(await page.textContent('#teams .row[data-team="1"] .err')));
  check('save disabled while invalid', await page.isDisabled('#save'));
  check('status says fix the red box', /Fix the red box/.test(await page.textContent('#status')));
  await page.fill('#teams .row[data-team="1"] input', '121');
  check('121 flagged out of range', /between 50 and 120/.test(await page.textContent('#teams .row[data-team="1"] .err')));
  await page.fill('#teams .row[data-team="1"] input', '6a7');
  check('letters stripped from input', (await page.inputValue('#teams .row[data-team="1"] input')) === '67');
  check('valid value enables save', !(await page.isDisabled('#save')));
  check('save button shows count', (await page.textContent('#save')).trim() === 'Save 1');

  // ----- 3. Save only the changed fields -----
  await page.fill('#line-Notice', '  Prizes at the bar   at 3pm ');
  await page.fill('#teams .row[data-team="5"] input', '');   // clear team 5
  check('clearing a score is called out', /will be removed/.test(await page.textContent('#status')));
  check('row 5 says score will be removed', /Score will be removed on Save/.test(await page.textContent('#teams .row[data-team="5"] .meta')));
  check('save shows 3 changes', (await page.textContent('#save')).trim() === 'Save 3');
  await page.click('#save');
  await page.waitForFunction(() => /Saved \d/.test(document.getElementById('status').textContent));
  check('POST carried only the 3 changes', lastPost && Object.keys(lastPost.scores).join(',') === '1,5' && Object.keys(lastPost.lines).join(',') === 'Notice', JSON.stringify(lastPost));
  check('POST payload values', lastPost.scores['1'] === 67 && lastPost.scores['5'] === null && lastPost.lines.Notice === 'Prizes at the bar at 3pm', JSON.stringify(lastPost));
  check('POST carries the key', lastPost.k === KEY);
  check('sheet model updated', sheet.gross[1] === 67 && sheet.gross[5] === undefined && sheet.lines.Notice === 'Prizes at the bar at 3pm');
  check('3 log rows written', sheet.log.length === 3, JSON.stringify(sheet.log));
  check('status reports 3 changes written', /3 changes written/.test(await page.textContent('#status')), await page.textContent('#status'));
  check('save disabled again after save', await page.isDisabled('#save'));
  check('team 1 now shows net/rank from the sheet', /Net 67.*2nd/.test(await page.$eval('#teams .row[data-team="1"] .meta', e => e.textContent.replace(/\s+/g, ' '))));
  check('team 5 back to no score', /No score yet/.test(await page.textContent('#teams .row[data-team="5"] .meta')));
  check('notice textarea normalised from the sheet', (await page.inputValue('#line-Notice')) === 'Prizes at the bar at 3pm');
  check('no dirty rows after save', (await page.$$('.row.dirty, .field.dirty')).length === 0);
  await page.screenshot({ path: path.join(OUT, 'admin-2-saved.png'), fullPage: true });

  // ----- 4. Server rejects (validation on the API side) -----
  await page.fill('#teams .row[data-team="2"] input', '77');
  // Sabotage: make the API reject by pretending the client sent an unknown team.
  const saved = teamsBase.splice(1, 1);   // remove team 2 from the model → "Unknown team"
  await page.click('#save');
  await page.waitForSelector('#banner.error');
  teamsBase.splice(1, 0, saved[0]);
  check('server error shown, nothing saved', /Not saved/.test(await page.textContent('#banner')) && /Unknown team/.test(await page.textContent('#banner')));
  check('edit kept on the page after a rejected save', (await page.inputValue('#teams .row[data-team="2"] input')) === '77');
  check('save still enabled to retry', !(await page.isDisabled('#save')));
  check('sheet unchanged by rejected save', sheet.gross[2] === undefined);

  // ----- 5. Network down -----
  mode = 'down';
  await page.click('#save');
  await page.waitForSelector('#banner.error');
  check('network failure message', /Not saved/.test(await page.textContent('#banner')));
  mode = 'ok';
  await page.click('#save');
  await page.waitForFunction(() => /Saved \d/.test(document.getElementById('status').textContent));
  check('retry succeeds', sheet.gross[2] === 77);

  // ----- 6. Reload guard with unsaved edits -----
  await page.fill('#teams .row[data-team="4"] input', '80');
  await page.click('#reload');
  check('first reload tap warns instead of reloading', /unsaved changes/.test(await page.textContent('#status')));
  check('edit still there', (await page.inputValue('#teams .row[data-team="4"] input')) === '80');
  await page.click('#reload');
  await page.waitForFunction(() => /^Reloaded/.test(document.getElementById('status').textContent));
  check('second tap reloads and discards the edit', (await page.inputValue('#teams .row[data-team="4"] input')) === '');

  // ----- 7. Wrong key -----
  await page.goto(base + '?k=wrong', { waitUntil: 'networkidle' });
  await page.waitForSelector('#banner.error');
  check('wrong key: clear message', /link isn.t valid/i.test(await page.textContent('#banner')), await page.textContent('#banner'));
  check('wrong key: no team rows rendered', (await page.$$('#teams .row')).length === 0);
  await page.screenshot({ path: path.join(OUT, 'admin-3-badkey.png'), fullPage: true });

  // ----- 8. No key at all -----
  await page.goto(base, { waitUntil: 'networkidle' });
  check('no key: message, no API call', /needs the organizer link/.test(await page.textContent('#banner')));

  // ----- 9. API returns HTML (e.g. a Google sign-in page) -----
  mode = 'garbage';
  await page.goto(base + '?k=' + KEY, { waitUntil: 'networkidle' });
  await page.waitForSelector('#banner.error');
  check('non-JSON answer handled', /did not answer properly/.test(await page.textContent('#banner')));
  mode = 'ok';

  // ----- 10. Narrow phone -----
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(base + '?k=' + KEY, { waitUntil: 'networkidle' });
  await page.waitForSelector('#main:not([hidden])');
  check('no horizontal overflow at 360', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(OUT, 'admin-4-360.png'), fullPage: true });

  check('no console/page errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  srv.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
