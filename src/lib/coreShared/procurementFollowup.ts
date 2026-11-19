/**
 * DIGIT shared Core procurement follow-up (Part B: PU2-b / PUR-002-b, PU4-b).
 *  - RFQ reminders: suppliers on a submitted Request for Quotation who have not quoted (no Supplier Quotation against it,
 *    quote status not Received) are reminded by e-mail from the Control Policy's "days before due" until the request's
 *    required date. The daily run is idempotent: one reminder per supplier per request per day, logged as a Core
 *    "Digit RFQ Reminder" row next to the native Communication the e-mail hand-over writes.
 *  - Contract price: a Purchase Order / Purchase Invoice line priced above its purchasing Blanket Order (the line's own
 *    blanket order, else the supplier's active submitted contract for the item) plus the policy tolerance is refused on
 *    submit; the contract rate is filled into blanket_order_rate while drafting (ERPNext fetches it, never enforces it).
 */
import { adapter, registerDocHook, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { currentUser, hasPerm } from "@/lib/session";
import { CORE_DT } from "./doctypes";
import { controlPolicy } from "./controls";
import { queueEmail } from "./providers";

export type Bi = [string, string];
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc | undefined, f = "items") => (Array.isArray(d?.[f]) ? (d![f] as Doc[]) : []);
const today = () => new Date().toISOString().slice(0, 10);
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const can = (dt: string, p: "read" | "write" | "email", user = currentUser(), d?: Doc) => { const m = cachedMeta(dt); return m ? hasPerm(m, p, d, user) : user === "Administrator"; };

/* ------------------------------------------------------------------ RFQ reminders ------------------------------------------------------------------ */
export type ReminderState = "due" | "later" | "overdue" | "sent" | "no-email" | "quoted";
export interface RfqReminderRow { rfq: string; company: string; supplier: string; supplierName: string; email: string; due: string; daysLeft: number; lastSent: string; sentCount: number; state: ReminderState }

function quoted(rfq: string, supplier: string, row: Doc): boolean {
  if (s(row["quote_status"]) === "Received") return true;
  return adapter.list("Supplier Quotation").some((q) => n(q.docstatus) !== 2 && q["supplier"] === supplier && rows(q).some((r) => r["request_for_quotation"] === rfq));
}
const supplierEmail = (row: Doc) => s(row["email_id"]) || s(adapter.get("Supplier", s(row["supplier"]))?.["email_id"]);
const remindersOf = (rfq: string, supplier: string) => adapter.list(CORE_DT.rfqReminder).filter((x) => x["rfq"] === rfq && x["supplier"] === supplier).sort((a, b) => s(b["sent_on"]).localeCompare(s(a["sent_on"])));

/** One row per supplier of every open, submitted request of the company, with its reminder state on `asOf`. */
export function rfqFollowUp(company: string, asOf = today(), user = currentUser()): RfqReminderRow[] {
  if (!can("Request for Quotation", "read", user)) return [];
  const lead = Math.max(0, controlPolicy(company).rfq_reminder_days);
  const out: RfqReminderRow[] = [];
  for (const d of adapter.list("Request for Quotation").filter((x) => x["company"] === company && n(x.docstatus) === 1).sort((a, b) => a.name.localeCompare(b.name))) {
    const due = s(d["schedule_date"]) || rows(d).map((r) => s(r["schedule_date"])).filter(Boolean).sort()[0] || "";
    for (const sp of rows(d, "suppliers")) {
      const supplier = s(sp["supplier"]); if (!supplier) continue;
      const email = supplierEmail(sp); const sent = remindersOf(d.name, supplier); const left = due ? days(asOf, due) : 0;
      const state: ReminderState = quoted(d.name, supplier, sp) ? "quoted" : sent.some((x) => x["sent_on"] === asOf) ? "sent" : !email ? "no-email"
        : !due ? "due" : left < 0 ? "overdue" : left <= lead ? "due" : "later";
      out.push({ rfq: d.name, company, supplier, supplierName: s(sp["supplier_name"]) || s(adapter.get("Supplier", supplier)?.["supplier_name"]) || supplier, email, due, daysLeft: left, lastSent: s(sent[0]?.["sent_on"]), sentCount: sent.length, state });
    }
  }
  return out;
}

/** Sends the reminders that are due (or the listed ones, which may also be overdue). Never twice on one day. */
export function sendRfqReminders(company: string, asOf = today(), user = currentUser(), only?: { rfq: string; supplier: string }[]): { sent: number; skipped: Bi[] } {
  if (!can("Request for Quotation", "write", user)) return { sent: 0, skipped: [["You may not follow up quotation requests.", "لا يحق لك متابعة طلبات عروض الأسعار."]] };
  const pick = only ? new Set(only.map((o) => `${o.rfq}\u0000${o.supplier}`)) : null;
  let sent = 0; const skipped: Bi[] = [];
  for (const r of rfqFollowUp(company, asOf, user)) {
    const key = `${r.rfq}\u0000${r.supplier}`;
    if (pick ? !pick.has(key) : r.state !== "due") continue;
    if (r.state === "quoted" || r.state === "sent") continue;
    if (!r.email) { skipped.push([`${r.supplierName} has no e-mail address.`, `لا يوجد بريد للمورد ${r.supplierName}.`]); continue; }
    const when = r.due ? (r.daysLeft < 0 ? [`was due on ${r.due}`, `كان مستحقًا في ${r.due}`] : [`is due on ${r.due}`, `مستحق في ${r.due}`]) : ["is still open", "ما زال مفتوحًا"];
    const q = queueEmail({ to: r.email, subject: `Reminder: Request for Quotation ${r.rfq}`, doctype: "Request for Quotation", name: r.rfq, company,
      body: `Dear ${r.supplierName},\n\nOur request for quotation ${r.rfq} ${when[0]}. Please send your quotation.\n\nعزيزي ${r.supplierName}، طلب عرض السعر ${r.rfq} ${when[1]}. نرجو إرسال عرضكم.` });
    if (!q.ok) { skipped.push(q.reason); continue; }
    adapter.insertDoc(CORE_DT.rfqReminder, { rfq: r.rfq, supplier: r.supplier, company, email_id: r.email, sent_on: asOf, sent_by: user });
    sent++;
  }
  return { sent, skipped };
}

/** The daily scheduler entry (idempotent): sends every due reminder of every company the user may follow up. */
export function runRfqReminderJob(asOf = today(), user = currentUser()): number {
  if (!can("Request for Quotation", "write", user)) return 0;
  const cos = [...new Set(adapter.list("Request for Quotation").filter((d) => n(d.docstatus) === 1).map((d) => s(d["company"])))];
  return cos.reduce((t, c) => t + sendRfqReminders(c, asOf, user).sent, 0);
}

/* ------------------------------------------------------------------ contract price ------------------------------------------------------------------ */
export interface ContractPrice { blanketOrder: string; rate: number; implied: boolean }
const PRICE_DOCS = ["Purchase Order", "Purchase Invoice"] as const;

function activeContracts(supplier: string, item: string, date: string): { bo: Doc; rate: number }[] {
  return adapter.list("Blanket Order").filter((b) => n(b.docstatus) === 1 && b["blanket_order_type"] === "Purchasing" && b["supplier"] === supplier && s(b["status"]) !== "Closed"
    && (!s(b["from_date"]) || s(b["from_date"]) <= date) && (!s(b["to_date"]) || s(b["to_date"]) >= date))
    .flatMap((b) => rows(b).filter((r) => r["item_code"] === item && !n(r["digit_row_closed"])).map((r) => ({ bo: b, rate: n(r["rate"]) })))
    .sort((a, b) => a.rate - b.rate || a.bo.name.localeCompare(b.bo.name));
}

/** The contract that prices one line: its own blanket order (or its order line's), else the supplier's lowest active contract. */
export function contractPriceFor(dt: string, d: Doc, r: Doc): ContractPrice | null {
  const date = s(d["transaction_date"]) || s(d["posting_date"]) || today();
  let bo = s(r["blanket_order"]);
  if (!bo && dt === "Purchase Invoice" && s(r["po_detail"])) bo = s(rows(adapter.get("Purchase Order", s(r["purchase_order"]))).find((x) => x["name"] === r["po_detail"])?.["blanket_order"]);
  if (bo) { const b = adapter.get("Blanket Order", bo); const line = rows(b).find((x) => x["item_code"] === r["item_code"]); return b && line && b["blanket_order_type"] !== "Selling" ? { blanketOrder: bo, rate: n(line["rate"]), implied: false } : null; }
  const c = activeContracts(s(d["supplier"]), s(r["item_code"]), date)[0];
  return c ? { blanketOrder: c.bo.name, rate: c.rate, implied: true } : null;
}

/** Lines priced above the contract (company tolerance applied, rates in the document currency converted to company currency). */
export function contractPriceErrors(dt: string, d: Doc): string[] {
  const pol = controlPolicy(s(d["company"]));
  if (!pol.enforce_contract_price) return [];
  const conv = n(d["conversion_rate"]) || 1; const tol = Math.max(0, pol.contract_price_tolerance);
  const errs: string[] = [];
  for (const r of rows(d)) {
    if (!s(r["item_code"]) || n(r["is_free_item"])) continue;
    const c = contractPriceFor(dt, d, r); if (!c || c.rate <= 0) continue;
    const rate = r2(n(r["rate"]) * conv) || r2(n(r["base_rate"])); const cap = r2(c.rate * (1 + tol / 100));
    if (rate > cap + 0.005) errs.push(`Row #${n(r["idx"]) || 1}: Rate ${rate} for Item ${s(r["item_code"])} is above the contract price ${c.rate}${tol ? ` (+${tol}% tolerance)` : ""} of Blanket Order ${c.blanketOrder}.`);
  }
  return errs;
}

function fillContractRate(dt: string, d: Doc): Doc[] | null {
  let changed = false;
  const out = rows(d).map((r) => {
    if (dt !== "Purchase Order" || !s(r["blanket_order"])) return r;
    const c = contractPriceFor(dt, d, r); if (!c || n(r["blanket_order_rate"]) === c.rate) return r;
    changed = true; return { ...r, blanket_order_rate: c.rate };
  });
  return changed ? out : null;
}

let hooked = false;
export function registerContractPriceHooks() {
  if (hooked) return; hooked = true;
  for (const dt of PRICE_DOCS) registerDocHook(dt, (doc: Doc, before?: Doc) => {
    const was = n(before?.["docstatus"]), now = n(doc["docstatus"]);
    if (now === 0) { const items = fillContractRate(dt, doc); return { doc: items ? { ...doc, items } : doc }; }
    if (now === 1 && was !== 1 && !n(doc["is_return"])) { const errors = contractPriceErrors(dt, doc); return errors.length ? { doc, errors } : { doc }; }
    return { doc };
  });
}
