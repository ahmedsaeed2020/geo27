import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useDevMode } from "@/lib/mode";
import { Shell, Loading } from "@/components/Shell";
import { WorkspaceView } from "@/components/desk/WorkspaceView";
import { indexQuery, reportsQuery } from "@/lib/catalog";
import { DESK_PAGES } from "@/components/pages/registry";
import { firstSidebarRoute, moduleSidebarsQuery, sidebarsQuery, workspacesFullQuery } from "@/lib/desk";
import { ModuleSidebarNav } from "@/components/desk/ModuleSidebarNav";
import { setCurrentShell } from "@/lib/moduleShell";

export const Route = createFileRoute("/desk/$sidebar")({
  validateSearch: (s: Record<string, unknown>): { ws?: string; section?: string } => ({ ...(typeof s["ws"] === "string" ? { ws: s["ws"] } : {}), ...(typeof s["section"] === "string" ? { section: s["section"] } : {}) }),
  head: ({ params }) => ({ meta: [
    { title: `${params.sidebar} — Digit Desk` },
    { name: "description", content: `${params.sidebar} workspace: shortcuts, cards, charts and documents from source.` },
    { property: "og:title", content: `${params.sidebar} — Digit Desk` },
    { property: "og:description", content: `${params.sidebar} workspace reconstructed from source definitions.` },
  ] }),
  component: DeskPage,
});

function DeskPage() {
  const { sidebar } = Route.useParams();
  const { ws, section } = Route.useSearch();
  const dev = useDevMode();
  const sbs = useQuery(sidebarsQuery);
  const msb = useQuery(moduleSidebarsQuery);
  const wss = useQuery(workspacesFullQuery);
  const idx = useQuery(indexQuery);
  const reps = useQuery(reportsQuery);
  const sb = sbs.data?.find((s) => s.name === sidebar) ?? msb.data?.find((s) => s.name === sidebar || s.module === sidebar);
  const isModule = !!sb && !!msb.data?.some((s) => s.name === sb.name);
  // the module sidebar on screen is the shell later list/form/report pages keep when it lists them (sidebar.js current_module)
  useEffect(() => { if (isModule && sb) setCurrentShell(sb.name); }, [isModule, sb]);
  if (!sbs.data || !msb.data || !wss.data || !idx.data) return <Shell><Loading /></Shell>;
  if (!sb) return <Shell><p className="text-muted-foreground">Workspace Sidebar "{sidebar}" is not in the supplied sources.</p></Shell>;
  const wsName = ws ?? sb.items.find((i) => i.link_type === "Workspace")?.link_to ?? sb.name;
  const workspace = wss.data.find((w) => w.name === wsName);
  const dt = (n?: string) => idx.data!.find((d) => d.name === n);
  // no workspace for this sidebar: open its first link, as the Desktop Icon does (frappe.utils.get_route_for_icon)
  // an empty source workspace (develop moved Automation / Email / Printing content into the sidebar) opens like a missing one
  const emptyWs = !!workspace && !workspace.content.length && !workspace.links.length && !workspace.shortcuts.length;
  if (!workspace || (emptyWs && !ws)) {
    if (!reps.data) return <Shell><Loading /></Shell>;
    const first = firstSidebarRoute(sb.items, { doctype: (n) => !!dt(n), report: (n) => reps.data!.some((r) => r.name === n), page: (n) => !!DESK_PAGES[n] }, section);
    if (first?.kind === "doctype") { const e = dt(first.name)!; return <Navigate to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} replace />; }
    if (first?.kind === "report") return <Navigate to="/report/$name" params={{ name: first.name }} replace />;
    if (first?.kind === "page") return <Navigate to="/page/$name" params={{ name: first.name }} replace />;
    if (first?.kind === "dashboard") return <Navigate to="/dashboard/$name" params={{ name: first.name }} replace />;
    if (first?.kind === "workspace" && first.name !== wsName && wss.data.some((w) => w.name === first.name)) return <Navigate to="/desk/$sidebar" params={{ sidebar }} search={{ ws: first.name }} replace />;
  }
  return (
    <Shell sidebar={<ModuleSidebarNav key={sb.name} sb={sb.items} sidebar={sidebar} active={{ kind: "Workspace", name: wsName }} title={sb.title} open={section} />} crumbs={[{ label: sb.title }]}>
      {workspace && !emptyWs ? <WorkspaceView w={workspace} dt={dt} /> : <><h1 className="text-xl font-semibold">{section ?? workspace?.title ?? sb.title}</h1><p className="mt-2 text-sm text-muted-foreground" data-sidebar-empty>This module has no workspace. Open an item from the menu.</p></>}
      {dev && <p className="mt-8 font-mono text-[10px] text-muted-foreground">sidebar: {sb.source}{workspace ? ` · workspace: ${workspace.source}` : ""}</p>}
    </Shell>
  );
}
