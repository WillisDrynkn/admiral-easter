/**
 * Cuntini Cup scoreboard — one-time builder for the organizer's score-entry Google Form.
 *
 * HOW TO RUN (once):
 *   1. Open the scoreboard spreadsheet → Extensions → Apps Script.
 *   2. Replace the editor contents with this file. Save.
 *   3. Choose the function `buildScoreForm` in the toolbar and click Run. Approve the permission prompt.
 *   4. The execution log prints the form links. They are also written to the Details tab, cells D1:E3.
 *
 * WHAT IT DOES:
 *   - Creates a Google Form with a first question "What are you entering?" → Score or Notice.
 *       Score:  Team (dropdown built from the Teams tab) + Gross score (whole number 50–120). Both required.
 *       Notice: one required text box. Shown at the top of the scoreboard page. Latest wins; "-" clears it.
 *       Rules:  one required text box. Replaces the "Rules" line in the details box. Latest wins; "-" clears it.
 *   - No sign-in, no email collection, unlimited submissions, confirmation message with a "submit another" link.
 *   - Links responses into THIS spreadsheet, in a tab renamed "Scores".
 *   - Writes the Leader Board "Gross Score" formulas (latest submission per team wins) and the Details "Notice" and "Rules" formulas.
 *
 * SAFE TO RE-RUN?  No — it refuses if a form is already linked. Use refreshTeamDropdown() if team names change,
 * or printFormLinks() to see the links again.
 */

const CONFIG = {
  formTitle: 'Cuntini Cup — Score Entry',
  formDescription: 'Enter a team\'s gross score, or post a notice to the board. ' +
                   'To correct a score, just submit that team again — the latest entry wins.',
  teamsSheet: 'Teams',
  teamsFirstRow: 6,
  teamsLastRow: 15,
  leaderboardSheet: 'Leader Board',
  leaderboardFirstRow: 6,
  leaderboardLastRow: 15,
  leaderboardGrossCol: 'E',
  leaderboardTeamCol: 'A',
  detailsSheet: 'Details',
  detailsNoticeLabel: 'Notice',
  detailsRulesLabel: 'Rules',
  responsesSheetName: 'Scores',
  typeQuestion: 'What are you entering?',
  typeScore: 'A team score',
  typeNotice: 'A notice for the board',
  typeRules: 'The rules line',
  teamQuestion: 'Team',
  grossQuestion: 'Gross score (18 holes)',
  noticeQuestion: 'Notice',
  rulesQuestion: 'Rules',
  scorePattern: '^(5[0-9]|[6-9][0-9]|1[01][0-9]|120)$',   // whole numbers 50–120
  scoreHelp: 'Whole number between 50 and 120, e.g. 68',
  confirmation: 'Saved. The leaderboard updates within 20 seconds.',
};

function buildScoreForm() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Refuse to build twice.
  const already = ss.getSheets().filter(s => s.getFormUrl());
  if (already.length) {
    throw new Error('A form is already linked to this spreadsheet (tab "' + already[0].getName() + '"). ' +
                    'Nothing was changed. Use printFormLinks() or refreshTeamDropdown().');
  }

  const teams = readTeams_(ss);
  if (!teams.length) throw new Error('No teams found on "' + CONFIG.teamsSheet + '" rows ' +
                                     CONFIG.teamsFirstRow + '–' + CONFIG.teamsLastRow + '. Nothing was changed.');

  // ---- Create the form ----
  const form = FormApp.create(CONFIG.formTitle);
  form.setTitle(CONFIG.formTitle)
      .setDescription(CONFIG.formDescription)
      .setCollectEmail(false)
      .setLimitOneResponsePerUser(false)
      .setAllowResponseEdits(false)
      .setShowLinkToRespondAgain(true)
      .setProgressBar(false)
      .setConfirmationMessage(CONFIG.confirmation);
  try { form.setRequireLogin(false); } catch (e) { /* consumer accounts: not applicable */ }

  // Page 1: what are you entering?
  const typeItem = form.addMultipleChoiceItem().setTitle(CONFIG.typeQuestion).setRequired(true);

  // Page 2: score
  const scorePage = form.addPageBreakItem().setTitle('Team score');
  form.addListItem().setTitle(CONFIG.teamQuestion).setRequired(true)
      .setChoiceValues(teams.map(t => t.label));
  const gross = form.addTextItem().setTitle(CONFIG.grossQuestion).setRequired(true)
      .setHelpText(CONFIG.scoreHelp);
  gross.setValidation(FormApp.createTextValidation()
      .setHelpText(CONFIG.scoreHelp)
      .requireTextMatchesPattern(CONFIG.scorePattern)
      .build());
  scorePage.setGoToPage(FormApp.PageNavigationType.SUBMIT);

  // Page 3: notice
  const noticePage = form.addPageBreakItem().setTitle('Notice for the board');
  form.addParagraphTextItem().setTitle(CONFIG.noticeQuestion).setRequired(true)
      .setHelpText('Shown at the top of the scoreboard page. The latest notice replaces the previous one. Enter a single dash (-) to clear it.');
  noticePage.setGoToPage(FormApp.PageNavigationType.SUBMIT);

  // Page 4: rules line
  const rulesPage = form.addPageBreakItem().setTitle('Rules line');
  form.addParagraphTextItem().setTitle(CONFIG.rulesQuestion).setRequired(true)
      .setHelpText('Replaces the "Rules" line in the details box on the scoreboard page. Enter a single dash (-) to remove the line.');
  rulesPage.setGoToPage(FormApp.PageNavigationType.SUBMIT);

  // Branching from page 1
  typeItem.setChoices([
    typeItem.createChoice(CONFIG.typeScore, scorePage),
    typeItem.createChoice(CONFIG.typeNotice, noticePage),
    typeItem.createChoice(CONFIG.typeRules, rulesPage),
  ]);

  // Accept responses / publish (newer Forms have an explicit published flag)
  form.setAcceptingResponses(true);
  try { if (typeof form.setPublished === 'function') form.setPublished(true); } catch (e) {}

  // ---- Link responses into this spreadsheet ----
  const before = ss.getSheets().map(s => s.getSheetId());
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  const responses = waitForResponsesSheet_(ss, before);
  responses.setName(CONFIG.responsesSheetName);
  const headers = waitForHeaders_(responses);

  const col = name => {
    const i = headers.indexOf(name);
    if (i < 0) throw new Error('Column "' + name + '" not found in the responses tab. Headers: ' + headers.join(' | '));
    return columnLetter_(i + 1);
  };
  const teamCol = col(CONFIG.teamQuestion), grossCol = col(CONFIG.grossQuestion),
        noticeCol = col(CONFIG.noticeQuestion), rulesCol = col(CONFIG.rulesQuestion);

  // ---- Wire the Leader Board: latest submitted gross per team ----
  const lb = ss.getSheetByName(CONFIG.leaderboardSheet);
  if (!lb) throw new Error('Sheet "' + CONFIG.leaderboardSheet + '" not found.');
  const R = CONFIG.responsesSheetName;
  const grossFormulas = [];
  for (let r = CONFIG.leaderboardFirstRow; r <= CONFIG.leaderboardLastRow; r++) {
    const team = '$' + CONFIG.leaderboardTeamCol + r;
    // Whole-column references on purpose: Google Forms INSERTS response rows, which would push a $C$2:$C
    // reference down to $C$3:$C and silently drop new submissions. Column references never shift; the
    // ROW()>1 test keeps the header row out.
    grossFormulas.push(['=IFERROR(VALUE(ARRAYFORMULA(LOOKUP(2,1/((ROW(' + R + '!$' + teamCol + ':$' + teamCol + ')>1)*(IFERROR(VALUE(REGEXEXTRACT(' + R + '!$' + teamCol + ':$' + teamCol + ',"^\\d+")),0)=' + team + ')*(' + R + '!$' + grossCol + ':$' + grossCol + '<>"")),' + R + '!$' + grossCol + ':$' + grossCol + '))),"")']);
  }
  lb.getRange(CONFIG.leaderboardGrossCol + CONFIG.leaderboardFirstRow + ':' + CONFIG.leaderboardGrossCol + CONFIG.leaderboardLastRow)
    .setFormulas(grossFormulas);

  // ---- Wire the Details rows: latest non-blank submission wins, "-" clears. Rules keeps its current text as the default. ----
  const details = ss.getSheetByName(CONFIG.detailsSheet);
  if (!details) throw new Error('Sheet "' + CONFIG.detailsSheet + '" not found.');
  const latestFormula = (column, fallback) =>
    '=IFERROR(REGEXREPLACE(TO_TEXT(ARRAYFORMULA(LOOKUP(2,1/((ROW(' + R + '!$' + column + ':$' + column + ')>1)*(TRIM(' + R + '!$' + column + ':$' + column + ')<>"")),' +
    R + '!$' + column + ':$' + column + '))),"^\\s*-\\s*$",""),"' + String(fallback).replace(/"/g, '""') + '")';
  const detailsRow = label => {
    const labels = details.getRange('A1:A50').getValues().map(r => String(r[0]).trim());
    let row = labels.indexOf(label) + 1;
    if (row === 0) { row = labels.filter(Boolean).length + 1; details.getRange('A' + row).setValue(label); }
    return row;
  };
  const noticeRow = detailsRow(CONFIG.detailsNoticeLabel);
  details.getRange('B' + noticeRow).setFormula(latestFormula(noticeCol, ''));
  const rulesRow = detailsRow(CONFIG.detailsRulesLabel);
  const currentRules = details.getRange('B' + rulesRow).getFormula() ? '' : String(details.getRange('B' + rulesRow).getValue());
  details.getRange('B' + rulesRow).setFormula(latestFormula(rulesCol, currentRules));

  // ---- Links ----
  const longUrl = form.getPublishedUrl();
  let shortUrl = longUrl;
  try { shortUrl = form.shortenFormUrl(longUrl); } catch (e) {}
  details.getRange('D1:E3').setValues([
    ['Score entry form (organizer only — do not post publicly)', shortUrl],
    ['Score entry form (long link)', longUrl],
    ['Edit the form', form.getEditUrl()],
  ]);

  Logger.log('FORM READY');
  Logger.log('Organizer link (short): ' + shortUrl);
  Logger.log('Organizer link (long):  ' + longUrl);
  Logger.log('Edit link:              ' + form.getEditUrl());
  Logger.log('Responses tab:          ' + CONFIG.responsesSheetName + ' (columns: ' + headers.join(' | ') + ')');
  return shortUrl;
}

/** Re-reads the Teams tab and replaces the Team dropdown choices (use after any roster change). */
function refreshTeamDropdown() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const form = openLinkedForm_(ss);
  const teams = readTeams_(ss);
  if (!teams.length) throw new Error('No teams found. Nothing was changed.');
  const items = form.getItems(FormApp.ItemType.LIST).filter(i => i.getTitle() === CONFIG.teamQuestion);
  if (!items.length) throw new Error('Team dropdown not found in the form.');
  items[0].asListItem().setChoiceValues(teams.map(t => t.label));
  Logger.log('Team dropdown updated: ' + teams.map(t => t.label).join(' ; '));
}

/** Prints the form links to the log again. */
function printFormLinks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const form = openLinkedForm_(ss);
  Logger.log('Organizer link: ' + form.getPublishedUrl());
  Logger.log('Edit link:      ' + form.getEditUrl());
}

// ---------------- helpers ----------------

function readTeams_(ss) {
  const sh = ss.getSheetByName(CONFIG.teamsSheet);
  if (!sh) throw new Error('Sheet "' + CONFIG.teamsSheet + '" not found.');
  const rows = sh.getRange('A' + CONFIG.teamsFirstRow + ':D' + CONFIG.teamsLastRow).getValues();
  return rows
    .filter(r => r[0] !== '' && String(r[1]).trim() !== '' && String(r[3]).trim() !== '')
    .map(r => ({ team: Number(r[0]), label: r[0] + ' — ' + String(r[1]).trim() + ' & ' + String(r[3]).trim() }));
}

function openLinkedForm_(ss) {
  const linked = ss.getSheets().filter(s => s.getFormUrl());
  if (!linked.length) throw new Error('No form is linked to this spreadsheet yet. Run buildScoreForm() first.');
  return FormApp.openByUrl(linked[0].getFormUrl());
}

function waitForResponsesSheet_(ss, beforeIds) {
  for (let i = 0; i < 15; i++) {
    const live = SpreadsheetApp.openById(ss.getId());   // re-open to defeat any cached sheet list
    const fresh = live.getSheets().filter(s => beforeIds.indexOf(s.getSheetId()) < 0 && s.getFormUrl());
    if (fresh.length) return fresh[0];
    Utilities.sleep(1000);
    SpreadsheetApp.flush();
  }
  throw new Error('The responses tab did not appear after linking. Open the form → Responses → Link to Sheets, then run printFormLinks().');
}

function waitForHeaders_(sheet) {
  for (let i = 0; i < 15; i++) {
    const lastCol = sheet.getLastColumn();
    if (lastCol >= 2) {
      const h = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v).trim());
      if (h.filter(Boolean).length >= 2) return h;
    }
    Utilities.sleep(1000);
    SpreadsheetApp.flush();
  }
  throw new Error('The responses tab has no header row yet. Submit one test response, then re-run the wiring by hand.');
}

function columnLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
