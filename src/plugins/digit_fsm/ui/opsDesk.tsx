import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * Operations signals and the dispatcher desk (owner FSM round F2-04) for Operations control (N03) and My work (N01).
 *  - OpsSignals: coloured Enterprise KPI cards with icon tiles — visits today by status (vs the previous working day),
 *    technicians on site (of those booked today), SLA at risk (breached + at risk of open jobs), critical findings (open;
 *    change = opened in the last 7 days vs the 7 before) and unscheduled visits. A change chip shows only where the
 *    records hold the earlier figure; nothing is estimated.
 *  - DispatcherDesk: the shared queue → record → next step split (kit/QueueSplit): waiting visits, dispatched visits without
 *    acknowledgement and field requests without a job, worst SLA first; the record pane shows the facts, the next step with
 *    its action (book on the board, dispatch, acknowledge, create the job) and the record's change log old → new.
 */
import { useState } from "react";
import type { Doc } from "@/lib/adapter";
import type { Delta } from "@/components/enterprise/kit/charts";
import { QueueSplit, ChangeLog } from "@/components/enterprise/kit/QueueSplit";
import { KeyFacts } from "@/components/enterprise/kit/KeyFacts";
import { Avatar } from "@/components/enterprise/kit/RecordFrame";
import { list, raw } from "../domain/data";
import { OPEN_DEFICIENCY, addDays, s, today } from "../domain/rules";
import * as svc from "../domain/services";
import { jobSla, nextStep, slaOf } from "../domain/workState";
import { ActionButton, AppLink, BTN, DocRef, Kpi, NextCell, PersonRef, SignalGrid, SlaCell, StateChip, dtTxt, numTxt, opt, useFx } from "./kit";
import { nm } from "./dayBoard";

const pctDelta = (now: number, before: number, better: Delta["better"], label: string): Delta | undefined => (before > 0 ? { pct: ((now - before) / before) * 100, better, label } : undefined);
const CLOSED_JOB = new Set(["Completed", "Closed", "Cancelled"]);

export function opsFigures(day = today()) {
  const visits = list(VISIT_DT);
  const onDay = (d: string) => visits.filter((v) => s(v["scheduled_start"]).slice(0, 10) === d);
  // previous working day (Saudi week: Friday and Saturday off)
  let prevDay = addDays(day, -1); while ([5, 6].includes(new Date(`${prevDay}T00:00:00`).getDay())) prevDay = addDays(prevDay, -1);
  const todays = onDay(day); const lastWeek = onDay(prevDay);
  const byState = ["Planned", "Dispatched", "On Site", "Completed", "Cancelled"].map((st) => [st, todays.filter((v) => s(v["workflow_state"]) === st).length] as const);
  const bookedTechs = new Set(list("FSM Booking").filter((b) => s(b["status"]) !== "Cancelled" && s(b["booking_start"]).slice(0, 10) === day).map((b) => s(b["technician"])));
  const onSite = new Set(visits.filter((v) => s(v["workflow_state"]) === "On Site").map((v) => s(v["technician"])).filter(Boolean));
  const jobs = list("FSM Job").filter((j) => !CLOSED_JOB.has(s(j["workflow_state"])));
  const slas = jobs.map((j) => jobSla(j)); const breached = slas.filter((x) => x.state === "breached").length; const risk = slas.filter((x) => x.state === "risk").length;
  const crit = list("FSM Deficiency").filter((d) => s(d["severity"]) === "Critical");
  const critOpen = crit.filter((d) => OPEN_DEFICIENCY.has(s(d["workflow_state"]))).length;
  const opened = (a: string, b: string) => crit.filter((d) => s(d["opened_on"]) > a && s(d["opened_on"]) <= b).length;
  const critNew = opened(addDays(day, -7), day), critPrev = opened(addDays(day, -14), addDays(day, -7));
  const unsched = list(VISIT_DT).filter((v) => s(v["workflow_state"]) === "Unscheduled").length;
  return { todays: todays.length, lastWeek: lastWeek.length, byState, booked: bookedTechs.size, onSite: onSite.size, breached, risk, critOpen, critNew, critPrev, unsched };
}

export function OpsSignals({ day = today() }: { day?: string }) {
  const { t, ar } = useFx(); const f = opsFigures(day);
  const st = f.byState.filter(([, n]) => n).map(([k, n]) => `${numTxt(n)} ${opt(k, ar)}`).join(" · ");
  return <SignalGrid cols={"auto"}>
    <Kpi icon="count" label={t("Visits today", "زيارات اليوم")} value={numTxt(f.todays)} tone="info" basis={st || t("None scheduled", "لا شيء مجدول")} to={`visits?from=${day}&to=${day}`} cta={t("Open visits", "فتح الزيارات")}
      delta={pctDelta(f.todays, f.lastWeek, "none", t("vs the previous working day", "مقابل يوم العمل السابق"))} />
    <Kpi icon="people" label={t("Technicians on site", "فنيون في الموقع")} value={numTxt(f.onSite)} tone={f.onSite ? "good" : "neutral"} basis={t(`of ${f.booked} booked today`, `من ${f.booked} محجوزين اليوم`)} to="dispatch" cta={t("Dispatch board", "لوحة الجدولة")} />
    <Kpi icon="time" label={t("SLA at risk", "مستوى الخدمة معرّض")} value={numTxt(f.breached + f.risk)} tone={f.breached ? "bad" : f.risk ? "warn" : "good"} basis={t(`${f.breached} breached · ${f.risk} at risk — open jobs`, `${f.breached} متجاوزة · ${f.risk} معرضة — أوامر العمل المفتوحة`)} to="list/fsm_job" cta={t("Open jobs", "فتح أوامر العمل")} />
    <Kpi icon="alert" label={t("Critical findings", "ملاحظات حرجة")} value={numTxt(f.critOpen)} tone={f.critOpen ? "bad" : "good"} basis={t(`${f.critNew} opened in the last 7 days`, `${f.critNew} فُتحت خلال 7 أيام`)} to="queue/critical" cta={t("Open queue", "فتح الطابور")}
      delta={pctDelta(f.critNew, f.critPrev, "down", t("opened vs the 7 days before", "المفتوحة مقابل الأيام السبعة السابقة"))} />
    <Kpi icon="doc" label={t("Unscheduled visits", "زيارات غير مجدولة")} value={numTxt(f.unsched)} tone={f.unsched ? "warn" : "good"} basis={t("No technician or time yet", "بلا فني أو موعد بعد")} to="queue/unscheduled" cta={t("Open queue", "فتح الطابور")} />
  </SignalGrid>;
}

// ---------------------------------------------------------------- dispatcher desk
interface Item { key: string; dt: typeof VISIT_DT | "Issue"; doc: Doc; kind: "unscheduled" | "ack" | "request"; left: number }
export function dispatcherItems(): Item[] {
  const v = list(VISIT_DT);
  const items: Item[] = [
    ...v.filter((x) => s(x["workflow_state"]) === "Unscheduled").map((d): Item => ({ key: `${VISIT_DT}|${d.name}`, dt: VISIT_DT, doc: d, kind: "unscheduled", left: slaOf(VISIT_DT, d).leftH })),
    ...v.filter((x) => s(x["workflow_state"]) === "Dispatched" && !x["acknowledged_on"]).map((d): Item => ({ key: `${VISIT_DT}|${d.name}`, dt: VISIT_DT, doc: d, kind: "ack", left: slaOf(VISIT_DT, d).leftH })),
    ...list("Issue").filter((i) => i["digit_fsm_site"] && !i["digit_fsm_job"] && !["Resolved", "Closed"].includes(s(i["status"]))).map((d): Item => ({ key: `Issue|${d.name}`, dt: "Issue", doc: d, kind: "request", left: slaOf("Issue", d).leftH })),
  ];
  return items.sort((a, b) => (Number.isFinite(a.left) && a.left !== 0 ? a.left : 1e6) - (Number.isFinite(b.left) && b.left !== 0 ? b.left : 1e6));
}
const KIND: Record<Item["kind"], [string, string]> = { unscheduled: ["To book", "للجدولة"], ack: ["Awaiting acknowledgement", "بانتظار الإقرار"], request: ["Needs a job", "يحتاج أمر عمل"] };

export function DispatcherDesk() {
  const { t, ar } = useFx(); const [open, setOpen] = useState<string | undefined>();
  const items = dispatcherItems(); const keys = items.map((x) => x.key);
  const cur = items.find((x) => x.key === open) ?? (open ? (() => { const [dt, name] = open.split("|") as [typeof VISIT_DT | "Issue", string]; const d = raw(dt, name); return d ? { key: open, dt, doc: d, kind: dt === "Issue" ? "request" : "unscheduled", left: 0 } as Item : undefined; })() : undefined);
  const title = (x: Item) => x.dt === "Issue" ? s(x.doc["subject"]) : nm("FSM Service Site", x.doc["site"], false);
  const listNode = items.length ? <ul className="flex flex-col gap-1.5" aria-label={t("Dispatcher queue", "طابور المجدول")} data-dispatcher-queue={items.length}>
    {items.map((x) => <li key={x.key}><button type="button" onClick={() => setOpen(x.key)} aria-pressed={open === x.key} data-queue-item={x.key}
      className={`w-full rounded-lg border bg-card px-3 py-2 text-start shadow-sm transition hover:-translate-y-px hover:shadow-md ${open === x.key ? "border-primary ring-2 ring-primary/25" : "border-border"}`}
      style={{ borderInlineStartWidth: 3, borderInlineStartColor: x.kind === "request" ? "var(--coral)" : x.kind === "ack" ? "var(--violet)" : "var(--amber)" }}>
      <span className="flex items-center justify-between gap-2"><span className="truncate text-[13px] font-bold" data-no-i18n>{title(x)}</span><SlaCell doctype={x.dt} doc={x.doc} /></span>
      <span className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{ar ? KIND[x.kind][1] : KIND[x.kind][0]}</span><NextCell doctype={x.dt} doc={x.doc} /></span>
    </button></li>)}
  </ul> : <p className="text-sm text-muted-foreground" data-dispatcher-queue="0">{t("Nothing waiting for the dispatcher.", "لا شيء بانتظار المجدول.")}</p>;
  const d = cur?.doc; const n = cur ? nextStep(cur.dt, d) : null;
  return <QueueSplit ar={ar} list={listNode} keys={keys} open={cur?.key} onOpen={setOpen} onClose={() => setOpen(undefined)} attrs={{ "data-dispatcher-desk": String(items.length) }}
    title={cur ? <span data-no-i18n>{title(cur)}</span> : undefined}>
    {cur && d && <div className="grid gap-3">
      <KeyFacts items={cur.dt === "Issue" ? [
        [t("Request", "الطلب"), <DocRef doctype="Issue" name={d.name} form key="r" />], [t("Site", "الموقع"), <DocRef doctype="FSM Service Site" name={d["digit_fsm_site"]} title key="s" />],
        [t("Priority", "الأولوية"), <span key="p">{opt(d["priority"], ar)}</span>], [t("Type", "النوع"), <span key="ty">{opt(d["issue_type"], ar)}</span>],
        [t("Respond by", "الاستجابة قبل"), <span key="rb" data-no-i18n>{dtTxt(d["response_by"])}</span>], [t("SLA", "مستوى الخدمة"), <SlaCell key="sl" doctype="Issue" doc={d} />],
      ] : [
        [t("Site", "الموقع"), <DocRef doctype="FSM Service Site" name={d["site"]} title key="s" />], [t("Job", "أمر العمل"), <DocRef doctype="FSM Job" name={d["job"]} title key="j" />],
        [t("Technician", "الفني"), <PersonRef doctype="FSM Technician" name={d["technician"]} key="t" />], [t("Scheduled", "الموعد"), <span key="sc" data-no-i18n>{dtTxt(d["scheduled_start"])}</span>],
        [t("Status", "الحالة"), <StateChip value={d["workflow_state"]} key="st" />], [t("SLA", "مستوى الخدمة"), <SlaCell key="sl" doctype={VISIT_DT} doc={d} />],
      ]} />
      {n && <div className="rounded-lg border border-primary/30 bg-primary/5 p-3" data-next-step={cur.key}>
        <p className="text-xs font-bold text-muted-foreground">{t("Next step", "الخطوة التالية")}</p>
        <p className="mt-0.5 text-sm font-bold"><NextCell doctype={cur.dt} doc={d} /></p>
        <div className="mt-2 flex flex-wrap gap-2">
          {cur.dt === VISIT_DT && s(d["workflow_state"]) === "Unscheduled" && <AppLink to={`dispatch?visit=${encodeURIComponent(d.name)}`} className={BTN.primary}>{t("Book on the board", "الجدولة في اللوحة")}</AppLink>}
          {cur.dt === VISIT_DT && s(d["workflow_state"]) === "Planned" && <ActionButton primary label={t("Dispatch visit", "إرسال الزيارة")} run={() => svc.transition(VISIT_DT, d.name, "Dispatch")} />}
          {cur.dt === VISIT_DT && s(d["workflow_state"]) === "Dispatched" && !d["acknowledged_on"] && <ActionButton primary label={t("Record acknowledgement", "تسجيل الإقرار")} run={() => svc.acknowledgeVisit(d.name)} />}
          {cur.dt === "Issue" && <ActionButton primary label={t("Create the job", "إنشاء أمر العمل")} run={() => svc.jobFromRequest(d.name, s(d["issue_type"]) === "Emergency")} />}
          {cur.dt === "Issue" && s(d["issue_type"]) === "Emergency" && <AppLink to="emergency" className={BTN.secondary}>{t("Emergency triage", "فرز الطوارئ")}</AppLink>}
        </div>
      </div>}
      {cur.dt === VISIT_DT && d["technician"] ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><Avatar name={nm("FSM Technician", d["technician"], ar)} size={28} /><span>{t("Lead technician", "الفني الرئيسي")}</span></p> : null}
      <div><p className="mb-1 text-xs font-bold text-muted-foreground">{t("Changes", "التعديلات")}</p><ChangeLog doctype={cur.dt} name={d.name} ar={ar} /></div>
    </div>}
  </QueueSplit>;
}
