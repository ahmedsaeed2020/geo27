import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { indexQuery } from "@/lib/catalog";

type Step = { title?: string; action?: string; action_label?: string; reference_document?: string; reference_report?: string; path?: string; description?: string };
type OnbCatalog = { onboardings: Record<string, { title?: string; subtitle?: string; steps: string[]; source: string }>; steps: Record<string, Step> };
const onboardingQuery = { queryKey: ["catalog", "onboarding"], queryFn: () => fetch("/catalog/onboarding.json").then((r) => r.json() as Promise<OnbCatalog>), staleTime: Infinity };
const KEY = "digit-virtual-core:onboarding-done";

/** Module Onboarding block from Module Onboarding + Onboarding Step JSON. Completion is server-tracked in Frappe; here it is a local preview flag. */
export function OnboardingBlock({ name }: { name: string }) {
  const { data } = useQuery(onboardingQuery);
  const idx = useQuery(indexQuery);
  const [done, setDone] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } });
  const o = data?.onboardings[name];
  if (!data) return <div className="panel p-4 text-xs text-muted-foreground">Loading…</div>;
  if (!o) return <div className="rounded border border-dashed border-border p-3 text-xs text-muted-foreground">Onboarding "{name}" not in sources.</div>;
  const toggle = (s: string) => { const n = done.includes(s) ? done.filter((x) => x !== s) : [...done, s]; setDone(n); localStorage.setItem(KEY, JSON.stringify(n)); };
  return (
    <div className="panel p-4" data-onboarding={name}>
      <div className="flex items-baseline gap-2">
        <h3 className="font-semibold">{o.title ?? name}</h3>
        <span className="text-xs text-muted-foreground">{done.filter((d) => o.steps.includes(d)).length}/{o.steps.length}</span>
        <span className="ms-auto text-[10px] text-muted-foreground" title="DIGIT stores step completion on the server">server-tracked</span>
      </div>
      {o.subtitle && <p className="text-xs text-muted-foreground">{o.subtitle}</p>}
      <ol className="mt-3 grid gap-1 md:grid-cols-3">
        {o.steps.map((s) => {
          const st = data.steps[s] ?? {};
          const e = st.reference_document ? idx.data?.find((d) => d.name === st.reference_document) : undefined;
          const isDone = done.includes(s);
          return (
            <li key={s} className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-sm">
              <span className={isDone ? "text-primary" : "text-muted-foreground"}>{isDone ? "✓" : "○"}</span>
              {e ? <Link to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} className="text-primary hover:underline">{st.title ?? s}</Link> : <span>{st.title ?? s}</span>}
              <button type="button" onClick={() => toggle(s)} className="ms-auto text-[10px] text-muted-foreground hover:underline">{isDone ? "Done (preview)" : "Mark done (preview)"}</button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
