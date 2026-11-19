/**
 * NB-2/NB-3 Talent depth: 02.2 onboarding activity board (owner, native task window, task status, guarded actions) and
 * 02.4 skills matrix (held skills from Employee Skill Map). Scoped reads only; every action goes through
 * plugins/digit_hr/onboarding.ts and reads back from the adapter. URL state: ?onb, ?mine (02.2) and ?sd (02.4).
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HrContextInspector, HrInsightPanel, HrOperationalKpi, Meter, Pill, useSearchPatch, type Tone } from "@/components/digithr/home/kit";
import { todayIso } from "@/components/digithr/Record360Kit";
import { enterHrNative } from "@/components/digithr/HrNav";
import { assertScoped, scopedGet } from "@/plugins/digit_hr/compat/scope";
import { currentUser } from "@/plugins/digit_hr/compat/session";
import { applyOnboardingTemplate, assignActivityOwner, onboardingPlan, onboardingProgress, startOnboardingTask, type ActivityState, type PlanRow } from "@/plugins/digit_hr/onboarding";
import { skillsMatrix } from "@/plugins/digit_hr/skills";
import { cycleCompletion, type AppraiseeStage } from "@/plugins/digit_hr/performance";
import { activeCycle, appraisalDraft, mayDraftAppraisal } from "@/plugins/digit_hr/talentQueues";
import { eventCompletion, mayStartTrainingResult, resultBlocker, startTrainingResult } from "@/plugins/digit_hr/training";
import { DateRange, Native, arLabel, s, useSources, type Sources } from "./shared";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

type Tx = (ar: string, en: string) => string;
type Search = Record<string, unknown>;
const useSearch = () => useRouterState({ select: (r) => r.location.search as Search });
const str = (v: unknown) => (typeof v === "string" ? v : "");
const label = (tx: Tx, v: string) => tx(arLabel(v), v);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapter rows are untyped JSON documents
type Row = any;
const can = (dt: string, ptype: "write" | "create", doc?: Row) => { try { assertScoped(dt, ptype, doc); return true; } catch { return false; } };
function Notice({ src, dts }: { src: Sources; dts: string[] }) { return src.worst(...dts) ? <div className="py-2">{src.empty(...dts)}</div> : null; }

/* ================================================================ 02.2 onboarding board */

const STATE: Record<ActivityState, { ar: string; en: string; tone: Tone }> = {
  done: { ar: "مكتمل", en: "Done", tone: "success" },
  overdue: { ar: "متأخر", en: "Overdue", tone: "danger" },
  "due-soon": { ar: "يستحق خلال 7 أيام", en: "Due within 7 days", tone: "warn" },
  "in-progress": { ar: "قيد التنفيذ", en: "In progress", tone: "info" },
  scheduled: { ar: "مجدول", en: "Scheduled", tone: "neutral" },
  "no-task": { ar: "بلا مهمة", en: "No task yet", tone: "warn" },
  "task-hidden": { ar: "مهمة غير متاحة لك", en: "Task not visible to you", tone: "neutral" },
};
const TASK_STATUS: Record<string, string> = { Open: "مفتوحة", Working: "قيد العمل", "Pending Review": "بانتظار المراجعة", Overdue: "متأخرة", Completed: "مكتملة", Cancelled: "ملغاة", Template: "قالب" };

export function OnboardingBoard({ tx }: { tx: Tx }) {
  const src = useSources(tx); const search = useSearch(); const patch = useSearchPatch();
  const DTS = ["Employee Onboarding", "Task"];
  const today = todayIso(); const me = currentUser();
  const status = (t: string) => { const r: Row = scopedGet("Task", t); return r ? s(r.status) || "Open" : undefined; };
  const list = src.rows("Employee Onboarding").filter((o) => Number(o.docstatus) !== 2).sort((a, b) => s(a.date_of_joining).localeCompare(s(b.date_of_joining)));
  const plans = new Map(list.map((o) => [s(o.name), onboardingPlan(o, status, today)]));
  const allRows = [...plans.values()].flat();
  const mine = str(search["mine"]) === "1";
  const myRows = list.flatMap((o) => (plans.get(s(o.name)) ?? []).filter((r) => r.user === me).map((r) => ({ o, r })));
  const sel = str(search["onb"]); const cur = list.find((o) => s(o.name) === sel);
  const active = list.filter((o) => Number(o.docstatus) === 1 && s(o.boarding_status) !== "Completed").length;
  const noTask = list.filter((o) => Number(o.docstatus) === 1).flatMap((o) => plans.get(s(o.name)) ?? []).filter((r) => !r.task).length;
  return (
    <HrInsightPanel data-onboarding-board title={tx("لوحة مهام التهيئة", "Onboarding activity board")}
      meta={tx("كل نشاط بمسؤوله ونافذته الزمنية وحالة مهمته الأصلية. الإجراءات تحفظ في المستند الأصلي وتُقرأ منه.", "Each activity with its owner, time window and native task status. Actions save to the native document and read back from it.")}
      info={tx("النافذة = بداية التهيئة + «يبدأ بعد (أيام)» حتى + «المدة». لا يُطبَّق ترحيل العطل. إنشاء المشروع وإسناد المهام والإشعارات وتحديث حالة التهيئة تتم على الخادم.", "Window = onboarding start + “begin on (days)” through + “duration”. Holiday shifting is not applied. Project creation, task assignment, notifications and onboarding status roll-up happen on the server.")}
      toolbar={<div className="flex flex-wrap gap-1.5" role="group" aria-label={tx("العرض", "View")}>
        <Button variant="ghost" className="dhr-filter" aria-pressed={!mine} onClick={() => patch({ mine: undefined })}>{tx("كل التهيئات", "All onboardings")} <b data-no-i18n>{list.length}</b></Button>
        <Button variant="ghost" className="dhr-filter" aria-pressed={mine} data-onb-mine onClick={() => patch({ mine: mine ? undefined : "1", onb: undefined })}>{tx("أنشطتي", "My activities")} <b data-no-i18n>{myRows.length}</b></Button>
      </div>}>
      {!src.ready(...DTS) ? <Notice src={src} dts={DTS} /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-onb-kpis>
            <HrOperationalKpi label={tx("تهيئة جارية (معتمدة)", "Onboarding in progress (submitted)")} value={active} source="Employee Onboarding docstatus=1, boarding_status≠Completed" />
            <HrOperationalKpi label={tx("أنشطة متأخرة", "Overdue activities")} value={<span data-onb-overdue>{allRows.filter((r) => r.state === "overdue").length}</span>} tone={allRows.some((r) => r.state === "overdue") ? "danger" : undefined} source="Employee Boarding Activity window < today, task not Completed" />
            <HrOperationalKpi label={tx("أنشطة بلا مسؤول", "Activities without owner")} value={allRows.filter((r) => !r.user && !r.role).length} source="Employee Boarding Activity user and role empty" />
            <HrOperationalKpi label={tx("أنشطة معتمدة بلا مهمة", "Submitted activities without task")} value={<span data-onb-notask>{noTask}</span>} source="Employee Boarding Activity.task empty on a submitted onboarding" />
          </div>
          {mine ? <MyActivities rows={myRows} tx={tx} onOpen={(n) => patch({ onb: n, mine: undefined })} />
            : list.length === 0 ? <p className="dhr-empty" data-onb-empty>{tx("لا توجد تهيئة بعد. تبدأ التهيئة من عرض وظيفي مقبول في ملف المتقدم.", "No onboarding yet. Onboarding starts from an accepted job offer on the applicant profile.")}</p>
            : <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
                <ul className="divide-y divide-[var(--dhr-sep)] rounded-[var(--dhr-r-sm)] border border-[var(--dhr-sep)]" data-onb-list>
                  {list.map((o) => { const plan = plans.get(s(o.name)) ?? []; const pr = onboardingProgress(plan); const late = plan.filter((r) => r.state === "overdue").length; return (
                    <li key={s(o.name)}>
                      <button type="button" className="dhr-treerow !min-h-14 flex-col !items-stretch" aria-current={sel === s(o.name)} data-onb={s(o.name)} onClick={() => patch({ onb: sel === s(o.name) ? undefined : s(o.name) })}>
                        <span className="flex items-center justify-between gap-2"><span className="truncate font-medium">{label(tx, s(o.employee_name))}</span><Pill tone={Number(o.docstatus) === 0 ? "warn" : "info"}>{Number(o.docstatus) === 0 ? tx("مسودة", "Draft") : label(tx, s(o.boarding_status) || "Pending")}</Pill></span>
                        <span className="flex items-center gap-2 text-[11.5px] text-[var(--dhr-muted)]"><span>{tx("المباشرة", "Joining")} <bdi dir="ltr" data-no-i18n>{s(o.date_of_joining) || "…"}</bdi></span>{late > 0 && <Pill tone="danger">{tx(`${late} متأخر`, `${late} overdue`)}</Pill>}</span>
                        <span className="flex items-center gap-2"><Meter value={pr.pct} max={100} tone={late ? "warn" : "success"} label={`${pr.pct}%`} /><span className="text-[11px] dhr-tnum" data-no-i18n>{pr.done}/{pr.total}</span></span>
                      </button>
                    </li>); })}
                </ul>
                {cur ? <OnboardingDetail onb={cur} plan={plans.get(s(cur.name)) ?? []} tx={tx} src={src} onClose={() => patch({ onb: undefined })} />
                  : <div className="dhr-empty self-center text-center" data-onb-pick>{tx("اختر تهيئة لعرض أنشطتها ومسؤوليها ومهامها.", "Pick an onboarding to see its activities, owners and tasks.")}</div>}
              </div>}
        </div>
      )}
    </HrInsightPanel>
  );
}

function OwnerText({ r, tx }: { r: PlanRow; tx: Tx }) {
  if (r.user) return <span data-no-i18n>{r.user === "Administrator" ? tx("مدير النظام", "Administrator") : r.user}</span>;
  if (r.role) return <span>{tx("الدور:", "Role:")} {label(tx, r.role)}</span>;
  return <Pill tone="warn">{tx("بلا مسؤول", "No owner")}</Pill>;
}

function OnboardingDetail({ onb, plan, tx, src, onClose }: { onb: Row; plan: PlanRow[]; tx: Tx; src: Sources; onClose: () => void }) {
  const name = s(onb.name); const draft = Number(onb.docstatus) === 0; const submitted = Number(onb.docstatus) === 1;
  const writable = can("Employee Onboarding", "write", onb); const taskCreate = can("Task", "create");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tpl, setTpl] = useState("");
  const users = src.rows("User").map((u) => s(u.name)).filter((u) => u && u !== "Guest");
  const templates = src.rows("Employee Onboarding Template");
  const run = (fn: () => unknown, ok: string) => { if (busy) return; setBusy(true); setMsg(null); try { fn(); setMsg({ tone: "ok", text: ok }); } catch (e) { setMsg({ tone: "err", text: (e as Error).message }); } finally { setBusy(false); } };
  const pr = onboardingProgress(plan);
  return (
    <HrContextInspector tx={tx} title={label(tx, s(onb.employee_name))} subtitle={<span className="flex flex-wrap items-center gap-2"><span className="dhr-code" data-no-i18n>{name}</span>{s(onb.designation) && <span>{label(tx, s(onb.designation))}</span>}<span>{tx("بداية التهيئة", "Onboarding begins")} <bdi dir="ltr" data-no-i18n>{s(onb.boarding_begins_on) || "…"}</bdi></span></span>} onClose={onClose}
      actions={<><Native dt="Employee Onboarding" name={name} module="02" className="dhr-act dhr-act-sm">{tx("فتح المستند الأصلي", "Open native document")}</Native>{s(onb.job_applicant) && <Link to="/digit-hr/applicants/$name" params={{ name: s(onb.job_applicant) }} className="dhr-act dhr-act-sm">{tx("ملف المتقدم", "Applicant profile")}</Link>}</>}>
      <div className="space-y-3" data-onb-detail={name}>
        <div className="flex flex-wrap items-center gap-3 text-[12.5px]"><Meter value={pr.pct} max={100} tone="success" label={`${pr.pct}%`} /><span data-onb-progress={pr.pct}>{tx(`${pr.pct}% مكتمل`, `${pr.pct}% complete`)}</span><span className="text-[var(--dhr-muted)]">{pr.weighted ? tx("موزون بوزن المهام", "weighted by task weight") : tx("حسب عدد الأنشطة", "by activity count")}</span></div>
        {msg && <p role={msg.tone === "err" ? "alert" : "status"} className={msg.tone === "err" ? "dhr-alert text-sm" : "text-[12.5px] text-[var(--dhr-emerald)]"} data-onb-msg={msg.tone}>{msg.text}</p>}
        {plan.length === 0 ? (
          <div className="space-y-2" data-onb-noacts>
            <p className="dhr-empty">{tx("لا توجد أنشطة في هذه التهيئة.", "This onboarding has no activities.")}</p>
            {draft && writable && templates.length > 0 && <div className="flex flex-wrap items-center gap-2">
              <select className="field-input" value={tpl} onChange={(e) => setTpl(e.target.value)} aria-label={tx("قالب التهيئة", "Onboarding template")} data-onb-template-select>
                <option value="">{tx("اختر قالباً…", "Choose a template…")}</option>
                {templates.map((t) => <option key={s(t.name)} value={s(t.name)}>{label(tx, s(t.title) || s(t.name))}</option>)}
              </select>
              <Button variant="outline" disabled={!tpl || busy} data-onb-apply-template onClick={() => run(() => applyOnboardingTemplate(name, tpl), tx("نُسخت أنشطة القالب إلى المسودة.", "Template activities copied to the draft."))}>{tx("تطبيق القالب", "Apply template")}</Button>
            </div>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]" data-onb-activities>
              <thead><tr><th>{tx("النشاط", "Activity")}</th><th>{tx("المسؤول", "Owner")}</th><th>{tx("النافذة", "Window")}</th><th>{tx("المهمة", "Task")}</th><th>{tx("الحالة", "State")}</th></tr></thead>
              <tbody>{plan.map((r) => (
                <tr key={r.index} className="border-t align-top" data-onb-activity={r.index} data-state={r.state}>
                  <td className="py-2"><div className="font-medium" data-no-i18n>{label(tx, r.activity)}</div>{r.required && <div className="text-[11px] text-[var(--dhr-muted)]">{tx("مطلوب قبل إنشاء الموظف", "Required before employee creation")}</div>}</td>
                  <td className="py-2">{draft && writable ? (
                    <select className="field-input max-w-[13rem]" value={r.user} aria-label={tx(`مسؤول ${r.activity}`, `Owner of ${r.activity}`)} data-onb-owner={r.index} disabled={busy}
                      onChange={(e) => run(() => assignActivityOwner(name, r.index, e.target.value), tx("حُفظ المسؤول في المسودة.", "Owner saved on the draft."))}>
                      <option value="">{r.role ? tx(`الدور: ${arLabel(r.role)}`, `Role: ${r.role}`) : "—"}</option>
                      {[...new Set(["Administrator", ...users, ...(r.user ? [r.user] : [])])].map((u) => <option key={u} value={u}>{u === "Administrator" ? tx("مدير النظام", "Administrator") : u}</option>)}
                    </select>) : <OwnerText r={r} tx={tx} />}</td>
                  <td className="py-2">{r.start ? <DateRange from={r.start} to={r.due} /> : <span className="text-[var(--dhr-muted)]">—</span>}</td>
                  <td className="py-2">{r.task ? (r.state === "task-hidden" ? <span className="dhr-code" data-no-i18n>{r.task}</span> : <Link to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: "erpnext", doctype: "task", name: r.task }} onClick={() => enterHrNative("02.2")} className="dhr-link" data-onb-task={r.task}><span className="dhr-code" data-no-i18n>{r.task}</span> · {tx(TASK_STATUS[r.taskStatus] ?? r.taskStatus, r.taskStatus)}</Link>)
                    : submitted && writable && taskCreate ? <Button variant="ghost" className="dhr-act dhr-act-sm" disabled={busy} data-onb-create-task={r.index} onClick={() => run(() => startOnboardingTask(name, r.index), tx("أُنشئت المهمة الأصلية وارتبطت بالنشاط.", "Native task created and linked to the activity."))}>{tx("إنشاء المهمة", "Create task")}</Button>
                    : <span className="text-[11.5px] text-[var(--dhr-muted)]">{draft ? tx("تُنشأ بعد اعتماد التهيئة", "Created after the onboarding is submitted") : "—"}</span>}</td>
                  <td className="py-2"><Pill tone={STATE[r.state].tone}>{tx(STATE[r.state].ar, STATE[r.state].en)}</Pill></td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
        {submitted && <p className="text-[11px] text-[var(--dhr-muted)]">{tx("تغيير مسؤول مهمة قائمة يتم بالإسناد على المهمة الأصلية (الخادم). تحديث حالة التهيئة من تقدم المهام يتم على الخادم.", "Changing the owner of an existing task is an assignment on the native task (server). The onboarding status roll-up from task progress happens on the server.")}</p>}
      </div>
    </HrContextInspector>
  );
}

function MyActivities({ rows, tx, onOpen }: { rows: { o: Row; r: PlanRow }[]; tx: Tx; onOpen: (name: string) => void }) {
  if (!rows.length) return <p className="dhr-empty" data-onb-mine-empty>{tx("لا توجد أنشطة تهيئة مسندة إليك بالاسم.", "No onboarding activities are assigned to you by name.")}</p>;
  return <ul className="divide-y divide-[var(--dhr-sep)] rounded-[var(--dhr-r-sm)] border border-[var(--dhr-sep)]" data-onb-mine-list>{rows.map(({ o, r }) => (
    <li key={`${s(o.name)}-${r.index}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px]">
      <span className="min-w-0"><span className="font-medium" data-no-i18n>{label(tx, r.activity)}</span> <span className="text-[var(--dhr-muted)]">· {label(tx, s(o.employee_name))}</span></span>
      <span className="flex items-center gap-2">{r.due && <bdi dir="ltr" className="text-[12px] text-[var(--dhr-muted)]" data-no-i18n>{r.due}</bdi>}<Pill tone={STATE[r.state].tone}>{tx(STATE[r.state].ar, STATE[r.state].en)}</Pill><Button variant="ghost" className="dhr-act dhr-act-sm" onClick={() => onOpen(s(o.name))}>{tx("فتح", "Open")}</Button></span>
    </li>))}</ul>;
}

/* ================================================================ 02.4 skills matrix */

function StarCell({ v, tx }: { v: number | null; tx: Tx }) {
  if (v === null) return <span className="text-[var(--dhr-muted)]" title={tx("مسجّل بلا تقييم", "Recorded without rating")}>○</span>;
  const full = Math.round(v);
  return <span role="img" aria-label={tx(`${v} من 5`, `${v} of 5`)} title={`${v}/5`} className="whitespace-nowrap tracking-tight" data-stars={v}><span className="text-[var(--dhr-emerald)]">{"●".repeat(full)}</span><span className="text-[var(--dhr-border)]">{"●".repeat(5 - full)}</span></span>;
}

export function SkillsMatrixPanel({ tx }: { tx: Tx }) {
  const src = useSources(tx); const search = useSearch(); const patch = useSearchPatch();
  const DTS = ["Employee Skill Map", "Employee"];
  const emps = src.rows("Employee");
  const desigs = [...new Set(emps.filter((e) => s(e.status || "Active") === "Active").map((e) => s(e.designation)).filter(Boolean))].sort();
  const mapped = new Set(src.rows("Employee Skill Map").map((m) => s(m.employee)));
  const withMaps = desigs.filter((d) => emps.some((e) => s(e.designation) === d && mapped.has(s(e.name))));
  const asked = str(search["sd"]);
  const sd = asked && desigs.includes(asked) ? asked : withMaps[0] ?? "";
  const m = skillsMatrix(src.rows("Employee Skill Map"), emps, sd);
  return (
    <HrInsightPanel data-skills-matrix title={tx("مصفوفة المهارات", "Skills matrix")}
      meta={tx("المهارات المسجلة لكل موظف من خريطة مهارات الموظف، حسب المسمى الوظيفي.", "Skills recorded per employee in the Employee Skill Map, by designation.")}
      info={tx("التقييم من حقل الإتقان (5 نقاط) وآخر تاريخ تقييم. قائمة المهارات المطلوبة لكل مسمى غير موجودة في الكتالوج المجمّد (حقل مخصص في DIGIT HR)، لذلك لا تُعرض فجوة مقابل متطلبات مفترضة.", "Rating from the proficiency field (5 points) with the latest evaluation date. A required-skill list per designation is not in the frozen catalog (an DIGIT HR custom field), so no gap against assumed requirements is shown.")}
      actions={<label className="flex items-center gap-2 text-[12.5px]"><span className="text-[var(--dhr-muted)]">{tx("المسمى", "Designation")}</span>
        <select className="field-input" value={sd} onChange={(e) => patch({ sd: e.target.value || undefined })} aria-label={tx("المسمى الوظيفي", "Designation")} data-skills-designation data-no-i18n>
          {desigs.map((d) => <option key={d} value={d}>{label(tx, d)}{mapped.size && withMaps.includes(d) ? "" : tx(" (بلا خرائط)", " (no maps)")}</option>)}
        </select></label>}>
      {!src.ready(...DTS) ? <Notice src={src} dts={DTS} /> : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2" data-skills-kpis>
            <HrOperationalKpi label={tx("موظفون نشطون بالمسمى", "Active employees in designation")} value={m.population} source="Employee status=Active, designation" />
            <HrOperationalKpi label={tx("لديهم خريطة مهارات", "With a skill map")} value={<span data-skills-mapped>{m.people.length}/{m.population}</span>} tone={m.population && m.people.length < m.population ? "warn" : undefined} source="Employee Skill Map.employee" />
            <HrOperationalKpi label={tx("مهارات مسجلة", "Skills recorded")} value={m.skills.length} source="Employee Skill.skill" />
          </div>
          {m.people.length === 0 ? <p className="dhr-empty" data-skills-empty>{tx("لا توجد خرائط مهارات لموظفي هذا المسمى.", "No skill maps for employees with this designation.")}</p> : (
            <div className="overflow-x-auto rounded-[var(--dhr-r-sm)] border border-[var(--dhr-sep)]">
              <table className="w-full min-w-[560px] text-[13px]" data-skills-table>
                <thead><tr><th className="text-start">{tx("الموظف", "Employee")}</th>{m.skills.map((k) => <th key={k.skill} className="text-center" data-skill-col={k.skill}><Native dt="Skill" name={k.skill} module="02" className="hover:underline">{label(tx, k.skill)}</Native><div className="text-[10.5px] font-normal text-[var(--dhr-muted)]" data-no-i18n>{k.avg !== null ? tx(`${k.holders} موظف · متوسط ${k.avg}/5`, `${k.holders} people · avg ${k.avg}/5`) : tx(`${k.holders} موظف`, `${k.holders} people`)}</div></th>)}<th>{tx("آخر تقييم", "Last evaluation")}</th><th>{tx("تدريبات", "Trainings")}</th></tr></thead>
                <tbody>{m.people.map((p) => (
                  <tr key={p.employee} className="border-t" data-skills-row={p.employee}>
                    <td className="py-1.5"><Link to="/digit-hr/employees/$name" params={{ name: p.employee }} className="dhr-link">{label(tx, p.name)}</Link></td>
                    {m.skills.map((k) => <td key={k.skill} className="text-center">{p.cells[k.skill] ? <span title={p.cells[k.skill]!.date}><StarCell v={p.cells[k.skill]!.stars} tx={tx} /></span> : <span className="text-[var(--dhr-muted)]" aria-label={tx("غير مسجل", "Not recorded")}>—</span>}</td>)}
                    <td className="text-center"><bdi dir="ltr" data-no-i18n>{p.lastEval || "—"}</bdi></td>
                    <td className="text-center"><Native dt="Employee Skill Map" name={p.map} module="02" className="dhr-link dhr-tnum">{p.trainings}</Native></td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
          {m.withoutMap.length > 0 && <p className="text-[12.5px]" data-skills-without><span className="text-[var(--dhr-muted)]">{tx("بلا خريطة مهارات:", "No skill map:")}</span> {m.withoutMap.map((e, i) => <span key={e.employee}>{i ? tx("، ", ", ") : ""}<Link to="/digit-hr/employees/$name" params={{ name: e.employee }} className="dhr-link" data-no-i18n>{label(tx, e.name)}</Link></span>)}</p>}
        </div>
      )}
    </HrInsightPanel>
  );
}

/* ================================================================ 02.3 appraisal cycle completion */

const STAGE: Record<AppraiseeStage, { ar: string; en: string; tone: Tone }> = {
  "not-started": { ar: "لم يبدأ", en: "Not started", tone: "warn" },
  draft: { ar: "مسودة تقييم", en: "Appraisal draft", tone: "info" },
  submitted: { ar: "معتمد", en: "Submitted", tone: "success" },
};

export function CycleCompletionPanel({ tx }: { tx: Tx }) {
  const src = useSources(tx); const search = useSearch(); const patch = useSearchPatch();
  const DTS = ["Appraisal Cycle", "Appraisal"];
  const cycles = src.rows("Appraisal Cycle").filter((c) => Number(c.docstatus ?? 0) !== 2).sort((a, b) => (activeCycle(b) ? 1 : 0) - (activeCycle(a) ? 1 : 0) || s(b.start_date).localeCompare(s(a.start_date)));
  const asked = str(search["cyc"]); const cycle = cycles.find((c) => s(c.name) === asked) ?? cycles[0];
  const comp = cycle ? cycleCompletion(cycle, src.rows("Appraisal"), src.rows("Employee Performance Feedback"), src.rows("Goal")) : null;
  const open = !!cycle && activeCycle(cycle);
  const canCreate = can("Appraisal", "create");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const draft = (emp: string) => { setMsg(null); try { const r = appraisalDraft(s(cycle!.name), emp); setMsg({ tone: "ok", text: r.created ? tx("أُنشئت مسودة التقييم الأصلية.", "Native appraisal draft created.") : tx("يوجد تقييم لهذا الموظف في الدورة؛ لم يُنشأ مكرر.", "An appraisal already exists for this employee in the cycle; no duplicate created.") }); } catch (e) { setMsg({ tone: "err", text: (e as Error).message }); } };
  const max = comp ? Math.max(1, ...comp.histogram) : 1;
  return (
    <HrInsightPanel data-cycle-completion title={tx("اكتمال دورة التقييم", "Appraisal cycle completion")}
      meta={tx("المُقيَّمون في الدورة ← تقييمهم ← الاعتماد، مع الملاحظات والأهداف المرتبطة.", "Appraisees in the cycle → their appraisal → submission, with linked feedback and goals.")}
      info={tx("الاكتمال = التقييمات المعتمدة ÷ المُقيَّمين المدرجين في الدورة. الدرجة تُعرض كما سُجلت في التقييم المعتمد (0–5) دون تصنيف أو معايرة أو أثر على الأجر.", "Completion = submitted appraisals ÷ appraisees listed on the cycle. The score is shown as recorded on the submitted appraisal (0–5), with no banding, calibration or pay effect.")}
      actions={cycles.length > 0 ? <label className="flex items-center gap-2 text-[12.5px]"><span className="text-[var(--dhr-muted)]">{tx("الدورة", "Cycle")}</span>
        <select className="field-input" value={cycle ? s(cycle.name) : ""} onChange={(e) => { setMsg(null); patch({ cyc: e.target.value || undefined }); }} aria-label={tx("دورة التقييم", "Appraisal cycle")} data-cycle-select>
          {cycles.map((c) => <option key={s(c.name)} value={s(c.name)}>{s(c.cycle_name) || s(c.name)} · {label(tx, s(c.status) || "Not Started")}</option>)}
        </select></label> : undefined}>
      {!src.ready(...DTS) ? <Notice src={src} dts={DTS} /> : !cycle || !comp ? <p className="dhr-empty">{tx("لا توجد دورات تقييم.", "No appraisal cycles.")}</p> : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-cycle-kpis>
            <HrOperationalKpi label={tx("المُقيَّمون", "Appraisees")} value={comp.rows.length} source="Appraisal Cycle.appraisees" />
            <HrOperationalKpi label={tx("بدأ تقييمهم", "Started")} value={comp.started} source="Appraisal (not cancelled) per appraisee" />
            <HrOperationalKpi label={tx("معتمد", "Submitted")} value={<span data-cycle-pct={comp.pct}>{comp.submitted} · {comp.pct}%</span>} sub={<Meter value={comp.submitted} max={comp.rows.length} tone="success" label={`${comp.pct}%`} />} source="Appraisal docstatus=1" />
            <HrOperationalKpi label={tx("فترة الدورة", "Cycle period")} value={<DateRange from={cycle.start_date} to={cycle.end_date} className="text-[13px]" />} source="Appraisal Cycle start_date/end_date" />
          </div>
          {msg && <p role={msg.tone === "err" ? "alert" : "status"} className={msg.tone === "err" ? "dhr-alert text-sm" : "text-[12.5px] text-[var(--dhr-emerald)]"} data-cycle-msg={msg.tone}>{msg.text}</p>}
          {comp.rows.length === 0 ? <p className="dhr-empty">{tx("لا يوجد مُقيَّمون في هذه الدورة — أضفهم من نموذج الدورة الأصلي.", "No appraisees on this cycle — add them on the native cycle form.")}</p> : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <div className="overflow-x-auto rounded-[var(--dhr-r-sm)] border border-[var(--dhr-sep)]">
                <table className="w-full min-w-[540px] text-[13px]" data-cycle-table>
                  <thead><tr><th className="text-start">{tx("الموظف", "Employee")}</th><th>{tx("المرحلة", "Stage")}</th><th>{tx("الدرجة", "Score")}</th><th>{tx("ملاحظات", "Feedback")}</th><th>{tx("الأهداف", "Goals")}</th><th /></tr></thead>
                  <tbody>{comp.rows.map((r) => (
                    <tr key={r.employee} className="border-t" data-cycle-row={r.employee} data-stage={r.stage}>
                      <td className="py-1.5"><Link to="/digit-hr/employees/$name" params={{ name: r.employee }} className="dhr-link">{label(tx, r.name)}</Link></td>
                      <td className="text-center"><Pill tone={STAGE[r.stage].tone}>{tx(STAGE[r.stage].ar, STAGE[r.stage].en)}</Pill></td>
                      <td className="text-center dhr-tnum" data-no-i18n>{r.score ?? "—"}</td>
                      <td className="text-center dhr-tnum" data-no-i18n>{r.feedback}</td>
                      <td className="text-center dhr-tnum" data-no-i18n>{r.goals ? `${r.goals}${r.goalProgress !== null ? ` · ${r.goalProgress}%` : ""}` : "—"}</td>
                      <td className="text-end">{r.appraisal ? <Native dt="Appraisal" name={r.appraisal} module="02" className="dhr-act dhr-act-sm">{tx("فتح", "Open")}</Native>
                        : open && canCreate && mayDraftAppraisal(cycle, r.employee) ? <Button variant="ghost" className="dhr-act dhr-act-sm" data-cycle-draft={r.employee} onClick={() => draft(r.employee)}>{tx("بدء التقييم", "Start appraisal")}</Button> : null}</td>
                    </tr>))}</tbody>
                </table>
              </div>
              <div className="space-y-2" data-cycle-histogram>
                <h3 className="text-xs font-semibold text-[var(--dhr-muted)]">{tx("توزيع الدرجات المعتمدة", "Distribution of submitted scores")} <b data-no-i18n>{comp.scored}</b></h3>
                {comp.scored === 0 ? <p className="dhr-empty">{tx("لا توجد درجات معتمدة بعد في هذه الدورة.", "No submitted scores in this cycle yet.")}</p> : (
                  <ul className="space-y-1.5">{comp.histogram.map((n, i) => (
                    <li key={i} className="grid grid-cols-[3.5rem_1fr_2rem] items-center gap-2 text-[12px]">
                      <bdi dir="ltr" className="text-[var(--dhr-muted)]" data-no-i18n>{i}–{i + 1}</bdi>
                      <span className="h-2.5 rounded-full bg-[var(--dhr-neutral)]"><span className="block h-full rounded-full bg-[var(--dhr-emerald)]" style={{ width: `${(n / max) * 100}%` }} /></span>
                      <span className="text-end font-semibold dhr-tnum" data-no-i18n>{n}</span>
                    </li>))}</ul>)}
                {comp.outside.length > 0 && <p className="text-[12px]" data-cycle-outside><Pill tone="warn">{comp.outside.length}</Pill> {tx("تقييمات لموظفين غير مدرجين في قائمة المُقيَّمين.", "appraisals belong to employees not listed as appraisees.")}</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </HrInsightPanel>
  );
}

/* ================================================================ 02.4 training completion */

const ATT: Record<string, { ar: string; en: string; tone: Tone }> = { Present: { ar: "حاضر", en: "Present", tone: "success" }, Absent: { ar: "غائب", en: "Absent", tone: "danger" } };
const ROW_ST: Record<string, string> = { Open: "مفتوح", Invited: "مدعو", Completed: "مكتمل", "Feedback Submitted": "أُرسل التقييم" };
const EV_ST: Record<string, string> = { Scheduled: "مجدولة", Completed: "مكتملة", Cancelled: "ملغاة" };

export function TrainingCompletionPanel({ tx }: { tx: Tx }) {
  const src = useSources(tx); const search = useSearch(); const patch = useSearchPatch(); const navigate = useNavigate();
  const [err, setErr] = useState("");
  const DTS = ["Training Event", "Training Result", "Training Feedback"];
  const events = src.rows("Training Event").filter((e) => Number(e.docstatus) !== 2).sort((a, b) => s(b.start_time).localeCompare(s(a.start_time)));
  const asked = str(search["tev"]);
  const fallback = events.find((e) => Number(e.docstatus) === 1 && Array.isArray(e.employees) && e.employees.length) ?? events[0];
  const ev: Row = events.find((e) => s(e.name) === asked) ?? fallback;
  const c = ev ? eventCompletion(ev, src.rows("Training Result"), src.rows("Training Feedback")) : null;
  const block = c ? resultBlocker(c) : null;
  const canStart = !!ev && mayStartTrainingResult(ev);
  const start = () => {
    setErr("");
    try { const r = startTrainingResult(s(ev.name)); enterHrNative("02.4"); void navigate({ to: "/app/$app/$doctype/$name", params: { app: "hrms", doctype: "training_result", name: r.name }, search: HR_DOC_SEARCH as never }); }
    catch (e) { setErr((e as Error).message); }
  };
  const BLOCK: Record<string, [string, string]> = {
    "not-submitted": ["يجب اعتماد (ترحيل) فعالية التدريب قبل تسجيل النتائج.", "The training event must be submitted before results are recorded."],
    cancelled: ["الفعالية ملغاة.", "The event is cancelled."],
    "no-participants": ["لا يوجد مشاركون في الفعالية.", "The event has no participants."],
  };
  return (
    <HrInsightPanel data-training-completion={c?.event ?? ""} title={tx("إكمال التدريب", "Training completion")}
      meta={tx("المشاركون في كل فعالية مع الحضور والنتائج والتقييمات المعتمدة.", "Each event's participants with attendance, submitted results and feedback.")}
      info={tx("«نتيجة مسجلة» تعني وجود نتيجة تدريب معتمدة للموظف. تحديث حالة المشارك إلى «مكتمل» عند اعتماد النتيجة منطق خادم في DIGIT ولا يُنفّذ في المعاينة. مسودة النتائج تُنشأ بمشاركي الفعالية وتُدخل الساعات والتقدير في النموذج الأصلي.",
        "\"Result recorded\" means a submitted Training Result exists for the employee. The participant-status update DIGIT performs when a result is submitted is server logic and is not run in the preview. The results draft is created with the event's participants; hours and grade are entered in the native form.")}
      actions={events.length > 0 ? <label className="flex items-center gap-2 text-[12.5px]"><span className="text-[var(--dhr-muted)]">{tx("الفعالية", "Event")}</span>
        <select className="field-input max-w-[16rem]" value={c?.event ?? ""} onChange={(e) => patch({ tev: e.target.value || undefined })} aria-label={tx("فعالية التدريب", "Training event")} data-training-event-select>
          {events.map((e) => <option key={s(e.name)} value={s(e.name)}>{s(e.event_name) || s(e.name)} · {s(e.start_time).slice(0, 10)}</option>)}
        </select></label> : undefined}>
      {!src.ready(...DTS) ? <Notice src={src} dts={DTS} /> : !c ? <p className="dhr-empty">{tx("لا توجد فعاليات تدريب.", "No training events.")}</p> : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <Native dt="Training Event" name={c.event} module="02" className="dhr-link font-medium"><span data-no-i18n>{c.title}</span></Native>
            <Pill tone={c.status === "Completed" ? "success" : c.status === "Cancelled" ? "danger" : "info"}>{tx(EV_ST[c.status] ?? c.status, c.status || "—")}</Pill>
            <Pill tone={c.submitted ? "success" : "warn"}>{c.submitted ? tx("معتمدة", "Submitted") : tx("مسودة", "Draft")}</Pill>
            <bdi dir="ltr" className="text-[var(--dhr-muted)]" data-no-i18n>{c.start}</bdi>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-training-kpis>
            <HrOperationalKpi label={tx("المشاركون", "Participants")} value={<span data-training-invited>{c.invited}</span>} source="Training Event Employee" />
            <HrOperationalKpi label={tx("حضور / غياب", "Present / absent")} value={<span data-training-present>{c.present} / {c.absent}</span>} source="Training Event Employee.attendance" />
            <HrOperationalKpi label={tx("نتائج مسجلة", "Results recorded")} value={<span data-training-results>{c.withResult}/{c.invited}</span>} tone={c.submitted && c.withResult < c.invited ? "warn" : undefined} source="Training Result (docstatus=1).employees" />
            <HrOperationalKpi label={tx("تقييمات مستلمة", "Feedback received")} value={<span data-training-feedback>{c.withFeedback}/{c.invited}</span>} source="Training Feedback (docstatus=1)" />
          </div>
          {c.participants.length === 0 ? <p className="dhr-empty">{tx("لا يوجد مشاركون في هذه الفعالية.", "No participants on this event.")}</p> : (
            <div className="overflow-x-auto rounded-[var(--dhr-r-sm)] border border-[var(--dhr-sep)]">
              <table className="w-full min-w-[560px] text-[13px]" data-training-table>
                <thead><tr><th className="text-start">{tx("الموظف", "Employee")}</th><th className="text-start">{tx("الحضور", "Attendance")}</th><th className="text-start">{tx("حالة المشارك", "Participant status")}</th><th className="text-start">{tx("النتيجة", "Result")}</th><th className="text-start">{tx("التقييم", "Feedback")}</th></tr></thead>
                <tbody>{c.participants.map((p) => (
                  <tr key={p.employee} className="border-t" data-training-row={p.employee} data-training-has-result={p.result ? "1" : "0"}>
                    <td className="py-1.5"><Link to="/digit-hr/employees/$name" params={{ name: p.employee }} className="dhr-link">{label(tx, p.name)}</Link>{p.mandatory && <span className="ms-1 text-[11px] text-[var(--dhr-muted)]">{tx("(إلزامي)", "(mandatory)")}</span>}</td>
                    <td>{p.attendance ? <Pill tone={ATT[p.attendance]?.tone}>{tx(ATT[p.attendance]?.ar ?? p.attendance, p.attendance)}</Pill> : <span className="text-[var(--dhr-muted)]">{tx("غير مسجل", "Not recorded")}</span>}</td>
                    <td>{p.rowStatus ? tx(ROW_ST[p.rowStatus] ?? p.rowStatus, p.rowStatus) : "—"}</td>
                    <td>{p.result ? <Native dt="Training Result" name={p.result.doc} module="02" className="dhr-link"><span data-no-i18n>{p.result.hours !== null ? tx(`${p.result.hours} س`, `${p.result.hours} h`) : "—"}{p.result.grade ? ` · ${p.result.grade}` : ""}</span></Native> : <span className="text-[var(--dhr-muted)]">{tx("لا توجد نتيجة معتمدة", "No submitted result")}</span>}</td>
                    <td>{p.feedback ? <Native dt="Training Feedback" name={p.feedback} module="02" className="dhr-link">{tx("مستلم", "Received")}</Native> : <span className="text-[var(--dhr-muted)]">—</span>}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {canStart && !block && <Button variant="outline" className="min-h-10" onClick={start} data-training-start-result={c.draftResult ? "open" : "new"}>{c.draftResult ? tx("فتح مسودة النتائج", "Open results draft") : tx("تسجيل نتائج الفعالية", "Record event results")}</Button>}
            {canStart && block && <span className="text-[12.5px] text-[var(--dhr-muted)]" data-training-blocked={block}>{tx(...BLOCK[block]!)}</span>}
            {c.submittedResults.length > 0 && <span className="text-[12.5px] text-[var(--dhr-muted)]">{tx("نتائج معتمدة:", "Submitted results:")} {c.submittedResults.map((r) => <Native key={r} dt="Training Result" name={r} module="02" className="dhr-link ms-1"><span data-no-i18n>{r}</span></Native>)}</span>}
          </div>
          {err && <p role="alert" className="dhr-alert text-sm" data-training-error>{err}</p>}
        </div>
      )}
    </HrInsightPanel>
  );
}
