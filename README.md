# 2nd Annual Cuntini Cup — live scoreboard

A single `index.html` hosted on GitHub Pages that reads a Google Sheet every 20 seconds. The sheet does the calculating; the page only displays. Scores go in through a Google Form on the organizer's phone.

- **Live page:** https://willisdrynkn.github.io/admiral-easter/
- **Sheet:** https://docs.google.com/spreadsheets/d/1kM2RLB_gEbbARUsajtyI7tCgVbE-PxPfxkyBo0oCwq8/edit
- **Images folder:** https://drive.google.com/drive/folders/19k3scJ1rF-CYPsstdrAYdon041t6ohps
- **Design & decisions:** `docs/plans/2026-09-25-scoring-form-and-page-design.md`

## How it fits together

```
Google Form (organizer's phone)
   └─► Sheet tab "Scores"  (one row per submission)
          └─► Leader Board!E  = latest submission per team   ─┐
Players tab (handicaps) ─► Teams (35%/15%, rounding, strokes) ─┼─► index.html (every 20 s)
Details tab (event, rules, notice) ───────────────────────────┘
```

## On the day

1. The organizer opens the **score entry form** link (it is in the sheet, `Details!D1:E3` — keep it private; anyone with it can post a score).
2. Tap **A team score** → pick the team → type the gross score → Submit. The page updates within 20 seconds.
3. Made a mistake? Submit that team again. The latest entry wins.
4. Tap **A notice for the board** to put a message at the top of the page (e.g. "Prizes at the bar at 3pm"). Submit a single `-` to clear it.
5. Tap **The rules line** to change the Rules text in the details box. Submit a single `-` to remove it.

Emergency overrides, in the sheet: type a number straight into `Leader Board!E<row>` (replaces the formula for that team), or delete a bad row from the `Scores` tab (the previous submission for that team comes back).

## Before the event

- **Roster / handicaps:** edit the `Players` tab only (rows 6–25: name, team #, handicap, player 1 or 2). Teams, strokes and the leaderboard follow automatically.
- **Team names changed?** Extensions → Apps Script → run `refreshTeamDropdown()` so the form's dropdown matches.
- **Event name, date, venue:** rows `Event`, `Date`, `Venue` in the `Details` tab. They drive the page header, footer and browser title — no code change needed.
- **Hero images:** the Admiral photo behind the header is `assets/admiral/image.png`; the cup badge is `assets/cup/image.png`. To change one, replace the file under the same name (GitHub → the file → Upload files). No code change needed.
- **Course par:** `Leader Board!K2`.
- **A team withdraws:** strokes are measured from the lowest team handicap (`Teams!J4`). If you want everyone's strokes to stay as announced, type `8` (or whatever was announced) into `J4`.

## Building the score form (one time)

`tools/build-score-form.gs` creates the form, links it to the sheet, renames the responses tab to `Scores`, and writes the leaderboard formulas. Open the sheet → Extensions → Apps Script → paste the file → run `buildScoreForm` → approve the permissions. Links are printed in the log and written to `Details!D1:E3`. It refuses to run twice.

## Handicap rule

Team handicap = 35% of the lower handicap + 15% of the higher (USGA 2-man scramble), rounded to the nearest whole number (.5 up). Strokes = team handicap − the lowest team handicap in the field. Net = gross − strokes. The **Strokes** tab on the page shows the full working for every team.

## Do not

- Insert rows above row 6 on `Players`, `Teams` or `Leader Board` — the page reads rows by position.
- Rename the four tabs.
- Post the form link publicly.

## Development

Fixture-driven browser tests live in `tests/test_page.js` (Playwright + Chromium):

```
cd tests && npm install playwright && node test_page.js
```

Rollback: the Easter 2026 version of `index.html` is the commit just before "Cunti Cup 2026" in the GitHub history (`13193e5`); open it, click Raw, and paste it back over `index.html`.
