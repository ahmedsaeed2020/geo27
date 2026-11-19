import { createFileRoute, Link } from "@tanstack/react-router";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { useQuery } from "@tanstack/react-query";
import { Shell, Loading } from "@/components/Shell";
import { APPS, indexQuery, type AppId } from "@/lib/catalog";
import { adapter } from "@/lib/adapter";
import { LangToggle } from "@/i18n/LangToggle";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [
    { title: "Settings — Digit Desk" },
    { name: "description", content: "All Single DocTypes (settings forms) across Framework, DIGIT, HR and CRM." },
    { property: "og:title", content: "Settings — Digit Desk" },
    { property: "og:description", content: "All Single DocTypes (settings forms) across Framework, DIGIT, HR and CRM." },
  ] }),
  component: Settings,
});

function Settings() {
  const { data } = useQuery(indexQuery);
  if (!data) return <Shell><Loading /></Shell>;
  const singles = data.filter((d) => d.issingle);
  const apps = [...new Set(singles.map((s) => s.app))];
  return (
    <Shell crumbs={[{ label: "Settings" }]}>
      <ContextStrip icon={<img src="/icons/digit/ui/digit-ui-settings-dark.svg" alt="" />} eyebrow="DIGIT" title="Settings"
        sub="Language, integrations and every settings page of the system, in one place."
        facts={[{ id: "singles", label: "Settings pages", value: singles.length }]}
        actions={<button type="button" className="ek-context-btn" onClick={() => { if (confirm("Reset ALL synthetic sample data? This cannot be undone.")) { adapter.resetAll(); location.reload(); } }}>Reset sample data…</button>} />
      <section className="panel mt-4 flex items-center gap-3 p-3" id="language">
        <h2 className="text-sm font-semibold">Language</h2>
        <LangToggle />
        <span className="text-xs text-muted-foreground">Display only — names, fields and stored data stay unchanged.</span>
      </section>
      {apps.map((a) => (
        <section key={a} className="mt-5">
          <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{APPS[a as AppId]?.label ?? a}</h2>
          <div className="grid gap-1 md:grid-cols-3 xl:grid-cols-4">
            {singles.filter((s) => s.app === a).sort((x, y) => x.name.localeCompare(y.name)).map((s) => (
              <Link key={s.name} to="/app/$app/$doctype/$name" params={{ app: s.app, doctype: s.slug, name: s.name }} className="panel px-3 py-2 text-sm hover:bg-muted">{s.name}<div className="text-[10px] text-muted-foreground">{s.module}</div></Link>
            ))}
          </div>
        </section>
      ))}
    </Shell>
  );
}
