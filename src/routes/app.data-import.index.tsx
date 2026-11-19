import { createFileRoute, Link } from "@tanstack/react-router";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { Shell } from "@/components/Shell";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { useHydrated } from "@tanstack/react-router";

export const Route = createFileRoute("/app/data-import/")({
  head: () => ({ meta: [
    { title: "Data Import — Digit Desk" },
    { name: "description", content: "Data Import list: every spreadsheet import with its status and log." },
    { property: "og:title", content: "Data Import — Digit Desk" },
    { property: "og:description", content: "Data Import list: every spreadsheet import with its status and log." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: List,
});

const COLOR: Record<string, string> = { Success: "bg-success/20", "Partial Success": "bg-warning/20", Error: "bg-destructive/15", Pending: "bg-muted" };

function List() {
  useStoreVersion();
  const hydrated = useHydrated();
  const rows = hydrated ? adapter.list("Data Import").sort((a, b) => String(b.modified).localeCompare(String(a.modified))) : [];
  return (
    <Shell crumbs={[{ label: "Data Import" }]}>
      <ContextStrip icon={<img src="/icons/digit/feat/digit-feat-documents-dark.svg" alt="" />} eyebrow="Data" title="Data Import"
        sub="Import records from a spreadsheet; every row is checked against the same rules as the form."
        actions={<><Link to="/app/data-export" className="ek-context-btn">Export</Link><Link to="/app/data-import/new" className="ek-context-btn ek-btn-on-dark">+ <span>Add Data Import</span></Link></>} />
      <div className="ek-card ek-card-pad mt-4"><table className="w-full text-sm">
        <thead><tr className="text-muted-foreground"><th className="text-start">ID</th><th className="text-start">Document Type</th><th className="text-start">Import Type</th><th className="text-start">Status</th><th className="text-start">Last Updated On</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.name} className="border-t border-border">
            <td className="py-1.5"><Link to="/app/data-import/$name" params={{ name: r.name }} className="hover:underline" data-no-i18n>{r.name}</Link></td>
            <td>{String(r["reference_doctype"] ?? "")}</td><td>{String(r["import_type"] ?? "")}</td>
            <td><span className={`chip ${COLOR[String(r["status"])] ?? "bg-muted"}`}>{String(r["status"] ?? "Pending")}</span></td>
            <td data-no-i18n>{String(r.modified ?? "").slice(0, 16).replace("T", " ")}</td>
          </tr>))}
          {!rows.length && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground"><span>No</span> <span>Data Import</span> <span>found</span></td></tr>}
        </tbody>
      </table></div>
    </Shell>
  );
}
