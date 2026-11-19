import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Shell, Loading } from "@/components/Shell";
import { indexQuery, metaQuery } from "@/lib/catalog";
import { adapter } from "@/lib/adapter";

export const Route = createFileRoute("/developer")({
  head: () => ({ meta: [
    { title: "Developer Mode — metadata catalog" },
    { name: "description", content: "Full field catalog of every discovered DocType with source references." },
    { property: "og:title", content: "Developer Mode — metadata catalog" },
    { property: "og:description", content: "Full field catalog of every discovered DocType with source references." },
  ] }),
  component: DeveloperRoute,
});

function DeveloperRoute() {
  const { pathname } = useLocation();
  return pathname === "/developer" || pathname === "/developer/" ? <Dev /> : <Outlet />;
}

function Dev() {
  const { data } = useQuery(indexQuery);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<{ app: string; slug: string } | null>(null);
  const meta = useQuery({ ...metaQuery(sel?.app ?? "", sel?.slug ?? ""), enabled: !!sel });
  if (!data) return <Shell><Loading /></Shell>;
  const list = data.filter((d) => (d.name + d.module).toLowerCase().includes(q.toLowerCase())).slice(0, 300);
  return (
    <Shell crumbs={[{ label: "Developer Mode" }]}>
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-dev">Metadata catalog</h1>
        <Link to="/developer/i18n" className="text-sm text-primary hover:underline">I18N Scan</Link>
        <Link to="/developer/experience" className="text-sm text-primary hover:underline">App experience registry</Link>
        <span className="text-sm text-muted-foreground">{data.length} DocTypes · {data.reduce((s, d) => s + d.nfields, 0)} fields</span>
        <span className="ms-auto text-xs text-muted-foreground">All records are synthetic (fictional company شركة ديجيت التجريبية للتجارة).</span>
        <button className="btn-ghost text-destructive" onClick={() => { if (confirm("Reset & reseed demo data? Only synthetic demo records are replaced; your own records are kept.")) { adapter.resetSynthetic(); location.reload(); } }}>Reset & reseed demo data</button>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="panel p-2">
          <input className="field-input mb-2" placeholder="Search DocType or module" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-[70vh] overflow-y-auto">
            {list.map((d) => (
              <button key={d.app + d.slug} onClick={() => setSel({ app: d.app, slug: d.slug })} className={`flex w-full justify-between rounded px-2 py-1 text-left text-sm hover:bg-muted ${sel?.slug === d.slug && sel.app === d.app ? "bg-accent" : ""}`}>
                <span>{d.name}</span><span className="text-[10px] text-muted-foreground">{d.app}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="panel overflow-x-auto p-3">
          {!meta.data ? <p className="text-muted-foreground">Select a DocType.</p> : (
            <>
              <div className="mb-2 flex items-center gap-3">
                <h2 className="font-semibold">{meta.data.name}</h2>
                <Link to="/app/$app/$doctype" params={{ app: sel!.app, doctype: sel!.slug }} className="text-sm text-primary">Open list →</Link>
                <span className="font-mono text-[10px] text-muted-foreground">{meta.data.source}</span>
              </div>
              <table className="w-full font-mono text-xs">
                <thead className="bg-muted text-left"><tr>{["#", "fieldname", "fieldtype", "label", "options", "reqd", "hidden", "depends_on"].map((h) => <th key={h} className="px-2 py-1">{h}</th>)}</tr></thead>
                <tbody>
                  {meta.data.fields.map((f, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2">{i + 1}</td><td className="px-2">{f.fieldname}</td><td className="px-2">{f.fieldtype}</td><td className="px-2">{f.label}</td>
                      <td className="max-w-[200px] truncate px-2" title={f.options}>{f.options}</td><td className="px-2">{f.reqd ? "✓" : ""}</td><td className="px-2">{f.hidden ? "✓" : ""}</td>
                      <td className="max-w-[260px] truncate px-2" title={f.depends_on}>{f.depends_on}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
