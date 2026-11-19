import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell, Loading } from "@/components/Shell";
import { NativeReportBody, useNativeReport } from "@/components/report/NativeReport";

type Search = { filters?: string };
export const Route = createFileRoute("/report/$name")({
  validateSearch: (s: Record<string, unknown>): Search => (typeof s["filters"] === "string" ? { filters: s["filters"] } : {}),
  head: ({ params }) => ({ meta: [
    { title: `${params.name} — Report — Digit Desk` },
    { name: "description", content: `${params.name}: source filters, results, export, print and saved views.` },
    { property: "og:title", content: `${params.name} — Digit Desk` },
    { property: "og:description", content: `${params.name} report with its source-defined filters and actions.` },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ReportPage,
});

function ReportPage() {
  const { name } = Route.useParams();
  const search = Route.useSearch();
  const r = useNativeReport(name, search.filters);
  if (r.state === "loading") return <Shell><Loading /></Shell>;
  if (r.state === "missing") return <Shell crumbs={[{ label: "", to: <Link to="/report" className="hover:underline">Reports</Link> }, { label: name }]}><div className="panel p-6" data-report-not-found><h2 className="font-semibold">Not Found</h2><p className="mt-1 text-sm text-muted-foreground"><span>Report</span> <span data-no-i18n>{name}</span> <span>not found</span></p></div></Shell>;
  if (r.state === "denied") return <Shell><div className="panel p-6" data-not-permitted><h2 className="font-semibold">Not Permitted</h2><p className="mt-1 text-sm text-muted-foreground"><span>Insufficient Permission for</span> <span data-no-i18n>{r.refDt}</span></p></div></Shell>;
  return <Shell crumbs={[{ label: r.report.title }]}><NativeReportBody r={r} /></Shell>;
}
