/**
 * DIGIT Pro owner-policy defaults (owner decision 2026-11-11: "7 policy ids — implement the safest default: block,
 * require approval"). Each rule refuses the submit (docstatus 0 → 1) through a shared adapter doc hook while DIGIT Pro
 * is enabled, and names the one role that may still submit. Limits that need owner values (discount %, tolerance,
 * category lists) default to zero / none, so nothing passes that the owner has not allowed.
 *
 *  SL8 / SEL-008  any discounted selling line (discount_percentage, rate under price_list_rate, header discount) → Sales Manager.
 *                 Line margin is shown to Sales Managers only.
 *  PU8 / PUR-009  three-way match with zero tolerance: paying a Purchase Invoice whose order-linked lines are billed
 *                 beyond the received quantity or above the order rate → Accounts Manager. A held invoice (native
 *                 on_hold / release_date) cannot be paid by anyone until released, as ERPNext get_held_invoices.
 *  PU15           no department category policy exists, so a Purchase Material Request without a project line → Purchase
 *                 Manager (project requests follow the project's own approval in the construction app).
 *  S5             approval path: the configured Workflow when one is active, otherwise these gates + the roles that hold
 *                 submit permission — the same rules the submit applies.
 *  SEL-013        marketplace connectors are not part of this release: orders enter only as native Sales Orders.
 */
import { adapter, registerDocHook, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { ADMIN, currentUser, userRoles } from "@/lib/session";
import { activeWorkflow, currentState, transitionsFor } from "@/lib/workflow";
import { isHeld } from "@/lib/heldInvoices";
import { isEnabled } from "../runtime";

export type Bi = readonly [string, string];
const n = (v: unknown) => Number(v) || 0;
const rows = (d: Doc | undefined, f: string) => ((d?.[f] as Doc[] | undefined) ?? []);
const s = (v: unknown) => String(v ?? "");
const has = (user: string, role: string) => user === ADMIN || userRoles(user).includes(role);

export const SELLING_POLICY_DOCS = ["Quotation", "Sales Order", "Sales Invoice"] as const;
export const POLICY_ROLES = { discount: "Sales Manager", payment: "Accounts Manager", purchase: "Purchase Manager" } as const;

// ---------- SL8 / SEL-008 discount approval + role-scoped margin ----------
export interface DiscountLine { idx: number; item: string; rate: number; priceListRate: number; discountPct: number }
/** Lines sold below their price list rate (or with a line discount), plus a header discount flag. */
export function discountLines(d: Doc): { lines: DiscountLine[]; header: boolean } {
  const lines: DiscountLine[] = [];
  rows(d, "items").forEach((r, i) => {
    const rate = n(r["rate"]), pl = n(r["price_list_rate"]), pct = n(r["discount_percentage"]);
    const below = pl > 0 && rate < pl - 0.005;
    if (pct > 0 || n(r["discount_amount"]) > 0 || below) lines.push({ idx: n(r["idx"]) || i + 1, item: s(r["item_code"]), rate, priceListRate: pl, discountPct: pct || (below && pl ? Math.round(((pl - rate) / pl) * 10000) / 100 : 0) });
  });
  return { lines, header: n(d["additional_discount_percentage"]) > 0 || n(d["discount_amount"]) > 0 };
}
export const needsDiscountApproval = (dt: string, d: Doc) => (SELLING_POLICY_DOCS as readonly string[]).includes(dt) && (() => { const x = discountLines(d); return x.lines.length > 0 || x.header; })();

export interface MarginLine { idx: number; item: string; rate: number; cost: number | null; marginPct: number | null }
/** Line margin over the warehouse valuation rate (Bin, else Item valuation_rate); null cost = no valuation recorded. */
export function lineMargins(d: Doc): MarginLine[] {
  const bins = adapter.list("Bin");
  return rows(d, "items").map((r, i) => {
    const item = s(r["item_code"]), wh = s(r["warehouse"]);
    const b = bins.find((x) => x["item_code"] === item && (!wh || x["warehouse"] === wh) && n(x["valuation_rate"]) > 0);
    const v = n(b?.["valuation_rate"]) || n(adapter.get("Item", item)?.["valuation_rate"]);
    const rate = n(r["rate"]); const cost = v > 0 ? v : null;
    return { idx: n(r["idx"]) || i + 1, item, rate, cost, marginPct: cost !== null && rate > 0 ? Math.round(((rate - cost) / rate) * 1000) / 10 : null };
  });
}
export const canSeeMargin = (user = currentUser()) => has(user, POLICY_ROLES.discount);

// ---------- PU8 / PUR-009 three-way match (zero tolerance) + held invoices ----------
export interface MatchIssue { invoice: string; idx: number; item: string; kind: "over_received" | "above_order_rate"; billedQty: number; receivedQty: number; rate: number; orderRate: number }
/** Order-linked lines of a Purchase Invoice that bill (with the earlier bills of the line) more than was received, or above the order rate. */
export function threeWayIssues(pi: Doc | undefined): MatchIssue[] {
  if (!pi) return [];
  const out: MatchIssue[] = [];
  const prs = adapter.list("Purchase Receipt").filter((p) => n(p.docstatus) === 1);
  // bills of the same order line booked before this one (posting date, then name): the bill that passes the received
  // quantity is the out-of-match one, earlier bills within the receipt stay payable
  const key = (p: Doc) => `${s(p["posting_date"])}\u0000${p.name}`;
  const pis = adapter.list("Purchase Invoice").filter((p) => n(p.docstatus) === 1 && p.name !== pi.name && key(p) < key(pi));
  rows(pi, "items").forEach((r, i) => {
    const po = s(r["purchase_order"]), pod = s(r["po_detail"]); if (!po || !pod) return;
    const poRow = rows(adapter.get("Purchase Order", po), "items").find((x) => x.name === pod);
    const received = prs.flatMap((p) => rows(p, "items")).filter((x) => x["purchase_order_item"] === pod).reduce((a, x) => a + n(x["stock_qty"] || x["qty"]), 0);
    const billedOther = pis.flatMap((p) => rows(p, "items")).filter((x) => x["po_detail"] === pod).reduce((a, x) => a + n(x["stock_qty"] || x["qty"]), 0);
    const billed = billedOther + n(r["stock_qty"] || r["qty"]);
    const base = { invoice: pi.name, idx: n(r["idx"]) || i + 1, item: s(r["item_code"]), billedQty: billed, receivedQty: received, rate: n(r["rate"]), orderRate: n(poRow?.["rate"]) };
    if (billed > received + 1e-9) out.push({ ...base, kind: "over_received" });
    else if (poRow && n(r["rate"]) > n(poRow["rate"]) + 0.005) out.push({ ...base, kind: "above_order_rate" });
  });
  return out;
}
const paidInvoices = (pe: Doc) => s(pe["payment_type"]) === "Pay" && s(pe["party_type"]) === "Supplier"
  ? rows(pe, "references").filter((r) => r["reference_doctype"] === "Purchase Invoice" && n(r["allocated_amount"]) > 0).map((r) => adapter.get("Purchase Invoice", s(r["reference_name"]))).filter((x): x is Doc => !!x)
  : [];
export const heldReferences = (pe: Doc) => paidInvoices(pe).filter((pi) => isHeld(pi, s(pe["posting_date"]).slice(0, 10) || undefined)).map((pi) => pi.name);
export const unmatchedReferences = (pe: Doc) => paidInvoices(pe).filter((pi) => threeWayIssues(pi).length > 0).map((pi) => pi.name);

// ---------- PU15 purchase requests without a category policy ----------
export const needsPurchaseApproval = (dt: string, d: Doc) => dt === "Material Request" && s(d["material_request_type"] || "Purchase") === "Purchase" && !rows(d, "items").some((r) => !!r["project"]);

// ---------- one rule set: gates for a document ----------
export interface Gate { id: "discount" | "held" | "match" | "purchase"; role: string | null; label: Bi; reason: Bi }
export { MSG } from "./policyAr";
import { MSG } from "./policyAr";
export function gatesFor(dt: string, d: Doc): Gate[] {
  const g: Gate[] = [];
  if (needsDiscountApproval(dt, d)) g.push({ id: "discount", role: POLICY_ROLES.discount, label: ["Discount approval", "موافقة الخصم"], reason: ["Discounted lines need a Sales Manager.", "البنود المخصومة تحتاج مدير المبيعات."] });
  if (dt === "Payment Entry") {
    if (heldReferences(d).length) g.push({ id: "held", role: null, label: ["Invoice on hold", "فاتورة معلّقة"], reason: ["A referenced purchase invoice is on hold; release it first.", "إحدى فواتير الشراء المرجعية معلّقة؛ أفرج عنها أولًا."] });
    if (unmatchedReferences(d).length) g.push({ id: "match", role: POLICY_ROLES.payment, label: ["Three-way match", "المطابقة الثلاثية"], reason: ["A referenced bill does not match its order and receipt; an Accounts Manager must pay it.", "فاتورة مرجعية لا تطابق أمرها واستلامها؛ يدفعها مدير الحسابات."] });
  }
  if (needsPurchaseApproval(dt, d)) g.push({ id: "purchase", role: POLICY_ROLES.purchase, label: ["Purchase approval", "موافقة الشراء"], reason: ["No category policy is set; a Purchase Manager submits.", "لا توجد سياسة فئات؛ يعتمد مدير المشتريات."] });
  return g;
}
/** Messages of the gates `user` cannot pass (empty = the submit may go ahead). */
export function policyErrors(dt: string, d: Doc, user = currentUser()): string[] {
  return gatesFor(dt, d).filter((g) => g.role === null || !has(user, g.role)).map((g) => MSG[g.id]);
}

// ---------- S5 approval path ----------
export interface PathStep { label: Bi; roles: string[]; you: boolean; reason?: Bi | undefined; state?: string | undefined }
export interface ApprovalPath { source: "workflow" | "default"; steps: PathStep[] }
/** Roles holding submit permission on the DocType (permlevel 0), from its source permissions. */
export function submitRoles(dt: string): string[] {
  const perms = (cachedMeta(dt)?.permissions ?? []) as { role?: string; submit?: number; permlevel?: number }[];
  return [...new Set(perms.filter((p) => n(p.submit) === 1 && !n(p.permlevel) && p.role).map((p) => p.role!))];
}
export function approvalPath(dt: string, d: Doc, user = currentUser()): ApprovalPath {
  const w = activeWorkflow(dt);
  if (w) {
    const st = currentState(w, d); const mine = new Set(transitionsFor(w, d, user).map((t) => t.action));
    return { source: "workflow", steps: w.transitions.filter((t) => t.state === st).map((t) => ({ label: [t.action, t.action] as Bi, roles: t.allowed ? [t.allowed] : [], you: mine.has(t.action), state: `${t.state} → ${t.next_state}` })) };
  }
  const steps: PathStep[] = gatesFor(dt, d).map((g) => ({ label: g.label, roles: g.role ? [g.role] : [], you: g.role !== null && has(user, g.role), reason: g.reason }));
  const sr = submitRoles(dt);
  steps.push({ label: ["Submit", "اعتماد"], roles: sr, you: user === ADMIN || sr.some((r) => userRoles(user).includes(r)) });
  return { source: "default", steps };
}

// ---------- SEL-013 ----------
/** No marketplace / channel connector ships in this release; channel orders are entered as native Sales Orders. */
export const MARKETPLACE_CONNECTORS: readonly string[] = [];

// ---------- submit hook (active only while DIGIT Pro is enabled) ----------
const POLICY_DOCTYPES = [...SELLING_POLICY_DOCS, "Payment Entry", "Material Request"];
let registered = false;
export function registerPolicyHooks(): void {
  if (registered) return; registered = true;
  for (const dt of POLICY_DOCTYPES) registerDocHook(dt, (doc, before) => {
    if (!isEnabled("digit_pro") || doc["__synthetic"] || !before || n(before.docstatus) !== 0 || n(doc.docstatus) !== 1) return { doc };
    const e = policyErrors(dt, doc);
    return e.length ? { doc, errors: e } : { doc };
  });
}
registerPolicyHooks();

// ---------- E4 / PUR-017 approval inbox ----------
/** Submittable documents the Pro approval inbox covers (selling, buying, payment and journal documents). */
export const INBOX_DOCTYPES = ["Quotation", "Sales Order", "Sales Invoice", "Material Request", "Purchase Order", "Purchase Invoice", "Payment Entry", "Journal Entry"] as const;
export interface InboxItem { doctype: string; name: string; company: string; party: string; amount: number; currency: string; owner: string; modified: string; kind: "workflow" | "policy"; actions: string[]; reason: Bi; state?: string | undefined }
const partyOfDoc = (d: Doc) => s(d["customer_name"] || d["customer"] || d["party_name"] || d["supplier_name"] || d["supplier"] || d["party"] || d["title"]);
const amountOf = (d: Doc) => n(d["grand_total"] || d["paid_amount"] || d["total_debit"] || d["total"]);
/**
 * Documents waiting for `user`: workflow documents with a transition the user may take, and drafts held by a policy
 * gate whose approver role the user holds (and the owner does not). Read and submit permission are checked by the
 * caller-supplied `allowed` (session.ts hasPerm), so a role never sees an item it cannot open or act on.
 */
export function approvalInbox(user: string, company: string, allowed: (dt: string, ptype: "read" | "submit", d: Doc) => boolean): InboxItem[] {
  const out: InboxItem[] = [];
  for (const dt of INBOX_DOCTYPES) {
    const w = activeWorkflow(dt);
    for (const d of adapter.list(dt)) {
      if (company && s(d["company"]) !== company) continue;
      const ds = n(d.docstatus); if (ds === 2) continue;
      const base = { doctype: dt, name: d.name, company: s(d["company"]), party: partyOfDoc(d), amount: amountOf(d), currency: s(d["currency"] || d["paid_from_account_currency"] || d["paid_to_account_currency"]), owner: s(d["owner"]), modified: s(d["modified"]) };
      if (w) {
        const ts = transitionsFor(w, d, user); if (!ts.length || !allowed(dt, "read", d)) continue;
        out.push({ ...base, kind: "workflow", actions: ts.map((t) => t.action), reason: ["Workflow step", "خطوة سير العمل"], state: currentState(w, d) });
        continue;
      }
      if (ds !== 0) continue;
      const gates = gatesFor(dt, d); if (!gates.length || gates.some((g) => g.role === null)) continue;
      if (!gates.every((g) => g.role && has(user, g.role))) continue;
      // the owner could not pass the gate themselves (an owner holding the role just submits)
      if (base.owner && base.owner !== user && gates.every((g) => g.role && has(base.owner, g.role))) continue;
      if (!allowed(dt, "read", d) || !allowed(dt, "submit", d)) continue;
      out.push({ ...base, kind: "policy", actions: ["Approve & submit"], reason: gates[0]!.label });
    }
  }
  return out.sort((a, b) => b.modified.localeCompare(a.modified) || a.name.localeCompare(b.name));
}
