/**
 * ERPNext CRM → Selling hand-off (virtual port of quotation.py update_opportunity/update_lead,
 * opportunity.py set_status/has_ordered_quotation and lead.py set_status). Called only from posting.ts
 * after submit/cancel. Standalone Frappe CRM (CRM Lead / CRM Deal) is a separate app and is not touched here.
 */
import { adapter, type Doc } from "./adapter";

const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => String(v ?? "");
const live = (dt: string) => adapter.list(dt).filter((x) => n(x.docstatus) === 1);

/** Quotations submitted against an Opportunity (row prevdoc_docname or header opportunity). */
const quotationsOf = (opp: string) => live("Quotation").filter((q) => q["opportunity"] === opp);
const ordered = (q: string) => live("Sales Order").some((so) => ((so["items"] as Doc[] | undefined) ?? []).some((r) => r["prevdoc_docname"] === q));

/** opportunity.py set_status: Converted when a quotation is ordered, Quotation when one is open, Lost kept, else Open. */
export function refreshOpportunity(opp: string) {
  const o = adapter.get("Opportunity", opp); if (!o || s(o["status"]) === "Lost" || s(o["status"]) === "Closed") return;
  const qs = quotationsOf(opp);
  const status = qs.some((q) => ordered(q.name)) ? "Converted" : qs.length ? "Quotation" : "Open";
  if (o["status"] !== status) adapter.update("Opportunity", opp, { status });
}
/** lead.py set_status: Converted when a Customer carries lead_name, Opportunity/Quotation by linked open docs, else Lead. */
export function refreshLead(lead: string) {
  const l = adapter.get("Lead", lead); if (!l || ["Do Not Contact", "Lost Quotation"].includes(s(l["status"]))) return;
  const status = adapter.list("Customer").some((c) => c["lead_name"] === lead) ? "Converted"
    : live("Quotation").some((q) => q["quotation_to"] === "Lead" && q["party_name"] === lead) ? "Quotation"
    : adapter.list("Opportunity").some((o) => o["opportunity_from"] === "Lead" && o["party_name"] === lead && o["status"] !== "Lost") ? "Opportunity" : "Lead";
  if (l["status"] !== status) adapter.update("Lead", lead, { status });
}
/** posting.ts hook (submit/cancel of Quotation and Sales Order). */
export function crmAfter(dt: string, d: Doc) {
  if (dt === "Quotation") {
    if (d["opportunity"]) refreshOpportunity(s(d["opportunity"]));
    if (d["quotation_to"] === "Lead") refreshLead(s(d["party_name"]));
    const opp = d["opportunity"] ? adapter.get("Opportunity", s(d["opportunity"])) : undefined;
    if (opp?.["opportunity_from"] === "Lead") refreshLead(s(opp["party_name"]));
  }
  if (dt === "Sales Order") {
    const qs = new Set(((d["items"] as Doc[] | undefined) ?? []).map((r) => s(r["prevdoc_docname"])).filter(Boolean));
    for (const q of qs) { const o = s(adapter.get("Quotation", q)?.["opportunity"]); if (o) refreshOpportunity(o); }
  }
}
/** lead.py make_customer: Customer mapped from Lead (lead_name kept so the lead reads Converted). */
export function makeCustomerFromLead(lead: string): string {
  const l = adapter.get("Lead", lead); if (!l) throw new Error(`Lead ${lead} not found`);
  const name = s(l["company_name"]) || s(l["lead_name"]) || lead;
  if (!adapter.get("Customer", name)) adapter.insertDoc("Customer", { name, customer_name: name, customer_type: l["company_name"] ? "Company" : "Individual", lead_name: lead, territory: l["territory"], customer_group: l["customer_group"] ?? "" });
  refreshLead(lead);
  return name;
}
