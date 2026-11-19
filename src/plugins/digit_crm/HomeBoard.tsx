/**
 * Owner notes C-01 / C-02 / C-03 blocks — CRM Home «لوحة علاقات العملاء», «عملي اليوم» and «منضدة المدير» — drawn only
 * with the Enterprise kit (KpiRow, DistributionBar, RemainingRing, RequirementCards, FocusList, ProgressRings,
 * GroupedColumns, Avatar, Meter, Pill). Figures come from homeDesk.ts; every mark opens the list holding its records.
 */
import { Link } from "@tanstack/react-router";
import { leadTitle } from "./leadDesk";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { adapter } from "@/lib/adapter";
import { linkTitle } from "@/lib/linkTitle";
import { peekRow } from "@/components/enterprise/QuickView";
import { BlockCard } from "@/components/enterprise/kit/rank";
import { KpiRow, type KpiItem } from "@/components/enterprise/kit/templates";
import { DistributionBar, type DistSegment } from "@/components/enterprise/kit/DistributionBar";
import { RemainingRing } from "@/components/enterprise/kit/CostKit";
import { RequirementCards, type RequirementItem } from "@/components/enterprise/kit/RequirementCards";
import { FocusList, type FocusRow } from "@/components/enterprise/kit/FocusList";
import { GroupedColumns, Meter, ProgressRings, TONE_VAR, type Delta } from "@/components/enterprise/kit/charts";
import { Avatar, Pill } from "@/components/enterprise/kit/RecordFrame";
import { ACT_HUE, ACT_LABEL, BUCKET_LABEL, BUCKET_TONE, type ActKind } from "./activityDesk";
import { activityVolume, forecastPosition, forecastTrend, homeExceptions, homeFigures, leaders, pipelineByStage, teamCards, todayTimeline, doneToday, type Change } from "./homeDesk";
import { actionQueue, type QueueItem } from "./wf09";
import { completeTask } from "./wf01";
import { bulkReschedule, shiftDue } from "./salesDesk";
import { REASON_AR } from "./SalesDesk";
import { dueText, personLabel, sar, stageLabelOf, tx } from "./CrmRecordParts";
import { KindTile } from "./activityTile";

const s = (v: unknown) => String(v ?? "");
const HUES: NonNullable<DistSegment["hue"]>[] = ["blue", "teal", "violet", "amber", "emerald", "coral", "rose", "gold", "lime"];
const short = (n: number, ar: boolean) => { const a = Math.abs(n); const [v, u] = a >= 1e6 ? [n / 1e6, ar ? " مليون" : "M"] : a >= 1e3 ? [n / 1e3, ar ? " ألف" : "K"] : [n, ""]; return `\u20C1 ${(Math.round(v * 10) / 10).toLocaleString("en-US")}${u}`; };
const delta = (c: Change, ar: boolean, label: [string, string], better: Delta["better"] = "up"): Delta | undefined => (c.pct === null ? undefined : { pct: c.pct, better, label: tx(ar, label[0], label[1]) });
const VIEW_OF: Record<ActKind, string> = { task: "task", meeting: "meeting", call: "call", note: "note", email: "message", whatsapp: "message" };
const to = (path: string, search?: Record<string, string>) => (n: ReactNode) => <Link to={path as never} search={(search ?? {}) as never} className="contents">{n}</Link>;

/* ------------------------------------------------------------------ C-01 KPI cards ------------------------------------------------------------------ */
export function HomeKpis({ user, ar, id = "crm:home" }: { user: string; ar: boolean; id?: string }) {
  const f = homeFigures(user);
  const vs30: [string, string] = ["vs the previous 30 days", "مقابل الـ30 يومًا السابقة"];
  const items: KpiItem[] = [
    { id: "h:open", label: tx(ar, "Open pipeline", "خط الأنابيب المفتوح"), value: sar(f.openValue), sub: tx(ar, `${f.openCount} open deals · added in 30 days ${short(f.openValueAdded.cur, ar)}`, `${f.openCount} صفقة مفتوحة · أضيف خلال 30 يومًا ${short(f.openValueAdded.cur, ar)}`), delta: delta(f.openValueAdded, ar, vs30), tone: "info", wrap: to("/digit-crm/pipeline", { tab: "board" }) },
    { id: "h:leads", label: tx(ar, "New leads (30 days)", "عملاء محتملون جدد (30 يومًا)"), value: String(f.newLeads.cur), sub: tx(ar, `previous 30 days: ${f.newLeads.prev}`, `الـ30 يومًا السابقة: ${f.newLeads.prev}`), delta: delta(f.newLeads, ar, vs30), wrap: to("/digit-crm/leads") },
    { id: "h:won", label: tx(ar, "Won (30 days)", "المكسوب (30 يومًا)"), value: sar(f.wonValue.cur), sub: tx(ar, `${f.wonCount.cur} deals · previous ${f.wonCount.prev}`, `${f.wonCount.cur} صفقة · السابقة ${f.wonCount.prev}`), delta: delta(f.wonValue, ar, vs30), tone: "good", wrap: to("/digit-crm/pipeline", { tab: "analysis" }) },
    { id: "h:win", label: tx(ar, "Win rate", "نسبة الفوز"), value: f.winRate.pct === null ? "—" : `${f.winRate.pct}%`, sub: tx(ar, `${f.winRate.won} won of ${f.winRate.decided} decided`, `${f.winRate.won} مكسوبة من ${f.winRate.decided} محسومة`), tone: "good", wrap: to("/digit-crm/pipeline", { tab: "analysis" }) },
    { id: "h:acts", label: tx(ar, "Activities (7 days)", "الأنشطة (7 أيام)"), value: String(f.activities7.cur), sub: tx(ar, `previous 7 days: ${f.activities7.prev}`, `الأيام الـ7 السابقة: ${f.activities7.prev}`), delta: delta(f.activities7, ar, ["vs the previous 7 days", "مقابل الأيام الـ7 السابقة"]), wrap: to("/digit-crm/activities") },
    { id: "h:overdue", label: tx(ar, "Overdue follow-ups", "متابعات متأخرة"), value: String(f.overdue), sub: tx(ar, "open tasks past their due time", "مهام مفتوحة تجاوزت موعدها"), tone: f.overdue ? "risk" : "good", wrap: to("/digit-crm/activities", { view: "overdue" }) },
  ];
  return <KpiRow id={id} ar={ar} items={items} />;
}

/* ------------------------------------------------------------------ C-01 pipeline by stage ------------------------------------------------------------------ */
export function PipelineStageBar({ user, ar }: { user: string; ar: boolean }) {
  const st = pipelineByStage(user), total = st.reduce((a, x) => a + x.value, 0), n = st.reduce((a, x) => a + x.count, 0);
  const segs: DistSegment[] = st.map((x, i) => ({ key: x.key, label: stageLabelOf(x.key, ar), value: x.value, display: `${x.count} · ${short(x.value, ar)}`, hue: HUES[i % HUES.length]!, to: "/digit-crm/pipeline?tab=board" }));
  return <BlockCard id="crm-home-pipeline" title={tx(ar, "Pipeline by stage", "خط الأنابيب حسب المرحلة")} sub={tx(ar, "Open deal value per stage — click a stage to open the board.", "قيمة الصفقات المفتوحة في كل مرحلة — انقر المرحلة لفتح اللوحة.")} attrs={{ "data-crm-home-pipeline": String(n) }}>
    <div className="ek-card-pad pt-0">{n ? <DistributionBar segments={segs} footer={<span>{tx(ar, "Total open", "إجمالي المفتوح")} <b data-no-i18n>{sar(total)}</b> · <bdi data-no-i18n>{n}</bdi> {tx(ar, "deals", "صفقة")}</span>} />
      : <p className="text-sm text-muted-foreground">{tx(ar, "No open deals yet — every deal is won or lost.", "لا توجد صفقات مفتوحة — كل الصفقات مكسوبة أو خاسرة.")}</p>}</div>
  </BlockCard>;
}

/* ------------------------------------------------------------------ C-01 activity volume by type ------------------------------------------------------------------ */
export function ActivityVolumeCard({ user, ar }: { user: string; ar: boolean }) {
  const v = activityVolume(user, 30), total = v.reduce((a, x) => a + x.cur, 0);
  const segs: DistSegment[] = v.filter((x) => x.cur > 0).map((x) => ({ key: x.kind, label: ACT_LABEL[x.kind][ar ? 1 : 0], value: x.cur, display: String(x.cur), hue: ACT_HUE[x.kind], to: `/digit-crm/activities?view=${VIEW_OF[x.kind]}` }));
  return <BlockCard id="crm-home-activity" title={tx(ar, "Activity volume by type", "حجم الأنشطة حسب النوع")} sub={tx(ar, "Calls, meetings, emails, tasks and notes done in the last 30 days.", "المكالمات والاجتماعات والبريد والمهام والملاحظات المنجزة خلال آخر 30 يومًا.")} attrs={{ "data-crm-home-activity": String(total) }}>
    <div className="ek-card-pad pt-0">{total ? <DistributionBar segments={segs} footer={<span className="flex flex-wrap gap-x-3 gap-y-1">{v.map((x) => <span key={x.kind} data-act-vol={x.kind}>{ACT_LABEL[x.kind][ar ? 1 : 0]} <b data-no-i18n>{x.cur}</b>{x.pct !== null && <small className={x.pct >= 0 ? "text-[var(--success)]" : "text-[var(--negative)]"} data-no-i18n> {x.pct >= 0 ? "▲" : "▼"} {Math.abs(x.pct)}%</small>}</span>)}</span>} />
      : <p className="text-sm text-muted-foreground">{tx(ar, "No activity logged in the last 30 days.", "لم يُسجّل أي نشاط خلال آخر 30 يومًا.")}</p>}</div>
  </BlockCard>;
}

/* ------------------------------------------------------------------ C-01 forecast ring vs target ------------------------------------------------------------------ */
export function ForecastRingCard({ user, ar }: { user: string; ar: boolean }) {
  const p = forecastPosition(user), t = p.target;
  if (!t.target) return <BlockCard id="crm-home-forecast" title={tx(ar, "Forecast vs target", "التوقع مقابل الهدف")} attrs={{ "data-crm-home-forecast": "none" }}
    sub={t.fiscalYear ? tx(ar, `No target is set for fiscal year ${t.fiscalYear}; the forecast is ${sar(p.commit + p.best)} (commit + best case).`, `لا يوجد هدف للسنة المالية ${t.fiscalYear}؛ التوقع ${sar(p.commit + p.best)} (المؤكد + المحتمل).`) : tx(ar, "No open fiscal year covers today.", "لا توجد سنة مالية تغطي اليوم.")}>
    <div className="ek-card-pad pt-0"><Link to="/digit-crm/targets" className="text-sm font-semibold text-primary hover:underline">{tx(ar, "Open targets", "فتح الأهداف")}</Link></div></BlockCard>;
  return <RemainingRing title={tx(ar, "Forecast vs target", "التوقع مقابل الهدف")} level={p.covered === null ? "none" : p.covered >= 100 ? "ok" : p.covered >= 60 ? "warn" : "over"}
    attrs={{ "data-crm-home-forecast": String(p.covered ?? ""), "data-commit": String(p.commit), "data-best": String(p.best), "data-target": String(t.target) }}
    sub={<>{t.scope === "team" ? tx(ar, `Team · ${t.people} salespeople`, `الفريق · ${t.people} مندوبين`) : <bdi data-no-i18n>{t.who}</bdi>} · {tx(ar, "fiscal year", "السنة المالية")} <bdi data-no-i18n>{t.fiscalYear}</bdi></>}
    center={p.covered === null ? "—" : `${p.covered}%`} centerLabel={tx(ar, "covered by achieved + commit", "مغطى بالمحقق والمؤكد")}
    parts={[{ key: "achieved", label: tx(ar, "Achieved", "المحقق"), value: t.achieved, display: sar(t.achieved), tone: "actual" },
      { key: "commit", label: tx(ar, `Commit (${p.commitCount})`, `مؤكد (${p.commitCount})`), value: p.commit, display: sar(p.commit), tone: "committed" },
      { key: "best", label: tx(ar, `Best case (${p.bestCount})`, `محتمل (${p.bestCount})`), value: p.best, display: sar(p.best), tone: "billed" },
      { key: "gap", label: tx(ar, "Gap to target", "الفجوة للهدف"), value: p.gap, display: sar(p.gap), tone: "remaining" }]}
    facts={[{ key: "target", label: tx(ar, "Target", "الهدف"), display: sar(t.target) }, { key: "weighted", label: tx(ar, "Weighted pipeline", "خط الأنابيب المرجّح"), display: sar(p.weighted) }]}
    link={(n) => <Link to="/digit-crm/forecast" aria-label={tx(ar, "Open the forecast", "فتح التوقعات")} data-crm-forecast-link>{n}</Link>} />;
}

/* ------------------------------------------------------------------ C-01 / C-03 leaders strip ------------------------------------------------------------------ */
export function LeadersStrip({ user, ar }: { user: string; ar: boolean }) {
  const top = leaders(teamCards(user));
  return <BlockCard id="crm-home-leaders" title={tx(ar, "Team leaders", "قادة الفريق")} sub={tx(ar, "Highest target attainment this fiscal year, then deals won.", "الأعلى تحقيقًا للهدف في السنة المالية، ثم الصفقات المكسوبة.")} attrs={{ "data-crm-leaders": String(top.length) }}>
    {!top.length ? <p className="ek-card-pad pt-0 text-sm text-muted-foreground">{tx(ar, "No salesperson owns deals or follow-ups yet.", "لا يوجد مندوب لديه صفقات أو متابعات بعد.")}</p> :
      <ol className="ek-leaders">{top.map((c, i) => <li key={c.owner} data-leader={c.owner}>
        <span className="ek-leader-rank" data-no-i18n>#{i + 1}</span><Avatar name={personLabel(c.owner, ar)} size={40} />
        <Link to="/digit-crm/follow-ups" search={{ owner: c.owner }} className="hover:underline"><b data-no-i18n>{personLabel(c.owner, ar)}</b></Link>
        <span className="ek-leader-v" data-no-i18n>{c.pct === null ? "—" : `${c.pct}%`}</span>
        {c.pct !== null ? <div className="w-full"><Meter value={Math.min(120, c.pct)} max={100} tone={c.pct >= 100 ? "good" : c.pct >= 60 ? "attention" : "risk"} size="sm" /></div> : <small className="text-muted-foreground">{tx(ar, "no target", "بلا هدف")}</small>}
        <small className="text-muted-foreground">{tx(ar, `${c.won} won · ${c.openDeals} open`, `${c.won} مكسوبة · ${c.openDeals} مفتوحة`)}</small>
      </li>)}</ol>}
  </BlockCard>;
}

/* ------------------------------------------------------------------ C-01 critical exceptions ------------------------------------------------------------------ */
export function ExceptionCards({ user, ar }: { user: string; ar: boolean }) {
  const x = homeExceptions(user);
  const open = (path: string, search?: Record<string, string>) => <Link to={path as never} search={(search ?? {}) as never} className="text-xs font-semibold text-primary hover:underline">{tx(ar, "Open", "عرض")}</Link>;
  const it = (key: string, label: [string, string], n: number, action: ReactNode, warn = false): RequirementItem => ({ key, label: tx(ar, label[0], label[1]), state: n ? (warn ? "warn" : "missing") : "ok", missing: n, badge: n ? String(n) : undefined, action });
  const items: RequirementItem[] = [
    ...(x.manager ? [it("unassigned", ["Leads without an owner", "عملاء بلا مسؤول"], x.unassigned, open("/digit-crm/leads", { view: "unowned" }))] : []),
    it("breached", ["First-response time breached", "تجاوز مهلة أول رد"], x.breached, open("/digit-crm/qualification")),
    it("overdue", ["Overdue follow-ups", "متابعات متأخرة"], x.overdue, open("/digit-crm/activities", { view: "overdue" })),
    it("high", ["High-value deals without a next step", "صفقات كبيرة بلا خطوة تالية"], x.highNoFollow, open("/digit-crm/follow-ups", { tab: "deals" })),
    it("pastclose", ["Deals past their close date", "صفقات تجاوزت تاريخ الإغلاق"], x.pastClose, open("/digit-crm/pipeline", { tab: "board" })),
    it("stale", ["Stale deals (no recent activity)", "صفقات راكدة (بلا نشاط حديث)"], x.stale, open("/digit-crm/pipeline", { tab: "board" }), true),
    it("qual", ["Leads blocked from qualification", "عملاء متوقفون عن التأهيل"], x.qualBlocked, open("/digit-crm/qualification"), true),
  ];
  return <RequirementCards ar={ar} items={items} title={tx(ar, "Critical exceptions", "الاستثناءات الحرجة")} note={tx(ar, "Each card opens the list that holds exactly those records.", "كل بطاقة تفتح القائمة التي تضم هذه السجلات بالضبط.")} />;
}

/* ------------------------------------------------------------------ C-01 today's priorities ------------------------------------------------------------------ */
const qTitle = (i: QueueItem) => i.dt === "CRM Deal" ? linkTitle("CRM Organization", adapter.get("CRM Deal", i.name)?.["organization"]) || i.title : (() => { const l = adapter.get("CRM Lead", i.name); return l ? leadTitle(l) : i.title; })();
export function TodayPriorities({ user, ar, limit = 10 }: { user: string; ar: boolean; limit?: number }) {
  const items = actionQueue(user).filter((i) => i.reason !== "upcoming").slice(0, limit);
  const tone = (i: QueueItem): FocusRow["tone"] => (["overdue", "high_no_next"].includes(i.reason) ? "bad" : ["today", "close_soon"].includes(i.reason) ? "warn" : "info");
  const rows: FocusRow[] = items.map((i) => {
    const d = i.due ? dueText(i.due, ar) : null, why = REASON_AR[i.reason] ?? [i.reason, i.reason];
    const link = (n: ReactNode) => i.dt === "CRM Deal" ? <Link to="/digit-crm/deals/$dealId" params={{ dealId: i.name }} className="hover:underline">{n}</Link> : i.dt === "CRM Lead" ? <Link to="/digit-crm/leads/$leadId" params={{ leadId: i.name }} className="hover:underline">{n}</Link> : <>{n}</>;
    return { key: i.key, kind: i.dt === "CRM Deal" ? "deal" : "task", kindLabel: i.dt === "CRM Deal" ? tx(ar, "Deal", "صفقة") : tx(ar, "Lead", "عميل محتمل"), tone: tone(i), attrs: { "data-priority": i.reason },
      title: <bdi data-no-i18n>{qTitle(i)}</bdi>, sub: <Pill tone={tone(i) === "bad" ? "bad" : tone(i) === "warn" ? "warn" : "info"}>{tx(ar, why[0], why[1])}</Pill>, when: d ? d.text : undefined, link,
      actions: i.task ? <>
        <button type="button" title={tx(ar, "Mark done", "إنهاء")} aria-label={tx(ar, "Mark done", "إنهاء")} onClick={() => { const r = completeTask(i.task!, user); if (r.ok) toast.success(tx(ar, "Task completed", "اكتملت المهمة")); else toast.error(Object.values(r.errors)[0]); }} data-priority-done={i.task}>✓</button>
        <button type="button" title={tx(ar, "Move to tomorrow", "تأجيل ليوم")} aria-label={tx(ar, "Move to tomorrow", "تأجيل ليوم")} onClick={() => { const r = bulkReschedule([i.task!], shiftDue(i.due, 1), user); if (r.moved.length) toast.success(tx(ar, "Moved by one day", "أُجّلت يومًا")); else toast.error(r.refused[0]?.error ?? ""); }} data-priority-later={i.task}>↻</button>
      </> : link(<span className="px-1" data-priority-open={i.name}>{tx(ar, "Open", "فتح")}</span>) };
  });
  return <FocusList ar={ar} rows={rows} kinds={[{ key: "task", label: tx(ar, "Leads", "عملاء محتملون") }, { key: "deal", label: tx(ar, "Deals", "صفقات") }]} attrs={{ "data-crm-priorities": String(items.length) }}
    title={tx(ar, "Today's priorities", "أولويات اليوم")} sub={tx(ar, "Overdue first, then due today and deals that need a step — finish or move a task in one click.", "المتأخر أولًا ثم المستحق اليوم والصفقات التي تحتاج خطوة — أنهِ المهمة أو أجّلها بنقرة.")}
    empty={tx(ar, "Nothing needs action today — every open record has a scheduled next step.", "لا يوجد ما يحتاج إجراءً اليوم — كل سجل مفتوح له خطوة تالية مجدولة.")} />;
}

/* ------------------------------------------------------------------ C-02 today's timeline + done-today ring ------------------------------------------------------------------ */
export function TodayTimelineCard({ user, ar }: { user: string; ar: boolean }) {
  const rows = todayTimeline(user);
  const hm = (v: string) => /[ T](\d{2}):(\d{2})/.exec(v)?.slice(1, 3).join(":") ?? "—";
  return <BlockCard id="crm-today-timeline" title={tx(ar, "Today's timeline", "جدول اليوم")} sub={tx(ar, "Calls, meetings and tasks dated today in time order — click one for the quick view.", "المكالمات والاجتماعات والمهام المؤرخة اليوم بترتيب الوقت — انقر أيًّا منها للعرض السريع.")} attrs={{ "data-crm-today": String(rows.length) }}>
    {!rows.length ? <p className="ek-card-pad pt-0 text-sm text-muted-foreground">{tx(ar, "Nothing is dated today — schedule the next step from the queue.", "لا يوجد شيء مؤرخ اليوم — جدول الخطوة التالية من قائمة المطلوب.")}</p> :
      <ol className="ek-tl-today">{rows.map((r) => <li key={r.key} data-bucket={r.bucket} data-today-row={r.kind}>
        <time dir="ltr" data-no-i18n>{hm(r.when)}</time><KindTile k={r.kind} ar={ar} />
        <button type="button" className="min-w-0 text-start hover:underline" onClick={(e) => peekRow(r.doctype, r.name, rows.filter((x) => x.doctype === r.doctype).map((x) => x.name), e.currentTarget)}><span className="block truncate text-sm font-semibold" data-no-i18n>{r.title}</span></button>
        <Pill tone={BUCKET_TONE[r.bucket] === "neutral" ? "neutral" : BUCKET_TONE[r.bucket] as "bad" | "warn" | "info" | "ok"}>{BUCKET_LABEL[r.bucket][ar ? 1 : 0]}</Pill>
      </li>)}</ol>}
  </BlockCard>;
}
export function DoneTodayCard({ user, ar }: { user: string; ar: boolean }) {
  const d = doneToday(user);
  return <BlockCard id="crm-done-today" title={tx(ar, "Done today", "منجز اليوم")} sub={tx(ar, "Tasks completed today against today's workload (completed + due today + overdue).", "المهام المنجزة اليوم مقابل عمل اليوم (المنجز + المستحق اليوم + المتأخر).")} attrs={{ "data-crm-done-today": `${d.done}/${d.planned}` }}>
    <div className="ek-card-pad pt-0">{d.planned ? <ProgressRings ar={ar} items={[{ key: "done", label: tx(ar, "Tasks done", "مهام منجزة"), value: d.done, max: d.planned, tone: d.done >= d.planned ? "good" : d.overdue ? "risk" : "attention" }]} />
      : <p className="text-sm text-muted-foreground">{tx(ar, "No task is due today or overdue.", "لا توجد مهمة مستحقة اليوم أو متأخرة.")}</p>}
      <ul className="ek-team-facts mt-2"><li className="contents"><span>{tx(ar, `${d.dueToday} due today`, `${d.dueToday} مستحقة اليوم`)}</span></li>
        <li className="contents"><span data-tone={d.overdue ? "bad" : undefined}>{tx(ar, `${d.overdue} overdue`, `${d.overdue} متأخرة`)}</span></li>
        <li className="contents"><span>{tx(ar, `${d.logged} calls / notes / messages today`, `${d.logged} مكالمة / ملاحظة / رسالة اليوم`)}</span></li></ul>
    </div>
  </BlockCard>;
}

/* ------------------------------------------------------------------ C-03 team cards + forecast trend ------------------------------------------------------------------ */
export function TeamCardsBlock({ user, ar }: { user: string; ar: boolean }) {
  const cards = teamCards(user);
  return <BlockCard id="crm-team-cards" title={tx(ar, "Team", "الفريق")} sub={tx(ar, "Each salesperson's target attainment, overdue follow-ups and stale deals — open a card to see that person's work.", "تحقيق الهدف والمتابعات المتأخرة والصفقات الراكدة لكل مندوب — افتح البطاقة لرؤية عمله.")} attrs={{ "data-crm-team": String(cards.length) }}>
    {!cards.length ? <p className="ek-card-pad pt-0 text-sm text-muted-foreground">{tx(ar, "No salesperson owns deals or follow-ups yet.", "لا يوجد مندوب لديه صفقات أو متابعات بعد.")}</p> :
      <ul className="ek-team">{cards.map((c) => <li key={c.owner} data-tone={c.overdue ? "bad" : c.stale || c.pastClose ? "warn" : "ok"} data-team-card={c.owner}>
        <div className="ek-team-head"><Avatar name={personLabel(c.owner, ar)} size={40} /><span className="min-w-0"><b className="block" data-no-i18n>{personLabel(c.owner, ar)}</b><small className="text-muted-foreground">{tx(ar, `${c.openDeals} open deals · ${short(c.openValue, ar)}`, `${c.openDeals} صفقة مفتوحة · ${short(c.openValue, ar)}`)}</small></span></div>
        {c.pct !== null ? <div><div className="mb-1 flex justify-between text-xs"><span>{tx(ar, "Target attainment", "تحقيق الهدف")}</span><b data-no-i18n>{c.pct}%</b></div><Meter value={Math.min(120, c.pct)} max={100} tone={c.pct >= 100 ? "good" : c.pct >= 60 ? "attention" : "risk"} size="sm" />
          <small className="text-muted-foreground" data-no-i18n>{sar(c.achieved)} / {sar(c.target)}</small></div> : <small className="text-muted-foreground" data-team-notarget>{tx(ar, "No sales target is linked to this user", "لا يوجد هدف مبيعات مرتبط بهذا المستخدم")} · <Link to="/digit-crm/targets" className="font-semibold text-primary hover:underline">{tx(ar, "Set a target", "تعيين هدف")}</Link></small>}
        <div className="ek-team-facts"><span data-tone={c.overdue ? "bad" : undefined}>{tx(ar, `${c.overdue} overdue`, `${c.overdue} متأخرة`)}</span><span data-tone={c.stale ? "warn" : undefined}>{tx(ar, `${c.stale} stale`, `${c.stale} راكدة`)}</span>
          <span data-tone={c.pastClose ? "bad" : undefined}>{tx(ar, `${c.pastClose} past close`, `${c.pastClose} تجاوزت الإغلاق`)}</span><span>{tx(ar, `${c.won} won`, `${c.won} مكسوبة`)}</span></div>
        <Link to="/digit-crm/follow-ups" search={{ owner: c.owner }} className="text-xs font-semibold text-primary hover:underline" data-team-drill={c.owner}>{tx(ar, "Open this person's follow-ups", "فتح متابعات هذا المندوب")}</Link>
      </li>)}</ul>}
  </BlockCard>;
}
export function ForecastTrendBlock({ user, ar }: { user: string; ar: boolean }) {
  const t = forecastTrend(user, 6);
  const mon = (k: string) => { const [y, m] = k.split("-"); return `${m}/${y!.slice(2)}`; };
  const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
  const leg: [string, string, string, number, string][] = [["commit", tx(ar, "Commit", "المؤكد"), TONE_VAR.good, sum(t.commit), tx(ar, "probability ≥ 70%", "احتمال ≥ 70%")], ["best", tx(ar, "Best case", "المحتمل"), TONE_VAR.info, sum(t.best), tx(ar, "probability 40–70%", "احتمال 40–70%")], ["target", tx(ar, "Target", "الهدف"), TONE_VAR.attention, t.target, t.fiscalYear ? tx(ar, `fiscal year ${t.fiscalYear} · pace ${short(t.pace[0] ?? 0, ar)} / month`, `السنة المالية ${t.fiscalYear} · وتيرة ${short(t.pace[0] ?? 0, ar)} شهريًا`) : tx(ar, "no fiscal year", "لا توجد سنة مالية")]];
  return <BlockCard id="crm-forecast-trend" title={tx(ar, "Commit, best case and target", "المؤكد والمحتمل والهدف")} sub={tx(ar, "Open deals by expected close month over the next six months; the line is the monthly target pace.", "الصفقات المفتوحة حسب شهر الإغلاق المتوقع للأشهر الستة القادمة؛ الخط هو وتيرة الهدف الشهرية.")} attrs={{ "data-crm-forecast-trend": String(sum(t.commit) + sum(t.best)) }}
    action={<Link to="/digit-crm/forecast" className="text-xs font-semibold text-primary hover:underline">{tx(ar, "Open the forecast", "فتح التوقعات")}</Link>}>
    <dl className="ek-legkpi">{leg.map(([k, label, c, v, note]) => <div key={k} style={{ ["--lk" as string]: c }} data-legkpi={k}><dt><i aria-hidden />{label}</dt><dd data-no-i18n>{sar(v)}</dd><small>{note}</small></div>)}</dl>
    <div className="ek-card-pad pt-0"><GroupedColumns ar={ar} groups={t.months.map((m) => ({ key: m, label: mon(m) }))} series={[{ label: leg[0]![1], values: t.commit, tone: "good" }, { label: leg[1]![1], values: t.best, tone: "info" }]}
      line={t.target ? { label: tx(ar, `Target pace (${t.months.length} months)`, `وتيرة الهدف (${t.months.length} أشهر)`), values: t.pace, tone: "attention" } : undefined} fmt={(n) => sar(n)} axisFmt={(n) => short(n, ar)} /></div>
  </BlockCard>;
}
