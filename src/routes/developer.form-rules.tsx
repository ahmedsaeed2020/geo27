import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Shell, Loading } from "@/components/Shell";
import { indexQuery, loadMeta } from "@/lib/catalog";
import { formRulesQuery } from "@/lib/formRules";
import { checkDocType, setCheckRouter, type CheckResult } from "@/lib/formRulesCheck";

export const Route = createFileRoute("/developer/form-rules")({
  head: () => ({ meta: [
    { title: "Form Rules Checks — Developer Mode" },
    { name: "description", content: "Runs one behavior check per ported form rule and shows pass/fail per DocType." },
    { property: "og:title", content: "Form Rules Checks — Developer Mode" },
    { property: "og:description", content: "Behavior checks for every ported form rule." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: RulesPage,
});

declare global { interface Window { __rulesRun?: (from: number, to: number) => Promise<CheckResult[]>; __rulesDoctypes?: string[] } }

function RulesPage() {
  const qc = useQueryClient();
  setCheckRouter(useRouter());
  const idx = useQuery(indexQuery); const rules = useQuery(formRulesQuery);
  const [res, setRes] = useState<CheckResult[]>([]);
  const [busy, setBusy] = useState(false);
  if (!idx.data || !rules.data) return <Shell><Loading what="form rules" /></Shell>;
  const dts = Object.keys(rules.data).sort();
  const run = async (from: number, to: number) => {
    const out: CheckResult[] = [];
    for (const dt of dts.slice(from, to)) {
      const m = await loadMeta(idx.data!, dt);
      if (m) out.push(...(await checkDocType(qc, idx.data!, m, rules.data![dt]!)));
    }
    return out;
  };
  if (typeof window !== "undefined") { window.__rulesRun = run; window.__rulesDoctypes = dts; }
  const count = (s: string) => res.filter((r) => r.status === s).length;
  return (
    <Shell crumbs={[{ label: "Developer Mode" }, { label: "Form Rules" }]}>
      <h1 className="text-xl font-semibold text-dev">Form rules checks</h1>
      <p className="text-sm text-muted-foreground"><span data-no-i18n>{Object.values(rules.data).reduce((s, r) => s + r.length, 0)}</span> <span>rules over</span> <span data-no-i18n>{dts.length}</span> <span>DocTypes</span></p>
      <button className="btn-primary mt-3" disabled={busy} onClick={async () => { setBusy(true); setRes(await run(0, dts.length)); setBusy(false); }}>Run all checks</button>
      {res.length > 0 && <p className="mt-3 text-sm" data-no-i18n>pass {count("pass")} · fail {count("fail")} · no_witness {count("no_witness")} · unsupported {count("unsupported")} · server {count("server")} · n/a {count("na")}</p>}
      <table className="mt-3 w-full text-xs"><tbody>
        {res.filter((r) => r.status !== "pass").slice(0, 300).map((r) => <tr key={r.id} className="border-b border-border"><td data-no-i18n>{r.id}</td><td data-no-i18n>{r.kind}</td><td data-no-i18n>{r.status}</td><td data-no-i18n>{r.note}</td></tr>)}
      </tbody></table>
    </Shell>
  );
}
