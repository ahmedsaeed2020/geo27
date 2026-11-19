/**
 * DIGIT CRM — Wave 3: Deal item lines → draft ERPNext Quotation, stage history, targets, campaign attribution,
 * automation/settings inventory. Canonical records only (adapter); no GL/stock writes; quotations stay Draft.
 *
 * Source facts (inspected this run):
 * - CRM Deal.products → Table "CRM Products"; CRM Products.product_code → Link "CRM Product" (autoname field:product_code).
 * - ERPNext CRM integration mirrors CRM Product ⇄ Item by identical code (erpnext_crm_settings.sync_products), so a deal
 *   line picked from an ERPNext Item ensures a CRM Product with product_code = item_code (insert-if-missing).
 * - Quotation.quotation_to is Link→DocType; Frappe CRM's create-quotation path quotes the ERPNext Prospect created
 *   against the deal until a Customer exists (create_prospect_against_crm_deal). Correlation key: Quotation.crm_deal.
 * - CRM Deal has no price-list field: `digit_price_list` is a PROPOSED custom field (docs/digit-app-builder/FRAPPE_EXPORT_MAP.md).
 * - Stage history = CRM Deal.status_change_log, appended by the existing dealHook (src/lib/crmLogic.ts).
 * - Targets = Sales Person.targets (Target Detail: item_group, fiscal_year, target_qty, target_amount).
 */
import { adapter, type Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { lastCrmActivity } from "@/lib/crmActivity";
import { SYN_COMPANY } from "@/lib/seed";
import { userPermissions } from "@/lib/session";
import { isManager, scopedLeads } from "./wf01";
import { customerForDeal, dealStatusType, dealValue, scopedDeals, isOpenDeal } from "./wf02";

export type Line = { item_code: string; qty: number; rate: number; discount_percentage?: number };
export type LineError = { row: number; field: string; error: string };
type Result = { ok: true; name: string; existing?: boolean } | { ok: false; error: string; rows?: LineError[] };

const rows = (v: unknown) => (Array.isArray(v) ? (v as Doc[]) : []);
const canEdit = (d: Doc, user: string) => isManager(user) || d["deal_owner"] === user;

/** Company the ERPNext handoff targets: ERPNext CRM Settings.erpnext_company, else the demo company, else the base company. */
export function handoffCompany(): string {
  const s = adapter.get("ERPNext CRM Settings", "ERPNext CRM Settings");
  const c = String(s?.["erpnext_company"] ?? "");
  if (c && adapter.get("Company", c)) return c;
  return adapter.get("Company", "Digit Demo Trading Co.") ? "Digit Demo Trading Co." : SYN_COMPANY;
}
export const sellingPriceLists = () => adapter.list("Price List").filter((p) => Number(p["selling"]) === 1 && Number(p["enabled"] ?? 1) === 1);
export const sellableItems = () => adapter.list("Item").filter((i) => !Number(i["disabled"]) && !Number(i["has_variants"]));
/** Item Price on the price list, else Item.standard_rate; null when no source price exists. */
export function priceFor(item: string, priceList: string): number | null {
  const ip = adapter.list("Item Price").find((p) => p["item_code"] === item && p["price_list"] === priceList);
  if (ip) return Number(ip["price_list_rate"] ?? 0);
  const it = adapter.get("Item", item);
  return it && it["standard_rate"] != null ? Number(it["standard_rate"]) : null;
}
export const dealPriceList = (d: Doc) => String(d["digit_price_list"] || "") || (adapter.get("Price List", "Standard Selling") ? "Standard Selling" : String(sellingPriceLists()[0]?.name ?? ""));
/** Resolve a deal product row to an ERPNext Item (same code), or undefined. */
export const itemOfRow = (r: Doc) => { const c = String(r["product_code"] ?? ""); return c ? adapter.get("Item", c) : undefined; };

export function validateLines(lines: Line[], priceList: string, currency: string): LineError[] {
  const errs: LineError[] = [];
  const pl = adapter.get("Price List", priceList);
  if (!pl || Number(pl["selling"]) !== 1) errs.push({ row: 0, field: "price_list", error: "Select a selling price list" });
  else if (pl["currency"] && currency && pl["currency"] !== currency) errs.push({ row: 0, field: "currency", error: `Price list currency ${pl["currency"]} does not match deal currency ${currency}` });
  lines.forEach((l, i) => {
    const it = l.item_code ? adapter.get("Item", l.item_code) : undefined;
    if (!it) errs.push({ row: i + 1, field: "item_code", error: "Select an existing Item" });
    else if (Number(it["disabled"])) errs.push({ row: i + 1, field: "item_code", error: "Item is disabled" });
    if (!(Number(l.qty) > 0)) errs.push({ row: i + 1, field: "qty", error: "Quantity must be greater than 0" });
    if (!(Number(l.rate) >= 0) || l.rate === null || Number.isNaN(Number(l.rate))) errs.push({ row: i + 1, field: "rate", error: "Rate must be 0 or more" });
    const dp = Number(l.discount_percentage ?? 0); if (dp < 0 || dp > 100) errs.push({ row: i + 1, field: "discount_percentage", error: "Discount must be between 0 and 100" });
  });
  return errs;
}

/** Save the deal's product lines (CRM Products) from ERPNext Items; ensures the mirrored CRM Product. Totals by dealHook/updateProducts. */
export function saveDealLines(deal: string, lines: Line[], priceList: string, user: string): Result {
  const d = adapter.get("CRM Deal", deal);
  if (!d || !canEdit(d, user)) return { ok: false, error: "Not permitted" };
  if (dealStatusType(d["status"]) === "Lost") return { ok: false, error: "Lost deals cannot be edited" };
  const currency = String(d["currency"] || "SAR");
  const errs = validateLines(lines, priceList, currency);
  if (errs.length) return { ok: false, error: errs[0]!.error, rows: errs };
  for (const l of lines) {
    const it = adapter.get("Item", l.item_code)!;
    if (!adapter.get("CRM Product", l.item_code)) adapter.insertDoc("CRM Product", { name: l.item_code, product_code: l.item_code, product_name: String(it["item_name"] ?? l.item_code), standard_rate: Number(it["standard_rate"] ?? 0), disabled: 0 });
  }
  const products = lines.map((l, i) => ({ idx: i + 1, product_code: l.item_code, product_name: String(adapter.get("Item", l.item_code)?.["item_name"] ?? l.item_code), qty: Number(l.qty), rate: Number(l.rate), discount_percentage: Number(l.discount_percentage ?? 0) }));
  adapter.update("CRM Deal", deal, { products, digit_price_list: priceList });
  return { ok: true, name: deal };
}

export const quotationsOf = (deal: string) => adapter.list("Quotation").filter((q) => q["crm_deal"] === deal);
/** Party for the quotation: linked Customer, else the Prospect created against this deal (reused). */
export function partyFor(d: Doc): { type: "Customer" | "Prospect"; name: string } | null {
  const c = customerForDeal(d.name); if (c) return { type: "Customer", name: c.name };
  const p = adapter.list("Prospect").find((x) => x["crm_deal"] === d.name); if (p) return { type: "Prospect", name: p.name };
  return null;
}

/** Deal → Draft ERPNext Quotation. Idempotent per deal (open Draft or Submitted quotation is returned, never duplicated). */
export function createQuotation(deal: string, user: string): Result {
  const d = adapter.get("CRM Deal", deal);
  if (!d || !canEdit(d, user)) return { ok: false, error: "Not permitted" };
  if (dealStatusType(d["status"]) === "Lost") return { ok: false, error: "Lost deals cannot be quoted" };
  const live = quotationsOf(deal).find((q) => Number(q["docstatus"]) !== 2);
  if (live) return { ok: true, name: live.name, existing: true };
  const company = handoffCompany();
  const allowed = userPermissions(user, "Quotation").get("Company");
  if (allowed && !allowed.has(company)) return { ok: false, error: `Not permitted for company ${company}` };
  const prods = rows(d["products"]);
  if (!prods.length) return { ok: false, error: "Add products to the deal before creating a quotation" };
  const priceList = dealPriceList(d), currency = String(d["currency"] || "SAR");
  const errs = validateLines(prods.map((p) => ({ item_code: String(p["product_code"] ?? ""), qty: Number(p["qty"] ?? 0), rate: Number(p["rate"] ?? 0), discount_percentage: Number(p["discount_percentage"] ?? 0) })), priceList, currency);
  if (errs.length) return { ok: false, error: errs[0]!.row ? `Line ${errs[0]!.row}: ${errs[0]!.error}` : errs[0]!.error, rows: errs };
  const org = String(d["organization"] || d["organization_name"] || "").trim();
  let party = partyFor(d);
  if (!party) {
    if (!org) return { ok: false, error: "Deal has no organization" };
    const p = adapter.get("Prospect", org) ?? adapter.insertDoc("Prospect", { name: org, company_name: org, territory: String(d["territory"] || ""), industry: String(d["industry"] || ""), website: d["website"] ?? "", company, crm_deal: deal, prospect_owner: String(d["deal_owner"] || user) });
    if (!p["crm_deal"]) adapter.update("Prospect", p.name, { crm_deal: deal });
    party = { type: "Prospect", name: p.name };
  }
  const items = prods.map((p) => {
    const it = adapter.get("Item", String(p["product_code"]))!;
    const qty = Number(p["qty"]), plr = Number(p["rate"]), dp = Number(p["discount_percentage"] ?? 0), rate = +(plr * (1 - dp / 100)).toFixed(2);
    return { item_code: it.name, item_name: String(it["item_name"] ?? it.name), description: String(it["description"] ?? it["item_name"] ?? ""), qty, uom: String(it["stock_uom"] ?? "Nos"), stock_uom: String(it["stock_uom"] ?? "Nos"), conversion_factor: 1, stock_qty: qty, price_list_rate: plr, discount_percentage: dp, rate, amount: +(qty * rate).toFixed(2), net_rate: rate, net_amount: +(qty * rate).toFixed(2) };
  });
  const total = +items.reduce((a, i) => a + i.amount, 0).toFixed(2);
  const tax = adapter.list("Sales Taxes and Charges Template").find((t) => t["company"] === company && Number(t["is_default"]));
  const today = new Date().toISOString().slice(0, 10);
  const valid = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const q = adapter.insertDoc("Quotation", {
    naming_series: "SAL-QTN-.YYYY.-", quotation_to: party.type, party_name: party.name, customer_name: party.type === "Customer" ? adapter.get("Customer", party.name)?.["customer_name"] ?? org : org,
    transaction_date: today, valid_till: valid, order_type: "Sales", company, currency, conversion_rate: 1, selling_price_list: priceList,
    price_list_currency: String(adapter.get("Price List", priceList)?.["currency"] ?? currency), plc_conversion_rate: 1,
    taxes_and_charges: tax?.name ?? "", status: "Draft", docstatus: 0, is_active: 1, items, total_qty: items.reduce((a, i) => a + i.qty, 0),
    total, net_total: total, base_total: total, base_net_total: total, grand_total: total, base_grand_total: total, rounded_total: Math.round(total),
    crm_deal: deal, opportunity: "", territory: String(d["territory"] || ""),
  });
  return { ok: true, name: q.name };
}

/* ---------- stage history / aging (CRM Status Change Log) ---------- */
export type StageLog = { from: string; to: string; from_date: string; to_date: string; duration: number; owner: string };
export function stageHistory(d: Doc): StageLog[] {
  return rows(d["status_change_log"]).map((r) => ({ from: String(r["from"] ?? ""), to: String(r["to"] ?? ""), from_date: String(r["from_date"] ?? ""), to_date: String(r["to_date"] ?? ""), duration: Number(r["duration"] ?? 0), owner: String(r["log_owner"] ?? "") }));
}
/**
 * W-039 and drill "move:" share this rule. A stage change is a status_change_log row with a next stage (`to`); it happened on
 * its to_date. Window: to_date's calendar date within [today − days, today] (UTC dates), so the card and its drill agree at
 * any time of day. A deal's creation (the first row's from_date) is not a change. Each deal counts once in `deals`.
 */
export function stageMoves(deals: Doc[], today: string, days = 30) {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - days * 864e5).toISOString().slice(0, 10);
  const statuses = adapter.list("CRM Deal Status"), pos = new Map(statuses.map((s) => [s.name, Number(s["position"] ?? 0)])), type = new Map(statuses.map((s) => [s.name, String(s["type"] ?? "")]));
  const moved: Doc[] = []; let forward = 0, backward = 0, lost = 0;
  for (const d of deals) {
    let hit = false;
    for (const h of stageHistory(d)) {
      const on = h.to_date.slice(0, 10);
      if (!h.to || !on || on < since || on > today) continue;
      hit = true;
      if (type.get(h.to) === "Lost") lost++; else if ((pos.get(h.to) ?? 0) < (pos.get(h.from) ?? 0)) backward++; else forward++;
    }
    if (hit) moved.push(d);
  }
  return { deals: moved, forward, backward, lost };
}
/** Days in current stage from the open log row; null when the source log has no open row. */
export function stageAgeDays(d: Doc, now = Date.now()): number | null {
  const open = stageHistory(d).filter((r) => !r.to).pop();
  const t = open ? Date.parse(open.from_date) : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 864e5)) : null;
}
let nextVersion = -1;
const nextByRef = new Map<string, Doc>();
/** Earliest-due open task per referenced record; index rebuilt only when the adapter version changes. */
export function nextAction(deal: string): Doc | undefined {
  if (nextVersion !== adapter.version()) {
    nextByRef.clear();
    for (const t of adapter.list("CRM Task")) {
      if (["Done", "Canceled"].includes(String(t["status"]))) continue;
      const key = String(t["reference_docname"]), cur = nextByRef.get(key);
      if (!cur || String(t["due_date"] ?? "9").localeCompare(String(cur["due_date"] ?? "9")) < 0) nextByRef.set(key, t);
    }
    nextVersion = adapter.version();
  }
  return nextByRef.get(deal);
}
export function lastActivity(deal: string): string {
  return lastCrmActivity("CRM Deal", deal);
}

/* ---------- Targets (Sales Person.targets / Target Detail) ---------- */
export type TargetRow = { salesPerson: string; user: string; label: string; parent: string; fiscalYear: string; itemGroup: string; qty: number; amount: number; distribution: string };
/** Login user behind a Sales Person through the native link Sales Person.employee → Employee.user_id ("" when unlinked). */
export function salesPersonUser(sp: Doc | undefined): string {
  const emp = sp?.["employee"] ? adapter.get("Employee", String(sp["employee"])) : undefined;
  return String(emp?.["user_id"] ?? "");
}
/** Sales Person record of a login user (native employee link first, then a Sales Person named after the user). */
export function salesPersonOf(user: string): Doc | undefined {
  const all = adapter.list("Sales Person").filter((p) => !Number(p["is_group"]));
  return all.find((p) => salesPersonUser(p) === user) ?? all.find((p) => p["sales_person_name"] === user || p.name === user);
}
/** Target Detail rows; with `user`, only Sales Persons that user may read (same permission engine as every list). */
export function targets(user?: string): TargetRow[] {
  const people = user === undefined ? adapter.list("Sales Person") : scopedList("Sales Person", user);
  return people.flatMap((sp) => rows(sp["targets"]).map((t) => ({ salesPerson: sp.name, user: salesPersonUser(sp), label: String(sp["sales_person_name"] ?? sp.name), parent: String(sp["parent_sales_person"] ?? ""), fiscalYear: String(t["fiscal_year"] ?? ""), itemGroup: String(t["item_group"] ?? ""), qty: Number(t["target_qty"] ?? 0), amount: Number(t["target_amount"] ?? 0), distribution: String(t["distribution_id"] ?? "") })));
}
/** Add a native Target Detail row on the Sales Person (managers only). Achievement basis is not computed here. */
export function addTarget(salesPerson: string, t: { fiscal_year: string; item_group?: string; target_amount: number; target_qty?: number }, user: string): Result {
  if (!isManager(user)) return { ok: false, error: "Only Sales Managers can set targets" };
  const sp = adapter.get("Sales Person", salesPerson); if (!sp) return { ok: false, error: "Select a Sales Person" };
  if (!t.fiscal_year || !adapter.get("Fiscal Year", t.fiscal_year)) return { ok: false, error: "Select an existing Fiscal Year" };
  if (!(Number(t.target_amount) > 0) && !(Number(t.target_qty) > 0)) return { ok: false, error: "Enter a target amount or quantity" };
  if (t.item_group && !adapter.get("Item Group", t.item_group)) return { ok: false, error: "Select an existing Item Group" };
  const cur = rows(sp["targets"]);
  if (cur.some((r) => r["fiscal_year"] === t.fiscal_year && String(r["item_group"] ?? "") === String(t.item_group ?? ""))) return { ok: false, error: "A target for this fiscal year and item group already exists" };
  adapter.update("Sales Person", salesPerson, { targets: [...cur, { idx: cur.length + 1, fiscal_year: t.fiscal_year, item_group: t.item_group ?? "", target_amount: Number(t.target_amount || 0), target_qty: Number(t.target_qty || 0) }] });
  return { ok: true, name: salesPerson };
}
/** Attributed achievement: submitted Sales Orders' sales_team allocations for the person within the fiscal year (ERPNext
 *  Sales Person Target Variance basis); null when no attribution rows exist. With `user`, only orders that user may read. */
export function achievement(salesPerson: string, fiscalYear: string, user?: string): number | null {
  const fy = adapter.get("Fiscal Year", fiscalYear); const from = String(fy?.["year_start_date"] ?? ""), to = String(fy?.["year_end_date"] ?? "");
  let any = false, sum = 0;
  for (const so of user === undefined ? adapter.list("Sales Order") : scopedList("Sales Order", user)) {
    if (Number(so["docstatus"]) !== 1) continue;
    for (const st of rows(so["sales_team"])) if (st["sales_person"] === salesPerson) {
      any = true; const dt = String(so["transaction_date"] ?? "");
      if ((!from || dt >= from) && (!to || dt <= to)) sum += Number(st["allocated_amount"] ?? (Number(so["base_net_total"] ?? 0) * Number(st["allocated_percentage"] ?? 0)) / 100);
    }
  }
  return any ? sum : null;
}
/** Target attainment shared by the Targets page, Sales Teams and dashboard target widgets, so every screen shows one number. */
export function attainment(t: Pick<TargetRow, "salesPerson" | "fiscalYear" | "amount">, user?: string): { achieved: number | null; pct: number | null } {
  const achieved = achievement(t.salesPerson, t.fiscalYear, user);
  return { achieved, pct: achieved === null || !t.amount ? null : Math.round((achieved / t.amount) * 100) };
}

/* ---------- Campaign / source attribution ---------- */
export type SourceResult = { source: string; leads: number; converted: number; deals: number; openPipeline: number; won: number; wonValue: number; conversion: number | null };
export function sourceResults(user: string): SourceResult[] {
  const m = new Map<string, SourceResult>();
  const get = (k: string) => m.get(k) ?? (m.set(k, { source: k, leads: 0, converted: 0, deals: 0, openPipeline: 0, won: 0, wonValue: 0, conversion: null }), m.get(k)!);
  for (const l of scopedLeads(user)) { const r = get(String(l["source"] || "") || "Not set"); r.leads++; if (Number(l["converted"])) r.converted++; }
  for (const d of scopedDeals(user)) {
    const r = get(String(d["source"] || "") || "Not set"); r.deals++;
    if (isOpenDeal(d)) r.openPipeline += dealValue(d);
    if (dealStatusType(d["status"]) === "Won") { r.won++; r.wonValue += dealValue(d); }
  }
  for (const r of m.values()) r.conversion = r.leads ? Math.round((r.converted / r.leads) * 100) : null;
  return [...m.values()].sort((a, b) => b.wonValue - a.wonValue || b.leads - a.leads);
}

/* ---------- Automation & Settings inventory (native records only) ---------- */
export const AUTOMATION_SOURCES = [
  { dt: "Assignment Rule", app: "frappe", note: "Round-robin / load-balanced lead and deal assignment" },
  { dt: "Notification", app: "frappe", note: "Email / system alerts on document events" },
  { dt: "CRM Service Level Agreement", app: "crm", note: "Response-time targets on leads and deals" },
  { dt: "Auto Repeat", app: "frappe", note: "Recurring documents" },
  { dt: "CRM Form Script", app: "crm", note: "Client-side form behaviour (parsed, never executed)" },
];
export const SETTINGS_SOURCES = [
  { dt: "CRM Deal Status", app: "crm", note: "Pipeline stages, type and default probability" },
  { dt: "CRM Lead Status", app: "crm", note: "Lead stages" },
  { dt: "CRM Lead Source", app: "crm", note: "Lead / deal sources used for attribution" },
  { dt: "CRM Lost Reason", app: "crm", note: "Required when a deal is marked Lost" },
  { dt: "CRM Industry", app: "crm", note: "Industry list" },
  { dt: "CRM Territory", app: "crm", note: "CRM territories" },
  { dt: "CRM Product", app: "crm", note: "Products mirrored from DIGIT Items" },
  { dt: "Price List", app: "erpnext", note: "Selling price lists used on deal lines" },
];
export const docCount = (dt: string) => adapter.list(dt).length;
