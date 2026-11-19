import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Shell, Loading } from "@/components/Shell";

type Inv = { generated: string; routes: number; before: Record<string, number>; after: Record<string, number>; covered_unique?: number; imported?: number; per_app?: Record<string, { digit_fields_unique: number; untranslated_unique: number }>; modes?: Record<string, { routes: number; digit_fields_unique: number; untranslated_unique: number; failed_routes: number }>; leftovers: { s: string; n: number; route: string }[] };

export const Route = createFileRoute("/developer/i18n")({
  head: () => ({ meta: [
    { title: "I18N Scan — Developer Mode" },
    { name: "description", content: "Rendered-screen scan of untranslated Arabic UI text with before/after counts." },
    { property: "og:title", content: "I18N Scan — Developer Mode" },
    { property: "og:description", content: "Rendered-screen scan of untranslated Arabic UI text." },
  ] }),
  component: I18nScan,
});

function I18nScan() {
  const { data } = useQuery({ queryKey: ["i18n-inventory"], queryFn: () => fetch("/i18n/inventory.json").then((r) => r.json() as Promise<Inv>) });
  const [q, setQ] = useState("");
  if (!data) return <Shell><Loading what="scan results" /></Shell>;
  const rows = data.leftovers.filter((l) => l.s.toLowerCase().includes(q.toLowerCase())).slice(0, 500);
  return (
    <Shell crumbs={[{ label: "Developer Mode" }, { label: "I18N Scan" }]}>
      <h1 className="text-xl font-semibold text-dev">I18N Scan</h1>
      <p className="text-sm text-muted-foreground">Generated {data.generated} over {data.routes} rendered routes in Arabic mode.</p>
      {data.per_app && <section className="panel mt-4 p-3 text-sm">
        <h2 className="font-semibold">digit-fields</h2>
        <p data-no-i18n>{data.imported} imported; {data.covered_unique} unique exact English strings covered. Priority: digit-fields &gt; Digit glossary/overrides &gt; upstream ar.po.</p>
        <table className="mt-2 w-full"><thead><tr><th className="text-start">App</th><th>Covered</th><th>Untranslated</th></tr></thead><tbody>
          {Object.entries(data.per_app).map(([app, v]) => <tr key={app} data-no-i18n><td>{app}</td><td className="text-center">{v.digit_fields_unique}</td><td className="text-center">{v.untranslated_unique}</td></tr>)}
        </tbody></table>
        {data.modes && <div className="mt-2" data-no-i18n>{Object.entries(data.modes).map(([mode, v]) => <p key={mode}>{mode}: {v.routes} routes; {v.failed_routes} failures; {v.untranslated_unique} unique leftovers</p>)}</div>}
      </section>}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(["before", "after"] as const).map((k) => (
          <div key={k} className="panel p-3 text-sm"><h2 className="mb-1 font-semibold capitalize">{k}</h2>
            {Object.entries(data[k]).map(([a, b]) => <div key={a} className="flex justify-between"><span>{a}</span><span data-no-i18n>{b}</span></div>)}
          </div>
        ))}
      </div>
      <input className="mt-4 w-full rounded border border-border bg-background px-2 py-1 text-sm" placeholder="Search list" value={q} onChange={(e) => setQ(e.target.value)} />
      <h2 className="mt-4 font-semibold">Top 50 leftovers</h2>
      <table className="mt-2 w-full text-sm"><tbody>
        {rows.slice(0, 50).map((l, i) => <tr key={i} className="border-b border-border"><td data-no-i18n className="py-1">{l.s}</td><td data-no-i18n className="text-xs text-muted-foreground">{l.route}</td><td data-no-i18n>{l.n}</td></tr>)}
      </tbody></table>
    </Shell>
  );
}
