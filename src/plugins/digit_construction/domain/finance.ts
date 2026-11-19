/**
 * Department 09 finance and closeout (owner test list, FT-09-01 … FT-09-17, FT-09-COM-01, FT-09-HO-01 / 02): the save
 * rules the finance hooks apply and the read models behind the department 09 reports. Server twin: rules/finance.py
 * (same messages). Nothing here posts: WIP adjustments stay drafts (DEC-304), the override log and snapshots are records,
 * and only native documents (Purchase Invoice, Payment Entry, Journal Entry) write the ledgers through posting.ts.
 *
 * - invoiceErrors:      F09-02-1 an invoice without a purchase order needs the 07-06 approval level of its net total
 *                       (PO-linked invoices pass through the P5 three-way match); F09-02-2 a non-compliant
 *                       subcontractor's invoice is not submitted
 * - paymentHoldErrors:  F09-03-1 no payment is allocated to an invoice on payment hold
 * - wipRule:            F09-07-1 over / under = billed + unposted − (override or earned); F09-07-2 one adjustment per
 *                       project and period; DEC-304 posting stays disabled (revenue follows certificates)
 * - commissioningRule:  F09-COM-1 a Pass needs its certificate, the project manager records the result (DEC-295, the
 *                       consultant as external witness DEC-301); a Fail opens a linked defect
 * - assetRule:          F09-HO1-1 completeness = filled ÷ required fields, Ready for Review needs 100 % and passed
 *                       critical tests (DEC-296); project-scoped asset tag (DEC-297); the project manager reviews
 *                       (DEC-298); F09-HO1-2 Returned opens a follow-up task
 * - closeGateErrors:    F09-16-1 a construction project is completed only when the three closeout areas are complete,
 *                       no Critical punch item is open and the final account is Agreed / Approved
 * - read models:        evFigures / earnedValue (F09-08-1), wipFigures / wipSchedule (F09-11-1), actualsVsGl (F09-12-1),
 *                       spreadByCurve (F09-09-1), snapshotMetrics / snapshotDiff (F09-10-1 / 2), manualIndex (F09-HO2-1),
 *                       poBudgetWarnings / overrideRows (F09-14-1)
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser, userRoles } from "@/lib/session";
import { areaGate, num, r2, sumBy } from "./calc";
import { asSystem, contractPosition, costPosition, costSources, list, rows, today } from "./data";
import { approvalLevelFor, levelProblem, levels } from "./procControl";
import { budgetCheck } from "./control";
import { complianceOf, profileOf, SUB_MSG } from "./subcontract";
import { isConstructionProject } from "./supply";
import { plannedPercentAt, scheduleOf, weightedProgress } from "./scheduleCore";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
export const fill = (t: string, ...a: unknown[]) => a.reduce<string>((o, v, i) => o.split(`{${i}}`).join(String(v)), t);
const became = (doc: Row, before: Row | undefined, f: string, v: string) => s(doc[f]) === v && s(before?.[f]) !== v;
const all = (dt: string, pred?: (d: Doc) => boolean) => asSystem(() => list(dt, pred));
export const APPROVER_ROLES = ["Digit Project Manager", "Digit Director", "System Manager"];
const approver = (user: string) => user === "Administrator" || userRoles(user).some((r) => APPROVER_ROLES.includes(r));

/** Native mandatory account on invoice tax / deduction rows: a row whose account Finance has not named (e.g. the P2 retention account) keeps the invoice a draft. */
export function taxAccountErrors(doc: Doc): string[] {
  return rows(doc, "taxes").flatMap((t, i) => (String(t["account_head"] ?? "").trim() || !num(t["tax_amount"]) ? [] : [fill("Row #{0} ({1}): the account is not set — Finance names it before this invoice is submitted", num(t["idx"]) || i + 1, String(t["description"] ?? ""))]));
}
/** DEC-112 (owner ruling) message. */
export const CLOSE_MSG = { needsPm: "Purchase Order {0} still has open quantity or amount — the Project Manager approves closing it" };
/** Open quantity (ordered − received) or open amount (net − billed) left on a purchase order's rows. */
export function poOpenBalance(po: Doc): { qty: number; amount: number } {
  let qty = 0, amount = 0;
  for (const it of rows(po, "items")) { qty += Math.max(0, num(it["qty"]) - num(it["received_qty"])); amount += Math.max(0, num(it["net_amount"] ?? it["amount"]) - num(it["billed_amt"])); }
  return { qty: r2(qty), amount: r2(amount) };
}
/**
 * DEC-112 (owner ruling): closing a submitted purchase order that still has open quantity or amount needs Project
 * Manager approval — the closing user must hold Digit Project Manager (or Director / Administrator), and the approver
 * and date are stamped on the order. A fully received and billed order closes without approval.
 */
export function poCloseCheck(doc: Doc, before: Doc | undefined, user: string, roles: string[]): { doc: Doc; errors: string[] } {
  if (String(doc["status"] ?? "") !== "Closed" || String(before?.["status"] ?? "") === "Closed") return { doc, errors: [] };
  const open = poOpenBalance(doc);
  if (!(open.qty > 0.0005 || open.amount > 0.005)) return { doc, errors: [] };
  if (user !== "Administrator" && !roles.some((r) => r === "Digit Project Manager" || r === "Digit Director")) return { doc, errors: [fill(CLOSE_MSG.needsPm, doc.name)] };
  return { doc: { ...doc, digit_close_approved_by: user, digit_close_approved_on: today() }, errors: [] };
}
export const FIN_MSG = {
  invLevel: "An invoice total of {0} needs approval level {1} ({2}) or higher.",
  hold: "Purchase Invoice {0} is on payment hold ({1}); release the hold before paying it",
  overAllocated: "Total allocated {0} is more than the payment amount {1}",
  overrideFixed: "An override log entry is a permanent record and cannot be changed",
  wipPeriod: "Enter the WIP period as YYYY-MM",
  wipDup: "A WIP adjustment already exists for {0} in period {1} ({2})",
  wipOff: "WIP adjustments are not posted: revenue follows the certified value until the owner decides the revenue basis (DEC-304); the adjustment stays a draft",
  certificate: "Attach the commissioning certificate before recording a Pass",
  witnessRole: "The project manager records the commissioning result as the witness, not {0}",
  witnessName: "Enter the name of the consultant who witnessed the test",
  assetIncomplete: "Asset data is incomplete: {0}",
  assetDup: "Asset tag {0} already exists on project {1} ({2})",
  critical: "Critical commissioning tests have not passed: {0}",
  reviewer: "The project manager reviews handover assets, not {0}",
  returnTask: "Complete the handover data of asset {0} (returned for review)",
  manualMissing: "Required handover documents are not accepted: {0}",
  curveSum: "The curve percentages must add up to 100% (now {0}%)",
  curveEmpty: "Enter the curve percentages",
  snapExists: "Snapshot {0} already exists for project {1}; confirm to recreate it",
  budgetWarn: "Budget line {0} on {1}: committed + actual reaches {2} above the revised budget {3}",
  closeNone: "Create the closeout assessment before completing the project",
  closeArea: "Closeout items are incomplete: {0} ({1} open)",
  closeCritical: "Critical punch items are open: {0}",
  closeFinal: "The final account is not agreed",
};

// ---------------------------------------------------------------- FT-09-02 invoice approval and compliance
const invNet = (d: Doc) => num(d["net_total"]) || r2(sumBy(rows(d, "items"), (r) => num(r["net_amount"] ?? r["amount"])));
const conRows = (d: Doc) => rows(d, "items").filter((r) => isConstructionProject(r["project"] || d["project"]));
/** F09-02-1: the 07-06 level table applied to an invoice total (same levels, an invoice wording). */
export function invoiceLevelProblem(total: number, user = currentUser()): string {
  const p = levelProblem(total, user); if (!p) return "";
  const need = approvalLevelFor(total), all = levels();
  if (!all.length || !need) return p;
  // TC-09-02-01: on invoices the accountant holds the first level of the table (its limit, e.g. 50,000)
  if (userRoles(user).includes("Digit Accountant") && num(need["level"]) <= num(all[0]!["level"])) return "";
  return fill(FIN_MSG.invLevel, r2(total), num(need["level"]), s(need["role"]));
}
/** F09-02-1 / F09-02-2 on Purchase Invoice submit (construction rows only). */
export function invoiceErrors(doc: Doc, user = currentUser()): string[] {
  const con = conRows(doc); if (!con.length) return [];
  const e: string[] = [];
  const linked = rows(doc, "items").some((r) => s(r["purchase_order"]) || s(r["po_detail"]) || s(r["purchase_receipt"]));
  // an invoice raised from an approved subcontractor bill was approved on the bill's own workflow
  if (!linked && !s(doc["digit_subcontractor_bill"])) { const p = invoiceLevelProblem(invNet(doc), user); if (p) e.push(p); }
  const prof = profileOf(doc["supplier"]);
  if (prof) { const c = complianceOf(prof); if (c.status === "Non-compliant") e.push(fill(SUB_MSG.expired, c.expired.join(", "))); }
  return e;
}

// ---------------------------------------------------------------- FT-09-03 payment hold
export function paymentHoldErrors(pe: Doc): string[] {
  const e: string[] = [];
  for (const r of rows(pe, "references")) {
    if (r["reference_doctype"] !== "Purchase Invoice" || !(num(r["allocated_amount"]) > 0)) continue;
    const inv = adapter.get("Purchase Invoice", s(r["reference_name"]));
    if (inv && num(inv["digit_payment_hold"]) === 1) e.push(fill(FIN_MSG.hold, inv.name, s(inv["digit_hold_reason"]) || "Other"));
  }
  return e;
}
const conInvoice = (inv: Doc | undefined) => !!inv && (isConstructionProject(inv["project"]) || rows(inv, "items").some((r) => isConstructionProject(r["project"])));
/** F09-05-1: Σ allocated ≤ the payment amount on a payment of construction invoices (each invoice closes at zero outstanding in posting.ts). */
export function paymentAllocationErrors(pe: Doc): string[] {
  const refs = rows(pe, "references").filter((r) => num(r["allocated_amount"]) > 0);
  if (!refs.some((r) => conInvoice(adapter.get(s(r["reference_doctype"]), s(r["reference_name"]))))) return [];
  const total = r2(sumBy(refs, (r) => num(r["allocated_amount"]))), paid = r2(num(pe["paid_amount"]));
  return total > paid + 0.005 ? [fill(FIN_MSG.overAllocated, total, paid)] : [];
}
/** DEC-064: paying a non-compliant subcontractor is allowed with a warning; F09-14-1 logs the override. */
export function paymentComplianceWarnings(pe: Doc): string[] {
  if (pe["party_type"] !== "Supplier") return [];
  const prof = profileOf(pe["party"]); if (!prof) return [];
  const c = complianceOf(prof); return c.status === "Non-compliant" ? [fill(SUB_MSG.expired, c.expired.join(", "))] : [];
}

// ---------------------------------------------------------------- FT-09-14 override log
/** Budget lines a purchase order submit passes with a warning (over the revised budget, inside or without a limit). */
export function poBudgetWarnings(po: Doc): string[] {
  const by = new Map<string, Map<string, number>>();
  for (const it of rows(po, "items")) {
    const p = s(it["project"] || po["project"]), c = s(it["digit_cost_code"]); if (!p || !c) continue;
    const m = by.get(p) ?? new Map<string, number>(); m.set(c, r2((m.get(c) ?? 0) + num(it["net_amount"] ?? it["amount"]))); by.set(p, m);
  }
  const out: string[] = [];
  for (const [p, m] of [...by].sort(([a], [b]) => a.localeCompare(b))) for (const r of budgetCheck(p, m)) if (r.status === "Warn") out.push(fill(FIN_MSG.budgetWarn, r.cost_code, p, r.after, r.revised));
  return out;
}
/** One Digit Override Log row per warning the approval passed (explicit names, so a re-run never adds a second). */
export function overrideRows(dt: string, name: string, rule: string, messages: string[], reason: string, user: string): { name: string; values: Row }[] {
  return messages.map((message, i) => ({ name: `OL-${name}-${rule.slice(0, 3).toUpperCase()}-${i + 1}`,
    values: { ref_doctype: dt, ref_name_doctype: dt, ref_name: name, rule, message, user, reason } }));
}
export function logOverrides(dt: string, name: string, rule: string, messages: string[], reason = "", user = currentUser()): string[] {
  const made: string[] = [];
  for (const o of overrideRows(dt, name, rule, messages, reason, user)) if (!adapter.get("Digit Override Log", o.name)) { adapter.insertDoc("Digit Override Log", { name: o.name, ...o.values }); made.push(o.name); }
  return made;
}

/** Sheet 16 MISS-OverrideLog: an override entry is permanent — who overrode which rule, when and why never changes. */
export const OVERRIDE_FIXED = ["ref_doctype", "ref_name", "rule", "message", "user", "reason"] as const;
export function overrideLogRule(doc: Doc, before: Doc | undefined): string[] {
  return before && OVERRIDE_FIXED.some((f) => s(doc[f]) !== s(before[f])) ? [FIN_MSG.overrideFixed] : [];
}

// ---------------------------------------------------------------- FT-09-07 WIP adjustment
export const overUnder = (billed: number, unposted: number, earned: number, override = 0) => r2(billed + unposted - (override > 0 ? override : earned));
export function wipRule(doc: Doc, before: Doc | undefined): { doc: Doc; errors: string[] } {
  const e: string[] = []; const period = s(doc["period"]).trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) e.push(FIN_MSG.wipPeriod);
  const dup = period && doc["project"] ? all("Digit WIP Adjustment", (x) => x.name !== doc.name && x["project"] === doc["project"] && s(x["period"]).trim() === period && num(x.docstatus) !== 2)[0] : undefined;
  if (dup) e.push(fill(FIN_MSG.wipDup, s(doc["project"]), period, dup.name));
  if ((num(doc.docstatus) === 1 && num(before?.docstatus) !== 1) || became(doc, before, "posted_unposted_status", "Posted") || became(doc, before, "posted_unposted_status", "Reversed")) e.push(FIN_MSG.wipOff);
  const ou = overUnder(num(doc["billed"]), num(doc["unposted_billings"]), num(doc["earned_revenue"]), num(doc["earned_override"]));
  return { doc: { ...doc, over_under: ou, wip_adjustment: ou, posted_unposted_status: s(doc["posted_unposted_status"]) || "Unposted" }, errors: e };
}

// ---------------------------------------------------------------- FT-09-COM-01 commissioning
export function commissioningRule(doc: Doc, before: Doc | undefined, user = currentUser()): { doc: Doc; errors: string[]; defect: boolean } {
  const e: string[] = []; const res = s(doc["result"]);
  const decided = (res === "Pass" || res === "Fail") && s(before?.["result"]) !== res;
  if (decided && !approver(user)) e.push(fill(FIN_MSG.witnessRole, user));
  if (decided && s(doc["witness_party"]) === "Consultant" && !s(doc["witness"]).trim()) e.push(FIN_MSG.witnessName);
  if (res === "Pass" && decided && !s(doc["certificate"]).trim()) e.push(FIN_MSG.certificate);
  const d: Doc = { ...doc, ...(decided && !s(doc["test_date"]) ? { test_date: today() } : {}) };
  return { doc: d, errors: e, defect: res === "Fail" && decided && !s(doc["defect"]) && !e.length };
}
export const commissioningDefectName = (test: string) => `${test}-DEF`;
/** F09-COM-1: the defect a failed test opens (named after the test, so a second save never adds another). */
export function commissioningDefect(t: Doc): string {
  const name = commissioningDefectName(t.name);
  if (!adapter.get("Digit Defect", name)) adapter.insertDoc("Digit Defect", { name, title: `Commissioning test ${t.name} failed`, project: t["project"], company: t["company"], location: s(t["zone"]),
    description: s(t["result_note"]) || `Failed ${s(t["test_type"]) || "commissioning"} test of ${s(t["system"]) || "the system"}`, origin_commissioning: t.name, workflow_state: "Open", status: "Open", defect_type: "Defect", severity: "Major" });
  adapter.update("Digit Commissioning Test", t.name, { defect: name });
  return name;
}

// ---------------------------------------------------------------- FT-09-HO-01 handover asset
export const ASSET_REQUIRED: [string, string][] = [["asset_tag", "Asset Tag"], ["system", "System"], ["location", "Location"], ["manufacturer", "Manufacturer"], ["model", "Model"], ["serial_no", "Serial No"], ["warranty_until", "Warranty Until"]];
export function assetRule(doc: Doc, before: Doc | undefined, user = currentUser()): { doc: Doc; errors: string[]; task: boolean } {
  const e: string[] = [];
  const missing = ASSET_REQUIRED.filter(([f]) => !s(doc[f]).trim()).map(([, l]) => l);
  const tag = s(doc["asset_tag"]).trim();
  const dup = tag && doc["project"] ? all("Digit Handover Asset", (x) => x.name !== doc.name && x["project"] === doc["project"] && s(x["asset_tag"]).trim().toLowerCase() === tag.toLowerCase())[0] : undefined;
  if (dup) e.push(fill(FIN_MSG.assetDup, tag, s(doc["project"]), dup.name));
  if (became(doc, before, "status", "Ready for Review")) {
    if (missing.length) e.push(fill(FIN_MSG.assetIncomplete, missing.join(", ")));
    const crit = all("Digit Commissioning Test", (t) => t["asset"] === doc.name && num(t["critical"]) === 1 && s(t["result"]) !== "Pass").map((t) => t.name).sort();
    if (crit.length) e.push(fill(FIN_MSG.critical, crit.join(", ")));
  }
  if ((became(doc, before, "status", "Reviewed") || became(doc, before, "status", "Returned")) && !approver(user)) e.push(fill(FIN_MSG.reviewer, user));
  const pct = r2(((ASSET_REQUIRED.length - missing.length) / ASSET_REQUIRED.length) * 100);
  return { doc: { ...doc, completeness_pct: pct, missing_required_count: missing.length }, errors: e, task: became(doc, before, "status", "Returned") && !e.length };
}
/** F09-HO1-2: the follow-up task of a returned asset (one per return, explicit name). */
export function returnTaskValues(a: Doc, n: number, user: string): { name: string; values: Row } {
  return { name: `${a.name}-RET-${n}`, values: { status: "Open", priority: "Medium", date: today(), allocated_to: s(a["owner"]) || user, assigned_by: user,
    description: fill(FIN_MSG.returnTask, s(a["asset_tag"]) || a.name), reference_type: "Digit Handover Asset", reference_name: a.name } };
}
export function returnTask(a: Doc, user = currentUser()): string {
  const n = all("ToDo", (t) => t["reference_type"] === "Digit Handover Asset" && t["reference_name"] === a.name).length + 1;
  const t = returnTaskValues(a, n, user); if (!adapter.get("ToDo", t.name)) adapter.insertDoc("ToDo", { name: t.name, ...t.values });
  return t.name;
}

// ---------------------------------------------------------------- FT-09-HO-02 O&M manual index
export interface ManualDoc { package: string; row: number; type: string; description: string; file: string }
export interface ManualEntry { system: string; location: string; asset: string; asset_tag: string; manufacturer: string; model: string; serial_no: string; documents: ManualDoc[] }
const acceptedRow = (r: Row) => num(r["accepted"]) === 1 || r["status"] === "Accepted";
/** F09-HO2-1: assets by system → location → asset, each with the accepted handover documents linked to it only. */
export function manualIndex(project: string): { entries: ManualEntry[]; missing: string[] } {
  const pkgs = all("Digit Handover Package", (p) => p["project"] === project).sort((a, b) => a.name.localeCompare(b.name));
  const reqs = pkgs.flatMap((p) => rows(p, "requirements").map((r, i) => ({ p, r, row: num(r["idx"]) || i + 1 })));
  const missing = reqs.filter((x) => s(x.r["asset"]) && num(x.r["required"]) === 1 && !acceptedRow(x.r)).map((x) => `${x.p.name} #${x.row} ${s(x.r["description"]) || s(x.r["requirement_type"])}`.trim());
  const entries = all("Digit Handover Asset", (a) => a["project"] === project).map((a): ManualEntry => ({
    system: s(a["system"]), location: s(a["location"]), asset: a.name, asset_tag: s(a["asset_tag"]) || a.name, manufacturer: s(a["manufacturer"]), model: s(a["model"]), serial_no: s(a["serial_no"]),
    documents: reqs.filter((x) => x.r["asset"] === a.name && acceptedRow(x.r)).map((x) => ({ package: x.p.name, row: x.row, type: s(x.r["requirement_type"]), description: s(x.r["description"]), file: s(x.r["file_attachment"]) })),
  })).sort((a, b) => a.system.localeCompare(b.system) || a.location.localeCompare(b.location) || a.asset_tag.localeCompare(b.asset_tag));
  return { entries, missing };
}

// ---------------------------------------------------------------- FT-09-16 project close gates
export function closeGateErrors(project: string): string[] {
  const ca = all("Digit Closeout Assessment", (c) => c["project"] === project && num(c.docstatus) !== 2).sort((a, b) => s(b["assessment_date"]).localeCompare(s(a["assessment_date"])) || b.name.localeCompare(a.name))[0];
  const e: string[] = [];
  if (!ca) e.push(FIN_MSG.closeNone);
  else for (const area of ["Technical", "Commercial", "Financial"]) { const g = areaGate(rows(ca, "rows").filter((r) => r["area"] === area)); if (g.gate !== "Complete") e.push(fill(FIN_MSG.closeArea, area, g.open)); }
  const crit = all("Digit Punch Item", (x) => x["project"] === project && num(x.docstatus) !== 2 && x["status"] !== "Closed" && x["severity"] === "Critical").map((x) => x.name).sort();
  if (crit.length) e.push(fill(FIN_MSG.closeCritical, crit.join(", ")));
  if (!all("Digit Final Account", (f) => f["project"] === project && num(f.docstatus) !== 2 && ["Agreed", "Approved"].includes(s(f["workflow_state"]))).length) e.push(FIN_MSG.closeFinal);
  return e;
}
/** FT-09-16 close gates as requirement items (same checks as closeGateErrors, one item per gate) for the requirement cards. */
export interface CloseRequirement { key: string; en: string; ar: string; state: "ok" | "missing" | "idle"; missing: number; doctype: string; name?: string | undefined; names?: string[] | undefined }
export function closeoutRequirements(project: string): CloseRequirement[] {
  const ca = all("Digit Closeout Assessment", (c) => c["project"] === project && num(c.docstatus) !== 2).sort((a, b) => s(b["assessment_date"]).localeCompare(s(a["assessment_date"])) || b.name.localeCompare(a.name))[0];
  const out: CloseRequirement[] = [{ key: "assessment", en: "Closeout assessment", ar: "تقييم الإغلاق", state: ca ? "ok" : "missing", missing: ca ? 0 : 1, doctype: "Digit Closeout Assessment", name: ca?.name }];
  const AR: Record<string, string> = { Technical: "البنود الفنية", Commercial: "البنود التجارية", Financial: "البنود المالية" };
  for (const area of ["Technical", "Commercial", "Financial"]) {
    const g = ca ? areaGate(rows(ca, "rows").filter((r) => r["area"] === area)) : { gate: "Not Started", open: 0 };
    out.push({ key: area.toLowerCase(), en: `${area} items`, ar: AR[area]!, state: g.gate === "Complete" ? "ok" : g.open ? "missing" : "idle", missing: g.open, doctype: "Digit Closeout Assessment", name: ca?.name });
  }
  const crit = all("Digit Punch Item", (x) => x["project"] === project && num(x.docstatus) !== 2 && x["status"] !== "Closed" && x["severity"] === "Critical").map((x) => x.name).sort();
  out.push({ key: "critical", en: "Critical punch items closed", ar: "إغلاق الملاحظات الحرجة", state: crit.length ? "missing" : "ok", missing: crit.length, doctype: "Digit Punch Item", names: crit });
  const fa = all("Digit Final Account", (f) => f["project"] === project && num(f.docstatus) !== 2 && ["Agreed", "Approved"].includes(s(f["workflow_state"])))[0];
  out.push({ key: "final", en: "Final account agreed", ar: "الاتفاق على الحساب الختامي", state: fa ? "ok" : "missing", missing: fa ? 0 : 1, doctype: "Digit Final Account", name: fa?.name });
  return out;
}
export const closingProject = (doc: Doc, before: Doc | undefined) => !!before && s(doc["status"]) === "Completed" && s(before["status"]) !== "Completed" && isConstructionProject(doc.name);

// ---------------------------------------------------------------- read models
/** F09-08-1: EV = BAC × progress, PV = BAC × planned % to date, CPI = EV ÷ AC, SPI = EV ÷ PV, EAC = BAC ÷ CPI. */
export function evFigures(bac: number, progressPct: number, plannedPct: number | null, ac: number) {
  const ev = r2((bac * progressPct) / 100), pv = plannedPct === null ? null : r2((bac * plannedPct) / 100);
  const cpi = ac > 0 && ev > 0 ? r2(ev / ac) : null, spi = pv && pv > 0 ? r2(ev / pv) : null;
  return { bac: r2(bac), pv, ev, ac: r2(ac), cpi, spi, eac: ac > 0 && ev > 0 ? r2((bac * ac) / ev) : null, progress: progressPct, planned: plannedPct };
}
export const periodEnd = (period: string) => { const [y, m] = period.split("-").map(Number); return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10); };
export function earnedValue(project: string, asOf = today()) {
  const tasks = scheduleOf(project).tasks;
  const progress = tasks.length ? weightedProgress(tasks) : num(adapter.get("Project", project)?.["percent_complete"]);
  const planned = tasks.length ? weightedProgress(tasks, (t) => plannedPercentAt(t, asOf)) : null;
  const c = costPosition(project, asOf);
  return { project, as_of: asOf, ...evFigures(c.revised, progress, planned, c.actual) };
}
/** F09-11-1: % complete (cost) = Actual ÷ EAC; Earned = Revised Contract × %; Over / (Under) = Billed − Earned. */
export function wipFigures(revised: number, eac: number, actual: number, billed: number) {
  const pct = eac > 0 ? actual / eac : null; const earned = pct === null ? null : r2(revised * pct);
  return { revised: r2(revised), eac: r2(eac), margin: r2(revised - eac), pct: pct === null ? null : r2(pct * 100), earned, billed: r2(billed), over_under: earned === null ? null : r2(billed - earned), actual: r2(actual) };
}
export function contractTotals(project: string) {
  const cs = all("Digit Client Contract", (c) => c["project"] === project && c["workflow_state"] !== "Draft" && num(c.docstatus) !== 2).map(contractPosition);
  return { revised: r2(sumBy(cs, (x) => x.revised)), certified: r2(sumBy(cs, (x) => x.certifiedGross)), billed: r2(sumBy(cs, (x) => x.invoicedGross)), collected: r2(sumBy(cs, (x) => x.collected)), retention: r2(sumBy(cs, (x) => x.retentionHeld)) };
}
export function wipRow(project: string, asOf = today()) {
  const c = costPosition(project, asOf), k = contractTotals(project);
  return { project, ...wipFigures(k.revised, c.eac ?? 0, c.actual, k.billed) };
}
/** F09-09-1: month amount = total × curve %; the curve adds up to 100 %; the last month takes the rounding remainder. */
export function spreadByCurve(total: number, curve: number[]): { amounts: number[]; error?: string } {
  if (!curve.length) return { amounts: [], error: FIN_MSG.curveEmpty };
  const sum = r2(sumBy(curve, (x) => num(x)));
  if (Math.abs(sum - 100) > 0.001) return { amounts: [], error: fill(FIN_MSG.curveSum, sum) };
  const amounts = curve.map((p) => r2((total * num(p)) / 100));
  amounts[amounts.length - 1] = r2(total - sumBy(amounts.slice(0, -1), (x) => x));
  return { amounts };
}
export const addMonths = (period: string, n: number) => { const [y, m] = period.split("-").map(Number); const d = new Date(Date.UTC(y!, m! - 1 + n, 1)); return d.toISOString().slice(0, 7); };
/** F09-10-1: the metrics a job snapshot freezes as of its date. */
export function snapshotMetrics(project: string, asOf: string): Record<string, number> {
  const c = costPosition(project, asOf), k = contractTotals(project), w = wipFigures(k.revised, c.eac ?? 0, c.actual, k.billed);
  return { contract_value: k.revised, budget: c.revised, committed: c.committed, actual: c.actual, eac: c.eac ?? 0, certified: k.certified, billed: k.billed, collected: k.collected,
    retention_held: k.retention, earned_revenue: w.earned ?? 0, over_under: w.over_under ?? 0 };
}
export const payloadOf = (snap: Doc | undefined): Record<string, number> => { try { const p = snap?.["payload"]; return (typeof p === "string" ? JSON.parse(p) : p ?? {}) as Record<string, number>; } catch { return {}; } };
/** F09-10-2: the difference of every metric between two snapshots (later − earlier). */
export function snapshotDiff(from: Doc | undefined, to: Doc | undefined): { metric: string; from: number; to: number; diff: number }[] {
  const a = payloadOf(from), b = payloadOf(to);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].map((metric) => ({ metric, from: num(a[metric]), to: num(b[metric]), diff: r2(num(b[metric]) - num(a[metric])) }));
}
/** F09-12-1: GL (Σ debit − credit of the project's expense entries) against the DIGIT actual per account, with the vouchers that differ. */
export function actualsVsGl(project: string, from = "", to = "") {
  const expense = new Map<string, boolean>(); const isExp = (a: string) => { if (!expense.has(a)) expense.set(a, s(adapter.get("Account", a)?.["root_type"]) === "Expense"); return expense.get(a)!; };
  const inP = (d: string) => (!from || d >= from) && (!to || d <= to);
  const gl = new Map<string, Map<string, number>>(), dg = new Map<string, Map<string, number>>();
  const add = (m: Map<string, Map<string, number>>, acc: string, v: string, amt: number) => { const x = m.get(acc) ?? new Map<string, number>(); x.set(v, r2((x.get(v) ?? 0) + amt)); m.set(acc, x); };
  for (const g of asSystem(() => adapter.list("GL Entry"))) {
    if (g["project"] !== project || num(g["is_cancelled"]) === 1 || !isExp(s(g["account"])) || !inP(s(g["posting_date"]).slice(0, 10))) continue;
    add(gl, s(g["account"]), `${s(g["voucher_type"])}|${s(g["voucher_no"])}`, num(g["debit"]) - num(g["credit"]));
  }
  for (const c of costSources(project)) {
    if (c.kind !== "actual") continue;
    const d = adapter.get(c.doctype, c.name); if (!d || !inP(s(d["posting_date"]).slice(0, 10))) continue;
    const r = rows(d, c.table)[c.row - 1] ?? rows(d, c.table).find((x) => num(x["idx"]) === c.row);
    const acc = s(r?.["expense_account"] ?? r?.["account"]); add(dg, acc || "(no account)", `${c.doctype}|${c.name}`, c.amount);
  }
  return [...new Set([...gl.keys(), ...dg.keys()])].sort().map((account) => {
    const g = gl.get(account) ?? new Map<string, number>(), d = dg.get(account) ?? new Map<string, number>();
    const unmatched = [...new Set([...g.keys(), ...d.keys()])].sort().filter((v) => Math.abs((g.get(v) ?? 0) - (d.get(v) ?? 0)) > 0.005)
      .map((v) => ({ voucher: v.split("|")[1]!, doctype: v.split("|")[0]!, gl: r2(g.get(v) ?? 0), digit: r2(d.get(v) ?? 0) }));
    const glAmt = r2(sumBy([...g.values()], (x) => x)), dgAmt = r2(sumBy([...d.values()], (x) => x));
    return { project, account, gl: glAmt, digit: dgAmt, difference: r2(glAmt - dgAmt), unmatched };
  });
}

