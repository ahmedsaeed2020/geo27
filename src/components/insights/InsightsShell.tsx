import { Link, useHydrated } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { demoReady, loadDemo } from "@/lib/insights";
import { seedInsights } from "@/lib/insightsSeed";
import { LangToggle } from "@/i18n/LangToggle";
import { ADMIN, useSessionUser } from "@/lib/session";
import { useScopeMetas } from "@/lib/scope";

/** Sidebar links follow frontend/src2/components/AppSidebar.vue (Data Store shows only when enable_data_store is set). */
export function InsightsShell({ children, header }: { children: ReactNode; header?: ReactNode }) {
  useStoreVersion();
  const hydrated = useHydrated();
  const ready = useInsightsReady();
  // site tables are permission-scoped (src/lib/scope.ts); non-admin sessions need each table's meta to evaluate the rules
  const me = useSessionUser();
  useScopeMetas(hydrated && me !== ADMIN ? adapter.doctypes() : []);
  const ds = hydrated && !!adapter.get("Insights Settings", "Insights Settings")?.["enable_data_store"];
  const nav = [
    { label: "Dashboards", to: "/insights/dashboards" },
    { label: "Workbooks", to: "/insights/workbook" },
    { label: "Data Sources", to: "/insights/data-source" },
    ...(ds ? [{ label: "Data Store", to: "/insights/data-store" }] : []),
    { label: "Settings", to: "/insights/settings" },
  ];
  return (
    <div className="flex h-screen bg-crm-surface text-crm-ink">
      <aside className="flex w-52 shrink-0 flex-col border-e border-crm-line bg-crm-sidebar p-2">
        <div className="mb-3 flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-crm-dark text-xs font-bold text-crm-surface">In</div>
          <div className="leading-tight"><div className="text-sm font-semibold">Insights</div><div className="text-[11px] text-crm-muted" data-no-i18n>{me}</div></div>
        </div>
        <nav className="space-y-0.5">
          {nav.map((n) => <Link key={n.to} to={n.to} className="block rounded px-2 py-1.5 text-sm hover:bg-crm-hover" activeProps={{ className: "bg-crm-surface shadow-sm" }}>{n.label}</Link>)}
        </nav>
        <div className="mt-auto space-y-1 border-t border-crm-line pt-2 text-[11px] text-crm-muted">
          <p className="px-2">Insights 4.0.0-dev preview. Queries run locally on the source demo dataset; database connections and SQL run on a server.</p>
          <Link to="/" className="block rounded px-2 py-1 hover:bg-crm-hover">← Digit Virtual Core</Link>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-crm-line px-5">{ready ? header : null}<LangToggle className="ms-auto" /></header>
        <div className="min-h-0 flex-1 overflow-auto">{ready ? children : <p className="p-6 text-sm text-crm-muted">Loading Insights data…</p>}</div>
      </div>
    </div>
  );
}

/** Records live in localStorage and the demo dataset is fetched, so render only after hydration + load. */
export function useInsightsReady() {
  const hydrated = useHydrated();
  const [ok, setOk] = useState(demoReady());
  useEffect(() => { if (hydrated) void seedInsights().then(loadDemo).then(() => setOk(true)); }, [hydrated]);
  return hydrated && ok;
}

export function ServerTag({ children, title }: { children: ReactNode; title?: string | undefined }) {
  return <span title={title} className="inline-flex items-center rounded border border-dashed border-crm-line px-1.5 py-0.5 text-[10px] text-crm-muted">server · {children}</span>;
}
