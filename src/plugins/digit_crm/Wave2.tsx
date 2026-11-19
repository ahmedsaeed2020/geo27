import { translateTo, useLang } from "@/i18n";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { Open360 } from "@/components/enterprise/Open360";
import { leadTitle } from "./leadDesk";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { adapter, type Doc } from "@/lib/adapter";
import { scopedList, useScopeMetas } from "@/lib/scope";
import { CrmFrame, PriorityQueue, REASON_LABEL, REASON_TONE } from "./CrmApp";
import { DeptPanel } from "./Workspace";
import { accountHealth } from "./wf05";
import { actionQueue, type QueueItem } from "./wf09";
import { indexQuery } from "@/lib/catalog";
import { CompanyChangeLog, FinanceTabs, FocusNowCard, OpenDealsCard, PaymentScoreBlock, PipelineBoard, StageTotalsCard, WinFunnelCard } from "./SalesDesk";
import { canSeeFinance } from "./salesDesk";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { DistributionBar } from "@/components/enterprise/kit/DistributionBar";
import { CountRow, FactGrid } from "@/components/enterprise/RecordProfile";
import { QuickLink } from "@/components/enterprise/QuickView";
import { useQuery } from "@tanstack/react-query";
import { linkTitle } from "@/lib/linkTitle";
const orgTitle = (v: unknown) => linkTitle("CRM Organization", v);
const dealQueue = (user: string) => new Map(actionQueue(user).filter((q) => q.dt === "CRM Deal" && !q.task).map((q) => [q.name, q] as [string, QueueItem]));
const QChip = ({ q }: { q: QueueItem | undefined }) => q ? <span data-dc-queue={q.reason} className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${REASON_TONE[q.reason]}`}>{REASON_LABEL[q.reason]}</span> : null;
import { DealLines, DealQuotation, DealTimeline } from "./Wave3";
import { paymentsOf } from "./wf04";
import { dealsMoney, fmtMoney, receivablesSafe, sumMoney, type MoneySum } from "./wf05";
import { DealDiscipline } from "./Wave5";
import { TimelineItems, TimelineSection } from "./Wave6";
import { bucketOf, isManager, ownerChoices, parseDue, userLabel } from "./wf01";
import {
  activities, createCustomerFromDeal, customer360, customerForDeal, dealProb, dealStages, dealStatusType,
  dealValue, forecast, groupCount, homeKpis, isOpenDeal, moveDeal, pipeline, quotationsForDeal, scopedDeals, sourceConversion, type Activity,
} from "./wf02";

export const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
/** Saudi Riyal amounts show the official sign on screen (stored values and exports keep "SAR"). */
// figures render left-to-right; the right-to-left marks fmtDate adds for Arabic text flow would reorder a date inside this span
export const Num = ({ v }: { v: ReactNode }) => <span dir="ltr" data-no-i18n className="tabular-nums">{typeof v === "string" ? v.replace(/\bSAR (?=[-−]?[\d.,])/g, "\u20C1 ").replace(/\u200f/g, "") : v}</span>;

export function Kpi({ label, value, to, hint }: { label: string; value: ReactNode; to?: string; hint?: ReactNode }) {
  const body = <><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold"><Num v={typeof value === "number" ? value.toLocaleString("en-US") : value} /></div>{hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}</>;
  return to ? <Link to={to as never} className="panel block p-3 hover:bg-muted" data-crm-kpi={label}>{body}</Link> : <div className="panel p-3" data-crm-kpi={label}>{body}</div>;
}
export function Section({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return <section className="panel min-w-0 max-w-full overflow-x-auto p-4"><div className="mb-3 flex items-center gap-2"><h2 className="text-sm font-semibold">{title}</h2><div className="ms-auto">{right}</div></div>{children}</section>;
}
export function Empty({ children }: { children: ReactNode }) { return <p className="py-4 text-center text-sm text-muted-foreground" data-dc-state="empty">{children}</p>; }
function Bar({ pct, color = "primary" }: { pct: number; color?: string }) {
  return <div className="h-2 w-full rounded bg-muted"><div className="h-2 rounded" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color === "primary" ? "var(--primary)" : `var(--status-${color}, var(--primary))` }} /></div>;
}
export const RefLink = ({ dt, name }: { dt: string; name: string }) => dt === "CRM Lead" ? <Link to="/digit-crm/leads/$leadId" params={{ leadId: name }} className="text-primary hover:underline" data-no-i18n>{name}</Link>
  : dt === "CRM Deal" ? <Link to="/digit-crm/deals/$dealId" params={{ dealId: name }} className="text-primary hover:underline" data-no-i18n>{name}</Link> : <span data-no-i18n>{linkTitle(dt, name) || "—"}</span>;
/** Native form link. The catalog index names the app that owns the DocType (a Quotation or Contact is not under "crm"),
 *  so the form loads its real metadata; `app` is only the fallback until the index is loaded or for unknown DocTypes. */
export function DeskLink({ app, dt, name, label }: { app: string; dt: string; name: string; label?: string }) {
  const { data: ix } = useQuery(indexQuery);
  const e = ix?.find((i) => i.name === dt);
  const owner = e && !e.source.startsWith("plugin:") ? e.app : app;
  return <Link to="/app/$app/$doctype/$name" params={{ app: owner, doctype: e?.slug ?? dt.toLowerCase().replace(/[^a-z0-9]+/g, "_"), name }} className="text-primary hover:underline" data-no-i18n data-desk-app={owner}>{label || name}</Link>;
}

/* CRM Home is the module command center (CommandCenter.tsx, modules.ts "home"). */

/* ---------- Pipeline ---------- */
/** Display caps only — counts, totals and filters still use every record. */
const ACTIVITY_ROW_LIMIT = 200;
/** CRM C1 (owner 2026-11-17): stage KPIs, the «نسبة الفوز» funnel beside the stage totals, then the Enterprise deal board
 *  (coloured stage heads, «+N أخرى», «لا نشاط منذ N أيام», passed close dates in red, the reader's card fields). */
/** Owner notes C-06: one pipeline page with tabs «التحليل | اللوحة»; both menu entries (Pipeline, Pipeline Kanban) open it,
 *  and the board tab is the same Enterprise kanban the analysis reads (stage totals, funnel, win rate). */
export function Pipeline({ tab = "analysis" }: { tab?: "analysis" | "board" }) {
  const lang = useLang(), ar = lang === "ar", wLabel = ar ? "مرجّح" : "weighted";
  const tabs = <nav className="dc-tabs" role="tablist" aria-label={ar ? "خط الأنابيب" : "Pipeline"} data-crm-pipeline-tabs>
    {(["analysis", "board"] as const).map((k) => <Link key={k} role="tab" aria-selected={tab === k} to="/digit-crm/pipeline" search={(k === "board" ? { tab: "board" } : {}) as never} className="dc-tab" data-dc-tabid={k}>{k === "analysis" ? (ar ? "التحليل" : "Analysis") : (ar ? "اللوحة" : "Board")}</Link>)}
  </nav>;
  return <CrmFrame title="Pipeline" subtitle="Opportunities by stage with value and weighted forecast." tabs={tabs}
    actions={<Link to="/digit-crm/pipeline" className="ek-context-btn" data-crm-classic-kanban>{ar ? "اللوحة الكلاسيكية" : "Classic kanban"}</Link>}>{(user) => {
    const deals = scopedDeals(user), rows = pipeline(user);
    if (tab === "board") return <div data-crm-pipeline data-crm-pipeline-tab="board"><PipelineBoard user={user} /></div>;
    const open = rows.filter((r) => r.type !== "Lost" && r.type !== "Won");
    return <div className="space-y-4" data-crm-pipeline-tab="analysis">
      <DeptPanel dept="pipeline" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{rows.filter((r) => r.type !== "Lost").slice(0, 4).map((r) => <Kpi key={r.stage} label={r.stage} value={r.count} hint={<><Num v={fmtMoney(dealsMoney(deals.filter((d) => d["status"] === r.stage)))} /> · {wLabel} <Num v={fmtMoney(dealsMoney(deals.filter((d) => d["status"] === r.stage), true))} /></>} />)}</div>
      <PipelineStack rows={open} deals={deals} ar={ar} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]" data-crm-pipeline-insight><WinFunnelCard user={user} /><StageTotalsCard user={user} /></div>
      <Link to="/digit-crm/pipeline" search={{ tab: "board" } as never} className="btn-ghost inline-flex" data-crm-open-board>{ar ? "افتح اللوحة ←" : "Open the board →"}</Link>
    </div>;
  }}</CrmFrame>;
}
/** C-01 / C-06 «خط الأنابيب حسب المرحلة»: one stacked bar of open value per stage in the stage colour; each part opens the board. */
const stageText = (name: string, ar: boolean) => (ar ? translateTo(name, "ar") : name);
export function PipelineStack({ rows, deals, ar }: { rows: { stage: string; count: number }[]; deals: Doc[]; ar: boolean }) {
  const HUES = ["blue", "teal", "violet", "amber", "emerald", "coral", "gold", "lime"] as const;
  const segs = rows.map((r, i) => { const m = dealsMoney(deals.filter((d) => d["status"] === r.stage)); return { key: r.stage, label: `${stageText(r.stage, ar)} (${r.count})`, value: m.base ?? 0, display: fmtMoney(m), hue: HUES[i % HUES.length]!, to: `/digit-crm/pipeline?tab=board` }; });
  return <DistributionBar title={ar ? "قيمة خط الأنابيب المفتوح حسب المرحلة" : "Open pipeline value by stage"} segments={segs} />;
}
function LostDialog({ onClose, onSave }: { onClose: () => void; onSave: (reason: string, notes: string) => string | null }) {
  const [reason, setReason] = useState(""), [notes, setNotes] = useState(""), [err, setErr] = useState("");
  const reasons = adapter.list("CRM Lost Reason");
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label="Lost reason" className="panel w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
      <h2 className="mb-3 font-semibold">Lost reason</h2>
      <select className="field-input" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Lost reason"><option value="">Select…</option>{reasons.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}</select>
      <textarea className="field-input mt-2" rows={3} placeholder="Lost Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {err && <p role="alert" className="mt-1 text-xs text-destructive">{err}</p>}
      <div className="mt-3 flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => { if (reason === "Other" && !notes.trim()) { setErr("Lost Notes are required for Other"); return; } const e = onSave(reason, notes); if (e) setErr(e); }}>Save</button></div>
    </div>
  </div>;
}

/* ---------- Opportunity detail (DIGIT) ---------- */
export function DealDetail({ dealId }: { dealId: string }) {
  const [lost, setLost] = useState<string | null>(null);
  return <CrmFrame title="Opportunity" subtitle={dealId} actions={<Link to="/digit-crm/deals/$dealId" params={{ dealId }} className="btn-ghost">Open full form</Link>}>{(user) => {
    const d = scopedDeals(user).find((x) => x.name === dealId);
    if (!d) return <div className="panel p-6" data-dc-state="denied">Opportunity not found or not permitted.</div>;
    const stages = dealStages(), idx = stages.findIndex((s) => s.name === d["status"]);
    const cust = customerForDeal(d.name), quotes = quotationsForDeal(d.name), acts = activities(user, { refNames: [d.name] });
    const won = dealStatusType(d["status"]) === "Won";
    const run = (r: { ok: true; name: string } | { ok: false; error: string }, msg: string) => r.ok ? toast.success(msg, { description: r.name }) : toast.error(r.error);
    const move = (s: string) => dealStatusType(s) === "Lost" ? setLost(s) : run(moveDeal(d.name, s, user), "Stage updated");
    return <>
      <ol className="flex flex-wrap gap-1" aria-label="Stage" data-crm-stage-strip>{stages.map((s, i) =>
        <li key={s.name}><button data-stage-type={String(s["type"] ?? "")} onClick={() => move(s.name)} aria-current={i === idx ? "step" : undefined}
          className={`rounded px-2 py-1 text-xs ${i === idx ? "bg-primary text-primary-foreground" : i < idx ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{s.name}</button></li>)}</ol>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Deal Value" value={<Num v={fmtMoney(dealsMoney([d]))} />} /><Kpi label="Probability" value={`${dealProb(d)}%`} />
        <Kpi label="Expected Closure" value={String(d["expected_closure_date"] || "—")} /><Kpi label="Owner" value={userLabel(d["deal_owner"]) || "—"} />
      </div>
      <QChip q={dealQueue(user).get(d.name)} />
      <DealDiscipline d={d} user={user} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Account">
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Organization</dt><dd>{d["organization"] ? <Link to="/digit-crm/customers/$org" params={{ org: String(d["organization"]) }} className="text-primary hover:underline" data-no-i18n>{orgTitle(d["organization"])}</Link> : "—"}</dd>
            <dt className="text-muted-foreground">Lead</dt><dd>{d["lead"] ? <RefLink dt="CRM Lead" name={String(d["lead"])} /> : "—"}</dd>
            <dt className="text-muted-foreground">Contact</dt><dd data-no-i18n>{String(d["contact"] || "—")}</dd>
            <dt className="text-muted-foreground">Next Step</dt><dd data-no-i18n>{String(d["next_step"] || "—")}</dd>
          </dl>
        </Section>
        <Section title="ERP handoff">
          <p className="mb-2 text-xs text-muted-foreground">Won opportunities become an DIGIT Customer; quotations are created as Draft and finished in the native Quotation form.</p>
          <div className="mb-3 flex flex-wrap gap-2">
            <button className="btn-primary" disabled={!won || !!cust} onClick={() => run(createCustomerFromDeal(d.name, user), "Customer linked")} data-crm-action="create-customer">Create Customer</button>
          </div>
          {!won && !cust && <p className="text-xs text-muted-foreground">Move the opportunity to a Won stage to create the customer.</p>}
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Customer</dt><dd>{cust ? <DeskLink app="erpnext" dt="Customer" name={cust.name} /> : "—"}</dd>
            <dt className="text-muted-foreground">Quotations</dt><dd className="space-x-2">{quotes.length ? quotes.map((q) => <DeskLink key={q.name} app="erpnext" dt="Quotation" name={q.name} />) : "—"}</dd>
          </dl>
        </Section>
      </div>
      <DealLines key={String(d["modified"] ?? "")} deal={d} user={user} />
      <div className="grid gap-4 lg:grid-cols-2"><DealQuotation deal={d} user={user} /><DealTimeline deal={d} /></div>
      <TimelineSection doc={d} doctype="CRM Deal" />
      <ActivityTable rows={acts} />
      {lost && <LostDialog onClose={() => setLost(null)} onSave={(reason, notes) => { const r = moveDeal(d.name, lost, user, { reason, notes }); if (!r.ok) return r.error; toast.success("Marked as lost"); setLost(null); return null; }} />}
    </>;
  }}</CrmFrame>;
}

/* ---------- Customer 360 ---------- */
export function CustomersList() {
  useScopeMetas(["CRM Organization", "CRM Deal"]);
  const [q, setQ] = useState("");
  return <CrmFrame title="Customer 360" subtitle="Companies with their opportunities, leads and ERP documents.">{(user) => {
    const deals = scopedDeals(user);
    const orgs = scopedList("CRM Organization", user).filter((o) => (isManager(user) || deals.some((d) => d["organization"] === o.name)) && `${o.name} ${String(o["organization_name"] ?? "")}`.toLowerCase().includes(q.toLowerCase()));
    const health = new Map(accountHealth(user).map((h) => [h.org, h.state]));
    return <><DeptPanel dept="customer360" /><Section title="Companies" right={<input className="field-input !w-56" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />}>
      {!orgs.length ? <Empty>No companies.</Empty> : <EntTable id="crm-organisations" wrap><table className="dp-table w-full text-sm"><thead><tr><th className="text-start">Company</th><th className="text-start">Industry</th><th className="text-start">Health</th><th className="text-end">Open Opportunities</th><th className="text-end">Open Value</th></tr></thead><tbody>
        {orgs.slice(0, CUSTOMER_ROW_LIMIT).map((o) => { const ds = deals.filter((d) => d["organization"] === o.name && isOpenDeal(d)); const st = health.get(o.name); return <tr key={o.name}>
          <td><span className="inline-flex items-center gap-1.5"><Link to="/digit-crm/customers/$org" params={{ org: o.name }} className="text-primary hover:underline" data-no-i18n>{orgTitle(o.name)}</Link><Open360 doctype="CRM Organization" name={o.name} compact /></span></td><td data-no-i18n>{String(o["industry"] ?? "")}</td>
          <td data-crm-health={st ?? ""}>{st ? <Link to="/digit-crm/reports" search={{ cat: "customers", drill: `health:${st}` } as never} className="hover:underline">{st}</Link> : "—"}</td>
          <td className="text-end"><Num v={ds.length} /></td><td className="text-end"><Num v={fmtMoney(dealsMoney(ds))} /></td></tr>; })}
      </tbody></table></EntTable>}
      {orgs.length > CUSTOMER_ROW_LIMIT && <p className="mt-2 text-xs text-muted-foreground" data-more-rows><span>Showing the first</span> <Num v={CUSTOMER_ROW_LIMIT} /> / <Num v={orgs.length} /> · <span>Use search or filters to narrow the list.</span></p>}
    </Section></>;
  }}</CrmFrame>;
}

export function Customer360({ org }: { org: string }) {
  useScopeMetas(["CRM Organization", "CRM Lead", "CRM Deal", "Contact", "Customer", "Quotation", "Sales Order", "Sales Invoice", "Payment Entry", "Communication", "Email Queue", "CRM Task", "FCRM Note", "CRM Call Log", "Event"]);
  const lang = useLang(), ar = lang === "ar";
  return <CrmFrame bare title="Customer 360" subtitle={orgTitle(org)}>{(user) => {
    const c = customer360(org, user);
    if (!c) return <div className="panel p-6" data-dc-state="denied">Company not found or not permitted.</div>;
    const fin = canSeeFinance(user);
    return <>
      <C360Header c={c} user={user} />
      <CountRow ar={ar} items={[
        { key: "deals", label: ar ? "الصفقات" : "Opportunities", value: c.deals.length, icon: "count", hue: "emerald" },
        { key: "won", label: ar ? "صفقات رابحة" : "Won Deals", value: c.deals.filter((d) => dealStatusType(d["status"]) === "Won").length, icon: "chart", hue: "teal" },
        { key: "open", label: ar ? "صفقات مفتوحة" : "Open deals", value: c.deals.filter(isOpenDeal).length, icon: "doc", hue: "blue", meta: <Num v={fmtMoney(dealsMoney(c.deals.filter(isOpenDeal)))} /> },
        { key: "leads", label: ar ? "العملاء المحتملون" : "Leads", value: c.leads.length, icon: "people", hue: "violet" },
        { key: "quotes", label: ar ? "عروض الأسعار" : "Quotations", value: c.quotations.length, icon: "doc", hue: "amber" },
        { key: "acts", label: ar ? "الأنشطة" : "Activities", value: c.activities.length, icon: "time", hue: "coral" },
      ]} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" data-crm-c360-split>
        <div className="grid min-w-0 content-start gap-4">
          <FocusNowCard c={c} user={user} />
          <Section title="Communication timeline">
            <TimelineItems doctype="CRM Organization" name={c.org.name} references={[
              { doctype: "CRM Organization", name: c.org.name },
              ...c.deals.map((d) => ({ doctype: "CRM Deal", name: d.name })),
              ...c.leads.map((l) => ({ doctype: "CRM Lead", name: l.name })),
              ...c.quotations.map((d) => ({ doctype: "Quotation", name: d.name })),
              ...c.orders.map((d) => ({ doctype: "Sales Order", name: d.name })),
              ...c.invoices.map((d) => ({ doctype: "Sales Invoice", name: d.name })),
            ]} />
          </Section>
        </div>
        <div className="grid min-w-0 content-start gap-4">
          <FactGrid ar={ar} title={ar ? "بيانات الشركة" : "Company details"} facts={[
            { key: "industry", label: ar ? "القطاع" : "Industry", value: <span data-no-i18n>{String(c.org["industry"] || "")}</span>, missing: !c.org["industry"] },
            { key: "territory", label: ar ? "المنطقة" : "Territory", value: <span data-no-i18n>{String(c.org["territory"] || "")}</span>, missing: !c.org["territory"] },
            { key: "employees", label: ar ? "عدد الموظفين" : "Employees", value: <Num v={String(c.org["no_of_employees"] || "")} />, missing: !c.org["no_of_employees"] },
            { key: "website", label: ar ? "الموقع" : "Website", value: <span dir="ltr" className="break-all" data-no-i18n>{String(c.org["website"] || "").replace(/^https?:\/\/(www\.)?/, "")}</span>, missing: !c.org["website"] },
            { key: "customer", label: ar ? "سجل العميل" : "Customer record", value: c.customers.length ? <span className="space-x-2">{c.customers.map((x) => <QuickLink key={x.name} doctype="Customer" name={x.name}><bdi data-no-i18n>{String(x["customer_name"] || x.name)}</bdi></QuickLink>)}</span> : undefined, missing: !c.customers.length },
            { key: "contacts", label: ar ? "جهات الاتصال" : "Contacts", value: <Num v={c.contacts.length} />, missing: !c.contacts.length },
          ]} />
          <OpenDealsCard c={c} />
          <PaymentScoreBlock c={c} user={user} />
        </div>
      </div>
      <FinanceTabs c={c} user={user} />
      <CompanyChangeLog c={c} />
      <UpcomingFollowUps rows={c.activities} />
      {fin ? <Receivables c={c} /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Opportunities">{!c.deals.length ? <Empty>No opportunities.</Empty> : <table className="dp-table w-full text-sm"><tbody>{c.deals.map((d) => <tr key={d.name}><td><RefLink dt="CRM Deal" name={d.name} /></td><td>{String(d["status"])}</td><td className="text-end"><Num v={fmtMoney(dealsMoney([d]))} /></td></tr>)}</tbody></table>}</Section>
        <Section title="Leads">{!c.leads.length ? <Empty>No leads.</Empty> : <table className="dp-table w-full text-sm"><tbody>{c.leads.map((l) => <tr key={l.name}><td><RefLink dt="CRM Lead" name={l.name} /></td><td data-no-i18n>{leadTitle(l)}</td><td>{String(l["status"] ?? "")}</td></tr>)}</tbody></table>}</Section>
        <Section title="Contacts">{!c.contacts.length ? <Empty>No contacts.</Empty> : <ul className="text-sm">{c.contacts.map((x) => <li key={x.name}><Link to="/app/$app/$doctype/$name" params={{ app: "frappe", doctype: "contact", name: x.name }} className="text-primary hover:underline" data-no-i18n>{String(x["full_name"] || x["first_name"] || x.name)}</Link></li>)}</ul>}</Section>
        <Section title="ERP documents">
          {!c.customers.length && !c.quotations.length ? <Empty>No linked ERP customer or quotation yet.</Empty> : <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Customer</dt><dd className="space-x-2">{c.customers.map((x) => <DeskLink key={x.name} app="erpnext" dt="Customer" name={x.name} />)}</dd>
            <dt className="text-muted-foreground">Quotations</dt><dd className="space-x-2">{c.quotations.map((x) => <DeskLink key={x.name} app="erpnext" dt="Quotation" name={x.name} />)}</dd>
            <dt className="text-muted-foreground">Sales Orders</dt><dd className="space-x-2">{c.orders.length ? c.orders.map((x) => <DeskLink key={x.name} app="erpnext" dt="Sales Order" name={x.name} />) : "—"}</dd>
            <dt className="text-muted-foreground">Sales Invoices</dt><dd className="space-x-2">{c.invoices.length ? c.invoices.map((x) => <DeskLink key={x.name} app="erpnext" dt="Sales Invoice" name={x.name} />) : "—"}</dd>
          </dl>}
        </Section>
      </div>
      <ActivityTable rows={c.activities} />
    </>;
  }}</CrmFrame>;
}

/** CR3-01 Customer 360 header: cover in the account-health colour, large avatar, industry, territory and status with the chips. */
function C360Header({ c, user }: { c: NonNullable<ReturnType<typeof customer360>>; user: string }) {
  const ar = useLang() === "ar";
  const name = orgTitle(c.org.name) || c.org.name;
  const initials = name.replace(/—.*$/, "").trim().split(/\s+/).filter((w) => !/^(شركة|مؤسسة|مجموعة|al|the)$/i.test(w)).slice(0, 2).map((w) => w.replace(/^(ال|Al-)/i, "").charAt(0)).join("").toUpperCase() || name.charAt(0);
  const health = accountHealth(user).find((h) => h.org === c.org.name)?.state;
  const tone = health === "At risk" ? "bad" : health === "Silent" ? "off" : "ok";
  const hue = health === "At risk" ? "rose" : health === "Silent" ? "amber" : "emerald";
  const open = c.deals.filter(isOpenDeal);
  return <ContextStrip cover={hue}
    icon={<span className="r3-avatar r1-avatar64" aria-hidden data-no-i18n style={{ background: `var(--${hue})` }} data-c360-avatar>{initials}</span>}
    eyebrow={<>{ar ? "ملف العميل 360" : "Customer 360"}{c.org["industry"] ? <span className="r1-dept-pill" style={{ ["--hue" as string]: `var(--${hue})` }} data-no-i18n>{String(c.org["industry"])}</span> : null}</>}
    title={<span data-no-i18n data-c360-name>{name}</span>}
    chips={<>{health ? <span className="ek-hero-chip r1-status-solid" data-tone={tone} data-hero-status={health}>{ar ? ({ "At risk": "معرّض للخطر", Silent: "صامت", Healthy: "نشط" } as Record<string, string>)[health] ?? health : health}</span> : null}
      <span className="ek-hero-chip"><span className="ek-hero-chip-l">{ar ? "صفقات مفتوحة" : "Open deals"}</span><bdi data-no-i18n>{open.length}</bdi></span>
      <span className="ek-hero-chip"><span className="ek-hero-chip-l">{ar ? "القيمة المفتوحة" : "Open value"}</span><Num v={fmtMoney(dealsMoney(open))} /></span>
      {c.org["territory"] ? <span className="ek-hero-chip"><span className="ek-hero-chip-l">{ar ? "المنطقة" : "Territory"}</span><bdi data-no-i18n>{String(c.org["territory"])}</bdi></span> : null}</>}
    actions={<Link to="/digit-crm/customers/$org" params={{ org: c.org.name }} className="ek-context-btn">{ar ? "فتح الشركة" : "Open company"}</Link>} />;
}

/** Customer 360 — open follow-up tasks on the account's deals and leads, earliest due first (actual task records). */
const CUSTOMER_ROW_LIMIT = 200;
function UpcomingFollowUps({ rows }: { rows: Activity[] }) {
  const open = rows.filter((a) => a.kind === "Task" && !["Done", "Canceled"].includes(String(a.status))).sort((a, b) => (a.when || "9999").localeCompare(b.when || "9999")).slice(0, 10);
  return <div data-crm-upcoming><ActivityTable rows={open} title="Upcoming follow-ups" /></div>;
}

/* ---------- Customer 360 receivables (billed vs unpaid, payments) ---------- */
function Receivables({ c }: { c: NonNullable<ReturnType<typeof customer360>> }) {
  if (!c.customers.length) return <Section title="Billing & receivables"><Empty>No linked ERP customer yet — billing appears once a Customer exists.</Empty></Section>;
  const r = receivablesSafe(c.invoices), pays = paymentsOf(c.customers.map((x) => x.name));
  return <Section title="Billing & receivables">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-crm-receivables>
      <Kpi label="Total Billed" value={<Num v={fmtMoney(r.billed)} />} hint="Submitted invoices, excl. returns" /><Kpi label="Unpaid" value={<Num v={fmtMoney(r.unpaid)} />} hint="Outstanding amount" />
      <Kpi label="Overdue" value={<Num v={fmtMoney(r.overdue)} />} hint="Unpaid past due date" /><Kpi label="Payments" value={pays.length} hint={<Num v={fmtMoney(sumMoney(pays.map((p) => ({ cur: String(p["paid_from_account_currency"] || p["paid_to_account_currency"] || ""), amt: Number(p["paid_amount"] ?? 0), date: String(p["posting_date"] ?? ""), docRate: p["source_exchange_rate"], key: p.name }))))} />} />
    </div>
    {pays.length > 0 && <div className="mt-3 overflow-x-auto"><table className="dp-table w-full text-sm"><thead><tr><th className="text-start">Payment Entry</th><th className="text-start">Date</th><th className="text-end">Amount</th></tr></thead>
      <tbody>{pays.map((p) => <tr key={p.name}><td><DeskLink app="erpnext" dt="Payment Entry" name={p.name} /></td><td><Num v={String(p["posting_date"] ?? "")} /></td><td className="text-end"><Num v={`${String(p["paid_from_account_currency"] || p["paid_to_account_currency"] || "")} ${money(Number(p["paid_amount"] ?? 0))}`.trim()} /></td></tr>)}</tbody></table></div>}
    <MoneyNote s={[r.billed, r.unpaid]} />
    <p className="mt-2 text-xs text-muted-foreground">Read only — invoices, payments and ledger entries are posted in their native DIGIT forms, never from CRM.</p>
  </Section>;
}

/* ---------- Activities ---------- */
function ActivityTable({ rows, title = "Activities" }: { rows: Activity[]; title?: string }) {
  const lang = useLang();
  const date = (s: string) => parseDue(s)?.toLocaleString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { dateStyle: "medium", timeStyle: "short" }) ?? "—";
  const titleOf = (a: Activity) => lang === "ar" && a.kind === "Call" ? a.title.replace(/^Incoming/, "واردة").replace(/^Outgoing/, "صادرة").replace(/^Call/, "مكالمة") : a.title;
  return <Section title={title}>{!rows.length ? <Empty>No activities.</Empty> : <EntTable id="crm-activities" wrap><table className="dp-table w-full text-sm" data-crm-activities>
    <thead><tr><th className="text-start">Type</th><th className="text-start">Title</th><th className="text-start">Related</th><th className="text-start">Owner</th><th className="text-start">Status</th><th className="text-start">When</th></tr></thead>
    <tbody>{rows.map((a) => <tr key={a.kind + a.name}><td>{a.kind}</td><td><Link to="/app/$app/$doctype/$name" params={{ app: "crm", doctype: a.kind === "Task" ? "crm_task" : a.kind === "Note" ? "fcrm_note" : "crm_call_log", name: a.name }} className="text-primary hover:underline" data-no-i18n>{titleOf(a)}</Link></td><td><RefLink dt={a.refDt} name={a.refName} /></td><td data-no-i18n>{a.owner ? userLabel(a.owner) : "—"}</td><td>{a.status || "—"}</td><td className="whitespace-nowrap" data-no-i18n>{date(a.when)}</td></tr>)}</tbody>
  </table></EntTable>}</Section>;
}

export type ActivitySearch = { kind?: Activity["kind"] | undefined; q?: string | undefined; owner?: string | undefined; /** RecordList saved view / strip (owner notes C-07) */ view?: string | undefined; strip?: string | undefined };
export function Activities({ search = {} }: { search?: ActivitySearch }) {
  const nav = useNavigate();
  const set = (patch: Partial<ActivitySearch>) => void nav({ to: "/digit-crm/activities", search: { ...search, ...patch } });
  return <CrmFrame title="Activities" subtitle="Tasks, notes and calls across your leads and opportunities.">{(user) => {
    const all = activities(user), query = (search.q ?? "").trim().toLocaleLowerCase();
    const rows = all.filter((a) => (!search.kind || a.kind === search.kind) && (!search.owner || a.owner === search.owner)
      && (!query || [a.title, a.name, a.refName].some((v) => v.toLocaleLowerCase().includes(query))));
    const overdue = all.filter((a) => a.kind === "Task" && bucketOf({ name: a.name, status: a.status, due_date: a.when } as never) === "overdue").length;
    return <>
      <DeptPanel dept="activities" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Tasks" value={all.filter((a) => a.kind === "Task").length} to="/digit-crm/follow-ups" /><Kpi label="Overdue" value={overdue} to="/digit-crm/follow-ups" />
        <Kpi label="Notes" value={all.filter((a) => a.kind === "Note").length} to="/digit-crm/activities" /><Kpi label="Calls" value={all.filter((a) => a.kind === "Call").length} to="/digit-crm/activities" />
      </div>
      <div className="flex flex-wrap items-end gap-3" data-crm-activity-filters>
        <div className="flex gap-1" role="group" aria-label="Type">{(["", "Task", "Note", "Call"] as const).map((k) => <Button key={k} size="sm" variant={(search.kind ?? "") === k ? "secondary" : "ghost"} onClick={() => set({ kind: k || undefined })} aria-pressed={(search.kind ?? "") === k}>{k || "All"}</Button>)}</div>
        <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">Search</span><input className="field-input" aria-label="Search activities" value={search.q ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} /></label>
        <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">Owner</span><select className="field-input" value={search.owner ?? ""} onChange={(e) => set({ owner: e.target.value || undefined })}><option value="">All owners</option>{ownerChoices(user).map((o) => <option key={o.name} value={o.name} data-no-i18n>{userLabel(o.name)}</option>)}</select></label>
        {(search.kind || search.q || search.owner) && <Button size="sm" variant="ghost" onClick={() => set({ kind: undefined, q: undefined, owner: undefined })}>Clear filters</Button>}
        <span className="ms-auto text-xs text-muted-foreground"><Num v={rows.length} /> / <Num v={all.length} /></span>
      </div>
      <ActivityTable rows={rows.slice(0, ACTIVITY_ROW_LIMIT)} />
      {rows.length > ACTIVITY_ROW_LIMIT && <p className="mt-2 text-xs text-muted-foreground" data-more-rows><span>Showing the first</span> <Num v={ACTIVITY_ROW_LIMIT} /> · <span>Use search or filters to narrow the list.</span></p>}
    </>;
  }}</CrmFrame>;
}


/** Shows which conversion rates were used, or why a consolidated amount is unavailable. */
export function MoneyNote({ s }: { s: MoneySum[] }) {
  const reasons = [...new Set(s.map((x) => x.reason).filter(Boolean))], rates = Object.assign({}, ...s.map((x) => x.rates)) as Record<string, string>;
  if (!reasons.length && !Object.keys(rates).length) return null;
  return <p className="mt-2 text-xs text-muted-foreground" data-crm-money-note>{reasons.length ? <>Consolidated total unavailable: <span data-no-i18n>{reasons.join("; ")}</span>. Amounts are shown per currency.</> : <>Converted to base currency at <span data-no-i18n dir="ltr">{Object.entries(rates).map(([c, r]) => `${c} ${r}`).join("; ")}</span>.</>}</p>;
}
