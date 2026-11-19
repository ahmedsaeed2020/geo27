/**
 * PRO P1 — Finance home cards (/pro/dashboard and the top of /pro/accounting). Pro supplies figures and drills from
 * financeHome.ts; the Enterprise kit draws them (SplitBars, AreaChart / GroupedColumns behind a view switch,
 * AccountCompare, Donut with change chips, ShortcutChips, KPI row with «أضف عنصرًا +»). Nothing here computes a figure.
 */
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AccountCompare, AreaChart, ChartCard, Donut, GroupedColumns, KpiRow, money, moneyShort, ShortcutChips, ViewToggle, Zone, type Datum, type KpiItem, type Shortcut, type Wrap } from "@/components/enterprise/kit";
import { SplitBars } from "@/components/enterprise/kit/SplitCard";
import { cleanLabel } from "@/components/enterprise/kit/labels";
import { PageBlocks, pageDashboard, type PageBlockDef, type PageNodes } from "@/components/dashboards/PageBlocks";
import { blockWindow } from "@/lib/dashboards/registry";
import { cachedMeta } from "@/lib/catalog";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { useScopeMetas } from "@/lib/scope";
import { hasPerm } from "@/lib/session";
import { DrillLink } from "./CommandUi";
import { QuickLink } from "@/components/enterprise/QuickView";
import { SourceState } from "./ProFrame";
import { useNavResolver } from "./ProSidebar";
import { slug } from "./nav";
import { bankCompare, cashFlowMonths, changePct, expenseMix, plSplit, type Status } from "./financeHome";
import { execSignals, liquidityTiming, type Drill } from "./command";
import { kpiFromSignal, drillWrap } from "./ProKit";
import { compareAsOf } from "./sections";
import { todayIso } from "./finance";

type Ctx = { company: string; currency: string; user: string; ar: boolean };
const MON_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (ym: string, ar: boolean) => (ar ? MON_AR : MON_EN)[Number(ym.slice(5, 7)) - 1] ?? ym;
const FH_DTS = ["GL Entry", "Account", "Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry", "Bank Account", "Bank Transaction", "Fiscal Year"];
const wrap: Wrap = (d, children, attrs) => <DrillLink drill={d as Drill} {...(attrs ?? {})}>{children}</DrillLink>;
const date = (iso: string) => <bdi data-no-i18n>{fmtDate(iso)}</bdi>;
/** Not ok → the shared source state (not permitted / no data), never a zero. */
const stateOf = (st: Status, doctype = "GL Entry") => (st === "ok" ? null : <SourceState status={st} doctype={doctype} />);
const FootLink = ({ drill, children, id }: { drill: Drill; children: ReactNode; id: string }) => <DrillLink drill={drill} className="ek-card-link text-xs font-semibold text-primary hover:underline" data-dp-fh-foot={id}>{children} ←</DrillLink>;

/* ---------------- P1-05 · shortcut chips ---------------- */
type NewTarget = { kind: "new"; doctype: string; app: string };
function FinShortcuts({ company, ar }: { company: string; ar: boolean }) {
  const r = useNavResolver(); const t = (en: string, a: string) => (ar ? a : en);
  const create = (doctype: string, label: string, icon: Shortcut["icon"], tone: Shortcut["tone"]): Shortcut[] => {
    const m = cachedMeta(doctype); const app = r.appOf(doctype);
    return m && app && hasPerm(m, "create") ? [{ key: `new:${doctype}`, label, icon, tone, drill: { kind: "new", doctype, app } satisfies NewTarget }] : [];
  };
  const report = (name: string, label: string, tone: Shortcut["tone"]): Shortcut[] => (r.state({ label: name, target: { kind: "report", report: name } }) === "ok" ? [{ key: `report:${name}`, label, icon: "chart", tone, drill: { kind: "report", name, filters: { company } } satisfies Drill }] : []);
  const items: Shortcut[] = [
    ...create("Journal Entry", t("New journal entry", "قيد يومية جديد"), "doc", 1),
    ...create("Payment Entry", t("New payment / receipt", "سند قبض أو صرف"), "money", 2),
    ...create("Sales Invoice", t("New sales invoice", "فاتورة مبيعات جديدة"), "doc", 3),
    ...create("Purchase Invoice", t("New purchase invoice", "فاتورة مشتريات جديدة"), "doc", 4),
    ...(r.state({ label: "Bank Reconciliation Tool", target: { kind: "doctype", doctype: "Bank Transaction" } }) === "ok" ? [{ key: "bank-rec", label: t("Bank reconciliation", "المطابقة البنكية"), icon: "bank" as const, tone: 5 as const, drill: { kind: "pro", to: "/pro/bank-reconciliation", search: { company } } satisfies Drill }] : []),
    ...report("General Ledger", t("General ledger", "دفتر الأستاذ العام"), 6),
    ...report("Trial Balance", t("Trial balance", "ميزان المراجعة"), 1),
    ...report("Accounts Receivable", t("Receivables", "الذمم المدينة"), 2),
  ];
  const w: Wrap = (d, node, attrs) => { const x = d as NewTarget | Drill;
    return x.kind === "new" ? <Link to="/app/$app/$doctype/$name" params={{ app: x.app, doctype: slug(x.doctype), name: "new" }} {...(attrs ?? {})}>{node}</Link> : <DrillLink drill={x} {...(attrs ?? {})}>{node}</DrillLink>; };
  return <div data-dp-fh="shortcuts"><ShortcutChips items={items} label={t("Shortcuts", "اختصارات")} wrap={w} /></div>;
}

/* ---------------- accounting home KPI row (featured «الرصيد البنكي المؤكد» first) ---------------- */
function AccKpis({ company, currency, user, ar }: Ctx) {
  useScopeMetas(FH_DTS);
  const t = (en: string, a: string) => (ar ? a : en);
  const today = todayIso();
  const signals = execSignals(company, currency, user, today), prev = execSignals(company, currency, user, compareAsOf(today, "month"));
  const cash = signals.find((x) => x.id === "cash");
  const p = plSplit(company, user, today), b = bankCompare(company, user, today);
  const items: KpiItem[] = [
    ...(cash ? [kpiFromSignal(cash, ar, prev.find((x) => x.id === "cash"))] : []),
    { id: "fh:net", label: t("Net result — year to date", "صافي النتيجة منذ بداية السنة"), value: fmtCurrency(p.net, currency), tone: p.net < 0 ? "risk" : undefined,
      ...(p.status === "ok" ? { wrap: drillWrap(p.report, { "data-dp-fh-kpi": "net" }) } : { state: stateOf(p.status) }),
      sub: <>{t("Income", "الإيراد")} <bdi data-no-i18n>{fmtCurrency(p.income, currency)}</bdi> · {t("Expense", "المصروف")} <bdi data-no-i18n>{fmtCurrency(p.expense, currency)}</bdi></> },
    // two lists → the card total is the sum and each part opens its own drafts (no single link that shows fewer rows)
    { id: "fh:drafts", label: t("Draft invoices to review", "مسودات فواتير للمراجعة"), value: String(p.drafts.income.count + p.drafts.expense.count), tone: p.drafts.income.count + p.drafts.expense.count ? "attention" : undefined,
      ...(p.review ? { wrap: drillWrap(p.review.drill, { "data-dp-fh-kpi": "drafts" }) } : {}),
      sub: p.review ? <><bdi data-no-i18n>{p.drafts.income.count}</bdi> {t("sales", "مبيعات")} · <bdi data-no-i18n>{p.drafts.expense.count}</bdi> {t("purchases", "مشتريات")} · {t("since", "منذ")} {date(p.from)}</>
        : <><DrillLink drill={p.drafts.income.drill} className="hover:underline" data-dp-fh-kpi-part="sales"><bdi data-no-i18n>{p.drafts.income.count}</bdi> {t("sales", "مبيعات")}</DrillLink> · <DrillLink drill={p.drafts.expense.drill} className="hover:underline" data-dp-fh-kpi-part="purchases"><bdi data-no-i18n>{p.drafts.expense.count}</bdi> {t("purchases", "مشتريات")}</DrillLink> · {t("since", "منذ")} {date(p.from)}</> },
    { id: "fh:recon", label: t("Bank lines to reconcile", "حركات بنكية للمطابقة"), value: String(b.toReconcile), tone: b.toReconcile ? "attention" : undefined,
      ...(b.status !== "ok" ? { state: stateOf(b.status, "Bank Transaction") } : b.reconDrill ? { wrap: drillWrap(b.reconDrill, { "data-dp-fh-kpi": "recon" }) } : {}),
      sub: t("Submitted bank statement lines not yet matched", "سطور كشف بنكي معتمدة لم تُطابق بعد") },
  ];
  return <section aria-label={t("Accounting indicators", "مؤشرات المحاسبة")} data-dp-fh="kpis"><KpiRow id="acc-home-kpis" ar={ar} items={items} /></section>;
}

/* ---------------- P1-01 · P&L split ---------------- */
function PlCard({ company, currency, user, ar }: Ctx) {
  useScopeMetas(FH_DTS);
  const t = (en: string, a: string) => (ar ? a : en);
  const p = plSplit(company, user, todayIso());
  const title = t("Income and expense — year to date", "الإيراد والمصروف منذ بداية السنة");
  const ch = p.prevIncome !== null ? changePct(p.income, p.prevIncome) : null;
  return <ChartCard id="fh-pl" title={title} sub={<>{t("Posted (solid) and draft invoices of the same period (hatched)", "المرحّل (مصمت) ومسودات فواتير الفترة نفسها (مخطط)")} · {date(p.from)} – {date(p.to)}</>}
    footer={<FootLink drill={p.report} id="pl">{t("Profit and loss statement", "قائمة الأرباح والخسائر")}</FootLink>} attrs={{ "data-dp-fh": "pl", "data-income": String(p.income), "data-expense": String(p.expense), "data-net": String(p.net) }}>
    {stateOf(p.status) ?? <SplitBars ar={ar} wrap={wrap} value={fmtCurrency(p.net, currency)}
      pct={p.income ? { value: (p.net / p.income) * 100, label: t("net margin", "هامش صافٍ") } : undefined}
      delta={ch !== null ? { pct: ch, vs: <>{t("income vs the same period last year", "الإيراد عن الفترة نفسها من العام السابق")}</>, better: "up" } : undefined}
      bars={[{ key: "income", label: t("Income", "الإيراد"), solid: Math.max(0, p.income), pending: p.drafts.income.amount, display: fmtCurrency(p.income, currency), pendingDisplay: fmtCurrency(p.drafts.income.amount, currency), tone: "emerald", drill: p.drafts.income.count ? p.drafts.income.drill : p.report, review: p.drafts.income.count ? { count: p.drafts.income.count, drill: p.drafts.income.drill } : undefined },
        { key: "expense", label: t("Expense", "المصروف"), solid: Math.max(0, p.expense), pending: p.drafts.expense.amount, display: fmtCurrency(p.expense, currency), pendingDisplay: fmtCurrency(p.drafts.expense.amount, currency), tone: "coral", drill: p.drafts.expense.count ? p.drafts.expense.drill : p.report, review: p.drafts.expense.count ? { count: p.drafts.expense.count, drill: p.drafts.expense.drill } : undefined }]}
      review={p.review ?? undefined} />}
  </ChartCard>;
}

/* ---------------- P1-02 · cash flow with «الرصيد | الداخل والخارج» ---------------- */
function CashFlowCard({ company, currency, user, ar, months }: Ctx & { months: number }) {
  useScopeMetas(FH_DTS);
  const t = (en: string, a: string) => (ar ? a : en);
  const [view, setView] = useState<"balance" | "flow">("balance");
  const f = cashFlowMonths(company, user, todayIso(), months);
  const last = f.months[f.months.length - 1];
  const toggle = <ViewToggle id="fh-cash" label={t("Cash flow view", "عرض التدفق النقدي")} value={view} onChange={setView} options={[{ id: "balance", label: t("Balance", "الرصيد") }, { id: "flow", label: t("In and out", "الداخل والخارج") }]} />;
  const body = stateOf(f.status) ?? (view === "balance"
    ? <AreaChart ar={ar} wrap={wrap} fmt={money(currency)} axisFmt={moneyShort(currency)} valueLabel={t("Posted balance at month end", "الرصيد المرحّل في نهاية الشهر")}
        data={f.months.map((m, i): Datum => ({ key: m.ym, label: i === 0 || m.ym.endsWith("-01") ? `${monthName(m.ym, ar)} ${m.ym.slice(0, 4)}` : monthName(m.ym, ar), value: m.balance, ...(m.rows ? { drill: m.drill } : {}) }))} />
    : <GroupedColumns ar={ar} wrap={wrap} height={170} fmt={money(currency)} axisFmt={moneyShort(currency)} groups={f.months.map((m) => ({ key: m.ym, label: monthName(m.ym, ar) }))}
        series={[{ label: t("In (debit)", "الداخل (مدين)"), values: f.months.map((m) => m.inflow), drills: f.months.map((m) => (m.rows ? m.drill : undefined)), tone: "good" },
          { label: t("Out (credit)", "الخارج (دائن)"), values: f.months.map((m) => m.outflow), drills: f.months.map((m) => (m.rows ? m.drill : undefined)), tone: "attention" }]} />);
  return <ChartCard id="fh-cash" size="auto" title={t("Cash flow", "التدفق النقدي")} attrs={{ "data-dp-fh": "cashflow", "data-dp-fh-view": view, "data-balance": String(last?.balance ?? "") }}
    sub={<>{t("Bank and cash accounts, posted ledger", "حسابات البنوك والنقدية، الأستاذ المرحّل")} · <bdi data-no-i18n>{f.accounts.length}</bdi> {t("accounts", "حسابات")}{last ? <> · {t("this month in", "داخل هذا الشهر")} <bdi data-no-i18n>{fmtCurrency(last.inflow, currency)}</bdi> · {t("out", "خارج")} <bdi data-no-i18n>{fmtCurrency(last.outflow, currency)}</bdi></> : null}</>}
    footer={<FootLink drill={f.report} id="cashflow">{t("View the cash flow", "عرض التدفق النقدي")}</FootLink>}><div className="mb-2 flex">{toggle}</div>{body}</ChartCard>;
}

/* ---------------- P1-03 · bank accounts: bank vs books ---------------- */
function BanksCard({ company, currency, user, ar }: Ctx) {
  useScopeMetas(FH_DTS);
  const t = (en: string, a: string) => (ar ? a : en);
  const b = bankCompare(company, user, todayIso());
  const review = b.toReconcile && b.reconDrill ? <DrillLink drill={b.reconDrill} className="ek-acmp-review" data-dp-fh-recon={b.toReconcile}><bdi data-no-i18n>{b.toReconcile}</bdi> {t("to reconcile", "للمطابقة")}</DrillLink> : undefined;
  return <ChartCard id="fh-banks" size="auto" title={t("Bank accounts", "الحسابات البنكية")} action={review} attrs={{ "data-dp-fh": "banks" }}
    sub={<>{t("Books balance vs the calculated bank statement balance", "رصيد الدفاتر مقابل رصيد كشف البنك المحتسب")} · {t("as of", "حتى")} {date(b.asOf)}</>}
    footer={<FootLink drill={b.workDrill} id="banks">{t("Open bank reconciliation", "فتح المطابقة البنكية")}</FootLink>}>
    {stateOf(b.status) ?? <AccountCompare ar={ar} wrap={wrap} rows={b.rows.map((r) => ({ key: r.account, label: <QuickLink doctype="Account" name={r.account} className="hover:underline">{cleanLabel(r.account)}</QuickLink>,
      kind: r.type === "Cash" ? t("Cash", "نقدية") : t("Bank", "بنك"), books: fmtCurrency(r.books, currency), booksValue: r.books, booksDrill: r.booksDrill,
      bank: r.bank === null ? null : fmtCurrency(r.bank, currency), bankValue: r.bank, bankDrill: r.bankDrill ?? undefined, diff: r.diff === null ? null : fmtCurrency(r.diff, currency),
      noBank: r.type === "Cash" ? t("No statement", "لا كشف بنكي") : t("No bank account", "لا حساب بنكي"),
      review: r.unreconciled ? { count: r.unreconciled, drill: r.reconDrill ?? undefined } : undefined,
      attrs: { "data-dp-fh-bank": r.account, "data-books": String(r.books), "data-bank": String(r.bank ?? ""), "data-unrec": String(r.unreconciled ?? "") } }))} />}
  </ChartCard>;
}

/* ---------------- P1-04 · expenses donut with value legend and Δ vs last month ---------------- */
function ExpensesCard({ company, currency, user, ar }: Ctx) {
  useScopeMetas(FH_DTS);
  const t = (en: string, a: string) => (ar ? a : en);
  const e = expenseMix(company, user, todayIso());
  const ch = changePct(e.total, e.prevTotal || null);
  const data: Datum[] = e.slices.map((x) => ({ key: x.key, label: x.account ? cleanLabel(x.account) : t(`Other (${x.accounts})`, `أخرى (${x.accounts})`), value: x.value, ...(x.drill ? { drill: x.drill } : {}),
    ...(x.prev > 0 ? { delta: { pct: changePct(x.value, x.prev)!, better: "down" as const, label: t("vs last month", "عن الشهر السابق") } } : {}), attrs: { "data-dp-fh-exp": x.key, "data-value": String(x.value), "data-prev": String(x.prev) } }));
  return <ChartCard id="fh-exp" title={t("Expenses this month", "مصروفات هذا الشهر")} attrs={{ "data-dp-fh": "expenses", "data-total": String(e.total), "data-prev-total": String(e.prevTotal) }}
    sub={<>{date(e.from)} – {date(e.to)} · {t("compared with", "مقارنة بـ")} {date(e.prevFrom)} – {date(e.prevTo)}</>}
    footer={<span className="flex flex-wrap items-center gap-2 text-xs"><span className="ek-muted">{t("Total", "الإجمالي")} <bdi data-no-i18n>{fmtCurrency(e.total, currency)}</bdi> · {t("last month", "الشهر السابق")} <bdi data-no-i18n>{fmtCurrency(e.prevTotal, currency)}</bdi>{ch !== null ? <> · <span data-dp-fh-exp-change={ch}>{ch > 0 ? "▲" : "▼"} <bdi data-no-i18n>{Math.abs(ch)}%</bdi></span></> : null}</span>
      <FootLink drill={e.report} id="expenses">{t("Profit and loss statement", "قائمة الأرباح والخسائر")}</FootLink></span>}>
    {e.status === "empty" ? <p className="ek-muted py-6 text-center text-sm" data-dp-fh-exp-empty>{t("No expense posted this month yet.", "لم يُرحّل أي مصروف هذا الشهر بعد.")}</p>
      : stateOf(e.status) ?? <Donut ar={ar} wrap={wrap} data={data} max={6} fmt={money(currency)} centerFmt={moneyShort(currency)} centerLabel={t("This month", "هذا الشهر")} />}
  </ChartCard>;
}

/* ---------------- optional: receivables by age (catalog block) ---------------- */
function ArAgingCard({ company, currency, user, ar }: Ctx) {
  useScopeMetas(FH_DTS);
  const t = (en: string, a: string) => (ar ? a : en);
  const c = liquidityTiming(company, currency, user).collect;
  const TONE = ["good", "attention", "secondary", "risk"] as const;
  return <ChartCard id="fh-aging" title={t("Overdue receivables by age", "الذمم المدينة المتأخرة حسب العمر")} attrs={{ "data-dp-fh": "ar_aging", "data-total": String(c.total) }}
    sub={t("Open sales invoice balances past due, as of today", "أرصدة فواتير المبيعات المفتوحة المتأخرة حتى اليوم")}
    footer={<FootLink drill={{ kind: "pro", to: "/pro/receivables", search: { company } }} id="ar_aging">{t("Receivables", "الذمم المدينة")}</FootLink>}>
    {stateOf(c.status === "ok" ? (c.bars.some((x) => x.amount) ? "ok" : "empty") : c.status, "Sales Invoice") ?? <Donut ar={ar} wrap={wrap} fmt={money(currency)} centerFmt={moneyShort(currency)} centerLabel={t("Overdue", "متأخرة")}
      data={c.bars.map((x, i): Datum => ({ key: x.key, label: ar ? x.label[1] : x.label[0], value: x.amount, tone: TONE[i] ?? "neutral", ...(x.count ? { drill: x.drill } : {}) }))} />}
  </ChartCard>;
}

/** Months of the cash-flow card: the block's own period (block menu), else six months. */
const monthsOf = (o: Record<string, string | undefined>) => { const w = blockWindow(o, todayIso()); return w ? Math.max(2, Math.min(12, Math.round(w.days / 30.4))) : 6; };

/** Finance home blocks shared by the executive dashboard and the accounting home (same ids → one layout vocabulary). */
export const FINANCE_BLOCKS: PageBlockDef[] = [
  { id: "pl", title: ["Income and expense", "الإيراد والمصروف"], meaning: ["Posted income and expense of the year with drafts hatched", "الإيراد والمصروف المرحّلان للسنة والمسودات مخططة"], w: 6 },
  { id: "cashflow", title: ["Cash flow", "التدفق النقدي"], meaning: ["Bank and cash balance or in / out per month", "رصيد البنوك والنقدية أو الداخل والخارج شهريًا"], w: 6, period: true },
  { id: "banks", title: ["Bank accounts", "الحسابات البنكية"], meaning: ["Books balance vs bank statement per account", "رصيد الدفاتر مقابل كشف البنك لكل حساب"], w: 6 },
  { id: "expenses", title: ["Expenses this month", "مصروفات هذا الشهر"], meaning: ["Expense accounts this month vs last month", "حسابات المصروفات هذا الشهر مقابل الشهر السابق"], w: 6 },
  { id: "ar_aging", title: ["Overdue receivables by age", "الذمم المدينة المتأخرة حسب العمر"], meaning: ["Open sales invoices past due, by age", "فواتير المبيعات المفتوحة المتأخرة حسب العمر"], w: 6, inDefault: false },
];
export const SHORTCUTS_BLOCK: PageBlockDef = { id: "shortcuts", title: ["Shortcuts", "اختصارات"], meaning: ["New documents and the most used reports", "مستندات جديدة والتقارير الأكثر استخدامًا"], w: 12 };

/** The page nodes of the finance blocks (and the shortcut row), drawn inside the host page's zones. */
export function financeNodes(c: Ctx): PageNodes {
  return {
    shortcuts: <Zone zone="links"><FinShortcuts company={c.company} ar={c.ar} /></Zone>,
    pl: <Zone zone="charts"><PlCard {...c} /></Zone>,
    cashflow: (o: Record<string, string | undefined>) => <Zone zone="charts"><CashFlowCard {...c} months={monthsOf(o)} /></Zone>,
    banks: <Zone zone="charts"><BanksCard {...c} /></Zone>,
    expenses: <Zone zone="charts"><ExpensesCard {...c} /></Zone>,
    ar_aging: <Zone zone="charts"><ArAgingCard {...c} /></Zone>,
  };
}

/** /pro/accounting — the finance home above the «كل المحاسبة» directory: shortcuts, KPI row (featured bank balance), finance cards. */
const ACC_BLOCKS: PageBlockDef[] = [SHORTCUTS_BLOCK, { id: "kpis", title: ["Accounting indicators", "مؤشرات المحاسبة"], w: 12, required: true }, ...FINANCE_BLOCKS];
export function AccountingHome(c: Ctx) {
  const def = pageDashboard("digit_pro", "acc:home", ["Accounting home", "الصفحة الرئيسية للمحاسبة"], ACC_BLOCKS, ["Accounts Manager", "Accounts User"]);
  const nodes: PageNodes = { ...financeNodes(c), kpis: <Zone zone="kpis"><AccKpis {...c} /></Zone> };
  return <div className="ek-stack" data-dp-acc-home><PageBlocks def={def} nodes={nodes} company={c.company} addSlot /></div>;
}
