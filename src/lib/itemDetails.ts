/**
 * Owner note 6 LINK-02/03: what choosing an item fills on a selling or buying row — port of the parts of erpnext
 * stock/get_item_details.py (get_basic_details, get_price_list_rate, get_item_tax_template, get_default_income/
 * expense_account, get_conversion_factor) and transaction.js taxes_and_charges / get_default_taxes_and_charges that
 * read stored records only. Totals stay in formCalc.ts; nothing here posts or invents a value the records lack.
 */
import { adapter, type Doc } from "./adapter";
import { cachedMeta } from "./catalog";

const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => Number(v) || 0;
const today = () => new Date().toISOString().slice(0, 10);

const SELLING = new Set(["Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "POS Invoice"]);
const BUYING = new Set(["Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Material Request", "Request for Quotation"]);
export type Side = "selling" | "buying";
export const sideOf = (parentDt: string): Side | null => (SELLING.has(parentDt) ? "selling" : BUYING.has(parentDt) ? "buying" : null);

const fieldsOf = (dt: string): Set<string> | null => { const m = cachedMeta(dt); return m ? new Set(m.fields.map((f) => f.fieldname ?? "").filter(Boolean)) : null; };
/** A child table whose rows pick an Item (item_code Link → Item) under a selling or buying document. */
export function isItemTable(parentDt: string, childDt: string): boolean {
  if (!sideOf(parentDt)) return false;
  const m = cachedMeta(childDt); if (!m) return false;
  return m.fields.some((f) => f.fieldname === "item_code" && f.fieldtype === "Link" && f.options === "Item");
}

const valid = (p: Doc, d: string) => (!s(p["valid_from"]) || s(p["valid_from"]).slice(0, 10) <= d) && (!s(p["valid_upto"]) || s(p["valid_upto"]).slice(0, 10) >= d);
/** get_price_list_rate: the price list's Item Price for the item (party- and unit-specific rows first, valid today). */
export function priceListRate(item: string, priceList: string, uom = "", party: { customer?: string; supplier?: string } = {}, on = today()): { rate: number; uom: string } | null {
  const rows = adapter.list("Item Price").filter((p) => s(p["item_code"]) === item && s(p["price_list"]) === priceList && valid(p, on)
    && (!s(p["customer"]) || s(p["customer"]) === s(party.customer)) && (!s(p["supplier"]) || s(p["supplier"]) === s(party.supplier)));
  if (!rows.length) return null;
  const score = (p: Doc) => (s(p["customer"]) || s(p["supplier"]) ? 2 : 0) + (uom && s(p["uom"]) === uom ? 1 : 0) - (uom && s(p["uom"]) && s(p["uom"]) !== uom ? 4 : 0);
  const best = [...rows].sort((a, b) => score(b) - score(a))[0]!;
  return { rate: n(best["price_list_rate"]), uom: s(best["uom"]) };
}

function priceListOf(parent: Doc, side: Side): string {
  if (side === "selling") return s(parent["selling_price_list"]) || s(adapter.get("Selling Settings", "Selling Settings")?.["selling_price_list"]) || "Standard Selling";
  return s(parent["buying_price_list"]) || s(adapter.get("Buying Settings", "Buying Settings")?.["buying_price_list"]) || "Standard Buying";
}
/** A document without a price list takes the one its rows were priced from, with its currency and a 1:1 rate in the same currency. */
export function priceListPatch(meta: { fields: { fieldname?: string }[] }, parent: Doc): Record<string, unknown> {
  const side = sideOf(s(parent["doctype"])); if (!side) return {};
  const f = side === "selling" ? "selling_price_list" : "buying_price_list";
  if (s(parent[f]) || !meta.fields.some((x) => x.fieldname === f)) return {};
  const pl = priceListOf(parent, side); const cur = s(adapter.get("Price List", pl)?.["currency"]) || s(parent["currency"]);
  const out: Record<string, unknown> = { [f]: pl };
  if (!s(parent["price_list_currency"]) && cur) out["price_list_currency"] = cur;
  if (!n(parent["plc_conversion_rate"]) && cur && cur === s(parent["currency"])) out["plc_conversion_rate"] = 1;
  return out;
}
const conversion = (item: Doc, uom: string) => (uom === s(item["stock_uom"]) ? 1 : n(((item["uoms"] as Doc[] | undefined) ?? []).find((u) => s(u["uom"]) === uom)?.["conversion_factor"]) || 1);
const itemDefault = (item: Doc, company: string) => ((item["item_defaults"] as Doc[] | undefined) ?? []).find((d) => s(d["company"]) === company);

/** get_item_tax_template: the item's own Item Tax row valid today (matching the document's tax category, else a blank one). */
export function itemTaxTemplate(item: Doc, taxCategory = "", on = today()): string {
  const rows = ((item["taxes"] as Doc[] | undefined) ?? []).filter((r) => s(r["item_tax_template"]) && (!s(r["valid_from"]) || s(r["valid_from"]).slice(0, 10) <= on))
    .sort((a, b) => s(b["valid_from"]).localeCompare(s(a["valid_from"])));
  return s((rows.find((r) => s(r["tax_category"]) === taxCategory) ?? rows.find((r) => !s(r["tax_category"])))?.["item_tax_template"]);
}
/** Item Tax Template rows as the item_tax_rate JSON the row carries ({ account: rate }). */
export function itemTaxRate(template: string): string {
  const t = template ? adapter.get("Item Tax Template", template) : undefined; if (!t) return "";
  const map: Record<string, number> = {}; for (const r of (t["taxes"] as Doc[] | undefined) ?? []) if (s(r["tax_type"])) map[s(r["tax_type"])] = n(r["tax_rate"]);
  return Object.keys(map).length ? JSON.stringify(map) : "";
}

function only(childDt: string, patch: Record<string, unknown>): Record<string, unknown> {
  const fs = fieldsOf(childDt); const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && v !== "" && (!fs || fs.has(k))) out[k] = v;
  return out;
}

/** Row values when an item is chosen (LINK-02): names, unit + conversion, price-list price, tax template, accounts, warehouse. */
export function itemRowPatch(parent: Doc, childDt: string, row: Doc): Record<string, unknown> {
  const side = sideOf(s(parent["doctype"])); const item = s(row["item_code"]) ? adapter.get("Item", s(row["item_code"])) : undefined;
  if (!side || !item) return {};
  const company = s(parent["company"]); const co = company ? adapter.get("Company", company) : undefined; const def = itemDefault(item, company);
  const uom = (side === "selling" ? s(item["sales_uom"]) : s(item["purchase_uom"])) || s(item["stock_uom"]);
  const cf = conversion(item, uom);
  const pl = priceListOf(parent, side);
  const hit = priceListRate(item.name, pl, uom, { customer: s(parent["customer"] || parent["party_name"]), supplier: s(parent["supplier"]) });
  // a price kept for the stock unit is scaled to the row unit, as get_price_list_rate does
  const plRate = hit ? (hit.uom && hit.uom !== s(item["stock_uom"]) ? hit.rate : hit.rate * cf) : n(side === "selling" ? item["standard_rate"] : item["last_purchase_rate"] || item["standard_rate"]) * cf;
  const tpl = itemTaxTemplate(item, s(parent["tax_category"]));
  const stock = n(item["is_stock_item"]) === 1;
  return only(childDt, {
    item_name: s(item["item_name"]) || item.name, description: s(item["description"]) || s(item["item_name"]), item_group: s(item["item_group"]), brand: s(item["brand"]), image: s(item["image"]),
    stock_uom: s(item["stock_uom"]), uom, conversion_factor: cf, qty: n(row["qty"]) > 0 ? undefined : 1,
    price_list_rate: plRate || undefined, rate: plRate || undefined, discount_percentage: plRate ? 0 : undefined,
    item_tax_template: tpl, item_tax_rate: itemTaxRate(tpl),
    income_account: side === "selling" ? s(def?.["income_account"]) || s(co?.["default_income_account"]) : undefined,
    expense_account: s(def?.["expense_account"]) || s(co?.["default_expense_account"]),
    warehouse: stock ? s(def?.["default_warehouse"]) || s(parent["set_warehouse"]) : undefined,
    cost_center: s(def?.[side === "selling" ? "selling_cost_center" : "buying_cost_center"]) || s(parent["cost_center"]) || s(co?.["cost_center"]),
  });
}

/** Unit change on a row: conversion factor and the price for that unit (an Item Price kept for the unit wins). */
export function uomRowPatch(parent: Doc, childDt: string, row: Doc): Record<string, unknown> {
  const side = sideOf(s(parent["doctype"])); const item = s(row["item_code"]) ? adapter.get("Item", s(row["item_code"])) : undefined;
  if (!side || !item || !s(row["uom"])) return {};
  const cf = conversion(item, s(row["uom"]));
  const hit = priceListRate(item.name, priceListOf(parent, side), s(row["uom"]), { customer: s(parent["customer"] || parent["party_name"]), supplier: s(parent["supplier"]) });
  const base = hit ? (hit.uom === s(row["uom"]) ? hit.rate : hit.rate * cf) : 0;
  return only(childDt, { conversion_factor: cf, ...(base ? { price_list_rate: base, rate: base } : {}) });
}

const TAX_TEMPLATE: Record<Side, string> = { selling: "Sales Taxes and Charges Template", buying: "Purchase Taxes and Charges Template" };
/** get_default_taxes_and_charges: the company's default (is_default) tax template for the side. */
export function defaultTaxTemplate(parent: Doc): string {
  const side = sideOf(s(parent["doctype"])); if (!side) return "";
  const company = s(parent["company"]);
  const t = adapter.list(TAX_TEMPLATE[side]).find((x) => n(x["is_default"]) === 1 && !n(x["disabled"]) && (!company || s(x["company"]) === company));
  return t?.name ?? "";
}
/** taxes_and_charges → the template's tax rows copied into the document (amounts recomputed by formCalc). */
export function templateTaxes(parent: Doc, template: string): Doc[] | null {
  const side = sideOf(s(parent["doctype"])); if (!side || !template) return null;
  const t = adapter.get(TAX_TEMPLATE[side], template); if (!t) return null;
  return ((t["taxes"] as Doc[] | undefined) ?? []).map((r, i) => {
    const { name: _n, parent: _p, parentfield: _pf, parenttype: _pt, creation: _c, modified: _m, owner: _o, ...rest } = r as Doc & Record<string, unknown>;
    return { ...rest, idx: i + 1, tax_amount: 0, total: 0 } as unknown as Doc;
  });
}
