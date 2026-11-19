import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shell, Loading } from "@/components/Shell";
import { WorkspaceView } from "@/components/desk/WorkspaceView";
import { ChartWidget, NumberCardWidget } from "@/components/desk/Widgets";
import { Tag } from "@/components/pages/kit";
import { indexQuery } from "@/lib/catalog";
import { chartsQuery, numberCardsQuery, workspacesFullQuery, type WorkspaceFull } from "@/lib/desk";

/** Module dashboard destinations for sidebar items with link_type "Dashboard"
 *  (frappe/public/js/frappe/views/dashboard/dashboard_view.js). Renders the
 *  matching Workspace when one exists, otherwise the module's Number Cards
 *  and Dashboard Charts from the source catalog. */
export const Route = createFileRoute("/dashboard/$name")({
  head: ({ params }) => ({ meta: [
    { title: `${params.name} Dashboard — Digit Desk` },
    { name: "description", content: `${params.name} module dashboard: number cards, charts and links from source definitions.` },
    { property: "og:title", content: `${params.name} Dashboard — Digit Desk` },
    { property: "og:description", content: `${params.name} module dashboard reconstructed from source definitions.` },
  ] }),
  component: DashboardPage,
});

/** Match a Dashboard link target to a Workspace by name/title/module. */
function findWorkspace(wss: WorkspaceFull[], name: string) {
  const n = name.toLowerCase();
  const norm = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const target = norm(name);
  return (
    wss.find((w) => w.name.toLowerCase() === n) ??
    wss.find((w) => norm(w.title) === target || norm(w.module) === target) ??
    wss.find((w) => norm(w.name).startsWith(target) || target.startsWith(norm(w.name)))
  );
}

function DashboardPage() {
  const { name } = Route.useParams();
  const wss = useQuery(workspacesFullQuery);
  const cards = useQuery(numberCardsQuery);
  const charts = useQuery(chartsQuery);
  const idx = useQuery(indexQuery);
  if (!wss.data || !cards.data || !charts.data || !idx.data) return <Shell><Loading /></Shell>;
  const ws = findWorkspace(wss.data, name);
  const dt = (n?: string) => idx.data!.find((d) => d.name === n);
  // HRMS sidebar dashboards group several areas under the "HR" module.
  const MODULE_ALIAS: Record<string, string> = { "Expense Claims": "HR", "Human Resource": "HR", "Attendance": "HR", "Employee Lifecycle": "HR" };
  const mod = (MODULE_ALIAS[name] ?? name).toLowerCase();
  const modCards = Object.values(cards.data).filter((c) => (c.module ?? "").toLowerCase() === mod);
  const modCharts = Object.values(charts.data).filter((c) => (c.module ?? "").toLowerCase() === mod);
  return (
    <Shell crumbs={[{ label: "Dashboards" }, { label: name }]}>
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-xl font-semibold">{name}</h1>
        <Tag kind="native">module dashboard</Tag>
      </div>
      {ws ? (
        <>
          <WorkspaceView w={ws} dt={dt} />
          <p className="mt-8 font-mono text-[10px] text-muted-foreground">workspace: {ws.source}</p>
        </>
      ) : modCards.length || modCharts.length ? (
        <>
          <p className="mb-4 text-xs text-muted-foreground">No Workspace named "{name}" in the sources; showing the module's Number Cards and Dashboard Charts.</p>
          <div className="grid grid-cols-12 gap-4">
            {modCards.map((c) => <div key={c.name} className="col-span-4"><NumberCardWidget card={c} label={c.label ?? c.name} /></div>)}
            {modCharts.map((c) => <div key={c.name} className="col-span-6"><ChartWidget chart={c} label={c.chart_name} /></div>)}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No Workspace, Number Cards or Dashboard Charts for "{name}" in the supplied sources.</p>
      )}
    </Shell>
  );
}
