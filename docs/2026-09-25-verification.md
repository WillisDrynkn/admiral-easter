# Verification log — 25 Sep 2026

What was checked, how, and what is still open. Update this as the remaining items close.

## Sheet

| Check | Method | Result |
|---|---|---|
| Backup exists before any change | Drive copy `BACKUP 2026-09-25 (before 2026 update) - 2man Scramble - Bright` (same folder as the original) | ✅ |
| 20 players / 10 teams entered as supplied | Read back `Players!A6:E25` and `Teams!A6:J15` | ✅ names, team #s, handicaps, player slots match the list |
| Allowance 35% / 15% | `Teams!F4:G4` read back | ✅ |
| Team handicap for all ten teams | Sheet values vs the expected list (7.70→8, 8.40→8, 8.75→9, 8.75→9, 9.45→9, 9.45→9, 9.45→9, 9.00→9, 8.85→9, 7.95→8) | ✅ all ten match |
| Strokes for all ten teams | Sheet values vs expected (0,0,1,1,1,1,1,1,1,0); base = 8 | ✅ |
| Rounding hazard (raw values that land on x.4999… in floating point) | Probed the six integer handicap pairs in 0–36 that hit it (3/3, 6/36, 12/22, 23/23, 24/34, 29/29) inside the sheet, naive `ROUND` vs `ROUND(ROUND(x,3),0)` | ✅ both give the correct answer in Google Sheets; hardened form kept as insurance |
| Leader Board pulls names / Team Hcp / Strokes; Net = Gross − Strokes; blank-safe | Read back with no scores | ✅ all score cells blank, no errors |
| Latest-submission-wins Gross formula | Temporary `Scores` tab with 12 simulated submissions incl. a correction (T3 66→64), a text-typed score ("69"), team "10" vs "1" prefix, two notices | ✅ T1=69, T2=70, T3=64, T5=66, T9=68, T10=70; ranks 4,5,1,2,3,5; tie T2/T10 shared rank 5 |
| Notice formula: latest wins, `-` clears | Same tab | ✅ "Play suspended 10 min" shown, then cleared by " - " |
| Temporary test data removed | Deleted the temp tab; cleared `Leader Board!E6:E15` and `Details!B4`; re-read | ✅ four tabs only, no scores, no errors |
| Number formats the page will receive | Read with FORMATTED_VALUE | ✅ fixed: F/G/I were one-decimal ("8.8"); now `0.00` ("8.75") |

## Page (index.html)

Fixture-driven, headless Chromium, `tests/test_page.js` — **41 checks, all passing**:

- No scores: 10 rows, "scores will appear" message, strokes column 0,0,1,1,1,1,1,1,1,0, notice hidden, header falls back to default name, grid shows Format/Handicap/Rules only.
- Teams (10 rows, "(13)" handicap tags), Players (20 rows), Strokes (10 cards; team 3 reads `13 × 35% = 4.55`, `28 × 15% = 4.2`, `4.55 + 4.2 = 8.75 → rounds to 9`, `9 − 8 = 1 stroke`; rule text quotes 35% / 15% / base 8 / par 72).
- Scores with ties: order T1, T1, T3, T3, T5, T5 then unscored teams in team order; two leader rows highlighted; Net and vs Par correct; notice banner shown; event name/date/venue and browser title from Details.
- No horizontal overflow at 360 px.
- API 403 after good data: last scores kept, red status, warning shown. Network failure: same. Recovery clears it. First load failing: clear message, spinners hidden.
- Ragged/short rows and blank rows from the API: no crash, dashes shown.
- Sheet strings containing HTML/script are rendered as text (no execution).
- No console or page errors outside the deliberate-failure scenarios.

Screenshots reviewed at 390 px and 360 px (leaderboard, teams, players, strokes, error states).

## Live (same day, later)

| Check | Method | Result |
|---|---|---|
| Deployed to GitHub Pages | Committed `index.html`, README, `tools/build-score-form.gs` through the GitHub web editor in Willis's Chrome (the session's git proxy could not push to this repo) | ✅ live at https://willisdrynkn.github.io/admiral-easter/ (renamed to `/cuntini-cup/` later that night) |
| Live page in a real browser | Chrome: header "The Cunti Cup · El Camaleón at Mayakoba · Saturday 26 September 2026", 10 teams, strokes column, Strokes tab working; console clean (only an unrelated extension error) | ✅ |
| Event details, name fixes | Details rows Event/Date/Venue; Players: Nick D'Urso, Michael Bukati; banners on the three tabs | ✅ Date stored as text, not a date serial |
| Form built and linked | `buildScoreForm()` run from the sheet's Apps Script editor; `Scores` tab created (moved to the end); links written to `Details!D1:E3` | ✅ |
| Form opens without a Google sign-in | Opened the short link in a browser with no Google session | ✅ ("Sign in to save progress" is optional) |
| Real submission → leaderboard | Submitted Team 3 = 66 through the form's own Submit button | ❌ first time: Google Forms *inserted* the response row and pushed the `$C$2:$C` references to `$C$3:$C`, so the new row fell outside the range. **Fixed** by switching all three formulas to whole-column references with a `ROW()>1` header guard (sheet and builder script). |
| Re-test after fix | Team 3 = 66 appeared (net 65, rank 1); second submission Team 3 = 64 replaced it (net 63, −9, rank 1); formulas unchanged after the row insert | ✅ latest-wins proven with real submissions |
| Live page shows the submission | Chrome, within one refresh | ✅ |
| Test data removed | Deleted Scores rows 2–3; read back: header only, leaderboard empty, Rules default, Notice blank | ✅ |

## Hero design and event name (same day, evening)

| Check | Method | Result |
|---|---|---|
| Event name | The cup artwork supplied by the owner reads "2ND ANNUAL CUNTINI CUP"; adopted as the event name in `index.html` (title, fallback), README, the form title, the form builder and the sheet (`Details!Event`, tab banners) | ✅ consistent everywhere; Willis asked to confirm the spelling |
| Hero images | Owner's Admiral photo and cup artwork committed as `assets/admiral/image.png` and `assets/cup/image.png` (uploaded through GitHub's file uploader, which fixes the filename); page references them by relative path, so the page itself stays ~32 KB | ✅ |
| Hero layout | Cup as a round badge, "The Admiral Sports Bar & Kitchen presents" kicker, event name, sub line `Format • Venue • Date`; Admiral photo faded and desaturated behind two gradients so the text stays readable | ✅ fixture tests updated (`#event-sub` carries the format; images served with the right content type) |
| Live after the change | Chrome, hard reload (`?v=3`): both images load, sub line "2-Man Scramble • El Camaleón at Mayakoba • Saturday 26 September 2026", console clean | ✅ |
| Form title | Renamed to "Cuntini Cup - Score Entry" in the form editor (ASCII hyphen: the editor garbled an em dash); public form page re-checked | ✅ |

## Admin page replaces the form (same day, night)

Willis's verdict on the form: unusable — the organizer will not go in and out of a form for every score; he needs one screen with all the teams that he can come back to. Built `admin.html` + `tools/admin-api.gs` instead.

| Check | Method | Result |
|---|---|---|
| Fixture tests for the admin page | `tests/test_admin.js`, headless Chromium, API mocked with the script's validation rules — **44 checks, all passing**: prefilled scores/lines, strokes/net/rank shown, 49/121/letters rejected client-side, only changed fields sent, clearing a score called out, server rejection keeps the edits, network failure then retry, reload guard, wrong key, missing key, non-JSON answer, 390 px and 360 px, no console errors | ✅ |
| `setupAdmin()` migration | Run once in Willis's Apps Script project: key generated, old form unlinked, `Scores` tab deleted, `Leader Board!E6:E15` and `Details` Rules/Notice turned into plain values, `D1:E3` cleared, `Log` tab created | ✅ (the form-closing step threw `Invalid data updating form`; closed afterwards with `closeOldForm()` — verified closed) |
| Web app deployed | v1, execute as Willis, access Anyone; `/exec` URL baked into `admin.html` | ✅ GET with the key returns the ten teams and lines; wrong key → "This link is not valid" |
| Cross-origin from GitHub Pages | `fetch` GET and POST from the `willisdrynkn.github.io` origin (text/plain body, redirect followed) | ✅ both return JSON; no CORS error |
| Live end-to-end, real sheet | Admin page on the live site: T3 = 66, T9 = 70, Notice set → Save | ✅ sheet: T3 66/65/−7/rank 1, T9 70/69/−3/rank 2, Notice text; `Log` has three rows; public board showed both rows and the banner within one refresh |
| Reopen shows current state | Reloaded the admin page | ✅ 66 and 70 prefilled, Notice prefilled, T3 shows "Net 65 · 1st" |
| Correction, clear, notice off | T3 → 64, T9 box emptied ("Score will be removed on Save" shown), Notice emptied → Save | ✅ board: only T3 (64/63/−9), banner gone; `Log` rows for each |
| Test data removed | T3 box emptied → Save | ✅ board empty, `Details!Notice` blank, 8 `Log` rows record the whole rehearsal |
| Secrets | `grep` for the key across the repo; `Details!D1:E3` cleared | ✅ key exists only in Script Properties and in the organizer's link |
| Repo renamed | GitHub Settings → `cuntini-cup`; Sheets API key confirmed unrestricted by referrer beforehand (worked from `script.google.com`) | ✅ see below |

## Repo rename to `cuntini-cup`

| Check | Method | Result |
|---|---|---|
| New Pages address serves the board and the admin page | Loaded `https://willisdrynkn.github.io/cuntini-cup/` and `/admin.html?k=…` in Chrome after the rename | ✅ board: 10 rows, both hero images load, live status; admin page: 10 rows loaded with the key, cup badge loads, its board link points at the new address |
| Old address | `https://willisdrynkn.github.io/admiral-easter/` | ✅ confirmed: now "Site not found". GitHub redirects the repo URL but not Pages. Nobody had the old link except Willis. |

## Still open

| Item | Notes |
|---|---|
| Nothing blocking the event | Sheet, board, admin page and hero are all live and tested; the key is with Willis. |
| Roster changes | If a team changes after today, edit `Players`; the board and the admin page follow. |
