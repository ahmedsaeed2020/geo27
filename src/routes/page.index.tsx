import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/Shell";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { DESK_PAGES } from "@/components/pages/registry";

export const Route = createFileRoute("/page/")({
  head: () => ({
    meta: [
      { title: "Desk Pages — Digit Desk" },
      { name: "description", content: "All dedicated DIGIT, DIGIT and HR Desk pages found in the supplied sources." },
      { property: "og:title", content: "Desk Pages — Digit Desk" },
      { property: "og:description", content: "All dedicated DIGIT, DIGIT and HR Desk pages found in the supplied sources." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PagesIndex,
});

function PagesIndex() {
  const groups: Record<string, [string, (typeof DESK_PAGES)[string]][]> = {};
  Object.entries(DESK_PAGES).forEach((e) => (groups[e[1].app] ??= []).push(e));
  return (
    <Shell crumbs={[{ label: "Pages" }]}>
      <ContextStrip icon={<img src="/icons/digit/ui/digit-ui-dashboard-dark.svg" alt="" />} eyebrow="DIGIT" title="Pages" sub="Dedicated pages: tools, boards and consoles that are not a document list."
        facts={[{ id: "pages", label: "Pages", value: Object.keys(DESK_PAGES).length }]}
        actions={<Link to="/page/$name" params={{ name: "permission-manager" }} className="btn-primary" data-band-primary>Role Permissions Manager</Link>} />
      <div className="mb-4" />
      {Object.entries(groups).map(([app, list]) => (
        <section key={app} className="mb-5">
          <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{app === "hrms" ? "DIGIT HR" : app === "erpnext" ? "DIGIT" : "DIGIT Core"}</h2>
          <div className="grid gap-2 md:grid-cols-3">{list.map(([k, p]) => <Link key={k} to="/page/$name" params={{ name: k }} className="panel p-3 hover:shadow-md"><div className="font-medium">{p.title}</div><div className="text-xs text-muted-foreground">{p.module} · <span data-no-i18n dir="ltr">{p.source}</span></div></Link>)}</div>
        </section>
      ))}
    </Shell>
  );
}
