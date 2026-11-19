/**
 * Project schedule (PRJ-03 Project 360 → Execution): duration-weighted planned vs actual physical progress, a Gantt
 * timeline over native Tasks, dependency conflicts, the approved stage-plan baseline, the delay register and the
 * downstream reschedule preview → apply. The time axis is never mirrored: dates read left → right in Arabic too;
 * only labels follow the page direction. Nothing is written until the user applies a previewed reschedule.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { notifyError, notifySaved } from "./notify";
import { localizeRuleMessage } from "../i18n/ruleMessages";
import { adapter, type Doc } from "@/lib/adapter";
import { indexQuery, loadMeta } from "@/lib/catalog";
import { hasPerm } from "@/lib/session";
import { today } from "../domain/data";
import {
  addDays, applyReschedule, daysBetween, durationDays, isLateStart, isOverdue, previewReschedule, scheduleKpis, scheduleOf,
  type Conflict, type Preview, type SchedTask,
} from "../domain/schedule";
import { DataTable, DocRef, Empty, Field, inputCls, Kpi, KpiGrid, ListRef, NewDoc, Note, pctTxt, Section, StateBadge, useCx, dateTxt, type Col, BTN } from "./kit";
import { DateInput } from "@/components/form/DateInput";

type R = Record<string, unknown>;
const ZOOMS = [{ k: "month", w: 4, en: "Month", ar: "شهر" }, { k: "week", w: 12, en: "Week", ar: "أسبوع" }, { k: "day", w: 28, en: "Day", ar: "يوم" }] as const;
const ROW = 30, HEAD = 40, GROUP = 24;
const PARTY_AR: Record<string, string> = { Client: "العميل", Contractor: "المقاول", Subcontractor: "مقاول الباطن", Supplier: "المورد", Consultant: "الاستشاري", "Force Majeure": "قوة قاهرة" };
const msOf = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

function useTaskMeta() {
  const idx = useQuery(indexQuery);
  return useQuery({ queryKey: ["digit-construction-meta", "Task", !!idx.data], enabled: !!idx.data, staleTime: Infinity, queryFn: async () => (await loadMeta(idx.data!, "Task")) ?? null }).data ?? undefined;
}

export function ProjectSchedule({ p }: { p: Doc }) {
  const { t, ar, user } = useCx();
  const asOf = today();
  const s = scheduleOf(p.name);
  const k = scheduleKpis(s, asOf);
  const meta = useTaskMeta();
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState({ start: "", end: "", keep: true });
  const [prev, setPrev] = useState<{ preview?: Preview; errors: string[] } | null>(null);
  const selected = s.tasks.find((x) => x.name === sel);
  const canWrite = (name: string) => { const d = adapter.get("Task", name); return !!meta && !!d && hasPerm(meta, "write", d, user); };

  const pick = (name: string, shift = 0) => {
    const x = s.tasks.find((y) => y.name === name); if (!x) return;
    setSel(name); setForm({ start: addDays(x.start, shift), end: addDays(x.end, shift), keep: true });
    setPrev(shift ? previewReschedule(s, name, addDays(x.start, shift), addDays(x.end, shift)) : null);
    requestAnimationFrame(() => document.getElementById("digit-reschedule")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };
  const setStart = (v: string) => setForm((f) => (f.keep && selected && v ? { ...f, start: v, end: addDays(v, durationDays(selected.start, selected.end) - 1) } : { ...f, start: v }));
  const apply = () => {
    if (!prev?.preview || !meta) return;
    const r = applyReschedule(meta, prev.preview, user);
    if (!r.ok) { notifyError(t("Reschedule not applied", "لم تُطبَّق إعادة الجدولة"), { description: r.errors.join("\n") }); return; }
    notifySaved(t(`Rescheduled ${r.changed.length} task(s)`, `تمت إعادة جدولة ${r.changed.length} مهمة`));
    setPrev(null);
  };

  if (!s.tasks.length) return (
    <Section id="schedule" title={t("Schedule", "الجدول الزمني")} actions={<NewDoc doctype="Task" defaults={{ project: p.name, company: p["company"] }} label={t("Task", "مهمة")} />}>
      <Empty>{t("No dated tasks yet — give tasks a planned start and end date to see the schedule.", "لا توجد مهام مؤرخة بعد — أدخل تاريخي البداية والنهاية المخططين للمهام لعرض الجدول الزمني.")}</Empty>
    </Section>
  );

  const behind = k.actual < k.planned - 10 ? "bad" : k.actual < k.planned ? "warn" : "good";
  return (
    <Section id="schedule" title={t("Schedule", "الجدول الزمني")} actions={<ListRef doctype="Digit Task Dependency" filters={[["project", "=", p.name]]}>{t("Dependencies", "الاعتماديات")}</ListRef>}>
      <KpiGrid>
        <Kpi label={t("Planned progress today", "الإنجاز المخطط حتى اليوم")} value={pctTxt(k.planned)} hint={t("duration-weighted", "مرجح بالمدة")} />
        <Kpi label={t("Actual physical progress", "الإنجاز الفعلي")} value={pctTxt(k.actual)} tone={behind} hint={`${signed(Math.round((k.actual - k.planned) * 10) / 10)} ${t("pts vs plan", "نقطة عن الخطة")}`} />
        <Kpi label={t("Overdue tasks", "مهام متأخرة")} value={k.overdue} tone={k.overdue ? "bad" : "good"} list={{ doctype: "Task", filters: [["project", "=", p.name], ["exp_end_date", "<", asOf], ["progress", "<", 100]] }} />
        <Kpi label={t("Late starts", "بدايات متأخرة")} value={k.lateStart} tone={k.lateStart ? "warn" : "good"} />
        <Kpi label={t("Open dependency conflicts", "تعارضات اعتمادية مفتوحة")} value={k.openConflicts} tone={k.openConflicts ? "warn" : "good"} />
        <Kpi label={t("Forecast finish", "الانتهاء المتوقع")} value={<span className="whitespace-nowrap">{dateTxt(k.finish)}</span>} tone={k.finishVariance && k.finishVariance > 0 ? "bad" : "default"}
          hint={k.finishVariance === null ? t("no project end date", "لا يوجد تاريخ انتهاء للمشروع") : `${signed(k.finishVariance)} ${t("days vs project end", "يوم عن نهاية المشروع")}`} />
      </KpiGrid>
      <Gantt s={s} asOf={asOf} selected={sel} onPick={(n) => pick(n)} conflicts={k.conflicts} />
      <p className="mt-2 text-[11px] text-muted-foreground">
        {t("Calendar days, start and end inclusive. Baseline = the latest approved stage plan per task", "أيام تقويمية تشمل البداية والنهاية. خط الأساس = آخر خطة مرحلة معتمدة لكل مهمة")}
        {" "}(<span data-no-i18n>{k.baselined}</span> {t("tasks baselined", "مهمة لها خط أساس")}{k.maxSlip !== null && <>, {t("max slippage", "أقصى انزلاق")} <span data-no-i18n>{signed(k.maxSlip)}</span> {t("days", "يوم")}</>}).
        {" "}{t("Progress here is operational only — it never measures, certifies or invoices.", "الإنجاز هنا تشغيلي فقط — لا يقيس ولا يعتمد ولا يفوتر.")}
        {k.undated > 0 && <> {" "}<ListRef doctype="Task" filters={[["project", "=", p.name], ["exp_start_date", "is", "not set"]]}><span data-no-i18n>{k.undated}</span> {t("tasks without dates are not shown", "مهام بلا تواريخ غير معروضة")}</ListRef></>}
      </p>

      {selected && (
        <div id="digit-reschedule" className="mt-4 rounded-md border border-border p-3" role="region" aria-label={t("Reschedule task", "إعادة جدولة مهمة")}>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{t("Reschedule", "إعادة جدولة")}</span>
            <DocRef doctype="Task" name={selected.name} />
            <span className="min-w-0 truncate text-muted-foreground" data-no-i18n>{selected.subject}</span>
            <StateBadge state={selected.status} />
            <span className="text-xs text-muted-foreground">{t("Current", "الحالي")}: <span data-no-i18n dir="ltr">{dateTxt(selected.start)} → {dateTxt(selected.end)}</span> · <span data-no-i18n>{durationDays(selected.start, selected.end)}</span> {t("days", "يوم")}</span>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t("New start", "البداية الجديدة")}><DateInput dir="ltr" className={inputCls} value={form.start} onChange={(e) => { setStart(e.target.value); setPrev(null); }} /></Field>
            <Field label={t("New end", "النهاية الجديدة")}><DateInput dir="ltr" className={inputCls} value={form.end} disabled={form.keep} onChange={(e) => { setForm((f) => ({ ...f, end: e.target.value })); setPrev(null); }} /></Field>
            <label className="flex items-center gap-1.5 pb-2 text-xs"><input type="checkbox" checked={form.keep} onChange={(e) => setForm((f) => ({ ...f, keep: e.target.checked }))} />{t("Keep duration", "الحفاظ على المدة")}</label>
            <button type="button" className={BTN.secondary} onClick={() => setPrev(previewReschedule(s, selected.name, form.start, form.end))}>{t("Preview impact", "معاينة الأثر")}</button>
            <button type="button" className={`${BTN.secondary} border-transparent bg-transparent text-muted-foreground`} onClick={() => { setSel(null); setPrev(null); }}>{t("Close", "إغلاق")}</button>
          </div>
          {prev && <PreviewView prev={prev} canWrite={canWrite} metaReady={!!meta} onApply={apply} />}
        </div>
      )}

      <Conflicts conflicts={k.conflicts} tasks={s.tasks} onFix={(c) => pick(c.edge.successor, c.days)} />
      {s.delays.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold">{t("Delay register", "سجل التأخير")} <span className="text-xs font-normal text-muted-foreground">({t("from stage plans", "من خطط المراحل")} · <span data-no-i18n>{k.delayDays}</span> {t("days", "يوم")})</span></h3>
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            {k.delayByParty.map(([party, days]) => <span key={party} className="rounded bg-muted px-2 py-0.5">{ar ? PARTY_AR[party] ?? party : party}: <span data-no-i18n>{days}</span> {t("days", "يوم")}</span>)}
          </div>
          <DataTable rows={s.delays as unknown as R[]} pageSize={8} empty="—" cols={[
            { key: "plan", label: t("Stage plan", "خطة المرحلة"), kind: "doc", doctype: "Digit Stage Planning" },
            { key: "stage", label: t("Stage", "المرحلة") },
            { key: "reason", label: t("Reason", "السبب") },
            { key: "party", label: t("Responsible party", "الجهة المسؤولة"), render: (r) => <span>{ar ? PARTY_AR[String(r["party"])] ?? String(r["party"]) : String(r["party"])}</span> },
            { key: "days", label: t("Days", "الأيام"), kind: "num", total: true },
            { key: "logged_on", label: t("Logged on", "تاريخ التسجيل"), kind: "date" },
          ] as Col<R>[]} />
        </div>
      )}
    </Section>
  );
}

function PreviewView({ prev, canWrite, metaReady, onApply }: { prev: { preview?: Preview; errors: string[] }; canWrite: (n: string) => boolean; metaReady: boolean; onApply: () => void }) {
  const { t, ar } = useCx();
  if (!prev.preview) return <div className="mt-3"><Note tone="bad">{prev.errors.map((e) => <div key={e}>{localizeRuleMessage(e, ar)}</div>)}</Note></div>;
  const pv = prev.preview;
  const all = [pv.task, ...pv.moves.map((m) => m.task)];
  const denied = all.filter((n) => !canWrite(n));
  const reason = pv.blocked.length ? t("Blocked — see the reasons above", "محظور — راجع الأسباب أعلاه") : !metaReady ? t("Loading permissions…", "جارٍ تحميل الصلاحيات…") : denied.length ? t(`You cannot edit: ${denied.join(", ")}`, `لا تملك صلاحية تعديل: ${denied.join("، ")}`) : undefined;
  const rows: R[] = [{ task: pv.task, old_start: pv.old_start, old_end: pv.old_end, new_start: pv.new_start, new_end: pv.new_end, shift: daysBetween(pv.old_start, pv.new_start), reason: t("requested", "مطلوب") }, ...pv.moves as unknown as R[]];
  const warn = pv.warnings;
  return (
    <div className="mt-3">
      <p className="mb-2 text-sm">
        {t(`${pv.moves.length} successor task(s) move.`, `ستتحرك ${pv.moves.length} مهمة لاحقة.`)}{" "}
        {t("Finish", "الانتهاء")}: <span data-no-i18n dir="ltr">{dateTxt(pv.finish.current)} → {dateTxt(pv.finish.proposed)}</span>
        {pv.finish.projectEnd && <> · {t("project end", "نهاية المشروع")} <span data-no-i18n dir="ltr">{dateTxt(pv.finish.projectEnd)}</span></>}
      </p>
      {pv.blocked.length > 0 && <Note tone="bad">{pv.blocked.map((b) => <div key={b}>{b}</div>)}</Note>}
      {warn.length > 0 && <Note tone="warn">{warn.map((w) => <div key={w.task + w.kind}><span data-no-i18n>{w.task}</span>: {w.kind === "beyond_project_end" ? t("ends after the project end date by", "ينتهي بعد تاريخ نهاية المشروع بـ") : t("ends after its approved baseline by", "ينتهي بعد خط الأساس المعتمد بـ")} <span data-no-i18n>{w.days}</span> {t("days", "يوم")}</div>)}</Note>}
      <DataTable rows={rows} pageSize={20} empty="—" cols={[
        { key: "task", label: t("Task", "المهمة"), kind: "doc", doctype: "Task" },
        { key: "old_start", label: t("Current start", "البداية الحالية"), kind: "date" }, { key: "old_end", label: t("Current end", "النهاية الحالية"), kind: "date" },
        { key: "new_start", label: t("Proposed start", "البداية المقترحة"), kind: "date" }, { key: "new_end", label: t("Proposed end", "النهاية المقترحة"), kind: "date" },
        { key: "shift", label: t("Shift (days)", "الإزاحة (أيام)"), render: (r) => <span className="tabular-nums" data-no-i18n>{signed(Number(r["shift"]))}</span> },
        { key: "reason", label: t("Why", "السبب"), render: (r) => <span className="font-mono text-xs" data-no-i18n>{String(r["reason"] ?? "")}</span> },
      ] as Col<R>[]} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onApply} disabled={!!reason} title={reason} className={BTN.primary}>{t(`Apply to ${all.length} task(s)`, `تطبيق على ${all.length} مهمة`)}</button>
        {reason && <span className="text-xs text-muted-foreground" role="status">{reason}</span>}
      </div>
    </div>
  );
}

function Conflicts({ conflicts, tasks, onFix }: { conflicts: Conflict[]; tasks: SchedTask[]; onFix: (c: Conflict) => void }) {
  const { t } = useCx();
  const [showHist, setShowHist] = useState(false);
  const open = conflicts.filter((c) => !c.historical), hist = conflicts.length - open.length;
  const subj = new Map(tasks.map((x) => [x.name, x.subject]));
  const shown = showHist ? conflicts : open;
  return (
    <div className="mt-4">
      <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">{t("Dependency conflicts", "تعارضات الاعتمادية")}
        {hist > 0 && <button type="button" className="text-xs font-normal text-primary hover:underline" onClick={() => setShowHist((v) => !v)}>{showHist ? t("Hide completed pairs", "إخفاء الأزواج المكتملة") : t(`Show ${hist} completed pair(s)`, `عرض ${hist} زوج مكتمل`)}</button>}
      </h3>
      {!shown.length ? <p className="text-sm text-muted-foreground" role="status">{t("No open conflicts — every dependency between unfinished tasks is satisfied.", "لا تعارضات مفتوحة — كل اعتماديات المهام غير المكتملة مستوفاة.")}</p> : (
        <DataTable rows={shown.map((c) => ({ predecessor: c.edge.predecessor, successor: c.edge.successor, type: `${c.edge.type}${c.edge.lag ? ` ${signed(c.edge.lag)}d` : ""}`, days: c.days, source: c.edge.source, historical: c.historical, c })) as unknown as R[]} pageSize={10} empty="—" cols={[
          { key: "predecessor", label: t("Predecessor", "المهمة السابقة"), render: (r) => <span><DocRef doctype="Task" name={r["predecessor"]} /> <span className="text-xs text-muted-foreground" data-no-i18n>{subj.get(String(r["predecessor"]))}</span></span> },
          { key: "successor", label: t("Successor", "المهمة اللاحقة"), render: (r) => <span><DocRef doctype="Task" name={r["successor"]} /> <span className="text-xs text-muted-foreground" data-no-i18n>{subj.get(String(r["successor"]))}</span></span> },
          { key: "type", label: t("Type / lag", "النوع / الفاصل"), render: (r) => <span className="font-mono text-xs" data-no-i18n>{String(r["type"])}</span> },
          { key: "days", label: t("Conflict (days)", "التعارض (أيام)"), kind: "num" },
          { key: "source", label: t("Source", "المصدر"), render: (r) => String(r["source"]) === "Task.depends_on" ? <span className="text-xs">{t("Task dependency table", "جدول اعتماديات المهمة")}</span> : <DocRef doctype="Digit Task Dependency" name={r["source"]} /> },
          { key: "fix", label: "", render: (r) => r["historical"] ? <span className="text-xs text-muted-foreground">{t("history", "سجل")}</span> : <button type="button" className="text-xs text-primary hover:underline" onClick={() => onFix(r["c"] as Conflict)}>{t("Preview fix", "معاينة الحل")}</button> },
        ] as Col<R>[]} />
      )}
    </div>
  );
}

function Gantt({ s, asOf, selected, onPick, conflicts }: { s: ReturnType<typeof scheduleOf>; asOf: string; selected: string | null; onPick: (n: string) => void; conflicts: Conflict[] }) {
  const { t, ar } = useCx();
  const [zi, setZi] = useState(0);
  const [grouped, setGrouped] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const mk = useId().replace(/[^a-zA-Z0-9]/g, "");
  const dayW = ZOOMS[zi]!.w;
  const tasks = s.tasks;

  const lines = useMemo(() => {
    const out: ({ kind: "group"; key: string; label: string; y: number } | { kind: "task"; t: SchedTask; y: number })[] = [];
    let y = HEAD;
    if (grouped) {
      const order: string[] = []; const by = new Map<string, SchedTask[]>();
      for (const x of tasks) { if (!by.has(x.group)) { by.set(x.group, []); order.push(x.group); } by.get(x.group)!.push(x); }
      order.sort((a, b) => (a === "" ? 1 : b === "" ? -1 : 0));
      for (const g of order) { const ts = by.get(g)!; out.push({ kind: "group", key: g, label: g ? ts[0]!.groupLabel : "", y }); y += GROUP; for (const x of ts) { out.push({ kind: "task", t: x, y }); y += ROW; } }
    } else for (const x of tasks) { out.push({ kind: "task", t: x, y }); y += ROW; }
    return { out, height: y + 6 };
  }, [tasks, grouped]);

  const starts = [...tasks.map((x) => x.start), ...[...s.baseline.values()].map((b) => b.start)];
  const ends = [...tasks.map((x) => x.end), ...[...s.baseline.values()].map((b) => b.end)];
  let lo = starts.reduce((m, x) => (x < m ? x : m)), hi = ends.reduce((m, x) => (x > m ? x : m));
  if (daysBetween(hi, asOf) > 0 && daysBetween(hi, asOf) < 120) hi = asOf;
  if (daysBetween(asOf, lo) > 0 && daysBetween(asOf, lo) < 120) lo = asOf;
  const min = addDays(lo, -5), max = addDays(hi, 10);
  const days = daysBetween(min, max) + 1, W = days * dayW, H = lines.height;
  const X = (d: string, endOfDay = false) => (daysBetween(min, d) + (endOfDay ? 1 : 0)) * dayW;
  const showToday = asOf >= min && asOf <= max;

  useEffect(() => { const el = scroller.current; if (el) el.scrollLeft = Math.max(0, (showToday ? X(asOf) : 0) - el.clientWidth / 3); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayW, min, asOf]);

  const months: string[] = [];
  for (let d = min.slice(0, 8) + "01"; d <= max; d = addDays(d.slice(0, 8) + "28", 5).slice(0, 8) + "01") months.push(d);
  const fmtM = new Intl.DateTimeFormat(ar ? "ar-u-ca-gregory-nu-latn" : "en-GB", { month: "short", year: zi === 0 ? "2-digit" : "numeric", timeZone: "UTC" });
  const weeks: string[] = []; if (zi > 0) for (let d = min; d <= max; d = addDays(d, 7)) weeks.push(d);
  const yOf = new Map(lines.out.flatMap((l) => (l.kind === "task" ? [[l.t.name, l.y] as const] : [])));
  const byName = new Map(tasks.map((x) => [x.name, x]));
  const bad = new Set(conflicts.filter((c) => !c.historical).map((c) => `${c.edge.predecessor}>${c.edge.successor}`));
  const key = (e: KeyboardEvent, n: string) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(n); } };
  const L = (x: SchedTask) => `${x.subject} (${x.name}): ${x.start} → ${x.end}, ${x.progress}%`;

  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2 text-xs">
        <span className="font-medium">{t("Zoom", "التكبير")}</span>
        <div className="inline-flex overflow-hidden rounded-md border border-input" role="group" aria-label={t("Zoom", "التكبير")}>
          {ZOOMS.map((z, i) => <button key={z.k} type="button" aria-pressed={i === zi} onClick={() => setZi(i)} className={`px-2.5 py-1 ${i === zi ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{ar ? z.ar : z.en}</button>)}
        </div>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />{t("Group by work package", "تجميع حسب حزمة العمل")}</label>
        <span className="ms-auto flex flex-wrap items-center gap-3 text-muted-foreground">
          <Legend cls="bg-primary/30" label={t("Plan", "الخطة")} /><Legend cls="bg-primary" label={t("Progress", "الإنجاز")} /><Legend cls="bg-destructive" label={t("Overdue", "متأخرة")} />
          <Legend cls="bg-success" label={t("Completed", "مكتملة")} /><Legend cls="border border-dashed border-muted-foreground" label={t("Approved baseline", "خط الأساس المعتمد")} /><Legend cls="bg-warning" label={t("Today", "اليوم")} line />
          <span>{t("Arrows: dependencies (red = conflict)", "الأسهم: الاعتماديات (الأحمر = تعارض)")}</span>
        </span>
      </div>
      <div className="flex min-w-0 text-xs">
        <div className="w-36 flex-none border-e border-border sm:w-56">
          <div className="flex items-end border-b border-border px-2 pb-1 font-medium text-muted-foreground" style={{ height: HEAD }}>{t("Task", "المهمة")}</div>
          {lines.out.map((l) => l.kind === "group" ? (
            <div key={"g" + l.key} className="flex items-center truncate bg-muted px-2 text-[11px] font-semibold" style={{ height: GROUP }} data-no-i18n={l.key ? true : undefined}>
              {l.key ? <DocRef doctype="Digit Work Package" name={l.key} className="truncate hover:underline">{l.label}</DocRef> : t("No work package", "بدون حزمة عمل")}
            </div>
          ) : (
            <button key={l.t.name} type="button" onClick={() => onPick(l.t.name)} aria-pressed={selected === l.t.name} title={L(l.t)}
              className={`flex w-full items-center gap-1.5 truncate px-2 text-start hover:bg-muted ${selected === l.t.name ? "bg-primary/10" : ""}`} style={{ height: ROW }}>
              <span className={`size-1.5 flex-none rounded-full ${l.t.done ? "bg-success" : isOverdue(l.t, asOf) ? "bg-destructive" : isLateStart(l.t, asOf) ? "bg-warning" : "bg-primary"}`} aria-hidden />
              <span className="truncate" data-no-i18n>{l.t.subject}</span>
            </button>
          ))}
        </div>
        <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto" dir="ltr">
          <svg width={W} height={H} className="block" data-no-i18n role="img" aria-label={t("Gantt timeline", "مخطط جانت الزمني")}>
            <defs>
              <marker id={`a${mk}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground" /></marker>
              <marker id={`b${mk}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" className="fill-destructive" /></marker>
            </defs>
            {lines.out.map((l) => l.kind === "group" ? <rect key={"gb" + l.key} x={0} y={l.y} width={W} height={GROUP} className="fill-muted" /> : null)}
            {months.map((m) => { const x = X(m < min ? min : m); return (
              <g key={m}><line x1={x} x2={x} y1={0} y2={H} className="stroke-border" /><text x={x + 4} y={zi > 0 ? 15 : 24} className="fill-muted-foreground text-[10px]">{fmtM.format(new Date(msOf(m)))}</text></g>
            ); })}
            {weeks.map((w) => <text key={w} x={X(w) + 2} y={33} className="fill-muted-foreground text-[9px]">{w.slice(8)}</text>)}
            <line x1={0} x2={W} y1={HEAD - 0.5} y2={HEAD - 0.5} className="stroke-border" />
            {showToday && <line x1={X(asOf) + dayW / 2} x2={X(asOf) + dayW / 2} y1={HEAD - 6} y2={H} className="stroke-warning" strokeWidth={2} />}
            {s.edges.map((e) => {
              const p = byName.get(e.predecessor), q = byName.get(e.successor); const yp = yOf.get(e.predecessor), yq = yOf.get(e.successor);
              if (!p || !q || yp === undefined || yq === undefined) return null;
              const fromEnd = e.type === "FS" || e.type === "FF", toEnd = e.type === "FF" || e.type === "SF";
              const x1 = fromEnd ? X(p.end, true) : X(p.start), x2 = toEnd ? X(q.end, true) : X(q.start), y1 = yp + ROW / 2, y2 = yq + ROW / 2;
              const elbow = fromEnd ? x1 + 6 : x1 - 6; const conflict = bad.has(`${e.predecessor}>${e.successor}`);
              return <path key={e.source + e.predecessor + e.successor} d={`M${x1},${y1} H${elbow} V${y2} H${x2}`} fill="none" strokeWidth={1.2} className={conflict ? "stroke-destructive" : "stroke-muted-foreground"} strokeDasharray={conflict ? "3 2" : undefined} markerEnd={`url(#${conflict ? "b" : "a"}${mk})`} />;
            })}
            {lines.out.map((l) => {
              if (l.kind !== "task") return null;
              const x = l.t; const bx = X(x.start), bw = Math.max(3, durationDays(x.start, x.end) * dayW), by = l.y + 8, bh = 14;
              const od = isOverdue(x, asOf); const base = s.baseline.get(x.name);
              const tone = x.done ? "fill-success" : od ? "fill-destructive" : "fill-primary";
              return (
                <g key={x.name} role="button" tabIndex={0} aria-label={L(x)} onClick={() => onPick(x.name)} onKeyDown={(e) => key(e, x.name)} className="cursor-pointer outline-none focus-visible:opacity-80">
                  <title>{L(x)}</title>
                  {base && <rect x={X(base.start)} y={l.y + 24} width={Math.max(3, durationDays(base.start, base.end) * dayW)} height={4} rx={1} className="fill-none stroke-muted-foreground" strokeDasharray="3 2" />}
                  {x.milestone ? (
                    <polygon points={`${X(x.end, true)},${by - 1} ${X(x.end, true) + 8},${by + bh / 2} ${X(x.end, true)},${by + bh + 1} ${X(x.end, true) - 8},${by + bh / 2}`} className={tone} />
                  ) : (
                    <>
                      <rect x={bx} y={by} width={bw} height={bh} rx={3} className={x.done ? "fill-success/30" : od ? "fill-destructive/25" : "fill-primary/25"} />
                      <rect x={bx} y={by} width={(bw * x.progress) / 100} height={bh} rx={3} className={tone} />
                    </>
                  )}
                  {selected === x.name && <rect x={bx - 2} y={by - 2} width={bw + 4} height={bh + 4} rx={4} className="fill-none stroke-foreground" strokeWidth={1.5} />}
                  {dayW >= 12 && bw > 40 && <text x={bx + 4} y={by + 10.5} className="pointer-events-none fill-foreground text-[9px]">{x.progress}%</text>}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

function Legend({ cls, label, line }: { cls: string; label: string; line?: boolean }) {
  return <span className="inline-flex items-center gap-1"><span className={`${line ? "h-3 w-0.5" : "h-2.5 w-4 rounded-sm"} ${cls}`} aria-hidden />{label}</span>;
}
