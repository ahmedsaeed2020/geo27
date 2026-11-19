/**
 * Drop-ship (ERPNext "Supplier delivers to customer", owner gap list B11). Sales Order lines ticked "Supplier delivers to
 * customer" (native delivered_by_supplier + supplier) are ordered from that supplier on a draft Purchase Order per
 * supplier (port of sales_order.make_purchase_order for drop-ship lines: customer and the order line kept on the PO), and
 * the submitted Purchase Order's "Deliver (Dropship)" (purchase_order.js → update_status("Delivered")) marks them
 * delivered on the Sales Order. posting.ts refreshPrev counts those quantities as delivered, so the order's delivered
 * percentage and status move exactly as with a delivery note — and quick process / delivery notes skip these lines.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta, type DocTypeMeta } from "@/lib/catalog";
import { createDraft, saveDocument } from "@/lib/documentApi";
import { refreshPrev } from "@/lib/posting";
import { currentUser, hasPerm } from "@/lib/session";

type Bi = [string, string];
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const rows = (d: Doc | undefined, f = "items") => (Array.isArray(d?.[f]) ? (d![f] as Doc[]) : []);
const today = () => new Date().toISOString().slice(0, 10);

export interface DropShipLine { idx: number; rowName: string; item_code: string; item_name: string; qty: number; supplier: string; po: string; poStatus: string; delivered: number }

/** Purchase Orders (not cancelled) that carry one Sales Order line. */
const posFor = (so: string, rowName: string, item: string) => adapter.list("Purchase Order").filter((p) => n(p.docstatus) !== 2 && rows(p).some((r) => r["sales_order"] === so && (rowName && r["sales_order_item"] ? r["sales_order_item"] === rowName : r["item_code"] === item)));

export function dropShipLines(so: Doc): DropShipLine[] {
  return rows(so).filter((r) => n(r["delivered_by_supplier"])).map((r, i) => {
    const rowName = s(r["name"]); const po = posFor(so.name, rowName, s(r["item_code"]))[0];
    return { idx: n(r["idx"]) || i + 1, rowName, item_code: s(r["item_code"]), item_name: s(r["item_name"]), qty: n(r["qty"]), supplier: s(r["supplier"]), po: po?.name ?? "", poStatus: po ? (n(po.docstatus) === 0 ? "Draft" : s(po["status"])) : "", delivered: n(r["delivered_qty"]) };
  });
}

const buyRate = (item: string) => {
  const ip = adapter.list("Item Price").find((p) => p["item_code"] === item && n(p["buying"]) === 1);
  const it = adapter.get("Item", item);
  return n(ip?.["price_list_rate"]) || n(it?.["last_purchase_rate"]) || n(it?.["valuation_rate"]) || n(it?.["standard_rate"]);
};

/** One draft Purchase Order per supplier for the drop-ship lines not yet ordered. */
export function makeDropShipOrders(soName: string, user = currentUser()): { ok: true; created: string[] } | { ok: false; reason: Bi } {
  const so = adapter.get("Sales Order", soName);
  if (!so || n(so.docstatus) !== 1) return { ok: false, reason: ["Submit the sales order first.", "اعتمد أمر البيع أولًا."] };
  const pm = cachedMeta("Purchase Order") as DocTypeMeta | undefined;
  if (!pm || !hasPerm(pm, "create", undefined, user)) return { ok: false, reason: ["You may not create purchase orders.", "لا يحق لك إنشاء أوامر شراء."] };
  const todo = dropShipLines(so).filter((l) => !l.po);
  if (!todo.length) return { ok: false, reason: ["Every supplier-delivered line already has a purchase order.", "كل سطر يورده المورد له أمر شراء بالفعل."] };
  const noSup = todo.filter((l) => !l.supplier);
  if (noSup.length) return { ok: false, reason: [`Choose the supplier on line ${noSup.map((l) => l.idx).join(", ")}.`, `اختر المورد في السطر ${noSup.map((l) => l.idx).join("، ")}.`] };
  const created: string[] = [];
  for (const sup of [...new Set(todo.map((l) => l.supplier))]) {
    const src = rows(so); const lines = todo.filter((l) => l.supplier === sup);
    const items = lines.map((l, k) => { const r: Record<string, unknown> = src.find((x) => s(x["name"]) === l.rowName && l.rowName) ?? src[l.idx - 1] ?? {}; const rate = buyRate(l.item_code);
      return { idx: k + 1, item_code: l.item_code, item_name: l.item_name, qty: l.qty, uom: r["uom"] ?? r["stock_uom"], stock_uom: r["stock_uom"] ?? r["uom"], conversion_factor: n(r["conversion_factor"]) || 1,
        rate, amount: Math.round(rate * l.qty * 100) / 100, schedule_date: s(r["delivery_date"]) || s(so["delivery_date"]) || today(), warehouse: r["warehouse"] ?? so["set_warehouse"] ?? "",
        sales_order: so.name, sales_order_item: l.rowName, delivered_by_supplier: 1, description: r["description"] ?? l.item_name }; });
    const total = items.reduce((t, r) => t + r.amount, 0);
    const mapped = { supplier: sup, company: so["company"], transaction_date: today(), schedule_date: items[0]!.schedule_date, currency: so["currency"] ?? "SAR", conversion_rate: 1,
      customer: so["customer"], customer_name: so["customer_name"] ?? so["customer"], shipping_address: so["shipping_address_name"] ?? "", items, total, net_total: total, grand_total: total, rounded_total: total, base_grand_total: total };
    const dr = createDraft(pm, { mapped });
    if (!dr.doc) return { ok: false, reason: [dr.errors.join(" "), dr.errors.join(" ")] };
    const sv = saveDocument(pm, dr.doc.name, {}, { user });
    if (sv.errors.length || !sv.name) { if (adapter.get("Purchase Order", dr.doc.name)) adapter.remove("Purchase Order", dr.doc.name); return { ok: false, reason: [sv.errors.join(" "), sv.errors.join(" ")] }; }
    created.push(sv.name);
  }
  return { ok: true, created };
}

/** purchase_order.js "Deliver (Dropship)" shows on a submitted drop-ship PO that is not delivered or closed yet. */
export const mayDeliverDropShip = (po: Doc) => n(po.docstatus) === 1 && !!s(po["customer"]) && rows(po).some((r) => n(r["delivered_by_supplier"]) && r["sales_order"]) && !["Delivered", "Closed", "Completed", "On Hold"].includes(s(po["status"]));

export function deliverDropShip(poName: string, user = currentUser()): { ok: true; salesOrders: string[] } | { ok: false; reason: Bi } {
  const po = adapter.get("Purchase Order", poName);
  if (!po || !mayDeliverDropShip(po)) return { ok: false, reason: ["This purchase order cannot be marked delivered.", "لا يمكن تعليم أمر الشراء هذا كمُسلَّم."] };
  const pm = cachedMeta("Purchase Order") as DocTypeMeta | undefined;
  if (!pm || !hasPerm(pm, "write", po, user)) return { ok: false, reason: ["You may not change this purchase order.", "لا يحق لك تعديل أمر الشراء هذا."] };
  adapter.update("Purchase Order", poName, { status: "Delivered" });
  const sos = [...new Set(rows(po).filter((r) => n(r["delivered_by_supplier"])).map((r) => s(r["sales_order"])).filter(Boolean))];
  for (const so of sos) refreshPrev("Sales Order", so);
  adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: "Purchase Order", reference_name: poName, content: `Delivered by the supplier to ${s(po["customer_name"] || po["customer"])}`, comment_email: user, owner: user });
  return { ok: true, salesOrders: sos };
}
