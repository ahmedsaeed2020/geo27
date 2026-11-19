import { createFileRoute } from "@tanstack/react-router";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { InsightsShell, ServerTag } from "@/components/insights/InsightsShell";

export const Route = createFileRoute("/insights/data-store")({
  head: () => ({ meta: [{ title: "Data Store — Insights · Digit Virtual Core" }, { name: "description", content: "Tables imported into the Insights data store." }, { property: "og:title", content: "Data Store — Insights" }, { property: "og:description", content: "Tables imported into the Insights data store." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: DataStore,
});

/** data_store/DataStoreList.vue — stored tables and import jobs; syncing runs the server warehouse (DuckDB/parquet). */
function DataStore() {
  useStoreVersion();
  const tables = adapter.list("Insights Table v3");
  return (
    <InsightsShell header={<><span className="text-lg font-semibold">Data Store</span><div className="ms-auto"><ServerTag title="Imports write parquet files through the server warehouse">Import / Sync</ServerTag></div></>}>
      <table className="w-full text-sm"><thead className="border-b border-crm-line text-left text-crm-muted"><tr><th className="px-5 py-2 font-normal">Table</th><th className="font-normal">Data source</th><th className="font-normal">Rows</th><th className="font-normal">Stored</th></tr></thead>
        <tbody>{tables.map((t) => <tr key={t.name} className="border-b border-crm-line"><td className="px-5 py-2" data-no-i18n>{String(t["label"])}</td><td data-no-i18n>{String(t["data_source"])}</td><td>{String(t["estimated_row_count"] ?? "")}</td><td>{t["stored"] ? "Yes" : "No"}</td></tr>)}</tbody></table>
    </InsightsShell>
  );
}
