/**
 * Action queues and alerts of DIGIT Construction — derived from canonical records at read time (no stored counts).
 * Each queue names its DocType and the exact filter that the list drill opens, so a queue count equals its list.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { num } from "./calc";
import { longLeadItems } from "./control";
import { overdueCorrespondence, technicalApprovalWarnings } from "./site";
import { APP, isSubmitted, latestForecast, list, overdueTasks, policyDefined, procurementOf, today, type Ctx } from "./data";

export type Dept = "MGT" | "PRJ" | "ET" | "CON" | "SUB" | "CST" | "PROC" | "RSP" | "FIN";
export const DEPTS: { key: Dept; en: string; ar: string; path: string }[] = [
  { key: "MGT", en: "Management", ar: "الإدارة", path: "" },
  { key: "PRJ", en: "Projects & execution", ar: "المشاريع والتنفيذ", path: "dept/prj" },
  { key: "ET", en: "Estimating & tenders", ar: "التقدير والعطاءات", path: "dept/et" },
  { key: "CON", en: "Contracts & claims", ar: "العقود والمستخلصات", path: "dept/con" },
  { key: "SUB", en: "Subcontracts", ar: "مقاولو الباطن", path: "dept/sub" },
  { key: "CST", en: "Budget & cost", ar: "الموازنة والتكلفة", path: "dept/cst" },
  { key: "PROC", en: "Procurement & materials", ar: "المشتريات والمواد", path: "dept/proc" },
  { key: "RSP", en: "Resources & spend", ar: "الموارد والمصروفات", path: "dept/rsp" },
  { key: "FIN", en: "Financial position & closeout", ar: "الموقف المالي والإغلاق", path: "dept/fin" },
];
export interface Queue { key: string; dept: Dept; en: string; ar: string; doctype: string; filters: [string, string, unknown][]; docs: Doc[]; severity: "action" | "risk" | "blocked"; role: string; page?: string }

/** Construction projects: a project with a construction contract type or any construction record linked to it. */
export function constructionProjects(ctx: Ctx = {}): Doc[] {
  const linked = new Set<string>();
  for (const dt of ["Digit Client Contract", "Digit Tender", "Digit Project Cost Budget", "Digit Subcontract Work Order", "Digit Work Package"]) for (const d of list(dt)) if (d["project"]) linked.add(String(d["project"]));
  return list("Project", (p) => (!!p["digit_contract_type"] || linked.has(p.name)) && (!ctx.company || p["company"] === ctx.company) && (!ctx.project || p.name === ctx.project));
}
export function settings(): Doc | undefined { return adapter.get("Digit Construction Settings", "Digit Construction Settings"); }
const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

export function queues(ctx: Ctx = {}, on = today()): Queue[] {
  const ps = new Set(constructionProjects(ctx).map((p) => p.name));
  const inScope = (d: Doc) => !d["project"] || ps.has(String(d["project"]));
  const byState = (dt: string, state: string) => list(dt, (d) => d["workflow_state"] === state && inScope(d));
  const q: Queue[] = [];
  const add = (x: Omit<Queue, "docs"> & { docs: Doc[] }) => { q.push(x); };
  const ws = (s: string): [string, string, unknown][] => [["workflow_state", "=", s]];
  // PRJ
  add({ key: "progress_review", dept: "PRJ", en: "Progress updates awaiting review", ar: "تحديثات إنجاز بانتظار المراجعة", doctype: "Digit Progress Update", filters: ws("Submitted"), docs: byState("Digit Progress Update", "Submitted"), severity: "action", role: "Digit Project Manager" });
  add({ key: "stage_review", dept: "PRJ", en: "Stage plans awaiting approval", ar: "خطط مراحل بانتظار الاعتماد", doctype: "Digit Stage Planning", filters: ws("Submitted"), docs: byState("Digit Stage Planning", "Submitted"), severity: "action", role: "Digit Project Manager" });
  const late = [...ps].flatMap((p) => overdueTasks(p, on));
  add({ key: "overdue_tasks", dept: "PRJ", en: "Overdue tasks", ar: "مهام متأخرة", doctype: "Task", filters: [["exp_end_date", "<", on], ["status", "not in", ["Completed", "Cancelled"]]], docs: late, severity: "risk", role: "Digit Project Manager" });
  // FT-02-11: incoming correspondence that needs a reply, past its response date, with no reply linked (site.ts overdueCorrespondence)
  const corr = overdueCorrespondence(on).filter((c) => ps.has(String(c["project"])));
  add({ key: "corr_overdue", dept: "PRJ", en: "Correspondence awaiting a reply", ar: "مراسلات متأخرة الرد", doctype: "Digit Correspondence", filters: [["name", "in", corr.map((c) => c.name)]], docs: corr, severity: "risk", role: "Digit Project Manager" });
  // ET
  add({ key: "estimate_approval", dept: "ET", en: "Estimates awaiting approval", ar: "تقديرات بانتظار الاعتماد", doctype: "Digit Estimate Version", filters: ws("Submitted"), docs: byState("Digit Estimate Version", "Submitted"), severity: "action", role: "Digit Director" });
  const soon = list("Digit Tender", (t) => !["Won", "Lost", "Submitted", "Cancelled"].includes(String(t["status"])) && !!t["submission_deadline"] && days(String(t["submission_deadline"]), on) <= 21 && (!ctx.company || t["company"] === ctx.company));
  add({ key: "tender_deadline", dept: "ET", en: "Tenders due within 21 days", ar: "عطاءات تستحق خلال 21 يوماً", doctype: "Digit Tender", filters: [["status", "not in", ["Won", "Lost", "Submitted", "Cancelled"]]], docs: soon, severity: "risk", role: "Digit Estimator" });
  add({ key: "returned_estimates", dept: "ET", en: "Returned estimates to revise", ar: "تقديرات معادة للمراجعة", doctype: "Digit Estimate Version", filters: ws("Returned"), docs: byState("Digit Estimate Version", "Returned"), severity: "action", role: "Digit Estimator" });
  // CON
  add({ key: "variation_decision", dept: "CON", en: "Variations awaiting decision", ar: "أوامر تغييرية بانتظار القرار", doctype: "Digit Client Variation", filters: ws("Submitted"), docs: byState("Digit Client Variation", "Submitted"), severity: "action", role: "Digit Director" });
  add({ key: "claims_to_certify", dept: "CON", en: "Claims awaiting certificate", ar: "مطالبات بانتظار الشهادة", doctype: "Digit Client Claim", filters: ws("Submitted"), docs: byState("Digit Client Claim", "Submitted"), severity: "action", role: "Digit QS" });
  add({ key: "cert_confirm", dept: "CON", en: "Draft certificates to confirm", ar: "شهادات مسودة بانتظار التأكيد", doctype: "Digit Client Certificate", filters: ws("Draft"), docs: byState("Digit Client Certificate", "Draft"), severity: "action", role: "Digit Project Manager" });
  const terms = list("Digit Client Contract", (c) => inScope(c) && (c["terms_revisions"] as Doc[] | undefined ?? []).some((r) => r["status"] === "Requested"));
  add({ key: "terms_revision", dept: "CON", en: "Contract term revisions requested", ar: "طلبات مراجعة شروط العقود", doctype: "Digit Client Contract", filters: [["workflow_state", "=", "Active"]], docs: terms, severity: "action", role: "Digit Director" });
  // SUB
  add({ key: "books_qs", dept: "SUB", en: "Measurement books awaiting QS", ar: "دفاتر قياس بانتظار المراجعة", doctype: "Digit Measurement Book", filters: ws("Submitted"), docs: byState("Digit Measurement Book", "Submitted"), severity: "action", role: "Digit QS", page: "sub/review" });
  add({ key: "bills_approve", dept: "SUB", en: "Subcontract bills to approve", ar: "مستخلصات مقاولين بانتظار الاعتماد", doctype: "Digit Subcontractor Bill", filters: ws("Draft"), docs: byState("Digit Subcontractor Bill", "Draft"), severity: "action", role: "Digit Project Manager" });
  add({ key: "profiles_review", dept: "SUB", en: "Subcontractor profiles under review", ar: "ملفات مقاولين قيد المراجعة", doctype: "Digit Subcontractor Profile", filters: ws("Under Review"), docs: byState("Digit Subcontractor Profile", "Under Review"), severity: policyDefined("P8") ? "action" : "blocked", role: "Digit Director" });
  const expiring = list("Digit Subcontractor Profile", (p) => ["cr_expiry", "insurance_expiry"].some((f) => p[f] && days(String(p[f]), on) <= 30));
  add({ key: "profile_expiry", dept: "SUB", en: "CR / insurance expiring within 30 days", ar: "سجلات تجارية أو تأمين تنتهي خلال 30 يوماً", doctype: "Digit Subcontractor Profile", filters: [], docs: expiring, severity: "risk", role: "Digit Procurement Officer" });
  // CST
  add({ key: "budget_revisions", dept: "CST", en: "Budget revisions awaiting approval", ar: "تعديلات موازنة بانتظار الاعتماد", doctype: "Digit Budget Revision", filters: ws("Submitted"), docs: byState("Digit Budget Revision", "Submitted"), severity: "action", role: "Digit Director" });
  add({ key: "budget_transfers", dept: "CST", en: "Budget transfers awaiting approval", ar: "مناقلات موازنة بانتظار الاعتماد", doctype: "Digit Budget Transfer", filters: ws("Draft"), docs: byState("Digit Budget Transfer", "Draft"), severity: "action", role: "Digit Project Manager" });
  const staleDays = num(settings()?.["stale_forecast_days"]) || 45;
  const stale = [...ps].map((p) => adapter.get("Project", p)!).filter((p) => p && p["status"] === "Open" && list("Digit Project Cost Budget", (b) => b["project"] === p.name && isSubmitted(b)).length > 0)
    .filter((p) => { const f = latestForecast(p.name); return !f || days(on, String(f["cutoff_date"])) > staleDays; });
  add({ key: "stale_forecast", dept: "CST", en: `Projects without a forecast in ${staleDays} days`, ar: `مشاريع بلا توقع خلال ${staleDays} يوماً`, doctype: "Project", filters: [["status", "=", "Open"]], docs: stale, severity: "risk", role: "Digit QS", page: "cost/sheet" });
  // PROC
  const proc = [...ps].map((p) => procurementOf(p, on));
  add({ key: "mr_overdue", dept: "PROC", en: "Material requests overdue", ar: "طلبات مواد متأخرة", doctype: "Material Request", filters: [["docstatus", "=", 1], ["schedule_date", "<", on]], docs: proc.flatMap((x) => x.overdueMr), severity: "risk", role: "Digit Procurement Officer" });
  add({ key: "po_late", dept: "PROC", en: "Purchase orders late for delivery", ar: "أوامر شراء متأخرة التوريد", doctype: "Purchase Order", filters: [["docstatus", "=", 1], ["schedule_date", "<", on]], docs: proc.flatMap((x) => x.latePo), severity: "risk", role: "Digit Procurement Officer" });
  // FT-01-10 / FT-07: long-lead purchase order lines past their promised date and not fully received (control.ts longLeadItems)
  const lateLong = [...new Set(longLeadItems(undefined, on).filter((x) => x.status === "Late" && ps.has(x.project)).map((x) => x.po))];
  add({ key: "long_lead_late", dept: "PROC", en: "Long-lead purchases late", ar: "مشتريات طويلة التوريد متأخرة", doctype: "Purchase Order", filters: [["name", "in", lateLong]], docs: lateLong.map((n) => adapter.get("Purchase Order", n)!).filter(Boolean), severity: "risk", role: "Digit Procurement Officer" });
  // FT-02-07 / DEC-030: purchase orders carrying material whose submittal is not approved A/B — a warning, the order is not blocked
  const unapproved = list("Purchase Order", (p) => num(p.docstatus) !== 2 && ((p["items"] as Doc[] | undefined) ?? []).some((it) => ps.has(String(it["project"] ?? p["project"] ?? ""))) && technicalApprovalWarnings(p.name).length > 0);
  add({ key: "po_unapproved_material", dept: "PROC", en: "Orders with technically unapproved material", ar: "أوامر شراء بمواد غير معتمدة فنيًا", doctype: "Purchase Order", filters: [["name", "in", unapproved.map((p) => p.name)]], docs: unapproved, severity: "risk", role: "Digit Procurement Officer" });
  add({ key: "rfq_open", dept: "PROC", en: "RFQs without quotations", ar: "طلبات عروض بلا عروض أسعار", doctype: "Request for Quotation", filters: [["docstatus", "=", 1]], docs: proc.flatMap((x) => x.openRfq), severity: "action", role: "Digit Procurement Officer", page: "proc/comparison" });
  // RSP
  add({ key: "expense_approval", dept: "RSP", en: "Site expenses awaiting approval", ar: "مصروفات موقع بانتظار الاعتماد", doctype: "Digit Site Expense", filters: ws("Submitted"), docs: byState("Digit Site Expense", "Submitted"), severity: "action", role: "Digit Accountant" });
  const attDraft = list("Digit Field Attendance", (a) => num(a.docstatus) === 0 && inScope(a));
  add({ key: "attendance_draft", dept: "RSP", en: "Site attendance not submitted", ar: "حضور ميداني لم يُرسل", doctype: "Digit Field Attendance", filters: [["docstatus", "=", 0]], docs: attDraft, severity: "action", role: "Digit Site Engineer" });
  // FIN
  const toInvoice = list("Digit Client Certificate", (c) => isSubmitted(c) && c["workflow_state"] === "Confirmed" && !c["sales_invoice"] && inScope(c));
  add({ key: "cert_invoice", dept: "FIN", en: "Confirmed certificates to invoice", ar: "شهادات مؤكدة بانتظار الفوترة", doctype: "Digit Client Certificate", filters: ws("Confirmed"), docs: toInvoice, severity: policyDefined("P9") ? "action" : "blocked", role: "Digit Accountant" });
  const billInv = list("Digit Subcontractor Bill", (b) => isSubmitted(b) && b["workflow_state"] === "Approved" && !b["purchase_invoice"] && inScope(b));
  add({ key: "bill_invoice", dept: "FIN", en: "Approved bills awaiting purchase invoice", ar: "مستخلصات معتمدة بانتظار فاتورة الشراء", doctype: "Digit Subcontractor Bill", filters: ws("Approved"), docs: billInv, severity: "action", role: "Digit Accountant" });
  const overdueAr = list("Sales Invoice", (s) => isSubmitted(s) && num(s["outstanding_amount"]) > 0.005 && String(s["due_date"] ?? "") < on && ps.has(String(s["project"])));
  add({ key: "ar_overdue", dept: "FIN", en: "Overdue client invoices", ar: "فواتير عملاء متأخرة السداد", doctype: "Sales Invoice", filters: [["docstatus", "=", 1], ["outstanding_amount", ">", 0], ["due_date", "<", on]], docs: overdueAr, severity: "risk", role: "Digit Accountant", page: "finance" });
  add({ key: "retention_pending", dept: "FIN", en: "Retention releases pending approval", ar: "طلبات إفراج عن محتجزات بانتظار الاعتماد", doctype: "Digit Retention Release Request", filters: ws("Pending Approval"), docs: byState("Digit Retention Release Request", "Pending Approval"), severity: policyDefined("P2") ? "action" : "blocked", role: "Digit Director" });
  add({ key: "fa_disputed", dept: "FIN", en: "Final accounts in dispute", ar: "حسابات ختامية متنازع عليها", doctype: "Digit Final Account", filters: ws("Disputed"), docs: byState("Digit Final Account", "Disputed"), severity: "risk", role: "Digit QS" });
  // MGT
  const undef = list("Digit Policy Decision", (p) => p["status"] !== "Defined");
  add({ key: "policies", dept: "MGT", en: "Owner policy decisions outstanding", ar: "قرارات سياسات المالك غير المحددة", doctype: "Digit Policy Decision", filters: [["status", "!=", "Defined"]], docs: undef, severity: "blocked", role: "System Manager", page: "settings/policies" });
  return q;
}
export const queueHref = (q: Queue) => q.page;
export { APP };
