// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * SC-F-06 Receivables (/pro/receivables) and SC-F-07 Payables (/pro/payables) — RXP-01 insight-to-source register.
 * As-of aging segments filter the SAME invoice register and totals (one predicate), each row opens the native invoice,
 * the inspector lists native Payment Entries and the voucher's GL; Saved Views keep filters/columns per user.
 * Read-only except the pre-existing "Receive/Pay" action, which only opens a native draft Payment Entry.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import type React from "react";
import { adapter, type Doc } from "@/lib/adapter";
import { makePaymentEntry } from "@/lib/posting";
import { fmtCurrency } from "@/lib/format";
import { scopedList } from "@/lib/scope";
import { useLang } from "@/i18n";
import { DevOnly } from "@/components/DevOnly";
import { ReportDocLink, ReportPreviewScope } from "@/components/report/DocPreview";
import { Button } from "@/components/ui/button";
import { draftPaymentsFor } from "./paymentEntry";
import { aging, arRegister, balanceLines, currencyTotals, filterAr, segmentTotals, sideDoctype, sortAr, SEGMENTS, SEGMENTS_AR, CREDIT_SEGMENT, BUCKETS, type ArRow, type Side } from "./aging";
import { can, financeContext, slug, sourceStatus, todayIso } from "./finance";
import { ProFrame, SourceState } from "./ProFrame";
import { PaymentPriorities } from "./PaymentPriorities";
import { ApCalendar } from "./ApCalendar";
import { filterAp } from "./apCalendar";
import { SortTh, ViewToolbar, useRegister } from "./ViewToolbar";
import { AP_SPEC, AR_SPEC } from "./viewSpecs";
import type { Search } from "./savedViews";
import { DateInput } from "@/components/form/DateInput";
import { KPI_TILE, Meter } from "@/components/enterprise/kit";
import { OverdueTag } from "@/components/enterprise/StatusStrip";
import { InvoiceStatusSection, PartyRankCard, PartyScoreCard, UpcomingDueCard } from "./ArInsights";

export interface AgingSearch { company?: string | undefined; side?: string | undefined; party?: string | undefined; q?: string | undefined; overdue?: string | undefined; as_of?: string | undefined; bucket?: string | undefined; sel?: string | undefined; view?: string | undefined; cols?: string | undefined; sort?: string | undefined; density?: string | undefined; fs?: string | undefined; due_band?: string | undefined; ex?: string | undefined; st?: string | undefined }
export const AGING_KEYS = ["company", "side", "party", "q", "overdue", "as_of", "bucket", "sel", "view", "cols", "sort", "density", "fs", "due_band", "ex", "st"] as const;

const STATUS_AR: Record<string, string> = { Unpaid: "غير مدفوعة", "Partly paid": "مدفوعة جزئيًا", "Credit note": "إشعار دائن", "Unallocated credit": "رصيد دائن غير مخصص" };

export function AgingPro({ search, side: fixed }: { search: AgingSearch; side?: Side }) {
  const nav = useNavigate();
  const ar = useLang() === "ar"; const t = (en: string, arabic: string) => (ar ? arabic : en);
  const side: Side = fixed ?? (search.side === "payable" ? "payable" : "receivable");
  const route = side === "payable" ? "/pro/payables" : "/pro/receivables";
  const spec = side === "payable" ? AP_SPEC : AR_SPEC;
  const set = useCallback((p: Partial<AgingSearch> | Search) => void nav({ to: route, search: ((prev: AgingSearch) => ({ ...prev, ...p })) as never, replace: true }), [nav, route]);
  const reg = useRegister(spec, search as Search);
  return (
    <ProFrame title={side === "payable" ? "Accounts Payable" : "Accounts Receivable"} subtitle={side === "payable" ? "Supplier invoices to pay, by age and due date — from Core invoices." : "Customer invoices to collect, by age and due date — from Core invoices."} doctypes={side === "payable" ? ["GL Entry", "Payment Entry", "Purchase Order", "Purchase Receipt"] : ["GL Entry", "Payment Entry"]}>
      {({ user }) => {
        const ctx = financeContext(search.company, user);
        if (!ctx.companies.length) return <SourceState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} doctype="Company" />;
        const r = arRegister(side, ctx.company, search.as_of, user);
        const dt = sideDoctype(side);
        const partyLabel = side === "receivable" ? t("Customer", "العميل") : t("Supplier", "المورد");
        const money = (v: number, c = ctx.currency) => (c ? fmtCurrency(v, c) : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        // RXP-02: AP due window and review exception are further predicates on the same register (payables only)
        const ap = (xs: ArRow[]) => (side === "payable" ? filterAp(xs, search, r.asOf) : xs);
        const base = ap(filterAr(r.rows, search, true)); // every predicate except the selected segment → segment distribution
        const shared = filterAr(r.rows, search); // every aging predicate, before due window/exception → calendar distribution
        const rows = sortAr(ap(shared), reg.sort);
        const segs = segmentTotals(base);
        const totals = currencyTotals(rows);
        const maxSeg = Math.max(1, ...segs.map((s) => Math.abs(s.totals[0]?.amount ?? 0)));
        const sel = rows.find((x) => x.name === search.sel) ?? rows[0];
        const pes = sourceStatus("Payment Entry", user) === "ok" ? scopedList("Payment Entry", user) : [];
        const pay = (inv: string) => { const d = makePaymentEntry(dt, inv); void nav({ to: "/app/$app/$doctype/$name", params: { app: "erpnext", doctype: "payment_entry", name: d.name } }); };
        const filtered = !!(search.bucket || search.party || search.q || search.overdue || (side === "payable" && (search.due_band || search.ex)));
        const segLabel = (i: number) => (ar ? SEGMENTS_AR : SEGMENTS)[i]!;
        const legacy = aging(side, ctx.company, user); // pre-existing by-party aging (current balances) kept as secondary view
        const partyNames = new Map(r.rows.map((x) => [x.party, x.partyName] as const)); // display names from the same invoices; the code stays the key
        const nativeReport = side === "receivable" ? "Accounts Receivable" : "Accounts Payable";
        return <>
          <section className="dp-context" data-dp-context>
            <label className="dp-ctx-item"><span>{t("Company", "الشركة")}</span>
              <select className="field-input" value={ctx.company} onChange={(e) => set({ company: e.target.value, party: undefined, sel: undefined })} data-no-i18n data-dp-company>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="dp-ctx-item"><span>{t("As of", "بتاريخ")}</span>
              <DateInput className="field-input" value={r.asOf} max="9999-12-31" onChange={(e) => set({ as_of: e.target.value && e.target.value !== todayIso() ? e.target.value : undefined, sel: undefined })} data-dp-as-of /></label>
            <div className="dp-ctx-item"><span>{t("Currency", "العملة")}</span><b data-no-i18n>{ctx.currency || "—"}</b></div>
            <nav className="flex gap-1" aria-label={t("Side", "الجانب")}>
              <Link to="/pro/receivables" search={{ company: search.company } as never} className={`dp-chip ${side === "receivable" ? "dp-chip-on" : ""}`} aria-current={side === "receivable" ? "page" : undefined} data-dp-side="receivable">{t("Receivables", "الذمم المدينة")}</Link>
              <Link to="/pro/payables" search={{ company: search.company } as never} className={`dp-chip ${side === "payable" ? "dp-chip-on" : ""}`} aria-current={side === "payable" ? "page" : undefined} data-dp-side="payable">{t("Payables", "الذمم الدائنة")}</Link>
            </nav>
            <label className="dp-ctx-item"><span>{t("Search", "بحث")}</span><input className="field-input" value={search.q ?? ""} placeholder={side === "payable" ? t("Supplier or invoice", "المورد أو الفاتورة") : t("Customer or invoice", "العميل أو الفاتورة")} onChange={(e) => set({ q: e.target.value || undefined, sel: undefined })} data-dp-aging-q /></label>
            <label className="dp-ctx-item flex-row items-center gap-1"><input type="checkbox" checked={search.overdue === "1"} onChange={(e) => set({ overdue: e.target.checked ? "1" : undefined, sel: undefined })} data-dp-overdue-only /><span>{t("Overdue only", "المتأخرة فقط")}</span></label>
            <Link to="/report/$name" params={{ name: nativeReport }} search={{ company: ctx.company, report_date: r.asOf } as never} className="btn-ghost ms-auto" data-dp-native-report>{side === "receivable" ? t("Standard Accounts Receivable", "تقرير الذمم المدينة القياسي") : t("Standard Accounts Payable", "تقرير الذمم الدائنة القياسي")}</Link>
          </section>
          {(() => {
            // OWN-57: invoice outstanding, unallocated payments and the net balance — as the native receivable / payable report
            const b = balanceLines(side, r.rows, ctx.company, r.asOf, user, search.party);
            const peFilters = JSON.stringify([["company", "=", ctx.company], ["party_type", "=", side === "receivable" ? "Customer" : "Supplier"], ["docstatus", "=", "1"], ["unallocated_amount", ">", "0"], ...(search.party ? [["party", "=", search.party]] : [])]);
            // summary strip of the shared smart KPI cards (owner 2026-11-12 evening §11): one card per balance line, the net one emphasised
            const line = (k: string, label: string, v: number, sub: string, link?: React.ReactNode) => <div className={KPI_TILE} data-dp-ar-line={k} data-tone={k === "net" ? undefined : k === "unallocated" && v ? "warn" : undefined}>
              <span className="dp-cc-label">{label}</span>
              <span className={`dp-cc-value ${k === "net" ? "ent-title" : ""}`} data-no-i18n>{money(v)}</span>
              <span className="dp-cc-meta">{sub}{link && <> · {link}</>}</span></div>;
            return <section className="ek-list-kpis grid gap-3 sm:grid-cols-3" data-dp-ar-lines={b.status}>
              <>
                {line("outstanding", side === "receivable" ? t("Invoice outstanding", "المتبقي من الفواتير") : t("Invoices to pay", "فواتير مستحقة الدفع"), b.outstanding, t("Submitted invoices and credit notes", "الفواتير والإشعارات الدائنة المعتمدة"))}
                {line("unallocated", t("Unallocated payments", "دفعات غير مخصصة"), -b.unallocated, b.status === "ok" ? `${b.payments.length} ${t("payment entries", "سند دفع")}` : t("Payments not readable", "لا يمكن قراءة الدفعات"),
                  b.payments.length > 0 ? <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "payment_entry" }} search={{ filters: peFilters } as never} className="text-xs text-primary hover:underline" data-dp-ar-unallocated-open>{t("Open", "فتح")}</Link> : undefined)}
                {line("net", t("Net balance", "صافي الرصيد"), b.net, search.party ? t("This party", "هذا الطرف") : t("All parties", "كل الأطراف"))}
              </></section>;
          })()}

          <ViewToolbar spec={spec} search={search as Search} companies={ctx.companies} onApply={set} exporter={r.status !== "ok" ? undefined : { doctype: dt, filename: `${side}_${ctx.company}_${r.asOf}`, build: () => {
            const cols = reg.cols.filter((k) => k !== "action");
            const v = (x: ArRow, k: string): string | number => ({ party: x.partyName, invoice: x.name, posting_date: x.posting, due_date: x.due, days: x.days > 0 ? x.days : 0, outstanding: x.outstanding, currency: x.currency, bucket: segLabel(x.bucket), status: ar ? STATUS_AR[x.status] ?? x.status : x.status, source: [...x.orders, ...x.fulfilments].join(" ") } as Record<string, string | number>)[k] ?? "";
            return { columns: cols.map((k) => { const c = spec.columns.find((y) => y.key === k)!; return { fieldname: k, label: k === "party" ? partyLabel : ar ? c.ar : c.label }; }), rows: rows.map((x) => Object.fromEntries(cols.map((k) => [k, v(x, k)]))) }; } }} />

          {r.status !== "ok" ? <div className="mt-4 dp-card" data-dp-ar-state={r.status}>
            <SourceState status={r.status} doctype={r.doctype} />
            {r.reason === "gl" && <p className="text-xs text-muted-foreground">{t("A past as-of date needs read access to the General Ledger to take later payments back out. Current balances are not shown as historical.", "يتطلب التاريخ السابق صلاحية قراءة دفتر الأستاذ لاستبعاد المدفوعات اللاحقة. لا تُعرض الأرصدة الحالية كأرصدة تاريخية.")}</p>}
          </div> : <>
            <section className="ek-card ek-card-pad mt-4" aria-label={t("Aging distribution", "توزيع الأعمار")} data-dp-segments>
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-sm font-semibold">{t("Outstanding by age", "المستحق حسب العمر")}</h2>
                <span className="text-xs text-muted-foreground"><span>{t("As of", "بتاريخ")}</span> <bdi data-no-i18n>{r.asOf}</bdi> · <span>{t("Age = days past due date", "العمر = الأيام بعد تاريخ الاستحقاق")}</span> · <span>{t("Source", "المصدر")}</span>: <span>{dt === "Purchase Invoice" ? t("open balance of submitted purchase invoices", "الرصيد المتبقي في فواتير المشتريات المعتمدة") : t("open balance of submitted sales invoices", "الرصيد المتبقي في فواتير المبيعات المعتمدة")}{r.historical ? t(", less ledger entries after the date", "، مطروحًا منه قيود الأستاذ بعد التاريخ") : ""}</span><DevOnly> <bdi data-no-i18n>{dt}.outstanding_amount</bdi></DevOnly></span>
              </div>
              <div className="mt-2 grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                {segs.map((s) => { const on = search.bucket === String(s.bucket); const main = s.totals[0]; const tone = s.bucket >= 3 && s.bucket < CREDIT_SEGMENT ? "bad" : undefined;
                  return <button key={s.bucket} type="button" className="dp-seg" aria-pressed={on} disabled={!s.count && !on}
                    title={`${segLabel(s.bucket)} · ${s.count} ${t("invoices", "فواتير")} · ${s.totals.map((x) => money(x.amount, x.currency)).join(" + ") || "—"} · ${t("as of", "بتاريخ")} ${r.asOf}`}
                    onClick={() => set({ bucket: on ? undefined : String(s.bucket), sel: undefined, fs: search.fs })} data-dp-segment={s.bucket}>
                    <span className="text-xs text-muted-foreground">{segLabel(s.bucket)}</span>
                    {s.totals.length ? s.totals.map((x) => <span key={x.currency} className={`whitespace-nowrap text-base font-semibold tabular-nums ${tone && x.amount ? "text-destructive" : ""}`} data-no-i18n>{money(x.amount, x.currency)}</span>) : <span className="text-base font-semibold text-muted-foreground" data-no-i18n>—</span>}
                    <span className="text-[11px] text-muted-foreground"><bdi data-no-i18n>{s.count}</bdi> {t("invoices", "فواتير")}</span>
                    <Meter value={main?.amount ?? 0} max={maxSeg} tone={tone ? "risk" : "good"} />
                  </button>; })}
              </div>
              {!r.glChecked && <p className="mt-1 text-[11px] text-warning" data-dp-ar-glcheck>{t("Without General Ledger access, future-dated payments cannot be taken out; balances are the invoices' current outstanding amounts.", "بدون صلاحية دفتر الأستاذ لا يمكن استبعاد المدفوعات ذات التاريخ اللاحق؛ الأرصدة هي المبالغ المستحقة الحالية على الفواتير.")}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">{t("Select a segment to filter the invoices and totals below; select it again to clear. Not-yet-due and credit balances are never aged.", "اختر شريحة لتصفية الفواتير والإجماليات أدناه؛ واخترها مجددًا للإلغاء. غير المستحق والأرصدة الدائنة لا تُحتسب أعمارها.")}</p>
            </section>
            {side === "payable" && <ApCalendar base={shared} baseNoParty={filterAr(r.rows, { ...search, party: undefined })} asOf={r.asOf} today={todayIso()} company={ctx.company} party={search.party} band={search.due_band} ex={search.ex} user={user} ar={ar}
              onBand={(b) => set({ due_band: b, sel: undefined })} onEx={(e) => set({ ex: e, sel: undefined })} onParty={(p) => set({ party: p, sel: undefined })} />}

            {/* P3-04 ranked parties (payables: the supplier concentration card above) · P3-05 next 14 days · P3-03 payment score (selected party, else all) */}
            <div className="mt-4 grid gap-4 lg:grid-cols-2" data-dp-ar-insights>
              {side === "receivable" && <PartyRankCard rows={filterAr(r.rows, { ...search, party: undefined, bucket: undefined })} side={side} ar={ar} currency={ctx.currency || "SAR"} active={search.party} onParty={(p) => set({ party: p, sel: undefined })} />}
              <div className={side === "receivable" ? "grid content-start gap-4" : "contents"}>
                <UpcomingDueCard rows={filterAr(r.rows, { ...search, bucket: undefined })} side={side} ar={ar} currency={ctx.currency || "SAR"} />
                <PartyScoreCard side={side} company={ctx.company} party={search.party ?? ""} user={user} ar={ar} currency={ctx.currency || "SAR"} partyName={search.party ? partyNames.get(search.party) || search.party : undefined} />
              </div>
            </div>

            <ReportPreviewScope doctypes={[dt, side === "receivable" ? "Customer" : "Supplier"]}>
            <div className="mt-4 grid gap-4 2xl:grid-cols-12">
              <section className="ek-card ek-card-pad 2xl:col-span-8 min-w-0" data-dp-ar-register={rows.length}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{t("Invoices", "الفواتير")}</h2>
                  <span className="chip bg-muted tabular-nums" data-no-i18n>{rows.length}</span>
                  <span className="ms-auto text-xs text-muted-foreground" data-dp-ar-total>{t("Total outstanding", "إجمالي المستحق")}: {totals.length ? totals.map((x) => <b key={x.currency} className="ms-1 tabular-nums" data-no-i18n>{money(x.amount, x.currency)}</b>) : <b data-no-i18n>—</b>}</span>
                </div>
                {!rows.length ? <div className="dp-card" data-dp-ar-empty={filtered ? "filtered" : "none"}>
                  {filtered ? <><p className="text-sm">{t("No invoices match the active filters.", "لا توجد فواتير تطابق الفلاتر النشطة.")}</p>
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => set({ bucket: undefined, party: undefined, q: undefined, overdue: undefined, due_band: undefined, ex: undefined, fs: undefined })}>{t("Clear filters (company and date stay)", "مسح الفلاتر (تبقى الشركة والتاريخ)")}</Button></>
                    : <p className="text-sm text-muted-foreground">{side === "receivable" ? t("No open customer invoices on this date.", "لا توجد فواتير عملاء مفتوحة في هذا التاريخ.") : t("No open supplier invoices on this date.", "لا توجد فواتير موردين مفتوحة في هذا التاريخ.")}</p>}
                </div> : <div className="dp-reg max-h-[620px] overflow-auto" data-dp-ar-scroll>
                  <table>
                    <thead><tr>{reg.cols.map((k) => { const c = spec.columns.find((x) => x.key === k)!; return <SortTh key={k} k={k === "invoice" ? "invoice" : k} label={k === "party" ? partyLabel : ar ? c.ar : c.label} sort={reg.sort} sortable={spec.sorts.includes(k)} align={c.align} onSort={(s) => set({ sort: s })} />; })}</tr></thead>
                    <tbody>{rows.map((x) => { const on = sel?.name === x.name;
                      return <tr key={x.name} aria-selected={on} tabIndex={0} className={`cursor-pointer ${on ? "dp-row-on" : ""}`} onClick={() => set({ sel: x.name })} onKeyDown={(e) => { if (e.key === "Enter") set({ sel: x.name }); }} data-dp-ar-row={x.name} data-bucket={x.bucket}>
                        {reg.cols.map((k) => <Cell key={k} k={k} x={x} dt={dt} cell={reg.cell} money={money} segLabel={segLabel} ar={ar} pes={pes} pay={pay} side={side} t={t} />)}
                      </tr>; })}</tbody>
                    <tfoot><tr>{(() => { const oi = reg.cols.indexOf("outstanding"); const label = <>{t("Total", "الإجمالي")} · <bdi data-no-i18n>{rows.length}</bdi></>; const amt = totals.map((x) => <div key={x.currency} data-no-i18n>{money(x.amount, x.currency)}</div>);
                      if (oi < 0) return <td className={reg.cell} colSpan={reg.cols.length}>{label} · {amt}</td>;
                      return <>{oi > 0 && <td className={reg.cell} colSpan={oi}>{label}</td>}<td className={`${reg.cell} text-end tabular-nums`} data-dp-ar-foot>{amt}</td>{reg.cols.slice(oi + 1).map((k) => <td key={k} />)}</>; })()}</tr></tfoot>
                  </table>
                </div>}
              </section>
              <aside className="min-w-0 max-w-2xl 2xl:col-span-4 2xl:max-w-none"><Inspector row={sel} dt={dt} side={side} pes={pes} money={money} t={t} ar={ar} segLabel={segLabel} pay={pay} /></aside>
            </div>
            </ReportPreviewScope>

            <InvoiceStatusSection side={side} company={ctx.company} asOf={r.asOf} user={user} ar={ar} tab={search.st} onTab={(k) => set({ st: k })} party={search.party} currency={ctx.currency || "SAR"} />

            <section className="ek-card ek-card-pad mt-6" data-dp-parties>
              <h2 className="text-sm font-semibold">{side === "receivable" ? t("By customer — current balances", "حسب العميل — الأرصدة الحالية") : t("By supplier — current balances", "حسب المورد — الأرصدة الحالية")}</h2>
              {legacy.status !== "ok" ? <SourceState status={legacy.status} doctype={legacy.doctype} /> : !legacy.parties.length ? <SourceState status="empty" /> :
                <div className="dp-reg mt-2 max-h-[420px] overflow-auto"><table className="whitespace-nowrap">
                  <thead><tr><th className="px-3 py-2 text-start">{partyLabel}</th>{BUCKETS.map((b, i) => <th key={b} className="px-2 py-2 text-end">{segLabel(i)}</th>)}<th className="px-3 py-2 text-end">{t("Total outstanding", "إجمالي المستحق")}</th></tr></thead>
                  <tbody>{legacy.parties.map((p) => <tr key={p.party} tabIndex={0} className={`cursor-pointer ${search.party === p.party ? "dp-row-on" : ""}`} onClick={() => set({ party: search.party === p.party ? undefined : p.party, sel: undefined })} onKeyDown={(e) => { if (e.key === "Enter") set({ party: p.party, sel: undefined }); }} data-dp-party={p.party}>
                    <td className="px-3 py-2 font-medium" title={p.party} data-no-i18n><bdi>{partyNames.get(p.party) || p.party}</bdi>{partyNames.get(p.party) && partyNames.get(p.party) !== p.party ? <span className="ms-1.5 text-[11px] font-normal text-muted-foreground"><bdi>{p.party}</bdi></span> : null}</td>
                    {p.buckets.map((v, i) => <td key={i} className="px-2 py-2 text-end tabular-nums" data-no-i18n>{v ? money(v) : "—"}</td>)}
                    <td className="px-3 py-2 text-end font-semibold tabular-nums" data-no-i18n>{money(p.total)}</td></tr>)}</tbody>
                </table></div>}
              <p className="mt-1 text-[11px] text-muted-foreground">{t("Select a row to filter the invoice register by that party.", "اختر صفًا لتصفية سجل الفواتير حسب هذا الطرف.")}</p>
            </section>
            <PaymentPriorities side={side} company={ctx.company} user={user} />
          </>}
        </>;
      }}
    </ProFrame>
  );
}

type T = (en: string, ar: string) => string;
function Cell({ k, x, dt, cell, money, segLabel, ar, pes, pay, side, t }: { k: string; x: ArRow; dt: string; cell: string; money: (v: number, c?: string) => string; segLabel: (i: number) => string; ar: boolean; pes: Doc[]; pay: (inv: string) => void; side: Side; t: T }) {
  switch (k) {
    // owner GL-07: the party and the invoice open in the shared Connected Split View (document beside the register), as in the General Ledger
    case "party": return <td className={`${cell} max-w-[14rem] truncate whitespace-nowrap`} title={x.party}><span onClick={(e) => e.stopPropagation()} data-dp-open-party={x.party}>{x.party ? <ReportDocLink doctype={side === "receivable" ? "Customer" : "Supplier"} name={x.party}><bdi>{x.partyName}</bdi></ReportDocLink> : <bdi data-no-i18n>{x.partyName}</bdi>}</span></td>;
    case "invoice": return <td className={`${cell} whitespace-nowrap`}><span onClick={(e) => e.stopPropagation()} data-dp-open-invoice={x.name}><ReportDocLink doctype={dt} name={x.name}><bdi>{x.name}</bdi></ReportDocLink></span></td>;
    case "posting_date": return <td className={`${cell} whitespace-nowrap tabular-nums`} data-no-i18n>{x.posting}</td>;
    case "due_date": return <td className={`${cell} whitespace-nowrap tabular-nums`}><span className="inline-flex items-center gap-1.5"><bdi data-no-i18n>{x.due}</bdi>{x.outstanding > 0 && <OverdueTag days={x.days} ar={ar} />}</span></td>;
    case "days": return <td className={`${cell} text-end tabular-nums ${x.days > 0 ? "text-destructive" : "text-muted-foreground"}`} data-no-i18n>{x.days > 0 ? x.days : "—"}</td>;
    case "outstanding": return <td className={`${cell} whitespace-nowrap text-end font-medium tabular-nums ${x.outstanding < 0 ? "text-success-text" : ""}`} data-no-i18n>{money(x.outstanding, x.currency)}</td>;
    case "currency": return <td className={cell} data-no-i18n>{x.currency || "—"}</td>;
    case "bucket": return <td className={`${cell} whitespace-nowrap`}><span className={`chip text-[11px] ${x.bucket >= 3 && x.bucket < CREDIT_SEGMENT ? "bg-destructive/10 text-destructive" : x.bucket === CREDIT_SEGMENT ? "bg-success/15" : "bg-muted"}`}>{segLabel(x.bucket)}</span></td>;
    case "status": return <td className={`${cell} whitespace-nowrap text-xs`}>{ar ? STATUS_AR[x.status] : x.status}{x.onHold && <span className="chip ms-1 bg-warning/20 text-[10px]" data-dp-ap-hold={x.name}>{t("On hold", "موقوفة")}</span>}</td>;
    case "source": return <td className={`${cell} whitespace-nowrap text-xs`} onClick={(e) => e.stopPropagation()}><SourceLinks x={x} t={t} /></td>;
    case "action": {
      if (x.outstanding < 0) return <td className={`${cell} text-xs text-muted-foreground`}>{t("Allocate on the native Payment Reconciliation", "يُخصص عبر مطابقة الدفعات الأصلية")}</td>;
      if (x.onHold) return <td className={`${cell} whitespace-nowrap text-xs text-muted-foreground`} data-dp-hold-action={x.name}>{x.releaseDate ? <>{t("On hold until", "موقوفة حتى")} <bdi data-no-i18n>{x.releaseDate}</bdi></> : t("On hold — release on the invoice", "موقوفة — تُرفع من الفاتورة")}</td>;
      const drafts = draftPaymentsFor(dt, x.name, pes);
      return <td className={`${cell} whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
        {drafts.length ? <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "payment_entry", name: drafts[0]! }} className="chip bg-warning/20 hover:underline" data-dp-draft-pe={drafts[0]}><span>{t("Draft payment", "دفعة مسودة")}</span> <bdi data-no-i18n>{drafts[0]}</bdi></Link>
          : can("Payment Entry", "create") ? <button type="button" className="btn-ghost py-0.5 text-xs" onClick={() => pay(x.name)} data-dp-record-payment={x.name}>{side === "payable" ? t("Pay", "سداد") : t("Receive", "تحصيل")}</button>
          : <span className="text-xs text-muted-foreground">{t("View only", "عرض فقط")}</span>}
      </td>;
    }
    default: return <td className={cell} />;
  }
}

function Inspector({ row, dt, side, pes, money, t, ar, segLabel, pay }: { row: ArRow | undefined; dt: string; side: Side; pes: Doc[]; money: (v: number, c?: string) => string; t: T; ar: boolean; segLabel: (i: number) => string; pay: (inv: string) => void }) {
  if (!row) return <section className="dp-card" data-dp-ar-inspector="none"><h2 className="font-semibold">{t("Invoice details", "تفاصيل الفاتورة")}</h2><SourceState status="empty" /></section>;
  const doc = adapter.get(dt, row.name);
  const linked = pes.filter((p) => ((p["references"] as Doc[] | undefined) ?? []).some((r) => r["reference_name"] === row.name) && Number(p.docstatus) !== 2)
    .map((p) => ({ name: p.name, date: String(p["posting_date"] ?? ""), state: Number(p.docstatus) === 1 ? t("Submitted", "معتمد") : t("Draft", "مسودة"),
      amount: ((p["references"] as Doc[]).filter((r) => r["reference_name"] === row.name).reduce((s, r) => s + (Number(r["allocated_amount"]) || 0), 0)) }));
  const drafts = linked.filter((l) => l.state === t("Draft", "مسودة"));
  return (
    <section className="dp-card" data-dp-ar-inspector={row.name}>
      <div className="flex items-center gap-2"><h2 className="font-semibold">{t("Invoice details", "تفاصيل الفاتورة")}</h2><span className="chip bg-muted text-[11px]" data-no-i18n>{dt}</span></div>
      <p className="mt-1 text-lg font-semibold" data-no-i18n><bdi>{row.name}</bdi></p>
      <dl className="dp-dl mt-2 text-sm">
        <dt>{side === "receivable" ? t("Customer", "العميل") : t("Supplier", "المورد")}</dt><dd data-no-i18n>{row.partyName}</dd>
        <dt>{t("Invoice date", "تاريخ الفاتورة")}</dt><dd data-no-i18n>{row.posting}</dd>
        <dt>{t("Due date", "تاريخ الاستحقاق")}</dt><dd data-no-i18n>{row.due}</dd>
        <dt>{t("Age bucket", "فئة العمر")}</dt><dd>{segLabel(row.bucket)}{row.days > 0 && <span className="text-destructive" data-no-i18n> · +{row.days}</span>}</dd>
        <dt>{t("Invoice total", "إجمالي الفاتورة")}</dt><dd className="tabular-nums" data-no-i18n>{money(row.grand, row.currency)}</dd>
        <dt>{t("Outstanding on as-of date", "المستحق في تاريخ الاحتساب")}</dt><dd className="font-semibold tabular-nums" data-no-i18n>{money(row.outstanding, row.currency)}</dd>
        {Math.abs(row.adjusted) >= 0.005 && <><dt>{t("Movements after as-of date", "حركات بعد تاريخ الاحتساب")}</dt><dd className="tabular-nums" data-dp-inspector-adjusted data-no-i18n>{money(row.adjusted, row.currency)}</dd></>}
        <dt>{t("Payment status", "حالة السداد")}</dt><dd>{ar ? STATUS_AR[row.status] : row.status}</dd>
        {row.onHold && <><dt>{t("Hold", "الإيقاف")}</dt><dd data-dp-inspector-hold><span>{row.releaseDate ? t("Until", "حتى") : t("No release date", "بدون تاريخ رفع")}</span> {row.releaseDate && <bdi data-no-i18n>{row.releaseDate}</bdi>}{row.holdNote && <span className="block text-xs text-muted-foreground" data-no-i18n>{row.holdNote}</span>}</dd></>}
        {side === "payable" && <><dt>{t("Source documents", "المستندات المصدر")}</dt><dd data-dp-inspector-sources><SourceLinks x={row} t={t} /></dd></>}
        <dt>{t("Native status", "الحالة الأصلية")}</dt><dd>{String(doc?.["status"] ?? "—")}</dd>
        <dt>{t("Company", "الشركة")}</dt><dd data-no-i18n>{row.company}</dd>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(dt), name: row.name }} className="btn-primary" data-dp-inspector-open>{t("Open invoice", "فتح الفاتورة")}</Link>
        <Link to="/pro/general-ledger" search={{ voucher_no: row.name, company: row.company, from: side === "receivable" ? "receivables" : "payables" } as never} className="btn-ghost" data-dp-inspector-gl>{t("General Ledger", "دفتر الأستاذ")}</Link>
        {row.outstanding > 0 && !row.onHold && !drafts.length && can("Payment Entry", "create") && <button type="button" className="btn-ghost" onClick={() => pay(row.name)} data-dp-inspector-pay>{side === "payable" ? t("Pay", "سداد") : t("Receive payment", "تحصيل دفعة")}</button>}
      </div>
      <h3 className="mt-4 text-sm font-semibold">{t("Payment entries", "قيود الدفع")}</h3>
      {!linked.length ? <p className="text-xs text-muted-foreground">{t("No payment entry references this invoice.", "لا يوجد قيد دفع يشير إلى هذه الفاتورة.")}</p> :
        <ul className="mt-1 divide-y divide-border text-sm">{linked.map((l) => <li key={l.name} className="flex items-center gap-2 py-1" data-dp-inspector-pe={l.name}>
          <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "payment_entry", name: l.name }} className="flex-1 truncate hover:underline" data-no-i18n><bdi>{l.name}</bdi></Link>
          <span className="text-xs text-muted-foreground" data-no-i18n>{l.date}</span><span className="text-xs">{l.state}</span>
          <span className="tabular-nums text-xs" data-no-i18n>{money(l.amount, row.currency)}</span></li>)}</ul>}
      <p className="mt-3 text-[11px] text-muted-foreground">{t("Payments are created and allocated only on the native Payment Entry; nothing is posted from this screen.", "تُنشأ الدفعات وتُخصص فقط في قيد الدفع الأصلي؛ لا يُرحّل شيء من هذه الشاشة.")}</p>
    </section>
  );
}

/** Native PO / Purchase Receipt links from the invoice's own item rows (opened in their native forms, which re-check permission). */
function SourceLinks({ x, t }: { x: ArRow; t: T }) {
  if (!x.orders.length && !x.fulfilments.length) return <span className="text-muted-foreground">{x.isReturn ? t("Return", "مرتجع") : t("None", "لا يوجد")}</span>;
  const link = (dt: string, name: string) => <Link key={`${dt}:${name}`} to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(dt), name }} className="chip bg-accent hover:underline" data-dp-ap-source={name} data-no-i18n><bdi>{name}</bdi></Link>;
  return <span className="inline-flex flex-nowrap gap-1">{x.orders.map((n) => link("Purchase Order", n))}{x.fulfilments.map((n) => link("Purchase Receipt", n))}</span>;
}
