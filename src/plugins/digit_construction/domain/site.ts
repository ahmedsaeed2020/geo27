/**
 * Department 02 (project, site and quality) — save rules and read models for WBS approval, schedule baselines, weekly
 * lookahead, submittals, drawing revisions, transmittals, review workflows, correspondence, site tasks, inspections,
 * defects, punch lists and handover packages (owner spec catalog FT-02-01 … FT-02-18). The rules are pure functions of
 * (doc, before, store) registered as adapter hooks by hooks.ts; rules/site.py is the server twin with the same messages.
 * Reads go through asSystem so a uniqueness or hold-point check never depends on what the session user may read.
 */
import type { Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { num, r2 } from "./calc";
import { approvedBudget, asSystem, list, rows, today } from "./data";

type Row = Record<string, unknown>;
export type SiteRes = { doc: Doc; errors: string[] };
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const day = (v: unknown) => s(v).slice(0, 10);
const live = (d: Doc) => num(d.docstatus) !== 2;
export const plusDays = (d: string, n: number) => new Date(Date.parse(d.slice(0, 10)) + n * 86400000).toISOString().slice(0, 10);
export const daysDiff = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);
const changedTo = (doc: Doc, before: Doc | undefined, f: string, v: string) => doc[f] === v && before?.[f] !== v;
const all = (dt: string, pred?: (d: Doc) => boolean) => asSystem(() => list(dt, pred));
const idx = (rs: Row[]) => rs.map((r, i): Row => ({ ...r, idx: i + 1 }));
const sig = (rs: Row[], fs: string[]) => JSON.stringify(rs.map((r) => fs.map((f) => r[f] ?? null)));
const fmt = (n: number) => String(r2(n));

/** Review outcome order: D is worse than C, C worse than B, B worse than A (F02-07-2, F02-10-2). */
export const OUTCOME_RANK: Record<string, number> = { A: 1, B: 2, C: 3, D: 4 };
export const worstOutcome = (codes: unknown[]) => codes.map((c) => s(c).slice(0, 1)).filter((c) => OUTCOME_RANK[c]).sort((a, b) => OUTCOME_RANK[b]! - OUTCOME_RANK[a]!)[0] ?? "";

export const SITE_MSG = {
  wbsDuplicate: "Duplicate code: {0}", wbsParent: "Parent {1} of node {0} does not exist", wbsCycle: "Cycle in the tree at node {0}",
  wbsCostCode: "Cost code node {0} does not point to a valid budget line",
  baselineExists: "A Project baseline already exists ({0}) — choose another type or replace it by approval", baselineFrozen: "A baseline snapshot cannot be edited",
  confirm: "Confirmation required", lookaheadReason: "Row {0}: reason for non-completion is required",
  siteReportDay: "A site report already exists for the same day: {0}", activityQty: "Row {0}: activity quantity cannot be negative",
  holdPoint: "The hold point is not released yet: no passed inspection on {0} for this task", progressLower: "Progress {0}% is lower than the previous {1}% without a reason",
  rosPast: "Required on site is before today", stepsOpen: "All review steps must be completed", superseded: "Submittal {0} has a newer revision ({1}) and is read-only",
  revisionExists: "Revision {0} already exists", notCurrent: "This is not the current revision (current: {0})",
  transmittalEmpty: "Add at least one item", transmittalFrozen: "Items of a sent transmittal are frozen",
  verifyFirst: "Cannot verify before tracking", trackFirst: "A site task must be opened before it is tracked", photo: "Completion photo is required",
  mandatory: "All mandatory items must be assessed", evidence: "Evidence is required for item {0}",
  recorder: "The person who recorded the defect cannot close it", rootCause: "Root cause is required", criticalTest: "A site test is required to close a critical defect",
  punchEvidence: "Evidence is required", assignee: "The assignee cannot close their own item", missingReq: "There are missing requirements: {0}",
} as const;
export const fill = (t: string, ...a: unknown[]) => t.replace(/\{(\d+)\}/g, (_m, i: string) => s(a[Number(i)]));

// ---------------------------------------------------------------- FT-02-02 WBS approval
export function wbsProblems(nodes: Row[], project: string): string[] {
  const e: string[] = [];
  const codes = nodes.map((n) => s(n["node_code"]).trim());
  const seen = new Set<string>(), dup = new Set<string>();
  for (const c of codes) { if (c && seen.has(c) && !dup.has(c)) { dup.add(c); e.push(fill(SITE_MSG.wbsDuplicate, c)); } seen.add(c); }
  const parentOf = new Map<string, string>(); for (const n of nodes) { const c = s(n["node_code"]).trim(); if (c && !parentOf.has(c)) parentOf.set(c, s(n["parent_code"]).trim()); }
  for (const n of nodes) { const c = s(n["node_code"]).trim(), p = s(n["parent_code"]).trim(); if (p && !parentOf.has(p)) e.push(fill(SITE_MSG.wbsParent, c, p)); }
  for (const n of nodes) {
    const c = s(n["node_code"]).trim(); let p = parentOf.get(c) ?? ""; const walked = new Set<string>();
    while (p && parentOf.has(p) && !walked.has(p)) { if (p === c) { e.push(fill(SITE_MSG.wbsCycle, c)); break; } walked.add(p); p = parentOf.get(p) ?? ""; }
  }
  const b = approvedBudget(project); const keys = new Set(rows(b, "lines").flatMap((l) => [s(l["line_key"]), s(l["cost_code"])]).filter(Boolean));
  for (const n of nodes) if (n["node_type"] === "Cost Code" && !keys.has(s(n["budget_line_ref"]).trim())) e.push(fill(SITE_MSG.wbsCostCode, s(n["node_code"]).trim()));
  return e;
}
export function wbsVersionRule(doc: Doc, before: Doc | undefined): SiteRes {
  const nodes = idx(rows(doc, "nodes"));
  // checked on the approval step itself (an imported, already approved version is taken as recorded)
  const e = before && changedTo(doc, before, "workflow_state", "Approved") ? asSystem(() => wbsProblems(nodes, s(doc["project"]))) : [];
  return { doc: { ...doc, nodes }, errors: e };
}

// ---------------------------------------------------------------- FT-02-03 schedule baselines
const SNAP = ["task", "baseline_start", "baseline_end", "duration_days", "progress_at_capture", "weight"];
export function scheduleBaselineRule(doc: Doc, before: Doc | undefined): SiteRes {
  const e: string[] = [];
  const d: Doc = { ...doc, status: doc["status"] || "Active", task_snapshots: idx(rows(doc, "task_snapshots")) };
  if (d["baseline_type"] === "Project" && d["status"] === "Active") {
    const other = all("Digit Schedule Baseline", (x) => x.name !== doc.name && x["project"] === doc["project"] && x["baseline_type"] === "Project" && (x["status"] || "Active") === "Active" && live(x))[0];
    if (other) e.push(fill(SITE_MSG.baselineExists, other.name));
  }
  if (before && sig(rows(before, "task_snapshots"), SNAP) !== sig(rows(d, "task_snapshots"), SNAP)) e.push(SITE_MSG.baselineFrozen);
  return { doc: d, errors: e };
}
/** Inclusive calendar days of a task window (source domain/schedule.ts rule). */
export const durationDays = (start: string, end: string) => (start && end ? daysDiff(start, end) + 1 : 0);
/**
 * DEC-008 (owner ruling): durations use the company working calendar — the native Holiday List named on the Company
 * (default_holiday_list); a company without one keeps calendar days. Still no critical path: successors keep moving by
 * calendar lag (schedule.ts), only durations are counted in working days.
 */
export function holidaysOf(company: string): Set<string> {
  const c = all("Company", (x) => x.name === company)[0]; const hl = c ? all("Holiday List", (x) => x.name === c["default_holiday_list"])[0] : undefined;
  return new Set(rows(hl, "holidays").map((h) => day(h["holiday_date"])).filter(Boolean));
}
export function workingDays(company: string, start: string, end: string): number {
  if (!start || !end || end < start) return 0;
  const off = holidaysOf(company); if (!off.size) return durationDays(start, end);
  let n = 0; for (let d = start; d <= end; d = plusDays(d, 1)) if (!off.has(d)) n++;
  return n;
}
/** F02-03-2: SV(days) = baseline duration × (performance % − schedule %), performance % = EV ÷ BAC, schedule % = PV ÷ BAC. */
export function svDays(baselineDuration: number, ev: number, pv: number, bac: number): number | null {
  if (!(bac > 0)) return null;
  return r2(baselineDuration * (ev / bac - pv / bac));
}
/** F02-03-2: per task, finish variance = current finish − baseline finish (days). */
export function baselineComparison(baseline: string): Row[] {
  const b = all("Digit Schedule Baseline", (x) => x.name === baseline)[0]; if (!b) return [];
  return rows(b, "task_snapshots").map((r) => {
    const t = all("Task", (x) => x.name === r["task"])[0];
    const cur = day(t?.["exp_end_date"]), be = day(r["baseline_end"]);
    const fv = cur && be ? daysDiff(be, cur) : null;
    return { task: r["task"], subject: t?.["subject"] ?? r["task_subject"] ?? "", baseline: b.name, project: b["project"], source_doctype: "Digit Schedule Baseline", source: b.name, source_table: "task_snapshots", row_no: num(r["idx"]) || null, baseline_start: day(r["baseline_start"]) || null, baseline_end: be || null,
      current_start: day(t?.["exp_start_date"]) || null, current_end: cur || null, finish_variance_days: fv, progress_pct: num(t?.["progress"]), task_status: t?.["status"] ?? "",
      baseline_working_days: workingDays(s(b["company"]), day(r["baseline_start"]), be), current_working_days: t ? workingDays(s(b["company"]), day(t["exp_start_date"]), cur) : null,
      variance_status: !t ? "Not in current schedule" : fv === null ? "Not dated" : fv > 0 ? "Finish later" : fv < 0 ? "Finish earlier" : "On baseline" };
  });
}

// ---------------------------------------------------------------- FT-02-04 lookahead
export function lookaheadPpc(rs: Row[]): { committed: number; done: number; ppc: number } {
  const committed = rs.filter((r) => num(r["committed"]) === 1).length, done = rs.filter((r) => num(r["committed"]) === 1 && num(r["completed"]) === 1).length;
  return { committed, done, ppc: committed ? r2((done / committed) * 100) : 0 };
}
/** F02-04-3: an open RFI on the task's work package, or a submitted material request line for the task not yet received. */
export function suggestedConstraint(project: string, task: string): { constraint: string; note: string } | undefined {
  if (!task) return undefined;
  const t = all("Task", (x) => x.name === task)[0]; const wp = s(t?.["digit_work_package"]);
  const rfi = wp ? all("Digit RFI", (r) => r["project"] === project && r["work_package"] === wp && r["workflow_state"] === "Open")[0] : undefined;
  if (rfi) return { constraint: "RFI", note: `Open RFI ${rfi.name} on work package ${wp}` };
  for (const mr of all("Material Request", (m) => num(m.docstatus) === 1)) {
    const it = rows(mr, "items").find((i) => i["digit_task"] === task && num(i["received_qty"]) < num(i["qty"]));
    if (it) return { constraint: "Material", note: `Material request ${mr.name} not received (${s(it["item_code"])})` };
  }
  return undefined;
}
export function lookaheadRule(doc: Doc, before: Doc | undefined): SiteRes {
  const e: string[] = [];
  const rs = idx(rows(doc, "lookahead_rows")).map((r): Row => {
    if (s(r["constraint"])) return r;
    const sug = suggestedConstraint(s(doc["project"]), s(r["task"]));
    return sug ? { ...r, constraint: sug.constraint, constraint_note: r["constraint_note"] || sug.note } : r;
  });
  const weekEnd = doc["week_end"] || (doc["week_start"] ? plusDays(day(doc["week_start"]), 7 * Math.max(1, num(doc["weeks"])) - 1) : doc["week_end"]);
  if (changedTo(doc, before, "status", "Closed"))
    for (const r of rs) if (num(r["committed"]) === 1 && num(r["completed"]) !== 1 && !s(r["miss_reason"]).trim() && !s(r["missed_reason"]).trim()) e.push(fill(SITE_MSG.lookaheadReason, r["idx"]));
  return { doc: { ...doc, week_end: weekEnd, lookahead_rows: rs, blockers: idx(rows(doc, "blockers")), ppc: lookaheadPpc(rs).ppc }, errors: e };
}

// ---------------------------------------------------------------- FT-02-05 site diary (DEC-032: one per project, date and shift)
export function siteReportErrors(doc: Doc): string[] {
  const e: string[] = [];
  rows(doc, "activities").forEach((a, i) => { if (num(a["qty"]) < 0) e.push(fill(SITE_MSG.activityQty, i + 1)); });
  if (doc["project"] && doc["report_date"]) {
    const dup = all("Digit Site Activity Report", (x) => x.name !== doc.name && live(x) && x["project"] === doc["project"] && day(x["report_date"]) === day(doc["report_date"]) && s(x["shift"]) === s(doc["shift"]))[0];
    if (dup) e.push(fill(SITE_MSG.siteReportDay, dup.name));
  }
  return e;
}

// ---------------------------------------------------------------- FT-02-15 hold points / FT-02-16 progress review
export function holdPointError(task: string): string | undefined {
  const t = all("Task", (x) => x.name === task)[0]; const tpl = s(t?.["digit_hold_point_template"]);
  if (!tpl) return undefined;
  const passed = all("Digit Inspection", (i) => i["task"] === task && i["checklist_template"] === tpl && (i["workflow_state"] === "Submitted" || num(i.docstatus) === 1) && (i["outcome"] === "Pass" || i["result"] === "Pass"))[0];
  return passed ? undefined : fill(SITE_MSG.holdPoint, tpl);
}
export function progressErrors(doc: Doc, before: Doc | undefined): string[] {
  const e: string[] = [];
  const pct = num(doc["progress_pct"]), task = s(doc["task"]);
  if (task && pct > 0 && (changedTo(doc, before, "workflow_state", "Submitted") || changedTo(doc, before, "workflow_state", "Reviewed"))) { const h = holdPointError(task); if (h) e.push(h); }
  if (task && changedTo(doc, before, "workflow_state", "Reviewed")) {
    const prev = num(all("Task", (x) => x.name === task)[0]?.["progress"]);
    if (pct < prev && !s(doc["review_note"]).trim() && !s(doc["notes"]).trim()) e.push(fill(SITE_MSG.progressLower, fmt(pct), fmt(prev)));
  }
  return e;
}

// ---------------------------------------------------------------- FT-02-07 submittals
export const submittalRoot = (name: string) => name.replace(/-R\d+$/, "");
const SUB_SIG = ["title", "submittal_type", "spec_section", "required_on_site", "lead_time_days", "review_days", "internal_days", "decision_code", "workflow_state"];
export function submittalRule(doc: Doc, before: Doc | undefined): SiteRes {
  const e: string[] = [];
  const steps = idx(rows(doc, "review_steps"));
  let d: Doc = { ...doc, review_steps: steps };
  const ros = day(doc["required_on_site"]);
  if (ros) {
    const planned = plusDays(ros, -num(doc["lead_time_days"]));
    d = { ...d, planned_return: planned, submit_by: plusDays(planned, -(num(doc["review_days"]) + num(doc["internal_days"]))) };
    if ((!before || day(before["required_on_site"]) !== ros) && ros < today()) e.push(SITE_MSG.rosPast);
  }
  if (changedTo(doc, before, "workflow_state", "Returned")) {
    if (!steps.length || steps.some((x) => !OUTCOME_RANK[s(x["outcome"]).slice(0, 1)])) e.push(SITE_MSG.stepsOpen);
    else d = { ...d, decision_code: worstOutcome(steps.map((x) => x["outcome"])), actual_return: doc["actual_return"] || today() };
  }
  if (before) {
    const root = submittalRoot(doc.name), rev = num(doc["revision"]);
    const newer = all("Digit Submittal", (x) => x.name !== doc.name && live(x) && submittalRoot(x.name) === root && num(x["revision"]) > rev).sort((a, b) => num(b["revision"]) - num(a["revision"]))[0];
    if (newer && (sig([before], SUB_SIG) !== sig([d], SUB_SIG) || sig(rows(before, "review_steps"), ["reviewer", "outcome", "done_on"]) !== sig(steps, ["reviewer", "outcome", "done_on"]))) e.push(fill(SITE_MSG.superseded, doc.name, newer.name));
  }
  return { doc: d, errors: e };
}
/** F02-07-4 / DEC-030: purchase order lines whose linked submittal's latest decision is not A or B — a warning, never a block. */
export function technicalApprovalWarnings(po: string): { submittal: string; code: string; en: string; ar: string }[] {
  const subs = all("Digit Submittal", (x) => live(x) && x["linked_purchase_order"] === po);
  const latest = new Map<string, Doc>();
  for (const x of subs) { const k = submittalRoot(x.name); const cur = latest.get(k); if (!cur || num(x["revision"]) > num(cur["revision"])) latest.set(k, x); }
  return [...latest.values()].filter((x) => !["A", "B"].includes(s(x["decision_code"]).slice(0, 1)))
    .map((x) => { const code = s(x["decision_code"]).slice(0, 1) || "—"; return { submittal: x.name, code, en: `Material not technically approved: ${x.name} (${code})`, ar: `المادة غير معتمدة فنيًا: ${x.name} (${code})` }; });
}

// ---------------------------------------------------------------- FT-02-08 drawing revisions
export function drawingRule(doc: Doc, before: Doc | undefined): SiteRes {
  const e: string[] = [];
  const revs = idx(rows(doc, "revisions"));
  const seen = new Set<string>(), dup = new Set<string>();
  for (const r of revs) { const c = s(r["revision_code"]).trim(); if (c && seen.has(c) && !dup.has(c)) { dup.add(c); e.push(fill(SITE_MSG.revisionExists, c)); } seen.add(c); }
  const had = new Set(rows(before, "revisions").map((r) => s(r["revision_code"]).trim()));
  const added = before ? revs.filter((r) => !had.has(s(r["revision_code"]).trim())) : [];
  const flagged = revs.filter((r) => num(r["is_current"]) === 1);
  const cur = added.length ? added[added.length - 1] : flagged.length ? flagged[flagged.length - 1] : revs[revs.length - 1];
  const out = revs.map((r): Row => ({ ...r, is_current: r === cur ? 1 : 0 }));
  return { doc: { ...doc, revisions: out, current_revision: cur ? s(cur["revision_code"]) : doc["current_revision"] ?? "" }, errors: e };
}
/** F02-08-2 / DEC-016: a reference keeps the revision it was made on; a stale one only warns. */
export function staleRevision(drawing: string, revision: string): { en: string; ar: string } | undefined {
  const d = all("Digit Drawing", (x) => x.name === drawing)[0]; if (!d || !revision) return undefined;
  const cur = s(d["current_revision"]);
  return cur && cur !== revision ? { en: fill(SITE_MSG.notCurrent, cur), ar: `هذه ليست المراجعة الحالية (الحالية: ${cur})` } : undefined;
}
export function staleReferences(rfi: Doc): { row: number; drawing: string; revision: string; en: string; ar: string }[] {
  return rows(rfi, "references").flatMap((r, i) => { if (r["ref_type"] !== "Drawing") return []; const w = staleRevision(s(r["ref_name"]), s(r["revision"])); return w ? [{ row: i + 1, drawing: s(r["ref_name"]), revision: s(r["revision"]), ...w }] : []; });
}

// ---------------------------------------------------------------- FT-02-09 transmittals
const TR_SIG = ["ref_doctype", "ref_name", "transmitted_revision"];
export function transmittalRule(doc: Doc, before: Doc | undefined): SiteRes {
  const e: string[] = [];
  let items = idx(rows(doc, "items")); let d: Doc = { ...doc };
  if (changedTo(doc, before, "workflow_state", "Sent")) {
    if (!items.length) e.push(SITE_MSG.transmittalEmpty);
    items = items.map((it): Row => it["ref_doctype"] === "Digit Drawing" && !s(it["transmitted_revision"]) ? { ...it, transmitted_revision: s(all("Digit Drawing", (x) => x.name === it["ref_name"])[0]?.["current_revision"]) } : it);
    d = { ...d, sent_on: doc["sent_on"] || today() };
  }
  if (changedTo(doc, before, "workflow_state", "Acknowledged")) d = { ...d, acknowledged_on: doc["acknowledged_on"] || today() };
  if (before && ["Sent", "Acknowledged"].includes(s(before["workflow_state"])) && sig(rows(before, "items"), TR_SIG) !== sig(items, TR_SIG)) e.push(SITE_MSG.transmittalFrozen);
  return { doc: { ...d, items }, errors: e };
}

// ---------------------------------------------------------------- FT-02-10 review workflows
export function reviewWorkflowRule(doc: Doc, before: Doc | undefined): SiteRes {
  const on = today();
  const sorted = rows(doc, "steps").map((r, i) => ({ r, i })).sort((a, b) => (num(a.r["seq"]) || a.i + 1) - (num(b.r["seq"]) || b.i + 1) || a.i - b.i).map((x) => x.r);
  const wasCurrent = new Set(rows(before, "steps").filter((r) => ["Current", "Overdue"].includes(s(r["step_status"]))).map((r) => s(r["seq"])));
  let current = false;
  const steps = sorted.map((r, i): Row => {
    if (r["step_status"] === "Skipped") return { ...r, idx: i + 1 };
    if (OUTCOME_RANK[s(r["outcome"])]) return { ...r, idx: i + 1, step_status: "Completed", completed_on: r["completed_on"] || on };
    if (!current) {
      current = true;
      const due = !wasCurrent.has(s(r["seq"])) && num(r["duration_days"]) > 0 ? plusDays(on, num(r["duration_days"])) : day(r["due"]) || r["due"];
      return { ...r, idx: i + 1, due, step_status: due && day(due) < on ? "Overdue" : "Current" };
    }
    return { ...r, idx: i + 1, step_status: "Forecast" };
  });
  const open = steps.filter((x) => x["step_status"] !== "Skipped" && x["step_status"] !== "Completed");
  const done = steps.length > 0 && !open.length && steps.some((x) => x["step_status"] === "Completed");
  const terminated = doc["workflow_state"] === "Terminated";
  return { doc: { ...doc, steps, ...(done && !terminated ? { final_outcome: worstOutcome(steps.map((x) => x["outcome"])), workflow_state: "Completed", status: "Completed" } : terminated ? { status: "Terminated" } : { workflow_state: doc["workflow_state"] || "Active", status: "In Progress" }) }, errors: [] };
}

// ---------------------------------------------------------------- FT-02-11 correspondence follow-up
export function overdueCorrespondence(on = today(), project?: string): Doc[] {
  return list("Digit Correspondence", (c) => (!project || c["project"] === project) && c["direction"] === "Incoming" && num(c["response_required"]) === 1 && !!day(c["response_due"]) && day(c["response_due"]) < on && !c["replied_by"]);
}

// ---------------------------------------------------------------- FT-02-12 site tasks
export function fieldTaskRule(doc: Doc, before: Doc | undefined): SiteRes {
  const e: string[] = [];
  const prev = before ? s(before["status"]) || "Open" : "";
  const st = s(doc["status"]) || "Open";
  let d: Doc = { ...doc, status: st };
  if (st === "Verified" && prev !== "Verified") {
    if (prev !== "Tracked") e.push(SITE_MSG.verifyFirst);
    if (!doc["after_photo"] && !doc["photos"]) e.push(SITE_MSG.photo);
    d = { ...d, closed_on: doc["closed_on"] || today() };
  }
  if (st === "Tracked" && !before) e.push(SITE_MSG.trackFirst);
  return { doc: d, errors: e };
}
/** F02-12-2: estimated days to close = 7 × open ÷ (weekly completion − weekly creation), only when completion outpaces creation. */
export const etcDays = (open: number, completedPerWeek: number, createdPerWeek: number) => (completedPerWeek > createdPerWeek ? r2((7 * open) / (completedPerWeek - createdPerWeek)) : null);

// ---------------------------------------------------------------- FT-02-13 inspections
export function inspectionResult(lines: Row[]): { score: number; outcome: string } {
  const ok = lines.filter((l) => l["outcome"] === "OK").length, nok = lines.filter((l) => l["outcome"] === "Not OK").length;
  const outcome = lines.some((l) => l["outcome"] === "Not OK" && num(l["mandatory"]) === 1) ? "Fail" : nok ? "Partial" : "Pass";
  return { score: ok + nok ? r2((ok / (ok + nok)) * 100) : 0, outcome };
}
export function inspectionRule(doc: Doc, before: Doc | undefined): SiteRes & { defects: boolean } {
  const e: string[] = [];
  const lines = idx(rows(doc, "lines"));
  const res = inspectionResult(lines);
  const submit = changedTo(doc, before, "workflow_state", "Submitted");
  if (submit) {
    if (lines.some((l) => num(l["mandatory"]) === 1 && !s(l["outcome"]))) e.push(SITE_MSG.mandatory);
    const tpl = all("Digit Checklist Template", (x) => x.name === doc["checklist_template"])[0];
    const needs = new Set(rows(tpl, "items").filter((i) => num(i["evidence_required"]) === 1).map((i) => num(i["item_no"])));
    for (const l of lines) if (needs.has(num(l["item_no"])) && ["OK", "Not OK"].includes(s(l["outcome"])) && !l["evidence"]) e.push(fill(SITE_MSG.evidence, num(l["item_no"])));
  }
  return { doc: { ...doc, lines, score: res.score, outcome: res.outcome, result: res.outcome }, errors: e, defects: submit && !e.length && lines.some((l) => l["outcome"] === "Not OK" && !l["defect"]) };
}
export const defectName = (inspection: string, itemNo: unknown) => `DEF-${inspection}-${num(itemNo)}`;

// ---------------------------------------------------------------- FT-02-14 defects (D02-14b repair periods)
export const DEFECT_DAYS: Record<string, number> = { Critical: 2, Major: 7, Minor: 14 };
export function defectRule(doc: Doc, before: Doc | undefined, user = currentUser()): SiteRes {
  const e: string[] = [];
  let d: Doc = { ...doc, ...(!before && !doc["detected_on"] ? { detected_on: today() } : {}) };
  if (d["workflow_state"]) d = { ...d, status: d["workflow_state"] };
  const sev = s(d["severity"]);
  const base = day(d["detected_on"]) || day(d["creation"]) || today();
  if (DEFECT_DAYS[sev] !== undefined && (!d["due_date"] || (before && s(before["severity"]) !== sev))) d = { ...d, due_date: plusDays(base, DEFECT_DAYS[sev]!) };
  if (changedTo(doc, before, "workflow_state", "Closed")) {
    if (!doc["after_photo"]) e.push(SITE_MSG.photo);
    if (user === s(before?.["owner"] ?? doc["owner"])) e.push(SITE_MSG.recorder);
    if ((doc["defect_type"] === "NCR" || doc["category"] === "NCR") && !s(doc["root_cause"]).trim()) e.push(SITE_MSG.rootCause);
    if (sev === "Critical" && !doc["retest_on"]) e.push(SITE_MSG.criticalTest);
    d = { ...d, verified_by: user, closed_on: doc["closed_on"] || today(), ...(num(doc["backcharge"]) === 1 && doc["work_order"] && num(doc["cost_to_fix"]) > 0 && !s(doc["backcharge_status"]) ? { backcharge_status: "Proposed" } : {}) };
  }
  return { doc: d, errors: e };
}
/** F02-14-3: closed back-charge defects of a work order proposed for its next bill (awaiting the QS). */
export function proposedBackcharges(workOrder: string): { defect: string; amount: number }[] {
  return all("Digit Defect", (x) => x["work_order"] === workOrder && x["backcharge_status"] === "Proposed").map((x) => ({ defect: x.name, amount: r2(num(x["cost_to_fix"])) }));
}

// ---------------------------------------------------------------- FT-02-17 punch list
export function punchRule(doc: Doc, before: Doc | undefined, user = currentUser()): SiteRes {
  const e: string[] = [];
  let d: Doc = { ...doc };
  if (changedTo(doc, before, "status", "Closed")) {
    if (!doc["evidence"] && !(num(doc["evidence_count"]) > 0)) e.push(SITE_MSG.punchEvidence);
    if (doc["assigned_to"] && user === s(doc["assigned_to"])) e.push(SITE_MSG.assignee);
    d = { ...d, closer: user, closed_on: doc["closed_on"] || today() };
  }
  return { doc: d, errors: e };
}
/** F02-17-2: handover ready when no Critical item is open; the closed share of all items. */
export function handoverReadiness(project: string): { total: number; closed: number; closedPct: number; openCritical: number; ready: boolean; items: string[] } {
  const items = list("Digit Punch Item", (x) => x["project"] === project && live(x));
  const closed = items.filter((x) => x["status"] === "Closed").length, openCritical = items.filter((x) => x["status"] !== "Closed" && x["severity"] === "Critical").length;
  return { total: items.length, closed, closedPct: items.length ? r2((closed / items.length) * 100) : 0, openCritical, ready: openCritical === 0, items: items.map((x) => x.name) };
}

// ---------------------------------------------------------------- FT-02-18 handover packages
export function handoverRule(doc: Doc): SiteRes {
  const req = idx(rows(doc, "requirements"));
  const need = req.filter((r) => num(r["required"]) === 1), acc = need.filter((r) => num(r["accepted"]) === 1 || r["status"] === "Accepted");
  return { doc: { ...doc, requirements: req, completeness_pct: need.length ? r2((acc.length / need.length) * 100) : 0, missing_count: need.length - acc.length, file_count: req.filter((r) => !!r["file_attachment"]).length }, errors: [] };
}
export interface HandoverManifest { package: string; project: string; generated_at: string; files: { requirement: number; type: string; description: string; file: string; drawing: string; revision: string }[] }
export function handoverManifest(pkg: Doc, at = today()): { manifest?: HandoverManifest; missing: string[] } {
  const req = rows(pkg, "requirements");
  const missing = req.filter((r) => num(r["required"]) === 1 && !(num(r["accepted"]) === 1 || r["status"] === "Accepted")).map((r, i) => s(r["description"]) || s(r["requirement_type"]) || `#${num(r["idx"]) || i + 1}`);
  if (missing.length) return { missing };
  const files = req.filter((r) => num(r["accepted"]) === 1 || r["status"] === "Accepted").map((r, i) => {
    const dr = s(r["drawing"]); const rev = s(r["revision"]) || (dr ? s(all("Digit Drawing", (x) => x.name === dr)[0]?.["current_revision"]) : "");
    return { requirement: num(r["idx"]) || i + 1, type: s(r["requirement_type"]), description: s(r["description"]), file: s(r["file_attachment"]), drawing: dr, revision: rev };
  });
  return { manifest: { package: pkg.name, project: s(pkg["project"]), generated_at: at, files }, missing: [] };
}

// ---------------------------------------------------------------- KPIs K02-01 … K02-10 (each figure = its drill rows)
export interface SiteKpi { id: string; value: number | null; doctype: string; names: string[] }
const avg = (xs: number[]) => (xs.length ? r2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
export function siteKpis(project?: string, on = today()): SiteKpi[] {
  const inP = (d: Doc) => !project || d["project"] === project;
  const la = list("Digit Lookahead", (d) => inP(d) && live(d));
  const laRows = la.flatMap((d) => rows(d, "lookahead_rows"));
  const p = lookaheadPpc(laRows);
  const blocked = la.filter((d) => rows(d, "lookahead_rows").some((r) => !!s(r["constraint"]) && r["constraint"] !== "None"));
  const rfis = list("Digit RFI", (d) => inP(d) && live(d));
  const late = rfis.filter((r) => r["workflow_state"] === "Open" && !!day(r["due_date"]) && day(r["due_date"]) < on);
  const answered = rfis.filter((r) => day(r["answered_on"]) && day(r["sent_on"]));
  const subs = list("Digit Submittal", (d) => inP(d) && live(d));
  const lateSub = subs.filter((x) => x["workflow_state"] === "Draft" && !!day(x["submit_by"]) && day(x["submit_by"]) < on);
  const closedSub = subs.filter((x) => ["Returned", "Closed"].includes(s(x["workflow_state"])) && !!s(x["decision_code"]));
  const firstOk = closedSub.filter((x) => num(x["revision"]) === 0 && ["A", "B"].includes(s(x["decision_code"]).slice(0, 1)));
  const insp = list("Digit Inspection", (d) => inP(d) && live(d) && (d["workflow_state"] === "Submitted" || num(d.docstatus) === 1));
  const firstInsp = [...new Map(insp.sort((a, b) => day(a["inspection_date"]).localeCompare(day(b["inspection_date"])) || a.name.localeCompare(b.name)).reverse().map((x) => [`${s(x["task"])}|${s(x["checklist_template"])}`, x])).values()];
  const passFirst = firstInsp.filter((x) => (x["outcome"] || x["result"]) === "Pass");
  const defects = list("Digit Defect", (d) => inP(d) && live(d));
  const openDef = defects.filter((x) => (x["workflow_state"] || x["status"]) !== "Closed");
  const closedDef = defects.filter((x) => (x["workflow_state"] || x["status"]) === "Closed" && !!day(x["detected_on"]) && !!day(x["closed_on"]));
  const punch = list("Digit Punch Item", (d) => inP(d) && live(d));
  const closedPunch = punch.filter((x) => x["status"] === "Closed");
  return [
    { id: "K02-01", value: p.committed ? p.ppc : null, doctype: "Digit Lookahead", names: la.map((d) => d.name) },
    { id: "K02-02", value: laRows.filter((r) => !!s(r["constraint"]) && r["constraint"] !== "None").length, doctype: "Digit Lookahead", names: blocked.map((d) => d.name) },
    { id: "K02-03", value: late.length, doctype: "Digit RFI", names: late.map((d) => d.name) },
    { id: "K02-04", value: avg(answered.map((r) => daysDiff(day(r["sent_on"]), day(r["answered_on"])))), doctype: "Digit RFI", names: answered.map((d) => d.name) },
    { id: "K02-05", value: lateSub.length, doctype: "Digit Submittal", names: lateSub.map((d) => d.name) },
    { id: "K02-06", value: closedSub.length ? r2((firstOk.length / closedSub.length) * 100) : null, doctype: "Digit Submittal", names: closedSub.map((d) => d.name) },
    { id: "K02-07", value: firstInsp.length ? r2((passFirst.length / firstInsp.length) * 100) : null, doctype: "Digit Inspection", names: firstInsp.map((d) => d.name) },
    { id: "K02-08", value: openDef.length, doctype: "Digit Defect", names: openDef.map((d) => d.name) },
    { id: "K02-09", value: avg(closedDef.map((x) => daysDiff(day(x["detected_on"]), day(x["closed_on"])))), doctype: "Digit Defect", names: closedDef.map((d) => d.name) },
    { id: "K02-10", value: punch.length ? r2((closedPunch.length / punch.length) * 100) : null, doctype: "Digit Punch Item", names: punch.map((d) => d.name) },
  ];
}

// ---------------------------------------------------------------- FT-02-02 task coverage (read model)
/** F02-02-2: a task is covered when its digit_wbs_code is a node of the approved WBS version; every other task is an exception. */
export function wbsCoverage(project: string, versionName?: string): { version: string; tasks: number; covered: number; pct: number | null; exceptions: string[]; nodes: Row[] } {
  const vs = list("Digit WBS Version", (v) => v["project"] === project && live(v)).sort((a, b) => num(b["version"]) - num(a["version"]) || b.name.localeCompare(a.name));
  const v = versionName ? vs.find((x) => x.name === versionName) : vs.find((x) => x["workflow_state"] === "Approved");
  const nodes = rows(v, "nodes"); const codes = new Set(nodes.map((n) => s(n["node_code"]).trim()).filter(Boolean));
  const tasks = list("Task", (x) => x["project"] === project);
  const cov = tasks.filter((x) => codes.has(s(x["digit_wbs_code"]).trim()));
  const rowsOut = nodes.map((n): Row => {
    const code = s(n["node_code"]).trim(); const linked = tasks.filter((x) => s(x["digit_wbs_code"]).trim() === code).map((x) => x.name);
    return { code, title: n["title"] ?? "", node_type: n["node_type"] ?? "", work_package: n["work_package"] ?? "", task: n["task"] || linked[0] || "", tasks: linked.join(", "), boq_item: n["boq_item_ref"] ?? "", budget_line: n["budget_line_ref"] ?? "", covered: linked.length || n["task"] ? 1 : 0, version: v?.name ?? "", project };
  });
  return { version: v?.name ?? "", tasks: tasks.length, covered: cov.length, pct: tasks.length && v ? r2((cov.length / tasks.length) * 100) : null, exceptions: tasks.filter((x) => !codes.has(s(x["digit_wbs_code"]).trim())).map((x) => x.name), nodes: rowsOut };
}

// ---------------------------------------------------------------- report rows (RPT-N07, N09, N10, N11)
/** Lookahead Reasons for Non-completion: missed committed rows per week and reason; % of that week's misses. */
export function lookaheadMissReasons(f: Record<string, unknown>): Row[] {
  const out = new Map<string, Row>(); const perWeek = new Map<string, number>();
  for (const la of list("Digit Lookahead", (d) => live(d) && (!f["project"] || d["project"] === f["project"]))) {
    const wk = day(la["week_start"]);
    for (const r of rows(la, "lookahead_rows")) {
      if (num(r["committed"]) !== 1 || num(r["completed"]) === 1) continue;
      const reason = s(r["miss_reason"]) || (s(r["missed_reason"]).trim() ? "Other" : "Not recorded");
      const k = `${wk}|${reason}`; const x = out.get(k) ?? { week: wk, reason, count: 0, project: la["project"], lookaheads: [] as string[] };
      x["count"] = num(x["count"]) + 1; if (!(x["lookaheads"] as string[]).includes(la.name)) (x["lookaheads"] as string[]).push(la.name); out.set(k, x);
      perWeek.set(wk, (perWeek.get(wk) ?? 0) + 1);
    }
  }
  return [...out.values()].map((x): Row => ({ ...x, lookaheads: (x["lookaheads"] as string[]).join(", "), pct_of_misses: r2((num(x["count"]) / (perWeek.get(s(x["week"])) || 1)) * 100) }))
    .sort((a, b) => s(b["week"]).localeCompare(s(a["week"])) || num(b["count"]) - num(a["count"]));
}
export function drawingRegister(f: Record<string, unknown>): Row[] {
  return list("Digit Drawing", (d) => (!f["project"] || d["project"] === f["project"]) && (!f["discipline"] || d["discipline"] === f["discipline"])).map((d) => {
    const cur = rows(d, "revisions").find((r) => num(r["is_current"]) === 1);
    return { drawing: d.name, drawing_no: d["drawing_no"] ?? "", title: d["title"] ?? "", discipline: d["discipline"] ?? "", current_revision: d["current_revision"] ?? "", issue_date: day(cur?.["issue_date"]) || null, purpose: cur?.["purpose"] ?? "", status: d["status"] ?? d["drawing_status"] ?? "", revisions: rows(d, "revisions").length, project: d["project"] };
  }).sort((a, b) => s(a["drawing_no"]).localeCompare(s(b["drawing_no"])));
}
export function reviewStatusRows(f: Record<string, unknown>, on = today()): Row[] {
  return list("Digit Review Workflow", (d) => live(d) && (!f["project"] || d["project"] === f["project"])).flatMap((w) => rows(w, "steps").filter((st) => !f["reviewer"] || st["reviewer"] === f["reviewer"]).map((st) => {
    const late = st["step_status"] !== "Completed" && day(st["due"]) && day(st["due"]) < on ? daysDiff(day(st["due"]), on) : st["step_status"] === "Completed" && day(st["due"]) && day(st["completed_on"]) > day(st["due"]) ? daysDiff(day(st["due"]), day(st["completed_on"])) : 0;
    return { workflow: w.name, document: `${s(w["ref_doctype"])} ${s(w["ref_name"])}`.trim(), ref_doctype: w["ref_doctype"] ?? "", ref_name: w["ref_name"] ?? "", step: num(st["seq"]) || num(st["idx"]), reviewer: st["reviewer"] ?? "", due: day(st["due"]) || null, status: st["step_status"] ?? "", days_late: late, outcome: st["outcome"] ?? "", project: w["project"] };
  }));
}
export function defectRegister(f: Record<string, unknown>, on = today()): Row[] {
  return list("Digit Defect", (d) => live(d) && (!f["project"] || d["project"] === f["project"]) && (!f["severity"] || d["severity"] === f["severity"]) && (!f["status"] || (d["workflow_state"] || d["status"]) === f["status"]) && (!f["responsible"] || d["responsible_party"] === f["responsible"])).map((d) => {
    const st = s(d["workflow_state"] || d["status"]); const from = day(d["detected_on"]) || day(d["creation"]);
    return { defect: d.name, title: d["title"] ?? "", defect_type: d["defect_type"] || d["category"] || "", severity: d["severity"] ?? "", location: d["location"] ?? "", responsible: d["responsible_party"] ?? "", assigned_to: d["assigned_to"] ?? "", status: st, due_date: day(d["due_date"]) || null,
      days_open: from ? daysDiff(from, st === "Closed" ? day(d["closed_on"]) || on : on) : null, backcharge: num(d["backcharge"]) === 1 ? r2(num(d["cost_to_fix"])) : 0, backcharge_status: d["backcharge_status"] ?? "", project: d["project"] };
  });
}

// ---------------------------------------------------------------- DEC-031 cost-code master
/**
 * DEC-031 (owner ruling): Digit Cost Code (R19 06-02) is the cost-code master — a tree by parent_cost_code, versioned
 * through its Version history (track_changes), retired by Active = No (no role may delete it).
 */
export const CODE_MSG = { retired: "Cost code {0} is retired — choose an active code" };
export function costCodeRule(doc: Doc): SiteRes {
  const code = s(doc["code"] || doc.name).trim(); const e: string[] = [];
  const codes = new Map(all("Digit Cost Code", (x) => x.name !== doc.name).map((x) => [s(x["code"] || x.name).trim(), x]));
  const parent = s(doc["parent_cost_code"]).trim();
  if (parent && !codes.has(parent)) e.push(fill(SITE_MSG.wbsParent, code, parent));
  for (let p = parent, seen = new Set([code]); p; p = s(codes.get(p)?.["parent_cost_code"]).trim()) { if (seen.has(p)) { e.push(fill(SITE_MSG.wbsCycle, code)); break; } seen.add(p); }
  return { doc, errors: e };
}
/** Budget and purchase rows: a newly used code the master holds as retired (Active = No) is refused; codes not in the master stay for the cost verifier. */
export function retiredCodeErrors(codes: unknown[]): string[] {
  const off = new Set(all("Digit Cost Code", (x) => x["is_active"] === "No").map((x) => s(x["code"] || x.name).trim()));
  return [...new Set(codes.map((c) => s(c).trim()).filter((c) => c && off.has(c)))].map((c) => fill(CODE_MSG.retired, c));
}
