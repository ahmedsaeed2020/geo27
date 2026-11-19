/**
 * Module 03 — Workforce Operations Board (Premium V2 flagship). Working day, department and shift live in the URL.
 * Hero: day composition of the employed workforce + shift coverage timeline (24 h) with the assigned roster.
 * Side: exception triage stack. Lower: exception register (draft-only corrections), day attendance, availability,
 * pending requests, capture/report links and the 7-day roster. Eligibility rules are unchanged (attendanceEligibility):
 * a missing record is an expected absence only with a covering Shift Assignment, employment on the day and no holiday.
 */
import { useEffect, useState, type ReactNode } from "react";
import { OvertimePanel, ShiftRequestsPanel } from "./ShiftDepth";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShiftWeek } from "@/components/digithr/ShiftWeek";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { enterHrNative } from "@/components/digithr/HrNav";
import { useModuleScope } from "@/components/digithr/ModuleScope";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { coversAttendanceDay, dayCoverageCounts, dayType, employedOn, shiftCoverage } from "@/plugins/digit_hr/attendanceEligibility";
import { createAttendanceDraft } from "@/plugins/digit_hr/operations";
import { readRegister, writeRegister } from "@/plugins/digit_hr/registerState";
import { placeDoc } from "@/plugins/digit_hr/v6/nav";
import { attendanceFreshness } from "@/plugins/digit_hr/attendanceFreshness";
import { shiftWeek } from "@/plugins/digit_hr/review";
import { t as tr } from "@/i18n";
import { Native, Chip, WorkTable, arLabel, useSources, SourceNotice, s, live, type R } from "./shared";
import { ClearScope, CompanyScope, CtxField, Facts, HrCommandHeader, HrContextInspector, HrContextToolbar, HrEmptyOrBlockedState, HrInsightPanel, HrWorkspaceGrid, ScopeDenied, SourcesPill, relDay, type QueueGroup } from "../home/kit";
import { DateInput } from "@/components/form/DateInput";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

const STATUS_AR: Record<string, string> = { Present: "حاضر", Absent: "غائب", "On Leave": "في إجازة", "Half Day": "نصف يوم", "Work From Home": "عمل عن بعد" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const shiftDay = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const hours = (v: unknown) => { const m = /^(\d{1,2}):(\d{2})/.exec(s(v)); return m ? Number(m[1]) + Number(m[2]) / 60 : null; };
const n0 = (v: unknown) => Number(v ?? 0);
const ROSTER_COLS = "grid-cols-[minmax(0,1fr)_minmax(0,8.5rem)_4.25rem_4.25rem]";
/** The rule behind each triage group, shown once per group instead of on every row. */
const GROUP_WHY: Record<string, [string, string]> = {
  missing: ["وردية مسندة معتمدة ويوم عمل، ولا سجل حضور ولا إجازة معتمدة.", "Submitted shift assignment and a working day, but no attendance record and no approved leave."],
  checkin: ["بصمة مسجلة بلا سجل حضور — التسجيل التلقائي يعمل على الخادم.", "A check-in exists without an attendance record — automatic marking runs on the server."],
  late: ["سجل حضور يحمل علامة دخول متأخر أو خروج مبكر.", "Attendance record flagged late entry or early exit."],
  leave: ["إسناد وردية في يوم تغطيه إجازة معتمدة.", "A shift assignment on a day covered by approved leave."],
  draft: ["سجل حضور محفوظ كمسودة ولم يُعتمد.", "Attendance saved as a draft and not submitted."],
  holiday: ["اليوم عطلة في تقويم الموظف أو شركته — لا حضور متوقع.", "The day is a holiday on the employee's or company's list — no attendance expected."],
  unclassified: ["لا وردية مسندة أو التقويم غير مقروء — لا يُعدّ غيابًا ولا إجراء دون سياسة.", "No assigned shift or the calendar is unreadable — never counted as absent; no action without a policy."],
};

/** Legacy compact exception row (kept for section consumers). */
export function Exc({ who, kind, evidence, action }: { who: string; kind: ReactNode; evidence: ReactNode; action: ReactNode }) {
  return (
    <li className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><div className="font-medium" data-no-i18n>{who}</div><div className="text-xs opacity-70"><span className="dhr-chip me-2">{kind}</span><span data-no-i18n>{evidence}</span></div></div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}

type Bucket = "present" | "absent" | "leave" | "holiday" | "checkin" | "missing" | "none";
const SHORT: Record<Bucket, [string, string]> = { present: ["حاضر", "Present"], absent: ["غائب", "Absent"], leave: ["في إجازة", "On leave"], holiday: ["عطلة", "Holiday"], checkin: ["بصمة فقط", "Check-in only"], missing: ["بلا سجل", "Not recorded"], none: ["غير مصنّف", "Not classified"] };
const BUCKETS: { id: Bucket; ar: string; en: string; cls: string; hintAr: string; hintEn: string }[] = [
  { id: "present", ar: "حاضر (مسجّل)", en: "Present (recorded)", cls: "dhr-seg-present", hintAr: "سجل حضور: حاضر أو عمل عن بعد أو نصف يوم.", hintEn: "Attendance record: Present, Work From Home or Half Day." },
  { id: "absent", ar: "غائب (مسجّل)", en: "Absent (recorded)", cls: "dhr-seg-absent", hintAr: "سجل حضور بحالة غائب.", hintEn: "Attendance record with status Absent." },
  { id: "leave", ar: "في إجازة", en: "On leave", cls: "dhr-seg-leave", hintAr: "إجازة معتمدة تغطي اليوم أو سجل حضور «في إجازة».", hintEn: "Approved leave covering the day, or an On Leave attendance record." },
  { id: "holiday", ar: "عطلة", en: "Holiday", cls: "dhr-seg-holiday", hintAr: "اليوم عطلة في تقويم الموظف أو شركته.", hintEn: "The day is a holiday on the employee's or company's list." },
  { id: "checkin", ar: "بصمة بلا سجل", en: "Check-in only", cls: "dhr-seg-missing", hintAr: "بصمة موجودة بلا سجل حضور.", hintEn: "A check-in exists without an attendance record." },
  { id: "missing", ar: "متوقع ولم يُسجَّل", en: "Expected, not recorded", cls: "dhr-seg-absent opacity-60", hintAr: "وردية مسندة ويوم عمل ولا سجل ولا إجازة.", hintEn: "Assigned shift, working day, no record and no leave." },
  { id: "none", ar: "غير مصنّف", en: "Not classified", cls: "dhr-seg-none", hintAr: "لا وردية مسندة ولا سجل — لا يُعدّ غيابًا.", hintEn: "No assigned shift and no record — never counted as absent." },
];

/** `mode`: section 03.2 opens on recorded attendance + exceptions, 03.3 on the weekly roster + coverage; the module home keeps the full board. */
export function WorkforceWorkspace({ home = false, mode }: { home?: boolean; mode?: "attendance" | "shifts" }) {
  const { tx, lang } = useTx();
  useStoreVersion(); useSessionUser();
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  useScopeMetas(["Employee", "Company", "Holiday List", "Attendance", "Employee Checkin", "Leave Application", "Shift Assignment", "Shift Type", "Shift Request", "Attendance Request", "Overtime Slip"]);
  const src = useSources(tx);
  const scope = useModuleScope(src);
  const search = useRouterState({ select: (st) => st.location.search }) as Record<string, unknown>;
  const navigate = useNavigate();
  const [today, setToday] = useState("");
  useEffect(() => { setToday(new Date().toISOString().slice(0, 10)); }, []);
  const day = typeof search["day"] === "string" && DATE.test(search["day"] as string) ? (search["day"] as string) : today;
  const shiftF = typeof search["shift"] === "string" ? (search["shift"] as string) : "";
  const deptF = typeof search["dept"] === "string" ? (search["dept"] as string) : "";
  const setQ = (patch: Record<string, string>) => void navigate({ to: ".", search: ((prev: Record<string, unknown>) => { const next: Record<string, unknown> = { ...prev, ...patch }; for (const k of Object.keys(patch)) if (!patch[k]) delete next[k]; return next; }) as never });
  const setDay = (d: string) => setQ({ day: d && d !== today ? d : "" });

  // Eligibility: employed on the day (joining/relieving dates), then the HRMS holiday-list rule. Not-employed people are excluded, not "absent".
  const scoped = scope.filter(src.rows("Employee")).filter(live);
  const departments = [...new Set(scoped.map((e) => s(e.department)).filter(Boolean))].sort();
  const people = deptF ? scoped.filter((e) => s(e.department) === deptF) : scoped;
  const emps = people.filter((e) => employedOn(e, day));
  const notEmployed = people.filter((e) => s(e.status || "Active") === "Active" && !employedOn(e, day));
  const eligible = new Set(emps.map((e) => s(e.name)));
  const calendar = { companies: src.ready("Company") ? src.rows("Company") : null, lists: src.ready("Holiday List") ? src.rows("Holiday List") : null, listExists: (n: string) => !!adapter.get("Holiday List", n), assignments: src.ready("Holiday List Assignment") ? src.rows("Holiday List Assignment") : [] };
  const dayOf = (id: string) => { const e = emps.find((x) => s(x.name) === id); return e ? dayType(e, day, calendar) : { kind: "unknown" as const, list: "", description: "" }; };
  const types = src.rows("Shift Type");
  const allAssigns = scope.filter(src.rows("Shift Assignment")).filter((a) => coversAttendanceDay(a, s(a.employee), day) && eligible.has(s(a.employee)));
  const assigns = shiftF ? allAssigns.filter((a) => s(a.shift_type) === shiftF) : allAssigns;
  const inShift = (id: string) => !shiftF || assigns.some((a) => s(a.employee) === id);
  const att = scope.filter(src.rows("Attendance")).filter((a) => live(a) && s(a.attendance_date) === day && eligible.has(s(a.employee)));
  const checkins = scope.filter(src.rows("Employee Checkin")).filter((c) => s(c.time).slice(0, 10) === day);
  const shiftReq = scope.filter(src.rows("Shift Request")).filter((r) => live(r) && s(r.status || "Draft") === "Draft");
  const attReq = scope.filter(src.rows("Attendance Request")).filter((r) => n0(r.docstatus) === 0);
  const overtime = scope.filter(src.rows("Overtime Slip")).filter((r) => n0(r.docstatus) === 0);

  const marked = new Set(att.map((a) => s(a.employee)));
  const unmarked = emps.filter((e) => !marked.has(s(e.name)));
  const late = att.filter((a) => a.late_entry || a.early_exit);
  const checkedNoAtt = [...new Set(checkins.map((c) => s(c.employee)))].filter((e) => !marked.has(e) && eligible.has(e));
  const onLeaveRows = scope.filter(src.rows("Leave Application")).filter((l) => n0(l.docstatus) === 1 && s(l.status) === "Approved" && s(l.from_date).slice(0, 10) <= day && s(l.to_date).slice(0, 10) >= day);
  const onLeave = new Set(onLeaveRows.map((l) => s(l.employee)));
  const missing = unmarked.filter((e) => !onLeave.has(s(e.name)) && !checkedNoAtt.includes(s(e.name)));
  const leaveConflicts = assigns.filter((a) => onLeave.has(s(a.employee)));
  const assigned = new Set(allAssigns.map((a) => s(a.employee)));
  const shiftOf = (id: string) => s(allAssigns.find((a) => s(a.employee) === id)?.shift_type);
  const empOf = (id: string) => people.find((e) => s(e.name) === id);
  const empName = (id: string) => s(empOf(id)?.employee_name) || id;
  const firstIn = (id: string) => checkins.filter((c) => s(c.employee) === id && s(c.log_type) !== "OUT").map((c) => s(c.time).slice(11, 16)).sort()[0] ?? "";
  const lastOut = (id: string) => checkins.filter((c) => s(c.employee) === id && s(c.log_type) === "OUT").map((c) => s(c.time).slice(11, 16)).sort().at(-1) ?? "";

  const [err, setErr] = useState("");
  const [reason, setReason] = useState("");
  const correct = (emp: string, status: "Present" | "Absent") => {
    setErr("");
    try {
      const d = createAttendanceDraft(emp, day, status, reason);
      const p = placeDoc("Attendance", "03");
      if (p) { enterHrNative(p.sub); void navigate({ to: "/app/$app/$doctype/$name", params: { app: p.app, doctype: p.slug, name: String(d.name) }, search: HR_DOC_SEARCH as never }); }
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
  };

  type X = { key: string; emp: string; who: string; dept: string; shift: string; expected: boolean; recorded: string; kind: string; ev: ReactNode; status: string; action: ReactNode };
  const draftBtn = (emp: string, st: "Present" | "Absent", primary: boolean) => <Button disabled={!reason.trim() || !day} type="button" className={`dhr-act ${primary ? "dhr-act-primary" : ""}`} onClick={() => correct(emp, st)}>{st === "Present" ? tx("حضور (مسودة)", "Draft present") : tx("غياب (مسودة)", "Draft absence")}</Button>;
  const EXC_SRC = ["Employee", "Attendance", "Shift Assignment", "Employee Checkin", "Leave Application"];
  const excReady = src.ready(...EXC_SRC) && scope.companyKnown && !!day;
  const missingRow = (e: R): X => {
    const id = s(e.name); const exp = assigned.has(id); const dt = dayOf(id);
    if (exp && dt.kind === "holiday") return { key: "h" + id, emp: id, who: s(e.employee_name) || id, dept: s(e.department), shift: shiftOf(id), expected: false, recorded: tx("لا شيء", "None"), kind: "holiday", ev: <Native dt="Holiday List" name={dt.list} module="03">{dt.description || dt.list}</Native>, status: tx("عطلة — لا حضور متوقع", "Holiday — no attendance expected"), action: <span className="text-xs text-[var(--dhr-muted)]">—</span> };
    if (exp && dt.kind === "unknown") return { key: "u" + id, emp: id, who: s(e.employee_name) || id, dept: s(e.department), shift: shiftOf(id), expected: false, recorded: tx("لا شيء", "None"), kind: "unclassified", ev: <Native dt="Employee" name={id} module="03">{id}</Native>, status: tx("غير مصنّف — تقويم العطلات غير مقروء", "Not classified — holiday calendar not readable"), action: <span className="text-xs text-[var(--dhr-muted)]">{tx("لا إجراء دون التقويم", "No action without the calendar")}</span> };
    return { key: "m" + id, emp: id, who: s(e.employee_name) || id, dept: s(e.department), shift: shiftOf(id), expected: exp, recorded: tx("لا شيء", "None"), kind: exp ? "missing" : "unclassified", ev: exp ? <Native dt="Shift Assignment" module="03" filters={[["employee", "=", id]]}>{tx("إسناد وردية", "Shift assignment")}</Native> : <Native dt="Employee" name={id} module="03">{id}</Native>, status: exp ? tx("متوقع ولم يُسجَّل", "Expected, not recorded") : tx("غير مصنّف — لا وردية مسندة", "Not classified — no assigned shift"), action: exp ? draftBtn(id, "Absent", false) : <span className="text-xs text-[var(--dhr-muted)]">{tx("لا إجراء دون سياسة", "No action without policy")}</span> };
  };
  const xsAll: X[] = [
    ...checkedNoAtt.map((e): X => ({ key: "c" + e, emp: e, who: empName(e), dept: s(empOf(e)?.department), shift: shiftOf(e), expected: assigned.has(e), recorded: tx("بصمة فقط", "Check-in only"), kind: "checkin", ev: <Native dt="Employee Checkin" module="03" filters={[["employee", "=", e]]}>{tx("البصمات", "Check-ins")}</Native>, status: tx("بلا سجل حضور", "No attendance"), action: draftBtn(e, "Present", true) })),
    ...missing.map(missingRow),
    ...late.map((a): X => ({ key: "l" + s(a.name), emp: s(a.employee), who: s(a.employee_name) || s(a.employee), dept: s(a.department) || s(empOf(s(a.employee))?.department), shift: s(a.shift) || shiftOf(s(a.employee)), expected: true, recorded: tx(STATUS_AR[s(a.status)] ?? s(a.status), s(a.status)), kind: "late", ev: <Native dt="Attendance" name={s(a.name)} module="03">{s(a.name)}</Native>, status: n0(a.docstatus) === 0 ? tx("مسودة", "Draft") : tx("معتمد", "Submitted"), action: <Native dt="Attendance Request" module="03" className="dhr-act">{tx("طلب تصحيح", "Correction request")}</Native> })),
    ...att.filter((a) => n0(a.docstatus) === 0 && !a.late_entry && !a.early_exit).map((a): X => ({ key: "d" + s(a.name), emp: s(a.employee), who: s(a.employee_name) || s(a.employee), dept: s(a.department) || s(empOf(s(a.employee))?.department), shift: s(a.shift) || shiftOf(s(a.employee)), expected: assigned.has(s(a.employee)), recorded: tx(STATUS_AR[s(a.status)] ?? s(a.status), s(a.status)), kind: "draft", ev: <Native dt="Attendance" name={s(a.name)} module="03">{s(a.name)}</Native>, status: tx("مسودة — غير معتمدة", "Draft — not submitted"), action: <Native dt="Attendance" name={s(a.name)} module="03" className="dhr-act">{tx("مراجعة واعتماد", "Review & submit")}</Native> })),
    ...leaveConflicts.map((a): X => ({ key: "x" + s(a.name), emp: s(a.employee), who: s(a.employee_name) || s(a.employee), dept: s(a.department) || s(empOf(s(a.employee))?.department), shift: s(a.shift_type), expected: true, recorded: tx("إجازة معتمدة", "Approved leave"), kind: "leave", ev: <Native dt="Shift Assignment" name={s(a.name)} module="03">{s(a.name)}</Native>, status: tx("تعارض", "Conflict"), action: <Native dt="Shift Assignment" name={s(a.name)} module="03" className="dhr-act">{tx("مراجعة الإسناد", "Review assignment")}</Native> })),
  ];
  const xs = excReady ? xsAll.filter((x) => inShift(x.emp)) : [];
  const groups: (QueueGroup & { id: string })[] = [
    { id: "missing", ar: "متوقع بلا حضور", en: "Expected, no record", tone: "danger" },
    { id: "checkin", ar: "بصمة بلا حضور", en: "Check-in, no attendance", tone: "warn" },
    { id: "late", ar: "تأخير / خروج مبكر", en: "Late / early", tone: "warn" },
    { id: "leave", ar: "تعارض مع إجازة", en: "Leave conflict", tone: "warn" },
    { id: "draft", ar: "مسودات للمراجعة", en: "Drafts to review", tone: "info" },
    { id: "holiday", ar: "عطلة رسمية", en: "Holiday", tone: "neutral" },
    { id: "unclassified", ar: "غير مصنّف", en: "Not classified", tone: "neutral" },
  ];
  const tableGroups = groups.map((g) => ({ id: g.id, ar: g.ar, en: g.en, ...(g.tone === "danger" || g.tone === "warn" ? { tone: g.tone } : {}) }));
  const actionable = xs.filter((x) => !["unclassified", "holiday"].includes(x.kind));
  const focusException = (x: X) => {
    void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, hr: writeRegister(prev["hr"], "attendance-exceptions", { ...readRegister(prev["hr"], "attendance-exceptions"), group: x.kind, q: x.emp, page: 0, selected: "" }) }) });
    requestAnimationFrame(() => document.getElementById("attendance-exceptions")?.scrollIntoView({ block: "start" }));
  };

  // Day composition: each employed person in exactly one bucket, recorded attendance first.
  const attOf = new Map(att.map((a) => [s(a.employee), s(a.status)]));
  const bucketOf = (id: string): Bucket => {
    const st = attOf.get(id);
    if (st) return st === "Absent" ? "absent" : st === "On Leave" ? "leave" : "present";
    if (onLeave.has(id)) return "leave";
    if (dayOf(id).kind === "holiday") return "holiday";
    if (checkedNoAtt.includes(id)) return "checkin";
    if (assigned.has(id) && dayOf(id).kind === "working") return "missing";
    return "none";
  };
  const comp = new Map<Bucket, string[]>(BUCKETS.map((b) => [b.id, []]));
  const population = emps.filter((e) => inShift(s(e.name)));
  for (const e of population) comp.get(bucketOf(s(e.name)))?.push(s(e.name));
  const named = (dt: string, names: string[]) => names.length ? <Native dt={dt} module="03" filters={[["name", "in", names]]} className="dhr-link">{names.length}</Native> : <span>0</span>;
  const coverage = shiftCoverage(types, allAssigns, att, eligible, onLeave, (id) => dayOf(id).kind === "holiday", day);
  const covReady = src.ready("Shift Type", "Shift Assignment", "Attendance") && scope.companyKnown && !!day;
  const roster = assigns.map((a) => ({ a, id: s(a.employee), b: bucketOf(s(a.employee)) })).sort((x, y) => s(x.a.shift_type).localeCompare(s(y.a.shift_type)) || empName(x.id).localeCompare(empName(y.id)));
  const read = !scope.companyKnown ? { state: "DENIED" as const } : src.worst(...EXC_SRC, "Shift Type");
  const rosterShifts = [...new Set(roster.map((r) => s(r.a.shift_type)))];
  const person = typeof search["person"] === "string" ? (search["person"] as string) : "";
  const selPerson = person && people.some((e) => s(e.name) === person) ? person : "";
  const selAssign = selPerson ? allAssigns.find((a) => s(a.employee) === selPerson) : undefined;
  const selExc = selPerson ? xs.find((x) => x.emp === selPerson) : undefined;
  const shiftWindow = (name: string) => { const t = types.find((x) => s(x.name) === name); return t ? `${s(t.start_time).slice(0, 5) || "—"}–${s(t.end_time).slice(0, 5) || "—"}` : ""; };
  // 7-day navigator facts: people on a submitted, covering Shift Assignment vs saved attendance records, per day (same scope + filters).
  const shiftRows = scope.filter(src.rows("Shift Assignment")).filter((a) => !shiftF || s(a.shift_type) === shiftF);
  const attRows = scope.filter(src.rows("Attendance")).filter(live);
  const dayStats = (d: string) => dayCoverageCounts(people, shiftRows, attRows, d);
  // NB1-01 freshness: a day with no saved attendance and no check-in is "not recorded", never an actual zero or absence.
  const peopleIds = new Set(people.map((e) => s(e.name)));
  const fresh = attendanceFreshness(peopleIds, attRows, scope.filter(src.rows("Employee Checkin")), day, today);
  const noShift = comp.get("none")?.length ?? 0;
  const showFresh = mode !== "shifts" && excReady && population.length > 0 && fresh.noRecords;
  const isToday = !!day && day === today;
  const weekday = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(lang === "ar" ? "ar" : "en", { weekday: "short", timeZone: "UTC" });
  // NB1-02 shifts mode: week roster matrix (reuses review.shiftWeek), approved-leave clashes and holidays per cell.
  const weekRows = scope.filter(src.rows("Shift Assignment")).filter((a) => (!shiftF || s(a.shift_type) === shiftF) && peopleIds.has(s(a.employee)));
  const week = (mode === "shifts" && day ? shiftWeek(weekRows, day) : []) as { day: string; assignments: R[] }[];
  const approvedLeave = scope.filter(src.rows("Leave Application")).filter((l) => n0(l.docstatus) === 1 && s(l.status) === "Approved");
  const leaveOn = (emp: string, d: string) => approvedLeave.some((l) => s(l.employee) === emp && s(l.from_date).slice(0, 10) <= d && s(l.to_date).slice(0, 10) >= d);
  const holidayOn = (emp: string, d: string) => { const e = people.find((x) => s(x.name) === emp); return e ? dayType(e, d, calendar).kind === "holiday" : false; };
  const rosterEmps = [...new Set(week.flatMap((w) => w.assignments.map((a) => s(a.employee))))].sort((a, b) => empName(a).localeCompare(empName(b)));
  const cellOf = (emp: string, i: number) => { const w = week[i]; const a = w?.assignments.find((x) => s(x.employee) === emp); return { a, leave: !!a && !!w && leaveOn(emp, w.day), holiday: !!a && !!w && holidayOn(emp, w.day) }; };
  const weekClashes = rosterEmps.flatMap((emp) => week.map((w, i) => ({ emp, d: w.day, c: cellOf(emp, i) })).filter((x) => x.c.leave));
  const step = mode === "shifts" ? 7 : 1;

  const triageRow = (x: X) => (
    <button key={x.key} type="button" className="dhr-mrow grid-cols-[minmax(0,1fr)_auto]" onClick={() => focusException(x)} data-triage-row={x.key}>
      <span className="min-w-0"><span className="block truncate text-[13px] font-medium" data-no-i18n>{tx(arLabel(x.who), x.who)}</span><span className="block truncate text-[11.5px] text-[var(--dhr-muted)]" data-no-i18n>{x.shift ? tx(arLabel(x.shift), x.shift) : tx("بلا وردية", "no shift")}{x.shift && shiftWindow(x.shift) ? <> · <span dir="ltr" className="inline-block">{shiftWindow(x.shift)}</span></> : null}</span></span>
      <span className="text-[11.5px] text-[var(--dhr-muted)]">{x.kind === "missing" ? tx("فتح", "Open") : x.status}</span>
    </button>
  );

  const header = (
    <HrCommandHeader embedded={!home} id="03" code="03" suite={tx("إدارة القوى العاملة", "Workforce Management")} title={tx("لوحة تشغيل القوى العاملة", "Workforce Operations Board")}
      purpose={tx("الحضور وتغطية الورديات ليوم العمل المحدد، واستثناءات اليوم بحسب قواعد الأهلية.", "Attendance and shift coverage for the selected working day, with the day's exceptions by eligibility rule.")}
      actions={<><Native dt="Attendance" module="03" className="dhr-act dhr-act-primary">{tx("سجل الحضور", "Attendance")}</Native><Native dt="Shift Assignment" module="03" className="dhr-act">{tx("إسناد الورديات", "Shift assignments")}</Native></>}>
      <HrContextToolbar tx={tx} active={[scope.company, day !== today ? day : "", shiftF, deptF].filter(Boolean).length} scopeKey={[scope.company, day, shiftF, deptF].join("|")} end={<SourcesPill src={src} />}>
        <CompanyScope scope={scope} tx={tx} />
        <CtxField label={mode === "shifts" ? tx("الأسبوع يبدأ", "Week starting") : tx("اليوم", "Day")}>
          <span className="inline-flex items-center gap-1">
            <button type="button" className="dhr-act !px-2" onClick={() => day && setDay(shiftDay(day, -step))} aria-label={mode === "shifts" ? tx("الأسبوع السابق", "Previous week") : tx("اليوم السابق", "Previous day")}><ChevronRight className="hidden h-4 w-4 rtl:block" /><ChevronLeft className="h-4 w-4 rtl:hidden" /></button>
            <DateInput value={day} onChange={(e) => setDay(e.target.value)} data-no-i18n aria-label={mode === "shifts" ? tx("بداية أسبوع الجدول", "Roster week start") : tx("يوم الحضور", "Attendance day")} />
            <button type="button" className="dhr-act !px-2" onClick={() => day && setDay(shiftDay(day, step))} aria-label={mode === "shifts" ? tx("الأسبوع التالي", "Next week") : tx("اليوم التالي", "Next day")}><ChevronLeft className="hidden h-4 w-4 rtl:block" /><ChevronRight className="h-4 w-4 rtl:hidden" /></button>
            {day !== today && <button type="button" className="dhr-act dhr-act-ghost" onClick={() => setDay("")}>{mode === "shifts" ? tx("من اليوم", "From today") : tx("اليوم", "Today")}</button>}
          </span>
        </CtxField>
        <CtxField label={tx("القسم", "Department")}>
          <select aria-label={tx("قسم اللوحة", "Board department")} value={deptF} onChange={(e) => setQ({ dept: e.target.value })} className="max-w-[12rem]">
            <option value="">{tx("كل الأقسام", "All departments")}</option>
            {departments.map((d) => <option key={d} value={d} data-no-i18n>{tx(arLabel(d), d)}</option>)}
          </select>
        </CtxField>
        <CtxField label={tx("الوردية", "Shift")}>
          <select aria-label={tx("وردية اللوحة", "Board shift")} value={shiftF} onChange={(e) => setQ({ shift: e.target.value })} className="max-w-[12rem]">
            <option value="">{tx("كل الورديات", "All shifts")}</option>
            {types.map((t) => <option key={s(t.name)} value={s(t.name)} data-no-i18n>{tx(arLabel(s(t.name)), s(t.name))}</option>)}
          </select>
        </CtxField>
        <ClearScope scope={scope} tx={tx} />
      </HrContextToolbar>
    </HrCommandHeader>
  );

  const freshBanner = showFresh ? (
    <div className="dhr-fresh" role="status" data-attendance-freshness={fresh.lastRecorded || "none"}>
      <span className="dhr-dot" data-tone="warn" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{isToday ? tx("لم يُسجَّل حضور ولا بصمات لليوم بعد.", "No attendance or check-ins have been recorded for today yet.") : <>{tx("لا توجد سجلات حضور ولا بصمات ليوم", "No attendance or check-in records exist for")} <bdi dir="ltr" className="dhr-tnum" data-no-i18n>{day}</bdi>.</>}</div>
        <div className="mt-0.5 text-[12.5px] text-[var(--dhr-muted)]">
          {tx("«متوقع ولم يُسجَّل» يعني عدم وجود سجل، وليس غيابًا مؤكدًا.", "\"Expected, not recorded\" means there is no record — not a confirmed absence.")}{" "}
          {noShift > 0 && <>{tx(`${noShift} بلا وردية مسندة ولا يُحتسبون غيابًا.`, `${noShift} without an assigned shift are not counted as absent.`)}{" "}</>}
          {fresh.lastRecorded ? <>{tx("آخر يوم به حضور مسجّل في هذا النطاق:", "Last day with recorded attendance in this scope:")} <bdi dir="ltr" className="dhr-tnum" data-no-i18n>{fresh.lastRecorded}</bdi> ({relDay(today, fresh.lastRecorded, tx)}).</> : tx("لا يوجد حضور مسجّل في هذا النطاق بعد.", "No attendance has been recorded in this scope yet.")}
        </div>
      </div>
      {fresh.lastRecorded ? <button type="button" className="dhr-act" onClick={() => setDay(fresh.lastRecorded)} data-view-last-recorded={fresh.lastRecorded}>{tx("عرض آخر يوم مسجّل", "View last recorded day")}</button> : <Native dt="Attendance" module="03" className="dhr-act">{tx("سجل الحضور", "Attendance register")}</Native>}
    </div>
  ) : null;

  /* 7-day navigator: recorded attendance vs people on an assigned shift, per day; a day without any saved attendance shows "—", not 0 */
  const dayStrip = (
    <div className="border-b border-[var(--dhr-sep)] px-4 py-3" data-day-strip>
      {day && covReady ? (
        <div className="dhr-daystrip" role="group" aria-label={tx("التنقل بين الأيام", "Day navigator")}>
          {[-3, -2, -1, 0, 1, 2, 3].map((k) => { const d = shiftDay(day, k); const st = dayStats(d); const none = !fresh.recordedDays.has(d); const wd = weekday(d); return (
            <button key={d} type="button" className="dhr-dayc" aria-current={k === 0 ? "date" : undefined} onClick={() => setDay(d)} aria-label={none ? `${d}: ${tx(`لا سجلات حضور · ${st.assigned} مسند`, `no attendance records · ${st.assigned} on shift`)}` : `${d}: ${tx(`${st.recorded} مسجّل من ${st.assigned} مسند`, `${st.recorded} recorded of ${st.assigned} on shift`)}`} data-day={d} data-day-assigned={st.assigned} data-day-recorded={st.recorded} data-day-norecords={none || undefined}>
              <span className="dn">{wd}{d === today ? ` · ${tx("اليوم", "today")}` : ""}</span>
              <span className="dd" data-no-i18n>{d.slice(8, 10)}</span>
              <span className="dhr-mini-stack" aria-hidden><span className="dhr-seg-present" style={{ width: `${st.assigned ? Math.min(100, (st.recorded / st.assigned) * 100) : 0}%` }} /></span>
              <span className="text-[10.5px] text-[var(--dhr-muted)]" data-no-i18n>{none ? "—" : st.recorded}/{st.assigned}</span>
            </button>); })}
        </div>
      ) : <HrEmptyOrBlockedState read={read ?? { state: "LOADING" }} tx={tx} rows={1} />}
    </div>
  );

  /* day status: one strip, each person in one bucket */
  const composition = (
    <div className="border-b border-[var(--dhr-sep)] px-4 py-3">
      {!excReady ? <HrEmptyOrBlockedState read={read ?? { state: "LOADING" }} tx={tx} rows={1} /> : population.length ? <>
        <div className="dhr-stack !rounded-md" style={{ height: 12 }} role="img" aria-label={BUCKETS.map((b) => `${tx(b.ar, b.en)} ${comp.get(b.id)?.length ?? 0}`).join(", ")}>
          {BUCKETS.map((b) => { const c = comp.get(b.id)?.length ?? 0; return c ? <span key={b.id} className={b.cls} style={{ width: `${(c / population.length) * 100}%` }} title={`${tx(b.ar, b.en)}: ${c}`} /> : null; })}
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label={tx("فئات اليوم", "Day categories")}>
          {BUCKETS.map((b) => { const ids = comp.get(b.id) ?? []; return (
            <li key={b.id} className="dhr-legend-n" title={tx(b.hintAr, b.hintEn)} data-bucket={b.id} data-bucket-count={ids.length} data-zero={ids.length ? undefined : true}>
              <i className={b.cls} aria-hidden /><span>{tx(b.ar, b.en)}</span><b data-no-i18n>{named("Employee", ids)}</b>
            </li>); })}
        </ul>
      </> : <HrEmptyOrBlockedState tx={tx} title={tx("لا موظفين ملتحقين ضمن هذا النطاق في اليوم المحدد.", "No one employed in this scope on the selected day.")} body={tx("غيّر الشركة أو القسم أو اليوم.", "Change the company, department or day.")} />}
    </div>
  );

  const legend = (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--dhr-sep)] px-4 py-2 text-[11.5px] text-[var(--dhr-muted)]">
      {[["dhr-seg-present", tx("حاضر", "Present")], ["dhr-seg-absent", tx("غائب", "Absent")], ["dhr-seg-leave", tx("إجازة", "On leave")], ["dhr-seg-holiday", tx("عطلة", "Holiday")], ["dhr-seg-missing", tx("بلا سجل", "Not recorded")]].map(([c, l]) => <span key={c} className="dhr-legend"><i className={c} aria-hidden />{l}</span>)}
    </div>
  );

  /* shift coverage on a 24 h track */
  const coverageList = (
    <>
      <div className="px-4 pt-3">
        <div className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-3 text-[10.5px] text-[var(--dhr-muted)]" aria-hidden>
          <span className="text-[11px] font-semibold">{tx("تغطية الورديات", "Shift coverage")}</span>
          <div className="relative h-4" data-no-i18n>{[0, 6, 12, 18, 24].map((h) => <span key={h} className="absolute -translate-x-1/2 rtl:translate-x-1/2" style={{ insetInlineStart: `${(h / 24) * 100}%` }}>{String(h).padStart(2, "0")}</span>)}</div>
        </div>
      </div>
      <ul className="divide-y divide-[var(--dhr-sep)]">
        {coverage.map((c) => {
          const t = types.find((x) => s(x.name) === c.shift);
          const a = hours(t?.start_time), b = hours(t?.end_time);
          const spans: [number, number][] = a === null || b === null ? [] : b > a ? [[a, b]] : [[a, 24], [0, b]];
          const total = c.assigned.length || 1;
          const segs: [string, number][] = [["dhr-seg-present", c.present.length], ["dhr-seg-absent", c.absent.length], ["dhr-seg-leave", c.onLeave.length], ["dhr-seg-holiday", c.holiday.length], ["dhr-seg-missing", c.notRecorded.length]];
          const sel = shiftF === c.shift;
          return (
            <li key={c.shift} data-coverage-shift={c.shift} data-coverage-assigned={c.assigned.length} data-coverage-recorded={c.recorded.length} data-coverage-missing={c.notRecorded.length}>
              <button type="button" onClick={() => setQ({ shift: sel ? "" : c.shift })} aria-pressed={sel} className={`grid w-full grid-cols-[minmax(0,14rem)_minmax(0,1fr)] items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-[color-mix(in_oklab,var(--dhr-mint)_7%,transparent)] ${sel ? "bg-[color-mix(in_oklab,var(--dhr-mint)_15%,transparent)]" : ""}`}>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold" data-no-i18n>{tx(arLabel(c.shift), c.shift)}</span>
                  <span className="block text-[11.5px] text-[var(--dhr-muted)]"><span data-no-i18n dir="ltr" className="inline-block">{s(t?.start_time).slice(0, 5) || "—"}–{s(t?.end_time).slice(0, 5) || "—"}</span> · <span data-no-i18n>{c.recorded.length}/{c.assigned.length}</span> {tx("مسجّل", "recorded")}{c.notRecorded.length ? <> · <span className="text-[var(--dhr-warn-text)]"><span data-no-i18n>{c.notRecorded.length}</span> {tx("بلا سجل", "not recorded")}</span></> : null}</span>
                </span>
                <span className="dhr-track block">
                  {spans.length ? spans.map(([x, y], i) => (
                    <span key={i} className="absolute inset-y-0.5 block" style={{ insetInlineStart: `${(x / 24) * 100}%`, width: `${((y - x) / 24) * 100}%` }}>
                      <span className="dhr-stack h-full">{segs.map(([cls, v]) => v ? <span key={cls} className={cls} style={{ width: `${(v / total) * 100}%` }} /> : null)}{!c.assigned.length && <span className="dhr-seg-none" style={{ width: "100%" }} />}</span>
                    </span>)) : <span className="absolute inset-0 flex items-center px-2 text-[11px] text-[var(--dhr-muted)]">{tx("وقت الوردية غير محدد", "Shift times not set")}</span>}
                </span>
              </button>
            </li>);
        })}
      </ul>
    </>
  );
  const noTypes = <div className="p-4"><HrEmptyOrBlockedState tx={tx} title={tx("لا توجد أنواع ورديات.", "No shift types.")} body={tx("عرّف أنواع الورديات ثم أسندها للموظفين.", "Define shift types, then assign them to employees.")} action={<Native dt="Shift Type" module="03" className="dhr-act">{tx("أنواع الورديات", "Shift types")}</Native>} /></div>;

  /* assigned roster grouped by shift; selecting a person opens the inspector */
  const rosterBlock = (
    <div className="border-t border-[var(--dhr-sep)]" data-roster>
      <div className="flex items-center justify-between gap-2 px-4 py-2"><h3 className="text-[13px] font-semibold">{shiftF ? <>{tx("الطاقم المسند —", "Assigned roster —")} <span data-no-i18n>{tx(arLabel(shiftF), shiftF)}</span></> : tx("الطاقم المسند حسب الوردية", "Assigned roster by shift")} <span className="text-[var(--dhr-muted)]" data-no-i18n>({roster.length})</span></h3><span className="text-[11px] text-[var(--dhr-muted)] max-sm:hidden">{tx("اختر شخصًا لعرض التفاصيل", "Select a person for details")}</span></div>
      {roster.length ? (
        <div className="max-h-[360px] overflow-auto">
          <div className={`dhr-mhead ${ROSTER_COLS} sticky top-0 z-[1]`} aria-hidden><span>{tx("الموظف", "Employee")}</span><span>{tx("الحالة اليوم", "Today")}</span><span>{tx("أول دخول", "First in")}</span><span>{tx("آخر خروج", "Last out")}</span></div>
          {rosterShifts.map((sh) => { const rows = roster.filter((r) => s(r.a.shift_type) === sh); return (
            <div key={sh} role="group" aria-label={tx(arLabel(sh), sh)}>
              <div className="dhr-group-h !top-[29px]"><span data-no-i18n>{tx(arLabel(sh), sh)}</span><b className="dhr-tnum" data-no-i18n>{rows.length}</b></div>
              {rows.slice(0, 80).map(({ a, id, b }) => { const bk = BUCKETS.find((x) => x.id === b)!; return (
                <button key={s(a.name)} type="button" className={`dhr-mrow ${ROSTER_COLS}`} aria-pressed={person === id} onClick={() => setQ({ person: person === id ? "" : id })} data-roster-row={id}>
                  <span className="min-w-0"><span className="block truncate text-[13px] font-medium" data-no-i18n>{tx(arLabel(empName(id)), empName(id))}</span><span className="block truncate text-[11.5px] text-[var(--dhr-muted)]" data-no-i18n>{s(empOf(id)?.department) ? tx(arLabel(s(empOf(id)?.department)), s(empOf(id)?.department)) : "—"}</span></span>
                  <span className="min-w-0" title={tx(bk.ar, bk.en)}><Chip tone={b === "absent" || b === "missing" ? "danger" : b === "checkin" ? "warn" : "neutral"}>{tx(...SHORT[b])}</Chip></span>
                  <span className="dhr-tnum text-[12.5px]" data-no-i18n>{firstIn(id) || "—"}</span>
                  <span className="dhr-tnum text-[12.5px]" data-no-i18n>{lastOut(id) || "—"}</span>
                </button>); })}
            </div>); })}
        </div>
      ) : <div className="px-4 pb-3"><HrEmptyOrBlockedState tx={tx} title={tx("لا إسنادات تغطي هذا اليوم.", "No assignments cover this day.")} action={<Native dt="Shift Assignment" module="03" className="dhr-act">{tx("إسناد الورديات", "Shift assignments")}</Native>} /></div>}
    </div>
  );

  const dayMeta = excReady ? <><span data-no-i18n>{population.length}</span> {tx("ملتحقون في النطاق", "employed in scope")} · <span data-no-i18n>{allAssigns.length}</span> {tx("مسندون لوردية", "on an assigned shift")}{notEmployed.length > 0 && <> · {tx("غير ملتحقين:", "not employed:")} {named("Employee", notEmployed.map((e) => s(e.name)))}</>} · {tx("آخر حضور مسجّل:", "last recorded:")} <bdi dir="ltr" className="dhr-tnum" data-no-i18n data-last-recorded={fresh.lastRecorded || "none"}>{fresh.lastRecorded || "—"}</bdi></> : undefined;
  const dayInfo = tx("كل موظف ملتحق في هذا اليوم يظهر في فئة واحدة؛ السجل المسجّل أولًا. «متوقع ولم يُسجَّل» يتطلب وردية مسندة معتمدة تغطي اليوم وتوظيفًا قائمًا ويوم عمل في تقويم العطلات — غياب البصمة وحده ليس غيابًا. اليوم الذي لا يحتوي أي سجل حضور يظهر «—» وليس صفرًا. التسجيل التلقائي من البصمات يعمل على الخادم.", "Every person employed on this day appears in exactly one category; recorded attendance first. \"Expected, not recorded\" needs a submitted Shift Assignment covering the day, active employment and a working day on the holiday list — a missing check-in alone is never an absence. A day without any saved attendance shows \"—\", not zero. Automatic attendance from check-ins runs on the server.");
  const dayTitle = (label: ReactNode) => <>{label} · <bdi data-no-i18n dir="ltr" className="inline-block">{day}</bdi>{isToday ? <span className="ms-1 text-[12px] font-normal text-[var(--dhr-muted)]">({tx("اليوم", "today")})</span> : null}</>;

  const inspector = selPerson ? (
    <HrContextInspector tx={tx} onClose={() => setQ({ person: "" })} title={<span data-no-i18n>{tx(arLabel(empName(selPerson)), empName(selPerson))}</span>} subtitle={<span data-no-i18n className="dhr-code">{selPerson}</span>}
      actions={<>
        <Link to="/digit-hr/employees/$name" params={{ name: selPerson }} className="dhr-act dhr-act-primary">{tx("ملف الموظف 360", "Employee 360")}</Link>
        {selAssign && <Native dt="Shift Assignment" name={s(selAssign.name)} module="03" className="dhr-act">{tx("إسناد الوردية", "Shift assignment")}</Native>}
        <Native dt="Employee Checkin" module="03" filters={[["employee", "=", selPerson]]} className="dhr-act">{tx("البصمات", "Check-ins")}</Native>
        {selExc && mode !== "shifts" && <button type="button" className="dhr-act" onClick={() => focusException(selExc)} data-person-exception>{tx("عرض في سجل الاستثناءات", "Show in exception register")}</button>}
      </>}>
      <Facts items={[
        [tx("القسم", "Department"), s(empOf(selPerson)?.department) ? tx(arLabel(s(empOf(selPerson)?.department)), s(empOf(selPerson)?.department)) : "—"],
        [tx("الوردية", "Shift"), shiftOf(selPerson) ? <span>{tx(arLabel(shiftOf(selPerson)), shiftOf(selPerson))} <span dir="ltr" className="inline-block text-[var(--dhr-muted)]">{shiftWindow(shiftOf(selPerson))}</span></span> : "—"],
        [tx("الحالة اليوم", "Today"), (() => { const bk = BUCKETS.find((x) => x.id === bucketOf(selPerson)); return bk ? tx(bk.ar, bk.en) : "—"; })()],
        [tx("الاستثناء", "Exception"), selExc ? selExc.status : tx("لا يوجد", "None")],
        [tx("أول دخول", "First in"), firstIn(selPerson) || "—"],
        [tx("آخر خروج", "Last out"), lastOut(selPerson) || "—"],
      ]} />
      {selExc?.kind === "missing" && <p className="rounded-md bg-[var(--dhr-canvas)] px-3 py-2 text-[12px]">{tx("وردية مسندة ويوم عمل ولا سجل ولا إجازة. التصحيح ينشئ مسودة بسبب إلزامي في سجل الاستثناءات أدناه.", "Assigned shift, working day, no record and no leave. A correction creates a draft with a required reason in the exception register below.")}</p>}
    </HrContextInspector>
  ) : null;

  const triagePanel = (
    <HrInsightPanel title={tx("فرز الاستثناءات", "Exception triage")} flush data-exception-triage={actionable.length}
      meta={<><b className="dhr-tnum" data-no-i18n>{excReady ? actionable.length : "—"}</b> {tx("تحتاج إجراء", "need action")}</>}
      info={tx("التصنيف يتبع قواعد الأهلية: وردية مسندة معتمدة، توظيف قائم في اليوم، ويوم عمل في تقويم العطلات. الإجراءات تنشئ مسودات فقط.", "Classification follows the eligibility rules: a submitted Shift Assignment, employment on the day and a working day on the holiday list. Actions create drafts only.")}>
      {!excReady ? <div className="p-4"><HrEmptyOrBlockedState read={read ?? { state: "LOADING" }} tx={tx} rows={4} /></div> : xs.length ? (
        <div className="max-h-[640px] overflow-auto" data-triage-groups>
          {groups.map((g) => { const rows = xs.filter((x) => x.kind === g.id); if (!rows.length) return null; const byDept = [...rows.reduce((m, x) => m.set(x.dept, [...(m.get(x.dept) ?? []), x]), new Map<string, X[]>())].sort((p, q) => q[1].length - p[1].length); const flat = rows.length <= 4 || byDept.length === 1; return (
            <div key={g.id} data-queue-group={g.id}>
              <div className="dhr-group-h"><span className="flex items-center gap-2"><span className="dhr-dot" data-tone={g.tone === "neutral" ? undefined : g.tone} aria-hidden />{tx(g.ar, g.en)}</span><b className="dhr-tnum" data-no-i18n>{rows.length}</b></div>
              <p className="dhr-group-why">{tx(GROUP_WHY[g.id]?.[0] ?? "", GROUP_WHY[g.id]?.[1] ?? "")}</p>
              {flat ? rows.map((x) => triageRow(x)) : byDept.map(([dp, xsD]) => { const k = `${g.id}|${dp}`; const open = openGroups.includes(k); return (
                <div key={k}>
                  <button type="button" className="dhr-subgroup" aria-expanded={open} onClick={() => setOpenGroups(open ? openGroups.filter((y) => y !== k) : [...openGroups, k])} data-triage-dept={dp || "—"}>
                    <span className="flex min-w-0 items-center gap-2">{open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 rtl:rotate-180" aria-hidden />}<span className="truncate" data-no-i18n>{dp ? tx(arLabel(dp), dp) : tx("بلا قسم", "No department")}</span></span>
                    <b className="dhr-tnum" data-no-i18n>{xsD.length}</b>
                  </button>
                  {open && xsD.map((x) => triageRow(x))}
                </div>); })}
            </div>); })}
        </div>
      ) : <div className="p-4"><HrEmptyOrBlockedState tx={tx} title={tx("لا استثناءات لهذا اليوم.", "No exceptions for this day.")} body={tx("كل الموظفين المتوقعين لديهم سجل أو إجازة أو عطلة.", "Everyone expected has a record, leave or a holiday.")} /></div>}
    </HrInsightPanel>
  );

  const pendingPanel = (
    <HrInsightPanel title={tx("طلبات معلقة", "Pending requests")} flush data-pending-requests={shiftReq.length + attReq.length + overtime.length}>
      {(shiftReq.length || attReq.length || overtime.length) ? (
        <ul className="divide-y divide-[var(--dhr-sep)]">
          {[...attReq.map((r) => ({ r, dt: "Attendance Request", k: tx("تصحيح حضور", "Attendance correction") })), ...shiftReq.map((r) => ({ r, dt: "Shift Request", k: tx("طلب وردية", "Shift request") })), ...overtime.map((r) => ({ r, dt: "Overtime Slip", k: tx("عمل إضافي", "Overtime") }))].slice(0, 8).map(({ r, dt, k }) => (
            <li key={dt + s(r.name)} className="flex min-h-11 items-center justify-between gap-2 px-4 py-2">
              <Native dt={dt} name={s(r.name)} module="03" className="dhr-link min-w-0 truncate text-[13px] font-medium"><span data-no-i18n>{tx(arLabel(s(r.employee_name) || s(r.employee)), s(r.employee_name) || s(r.employee))}</span></Native>
              <Chip tone="warn">{k}</Chip>
            </li>))}
        </ul>) : <div className="p-4"><HrEmptyOrBlockedState read={src.worst("Shift Request", "Attendance Request", "Overtime Slip")} tx={tx} title={tx("لا طلبات معلقة.", "No pending requests.")} /></div>}
    </HrInsightPanel>
  );

  const excRegister = (
    <section id="attendance-exceptions" className="dhr-panel scroll-mt-4" data-exception-workbench>
      <div className="dhr-panel-h flex-wrap">
        <div className="min-w-0"><h2 className="dhr-panel-t">{tx("سجل استثناءات الحضور", "Attendance exception register")}</h2><div className="dhr-panel-m">{tx("الإجراءات تنشئ مسودة فقط مع سبب إلزامي — الاعتماد من النموذج الأصلي.", "Actions create drafts only, with a required reason — submission happens in the native form.")}</div></div>
        <label className="flex items-center gap-2 text-[12.5px]"><span className="text-[var(--dhr-muted)]">{tx("سبب التصحيح (إلزامي)", "Correction reason (required)")}</span><input aria-label={tx("سبب التصحيح", "Correction reason")} value={reason} onChange={(e) => setReason(e.target.value)} className="dhr-compact-input w-64 max-w-full" /></label>
      </div>
      <div className="dhr-panel-b">
        {err && <p role="alert" className="dhr-alert mb-2 text-sm">{err}</p>}
        <WorkTable<X> label="attendance-exceptions" tx={tx} rows={xs} rowKey={(x) => x.key} groups={tableGroups} groupOf={(x) => x.kind} emptyState={excReady ? undefined : <HrEmptyOrBlockedState read={read ?? { state: "LOADING" }} tx={tx} rows={3} />} minWidth={900}
          searchText={(x) => `${x.who} ${x.emp} ${x.dept} ${x.shift}`}
          cols={[
            { key: "who", ar: "الموظف", en: "Employee", sort: (x) => x.who, render: (x) => <span data-no-i18n><Native dt="Employee" name={x.emp} module="03" className="dhr-link font-medium">{tx(arLabel(x.who), x.who)}</Native><span className="block text-[11px] text-[var(--dhr-muted)]">{x.emp}</span></span> },
            { key: "dept", ar: "القسم", en: "Department", sort: (x) => x.dept, render: (x) => <span data-no-i18n>{x.dept ? tx(arLabel(x.dept), x.dept) : "—"}</span> },
            { key: "shift", ar: "الوردية", en: "Shift", sort: (x) => x.shift, render: (x) => <span data-no-i18n>{x.shift ? tx(arLabel(x.shift), x.shift) : "—"}</span> },
            { key: "exp", ar: "حضور متوقع", en: "Expected", render: (x) => x.expected ? <Chip>{tx("نعم", "Yes")}</Chip> : <span className="text-xs text-[var(--dhr-muted)]">{x.kind === "holiday" ? tx("لا — عطلة", "No — holiday") : tx("غير محدد", "Unknown")}</span> },
            { key: "rec", ar: "المسجّل", en: "Recorded", render: (x) => x.recorded },
            { key: "kind", ar: "الاستثناء", en: "Exception", sort: (x) => x.kind, render: (x) => { const g = groups.find((y) => y.id === x.kind); return g ? <Chip tone={g.tone === "danger" ? "danger" : g.tone === "warn" ? "warn" : undefined}>{tx(g.ar, g.en)}</Chip> : null; } },
            { key: "ev", ar: "الدليل والحالة", en: "Evidence & status", render: (x) => <span className="block min-w-[10rem] text-xs"><span data-no-i18n>{x.ev}</span><span className="block text-[11px] text-[var(--dhr-muted)]">{x.status}</span></span> },
            { key: "act", ar: "الإجراء المتاح", en: "Eligible action", render: (x) => x.action },
          ]} />
      </div>
    </section>
  );

  const lowerGrid = (
    <div className="grid gap-4 xl:grid-cols-12">
      <HrInsightPanel className="xl:col-span-6" title={tx("سجلات الحضور لليوم", "Day's attendance records")} meta={tx("سجلات الحضور المحفوظة لليوم المحدد.", "Saved attendance records for the selected day.")}>
        <WorkTable<R> label="day-attendance" minWidth={0} tx={tx} rows={att} emptyState={src.ready("Attendance") ? (fresh.noRecords ? tx("لا توجد سجلات حضور محفوظة لهذا اليوم — ليس صفر حضور.", "No attendance saved for this day — not zero attendance.") : undefined) : <HrEmptyOrBlockedState read={src.read("Attendance")} tx={tx} rows={3} />} rowKey={(a) => s(a.name)} pageSize={6} searchText={(a) => `${s(a.employee_name)} ${s(a.employee)}`}
          cols={[
            { key: "e", ar: "الموظف", en: "Employee", sort: (a) => s(a.employee_name), render: (a) => <span data-no-i18n><Native dt="Attendance" name={s(a.name)} module="03" className="dhr-link">{tx(arLabel(s(a.employee_name) || s(a.employee)), s(a.employee_name) || s(a.employee))}</Native></span> },
            { key: "s", ar: "الحالة", en: "Status", sort: (a) => s(a.status), render: (a) => <Chip>{tx(STATUS_AR[s(a.status)] ?? s(a.status), s(a.status))}</Chip> },
            { key: "d", ar: "الاعتماد", en: "Docstatus", render: (a) => n0(a.docstatus) === 0 ? <Chip tone="warn">{tx("مسودة", "Draft")}</Chip> : <Chip>{tx("معتمد", "Submitted")}</Chip> },
          ]} />
      </HrInsightPanel>
      <HrInsightPanel className="xl:col-span-3" title={tx("توفر الفريق", "Team availability")} meta={tx("إجازات معتمدة تغطي اليوم.", "Approved leave covering the day.")} flush data-team-availability={onLeaveRows.length}>
        {onLeaveRows.length ? <ul className="divide-y divide-[var(--dhr-sep)]">{onLeaveRows.slice(0, 10).map((l) => <li key={s(l.name)} className="flex min-h-11 items-center justify-between gap-2 px-4 py-2"><Native dt="Leave Application" name={s(l.name)} module="03" className="dhr-link min-w-0 truncate text-[13px]"><span data-no-i18n>{tx(arLabel(s(l.employee_name) || s(l.employee)), s(l.employee_name) || s(l.employee))}</span></Native><Chip>{tr(s(l.leave_type))}</Chip></li>)}</ul> : <div className="p-4"><HrEmptyOrBlockedState read={src.read("Leave Application")} tx={tx} title={tx("لا أحد في إجازة معتمدة.", "No one on approved leave.")} /></div>}
      </HrInsightPanel>
      <HrInsightPanel className="xl:col-span-3" title={tx("مصادر الحضور والتقارير", "Capture sources & reports")} meta={tx("لا توجد حالة أجهزة حيّة في المعاينة.", "No live device status in the preview.")} data-capture-links>
        <ul className="space-y-1 text-[13px]">
          {[["Employee Checkin", tx("البصمات", "Check-ins")], ["Attendance Request", tx("طلبات التصحيح", "Correction requests")], ["Shift Request", tx("طلبات الورديات", "Shift requests")], ["Holiday List", tx("تقاويم العطلات", "Holiday lists")]].map(([dt, l]) => <li key={dt}><Native dt={dt!} module="03" className="dhr-link">{l}</Native></li>)}
          {([["Monthly Attendance Sheet", "كشف الحضور الشهري"], ["Shift Attendance", "حضور الورديات"], ["Employee Leave Balance", "رصيد إجازات الموظفين"]] as const).map(([r, ar]) => <li key={r}><Link to="/report/$name" params={{ name: r }} className="dhr-link">{tx(ar, r)}</Link></li>)}
          {mode === "attendance" && <li className="border-t border-[var(--dhr-sep)] pt-1"><Link to="/digit-hr/s/$section" params={{ section: "03.3" }} search={day && day !== today ? { day } as never : {} as never} className="dhr-link" data-goto-shifts>{tx("جدول الورديات والتغطية ←", "Shift roster & coverage →")}</Link></li>}
        </ul>
      </HrInsightPanel>
    </div>
  );

  if (mode === "shifts") {
    // Compact roster cells: one colour + time window per shift type (legend carries the full name), so seven days fit without clipping.
    const weekShifts = [...new Set(week.flatMap((w) => w.assignments.map((a) => s(a.shift_type))))].sort();
    const hhmm = (v: unknown) => { const x = s(v).slice(0, 5); return x.endsWith(":00") ? x.slice(0, 2) : x; };
    const shiftWin = (name: string) => { const t = types.find((x) => s(x.name) === name); return t && s(t.start_time) ? `${hhmm(t.start_time)}–${hhmm(t.end_time)}` : ""; };
    const shiftTone = (name: string) => String(Math.max(0, weekShifts.indexOf(name)) % 4);
    const typeRows = types.map((t) => { const name = s(t.name); const cov = coverage.find((c) => c.shift === name); const weekPeople = new Set(week.flatMap((w) => w.assignments.filter((a) => s(a.shift_type) === name).map((a) => s(a.employee)))); return { name, t, day: cov?.assigned.length ?? 0, week: weekPeople.size }; });
    return (
      <div className="space-y-4" data-module-home="03" data-workforce-mode="shifts">
        {header}
        <ScopeDenied scope={scope} tx={tx} />
        <SourceNotice src={src} quietLoading />
        <HrWorkspaceGrid
          main={<>
            <HrInsightPanel title={<>{tx("جدول الورديات الأسبوعي", "Weekly shift roster")} · <bdi dir="ltr" data-no-i18n className="inline-block">{day}{day ? ` – ${shiftDay(day, 6)}` : ""}</bdi></>} flush data-roster-matrix={rosterEmps.length}
              meta={covReady ? <><span data-no-i18n>{rosterEmps.length}</span> {tx("موظفًا على إسناد معتمد", "people on a submitted assignment")} · <span data-no-i18n data-week-clashes={weekClashes.length}>{weekClashes.length}</span> {tx("تعارضًا مع إجازة معتمدة", "clashes with approved leave")}</> : undefined}
              info={tx("الخلية تعرض الوردية من إسناد وردية معتمد ونشط يغطي اليوم. «إجازة» = إجازة معتمدة في يوم مسند (تعارض)، و«عطلة» = عطلة في تقويم الموظف. لا يُفترض طلب توظيف ولا يُرحَّل عمل إضافي.", "Each cell shows the shift from a submitted, active Shift Assignment covering the day. \"Leave\" = approved leave on a rostered day (a clash); \"Holiday\" = a holiday on the employee's list. No staffing demand is assumed and no overtime is posted.")}>
              {!covReady ? <div className="p-4"><HrEmptyOrBlockedState read={read ?? { state: "LOADING" }} tx={tx} rows={4} /></div> : rosterEmps.length ? (
                <>
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--dhr-sep)] px-4 py-2 text-[12px]" aria-label={tx("مفتاح الورديات", "Shift key")} data-roster-legend>
                  {weekShifts.map((sh) => <li key={sh} className="inline-flex items-center gap-1.5"><span className="dhr-shift-chip" data-tone={shiftTone(sh)} aria-hidden><bdi dir="ltr">{shiftWin(sh) || "—"}</bdi></span><span data-no-i18n>{tx(arLabel(sh), sh)}</span></li>)}
                  <li className="inline-flex items-center gap-1.5"><Chip tone="warn">{tx("إجازة", "Leave")}</Chip><span>{tx("تعارض مع إجازة معتمدة", "clash with approved leave")}</span></li>
                </ul>
                <div className="max-h-[560px] overflow-auto">
                  <table className="w-full min-w-[560px] table-fixed" data-roster-table>
                    <thead className="sticky top-0 z-[1]"><tr>
                      <th scope="col" className="w-[9.5rem]">{tx("الموظف", "Employee")}</th>
                      {week.map((w) => <th key={w.day} scope="col" className="!text-center" aria-current={w.day === day ? "date" : undefined} data-roster-day={w.day}><span className="block">{weekday(w.day)}</span><span className="dhr-tnum block font-normal" data-no-i18n dir="ltr">{w.day.slice(5)}</span><span className="block text-[10.5px] font-normal" data-no-i18n>{new Set(w.assignments.map((a) => s(a.employee))).size}</span></th>)}
                    </tr></thead>
                    <tbody>{rosterEmps.map((emp) => (
                      <tr key={emp} data-roster-emp={emp} className={person === emp ? "dhr-row-selected" : ""}>
                        <th scope="row" className="!font-normal">
                          <button type="button" className="text-start" onClick={() => setQ({ person: person === emp ? "" : emp })} aria-pressed={person === emp}>
                            <span className="block truncate text-[13px] font-medium" data-no-i18n>{tx(arLabel(empName(emp)), empName(emp))}</span>
                            <span className="block truncate text-[11.5px] text-[var(--dhr-muted)]" data-no-i18n>{s(empOf(emp)?.department) ? tx(arLabel(s(empOf(emp)?.department)), s(empOf(emp)?.department)) : "—"}</span>
                          </button>
                        </th>
                        {week.map((w, i) => { const c = cellOf(emp, i); return (
                          <td key={w.day} className="!text-center" data-roster-cell={`${emp}|${w.day}`} data-conflict={c.leave || undefined}>
                            {c.a ? <Native dt="Shift Assignment" name={s(c.a.name)} module="03" className="inline-flex flex-col items-center gap-0.5 rounded-md px-1 py-1 text-[12px] hover:bg-[var(--dhr-tint)]">
                              <span className="dhr-shift-chip" data-tone={shiftTone(s(c.a.shift_type))} title={tx(arLabel(s(c.a.shift_type)), s(c.a.shift_type))}><bdi dir="ltr" data-no-i18n>{shiftWin(s(c.a.shift_type)) || "•"}</bdi><span className="sr-only" data-no-i18n>{tx(arLabel(s(c.a.shift_type)), s(c.a.shift_type))}</span></span>
                              {c.leave ? <Chip tone="warn">{tx("إجازة", "Leave")}</Chip> : c.holiday ? <Chip>{tx("عطلة", "Holiday")}</Chip> : null}
                            </Native> : <span className="text-[var(--dhr-muted)]" title={tx("لا إسناد", "No assignment")}>·</span>}
                          </td>); })}
                      </tr>))}</tbody>
                  </table>
                </div>
                </>
              ) : <div className="p-4"><HrEmptyOrBlockedState tx={tx} title={tx("لا إسنادات ورديات تغطي هذا الأسبوع.", "No shift assignments cover this week.")} body={tx("الجدول يُبنى من إسنادات الورديات المعتمدة فقط.", "The roster is built from submitted shift assignments only.")} action={<Native dt="Shift Assignment" module="03" className="dhr-act">{tx("إسناد الورديات", "Shift assignments")}</Native>} /></div>}
            </HrInsightPanel>
            <HrInsightPanel title={tx("أنواع الورديات", "Shift types")} flush data-shift-types={types.length} meta={tx("النافذة الزمنية وعدد المسندين في اليوم المحدد وخلال الأسبوع.", "Time window and people assigned on the selected day and during the week.")}>
              {!src.ready("Shift Type") ? <div className="p-4"><HrEmptyOrBlockedState read={src.read("Shift Type")} tx={tx} rows={2} /></div> : types.length ? (
                <div className="overflow-x-auto"><table className="w-full min-w-[520px]">
                  <thead><tr><th>{tx("الوردية", "Shift")}</th><th>{tx("النافذة", "Window")}</th><th>{tx("مسندون في اليوم", "On the day")}</th><th>{tx("خلال الأسبوع", "This week")}</th></tr></thead>
                  <tbody>{typeRows.map((r) => <tr key={r.name} data-shift-type={r.name}>
                    <td><Native dt="Shift Type" name={r.name} module="03" className="dhr-link font-medium"><span data-no-i18n>{tx(arLabel(r.name), r.name)}</span></Native></td>
                    <td className="whitespace-nowrap"><bdi dir="ltr" className="dhr-tnum" data-no-i18n>{s(r.t.start_time).slice(0, 5) || "—"}–{s(r.t.end_time).slice(0, 5) || "—"}</bdi></td>
                    <td className="dhr-tnum" data-no-i18n>{r.day}</td>
                    <td className="dhr-tnum" data-no-i18n>{r.week}</td>
                  </tr>)}</tbody>
                </table></div>
              ) : noTypes}
            </HrInsightPanel>
            <ShiftRequestsPanel tx={tx} src={src} filter={scope.filter} />
            <OvertimePanel tx={tx} src={src} filter={scope.filter} />
          </>}
          side={<>
            {inspector}
            <HrInsightPanel title={dayTitle(tx("تغطية اليوم", "Day coverage"))} flush data-shift-coverage meta={tx("المسندون مقابل الحضور المسجّل لكل وردية.", "Assigned people versus recorded attendance per shift.")}>
              {!covReady ? <div className="p-4"><HrEmptyOrBlockedState read={read ?? { state: "LOADING" }} tx={tx} rows={3} /></div> : coverage.length ? <>{coverageList}{legend}</> : noTypes}
            </HrInsightPanel>
            <HrInsightPanel title={tx("تعارضات مع الإجازات", "Leave clashes")} flush data-leave-clashes={weekClashes.length} meta={tx("أيام مسندة تغطيها إجازة معتمدة خلال الأسبوع.", "Rostered days covered by approved leave this week.")}>
              {weekClashes.length ? <ul className="divide-y divide-[var(--dhr-sep)]">{weekClashes.slice(0, 12).map((x) => (
                <li key={`${x.emp}|${x.d}`} className="flex min-h-11 items-center justify-between gap-2 px-4 py-2">
                  <span className="min-w-0"><span className="block truncate text-[13px] font-medium" data-no-i18n>{tx(arLabel(empName(x.emp)), empName(x.emp))}</span><bdi dir="ltr" className="dhr-tnum text-[11.5px] text-[var(--dhr-muted)]" data-no-i18n>{x.d}</bdi></span>
                  <span className="flex shrink-0 gap-1.5">{x.c.a && <Native dt="Shift Assignment" name={s(x.c.a.name)} module="03" className="dhr-act dhr-act-sm">{tx("الإسناد", "Assignment")}</Native>}<Native dt="Leave Application" module="03" filters={[["employee", "=", x.emp]]} className="dhr-act dhr-act-sm">{tx("الإجازة", "Leave")}</Native></span>
                </li>))}</ul> : <div className="p-4"><HrEmptyOrBlockedState read={src.worst("Shift Assignment", "Leave Application")} tx={tx} title={tx("لا تعارضات هذا الأسبوع.", "No clashes this week.")} /></div>}
            </HrInsightPanel>
            {pendingPanel}
            <HrInsightPanel title={tx("مصادر الورديات والعمل الإضافي", "Shift & overtime sources")} data-shift-sources>
              <ul className="space-y-1 text-[13px]">
                {[["Shift Type", tx("أنواع الورديات", "Shift types")], ["Shift Assignment", tx("إسنادات الورديات", "Shift assignments")], ["Shift Request", tx("طلبات الورديات", "Shift requests")], ["Overtime Slip", tx("قسائم العمل الإضافي", "Overtime slips")]].map(([dt, l]) => <li key={dt}><Native dt={dt!} module="03" className="dhr-link">{l}</Native></li>)}
                <li><Link to="/report/$name" params={{ name: "Shift Attendance" }} className="dhr-link">{tx("تقرير حضور الورديات", "Shift Attendance report")}</Link></li>
                <li className="border-t border-[var(--dhr-sep)] pt-1"><Link to="/digit-hr/s/$section" params={{ section: "03.2" }} search={day && day !== today ? { day } as never : {} as never} className="dhr-link" data-goto-attendance>{tx("الحضور والاستثناءات ←", "Attendance & exceptions →")}</Link></li>
              </ul>
              <p className="mt-2 text-[11.5px] text-[var(--dhr-muted)]">{tx("العمل الإضافي لا يُحسب ولا يُرحَّل من هذه الشاشة.", "Overtime is neither calculated nor posted from this screen.")}</p>
            </HrInsightPanel>
          </>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-module-home="03" data-workforce-mode={mode ?? "home"}>
      {header}
      <ScopeDenied scope={scope} tx={tx} />
      <SourceNotice src={src} quietLoading />
      {freshBanner}

      <HrWorkspaceGrid mobileSideFirst
        main={
          <HrInsightPanel title={dayTitle(mode === "attendance" ? tx("الحضور المسجّل", "Recorded attendance") : tx("تشغيل اليوم", "Day operations"))} flush data-day-composition={population.length} data-shift-coverage={mode === "attendance" ? undefined : true}
            meta={dayMeta} info={dayInfo}>
            {dayStrip}
            {composition}
            {mode !== "attendance" && (!covReady ? <div className="p-4"><HrEmptyOrBlockedState read={read ?? { state: "LOADING" }} tx={tx} rows={3} /></div> : coverage.length ? <>{coverageList}{rosterBlock}{legend}</> : noTypes)}
          </HrInsightPanel>
        }
        side={<>
          {inspector}
          {triagePanel}
          {pendingPanel}
        </>}
      />

      {excRegister}
      {lowerGrid}

      {mode !== "attendance" && <section className="dhr-panel p-4"><ShiftWeek rows={scope.filter(src.rows("Shift Assignment"))} day={day} tx={tx} /></section>}
    </div>
  );
}
