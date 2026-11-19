// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * SC-S-01 Selling Command Center (/pro/selling-overview, EC-R1 Phase 4). A quote-to-cash rail whose five stages keep
 * their own bases (never added into a funnel), an action worklist of exact native documents, a monthly invoiced /
 * returns / orders-booked trend, receivables concentration and order fulfilment — all read-only over native Core
 * selling records (sellingCommand.ts). Every stage, row, bar and customer opens the records behind it.
 */
import { blockWindow } from "@/lib/dashboards/registry";
import { DeptOverview, bandFacts } from "./DeptOverview";
import { AgingHeat, RatioGauge } from "./richBlocks";
import { ChartCard, ContextStrip, GroupedColumns, LINK_CHIP, LinkGroup, money, moneyShort, monthLabel, Meter } from "@/components/enterprise/kit";
import { QueueWork, proWrap } from "./ProKit";
import { Link, useNavigate } from "@tanstack/react-router";
import { adapter } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { fmtCurrency } from "@/lib/format";
import { translateTo, useLang } from "@/i18n";
import { hasPerm } from "@/lib/session";
import { useScopeMetas } from "@/lib/scope";
import { financeContext, slug, sourceStatus, todayIso } from "./finance";
import { ProFrame, SourceState } from "./ProFrame";
import { Fulfilment } from "./FlowQueues";
import { sellingOverview, type SellingDoc } from "./sellingPro";
import { OperationalPriorities } from "./OperationalPriorities";
import { useNavResolver } from "./ProSidebar";
import { targetHref, type NavItem } from "./nav";
import { freshness, proDrill, roleLabel } from "./command";
import { bi, DrillLink, drillNav, sevLabel, SevDot, Totals } from "./CommandUi";
import { customerConcentration, monthDrill, SELL_TABS, sellingRail, sellingTrend, sellingWork, type RailStage, type SellTab } from "./sellingCommand";

export interface SellingSearch { company?: string | undefined; wl?: string | undefined }

const SELL_DTS = ["Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "Payment Entry", "Customer", "GL Entry", "Account", "Company"];
const QUICK = ["Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "Payment Entry"];
const QUICK_AR: Record<string, string> = { Quotation: "عرض سعر", "Sales Order": "أمر بيع", "Delivery Note": "إذن تسليم", "Sales Invoice": "فاتورة بيع", "Payment Entry": "سند دفع" };
const REPORTS: NavItem[] = [
  { label: "Sales Analytics", target: { kind: "pro", to: "/pro/sales-analytics" } },
  { label: "Order Fulfilment", target: { kind: "pro", to: "/pro/order-fulfilment" } },
  { label: "Quotation Pipeline", target: { kind: "pro", to: "/pro/quotation-pipeline" } },
  { label: "Delivered not billed", target: { kind: "pro", to: "/pro/delivered-not-billed" } },
  { label: "Returns & Credit Notes", target: { kind: "pro", to: "/pro/sales-returns" } },
  { label: "Customer 360", target: { kind: "pro", to: "/pro/customer-360" } },
  { label: "Collections", target: { kind: "pro", to: "/pro/collections" } },
  { label: "Receivables", target: { kind: "pro", to: "/pro/receivables" } },
  ...["Accounts Receivable", "Sales Order Analysis", "Sales Register", "Gross Profit", "Customer Ledger Summary"].map((report) => ({ label: report, target: { kind: "report" as const, report } })),
];
const REPORT_AR: Record<string, string> = { "Order Fulfilment": "تنفيذ أوامر البيع", "Quotation Pipeline": "مسار عروض الأسعار", "Returns & Credit Notes": "المرتجعات وإشعارات الدائن", "Customer 360": "ملف العميل 360", "Sales Analytics": "تحليلات المبيعات", "Delivered not billed": "مسلّم غير مفوتر", Collections: "التحصيل", Receivables: "الذمم المدينة" };
const TAB_LABEL: Record<SellTab, [string, string]> = { quotes: ["Expiring quotations", "عروض تنتهي"], late: ["Late orders", "أوامر متأخرة"], unbilled: ["Delivered, not invoiced", "مسلّم غير مفوتر"], collect: ["Overdue collections", "تحصيلات متأخرة"], returns: ["Returns to review", "مرتجعات للمراجعة"] };
const EMPTY: Record<SellTab, [string, string]> = { quotes: ["No open quotation expires in the next 7 days.", "لا يوجد عرض مفتوح ينتهي خلال 7 أيام."], late: ["No order line is past its delivery date.", "لا يوجد بند أمر تجاوز تاريخ التسليم."], unbilled: ["Every delivered line is invoiced.", "كل البنود المسلّمة مفوترة."], collect: ["No receivable is overdue.", "لا توجد ذمم متأخرة."], returns: ["No draft return is waiting.", "لا توجد مرتجعات مسودة بانتظار المراجعة."] };
const PRIORITY: SellTab[] = ["late", "unbilled", "collect", "quotes", "returns"];

export function SellingPro({ search }: { search: SellingSearch }) {
  const nav = useNavigate();
  const r = useNavResolver();
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en);
  useScopeMetas(SELL_DTS);
  const set = (p: Partial<SellingSearch>) => void nav({ to: "/pro/selling-overview", search: (prev: SellingSearch) => ({ ...prev, ...p }) as never, replace: true });
  return (
    <ProFrame bare title={t("Selling Command Center", "مركز قيادة المبيعات")} tabs={false} doctypes={SELL_DTS}>
      {({ user }) => {
        const ctx = financeContext(search.company, user);
        if (!ctx.companies.length) return <SourceState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} doctype="Company" />;
        const today = todayIso();
        const quick = QUICK.filter((x) => { const m = cachedMeta(x); return m && r.appOf(x) && hasPerm(m, "create"); });
        const create = (dt: string) => { const m = cachedMeta(dt); const app = r.appOf(dt); if (!m || !app || !hasPerm(m, "create")) return; const doc = adapter.insert(m); void nav({ to: "/app/$app/$doctype/$name", params: { app, doctype: slug(dt), name: doc.name } }); };
        const stages = sellingRail(ctx.company, ctx.currency, user, today);
        const work = sellingWork(ctx.company, ctx.currency, user, today);
        const tab: SellTab = (SELL_TABS as string[]).includes(search.wl ?? "") ? (search.wl as SellTab) : PRIORITY.find((x) => work.find((w) => w.tab === x)?.items.length) ?? "unbilled";
        const reports = REPORTS.filter((i) => r.state(i) === "ok");
        const extra = [
          { id: "fulfil", label: t("Order fulfilment", "تنفيذ الأوامر"), attrs: { "data-dp-sell-tab": "fulfil" }, content: <div data-dp-sell-fulfil><Fulfilment doctype="Sales Order" company={ctx.company} currency={ctx.currency} user={user} /></div> },
          { id: "priorities", label: t("Sales priorities", "أولويات المبيعات"), attrs: { "data-dp-sell-tab": "priorities" }, content: <OperationalPriorities company={ctx.company} user={user} /> },
          { id: "status", label: t("Orders by status & recent", "الأوامر حسب الحالة والأحدث"), attrs: { "data-dp-sell-tab": "status" }, content: <StatusAndRecent company={ctx.company} currency={ctx.currency} user={user} ar={ar} /> },
        ];
        const active = extra.some((x) => x.id === search.wl) ? search.wl! : tab;
        const contract = new Set(["Accounts Receivable", "Sales Order Analysis", "Sales Register", "Gross Profit", "Customer Ledger Summary", "Sales Analytics"]);
        return <div className="dp-cc dp-cc-sell" data-dp-screen="SELL">
          <DeptOverview dept="selling" boards={["selling"]} company={ctx.company} currency={ctx.currency} user={user} ar={ar} skipInsights={["SEL.SALES_TREND"]}
            context={(question) => <div data-dp-context><ContextStrip icon={<img src="/icons/digit/mod/digit-mod-sales-light.svg" alt="" className="h-7 w-7" />}
              eyebrow={t("DIGIT Pro · Selling", "ديجيت برو · المبيعات")} title={t("Selling Command Center", "مركز قيادة المبيعات")} sub={question}
              facts={[{ label: t("As of", "حتى تاريخ"), value: <bdi data-no-i18n>{today}</bdi> }, { label: t("Last change", "آخر تعديل"), value: <bdi data-no-i18n>{freshness(SELL_DTS, user) || "—"}</bdi> }, { label: t("Role", "الدور"), value: <bdi data-no-i18n>{roleLabel(user)}</bdi> }, ...bandFacts(ar, ctx.currency)]}
              aside={<label className="ek-context-select"><span>{t("Company", "الشركة")}</span><select value={ctx.company} onChange={(e) => set({ company: e.target.value, wl: undefined })} data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>}
              actions={<span className="contents" data-dp-sell-quick>{quick.map((dt) => <button key={dt} type="button" className="ek-context-btn" onClick={() => create(dt)} data-dp-quick={dt}>+ {ar ? QUICK_AR[dt] : dt}</button>)}
                <Link to="/pro/$dept" params={{ dept: "selling" }} className="ek-context-btn">{t("Selling workspace", "مساحة عمل المبيعات")}</Link></span>} /></div>}
            charts={[<SellTrend key="trend" company={ctx.company} currency={ctx.currency} user={user} today={today} ar={ar} />, <Concentration key="conc" company={ctx.company} currency={ctx.currency} user={user} today={today} ar={ar} />]}
            rows={[
              { id: "gauge-collection", title: ["Collected of invoiced", "المحصّل من المفوتر"], w: 4, period: true, node: (o) => { const w = blockWindow(o, today); return <RatioGauge kind="collection" company={ctx.company} currency={ctx.currency} user={user} ar={ar} from={w?.from} to={w?.to} />; } },
              { id: "heat-receivable", title: ["Customers × ageing", "العملاء × أعمار الديون"], w: 8, node: <AgingHeat side="receivable" company={ctx.company} currency={ctx.currency} user={user} ar={ar} /> },
            ]}
            stripTitle={["Quote to cash", "من العرض إلى التحصيل"]}
            strip={<section className="ek-card" data-dp-sell-rail-panel><header className="ek-card-head"><div className="min-w-0"><h3 className="ek-h3">{t("Quote to cash", "من العرض إلى التحصيل")}</h3>
              <p className="ek-card-sub">{t("Each stage measures something different, so stages are not added together or read as a conversion rate.", "كل مرحلة تقيس شيئًا مختلفًا، لذا لا تُجمع المراحل ولا تُقرأ كنسبة تحويل.")}</p></div></header><div className="ek-card-body"><Rail stages={stages} ar={ar} /></div></section>}
            work={<div data-dp-sell-worklist={active}><QueueWork id="sell-work" title={t("Selling worklist", "قائمة عمل المبيعات")} ar={ar} currency={ctx.currency} registerAttr="data-dp-sell-register" active={active} onTab={(wl) => set({ wl })} extra={extra}
              queues={work.map((w) => ({ id: w.tab, label: TAB_LABEL[w.tab], status: w.status, empty: EMPTY[w.tab], register: w.register, attrs: { "data-dp-sell-tab": w.tab },
                rows: w.items.map((i) => ({ key: i.key, severity: i.severity, doctype: i.doctype, name: i.name, party: i.party, state: i.state, next: i.next, meta: i.value || i.date, amount: i.amount, currency: i.currency, drill: i.drill, attrs: { "data-dp-sell-row": i.key } })) }))} /></div>}
            links={reports.length > 0 && <LinkGroup id="sell-reports" title={t("Selling reports", "تقارير المبيعات")}>{reports.filter((i) => !contract.has(i.label)).map((i) => { const h = targetHref(i.target, r.appOf)!;
              return <Link key={i.label} to={h.to as never} params={h.params as never} search={{ company: ctx.company } as never} className={LINK_CHIP} data-dp-resource={i.label}>{ar && REPORT_AR[i.label] ? REPORT_AR[i.label] : translateTo(i.label, ar ? "ar" : "en")}</Link>; })}</LinkGroup>} />
        </div>;
      }}
    </ProFrame>
  );
}

/** S2 — quote-to-cash rail: a numbered progress line, one column per stage, each opening its exact register. */
function Rail({ stages, ar }: { stages: RailStage[]; ar: boolean }) {
  const t = (en: string, a: string) => (ar ? a : en);
  return <ol className="dp-cc-rail" data-dp-sell-rail>
    {stages.map((st, i) => {
      const ok = st.status === "ok";
      const body = <>
        <span className="dp-cc-stage-n" aria-hidden data-no-i18n>{i + 1}</span>
        <span className="dp-cc-stage-c">
          <span className="dp-cc-stage-l">{bi(ar, st.label)}</span>
          {!ok ? <SourceState status={st.status === "ok" ? "empty" : st.status} /> : <>
            <span className="dp-cc-stage-v"><bdi className="tabular-nums" data-no-i18n>{st.count}</bdi> <small>{bi(ar, st.unit)}</small></span>
            <span className="dp-cc-stage-t">{st.id === "delivery" ? (st.qty ? <><bdi data-no-i18n>{st.qty}</bdi> {t("lines to invoice", "بنود للفوترة")}</> : "—") : <Totals totals={st.totals} />}</span>
            <span className="dp-cc-note">{bi(ar, st.measure)}</span>
            {st.sub && <span className="dp-cc-stage-sub" data-tone={st.subTone}>{bi(ar, st.sub)}</span>}
            <span className="dp-cc-open">{t("Next", "التالي")}: {bi(ar, st.next)}</span>
          </>}
        </span>
      </>;
      return <li key={st.id} className="min-w-0">{ok
        ? <DrillLink drill={st.drill} className="dp-cc-stage" data-dp-stage={st.id} data-count={st.count} data-tone={st.subTone}>{body}</DrillLink>
        : <div className="dp-cc-stage" data-dp-stage={st.id} data-state={st.status}>{body}</div>}</li>;
    })}
  </ol>;
}

/** S4 — six months of invoiced sales, returns (separate) and orders booked, company currency; each bar opens its exact month list. */
function SellTrend({ company, currency, user, today, ar }: { company: string; currency: string; user: string; today: string; ar: boolean }) {
  const t = (en: string, a: string) => (ar ? a : en);
  const tr = sellingTrend(company, user, today);
  const ms = tr.status === "ok" ? tr.months : [];
  return <ChartCard id="sell-trend" size="md" title={t("Invoiced, returns and orders booked", "المفوتر والمرتجعات والأوامر المحجوزة")} sub={t("Company currency; orders booked are by order date and are not revenue.", "بعملة الشركة؛ الأوامر المحجوزة حسب تاريخ الأمر وليست إيرادًا.")}
    action={<Link to="/pro/sales-analytics" search={{ company, fs: "drill" } as never} data-dp-sell-analytics>{t("Sales Analytics", "تحليلات المبيعات")}</Link>} attrs={{ "data-dp-sell-trend": "" }}>
    {tr.status !== "ok" ? <SourceState status={tr.status} doctype="Sales Invoice" /> : <GroupedColumns ar={ar} wrap={proWrap} fmt={money(currency)} axisFmt={moneyShort(currency)} height={170}
      groups={ms.map((m) => ({ key: m.month, label: monthLabel(m.month, ar) }))}
      series={[
        { label: t("Invoiced", "المفوتر"), values: ms.map((m) => m.invoiced), drills: ms.map((m) => (m.invoices ? monthDrill("Sales Invoice", company, m) : undefined)) },
        { label: t("Returns", "المرتجعات"), tone: "risk", values: ms.map((m) => m.returns), drills: ms.map((m) => (m.returnCount ? monthDrill("Sales Invoice", company, m, true) : undefined)) },
        ...(tr.orderStatus === "ok" ? [{ label: t("Orders booked", "الأوامر المحجوزة"), tone: "secondary" as const, values: ms.map((m) => m.booked), drills: ms.map((m) => (m.orders ? monthDrill("Sales Order", company, m) : undefined)) }] : []),
      ]} />}
    {tr.status === "ok" && tr.orderStatus !== "ok" && <p className="ek-note">{t("Orders booked are not shown for your role.", "الأوامر المحجوزة غير معروضة لدورك.")}</p>}
  </ChartCard>;
}

/** S5 — receivables concentration by customer (company currency); the bar opens that customer's open invoices, the name opens Customer 360. */
function Concentration({ company, currency, user, today, ar }: { company: string; currency: string; user: string; today: string; ar: boolean }) {
  const t = (en: string, a: string) => (ar ? a : en);
  const c = customerConcentration(company, currency, user, today);
  return <ChartCard id="sell-concentration" size="md" title={t("Who owes the most", "أكبر العملاء مديونية")} attrs={{ "data-dp-sell-concentration": "" }}
    sub={c.status === "ok" ? <>{t("Open receivables", "الذمم المفتوحة")} <bdi className="tabular-nums" data-no-i18n>{fmtCurrency(c.total, currency)}</bdi></> : undefined}>
    <div>
      {c.status !== "ok" ? <SourceState status={c.status} doctype="Sales Invoice" /> : !c.rows.length ? <SourceState status="empty" /> : <>
        <ul className="dp-cc-bars max-h-80 overflow-y-auto pe-1" data-dp-sell-cust-list>{c.rows.map((x) => <li key={x.customer} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm" data-dp-sell-cust={x.customer}>
          <Link to="/pro/customer-360" search={{ customer: x.customer, company } as never} className="min-w-0 truncate font-medium hover:underline" data-no-i18n title={x.customer} data-dp-c360-link={x.customer}>{x.name || x.customer}</Link>
          <span className="tabular-nums" data-no-i18n>{x.share}%</span>
          <DrillLink drill={proDrill("/pro/receivables", { company, party: x.customer })} className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded px-1 py-0.5 hover:bg-accent" data-dp-sell-cust-open={x.customer}
            title={t("Open this customer's open invoices", "فتح فواتير هذا العميل المفتوحة")}>
            <span data-dp-bar-scale="max"><Meter value={x.amount} max={Math.max(1, ...c.rows.map((y) => y.amount))} tone={x.overdue > 0 ? "attention" : "good"} /></span>
            <span className="text-xs tabular-nums text-muted-foreground"><bdi data-no-i18n>{fmtCurrency(x.amount, currency)}</bdi> · {ar ? (x.invoices === 1 ? "فاتورة واحدة" : x.invoices === 2 ? "فاتورتان" : <><bdi data-no-i18n>{x.invoices}</bdi> فواتير</>) : <><bdi data-no-i18n>{x.invoices}</bdi> {x.invoices === 1 ? "invoice" : "invoices"}</>}{x.overdue > 0 && <> · <span className="text-destructive">{t("overdue", "متأخر")} <bdi data-no-i18n>{fmtCurrency(x.overdue, currency)}</bdi></span></>}</span>
          </DrillLink></li>)}</ul>
        {c.others > 0 && <p className="dp-cc-note mt-2">{t("Other customers", "عملاء آخرون")} <bdi data-no-i18n>{fmtCurrency(c.others, currency)}</bdi></p>}
        {c.other > 0 && <p className="dp-cc-note mt-1"><bdi data-no-i18n>{c.other}</bdi> {t("open invoices in other currencies are not converted and not included.", "فواتير مفتوحة بعملات أخرى لا تُحوّل ولا تُضمَّن.")}</p>}
      </>}
    </div>
  </ChartCard>;
}

/** Preserved SC-S-01 panels: Sales Orders by status and recent orders/invoices. */
function StatusAndRecent({ company, currency, user, ar }: { company: string; currency: string; user: string; ar: boolean }) {
  const t = (en: string, a: string) => (ar ? a : en);
  const ov = sellingOverview(company, currency, user);
  const money = (v: number) => fmtCurrency(v, currency);
  const docLink = (d: SellingDoc) => <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(d.doctype), name: d.name }} className="min-w-0 flex-1 truncate font-medium hover:underline" data-no-i18n>{d.name}</Link>;
  return <div className="dp-cc-split dp-cc-split-even">
    <section className="dp-cc-panel" data-dp-order-status>
      <div className="dp-cc-panel-h"><h2>{t("Sales Orders by status", "أوامر البيع حسب الحالة")}</h2></div>
      <div className="dp-cc-panel-b">{ov.orders.status !== "ok" ? <SourceState status={ov.orders.status} doctype="Sales Order" /> : !ov.orders.byStatus.length ? <SourceState status="empty" /> :
        <ul className="divide-y divide-border">{ov.orders.byStatus.map((s) => <li key={s.status} className="flex items-center gap-2 py-1.5 text-sm">
          <DrillLink drill={{ kind: "list", doctype: "Sales Order", filters: [["docstatus", "=", 1], ["status", "=", s.status], ["company", "=", company]] }} className="flex-1 hover:underline" data-dp-so-status={s.status}>{s.status || "—"}</DrillLink>
          <span className="dp-cc-badge" data-no-i18n>{s.count}</span>
          <span className="w-32 text-end tabular-nums" data-no-i18n>{money(s.amount)}</span></li>)}</ul>}</div>
    </section>
    <section className="dp-cc-panel" data-dp-recent>
      <div className="dp-cc-panel-h"><h2>{t("Recent orders and invoices", "أحدث الأوامر والفواتير")}</h2></div>
      <div className="dp-cc-panel-b">{!ov.recent.length ? <SourceState status="empty" /> :
        <ul className="divide-y divide-border">{ov.recent.map((d) => <li key={`${d.doctype}-${d.name}`} className="flex items-center gap-2 py-1.5 text-sm">
          <span className="chip bg-muted text-xs">{d.doctype === "Sales Order" ? t("Order", "أمر") : t("Invoice", "فاتورة")}</span>
          {docLink(d)}
          <span className="text-xs text-muted-foreground tabular-nums" data-no-i18n>{d.date}</span>
          <span className="text-xs">{d.status}</span>
          <span className="w-28 text-end tabular-nums" data-no-i18n>{money(d.outstanding ?? d.amount)}</span></li>)}</ul>}</div>
    </section>
  </div>;
}
