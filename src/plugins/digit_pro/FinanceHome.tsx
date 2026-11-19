// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * SC-F-01 Finance Operations Center (EC-R1 Phase 3a) — the daily controller workspace, distinct from the Executive and
 * CFO views: operational cards, a ranked tabbed work queue (collect / pay / bank / drafts / close / tasks) with a context
 * pane and eligible native actions, AR aging and AP due timing. Every card equals its tab and its drill (command.ts).
 */
import { blockWindow } from "@/lib/dashboards/registry";
import { JournalCards } from "@/components/enterprise/FinanceDesk";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChartCard, Columns, ContextStrip, LINK_CHIP, LinkGroup, money, moneyShort, WorkPanel, type Datum } from "@/components/enterprise/kit";
import { translateTo, useLang } from "@/i18n";
import { adapter } from "@/lib/adapter";
import { cachedMeta, reportsQuery } from "@/lib/catalog";
import { fmtCurrency } from "@/lib/format";
import { scopedList } from "@/lib/scope";
import { hasPerm } from "@/lib/session";
import { makePaymentEntry } from "@/lib/posting";
import { appOf, can, financeContext, slug, sourceStatus } from "./finance";
import { ProFrame, SourceState } from "./ProFrame";
import { COMMAND_DOCTYPES, FIN_TABS, finTabOf, financeOps, freshness, liquidityTiming, roleLabel, type Bi, type FinItem, type FinTab } from "./command";
import { bi, DrillLink, sevLabel, SevDot, Totals } from "./CommandUi";
import { targetHref, type NavItem } from "./nav";
import { useNavResolver } from "./ProSidebar";
import { DeptOverview, bandFacts } from "./DeptOverview";
import { AgingHeat, CashInOut, RatioGauge } from "./richBlocks";
import { proWrap } from "./ProKit";

const TAB_LABEL: Record<FinTab, Bi> = { collect: ["Collect", "التحصيل"], pay: ["Pay", "السداد"], bank: ["Bank & allocation", "البنك والتخصيص"], drafts: ["Drafts", "المسودات"], close: ["Period close", "إقفال الفترة"], tasks: ["My tasks", "مهامي"] };
const TAB_HINT: Record<FinTab, Bi> = {
  collect: ["Overdue sales invoices, oldest first. Record payment creates a draft Payment Entry for review.", "فواتير المبيعات المتأخرة، الأقدم أولًا. تسجيل الدفعة ينشئ قيد دفع مسودة للمراجعة."],
  pay: ["Supplier invoices overdue or due within 7 days. Invoices on hold cannot be paid.", "فواتير الموردين المتأخرة أو المستحقة خلال 7 أيام. الفواتير الموقوفة لا يمكن سدادها."],
  bank: ["Unreconciled bank lines and posted payments without allocation. Matching is confirmed on Bank Reconciliation.", "حركات بنكية غير مسوّاة ودفعات مرحّلة غير مخصصة. تُؤكَّد المطابقة في التسوية البنكية."],
  drafts: ["Draft journal and payment entries. Unbalanced entries cannot be submitted.", "قيود يومية ودفع مسودة. القيود غير المتوازنة لا يمكن اعتمادها."],
  close: ["Close checks for the fiscal year to date with open items; each opens the records it counted.", "فحوص الإقفال من بداية السنة المالية التي بها بنود مفتوحة؛ كل فحص يفتح السجلات التي عدّها."],
  tasks: ["Open ToDos assigned to you on finance documents.", "المهام المفتوحة المسندة إليك على المستندات المالية."],
};
const REPORTS = ["Trial Balance", "Balance Sheet", "Profit and Loss Statement", "Accounts Receivable", "Accounts Payable", "Cash Flow"];

export interface FinanceSearch { company?: string | undefined; kind?: string | undefined; sel?: string | undefined }

export function FinanceHome({ search }: { search: FinanceSearch }) {
  const nav = useNavigate();
  const reps = useQuery(reportsQuery);
  const r = useNavResolver();
  const ar = useLang() === "ar"; const t = (en: string, arabic: string) => (ar ? arabic : en);
  const set = (p: Partial<FinanceSearch>) => void nav({ to: "/pro/finance", search: (prev: FinanceSearch) => ({ ...prev, ...p }) as never, replace: true });
  return (
    <ProFrame bare title={t("Finance Operations Center", "مركز العمليات المالية")} doctypes={COMMAND_DOCTYPES}>
      {({ user }) => {
        const ctx = financeContext(search.company, user);
        if (!ctx.companies.length) return <SourceState status={sourceStatus("Company", user) === "ok" ? "empty" : sourceStatus("Company", user) as "denied"} doctype="Company" />;
        const ops = financeOps(ctx.company, ctx.currency, ctx.fiscalYear?.start, user);
        const tab: FinTab = finTabOf(search.kind) ?? (ops.queues.find((q) => q.status === "ok" && q.items.length)?.tab ?? "collect");
        const q = ops.queues.find((x) => x.tab === tab)!;
        const sel = q.items.find((i) => i.key === search.sel) ?? q.items[0];
        const create = (dt: string) => { const m = cachedMeta(dt); if (!m || !hasPerm(m, "create")) return; const doc = adapter.insert(m); void nav({ to: "/app/$app/$doctype/$name", params: { app: appOf(dt), doctype: slug(dt), name: doc.name } }); };
        const canJe = can("Journal Entry", "create"), canPe = can("Payment Entry", "create");
        const pay = (i: FinItem) => { if (!canPe || (i.doctype !== "Sales Invoice" && i.doctype !== "Purchase Invoice")) return; const pe = makePaymentEntry(i.doctype, i.name); void nav({ to: "/app/$app/$doctype/$name", params: { app: appOf("Payment Entry"), doctype: slug("Payment Entry"), name: pe.name } }); };
        const timing = liquidityTiming(ctx.company, ctx.currency, user);
        // the five operational cards (overdue receivables/payables, bank lines, draft journals, close blockers) are the same
        // figures as the contract tiles FIN.AR_OVERDUE / AP_OVERDUE / BANK_UNMATCHED / JE_DRAFT / CLOSE_BLOCKERS and as the
        // worklist tab counts, so they are shown once — in the contract tiles — and their queues stay in the worklist.
        const apDue = <ChartCard key="ap-due" id="fin-ap-due" size="md" title={t("Supplier invoices by due week", "فواتير الموردين حسب أسبوع الاستحقاق")}
          sub={t("Open purchase invoice balances as of today; purchase orders are commitments, shown on the payables calendar.", "أرصدة فواتير المشتريات المفتوحة حتى اليوم؛ أوامر الشراء التزامات تظهر في تقويم الذمم الدائنة.")}
          action={<Link to="/pro/payables" search={{ company: ctx.company } as never}>{t("Payables calendar", "تقويم الذمم الدائنة")}</Link>}
          footer={<>{t("Total", "الإجمالي")} <b className="tabular-nums" data-no-i18n>{timing.pay.status === "ok" ? fmtCurrency(timing.pay.total, ctx.currency) : "—"}</b></>} attrs={{ "data-dp-fin-apdue": "" }}>
          {timing.pay.status !== "ok" ? <SourceState status={timing.pay.status} doctype="Purchase Invoice" />
            : <Columns ar={ar} wrap={proWrap} fmt={money(ctx.currency)} axisFmt={moneyShort(ctx.currency)} height={180}
              data={timing.pay.bars.map((b): Datum => ({ key: b.key, label: bi(ar, b.label), value: b.amount, count: b.count, tone: b.key === "ap:overdue" ? "risk" : b.key === "ap:w1" ? "attention" : "secondary", ...(b.count ? { drill: b.drill } : {}), attrs: { "data-dp-ap-band": b.key, "data-amount": String(b.amount) } }))} />}
        </ChartCard>;
        const list = (qq: typeof q) => qq.status !== "ok" ? <div className="p-4"><SourceState status={qq.status} /></div> : !qq.items.length ? <div className="p-6 text-sm text-muted-foreground" data-dp-queue-empty>{t("Nothing in this queue.", "لا شيء في هذه القائمة.")}</div> : <>
          <p className="ek-note px-4">{bi(ar, TAB_HINT[qq.tab])}{qq.totals.length > 0 && <> · <b><Totals totals={qq.totals} /></b></>}</p>
          <ul role="listbox" aria-label={bi(ar, TAB_LABEL[qq.tab])} className="ek-rowlist" data-dp-queue={qq.tab}>
            {qq.items.slice(0, 40).map((i) => { const on = sel?.key === i.key;
              return <li key={i.key} role="option" aria-selected={on} tabIndex={0} className="ek-row cursor-pointer" data-on={on ? "" : undefined} data-dp-item={i.key} data-severity={i.severity} onClick={() => set({ sel: i.key, kind: qq.tab })} onKeyDown={(e) => { if (e.key === "Enter") document.querySelector<HTMLAnchorElement>(`[data-dp-open-item="${CSS.escape(i.key)}"]`)?.click(); }}>
                <SevDot sev={i.severity} />
                <span className="ek-row-main"><span className="ek-row-title" data-no-i18n>{i.label ? bi(ar, i.label) : i.name}</span>
                  <span className="ek-row-meta"><span>{bi(ar, i.state)}</span>{i.party && <span data-no-i18n> · {i.party}</span>}{i.doctype && <span> · {translateTo(i.doctype, ar ? "ar" : "en")}</span>}{i.date && <span data-no-i18n> · {i.date}</span>}</span></span>
                <span className="ek-row-amt" data-no-i18n>{i.amount !== null ? <span className={i.severity === "high" && i.tab === "drafts" ? "text-destructive" : ""}>{fmtCurrency(i.amount, i.currency || ctx.currency)}</span> : i.totals?.length ? <Totals totals={i.totals.slice(0, 1)} /> : ""}</span>
              </li>; })}
          </ul>
          {qq.items.length > 40 && <p className="ek-note px-4"><bdi data-no-i18n>{qq.items.length - 40}</bdi> {t("more — open the full register.", "أخرى — افتح السجل الكامل.")}</p>}
          {qq.register && <div className="px-4 py-2"><DrillLink drill={qq.register} className="ek-card-link" data-dp-queue-register={qq.tab}>{t("Open full register", "فتح السجل الكامل")} {ar ? "←" : "→"}</DrillLink></div>}
        </>;
        const work = <WorkPanel id="fin-work" title={t("Work queue", "قائمة العمل")} height={460}
          actions={<span className="ek-tab-n" data-no-i18n data-dp-queue-count={q.items.length}>{q.items.length}</span>}
          tabs={FIN_TABS.map((id) => { const qq = ops.queues.find((x) => x.tab === id)!; return { id, label: bi(ar, TAB_LABEL[id]), count: qq.status === "ok" ? qq.items.length : undefined, tone: qq.items.some((i) => i.severity === "high") ? "risk" as const : undefined, attrs: { "data-dp-kind": id }, content: id === tab ? list(qq) : null }; })}
          active={tab} onTab={(id) => set({ kind: id, sel: undefined })}
          detail={<Detail item={sel} currency={ctx.currency} ar={ar} canPe={canPe} onPay={pay} />} />;
        const finReports = FIN_REPORTS.filter((x) => r.state(x.item) === "ok");
        const contractReports = new Set(["Trial Balance", "Balance Sheet", "Profit and Loss Statement", "Accounts Receivable", "Accounts Payable", "Cash Flow", "General Ledger"]);
        return <div className="dp-cc" data-dp-screen="SC-F-01">
          <DeptOverview dept="finance" boards={["finance", "accounting"]} company={ctx.company} currency={ctx.currency} user={user} ar={ar}
            context={(question) => <div data-dp-context><ContextStrip icon={<img src="/icons/digit/mod/digit-mod-accounts-light.svg" alt="" className="h-7 w-7" />}
              eyebrow={t("DIGIT Pro · Accounting", "ديجيت برو · المحاسبة")} title={t("Finance Operations Center", "مركز العمليات المالية")} sub={question}
              facts={[
                ...(ctx.fiscalYear ? [{ label: t("Fiscal year", "السنة المالية"), value: <bdi data-no-i18n>{ctx.fiscalYear.name}</bdi> }] : []),
                { label: t("As of", "حتى تاريخ"), value: <bdi data-no-i18n>{ops.period.to}</bdi> },
                { label: t("Data updated", "آخر تحديث"), value: <bdi data-no-i18n>{freshness(["GL Entry", "Payment Entry", "Bank Transaction", "Journal Entry"], user) || "—"}</bdi> },
                ...bandFacts(ar, ctx.currency),
                { label: t("Role", "الدور"), value: <bdi data-no-i18n>{roleLabel(user)}</bdi> },
              ]}
              aside={<label className="ek-context-select"><span>{t("Company", "الشركة")}</span><select value={ctx.company} onChange={(e) => set({ company: e.target.value, sel: undefined })} data-dp-company data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>}
              actions={<span className="contents" data-dp-fin-actions>
                {can("Sales Invoice", "create") && <button type="button" className="ek-context-btn" onClick={() => create("Sales Invoice")} data-dp-create="Sales Invoice">+ {translateTo("Sales Invoice", ar ? "ar" : "en")}</button>}
                {canPe && <button type="button" className="ek-context-btn" onClick={() => create("Payment Entry")} data-dp-create="Payment Entry">+ {translateTo("Payment Entry", ar ? "ar" : "en")}</button>}
                {canJe && <button type="button" className="ek-context-btn" onClick={() => create("Journal Entry")} data-dp-create="Journal Entry">+ {translateTo("Journal Entry", ar ? "ar" : "en")}</button>}
                <Link to="/pro/period-control" search={{ company: ctx.company } as never} className="ek-context-btn" data-dp-action="period-control">{t("Period control", "التحكم بالفترات")}</Link>
                <Link to="/pro/bank-reconciliation" search={{ company: ctx.company } as never} className="ek-context-btn" data-dp-action="bank-reconciliation">{t("Bank reconciliation", "التسوية البنكية")}</Link>
                <Link to="/pro/finance-intelligence" search={{ company: ctx.company }} className="ek-context-btn" data-dp-action="intelligence">{t("Finance intelligence", "التحليل المالي")}</Link>
              </span>} /></div>}
            charts={[apDue]}
            rows={[
              { id: "cash-in-out", title: ["Cash in vs cash out", "النقد الداخل مقابل الخارج"], w: 8, period: true, node: (o) => { const w = blockWindow(o, ops.period.to); return <CashInOut company={ctx.company} currency={ctx.currency} user={user} ar={ar} today={w?.to ?? ops.period.to} from={w?.from} />; } },
              { id: "gauge-collection", title: ["Collected of invoiced", "المحصّل من المفوتر"], w: 4, period: true, node: (o) => { const w = blockWindow(o, ops.period.to); return <RatioGauge kind="collection" company={ctx.company} currency={ctx.currency} user={user} ar={ar} from={w?.from ?? ctx.fiscalYear?.start} to={w?.to} />; } },
              { id: "heat-receivable", title: ["Customers × ageing", "العملاء × أعمار الديون"], w: 6, node: <AgingHeat side="receivable" company={ctx.company} currency={ctx.currency} user={user} ar={ar} /> },
              { id: "heat-payable", title: ["Suppliers × due ageing", "الموردون × أعمار الاستحقاق"], w: 6, node: <AgingHeat side="payable" company={ctx.company} currency={ctx.currency} user={user} ar={ar} /> },
            ]}
            stripTitle={["Journal activity", "نشاط القيود"]}
            strip={<JournalCards company={ctx.company} currency={ctx.currency} />}
            work={work}
            links={<>
              {finReports.length > 0 && <LinkGroup id="fin-statements" title={t("Statements and control", "القوائم والرقابة")}>{finReports.map((x) => { const h = targetHref(x.item.target, r.appOf); if (!h) return null;
                return <Link key={x.id} to={h.to as never} params={h.params as never} search={{ ...(h.search ?? {}), company: ctx.company } as never} className={LINK_CHIP} data-dp-fin-report={x.id}>{ar ? x.label[1] : x.label[0]}</Link>; })}</LinkGroup>}
              <LinkGroup id="fin-ledgers" title={t("Ledgers and registers", "الدفاتر والسجلات")}>
                <Link to="/pro/general-ledger" search={{ company: ctx.company, from: "finance" } as never} className={LINK_CHIP} data-dp-report="General Ledger (DIGIT Pro)">{t("General Ledger", "دفتر الأستاذ العام")}</Link>
                <Link to="/pro/accounts" search={{ company: ctx.company } as never} className={LINK_CHIP}>{t("Chart of Accounts", "دليل الحسابات")}</Link>
                <Link to="/pro/trial-balance" search={{ company: ctx.company } as never} className={LINK_CHIP} data-dp-action="trial-balance">{t("Trial balance", "ميزان المراجعة")}</Link>
                {REPORTS.filter((x) => !contractReports.has(x) || !reps.data?.some((y) => y.name === x)).map((x) => reps.data?.some((y) => y.name === x) ? <Link key={x} to="/report/$name" params={{ name: x }} search={{ company: ctx.company } as never} className={LINK_CHIP} data-dp-report={x}>{translateTo(x, ar ? "ar" : "en")}</Link> : <span key={x} className="ek-row-meta" data-dp-report-missing={x}>{translateTo(x, ar ? "ar" : "en")} · {t("Source unavailable", "المصدر غير متاح")}</span>)}
              </LinkGroup>
            </>} />
        </div>;
      }}
    </ProFrame>
  );
}

function Detail({ item, currency, ar, canPe, onPay }: { item: FinItem | undefined; currency: string; ar: boolean; canPe: boolean; onPay: (i: FinItem) => void }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  if (!item) return <section className="dp-cc-panel" data-dp-detail="none"><div className="dp-cc-panel-h"><h2>{t("Details", "التفاصيل")}</h2></div><div className="dp-cc-panel-b"><SourceState status="empty" /></div></section>;
  if (item.tab === "close") return <section className="dp-cc-panel" data-dp-detail={item.key}>
    <div className="dp-cc-panel-h"><h2>{t("Close check", "فحص الإقفال")}</h2><span className="dp-cc-badge" data-tone={item.severity === "high" ? "bad" : undefined}>{sevLabel(item.severity, ar)}</span></div>
    <div className="dp-cc-panel-b"><p className="font-semibold">{item.label ? bi(ar, item.label) : item.name}</p><p className="mt-1 text-sm">{bi(ar, item.state)}</p>{item.totals && item.totals.length > 0 && <p className="mt-1 text-sm"><Totals totals={item.totals} /></p>}
      <DrillLink drill={item.target} className="btn-primary mt-3 inline-flex" data-dp-open data-dp-open-item={item.key}>{t("Open the records", "فتح السجلات")}</DrillLink>
      <p className="mt-3 dp-cc-note">{t("Counts show what needs a decision; they do not close the period or post anything.", "الأعداد تبيّن ما يحتاج قرارًا؛ ولا تقفل الفترة ولا ترحّل أي شيء.")}</p></div>
  </section>;
  const target = item.reference ?? { doctype: item.doctype, name: item.name };
  const doc = adapter.get(target.doctype, target.name);
  const gl = sourceStatus("GL Entry") === "ok" ? scopedList("GL Entry").filter((g) => g["voucher_no"] === target.name && !Number(g["is_cancelled"])) : [];
  const related = target.doctype === "Journal Entry" ? [...new Set(((doc?.["accounts"] as Record<string, unknown>[] | undefined) ?? []).filter((r) => r["reference_name"]).map((r) => `${r["reference_type"]}|${r["reference_name"]}`))]
    : (target.doctype === "Sales Invoice" || target.doctype === "Purchase Invoice") ? [...new Set(((doc?.["items"] as Record<string, unknown>[] | undefined) ?? []).flatMap((r) => [r["sales_order"] ? `Sales Order|${r["sales_order"]}` : "", r["delivery_note"] ? `Delivery Note|${r["delivery_note"]}` : "", r["purchase_order"] ? `Purchase Order|${r["purchase_order"]}` : "", r["purchase_receipt"] ? `Purchase Receipt|${r["purchase_receipt"]}` : ""]).filter(Boolean))] : [];
  const canAct = item.action && (item.action === "reconcile" || canPe);
  return (
    <section className="dp-cc-panel" data-dp-detail={`${item.doctype}|${item.name}`}>
      <div className="dp-cc-panel-h"><h2>{t("Details", "التفاصيل")}</h2><span className="chip bg-muted">{translateTo(target.doctype, ar ? "ar" : "en")}</span><span className="dp-cc-badge ms-auto" data-tone={item.severity === "high" ? "bad" : undefined}>{sevLabel(item.severity, ar)}</span></div>
      <div className="dp-cc-panel-b">
        <p className="text-lg font-semibold" data-no-i18n>{target.name}</p>
        <p className="text-sm text-muted-foreground">{bi(ar, item.state)}</p>
        <dl className="dp-dl mt-2">
          <dt>{t("Status", "الحالة")}</dt><dd>{translateTo(String(doc?.["status"] ?? (Number(doc?.docstatus) === 1 ? "Submitted" : Number(doc?.docstatus) === 2 ? "Cancelled" : "Draft")), ar ? "ar" : "en")}</dd>
          {item.date && <><dt>{item.tab === "collect" || item.tab === "pay" ? t("Due date", "تاريخ الاستحقاق") : t("Date", "التاريخ")}</dt><dd data-no-i18n>{item.date}</dd></>}
          {item.party && <><dt>{t("Party", "الطرف")}</dt><dd data-no-i18n>{item.party}</dd></>}
          {item.amount !== null && <><dt>{item.tab === "collect" || item.tab === "pay" ? t("Outstanding", "المتبقي") : t("Amount", "المبلغ")}</dt><dd className="tabular-nums" data-no-i18n>{fmtCurrency(item.amount, item.currency || currency)}</dd></>}
          {doc?.["company"] !== undefined && <><dt>{t("Company", "الشركة")}</dt><dd data-no-i18n>{String(doc["company"])}</dd></>}
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <DrillLink drill={item.reference ? { kind: "doc", doctype: target.doctype, name: target.name } : item.target} className={canAct ? "btn-ghost" : "btn-primary"} data-dp-open data-dp-open-item={item.key}>{item.action === "reconcile" ? t("Reconcile", "تسوية") : can(target.doctype, "write", doc) ? t("Open and edit", "فتح وتعديل") : t("Open", "فتح")}</DrillLink>
          {canAct && item.action !== "reconcile" && <button type="button" className="btn-primary" onClick={() => onPay(item)} data-dp-action-pay={item.name}>{item.action === "receive" ? t("Record payment", "تسجيل دفعة") : t("Pay", "سداد")}</button>}
          {gl.length > 0 && <Link to="/pro/general-ledger" search={{ voucher_no: target.name, company: String(doc?.["company"] ?? ""), from_date: "", from: "finance" } as never} className="btn-ghost" data-dp-detail-gl>{t("Ledger entries", "قيود الأستاذ")}</Link>}
        </div>
        {item.action && !canPe && item.action !== "reconcile" && <p className="mt-2 dp-cc-note">{t("Creating payments is not permitted for your role.", "إنشاء الدفعات غير مسموح لدورك.")}</p>}
        {related.length > 0 && <div className="mt-3"><p className="text-xs text-muted-foreground">{t("Linked documents", "المستندات المرتبطة")}</p>
          <div className="mt-1 flex flex-wrap gap-1">{related.map((k) => { const [dt, nm] = k.split("|") as [string, string]; return <Link key={k} to="/app/$app/$doctype/$name" params={{ app: appOf(dt), doctype: slug(dt), name: nm }} className="chip bg-muted hover:bg-primary/10" title={dt} data-no-i18n>{nm}</Link>; })}</div></div>}
        <p className="mt-3 text-[11px] text-muted-foreground"><span>{t("GL entries", "قيود الأستاذ")}</span>: <span data-no-i18n>{gl.length}</span></p>
      </div>
    </section>
  );
}

/** OWN-35: the overview reaches every financial view — statements, P&L, balance sheet, cash flow, gross profit, cost centers,
 * dimensions, trial balance, VAT, audit and period close — each on its own screen with the company carried over; links the
 * user cannot open are hidden (owner decision: denied = hidden). */
const FIN_REPORTS: { id: string; label: [string, string]; item: NavItem }[] = [
  { id: "statements", label: ["Financial statements", "القوائم المالية"], item: { label: "Financial statements", target: { kind: "pro", to: "/pro/statements" } } },
  { id: "pl", label: ["Profit and loss", "قائمة الدخل"], item: { label: "Profit and Loss Statement", target: { kind: "pro", to: "/pro/statements", search: { report: "Profit and Loss Statement" } } } },
  { id: "bs", label: ["Balance sheet", "الميزانية العمومية"], item: { label: "Balance Sheet", target: { kind: "pro", to: "/pro/statements", search: { report: "Balance Sheet" } } } },
  { id: "cf", label: ["Cash flow", "التدفقات النقدية"], item: { label: "Cash Flow", target: { kind: "pro", to: "/pro/statements", search: { report: "Cash Flow" } } } },
  { id: "gp", label: ["Gross profit", "إجمالي الربح"], item: { label: "Gross Profit", target: { kind: "report", report: "Gross Profit" } } },
  { id: "cc", label: ["Cost centers", "مراكز التكلفة"], item: { label: "Cost centers", target: { kind: "pro", to: "/pro/cost-centers" } } },
  { id: "dim", label: ["By dimension", "حسب الأبعاد"], item: { label: "Dimension-wise Accounts Balance Report", target: { kind: "report", report: "Dimension-wise Accounts Balance Report" } } },
  { id: "tb", label: ["Trial balance", "ميزان المراجعة"], item: { label: "Trial balance", target: { kind: "pro", to: "/pro/trial-balance" } } },
  { id: "vat", label: ["VAT return", "إقرار ضريبة القيمة المضافة"], item: { label: "VAT", target: { kind: "pro", to: "/pro/vat" } } },
  { id: "audit", label: ["Audit and controls", "التدقيق والضوابط"], item: { label: "Audit", target: { kind: "pro", to: "/pro/audit" } } },
  { id: "close", label: ["Period close", "إقفال الفترة"], item: { label: "Period control", target: { kind: "pro", to: "/pro/period-control" } } },
];
