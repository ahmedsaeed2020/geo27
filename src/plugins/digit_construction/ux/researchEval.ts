/**
 * Research evaluation round (owner 2026-11-14): the 516 rows of DIGIT_CON_RESEARCH_EVAL_LIST.csv evaluated on screen with
 * the demo company. Each row resolves to the /construction route it is reached on (with the menu click path), the demo
 * records it uses, a screenshot named by row ID (one per distinct screen; rows on the same screen reference it), print
 * status for document rows and a 0–3 score. Scores come from the row's own evidence (earlier test run, Enterprise round,
 * this round's screens) and are lowered by what the screenshot run saw: a page error or blank page → 0, a report with no
 * rows → 1. A 3 needs a stated reason (researchEvalMap BETTER).
 */
import contract from "../r19/contract.generated.json";
import { DEPT_NAMES, DEPT_SLUGS, WS_INDEX, wsRoute, type WsTab } from "../r19/wsIndex";
import { R19_PAGE_SCREENS, R19_SHARED_SCREENS } from "../experience";
import { BETTER, COMP_MAP, CS_MAP, FEATURE_MAP, GATE_MAP, REC_MAP, type Manual } from "./researchEvalMap";
import { JOURNEY_STEPS } from "./uxDepth";

export interface ERow { ID: string; Type: string; "Source ID": string; Dept: string; "Idea (from research)": string; "Must be true": string; [k: string]: string }
export type Score = 0 | 1 | 2 | 3;
export interface EvalCtx {
  docOf: (doctype: string) => string | undefined;
  slugOf: (doctype: string) => { slug: string; app: string };
  /** the demo project the project screens and project-required reports open on */
  project: string;
  testResult: (id: string) => { status: string; note: string; where: string } | undefined;
  entResult: (id: string) => { status: string; where: string } | undefined;
  /** the report's reference DocType and the URL filters it is opened with (required / project filters filled from demo records) */
  report: (name: string) => { doctype: string; projectRequired: boolean; query: string; project?: string } | undefined;
  /** DocTypes printed in this round (PRINT_RESULT.csv status OK) */
  printable: (doctype: string) => boolean;
  label: (doctype: string) => string;
  /** the document a line table belongs to (a feature on a child table is evaluated on its parent's demo record) */
  parentOf?: (doctype: string) => string | undefined;
}
export interface EvalItem { id: string; type: string; target: string; route: string; click: string; records: string; base: Score; print: "Y" | "N" | "NA"; note: string; gap: string; shot: string; kind: "report" | "page" | "doc" | "journey"; doctype?: string }
export interface ShotResult { file: string; route: string; final: string; errors: string[]; blank: boolean; overflow: number; rows: number; title: string }
export interface JourneyStep { doctype: string; name: string; route: string; file: string; found: boolean; via: string; print: boolean }
export interface JourneyResult { id: string; steps: JourneyStep[]; ok: boolean; reason?: string }

type C = { workspaces: { id: string; dept: string; title: string; feats: string[]; screen_ids: string; docs: [string, string][]; reports: [string, string, string][] }[]; features: { id: string; ar: string; en: string; screens: string[]; doctypes: string[] }[] };
const K = contract as unknown as C;
const PUB = "/construction";
const TAB_AR: Record<WsTab, string> = { overview: "نظرة عامة", documents: "المستندات والعمل", reports: "التقارير الكاملة" };
const wsTitle = (id: string) => WS_INDEX.find((x) => x[0] === id)?.[2] ?? id;
const deptAr = (d: string) => DEPT_NAMES[d]?.[1] ?? d;
const menu = (id: string, tab: WsTab, ...more: string[]) => ["menu: الإنشاءات", deptAr(id.slice(0, 2)), wsTitle(id), TAB_AR[tab], ...more].join(" › ");
const wsOfFeature = (ft: string) => K.workspaces.find((w) => w.feats.includes(ft));
const wsOfScreen = (scr: string) => K.workspaces.find((w) => w.screen_ids.split(",").map((x) => x.trim()).includes(scr));
const wsOfDoc = (dt: string) => K.workspaces.find((w) => w.docs.some(([d]) => d === dt));
const wsOfReport = (name: string) => K.workspaces.find((w) => w.reports.some(([r]) => r === name));
const pageScreen = (path: string) => [...R19_PAGE_SCREENS, ...R19_SHARED_SCREENS].find((s) => s.pages.some(([p]) => p === path || p.replace(/\$\w+/g, "$p") === path));

/** Resolve a target string (researchEvalMap) to its route, click path, records and screen kind. */
export function resolveTarget(t: string, c: EvalCtx): Pick<EvalItem, "route" | "click" | "records" | "kind" | "doctype"> {
  const enc = encodeURIComponent;
  if (t === "H") return { route: PUB, click: "menu: الإنشاءات (الصفحة الرئيسية)", records: "the 12 demo projects", kind: "page" };
  if (t.startsWith("ws:")) {
    const [id, suf] = t.slice(3).split("/") as [string, string | undefined]; const tab: WsTab = suf === "d" ? "documents" : suf === "r" ? "reports" : "overview";
    const w = K.workspaces.find((x) => x.id === id); const docs = (w?.docs ?? []).map(([d]) => d).filter((d) => c.docOf(d));
    return { route: `${PUB}/${wsRoute(id, tab)}`, click: menu(id, tab), records: docs.length ? docs.slice(0, 3).map((d) => `${c.label(d)} ${c.docOf(d)}`).join("; ") : "workspace figures of the demo company", kind: "page" };
  }
  if (t.startsWith("R:")) {
    const name = t.slice(2); const r = c.report(name); const w = wsOfReport(name) ?? (r ? wsOfDoc(r.doctype) : undefined);
    const qs = r?.query ? `?${r.query}` : "";
    const click = w ? (wsOfReport(name) ? menu(w.id, "reports", name) : menu(w.id, "reports", "كل التقارير في مركز التقارير", name)) : `menu: الإنشاءات › مركز التقارير › ${name}`;
    return { route: `${PUB}/reports/${enc(name)}${qs}`, click, records: `${r ? `${c.label(r.doctype)} rows` : "report rows"}${r?.project ? ` of project ${r.project}` : " of the demo company"}${r?.query && !/^project=[^&]*$/.test(r.query) ? ` (filters ${decodeURIComponent(r.query)})` : ""}`, kind: "report" };
  }
  if (t.startsWith("P:")) {
    const path = t.slice(2).replace("$p", enc(c.project)); const s = pageScreen(t.slice(2));
    const w = s && "ws" in s ? K.workspaces.find((x) => x.id === s.ws) : undefined;
    return { route: `${PUB}/${path}`, click: w ? menu(w.id, "overview", path) : `menu: الإنشاءات › ${path}`, records: path.startsWith("project/") ? `project ${c.project}` : "demo company records", kind: "page" };
  }
  if (t.startsWith("D:")) {
    const dt = t.slice(2); const n = c.docOf(dt); const { slug, app } = c.slugOf(dt); const w = wsOfDoc(dt);
    const route = n ? `${PUB}/doc/${slug}/${enc(n)}${app && app !== "erpnext" ? `?src=${app}` : ""}` : `${PUB}/doc/${slug}`;
    return { route, click: w ? menu(w.id, "documents", c.label(dt), n ?? "") : `menu: الإنشاءات › ${c.label(dt)}${n ? ` › ${n}` : ""}`, records: n ? `${c.label(dt)} ${n}` : "—", kind: "doc", doctype: dt };
  }
  throw new Error(`unknown target ${t}`);
}

const short = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const routeOf = (where: string) => where.replace(/<project>/g, "$p").match(/\/construction\/[^\s;(),]+/)?.[0];
const wsIdIn = (where: string) => where.match(/\b(0[1-9])-(0[1-4])\b/)?.[0];

/** The plan: target, route, click path, records, base score and note per row (before the screenshot run). */
export function buildEvalPlan(rows: ERow[], c: EvalCtx): EvalItem[] {
  const shotOf = new Map<string, string>();
  return rows.map((r): EvalItem => {
    const sid = r["Source ID"]; const type = r.Type;
    let m: Manual | undefined; let base: Score = 2; let note = ""; let gap = "";
    const tr = c.testResult(sid); const en = c.entResult(sid);
    if (type.startsWith("Feature")) {
      m = FEATURE_MAP[sid];
      if (!m) {
        const f = K.features.find((x) => x.id === sid); const w = wsOfFeature(sid) ?? (f?.screens[0] ? wsOfScreen(f.screens[0]) : undefined);
        const scr = f?.screens.map((s) => R19_PAGE_SCREENS.find((x) => x.scr === s) ?? R19_SHARED_SCREENS.find((x) => x.scr === s)).find(Boolean)?.pages[0]?.[0];
        const own = (d: string) => (c.docOf(d) ? d : ((p) => (p && c.docOf(p) ? p : undefined))(c.parentOf?.(d)));
        const dt = (f?.doctypes ?? []).map(own).find(Boolean);
        m = { t: dt ? `D:${dt}` : scr !== undefined ? `P:${scr.replace(/\$\w+/g, "$p")}` : w ? `ws:${w.id}/d` : "H" };
        note = `${f ? `${f.en} — ` : ""}behaviour run on demo data by the department test list (testlist/d${sid.slice(3, 5)}.test.ts): ${tr?.status ?? "—"}${scr !== undefined && dt ? `; screen ${scr}` : ""}.`;
        if (tr && tr.status !== "PASS") { base = 1; gap = tr.note; }
        if (!dt && (f?.doctypes ?? []).length) { base = Math.min(base, 1) as Score; gap = `${gap ? `${gap}; ` : ""}no demo record of ${f!.doctypes.join(", ")}`; }
      }
    } else if (type.startsWith("Report")) {
      const where = tr?.where ?? "";
      const repName = sid.startsWith("RPT-V4-") ? sid.slice(7) : c.report(where) ? where : "";
      if (repName && c.report(repName)) m = { t: `R:${repName}` };
      else { const ft = where.match(/FT-\d\d-\d\d/)?.[0] ?? ""; const w = wsOfFeature(ft); m = { t: w ? `ws:${w.id}` : "H", note: `KPI tile of workspace ${w?.id ?? "—"} (${ft}); the tile drills to the rows it counts.` }; }
      note = `${tr ? `test run: ${tr.status}` : en ? `Enterprise round: ${en.status}` : ""}`;
      if (tr && tr.status !== "PASS") { base = 1; gap = tr.note; }
    } else if (type.startsWith("Competitor")) {
      m = COMP_MAP[r.ID]; note = `Competitor «${r["Idea (from research)"]}» ↔ DIGIT ${m?.t.replace(/^R:/, "report «").replace(/^(report «.*)$/, "$1»") ?? "—"}`;
    } else if (type.startsWith("Journey")) {
      const steps = JOURNEY_STEPS[sid] ?? []; const first = steps[0];
      m = { t: first ? `D:${first}` : "H" }; note = `Steps: ${steps.map((d) => c.label(d)).join(" → ")}`;
    } else if (type.startsWith("Gate")) {
      m = GATE_MAP[sid]; if (!m && en) { const rt = routeOf(en.where); const w = wsIdIn(en.where); m = { t: rt ? `P:${rt.slice(PUB.length + 1)}` : w ? `ws:${w}` : "H", note: en.where }; if (en.status === "BLOCKED") { base = 1; gap = en.where; } }
    } else {
      // research recommendations / customer pains / customer cases
      m = CS_MAP[sid] ?? REC_MAP[sid];
      if (!m && en) { const rt = routeOf(en.where); const w = wsIdIn(en.where); m = { t: rt ? `P:${rt.slice(PUB.length + 1)}` : w ? `ws:${w}` : "H", note: short(en.where) }; }
    }
    if (!m) throw new Error(`row ${r.ID} (${sid}) has no evaluation target`);
    if (m.s !== undefined) base = m.s; if (m.gap) gap = m.gap; if (m.note) note = note ? `${note} ${m.note}` : m.note;
    // P: targets whose path is a ws route (from the Enterprise round "Where") resolve as workspace pages
    let t = m.t; const pm = t.startsWith("P:") ? t.slice(2).match(/^([a-z-]+)\/([a-z0-9-]+)\/(overview|documents|reports)/) : null;
    if (pm) { const id = WS_INDEX.find(([i]) => DEPT_SLUGS[i.slice(0, 2)] === pm[1] && wsRoute(i, pm[3] as WsTab).split("/")[1] === pm[2])?.[0]; if (id) t = `ws:${id}${pm[3] === "documents" ? "/d" : pm[3] === "reports" ? "/r" : ""}`; }
    const x = resolveTarget(t, c);
    const kind = type.startsWith("Journey") ? "journey" : x.kind;
    const file = kind === "journey" ? `${r.ID}_s1.jpg` : shotOf.get(x.route) ?? `${r.ID}.jpg`; if (kind !== "journey" && !shotOf.has(x.route)) shotOf.set(x.route, file);
    const print: EvalItem["print"] = kind === "journey" ? "Y" : x.doctype ? (c.printable(x.doctype) ? "Y" : "N") : "NA";
    return { id: r.ID, type, target: t, ...x, kind, base, print, note: short(note, 400), gap: short(gap, 400), shot: file };
  });
}

const BENIGN = /favicon|ResizeObserver|Download the React DevTools|\[vite\]|net::ERR_ABORTED|Failed to load resource/;
const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export interface EvalOut extends EvalItem { score: Score; why: string; files: string[] }
/** Applies the screenshot run (and the journey walk) to the plan and writes the result CSV (the list's own columns filled). */
export function buildEvalResult(rows: ERow[], plan: EvalItem[], shots: ShotResult[], journeys: JourneyResult[]): { csv: string; items: EvalOut[] } {
  const items = plan.map((p): EvalOut => {
    let score: Score = p.base; let gap = p.gap; let why = ""; let print = p.print; const files = [p.shot];
    if (p.kind === "journey") {
      const sid = rows.find((r) => r.ID === p.id)!["Source ID"]; const j = journeys.find((x) => x.id === sid);
      if (!j) { score = 1; gap = "journey not walked"; }
      else {
        files.splice(0, 1, ...j.steps.map((s) => s.file));
        const missing = j.steps.filter((s) => !s.found);
        if (missing.length) { score = 1; gap = `no link from the previous step to ${missing.map((s) => s.doctype).join(", ")}${j.reason ? ` (${j.reason})` : ""}`; }
        print = j.steps.every((s) => !s.found || s.print) ? "Y" : "N";
        if (print === "N") { score = Math.min(score, 1) as Score; gap = `${gap ? `${gap}; ` : ""}print failed for ${j.steps.filter((s) => s.found && !s.print).map((s) => s.doctype).join(", ")}`; }
        why = `Walked by clicks: ${j.steps.map((s) => `${s.doctype} ${s.name || "—"}${s.via ? ` (${s.via})` : ""}`).join(" → ")}`;
      }
    } else {
      const s = shots.find((x) => x.file === p.shot);
      if (!s) { score = Math.min(score, 1) as Score; gap = `${gap ? `${gap}; ` : ""}screenshot not taken`; }
      else {
        const errs = s.errors.filter((e) => !BENIGN.test(e));
        if (errs.length || s.blank) { score = 0; gap = `screen failed: ${s.blank ? "blank page" : short(errs[0]!, 160)}`; }
        else if (p.kind === "report" && s.rows === 0) { score = Math.min(score, 1) as Score; gap = `${gap ? `${gap}; ` : ""}the report shows no rows on the demo data`; }
        else if (p.kind === "report") why = `${s.rows} rows on screen`;
      }
    }
    const sid = rows.find((r) => r.ID === p.id)!["Source ID"]; const better = BETTER[p.id] ?? BETTER[sid];
    if (score === 2 && better) { score = 3; why = why ? `${why}; ${better}` : better; }
    return { ...p, score, gap, why, print, files: [...new Set(files)] };
  });
  const head = Object.keys(rows[0]!);
  const out = [head.map(q).join(",")];
  for (const r of rows) {
    const it = items.find((x) => x.id === r.ID)!;
    const fill: Record<string, string> = {
      "Route (/construction/...) reached by clicks": it.route, "Click path": it.click, "Demo records used": it.records,
      "Result on screen": short([it.note, it.why].filter(Boolean).join(" "), 600), "Score 0-3 (0 missing,1 partial,2 works,3 better than competitors)": String(it.score),
      Screenshot: it.files.map((f) => `research/${f}`).join("; "), "Print OK (Y/N/NA)": it.print, "Gap / fix made": it.gap || (it.score >= 2 ? "—" : ""),
    };
    out.push(head.map((h) => q(fill[h] ?? r[h] ?? "")).join(","));
  }
  return { csv: `\ufeff${out.join("\n")}\n`, items };
}

/** Score totals per type and per department, plus the open (0–1) rows with reasons. */
export function buildRoundSummary(rows: ERow[], items: EvalOut[], meta: { date: string; commit: string; seeded: number; printOk: number; printTotal: number; fixes?: string[] }): { md: string; avg: number; good: number } {
  const avg = items.reduce((a, x) => a + x.score, 0) / items.length; const good = items.filter((x) => x.score >= 2).length;
  const deptOf = (r: ERow) => { const d = r.Dept.match(/\d\d/)?.[0] ?? r["Source ID"].match(/(?:FT|CS|K)-(\d\d)/)?.[1]; return d && DEPT_NAMES[d] ? d : "—"; };
  const table = (key: (r: ERow) => string, label: (k: string) => string) => {
    const keys = [...new Set(rows.map(key))].sort();
    const lines = ["| " + "Group | Rows | 0 | 1 | 2 | 3 | Average |", "|---|---:|---:|---:|---:|---:|---:|"];
    for (const k of keys) { const its = rows.filter((r) => key(r) === k).map((r) => items.find((x) => x.id === r.ID)!); const n = (s: number) => its.filter((x) => x.score === s).length;
      lines.push(`| ${label(k)} | ${its.length} | ${n(0)} | ${n(1)} | ${n(2)} | ${n(3)} | ${(its.reduce((a, x) => a + x.score, 0) / its.length).toFixed(2)} |`); }
    return lines;
  };
  const open = items.filter((x) => x.score <= 1);
  const md = [
    "# DIGIT Construction — demo data, print and research evaluation round", "",
    `Generated by \`ux/researchEvalResult.test.ts\` (RDE_WRITE=1) on ${meta.date}, source commit ${meta.commit}.`, "",
    `**CONSTRUCTION DATA+PRINT+RESEARCH: data seeded ${meta.seeded.toLocaleString("en-US")} documents, print ${meta.printOk}/${meta.printTotal} documents OK, research score avg ${avg.toFixed(2)}, rows scored 2–3: ${good}/${items.length}**`, "",
    "Scores: 0 missing, 1 partial, 2 works, 3 better than the competitors (only with a stated reason). A row drops to 0 when its screen failed in the screenshot run and to 1 when a report shows no rows on the demo data.", "",
    "## Score per type", "", ...table((r) => r.Type, (k) => k), "",
    "## Score per department", "", ...table(deptOf, (k) => (k === "—" ? "Cross-department (vendor studies, gates, competitor reports, journeys)" : `${k} ${DEPT_NAMES[k]?.[0] ?? ""}`)), "",
    "## Deliverables", "", "- `DEMO_DATA_SUMMARY.md` — demo documents per type and per project.", "- `PRINT_RESULT.csv` + `print/*.jpg` — every printable document (Arabic print preview, four English previews, a 380-line BOQ, an unapproved draft) and the setup records that are not printed, with reasons.", "- `DIGIT_CON_RESEARCH_EVAL_RESULT.csv` + `research/*.jpg` — all 516 rows with route, click path, demo records, result, score, screenshot, print and gap.", "",
    ...(meta.fixes?.length ? ["## Fixes made in this round", "", ...meta.fixes.map((f) => `- ${f}`), ""] : []),
    "## Screenshots", "", "`research/<row ID>.jpg` is the screen the row is evaluated on (Arabic, 1440 px). Rows evaluated on the same screen reference the first row's file; journeys have one file per step (`_s1`, `_s2`, …).", "",
    "## Rows scored 3 (better than the competitors)", "", ...items.filter((x) => x.score === 3).map((x) => `- ${x.id}: ${x.why}`), "",
    "## Open items (score 0–1) and reasons", "", ...(open.length ? open.map((x) => `- ${x.id} (${rows.find((r) => r.ID === x.id)!["Source ID"]}): ${x.gap || "partial"}`) : ["- none"]), "",
  ].join("\n");
  return { md, avg, good };
}
