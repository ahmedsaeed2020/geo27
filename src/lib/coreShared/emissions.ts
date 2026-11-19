/**
 * DIGIT shared Core sustainability cost & emissions (Part B: CF-06). Emissions are estimated from what the company buys and
 * spends: every submitted purchase invoice line and journal expense line is matched to a Digit Emission Factor (item, then
 * item group, then expense account) and multiplied by the spend (kg CO2e per SAR) or the quantity (per unit). Factors are
 * Administration-owned records; the demo ships sample factors marked as samples until the company's methodology is set, and
 * spend without a factor is listed so coverage is never overstated.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { CORE_DT } from "./doctypes";

export type Bi = [string, string];
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc | undefined, f = "items") => (Array.isArray(d?.[f]) ? (d![f] as Doc[]) : []);
export interface EmissionLine { doctype: string; name: string; date: string; month: string; label: string; spend: number; qty: number; kg: number; factor?: Doc; scope: string; supplier: string }
export interface EmissionSummary { lines: EmissionLine[]; kg: number; spend: number; covered: number; coverage: number; byScope: Record<string, number>; byMonth: { month: string; kg: number }[]; byCategory: { label: string; kg: number; spend: number }[]; bySupplier: { supplier: string; kg: number }[]; unfactored: { label: string; spend: number }[]; samples: number }
const factors = () => adapter.list(CORE_DT.emissionFactor);
export function factorFor(o: { item?: string; itemGroup?: string; account?: string }): Doc | undefined {
  const fs = factors();
  return (o.item && fs.find((f) => f["basis"] === "Item" && s(f["reference"]) === o.item)) || (o.itemGroup && fs.find((f) => f["basis"] === "Item Group" && s(f["reference"]) === o.itemGroup)) || (o.account && fs.find((f) => f["basis"] === "Expense Account" && s(f["reference"]) === o.account)) || undefined;
}
const kgOf = (f: Doc | undefined, spend: number, qty: number) => (!f ? 0 : r2(n(f["factor"]) * (s(f["unit"]) === "Unit" ? qty : spend)));
export function emissions(company: string, from: string, to: string): EmissionSummary {
  const lines: EmissionLine[] = []; const inRange = (d: string) => d >= from && d <= to;
  for (const pi of adapter.list("Purchase Invoice").filter((p) => n(p.docstatus) === 1 && s(p["company"]) === company && inRange(s(p["posting_date"])))) for (const r of rows(pi)) {
    const it = adapter.get("Item", s(r["item_code"])); const f = factorFor({ item: s(r["item_code"]), itemGroup: s(it?.["item_group"] ?? r["item_group"]), account: s(r["expense_account"]) });
    const spend = r2(n(r["base_net_amount"] ?? r["net_amount"] ?? r["amount"]) * (n(pi["is_return"]) ? -1 : 1)); const qty = n(r["stock_qty"] ?? r["qty"]);
    lines.push({ doctype: "Purchase Invoice", name: pi.name, date: s(pi["posting_date"]), month: s(pi["posting_date"]).slice(0, 7), label: s(f?.["label"]) || s(it?.["item_group"]) || s(r["item_name"]) || s(r["item_code"]), spend, qty, kg: kgOf(f, spend, qty), ...(f ? { factor: f } : {}), scope: s(f?.["scope"]) || "—", supplier: s(pi["supplier"]) });
  }
  for (const je of adapter.list("Journal Entry").filter((p) => n(p.docstatus) === 1 && s(p["company"]) === company && inRange(s(p["posting_date"])) && s(p["voucher_type"]) !== "Depreciation Entry")) for (const r of rows(je, "accounts")) {
    const acc = adapter.get("Account", s(r["account"])); if (s(acc?.["root_type"]) !== "Expense" || !(n(r["debit"]) > 0)) continue;
    const f = factorFor({ account: s(r["account"]) }); const spend = r2(n(r["debit"]) - n(r["credit"]));
    lines.push({ doctype: "Journal Entry", name: je.name, date: s(je["posting_date"]), month: s(je["posting_date"]).slice(0, 7), label: s(f?.["label"]) || s(acc?.["account_name"]) || s(r["account"]), spend, qty: 0, kg: kgOf(f, spend, 0), ...(f ? { factor: f } : {}), scope: s(f?.["scope"]) || "—", supplier: "" });
  }
  const kg = r2(lines.reduce((a, l) => a + l.kg, 0)); const spend = r2(lines.reduce((a, l) => a + l.spend, 0)); const covered = r2(lines.filter((l) => l.factor).reduce((a, l) => a + l.spend, 0));
  const sum = <K extends string>(key: (l: EmissionLine) => K, val: (l: EmissionLine) => number) => { const m = new Map<K, number>(); for (const l of lines) m.set(key(l), r2((m.get(key(l)) ?? 0) + val(l))); return m; };
  const byScope = Object.fromEntries([...sum((l) => l.scope, (l) => l.kg)].filter(([k]) => k !== "—"));
  const cat = new Map<string, { kg: number; spend: number }>(); for (const l of lines.filter((x) => x.factor)) { const c = cat.get(l.label) ?? { kg: 0, spend: 0 }; c.kg = r2(c.kg + l.kg); c.spend = r2(c.spend + l.spend); cat.set(l.label, c); }
  const unf = sum((l) => (l.factor ? "" : l.label), (l) => l.spend); unf.delete("");
  return { lines, kg, spend, covered, coverage: spend ? Math.round((covered / spend) * 100) : 0, byScope, byMonth: [...sum((l) => l.month, (l) => l.kg)].map(([month, v]) => ({ month, kg: v })).sort((a, b) => a.month.localeCompare(b.month)),
    byCategory: [...cat].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.kg - a.kg), bySupplier: [...sum((l) => l.supplier, (l) => l.kg)].filter(([k, v]) => k && v).map(([supplier, v]) => ({ supplier, kg: v })).sort((a, b) => b.kg - a.kg),
    unfactored: [...unf].map(([label, v]) => ({ label, spend: v })).sort((a, b) => b.spend - a.spend), samples: factors().filter((f) => n(f["is_sample"])).length };
}
