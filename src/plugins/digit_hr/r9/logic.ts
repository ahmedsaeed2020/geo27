/**
 * Pure read rules of the HR R9 port, shared by the doc hooks and the actions: IBAN check digits (bank change),
 * service eligibility (services.eligible_reason), case routing (cases.match_rule / auto_route), SLA state (cases.sla_state),
 * payroll period locks (payroll_lock.locks) and parallel approval rounds (parallel_approval._open_round / _evaluate).
 */
import { adapter, type Doc } from "@/lib/adapter";
import { _, addHours, dateOnly, nowDatetime, s, toDate, userEnabled } from "./core";
import { DCR, DPA, DPL, DSC_ITEM } from "./doctypes";

export const SUPPORTED: string[] = ["DIGIT Compensation Review", "DIGIT Position Budget", "DIGIT Workforce Plan"];
const n = (v: unknown) => Number(v ?? 0) || 0;

/** bank_change iban_ok: ISO 13616 mod-97 check digits; Saudi IBANs (SA) are 24 characters. */
export function ibanOk(iban: string): boolean {
  const x = (iban || "").replace(/ /g, "").toUpperCase();
  if (x.length < 15 || x.length > 34 || !/^[A-Z]{2}/.test(x) || !/^\d{2}$/.test(x.slice(2, 4)) || !/^[A-Z0-9]+$/.test(x)) return false;
  if (x.startsWith("SA") && x.length !== 24) return false;
  const digits = (x.slice(4) + x.slice(0, 4)).split("").map((c) => parseInt(c, 36).toString()).join("");
  let mod = 0; for (const ch of digits) mod = (mod * 10 + Number(ch)) % 97;
  return mod === 1;
}

const FIELD: Record<string, string> = { Department: "department", "Employee Grade": "grade", "Employment Type": "employment_type" };
/** Department or any sub-department (nested set lft/rgt when present, otherwise the parent_department chain). */
function inDepartment(dept: string, ancestor: string): boolean {
  if (dept === ancestor) return true;
  const a = adapter.get("Department", ancestor), d = adapter.get("Department", dept);
  if (a && d && a["lft"] != null && d["lft"] != null) return n(a["lft"]) < n(d["lft"]) && n(d["rgt"]) < n(a["rgt"]);
  const seen = new Set<string>(); let cur = d ? s(d["parent_department"]) : "";
  while (cur && !seen.has(cur)) { if (cur === ancestor) return true; seen.add(cur); cur = s(adapter.get("Department", cur)?.["parent_department"]); }
  return false;
}
/** services.eligible_reason: undefined when eligible, otherwise the (translated) reason. */
export function eligibleReason(item: Doc, employee: string, company?: string): string | undefined {
  if (n(item["enabled"]) !== 1) return _("the service is disabled");
  if (!employee) return _("no employee");
  const emp = adapter.get("Employee", employee); if (!emp) return _("no employee");
  if (s(item["company"]) && s(item["company"]) !== (company || s(emp["company"]))) return _("offered to another company");
  const rules: Record<string, string[]> = {};
  for (const r of (Array.isArray(item["eligibility"]) ? item["eligibility"] : []) as Doc[]) (rules[s(r["based_on"])] ??= []).push(s(r["value"]));
  for (const [basedOn, values] of Object.entries(rules)) {
    const have = s(emp[FIELD[basedOn] ?? ""]);
    const ok = basedOn === "Department" ? !!have && values.some((v) => inDepartment(have, v)) : values.includes(have);
    if (!ok) return _("{0} not eligible", _(basedOn));
  }
  return undefined;
}
/** services._items: enabled services of the company (or of every company), sort_order then title. */
export function catalogItems(company: string): Doc[] {
  return adapter.list(DSC_ITEM).filter((i) => n(i["enabled"]) === 1 && (!s(i["company"]) || s(i["company"]) === company))
    .sort((a, b) => n(a["sort_order"]) - n(b["sort_order"]) || s(a["service_title"]).localeCompare(s(b["service_title"])));
}
/** DIGIT HR Service Case.apply_service_item (new case): eligibility, category, default severity, SLA due date. */
export function applyServiceItem(doc: Doc): { doc: Doc; error?: string } {
  if (!s(doc["service_item"])) return { doc };
  const item = adapter.get(DSC_ITEM, s(doc["service_item"]));
  if (!item) return { doc, error: _("Document {0} not found", s(doc["service_item"])) };
  const reason = eligibleReason(item, s(doc["employee"]), s(doc["company"]));
  if (reason) return { doc, error: _("Service {0} is not available for this employee: {1}", s(item["service_title"]), reason) };
  let d: Doc = { ...doc, category: item["category"] };
  if (s(item["default_severity"]) && (!s(d["severity"]) || s(d["severity"]) === "Medium")) d = { ...d, severity: item["default_severity"] };
  if (n(item["sla_hours"]) && !s(d["due_at"])) { const opened = s(d["opened_on"]) || nowDatetime(); d = { ...d, opened_on: opened, due_at: addHours(opened, n(item["sla_hours"])) }; }
  return { doc: d };
}

/** cases.match_rule: first enabled rule of the case's company matching category and severity (empty = any), by priority. */
export function matchRule(doc: Doc): Doc | undefined {
  if (!s(doc["company"])) return undefined;
  return adapter.list(DCR).filter((r) => s(r["company"]) === s(doc["company"]) && n(r["enabled"]) === 1)
    .sort((a, b) => n(a["priority"]) - n(b["priority"]) || s(a["creation"]).localeCompare(s(b["creation"])))
    .find((r) => (!s(r["category"]) || s(r["category"]) === s(doc["category"])) && (!s(r["severity"]) || s(r["severity"]) === s(doc["severity"])));
}
/** cases.auto_route (before_insert): a new unassigned case gets the matching rule's active handler. */
export function autoRoute(doc: Doc): Doc {
  if (s(doc["assigned_to"])) return doc;
  const rule = matchRule(doc);
  return rule && userEnabled(rule["assign_to"]) ? { ...doc, assigned_to: rule["assign_to"] } : doc;
}

const ACTIVE = ["Assigned", "In Progress"];
export type SlaState = "no_sla" | "met" | "breached" | "paused" | "at_risk" | "on_track";
/** cases.sla_state (pause fields belong to other R9 ids and are absent from this Core's case, so paused = false). */
export function slaState(doc: Doc, now = new Date()): { state: SlaState; elapsed_ratio?: number; due_at: string } {
  const due = s(doc["due_at"]);
  if (!due) return { state: "no_sla", due_at: "" };
  const status = s(doc["case_status"]) || "Open";
  if (!ACTIVE.includes(status) && status !== "Open") return { state: toDate(doc["modified"]) <= toDate(due) ? "met" : "breached", due_at: due };
  const start = toDate(s(doc["opened_on"]) || s(doc["creation"]));
  const total = (toDate(due).getTime() - start.getTime()) / 1000, used = (now.getTime() - start.getTime()) / 1000;
  const ratio = total > 0 ? Math.round((used / total) * 1000) / 1000 : 1;
  return { state: now > toDate(due) ? "breached" : ratio >= 0.8 ? "at_risk" : "on_track", elapsed_ratio: ratio, due_at: due };
}

/** payroll_lock.locks: Locked periods of the company overlapping [from, to]. */
export function locksFor(company: string, from: unknown, to?: unknown): Doc[] {
  if (!company || !s(from)) return [];
  const end = dateOnly(s(to) || s(from)), start = dateOnly(from);
  return adapter.list(DPL).filter((l) => s(l["company"]) === company && s(l["lock_status"]) === "Locked" && dateOnly(l["from_date"]) <= end && dateOnly(l["to_date"]) >= start).slice(0, 5);
}
/** payroll_lock._dates */
export function payrollDates(doctype: string, doc: Doc): [string, string] {
  if (doctype === "Salary Slip") return [s(doc["start_date"]), s(doc["end_date"])];
  if (n(doc["is_recurring"])) return [s(doc["from_date"]), s(doc["to_date"])];
  return [s(doc["payroll_date"]), s(doc["payroll_date"])];
}

const byNewest = (a: Doc, b: Doc) => s(b["creation"]).localeCompare(s(a["creation"])) || b.name.localeCompare(a.name);
/** Latest approval round of a document (status / submit gate). */
export function roundFor(dt: string, name: string): Doc | undefined {
  return adapter.list(DPA).filter((r) => s(r["reference_doctype"]) === dt && s(r["reference_name"]) === name).sort(byNewest)[0];
}
/** parallel_approval._open_round: latest round that is not Rejected. */
export function openRound(dt: string, name: string): Doc | undefined {
  return adapter.list(DPA).filter((r) => s(r["reference_doctype"]) === dt && s(r["reference_name"]) === name && s(r["approval_status"]) !== "Rejected").sort(byNewest)[0];
}
/** parallel_approval._evaluate */
export function evaluate(doc: Doc): "Approved" | "Rejected" | "Pending" {
  const rows = (Array.isArray(doc["approvers"]) ? doc["approvers"] : []) as Doc[];
  const approved = rows.filter((r) => s(r["decision"]) === "Approved").length, rejected = rows.filter((r) => s(r["decision"]) === "Rejected").length;
  const total = rows.length;
  const need = ({ All: total, Any: 1, Quorum: n(doc["quorum"]) || total } as Record<string, number>)[s(doc["rule"]) || "All"] ?? total;
  if (approved >= need) return "Approved";
  if (total - rejected < need) return "Rejected";
  return "Pending";
}
