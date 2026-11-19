import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Shell, Loading } from "@/components/Shell";
import { DevOnly } from "@/components/DevOnly";
import { APPS, indexQuery, loadMeta, reportsQuery, slugOf, workspacesQuery, type AppId, type IndexEntry } from "@/lib/catalog";
import { adapter, useStoreVersion } from "@/lib/adapter";

export const Route = createFileRoute("/app/$app/")({
  head: ({ params }) => {
    const l = APPS[params.app as AppId]?.label ?? params.app;
    return { meta: [
      { title: `${l} workspace — Digit Virtual Core` },
      { name: "description", content: `Modules, workspaces and reports of ${l} from source.` },
      { property: "og:title", content: `${l} workspace — Digit Virtual Core` },
      { property: "og:description", content: `Modules, workspaces and reports of ${l} from source.` },
    ] };
  },
  component: AppHome,
});

function AppHome() {
  const { app } = Route.useParams();
  const idx = useQuery(indexQuery);
  const ws = useQuery(workspacesQuery);
  const reps = useQuery(reportsQuery);
  const [showTables, setShowTables] = useState(false);
  const [q, setQ] = useState("");
  useStoreVersion();

  const entries = useMemo(() => (idx.data ?? []).filter((d) => d.app === app && (showTables || !d.istable) && d.name.toLowerCase().includes(q.toLowerCase())), [idx.data, app, showTables, q]);
  const byModule = useMemo(() => {
    const m: Record<string, IndexEntry[]> = {};
    entries.forEach((e) => (m[e.module] ??= []).push(e));
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);
  const workspaces = (ws.data ?? []).filter((w) => w.app === app);

  // seed shortcut doctypes so number cards reflect shared records
  const shortcutTargets = useMemo(() => [...new Set(workspaces.flatMap((w) => w.shortcuts.filter((s) => s.type === "DocType").map((s) => s.link_to!)))], [workspaces]);
  useEffect(() => {
    if (!idx.data) return;
    shortcutTargets.forEach(async (n) => { const m = await loadMeta(idx.data!, n); if (m) adapter.ensureSeed(m); });
  }, [idx.data, shortcutTargets]);

  if (!idx.data) return <Shell><Loading /></Shell>;
  const label = APPS[app as AppId]?.label ?? app;
  const slugFor = (n: string) => idx.data!.find((d) => d.name === n);

  return (
    <Shell crumbs={[{ label: label }]}>
      <h1 className="text-2xl font-semibold">{label}</h1>
      {app === "crm" && <p className="mt-1 text-sm text-muted-foreground">Standalone DIGIT CRM (FCRM module). Its models are kept separate from DIGIT CRM DocTypes (Lead, Opportunity).</p>}

      {workspaces.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 font-semibold">Workspaces (source-defined)</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {workspaces.map((w) => (
              <div key={w.name} className="panel p-4">
                <div className="flex items-baseline justify-between"><h3 className="font-semibold">{w.name}</h3><DevOnly><span className="font-mono text-[10px] text-muted-foreground">{w.source.split("/").slice(-3, -1).join("/")}</span></DevOnly></div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {w.shortcuts.filter((s) => s.type === "DocType" && slugFor(s.link_to!)).map((s) => {
                    const e = slugFor(s.link_to!)!;
                    return (
                      <Link key={s.label} to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} className="rounded-md bg-muted px-2.5 py-1.5 text-xs hover:bg-accent">
                        <span className="block text-base font-semibold">{adapter.list(e.name).length}</span>{s.label}
                      </Link>
                    );
                  })}
                </div>
                <div className="mt-3 space-y-0.5 text-sm">
                  {w.links.map((l, i) => l.type === "Card Break" ? <div key={i} className="pt-2 text-xs font-semibold uppercase text-muted-foreground">{l.label}</div> : (() => {
                    const e = l.link_type === "DocType" && l.link_to ? slugFor(l.link_to) : undefined;
                    return e ? <Link key={i} to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} className="block text-primary hover:underline">{l.label}</Link>
                      : <div key={i} className="text-muted-foreground">{l.label} <span className="chip bg-muted">{l.link_type}</span></div>;
                  })())}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="font-semibold">DocTypes by module</h2>
          <input className="field-input max-w-xs" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={showTables} onChange={(e) => setShowTables(e.target.checked)} /> include child tables</label>
        </div>
        <div className="columns-1 gap-4 md:columns-2 xl:columns-4">
          {byModule.map(([mod, list]) => (
            <div key={mod} className="panel mb-4 break-inside-avoid p-3">
              <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{mod}</h3>
              {list.map((e) => (
                <Link key={e.name} to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} className="flex justify-between rounded px-1 py-0.5 text-sm hover:bg-muted">
                  <span>{e.name}</span>
                  <span className="text-[10px] text-muted-foreground">{e.issingle ? "single" : e.istable ? "table" : e.is_submittable ? "submittable" : ""}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Reports ({(reps.data ?? []).filter((r) => r.app === app).length})</h2>
        <div className="panel divide-y divide-border">
          {(reps.data ?? []).filter((r) => r.app === app).map((r) => {
            const e = r.ref_doctype ? slugFor(r.ref_doctype) : undefined;
            return (
              <div key={r.name} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                <span className="flex-1">{r.name}</span>
                <span className="chip bg-muted">{r.report_type}</span>
                {e && <Link to="/app/$app/$doctype" params={{ app: e.app, doctype: slugOf(e.name) }} className="text-xs text-primary">{r.ref_doctype}</Link>}
                <span className={`chip ${r.status === "server-dependent" ? "bg-warning/20" : "bg-accent"}`}>{r.status}</span>
              </div>
            );
          })}
        </div>
      </section>
    </Shell>
  );
}
