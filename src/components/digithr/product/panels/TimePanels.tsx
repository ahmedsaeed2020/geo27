/**
 * 03.2 / 03.3 time blocks (owner round H2): the day by the hour per employee (shift window, first IN – last OUT, late /
 * early marks — the same Enterprise HourBars as the Construction site day) and the weekly shift roster (the same
 * Enterprise WeekBoard as the Construction crew board) with hours and cost per day and overtime in red on the person.
 */
import { useMemo, useState, type ReactNode } from "react";
import { DateInput } from "@/components/form/DateInput";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStoreVersion } from "@/lib/adapter";
import { t } from "@/i18n";
import { fmtNumber, riyal } from "@/lib/format";
import { BoardCard, HourBars, WeekBoard, type BoardHue } from "@/components/enterprise/kit/ResourceBoard";
import { Avatar } from "@/components/enterprise/kit/PeopleKit";
import { openQuickView } from "@/components/enterprise/QuickView";
import { arLabel } from "@/components/digithr/workspaces/shared";
import { deptHue } from "@/plugins/digit_hr/product/people";
import { siteIndex } from "@/plugins/digit_hr/product/overview/d03";
import { unitLabel } from "@/plugins/digit_hr/product/overview/kit";
import { addDays, dayTimeline, lastPunchDay, roster, rosterDayCost, weekStart } from "@/plugins/digit_hr/product/timeView";

type Bi = [string, string];
const pick = (ar: boolean, b: Bi) => (ar ? b[1] : b[0]);
const nameOf = (ar: boolean, v: string) => (ar ? arLabel(v) : v);
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const hhmm = (h: number) => { const hh = Math.floor(h + 1e-9) % 24, mm = Math.round((h - Math.floor(h + 1e-9)) * 60); return `${String(hh).padStart(2, "0")}:${String(mm === 60 ? 0 : mm).padStart(2, "0")}`; };
const DAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"], DAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const minAr = (k: number) => `${k} ${k === 1 ? "دقيقة" : k === 2 ? "دقيقتان" : k <= 10 ? "دقائق" : "دقيقة"}`;
/** Where a person works for the time views: their site (crew project) or branch, else their department. */
function useDeptOf(company?: string) {
  const ver = useStoreVersion();
  return useMemo(() => { const site = siteIndex({ on: "", ar: true, user: "", company }); return (e: Record<string, unknown> & { name: string }) => { const v = site.get(e.name); return v && v !== "—" ? v : unitLabel(String(e["department"] ?? "")) || "—"; }; }, [company, ver]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ------------------------------------------------------------------ H2-05 day by the hour ------------------------------------------------------------------ */
export function DayHoursHr({ ar, on, company }: { ar: boolean; on: string; company?: string | undefined }) {
  const deptOf = useDeptOf(company);
  const last = lastPunchDay(on, company) ?? on;
  const [day, setDay] = useState(""); const d = day || last;
  const [unit, setUnit] = useState(""); const [more, setMore] = useState(false);
  const tl = dayTimeline(d, { company, deptOf });
  if (!tl) return <p className="text-sm text-muted-foreground" data-source-state="DENIED">{pick(ar, ["You cannot read check-ins.", "لا تملك صلاحية قراءة سجلات البصمة."])}</p>;
  const units = [...new Set(tl.rows.map((r) => r.dept))].sort();
  const u = units.includes(unit) ? unit : "";
  const all = u ? tl.rows.filter((r) => r.dept === u) : tl.rows; const rows = more ? all : all.slice(0, 14);
  const late = all.filter((r) => r.late).length, early = all.filter((r) => r.early).length;
  return <div className="grid gap-2" data-day-hours={d} data-day-late={late} data-day-early={early}>
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="inline-flex items-center gap-2"><span className="font-semibold">{pick(ar, ["Day", "اليوم"])}</span><DateInput className="dhr-input h-9" value={d} max={on} onChange={(e) => setDay(e.target.value)} data-day-pick /></label>
      <select className="dhr-input h-9" value={u} onChange={(e) => { setUnit(e.target.value); setMore(false); }} data-day-unit><option value="">{pick(ar, ["All sites and departments", "كل المواقع والأقسام"])}</option>{units.map((x) => <option key={x} value={x}>{nameOf(ar, x)}</option>)}</select>
      <span className="ek-hb-flag" data-kind="late">{pick(ar, [`${late} late`, `${late} متأخر`])}</span><span className="ek-hb-flag" data-kind="early">{pick(ar, [`${early} left early`, `${early} خروج مبكر`])}</span>
    </div>
    <HourBars ar={ar} from={tl.from} axis={Math.max(4, tl.to - tl.from)} hourLabel={(h) => hhmm(h)} empty={pick(ar, ["No check-ins on this day.", "لا توجد سجلات بصمة في هذا اليوم."])}
      rows={rows.map((r) => ({ key: r.employee, who: <button type="button" className="text-start hover:underline" onClick={(ev) => openQuickView({ kind: "doc", doctype: "Employee", name: r.employee }, ev.currentTarget)}>{nameOf(ar, r.name)}</button>, sub: <>{nameOf(ar, r.dept)} · {t(r.shift)}</>,
        scheduled: r.sched ? r.sched[1] - r.sched[0] : 0, normal: r.worked, overtime: 0,
        at: { sched: r.sched, rec: r.rec, marks: [...(r.late && r.sched ? [{ kind: "late" as const, at: r.sched[0] }] : []), ...(r.early && r.sched ? [{ kind: "early" as const, at: r.sched[1] }] : [])] },
        note: <span className="flex flex-wrap items-center gap-1 text-xs"><bdi data-no-i18n>{hhmm(r.rec[0])} → {r.rec[1] !== null ? hhmm(r.rec[1]) : "—"}</bdi>{r.late > 0 && <span className="ek-hb-flag" data-kind="late">{ar ? `متأخر ${minAr(r.late)}` : `${r.late} min late`}</span>}{r.early > 0 && <span className="ek-hb-flag" data-kind="early">{ar ? `خروج مبكر ${minAr(r.early)}` : `left ${r.early} min early`}</span>}{r.rec[1] === null && <span className="ek-hb-flag" data-kind="early">{pick(ar, ["no check-out", "بلا تسجيل خروج"])}</span>}</span> }))}
      legend={<span className="flex flex-wrap items-center gap-3 text-xs"><span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-5 rounded border-2 border-dashed border-[var(--blue)]" />{pick(ar, ["Scheduled shift", "الوردية المجدولة"])}</span><span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-5 rounded bg-[var(--blue)]" />{pick(ar, ["Recorded (first in – last out)", "المسجل (أول دخول – آخر خروج)"])}</span><span className="inline-flex items-center gap-1"><i className="ek-hb-mark relative inline-block h-3" data-kind="late" />{pick(ar, ["Late past the grace", "تأخير بعد مهلة السماح"])}</span><span className="inline-flex items-center gap-1"><i className="ek-hb-mark relative inline-block h-3" data-kind="early" />{pick(ar, ["Early exit", "خروج مبكر"])}</span><span>{pick(ar, [`Day ${dmy(d)}`, `يوم ${dmy(d)}`])}</span></span>} />
    {all.length > 14 && <button type="button" className="ek-oc-hidden justify-self-start" onClick={() => setMore((v) => !v)} data-day-more>{more ? pick(ar, ["Show fewer", "عرض أقل"]) : pick(ar, [`${all.length - 14} not shown — show all`, `${all.length - 14} غير معروض — عرض الكل`])}</button>}
  </div>;
}

/* ------------------------------------------------------------------ H2-07 weekly roster ------------------------------------------------------------------ */
const ROLE_HUES: BoardHue[] = ["blue", "violet", "amber", "teal", "emerald", "coral", "gold", "rose"];
const roleHue = (title: string): BoardHue => { const h = deptHue(title); return (ROLE_HUES as string[]).includes(h) ? (h as BoardHue) : "teal"; };
export function ShiftRosterHr({ ar, on, company }: { ar: boolean; on: string; company?: string | undefined }) {
  const deptOf = useDeptOf(company);
  const [start, setStart] = useState(""); const from = start || weekStart(on);
  const [unit, setUnit] = useState(""); const [more, setMore] = useState(false);
  const all = roster(from, { company, deptOf });
  if (!all) return <p className="text-sm text-muted-foreground" data-source-state="DENIED">{pick(ar, ["You cannot read shift assignments.", "لا تملك صلاحية قراءة تكليفات الورديات."])}</p>;
  const u = all.depts.some((x) => x.key === unit) ? unit : all.depts[0]?.key ?? "";
  const r = roster(from, { company, dept: u, deptOf })!;
  const rows = more ? r.rows : r.rows.slice(0, 12);
  const offAll = (d: string) => Object.values(r.off).length > 0 && Object.values(r.off).every((s) => s.has(d));
  const cost = (d: string) => rosterDayCost(r.rows, d, on);
  const hours = (d: string) => r.rows.reduce((a, x) => a + (x.cells[d]?.kind === "shift" ? x.cells[d]!.hours + x.cells[d]!.ot : 0), 0);
  const money = (v: number) => riyal(fmtNumber(v, 0));
  const total = r.days.reduce((a, d) => a + (cost(d) ?? 0), 0);
  const nav = <span className="inline-flex items-center gap-1">
    <button type="button" className="btn-secondary h-8 px-2" onClick={() => setStart(addDays(from, -7))} aria-label={pick(ar, ["Previous week", "الأسبوع السابق"])} data-roster-prev>{ar ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
    <button type="button" className="btn-secondary h-8 px-3 text-xs" onClick={() => setStart("")} data-roster-this>{pick(ar, ["This week", "هذا الأسبوع"])}</button>
    <button type="button" className="btn-secondary h-8 px-2" onClick={() => setStart(addDays(from, 7))} aria-label={pick(ar, ["Next week", "الأسبوع التالي"])} data-roster-next>{ar ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</button>
    <select className="dhr-input h-8" value={u} onChange={(e) => { setUnit(e.target.value); setMore(false); }} data-roster-unit>{all.depts.map((x) => <option key={x.key} value={x.key}>{nameOf(ar, x.key)} ({x.people})</option>)}</select>
  </span>;
  const cell = (row: string, d: string): ReactNode => {
    const x = r.rows.find((y) => y.employee === row); const c = x?.cells[d]; if (!x || !c) return null;
    if (c.kind === "off") return <span className="text-xs text-muted-foreground">{pick(ar, ["Rest", "راحة"])}</span>;
    if (c.kind === "leave") return <button type="button" className="contents" onClick={(ev) => c.ref && openQuickView({ kind: "doc", doctype: "Leave Application", name: c.ref }, ev.currentTarget)}><BoardCard hue="rose" title={pick(ar, ["On leave", "إجازة"])} attrs={{ "data-roster-leave": c.ref ?? "" }} /></button>;
    return <button type="button" className="contents" onClick={(ev) => c.ref && openQuickView({ kind: "doc", doctype: "Shift Assignment", name: c.ref }, ev.currentTarget)}><BoardCard hue={roleHue(x.title)} title={t(c.shift ?? "")} value={c.from !== undefined && c.to !== undefined ? <bdi data-no-i18n>{hhmm(c.from)}–{hhmm(c.to)}</bdi> : undefined}
      alert={c.ot > 0 ? <bdi data-no-i18n>{ar ? `+${fmtNumber(c.ot, 1)} س إضافي` : `+${fmtNumber(c.ot, 1)} h overtime`}</bdi> : undefined} attrs={{ "data-roster-shift": c.shift ?? "", "data-roster-ot": String(c.ot) }} /></button>;
  };
  return <div className="grid gap-2" data-roster={from} data-roster-rows={r.rows.length}>
    <WeekBoard title={pick(ar, [`Week of ${dmy(from)}`, `أسبوع ${dmy(from)}`])} nav={nav} rowHead={pick(ar, ["Employee", "الموظف"])} totalHead={pick(ar, ["Week", "الأسبوع"])}
      days={r.days.map((d) => ({ key: d, label: (ar ? DAY_AR : DAY_EN)[new Date(`${d}T00:00:00Z`).getUTCDay()]!, sub: `${d.slice(8, 10)}/${d.slice(5, 7)}`, today: d === on, off: offAll(d) }))}
      rows={rows.map((x) => ({ key: x.employee, head: <span className="inline-flex items-center gap-2"><Avatar name={nameOf(ar, x.name)} hue={roleHue(x.title)} size={24} /><Link to="/digit-hr/employees/$name" params={{ name: x.employee }} className="hover:underline" data-no-i18n>{nameOf(ar, x.name)}</Link></span>,
        sub: <>{x.title ? nameOf(ar, x.title) : ""} · <bdi data-no-i18n>{fmtNumber(x.hours, 0)}</bdi> {pick(ar, ["h", "س"])}</>,
        tag: x.ot > 0 ? <span className="text-xs font-bold text-[var(--error)]" data-roster-person-ot={x.ot}>{ar ? `عمل إضافي ${fmtNumber(x.ot, 1)} س` : `Overtime ${fmtNumber(x.ot, 1)} h`}</span> : undefined }))}
      cell={cell}
      foot={[
        { key: "people", label: pick(ar, ["On shift", "في الوردية"]), cell: (d) => <bdi data-no-i18n>{r.rows.filter((x) => x.cells[d]?.kind === "shift").length}</bdi>, total: <bdi data-no-i18n>{r.rows.length}</bdi> },
        { key: "hours", label: pick(ar, ["Hours", "الساعات"]), cell: (d) => <bdi data-no-i18n>{fmtNumber(hours(d), 0)}</bdi>, total: <bdi data-no-i18n>{fmtNumber(r.days.reduce((a, d) => a + hours(d), 0), 0)}</bdi> },
        { key: "cost", label: pick(ar, ["Cost", "التكلفة"]), tone: "strong", cell: (d) => { const v = cost(d); return v === null ? <span className="text-muted-foreground">—</span> : <bdi data-no-i18n data-roster-cost={d}>{money(v)}</bdi>; }, total: r.costVisible ? <bdi data-no-i18n data-roster-cost-total>{money(total)}</bdi> : <span className="text-muted-foreground">—</span> },
      ]}
      empty={pick(ar, ["No shift assignments this week for this team.", "لا توجد تكليفات ورديات هذا الأسبوع لهذا الفريق."])}
      legend={<span className="flex flex-wrap items-center gap-3 text-xs">{!r.costVisible && <span data-roster-cost-hidden>{pick(ar, ["Cost needs salary access (HR roles).", "التكلفة تحتاج صلاحية الرواتب (أدوار الموارد البشرية)."])}</span>}<span>{pick(ar, ["Cost per day = daily rate (base ÷ 30) of each person on shift + overtime at the policy rate; overtime from approved overtime slips.", "تكلفة اليوم = الأجر اليومي (الأساسي ÷ 30) لكل من في الوردية + العمل الإضافي بنسبة السياسة؛ العمل الإضافي من قسائم العمل الإضافي المعتمدة."])}</span><span className="font-bold text-[var(--error)]">{pick(ar, ["Red = overtime this week", "الأحمر = عمل إضافي هذا الأسبوع"])}</span></span>} />
    {r.rows.length > 12 && <button type="button" className="ek-oc-hidden justify-self-start" onClick={() => setMore((v) => !v)} data-roster-more>{more ? pick(ar, ["Show fewer", "عرض أقل"]) : pick(ar, [`${r.rows.length - 12} not shown — show all`, `${r.rows.length - 12} غير معروض — عرض الكل`])}</button>}
  </div>;
}
