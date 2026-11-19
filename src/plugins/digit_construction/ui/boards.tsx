/**
 * Construction resource boards (owner 2026-11-16 ideas 1–4) drawn with the Enterprise kit ResourceBoard:
 * weekly crew board with the labour budget line, equipment load by day, and one site day hour by hour.
 * Figures come from domain/boards.ts; individual rates and costs show only to the rate roles (DEC-279, seesRates).
 */
import { useState, type ReactNode } from "react";
import { adapter } from "@/lib/adapter";
import { fmtNumber } from "@/lib/format";
import { BoardCard, HourBars, LoadMeter, PctMeter, WeekBoard, type BoardDay, type BoardFoot, type BoardHue, type HourRow } from "@/components/enterprise/kit/ResourceBoard";
import { addDays, crewWeek, dayHours, dayHoursProjects, isWorkday, latestAttendanceDay, latestUsageDay, machineWeek, weekStartOf, type BoardScope, type CrewRole } from "../domain/boards";
import { WORKDAY_HOURS } from "../domain/resources";
import { projectTitle, today } from "../domain/data";
import { OPTION_AR } from "../schema";
import { SPEC_AR } from "../spec/ar";
import { seesRates } from "../reportsRes";
import { DocRef, money, useCx } from "./kit";

export const ROLE_HUE: Record<CrewRole, BoardHue> = { Foreman: "violet", Skilled: "blue", Operator: "amber", Helper: "teal", Other: "grey" };
const DAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const DAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const num1 = (n: number) => fmtNumber(n, Number.isInteger(n) ? 0 : 1);
export const hrs = (n: number, ar: boolean) => (ar ? `${num1(n)} س` : `${num1(n)} h`);
/** «ساعة إضافي» / «ساعتان إضافي» / «5 ساعات إضافي» / «12 ساعة إضافي». */
export function otText(n: number, ar: boolean): string {
  if (!ar) return `${num1(n)} h overtime`;
  if (n === 1) return "ساعة إضافي"; if (n === 2) return "ساعتان إضافي";
  return Number.isInteger(n) && n >= 3 && n <= 10 ? `${n} ساعات إضافي` : `${num1(n)} ساعة إضافي`;
}
const roleLabel = (r: CrewRole, ar: boolean) => (r === "Other" ? (ar ? "بدون دور" : "No role") : ar ? OPTION_AR[r] ?? r : r);
const opt = (v: string, ar: boolean) => (ar ? OPTION_AR[v] ?? SPEC_AR[v] ?? v : v);
const projName = (p: string, ar: boolean) => projectTitle(adapter.get("Project", p), !ar) || p;
const dayHeads = (days: string[], ar: boolean, now: string): BoardDay[] => days.map((d) => {
  const w = new Date(`${d}T00:00:00Z`).getUTCDay();
  return { key: d, label: (ar ? DAY_AR : DAY_EN)[w], sub: dm(d), today: d === now, off: !isWorkday(d) };
});

function WeekNav({ start, set, home, ar }: { start: string; set: (s: string) => void; home: string; ar: boolean }) {
  const end = addDays(start, 6);
  return (
    <>
      <button type="button" onClick={() => set(addDays(start, -7))} data-week-prev>{ar ? "الأسبوع السابق" : "Previous week"}</button>
      <span className="font-semibold" data-week-label><span>{ar ? "من" : "From"}</span> <bdi data-no-i18n>{dm(start)}</bdi> <span>{ar ? "إلى" : "to"}</span> <bdi data-no-i18n>{dm(end)}</bdi></span>
      <button type="button" onClick={() => set(addDays(start, 7))} data-week-next>{ar ? "الأسبوع التالي" : "Next week"}</button>
      {start !== home && <button type="button" onClick={() => set(home)} data-week-home>{ar ? "آخر أسبوع مسجل" : "Latest recorded week"}</button>}
    </>
  );
}
const Sw = ({ hue, children }: { hue: BoardHue | "negative"; children: ReactNode }) => <span><span data-sw style={{ background: `var(--${hue})` }} />{children}</span>;

// ------------------------------------------------------------------ 1 + 2: crews by week with the labour budget line
export function CrewBoard({ scope, on }: { scope: BoardScope; on?: string }) {
  const { ar, t } = useCx(); const now = on ?? today();
  const home = weekStartOf(latestAttendanceDay(scope, now) ?? now);
  const [start, setStart] = useState(home);
  const wk = crewWeek(scope, start); const rates = seesRates();
  const foot: BoardFoot[] = [
    { key: "hours", label: t("Hours on site", "ساعات الموقع"), tone: "strong",
      cell: (d) => { const x = wk.totals.find((v) => v.day === d)!; return x.sheets ? <div data-no-i18n><div>{hrs(x.hours, ar)}</div>{x.overtime > 0 && <div className="ek-bc-alert">{otText(x.overtime, ar)}</div>}</div> : "—"; },
      total: <div data-no-i18n><div>{hrs(wk.week.hours, ar)}</div>{wk.week.overtime > 0 && <div className="ek-bc-alert">{otText(wk.week.overtime, ar)}</div>}</div> },
  ];
  if (rates) foot.push(
    { key: "cost", label: t("Labour cost (estimate)", "تكلفة العمالة (تقديرية)"), cell: (d) => { const x = wk.totals.find((v) => v.day === d)!; return x.sheets ? <span data-no-i18n>{money(x.cost)}</span> : "—"; }, total: <span data-no-i18n>{money(wk.week.cost)}</span> },
    { key: "plan", label: t("Planned crew day", "اليوم المخطط للطواقم"), cell: (d) => { const x = wk.totals.find((v) => v.day === d)!; return x.sheets ? <span data-no-i18n>{money(x.planned)}</span> : "—"; }, total: <span data-no-i18n>{money(wk.week.planned)}</span> },
    { key: "pct", label: t("Labour cost of the planned day", "تكلفة العمالة من المخطط"), tone: "strong",
      cell: (d) => { const x = wk.totals.find((v) => v.day === d)!; return x.sheets ? <PctMeter pct={x.pct} label={x.pct === null ? t("Not priced", "غير مسعّرة") : <bdi data-no-i18n>{`${num1(x.pct)}%`}</bdi>} /> : "—"; },
      total: <PctMeter pct={wk.week.pct} label={wk.week.pct === null ? t("Not priced", "غير مسعّرة") : <bdi data-no-i18n>{`${num1(wk.week.pct)}%`}</bdi>} /> },
  );
  const unpriced = wk.week.unpriced;
  return (
    <WeekBoard attrs={{ "data-crew-board": start }} title={t("Crews this week", "توزيع الطواقم بالأسبوع")} rowHead={t("Crew", "الطاقم")} totalHead={t("Week", "الأسبوع")}
      nav={<WeekNav start={start} set={setStart} home={home} ar={ar} />}
      days={dayHeads(wk.days, ar, now)} empty={t("No active crew in scope.", "لا يوجد طاقم نشط ضمن النطاق.")}
      rows={wk.rows.map((r) => ({ key: r.crew || "—", head: r.crew ? <DocRef doctype="Digit Crew" name={r.crew}>{r.name}</DocRef> : t("Sheets without a crew", "كشوف بدون طاقم"),
        sub: <span data-no-i18n>{projName(r.project, ar)}{r.trade ? ` · ${opt(r.trade, ar)}` : ""}{r.crew ? ` · ${r.members} ${ar ? (r.members > 2 && r.members <= 10 ? "أفراد" : "فرد") : "members"}` : ""}</span>,
        tag: rates && r.plannedDay > 0 ? <span className="text-[11px] text-muted-foreground"><span>{t("Planned day", "اليوم المخطط")}</span> <bdi data-no-i18n>{money(r.plannedDay)}</bdi></span> : undefined }))}
      cell={(rk, d) => {
        const r = wk.rows.find((x) => (x.crew || "—") === rk)!; const c = r.cells[d];
        if (!c) return isWorkday(d) && d < now ? <span className="text-[11px] text-muted-foreground">{t("No sheet", "لا كشف حضور")}</span> : null;
        return (
          <div data-crew-cell={c.sheet}>
            {c.roles.map((x) => { const ot = c.people.filter((p) => p.role === x.role && p.overtime > 0);
              return <BoardCard key={x.role} hue={ROLE_HUE[x.role]} attrs={{ "data-crew-role": x.role }} title={roleLabel(x.role, ar)} value={<bdi data-no-i18n>{`×${x.present} · ${hrs(x.hours, ar)}`}</bdi>}
                alert={ot.length ? <span data-no-i18n>{ot.map((p) => <span key={p.employee} className="block" data-crew-ot={p.overtime}>{p.name}: {otText(p.overtime, ar)}</span>)}</span> : undefined} />; })}
            {(c.absent > 0 || c.leave > 0) && <div className="text-[11px] text-muted-foreground" data-no-i18n>{[c.absent ? `${ar ? "غائب" : "Absent"} ${c.absent}` : "", c.leave ? `${ar ? "إجازة" : "Leave"} ${c.leave}` : ""].filter(Boolean).join(" · ")}</div>}
            <div className="mt-0.5 flex flex-wrap items-center justify-between gap-1 text-[11px]">
              <DocRef doctype="Digit Field Attendance" name={c.sheet}>{c.draft ? t("Draft sheet", "كشف مسودة") : t("Sheet", "الكشف")}</DocRef>
              {rates && c.cost !== null && <bdi className="text-muted-foreground" data-no-i18n>{money(c.cost)}</bdi>}
            </div>
          </div>
        );
      }}
      foot={foot}
      legend={<>
        {(["Foreman", "Skilled", "Operator", "Helper"] as CrewRole[]).map((r) => <Sw key={r} hue={ROLE_HUE[r]}>{roleLabel(r, ar)}</Sw>)}
        <Sw hue="negative">{t("Overtime, by person", "العمل الإضافي لكل شخص")}</Sw>
        <span className="basis-full">{rates
          ? t(`Estimate: hours × the labour classification rate, or the member's planned daily cost ÷ ${WORKDAY_HOURS} h when the row has no classification; overtime × 1.5 unless the rate sets a factor. Planned = the planned daily cost of the crew's members on days with a sheet.`,
              `تقديرية: الساعات × سعر تصنيف العمالة، أو التكلفة اليومية المخططة لعضو الطاقم ÷ ${WORKDAY_HOURS} ساعات عند غياب التصنيف؛ الإضافي × 1.5 ما لم يحدد السعر معاملًا. المخطط = التكلفة اليومية المخططة لأعضاء الطاقم في الأيام التي لها كشف حضور.`)
          : t("Costs and rates show to the accountant, director and project manager only.", "تظهر التكاليف والأسعار للمحاسب والمدير ومدير المشروع فقط.")}
          {rates && unpriced > 0 && <span className="ms-1 text-warning-text" data-no-i18n>{ar ? `· ${hrs(unpriced, ar)} بلا سعر ولا تكلفة مخططة` : `· ${hrs(unpriced, ar)} without a rate or planned cost`}</span>}</span>
      </>} />
  );
}

// ------------------------------------------------------------------ 3: equipment load by day
export function MachineBoard({ scope, on }: { scope: BoardScope; on?: string }) {
  const { ar, t } = useCx(); const now = on ?? today();
  const home = weekStartOf(latestUsageDay(scope, now) ?? now);
  const [start, setStart] = useState(home);
  const wk = machineWeek(scope, start); const av = wk.available;
  const tot = (d: string) => wk.totals.find((v) => v.day === d)!;
  return (
    <WeekBoard attrs={{ "data-machine-board": start }} title={t("Equipment load by day", "حِمل المعدات باليوم")} rowHead={t("Machine", "المعدة")} totalHead={t("Week", "الأسبوع")}
      nav={<WeekNav start={start} set={setStart} home={home} ar={ar} />}
      days={dayHeads(wk.days, ar, now)} empty={t("No machine deployed or used in scope.", "لا توجد معدة منتشرة أو مستخدمة ضمن النطاق.")}
      rows={wk.rows.map((r) => ({ key: r.machinery, head: <DocRef doctype="Digit Machinery" name={r.machinery}>{r.name}</DocRef>,
        sub: <span data-no-i18n>{opt(r.type, ar)}{r.project ? ` · ${projName(r.project, ar)}` : ""}</span>,
        tag: <span className="inline-flex flex-wrap gap-1" data-ownership={r.ownership}><span className="rounded-full border border-border px-1.5 text-[10.5px]">{r.ownership === "Rented" ? t("Rented", "مستأجرة") : r.ownership === "Owned" ? t("Owned", "مملوكة") : "—"}</span></span> }))}
      cell={(m, d) => {
        const c = wk.rows.find((x) => x.machinery === m)!.cells[d]; if (!c) return null;
        if (!c.usage.length) return c.booked && isWorkday(d) && d < now ? <span className="text-[11px] text-muted-foreground" data-machine-booked>{t("Booked — no hours logged", "محجوزة — بلا ساعات مسجلة")}</span> : null;
        return (
          <div data-machine-cell={c.used} data-over={c.used > av || undefined}>
            <LoadMeter used={c.used} available={av} label={<bdi data-no-i18n>{ar ? `${hrs(c.used, ar)} من ${hrs(av, ar)}` : `${hrs(c.used, ar)} of ${hrs(av, ar)}`}</bdi>} na={t("Unavailable", "غير متاحة")} />
            <div className="mt-1">{c.tasks.map((x) => <BoardCard key={x.task || "-"} hue={x.task ? "blue" : "grey"} title={<span data-no-i18n>{x.subject || t("No task", "بدون مهمة")}</span>} value={<bdi data-no-i18n>{hrs(x.hours, ar)}</bdi>} />)}</div>
            {c.down > 0 && <div className="ek-bc-alert" data-no-i18n>{ar ? `تعطل ${hrs(c.down, ar)}` : `Down ${hrs(c.down, ar)}`}{c.reason ? ` — ${opt(c.reason, ar)}` : ""}</div>}
            {c.idle > 0 && <div className="text-[11px] text-muted-foreground" data-no-i18n>{ar ? `خامل ${hrs(c.idle, ar)}` : `Idle ${hrs(c.idle, ar)}`}</div>}
          </div>
        );
      }}
      foot={[
        { key: "used", label: t("Hours used", "الساعات المستخدمة"), tone: "strong", cell: (d) => tot(d).machines ? <span data-no-i18n>{hrs(tot(d).used, ar)}</span> : "—", total: <span data-no-i18n>{hrs(wk.week.used, ar)}</span> },
        { key: "cap", label: t("Available (machines working × hours)", "المتاح (المعدات العاملة × الساعات)"), cell: (d) => tot(d).machines ? <span data-no-i18n>{`${tot(d).machines} × ${hrs(av, ar)} = ${hrs(tot(d).capacity, ar)}`}</span> : "—", total: <span data-no-i18n>{hrs(wk.week.capacity, ar)}</span> },
        { key: "util", label: t("Utilisation", "نسبة الاستخدام"), tone: "strong",
          cell: (d) => { const x = tot(d); return x.machines ? <div><PctMeter pct={x.pct} label={<bdi data-no-i18n>{`${num1(x.pct ?? 0)}%`}</bdi>} />{x.over > 0 && <div className="ek-bc-alert" data-no-i18n>{ar ? `${x.over} فوق المتاح` : `${x.over} over available`}</div>}</div> : "—"; },
          total: <PctMeter pct={wk.week.pct} label={wk.week.pct === null ? "—" : <bdi data-no-i18n>{`${num1(wk.week.pct)}%`}</bdi>} /> },
      ]}
      legend={<>
        <Sw hue="emerald">{t("Within the available hours", "ضمن الساعات المتاحة")}</Sw><Sw hue="negative">{t("Over the available hours", "فوق الساعات المتاحة")}</Sw><Sw hue="blue">{t("Task the hours went to", "المهمة التي ذهبت إليها الساعات")}</Sw>
        <span className="basis-full">{t(`Available hours per machine-day: ${num1(av)} h (Construction Settings; 8 until set) — the same basis as the Utilisation card.`, `الساعات المتاحة لكل معدة في اليوم: ${num1(av)} (إعدادات المقاولات؛ 8 حتى تُحدد) — نفس أساس بطاقة نسبة الاستخدام.`)}</span>
      </>} />
  );
}

// ------------------------------------------------------------------ 4: one site day, hour by hour
export function DayHoursPanel({ project, date, sheet }: { project: string; date: string; sheet?: string }) {
  const { ar, t } = useCx();
  const ps = dayHours(project, date, sheet);
  const sched = ps.reduce((s, p) => s + p.scheduled, 0), rec = ps.reduce((s, p) => s + p.hours, 0), ot = ps.reduce((s, p) => s + p.overtime, 0);
  const longest = Math.max(12, ...ps.map((p) => p.hours + p.overtime, 0));
  const axis = Math.ceil(longest / 2) * 2;
  const rows: HourRow[] = ps.map((p) => ({ key: p.key, who: <span data-no-i18n>{p.name}</span>, sub: <span data-no-i18n>{[p.crew, roleLabel(p.role, ar)].filter(Boolean).join(" · ")}</span>,
    scheduled: p.scheduled, normal: p.hours, overtime: p.overtime,
    note: p.attendance === "Absent" ? t("Absent", "غائب") : p.attendance === "On Leave" ? t("On leave", "إجازة") : <span data-no-i18n>{hrs(p.hours, ar)}{p.overtime > 0 ? ` + ${otText(p.overtime, ar)}` : ""}</span> }));
  return (
    <section data-day-hours={date} className="grid gap-1">
      <p className="text-sm font-semibold">{t("The site day hour by hour", "يوم العمل بالساعة")} <bdi className="font-normal text-muted-foreground" data-no-i18n>{dm(date)}</bdi></p>
      <p className="text-xs text-muted-foreground" data-day-hours-sum data-no-i18n>{ar ? `مسجّل ${hrs(rec, ar)} من مجدول ${hrs(sched, ar)}${ot ? ` · ${otText(ot, ar)}` : ""} · ${ps.length} ${ps.length > 2 && ps.length <= 10 ? "أشخاص" : "شخصًا"}` : `Recorded ${hrs(rec, ar)} of ${hrs(sched, ar)} scheduled${ot ? ` · ${otText(ot, ar)}` : ""} · ${ps.length} people`}</p>
      <HourBars rows={rows} axis={axis} ar={ar} hourLabel={(h) => (ar ? `${h}س` : `${h}h`)} empty={t("No attendance sheet for this project and day.", "لا يوجد كشف حضور لهذا المشروع وهذا اليوم.")}
        legend={<>
          <span><span data-sw style={{ border: "1.5px dashed var(--blue)" }} />{t(`Scheduled: the standard ${WORKDAY_HOURS}-hour day`, `المجدول: اليوم القياسي ${WORKDAY_HOURS} ساعات`)}</span>
          <Sw hue="blue">{t("Recorded", "المسجّل")}</Sw><Sw hue="negative">{t("Overtime", "الإضافي")}</Sw>
          <span className="basis-full">{t("Hours from the start of the shift: the attendance sheet records hours, not clock-in and clock-out times.", "الساعات من بداية الوردية: كشف الحضور يسجّل عدد الساعات وليس وقت الدخول والخروج.")}</span>
        </>} />
    </section>
  );
}

/** The site diary workspace: the latest recorded site day, one project at a time (the filtered project, else the first with sheets). */
export function SiteDayBoard({ scope, on }: { scope: BoardScope; on?: string }) {
  const { ar, t } = useCx(); const now = on ?? today();
  const date = latestAttendanceDay(scope, now);
  const projects = date ? [...new Set(dayHoursProjects(scope, date))] : [];
  const [pick, setPick] = useState<string>("");
  const project = scope.project || (projects.includes(pick) ? pick : projects[0] ?? "");
  if (!date || !project) return <p className="text-sm text-muted-foreground">{t("No attendance sheet in scope yet.", "لا يوجد كشف حضور ضمن النطاق بعد.")}</p>;
  return (
    <div className="ek-hb-wrap grid gap-2" data-site-day-board={project}>
      {!scope.project && projects.length > 1 && <div className="flex flex-wrap gap-1.5" role="tablist">{projects.map((p) => <button key={p} type="button" role="tab" aria-selected={p === project} onClick={() => setPick(p)}
        className={`rounded-full border px-2.5 py-0.5 text-xs ${p === project ? "border-primary bg-primary text-primary-foreground" : "border-border"}`} data-no-i18n>{projName(p, ar)}</button>)}</div>}
      <DayHoursPanel project={project} date={date} />
    </div>
  );
}
