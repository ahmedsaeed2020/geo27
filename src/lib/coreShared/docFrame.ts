/**
 * DIGIT Enterprise shared document frame (owner FINAL WORK LIST 2026-11-13, Part 1a — DOC-001…DOC-322, OWN-13/20/41/65,
 * HOST-GUIDE/HOST-JOURNEY, D4-b). Pure logic read by src/components/enterprise/DocFrame.tsx on every document of every app:
 *  - what the document is and who acts next (bilingual registry; any other DocType falls back to its own description),
 *  - the stage strip derived from the linked documents (a generic link scan over one chain of DocTypes — any header or row
 *    value that names a document of another stage is a link, so no per-DocType field list is hand-written),
 *  - the step checklist, the native reversal action, the hold / release record, and repeat eligibility.
 * Nothing here posts or changes a ledger: holds are Core records, reversals and repeats run the native actions.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta, type DocTypeMeta } from "@/lib/catalog";
import { scopedList } from "@/lib/scope";
import { currentUser, hasPerm } from "@/lib/session";
import { CORE_DT } from "./doctypes";
import { translateTo } from "@/i18n";

export type Bi = [string, string];
const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => (v == null ? "" : String(v));
const nowIso = () => new Date().toISOString().slice(0, 19).replace("T", " ");

/** The 19 documents of the owner's work list (sheet 3); every other DocType still gets the frame with generic text. */
export const FRAME_DOCTYPES = ["Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "Material Request", "Request for Quotation", "Supplier Quotation",
  "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Journal Entry", "Payment Entry", "Stock Entry", "Stock Reconciliation",
  "Asset", "Asset Capitalization", "Asset Movement", "Asset Repair", "Asset Value Adjustment"] as const;

/** What the document is, in one sentence, and who normally takes its next step. */
export const DOC_GUIDE: Record<string, { what: Bi; who: Bi }> = {
  "Quotation": { what: ["A price offer to a customer; once accepted it becomes a sales order.", "عرض سعر للعميل؛ عند قبوله يتحول إلى أمر بيع."], who: ["Sales team", "فريق المبيعات"] },
  "Sales Order": { what: ["The customer's confirmed order: it reserves stock and drives delivery, billing and collection.", "طلب العميل المؤكد: يحجز المخزون ويقود التسليم والفوترة والتحصيل."], who: ["Sales team, then the warehouse", "فريق المبيعات ثم المستودع"] },
  "Delivery Note": { what: ["Goods leaving the warehouse for the customer; it reduces stock and is then invoiced.", "بضاعة تخرج من المستودع للعميل؛ تُنقص المخزون ثم تُفوتر."], who: ["Warehouse team", "فريق المستودع"] },
  "Sales Invoice": { what: ["The tax invoice to the customer: it posts revenue and VAT and opens the receivable.", "الفاتورة الضريبية للعميل: ترحّل الإيراد والضريبة وتفتح الذمة المدينة."], who: ["Accounts receivable", "حسابات العملاء"] },
  "Material Request": { what: ["An internal request for items — to buy, transfer or issue — before any order is placed.", "طلب داخلي لأصناف — للشراء أو التحويل أو الصرف — قبل أي أمر."], who: ["Requester, then purchasing or the warehouse", "مقدّم الطلب ثم المشتريات أو المستودع"] },
  "Request for Quotation": { what: ["Asks several suppliers to quote for the same items, so their prices can be compared.", "يطلب من عدة موردين تسعير الأصناف نفسها لمقارنة الأسعار."], who: ["Purchasing team", "فريق المشتريات"] },
  "Supplier Quotation": { what: ["A supplier's price offer, compared with other quotes before the purchase order.", "عرض سعر المورد، يُقارن بالعروض الأخرى قبل أمر الشراء."], who: ["Purchasing team", "فريق المشتريات"] },
  "Purchase Order": { what: ["The order placed with a supplier: it commits budget and drives receipt, billing and payment.", "الأمر المرسل للمورد: يلتزم بالميزانية ويقود الاستلام والفوترة والسداد."], who: ["Purchasing team, then receiving", "فريق المشتريات ثم الاستلام"] },
  "Purchase Receipt": { what: ["Goods received from a supplier: it adds stock and waits for the supplier's bill.", "بضاعة مستلمة من المورد: تضيف للمخزون وتنتظر فاتورة المورد."], who: ["Receiving / warehouse team", "فريق الاستلام والمستودع"] },
  "Purchase Invoice": { what: ["The supplier's bill: it posts the expense or stock value and VAT and opens the payable.", "فاتورة المورد: ترحّل المصروف أو قيمة المخزون والضريبة وتفتح الذمة الدائنة."], who: ["Accounts payable", "حسابات الموردين"] },
  "Journal Entry": { what: ["A manual accounting entry: debits must equal credits before it can be posted.", "قيد محاسبي يدوي: يجب أن يساوي المدين الدائن قبل الترحيل."], who: ["Accountant, then the reviewer", "المحاسب ثم المراجع"] },
  "Payment Entry": { what: ["Money received from a customer or paid to a supplier, allocated against their invoices.", "مبلغ مستلم من عميل أو مدفوع لمورد، يُخصص على فواتيرهم."], who: ["Treasury / cashier", "الخزينة وأمين الصندوق"] },
  "Stock Entry": { what: ["Moves stock: receipt, issue, transfer between warehouses or manufacture.", "يحرّك المخزون: إدخال أو صرف أو تحويل بين المستودعات أو تصنيع."], who: ["Warehouse team", "فريق المستودع"] },
  "Stock Reconciliation": { what: ["Sets counted quantities and values; the difference is posted as a stock adjustment.", "يثبت الكميات والقيم المجرودة؛ ويُرحّل الفرق تسويةً للمخزون."], who: ["Warehouse team, then the stock approver", "فريق المستودع ثم معتمد المخزون"] },
  "Asset": { what: ["A fixed asset in the register: cost, location, custodian and depreciation schedule.", "أصل ثابت في السجل: التكلفة والموقع وصاحب العهدة وجدول الإهلاك."], who: ["Fixed-asset accountant", "محاسب الأصول الثابتة"] },
  "Asset Capitalization": { what: ["Turns purchased items, services or work in progress into a fixed asset.", "يحوّل الأصناف أو الخدمات المشتراة أو الأعمال تحت التنفيذ إلى أصل ثابت."], who: ["Fixed-asset accountant", "محاسب الأصول الثابتة"] },
  "Asset Movement": { what: ["Moves an asset to another location or custodian, or issues / receives it.", "ينقل الأصل إلى موقع أو صاحب عهدة آخر، أو يصرفه أو يستلمه."], who: ["Asset custodian and the receiving employee", "صاحب العهدة والموظف المستلم"] },
  "Asset Repair": { what: ["Records a repair: downtime, parts and cost, and whether the cost is capitalized.", "يسجل الإصلاح: مدة التوقف وقطع الغيار والتكلفة وهل تُرسمل."], who: ["Maintenance team, then accounts", "فريق الصيانة ثم الحسابات"] },
  "Asset Value Adjustment": { what: ["Changes an asset's book value (revaluation or impairment) and posts the difference.", "يغيّر القيمة الدفترية للأصل (إعادة تقييم أو انخفاض) ويرحّل الفرق."], who: ["Fixed-asset accountant", "محاسب الأصول الثابتة"] },
};
export function guideFor(meta: DocTypeMeta): { what: Bi; who: Bi } {
  const g = DOC_GUIDE[meta.name]; if (g) return g;
  const d = s((meta as { description?: unknown }).description).replace(/<[^>]+>/g, "").trim();
  // the Arabic fallback names the DocType by its Arabic label (plugin / field dictionaries), never the English name
  const arName = translateTo(meta.name, "ar");
  return { what: [d || `A ${meta.name} record.`, d ? (translateTo(d, "ar") !== d ? translateTo(d, "ar") : d) : arName !== meta.name ? `سجل ${arName}.` : "سجل مستند."], who: ["Users with access to this document", "المستخدمون المخوّلون بهذا المستند"] };
}

/* ------------------------------------------------------------------ stage strip from linked documents ------------------------------------------------------------------ */
export const CHAINS: Record<string, string[]> = {
  selling: ["Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "Payment Entry"],
  buying: ["Material Request", "Request for Quotation", "Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Payment Entry"],
  stock: ["Material Request", "Stock Entry"],
  count: ["Stock Reconciliation", "Stock Entry"],
  asset: ["Purchase Receipt", "Purchase Invoice", "Asset", "Asset Capitalization", "Asset Movement", "Asset Repair", "Asset Value Adjustment"],
  journal: ["Journal Entry", "Sales Invoice", "Purchase Invoice", "Payment Entry"],
};
export const SEQUENTIAL = new Set(["selling", "buying", "stock"]);
export const STAGE_AR: Record<string, string> = {
  "Quotation": "عرض السعر", "Sales Order": "أمر البيع", "Delivery Note": "التسليم", "Sales Invoice": "فاتورة المبيعات", "Payment Entry": "الدفع",
  "Material Request": "طلب المواد", "Request for Quotation": "طلب العروض", "Supplier Quotation": "عرض المورد", "Purchase Order": "أمر الشراء",
  "Purchase Receipt": "الاستلام", "Purchase Invoice": "فاتورة المورد", "Stock Entry": "حركة المخزون", "Stock Reconciliation": "الجرد والتسوية",
  "Asset": "الأصل", "Asset Capitalization": "الرسملة", "Asset Movement": "النقل والعهدة", "Asset Repair": "الإصلاح", "Asset Value Adjustment": "تعديل القيمة", "Journal Entry": "قيد اليومية",
};
/** Which chain a document walks (null = no chain: the strip shows its own status steps). */
export function chainFor(dt: string, doc: Doc): string | null {
  if (dt === "Payment Entry") return s(doc["party_type"]) === "Supplier" ? "buying" : s(doc["party_type"]) === "Customer" ? "selling" : null;
  if (dt === "Material Request") return ["Purchase", ""].includes(s(doc["material_request_type"])) ? "buying" : "stock";
  if (dt === "Stock Entry") return s(doc["purpose"]) === "Material Receipt" || s(doc["stock_entry_type"]) === "Material Receipt" ? "stock" : "stock";
  if (dt === "Stock Reconciliation") return "count";
  if (dt.startsWith("Asset")) return "asset";
  if (dt === "Journal Entry") return "journal";
  for (const id of ["selling", "buying"]) if (CHAINS[id]!.includes(dt)) return id;
  return null;
}
export interface LinkedDoc { doctype: string; name: string; docstatus: number; status: string; date: string; total: number }
export type StageState = "done" | "current" | "after" | "skipped" | "pending";
export interface FrameStage { doctype: string; label: Bi; state: StageState; docs: LinkedDoc[] }
const toLinked = (dt: string, d: Doc): LinkedDoc => ({ doctype: dt, name: d.name, docstatus: n(d.docstatus), status: s(d["status"]) || ["Draft", "Submitted", "Cancelled"][n(d.docstatus)]!,
  date: s(d["posting_date"] ?? d["transaction_date"] ?? d["schedule_date"] ?? d["available_for_use_date"] ?? d["creation"]).slice(0, 10),
  total: n(d["grand_total"] ?? d["paid_amount"] ?? d["total_debit"] ?? d["gross_purchase_amount"] ?? d["total_asset_cost"] ?? d["repair_cost"] ?? d["total_amount"]) });
const SKIP_KEYS = new Set(["name", "doctype", "owner", "modified_by", "company", "parent", "parenttype", "parentfield", "amended_from", "naming_series"]);
/** Every value in the document (header and child rows) that names another document. */
function namedValues(d: Doc): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (SKIP_KEYS.has(k) || k.startsWith("__")) continue;
    if (typeof v === "string" && v) out.push(v);
    else if (Array.isArray(v)) for (const r of v) if (r && typeof r === "object") for (const [rk, rv] of Object.entries(r as Record<string, unknown>)) if (!SKIP_KEYS.has(rk) && typeof rv === "string" && rv) out.push(rv);
  }
  return out;
}
/** All documents of the chain linked (directly or through each other) to this document, permission-scoped. */
export function linkedDocuments(dt: string, doc: Doc, user = currentUser()): { chain: string | null; docs: LinkedDoc[] } {
  const chain = chainFor(dt, doc); const stages = chain ? CHAINS[chain]! : [dt];
  const owner = new Map<string, { dt: string; d: Doc }>(); // document name → its record (names are unique across these series)
  for (const sdt of stages) { if (!cachedMeta(sdt) && user !== "Administrator") continue; for (const d of scopedList(sdt, user)) owner.set(`${sdt}|${d.name}`, { dt: sdt, d }); }
  const byName = new Map<string, string[]>(); for (const k of owner.keys()) { const nm = k.slice(k.indexOf("|") + 1); (byName.get(nm) ?? byName.set(nm, []).get(nm)!).push(k); }
  const edges = new Map<string, Set<string>>(); const link = (a: string, b: string) => { if (a === b) return; (edges.get(a) ?? edges.set(a, new Set()).get(a)!).add(b); (edges.get(b) ?? edges.set(b, new Set()).get(b)!).add(a); };
  const me = `${dt}|${doc.name}`; if (!owner.has(me)) owner.set(me, { dt, d: doc });
  for (const [k, { dt: odt, d }] of owner) for (const v of namedValues(d)) for (const t of byName.get(v) ?? []) if (!t.startsWith(`${odt}|`) || s(d["return_against"]) === v) link(k, t);
  const seen = new Set([me]); const q = [me];
  while (q.length) for (const nb of edges.get(q.shift()!) ?? []) if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
  seen.delete(me);
  return { chain, docs: [...seen].map((k) => owner.get(k)!).map(({ dt: x, d }) => toLinked(x, d)).sort((a, b) => stages.indexOf(a.doctype) - stages.indexOf(b.doctype) || a.date.localeCompare(b.date)) };
}
export function frameStages(dt: string, doc: Doc, user = currentUser()): { chain: string | null; stages: FrameStage[]; next: string | null; linked: LinkedDoc[] } {
  const { chain, docs } = linkedDocuments(dt, doc, user);
  const order = chain ? CHAINS[chain]! : [dt]; const ci = order.indexOf(dt);
  const stages: FrameStage[] = order.map((sdt, i) => {
    const mine = i === ci ? [toLinked(dt, doc)] : docs.filter((d) => d.doctype === sdt && d.docstatus !== 2);
    const state: StageState = i === ci ? "current" : mine.length ? (i < ci ? "done" : "after") : i < ci ? "skipped" : "pending";
    return { doctype: sdt, label: [sdt, STAGE_AR[sdt] ?? sdt], state, docs: mine };
  });
  // only sequential flows have a "next document" (an asset's repairs or a journal's invoices are not a next step)
  const next = chain && SEQUENTIAL.has(chain) && n(doc.docstatus) === 1 ? stages.slice(ci + 1).find((x) => x.state === "pending")?.doctype ?? null : null;
  return { chain, stages, next, linked: docs };
}

/* ------------------------------------------------------------------ checklist + who acts ------------------------------------------------------------------ */
const LAYOUT = new Set(["Section Break", "Column Break", "Tab Break", "Button", "HTML", "Heading", "Fold", "Image"]);
export function missingRequired(meta: DocTypeMeta, doc: Doc): string[] {
  return (meta.fields ?? []).filter((f) => f.reqd && !f.hidden && !f.depends_on && !f.mandatory_depends_on && f.fieldname && f.fieldname !== "naming_series" && !LAYOUT.has(f.fieldtype)
    && (doc[f.fieldname] == null || doc[f.fieldname] === "" || (Array.isArray(doc[f.fieldname]) && !(doc[f.fieldname] as unknown[]).length))).map((f) => f.label || f.fieldname!);
}
export interface CheckStep { key: "fill" | "save" | "checks" | "submit" | "next"; label: Bi; done: boolean; current: boolean }
export function checklist(meta: DocTypeMeta, doc: Doc, o: { dirty: boolean; blockers: number; next: string | null; hasNextStage: boolean }): CheckStep[] {
  const ds = n(doc.docstatus); const local = !!doc["__islocal"]; const miss = missingRequired(meta, doc).length;
  const steps: Omit<CheckStep, "current">[] = [
    { key: "fill", label: ["Fill the required fields", "أكمل الحقول الإلزامية"], done: ds > 0 || miss === 0 },
    { key: "save", label: ["Save the draft", "احفظ المسودة"], done: ds > 0 || (!local && !o.dirty) },
  ];
  if (meta.is_submittable) {
    steps.push({ key: "checks", label: ["Pass the posting checks", "اجتز فحوص الترحيل"], done: ds > 0 || (!local && !o.dirty && o.blockers === 0) });
    steps.push({ key: "submit", label: ["Submit (post)", "اعتمد (رحّل)"], done: ds === 1 });
    if (o.hasNextStage) steps.push({ key: "next", label: o.next ? [`Create the next document: ${o.next}`, `أنشئ المستند التالي: ${STAGE_AR[o.next] ?? o.next}`] : ["Next document created", "أُنشئ المستند التالي"], done: ds === 1 && !o.next });
  }
  const cur = steps.findIndex((x) => !x.done);
  return steps.map((x, i) => ({ ...x, current: i === cur }));
}
/** Roles allowed a permission on a DocType at permlevel 0 (for "who does it"). */
export function rolesFor(dt: string, ptype: "submit" | "create" | "write"): string[] {
  const perms = ((cachedMeta(dt) as unknown as { permissions?: Record<string, unknown>[] } | undefined)?.permissions ?? []);
  return [...new Set(perms.filter((p) => n(p[ptype]) === 1 && n(p["permlevel"]) === 0 && p["role"]).map((p) => s(p["role"])))].filter((r) => r !== "All").sort();
}

/* ------------------------------------------------------------------ reverse, hold / release, repeat ------------------------------------------------------------------ */
/** The native action that reverses a posted document by creating its reversal (never deleting it); others reverse by Cancel. */
export const REVERSE_ACTION: Record<string, string> = { "Sales Invoice": "Return / Credit Note", "Purchase Invoice": "Return / Debit Note", "Delivery Note": "Sales Return",
  "Purchase Receipt": "Purchase Return", "Journal Entry": "Reverse Journal Entry" };
/** Native hold actions (sales_order.js / purchase_order.js update_status, purchase_invoice.js block) — preferred when the document has them. */
export const NATIVE_HOLD: Record<string, { hold: string; release: string; held: (d: Doc) => boolean; when: (d: Doc) => boolean }> = {
  "Sales Order": { hold: "Hold", release: "Resume", held: (d) => s(d["status"]) === "On Hold", when: (d) => n(d.docstatus) === 1 },
  "Purchase Order": { hold: "Hold", release: "Resume", held: (d) => s(d["status"]) === "On Hold", when: (d) => n(d.docstatus) === 1 },
  "Purchase Invoice": { hold: "Block Invoice", release: "Unblock Invoice", held: (d) => !!n(d["on_hold"]), when: (d) => n(d.docstatus) === 1 },
};
export interface HoldState { held: boolean; reason: string; by: string; on: string; record?: string }
export function holdState(dt: string, doc: Doc): HoldState {
  const nat = NATIVE_HOLD[dt];
  if (nat && nat.when(doc) && nat.held(doc)) return { held: true, reason: s(doc["hold_comment"] ?? doc["digit_hold_reason"]), by: s(doc["modified_by"]), on: s(doc["modified"]).slice(0, 16) };
  const r = adapter.list(CORE_DT.docHold).filter((h) => h["reference_doctype"] === dt && h["reference_name"] === doc.name && s(h["status"]) === "Held").sort((a, b) => s(b["held_on"]).localeCompare(s(a["held_on"])))[0];
  return r ? { held: true, reason: s(r["reason"]), by: s(r["held_by"]), on: s(r["held_on"]).slice(0, 16), record: r.name } : { held: false, reason: "", by: "", on: "" };
}
export function holdDocument(dt: string, name: string, reason: string, user = currentUser()): { ok: boolean; error?: Bi; name?: string } {
  const doc = adapter.get(dt, name); const m = cachedMeta(dt);
  if (!doc || doc["__islocal"]) return { ok: false, error: ["Save the document first.", "احفظ المستند أولًا."] };
  if (!reason.trim()) return { ok: false, error: ["Give the reason for the hold.", "اذكر سبب الإيقاف."] };
  if (m && !hasPerm(m, "write", doc, user) && !hasPerm(m, "submit", doc, user)) return { ok: false, error: ["You may not hold this document.", "لا يحق لك إيقاف هذا المستند."] };
  if (holdState(dt, doc).held) return { ok: false, error: ["The document is already on hold.", "المستند موقوف بالفعل."] };
  const r = adapter.insertDoc(CORE_DT.docHold, { reference_doctype: dt, reference_name: name, company: s(doc["company"]), reason: reason.trim(), status: "Held", held_by: user, held_on: nowIso() });
  adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: dt, reference_name: name, content: `On hold: ${reason.trim()}`, comment_email: user, owner: user });
  return { ok: true, name: r.name };
}
export function releaseDocument(dt: string, name: string, note: string, user = currentUser()): { ok: boolean; error?: Bi } {
  const doc = adapter.get(dt, name); if (!doc) return { ok: false, error: ["Document not found.", "المستند غير موجود."] };
  const h = holdState(dt, doc); if (!h.held || !h.record) return { ok: false, error: ["The document is not on hold.", "المستند غير موقوف."] };
  adapter.update(CORE_DT.docHold, h.record, { status: "Released", released_by: user, released_on: nowIso(), release_note: note.trim() });
  adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: dt, reference_name: name, content: `Released from hold${note.trim() ? `: ${note.trim()}` : ""}`, comment_email: user, owner: user });
  return { ok: true };
}
/** Documents that can repeat on a schedule (native Auto Repeat): the Finance desk list plus any DocType flagged allow_auto_repeat. */
/** Eligible where the source DocType carries its native `auto_repeat` link (frappe allow_auto_repeat adds it), so repeat follows source. */
export const canRepeat = (meta: DocTypeMeta) => meta.fields.some((f) => f.fieldname === "auto_repeat") || !!n((meta as { allow_auto_repeat?: unknown }).allow_auto_repeat);
export const repeatOf = (dt: string, name: string) => adapter.list("Auto Repeat").find((a) => a["reference_doctype"] === dt && a["reference_document"] === name && !n(a["disabled"]) && s(a["status"]) !== "Completed");

/* ------------------------------------------------------------------ the five order axes (order / reservation / delivery or receipt / invoicing / payment) ------------------------------------------------------------------ */
export interface FrameAxis { key: "order" | "reservation" | "fulfilment" | "billing" | "payment"; label: Bi; pct: number | null; state: Bi }
/** Stock reserved for a sales order (Stock Reservation Entry), or for the sales orders a purchase order supplies. */
export function reservationAxis(dt: string, doc: Doc): FrameAxis {
  const rows = (doc["items"] as Doc[] | undefined) ?? [];
  const want = rows.reduce((a, r) => a + n(r["stock_qty"] ?? r["qty"]), 0);
  const sre = adapter.list("Stock Reservation Entry").filter((e) => n(e.docstatus) === 1 && s(e["status"]) !== "Cancelled");
  const mine = dt === "Sales Order" ? sre.filter((e) => e["voucher_no"] === doc.name)
    : sre.filter((e) => e["from_voucher_no"] === doc.name || rows.some((r) => r["sales_order"] && e["voucher_no"] === r["sales_order"]));
  const got = mine.reduce((a, e) => a + n(e["reserved_qty"]) - n(e["delivered_qty"]), 0);
  if (!mine.length) return { key: "reservation", label: ["Reservation", "الحجز"], pct: null, state: dt === "Sales Order" ? ["No stock reserved", "لا مخزون محجوز"] : ["Not reserved for a sales order", "غير محجوز لأمر بيع"] };
  const pct = want > 0 ? Math.min(100, Math.round((got / want) * 100)) : 0;
  return { key: "reservation", label: ["Reservation", "الحجز"], pct, state: pct >= 100 ? ["Fully reserved", "محجوز بالكامل"] : [`${pct}% reserved`, `محجوز ${pct}%`] };
}
