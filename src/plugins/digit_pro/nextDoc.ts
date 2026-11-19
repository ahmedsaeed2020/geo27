/**
 * D7-b / PU11-b / SEL-003-b — "Save & create next" and "Create with selected lines" over the source Create ▸ mappings
 * (form_actions.json add_custom_button(__("<Target>"), …, __("Create")) + engines.mapDoc, the open_mapped_doc port).
 * Only mappings the source declares are offered; the mapped document is still an unsaved draft (documentApi.createDraft).
 */
import type { Doc } from "@/lib/adapter";
import type { FormAction } from "@/lib/engines";

/** The next document of each Pro flow, in the order the department works (receipt → bill, delivery → invoice, quote → order …). */
export const NEXT_STEPS: Record<string, readonly string[]> = {
  "Quotation": ["Sales Order"],
  "Sales Order": ["Pick List", "Delivery Note", "Sales Invoice"],
  "Pick List": ["Delivery Note"],
  "Delivery Note": ["Sales Invoice", "Packing Slip", "Delivery Trip"],
  "Material Request": ["Purchase Order"],
  "Supplier Quotation": ["Purchase Order"],
  "Purchase Order": ["Purchase Receipt", "Purchase Invoice"],
  "Purchase Receipt": ["Purchase Invoice"],
};

/** Source Create ▸ actions that map this document to one of its next documents (label = target, group Create). */
export function nextActions(dt: string, actions: FormAction[] | undefined): FormAction[] {
  const want = NEXT_STEPS[dt] ?? [];
  return want.map((t) => (actions ?? []).find((a) => a.group === "Create" && a.label === t && a.target === t && (a.kind ?? "create") === "create")).filter((a): a is FormAction => !!a);
}

export interface PickRow { field: string; idx: number; item: string; qty: number }
/** Mapped child rows the user can pick (rows already fully delivered / billed were dropped by mapDoc). */
export function pickableRows(mapped: Record<string, unknown>): PickRow[] {
  const out: PickRow[] = [];
  for (const [field, v] of Object.entries(mapped)) if (Array.isArray(v) && v.length && v.every((r) => r && typeof r === "object" && "item_code" in (r as object)))
    (v as Doc[]).forEach((r) => out.push({ field, idx: Number(r["idx"]), item: String(r["item_code"] ?? ""), qty: Number(r["qty"] ?? 0) }));
  return out;
}

/** Keep only the picked rows (by table + idx) and renumber idx, as frappe's "select items" dialogs do. */
export function keepRows(mapped: Record<string, unknown>, keep: ReadonlySet<string>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...mapped };
  for (const [field, v] of Object.entries(mapped)) if (Array.isArray(v) && v.every((r) => r && typeof r === "object" && "item_code" in (r as object)))
    out[field] = (v as Doc[]).filter((r) => keep.has(`${field}:${Number(r["idx"])}`)).map((r, i) => ({ ...r, idx: i + 1 }));
  return out;
}
export const pickKey = (r: PickRow) => `${r.field}:${r.idx}`;

/** Next documents the source creates from the DRAFT (delivery_note.js shows "Packing Slip" only while docstatus = 0). */
export const FROM_DRAFT = new Set(["Delivery Note>Packing Slip"]);
export const fromDraft = (dt: string, target: string) => FROM_DRAFT.has(`${dt}>${target}`);

const num = (v: unknown) => Number(v) || 0;
const rowsOf = (d: Doc, f: string) => (Array.isArray(d[f]) ? (d[f] as Doc[]) : []);
/**
 * Child tables the generic mapper cannot pair by fieldname, ported from the source mappers:
 * sales_order.mapper.create_pick_list (items → locations, purpose Delivery), pick_list create_delivery_note
 * (locations → items with the order line's rate, against_sales_order / so_detail), delivery_note.mapper
 * make_packing_slip (items → items with dn_detail, header delivery_note) and make_delivery_trip (one Delivery Stop per note).
 */
export function completeMapping(srcDt: string, target: string, src: Doc, mapped: Record<string, unknown>, getDoc: (dt: string, name: string) => Doc | undefined): Record<string, unknown> {
  const out = { ...mapped };
  if (srcDt === "Sales Order" && target === "Pick List") {
    out["purpose"] = "Delivery"; out["customer"] = src["customer"]; out["company"] = src["company"];
    out["locations"] = rowsOf(src, "items").map((r) => ({ r, left: num(r["qty"]) - num(r["delivered_qty"]) - num(r["picked_qty"]) })).filter((x) => x.left > 0).map(({ r, left }, i) => ({
      idx: i + 1, item_code: r["item_code"], item_name: r["item_name"], qty: left, stock_qty: left * (num(r["conversion_factor"]) || 1), uom: r["uom"], stock_uom: r["stock_uom"],
      conversion_factor: num(r["conversion_factor"]) || 1, warehouse: r["warehouse"], sales_order: src.name, sales_order_item: r.name,
    }));
  } else if (srcDt === "Pick List" && target === "Delivery Note") {
    const lines = rowsOf(src, "locations").filter((r) => r["sales_order"] && num(r["picked_qty"] || r["qty"]) - num(r["delivered_qty"]) > 0);
    const so = lines[0] ? getDoc("Sales Order", String(lines[0]["sales_order"])) : undefined;
    if (so) { out["customer"] = so["customer"]; out["company"] = so["company"]; out["currency"] = so["currency"]; out["selling_price_list"] = so["selling_price_list"]; }
    out["pick_list"] = src.name;
    out["items"] = lines.map((r, i) => {
      const soLines = rowsOf(getDoc("Sales Order", String(r["sales_order"])) ?? ({} as Doc), "items");
      // the order line by its row id; rows without one (older demo data) match on item code
      const sl = (r["sales_order_item"] ? soLines.find((x) => x.name === r["sales_order_item"]) : undefined) ?? soLines.find((x) => x["item_code"] === r["item_code"]);
      const qty = num(r["picked_qty"] || r["qty"]) - num(r["delivered_qty"]);
      return { idx: i + 1, item_code: r["item_code"], item_name: r["item_name"] ?? sl?.["item_name"], qty, uom: r["uom"] ?? sl?.["uom"], stock_uom: r["stock_uom"] ?? sl?.["stock_uom"], conversion_factor: num(r["conversion_factor"]) || 1,
        rate: sl?.["rate"], amount: sl ? Math.round(qty * num(sl["rate"]) * 100) / 100 : undefined, warehouse: r["warehouse"], against_sales_order: r["sales_order"], so_detail: r["sales_order_item"], pick_list_item: r.name };
    });
  } else if (srcDt === "Delivery Note" && target === "Packing Slip") {
    out["delivery_note"] = src.name;
    out["items"] = rowsOf(src, "items").map((r, i) => ({ idx: i + 1, item_code: r["item_code"], item_name: r["item_name"], qty: num(r["qty"]), stock_uom: r["stock_uom"], batch_no: r["batch_no"], dn_detail: r.name }));
  } else if (srcDt === "Delivery Note" && target === "Delivery Trip") {
    out["company"] = src["company"];
    out["delivery_stops"] = [{ idx: 1, delivery_note: src.name, customer: src["customer"], address: src["shipping_address_name"] ?? src["customer_address"], customer_address: src["shipping_address"] ?? src["address_display"],
      contact: src["contact_person"], customer_contact: src["contact_display"], grand_total: src["grand_total"] }];
  }
  return out;
}
