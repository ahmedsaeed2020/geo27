/**
 * Asset Movement / Asset Repair / Asset Capitalization controllers — virtual ports of
 *  - erpnext/assets/doctype/asset_movement/asset_movement.py (validate purposes, set_latest_location_and_custodian_in_asset; no GL)
 *  - erpnext/assets/doctype/asset_repair/asset_repair.py (status Out of Order, repair_status gate, consumed stock via Stock Entry,
 *    capitalize_repair_cost → Dr fixed asset / Cr repair expense, increase_in_asset_life → extra schedule rows)
 *  - erpnext/assets/doctype/asset_capitalization/asset_capitalization.py (consume stock / assets / services into a target asset)
 *  - erpnext/assets/doctype/asset_shift_allocation/asset_shift_allocation.py (change the shift of open depreciation rows)
 * Ledger effects only via Journal Entry / Stock Entry submitted by src/lib/posting.ts.
 */
import { adapter, registerDocHook, type Doc } from "./adapter";
import { submit, cancel } from "./posting";
import { assetAccounts, assetInternals, postDepreciation, accumulated, bookValue, scheduleOf, shiftFactors, allocateShifts, applyShifts } from "./assets";
import { resolveName } from "./rename";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
type Row = Record<string, unknown>;
const rows = (d: Doc, f: string) => ((d[f] as Row[] | undefined) ?? []);
const today = () => new Date().toISOString().slice(0, 10);
const DEAD = ["Sold", "Scrapped", "Capitalized", "Cancelled"];

// ---------------- Asset Movement ----------------
export function movementErrors(d: Doc): string[] {
  const e: string[] = []; const p = String(d["purpose"] ?? "");
  if (!["Issue", "Receipt", "Transfer", "Transfer and Issue"].includes(p)) e.push("Purpose is mandatory");
  if (!rows(d, "assets").length) e.push("Assets table is mandatory");
  for (const r of rows(d, "assets")) {
    const i = r["idx"] ?? 1; const a = adapter.get("Asset", String(r["asset"] ?? ""));
    if (!a) { e.push(`Row #${i}: Asset ${r["asset"] ?? ""} not found`); continue; }
    if (n(a.docstatus) !== 1) e.push(`Row #${i}: Asset ${a.name} must be submitted`);
    if (DEAD.includes(String(a["status"]))) e.push(`Row #${i}: Asset ${a.name} is ${a["status"]}`);
    if (d["company"] && a["company"] !== d["company"]) e.push(`Row #${i}: Asset ${a.name} does not belong to company ${d["company"]}`);
    if (p === "Transfer" || p === "Transfer and Issue") {
      if (!r["target_location"]) e.push(`Row #${i}: Target Location is required for ${p}`);
      if (r["source_location"] && a["location"] && r["source_location"] !== a["location"]) e.push(`Row #${i}: Asset ${a.name} does not belong to location ${r["source_location"]}`);
      if (r["target_location"] && r["target_location"] === (r["source_location"] ?? a["location"])) e.push(`Row #${i}: Source and Target Location cannot be same`);
    }
    if (p === "Receipt" && !r["target_location"]) e.push(`Row #${i}: Target Location is required while receiving Asset ${a.name}`);
    if (p === "Issue" || p === "Transfer and Issue") {
      if (!r["to_employee"]) e.push(`Row #${i}: Employee is required while issuing Asset ${a.name}`);
      if (r["from_employee"] && a["custodian"] && r["from_employee"] !== a["custodian"]) e.push(`Row #${i}: Asset ${a.name} does not belong to the custodian ${r["from_employee"]}`);
    }
    if (p === "Issue" && r["target_location"]) e.push(`Row #${i}: Issuing cannot be done to a location. Please enter employee to issue the Asset ${a.name}`);
  }
  return e;
}
/** set_latest_location_and_custodian_in_asset: last submitted movement row per asset, else the asset's pre-movement values. */
function latestFor(asset: string) {
  const ms = adapter.list("Asset Movement").filter((m) => n(m.docstatus) === 1).sort((a, b) => String(a["transaction_date"] ?? a["creation"]).localeCompare(String(b["transaction_date"] ?? b["creation"])) || String(a["creation"] ?? "").localeCompare(String(b["creation"] ?? "")) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  let loc: unknown, cust: unknown;
  for (const m of ms) for (const r of rows(m, "assets")) if (r["asset"] === asset) { if (r["target_location"]) loc = r["target_location"]; if (r["to_employee"]) cust = r["to_employee"]; else if (m["purpose"] === "Receipt") cust = ""; }
  return { loc, cust };
}
function applyMovement(d: Doc, sign: 1 | -1) {
  for (const r of rows(d, "assets")) {
    const a = adapter.get("Asset", String(r["asset"])); if (!a) continue;
    if (sign === 1 && a["__initial_location"] === undefined) adapter.update("Asset", a.name, { __initial_location: a["location"] ?? "", __initial_custodian: a["custodian"] ?? "" });
    const b = adapter.get("Asset", a.name)!; const { loc, cust } = latestFor(a.name);
    adapter.update("Asset", a.name, { location: loc ?? b["__initial_location"] ?? "", custodian: cust ?? b["__initial_custodian"] ?? "" });
  }
}
registerDocHook("Asset Movement", (doc, before) => {
  const from = n(before?.docstatus), to = n(doc.docstatus);
  // fill source/from from the asset like asset_movement.js set_source_location
  const filled = { ...doc, assets: rows(doc, "assets").map((r) => { const a = adapter.get("Asset", String(r["asset"] ?? "")); return a ? { ...r, asset_name: a["asset_name"], company: a["company"], source_location: r["source_location"] || (doc["purpose"] !== "Receipt" ? a["location"] ?? "" : ""), from_employee: r["from_employee"] || a["custodian"] || "" } : r; }) };
  if (from === 0 && to === 1) { const errors = movementErrors(filled); return errors.length ? { doc: filled, errors } : { doc: filled, after: (d) => applyMovement(d, 1) }; }
  if (from === 1 && to === 2) return { doc, after: (d) => applyMovement(d, -1) };
  return { doc: to === 0 ? filled : doc };
});

// ---------------- Asset Repair ----------------
const repairTotals = (d: Doc) => {
  const stock = rows(d, "stock_items").map((r) => ({ ...r, total_value: r2(n(r["valuation_rate"]) * n(r["consumed_quantity"])) }));
  const repair_cost = r2(rows(d, "invoices").reduce((s, r) => s + n(r["repair_cost"]), 0)); const consumed_items_cost = r2(stock.reduce((s, r) => s + n(r["total_value"]), 0));
  return { stock_items: stock, repair_cost, consumed_items_cost, total_repair_cost: r2(repair_cost + consumed_items_cost) };
};
export function repairErrors(d: Doc): string[] {
  const e: string[] = []; const a = adapter.get("Asset", String(d["asset"] ?? ""));
  if (!a) return [`Asset ${d["asset"] ?? ""} not found`];
  if (["Work In Progress", ...DEAD].includes(String(a["status"])) && String(a["status"]) !== "Out of Order") e.push(`Asset ${a.name} is ${a["status"]}; it cannot be repaired`);
  if (d["repair_status"] === "Pending" || !d["repair_status"]) e.push("Please update Repair Status.");
  if (d["repair_status"] === "Completed" && !d["completion_date"]) e.push("Completion Date is mandatory when Repair Status is Completed");
  if (d["completion_date"] && d["failure_date"] && String(d["completion_date"]) < String(d["failure_date"])) e.push("Completion Date cannot be before Failure Date");
  for (const r of rows(d, "invoices")) {
    const pi = adapter.get("Purchase Invoice", String(r["purchase_invoice"] ?? ""));
    if (r["purchase_invoice"] && (!pi || n(pi.docstatus) !== 1)) e.push(`Row #${r["idx"] ?? 1}: Purchase Invoice ${r["purchase_invoice"]} must be submitted`);
    if (pi && pi["company"] !== a["company"]) e.push(`Row #${r["idx"] ?? 1}: Purchase Invoice ${pi.name} belongs to another company`);
    const used = adapter.list("Asset Repair").filter((x) => x.name !== d.name && n(x.docstatus) === 1).flatMap((x) => rows(x, "invoices")).filter((x) => x["purchase_invoice"] === r["purchase_invoice"] && x["expense_account"] === r["expense_account"]).reduce((s, x) => s + n(x["repair_cost"]), 0);
    if (pi && n(r["repair_cost"]) + used > n(pi["net_total"] ?? pi["grand_total"]) + 0.005) e.push(`Row #${r["idx"] ?? 1}: Repair cost exceeds the unconsumed amount of Purchase Invoice ${pi.name}`);
  }
  for (const r of rows(d, "stock_items")) if (!r["warehouse"] || !(n(r["consumed_quantity"]) > 0)) e.push(`Row #${r["idx"] ?? 1}: Warehouse and Consumed Quantity are mandatory`);
  if (n(d["capitalize_repair_cost"]) && !(n(d["total_repair_cost"]) > 0) && !(repairTotals(d).total_repair_cost > 0)) e.push("Capitalize Repair Cost needs a repair cost");
  return e;
}
function submitRepair(name: string) {
  const d = adapter.get("Asset Repair", name)!; const a = adapter.get("Asset", String(d["asset"]))!; const patch: Row = {};
  if (rows(d, "stock_items").length) {
    const se = adapter.insertDoc("Stock Entry", { company: a["company"], stock_entry_type: "Material Issue", purpose: "Material Issue", posting_date: String(d["completion_date"] ?? today()).slice(0, 10), asset_repair: name,
      items: rows(d, "stock_items").map((r, i) => ({ idx: i + 1, item_code: r["item_code"], s_warehouse: r["warehouse"], qty: n(r["consumed_quantity"]), transfer_qty: n(r["consumed_quantity"]), basic_rate: n(r["valuation_rate"]), uom: "Nos", stock_uom: "Nos", conversion_factor: 1 })), docstatus: 0 });
    const errs = submit("Stock Entry", se.name); if (errs.length) throw new Error(errs.join("; "));
    patch["stock_entry"] = se.name;
  }
  if (n(d["capitalize_repair_cost"]) && n(d["total_repair_cost"]) > 0) {
    const acc = assetAccounts(a); const ref = { reference_type: "Asset", reference_name: a.name, cost_center: d["cost_center"] ?? a["cost_center"] ?? "" };
    const ab = String(adapter.get("Company", String(a["company"]))?.["abbr"] ?? "");
    const lines: Row[] = [{ account: acc.fixed, debit: n(d["total_repair_cost"]), ...ref }];
    for (const r of rows(d, "invoices")) if (n(r["repair_cost"])) lines.push({ account: r["expense_account"], credit: n(r["repair_cost"]), ...ref });
    if (n(d["consumed_items_cost"])) lines.push({ account: resolveName("Account", `Stock Adjustment - ${ab}`), credit: n(d["consumed_items_cost"]), ...ref });
    patch["journal_entry"] = assetInternals.je(a["company"], String(d["completion_date"] ?? today()).slice(0, 10), `Asset Repair ${name}`, lines, { voucher_type: "Journal Entry" });
    const freq = n(assetInternals.liveSchedules(a.name)[0]?.["frequency_of_depreciation"]) || 1;
    const extra = Math.ceil(n(d["increase_in_asset_life"]) / freq);
    for (const s of assetInternals.liveSchedules(a.name)) assetInternals.changeBookValue(a.name, String(s["finance_book"] ?? ""), n(d["total_repair_cost"]), extra);
    if (!assetInternals.liveSchedules(a.name).length) assetInternals.changeBookValue(a.name, "", n(d["total_repair_cost"]));
    adapter.update("Asset", a.name, { additional_asset_cost: r2(n(a["additional_asset_cost"]) + n(d["total_repair_cost"])) });
  }
  adapter.update("Asset Repair", name, patch);
  restoreStatus(a.name, name);
}
function restoreStatus(asset: string, except: string) {
  const open = adapter.list("Asset Repair").some((x) => x.name !== except && x["asset"] === asset && n(x.docstatus) === 0 && x["repair_status"] === "Pending");
  const a = adapter.get("Asset", asset)!;
  if (!open && a["status"] === "Out of Order") { adapter.update("Asset", asset, { status: String(a["__status_before_repair"] || "Submitted") }); assetInternals.refreshAsset(asset); }
}
function cancelRepair(name: string) {
  const d = adapter.get("Asset Repair", name)!; const a = adapter.get("Asset", String(d["asset"]))!;
  const posted = assetInternals.liveSchedules(a.name).some((s) => rows(s, "depreciation_schedule").some((r) => r["journal_entry"] && r["journal_entry"] !== "preview" && String(r["schedule_date"]) >= String(d["completion_date"] ?? "").slice(0, 10)));
  if (n(d["capitalize_repair_cost"]) && posted) throw new Error("Cannot cancel: depreciation was posted after this capitalized repair. Cancel those depreciation entries first.");
  if (d["stock_entry"]) cancel("Stock Entry", String(d["stock_entry"]));
  if (d["journal_entry"]) {
    cancel("Journal Entry", String(d["journal_entry"]));
    const freq = n(assetInternals.liveSchedules(a.name)[0]?.["frequency_of_depreciation"]) || 1; const extra = Math.ceil(n(d["increase_in_asset_life"]) / freq);
    for (const s of assetInternals.liveSchedules(a.name)) {
      // drop the life-extension rows (unposted) first, then shrink the remaining rows by the repair cost
      let tailAmt = 0; const rs = rows(s, "depreciation_schedule"); const tail = extra ? rs.slice(-extra) : [];
      if (extra && tail.every((r) => !r["journal_entry"] || r["journal_entry"] === "preview")) { tailAmt = tail.reduce((t, r) => t + n(r["depreciation_amount"]), 0); adapter.update("Asset Depreciation Schedule", s.name, { depreciation_schedule: rs.slice(0, -extra), total_number_of_depreciations: n(s["total_number_of_depreciations"]) - extra, net_purchase_amount: r2(n(s["net_purchase_amount"]) - tailAmt) }); }
      assetInternals.changeBookValue(a.name, String(s["finance_book"] ?? ""), -n(d["total_repair_cost"]) + tailAmt);
    }
    if (!assetInternals.liveSchedules(a.name).length) assetInternals.changeBookValue(a.name, "", -n(d["total_repair_cost"]));
    adapter.update("Asset", a.name, { additional_asset_cost: r2(n(adapter.get("Asset", a.name)!["additional_asset_cost"]) - n(d["total_repair_cost"])) });
  }
  adapter.update("Asset Repair", name, { repair_status: "Cancelled" });
}
registerDocHook("Asset Repair", (doc, before) => {
  const from = n(before?.docstatus), to = n(doc.docstatus);
  const a = adapter.get("Asset", String(doc["asset"] ?? ""));
  const d: Doc = { ...doc, ...repairTotals(doc), ...(a ? { company: doc["company"] || a["company"], asset_name: a["asset_name"] } : {}) };
  if (!before && a && (d["repair_status"] ?? "Pending") === "Pending" && !DEAD.includes(String(a["status"]))) {
    // asset_repair.py before_insert/after_insert: the asset is Out of Order while a repair is pending
    return { doc: { ...d, repair_status: d["repair_status"] ?? "Pending" }, after: () => { if (a["status"] !== "Out of Order") adapter.update("Asset", a.name, { __status_before_repair: a["status"], status: "Out of Order" }); } };
  }
  if (from === 0 && to === 1) { const errors = repairErrors(d); return errors.length ? { doc: d, errors } : { doc: d, after: (x) => { if (!x["journal_entry"] && !x["stock_entry"]) submitRepair(x.name); } }; }
  if (from === 1 && to === 2) return { doc, after: (x) => cancelRepair(x.name) };
  return { doc: to === 0 ? d : doc };
});

// ---------------- Asset Capitalization ----------------
const capTotals = (d: Doc) => {
  const stock_items = rows(d, "stock_items").map((r) => ({ ...r, amount: r2(n(r["stock_qty"]) * n(r["valuation_rate"])) }));
  const asset_items = rows(d, "asset_items").map((r) => { const a = adapter.get("Asset", String(r["asset"] ?? "")); const v = a ? bookValue(a.name, r["finance_book"] ? String(r["finance_book"]) : undefined) : 0; return { ...r, asset_name: a?.["asset_name"], current_asset_value: v, asset_value: v }; });
  const service_items = rows(d, "service_items").map((r) => ({ ...r, amount: r2(n(r["qty"]) * n(r["rate"])) }));
  const s = r2(stock_items.reduce((t, r) => t + n(r["amount"]), 0)), a = r2(asset_items.reduce((t, r) => t + n(r["asset_value"]), 0)), v = r2(service_items.reduce((t, r) => t + n(r["amount"]), 0));
  return { stock_items, asset_items, service_items, stock_items_total: s, asset_items_total: a, service_items_total: v, total_value: r2(s + a + v), target_incoming_rate: r2(s + a + v) };
};
export function capitalizationErrors(d: Doc): string[] {
  const e: string[] = []; const t = adapter.get("Asset", String(d["target_asset"] ?? ""));
  if (!t) return ["Target Asset is mandatory"];
  if (n(t.docstatus) !== 0) e.push(`Target Asset ${t.name} must be a draft (Work In Progress) asset`);
  if (t["asset_type"] && t["asset_type"] !== "Composite Asset") e.push(`Target Asset ${t.name} must be a Composite Asset`);
  if (d["company"] && t["company"] !== d["company"]) e.push(`Target Asset ${t.name} does not belong to company ${d["company"]}`);
  if (adapter.list("Asset Capitalization").some((x) => x.name !== d.name && n(x.docstatus) === 1 && x["target_asset"] === t.name)) e.push(`Target Asset ${t.name} is already capitalized`);
  if (!rows(d, "stock_items").length && !rows(d, "asset_items").length && !rows(d, "service_items").length) e.push("Consumed Stock Items, Consumed Asset Items or Service Items is mandatory for Capitalization");
  for (const r of rows(d, "asset_items")) {
    const a = adapter.get("Asset", String(r["asset"] ?? "")); const i = r["idx"] ?? 1;
    if (!a) { e.push(`Row #${i}: Consumed Asset ${r["asset"] ?? ""} not found`); continue; }
    if (a.name === t.name) e.push(`Row #${i}: Target Asset cannot be consumed`);
    if (n(a.docstatus) !== 1) e.push(`Row #${i}: Consumed Asset ${a.name} must be submitted`);
    if (DEAD.includes(String(a["status"])) || a["status"] === "Work In Progress") e.push(`Row #${i}: Consumed Asset ${a.name} cannot be ${a["status"]}`);
    if (a["company"] !== t["company"]) e.push(`Row #${i}: Consumed Asset ${a.name} belongs to another company`);
  }
  for (const r of rows(d, "stock_items")) if (!r["warehouse"] || !(n(r["stock_qty"]) > 0)) e.push(`Row #${r["idx"] ?? 1}: Warehouse and Qty are mandatory`);
  for (const r of rows(d, "service_items")) if (!r["expense_account"] || !(n(r["qty"]) * n(r["rate"]) > 0)) e.push(`Row #${r["idx"] ?? 1}: Expense Account and Amount are mandatory`);
  return e;
}
function submitCapitalization(name: string) {
  const d = adapter.get("Asset Capitalization", name)!; const t = adapter.get("Asset", String(d["target_asset"]))!; const acc = assetAccounts(t); const date = String(d["posting_date"] ?? today()).slice(0, 10);
  const ab = String(adapter.get("Company", String(t["company"]))?.["abbr"] ?? ""); const patch: Row = {};
  if (rows(d, "stock_items").length) {
    const se = adapter.insertDoc("Stock Entry", { company: t["company"], stock_entry_type: "Material Issue", purpose: "Material Issue", posting_date: date, remarks: `Asset Capitalization ${name}`,
      items: rows(d, "stock_items").map((r, i) => ({ idx: i + 1, item_code: r["item_code"], s_warehouse: r["warehouse"], qty: n(r["stock_qty"]), transfer_qty: n(r["stock_qty"]), basic_rate: n(r["valuation_rate"]), uom: r["stock_uom"] ?? "Nos", stock_uom: r["stock_uom"] ?? "Nos", conversion_factor: 1 })), docstatus: 0 });
    const errs = submit("Stock Entry", se.name); if (errs.length) throw new Error(errs.join("; ")); patch["stock_entry"] = se.name;
  }
  const lines: Row[] = []; const ref = { reference_type: "Asset", reference_name: t.name, cost_center: d["cost_center"] ?? "" };
  for (const r of rows(d, "asset_items")) {
    const a = adapter.get("Asset", String(r["asset"]))!; const ac2 = assetAccounts(a);
    if (assetInternals.liveSchedules(a.name).length) postDepreciation(a.name, date); // depreciate_asset up to capitalization date
    const b = adapter.get("Asset", a.name)!; const cost = assetInternals.costOf(b), accum = accumulated(a.name), nbv = r2(cost - accum);
    lines.push({ account: ac2.fixed, credit: cost, reference_type: "Asset", reference_name: a.name });
    if (accum) lines.push({ account: ac2.accumulated, debit: accum, reference_type: "Asset", reference_name: a.name });
    lines.push({ account: acc.fixed, debit: nbv, ...ref });
    adapter.update("Asset", a.name, { __status_before_capitalization: b["status"], status: "Capitalized", disposal_date: date });
  }
  for (const r of rows(d, "service_items")) { const amt = r2(n(r["qty"]) * n(r["rate"])); lines.push({ account: r["expense_account"], credit: amt, ...ref }, { account: acc.fixed, debit: amt, ...ref }); }
  if (n(d["stock_items_total"])) lines.push({ account: resolveName("Account", `Stock Adjustment - ${ab}`), credit: n(d["stock_items_total"]), ...ref }, { account: acc.fixed, debit: n(d["stock_items_total"]), ...ref });
  if (lines.length) patch["journal_entry"] = assetInternals.je(t["company"], date, `Asset Capitalization ${name}`, lines, { voucher_type: "Journal Entry" });
  // consumed asset values at the posting date (after depreciating up to it), as get_value_after_depreciation_on_disposal_date
  const assetTotal = r2(lines.filter((l) => l["reference_name"] === t.name && l["debit"]).reduce((s2, l) => s2 + n(l["debit"]), 0) - n(d["service_items_total"]) - n(d["stock_items_total"]));
  const total = r2(assetTotal + n(d["service_items_total"]) + n(d["stock_items_total"]));
  adapter.update("Asset Capitalization", name, { ...patch, asset_items_total: assetTotal, total_value: total, target_incoming_rate: total });
  // target asset gets the capitalized value (update_target_asset)
  adapter.update("Asset", t.name, { gross_purchase_amount: total, net_purchase_amount: total, purchase_amount: total, value_after_depreciation: total, capitalized_in: name });
}
function cancelCapitalization(name: string) {
  const d = adapter.get("Asset Capitalization", name)!; const t = adapter.get("Asset", String(d["target_asset"]))!;
  if (n(t.docstatus) === 1) throw new Error(`Cancel the target Asset ${t.name} before cancelling its Asset Capitalization`);
  if (d["journal_entry"]) cancel("Journal Entry", String(d["journal_entry"]));
  if (d["stock_entry"]) cancel("Stock Entry", String(d["stock_entry"]));
  for (const r of rows(d, "asset_items")) { const a = adapter.get("Asset", String(r["asset"])); if (a?.["status"] === "Capitalized") { adapter.update("Asset", a.name, { status: String(a["__status_before_capitalization"] || "Submitted"), disposal_date: "" }); assetInternals.refreshAsset(a.name); } }
  adapter.update("Asset", t.name, { gross_purchase_amount: 0, net_purchase_amount: 0, purchase_amount: 0, value_after_depreciation: 0, capitalized_in: "" });
}
registerDocHook("Asset Capitalization", (doc, before) => {
  const from = n(before?.docstatus), to = n(doc.docstatus);
  const d: Doc = from === 0 ? { ...doc, ...capTotals(doc) } : doc;
  if (from === 0 && to === 1) { const errors = capitalizationErrors(d); return errors.length ? { doc: d, errors } : { doc: d, after: (x) => { if (!x["journal_entry"] && !x["stock_entry"]) submitCapitalization(x.name); } }; }
  if (from === 1 && to === 2) { const t = adapter.get("Asset", String(doc["target_asset"] ?? "")); if (t && n(t.docstatus) === 1) return { doc, errors: [`Cancel the target Asset ${t.name} before cancelling its Asset Capitalization`] }; return { doc, after: (x) => cancelCapitalization(x.name) }; }
  return { doc: d };
});

// ---------------- Asset Shift Allocation ----------------
const shiftSchedule = (d: Doc) => { const a = adapter.get("Asset", String(d["asset"] ?? "")); return a ? scheduleOf(a.name, String(d["finance_book"] ?? "")) : undefined; };
/** fetch_and_set_depr_schedule: a new allocation starts from the asset's current rows. */
const scheduleRows = (s: Doc) => rows(s, "depreciation_schedule").map((r, i) => ({ idx: i + 1, schedule_date: r["schedule_date"], depreciation_amount: r["depreciation_amount"], accumulated_depreciation_amount: r["accumulated_depreciation_amount"], journal_entry: r["journal_entry"] ?? "", shift: r["shift"] ?? "" }));
export function shiftAllocationErrors(d: Doc): string[] {
  const e: string[] = []; const a = adapter.get("Asset", String(d["asset"] ?? ""));
  if (!a) return ["Asset is mandatory"];
  if (n(a.docstatus) !== 1) e.push(`Asset ${a.name} must be submitted`);
  if (DEAD.includes(String(a["status"]))) e.push(`Asset ${a.name} is ${a["status"]}`);
  const s = shiftSchedule(d); if (!s) return [...e, `Asset ${a.name} has no depreciation schedule${d["finance_book"] ? ` for Finance Book ${d["finance_book"]}` : ""}`];
  const book = rows(a, "finance_books").find((b) => String(b["finance_book"] ?? "") === String(d["finance_book"] ?? ""));
  if (!n(s["shift_based"]) && !n(book?.["shift_based"])) e.push(`Asset ${a.name} is not using shift based depreciation`);
  const f = shiftFactors(); const want = rows(d, "depreciation_schedule"); const cur = rows(s, "depreciation_schedule");
  if (!want.length) e.push("Depreciation Schedule is mandatory");
  want.forEach((r, i) => { if (!f.has(String(r["shift"] ?? ""))) e.push(`Row #${i + 1}: Shift ${r["shift"] || "(empty)"} is not an Asset Shift Factor`); });
  cur.forEach((r, i) => { if (assetInternals.posted(r) && String(want[i]?.["shift"] ?? "") !== String(r["shift"] ?? "")) e.push(`Row #${i + 1}: Asset ${a.name} can't have its shift changed for depreciation that has already been booked`); });
  if (!e.length) { try { allocateShifts(cur.map((r) => String(r["shift"] ?? "")), want.map((r) => String(r["shift"])), n(s["total_number_of_depreciations"]) || cur.length, cur.filter(assetInternals.posted).length, f); } catch (x) { e.push((x as Error).message); } }
  return e;
}
function submitShiftAllocation(name: string) {
  const d = adapter.get("Asset Shift Allocation", name)!; const s = shiftSchedule(d)!; const cur = rows(s, "depreciation_schedule");
  const shifts = allocateShifts(cur.map((r) => String(r["shift"] ?? "")), rows(d, "depreciation_schedule").map((r) => String(r["shift"])), n(s["total_number_of_depreciations"]) || cur.length, cur.filter(assetInternals.posted).length);
  const next = applyShifts(s.name, shifts);
  adapter.update("Asset Shift Allocation", name, { depreciation_schedule: scheduleRows(next) });
}
registerDocHook("Asset Shift Allocation", (doc, before) => {
  const from = n(before?.docstatus), to = n(doc.docstatus);
  if (to === 0 && !rows(doc, "depreciation_schedule").length) { const s = shiftSchedule(doc); if (s) return { doc: { ...doc, depreciation_schedule: scheduleRows(s) } }; }
  if (from === 0 && to === 1) { const errors = shiftAllocationErrors(doc); return errors.length ? { doc, errors } : { doc, after: (x) => submitShiftAllocation(x.name) }; }
  // asset_shift_allocation.py has no on_cancel: cancelling keeps the schedule it produced
  return { doc };
});
