# seen-faculty-screening

A static dashboard that screens the lecturers of the School of Energy and Environment (SEEN), University of Phayao, against clause 9 of
**ประกาศคณะกรรมการมาตรฐานการอุดมศึกษา เรื่อง เกณฑ์มาตรฐานหลักสูตรระดับบัณฑิตศึกษา พ.ศ. 2565**
(ราชกิจจานุเบกษา เล่ม 139 ตอนพิเศษ 212 ง, 9 กันยายน 2565, pp. 25–31;
[full text, OPS](https://www.ops.go.th/en/content_page/download/1080/6943/16?method=view)).

It reads each lecturer's Google Scholar list and keeps journal articles and full papers in proceedings. Posters and abstracts are listed but are counted only if you switch them on. It then counts the outputs in the 5-year window and shows met, not met or needs review for every role in 9.1–9.4.

> The screening is automated from Google Scholar data and must be checked against the official publication records before being used in official documents.

Live site (after the first deploy): `https://<github-user>.github.io/seen-faculty-screening/`

## Updating the data

1. Replace or append rows in `data/publications.tsv` (see the Scholar snippet below).
2. Edit `data/faculty.csv` for new lecturers, rank changes or degree years.
3. Copy lines from the site's **รอตรวจสอบ (review queue)** page into `data/overrides.csv`.
4. Commit and push to `main`. GitHub Actions runs the tests, builds the JSON and the site, and deploys it. A malformed file stops the build and the error names the file and line.

To check locally before pushing:

```bash
npm install
npm test
npm run dev        # http://localhost:5173/seen-faculty-screening/
```

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
