import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/Shell";
import { enabledPlugins, usePluginsVersion } from "@/plugins/runtime";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { renderJinja } from "@/plugins/jinja";
import { useHydrated } from "@/components/hrms/HrShell";
import { useLang } from "@/i18n";

export const Route = createFileRoute("/plugins/$name/print/$format/$doc")({
  head: ({ params }) => ({ meta: [
    { title: `${params.doc} — ${params.format}` },
    { name: "description", content: `Print preview of ${params.doc} in the ${params.format} format.` },
    { property: "og:title", content: `${params.doc} — ${params.format}` },
    { property: "og:description", content: "Plugin print format preview." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PluginPrint,
});

function PluginPrint() {
  const { name, format, doc } = Route.useParams();
  usePluginsVersion(); useStoreVersion(); const lang = useLang();
  const hydrated = useHydrated();
  const p = enabledPlugins().find((x) => x.name === name); const pf = p?.print_formats?.find((x) => x.name === format);
  if (!hydrated) return <Shell><p className="text-muted-foreground">Loading…</p></Shell>;
  const d = pf ? adapter.get(pf.doc_type, doc) : undefined;
  if (!p || !pf || !d) return <Shell><p className="text-muted-foreground">Print format or document not found.</p></Shell>;
  const html = renderJinja(pf.html, { doc: d });
  return (
    <Shell crumbs={[{ label: "", to: <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: pf.doc_type.toLowerCase().replace(/[^a-z0-9]+/g, "_"), name: doc }} className="hover:underline">{doc}</Link> }, { label: pf.name }]}>
      <div className="mb-3 flex gap-2 print:hidden"><button type="button" className="btn-primary" onClick={() => window.print()}>Print</button></div>
      <style>{pf.css ?? ""}</style>
      <article dir={lang === "ar" ? "rtl" : "ltr"} className="mx-auto max-w-[210mm] bg-card p-8 shadow print:shadow-none" data-print-preview data-no-i18n dangerouslySetInnerHTML={{ __html: html }} />
    </Shell>
  );
}
