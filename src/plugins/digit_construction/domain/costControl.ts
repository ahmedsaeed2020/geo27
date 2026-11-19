/**
 * Department 06 (budget and cost control) — save rules and read models the owner spec catalog FT-06-01 … FT-06-15
 * and decisions DEC-079 … DEC-172 add on top of the existing budget / revision / transfer / allocation / forecast
 * documents: cost codes checked against the cost-code master (refused on budget lines, a warning on purchase and
 * invoice rows), a used code cannot change, pay-item links with shares (DEC-156), allocation splits that add up to
 * the source row exactly (F06-07-1 / DEC-083 / DEC-123), the Qty × Rate and Average Performance ETC methods
 * (F06-09-1), forecast promotion with a rationale (F06-11-1), the chain of approved forecasts (F06-12-1), revised and
 * potential budget (F06-03-1), pay-item margin (F06-08-1), earned revenue (F06-13-1, booked by certificate per
 * DEC-157), margin fade (F06-14-1) and the four KPIs K06-01 … K06-04. Save rules are pure functions of
 * (doc, before, store) registered by hooks.ts; rules/cost_control.py is the server twin with the same messages.
 * Reads go through asSystem so a rule never depends on what the session user may read. Nothing here posts.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { num, r2, sumBy } from "./calc";
import { approvedBudget, asSystem, contractsOf, costPosition, costSourceRows, costSources, isSubmitted, latestForecast, list, rows, today } from "./data";
import { budgetCheck, budgetKey, budgetOverruns } from "./control";
import { addWorkingDays } from "./commercial";
import { constructionProjects } from "./queues";

type Row = Record<string, unknown>;
export type CostRes = { doc: Doc; errors: string[] };
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const all = (dt: string, pred?: (d: Doc) => boolean) => asSystem(() => list(dt, pred));
const get = (dt: string, n: unknown) => (n ? asSystem(() => adapter.get(dt, s(n))) : undefined);
export const fill = (t: string, ...a: unknown[]) => t.replace(/\{(\d+)\}/g, (_m, i: string) => s(a[Number(i)]));
const fmt = (n: number) => String(r2(n));
const pct = (a: number, b: number) => (b ? r2((100 * a) / b) : null);

/** DEC-124: roles that submit (approve) a Digit Cost Allocation. */
export const ALLOC_APPROVERS = ["Digit Accountant", "Digit Project Manager", "Digit Director", "System Manager"];
export const COST_MSG = {
  unknownCode: "Cost code {0} is not in the cost code master",
  codeInUse: "Cost code {0} is in use — retire it instead of changing it",
  linkOver: "Budget line {0} is linked {1}% to pay items — more than 100%",
  linkLine: "Pay item link row {0}: {1} is not a line of this budget",
  linkSov: "Pay item link row {0}: {1} is not an SOV line of contract {2}",
  linkShare: "Pay item link row {0}: the share must be more than 0%",
  splitTotal: "The allocation splits total {0}% — they must total 100%",
  splitLine: "Split row {0}: {1} is not a line of the approved budget {2}",
  zeroInstalled: "Row {0}: installed quantity is zero — performance cannot be computed",
  rationale: "A rationale is required to promote forecast lines",
  promoteNone: "Select the forecast lines to promote",
  noLive: "There is no approved (live) forecast to promote into",
  notWorking: "Only a working (draft) forecast version can be promoted",
  warnBudget: "Budget line {0} on {1}: committed + actual would reach {2} against the revised budget {3} — allowed with a warning",
  warnUnknown: "Cost code {0} is not in the cost code master — the document is not blocked",
  warnRetired: "Cost code {0} is retired — the document is not blocked",
  taskProject: "Row {0}: task {1} belongs to project {2}, not {3}",
  codeProject: "Cost code {0} belongs to project {1} only",
  allocSelf: "The allocation must be submitted by an accountant, project manager or director, not by {0}",
};
const WARN_AR: Record<string, string> = {
  [COST_MSG.warnBudget]: "بند الموازنة {0} في {1}: سيبلغ الملتزم مع الفعلي {2} مقابل الموازنة المعدلة {3} — مسموح مع تحذير",
  [COST_MSG.warnUnknown]: "رمز التكلفة {0} غير موجود في المرجع — المستند لا يُمنع",
  [COST_MSG.warnRetired]: "رمز التكلفة {0} غير نشط — المستند لا يُمنع",
};

// ---------------------------------------------------------------- FT-06-01 cost-code master
const codeOf = (x: Doc) => s(x["code"] || x.name).trim();
/** The cost-code master by code (empty map = no master in use, so nothing is checked against it). */
export function codeMaster(): Map<string, Doc> { return new Map(all("Digit Cost Code").map((x) => [codeOf(x), x] as const)); }
/** F06-01-1: codes the master does not hold (only when a master exists). */
export function unknownCodeErrors(codes: unknown[], project = ""): string[] {
  const m = codeMaster(); if (!m.size) return [];
  const u = [...new Set(codes.map((c) => s(c).trim()).filter(Boolean))];
  // DEC-154: company-wide codes plus project-specific codes (Project set) usable only on that project
  return [...u.filter((c) => !m.has(c)).map((c) => fill(COST_MSG.unknownCode, c)),
    ...u.filter((c) => project && s(m.get(c)?.["project"]) && s(m.get(c)?.["project"]) !== project).map((c) => fill(COST_MSG.codeProject, c, s(m.get(c)?.["project"])))];
}
/** Where a cost code is used: budget lines, BOQ items, purchase / invoice / material / stock rows, journal lines, work-order lines. */
export function codeInUse(code: string): boolean {
  const c = code.trim(); if (!c) return false;
  const hit = (dt: string, table: string, field: string) => all(dt, (d) => num(d.docstatus) !== 2 && rows(d, table).some((r) => s(r[field]).trim() === c)).length > 0;
  return hit("Digit Project Cost Budget", "lines", "cost_code") || hit("Digit BOQ", "items", "cost_code") || hit("Purchase Order", "items", "digit_cost_code") || hit("Purchase Invoice", "items", "digit_cost_code")
    || hit("Material Request", "items", "digit_cost_code") || hit("Stock Entry", "items", "digit_cost_code") || hit("Journal Entry", "accounts", "digit_cost_code") || hit("Digit Subcontract Work Order", "lines", "cost_code");
}
/** F06-01-2: a used code never changes; retiring it (Active = No) only stops new use. */
export function codeChangeErrors(doc: Doc, before: Doc | undefined): string[] {
  if (!before) return [];
  const was = s(before["code"] || before.name).trim(), now = s(doc["code"] || doc.name).trim();
  return was && now !== was && codeInUse(was) ? [fill(COST_MSG.codeInUse, was)] : [];
}

// ---------------------------------------------------------------- budget (F06-01-1 codes, DEC-156 pay-item links)
/** Budget save: unknown codes refused when newly picked by a user, and on every line at approval; pay-item links resolved and checked. */
export function budgetExtras(doc: Doc, before: Doc | undefined, service: boolean): CostRes {
  const e: string[] = [];
  const lines = rows(doc, "lines"); const codes = lines.map((l) => s(l["cost_code"]));
  const had = new Set(rows(before, "lines").map((l) => s(l["cost_code"])));
  // codes picked by a user are checked; lines a service copies from the approved estimate keep the estimate's codes
  if (!service) e.push(...unknownCodeErrors(codes.filter((c) => !had.has(c)), s(doc["project"])));
  const links = rows(doc, "pay_item_links"); if (!links.length) return { doc, errors: e };
  const project = s(doc["project"]);
  const cs = asSystem(() => contractsOf(project)).filter((c) => num(c.docstatus) !== 2);
  const share = new Map<string, number>();
  const out = links.map((x, i): Row => {
    const l = lines.find((y) => y["line_key"] === x["budget_line"] || y["cost_code"] === x["budget_line"]);
    if (!l) e.push(fill(COST_MSG.linkLine, i + 1, s(x["budget_line"])));
    const contract = s(x["contract"]) || s(cs[0]?.name);
    const c = cs.find((y) => y.name === contract) ?? get("Digit Client Contract", contract);
    const sov = rows(c, "sov_lines").find((y) => y["line_key"] === x["sov_line"] || y["name"] === x["sov_line"]);
    if (!sov) e.push(fill(COST_MSG.linkSov, i + 1, s(x["sov_line"]), contract));
    if (!(num(x["share_pct"]) > 0)) e.push(fill(COST_MSG.linkShare, i + 1));
    const key = s(l?.["line_key"] ?? x["budget_line"]); share.set(key, r2((share.get(key) ?? 0) + num(x["share_pct"])));
    return { ...x, idx: i + 1, contract, sov_line: sov?.["line_key"] ?? x["sov_line"], budget_line: key, cost_code: l?.["cost_code"] ?? "" };
  });
  for (const [k, v] of share) if (v > 100.00005) e.push(fill(COST_MSG.linkOver, k, fmt(v)));
  return { doc: { ...doc, pay_item_links: out }, errors: e };
}

// ---------------------------------------------------------------- F06-07-1 allocation splits
/** Splits of a cost allocation: percent or amount per budget line; a blank last row takes the remainder; 100.0000 % exactly to submit (DEC-083 / DEC-123). */
export function allocationSplits(doc: Doc, budget: Doc | undefined, amount: number): { splits: Row[]; remainder: number | null; errors: string[] } {
  const sp = rows(doc, "allocation_splits"); if (!sp.length) return { splits: [], remainder: null, errors: [] };
  const e: string[] = []; const bl = rows(budget, "lines");
  const given = (x: Row) => num(x["percent"]) > 0 || num(x["amount"]) > 0;
  const blankLast = sp.length > 1 && !given(sp[sp.length - 1] ?? {}) && sp.slice(0, -1).every(given);
  const out = sp.map((x, i): Row => {
    const l = bl.find((y) => y["line_key"] === x["budget_line"] || y["cost_code"] === x["budget_line"]);
    if (!l) e.push(fill(COST_MSG.splitLine, i + 1, s(x["budget_line"]), s(budget?.name)));
    const p = num(x["percent"]) > 0 ? num(x["percent"]) : amount ? (100 * num(x["amount"])) / amount : 0;
    return { ...x, idx: i + 1, budget_line: l?.["line_key"] ?? x["budget_line"], cost_code: l?.["cost_code"] ?? "", percent: Math.round(p * 10000) / 10000 };
  });
  const last = out[out.length - 1];
  if (blankLast && last) { const used = sumBy(out.slice(0, -1), (x) => num(x["percent"])); last["percent"] = Math.round((100 - used) * 10000) / 10000; }
  let left = amount;
  out.forEach((x, i) => { const v = i === out.length - 1 && Math.abs(sumBy(out, (y) => num(y["percent"])) - 100) < 0.00005 ? r2(left) : r2((amount * num(x["percent"])) / 100); x["amount"] = v; left = r2(left - v); });
  const total = Math.round(sumBy(out, (x) => num(x["percent"])) * 10000) / 10000;
  if (num(doc.docstatus) === 1 && Math.abs(total - 100) >= 0.00005) e.push(fill(COST_MSG.splitTotal, String(total)));
  return { splits: out, remainder: r2(amount - sumBy(out, (x) => num(x["amount"]))), errors: e };
}

// ---------------------------------------------------------------- F06-09 / F06-11 / F06-12 forecast
/** Save checks of a forecast snapshot: performance needs an installed quantity; a promotion needs its rationale. */
export function forecastErrors(doc: Doc): string[] {
  const e = rows(doc, "lines").flatMap((l, i) => (l["method"] === "Average Performance" && !(num(l["qty_installed"]) > 0) ? [fill(COST_MSG.zeroInstalled, i + 1)] : []));
  if (s(doc["promoted_from"]) && !s(doc["rationale"]).trim()) e.push(COST_MSG.rationale);
  return e;
}
/** F06-12-1: the live forecast an approval supersedes (stamped as previous_snapshot). */
export const previousLive = (doc: Doc) => { const l = asSystem(() => latestForecast(s(doc["project"]))); return l && l.name !== doc.name ? l.name : ""; };
const INPUTS = ["method", "manual_etc", "uncommitted_remaining", "qty_budget", "qty_installed", "unit_rate", "confidence", "reason_code", "note"];
/** F06-11-1: candidate lines = the live forecast with only the selected lines taken from the working version. */
export function promotionLines(working: Doc, live: Doc, keys: string[]): Row[] {
  const w = new Map(rows(working, "lines").map((l) => [s(l["line_key"]), l]));
  return rows(live, "lines").map((l) => {
    const src = keys.includes(s(l["line_key"])) ? w.get(s(l["line_key"])) ?? l : l;
    return { line_key: l["line_key"], ...Object.fromEntries(INPUTS.filter((k) => src[k] !== undefined).map((k) => [k, src[k]])) };
  });
}
/** F06-12-1: approved and superseded snapshots of a project, oldest first, following previous_snapshot links. */
export function forecastChain(project: string): Doc[] {
  const xs = all("Digit Cost Forecast Snapshot", (f) => f["project"] === project && isSubmitted(f) && ["Approved", "Superseded"].includes(s(f["workflow_state"])));
  const byName = new Map(xs.map((x) => [x.name, x]));
  const head = xs.find((x) => x["workflow_state"] === "Approved") ?? [...xs].sort((a, b) => s(b["cutoff_date"]).localeCompare(s(a["cutoff_date"])) || num(b["version"]) - num(a["version"]))[0];
  const chain: Doc[] = []; const seen = new Set<string>();
  for (let x = head; x && !seen.has(x.name); x = byName.get(s(x["previous_snapshot"]))) { chain.unshift(x); seen.add(x.name); }
  // snapshots approved before links were stamped follow in cut-off / version order
  const rest = xs.filter((x) => !seen.has(x.name)).sort((a, b) => s(a["cutoff_date"]).localeCompare(s(b["cutoff_date"])) || num(a["version"]) - num(b["version"]));
  return [...rest, ...chain];
}

// ---------------------------------------------------------------- read models
const projectsIn = (f: Row) => (f["project"] ? [s(f["project"])] : asSystem(() => constructionProjects({ company: (f["company"] as string) || undefined })).map((p) => p.name));
/** F06-03-1: per approved budget line — original, approved revisions, transfers, revised, pending revision deltas and potential. */
export function revisedPotentialRows(f: Row) {
  return projectsIn(f).flatMap((p) => {
    const b = asSystem(() => approvedBudget(p)); if (!b) return [];
    const pending = all("Digit Budget Revision", (r) => r["budget"] === b.name && num(r.docstatus) === 0 && !["Rejected", "Approved"].includes(s(r["workflow_state"])));
    return asSystem(() => costPosition(p)).lines.map((l) => {
      const pd = r2(sumBy(pending.flatMap((r) => rows(r, "deltas")).filter((d) => d["line_key"] === l.line_key), (d) => num(d["delta_amount"])));
      return { project: p, budget: b.name, line_key: l.line_key, cost_code: l.cost_code, description: l.description, original: l.original, revisions: r2(l.revisions), transfers: r2(l.transferIn - l.transferOut), revised: l.revised, pending: pd, potential: r2(l.revised + pd) };
    });
  });
}
/** RPT-N16: rows whose cost code the master does not hold (budget lines and cost source rows), code × document. */
export function unregisteredCodeRows(f: Row) {
  const m = codeMaster();
  return projectsIn(f).flatMap((p) => {
    const b = asSystem(() => approvedBudget(p));
    const bud = rows(b, "lines").filter((l) => s(l["cost_code"]) && !m.has(s(l["cost_code"]).trim())).map((l) => ({ project: p, cost_code: s(l["cost_code"]), source_doctype: "Digit Project Cost Budget", document: s(b?.name), row: num(l["idx"]), amount: r2(num(l["original_amount"])) }));
    const src = asSystem(() => costSourceRows(p)).filter((x) => x.code && !m.has(x.code.trim())).map((x) => ({ project: p, cost_code: x.code, source_doctype: x.doctype, document: x.name, row: x.row, amount: x.amount }));
    return [...bud, ...src];
  }).sort((a, b) => a.cost_code.localeCompare(b.cost_code) || a.document.localeCompare(b.document) || a.row - b.row);
}
/** RPT-N17: budget lines whose committed + actual exceed the revised budget (control.ts budgetOverruns). */
export function overrunRows(f: Row) {
  return projectsIn(f).flatMap((p) => asSystem(() => budgetOverruns(p))).map((o) => ({ project: o.project, cost_code: o.cost_code, description: o.description, revised: o.revised, committed: o.committed, actual: o.actual, over: o.over, pct: o.pct }));
}
/** Pay-item links of a contract's project budget, by SOV line key. */
function linksOf(c: Doc) {
  const b = asSystem(() => approvedBudget(s(c["project"])));
  const m = new Map<string, Row[]>();
  for (const x of rows(b, "pay_item_links")) if (!s(x["contract"]) || x["contract"] === c.name) m.set(s(x["sov_line"]), [...(m.get(s(x["sov_line"])) ?? []), x]);
  return m;
}
const certifiedBy = (c: Doc) => {
  const m = new Map<string, number>();
  for (const cert of all("Digit Client Certificate", (x) => x["contract"] === c.name && isSubmitted(x))) for (const l of rows(cert, "lines")) m.set(s(l["sov_line_key"]), r2((m.get(s(l["sov_line_key"])) ?? 0) + num(l["amount"])));
  return m;
};
const lineValue = (l: Row) => r2(num(l["amount"]) || num(l["qty"]) * num(l["rate"]));
function contractsIn(f: Row): Doc[] {
  if (f["contract"]) { const c = get("Digit Client Contract", f["contract"]); return c ? [c] : []; }
  const ps = new Set(projectsIn(f)); return all("Digit Client Contract", (c) => ps.has(s(c["project"])) && num(c.docstatus) !== 2);
}
/** F06-08-1 / RPT-N18: SOV line value − Σ (linked budget line EAC × share); earned margin = certified − linked (actual + ETC). */
export function payItemMarginRows(f: Row) {
  return contractsIn(f).flatMap((c) => {
    const pos = asSystem(() => costPosition(s(c["project"]))); const links = linksOf(c); const cert = certifiedBy(c);
    return rows(c, "sov_lines").map((l) => {
      const ls = links.get(s(l["line_key"])) ?? []; const value = lineValue(l);
      const parts = ls.map((x) => ({ x, p: pos.lines.find((y) => y.line_key === x["budget_line"]) }));
      const known = ls.length > 0 && parts.every((q) => q.p && q.p.eac !== null);
      const linkedEac = known ? r2(sumBy(parts, (q) => (num(q.p!.eac) * num(q.x["share_pct"])) / 100)) : null;
      const linkedActual = r2(sumBy(parts, (q) => ((q.p?.actual ?? 0) * num(q.x["share_pct"])) / 100));
      const certified = cert.get(s(l["line_key"])) ?? 0;
      const marginV = linkedEac === null ? null : r2(value - linkedEac);
      return { contract: c.name, sov_line: s(l["line_key"]), description: s(l["description"]), revised_amount: value, links: ls.length, linked_eac: linkedEac, margin: marginV, margin_pct: marginV === null ? null : pct(marginV, value),
        certified, actual: linkedActual, earned_margin: linkedEac === null ? null : r2(certified - linkedEac) };
    });
  });
}
/** Mean progress of the tasks linked to an SOV line (Task.digit_sov_line = line name or key); null when none. */
function sovProgress(project: string, l: Row): number | null {
  const ts = all("Task", (t) => t["project"] === project && (t["digit_sov_line"] === l["line_key"] || (!!l["name"] && t["digit_sov_line"] === l["name"])));
  return ts.length ? r2(sumBy(ts, (t) => num(t["progress"])) / ts.length) : null;
}
/** The earned rule of an SOV line: Cost-to-Cost / Percent / Finish (Start/Finish) / Certified (blank, Certified, Milestone, Certified Quantity). */
export function earnedRule(l: Row): "Certified" | "Percent" | "Cost-to-Cost" | "Finish" {
  if (l["earned_value_basis"] === "Cost-to-Cost") return "Cost-to-Cost";
  if (l["revenue_rule"] === "Percent Complete" || l["earned_value_basis"] === "Physical Progress") return "Percent";
  if (l["revenue_rule"] === "Start/Finish") return "Finish";
  return "Certified";
}
/** F06-13-1: earned revenue of each SOV line under every rule; booked revenue stays the certified value (DEC-157). */
export function earnedRevenueRows(f: Row) {
  return contractsIn(f).flatMap((c) => {
    const project = s(c["project"]); const pos = asSystem(() => costPosition(project)); const links = linksOf(c); const cert = certifiedBy(c);
    return rows(c, "sov_lines").map((l) => {
      const value = lineValue(l); const prog = sovProgress(project, l); const certified = cert.get(s(l["line_key"])) ?? 0;
      const parts = (links.get(s(l["line_key"])) ?? []).map((x) => ({ x, p: pos.lines.find((y) => y.line_key === x["budget_line"]) }));
      const act = sumBy(parts, (q) => ((q.p?.actual ?? 0) * num(q.x["share_pct"])) / 100);
      const known = parts.length > 0 && parts.every((q) => q.p && q.p.eac !== null);
      const e = known ? sumBy(parts, (q) => (num(q.p!.eac) * num(q.x["share_pct"])) / 100) : 0;
      const c2c = known && e > 0 ? r2(value * Math.min(1, act / e)) : null;
      const percent = prog === null ? null : r2((value * prog) / 100);
      const start = prog === null ? null : prog > 0 ? value : 0, finish = prog === null ? null : prog >= 100 ? value : 0;
      // DEC-141: no automatic earned revenue on a Cost Plus contract until its fee policy is approved
      const costPlus = get("Project", project)?.["digit_contract_type"] === "Cost Plus";
      const rule = costPlus ? "Cost Plus" : earnedRule(l);
      const byRule = costPlus ? null : rule === "Cost-to-Cost" ? c2c : rule === "Percent" ? percent : rule === "Finish" ? finish : certified;
      return { contract: c.name, sov_line: s(l["line_key"]), description: s(l["description"]), rule, value, progress_pct: prog, certified, percent_earned: prog, percent_earned_amount: percent, cost_to_cost: c2c, start_earned: start, finish_earned: finish, earned_by_rule: byRule, booked: certified };
    });
  });
}
/** F06-14-1 / RPT-N19: one row per approved forecast in chain order — margin %, fade vs the previous one, split into the revenue and the cost (EAC) effect. */
export function marginFadeRows(f: Row) {
  return projectsIn(f).flatMap((p) => {
    let prev: { rev: number; eac: number; pct: number } | null = null;
    return forecastChain(p).flatMap((x) => {
      const rev = num(x["contract_revenue"]), e = x["total_eac"] === null || x["total_eac"] === undefined ? null : num(x["total_eac"]);
      if (!rev || e === null) return [];
      const m = r2(rev - e), mp = r2((100 * (rev - e)) / rev);
      const fade = prev ? r2(mp - prev.pct) : null;
      const revenueEffect = prev ? r2((100 * (rev - prev.eac)) / rev - prev.pct) : null;
      const row = { project: p, snapshot: x.name, period: s(x["period"]), status: s(x["workflow_state"]), revised_contract: rev, eac: e, margin: m, margin_pct: mp, fade, revenue_effect: revenueEffect, cost_effect: fade === null || revenueEffect === null ? null : r2(fade - revenueEffect) };
      prev = { rev, eac: e, pct: mp };
      return [row];
    });
  });
}

// ---------------------------------------------------------------- K06-01 … K06-04
export interface CostKpi { id: string; value: number; drill: { doctype?: string; report?: string; names: string[] } }
/** The four budget KPIs; each value is the sum (or count) of exactly the rows its drill opens. */
export function costKpis(f: Row = {}): CostKpi[] {
  const ps = new Set(projectsIn(f));
  const revs = all("Digit Budget Revision", (r) => ps.has(s(r["project"] || get("Digit Project Cost Budget", r["budget"])?.["project"])));
  const approved = revs.filter((r) => isSubmitted(r) && r["workflow_state"] === "Approved");
  const pending = revs.filter((r) => num(r.docstatus) === 0 && !["Rejected", "Approved"].includes(s(r["workflow_state"])));
  const over = overrunRows(f);
  return [
    { id: "K06-01", value: r2(sumBy(approved, (r) => num(r["net_change"]))), drill: { doctype: "Digit Budget Revision", names: approved.map((r) => r.name) } },
    { id: "K06-02", value: r2(sumBy(pending, (r) => num(r["net_change"]))), drill: { doctype: "Digit Budget Revision", names: pending.map((r) => r.name) } },
    { id: "K06-03", value: over.length, drill: { report: "Budget Overruns", names: over.map((o) => `${o.project}|${o.cost_code}`) } },
    { id: "K06-04", value: r2(sumBy(over, (o) => o.over)), drill: { report: "Budget Overruns", names: over.map((o) => `${o.project}|${o.cost_code}`) } },
  ];
}

// ---------------------------------------------------------------- F06-01-1 / F06-04-1 warnings on purchase and invoice rows
/** Non-blocking warnings of a purchase order / invoice: over the revised budget within (or without) the limit, unknown or retired codes. */
export function costWarnings(dt: "Purchase Order" | "Purchase Invoice", name: string): { en: string; ar: string }[] {
  const d = get(dt, name); if (!d) return [];
  const w = (t: string, ...a: unknown[]) => ({ en: fill(t, ...a), ar: fill(WARN_AR[t] ?? t, ...a) });
  const out: { en: string; ar: string }[] = [];
  if (dt === "Purchase Order" && num(d.docstatus) === 0) {
    const by = new Map<string, Map<string, number>>();
    for (const it of rows(d, "items")) { const p = s(it["project"] || d["project"]), c = budgetKey(s(it["digit_cost_code"]), it["digit_cost_category"]); if (!p || !s(it["digit_cost_code"])) continue; const m = by.get(p) ?? new Map<string, number>(); m.set(c, r2((m.get(c) ?? 0) + num(it["net_amount"] ?? it["amount"]))); by.set(p, m); }
    for (const [p, m] of by) for (const r of asSystem(() => budgetCheck(p, m))) if (r.status === "Warn") out.push(w(COST_MSG.warnBudget, r.cost_code, p, fmt(r.after), fmt(num(r.revised))));
  }
  // owner ruling: a retired or unknown code on a purchase order is refused (codeBlockErrors); on an invoice it stays a warning
  if (dt === "Purchase Order") return out;
  const m = codeMaster();
  const codes = [...new Set(rows(d, "items").map((it) => s(it["digit_cost_code"]).trim()).filter(Boolean))];
  for (const c of codes) { const x = m.get(c); if (m.size && !x) out.push(w(COST_MSG.warnUnknown, c)); else if (x?.["is_active"] === "No") out.push(w(COST_MSG.warnRetired, c)); }
  return out;
}

/** DEC-099 / DEC-151 (owner ruling) messages. */
export const CAP_MSG = {
  noCap: "No Project Manager approval cap is set — the Director approves every budget",
  overCap: "Budget total {0} is above the Project Manager approval cap {1} — the Director approves it",
};
/**
 * DEC-099 / DEC-151 (owner ruling): budget approval caps are the Construction Settings value `budget_pm_approval_cap`
 * (Finance). A Director (or Administrator) approves any budget; a Project Manager only up to the cap; an empty cap
 * means the Director approves every budget.
 */
export function budgetCapErrors(total: number, user: string, roles: string[], cap: unknown): string[] {
  if (user === "Administrator" || roles.includes("Digit Director")) return [];
  if (cap === undefined || cap === null || cap === "" || !(num(cap) > 0)) return [CAP_MSG.noCap];
  return total > num(cap) + 0.005 ? [fill(CAP_MSG.overCap, fmt(total), fmt(num(cap)))] : [];
}
/** Same message as the budget refusal (site.ts CODE_MSG.retired). */
const CODE_RETIRED = "Cost code {0} is retired — choose an active code";
/**
 * Owner ruling (same as the budget, department 02): a retired or unknown cost code on a purchase order row is refused.
 * On a draft save only codes newly picked are checked; on submit every code is, so no commitment lands on a retired code.
 */
export function poCodeErrors(doc: Doc, before: Doc | undefined): string[] {
  const submitting = num(doc.docstatus) === 1 && num(before?.docstatus) !== 1;
  const had = submitting ? new Set<string>() : new Set(rows(before, "items").map((it) => s(it["digit_cost_code"]).trim()));
  const codes = [...new Set(rows(doc, "items").map((it) => s(it["digit_cost_code"]).trim()).filter((c) => c && !had.has(c)))];
  const m = codeMaster(); if (!m.size || !codes.length) return [];
  return codes.flatMap((c) => { const x = m.get(c); return !x ? [fill(COST_MSG.unknownCode, c)] : x["is_active"] === "No" ? [fill(CODE_RETIRED, c)] : []; });
}

// ---------------------------------------------------------------- DEC-153 task links on material / purchase / stock rows
/** A row's optional task must belong to the row's project (same-project link). */
export function taskProjectErrors(doc: Doc, table = "items"): string[] {
  return rows(doc, table).flatMap((it, i) => {
    const t = s(it["digit_task"]); if (!t) return [];
    const tp = s(get("Task", t)?.["project"]); const rp = s(it["project"] || doc["project"]);
    return tp && rp && tp !== rp ? [fill(COST_MSG.taskProject, num(it["idx"]) || i + 1, t, tp, rp)] : [];
  });
}

// ---------------------------------------------------------------- DEC-087 / DEC-101 / DEC-108 / DEC-126 / DEC-142 / DEC-148 follow-up times
/** Review time per cost-control document (owner rulings): reminder and escalation in working days (Sun–Thu, company holidays), in-system only. */
export const COST_SLA: Record<string, { reminder: number | null; escalate: number | null; to: string; ruling: string }> = {
  "Digit Cost Code": { reminder: 2, escalate: 2, to: "Digit Director", ruling: "DEC-087" },
  "Digit Project Cost Budget": { reminder: 2, escalate: 5, to: "Digit Director", ruling: "DEC-108" },
  "Digit Budget Revision": { reminder: null, escalate: null, to: "", ruling: "DEC-101" },
  "Digit Budget Transfer": { reminder: 2, escalate: 5, to: "Digit Director", ruling: "DEC-108" },
  "Digit Cost Allocation": { reminder: 2, escalate: 3, to: "Digit Director", ruling: "DEC-126" },
  "Digit Cost Exception Review": { reminder: 2, escalate: 3, to: "Digit Director", ruling: "DEC-126" },
  "Digit Cost Forecast Snapshot": { reminder: null, escalate: null, to: "", ruling: "DEC-148" },
};
const PENDING: Record<string, (d: Doc) => boolean> = {
  "Digit Project Cost Budget": (d) => num(d.docstatus) === 0 && (d["workflow_state"] ?? "Draft") === "Draft" && rows(d, "lines").length > 0,
  "Digit Budget Revision": (d) => num(d.docstatus) === 0 && d["workflow_state"] === "Submitted",
  "Digit Budget Transfer": (d) => num(d.docstatus) === 0 && (d["workflow_state"] ?? "Draft") === "Draft",
  "Digit Cost Allocation": (d) => num(d.docstatus) === 0,
  "Digit Cost Exception Review": (d) => num(d.docstatus) === 0,
  "Digit Cost Forecast Snapshot": (d) => num(d.docstatus) === 0 && (d["workflow_state"] ?? "Draft") === "Draft" && d["visibility"] !== "Private",
};
/** Pending cost-control decisions with the reminder / escalation dates their ruling sets; escalated rows go to the named role. */
export function costFollowUpRows(f: Row = {}, on = today()) {
  const ps = new Set(projectsIn(f));
  return Object.entries(PENDING).flatMap(([dt, pending]) => all(dt, (d) => pending(d) && ps.has(s(d["project"] || get("Digit Project Cost Budget", d["budget"])?.["project"])))
    .map((d) => {
      const sla = COST_SLA[dt]!; const from = s(d["modified"] ?? d["creation"]).slice(0, 10) || on; const company = d["company"] ?? get("Project", d["project"])?.["company"];
      const remind = sla.reminder === null ? null : addWorkingDays(company, from, sla.reminder), esc = sla.escalate === null ? null : addWorkingDays(company, from, sla.escalate);
      const state = esc && on > esc ? "Escalated" : remind && on > remind ? "Reminder due" : sla.reminder === null ? "No automatic follow-up" : "Within review time";
      return { doctype: dt, document: d.name, project: s(d["project"] || get("Digit Project Cost Budget", d["budget"])?.["project"]), since: from, reminder_on: remind, escalate_on: esc, escalate_to: state === "Escalated" ? sla.to : "", state, ruling: sla.ruling };
    })).sort((a, b) => a.since.localeCompare(b.since) || a.document.localeCompare(b.document));
}

// ---------------------------------------------------------------- DEC-117 actual cost attribution snapshot (non-financial)
/** The attribution rows a Digit Actual Cost Attribution freezes: every cost source row in its bucket as of the cut-off. */
export function attributionRows(project: string, asOf: string): Row[] {
  return asSystem(() => costSources(project, asOf)).map((x, i) => ({ idx: i + 1, cost_code: x.cost_code, kind: x.kind === "commitment" ? "Commitment" : "Actual", source_doctype: x.doctype, source_name: x.name, source_row: x.row, amount: x.amount, allocation: x.allocation ?? "" }));
}
/** Save rule of the snapshot: rows computed while draft; a submitted snapshot never changes (series ACA). */
export function attributionRule(doc: Doc, before: Doc | undefined): CostRes {
  if (before && num(before.docstatus) >= 1) return { doc, errors: [] };
  const project = s(doc["project"]); if (!project) return { doc, errors: ["Select a project"] };
  const asOf = s(doc["as_of"]).slice(0, 10) || today();
  const rs = attributionRows(project, asOf);
  return { doc: { ...doc, as_of: asOf, budget: asSystem(() => approvedBudget(project))?.name ?? "", attribution_rows: rs, total_committed: r2(sumBy(rs.filter((x) => x["kind"] === "Commitment"), (x) => num(x["amount"]))), total_actual: r2(sumBy(rs.filter((x) => x["kind"] === "Actual"), (x) => num(x["amount"]))) }, errors: [] };
}
