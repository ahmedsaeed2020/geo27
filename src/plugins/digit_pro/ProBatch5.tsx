// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/** DIGIT Pro batch 5: SC-A-07 Asset Register, SC-S-08 Sales Analytics drill-down. Read-only over native Core records. */
import { Link } from "@tanstack/react-router";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { fmtCurrency } from "@/lib/format";
import { financeContext, slug } from "./finance";
import { ProFrame, SourceState } from "./ProFrame";
import { DocA } from "./OpsPro";
import { assetRegister, disposalPreview, salesAnalytics, type SaDoc, type SaTree } from "./ops";
import { DateInput } from "@/components/form/DateInput";
import { PostedDisposalsPanel } from "./AssetClosurePanels";
import { useLang } from "@/i18n";
import { Columns } from "@/components/enterprise/kit";

type Q = Record<string, string | undefined>;
function useSet(to: string) { const nav = useNavigate(); return (p: Q) => void nav({ to: to as never, search: ((prev: Q) => ({ ...prev, ...p })) as never, replace: true }); }
/** `record` marks option labels as record content (names/codes), so the display translation layer leaves them untouched. */
const Sel = ({ label, value, list, onChange, none = "—", record = false }: { label: string; value?: string | undefined; list: (string | [string, string])[]; onChange: (v: string) => void; none?: string | null; record?: boolean }) => (
  <label className="dp-ctx-item"><span>{label}</span><select className="field-input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
    {none !== null && <option value="">{none}</option>}{list.map((x) => typeof x === "string" ? <option key={x} value={x} data-no-i18n>{x}</option> : <option key={x[0]} value={x[0]} data-no-i18n={record ? "" : undefined}>{x[1]}</option>)}</select></label>);
const GlLink = ({ f, on, k, children }: { f: unknown[]; on: boolean; k: string; children: React.ReactNode }) => on
  ? <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "gl_entry" }} search={{ filters: JSON.stringify([...f, ["is_cancelled", "=", "0"]]) } as never} className="mt-1 block text-lg font-semibold tabular-nums hover:underline" data-no-i18n data-dp-total-gl={k}>{children}</Link>
  : <p className="mt-1 text-lg font-semibold tabular-nums" data-no-i18n>{children}</p>;
const lastDay = (m: string) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10);

/* ---------- SC-A-07 ---------- */
export { EnterpriseAssetRegister as AssetRegisterPro } from "./AssetRegister";

/* ---------- SC-S-08 ---------- */
const DOCS: SaDoc[] = ["Sales Order", "Delivery Note", "Sales Invoice"];
const TREES: SaTree[] = ["Customer", "Customer Group", "Territory", "Item", "Sales Person"];
const TREE_FIELD: Partial<Record<SaTree, string>> = { Customer: "customer", "Customer Group": "customer_group", Territory: "territory" };
export function SalesAnalyticsPro({ search }: { search: Q }) {
  const set = useSet("/pro/sales-analytics"); const nav = useNavigate(); const ar = useLang() === "ar";
  const doc = (DOCS.includes(search["doc"] as SaDoc) ? search["doc"] : "Sales Invoice") as SaDoc;
  const tree = (TREES.includes(search["tree"] as SaTree) ? search["tree"] : "Customer") as SaTree;
  const measure = search["measure"] === "qty" ? "qty" : "value";
  const months = search["months"] === "12" ? 12 : 6;
  return <ProFrame title="Sales Analytics" subtitle="Submitted selling documents by month — click a figure to open the matching native documents." tabs={false} doctypes={[...DOCS, "Customer"]}>
    {({ user }) => {
      const ctx = financeContext(search["company"], user);
      const r = salesAnalytics(ctx.company, { doc, tree, measure, months }, user);
      if (r.status !== "ok") return <SourceState status={r.status} doctype={doc} />;
      const fmt = (v: number) => measure === "qty" ? v.toLocaleString("en-US", { maximumFractionDigits: 3 }) : fmtCurrency(v, ctx.currency);
      const open = (key: string | null, m: string | null) => {
        if ((tree === "Item" || tree === "Sales Person") && key && key !== "—") { void nav({ to: "/app/$app/$doctype/$name", params: { app: "erpnext", doctype: slug(tree), name: key } }); return; }
        const f: unknown[] = [["docstatus", "=", "1"], ["company", "=", ctx.company]];
        if (key && tree !== "Item" && tree !== "Sales Person") f.push([TREE_FIELD[tree], "=", key]);
        const from = m ? `${m}-01` : `${r.months[0]}-01`; const to = lastDay(m ?? r.months[r.months.length - 1]!);
        f.push([r.dateField, ">=", from], [r.dateField, "<=", to]);
        void nav({ to: "/app/$app/$doctype", params: { app: "erpnext", doctype: slug(doc) }, search: { filters: JSON.stringify(f) } as never });
      };
      const Cell = ({ k, m, v }: { k: string | null; m: string | null; v: number }) => v ? <button type="button" className="tabular-nums hover:underline" onClick={() => open(k, m)} data-no-i18n data-dp-sa-cell>{fmt(v)}</button> : <span className="text-muted-foreground" data-no-i18n>—</span>;
      return <>
        <section className="dp-context flex-wrap" data-dp-context>
          <Sel label="Company" value={ctx.company} list={ctx.companies} none={null} onChange={(v) => set({ company: v })} />
          <Sel label="Based On" value={doc} list={DOCS.map((d) => [d, d] as [string, string])} none={null} onChange={(v) => set({ doc: v })} />
          <Sel label="Tree Type" value={tree} list={TREES.map((d) => [d, d] as [string, string])} none={null} onChange={(v) => set({ tree: v })} />
          <Sel label="Value or Qty" value={measure} list={[["value", "Value"], ["qty", "Quantity"]]} none={null} onChange={(v) => set({ measure: v === "qty" ? "qty" : undefined })} />
          <Sel label="Period" value={String(months)} list={[["6", "6 months"], ["12", "12 months"]]} none={null} onChange={(v) => set({ months: v === "12" ? "12" : undefined })} />
          <Link to="/report/$name" params={{ name: "Sales Analytics" }} className="btn-ghost ms-auto">Standard Sales Analytics report</Link>
        </section>
        {r.rows.length > 0 && (() => <section className="panel mt-4" data-dp-sa-chart aria-label="Monthly total">
          <Columns ar={ar} height={160} fmt={fmt} axisFmt={fmt} data={r.months.map((m) => { const v = r.colTotals[m] ?? 0; return { key: m, label: m, value: v, data: true, ...(v ? { drill: m } : {}) }; })}
            wrap={(m, child, attrs) => <button type="button" className="ek-col-hit" onClick={() => open(null, String(m))} {...attrs}>{child}</button>} />
        </section>)()}
        <section className="panel mt-4 overflow-x-auto" data-dp-sales-analytics>
          {!r.rows.length ? <SourceState status="empty" /> : <EntTable id="pro-sales-analytics" wrap><table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground">
            <th className="p-2 text-start">{tree}</th>{r.months.map((m) => <th key={m} className="p-2 text-end" data-no-i18n>{m}</th>)}<th className="p-2 text-end">Total</th></tr></thead>
            <tbody>{r.rows.map((x) => <tr key={x.key} className="border-t border-border" data-dp-sa-row={x.key}>
              <td className="p-2">{x.key === "—" ? <span className="text-muted-foreground">{tree === "Sales Person" ? "No sales person" : "—"}</span> : tree === "Item" || tree === "Sales Person" ? <DocA dt={tree} name={x.key} /> : <span data-no-i18n>{x.key}</span>}</td>
              {r.months.map((m) => <td key={m} className="p-2 text-end"><Cell k={x.key} m={m} v={x.cells[m] ?? 0} /></td>)}
              <td className="p-2 text-end font-semibold"><Cell k={x.key} m={null} v={x.total} /></td></tr>)}
              <tr className="border-t-2 border-border font-semibold"><td className="p-2">Total</td>{r.months.map((m) => <td key={m} className="p-2 text-end">{tree === "Item" || tree === "Sales Person" ? <span className="tabular-nums" data-no-i18n>{fmt(r.colTotals[m] ?? 0)}</span> : <Cell k={null} m={m} v={r.colTotals[m] ?? 0} />}</td>)}
                <td className="p-2 text-end tabular-nums" data-no-i18n>{fmt(r.total)}</td></tr></tbody></table></EntTable>}
        </section>
        <p className="mt-2 text-xs text-muted-foreground">Values are net totals of submitted documents (item net amounts for Item). Item figures open the Item; others open the filtered document list.</p>
      </>;
    }}
  </ProFrame>;
}

/* ---------- SC-A-06b Sell or scrap review ---------- */
export function AssetDisposalPro({ search }: { search: Q }) {
  const set = useSet("/pro/asset-disposal");
  // Choosing an asset is a drill-in (pushes history) so Back returns to the eligible-asset list with its context.
  const nav = useNavigate(); const router = useRouter(); const canBack = useCanGoBack();
  const open = (asset?: string) => void nav({ to: "/pro/asset-disposal", search: ((prev: Q) => ({ ...prev, asset })) as never });
  const toList = () => (canBack ? router.history.back() : open(undefined));
  const today = new Date().toISOString().slice(0, 10);
  const date = search["date"] || today;
  // Sale vs Scrap is an explicit choice, never inferred from the amount or the order inputs were filled in.
  const kind = search["kind"] === "scrap" ? "scrap" : "sale";
  const amount = Math.max(0, Number(search["amount"]) || 0); const sale = kind === "sale" ? amount : 0;
  const saleMissing = kind === "sale" && !amount;
  return <ProFrame title="Sell or Scrap Asset" subtitle="Review the journal entry DIGIT would create when an asset is sold or scrapped — nothing is posted here." tabs={false} doctypes={["Asset", "Asset Depreciation Schedule"]}>
    {({ user }) => {
      const ctx = financeContext(search["company"], user);
      const reg = assetRegister(ctx.company, {}, user);
      if (reg.status !== "ok") return <SourceState status={reg.status} doctype="Asset" />;
      const live = reg.rows.filter((x) => x.docstatus === 1 && !["Sold", "Scrapped", "Capitalized"].includes(x.status));
      const p = search["asset"] && !saleMissing ? disposalPreview(search["asset"], date, sale, user) : null;
      const money = (v: number) => fmtCurrency(v, ctx.currency);
      return <>
        <section className="dp-context flex-wrap" data-dp-context>
          <Sel label="Company" value={ctx.company} list={ctx.companies} none={null} onChange={(v) => set({ company: v, asset: undefined })} />
          <Sel label="Asset" record value={search["asset"]} list={live.map((x) => [x.name, `${x.name} — ${x.asset_name}`] as [string, string])} onChange={(v) => set({ asset: v || undefined })} />
          <label className="dp-ctx-item"><span>Disposal Date</span><DateInput className="field-input" value={date} onChange={(e) => set({ date: e.target.value || undefined })} /></label>
          <div className="dp-ctx-item" role="radiogroup" aria-label="Disposal Type"><span>Disposal Type</span><div className="flex gap-1">
            {(["sale", "scrap"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} data-dp-disp-kind={k} className={kind === k ? "btn-primary" : "btn-ghost"} onClick={() => set({ kind: k })}>{k === "sale" ? "Sale" : "Scrap"}</button>)}</div></div>
          {kind === "sale" && <label className="dp-ctx-item"><span>Selling Amount</span><input type="number" min={0} className="field-input" value={search["amount"] ?? ""} onChange={(e) => set({ amount: e.target.value || undefined })} data-dp-disp-amount /></label>}
        </section>
        {!search["asset"] ? <section className="dp-card mt-4" data-dp-disp-pick={live.length}>
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">Assets that can be sold or scrapped</h2>
              <Link to="/pro/assets-overview" search={{ company: ctx.company } as never} className="btn-ghost ms-auto text-xs" data-dp-disp-back>Fixed Assets</Link></div>
            <p className="mt-1 text-xs text-muted-foreground">Choose a submitted asset to review its disposal.</p>
            {!live.length ? <div className="mt-2"><SourceState status="empty" doctype="Asset" /><p className="mt-1 text-xs text-muted-foreground">Only submitted assets that are not already sold, scrapped or capitalized can be disposed.</p></div>
              : <div className="mt-2 overflow-x-auto"><EntTable id="pro-asset-disposal" wrap><table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground"><th className="p-2 text-start">Asset</th><th className="p-2 text-start">Asset Category</th><th className="p-2 text-start">Status</th><th className="p-2 text-end">Net Purchase Amount</th><th className="p-2 text-end">Value After Depreciation</th><th className="p-2" /></tr></thead>
                <tbody>{live.map((x) => <tr key={x.name} className="border-t border-border" data-dp-disp-row={x.name}>
                  <td className="p-2"><DocA dt="Asset" name={x.name} /> <span className="text-xs text-muted-foreground" data-no-i18n>{x.asset_name}</span></td>
                  <td className="p-2 text-xs" data-no-i18n>{x.category || "—"}</td><td className="p-2"><span className="chip bg-muted text-xs">{x.status}</span></td>
                  <td className="p-2 text-end tabular-nums" data-no-i18n>{money(x.cost)}</td><td className="p-2 text-end tabular-nums" data-no-i18n>{money(x.book)}</td>
                  <td className="p-2 text-end"><button type="button" className="btn-ghost text-xs" onClick={() => open(x.name)} data-dp-disp-choose={x.name}>Review disposal</button></td></tr>)}</tbody></table></EntTable></div>}
          </section>
          : null}
        {!search["asset"] && <PostedDisposalsPanel company={ctx.company} currency={ctx.currency} user={user} />}
        {!search["asset"] ? null : <>
          <div className="mt-3"><button type="button" className="btn-ghost text-xs" onClick={toList} data-dp-disp-list><span aria-hidden>← </span><span>Assets that can be sold or scrapped</span></button></div>
          {saleMissing ? <p className="dp-card mt-4 text-sm text-warning" data-dp-disp-need-amount>Enter the selling amount, or choose Scrap.</p>
          : !p ? <p className="dp-card mt-4 text-sm text-muted-foreground">Choose a submitted asset to review its disposal.</p> : <>
          {p.blocked && <p className="dp-card mt-4 text-sm text-destructive">{p.blocked}</p>}
          <section className="mt-4 grid gap-3 grid-cols-2 md:grid-cols-4" data-dp-disp-cards>
            <div className="ek-kpi-tile"><p className="text-xs text-muted-foreground">Net Purchase Amount</p><p className="mt-1 font-semibold tabular-nums" data-no-i18n>{money(p.cost)}</p></div>
            <div className="ek-kpi-tile"><p className="text-xs text-muted-foreground">Accumulated Depreciation</p><p className="mt-1 font-semibold tabular-nums" data-no-i18n>{money(p.accum)}</p>{p.unbooked > 0 && <p className="text-xs text-muted-foreground"><span>includes due, not booked</span> <span data-no-i18n>{money(p.unbooked)}</span></p>}</div>
            <div className="ek-kpi-tile"><p className="text-xs text-muted-foreground">Value After Depreciation</p><p className="mt-1 font-semibold tabular-nums" data-no-i18n>{money(p.nbv)}</p></div>
            <div className="ek-kpi-tile" data-dp-disp-gl><p className="text-xs text-muted-foreground">{p.gainLoss >= 0 ? "Gain on disposal" : "Loss on disposal"}</p><p className="mt-1 font-semibold tabular-nums" data-no-i18n>{money(Math.abs(p.gainLoss))}</p></div>
          </section>
          <section className="panel mt-4 overflow-x-auto" data-dp-disp-lines>
            <h3 className="p-2 text-sm font-semibold">{kind === "sale" ? "Sale" : "Scrap"} — <span>Journal entry lines that DIGIT would create</span></h3>
            <table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground"><th className="p-2 text-start">Account</th><th className="p-2 text-end">Debit</th><th className="p-2 text-end">Credit</th></tr></thead>
              <tbody>{p.lines.map((l) => <tr key={l.account} className="border-t border-border"><td className="p-2"><DocA dt="Account" name={l.account} /></td><td className="p-2 text-end tabular-nums" data-no-i18n>{l.debit ? money(l.debit) : ""}</td><td className="p-2 text-end tabular-nums" data-no-i18n>{l.credit ? money(l.credit) : ""}</td></tr>)}
                <tr className="border-t-2 border-border font-semibold"><td className="p-2">Total</td><td className="p-2 text-end tabular-nums" data-no-i18n>{money(p.debit)}</td><td className="p-2 text-end tabular-nums" data-no-i18n>{money(p.credit)}</td></tr></tbody></table>
          </section>
          <p className="mt-2 text-xs text-muted-foreground"><span>This review does not post. Sell the asset with a native Sales Invoice, or scrap it from the asset form; DIGIT books it on the server.</span> <DocA dt="Asset" name={p.asset} /></p>
        </>}
          </>}
      </>;
    }}
  </ProFrame>;
}
