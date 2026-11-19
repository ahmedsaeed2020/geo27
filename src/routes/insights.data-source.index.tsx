import { createFileRoute, Link } from "@tanstack/react-router";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { InsightsShell, ServerTag } from "@/components/insights/InsightsShell";

export const Route = createFileRoute("/insights/data-source/")({
  head: () => ({ meta: [{ title: "Data Sources — Insights · Digit Virtual Core" }, { name: "description", content: "Insights data sources and connection types." }, { property: "og:title", content: "Data Sources — Insights" }, { property: "og:description", content: "Insights data sources and connection types." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: DataSourceList,
});

const CONNECT = ["MariaDB", "PostgreSQL", "DuckDB", "ClickHouse", "Upload CSV"];
/** data_source/DataSourceList.vue + Connect*Dialog.vue */
function DataSourceList() {
  useStoreVersion();
  const rows = adapter.list("Insights Data Source v3");
  return (
    <InsightsShell header={<><span className="text-lg font-semibold">Data Sources</span><div className="ms-auto flex flex-wrap gap-1">{CONNECT.map((c) => <ServerTag key={c} title="Connecting tests credentials against a live database on the server">Connect {c}</ServerTag>)}</div></>}>
      <table className="w-full text-sm"><thead className="border-b border-crm-line text-left text-crm-muted"><tr><th className="px-5 py-2 font-normal">Title</th><th className="font-normal">Type</th><th className="font-normal">Status</th><th className="font-normal">Execution</th></tr></thead>
        <tbody>{rows.map((d) => (
          <tr key={d.name} className="border-b border-crm-line hover:bg-crm-hover"><td className="px-5 py-2"><Link to="/insights/data-source/$name" params={{ name: d.name }} className="font-medium hover:underline">{String(d["title"])}</Link></td>
            <td>{String(d["database_type"])}</td><td>{String(d["status"])}</td><td className="text-xs text-crm-muted">{d.name === "demo_data" ? "local · source demo dataset" : d["is_site_db"] ? "local · preview records" : "server"}</td></tr>))}</tbody></table>
    </InsightsShell>
  );
}
