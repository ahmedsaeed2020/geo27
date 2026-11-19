// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/** SC-F-14 Audit & Exceptions — read-only exception checks on native records plus the native Version change history. */
import { Link, useNavigate } from "@tanstack/react-router";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { fmtCurrency } from "@/lib/format";
import { scopedList } from "@/lib/scope";
import { financeContext, slug, sourceStatus, todayIso } from "./finance";
import { ProFrame, SourceState } from "./ProFrame";
import { auditExceptions, RULE_LABELS, RULE_ORDER } from "./audit";

export interface AuditSearch { company?: string | undefined; rule?: string | undefined }
const SOURCES = ["Journal Entry", "Sales Invoice", "Purchase Invoice", "Payment Entry", "Bank Transaction"];
const SEV: Record<string, string> = { high: "bg-destructive/15", medium: "bg-warning/20", low: "bg-accent" };

export function AuditPro({ search }: { search: AuditSearch }) {
  const nav = useNavigate();
  const set = (p: Partial<AuditSearch>) => void nav({ to: "/pro/audit", search: (prev: AuditSearch) => ({ ...prev, ...p }) as never, replace: true });
  return (
    <ProFrame title="Audit & Exceptions" subtitle="Exceptions found in posted and draft accounting records. Nothing is changed automatically — open each record to resolve it.">
      {({ user }) => {
        const ctx = financeContext(search.company, user);
        if (!ctx.companies.length) return <SourceState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} doctype="Company" />;
        const readable = SOURCES.filter((dt) => sourceStatus(dt, user) === "ok");
        const src: Record<string, never[]> = {};
        for (const dt of readable) src[dt] = scopedList(dt, user).filter((d) => !d["company"] || d["company"] === ctx.company) as never[];
        const all = auditExceptions(src, todayIso());
        const shown = all.filter((e) => !search.rule || e.rule === search.rule);
        const versions = sourceStatus("Version", user) === "ok"
          ? scopedList("Version", user).filter((v) => SOURCES.includes(String(v["ref_doctype"]))).sort((a, b) => String(b["creation"] ?? "").localeCompare(String(a["creation"] ?? ""))).slice(0, 15) : null;
        const money = (v: number) => fmtCurrency(v, ctx.currency);
        return <>
          <section className="dp-context" data-dp-context>
            <label className="dp-ctx-item"><span>Company</span>
              <select className="field-input" value={ctx.company} onChange={(e) => set({ company: e.target.value })} data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
          </section>

          <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6" data-dp-audit-total={all.length}>
            {RULE_ORDER.map((r) => { const c = all.filter((e) => e.rule === r).length; const on = search.rule === r;
              return <button key={r} type="button" onClick={() => set({ rule: on ? undefined : r })} aria-pressed={on} className={`dp-card py-2 text-start ${on ? "ring-2 ring-primary" : ""}`} data-dp-audit-rule={r}>
                <div className="text-xs text-muted-foreground">{RULE_LABELS[r]}</div><div className="text-lg font-semibold tabular-nums" data-no-i18n>{c}</div></button>; })}
          </div>
          {readable.length < SOURCES.length && <p className="mt-2 text-xs text-muted-foreground">Some sources are not permitted for this user and were not checked: <span data-no-i18n>{SOURCES.filter((d) => !readable.includes(d)).join(", ")}</span></p>}

          <section className="dp-card mt-4 overflow-x-auto" data-dp-audit-rows={shown.length}>
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">Exceptions</h2>
              {search.rule && <button type="button" className="btn-ghost ms-auto text-xs" onClick={() => set({ rule: undefined })}>Show all</button>}</div>
            {!shown.length ? <p className="mt-2 text-sm text-muted-foreground">No exceptions found.</p>
              : <EntTable id="pro-audit-exceptions" wrap><table className="mt-2 w-full min-w-[680px] text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-2 text-start">Severity</th><th className="p-2 text-start">Check</th><th className="p-2 text-start">Document Type</th><th className="p-2 text-start">Document</th><th className="p-2 text-start">Date</th><th className="p-2 text-start">Details</th><th className="p-2 text-end">Amount</th></tr></thead>
                <tbody>{shown.map((e) => <tr key={e.rule + e.doctype + e.name} className="border-b border-border/60">
                  <td className="p-2"><span className={`chip text-[11px] ${SEV[e.severity]}`}>{e.severity === "high" ? "High" : e.severity === "medium" ? "Medium" : "Low"}</span></td>
                  <td className="p-2">{RULE_LABELS[e.rule]}</td><td className="p-2">{e.doctype}</td>
                  <td className="p-2"><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(e.doctype), name: e.name }} className="hover:underline" data-no-i18n>{e.name}</Link></td>
                  <td className="whitespace-nowrap p-2" data-no-i18n>{e.date}</td>
                  <td className="p-2 text-xs text-muted-foreground">{e.rule === "stale_draft" ? <><span data-no-i18n>{e.detail}</span> <span>days</span></> : e.rule === "unbalanced_je" ? "Debit and credit differ" : e.rule === "cancelled" ? "Cancelled" : <span data-no-i18n>{e.detail}</span>}</td>
                  <td className="whitespace-nowrap p-2 text-end tabular-nums" data-no-i18n>{money(e.amount)}</td>
                </tr>)}</tbody></table></EntTable>}
          </section>

          <section className="dp-card mt-4 overflow-x-auto" data-dp-audit-versions={versions?.length ?? -1}>
            <div className="flex items-center gap-2"><h2 className="font-semibold">Recent Changes</h2>
              <Link to="/app/$app/$doctype" params={{ app: "frappe", doctype: "version" }} className="btn-ghost ms-auto text-xs">Audit Trail</Link></div>
            {versions === null ? <SourceState status="denied" doctype="Version" />
              : !versions.length ? <p className="mt-2 text-sm text-muted-foreground">No recorded changes on accounting documents yet.</p>
              : <EntTable id="pro-audit-changes" wrap><table className="mt-2 w-full min-w-[520px] text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-2 text-start">Date</th><th className="p-2 text-start">Document Type</th><th className="p-2 text-start">Document</th><th className="p-2 text-start">Changed By</th></tr></thead>
                <tbody>{versions.map((v) => <tr key={v.name} className="border-b border-border/60">
                  <td className="whitespace-nowrap p-2" data-no-i18n>{String(v["creation"] ?? "").slice(0, 16).replace("T", " ")}</td>
                  <td className="p-2">{String(v["ref_doctype"])}</td>
                  <td className="p-2"><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(String(v["ref_doctype"])), name: String(v["docname"]) }} className="hover:underline" data-no-i18n>{String(v["docname"])}</Link></td>
                  <td className="p-2" data-no-i18n>{String(v["owner"] ?? "")}</td></tr>)}</tbody></table></EntTable>}
          </section>
        </>;
      }}
    </ProFrame>
  );
}
