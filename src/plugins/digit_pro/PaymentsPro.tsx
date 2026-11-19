// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/** SC-F-06 Payments — Core Payment Entry records with allocation detail; every link opens the native screen. Read-only. */
import { Link, useNavigate } from "@tanstack/react-router";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { useCallback } from "react";
import { fmtCurrency } from "@/lib/format";
import { useLang } from "@/i18n";
import { can, financeContext, slug, sourceStatus } from "./finance";
import { PAYMENT_STATES, PAYMENT_TYPES, payments } from "./payments";
import { ProFrame, SourceState } from "./ProFrame";
import { SortTh, ViewToolbar, useRegister } from "./ViewToolbar";
import { PAYMENTS_SPEC, sortRows } from "./viewSpecs";
import type { Search, ViewSearchKeys } from "./savedViews";

/** Standard ERPNext Mode of Payment names shown in Arabic; other (site-defined) names are record content and stay as stored. */
const MODE_AR: Record<string, string> = { "Bank Transfer": "تحويل بنكي", "Wire Transfer": "حوالة بنكية", "Bank Draft": "شيك مصرفي", "Cash": "نقدًا", "Cheque": "شيك", "Credit Card": "بطاقة ائتمان" };
export interface PaymentsSearch extends ViewSearchKeys { company?: string | undefined; type?: string | undefined; state?: string | undefined; q?: string | undefined; sel?: string | undefined }
const PAY_NUM = new Set(["amount", "unallocated"]);

export function PaymentsPro({ search }: { search: PaymentsSearch }) {
  const nav = useNavigate();
  const set = (p: Partial<PaymentsSearch>) => void nav({ to: "/pro/payments", search: (prev: PaymentsSearch) => ({ ...prev, ...p }) as never, replace: true });
  const apply = useCallback((next: Search) => void nav({ to: "/pro/payments", search: ((prev: PaymentsSearch) => ({ ...prev, ...next, sel: undefined })) as never, replace: true }), [nav]);
  const reg = useRegister(PAYMENTS_SPEC, search as Search);
  const ar = useLang() === "ar";
  return (
    <ProFrame title="Payments" subtitle="Received and paid amounts with invoice allocation — from Core payment entries.">
      {({ user }) => {
        const ctx = financeContext(search.company, user);
        if (!ctx.companies.length) return <SourceState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} doctype="Company" />;
        const p = payments(ctx.company, { type: search.type, state: search.state, q: search.q }, user);
        const rows = sortRows(p.rows, reg.sort, (r, k) => (k === "amount" ? r.amount : k === "unallocated" ? r.unallocated : String((r as unknown as Record<string, unknown>)[k] ?? "")));
        const sel = rows.find((r) => r.name === search.sel) ?? rows[0];
        const label = (k: string) => { const c = PAYMENTS_SPEC.columns.find((x) => x.key === k)!; return ar ? c.ar : c.label; };
        const plain = (r: (typeof rows)[number], k: string): string | number => (k === "status" ? r.state : k === "amount" ? r.amount : k === "unallocated" ? r.unallocated : String((r as unknown as Record<string, unknown>)[k] ?? ""));
        const exporter = { doctype: "Payment Entry", filename: `payments_${ctx.company}`, build: () => ({ columns: reg.cols.map((k) => ({ fieldname: k, label: label(k) })), rows: rows.map((r) => Object.fromEntries(reg.cols.map((k) => [k, plain(r, k)]))) }) };
        const money = (v: number) => fmtCurrency(v, ctx.currency);
        const num = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const chip = (on: boolean, label: string, onClick: () => void, key: string) => <button key={key} type="button" aria-pressed={on} className={`dp-chip ${on ? "dp-chip-on" : ""}`} onClick={onClick}>{label}</button>;
        return <>
          <section className="dp-context" data-dp-context>
            <label className="dp-ctx-item"><span>Company</span>
              <select className="field-input" value={ctx.company} onChange={(e) => set({ company: e.target.value, sel: undefined })} data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
            <div className="dp-ctx-item"><span>Currency</span><b data-no-i18n>{ctx.currency || "—"}</b></div>
            <div className="ms-auto flex gap-2">
              {can("Payment Entry", "create") && <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "payment_entry" }} className="btn-primary" data-dp-new-payment>Record payment</Link>}
              <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "payment_entry" }} className="btn-ghost">Standard list</Link>
            </div>
          </section>

          {p.status !== "ok" ? <div className="mt-4"><SourceState status={p.status} doctype="Payment Entry" /></div> : <>
            <section className="mt-4 grid gap-3 grid-cols-2 md:grid-cols-4" data-dp-pay-kpis>
              {([["Received", p.received], ["Paid", p.paid], ["Unallocated", p.unallocated]] as const).map(([l, v]) => <div key={l} className="ek-kpi-tile" data-tone={l === "Unallocated" && v > 0 ? "warn" : undefined}><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 whitespace-nowrap text-lg font-semibold tabular-nums" data-no-i18n>{money(v)}</p></div>)}
              <div className="ek-kpi-tile" data-tone={p.drafts ? "info" : undefined}><p className="text-xs text-muted-foreground">Draft payment entries</p><p className="mt-1 text-lg font-semibold tabular-nums" data-no-i18n>{p.drafts}</p></div>
            </section>

            <section className="mt-4 flex flex-wrap items-center gap-2" data-dp-pay-filters>
              {chip(!search.type, "All", () => set({ type: undefined, sel: undefined }), "t-all")}
              {PAYMENT_TYPES.map((t) => chip(search.type === t, t, () => set({ type: t, sel: undefined }), t))}
              <span className="mx-1 h-5 w-px bg-border" />
              {chip(!search.state, "All", () => set({ state: undefined, sel: undefined }), "s-all")}
              {PAYMENT_STATES.map((s) => chip(search.state === s, s, () => set({ state: s, sel: undefined }), s))}
              <input className="field-input ms-auto w-56 max-w-full" placeholder="Search" value={search.q ?? ""} onChange={(e) => set({ q: e.target.value || undefined, sel: undefined })} aria-label="Search" />
            </section>
            <ViewToolbar spec={PAYMENTS_SPEC} search={search as Search} companies={ctx.companies} onApply={apply} exporter={exporter} />

            <div className="mt-4 grid gap-4">
              <section className="dp-card p-0 overflow-x-auto" data-dp-payments>
                {!rows.length ? <div className="p-6"><SourceState status="empty" /></div> :
                  <EntTable id="pro-payments" wrap views={false}><table className="w-full whitespace-nowrap text-sm">
                    <thead><tr className="border-b border-border text-xs text-muted-foreground">{reg.cols.map((k) => { const c = PAYMENTS_SPEC.columns.find((x) => x.key === k)!; return <SortTh key={k} k={k} label={label(k)} sort={reg.sort} sortable={PAYMENTS_SPEC.sorts.includes(k)} align={c.align} onSort={(v) => apply({ ...(search as Search), sort: v })} />; })}</tr></thead>
                    <tbody>{rows.map((r) => <tr key={r.name} tabIndex={0} aria-selected={sel?.name === r.name} className={`dp-row cursor-pointer border-b border-border ${sel?.name === r.name ? "dp-row-on" : ""}`} onClick={() => set({ sel: r.name })} onKeyDown={(e) => { if (e.key === "Enter") set({ sel: r.name }); }} data-dp-payment={r.name}>
                      {reg.cols.map((k) => { switch (k) {
                        case "name": return <td key={k} className={`${reg.cell} font-medium`} data-no-i18n>{r.name}</td>;
                        case "date": return <td key={k} className={`${reg.cell} tabular-nums`} data-no-i18n>{r.date}</td>;
                        case "type": return <td key={k} className={reg.cell}>{r.type}</td>;
                        case "party": return <td key={k} className={reg.cell} data-no-i18n>{r.party || "—"}</td>;
                        case "mode": return <td key={k} className={reg.cell} data-no-i18n>{(ar && MODE_AR[r.mode]) || r.mode || "—"}</td>;
                        case "status": return <td key={k} className={reg.cell}><span className={`chip ${r.state === "Submitted" ? "bg-muted" : r.state === "Cancelled" ? "text-destructive" : ""}`}>{r.state}</span></td>;
                        default: return PAY_NUM.has(k) ? <td key={k} className={`${reg.cell} text-end tabular-nums`} data-no-i18n>{k === "amount" ? num(r.amount) : r.unallocated ? num(r.unallocated) : "—"}</td> : <td key={k} />;
                      } })}</tr>)}</tbody>
                  </table></EntTable>}
              </section>
              {sel && <aside className="dp-card" data-dp-payment-detail={sel.name}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold" data-no-i18n>{sel.name}</h2><span className="chip bg-muted">{sel.state}</span>
                  <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "payment_entry", name: sel.name }} className="btn-ghost ms-auto">Open</Link>
                  {sel.state === "Submitted" && can("GL Entry", "read") && <Link to="/pro/general-ledger" search={{ voucher_no: sel.name, from: "payments" } as never} className="btn-ghost">General Ledger</Link>}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-4">
                  <div><dt className="text-xs text-muted-foreground">Account Paid From</dt><dd data-no-i18n>{sel.from || "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Account Paid To</dt><dd data-no-i18n>{sel.to || "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Reference</dt><dd data-no-i18n>{sel.reference || "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Amount</dt><dd className="tabular-nums" data-no-i18n>{money(sel.amount)}</dd></div>
                </dl>
                <h3 className="mt-4 text-sm font-semibold">Allocated to</h3>
                {!sel.refs.length ? <div className="mt-2"><SourceState status="empty" /></div> :
                  <ul className="mt-2 divide-y divide-border">{sel.refs.map((r, i) => <li key={i} className="flex items-center gap-2 py-2">
                    {r.doctype ? <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(r.doctype), name: r.name }} className="min-w-0 flex-1 truncate font-medium hover:underline" data-no-i18n>{r.name}</Link> : <span className="flex-1" data-no-i18n>{r.name}</span>}
                    <span className="text-xs text-muted-foreground">{r.doctype}</span>
                    <span className="w-28 text-end tabular-nums" data-no-i18n>{money(r.allocated)}</span></li>)}</ul>}
              </aside>}
            </div>
          </>}
        </>;
      }}
    </ProFrame>
  );
}
