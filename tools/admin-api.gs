/**
 * Cuntini Cup scoreboard — admin API (Google Apps Script web app).
 *
 * Serves the organizer's admin page (admin.html on the scoreboard site). The page shows every team with its
 * current gross score and the four text lines from the Details tab; one Save writes the changes straight into
 * the sheet. The scoreboard page keeps reading the sheet exactly as before.
 *
 *   GET  ?k=KEY                → current state (teams, scores, lines)            JSON
 *   POST body {k, scores, lines} → validate, write changed cells, log, return state  JSON
 *
 * HOW TO INSTALL (once):
 *   1. Open the scoreboard spreadsheet → Extensions → Apps Script → add this file (Files +, name it admin-api).
 *   2. Run `setupAdmin` once. Approve the permission prompt. The execution log prints the ADMIN KEY — keep it private.
 *   3. Deploy → New deployment → type "Web app" → Execute as: Me → Who has access: Anyone → Deploy.
 *      Copy the Web app URL (…/exec) into `API_URL` in admin.html.
 *   4. The organizer's link is  https://<site>/admin.html?k=<ADMIN KEY>
 *
 * After editing this file: Deploy → Manage deployments → pencil → Version: New → Deploy (the URL stays the same).
 *
 * WHAT setupAdmin DOES (one time, safe to re-run):
 *   - Generates the admin key (kept in Script Properties, never in the sheet).
 *   - Unlinks and closes the old Google Form and deletes its "Scores" tab (the form was the previous entry path).
 *   - Replaces the form-driven formulas in Leader Board!E and Details (Rules, Notice) with plain values.
 *   - Creates the "Log" tab: one row per change (when, what, old, new).
 *   - Clears the old form links from Details!D1:E3.
 */

const ADMIN = {
  spreadsheetId: '1kM2RLB_gEbbARUsajtyI7tCgVbE-PxPfxkyBo0oCwq8',
  leaderboardSheet: 'Leader Board',
  lbFirstRow: 6,
  lbLastRow: 15,
  lbCols: { team: 1, a: 2, b: 3, hcp: 4, gross: 5, net: 6, vsPar: 7, rank: 8, strokes: 9 },   // 1-based columns
  parCell: 'K2',
  detailsSheet: 'Details',
  editableLines: ['Format', 'Handicap', 'Rules', 'Notice'],   // Details column-A labels the admin page may change
  infoLines: ['Event', 'Date', 'Venue'],                      // shown on the admin page, not editable there
  logSheet: 'Log',
  oldResponsesSheet: 'Scores',
  oldFormId: '1RiGlKq39-c41x4aD8nAOJfQ8txpck6LOIP-J_a-9Dio',
  scoreMin: 50,
  scoreMax: 120,
  lineMaxLength: 300,
  keyProperty: 'ADMIN_KEY',
};

// ---------------------------------------------------------------- web app entry points

function doGet(e) {
  try {
    requireKey_(e && e.parameter && e.parameter.k);
    return json_(Object.assign({ ok: true }, readState_()));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e && e.postData && e.postData.contents || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Request was not valid JSON.' });
  }
  try {
    requireKey_(body.k);
    const result = applyChanges_(body.scores || {}, body.lines || {}, 'admin page');
    return json_(Object.assign({ ok: true, changed: result.changed, changes: result.changes }, readState_()));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------------------------------------------------------------- one-time setup / maintenance

function setupAdmin() {
  const ss = SpreadsheetApp.openById(ADMIN.spreadsheetId);
  const notes = [];

  // 1. Admin key (never written to the sheet).
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty(ADMIN.keyProperty);
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    props.setProperty(ADMIN.keyProperty, key);
    notes.push('Generated a new admin key.');
  } else {
    notes.push('Admin key already existed; kept it.');
  }

  // 2. Retire the old Google Form: unlink it from this sheet, close it, delete its responses tab.
  try {
    const form = FormApp.openById(ADMIN.oldFormId);
    try { form.removeDestination(); notes.push('Old form unlinked from the sheet.'); } catch (err) { notes.push('Old form was not linked (' + err.message + ').'); }
    form.setAcceptingResponses(false);
    form.setCustomClosedFormMessage('Score entry has moved to the organizer\'s admin page. Ask Willis for the link.');
    notes.push('Old form closed to responses.');
  } catch (err) {
    notes.push('Old form not found or not accessible (' + err.message + ') — skipped.');
  }
  const old = ss.getSheetByName(ADMIN.oldResponsesSheet);
  if (old) {
    if (old.getFormUrl()) throw new Error('The "' + ADMIN.oldResponsesSheet + '" tab is still linked to a form; unlink it (Form → Responses → ⋮ → Unlink) and re-run.');
    ss.deleteSheet(old);
    notes.push('Deleted the "' + ADMIN.oldResponsesSheet + '" tab.');
  }

  // 3. Leader Board gross column: plain values from now on (the formulas pointed at the deleted tab).
  const lb = sheet_(ss, ADMIN.leaderboardSheet);
  const grossRange = lb.getRange(ADMIN.lbFirstRow, ADMIN.lbCols.gross, ADMIN.lbLastRow - ADMIN.lbFirstRow + 1, 1);
  const grossValues = grossRange.getValues();
  const grossFormulas = grossRange.getFormulas();
  const keep = grossValues.map((r, i) => [grossFormulas[i][0] ? (typeof r[0] === 'number' ? r[0] : '') : r[0]]);
  grossRange.clearContent();
  grossRange.setValues(keep);
  grossRange.setNumberFormat('0');
  notes.push('Leader Board gross column is now plain values.');

  // 4. Details lines: replace formulas with their current text.
  const details = sheet_(ss, ADMIN.detailsSheet);
  ADMIN.editableLines.forEach(label => {
    const row = detailsRow_(details, label, true);
    const cell = details.getRange(row, 2);
    if (cell.getFormula()) {
      const text = String(cell.getDisplayValue());
      cell.clearContent();
      cell.setValue(text);
      notes.push('Details "' + label + '" is now plain text: "' + text + '".');
    }
  });

  // 5. Old form links out of the sheet (they were readable by anyone with the API key).
  details.getRange('D1:E3').clearContent();
  notes.push('Cleared Details!D1:E3.');

  // 6. Log tab.
  if (!ss.getSheetByName(ADMIN.logSheet)) {
    const log = ss.insertSheet(ADMIN.logSheet);
    log.getRange('A1:E1').setValues([['When', 'Change', 'Old', 'New', 'Via']]).setFontWeight('bold');
    log.setFrozenRows(1);
    log.setColumnWidth(1, 160); log.setColumnWidth(2, 200); log.setColumnWidth(3, 220); log.setColumnWidth(4, 220); log.setColumnWidth(5, 110);
    log.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
    notes.push('Created the "' + ADMIN.logSheet + '" tab.');
  }
  appendLog_(ss, 'setupAdmin run', '', '', 'script');
  SpreadsheetApp.flush();

  Logger.log('SETUP DONE\n' + notes.map(n => ' - ' + n).join('\n'));
  Logger.log('ADMIN KEY: ' + key + '   (organizer link = admin.html?k=' + key + ')');
  Logger.log('Next: Deploy → New deployment → Web app → Execute as Me → Anyone → Deploy, then paste the /exec URL into admin.html.');
  return key;
}

/** Prints the admin key again. */
function printAdminKey() {
  const key = PropertiesService.getScriptProperties().getProperty(ADMIN.keyProperty);
  Logger.log(key ? 'ADMIN KEY: ' + key : 'No admin key yet — run setupAdmin().');
}

/** Replaces the admin key (old organizer links stop working). */
function rotateAdminKey() {
  const key = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  PropertiesService.getScriptProperties().setProperty(ADMIN.keyProperty, key);
  appendLog_(SpreadsheetApp.openById(ADMIN.spreadsheetId), 'admin key rotated', '', '', 'script');
  Logger.log('NEW ADMIN KEY: ' + key);
}

/** Closes the retired Google Form to responses (setupAdmin tries this too; run it alone if that step failed). */
function closeOldForm() {
  const form = FormApp.openById(ADMIN.oldFormId);
  form.setAcceptingResponses(false);
  Logger.log('Old form is ' + (form.isAcceptingResponses() ? 'STILL OPEN' : 'closed') + ': ' + form.getPublishedUrl());
}

/** Runs the read path as a test. */
function testReadState() {
  Logger.log(JSON.stringify(readState_(), null, 2));
}

// ---------------------------------------------------------------- core

function readState_() {
  const ss = SpreadsheetApp.openById(ADMIN.spreadsheetId);
  const lb = sheet_(ss, ADMIN.leaderboardSheet);
  const c = ADMIN.lbCols;
  const n = ADMIN.lbLastRow - ADMIN.lbFirstRow + 1;
  const rows = lb.getRange(ADMIN.lbFirstRow, 1, n, c.strokes).getValues();
  const teams = rows
    .filter(r => r[c.team - 1] !== '' && r[c.team - 1] !== null)
    .map(r => ({
      team: Number(r[c.team - 1]),
      a: String(r[c.a - 1] || ''),
      b: String(r[c.b - 1] || ''),
      hcp: num_(r[c.hcp - 1]),
      strokes: num_(r[c.strokes - 1]),
      gross: num_(r[c.gross - 1]),
      net: num_(r[c.net - 1]),
      vsPar: num_(r[c.vsPar - 1]),
      rank: num_(r[c.rank - 1]),
    }));
  const par = num_(lb.getRange(ADMIN.parCell).getValue());

  const details = sheet_(ss, ADMIN.detailsSheet);
  const lines = {}, info = {};
  const kv = details.getRange(1, 1, Math.max(details.getLastRow(), 1), 2).getDisplayValues();
  kv.forEach(r => {
    const label = String(r[0]).trim();
    if (ADMIN.editableLines.indexOf(label) >= 0) lines[label] = String(r[1]);
    if (ADMIN.infoLines.indexOf(label) >= 0) info[label] = String(r[1]);
  });
  ADMIN.editableLines.forEach(l => { if (!(l in lines)) lines[l] = ''; });

  return { teams, par, lines, info, editable: ADMIN.editableLines, scoreMin: ADMIN.scoreMin, scoreMax: ADMIN.scoreMax,
           lineMaxLength: ADMIN.lineMaxLength, readAt: new Date().toISOString() };
}

/**
 * scores: { "3": 66, "7": null }   — team number → gross (null / "" clears the score)
 * lines:  { "Notice": "Prizes at 3pm", "Rules": "" }
 * Everything is validated before anything is written; an invalid request writes nothing.
 */
function applyChanges_(scores, lines, via) {
  const ss = SpreadsheetApp.openById(ADMIN.spreadsheetId);
  const lb = sheet_(ss, ADMIN.leaderboardSheet);
  const details = sheet_(ss, ADMIN.detailsSheet);
  const c = ADMIN.lbCols;

  // ---- validate scores
  const teamRows = {};
  const n = ADMIN.lbLastRow - ADMIN.lbFirstRow + 1;
  lb.getRange(ADMIN.lbFirstRow, c.team, n, 1).getValues().forEach((r, i) => {
    if (r[0] !== '' && r[0] !== null) teamRows[String(Number(r[0]))] = ADMIN.lbFirstRow + i;
  });
  const scoreWrites = [];
  Object.keys(scores).forEach(teamKey => {
    const row = teamRows[String(teamKey).trim()];
    if (!row) throw new Error('Unknown team "' + teamKey + '". Nothing was saved.');
    const raw = scores[teamKey];
    let value = '';
    if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
      const s = String(raw).trim();
      if (!/^\d{1,3}$/.test(s)) throw new Error('Team ' + teamKey + ': "' + s + '" is not a whole number. Nothing was saved.');
      value = Number(s);
      if (value < ADMIN.scoreMin || value > ADMIN.scoreMax) throw new Error('Team ' + teamKey + ': ' + value + ' is outside ' + ADMIN.scoreMin + '–' + ADMIN.scoreMax + '. Nothing was saved.');
    }
    scoreWrites.push({ team: teamKey, row, value });
  });

  // ---- validate lines
  const lineWrites = [];
  Object.keys(lines).forEach(label => {
    if (ADMIN.editableLines.indexOf(label) < 0) throw new Error('"' + label + '" cannot be changed from the admin page. Nothing was saved.');
    let text = lines[label];
    if (text === null || text === undefined) text = '';
    text = String(text).replace(/\s+/g, ' ').trim();
    if (text.length > ADMIN.lineMaxLength) throw new Error(label + ' is too long (max ' + ADMIN.lineMaxLength + ' characters). Nothing was saved.');
    lineWrites.push({ label, text });
  });

  // ---- write, under a lock so two saves can never interleave
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('The sheet is busy — please try again in a few seconds.');
  const changes = [];
  try {
    scoreWrites.forEach(w => {
      const cell = lb.getRange(w.row, c.gross);
      const oldRaw = cell.getValue();
      const oldVal = (oldRaw === '' || oldRaw === null) ? '' : Number(oldRaw);
      if (oldVal === w.value) return;
      cell.setValue(w.value);
      changes.push({ what: 'Team ' + w.team + ' gross', old: oldVal, new: w.value });
    });
    lineWrites.forEach(w => {
      const row = detailsRow_(details, w.label, true);
      const cell = details.getRange(row, 2);
      const oldText = String(cell.getDisplayValue());
      if (oldText === w.text) return;
      cell.setValue(w.text);
      changes.push({ what: w.label + ' line', old: oldText, new: w.text });
    });
    changes.forEach(ch => appendLog_(ss, ch.what, ch.old, ch.new, via));
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return { changed: changes.length, changes };
}

// ---------------------------------------------------------------- helpers

function requireKey_(k) {
  const key = PropertiesService.getScriptProperties().getProperty(ADMIN.keyProperty);
  if (!key) throw new Error('The admin API is not set up yet (run setupAdmin).');
  if (!k || String(k) !== key) throw new Error('This link is not valid. Ask Willis for the organizer link.');
}

function sheet_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" not found.');
  return sh;
}

function detailsRow_(details, label, createIfMissing) {
  const labels = details.getRange('A1:A50').getValues().map(r => String(r[0]).trim());
  let row = labels.indexOf(label) + 1;
  if (row === 0) {
    if (!createIfMissing) throw new Error('Details row "' + label + '" not found.');
    row = labels.filter(Boolean).length + 1;
    details.getRange(row, 1).setValue(label);
  }
  return row;
}

function appendLog_(ss, what, oldVal, newVal, via) {
  let log = ss.getSheetByName(ADMIN.logSheet);
  if (!log) {
    log = ss.insertSheet(ADMIN.logSheet);
    log.getRange('A1:E1').setValues([['When', 'Change', 'Old', 'New', 'Via']]).setFontWeight('bold');
    log.setFrozenRows(1);
  }
  log.appendRow([new Date(), what, oldVal === '' ? '(blank)' : oldVal, newVal === '' ? '(blank)' : newVal, via]);
}

function num_(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
