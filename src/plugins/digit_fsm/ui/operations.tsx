import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * Operations destinations (blueprint priorities A, B and 4): Service manager Operations Center (CRM CommandCenter pattern:
 * command band + content tabs + work queues + actionable charts), Visits Portfolio + Visit 360 (Construction
 * PortfolioPage / Project 360 pattern: dense per-record cards with full drill) and Team & technicians performance.
 * Every number is a count of permitted Maintenance Visit rows under ONE predicate (domain/visits.ts matchVisit), and each card,
 * bar and legend row opens the Visits Portfolio with exactly that predicate in the URL, then the Visit 360 and its
 * Job / Site / Booking / Technician / Employee records. Back restores the filters (URL state).
 */
import { DateInput } from "@/components/form/DateInput";
import { Open360 } from "@/components/enterprise/Open360";
import type { ReactNode } from "react";
import { useState } from "react";
import type { PluginPageProps } from "@/plugins/pages";
import { SignalCard } from "@/components/digit/Experience";
import { canRead, list } from "../domain/data";
import { OPEN_DEFICIENCY, s } from "../domain/rules";
import { DUE_BUCKETS, OPEN_VISIT_STATES, VISIT_STATES, deadlineOf, dueBucket, matchVisit, technicianStats, visitFacts, visitIndex, type Arrival, type DueBucket, type VisitFacts, type VisitFilter } from "../domain/visits";
import { destinationByKey } from "../screens";
import { QUEUES } from "./queues";
import { WorklistTabs } from "./home";
import { Donut, Ranked } from "./charts";
import { DestinationShell } from "./destination";
import { AppLink, BAND, BTN, DataTable, DocRef, Facts, INPUT, ListRef, Missing, PageHeader, Panel, SignalGrid, StateChip, WorkflowButtons, dateTxt, dtTxt, numTxt, opt, useFx, useUrlState } from "./kit";
import { PageInsights } from "./ov/ded";
import { TeamDayTimeline } from "./dayBoard";
import { WorkRecordFrame, workFacts } from "./workRecord";

type Fx = ReturnType<typeof useFx>;
const ARRIVAL: Record<Arrival, [string, string]> = { on_time: ["On time", "في الموعد"], late: ["Late", "متأخر"], not_arrived: ["Not arrived", "لم يصل"], unrecorded: ["Unrecorded", "غير مسجل"], unscheduled: ["Unscheduled", "غير مجدولة"], cancelled: ["Cancelled", "ملغاة"] };
const ARRIVAL_TONE: Record<Arrival, string> = { on_time: "text-dx-good", late: "text-dx-bad", not_arrived: "text-dx-warn", unrecorded: "text-muted-foreground", unscheduled: "text-muted-foreground", cancelled: "text-muted-foreground" };
const qs = (f: VisitFilter) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(f)) if (v) p.set(k, v); const x = p.toString(); return x ? `visits?${x}` : "visits"; };
const isOpen = (f: VisitFacts) => (OPEN_VISIT_STATES as readonly string[]).includes(s(f.visit["workflow_state"]));
function useFacts() { const ix = visitIndex(); return list(VISIT_DT).map((v) => visitFacts(v, ix)); }

export function ArrivalTag({ f, fx }: { f: VisitFacts; fx: Fx }) {
  const [en, ar] = ARRIVAL[f.arrival];
  return <span className={`text-xs font-medium ${ARRIVAL_TONE[f.arrival]}`} data-arrival={f.arrival}>{fx.t(en, ar)}{f.late_min ? <span data-no-i18n> · {numTxt(f.late_min)} {fx.t("min", "د")}</span> : null}</span>;
}
/** Lead technician: name + Employee ID from the real assignment; "Not assigned" when no booking / lead field exists. */
export function LeadTag({ f, fx }: { f: VisitFacts; fx: Fx }) {
  if (!f.lead) return <span className="text-xs font-medium text-dx-warn" data-lead="none">{fx.t("Not assigned", "غير مسند")}</span>;
  return <span className="min-w-0 text-sm" data-lead={f.lead.technician}>
    <DocRef doctype="FSM Technician" name={f.lead.technician} form><span data-no-i18n>{f.lead.name}</span></DocRef>
    {f.lead.employee ? <> · <DocRef doctype="Employee" name={f.lead.employee} form /></> : <span className="text-xs text-muted-foreground"> · {fx.t("no Employee link", "بلا ربط موظف")}</span>}
    {f.lead.via === "visit_field" && <span className="ms-1 text-[11px] text-muted-foreground" title={fx.t("From the visit's Lead Technician field; no Lead booking exists", "من حقل الفني الرئيسي في الزيارة؛ لا يوجد حجز رئيسي")}>({fx.t("visit field", "حقل الزيارة")})</span>}
  </span>;
}

// ---------------------------------------------------------------- (A) Operations Center
export function OpsCenterPage() {
  const fx = useFx(); const { t, ar } = fx; const dest = destinationByKey("ops-center")!;
  const facts = useFacts();
  const live = facts.filter((f) => s(f.visit["workflow_state"]) !== "Cancelled");
  const open = facts.filter(isOpen); const unsched = facts.filter((f) => s(f.visit["workflow_state"]) === "Unscheduled");
  const active = [...open, ...unsched];
  const overdue = facts.filter((f) => f.overdue).length;
  const unassigned = active.filter((f) => !f.lead).length;
  const openDefs = list("FSM Deficiency").filter((d) => OPEN_DEFICIENCY.has(s(d["workflow_state"])));
  const byState = VISIT_STATES.map((st) => ({ key: st, label: opt(st, ar), value: facts.filter((f) => s(f.visit["workflow_state"]) === st).length, wrap: (n: ReactNode) => <AppLink to={qs({ state: st })} className="block">{n}</AppLink> }));
  const load = new Map<string, { label: string; n: number }>(); for (const f of active) { if (!f.lead) continue; const r = load.get(f.lead.technician) ?? { label: f.lead.name, n: 0 }; r.n++; load.set(f.lead.technician, r); }
  const workload = [...[...load].map(([k, v]) => ({ key: k, label: <span data-no-i18n>{v.label}</span>, value: v.n, wrap: (n: ReactNode) => <AppLink to={qs({ tech: k })} className="block">{n}</AppLink> })),
    { key: "__none", label: t("Not assigned", "غير مسند"), value: unassigned, tone: "warn" as const, wrap: (n: ReactNode) => <AppLink to={qs({ assigned: "0" })} className="block">{n}</AppLink> }];
  const scheduled = live.filter((f) => f.arrival !== "unscheduled");
  const arrivals = (["on_time", "late", "not_arrived", "unrecorded"] as Arrival[]).map((a) => ({ key: a, label: t(...ARRIVAL[a]), value: scheduled.filter((f) => f.arrival === a).length, tone: a === "late" ? "bad" as const : undefined, wrap: (n: ReactNode) => <AppLink to={qs({ arrival: a })} className="block">{n}</AppLink> }));
  const upcoming = open.filter((f) => s(f.visit["scheduled_start"])).sort((a, b) => s(a.visit["scheduled_start"]).localeCompare(s(b.visit["scheduled_start"]))).slice(0, 10);
  const overview = (
    <>
      <PageInsights k="ops-center" blocks={[
        { id: "kpis", title: ["Visit KPIs", "مؤشرات الزيارات"], node: (
      <SignalGrid>
          <Kpi2 label={t("Visits", "الزيارات")} value={live.length} basis={t("Maintenance Visit, not cancelled", "زيارات غير ملغاة")} to="visits" fx={fx} />
          <Kpi2 label={t("Overdue visits", "زيارات متأخرة")} value={overdue} tone={overdue ? "bad" : "good"} basis={t("Planned / dispatched / on site after the scheduled end", "مخططة/مرسلة/في الموقع بعد نهاية الموعد")} to="visits/late" fx={fx} />
          <Kpi2 label={t("Unscheduled", "غير مجدولة")} value={unsched.length} tone={unsched.length ? "warn" : "good"} basis={t("No technician or time yet", "بلا فني أو موعد بعد")} to={qs({ state: "Unscheduled" })} fx={fx} />
          <Kpi2 label={t("Assigned / unassigned", "مسندة / غير مسندة")} value={<span data-no-i18n>{numTxt(active.length - unassigned)} / {numTxt(unassigned)}</span>} tone={unassigned ? "warn" : "good"} basis={t("Open + unscheduled visits with a Lead booking or lead field", "الزيارات المفتوحة وغير المجدولة بحجز رئيسي أو حقل الفني")} to={qs({ assigned: "0" })} cta={t("Open unassigned", "فتح غير المسندة")} fx={fx} />
          <Kpi2 label={t("Open findings", "ملاحظات مفتوحة")} value={openDefs.length} tone={openDefs.some((d) => s(d["severity"]) === "Critical") ? "bad" : openDefs.length ? "warn" : "good"} basis={t("Distinct open FSM Deficiency records (RP05)", "ملاحظات مفتوحة مميزة (RP05)")} to="reports/RP05" cta={t("Open report", "فتح التقرير")} fx={fx} />
        </SignalGrid> ) },
        { id: "next", title: ["Next visits", "الزيارات القادمة"], node: (
      <Panel title={t("Next visits", "الزيارات القادمة")} actions={<AppLink to="visits">{t("Visits portfolio", "محفظة الزيارات")}</AppLink>}>
          <VisitTable rows={upcoming} fx={fx} empty={t("No open scheduled visits.", "لا زيارات مفتوحة مجدولة.")} />
        </Panel> ) },
      ]} />
    </>
  );
  const work = <WorklistTabs defs={dest.queues.map((k) => QUEUES.find((q) => q.key === k)).filter((q): q is NonNullable<typeof q> => !!q)} fx={fx} limit={8} />;
  return <DestinationShell dest={dest} overview={overview} work={work} band={{
    basis: t("Computed from Maintenance Visit, FSM Booking (Lead), FSM Technician → Employee and FSM Deficiency records you may read. Each card, bar and legend row opens the Visits Portfolio with the same filter, then the visit.", "محسوب من الزيارات والحجوزات (الرئيسية) والفنيين ← الموظفين والملاحظات المسموح لك بقراءتها. كل بطاقة وشريط وصف يفتح محفظة الزيارات بنفس الفلتر، ثم الزيارة."),
    meta: [{ label: t("Open", "مفتوحة"), value: <span data-no-i18n>{numTxt(open.length)}</span> }, { label: t("Technicians with work", "فنيون لديهم عمل"), value: <span data-no-i18n>{numTxt(load.size)}</span> }],
    actions: <><AppLink to="dispatch" className={BAND.primary}>{t("Dispatch board", "لوحة الجدولة")}</AppLink><AppLink to="reports/RP09" className={BAND.secondary}>{t("Overdue report (RP09)", "تقرير المتأخر (RP09)")}</AppLink></>,
  }} />;
}
function Kpi2({ label, value, basis, to, tone = "neutral", cta, fx }: { label: string; value: ReactNode; basis: ReactNode; to: string; tone?: "good" | "warn" | "bad" | "neutral"; cta?: string; fx: Fx }) {
  return <SignalCard label={label} value={typeof value === "number" ? numTxt(value) : value} tone={tone} basis={basis} attrs={{ "data-kpi": to }} footer={<>{cta ?? fx.t("Open visits", "فتح الزيارات")} ›</>} link={(b, cls) => <AppLink to={to} className={cls}>{b}</AppLink>} />;
}
function VisitTable({ rows, fx, empty }: { rows: VisitFacts[]; fx: Fx; empty: string }) {
  const { t } = fx;
  return <DataTable id="ops-next" searchable={false} rows={rows.map((f) => ({ name: f.visit.name, f } as { name: string; f: VisitFacts } & Record<string, unknown>))} empty={empty} cols={[
    { key: "name", label: t("Visit", "الزيارة"), render: (r) => <AppLink to={`visit/${encodeURIComponent(r.name)}`}><span data-no-i18n>{r.name}</span></AppLink> },
    { key: "start", label: t("Scheduled", "الموعد"), value: (r) => s(r.f.visit["scheduled_start"]), render: (r) => <span data-no-i18n>{dtTxt(r.f.visit["scheduled_start"])}</span> },
    { key: "site", label: t("Site", "الموقع"), render: (r) => <DocRef doctype="FSM Service Site" name={r.f.visit["site"]} title /> },
    { key: "job", label: t("Job", "أمر العمل"), render: (r) => <DocRef doctype="FSM Job" name={r.f.visit["job"]} /> },
    { key: "lead", label: t("Lead technician", "الفني الرئيسي"), render: (r) => <LeadTag f={r.f} fx={fx} /> },
    { key: "state", label: t("Status", "الحالة"), render: (r) => <StateChip value={r.f.visit["workflow_state"]} /> },
    { key: "arrival", label: t("Arrival", "الوصول"), render: (r) => <ArrivalTag f={r.f} fx={fx} /> },
  ]} />;
}

// ---------------------------------------------------------------- (B) Visits Portfolio
export function VisitsPortfolioPage({ params }: PluginPageProps) {
  const fx = useFx(); const { t, ar } = fx; const [f, set] = useUrlState();
  const lateView = String(params["view"] ?? "") === "late";
  const dest = destinationByKey(lateView ? "late-visits" : "visits")!;
  const [more, setMore] = useState(1);
  const facts = useFacts();
  const q: VisitFilter = { ...f, ...(lateView ? { late: "1" } : {}) };
  const { late: _late, due: _due, ...open } = f as VisitFilter; void _late; void _due;
  const shown = facts.filter((x) => matchVisit(x, q)).sort((a, b) => s(b.visit["scheduled_start"] || b.visit.name).localeCompare(s(a.visit["scheduled_start"] || a.visit.name)));
  const techs = list("FSM Technician"); const sites = list("FSM Service Site");
  const sel = (k: keyof VisitFilter, label: string, opts: [string, string][]) => (
    <label className="grid gap-1 text-xs text-muted-foreground">{label}
      <select className={`${INPUT} w-full min-w-0`} value={f[k] ?? ""} onChange={(e) => set({ [k]: e.target.value || undefined })} data-filter={k}><option value="">{t("All", "الكل")}</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </label>
  );
  const page = shown.slice(0, 60 * more);
  const overview = (
    <>
      <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] items-end gap-3 rounded-[10px] border border-border bg-card p-3" data-visit-filters>
        <label className="grid gap-1 text-xs text-muted-foreground">{t("Search", "بحث")}<input type="search" className={`${INPUT} w-full min-w-0`} value={f["q"] ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} placeholder={t("Visit, job, site, technician, employee", "زيارة، أمر عمل، موقع، فني، موظف")} /></label>
        {sel("state", t("Status", "الحالة"), VISIT_STATES.map((x) => [x, opt(x, ar)]))}
        {sel("tech", t("Technician", "الفني"), techs.map((x) => [x.name, s(x["technician_name"]) || x.name]))}
        {sel("site", t("Site", "الموقع"), sites.map((x) => [x.name, s(x["site_name"]) || x.name]))}
        {sel("arrival", t("Arrival", "الوصول"), (Object.keys(ARRIVAL) as Arrival[]).map((a) => [a, t(...ARRIVAL[a])]))}
        {sel("assigned", t("Assignment", "الإسناد"), [["1", t("Assigned", "مسندة")], ["0", t("Not assigned", "غير مسندة")]])}
        {!lateView && sel("due", t("Deadline", "الموعد"), DUE_BUCKETS.map((k) => [k, t(...DUE_LABEL[k])]))}
        <label className="grid gap-1 text-xs text-muted-foreground">{t("From", "من")}<DateInput className={`${INPUT} w-full min-w-0`} value={f["from"] ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">{t("To", "إلى")}<DateInput className={`${INPUT} w-full min-w-0`} value={f["to"] ?? ""} onChange={(e) => set({ to: e.target.value || undefined })} /></label>
      </div>
      <PageInsights k={lateView ? "late-visits" : "visits"} blocks={[{ id: "cards", title: lateView ? ["Late visits", "الزيارات المتأخرة"] : ["Visit cards", "بطاقات الزيارات"], node: (<>
      {!shown.length && lateView ? <LateClear facts={facts.filter((x) => matchVisit(x, open))} fx={fx} filtered={Object.entries(open).some(([k, v]) => k !== "tab" && !!v)} /> : !shown.length ? <Panel title={t("No visits match", "لا زيارات مطابقة")}><p className="text-sm text-muted-foreground">{t("Change or clear the filters.", "غيّر الفلاتر أو امسحها.")} <AppLink to={lateView ? "visits/late" : "visits"}>{t("Clear filters", "مسح الفلاتر")}</AppLink></p></Panel> : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,21rem),1fr))] gap-3" data-visit-cards>{page.map((x) => <VisitCard key={x.visit.name} f={x} fx={fx} />)}</div>
      )}
      {shown.length > page.length && <div className="mt-3 text-center"><button type="button" className={BTN.secondary} onClick={() => setMore(more + 1)}>{t("Show more", "عرض المزيد")} <span data-no-i18n>({numTxt(shown.length - page.length)})</span></button></div>}
      </>) }]} />
    </>
  );
  return <DestinationShell dest={dest} overview={overview} band={{
    basis: t("One card per Maintenance Visit you may read. Lead technician = Lead booking → FSM Technician → Employee (else the visit's Lead Technician field, else Not assigned). Results and findings come from inspection runs recorded at the visit.", "بطاقة لكل زيارة مسموح بقراءتها. الفني الرئيسي = الحجز الرئيسي ← الفني ← الموظف (وإلا حقل الفني الرئيسي في الزيارة، وإلا غير مسند). النتائج والملاحظات من جولات الفحص المسجلة في الزيارة."),
    meta: [{ label: t("Shown", "المعروض"), value: <span data-no-i18n>{numTxt(shown.length)} / {numTxt(facts.length)}</span> }, { label: t("Overdue", "متأخرة"), value: <span data-no-i18n>{numTxt(shown.filter((x) => x.overdue).length)}</span> }, { label: t("Not assigned", "غير مسندة"), value: <span data-no-i18n>{numTxt(shown.filter((x) => !x.lead && isOpen(x)).length)}</span> }],
    actions: <><AppLink to="ops-center" className={BAND.secondary}>{t("Operations Center", "مركز العمليات")}</AppLink><AppLink to="dispatch" className={BAND.secondary}>{t("Dispatch board", "لوحة الجدولة")}</AppLink></>,
  }} />;
}

const DUE_LABEL: Record<DueBucket, [string, string]> = { overdue: ["Past deadline", "تجاوز الموعد"], today: ["Due today", "مستحق اليوم"], week: ["Next 7 days", "خلال 7 أيام"], later: ["Later", "لاحقاً"], none: ["No date yet", "بلا موعد بعد"] };
/**
 * Late view with no late visit: says so plainly (with the filters in force) and lists the next real deadlines — the open
 * visits whose scheduled end (else start) comes soonest — so the dispatcher sees what could become late next.
 */
function LateClear({ facts, fx, filtered }: { facts: VisitFacts[]; fx: Fx; filtered: boolean }) {
  const { t } = fx;
  const next = facts.filter((x) => { const b = dueBucket(x.visit); return b && b !== "overdue" && b !== "none"; }).sort((a, b) => deadlineOf(a.visit).localeCompare(deadlineOf(b.visit))).slice(0, 8);
  const undated = facts.filter((x) => dueBucket(x.visit) === "none").length;
  return <>
    <div className="mb-4 rounded-[10px] border border-dx-good/40 bg-dx-good-soft px-4 py-3 text-sm text-dx-good" role="status" data-late-clear>
      <strong className="block">{t("No visit is past its deadline", "لا توجد زيارة تجاوزت موعدها")}</strong>
      {filtered ? t("For the filters in force. Clear them to check every visit.", "للفلاتر المطبقة. امسحها لفحص كل الزيارات.") : t("Every planned, dispatched or on-site visit is still inside its scheduled window.", "كل زيارة مخططة أو مرسلة أو في الموقع ما زالت ضمن نافذتها المجدولة.")}
      {undated > 0 && <span className="mt-1 block text-[12px]"><AppLink to={`visits?due=none`}>{t("Visits with no scheduled time yet", "زيارات بلا موعد بعد")} <span data-no-i18n>({numTxt(undated)})</span></AppLink> — {t("they cannot be late until they are scheduled.", "لا يمكن أن تتأخر قبل جدولتها.")}</span>}
    </div>
    <Panel title={t("Next deadlines", "المواعيد القادمة")} subtitle={t("Open visits whose scheduled end (else start) comes soonest", "الزيارات المفتوحة الأقرب نهاية موعد (وإلا بدايته)")} actions={<AppLink to="visits?due=today">{t("Due today", "مستحق اليوم")}</AppLink>} attrs={{ "data-next-deadlines": "" }}>
      <VisitTable rows={next} fx={fx} empty={t("No upcoming visit with a scheduled time.", "لا زيارات قادمة بموعد مجدول.")} />
    </Panel>
  </>;
}

function VisitCard({ f, fx }: { f: VisitFacts; fx: Fx }) {
  const { t, ar } = fx; const v = f.visit;
  const assistants = f.team.filter((p) => p.technician !== f.lead?.technician);
  return (
    <article className="flex min-w-0 flex-col rounded-[10px] border border-border bg-card p-4 shadow-sm" data-visit-card={v.name}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0"><AppLink to={`visit/${encodeURIComponent(v.name)}`} className="font-semibold text-primary hover:underline"><span data-no-i18n>{v.name}</span></AppLink>
          <div className="text-xs text-muted-foreground">{t("Purpose", "الغرض")}: {opt(v["visit_purpose"], ar) || "—"}{f.overdue && <span className="ms-2 font-semibold text-dx-bad">{t("Overdue", "متأخرة")}</span>}</div></div>
        <StateChip value={v["workflow_state"]} />
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-xs text-muted-foreground">{t("Site", "الموقع")}</dt><dd className="min-w-0 truncate"><DocRef doctype="FSM Service Site" name={v["site"]} title /></dd>
        <dt className="text-xs text-muted-foreground">{t("Job", "أمر العمل")}</dt><dd className="min-w-0 truncate"><DocRef doctype="FSM Job" name={v["job"]} /></dd>
        <dt className="text-xs text-muted-foreground">{t("Window", "النافذة")}</dt><dd data-no-i18n>{s(v["scheduled_start"]) ? <>{dtTxt(v["scheduled_start"])}{s(v["scheduled_end"]) && <> – {s(v["scheduled_end"]).slice(11, 16)}</>}</> : "—"}</dd>
        <dt className="text-xs text-muted-foreground">{t("Lead", "الرئيسي")}</dt><dd className="min-w-0"><LeadTag f={f} fx={fx} /></dd>
        <dt className="text-xs text-muted-foreground">{t("Team", "الفريق")}</dt><dd className="min-w-0 truncate text-xs">{assistants.length ? <span data-no-i18n>{assistants.map((p) => p.name).join(" · ")}</span> : "—"}</dd>
        <dt className="text-xs text-muted-foreground">{t("Arrival", "الوصول")}</dt><dd><ArrivalTag f={f} fx={fx} /></dd>
        <dt className="text-xs text-muted-foreground">{t("Inspection", "الفحص")}</dt><dd className="text-xs" data-no-i18n>{f.runs.length ? <>{numTxt(f.runs.length)} · <span className="text-dx-good">{t("Pass", "ناجح")} {numTxt(f.results.pass)}</span> · <span className="text-dx-bad">{t("Fail", "راسب")} {numTxt(f.results.fail)}</span>{f.results.other ? <> · {t("Pending", "معلق")} {numTxt(f.results.other)}</> : null}</> : t("No run at this visit", "لا جولة في هذه الزيارة")}</dd>
        <dt className="text-xs text-muted-foreground">{t("Findings", "الملاحظات")}</dt><dd className="text-xs" data-no-i18n>{f.findings.length ? <span className={f.open_findings ? "font-semibold text-dx-bad" : ""}>{numTxt(f.open_findings)} {t("open", "مفتوحة")} / {numTxt(f.findings.length)}</span> : "—"}</dd>
      </dl>
      <div className="mt-auto pt-3 text-end text-xs"><AppLink to={`visit/${encodeURIComponent(v.name)}`}>{t("Open visit 360", "فتح الزيارة 360")} ›</AppLink></div>
    </article>
  );
}

// ---------------------------------------------------------------- Visit 360
export function Visit360Page({ params }: PluginPageProps) {
  const fx = useFx(); const { t, ar } = fx;
  const id = decodeURIComponent(String(params["id"] ?? ""));
  const v = list(VISIT_DT).find((x) => x.name === id);
  if (!v) return <Missing doctype={VISIT_DT} name={id} />;
  const f = visitFacts(v, visitIndex());
  const bookings = list("FSM Booking").filter((b) => s(b["visit"]) === id);
  const job = s(v["job"]);
  const returns = list(VISIT_DT).filter((x) => s(x["predecessor_visit"]) === id);
  const native = (dt: string) => (canRead(dt) ? list(dt).filter((d) => s(d["digit_fsm_job"]) === job).length : null);
  const empOk = canRead("Employee");
  return (
    <div className="w-full min-w-0" data-page="fsm-visit360" data-record={id}>
      <PageHeader title={`${t("Visit", "الزيارة")} ${id}`} crumbs={[{ label: t("Visits portfolio", "محفظة الزيارات"), to: "visits" }, ...(job ? [{ label: job, to: `job/${encodeURIComponent(job)}` }] : [])]} band={{
        question: t("Who attended, when, and what did the visit find?", "من حضر، ومتى، وماذا وجدت الزيارة؟"),
        basis: t("Assignment from FSM Booking (Lead / Assistant) → FSM Technician → Employee; timings from the visit; inspection runs, findings and job-level native documents linked by their own fields.", "الإسناد من الحجوزات (رئيسي/مساعد) ← الفني ← الموظف؛ الأوقات من الزيارة؛ جولات الفحص والملاحظات والمستندات الأصلية على مستوى أمر العمل مرتبطة بحقولها."),
        meta: [{ label: t("Status", "الحالة"), value: opt(v["workflow_state"], ar) }, { label: t("Site", "الموقع"), value: <DocRef doctype="FSM Service Site" name={v["site"]} title className="text-dx-on-band underline" /> }, { label: t("Scheduled", "الموعد"), value: <span data-no-i18n>{dtTxt(v["scheduled_start"])}</span> }, { label: t("Arrival", "الوصول"), value: t(...ARRIVAL[f.arrival]) }],
        actions: <><WorkflowButtons doctype={VISIT_DT} doc={v} /><DocRef doctype={VISIT_DT} name={id} form className={BAND.secondary}>{t("Edit", "تعديل")}</DocRef></>,
      }} />
      <WorkRecordFrame dt={VISIT_DT} doc={v} w={workFacts(job ? list("FSM Job").find((x) => x.name === job) : undefined, v)} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
        <Panel title={t("Visit", "الزيارة")}>
          <Facts items={[[t("Job", "أمر العمل"), <DocRef doctype="FSM Job" name={job} />], [t("Site", "الموقع"), <DocRef doctype="FSM Service Site" name={v["site"]} title />], [t("Purpose", "الغرض"), opt(v["visit_purpose"], ar) || "—"],
            [t("Lead technician", "الفني الرئيسي"), <LeadTag f={f} fx={fx} />], [t("Access outcome", "نتيجة الوصول"), opt(v["access_outcome"], ar) || "—"], [t("Block reason", "سبب التعطّل"), opt(v["block_reason"], ar) || "—"],
            [t("Previous visit", "الزيارة السابقة"), s(v["predecessor_visit"]) ? <AppLink to={`visit/${encodeURIComponent(s(v["predecessor_visit"]))}`}><span data-no-i18n>{s(v["predecessor_visit"])}</span></AppLink> : "—"], [t("Return visits", "زيارات العودة"), returns.length ? <span data-no-i18n>{returns.map((x, i) => <span key={x.name}>{i ? " · " : ""}<AppLink to={`visit/${encodeURIComponent(x.name)}`}>{x.name}</AppLink></span>)}</span> : "—"]]} />
        </Panel>
        <Panel title={t("Timing", "التوقيت")} subtitle={t("Planned window vs recorded timestamps; a missing timestamp is Unrecorded", "النافذة المخططة مقابل الأوقات المسجلة؛ الوقت المفقود «غير مسجل»")}>
          <Facts items={[[t("Scheduled start", "بداية الموعد"), <span data-no-i18n>{dtTxt(v["scheduled_start"])}</span>], [t("Scheduled end", "نهاية الموعد"), <span data-no-i18n>{dtTxt(v["scheduled_end"])}</span>], [t("Acknowledged", "الإقرار"), <span data-no-i18n>{dtTxt(v["acknowledged_on"])}</span>],
            [t("Arrived", "الوصول"), <span data-no-i18n>{dtTxt(v["arrived_on"])}</span>], [t("Completed", "الإكمال"), <span data-no-i18n>{dtTxt(v["completed_on"])}</span>], [t("Arrival status", "حالة الوصول"), <ArrivalTag f={f} fx={fx} />]]} />
        </Panel>
      </div>
      <Panel title={t("Assignment (resource bookings)", "الإسناد (حجوزات الموارد)")} actions={<ListRef doctype="FSM Booking" filters={[["FSM Booking", "visit", id]]}>{t("Open in register", "فتح في السجل")}</ListRef>}>
        <DataTable id="visit-bookings" searchable={false} rows={bookings} empty={t("No booking — the visit is not assigned.", "لا حجز — الزيارة غير مسندة.")} cols={[
          { key: "name", label: t("Booking", "الحجز"), render: (r) => <DocRef doctype="FSM Booking" name={r.name} form /> },
          { key: "technician", label: t("Technician", "الفني"), render: (r) => <DocRef doctype="FSM Technician" name={r["technician"]} title form /> },
          { key: "employee", label: t("Employee", "الموظف"), render: (r) => { const tech = list("FSM Technician").find((x) => x.name === s(r["technician"])); return tech ? <DocRef doctype="Employee" name={tech["employee"]} form /> : <span className="text-muted-foreground">—</span>; } },
          ...(empOk ? [{ key: "employee_name", label: t("Employee name", "اسم الموظف"), render: (r: Record<string, unknown>) => { const p = f.team.find((x) => x.technician === s(r["technician"])); return <span data-no-i18n>{p?.employee_name || "—"}</span>; } }] : []),
          { key: "booking_role", label: t("Role", "الدور"), render: (r) => <span>{opt(r["booking_role"], ar) || "—"}</span> },
          { key: "booking_start", label: t("Start", "البداية"), render: (r) => <span data-no-i18n>{dtTxt(r["booking_start"])}</span> },
          { key: "booking_end", label: t("End", "النهاية"), render: (r) => <span data-no-i18n>{dtTxt(r["booking_end"])}</span> },
          { key: "status", label: t("Status", "الحالة"), render: (r) => <StateChip value={r["status"]} /> },
        ]} />
      </Panel>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
        <Panel title={t("Inspection at this visit", "الفحص في هذه الزيارة")}>
          <DataTable id="visit-runs" searchable={false} rows={f.runs} empty={t("No inspection run was recorded at this visit.", "لم تُسجل جولة فحص في هذه الزيارة.")} cols={[
            { key: "name", label: t("Run", "الجولة"), render: (r) => <DocRef doctype="FSM Inspection Run" name={r.name} /> },
            { key: "system", label: t("System", "النظام"), render: (r) => <DocRef doctype="FSM Service System" name={r["system"]} title form /> },
            { key: "workflow_state", label: t("Status", "الحالة"), render: (r) => <StateChip value={r["workflow_state"]} /> },
            { key: "technical_result", label: t("Result", "النتيجة"), render: (r) => <StateChip value={r["technical_result"]} /> },
          ]} />
        </Panel>
        <Panel title={t("Findings raised", "الملاحظات المنشأة")}>
          <DataTable id="visit-defs" searchable={false} rows={f.findings} empty={t("No finding came from this visit.", "لم تنشأ ملاحظة من هذه الزيارة.")} cols={[
            { key: "name", label: t("Finding", "الملاحظة"), render: (r) => <DocRef doctype="FSM Deficiency" name={r.name} /> },
            { key: "severity", label: t("Severity", "الخطورة"), render: (r) => <span>{opt(r["severity"], ar)}</span> },
            { key: "workflow_state", label: t("Stage", "المرحلة"), render: (r) => <StateChip value={r["workflow_state"]} /> },
            { key: "device", label: t("Device", "الجهاز"), render: (r) => <DocRef doctype="FSM Device" name={r["device"]} title /> },
          ]} />
        </Panel>
      </div>
      <Panel title={t("Native documents of the job", "المستندات الأصلية لأمر العمل")} subtitle={t("Linked by the custom field digit_fsm_job (job level). Native documents carry no visit field, so a per-visit split is NOT_WIRED.", "مرتبطة بالحقل المخصص digit_fsm_job (على مستوى أمر العمل). لا تحمل المستندات الأصلية حقل زيارة، لذا التقسيم لكل زيارة غير موصول.")}>
        <div className="flex flex-wrap gap-2" data-job-native>{(["Timesheet", "Material Request", "Stock Entry"] as const).map((dt) => { const n = native(dt); return (
          <span key={dt} className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm">
            {n === null ? <>{dt} · {t("Restricted", "مقيّد")}</> : job ? <ListRef doctype={dt} filters={[[dt, "digit_fsm_job", job]]}><span data-no-i18n>{dt}</span> · <span data-no-i18n>{numTxt(n)}</span></ListRef> : <span data-no-i18n>{dt} · —</span>}
          </span>
        ); })}</div>
      </Panel>
      <p className="text-xs text-muted-foreground"><AppLink to="visits">{t("All visits", "كل الزيارات")}</AppLink>{job && <> · <AppLink to={`visits?job=${encodeURIComponent(job)}`}>{t("Visits of this job", "زيارات أمر العمل")}</AppLink></>} · <span data-no-i18n>{dateTxt(v["scheduled_start"])}</span></p>
    </div>
  );
}

// ---------------------------------------------------------------- Team & technicians performance
export function TechniciansPage() {
  const fx = useFx(); const { t } = fx; const dest = destinationByKey("team")!;
  const stats = technicianStats(useFacts());
  const techs = list("FSM Technician");
  const rows = techs.map((tc) => { const r = stats.find((x) => x.p.technician === tc.name); return { name: tc.name, tc, r } as { name: string; tc: typeof tc; r: (typeof stats)[number] | undefined } & Record<string, unknown>; });
  const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${numTxt(x * 100, 0)}%`);
  const overview = (
    <>
      <PageInsights k="team" blocks={[{ id: "timeline", title: ["Day timeline per technician", "الجدول الزمني لكل فني"], node: (
      <Panel title={t("Day timeline per technician — planned vs actual", "الجدول الزمني لكل فني — المخطط مقابل الفعلي")} subtitle={t("Check-in → check-out under each booking; late / early marked against the planned start.", "الوصول ← المغادرة تحت كل حجز؛ التأخر أو التبكير مقابل بداية الموعد.")} flush={false}><TeamDayTimeline /></Panel>
      ) }, { id: "performance", title: ["Technician performance", "أداء الفنيين"], node: (
      <Panel title={t("Technician performance", "أداء الفنيين")} subtitle={t("On-time rate = on time ÷ (on time + late); — when no arrival was recorded (no division by zero)", "نسبة الالتزام = في الموعد ÷ (في الموعد + متأخر)؛ «—» عند عدم تسجيل وصول")}>
        <DataTable id="tech-perf" rows={rows} empty={t("No technicians.", "لا فنيين.")} cols={[
          { key: "name", label: t("Technician", "الفني"), value: (r) => s(r.tc["technician_name"]), render: (r) => <span className="inline-flex items-center gap-1.5"><DocRef doctype="FSM Technician" name={r.name} title form /><Open360 doctype="FSM Technician" name={r.name} compact /></span> },
          { key: "employee", label: t("Employee", "الموظف"), value: (r) => s(r.tc["employee"]), render: (r) => <DocRef doctype="Employee" name={r.tc["employee"]} form /> },
          { key: "crew", label: t("Crew", "الطاقم"), value: (r) => s(r.tc["crew"]) },
          { key: "led", label: t("Led", "مقادة"), numeric: true, value: (r) => r.r?.led ?? 0, render: (r) => <AppLink to={qs({ tech: r.name })}><span data-no-i18n>{numTxt(r.r?.led ?? 0)}</span></AppLink> },
          { key: "open", label: t("Open", "مفتوحة"), numeric: true, value: (r) => r.r?.open ?? 0 },
          { key: "completed", label: t("Completed", "مكتملة"), numeric: true, value: (r) => r.r?.completed ?? 0, render: (r) => <AppLink to={qs({ tech: r.name, state: "Completed" })}><span data-no-i18n>{numTxt(r.r?.completed ?? 0)}</span></AppLink> },
          { key: "late", label: t("Late", "متأخر"), numeric: true, value: (r) => r.r?.late ?? 0, render: (r) => <AppLink to={qs({ tech: r.name, arrival: "late" })}><span data-no-i18n>{numTxt(r.r?.late ?? 0)}</span></AppLink> },
          { key: "unrecorded", label: t("Unrecorded", "غير مسجل"), numeric: true, value: (r) => r.r?.unrecorded ?? 0 },
          { key: "rate", label: t("On-time rate", "نسبة الالتزام"), numeric: true, value: (r) => r.r?.on_time_rate ?? -1, render: (r) => <span data-no-i18n>{pct(r.r?.on_time_rate)}</span> },
        ]} />
      </Panel>
      ) }]} />
    </>
  );
  return <DestinationShell dest={dest} overview={overview} band={{
    basis: t("Measured from Maintenance Visit timestamps and Lead bookings only; RP10 Technician productivity holds the hours view.", "مقيس من أوقات الزيارات والحجوزات الرئيسية فقط؛ تقرير RP10 إنتاجية الفنيين يعرض الساعات."),
    meta: [{ label: t("Technicians", "الفنيون"), value: <span data-no-i18n>{numTxt(techs.length)}</span> }],
    actions: <AppLink to="reports/RP10" className={BAND.secondary}>{t("Technician productivity (RP10)", "إنتاجية الفنيين (RP10)")}</AppLink>,
  }} />;
}
