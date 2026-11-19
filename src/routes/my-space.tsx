import { createFileRoute, Link } from "@tanstack/react-router";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { Shell } from "@/components/Shell";
import { useHydrated } from "@/components/hrms/HrShell";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { translateTo, useLang } from "@/i18n";
import { recordLabel } from "@/components/enterprise/kit/labels";

export const Route = createFileRoute("/my-space")({
  head: () => ({ meta: [
    { title: "My Space — Digit Desk" },
    { name: "description", content: "Your assigned documents, recent changes and notifications in one place." },
    { property: "og:title", content: "My Space — Digit Desk" },
    { property: "og:description", content: "Your assigned documents, recent changes and notifications in one place." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: MySpace,
});

const slug = (dt: string) => dt.toLowerCase().replace(/[^a-z0-9]+/g, "_");

/** My Space (User Settings › Preferences › Show My Space): assigned-to-me and recently edited records from the adapter. */
function MySpace() {
  useStoreVersion();
  const hyd = useHydrated();
  const assigned = hyd ? adapter.doctypes().flatMap((dt) => adapter.list(dt).filter((d) => String(d["_assign"] ?? "").includes("Administrator"))).slice(0, 20) : [];
  // newest changes first, each named by its document type (in the screen language) and its record title, opening the record
  const when = (v: { [k: string]: unknown }) => String(v["creation"] ?? v["modified"] ?? "");
  const recent = hyd ? [...adapter.list("Version")].sort((a, b) => when(b).localeCompare(when(a))).slice(0, 15) : [];
  const lang = useLang(); const ar = lang === "ar";
  return (
    <Shell crumbs={[{ label: "My Space" }]}>
      <ContextStrip icon={<img src="/icons/digit/ui/digit-ui-dashboard-dark.svg" alt="" />} eyebrow="DIGIT" title="My Space"
        sub="Documents assigned to you and your recent changes, in one place." />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="panel p-4"><h2 className="mb-2 font-semibold">Assigned To Me</h2>
          {assigned.map((d) => <div key={d.doctype + d.name} className="text-sm"><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(d.doctype), name: d.name }} className="text-primary hover:underline" data-no-i18n>{d.name}</Link> <span className="text-muted-foreground" data-no-i18n>{translateTo(d.doctype, lang)}</span></div>)}
          {!assigned.length && <p className="text-sm text-muted-foreground">No records found</p>}
        </section>
        <section className="panel p-4"><h2 className="mb-2 font-semibold">{ar ? "النشاط الأخير" : "Recent Activity"}</h2>
          {recent.map((v) => { const dt = String(v["ref_doctype"] ?? ""), dn = String(v["docname"] ?? ""); return <div key={v.name} className="text-sm" data-my-recent={dt}>
            <span className="text-muted-foreground" data-no-i18n>{translateTo(dt, lang)}</span> · <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(dt), name: dn }} className="text-primary hover:underline" data-no-i18n>{recordLabel(dn)}</Link>
            {when(v) && <span className="ms-2 text-xs text-muted-foreground" data-no-i18n><bdi dir="ltr">{when(v).slice(0, 16).replace("T", " ")}</bdi></span>}</div>; })}
          {!recent.length && <p className="text-sm text-muted-foreground">No records found</p>}
        </section>
      </div>
    </Shell>
  );
}
