# 2nd Annual Cuntini Cup — live scoreboard

A single `index.html` hosted on GitHub Pages that reads a Google Sheet every 20 seconds. The sheet does the calculating; the page only displays. The organizer enters scores on `admin.html` from his phone; it writes straight into the sheet.

- **Live board (public):** https://willisdrynkn.github.io/cuntini-cup/
- **Organizer's admin page:** `https://willisdrynkn.github.io/cuntini-cup/admin.html?k=<ADMIN KEY>` — the key is private; ask Willis. Without it the page does nothing.
- **Sheet:** https://docs.google.com/spreadsheets/d/1kM2RLB_gEbbARUsajtyI7tCgVbE-PxPfxkyBo0oCwq8/edit
- **Images folder:** https://drive.google.com/drive/folders/19k3scJ1rF-CYPsstdrAYdon041t6ohps
- **Design & decisions:** `docs/plans/2026-09-25-scoring-form-and-page-design.md` · **Test log:** `docs/2026-09-25-verification.md`

## How it fits together

```
admin.html (organizer's phone, ?k=KEY)
   └─► Apps Script web app (tools/admin-api.gs: checks the key, validates, writes, logs)
          ├─► Leader Board!E   gross score per team          ─┐
          ├─► Details!B        Format / Handicap / Rules / Notice ─┤
          └─► Log tab          one row per change              │
Players tab (handicaps) ─► Teams (35%/15%, rounding, strokes) ─┼─► index.html (every 20 s)
Details tab (event, date, venue) ──────────────────────────────┘
```

## On the day (organizer)

1. Open the admin link (bookmark it). It shows every team with the score currently on the board, and the four text lines.
2. Type a team's gross score (18 holes, whole number 50–120) in its box. Do as many teams as you like.
3. Tap **Save**. The board updates within 20 seconds. The bar at the bottom confirms what was written.
4. Wrong score? Open the link again, change the number, Save. Clear a box to remove a team's score.
5. **Notice** puts a message at the top of the board (e.g. "Prizes at the bar at 3pm"). Empty it to take the message down. **Format**, **Handicap** and **Rules** are the three lines in the details box.

If Save fails (no signal), nothing is half-written: the page keeps your edits and you tap Save again.

Emergency override, in the sheet: type a number straight into `Leader Board!E<row>`; the admin page shows it on its next load. Every change made through the admin page is in the `Log` tab (when, what, old, new).

## Before the event

- **Roster / handicaps:** edit the `Players` tab only (rows 6–25: name, team #, handicap, player 1 or 2). Teams, strokes, the board and the admin page follow automatically.
- **Event name, date, venue:** rows `Event`, `Date`, `Venue` in the `Details` tab. They drive the page header, footer and browser title — no code change needed.
- **Hero images:** the Admiral photo behind the header is `assets/admiral/image.png`; the cup badge is `assets/cup/image.png`. To change one, replace the file under the same name (GitHub → the file → Upload files). No code change needed.
- **Course par:** `Leader Board!K2`.
- **A team withdraws:** strokes are measured from the lowest team handicap (`Teams!J4`). If you want everyone's strokes to stay as announced, type `8` (or whatever was announced) into `J4`.

## The admin API (`tools/admin-api.gs`)

Lives in the sheet's Apps Script project ("Cuntini Cup scoreboard"), deployed as a web app (execute as Willis, anyone with the key). `admin.html` talks to it with `fetch`; the key travels in the request, never in this repo or the sheet.

- **Lost the key?** Apps Script → run `printAdminKey()` (execution log).
- **Key leaked?** Run `rotateAdminKey()` and send the organizer the new link.
- **Changed the script?** Deploy → Manage deployments → pencil → Version: New → Deploy. The URL in `admin.html` stays the same.
- **Setting it up from scratch:** the header comment in the file has the steps (`setupAdmin` once, then deploy, then paste the `/exec` URL into `API_URL` in `admin.html`).

`tools/build-score-form.gs` is the retired Google Form builder from earlier in the day, kept for reference; the form is closed and unlinked.

## Handicap rule

Team handicap = 35% of the lower handicap + 15% of the higher (USGA 2-man scramble), rounded to the nearest whole number (.5 up). Strokes = team handicap − the lowest team handicap in the field. Net = gross − strokes. The **Strokes** tab on the page shows the full working for every team.

## Do not

- Insert rows above row 6 on `Players`, `Teams` or `Leader Board` — the page and the API read rows by position.
- Rename the tabs.
- Post the admin link (or the key) anywhere public.

## Development

Fixture-driven browser tests (Playwright + Chromium): `tests/test_page.js` for the board, `tests/test_admin.js` for the admin page (the API is mocked with the same validation rules as the script).

```
cd tests && npm install playwright && node test_page.js && node test_admin.js
```

Rollback: the Easter 2026 version of `index.html` is commit `13193e5`; open it, click Raw, and paste it back over `index.html`. The repo was `admiral-easter` until 25 Sep 2026; GitHub redirects the old repo links, but the old Pages address does not redirect.
