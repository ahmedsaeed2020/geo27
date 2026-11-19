import { Link, useNavigate } from "@tanstack/react-router";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { leadTitle } from "./leadDesk";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Shell } from "@/components/Shell";
import { useHydrated } from "@/components/hrms/HrShell";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { useSessionUser } from "@/lib/session";
import { enabledPlugins, usePluginsVersion } from "@/plugins/runtime";
import {
  assignLead, bucketOf, canUseCrm, completeTask, counts, createTask, crmUsers, isManager, myWorkTasks, parseDue, PRIORITIES,
  rankQueue, reassignTask, rescheduleTask, scopedLeads, scopedTasks, unassignedLeads, userLabel, type Bucket,
} from "./wf01";

import { ManagerExceptions } from "./Wave5";
import { LeadCreateDrawer } from "./LeadCreate";
import { firstContactStats } from "./wf07";
import { actionQueue, teamPerformance, type Reason } from "./wf09";
import { dealsMoney, fmtMoney } from "./wf05";
import { sarText } from "@/lib/format";
import { DemoBanner } from "./DemoControls";
import { useScopeMetas } from "@/lib/scope";
import { DEMO_TYPES } from "./demoSchema";
import { DeptPanel } from "./Workspace";
import { CrmPager, usePage } from "@/components/crm/CrmPager";
import { linkTitle } from "@/lib/linkTitle";
import { useLang } from "@/i18n";
import { enterApp } from "@/plugins/appShell";
import { setActiveExperience, useActiveExperience } from "@/plugins/theme";
import { appIconFor } from "@/components/enterprise/iconMap";
import { BandTabsHost, ContextStrip, KpiRow, type KpiItem } from "@/components/enterprise/kit/templates";
import { DoneTodayCard, ForecastTrendBlock, LeadersStrip, TeamCardsBlock, TodayTimelineCard } from "./HomeBoard";
import { FollowBulkBar, SalesQueue, TargetRingCard, UpcomingCard, WaitChip } from "./SalesDesk";

/** `bare` pages (module command centers) render their own command header instead of the standard page head. */
export function CrmFrame({ title, subtitle, actions, children, bare, tabs }: { title: string; subtitle: string; actions?: ReactNode; children: (user: string) => ReactNode; bare?: boolean; /** section tabs drawn right under the band */ tabs?: ReactNode }) {
  const hyd = useHydrated(); usePluginsVersion(); useStoreVersion();
  useScopeMetas(["CRM Lead", "CRM Deal", "CRM Deal Status", "CRM Task", "Communication", "CRM Call Log", "FCRM Note", "Campaign", "Sales Person", "Company", "CRM Organization", "Customer", "Sales Invoice", "Sales Order", "Quotation", "Payment Entry", "Fiscal Year", "Event", ...Object.values(DEMO_TYPES)]);
  const user = useSessionUser();
  const enabled = hyd && enabledPlugins().some((p) => p.name === "digit_crm");
  // Final Core: opening a DIGIT CRM screen enters the app and its experience; the shared Shell then shows the CRM module
  // rail and sections (experience slot Sidebar, ./slots.tsx) instead of a per-page sidebar prop.
  const xp = useActiveExperience();
  useEffect(() => { if (enabled) { enterApp("digit_crm"); if (xp !== "digit_crm") setActiveExperience("digit_crm"); } }, [enabled, xp]);
  return (
    <Shell crumbs={[{ label: "", to: <Link to="/digit-crm" className="hover:underline">DIGIT CRM</Link> }, { label: title }]}>
      {!hyd ? <div className="p-6 text-sm text-muted-foreground" data-dc-state="loading">Loading…</div>
        : !enabled ? <div className="panel p-6"><h2 className="font-semibold">DIGIT CRM is not enabled</h2><Link to="/plugins" className="text-sm underline">Apps & Plugins</Link></div>
        : !canUseCrm(user) ? <div className="panel p-6" data-dc-state="denied"><h2 className="font-semibold">Not Permitted</h2><p className="text-sm text-muted-foreground">You need a Sales User or Sales Manager role to use DIGIT CRM.</p></div>
        : <div data-digit-crm><BandTabsHost tabs={tabs ?? null}>
          <DemoBanner />
          {!bare && <header data-dc-pagehead>
            <ContextStrip icon={<img src={appIconFor("digit_crm", "band")} alt="" className="h-7 w-7" data-app-badge="digit_crm" />} eyebrow={<span data-no-i18n>DIGIT CRM</span>} title={title} sub={subtitle}
              actions={<>{actions}<Link to="/digit-crm/leads" className="ek-context-btn" data-crm-all-leads>All Leads</Link></>} />
          </header>}
          <div className={bare ? "space-y-4" : "mt-4 space-y-4"}>{children(user)}</div>
        </BandTabsHost></div>}
    </Shell>
  );
}

/* ---------- shared bits ---------- */
const BADGE: Record<Bucket, string> = { overdue: "bg-destructive/15 text-destructive", today: "bg-primary/15 text-primary", upcoming: "bg-muted text-muted-foreground", undated: "bg-muted text-muted-foreground", closed: "bg-muted text-muted-foreground" };
const BLABEL: Record<Bucket, string> = { overdue: "Overdue", today: "Due Today", upcoming: "Upcoming", undated: "No due date", closed: "Done" };
const fmt = (v: unknown) => { const d = parseDue(v); const ar = typeof document !== "undefined" && localStorage.getItem("digit-virtual-core:lang") !== "en"; return d ? d.toLocaleString(ar ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—"; };
const toLocalInput = (v: unknown) => String(v ?? "").slice(0, 16).replace(" ", "T");

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>("input,select,button")?.focus(); const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-0 sm:items-center sm:p-4" onClick={onClose}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="panel w-full max-w-md p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
      <h2 className="mb-3 text-base font-semibold">{title}</h2>{children}
    </div>
  </div>;
}
function Field({ label, error, children }: { label: string; error?: string | undefined; children: ReactNode }) {
  return <label className="mb-2 block text-sm"><span className="mb-1 block text-muted-foreground">{label}</span>{children}{error && <span role="alert" className="mt-1 block text-xs text-destructive">{error}</span>}</label>;
}

export function LeadDialog({ user, onClose }: { user: string; onClose: () => void }) {
  const ar = useLang() === "ar";
  return <LeadCreateDrawer open onOpenChange={(o) => { if (!o) onClose(); }} user={user} ar={ar} />;
}

export function TaskDialog({ user, lead, onClose }: { user: string; lead?: string; onClose: () => void }) {
  const tomorrow = new Date(Date.now() + 86400000); tomorrow.setHours(10, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  const [f, setF] = useState<Record<string, string>>({ lead: lead ?? "", priority: "Medium", due: `${tomorrow.getFullYear()}-${p(tomorrow.getMonth() + 1)}-${p(tomorrow.getDate())}T10:00` });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const leads = scopedLeads(user).filter((l) => !Number(l["converted"]));
  const save = () => {
    const r = createTask({ lead: f["lead"]!, title: f["title"], due: f["due"], priority: f["priority"], assigned_to: f["assigned_to"] }, user);
    if (!r.ok) { setErr(r.errors); return; }
    toast.success("Task scheduled", { description: r.name }); onClose();
  };
  return <Modal title="Schedule Next Action" onClose={onClose}>
    <form onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
      <Field label="Lead *" error={err["lead"]}><select className="field-input" value={f["lead"]} onChange={set("lead")}>
        <option value="">Select a lead</option>{leads.map((l) => <option key={l.name} value={l.name} data-no-i18n>{leadTitle(l)} · {l.name}</option>)}
      </select></Field>
      <Field label="Title *" error={err["title"]}><input className="field-input" value={f["title"] ?? ""} onChange={set("title")} /></Field>
      <Field label="Due date and time *" error={err["due"]}><input dir="ltr" type="datetime-local" className="field-input" value={f["due"] ?? ""} onChange={set("due")} /></Field>
      <Field label="Priority"><select className="field-input" value={f["priority"]} onChange={set("priority")}>{PRIORITIES.map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
      {isManager(user) && <Field label="Assigned To"><select className="field-input" value={f["assigned_to"] ?? ""} onChange={set("assigned_to")}>
        <option value="">Lead Owner</option>{crmUsers().map((u) => <option key={u.name} value={u.name} data-no-i18n>{userLabel(u.name)}</option>)}
      </select></Field>}
      <div className="mt-3 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" data-dc-save-task>Save</button></div>
    </form>
  </Modal>;
}

export function TaskTable({ tasks, user, empty }: { tasks: Doc[]; user: string; empty: string }) {
  const [resched, setResched] = useState<Doc | null>(null);
  const [due, setDue] = useState("");
  // CR2-02: rows carry a 3px start rule (overdue red, due today amber) and can be selected for a bulk reschedule
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const mgr = isManager(user);
  const pg = usePage(tasks.length), lang = useLang();
  if (!tasks.length) return <div className="panel p-6 text-center text-sm text-muted-foreground" data-dc-state="empty">{empty}</div>;
  const done = (t: Doc) => { const r = completeTask(t.name, user); if (r.ok) toast.success("Task completed"); else toast.error(Object.values(r.errors)[0]); };
  const page = pg.slice(tasks); const live = tasks.filter((t) => sel.has(t.name)).map((t) => t.name);
  const pageAll = page.length > 0 && page.every((t) => sel.has(t.name));
  const flip = (k: string, on: boolean) => setSel((x) => { const n = new Set(x); if (on) n.add(k); else n.delete(k); return n; });
  return <>
    <div className="panel overflow-x-auto">
      <EntTable id="crm-queue" wrap><table className="w-full text-sm" data-dc-queue>
        <thead><tr className="text-start"><th className="w-8 px-3 py-2"><input type="checkbox" checked={pageAll} onChange={(e) => setSel((x) => { const n = new Set(x); page.forEach((t) => (e.target.checked ? n.add(t.name) : n.delete(t.name))); return n; })} aria-label={lang === "ar" ? "تحديد الصفحة" : "Select this page"} data-dc-select-page /></th>{["Status", "Lead", "Action", "Owner", "Due", "Priority", ""].map((h, i) => <th key={i} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
        <tbody>{page.map((t) => {
          const b = bucketOf(t); const lead = adapter.get("CRM Lead", String(t["reference_docname"]));
          return <tr key={t.name} className="ek-flagrow border-t border-border" data-flag={b === "overdue" ? "bad" : b === "today" ? "warn" : undefined} data-task={t.name} data-bucket={b}>
            <td className="px-3 py-2"><input type="checkbox" checked={sel.has(t.name)} onChange={(e) => flip(t.name, e.target.checked)} aria-label={lang === "ar" ? "تحديد" : "Select"} data-dc-select={t.name} /></td>
            <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-medium ${BADGE[b]}`}>{BLABEL[b]}</span></td>
            <td className="px-3 py-2"><Link to="/digit-crm/leads/$leadId" params={{ leadId: String(t["reference_docname"]) }} className="font-medium hover:underline" data-no-i18n>{(lead ? leadTitle(lead) : String(t["reference_docname"]))}</Link><div className="text-xs text-muted-foreground" data-no-i18n>{linkTitle("CRM Organization", lead?.["organization"])}</div></td>
            <td className="px-3 py-2" data-no-i18n>{String(t["title"] ?? "")}</td>
            <td className="px-3 py-2">{mgr ? <select aria-label="Reassign" className="field-input py-1" value={String(t["assigned_to"] ?? "")} onChange={(e) => { const r = reassignTask(t.name, e.target.value, user); if (r.ok) toast.success("Task reassigned"); else toast.error(Object.values(r.errors)[0]); }}>
              <option value="" disabled>Unassigned</option>{crmUsers().map((u) => <option key={u.name} value={u.name} data-no-i18n>{userLabel(u.name)}</option>)}</select>
              : <span data-no-i18n>{userLabel(t["assigned_to"])}</span>}</td>
            <td className="px-3 py-2 whitespace-nowrap"><span data-no-i18n>{fmt(t["due_date"])}</span> <WaitChip due={t["due_date"]} bucket={b} ar={lang === "ar"} /></td>
            <td className="px-3 py-2">{String(t["priority"] ?? "")}</td>
            <td className="px-3 py-2"><div className="flex justify-end gap-1">
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => done(t)} data-dc-complete>Complete</button>
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => { setResched(t); setDue(toLocalInput(t["due_date"])); }}>Reschedule</button>
            </div></td>
          </tr>;
        })}</tbody>
      </table></EntTable>
      <CrmPager p={pg} lang={lang} className="border-t border-border" />
    </div>
    <FollowBulkBar selected={live} tasks={tasks} user={user} onClear={() => setSel(new Set())} onAll={() => setSel(new Set(tasks.map((t) => t.name)))} />
    {resched && <Modal title="Reschedule" onClose={() => setResched(null)}>
      <form onSubmit={(e) => { e.preventDefault(); const r = rescheduleTask(resched.name, due, user); if (r.ok) { toast.success("Task rescheduled"); setResched(null); } else toast.error(Object.values(r.errors)[0]); }}>
        <Field label="Due date and time *"><input dir="ltr" type="datetime-local" className="field-input" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <div className="mt-3 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setResched(null)}>Cancel</button><button type="submit" className="btn-primary">Save</button></div>
      </form>
    </Modal>}
  </>;
}

function Kpi({ label, value, to, search, tone }: { label: string; value: number; to: "/digit-crm/follow-ups" | "/digit-crm/manager"; search?: Record<string, string>; tone?: string }) {
  return <Link to={to} search={search as never} className="panel block p-4 hover:bg-muted" data-kpi={label}>
    <div className="text-sm text-muted-foreground">{label}</div><div className={`mt-1 text-2xl font-semibold ${tone ?? ""}`} data-no-i18n>{value}</div>
  </Link>;
}

/* ---------- screens ---------- */
function Actions({ user }: { user: string }) {
  const [dlg, setDlg] = useState<"lead" | "task" | null>(null);
  return <>
    <button type="button" className="btn-primary" onClick={() => setDlg("lead")} data-dc-add-lead>Add Lead</button>
    <button type="button" className="btn-ghost" onClick={() => setDlg("task")} data-dc-add-task>Schedule Next Action</button>
    {dlg === "lead" && <LeadDialog user={user} onClose={() => setDlg(null)} />}
    {dlg === "task" && <TaskDialog user={user} onClose={() => setDlg(null)} />}
  </>;
}

export const REASON_LABEL: Record<Reason, string> = { overdue: "Overdue follow-up", today: "Due today", high_no_next: "High value · no next action", close_soon: "Closing within 7 days", new_lead: "New lead · first contact", no_next: "No next action", upcoming: "Scheduled" };
export const REASON_TONE: Record<Reason, string> = { overdue: "bg-destructive/15 text-destructive", today: "bg-primary/15 text-primary", high_no_next: "bg-destructive/10 text-destructive", close_soon: "bg-accent text-accent-foreground", new_lead: "bg-primary/10 text-primary", no_next: "bg-muted text-muted-foreground", upcoming: "bg-muted text-muted-foreground" };
export function PriorityQueue({ user, only, owner, title = "Priority queue", empty }: { user: string; only?: "deals"; owner?: string | undefined; title?: string; empty?: string }) {
  const q = actionQueue(user).filter((i) => i.reason !== "upcoming" && (!only || i.dt === "CRM Deal") && (!owner || i.owner === owner)).slice(0, only ? 100 : 15);
  if (!q.length) return empty ? <div className="panel p-6 text-center text-sm text-muted-foreground" data-dc-state="empty">{empty}</div> : null;
  return <section className="panel overflow-x-auto" data-dc-priority>
    <h2 className="border-b border-border px-3 py-2 text-sm font-semibold">{title} <span className="text-muted-foreground" data-no-i18n>({q.length})</span></h2>
    <EntTable id="crm-team-queue" wrap><table className="w-full text-sm"><thead><tr>{["Priority reason", "Record", "Required action", "Due", "Amount", "Owner", ""].map((h, i) => <th key={i} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
    <tbody>{q.map((i) => <tr key={i.key} className="border-t border-border" data-reason={i.reason}>
      <td className="px-3 py-2"><span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${REASON_TONE[i.reason]}`}>{REASON_LABEL[i.reason]}</span></td>
      <td className="px-3 py-2">{i.dt === "CRM Deal" ? <Link to="/digit-crm/deals/$dealId" params={{ dealId: i.name }} className="font-medium hover:underline" data-no-i18n>{linkTitle("CRM Organization", i.title) || i.title}</Link> : <Link to="/digit-crm/leads/$leadId" params={{ leadId: i.name }} className="font-medium hover:underline" data-no-i18n>{i.dt === "CRM Lead" && !i.task ? i.title : String(adapter.get("CRM Lead", i.name)?.["lead_name"] || i.name)}</Link>}<div className="text-xs text-muted-foreground" data-no-i18n>{i.name}{i.task ? ` · ${i.title}` : ""}</div></td>
      <td className="px-3 py-2">{i.action}</td>
      <td className="px-3 py-2 whitespace-nowrap" dir="ltr" data-no-i18n>{i.due ? fmt(i.due) : "—"}</td>
      <td className="px-3 py-2 whitespace-nowrap" dir="ltr" data-no-i18n>{i.amount ? `${i.amount.toLocaleString("en-US")} ${i.cur}` : "—"}</td>
      <td className="px-3 py-2" data-no-i18n>{i.owner ? userLabel(i.owner) : "—"}</td>
      <td className="px-3 py-2 text-end">{i.task ? <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => { const r = completeTask(i.task!, user); if (r.ok) toast.success("Task completed"); else toast.error(Object.values(r.errors)[0]); }}>Complete</button> : null}</td>
    </tr>)}</tbody></table></EntTable>
  </section>;
}

export function MyWork() {
  const user = useSessionUser(); const ar = useLangAr();
  return <CrmFrame title="My Work" subtitle="Today's follow-ups on canonical CRM leads and tasks." actions={<Actions user={user} />}>{(u) => {
    const mine = myWorkTasks(u);
    const c = counts(mine);
    return <>
      {/* owner notes C-02: coloured KPI cards (same four figures and drills), then queue → record → next step, today's timeline and the done-today ring */}
      <DeskKpis items={[
        { id: "mw:overdue", label: ["Overdue", "متأخرة"], value: c.overdue, tone: "risk", to: "/digit-crm/follow-ups", search: { tab: "overdue" } },
        { id: "mw:today", label: ["Due Today", "مستحقة اليوم"], value: c.today, tone: "attention", to: "/digit-crm/follow-ups", search: { tab: "today" } },
        { id: "mw:upcoming", label: ["Upcoming", "قادمة"], value: c.upcoming, tone: "info", to: "/digit-crm/follow-ups", search: { tab: "upcoming" } },
        isManager(u) ? { id: "mw:unassigned", label: ["Unassigned Leads", "عملاء بلا مسؤول"], value: unassignedLeads(u).length, to: "/digit-crm/manager" } : { id: "mw:undated", label: ["No due date", "بلا تاريخ استحقاق"], value: c.undated, to: "/digit-crm/follow-ups", search: { tab: "upcoming" } },
      ]} id="crm:mywork" />
      <SalesQueue user={u} />
      <DeskPair a={<TodayTimelineCard user={u} ar={ar} />} b={<DoneTodayCard user={u} ar={ar} />} attr="data-crm-today-pair" />
      <div className="grid gap-4 lg:grid-cols-2" data-crm-daily><TargetRingCard user={u} /><UpcomingCard user={u} /></div>
      <DeptPanel dept="mywork" />
      <PriorityQueue user={u} />
      <TaskTable tasks={rankQueue(mine).slice(0, 50)} user={u} empty="Your queue is clear — no open follow-ups." />
    </>;
  }}</CrmFrame>;
}

export type FollowSearch = { tab?: "today" | "overdue" | "upcoming" | "exceptions" | "deals" | undefined; owner?: string | undefined; pg?: number | undefined; pl?: number | undefined };
export function FollowUps({ search }: { search: FollowSearch }) {
  const user = useSessionUser();
  const tab = search.tab ?? "today";
  return <CrmFrame title="Follow-up Center" subtitle="Due, overdue and upcoming next actions in one list." actions={<Actions user={user} />}>{(u) => {
    const all = scopedTasks(u).filter((t) => !search.owner || t["assigned_to"] === search.owner);
    const c = counts(all);
    const un = unassignedLeads(u);
    const dealGaps = actionQueue(u).filter((i) => i.dt === "CRM Deal" && i.reason !== "upcoming" && (!search.owner || i.owner === search.owner)).length;
    const rows = rankQueue(all).filter((t) => { const b = bucketOf(t); return tab === "exceptions" ? b === "overdue" : tab === "upcoming" ? b === "upcoming" || b === "undated" : b === tab; });
    const T = [["today", "Due Today", c.today], ["overdue", "Overdue", c.overdue], ["upcoming", "Upcoming", c.upcoming + c.undated], ["exceptions", "Exceptions", c.overdue + un.length], ["deals", "Deals without next action", dealGaps]] as const;
    return <>
      {/* section tabs directly under the band (ONE STANDARD R2), then the section indicators */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex flex-wrap gap-1">{T.map(([k, l, n]) => <Link key={k} role="tab" aria-selected={tab === k} to="/digit-crm/follow-ups" search={{ ...search, tab: k, pg: undefined }} className={`rounded-md border border-border px-3 py-1.5 text-sm ${tab === k ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`} data-tab={k}>{l} <span data-no-i18n>({n})</span></Link>)}</div>
        {isManager(u) && <OwnerFilter search={search} />}
      </div>
      <DeptPanel dept="followups" />
      {tab === "exceptions" && un.length > 0 && <UnassignedPanel leads={un} user={u} />}
      {tab === "deals" ? <PriorityQueue user={u} only="deals" owner={search.owner} title="Deals without next action" empty="Every open deal has a next action." /> : <TaskTable tasks={rows} user={u} empty={tab === "overdue" || tab === "exceptions" ? "No overdue activities." : "Nothing in this tab."} />}
    </>;
  }}</CrmFrame>;
}
function OwnerFilter({ search }: { search: FollowSearch }) {
  const nav = useNavigate();
  return <select aria-label="Owner" className="field-input ms-auto w-auto" value={search.owner ?? ""} onChange={(e) => void nav({ to: "/digit-crm/follow-ups", search: { ...search, owner: e.target.value || undefined, pg: undefined } })}>
    <option value="">All owners</option>{crmUsers().map((x) => <option key={x.name} value={x.name} data-no-i18n>{userLabel(x.name)}</option>)}
  </select>;
}

export function UnassignedPanel({ leads, user }: { leads: Doc[]; user: string }) {
  return <section className="panel overflow-x-auto" data-dc-unassigned>
    <h2 className="border-b border-border px-3 py-2 text-sm font-semibold">Unassigned Leads <span className="text-muted-foreground" data-no-i18n>({leads.length})</span></h2>
    <table className="w-full text-sm"><tbody>{leads.map((l) => <tr key={l.name} className="border-t border-border first:border-t-0" data-lead={l.name}>
      <td className="px-3 py-2"><Link to="/digit-crm/leads/$leadId" params={{ leadId: l.name }} className="font-medium hover:underline" data-no-i18n>{leadTitle(l)}</Link><div className="text-xs text-muted-foreground" data-no-i18n>{l.name} · {linkTitle("CRM Organization", l["organization"])}</div></td>
      <td className="px-3 py-2">{String(l["status"] ?? "")}</td>
      <td className="px-3 py-2 text-end"><select aria-label="Assign" className="field-input w-auto py-1" value="" onChange={(e) => { const r = assignLead(l.name, e.target.value, user); if (r.ok) toast.success("Lead assigned"); else toast.error(Object.values(r.errors)[0]); }} data-dc-assign>
        <option value="">Assign</option>{crmUsers().map((u) => <option key={u.name} value={u.name} data-no-i18n>{userLabel(u.name)}</option>)}</select></td>
    </tr>)}</tbody></table>
  </section>;
}

export function Manager() {
  const user = useSessionUser(); const ar = useLangAr();
  return <CrmFrame title="Manager Workbench" subtitle="Exception-first review: unassigned leads and overdue follow-ups." actions={<Actions user={user} />}>{(u) => {
    if (!isManager(u)) return <div className="panel p-6" data-dc-state="denied"><h2 className="font-semibold">Not Permitted</h2><p className="text-sm text-muted-foreground">Manager Workbench is for Sales Managers.</p></div>;
    const un = unassignedLeads(u);
    const tasks = scopedTasks(u);
    const byOwner = new Map<string, number>();
    for (const t of tasks) if (bucketOf(t) === "overdue") byOwner.set(String(t["assigned_to"] ?? ""), (byOwner.get(String(t["assigned_to"] ?? "")) ?? 0) + 1);
    const c = counts(tasks);
    return <>
      {/* owner notes C-03 «منضدة المدير»: coloured KPI cards (same figures and drills), team cards, commit / best case / target over the trend, leaders */}
      {(() => { const fc = firstContactStats(scopedLeads(u)); return <DeskKpis id="crm:manager" items={[
        { id: "mg:unassigned", label: ["Unassigned Leads", "عملاء بلا مسؤول"], value: un.length, tone: un.length ? "attention" : "good", to: "/digit-crm/follow-ups", search: { tab: "exceptions" } },
        { id: "mg:overdue", label: ["Overdue", "متأخرة"], value: c.overdue, tone: "risk", to: "/digit-crm/follow-ups", search: { tab: "overdue" } },
        { id: "mg:today", label: ["Due Today", "مستحقة اليوم"], value: c.today, tone: "attention", to: "/digit-crm/follow-ups", search: { tab: "today" } },
        { id: "mg:response", label: ["Lead Response Time", "زمن الرد على العملاء"], value: fc.avgHours !== null ? fc.avgHours : "—", unit: ["hours", "ساعات"], attrs: { "data-kpi": "R-005" },
          sub: [`Leads awaiting first contact: ${fc.noContact.length}${fc.medianHours !== null ? ` · median ${fc.medianHours} h` : ""}`, `بانتظار أول تواصل: ${fc.noContact.length}${fc.medianHours !== null ? ` · الوسيط ${fc.medianHours} ساعة` : ""}`] },
      ]} />; })()}
      <TeamCardsBlock user={u} ar={ar} />
      <DeskPair a={<ForecastTrendBlock user={u} ar={ar} />} b={<LeadersStrip user={u} ar={ar} />} attr="data-crm-manager-pair" />
      <DeptPanel dept="manager" />
      <ManagerExceptions user={u} />
      {un.length ? <UnassignedPanel leads={un} user={u} /> : <div className="panel p-6 text-center text-sm text-muted-foreground" data-dc-state="empty">No unassigned leads.</div>}
      <TeamPerformance user={u} />
      <section className="panel overflow-x-auto" data-dc-overdue-by-owner>
        <h2 className="border-b border-border px-3 py-2 text-sm font-semibold">Overdue activities by owner</h2>
        {byOwner.size ? <table className="w-full text-sm"><tbody>{[...byOwner].sort((a, b) => b[1] - a[1]).map(([o, n]) => <tr key={o} className="border-t border-border first:border-t-0">
          <td className="px-3 py-2" data-no-i18n>{o ? userLabel(o) : "—"}</td>
          <td className="px-3 py-2 text-end"><Link to="/digit-crm/follow-ups" search={{ tab: "overdue", ...(o ? { owner: o } : {}) }} className="font-semibold text-destructive hover:underline" data-no-i18n>{n}</Link></td>
        </tr>)}</tbody></table> : <p className="p-6 text-center text-sm text-muted-foreground">No overdue activities.</p>}
      </section>
    </>;
  }}</CrmFrame>;
}

/** Team performance per salesperson (wf09 teamPerformance) — shared by Manager Workbench and the Sales Management center. */
export function TeamPerformance({ user }: { user: string }) {
  return <section className="panel overflow-x-auto" data-dc-team>
    <h2 className="border-b border-border px-3 py-2 text-sm font-semibold">Team performance</h2>
    <EntTable id="crm-team-performance" wrap><table className="w-full text-sm"><thead><tr>{["Salesperson", "Open follow-ups", "Overdue", "Follow-up compliance", "Open deals", "Pipeline", "Won", "Lost"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
    <tbody>{teamPerformance(user).map((r) => <tr key={r.owner} className="border-t border-border" data-owner={r.owner}>
      <td className="px-3 py-2" data-no-i18n>{r.owner ? userLabel(r.owner) : "—"}</td>
      <td className="px-3 py-2" data-no-i18n>{r.openTasks}</td>
      <td className="px-3 py-2">{r.overdue ? <Link to="/digit-crm/follow-ups" search={{ tab: "overdue", ...(r.owner ? { owner: r.owner } : {}) }} className="font-semibold text-destructive hover:underline" data-no-i18n>{r.overdue}</Link> : <span data-no-i18n>0</span>}</td>
      <td className="px-3 py-2" dir="ltr" data-no-i18n>{r.compliance === null ? "—" : `${r.compliance}%`}</td>
      <td className="px-3 py-2" data-no-i18n>{r.openDeals.length}</td>
      <td className="px-3 py-2 whitespace-nowrap" dir="ltr" data-no-i18n>{r.openDeals.length ? sarText(fmtMoney(dealsMoney(r.openDeals))) : "—"}</td>
      <td className="px-3 py-2" data-no-i18n>{r.won}</td><td className="px-3 py-2" data-no-i18n>{r.lost}</td>
    </tr>)}</tbody></table></EntTable>
  </section>;
}

/* ---------- owner notes C-02 / C-03 desk helpers (Enterprise KPI cards, two-up blocks) ---------- */
const useLangAr = () => useLang() === "ar";
type DeskKpi = { id: string; label: [string, string]; value: number | string; tone?: KpiItem["tone"]; to?: string; search?: Record<string, string>; unit?: [string, string]; sub?: [string, string]; attrs?: Record<string, string> };
function DeskKpis({ items, id }: { items: DeskKpi[]; id: string }) {
  const ar = useLangAr();
  return <KpiRow id={id} ar={ar} items={items.map((k) => ({ id: k.id, label: ar ? k.label[1] : k.label[0], value: `${k.value}${k.unit && k.value !== "—" ? ` ${ar ? k.unit[1] : k.unit[0]}` : ""}`, tone: k.tone, ...(k.attrs ? { attrs: k.attrs } : {}),
    sub: k.sub ? (ar ? k.sub[1] : k.sub[0]) : undefined, wrap: k.to ? (n) => <Link to={k.to as never} search={(k.search ?? {}) as never} className="contents">{n}</Link> : undefined }))} />;
}
function DeskPair({ a, b, attr }: { a: ReactNode; b: ReactNode; attr: string }) { return <div className="grid gap-4 lg:grid-cols-2" {...{ [attr]: "" }}>{a}{b}</div>; }
