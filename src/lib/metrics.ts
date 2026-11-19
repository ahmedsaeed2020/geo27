/**
 * Shared report / metric contract. Every metric a future app shows (number card, chart, KPI, report total) is described
 * by one MetricDef and computed by runMetric over the SAME permission-scoped rows the filtered list and drill-down use
 * (src/lib/scope.ts). Ledger metrics read GL Entry rows written only by src/lib/posting.ts — never invoice grand totals
 * or Bin quantities. A MetricDef also names the real Frappe artefact that owns the number after export.
 */
import { adapter, type Doc } from "./adapter";
import { scopedList, canReadType } from "./scope";
import { currentUser, userPermissions } from "./session";
import { matchFilter, type Filter } from "./desk";

export type MetricEngine = "count" | "sum" | "average" | "gl_balance";
export interface MetricDef {
  id: string; label: string; label_ar?: string;
  /** source DocType of the row set (GL Entry for gl_balance) */
  doctype: string;
  engine: MetricEngine;
  /** numeric field for sum/average (gl_balance uses debit - credit) */
  field?: string;
  /** Frappe-style filters [field, op, value] applied after scope */
  filters?: Filter[];
  /** allowed docstatus values (default: [1] for submittable sources, all otherwise) */
  docstatus?: number[];
  /** period: date field + optional from/to (inclusive) */
  date_field?: string; from?: string; to?: string;
  /** as-of date for balances (gl_balance: posting_date <= as_of) */
  as_of?: string;
  company_field?: string;
  /** dimension fields the metric may be split by (cost_center, project, branch …) */
  dimensions?: string[];
  currency?: string; precision?: number;
  /** gl_balance: accounts (exact names) or a root_type/account_type selector */
  accounts?: string[]; root_type?: string; account_type?: string; party_type?: string;
  /** Frappe owner after export: Number Card (Document Type) / Query Report / Script Report / Insights Query */
  frappe_owner: "Number Card" | "Dashboard Chart" | "Query Report" | "Script Report" | "Insights Query" | "Report Builder";
}
export interface MetricContext { company?: string; from?: string; to?: string; as_of?: string; dims?: Record<string, string>; user?: string }
export interface MetricResult {
  id: string; value: number | null; count: number; currency?: string | undefined; precision: number;
  /** canonical names behind the value (drill-down); GL metrics drill to voucher_no */
  drill: { doctype: string; names: string[] };
  scope: { user: string; companies: string[] | "all"; denied: boolean };
  applied: { filters: Filter[]; docstatus: number[] | "any"; from?: string | undefined; to?: string | undefined; as_of?: string | undefined; dims: Record<string, string> };
  engine: MetricEngine; source: string; frappe_owner: MetricDef["frappe_owner"];
}

const n = (v: unknown) => Number(v) || 0;
const round = (x: number, p: number) => Math.round(x * 10 ** p) / 10 ** p;

/** Rows a metric aggregates — exposed so lists, reports and drill-downs can be compared row-for-row (PLAT-06). */
export function metricRows(def: MetricDef, ctx: MetricContext = {}): Doc[] {
  const user = ctx.user ?? currentUser();
  const cf = def.company_field ?? "company";
  const from = ctx.from ?? def.from, to = ctx.to ?? def.to, asOf = ctx.as_of ?? def.as_of;
  let rows = scopedList(def.doctype, user);
  if (def.engine === "gl_balance") {
    const acc = (name: string) => adapter.get("Account", name);
    rows = rows.filter((g) => !n(g["is_cancelled"])
      && (!def.accounts?.length || def.accounts.includes(String(g["account"])))
      && (!def.root_type || acc(String(g["account"]))?.["root_type"] === def.root_type)
      && (!def.account_type || acc(String(g["account"]))?.["account_type"] === def.account_type)
      && (!def.party_type || g["party_type"] === def.party_type));
  } else {
    const ds = def.docstatus;
    if (ds) rows = rows.filter((d) => ds.includes(n(d.docstatus)));
  }
  if (ctx.company) rows = rows.filter((d) => d[cf] === ctx.company);
  const df = def.engine === "gl_balance" ? "posting_date" : def.date_field;
  if (df && from) rows = rows.filter((d) => String(d[df] ?? "") >= from);
  if (df && to) rows = rows.filter((d) => String(d[df] ?? "") <= to);
  if (asOf) rows = rows.filter((d) => String(d["posting_date"] ?? d[df ?? "posting_date"] ?? "") <= asOf);
  for (const [k, v] of Object.entries(ctx.dims ?? {})) if (v) rows = rows.filter((d) => d[k] === v);
  for (const f of def.filters ?? []) rows = rows.filter((d) => matchFilter(d, f));
  return rows;
}

export function runMetric(def: MetricDef, ctx: MetricContext = {}): MetricResult {
  const user = ctx.user ?? currentUser();
  const precision = def.precision ?? (def.engine === "count" ? 0 : 2);
  const up = userPermissions(user).get("Company");
  const base = { id: def.id, precision, currency: def.currency, engine: def.engine, source: def.doctype, frappe_owner: def.frappe_owner,
    applied: { filters: def.filters ?? [], docstatus: def.docstatus ?? "any" as const, from: ctx.from ?? def.from, to: ctx.to ?? def.to, as_of: ctx.as_of ?? def.as_of, dims: ctx.dims ?? {} } };
  const scope = { user, companies: up ? [...up] : "all" as const, denied: false };
  if (!canReadType(def.doctype, user)) return { ...base, value: null, count: 0, drill: { doctype: def.doctype, names: [] }, scope: { ...scope, denied: true } };
  const rows = metricRows(def, { ...ctx, user });
  let value: number;
  if (def.engine === "count") value = rows.length;
  else if (def.engine === "gl_balance") value = rows.reduce((s, g) => s + n(g["debit"]) - n(g["credit"]), 0);
  else { const s = rows.reduce((a, d) => a + n(d[def.field ?? ""]), 0); value = def.engine === "average" ? (rows.length ? s / rows.length : 0) : s; }
  const drill = def.engine === "gl_balance"
    ? { doctype: "GL Entry", names: rows.map((g) => g.name) }
    : { doctype: def.doctype, names: rows.map((d) => d.name) };
  return { ...base, value: round(value, precision), count: rows.length, drill, scope };
}

/** Plugin manifest Number Card → MetricDef (same filters, scope and drill rows as the card on the workspace). */
export function metricFromCard(c: { name: string; label: string; document_type: string; function: "Count" | "Sum" | "Average"; aggregate_function_based_on?: string | undefined; filters: [string, string, string, unknown][] }): MetricDef {
  return { id: c.name, label: c.label, doctype: c.document_type, engine: c.function === "Count" ? "count" : c.function === "Sum" ? "sum" : "average",
    ...(c.aggregate_function_based_on ? { field: c.aggregate_function_based_on } : {}), filters: c.filters.map(([, f, op, v]) => [f, op, v] as Filter), frappe_owner: "Number Card" };
}
