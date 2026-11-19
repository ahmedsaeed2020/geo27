import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Shell, Loading } from "@/components/Shell";
import { indexQuery, loadMeta } from "@/lib/catalog";
import { formRulesQuery } from "@/lib/formRules";
import { formActionsQuery } from "@/lib/engines";
import { crmDefaultsQuery } from "@/lib/crm";
import { runScenarios, type Scenario } from "@/lib/scenarios";

export const Route = createFileRoute("/developer/scenarios")({
  head: () => ({ meta: [
    { title: "Business Scenarios — Developer Mode" },
    { name: "description", content: "End-to-end business scenarios run through the form, mapping and posting engines." },
    { property: "og:title", content: "Business Scenarios — Developer Mode" },
    { property: "og:description", content: "Automated end-to-end scenario checks over demo data." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ScenariosPage,
});

declare global { interface Window { __scenarios?: () => Promise<Scenario[]> } }

function ScenariosPage() {
  const idx = useQuery(indexQuery); const rules = useQuery(formRulesQuery); const acts = useQuery(formActionsQuery); const crm = useQuery(crmDefaultsQuery);
  const [res, setRes] = useState<Scenario[]>([]); const [busy, setBusy] = useState(false);
  if (!idx.data || !rules.data || !acts.data || !crm.data) return <Shell><Loading what="scenarios" /></Shell>;
  const go = async () => { setBusy(true); const r = await runScenarios({ meta: (dt) => loadMeta(idx.data!, dt), rules: rules.data!, actions: acts.data!, crm: crm.data! }); setRes(r); setBusy(false); return r; };
  if (typeof window !== "undefined") window.__scenarios = go;
  return (
    <Shell crumbs={[{ label: "Developer Mode" }, { label: "Scenarios" }]}>
      <h1 className="text-xl font-semibold text-dev">Business scenarios</h1>
      <p className="text-sm text-muted-foreground">Each scenario creates records in the local demo store and asserts every step.</p>
      <button className="btn-primary mt-3" disabled={busy} onClick={go} data-run-scenarios>Run scenarios</button>
      <div className="mt-4 space-y-4" data-scenarios={res.length}>
        {res.map((s) => (
          <section key={s.name} className="panel p-3" data-scenario={s.ok ? "pass" : "fail"}>
            <h2 className="font-semibold"><span className={`chip ${s.ok ? "bg-success/20" : "bg-destructive/20"}`}>{s.ok ? "Pass" : "Fail"}</span> <span>{s.name}</span></h2>
            <ul className="mt-2 space-y-1 text-sm">{s.steps.map((x, i) => <li key={i}><span>{x.ok ? "✓" : "✗"}</span> <span>{x.label}</span> <span className="text-xs text-muted-foreground" data-no-i18n>{x.detail}</span></li>)}</ul>
            <p className="mt-1 text-xs text-muted-foreground" data-no-i18n>{s.docs.join(" · ")}</p>
          </section>
        ))}
      </div>
    </Shell>
  );
}
