/**
 * DIGIT shared Core operations for the Run11.1 department rows that need their own records (owner decision
 * 2026-11-11: built in the Core, every app points to them):
 *  - Approval templates by amount / branch / category and the approval path simulator (PL7, S5).
 *  - Procurement policies and catalogs on material requests and purchase orders (PU15) — enforced on submit.
 *  - Backorder decision on a partly delivered sales order (SL10, SEL-005): keep the remainder or close it.
 *  - Scan sessions for receive / put away / pick / pack / ship / count on a phone (IN5, INV-004/005/007), each
 *    completing into the native draft document (Purchase Receipt, Stock Entry, Delivery Note, Stock Reconciliation).
 *  - Dock appointments per warehouse door with overlap check and cross-dock flag (IN12, INV-006).
 *  - Customer quote acceptance: e-signature, prepayment request and conversion to a sales order (SL4, SEL-017).
 * Records are Core DocTypes (doctypes.ts); native documents are created as drafts the user reviews and submits.
 */
import { registerAssetControlHooks } from "./assetControls";
import { adapter, registerDocHook, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { mapDoc } from "@/lib/engines";
import { currentUser, hasPerm, userRoles } from "@/lib/session";
import { CORE_DT } from "./doctypes";
import { paymentBlock } from "./finance";
import { registerCustomerHoldHooks } from "./customerHold";
import { registerBlanketHooks } from "./blanketOrders";
import { registerReceivingHooks } from "./receiving";
import { registerReviewHooks } from "./review";
import { registerContractPriceHooks } from "./procurementFollowup";
import { registerBankMatchHooks } from "./bankControls";

export type Bi = [string, string];
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const rows = (d: Doc | undefined, f = "items") => (Array.isArray(d?.[f]) ? (d![f] as Doc[]) : []);
const can = (dt: string, p: "read" | "write" | "create" | "submit", user = currentUser(), d?: Doc) => { const m = cachedMeta(dt); return m ? hasPerm(m, p, d, user) : user === "Administrator"; };
const isAdmin = (u: string) => u === "Administrator" || userRoles(u).includes("System Manager");

/* ------------------------------------------------------------------ approval templates + path simulator (PL7, S5) ------------------------------------------------------------------ */
export const APPROVAL_DOCTYPES = ["Purchase Order", "Material Request", "Purchase Invoice", "Sales Order", "Quotation", "Journal Entry", "Payment Entry", "Expense Claim"];
export interface ApprovalStep { step: number; role: string; holders: string[] }
export interface ApprovalPath { template?: { name: string; title: string; why: Bi }; steps: ApprovalStep[]; considered: { name: string; title: string; match: boolean; reason: Bi }[] }
export interface ApprovalInput { doctype: string; company?: string; amount: number; branch?: string; category?: string[] }
const holders = (role: string) => adapter.list("User").filter((u) => !n(u["enabled"] ?? 1) ? false : rows(u, "roles").some((r) => r["role"] === role)).map((u) => u.name).sort();
/** Categories of a document: item groups of its lines, expense accounts and the supplier / customer group. */
export function docCategories(doctype: string, doc: Doc): string[] {
  const out = new Set<string>();
  for (const r of [...rows(doc), ...rows(doc, "accounts")]) {
    const it = s(r["item_code"]); const g = s(r["item_group"]) || s(adapter.get("Item", it)?.["item_group"]); if (g) out.add(g);
    if (s(r["expense_account"])) out.add(s(r["expense_account"])); if (doctype === "Journal Entry" && s(r["account"])) out.add(s(r["account"]));
  }
  const sg = s(adapter.get("Supplier", s(doc["supplier"]))?.["supplier_group"]); if (sg) out.add(sg);
  const cg = s(adapter.get("Customer", s(doc["customer"] || doc["party_name"]))?.["customer_group"]); if (cg) out.add(cg);
  return [...out];
}
export const docAmount = (doc: Doc) => n(doc["base_grand_total"] ?? doc["grand_total"]) || n(doc["total_debit"]) || n(doc["paid_amount"]) || rows(doc).reduce((t, r) => t + (n(r["amount"]) || n(r["qty"]) * n(r["rate"])), 0);
/** The approval path a document of this type, amount, branch and category follows (first enabled template by priority, most specific first). */
export function approvalPath(inp: ApprovalInput): ApprovalPath {
  const considered: ApprovalPath["considered"] = [];
  const tpls = adapter.list(CORE_DT.approvalTemplate).filter((t) => t["document_type"] === inp.doctype && n(t["enabled"] ?? 1))
    .sort((a, b) => n(a["priority"] ?? 10) - n(b["priority"] ?? 10) || (Number(!!s(b["branch"])) + Number(!!s(b["category"]))) - (Number(!!s(a["branch"])) + Number(!!s(a["category"]))) || n(b["min_amount"]) - n(a["min_amount"]));
  let hit: Doc | undefined;
  for (const t of tpls) {
    const title = s(t["template_name"]) || t.name; const min = n(t["min_amount"]), max = n(t["max_amount"]);
    let reason: Bi | null = null;
    if (s(t["company"]) && inp.company && s(t["company"]) !== inp.company) reason = ["Another company", "شركة أخرى"];
    else if (inp.amount < min) reason = [`Below ${min.toLocaleString("en-US")}`, `أقل من ${min.toLocaleString("en-US")}`];
    else if (max > 0 && inp.amount > max) reason = [`Above ${max.toLocaleString("en-US")}`, `أعلى من ${max.toLocaleString("en-US")}`];
    else if (s(t["branch"]) && s(t["branch"]) !== s(inp.branch)) reason = [`Only branch ${s(t["branch"])}`, `للفرع ${s(t["branch"])} فقط`];
    else if (s(t["category"]) && !(inp.category ?? []).includes(s(t["category"]))) reason = [`Only category ${s(t["category"])}`, `للفئة ${s(t["category"])} فقط`];
    const match = !reason && !hit; if (match) hit = t;
    considered.push({ name: t.name, title, match, reason: reason ?? (match ? ["Applies", "ينطبق"] : ["A higher-priority template applies first", "قالب بأولوية أعلى ينطبق أولًا"]) });
  }
  if (!hit) return { steps: [], considered };
  const steps = ["step_1_role", "step_2_role", "step_3_role"].map((f, i) => ({ step: i + 1, role: s(hit![f]) })).filter((x) => x.role).map((x) => ({ ...x, holders: holders(x.role) }));
  const parts: string[] = [`${inp.doctype}`, `${n(hit["min_amount"]).toLocaleString("en-US")}–${n(hit["max_amount"]) ? n(hit["max_amount"]).toLocaleString("en-US") : "∞"}`]; if (s(hit["branch"])) parts.push(s(hit["branch"])); if (s(hit["category"])) parts.push(s(hit["category"]));
  return { template: { name: hit.name, title: s(hit["template_name"]) || hit.name, why: [`Matches ${parts.join(" · ")}`, `يطابق ${parts.join(" · ")}`] }, steps, considered };
}
export const approvalPathFor = (doctype: string, doc: Doc) => approvalPath({ doctype, company: s(doc["company"]), amount: docAmount(doc), branch: s(doc["branch"]), category: docCategories(doctype, doc) });

/* ------------------------------------------------------------------ procurement policies and catalogs (PU15) ------------------------------------------------------------------ */
export type PolicyVerdict = "ok" | "warn" | "blocked";
export interface PolicyLine { idx: number; item: string; itemGroup: string; policy?: string; rule: string; verdict: PolicyVerdict; reason: Bi }
function groupChain(g: string): string[] { const out: string[] = []; let cur = g; for (let i = 0; cur && i < 12; i++) { out.push(cur); cur = s(adapter.get("Item Group", cur)?.["parent_item_group"]); } return out; }
const catalogRate = (item: string, priceList: string) => n(adapter.list("Item Price").find((p) => p["item_code"] === item && p["price_list"] === priceList)?.["price_list_rate"]);
/** Each line of a material request / purchase order checked against the company's procurement policies (nearest item group wins). */
export function procurementCheck(doctype: string, doc: Doc): { lines: PolicyLine[]; blocked: boolean } {
  const pols = adapter.list(CORE_DT.procurementPolicy).filter((p) => n(p["enabled"] ?? 1) && (!s(p["company"]) || s(p["company"]) === s(doc["company"])) && (!s(p["department"]) || s(p["department"]) === s(doc["department"])));
  const lines = rows(doc).map((r, i): PolicyLine => {
    const item = s(r["item_code"]); const ig = s(r["item_group"]) || s(adapter.get("Item", item)?.["item_group"]); const chain = groupChain(ig);
    const pol = chain.map((g) => pols.find((p) => s(p["item_group"]) === g)).find(Boolean);
    const base = { idx: n(r["idx"]) || i + 1, item, itemGroup: ig };
    if (!pol) return { ...base, rule: "", verdict: "ok", reason: ["No policy for this item group", "لا سياسة لهذه المجموعة"] };
    const rule = s(pol["rule"]); const why = s(pol["reason"]); const amt = n(r["amount"]) || n(r["qty"]) * n(r["rate"]);
    const P = { ...base, policy: s(pol["policy_name"]) || pol.name, rule };
    if (rule === "Blocked") return { ...P, verdict: "blocked", reason: [`Purchasing ${ig} is blocked${why ? ` — ${why}` : ""}`, `شراء ${ig} محظور${why ? ` — ${why}` : ""}`] };
    if (n(pol["max_amount"]) > 0 && amt > n(pol["max_amount"])) return { ...P, verdict: "blocked", reason: [`Line amount ${r2(amt)} is above the policy limit ${n(pol["max_amount"])}`, `مبلغ السطر ${r2(amt)} أعلى من حد السياسة ${n(pol["max_amount"])}`] };
    const notes: Bi[] = [];
    const want = s(pol["supplier"]);
    if (want && (rule === "Preferred supplier only" || rule === "Catalog price only")) {
      const have = doctype === "Purchase Order" ? s(doc["supplier"]) : "";
      if (doctype === "Material Request") return { ...P, verdict: "warn", reason: [`Must be ordered from ${want}${s(pol["price_list"]) ? ` at the ${s(pol["price_list"])} catalog price` : ""}`, `يُطلب من المورد ${want} فقط${s(pol["price_list"]) ? ` بسعر كتالوج ${s(pol["price_list"])}` : ""}`] };
      if (have && have !== want) return { ...P, verdict: "blocked", reason: [`Only ${want} may supply ${ig}`, `لا يورد ${ig} إلا ${want}`] };
      notes.push([`Preferred supplier ${want}`, `المورد المفضل ${want}`]);
    }
    if (s(pol["price_list"]) && (rule === "Catalog price only" || rule === "Preferred supplier only")) {
      const cat = catalogRate(item, s(pol["price_list"]));
      if (!cat) return { ...P, verdict: "blocked", reason: [`${item} is not in the catalog ${s(pol["price_list"])}`, `${item} غير موجود في الكتالوج ${s(pol["price_list"])}`] };
      if (doctype === "Purchase Order" && Math.abs(n(r["rate"]) - cat) > 0.005) return { ...P, verdict: "blocked", reason: [`Rate ${n(r["rate"])} differs from the catalog price ${cat}`, `السعر ${n(r["rate"])} يختلف عن سعر الكتالوج ${cat}`] };
      notes.push([`Catalog price ${cat}`, `سعر الكتالوج ${cat}`]);
    }
    if (notes.length) return { ...P, verdict: "ok", reason: [notes.map((x) => x[0]).join(" · "), notes.map((x) => x[1]).join(" · ")] };
    return { ...P, verdict: "ok", reason: ["Allowed", "مسموح"] };
  });
  return { lines, blocked: lines.some((l) => l.verdict === "blocked") };
}

/* ------------------------------------------------------------------ backorder decision (SL10, SEL-005) ------------------------------------------------------------------ */
export interface BackorderState { open: boolean; remaining: { item: string; ordered: number; delivered: number; left: number }[]; leftQty: number; decision?: Doc }
export function backorderState(so: Doc): BackorderState {
  const remaining = rows(so).map((r) => ({ item: s(r["item_code"]), ordered: n(r["qty"]), delivered: n(r["delivered_qty"]), left: r2(Math.max(0, n(r["qty"]) - n(r["delivered_qty"]))) })).filter((x) => x.left > 0);
  const decision = adapter.list(CORE_DT.backorderDecision).filter((d) => d["sales_order"] === so.name).sort((a, b) => s(b["decided_on"]).localeCompare(s(a["decided_on"])) || b.name.localeCompare(a.name))[0];
  const partly = n(so["per_delivered"]) > 0 && n(so["per_delivered"]) < 100;
  return { open: n(so.docstatus) === 1 && partly && s(so["status"]) !== "Closed" && !decision, remaining, leftQty: r2(remaining.reduce((t, x) => t + x.left, 0)), ...(decision ? { decision } : {}) };
}
export function decideBackorder(soName: string, decision: "Keep remainder as backorder" | "Close the remainder", reason: string, user = currentUser()): { ok: true; name: string } | { ok: false; reason: Bi } {
  const so = adapter.get("Sales Order", soName); if (!so) return { ok: false, reason: ["Sales order not found", "أمر البيع غير موجود"] };
  if (!can(CORE_DT.backorderDecision, "create", user)) return { ok: false, reason: ["You may not decide backorders.", "لا يحق لك تقرير الطلبات المتأخرة."] };
  const st = backorderState(so); if (!st.open) return { ok: false, reason: ["This order has no undecided remainder.", "لا يوجد متبقٍ ينتظر القرار في هذا الأمر."] };
  if (decision === "Close the remainder" && !reason.trim()) return { ok: false, reason: ["Give the reason for closing the remainder.", "اذكر سبب إقفال المتبقي."] };
  const delivery = adapter.list("Delivery Note").filter((d) => n(d.docstatus) === 1 && rows(d).some((r) => r["against_sales_order"] === soName)).sort((a, b) => s(b["posting_date"]).localeCompare(s(a["posting_date"])))[0];
  const d = adapter.insertDoc(CORE_DT.backorderDecision, { company: s(so["company"]), sales_order: soName, delivery_note: delivery?.name ?? "", decision, remaining_qty: st.leftQty, decided_by: user, decided_on: today(), reason });
  if (decision === "Close the remainder") adapter.update("Sales Order", soName, { status: "Closed" });
  return { ok: true, name: d.name };
}

/* ------------------------------------------------------------------ scan sessions (IN5, INV-004/005/007) ------------------------------------------------------------------ */
export const SCAN_MODES = ["Receive", "Put away", "Pick", "Pack", "Ship", "Count"] as const;
export type ScanMode = (typeof SCAN_MODES)[number];
export const SCAN_MODE_LABEL: Record<ScanMode, Bi> = { Receive: ["Receive", "استلام"], "Put away": ["Put away", "تخزين"], Pick: ["Pick", "التقاط"], Pack: ["Pack", "تغليف"], Ship: ["Ship", "شحن"], Count: ["Count", "جرد"] };
export const SCAN_AGAINST: Record<ScanMode, string> = { Receive: "Purchase Order", "Put away": "Purchase Receipt", Pick: "Pick List", Pack: "Sales Order", Ship: "Sales Order", Count: "" };
export const SCAN_RESULT: Record<ScanMode, string> = { Receive: "Purchase Receipt", "Put away": "Stock Entry", Pick: "Delivery Note", Pack: "Delivery Note", Ship: "Delivery Note", Count: "Stock Reconciliation" };
export interface Resolved { item: string; batch?: string; serial?: string; via: "barcode" | "item" | "batch" | "serial" }
/** Barcode → item (Item Barcode rows, item code, Batch or Serial No). */
export function resolveCode(code: string): Resolved | null {
  const c = code.trim(); if (!c) return null;
  const byBarcode = adapter.list("Item").find((i) => rows(i, "barcodes").some((b) => s(b["barcode"]) === c)); if (byBarcode) return { item: byBarcode.name, via: "barcode" };
  if (adapter.get("Item", c)) return { item: c, via: "item" };
  const b = adapter.get("Batch", c); if (b && s(b["item"])) return { item: s(b["item"]), batch: c, via: "batch" };
  const sn = adapter.get("Serial No", c); if (sn && s(sn["item_code"])) return { item: s(sn["item_code"]), serial: c, via: "serial" };
  return null;
}
export interface Expected { item: string; qty: number; warehouse: string; rowName?: string }
/** What the reference document still expects (open quantity per line). */
export function expectedLines(mode: ScanMode, refDt: string, refName: string): Expected[] {
  const d = refDt && refName ? adapter.get(refDt, refName) : undefined; if (!d) return [];
  if (refDt === "Purchase Order") return rows(d).map((r) => ({ item: s(r["item_code"]), qty: r2(n(r["qty"]) - n(r["received_qty"])), warehouse: s(r["warehouse"]), rowName: s(r["name"]) })).filter((x) => x.qty > 0);
  if (refDt === "Sales Order") return rows(d).map((r) => ({ item: s(r["item_code"]), qty: r2(n(r["qty"]) - n(r["delivered_qty"])), warehouse: s(r["warehouse"]), rowName: s(r["name"]) })).filter((x) => x.qty > 0);
  if (refDt === "Pick List") return rows(d, "locations").map((r) => ({ item: s(r["item_code"]), qty: n(r["qty"]), warehouse: s(r["warehouse"]), rowName: s(r["sales_order_item"]) }));
  if (refDt === "Purchase Receipt") return rows(d).map((r) => ({ item: s(r["item_code"]), qty: n(r["qty"]), warehouse: s(r["warehouse"]) }));
  void mode; return [];
}
export function startScan(mode: ScanMode, company: string, warehouse: string, ref?: { doctype: string; name: string }, user = currentUser()): { ok: true; name: string } | { ok: false; reason: Bi } {
  if (!can(CORE_DT.scanSession, "create", user)) return { ok: false, reason: ["You may not scan stock.", "لا يحق لك مسح المخزون."] };
  if (!warehouse) return { ok: false, reason: ["Choose the warehouse.", "اختر المستودع."] };
  if (SCAN_AGAINST[mode] && !ref?.name) return { ok: false, reason: [`Choose the ${SCAN_AGAINST[mode]} to scan against.`, `اختر المستند الذي يتم المسح مقابله.`] };
  const d = adapter.insertDoc(CORE_DT.scanSession, { mode, company, warehouse, reference_doctype: ref?.doctype ?? "", reference_name: ref?.name ?? "", status: "Open", scanned_by: user, lines: [] });
  return { ok: true, name: d.name };
}
export function addScan(session: string, code: string, qty = 1, opts: { warehouse?: string; lpn?: string } = {}): { ok: true; item: string; total: number; over: boolean } | { ok: false; reason: Bi } {
  const ss = adapter.get(CORE_DT.scanSession, session); if (!ss || ss["status"] !== "Open") return { ok: false, reason: ["The scan session is closed.", "جلسة المسح مغلقة."] };
  const res = resolveCode(code); if (!res) return { ok: false, reason: [`Unknown barcode ${code}`, `رمز غير معروف ${code}`] };
  if (!(qty > 0)) return { ok: false, reason: ["Quantity must be above zero.", "يجب أن تكون الكمية أكبر من صفر."] };
  const mode = s(ss["mode"]) as ScanMode; const exp = expectedLines(mode, s(ss["reference_doctype"]), s(ss["reference_name"]));
  if (exp.length && !exp.some((e) => e.item === res.item)) return { ok: false, reason: [`${res.item} is not on ${s(ss["reference_name"])}`, `${res.item} ليس ضمن ${s(ss["reference_name"])}`] };
  const wh = opts.warehouse || s(ss["warehouse"]); const lines: Record<string, unknown>[] = rows(ss, "lines").map((l) => ({ ...l }));
  const hit = lines.find((l) => l["item_code"] === res.item && s(l["batch_no"]) === s(res.batch) && s(l["warehouse"]) === wh && s(l["lpn"]) === s(opts.lpn) && !res.serial);
  if (hit) hit["qty"] = r2(n(hit["qty"]) + qty);
  else lines.push({ idx: lines.length + 1, barcode: code, item_code: res.item, qty: res.serial ? 1 : qty, warehouse: wh, batch_no: res.batch ?? "", serial_no: res.serial ?? "", lpn: opts.lpn ?? "" });
  adapter.update(CORE_DT.scanSession, session, { lines });
  const total = r2(lines.filter((l) => l["item_code"] === res.item).reduce((t, l) => t + n(l["qty"]), 0));
  const want = exp.filter((e) => e.item === res.item).reduce((t, e) => t + e.qty, 0);
  return { ok: true, item: res.item, total, over: exp.length > 0 && total > want + 0.0001 };
}
export function scanProgress(session: string): { item: string; expected: number; scanned: number }[] {
  const ss = adapter.get(CORE_DT.scanSession, session); if (!ss) return [];
  const exp = expectedLines(s(ss["mode"]) as ScanMode, s(ss["reference_doctype"]), s(ss["reference_name"]));
  const got = new Map<string, number>(); for (const l of rows(ss, "lines")) got.set(s(l["item_code"]), (got.get(s(l["item_code"])) ?? 0) + n(l["qty"]));
  const items = [...new Set([...exp.map((e) => e.item), ...got.keys()])];
  return items.map((item) => ({ item, expected: r2(exp.filter((e) => e.item === item).reduce((t, e) => t + e.qty, 0)), scanned: r2(got.get(item) ?? 0) }));
}
const itemRow = (item: string) => { const it = adapter.get("Item", item); return { item_code: item, item_name: s(it?.["item_name"]) || item, uom: s(it?.["stock_uom"]) || "Nos", stock_uom: s(it?.["stock_uom"]) || "Nos", conversion_factor: 1 }; };
/** Complete the session into its native draft document (the user reviews and submits it). */
export function completeScan(session: string, user = currentUser()): { ok: true; doctype: string; name: string } | { ok: false; reason: Bi } {
  const ss = adapter.get(CORE_DT.scanSession, session); if (!ss || ss["status"] !== "Open") return { ok: false, reason: ["The scan session is closed.", "جلسة المسح مغلقة."] };
  const lines = rows(ss, "lines"); if (!lines.length) return { ok: false, reason: ["Scan at least one item.", "امسح صنفًا واحدًا على الأقل."] };
  const mode = s(ss["mode"]) as ScanMode; const target = SCAN_RESULT[mode]; if (!can(target, "create", user)) return { ok: false, reason: [`You may not create ${target}.`, `لا يحق لك إنشاء ${target}.`] };
  const company = s(ss["company"]); const refDt = s(ss["reference_doctype"]); const refName = s(ss["reference_name"]); const ref = refDt && refName ? adapter.get(refDt, refName) : undefined;
  const date = today(); let values: Record<string, unknown>;
  const rate = (item: string, r?: Doc) => n(r?.["rate"]) || n(adapter.get("Item", item)?.["valuation_rate"]) || n(adapter.get("Item", item)?.["standard_rate"]);
  if (target === "Purchase Receipt") {
    const poRows = rows(ref);
    values = { company, supplier: s(ref?.["supplier"]), supplier_name: s(ref?.["supplier_name"]), posting_date: date, set_warehouse: s(ss["warehouse"]), currency: s(ref?.["currency"]) || "SAR", conversion_rate: 1, buying_price_list: s(ref?.["buying_price_list"]),
      items: lines.map((l, i) => { const pr = poRows.find((r) => r["item_code"] === l["item_code"]); const q = n(l["qty"]); return { idx: i + 1, ...itemRow(s(l["item_code"])), qty: q, received_qty: q, stock_qty: q, rate: rate(s(l["item_code"]), pr), amount: r2(q * rate(s(l["item_code"]), pr)), warehouse: s(l["warehouse"]) || s(ss["warehouse"]), batch_no: s(l["batch_no"]), serial_no: s(l["serial_no"]), purchase_order: refName, purchase_order_item: s(pr?.["name"]) }; }) };
  } else if (target === "Delivery Note") {
    const so = refDt === "Pick List" ? adapter.get("Sales Order", s(rows(ref, "locations")[0]?.["sales_order"])) : ref; const soRows = rows(so);
    values = { company, customer: s(so?.["customer"] ?? ref?.["customer"]), customer_name: s(so?.["customer_name"]), posting_date: date, set_warehouse: s(ss["warehouse"]), currency: s(so?.["currency"]) || "SAR", conversion_rate: 1, selling_price_list: s(so?.["selling_price_list"]), ...(refDt === "Pick List" ? { pick_list: refName } : {}),
      items: lines.map((l, i) => { const sr = soRows.find((r) => r["item_code"] === l["item_code"]); const q = n(l["qty"]); return { idx: i + 1, ...itemRow(s(l["item_code"])), qty: q, stock_qty: q, rate: rate(s(l["item_code"]), sr), amount: r2(q * rate(s(l["item_code"]), sr)), warehouse: s(l["warehouse"]) || s(ss["warehouse"]), batch_no: s(l["batch_no"]), serial_no: s(l["serial_no"]), against_sales_order: so?.name ?? "", so_detail: s(sr?.["name"]) }; }) };
  } else if (target === "Stock Entry") {
    values = { company, purpose: "Material Transfer", stock_entry_type: "Material Transfer", posting_date: date, from_warehouse: s(ss["warehouse"]),
      items: lines.map((l, i) => ({ idx: i + 1, ...itemRow(s(l["item_code"])), qty: n(l["qty"]), transfer_qty: n(l["qty"]), s_warehouse: s(ss["warehouse"]), t_warehouse: s(l["warehouse"]) || s(ss["warehouse"]), batch_no: s(l["batch_no"]), serial_no: s(l["serial_no"]), basic_rate: rate(s(l["item_code"])) })) };
  } else {
    values = { company, purpose: "Stock Reconciliation", posting_date: date, posting_time: "12:00:00",
      items: lines.map((l, i) => ({ idx: i + 1, item_code: s(l["item_code"]), item_name: itemRow(s(l["item_code"])).item_name, warehouse: s(l["warehouse"]) || s(ss["warehouse"]), qty: n(l["qty"]), valuation_rate: rate(s(l["item_code"])), batch_no: s(l["batch_no"]), serial_no: s(l["serial_no"]) })) };
  }
  const d = adapter.insertDoc(target, { ...values, docstatus: 0, remarks: `From scan session ${session} (${mode})` });
  adapter.update(CORE_DT.scanSession, session, { status: "Completed", result_doctype: target, result_name: d.name });
  return { ok: true, doctype: target, name: d.name };
}

/* ------------------------------------------------------------------ dock appointments (IN12, INV-006) ------------------------------------------------------------------ */
export const DOCK_STATUS: Record<string, Bi> = { Booked: ["Booked", "محجوز"], Arrived: ["Arrived", "وصل"], Done: ["Done", "منجز"], Missed: ["Missed", "فائت"], Cancelled: ["Cancelled", "ملغى"] };
export const DEFAULT_DOCKS = ["Door 1", "Door 2", "Door 3"];
export function docksOf(warehouse: string): string[] { return [...new Set([...DEFAULT_DOCKS, ...adapter.list(CORE_DT.dockAppointment).filter((a) => a["warehouse"] === warehouse).map((a) => s(a["dock"]))])].filter(Boolean).sort(); }
export function dockDay(warehouse: string, date: string): { dock: string; slots: Doc[] }[] {
  const appts = adapter.list(CORE_DT.dockAppointment).filter((a) => a["warehouse"] === warehouse && s(a["slot_start"]).slice(0, 10) === date && a["status"] !== "Cancelled");
  return docksOf(warehouse).map((dock) => ({ dock, slots: appts.filter((a) => a["dock"] === dock).sort((a, b) => s(a["slot_start"]).localeCompare(s(b["slot_start"]))) }));
}
export interface DockInput { company: string; warehouse: string; dock: string; direction: "Inbound" | "Outbound"; start: string; end: string; carrier: string; ref?: { doctype: string; name: string }; crossDock?: boolean }
const norm = (t: string) => t.replace("T", " ").slice(0, 16);
export function bookDock(inp: DockInput, user = currentUser()): { ok: true; name: string } | { ok: false; reason: Bi } {
  if (!can(CORE_DT.dockAppointment, "create", user)) return { ok: false, reason: ["You may not book dock slots.", "لا يحق لك حجز مواعيد الرصيف."] };
  const a = norm(inp.start), b = norm(inp.end);
  if (!inp.warehouse || !inp.dock) return { ok: false, reason: ["Choose the warehouse and the door.", "اختر المستودع والباب."] };
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(b) || b <= a) return { ok: false, reason: ["The slot must end after it starts.", "يجب أن ينتهي الموعد بعد بدايته."] };
  const clash = adapter.list(CORE_DT.dockAppointment).find((x) => x["warehouse"] === inp.warehouse && x["dock"] === inp.dock && !["Cancelled", "Missed", "Done"].includes(s(x["status"])) && norm(s(x["slot_start"])) < b && norm(s(x["slot_end"])) > a);
  if (clash) return { ok: false, reason: [`${inp.dock} is already booked ${norm(s(clash["slot_start"])).slice(11)}–${norm(s(clash["slot_end"])).slice(11)} (${s(clash["carrier"])})`, `${inp.dock} محجوز ${norm(s(clash["slot_start"])).slice(11)}–${norm(s(clash["slot_end"])).slice(11)} (${s(clash["carrier"])})`] };
  const d = adapter.insertDoc(CORE_DT.dockAppointment, { company: inp.company, warehouse: inp.warehouse, dock: inp.dock, direction: inp.direction, slot_start: `${a}:00`, slot_end: `${b}:00`, carrier: inp.carrier, reference_doctype: inp.ref?.doctype ?? "", reference_name: inp.ref?.name ?? "", status: "Booked", cross_dock: inp.crossDock ? 1 : 0 });
  return { ok: true, name: d.name };
}
export function setDockStatus(name: string, status: "Arrived" | "Done" | "Missed" | "Cancelled", user = currentUser()): { ok: true } | { ok: false; reason: Bi } {
  const a = adapter.get(CORE_DT.dockAppointment, name); if (!a) return { ok: false, reason: ["Appointment not found", "الموعد غير موجود"] };
  if (!can(CORE_DT.dockAppointment, "write", user, a)) return { ok: false, reason: ["You may not change dock appointments.", "لا يحق لك تعديل مواعيد الرصيف."] };
  const from = s(a["status"]); const ok: Record<string, string[]> = { Booked: ["Arrived", "Missed", "Cancelled"], Arrived: ["Done"], Done: [], Missed: [], Cancelled: [] };
  if (!(ok[from] ?? []).includes(status)) return { ok: false, reason: [`A ${from} appointment cannot become ${status}.`, `لا يتحول الموعد من ${DOCK_STATUS[from]?.[1] ?? from} إلى ${DOCK_STATUS[status]?.[1] ?? status}.`] };
  adapter.update(CORE_DT.dockAppointment, name, { status });
  return { ok: true };
}

/* ------------------------------------------------------------------ quote acceptance: e-sign, prepayment, convert (SL4, SEL-017) ------------------------------------------------------------------ */
export const acceptanceOf = (quotation: string) => adapter.list(CORE_DT.quoteAcceptance).filter((a) => a["quotation"] === quotation).sort((a, b) => s(b["signed_on"]).localeCompare(s(a["signed_on"])))[0];
export function acceptQuote(quotation: string, signer: string, signature: string, prepayPct: number, user = currentUser(), now = new Date().toISOString().replace("T", " ").slice(0, 19)): { ok: true; name: string } | { ok: false; reason: Bi } {
  const q = adapter.get("Quotation", quotation); if (!q) return { ok: false, reason: ["Quotation not found", "العرض غير موجود"] };
  if (!can(CORE_DT.quoteAcceptance, "create", user)) return { ok: false, reason: ["You may not record a customer acceptance.", "لا يحق لك تسجيل قبول العميل."] };
  if (n(q.docstatus) !== 1 || ["Lost", "Ordered", "Cancelled", "Expired"].includes(s(q["status"]))) return { ok: false, reason: ["Only an open, submitted quotation can be accepted.", "يُقبل العرض المعتمد المفتوح فقط."] };
  if (s(q["valid_till"]) && s(q["valid_till"]) < now.slice(0, 10)) return { ok: false, reason: [`The quotation expired on ${s(q["valid_till"])}.`, `انتهت صلاحية العرض في ${s(q["valid_till"])}.`] };
  if (acceptanceOf(quotation)) return { ok: false, reason: ["The customer already accepted this quotation.", "قبل العميل هذا العرض مسبقًا."] };
  if (!signer.trim() || !signature.trim()) return { ok: false, reason: ["Enter the signer's name and signature.", "أدخل اسم الموقّع وتوقيعه."] };
  if (prepayPct < 0 || prepayPct > 100) return { ok: false, reason: ["Prepayment must be between 0 and 100%.", "يجب أن تكون الدفعة المقدمة بين 0 و100%."] };
  const d = adapter.insertDoc(CORE_DT.quoteAcceptance, { quotation, company: s(q["company"]), signer_name: signer.trim(), signed_on: now, signature, prepay_pct: prepayPct, status: "Signed" });
  return { ok: true, name: d.name };
}
/** Convert an accepted quotation to a draft sales order (native Quotation → Sales Order mapping) and, with a prepayment, a draft payment request. */
export function convertAccepted(acceptance: string, user = currentUser()): { ok: true; salesOrder: string; paymentRequest?: string } | { ok: false; reason: Bi } {
  const acc = adapter.get(CORE_DT.quoteAcceptance, acceptance); if (!acc || s(acc["status"]) === "Converted") return { ok: false, reason: ["Nothing to convert.", "لا يوجد ما يُحوَّل."] };
  if (!can("Sales Order", "create", user)) return { ok: false, reason: ["You may not create sales orders.", "لا يحق لك إنشاء أوامر البيع."] };
  const q = adapter.get("Quotation", s(acc["quotation"])); const sm = cachedMeta("Quotation"), tm = cachedMeta("Sales Order");
  if (!q || !sm || !tm) return { ok: false, reason: ["The quotation or order definition is not loaded yet.", "تعريف العرض أو الأمر لم يُحمّل بعد."] };
  const cms: Record<string, NonNullable<ReturnType<typeof cachedMeta>>> = {}; for (const c of ["Quotation Item", "Sales Order Item", "Sales Taxes and Charges", "Payment Schedule"]) { const m = cachedMeta(c); if (m) cms[c] = m; }
  const mapped = mapDoc(sm, q, tm, cms);
  const items = rows(q).map((r, i) => ({ ...(rows(mapped as Doc)[i] ?? {}), item_code: r["item_code"], item_name: r["item_name"], qty: r["qty"], rate: r["rate"], amount: r["amount"], uom: r["uom"], stock_uom: r["stock_uom"], conversion_factor: r["conversion_factor"] ?? 1, warehouse: r["warehouse"] ?? "", prevdoc_docname: q.name, quotation_item: r["name"] ?? "", delivery_date: s(q["valid_till"]) || today(), idx: i + 1 }));
  const so = adapter.insertDoc("Sales Order", { ...mapped, customer: s(q["party_name"]), customer_name: s(q["customer_name"] || q["party_name"]), company: s(q["company"]), transaction_date: today(), delivery_date: s(q["valid_till"]) || today(), items, docstatus: 0, status: "Draft", po_no: `Accepted by ${s(acc["signer_name"])}` });
  let pr: string | undefined;
  if (n(acc["prepay_pct"]) > 0) {
    const amt = r2(n(q["grand_total"]) * n(acc["prepay_pct"]) / 100);
    pr = adapter.insertDoc("Payment Request", { payment_request_type: "Inward", transaction_date: today(), company: s(q["company"]), party_type: "Customer", party: s(q["party_name"]), reference_doctype: "Sales Order", reference_name: so.name, grand_total: amt, currency: s(q["currency"]) || "SAR", status: "Draft", docstatus: 0, subject: `Prepayment ${n(acc["prepay_pct"])}% for ${q.name}`, message: `Prepayment of ${amt.toFixed(2)} for quotation ${q.name}` }).name;
  }
  adapter.update(CORE_DT.quoteAcceptance, acceptance, { status: pr ? "Prepaid" : "Converted", sales_order: so.name, ...(pr ? { payment_request: pr } : {}) });
  return { ok: true, salesOrder: so.name, ...(pr ? { paymentRequest: pr } : {}) };
}

/* ------------------------------------------------------------------ submit-time enforcement ------------------------------------------------------------------ */
let hooked = false;
/** Procurement policy blocks submit of a material request / purchase order with a blocked line (registered once from seed). */
export function registerOperationHooks() {
  if (hooked) return; hooked = true;
  registerCustomerHoldHooks(); registerBlanketHooks(); registerReceivingHooks(); registerReviewHooks(); registerContractPriceHooks(); registerBankMatchHooks(); registerAssetControlHooks();
  for (const dt of ["Purchase Order", "Material Request"]) registerDocHook(dt, (doc, before) => {
    if (n(doc.docstatus) !== 1 || n(before?.docstatus) === 1) return { doc };
    const chk = procurementCheck(dt, doc); const bad = chk.lines.filter((l) => l.verdict === "blocked");
    return bad.length ? { doc, errors: bad.map((l) => `Row ${l.idx} ${l.item}: ${l.reason[0]}`) } : { doc };
  });
  /* "do not pay": a supplier payment cannot settle an invoice held by the three-way match or an open dispute (PU8) */
  registerDocHook("Payment Entry", (doc, before) => {
    if (n(doc.docstatus) !== 1 || n(before?.docstatus) === 1 || doc["payment_type"] !== "Pay") return { doc };
    const errs: string[] = [];
    for (const r of rows(doc, "references").filter((x) => x["reference_doctype"] === "Purchase Invoice" && n(x["allocated_amount"]) > 0)) {
      const pi = adapter.get("Purchase Invoice", s(r["reference_name"])); const hold = pi ? paymentBlock(pi, s(doc["posting_date"]) || today()) : null;
      if (hold) errs.push(`${pi!.name}: ${hold[0]}`);
    }
    return errs.length ? { doc, errors: errs } : { doc };
  });
}
export { isAdmin };
