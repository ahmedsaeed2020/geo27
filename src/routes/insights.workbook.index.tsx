import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { InsightsShell } from "@/components/insights/InsightsShell";

export const Route = createFileRoute("/insights/workbook/")({
  head: () => ({ meta: [{ title: "Workbooks — Insights · Digit Virtual Core" }, { name: "description", content: "Insights workbooks holding queries, charts and dashboards." }, { property: "og:title", content: "Workbooks — Insights" }, { property: "og:description", content: "Insights workbooks holding queries, charts and dashboards." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: WorkbookList,
});

/** workbook/WorkbookList.vue */
function WorkbookList() {
  useStoreVersion();
  const nav = useNavigate();
  const rows = adapter.list("Insights Workbook");
  const create = () => {
    const n = Math.max(10, ...rows.map((r) => Number(r.name) || 0)) + 1;
    adapter.insertDoc("Insights Workbook", { name: String(n), title: `Workbook ${n}` });
    nav({ to: "/insights/workbook/$workbookName", params: { workbookName: String(n) } });
  };
  return (
    <InsightsShell header={<><span className="text-lg font-semibold">Workbooks</span><button className="crm-btn-solid ms-auto" onClick={create}>+ New workbook</button></>}>
      <table className="w-full text-sm"><thead className="border-b border-crm-line text-left text-crm-muted"><tr><th className="px-5 py-2 font-normal">Title</th><th className="font-normal">Queries</th><th className="font-normal">Charts</th><th className="font-normal">Dashboards</th></tr></thead>
        <tbody>{rows.map((w) => { const c = (dt: string) => adapter.list(dt).filter((x) => x["workbook"] === w.name).length; return (
          <tr key={w.name} className="border-b border-crm-line hover:bg-crm-hover"><td className="px-5 py-2"><Link to="/insights/workbook/$workbookName" params={{ workbookName: w.name }} className="font-medium hover:underline">{String(w["title"])}</Link></td>
            <td>{c("Insights Query v3")}</td><td>{c("Insights Chart v3")}</td><td>{c("Insights Dashboard v3")}</td></tr>); })}</tbody></table>
    </InsightsShell>
  );
}
