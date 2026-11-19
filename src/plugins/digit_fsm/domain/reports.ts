import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * DIGIT FSM + ITM relational reports RP01–RP20 (kit 07). Each report states its grain, reads only permitted records
 * (domain/data.ts → shared scope boundary), aggregates once per key from pre-built maps (no multi-join fan-out:
 * quote lines, visits, results and retests are counted per their own key, never multiplied by a join), and marks
 * values that need posted native finance / provider events as SERVER_REQUIRED instead of inventing them.
 * Link columns name their DocType, so every cell opens the canonical source record (W10 drill: KPI → report → source).
 */
import { moveKind, vanWarehouses } from "./billing";
import type { Doc } from "@/lib/adapter";
import { by, canRead, idx, inScope, list, raw, rows, titleOf, type Filters } from "./data";
import { agingBucket, daysBetween, hoursBetween, isMissed, onTime, OPEN_DEFICIENCY, runCoverage, s, today, inPeriod, type Row } from "./rules";

export interface ReportColumn { fieldname: string; label: string; label_ar: string; fieldtype: "Data" | "Link" | "Int" | "Float" | "Currency" | "Date" | "Datetime" | "Percent" | "Check"; options?: string; server?: boolean }
export interface ReportDef {
  id: string; title: string; title_ar: string; grain: string; grain_ar: string; question: string; question_ar: string;
  ref_doctype: string; filters: (keyof Filters)[]; columns: ReportColumn[]; sections?: { key: string; label: string; label_ar: string }[];
  /** extra DocTypes the user must be able to read for the report to be complete */
  needs?: string[]; server_note?: string; server_note_ar?: string; status: "VIRTUAL" | "PARTIAL" | "SERVER_REQUIRED";
  run: (f: Filters) => Row[];
}
const C = (fieldname: string, label: string, label_ar: string, fieldtype: ReportColumn["fieldtype"] = "Data", options?: string, server?: boolean): ReportColumn => ({ fieldname, label, label_ar, fieldtype, ...(options ? { options } : {}), ...(server ? { server } : {}) });
const SITE = C("site", "Site", "الموقع", "Link", "FSM Service Site");
const SYS = C("system", "System", "النظام", "Link", "FSM Service System");
const DEV = C("device", "Device", "الجهاز", "Link", "FSM Device");
const RUN = C("run", "Run", "تشغيل الفحص", "Link", "FSM Inspection Run");
const JOB = C("job", "Job", "أمر العمل", "Link", "FSM Job");
const DEFC = C("deficiency", "Finding", "الملاحظة", "Link", "FSM Deficiency");
const asOf = (f: Filters) => f.as_of || today();
const between = (d: unknown, f: Filters) => { const x = s(d).slice(0, 10); return (!f.from || x >= f.from) && (!f.to || x <= f.to); };
const REVIEWED = new Set(["Reviewed", "Published"]);
const SERVER = "SERVER_REQUIRED";

/** Device-level outcome of a device in a run's result rows (Fail beats Inaccessible beats Untested beats Pass). */
function deviceOutcome(results: Row[], device: string): string {
  const o = results.filter((r) => s(r["device"]) === device).map((r) => s(r["outcome"]) || "Untested").filter((x) => x !== "Not Applicable");
  if (!o.length) return "Not Applicable";
  return o.includes("Fail") ? "Fail" : o.includes("Inaccessible") ? "Inaccessible" : o.includes("Untested") ? "Untested" : "Pass";
}
const runDate = (r: Doc) => s(r["reviewed_on"]) || s(r["submitted_on"]) || s(r["modified"]).slice(0, 10);

export const FSM_REPORTS: ReportDef[] = [
  { id: "RP01", title: "Site asset inventory & condition", title_ar: "جرد أصول الموقع وحالتها", grain: "One current device", grain_ar: "جهاز حالي واحد", status: "VIRTUAL",
    question: "Which devices does each site hold and how did each one last test?", question_ar: "ما الأجهزة في كل موقع وما نتيجة آخر فحص لكل منها؟",
    ref_doctype: "FSM Device", needs: ["FSM Inspection Run", "FSM Deficiency"], filters: ["company", "site", "customer", "system"],
    columns: [SITE, SYS, C("system_type", "System type", "نوع النظام"), DEV, C("serial_no", "Serial no", "الرقم التسلسلي"), C("location", "Location", "المكان", "Link", "FSM Location Node"), C("lifecycle", "Lifecycle", "دورة الحياة"),
      C("last_run", "Last reviewed run", "آخر فحص مراجَع", "Link", "FSM Inspection Run"), C("last_outcome", "Last outcome", "آخر نتيجة"), C("last_tested", "Last tested", "تاريخ آخر فحص", "Date"), C("open_findings", "Open findings", "ملاحظات مفتوحة", "Int")],
    run: (f) => {
      const runs = list("FSM Inspection Run").filter((r) => REVIEWED.has(s(r["workflow_state"]))).sort((a, b) => runDate(b).localeCompare(runDate(a)));
      const lastByDev = new Map<string, Doc>();
      for (const r of runs) for (const x of rows(r, "results")) { const d = s(x["device"]); if (d && !lastByDev.has(d)) lastByDev.set(d, r); }
      const openByDev = new Map<string, number>();
      for (const d of list("FSM Deficiency")) if (OPEN_DEFICIENCY.has(s(d["workflow_state"])) && d["device"]) openByDev.set(s(d["device"]), (openByDev.get(s(d["device"])) ?? 0) + 1);
      return list("FSM Device").filter((d) => inScope(d, f) && (f["lifecycle"] ? s(d["lifecycle"]) === f["lifecycle"] : s(d["lifecycle"]) !== "Retired")).map((d) => {
        const r = lastByDev.get(d.name);
        return { site: d["site"], system: d["system"], system_type: s(raw("FSM Service System", d["system"])?.["system_type"]), device: d.name, serial_no: d["serial_no"], location: d["location"], lifecycle: d["lifecycle"],
          last_run: r?.name ?? "", last_outcome: r ? deviceOutcome(rows(r, "results"), d.name) : "Never tested", last_tested: r ? runDate(r).slice(0, 10) : "", open_findings: openByDev.get(d.name) ?? 0 };
      });
    } },
  { id: "RP02", title: "Device inspection history", title_ar: "سجل فحص الأجهزة", grain: "One result row (check attempt)", grain_ar: "صف نتيجة واحد (محاولة فحص)", status: "VIRTUAL",
    question: "What was recorded for each device check, in which run and template version?", question_ar: "ما الذي سُجِّل لكل بند فحص لكل جهاز، وفي أي تشغيل وإصدار قالب؟",
    ref_doctype: "FSM Inspection Run", filters: ["company", "site", "system", "device", "from", "to"],
    columns: [DEV, RUN, C("state", "Run status", "حالة التشغيل"), C("template", "Template", "القالب", "Link", "FSM Inspection Template"), C("template_version", "Version", "الإصدار", "Int"), C("check_code", "Check", "البند"), C("check_text", "Check text", "نص البند"), C("outcome", "Outcome", "النتيجة"), C("measurement", "Measurement", "القياس", "Float"), C("deficiency", "Finding", "الملاحظة", "Link", "FSM Deficiency"), C("date", "Date", "التاريخ", "Date"), SITE],
    run: (f) => list("FSM Inspection Run").filter((r) => inScope(r, f) && between(runDate(r), f)).flatMap((r) => rows(r, "results").filter((x) => x["device"] && (!f.device || s(x["device"]) === f.device)).map((x) => ({
      device: x["device"], run: r.name, state: r["workflow_state"], template: r["template"], template_version: r["template_version"], check_code: x["check_code"], check_text: x["check_text"], outcome: s(x["outcome"]) || "Untested", measurement: x["measurement"] ?? "", deficiency: x["deficiency"] ?? "", date: runDate(r).slice(0, 10), site: r["site"] }))) },
  { id: "RP03", title: "Inspection completion & coverage", title_ar: "اكتمال الفحص والتغطية", grain: "One run (snapshot denominator)", grain_ar: "تشغيل واحد (المقام من اللقطة)", status: "VIRTUAL",
    question: "How much of each run's frozen device population was actually inspected?", question_ar: "ما نسبة الأجهزة المجمدة في لقطة كل تشغيل التي فُحصت فعلاً؟",
    ref_doctype: "FSM Inspection Run", filters: ["company", "site", "system", "from", "to"],
    columns: [RUN, SITE, SYS, C("template_version", "Template version", "إصدار القالب", "Int"), C("state", "Status", "الحالة"), C("technical_result", "Technical result", "النتيجة الفنية"), C("expected", "Expected devices", "الأجهزة المتوقعة", "Int"), C("inspected", "Inspected devices", "الأجهزة المفحوصة", "Int"),
      C("failed", "Failed devices", "أجهزة راسبة", "Int"), C("inaccessible", "Inaccessible devices", "أجهزة تعذر الوصول إليها", "Int"), C("untested", "Untested checks", "بنود لم تُفحص", "Int"), C("na", "Not applicable checks", "بنود لا تنطبق", "Int"), C("coverage", "Coverage %", "نسبة التغطية", "Percent")],
    run: (f) => list("FSM Inspection Run").filter((r) => inScope(r, f) && !r["retest_for"] && between(runDate(r), f)).map((r) => {
      const c = runCoverage(rows(r, "results"), Number(r["expected_devices"]) || undefined);
      return { run: r.name, site: r["site"], system: r["system"], template_version: r["template_version"], state: r["workflow_state"], technical_result: r["technical_result"], expected: c.expected, inspected: c.inspected, failed: c.failedDevices, inaccessible: c.inaccessibleDevices, untested: c.untestedChecks, na: c.naChecks, coverage: c.coverage === null ? "" : Math.round(c.coverage * 1000) / 10 };
    }) },
  { id: "RP04", title: "Failed, untested & inaccessible checks", title_ar: "البنود الراسبة وغير المفحوصة وتعذر الوصول", grain: "One device/check exception", grain_ar: "استثناء بند/جهاز واحد", status: "VIRTUAL",
    question: "Which checks failed, were never tested, or could not be reached — kept apart?", question_ar: "ما البنود الراسبة أو غير المفحوصة أو التي تعذر الوصول إليها — كلٌّ على حدة؟",
    ref_doctype: "FSM Inspection Run", filters: ["company", "site", "system"],
    columns: [C("outcome", "Outcome", "النتيجة"), RUN, SITE, DEV, C("check_code", "Check", "البند"), C("check_text", "Check text", "نص البند"), C("note", "Note", "ملاحظة"), DEFC],
    run: (f) => list("FSM Inspection Run").filter((r) => inScope(r, f) && !r["retest_for"]).flatMap((r) => rows(r, "results").filter((x) => ["Fail", "Untested", "Inaccessible"].includes(s(x["outcome"]) || "Untested") && (!f["outcome"] || (s(x["outcome"]) || "Untested") === f["outcome"])).map((x) => ({
      outcome: s(x["outcome"]) || "Untested", run: r.name, site: r["site"], device: x["device"] ?? "", check_code: x["check_code"], check_text: x["check_text"], note: x["note"] ?? "", deficiency: x["deficiency"] ?? "" }))) },
  { id: "RP05", title: "Deficiency aging", title_ar: "تقادم الملاحظات", grain: "One open finding as of a date", grain_ar: "ملاحظة مفتوحة واحدة في تاريخ", status: "VIRTUAL",
    question: "How long has each open finding been open, and where is it stuck?", question_ar: "منذ متى كل ملاحظة مفتوحة، وأين تتوقف؟",
    ref_doctype: "FSM Deficiency", filters: ["company", "site", "customer", "severity", "as_of"],
    columns: [DEFC, SITE, SYS, C("severity", "Severity", "الخطورة"), C("opened_on", "Opened", "تاريخ الفتح", "Date"), C("age", "Age (days)", "العمر (أيام)", "Int"), C("bucket", "Age bucket", "شريحة العمر"), C("state", "Technical state", "الحالة الفنية"), C("decision", "Customer decision", "قرار العميل"), C("quotation", "Quotation", "عرض السعر", "Link", "Quotation"), C("repair_job", "Repair job", "أمر الإصلاح", "Link", "FSM Job")],
    run: (f) => { const at = asOf(f); return list("FSM Deficiency").filter((d) => inScope(d, f) && OPEN_DEFICIENCY.has(s(d["workflow_state"])) && s(d["opened_on"]) <= at && (!f.severity || s(d["severity"]) === f.severity)).map((d) => {
      const age = Math.max(0, daysBetween(s(d["opened_on"]) || at, at));
      return { deficiency: d.name, site: d["site"], system: d["system"], severity: d["severity"], opened_on: d["opened_on"], age, bucket: agingBucket(age), state: d["workflow_state"], decision: d["commercial_decision"], quotation: d["quotation"] ?? "", repair_job: d["repair_job"] ?? "" };
    }).sort((a, b) => Number(b.age) - Number(a.age)); } },
  { id: "RP06", title: "Finding → quote → repair → retest", title_ar: "الملاحظة ← العرض ← الإصلاح ← إعادة الفحص", grain: "One finding (duplicates excluded)", grain_ar: "ملاحظة واحدة (بدون المكرر)", status: "VIRTUAL",
    question: "Where is every finding in its commercial and technical lifecycle?", question_ar: "أين تقع كل ملاحظة في دورتها التجارية والفنية؟",
    ref_doctype: "FSM Deficiency", needs: ["Quotation", "FSM Job", "FSM Retest"], filters: ["company", "site", "customer", "from", "to"],
    columns: [DEFC, SITE, C("severity", "Severity", "الخطورة"), C("opened_on", "Opened", "الفتح", "Date"), C("quotation", "Latest quotation", "آخر عرض سعر", "Link", "Quotation"), C("quote_revisions", "Quote revisions", "مراجعات العرض", "Int"), C("decision", "Decision", "القرار"),
      C("repair_job", "Repair job", "أمر الإصلاح", "Link", "FSM Job"), C("repair_state", "Repair status", "حالة الإصلاح"), C("retest", "Retest", "إعادة الفحص", "Link", "FSM Retest"), C("retest_status", "Retest status", "حالة إعادة الفحص"), C("state", "Technical state", "الحالة الفنية"), C("closed_on", "Closed", "الإغلاق", "Date"), C("days_to_close", "Days to close", "أيام حتى الإغلاق", "Int")],
    run: (f) => {
      // quote revisions counted per finding from native Quotation Item bridge lines (one per quotation, never per line × revision join)
      const quotes = new Map<string, Set<string>>();
      for (const q of list("Quotation")) for (const it of rows(q, "items")) { const d = s(it["digit_fsm_deficiency"]); if (d) { const set = quotes.get(d) ?? new Set(); set.add(q.name); quotes.set(d, set); } }
      const retests = by(list("FSM Retest"), "deficiency");
      return list("FSM Deficiency").filter((d) => inScope(d, f) && s(d["workflow_state"]) !== "Duplicate" && between(d["opened_on"], f)).map((d) => {
        const rt = (retests.get(d.name) ?? []).sort((a, b) => s(b["modified"]).localeCompare(s(a["modified"])))[0];
        const job = raw("FSM Job", d["repair_job"]);
        return { deficiency: d.name, site: d["site"], severity: d["severity"], opened_on: d["opened_on"], quotation: d["quotation"] ?? "", quote_revisions: quotes.get(d.name)?.size ?? 0, decision: d["commercial_decision"], repair_job: d["repair_job"] ?? "", repair_state: job ? s(job["workflow_state"]) : "",
          retest: rt?.name ?? "", retest_status: rt ? s(rt["status"]) : "", state: d["workflow_state"], closed_on: d["closed_on"] ?? "", days_to_close: d["closed_on"] && d["opened_on"] ? daysBetween(s(d["opened_on"]), s(d["closed_on"])) : "" };
      });
    } },
  { id: "RP07", title: "Open system impairments", title_ar: "تعطّلات الأنظمة القائمة", grain: "One impairment interval active as of a date", grain_ar: "فترة تعطّل قائمة واحدة", status: "VIRTUAL",
    question: "Which systems are impaired right now, for how long, and is a fire watch in place?", question_ar: "ما الأنظمة المتعطلة الآن، ومنذ متى، وهل توجد حراسة حريق؟",
    ref_doctype: "FSM Impairment", filters: ["company", "site", "as_of"],
    columns: [C("impairment", "Impairment", "التعطّل", "Link", "FSM Impairment"), SYS, SITE, C("scope", "Scope", "النطاق"), C("started_on", "Started", "البداية", "Datetime"), C("age_days", "Age (days)", "العمر (أيام)", "Int"), C("authority_notified", "Authority notified", "تم إبلاغ الجهة", "Check"), C("fire_watch", "Fire watch", "حراسة حريق", "Check"), DEFC],
    run: (f) => { const at = asOf(f); return list("FSM Impairment").filter((i) => inScope(i, f) && s(i["started_on"]).slice(0, 10) <= at && (s(i["status"]) === "Active" || s(i["restored_on"]).slice(0, 10) > at)).map((i) => ({
      impairment: i.name, system: i["system"], site: i["site"], scope: i["scope"], started_on: i["started_on"], age_days: daysBetween(s(i["started_on"]).slice(0, 10), at), authority_notified: i["authority_notified"] ? 1 : 0, fire_watch: i["fire_watch"] ? 1 : 0, deficiency: i["deficiency"] ?? "" })); } },
  { id: "RP08", title: "Recurring maintenance compliance", title_ar: "الالتزام بالصيانة الدورية", grain: "One obligation whose window meets the period", grain_ar: "التزام واحد تتقاطع نافذته مع الفترة", status: "VIRTUAL",
    question: "Were the agreed recurring services delivered inside their windows?", question_ar: "هل نُفِّذت الخدمات الدورية المتفق عليها داخل نوافذها؟",
    ref_doctype: "FSM Obligation", filters: ["company", "site", "customer", "agreement", "from", "to"],
    columns: [C("obligation", "Obligation", "الالتزام", "Link", "FSM Obligation"), C("agreement", "Agreement", "الاتفاقية", "Link", "FSM Service Agreement"), SITE, SYS, C("due_date", "Due", "الاستحقاق", "Date"), C("window_end", "Window end", "نهاية النافذة", "Date"), C("status", "Status", "الحالة"), C("past_window", "Past window", "تجاوز النافذة", "Check"), C("fulfilled_on", "Fulfilled on", "تاريخ التنفيذ", "Date"), C("late_days", "Days late", "أيام التأخير", "Int"), C("on_time", "On time", "في الموعد", "Check"), C("fulfilled_by", "Fulfilled by", "منفّذ بواسطة", "Link", "FSM Job")],
    run: (f) => list("FSM Obligation").filter((o) => inScope(o, f) && inPeriod(o, f.from ?? "", f.to ?? "") && (!f.agreement || s(o["agreement"]) === f.agreement) && (!f["status"] || s(o["status"]) === f["status"])).map((o) => ({
      obligation: o.name, agreement: o["agreement"], site: o["site"], system: o["system"], due_date: o["due_date"], window_end: o["window_end"], status: o["status"], past_window: isMissed(o) ? 1 : 0, fulfilled_on: o["fulfilled_on"] ?? "",
      late_days: o["fulfilled_on"] ? Math.max(0, daysBetween(s(o["window_end"]) || s(o["due_date"]), s(o["fulfilled_on"]))) : "", on_time: onTime(o) ? 1 : 0, fulfilled_by: o["fulfilled_by"] ?? "" })).sort((a, b) => s(a.due_date).localeCompare(s(b.due_date))) },
  { id: "RP09", title: "Overdue visits & missed obligations", title_ar: "الزيارات المتأخرة والالتزامات الفائتة", grain: "Two separate datasets: visits and obligations (never unioned)", grain_ar: "مجموعتا بيانات منفصلتان: زيارات والتزامات (لا تُدمجان)", status: "VIRTUAL",
    question: "What should already have happened and has not?", question_ar: "ما الذي كان يجب أن يحدث ولم يحدث بعد؟",
    ref_doctype: "FSM Obligation", needs: [VISIT_DT], filters: ["company", "site", "customer", "as_of"],
    sections: [{ key: "Visit", label: "Overdue visits", label_ar: "الزيارات المتأخرة" }, { key: "Obligation", label: "Missed / overdue obligations", label_ar: "الالتزامات الفائتة / المتأخرة" }],
    columns: [C("dataset", "Dataset", "مجموعة البيانات"), C("record", "Record", "السجل", "Data"), C("record_doctype", "Type", "النوع"), SITE, C("date", "Scheduled / window end", "الموعد / نهاية النافذة", "Date"), C("days_over", "Days overdue", "أيام التأخير", "Int"), C("status", "Status", "الحالة"), C("block", "Block / access", "التعطّل / الوصول"), JOB],
    run: (f) => {
      const at = asOf(f);
      const visits = list(VISIT_DT).filter((v) => inScope(v, f) && ["Planned", "Dispatched", "On Site"].includes(s(v["workflow_state"])) && s(v["scheduled_end"]) && s(v["scheduled_end"]).slice(0, 10) < at).map((v) => ({
        dataset: "Visit", record: v.name, record_doctype: VISIT_DT, site: v["site"], date: s(v["scheduled_end"]).slice(0, 10), days_over: daysBetween(s(v["scheduled_end"]).slice(0, 10), at), status: v["workflow_state"], block: `${s(v["block_reason"]) || "None"} / ${s(v["access_outcome"])}`, job: v["job"] }));
      const obls = list("FSM Obligation").filter((o) => inScope(o, f) && (s(o["status"]) === "Missed" || isMissed(o, at))).map((o) => ({
        dataset: "Obligation", record: o.name, record_doctype: "FSM Obligation", site: o["site"], date: s(o["window_end"]) || s(o["due_date"]), days_over: daysBetween(s(o["window_end"]) || s(o["due_date"]), at), status: o["status"], block: "", job: rows(raw("FSM Job", o["fulfilled_by"]) as Doc | undefined, "obligations").length ? o["fulfilled_by"] : "" }));
      return [...visits, ...obls];
    } },
  { id: "RP10", title: "Technician productivity", title_ar: "إنتاجية الفنيين", grain: "One technician over the period", grain_ar: "فني واحد خلال الفترة", status: "PARTIAL",
    server_note: "Approved productive labour comes from submitted native Timesheets linked to FSM jobs; travel / non-billable split needs the server time engine.", server_note_ar: "ساعات العمل المعتمدة تأتي من سجلات الوقت الأصلية المعتمدة المرتبطة بأوامر العمل؛ فصل التنقل وغير القابل للفوترة يتطلب محرك الوقت على الخادم.",
    question: "How much of each technician's available time is booked, and how much labour was approved?", question_ar: "كم من وقت كل فني المتاح محجوز، وكم من ساعات العمل اعتُمد؟",
    ref_doctype: "FSM Technician", needs: ["FSM Booking", VISIT_DT], filters: ["company", "from", "to", "technician"],
    columns: [C("technician", "Technician", "الفني", "Link", "FSM Technician"), C("crew", "Crew", "الطاقم"), C("available_h", "Available hours", "الساعات المتاحة", "Float"), C("booked_h", "Booked hours", "الساعات المحجوزة", "Float"), C("booked_pct", "Booked %", "نسبة الحجز", "Percent"), C("visits_completed", "Visits completed", "زيارات مكتملة", "Int"), C("return_visits", "Unplanned return visits", "زيارات عودة غير مخططة", "Int"), C("labour_h", "Approved labour hours (timesheets)", "ساعات العمل المعتمدة (سجلات الوقت)", "Float")],
    run: (f) => {
      const from = f.from || "2026-10-01", to = f.to || "2026-10-31";
      const days = Math.max(1, daysBetween(from, to) + 1); const workdays = Math.round(days * 5 / 7);
      const bookings = by(list("FSM Booking").filter((b) => s(b["status"]) !== "Cancelled" && s(b["booking_start"]).slice(0, 10) <= to && s(b["booking_end"]).slice(0, 10) >= from), "technician");
      const visits = by(list(VISIT_DT).filter((v) => s(v["workflow_state"]) === "Completed" && between(v["completed_on"], { from, to })), "technician");
      const unavail = by(list("FSM Calendar Exception").filter((c) => s(c["status"]) === "Approved" && ["Unavailable", "Leave", "Training"].includes(s(c["exception_type"]))), "technician");
      const tsByEmp = new Map<string, number>();
      for (const t of list("Timesheet")) if (t["digit_fsm_job"] && Number(t["docstatus"]) === 1 && between(t["start_date"], { from, to })) tsByEmp.set(s(t["employee"]), (tsByEmp.get(s(t["employee"])) ?? 0) + Number(t["total_hours"] ?? 0));
      return list("FSM Technician").filter((t) => (!f.technician || t.name === f.technician) && (!f.company || s(t["company"]) === f.company)).map((t) => {
        const off = (unavail.get(t.name) ?? []).reduce((h, c) => h + Math.min(hoursBetween(c["from_time"], c["to_time"]), 24 * days) * (Number(t["daily_hours"] ?? 8) / 24), 0);
        const available = Math.max(0, workdays * Number(t["daily_hours"] ?? 8) - off);
        const booked = (bookings.get(t.name) ?? []).reduce((h, b) => h + hoursBetween(b["booking_start"], b["booking_end"]), 0);
        const vs = visits.get(t.name) ?? [];
        return { technician: t.name, crew: t["crew"], available_h: Math.round(available * 10) / 10, booked_h: Math.round(booked * 10) / 10, booked_pct: available ? Math.round((booked / available) * 1000) / 10 : "", visits_completed: vs.length,
          return_visits: vs.filter((v) => s(v["visit_purpose"]) === "Return Visit" && ["Rework", "Parts", "Access"].includes(s(v["return_reason"]))).length, labour_h: tsByEmp.get(s(t["employee"])) ?? 0 };
      });
    } },
  { id: "RP11", title: "SLA breaches (service requests)", title_ar: "إخلالات مستوى الخدمة (طلبات الخدمة)", grain: "One service request (native Issue) and its SLA clock", grain_ar: "طلب خدمة واحد (بلاغ دعم أصلي) وساعته", status: "PARTIAL",
    server_note: "Response/resolution deadlines and pauses are set by the native SLA engine on the server; the preview reads the recorded native fields only.", server_note_ar: "مواعيد الاستجابة والحل والإيقافات يحددها محرك اتفاقيات الخدمة الأصلي على الخادم؛ المعاينة تقرأ الحقول الأصلية المسجلة فقط.",
    question: "Which service requests missed their response or resolution target?", question_ar: "ما طلبات الخدمة التي فاتها هدف الاستجابة أو الحل؟",
    ref_doctype: "Issue", filters: ["company", "site", "customer", "from", "to"],
    columns: [C("issue", "Service request", "طلب الخدمة", "Link", "Issue"), SITE, C("priority", "Priority", "الأولوية"), C("opened", "Opened", "الفتح", "Date"), C("response_by", "Respond by", "الاستجابة قبل", "Datetime"), C("first_responded_on", "First response", "أول استجابة", "Datetime"), C("response_h", "Response hours", "ساعات الاستجابة", "Float"), C("response_breach", "Response breached", "إخلال بالاستجابة", "Check"), C("resolution_by", "Resolve by", "الحل قبل", "Datetime"), C("status", "Status", "الحالة"), JOB],
    run: (f) => list("Issue").filter((i) => i["digit_fsm_site"] && between(i["opening_date"], f) && (!f.site || s(i["digit_fsm_site"]) === f.site) && (!f.customer || s(i["customer"]) === f.customer) && (!f.company || !i["company"] || s(i["company"]) === f.company)).map((i) => {
      const opened = `${s(i["opening_date"])} ${s(i["opening_time"]) || "00:00:00"}`;
      const resp = i["first_responded_on"] ? hoursBetween(opened, i["first_responded_on"]) : "";
      return { issue: i.name, site: i["digit_fsm_site"], priority: i["priority"], opened: i["opening_date"], response_by: i["response_by"] ?? "", first_responded_on: i["first_responded_on"] ?? "", response_h: resp === "" ? "" : Math.round(Number(resp) * 10) / 10,
        response_breach: i["response_by"] && (s(i["first_responded_on"]) || `${today()} 23:59`) > s(i["response_by"]) ? 1 : 0, resolution_by: i["sla_resolution_by"] ?? "", status: i["status"], job: i["digit_fsm_job"] ?? "" };
    }) },
  { id: "RP12", title: "Contract coverage & renewal risk", title_ar: "تغطية العقود ومخاطر التجديد", grain: "One agreement (each measure aggregated on its own key)", grain_ar: "اتفاقية واحدة (كل مقياس يُجمع على مفتاحه)", status: "VIRTUAL",
    question: "Which agreements expire soon with delivery or safety risk?", question_ar: "ما الاتفاقيات التي تنتهي قريباً مع مخاطر تنفيذ أو سلامة؟",
    ref_doctype: "FSM Service Agreement", needs: ["FSM Obligation", "FSM Deficiency"], filters: ["company", "site", "customer", "as_of"],
    columns: [C("agreement", "Agreement", "الاتفاقية", "Link", "FSM Service Agreement"), C("customer", "Customer", "العميل", "Link", "Customer"), SITE, C("state", "Status", "الحالة"), C("end_date", "End", "النهاية", "Date"), C("days_to_expiry", "Days to expiry", "أيام حتى الانتهاء", "Int"), C("coverage_lines", "Coverage lines", "بنود التغطية", "Int"),
      C("obligations", "Obligations", "الالتزامات", "Int"), C("fulfilled", "Fulfilled", "منفّذ", "Int"), C("missed", "Missed / overdue", "فائت / متأخر", "Int"), C("open_findings", "Open site findings", "ملاحظات الموقع المفتوحة", "Int"), C("renewal", "Renewal case", "حالة التجديد", "Link", "FSM Renewal Case"), C("annual_value", "Annual value", "القيمة السنوية", "Currency")],
    run: (f) => {
      const at = asOf(f); const obls = by(list("FSM Obligation"), "agreement"); const defsBySite = by(list("FSM Deficiency").filter((d) => OPEN_DEFICIENCY.has(s(d["workflow_state"]))), "site"); const ren = by(list("FSM Renewal Case"), "agreement");
      return list("FSM Service Agreement").filter((a) => inScope(a, f)).map((a) => { const o = obls.get(a.name) ?? [];
        return { agreement: a.name, customer: a["customer"], site: a["site"], state: a["workflow_state"], end_date: a["end_date"], days_to_expiry: daysBetween(at, s(a["end_date"])), coverage_lines: rows(a, "coverage").length, obligations: o.length, fulfilled: o.filter((x) => s(x["status"]) === "Fulfilled").length,
          missed: o.filter((x) => s(x["status"]) === "Missed" || isMissed(x, at)).length, open_findings: (defsBySite.get(s(a["site"])) ?? []).length, renewal: (ren.get(a.name) ?? [])[0]?.name ?? "", annual_value: a["annual_value"] ?? "" }; }).sort((a, b) => Number(a.days_to_expiry) - Number(b.days_to_expiry));
    } },
  { id: "RP13", title: "Parts requested, issued & returned by job", title_ar: "المواد المطلوبة والمصروفة والمرتجعة حسب أمر العمل", grain: "One native document line linked to an FSM job", grain_ar: "سطر مستند أصلي واحد مرتبط بأمر عمل", status: "PARTIAL",
    server_note: "Quantities are read from native Material Requests and Stock Entries: issued = posted transfer stores → van, used = posted Material Issue, returned = posted transfer van → stores (domain/billing.ts moveKind). Van balances come from the posted stock ledger.", server_note_ar: "الكميات تُقرأ من طلبات المواد وقيود المخزون الأصلية: المصروف = تحويل مرحّل من المستودع إلى السيارة، المستخدم = صرف مواد مرحّل، المرتجع = تحويل مرحّل من السيارة إلى المستودع. أرصدة السيارات من دفتر المخزون المرحّل.",
    question: "Which parts were requested, issued and returned for each job?", question_ar: "ما المواد المطلوبة والمصروفة والمرتجعة لكل أمر عمل؟",
    ref_doctype: "Material Request", needs: ["Stock Entry"], filters: ["company"],
    columns: [JOB, C("document", "Document", "المستند"), C("doctype_label", "Document type", "نوع المستند"), C("status", "Status", "الحالة"), C("item_code", "Item", "الصنف", "Link", "Item"), C("requested", "Requested qty", "الكمية المطلوبة", "Float"), C("issued", "Issued qty", "الكمية المصروفة", "Float"), C("used", "Used qty", "الكمية المستخدمة", "Float"), C("returned", "Returned qty", "الكمية المرتجعة", "Float")],
    run: (f) => { const vans = vanWarehouses(); return [
      ...list("Material Request").filter((m) => m["digit_fsm_job"] && (!f.company || s(m["company"]) === f.company)).flatMap((m) => rows(m, "items").map((it) => ({ job: m["digit_fsm_job"], document: m.name, doctype_label: "Material Request", status: Number(m["docstatus"]) === 1 ? "Submitted" : "Draft", item_code: it["item_code"], requested: Number(it["qty"] ?? 0), issued: "", used: "", returned: "" }))),
      ...list("Stock Entry").filter((m) => m["digit_fsm_job"] && Number(m["docstatus"] ?? 0) !== 2 && (!f.company || s(m["company"]) === f.company)).flatMap((m) => rows(m, "items").map((it) => { const k = moveKind(m, it, vans); const posted = Number(m["docstatus"]) === 1; const q = posted ? Number(it["qty"] ?? 0) : "";
        return { job: m["digit_fsm_job"], document: m.name, doctype_label: "Stock Entry", status: posted ? "Submitted" : "Draft", item_code: it["item_code"], requested: "", issued: k === "issue" ? q : "", used: k === "use" ? q : "", returned: k === "return" ? q : "" }; })),
    ]; } },
  { id: "RP14", title: "Job commercial position", title_ar: "الموقف التجاري لأوامر العمل", grain: "One job", grain_ar: "أمر عمل واحد", status: "SERVER_REQUIRED",
    server_note: "Recognised revenue, labour/material/subcontract cost and contribution need posted native invoices and costs (GL) on the server; the preview shows the quoted and proposed amounts only.", server_note_ar: "الإيراد المعترف به وتكاليف العمل والمواد والباطن والمساهمة تتطلب فواتير وتكاليف أصلية مُرحّلة على الخادم؛ المعاينة تعرض المبالغ المسعّرة والمقترحة فقط.",
    question: "What was quoted and proposed for each job — and what still needs posted cost?", question_ar: "ما الذي سُعِّر واقتُرح لكل أمر عمل — وما الذي يحتاج تكلفة مُرحّلة؟",
    ref_doctype: "FSM Job", needs: ["FSM Charge Proposal", "Quotation"], filters: ["company", "site", "customer", "from", "to"],
    columns: [JOB, SITE, C("job_type", "Type", "النوع"), C("state", "Status", "الحالة"), C("visits", "Visits", "الزيارات", "Int"), C("booked_h", "Booked hours", "الساعات المحجوزة", "Float"), C("quoted", "Quoted value", "القيمة المسعّرة", "Currency"), C("proposed", "Charge proposed", "التحصيل المقترح", "Currency"), C("coverage", "Coverage decision", "قرار التغطية"),
      C("revenue", "Recognised revenue", "الإيراد المعترف به", "Currency", undefined, true), C("cost", "Actual cost", "التكلفة الفعلية", "Currency", undefined, true), C("contribution", "Contribution", "المساهمة", "Currency", undefined, true)],
    run: (f) => {
      const visits = by(list(VISIT_DT), "job"); const charges = by(list("FSM Charge Proposal"), "job"); const bookings = by(list("FSM Booking").filter((b) => s(b["status"]) !== "Cancelled"), "visit");
      return list("FSM Job").filter((j) => inScope(j, f) && between(j["completed_on"] || j["creation"], f)).map((j) => { const vs = visits.get(j.name) ?? []; const c = (charges.get(j.name) ?? [])[0];
        return { job: j.name, site: j["site"], job_type: j["job_type"], state: j["workflow_state"], visits: vs.length, booked_h: Math.round(vs.reduce((h, v) => h + (bookings.get(v.name) ?? []).reduce((x, b) => x + hoursBetween(b["booking_start"], b["booking_end"]), 0), 0) * 10) / 10,
          quoted: Number(raw("Quotation", j["quotation"])?.["grand_total"] ?? 0) || "", proposed: c ? Number(c["amount"] ?? 0) : "", coverage: c ? c["coverage_decision"] : "", revenue: SERVER, cost: SERVER, contribution: SERVER }; });
    } },
  { id: "RP15", title: "AMC value vs service delivered", title_ar: "قيمة العقد السنوي مقابل الخدمة المنفذة", grain: "One agreement over its term", grain_ar: "اتفاقية واحدة خلال مدتها", status: "SERVER_REQUIRED",
    server_note: "Actual service cost, revenue recognition and unpaid balance need posted native finance on the server.", server_note_ar: "التكلفة الفعلية والاعتراف بالإيراد والرصيد غير المسدد تتطلب المالية الأصلية المرحّلة على الخادم.",
    question: "How much service did each agreement consume against its contract value?", question_ar: "كم خدمة استهلكت كل اتفاقية مقابل قيمتها التعاقدية؟",
    ref_doctype: "FSM Service Agreement", needs: ["FSM Job", VISIT_DT], filters: ["company", "site", "customer"],
    columns: [C("agreement", "Agreement", "الاتفاقية", "Link", "FSM Service Agreement"), C("customer", "Customer", "العميل", "Link", "Customer"), C("annual_value", "Contract value (annual)", "قيمة العقد (سنوي)", "Currency"), C("jobs", "Jobs", "أوامر العمل", "Int"), C("visits", "Completed visits", "زيارات مكتملة", "Int"), C("booked_h", "Booked hours", "الساعات المحجوزة", "Float"),
      C("cost", "Actual service cost", "تكلفة الخدمة الفعلية", "Currency", undefined, true), C("contribution", "Contribution", "المساهمة", "Currency", undefined, true)],
    run: (f) => {
      const jobs = by(list("FSM Job"), "agreement"); const visits = by(list(VISIT_DT), "job"); const bookings = by(list("FSM Booking").filter((b) => s(b["status"]) !== "Cancelled"), "visit");
      return list("FSM Service Agreement").filter((a) => inScope(a, f)).map((a) => { const js = jobs.get(a.name) ?? []; const vs = js.flatMap((j) => visits.get(j.name) ?? []);
        return { agreement: a.name, customer: a["customer"], annual_value: a["annual_value"] ?? "", jobs: js.length, visits: vs.filter((v) => s(v["workflow_state"]) === "Completed").length, booked_h: Math.round(vs.reduce((h, v) => h + (bookings.get(v.name) ?? []).reduce((x, b) => x + hoursBetween(b["booking_start"], b["booking_end"]), 0), 0) * 10) / 10, cost: SERVER, contribution: SERVER }; });
    } },
  { id: "RP16", title: "Customer / site service history", title_ar: "سجل خدمة العميل / الموقع", grain: "One event, chronological", grain_ar: "حدث واحد بترتيب زمني", status: "VIRTUAL",
    question: "What happened at this customer or site, in order?", question_ar: "ماذا حدث لدى هذا العميل أو الموقع، بالترتيب؟",
    ref_doctype: "FSM Job", needs: [VISIT_DT, "FSM Inspection Run", "FSM Deficiency", "FSM Report Revision"], filters: ["company", "site", "customer", "from", "to"],
    columns: [C("date", "Date", "التاريخ", "Date"), C("event", "Event", "الحدث"), C("record", "Record", "السجل"), C("record_doctype", "Type", "النوع"), SITE, C("status", "Status", "الحالة"), C("subject", "Subject", "الموضوع")],
    run: (f) => {
      const ev: Row[] = [];
      const add = (date: unknown, event: string, dt: string, d: Doc, status: unknown, subject: string) => { if (!s(date) || !inScope(d, f) || !between(date, f)) return; ev.push({ date: s(date).slice(0, 10), event, record: d.name, record_doctype: dt, site: d["site"], status, subject }); };
      for (const j of list("FSM Job")) { add(s(j["creation"]).slice(0, 10), "Job created", "FSM Job", j, j["workflow_state"], s(j["job_title"])); if (j["completed_on"]) add(j["completed_on"], "Job completed", "FSM Job", j, j["workflow_state"], s(j["job_title"])); }
      for (const v of list(VISIT_DT)) if (v["completed_on"]) add(v["completed_on"], "Visit completed", VISIT_DT, v, v["access_outcome"], titleOf("FSM Technician", v["technician"]));
      for (const r of list("FSM Inspection Run")) if (r["reviewed_on"]) add(r["reviewed_on"], r["retest_for"] ? "Retest reviewed" : "Inspection reviewed", "FSM Inspection Run", r, r["technical_result"], titleOf("FSM Service System", r["system"]));
      for (const d of list("FSM Deficiency")) { add(d["opened_on"], "Finding opened", "FSM Deficiency", d, d["severity"], s(d["title"])); if (d["closed_on"]) add(d["closed_on"], "Finding closed", "FSM Deficiency", d, d["workflow_state"], s(d["title"])); }
      for (const p of list("FSM Report Revision")) add(p["published_on"], "Report published", "FSM Report Revision", p, p["technical_result"], `${titleOf("FSM Service System", p["system"])} r${s(p["revision"])}`);
      return ev.sort((a, b) => s(b["date"]).localeCompare(s(a["date"])));
    } },
  { id: "RP17", title: "Review & publication backlog", title_ar: "متأخرات المراجعة والنشر", grain: "One run awaiting review or publication", grain_ar: "تشغيل واحد بانتظار المراجعة أو النشر", status: "VIRTUAL",
    question: "Which submitted runs wait for a reviewer, and which reviewed runs are not yet published?", question_ar: "ما التشغيلات المقدمة التي تنتظر مراجعاً، وما المراجَعة التي لم تُنشر بعد؟",
    ref_doctype: "FSM Inspection Run", filters: ["company", "site", "as_of"],
    columns: [RUN, SITE, SYS, C("state", "Status", "الحالة"), C("submitted_on", "Submitted", "التقديم", "Datetime"), C("waiting_days", "Waiting (days)", "الانتظار (أيام)", "Int"), C("return_count", "Times returned", "مرات الإعادة", "Int"), C("reviewed_on", "Reviewed", "المراجعة", "Datetime"), C("review_h", "Review turnaround (h)", "زمن المراجعة (ساعات)", "Float"), C("technical_result", "Technical result", "النتيجة الفنية")],
    run: (f) => { const at = asOf(f); return list("FSM Inspection Run").filter((r) => inScope(r, f) && ["Submitted for Review", "Reviewed"].includes(s(r["workflow_state"]))).map((r) => ({
      run: r.name, site: r["site"], system: r["system"], state: r["workflow_state"], submitted_on: r["submitted_on"] ?? "", waiting_days: daysBetween(s(r[s(r["workflow_state"]) === "Reviewed" ? "reviewed_on" : "submitted_on"]).slice(0, 10) || at, at), return_count: r["return_count"] ?? 0, reviewed_on: r["reviewed_on"] ?? "",
      review_h: r["reviewed_on"] ? Math.round(hoursBetween(r["submitted_on"], r["reviewed_on"]) * 10) / 10 : "", technical_result: r["technical_result"] })); } },
  { id: "RP18", title: "Offline & sync recovery", title_ar: "التعافي من العمل دون اتصال والمزامنة", grain: "One sync operation", grain_ar: "عملية مزامنة واحدة", status: "SERVER_REQUIRED",
    server_note: "No mobile offline store or sync service exists in this environment; operations appear here only when the server sync service records them.", server_note_ar: "لا يوجد مخزن جوال دون اتصال أو خدمة مزامنة في هذه البيئة؛ تظهر العمليات هنا فقط عندما تسجلها خدمة المزامنة على الخادم.",
    question: "Which offline operations failed to sync and need recovery?", question_ar: "ما العمليات دون اتصال التي فشلت مزامنتها وتحتاج تعافياً؟",
    ref_doctype: "FSM Integration Exception", filters: ["company"],
    columns: [C("exception", "Exception", "الاستثناء", "Link", "FSM Integration Exception"), C("reference", "Reference", "المرجع"), C("status", "Status", "الحالة"), C("attempts", "Attempts", "المحاولات", "Int"), C("error", "Error", "الخطأ")],
    run: (f) => list("FSM Integration Exception").filter((e) => s(e["source"]) === "Offline Sync" && (!f.company || s(e["company"]) === f.company)).map((e) => ({ exception: e.name, reference: `${s(e["reference_doctype"])} ${s(e["reference_name"])}`, status: e["status"], attempts: e["attempts"], error: e["error"] })) },
  { id: "RP19", title: "Financial hand-off reconciliation", title_ar: "مطابقة التسليم المالي", grain: "One charge proposal", grain_ar: "مقترح تحصيل واحد", status: "PARTIAL",
    server_note: "The hand-off creates one native draft Sales Invoice per charge (billing equation lines, VAT 15 %); finance posts it from the invoice form. An earlier failed hand-off still shows its exception.", server_note_ar: "التسليم ينشئ مسودة فاتورة مبيعات أصلية واحدة لكل تحصيل (بنود معادلة الفوترة، ضريبة 15%)؛ المالية ترحّلها من نموذج الفاتورة. التسليم المتعثر سابقاً يظهر استثناءه.",
    question: "Did every approved charge reach a native invoice, and where did it stop?", question_ar: "هل وصل كل تحصيل معتمد إلى فاتورة أصلية، وأين توقف؟",
    ref_doctype: "FSM Charge Proposal", needs: ["FSM Integration Exception"], filters: ["company", "site", "customer"],
    columns: [C("proposal", "Charge proposal", "مقترح التحصيل", "Link", "FSM Charge Proposal"), JOB, C("customer", "Customer", "العميل", "Link", "Customer"), C("coverage", "Coverage", "التغطية"), C("amount", "Approved amount", "المبلغ المعتمد", "Currency"), C("status", "Hand-off status", "حالة التسليم"),
      C("sales_invoice", "Sales invoice", "فاتورة المبيعات", "Link", "Sales Invoice"), C("invoiced", "Invoiced amount", "المبلغ المفوتر", "Currency"), C("difference", "Difference", "الفرق", "Currency"), C("exception", "Open exception", "استثناء مفتوح", "Link", "FSM Integration Exception"), C("attempts", "Attempts", "المحاولات", "Int")],
    run: (f) => { const exc = by(list("FSM Integration Exception").filter((e) => s(e["status"]) !== "Resolved"), "reference_name");
      return list("FSM Charge Proposal").filter((c) => inScope(c, f)).map((c) => { const si = raw("Sales Invoice", c["sales_invoice"]); const e = (exc.get(c.name) ?? [])[0]; const inv = si ? Number(si["grand_total"] ?? 0) : "";
        return { proposal: c.name, job: c["job"], customer: c["customer"], coverage: c["coverage_decision"], amount: Number(c["amount"] ?? 0), status: c["status"], sales_invoice: c["sales_invoice"] ?? "", invoiced: inv, difference: inv === "" ? "" : Number(c["amount"] ?? 0) - Number(inv), exception: e?.name ?? "", attempts: e ? Number(e["attempts"] ?? 0) : "" }; }); } },
  { id: "RP20", title: "Communication delivery audit", title_ar: "تدقيق تسليم المراسلات", grain: "One communication linked to FSM work", grain_ar: "مراسلة واحدة مرتبطة بأعمال الخدمة", status: "PARTIAL",
    server_note: "Provider delivery receipts (sent / delivered / read) are recorded only by a configured server provider.", server_note_ar: "إيصالات التسليم من المزود (أُرسل / سُلِّم / قُرئ) تُسجَّل فقط عبر مزود مهيأ على الخادم.",
    question: "Which customer messages about service work were sent, and what is their delivery status?", question_ar: "ما رسائل العملاء الخاصة بأعمال الخدمة التي أُرسلت، وما حالة تسليمها؟",
    ref_doctype: "Communication", filters: ["from", "to"],
    columns: [C("communication", "Communication", "المراسلة", "Link", "Communication"), C("reference", "About", "بخصوص"), C("recipients", "Recipients", "المستلمون"), C("medium", "Channel", "القناة"), C("date", "Date", "التاريخ", "Date"), C("delivery", "Delivery status", "حالة التسليم")],
    run: (f) => list("Communication").filter((c) => (s(c["reference_doctype"]).startsWith("FSM ") || s(c["reference_doctype"]) === "Issue") && between(c["communication_date"] || c["creation"], f)).map((c) => ({
      communication: c.name, reference: `${s(c["reference_doctype"])} ${s(c["reference_name"])}`, recipients: c["recipients"] ?? "", medium: c["communication_medium"] ?? "", date: s(c["communication_date"] || c["creation"]).slice(0, 10), delivery: s(c["delivery_status"]) || "Not recorded (server provider)" })) },
];
export const reportById = (id: string) => FSM_REPORTS.find((r) => r.id === id);
/** A report is readable only when its source DocType is; extra sources missing make it partial, never silently complete. */
export function reportAccess(r: ReportDef): { ok: boolean; missing: string[] } { return { ok: canRead(r.ref_doctype), missing: (r.needs ?? []).filter((d) => !canRead(d)) }; }
export { idx };
