# Scoreboard 2026 update — design

_Agreed with Willis, 25 Sep 2026. This is the brief the work was built from._

## What exists

- **Google Sheet** `1kM2RLB_gEbbARUsajtyI7tCgVbE-PxPfxkyBo0oCwq8`, four tabs the page reads: `Players`, `Teams`, `Leader Board`, `Details`.
  - `Players` is the only tab anyone types into (row 6 down): `#`, name, team #, handicap, player 1 or 2.
  - `Teams` is formula-driven from `Players` (lookups by team # / player slot) and computes the team handicap.
  - `Leader Board` pulls names and handicap from `Teams`; Gross is the input; Net, vs Par, Rank are formulas.
  - `Details` is a key/value list rendered on the page.
- **Page** `index.html`, hosted on GitHub Pages, reads the four tabs through the Sheets API every 20 s. Data rows start at index 5 (row 6); columns are positional.

## Decisions

| Topic | Decision |
|---|---|
| Handicap allowance | 35% of the lower handicap + 15% of the higher (USGA 2-man scramble). Percentages live in `Teams!F4:G4`. |
| Rounding | Nearest whole number, .5 up. `ROUND(ROUND(x,3),0)` so float noise (e.g. 7.4999…) can never round the wrong way. |
| Strokes | Team handicap − lowest team handicap (`Teams!J4`, a `MIN` formula you can hard-code if a team withdraws). |
| Net | Gross − Strokes. Ranking is identical to Gross − full Team Hcp; only the displayed number differs. |
| Ties | Shared rank, shown as T1 / T3 on the page. No automatic countback. |
| Score entry | ~~One Google Form~~ **Superseded the same evening:** an admin page (`admin.html?k=KEY`) showing every team with its current score and the four board lines, one Save. Willis: the organizer will not open and close a form ten times; he needs one screen he can come back to. |
| Corrections | Change the number on the admin page and Save; clear the box to remove a score. Every change is one row in the `Log` tab (when, what, old, new). Typing a number over `Leader Board!E` is the emergency override; the admin page shows it on its next load. |
| Notice | The Notice line shows as a banner on the page. Empty it on the admin page to take it down. |
| Lines editable from the admin page | Format, Handicap (the wording only — the percentages stay in `Teams!F4:G4`), Rules, Notice. Event / Date / Venue stay in the sheet. |
| Page identity | Event / Date / Venue / Format come from `Details` rows (no redeploy to change them). Hero images are repo files under `assets/`. |
| Access to the admin page | A 12-character random key in the link, checked by the Apps Script on every request. Kept in Script Properties only — never in the repo, never in the sheet (the sheet is readable by anyone holding the public API key in `index.html`). `rotateAdminKey()` invalidates a leaked link. |

## Sheet layout (after this update)

**Teams** row 4: `E4` label, `F4` = 35%, `G4` = 15%, `I4` label, `J4` = `MIN(H6:H15)` (base). Row 5 headers. Rows 6–15:

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| Team | Player A | Hcp A | Player B | Hcp B | Low × 35% | High × 15% | Team Hcp | Raw | Strokes |

**Leader Board** rows 6–15: `A` Team, `B`/`C` names, `D` Team Hcp, `E` Gross (plain value, written by the admin API), `F` Net = E − I, `G` vs Par = F − `K2`, `H` Rank, `I` Strokes.

**Details**: `Format`, `Handicap`, `Rules`, `Notice` (all plain text; the first four are what the admin page edits), plus `Event`, `Date`, `Venue`. Rows whose key is Event/Date/Venue/Format/Notice are used by the header and banner; everything else renders in the details grid. Nothing private is stored in this tab.

**Log** (created by `setupAdmin`): `When`, `Change`, `Old`, `New`, `Via` — appended by the admin API, one row per changed cell.

## Admin page (`admin.html` + `tools/admin-api.gs`)

- One screen: header, ten team rows (team number, both names, strokes, a big numeric box prefilled with the current gross, and Net · rank once scored), then Format / Handicap / Rules / Notice as text boxes, then a sticky bar with a Reload button and one **Save** button that shows how many changes are pending.
- The page loads its state from the API on open and after every Save, so it always shows what is on the board. It never recomputes strokes or net — they come from the sheet.
- Client-side rules mirror the script: whole number 50–120 or blank; lines up to 300 characters, whitespace collapsed. Invalid boxes go red and Save is disabled until fixed. Clearing a box that had a score is called out ("Score will be removed on Save").
- Save sends only the fields that changed. The script validates everything first (unknown team, bad number, over-long line → the whole request is refused and nothing is written), takes a script lock, writes the changed cells, appends to `Log`, and returns the fresh state; the page compares what came back with what it sent and warns on any mismatch.
- A failed Save (no signal, Google hiccup) leaves the edits on screen with a red message; Save again. Reload with unsaved edits asks first. Leaving the page with unsaved edits triggers the browser's warning.
- Transport: `fetch` to the Apps Script `/exec` URL, `Content-Type: text/plain` so there is no CORS preflight (Apps Script cannot answer OPTIONS); the script replies with JSON through Google's redirect. Verified from the GitHub Pages origin.
- The earlier Google Form (`tools/build-score-form.gs`) is closed and unlinked; its `Scores` tab was deleted by `setupAdmin`.

## Page

- Tabs: Leaderboard · Teams · Players · **Strokes** (rule in plain words + per-team working, read from the sheet, never recomputed in JS).
- Leaderboard columns: # · Team · Strokes · Gross · Net · vs Par. Tied ranks show as T1. Unscored teams sit at the bottom in team order.
- Notice banner under the header when `Details!Notice` is non-empty.
- Hero: the owner's Admiral photo faded behind the header, the cup artwork as a badge, event name from the sheet.
- Hardening: all sheet strings HTML-escaped; ragged API rows tolerated; a failed refresh keeps the last good data and shows a red status instead of "Updating…" forever; refresh on tab focus.

## Known limits

- Anyone holding the admin link (it contains the key) can change scores. Keep it off the board and off group chats; `rotateAdminKey()` if it gets out.
- The admin API runs as Willis's Google account (Apps Script web app). A save takes 1–4 s while Google spins the script up.
- The page trusts the sheet's row positions: never insert rows above row 6 on Players / Teams / Leader Board.
- Handicaps should be whole numbers (one decimal is fine). The `Raw` column and Strokes tab show two decimals.
