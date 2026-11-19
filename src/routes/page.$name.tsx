import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Shell } from "@/components/Shell";
import { DESK_PAGES } from "@/components/pages/registry";
import { useHydrated } from "@tanstack/react-router";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { DevOnly } from "@/components/DevOnly";
import { t as tr } from "@/i18n";

export const Route = createFileRoute("/page/$name")({
  loader: ({ params }) => { if (!DESK_PAGES[params.name]) throw notFound(); return { title: DESK_PAGES[params.name]!.title }; },
  head: ({ loaderData }) => {
    const t = loaderData ? `${loaderData.title} — Digit Desk` : "Page not found — Digit Desk";
    const d = "Reconstructed DIGIT page with synthetic data.";
    return { meta: [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  notFoundComponent: PageMissing,
  component: DeskPageRoute,
});

function PageMissing() {
  return <Shell><p className="text-sm">This Desk page is not in the supplied sources. <Link to="/page" className="text-primary">All pages</Link></p></Shell>;
}

function DeskPageRoute() {
  const { name } = Route.useParams();
  const p = DESK_PAGES[name]!;
  const hydrated = useHydrated();
  const C = p.component;
  return (
    <Shell crumbs={[{ label: "Pages", to: <Link to="/page">Pages</Link> }, { label: p.title }]}>
      {/* owner FINAL WORK LIST 2026-11-13 (G-01 band, G-08 white cards): every Desk page opens under the shared band and draws inside a white card */}
      <ContextStrip icon={<img src="/icons/digit/feat/digit-feat-integrations-dark.svg" alt="" />} eyebrow={tr(p.module)} title={<span data-page-title>{tr(p.title)}</span>} />
      <DevOnly><p className="mt-1 text-xs text-muted-foreground">{p.module} · source {p.source}</p></DevOnly>
      <div className="ek-card mt-4 p-4" data-desk-page={name}>{hydrated ? <C /> : <p className="text-sm text-muted-foreground">{tr("Loading…")}</p>}</div>
    </Shell>
  );
}
