import { PluginPageHost } from "@/components/plugins/PluginPageHost";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Shell } from "@/components/Shell";
import { cardValue, chartData, enabledPlugins, usePluginsVersion, pluginSlug } from "@/plugins/runtime";
import { useStoreVersion } from "@/lib/adapter";
import { fmtCurrency, fmtNumber } from "@/lib/format";
import { useHydrated } from "@/components/hrms/HrShell";
import { useScopeMetas } from "@/lib/scope";
import { useEffect } from "react";
import { enterApp } from "@/plugins/appShell";
import { setActiveExperience } from "@/plugins/theme";
import { slotsOf } from "@/plugins/experienceSlots";

export const Route = createFileRoute("/plugins/$name/")({
  head: ({ params }) => ({ meta: [
    { title: `${params.name.replace(/_/g, " ")} — Workspace` },
    { name: "description", content: `Workspace of the ${params.name.replace(/_/g, " ")} app: number cards, charts and shortcuts.` },
    { property: "og:title", content: `${params.name.replace(/_/g, " ")} — Workspace` },
    { property: "og:description", content: "Plugin workspace computed from local records." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PluginWorkspacePage,
});

type WsLink = { label: string; type: "Card Break" | "Link"; link_to?: string };
/** Group Frappe Workspace Link rows into cards (Card Break starts a card), like Frappe's links widget. */
const linkCards = (links: WsLink[]) => links.reduce<{ label: string; items: WsLink[] }[]>((acc, l) => { if (l.type === "Card Break") acc.push({ label: l.label, items: [] }); else acc[acc.length - 1]?.items.push(l); return acc; }, []);

/** Map a Frappe filter list to the list-view URL filter param. */
const listFilters = (f: [string, string, string, unknown][]) => JSON.stringify(f.filter(([, , , v]) => !["This Month Start", "Today"].includes(String(v))).map(([, k, op, v]) => [k, op, String(v)]));

function PluginWorkspacePage() {
  const { name } = Route.useParams();
  usePluginsVersion(); useStoreVersion();
  const hydrated = useHydrated();
  const p = enabledPlugins().find((x) => x.name === name);
  // opening an app workspace enters the app shell (contextual navigation in the Desk sidebar)
  // an app with a themed experience also activates it (its theme and slots then apply to the native screens it opens)
  useEffect(() => { if (p) { enterApp(name); if (p.theme || p.experience) setActiveExperience(name); } }, [p, name]);
  // cards/charts count only rows the session user may read; load their metas so non-admin scope can be evaluated
  useScopeMetas(hydrated ? [...(p?.number_cards ?? []), ...(p?.dashboard_charts ?? [])].map((c) => c.document_type) : []);
  if (!hydrated) return <Shell><p className="text-muted-foreground">Loading…</p></Shell>;
  // an app with its own virtual pages renders its home page (manifest page path "") at /plugins/<name>
  if (p?.pages?.some((pg) => pg.path === "")) return <PluginPageHost name={name} path="" />;
  if (!p) return <Shell><p className="text-muted-foreground">App not enabled. <Link to="/plugins" className="underline">Plugin Manager</Link></p></Shell>;
  const ws = p.workspaces?.[0];
  // an app whose experience has its own home and no manifest workspace (DIGIT HR) opens that home, so the plugin-owned
  // DocType breadcrumb (AppCrumb → /plugins/<app>) always returns somewhere meaningful
  if (!ws) return p.experience ? <Navigate to={p.experience.home as "/"} replace /> : <Shell><p>No workspace.</p></Shell>;
  const slugDt = (dt: string) => { const own = p.doctypes?.some((d) => d.name === dt); return { app: own ? p.host_app : "erpnext", doctype: pluginSlug(dt) }; };
  const xs = slotsOf(p.name); const Extras = xs?.WorkspaceExtras;
  return (
    <Shell crumbs={[{ label: "", to: <Link to="/plugins" className="hover:underline">Plugin Manager</Link> }, { label: ws.label }]}>
      <div className="flex flex-wrap items-center gap-3">
        {p.theme?.logo && <><img src={p.theme.logo} alt={p.title} className="h-9 w-auto dark:hidden" data-experience-logo /><img src={p.theme.logo_dark ?? p.theme.logo} alt={p.title} className="hidden h-9 w-auto dark:block" /></>}
        <h1 className="text-xl font-semibold">{ws.label}</h1>
      </div>
      {Extras && <Extras plugin={p} />}
      <div className="mt-4 grid gap-3 sm:grid-cols-3" data-number-cards>
        {ws.number_cards.map((cn) => { const c = p.number_cards?.find((x) => x.name === cn); if (!c) return null; const v = cardValue(c);
          return (
            <Link key={cn} to="/app/$app/$doctype" params={slugDt(c.document_type)} search={{ filters: listFilters(c.filters) } as never} className="rounded-lg border bg-card p-4 hover:border-primary" data-number-card={c.name}>
              <div className="text-sm text-muted-foreground">{c.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums" data-no-i18n data-card-value={v}>{c.function === "Count" ? fmtNumber(v, 0) : fmtCurrency(v)}</div>
            </Link>
          ); })}
      </div>
      {ws.charts.map((cn) => { const c = p.dashboard_charts?.find((x) => x.name === cn); if (!c) return null; const data = chartData(c); const max = Math.max(1, ...data.map((d) => d.value));
        return (
          <section key={cn} className="mt-4 rounded-lg border bg-card p-4" data-chart={c.name}>
            <h2 className="font-semibold">{c.chart_name}</h2>
            <div className="mt-3 grid gap-2">
              {data.map((d) => (
                <div key={d.label} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-sm">
                  <span className="truncate" data-no-i18n title={d.label}>{d.label}</span>
                  <div className="h-3 rounded bg-muted"><div className="h-3 rounded bg-primary" style={{ width: `${(d.value / max) * 100}%` }} /></div>
                  <span className="tabular-nums" data-no-i18n>{fmtCurrency(d.value)}</span>
                </div>
              ))}
            </div>
          </section>
        ); })}
      <section className="mt-4">
        <h2 className="font-semibold">Shortcuts</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {ws.shortcuts.map((s) => s.type === "Report"
            ? <Link key={s.label} to="/plugins/$name/report/$report" params={{ name, report: s.link_to }} className="btn-ghost" data-shortcut={s.label}>{s.label}</Link>
            : <Link key={s.label} to="/app/$app/$doctype" params={slugDt(s.link_to)} className="btn-ghost" data-shortcut={s.label}>{s.label}</Link>)}
        </div>
      </section>
      {(ws.links?.length ?? 0) > 0 && <section className="mt-4" data-link-cards>
        <h2 className="font-semibold">Native DIGIT screens</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {linkCards(ws.links as WsLink[]).map((c) => (
            <div key={c.label} className="rounded-lg border bg-card p-4" data-link-card={c.label}>
              <h3 className="text-sm font-semibold">{c.label}</h3>
              <ul className="mt-2 grid gap-1 text-sm">{c.items.filter((l) => l.link_to).map((l) => <li key={l.label}>
                <Link to="/app/$app/$doctype" params={slugDt(l.link_to!)} className="hover:underline">{l.label}</Link>
                {xs?.linkBadge?.(l.link_to!)}
              </li>)}</ul>
            </div>))}
        </div>
      </section>}
    </Shell>
  );
}
