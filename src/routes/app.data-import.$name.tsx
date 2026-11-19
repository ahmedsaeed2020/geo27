import { createFileRoute, Link, useNavigate, useHydrated } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shell, Loading } from "@/components/Shell";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { indexQuery } from "@/lib/catalog";
import { download, erroredRows, type ImportResult } from "@/lib/dataImport";

export const Route = createFileRoute("/app/data-import/$name")({
  head: ({ params }) => ({ meta: [
    { title: `${params.name} — Data Import Log` },
    { name: "description", content: "Import log with succeeded and failed rows, created records and errored-row export." },
    { property: "og:title", content: `${params.name} — Data Import Log` },
    { property: "og:description", content: "Import log with succeeded and failed rows, created records and errored-row export." },
    { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Log,
});

function Log() {
  const { name } = Route.useParams();
  useStoreVersion();
  const hydrated = useHydrated();
  const nav = useNavigate();
  const { data: index } = useQuery(indexQuery);
  if (!hydrated || !index) return <Shell><Loading what="Data Import" /></Shell>;
  const d = adapter.get("Data Import", name);
  if (!d) return <Shell><p>Data Import {name} not found. <Link to="/app/data-import" className="underline">Back</Link></p></Shell>;
  const results: ImportResult[] = (() => { try { return JSON.parse(String(d["import_log"] ?? "[]")); } catch { return []; } })();
  const header: string[] = (() => { try { return JSON.parse(String(d["template_options"] ?? "{}")).header ?? []; } catch { return []; } })();
  const dt = String(d["reference_doctype"] ?? "");
  const entry = index.find((e) => e.name === dt);
  const ok = results.filter((r) => r.ok), bad = results.filter((r) => !r.ok);
  return (
    <Shell crumbs={[{ label: "", to: <Link to="/app/data-import" className="hover:underline">Data Import</Link> }, { label: name }]}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold" data-no-i18n>{name}</h1>
        <span className="chip bg-muted">{String(d["status"])}</span>
        <div className="ms-auto flex gap-2">
          {bad.length > 0 && <button className="btn-ghost" onClick={() => download(erroredRows(header, results), `${name}_errored_rows`, "CSV")}>Export Errored Rows</button>}
          {bad.length > 0 && <button className="btn-primary" onClick={() => void nav({ to: "/app/data-import/new", search: { doctype: dt } })}>Retry</button>}
          {entry && <Link className="btn-ghost" to="/app/$app/$doctype" params={{ app: entry.app, doctype: entry.slug }}>Go to {dt} List</Link>}
        </div>
      </div>
      <p className="mt-2 text-sm">{dt} · {String(d["import_type"])} · {ok.length} of {results.length} records imported successfully.</p>
      <table className="mt-4 w-full text-sm">
        <thead><tr className="text-muted-foreground"><th className="text-start">Row Number</th><th className="text-start">Status</th><th className="text-start">Message</th></tr></thead>
        <tbody>{results.map((r) => (
          <tr key={r.row} className="border-t border-border align-top">
            <td className="py-1.5">{r.row}</td>
            <td><span className={`chip ${r.ok ? "bg-success/20" : "bg-destructive/15 text-destructive"}`}>{r.ok ? "Success" : "Failed"}</span></td>
            <td>{r.ok && r.name && entry
              ? <Link to="/app/$app/$doctype/$name" params={{ app: entry.app, doctype: entry.slug, name: r.name }} className="text-primary hover:underline"><span>{r.messages[0]}</span>: <span data-no-i18n>{r.name}</span></Link>
              : r.messages.map((m, k) => <div key={k}>{m}</div>)}</td>
          </tr>))}</tbody>
      </table>
    </Shell>
  );
}
