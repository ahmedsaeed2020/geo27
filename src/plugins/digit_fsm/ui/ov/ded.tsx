import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * Insight panels for the dedicated destination pages (Home, Operations control, Management, Exceptions, Site explorer,
 * Sites, Service manager centre, Visits / Late visits, Dispatch, Team, All reports, Trade packs, Policies). Same Insight
 * contract as the generic workspaces: permitted records or RP rows in, every mark opens exactly the records it counts.
 * Visit charts use the visit facts resolver (Lead booking → technician → Employee; missing arrival = Unrecorded, never late).
 */
import type { Filters } from "../../domain/data";
import { list, rows, titleOf } from "../../domain/data";
import { AGING_BUCKETS, OPEN_DEFICIENCY, addDays, s, today } from "../../domain/rules";
import { DUE_BUCKETS, OPEN_VISIT_STATES, VISIT_STATES, dueBucket, matchVisit, technicianStats, visitFacts, visitIndex, type Arrival, type DueBucket, type VisitFacts, type VisitFilter } from "../../domain/visits";
import { canReadType } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { FSM_REPORTS } from "../../domain/reports";
import { FSM_KPIS } from "../../analytics/kpis";
import { REPORT_AREAS } from "../../screens";
import { SKILLS, SYSTEM_TYPES } from "../../schema";
import { QUEUES, myTechnician } from "../queues";
import { money, numTxt, opt, useFx, useUrlState } from "../kit";
import { Bars, Cols, Insight, InsightGrid, Ring, ScopeBar, Stack, SEV_TONE, countBy, inF, monthAxis, monthEnd, monthLabel, perMonth, pts, rp, scopeOf, sumBy, titleL, type Pt } from "../insights";
import { LS, M, R, num, sum, type Ctx } from "./ctx";
import type { ReactNode } from "react";
import { tLabel } from "@/i18n";
import { DashboardDesigner } from "@/components/dashboards/DashboardDesigner";
import type { DashboardDef } from "@/lib/dashboards/registry";

type Spec = { charts: ReactNode; scope?: ("company" | "site" | "from" | "to")[] | false };
type PFn = (c: Ctx) => Spec;
const site = (k: string) => titleL((k) => titleOf("FSM Service Site", k))(k);
const SEV = ["Critical", "Major", "Minor"];
const ARR: Record<Arrival, [string, string]> = { on_time: ["On time", "في الموعد"], late: ["Late", "متأخر"], not_arrived: ["Not arrived", "لم يصل"], unrecorded: ["Unrecorded", "غير مسجل"], unscheduled: ["Unscheduled", "غير مجدولة"], cancelled: ["Cancelled", "ملغاة"] };
const vq = (o: Record<string, string | undefined>) => { const p = new URLSearchParams(Object.entries(o).filter(([, v]) => !!v) as [string, string][]).toString(); return p ? `visits?${p}` : "visits"; };
const ageDays = (d: unknown) => { const x = s(d).slice(0, 10); return x ? Math.max(0, Math.round((Date.parse(today()) - Date.parse(x)) / 864e5)) : 0; };
const ageOf = (d: unknown) => { const n = ageDays(d); return n <= 7 ? "0–7" : n <= 30 ? "8–30" : n <= 90 ? "31–90" : ">90"; };
const ageWin = (k: string): [string, string] => { const now = today(); const w: Record<string, [number, number]> = { "0–7": [7, 0], "8–30": [30, 8], "31–90": [90, 31], ">90": [36500, 91] }; const [a, b] = w[k] ?? [0, 0]; return [`${addDays(now, -a)} 00:00:00`, `${addDays(now, -b)} 23:59:59`]; };
const facts = (): VisitFacts[] => { const ix = visitIndex(); return list(VISIT_DT).map((v) => visitFacts(v, ix)); };
const qCount = (k: string) => QUEUES.find((x) => x.key === k)?.rows({}).length ?? 0;
const qPath = (k: string) => { const q = QUEUES.find((x) => x.key === k); return q?.my ? `my/${k.replace(/^my-/, "")}` : `queue/${k}`; };
const qLabel = (k: string, ar: boolean) => { const q = QUEUES.find((x) => x.key === k); return q ? (ar ? q.title_ar : q.title) : k; };
const VM = (grain: [string, string], formula: [string, string], drill: [string, string]) => M([VISIT_DT, "FSM Booking", "FSM Technician", "Employee"], grain, formula, drill, ["A visit without an arrival time is Unrecorded — never counted as late or on time", "الزيارة بلا وقت وصول «غير مسجلة» — لا تُعد متأخرة ولا في الموعد"]);

// ---------------------------------------------------------------- shared visit charts
function visitCharts(c: Ctx, fs: VisitFacts[], base: Record<string, string | undefined>, prefix: string): ReactNode {
  const { t, ar } = c;
  const live = fs.filter((f) => s(f.visit["workflow_state"]) !== "Cancelled");
  const sched = live.filter((f) => f.arrival !== "unscheduled");
  const active = live.filter((f) => s(f.visit["workflow_state"]) !== "Completed");
  const load = new Map<string, { label: string; n: number }>(); for (const f of active) { if (!f.lead) continue; const r = load.get(f.lead.technician) ?? { label: f.lead.name, n: 0 }; r.n++; load.set(f.lead.technician, r); }
  const unassigned = active.filter((f) => !f.lead).length;
  return <>
    <Insight id={`${prefix}-state`} title={["Visits by status", "الزيارات حسب الحالة"]} q={["Where is every visit in its lifecycle?", "أين كل زيارة في دورة حياتها؟"]}
      meta={VM(["One Maintenance Visit you may read", "زيارة واحدة مسموح بقراءتها"], ["Count by workflow_state", "العدد حسب الحالة"], ["Visits portfolio filtered to the status", "محفظة الزيارات مفلترة بالحالة"])}>
      <Ring items={VISIT_STATES.map((st) => ({ key: st, label: opt(st, ar), value: fs.filter((f) => s(f.visit["workflow_state"]) === st).length, tone: st === "Unscheduled" ? "warn" as const : st === "Completed" ? "good" as const : undefined, to: vq({ ...base, state: st }) }))} total={t("visits", "زيارة")} empty={t("No visits match.", "لا زيارات مطابقة.")} />
    </Insight>
    <Insight id={`${prefix}-arrival`} title={["Arrival punctuality", "الالتزام بموعد الوصول"]} q={["Do technicians arrive on time?", "هل يصل الفنيون في الموعد؟"]}
      meta={VM(["One scheduled, non-cancelled visit", "زيارة مجدولة غير ملغاة"], ["arrived_on vs scheduled_start: on time, late, not arrived (start passed, no arrival), unrecorded", "وقت الوصول مقابل بداية الموعد: في الموعد، متأخر، لم يصل، غير مسجل"], ["Visits portfolio filtered to the arrival class", "محفظة الزيارات مفلترة بفئة الوصول"])}>
      <Ring items={(["on_time", "late", "not_arrived", "unrecorded"] as Arrival[]).map((a) => ({ key: a, label: t(...ARR[a]), value: sched.filter((f) => f.arrival === a).length, tone: a === "late" ? "bad" as const : a === "on_time" ? "good" as const : a === "not_arrived" ? "warn" as const : "neutral" as const, to: vq({ ...base, arrival: a }) }))} total={t("scheduled", "مجدولة")} empty={t("No scheduled visits.", "لا زيارات مجدولة.")} />
    </Insight>
    <Insight id={`${prefix}-load`} title={["Open workload by lead technician", "العبء المفتوح حسب الفني الرئيسي"]} q={["Who carries the open visits, and how many have no lead?", "من يحمل الزيارات المفتوحة، وكم منها بلا فني رئيسي؟"]}
      meta={VM(["One open or unscheduled visit; lead from the Lead booking, else the visit's lead field", "زيارة مفتوحة أو غير مجدولة؛ الرئيسي من الحجز الرئيسي وإلا حقل الزيارة"], ["One count per visit per lead technician; visits without a lead counted as Not assigned", "عدّ واحد لكل زيارة لكل فني رئيسي؛ بلا رئيسي = غير مسندة"], ["Visits portfolio filtered to the technician / unassigned", "محفظة الزيارات مفلترة بالفني / غير المسندة"])}>
      <Bars items={[...[...load].sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([k, v]): Pt => ({ key: k, label: <span data-no-i18n>{v.label}</span>, value: v.n, to: vq({ ...base, tech: k }) })), { key: "__none", label: t("Not assigned", "غير مسند"), value: unassigned, tone: "warn" as const, to: vq({ ...base, assigned: "0" }) }]} empty={t("No open visits.", "لا زيارات مفتوحة.")} />
    </Insight>
    <Insight id={`${prefix}-site`} title={["Visits and overdue by site", "الزيارات والمتأخرة حسب الموقع"]} q={["Which sites have overdue visits?", "أي المواقع لديها زيارات متأخرة؟"]}
      meta={VM(["One non-cancelled visit; site × overdue", "زيارة غير ملغاة؛ الموقع × التأخر"], ["Overdue = planned / dispatched / on site after the scheduled end", "المتأخرة = مخططة/مرسلة/في الموقع بعد نهاية الموعد"], ["Visits portfolio filtered to the site (and late)", "محفظة الزيارات مفلترة بالموقع (والمتأخرة)"])}>
      <Stack legend={[{ key: "ok", label: t("On track / done", "ضمن المسار/منجزة"), tone: "good" }, { key: "over", label: t("Overdue", "متأخرة"), tone: "bad" }]} rows={[...new Set(live.map((f) => s(f.visit["site"])))].map((k) => ({ key: k, label: site(k), to: vq({ ...base, site: k }), segs: [{ key: "ok", value: live.filter((f) => s(f.visit["site"]) === k && !f.overdue).length, to: vq({ ...base, site: k }) }, { key: "over", value: live.filter((f) => s(f.visit["site"]) === k && f.overdue).length, to: vq({ ...base, site: k, late: "1" }) }] }))} empty={t("No visits match.", "لا زيارات مطابقة.")} />
    </Insight>
    <Insight id={`${prefix}-purpose`} title={["Visits by purpose", "الزيارات حسب الغرض"]} q={["How much of the field work is planned, return or emergency?", "كم من العمل الميداني مخطط أو عودة أو طارئ؟"]}
      meta={VM(["One non-cancelled visit", "زيارة غير ملغاة"], ["Count by visit_purpose", "العدد حسب غرض الزيارة"], ["Visit register filtered to the purpose (and site)", "سجل الزيارات مفلتراً بالغرض (والموقع)"])}>
      <Ring items={pts(countBy(live.map((f) => f.visit), "visit_purpose"), { label: (k) => opt(k, ar), order: ["Planned", "Return Visit", "Emergency"], tone: (k) => (k === "Emergency" ? "bad" : k === "Return Visit" ? "warn" : "info"), drill: (k) => LS(VISIT_DT, ["visit_purpose", k], ["workflow_state", ["!=", "Cancelled"]], ...(base["site"] ? [["site", base["site"]] as [string, unknown]] : [])) })} total={t("visits", "زيارة")} empty={t("No visit in scope.", "لا زيارات ضمن النطاق.")} />
    </Insight>
    <Insight id={`${prefix}-access`} title={["Site access on arrival", "الوصول إلى الموقع عند الحضور"]} q={["When technicians arrive, can they reach the systems?", "عند حضور الفنيين، هل يصلون إلى الأنظمة؟"]}
      meta={VM(["One visit with a recorded arrival", "زيارة بوصول مسجل"], ["Count by access_outcome", "العدد حسب نتيجة الوصول"], ["Visit register filtered to the access outcome", "سجل الزيارات مفلتراً بنتيجة الوصول"])}>
      <Bars items={pts(countBy(live.filter((f) => s(f.visit["arrived_on"])).map((f) => f.visit), (v) => s(v["access_outcome"]) || "Not Recorded"), { label: (k) => opt(k, ar), order: ["Accessed", "Partial Access", "No Access", "Not Recorded"], tone: (k) => (k === "Accessed" ? "good" : k === "No Access" ? "bad" : k === "Partial Access" ? "warn" : "neutral"), drill: (k) => LS(VISIT_DT, ["access_outcome", k], ["arrived_on", ["is", "set"]], ...(base["site"] ? [["site", base["site"]] as [string, unknown]] : [])) })} empty={t("No arrival is recorded yet.", "لا وصول مسجل بعد.")} />
    </Insight>
  </>;
}

// ---------------------------------------------------------------- pages
const DUE: Record<DueBucket, [string, string]> = { overdue: ["Past deadline", "تجاوز الموعد"], today: ["Due today", "مستحق اليوم"], week: ["Next 7 days", "خلال 7 أيام"], later: ["Later", "لاحقاً"], none: ["No date yet", "بلا موعد بعد"] };
const DUE_TONE = (k: string): Pt["tone"] => (k === "overdue" ? "bad" : k === "today" ? "warn" : k === "week" ? "info" : "neutral");
const CLOSED_JOB = ["Completed", "Closed", "Cancelled"];
/** Due bucket of a dated record (obligation / retest due_date) against today; undefined date → none. */
const dueOfDate = (d: unknown, now: string, wk: string): DueBucket => { const x = s(d).slice(0, 10); return !x ? "none" : x < now ? "overdue" : x === now ? "today" : x <= wk ? "week" : "later"; };
const dateClause = (k: DueBucket, field: string, now: string, wk: string): [string, unknown] =>
  k === "overdue" ? [field, ["<", now]] : k === "today" ? [field, now] : k === "week" ? [field, ["between", [addDays(now, 1), wk]]] : k === "later" ? [field, [">", wk]] : [field, ["is", "not set"]];

const my: PFn = (c) => {
  const { t, ar } = c; const now = today(); const wk = addDays(now, 7);
  const me = myTechnician(); const user = currentUser();
  const keys = ["critical", "overdue", "review", "unscheduled", "blocked", "impairments", "retests", "invoice-ready"];
  const todays = list(VISIT_DT).filter((v) => s(v["scheduled_start"]).slice(0, 10) === now);
  // assignments: the my-* queues (lead technician of the session user; a user not linked to a technician sees every technician's work) + open ToDo tasks on FSM records
  const todos = canReadType("ToDo") ? list("ToDo").filter((d) => s(d["allocated_to"]) === user && (s(d["status"]) || "Open") === "Open" && s(d["reference_type"]).startsWith("FSM ")) : null;
  const assign: Pt[] = [...["my-visits", "my-inspections", "my-repairs"].map((k): Pt => ({ key: k, label: qLabel(k, ar), value: qCount(k), tone: "info", to: qPath(k) })),
    ...(todos ? [{ key: "todo", label: t("Tasks assigned to me", "مهام مسندة إلي"), value: todos.length, tone: "warn" as const, ...LS("ToDo", ["allocated_to", user], ["status", "Open"], ["reference_type", ["like", "FSM %"]]) }] : [])];
  // due work: open visits by deadline (domain/visits dueBucket), open obligations and retests by due date
  const vis = list(VISIT_DT); const obl = list("FSM Obligation").filter((o) => ["Due", "Scheduled"].includes(s(o["status"]))); const rts = list("FSM Retest").filter((r) => ["Required", "Scheduled"].includes(s(r["status"])));
  const oblF: [string, unknown] = ["status", ["in", ["Due", "Scheduled"]]]; const rtF: [string, unknown] = ["status", ["in", ["Required", "Scheduled"]]];
  // priority: open service jobs by priority × stage
  const jobs = list("FSM Job").filter((j) => !CLOSED_JOB.includes(s(j["workflow_state"])));
  const JOB_ST = ["Draft", "Scheduled", "In Progress", "On Hold"];
  // completion: done vs still open for each kind of field work (all records you may read)
  const done = (dt: string, field: string, doneSt: string[], openSt: string[]) => { const xs = list(dt); return { d: xs.filter((x) => doneSt.includes(s(x[field]))).length, o: xs.filter((x) => openSt.includes(s(x[field]))).length, dt, field, doneSt, openSt }; };
  const comp = [
    { key: "v", label: t("Visits", "الزيارات"), ...done(VISIT_DT, "workflow_state", ["Completed"], ["Unscheduled", "Planned", "Dispatched", "On Site"]) },
    { key: "r", label: t("Inspection runs", "جولات الفحص"), ...done("FSM Inspection Run", "workflow_state", ["Reviewed", "Published"], ["Draft", "In Progress", "Submitted for Review"]) },
    { key: "j", label: t("Service jobs", "أوامر العمل"), ...done("FSM Job", "workflow_state", ["Completed", "Closed"], JOB_ST) },
    { key: "f", label: t("Findings", "الملاحظات"), ...done("FSM Deficiency", "workflow_state", ["Verified Closed"], [...OPEN_DEFICIENCY]) },
  ];
  const pct = (d: number, o: number) => (d + o ? Math.round((d / (d + o)) * 100) : 0);
  return { scope: false, charts: <>
    <Insight id="my-assign" title={["My assignments", "المهام المسندة إلي"]} q={["What is assigned to me right now?", "ما المسند إلي الآن؟"]}
      meta={M([VISIT_DT, "FSM Booking", "FSM Inspection Run", "FSM Job", "ToDo"], [me ? "Open work where I am the lead technician, and open ToDo tasks allocated to me on FSM records" : "Open work of every technician (your user is not linked to a technician), and open ToDo tasks allocated to you on FSM records", me ? "العمل المفتوح الذي أنا فنيه الرئيسي، ومهام ToDo المفتوحة المسندة إلي على سجلات الخدمة" : "العمل المفتوح لكل الفنيين (مستخدمك غير مرتبط بفني)، ومهام ToDo المفتوحة المسندة إليك على سجلات الخدمة"], ["Row count of each my-queue; ToDo rows with status Open", "عدد صفوف كل طابور خاص بي؛ مهام ToDo بحالة مفتوحة"], ["The queue / the filtered ToDo list", "الطابور / قائمة المهام المفلترة"], ["ToDo is hidden when your role may not read it; nothing is assigned by default", "تُخفى المهام إن لم يسمح دورك بقراءتها؛ لا إسناد افتراضي"])}>
      <Bars items={assign} empty={t("Nothing is assigned to you.", "لا شيء مسند إليك.")} />
    </Insight>
    <Insight id="my-due" title={["Due work", "العمل المستحق"]} q={["What falls due today and this week, and what has already passed?", "ما المستحق اليوم وهذا الأسبوع، وما الذي تجاوز موعده؟"]}
      meta={M([VISIT_DT, "FSM Obligation", "FSM Retest"], ["Open visits (deadline = scheduled end, else start); Due / Scheduled obligations and Required / Scheduled retests by due date", "الزيارات المفتوحة (الموعد = نهاية الموعد وإلا بدايته)؛ الالتزامات المستحقة/المجدولة وإعادات الفحص المطلوبة/المجدولة حسب تاريخ الاستحقاق"], ["Count per record type split by deadline class", "العدد لكل نوع سجل مقسماً حسب فئة الموعد"], ["Visits portfolio by deadline / filtered obligation and retest lists", "محفظة الزيارات حسب الموعد / قوائم الالتزامات وإعادات الفحص المفلترة"], ["A record without a date is shown as No date yet — never as on time", "السجل بلا تاريخ يظهر «بلا موعد بعد» — ولا يُعد في الموعد"])}>
      <Stack legend={DUE_BUCKETS.map((k) => ({ key: k, label: t(...DUE[k]), tone: DUE_TONE(k) }))} rows={[
        { key: "v", label: t("Visits", "الزيارات"), to: "visits", segs: DUE_BUCKETS.map((k) => ({ key: k, value: vis.filter((v) => dueBucket(v) === k).length, to: vq({ due: k }) })) },
        { key: "o", label: t("Obligations", "الالتزامات"), ...LS("FSM Obligation", oblF), segs: DUE_BUCKETS.map((k) => ({ key: k, value: obl.filter((o) => dueOfDate(o["due_date"], now, wk) === k).length, ...LS("FSM Obligation", oblF, dateClause(k, "due_date", now, wk)) })) },
        { key: "r", label: t("Retests", "إعادات الفحص"), ...LS("FSM Retest", rtF), segs: DUE_BUCKETS.map((k) => ({ key: k, value: rts.filter((r) => dueOfDate(r["due_date"], now, wk) === k).length, ...LS("FSM Retest", rtF, dateClause(k, "due_date", now, wk)) })) },
      ]} empty={t("Nothing is open with a deadline.", "لا شيء مفتوح له موعد.")} />
    </Insight>
    <Insight id="my-priority" title={["Open jobs by priority", "أوامر العمل المفتوحة حسب الأولوية"]} q={["Is urgent work moving, or is it waiting or on hold?", "هل يتقدم العمل العاجل، أم هو بالانتظار أو موقوف؟"]}
      meta={M(["FSM Job"], ["One open service job (not completed, closed or cancelled)", "أمر عمل مفتوح (غير مكتمل أو مغلق أو ملغى)"], ["Count per priority split by stage", "العدد لكل أولوية مقسماً حسب المرحلة"], ["Job register filtered to the priority and stage", "سجل أوامر العمل مفلتراً بالأولوية والمرحلة"], ["A job without a priority is shown as — (not treated as Normal)", "أمر العمل بلا أولوية يظهر «—» (لا يُعد عادياً)"])}>
      <Stack legend={JOB_ST.map((k, i) => ({ key: k, label: opt(k, ar), tone: (["neutral", "info", "good", "warn"] as const)[i] }))} rows={["Urgent", "High", "Normal", "—"].map((p) => ({ key: p, label: p === "—" ? <span>—</span> : opt(p, ar), ...LS("FSM Job", ["priority", p === "—" ? ["is", "not set"] : p], ["workflow_state", ["not in", CLOSED_JOB]]),
        segs: JOB_ST.map((st) => ({ key: st, value: jobs.filter((j) => (s(j["priority"]) || "—") === p && s(j["workflow_state"]) === st).length, ...LS("FSM Job", ["priority", p === "—" ? ["is", "not set"] : p], ["workflow_state", st]) })) }))} empty={t("No open service job.", "لا أوامر عمل مفتوحة.")} />
    </Insight>
    <Insight id="my-completion" title={["Completion", "نسبة الإنجاز"]} q={["How much of the field work is done versus still open?", "كم من العمل الميداني أُنجز مقابل ما زال مفتوحاً؟"]}
      meta={M([VISIT_DT, "FSM Inspection Run", "FSM Job", "FSM Deficiency"], ["One record of each kind you may read; cancelled, rejected and duplicate records are left out", "سجل واحد من كل نوع مسموح بقراءته؛ تُستبعد الملغاة والمرفوضة والمكررة"], ["Done (completed visits, reviewed / published runs, completed / closed jobs, verified-closed findings) vs still open; % = done ÷ (done + open)", "منجز (زيارات مكتملة، جولات مراجَعة/منشورة، أوامر مكتملة/مغلقة، ملاحظات مغلقة موثقة) مقابل مفتوح؛ النسبة = المنجز ÷ (المنجز + المفتوح)"], ["Register filtered to the done / open stages", "السجل مفلتراً بمراحل المنجز / المفتوح"])}>
      <Stack legend={[{ key: "d", label: t("Done", "منجز"), tone: "good" }, { key: "o", label: t("Still open", "ما زال مفتوحاً"), tone: "warn" }]} rows={comp.map((x) => ({ key: x.key, label: <span>{x.label} <span className="text-[11px] text-muted-foreground" data-no-i18n>{pct(x.d, x.o)}%</span></span>, ...LS(x.dt), segs: [{ key: "d", value: x.d, ...LS(x.dt, [x.field, ["in", x.doneSt]]) }, { key: "o", value: x.o, ...LS(x.dt, [x.field, ["in", x.openSt]]) }] }))} empty={t("No field work recorded yet.", "لا عمل ميداني مسجل بعد.")} />
    </Insight>
    <Insight id="my-queues" title={["Open work by queue", "العمل المفتوح حسب الطابور"]} q={["Which queue needs attention first?", "أي طابور يحتاج الانتباه أولاً؟"]}
      meta={M(["FSM Deficiency", "FSM Obligation", "FSM Inspection Run", VISIT_DT, "FSM Job", "FSM Impairment", "FSM Retest", "FSM Charge Proposal"], ["One row of each work queue (permitted records)", "صف واحد من كل طابور عمل (سجلات مسموح بها)"], ["Row count per queue", "عدد الصفوف لكل طابور"], ["The queue", "الطابور"])}>
      <Bars items={keys.map((k) => ({ key: k, label: qLabel(k, ar), value: qCount(k), tone: ["critical", "overdue", "impairments"].includes(k) ? "bad" as const : "warn" as const, to: qPath(k) }))} empty={t("Every queue is clear.", "كل الطوابير فارغة.")} />
    </Insight>
    <Insight id="my-today" title={["Today's visits", "زيارات اليوم"]} q={["What is scheduled today, and where is it?", "ما المجدول اليوم، وأين هو؟"]}
      meta={M([VISIT_DT], ["One visit scheduled to start today", "زيارة مجدولة لتبدأ اليوم"], ["Count by status", "العدد حسب الحالة"], ["Visits portfolio for today and the status", "محفظة الزيارات لليوم والحالة"])}>
      <Ring items={pts(countBy(todays, "workflow_state"), { label: (k) => opt(k, ar), order: [...VISIT_STATES], tone: (k) => (k === "Completed" ? "good" : k === "Unscheduled" ? "warn" : undefined), drill: (k) => ({ to: vq({ state: k, from: now, to: now }) }) })} total={t("today", "اليوم")} empty={t("No visit is scheduled today.", "لا زيارات مجدولة اليوم.")} />
    </Insight>
  </> };
};

const control: PFn = (c) => {
  const { t, ar, F } = c; const now = today();
  const r9 = R("RP09", F); const r5 = R("RP05", F); const r7 = R("RP07", F);
  const todays = list(VISIT_DT).filter((v) => s(v["scheduled_start"]).slice(0, 10) === now && inF(v, F));
  const sites = [...new Set(r9.map((r) => s(r["site"])))];
  return { scope: ["company", "site"], charts: <>
    <Insight id="ctl-overdue" title={["Overdue work by site", "العمل المتأخر حسب الموقع"]} q={["Where is delivery falling behind?", "أين يتأخر التنفيذ؟"]}
      meta={M([VISIT_DT, "FSM Obligation"], ["Two datasets kept separate (RP09): late visits and past-window obligations", "مجموعتان منفصلتان (RP09): زيارات متأخرة والتزامات متجاوزة"], ["Count per site split by dataset", "العدد لكل موقع مقسماً حسب المجموعة"], ["RP09 filtered to site and dataset", "RP09 مفلتراً بالموقع والمجموعة"])}>
      <Stack legend={[{ key: "Visit", label: t("Late visits", "زيارات متأخرة"), tone: "bad" }, { key: "Obligation", label: t("Past-window obligations", "التزامات متجاوزة"), tone: "warn" }]} rows={sites.map((k) => ({ key: k, label: site(k), segs: ["Visit", "Obligation"].map((d) => ({ key: d, value: r9.filter((r) => s(r["site"]) === k && s(r["dataset"]) === d).length, to: rp("RP09", { ...F, site: k }, { dataset: d }) })) }))} empty={t("Nothing is overdue.", "لا شيء متأخر.")} />
    </Insight>
    <Insight id="ctl-sev" title={["Open findings by severity", "الملاحظات المفتوحة حسب الخطورة"]} q={["How much safety risk is open?", "كم خطر سلامة مفتوح؟"]}
      meta={M(["FSM Deficiency"], ["One open finding (RP05)", "ملاحظة مفتوحة (RP05)"], ["Count by severity", "العدد حسب الخطورة"], ["RP05 filtered to the severity", "RP05 مفلتراً بالخطورة"])}>
      <Ring items={pts(countBy(r5, "severity"), { label: (k) => opt(k, ar), order: SEV, tone: SEV_TONE, drill: (k) => ({ to: rp("RP05", F, { severity: k }) }) })} total={t("open", "مفتوحة")} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
    </Insight>
    <Insight id="ctl-today" title={["Today's visits by status", "زيارات اليوم حسب الحالة"]} q={["Is today's plan running?", "هل تسير خطة اليوم؟"]}
      meta={M([VISIT_DT], ["One visit scheduled to start today", "زيارة مجدولة لتبدأ اليوم"], ["Count by status", "العدد حسب الحالة"], ["Visits portfolio for today", "محفظة الزيارات لليوم"])}>
      <Bars items={pts(countBy(todays, "workflow_state"), { label: (k) => opt(k, ar), order: [...VISIT_STATES], drill: (k) => ({ to: vq({ state: k, from: now, to: now, site: F.site }) }) })} empty={t("No visit is scheduled today.", "لا زيارات مجدولة اليوم.")} />
    </Insight>
    <Insight id="ctl-imp" title={["Active impairments by age", "التعطّلات النشطة حسب العمر"]} q={["How long have systems been out of service?", "منذ متى الأنظمة خارج الخدمة؟"]}
      meta={M(["FSM Impairment"], ["One active impairment (RP07)", "تعطّل نشط (RP07)"], ["age_days bucketed", "العمر بالأيام في فئات"], ["RP07", "RP07"])}>
      <Bars items={pts(countBy(r7, (r) => { const d = num(r["age_days"]); return d <= 7 ? "0–7" : d <= 30 ? "8–30" : d <= 90 ? "31–90" : ">90"; }), { order: AGING_BUCKETS, label: (k) => <span>{k} {t("days", "يوم")}</span>, tone: (k) => (k === ">90" || k === "31–90" ? "bad" : "warn"), drill: () => ({ to: rp("RP07", F) }) })} empty={t("No active impairment.", "لا تعطّلات نشطة.")} />
    </Insight>
  </> };
};

const management: PFn = (c) => {
  const { t, ar, F } = c;
  const r8 = R("RP08", F); const r5 = R("RP05", F); const r12 = R("RP12", F).filter((r) => s(r["state"]) === "Active");
  const months = monthAxis(r8.map((r) => r["due_date"]), F);
  const inM = (m: string, st: string) => r8.filter((r) => s(r["due_date"]).slice(0, 7) === m && s(r["status"]) === st).length;
  const exp = (d: number) => (d <= 30 ? "≤30" : d <= 90 ? "31–90" : d <= 180 ? "91–180" : ">180");
  return { scope: false, charts: <>
    <Insight id="mgmt-obl" title={["Obligations in the period by status", "الالتزامات في الفترة حسب الحالة"]} q={["Are we delivering what we contracted?", "هل ننفذ ما تعاقدنا عليه؟"]}
      meta={M(["FSM Obligation"], ["One obligation whose window meets the period (RP08)", "التزام تتقاطع نافذته مع الفترة (RP08)"], ["Count by status; Waived is never fulfilled", "العدد حسب الحالة؛ المعفى ليس منفّذاً"], ["RP08 filtered to the status", "RP08 مفلتراً بالحالة"])}>
      <Ring items={pts(countBy(r8, "status"), { label: (k) => opt(k, ar), order: ["Fulfilled", "Scheduled", "Due", "Missed", "Waived"], tone: (k) => (k === "Missed" ? "bad" : k === "Fulfilled" ? "good" : undefined), drill: (k) => ({ to: rp("RP08", F, { status: k }) }) })} total={t("obligations", "التزام")} empty={t("No obligations in the period.", "لا التزامات في الفترة.")} />
    </Insight>
    <Insight id="mgmt-trend" title={["Delivered vs missed by month", "المنفّذ مقابل الفائت حسب الشهر"]} q={["Is delivery improving month by month?", "هل يتحسن التنفيذ شهراً بعد شهر؟"]}
      meta={M(["FSM Obligation"], ["One obligation by due month (RP08)", "التزام حسب شهر الاستحقاق (RP08)"], ["Fulfilled and missed counts per month", "عدد المنفّذ والفائت لكل شهر"], ["RP08 for the month and status", "RP08 للشهر والحالة"])}>
      <Cols labels={months} labelText={(m) => monthLabel(m, ar)} series={[{ name: "f", label: opt("Fulfilled", ar), values: months.map((m) => inM(m, "Fulfilled")) }, { name: "m", label: opt("Missed", ar), values: months.map((m) => inM(m, "Missed")) }]} drill={(li, si) => ({ to: rp("RP08", { ...F, from: `${months[li]}-01`, to: monthEnd(months[li]!) }, { status: si === 0 ? "Fulfilled" : "Missed" }) })} empty={t("No fulfilled or missed obligation in the period.", "لا التزامات منفّذة أو فائتة في الفترة.")} />
    </Insight>
    <Insight id="mgmt-sev" title={["Open findings by severity", "الملاحظات المفتوحة حسب الخطورة"]} q={["Are we delivering safely?", "هل ننفذ بأمان؟"]}
      meta={M(["FSM Deficiency"], ["One open finding (RP05; duplicates excluded)", "ملاحظة مفتوحة (RP05؛ بدون المكرر)"], ["Count by severity", "العدد حسب الخطورة"], ["RP05 filtered to the severity", "RP05 مفلتراً بالخطورة"])}>
      <Bars items={pts(countBy(r5, "severity"), { label: (k) => opt(k, ar), order: SEV, tone: SEV_TONE, drill: (k) => ({ to: rp("RP05", F.site ? { site: F.site } : {}, { severity: k }) }) })} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
    </Insight>
    <Insight id="mgmt-renew" title={["Renewal revenue at risk", "إيراد التجديد المعرّض للخطر"]} q={["How much annual value expires, and when?", "كم قيمة سنوية تنتهي، ومتى؟"]}
      meta={M(["FSM Service Agreement"], ["One active agreement (RP12)", "اتفاقية نشطة (RP12)"], ["Sum of annual value by days to expiry", "مجموع القيمة السنوية حسب الأيام حتى الانتهاء"], ["Renewals workspace", "مساحة التجديدات"])}>
      <Bars fmt={(v) => money(v)} items={pts(sumBy(r12, (r) => exp(num(r["days_to_expiry"])), (r) => num(r["annual_value"])), { order: ["≤30", "31–90", "91–180", ">180"], label: (k) => <span>{k} {t("days", "يوم")}</span>, tone: (k) => (k === "≤30" ? "bad" : k === "31–90" ? "warn" : undefined), drill: () => ({ to: "ws/renewals" }) })} empty={t("No active agreement.", "لا اتفاقية نشطة.")} />
    </Insight>
  </> };
};

const exceptions: PFn = (c) => {
  const { t, ar, F } = c;
  const ex = list("FSM Integration Exception").filter((x) => inF(x, F));
  const months = monthAxis(ex.map((x) => x["last_attempt"] || x["creation"]), F);
  const att = (n: number) => (n <= 1 ? "1" : n <= 3 ? "2–3" : "4+");
  const openEx = ex.filter((x) => s(x["status"]) !== "Resolved");
  return { scope: ["company"], charts: <>
    <Insight id="exc-status" title={["Exceptions by status", "الاستثناءات حسب الحالة"]} q={["How many exceptions are still open?", "كم استثناءً ما زال مفتوحاً؟"]}
      meta={M(["FSM Integration Exception"], ["One integration / data exception", "استثناء تكامل/بيانات"], ["Count by status", "العدد حسب الحالة"], ["Exception register filtered to the status", "سجل الاستثناءات مفلتراً بالحالة"])}>
      <Ring items={pts(countBy(ex, "status"), { label: (k) => opt(k, ar), order: ["Open", "Retrying", "Resolved"], tone: (k) => (k === "Open" ? "bad" : k === "Retrying" ? "warn" : "good"), drill: (k) => LS("FSM Integration Exception", ["status", k]) })} total={t("exceptions", "استثناء")} empty={t("No exception recorded.", "لا استثناءات مسجلة.")} />
    </Insight>
    <Insight id="exc-source" title={["Open exceptions by source", "الاستثناءات المفتوحة حسب المصدر"]} q={["Which integration fails most?", "أي تكامل يفشل أكثر؟"]}
      meta={M(["FSM Integration Exception"], ["One Open / Retrying exception", "استثناء مفتوح/قيد الإعادة"], ["Count by source", "العدد حسب المصدر"], ["Exception register filtered to the source", "سجل الاستثناءات مفلتراً بالمصدر"])}>
      <Bars items={pts(countBy(ex.filter((x) => s(x["status"]) !== "Resolved"), "source"), { label: (k) => opt(k, ar), tone: () => "bad", drill: (k) => LS("FSM Integration Exception", ["source", k], ["status", ["!=", "Resolved"]]) })} empty={t("No open exception.", "لا استثناءات مفتوحة.")} />
    </Insight>
    <Insight id="exc-att" title={["Retry attempts", "محاولات الإعادة"]} q={["Are exceptions stuck after repeated retries?", "هل تتعثر الاستثناءات بعد محاولات متكررة؟"]}
      meta={M(["FSM Integration Exception"], ["One unresolved exception", "استثناء غير محلول"], ["Count by attempts (1, 2–3, 4+)", "العدد حسب المحاولات (1، 2–3، 4+)"], ["Exception register filtered to the attempts", "سجل الاستثناءات مفلتراً بالمحاولات"])}>
      <Bars items={pts(countBy(ex.filter((x) => s(x["status"]) !== "Resolved"), (x) => att(num(x["attempts"]))), { order: ["1", "2–3", "4+"], tone: (k) => (k === "4+" ? "bad" : "warn"), drill: (k) => LS("FSM Integration Exception", ["status", ["!=", "Resolved"]], ["attempts", k === "1" ? ["<=", 1] : k === "4+" ? [">=", 4] : ["between", [2, 3]]]) })} empty={t("No open exception.", "لا استثناءات مفتوحة.")} />
    </Insight>
    <Insight id="exc-month" title={["Exceptions by month", "الاستثناءات حسب الشهر"]} q={["Is the exception rate falling?", "هل ينخفض معدل الاستثناءات؟"]}
      meta={M(["FSM Integration Exception"], ["One exception by last attempt (else creation)", "استثناء حسب آخر محاولة (وإلا الإنشاء)"], ["Count per month", "العدد لكل شهر"], ["Exception register for the month", "سجل الاستثناءات للشهر"])}>
      <Cols labels={months} labelText={(m) => monthLabel(m, ar)} series={[{ name: "n", label: t("Exceptions", "الاستثناءات"), values: perMonth(ex, (x) => x["last_attempt"] || x["creation"], months) }]} drill={(li) => LS("FSM Integration Exception", ["last_attempt", ["between", [`${months[li]}-01`, `${monthEnd(months[li]!)} 23:59:59`]]])} empty={t("No exception recorded.", "لا استثناءات مسجلة.")} />
    </Insight>
    <Insight id="exc-dt" title={["Open exceptions by document", "الاستثناءات المفتوحة حسب المستند"]} q={["Which documents are held up by an exception?", "أي المستندات معلّقة باستثناء؟"]}
      meta={M(["FSM Integration Exception"], ["One Open / Retrying exception", "استثناء مفتوح/قيد الإعادة"], ["Count by reference document type", "العدد حسب نوع المستند المرجعي"], ["Exception register filtered to the document type", "سجل الاستثناءات مفلتراً بنوع المستند"])}>
      <Bars items={pts(countBy(openEx, (x) => s(x["reference_doctype"]) || "—"), { label: (k) => (k === "—" ? t("No document", "بلا مستند") : <span data-no-i18n>{ar ? tLabel(k) : k}</span>), tone: () => "warn", drill: (k) => LS("FSM Integration Exception", ["status", ["!=", "Resolved"]], ["reference_doctype", k === "—" ? ["is", "not set"] : k]) })} empty={t("No open exception.", "لا استثناءات مفتوحة.")} />
    </Insight>
    <Insight id="exc-age" title={["Open exceptions by age", "الاستثناءات المفتوحة حسب العمر"]} q={["How long have unresolved exceptions been waiting?", "منذ متى تنتظر الاستثناءات غير المحلولة؟"]}
      meta={M(["FSM Integration Exception"], ["One Open / Retrying exception", "استثناء مفتوح/قيد الإعادة"], ["Days since the exception was created: 0–7, 8–30, 31–90, over 90", "الأيام منذ إنشاء الاستثناء: 0–7، 8–30، 31–90، أكثر من 90"], ["Exception register filtered to the creation window", "سجل الاستثناءات مفلتراً بفترة الإنشاء"])}>
      <Ring items={pts(countBy(openEx, (x) => ageOf(x["creation"])), { order: AGING_BUCKETS, label: (k) => `${k} ${t("days", "يوم")}`, tone: (k) => (k === ">90" ? "bad" : k === "31–90" ? "warn" : "info"), drill: (k) => LS("FSM Integration Exception", ["status", ["!=", "Resolved"]], ["creation", ["between", ageWin(k)]]) })} total={t("open", "مفتوح")} empty={t("No open exception.", "لا استثناءات مفتوحة.")} />
    </Insight>
  </> };
};

const siteExplorer: PFn = (c) => {
  const { t, ar, F } = c;
  const sys = list("FSM Service System").filter((x) => inF(x, F)); const devs = list("FSM Device").filter((x) => inF(x, F));
  const r1 = R("RP01", F); const r5 = R("RP05", F); const sites = [...new Set(r5.map((r) => s(r["site"])))];
  return { scope: ["company", "site"], charts: <>
    <Insight id="sx-types" title={["Systems by type", "الأنظمة حسب النوع"]} q={["What do we maintain?", "ماذا نصون؟"]}
      meta={M(["FSM Service System"], ["One installed system", "نظام مركب"], ["Count by system type", "العدد حسب النوع"], ["System register filtered to the type", "سجل الأنظمة مفلتراً بالنوع"])}>
      <Bars share items={pts(countBy(sys, "system_type"), { label: (k) => opt(k, ar), order: SYSTEM_TYPES, drill: (k) => LS("FSM Service System", ["system_type", k], ...(F.site ? [["site", F.site] as [string, unknown]] : [])) })} empty={t("No system in scope.", "لا أنظمة ضمن النطاق.")} />
    </Insight>
    <Insight id="sx-life" title={["Devices by lifecycle", "الأجهزة حسب دورة الحياة"]} q={["How many devices are active, removed or retired?", "كم جهازاً نشطاً أو مزالاً أو متقاعداً؟"]}
      meta={M(["FSM Device"], ["One registered device", "جهاز مسجل"], ["Count by lifecycle", "العدد حسب دورة الحياة"], ["Device register filtered to the lifecycle", "سجل الأجهزة مفلتراً بدورة الحياة"])}>
      <Ring items={pts(countBy(devs, "lifecycle"), { label: (k) => opt(k, ar), order: ["Active", "Removed", "Retired"], tone: (k) => (k === "Active" ? "good" : "neutral"), drill: (k) => LS("FSM Device", ["lifecycle", k], ...(F.site ? [["site", F.site] as [string, unknown]] : [])) })} total={t("devices", "جهاز")} empty={t("No device in scope.", "لا أجهزة ضمن النطاق.")} />
    </Insight>
    <Insight id="sx-last" title={["Last inspection outcome per device", "آخر نتيجة فحص لكل جهاز"]} q={["What did each device's latest check return?", "ماذا أعاد آخر فحص لكل جهاز؟"]}
      meta={M(["FSM Device", "FSM Inspection Result"], ["One device (RP01); latest result row", "جهاز واحد (RP01)؛ آخر صف نتيجة"], ["Count by last outcome; never inspected = —", "العدد حسب آخر نتيجة؛ لم يُفحص = —"], ["RP01 filtered to the outcome", "RP01 مفلتراً بالنتيجة"])}>
      <Ring items={pts(countBy(r1, "last_outcome"), { label: (k) => (k === "—" ? t("Never inspected", "لم يُفحص") : opt(k, ar)), order: ["Pass", "Fail", "Inaccessible", "Untested", "Not Applicable", "—"], tone: (k) => (k === "Pass" ? "good" : k === "Fail" ? "bad" : k === "Inaccessible" ? "warn" : "neutral"), drill: (k) => ({ to: rp("RP01", F, k === "—" ? {} : { last_outcome: k }) }) })} total={t("devices", "جهاز")} empty={t("No device in scope.", "لا أجهزة ضمن النطاق.")} />
    </Insight>
    <Insight id="sx-defs" title={["Open findings per site", "الملاحظات المفتوحة لكل موقع"]} q={["Where is the open risk located?", "أين يقع الخطر المفتوح؟"]}
      meta={M(["FSM Deficiency"], ["One open finding (RP05); site × severity", "ملاحظة مفتوحة (RP05)؛ الموقع × الخطورة"], ["Count per site split by severity", "العدد لكل موقع مقسماً حسب الخطورة"], ["RP05 filtered to site and severity", "RP05 مفلتراً بالموقع والخطورة"])}>
      <Stack legend={SEV.map((k) => ({ key: k, label: opt(k, ar), tone: SEV_TONE(k) }))} rows={sites.map((k) => ({ key: k, label: site(k), to: `site/${encodeURIComponent(k)}`, segs: SEV.map((v) => ({ key: v, value: r5.filter((r) => s(r["site"]) === k && s(r["severity"]) === v).length, to: rp("RP05", { ...F, site: k }, { severity: v }) })) }))} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
    </Insight>
    <Insight id="sx-status" title={["Systems by operating status", "الأنظمة حسب حالة التشغيل"]} q={["Which systems are impaired or out of service?", "أي الأنظمة معطّلة جزئياً أو خارج الخدمة؟"]}
      meta={M(["FSM Service System"], ["One installed system", "نظام مركب"], ["Count by operating_status", "العدد حسب حالة التشغيل"], ["System register filtered to the status", "سجل الأنظمة مفلتراً بالحالة"])}>
      <Ring items={pts(countBy(sys, "operating_status"), { label: (k) => opt(k, ar), order: ["In Service", "Impaired", "Out of Service"], tone: (k) => (k === "In Service" ? "good" : k === "Impaired" ? "warn" : "bad"), drill: (k) => LS("FSM Service System", ["operating_status", k], ...(F.site ? [["site", F.site] as [string, unknown]] : [])) })} total={t("systems", "نظام")} empty={t("No system in scope.", "لا أنظمة ضمن النطاق.")} />
    </Insight>
    <Insight id="sx-install" title={["Devices by installation year", "الأجهزة حسب سنة التركيب"]} q={["How old is the installed base?", "كم عمر قاعدة الأجهزة المركبة؟"]}
      meta={M(["FSM Device"], ["One active device with an install date", "جهاز نشط بتاريخ تركيب"], ["Count per install_date year; devices without a date are not counted", "العدد لكل سنة تركيب؛ الأجهزة بلا تاريخ لا تُحسب"], ["Device register filtered to the year", "سجل الأجهزة مفلتراً بالسنة"])}>
      <Bars items={pts(countBy(devs.filter((d) => s(d["lifecycle"]) === "Active" && s(d["install_date"])), (d) => s(d["install_date"]).slice(0, 4)), { label: (k) => <span data-no-i18n>{k}</span>, order: [...new Set(devs.map((d) => s(d["install_date"]).slice(0, 4)).filter(Boolean))].sort(), drill: (k) => LS("FSM Device", ["lifecycle", "Active"], ["install_date", ["between", [`${k}-01-01`, `${k}-12-31`]]], ...(F.site ? [["site", F.site] as [string, unknown]] : [])) })} empty={t("No install date recorded.", "لا تاريخ تركيب مسجل.")} />
    </Insight>
  </> };
};

const sitesP: PFn = (c) => {
  const { t, F } = c; const cust = c.url?.["customer"];
  const sites = list("FSM Service Site").filter((x) => (!cust || s(x["customer"]) === cust) && inF(x, F)); const ids = new Set(sites.map((x) => x.name));
  const devs = list("FSM Device").filter((d) => ids.has(s(d["site"])) && s(d["lifecycle"]) === "Active");
  const defs = list("FSM Deficiency").filter((d) => ids.has(s(d["site"])) && OPEN_DEFICIENCY.has(s(d["workflow_state"])));
  const covered = new Set(list("FSM Service Agreement").filter((a) => s(a["workflow_state"]) === "Active").map((a) => s(a["site"])));
  return { scope: false, charts: <>
    <Insight id="st-city" title={["Sites by city", "المواقع حسب المدينة"]} q={["Where do we operate?", "أين نعمل؟"]}
      meta={M(["FSM Service Site"], ["One service site", "موقع خدمة"], ["Count by city", "العدد حسب المدينة"], ["Site register filtered to the city", "سجل المواقع مفلتراً بالمدينة"])}>
      <Bars items={pts(countBy(sites, "city"), { label: (k) => <span data-no-i18n>{k}</span>, drill: (k) => LS("FSM Service Site", ["city", k]) })} empty={t("No service site.", "لا مواقع خدمة.")} />
    </Insight>
    <Insight id="st-cov" title={["Sites under an active agreement", "المواقع تحت اتفاقية نشطة"]} q={["Which sites have no contract coverage?", "أي المواقع بلا تغطية عقد؟"]}
      meta={M(["FSM Service Site", "FSM Service Agreement"], ["One service site; agreement joined on site", "موقع خدمة؛ الاتفاقية مربوطة بالموقع"], ["With an Active agreement vs without", "باتفاقية نشطة مقابل دونها"], ["Agreements / coverage workspace", "الاتفاقيات / مساحة التغطية"])}>
      <Ring items={[{ key: "y", label: t("Under agreement", "تحت اتفاقية"), tone: "good" as const, value: sites.filter((x) => covered.has(x.name)).length, ...LS("FSM Service Agreement", ["workflow_state", "Active"]) }, { key: "n", label: t("No active agreement", "بلا اتفاقية نشطة"), tone: "warn" as const, value: sites.filter((x) => !covered.has(x.name)).length, to: "ws/coverage" }]} total={t("sites", "موقع")} empty={t("No service site.", "لا مواقع خدمة.")} />
    </Insight>
    <Insight id="st-dev" title={["Active devices per site", "الأجهزة النشطة لكل موقع"]} q={["Which sites carry the largest installed base?", "أي المواقع تحمل أكبر قاعدة أجهزة؟"]}
      meta={M(["FSM Device"], ["One active device", "جهاز نشط"], ["Count per site", "العدد لكل موقع"], ["Device register filtered to the site", "سجل الأجهزة مفلتراً بالموقع"])}>
      <Bars items={pts(countBy(devs, "site"), { label: site, limit: 10, drill: (k) => LS("FSM Device", ["site", k], ["lifecycle", "Active"]) })} empty={t("No active device.", "لا أجهزة نشطة.")} />
    </Insight>
    <Insight id="st-defs" title={["Open findings per site", "الملاحظات المفتوحة لكل موقع"]} q={["Where is the risk?", "أين الخطر؟"]}
      meta={M(["FSM Deficiency"], ["One open finding", "ملاحظة مفتوحة"], ["Count per site split by severity", "العدد لكل موقع مقسماً حسب الخطورة"], ["RP05 filtered to site and severity", "RP05 مفلتراً بالموقع والخطورة"])}>
      <Stack legend={SEV.map((k) => ({ key: k, label: opt(k, c.ar), tone: SEV_TONE(k) }))} rows={[...new Set(defs.map((d) => s(d["site"])))].map((k) => ({ key: k, label: site(k), to: `site/${encodeURIComponent(k)}`, segs: SEV.map((v) => ({ key: v, value: defs.filter((d) => s(d["site"]) === k && s(d["severity"]) === v).length, to: rp("RP05", { site: k }, { severity: v }) })) }))} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
    </Insight>
  </> };
};

const opsCenter: PFn = (c) => ({ scope: false, charts: visitCharts(c, facts(), {}, "oc") });
const visitsP: PFn = (c) => { const q = { ...(c.url ?? {}) } as VisitFilter & Record<string, string>; delete q["tab"]; return { scope: false, charts: visitCharts(c, facts().filter((f) => matchVisit(f, q)), q, "vp") }; };
/**
 * Late visits (owner correction 2026-10-21): useful even when nothing is late — the page shows where every visit that still
 * has to happen stands against its deadline, the arrival record of all scheduled visits, late arrivals by month and who
 * carries past-window work. Same URL filters as the portfolio (site / technician / period); nothing is invented.
 */
const lateP: PFn = (c) => {
  const { t, ar } = c;
  const base = { ...(c.url ?? {}) } as VisitFilter & Record<string, string>; delete base["tab"]; delete base["late"]; delete base["due"];
  const fs = facts().filter((f) => matchVisit(f, base));
  const todo = fs.filter((f) => dueBucket(f.visit) !== undefined);
  const sched = fs.filter((f) => !["unscheduled", "cancelled"].includes(f.arrival));
  const arrived = fs.filter((f) => f.arrival === "on_time" || f.arrival === "late");
  const months = monthAxis(arrived.map((f) => f.visit["scheduled_start"]), {});
  const inM = (m: string, a: Arrival) => arrived.filter((f) => s(f.visit["scheduled_start"]).slice(0, 7) === m && f.arrival === a).length;
  const open = fs.filter((f) => (OPEN_VISIT_STATES as readonly string[]).includes(s(f.visit["workflow_state"])));
  const byTech = new Map<string, { label: ReactNode; ok: number; over: number }>();
  for (const f of open) { const k = f.lead?.technician ?? "__none"; const r = byTech.get(k) ?? { label: f.lead ? <span data-no-i18n>{f.lead.name}</span> : t("Not assigned", "غير مسند"), ok: 0, over: 0 }; if (f.overdue) r.over++; else r.ok++; byTech.set(k, r); }
  return { scope: false, charts: <>
    <Insight id="lv-due" title={["Visits still to happen, by deadline", "الزيارات المتبقية حسب الموعد"]} q={["Is anything late now, and what falls due next?", "هل هناك تأخير الآن، وما المستحق التالي؟"]}
      meta={VM(["One Unscheduled / Planned / Dispatched / On Site visit; deadline = scheduled end, else start", "زيارة غير مجدولة/مخططة/مرسلة/في الموقع؛ الموعد = نهاية الموعد وإلا بدايته"], ["Count by deadline class: past deadline (= late), today, next 7 days, later, no date yet", "العدد حسب فئة الموعد: تجاوز الموعد (= متأخرة)، اليوم، خلال 7 أيام، لاحقاً، بلا موعد"], ["Visits portfolio filtered to the deadline class", "محفظة الزيارات مفلترة بفئة الموعد"])}>
      <Bars items={DUE_BUCKETS.map((k) => ({ key: k, label: t(...DUE[k]), value: todo.filter((f) => dueBucket(f.visit) === k).length, tone: DUE_TONE(k), to: vq({ ...base, due: k }) }))} empty={t("No visit is still to happen.", "لا زيارات متبقية.")} />
    </Insight>
    <Insight id="lv-arrival" title={["Arrival record of scheduled visits", "سجل الوصول للزيارات المجدولة"]} q={["When technicians arrive, are they on time?", "عند وصول الفنيين، هل يصلون في الموعد؟"]}
      meta={VM(["One scheduled, non-cancelled visit", "زيارة مجدولة غير ملغاة"], ["arrived_on vs scheduled_start: on time, late, not arrived (start passed, no arrival), unrecorded", "وقت الوصول مقابل بداية الموعد: في الموعد، متأخر، لم يصل، غير مسجل"], ["Visits portfolio filtered to the arrival class", "محفظة الزيارات مفلترة بفئة الوصول"])}>
      <Ring items={(["on_time", "late", "not_arrived", "unrecorded"] as Arrival[]).map((a) => ({ key: a, label: t(...ARR[a]), value: sched.filter((f) => f.arrival === a).length, tone: a === "late" ? "bad" as const : a === "on_time" ? "good" as const : a === "not_arrived" ? "warn" as const : "neutral" as const, to: vq({ ...base, arrival: a }) }))} total={t("scheduled", "مجدولة")} empty={t("No scheduled visits.", "لا زيارات مجدولة.")} />
    </Insight>
    <Insight id="lv-month" title={["On-time vs late arrivals by month", "الوصول في الموعد مقابل المتأخر حسب الشهر"]} q={["Is punctuality improving?", "هل يتحسن الالتزام بالمواعيد؟"]}
      meta={VM(["One visit with a recorded arrival, by month of the scheduled start", "زيارة بوصول مسجل حسب شهر بداية الموعد"], ["On-time and late arrivals per month (unrecorded arrivals are not counted)", "الوصول في الموعد والمتأخر لكل شهر (لا يُحسب غير المسجل)"], ["Visits portfolio for the month and arrival class", "محفظة الزيارات للشهر وفئة الوصول"])}>
      <Cols labels={months} labelText={(m) => monthLabel(m, ar)} series={[{ name: "on", label: t("On time", "في الموعد"), values: months.map((m) => inM(m, "on_time")) }, { name: "late", label: t("Late", "متأخر"), values: months.map((m) => inM(m, "late")) }]}
        drill={(li, si) => ({ to: vq({ ...base, arrival: si === 0 ? "on_time" : "late", from: `${months[li]}-01`, to: monthEnd(months[li]!) }) })} empty={t("No arrival is recorded yet.", "لا وصول مسجل بعد.")} />
    </Insight>
    <Insight id="lv-tech" title={["Open visits by lead technician", "الزيارات المفتوحة حسب الفني الرئيسي"]} q={["Who carries past-deadline work, and who is on track?", "من يحمل عملاً تجاوز موعده، ومن ضمن المسار؟"]}
      meta={VM(["One Planned / Dispatched / On Site visit; lead from the Lead booking, else the visit's lead field", "زيارة مخططة/مرسلة/في الموقع؛ الرئيسي من الحجز الرئيسي وإلا حقل الزيارة"], ["Count per lead technician split on track / past deadline", "العدد لكل فني رئيسي: ضمن المسار / تجاوز الموعد"], ["Visits portfolio filtered to the technician (and late)", "محفظة الزيارات مفلترة بالفني (والمتأخرة)"])}>
      <Stack legend={[{ key: "ok", label: t("On track", "ضمن المسار"), tone: "good" }, { key: "over", label: t("Past deadline", "تجاوز الموعد"), tone: "bad" }]} rows={[...byTech].map(([k, r]) => { const who = k === "__none" ? { assigned: "0" } : { tech: k }; return { key: k, label: r.label, to: vq({ ...base, ...who }), segs: [{ key: "ok", value: r.ok, to: vq({ ...base, ...who }) }, { key: "over", value: r.over, to: vq({ ...base, ...who, late: "1" }) }] }; })} empty={t("No open visit.", "لا زيارات مفتوحة.")} />
    </Insight>
    <Insight id="lv-return" title={["Return visits by reason", "زيارات العودة حسب السبب"]} q={["Why do technicians have to go back?", "لماذا يضطر الفنيون إلى العودة؟"]}
      meta={VM(["One return visit (visit_purpose = Return Visit)", "زيارة عودة (الغرض = زيارة عودة)"], ["Count by return_reason", "العدد حسب سبب العودة"], ["Visit register filtered to the reason", "سجل الزيارات مفلتراً بالسبب"])}>
      <Ring items={pts(countBy(fs.filter((f) => s(f.visit["visit_purpose"]) === "Return Visit").map((f) => f.visit), (v) => s(v["return_reason"]) || "—"), { label: (k) => (k === "—" ? t("No reason", "بلا سبب") : opt(k, ar)), drill: (k) => LS(VISIT_DT, ["visit_purpose", "Return Visit"], ["return_reason", k === "—" ? ["is", "not set"] : k]) })} total={t("return visits", "زيارة عودة")} empty={t("No return visit.", "لا زيارات عودة.")} />
    </Insight>
    <Insight id="lv-psite" title={["Past-deadline visits by site", "الزيارات المتجاوزة للموعد حسب الموقع"]} q={["Where is late work piling up?", "أين يتراكم العمل المتأخر؟"]}
      meta={VM(["One visit still to happen whose deadline has passed", "زيارة متبقية تجاوزت موعدها"], ["Count per site", "العدد لكل موقع"], ["Visits portfolio filtered to the site and Past deadline", "محفظة الزيارات مفلترة بالموقع وتجاوز الموعد"])}>
      <Bars items={pts(countBy(todo.filter((f) => dueBucket(f.visit) === "overdue").map((f) => f.visit), "site"), { label: site, limit: 10, tone: () => "bad", drill: (k) => ({ to: vq({ ...base, due: "overdue", site: k }) }) })} empty={t("Nothing is past its deadline.", "لا شيء تجاوز موعده.")} />
    </Insight>
  </> };
};

const dispatch: PFn = (c) => {
  const { t, ar } = c; const day = c.url?.["date"] ?? today();
  const bk = list("FSM Booking").filter((b) => s(b["status"]) !== "Cancelled" && s(b["booking_start"]).slice(0, 10) <= day && s(b["booking_end"]).slice(0, 10) >= day);
  const hrs = (b: Record<string, unknown>) => Math.max(0, (Date.parse(s(b["booking_end"]).replace(" ", "T")) - Date.parse(s(b["booking_start"]).replace(" ", "T"))) / 3600000) || 0;
  const waiting = list(VISIT_DT).filter((v) => ["Unscheduled", "Planned"].includes(s(v["workflow_state"])));
  const unav = list("FSM Calendar Exception").filter((x) => s(x["status"]) === "Approved" && s(x["from_time"]).slice(0, 10) <= day && s(x["to_time"]).slice(0, 10) >= day);
  const dayF: [string, unknown] = ["booking_start", ["<=", `${day} 23:59:59`]];
  const reserved = list("FSM Booking").filter((b) => s(b["status"]) === "Reserved");
  const months = monthAxis(reserved.map((b) => b["booking_start"]), {});
  return { scope: false, charts: <>
    <Insight id="dp-hours" title={["Booked hours per technician", "الساعات المحجوزة لكل فني"]} q={["Who is busy on this day?", "من مشغول في هذا اليوم؟"]}
      meta={M(["FSM Booking", "FSM Technician"], ["One reserved booking touching the selected day", "حجز محجوز يمس اليوم المحدد"], ["Sum of booking hours (end − start) per technician", "مجموع ساعات الحجز (النهاية − البداية) لكل فني"], ["Booking register filtered to the technician", "سجل الحجوزات مفلتراً بالفني"], ["Multi-day bookings count their full length", "الحجوزات متعددة الأيام تُحسب بطولها الكامل"])}>
      <Bars fmt={(v) => numTxt(v, 1)} items={pts(sumBy(bk, "technician", hrs), { label: titleL((k) => titleOf("FSM Technician", k)), drill: (k) => LS("FSM Booking", ["technician", k], ["status", "Reserved"], dayF, ["booking_end", [">=", day]]) })} empty={t("No booking on this day.", "لا حجوزات في هذا اليوم.")} />
    </Insight>
    <Insight id="dp-wait" title={["Visits waiting to be planned", "الزيارات بانتظار التخطيط"]} q={["How much work still needs a technician or a time?", "كم عملاً ما زال يحتاج فنياً أو موعداً؟"]}
      meta={M([VISIT_DT], ["One Unscheduled or Planned visit", "زيارة غير مجدولة أو مخططة"], ["Count by status", "العدد حسب الحالة"], ["Visits portfolio filtered to the status", "محفظة الزيارات مفلترة بالحالة"])}>
      <Ring items={pts(countBy(waiting, "workflow_state"), { label: (k) => opt(k, ar), order: ["Unscheduled", "Planned"], tone: (k) => (k === "Unscheduled" ? "warn" : "info"), drill: (k) => ({ to: vq({ state: k }) }) })} total={t("visits", "زيارة")} empty={t("No visits waiting.", "لا زيارات بالانتظار.")} />
    </Insight>
    <Insight id="dp-role" title={["Bookings by role", "الحجوزات حسب الدور"]} q={["How many visits have a lead and how many assistants are booked?", "كم زيارة لها فني رئيسي وكم مساعداً محجوزاً؟"]}
      meta={M(["FSM Booking"], ["One booking on the day", "حجز في اليوم"], ["Count by booking_role", "العدد حسب الدور"], ["Booking register filtered to the role", "سجل الحجوزات مفلتراً بالدور"])}>
      <Ring items={pts(countBy(bk, "booking_role"), { label: (k) => opt(k, ar), order: ["Lead", "Assistant"], drill: (k) => LS("FSM Booking", ["booking_role", k], ["status", "Reserved"], dayF, ["booking_end", [">=", day]]) })} total={t("bookings", "حجز")} empty={t("No booking on this day.", "لا حجوزات في هذا اليوم.")} />
    </Insight>
    <Insight id="dp-unav" title={["Approved unavailability", "عدم التوفر المعتمد"]} q={["Who is off or on call on this day?", "من في إجازة أو مناوبة في هذا اليوم؟"]}
      meta={M(["FSM Calendar Exception"], ["One approved calendar exception touching the day", "استثناء تقويم معتمد يمس اليوم"], ["Count by type", "العدد حسب النوع"], ["Calendar exception register filtered to the type", "سجل الاستثناءات مفلتراً بالنوع"])}>
      <Bars items={pts(countBy(unav, "exception_type"), { label: (k) => opt(k, ar), tone: (k) => (k === "On-call" ? "info" : "warn"), drill: (k) => LS("FSM Calendar Exception", ["exception_type", k], ["status", "Approved"]) })} empty={t("Everyone is available on this day.", "الجميع متاح في هذا اليوم.")} />
    </Insight>
    <Insight id="dp-month" title={["Reserved bookings by month", "الحجوزات المحجوزة حسب الشهر"]} q={["How busy has the field team been, month by month?", "ما مدى انشغال الفريق الميداني شهراً بشهر؟"]}
      meta={M(["FSM Booking"], ["One reserved booking by the month it starts", "حجز محجوز حسب شهر بدايته"], ["Count per month", "العدد لكل شهر"], ["Booking register for the month", "سجل الحجوزات للشهر"])}>
      <Cols labels={months} labelText={(m) => monthLabel(m, ar)} series={[{ name: "n", label: t("Bookings", "الحجوزات"), values: perMonth(reserved, (b) => b["booking_start"], months) }]} drill={(li) => LS("FSM Booking", ["status", "Reserved"], ["booking_start", ["between", [`${months[li]}-01 00:00:00`, `${monthEnd(months[li]!)} 23:59:59`]]])} empty={t("No reserved booking.", "لا حجوزات محجوزة.")} />
    </Insight>
    <Insight id="dp-site" title={["Bookings on this day by site", "حجوزات اليوم حسب الموقع"]} q={["Where are technicians going today?", "إلى أين يذهب الفنيون اليوم؟"]}
      meta={M(["FSM Booking", "FSM Service Site"], ["One reserved booking touching the selected day", "حجز محجوز يمس اليوم المحدد"], ["Count per site", "العدد لكل موقع"], ["Booking register filtered to the site", "سجل الحجوزات مفلتراً بالموقع"])}>
      <Bars items={pts(countBy(bk, "site"), { label: site, limit: 10, drill: (k) => LS("FSM Booking", ["site", k], ["status", "Reserved"], dayF, ["booking_end", [">=", day]]) })} empty={t("No booking on this day.", "لا حجوزات في هذا اليوم.")} />
    </Insight>
  </> };
};

const team: PFn = (c) => {
  const { t } = c;
  const st = technicianStats(facts());
  const techs = list("FSM Technician").filter((x) => s(x["status"]) !== "Inactive");
  const now = today(); const soon = addDays(now, 30);
  const skills = techs.flatMap((x) => rows(x, "skills").map((k) => ({ ...k }) as Record<string, unknown>));
  const row = (x: (typeof st)[number], v: number, extra: Record<string, string> = {}, tone?: Pt["tone"]): Pt => ({ key: x.p.technician, label: <span data-no-i18n>{x.p.name}</span>, value: v, tone, to: vq({ tech: x.p.technician, ...extra }) });
  return { scope: false, charts: <>
    <Insight id="tm-led" title={["Visits led", "الزيارات المقادة"]} q={["Who leads the most visits?", "من يقود أكثر الزيارات؟"]}
      meta={VM(["One non-cancelled visit with a lead technician", "زيارة غير ملغاة لها فني رئيسي"], ["Count per lead technician", "العدد لكل فني رئيسي"], ["Visits portfolio filtered to the technician", "محفظة الزيارات مفلترة بالفني"])}>
      <Bars items={st.slice().sort((a, b) => b.led - a.led).map((x) => row(x, x.led))} empty={t("No visit has a lead technician yet.", "لا زيارة لها فني رئيسي بعد.")} />
    </Insight>
    <Insight id="tm-rate" title={["On-time arrival rate", "نسبة الوصول في الموعد"]} q={["Who arrives on time?", "من يصل في الموعد؟"]}
      meta={VM(["One technician; visits with a recorded arrival", "فني واحد؛ زيارات بوصول مسجل"], ["on time ÷ (on time + late); technicians with no recorded arrival are not shown", "في الموعد ÷ (في الموعد + متأخر)؛ الفنيون بلا وصول مسجل لا يظهرون"], ["Visits portfolio for the technician", "محفظة الزيارات للفني"])}>
      <Bars fmt={(v) => `${numTxt(v)}%`} items={st.filter((x) => x.on_time_rate !== null).map((x) => row(x, Math.round((x.on_time_rate ?? 0) * 100), {}, (x.on_time_rate ?? 0) < 0.8 ? "warn" : "good"))} empty={t("No arrival recorded yet.", "لا وصول مسجل بعد.")} />
    </Insight>
    <Insight id="tm-late" title={["Late arrivals", "حالات الوصول المتأخر"]} q={["Whose visits start late?", "زيارات من تبدأ متأخرة؟"]}
      meta={VM(["One visit with arrived_on after scheduled_start", "زيارة وصولها بعد بداية الموعد"], ["Count per lead technician", "العدد لكل فني رئيسي"], ["Visits portfolio filtered to the technician and Late", "محفظة الزيارات مفلترة بالفني والمتأخر"])}>
      <Bars items={st.filter((x) => x.late > 0).map((x) => row(x, x.late, { arrival: "late" }, "bad"))} empty={t("No late arrival recorded.", "لا وصول متأخر مسجل.")} />
    </Insight>
    <Insight id="tm-cert" title={["Skill certificates", "شهادات المهارات"]} q={["Which certificates have expired or expire soon?", "أي الشهادات انتهت أو تنتهي قريباً؟"]}
      meta={M(["FSM Technician", "FSM Technician Skill"], ["One skill row of an active technician", "صف مهارة لفني نشط"], ["Expired / ≤30 days / valid / no date", "منتهية / خلال 30 يوماً / سارية / بلا تاريخ"], ["Certifications queue", "طابور الشهادات"], ["A skill without a validity date is not treated as certified", "المهارة بلا تاريخ صلاحية لا تُعد معتمدة"])}>
      <Bars items={pts(countBy(skills, (k) => { const d = s(k["valid_until"]); return !d ? "none" : d < now ? "expired" : d <= soon ? "soon" : "valid"; }), { order: ["expired", "soon", "valid", "none"], label: (k) => ({ expired: t("Expired", "منتهية"), soon: t("Expiring ≤30 days", "تنتهي خلال 30 يوماً"), valid: t("Valid", "سارية"), none: t("No validity date", "بلا تاريخ صلاحية") } as Record<string, string>)[k], tone: (k) => (k === "expired" ? "bad" : k === "soon" ? "warn" : k === "valid" ? "good" : "neutral"), drill: () => ({ to: "queue/certifications" }) })} empty={t("No skill is recorded.", "لا مهارات مسجلة.")} />
    </Insight>
    <Insight id="tm-crew" title={["Active technicians by crew", "الفنيون النشطون حسب الطاقم"]} q={["How is the field team organised?", "كيف يتوزع الفريق الميداني؟"]}
      meta={M(["FSM Technician"], ["One active technician", "فني نشط"], ["Count by crew", "العدد حسب الطاقم"], ["Technician register filtered to the crew", "سجل الفنيين مفلتراً بالطاقم"])}>
      <Ring items={pts(countBy(techs, (x) => s(x["crew"]) || "—"), { label: (k) => (k === "—" ? t("No crew", "بلا طاقم") : <span data-no-i18n>{k}</span>), drill: (k) => LS("FSM Technician", ["status", ["!=", "Inactive"]], ["crew", k === "—" ? ["is", "not set"] : k]) })} total={t("technicians", "فني")} empty={t("No active technician.", "لا فنيين نشطين.")} />
    </Insight>
    <Insight id="tm-terr" title={["Active technicians by territory", "الفنيون النشطون حسب المنطقة"]} q={["Do we have people where the work is?", "هل لدينا أشخاص حيث يوجد العمل؟"]}
      meta={M(["FSM Technician"], ["One active technician", "فني نشط"], ["Count by territory", "العدد حسب المنطقة"], ["Technician register filtered to the territory", "سجل الفنيين مفلتراً بالمنطقة"])}>
      <Bars items={pts(countBy(techs, (x) => s(x["territory"]) || "—"), { label: (k) => (k === "—" ? t("No territory", "بلا منطقة") : <span data-no-i18n>{k}</span>), drill: (k) => LS("FSM Technician", ["status", ["!=", "Inactive"]], ["territory", k === "—" ? ["is", "not set"] : k]) })} empty={t("No active technician.", "لا فنيين نشطين.")} />
    </Insight>
  </> };
};

const allReports: PFn = (c) => {
  const { t, ar } = c;
  const STAT: Record<string, [string, string]> = { VIRTUAL: ["Fully virtual", "افتراضي كامل"], PARTIAL: ["Partial", "جزئي"], SERVER_REQUIRED: ["Server required", "يتطلب الخادم"] };
  const tone = (k: string) => (k === "VIRTUAL" ? "good" as const : k === "PARTIAL" ? "warn" as const : "neutral" as const);
  const counts = FSM_REPORTS.map((r) => ({ r, n: R(r.id, {}).length }));
  return { scope: false, charts: <>
    <Insight id="ar-status" title={["Reports by data status", "التقارير حسب حالة البيانات"]} q={["Which reports are fully computed in the preview?", "أي التقارير محسوبة بالكامل في المعاينة؟"]}
      meta={M(["Report definitions RP01–RP20"], ["One report definition", "تعريف تقرير"], ["Count by status: virtual, partial, server required", "العدد حسب الحالة: افتراضي، جزئي، يتطلب الخادم"], ["Report catalogue below", "دليل التقارير أدناه"])}>
      <Ring items={pts(countBy(FSM_REPORTS as unknown as Record<string, unknown>[], "status"), { label: (k) => t(...(STAT[k] ?? [k, k])), order: ["VIRTUAL", "PARTIAL", "SERVER_REQUIRED"], tone })} total={t("reports", "تقرير")} empty="—" />
    </Insight>
    <Insight id="ar-kpi" title={["KPIs by data status", "المؤشرات حسب حالة البيانات"]} q={["Which metrics can be trusted in the preview?", "أي المؤشرات يمكن الوثوق بها في المعاينة؟"]}
      meta={M(["KPI contracts K01–K30"], ["One KPI contract", "عقد مؤشر"], ["Count by status", "العدد حسب الحالة"], ["KPI cards below", "بطاقات المؤشرات أدناه"])}>
      <Ring items={pts(countBy(FSM_KPIS as unknown as Record<string, unknown>[], "status"), { label: (k) => t(...(STAT[k] ?? [k, k])), order: ["VIRTUAL", "PARTIAL", "SERVER_REQUIRED"], tone })} total={t("KPIs", "مؤشر")} empty="—" />
    </Insight>
    <Insight id="ar-rows" title={["Rows per report", "الصفوف لكل تقرير"]} q={["Which reports hold data you may read now?", "أي التقارير تحمل بيانات يمكنك قراءتها الآن؟"]}
      meta={M(["RP01–RP20"], ["One report run with no filters (permitted rows only)", "تشغيل تقرير بلا مرشحات (الصفوف المسموح بها فقط)"], ["Row count per report", "عدد الصفوف لكل تقرير"], ["The report", "التقرير"])}>
      <Bars items={counts.filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 12).map((x) => ({ key: x.r.id, label: <span><span data-no-i18n>{x.r.id}</span> · {ar ? x.r.title_ar : x.r.title}</span>, value: x.n, to: `reports/${x.r.id}` }))} empty={t("No report returns rows.", "لا تقارير تعيد صفوفاً.")} />
    </Insight>
    <Insight id="ar-area" title={["Reports by business area", "التقارير حسب مجال العمل"]} q={["Where do I start for my question?", "من أين أبدأ لسؤالي؟"]}
      meta={M(["Report directory"], ["One report in a business area", "تقرير في مجال عمل"], ["Count per area", "العدد لكل مجال"], ["Analytics & reports group", "مجموعة التقارير"])}>
      <Bars items={REPORT_AREAS.map((a) => ({ key: a.key, label: ar ? a.label_ar : a.label, value: a.reports.length, to: a.key === "ops" ? "ws/rpt-manager" : a.key === "itm" || a.key === "safety" ? "ws/rpt-quality" : a.key === "contracts" || a.key === "finance" ? "ws/rpt-contracts" : `reports/${a.reports[0]}` }))} empty="—" />
    </Insight>
  </> };
};

const tradePacks: PFn = (c) => {
  const { t, ar } = c;
  const tpls = list("FSM Inspection Template"); const sys = list("FSM Service System"); const techs = list("FSM Technician").filter((x) => s(x["status"]) !== "Inactive");
  const ready = new Set(tpls.filter((p) => s(p["status"]) === "Active").map((p) => s(p["system_type"])));
  return { scope: false, charts: <>
    <Insight id="tp-ready" title={["Installed systems by readiness", "الأنظمة المركبة حسب الجاهزية"]} q={["Can every installed system type be inspected?", "هل يمكن فحص كل نوع نظام مركب؟"]}
      meta={M(["FSM Service System", "FSM Inspection Template"], ["One installed system → its system type", "نظام مركب ← نوعه"], ["Systems whose type has an Active template vs none", "أنظمة لنوعها قالب نشط مقابل بلا قالب"], ["System register filtered to the type", "سجل الأنظمة مفلتراً بالنوع"])}>
      <Stack legend={[{ key: "r", label: t("Active template", "قالب نشط"), tone: "good" }, { key: "n", label: t("No active template", "بلا قالب نشط"), tone: "bad" }]} rows={SYSTEM_TYPES.map((k) => { const n = sys.filter((x) => s(x["system_type"]) === k).length; return { key: k, label: opt(k, ar), segs: [{ key: "r", value: ready.has(k) ? n : 0, ...LS("FSM Service System", ["system_type", k]) }, { key: "n", value: ready.has(k) ? 0 : n, ...LS("FSM Service System", ["system_type", k]) }] }; })} empty={t("No installed system.", "لا أنظمة مركبة.")} />
    </Insight>
    <Insight id="tp-skill" title={["Qualified technicians per skill", "الفنيون المؤهلون لكل مهارة"]} q={["Do we have people for each trade?", "هل لدينا أشخاص لكل تخصص؟"]}
      meta={M(["FSM Technician", "FSM Technician Skill"], ["One active technician holding the skill", "فني نشط يحمل المهارة"], ["Count per skill (any validity)", "العدد لكل مهارة (بأي صلاحية)"], ["Technician register", "سجل الفنيين"], ["Certificate validity is checked at booking time", "صلاحية الشهادة تُفحص عند الحجز"])}>
      <Bars items={SKILLS.map((k) => ({ key: k, label: opt(k, ar), value: techs.filter((x) => rows(x, "skills").some((r) => s(r["skill"]) === k)).length, ...LS("FSM Technician", ["status", "Active"]) }))} empty={t("No technician skill.", "لا مهارات فنيين.")} />
    </Insight>
    <Insight id="tp-tpl" title={["Inspection templates by status", "قوالب الفحص حسب الحالة"]} q={["Which templates are in force?", "أي القوالب سارية؟"]}
      meta={M(["FSM Inspection Template"], ["One inspection template", "قالب فحص"], ["Count by status", "العدد حسب الحالة"], ["Template register filtered to the status", "سجل القوالب مفلتراً بالحالة"])}>
      <Ring items={pts(countBy(tpls, "status"), { label: (k) => opt(k, ar), order: ["Active", "Draft", "Superseded"], tone: (k) => (k === "Active" ? "good" : k === "Draft" ? "warn" : "neutral"), drill: (k) => LS("FSM Inspection Template", ["status", k]) })} total={t("templates", "قالب")} empty={t("No inspection template.", "لا قوالب فحص.")} />
    </Insight>
    <Insight id="tp-checks" title={["Checks per active template", "البنود لكل قالب نشط"]} q={["How detailed is each inspection?", "ما مدى تفصيل كل فحص؟"]}
      meta={M(["FSM Inspection Template", "FSM Template Check"], ["One Active template", "قالب نشط"], ["Number of check rows", "عدد صفوف البنود"], ["The template", "القالب"])}>
      <Bars items={tpls.filter((x) => s(x["status"]) === "Active").map((x): Pt => ({ key: x.name, label: <span data-no-i18n>{s(x["template_name"]) || x.name}</span>, value: rows(x, "checks").length, ...LS("FSM Inspection Template", ["name", x.name]) }))} empty={t("No active template.", "لا قوالب نشطة.")} />
    </Insight>
  </> };
};

const policies: PFn = (c) => {
  const { t, ar } = c;
  const defs = list("FSM Deficiency"); const rts = list("FSM Retest");
  return { scope: false, charts: <>
    <Insight id="pl-state" title={["Findings by stage", "الملاحظات حسب المرحلة"]} q={["How are the closure rules playing out?", "كيف تُطبق قواعد الإغلاق؟"]}
      meta={M(["FSM Deficiency"], ["One finding", "ملاحظة"], ["Count by workflow stage; Verified Closed requires a passed retest", "العدد حسب المرحلة؛ الإغلاق الموثق يتطلب إعادة فحص ناجحة"], ["Finding register filtered to the stage", "سجل الملاحظات مفلتراً بالمرحلة"])}>
      <Bars items={pts(countBy(defs, "workflow_state"), { label: (k) => opt(k, ar), order: ["Open", "Quoted", "Approved for Repair", "Retest Pending", "Disputed", "Verified Closed", "Rejected", "Duplicate"], tone: (k) => (k === "Verified Closed" ? "good" : k === "Open" || k === "Disputed" ? "warn" : undefined), drill: (k) => LS("FSM Deficiency", ["workflow_state", k]) })} empty={t("No finding recorded.", "لا ملاحظات مسجلة.")} />
    </Insight>
    <Insight id="pl-retest" title={["Retest outcomes", "نتائج إعادة الفحص"]} q={["How often does a repair pass its retest?", "كم مرة ينجح الإصلاح في إعادة الفحص؟"]}
      meta={M(["FSM Retest"], ["One retest", "إعادة فحص"], ["Count by status", "العدد حسب الحالة"], ["Retest register filtered to the status", "سجل إعادات الفحص مفلتراً بالحالة"])}>
      <Ring items={pts(countBy(rts, "status"), { label: (k) => opt(k, ar), order: ["Required", "Scheduled", "Passed", "Failed"], tone: (k) => (k === "Passed" ? "good" : k === "Failed" ? "bad" : "warn"), drill: (k) => LS("FSM Retest", ["status", k]) })} total={t("retests", "إعادة")} empty={t("No retest recorded.", "لا إعادات فحص مسجلة.")} />
    </Insight>
  </> };
};

export const PAGE_OVERVIEWS: Record<string, PFn> = {
  my, control, management, exceptions, "site-explorer": siteExplorer, sites: sitesP, "ops-center": opsCenter, visits: visitsP, "late-visits": lateP,
  dispatch, team, "all-reports": allReports, "trade-packs": tradePacks, policies,
};

/** One more block of a dedicated page (KPI cards, a register, a table): placed after the insights in the same designer. */
export type PageBlock = { id: string; title: [string, string]; node: ReactNode; meaning?: [string, string]; first?: boolean };
type PageCtx = { charts: ReactNode; blocks: Record<string, ReactNode> };

/**
 * Insight block of a dedicated page. `F` overrides the URL scope (e.g. the executive page's default period).
 * ONE STANDARD R9 (owner 2026-11-13 §2d): the page's other content — KPI cards, registers, tables — is passed as
 * `blocks`, so the whole page is one shared Dashboard Designer (block menu on every block, Customise, saved per user)
 * and nothing sits outside it; the blocks render exactly what the page rendered before.
 */
export function PageInsights({ k, F: forced, blocks = [] }: { k: string; F?: Filters | undefined; blocks?: PageBlock[] }) {
  const fx = useFx(); const [f] = useUrlState();
  const fn = PAGE_OVERVIEWS[k]; if (!fn) return null;
  const spec = fn({ fx, t: fx.t, ar: fx.ar, F: forced ?? scopeOf(f), url: f });
  const ctx: PageCtx = { charts: spec.charts, blocks: Object.fromEntries(blocks.map((b) => [b.id, b.node])) };
  return <div data-page-insights={k}>{spec.scope !== false && <ScopeBar {...(spec.scope ? { fields: spec.scope } : {})} />}<DashboardDesigner def={pageInsightsDef(k, blocks)} ctx={ctx} /></div>;
}
const PAGE_DEFS = new Map<string, DashboardDef<PageCtx>>();
function pageInsightsDef(k: string, blocks: PageBlock[]): DashboardDef<PageCtx> {
  const key = `${k}|${blocks.map((b) => b.id).join(",")}`;
  let def = PAGE_DEFS.get(key);
  if (!def) {
    const blockW = (b: PageBlock): DashboardDef<PageCtx>["widgets"][number] => ({
      id: b.id, version: 1, title: b.title, meaning: b.meaning ?? b.title,
      sources: [], shape: "panel", defaultView: "panel", size: { w: 12 }, render: (c) => <div className="mb-4 min-w-0" data-page-block={b.id}>{c.blocks[b.id]}</div>,
    });
    def = { app: "digit_fsm", id: `page:${k}`, title: ["Insights", "التحليلات"], widgets: [...blocks.filter((b) => b.first).map(blockW), {
      id: "insights", version: 1, title: ["Insights", "التحليلات"], meaning: ["Source-backed charts of this page; every mark opens the records it counts.", "تحليلات هذه الصفحة من مصادرها؛ كل علامة تفتح السجلات التي تعدّها."],
      sources: [], shape: "panel", defaultView: "panel", size: { w: 12 }, render: (c) => <InsightGrid>{c.charts}</InsightGrid>,
    }, ...blocks.filter((b) => !b.first).map(blockW)] };
    PAGE_DEFS.set(key, def);
  }
  return def;
}

export { sum };
