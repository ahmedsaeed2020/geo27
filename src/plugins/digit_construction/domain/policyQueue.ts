/**
 * R6-6 work waiting on each owner policy (P1–P9), computed from the same records and conditions the gates check
 * (domain/hooks.ts and domain/services.ts), over the session user's readable construction records. A policy that is
 * Defined by the owner blocks nothing, so its list is empty; a Defined value labelled as an illustrative demo assumption
 * (P9 in the demo) lists the work that would use it, never as "blocked". Read-only; nothing is decided or changed here.
 */
import type { Doc } from "@/lib/adapter";
import { num, validityState } from "./calc";
import { get, list, policy, policyDefined, rows, today } from "./data";
import { matchingRows } from "./matching";
import { constructionProjects } from "./queues";

export interface PolicyWork { doctype: string; name: string; project: string; what: string; detail?: string | undefined; item?: string | undefined; table?: string | undefined; row?: number | undefined }
/** BLOCKED = undefined policy holds the items back · ILLUSTRATIVE = a labelled demo assumption lets them run · CLEAR = owner decision recorded. */
export interface PolicyQueue { key: string; status: string; mode: "BLOCKED" | "ILLUSTRATIVE" | "CLEAR"; items: PolicyWork[] }

const projectOf = (d: Doc | undefined): string => {
  if (!d) return "";
  if (d["project"]) return String(d["project"]);
  for (const [f, dt] of [["contract", "Digit Client Contract"], ["work_order", "Digit Subcontract Work Order"], ["budget", "Digit Project Cost Budget"], ["tender", "Digit Tender"], ["claim", "Digit Client Claim"]] as const) {
    const p = projectOf(get(dt, d[f])); if (p) return p;
  }
  return "";
};
const live = (d: Doc | undefined) => !!d && num(d.docstatus) !== 2;

/** The work each P-key currently holds back (or, for an illustrative P9, would use the assumption). */
export function policyWork(key: string, on = today()): PolicyWork[] {
  const ps = new Set(constructionProjects().map((p) => p.name));
  const inScope = (d: Doc) => ps.has(projectOf(d));
  switch (key) {
    case "P1": return list("Digit Final Account", (d) => live(d) && d["workflow_state"] === "Agreed" && inScope(d)).map((d) => ({ doctype: "Digit Final Account", name: d.name, project: projectOf(d), what: "Approve final account" }));
    case "P2": return list("Digit Retention Release Request", (d) => live(d) && d["workflow_state"] === "Pending Approval" && inScope(d)).map((d) => ({ doctype: "Digit Retention Release Request", name: d.name, project: projectOf(d), what: "Approve retention release" }));
    case "P3": return list("Digit Subcontractor Bill", (b) => live(b) && !!b["purchase_invoice"] && inScope(b)).flatMap((b) => {
      const pi = list("Purchase Invoice", (x) => x.name === b["purchase_invoice"])[0];
      return pi && num(pi.docstatus) === 1 && num(pi["outstanding_amount"]) > 0 ? [{ doctype: "Purchase Invoice", name: pi.name, project: projectOf(b), what: "Pay subcontractor" }] : [];
    });
    case "P4": return list("Digit Closeout Assessment", (a) => live(a) && inScope(a)).flatMap((a) => rows(a, "rows").filter((r) => r["status"] === "Not Applicable" && !r["na_approved_by"])
      .map((r, i) => ({ doctype: "Digit Closeout Assessment", name: a.name, project: projectOf(a), what: "Approve Not Applicable item", table: "rows", row: num(r["idx"]) || i + 1 })));
    case "P5": return matchingRows().filter((m) => m.status.includes("variance") && ps.has(m.project)).map((m) => ({ doctype: "Purchase Order", name: m.po, project: m.project, what: "Accept matching variance", detail: m.status, item: String(m.item ?? "") }));
    case "P6": return list("Digit Estimate Version", (v) => live(v) && v["workflow_state"] === "Submitted" && (inScope(v) || !v["project"])).filter((v) => rows(v, "lines")
      .flatMap((l) => (l["assembly"] ? rows(get("Digit Assembly", l["assembly"]), "components") : [])).some((c) => { const r = get("Digit Construction Rate", c["rate"]); return !!r && validityState(r["valid_until"], on) === "expired"; }))
      .map((v) => ({ doctype: "Digit Estimate Version", name: v.name, project: projectOf(v), what: "Approve estimate with expired rates" }));
    case "P7": return list("Digit Site Expense", (x) => live(x) && x["workflow_state"] === "Approved" && inScope(x) && !live(x["journal_entry"] ? get("Journal Entry", x["journal_entry"]) : undefined))
      .map((x) => ({ doctype: "Digit Site Expense", name: x.name, project: projectOf(x), what: "Post site expense journal" }));
    case "P8": return list("Digit Subcontractor Profile", (p) => live(p) && p["workflow_state"] === "Under Review").map((p) => ({ doctype: "Digit Subcontractor Profile", name: p.name, project: "", what: "Approve subcontractor profile" }));
    // same condition as services.createSalesInvoice: submitted certificate without a live linked Sales Invoice
    case "P9": return list("Digit Client Certificate", (c) => num(c.docstatus) === 1 && inScope(c) && !live(c["sales_invoice"] ? get("Sales Invoice", c["sales_invoice"]) : undefined))
      .map((c) => ({ doctype: "Digit Client Certificate", name: c.name, project: projectOf(c), what: "Create sales invoice" }));
    default: return [];
  }
}

/** Every P-key with its status and the work it holds back now (empty when the policy is defined). */
export function policyQueues(on = today()): PolicyQueue[] {
  return ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"].map((key) => {
    const p = policy(key);
    const mode = !policyDefined(key) ? "BLOCKED" as const : /ILLUSTRATIVE/i.test(String(p?.["authority"] ?? "")) ? "ILLUSTRATIVE" as const : "CLEAR" as const;
    return { key, status: String(p?.["status"] ?? "Undefined"), mode, items: mode === "CLEAR" ? [] : policyWork(key, on) };
  });
}
