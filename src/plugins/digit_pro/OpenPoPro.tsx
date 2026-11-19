// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/** SC-P-09 Open Purchase Orders (/pro/open-purchase-orders) — what is still to receive or bill, per order line (RXP-01). */
import { Link, useNavigate } from "@tanstack/react-router";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { useCallback } from "react";
import { fmtCurrency } from "@/lib/format";
import { useLang } from "@/i18n";
import { Button } from "@/components/ui/button";
import { financeContext, slug, sourceStatus } from "./finance";
import { ProFrame, SourceState } from "./ProFrame";
import { openPurchaseOrders, sortPoLines, type OpenPoFilter, type OpenPoLine } from "./openPo";
import { SortTh, ViewToolbar, useRegister } from "./ViewToolbar";
import { OPEN_PO_SPEC, bandLabel } from "./viewSpecs";
import type { Search } from "./savedViews";
import { Meter } from "@/components/enterprise/kit";

export type OpenPoSearch = OpenPoFilter & { view?: string | undefined; cols?: string | undefined; sort?: string | undefined; density?: string | undefined; fs?: string | undefined };
const STATUS_AR: Record<string, string> = { "To Receive and Bill": "للاستلام والفوترة", "To Receive": "للاستلام", "To Bill": "للفوترة" };

export function OpenPoPro({ search }: { search: OpenPoSearch }) {
  const nav = useNavigate();
  const ar = useLang() === "ar", t = (en: string, arabic: string) => (ar ? arabic : en);
  const set = useCallback((p: Partial<OpenPoSearch> | Search) => void nav({ to: "/pro/open-purchase-orders", search: ((prev: OpenPoSearch) => ({ ...prev, ...p })) as never, replace: true }), [nav]);
  const reg = useRegister(OPEN_PO_SPEC, search as Search);
  return (
    <ProFrame title="Open Purchase Orders" subtitle="Submitted purchase order lines still to receive or bill — from native Core records." tabs={false} doctypes={["Purchase Order", "Purchase Receipt", "Purchase Invoice"]}>
      {({ user }) => {
        const ctx = financeContext(search.company, user);
        if (!ctx.companies.length) return <SourceState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} doctype="Company" />;
        const res = openPurchaseOrders({ ...search, company: ctx.company }, user);
        const lines = sortPoLines(res.lines, reg.sort);
        const money = (v: number, currency: string) => currency ? fmtCurrency(v, currency) : v.toLocaleString();
        const changed = !!(search.supplier || search.status || search.due || search.q || search.band || search.sched_from || search.sched_to);
        const maxBand = Math.max(1, ...res.bands.map((b) => b.lines));
        return <>
          <section className="dp-context flex flex-wrap items-end gap-2" data-dp-context>
            <label className="dp-ctx-item"><span>{t("Company", "الشركة")}</span>
              <select className="field-input" value={ctx.company} onChange={(e) => set({ company: e.target.value, supplier: undefined })} data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="dp-ctx-item"><span>{t("Supplier", "المورد")}</span>
              <select className="field-input" value={search.supplier ?? ""} onChange={(e) => set({ supplier: e.target.value || undefined })} data-dp-supplier>
                <option value="">{t("All suppliers", "كل الموردين")}</option>{res.suppliers.map((s) => <option key={s} value={s} data-no-i18n>{s}</option>)}</select></label>
            <label className="dp-ctx-item"><span>{t("Status", "الحالة")}</span>
              <select className="field-input" value={search.status ?? ""} onChange={(e) => set({ status: e.target.value || undefined })} data-dp-status>
                <option value="">{t("All statuses", "كل الحالات")}</option>{["To Receive and Bill", "To Receive", "To Bill"].map((s) => <option key={s} value={s}>{ar ? STATUS_AR[s] : s}</option>)}</select></label>
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={search.due === "overdue"} onChange={(e) => set({ due: e.target.checked ? "overdue" : undefined })} data-dp-overdue /> <span>{t("Overdue only", "المتأخرة فقط")}</span></label>
            <input type="search" className="field-input w-56" placeholder={t("Search order, supplier or item", "ابحث برقم الأمر أو المورد أو الصنف")} aria-label={t("Search order, supplier or item", "ابحث برقم الأمر أو المورد أو الصنف")} value={search.q ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} />
            {changed && <Button variant="ghost" size="sm" onClick={() => set({ supplier: undefined, status: undefined, due: undefined, q: undefined, band: undefined, sched_from: undefined, sched_to: undefined, fs: undefined })}>{t("Reset filters", "إعادة ضبط الفلاتر")}</Button>}
            <Link to="/report/$name" params={{ name: "Purchase Order Analysis" }} search={{ company: ctx.company } as never} className="btn-ghost ms-auto">{t("Purchase Order Analysis", "تحليل أوامر الشراء")}</Link>
          </section>
          <ViewToolbar spec={OPEN_PO_SPEC} search={search as Search} companies={ctx.companies} onApply={set} exporter={res.status !== "ok" ? undefined : { doctype: "Purchase Order", filename: `open_purchase_orders_${ctx.company}`, build: () => ({
            columns: reg.cols.map((k) => { const c = OPEN_PO_SPEC.columns.find((x) => x.key === k)!; return { fieldname: k, label: ar ? c.ar : c.label }; }),
            rows: lines.map((l) => Object.fromEntries(reg.cols.map((k) => [k, k === "next" ? [...l.receipts, ...l.invoices].join(" ") : k === "status" ? (ar ? STATUS_AR[l.status] ?? l.status : l.status) : (l as unknown as Record<string, unknown>)[k] ?? ""]))) }) }} />
          {res.status !== "ok" ? <div className="mt-4"><SourceState status={res.status} doctype="Purchase Order" /></div> : <>
            <section className="mt-4 grid gap-3 grid-cols-2 md:grid-cols-4" data-dp-cards>
              <div className="ek-kpi-tile"><p className="text-xs text-muted-foreground">{t("Open orders", "الأوامر المفتوحة")}</p><p className="mt-1 text-lg font-semibold" data-no-i18n>{res.totals.orders}</p></div>
              <div className="ek-kpi-tile"><p className="text-xs text-muted-foreground">{t("Value to receive", "قيمة متبقية للاستلام")}</p>{res.totals.currencies.map((c) => <p key={c.currency} className="mt-1 break-words text-lg font-semibold tabular-nums"><span data-no-i18n>{money(c.toReceive, c.currency)}</span>{!c.currency && <span className="ms-1 text-xs text-warning">{t("Unknown currency", "عملة غير معروفة")}</span>}</p>)}</div>
              <div className="ek-kpi-tile"><p className="text-xs text-muted-foreground">{t("Amount to bill", "مبلغ متبقٍ للفوترة")}</p>{res.totals.currencies.map((c) => <p key={c.currency} className="mt-1 break-words text-lg font-semibold tabular-nums"><span data-no-i18n>{money(c.toBill, c.currency)}</span>{!c.currency && <span className="ms-1 text-xs text-warning">{t("Unknown currency", "عملة غير معروفة")}</span>}</p>)}</div>
              <div className="ek-kpi-tile" data-tone={res.totals.overdue ? "bad" : undefined}><p className="text-xs text-muted-foreground">{t("Overdue lines", "البنود المتأخرة")}</p><p className={`mt-1 text-lg font-semibold ${res.totals.overdue ? "text-destructive" : ""}`} data-no-i18n>{res.totals.overdue}</p></div>
            </section>
            <section className="mt-4" aria-label={t("Expected delivery", "موعد التسليم المتوقع")} data-dp-po-bands>
              <h2 className="text-sm font-semibold">{t("Lines by expected delivery", "البنود حسب موعد التسليم المتوقع")} <span className="text-xs font-normal text-muted-foreground">· {t("Required By on each order line; received lines still to bill are shown separately", "تاريخ «مطلوب بتاريخ» لكل بند؛ البنود المستلمة بانتظار الفوترة معروضة منفصلة")}</span></h2>
              <div className="mt-2 grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                {res.bands.map((b) => { const on = search.band === b.band; return <button key={b.band} type="button" className="dp-seg" aria-pressed={on} disabled={!b.lines && !on} onClick={() => set({ band: on ? undefined : b.band })} title={`${bandLabel(b.band, ar)} · ${b.lines} · ${b.orders}`} data-dp-po-band={b.band}>
                  <span className="text-xs text-muted-foreground">{bandLabel(b.band, ar)}</span>
                  <span className={`text-base font-semibold tabular-nums ${b.band === "overdue" && b.lines ? "text-destructive" : ""}`}><bdi data-no-i18n>{b.lines}</bdi> <span className="text-xs font-normal">{t("lines", "بنود")}</span></span>
                  <span className="text-[11px] text-muted-foreground"><bdi data-no-i18n>{b.orders}</bdi> {t("orders", "أوامر")}</span>
                  <Meter value={b.lines} max={maxBand} tone={b.band === "overdue" ? "risk" : "good"} />
                </button>; })}
              </div>
            </section>
            <div className="dp-reg mt-4">
              <EntTable id="pro-open-po" wrap views={false}><table data-dp-open-po={lines.length}>
                <thead><tr>{reg.cols.map((k) => { const c = OPEN_PO_SPEC.columns.find((x) => x.key === k)!; return <SortTh key={k} k={k} label={ar ? c.ar : c.label} sort={reg.sort} sortable={OPEN_PO_SPEC.sorts.includes(k)} align={c.align} onSort={(s) => set({ sort: s })} />; })}</tr></thead>
                <tbody>
                  {lines.map((l, i) => <tr key={i} data-dp-po-line={l.po} data-band={l.band}>{reg.cols.map((k) => <PoCell key={k} k={k} l={l} cell={reg.cell} money={money} ar={ar} t={t} />)}</tr>)}
                  {!lines.length && <tr><td colSpan={reg.cols.length} className="px-3 py-6 text-center text-muted-foreground">{changed ? t("No order lines match the active filters.", "لا توجد بنود تطابق الفلاتر النشطة.") : t("Nothing to show", "لا يوجد ما يُعرض")}</td></tr>}
                </tbody>
              </table></EntTable>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t("Commitments in order currency — not posted payables. Receiving and billing are done on the original Purchase Order with its Create menu.", "التزامات بعملة الأمر — وليست ذممًا دائنة مرحّلة. يتم الاستلام والفوترة من أمر الشراء الأصلي عبر قائمة «إنشاء».")}</p>
          </>}
        </>;
      }}
    </ProFrame>
  );
}

function PoCell({ k, l, cell, money, ar, t }: { k: string; l: OpenPoLine; cell: string; money: (v: number, c: string) => string; ar: boolean; t: (en: string, ar: string) => string }) {
  const num = `${cell} text-end tabular-nums`;
  switch (k) {
    case "po": return <td className={`${cell} whitespace-nowrap`}><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug("Purchase Order"), name: l.po }} className="font-medium text-primary hover:underline" data-dp-open-po-doc={l.po} data-no-i18n><bdi>{l.po}</bdi></Link></td>;
    case "supplier": return <td className={`${cell} whitespace-nowrap`}><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "supplier", name: l.supplier }} className="hover:underline" data-no-i18n>{l.supplier}</Link></td>;
    case "item": return <td className={cell} data-no-i18n>{l.item}</td>;
    case "due": return <td className={`${cell} whitespace-nowrap tabular-nums ${l.overdue ? "text-destructive" : ""}`}><span data-no-i18n>{l.due || "—"}</span>{l.overdue && <> <span className="chip bg-destructive/10 text-[11px]">{t("Overdue", "متأخر")}</span></>}</td>;
    case "status": return <td className={`${cell} whitespace-nowrap`}>{ar ? STATUS_AR[l.status] ?? l.status : l.status}</td>;
    case "uom": return <td className={cell} data-no-i18n>{l.uom || "—"}</td>;
    case "currency": return <td className={cell}>{l.currency ? <span data-no-i18n>{l.currency}</span> : t("Unknown currency", "عملة غير معروفة")}</td>;
    case "qty": return <td className={num} data-no-i18n>{l.qty}</td>;
    case "received": return <td className={num} data-no-i18n>{l.received}</td>;
    case "returned": return <td className={num} data-no-i18n>{l.returned}</td>;
    case "toReceive": return <td className={num} data-no-i18n>{l.toReceive}</td>;
    case "amount": return <td className={`${num} whitespace-nowrap`} data-no-i18n>{money(l.amount, l.currency)}</td>;
    case "billed": return <td className={`${num} whitespace-nowrap`} data-no-i18n>{money(l.billed, l.currency)}</td>;
    case "toBill": return <td className={`${num} whitespace-nowrap`} data-no-i18n>{money(l.toBill, l.currency)}</td>;
    case "next": return <td className={`${cell} text-xs`} data-dp-po-next={l.po}>
      {l.receipts.map((r) => <Link key={r} to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "purchase_receipt", name: r }} className="me-1 inline-block chip bg-muted hover:underline" title={t("Purchase Receipt", "إيصال الشراء")} data-no-i18n><bdi>{r}</bdi></Link>)}
      {l.invoices.map((r) => <Link key={r} to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "purchase_invoice", name: r }} className="me-1 inline-block chip bg-primary/10 hover:underline" title={t("Purchase Invoice", "فاتورة الشراء")} data-no-i18n><bdi>{r}</bdi></Link>)}
      {!l.receipts.length && !l.invoices.length && <span className="text-muted-foreground">{l.toReceive > 0 ? t("Receive on the PO", "الاستلام من أمر الشراء") : t("Bill on the PO", "الفوترة من أمر الشراء")}</span>}
    </td>;
    default: return <td className={cell} />;
  }
}
