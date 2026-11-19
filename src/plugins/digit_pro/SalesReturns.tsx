// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * RXP-03 / SC-S-06 — Sales Returns (/pro/sales-returns). Credit notes (Sales Invoice returns) and delivery returns
 * (Delivery Note returns) of a period with the document each one reverses, exact link exceptions, the monthly credit
 * vs invoiced comparison (company currency) and the items returned. Every return, original document and customer opens
 * its native form or Customer 360. Read-only: returns are created from the native invoice / delivery "Create" menu.
 */
import { useCallback, useState } from "react";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { Link, useNavigate } from "@tanstack/react-router";
import { ProFrame } from "./ProFrame";
import { financeContext, sourceStatus, todayIso } from "./finance";
import { freshness } from "./command";
import { FLAG_ACTION, FLAG_LABEL, FLAGS, filterReturns, itemReturns, nativeReturnFilter, returnsSummary, returnTrend, salesReturns, type ReturnFlag, type ReturnRow } from "./salesReturns";
import { lastMonthsTo } from "./customerProfile";
import { Chip, CustomerLink, DocLink, DtText, FilterCard, Money, NativeList, Q2cState, qty, StackCols, StatusText, useBi, validIso } from "./Q2cUi";
import { ViewToolbar } from "./ViewToolbar";
import { RETURNS_SPEC } from "./viewSpecs";
import { VIEW_KEYS, type Search, type ViewSearchKeys } from "./savedViews";
import { DateInput } from "@/components/form/DateInput";

export interface ReturnsSearch extends ViewSearchKeys { company?: string | undefined; from?: string | undefined; to?: string | undefined; type?: string | undefined; flag?: string | undefined; customer?: string | undefined; q?: string | undefined }
export const RETURNS_KEYS = ["company", "from", "to", "type", "flag", "customer", "q", ...VIEW_KEYS];
const DTS = ["Sales Invoice", "Delivery Note", "Customer", "Item", "Company"];
const FLAG_TONE: Record<ReturnFlag, "bad" | "warn"> = { draft: "warn", "no-original": "bad", unapplied: "warn", "not-credited": "bad" };
const PAGE = 60;

export function SalesReturnsPro({ search }: { search: ReturnsSearch }) {
  const nav = useNavigate();
  const { t, b } = useBi();
  const [shown, setShown] = useState(PAGE);
  const set = (p: Partial<ReturnsSearch>) => { setShown(PAGE); void nav({ to: "/pro/sales-returns", search: (prev: ReturnsSearch) => ({ ...prev, ...p }) as never, replace: true }); };
  // EQ-01 P3: personal Saved Views (filters only) — the URL stays the effective state, so Back/refresh keep the view.
  const apply = useCallback((next: Search) => void nav({ to: "/pro/sales-returns", search: ((prev: ReturnsSearch) => ({ ...prev, ...next })) as never, replace: true }), [nav]);
  return (
    <ProFrame title={t("Sales Returns", "مرتجعات المبيعات")} subtitle={t("Credit notes and returned deliveries, the documents they reverse and what still needs action.", "إشعارات الدائن والتسليمات المرتجعة والمستندات التي تعكسها وما يحتاج إلى إجراء.")} tabs={false} doctypes={DTS}>
      {({ user }) => {
        const ctx = financeContext(search.company, user);
        if (!ctx.companies.length) return <Q2cState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} />;
        const today = todayIso();
        const to = validIso(search.to) ? search.to : today;
        const from = validIso(search.from) ? search.from : `${lastMonthsTo(to, 12)[0]}-01`;
        const bad = from > to;
        const r = salesReturns(ctx.company, from, to, user);
        const sum = returnsSummary(r.rows);
        const rows = filterReturns(r.rows, search);
        const months = bad ? [] : lastMonthsTo(to, 12).filter((m) => m >= from.slice(0, 7));
        const trend = r.creditStatus === "ok" ? returnTrend(r.invoices, ctx.company, months) : [];
        const items = bad ? [] : itemReturns(r.invoices, r.deliveries, ctx.company, from, to).slice(0, 12);
        const customers = [...new Map(r.rows.map((x) => [x.customer, x.customerName])).entries()].sort((a, c) => a[1].localeCompare(c[1]));
        const flag = (FLAGS as string[]).includes(search.flag ?? "") ? (search.flag as ReturnFlag) : undefined;
        const both = r.creditStatus !== "ok" && r.deliveryStatus !== "ok";
        return <div className="dp-cc" data-dp-screen="SALES-RET">
          <section className="dp-context flex-wrap" data-dp-context>
            <label className="dp-ctx-item"><span>{t("Company", "الشركة")}</span>
              <select className="field-input" value={ctx.company} onChange={(e) => set({ company: e.target.value, customer: undefined })} data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="dp-ctx-item"><span>{t("From Date", "من تاريخ")}</span><DateInput className="field-input" value={from} onChange={(e) => validIso(e.target.value) && set({ from: e.target.value })} /></label>
            <label className="dp-ctx-item"><span>{t("To Date", "إلى تاريخ")}</span><DateInput className="field-input" value={to} onChange={(e) => validIso(e.target.value) && set({ to: e.target.value })} /></label>
            <label className="dp-ctx-item"><span>{t("Type", "النوع")}</span>
              <select className="field-input" value={search.type ?? ""} onChange={(e) => set({ type: e.target.value || undefined })}>
                <option value="">{t("All returns", "كل المرتجعات")}</option><option value="credit">{t("Credit notes", "إشعارات الدائن")}</option><option value="delivery">{t("Delivery returns", "مرتجعات التسليم")}</option></select></label>
            <label className="dp-ctx-item"><span>{t("Customer", "العميل")}</span>
              <select className="field-input max-w-[14rem]" value={search.customer ?? ""} onChange={(e) => set({ customer: e.target.value || undefined })}>
                <option value="">{t("All customers", "كل العملاء")}</option>{customers.map(([id, nm]) => <option key={id} value={id} data-no-i18n>{nm}</option>)}</select></label>
            <input type="search" className="field-input max-w-xs" value={search.q ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} placeholder={t("Find return, original, customer or item", "بحث عن مرتجع أو أصل أو عميل أو صنف")} aria-label={t("Find return, original, customer or item", "بحث عن مرتجع أو أصل أو عميل أو صنف")} />
            <div className="dp-ctx-item"><span>{t("Last change", "آخر تعديل")}</span><b className="tabular-nums" data-no-i18n>{freshness(["Sales Invoice", "Delivery Note"], user)}</b></div>
            <div className="ms-auto flex flex-wrap gap-1.5">
              {r.creditStatus === "ok" && <NativeList doctype="Sales Invoice" filters={nativeReturnFilter(ctx.company, from, to)} className="btn-ghost text-xs">{t("Credit notes list", "قائمة إشعارات الدائن")}</NativeList>}
              {r.deliveryStatus === "ok" && <NativeList doctype="Delivery Note" filters={nativeReturnFilter(ctx.company, from, to)} className="btn-ghost text-xs">{t("Delivery returns list", "قائمة مرتجعات التسليم")}</NativeList>}
              <Link to="/report/$name" params={{ name: "Sales Register" }} search={{ company: ctx.company, from_date: from, to_date: to } as never} className="btn-ghost text-xs">{t("Sales Register", "سجل المبيعات")}</Link>
            </div>
          </section>
          <ViewToolbar spec={RETURNS_SPEC} search={search as Search} companies={ctx.companies} onApply={apply} />

          {bad ? <p className="text-destructive">{t("Choose a valid date range.", "اختر نطاق تاريخ صحيحًا.")}</p> : both ? <Q2cState status={r.creditStatus} what={["Sales Invoice", "فاتورة مبيعات"]} /> : <>
            {r.creditStatus !== "ok" && <div data-dp-ret-credit-state><Q2cState status={r.creditStatus} what={["Credit notes", "إشعارات الدائن"]} /></div>}
            {r.deliveryStatus !== "ok" && <div data-dp-ret-delivery-state><Q2cState status={r.deliveryStatus} what={["Delivery returns", "مرتجعات التسليم"]} /></div>}
            <div className="dp-cc-signals" data-dp-ret-cards>
              <FilterCard testId="credit" label={t("Credit notes submitted", "إشعارات دائن معتمدة")} value={r.creditStatus === "ok" ? sum.credits : "—"} meta={<Money totals={sum.creditValue} empty={t("no value", "بدون قيمة")} />}
                active={search.type === "credit" && !flag} onClick={() => set({ type: search.type === "credit" && !flag ? undefined : "credit", flag: undefined })} disabled={r.creditStatus !== "ok"} />
              <FilterCard testId="delivery" label={t("Delivery returns submitted", "مرتجعات تسليم معتمدة")} value={r.deliveryStatus === "ok" ? sum.deliveries : "—"} meta={t("Goods returned to stock", "بضاعة أعيدت إلى المخزون")}
                active={search.type === "delivery" && !flag} onClick={() => set({ type: search.type === "delivery" && !flag ? undefined : "delivery", flag: undefined })} disabled={r.deliveryStatus !== "ok"} />
              {FLAGS.map((f) => <FilterCard key={f} testId={f} label={b(FLAG_LABEL[f])} value={sum.flags[f]} tone={sum.flags[f] ? FLAG_TONE[f] : undefined} meta={b(FLAG_ACTION[f])}
                active={flag === f} onClick={() => set({ flag: flag === f ? undefined : f, type: undefined })} disabled={f === "not-credited" && r.creditStatus !== "ok"} />)}
            </div>

            <div className="dp-cc-split dp-cc-split-7">
              <section className="dp-cc-panel" data-dp-ret-trend>
                <div className="dp-cc-panel-h"><h2>{t("Invoiced vs credited by month", "المفوتر مقابل المردود حسب الشهر")}</h2><span className="dp-cc-note"><span data-no-i18n>{ctx.currency}</span> · {t("submitted invoices and credit notes in company currency; the share shows only for months with invoices.", "الفواتير وإشعارات الدائن المعتمدة بعملة الشركة؛ النسبة تظهر للأشهر التي فيها فواتير فقط.")}</span></div>
                <div className="dp-cc-panel-b">{r.creditStatus !== "ok" ? <Q2cState status={r.creditStatus} /> : !trend.some((m) => m.invoiced || m.credited) ? <Q2cState status="empty" /> :
                  <StackCols testId="ret-trend" cols={trend.map((m) => ({ key: m.month, label: m.month, caption: m.share === null ? "" : `${m.share}%`, segs: [{ key: "inv", value: Math.max(m.invoiced - m.credited, 0), tone: "t-primary", label: t("Invoiced (net)", "المفوتر (صافي)") }, { key: "cr", value: m.credited, tone: "t-bad", label: t("Credited", "المردود") }] }))}
                    legend={[{ tone: "t-primary", label: t("Invoiced, net of credits", "المفوتر بعد خصم الإشعارات") }, { tone: "t-bad", label: t("Credit notes", "إشعارات الدائن") }]} />}</div>
              </section>
              <section className="dp-cc-panel" data-dp-ret-customers>
                <div className="dp-cc-panel-h"><h2>{t("Credit by customer", "الإشعارات حسب العميل")}</h2><span className="dp-cc-note"><span data-no-i18n>{ctx.currency}</span> · {t("submitted credit notes in the period", "إشعارات دائن معتمدة في الفترة")}</span></div>
                {!sum.customers.length ? <div className="dp-cc-panel-b"><Q2cState status={r.creditStatus === "ok" ? "empty" : r.creditStatus} /></div> :
                  <ul className="divide-y divide-border text-sm">{sum.customers.slice(0, 8).map((c) => <li key={c.customer} className="flex items-center gap-2 px-4 py-2">
                    <span className="min-w-0 flex-1 truncate"><CustomerLink customer={c.customer} name={c.customerName} company={ctx.company} /></span>
                    <button type="button" className="dp-link text-xs" onClick={() => set({ customer: search.customer === c.customer ? undefined : c.customer })} aria-pressed={search.customer === c.customer}><span data-no-i18n>{c.count}</span> {t("returns", "مرتجعات")}</button>
                    <Money totals={[{ currency: ctx.currency, amount: c.value }]} /></li>)}</ul>}
              </section>
            </div>

            <section className="dp-cc-panel" data-dp-ret-items>
              <div className="dp-cc-panel-h"><h2>{t("Returned items", "الأصناف المرتجعة")}</h2><span className="dp-cc-note">{t("Per item and unit in the period: invoiced vs credited quantity (invoices) and goods returned to stock (deliveries). Different units are never mixed.", "لكل صنف ووحدة في الفترة: الكمية المفوترة مقابل المردودة (الفواتير) والبضاعة المعادة للمخزون (التسليمات). لا تُخلط الوحدات المختلفة.")}</span></div>
              {!items.length ? <div className="dp-cc-panel-b"><Q2cState status="empty" /></div> :
                <div className="overflow-x-auto"><EntTable id="pro-returns-summary" wrap><table className="dp-cc-table dp-q2c-table min-w-[640px]"><thead><tr><th>{t("Item", "الصنف")}</th><th>{t("UOM", "الوحدة")}</th><th className="num">{t("Invoiced", "المفوتر")}</th><th className="num">{t("Credited", "المردود")}</th><th className="num">{t("Credited share", "نسبة المردود")}</th><th className="num">{t("Returned to stock", "المعاد للمخزون")}</th></tr></thead>
                  <tbody>{items.map((i) => <tr key={i.item + i.uom} data-dp-ret-item={i.item}><td><DocLink dt="Item" name={i.item} /><div className="text-[11px] text-muted-foreground" data-no-i18n>{i.itemName}</div></td><td data-no-i18n>{i.uom || "—"}</td>
                    <td className="num" data-no-i18n>{qty(i.invoicedQty)}</td><td className="num" data-no-i18n>{qty(i.creditedQty)}</td><td className="num" data-no-i18n>{i.creditShare === null ? "—" : `${i.creditShare}%`}</td><td className="num" data-no-i18n>{qty(i.returnedQty)}</td></tr>)}</tbody></table></EntTable></div>}
            </section>

            <section className="dp-cc-panel" data-dp-ret-register>
              <div className="dp-cc-panel-h"><h2>{t("Returns register", "سجل المرتجعات")}</h2><span className="dp-cc-note" data-dp-ret-count={rows.length}>{t(`${rows.length} of ${r.rows.length} returns`, `${rows.length} من ${r.rows.length} مرتجعًا`)}</span>
                {(search.type || flag || search.customer || search.q) && <button type="button" className="dp-link ms-auto text-xs" onClick={() => set({ type: undefined, flag: undefined, customer: undefined, q: undefined })} data-dp-ret-clear>{t("Clear filters", "مسح عوامل التصفية")}</button>}</div>
              {!rows.length ? <div className="dp-cc-panel-b"><Q2cState status="empty" /></div> : <>
                <ul className="dp-q2c-card-list md:hidden">{rows.slice(0, shown).map((x) => <li key={x.doctype + x.name} className="dp-q2c-row-card" data-dp-ret-card={x.name}>
                  <div className="flex flex-wrap items-center gap-2"><DocLink dt={x.doctype} name={x.name} /><Chip><DtText dt={x.doctype} /></Chip><span className="ms-auto"><Money totals={[{ currency: x.currency, amount: x.amount }]} /></span></div>
                  <div className="text-sm"><CustomerLink customer={x.customer} name={x.customerName} company={ctx.company} /></div>
                  <dl><div><dt>{t("Date", "التاريخ")}</dt><dd data-no-i18n>{x.date}</dd></div><div><dt>{t("Return against", "مرتجع مقابل")}</dt><dd>{x.against ? <DocLink dt={x.doctype} name={x.against} /> : "—"}</dd></div><div><dt>{t("Status", "الحالة")}</dt><dd><StatusText status={x.docstatus === 0 ? "Draft" : x.status || "Return"} /></dd></div></dl>
                  <Flags x={x} />
                </li>)}</ul>
                <div className="hidden overflow-x-auto md:block"><EntTable id="pro-returns" wrap><table className="dp-cc-table dp-q2c-table min-w-[1000px]" data-dp-ret-table>
                  <thead><tr><th>{t("Return", "المرتجع")}</th><th>{t("Date", "التاريخ")}</th><th>{t("Customer", "العميل")}</th><th>{t("Reverses", "يعكس")}</th><th className="num">{t("Value", "القيمة")}</th><th>{t("Items", "الأصناف")}</th><th>{t("Credit note", "إشعار الدائن")}</th><th>{t("Needs attention", "يحتاج إلى إجراء")}</th></tr></thead>
                  <tbody>{rows.slice(0, shown).map((x) => <tr key={x.doctype + x.name} data-dp-ret-row={x.name} data-dp-ret-type={x.doctype}>
                    <td><DocLink dt={x.doctype} name={x.name} /><div className="text-[11px] text-muted-foreground"><DtText dt={x.doctype} /> · <StatusText status={x.docstatus === 0 ? "Draft" : x.status || "Return"} /></div></td>
                    <td className="tabular-nums" data-no-i18n>{x.date}</td>
                    <td><CustomerLink customer={x.customer} name={x.customerName} company={ctx.company} /></td>
                    <td>{x.against ? <><DocLink dt={x.doctype} name={x.against} />{x.againstFound ? <div className="text-[11px] text-muted-foreground" data-no-i18n>{x.againstDate} · {x.againstAmount !== null ? x.againstAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}</div> : <div className="text-[11px] text-warning">{t("Original not readable", "الأصل غير متاح للقراءة")}</div>}</> : <span className="text-xs text-destructive">{t("No original", "بدون أصل")}</span>}</td>
                    <td className="num"><Money totals={[{ currency: x.currency, amount: x.amount }]} />{x.unapplied > 0 && <div className="text-[11px] text-warning">{t("Unapplied", "غير مستخدم")} <Money totals={[{ currency: x.currency, amount: x.unapplied }]} /></div>}</td>
                    <td className="text-xs"><span data-no-i18n>{x.lines.slice(0, 2).map((l) => `${l.itemName} × ${qty(l.qty)} ${l.uom}`).join(" · ")}{x.lines.length > 2 ? ` +${x.lines.length - 2}` : ""}</span></td>
                    <td>{x.doctype === "Delivery Note" ? (x.creditNotes.length ? <span className="dp-q2c-docs">{x.creditNotes.map((c) => <DocLink key={c} dt="Sales Invoice" name={c} />)}</span> : <span className="text-xs text-muted-foreground">{r.creditStatus === "ok" ? t("None", "لا يوجد") : "—"}</span>) : <span className="text-xs text-muted-foreground">—</span>}</td>
                    <td><Flags x={x} /></td>
                  </tr>)}</tbody></table></EntTable></div>
                {rows.length > shown && <div className="p-3 text-center"><button type="button" className="btn-ghost text-xs" onClick={() => setShown(shown + PAGE)}>{t(`Show more (${rows.length - shown} left)`, `عرض المزيد (متبقٍ ${rows.length - shown})`)}</button></div>}
              </>}
              <p className="dp-cc-note px-4 pb-3" data-dp-ret-basis>{t("Credit notes are Sales Invoices marked as return; delivery returns are Delivery Notes marked as return. Exceptions are exact link facts: no original reference, a credit note whose native outstanding is still negative, or a submitted delivery return that no credit-note line points at. No GL, VAT or stock value is computed here.", "إشعارات الدائن هي فواتير مبيعات معلّمة كمرتجع، ومرتجعات التسليم أذونات تسليم معلّمة كمرتجع. الاستثناءات حقائق ربط دقيقة: بدون مرجع أصلي، أو إشعار دائن رصيده الأصلي ما زال سالبًا، أو مرتجع تسليم معتمد لا يشير إليه أي بند إشعار دائن. لا يُحسب هنا قيد أستاذ أو ضريبة أو قيمة مخزون.")}</p>
            </section>
          </>}
        </div>;
      }}
    </ProFrame>
  );
}

function Flags({ x }: { x: ReturnRow }) {
  const { t, b } = useBi();
  if (!x.flags.length) return <Chip tone="ok">{t("In order", "سليم")}</Chip>;
  return <span className="inline-flex flex-col items-start gap-1">{x.flags.map((f) => <Chip key={f} tone={FLAG_TONE[f]} data-dp-ret-flag={f}>{b(FLAG_LABEL[f])}</Chip>)}</span>;
}
