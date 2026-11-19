/**
 * PRO-STE-ROW-MANDATORY — Stock Entry movement rows on save (scoped to Stock Entry ▸ items, Stock Entry Detail).
 *
 * Ported from the frozen ERPNext source (sources/archives/erpnext-develop.zip, 17.0.0-dev):
 *  - stock_entry.py validate() → validate_item() → _fetch_item_data(): the Item must exist with disabled = 0 and an
 *    end_of_life that is unset / before 1900-01-01 / after today, else "Item {0} is not active or end of life has been reached".
 *  - stock_entry_detail.py validate_and_update_item_details(): qty < 0 → "Row {0}: The item {1}, quantity must be a positive
 *    number"; is_stock_item ≠ 1 → "{0} is not a stock Item"; stock_uom / item_name reset from the Item; uom, description and
 *    conversion_factor filled only when empty (conversion_factor 1 when uom = stock_uom, else the Item's UOM Conversion
 *    Detail row); transfer_qty = qty × conversion_factor when empty.
 *  - accounts_controller.py validate_qty_is_not_zero(): "Row #{0}: Quantity for Item {1} cannot be zero."
 *  - frappe form/save.js check_mandatory for the row's Item Code: "In {0}, {1} is required in row {2}."
 *  - base_document.py _get_missing_mandatory_fields for the mandatory table: "Error: Data missing in table {0}".
 *
 * Owner rule (2026-11-10 evidence-corrected brief §4.3): an untouched placeholder row — one that holds only its add_child
 * defaults or the header's From/To Warehouse — is permitted and is dropped on save instead of being stored. Every other
 * row is an active stock movement and needs a valid stock Item. Values the server derives are taken from the Item record
 * only; nothing else is filled in. Stock Ledger integrity stays a Frappe server matter (posting.ts handles the preview).
 */
import { adapter, registerDocHook, type Doc } from "./adapter";
import { cachedMeta } from "./catalog";
import { newDocDefaults } from "./sessionDefaults";
import { resolveName } from "./rename";

const SYSTEM = new Set(["name", "doctype", "idx", "parent", "parentfield", "parenttype", "docstatus", "owner", "creation", "modified", "modified_by"]);
const n = (v: unknown) => Number(v ?? 0) || 0;
const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
const today = () => new Date().toISOString().slice(0, 10);

/**
 * A row holding nothing but add_child defaults (or the header warehouses the form copies down) — the grid placeholder.
 * Only the grid columns (in_list_view: s_warehouse, t_warehouse, item_code, qty, basic_rate) are what a user types into
 * a new row, so only they decide: values ported client rules write into hidden row fields (e.g. stock_entry.js
 * secondary_item_type → valuation_type, whose early return the generated rule drops) never make a blank row "touched".
 * Same criterion as frappe save.js remove_empty_rows in v15 (absent from the archived develop tree, not verified here).
 */
export function isUntouchedRow(row: Record<string, unknown>, parent: Doc): boolean {
  const cm = cachedMeta("Stock Entry Detail");
  const defaults = cm ? newDocDefaults(cm, parent) : {};
  const cols = cm ? new Set(cm.fields.filter((f) => Number(f.in_list_view ?? 0) && f.fieldname).map((f) => f.fieldname!)) : undefined;
  for (const [k, v] of Object.entries(row)) {
    if (SYSTEM.has(k) || k.startsWith("__") || empty(v)) continue;
    if (cols?.size && !cols.has(k)) continue;
    if (k === "s_warehouse" && v === parent["from_warehouse"]) continue;
    if (k === "t_warehouse" && v === parent["to_warehouse"]) continue;
    const dv = defaults[k];
    if (dv !== undefined && String(dv) === String(v)) continue;
    // numeric/Check zero is the unset value of a Float/Int/Check field
    if (typeof v === "number" && v === 0) continue;
    return false;
  }
  return true;
}

/** _fetch_item_data: the Item when it is active (disabled = 0, end_of_life not reached). */
function activeItem(code: string): Doc | undefined {
  const it = adapter.get("Item", code) ?? adapter.get("Item", resolveName("Item", code));
  if (!it || n(it["disabled"])) return undefined;
  const eol = String(it["end_of_life"] ?? "");
  if (eol && eol >= "1900-01-01" && eol <= today()) return undefined;
  return it;
}

/** Item's UOM Conversion Detail factor for `uom` (get_uom_details), or undefined when the Item declares none. */
function uomFactor(it: Doc, uom: string): number | undefined {
  const row = (Array.isArray(it["uoms"]) ? (it["uoms"] as Record<string, unknown>[]) : []).find((r) => r["uom"] === uom);
  return row && n(row["conversion_factor"]) ? n(row["conversion_factor"]) : undefined;
}

/**
 * Normalise and validate the Items table. Returns the document to store (placeholders dropped, server-derived values
 * filled from the Item) and the source error messages in source order.
 */
export function checkStockEntryRows(doc: Doc): { doc: Doc; errors: string[] } {
  const rows = Array.isArray(doc["items"]) ? (doc["items"] as Record<string, unknown>[]) : [];
  const kept = rows.filter((r) => !isUntouchedRow(r, doc));
  const errors: string[] = [];
  const missingItem: number[] = [];
  const out = kept.map((r0, i) => {
    const r: Record<string, unknown> = { ...r0, idx: i + 1 };
    const code = String(r["item_code"] ?? "").trim();
    if (!code) { missingItem.push(i + 1); return r; }
    const it = activeItem(code);
    if (!it) { errors.push(`Item ${code} is not active or end of life has been reached`); return r; }
    if (n(r["qty"]) < 0) errors.push(`Row ${i + 1}: The item ${code}, quantity must be a positive number`);
    if (n(it["is_stock_item"] ?? 1) !== 1) { errors.push(`${code} is not a stock Item`); return r; }
    const stockUom = String(it["stock_uom"] ?? "");
    if (stockUom) r["stock_uom"] = stockUom;
    if (it["item_name"]) r["item_name"] = it["item_name"];
    if (empty(r["uom"]) && stockUom) r["uom"] = stockUom;
    if (empty(r["description"]) && it["description"]) r["description"] = it["description"];
    if (r["uom"] && r["uom"] === stockUom) r["conversion_factor"] = 1;
    else if (!n(r["conversion_factor"]) && r["uom"]) { const f = uomFactor(it, String(r["uom"])); if (f) r["conversion_factor"] = f; }
    if (!n(r["transfer_qty"]) && n(r["qty"]) && n(r["conversion_factor"])) r["transfer_qty"] = Math.round(n(r["qty"]) * n(r["conversion_factor"]) * 1e6) / 1e6;
    if (!n(r["qty"])) errors.push(`Row #${i + 1}: Quantity for Item ${code} cannot be zero.`);
    return r;
  });
  if (missingItem.length) {
    const all = missingItem.length === out.length;
    errors.unshift(all ? "In Items, Item Code is required in every row." : missingItem.length === 1 ? `In Items, Item Code is required in row ${missingItem[0]}.` : `In Items, Item Code is required in rows ${missingItem.join(", ")}.`);
  }
  if (!out.length) errors.unshift("Error: Data missing in table Items");
  return { doc: { ...doc, items: out }, errors };
}

/** validate() runs on every save and on submit; a submitted or cancelled entry is not re-validated by later updates. */
registerDocHook("Stock Entry", (doc, before) => {
  if (doc["__synthetic"]) return { doc };
  const ds = n(doc["docstatus"]), was = before ? n(before["docstatus"]) : 0;
  if (ds === 2 || (ds === 1 && was === 1)) return { doc };
  return checkStockEntryRows(doc);
});
