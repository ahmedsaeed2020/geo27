import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shell, Loading } from "@/components/Shell";

export const Route = createFileRoute("/coverage")({
  head: () => ({ meta: [
    { title: "Coverage — Digit Virtual Core" },
    { name: "description", content: "Implementation status of every discovered screen, report and action." },
    { property: "og:title", content: "Coverage — Digit Virtual Core" },
    { property: "og:description", content: "Implementation status of every discovered screen, report and action." },
  ] }),
  component: Coverage,
});

type Item = { area: string; item: string; status: string; note: string };

function Coverage() {
  const { data } = useQuery({ queryKey: ["coverage"], queryFn: () => fetch("/catalog/coverage.json").then((r) => r.json() as Promise<{ summary: Record<string, Record<string, number>>; items: Item[] }>), enabled: typeof window !== "undefined" });
  if (!data) return <Shell><Loading what="coverage" /></Shell>;
  return (
    <Shell crumbs={[{ label: "Coverage" }]}>
      <h1 className="text-xl font-semibold">Coverage tracker</h1>
      <p className="mt-1 text-sm text-muted-foreground">Stage 1 of several. Partial coverage is not labelled complete.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {Object.entries(data.summary).map(([area, s]) => (
          <div key={area} className="panel p-3">
            <div className="text-sm font-semibold">{area}</div>
            {Object.entries(s).map(([k, v]) => <div key={k} className="flex justify-between text-xs"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>)}
          </div>
        ))}
      </div>
      <div className="panel mt-4 max-h-[60vh] overflow-y-auto">
        <table className="w-full text-xs">
          <tbody>{data.items.map((i, k) => <tr key={k} className="border-t border-border"><td className="px-2 py-1">{i.area}</td><td className="px-2">{i.item}</td><td className="px-2"><span className="chip bg-muted">{i.status}</span></td><td className="px-2 text-muted-foreground">{i.note}</td></tr>)}</tbody>
        </table>
      </div>
    </Shell>
  );
}
