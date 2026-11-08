import { useEffect, useState } from "react";
import {
  LEVELS,
  ROLES,
  nextYearRisk,
  toBE,
  type PersonResult,
  type Settings,
  type Status,
} from "../rules";
import { downloadCsv } from "../download";
import {
  Button,
  SHOWN_LEVELS,
  SHOWN_ROLES,
  STATUS_LABEL,
  Segmented,
  StatusChip,
  displayName,
  groupsOf,
  isShownLevel,
  levelGroup,
  roleShort,
  lecturersReturn,
  LEVEL_GROUPS,
  type LevelGroup,
} from "../ui";
import type { LecturerFilter, LecturerScope, LecturerSection, LecturerView } from "../App";
import { LecturerOutputsBlock } from "./Overview";
import { outputRows, outputSegments, type OutputsView } from "../charts";
import { NotifyButton, type NotifyProps } from "../NotifyButton";
import { noticeKind } from "../notify";
import { ProgrammePanel } from "../ProgrammePanel";
import type { Programme } from "../types";

type View = "cards" | "table";

// v3: "คอลัมน์" (one card column per lecturer) is the default, "ตาราง" the matrix (2026-11-05).
const STATE_KEY = "seen-screening-lecturers-v3";
function loadState(): { view: View } {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) ?? "null");
    if (s) return { view: s.view === "table" ? "table" : "cards" };
  } catch {
    /* ignore */
  }
  return { view: "cards" };
}

export function LecturersPage({
  results,
  settings,
  filter: initialFilter = "all",
  scope: initialScope = "all",
  view: initialView,
  section: initialSection,
  onLock,
  notify,
  programme,
}: {
  results: PersonResult[];
  settings: Settings;
  filter?: LecturerFilter;
  scope?: LecturerScope;
  view?: LecturerView;
  section?: LecturerSection;
  onLock?: () => void;
  /** Level-2 reminder e-mails (src/notify.ts); undefined on pages without an admin sign-in. */
  notify?: NotifyProps;
  /** Programme chosen in the admin tab's "หลักสูตร" drop-down; `results` is then its lecturers only. */
  programme?: Programme;
}) {
  const [state, setState] = useState(() =>
    initialView ? { view: initialView } : loadState(),
  );
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<LecturerFilter>(initialFilter);
  const [scope, setScope] = useState<LecturerScope>(initialScope);
  // Switch between the 5-year output chart and the per-duty results (Tum, 2026-11-07).
  // Links that preset a filter or the table view open on the per-duty results.
  const [section, setSection] = useState<LecturerSection>(
    initialSection ?? (initialFilter !== "all" || initialView ? "duties" : "outputs"),
  );
  // Keep the section and filters in the address (replaceState, no new history entry), so the
  // browser's Back from a lecturer's page returns to the same view (Tum, 2026-11-08).
  useEffect(() => {
    const q = new URLSearchParams();
    if (filter !== "all") q.set("filter", filter);
    if (scope !== "all") q.set("scope", scope);
    if (section === "duties") q.set("view", state.view);
    q.set("section", section);
    if (programme) q.set("prog", programme.id);
    const hash = `#/lecturers?${q.toString()}`;
    if (window.location.hash !== hash) history.replaceState(history.state, "", hash);
    lecturersReturn.hash = hash;
  }, [filter, scope, section, state.view, programme]);
  // The outputs chart's switches live here so the CSV can export the chart as shown (2026-11-09).
  const [outView, setOutView] = useState<OutputsView>("research");
  const [outGroup, setOutGroup] = useState<LevelGroup>("ba");
  const update = (s: typeof state) => {
    setState(s);
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  };
  const levels = SHOWN_LEVELS;
  const roles = SHOWN_ROLES;
  // The scope narrows which duties the filter looks at; every level is still displayed.
  const inScope = (level: (typeof SHOWN_ROLES)[number]["level"]) =>
    scope === "all" || levelGroup(level) === scope;
  const scopedRoles = roles.filter((role) => inScope(role.level));
  const matches = (r: PersonResult) =>
    filter === "all"
      ? true
      : filter === "not_met"
        ? scopedRoles.some((role) => r.roles[role.id].status === "not_met")
        : nextYearRisk(r, settings).some(
            (role) => isShownLevel(role.level) && inScope(role.level),
          );
  const needle = q.trim().toLowerCase();
  const shown = [...results]
    .sort((a, b) =>
      (a.person.nameTh || a.person.nameEn).localeCompare(
        b.person.nameTh || b.person.nameEn,
        "th",
      ),
    )
    .filter(
      (r) =>
        !needle ||
        `${r.person.nameTh} ${r.person.nameEn}`.toLowerCase().includes(needle),
    )
    .filter(matches);

  // "ผลงานในช่วง 5 ปี" view: the chart as shown (level, breakdown, chart order).
  const exportOutputs = () => {
    const segs = outputSegments(outView);
    const g = LEVEL_GROUPS.find((x) => x.id === outGroup)!;
    const rows = outputRows(results, settings, outGroup, outView);
    downloadCsv(
      `seen-outputs-${settings.year}-${outGroup}-${outView}${programme ? `-${programme.id}` : ""}.csv`,
      ["name_th", "name_en", ...segs.map((x) => x.th), "รวมที่นับได้", "ไม่แน่ใจ (ยังไม่นับ)", `เกณฑ์ (${g.th})`, "สถานะ"],
      rows.map((x) => [
        x.name,
        x.r.person.nameEn,
        ...segs.map((sg) => x[sg.key]),
        x.research + x.other,
        x.maybe,
        `≥ ${g.rule}`,
        x.failed > 0 ? `ไม่ผ่าน ${x.failed} หน้าที่` : x.risk.length > 0 ? `ปี ${toBE(settings.year + 1)} อาจไม่ผ่าน` : "ผ่าน",
      ]),
    );
  };

  const exportCsv = () =>
    section === "outputs" ? exportOutputs() : downloadCsv(
      `seen-lecturers-${settings.year}${programme ? `-${programme.id}` : ''}.csv`,
      [
        "name_th",
        "name_en",
        "rank",
        "degree",
        "degree_year_ce",
        "outputs_in_window",
        "research_in_window",
        ...roles.map((r) => `${r.clause} ${r.labelEn}`),
      ],
      shown.map((r) => [
        displayName(r.person),
        r.person.nameEn,
        r.person.rank,
        r.person.degree,
        r.person.degreeYear,
        r.roles.ms_program.counts.total,
        r.roles.ms_program.counts.research,
        ...roles.map((role) => STATUS_LABEL[r.roles[role.id].status].th),
      ]),
    );

  return (
    <>
      <div className="print-only print-header">
        <h1>คุณสมบัติอาจารย์รายบุคคล</h1>
        <p>
          ปีที่ประเมิน พ.ศ. {toBE(settings.year)} · ช่วงผลงาน พ.ศ.{" "}
          {toBE(settings.year - 4)}–{toBE(settings.year)} · นับวารสาร และ
          proceedings/โปสเตอร์จากการประชุมที่สมาคมวิชาการ/วิชาชีพด้านสิ่งแวดล้อมหรือพลังงานจัด
        </p>
      </div>
      <div className="section-head">
        <div>
          <h1>ผลงานในช่วง 5 ปี และผลการประเมินของอาจารย์</h1>
        </div>
        <div className="actions no-print">
          <Button onClick={exportCsv}>ดาวน์โหลด CSV</Button>
          <Button onClick={() => window.print()} kind="primary">
            พิมพ์ / PDF
          </Button>
          {onLock && (
            <button type="button" className="btn" onClick={onLock}>
              ออกจากระบบผู้ดูแล
            </button>
          )}
        </div>
      </div>

      {programme && <ProgrammePanel programme={programme} results={results} />}

      <div className="section-switch no-print">
        <Segmented
          label="เลือกมุมมองข้อมูลอาจารย์"
          value={section}
          onChange={setSection}
          options={[
            { id: "outputs", label: "ผลงานในช่วง 5 ปีของอาจารย์แต่ละคน" },
            { id: "duties", label: "ผลการประเมินรายบุคคลตามหน้าที่" },
          ]}
        />
      </div>

      {section === "outputs" && (
        <LecturerOutputsBlock results={results} settings={settings} view={outView} group={outGroup} onView={setOutView} onGroup={setOutGroup} />
      )}

      {section === "duties" && (
        <>
          <div className="block-head lecturers-head">
            <h2 className="block-title">
              ผลการประเมินรายบุคคลตามหน้าที่{" "}
              <small className="title-hint">คลิกชื่อเพื่อดูเหตุผลและรายการผลงาน</small>
            </h2>
          </div>

          <div className="toolbar no-print">
            <input
              id="lecturer-search"
              type="search"
              className="search"
              aria-label="ค้นหาชื่ออาจารย์"
              placeholder="ค้นหาชื่อ…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Segmented
              label="กรอง"
              value={filter}
              onChange={setFilter}
              options={[
                { id: "all", label: "ทั้งหมด" },
                { id: "not_met", label: "มีหน้าที่ไม่ผ่าน" },
                {
                  id: "risk",
                  label: `ปี ${toBE(settings.year + 1)} อาจไม่ผ่าน`,
                },
              ]}
            />
            {filter !== "all" && (
              <Segmented
                label="ระดับที่พิจารณา"
                value={scope}
                onChange={setScope}
                options={[
                  { id: "all", label: "ทุกระดับ" },
                  { id: "ba", label: "ป.ตรี" },
                  { id: "grad", label: "บัณฑิตศึกษา" },
                ]}
              />
            )}
            <Segmented
              label="มุมมอง"
              value={state.view}
              onChange={(v) => update({ ...state, view: v })}
              options={[
                { id: "cards", label: "คอลัมน์" },
                { id: "table", label: "ตาราง" },
              ]}
            />
          </div>

          {shown.length === 0 && (
            <p className="note">ไม่พบอาจารย์ตามเงื่อนไขที่เลือก</p>
          )}

          {state.view === "cards" ? (
            <div className="person-grid">
              {shown.map((r) => (
                <PersonCard
                  key={r.person.nameEn}
                  notify={notify}
                  r={r}
                  levels={levels}
                  settings={settings}
                />
              ))}
            </div>
          ) : (
            <MatrixTable
              notify={notify}
              rows={shown}
              levels={levels}
              roles={roles}
              settings={settings}
            />
          )}
        </>
      )}
    </>
  );
}

function PersonCard({
  r,
  levels,
  settings,
  notify,
}: {
  r: PersonResult;
  levels: (typeof LEVELS)[number][];
  settings: Settings;
  notify?: NotifyProps;
}) {
  const kind = noticeKind(r, settings);
  const risk = nextYearRisk(r, settings).filter((x) => isShownLevel(x.level));
  const p = r.person;
  const c = r.roles.ms_program.counts;
  const statuses = levels.flatMap((l) =>
    ROLES.filter((x) => x.level === l.id).map((x) => r.roles[x.id].status),
  );
  const tally = (s: Status) => statuses.filter((x) => x === s).length;
  const failing = ROLES.filter(
    (x) => isShownLevel(x.level) && r.roles[x.id].status === "not_met",
  );
  const href = `#/person/${encodeURIComponent(p.nameEn)}`;
  // Red = fails a duty now (takes precedence), yellow = passes now but may fail next year (same as the overview chart).
  const frame =
    tally("not_met") > 0 ? "card-fail" : risk.length > 0 ? "card-risk" : "";
  return (
    <article className={`panel person-card ${frame}`}>
      <header>
        <div className="min0">
          <a href={href} className="person-title">
            {displayName(p)}
          </a>
        </div>
        <div className="person-score mono" title="จำนวนหน้าที่ที่ผ่าน">
          <b>{tally("met")}</b>/{statuses.length}
        </div>
      </header>
      {/* Rank, degree and graduation-year tags removed (Tum, 2026-11-07); they stay on the person page */}
      {p.programs.length > 0 && (
        <div className="person-meta">
          {p.programs.map((x) => (
            <span key={x} className="tag tag-accent">
              {x}
            </span>
          ))}
        </div>
      )}
      {failing.length > 0 && (
        <div
          className="risk-note fail-note"
          title={failing.map((x) => `${x.clause} ${x.labelTh}`).join("\n")}
        >
          ✗ ปี {toBE(settings.year)} ไม่ผ่าน ({groupsOf(failing.map((x) => x.level))}){" "}
          {failing.length} หน้าที่
        </div>
      )}
      {risk.length > 0 && (
        <div
          className="risk-note"
          title={risk.map((x) => `${x.clause} ${x.labelTh}`).join("\n")}
        >
          ⚠︎ ถ้าปี {toBE(settings.year + 1)} ไม่มีผลงานเพิ่ม จะไม่ผ่าน (
          {groupsOf(risk.map((x) => x.level))}) {risk.length} หน้าที่
        </div>
      )}
      <div className="person-counts">
        <span>
          ผลงาน 5 ปี <b className="mono">{c.total}</b>
          {c.totalPossible > c.total && (
            <span className="muted"> +{c.totalPossible - c.total}?</span>
          )}
        </span>
        <span>
          งานวิจัย <b className="mono">{c.research}</b>
          {c.researchPossible > c.research && (
            <span className="muted"> +{c.researchPossible - c.research}?</span>
          )}
        </span>
      </div>
      {notify && kind && (
        <NotifyButton r={r} settings={settings} kind={kind} {...notify} />
      )}
      {levels.map((l) => (
        <div key={l.id} className={`role-list level-${l.id}`}>
          <div className="role-list-head">
            {l.th} <span className="eyebrow">ข้อ {l.clause}</span>
          </div>
          {ROLES.filter((x) => x.level === l.id).map((role) => {
            const res = r.roles[role.id];
            return (
              <div
                key={role.id}
                className={`role-item role-item-${res.status}`}
                title={res.reasons.join("\n")}
              >
                <span className="role-item-name">
                  {roleShort(role.id)}
                  {res.path === "new_grad" && <sup>ใหม่</sup>}
                </span>
                <StatusChip status={res.status} />
              </div>
            );
          })}
        </div>
      ))}
      <a href={href} className="card-link no-print">
        ดูเหตุผลและรายการผลงาน →
      </a>
    </article>
  );
}

function MatrixTable({
  rows,
  levels,
  roles,
  settings,
  notify,
}: {
  rows: PersonResult[];
  levels: (typeof LEVELS)[number][];
  roles: typeof ROLES;
  settings: Settings;
  notify?: NotifyProps;
}) {
  return (
    <>
      <div className="table-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th rowSpan={2} className="sticky">
                อาจารย์
              </th>
              {levels.map((l) => (
                <th
                  key={l.id}
                  colSpan={roles.filter((r) => r.level === l.id).length}
                  className={`group group-${l.id}`}
                >
                  {l.th} ({l.clause})
                </th>
              ))}
            </tr>
            <tr>
              {roles.map((r) => (
                <th
                  key={r.id}
                  className={`role-col col-${r.level}`}
                  title={r.labelEn}
                >
                  <span className="clause mono">{r.clause}</span>
                  <span>{roleShort(r.id)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const risk = nextYearRisk(r, settings).filter((x) =>
                isShownLevel(x.level),
              );
              const failing = roles.filter(
                (role) => r.roles[role.id].status === "not_met",
              );
              const fails = failing.length > 0;
              return (
                <tr
                  key={r.person.nameEn}
                  className={fails ? "row-fail" : risk.length ? "row-risk" : ""}
                >
                  <td className="sticky">
                    <a href={`#/person/${encodeURIComponent(r.person.nameEn)}`}>
                      {displayName(r.person)}
                    </a>
                    {fails && (
                      <div
                        className="risk-inline fail-inline"
                        title={failing
                          .map((x) => `${x.clause} ${x.labelTh}`)
                          .join("\n")}
                      >
                        ✗ ไม่ผ่าน ({groupsOf(failing.map((x) => x.level))}){" "}
                        {failing.length} หน้าที่
                      </div>
                    )}
                    {risk.length > 0 && (
                      <div
                        className="risk-inline"
                        title={risk
                          .map((x) => `${x.clause} ${x.labelTh}`)
                          .join("\n")}
                      >
                        ⚠︎ ปี {toBE(settings.year + 1)} อาจไม่ผ่าน (
                        {groupsOf(risk.map((x) => x.level))}) {risk.length} หน้าที่
                      </div>
                    )}
                    {notify &&
                      (() => {
                        const k = noticeKind(r, settings);
                        return k ? <NotifyButton r={r} settings={settings} kind={k} compact {...notify} /> : null;
                      })()}
                  </td>
                  {roles.map((role) => {
                    const res = r.roles[role.id];
                    return (
                      <td key={role.id} className={`cell col-${role.level}`}>
                        <StatusChip
                          status={res.status}
                          compact
                          title={res.reasons.join("\n")}
                        />
                        {res.path === "new_grad" && (
                          <sup title="ผ่านทางเกณฑ์อาจารย์ใหม่">ใหม่</sup>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="legend">
        <span className="lvl-key lvl-key-ba">ปริญญาตรี ข้อ 10.1</span>{" "}
        <span className="lvl-key lvl-key-ms">ปริญญาโท ข้อ 9.3</span>{" "}
        <span className="lvl-key lvl-key-phd">ปริญญาเอก ข้อ 9.4</span> ·{" "}
        <StatusChip status="met" /> <StatusChip status="not_met" /> ·
        แถบซ้ายสีแดง = ไม่ผ่านบางหน้าที่ ·{" "}
        <span className="risk-inline">⚠︎</span> แถบซ้ายสีเหลือง =
        ปีหน้าอาจไม่ผ่านถ้าไม่มีผลงานเพิ่ม · ชี้ที่ช่องเพื่อดูเหตุผล
      </p>
    </>
  );
}
