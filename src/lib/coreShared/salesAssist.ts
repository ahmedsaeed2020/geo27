/**
 * DIGIT shared Core sales assistance (Part B: CF-02 sales inbox → quotation, CF-04 substitute item advisor, CF-05 assisted
 * line composer). All suggestions are deterministic and explained (no model): the inbox reads a customer's request for the
 * customer and the items/quantities it names; the advisor offers the native Item Alternatives that have stock where the
 * line is short; the composer proposes lines from the customer's own history and items bought together. A person confirms
 * every change, which goes through the shared document API (permissions, defaults, price rules, submit checks).
 */
import { ITEMS_AR } from "@/lib/seedNamesAr";
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { currentUser, hasPerm } from "@/lib/session";
import { qtyAt } from "@/lib/stock";
import { newChildRow, saveDocument } from "@/lib/documentApi";
import { CORE_DT } from "./doctypes";
import { dispatch } from "./providers";
import { newVoucher } from "./finance";

export type Bi = [string, string];
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc | undefined, f = "items") => (Array.isArray(d?.[f]) ? (d![f] as Doc[]) : []);
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, k: number) => new Date(Date.parse(d) + k * 864e5).toISOString().slice(0, 10);
const nowStamp = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const sellable = () => adapter.list("Item").filter((i) => !n(i["disabled"]) && !n(i["has_variants"]) && n(i["is_sales_item"] ?? 1));

/** Selling price of an item: the price list's Item Price, else the item's standard rate (get_item_details price_list_rate). */
export function sellingRate(item: string, priceList = ""): number {
  const ip = adapter.list("Item Price").filter((p) => s(p["item_code"]) === item && (!priceList || s(p["price_list"]) === priceList) && (n(p["selling"] ?? 1) || !priceList));
  return n(ip[0]?.["price_list_rate"]) || n(adapter.get("Item", item)?.["standard_rate"]);
}
const defaultPriceList = () => s(adapter.get("Selling Settings", "Selling Settings")?.["selling_price_list"]) || "Standard Selling";

/* ------------------------------------------------------------------ CF-02 sales inbox ------------------------------------------------------------------ */
export interface RequestLine { item: string; itemName: string; qty: number; rate: number; why: Bi }
export interface ParsedRequest { customer: string; customerWhy: Bi | null; lines: RequestLine[] }
const customerByEmail = (email: string) => {
  const e = email.trim().toLowerCase(); if (!e) return "";
  const c = adapter.list("Customer").find((x) => s(x["email_id"]).toLowerCase() === e); if (c) return c.name;
  const contact = adapter.list("Contact").find((x) => s(x["email_id"]).toLowerCase() === e || rows(x, "email_ids").some((r) => s(r["email_id"]).toLowerCase() === e));
  const link = rows(contact, "links").find((l) => s(l["link_doctype"]) === "Customer"); return link ? s(link["link_name"]) : "";
};
const EN_ITEM: Record<string, string> = Object.fromEntries(Object.entries(ITEMS_AR).map(([en, ar]) => [ar, en]));
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Read a customer's request: who it is from (e-mail, then a customer name in the text) and each item it names with the quantity next to it. */
export function parseRequest(msg: Record<string, unknown>, priceList = defaultPriceList()): ParsedRequest {
  const text = `${s(msg["subject"])}\n${s(msg["body"])}`.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  let customer = s(msg["customer"]); let customerWhy: Bi | null = customer ? ["Set on the message", "محدد في الرسالة"] : null;
  if (!customer) { customer = customerByEmail(s(msg["from_email"])); if (customer) customerWhy = ["Sender e-mail belongs to this customer", "بريد المرسل يخص هذا العميل"]; }
  if (!customer) { const c = adapter.list("Customer").find((x) => { const nm = s(x["customer_name"]).trim(); return nm.length > 3 && text.toLowerCase().includes(nm.toLowerCase()); }); if (c) { customer = c.name; customerWhy = ["Customer name appears in the message", "اسم العميل مذكور في الرسالة"]; } }
  const lines: RequestLine[] = []; const seen = new Set<string>();
  for (const it of sellable()) {
    // a demo item renamed to its Arabic name (seedNamesAr) is still recognised by its English name in an English request
    const names = [it.name, s(it["item_name"]), EN_ITEM[s(it["item_name"])] ?? ""].filter((x) => x.length > 2);
    for (const nm of names) {
      const re = new RegExp(`(?:(\\d+(?:\\.\\d+)?)\\s*(?:x|×|pcs|units|وحدة|حبة|قطعة)?\\s*(?:of\\s+|من\\s+)?)?${esc(nm)}(?:\\s*[:\\-–]?\\s*(?:qty\\s*|الكمية\\s*)?(\\d+(?:\\.\\d+)?))?`, "i");
      const m = text.match(re); if (!m || seen.has(it.name)) continue;
      seen.add(it.name); const qty = n(m[1] ?? m[2]) || 1;
      lines.push({ item: it.name, itemName: s(it["item_name"]) || it.name, qty, rate: sellingRate(it.name, priceList), why: m[1] || m[2] ? [`"${nm}" with quantity ${qty}`, `«${nm}» بكمية ${qty}`] : [`"${nm}" named, quantity not given (1)`, `«${nm}» مذكور دون كمية (1)`] });
      break;
    }
  }
  return { customer, customerWhy, lines };
}
/** Record a customer request that arrived by e-mail (preview: pasted; the connected sales mailbox writes these). */
export function receiveMessage(m: { from_email: string; from_name?: string; subject: string; body: string; company: string }, user = currentUser()): { ok: true; name: string } | { ok: false; reason: Bi } {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.from_email.trim())) return { ok: false, reason: ["Enter the sender's e-mail address.", "أدخل بريد المرسل."] };
  if (!m.body.trim() || !m.subject.trim()) return { ok: false, reason: ["The subject and the message are required.", "الموضوع والرسالة مطلوبان."] };
  const meta = cachedMeta(CORE_DT.inboundMessage); if (meta && !hasPerm(meta, "create", undefined, user)) return { ok: false, reason: ["You may not record customer requests.", "لا يحق لك تسجيل طلبات العملاء."] };
  const d = adapter.insertDoc(CORE_DT.inboundMessage, { ...m, from_email: m.from_email.trim(), received_on: nowStamp(), status: "New", customer: customerByEmail(m.from_email), owner: user });
  return { ok: true, name: d.name };
}
export const inbox = (company: string) => adapter.list(CORE_DT.inboundMessage).filter((x) => !s(x["company"]) || s(x["company"]) === company).sort((a, b) => s(b["received_on"]).localeCompare(s(a["received_on"])));
/** Turn the request into a draft Quotation with the confirmed lines; the message keeps the link and the reply thread. */
export function quoteFromMessage(name: string, pick: { customer: string; lines: { item: string; qty: number; rate?: number }[] }, user = currentUser()): { ok: true; quotation: string } | { ok: false; reason: Bi } {
  const msg = adapter.get(CORE_DT.inboundMessage, name); if (!msg) return { ok: false, reason: ["Message not found.", "الرسالة غير موجودة."] };
  if (s(msg["status"]) !== "New") return { ok: false, reason: ["This request was already handled.", "عولج هذا الطلب بالفعل."] };
  if (!adapter.get("Customer", pick.customer)) return { ok: false, reason: ["Choose the customer.", "اختر العميل."] };
  const lines = pick.lines.filter((l) => adapter.get("Item", l.item) && l.qty > 0); if (!lines.length) return { ok: false, reason: ["Keep at least one line with a quantity.", "أبقِ سطرًا واحدًا على الأقل بكمية."] };
  const company = s(msg["company"]) || s(adapter.list("Company")[0]?.name); const pl = defaultPriceList();
  const items = lines.map((l, i) => { const it = adapter.get("Item", l.item)!; const rate = l.rate ?? sellingRate(l.item, pl); return { idx: i + 1, item_code: l.item, item_name: it["item_name"] ?? l.item, description: it["description"] ?? it["item_name"] ?? l.item, qty: l.qty, rate, amount: r2(rate * l.qty), uom: it["stock_uom"] ?? "Nos", stock_uom: it["stock_uom"] ?? "Nos", conversion_factor: 1, price_list_rate: rate }; });
  const r = newVoucher("Quotation", { quotation_to: "Customer", party_name: pick.customer, customer_name: adapter.get("Customer", pick.customer)?.["customer_name"] ?? pick.customer, company, transaction_date: today(), valid_till: addDays(today(), 30), order_type: "Sales", selling_price_list: pl, items }, { user });
  if (r.errors.length || !r.name) return { ok: false, reason: [r.errors.join("; "), r.errors.join("؛ ")] };
  adapter.update(CORE_DT.inboundMessage, name, { status: "Quoted", customer: pick.customer, quotation: r.name });
  adapter.insertDoc("Communication", { communication_type: "Communication", communication_medium: "Email", sent_or_received: "Received", subject: s(msg["subject"]), content: s(msg["body"]), sender: s(msg["from_email"]), reference_doctype: "Quotation", reference_name: r.name, communication_date: s(msg["received_on"]) || nowStamp() });
  dispatch("sales_inbox", { doctype: "Quotation", name: r.name, company }, { message: name, from: msg["from_email"] }, `${s(msg["from_email"])} → ${r.name}`);
  return { ok: true, quotation: r.name };
}
export function dismissMessage(name: string, reason: string, user = currentUser()): { ok: true } | { ok: false; reason: Bi } {
  const msg = adapter.get(CORE_DT.inboundMessage, name); if (!msg || s(msg["status"]) !== "New") return { ok: false, reason: ["Only a new request can be dismissed.", "لا يُستبعد إلا طلب جديد."] };
  if (!reason.trim()) return { ok: false, reason: ["Say why it is dismissed.", "اذكر سبب الاستبعاد."] };
  adapter.update(CORE_DT.inboundMessage, name, { status: "Dismissed", dismiss_reason: reason, modified_by: user }); return { ok: true };
}

/* ------------------------------------------------------------------ CF-04 substitutes ------------------------------------------------------------------ */
export interface Substitute { item: string; itemName: string; available: number; rate: number }
export interface ShortLine { idx: number; item: string; warehouse: string; qty: number; available: number; substitutes: Substitute[] }
const lineWarehouse = (d: Doc, r: Doc) => s(r["warehouse"]) || s(d["set_warehouse"]) || s(adapter.get("Stock Settings", "Stock Settings")?.["default_warehouse"]);
/** Item Alternative pairs of an item (two_way alternatives work both ways, item_alternative.py). */
export function alternativesOf(item: string): string[] {
  const out: string[] = [];
  for (const a of adapter.list("Item Alternative")) {
    if (s(a["item_code"]) === item) out.push(s(a["alternative_item_code"]));
    else if (n(a["two_way"]) && s(a["alternative_item_code"]) === item) out.push(s(a["item_code"]));
  }
  return [...new Set(out)].filter((x) => x && adapter.get("Item", x) && !n(adapter.get("Item", x)!["disabled"]));
}
/** Lines whose warehouse cannot cover the quantity, with alternatives that can (most stock first). */
export function shortLines(d: Doc): ShortLine[] {
  const date = s(d["delivery_date"] ?? d["transaction_date"] ?? d["posting_date"]) || "9999-12-31"; const pl = s(d["selling_price_list"]) || defaultPriceList();
  return rows(d).filter((r) => n(adapter.get("Item", s(r["item_code"]))?.["is_stock_item"])).map((r) => {
    const wh = lineWarehouse(d, r); const need = n(r["stock_qty"] ?? r["qty"]); const available = wh ? qtyAt(s(r["item_code"]), wh, date) : 0;
    const substitutes = available >= need ? [] : alternativesOf(s(r["item_code"])).map((x) => ({ item: x, itemName: s(adapter.get("Item", x)?.["item_name"]) || x, available: wh ? qtyAt(x, wh, date) : 0, rate: sellingRate(x, pl) })).filter((x) => x.available > 0).sort((a, b) => b.available - a.available);
    return { idx: n(r["idx"]), item: s(r["item_code"]), warehouse: wh, qty: need, available, substitutes };
  }).filter((l) => l.available < l.qty);
}
/** Replace a draft line's item by its alternative, keeping quantity and warehouse; the rate is the alternative's price. */
export function applySubstitute(doctype: string, name: string, idx: number, alt: string, user = currentUser()): { ok: true } | { ok: false; reason: Bi } {
  const meta = cachedMeta(doctype); const d = adapter.get(doctype, name); if (!meta || !d) return { ok: false, reason: ["Document not found.", "المستند غير موجود."] };
  if (n(d.docstatus) !== 0) return { ok: false, reason: ["Only a draft can be changed.", "لا تُعدل إلا المسودة."] };
  const row = rows(d).find((r) => n(r["idx"]) === idx); if (!row) return { ok: false, reason: ["Line not found.", "السطر غير موجود."] };
  if (!alternativesOf(s(row["item_code"])).includes(alt)) return { ok: false, reason: ["That item is not an alternative of this line's item.", "هذا الصنف ليس بديلًا لصنف السطر."] };
  const it = adapter.get("Item", alt)!; const rate = sellingRate(alt, s(d["selling_price_list"]) || defaultPriceList()) || n(row["rate"]);
  const items = rows(d).map((r) => (n(r["idx"]) === idx ? { ...r, item_code: alt, item_name: it["item_name"] ?? alt, description: it["description"] ?? it["item_name"] ?? alt, rate, price_list_rate: rate, amount: r2(rate * n(r["qty"])), digit_substituted_for: row["item_code"] } : r));
  const res = saveDocument(meta, name, { items }, { user }); if (res.errors.length) return { ok: false, reason: [res.errors.join("; "), res.errors.join("؛ ")] };
  adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: doctype, reference_name: name, comment_email: user, content: `Line ${idx}: ${s(row["item_code"])} replaced by its alternative ${alt}` });
  return { ok: true };
}

/* ------------------------------------------------------------------ CF-05 line composer ------------------------------------------------------------------ */
export interface LineSuggestion { item: string; itemName: string; qty: number; rate: number; why: Bi; score: number }
const partyOf = (d: Doc) => s(d["customer"]) || (s(d["quotation_to"]) === "Customer" ? s(d["party_name"]) : "");
/** Lines to add: the customer's usual items (how often, usual quantity, last rate) and items often sold with the lines already there. */
export function composeLines(d: Doc, limit = 8): LineSuggestion[] {
  const cust = partyOf(d); const have = new Set(rows(d).map((r) => s(r["item_code"]))); const pl = s(d["selling_price_list"]) || defaultPriceList();
  const docs = [...adapter.list("Sales Order"), ...adapter.list("Sales Invoice")].filter((x) => n(x.docstatus) === 1 && !n(x["is_return"]));
  const score = new Map<string, LineSuggestion>();
  const bump = (item: string, pts: number, why: Bi, qty: number, rate: number) => {
    if (have.has(item) || !adapter.get("Item", item)) return; const cur = score.get(item);
    if (!cur || pts > cur.score) score.set(item, { item, itemName: s(adapter.get("Item", item)!["item_name"]) || item, qty, rate: rate || sellingRate(item, pl), why, score: (cur?.score ?? 0) + pts }); else cur.score += pts;
  };
  if (cust) {
    const mine = docs.filter((x) => s(x["customer"]) === cust).sort((a, b) => s(b["transaction_date"] ?? b["posting_date"]).localeCompare(s(a["transaction_date"] ?? a["posting_date"])));
    const freq = new Map<string, { times: number; qty: number; rate: number }>();
    for (const x of mine) for (const r of rows(x)) { const k = s(r["item_code"]); const f = freq.get(k) ?? { times: 0, qty: 0, rate: n(r["rate"]) }; f.times += 1; f.qty += n(r["qty"]); freq.set(k, f); }
    for (const [k, f] of freq) bump(k, 10 * f.times, [`Ordered by this customer ${f.times} time(s), usually ${Math.round(f.qty / f.times)}`, `طلبه هذا العميل ${f.times} مرة، عادة ${Math.round(f.qty / f.times)}`], Math.max(1, Math.round(f.qty / f.times)), f.rate);
  }
  if (have.size) {
    for (const x of docs) { const its = new Set(rows(x).map((r) => s(r["item_code"]))); const hit = [...have].filter((h) => its.has(h)); if (!hit.length) continue;
      for (const r of rows(x)) { const k = s(r["item_code"]); if (!have.has(k)) bump(k, 4 * hit.length, [`Often sold with ${hit[0]}`, `يُباع غالبًا مع ${hit[0]}`], Math.max(1, n(r["qty"])), 0); } }
  }
  return [...score.values()].sort((a, b) => b.score - a.score || a.item.localeCompare(b.item)).slice(0, limit);
}
/** Append confirmed lines to the draft (child rows from the native defaults, then the suggestion's item, quantity and rate). */
export function addLines(doctype: string, name: string, lines: { item: string; qty: number; rate?: number }[], user = currentUser()): { ok: true; added: number } | { ok: false; reason: Bi } {
  const meta = cachedMeta(doctype); const d = adapter.get(doctype, name); if (!meta || !d) return { ok: false, reason: ["Document not found.", "المستند غير موجود."] };
  if (n(d.docstatus) !== 0) return { ok: false, reason: ["Only a draft can be changed.", "لا تُعدل إلا المسودة."] };
  const field = meta.fields.find((f) => f.fieldname === "items"); const child = field ? cachedMeta(s(field.options)) : undefined; if (!child) return { ok: false, reason: ["The line table is still loading — try again.", "جدول السطور ما زال يُحمَّل — حاول مجددًا."] };
  const cur = rows(d); const pl = s(d["selling_price_list"]) || defaultPriceList();
  const add = lines.filter((l) => adapter.get("Item", l.item) && l.qty > 0).map((l, i) => { const it = adapter.get("Item", l.item)!; const base = newChildRow(child, d, "items", cur.length + i + 1, user); const rate = l.rate ?? sellingRate(l.item, pl);
    return { ...base, item_code: l.item, item_name: it["item_name"] ?? l.item, description: it["description"] ?? it["item_name"] ?? l.item, qty: l.qty, rate, price_list_rate: rate, amount: r2(rate * l.qty), uom: it["stock_uom"] ?? "Nos", stock_uom: it["stock_uom"] ?? "Nos", conversion_factor: 1 }; });
  if (!add.length) return { ok: false, reason: ["Choose at least one line.", "اختر سطرًا واحدًا على الأقل."] };
  const res = saveDocument(meta, name, { items: [...cur, ...add] }, { user }); if (res.errors.length) return { ok: false, reason: [res.errors.join("; "), res.errors.join("؛ ")] };
  return { ok: true, added: add.length };
}
