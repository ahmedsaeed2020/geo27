import { createFileRoute, Link } from "@tanstack/react-router";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Shell, Loading } from "@/components/Shell";
import { APPS, reportsQuery } from "@/lib/catalog";

export const Route = createFileRoute("/report/")({
  head: () => ({ meta: [
    { title: "Reports — Digit Desk" },
    { name: "description", content: "Every source-defined report with its type, filters and preview availability." },
    { property: "og:title", content: "Reports — Digit Desk" },
    { property: "og:description", content: "Every source-defined report with its type, filters and preview availability." },
  ] }),
  component: Reports,
});

function Reports() {
  const { data } = useQuery(reportsQuery);
  const [q, setQ] = useState("");
  if (!data) return <Shell><Loading /></Shell>;
  const list = data.filter((r) => (r.name + r.module).toLowerCase().includes(q.toLowerCase()));
  const mods = [...new Set(list.map((r) => `${r.app} · ${r.module}`))].sort();
  return (
    <Shell crumbs={[{ label: "Reports" }]}>
      <ContextStrip icon={<img src="/icons/digit/mod/digit-mod-reports-dark.svg" alt="" />} eyebrow="DIGIT" title="Reports"
        sub="Every report of the system by module; each opens with its filters and the records behind each figure."
        facts={[{ id: "reports", label: "Reports", value: data.length }]} />
      <div className="ek-card ek-filterbar mt-3" data-list-filterbar><input className="field-input w-64" placeholder="Filter reports" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="mt-4 columns-1 gap-4 md:columns-2 xl:columns-3">
        {mods.map((m) => (
          <div key={m} className="panel mb-4 break-inside-avoid p-3">
            <h2 className="mb-1 text-xs font-semibold uppercase text-muted-foreground"><span>{APPS[m.split(" · ")[0] as keyof typeof APPS]?.label ?? m.split(" · ")[0]}</span> · <span>{m.split(" · ").slice(1).join(" · ")}</span></h2>
            {list.filter((r) => `${r.app} · ${r.module}` === m).map((r) => (
              <Link key={r.name} to="/report/$name" params={{ name: r.name }} className="flex justify-between gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
                <span className="truncate">{r.name}</span><span className={`chip ${r.status === "preview-computable" ? "bg-accent" : "bg-warning/20"}`}>{r.report_type.replace(" Report", "")}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </Shell>
  );
}
