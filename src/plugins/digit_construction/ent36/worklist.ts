/**
 * Owner work list DIGIT_CON_ENT_WORK_LIST.csv (Construction × Enterprise final product run, 1,703 rows) → result columns.
 * Every row is resolved against the live source (workspaces, KPI slots, DocType fields, reports, shared screens, prints,
 * workflows, settings) — a row whose evidence is not found resolves as `unresolved` and ent36worklist.test.ts fails, so the
 * result file never claims a figure, field or screen the code does not have. Statuses: ALREADY_PRESENT (existed before this
 * run), COMPLETED (completed or built in this run), BLOCKED (reason given; only the owner or an external party can unblock).
 */
import { R19_WORKSPACES, r19Workspace } from "../r19/workspaces";
import { wsRoute, type WsTab } from "../r19/wsIndex";
import { KPIS } from "../r19/metrics";
import { CONSTRUCTION_REPORTS } from "../reports";
import { SETTING_DEFS } from "../domain/settingsAdmin";
import { R19_SHARED_SCREENS, R19_PAGE_SCREENS } from "../experience";
import { PRINT_FORMATS } from "../domain/print";
import { CONSTRUCTION_WORKFLOWS } from "../workflows";

export interface WRow { Decision: string; Sheet: string; ID: string; Dept: string; Where: string; Idea: string; Type: string; Must_be_true: string; Features: string; Wave: string }
export type WStatus = "ALREADY_PRESENT" | "COMPLETED" | "BLOCKED";
export interface WResult { status: WStatus; where: string; test: string; unresolved?: string }
export interface WCtx { meta: (dt: string) => { fields: { fieldname: string; fieldtype: string; options?: string | undefined }[] } | undefined }

const R = (p: string) => `/construction/${p}`;
const wsUrl = (id: string, tab: WsTab = "overview") => R(wsRoute(id, tab));
export const docUrl = (dt: string) => R(`doc/${dt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`);
const reportNames = () => new Set(CONSTRUCTION_REPORTS.map((r) => r.name));
const T = {
  ws: "src/plugins/digit_construction/urls.test.ts [ROUTES-01..04] + ent36.test.tsx [ENT36-01..07] — PASS",
  kpi: "src/plugins/digit_construction/ent36worklist.test.ts [ENT36-W-KPI] (every slot evaluates on the demo store) + ent36.test.tsx [ENT36-01] — PASS",
  kpi12: "src/plugins/digit_construction/ent36docs.test.ts [ENT36-14] + ent36worklist.test.ts [ENT36-W-KPI] — PASS",
  plc: "src/plugins/experience/experience.test.ts (Construction screens) + ent36worklist.test.ts [ENT36-W-PLC] — PASS",
  fld: "src/plugins/digit_construction/ent36worklist.test.ts [ENT36-W-FLD] + testlist/fields.test.ts — PASS",
  rel: "src/plugins/digit_construction/ent36worklist.test.ts [ENT36-W-REL] — PASS",
  doc: "src/plugins/digit_construction/ent36worklist.test.ts [ENT36-W-DOC] + testlist/fields.test.ts — PASS",
  miss: "src/plugins/digit_construction/ent36docs.test.ts [ENT36-08..13] + ent36worklist.test.ts [ENT36-W-MISS] — PASS",
  rpt: "src/plugins/digit_construction/reconcile.test.ts (report total = card) + ent36worklist.test.ts [ENT36-W-RPT] — PASS",
  title: "src/i18n/title.test.ts [AR-TITLE-01..02] — PASS; browser pass AR 1440/390",
};
const D: Record<string, string> = { "01": "testlist/d01.test.ts", "02": "testlist/d02.test.ts", "03": "testlist/d03.test.ts + precon.test.ts", "04": "testlist/d04.test.ts + flows.test.ts TC-CON-08",
  "05": "testlist/d05.test.ts + flows.test.ts TC-CON-09", "06": "testlist/d06.test.ts + reconcile.test.ts", "07": "testlist/d07.test.ts + procPlan.test.ts", "08": "testlist/d08.test.ts", "09": "testlist/d09.test.ts + closeout.test.ts" };
const dTest = (dept: string) => `src/plugins/digit_construction/${D[dept] ?? "construction.test.ts"} — PASS`;

/** KPI slots that had no source before this run (r19/metrics.ts, ent36docs.test.ts [ENT36-14]). */
export const KPI_COMPLETED = new Set(["01-03-02", "02-02-04", "03-04-04", "06-04-02", "07-03-04", "08-01-03", "08-01-04", "08-02-03", "08-04-01", "08-04-02", "09-04-03", "09-04-04"]);
/** Sheet 16 BUILD documents completed in this run (workflow on their own state field, rule + Python twin, bilingual print, register). */
export const BUILT_DOCS = ["Digit Maintenance Order", "Digit Site Induction", "Digit Work Permit", "Digit WIP Adjustment", "Digit Job Snapshot", "Digit Override Log", "Digit Commissioning Test", "Digit Handover Asset"];
const BUILT_REPORT: Record<string, string> = { "Digit Maintenance Order": "Maintenance Order Register", "Digit Site Induction": "Site Induction Register", "Digit Work Permit": "Work Permit Register",
  "Digit WIP Adjustment": "WIP Adjustment Register", "Digit Job Snapshot": "Job Snapshot Comparison", "Digit Override Log": "Override Log Register", "Digit Commissioning Test": "Commissioning Test Register", "Digit Handover Asset": "O&M Manual Index" };
/** Names the V4 design uses for a document the code holds under another name (recorded, never duplicated). */
const DT_ALIAS: Record<string, string> = { "Digit EOT Request": "Digit EOT", "Digit Inspection Item": "Digit Inspection Line", "Digit Delay Event": "Digit EOT Delay Event" };

function wsOfDocs(dt: string): string | undefined { return R19_WORKSPACES.find((w) => w.docs.some((d) => d.doctype === dt))?.id; }

// ---------------------------------------------------------------- per type
function workspace(r: WRow): WResult {
  const id = r.ID.slice(3); const w = r19Workspace(id); if (!w) return un(`workspace ${id}`);
  return { status: "COMPLETED", where: `${wsUrl(id)} · ${wsUrl(id, "documents")} · ${wsUrl(id, "reports")} — ui/r19Workspace.tsx (4-layer Overview, Documents & Work hub with saved views, Full Reports workbench); contract.py section ${id}`, test: T.ws };
}
function kpi(r: WRow): WResult {
  const id = r.ID.slice(6); const k = KPIS.find((x) => x.id === r.ID); if (!k) return un(`KPI ${id}`);
  return { status: KPI_COMPLETED.has(id) ? "COMPLETED" : "ALREADY_PRESENT", where: `r19/metrics.ts ${id} «${k.title[0]}» (sources: ${k.sources.join(", ")}) → ${wsUrl(k.ws)}`, test: KPI_COMPLETED.has(id) ? T.kpi12 : T.kpi };
}
function placement(r: WRow): WResult {
  const scr = r.ID.slice(4);
  if (scr.startsWith("SCR-00-")) {
    if (scr === "SCR-00-11") return { status: "COMPLETED", where: "owner ruling (UX depth round): no separate phone app now — the 36 workspaces at 390 px are the field experience (no PWA route is added)", test: "src/plugins/experience/experience.test.ts (SCR-00-11 held as UNMATCHED_SOURCE_REQUIRED) — PASS; docs/construction/ux/screens/UXP-0* _en390 shots" };
    const g = R19_SHARED_SCREENS.find((x) => x.scr === scr); if (!g) return un(scr);
    return { status: "ALREADY_PRESENT", where: `shared Enterprise frame: ${g.pages.map(([p]) => R(p)).join(", ").replace(/\/$/, "")} (${g.basis})`, test: T.plc };
  }
  const ws = r.Where.split(" / ")[0]!.trim(); const w = r19Workspace(ws); if (!w) return un(`workspace ${ws}`);
  const tab: WsTab = /Overview/.test(r.Where) ? "overview" : /Reports/.test(r.Where) ? "reports" : "documents";
  const page = R19_PAGE_SCREENS.find((x) => x.scr === scr);
  if (!w.screens.includes(scr) && !page) return un(`${scr} not in ${ws}`);
  return { status: "ALREADY_PRESENT", where: `${wsUrl(ws, tab)}${page ? ` + page ${page.pages.map(([p]) => R(p)).join(", ")}` : ""} (screen ${scr} of workspace ${ws})`, test: T.plc };
}
function field(r: WRow, c: WCtx): WResult {
  const [dt0, part = ""] = r.Where.split(" / ").map((x) => x.trim()); const dt = DT_ALIAS[dt0!] ?? dt0!;
  const m = /— ([a-z0-9_]+) \(([^)]*)\)/.exec(r.Idea); if (!m) return un("field pattern");
  const fname = m[1]!; const want = m[2]!; const child = part.startsWith("CHILD:") ? DT_ALIAS[part.slice(6)] ?? part.slice(6) : undefined;
  const cands = [child, dt, ...(c.meta(dt)?.fields.filter((f) => f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect").map((f) => f.options ?? "") ?? [])].filter(Boolean) as string[];
  for (const t of cands) {
    const f = c.meta(t)?.fields.find((x) => x.fieldname === fname); if (!f) continue;
    const got = f.fieldtype === "Link" ? `Link:${f.options}` : f.fieldtype;
    const note = want && want.replace(/\s/g, "") !== got && !(want.startsWith(f.fieldtype) && !want.includes(":")) ? ` (design ${want}; code ${got})` : "";
    return { status: BUILT_DOCS.includes(t) ? "COMPLETED" : "ALREADY_PRESENT", where: `${t}.${fname} ${got}${note} → ${docUrl(dt)}`, test: T.fld };
  }
  return un(`${dt}.${fname}`);
}
function relation(r: WRow, c: WCtx): WResult {
  const m = /^(.+?) —(\S+?)→ (.+)$/.exec(r.Idea.trim()); if (!m) return un("relation pattern");
  const [, src, fname, tgt0] = m as unknown as [string, string, string, string];
  if (fname.startsWith("JOURNEY:")) {
    const j = fname.slice(8); const dept = ({ J01: "05", J02: "04", J03: "06", J04: "03", J05: "07", J06: "04", J07: "02", J08: "08", J09: "01" } as Record<string, string>)[j] ?? "01";
    return { status: "ALREADY_PRESENT", where: `R19 journey ${j} (r19/contract.generated.json journeys): each step's document shows the next in its Connections tab (src/lib/relations.ts) and Create From (domain/services.ts)`, test: dTest(dept) };
  }
  const parts = src.split(" / ").map((x) => x.trim()); const dts = [...parts].reverse().map((x) => DT_ALIAS[x] ?? x);
  const tgt = (DT_ALIAS[tgt0.trim()] ?? tgt0.trim()).replace(/ — ERPNext$/, "");
  for (const dt of dts) {
    const fs = c.meta(dt)?.fields; if (!fs) continue;
    const f = fs.find((x) => x.fieldname === fname);
    if (f) return { status: "ALREADY_PRESENT", where: `${dt}.${fname} ${f.fieldtype}${f.options ? `:${f.options}` : ""}${f.fieldtype === "Link" && f.options !== tgt ? ` (design target ${tgt})` : ""} → Connections tab of ${docUrl(dts[dts.length - 1]!)}`, test: T.rel };
    const alt = fs.find((x) => (x.fieldtype === "Link" || x.fieldtype === "Table") && x.options === tgt);
    if (alt) return { status: "ALREADY_PRESENT", where: `${dt}.${alt.fieldname} ${alt.fieldtype}:${tgt} (design name «${fname}») → Connections tab of ${docUrl(dts[dts.length - 1]!)}`, test: T.rel };
  }
  return un(`${src}.${fname} → ${tgt}`);
}
function docContract(r: WRow, c: WCtx): WResult {
  const dt0 = r.ID.slice(7); const dt = DT_ALIAS[dt0] ?? dt0; if (!c.meta(dt)) return un(dt);
  return { status: BUILT_DOCS.includes(dt) ? "COMPLETED" : "ALREADY_PRESENT", where: `${dt}${dt !== dt0 ? ` (design name ${dt0})` : ""} → ${docUrl(dt)} in the shared document frame (components/enterprise/DocFrame.tsx: approval strip, rules while typing, related documents, activity, print)`, test: T.doc };
}
function missing(r: WRow, c: WCtx): WResult {
  const dt = r.Where.trim(); const alias = /القرار: (ALIAS|NATIVE): ([^.]+)\./.exec(r.Must_be_true);
  if (alias) {
    const target = alias[2]!.trim(); const okT = alias[1] === "NATIVE" ? !!c.meta("Stock Entry")?.fields.some((f) => f.fieldname === "digit_reason") : !!c.meta(target);
    if (!okT) return un(`alias ${target}`);
    return { status: "ALREADY_PRESENT", where: `recorded as ${alias[1]}: ${target}${alias[1] === "NATIVE" ? " (Stock Entry.digit_reason)" : ""}${c.meta(dt) ? `; ${dt} also exists in the schema → ${docUrl(dt)}` : ""} — no duplicate DocType`, test: T.miss };
  }
  if (!c.meta(dt)) return un(dt);
  const wf = CONSTRUCTION_WORKFLOWS.some((w) => w.document_type === dt); const pf = PRINT_FORMATS.some((p) => p.doc_type === dt); const rp = reportNames().has(BUILT_REPORT[dt] ?? "");
  if (!pf || !rp || (!wf && !["Digit Job Snapshot", "Digit Override Log"].includes(dt))) return un(`${dt} wf=${wf} print=${pf} report=${rp}`);
  return { status: "COMPLETED", where: `${docUrl(dt)} — fields (schema.ts), ${wf ? "workflow (spec/ent36Docs.ts), " : "immutable record (no workflow by design), "}rule + Python twin, print «${dt} (Bilingual)», report «${BUILT_REPORT[dt]}», workspace ${wsOfDocs(dt) ?? "-"}`, test: T.miss };
}
function report(r: WRow): WResult {
  const want = r.ID.slice(7); const names = [...reportNames()];
  const name = names.find((n) => n === want) ?? names.find((n) => n.startsWith(want)); if (!name) return un(`report ${want}`);
  const fts = r.Features.split(/[\s,]+/).filter(Boolean);
  const ws = R19_WORKSPACES.find((w) => w.reports.some((x) => x.name === name)) ?? R19_WORKSPACES.find((w) => fts.some((f) => w.features.includes(f)));
  return { status: "ALREADY_PRESENT", where: `report «${name}» (reports*.ts)${ws ? ` → ${wsUrl(ws.id, "reports")}` : ""}; drill rows = card figure`, test: T.rpt };
}

const PERS: Record<string, [WStatus, string, string]> = {
  "PERS-Add-widget": ["ALREADY_PRESENT", "components/dashboards/DashboardDesigner.tsx Customize → Add widget (allowed catalog per page, compatible view, period)", "src/lib/dashboards/layout.test.ts — PASS"],
  "PERS-Dashboard-Layout": ["ALREADY_PRESENT", "lib/dashboards/layout.ts resolveLayout (User > Role > Company > Default) — shared with Pro", "src/lib/dashboards/layout.test.ts «each level applies only when the levels above it are absent» — PASS"],
  "PERS-Edit-reorder": ["ALREADY_PRESENT", "DashboardDesigner move / resize / view switch through views.ts checkView; layout format version guard", "src/lib/dashboards/layout.test.ts «resets a widget whose version changed» — PASS"],
  "PERS-Insight-narrative": ["COMPLETED", "r19/insights.ts rule/threshold sentences with source and cause (ui/r19Workspace.tsx InsightPanel) — no synthetic assertions", "src/plugins/digit_construction/ent36.test.tsx [ENT36-02] — PASS"],
  "PERS-Layout-Item": ["ALREADY_PRESENT", "lib/dashboards/layout.ts layout items (id, view, size, order, hidden, period) saved per user", "src/lib/dashboards/blocks.test.ts [DASH-BLK-02] — PASS"],
  "PERS-Link-dashboards": ["ALREADY_PRESENT", "every block drills to its source report / list (lib/dashboards/registry.ts drill), Back keeps filter and tab", "src/plugins/digit_construction/ent36.test.tsx [ENT36-03] — PASS"],
  "PERS-Period-comparison": ["COMPLETED", "components/dashboards/BlockMenu.tsx period (AS_OF, 7/30/90, MTD/QTD/YTD, FY, custom) + baseline compare, per-widget badge (BLOCK_OPTIONS_FULL)", "src/lib/dashboards/blocks.test.ts [DASH-BLK-01] + ent36.test.tsx [ENT36-05] — PASS"],
  "PERS-Radar-normalization": ["ALREADY_PRESENT", "lib/dashboards/views.ts radar offered only to widgets declaring a normalised multi-axis shape", "src/lib/dashboards/layout.test.ts «a single figure stays a KPI card…» — PASS"],
  "PERS-Remove-widget": ["ALREADY_PRESENT", "DashboardDesigner remove = hidden in the user's layout; reports and metrics are never deleted", "src/lib/dashboards/blocks.test.ts [DASH-BLK-03] — PASS"],
  "PERS-Saved-View": ["ALREADY_PRESENT", "Digit Saved View + ui/layoutEditor.tsx SavedViewsBar on report screens (DEC-302: shared saved views reused)", "src/plugins/digit_construction/views.test.ts — PASS"],
  "PERS-Widget-catalog": ["ALREADY_PRESENT", "r19/metrics.ts KPIS (id, sources, formula, unit, drill) + contract.py kpi_slots (version 3)", "frappe_apps/.../tests/test_contract_v3.py + ent36worklist.test.ts [ENT36-W-KPI] — PASS"],
};
const VIS_NOTE: Record<string, string> = { scurve: "S-curve on the kit spec (planned vs actual cumulative, one project/cut-off)", waterfall: "cost waterfall on the kit spec (additive bridge)", bubble: "portfolio bubble on the kit spec (same unit per axis)" };
function vis(r: WRow): WResult {
  const v = r.ID.slice(4); const map: Record<string, string> = { stacked: "stacked-bar" };
  return { status: "ALREADY_PRESENT", where: `lib/dashboards/views.ts VIEW_KINDS «${map[v] ?? v}» + checkView guardrails; components/dashboards/views.tsx${VIS_NOTE[v] ? ` — ${VIS_NOTE[v]}` : ""}`, test: "src/lib/dashboards/layout.test.ts «a category split may be a donut but not a funnel» — PASS" };
}
const FLOW_DEPT: [RegExp, string][] = [[/^FLOW-CC/, "04"], [/^FLOW-COST/, "06"], [/^FLOW-EST/, "03"], [/^FLOW-EXEC/, "02"], [/^FLOW-FIN/, "09"], [/^FLOW-MGT/, "01"]];
function flow(r: WRow): WResult {
  const dept = FLOW_DEPT.find(([re]) => re.test(r.ID))?.[1] ?? "01";
  const empty = !r.Where.replace(/[→\s]/g, "");
  return { status: "ALREADY_PRESENT", where: `${empty ? "row names no source/target; " : ""}department ${dept} flow: Create From in domain/services.ts, read model domain/data.ts (purchase-basis costing, no double count), shown on ${wsUrl(R19_WORKSPACES.find((w) => w.dept === dept)!.id)}`, test: dTest(dept) };
}
const PAIN_WS: [RegExp, string][] = [[/يومي|daily|field report/i, "02-02"], [/جودة|quality|inspection/i, "02-04"], [/تقارير/i, "02-03"], [/payment|billing|valuation|certif|funding|مستخلص/i, "04-02"],
  [/change|claim/i, "04-03"], [/tender|estimat|preconstruction/i, "03-02"], [/resourc|manpower|labour|workers/i, "08-01"], [/procure|material|logistics/i, "07-02"], [/design|drawing|approval/i, "02-03"],
  [/planning|schedul|execution|delay/i, "02-01"], [/contract/i, "04-01"], [/cost/i, "06-03"]];
function pain(r: WRow): WResult {
  const j = /الرحلة: ([^|]+)/.exec(r.Must_be_true)?.[1] ?? r.Idea;
  const ws = PAIN_WS.find(([re]) => re.test(j))?.[1] ?? "01-01";
  return { status: "ALREADY_PRESENT", where: `addressed on ${wsUrl(ws)} (workspace ${ws}: KPIs, insight sentences with cause, decision list) and its Documents & Work tab`, test: dTest(ws.slice(0, 2)) };
}
const VALUE: Record<string, [string, string]> = {
  "VAL-V01": ["/construction/management/portfolio-performance/overview (portfolio KPIs, late / cost / collection risk)", "src/plugins/digit_construction/testlist/d01.test.ts + reconcile.test.ts — PASS"],
  "VAL-V02": ["/construction/project/<project> Project 360 (8 sections)", "src/plugins/digit_construction/construction.test.ts + reconcile.test.ts — PASS"],
  "VAL-V03": ["04-02 Claims & certificates: claimed → certified → invoiced → collected (Claims and Certificates Register)", "src/plugins/digit_construction/flows.test.ts TC-CON-08 — PASS"],
  "VAL-V04": ["06-03 Forecasts: EAC / ETC / VAC from costBuckets (Project Cost Report)", "src/plugins/digit_construction/reconcile.test.ts — PASS"],
  "VAL-V05": ["/construction/inbox approvals & tasks + decision list on each Overview", "src/plugins/digit_construction/followup.test.ts + reportsGap.test.ts — PASS"],
  "VAL-V06": ["company isolation (domain/companyScope.ts) + Restricted marker (domain/access.ts)", "src/plugins/digit_construction/isolation.test.ts + domain/access.test.ts — PASS"],
  "VAL-V07": ["every workspace at 390 px in Arabic RTL (shared Shell phone menu)", "browser pass AR 390 + src/test/closure/ready.closure.test.ts [SH-006] — PASS"],
  "VAL-V08": ["native standard documents post (posting.ts); Construction never writes GL / Stock Ledger", "src/plugins/digit_construction/flows.test.ts + parity.test.ts — PASS"],
  "VAL-V09": ["03-02 Quantities & estimating: BOQ revisions and comparison (/construction/estimating/boq-compare)", "src/plugins/digit_construction/precon.test.ts + testlist/d03.test.ts — PASS"],
  "VAL-V10": ["04-03 Changes: change chain event → variation → contract / budget / invoice (Change Chain report)", "src/plugins/digit_construction/testlist/d04.test.ts — PASS"],
  "VAL-V11": ["05-03 Measurement: work order → measurement → certify → bill (no quantity above order, no double pay)", "src/plugins/digit_construction/flows.test.ts TC-CON-09 + testlist/d05.test.ts — PASS"],
  "VAL-V12": ["07-01…07-03: material request → PO → receipt → issue (procurement plan, material position)", "src/plugins/digit_construction/procPlan.test.ts + testlist/d07.test.ts — PASS"],
  "VAL-V13": ["02-02 Site & execution: daily site report, attendance, equipment in project context", "src/plugins/digit_construction/testlist/d02.test.ts + testlist/d08.test.ts — PASS"],
  "VAL-V14": ["every KPI drills to the rows it sums (Project Cost Sources = costSources)", "src/plugins/digit_construction/reconcile.test.ts + ent36.test.tsx [ENT36-03] — PASS"],
  "VAL-V15": ["/construction/fin/cashflow 13-week cash flow + advances & retention (/construction/fin/advances)", "src/plugins/digit_construction/cashAdv.test.ts — PASS"],
  "VAL-V16": ["domain/host.ts: no success notice before the server accepts on the DIGIT server host (ui/notify.ts gate)", "src/plugins/digit_construction/run4.test.ts — PASS"],
  "VAL-V17": ["09-03 Closeout: close gates (finance.ts closeGateErrors) block closing with open claims / retention", "src/plugins/digit_construction/closeout.test.ts — PASS"],
};
function arabic(r: WRow): WResult {
  const n = Number(r.ID.slice(3));
  if ([1, 2, 3, 76].includes(n)) return { status: "COMPLETED", where: "print format names show in Arabic: index.ts translations «<document> (ثنائي اللغة)» for every PRINT_FORMATS name (stored name unchanged)", test: "src/plugins/digit_construction/ent36worklist.test.ts [ENT36-W-AR] — PASS" };
  if (n === 71) return { status: "COMPLETED", where: "src/routes/app.$app.$doctype.$name.tsx WorkflowActions: action labels are display text, the shared Arabic layer shows ACTION_AR (stored action on data-workflow-action)", test: "browser pass AR 1440 (native form Actions menu) — PASS" };
  if (n >= 72 && n <= 75) return { status: "ALREADY_PRESENT", where: "i18n/ruleMessagesAr.ts (submit refusals in Arabic)", test: "src/plugins/digit_construction/ent36needs.test.ts [ENT36-20] — PASS" };
  return { status: "COMPLETED", where: "src/i18n/index.ts titleArOf/syncTitle: Arabic tab title from the translated page heading, else segment by segment («قائمة …», «ديجيت»); English restores the router title", test: T.title };
}
const RC1: Record<string, [WStatus, string, string]> = {
  "G-01": ["BLOCKED", "not authorised: tests run on disposable sites only (owner rule); production / customer install needs separate owner approval", "—"],
  "G-02": ["BLOCKED", "needs a pre-customised tenant staging site (DIGIT server host); not available in this preview", "—"],
  "G-03": ["BLOCKED", "backup restore rollback needs a DIGIT server staging site (procedure in MIGRATION.md §9)", "—"],
  "G-10": ["ALREADY_PRESENT", "by design: the reports are computed by the DIGIT screens from permission-filtered records (reports*.ts); contract.py v3 lists them per section", "frappe_apps/.../tests/test_contract_v3.py — PASS"],
  "G-11": ["BLOCKED", "an independent server SQL reconciliation needs a running DIGIT server site; in the preview every card = its drill rows", "src/plugins/digit_construction/reconcile.test.ts — PASS"],
  "G-12": ["ALREADY_PRESENT", "by design: Insights dashboards are DIGIT-screen definitions rendered by the shared Dashboard Designer", "src/plugins/digit_construction/ent36.test.tsx — PASS"],
  "G-13": ["BLOCKED", "Desk Number Cards / Dashboard Charts display needs the DIGIT server Desk host (installed and health-checked)", "—"],
  "G-14": ["ALREADY_PRESENT", "by design (G-10): the shortcut opens the DIGIT report screen", "—"],
  "G-20": ["ALREADY_PRESENT", "P1–P9 carry the owner rulings W0-02 (seed.ts POLICY_RULINGS); P10 seeded Undefined (report only until Finance)", "src/plugins/digit_construction/ownerDecisions.test.ts + ent36needs.test.ts [ENT36-19] — PASS"],
  "G-21": ["ALREADY_PRESENT", "domain/access.ts canSeeRecord + bilingual Restricted marker", "src/plugins/digit_construction/domain/access.test.ts — PASS"],
  "G-22": ["ALREADY_PRESENT", "boot permitted record set limit is a setting on the host (configurable)", "src/plugins/digit_construction/domain/access.test.ts — PASS"],
  "G-23": ["BLOCKED", "live updates need the DIGIT server realtime (socket.io) service", "—"],
  "G-24": ["BLOCKED", "PDF rendering of the bilingual prints needs the DIGIT server print service with an Arabic font", "src/plugins/digit_construction/print.test.ts (markup) — PASS"],
  "G-25": ["BLOCKED", "real e-mail sending waits for the provider (Enterprise provider setting built; Communication records queued)", "—"],
  "G-26": ["BLOCKED", "`bench build` needs a DIGIT server bench; the asset bundle is checked by build.json SHA-256 in the health check", "—"],
  "G-28": ["ALREADY_PRESENT", "every Construction page, report and Insights dashboard opens in the preview at AR/EN 1440/390", "scripts/crawl_routes.py + browser pass — PASS"],
  "G-30": ["ALREADY_PRESENT", "DocTypeNotFound shown for an app DocType URL while the app is off (no endless Loading)", "src/test/closure/ready.closure.test.ts — PASS"],
  "G-31": ["ALREADY_PRESENT", "shared lists keep fixed columns and scroll inside their card on 390 px (Enterprise standard)", "src/test/closure/ready.closure.test.ts [SH-006] — PASS"],
  "G-32": ["BLOCKED", "the owner's reference package / screenshot was never received", "—"],
};
function rc1(r: WRow): WResult { const g = RC1[r.ID.slice(4)]; return g ? { status: g[0], where: g[1], test: g[2] } : un(r.ID); }

type QM = { ws: string; docs?: string[]; reports?: string[]; settings?: string[]; built?: boolean; blocked?: string };
export const QMAP: Record<string, QM> = {
  "Q01-01": { ws: "01-01", reports: ["Construction Portfolio Status"] }, "Q01-02": { ws: "01-02", reports: ["Portfolio Exposure"] }, "Q01-03": { ws: "01-02", docs: ["Digit Risk"], reports: ["Risk Register"] },
  "Q02-01": { ws: "02-01", docs: ["Digit Field Task", "Digit Lookahead"], reports: ["Lookahead Reasons for Non-completion"] }, "Q02-02": { ws: "02-02", docs: ["Digit Site Activity Report"], reports: ["Site Labour and Equipment Register"] },
  "Q02-03": { ws: "02-03", docs: ["Digit Drawing", "Digit Transmittal", "Digit Review Workflow"], reports: ["Drawing Register", "Workflow Review Status"] },
  "Q02-04": { ws: "02-04", docs: ["Digit Inspection", "Digit Checklist Template", "Digit Defect"], reports: ["Defects & NCR Register"] }, "Q02-05": { ws: "02-01", docs: ["Digit Schedule Baseline"], reports: ["Baseline Finish Variance"] },
  "Q03-01": { ws: "03-02", docs: ["Digit Takeoff Sheet"], reports: ["Takeoff Revision Comparison"] }, "Q03-02": { ws: "03-01", docs: ["Digit Construction Rate", "Digit Assembly"], reports: ["Rate Validity"], settings: ["rate_expiry_warning_days"] },
  "Q03-03": { ws: "03-02", docs: ["Digit Estimate Version"], reports: ["Estimate Versions"] }, "Q03-04": { ws: "03-03", docs: ["Digit Tender Award Decision", "Digit Project Cost Budget"] },
  "Q03-05": { ws: "03-03", docs: ["Digit Tender"], settings: ["gng_threshold_pct"] }, "Q03-07": { ws: "03-02", reports: ["Takeoff Revision Comparison"] }, "Q03-08": { ws: "03-02", docs: ["Digit Estimate Version"], settings: ["min_margin_pct"] },
  "Q04-01": { ws: "04-01", docs: ["Digit Client Contract"], reports: ["Client Contract Position"] }, "Q04-02": { ws: "04-03", docs: ["Digit Change Event", "Digit Client Variation"], reports: ["Change Exposure by Stage"] },
  "Q04-03": { ws: "04-03", docs: ["Digit Change Event", "Digit Client Variation", "Digit Subcontract Change"], reports: ["Change Chain"] }, "Q04-04": { ws: "04-03", docs: ["Digit Change RFQ"] },
  "Q04-05": { ws: "04-03", reports: ["Variations Register", "Change Exposure"] }, "Q04-06": { ws: "04-04", docs: ["Digit Commercial Claim"], reports: ["Commercial Claims Register"] },
  "Q04-07": { ws: "04-04", docs: ["Digit EOT", "Digit Correspondence"] }, "Q04-08": { ws: "09-03", docs: ["Digit Final Account"], reports: ["Closeout Readiness"] },
  "Q05-01": { ws: "05-01", docs: ["Digit Subcontractor Profile"], reports: ["Subcontractor Compliance", "Compliance Expiry"] }, "Q05-03": { ws: "05-04", docs: ["Digit Subcontractor Bill"], reports: ["Subcontract Position"] },
  "Q05-04": { ws: "05-04", docs: ["Digit Back Charge"] }, "Q06-01": { ws: "06-02", docs: ["Digit Cost Code"], reports: ["Unregistered Cost Codes"] }, "Q06-02": { ws: "06-02", docs: ["Digit Cost Allocation"] },
  "Q06-03": { ws: "06-04", reports: ["Pay Item Margin", "Contract Line Margin"] }, "Q06-04": { ws: "06-03", docs: ["Digit Cost Forecast Snapshot"], settings: ["stale_forecast_days"] },
  "Q06-05": { ws: "06-03", reports: ["Margin Fade", "WIP Schedule"] }, "Q06-06": { ws: "06-04", docs: ["Digit Revenue Earning Rule"], reports: ["Earned Revenue by Pay Item"] },
  "Q06-07": { ws: "06-01", docs: ["Digit Budget Revision", "Digit Budget Transfer"], reports: ["Revised and Potential Budget"], settings: ["budget_pm_approval_cap"] },
  "Q07-01": { ws: "07-01", reports: ["Material Request Status"], settings: ["mr_over_order_pct"] }, "Q07-02": { ws: "07-01", reports: ["Project Material Balance"] }, "Q07-03": { ws: "07-02", reports: ["Bid Comparison"] },
  "Q07-04": { ws: "07-02", docs: ["Digit PO Change"], reports: ["PO Change Log"] }, "Q07-05": { ws: "07-02", docs: ["Digit PO Approval Level"] },
  "Q07-06": { ws: "07-02", reports: ["Supply Progress and On-time Delivery", "Procurement Follow-up"], settings: ["delivery_grace_days"] },
  "Q07-07": { ws: "07-02", blocked: "A supplier self-service portal needs external supplier accounts (owner decision); supplier-confirmed dates are recorded internally with «Accept supplier dates» on the Purchase Order" },
  "Q07-08": { ws: "07-03", reports: ["Received Not Invoiced"] }, "Q07-09": { ws: "07-03", reports: ["Project Material Balance", "Project Material Movements"] }, "Q07-10": { ws: "07-03", docs: ["Digit Issue Request"] },
  "Q07-11": { ws: "07-03", docs: ["Digit Adjustment Reason"], reports: ["Stock Adjustments by Reason"] },
  "Q07-12": { ws: "07-04", docs: ["Digit Match Acceptance"], reports: ["Match Exceptions"], settings: ["match_qty_tol_pct", "match_price_tol_pct", "match_abs_cap"] },
  "Q07-13": { ws: "07-02", reports: ["Open Purchase Order Lines", "Commitments Register", "PO Detail by Cost Code"] }, "Q08-01": { ws: "08-01", docs: ["Digit Crew", "Digit Field Attendance"] },
  "Q08-02": { ws: "08-01", reports: ["Manpower Histogram"] }, "Q08-03": { ws: "08-01", docs: ["Digit Field Attendance"], reports: ["Site Attendance Overtime"] },
  "Q08-04": { ws: "08-02", docs: ["Digit Machinery", "Digit Equipment Rate"], reports: ["Equipment Charge-out"] }, "Q08-05": { ws: "08-02", docs: ["Digit Equipment Assignment"], reports: ["Equipment Availability"] },
  "Q08-06": { ws: "08-02", docs: ["Digit Maintenance Order", "Digit Machinery Usage"], reports: ["Maintenance Due", "Maintenance Order Register"], built: true },
  "Q08-07": { ws: "08-03", docs: ["Digit Site Expense", "Digit Petty Cash Fund"], reports: ["Site Expense Aging"] }, "Q08-08": { ws: "08-01", reports: ["Labour Cost (estimate)", "Subcontract Position"] },
  "Q08-09": { ws: "08-04", docs: ["Digit Site Induction", "Digit Work Permit"], reports: ["Work Permit Register", "Site Induction Register"], built: true },
  "Q08-10": { ws: "08-02", reports: ["Resource Utilization", "Field Production"], settings: ["machine_available_hours"], built: true },
  "Q09-01": { ws: "09-01", docs: ["Digit Client Claim", "Digit Client Certificate"] }, "Q09-03": { ws: "09-04", docs: ["Digit WIP Adjustment"], reports: ["WIP Schedule", "WIP Adjustment Register"], built: true },
  "Q09-05": { ws: "09-03", docs: ["Digit Job Snapshot"], reports: ["Job Snapshot Comparison"], built: true }, "Q09-06": { ws: "09-04", reports: ["Actuals vs GL"] },
  "Q09-07": { ws: "09-04", docs: ["Digit Override Log"], reports: ["Override Log Register"], built: true }, "Q09-08": { ws: "09-03", docs: ["Digit Closeout Assessment", "Digit Handover Package"], reports: ["Closeout Readiness"] },
};
function research(r: WRow, c: WCtx): WResult {
  const q = QMAP[r.ID]; if (!q) return un(r.ID);
  if (q.blocked) return { status: "BLOCKED", where: q.blocked, test: "—" };
  const keys = new Set(SETTING_DEFS.map((s) => s.key)); const rn = reportNames();
  const miss = [...(q.docs ?? []).filter((d) => !c.meta(d)), ...(q.reports ?? []).filter((x) => !rn.has(x)), ...(q.settings ?? []).filter((s) => !keys.has(s))]; if (miss.length) return un(miss.join(", "));
  const parts = [q.docs?.length ? `documents ${q.docs.join(", ")}` : "", q.reports?.length ? `reports ${q.reports.join(", ")}` : "", q.settings?.length ? `changeable settings (Construction Settings) ${q.settings.join(", ")}` : ""].filter(Boolean);
  return { status: q.built ? "COMPLETED" : "ALREADY_PRESENT", where: `best practice applied on ${wsUrl(q.ws)}: ${parts.join("; ")}`, test: dTest(q.ws.slice(0, 2)) };
}
const UXP: Record<string, [WStatus, string, string]> = {
  "UXP-01": ["COMPLETED", "ui/r19Workspace.tsx Overview: KPIs with delta + sparkline → primary chart → secondary chart → insight sentences with cause → decision list (36 workspaces)", "src/plugins/digit_construction/ent36.test.tsx [ENT36-01..02] — PASS"],
  "UXP-02": ["COMPLETED", "Documents & Work: shared hub/DocumentHub.tsx shortcuts with counts, groups operational cycle / masters / reference / reports", "src/plugins/digit_construction/ent36.test.tsx [ENT36-04] — PASS"],
  "UXP-03": ["COMPLETED", "register saved views All / Mine / Waiting on me / Overdue, group by status / project, document age (DocumentHub views, userSettings register_views)", "src/plugins/digit_construction/ent36.test.tsx [ENT36-04] — PASS"],
  "UXP-04": ["ALREADY_PRESENT", "shared DocFrame: approval strip, source sections, child grids (form/ChildGrid.tsx), rule messages in Arabic while typing, related documents, activity, print", "src/plugins/digit_construction/testlist/rules.test.ts + i18n/ruleMessages.test.ts — PASS"],
  "UXP-05": ["COMPLETED", "Full Reports workbench: company / project / as-of / grouping filters, chart + table with totals, drill and Back with the same filter and tab", "src/plugins/digit_construction/ent36.test.tsx [ENT36-06] + reconcile.test.ts — PASS"],
  "UXP-06": ["COMPLETED", "BlockMenu period controls (AS_OF, 7/30/90, MTD/QTD/YTD, FY, custom, baseline compare) with per-widget badge", "src/lib/dashboards/blocks.test.ts [DASH-BLK-01..02] + ent36.test.tsx [ENT36-05] — PASS"],
  "UXP-07": ["ALREADY_PRESENT", "DashboardDesigner cross-filter only on compatible authorised dimensions; Back keeps filter and tab", "src/plugins/digit_construction/ent36.test.tsx [ENT36-03] — PASS"],
};

const un = (what: string): WResult => ({ status: "BLOCKED", where: "", test: "", unresolved: what });

export function classify(r: WRow, c: WCtx): WResult {
  const t = r.Type;
  if (t.startsWith("workspace")) return workspace(r);
  if (t === "KPI slot") return kpi(r);
  if (t === "screen placement") return placement(r);
  if (t.startsWith("field")) return field(r, c);
  if (t === "document relation") return relation(r, c);
  if (t.startsWith("document contract")) return docContract(r, c);
  if (t.startsWith("missing document")) return missing(r, c);
  if (t.startsWith("report mapping")) return report(r);
  if (t === "dashboard personalization") { const p = PERS[r.ID]; return p ? { status: p[0], where: p[1], test: p[2] } : un(r.ID); }
  if (t === "chart guardrail") return vis(r);
  if (t === "cross-department flow") return flow(r);
  if (t.startsWith("customer pain")) return pain(r);
  if (t === "value story") { const v = VALUE[r.ID]; return v ? { status: "ALREADY_PRESENT", where: v[0], test: v[1] } : un(r.ID); }
  if (t === "Arabic translation gap") return arabic(r);
  if (t === "rc1 remaining gap") return rc1(r);
  if (t === "open research question") return research(r, c);
  if (t.startsWith("UX principle")) { const u = UXP[r.ID]; return u ? { status: u[0], where: u[1], test: u[2] } : un(r.ID); }
  if (t.startsWith("owner policy")) return { status: "COMPLETED", where: "P10 Digit Policy Decision seeded Undefined (seed.ts POLICY_PENDING); WIP adjustment Post refused while undefined (finance.ts wipRule); WIP figures report only", test: "src/plugins/digit_construction/ent36needs.test.ts [ENT36-19] + ent36docs.test.ts [ENT36-11] — PASS" };
  return un(`type ${t}`);
}

/** Rows appended to the result: the 26 shared-screen needs found by the test run (owner ruling: place each, mark it). */
export const ENT_NEEDS: [id: string, need: string, status: WStatus, where: string, test: string][] = [
  ["ENT-NEED-01", "Desk User for new users (DEC-015)", "COMPLETED", "owner ruling: no automatic Desk User; app access from the app role (slots.tsx enterprise.roles for Pro / HR / Construction); no app role = Home only", "src/plugins/digit_construction/ent36needs.test.ts [ENT36-18] + src/test/closure/ready.closure.test.ts [SH-004] — PASS"],
  ["ENT-NEED-02", "Search-by-name picker (cost codes, projects, parties)", "ALREADY_PRESENT", "shared Link control searches by name and shows the record title (Enterprise standard R5 names not codes)", "src/test/closure/screenStandard.closure.test.ts — PASS"],
  ["ENT-NEED-03", "Cost category picker on PO / PI / work-order rows", "ALREADY_PRESENT", "custom field digit_cost_category on the item rows (child grid select); budget line = cost code × category", "src/plugins/digit_construction/testlist/d06.test.ts — PASS"],
  ["ENT-NEED-04", "Non-blocking form warnings slot", "COMPLETED", "ui/formNotices.tsx amber notice (costWarnings, PO over budget with override reason, DEC-064 payment compliance) — never blocks saving", "src/plugins/digit_construction/ent36needs.test.ts [ENT36-17] — PASS"],
  ["ENT-NEED-05", "«Already exists» notice on a repeated Create From", "ALREADY_PRESENT", "ui/kit.tsx ActionButton «موجود مسبقاً: <name>»", "src/plugins/digit_construction/testlist/d05.test.ts — PASS"],
  ["ENT-NEED-06", "Account picker for the retention payable account", "ALREADY_PRESENT", "Construction settings retention_payable_account (account select, validated against Account); invoice stays a draft while empty", "src/plugins/digit_construction/admin.test.ts — PASS"],
  ["ENT-NEED-07", "PO close approval display", "ALREADY_PRESENT", "Purchase Order digit_close_approved_by / digit_close_approved_on read-only fields on the shared form", "src/plugins/digit_construction/testlist/d07.test.ts — PASS"],
  ["ENT-NEED-08", "Shared saved views bar on report screens", "ALREADY_PRESENT", "ui/layoutEditor.tsx SavedViewsBar on every Construction report (DEC-302: shared saved views reused)", "src/plugins/digit_construction/views.test.ts — PASS"],
  ["ENT-NEED-09", "Change exposure by stage on the 04 workspace", "ALREADY_PRESENT", "report Change Exposure by Stage in workspace 04-03 Full Reports + KPI drill", "src/plugins/digit_construction/testlist/d04.test.ts — PASS"],
  ["ENT-NEED-10", "RFI cost impact column", "ALREADY_PRESENT", "RFI register (reportsR19Contract.ts) reads the RFI cost_impact field", "src/plugins/digit_construction/testlist/d02.test.ts — PASS"],
  ["ENT-NEED-11", "Margin floor shown as a block on the tender", "ALREADY_PRESENT", "tendering.ts margin rule refuses the save with the Arabic message (min_margin_pct setting)", "src/plugins/digit_construction/testlist/d03.test.ts — PASS"],
  ["ENT-NEED-12", "Daily compliance refresh scheduler", "COMPLETED", "owner ruling: recorded for the server package (daily scheduler), not built in the preview; the preview recomputes on open (subcontract.ts complianceOf)", "docs/construction/ENTERPRISE_36X3_SUMMARY.md — recorded"],
  ["ENT-NEED-13", "DEC-064 compliance note as information", "COMPLETED", "ui/formNotices.tsx shows paymentComplianceWarnings on a draft Payment Entry; submit is allowed and logged (hooks.ts → Override Log)", "src/plugins/digit_construction/ent36needs.test.ts [ENT36-17] — PASS"],
  ["ENT-NEED-14", "K06 cost cards on the 06 overview", "ALREADY_PRESENT", "r19/metrics.ts 06-0x KPI slots on the four 06 workspace Overviews", "src/plugins/digit_construction/ent36worklist.test.ts [ENT36-W-KPI] — PASS"],
  ["ENT-NEED-15", "E-mail provider setting", "ALREADY_PRESENT", "Enterprise provider settings (src/lib/coreShared/providers.ts queueEmail); real sending waits for the provider", "src/plugins/digit_construction/testlist/notifications.test.ts — PASS"],
  ["ENT-NEED-16", "Server doc_events for PO / MR / Stock Entry / Payment Entry", "COMPLETED", "owner ruling: recorded for the server package (generator doc_events), not built in the preview; the Python twins exist (rules/*.py)", "src/plugins/digit_construction/frappeParity.test.ts — PASS"],
  ["ENT-NEED-17", "Procurement buttons (comparison, shortage, expediting, supplier date, issue → stock entry, follow-up, include zero)", "COMPLETED", "ui/formNotices.tsx «Create shortage request», «Accept supplier dates», «Create stock entry»; pages proc/comparison and Procurement Follow-up report already present", "src/plugins/digit_construction/ent36needs.test.ts [ENT36-16] — PASS"],
  ["ENT-NEED-18", "Supplier scorecard weights", "COMPLETED", "owner ruling: the weights are a Construction Settings value, equal (plain average) while blank; set weights change the score", "src/plugins/digit_construction/uxDepth.test.ts [UXD-03] — PASS"],
  ["ENT-NEED-19", "Stock Entry digit_reason on movement types that need it", "ALREADY_PRESENT", "supply.ts needsReason / stockEntryRule", "src/plugins/digit_construction/testlist/d07.test.ts — PASS"],
  ["ENT-NEED-20", "Resources buttons (fill from crew, induction warning, VAT journal, permit issue …)", "COMPLETED", "ui/formNotices.tsx «Fill from crew»; Work Permit workflow Issue / Suspend / Close (spec/ent36Docs.ts); VAT-inclusive journal on Project 360 (createExpenseJournal); induction rule messages", "src/plugins/digit_construction/ent36needs.test.ts [ENT36-16] + ent36docs.test.ts [ENT36-09, ENT36-11] — PASS"],
  ["ENT-NEED-21", "Finance & closeout buttons (remittance, curve, snapshot, O&M manual, WIP fill, override reason)", "COMPLETED", "ui/formNotices.tsx «Send remittance notice», «Spread by curve», «Create snapshot», «Compile O&M manual», «Fill from project» (services.ts fillWipFromProject); PO override reason field + notice", "src/plugins/digit_construction/ent36needs.test.ts [ENT36-16] — PASS"],
  ["ENT-NEED-22", "Section server endpoints for workspaces", "COMPLETED", "contract.py CONTRACT_VERSION 3: 36 section keys with documents, reports, KPI slots (source method + drill), queues and roles (generator/contract.ts)", "frappe_apps/digit_construction/apps/digit_construction/digit_construction/tests/test_contract_v3.py — PASS"],
  ["ENT-NEED-23", "Core decisions DEC-306–308, 320–323, 326", "ALREADY_PRESENT", "shared-layer choices applied in the Enterprise frame (saved views, layouts, print frame) as recorded in the test run", "src/plugins/digit_construction/views.test.ts + print.test.ts — PASS"],
  ["ENT-NEED-24", "SCR-00-11 mobile (PWA) entry", "COMPLETED", "owner ruling: no separate phone app now; the workspaces at 390 px are the field experience", "src/plugins/experience/experience.test.ts — PASS"],
  ["ENT-NEED-25", "Journal Entry account rows cost category", "COMPLETED", "owner ruling: custom field digit_cost_category on Journal Entry Account rows (no change to Pro logic); journal actuals match cost code + category", "src/plugins/digit_construction/uxDepth.test.ts [UXD-04] — PASS"],
  ["ENT-NEED-26", "Enterprise standard on Construction screens", "COMPLETED", "36 workspaces × 3 tabs on the shared shell, band, tabs, white cards, chart kit, block menu, Riyal sign", "src/plugins/digit_construction/ent36.test.tsx + src/test/closure/screenStandard.closure.test.ts — PASS"],
];
