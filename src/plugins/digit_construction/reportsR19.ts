/**
 * R19 — the seven Script Reports of the supplied Frappe source snapshot that this app did not have, ported to the
 * virtual read model (source: digit_construction/report/<name>/<name>.py, fingerprinted in
 * docs/digit-app-builder/construction/r19/SOURCE_CATALOG.json). Same columns, filters and formulas as the source;
 * same read rules as domain/data.ts (construction projects only, session-scoped lists). Nothing is stored or posted.
 *
 * The Frappe export ships a FRAPPE_SERVER_REQUIRED stub for each (the source Python depends on its own api/rules
 * modules); install the source app's report files on staging instead of enabling the stub.
 */
import type { PluginReport } from "../types";
import { lineAmount, num, r2, sumBy } from "./domain/calc";
import { certificatesOf, costPosition, costSourceRows, get, list, rows, today, type SourceRow } from "./domain/data";
import { constructionProjects } from "./domain/queues";
import type { Doc } from "@/lib/adapter";

type F = Record<string, unknown>;
type Row = Record<string, unknown>;
const PF = [{ fieldname: "company", label: "Company", fieldtype: "Link", options: "Company" }, { fieldname: "project", label: "Project", fieldtype: "Link", options: "Project" }];
const PREQ = [PF[0]!, { ...PF[1]!, reqd: 1 } as never];
const AS_OF = { fieldname: "as_of", label: "As of", fieldtype: "Date" };
const DATES = [{ fieldname: "from_date", label: "From Date", fieldtype: "Date" }, { fieldname: "to_date", label: "To Date", fieldtype: "Date" }];
const C = (fieldname: string, label: string, fieldtype = "Currency", options?: string, width = 130) => ({ fieldname, label, fieldtype, ...(options ? { options } : {}), width });
const S = (src: string) => `# FRAPPE_SERVER_REQUIRED: the source app ships this report as digit_construction/report/${src}/${src}.py (R19 source snapshot);\n# the Virtual Core computes the same rows in digit_construction/reportsR19.ts. Install the source report on staging.\n\n\ndef execute(filters=None):\n\tfrappe.throw(_("This report is not implemented on the server yet ({0}).").format(${JSON.stringify(src)}))\n`;
const scope = (f: F) => constructionProjects({ company: (f["company"] as string) || undefined, project: (f["project"] as string) || undefined });
const oneProject = (f: F) => (f["project"] ? scope(f)[0]?.name : undefined);
const inScope = (f: F) => { const ps = new Set(scope(f).map((p) => p.name)); return (d: Doc) => ps.has(String(d["project"] ?? "")); };
const eq = (f: F, k: string, d: Doc, field = k) => !f[k] || d[field] === f[k];
const day = (v: unknown) => String(v ?? "").slice(0, 10);
const ageDays = (from: unknown, on = today()) => { const d = day(from); return d ? Math.max(0, Math.round((Date.parse(on) - Date.parse(d)) / 86400000)) : 0; };
const live = (d: Doc) => num(d.docstatus) !== 2;

/** change_exposure.py OPEN_STATES */
export const CE_OPEN_STATES = ["Draft", "Under Review", "Pricing Requested"];
/** K04-01 open commercial claims (not agreed, partially agreed, rejected or withdrawn). */
export const CLAIM_OPEN = ["Draft", "Notice", "Submitted", "Under Assessment", "Under Negotiation", "Disputed"];

/** change_exposure.py _data: open exposure, approved-not-varied, age while open, pricing overdue. */
export function changeExposure(f: F, on = today()): Row[] {
  return list("Digit Change Event", (d) => live(d) && inScope(f)(d) && eq(f, "contract", d) && eq(f, "workflow_state", d))
    .sort((a, b) => day(a["ce_date"]).localeCompare(day(b["ce_date"])))
    .map((d) => {
      const st = String(d["workflow_state"] || "Draft"); const amount = num(d["cost_impact"]); const open = CE_OPEN_STATES.includes(st);
      return { name: d.name, title: d["title"] ?? "", project: d["project"], contract: d["contract"] ?? "", workflow_state: st, source_type: d["source_type"] ?? "",
        cost_impact: amount, open_exposure: open ? amount : 0, approved_not_varied: st === "Approved" && !d["associated_variation"] ? amount : 0,
        age_days: d["ce_date"] && open ? ageDays(d["ce_date"], on) : null, pricing_due_on: day(d["pricing_due_on"]),
        pricing_overdue: st === "Pricing Requested" && !!d["pricing_due_on"] && day(d["pricing_due_on"]) < on && !d["pricing_response"] ? 1 : 0,
        associated_variation: d["associated_variation"] ?? "" };
    });
}

/** risk_quality_outstanding_actions.py: Risks, RFIs and Defects in one list (section column), score bands as in source. */
export function riskQualityActions(f: F, on = today()): Row[] {
  const section = String(f["section"] || "All"); const ok = inScope(f); const out: Row[] = [];
  const overdue = (due: unknown, st: string, open: string[]) => (day(due) && open.includes(st) && day(due) < on ? 1 : 0);
  if (section === "All" || section === "Risk")
    for (const r of list("Digit Risk", (d) => live(d) && ok(d) && (!(f["status"] && section === "Risk") || d["workflow_state"] === f["status"]))) {
      const score = num(r["risk_score"]); const st = String(r["workflow_state"] ?? "");
      out.push({ section: "Risk", project: r["project"], record: r.name, title: r["title"] ?? "", status: st, severity: score >= 20 ? "Critical" : score >= 15 ? "High" : score >= 8 ? "Medium" : "Low",
        responsible: r["owner_user"] ?? "", due_date: day(r["due_date"]), age_days: ageDays(r["due_date"], on), overdue: overdue(r["due_date"], st, ["Proposed", "Open", "Active"]), cost_exposure: num(r["cost_exposure"]), company: r["company"] ?? "", record_doctype: "Digit Risk" });
    }
  if (section === "All" || section === "RFI")
    for (const r of list("Digit RFI", (d) => live(d) && ok(d) && (!(f["status"] && section === "RFI") || d["workflow_state"] === f["status"]))) {
      const st = String(r["workflow_state"] ?? "");
      out.push({ section: "RFI", project: r["project"], record: r.name, title: r["subject"] ?? "", status: st, severity: "", responsible: r["ball_in_court"] ?? "", due_date: day(r["due_date"]),
        age_days: ageDays(r["sent_on"], on), overdue: overdue(r["due_date"], st, ["Open"]), cost_exposure: 0, company: r["company"] ?? "", record_doctype: "Digit RFI" });
    }
  if (section === "All" || section === "Defect")
    for (const d of list("Digit Defect", (x) => live(x) && ok(x) && (!(f["status"] && section === "Defect") || x["status"] === f["status"]))) {
      const st = String(d["status"] ?? ""); const loc = String(d["location"] ?? ""); const desc = String(d["description"] ?? "");
      out.push({ section: "Defect", project: d["project"], record: d.name, title: (loc ? `${loc}: ${desc}` : desc).slice(0, 200), status: st, severity: d["severity"] ?? "", responsible: d["assigned_to"] ?? "",
        due_date: day(d["due_date"]), age_days: ageDays(d["creation"], on), overdue: overdue(d["due_date"], st, ["Open", "In Progress", "Pending Verification"]), cost_exposure: 0, company: d["company"] ?? "", record_doctype: "Digit Defect" });
    }
  const sev: Record<string, number> = { Critical: 0, High: 1, Major: 1, Medium: 2, Minor: 3, Low: 3, "": 4 };
  return out.sort((a, b) => num(b["overdue"]) - num(a["overdue"]) || (sev[String(a["severity"])] ?? 4) - (sev[String(b["severity"])] ?? 4) || num(b["age_days"]) - num(a["age_days"]));
}

/** tender_pipeline_and_awards.py: one row per tender with its award decision; win rate = Won / (Won + Lost). */
export function tenderPipelineAwards(f: F): { rows: Row[]; won: number; lost: number; winRate: number | null } {
  const from = day(f["from_date"]); const to = day(f["to_date"]);
  const tenders = list("Digit Tender", (t) => live(t) && eq(f, "company", t) && eq(f, "status", t) && (!from || day(t["submission_deadline"]) >= from) && (!to || day(t["submission_deadline"]) <= to))
    .sort((a, b) => day(b["submission_deadline"]).localeCompare(day(a["submission_deadline"])));
  const names = new Set(tenders.map((t) => t.name));
  const award = new Map(list("Digit Tender Award Decision", (a) => names.has(String(a["tender"])) && live(a)).map((a) => [String(a["tender"]), a] as const));
  const won = tenders.filter((t) => t["status"] === "Won").length; const lost = tenders.filter((t) => t["status"] === "Lost").length;
  const rows_ = tenders.map((t) => { const a = award.get(t.name); return { tender: t.name, title: t["title"] ?? "", customer: t["customer"] ?? "", company: t["company"] ?? "", status: t["status"] ?? "",
    submission_deadline: day(t["submission_deadline"]), est_cost: r2(num(t["est_cost"])), est_selling: r2(num(t["est_selling"])), margin_percent: r2(num(t["margin_percent"])),
    award_decision: a?.["decision"] ?? "", decided_by: a?.["decided_by"] ?? "", decided_on: day(a?.["decided_on"]), currency: t["currency"] ?? "" }; });
  return { rows: rows_, won, lost, winRate: won + lost ? Math.round((won / (won + lost)) * 1000) / 10 : null };
}

/** site_labour_register.py: attendance rows with crew trade and the equipment mobilised on the same project + date. */
export function siteLabourRegister(f: F): Row[] {
  const ok = inScope(f); const from = day(f["from_date"]); const to = day(f["to_date"]);
  const att = list("Digit Field Attendance", (a) => live(a) && ok(a) && (!from || day(a["attendance_date"]) >= from) && (!to || day(a["attendance_date"]) <= to))
    .sort((a, b) => day(b["attendance_date"]).localeCompare(day(a["attendance_date"])) || String(a["project"]).localeCompare(String(b["project"]))).slice(0, 500);
  const equip = new Map<string, { names: string[]; hours: number }>();
  for (const m of list("Digit Machinery Usage", (x) => live(x) && ok(x))) {
    const k = `${m["project"]}|${day(m["usage_date"])}`; const e = equip.get(k) ?? { names: [], hours: 0 };
    if (m["machinery"]) e.names.push(String(m["machinery"])); e.hours = r2(e.hours + num(m["hours"] ?? m["hours_used"])); equip.set(k, e);
  }
  return att.map((a) => { const crew = get("Digit Crew", a["crew"]); const e = equip.get(`${a["project"]}|${day(a["attendance_date"])}`);
    return { attendance: a.name, attendance_date: day(a["attendance_date"]), project: a["project"], crew: a["crew"] ?? "", trade: crew?.["trade"] ?? "", present_count: num(a["present_count"]),
      overtime_hours: num(a["overtime_hours"]), status: a["status"] ?? "", equipment: e?.names.join(", ") ?? "", equipment_hours: e?.hours ?? 0, operational_note: a["operational_note"] ?? "" }; });
}

/** Original value of a commitment source row (PO item net amount / work-order line amount) — the source's `original`. */
function originalOf(s: SourceRow): number {
  const d = get(s.doctype, s.name); const r = rows(d, s.table).find((x, i) => (num(x["idx"]) || i + 1) === s.row);
  if (!r) return s.amount;
  return s.doctype === "Purchase Order" ? num(r["net_amount"] ?? r["amount"]) : num(r["amount"]);
}
/** api/cost_control.open_commitments: open commitments per source row with original, relieved (invoiced/billed) and open. */
export function openCommitments(project: string, asOf?: string): Row[] {
  return costSourceRows(project, asOf).filter((r) => r.kind === "commitment").map((r) => { const original = r2(originalOf(r));
    return { doctype: r.doctype, name: r.name, row: r.row, detail: r.detail, cost_code: r.code, party: r.party, date: r.date, status: r.status, original, relieved: r2(original - r.amount), open: r.amount }; })
    .sort((a, b) => b.open - a.open);
}

/**
 * rules/cost_margin.contract_line_margin: cost reaches a pay item only through the budget line's `pay_item`
 * (owner-maintained mapping); budget lines without one stay unassigned instead of being spread over pay items.
 */
export function contractLineMargin(project: string, asOf?: string) {
  const pos = costPosition(project, asOf);
  const payItemOf = new Map(rows(pos.budget, "lines").map((l) => [String(l["line_key"] ?? ""), String(l["pay_item"] ?? "")] as const));
  const byItem = new Map<string, typeof pos.lines>(); const unassigned: typeof pos.lines = [];
  for (const l of pos.lines) { const item = payItemOf.get(l.line_key) ?? ""; if (item) byItem.set(item, [...(byItem.get(item) ?? []), l]); else unassigned.push(l); }
  const lines: Row[] = [];
  for (const c of list("Digit Client Contract", (x) => x["project"] === project && x["workflow_state"] !== "Draft" && live(x))) {
    const certified = new Map<string, number>();
    for (const cert of certificatesOf(c.name)) for (const l of rows(cert, "lines")) { const k = String(l["sov_line_key"] ?? ""); certified.set(k, r2((certified.get(k) ?? 0) + num(l["amount"]))); }
    for (const l of rows(c, "sov_lines")) {
      const key = String(l["line_key"] ?? ""); const costs = byItem.get(key) ?? []; byItem.delete(key);
      const value = lineAmount(l["qty"], l["rate"]); const actual = sumBy(costs, (x) => x.actual);
      const known = costs.length > 0 && costs.every((x) => x.eac !== null); const eac = known ? sumBy(costs, (x) => num(x.eac)) : null; const cert = certified.get(key) ?? 0;
      lines.push({ contract: c.name, pay_item: key, description: l["description"] ?? "", value, certified: cert, actual, eac, margin: eac === null ? null : r2(value - eac),
        margin_pct: eac === null || !value ? null : r2((100 * (value - eac)) / value), pay_vs_cost: r2(cert - actual), budget_lines: costs.map((x) => x.line_key).join(", ") });
    }
  }
  const orphan = [...unassigned, ...[...byItem.values()].flat()];
  return { budget: pos.budget?.name, lines, unassigned: orphan.map((x) => ({ line_key: x.line_key, cost_code: x.cost_code, actual: x.actual, eac: x.eac })) };
}

export const R19_REPORTS: PluginReport[] = [
  { name: "Change Exposure", ref_doctype: "Digit Change Event", report_type: "Script Report", script: S("change_exposure"),
    filters: [...PF, { fieldname: "contract", label: "Client Contract", fieldtype: "Link", options: "Digit Client Contract" }, { fieldname: "workflow_state", label: "Status", fieldtype: "Data" }],
    columns: [C("name", "Change Event", "Link", "Digit Change Event", 150), C("title", "Title", "Data", undefined, 200), C("project", "Project", "Link", "Project", 140), C("contract", "Contract", "Link", "Digit Client Contract", 140),
      C("workflow_state", "Status", "Data", undefined, 120), C("source_type", "Source", "Data", undefined, 110), C("cost_impact", "Cost Impact"), C("open_exposure", "Open Exposure"), C("approved_not_varied", "Approved Not Varied", "Currency", undefined, 140),
      C("age_days", "Age (days)", "Int", undefined, 90), C("pricing_due_on", "Pricing Due", "Date", undefined, 100), C("pricing_overdue", "Pricing Overdue", "Check", undefined, 90), C("associated_variation", "Variation", "Link", "Digit Client Variation", 140)],
    run: (f) => changeExposure(f) },
  { name: "Commercial Claims Register", ref_doctype: "Digit Commercial Claim", report_type: "Script Report", script: S("commercial_claims_register"),
    filters: [...PF, { fieldname: "contract", label: "Client Contract", fieldtype: "Link", options: "Digit Client Contract" }, { fieldname: "workflow_state", label: "Status", fieldtype: "Data" }, { fieldname: "open_only", label: "Open Only", fieldtype: "Check" }],
    columns: [C("name", "Claim", "Link", "Digit Commercial Claim", 150), C("title", "Title", "Data", undefined, 200), C("project", "Project", "Link", "Project", 140), C("contract", "Contract", "Link", "Digit Client Contract", 140),
      C("claim_category", "Category", "Data", undefined, 140), C("workflow_state", "Status", "Data", undefined, 120), C("event_date", "Event Date", "Date", undefined, 100), C("notice_date", "Notice Date", "Date", undefined, 100), C("notice_late", "Late Notice", "Check", undefined, 80),
      C("claimed_amount", "Claimed"), C("assessed_amount", "Assessed"), C("agreed_amount", "Agreed"), C("disputed_amount", "Disputed"), C("associated_variation", "Variation", "Link", "Digit Client Variation", 140), C("dispute_transfer_fa", "Final Account", "Link", "Digit Final Account", 140)],
    run: (f) => list("Digit Commercial Claim", (d) => live(d) && inScope(f)(d) && eq(f, "contract", d) && eq(f, "workflow_state", d) && (!num(f["open_only"]) || CLAIM_OPEN.includes(String(d["workflow_state"] || "Draft")))).sort((a, b) => day(a["notice_date"]).localeCompare(day(b["notice_date"])))
      .map((d) => ({ name: d.name, title: d["title"] ?? "", project: d["project"], contract: d["contract"] ?? "", claim_category: d["claim_category"] ?? "", workflow_state: d["workflow_state"] ?? "", event_date: day(d["event_date"]), notice_date: day(d["notice_date"]),
        notice_late: num(d["notice_late"]), claimed_amount: num(d["claimed_amount"]), assessed_amount: num(d["assessed_amount"]), agreed_amount: num(d["agreed_amount"]), disputed_amount: num(d["disputed_amount"]), associated_variation: d["associated_variation"] ?? "", dispute_transfer_fa: d["dispute_transfer_fa"] ?? "" })) },
  { name: "Contract Line Margin", ref_doctype: "Digit Client Contract", report_type: "Script Report", script: S("contract_line_margin"), filters: [...PREQ, AS_OF],
    columns: [C("contract", "Contract", "Link", "Digit Client Contract", 140), C("pay_item", "Pay Item", "Data", undefined, 110), C("description", "Description", "Data", undefined, 200), C("value", "Value"), C("certified", "Certified"), C("actual", "Actual Cost"), C("eac", "EAC"), C("margin", "Margin"), C("margin_pct", "Margin %", "Percent", undefined, 90), C("pay_vs_cost", "Pay vs Cost"), C("budget_lines", "Budget Lines", "Data", undefined, 140)],
    run: (f) => { const p = oneProject(f); return p ? contractLineMargin(p, (f["as_of"] as string) || undefined).lines : []; } },
  { name: "Open Commitments", ref_doctype: "Purchase Order", report_type: "Script Report", script: S("open_commitments"), filters: [...PREQ, AS_OF],
    columns: [C("doctype", "Source Type", "Data", undefined, 150), C("name", "Source Document", "Dynamic Link", "doctype", 150), C("row", "Row", "Int", undefined, 60), C("detail", "Detail", "Data", undefined, 160), C("cost_code", "Cost Code", "Data", undefined, 110), C("party", "Party", "Data", undefined, 140), C("date", "Date", "Date", undefined, 100), C("original", "Original"), C("relieved", "Relieved (invoiced/billed)"), C("open", "Open")],
    run: (f) => { const p = oneProject(f); return p ? openCommitments(p, (f["as_of"] as string) || undefined) : []; } },
  { name: "Risk Quality Outstanding Actions", ref_doctype: "Digit Risk", report_type: "Script Report", script: S("risk_quality_outstanding_actions"),
    filters: [...PF, { fieldname: "section", label: "Section", fieldtype: "Select", options: "All\nRisk\nRFI\nDefect", default: "All" }, { fieldname: "status", label: "Status", fieldtype: "Data" }],
    columns: [C("section", "Section", "Data", undefined, 80), C("project", "Project", "Link", "Project", 160), C("record_doctype", "Record Type", "Data", undefined, 110), C("record", "Record", "Dynamic Link", "record_doctype", 160), C("title", "Title / Description", "Data", undefined, 250), C("status", "Status", "Data", undefined, 110), C("severity", "Severity", "Data", undefined, 90),
      C("responsible", "Responsible", "Data", undefined, 140), C("due_date", "Due Date", "Date", undefined, 100), C("age_days", "Age (Days)", "Int", undefined, 90), C("overdue", "Overdue", "Check", undefined, 75), C("cost_exposure", "Cost Exposure"), C("company", "Company", "Link", "Company", 120)],
    run: (f) => riskQualityActions(f) },
  { name: "Site Labour and Equipment Register", ref_doctype: "Digit Field Attendance", report_type: "Script Report", script: S("site_labour_register"), filters: [...PF, ...DATES],
    columns: [C("attendance", "Attendance", "Link", "Digit Field Attendance", 150), C("attendance_date", "Date", "Date", undefined, 100), C("project", "Project", "Link", "Project", 150), C("crew", "Crew", "Link", "Digit Crew", 140), C("trade", "Trade", "Data", undefined, 110),
      C("present_count", "Present", "Int", undefined, 80), C("overtime_hours", "Overtime Hours", "Float", undefined, 110), C("status", "Status", "Data", undefined, 100), C("equipment", "Equipment Mobilised", "Data", undefined, 200), C("equipment_hours", "Equipment Hours", "Float", undefined, 110), C("operational_note", "Note", "Data", undefined, 200)],
    run: (f) => siteLabourRegister(f) },
  { name: "Tender Pipeline and Awards", ref_doctype: "Digit Tender", report_type: "Script Report", script: S("tender_pipeline_and_awards"),
    filters: [PF[0]!, { fieldname: "status", label: "Status", fieldtype: "Data" }, ...DATES],
    columns: [C("tender", "Tender", "Link", "Digit Tender", 150), C("title", "Title", "Data", undefined, 200), C("customer", "Customer", "Link", "Customer", 140), C("company", "Company", "Link", "Company", 120), C("status", "Status", "Data", undefined, 100), C("submission_deadline", "Submission Deadline", "Date", undefined, 110),
      C("est_cost", "Est. Cost"), C("est_selling", "Est. Selling"), C("margin_percent", "Margin %", "Percent", undefined, 90), C("award_decision", "Award Decision", "Data", undefined, 120), C("decided_by", "Decided By", "Data", undefined, 130), C("decided_on", "Decided On", "Date", undefined, 100)],
    run: (f) => { const x = tenderPipelineAwards(f); if (!x.rows.length) return []; return [...x.rows, { tender: "", title: x.winRate === null ? "Win Rate: N/A (no resolved tenders)" : `Win Rate: ${x.winRate}% (${x.won}/${x.won + x.lost})`, is_total: 1 }]; } },
];
export const R19_REPORT_NAMES = R19_REPORTS.map((r) => r.name);
