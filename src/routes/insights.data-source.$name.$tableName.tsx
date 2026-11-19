import { createFileRoute, Link } from "@tanstack/react-router";
import { InsightsShell } from "@/components/insights/InsightsShell";
import { getTable } from "@/lib/insights";

export const Route = createFileRoute("/insights/data-source/$name/$tableName")({
  head: () => ({ meta: [{ title: "Table preview — Insights" }, { name: "description", content: "Preview the columns and rows of a data source table." }, { property: "og:title", content: "Insights Table Preview" }, { property: "og:description", content: "Preview the columns and rows of a data source table." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: TablePreview,
});

/** data_source/DataSourceTable.vue (source params :data_source/:table_name) */
function TablePreview() {
  const { name, tableName } = Route.useParams();
  const t = getTable(name, tableName);
  return (
    <InsightsShell header={<><Link to="/insights/data-source/$name" params={{ name }} className="text-crm-muted">{name}</Link><span>/</span><span className="font-semibold">{tableName}</span><span className="ms-auto text-xs text-crm-muted">{t?.rows.length ?? 0} rows · first 100 shown</span></>}>
      {t ? <table className="w-full text-xs"><thead className="sticky top-0 bg-crm-sidebar"><tr>{t.columns.map((c) => <th key={c.name} className="px-2 py-1 text-left font-medium">{c.name}<span className="ml-1 text-[9px] text-crm-muted">{c.type}</span></th>)}</tr></thead>
        <tbody>{t.rows.slice(0, 100).map((r, i) => <tr key={i} className="border-t border-crm-line">{t.columns.map((c) => <td key={c.name} className="whitespace-nowrap px-2 py-1">{String(r[c.name] ?? "")}</td>)}</tr>)}</tbody></table> : <p className="p-6 text-sm">Table not found.</p>}
    </InsightsShell>
  );
}
