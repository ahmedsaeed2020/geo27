/**
 * CSH-01 Project cash flow (fin/cashflow) and ADV-01 Advance & retention hub (fin/advances).
 * Both are read models (domain/cashflow.ts, domain/advances.ts): every figure opens the exact lines it sums, and the
 * only write offered is a native local draft of a Digit Retention Release Request (its approval stays policy-gated by P2).
 * Project, period, scenario, tab, schedule and inspector selections live in the URL.
 */
import { canSeeRecord, restrictedLabel } from "../domain/access";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { PluginPageProps } from "@/plugins/pages";
import { cachedMeta } from "@/lib/catalog";
import { hasPerm } from "@/lib/session";
import { formatRowAnchor } from "@/lib/rowAnchor";
import { useScopeMetas } from "@/lib/scope";
import { ACTUAL_LANES, cashFlow, IN_LANES, OUT_LANES, weekStart, type CashException, type CashLane, type CashLine, type Confidence, type Scenario, type Slot } from "../domain/cashflow";
import { scheduleTotals, schedulesOf, type MoveKind, type Schedule, type ScheduleFlag, type ScheduleKind, type Stream } from "../domain/advances";
import { get, projectTitle, today } from "../domain/data";
import { constructionProjects } from "../domain/queues";
import { OPTION_AR } from "../schema";
import { amount, AppLink, BTN, compact, DataTable, DocRef, Empty, Field, Filters, inputCls, Kpi, KpiGrid, money, NewDoc, Note, PageHeader, PolicyGate, Section, useCx, dateTxt, type Col } from "./kit";
import { DateInput } from "@/components/form/DateInput";

const NATIVE = ["Project", "Payment Entry", "Sales Invoice", "Purchase Invoice", "Purchase Order", "Customer", "Supplier", "Digit Client Contract", "Digit Client Certificate", "Digit Subcontract Work Order", "Digit Subcontractor Bill", "Digit Retention Release Request", "Digit Cashflow Forecast Item"];
const CRUMBS = (t: (en: string, ar: string) => string) => [{ label: t("Financial position & closeout", "الموقف المالي والإغلاق"), to: "dept/fin" }];
const canCreate = (dt: string) => { const m = cachedMeta(dt); return !!m && hasPerm(m, "create"); };
const CAT_AR: Record<string, string> = { Labour: "عمالة", Equipment: "معدات", Overhead: "مصاريف عامة", Other: "أخرى" };
const optAr = (v: string, ar: boolean) => (ar ? OPTION_AR[v] ?? CAT_AR[v] ?? v : v);
// a counterparty the session user may not read is never shown by name or code (domain/access.ts)
const partyName = (p: string, en = true) => {
  const c = get("Customer", p), s = get("Supplier", p);
  if (c) return String(c["customer_name"] ?? p);
  if (s) return String(s["supplier_name"] ?? p);
  return canSeeRecord("Customer", p) && canSeeRecord("Supplier", p) ? p : restrictedLabel(en);
};
const Chip = ({ tone, children }: { tone: string; children: ReactNode }) => <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${tone}`}>{children}</span>;

function useUrl(path: string) {
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const str = (k: string) => (typeof search[k] === "string" ? String(search[k]) : typeof search[k] === "number" ? String(search[k]) : "");
  const set = (p: Record<string, string>) => void nav({ to: "/plugins/$name/$", params: { name: "digit_construction", _splat: path }, search: Object.fromEntries(Object.entries({ ...search, ...p }).filter(([, v]) => v !== "" && v !== undefined)) as never, replace: true });
  return { str, set };
}
function ProjectPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t, ar } = useCx();
  return (
    <Field label={t("Project", "المشروع")}>
      <select className={inputCls} value={value} data-cash-filter="project" onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("Select a project…", "اختر مشروعًا…")}</option>
        {constructionProjects().map((p) => <option key={p.name} value={p.name} data-no-i18n>{projectTitle(p, !ar)}</option>)}
      </select>
    </Field>
  );
}
const srcRef = (l: { doctype: string; name: string; table: string; row: number }) => <DocRef doctype={l.doctype} name={l.name} row={l.table && l.row ? formatRowAnchor(l.table, l.row) : undefined} />;

// ---------------------------------------------------------------- CSH-01
const LANE: Record<CashLane, [string, string]> = {
  receipt_actual: ["Collected (actual)", "المحصّل (فعلي)"], receivable_due: ["Client invoices due", "فواتير عملاء مستحقة"], certified_not_invoiced: ["Certified, not invoiced", "معتمد غير مفوتر"], plan_in: ["Planned inflow", "تدفق داخل مخطط"],
  payment_actual: ["Paid (actual)", "المدفوع (فعلي)"], payable_due: ["Supplier invoices due", "فواتير موردين مستحقة"], subcontract_approved: ["Approved subcontract bills", "مستخلصات مقاولين معتمدة"], open_order: ["Open purchase orders", "أوامر شراء مفتوحة"], plan_out: ["Planned outflow", "تدفق خارج مخطط"],
};
const CONF: Record<Confidence, [string, string, string]> = { Actual: ["Actual", "فعلي", "bg-success/15 text-success"], "Due date": ["Due date", "تاريخ الاستحقاق", "bg-primary/10 text-primary"], Estimated: ["Estimated", "تقديري", "bg-warning/15 text-warning"], "Unknown date": ["Unknown date", "تاريخ غير معروف", "bg-muted text-muted-foreground"], Planned: ["Planned", "مخطط", "bg-accent text-accent-foreground"] };
const CEX: Record<CashException["code"], [string, string]> = { RECEIVABLE_OVERDUE: ["Client invoice overdue", "فاتورة عميل متأخرة"], PAYABLE_OVERDUE: ["Supplier invoice overdue", "فاتورة مورد متأخرة"], UNDATED: ["No expected date", "بلا تاريخ متوقع"], PLAN_PAST: ["Plan item in a past month", "بند خطة في شهر سابق"] };
const ASSUME_AR: Record<string, string> = {
  "invoice outstanding": "رصيد الفاتورة القائم", "unallocated (advance)": "غير مخصص (دفعة مقدمة)", "no payment days on the contract; before VAT": "لا توجد مدة سداد في العقد؛ قبل الضريبة",
  "approved bill, no purchase invoice yet; no payment terms on the work order; before VAT": "مستخلص معتمد بلا فاتورة مشتريات بعد؛ لا شروط سداد في أمر العمل؛ قبل الضريبة",
  "open order line (net − billed) at its delivery date; supplier terms not applied; before VAT": "سطر أمر مفتوح (الصافي − المفوتر) في تاريخ توريده؛ دون شروط سداد المورد؛ قبل الضريبة",
};
const assumeTxt = (a: string, ar: boolean) => {
  if (!ar) return a;
  if (ASSUME_AR[a]) return ASSUME_AR[a];
  const m = /^certificate date \+ (\d+) payment days; before VAT$/.exec(a); if (m) return `تاريخ الشهادة + ${m[1]} يوم سداد؛ قبل الضريبة`;
  const p = /^(\w+) monthly plan item placed at the start of (\d{4}-\d{2}); may overlap document lines$/.exec(a); if (p) return `بند خطة شهري (${p[1] === "Committed" ? "ملتزم" : "مخطط"}) في بداية ${p[2]}؛ قد يتداخل مع سطور المستندات`;
  return a.replace("Sales Invoice", "فاتورة مبيعات").replace("Purchase Invoice", "فاتورة مشتريات");
};
type Insp = { kind: "card"; key: "opening" | "expected_in" | "expected_out" | "actual" | "overdue" | "undated" } | { kind: "cell"; lane: CashLane; slot: Slot };
const parseInsp = (v: string): Insp | undefined => {
  if (["opening", "expected_in", "expected_out", "actual", "overdue", "undated"].includes(v)) return { kind: "card", key: v as never };
  const [lane, slot] = v.split("|"); if (!lane || slot === undefined || !(lane in LANE)) return undefined;
  return { kind: "cell", lane: lane as CashLane, slot: /^\d+$/.test(slot) ? Number(slot) : slot as Slot };
};

export function CashFlowPage(_: PluginPageProps) {
  const { t, ar } = useCx();
  useScopeMetas(NATIVE);
  const { str, set } = useUrl("fin/cashflow");
  const projects = constructionProjects();
  const project = projects.some((p) => p.name === str("project")) ? str("project") : "";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(str("from")) ? str("from") : "";
  const weeks = [4, 8, 13, 26].includes(Number(str("weeks"))) ? Number(str("weeks")) : 13;
  const scenario: Scenario = str("scenario") === "plan" ? "plan" : "documents";
  const title = t("Project cash flow", "التدفق النقدي للمشروع");
  const filters = (
    <Filters>
      <ProjectPick value={project} onChange={(v) => set({ project: v, insp: "" })} />
      <Field label={t("From week of", "من أسبوع")}><DateInput className={inputCls} value={from} data-cash-filter="from" onChange={(e) => set({ from: e.target.value, insp: "" })} /></Field>
      <Field label={t("Weeks", "عدد الأسابيع")}><select className={inputCls} value={weeks} data-cash-filter="weeks" onChange={(e) => set({ weeks: e.target.value, insp: "" })}>{[4, 8, 13, 26].map((w) => <option key={w} value={w} data-no-i18n>{w}</option>)}</select></Field>
      <Field label={t("Scenario", "السيناريو")}><select className={inputCls} value={scenario} data-cash-filter="scenario" onChange={(e) => set({ scenario: e.target.value === "plan" ? "plan" : "", insp: "" })}>
        <option value="documents">{t("Documents only", "المستندات فقط")}</option><option value="plan">{t("Documents + planned items", "المستندات + البنود المخططة")}</option></select></Field>
    </Filters>
  );
  if (!project || !from) return (
    <div className="w-full min-w-0" data-page="construction-cashflow">
      <PageHeader title={title} crumbs={CRUMBS(t)} subtitle={t("Weekly receipts and payments of one project: actual payments, invoices due, certified work not yet invoiced and open orders — each with its source and confidence.", "مقبوضات ومدفوعات المشروع أسبوعيًا: المدفوعات الفعلية والفواتير المستحقة والأعمال المعتمدة غير المفوترة والأوامر المفتوحة — لكل سطر مصدره ودرجة الثقة.")} />
      {filters}
      <Empty>{!projects.length ? t("No construction projects you can read.", "لا توجد مشاريع مقاولات يمكنك قراءتها.") : !project ? t("Select a project.", "اختر مشروعًا.") : <span>{t("Choose the first week of the view.", "اختر أول أسبوع في العرض.")} <button type="button" className={`${BTN.secondary} ms-2`} data-cash-this-week onClick={() => set({ from: weekStart(today()) })}>{t("Start this week", "ابدأ من هذا الأسبوع")}</button></span>}</Empty>
    </div>
  );
  const cf = cashFlow(project, from, weeks, scenario);
  const insp = parseInsp(str("insp"));
  const self = (v: string) => set({ insp: str("insp") === v ? "" : v });
  const slotLabel = (s: Slot) => (typeof s === "number" ? `${t("W", "أسبوع ")}${s + 1}` : s === "overdue" ? t("Overdue", "متأخر") : s === "later" ? t("Later", "لاحقًا") : s === "undated" ? t("Undated", "بلا تاريخ") : t("Before", "قبل"));
  const slots: Slot[] = ["overdue", ...cf.periods.map((_, i) => i), "later", "undated"];
  const cell = (lane: CashLane, s: Slot) => cf.lines.filter((l) => l.lane === lane && l.slot === s);
  const amt = (ls: CashLine[]) => ls.reduce((a, l) => a + l.amount, 0);
  const inspLines: CashLine[] = !insp ? [] : insp.kind === "cell" ? cell(insp.lane, insp.slot)
    : insp.key === "opening" ? cf.lines.filter((l) => l.slot === "before")
    : insp.key === "actual" ? cf.lines.filter((l) => typeof l.slot === "number" && ACTUAL_LANES.has(l.lane))
    : insp.key === "overdue" ? cf.lines.filter((l) => l.slot === "overdue") : insp.key === "undated" ? cf.lines.filter((l) => l.slot === "undated")
    : cf.lines.filter((l) => typeof l.slot === "number" && !ACTUAL_LANES.has(l.lane) && l.direction === (insp.key === "expected_in" ? 1 : -1));
  const inspTitle = !insp ? "" : insp.kind === "cell" ? `${ar ? LANE[insp.lane][1] : LANE[insp.lane][0]} · ${slotLabel(insp.slot)}${typeof insp.slot === "number" ? ` (${dateTxt(cf.periods[insp.slot]!.start)} – ${dateTxt(cf.periods[insp.slot]!.end)})` : ""}`
    : ({ opening: t("Opening cash — payments before the period", "النقد الافتتاحي — المدفوعات قبل الفترة"), actual: t("Actual payments in the period", "المدفوعات الفعلية في الفترة"), expected_in: t("Expected receipts in the period", "المقبوضات المتوقعة في الفترة"), expected_out: t("Expected payments in the period", "المدفوعات المتوقعة في الفترة"), overdue: t("Overdue — not in the closing", "متأخر — غير محتسب في الرصيد الختامي"), undated: t("Undated — not in the closing", "بلا تاريخ — غير محتسب في الرصيد الختامي") } as const)[insp.key];
  const lineCols: Col<CashLine & Record<string, unknown>>[] = [
    { key: "name", label: t("Source", "المصدر"), render: (l) => srcRef(l) },
    { key: "lane", label: t("Category", "الفئة"), render: (l) => <span>{ar ? LANE[l.lane][1] : LANE[l.lane][0]}</span> },
    { key: "date", label: t("Date", "التاريخ"), render: (l) => <span data-no-i18n>{l.date ? dateTxt(l.date) : "—"}</span> },
    { key: "party", label: t("Party / category", "الطرف / الفئة"), render: (l) => <span data-no-i18n>{l.doctype === "Digit Cashflow Forecast Item" ? optAr(l.party, ar) : partyName(l.party, !ar)}</span> },
    { key: "confidence", label: t("Confidence", "الثقة"), render: (l) => <Chip tone={CONF[l.confidence][2]}>{ar ? CONF[l.confidence][1] : CONF[l.confidence][0]}</Chip> },
    { key: "assumption", label: t("Basis", "الأساس"), render: (l) => <span className="text-xs text-muted-foreground" data-no-i18n>{assumeTxt(l.assumption, ar)}</span> },
    { key: "signed", label: t("Amount", "المبلغ"), get: (l) => l.amount * l.direction, kind: "money", total: true },
  ];
  const cardTo = (k: string) => { const sp = new URLSearchParams({ project, from, ...(weeks !== 13 ? { weeks: String(weeks) } : {}), ...(scenario === "plan" ? { scenario } : {}), ...(str("insp") === k ? {} : { insp: k }) }); return `fin/cashflow?${sp.toString()}`; };
  const fmt = (n: number) => (Math.abs(n) < 0.005 ? "" : compact(n, ar));
  const rowFor = (lane: CashLane) => (
    <tr key={lane} className="border-b border-border/60">
      <th scope="row" className="sticky start-0 z-10 whitespace-nowrap bg-card px-2 py-1.5 text-start font-normal">{ar ? LANE[lane][1] : LANE[lane][0]}</th>
      {slots.map((s) => { const ls = cell(lane, s); const v = amt(ls); const key = `${lane}|${s}`; const on = str("insp") === key;
        return <td key={String(s)} className={`px-1.5 py-1.5 text-end tabular-nums ${typeof s !== "number" ? "bg-muted/40" : ""}`}>{v ? <button type="button" className={`rounded px-1 hover:underline ${on ? "bg-primary/10 text-primary" : "text-foreground"}`} data-cash-cell={key} aria-pressed={on} onClick={() => self(key)}><span data-no-i18n>{fmt(v)}</span></button> : <span className="text-muted-foreground/50">·</span>}</td>; })}
    </tr>
  );
  const totalRow = (label: string, lanes: CashLane[], tone: string) => (
    <tr className={`border-b border-border font-semibold ${tone}`}>
      <th scope="row" className="sticky start-0 z-10 bg-card px-2 py-1.5 text-start">{label}</th>
      {slots.map((s) => <td key={String(s)} className={`px-1.5 py-1.5 text-end tabular-nums ${typeof s !== "number" ? "bg-muted/40" : ""}`} data-no-i18n>{fmt(lanes.reduce((a, ln) => a + amt(cell(ln, s)), 0))}</td>)}
    </tr>
  );
  const usedIn = IN_LANES.filter((l) => cf.lines.some((x) => x.lane === l)), usedOut = OUT_LANES.filter((l) => cf.lines.some((x) => x.lane === l));
  return (
    <div className="w-full min-w-0" data-page="construction-cashflow" data-project={project}>
      <PageHeader title={title} crumbs={CRUMBS(t)}
        subtitle={t("Read from posted payments and open documents. Overdue, later and undated lines are listed but never enter the projected closing. Amounts in company currency; certificate and order lines are before VAT.", "مقروء من المدفوعات المرحلة والمستندات المفتوحة. السطور المتأخرة واللاحقة وغير المؤرخة تُعرض ولا تدخل في الرصيد الختامي المتوقع. المبالغ بعملة الشركة؛ سطور الشهادات والأوامر قبل الضريبة.")}
        actions={<><AppLink to={`fin/advances?project=${encodeURIComponent(project)}`} className={BTN.secondary}>{t("Advances & retention", "السلف والمحتجزات")}</AppLink><AppLink to="reports/Construction%20Cashflow" className={BTN.secondary}>{t("Monthly cashflow report", "تقرير التدفق الشهري")}</AppLink></>} />
      {filters}
      <p className="mb-2 text-sm" data-no-i18n>{projectTitle(get("Project", project), !ar)} · {dateTxt(cf.periods[0]!.start)} – {dateTxt(cf.periods[cf.periods.length - 1]!.end)} · {scenario === "plan" ? t("documents + planned items", "المستندات + البنود المخططة") : t("documents only", "المستندات فقط")}</p>
      <KpiGrid>
        <Kpi label={t("Opening cash", "النقد الافتتاحي")} value={compact(cf.cards.opening, ar)} hint={t("net payments before the period", "صافي المدفوعات قبل الفترة")} to={cardTo("opening")} tone={str("insp") === "opening" ? "info" : "default"} />
        <Kpi label={t("Expected receipts", "المقبوضات المتوقعة")} value={compact(cf.cards.expected_in, ar)} to={cardTo("expected_in")} tone={str("insp") === "expected_in" ? "info" : "good"} />
        <Kpi label={t("Expected payments", "المدفوعات المتوقعة")} value={compact(cf.cards.expected_out, ar)} to={cardTo("expected_out")} tone={str("insp") === "expected_out" ? "info" : "warn"} />
        <Kpi label={t("Actual in the period", "الفعلي في الفترة")} value={compact(cf.cards.actual_net, ar)} hint={t("net of receipts and payments", "صافي المقبوضات والمدفوعات")} to={cardTo("actual")} tone={str("insp") === "actual" ? "info" : "default"} />
        <Kpi label={t("Projected closing", "الرصيد الختامي المتوقع")} value={compact(cf.cards.closing, ar)} tone={cf.cards.closing < 0 ? "bad" : "good"} />
        <Kpi label={t("Overdue / undated (excluded)", "متأخر / بلا تاريخ (مستبعد)")} value={<span data-no-i18n>+{compact(cf.cards.overdue_in + cf.cards.undated_in, ar)} / −{compact(cf.cards.overdue_out + cf.cards.undated_out, ar)}</span>} to={cardTo(cf.cards.overdue_in + cf.cards.overdue_out ? "overdue" : "undated")} />
      </KpiGrid>
      {insp && <Section id="cash-inspector" title={<span>{inspTitle}</span>} actions={<button type="button" className={BTN.compact} onClick={() => set({ insp: "" })}>{t("Close", "إغلاق")}</button>}>
        <div data-cash-inspector={str("insp")}>
          <DataTable<CashLine & Record<string, unknown>> rows={inspLines as (CashLine & Record<string, unknown>)[]} cols={lineCols} rowKey={(l) => l.key} empty={t("No lines", "لا سطور")} pageSize={30} />
        </div>
      </Section>}
      <Section title={t("Weekly view", "العرض الأسبوعي")}>
        <div className="overflow-x-auto" data-cash-grid>
          <table className="w-full min-w-[56rem] text-xs">
            <thead><tr className="border-b border-border text-muted-foreground">
              <th className="sticky start-0 z-10 bg-card px-2 py-1.5 text-start font-medium">{t("Category", "الفئة")}</th>
              {slots.map((s) => <th key={String(s)} className={`px-1.5 py-1.5 text-end font-medium ${typeof s !== "number" ? "bg-muted/40" : ""}`} title={typeof s === "number" ? `${dateTxt(cf.periods[s]!.start)} – ${dateTxt(cf.periods[s]!.end)}` : undefined}><div>{slotLabel(s)}</div>{typeof s === "number" && <div className="font-normal" data-no-i18n>{dateTxt(cf.periods[s]!.start).slice(0, 5)}</div>}</th>)}
            </tr></thead>
            <tbody>
              {usedIn.map(rowFor)}
              {totalRow(t("Total in", "إجمالي الداخل"), usedIn, "text-success")}
              {usedOut.map(rowFor)}
              {totalRow(t("Total out", "إجمالي الخارج"), usedOut, "text-destructive")}
              <tr className="border-b border-border font-semibold"><th scope="row" className="sticky start-0 z-10 bg-card px-2 py-1.5 text-start">{t("Net (in − out)", "الصافي (داخل − خارج)")}</th>
                {slots.map((s) => <td key={String(s)} className={`px-1.5 py-1.5 text-end tabular-nums ${typeof s !== "number" ? "bg-muted/40" : ""}`} data-no-i18n>{typeof s === "number" ? fmt(cf.net[s]!) : ""}</td>)}</tr>
              <tr className="font-semibold" data-cash-closing><th scope="row" className="sticky start-0 z-10 bg-card px-2 py-1.5 text-start">{t("Projected closing", "الرصيد الختامي المتوقع")}</th>
                {slots.map((s) => <td key={String(s)} className={`px-1.5 py-1.5 text-end tabular-nums ${typeof s !== "number" ? "bg-muted/40" : cf.closing[s]! < 0 ? "text-destructive" : ""}`} data-no-i18n>{typeof s === "number" ? compact(cf.closing[s]!, ar) : ""}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("Select a figure to see its source lines. Opening + each week's net gives the closing; grey columns are listed for follow-up only.", "اختر رقمًا لعرض سطوره المصدر. الافتتاحي + صافي كل أسبوع = الرصيد الختامي؛ الأعمدة الرمادية للمتابعة فقط.")}</p>
      </Section>
      {cf.exceptions.length > 0 && <Section title={t("Needs attention", "تحتاج متابعة")}>
        <ul className="divide-y divide-border text-sm" data-cash-exceptions>
          {cf.exceptions.map((e) => <li key={`${e.code}-${e.line.key}`} className="flex flex-wrap items-center gap-2 py-1.5">
            <Chip tone={e.code === "UNDATED" || e.code === "PLAN_PAST" ? "bg-muted text-muted-foreground" : "bg-warning/15 text-warning"}>{ar ? CEX[e.code][1] : CEX[e.code][0]}</Chip>
            {srcRef(e.line)}<span data-no-i18n>{e.line.doctype === "Digit Cashflow Forecast Item" ? optAr(e.line.party, ar) : partyName(e.line.party, !ar)}</span>
            <span className="text-xs text-muted-foreground" data-no-i18n>{e.line.date ? dateTxt(e.line.date) : "—"} · {money(e.line.amount)}</span>
          </li>)}
        </ul>
      </Section>}
    </div>
  );
}

// ---------------------------------------------------------------- ADV-01
const KIND: Record<ScheduleKind, [string, string]> = { advance: ["Advance", "دفعة مقدمة"], retention: ["Retention", "محتجزات"] };
const STREAM: Record<Stream, [string, string]> = { client: ["Client", "العميل"], subcontract: ["Subcontract", "مقاول باطن"] };
const MOVE: Record<MoveKind, [string, string]> = { receipt: ["Received", "مستلمة"], payment: ["Paid", "مدفوعة"], recovery: ["Recovered", "مستردة"], held: ["Held", "محتجزة"], released: ["Released", "مُفرج عنها"], reserved: ["Release requested", "طلب إفراج"] };
const SFLAG: Record<ScheduleFlag, [string, string, string]> = {
  ADVANCE_NO_EVIDENCE: ["No payment found for the advance", "لا يوجد سداد مسجل للدفعة المقدمة", "bg-warning/15 text-warning"],
  ADVANCE_OVER_RECOVERED: ["Recovered more than the advance", "المسترد أكبر من الدفعة المقدمة", "bg-destructive/10 text-destructive"],
  ADVANCE_OPEN_AT_COMPLETION: ["Advance not fully recovered at completion", "الدفعة المقدمة غير مستردة بالكامل عند الإنجاز", "bg-destructive/10 text-destructive"],
  RETENTION_ABOVE_CAP: ["Retention above the cap", "المحتجزات فوق السقف", "bg-destructive/10 text-destructive"],
  RELEASE_EXCEEDS_HELD: ["Releases exceed retention held", "الإفراجات أكبر من المحتجز", "bg-destructive/10 text-destructive"],
  RELEASE_BLOCKED_P2: ["Release approval waits on policy P2", "اعتماد الإفراج بانتظار السياسة P2", "bg-warning/15 text-warning"],
  MISSING_DATE: ["Movement without a date", "حركة بلا تاريخ", "bg-muted text-muted-foreground"],
};
type Tab = ScheduleKind | "exceptions";
const NOTE_AR: Record<string, string> = { Partial: "جزئي", Final: "نهائي", "Pending Approval": "بانتظار الاعتماد", Approved: "معتمد", Draft: "مسودة", Rejected: "مرفوض" };
const noteTxt = (n: string, ar: boolean) => (ar ? n.split(" · ").map((x) => NOTE_AR[x] ?? x).join(" · ") : n);
export function AdvancesPage(_: PluginPageProps) {
  const { t, ar } = useCx();
  useScopeMetas(NATIVE);
  const { str, set } = useUrl("fin/advances");
  const projects = constructionProjects();
  const project = projects.some((p) => p.name === str("project")) ? str("project") : "";
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(str("as_of")) ? str("as_of") : "";
  const tab: Tab = str("tab") === "retention" ? "retention" : str("tab") === "exceptions" ? "exceptions" : "advance";
  const stream = str("stream") === "client" || str("stream") === "subcontract" ? (str("stream") as Stream) : "";
  const title = t("Advances & retention", "السلف والمحتجزات");
  const filters = (
    <Filters>
      <ProjectPick value={project} onChange={(v) => set({ project: v, schedule: "" })} />
      <Field label={t("As of (empty = all dates)", "حتى تاريخ (فارغ = كل التواريخ)")}><DateInput className={inputCls} value={asOf} max={today()} data-cash-filter="as_of" onChange={(e) => set({ as_of: e.target.value })} /></Field>
      <Field label={t("Party", "الطرف")}><select className={inputCls} value={stream} data-cash-filter="stream" onChange={(e) => set({ stream: e.target.value, schedule: "" })}><option value="">{t("Client and subcontract", "العميل ومقاولو الباطن")}</option><option value="client">{t("Client", "العميل")}</option><option value="subcontract">{t("Subcontract", "مقاول باطن")}</option></select></Field>
    </Filters>
  );
  if (!project) return (
    <div className="w-full min-w-0" data-page="construction-advances">
      <PageHeader title={title} crumbs={CRUMBS(t)} subtitle={t("Contract advance and retention terms, and every movement recorded against them.", "شروط الدفعة المقدمة والمحتجزات في العقود، وكل حركة مسجلة عليها.")} />
      {filters}
      <Empty>{projects.length ? t("Select a project.", "اختر مشروعًا.") : t("No construction projects you can read.", "لا توجد مشاريع مقاولات يمكنك قراءتها.")}</Empty>
    </div>
  );
  const all = schedulesOf(project, asOf || undefined).filter((s) => !stream || s.stream === stream);
  const tot = scheduleTotals(all);
  const shown = tab === "exceptions" ? all.filter((s) => s.flags.length) : all.filter((s) => s.kind === tab);
  const sel = all.find((s) => s.id === str("schedule"));
  const tabBtn = (k: Tab, label: string, n: number) => <button key={k} type="button" role="tab" aria-selected={tab === k} data-adv-tab={k} className={`border-b-2 px-3 py-2 text-sm ${tab === k ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`} onClick={() => set({ tab: k === "advance" ? "" : k, schedule: "" })}>{label} <span className="text-xs" data-no-i18n>{n}</span></button>;
  const cols: Col<Schedule & Record<string, unknown>>[] = [
    { key: "contract", label: t("Contract", "العقد"), render: (s) => <button type="button" className="text-start text-primary hover:underline" data-adv-schedule={s.id} aria-expanded={sel?.id === s.id} onClick={() => set({ schedule: sel?.id === s.id ? "" : s.id })}><div data-no-i18n>{s.contract}</div>{s.contract_title !== s.contract && <div className="text-xs text-muted-foreground" data-no-i18n>{s.contract_title}</div>}</button> },
    { key: "kind", label: t("Kind", "النوع"), render: (s) => <span>{ar ? KIND[s.kind][1] : KIND[s.kind][0]} · {ar ? STREAM[s.stream][1] : STREAM[s.stream][0]}</span> },
    { key: "counterparty", label: t("Party", "الطرف"), render: (s) => <span data-no-i18n>{partyName(s.counterparty, !ar)}</span> },
    { key: "terms", label: t("Terms", "الشروط"), render: (s) => <span className="text-xs" data-no-i18n>{s.term_pct ? `${s.term_pct}%` : "—"}{s.cap_pct ? ` · ${t("cap", "سقف")} ${s.cap_pct}%` : ""}</span> },
    { key: "term_amount", label: t("Term amount", "مبلغ الشرط"), render: (s) => <span className="tabular-nums" data-no-i18n>{s.term_amount ? amount(s.term_amount) : "—"}</span>, align: "end" },
    { key: "evidence", label: t("Received / held", "المستلم / المحتجز"), kind: "money", total: true },
    { key: "processed", label: t("Recovered / released", "المسترد / المفرج"), kind: "money", total: true },
    { key: "available", label: t("Remaining", "المتبقي"), kind: "money", total: true },
    { key: "last_event", label: t("Last movement", "آخر حركة"), render: (s) => <span data-no-i18n>{s.last_event ? dateTxt(s.last_event) : "—"}</span> },
    { key: "flags", label: t("Attention", "تنبيه"), render: (s) => (s.flags.length ? <div className="flex max-w-[14rem] flex-wrap gap-1">{s.flags.map((f) => <Chip key={f} tone={SFLAG[f][2]}>{ar ? SFLAG[f][1] : SFLAG[f][0]}</Chip>)}</div> : <span className="text-muted-foreground">—</span>) },
  ];
  return (
    <div className="w-full min-w-0" data-page="construction-advances" data-project={project}>
      <PageHeader title={title} crumbs={CRUMBS(t)}
        subtitle={t("Terms come from the contracts; movements come from certificates, subcontract bills, release requests and payments. A contractual term is not a ledger balance, and nothing is posted from this screen.", "الشروط من العقود؛ والحركات من الشهادات ومستخلصات المقاولين وطلبات الإفراج والمدفوعات. الشرط التعاقدي ليس رصيدًا محاسبيًا، ولا يُرحَّل شيء من هذه الشاشة.")}
        actions={<><AppLink to={`fin/cashflow?project=${encodeURIComponent(project)}`} className={BTN.secondary}>{t("Cash flow", "التدفق النقدي")}</AppLink><AppLink to="reports/Retention%20and%20Advances" className={BTN.secondary}>{t("Retention and advances report", "تقرير المحتجزات والمقدمات")}</AppLink></>} />
      {filters}
      <KpiGrid>
        <Kpi label={t("Client advance (terms)", "دفعة العميل المقدمة (الشروط)")} value={compact(tot.client_advance_term, ar)} />
        <Kpi label={t("Advance still to recover", "المتبقي من الدفعة للاسترداد")} value={compact(tot.client_advance_remaining, ar)} tone="warn" />
        <Kpi label={t("Retention held by client", "محتجزات لدى العميل")} value={compact(tot.client_retention_held, ar)} />
        <Kpi label={t("Eligible to release", "القابل للإفراج")} value={compact(tot.client_retention_eligible, ar)} hint={tot.client_retention_reserved ? <span data-no-i18n>{t("requested", "مطلوب")} {compact(tot.client_retention_reserved, ar)}</span> : undefined} tone="good" />
        <Kpi label={t("Retention held from subcontractors", "محتجزات مقاولي الباطن")} value={compact(tot.sub_retention_held, ar)} />
        <Kpi label={t("Schedules needing attention", "جداول تحتاج متابعة")} value={String(tot.flagged)} tone={tot.flagged ? "warn" : "good"} />
      </KpiGrid>
      <PolicyGate keys={["P2"]} />
      <Section title={t("Schedules", "الجداول")}>
        <div role="tablist" className="mb-3 flex flex-wrap gap-1 border-b border-border" aria-label={t("Schedule kind", "نوع الجدول")}>
          {tabBtn("advance", t("Advance", "الدفعة المقدمة"), all.filter((s) => s.kind === "advance").length)}
          {tabBtn("retention", t("Retention", "المحتجزات"), all.filter((s) => s.kind === "retention").length)}
          {tabBtn("exceptions", t("Exceptions", "الاستثناءات"), all.filter((s) => s.flags.length).length)}
        </div>
        <DataTable<Schedule & Record<string, unknown>> rows={shown as (Schedule & Record<string, unknown>)[]} cols={cols} rowKey={(s) => s.id} empty={tab === "exceptions" ? t("No exceptions", "لا استثناءات") : t("No schedules for this project", "لا جداول لهذا المشروع")} />
      </Section>
      {sel && <ScheduleDetail s={sel} onClose={() => set({ schedule: "" })} />}
    </div>
  );
}

function ScheduleDetail({ s, onClose }: { s: Schedule; onClose: () => void }) {
  const { t, ar } = useCx();
  const contract = get(s.contract_doctype, s.contract);
  const mcols: Col<Schedule["movements"][number] & Record<string, unknown>>[] = [
    { key: "date", label: t("Date", "التاريخ"), render: (m) => <span data-no-i18n>{m.date ? dateTxt(m.date) : "—"}</span> },
    { key: "kind", label: t("Movement", "الحركة"), render: (m) => <div><div>{ar ? MOVE[m.kind][1] : MOVE[m.kind][0]}</div>{m.note && <div className="text-xs text-muted-foreground" data-no-i18n>{noteTxt(m.note, ar)}</div>}</div> },
    { key: "name", label: t("Source", "المصدر"), render: (m) => srcRef(m) },
    { key: "amount", label: t("Amount", "المبلغ"), kind: "money" },
    { key: "balance", label: s.kind === "advance" ? t("Received − recovered", "المستلم − المسترد") : t("Held − released", "المحتجز − المفرج"), kind: "money" },
  ];
  return (
    <Section id="adv-detail" title={<span data-no-i18n>{s.contract} · {ar ? KIND[s.kind][1] : KIND[s.kind][0]} · {partyName(s.counterparty, !ar)}</span>} actions={<button type="button" className={BTN.compact} onClick={onClose}>{t("Close", "إغلاق")}</button>}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3" data-adv-detail={s.id}>
        <div className="min-w-0 lg:col-span-2">
          <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{t("Movements", "الحركات")}</h3>
          <DataTable<Schedule["movements"][number] & Record<string, unknown>> rows={s.movements as (Schedule["movements"][number] & Record<string, unknown>)[]} cols={mcols} rowKey={(m) => m.key} empty={t("No movements recorded yet", "لا حركات مسجلة بعد")} />
        </div>
        <div className="min-w-0 space-y-3 text-sm">
          <div className="rounded-md border border-border p-3" data-adv-terms>
            <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{t("Contract terms (not a ledger balance)", "شروط العقد (ليست رصيدًا محاسبيًا)")}</h3>
            <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
              <dt className="text-muted-foreground">{t("Contract", "العقد")}</dt><dd><DocRef doctype={s.contract_doctype} name={s.contract} /></dd>
              {s.kind === "advance" ? <>
                <dt className="text-muted-foreground">{t("Advance amount", "مبلغ الدفعة المقدمة")}</dt><dd className="tabular-nums" data-no-i18n>{money(s.term_amount)}</dd>
                <dt className="text-muted-foreground">{t("Recovery rate", "نسبة الاسترداد")}</dt><dd data-no-i18n>{s.term_pct}%</dd>
                <dt className="text-muted-foreground">{t("Received (payments)", "المستلم (المدفوعات)")}</dt><dd className="tabular-nums" data-no-i18n>{money(s.evidence)}</dd>
              </> : <>
                <dt className="text-muted-foreground">{t("Retention rate", "نسبة المحتجزات")}</dt><dd data-no-i18n>{s.term_pct}%</dd>
                {s.cap_pct > 0 && <><dt className="text-muted-foreground">{t("Cap", "السقف")}</dt><dd className="tabular-nums" data-no-i18n>{s.cap_pct}% = {money(s.cap_amount)}</dd></>}
              </>}
              {contract?.["payment_days"] ? <><dt className="text-muted-foreground">{t("Payment days", "مدة السداد")}</dt><dd data-no-i18n>{String(contract["payment_days"])}</dd></> : null}
            </dl>
          </div>
          <div className="rounded-md border border-border p-3" data-adv-eligibility>
            <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{s.kind === "advance" ? t("Recovery", "الاسترداد") : t("Release", "الإفراج")}</h3>
            {s.kind === "advance" ? <p>{t("Recovery is deducted on each certificate or subcontract bill by the contract rate. No separate recovery review document exists.", "يُخصم الاسترداد في كل شهادة أو مستخلص بنسبة العقد. لا يوجد مستند مستقل لمراجعة الاسترداد.")} <span className="font-medium" data-no-i18n>{t("Remaining", "المتبقي")}: {money(s.available)}</span></p>
              : s.release_capability === "request" ? <>
                <dl className="mb-2 grid grid-cols-2 gap-x-2 gap-y-1">
                  <dt className="text-muted-foreground">{t("Held", "المحتجز")}</dt><dd className="tabular-nums" data-no-i18n>{money(s.evidence)}</dd>
                  <dt className="text-muted-foreground">{t("Released", "المفرج عنه")}</dt><dd className="tabular-nums" data-no-i18n>{money(s.processed)}</dd>
                  <dt className="text-muted-foreground">{t("Requested, pending", "مطلوب قيد الاعتماد")}</dt><dd className="tabular-nums" data-no-i18n>{money(s.reserved)}</dd>
                  <dt className="font-medium">{t("Eligible to request", "القابل للطلب")}</dt><dd className="font-medium tabular-nums" data-no-i18n>{money(s.eligible)}</dd>
                </dl>
                {s.eligible > 0.005 && canCreate("Digit Retention Release Request")
                  ? <NewDoc doctype="Digit Retention Release Request" defaults={{ contract: s.contract, project: s.project, customer: s.counterparty, release_type: "Partial", requested_amount: s.eligible }} label={t("Request a release review", "طلب مراجعة إفراج")} />
                  : <p className="text-xs text-muted-foreground">{s.eligible > 0.005 ? t("Your role cannot create release requests.", "دورك لا يسمح بإنشاء طلبات الإفراج.") : t("Nothing is eligible to request now.", "لا يوجد مبلغ قابل للطلب الآن.")}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{t("A request is a draft for review; approval follows policy P2 and is never a release by itself.", "الطلب مسودة للمراجعة؛ الاعتماد يتبع السياسة P2 وليس إفراجًا بحد ذاته.")}</p>
              </> : <Note>{t("Subcontract retention has no release document yet; release is handled outside this app.", "لا يوجد مستند إفراج لمحتجزات مقاولي الباطن بعد؛ يتم الإفراج خارج هذا التطبيق.")}</Note>}
          </div>
        </div>
      </div>
    </Section>
  );
}
