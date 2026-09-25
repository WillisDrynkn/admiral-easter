// Fixture-driven tests for index.html. Intercepts the Sheets API and asserts rendered output.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SITE_DIR = path.resolve(__dirname, '..');
const OUT = path.resolve(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

// ---------- fixtures (shape = Sheets API values:batchGet with FORMATTED_VALUE => strings) ----------
const banner = (title) => [["🐰  THE ADMIRAL EASTER INVITATIONAL  🐰"], [title], ["El Camaleón at Mayakoba  •  April 4, 2026"], []];

const players = [
  ["1","Juan Manuel Rouges","1","10","1"],["2","Amir Guezaiel","1","28","2"],["3","D'urso","2","12","1"],["4","Michael Bukaty","2","28","2"],
  ["5","Ryan Vrba","3","13","1"],["6","El Tony","3","28","2"],["7","Mackenzie Dobbs","4","13","1"],["8","Peter Pacheco","4","28","2"],
  ["9","Igor Przhegalinskii","5","15","1"],["10","Heath Admiral","5","28","2"],["11","Mike Kuzma","6","15","1"],["12","Chris Bernard","6","28","2"],
  ["13","Vicente Posadas","7","15","1"],["14","Richard Bounds","7","28","2"],["15","Ronald Nazon","8","15","1"],["16","Chris McKenzie","8","25","2"],
  ["17","William McIlroy","9","15","1"],["18","Karl Rourke","9","24","2"],["19","Marc Fuentes","10","15","1"],["20","Darren Davis","10","18","2"],
];
const teams = [
  ["1","Juan Manuel Rouges","10","Amir Guezaiel","28","3.5","4.2","8","7.7","0"],
  ["2","D'urso","12","Michael Bukaty","28","4.2","4.2","8","8.4","0"],
  ["3","Ryan Vrba","13","El Tony","28","4.55","4.2","9","8.75","1"],
  ["4","Mackenzie Dobbs","13","Peter Pacheco","28","4.55","4.2","9","8.75","1"],
  ["5","Igor Przhegalinskii","15","Heath Admiral","28","5.25","4.2","9","9.45","1"],
  ["6","Mike Kuzma","15","Chris Bernard","28","5.25","4.2","9","9.45","1"],
  ["7","Vicente Posadas","15","Richard Bounds","28","5.25","4.2","9","9.45","1"],
  ["8","Ronald Nazon","15","Chris McKenzie","25","5.25","3.75","9","9","1"],
  ["9","William McIlroy","15","Karl Rourke","24","5.25","3.6","9","8.85","1"],
  ["10","Marc Fuentes","15","Darren Davis","18","5.25","2.7","8","7.95","0"],
];
// Mirror the sheet's number formats exactly (F, G, I are formatted 0.00 => '3.50', '4.20', '9.00')
teams.forEach(t => [5, 6, 8].forEach(i => { t[i] = Number(t[i]).toFixed(2); }));

const teamsTab = (rows) => [
  ["🐰  THE ADMIRAL EASTER INVITATIONAL  🐰"], ["⛳  TEAM SETUP  ⛳"], ["El Camaleón at Mayakoba  •  April 4, 2026"],
  ["","","","","Hcp Adjustment:","35%","15%","","Base Hcp:","8"],
  ["Team","Player A","Hcp A","Player B","Hcp B","Low × 35%","High × 15%","Team Hcp","Raw","Strokes"],
  ...rows,
];
const playersTab = (rows) => [...banner("⛳  PLAYER ENTRY  ⛳"), ["#","Player Name","Cart / Team #","Handicap","Player 1 or 2"], ...rows];
const lbTab = (rows) => [
  ["🐰  THE ADMIRAL EASTER INVITATIONAL  🐰"],
  ["⛳  LEADERBOARD  ⛳","","","","","","","","","Course Par","72"],
  ["El Camaleón at Mayakoba  •  April 4, 2026  •  2-Man Scramble  •  35% / 15%"], [],
  ["Team","Player A","Player B","Team Hcp","Gross Score","Net Score","vs Par","Rank","Strokes"],
  ...rows,
];
// Leader Board rows: [team, A, B, teamHcp, gross, net, vsPar, rank, strokes]
const lbNoScores = teams.map(t => [t[0], t[1], t[3], t[7], "", "", "", "", t[9]]);
// Scores: T3 66-1=65, T5 66-1=65 (tie for 1st), T1 67-0=67 (3rd), T9 68-1=67 => tie 3rd, T2 70-0=70 (5th), T10 70 (5th), others unscored
const withScores = { 3: 66, 5: 66, 1: 67, 9: 68, 2: 70, 10: 70 };
function lbScored() {
  const nets = {};
  teams.forEach(t => { const g = withScores[+t[0]]; if (g != null) nets[t[0]] = g - (+t[9]); });
  const sortedNets = Object.values(nets).sort((a, b) => a - b);
  return teams.map(t => {
    const g = withScores[+t[0]];
    if (g == null) return [t[0], t[1], t[3], t[7], "", "", "", "", t[9]];
    const net = g - (+t[9]);
    const rank = sortedNets.indexOf(net) + 1; // RANK semantics: ties share the lowest position
    return [t[0], t[1], t[3], t[7], String(g), String(net), String(net - 72), String(rank), t[9]];
  });
}
const detailsBase = [["Format","2-Man Scramble"],["Handicap","35% low + 15% high (USGA scramble). Strokes off the low team."],["Rules","No gimmies / Play the ball as it lies"],["Notice"]];
const detailsFull = [
  ["Event","The Admiral Autumn Invitational"],["Date","Saturday 7 November 2026"],["Venue","El Camaleón at Mayakoba"],
  ...detailsBase.slice(0, 3), ["Notice","Prizes at the bar at 3pm — bring your card"],
];
const api = (p, t, l, d) => ({ spreadsheetId: "x", valueRanges: [
  { range: "Players!A1:Z1000", majorDimension: "ROWS", values: p },
  { range: "Teams!A1:Z1000", majorDimension: "ROWS", values: t },
  { range: "'Leader Board'!A1:Z1000", majorDimension: "ROWS", values: l },
  { range: "Details!A1:Z1000", majorDimension: "ROWS", values: d },
]});

const FIX = {
  noScores: api(playersTab(players), teamsTab(teams), lbTab(lbNoScores), detailsBase),
  scored: api(playersTab(players), teamsTab(teams), lbTab(lbScored()), detailsFull),
  // ragged: trailing empties dropped the way the API does it, plus a blank row and a row with only a number
  ragged: api(playersTab([...players, [], ["21"]]), teamsTab([...teams.map(t => t.slice(0, 8)), ["11"]]), lbTab(lbNoScores.map(r => [r[0], r[1], r[2], r[3]])), [["Format","2-Man Scramble"],["Notice",""],[],["Rules"]]),
};

// ---------- tiny static server ----------
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, r) => {
      const f = path.join(SITE_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
      if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(fs.readFileSync(f));
    }).listen(0, () => res(srv));
  });
}

let failures = 0;
function check(name, ok, extra = '') { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`); if (!ok) failures++; }

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && mode !== 'apiError' && mode !== 'netFail') consoleErrors.push('[' + mode + '] ' + m.text()); });

  let mode = 'noScores';
  await page.route('**/sheets.googleapis.com/**', route => {
    if (mode === 'apiError') return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 403, message: 'Requests from referer are blocked.' } }) });
    if (mode === 'netFail') return route.abort('failed');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIX[mode]) });
  });

  // ----- 1. No scores yet -----
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('#leaderboard-table', { state: 'visible' });
  check('no-scores message visible', await page.isVisible('#no-scores-msg'));
  check('10 leaderboard rows', (await page.$$('#leaderboard-body tr')).length === 10);
  check('all rows unscored', (await page.$$('#leaderboard-body tr.unscored')).length === 10);
  const strokesCol = await page.$$eval('#leaderboard-body tr td:nth-child(3)', tds => tds.map(t => t.textContent.trim()));
  check('strokes column = 0,0,1,1,1,1,1,1,1,0', strokesCol.join(',') === '0,0,1,1,1,1,1,1,1,0', strokesCol.join(','));
  check('notice hidden when blank', !(await page.isVisible('#notice')));
  check('header falls back to default name', (await page.textContent('#event-name')).trim() === 'The Cunti Cup');
  const gridLabels = await page.$$eval('#details-grid .label', ls => ls.map(l => l.textContent.trim()));
  check('details grid shows Format/Handicap/Rules only', gridLabels.join('|') === 'Format|Handicap|Rules', gridLabels.join('|'));
  check('kicker from Format row', (await page.textContent('#event-kicker')).trim() === '2-Man Scramble');
  check('live bar shows Updated', /^Updated /.test((await page.textContent('#lastUpdate')).trim()));
  await page.screenshot({ path: path.join(OUT, '1-leaderboard-noscores.png'), fullPage: true });

  // Teams / Players / Strokes tabs
  await page.click('button[data-tab="teams"]');
  check('teams: 10 rows', (await page.$$('#teams-body tr')).length === 10);
  const t3 = await page.$eval('#teams-body tr:nth-child(3)', tr => tr.innerText.replace(/\s+/g, ' ').trim());
  check('teams row 3 content', /3 Ryan Vrba \(13\) El Tony \(28\) 9 1/.test(t3), t3);
  await page.screenshot({ path: path.join(OUT, '2-teams.png'), fullPage: true });
  await page.click('button[data-tab="players"]');
  check('players: 20 rows', (await page.$$('#players-body tr')).length === 20);
  await page.screenshot({ path: path.join(OUT, '3-players.png'), fullPage: true });
  await page.click('button[data-tab="strokes"]');
  check('strokes: 10 cards', (await page.$$('#calc-list .calc')).length === 10);
  const rule = (await page.textContent('#rule-text')).replace(/\s+/g, ' ');
  check('rule mentions 35% / 15% / base 8 / par 72', /35% of the lower/.test(rule) && /15% of the higher/.test(rule) && /\(8\)/.test(rule) && /par 72/.test(rule), rule);
  const c3 = await page.$eval('#calc-list .calc:nth-child(3)', el => el.innerText.replace(/\s+/g, ' ').trim());
  check('team 3 working: 13 × 35% = 4.55, 28 × 15% = 4.2, 4.55 + 4.2 = 8.75 → 9, 9 − 8 = 1 stroke', /13 × 35% = 4\.55/.test(c3) && /28 × 15% = 4\.2\b/.test(c3) && /4\.55 \+ 4\.2 = 8\.75 → rounds to 9/.test(c3) && /9 − 8 = 1 stroke$/.test(c3), c3);
  const c1 = await page.$eval('#calc-list .calc:nth-child(1)', el => el.innerText.replace(/\s+/g, ' ').trim());
  check('team 1 working: 10 × 35% = 3.5, 3.5 + 4.2 = 7.7 → 8, 8 − 8 = 0 strokes', /10 × 35% = 3\.5\b/.test(c1) && /3\.5 \+ 4\.2 = 7\.7 → rounds to 8/.test(c1) && /8 − 8 = 0 strokes$/.test(c1), c1);
  check('rule text has exactly 3 paragraphs, none empty', await page.$$eval('#rule-text p', ps => ps.length === 3 && ps.every(p => p.textContent.trim().length > 0)));
  await page.screenshot({ path: path.join(OUT, '4-strokes.png'), fullPage: true });

  // ----- 2. Scores + ties + notice + event rows -----
  mode = 'scored';
  await page.click('button[data-tab="leaderboard"]');
  await page.evaluate(() => fetchData());
  await page.waitForFunction(() => document.querySelectorAll('#leaderboard-body tr.unscored').length === 4);
  check('no-scores message hidden', !(await page.isVisible('#no-scores-msg')));
  const rows = await page.$$eval('#leaderboard-body tr', trs => trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText.replace(/\s+/g, ' ').trim())));
  const summary = rows.map(r => `${r[0]}|${r[1].split(' ')[0]}|${r[2]}|${r[3]}|${r[4]}|${r[5]}`).join('\n');
  const expectedTop = ['T1|Ryan|1|66|65|−7', 'T1|Igor|1|66|65|−7', 'T3|Juan|0|67|67|−5', 'T3|William|1|68|67|−5', 'T5|D\'urso|0|70|70|−2', 'T5|Marc|0|70|70|−2'];
  check('order + ties + net + vs par', summary.split('\n').slice(0, 6).join('\n') === expectedTop.join('\n'), '\n' + summary);
  check('leader rows = 2 (tied leaders)', (await page.$$('#leaderboard-body tr.leader')).length === 2);
  check('unscored rows last and in team order', rows.slice(6).map(r => r[1].split(' ')[0]).join(',') === 'Mackenzie,Mike,Vicente,Ronald', rows.slice(6).map(r => r[1]).join(','));
  check('notice visible with text', await page.isVisible('#notice') && /Prizes at the bar/.test(await page.textContent('#notice-text')));
  check('event name/date/venue from Details', (await page.textContent('#event-name')).trim() === 'The Admiral Autumn Invitational' && /El Camaleón at Mayakoba/.test(await page.textContent('#event-sub')) && /7 November 2026/.test(await page.textContent('#event-sub')));
  check('document.title follows event', await page.title() === 'The Admiral Autumn Invitational');
  const gridLabels2 = await page.$$eval('#details-grid .label', ls => ls.map(l => l.textContent.trim()));
  check('reserved keys excluded from grid', gridLabels2.join('|') === 'Format|Handicap|Rules', gridLabels2.join('|'));
  await page.screenshot({ path: path.join(OUT, '5-leaderboard-scored.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 780 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check('no horizontal overflow at 360px', !overflow);
  await page.screenshot({ path: path.join(OUT, '6-leaderboard-360.png'), fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });

  // ----- 3. API error after good data: keep last data, show warning -----
  mode = 'apiError';
  await page.evaluate(() => fetchData());
  await page.waitForFunction(() => document.getElementById('fetch-fail').classList.contains('show'));
  check('error: last scores still shown', (await page.$$('#leaderboard-body tr')).length === 10 && (await page.$$('#leaderboard-body tr.leader')).length === 2);
  check('error: live bar in error state', await page.$eval('#refresh-bar', el => el.classList.contains('error')) && /retrying/.test(await page.textContent('#lastUpdate')));
  await page.screenshot({ path: path.join(OUT, '7-api-error.png'), fullPage: false });

  // ----- 4. Network failure, then recovery -----
  mode = 'netFail';
  await page.evaluate(() => fetchData());
  await page.waitForTimeout(300);
  check('netfail: still error state', await page.$eval('#refresh-bar', el => el.classList.contains('error')));
  mode = 'scored';
  await page.evaluate(() => fetchData());
  await page.waitForFunction(() => !document.getElementById('fetch-fail').classList.contains('show'));
  check('recovery clears error', !(await page.$eval('#refresh-bar', el => el.classList.contains('error'))));

  // ----- 5. Ragged data never throws -----
  mode = 'ragged';
  await page.evaluate(() => fetchData());
  await page.waitForTimeout(300);
  check('ragged: 10 leaderboard rows, no crash', (await page.$$('#leaderboard-body tr')).length === 10);
  check('ragged: strokes show dash when missing', (await page.$$eval('#leaderboard-body tr td:nth-child(3)', tds => tds.map(t => t.textContent.trim()))).every(v => v === '–'));
  check('ragged: teams 10 rows (row "11" without name dropped)', (await page.$$('#teams-body tr')).length === 10);
  check('ragged: players 20 rows', (await page.$$('#players-body tr')).length === 20);
  check('ragged: strokes cards show waiting text', (await page.$$eval('#calc-list .calc .math', ms => ms.map(m => m.textContent.trim()))).every(t => /Waiting for both handicaps/.test(t)));
  check('ragged: notice hidden, grid has Format only', !(await page.isVisible('#notice')) && (await page.$$eval('#details-grid .label', ls => ls.map(l => l.textContent.trim()))).join('|') === 'Format');

  // ----- 6. First load failing entirely -----
  const page2 = await ctx.newPage();
  await page2.route('**/sheets.googleapis.com/**', route => route.abort('failed'));
  await page2.goto(base, { waitUntil: 'networkidle' });
  await page2.waitForFunction(() => document.getElementById('fetch-fail').classList.contains('show'));
  check('first-load failure shows clear message, spinners hidden', /Couldn't load the scoreboard/.test(await page2.textContent('#fetch-fail')) && !(await page2.isVisible('#leaderboard-loading')));
  await page2.screenshot({ path: path.join(OUT, '8-first-load-fail.png'), fullPage: false });

  // ----- 7. XSS-safety of sheet strings -----
  const page3 = await ctx.newPage();
  const evil = JSON.parse(JSON.stringify(FIX.noScores));
  evil.valueRanges[2].values[5][1] = '<img src=x onerror="window.__pwned=1">';
  evil.valueRanges[3].values.push(['Notice', '<b>bold</b> & <script>window.__pwned=2</script>']);
  await page3.route('**/sheets.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(evil) }));
  await page3.goto(base, { waitUntil: 'networkidle' });
  await page3.waitForSelector('#leaderboard-table', { state: 'visible' });
  await page3.waitForTimeout(200);
  check('sheet strings are escaped (no script execution)', (await page3.evaluate(() => window.__pwned)) === undefined && (await page3.$$('#leaderboard-body img')).length === 0);
  check('notice renders tags as text', /<b>bold<\/b>/.test(await page3.textContent('#notice-text')));

  check('no console/page errors outside the deliberate-failure scenarios', consoleErrors.length === 0, consoleErrors.join(' | '));

  await browser.close(); srv.close();
  console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'}  — screenshots in ${OUT}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
