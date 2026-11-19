import { useState } from "react";
import { adapter, type Doc } from "@/lib/adapter";
import { AGGREGATIONS, DEMO, GRANULARITIES, OPERATORS, SERVER_OPS, SITE, listTables, parseJSON, pivotStep, runQuery, savedQuerySource, type Operation } from "@/lib/insights";
import { ServerTag } from "./InsightsShell";

/** Query builder (query/Query.vue + AddOperationPopover.vue): an ordered list of operations, edited and saved to Insights Query v3.operations. */
export function QueryEditor({ query }: { query: Doc }) {
  const [ops, setOps] = useState<Operation[]>(parseJSON<Operation[]>(query["operations"], []));
  const [saved, setSaved] = useState(true);
  const [adding, setAdding] = useState("");
  const res = runQuery(ops);
  const cols = res.columns.map((c) => c.name);
  const set = (o: Operation[]) => { setOps(o); setSaved(false); };
  const save = () => { adapter.update("Insights Query v3", query.name, { operations: JSON.stringify(ops) }); setSaved(true); };
  const src = ops.find((o) => o.type === "source")?.["table"] as { data_source?: string; table_name?: string } | undefined;
  const links = adapter.list("Insights Table Link v3").filter((l) => l["data_source"] === (src?.data_source ?? DEMO));
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-crm-line px-4 py-2">
        <input aria-label="Query title" className="crm-input max-w-64 font-medium" defaultValue={String(query["title"] ?? "")} onBlur={(e) => adapter.update("Insights Query v3", query.name, { title: e.target.value })} />
        <select aria-label="Add operation" className="crm-input w-auto" value={adding} onChange={(e) => setAdding(e.target.value)}>
          <option value="">+ Add step</option>
          {["source", "filter", "select", "remove", "rename", "join", "mutate", "summarize", "pivot_wider", "order_by", "limit", "sql", "code"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="crm-btn-solid ms-auto" onClick={save} disabled={saved}>{saved ? "Saved" : "Save"}</button>
      </div>
      {adding && <AddStep type={adding} cols={cols} links={links} self={query.name} onCancel={() => setAdding("")} onAdd={(o) => { set(adding === "source" ? [o] : [...ops, o]); setAdding(""); }} />}
      <ol className="space-y-1 border-b border-crm-line px-4 py-2 text-xs" aria-label="Operations">
        {ops.map((o, i) => (
          <li key={i} className="flex items-center gap-2"><span className="w-5 text-crm-muted">{i + 1}</span><span className="rounded bg-crm-hover px-1.5 py-0.5 font-medium">{o.type}</span>
            <span className="truncate text-crm-muted">{describe(o)}</span>
            {SERVER_OPS[o.type] && <ServerTag title={SERVER_OPS[o.type]}>{o.type}</ServerTag>}
            <button aria-label={`Remove step ${i + 1}`} className="ms-auto text-crm-muted" onClick={() => set(ops.filter((_, j) => j !== i))}>✕</button></li>
        ))}
        {!ops.length && <li className="text-crm-muted">Pick a source table to start.</li>}
      </ol>
      <div className="flex items-center gap-3 px-4 py-1 text-[11px] text-crm-muted"><span data-testid="row-count">{res.rows.length} rows</span><span>{cols.length} columns</span>{res.server.map((s) => <ServerTag key={s}>{s}</ServerTag>)}<span className="ms-auto">Executed locally · source demo dataset</span></div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs"><thead className="sticky top-0 bg-crm-sidebar"><tr>{res.columns.map((c) => <th key={c.name} className="px-2 py-1 text-left font-medium">{c.name}<span className="ml-1 text-[9px] text-crm-muted">{c.type}</span></th>)}</tr></thead>
          <tbody>{res.rows.slice(0, 100).map((r, i) => <tr key={i} className="border-t border-crm-line">{cols.map((c) => <td key={c} className="whitespace-nowrap px-2 py-1">{String(r[c] ?? "")}</td>)}</tr>)}</tbody></table>
      </div>
    </div>
  );
}

function describe(o: Operation): string {
  const c = (x: unknown) => (x as { column_name?: string })?.column_name ?? "";
  switch (o.type) {
    case "source": { const t = o["table"] as { data_source?: string; table_name?: string; query_name?: string }; return t.query_name ? `query ${t.query_name}` : `${t.data_source}.${t.table_name}`; }
    case "join": return `${o["join_type"]} join ${(o["table"] as { table_name?: string }).table_name}`;
    case "filter": return `${c(o["column"])} ${o["operator"]} ${JSON.stringify(o["value"] ?? "")}`;
    case "filter_group": return `${((o["filters"] as unknown[]) ?? []).length} conditions (${o["logical_operator"]})`;
    case "mutate": return `${o["new_name"]} = ${(o["expression"] as { expression: string }).expression}`;
    case "summarize": return `${((o["measures"] as { measure_name: string }[]) ?? []).map((m) => m.measure_name).join(", ")} by ${((o["dimensions"] as { column_name: string }[]) ?? []).map((d) => d.column_name).join(", ")}`;
    case "pivot_wider": return `${((o["values"] as { measure_name: string }[]) ?? []).map((m) => m.measure_name).join(", ")} · rows ${((o["rows"] as { column_name: string }[]) ?? []).map((d) => d.column_name).join(", ")} × columns ${((o["columns"] as { column_name: string }[]) ?? []).map((d) => d.column_name).join(", ")}`;
    case "order_by": return `${c(o["column"])} ${o["direction"]}`;
    case "cast": return `${c(o["column"])} → ${o["data_type"]}`;
    case "limit": return String(o["limit"]);
    case "select": case "remove": return ((o["column_names"] as string[]) ?? []).join(", ");
    case "rename": return `${c(o["column"])} → ${o["new_name"]}`;
    default: return "";
  }
}

function AddStep({ type, cols, links, self, onAdd, onCancel }: { type: string; cols: string[]; links: Doc[]; self: string; onAdd: (o: Operation) => void; onCancel: () => void }) {
  const [a, setA] = useState(""); const [b, setB] = useState(""); const [c, setC] = useState(""); const [d, setD] = useState("");
  const [ds, setDs] = useState(DEMO);
  const tables = listTables(ds);
  const colSel = (v: string, s: (x: string) => void, label: string) => <select aria-label={label} className="crm-input w-auto" value={v} onChange={(e) => s(e.target.value)}><option value="">{label}</option>{cols.map((x) => <option key={x} value={x}>{x}</option>)}</select>;
  const col = (n: string) => ({ type: "column", column_name: n });
  let body = null, op: Operation | null = null;
  if (type === "source") {
    const saved = adapter.list("Insights Query v3").filter((q) => q.name !== self);
    body = <><select aria-label="Data source" className="crm-input w-auto" value={ds} onChange={(e) => { setDs(e.target.value); setA(""); }}><option value={DEMO}>Demo Data</option><option value={SITE}>Site DB</option><option value="__query">Saved query</option></select>
      {ds === "__query"
        ? <select aria-label="Saved query" className="crm-input w-auto" value={a} onChange={(e) => setA(e.target.value)}><option value="">Saved query</option>{saved.map((q) => <option key={q.name} value={q.name}>{String(q["title"] || q.name)}</option>)}</select>
        : <select aria-label="Table" className="crm-input w-auto" value={a} onChange={(e) => setA(e.target.value)}><option value="">Table</option>{tables.map((t) => <option key={t.table} value={t.table}>{t.table}</option>)}</select>}</>;
    if (a) op = ds === "__query" ? savedQuerySource(a) : { type: "source", table: { type: "table", data_source: ds, table_name: a } };
  } else if (type === "filter") {
    body = <>{colSel(a, setA, "Column")}<select aria-label="Operator" className="crm-input w-auto" value={b} onChange={(e) => setB(e.target.value)}><option value="">Operator</option>{OPERATORS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}</select>
      {!["is_set", "is_not_set"].includes(b) && <input aria-label="Value" className="crm-input max-w-48" placeholder={b.includes("in") || b === "between" ? "a, b" : "Value"} value={c} onChange={(e) => setC(e.target.value)} />}</>;
    if (a && b) op = { type: "filter", column: col(a), operator: b, value: b === "in" || b === "not_in" || b === "between" ? c.split(",").map((x) => x.trim()) : c };
  } else if (type === "select" || type === "remove") {
    body = <input aria-label="Columns" className="crm-input max-w-96" placeholder={`comma separated: ${cols.slice(0, 3).join(", ")}`} value={a} onChange={(e) => setA(e.target.value)} />;
    if (a) op = { type, column_names: a.split(",").map((x) => x.trim()).filter(Boolean) };
  } else if (type === "rename") {
    body = <>{colSel(a, setA, "Column")}<input aria-label="New name" className="crm-input max-w-48" value={b} onChange={(e) => setB(e.target.value)} /></>;
    if (a && b) op = { type: "rename", column: col(a), new_name: b };
  } else if (type === "join") {
    body = <select aria-label="Join via table link" className="crm-input w-auto" value={a} onChange={(e) => setA(e.target.value)}><option value="">Linked table (Insights Table Link v3)</option>
      {links.map((l) => <option key={l.name} value={l.name}>{`${l["left_table"]}.${l["left_column"]} → ${l["right_table"]}.${l["right_column"]}`}</option>)}</select>;
    const l = links.find((x) => x.name === a);
    if (l) op = { type: "join", join_type: "left", table: { type: "table", data_source: l["data_source"], table_name: l["right_table"] }, join_condition: { left_column: col(String(l["left_column"])), right_column: col(String(l["right_column"])) } };
  } else if (type === "mutate") {
    body = <><input aria-label="New column name" className="crm-input max-w-40" placeholder="new column" value={a} onChange={(e) => setA(e.target.value)} /><input aria-label="Expression" className="crm-input max-w-80" placeholder="price * 2" value={b} onChange={(e) => setB(e.target.value)} /></>;
    if (a && b) op = { type: "mutate", new_name: a, data_type: "Decimal", expression: { type: "expression", expression: b } };
  } else if (type === "summarize") {
    body = <><select aria-label="Aggregation" className="crm-input w-auto" value={a} onChange={(e) => setA(e.target.value)}><option value="">Aggregation</option>{AGGREGATIONS.map((x) => <option key={x} value={x}>{x}</option>)}</select>
      {colSel(b, setB, "Measure column")}{colSel(c, setC, "Group by")}
      <select aria-label="Granularity" className="crm-input w-auto" value={d} onChange={(e) => setD(e.target.value)}><option value="">(no granularity)</option>{GRANULARITIES.map((x) => <option key={x} value={x}>{x}</option>)}</select></>;
    if (a && (b || a === "count")) op = { type: "summarize", measures: [{ measure_name: `${a}_of_${b || "rows"}`, column_name: b || "count", aggregation: a, data_type: "Decimal" }], dimensions: c ? [{ dimension_name: c, column_name: c, data_type: "String", ...(d ? { granularity: d } : {}) }] : [] };
  } else if (type === "pivot_wider") {
    body = <>{colSel(a, setA, "Rows")}{colSel(b, setB, "Columns")}
      <select aria-label="Aggregation" className="crm-input w-auto" value={c} onChange={(e) => setC(e.target.value)}><option value="">Aggregation</option>{AGGREGATIONS.map((x) => <option key={x} value={x}>{x}</option>)}</select>
      {colSel(d, setD, "Value column")}</>;
    if (a && b && c && (d || c === "count")) op = pivotStep({ rows: a, columns: b, aggregation: c, measure: d || undefined });
  } else if (type === "order_by") {
    body = <>{colSel(a, setA, "Column")}<select aria-label="Direction" className="crm-input w-auto" value={b || "asc"} onChange={(e) => setB(e.target.value)}><option value="asc">asc</option><option value="desc">desc</option></select></>;
    if (a) op = { type: "order_by", column: col(a), direction: b || "asc" };
  } else if (type === "limit") {
    body = <input aria-label="Limit" type="number" className="crm-input max-w-28" value={a} onChange={(e) => setA(e.target.value)} />;
    if (a) op = { type: "limit", limit: Number(a) };
  } else if (type === "sql" || type === "code") {
    body = <><textarea aria-label="Script" className="crm-input h-16 max-w-xl" value={a} onChange={(e) => setA(e.target.value)} placeholder={type === "sql" ? "select * from orders" : "# python"} /><ServerTag>{SERVER_OPS[type]}</ServerTag></>;
    if (a) op = type === "sql" ? { type, raw_sql: a, data_source: DEMO } : { type, code: a };
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-crm-line bg-crm-sidebar px-4 py-2" aria-label={`Add ${type}`}>
      <span className="text-xs font-medium">{type}</span>{body}
      <button className="crm-btn-solid" disabled={!op} onClick={() => op && onAdd(op)}>Add</button><button className="text-xs text-crm-muted" onClick={onCancel}>Cancel</button>
    </div>
  );
}
