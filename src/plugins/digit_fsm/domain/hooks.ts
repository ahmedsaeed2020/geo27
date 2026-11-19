import { nativeVisit } from "../visitNative";
import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * Controller hooks of DIGIT FSM + ITM (virtual port of the future digit_fsm Python controllers). Registered on the shared
 * adapter, so every write path — native form, workflow Actions menu, app pages, services, import — enforces the same
 * invariants. Messages are "English ‖ Arabic" (services split them; the native form shows both).
 * They never write GL / Stock Ledger / Payment Ledger rows.
 */
import { adapter, registerDocHook, type Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { conflicts, nowIso, s, technicalResult, today, type Row } from "./rules";

const msg = (en: string, ar: string) => `${en} ‖ ${ar}`;
const get = (dt: string, n: unknown) => (n ? adapter.get(dt, String(n)) : undefined);
const changedTo = (doc: Doc, before: Doc | undefined, field: string, value: string) => s(doc[field]) === value && s(before?.[field]) !== value;
const rows = (d: Doc | undefined, f: string) => ((d?.[f] as Row[] | undefined) ?? []);
let installed = false;

export function installFsmHooks() {
  if (installed) return; installed = true;

  registerDocHook("FSM Service Site", (doc) => ({ doc }));

  registerDocHook("FSM Location Node", (doc) => {
    const site = get("FSM Service Site", doc["site"]); const errors: string[] = [];
    if (site && !doc["company"]) doc = { ...doc, company: site["company"] };
    const parent = get("FSM Location Node", doc["parent_node"]);
    if (parent && s(parent["site"]) !== s(doc["site"])) errors.push(msg("The parent node belongs to another site", "العقدة الأم تتبع موقعاً آخر"));
    if (parent && parent.name === doc.name) errors.push(msg("A node cannot be its own parent", "لا يمكن أن تكون العقدة أماً لنفسها"));
    return { doc, errors };
  });

  registerDocHook("FSM Service System", (doc) => {
    const site = get("FSM Service Site", doc["site"]); const errors: string[] = [];
    if (site && !doc["company"]) doc = { ...doc, company: site["company"] };
    const loc = get("FSM Location Node", doc["location"]);
    if (loc && s(loc["site"]) !== s(doc["site"])) errors.push(msg("The location belongs to another site", "المكان يتبع موقعاً آخر"));
    return { doc, errors };
  });

  registerDocHook("FSM Device", (doc) => {
    const sys = get("FSM Service System", doc["system"]); const errors: string[] = [];
    if (sys) doc = { ...doc, site: sys["site"], company: doc["company"] || sys["company"] };
    const loc = get("FSM Location Node", doc["location"]);
    if (loc && s(loc["site"]) !== s(doc["site"])) errors.push(msg("The location belongs to another site", "المكان يتبع موقعاً آخر"));
    return { doc, errors };
  });

  registerDocHook("FSM Asset Change", (doc) => { const d = get("FSM Device", doc["device"]); return { doc: d ? { ...doc, site: d["site"], company: doc["company"] || d["company"] } : doc }; });

  registerDocHook("FSM Technician", (doc) => {
    const e = get("Employee", doc["employee"]);
    return { doc: e ? { ...doc, technician_name: doc["technician_name"] || e["employee_name"], company: doc["company"] || e["company"] } : doc };
  });

  registerDocHook("FSM Calendar Exception", (doc) => {
    const errors = doc["from_time"] && doc["to_time"] && s(doc["to_time"]) <= s(doc["from_time"]) ? [msg("'To' must be after 'From'", "يجب أن يكون 'إلى' بعد 'من'")] : [];
    return { doc, errors };
  });

  registerDocHook("FSM Service Agreement", (doc) => {
    const errors: string[] = []; const site = get("FSM Service Site", doc["site"]);
    if (site) doc = { ...doc, company: doc["company"] || site["company"] };
    if (site && doc["customer"] && s(site["customer"]) !== s(doc["customer"])) errors.push(msg("The site belongs to another customer", "الموقع يتبع عميلاً آخر"));
    if (doc["start_date"] && doc["end_date"] && s(doc["end_date"]) <= s(doc["start_date"])) errors.push(msg("End date must be after start date", "يجب أن يكون تاريخ النهاية بعد البداية"));
    for (const c of rows(doc, "coverage")) {
      const sys = get("FSM Service System", c["system"]);
      if (sys && s(sys["site"]) !== s(doc["site"])) errors.push(msg(`Coverage system ${sys.name} is on another site`, `نظام التغطية ${sys.name} في موقع آخر`));
    }
    return { doc, errors };
  });

  registerDocHook("FSM Obligation", (doc, before) => {
    const errors: string[] = [];
    if (changedTo(doc, before, "status", "Fulfilled") && !doc["fulfilled_by"]) errors.push(msg("An obligation is fulfilled only from a reviewed inspection of its job", "يُنفَّذ الالتزام فقط من فحص مراجَع لأمر عمله"));
    if (changedTo(doc, before, "status", "Waived") && !s(doc["waiver_reason"]).trim()) errors.push(msg("A waiver reason is required", "سبب الإعفاء مطلوب"));
    return { doc, errors };
  });

  registerDocHook("FSM Job", (doc, before) => {
    const errors: string[] = []; const site = get("FSM Service Site", doc["site"]);
    if (site) doc = { ...doc, company: doc["company"] || site["company"] };
    if (site && doc["customer"] && s(site["customer"]) !== s(doc["customer"])) errors.push(msg("The site belongs to another customer", "الموقع يتبع عميلاً آخر"));
    if (before && changedTo(doc, before, "workflow_state", "Completed")) {
      const visits = adapter.list(VISIT_DT).filter((v) => s(v["job"]) === doc.name);
      if (visits.some((v) => ["Planned", "Dispatched", "On Site"].includes(s(v["workflow_state"])))) errors.push(msg("Finish or cancel the open visits first", "أنهِ الزيارات المفتوحة أو ألغها أولاً"));
      if (!visits.some((v) => s(v["workflow_state"]) === "Completed")) errors.push(msg("A job is completed only after at least one completed visit", "يكتمل أمر العمل بعد زيارة مكتملة واحدة على الأقل"));
      doc = { ...doc, completed_on: nowIso() };
    }
    // a cancelled job releases its scheduled obligations back to Due (the obligation itself is never erased)
    if (before && changedTo(doc, before, "workflow_state", "Cancelled")) {
      const release = rows(doc, "obligations").map((b) => get("FSM Obligation", b["obligation"])).filter((o): o is Doc => !!o && s(o["status"]) === "Scheduled");
      return { doc, errors, after: () => { for (const o of release) adapter.update("FSM Obligation", o.name, { status: "Due" }); } };
    }
    return { doc, errors };
  });

  registerDocHook(VISIT_DT, (doc, before) => {
    if (!doc["job"]) return { doc };
    doc = { ...doc, ...nativeVisit(doc) };
    const errors: string[] = []; const job = get("FSM Job", doc["job"]);
    if (job) doc = { ...doc, site: job["site"], company: doc["company"] || job["company"] };
    if (doc["scheduled_start"] && doc["scheduled_end"] && s(doc["scheduled_end"]) <= s(doc["scheduled_start"])) errors.push(msg("Scheduled end must be after start", "يجب أن تكون نهاية الموعد بعد بدايته"));
    if (before) {
      if (changedTo(doc, before, "workflow_state", "Cancelled") && !s(doc["cancel_reason"]).trim()) errors.push(msg("A cancellation reason is required", "سبب الإلغاء مطلوب"));
      if (changedTo(doc, before, "workflow_state", "Dispatched") && (!doc["technician"] || !doc["scheduled_start"])) errors.push(msg("Book a lead technician before dispatch", "احجز فنياً رئيسياً قبل الإرسال"));
      if (changedTo(doc, before, "workflow_state", "On Site")) doc = { ...doc, arrived_on: nowIso() };
      if (changedTo(doc, before, "workflow_state", "Completed")) {
        if (s(doc["access_outcome"]) === "Not Recorded") errors.push(msg("Record the access outcome before finishing the visit", "سجّل نتيجة الوصول قبل إنهاء الزيارة"));
        doc = { ...doc, completed_on: nowIso() };
      }
    }
    return { doc, errors };
  });

  registerDocHook("FSM Booking", (doc) => {
    const errors: string[] = []; const v = get(VISIT_DT, doc["visit"]);
    if (v) doc = { ...doc, site: v["site"], company: doc["company"] || v["company"] };
    if (doc["booking_start"] && doc["booking_end"] && s(doc["booking_end"]) <= s(doc["booking_start"])) errors.push(msg("End must be after start", "يجب أن تكون النهاية بعد البداية"));
    if (s(doc["status"]) !== "Cancelled" && doc["technician"] && doc["booking_start"] && doc["booking_end"]) {
      const others = adapter.list("FSM Booking").filter((b) => b.name !== doc.name && s(b["technician"]) === s(doc["technician"]) && s(b["status"]) !== "Cancelled");
      const hit = conflicts({ start: s(doc["booking_start"]), end: s(doc["booking_end"]), name: doc.name }, others.map((b) => ({ start: s(b["booking_start"]), end: s(b["booking_end"]), name: b.name })));
      if (hit.length) errors.push(msg(`Technician already booked (${hit.map((h) => h.name).join(", ")})`, `الفني محجوز مسبقاً (${hit.map((h) => h.name).join("، ")})`));
    }
    return { doc, errors };
  });

  registerDocHook("FSM Subcontract Assignment", (doc) => { const j = get("FSM Job", doc["job"]); return { doc: j ? { ...doc, site: j["site"], company: doc["company"] || j["company"] } : doc }; });

  registerDocHook("FSM Inspection Template", (doc, before) => {
    const errors: string[] = [];
    if (before && s(before["status"]) !== "Draft" && JSON.stringify(rows(before, "checks").map(strip)) !== JSON.stringify(rows(doc, "checks").map(strip)))
      errors.push(msg("An active or superseded template version is frozen; create a new version", "إصدار القالب النشط أو المستبدل مجمد؛ أنشئ إصداراً جديداً"));
    return { doc, errors };
  });

  registerDocHook("FSM Inspection Run", (doc, before) => {
    const errors: string[] = []; const job = get("FSM Job", doc["job"]);
    if (job) doc = { ...doc, site: job["site"], company: doc["company"] || job["company"] };
    const res = rows(doc, "results");
    doc = { ...doc, technical_result: technicalResult(res) };
    if (before) {
      if (before["template_version"] && s(before["template_version"]) !== s(doc["template_version"])) errors.push(msg("The template version of a run is frozen", "إصدار قالب التشغيل مجمد"));
      const locked = !["Draft", "In Progress"].includes(s(before["workflow_state"]));
      const plain = (r: Row[]) => JSON.stringify(r.map((x) => ({ ...strip(x), deficiency: undefined })));
      if (locked && plain(rows(before, "results")) !== plain(res)) errors.push(msg("Results are locked after submission", "النتائج مقفلة بعد التقديم"));
      if (changedTo(doc, before, "workflow_state", "Submitted for Review")) {
        const untested = res.filter((r) => (s(r["outcome"]) || "Untested") === "Untested").length;
        if (untested) errors.push(msg(`${untested} check(s) are still untested; record Pass, Fail, Inaccessible or Not Applicable`, `${untested} بند لم يُفحص بعد؛ سجّل ناجح أو راسب أو يتعذر الوصول أو لا ينطبق`));
        doc = { ...doc, submitted_on: nowIso() };
      }
      if (changedTo(doc, before, "workflow_state", "Reviewed")) doc = { ...doc, reviewed_on: nowIso(), reviewed_by: currentUser() };
      if (changedTo(doc, before, "workflow_state", "Reviewed") && doc["retest_for"]) {
        const rt = adapter.list("FSM Retest").find((x) => s(x["deficiency"]) === s(doc["retest_for"]) && ["Required", "Scheduled"].includes(s(x["status"])));
        const result = s(doc["technical_result"]);
        if (rt && (result === "Pass" || result === "Fail")) return { doc, errors, after: () => { adapter.update("FSM Retest", rt.name, { retest_run: doc.name, status: result === "Pass" ? "Passed" : "Failed" }); } };
      }
    }
    return { doc, errors };
  });

  registerDocHook("FSM Result Event", (doc, before) => ({ doc, errors: before ? [msg("Result events are append-only", "أحداث النتائج للإضافة فقط")] : [] }));
  registerDocHook("FSM Report Revision", (doc, before) => {
    if (!before) return { doc };
    const { status: _a, modified: _b, ...x } = doc; const { status: _c, modified: _d, ...y } = before;
    return { doc, errors: JSON.stringify(x) !== JSON.stringify(y) ? [msg("A published revision is immutable; publish a new revision", "الإصدار المنشور غير قابل للتعديل؛ انشر إصداراً جديداً")] : [] };
  });

  registerDocHook("FSM Deficiency", (doc, before) => {
    const errors: string[] = [];
    if (!before && !doc["opened_on"]) doc = { ...doc, opened_on: today() };
    if (before) {
      if (changedTo(doc, before, "workflow_state", "Verified Closed")) {
        const passed = adapter.list("FSM Retest").some((r) => s(r["deficiency"]) === doc.name && s(r["status"]) === "Passed");
        if (!passed) errors.push(msg("Closure needs a technically reviewed, passing retest; a repair, accepted quote or paid invoice alone never closes a finding", "الإغلاق يتطلب إعادة فحص ناجحة ومراجَعة فنياً؛ الإصلاح أو قبول العرض أو سداد الفاتورة وحده لا يغلق الملاحظة"));
        doc = { ...doc, closed_on: doc["closed_on"] || today() };
      }
      if (changedTo(doc, before, "workflow_state", "Open") && ["Verified Closed", "Rejected"].includes(s(before["workflow_state"])))
        doc = { ...doc, reopen_count: Number(before["reopen_count"] ?? 0) + 1, closed_on: "", quotation: "", repair_job: "", commercial_decision: "None" };
      if (changedTo(doc, before, "workflow_state", "Duplicate") && !doc["duplicate_of"]) errors.push(msg("Choose the finding this one duplicates", "اختر الملاحظة الأصلية المكررة"));
    }
    return { doc, errors };
  });

  registerDocHook("FSM Impairment", (doc) => {
    const errors: string[] = []; const sys = get("FSM Service System", doc["system"]);
    if (sys) doc = { ...doc, site: sys["site"], company: doc["company"] || sys["company"] };
    if (doc["restored_on"] && doc["started_on"] && s(doc["restored_on"]) < s(doc["started_on"])) errors.push(msg("Restoration cannot precede the start", "لا يمكن أن يسبق الإرجاع البداية"));
    return { doc, errors };
  });

  registerDocHook("FSM Retest", (doc) => { const d = get("FSM Deficiency", doc["deficiency"]); return { doc: d ? { ...doc, site: d["site"], company: doc["company"] || d["company"] } : doc }; });

  registerDocHook("FSM Charge Proposal", (doc) => {
    const errors = Number(doc["amount"] ?? 0) < 0 ? [msg("Amount cannot be negative", "لا يمكن أن يكون المبلغ سالباً")] : [];
    const j = get("FSM Job", doc["job"]);
    return { doc: j ? { ...doc, site: j["site"], company: doc["company"] || j["company"] } : doc, errors };
  });
}

/** Child row content without bookkeeping keys (for frozen-content comparisons). */
function strip(r: Row): Row { const { modified: _m, creation: _c, owner: _o, modified_by: _mb, ...x } = r; return x; }
