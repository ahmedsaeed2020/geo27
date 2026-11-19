/**
 * F4-03 / F4-04 / F4-05 parts, labour and billing screens (owner FSM round F4, N59–N68): the van stock card per technician
 * (native warehouse, posted stock ledger), the consumption bar per job (requested → issued → used → returned, differences
 * in red), booked vs approved hours per technician and job, and the billing equation per job — approved labour + parts +
 * charges − covered by agreement = to invoice — with the «جاهز للفوترة» chip and the idempotent draft Sales Invoice
 * hand-off («موجود مسبقاً»). Every figure comes from domain/billing.ts; actions go through domain/services.
 */
import type { ReactNode } from "react";
import type { Doc } from "@/lib/adapter";
import { EquationBand, FlowBar, HoursBar, StockCard } from "@/components/enterprise/kit";
import { Pill } from "@/components/enterprise/kit/RecordFrame";
import { list, raw } from "../domain/data";
import { addDays, s, today } from "../domain/rules";
import * as svc from "../domain/services";
import { hoursOf, jobBilling, partsFlow, vanStock, type JobBilling } from "../domain/billing";
import { nm } from "./dayBoard";
import { tv } from "./runWalk";
import { ActionButton, AppLink, DataTable, DocRef, Panel, money, numTxt, opt, useFx, useUrlState, type Col } from "./kit";

type T = (en: string, a: string) => string;
const DONE = new Set(["Completed", "Closed"]);

/** «جاهز للفوترة» / «مفوتر» / «مغطى» / «غير جاهز» chip of a job. */
export function BillChip({ b, ar }: { b: JobBilling; ar: boolean }) {
  const [tone, en, a] = b.state === "invoiced" ? ["ok", "Invoiced (draft)", "مفوتر (مسودة)"] as const : b.state === "ready" ? ["ok", "Ready to invoice", "جاهز للفوترة"] as const
    : b.state === "covered" ? ["neutral", "Covered by agreement", "مغطى بالاتفاقية"] as const : ["warn", "Not ready", "غير جاهز"] as const;
  return <Pill tone={tone} attrs={{ "data-bill-chip": b.state, title: b.blockers.map((x) => (ar ? x[1] : x[0])).join(" · ") || undefined }}>{ar ? a : en}</Pill>;
}

/** The next billing action of a job: propose → approve → hand off → open the invoice. */
export function BillAction({ b, t, compact }: { b: JobBilling; t: T; compact?: boolean }) {
  if (b.invoice) return <DocRef doctype="Sales Invoice" name={b.invoice.name} form className="text-sm font-bold text-primary hover:underline">{t("Open invoice", "فتح الفاتورة")} <span data-no-i18n>{b.invoice.name}</span></DocRef>;
  if (b.decision === "Covered" || b.net <= 0) return null;
  if (!b.proposal) return <ActionButton compact={compact ?? false} primary={!compact} label={t("Propose the charge", "اقتراح التحصيل")} disabled={b.state === "blocked"} reason={b.blockers.map((x) => x[0]).join(" · ")} run={() => svc.proposeCharge(b.job)} />;
  if (s(b.proposal["status"]) === "Proposed") return <ActionButton compact={compact ?? false} primary={!compact} label={t("Approve the charge", "اعتماد التحصيل")} run={() => svc.approveCharge(b.proposal!.name)} />;
  return <ActionButton compact={compact ?? false} primary={!compact} label={t("Create draft invoice", "إنشاء مسودة الفاتورة")} disabled={b.state !== "ready"} reason={b.blockers.map((x) => x[0]).join(" · ")} run={() => svc.handOffCharge(b.proposal!.name)} />;
}

/** The equation of one job in large numbers with its chip, blockers, lines and action. */
export function BillingEquation({ job }: { job: string }) {
  const { t, ar } = useFx(); const b = jobBilling(job);
  return <section className="mb-4" data-billing-equation={job} data-bill-state={b.state}>
    <div className="mb-2 flex flex-wrap items-center gap-2"><BillChip b={b} ar={ar} /><span className="text-xs text-muted-foreground">{ar ? b.coverBasis[1] : b.coverBasis[0]}</span><span className="ms-auto"><BillAction b={b} t={t} /></span></div>
    <EquationBand attrs={{ "data-eq-job": job }}
      terms={[
        { key: "labour", label: t("Approved labour", "العمالة المعتمدة"), display: money(b.labour), sub: <>{numTxt(b.labourH, 1)} {t("h approved", "ساعة معتمدة")}</> },
        { key: "parts", label: t("Parts used", "القطع المستخدمة"), display: money(b.parts), sub: <>{numTxt(b.flow.used)} {t("pieces", "قطعة")}</>, ...(b.flow.discrepancies ? { tone: "warn" as const } : {}) },
        { key: "charges", label: t("Charges", "الرسوم"), display: money(b.charges), sub: b.charges ? t("Emergency call-out", "استدعاء طارئ") : t("None", "لا رسوم") },
        { key: "covered", op: "−", label: t("Covered by agreement", "المغطى بالاتفاقية"), display: money(b.covered), sub: opt(b.decision, ar) },
      ]}
      result={{ key: "net", label: t("To invoice", "للفوترة"), display: money(b.net), sub: t("before VAT", "قبل الضريبة"), ...(b.state === "ready" || b.state === "invoiced" ? { tone: "ok" as const } : {}) }}
      flag={{ label: t("With VAT 15%", "شامل ضريبة 15%"), display: money(b.gross), negative: false, sub: <>{t("VAT", "الضريبة")} {money(b.vat)}</>, ...(b.invoice ? { link: (n: ReactNode) => <DocRef doctype="Sales Invoice" name={b.invoice!.name} form>{n}</DocRef> } : {}) }}
      note={b.blockers.length ? <span data-bill-blockers>{t("Not ready:", "غير جاهز:")} {b.blockers.map((x) => (ar ? x[1] : x[0])).join(" · ")}</span>
        : b.proposalDiff !== null && Math.abs(b.proposalDiff) >= 0.01 ? <span data-bill-diff>{t(`The proposal says ${money(b.proposal?.["amount"])}; the invoice follows the equation.`, `المقترح يذكر ${money(b.proposal?.["amount"])}؛ الفاتورة تتبع المعادلة.`)}</span>
          : b.invoice ? t("The draft invoice carries exactly these lines; finance posts it from the invoice form.", "مسودة الفاتورة تحمل هذه البنود نفسها؛ المالية ترحّلها من نموذج الفاتورة.") : undefined} />
    {b.lines.length > 0 && <DataTable id={`bill-lines-${job}`} searchable={false} rows={b.lines.map((l) => ({ ...l, name: l.key }))} empty="—" cols={[
      { key: "item_name", label: t("Line", "البند"), render: (r) => <span data-no-i18n>{tv(r.item_name, ar)}</span> },
      { key: "qty", label: t("Qty", "الكمية"), numeric: true, value: (r) => r.qty, render: (r) => <span data-no-i18n>{numTxt(r.qty, 2)} {opt(r.uom, ar)}</span> },
      { key: "rate", label: t("Rate", "السعر"), numeric: true, value: (r) => r.rate, render: (r) => <span data-no-i18n>{money(r.rate)}</span> },
      { key: "amount", label: t("Amount", "المبلغ"), numeric: true, money: true, value: (r) => r.amount, render: (r) => <span data-no-i18n>{money(r.amount)}</span> },
      { key: "covered", label: t("Billed", "يُفوتر"), render: (r) => r.covered ? <Pill tone="neutral">{t("Covered", "مغطى")}</Pill> : <Pill tone="ok">{t("Invoiced", "يُفوتر")}</Pill> },
    ]} />}
  </section>;
}

/** Consumption of one job per part: requested → issued → used → returned with the difference in red. */
export function JobParts({ job, compact }: { job: string; compact?: boolean }) {
  const { t, ar } = useFx(); const f = partsFlow(job);
  if (!f.lines.length) return <p className="text-sm text-muted-foreground" data-job-parts={job}>{t("No parts on this job.", "لا قطع على أمر العمل هذا.")}</p>;
  return <div className="grid gap-2" data-job-parts={job} data-discrepancies={f.discrepancies}>
    {f.lines.map((l) => <FlowBar key={l.item} ar={ar} title={<span data-no-i18n>{tv(l.item_name, ar)}</span>} sub={compact ? undefined : <span data-no-i18n>{l.item}</span>}
      flag={l.bad ? { tone: "bad", label: <>{t("Difference", "فرق")} <span data-no-i18n>{l.open}</span> · {ar ? l.reason?.[1] : l.reason?.[0]}</> } : l.waiting ? { tone: "warn", label: ar ? l.reason?.[1] : l.reason?.[0] } : l.usedDraft || l.returnedDraft ? { tone: "warn", label: t("Waiting for stores to post", "بانتظار ترحيل المستودع") } : { tone: "ok", label: t("Balanced", "متوازن") }}
      steps={[{ key: "requested", label: t("Requested", "مطلوب"), value: l.requested }, { key: "issued", label: t("Issued", "مصروف"), value: l.issued }, { key: "used", label: t("Used", "مستخدم"), value: l.used, pending: l.usedDraft }, { key: "returned", label: t("Returned", "مرتجع"), value: l.returned, pending: l.returnedDraft }]} />)}
  </div>;
}

/** Van stock card of one technician. */
export function VanCard({ tech }: { tech: string }) {
  const { t, ar } = useFx(); const v = vanStock(tech);
  return <StockCard ar={ar} title={<span data-no-i18n>{nm("FSM Technician", tech, ar)}</span>} sub={<span data-no-i18n>{nm("Warehouse", v.warehouse, ar) || v.warehouse || "—"}</span>}
    link={<AppLink to={`technician/${encodeURIComponent(tech)}`}>{t("Technician 360", "الفني 360")}</AppLink>}
    lines={v.lines.map((l) => ({ key: l.item, label: <span data-no-i18n>{tv(l.item_name, ar)}</span>, qty: l.qty, unit: opt(l.uom, ar), value: money(l.value), pending: l.pending, low: l.low }))}
    total={<>{t("Stock value", "قيمة المخزون")} <b data-no-i18n>{money(v.value)}</b> · <span data-no-i18n>{numTxt(v.qty)}</span> {t("pieces", "قطعة")}{v.low ? <> · <span data-no-i18n>{v.low}</span> {t("low", "منخفض")}</> : null}</>}
    empty={v.warehouse ? t("The van has no stock.", "لا رصيد في السيارة.") : t("No van warehouse on the technician record.", "لا مستودع سيارة في سجل الفني.")} />;
}

// ---------------------------------------------------------------- workspace panels (ov/bill.tsx extras)
/** N61–N63: van cards for every technician, then the jobs whose parts flow has a difference or is still open. */
export function PartsDesk() {
  const { t, ar } = useFx();
  const techs = list("FSM Technician").filter((x) => s(x["status"]) !== "Inactive" && x["van_warehouse"]);
  const jobs = [...new Set([...list("Material Request"), ...list("Stock Entry")].map((d) => s(d["digit_fsm_job"])).filter(Boolean))].map((j) => partsFlow(j)).filter((f) => f.lines.length);
  jobs.sort((a, b) => b.discrepancies - a.discrepancies || b.waiting - a.waiting || b.drafts - a.drafts);
  const bad = jobs.filter((f) => f.discrepancies).length;
  return <div data-parts-desk>
    <Panel title={t("Van stock", "مخزون السيارات")} subtitle={t("Posted stock ledger of each technician's van warehouse; draft usage shows as pending.", "دفتر المخزون المرحّل لمستودع سيارة كل فني؛ الاستهلاك المسودة يظهر بانتظار.")}>
      <div className="fsm-vans">{techs.map((x) => <VanCard key={x.name} tech={x.name} />)}</div>
    </Panel>
    <Panel title={t("Consumption by job", "الاستهلاك حسب أمر العمل")} subtitle={bad ? t(`${bad} job(s) with a difference — shown first`, `${bad} أمر عمل به فرق — تظهر أولاً`) : t("Every job balances", "كل الأوامر متوازنة")}>
      <div className="grid gap-3">{jobs.slice(0, 12).map((f) => <article key={f.job} className="fsm-jobflow" data-job-flow={f.job} data-bad={f.discrepancies || undefined}>
        <header><AppLink to={`job/${encodeURIComponent(f.job)}`}><b data-no-i18n>{nm("FSM Job", f.job, ar)}</b></AppLink><span className="text-xs text-muted-foreground" data-no-i18n>{opt(raw("FSM Job", f.job)?.["workflow_state"], ar)}</span>{f.discrepancies ? <Pill tone="bad">{t(`${f.discrepancies} difference(s)`, `${f.discrepancies} فرق`)}</Pill> : null}</header>
        <JobParts job={f.job} compact />
      </article>)}</div>
      {jobs.length > 12 && <p className="mt-2 text-xs text-muted-foreground">{t(`${jobs.length - 12} more jobs in the report`, `${jobs.length - 12} أمر آخر في التقرير`)} · <AppLink to="reports/RP13">RP13</AppLink></p>}
    </Panel>
  </div>;
}

/** N65: booked vs logged vs approved hours per technician (this Sunday–Thursday week) and the jobs still awaiting approval. */
export function LabourDesk() {
  const { t, ar } = useFx(); const d = today(); const wk0 = addDays(d, -new Date(`${d}T12:00:00Z`).getUTCDay()); const wk1 = addDays(wk0, 6);
  const [q, set] = useUrlState(); const win = q["hrs"] === "30" ? { from: addDays(d, -30), to: d } : { from: wk0, to: wk1 };
  const techs = list("FSM Technician").filter((x) => s(x["status"]) !== "Inactive");
  const jobs = [...new Set(list("Timesheet").map((x) => s(x["digit_fsm_job"])).filter(Boolean))].map((j) => ({ j, h: hoursOf({ job: j }) })).filter((x) => x.h.pending > 0).sort((a, b) => b.h.pending - a.h.pending);
  return <div data-labour-desk>
    <Panel title={t("Booked vs approved hours per technician", "الساعات المحجوزة مقابل المعتمدة لكل فني")} subtitle={<>{q["hrs"] === "30" ? t("Last 30 days", "آخر 30 يومًا") : t("This week (Sunday–Thursday)", "هذا الأسبوع (الأحد–الخميس)")} · <button type="button" className="text-primary hover:underline" onClick={() => set({ hrs: q["hrs"] === "30" ? undefined : "30" })}>{q["hrs"] === "30" ? t("Show this week", "عرض هذا الأسبوع") : t("Show last 30 days", "عرض آخر 30 يومًا")}</button></>}>
      <div className="fsm-hours">{techs.map((x) => { const h = hoursOf({ tech: x.name, ...win }); return <HoursBar key={x.name} ar={ar} label={<AppLink to={`technician/${encodeURIComponent(x.name)}`}><span data-no-i18n>{nm("FSM Technician", x.name, ar)}</span></AppLink>} sub={<span data-no-i18n>{nm("FSM Crew", x["crew"], ar) || s(x["crew"])}</span>} booked={h.booked} logged={h.logged} approved={h.approved} />; })}</div>
    </Panel>
    <Panel title={t("Jobs with hours awaiting approval", "أوامر بساعات بانتظار الاعتماد")} subtitle={t("Logged on timesheets but not yet approved — they hold the job's invoice.", "مسجلة في سجلات الوقت ولم تُعتمد بعد — تؤخر فاتورة أمر العمل.")}>
      {jobs.length ? <div className="fsm-hours">{jobs.slice(0, 12).map(({ j, h }) => <HoursBar key={j} ar={ar} label={<AppLink to={`job/${encodeURIComponent(j)}`}><span data-no-i18n>{nm("FSM Job", j, ar)}</span></AppLink>} booked={h.booked} logged={h.logged} approved={h.approved} />)}</div>
        : <p className="text-sm text-muted-foreground">{t("No hours waiting for approval.", "لا ساعات بانتظار الاعتماد.")}</p>}
    </Panel>
  </div>;
}

/** N66–N68: the equation per completed job with the chip and the next action; a picked job shows its full equation. */
export function BillingDesk() {
  const { t, ar } = useFx(); const [q, set] = useUrlState();
  const STATE_TXT: Record<string, [string, string]> = { ready: ["Ready to invoice", "جاهز للفوترة"], blocked: ["Not ready", "غير جاهز"], invoiced: ["Invoiced (draft)", "مفوتر (مسودة)"], covered: ["Covered by agreement", "مغطى بالاتفاقية"] };
  const rows = list("FSM Job").filter((j) => DONE.has(s(j["workflow_state"])) && s(j["job_type"]) !== "PM Inspection").map((j) => { const b = jobBilling(j.name); return { ...b, name: j.name, title: s(j["job_title"]), status: (STATE_TXT[b.state] ?? ["", ""])[ar ? 1 : 0] }; })
    .sort((a, b) => ({ ready: 0, blocked: 1, invoiced: 2, covered: 3 })[a.state] - ({ ready: 0, blocked: 1, invoiced: 2, covered: 3 })[b.state]);
  const pick = q["bill"] && rows.some((r) => r.name === q["bill"]) ? q["bill"] : rows.find((r) => r.state === "ready")?.name ?? rows[0]?.name;
  const cols: Col<(typeof rows)[number]>[] = [
    { key: "name", label: t("Job", "أمر العمل"), value: (r) => nm("FSM Job", r.name, ar), render: (r) => <button type="button" className="text-start text-primary hover:underline" onClick={() => set({ bill: r.name })} data-bill-pick={r.name}><span data-no-i18n>{nm("FSM Job", r.name, ar)}</span></button> },
    { key: "customer", label: t("Customer", "العميل"), value: (r) => nm("Customer", r.customer, ar), render: (r) => <span data-no-i18n>{nm("Customer", r.customer, ar)}</span> },
    { key: "labour", label: t("Labour", "العمالة"), numeric: true, money: true, value: (r) => r.labour, render: (r) => <span data-no-i18n>{money(r.labour)}</span> },
    { key: "parts", label: t("Parts", "القطع"), numeric: true, money: true, value: (r) => r.parts, render: (r) => <span data-no-i18n>{money(r.parts)}</span> },
    { key: "charges", label: t("Charges", "الرسوم"), numeric: true, money: true, value: (r) => r.charges, render: (r) => <span data-no-i18n>{money(r.charges)}</span> },
    { key: "covered", label: t("Covered", "المغطى"), numeric: true, money: true, value: (r) => r.covered, render: (r) => <span data-no-i18n>{r.covered ? `−${money(r.covered)}` : money(0)}</span> },
    { key: "net", label: t("To invoice", "للفوترة"), numeric: true, money: true, value: (r) => r.net, render: (r) => <b data-no-i18n>{money(r.net)}</b> },
    { key: "status", label: t("Billing", "الفوترة"), value: (r) => r.status, render: (r) => <BillChip b={r} ar={ar} /> },
  ];
  return <div data-billing-desk>
    {pick && <Panel title={<>{t("Billing equation", "معادلة الفوترة")} · <span data-no-i18n>{nm("FSM Job", pick, ar)}</span></>} subtitle={t("Approved labour + parts used + charges − covered by agreement = to invoice", "العمالة المعتمدة + القطع المستخدمة + الرسوم − المغطى بالاتفاقية = للفوترة")} actions={<AppLink to={`job/${encodeURIComponent(pick)}`}>{t("Open job", "فتح أمر العمل")}</AppLink>}><BillingEquation job={pick} /></Panel>}
    <Panel title={t("Completed work by billing state", "الأعمال المكتملة حسب حالة الفوترة")} subtitle={t("Ready first; planned inspections covered by an agreement are left out.", "الجاهز أولاً؛ الفحوص المخططة المغطاة بالاتفاقية مستبعدة.")}>
      <DataTable id="fsm-billing-desk" rows={rows} cols={cols} empty={t("No completed chargeable work.", "لا أعمال مكتملة قابلة للتحصيل.")} actions={(r) => <BillAction b={r} t={t} compact />} />
    </Panel>
  </div>;
}

/** Job 360: parts flow, hours and the billing equation of the job. */
export function JobMoney({ job }: { job: Doc }) {
  const { t, ar } = useFx(); const h = hoursOf({ job: job.name });
  return <div className="grid gap-3" data-job-money={job.name}>
    <Panel title={t("Billing", "الفوترة")} subtitle={t("Approved labour + parts used + charges − covered by agreement = to invoice", "العمالة المعتمدة + القطع المستخدمة + الرسوم − المغطى بالاتفاقية = للفوترة")}><BillingEquation job={job.name} /></Panel>
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title={t("Parts", "القطع")} subtitle={t("Requested → issued → used → returned", "مطلوب ← مصروف ← مستخدم ← مرتجع")}><JobParts job={job.name} /></Panel>
      <Panel title={t("Labour", "العمالة")} subtitle={t("Booked on the dispatch board vs logged vs approved on timesheets", "المحجوز في لوحة الجدولة مقابل المسجل والمعتمد في سجلات الوقت")}><HoursBar ar={ar} label={<span data-no-i18n>{nm("FSM Job", job.name, ar)}</span>} booked={h.booked} logged={h.logged} approved={h.approved} /></Panel>
    </div>
  </div>;
}
/** Technician 360: van stock card and this week's booked vs approved hours. */
export function TechMoney({ tech }: { tech: string }) {
  const { t, ar } = useFx(); const d = today(); const wk0 = addDays(d, -new Date(`${d}T12:00:00Z`).getUTCDay()); const h = hoursOf({ tech, from: wk0, to: addDays(wk0, 6) }); const m = hoursOf({ tech, from: addDays(d, -30), to: d });
  return <div className="grid gap-3 lg:grid-cols-2" data-tech-money={tech}>
    <Panel title={t("Van stock", "مخزون السيارة")} subtitle={t("Posted stock ledger of the van warehouse", "دفتر المخزون المرحّل لمستودع السيارة")}><VanCard tech={tech} /></Panel>
    <Panel title={t("Hours", "الساعات")} subtitle={t("Booked on the dispatch board vs logged vs approved on timesheets", "المحجوز في لوحة الجدولة مقابل المسجل والمعتمد في سجلات الوقت")}>
      <div className="grid gap-2"><HoursBar ar={ar} label={t("This week", "هذا الأسبوع")} booked={h.booked} logged={h.logged} approved={h.approved} /><HoursBar ar={ar} label={t("Last 30 days", "آخر 30 يومًا")} booked={m.booked} logged={m.logged} approved={m.approved} /></div>
    </Panel>
  </div>;
}
