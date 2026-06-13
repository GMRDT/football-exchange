# Mapping Resolution TODO — 28 ambiguous players

**Prepared:** 2026-06-12 (overnight prep) · **For:** founder, manual resolution tomorrow
**Source data:** `data/api-player-mapping-review.csv` + local DB seed (`players`). No new
API calls were made.

## How to read this

The auto-mapper (`scripts/map-api-players.ts`) refused all 28 because the
`/players/squads` endpoint returns **abbreviated first names** (`M. Caicedo`), which caps
every surname match at score 60 — below the 80 auto-apply bar — and many squads contain
**two players with the same surname**. Resolution = picking the right one by first-name
initial, position, and DOB.

**Critical caveat:** the review CSV stored **only the best candidate's `api_player_id`** —
the *second* candidate's id was never captured. So for every entry where the correct
player is the second-ranked candidate (LOW bucket below), you must fetch the id via
`/players/profiles?search=<surname>` or the squad page — **do not reuse the printed
`best_api_id`, it belongs to a different player.**

Squad candidates below show only `id + name` (the endpoint/script captured no position or
DOB for them).

**Order:** AMBIGUOUS (no usable candidate — most work) → LOW (correct player is the
*second* candidate, id missing) → HIGH (best candidate is correct, just confirm). Within
each bucket, highest `base_value` first.

---

## 🔴 AMBIGUOUS — no usable candidate captured (do a fresh `/players/profiles` lookup)

### Kenan Yıldız — base_value: 187500 — tier: star
- **Seed entry:** Kenan Yıldız · Turkey · FWD · DOB 2005-05-04
- **API candidates returned by squads endpoint:** None (best_score 0 — no surname match).
- **Recommended match:** Lookup `/players/profiles?search=Yildiz` (Juventus FWD, b. 2005). High-value star — resolve first.
- **Confidence:** ambiguous
- **Why ambiguous:** likely the Turkish dotless-ı normalization bug (see Bugs section) mangled "Yıldız" to no surname token, so the squad match returned nothing.

### Dean Huijsen — base_value: 175000 — tier: starter
- **Seed entry:** Dean Huijsen · Spain · DEF · DOB 2005-04-14
- **API candidates returned by squads endpoint:** None (best_score 0).
- **Recommended match:** Lookup `/players/profiles?search=Huijsen` (Real Madrid/Bournemouth DEF, b. 2005). Surname is unique — should resolve cleanly once queried.
- **Confidence:** ambiguous
- **Why ambiguous:** ASCII surname yet no candidate — player likely absent from the returned Spain squad snapshot; verify `teams.api_team_id` squad coverage.

### Eliesse Ben Seghir — base_value: 100000 — tier: starter
- **Seed entry:** Eliesse Ben Seghir · Morocco · FWD · DOB 2005-02-16
- **API candidates returned by squads endpoint:** None (best_score 0).
- **Recommended match:** Lookup `/players/profiles?search=Ben Seghir` (Monaco FWD, b. 2005).
- **Confidence:** ambiguous
- **Why ambiguous:** two-token surname ("Ben Seghir") — the matcher's last-token logic compares only "seghir", and the squad likely lists him differently; needs manual confirm.

### Iliman Ndiaye — base_value: 95000 — tier: starter
- **Seed entry:** Iliman Ndiaye · Senegal · FWD · DOB 2000-03-06
- **API candidates returned by squads endpoint:**
  - 630895: Bara Ndiaye (score 60)
  - [id not captured]: C. Ndiaye (score 60)
- **Recommended match:** **Neither candidate** — both are different Ndiayes. Lookup `/players/profiles?search=Ndiaye` and pick "Iliman" (Everton FWD, b. 2000). Do NOT use 630895.
- **Confidence:** ambiguous
- **Why ambiguous:** Senegal squad has several Ndiaye; the two captured candidates (Bara, C.) are neither Iliman.

### Jhon Durán — base_value: 87500 — tier: starter
- **Seed entry:** Jhon Durán · Colombia · FWD · DOB 2003-12-13
- **API candidates returned by squads endpoint:** None (best_score 0).
- **Recommended match:** Lookup `/players/profiles?search=Duran` (Al-Nassr/Aston Villa FWD, b. 2003). Note Colombia also has other "Duran" surnames — filter by DOB 2003.
- **Confidence:** ambiguous
- **Why ambiguous:** no candidate returned despite ASCII surname; verify squad snapshot.

### Franjo Ivanović — base_value: 75000 — tier: prospect
- **Seed entry:** Franjo Ivanović · Croatia · FWD · DOB 2003-09-29
- **API candidates returned by squads endpoint:** None (best_score 0).
- **Recommended match:** Lookup `/players/profiles?search=Ivanovic` (Club Brugge FWD, b. 2003). Confirm vs any other Ivanović in squad by DOB.
- **Confidence:** ambiguous
- **Why ambiguous:** no candidate returned; possibly absent from returned squad list.

### Barış Alper Yılmaz — base_value: 62500 — tier: starter
- **Seed entry:** Barış Alper Yılmaz · Turkey · FWD · DOB 2000-05-23
- **API candidates returned by squads endpoint:** None (best_score 0).
- **Recommended match:** Lookup `/players/profiles?search=Yilmaz` (Galatasaray FWD, b. 2000). Turkey squad may have multiple Yılmaz — filter DOB 2000.
- **Confidence:** ambiguous
- **Why ambiguous:** Turkish dotless-ı normalization bug (see Bugs) mangled "Yılmaz".

### Roony Bardghji — base_value: 50000 — tier: prospect
- **Seed entry:** Roony Bardghji · Sweden · FWD · DOB 2005-11-15
- **API candidates returned by squads endpoint:** None (best_score 0).
- **Recommended match:** Lookup `/players/profiles?search=Bardghji` (Barcelona/Copenhagen FWD, b. 2005). Unique surname — clean once queried.
- **Confidence:** ambiguous
- **Why ambiguous:** no candidate returned; likely absent from returned Sweden squad snapshot.

### Antonín Kinský — base_value: 30000 — tier: prospect
- **Seed entry:** Antonín Kinský · Czech Republic · GK · DOB 2003-03-31
- **API candidates returned by squads endpoint:** None (best_score 0).
- **Recommended match:** Lookup `/players/profiles?search=Kinsky` (Tottenham GK, b. 2003). Position GK helps confirm.
- **Confidence:** ambiguous
- **Why ambiguous:** no candidate returned despite normalizable surname; verify squad coverage.

### Diego Luna — base_value: 30000 — tier: prospect
- **Seed entry:** Diego Luna · United States · MID · DOB 2003-09-09
- **API candidates returned by squads endpoint:** None (best_score 0).
- **Recommended match:** Lookup `/players/profiles?search=Luna` (Real Salt Lake MID, b. 2003). USA squad mapped 8/+ already (F3.5) — cross-check the same squad page.
- **Confidence:** ambiguous
- **Why ambiguous:** no candidate returned; player may be a recent USMNT call-up absent from the cached squad.

### Uğurcan Çakır — base_value: 30000 — tier: starter
- **Seed entry:** Uğurcan Çakır · Turkey · GK · DOB 1996-04-05
- **API candidates returned by squads endpoint:** None (best_score 0).
- **Recommended match:** Lookup `/players/profiles?search=Cakir` (Galatasaray GK, b. 1996). Position GK confirms.
- **Confidence:** ambiguous
- **Why ambiguous:** Turkish dotless-ı in "Çakır" mangled by normalization (see Bugs).

### Hirving Lozano — base_value: 20000 — tier: starter
- **Seed entry:** Hirving Lozano · Mexico · FWD · DOB 1995-07-30
- **API candidates returned by squads endpoint:** None (best_score 0).
- **Recommended match:** Lookup `/players/profiles?search=Lozano` (San Diego FC FWD, "Chucky", b. 1995). Mexico may list several Lozano — filter DOB 1995.
- **Confidence:** ambiguous
- **Why ambiguous:** no candidate returned despite ASCII surname; verify squad snapshot.

### Marcelo Brozović — base_value: 15000 — tier: starter
- **Seed entry:** Marcelo Brozović · Croatia · MID · DOB 1992-11-16
- **API candidates returned by squads endpoint:** None (best_score 0).
- **Recommended match:** Lookup `/players/profiles?search=Brozovic` (Al-Nassr MID, b. 1992). Unique surname.
- **Confidence:** ambiguous
- **Why ambiguous:** no candidate returned; likely absent from returned Croatia squad list.

### Robin Olsen — base_value: 2500 — tier: starter
- **Seed entry:** Robin Olsen · Sweden · GK · DOB 1990-01-08
- **API candidates returned by squads endpoint:** None (best_score 0).
- **Recommended match:** Lookup `/players/profiles?search=Olsen` (Aston Villa GK, b. 1990). Filter by GK + DOB 1990.
- **Confidence:** ambiguous
- **Why ambiguous:** no candidate returned; "Olsen" is common across Scandinavian squads — confirm by DOB.

---

## 🟠 LOW — best candidate is the WRONG player; correct one is the second candidate (id not captured)

### Pape Matar Sarr — base_value: 112500 — tier: starter
- **Seed entry:** Pape Matar Sarr · Senegal · MID · DOB 2002-09-14
- **API candidates returned by squads endpoint:**
  - 276184: M. Sarr (score 60) ← best, but matches the MIDDLE name "Matar"
  - [id not captured]: P. Sarr (score 60) ← matches first name "Pape"
- **Recommended match:** Likely **P. Sarr** (Tottenham MID, b. 2002) — get its id via lookup. 276184 may be him (rendered as "Matar") OR a different Sarr; confirm DOB 2002 before trusting either.
- **Confidence:** low
- **Why ambiguous:** first name "Pape" vs middle "Matar" both abbreviate plausibly, and Senegal has ≥2 Sarr in the squad.

### Petar Sučić — base_value: 80000 — tier: prospect
- **Seed entry:** Petar Sučić · Croatia · MID · DOB 2003-10-25
- **API candidates returned by squads endpoint:**
  - 7332: L. Sucic (score 60) ← best, but this is **Luka Sučić** (a different player)
  - [id not captured]: P. Sucic (score 60) ← matches "Petar"
- **Recommended match:** **P. Sucic** (Petar, Dinamo Zagreb MID, b. 2003) — fetch its id. **Do NOT use 7332** (that's Luka Sučić).
- **Confidence:** low
- **Why ambiguous:** Croatia squad has both Luka Sučić and Petar Sučić; the best-scored candidate is Luka.

### Maximiliano Araújo — base_value: 55000 — tier: starter
- **Seed entry:** Maximiliano Araújo · Uruguay · FWD · DOB 2000-02-15
- **API candidates returned by squads endpoint:**
  - 101814: R. Araújo (score 60) ← best, but this is **Ronald Araújo** (DEF — see HIGH bucket)
  - [id not captured]: M. Araújo (score 60) ← matches "Maximiliano"
- **Recommended match:** **M. Araújo** (Maximiliano, Sporting/Toluca FWD, b. 2000) — fetch its id. **Do NOT use 101814** (that's Ronald, and it must go to the Ronald Araújo entry).
- **Confidence:** low
- **Why ambiguous:** two Araújos in Uruguay's squad; Ronald (DEF) outscored Maximiliano (FWD) only because both share the surname. Position (FWD vs DEF) disambiguates.

### Jhon Arias — base_value: 40000 — tier: starter
- **Seed entry:** Jhon Arias · Colombia · MID · DOB 1997-09-21
- **API candidates returned by squads endpoint:**
  - 30: S. Arias (score 60) ← best, but this is **Santiago Arias** (DEF, a different player)
  - [id not captured]: J. Arias (score 60) ← matches "Jhon"
- **Recommended match:** **J. Arias** (Jhon, Wolves/Fluminense MID, b. 1997) — fetch its id. **Do NOT use 30** (that's Santiago Arias).
- **Confidence:** low
- **Why ambiguous:** Colombia squad has Santiago Arias (DEF) and Jhon Arias (MID); best candidate is Santiago.

### Diego Gómez — base_value: 37500 — tier: starter
- **Seed entry:** Diego Gómez · Paraguay · MID · DOB 2003-03-27
- **API candidates returned by squads endpoint:**
  - 2502: G. Gómez (score 60) ← best, but this is **Gustavo Gómez** (DEF/captain, a different player)
  - [id not captured]: D. Gómez (score 60) ← matches "Diego"
- **Recommended match:** **api_player_id 278370** — CONFIRMED from today's F3.5 ingest (this exact "D. Gomez", Paraguay, took a yellow card at 79' in fixture 1489370 USA–Paraguay; captured during the live test, no new API call). **Do NOT use 2502** (Gustavo). Just confirm 278370 → Diego Gómez and apply.
- **Confidence:** low from CSV alone → **high** with the F3.5 cross-reference (278370)
- **Why ambiguous:** two Gómez in Paraguay's squad (Gustavo DEF, Diego MID); best candidate is Gustavo. Resolved via the live-test event id.

### Enner Valencia — base_value: 5000 — tier: starter
- **Seed entry:** Enner Valencia · Ecuador · FWD · DOB 1989-11-04
- **API candidates returned by squads endpoint:**
  - 198347: A. Valencia (score 60) ← best, a different Valencia
  - [id not captured]: E. Valencia (score 60) ← matches "Enner"
- **Recommended match:** **E. Valencia** (Enner, Internacional/Ecuador captain FWD, b. 1989) — fetch its id. **Do NOT use 198347.** DOB 1989 (veteran) makes him easy to confirm.
- **Confidence:** low
- **Why ambiguous:** Ecuador squad has multiple Valencia; best candidate (A.) isn't Enner.

---

## 🟢 HIGH — best candidate matches by first-initial; confirm and apply `best_api_id`

### Moisés Caicedo — base_value: 275000 — tier: star
- **Seed entry:** Moisés Caicedo · Ecuador · MID · DOB 2001-11-02
- **API candidates returned by squads endpoint:**
  - 116117: M. Caicedo (score 60) ← matches "Moisés"
  - [id not captured]: J. Caicedo (score 60) ← different player
- **Recommended match:** **116117** (M. Caicedo, Chelsea MID, b. 2001) — first-initial M is unique vs J. Caicedo.
- **Confidence:** high
- **Why ambiguous:** two Caicedos in Ecuador's squad; abbreviated names capped the score at 60, but the M/J initials separate them cleanly.

### Jonathan David — base_value: 100000 — tier: star
- **Seed entry:** Jonathan David · Canada · FWD · DOB 2000-01-14
- **API candidates returned by squads endpoint:**
  - 8489: J. David (score 60) ← matches "Jonathan"
  - [id not captured]: P. David (score 60) ← different player
- **Recommended match:** **8489** (J. David, Juventus/Lille FWD, b. 2000) — initial J matches.
- **Confidence:** high
- **Why ambiguous:** two Davids in Canada's squad; initial J disambiguates.

### Ronald Araújo — base_value: 100000 — tier: starter
- **Seed entry:** Ronald Araújo · Uruguay · DEF · DOB 1999-03-07
- **API candidates returned by squads endpoint:**
  - 101814: R. Araújo (score 60) ← matches "Ronald"
  - [id not captured]: M. Araújo (score 60) ← Maximiliano (see LOW bucket)
- **Recommended match:** **101814** (R. Araújo, Barcelona DEF, b. 1999) — initial R + position DEF. ⚠ This id is also (wrongly) printed as best for Maximiliano Araújo — it belongs HERE, to Ronald.
- **Confidence:** high
- **Why ambiguous:** two Araújos in Uruguay's squad; initial R + DEF position confirm Ronald.

### Antonee Robinson — base_value: 87500 — tier: starter
- **Seed entry:** Antonee Robinson · United States · DEF · DOB 1997-08-08
- **API candidates returned by squads endpoint:**
  - 19549: A. Robinson (score 60) ← matches "Antonee"
  - [id not captured]: M. Robinson (score 60) ← different player
- **Recommended match:** **19549** (A. Robinson, Fulham LB, b. 1997) — initial A matches.
- **Confidence:** high
- **Why ambiguous:** two Robinsons in USA's squad; initial A disambiguates.

### Zion Suzuki — base_value: 70000 — tier: starter
- **Seed entry:** Zion Suzuki · Japan · GK · DOB 2002-08-21
- **API candidates returned by squads endpoint:**
  - 199578: Z. Suzuki (score 60) ← matches "Zion"
  - [id not captured]: J. Suzuki (score 60) ← different player
- **Recommended match:** **199578** (Z. Suzuki, Parma GK, b. 2002) — initial Z is unique + GK.
- **Confidence:** high
- **Why ambiguous:** two Suzukis in Japan's squad; initial Z + GK position confirm.

### Emiliano Martínez — base_value: 45000 — tier: starter
- **Seed entry:** Emiliano Martínez · Argentina · GK · DOB 1992-09-02
- **API candidates returned by squads endpoint:**
  - 19599: E. Martínez (score 60) ← matches "Emiliano"
  - [id not captured]: Lisandro Martínez (score 60) ← DEF, different player
- **Recommended match:** **19599** ("Dibu" Martínez, Aston Villa GK, b. 1992) — initial E + GK; Lisandro is a DEF.
- **Confidence:** high
- **Why ambiguous:** two Martínez in Argentina's squad (Emiliano GK, Lisandro DEF); initial + position disambiguate.

### Yahia Fofana — base_value: 20000 — tier: starter
- **Seed entry:** Yahia Fofana · Ivory Coast · GK · DOB 2000-08-21
- **API candidates returned by squads endpoint:**
  - 64190: Y. Fofana (score 60) ← matches "Yahia"
  - [id not captured]: S. Fofana (score 60) ← Seko Fofana (MID), different player
- **Recommended match:** **64190** (Y. Fofana, Angers GK, b. 2000) — initial Y + GK; Seko is a MID.
- **Confidence:** high
- **Why ambiguous:** Ivory Coast squad has Yahia Fofana (GK) and Seko Fofana (MID); initial + position confirm.

### Édouard Mendy — base_value: 12500 — tier: starter
- **Seed entry:** Édouard Mendy · Senegal · GK · DOB 1992-03-01
- **API candidates returned by squads endpoint:**
  - 2986: É. Mendy (score 60) ← matches "Édouard"
  - [id not captured]: A. Mendy (score 60) ← different player
- **Recommended match:** **2986** (É. Mendy, Al-Ahli GK, b. 1992) — initial É + GK.
- **Confidence:** high
- **Why ambiguous:** two Mendy in Senegal's squad; initial É + GK position confirm.

---

## Bugs spotted during prep (NOT fixed — flagged per instructions)

1. **`normalizeName` drops the Turkish dotless ı (U+0131) instead of folding it to `i`.**
   In `scripts/map-api-players.ts`, `normalizeName` does `.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ')`. The character `ı` has no NFD decomposition to ASCII, so it survives to the `[^a-z0-9 ]` step and is replaced with a space — splitting/mangling the surname token. This is why **all three Turkish players** (Kenan **Yıldız**, Barış Alper **Yılmaz**, Uğurcan **Çakır**) scored 0/no_match purely from normalization, not from genuine absence. `İ` (capital dotted I) would hit the same path. Impact beyond tonight: any future `map-api-players` run silently fails to match `ı`/`İ` names. Suggested (for a later code task, not now): pre-fold `ı→i`, `İ→i`, `ş→s`, `ğ→g`, `ç→c` before NFD. **Do not fix tonight.**

2. **Workflow gap (not a code defect): the review CSV omits the second candidate's `api_player_id`.**
   `map-api-players.ts` writes `best_api_id` but only `second_api_name` (no id). For the 6
   LOW-bucket players, the *correct* match is the second candidate, so the CSV can't supply
   a usable id — forcing a fresh lookup. If this script is revisited, logging the top-N
   candidate **ids** (not just names) would make this resolution near-instant next time.
