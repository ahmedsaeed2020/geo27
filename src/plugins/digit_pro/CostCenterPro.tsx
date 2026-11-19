// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/** SC-F-09 Cost Center & Dimensions — native Cost Center tree with posted GL activity, configured Accounting Dimensions and native report/setup links. */
import { Link, useNavigate } from "@tanstack/react-router";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { fmtCurrency } from "@/lib/format";
import { scopedList } from "@/lib/scope";
import { costCenterTree, dimensions } from "./costCenters";
import { profitabilityAttribution } from "./profitabilityAttribution";
import { useLang } from "@/i18n";
import { can, financeContext, slug, sourceStatus } from "./finance";
import { ProFrame, SourceState } from "./ProFrame";

export interface CcSearch { company?: string | undefined; sel?: string | undefined }
const REPORTS = ["Budget Variance Report", "Profitability Analysis", "General Ledger", "Trial Balance"];

export function CostCenterPro({ search }: { search: CcSearch }) {
  const nav = useNavigate();
  const ar = useLang() === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const set = (p: Partial<CcSearch>) => void nav({ to: "/pro/cost-centers", search: (prev: CcSearch) => ({ ...prev, ...p }) as never, replace: true });
  return (
    <ProFrame title="Cost Center & Dimensions" subtitle="Native cost center hierarchy with posted ledger activity, and configured accounting dimensions.">
      {({ user }) => {
        const ctx = financeContext(search.company, user);
        if (!ctx.companies.length) return <SourceState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} doctype="Company" />;
        const st = sourceStatus("Cost Center", user);
        if (st !== "ok") return <SourceState status={st} doctype="Cost Center" />;
        const glOk = sourceStatus("GL Entry", user) === "ok";
        const { flat } = costCenterTree(scopedList("Cost Center", user), glOk ? scopedList("GL Entry", user) : null, ctx.company);
        const sel = flat.find((c) => c.name === search.sel) ?? flat[0];
        const dimOk = sourceStatus("Accounting Dimension", user);
        const dims = dimOk === "ok" ? dimensions(scopedList("Accounting Dimension", user), ctx.company) : [];
        const money = (v: number) => fmtCurrency(v, ctx.currency);
        const glList = (cc: string) => ({ filters: JSON.stringify([["cost_center", "=", cc], ["is_cancelled", "=", 0]]) });
        return <>
          <section className="dp-context" data-dp-context>
            <label className="dp-ctx-item"><span>Company</span>
              <select className="field-input" value={ctx.company} onChange={(e) => set({ company: e.target.value, sel: undefined })} data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
            <div className="dp-ctx-item"><span>Currency</span><b data-no-i18n>{ctx.currency || "—"}</b></div>
            <div className="ms-auto flex flex-wrap gap-2">
              <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "cost_center" }} className="btn-ghost">Standard tree</Link>
              {can("Cost Center", "create") && <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "cost_center_allocation" }} className="btn-ghost">Cost Center Allocation</Link>}
            </div>
          </section>

          <div className="mt-4 grid gap-4">
            <section className="dp-card overflow-x-auto p-0" data-dp-cc-tree={flat.length}>
              {!flat.length ? <div className="p-6"><SourceState status="empty" doctype="Cost Center" /></div> :
                <EntTable id="pro-cost-centers" wrap><table className="w-full whitespace-nowrap text-sm">
                  <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="px-3 py-2 text-start">Cost Center</th><th className="px-2 text-end">Debit</th><th className="px-2 text-end">Credit</th><th className="px-2 text-end">Net</th><th className="px-3 text-end">GL entries</th></tr></thead>
                  <tbody>{flat.map((c) => <tr key={c.name} tabIndex={0} aria-selected={sel?.name === c.name} className={`dp-row cursor-pointer border-b border-border ${sel?.name === c.name ? "dp-row-on" : ""}`} onClick={() => set({ sel: c.name })} onKeyDown={(e) => { if (e.key === "Enter") set({ sel: c.name }); }} data-dp-cc={c.name}>
                    <td className="px-3 py-2" style={{ paddingInlineStart: `${0.75 + c.depth * 1.25}rem` }}><span className={c.isGroup ? "font-semibold" : ""} data-no-i18n>{c.name}</span>{c.disabled && <span className="chip ms-2 bg-muted text-[11px]">Disabled</span>}</td>
                    {glOk ? <><td className="px-2 text-end tabular-nums" data-no-i18n>{money(c.debit)}</td><td className="px-2 text-end tabular-nums" data-no-i18n>{money(c.credit)}</td><td className="px-2 text-end font-medium tabular-nums" data-no-i18n>{money(c.debit - c.credit)}</td><td className="px-3 text-end tabular-nums" data-no-i18n>{c.entries}</td></>
                      : <td colSpan={4} className="px-3 text-end text-xs text-muted-foreground">Not Permitted</td>}
                  </tr>)}</tbody>
                </table></EntTable>}
            </section>

            {sel && <section className="dp-card" data-dp-cc-detail={sel.name}>
              <div className="flex flex-wrap items-center gap-2">
                <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "cost_center", name: sel.name }} className="font-semibold hover:underline" data-no-i18n>{sel.name}</Link>
                <span className="chip bg-muted">{sel.isGroup ? "Group" : "Ledger"}</span>
                {glOk && sel.entries > 0 && <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "gl_entry" }} search={glList(sel.name) as never} className="btn-ghost ms-auto py-0.5 text-xs" data-dp-cc-gl>GL entries</Link>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="text-muted-foreground">Reports</span>
                {REPORTS.map((r) => <Link key={r} to="/report/$name" params={{ name: r }} className="chip bg-accent hover:underline">{r}</Link>)}</div>
            </section>}

            <section className="dp-card overflow-x-auto" data-dp-profitability>
              <h2 className="font-semibold">{t("Profitability by cost center", "الربحية حسب مركز التكلفة")}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t("Posted income and expense attributed by the cost center on each ledger row. Rows without a cost center are never allocated.", "الإيرادات والمصروفات المرحّلة منسوبة حسب مركز التكلفة في كل قيد. القيود بدون مركز تكلفة لا تُوزَّع أبدًا.")}</p>
              {(() => {
                const pa = profitabilityAttribution(ctx.company, "", "", user);
                if (pa.status !== "ok") return <div className="mt-2"><SourceState status={pa.status} doctype="GL Entry" /></div>;
                if (!pa.rows.length && !pa.unattributed.entries) return <div className="mt-2"><SourceState status="empty" /></div>;
                return <>
                  <EntTable id="pro-cost-center-lines" wrap><table className="mt-2 w-full whitespace-nowrap text-sm">
                    <thead><tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="px-2 py-2 text-start">{t("Cost Center", "مركز التكلفة")}</th>
                      <th className="px-2 text-end">{t("Income", "الإيرادات")}</th>
                      <th className="px-2 text-end">{t("Expense", "المصروفات")}</th>
                      <th className="px-2 text-end">{t("Net", "الصافي")}</th>
                      <th className="px-2 text-end">{t("GL entries", "قيود الأستاذ")}</th>
                    </tr></thead>
                    <tbody>
                      {pa.rows.map((r) => <tr key={r.costCenter} className="border-b border-border" data-dp-pa={r.costCenter}>
                        <td className="px-2 py-2">
                          <Link to="/pro/general-ledger" search={{ company: ctx.company, cost_center: r.costCenter, from_date: "", to_date: "" } as never} className="text-primary hover:underline" data-no-i18n>{r.costCenter}</Link>
                        </td>
                        <td className="px-2 text-end tabular-nums" data-no-i18n>{money(r.income)}</td>
                        <td className="px-2 text-end tabular-nums" data-no-i18n>{money(r.expense)}</td>
                        <td className={`px-2 text-end font-medium tabular-nums ${r.net < 0 ? "text-destructive" : ""}`} data-no-i18n>{money(r.net)}</td>
                        <td className="px-2 text-end tabular-nums" data-no-i18n>{r.entries}</td>
                      </tr>)}
                      {pa.unattributed.entries > 0 && <tr className="border-b border-border text-muted-foreground" data-dp-pa-unattributed>
                        <td className="px-2 py-2">{t("Unattributed (no cost center)", "غير منسوب (بدون مركز تكلفة)")}</td>
                        <td className="px-2 text-end tabular-nums" data-no-i18n>{money(pa.unattributed.income)}</td>
                        <td className="px-2 text-end tabular-nums" data-no-i18n>{money(pa.unattributed.expense)}</td>
                        <td className="px-2 text-end tabular-nums" data-no-i18n>{money(pa.unattributed.net)}</td>
                        <td className="px-2 text-end tabular-nums" data-no-i18n>{pa.unattributed.entries}</td>
                      </tr>}
                    </tbody>
                  </table></EntTable>
                </>;
              })()}
            </section>

            <section className="dp-card" data-dp-dims={dims.length}>
              <div className="flex items-center gap-2"><h2 className="font-semibold">Accounting Dimensions</h2>
                <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "accounting_dimension" }} className="btn-ghost ms-auto py-0.5 text-xs">Standard list</Link></div>
              {dimOk !== "ok" ? <div className="mt-2"><SourceState status={dimOk} doctype="Accounting Dimension" /></div>
                : !dims.length ? <p className="mt-2 text-sm text-muted-foreground"><span>No accounting dimensions configured. Cost Center and Project are always available.</span></p>
                : <ul className="mt-2 divide-y divide-border">{dims.map((d) => <li key={d.name} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "accounting_dimension", name: d.name }} className="font-medium hover:underline" data-no-i18n>{d.label}</Link>
                  {d.documentType && <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: slug(d.documentType) }} className="text-xs text-muted-foreground hover:underline" data-no-i18n>{d.documentType}</Link>}
                  {d.mandatoryFor.map((m) => <span key={m} className="chip bg-warning/20 text-[11px]">{m}</span>)}
                  <span className={`chip ms-auto text-[11px] ${d.disabled ? "bg-muted" : "bg-success/15 text-success-text"}`}>{d.disabled ? "Disabled" : "Enabled"}</span>
                </li>)}</ul>}
            </section>
          </div>
        </>;
      }}
    </ProFrame>
  );
}
