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
| Score entry | One Google Form, organizer-only link. First tap: **A team score**, **A notice for the board** or **The rules line**. |
| Corrections | Resubmit the team; the latest submission wins. Deleting a rogue row in `Scores` reverts to the previous one. Typing a number over `Leader Board!E` is the emergency override. |
| Notice | Latest non-blank notice shows as a banner on the page. Submitting `-` clears it. |
| Details from the form | Notices and the Rules line (latest wins, `-` clears; Rules falls back to the sheet's text). Format stays in the sheet. |
| Page identity | Event / Date / Venue / Format come from `Details` rows (no redeploy to change them). Hero and banner images are optional constants in `index.html`. |

## Sheet layout (after this update)

**Teams** row 4: `E4` label, `F4` = 35%, `G4` = 15%, `I4` label, `J4` = `MIN(H6:H15)` (base). Row 5 headers. Rows 6–15:

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| Team | Player A | Hcp A | Player B | Hcp B | Low × 35% | High × 15% | Team Hcp | Raw | Strokes |

**Leader Board** rows 6–15: `A` Team, `B`/`C` names, `D` Team Hcp, `E` Gross (formula: latest form submission), `F` Net = E − I, `G` vs Par = F − `K2`, `H` Rank, `I` Strokes.

**Details**: `Format`, `Handicap`, `Rules`, `Notice` (formula), plus `Event`, `Date`, `Venue` when known. Rows whose key is Event/Date/Venue/Format/Notice are used by the header and banner; everything else renders in the details grid. Form links are written to `D1:E3`.

**Scores** (created by the form builder): `Timestamp`, `What are you entering?`, `Team`, `Gross score (18 holes)`, `Notice`, `Rules`. Formulas that read it use whole-column references (`Scores!$C:$C`) with a `ROW()>1` guard, because Google Forms inserts rows and would otherwise push a `$C$2:$C` reference out from under new submissions.

## Form (built by `tools/build-score-form.gs`)

- Page 1: *What are you entering?* → **A team score** / **A notice for the board** / **The rules line** (required, branches).
- Score page: **Team** dropdown (`"3 — Ryan Vrba & El Tony"`, built from the Teams tab) + **Gross score (18 holes)** (whole number 50–120, regex-validated). Both required. Submits.
- Notice page: **Notice** (required). Submits.
- Rules page: **Rules** (required). Submits.
- No sign-in, no email collection, unlimited responses, "submit another" link, confirmation *"Saved. The leaderboard updates within 20 seconds."*
- Responses linked into the scoreboard sheet as tab `Scores`. The builder then writes the Gross, Notice and Rules formulas.
- The team dropdown is static: run `refreshTeamDropdown()` after any roster change.

## Page

- Tabs: Leaderboard · Teams · Players · **Strokes** (rule in plain words + per-team working, read from the sheet, never recomputed in JS).
- Leaderboard columns: # · Team · Strokes · Gross · Net · vs Par. Tied ranks show as T1. Unscored teams sit at the bottom in team order.
- Notice banner under the header when `Details!Notice` is non-empty.
- Hardening: all sheet strings HTML-escaped; ragged API rows tolerated; a failed refresh keeps the last good data and shows a red status instead of "Updating…" forever; refresh on tab focus.

## Known limits

- Anyone holding the form link can post a score. Keep it off the page and off group chats.
- The page trusts the sheet's row positions: never insert rows above row 6 on Players / Teams / Leader Board.
- Handicaps should be whole numbers (one decimal is fine). The `Raw` column and Strokes tab show two decimals.
