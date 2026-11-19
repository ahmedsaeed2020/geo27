import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * Job and Visit record frame (owner FSM round F2-05, N25 / N26) on the shared Enterprise record pieces (CRM C4 frame):
 * header with state / type / SLA pills, the work path طلب → مجدول → في الطريق → في الموقع → مكتمل → مراجَع → مفوتر with the
 * time spent in each stage from the records' own timestamps (request opened, acknowledged, planned start, arrived,
 * completed, run reviewed, invoice dated — a stage without its timestamps shows no time), a summary strip (site, system,
 * devices, booked hours, parts, charge), coloured section cards, the event timeline + change log old → new, and the end
 * column: next step with its action, related native documents and attachments. Reads only; actions go through the
 * workflow engine / domain services already used on the page below.
 */
import type { ReactNode } from "react";
import type { Doc } from "@/lib/adapter";
import { RecordHeader, StatusPath, RecordColumns, SideCard, Pill, type PathStep } from "@/components/enterprise/kit/RecordFrame";
import { KeyFacts } from "@/components/enterprise/kit/KeyFacts";
import { ChangeLog } from "@/components/enterprise/kit/QueueSplit";
import { openQuickView } from "@/components/enterprise/QuickView";
import { list, raw, rows, titleOf } from "../domain/data";
import { s } from "../domain/rules";
import { nextStep, slaOf } from "../domain/workState";
import { DocRef, NextCell, PersonRef, SlaCell, StateChip, WorkflowButtons, dtTxt, money, numTxt, opt, useFx } from "./kit";
import { nm } from "./dayBoard";

type Stage = "request" | "scheduled" | "travel" | "onsite" | "done" | "reviewed" | "invoiced";
const STAGES: [Stage, string, string][] = [["request", "Request", "طلب"], ["scheduled", "Scheduled", "مجدول"], ["travel", "On the way", "في الطريق"], ["onsite", "On site", "في الموقع"], ["done", "Completed", "مكتمل"], ["reviewed", "Reviewed", "مراجَع"], ["invoiced", "Invoiced", "مفوتر"]];
const ms = (v: string) => (v ? Date.parse((v.length === 10 ? `${v} 00:00:00` : v).replace(" ", "T")) : NaN);
const span = (a: string, b: string, ar: boolean) => { const h = (ms(b) - ms(a)) / 3600000; if (!Number.isFinite(h) || h < 0) return undefined; if (h < 1) return ar ? `${Math.max(1, Math.round(h * 60))} د` : `${Math.max(1, Math.round(h * 60))} min`; if (h < 48) return ar ? `${Math.round(h)} س` : `${Math.round(h)} h`; const d = Math.round(h / 24); return ar ? `${d} يوم` : `${d} d`; };
const nowTs = () => new Date().toISOString().slice(0, 19).replace("T", " ");

export interface WorkFacts { job: Doc | undefined; visits: Doc[]; visit?: Doc | undefined; issue?: Doc | undefined; runs: Doc[]; bookings: Doc[]; quotation?: Doc | undefined; orders: Doc[]; mrs: Doc[]; ses: Doc[]; tss: Doc[]; invoices: Doc[]; charge?: Doc | undefined; systems: string[] }
export function workFacts(job: Doc | undefined, visit?: Doc): WorkFacts {
  const id = job?.name ?? "";
  const visits = visit ? [visit] : list(VISIT_DT).filter((v) => s(v["job"]) === id);
  const runs = list("FSM Inspection Run").filter((r) => (visit ? s(r["visit"]) === visit.name : s(r["job"]) === id));
  const bookings = list("FSM Booking").filter((b) => visits.some((v) => v.name === s(b["visit"])) && s(b["status"]) !== "Cancelled");
  const issue = job?.["issue"] ? raw("Issue", job["issue"]) : list("Issue").find((i) => s(i["digit_fsm_job"]) === id);
  const def = job?.["deficiency"] ? raw("FSM Deficiency", job["deficiency"]) : undefined;
  const quotation = raw("Quotation", job?.["quotation"] ?? def?.["quotation"]);
  const orders = quotation ? list("Sales Order").filter((o) => rows(o, "items").some((x) => s(x["prevdoc_docname"]) === quotation.name)) : [];
  const by = (dt: string) => list(dt).filter((m) => s(m["digit_fsm_job"]) === id);
  const charge = list("FSM Charge Proposal").find((x) => s(x["job"]) === id);
  const invoices = [...new Map([...by("Sales Invoice"), ...(charge?.["sales_invoice"] ? [raw("Sales Invoice", charge["sales_invoice"])].filter((x): x is Doc => !!x) : [])].map((x) => [x.name, x])).values()];
  const systems = [...new Set([...rows(job, "obligations").map((b) => s(b["system"])), s(def?.["system"]), s(issue?.["digit_fsm_system"]), ...runs.map((r) => s(r["system"]))].filter(Boolean))];
  return { job, visits, visit, issue, runs, bookings, quotation, orders, mrs: by("Material Request"), ses: by("Stock Entry"), tss: by("Timesheet"), invoices, charge, systems };
}

/** Entry time of each stage from the records' own timestamps; the current stage from the visit / job state. */
export function workPath(w: WorkFacts, ar: boolean): PathStep[] {
  const v = w.visit ?? [...w.visits].filter((x) => s(x["workflow_state"]) !== "Cancelled").sort((a, b) => s(b["scheduled_start"]).localeCompare(s(a["scheduled_start"])))[0];
  const firstObl = rows(w.job, "obligations").map((b) => s(raw("FSM Obligation", b["obligation"])?.["due_date"])).filter(Boolean).sort()[0] ?? "";
  const at: Record<Stage, string> = {
    request: w.issue ? `${s(w.issue["opening_date"])} ${s(w.issue["opening_time"]) || "08:00:00"}`.trim() : firstObl || s(raw("FSM Deficiency", w.job?.["deficiency"])?.["opened_on"]),
    scheduled: s(v?.["acknowledged_on"]), travel: s(v?.["arrived_on"]) || ["Dispatched", "On Site", "Completed"].includes(s(v?.["workflow_state"])) ? s(v?.["scheduled_start"]) : "",
    onsite: s(v?.["arrived_on"]), done: s(v?.["completed_on"]) || (!w.visit ? s(w.job?.["completed_on"]) : ""),
    reviewed: w.runs.map((r) => s(r["reviewed_on"])).filter(Boolean).sort().slice(-1)[0] ?? "", invoiced: w.invoices.map((i) => s(i["posting_date"])).filter(Boolean).sort()[0] ?? "",
  };
  const vs = s(v?.["workflow_state"]); const js = s(w.job?.["workflow_state"]);
  let cur: Stage = "request";
  if (w.invoices.length) cur = "invoiced";
  else if (at.reviewed && (vs === "Completed" || ["Completed", "Closed"].includes(js))) cur = "reviewed";
  else if (vs === "Completed" || (!w.visit && ["Completed", "Closed"].includes(js))) cur = "done";
  else if (vs === "On Site") cur = "onsite";
  else if (vs === "Dispatched") cur = "travel";
  else if (vs === "Planned" || (!w.visit && js === "Scheduled")) cur = "scheduled";
  const idx = STAGES.findIndex(([k]) => k === cur);
  return STAGES.map(([k, en, a], i) => {
    const next = STAGES.slice(i + 1).map(([x]) => at[x]).find(Boolean) ?? (i === idx ? nowTs() : "");
    const sp = at[k] && i <= idx ? span(at[k], next, ar) : undefined;
    return { key: k, label: ar ? a : en, state: i < idx ? "done" : i === idx ? "current" : "next", ...(sp ? { span: sp } : {}), ...(at[k] ? { at: dtTxt(at[k]) } : {}) } satisfies PathStep;
  });
}

function Related({ w }: { w: WorkFacts }) {
  const { t } = useFx();
  const docs: [string, string, Doc[]][] = [
    ["Issue", t("Service request", "طلب الخدمة"), w.issue ? [w.issue] : []], ["Quotation", t("Quotation", "عرض السعر"), w.quotation ? [w.quotation] : []], ["Sales Order", t("Sales order", "أمر البيع"), w.orders],
    ["Material Request", t("Material request", "طلب المواد"), w.mrs], ["Stock Entry", t("Stock entry", "قيد المخزون"), w.ses], ["Timesheet", t("Timesheet", "سجل الوقت"), w.tss], ["Sales Invoice", t("Sales invoice", "فاتورة المبيعات"), w.invoices],
  ];
  return <ul className="grid gap-1.5" data-related-docs>{docs.map(([dt, label, ds]) => <li key={dt} className="flex items-start justify-between gap-2 text-sm" data-related={dt} data-count={ds.length}>
    <span className="text-muted-foreground">{label}</span>
    <span className="flex flex-wrap justify-end gap-1">{ds.length ? ds.map((d) => <button key={d.name} type="button" className="font-medium text-primary hover:underline" onClick={(e) => openQuickView({ kind: "doc", doctype: dt, name: d.name }, e.currentTarget)} data-no-i18n>{d.name}</button>) : <span className="text-muted-foreground">—</span>}</span>
  </li>)}</ul>;
}

function Events({ w }: { w: WorkFacts }) {
  const { t, ar } = useFx();
  const ev: { at: string; text: ReactNode; key: string }[] = [];
  if (w.issue) ev.push({ key: "req", at: `${s(w.issue["opening_date"])} ${s(w.issue["opening_time"])}`.trim(), text: <>{t("Request opened", "فُتح الطلب")} · <span data-no-i18n>{s(w.issue["subject"])}</span></> });
  if (w.issue?.["first_responded_on"]) ev.push({ key: "resp", at: s(w.issue["first_responded_on"]), text: t("First response", "الاستجابة الأولى") });
  for (const v of w.visits) {
    if (v["acknowledged_on"]) ev.push({ key: `ack-${v.name}`, at: s(v["acknowledged_on"]), text: <>{t("Technician acknowledged", "أقر الفني")} · <span data-no-i18n>{nm("FSM Technician", v["technician"], ar)}</span></> });
    if (v["arrived_on"]) ev.push({ key: `arr-${v.name}`, at: s(v["arrived_on"]), text: <>{t("Checked in", "سُجل الوصول")} · <span data-no-i18n>{nm("FSM Service Site", v["site"], ar)}</span></> });
    if (v["completed_on"]) ev.push({ key: `cmp-${v.name}`, at: s(v["completed_on"]), text: <>{t("Visit completed", "اكتملت الزيارة")}{v["signed_by"] ? <> · {t("signed by", "وقّعه")} <span data-no-i18n>{s(v["signed_by"])}</span></> : null}</> });
  }
  for (const r of w.runs) { if (r["submitted_on"]) ev.push({ key: `sub-${r.name}`, at: s(r["submitted_on"]), text: t("Inspection submitted for review", "قُدّم الفحص للمراجعة") }); if (r["reviewed_on"]) ev.push({ key: `rev-${r.name}`, at: s(r["reviewed_on"]), text: t("Inspection reviewed", "روجع الفحص") }); }
  for (const i of w.invoices) ev.push({ key: `inv-${i.name}`, at: s(i["posting_date"]), text: <>{t("Invoice dated", "تاريخ الفاتورة")} · <span data-no-i18n>{money(i["grand_total"])}</span></> });
  ev.sort((a, b) => a.at.localeCompare(b.at));
  if (!ev.length) return <p className="text-sm text-muted-foreground">{t("No events recorded yet.", "لا أحداث مسجلة بعد.")}</p>;
  return <ol className="ek-tl" data-work-events={ev.length}>{ev.map((e) => <li key={e.key} className="relative border-s-2 border-border ps-4 pb-3 last:pb-0" data-event={e.key}><span className="absolute -start-[5px] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden /><p className="text-sm">{e.text}</p><p className="text-xs text-muted-foreground" data-no-i18n>{dtTxt(e.at)}</p></li>)}</ol>;
}

export function WorkRecordFrame({ dt, doc, w }: { dt: "FSM Job" | typeof VISIT_DT; doc: Doc; w: WorkFacts }) {
  const { t, ar } = useFx();
  const job = w.job; const n = nextStep(dt, doc);
  const devices = w.systems.reduce((a, sys) => a + list("FSM Device").filter((d) => s(d["system"]) === sys).length, 0);
  const hrs = w.bookings.reduce((a, b) => a + Math.max(0, (ms(s(b["booking_end"])) - ms(s(b["booking_start"]))) / 3600000), 0);
  const parts = [...w.mrs, ...w.ses].reduce((a, d) => a + rows(d, "items").reduce((x, i) => x + (Number(i["qty"]) || 0), 0), 0);
  const files = list("File").filter((f) => (s(f["attached_to_doctype"]) === dt && s(f["attached_to_name"]) === doc.name) || (job && s(f["attached_to_doctype"]) === "FSM Job" && s(f["attached_to_name"]) === job.name && dt !== "FSM Job"));
  const title = dt === "FSM Job" ? s(doc["job_title"]) : `${nm("FSM Service Site", doc["site"], false)}`;
  const lead = dt === VISIT_DT ? s(doc["technician"]) : s(w.visits.find((v) => v["technician"])?.["technician"]);
  const typ = opt(job?.["job_type"] ?? doc["visit_purpose"], ar);
  const start = <>
    <SideCard title={t("Site and system", "الموقع والنظام")} hue="teal" icon="⌂" id="site">
      <KeyFacts items={[[t("Site", "الموقع"), <DocRef doctype="FSM Service Site" name={doc["site"] ?? job?.["site"]} title key="s" />], [t("Customer", "العميل"), <DocRef doctype="Customer" name={job?.["customer"]} title key="c" />],
        [t("Systems", "الأنظمة"), w.systems.length ? <span key="y" className="flex flex-col gap-0.5">{w.systems.map((x) => <DocRef key={x} doctype="FSM Service System" name={x} title />)}</span> : <span key="y">—</span>]]} />
    </SideCard>
    <SideCard title={t("People and time", "الفنيون والوقت")} hue="violet" icon="◷" id="people">
      <KeyFacts items={[[t("Lead technician", "الفني الرئيسي"), <PersonRef doctype="FSM Technician" name={lead} key="l" />], [t("Scheduled", "الموعد"), <span key="sc" data-no-i18n>{dtTxt(dt === VISIT_DT ? doc["scheduled_start"] : w.visits.map((v) => s(v["scheduled_start"])).filter(Boolean).sort()[0])}</span>],
        [t("Checked in", "الوصول"), <span key="a" data-no-i18n>{dtTxt(dt === VISIT_DT ? doc["arrived_on"] : w.visits.map((v) => s(v["arrived_on"])).filter(Boolean).sort()[0])}</span>], [t("Checked out", "المغادرة"), <span key="o" data-no-i18n>{dtTxt(dt === VISIT_DT ? doc["completed_on"] : w.visits.map((v) => s(v["completed_on"])).filter(Boolean).sort().slice(-1)[0])}</span>]]} />
    </SideCard>
    <SideCard title={t("Commercial", "التجاري")} hue="amber" icon="﷼" id="commercial">
      <KeyFacts items={[[t("Coverage", "التغطية"), <span key="cv">{w.charge ? opt(w.charge["coverage_decision"], ar) : "—"}</span>], [t("Charge", "التحصيل"), <span key="ch" data-no-i18n>{w.charge ? money(w.charge["amount"]) : "—"}</span>], [t("Hand-off", "التسليم"), <StateChip key="h" value={w.charge?.["status"]} />]]} />
    </SideCard>
  </>;
  const middle = <>
    <SideCard title={t("Timeline", "الخط الزمني")} hue="blue" icon="↧" id="timeline"><Events w={w} /></SideCard>
    <SideCard title={t("Changes old → new", "التعديلات قديم ← جديد")} hue="grey" icon="✎" id="changes"><ChangeLog doctype={dt} name={doc.name} ar={ar} /></SideCard>
  </>;
  const end = <>
    <SideCard title={t("Next step", "الخطوة التالية")} hue="emerald" icon="→" id="next" tone={n?.tone === "bad" ? "bad" : n?.tone === "warn" ? "warn" : undefined}>
      {n ? <div className="grid gap-2"><p className="text-sm font-bold"><NextCell doctype={dt} doc={doc} /></p><div className="flex flex-wrap gap-1.5"><WorkflowButtons doctype={dt} doc={doc} /></div></div> : <p className="text-sm text-muted-foreground">{t("Nothing left to do on this record.", "لا شيء متبقٍ على هذا السجل.")}</p>}
    </SideCard>
    <SideCard title={t("Related documents", "المستندات المرتبطة")} hue="blue" icon="⎘" id="related"><Related w={w} /></SideCard>
    <SideCard title={t("Attachments", "المرفقات")} hue="grey" icon="⎙" count={files.length} id="files">
      {files.length ? <ul className="grid gap-1 text-sm">{files.map((f) => <li key={f.name} data-no-i18n><a className="text-primary hover:underline" href={s(f["file_url"]) || "#"} target="_blank" rel="noreferrer">{s(f["file_name"]) || f.name}</a></li>)}</ul>
        : <p className="text-sm text-muted-foreground">{t("No attachments. Attach photos or signed reports from the form.", "لا مرفقات. أرفق الصور أو التقارير الموقعة من النموذج.")} <DocRef doctype={dt} name={doc.name} form>{t("Open form", "فتح النموذج")}</DocRef></p>}
    </SideCard>
  </>;
  return <div className="mb-4 grid gap-3" data-work-record={dt} data-record-name={doc.name}>
    <RecordHeader ar={ar} name={title} kicker={dt === "FSM Job" ? t("Job", "أمر العمل") : t("Visit", "الزيارة")} title={<span data-no-i18n>{title}</span>}
      sub={<><span data-no-i18n>{titleOf("Customer", job?.["customer"])}</span>{dt === VISIT_DT && job ? <> · <DocRef doctype="FSM Job" name={job.name} title /></> : null}</>}
      pills={<><StateChip value={doc["workflow_state"]} />{typ ? <Pill hue={job?.["job_type"] === "Emergency" ? "rose" : job?.["job_type"] === "Repair" ? "amber" : job?.["job_type"] === "Retest" ? "violet" : job?.["job_type"] === "Corrective" ? "teal" : "blue"}>{typ}</Pill> : null}{job?.["priority"] && s(job["priority"]) !== "Normal" ? <Pill tone="warn">{opt(job["priority"], ar)}</Pill> : null}{slaOf(dt, doc).state !== "na" ? <SlaCell doctype={dt} doc={doc} /> : null}</>}
      attrs={{ "data-work-head": doc.name }} />
    <StatusPath ar={ar} steps={workPath(w, ar)} attrs={{ "data-work-path": doc.name }} />
    <KeyFacts attrs={{ "data-work-summary": doc.name }} items={[[t("Site", "الموقع"), <DocRef doctype="FSM Service Site" name={doc["site"] ?? job?.["site"]} title key="s" />], [t("System", "النظام"), w.systems[0] ? <span key="y"><DocRef doctype="FSM Service System" name={w.systems[0]} title />{w.systems.length > 1 ? <span data-no-i18n> +{w.systems.length - 1}</span> : null}</span> : <span key="y">—</span>],
      [t("Devices", "الأجهزة"), <span key="d" data-no-i18n>{numTxt(devices)}</span>], [t("Booked hours", "الساعات المحجوزة"), <span key="h" data-no-i18n>{numTxt(hrs, 1)}</span>], [t("Parts", "المواد"), <span key="p" data-no-i18n>{numTxt(parts)}</span>], [t("Charge", "التحصيل"), <span key="c" data-no-i18n>{w.charge ? money(w.charge["amount"]) : "—"}</span>]]} />
    <RecordColumns ar={ar} start={start} middle={middle} end={end} labels={[t("Details", "التفاصيل"), t("Activity", "النشاط"), t("Related", "المرتبط")]} />
  </div>;
}
