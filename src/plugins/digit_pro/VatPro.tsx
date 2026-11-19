// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/** SC-F-13 VAT Reports — posted tax traced from Tax accounts to native vouchers; source VAT reports linked as server-dependent. No filing, no ZATCA. */
import { Link, useNavigate } from "@tanstack/react-router";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { V4InsightBoard } from "./V4InsightBoard";
import { useLang } from "@/i18n";
import { adapter } from "@/lib/adapter";
import { fmtCurrency } from "@/lib/format";
import { scopedList } from "@/lib/scope";
import { financeContext, slug, sourceStatus } from "./finance";
import { ProFrame, SourceState } from "./ProFrame";
import { vatTrace } from "./vat";
import { DateInput } from "@/components/form/DateInput";

export interface VatSearch { company?: string | undefined; from_date?: string | undefined; to_date?: string | undefined; side?: string | undefined }
const SOURCE_REPORTS = ["VAT Audit Report", "UAE VAT 201"];
const SETUP = ["Sales Taxes and Charges Template", "Purchase Taxes and Charges Template", "Item Tax Template", "Tax Category", "Tax Rule"];

export function VatPro({ search }: { search: VatSearch }) {
  const nav = useNavigate(); const ar = useLang() === "ar";
  const set = (p: Partial<VatSearch>) => void nav({ to: "/pro/vat", search: (prev: VatSearch) => ({ ...prev, ...p }) as never, replace: true });
  return (
    <ProFrame title="VAT Reports" subtitle="Posted output and input tax traced to native invoices and tax rows. This is not a VAT return filing.">
      {({ user }) => {
        const ctx = financeContext(search.company, user);
        if (!ctx.companies.length) return <SourceState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} doctype="Company" />;
        const st = sourceStatus("GL Entry", user);
        if (st !== "ok") return <SourceState status={st} doctype="GL Entry" />;
        const y = new Date().getFullYear();
        const from = search.from_date ?? `${y}-01-01`, to = search.to_date ?? `${y}-12-31`;
        const tax = new Set(scopedList("Account", user).filter((a) => a["account_type"] === "Tax" && (!a["company"] || a["company"] === ctx.company)).map((a) => a.name));
        const r = vatTrace(scopedList("GL Entry", user), tax, ctx.company, from, to);
        const vs = r.vouchers.filter((v) => !search.side || v.side === search.side);
        const money = (v: number) => fmtCurrency(v, ctx.currency);
        return <>
          <section className="dp-context" data-dp-context>
            <label className="dp-ctx-item"><span>Company</span>
              <select className="field-input" value={ctx.company} onChange={(e) => set({ company: e.target.value })} data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="dp-ctx-item"><span>From Date</span><DateInput className="field-input" value={from} onChange={(e) => set({ from_date: e.target.value || undefined })} /></label>
            <label className="dp-ctx-item"><span>To Date</span><DateInput className="field-input" value={to} onChange={(e) => set({ to_date: e.target.value || undefined })} /></label>
          </section>
          <div className="mt-3" data-no-i18n><V4InsightBoard board="vat" company={ctx.company} currency={ctx.currency} user={user} ar={ar} /></div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3" data-dp-vat-net={r.net}>
            <div className="ek-kpi-tile py-2"><div className="text-xs text-muted-foreground">Output Tax</div><div className="text-lg font-semibold tabular-nums" data-no-i18n>{money(r.output)}</div></div>
            <div className="ek-kpi-tile py-2"><div className="text-xs text-muted-foreground">Input Tax</div><div className="text-lg font-semibold tabular-nums" data-no-i18n>{money(r.input)}</div></div>
            <div className="ek-kpi-tile py-2"><div className="text-xs text-muted-foreground">Net Tax (Output − Input)</div><div className="text-lg font-semibold tabular-nums" data-no-i18n>{money(r.net)}</div></div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <section className="dp-card lg:col-span-2 overflow-x-auto" data-dp-vat-accounts={r.accounts.length}>
              <h2 className="font-semibold">Tax Accounts</h2>
              {!r.accounts.length ? <p className="mt-2 text-sm text-muted-foreground">No posted tax in this period.</p>
                : <EntTable id="pro-vat-output" wrap><table className="mt-2 w-full min-w-[520px] text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start">Account</th><th className="p-2 text-start">Type</th><th className="p-2 text-end">Debit</th><th className="p-2 text-end">Credit</th><th className="p-2 text-end">Entries</th></tr></thead>
                  <tbody>{r.accounts.map((a) => <tr key={a.account} className="border-b border-border/60">
                    <td className="p-2"><Link to="/pro/general-ledger" search={{ company: ctx.company, account: a.account, from_date: from, to_date: to } as never} className="hover:underline" data-no-i18n>{a.account}</Link></td>
                    <td className="p-2"><span className="chip bg-accent text-[11px]">{a.side === "Output" ? "Output Tax" : "Input Tax"}</span></td>
                    <td className="whitespace-nowrap p-2 text-end tabular-nums" data-no-i18n>{money(a.debit)}</td><td className="whitespace-nowrap p-2 text-end tabular-nums" data-no-i18n>{money(a.credit)}</td><td className="p-2 text-end" data-no-i18n>{a.entries}</td>
                  </tr>)}</tbody></table></EntTable>}
            </section>
            <section className="dp-card text-sm">
              <h2 className="font-semibold">Source VAT reports</h2>
              <ul className="mt-2 space-y-1">{SOURCE_REPORTS.map((x) => <li key={x} className="flex items-center gap-2"><Link to="/report/$name" params={{ name: x }} className="hover:underline">{x}</Link><span className="chip ms-auto bg-warning/20 text-[11px]">Runs on DIGIT server</span></li>)}</ul>
              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><img src="/icons/digit/svc/digit-svc-zatca-onboarding-light.svg" alt="" aria-hidden className="h-5 w-5 shrink-0" data-digit-icon="svc-zatca-onboarding" /><span>KSA VAT return filing and ZATCA e-invoicing are not available in this preview.</span></p>
              <h2 className="mt-4 font-semibold">Tax setup</h2>
              <div className="mt-2 flex flex-wrap gap-1">{SETUP.map((d) => <Link key={d} to="/app/$app/$doctype" params={{ app: "erpnext", doctype: slug(d) }} className="chip bg-accent text-[11px] hover:underline">{d}</Link>)}</div>
            </section>
          </div>

          <section className="dp-card mt-4 overflow-x-auto" data-dp-vat-vouchers={vs.length}>
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">Tax by Document</h2>
              <select className="field-input ms-auto w-auto" value={search.side ?? ""} onChange={(e) => set({ side: e.target.value || undefined })}>
                <option value="">All</option><option value="Output">Output Tax</option><option value="Input">Input Tax</option></select></div>
            {!vs.length ? <p className="mt-2 text-sm text-muted-foreground">No posted tax in this period.</p>
              : <EntTable id="pro-vat-input" wrap><table className="mt-2 w-full min-w-[640px] text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-2 text-start">Posting Date</th><th className="p-2 text-start">Voucher Type</th><th className="p-2 text-start">Voucher No</th><th className="p-2 text-start">Party</th><th className="p-2 text-start">Type</th><th className="p-2 text-end">Tax Amount</th></tr></thead>
                <tbody>{vs.map((v) => <tr key={v.voucherType + v.voucherNo + v.account} className="border-b border-border/60" data-dp-vat-voucher={v.voucherNo}>
                  <td className="p-2" data-no-i18n>{v.date}</td><td className="p-2">{v.voucherType}</td>
                  <td className="p-2"><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(v.voucherType), name: v.voucherNo }} className="hover:underline" data-no-i18n>{v.voucherNo}</Link></td>
                  <td className="p-2" data-no-i18n>{v.party || String(adapter.get(v.voucherType, v.voucherNo)?.["customer"] ?? adapter.get(v.voucherType, v.voucherNo)?.["supplier"] ?? "—")}</td><td className="p-2">{v.side === "Output" ? "Output Tax" : "Input Tax"}</td>
                  <td className="whitespace-nowrap p-2 text-end tabular-nums" data-no-i18n>{money(v.tax)}</td></tr>)}</tbody></table></EntTable>}
          </section>
        </>;
      }}
    </ProFrame>
  );
}
