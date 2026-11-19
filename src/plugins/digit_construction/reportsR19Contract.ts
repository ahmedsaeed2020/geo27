/**
 * R19 — reports the 36-workspace design contract names (r19/contract.generated.json `workspaces[].reports`) that
 * neither this app nor the supplied source snapshot had. Each is a read-only view over records and read models the
 * app already computes (domain/data.ts costPosition / contractPosition, domain/team.ts teamOf), so its figures equal
 * the screens that show the same measure. They are app additions, not source ports: the Frappe export ships a
 * FRAPPE_SERVER_REQUIRED stub for each until the owner approves a server implementation.
 *
 * Contract reports with no data source in the snapshot (work permits, inductions, WIP adjustments) are not built —
 * they are listed as gaps in docs/digit-app-builder/construction/r19/GAPS.md.
 */
import type { PluginReport } from "../types";
import { num, r2, sumBy } from "./domain/calc";
import { contractPosition, costPosition, get, list, rows, today } from "./domain/data";
import { constructionProjects } from "./domain/queues";
import { teamOf } from "./domain/teamModel";
import type { Doc } from "@/lib/adapter";

type F = Record<string, unknown>;
type Row = Record<string, unknown>;
const PF = [{ fieldname: "company", label: "Company", fieldtype: "Link", options: "Company" }, { fieldname: "project", label: "Project", fieldtype: "Link", options: "Project" }];
const C = (fieldname: string, label: string, fieldtype = "Currency", options?: string, width = 130) => ({ fieldname, label, fieldtype, ...(options ? { options } : {}), width });
const S = (name: string) => `# FRAPPE_SERVER_REQUIRED: "${name}" is a DIGIT Construction R19 design-contract report computed by the Virtual Core\n# (digit_construction/reportsR19Contract.ts). It has no source Python; implement and approve it on staging before enabling.\n\n\ndef execute(filters=None):\n\tfrappe.throw(_("This report is not implemented on the server yet ({0}).").format(${JSON.stringify(name)}))\n`;
const scope = (f: F) => constructionProjects({ company: (f["company"] as string) || undefined, project: (f["project"] as string) || undefined });
const inScope = (f: F) => { const ps = new Set(scope(f).map((p) => p.name)); return (d: Doc) => ps.has(String(d["project"] ?? "")); };
const day = (v: unknown) => String(v ?? "").slice(0, 10);
const ageDays = (from: unknown, on = today()) => { const d = day(from); return d ? Math.max(0, Math.round((Date.parse(on) - Date.parse(d)) / 86400000)) : null; };
const live = (d: Doc) => num(d.docstatus) !== 2;
const bucket = (a: number | null) => (a === null ? "" : a <= 7 ? "0–7" : a <= 14 ? "8–14" : a <= 30 ? "15–30" : "30+");
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Budget vs Actual (06-01): per approved budget line — the same costPosition lines as the cost sheet. */
export function budgetVsActual(f: F, on = today()): Row[] {
  const out: Row[] = [];
  for (const p of scope(f)) {
    const c = costPosition(p.name, (f["as_of"] as string) || on);
    for (const l of c.lines) {
      if (f["cost_code"] && l.cost_code !== f["cost_code"]) continue;
      const used = r2(l.committed + l.actual);
      out.push({ project: p.name, budget: c.budget?.name ?? "", line_key: l.line_key, cost_code: l.cost_code, description: l.description, original: l.original, revisions: l.revisions, transfers: r2(l.transferIn - l.transferOut), revised: l.revised,
        committed: l.committed, actual: l.actual, committed_actual: used, remaining: r2(l.revised - used), used_pct: l.revised ? r2((100 * used) / l.revised) : null, eac: l.eac, variance: l.variance, over_budget: used > l.revised + 0.005 ? 1 : 0 });
    }
    // cost that matches no approved budget line stays visible (never spread over lines)
    for (const u of c.unallocated) if (!f["cost_code"] || u.code === f["cost_code"])
      out.push({ project: p.name, budget: c.budget?.name ?? "", line_key: "", cost_code: u.code, description: "Unallocated (no approved budget line)", original: 0, revisions: 0, transfers: 0, revised: 0, committed: u.committed, actual: u.actual, committed_actual: r2(u.committed + u.actual), remaining: -r2(u.committed + u.actual), used_pct: null, eac: null, variance: null, over_budget: 1 });
  }
  return out;
}

/** RFI Aging (02-03): open RFIs by days since sent, against their due date. */
export function rfiAging(f: F, on = today()): Row[] {
  return list("Digit RFI", (d) => live(d) && inScope(f)(d) && (f["include_answered"] ? true : d["workflow_state"] === "Open"))
    .map((d) => { const age = ageDays(d["sent_on"] ?? d["creation"], d["answered_on"] ? day(d["answered_on"]) : on); return { rfi: d.name, project: d["project"], subject: d["subject"] ?? "", status: d["workflow_state"] ?? "", ball_in_court: d["ball_in_court"] ?? "", sent_on: day(d["sent_on"]), due_date: day(d["due_date"]), answered_on: day(d["answered_on"]),
      age_days: age, age_bucket: bucket(age), overdue: d["workflow_state"] === "Open" && day(d["due_date"]) && day(d["due_date"]) < on ? 1 : 0, cost_impact: d["cost_impact"] ?? "" }; })
    .sort((a, b) => num(b.age_days) - num(a.age_days));
}

/** Submittal Log (02-03): every submittal with its plan, return and lateness. */
export function submittalLog(f: F, on = today()): Row[] {
  return list("Digit Submittal", (d) => live(d) && inScope(f)(d) && (!f["status"] || d["workflow_state"] === f["status"]) && (!f["submittal_type"] || d["submittal_type"] === f["submittal_type"]))
    .map((d) => { const open = !["Returned", "Closed"].includes(String(d["workflow_state"] ?? "")); const late = open && day(d["planned_return"]) && day(d["planned_return"]) < on ? ageDays(d["planned_return"], on) : !open && day(d["planned_return"]) && day(d["actual_return"]) > day(d["planned_return"]) ? ageDays(d["planned_return"], day(d["actual_return"])) : 0;
      return { submittal: d.name, project: d["project"], title: d["title"] ?? "", submittal_type: d["submittal_type"] ?? "", spec_section: d["spec_section"] ?? "", revision: num(d["revision"]), status: d["workflow_state"] ?? "", ball_in_court: d["ball_in_court"] ?? "", decision_code: d["decision_code"] ?? "",
        submit_by: day(d["submit_by"]), planned_return: day(d["planned_return"]), actual_return: day(d["actual_return"]), required_on_site: day(d["required_on_site"]), days_late: late ?? 0 }; })
    .sort((a, b) => String(a.planned_return).localeCompare(String(b.planned_return)));
}

const allocOf = (p: Doc, idx: number) => num(rows(p, "digit_team").find((x, i) => (num(x["idx"]) || i + 1) === idx)?.["allocation_pct"]);
/** Team Workload (01-04): active assignments per person across construction projects (domain/team.ts rows). */
export function teamWorkload(f: F, on = today()): Row[] {
  const by = new Map<string, { name: string; projects: Set<string>; roles: Set<string>; n: number; alloc: number; unset: number; flags: number }>();
  for (const p of scope(f)) for (const r of teamOf(p, on)) {
    if (r.status !== "Active") continue;
    const k = r.employee || r.user || `${p.name}:${r.idx}`; const x = by.get(k) ?? { name: r.employee_name || r.employee || r.user, projects: new Set<string>(), roles: new Set<string>(), n: 0, alloc: 0, unset: 0, flags: 0 };
    const a = allocOf(p, r.idx); x.projects.add(p.name); if (r.role) x.roles.add(r.role); x.n++; x.alloc += a; if (!a) x.unset++; x.flags += r.flags.length; by.set(k, x);
  }
  return [...by].map(([employee, x]) => ({ employee, employee_name: x.name, projects: x.projects.size, assignments: x.n, roles: [...x.roles].join(", "), allocation_pct: r2(x.alloc), allocation_unset: x.unset, over_allocated: x.alloc > 100 ? 1 : 0, issues: x.flags }))
    .sort((a, b) => b.allocation_pct - a.allocation_pct || b.assignments - a.assignments);
}

/** Bid Comparison (03-04): each subcontract bid against the lowest bid of its package. */
export function bidComparison(f: F): Row[] {
  const pk = list("Digit Bid Package", (d) => live(d) && (!f["company"] || d["company"] === f["company"]) && (!f["project"] || d["project"] === f["project"]) && (!f["bid_package"] || d.name === f["bid_package"]));
  const out: Row[] = [];
  for (const p of pk) {
    const bids = list("Digit Subcontract Bid", (b) => live(b) && b["bid_package"] === p.name).map((b) => ({ b, total: num(b["total"]) || sumBy(rows(b, "lines").filter((l) => l["included"] === undefined || num(l["included"])), (l) => num(l["amount"])) }));
    const sorted = [...bids].sort((a, b) => a.total - b.total); const low = sorted.find((x) => x.total > 0)?.total ?? 0;
    const lev = list("Digit Bid Leveling", (l) => l["bid_package"] === p.name && live(l))[0];
    sorted.forEach((x, i) => out.push({ bid_package: p.name, trade: p["trade"] ?? "", bid: x.b.name, supplier: x.b["supplier"] ?? "", submitted_on: day(x.b["submitted_on"]), validity_days: num(x.b["validity_days"]), total: x.total, rank: i + 1,
      vs_lowest: low ? r2(x.total - low) : null, vs_lowest_pct: low ? r2((100 * (x.total - low)) / low) : null, awarded: lev && lev["awarded_supplier"] === x.b["supplier"] && lev["workflow_state"] === "Awarded" ? 1 : 0, exclusions: x.b["exclusions"] ? 1 : 0 }));
  }
  return out;
}

/** Compliance Expiry (08-04): the compliance dates the source records — subcontractor CR and insurance expiry. */
export function complianceExpiry(f: F, on = today()): Row[] {
  const within = Number(f["within_days"]) || 60; const until = addDays(on, within);
  return list("Digit Subcontractor Profile", (d) => live(d) && d["workflow_state"] !== "Rejected")
    .flatMap((d) => ([["cr_expiry", "Commercial registration", d["cr_number"]], ["insurance_expiry", "Insurance", ""]] as const).filter(([fld]) => !!d[fld]).map(([fld, what, ref]) => {
      const exp = day(d[fld]); const left = Math.round((Date.parse(exp) - Date.parse(on)) / 86400000);
      return { profile: d.name, supplier: d["supplier"] ?? "", trade: d["trade"] ?? "", document: what, reference: ref ?? "", expiry_date: exp, days_left: left, state: left < 0 ? "Expired" : exp <= until ? "Expiring" : "Valid", profile_status: d["workflow_state"] ?? "" };
    }))
    .filter((r) => (f["state"] ? r.state === f["state"] : r.state !== "Valid"))
    .sort((a, b) => a.days_left - b.days_left);
}

/** Project Profitability (09-04): management view — earned (certified) value vs purchase-basis cost; not a GL report. */
export function projectProfitability(f: F, on = today()): Row[] {
  return scope(f).map((p) => {
    const cs = list("Digit Client Contract", (c) => c["project"] === p.name && c["workflow_state"] !== "Draft" && live(c)).map(contractPosition);
    const c = costPosition(p.name, on); const revised = sumBy(cs, (x) => x.revised), earned = sumBy(cs, (x) => x.certifiedGross), invoiced = sumBy(cs, (x) => x.invoicedGross), collected = sumBy(cs, (x) => x.collected);
    return { project: p.name, project_name: get("Project", p.name)?.["project_name"] ?? "", revised_contract: r2(revised), earned: r2(earned), invoiced: r2(invoiced), collected: r2(collected), actual_cost: c.actual, earned_margin: r2(earned - c.actual), earned_margin_pct: earned ? r2((100 * (earned - c.actual)) / earned) : null,
      eac: c.eac, forecast_margin: c.eac === null ? null : r2(revised - c.eac), forecast_margin_pct: c.eac === null || !revised ? null : r2((100 * (revised - c.eac)) / revised) };
  });
}

export const R19_CONTRACT_REPORTS: PluginReport[] = [
  { name: "Budget vs Actual", ref_doctype: "Digit Project Cost Budget", report_type: "Script Report", script: S("Budget vs Actual"),
    filters: [...PF, { fieldname: "cost_code", label: "Cost Code", fieldtype: "Data" }, { fieldname: "as_of", label: "As of", fieldtype: "Date" }],
    columns: [C("project", "Project", "Link", "Project", 140), C("budget", "Budget", "Link", "Digit Project Cost Budget", 140), C("cost_code", "Cost Code", "Data", undefined, 110), C("description", "Description", "Data", undefined, 200), C("original", "Original"), C("revisions", "Revisions"), C("transfers", "Transfers (net)"), C("revised", "Revised Budget"),
      C("committed", "Committed"), C("actual", "Actual Cost"), C("committed_actual", "Committed + Actual"), C("remaining", "Remaining"), C("used_pct", "Used %", "Percent", undefined, 80), C("eac", "EAC"), C("variance", "Variance at Completion"), C("over_budget", "Over Budget", "Check", undefined, 80)],
    run: (f) => budgetVsActual(f) },
  { name: "RFI Aging", ref_doctype: "Digit RFI", report_type: "Script Report", script: S("RFI Aging"), filters: [...PF, { fieldname: "include_answered", label: "Include answered", fieldtype: "Check" }],
    columns: [C("rfi", "RFI", "Link", "Digit RFI", 140), C("project", "Project", "Link", "Project", 140), C("subject", "Subject", "Data", undefined, 220), C("status", "Status", "Data", undefined, 90), C("ball_in_court", "Ball in Court", "Data", undefined, 130), C("sent_on", "Sent On", "Date", undefined, 100), C("due_date", "Due Date", "Date", undefined, 100), C("answered_on", "Answered On", "Date", undefined, 100), C("age_days", "Age (days)", "Int", undefined, 80), C("age_bucket", "Age Bucket", "Data", undefined, 90), C("overdue", "Overdue", "Check", undefined, 75), C("cost_impact", "Cost Impact", "Data", undefined, 90)],
    run: (f) => rfiAging(f) },
  { name: "Submittal Log", ref_doctype: "Digit Submittal", report_type: "Script Report", script: S("Submittal Log"), filters: [...PF, { fieldname: "status", label: "Status", fieldtype: "Select", options: "\nDraft\nSubmitted\nUnder Review\nReturned\nClosed" }, { fieldname: "submittal_type", label: "Type", fieldtype: "Select", options: "\nShop Drawing\nMaterial\nSample\nMethod Statement\nCalculation" }],
    columns: [C("submittal", "Submittal", "Link", "Digit Submittal", 140), C("project", "Project", "Link", "Project", 140), C("title", "Title", "Data", undefined, 200), C("submittal_type", "Type", "Data", undefined, 120), C("spec_section", "Spec Section", "Data", undefined, 100), C("revision", "Revision", "Int", undefined, 70), C("status", "Status", "Data", undefined, 100), C("ball_in_court", "Ball in Court", "Data", undefined, 130), C("decision_code", "Decision", "Data", undefined, 70),
      C("submit_by", "Submit By", "Date", undefined, 100), C("planned_return", "Planned Return", "Date", undefined, 100), C("actual_return", "Actual Return", "Date", undefined, 100), C("required_on_site", "Required on Site", "Date", undefined, 100), C("days_late", "Days Late", "Int", undefined, 80)],
    run: (f) => submittalLog(f) },
  { name: "Team Workload", ref_doctype: "Project", report_type: "Script Report", script: S("Team Workload"), filters: PF,
    columns: [C("employee", "Employee", "Link", "Employee", 130), C("employee_name", "Name", "Data", undefined, 180), C("projects", "Projects", "Int", undefined, 80), C("assignments", "Active Assignments", "Int", undefined, 110), C("roles", "Roles", "Data", undefined, 200), C("allocation_pct", "Allocation %", "Percent", undefined, 100), C("allocation_unset", "Assignments without Allocation", "Int", undefined, 120), C("over_allocated", "Over-allocated", "Check", undefined, 100), C("issues", "Assignment Issues", "Int", undefined, 100)],
    run: (f) => teamWorkload(f) },
  { name: "Bid Comparison", ref_doctype: "Digit Bid Package", report_type: "Script Report", script: S("Bid Comparison"), filters: [...PF, { fieldname: "bid_package", label: "Bid Package", fieldtype: "Link", options: "Digit Bid Package" }],
    columns: [C("bid_package", "Bid Package", "Link", "Digit Bid Package", 140), C("trade", "Trade", "Data", undefined, 90), C("bid", "Bid", "Link", "Digit Subcontract Bid", 140), C("supplier", "Supplier", "Link", "Supplier", 160), C("submitted_on", "Submitted On", "Date", undefined, 100), C("validity_days", "Validity (days)", "Int", undefined, 90), C("total", "Bid Total"), C("rank", "Rank", "Int", undefined, 60), C("vs_lowest", "Above Lowest"), C("vs_lowest_pct", "Above Lowest %", "Percent", undefined, 100), C("awarded", "Awarded", "Check", undefined, 75), C("exclusions", "Has Exclusions", "Check", undefined, 90)],
    run: (f) => bidComparison(f) },
  { name: "Compliance Expiry", ref_doctype: "Digit Subcontractor Profile", report_type: "Script Report", script: S("Compliance Expiry"),
    filters: [{ fieldname: "within_days", label: "Expiring within (days)", fieldtype: "Int", default: 60 } as never, { fieldname: "state", label: "State", fieldtype: "Select", options: "\nExpired\nExpiring\nValid" }],
    columns: [C("profile", "Subcontractor Profile", "Link", "Digit Subcontractor Profile", 150), C("supplier", "Supplier", "Link", "Supplier", 170), C("trade", "Trade", "Data", undefined, 100), C("document", "Document", "Data", undefined, 170), C("reference", "Reference", "Data", undefined, 120), C("expiry_date", "Expiry Date", "Date", undefined, 100), C("days_left", "Days Left", "Int", undefined, 80), C("state", "State", "Data", undefined, 90), C("profile_status", "Profile Status", "Data", undefined, 110)],
    run: (f) => complianceExpiry(f) },
  { name: "Project Profitability", ref_doctype: "Project", report_type: "Script Report", script: S("Project Profitability"), filters: PF,
    columns: [C("project", "Project", "Link", "Project", 140), C("project_name", "Project Name", "Data", undefined, 200), C("revised_contract", "Revised Contract"), C("earned", "Earned (certified)"), C("invoiced", "Invoiced"), C("collected", "Collected"), C("actual_cost", "Actual Cost"), C("earned_margin", "Earned Margin"), C("earned_margin_pct", "Earned Margin %", "Percent", undefined, 100), C("eac", "EAC"), C("forecast_margin", "Forecast Margin"), C("forecast_margin_pct", "Forecast Margin %", "Percent", undefined, 100)],
    run: (f) => projectProfitability(f) },
];
export const R19_CONTRACT_REPORT_NAMES = R19_CONTRACT_REPORTS.map((r) => r.name);
