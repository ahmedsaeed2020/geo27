/**
 * Marketplace and channel orders (owner gap list A43 / SEL-013): orders from Salla, Zid, Amazon.sa and Noon arrive as
 * Core "Digit Channel Order" records (the "marketplace" provider pulls them once an administrator connects it in
 * Administration ▸ Integrations; until then the request is logged as Awaiting Provider). A sales user converts a new
 * channel order into a native draft Sales Order — channel and channel order id carried on the Core fields digit_channel /
 * digit_channel_ref and the customer's PO number, lines matched to items by SKU — or rejects it with a reason. The same
 * channel order id can never become two sales orders.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta, type DocTypeMeta } from "@/lib/catalog";
import { createDraft, saveDocument } from "@/lib/documentApi";
import { loadState, type RuleMap } from "@/lib/formRules";
import { currentUser, hasPerm } from "@/lib/session";
import { CORE_DT } from "./doctypes";
import { dispatch, providerConnected, type LogRow } from "./providers";

type Bi = [string, string];
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const rows = (d: Doc | undefined, f = "items") => (Array.isArray(d?.[f]) ? (d![f] as Doc[]) : []);
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, k: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + k * 864e5).toISOString().slice(0, 10);

export const CHANNEL_DT = CORE_DT.channelOrder;
export const CHANNEL_LABEL: Record<string, Bi> = { Salla: ["Salla", "سلة"], Zid: ["Zid", "زد"], "Amazon.sa": ["Amazon.sa", "أمازون السعودية"], Noon: ["Noon", "نون"], Website: ["Website", "المتجر الإلكتروني"], Direct: ["Direct", "مباشر"] };

export interface ChannelSummary { channel: string; fresh: number; converted: number; rejected: number; value: number }
export function channelOrders(company?: string): Doc[] {
  return adapter.list(CHANNEL_DT).filter((d) => !company || d["company"] === company).sort((a, b) => s(b["ordered_on"]).localeCompare(s(a["ordered_on"])) || b.name.localeCompare(a.name));
}
export function channelSummary(company?: string): ChannelSummary[] {
  const by = new Map<string, ChannelSummary>();
  for (const d of channelOrders(company)) {
    const c = s(d["channel"]); const x = by.get(c) ?? { channel: c, fresh: 0, converted: 0, rejected: 0, value: 0 };
    const st = s(d["status"]) || "New"; if (st === "Converted") x.converted++; else if (st === "Rejected") x.rejected++; else { x.fresh++; x.value += n(d["total"]); }
    by.set(c, x);
  }
  return [...by.values()].sort((a, b) => a.channel.localeCompare(b.channel));
}

/** An item matches a channel line by item code, then by barcode, then by the SKU written on the item. */
function itemFor(sku: string, code: string): string {
  if (code && adapter.get("Item", code)) return code;
  const k = sku.trim(); if (!k) return "";
  if (adapter.get("Item", k)) return k;
  const byBarcode = adapter.list("Item").find((i) => rows(i, "barcodes").some((b) => s(b["barcode"]) === k));
  return byBarcode?.name ?? adapter.list("Item").find((i) => s(i["item_name"]) === k)?.name ?? "";
}

export const mayConvert = (user = currentUser()) => { const m = cachedMeta("Sales Order"), c = cachedMeta(CHANNEL_DT); return !!m && !!c && hasPerm(m, "create", undefined, user) && hasPerm(c, "write", undefined, user); };

export function convertChannelOrder(name: string, rules: RuleMap | undefined, user = currentUser()): { ok: true; salesOrder: string } | { ok: false; reason: Bi } {
  const co = adapter.get(CHANNEL_DT, name);
  if (!co) return { ok: false, reason: ["Channel order not found.", "طلب القناة غير موجود."] };
  if ((s(co["status"]) || "New") !== "New") return { ok: false, reason: [`This channel order is already ${s(co["status"]).toLowerCase()}.`, s(co["status"]) === "Converted" ? "حُوّل هذا الطلب بالفعل." : "رُفض هذا الطلب بالفعل."] };
  if (!mayConvert(user)) return { ok: false, reason: ["You may not create sales orders from channel orders.", "لا يحق لك إنشاء أوامر بيع من طلبات القنوات."] };
  const dup = adapter.list("Sales Order").find((x) => n(x.docstatus) !== 2 && s(x["digit_channel"]) === s(co["channel"]) && s(x["digit_channel_ref"]) === s(co["external_id"]));
  if (dup) return { ok: false, reason: [`${s(co["channel"])} order ${s(co["external_id"])} is already on sales order ${dup.name}.`, `طلب ${s(co["external_id"])} موجود بالفعل في أمر البيع ${dup.name}.`] };
  if (!s(co["customer"]) || !adapter.get("Customer", s(co["customer"]))) return { ok: false, reason: ["Choose the customer for this channel order first.", "اختر العميل لطلب القناة أولًا."] };
  const lines = rows(co).map((r) => ({ r, item: itemFor(s(r["channel_sku"]), s(r["item_code"])) }));
  const unknown = lines.filter((l) => !l.item);
  if (unknown.length) return { ok: false, reason: [`No item matches SKU ${unknown.map((l) => s(l.r["channel_sku"])).join(", ")}.`, `لا يوجد صنف يطابق الرمز ${unknown.map((l) => s(l.r["channel_sku"])).join("، ")}.`] };
  const sm = cachedMeta("Sales Order") as DocTypeMeta;
  const date = today(); const company = s(co["company"]) || s(adapter.list("Company")[0]?.name);
  const items = lines.map(({ r, item }, i) => { const it = adapter.get("Item", item); const rate = n(r["rate"]); const amount = Math.round(n(r["qty"]) * rate * 100) / 100;
    return { idx: i + 1, item_code: item, item_name: s(it?.["item_name"]) || item, qty: n(r["qty"]), stock_qty: n(r["qty"]), rate, base_rate: rate, net_rate: rate, base_net_rate: rate, price_list_rate: rate, base_price_list_rate: rate, amount, base_amount: amount, net_amount: amount, base_net_amount: amount,
    uom: it?.["stock_uom"], stock_uom: it?.["stock_uom"], conversion_factor: 1, delivery_date: addDays(date, 3), description: s(it?.["description"]) || s(it?.["item_name"]) || item }; });
  const base = { customer: co["customer"], company, transaction_date: date, delivery_date: addDays(date, 3), order_type: "Sales", currency: "SAR", conversion_rate: 1, plc_conversion_rate: 1,
    po_no: s(co["external_id"]), po_date: s(co["ordered_on"]).slice(0, 10) || date, digit_channel: s(co["channel"]), digit_channel_ref: s(co["external_id"]), items };
  const tot = Math.round(items.reduce((t, r) => t + r.amount, 0) * 100) / 100;
  Object.assign(base, { total: tot, net_total: tot, base_total: tot, base_net_total: tot, grand_total: tot, base_grand_total: tot, rounded_total: tot, base_rounded_total: tot, total_qty: items.reduce((t, r) => t + r.qty, 0) });
  const mapped = loadState(rules?.["Sales Order"], base as unknown as Doc).doc as Record<string, unknown>;
  const dr = createDraft(sm, { mapped });
  if (!dr.doc) return { ok: false, reason: [dr.errors.join(" "), dr.errors.join(" ")] };
  const sv = saveDocument(sm, dr.doc.name, {}, { user });
  if (sv.errors.length || !sv.name) { if (adapter.get("Sales Order", dr.doc.name)) adapter.remove("Sales Order", dr.doc.name); return { ok: false, reason: [sv.errors.join(" "), sv.errors.join(" ")] }; }
  adapter.update(CHANNEL_DT, name, { status: "Converted", sales_order: sv.name });
  return { ok: true, salesOrder: sv.name };
}

export function rejectChannelOrder(name: string, reason: string, user = currentUser()): { ok: true } | { ok: false; reason: Bi } {
  const co = adapter.get(CHANNEL_DT, name); const c = cachedMeta(CHANNEL_DT);
  if (!co || (s(co["status"]) || "New") !== "New") return { ok: false, reason: ["Only a new channel order can be rejected.", "يُرفض طلب القناة الجديد فقط."] };
  if (!c || !hasPerm(c, "write", co, user)) return { ok: false, reason: ["You may not change channel orders.", "لا يحق لك تعديل طلبات القنوات."] };
  if (!reason.trim()) return { ok: false, reason: ["Write why the order is rejected.", "اكتب سبب رفض الطلب."] };
  adapter.update(CHANNEL_DT, name, { status: "Rejected", reject_reason: reason.trim() });
  return { ok: true };
}

/** Ask the marketplace provider for new orders. Without a connected provider the request is logged as Awaiting Provider. */
export function fetchChannelOrders(company: string): { connected: boolean; log: LogRow } {
  const log = dispatch("marketplace", { doctype: CHANNEL_DT, name: `pull-${company}`, company }, { action: "pull_new_orders", channels: ["Salla", "Zid", "Amazon.sa", "Noon"], since: adapter.list(CHANNEL_DT).map((d) => s(d["ordered_on"])).sort().at(-1) ?? "" }, `Pull new marketplace orders for ${company}`);
  return { connected: providerConnected("marketplace"), log };
}
