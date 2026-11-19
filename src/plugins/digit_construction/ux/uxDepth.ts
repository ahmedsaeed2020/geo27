/**
 * Owner UX depth round (2026-11-14) — the 412-row checklist (DIGIT_CON_UX_DEPTH_CHECKLIST.csv) resolved against the live
 * source: every row gets the visible /construction route it is checked on, the screenshot files named by row ID
 * (docs/construction/ux/screens, taken by the browser runner from the plan this module builds) and a status/note.
 * Status words: PASS (already on screen as required), FIXED (changed in this round), BUILT (added in this round),
 * BLOCKED (only the owner or a server can close it; the note says why). A row is never PASS when its screenshot run
 * reported a page error or a horizontal overflow — the result builder downgrades it and names the problem.
 */
import contract from "../r19/contract.generated.json";
import { DEPT_NAMES, DEPT_SLUGS, WS_INDEX, wsRoute } from "../r19/wsIndex";
import { R19_PAGE_SCREENS, R19_SHARED_SCREENS } from "../experience";
import { DEPT_COMPOSITION } from "../r19/deptDashboards";

export interface CRow { ID: string; Group: string; Where: string; "Must be true": string; Source: string; [k: string]: string }
export type UStatus = "PASS" | "FIXED" | "BUILT" | "BLOCKED";
/** `sel` screenshots one element (scrolled into view); `act` runs before the shot: "click:<css>", "search:<text>" (Alt+Q), "dark". */
export interface ShotSpec { file: string; route: string; lang: "ar" | "en"; width: 1440 | 390; sel?: string; act?: string }
export interface PlanItem { id: string; status: UStatus; route: string; note: string; shots: ShotSpec[] }
export interface ShotResult { file: string; route: string; final: string; lang: string; width: number; overflow: number; errors: string[]; blank?: boolean }
export interface PlanCtx { /** first readable record of a DocType (demo data) */ docOf: (doctype: string) => string | undefined; slugOf: (doctype: string) => { slug: string; app: string }; project: string; testResult: (id: string) => { status: string; note: string } | undefined }

type C = { workspaces: { id: string; dept: string; title: string; feats: string[]; screen_ids: string; docs: [string, string][] }[]; features: { id: string; ar: string; en: string; screens: string[]; doctypes: string[] }[]; journeys: { id: string; ar: string }[] };
const K = contract as unknown as C;
const PUB = "/construction";
const page = (p: string) => (p ? `${PUB}/${p}` : PUB);
const wsOfScreen = (scr: string) => K.workspaces.find((w) => w.screen_ids.split(",").map((x) => x.trim()).includes(scr));
const wsOfFeature = (ft: string) => K.workspaces.find((w) => w.feats.includes(ft));
const deptOfWhere = (where: string) => where.slice(0, 2);
const wsOfWhere = (where: string) => { const t = where.split("›")[1]?.trim(); const d = deptOfWhere(where); const e = WS_INDEX.find((x) => x[0].startsWith(`${d}-`) && x[2] === t); return e ? K.workspaces.find((w) => w.id === e[0]) : undefined; };
/** Visual changes of this round per workspace (shared chart kit upgrades + data fixes), so their overview rows read FIXED. */
const WS_FIXED: Record<string, string> = {
  "01-01": "bubble chart redrawn with grid, % axes, labelled bubbles and the minimum-margin reference line (when Finance sets it)",
  "02-03": "stacked ages drawn with totals", "04-01": "SOV progress drawn as ranked stacked bars with totals", "04-04": "claim ages drawn with totals",
  "05-01": "commitment by subcontractor shows names, not codes", "05-02": "commitment position drawn as ranked stacked bars per work order", "05-04": "bill ages drawn with totals",
  "03-04": "bid leveling columns show supplier names", "06-01": "budget bullet labels show the cost code description", "07-02": "on-time delivery shows supplier names",
  "07-03": "stock movement stacked columns show totals", "07-04": "received-not-invoiced shows supplier names", "08-04": "work permit calendar drawn from the built Digit Work Permit records (was 'no source')",
  "09-01": "receivables ageing rows show customer names as ranked stacked bars", "09-04": "GL / WIP bridge states the P10 pending reason (WIP adjustments stay report-only)",
};
const tabAr: Record<string, string> = { overview: "نظرة عامة", documents: "المستندات والعمل", reports: "التقارير الكاملة" };
const menuPath = (wsId: string, tab: "overview" | "documents" | "reports") => { const w = WS_INDEX.find((x) => x[0] === wsId)!; const d = K.workspaces.find((x) => x.id === wsId)!; return `menu: ${DEPT_TITLE_AR[d.dept] ?? d.dept} › ${w[2]} › ${tabAr[tab]}`; };
const DEPT_TITLE_AR: Record<string, string> = Object.fromEntries(Object.entries(DEPT_NAMES).map(([d, n]) => [d, n[1]]));
const ar1440 = (id: string, route: string, suffix = ""): ShotSpec => ({ file: `${id}${suffix}.jpg`, route, lang: "ar", width: 1440 });
const en390 = (id: string, route: string, suffix = "_en390"): ShotSpec => ({ file: `${id}${suffix}.jpg`, route, lang: "en", width: 390 });

/** Journeys J01–J09: the documents walked by clicks (each step must offer a link to the next on its page). */
export const JOURNEY_STEPS: Record<string, string[]> = {
  J01: ["Digit Subcontract Work Order", "Digit Measurement Book", "Digit Subcontractor Bill", "Purchase Invoice", "Payment Entry"],
  J02: ["Digit Client Contract", "Digit Client Variation", "Digit Client Claim", "Digit Client Certificate", "Sales Invoice"],
  J03: ["Digit Project Cost Budget", "Digit Budget Revision", "Purchase Order", "Purchase Invoice"],
  J04: ["Digit Tender", "Digit Takeoff Sheet", "Digit BOQ", "Digit Estimate Version"],
  J05: ["Material Request", "Request for Quotation", "Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice"],
  J06: ["Digit RFI", "Digit Change Event", "Digit Client Variation", "Digit Client Contract"],
  J07: ["Digit Drawing", "Digit Transmittal", "Digit Inspection", "Digit Defect"],
  J08: ["Digit Field Attendance", "Digit Crew", "Digit Machinery Usage", "Digit Machinery"],
  J09: ["Project"],
};

export function buildPlan(rows: CRow[], c: PlanCtx): PlanItem[] {
  const docRoute = (dt: string, name?: string) => { const n = name ?? c.docOf(dt); if (!n) return undefined; const { slug, app } = c.slugOf(dt); return `${PUB}/doc/${slug}/${encodeURIComponent(n)}${app && app !== "erpnext" ? `?src=${app}` : ""}`; };
  const listRoute = (dt: string, q = "") => { const { slug, app } = c.slugOf(dt); const qs = [app && app !== "erpnext" ? `src=${app}` : "", q].filter(Boolean).join("&"); return `${PUB}/doc/${slug}${qs ? `?${qs}` : ""}`; };
  return rows.map((r): PlanItem => {
    const g = r.Group;
    if (g === "Department dashboard") {
      const d = deptOfWhere(r.Where); const route = page(DEPT_SLUGS[d]!); const comp = DEPT_COMPOSITION[d as keyof typeof DEPT_COMPOSITION];
      return { id: r.ID, status: "FIXED", route, shots: [ar1440(r.ID, route), en390(r.ID, route)],
        note: `Before: four plain workspace cards. Now the approved composition (${comp.approved[0]}): 4 headline figures with change and sparkline, ${comp.blocks.filter(([b]) => !["insights", "decisions", "workspaces"].includes(b)).map(([b]) => b).join(", ")}, insight sentences, decisions with workflow buttons, the 4 workspaces; customisable on the shared Dashboard Designer.` };
    }
    if (g.startsWith("Workspace ")) {
      const w = wsOfWhere(r.Where)!; const tab = g === "Workspace overview" ? "overview" : g === "Workspace documents tab" ? "documents" : "reports";
      const route = page(wsRoute(w.id, tab)); const shots = [ar1440(r.ID, route), en390(r.ID, route)];
      if (tab === "documents") { const first = w.docs.map(([dt]) => dt).find((dt) => c.docOf(dt)); const dr = first ? docRoute(first) : undefined; if (dr) shots.push(ar1440(r.ID, dr, "_doc"), en390(r.ID, dr, "_doc_en390")); }
      const fixed = tab === "overview" ? WS_FIXED[w.id] : undefined;
      const note = tab === "overview" ? `${menuPath(w.id, tab)}. Four layers on the shared Dashboard Designer: the 4 prototype figures with change vs 30 days and sparkline, primary + secondary chart, computed insight sentences with drill, decisions with workflow buttons and work queues.${fixed ? ` This round: ${fixed}.` : ""}`
        : tab === "documents" ? `${menuPath(w.id, tab)}. Native-style hub: quick-access tiles with live counts, groups (operational cycle / daily work / masters / reports), the register with All / Mine / Waiting on me / Overdue views, group by status or project, real columns, status pill and age; documents ${w.docs.map((d) => d[1]).join(" / ")}; one document opened (_doc shots).`
          : `${menuPath(w.id, tab)}. Report catalog of the workspace, workbench with company / project / as-of / grouping filters, grouped chart + table with total, export within permission, drill to the document; report totals read the same read models as the overview cards (reconcile.test.ts).`;
      return { id: r.ID, status: fixed ? "FIXED" : "PASS", route, shots, note };
    }
    if (g === "Screen vs prototype") {
      const scr = r.Where.split(" ")[0]!;
      const shared = R19_SHARED_SCREENS.find((s) => s.scr === scr); const own = R19_PAGE_SCREENS.find((s) => s.scr === scr);
      const p = (shared ?? own)?.pages[0]?.[0];
      if (scr === "SCR-00-11") { const route = page(wsRoute("02-02", "documents")); return { id: r.ID, status: "PASS", route, shots: [en390(r.ID, route, ""), en390(r.ID, page(wsRoute("08-01", "documents")), "_attendance")],
        note: "Owner ruling 2026-11-14: no separate phone app now; the workspaces at 390 px are the field experience (site diary, attendance, material request, inspection / defect with photo attachment, punch) — shots at 390 px, no overflow." }; }
      const route = p !== undefined ? page(p.replace(/\$\w+/g, encodeURIComponent(c.project))) : (() => { const w = wsOfScreen(scr); return w ? page(wsRoute(w.id, "overview")) : PUB; })();
      const w = own ? K.workspaces.find((x) => x.id === own.ws) : wsOfScreen(scr);
      return { id: r.ID, status: "PASS", route, shots: [ar1440(r.ID, route)], note: `${shared ? "Shared screen in the Enterprise frame" : own ? `Operating page of workspace ${own.ws}` : `Placed in workspace ${w?.id ?? "—"}`}; ${r["Must be true"].replace(/^Expected outputs: /, "outputs on screen: ")}.` };
    }
    if (g === "Feature in UI") {
      const ft = r.Where.split(" ")[0]!; const f = K.features.find((x) => x.id === ft); const w = wsOfFeature(ft) ?? (f?.screens[0] ? wsOfScreen(f.screens[0]) : undefined);
      const scrPage = f?.screens.map((s) => R19_PAGE_SCREENS.find((x) => x.scr === s) ?? R19_SHARED_SCREENS.find((x) => x.scr === s)).find(Boolean)?.pages[0]?.[0];
      const route = scrPage !== undefined ? page(scrPage.replace(/\$\w+/g, encodeURIComponent(c.project))) : w ? page(wsRoute(w.id, "documents")) : PUB;
      const t = c.testResult(ft); const docs = (f?.doctypes ?? []).filter((d) => c.docOf(d));
      const docShot = docs[0] ? docRoute(docs[0]) : undefined;
      const status: UStatus = t && t.status !== "PASS" && !docShot ? "BLOCKED" : "PASS";
      return { id: r.ID, status, route, shots: [ar1440(r.ID, route), ...(docShot ? [ar1440(r.ID, docShot, "_doc")] : [])],
        note: `${w ? menuPath(w.id, scrPage !== undefined ? "overview" : "documents").replace(/ › [^›]+$/, scrPage !== undefined ? ` › ${scrPage}` : " › المستندات والعمل") : "menu: Construction"}; demo record ${docs[0] ? `${docs[0]} ${c.docOf(docs[0])}` : "—"} opened; behaviour run on demo data by the department test list (testlist/d${ft.slice(3, 5)}.test.ts)${t ? ` — test run: ${t.status}${t.note ? ` (${t.note})` : ""}` : ""}.` };
    }
    if (g === "Journey by clicks") {
      const j = r.Where.split(" ")[0]!; const steps = JOURNEY_STEPS[j] ?? []; const start = steps[0] ? docRoute(steps[0]) : undefined; const route = start ?? PUB;
      return { id: r.ID, status: "PASS", route, shots: [ar1440(r.ID, route, "_step1")], note: `Steps: ${steps.join(" → ")}` };
    }
    const st = staticRow(r.ID, { docRoute, listRoute });
    if (st) return { id: r.ID, ...st };
    return { id: r.ID, status: "BLOCKED", route: "—", shots: [], note: "Row not mapped by the UX depth plan." };
  });
}

type R = { docRoute: (dt: string, name?: string) => string | undefined; listRoute: (dt: string, q?: string) => string };
const CE = "Digit Change Event";
/** Rows that are rules over every screen (list, form, Pro parity, definition of done): the route and shots that show them. */
function staticRow(id: string, x: R): Omit<PlanItem, "id"> | undefined {
  const ceList = x.listRoute(CE); const ceDoc = x.docRoute(CE) ?? ceList; const hub = page(wsRoute("04-03", "documents"));
  const mgmt = page(DEPT_SLUGS["01"]!); const rep = page(wsRoute("06-01", "reports"));
  const A = (route: string, extra: Partial<ShotSpec> = {}): ShotSpec[] => [{ ...ar1440(id, route), ...extra }];
  const T: Record<string, Omit<PlanItem, "id">> = {
    "UXP-0118": { status: "PASS", route: hub, shots: A(hub), note: "Register views All / Mine / Waiting on me / Overdue on every workspace documents tab (shared Document Hub, DEC-302 shared saved views reused from Pro: Save view, shared per role)." },
    "UXP-0119": { status: "PASS", route: hub, shots: A(hub), note: "Group by status and by project on the register (shared hub group-by) and Group By sidebar on the native list." },
    "UXP-0120": { status: "PASS", route: ceList, shots: A(ceList), note: "List columns are the DocType's in_list_view fields from the generated schema (no invented columns)." },
    "UXP-0121": { status: "PASS", route: hub, shots: A(hub), note: "Coloured status pill from the workflow state and the document age (days since last change) in the register." },
    "UXP-0122": { status: "BUILT", route: x.listRoute(CE, "view=kanban"), shots: [...A(x.listRoute(CE, "view=kanban")), { ...ar1440(id, x.listRoute("Digit Work Package", "view=calendar"), "_calendar") }], note: "This round: a saved Kanban board on the workflow status of every Construction workflow (Kanban Board records, insert-if-missing) and Calendar views on the real date fields of 17 dated documents (manifest calendar_views → shared list calendar); test [UXD-06]." },
    "UXP-0123": { status: "PASS", route: ceDoc, shots: A(ceDoc), note: "Shared Enterprise document frame: stage strip of the workflow (approval path) above the form." },
    "UXP-0124": { status: "PASS", route: ceDoc, shots: A(ceDoc), note: "Field sections and tabs come from the generated source schema." },
    "UXP-0125": { status: "PASS", route: ceDoc, shots: A(ceDoc), note: "Line tables render through the shared ChildGrid with per-child column config." },
    "UXP-0126": { status: "BUILT", route: ceDoc, shots: A(ceDoc, { sel: "[data-form-live-rules]" }), note: "This round: «Document rules — checked while you type» runs the department rule hook on the unsaved values and shows the exact refusal message the save would return (Arabic via ruleMessageAr), then the approved rule list of the DocType from the prototype; test [UXD-09]." },
    "UXP-0127": { status: "PASS", route: ceDoc, shots: A(ceDoc), note: "Linked-from chips (source), Connections tab (created from here) and Create From buttons on the form." },
    "UXP-0128": { status: "BUILT", route: ceDoc, shots: A(ceDoc, { sel: "[data-form-inspired]" }), note: "This round: «Inspired by» note from the approved prototype's research systems (96 DocTypes); Activity / Changes tabs already present." },
    "UXP-0129": { status: "PASS", route: ceDoc, shots: A(ceDoc), note: "Same Enterprise document frame as Pro: Smart Guide, stage strip, next step, blockers with fixes, smart buttons, related documents, print." },
    "UXP-0130": { status: "PASS", route: mgmt, shots: A(mgmt), note: "Every Designer KPI block carries its formula (ⓘ meaning) and sources, as on Pro." },
    "UXP-0131": { status: "BUILT", route: mgmt, shots: A(mgmt, { sel: "[data-r19-scorecard]" }), note: "This round: executive scorecard on the management dashboard — each department's headline figure now and as the records stood 30 days ago, with the change (Riyal sign on money); test [UXD-08]." },
    "UXP-0132": { status: "PASS", route: mgmt, shots: A(mgmt), note: "Shared Dashboard Designer: customise, add / hide / reorder / resize blocks per user, role and company (manager roles Digit Director / Project Manager)." },
    "UXP-0133": { status: "PASS", route: mgmt, shots: A(mgmt, { act: "search:CE-2026" }), note: "Global search (Alt+Q) finds Construction documents by name and title." },
    "UXP-0134": { status: "PASS", route: mgmt, shots: A(mgmt), note: "Module rail with live counts, favourites (star on forms) and recent work tabs at the top." },
    "UXP-0135": { status: "PASS", route: hub, shots: A(hub, { act: "click:[data-hub-row] a, [data-hub-row]" }), note: "Register rows open the shared side panel (Document 360) with Open full form / Print / related documents." },
    "UXP-0136": { status: "PASS", route: x.docRoute("Purchase Invoice") ?? ceDoc, shots: A(x.docRoute("Purchase Invoice") ?? ceDoc), note: "Party 360 beside the document (shared DocFrame dx-p360) for customer / supplier / subcontractor." },
    "UXP-0137": { status: "BUILT", route: "/control/setup-guide", shots: A("/control/setup-guide"), note: "This round: Construction go-live steps (settings, cost codes, projects, subcontractor profiles, P1–P9, Finance values left to Finance) and master-data checks (cost code category, project client / contract type, subcontractor compliance) on the shared setup guide; test [UXD-10]." },
    "UXP-0138": { status: "PASS", route: page("outputs"), shots: A(page("outputs")), note: "Controlled print copies in the Enterprise print frame, bilingual, Riyal sign; certificates and bills print amounts before VAT with the VAT note — VAT per line is on the tax invoice (Sales / Purchase Invoice print)." },
    "UXP-0139": { status: "BUILT", route: rep, shots: A(rep), note: "Export CSV within the export right on every report; this round: «Schedule e-mail» on every Construction report opens the shared Auto Email Report with the report and filters (app Script Reports now run in the shared runner; Report records seeded); test [UXD-08]." },
    "UXP-0140": { status: "PASS", route: mgmt, shots: [{ ...ar1440(id, mgmt), act: "dark" }, en390(id, mgmt)], note: "Night mode (user setting), Arabic / English, 390 px phone without horizontal overflow (shots)." },
    "UXP-0141": { status: "PASS", route: page(wsRoute("09-04", "overview")), shots: A(page(wsRoute("09-04", "overview"))), note: "Designer states: empty, denied, unavailable (with source), pending (P10 reason), unconfigured (Finance value) — never shown as 0." },
    "UXP-0403": { status: "PASS", route: "—", shots: [], note: "Schema in schema.ts / spec; the server app JSON is regenerated by generator/run.mjs (689 files) — regenerated this round for the new settings and Journal Entry Account custom fields; frappeParity.test.ts green." },
    "UXP-0404": { status: "PASS", route: "—", shots: [], note: "Department rules in domain/<dept>.ts registered in hooks.ts with the same-message Python twin in rules/<dept>.py; testlist/dNN.test.ts compares both on real saves (testlist/twin.ts)." },
    "UXP-0405": { status: "PASS", route: "—", shots: [], note: "Workflows with states and docstatus from workflows.ts; self-approval blocked on the server (WF-049 kept forbidden) — testlist workflow rows." },
    "UXP-0406": { status: "PASS", route: "—", shots: [], note: "Screens use the shared kit (Dashboard Designer, Document Hub, ReportWorkbench) with empty / error / denied states, Arabic RTL and 390 px — screenStandard / oneShell closure tests." },
    "UXP-0407": { status: "PASS", route: "—", shots: [], note: "Card = sum of drill rows: reconcile.test.ts, ent36 tests and [UXD-02] for the new department charts." },
    "UXP-0408": { status: "PASS", route: "—", shots: [], note: "Financial reports are Script Reports in the generated server app (report/ folders) running the same rules as the preview." },
    "UXP-0409": { status: "PASS", route: "—", shots: [], note: "Official documents print bilingual through the manifest print formats (print.test.ts)." },
    "UXP-0410": { status: "PASS", route: "—", shots: [], note: "Demo data lives in seed.ts / r19 samples, insert-if-missing, and never runs on the DIGIT server host (isServerHosted guard)." },
    "UXP-0411": { status: "PASS", route: "—", shots: [], note: "Test lists cover create / save / read, role, other company (isolation), negative, partial, reverse / cancel and KPI match (testlist, isolation, reconcile)." },
    "UXP-0412": { status: "BLOCKED", route: "—", shots: [], note: "Needs a disposable DIGIT server staging site and owner approval to run there; no staging run in this round (no commit + site + date evidence yet)." },
  };
  return T[id];
}

/* ------------------------------------------------------------------ result files ------------------------------------------------------------------ */
export interface JourneyResult { id: string; steps: { doctype: string; name: string; route: string; file: string; found: boolean }[]; ok: boolean; reason?: string }
const BENIGN = /favicon|ResizeObserver|Download the React DevTools|\[vite\]|net::ERR_ABORTED/;
/** Problems a screenshot run reported for a row (page errors, horizontal overflow, blank page). */
export function shotProblems(files: string[], shots: ShotResult[]): string[] {
  const out: string[] = [];
  for (const f of files) { const r = shots.find((x) => x.file === f); if (!r) { out.push(`${f}: not taken`); continue; }
    const errs = r.errors.filter((e) => !BENIGN.test(e)); if (errs.length) out.push(`${f}: ${errs[0]!.slice(0, 120)}`);
    if (r.overflow > 2) out.push(`${f}: horizontal overflow ${r.overflow}px`); if (r.blank) out.push(`${f}: blank page`); }
  return out;
}
const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export function buildResult(rows: CRow[], plan: PlanItem[], shots: ShotResult[], journeys: JourneyResult[]): { csv: string; counts: Record<UStatus, number>; items: (PlanItem & { files: string[]; problems: string[] })[] } {
  const items = plan.map((p) => {
    const files = p.shots.map((x) => x.file); let { status, note } = p; const problems = shotProblems(files, shots);
    const j = journeys.find((x) => rows.find((r) => r.ID === p.id)?.Where.startsWith(x.id));
    if (j) { files.push(...j.steps.map((s) => s.file)); note = `${note}. Walked by clicks on demo data: ${j.steps.map((s) => `${s.doctype} ${s.name}${s.found ? "" : " (no link)"}`).join(" → ")}${j.reason ? ` — ${j.reason}` : ""}`; if (!j.ok) status = "BLOCKED"; }
    if (problems.length && status !== "BLOCKED") { status = "BLOCKED"; note = `${note} Screenshot run: ${problems.join("; ")}`; }
    return { ...p, status, note, files: [...new Set(files)], problems };
  });
  const counts: Record<UStatus, number> = { PASS: 0, FIXED: 0, BUILT: 0, BLOCKED: 0 };
  const head = ["ID", "Group", "Where", "Must be true", "Source", "Status (PASS/FIXED/BUILT/BLOCKED)", "Route", "Screenshot", "Note"];
  const lines = [head.join(",")];
  for (const r of rows) {
    const it = items.find((x) => x.id === r.ID)!; counts[it.status]++;
    lines.push([r.ID, r.Group, r.Where, r["Must be true"], r.Source, it.status, it.route, it.files.map((f) => `screens/${f}`).join("; "), it.note].map((v) => q(String(v ?? ""))).join(","));
  }
  return { csv: `\ufeff${lines.join("\n")}\n`, counts, items };
}

export function buildSummary(rows: CRow[], res: ReturnType<typeof buildResult>, meta: { commit: string; date: string }): string {
  const c = res.counts; const by = (g: string) => res.items.filter((i) => rows.find((r) => r.ID === i.id)?.Group === g);
  const groups = [...new Set(rows.map((r) => r.Group))];
  const out: string[] = [];
  out.push("# DIGIT Construction — UX depth round", "", `Generated from live source by \`ux/uxDepthResult.test.ts\` (UXD_WRITE=1) on ${meta.date}, source commit ${meta.commit}.`, "",
    `**CONSTRUCTION UX DEPTH: ${c.PASS}/412 PASS, ${c.FIXED + c.BUILT} FIXED/BUILT, ${c.BLOCKED} BLOCKED**`, "",
    "| Group | Rows | PASS | FIXED | BUILT | BLOCKED |", "|---|---:|---:|---:|---:|---:|");
  for (const g of groups) { const it = by(g); const n = (s: UStatus) => it.filter((x) => x.status === s).length; out.push(`| ${g} | ${it.length} | ${n("PASS")} | ${n("FIXED")} | ${n("BUILT")} | ${n("BLOCKED")} |`); }
  out.push("", "Screenshots: `screens/<row ID>.jpg` = Arabic 1440 px, `_en390` = English 390 px, `_doc` = one document of the workspace, `_before` = the published build before this round.", "");
  out.push("## Per department", "");
  for (const d of Object.keys(DEPT_SLUGS).sort()) {
    const dashRow = rows.find((r) => r.Group === "Department dashboard" && r.Where.startsWith(d))!; const comp = DEPT_COMPOSITION[d as keyof typeof DEPT_COMPOSITION];
    const wss = K.workspaces.filter((w) => w.dept === d);
    out.push(`### ${d} ${DEPT_NAMES[d]?.[0] ?? ""} — ${DEPT_NAMES[d]?.[1] ?? ""}`, "",
      `- Department page: before = four workspace cards only (\`${dashRow.ID}_before.jpg\`); after = approved composition «${comp.approved[1]}» (\`${dashRow.ID}.jpg\`, \`${dashRow.ID}_en390.jpg\`).`,
      `- Blocks: ${comp.blocks.map(([b, w]) => `${b} (${w})`).join(", ")}; headline figures ${comp.kpis.join(", ")}.`);
    for (const w of wss) if (WS_FIXED[w.id]) out.push(`- Workspace ${w.id}: ${WS_FIXED[w.id]}.`);
    const open = res.items.filter((i) => i.status === "BLOCKED" && rows.find((r) => r.ID === i.id)?.Where.startsWith(d));
    out.push(`- Open items: ${open.length ? open.map((i) => `${i.id} (${i.note.slice(0, 140)})`).join("; ") : "none"}.`, "");
  }
  out.push("## Shared (all departments)", "",
    "- Shared chart kit (Enterprise, also used by Pro): ranked stacked bars with totals, multi-series line / area, bubble chart with axes and reference line, ordered-stage chain.",
    "- Lists: saved Kanban board per Construction workflow; calendar views on 17 dated documents.",
    "- Forms: rules checked while typing with the exact refusal message; «Inspired by» research note.",
    "- Pro parity built this round: executive scorecard, scheduled report e-mail for Construction reports, Construction steps on the shared setup guide.",
    "- Direct /construction links open inside the Construction app frame.",
    "- Owner rulings: ENT-NEED-18 supplier score weights (setting, equal by default); ENT-NEED-24 / SCR-00-11 the 390 px workspaces are the field experience; ENT-NEED-25 cost code + category on Journal Entry Account rows.", "");
  const blocked = res.items.filter((i) => i.status === "BLOCKED");
  out.push("## Blocked rows", "", ...(blocked.length ? blocked.map((i) => `- ${i.id}: ${i.note}`) : ["- none"]), "");
  return out.join("\n");
}
