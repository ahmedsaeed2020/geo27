// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * Section-specific panels for the business section workspaces. Each reuses existing source-connected DIGIT Pro logic
 * (AR/AP register, cash position, close blockers, fulfilment, quotation comparison, supplier reliability, stock
 * sources, asset lifecycle/depreciation) — no second engine, no new ledger logic. Every panel is isolated by a
 * SourceBoundary so one failing source never blanks the section page.
 */
import { useState, type ReactNode } from "react";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { useNavigate } from "@tanstack/react-router";
import { adapter } from "@/lib/adapter";
import { fmtCurrency } from "@/lib/format";
import { scopedList } from "@/lib/scope";
import { currencyTotals, filterAr, segmentTotals, SEGMENTS, SEGMENTS_AR, type ArRow, type Side } from "./aging";
import { cashAccounts, cashPosition, type Bi } from "./command";
import { QuickLink } from "@/components/enterprise/QuickView";
import { sourceStatus, todayIso } from "./finance";
import { SourceBoundary, SourceState } from "./ProFrame";
import { NavText } from "./ProSidebar";
import { AgingInsight } from "./ArInsight";
import { PaymentPriorities } from "./PaymentPriorities";
import { CloseBlockers } from "./CloseBlockers";
import { FinanceExceptionReview } from "./FinanceExceptionReview";
import { DimensionReview } from "./DimensionReview";
import { FlowQueues, Fulfilment, QuoteCompare } from "./FlowQueues";
import { PICK_PACK_SHIP } from "./flowStages";
import { SalesBridgePanel } from "./SalesBridgePanel";
import { StockExposure } from "./StockExposure";
import { Heatmap, type InventorySearch, type Measure } from "./InventoryPro";
import { DepreciationChart, DepreciationQueue, LifecycleTimeline } from "./AssetLifecycle";
import { assetWorkspace } from "./assetWorkspace";
import { depreciationLifecycle, lifecycleStages } from "./assetLifecycle";
import { supplierReliability } from "./supplierReliability";
import { postedStockSources } from "./stockSources";
import { ExpiryTimelinePanel } from "./InventoryPanels";
import { BookTaxPanel, MaintenanceCalendarPanel, RepairVsNbvPanel } from "./AssetClosurePanels";
import { dueFilter, duesRegister, listDrill, partyMix, type ExtraId, type SectionCtx, type SectionSpec } from "./sections";
import { bi, SecLink, SecState, type SectionSearch } from "./SectionLink";
import { amountFigure, KpiStrip, type StripItem, KPI_TILE, Meter } from "@/components/enterprise/kit";
import type { SectionPage } from "./nav";

type P = { page: SectionPage; spec: SectionSpec; ctx: SectionCtx; user: string; ar: boolean; search: SectionSearch; set: (p: Partial<SectionSearch>) => void; folded?: boolean | undefined };
const OVERVIEW: Partial<Record<ExtraId, (p: P) => ReactNode>> = {
  dues: (p) => <DuesOverview {...p} />,
  cash: (p) => <CashOverview {...p} />,
  // white working surface (owner enterprise UI goal 2026-10-21): the warm canvas stays outside, the review block sits on a card
  close: (p) => <div className="mt-3 rounded-[10px] border border-border bg-card px-4 pb-4 pt-1 shadow-sm" data-dp-surface="close-blockers"><CloseBlockers company={p.ctx.company} from={p.ctx.monthFrom} to={p.ctx.asOf} user={p.user} ar={p.ar} /></div>,
  "sel-fulfil": (p) => <ReviewLinks p={p} links={[["/pro/delivered-not-billed", ["Delivered, not billed — line review", "مُسلّم غير مفوتر — مراجعة البنود"]], ["/pro/selling-overview", ["Selling command center", "مركز قيادة المبيعات"]]]} />,
  "sel-intel": (p) => <><AgingInsight side="receivable" company={p.ctx.company} currency={p.ctx.currency} user={p.user} /><div className="mt-4"><SalesBridgePanel ctx={p.ctx} user={p.user} ar={p.ar} /></div></>,
  "customer-mix": (p) => <PartyMixPanel p={p} doctype="Sales Invoice" />,
  "pur-receive": (p) => <ReviewLinks p={p} links={[["/pro/received-not-billed", ["Received, not billed — line review", "مستلم غير مفوتر — مراجعة البنود"]], ["/pro/payables", ["Payables register", "سجل الذمم الدائنة"]]]} />,
  supplier: (p) => <><SupplierReliabilityPanel {...p} /><PartyMixPanel p={p} doctype="Purchase Invoice" /></>,
  "inv-heat": (p) => <InvHeat {...p} />,
  "stock-exposure": (p) => <StockExposure company={p.ctx.company} currency={p.ctx.currency} asOn={p.ctx.asOf} user={p.user} />,
  "stock-sources": (p) => <StockSourcesPanel {...p} />,
  "inv-expiry": (p) => <ExpiryTimelinePanel asOf={p.ctx.asOf} user={p.user} />,
  "asset-life": (p) => <AssetLifePanel {...p} />,
  "asset-dep": (p) => <AssetDepOverview {...p} />,
  "asset-books": (p) => <BookTaxPanel company={p.ctx.company} currency={p.ctx.currency} user={p.user} />,
  "asset-service": (p) => <><MaintenanceCalendarPanel company={p.ctx.company} asOf={p.ctx.asOf} user={p.user} /><RepairVsNbvPanel company={p.ctx.company} currency={p.ctx.currency} user={p.user} /></>,
};
const WORK: Partial<Record<ExtraId, (p: P) => ReactNode>> = {
  dues: (p) => <DuesWork {...p} />,
  cash: (p) => <ReviewLinks p={p} links={[["/pro/bank-reconciliation", ["Bank Reconciliation — match statement lines", "التسوية البنكية — مطابقة حركات الكشف"]], ["/pro/payments", ["Payments register", "سجل المدفوعات"]]]} />,
  close: (p) => <><FinanceExceptionReview company={p.ctx.company} from={p.ctx.monthFrom} to={p.ctx.asOf} user={p.user} /><DimensionReview company={p.ctx.company} from={p.ctx.monthFrom} to={p.ctx.asOf} user={p.user} /></>,
  "ops-review": (p) => <FinanceExceptionReview company={p.ctx.company} from={p.ctx.monthFrom} to={p.ctx.asOf} user={p.user} />,
  "sel-fulfil": (p) => <><FlowQueues defs={PICK_PACK_SHIP} company={p.ctx.company} currency={p.ctx.currency} user={p.user} title="Pick → pack → ship" /><Fulfilment doctype="Sales Order" company={p.ctx.company} currency={p.ctx.currency} user={p.user} /></>,
  "sel-intel": (p) => <PaymentPriorities side="receivable" company={p.ctx.company} user={p.user} />,
  "pur-quotes": (p) => <QuoteCompare company={p.ctx.company} currency={p.ctx.currency} user={p.user} />,
  "pur-orders": (p) => <Fulfilment doctype="Purchase Order" company={p.ctx.company} currency={p.ctx.currency} user={p.user} />,
  "pur-receive": (p) => <PaymentPriorities side="payable" company={p.ctx.company} user={p.user} />,
  "asset-dep": (p) => <AssetDepWork {...p} />,
};
/** Extras that carry their own headline KPI band render above the generic KPIs; analysis panels render after KPIs and charts. */
const LEAD = new Set<ExtraId>(["dues", "cash"]);
const pick = (s: SectionSpec, part: "lead" | "rest") => (s.extra ?? []).filter((x) => OVERVIEW[x] && LEAD.has(x) === (part === "lead"));
export const hasOverviewExtra = (s: SectionSpec, part: "lead" | "rest" = "rest") => pick(s, part).length > 0;
export const hasWorkExtra = (s: SectionSpec) => !!s.extra?.some((x) => WORK[x]);
export function ExtraOverview(p: P & { part: "lead" | "rest" }) { return <>{pick(p.spec, p.part).map((x) => <SourceBoundary key={x} title={x} resetKey={`${p.ctx.company}-${p.ctx.asOf}`}><div data-dp-section-extra={x}>{OVERVIEW[x]!(p)}</div></SourceBoundary>)}</>; }
export function ExtraWork(p: P) { return <>{p.spec.extra?.filter((x) => WORK[x]).map((x) => <SourceBoundary key={x} title={x} resetKey={`${p.ctx.company}-${p.ctx.asOf}`}><div data-dp-section-extra-work={x}>{WORK[x]!(p)}</div></SourceBoundary>)}</>; }

function ReviewLinks({ p, links }: { p: P; links: [string, Bi][] }) {
  // a white framed card like every other block of the page (owner presentation rule), never bare chips on the canvas
  return <section className="ek-card" data-dp-review-links><header className="ek-card-head"><h3 className="ek-h3">{p.ar ? "مراجعة البنود" : "Line reviews"}</h3></header>
    <ul className="dp-cc-chips ek-card-body">{links.map(([to, l]) => <li key={to}><SecLink drill={{ kind: "pro", to, search: { company: p.ctx.company } }} page={p.page} className="dp-cc-chip" data-dp-review-link={to}><span>{bi(p.ar, l)}</span><span className="ms-auto text-primary">{p.ar ? "←" : "→"}</span></SecLink></li>)}</ul></section>;
}

/* ------------------------------------------------------------------ INV-MASTER ------------------------------------------------------------------ */
/** The Inventory command center's warehouse × item-group heatmap (same selector, same Stock Balance drills); a row/column
 *  name opens the command center focused on that warehouse or group instead of changing this section's filters. */
function InvHeat({ ctx, user, ar }: P) {
  const [measure, setMeasure] = useState<Measure>("positions");
  const nav = useNavigate();
  const focus = (f: Partial<InventorySearch>) => void nav({ to: "/pro/inventory-overview", search: { company: ctx.company, ...f } as never });
  return <Heatmap company={ctx.company} currency={ctx.currency} user={user} f={{}} measure={measure} ar={ar} onMeasure={setMeasure} onPick={focus} />;
}

/* ------------------------------------------------------------------ ACC-DUES ------------------------------------------------------------------ */

const STATUS: Record<string, Bi> = { Unpaid: ["Unpaid", "غير مدفوعة"], "Partly paid": ["Partly paid", "مدفوعة جزئيًا"], "Credit note": ["Credit note", "إشعار دائن"], "Unallocated credit": ["Unallocated credit", "رصيد دائن غير مخصص"] };
const segLabel = (i: number, ar: boolean) => (ar ? SEGMENTS_AR : SEGMENTS)[i]!;
const sideOf = (v: string | undefined): Side => (v === "payable" ? "payable" : "receivable");
const SIDE: Record<Side, { label: Bi; party: Bi; register: string }> = {
  receivable: { label: ["Receivables", "الذمم المدينة"], party: ["Customer", "العميل"], register: "/pro/receivables" },
  payable: { label: ["Payables", "الذمم الدائنة"], party: ["Supplier", "المورد"], register: "/pro/payables" },
};
function Money({ totals, currency }: { totals: { currency: string; amount: number }[]; currency: string }) {
  if (!totals.length) return <span data-no-i18n>{fmtCurrency(0, currency)}</span>;
  return <>{totals.map((x) => <bdi key={x.currency} className="me-2 block tabular-nums" data-no-i18n>{fmtCurrency(x.amount, x.currency || currency)}</bdi>)}</>;
}

/** The six dues headline cards (receivables / payables: outstanding, overdue, due in 7 days) as indicator tiles. */
function duesTiles({ ctx, user, ar, set }: P): StripItem[] {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const regs = { receivable: duesRegister("receivable", ctx, user), payable: duesRegister("payable", ctx, user) };
  const card = (side: Side, id: string, label: Bi, due: string | undefined, tone?: "risk" | "attention"): StripItem => {
    const reg = regs[side];
    const rows = dueFilter(reg.rows, due, ctx.asOf);
    const totals = currencyTotals(rows);
    const go = () => set({ tab: "documents", side, bucket: undefined, q: undefined, due });
    if (reg.status !== "ok") return { key: `dues:${id}`, node: <div key={id} className="ek-kpi" data-dp-dues-kpi={id} data-status={reg.status}><span className="ek-kpi-head"><span className="ek-kpi-label">{bi(ar, label)}</span></span><span className="ek-kpi-state"><SecState status={reg.status} doctype={reg.doctype} /></span></div> };
    return { key: `dues:${id}`, figures: [totals.length === 1 ? amountFigure(totals[0]!.amount) : undefined], node: <button key={id} type="button" onClick={go} className="ek-kpi text-start" data-dp-dues-kpi={id} {...(tone && rows.length ? { "data-tone": tone } : {})} title={t("Show the invoices", "عرض الفواتير")}>
      <span className="ek-kpi-head"><span className="ek-kpi-label">{bi(ar, label)}</span></span>
      <span className="ek-kpi-main"><span className="ek-kpi-value" data-no-i18n><Money totals={totals.slice(0, 1)} currency={ctx.currency} /></span></span>
      <span className="ek-kpi-sub">{totals.length > 1 && <><bdi data-no-i18n><Money totals={totals.slice(1)} currency={ctx.currency} /></bdi> · </>}<bdi data-no-i18n>{rows.length}</bdi> {t("invoices", "فاتورة")} · {t("as of", "حتى")} <bdi data-no-i18n>{reg.asOf}</bdi></span>
    </button> };
  };
  return [
    card("receivable", "ar", ["Receivables outstanding", "الذمم المدينة القائمة"], undefined),
    card("receivable", "ar-overdue", ["Overdue receivables", "ذمم مدينة متأخرة"], "overdue", "risk"),
    card("receivable", "ar-7", ["Customers due in 7 days", "مستحق من العملاء خلال 7 أيام"], "next7"),
    card("payable", "ap", ["Payables outstanding", "الذمم الدائنة القائمة"], undefined),
    card("payable", "ap-overdue", ["Overdue payables", "ذمم دائنة متأخرة"], "overdue", "attention"),
    card("payable", "ap-7", ["Supplier payments due in 7 days", "مستحق للموردين خلال 7 أيام"], "next7"),
  ];
}
function DuesOverview(p: P) {
  const { ctx, user, ar, set, folded } = p;
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const regs = { receivable: duesRegister("receivable", ctx, user), payable: duesRegister("payable", ctx, user) };
  return <div className="space-y-4">
    {!folded && <div data-dp-dues-kpis><KpiStrip items={duesTiles(p)} ar={ar} /></div>}
    <div className="dp-cc-split dp-cc-split-even">
      {(["receivable", "payable"] as Side[]).map((side) => <AgeingPanel key={side} side={side} rows={regs[side].rows} status={regs[side].status} doctype={regs[side].doctype} ctx={ctx} ar={ar} onPick={(b) => set({ tab: "documents", side, bucket: String(b), q: undefined, due: undefined })} />)}
    </div>
    <p className="text-xs text-muted-foreground" data-dp-dues-basis>{t("Open balances use each invoice's outstanding amount; for past dates, later ledger payments are taken back out. Credits are shown separately and currencies are never mixed.", "الأرصدة المفتوحة من المبلغ القائم لكل فاتورة؛ وللتواريخ السابقة تُستبعد مدفوعات الأستاذ اللاحقة. الأرصدة الدائنة تُعرض منفصلة ولا تُخلط العملات.")}</p>
  </div>;
}

function AgeingPanel({ side, rows, status, doctype, ctx, ar, onPick }: { side: Side; rows: ArRow[]; status: string; doctype: string; ctx: SectionCtx; ar: boolean; onPick: (b: number) => void }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const segs = segmentTotals(rows);
  const main = (s: (typeof segs)[number]) => s.totals.find((x) => x.currency === ctx.currency || !x.currency)?.amount ?? 0;
  const max = Math.max(1, ...segs.map((s) => Math.abs(main(s))));
  const others = [...new Set(rows.map((r) => r.currency).filter((c) => c && c !== ctx.currency))];
  return <section className="dp-cc-panel" data-dp-ageing={side}>
    <header className="dp-cc-panel-h"><h3>{t(`${SIDE[side].label[0]} ageing`, `تقادم ${SIDE[side].label[1]}`)}</h3><span className="dp-cc-note"><NavText label={doctype} /> · {t("click a bucket to list its invoices", "اختر فئة لعرض فواتيرها")}</span></header>
    <div className="dp-cc-panel-b">
      {status !== "ok" ? <SecState status={status as "denied" | "unavailable"} doctype={doctype} />
        : !rows.length ? <SecState status="empty" doctype={doctype} />
        : <div className="dp-cc-bars">{segs.map((s) => {
          const v = main(s); const w = s.count ? Math.max(3, Math.round((Math.abs(v) / max) * 100)) : 0;
          return <button key={s.bucket} type="button" className="dp-cc-bar text-start hover:bg-accent" onClick={() => onPick(s.bucket)} disabled={!s.count} data-dp-ageing-bucket={`${side}:${s.bucket}`}>
            <span className="truncate">{segLabel(s.bucket, ar)}</span>
            <Meter value={w} max={100} tone={s.bucket >= 3 && s.bucket < 5 ? "risk" : s.bucket === 5 ? "neutral" : s.bucket >= 1 ? "attention" : "good"} />
            <span className="text-xs tabular-nums" data-no-i18n>{fmtCurrency(v, ctx.currency)} <span className="text-muted-foreground">· {s.count}</span></span>
          </button>;
        })}</div>}
      {others.length > 0 && <p className="mt-2 text-[11px] text-muted-foreground">{t("Bars show", "الأعمدة تعرض")} <bdi data-no-i18n>{ctx.currency}</bdi>; {t("other currencies are listed with their invoices:", "العملات الأخرى تظهر مع فواتيرها:")} <bdi data-no-i18n>{others.join(", ")}</bdi></p>}
    </div>
  </section>;
}

function DuesWork(p: P) {
  const { page, ctx, user, ar, search, set } = p;
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const side = sideOf(search.side);
  const reg = duesRegister(side, ctx, user);
  const due = search.due;
  const scoped = dueFilter(reg.rows, due, ctx.asOf);
  const base = filterAr(scoped, { q: search.q }, true);
  const rows = filterAr(base, { bucket: search.bucket, q: search.q }).sort((a, b) => b.days - a.days || b.outstanding - a.outstanding || a.name.localeCompare(b.name));
  const segs = segmentTotals(base);
  const bucket = search.bucket !== undefined && search.bucket !== "" ? Number(search.bucket) : undefined;
  const DUE: Record<string, Bi> = { overdue: ["Overdue", "متأخرة"], next7: ["Due in 7 days", "مستحقة خلال 7 أيام"], next30: ["Due in 30 days", "مستحقة خلال 30 يومًا"] };
  const registerSearch: Record<string, string | undefined> = { company: ctx.company, as_of: ctx.asOf, bucket: search.bucket || undefined, q: search.q || undefined, overdue: due === "overdue" ? "1" : undefined, fs: "drill" };
  return <div className="space-y-4">
    <section className="dp-cc-panel" data-dp-dues-work={side}>
      <header className="dp-cc-panel-h flex-wrap">
        <div className="dp-cc-tabs" role="tablist" aria-label={t("Side", "الجانب")}>
          {(["receivable", "payable"] as Side[]).map((s) => <button key={s} type="button" role="tab" aria-selected={side === s} className="dp-cc-tab" onClick={() => set({ side: s, bucket: undefined, due: undefined })} data-dp-dues-side={s}>{bi(ar, SIDE[s].label)}</button>)}
        </div>
        <input type="search" className="input h-8 w-full max-w-[16rem] text-sm" placeholder={t("Search party or invoice", "ابحث بالطرف أو الفاتورة")} defaultValue={search.q ?? ""} key={`${side}-${search.q ?? ""}`}
          onKeyDown={(e) => { if (e.key === "Enter") set({ q: (e.target as HTMLInputElement).value || undefined }); }} onBlur={(e) => { if ((e.target.value || undefined) !== search.q) set({ q: e.target.value || undefined }); }} aria-label={t("Search party or invoice", "ابحث بالطرف أو الفاتورة")} data-dp-dues-search />
        {reg.status === "ok" && <SecLink drill={{ kind: "pro", to: SIDE[side].register, search: registerSearch }} page={page} className="ms-auto text-xs text-primary hover:underline" data-dp-dues-register>{t("Open the full register with these filters", "فتح السجل الكامل بنفس المرشحات")}</SecLink>}
      </header>
      <div className="dp-cc-panel-b space-y-3">
        {reg.status !== "ok" ? <SecState status={reg.status} doctype={reg.doctype} /> : <>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("Ageing bucket", "فئة التقادم")} data-dp-dues-buckets>
            <button type="button" className={`chip inline-flex gap-1 text-xs ${bucket === undefined ? "bg-primary text-primary-foreground" : "bg-muted"}`} aria-pressed={bucket === undefined} onClick={() => set({ bucket: undefined })} data-dp-dues-bucket="all">{t("All", "الكل")} <bdi data-no-i18n>{base.length}</bdi></button>
            {segs.map((s) => <button key={s.bucket} type="button" disabled={!s.count} className={`chip inline-flex gap-1 text-xs ${bucket === s.bucket ? "bg-primary text-primary-foreground" : "bg-muted"} disabled:opacity-50`} aria-pressed={bucket === s.bucket} onClick={() => set({ bucket: String(s.bucket) })} data-dp-dues-bucket={s.bucket}>{segLabel(s.bucket, ar)} <bdi data-no-i18n>{s.count}</bdi></button>)}
            {due && <button type="button" className="chip bg-warning/15 text-xs" onClick={() => set({ due: undefined })} data-dp-dues-due={due}>{bi(ar, DUE[due] ?? [due, due])} ✕</button>}
            {(bucket !== undefined || search.q || due) && <button type="button" className="text-xs text-primary hover:underline" onClick={() => set({ bucket: undefined, q: undefined, due: undefined })} data-dp-dues-clear>{t("Clear filters", "مسح المرشحات")}</button>}
          </div>
          {!rows.length ? <SecState status="empty" doctype={reg.doctype} /> : <div className="overflow-x-auto"><EntTable id="pro-section-dues" wrap views={false}><table className="dp-cc-table" data-dp-dues-table>
            <thead><tr><th><NavText label={reg.doctype} /></th><th>{bi(ar, SIDE[side].party)}</th><th>{t("Posting date", "تاريخ الترحيل")}</th><th>{t("Due date", "تاريخ الاستحقاق")}</th><th>{t("Days overdue", "أيام التأخير")}</th><th>{t("Status", "الحالة")}</th><th className="text-end">{t("Outstanding", "الرصيد القائم")}</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.name} data-dp-dues-row={r.name} data-bucket={r.bucket}>
              <td><SecLink drill={{ kind: "doc", doctype: reg.doctype, name: r.name }} page={page} className="font-medium text-primary hover:underline" data-dp-doc-link={r.name}><bdi data-no-i18n>{r.name}</bdi></SecLink>{r.onHold && <span className="chip ms-1 bg-warning/15 text-[10px]">{t("On hold", "موقوفة")}</span>}</td>
              <td className="max-w-[14rem] truncate"><bdi data-no-i18n>{r.partyName}</bdi></td>
              <td className="whitespace-nowrap" data-no-i18n>{r.posting}</td>
              <td className="whitespace-nowrap" data-no-i18n>{r.due}</td>
              <td className={`whitespace-nowrap tabular-nums ${r.days > 60 ? "text-destructive" : ""}`} data-no-i18n>{r.days > 0 ? r.days : "—"}</td>
              <td className="whitespace-nowrap">{bi(ar, STATUS[r.status] ?? [r.status, r.status])}</td>
              <td className="whitespace-nowrap text-end tabular-nums" data-no-i18n>{fmtCurrency(r.outstanding, r.currency || ctx.currency)}</td>
            </tr>)}</tbody>
            <tfoot><tr><td colSpan={6} className="font-semibold">{t("Total", "الإجمالي")} · <bdi data-no-i18n>{rows.length}</bdi></td><td className="text-end font-semibold" data-dp-dues-total><Money totals={currencyTotals(rows)} currency={ctx.currency} /></td></tr></tfoot>
          </table></EntTable></div>}
          <p className="text-[11px] text-muted-foreground">{side === "receivable" ? t("To record a receipt, open the invoice and use Create → Payment; the balance here updates after the payment is submitted.", "لتسجيل القبض افتح الفاتورة واختر إنشاء ← دفع؛ يتحدث الرصيد هنا بعد اعتماد الدفعة.") : t("To pay, open the invoice and use Create → Payment; invoices on hold cannot be paid until released.", "للسداد افتح الفاتورة واختر إنشاء ← دفع؛ الفواتير الموقوفة لا تُسدد حتى يُرفع الإيقاف.")}</p>
        </>}
      </div>
    </section>
    <PaymentPriorities side={side} company={ctx.company} user={user} />
  </div>;
}

/* ------------------------------------------------------------------ ACC-CASH ------------------------------------------------------------------ */
function cashTile({ page, ctx, user, ar }: P): StripItem {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const c = cashPosition(ctx.company, user, ctx.asOf);
  const label = t("Cash & bank balance (posted ledger)", "رصيد النقد والبنوك (الأستاذ المرحّل)");
  return c.status === "ok"
    ? { key: "cash:position", figures: [amountFigure(c.value)], node: <SecLink key="cash" drill={{ kind: "pro", to: "/pro/general-ledger", search: { company: ctx.company, to_date: ctx.asOf } }} page={page} className="ek-kpi" data-dp-cash-position title={t("Open the General Ledger", "فتح دفتر الأستاذ")}>
      <span className="ek-kpi-head"><span className="ek-kpi-label">{label}</span></span>
      <span className="ek-kpi-main"><span className="ek-kpi-value" data-no-i18n>{fmtCurrency(c.value ?? 0, ctx.currency)}</span></span>
      <span className="ek-kpi-sub"><bdi data-no-i18n>{c.accounts}</bdi> {t("bank and cash accounts", "حسابات بنك ونقدية")} · {t("as of", "حتى")} <bdi data-no-i18n>{ctx.asOf}</bdi></span></SecLink> }
    : { key: "cash:position", node: <div key="cash" className="ek-kpi" data-dp-cash-position data-status={c.status}><span className="ek-kpi-head"><span className="ek-kpi-label">{label}</span></span><span className="ek-kpi-state"><SecState status={c.status as "denied" | "unavailable"} doctype="GL Entry" /></span></div> };
}
/** Lead tiles of a section's lead extras (dues headline cards, cash position) for the page's one indicator row. */
export function extraLeadTiles(p: P): StripItem[] { return pick(p.spec, "lead").flatMap((x) => (x === "dues" ? duesTiles(p) : x === "cash" ? [cashTile(p)] : [])); }
function CashOverview(p: P) {
  const { page, ctx, user, ar, folded } = p;
  if (folded) return <CashAccounts page={page} ctx={ctx} user={user} ar={ar} />;
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const c = cashPosition(ctx.company, user, ctx.asOf);
  return <div className="dp-cc-signals" data-dp-cash>
    {c.status === "ok" ? <SecLink drill={{ kind: "pro", to: "/pro/general-ledger", search: { company: ctx.company, to_date: ctx.asOf } }} page={page} className={KPI_TILE} data-dp-cash-position>
      <span className="dp-cc-label">{t("Cash & bank balance (posted ledger)", "رصيد النقد والبنوك (الأستاذ المرحّل)")}</span>
      <span className="dp-cc-value" data-no-i18n>{fmtCurrency(c.value ?? 0, ctx.currency)}</span>
      <span className="dp-cc-meta"><bdi data-no-i18n>{c.accounts}</bdi> {t("bank and cash accounts", "حسابات بنك ونقدية")} · {t("as of", "حتى")} <bdi data-no-i18n>{ctx.asOf}</bdi></span>
      <span className="dp-cc-open">{t("Open the General Ledger", "فتح دفتر الأستاذ")} {ar ? "←" : "→"}</span>
    </SecLink> : <div className={KPI_TILE} data-dp-cash-position data-status={c.status}><span className="dp-cc-label">{t("Cash & bank balance (posted ledger)", "رصيد النقد والبنوك (الأستاذ المرحّل)")}</span><SecState status={c.status === "empty" ? "empty" : c.status} doctype="GL Entry" /></div>}
    <CashAccounts page={page} ctx={ctx} user={user} ar={ar} />
  </div>;
}

/** OWN-14: every bank and cash account in one place — balance, last-30-day movements, unreconciled bank lines and the way to reconcile. */
function CashAccounts({ page, ctx, user, ar }: Pick<P, "page" | "ctx" | "user" | "ar">) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const r = cashAccounts(ctx.company, user, ctx.asOf);
  if (r.status !== "ok" || !r.rows.length) return null;
  const money = (v: number) => fmtCurrency(v, ctx.currency);
  return <section className="dp-cc-panel w-full" data-dp-cash-accounts={r.rows.length}>
    <header className="dp-cc-panel-h"><h3>{t("Bank and cash accounts", "حسابات البنوك والنقدية")}</h3><span className="dp-cc-badge" data-no-i18n>{r.rows.length}</span>
      <span className="dp-cc-note">{t("Posted balance, movements in the last 30 days and lines waiting for reconciliation", "الرصيد المرحّل وحركة آخر 30 يومًا والحركات بانتظار التسوية")}</span></header>
    <div className="overflow-x-auto"><EntTable id="pro-section-bank" wrap><table className="w-full text-sm">
      <thead><tr className="text-start text-xs text-muted-foreground">
        <th className="px-3 py-2 text-start font-medium">{t("Account", "الحساب")}</th><th className="px-3 py-2 text-end font-medium">{t("Balance", "الرصيد")}</th>
        <th className="hidden px-3 py-2 text-end font-medium sm:table-cell">{t("In (30 days)", "وارد (30 يومًا)")}</th><th className="hidden px-3 py-2 text-end font-medium sm:table-cell">{t("Out (30 days)", "صادر (30 يومًا)")}</th>
        <th className="hidden px-3 py-2 text-start font-medium md:table-cell">{t("Last movement", "آخر حركة")}</th><th className="px-3 py-2 text-start font-medium">{t("Reconciliation", "التسوية")}</th></tr></thead>
      <tbody>{r.rows.map((x) => <tr key={x.account} className="border-t border-border" data-dp-cash-account={x.account} data-balance={x.balance}>
        <td className="px-3 py-2"><QuickLink doctype="Account" name={x.account} className="font-medium text-foreground hover:underline" /> <span className="dp-cc-badge ms-1">{x.type === "Cash" ? t("Cash", "نقدية") : t("Bank", "بنك")}</span></td>
        <td className="px-3 py-2 text-end font-semibold tabular-nums" data-no-i18n>{money(x.balance)}</td>
        <td className="hidden px-3 py-2 text-end tabular-nums sm:table-cell" data-no-i18n>{x.inflow30 ? money(x.inflow30) : "—"}</td>
        <td className="hidden px-3 py-2 text-end tabular-nums sm:table-cell" data-no-i18n>{x.outflow30 ? money(x.outflow30) : "—"}</td>
        <td className="hidden px-3 py-2 md:table-cell"><SecLink drill={{ kind: "pro", to: "/pro/general-ledger", search: { company: ctx.company, account: x.account, to_date: ctx.asOf } }} page={page} className="text-primary hover:underline" data-dp-cash-gl><bdi data-no-i18n>{x.lastDate || "—"}</bdi></SecLink></td>
        <td className="px-3 py-2">{x.type === "Cash" || !x.bankAccounts.length ? <span className="text-xs text-muted-foreground">{x.type === "Cash" ? t("Not needed for cash", "لا تلزم للنقدية") : t("No bank account linked", "لا يوجد حساب بنكي مرتبط")}</span>
          : x.bankAccounts.map((b) => <SecLink key={b} drill={{ kind: "pro", to: "/pro/bank-reconciliation", search: { company: ctx.company, account: b } }} page={page} className="me-2 inline-flex items-center gap-1 text-primary hover:underline" data-dp-cash-reconcile={b}>
            {x.unreconciled === null ? t("Reconcile", "تسوية") : x.unreconciled ? <>{t("Reconcile", "تسوية")} <span className="dp-cc-badge" data-tone="warn" data-no-i18n>{x.unreconciled}</span></> : t("Reconciled", "مسوّى")}</SecLink>)}</td>
      </tr>)}</tbody>
    </table></EntTable></div>
  </section>;
}

/* ------------------------------------------------------------------ Party mix ------------------------------------------------------------------ */
function PartyMixPanel({ p, doctype }: { p: P; doctype: "Sales Invoice" | "Purchase Invoice" }) {
  const { page, ctx, user, ar } = p;
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const r = partyMix(doctype, ctx.company, ctx.from12, ctx.asOf, user);
  const sales = doctype === "Sales Invoice";
  return <section className="dp-cc-panel" data-dp-party-mix={doctype}>
    <header className="dp-cc-panel-h"><h3>{sales ? t("Customer contribution — last 12 months", "مساهمة العملاء — آخر 12 شهرًا") : t("Supplier spend — last 12 months", "الإنفاق على الموردين — آخر 12 شهرًا")}</h3><span className="dp-cc-note"><NavText label={doctype} /> · {t("submitted, excluding returns", "معتمدة بدون المرتجعات")}</span></header>
    <div className="dp-cc-panel-b space-y-4">
      {r.status !== "ok" ? <SecState status={r.status} doctype={doctype} /> : !r.mixes.length ? <SecState status="empty" doctype={doctype} /> : r.mixes.map((m) => <div key={m.currency}>
        <p className="mb-2 text-xs text-muted-foreground"><bdi data-no-i18n>{m.currency}</bdi> · {t("total", "الإجمالي")} <bdi className="font-semibold text-foreground" data-no-i18n>{fmtCurrency(m.total, m.currency)}</bdi> · <bdi data-no-i18n>{m.parties}</bdi> {sales ? t("customers", "عملاء") : t("suppliers", "موردين")}</p>
        <div className="dp-cc-bars">{m.top.map((x) => <SecLink key={x.party} drill={x.drill} page={page} className="dp-cc-bar" data-dp-party={x.party}>
          <span className="truncate"><bdi data-no-i18n>{x.name}</bdi></span>
          <Meter value={x.share} max={1} minPct={3} tone={x.share >= 0.4 ? "attention" : "good"} />
          <span className="text-xs tabular-nums" data-no-i18n>{fmtCurrency(x.amount, m.currency)} · {(x.share * 100).toFixed(1)}%</span>
        </SecLink>)}</div>
        {m.others > 0 && <p className="mt-1 text-[11px] text-muted-foreground">{t("Others", "الآخرون")}: <bdi data-no-i18n>{fmtCurrency(m.others, m.currency)}</bdi></p>}
      </div>)}
    </div>
  </section>;
}

/* ------------------------------------------------------------------ PUR-SUPPLIER ------------------------------------------------------------------ */
function SupplierReliabilityPanel({ page, ctx, user, ar }: P) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const r = supplierReliability(ctx.company, user);
  return <section className="dp-cc-panel" data-dp-supplier-reliability>
    <header className="dp-cc-panel-h"><h3>{t("Supplier delivery reliability", "التزام الموردين بالتسليم")}</h3><span className="dp-cc-note">{t("Receipt date vs the order's promised date", "تاريخ الاستلام مقابل التاريخ الموعود في الأمر")}</span></header>
    <div className="dp-cc-panel-b overflow-x-auto p-0">
      {r.status !== "ok" ? <div className="px-4"><SecState status={r.status} doctype="Purchase Receipt" /></div> : !r.rows.length ? <div className="px-4"><SecState status="empty" doctype="Purchase Receipt" /></div> : <EntTable id="pro-section-receipts" wrap><table className="dp-cc-table">
        <thead><tr><th><NavText label="Supplier" /></th><th className="text-end">{t("Lines", "البنود")}</th><th className="text-end">{t("On time", "في الموعد")}</th><th className="text-end">{t("Late", "متأخر")}</th><th className="text-end">{t("Avg. delay (days)", "متوسط التأخير (أيام)")}</th></tr></thead>
        <tbody>{r.rows.map((x) => <tr key={x.supplier} data-dp-reliability-row={x.supplier}>
          <td><SecLink drill={listDrill("Purchase Receipt", [["company", "=", ctx.company], ["docstatus", "=", 1], ["supplier", "=", x.supplier]])} page={page} className="text-primary hover:underline"><bdi data-no-i18n>{x.supplier}</bdi></SecLink></td>
          <td className="text-end tabular-nums" data-no-i18n>{x.matched}</td>
          <td className={`text-end tabular-nums ${x.onTimePct < 80 ? "text-destructive" : ""}`} data-no-i18n>{x.onTimePct.toFixed(0)}%</td>
          <td className="text-end tabular-nums" data-no-i18n>{x.late}</td>
          <td className="text-end tabular-nums" data-no-i18n>{x.avgDelayDays ? x.avgDelayDays.toFixed(1) : "—"}</td>
        </tr>)}</tbody>
      </table></EntTable>}
      {r.status === "ok" && (r.excludedNoSchedule > 0 || r.excludedNoPoLink > 0) && <p className="px-4 py-2 text-[11px] text-muted-foreground">{t("Excluded", "مستبعد")}: <bdi data-no-i18n>{r.excludedNoSchedule}</bdi> {t("lines without a promised date", "بنود بدون تاريخ موعود")} · <bdi data-no-i18n>{r.excludedNoPoLink}</bdi> {t("lines without an order link", "بنود بدون ربط بأمر شراء")}</p>}
    </div>
  </section>;
}

/* ------------------------------------------------------------------ INV-REPORT ------------------------------------------------------------------ */
function StockSourcesPanel({ page, ctx, user, ar }: P) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const posted = postedStockSources(ctx.company, user);
  const ledger = posted.status === "ok" ? posted.rows.filter((e) => String(e["posting_date"] ?? "") <= ctx.asOf).reduce((s, e) => s + (Number(e["stock_value_difference"]) || 0), 0) : null;
  const binStatus = sourceStatus("Bin", user);
  const whs = new Set(adapter.list("Warehouse").filter((w) => w["company"] === ctx.company).map((w) => w.name));
  const bin = binStatus === "ok" ? scopedList("Bin", user).filter((b) => whs.has(String(b["warehouse"] ?? ""))).reduce((s, b) => s + (Number(b["stock_value"]) || 0), 0) : null;
  const diff = ledger !== null && bin !== null ? Math.round((ledger - bin) * 100) / 100 : null;
  const cell = (label: Bi, v: number | null, st: string, to: string, hint: Bi, id: string) => v === null
    ? <div className={KPI_TILE} data-dp-stock-source={id} data-status={st}><span className="dp-cc-label">{bi(ar, label)}</span><SourceState status={st as "denied" | "unavailable"} /></div>
    : <SecLink drill={{ kind: "pro", to, search: { company: ctx.company } }} page={page} className={KPI_TILE} data-dp-stock-source={id}>
      <span className="dp-cc-label">{bi(ar, label)}</span><span className="dp-cc-value" data-no-i18n>{fmtCurrency(v, ctx.currency)}</span><span className="dp-cc-meta">{bi(ar, hint)}</span>
      <span className="dp-cc-open">{t("Open the source report", "فتح تقرير المصدر")} {ar ? "←" : "→"}</span></SecLink>;
  return <div className="space-y-2">
    <div className="dp-cc-signals">
      {cell(["Posted stock value (Stock Ledger)", "قيمة المخزون المرحّلة (دفتر المخزون)"], ledger, posted.status, "/pro/stock-ledger", ["Sum of stock value change on posted, non-cancelled ledger rows up to the as-of date", "مجموع تغير القيمة في قيود المخزون المرحّلة غير الملغاة حتى التاريخ"], "ledger")}
      {cell(["Quantity snapshot value (Bin)", "قيمة لقطة الكميات"], bin, binStatus, "/pro/stock-balance", ["Current stock value held on Bin rows of the company's warehouses", "قيمة المخزون الحالية في سجلات الكميات لمستودعات الشركة"], "bin")}
      {diff !== null && <SecLink drill={{ kind: "pro", to: "/pro/stock-value-reconciliation", search: { company: ctx.company, ...(ctx.asOf !== todayIso() ? { as_of: ctx.asOf } : {}) } }} page={page} className={KPI_TILE} data-dp-stock-source="diff" {...(Math.abs(diff) >= 0.01 ? { "data-tone": "warn" } : {})}>
        <span className="dp-cc-label">{t("Difference between the two sources", "الفرق بين المصدرين")}</span>
        <span className="dp-cc-value" data-no-i18n>{fmtCurrency(diff, ctx.currency)}</span>
        <span className="dp-cc-meta">{Math.abs(diff) >= 0.01 ? t("Disclosed, not adjusted — investigate at the source documents; the posting engine stays the only writer.", "مُفصح عنه دون تعديل — تحقق من مستندات المصدر؛ يبقى محرك الترحيل هو الكاتب الوحيد.") : t("Sources agree", "المصدران متطابقان")}</span>
      <span className="dp-cc-open">{t("Open the reconciliation", "فتح المطابقة")} {ar ? "←" : "→"}</span></SecLink>}
    </div>
  </div>;
}

/* ------------------------------------------------------------------ Fixed assets ------------------------------------------------------------------ */
function AssetLifePanel({ ctx, user }: P) {
  if (sourceStatus("Asset", user) !== "ok") return <SecState status={sourceStatus("Asset", user) as "denied" | "unavailable"} doctype="Asset" />;
  const scope = { company: ctx.company, asof: ctx.asOf };
  const w = assetWorkspace(scope, user); const stages = lifecycleStages(w, scope);
  // LifecycleTimeline is already a titled panel ("Asset lifecycle"); wrapping it in a second titled panel showed the
  // heading twice (audit G04). The marker stays on a plain wrapper so existing hooks still find the extra.
  return <div data-dp-asset-life><LifecycleTimeline stages={stages} currency={ctx.currency} /></div>;
}
function useDep(ctx: SectionCtx, user: string) {
  const scope = { company: ctx.company, asof: ctx.asOf };
  const w = assetWorkspace(scope, user);
  return depreciationLifecycle(w, scope, user);
}
function AssetDepOverview({ ctx, user, ar }: P) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  if (sourceStatus("Asset", user) !== "ok") return <SecState status={sourceStatus("Asset", user) as "denied" | "unavailable"} doctype="Asset" />;
  const d = useDep(ctx, user);
  const states: [keyof typeof d.totals, Bi, string | undefined][] = [["due", ["Due, not booked", "مستحق غير مقيد"], "bad"], ["verified", ["Booked and verified in the ledger", "مقيد ومتحقق في الأستاذ"], undefined], ["reference", ["Journal reference — posting not verified", "مرجع قيد — الترحيل غير متحقق"], "warn"], ["upcoming", ["Scheduled next 90 days", "مجدول خلال 90 يومًا"], undefined]];
  return <div className="space-y-4">
    <div className="dp-cc-signals" data-dp-dep-kpis>{states.map(([k, l, tone]) => <div key={k} className={KPI_TILE} data-dp-dep-state={k} {...(tone && d.totals[k] ? { "data-tone": tone } : {})}>
      <span className="dp-cc-label">{bi(ar, l)}</span><span className="dp-cc-value" data-no-i18n>{fmtCurrency(d.totals[k], ctx.currency)}</span>
      <span className="dp-cc-meta"><bdi data-no-i18n>{d.rows.filter((r) => r.state === k).length}</bdi> {t("schedule rows", "بنود جدولة")}</span>
    </div>)}</div>
    <section className="dp-cc-panel"><header className="dp-cc-panel-h"><h3>{t("Scheduled vs booked depreciation", "الإهلاك المجدول مقابل المقيد")}</h3><span className="dp-cc-note">{t("Posted = submitted Journal Entry with readable, non-cancelled GL rows", "المرحّل = قيد يومية معتمد بقيود أستاذ مقروءة وغير ملغاة")}</span></header>
      <div className="dp-cc-panel-b"><DepreciationChart d={d} currency={ctx.currency} asof={ctx.asOf} /></div></section>
  </div>;
}
function AssetDepWork({ ctx, user }: P) {
  if (sourceStatus("Asset", user) !== "ok") return <SecState status={sourceStatus("Asset", user) as "denied" | "unavailable"} doctype="Asset" />;
  const d = useDep(ctx, user);
  return <DepreciationQueue d={d} currency={ctx.currency} company={ctx.company} asof={ctx.asOf} />;
}
