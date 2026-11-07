# seen-faculty-screening

A static dashboard that screens the lecturers of the School of Energy and Environment (SEEN), University of Phayao, against clause 9 of
**ประกาศคณะกรรมการมาตรฐานการอุดมศึกษา เรื่อง เกณฑ์มาตรฐานหลักสูตรระดับบัณฑิตศึกษา พ.ศ. 2565**
(ราชกิจจานุเบกษา เล่ม 139 ตอนพิเศษ 212 ง, 9 กันยายน 2565, pp. 25–31;
[full text, OPS](https://www.ops.go.th/en/content_page/download/1080/6943/16?method=view)).

It reads each lecturer's Google Scholar list and keeps journal articles and full papers in proceedings. Posters and abstracts are listed but are counted only if you switch them on. It then counts the outputs in the 5-year window and shows met, not met or needs review for every master's and doctoral role (9.3, 9.4). The rules engine also encodes the graduate-diploma clauses (9.1, 9.2), but the site does not show them.

> The screening is automated from Google Scholar data and must be checked against the official publication records before being used in official documents.

Live site: https://smalltee2.github.io/seen-faculty-screening/ · Repository: https://github.com/smalltee2/seen-faculty-screening

## Updating the data

1. Replace or append rows in `data/publications.tsv` (see the Scholar snippet below).
2. Edit `data/faculty.csv` for new lecturers, rank changes or degree years.
3. Copy lines from the site's **รอตรวจสอบ (review queue)** page into `data/overrides.csv`.
4. Commit and push to `main`. GitHub Actions runs the tests, builds the JSON and the site, and deploys it. A malformed file stops the build and the error names the file and line.

To view the dashboard on your own computer without a server, run `npm run standalone`. It writes `standalone/index.html`: one file with the data built in, which opens by double-click in any browser. Re-run it after editing `data/`. The file is not committed.

To check locally before pushing:

```bash
npm install
npm test
npm run dev        # http://localhost:5173/seen-faculty-screening/
```

## Daily update

GitHub Actions runs every day at 03:00 (Thailand time). It does three things:

- refreshes `data/openalex.tsv`, `data/scopus.tsv`, `data/manual.tsv`, the TCI journal list `data/tci_journals.csv` (tci-thailand.org) plus a yearly copy `data/tci_snapshots/<year>.csv` (the list as last seen that year; `2025.csv` was reconstructed once by `scripts/tci-backfill-2025.mjs` from the 2569 re-grading and new-journal announcements; stored for a future "กลุ่ม ณ ปีที่ตีพิมพ์" view, not displayed yet) and `data/tci_tier_history.csv`, the per-round กลุ่ม of every journal (tier, start_date, end_date) from TCI's journal records — the authoritative source for that view; new journals are added nightly, `--refresh-history` refetches all and the Scopus journal cache `data/scopus_journals.csv` (one `ISSN(x)` query per new ISSN)
- commits whatever changed
- rebuilds and redeploys the site

Pushing to `main` also rebuilds the site, but without fetching. You can also start a run by hand: Actions → "Test, build and deploy" → Run workflow.

| Source | How it updates | Notes |
|---|---|---|
| OpenAlex | automatic, daily | Free, no key. Uses `openalex_id` in `faculty.csv`. Gives DOI and journal/conference type. |
| Scopus | automatic, daily | Needs the `SCOPUS_API_KEY` repository secret. Uses `scopus_id`, or finds the author by name + Phayao. |
| Admin Google Form | automatic, daily | Reads the response sheet published as CSV (`manualSheetCsvUrl` in `data/sources.json`). |
| Google Scholar | by hand | No API. Re-export with the console snippet into `publications.tsv` now and then. |

The same work from several sources is merged by DOI or normalised title. The type from OpenAlex, Scopus or the form decides over Scholar's venue text.

### Scopus (runs on the iMac)

Elsevier accepts the key only from the University of Phayao network. GitHub's servers get `AUTHORIZATION_ERROR`. So Scopus is fetched by a daily job on the iMac:

1. Save the key in the macOS Keychain. The command asks for the key and does not show it:
   ```bash
   security add-generic-password -a "$USER" -s seen-scopus-api-key -w
   ```
2. Install the job:
   ```bash
   zsh scripts/install-scopus-daily.sh
   ```

What the job does:

- It works in a separate clone at `~/Library/Application Support/seen-scopus/repo`, runs `fetch-sources.mjs --only=scopus` every day at 07:30, overwrites `data/scopus.tsv` and `data/scopus_journals.csv`, and commits and pushes only when it changed.
- The push makes GitHub rebuild the site.
- If the Mac is asleep at 07:30, the job runs when it wakes. If it is off the university network, nothing changes.
- The log is `~/Library/Logs/seen-scopus.log`.

To stop it:

```bash
launchctl bootout gui/$UID ~/Library/LaunchAgents/th.ac.up.seen.scopus-daily.plist
```

If the library issues an institutional token, save it as the `SCOPUS_INSTTOKEN` secret together with `SCOPUS_API_KEY`. GitHub Actions will then fetch Scopus too.

### Admin Google Form

Create a Google Form whose question titles match these exactly:

| Question title | Type |
|---|---|
| `อาจารย์ (name_en)` | Dropdown: `ชื่อไทย (name_en)` for each lecturer, e.g. `ธีรชัย อำนวยล้อเจริญ (Teerachai Amnuaylojaroen)`; the importer reads the English name in brackets |
| `ปีที่ตีพิมพ์ (ค.ศ.)` | Short answer (number) |
| `ชื่อผลงาน` | Short answer |
| `ผู้แต่ง` | Short answer |
| `ประเภทผลงาน` | Multiple choice: `บทความวารสาร (journal)` / `บทความฉบับสมบูรณ์ในงานประชุม (proceedings)` / `โปสเตอร์/บทคัดย่อในงานประชุม (poster)` |
| `ชื่อวารสารหรืองานประชุม` | Short answer |
| `ปีที่/ฉบับที่/หน้า` | Short answer (optional) |
| `DOI หรือ URL` | Short answer (optional) |
| `เป็นงานวิจัยหรือไม่` | Multiple choice: `ใช่` / `ไม่ใช่` |

Then set it up:

1. In Settings, restrict responses to University of Phayao accounts, and do not collect email addresses.
2. Link the form to a response sheet.
3. In the sheet, choose File → Share → Publish to web → the responses tab → CSV, and copy the URL. The published sheet can be read by anyone with that URL.
4. Put the CSV URL in `manualSheetCsvUrl`, and the form link in `googleFormUrl`, in `data/sources.json`.

To remove an entry, delete its row in the sheet.

## Data files

All files are UTF-8. CSV files may quote fields with `"`.

### `data/faculty.csv`, one row per lecturer, edited by hand

| column | values |
|---|---|
| `name_en` | Unique key; must match `key` in the other files exactly |
| `name_th` | Thai name shown in the UI |
| `scholar_id` | The `user=` value of the Scholar profile URL (optional) |
| `academic_rank` | `อาจารย์` \| `ผศ.` \| `รศ.` \| `ศ.` |
| `highest_degree` | `ปริญญาโท` \| `ปริญญาเอก` |
| `degree_field` | Field of the highest degree, as written in the programme document (e.g. `วิศวกรรมสิ่งแวดล้อม`); shown after the degree on the person page |
| `degree_year_ce` | Year the highest degree was completed, in **CE** (2015, not 2558) |
| `programs` | Programmes the person is listed in, separated by `;`, e.g. `M.Sc.;Ph.D.` (used by the programme-level check) |
| `notes` | Free text |

### `data/publications.tsv`, exported from Google Scholar

Tab-separated with the header `key	year	title	authors	venue	cites`. `key` = `name_en`. Keep Scholar's venue string as is, e.g. `Atmosphere 12 (3), 345, 2021`.

Do not scrape Scholar from a server or from GitHub Actions, because Scholar blocks automated access. Instead, use `scripts/scholar_export_snippet.js`:

1. Open the profile with `&pagesize=100` added to the URL.
2. Open the browser console, paste the script, and enter the lecturer's `name_en`.
3. It loads all rows, then copies them as TSV without a header. Paste them at the end of `publications.tsv`.

### `data/overrides.csv`, manual corrections (always win)

| column | values |
|---|---|
| `key` | `name_en` |
| `title_normalized` | The title, lowercase with punctuation and spaces removed (the review page generates it; a plain title also matches) |
| `type_override` | `journal` \| `proceeding` \| `poster` \| `exclude` \| empty |
| `is_research` | `yes` \| `no` \| empty |
| `part_of_own_degree` | `yes` \| `no` \| empty |
| `note` | Free text, e.g. "checked in Scopus" |

## How the screening works

**Step 1: classify (`src/classify.ts`).** Titles are normalised (lowercase, punctuation and spaces removed, Thai ำ/ํา unified), and duplicates within one person are merged. The row kept is the one with volume/pages, then the longest venue. Each row is classified from its venue string, in this order:

- `exclude`: no venue, preprint (arXiv, Research Square, SSRN, EarthArXiv, Preprints.org, bioRxiv, EGUsphere, "Discussions", F1000 "awaiting peer review"), patent, dataset, thesis, book or chapter (or a publisher name alone), report.
- `poster`: poster, abstract, AGU Fall Meeting, EGU General Assembly, บทคัดย่อ.
- `proceeding`: Proceedings, Proc., Conference, Symposium, Congress, Workshop, E3S Web of Conferences, IOP/AIP conference series, การประชุมวิชาการ.
- `journal`: volume (issue), page range or article number.
- **Uncertain** (sent to the review queue): a journal-like name without volume/pages, a page range with no volume (likely a chapter), a university name only (likely a thesis), Lecture Notes series, and anything unrecognised.

Research flag: "review", "editorial" and บทความวิชาการ/ปริทัศน์ mean not research. "Systematic review", "meta-analysis", "perspective", "overview" and journals named "…Reviews" are uncertain.

**Step 2: rules (`src/rules.ts`).** Each publication counts **yes**, **maybe** (uncertain classification) or **no**. A role is:

- **met** when the certain counts satisfy it,
- **not met** when even the possible counts fail,
- **needs review** otherwise.

So an uncertain row affects a result only when it could decide it.

- The window is Y−4 … Y (the evaluation year is chosen on the site).
- Outputs marked `part_of_own_degree = yes` never count. Outputs from the degree year or the two years before it count as "maybe" until an override settles them.
- Posters count only when the switch is on.

| clause | role | degree / rank | outputs in 5 years |
|---|---|---|---|
| 9.3.1 | ป.โท อาจารย์ประจำหลักสูตร | ≥ ปริญญาโท | ≥ 3, of which ≥ 1 research |
| 9.3.2 | ป.โท ผู้รับผิดชอบหลักสูตร | ป.เอก, or ป.โท + ≥ รศ. | ≥ 3, ≥ 1 research |
| 9.3.3 (1), 9.3.4 (1) | ป.โท ที่ปรึกษาหลัก, ผู้สอบ (ภายใน) | ป.เอก, or ป.โท + ≥ รศ. | ≥ 3, ≥ 1 research |
| 9.3.5 | ป.โท อาจารย์ผู้สอน | ≥ ปริญญาโท | ≥ 1 |
| 9.4.1 | ป.เอก อาจารย์ประจำหลักสูตร | ป.เอก, or ป.โท + ≥ รศ. | ≥ 3 research |
| 9.4.2 | ป.เอก ผู้รับผิดชอบหลักสูตร | ป.เอก, or ป.โท + ศ. | ≥ 3 research |
| 9.4.3 (1), 9.4.4 (1) | ป.เอก ที่ปรึกษาหลัก, ผู้สอบ (ภายใน) | ป.เอก, or ป.โท + ≥ รศ. | ≥ 3 research |
| 9.4.5 | ป.เอก อาจารย์ผู้สอน | ป.เอก, or ป.โท + ≥ รศ. | ≥ 1 |
| 9.1.1 / 9.1.2 / 9.1.3 | ป.บัณฑิต | ≥ ป.โท / ป.เอก or ป.โท + ≥ รศ. / ≥ ป.โท | 3 (≥1 research) / 3 (≥1 research) / 1 |
| 9.2.1 / 9.2.2 / 9.2.3 | ป.บัณฑิตชั้นสูง | ป.เอก or ป.โท + ≥ รศ. / ป.เอก or ป.โท + ศ. / ป.เอก or ป.โท + ≥ รศ. | 3 (≥1 research) / 3 (≥1 research) / 1 |

The new-doctoral-graduate clauses (9.1.4, 9.2.4, 9.3.6, 9.4.6) apply to doctorates completed within the last 5 years:

- They may teach without outputs.
- Other roles need 1 output within 2 years, 2 within 4 or 3 within 5 after graduating (research outputs at doctoral level).

Results reached only through this path are shown as **needs review**, marked <sup>ใหม่</sup>.

Programme check: a programme level passes only if ≥ 3 lecturers listed in it (`programs`) meet the responsible-lecturer criterion (9.x.2).

Not checked automatically (the data has no field for them):

- subject relevance and teaching experience (9.x.3, 9.3.5, 9.4.5),
- whether an advisor is also a programme lecturer (9.3.3, 9.4.3),
- external examiners and co-advisors,
- "เทียบเท่า" equivalents.

### Site policy (decided by the programme, 2026-11-05)

- Strict mode: the site counts only outputs it can confirm as a journal article, a full proceedings paper or a conference poster/abstract. Anything uncertain is not counted, and there is no review queue: every role shows ผ่าน or ไม่ผ่าน. To count an item the classifier is unsure of, add a line to `data/overrides.csv`.
- Posters and abstracts from conferences count.
- Systematic reviews, meta-analyses and perspective articles count as research (ผลงานวิจัย). Narrative reviews and editorials do not.
- The site shows master's and doctoral levels (9.3, 9.4) only.

### Open questions in the criteria (`TODO(criteria)` in `src/rules.ts`)

1. **"อาจารย์ใหม่" (9.x.4 / 9.x.6) is not defined.** It is applied here when a doctorate was completed ≤ 5 years before Y, and every result reached through it needs review.
2. **"ภายใน 2 ปี / 4 ปี / 5 ปี"** is counted in whole calendar years (publication year − degree year), because Scholar gives only the year.
3. **Own-degree work.** The check flags outputs from the degree year and the two years before it. Earlier outputs (e.g. from a master's thesis, if the highest degree is a doctorate) are not flagged.
4. **Posters and abstracts.** The announcement counts works disseminated according to the academic-rank appointment criteria, so these are off by default.
5. **Systematic reviews and meta-analyses.** Whether they count as ผลงานวิจัย under 9.4 is left to the review queue.

## Privacy

A GitHub Pages site on a public repository can be seen by anyone. Names, ranks and publication lists on public Scholar profiles are already public, but anything you add to `faculty.csv` (degree year, notes) will be public too. To keep the site private, your options are:

- a private repository with Pages (requires a paid GitHub plan),
- a public but unlisted site (anyone with the link can still see it, and the repository is public),
- hosting the built `dist/` folder on an internal university server instead.

## Project layout

```
data/                     input files (CSV/TSV)
scripts/build-data.mjs    data/ → src/generated/data.json, with validation
scripts/scholar_export_snippet.js
src/classify.ts           Step 1: classification, dedupe, overrides
src/rules.ts              Step 2: clause 9 rules, programme check
src/review.ts             review queue and overrides.csv line generator
src/pages/                Overview, lecturer page, review queue
.github/workflows/deploy.yml
```

## User manual

`docs/manual/คู่มือการใช้งาน.pdf` is built from annotated screenshots of the live site:

```bash
scripts/manual/shots.sh            # headless Chrome screenshots → docs/manual/shots/
python3 scripts/manual/build-manual.py   # numbered arrows (Pillow) + HTML → PDF (Chrome)
```

Callout positions live in `scripts/manual/build-manual.py`; the Sarabun font (OFL) is bundled in `docs/manual/fonts/`.

## Conference screening (proceedings)

A proceedings paper counts only when the conference is organised or co-organised by an academic/professional
association **and** the conference is held for, or its main field is, environment or energy, including geoinformatics for earth/environmental sciences (decisions 2026-11-06). Everything not yet checked, not found,
or low-confidence is shown but not counted until an admin confirms it.

- Register: `data/conferences.csv`, one row per conference (`venue:<name>`) or per paper for publisher series
  such as AIP Conference Proceedings (`work:<title>`). Columns from the automatic check: `conference_name`,
  `organiser`, `association`, `association_role` (organiser | co_organiser | none | unknown), `field`,
  `related_field` (yes | no | unknown), `confidence` (high | medium | low), `evidence_url`, `checked_at`, `checked_by`, `note`.
  Admin override: `decision` (count | no_count), `decided_by`, `decided_at`, `decision_note`.
- Automatic verdict: count when confidence is high, the association organises/co-organises and the field is related;
  no_count when a medium/high-confidence check finds no association or an unrelated field; otherwise pending.
- `npm run screen-conferences` asks Claude Code (headless `claude -p` with web search) about every conference not
  yet in the register; the iMac daily job runs it after the Scopus refresh. Needs `claude login` on that Mac.
- `data/rules.json` → `"conferenceScreening": "on" | "off"` switches whether the register affects the counts
  (off = shown only). The admin page lists every conference with its verdict and evidence link.

### Live form rows

The site also reads the add-works form's published sheet directly in the browser (`src/liveManual.ts`, CORS is
allowed by Google), so a submitted work appears within about five minutes (Google's CSV cache) as a row marked
"สด" on the admin page, classified and screened like any other row. The 03:00 run writes the same rows to
`data/manual.tsv`; rows already in the bundle are skipped. Nothing is read live on the standalone file.

### Conference decisions by Google Form

Admins can decide without touching the CSV: a second Google Form whose responses sheet is published as CSV
(`decisionSheetCsvUrl` in `data/sources.json`; the form link goes into the passcode-protected payload with
`npm run set-passcode -- --form-url=<admin form> --decision-form-url=<decision form>`). Question titles must be exactly:

| Question | Type |
|---|---|
| `รหัสงานประชุม (key)` | short answer, required (copied from the admin page's "คัดลอก key" button) |
| `ผลการตัดสิน` | multiple choice: `นับ (count)` / `ไม่นับ (no_count)` / `ยกเลิกการตัดสิน (ใช้ผลอัตโนมัติ)` |
| `ชื่องานประชุม (ถ้ายังไม่มีในทะเบียน)` | short answer, optional |
| `สมาคมที่จัดหรือร่วมจัด` | short answer, optional |
| `เหตุผล / หลักฐาน (URL)` | paragraph |

Settings: collect verified email addresses (the email becomes `decided_by`). Only responses whose sender is listed in the `DECISION_ADMINS` GitHub secret (comma-separated e-mails, never committed) are applied; with no list nothing is applied, and skipped rows are logged.
`npm run fetch` (the 03:00 GitHub Actions run, and an hourly run at :15 UTC that fetches only the forms and lecturer submissions) applies the responses to `data/conferences.csv`: the latest
response per key wins, "ยกเลิก" clears the decision, and an unknown key creates a new register row (confidence low)
that the admin's decision then governs. `--only=decisions` runs just this step.

## Tabs and who sees what (merged site, 2026-11-07)

- **ภาพรวม** (public): faculty-level summary only (counts, pie, per-duty bars, outputs per year).
- **สำหรับผู้ดูแลระบบ** (admin passcode, `src/adminGate.tsx`): a "เลือกดู" drop-down switches between
  ข้อมูลอาจารย์ (`#/lecturers`: the per-lecturer 5-year output chart, then every lecturer's duties as cards or a
  table; person pages `#/person/...`) and เพิ่มผลงานด้วยตนเอง (`#/admin`: the add-works and decision forms).
- **Two admin levels** (2026-11-07): level 2 = the existing admin passcode (`adminGate`, everything incl.
  เพิ่มผลงานด้วยตนเอง and conference decisions); level 1 = ข้อมูลอาจารย์ only (`viewerGate`). Set or change the
  level-1 passcode with `npm run set-passcode -- --level=1` (it must differ from level 2); a level-1 user who opens
  เพิ่มผลงาน is asked for the level-2 passcode.
- **ตรวจสอบคุณสมบัติของฉัน** (`#/me`, `src/pages/MyPage.tsx`): a lecturer signs in with their @up.ac.th e-mail and
  sees only their own result.

The passcode and the login hide views in the browser; the data are bundled with the public page and the
repository is public, so this is not access control against someone who reads the source.

**Login**: passwordless (decision 2026-11-06). The page asks the login backend to e-mail a one-time link (valid
15 minutes); the link goes to `/me/#login=<code>`, a small page written by `scripts/build-personal.mjs` that
forwards to `#/me/login=<code>`; the tab exchanges the code for a session (12 hours, or 30 days with
"จำเครื่องนี้") and shows the result of the `name_en` the backend returns.

**Lecturers add their own works** (2026-11-07): after signing in on ตรวจสอบคุณสมบัติของฉัน a lecturer fills
"เพิ่มผลงานของฉัน" (src/pages/MyPage.tsx). The backend (action `submit`) checks the session, so a lecturer can only add
works under their own name, and stores them in the `submissions` sheet as `pending`. Pending works are shown
("รออนุมัติ") but not counted. A level-2 admin approves or rejects them on เพิ่มผลงานด้วยตนเอง (table
"ผลงานที่อาจารย์เพิ่มเอง"); deciding needs the admin's e-mail sign-in and an active row in the `admins` sheet
(email, name, active). Approved works count at once in the browser (src/submissions.ts) and are copied to
`data/self.tsv` by the hourly data job (`fetchSelf` in scripts/fetch-sources.mjs). A lecturer can withdraw a work
while it is pending. To add another approver, add their @up.ac.th address to the `admins` sheet.
**CSV export of a lecturer's works** (2026-11-07): "ดาวน์โหลด CSV" above "ผลงานที่นับ …" writes the table's rows
in the university's Scopus-style import layout (src/exportScopus.ts; template ตัวอย่าง_ไฟล์นำเข้า_Scopus.csv):
the 24 Scopus columns plus "Research ". Issue, pages, article number and the publication date come from
Crossref by DOI (`data/crossref.tsv`, written by `fetchCrossref` in scripts/fetch-sources.mjs: new DOIs are
looked up in the daily and hourly runs, `--only=crossref --refresh-crossref` re-asks all), then from the
Scopus row (`cover_date`, `volume`, `issue`, `page_range`, `article_number` columns of scopus.tsv, filled for
rows fetched after 2026-11-07), then parsed from the venue string. The date is written d/M/yyyy (M/yyyy when
Crossref gives no day) and Month as the English month name. Open access stays empty; pages stay empty for
article-number journals and issue for journals without issues, because no source gives them.
**Withdrawing an approved work** (2026-11-07): on a lecturer's page (ผลงานที่นับ …) a level-2 admin sees "ถอน" on
every approved self-added work (src/WithdrawButton.tsx). It is the backend's `decide` with status `rejected` and
the note "ถอนโดยผู้ดูแลระดับ 2 …", so the work stops counting at once (bundled copies from `data/self.tsv` are
dropped in the browser by `dropUnapproved`, and the hourly job removes them from the file); it can be undone with
"ย้อนเป็นรออนุมัติ" in the approval table (show "ทั้งหมด"). Works from the admin Google Form have no "ถอน" button:
remove them in the form's sheet or with `data/overrides.csv`.
**Reminder e-mails** (2026-11-07): on ข้อมูลอาจารย์ a level-2 admin sees "แจ้งเตือน…" on every lecturer who fails a
duty now or may fail next year (src/NotifyButton.tsx, src/notify.ts). The first click shows the subject and a
ยืนยัน/ยกเลิก pair; confirming sends the message through the backend (action `notify`), which looks the address up
in its private `users` sheet, allows one reminder per lecturer and kind per 12 hours (60 a day in all), and logs it
in the `notices` sheet; the site shows "แจ้งเตือนแล้ว <date>" from the public `noticeList`. The text names the failing
duties, the 5-year counts and the window, and points to ตรวจสอบคุณสมบัติของฉัน for adding works.

**Conference decisions are buttons** (2026-11-07; replaces the decision Google Form): each register row (and the
conference cell of the approval table) has นับ / ไม่นับ / ใช้ผลอัตโนมัติ for a level-2 admin (approval key) or an e-mail admin.
The backend logs every press in the private `conf_decisions` sheet (action `confDecide`; public `confList`); the site
applies the latest press per conference at once (src/confDecisions.ts) and the hourly job writes it into
data/conferences.csv (`fetchConfDecisions`). The old form and DECISION_ADMINS are no longer needed; past form decisions stay.
Pending proceedings/posters also enter the conference register (labelled "รออนุมัติ … (อาจารย์เพิ่มเอง)"), and the
approval table shows each one's conference check with its key, so the conference can be judged first (decision form)
before approving. The iMac's AI screening (scripts/screen-conferences.ts) also queues these conferences.

**Backend** (`apps-script/Code.gs`): a Google Apps Script bound to the private sheet "SEEN Login (private)" in
the admin's Google account, deployed as a web app (execute as me, anyone). Sheets: `users` (email, name_en,
name_th, folder, active — the admin fills it from `npm run personal-codes -- --users`, e-mails guessed from the
name and to be verified), `tokens`, `sessions`, `log`. It sends mail with MailApp (100/day on a Gmail account),
rate-limits link requests to 5 per hour per e-mail, and never serves publication data. Its URL is
`loginApiUrl` in `data/sources.json` and reaches the page as `import.meta.env.VITE_LOGIN_API` (vite.config.ts).
After editing Code.gs: paste into the script editor, Deploy → Manage deployments → edit → new version.

The `folder` column of the users sheet (from `npm run personal-codes -- --users`, which needs the salt) is no longer used by the site.
