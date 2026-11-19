/**
 * Browser-side executor for DIGIT Assistant tool calls (see protocol.ts). Every read goes through the shared
 * permission boundary (scope.ts → session.ts), so the model only receives rows the simulated user may read.
 * Read-only by design: tools look records up and open screens; nothing here writes to the store.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { LAYOUT_TYPES, TABLE_TYPES, cachedMeta, ensureMetas, type DocField, type DocTypeMeta, type IndexEntry } from "@/lib/catalog";
import { matchFilter, type Filter } from "@/lib/desk";
import { canReadType, scopedGet, scopedList } from "@/lib/scope";
import { translateTo } from "@/i18n";
import { pluginIndexEntries } from "@/plugins/runtime";
import type { AssistantContext, AssistantToolName } from "./protocol";
import { findReports, runReport } from "./reportTools";

export type ToolInputFilter = { field: string; op: string; value: string };
export type Navigate = (to: { kind: "list"; app: string; slug: string; filters?: Filter[] } | { kind: "record"; app: string; slug: string; name: string } | { kind: "path"; path: string }) => void;
export interface ToolEnv { navigate: Navigate; apps: AssistantContext["apps"] }
type Out = Record<string, unknown>;

const MAX_OUT = 12_000;
const clipStr = (v: unknown, n: number) => (typeof v === "string" && v.length > n ? `${v.slice(0, n)}…` : v);
const prim = (v: unknown) => v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
const numOf = (v: unknown) => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;

let indexP: Promise<IndexEntry[]> | null = null;
/** Catalog index + enabled plugin DocTypes (same set the Desk lists). */
export function loadIndex(): Promise<IndexEntry[]> {
  indexP ??= fetch("/catalog/index.json").then((r) => (r.ok ? (r.json() as Promise<IndexEntry[]>) : [])).catch(() => { indexP = null; return []; });
  return indexP.then((ix) => [...ix, ...pluginIndexEntries()]);
}
/** Test seam: replace the index loader. */
export function __setIndexForTests(ix: IndexEntry[] | null) { indexP = ix ? Promise.resolve(ix) : null; }

async function metaOf(dt: string): Promise<DocTypeMeta | undefined> {
  if (!cachedMeta(dt)) await ensureMetas([dt]);
  return cachedMeta(dt);
}
const dataFields = (m: DocTypeMeta) => m.fields.filter((f) => f.fieldname && !LAYOUT_TYPES.has(f.fieldtype) && !TABLE_TYPES.has(f.fieldtype));
const STD = new Set(["name", "owner", "creation", "modified", "modified_by", "docstatus", "idx"]);

/** The fields a person would look at first: list-view / filter / title / status / dates / amounts. */
export function mainFields(m: DocTypeMeta, max = 8): string[] {
  const fs = dataFields(m);
  const score = (f: DocField) =>
    (f.fieldname === m.title_field ? 50 : 0) + (f.in_list_view ? 30 : 0) + (f.in_standard_filter ? 15 : 0) + (f.bold ? 8 : 0) + (f.reqd ? 6 : 0) +
    (f.fieldname === "status" ? 25 : 0) + (/date$/.test(f.fieldname ?? "") ? 6 : 0) + (/^(grand_total|total|amount|outstanding_amount|net_total)$/.test(f.fieldname ?? "") ? 12 : 0) - (f.hidden ? 40 : 0);
  return fs.map((f) => ({ f, s: score(f) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, max).map((x) => x.f.fieldname!);
}
const knownField = (m: DocTypeMeta, f: string) => STD.has(f) || m.fields.some((x) => x.fieldname === f);

function toFilters(m: DocTypeMeta, input: ToolInputFilter[] | null | undefined): { filters: Filter[]; bad: string[] } {
  const filters: Filter[] = []; const bad: string[] = [];
  for (const f of input ?? []) {
    if (!f || typeof f.field !== "string") continue;
    if (!knownField(m, f.field)) { bad.push(f.field); continue; }
    const op = String(f.op || "=").toLowerCase();
    const raw = String(f.value ?? "");
    const value: unknown = op === "between" ? raw.split(",").map((s) => s.trim()) : op === "is" ? (/not/i.test(raw) ? "not set" : "set") : raw;
    filters.push([f.field, op, value]);
  }
  return { filters, bad };
}
const fieldHint = (m: DocTypeMeta) => ({ error: "unknown_field", valid_fields: ["name", "docstatus", "modified", ...mainFields(m, 24)] });

function pick(d: Doc, fields: string[]): Out {
  const o: Out = { name: d.name };
  for (const f of fields) { const v = d[f]; if (prim(v)) o[f] = clipStr(v, 120); }
  return o;
}
function fit(out: Out, rowsKey: string): Out {
  let s = JSON.stringify(out);
  while (s.length > MAX_OUT && Array.isArray(out[rowsKey]) && (out[rowsKey] as unknown[]).length > 1) {
    out[rowsKey] = (out[rowsKey] as unknown[]).slice(0, Math.ceil((out[rowsKey] as unknown[]).length / 2));
    out["truncated"] = true;
    s = JSON.stringify(out);
  }
  return out;
}

async function readable(dt: string): Promise<{ meta: DocTypeMeta } | { error: Out }> {
  const ix = await loadIndex();
  if (!ix.some((e) => e.name === dt)) return { error: { error: "unknown_doctype", doctype: dt, hint: "Call find_doctypes to get the exact DocType name." } };
  const meta = await metaOf(dt);
  if (!meta) return { error: { error: "unknown_doctype", doctype: dt } };
  if (!canReadType(dt)) return { error: { error: "no_permission", doctype: dt, message: "The current user may not read this DocType." } };
  return { meta };
}

export async function findDoctypes(query: string): Promise<Out> {
  const q = query.trim().toLowerCase();
  const ix = (await loadIndex()).filter((e) => !e.istable);
  const toks = q.split(/\s+/).filter((t) => t.length > 1);
  const scored = ix.map((e) => {
    const en = e.name.toLowerCase(); const ar = translateTo(e.name, "ar"); const mod = e.module.toLowerCase();
    let s = 0;
    if (en === q || ar === query.trim()) s += 100;
    if (q && (en.includes(q) || ar.includes(query.trim()))) s += 60;
    for (const t of toks) if (en.includes(t) || ar.includes(t)) s += 18;
    if (q && mod.includes(q)) s += 10;
    if (s > 0) s += Math.min(15, adapter.list(e.name).length > 0 ? 15 : 0);
    return { e, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 24);
  await ensureMetas(scored.map((x) => x.e.name));
  const ok = scored.filter((x) => canReadType(x.e.name)).slice(0, 8);
  const matches = await Promise.all(ok.map(async ({ e }, i) => {
    const row: Out = { doctype: e.name, label_ar: translateTo(e.name, "ar"), module: e.module, records: scopedList(e.name).length, submittable: !!e.is_submittable, single: !!e.issingle };
    if (i < 3) {
      const m = await metaOf(e.name);
      if (m) row["fields"] = dataFields(m).filter((f) => !f.hidden).slice(0, 60)
        .sort((a, b) => Number(!!b.in_list_view) - Number(!!a.in_list_view) || Number(!!b.in_standard_filter) - Number(!!a.in_standard_filter))
        .slice(0, 28).map((f) => ({ fieldname: f.fieldname, label: f.label ?? f.fieldname, type: f.fieldtype, ...(f.options && /^(Link|Select)$/.test(f.fieldtype) ? { options: String(f.options).slice(0, 80) } : {}) }));
    }
    return row;
  }));
  return { query, matches, ...(matches.length ? {} : { message: "No readable DocType matches; try another word (English DocType names work best)." }) };
}

export async function queryRecords(i: { doctype: string; filters: ToolInputFilter[] | null; fields: string[] | null; order_by: string | null; descending: boolean | null; limit: number | null }): Promise<Out> {
  const r = await readable(i.doctype); if ("error" in r) return r.error;
  const { meta } = r;
  const { filters, bad } = toFilters(meta, i.filters);
  if (bad.length) return { ...fieldHint(meta), unknown: bad };
  const fields = (i.fields?.length ? i.fields : mainFields(meta)).filter((f) => f !== "name").slice(0, 12);
  const badF = fields.filter((f) => !knownField(meta, f)); if (badF.length) return { ...fieldHint(meta), unknown: badF };
  const order = i.order_by && knownField(meta, i.order_by) ? i.order_by : "modified";
  const desc = i.descending ?? true;
  const rows = scopedList(i.doctype).filter((d) => filters.every((f) => matchFilter(d, f)));
  const sorted = [...rows].sort((a, b) => {
    const x = a[order]; const y = b[order];
    const c = typeof x === "number" || typeof y === "number" ? numOf(x) - numOf(y) : String(x ?? "").localeCompare(String(y ?? ""));
    return desc ? -c : c;
  });
  const limit = Math.max(1, Math.min(25, i.limit ?? 10));
  return fit({ doctype: i.doctype, total_matching: rows.length, returned: Math.min(limit, rows.length), rows: sorted.slice(0, limit).map((d) => pick(d, [...fields, ...(fields.includes("docstatus") ? [] : meta.is_submittable ? ["docstatus"] : [])])) }, "rows");
}

export async function aggregateRecords(i: { doctype: string; filters: ToolInputFilter[] | null; group_by: string | null; date_field: string | null; period: "month" | "year" | null; sum_fields: string[] | null; limit: number | null }): Promise<Out> {
  const r = await readable(i.doctype); if ("error" in r) return r.error;
  const { meta } = r;
  const { filters, bad } = toFilters(meta, i.filters);
  const sums = (i.sum_fields ?? []).slice(0, 4);
  const unknown = [...bad, ...sums.filter((f) => !knownField(meta, f)), ...[i.group_by, i.date_field].filter((f): f is string => !!f && !knownField(meta, f))];
  if (unknown.length) return { ...fieldHint(meta), unknown };
  const rows = scopedList(i.doctype).filter((d) => filters.every((f) => matchFilter(d, f)));
  const groups = new Map<string, { count: number; sums: Record<string, number> }>();
  const cut = i.period === "year" ? 4 : 7;
  for (const d of rows) {
    const parts: string[] = [];
    if (i.date_field) parts.push(String(d[i.date_field] ?? "").slice(0, cut) || "—");
    if (i.group_by) { const g = d[i.group_by]; parts.push(g == null || g === "" ? "—" : String(g)); }
    const key = parts.join(" | ") || "all";
    const g = groups.get(key) ?? { count: 0, sums: {} };
    g.count++;
    for (const f of sums) g.sums[f] = (g.sums[f] ?? 0) + numOf(d[f]);
    groups.set(key, g);
  }
  let list = [...groups.entries()].map(([key, g]) => ({ key, count: g.count, ...Object.fromEntries(Object.entries(g.sums).map(([k, v]) => [`sum_${k}`, round2(v)])) }));
  if (i.date_field && !i.group_by) list.sort((a, b) => a.key.localeCompare(b.key));
  else { const k = sums[0] ? `sum_${sums[0]}` : "count"; list.sort((a, b) => numOf((b as Out)[k]) - numOf((a as Out)[k])); }
  const limit = Math.max(1, Math.min(40, i.limit ?? 20));
  const total: Out = { count: rows.length };
  for (const f of sums) total[`sum_${f}`] = round2(rows.reduce((s, d) => s + numOf(d[f]), 0));
  const groupsOut = list.slice(0, limit);
  list = [];
  return fit({ doctype: i.doctype, grouping: [i.date_field ? `${i.period ?? "month"} of ${i.date_field}` : null, i.group_by].filter(Boolean).join(" | ") || "none", total, groups_total: groups.size, groups: groupsOut }, "groups");
}

export async function getDocument(i: { doctype: string; name: string }): Promise<Out> {
  const r = await readable(i.doctype); if ("error" in r) return r.error;
  const d = scopedGet(i.doctype, i.name);
  if (!d) return { error: "not_found", doctype: i.doctype, name: i.name, message: "No readable record with that ID." };
  const o: Out = {};
  for (const [k, v] of Object.entries(d)) {
    if (k.startsWith("__")) continue;
    if (Array.isArray(v)) o[k] = { rows: v.length, first: v.slice(0, 15).map((row) => Object.fromEntries(Object.entries((row ?? {}) as Out).filter(([kk, vv]) => !kk.startsWith("__") && !STD.has(kk) && kk !== "parent" && kk !== "parenttype" && kk !== "parentfield" && prim(vv) && vv !== "" && vv !== null).map(([kk, vv]) => [kk, clipStr(vv, 120)]))) };
    else if (prim(v) && v !== "" && v !== null) o[k] = clipStr(v, 300);
  }
  return fit({ doctype: i.doctype, document: o }, "document");
}

async function entryOf(dt: string): Promise<IndexEntry | undefined> { return (await loadIndex()).find((e) => e.name === dt); }

export async function runAssistantTool(name: AssistantToolName, input: unknown, env: ToolEnv): Promise<Out> {
  const a = (input ?? {}) as Record<string, never>;
  try {
    switch (name) {
      case "find_doctypes": return await findDoctypes(String(a["query"] ?? ""));
      case "query_records": return await queryRecords(a as never);
      case "aggregate_records": return await aggregateRecords(a as never);
      case "get_document": return await getDocument(a as never);
      case "find_reports": return await findReports(String(a["query"] ?? ""));
      case "run_report": return await runReport(a as never);
      case "open_list": {
        const r = await readable(String(a["doctype"])); if ("error" in r) return r.error;
        const e = (await entryOf(String(a["doctype"])))!;
        const { filters, bad } = toFilters(r.meta, a["filters"]);
        if (bad.length) return { ...fieldHint(r.meta), unknown: bad };
        env.navigate({ kind: "list", app: e.app, slug: e.slug, filters });
        return { opened: "list", doctype: e.name, filters: filters.length, matching: scopedList(e.name).filter((d) => filters.every((f) => matchFilter(d, f))).length };
      }
      case "open_record": {
        const r = await readable(String(a["doctype"])); if ("error" in r) return r.error;
        const e = (await entryOf(String(a["doctype"])))!;
        const name = String(a["name"] ?? "");
        if (!scopedGet(e.name, name)) return { error: "not_found", doctype: e.name, name };
        env.navigate({ kind: "record", app: e.app, slug: e.slug, name });
        return { opened: "record", doctype: e.name, name };
      }
      case "open_app": {
        const want = String(a["app"] ?? "").toLowerCase();
        const app = env.apps.find((x) => x.name.toLowerCase() === want || x.title.toLowerCase() === want);
        if (!app) return { error: "unknown_app", available: env.apps.map((x) => x.name) };
        env.navigate({ kind: "path", path: app.home });
        return { opened: "app", app: app.name };
      }
    }
  } catch (e) {
    return { error: "tool_failed", message: e instanceof Error ? e.message.slice(0, 200) : "unknown" };
  }
}
