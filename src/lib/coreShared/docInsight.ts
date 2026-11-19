/**
 * Shared document insight (Run11.1 B6 D1/D2/D5/D6/F3/F6/SL7), read over the same records every screen uses:
 *  - stageStrip: where a transaction stands in its source status cycle (Odoo-style stage strip).
 *  - orderAxes: the five order axes of a Sales / Purchase Order — approval, delivery or receipt, billing, payment, closure.
 *  - postReadiness: "why can't this post?" — the submit checks posting.ts would run (permission, mandatory fields,
 *    submitErrors, posting locks), each with the fix in Arabic and English.
 *  - auditTrail: who created, submitted, cancelled, cleared and matched a document, from Version history.
 *  - explainPrice: "why this price" — every Pricing Rule evaluated against one line, applied or rejected with the reason.
 *  - reclassifyPreview / reclassify: move one posted journal line to another account as a linked, previewed entry.
 * Nothing here stores totals; only reclassify writes, and it goes through documentApi (permission + posting checks).
 */
import { customerHold, type CustomerHold } from "./customerHold";
import { adapter, type Doc } from "../adapter";
import { cachedMeta, type DocTypeMeta } from "../catalog";
import { lockErrors, submitErrors } from "../posting";
import { postingPreview } from "../postingPreview";
import { currentUser, hasPerm } from "../session";
import { submitDocument } from "../documentApi";

export type Bi = [string, string];
type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0) || 0;
const s = (v: unknown) => (v == null ? "" : String(v));
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc | Row | undefined, f: string) => ((d?.[f] as Row[] | undefined) ?? []);
const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ D1 stage strip ------------------------------------------------------------------ */
export const STATUS_AR: Record<string, string> = {
  Draft: "مسودة", Open: "مفتوح", Replied: "تم الرد", "Partially Ordered": "مطلوب جزئياً", Ordered: "تم الطلب", "To Deliver and Bill": "للتسليم والفوترة",
  "To Bill": "للفوترة", "To Deliver": "للتسليم", Completed: "مكتمل", Unpaid: "غير مدفوع", Overdue: "متأخر السداد", "Partly Paid": "مدفوع جزئياً", Paid: "مدفوع",
  "To Receive and Bill": "للاستلام والفوترة", "To Receive": "للاستلام", Pending: "قيد الانتظار", "Partially Received": "مستلم جزئياً", Received: "مستلم",
  Transferred: "محوّل", Issued: "مصروف", Submitted: "معتمد", Cancelled: "ملغى", Lost: "خاسر", Expired: "منتهي الصلاحية", Closed: "مغلق", "On Hold": "موقوف مؤقتاً",
  Stopped: "متوقف", Return: "مرتجع", "Credit Note Issued": "صدر إشعار دائن", "Debit Note Issued": "صدر إشعار مدين", "Return Issued": "صدر مرتجع", Delivered: "مُسلّم",
};
type Step = { label: Bi; when: string[] };
const st = (en: string, ...when: string[]): Step => ({ label: [en, STATUS_AR[en] ?? en], when: when.length ? when : [en] });
const DRAFT = st("Draft");
const PART: (en: string, ar: string, ...w: string[]) => Step = (en, ar, ...w) => ({ label: [en, ar], when: w });
const INVOICE = { steps: [DRAFT, PART("Unpaid", "غير مدفوع", "Unpaid", "Overdue", "Submitted", "Unpaid and Discounted", "Overdue and Discounted"), st("Partly Paid", "Partly Paid", "Partly Paid and Discounted"), st("Paid")], off: ["Cancelled", "Return", "Credit Note Issued", "Debit Note Issued"] };
export const STRIPS: Record<string, { steps: Step[]; off: string[] }> = {
  Quotation: { steps: [DRAFT, st("Open"), st("Replied"), st("Partially Ordered"), st("Ordered")], off: ["Lost", "Expired", "Cancelled"] },
  "Sales Order": { steps: [DRAFT, st("To Deliver and Bill"), PART("Delivered or billed in part", "مُسلّم أو مفوتر جزئياً", "To Bill", "To Deliver"), st("Completed")], off: ["On Hold", "Closed", "Cancelled"] },
  "Delivery Note": { steps: [DRAFT, st("To Bill"), st("Completed")], off: ["Return Issued", "Return", "Closed", "Cancelled"] },
  "Sales Invoice": INVOICE, "Purchase Invoice": INVOICE,
  "Purchase Order": { steps: [DRAFT, st("To Receive and Bill"), PART("Received or billed in part", "مستلم أو مفوتر جزئياً", "To Bill", "To Receive"), st("Completed", "Completed", "Delivered")], off: ["On Hold", "Closed", "Cancelled"] },
  "Purchase Receipt": { steps: [DRAFT, st("To Bill"), st("Completed")], off: ["Return Issued", "Return", "Closed", "Cancelled"] },
  "Material Request": { steps: [DRAFT, st("Pending"), PART("In progress", "قيد التنفيذ", "Partially Ordered", "Partially Received"), PART("Fulfilled", "مُنجز", "Ordered", "Received", "Transferred", "Issued", "Manufactured")], off: ["Stopped", "Cancelled"] },
};
export type StageState = "done" | "current" | "todo";
export function stageStrip(dt: string, doc: Doc): { steps: { label: Bi; state: StageState }[]; status: string; off?: Bi } {
  const def = STRIPS[dt] ?? { steps: [DRAFT, st("Submitted")], off: ["Cancelled"] };
  const ds = n(doc["docstatus"]);
  const status = ds === 2 ? "Cancelled" : s(doc["status"]) || (ds === 1 ? "Submitted" : "Draft");
  if (def.off.includes(status)) {
    const reached = ds >= 1 ? 1 : 0;
    return { status, off: [status, STATUS_AR[status] ?? status], steps: def.steps.map((x, i) => ({ label: x.label, state: i <= reached ? "done" : "todo" })) };
  }
  let at = def.steps.findIndex((x) => x.when.includes(status));
  if (at < 0) at = ds >= 1 ? 1 : 0;
  const last = at === def.steps.length - 1;
  return { status, steps: def.steps.map((x, i) => ({ label: x.label, state: i < at || (last && i === at) ? "done" : i === at ? "current" : "todo" })) };
}

/* ------------------------------------------------------------------ D2 five order axes ------------------------------------------------------------------ */
export type Axis = { key: "approval" | "fulfilment" | "billing" | "payment" | "closure"; label: Bi; pct: number; state: Bi };
const part = (pct: number): Bi => (pct >= 100 ? ["Done", "مكتمل"] : pct > 0 ? [`${r2(pct)}% done`, `مكتمل ${r2(pct)}%`] : ["Not started", "لم يبدأ"]);
export const ORDER_AXES_DOCTYPES = ["Sales Order", "Purchase Order"];
export function orderAxes(dt: string, doc: Doc): Axis[] {
  if (!ORDER_AXES_DOCTYPES.includes(dt)) return [];
  const so = dt === "Sales Order"; const ds = n(doc["docstatus"]); const status = s(doc["status"]);
  const total = n(doc["base_grand_total"] ?? doc["grand_total"]);
  const ful = Math.min(100, n(so ? doc["per_delivered"] : doc["per_received"])); const bill = Math.min(100, n(doc["per_billed"]));
  const key = so ? "sales_order" : "purchase_order";
  let invPaid = 0;
  for (const inv of adapter.list(so ? "Sales Invoice" : "Purchase Invoice")) {
    if (n(inv["docstatus"]) !== 1) continue;
    const it = rows(inv, "items"); const mine = it.filter((r) => r[key] === doc.name); if (!mine.length) continue;
    const all = it.reduce((x, r) => x + n(r["base_amount"] ?? r["amount"]), 0); const share = all ? mine.reduce((x, r) => x + n(r["base_amount"] ?? r["amount"]), 0) / all : 1;
    invPaid += (n(inv["base_grand_total"] ?? inv["grand_total"]) - n(inv["outstanding_amount"])) * share;
  }
  const paid = Math.max(invPaid, n(doc["advance_paid"]));
  const pay = total > 0 ? Math.min(100, r2((paid / total) * 100)) : 0;
  const wf = s(doc["workflow_state"]);
  const approval: Bi = ds === 2 ? ["Cancelled", "ملغى"] : ds === 1 ? ["Approved", "معتمد"] : wf ? [wf, STATUS_AR[wf] ?? wf] : ["Awaiting approval", "بانتظار الاعتماد"];
  const closure: Bi = status === "Completed" ? ["Completed", "مكتمل"] : status === "Closed" ? ["Closed by user", "أغلقه المستخدم"] : status === "On Hold" ? ["On hold", "موقوف مؤقتاً"] : ds === 2 ? ["Cancelled", "ملغى"] : ["Open", "مفتوح"];
  return [
    { key: "approval", label: ["Approval", "الاعتماد"], pct: ds === 1 ? 100 : 0, state: approval },
    { key: "fulfilment", label: so ? ["Delivery", "التسليم"] : ["Receipt", "الاستلام"], pct: r2(ful), state: part(ful) },
    { key: "billing", label: ["Billing", "الفوترة"], pct: r2(bill), state: part(bill) },
    { key: "payment", label: so ? ["Collection", "التحصيل"] : ["Payment", "السداد"], pct: pay, state: part(pay) },
    { key: "closure", label: ["Closure", "الإقفال"], pct: ["Completed", "Closed"].includes(status) ? 100 : 0, state: closure },
  ];
}

/* ------------------------------------------------------------------ D5/D6 why can't this post — with the fix ------------------------------------------------------------------ */
export type Blocker = { message: string; kind: string; title: Bi; fix: Bi };
const FIXES: [RegExp, string, Bi, Bi][] = [
  [/save the document/i, "save", ["Not saved yet", "لم يُحفظ بعد"], ["Save the document, then submit.", "احفظ المستند ثم اعتمده."]],
  [/no permission to submit/i, "permission", ["You cannot submit this document", "لا تملك صلاحية اعتماد هذا المستند"], ["Ask a user who holds a submitting role, or ask the administrator to grant it.", "اطلب من مستخدم لديه دور الاعتماد، أو من المسؤول منحك الصلاحية."]],
  [/credit limit/i, "credit", ["Customer credit limit exceeded", "تجاوز حد ائتمان العميل"], ["Collect overdue invoices, lower the amount, or ask the Credit Controller to raise the customer's credit limit.", "حصّل الفواتير المتأخرة أو خفّض المبلغ، أو اطلب من مراقب الائتمان رفع حد ائتمان العميل."]],
  [/not authorized to add or update entries before|frozen/i, "frozen", ["The period is frozen", "الفترة مجمّدة"], ["Change the posting date to an open period, or ask an Accounts Manager to move the company's frozen-till date.", "غيّر تاريخ القيد إلى فترة مفتوحة، أو اطلب من مدير الحسابات تعديل تاريخ التجميد في الشركة."]],
  [/accounting period|period .*closed|closed for/i, "period", ["The accounting period is closed", "الفترة المحاسبية مقفلة"], ["Post in an open period or ask an Accounts Manager to reopen the accounting period.", "سجّل القيد في فترة مفتوحة أو اطلب من مدير الحسابات إعادة فتح الفترة."]],
  [/budget/i, "budget", ["Budget exceeded", "تجاوز الميزانية"], ["Reduce the amount, charge another cost center, or ask the budget owner to increase the budget.", "خفّض المبلغ أو حمّله على مركز تكلفة آخر، أو اطلب من صاحب الميزانية زيادتها."]],
  [/total debit|debit.*credit|difference/i, "balance", ["Debits and credits do not balance", "المدين لا يساوي الدائن"], ["Make total debit equal total credit — use “Make Difference Entry” or correct a line amount.", "اجعل إجمالي المدين مساوياً للدائن — استخدم «قيد الفرق» أو صحّح مبلغ السطر."]],
  [/allocated amount|outstanding/i, "allocation", ["Allocated more than is outstanding", "المبلغ المخصص أكبر من المستحق"], ["Lower the allocated amount to the invoice's outstanding amount.", "خفّض المبلغ المخصص إلى المبلغ المستحق على الفاتورة."]],
  [/serial|batch/i, "serial", ["Serial or batch numbers missing", "أرقام تسلسلية أو دفعات ناقصة"], ["Pick the serial or batch numbers on each item row.", "اختر الأرقام التسلسلية أو الدفعات في كل سطر صنف."]],
  [/negative|insufficient|not enough|not available|stock/i, "stock", ["Not enough stock", "المخزون غير كافٍ"], ["Receive the stock first, choose another warehouse, or record a stock reconciliation.", "استلم المخزون أولاً أو اختر مستودعاً آخر، أو سجّل تسوية مخزون."]],
  [/dimension|cost center/i, "dimension", ["Accounting dimension missing", "بُعد محاسبي ناقص"], ["Fill the mandatory cost center or dimension on every line.", "املأ مركز التكلفة أو البُعد الإلزامي في كل سطر."]],
  [/return|returned/i, "return", ["Return exceeds the original", "المرتجع يتجاوز الأصل"], ["Return no more than the quantity of the original document.", "لا ترجع أكثر من كمية المستند الأصلي."]],
  [/expired|valid till/i, "expired", ["The quotation has expired", "انتهت صلاحية العرض"], ["Extend the quotation's valid-till date or issue a new quotation.", "مدّد تاريخ صلاحية العرض أو أصدر عرضاً جديداً."]],
  [/over.?(delivery|billing|receipt)|allowance/i, "over", ["More than ordered", "أكثر من المطلوب"], ["Reduce the quantity to what is still open on the order, or raise the over-delivery/billing allowance.", "خفّض الكمية إلى المتبقي في الأمر، أو ارفع نسبة السماح بالزيادة."]],
  [/zero|qty|quantity/i, "qty", ["Quantity missing", "الكمية ناقصة"], ["Enter a quantity above zero on each row.", "أدخل كمية أكبر من صفر في كل سطر."]],
  [/mandatory|required|missing field|حقول ناقصة|add at least one row/i, "mandatory", ["A required field is empty", "حقل إلزامي فارغ"], ["Fill the named field, save, then submit.", "املأ الحقل المذكور واحفظ ثم اعتمد."]],
  [/server/i, "server", ["Needs the DIGIT server", "يتطلب خادم ديجيت"], ["This step runs on the DIGIT server; submit it there.", "هذه الخطوة تعمل على خادم ديجيت؛ اعتمدها هناك."]],
];
export function explainBlocker(message: string): Blocker {
  const hit = FIXES.find(([rx]) => rx.test(message));
  return hit ? { message, kind: hit[1], title: hit[2], fix: hit[3] } : { message, kind: "other", title: ["Cannot post yet", "لا يمكن الترحيل بعد"], fix: ["Correct the value named in the message, save, then submit again.", "صحّح القيمة المذكورة في الرسالة واحفظ ثم أعد الاعتماد."] };
}
const LAYOUT = new Set(["Section Break", "Column Break", "Tab Break", "Button", "HTML", "Heading", "Fold", "Image"]);
const empty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && !v.length);
export function postReadiness(meta: DocTypeMeta, doc: Doc, user = currentUser()): { applicable: boolean; ok: boolean; blockers: Blocker[] } {
  if (!meta.is_submittable || n(doc["docstatus"]) !== 0) return { applicable: false, ok: false, blockers: [] };
  const msgs: string[] = [];
  if (doc["__islocal"]) msgs.push("Save the document before submitting");
  if (!hasPerm(meta, "submit", doc, user)) msgs.push(`No permission to submit ${meta.name}`);
  for (const f of meta.fields ?? []) {
    if (!f.reqd || f.hidden || f.depends_on || f.mandatory_depends_on || !f.fieldname || f.fieldname === "naming_series" || LAYOUT.has(f.fieldtype)) continue;
    if (empty(doc[f.fieldname])) msgs.push(f.fieldtype === "Table" ? `${f.label ?? f.fieldname}: add at least one row` : `Mandatory field missing: ${f.label ?? f.fieldname}`);
  }
  try { msgs.push(...submitErrors(meta.name, doc)); } catch (e) { msgs.push(String((e as Error).message ?? e)); }
  const pd = s(doc["posting_date"]); if (pd) try { msgs.push(...lockErrors(meta.name, doc, pd)); } catch { /* lock checks need company data */ }
  const blockers = [...new Set(msgs.filter(Boolean))].map(explainBlocker);
  return { applicable: true, ok: !blockers.length, blockers };
}

/* ------------------------------------------------------------------ F6 matched-by / submitted-by audit ------------------------------------------------------------------ */
export type Stamp = { by: string; on: string };
export type Audit = { created?: Stamp; submitted?: Stamp; cancelled?: Stamp; cleared?: Stamp; matched?: Stamp; lastChange?: Stamp };
export function auditTrail(dt: string, name: string): Audit {
  const doc = adapter.get(dt, name); const out: Audit = {};
  if (doc) out.created = { by: s(doc["owner"]) || "Administrator", on: s(doc["creation"]) };
  const vs = adapter.list("Version").filter((v) => v["ref_doctype"] === dt && v["docname"] === name).sort((a, b) => s(a["creation"]).localeCompare(s(b["creation"])) || a.name.localeCompare(b.name));
  for (const v of vs) {
    let data: { created?: boolean; changed?: [string, unknown, unknown][] } = {};
    try { data = JSON.parse(s(v["data"]) || "{}"); } catch { continue; }
    const stamp = { by: s(v["owner"]) || "Administrator", on: s(v["creation"]) };
    if (data.created && !out.created?.on) out.created = stamp;
    for (const [f, , to] of data.changed ?? []) {
      if (f === "docstatus" && n(to) === 1) out.submitted = stamp;
      if (f === "docstatus" && n(to) === 2) out.cancelled = stamp;
      if (f === "clearance_date" && to) out.cleared = stamp;
      if ((f === "status" && to === "Reconciled") || (f === "allocated_amount" && n(to) > 0)) out.matched = stamp;
    }
    if (data.changed?.length) out.lastChange = stamp;
  }
  if (!out.submitted && doc && n(doc["docstatus"]) === 1) out.submitted = { by: s(doc["modified_by"] ?? doc["owner"]) || "Administrator", on: s(doc["modified"]) };
  return out;
}

/* ------------------------------------------------------------------ SL7 why this price ------------------------------------------------------------------ */
export const SELLING_DOCTYPES = ["Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "POS Invoice"];
export const BUYING_DOCTYPES = ["Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Request for Quotation", "Material Request"];
const PARENT: Record<string, string> = { "Customer Group": "parent_customer_group", Territory: "parent_territory", "Item Group": "parent_item_group", "Supplier Group": "parent_supplier_group" };
/** Tree match as frappe get_child_groups: the value equals the rule's group or sits below it. */
export function isUnder(dt: string, value: string, ancestor: string): boolean {
  if (!ancestor || !value) return false;
  let cur: string | undefined = value;
  for (let i = 0; cur && i < 12; i++) { if (cur === ancestor) return true; cur = s(adapter.get(dt, cur)?.[PARENT[dt] ?? "parent"]) || undefined; }
  return /^All /.test(ancestor);
}
export type PriceRuleCheck = { name: string; title: string; priority: number; verdict: "applied" | "outranked" | "rejected"; reason: Bi; effect: Bi };
export type PriceExplain = { priceList: string; listRate: number; rowRate: number; expectedRate: number; differs: boolean; rules: PriceRuleCheck[] };
const effectOf = (r: Doc, cur: string): Bi => {
  if (s(r["price_or_product_discount"]) === "Product") return [`Free item ${s(r["free_item"]) || "(same item)"} × ${n(r["free_qty"]) || 1}`, `صنف مجاني ${s(r["free_item"]) || "(نفس الصنف)"} × ${n(r["free_qty"]) || 1}`];
  const k = s(r["rate_or_discount"]);
  if (k === "Rate") return [`Fixed rate ${n(r["rate"])} ${cur}`, `سعر ثابت ${n(r["rate"])} ${cur}`];
  if (k === "Discount Amount") return [`${n(r["discount_amount"])} ${cur} off`, `خصم ${n(r["discount_amount"])} ${cur}`];
  return [`${n(r["discount_percentage"])}% off`, `خصم ${n(r["discount_percentage"])}%`];
};
export function explainPrice(dt: string, doc: Doc, row: Row): PriceExplain {
  const selling = SELLING_DOCTYPES.includes(dt);
  const priceList = s(selling ? doc["selling_price_list"] : doc["buying_price_list"]);
  const code = s(row["item_code"]); const item = adapter.get("Item", code);
  const ip = adapter.list("Item Price").find((p) => p["item_code"] === code && (!priceList || p["price_list"] === priceList));
  const listRate = n(row["price_list_rate"]) || n(ip?.["price_list_rate"]);
  const date = s(doc["transaction_date"] ?? doc["posting_date"]) || today();
  const qty = n(row["stock_qty"] ?? row["qty"]); const amount = n(row["amount"]) || qty * n(row["rate"]);
  const party = selling ? adapter.get("Customer", s(doc["customer"] ?? doc["party_name"])) : adapter.get("Supplier", s(doc["supplier"]));
  const itemGroup = s(row["item_group"] ?? item?.["item_group"]); const brand = s(row["brand"] ?? item?.["brand"]);
  const cur = s(doc["currency"]) || "SAR";
  const checked = adapter.list("Pricing Rule").map((r) => {
    const why = ((): Bi | null => {
      if (n(r["disable"])) return ["Rule is disabled", "القاعدة معطلة"];
      if (selling ? !n(r["selling"]) : !n(r["buying"])) return [selling ? "Not a selling rule" : "Not a buying rule", selling ? "ليست قاعدة بيع" : "ليست قاعدة شراء"];
      if (s(r["company"]) && doc["company"] && r["company"] !== doc["company"]) return [`For company ${s(r["company"])}`, `خاصة بالشركة ${s(r["company"])}`];
      if (s(r["valid_from"]) && date < s(r["valid_from"])) return [`Starts on ${s(r["valid_from"])}`, `تبدأ في ${s(r["valid_from"])}`];
      if (s(r["valid_upto"]) && date > s(r["valid_upto"])) return [`Ended on ${s(r["valid_upto"])}`, `انتهت في ${s(r["valid_upto"])}`];
      if (s(r["for_price_list"]) && priceList && r["for_price_list"] !== priceList) return [`Only for price list ${s(r["for_price_list"])}`, `لقائمة الأسعار ${s(r["for_price_list"])} فقط`];
      const on = s(r["apply_on"]) || "Item Code";
      if (on === "Item Code" && !rows(r, "items").some((x) => x["item_code"] === code)) return ["Another item", "لصنف آخر"];
      if (on === "Item Group" && !rows(r, "item_groups").some((x) => isUnder("Item Group", itemGroup, s(x["item_group"])))) return ["Another item group", "لمجموعة أصناف أخرى"];
      if (on === "Brand" && !rows(r, "brands").some((x) => x["brand"] === brand)) return ["Another brand", "لعلامة تجارية أخرى"];
      const af = s(r["applicable_for"]);
      if (af) {
        const want = s(r[af.toLowerCase().replace(/ /g, "_")]);
        const have = af === "Customer" ? s(doc["customer"] ?? doc["party_name"]) : af === "Supplier" ? s(doc["supplier"]) : af === "Customer Group" ? s(doc["customer_group"] ?? party?.["customer_group"])
          : af === "Territory" ? s(doc["territory"] ?? party?.["territory"]) : af === "Supplier Group" ? s(party?.["supplier_group"]) : s(doc[af.toLowerCase().replace(/ /g, "_")]);
        const ok = PARENT[af] ? isUnder(af, have, want) : have === want;
        if (!ok) return [`Only for ${af} ${want}`, `خاصة بـ ${want}`];
      }
      const base = on === "Transaction" ? n(doc["total_qty"]) || qty : qty;
      if (n(r["min_qty"]) && base < n(r["min_qty"])) return [`Needs at least ${n(r["min_qty"])} units (line has ${base})`, `تتطلب ${n(r["min_qty"])} وحدة على الأقل (السطر ${base})`];
      if (n(r["max_qty"]) && base > n(r["max_qty"])) return [`Up to ${n(r["max_qty"])} units only (line has ${base})`, `حتى ${n(r["max_qty"])} وحدة فقط (السطر ${base})`];
      const amt = on === "Transaction" ? n(doc["net_total"] ?? doc["total"]) : amount;
      if (n(r["min_amt"]) && amt < n(r["min_amt"])) return [`Needs an amount of at least ${n(r["min_amt"])}`, `تتطلب مبلغاً لا يقل عن ${n(r["min_amt"])}`];
      if (n(r["max_amt"]) && amt > n(r["max_amt"])) return [`Up to an amount of ${n(r["max_amt"])}`, `حتى مبلغ ${n(r["max_amt"])}`];
      return null;
    })();
    return { r, why };
  });
  const matches = checked.filter((c) => !c.why).sort((a, b) => n(b.r["priority"]) - n(a.r["priority"]) || a.r.name.localeCompare(b.r.name));
  const multi = matches.some((m) => n(m.r["apply_multiple_pricing_rules"]));
  const applied = new Set(multi ? matches.map((m) => m.r.name) : matches.slice(0, 1).map((m) => m.r.name));
  let expected = listRate;
  for (const m of matches) if (applied.has(m.r.name) && s(m.r["price_or_product_discount"]) !== "Product") {
    const k = s(m.r["rate_or_discount"]);
    expected = k === "Rate" ? n(m.r["rate"]) : k === "Discount Amount" ? expected - n(m.r["discount_amount"]) : expected * (1 - n(m.r["discount_percentage"]) / 100);
  }
  const rules: PriceRuleCheck[] = checked.map(({ r, why }) => ({
    name: r.name, title: s(r["title"]) || r.name, priority: n(r["priority"]),
    verdict: (why ? "rejected" : applied.has(r.name) ? "applied" : "outranked") as PriceRuleCheck["verdict"],
    reason: why ?? (applied.has(r.name) ? ["All conditions met", "تحققت كل الشروط"] : ["Conditions met, but a higher-priority rule wins", "تحققت الشروط لكن قاعدة أعلى أولوية تتقدم"]),
    effect: effectOf(r, cur),
  })).sort((a, b) => ["applied", "outranked", "rejected"].indexOf(a.verdict) - ["applied", "outranked", "rejected"].indexOf(b.verdict) || b.priority - a.priority);
  const rowRate = n(row["rate"]);
  return { priceList, listRate, rowRate, expectedRate: r2(expected), differs: !!listRate && Math.abs(r2(expected) - rowRate) > 0.01, rules };
}

/* ------------------------------------------------------------------ F3 reclassify a posted journal line ------------------------------------------------------------------ */
export type ReclassLine = { account: string; debit: number; credit: number; cost_center?: string | undefined; project?: string | undefined; party_type?: string; party?: string };
export function reclassifyPreview(jeName: string, idx: number, to: string): { lines: ReclassLine[]; amount: number; from: string; errors: string[] } {
  const je = adapter.get("Journal Entry", jeName); const errors: string[] = [];
  if (!je) return { lines: [], amount: 0, from: "", errors: [`Journal Entry ${jeName} not found`] };
  if (n(je["docstatus"]) !== 1) errors.push("Only a submitted journal entry can be reclassified");
  const row = rows(je, "accounts").find((r, i) => n(r["idx"] ?? i + 1) === idx);
  if (!row) return { lines: [], amount: 0, from: "", errors: [...errors, `Line ${idx} not found`] };
  const from = s(row["account"]); const acc = adapter.get("Account", to);
  if (!to) errors.push("Choose the account to move the amount to");
  else if (!acc) errors.push(`Account ${to} not found`);
  else {
    if (n(acc["is_group"])) errors.push(`${to} is a group account`);
    if (acc["company"] !== je["company"]) errors.push(`${to} belongs to another company`);
    if (n(acc["disabled"])) errors.push(`${to} is disabled`);
    if (to === from) errors.push("The new account is the same as the current one");
  }
  const amt = r2(n(row["debit"]) - n(row["credit"]));
  if (!amt) errors.push("The line has no amount");
  const dims = { cost_center: s(row["cost_center"]) || undefined, project: s(row["project"]) || undefined };
  const partyOk = acc && ["Receivable", "Payable"].includes(s(acc["account_type"]));
  const back: ReclassLine = { account: from, debit: amt < 0 ? -amt : 0, credit: amt > 0 ? amt : 0, ...dims, ...(row["party"] ? { party_type: s(row["party_type"]), party: s(row["party"]) } : {}) };
  const fwd: ReclassLine = { account: to, debit: amt > 0 ? amt : 0, credit: amt < 0 ? -amt : 0, ...dims, ...(partyOk && row["party"] ? { party_type: s(row["party_type"]), party: s(row["party"]) } : {}) };
  return { lines: [fwd, back], amount: Math.abs(amt), from, errors };
}
/** The linked reclassification entries of one journal entry (reversal_of + the reclassification title). */
export const reclassificationsOf = (jeName: string) => adapter.list("Journal Entry").filter((d) => d["reversal_of"] === jeName && s(d["title"]).startsWith("Reclassify ") && n(d["docstatus"]) !== 2);
export function reclassify(jeName: string, idx: number, to: string, postingDate = today(), user = currentUser()): { name?: string; errors: string[] } {
  const p = reclassifyPreview(jeName, idx, to); if (p.errors.length) return { errors: p.errors };
  const meta = cachedMeta("Journal Entry"); if (!meta) return { errors: ["Journal Entry definition not loaded"] };
  if (!hasPerm(meta, "create", undefined, user) || !hasPerm(meta, "submit", undefined, user)) return { errors: ["No permission to create and submit journal entries"] };
  const je = adapter.get("Journal Entry", jeName)!;
  const title = `Reclassify ${jeName} line ${idx}`;
  const total = p.amount;
  const d = adapter.insertDoc("Journal Entry", { voucher_type: "Journal Entry", company: je["company"], posting_date: postingDate, title, reversal_of: jeName,
    user_remark: `${title}: ${p.from} → ${to}`, total_debit: total, total_credit: total, difference: 0,
    accounts: p.lines.map((l, i) => ({ idx: i + 1, doctype: "Journal Entry Account", parentfield: "accounts", parenttype: "Journal Entry", ...l, debit_in_account_currency: l.debit, credit_in_account_currency: l.credit })) });
  const errs = submitDocument(meta, d.name, user);
  return errs.length ? { name: d.name, errors: errs } : { name: d.name, errors: [] };
}

/* ------------------------------------------------------------------ ledger impact (OWN-41) ------------------------------------------------------------------ */
export interface ImpactLine { account: string; debit: number; credit: number; party_type?: string | undefined; party?: string | undefined; cost_center?: string | undefined; missing?: boolean }
/** posted = the GL Entry rows this voucher wrote; preview = what the shared posting engine will write on submit; none = no ledger effect. */
export interface LedgerImpact { mode: "posted" | "preview" | "none"; lines: ImpactLine[]; debit: number; credit: number; balanced: boolean; stockRows: number; missingAccounts: number }
const r2i = (x: number) => Math.round(x * 100) / 100;
/** Ledger effect of one document, read from the same posting logic every report uses (posting.ts), never recomputed here. */
export function ledgerImpact(dt: string, doc: Doc): LedgerImpact {
  const ds = n(doc.docstatus);
  let lines: ImpactLine[] = []; let mode: LedgerImpact["mode"] = "none"; let stockRows = 0;
  if (ds === 1 || ds === 2) {
    const live = (r: Doc) => r["voucher_type"] === dt && r["voucher_no"] === doc.name && !n(r["is_cancelled"]);
    lines = adapter.list("GL Entry").filter(live).map((r) => ({ account: String(r["account"] ?? ""), debit: r2i(n(r["debit"])), credit: r2i(n(r["credit"])), party_type: r["party_type"] ? String(r["party_type"]) : undefined, party: r["party"] ? String(r["party"]) : undefined, cost_center: r["cost_center"] ? String(r["cost_center"]) : undefined }));
    stockRows = adapter.list("Stock Ledger Entry").filter(live).length;
    // documents that post through a journal (asset value adjustment / impairment / repair …) show that journal's rows
    const je = typeof doc["journal_entry"] === "string" ? String(doc["journal_entry"]) : "";
    if (!lines.length && je) lines = adapter.list("GL Entry").filter((r) => r["voucher_type"] === "Journal Entry" && r["voucher_no"] === je && !n(r["is_cancelled"])).map((r) => ({ account: String(r["account"] ?? ""), debit: r2i(n(r["debit"])), credit: r2i(n(r["credit"])), party_type: r["party_type"] ? String(r["party_type"]) : undefined, party: r["party"] ? String(r["party"]) : undefined, cost_center: r["cost_center"] ? String(r["cost_center"]) : undefined }));
    if (lines.length || stockRows) mode = "posted";
  } else if (ds === 0) {
    // the same builders submit uses (posting.ts glLines + dimension offsets), via the shared posting preview
    try { lines = postingPreview(dt, doc).gl.map((l) => ({ account: l.account, debit: r2i(l.debit), credit: r2i(l.credit), party_type: l.party_type, party: l.party, cost_center: l.cost_center })); } catch { lines = []; }
    lines = lines.map((l) => (adapter.get("Account", l.account) ? l : { ...l, missing: true }));
    if (lines.length) mode = "preview";
  }
  const debit = r2i(lines.reduce((a, l) => a + l.debit, 0)), credit = r2i(lines.reduce((a, l) => a + l.credit, 0));
  return { mode, lines, debit, credit, balanced: Math.abs(debit - credit) < 0.005, stockRows, missingAccounts: lines.filter((l) => l.missing).length };
}

/* ------------------------------------------------------------------ stock impact (owner 2026-11-12 evening §9) ------------------------------------------------------------------ */
export interface StockImpactLine { item_code: string; warehouse: string; qty: number; value: number | null }
/** posted = the Stock Ledger Entry rows this voucher wrote; preview = what the shared posting engine will write on submit. */
export interface StockImpact { mode: "posted" | "preview" | "none"; lines: StockImpactLine[]; qtyIn: number; qtyOut: number; value: number | null }
export function stockImpact(dt: string, doc: Doc): StockImpact {
  const ds = n(doc.docstatus); let lines: StockImpactLine[] = []; let mode: StockImpact["mode"] = "none";
  if (ds === 1 || ds === 2) {
    lines = adapter.list("Stock Ledger Entry").filter((r) => r["voucher_type"] === dt && r["voucher_no"] === doc.name && !n(r["is_cancelled"]))
      .map((r) => ({ item_code: String(r["item_code"] ?? ""), warehouse: String(r["warehouse"] ?? ""), qty: r2i(n(r["actual_qty"])), value: r2i(n(r["stock_value_difference"])) }));
    if (lines.length) mode = "posted";
  } else if (ds === 0) {
    try { lines = postingPreview(dt, doc).sl.map((l) => ({ item_code: l.item_code, warehouse: l.warehouse, qty: r2i(l.actual_qty), value: null })); } catch { lines = []; }
    if (lines.length) mode = "preview";
  }
  const qtyIn = r2i(lines.reduce((a, l) => a + Math.max(0, l.qty), 0)), qtyOut = r2i(lines.reduce((a, l) => a + Math.max(0, -l.qty), 0));
  const value = mode === "posted" ? r2i(lines.reduce((a, l) => a + (l.value ?? 0), 0)) : null;
  return { mode, lines, qtyIn, qtyOut, value };
}

/* ------------------------------------------------------------------ party snapshot (B6-D9 / OWN-41) ------------------------------------------------------------------ */
export interface PartySnapshot {
  party_type: "Customer" | "Supplier"; balance: number; overdue: number; overdueCount: number; openInvoices: number; openOrders: number;
  creditLimit: number | null; creditUsedPct: number | null; lastInvoice: string; company: string;
  /** Customer hold (Block Customer + release date + Core reason); null for suppliers. */
  hold: CustomerHold | null;
}
/** Balance / overdue / credit / open orders of a customer or supplier, read with the viewer's permissions; null when the viewer
 *  cannot read that party's invoices (the figures are hidden, never shown as zero). */
export function partySnapshot(dt: string, name: string, company = "", user = currentUser()): PartySnapshot | null {
  if (dt !== "Customer" && dt !== "Supplier") return null;
  const sales = dt === "Customer"; const invDt = sales ? "Sales Invoice" : "Purchase Invoice"; const ordDt = sales ? "Sales Order" : "Purchase Order";
  const im = cachedMeta(invDt); if (!im || !hasPerm(im, "read", undefined, user)) return null;
  const field = sales ? "customer" : "supplier"; const t0 = today();
  const mine = (d: Doc) => d[field] === name && n(d.docstatus) === 1 && (!company || d["company"] === company);
  const inv = adapter.list(invDt).filter((d) => mine(d) && hasPerm(im, "read", d, user));
  const open = inv.filter((d) => n(d["outstanding_amount"]) > 0.005);
  const over = open.filter((d) => s(d["due_date"]) && s(d["due_date"]) < t0);
  const om = cachedMeta(ordDt);
  const orders = om && hasPerm(om, "read", undefined, user) ? adapter.list(ordDt).filter((d) => mine(d) && hasPerm(om, "read", d, user) && !["Completed", "Closed", "Cancelled", "On Hold"].includes(s(d["status"]))) : [];
  const balance = r2(open.reduce((a, d) => a + n(d["outstanding_amount"]), 0));
  let creditLimit: number | null = null, creditUsedPct: number | null = null;
  if (sales) {
    const c = adapter.get("Customer", name); const co = company || s(inv[0]?.["company"]);
    const rowsC = rows(c ?? undefined, "credit_limits"); const row = rowsC.find((x) => !x["company"] || x["company"] === co);
    if (row && n(row["credit_limit"]) > 0) { creditLimit = n(row["credit_limit"]); creditUsedPct = Math.round((balance / creditLimit) * 100); }
  }
  const lastInvoice = inv.map((d) => s(d["posting_date"])).sort().pop() ?? "";
  return { party_type: dt, balance, overdue: r2(over.reduce((a, d) => a + n(d["outstanding_amount"]), 0)), overdueCount: over.length, openInvoices: open.length,
    openOrders: orders.length, creditLimit, creditUsedPct, lastInvoice, company, hold: sales ? customerHold(name) : null };
}

/* ------------------------------------------------------------------ account / item snapshots for the Quick View ------------------------------------------------------------------ */
export interface AccountSnapshot { balance: number; debit: number; credit: number; entries: number; last: { date: string; voucher_type: string; voucher_no: string; amount: number }[]; rootType: string; company: string }
/** Ledger balance of one account from its GL Entry rows (not cancelled), read with the viewer's permissions; null without ledger access. */
export function accountSnapshot(name: string, user = currentUser()): AccountSnapshot | null {
  const gm = cachedMeta("GL Entry"); if (!gm || !hasPerm(gm, "read", undefined, user)) return null;
  const acc = adapter.get("Account", name);
  const rowsG = adapter.list("GL Entry").filter((g) => g["account"] === name && !n(g["is_cancelled"]) && hasPerm(gm, "read", g, user));
  const debit = r2(rowsG.reduce((a, g) => a + n(g["debit"]), 0)), credit = r2(rowsG.reduce((a, g) => a + n(g["credit"]), 0));
  const last = [...rowsG].sort((a, b) => s(b["posting_date"]).localeCompare(s(a["posting_date"]))).slice(0, 5)
    .map((g) => ({ date: s(g["posting_date"]), voucher_type: s(g["voucher_type"]), voucher_no: s(g["voucher_no"]), amount: r2(n(g["debit"]) - n(g["credit"])) }));
  return { balance: r2(debit - credit), debit, credit, entries: rowsG.length, last, rootType: s(acc?.["root_type"]), company: s(acc?.["company"]) };
}
/**
 * Chart of Accounts balances (research topic "Chart of Accounts": ERPNext / Odoo / TallyPrime show each account's balance in
 * the tree): posted, uncancelled ledger rows the user may read, summed per account (debit − credit) and rolled up through
 * parent_account so every group shows its total. Null without ledger access. Read-only — nothing is stored.
 */
export function accountTreeBalances(user = currentUser()): Map<string, number> | null {
  const gm = cachedMeta("GL Entry"); if (!gm || !hasPerm(gm, "read", undefined, user)) return null;
  const own = new Map<string, number>();
  for (const g of adapter.list("GL Entry")) {
    if (n(g["is_cancelled"]) || !hasPerm(gm, "read", g, user)) continue;
    const a = s(g["account"]); if (!a) continue; own.set(a, (own.get(a) ?? 0) + n(g["debit"]) - n(g["credit"]));
  }
  const parent = new Map(adapter.list("Account").map((a) => [a.name, s(a["parent_account"])]));
  const out = new Map<string, number>();
  for (const [acc, v] of own) {
    let cur: string | undefined = acc; const seen = new Set<string>();
    while (cur && !seen.has(cur)) { seen.add(cur); out.set(cur, (out.get(cur) ?? 0) + v); cur = parent.get(cur) || undefined; }
  }
  for (const [k, v] of out) out.set(k, r2(v));
  return out;
}
export interface ItemSnapshot { onHand: number; warehouses: { warehouse: string; qty: number }[]; onOrder: number; uom: string; lastRate: number | null }
/** Stock on hand per warehouse (Bin), quantity still on open purchase orders and the last purchase rate; null without stock access. */
export function itemSnapshot(code: string, user = currentUser()): ItemSnapshot | null {
  const bm = cachedMeta("Bin"); if (!bm || !hasPerm(bm, "read", undefined, user)) return null;
  const bins = adapter.list("Bin").filter((b) => b["item_code"] === code && hasPerm(bm, "read", b, user));
  const warehouses = bins.map((b) => ({ warehouse: s(b["warehouse"]), qty: r2(n(b["actual_qty"])) })).filter((w) => w.qty !== 0).sort((a, b) => b.qty - a.qty);
  const om = cachedMeta("Purchase Order"); let onOrder = 0; let lastRate: number | null = null;
  if (om && hasPerm(om, "read", undefined, user)) {
    const pos = adapter.list("Purchase Order").filter((o) => n(o.docstatus) === 1 && hasPerm(om, "read", o, user));
    for (const o of pos) for (const r of rows(o, "items")) if (r["item_code"] === code && !["Closed", "Completed"].includes(s(o["status"]))) onOrder += Math.max(0, n(r["qty"]) - n(r["received_qty"]));
    const lastPo = [...pos].filter((o) => rows(o, "items").some((r) => r["item_code"] === code)).sort((a, b) => s(b["transaction_date"]).localeCompare(s(a["transaction_date"])))[0];
    const row = lastPo ? rows(lastPo, "items").find((r) => r["item_code"] === code) : undefined; lastRate = row ? r2(n(row["rate"])) : null;
  }
  return { onHand: r2(bins.reduce((a, b) => a + n(b["actual_qty"]), 0)), warehouses, onOrder: r2(onOrder), uom: s(adapter.get("Item", code)?.["stock_uom"]), lastRate };
}
