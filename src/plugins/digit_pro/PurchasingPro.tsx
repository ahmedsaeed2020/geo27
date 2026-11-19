// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * SC-P-01 Procurement Command Center (/pro/purchasing-overview, EC-R1 Phase 5). A sourcing-to-pay pipe whose six stages
 * keep their own bases, a commitment/exception strip (open PO value is a commitment, never a payable), a priority
 * worklist of exact native documents, late deliveries by supplier with verified on-time reliability, supplier quotation
 * comparison and a PO → receipt → invoice check — read-only over native Core buying records (procurementCommand.ts).
 */
import { blockWindow } from "@/lib/dashboards/registry";
import { DeptOverview, bandFacts } from "./DeptOverview";
import { AgingHeat, RatioGauge } from "./richBlocks";
import { amountFigure, ChartCard, ContextStrip, LINK_CHIP, LinkGroup, RankedBars, recordLabel, type Datum, type KpiItem, Meter } from "@/components/enterprise/kit";
import { drillWrap, proWrap, QueueWork } from "./ProKit";
import { ApControlPanel } from "@/components/enterprise/FinanceDesk";
import { useState } from "react";
import { ApprovalInbox } from "./PolicyPanels";
import { Link, useNavigate } from "@tanstack/react-router";
import { adapter } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { fmtCurrency } from "@/lib/format";
import { translateTo, useLang } from "@/i18n";
import { hasPerm } from "@/lib/session";
import { useScopeMetas } from "@/lib/scope";
import { financeContext, slug, sourceStatus, todayIso } from "./finance";
import { ProFrame, SourceState } from "./ProFrame";
import { Fulfilment, QuoteCompare } from "./FlowQueues";
import { purchasingOverview } from "./purchasingPro";
import { supplierReliability } from "./supplierReliability";
import type { SellingDoc } from "./sellingPro";
import { useNavResolver } from "./ProSidebar";
import { targetHref, type NavItem } from "./nav";
import { freshness, roleLabel } from "./command";
import { bi, DrillLink, sevLabel, SevDot, Totals } from "./CommandUi";
import { lateBySupplier, PROC_TABS, procurementChips, procurementPipe, procurementWork, threeWay, type PipeStage, type ProcTab } from "./procurementCommand";

export interface PurchasingSearch { company?: string | undefined; wl?: string | undefined }

const PROC_DTS = ["Material Request", "Request for Quotation", "Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Supplier", "GL Entry", "Account", "Company"];
const QUICK = ["Material Request", "Request for Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice"];
const QUICK_AR: Record<string, string> = { "Material Request": "طلب مواد", "Request for Quotation": "طلب عروض أسعار", "Purchase Order": "أمر شراء", "Purchase Receipt": "إيصال استلام", "Purchase Invoice": "فاتورة شراء" };
const REPORTS: NavItem[] = [
  { label: "Open Purchase Orders", target: { kind: "pro", to: "/pro/open-purchase-orders" } },
  { label: "Received not billed", target: { kind: "pro", to: "/pro/received-not-billed" } },
  { label: "Payables", target: { kind: "pro", to: "/pro/payables" } },
  ...["Purchase Order Analysis", "Purchase Analytics", "Purchase Register", "Supplier Quotation Comparison", "Received Items To Be Billed", "Supplier Ledger Summary"].map((report) => ({ label: report, target: { kind: "report" as const, report } })),
];
const REPORT_AR: Record<string, string> = { "Open Purchase Orders": "أوامر الشراء المفتوحة", "Received not billed": "مستلم غير مفوتر", Payables: "الذمم الدائنة" };
const TAB_LABEL: Record<ProcTab, [string, string]> = { sourcing: ["To source", "للتوريد"], late: ["Late deliveries", "توريد متأخر"], receipts: ["Received, not invoiced", "مستلم غير مفوتر"], quotes: ["Quotations to decide", "عروض بانتظار القرار"], pay: ["Invoices due", "فواتير مستحقة"] };
const EMPTY: Record<ProcTab, [string, string]> = { sourcing: ["No purchase request is waiting to be sourced.", "لا يوجد طلب شراء بانتظار التوريد."], late: ["No order line is past its expected delivery.", "لا يوجد بند أمر تجاوز موعد التوريد."], receipts: ["Every received line is invoiced.", "كل البنود المستلمة مفوترة."], quotes: ["No supplier quotation is waiting for a decision.", "لا يوجد عرض مورد بانتظار القرار."], pay: ["No supplier invoice is overdue or due within 7 days.", "لا توجد فاتورة مورد متأخرة أو مستحقة خلال 7 أيام."] };
const PRIORITY: ProcTab[] = ["late", "pay", "sourcing", "receipts", "quotes"];
const FLAG: Record<string, [string, string]> = { over_received: ["Received more than ordered", "استلام أكثر من المطلوب"], over_billed: ["Billed more than the line", "فوترة أكثر من قيمة البند"], billed_ahead: ["Billed ahead of receipt", "فوترة قبل الاستلام"] };

export function PurchasingPro({ search }: { search: PurchasingSearch }) {
  const nav = useNavigate();
  const r = useNavResolver();
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en);
  useScopeMetas(PROC_DTS);
  const set = (p: Partial<PurchasingSearch>) => void nav({ to: "/pro/purchasing-overview", search: (prev: PurchasingSearch) => ({ ...prev, ...p }) as never, replace: true });
  return (
    <ProFrame bare title={t("Procurement Command Center", "مركز قيادة المشتريات")} subtitle={t("What must be sourced, received, invoiced and paid — commitments kept apart from supplier payables.", "ما يجب توريده واستلامه وفوترته ودفعه — مع فصل الالتزامات عن مستحقات الموردين.")} tabs={false} doctypes={PROC_DTS}>
      {({ user }) => {
        const ctx = financeContext(search.company, user);
        if (!ctx.companies.length) return <SourceState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} doctype="Company" />;
        const today = todayIso();
        const quick = QUICK.filter((x) => { const m = cachedMeta(x); return m && r.appOf(x) && hasPerm(m, "create"); });
        const create = (dt: string) => { const m = cachedMeta(dt); const app = r.appOf(dt); if (!m || !app || !hasPerm(m, "create")) return; const doc = adapter.insert(m); void nav({ to: "/app/$app/$doctype/$name", params: { app, doctype: slug(dt), name: doc.name } }); };
        const pipe = procurementPipe(ctx.company, user, today);
        const chips = procurementChips(ctx.company, user, today);
        const work = procurementWork(ctx.company, ctx.currency, user, today);
        const tab: ProcTab = (PROC_TABS as string[]).includes(search.wl ?? "") ? (search.wl as ProcTab) : PRIORITY.find((x) => work.find((w) => w.tab === x)?.items.length) ?? "late";
        const reports = REPORTS.filter((i) => r.state(i) === "ok");
        // commitment / late lines / received-not-billed are the contract tiles PUR.COMMITMENT / PO_LATE / PR_TO_BILL — shown once there
        const lead: KpiItem[] = chips.filter((c) => c.id !== "commitment" && c.id !== "late" && c.id !== "grni").map((c) => ({
          id: `proc:${c.id}`, figure: c.status === "ok" && c.totals.length === 1 ? amountFigure(c.totals[0]!.amount) ?? `proc:${c.id}` : `proc:${c.id}`,
          label: bi(ar, c.label), value: c.status === "ok" ? String(c.count) : "—",
          ...(c.status !== "ok" ? { state: c.status === "denied" ? t("Not permitted", "غير مسموح") : t("Source unavailable", "المصدر غير متاح") } : {}),
          ...(c.status === "ok" && c.count > 0 ? { tone: c.tone === "bad" ? "risk" as const : c.tone === "warn" ? "attention" as const : undefined } : {}),
          sub: <>{c.totals.length > 0 && <Totals totals={c.totals} />}{c.note && <> · {bi(ar, c.note)}</>}</>,
          ...(c.status === "ok" && c.count > 0 ? { wrap: drillWrap(c.drill, { "data-dp-proc-chip": c.id }) } : {}),
          attrs: { "data-dp-proc-chip-tile": c.id, "data-count": String(c.count) },
        }));
        const extra = [
          { id: "approvals", label: t("Approvals", "الاعتمادات"), attrs: { "data-dp-proc-tab": "approvals" }, content: <ApprovalInbox company={ctx.company} doctypes={["Material Request", "Purchase Order", "Purchase Invoice", "Payment Entry"]} id="purchasing" /> },
          { id: "ap-control", label: t("Payables control", "رقابة الذمم الدائنة"), attrs: { "data-dp-proc-tab": "ap-control" }, content: <ApControlPanel company={ctx.company} /> },
          { id: "compare", label: t("Quotation comparison", "مقارنة العروض"), attrs: { "data-dp-proc-tab": "compare" }, content: <div data-dp-proc-compare><QuoteCompare company={ctx.company} currency={ctx.currency} user={user} /></div> },
          { id: "threeway", label: t("Order, receipt and invoice check", "مطابقة الأمر والاستلام والفاتورة"), attrs: { "data-dp-proc-tab": "threeway" }, content: <ThreeWayPanel company={ctx.company} user={user} today={today} ar={ar} /> },
          { id: "receipt", label: t("Order receipt progress", "تقدم استلام الأوامر"), attrs: { "data-dp-proc-tab": "receipt" }, content: <Fulfilment doctype="Purchase Order" company={ctx.company} currency={ctx.currency} user={user} /> },
          { id: "status", label: t("Orders by status & recent", "الأوامر حسب الحالة والأحدث"), attrs: { "data-dp-proc-tab": "status" }, content: <StatusAndRecent company={ctx.company} currency={ctx.currency} user={user} ar={ar} /> },
        ];
        const active = extra.some((x) => x.id === search.wl) ? search.wl! : tab;
        return <div className="dp-cc dp-cc-proc" data-dp-screen="PROC">
          <DeptOverview dept="purchasing" boards={["purchasing"]} company={ctx.company} currency={ctx.currency} user={user} ar={ar} lead={lead}
            context={(question) => <div data-dp-context><ContextStrip icon={<img src="/icons/digit/mod/digit-mod-purchases-light.svg" alt="" className="h-7 w-7" />}
              eyebrow={t("DIGIT Pro · Purchasing", "ديجيت برو · المشتريات")} title={t("Procurement Command Center", "مركز قيادة المشتريات")} sub={question}
              facts={[{ label: t("As of", "حتى تاريخ"), value: <bdi data-no-i18n>{today}</bdi> }, { label: t("Last change", "آخر تعديل"), value: <bdi data-no-i18n>{freshness(PROC_DTS, user) || "—"}</bdi> }, { label: t("Role", "الدور"), value: <bdi data-no-i18n>{roleLabel(user)}</bdi> }, ...bandFacts(ar, ctx.currency)]}
              aside={<label className="ek-context-select"><span>{t("Company", "الشركة")}</span><select value={ctx.company} onChange={(e) => set({ company: e.target.value, wl: undefined })} data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>}
              actions={<span className="contents" data-dp-proc-quick>{quick.map((dt) => <button key={dt} type="button" className="ek-context-btn" onClick={() => create(dt)} data-dp-quick={dt}>+ {ar ? QUICK_AR[dt] : dt}</button>)}
                <Link to="/pro/$dept" params={{ dept: "purchasing" }} className="ek-context-btn">{t("Purchasing workspace", "مساحة عمل المشتريات")}</Link></span>} /></div>}
            charts={[<SupplierDelivery key="delivery" company={ctx.company} user={user} today={today} ar={ar} />]}
            rows={[
              { id: "heat-payable", title: ["Suppliers × due ageing", "الموردون × أعمار الاستحقاق"], w: 8, node: <AgingHeat side="payable" company={ctx.company} currency={ctx.currency} user={user} ar={ar} /> },
              { id: "gauge-receipt", title: ["Received of ordered", "المستلم من المطلوب"], w: 4, period: true, node: (o) => { const w = blockWindow(o, today); return <RatioGauge kind="receipt" company={ctx.company} currency={ctx.currency} user={user} ar={ar} from={w?.from} to={w?.to} />; } },
            ]}
            stripTitle={["Sourcing to pay", "من الاحتياج إلى الدفع"]}
            strip={<section className="ek-card" data-dp-proc-pipe-panel><header className="ek-card-head"><div className="min-w-0"><h3 className="ek-h3">{t("Sourcing to pay", "من الاحتياج إلى الدفع")}</h3>
              <p className="ek-card-sub">{t("Each stage has its own basis — counts, quantities or values in their own currency — and stages are never added together.", "لكل مرحلة أساسها — أعداد أو كميات أو قيم بعملتها — ولا تُجمع المراحل أبدًا.")}</p></div></header><div className="ek-card-body"><Pipe stages={pipe} ar={ar} /></div></section>}
            work={<div data-dp-proc-worklist={active}><QueueWork id="proc-work" title={t("Procurement worklist", "قائمة عمل المشتريات")} ar={ar} currency={ctx.currency} registerAttr="data-dp-proc-register" active={active} onTab={(wl) => set({ wl })} extra={extra}
              queues={work.map((w) => ({ id: w.tab, label: TAB_LABEL[w.tab], status: w.status, empty: EMPTY[w.tab], register: w.register, attrs: { "data-dp-proc-tab": w.tab },
                rows: w.items.map((i) => ({ key: i.key, severity: i.severity, doctype: i.doctype, name: i.name, party: i.party, state: i.state, next: i.next, meta: [i.due, i.progress].filter(Boolean).join(" · "), amount: i.amount, currency: i.currency, drill: i.drill, attrs: { "data-dp-proc-row": i.key } })) }))} /></div>}
            links={reports.length > 0 && <LinkGroup id="proc-reports" title={t("Purchasing reports", "تقارير المشتريات")}>{reports.map((i) => { const h = targetHref(i.target, r.appOf)!;
              return <Link key={i.label} to={h.to as never} params={h.params as never} search={{ company: ctx.company } as never} className={LINK_CHIP} data-dp-resource={i.label}>{ar && REPORT_AR[i.label] ? REPORT_AR[i.label] : translateTo(i.label, ar ? "ar" : "en")}</Link>; })}</LinkGroup>} />
        </div>;
      }}
    </ProFrame>
  );
}

/** P2 — sourcing-to-pay pipe: connected segments (distinct from the Selling rail), each opening its exact register. */
function Pipe({ stages, ar }: { stages: PipeStage[]; ar: boolean }) {
  const t = (en: string, a: string) => (ar ? a : en);
  return <ol className="dp-cc-pipe" data-dp-proc-pipe>
    {stages.map((st, i) => {
      const ok = st.status === "ok";
      const body = <>
        <span className="dp-cc-pipe-k"><span data-no-i18n>{String(i + 1).padStart(2, "0")}</span> {bi(ar, st.label)}</span>
        {!ok ? <SourceState status={st.status === "ok" ? "empty" : st.status} /> : <>
          <span className="dp-cc-pipe-v"><bdi className="tabular-nums" data-no-i18n>{st.count}</bdi> <small>{bi(ar, st.unit)}</small></span>
          <span className="dp-cc-pipe-t">{st.totals.length ? <Totals totals={st.totals} /> : st.qty !== undefined ? <><bdi data-no-i18n>{st.qty}</bdi> {t("open lines", "بنود مفتوحة")}</> : <span className="text-muted-foreground">{t("Count only", "عدد فقط")}</span>}</span>
          <span className="dp-cc-note">{bi(ar, st.measure)}</span>
          {st.sub && <span className="dp-cc-stage-sub" data-tone={st.subTone}>{bi(ar, st.sub)}</span>}
          <span className="dp-cc-open">{t("Next", "التالي")}: {bi(ar, st.next)}</span></>}
      </>;
      return <li key={st.id} className="min-w-0">{ok
        ? <DrillLink drill={st.drill} className="dp-cc-pipe-s" data-dp-pipe={st.id} data-count={st.count} data-tone={st.subTone}>{body}</DrillLink>
        : <div className="dp-cc-pipe-s" data-dp-pipe={st.id} data-state={st.status}>{body}</div>}</li>;
    })}
  </ol>;
}

/** P4 — priority worklist: document, supplier, expected/due, ordered/received/billed progress, amount, age, status, next native step. */
/** P5 — late deliveries by supplier (each bar opens that supplier's late PO lines) and verified on-time reliability. */
const supName = (id: string) => recordLabel(id, ["Supplier"]);
function SupplierDelivery({ company, user, today, ar }: { company: string; user: string; today: string; ar: boolean }) {
  const t = (en: string, a: string) => (ar ? a : en);
  const late = lateBySupplier(company, user, today);
  const rel = supplierReliability(company, user);
  return <ChartCard id="proc-delivery" size="lg" title={t("Supplier delivery", "توريد الموردين")} sub={t("Late order lines by supplier, and on-time delivery against the PO schedule.", "بنود الأوامر المتأخرة حسب المورد، والتسليم في موعد جدول أمر الشراء.")} attrs={{ "data-dp-proc-delivery": "" }}>
    <div>
      <h4 className="ek-row-meta font-semibold">{t("Late order lines by supplier", "بنود الأوامر المتأخرة حسب المورد")}</h4>
      {late.status !== "ok" ? <SourceState status={late.status} doctype="Purchase Order" /> : !late.rows.length ? <p className="mt-1 text-sm text-muted-foreground">{t("No late deliveries.", "لا يوجد توريد متأخر.")}</p> :
        <RankedBars ar={ar} wrap={proWrap} tone="risk" max={6} sort={false} fmt={(v) => `${v}`}
          data={late.rows.slice(0, 6).map((x): Datum => ({ key: x.supplier, label: supName(x.supplier), data: true, value: x.lines, drill: x.drill, sub: `${x.worst}${t("d", "ي")}`, attrs: { "data-dp-proc-late": x.supplier, "data-lines": String(x.lines) } }))} />}
      <h3 className="mt-4 text-xs font-semibold text-muted-foreground">{t("On-time delivery (receipt date vs PO schedule)", "التسليم في الموعد (تاريخ الاستلام مقابل جدول الأمر)")}</h3>
      {rel.status !== "ok" ? <SourceState status={rel.status} doctype="Purchase Receipt" /> : !rel.rows.length ? <SourceState status="empty" /> : <>
        <ul className="mt-1 divide-y divide-border text-sm" data-dp-supplier-reliability>{rel.rows.slice(0, 6).map((x) => <li key={x.supplier} className="flex items-center gap-2 py-1.5">
          <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "supplier", name: x.supplier }} className="min-w-0 flex-1 truncate hover:underline" data-no-i18n title={x.supplier}>{supName(x.supplier)}</Link>
          <span className={`text-xs font-semibold tabular-nums ${x.late > 0 ? "text-destructive" : "text-success-text"}`} data-no-i18n>{x.onTimePct}%</span>
          <span className="text-xs text-muted-foreground tabular-nums" data-no-i18n>{x.onTime}/{x.matched}{x.late ? ` · +${x.avgDelayDays}` : ""}</span></li>)}</ul>
        {(rel.excludedNoSchedule > 0 || rel.excludedNoPoLink > 0) && <p className="dp-cc-note mt-1">{t("Excluded", "مستبعد")}: <bdi data-no-i18n>{rel.excludedNoSchedule}</bdi> {t("no schedule date", "بدون تاريخ جدولة")} · <bdi data-no-i18n>{rel.excludedNoPoLink}</bdi> {t("no PO link", "بدون ربط أمر شراء")}</p>}
        <p className="dp-cc-note mt-1">{t("Share of receipt lines on or before the PO schedule date. Not a supplier score.", "نسبة بنود الاستلام في موعد جدول الأمر أو قبله. ليست تقييمًا للمورد.")}</p></>}
    </div>
  </ChartCard>;
}

/** P7 — ordered vs received vs billed per open PO line, with linked receipts and invoices. Advisory flags; nothing is blocked. */
function ThreeWayPanel({ company, user, today, ar }: { company: string; user: string; today: string; ar: boolean }) {
  const t = (en: string, a: string) => (ar ? a : en);
  const [all, setAll] = useState(false);
  const tw = threeWay(company, user, today);
  const shown = all ? tw.rows : tw.rows.slice(0, 6);
  const doc = (dt: string, name: string) => <Link key={name} to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(dt), name }} className="me-1 text-primary hover:underline" data-no-i18n>{name}</Link>;
  const bar = (v: number) => <span className="inline-block w-14 align-middle"><Meter size="sm" value={Math.min(100, v)} max={100} /></span>;
  return <section className="dp-cc-panel" data-dp-proc-threeway={tw.flagged}>
    <div className="dp-cc-panel-h"><h2>{t("Order, receipt and invoice check", "مطابقة الأمر والاستلام والفاتورة")}</h2>
      {tw.status === "ok" && tw.flagged > 0 && <span className="dp-cc-badge" data-tone="bad" data-no-i18n>{tw.flagged}</span>}
      <DrillLink drill={{ kind: "pro", to: "/pro/open-purchase-orders", search: { company } }} className="dp-link ms-auto text-xs">{t("Open Purchase Orders", "أوامر الشراء المفتوحة")}</DrillLink></div>
    {tw.status !== "ok" ? <div className="dp-cc-panel-b"><SourceState status={tw.status} doctype="Purchase Order" /></div> : !tw.rows.length ? <div className="dp-cc-panel-b"><SourceState status="empty" /></div> : <>
      <div className="overflow-x-auto"><table className="dp-cc-table">
        <thead><tr><th scope="col">{t("Order line", "بند الأمر")}</th><th scope="col">{t("Received", "المستلم")}</th><th scope="col">{t("Billed", "المفوتر")}</th><th scope="col">{t("Receipts · invoices", "الإيصالات · الفواتير")}</th></tr></thead>
        <tbody>{shown.map((x, i) => <tr key={`${x.po}-${x.item}-${i}`} data-dp-threeway-row={x.po} data-flag={x.flag ?? ""}>
          <td className="whitespace-nowrap">{doc("Purchase Order", x.po)}<span className="block text-[11px] text-muted-foreground" data-no-i18n>{x.item} · {x.supplier}</span>
            {x.flag && <span className="block text-[11px] font-medium text-destructive">{bi(ar, FLAG[x.flag]!)}</span>}</td>
          <td className="whitespace-nowrap">{bar(x.receivedPct)} <span className="text-xs tabular-nums" data-no-i18n>{x.received}/{x.ordered} {x.uom}</span></td>
          <td className="whitespace-nowrap">{bar(x.billedPct)} <span className="text-xs tabular-nums" data-no-i18n>{x.billedPct}%</span></td>
          <td className="min-w-32 text-xs">{x.receipts.length || x.invoices.length ? <>{x.receipts.map((n) => doc("Purchase Receipt", n))}{x.invoices.length > 0 && <span className="text-muted-foreground">· </span>}{x.invoices.map((n) => doc("Purchase Invoice", n))}</> : <span className="text-muted-foreground">{t("None yet", "لا يوجد بعد")}</span>}</td>
        </tr>)}</tbody></table></div>
      {tw.rows.length > 6 && <div className="border-t border-border p-2"><button type="button" className="btn-ghost w-full text-xs" aria-expanded={all} onClick={() => setAll((v) => !v)}>{all ? t("Show fewer", "عرض أقل") : `${t("Show all", "عرض الكل")} (${tw.rows.length})`}</button></div>}
      <p className="dp-cc-note px-4 pb-3">{t("Received compares quantities; billed compares amounts on the same order line. With zero tolerance (owner default), a bill billed beyond its receipt or above the order rate can be paid only by an Accounts Manager.", "الاستلام يقارن الكميات والفوترة تقارن المبالغ على بند الأمر نفسه. بسماحية صفرية (الافتراض المعتمد)، لا يدفع فاتورةً مفوترة بأكثر من المستلم أو بأعلى من سعر الأمر إلا مدير الحسابات.")}</p>
    </>}
  </section>;
}

/** Preserved SC-P-01 panels: Purchase Orders by status, top suppliers by payable, recent orders and invoices. */
function StatusAndRecent({ company, currency, user, ar }: { company: string; currency: string; user: string; ar: boolean }) {
  const t = (en: string, a: string) => (ar ? a : en);
  const ov = purchasingOverview(company, currency, user);
  const money = (v: number) => fmtCurrency(v, currency);
  const docLink = (d: SellingDoc) => <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(d.doctype), name: d.name }} className="min-w-0 flex-1 truncate font-medium hover:underline" data-no-i18n>{d.name}</Link>;
  return <div className="grid gap-4 lg:grid-cols-3">
    <section className="dp-cc-panel" data-dp-order-status>
      <div className="dp-cc-panel-h"><h2>{t("Purchase Orders by status", "أوامر الشراء حسب الحالة")}</h2></div>
      <div className="dp-cc-panel-b">{ov.orders.status !== "ok" ? <SourceState status={ov.orders.status} doctype="Purchase Order" /> : !ov.orders.byStatus.length ? <SourceState status="empty" /> :
        <ul className="divide-y divide-border">{ov.orders.byStatus.map((s) => <li key={s.status} className="flex items-center gap-2 py-1.5 text-sm">
          <DrillLink drill={{ kind: "list", doctype: "Purchase Order", filters: [["docstatus", "=", 1], ["status", "=", s.status], ["company", "=", company]] }} className="min-w-0 flex-1 truncate hover:underline" data-dp-po-status={s.status}>{s.status}</DrillLink>
          <span className="dp-cc-badge" data-no-i18n>{s.count}</span>
          <span className="w-28 text-end tabular-nums" data-no-i18n>{money(s.amount)}</span></li>)}</ul>}</div>
    </section>
    <section className="dp-cc-panel" data-dp-top-suppliers>
      <div className="dp-cc-panel-h"><h2>{t("Top suppliers by payable", "أكبر الموردين حسب المستحق")}</h2></div>
      <div className="dp-cc-panel-b">{ov.topSuppliers.status !== "ok" ? <SourceState status={ov.topSuppliers.status} doctype="Purchase Invoice" /> : !ov.topSuppliers.rows.length ? <SourceState status="empty" /> :
        <ul className="divide-y divide-border">{ov.topSuppliers.rows.map((c) => <li key={c.supplier} className="flex items-center gap-2 py-1.5 text-sm">
          <DrillLink drill={{ kind: "pro", to: "/pro/payables", search: { company, party: c.supplier, fs: "drill" } }} className="min-w-0 flex-1 truncate hover:underline" data-no-i18n>{c.supplier}</DrillLink>
          <span className="tabular-nums" data-no-i18n>{money(c.outstanding)}</span></li>)}</ul>}</div>
    </section>
    <section className="dp-cc-panel" data-dp-recent>
      <div className="dp-cc-panel-h"><h2>{t("Recent orders and invoices", "أحدث الأوامر والفواتير")}</h2></div>
      <div className="dp-cc-panel-b">{!ov.recent.length ? <SourceState status="empty" /> :
        <ul className="divide-y divide-border">{ov.recent.map((d) => <li key={`${d.doctype}-${d.name}`} className="flex items-center gap-2 py-1.5 text-sm">
          <span className="chip bg-muted text-xs">{d.doctype === "Purchase Order" ? t("Order", "أمر") : t("Invoice", "فاتورة")}</span>
          {docLink(d)}
          <span className="text-xs text-muted-foreground tabular-nums" data-no-i18n>{d.date}</span>
          <span className="w-24 text-end text-xs tabular-nums" data-no-i18n>{money(d.outstanding ?? d.amount)}</span></li>)}</ul>}</div>
    </section>
  </div>;
}
