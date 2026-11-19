/**
 * Local execution of Insights v3 query operations (frontend/src2/types/query.types.ts) over the
 * source demo dataset (insights/setup/demo_data, generated with the source spec + seed) and the
 * shared adapter records ("Site DB"). The real app compiles operations to SQL with ibis on the
 * server; SQL, script and custom-operation steps are server-dependent here.
 */
import { adapter, type Doc } from "./adapter";
import { canReadType, scopedList } from "./scope";

export type Row = Record<string, unknown>;
export type ColType = "String" | "Integer" | "Decimal" | "Date" | "Datetime" | "Time" | "Text" | "JSON" | "Array" | "Auto";
export type Col = { name: string; type: ColType };
export type Result = { columns: Col[]; rows: Row[]; notes: string[]; server: string[] };
type ColumnRef = { type?: "column"; column_name: string };
export type Measure = { measure_name: string; column_name?: string; aggregation?: string; data_type?: string; expression?: { expression: string } };
export type Dimension = { dimension_name: string; column_name: string; data_type?: string; granularity?: string };
export type FilterRule = { column?: ColumnRef; operator?: string; value?: unknown; expression?: { expression: string } };
export type Operation = { type: string; [k: string]: unknown };

export const DEMO = "demo_data";
export const SITE = "site_db";
export const OPERATORS: { op: string; label: string }[] = [
  { op: "=", label: "equals" }, { op: "!=", label: "not equals" }, { op: ">", label: ">" }, { op: ">=", label: ">=" }, { op: "<", label: "<" }, { op: "<=", label: "<=" },
  { op: "in", label: "in" }, { op: "not_in", label: "not in" }, { op: "between", label: "between" }, { op: "within", label: "within" },
  { op: "contains", label: "contains" }, { op: "not_contains", label: "not contains" }, { op: "starts_with", label: "starts with" }, { op: "ends_with", label: "ends with" },
  { op: "is_set", label: "is set" }, { op: "is_not_set", label: "is not set" },
];
export const AGGREGATIONS = ["sum", "count", "avg", "min", "max", "count_distinct"];
export const GRANULARITIES = ["day", "week", "month", "quarter", "year"];

// ---------- data sources ----------
type DemoFile = { tables: Record<string, { columns: { name: string; type: string }[]; rows: unknown[][] }> };
let demo: Record<string, { columns: Col[]; rows: Row[] }> | null = null;
let demoPromise: Promise<void> | null = null;
const duckType = (t: string): ColType => (/INT/.test(t) ? "Integer" : /DOUBLE|DECIMAL|FLOAT/.test(t) ? "Decimal" : /TIMESTAMP/.test(t) ? "Datetime" : /DATE/.test(t) ? "Date" : "String");
export function loadDemo(): Promise<void> {
  if (demo) return Promise.resolve();
  demoPromise ??= fetch("/catalog/insights/demo_data.json").then((r) => r.json()).then((d: DemoFile) => {
    demo = {};
    for (const [name, t] of Object.entries(d.tables)) {
      const cols = t.columns.map((c) => ({ name: c.name, type: duckType(c.type) }));
      demo[name] = { columns: cols, rows: t.rows.map((r) => Object.fromEntries(cols.map((c, i) => [c.name, r[i]]))) };
    }
  });
  return demoPromise;
}
export const demoReady = () => !!demo;

const inferType = (v: unknown): ColType => (typeof v === "number" ? (Number.isInteger(v) ? "Integer" : "Decimal") : typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? "Datetime" : typeof v === "object" && v ? "JSON" : "String");
/** Site DB tables are the adapter's DocTypes that hold records, named tab<DocType> as in a Frappe site database. */
function siteTable(name: string): { columns: Col[]; rows: Row[] } {
  const dt = name.replace(/^tab/, "");
  // site tables expose only rows the session user may read (src/lib/scope.ts), so counts, aggregates and drill-downs never leak
  const rows = scopedList(dt).map((d: Doc) => Object.fromEntries(Object.entries(d).filter(([, v]) => typeof v !== "object" || v === null)));
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return { columns: keys.map((k) => ({ name: k, type: inferType(rows.find((r) => r[k] != null)?.[k]) })), rows };
}

/**
 * Read-only data source providers registered by apps (e.g. an app's report read models exposed as tables), so Insights
 * queries, charts and dashboards can analyse the same rows the app's reports return. A provider must apply the session
 * user's read scope itself; providers never write records. demo_data and site_db are unaffected.
 */
export interface DataSourceProvider { title: string; tables(): string[]; table(name: string): { columns: Col[]; rows: Row[] } | null }
const providers = new Map<string, DataSourceProvider>();
export function registerDataSource(id: string, p: DataSourceProvider) { if (id !== DEMO && id !== SITE) providers.set(id, p); }
export const dataSourceProvider = (id: string) => providers.get(id);
/** Registered app data sources (id + title) for source pickers; a provider whose app is disabled lists no tables. */
export const dataSourceProviders = () => [...providers.entries()].map(([id, p]) => ({ id, title: p.title }));
/** Infers column types from rows (provider helper; same rules as the site tables). */
export function columnsOf(rows: Row[], order: string[] = []): Col[] {
  const keys = [...new Set([...order, ...rows.flatMap((r) => Object.keys(r))])];
  return keys.map((k) => ({ name: k, type: inferType(rows.find((r) => r[k] != null)?.[k]) }));
}
export function listTables(ds: string): { table: string; rows: number; columns: Col[] }[] {
  if (ds === DEMO) return demo ? Object.entries(demo).map(([t, v]) => ({ table: t, rows: v.rows.length, columns: v.columns })) : [];
  if (ds === SITE) {
    return adapter.doctypes().filter((dt) => canReadType(dt)).map((dt) => { const t = siteTable(`tab${dt}`); return { table: `tab${dt}`, rows: t.rows.length, columns: t.columns }; }).filter((t) => t.rows > 0);
  }
  const p = providers.get(ds);
  if (p) return p.tables().map((t) => { const x = p.table(t); return { table: t, rows: x?.rows.length ?? 0, columns: x?.columns ?? [] }; });
  return [];
}
export function getTable(ds: string, table: string): { columns: Col[]; rows: Row[] } | null {
  if (ds === DEMO) return demo?.[table] ?? null;
  if (ds === SITE) return siteTable(table);
  return providers.get(ds)?.table(table) ?? null;
}

// ---------- expressions (column arithmetic/comparison; no eval) ----------
export function evalColumnExpr(src: string, row: Row): unknown {
  const toks = src.match(/\s*(>=|<=|!=|==|&&|\|\||[-+*/()&|<>=!,]|'[^']*'|"[^"]*"|\d+(?:\.\d+)?|[A-Za-z_][\w.]*)/g)?.map((t) => t.trim()) ?? [];
  let i = 0;
  const peek = () => toks[i], eat = () => toks[i++];
  const bin = (next: () => unknown, ops: string[], f: (o: string, a: unknown, b: unknown) => unknown) => () => { let a = next(); while (ops.includes(peek() ?? "")) { const o = eat()!; a = f(o, a, next()); } return a; };
  const num = (x: unknown) => Number(x);
  const prim = (): unknown => {
    const t = eat();
    if (t === undefined) throw new Error("unexpected end");
    if (t === "(") { const v = or(); eat(); return v; }
    if (t === "-") return -num(prim());
    if (t === "!") return !prim();
    if (/^\d/.test(t)) return Number(t);
    if (/^['"]/.test(t)) return t.slice(1, -1);
    if (t === "true" || t === "false") return t === "true";
    if (peek() === "(") throw new Error(`function ${t}() runs in the server expression engine`);
    if (!(t in row)) throw new Error(`unknown column ${t}`);
    return row[t];
  };
  const mul = bin(prim, ["*", "/"], (o, a, b) => (o === "*" ? num(a) * num(b) : num(a) / num(b)));
  const add = bin(mul, ["+", "-"], (o, a, b) => (o === "+" ? (typeof a === "string" || typeof b === "string" ? `${a}${b}` : num(a) + num(b)) : num(a) - num(b)));
  const cmp = bin(add, [">", "<", ">=", "<=", "==", "=", "!="], (o, a, b) => {
    const [x, y] = typeof a === "number" || typeof b === "number" ? [num(a), num(b)] : [String(a ?? ""), String(b ?? "")];
    return o === ">" ? x > y : o === "<" ? x < y : o === ">=" ? x >= y : o === "<=" ? x <= y : o === "!=" ? x !== y : x === y;
  });
  const and = bin(cmp, ["&", "&&"], (_o, a, b) => !!a && !!b);
  const or = bin(and, ["|", "||"], (_o, a, b) => !!a || !!b);
  const v = or();
  if (i < toks.length) throw new Error(`unexpected ${toks[i]}`);
  return v;
}

// ---------- filters ----------
const isSet = (v: unknown) => v !== null && v !== undefined && v !== "";
function within(v: unknown, span: unknown): boolean {
  const s = String((span as { span?: string })?.span ?? span ?? "").toLowerCase();
  const d = new Date(String(v)); if (isNaN(d.getTime())) return false;
  const m = s.match(/(last|current|next)\s+(\d+)?\s*(day|week|month|quarter|year)/);
  if (!m) return true;
  const n = Number(m[2] ?? 1), unit = { day: 1, week: 7, month: 30.4, quarter: 91.3, year: 365.25 }[m[3] as "day"];
  const now = Date.now(), t = d.getTime();
  return m[1] === "next" ? t >= now && t <= now + n * unit * 864e5 : t <= now && t >= now - n * unit * 864e5;
}
export function matchRule(r: Row, f: FilterRule): boolean {
  if (f.expression) return !!evalColumnExpr(f.expression.expression, r);
  const v = r[f.column?.column_name ?? ""], val = f.value;
  const s = String(v ?? "").toLowerCase(), t = String(val ?? "").toLowerCase();
  const list = (Array.isArray(val) ? val : String(val ?? "").split(",")).map((x) => String(x).trim().toLowerCase());
  const numeric = typeof v === "number" && val !== "" && !isNaN(Number(val));
  const c = numeric ? (v as number) - Number(val) : String(v ?? "").localeCompare(String(val ?? ""));
  switch (f.operator) {
    case "=": return numeric ? c === 0 : s === t;
    case "!=": return numeric ? c !== 0 : s !== t;
    case ">": return isSet(v) && c > 0; case ">=": return isSet(v) && c >= 0;
    case "<": return isSet(v) && c < 0; case "<=": return isSet(v) && c <= 0;
    case "in": return list.includes(s); case "not_in": return !list.includes(s);
    case "between": { const [a, b] = Array.isArray(val) ? val : String(val ?? "").split(","); return numeric ? Number(v) >= Number(a) && Number(v) <= Number(b) : String(v ?? "") >= String(a ?? "").trim() && String(v ?? "") <= String(b ?? "").trim() + "\uffff"; }
    case "within": return within(v, val);
    case "contains": return s.includes(t); case "not_contains": return !s.includes(t);
    case "starts_with": return s.startsWith(t); case "ends_with": return s.endsWith(t);
    case "is_set": return isSet(v); case "is_not_set": return !isSet(v);
    default: return true;
  }
}
export function applyFilterGroup(rows: Row[], g?: { logical_operator?: string; filters?: FilterRule[] }): Row[] {
  const fs = (g?.filters ?? []).filter((f) => f.expression || f.column?.column_name);
  if (!fs.length) return rows;
  return rows.filter((r) => (g?.logical_operator === "Or" ? fs.some((f) => matchRule(r, f)) : fs.every((f) => matchRule(r, f))));
}

// ---------- summarize ----------
export function bucket(v: unknown, g?: string): string {
  if (!g || v == null || v === "") return String(v ?? "");
  const d = new Date(String(v).replace(" ", "T")); if (isNaN(d.getTime())) return String(v);
  const y = d.getFullYear(), m = d.getMonth();
  const p = (n: number) => String(n).padStart(2, "0");
  if (g === "year") return `${y}-01-01`;
  if (g === "quarter") return `${y}-${p(Math.floor(m / 3) * 3 + 1)}-01`;
  if (g === "month") return `${y}-${p(m + 1)}-01`;
  if (g === "week") { const s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `${s.getFullYear()}-${p(s.getMonth() + 1)}-${p(s.getDate())}`; }
  return `${y}-${p(m + 1)}-${p(d.getDate())}`;
}
export function aggregate(rows: Row[], m: Measure): number {
  if (m.expression) return rows.reduce((s, r) => s + (Number(evalColumnExpr(m.expression!.expression, r)) || 0), 0);
  const vals = rows.map((r) => r[m.column_name ?? ""]);
  const nums = vals.map(Number).filter((n) => !isNaN(n));
  switch (m.aggregation) {
    case "count": return m.column_name && m.column_name !== "count" && m.column_name !== "*" ? vals.filter(isSet).length : rows.length;
    case "count_distinct": return new Set(vals.filter(isSet).map(String)).size;
    case "avg": return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    case "min": return nums.length ? Math.min(...nums) : 0;
    case "max": return nums.length ? Math.max(...nums) : 0;
    default: return nums.reduce((a, b) => a + b, 0);
  }
}
export function summarize(rows: Row[], measures: Measure[], dims: Dimension[]): Row[] {
  const groups = new Map<string, { key: Row; rows: Row[] }>();
  for (const r of rows) {
    const key = Object.fromEntries(dims.map((d) => [d.dimension_name || d.column_name, bucket(r[d.column_name], d.granularity)]));
    const k = JSON.stringify(key);
    const g = groups.get(k) ?? { key, rows: [] }; g.rows.push(r); groups.set(k, g);
  }
  if (!dims.length && !groups.size) groups.set("{}", { key: {}, rows: [] });
  return [...groups.values()].map((g) => ({ ...g.key, ...Object.fromEntries(measures.map((m) => [m.measure_name, aggregate(g.rows, m)])) }));
}
function sortRows(rows: Row[], by: { column: ColumnRef; direction: string }[]): Row[] {
  if (!by.length) return rows;
  return [...rows].sort((a, b) => {
    for (const o of by) {
      const x = a[o.column.column_name], y = b[o.column.column_name];
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true });
      if (c) return o.direction === "desc" ? -c : c;
    }
    return 0;
  });
}

// ---------- execution ----------
type TableArg = { type: "table" | "query"; data_source?: string; table_name?: string; query_name?: string };
function resolve(t: TableArg, depth: number): { columns: Col[]; rows: Row[] } | null {
  if (t.type === "query" && t.query_name) {
    const q = adapter.get("Insights Query v3", t.query_name);
    return q && depth < 5 ? runQuery(parseJSON<Operation[]>(q["operations"], []), depth + 1) : null;
  }
  return getTable(t.data_source ?? "", t.table_name ?? "");
}
export function parseJSON<T>(v: unknown, d: T): T { if (typeof v !== "string") return (v as T) ?? d; try { return JSON.parse(v) as T; } catch { return d; } }
const colsOf = (rows: Row[], prev: Col[]): Col[] => {
  const names = rows.length ? Object.keys(rows[0]!) : prev.map((c) => c.name);
  return names.map((n) => prev.find((c) => c.name === n) ?? { name: n, type: inferType(rows.find((r) => r[n] != null)?.[n]) });
};

export const SERVER_OPS: Record<string, string> = {
  sql: "Native SQL runs against the connected database on the server",
  sql_column: "SQL column expressions are compiled by ibis on the server",
  code: "Python script queries run in the server sandbox",
  custom_operation: "Custom operations are ibis expressions evaluated on the server",
  window_operation: "Window operations are compiled to SQL on the server",
};

export function runQuery(ops: Operation[], depth = 0): Result {
  let rows: Row[] = [], columns: Col[] = [];
  const notes: string[] = [], server: string[] = [];
  for (const op of ops) {
    try {
      switch (op.type) {
        case "source": { const t = resolve(op["table"] as TableArg, depth); if (!t) { server.push(`Source table not available locally`); break; } rows = t.rows.map((r) => ({ ...r })); columns = t.columns; break; }
        case "join": {
          const t = resolve(op["table"] as TableArg, depth); if (!t) { server.push("Join table not available locally"); break; }
          const jc = op["join_condition"] as { left_column?: ColumnRef; right_column?: ColumnRef; join_expression?: unknown };
          if (!jc.left_column || !jc.right_column) { server.push("Join expressions are compiled on the server"); break; }
          const sel = (op["select_columns"] as ColumnRef[] | undefined)?.map((c) => c.column_name);
          const pick = (r: Row) => (sel?.length ? Object.fromEntries(sel.map((k) => [k, r[k]])) : r);
          const idx = new Map<string, Row[]>();
          t.rows.forEach((r) => { const k = String(r[jc.right_column!.column_name]); idx.set(k, [...(idx.get(k) ?? []), r]); });
          const type = String(op["join_type"] ?? "left");
          const out: Row[] = [];
          const blank = Object.fromEntries((sel?.length ? sel : t.columns.map((c) => c.name)).map((k) => [k, null]));
          for (const l of rows) {
            const m = idx.get(String(l[jc.left_column.column_name]));
            if (m) m.forEach((r) => out.push({ ...pick(r), ...l, ...Object.fromEntries(Object.entries(pick(r)).filter(([k]) => !(k in l))) }));
            else if (type === "left" || type === "full") out.push({ ...blank, ...l });
          }
          if (type === "right" || type === "full") notes.push(`${type} join unmatched right rows are not appended in the preview`);
          rows = out; columns = colsOf(rows, [...columns, ...t.columns]); break;
        }
        case "union": { const t = resolve(op["table"] as TableArg, depth); if (t) { rows = [...rows, ...t.rows]; if (op["distinct"]) rows = [...new Map(rows.map((r) => [JSON.stringify(r), r])).values()]; } break; }
        case "filter": rows = applyFilterGroup(rows, { logical_operator: "And", filters: [op as FilterRule] }); break;
        case "filter_group": rows = applyFilterGroup(rows, op as { logical_operator?: string; filters?: FilterRule[] }); break;
        case "select": { const n = op["column_names"] as string[]; rows = rows.map((r) => Object.fromEntries(n.map((k) => [k, r[k]]))); columns = n.map((k) => columns.find((c) => c.name === k) ?? { name: k, type: "String" }); break; }
        case "remove": { const n = new Set(op["column_names"] as string[]); rows = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !n.has(k)))); columns = columns.filter((c) => !n.has(c.name)); break; }
        case "rename": { const from = (op["column"] as ColumnRef).column_name, to = String(op["new_name"]); rows = rows.map((r) => { const { [from]: v, ...rest } = r; return { ...rest, [to]: v }; }); columns = columns.map((c) => (c.name === from ? { ...c, name: to } : c)); break; }
        case "cast": { const n = (op["column"] as ColumnRef).column_name, t = op["data_type"] as ColType; if (t === "Integer" || t === "Decimal") rows.forEach((r) => (r[n] = r[n] == null ? null : t === "Integer" ? Math.trunc(Number(r[n])) : Number(r[n]))); else if (t === "String") rows.forEach((r) => (r[n] = r[n] == null ? null : String(r[n]))); columns = columns.map((c) => (c.name === n ? { ...c, type: t } : c)); break; }
        case "mutate": { const e = (op["expression"] as { expression: string }).expression, n = String(op["new_name"]); rows.forEach((r) => (r[n] = evalColumnExpr(e, r))); columns = [...columns.filter((c) => c.name !== n), { name: n, type: (op["data_type"] as ColType) ?? "Decimal" }]; break; }
        case "summarize": rows = summarize(rows, (op["measures"] as Measure[]) ?? [], (op["dimensions"] as Dimension[]) ?? []); columns = colsOf(rows, columns); break;
        case "order_by": rows = sortRows(rows, [op as unknown as { column: ColumnRef; direction: string }]); break;
        case "limit": rows = rows.slice(0, Number(op["limit"]) || rows.length); break;
        case "pivot_wider": {
          const rd = (op["rows"] as Dimension[]) ?? [], cd = (op["columns"] as Dimension[]) ?? [], vs = (op["values"] as Measure[]) ?? [];
          rows = pivot(rows, rd, cd, vs); columns = colsOf(rows, columns); break;
        }
        default: server.push(SERVER_OPS[op.type] ?? `Operation "${op.type}" requires the server`);
      }
    } catch (e) { server.push(`${op.type}: ${(e as Error).message}`); }
  }
  return { columns, rows, notes, server };
}
/** R5-b — a pivot step (Insights pivot_wider) any query can add, including one that starts from another saved query. */
export function pivotStep(p: { rows: string; columns: string; aggregation: string; measure?: string | undefined; granularity?: string | undefined }): Operation {
  const m = p.measure || "count";
  return { type: "pivot_wider",
    rows: [{ dimension_name: p.rows, column_name: p.rows, data_type: "String", ...(p.granularity ? { granularity: p.granularity } : {}) }],
    columns: [{ dimension_name: p.columns, column_name: p.columns, data_type: "String" }],
    values: [{ measure_name: `${p.aggregation}_of_${p.measure || "rows"}`, column_name: m, aggregation: p.aggregation, data_type: "Decimal" }] };
}
/** A query step that reads another saved query's result (Insights "query" table source). */
export const savedQuerySource = (queryName: string): Operation => ({ type: "source", table: { type: "query", query_name: queryName } });

export function pivot(rows: Row[], rd: Dimension[], cd: Dimension[], vs: Measure[]): Row[] {
  const out = new Map<string, Row>(); const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const rk = Object.fromEntries(rd.map((d) => [d.dimension_name || d.column_name, bucket(r[d.column_name], d.granularity)]));
    const ck = cd.map((d) => bucket(r[d.column_name], d.granularity)).join(" · ");
    const k = JSON.stringify(rk);
    out.set(k, out.get(k) ?? rk);
    const gk = `${k}|${ck}`; groups.set(gk, [...(groups.get(gk) ?? []), r]);
  }
  for (const [gk, g] of groups) { const [k, ck] = gk.split("|"); const row = out.get(k!)!; vs.forEach((m) => (row[vs.length > 1 ? `${ck} ${m.measure_name}` : ck || m.measure_name] = aggregate(g, m))); }
  return [...out.values()];
}
