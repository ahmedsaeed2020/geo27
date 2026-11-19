import { createFileRoute, Link } from "@tanstack/react-router";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { InsightsShell, ServerTag } from "@/components/insights/InsightsShell";
import { listTables } from "@/lib/insights";

export const Route = createFileRoute("/insights/data-source/$name/")({
  head: () => ({ meta: [{ title: "Data source tables — Insights" }, { name: "description", content: "Tables available in an Insights data source." }, { property: "og:title", content: "Insights Data Source Tables" }, { property: "og:description", content: "Tables available in an Insights data source." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: TableList,
});

/** data_source/DataSourceTableList.vue (source route param :name) */
function TableList() {
  useStoreVersion();
  const { name } = Route.useParams();
  const ds = adapter.get("Insights Data Source v3", name);
  const tables = listTables(name);
  const links = adapter.list("Insights Table Link v3").filter((l) => l["data_source"] === name);
  return (
    <InsightsShell header={<><Link to="/insights/data-source" className="text-crm-muted">Data Sources</Link><span>/</span><span className="font-semibold">{String(ds?.["title"] ?? name)}</span><div className="ms-auto"><ServerTag title="Sync tables re-reads the schema from the database">Sync tables</ServerTag></div></>}>
      <table className="w-full text-sm"><thead className="border-b border-crm-line text-left text-crm-muted"><tr><th className="px-5 py-2 font-normal">Table</th><th className="font-normal">Rows</th><th className="font-normal">Columns</th></tr></thead>
        <tbody>{tables.map((t) => <tr key={t.table} className="border-b border-crm-line hover:bg-crm-hover"><td className="px-5 py-2"><Link to="/insights/data-source/$name/$tableName" params={{ name, tableName: t.table }} className="font-medium hover:underline">{t.table}</Link></td><td>{t.rows}</td><td>{t.columns.length}</td></tr>)}</tbody></table>
      {links.length > 0 && <div className="p-5 text-xs"><div className="mb-1 font-medium">Table links (Insights Table Link v3)</div>{links.map((l) => <div key={l.name} className="text-crm-muted">{`${l["left_table"]}.${l["left_column"]} ↔ ${l["right_table"]}.${l["right_column"]}`}</div>)}</div>}
    </InsightsShell>
  );
}
