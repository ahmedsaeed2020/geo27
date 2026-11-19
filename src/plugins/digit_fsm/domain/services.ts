import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * DIGIT FSM + ITM services (kit 14 W01–W10). Every write is permission-checked through the shared scope boundary
 * (src/lib/scope.ts → session.ts role perms + Company / Service Site User Permissions), runs the registered controller
 * hooks (domain/hooks.ts) through the shared adapter, and is idempotent (generation keys, source keys, existing links).
 * Workflow moves go through src/lib/workflow.ts applyWorkflow, so the native Actions menu and these services share one
 * transition table and one set of invariants. Nothing here writes GL Entry, Stock Ledger Entry or Payment Ledger Entry;
 * the finance hand-off stays SERVER_REQUIRED and is recorded as an Integration Exception.
 */
import { adapter, DocValidationError, type Doc } from "@/lib/adapter";
import { applyWorkflow } from "@/lib/workflow";
import { assertScoped } from "@/lib/scope";
import { currentUser, type PType } from "@/lib/session";
import { ACTION_AR } from "../workflows";
import { jobBilling, equationText, LABOUR_ITEM, VAT_RATE, r2 } from "./billing";
import { addDays, conflicts, deficiencyKey, dueDates, eligibility, measurementFails, nowIso, obligationKey, s, technicalResult, today, runCoverage, type Row } from "./rules";

export interface Result { ok: boolean; name?: string; names?: string[]; doctype?: string; existing?: boolean; message: string; message_ar: string }
const ok = (message: string, message_ar: string, x: Partial<Result> = {}): Result => ({ ok: true, message, message_ar, ...x });
const fail = (message: string, message_ar: string): Result => ({ ok: false, message, message_ar });
const denied = (what: string, what_ar: string) => fail(`You do not have permission to ${what}`, `لا تملك صلاحية ${what_ar}`);

/** Permission through the shared scope boundary (fails closed for non-admin users when metadata is unknown). */
export function can(dt: string, ptype: PType = "write", d?: Doc | Record<string, unknown>): boolean {
  try { assertScoped(dt, ptype, d as Doc | undefined); return true; } catch { return false; }
}
const get = (dt: string, n: unknown) => (n ? adapter.get(dt, String(n)) : undefined);
const rows = (d: Doc | undefined, f: string) => ((d?.[f] as Row[] | undefined) ?? []);
export const setting = (k: string, dflt: unknown) => { const v = adapter.get("FSM Settings", "FSM Settings")?.[k]; return v === undefined || v === null || v === "" ? dflt : v; };
export function guarded(fn: () => Result): Result {
  try { return fn(); } catch (e) { if (e instanceof DocValidationError) return fail(e.errors.join("\n"), e.errors.map(arRule).join("\n")); throw e; }
}
/** Arabic text of controller refusals raised by domain/hooks.ts ("en ‖ ar"). */
export const arRule = (m: string) => (m.includes(" ‖ ") ? m.split(" ‖ ")[1]! : m);
export const enRule = (m: string) => (m.includes(" ‖ ") ? m.split(" ‖ ")[0]! : m);

/** Workflow action through the shared engine; refusals (role, hooks) come back as a failed Result. */
export function transition(dt: string, name: string, action: string, patch?: Record<string, unknown>): Result {
  const d = get(dt, name); if (!d) return fail(`${dt} ${name} not found`, `السجل ${name} غير موجود`);
  if (!can(dt, "read", d)) return denied("open this record", "فتح هذا السجل");
  return guarded(() => {
    if (patch) adapter.update(dt, name, patch);
    const errs = applyWorkflow(dt, name, action);
    if (errs.length) { return fail(errs.map(enRule).join("\n"), errs.map(arRule).join("\n")); }
    return ok(`${action}: done`, `${ACTION_AR[action] ?? action}: تم`, { name, doctype: dt });
  });
}

// ---------------------------------------------------------------- W02 agreement → obligations
/** Generate obligations for an Active agreement (idempotent by agreement|coverage row|due date) and log the run. */
export function generateObligations(agreement: string, horizonMonths = Number(setting("generation_horizon_months", 12)) || 12): Result {
  const a = get("FSM Service Agreement", agreement);
  if (!a) return fail("Agreement not found", "الاتفاقية غير موجودة");
  if (!can("FSM Obligation", "create", { site: a["site"], company: a["company"] })) return denied("create obligations", "إنشاء الالتزامات");
  const log = (outcome: string, created: number, skipped: number, message: string) =>
    adapter.insertDoc("FSM Generation Run", { agreement, horizon_months: horizonMonths, run_on: nowIso(), created_count: created, skipped_count: skipped, outcome, message, company: a["company"] });
  if (s(a["workflow_state"]) !== "Active") { log("Refused", 0, 0, "Agreement is not Active"); return fail("Only an Active agreement generates obligations", "الاتفاقية النشطة فقط تولّد الالتزامات"); }
  const existing = new Set(adapter.list("FSM Obligation").map((o) => s(o["idempotency_key"])));
  const made: string[] = []; let skipped = 0;
  adapter.batch(() => {
    const run = log("Success", 0, 0, "");
    rows(a, "coverage").forEach((c, i) => {
      const rowId = s(c["name"]) || `row-${i + 1}`;
      for (const due of dueDates(s(a["start_date"]), s(a["end_date"]), s(c["frequency"]), horizonMonths)) {
        const key = obligationKey(agreement, rowId, due);
        if (existing.has(key)) { skipped++; continue; }
        const d = adapter.insertDoc("FSM Obligation", { agreement, coverage_row: rowId, site: a["site"], system: c["system"], template: c["template"], service_type: c["service_type"] || "Inspection", due_date: due,
          window_end: addDays(due, Number(c["window_days"] ?? 14) || 14), status: "Due", idempotency_key: key, generation_run: run.name, company: a["company"] });
        existing.add(key); made.push(d.name);
      }
    });
    adapter.update("FSM Generation Run", run.name, { created_count: made.length, skipped_count: skipped, outcome: made.length ? "Success" : "No Change", message: `${made.length} created, ${skipped} already existed` });
  });
  return ok(`${made.length} obligation(s) generated, ${skipped} already existed`, `تم توليد ${made.length} التزام، و${skipped} موجود مسبقاً`, { names: made });
}

/** Waive an obligation with a reason (FSM Manager); the obligation stays visible with its waiver. */
export function waiveObligation(obligation: string, reason: string): Result {
  const o = get("FSM Obligation", obligation); if (!o) return fail("Obligation not found", "الالتزام غير موجود");
  if (!can("FSM Obligation", "delete", o)) return denied("waive obligations", "الإعفاء من الالتزامات");
  if (!reason.trim()) return fail("A waiver reason is required", "سبب الإعفاء مطلوب");
  if (["Fulfilled", "Waived"].includes(s(o["status"]))) return fail("Obligation is already closed", "الالتزام مغلق مسبقاً");
  return guarded(() => { adapter.update("FSM Obligation", obligation, { status: "Waived", waiver_reason: reason.trim() }); return ok("Obligation waived", "تم الإعفاء من الالتزام", { name: obligation, doctype: "FSM Obligation" }); });
}

// ---------------------------------------------------------------- W02/W06 job & visits (M:N fulfilment bridge)
/** One job fulfilling one or more obligations of one site (bridge rows). Obligations already on an open job are refused. */
export function createJobForObligations(obligations: string[]): Result {
  if (!obligations.length) return fail("Select at least one obligation", "اختر التزاماً واحداً على الأقل");
  const obs = obligations.map((n) => get("FSM Obligation", n)).filter(Boolean) as Doc[];
  const sites = new Set(obs.map((o) => s(o["site"])));
  if (sites.size !== 1) return fail("Obligations must belong to one site", "يجب أن تتبع الالتزامات موقعاً واحداً");
  const site = get("FSM Service Site", [...sites][0]);
  if (!can("FSM Job", "create", { site: site?.name, company: site?.["company"] })) return denied("create jobs", "إنشاء أوامر العمل");
  const busy = obs.filter((o) => s(o["status"]) !== "Due" && s(o["status"]) !== "Missed");
  if (busy.length) return fail(`Already scheduled or closed: ${busy.map((b) => b.name).join(", ")}`, `مجدولة أو مغلقة مسبقاً: ${busy.map((b) => b.name).join("، ")}`);
  return guarded(() => {
    let job!: Doc;
    adapter.batch(() => {
      job = adapter.insertDoc("FSM Job", { job_title: `PM — ${s(site?.["site_name"])} — ${s(obs[0]!["due_date"])}`, customer: site?.["customer"], site: site?.name, job_type: "PM Inspection", priority: "Normal", agreement: obs[0]!["agreement"], planned_days: 1,
        company: site?.["company"], workflow_state: "Draft", hold_reason: "None", obligations: obs.map((o, i) => ({ name: `${o.name}-b${i + 1}`, idx: i + 1, doctype: "FSM Job Obligation", parentfield: "obligations", obligation: o.name, system: o["system"], outcome: "Pending" })) });
      for (const o of obs) adapter.update("FSM Obligation", o.name, { status: "Scheduled" });
    });
    return ok(`Job ${job.name} created`, `تم إنشاء أمر العمل ${job.name}`, { name: job.name, doctype: "FSM Job" });
  });
}

/** Visit (truck roll) for a job; repeat and return visits are their own records (predecessor kept). */
export function createVisit(job: string, opts: { purpose?: string; predecessor?: string; returnReason?: string } = {}): Result {
  const j = get("FSM Job", job); if (!j) return fail("Job not found", "أمر العمل غير موجود");
  if (!can(VISIT_DT, "create", { site: j["site"], company: j["company"] })) return denied("create visits", "إنشاء الزيارات");
  if (["Closed", "Cancelled", "Completed"].includes(s(j["workflow_state"]))) return fail("Job is closed", "أمر العمل مغلق");
  return guarded(() => {
    const v = adapter.insertDoc(VISIT_DT, { job, site: j["site"], company: j["company"], workflow_state: "Unscheduled", access_outcome: "Not Recorded", block_reason: "None",
      visit_purpose: opts.purpose ?? (s(j["job_type"]) === "Emergency" ? "Emergency" : opts.predecessor ? "Return Visit" : "Planned"), predecessor_visit: opts.predecessor, return_reason: opts.returnReason });
    return ok(`Visit ${v.name} created (unscheduled)`, `تم إنشاء الزيارة ${v.name} (غير مجدولة)`, { name: v.name, doctype: VISIT_DT });
  });
}

/** Skill a visit requires: the system type of the job's bridged obligations, else its deficiency, else its service request (first one). */
export function requiredSkill(visit: Doc | undefined): string {
  const j = get("FSM Job", visit?.["job"]);
  const sys = rows(j, "obligations").map((b) => get("FSM Service System", b["system"])).find(Boolean) ?? get("FSM Service System", get("FSM Deficiency", j?.["deficiency"])?.["system"])
    ?? get("FSM Service System", get("Issue", j?.["issue"])?.["digit_fsm_system"]);
  return s(sys?.["system_type"]);
}
/** Conflicts of a technician interval with Reserved bookings and approved unavailability. */
export function bookingConflicts(technician: string, start: string, end: string, exceptBooking?: string): { bookings: Doc[]; unavailable: Doc[] } {
  const bookings = adapter.list("FSM Booking").filter((b) => s(b["technician"]) === technician && s(b["status"]) !== "Cancelled");
  const hit = conflicts({ start, end, name: exceptBooking }, bookings.map((b) => ({ start: s(b["booking_start"]), end: s(b["booking_end"]), name: b.name })));
  const unavailable = adapter.list("FSM Calendar Exception").filter((c) => s(c["technician"]) === technician && s(c["status"]) === "Approved" && ["Unavailable", "Leave", "Training"].includes(s(c["exception_type"])) && s(c["from_time"]) < end && start < s(c["to_time"]));
  return { bookings: bookings.filter((b) => hit.some((h) => h.name === b.name)), unavailable };
}

/** Reserve a technician for a visit: eligibility (skill + valid certificate), conflict check, booking + visit planned. */
export function bookVisit(visit: string, technician: string, start: string, end: string, role: "Lead" | "Assistant" = "Lead"): Result {
  const v = get(VISIT_DT, visit); if (!v) return fail("Visit not found", "الزيارة غير موجودة");
  if (!can("FSM Booking", "create", { site: v["site"], company: v["company"] })) return denied("book technicians", "حجز الفنيين");
  if (["Completed", "Cancelled"].includes(s(v["workflow_state"]))) return fail("The visit is closed", "الزيارة مغلقة");
  if (!start || !end || end <= start) return fail("End must be after start", "يجب أن تكون النهاية بعد البداية");
  const tech = get("FSM Technician", technician);
  const el = eligibility(tech, requiredSkill(v), start);
  if (!el.ok && (Number(setting("block_expired_certification", 1)) || !/expired/.test(el.reason ?? ""))) return fail(`Not eligible: ${el.reason}`, `غير مؤهل: ${el.reason_ar}`);
  const c = bookingConflicts(technician, start, end);
  if (c.bookings.length) return fail(`Conflict with ${c.bookings.map((b) => b.name).join(", ")}`, `تعارض مع ${c.bookings.map((b) => b.name).join("، ")}`);
  if (c.unavailable.length) return fail(`Technician unavailable (${c.unavailable.map((u) => s(u["exception_type"])).join(", ")})`, "الفني غير متاح في هذا الوقت");
  return guarded(() => {
    let b!: Doc;
    adapter.batch(() => {
      b = adapter.insertDoc("FSM Booking", { visit, technician, booking_start: start, booking_end: end, booking_role: role, status: "Reserved", site: v["site"], company: v["company"] });
      if (role === "Lead") {
        adapter.update(VISIT_DT, visit, { technician, scheduled_start: start, scheduled_end: end });
        if (s(v["workflow_state"]) === "Unscheduled") { const e = applyWorkflow(VISIT_DT, visit, "Plan"); if (e.length) throw new DocValidationError(e); }
      }
    });
    return ok(`Booking ${b.name} reserved`, `تم حجز ${b.name}`, { name: b.name, doctype: "FSM Booking" });
  });
}
/** Cancel a booking (the visit returns to the unscheduled queue when its lead booking is cancelled). */
export function cancelBooking(booking: string): Result {
  const b = get("FSM Booking", booking); if (!b) return fail("Booking not found", "الحجز غير موجود");
  if (!can("FSM Booking", "write", b)) return denied("change bookings", "تعديل الحجوزات");
  return guarded(() => {
    adapter.batch(() => {
      adapter.update("FSM Booking", booking, { status: "Cancelled" });
      const v = get(VISIT_DT, b["visit"]);
      if (v && s(b["booking_role"]) === "Lead" && s(v["workflow_state"]) === "Planned") adapter.update(VISIT_DT, v.name, { workflow_state: "Unscheduled", technician: "", scheduled_start: "", scheduled_end: "" });
    });
    return ok("Booking cancelled", "تم إلغاء الحجز", { name: booking, doctype: "FSM Booking" });
  });
}
/** Technician acknowledges the dispatched assignment (N37). */
export function acknowledgeVisit(visit: string): Result {
  const v = get(VISIT_DT, visit); if (!v) return fail("Visit not found", "الزيارة غير موجودة");
  if (!can(VISIT_DT, "write", v)) return denied("acknowledge visits", "الإقرار بالزيارات");
  if (s(v["workflow_state"]) !== "Dispatched") return fail("Only a dispatched visit can be acknowledged", "يمكن الإقرار بالزيارة المرسلة فقط");
  if (v["acknowledged_on"]) return ok("Already acknowledged", "تم الإقرار مسبقاً", { name: visit, existing: true });
  return guarded(() => { adapter.update(VISIT_DT, visit, { acknowledged_on: nowIso() }); return ok("Assignment acknowledged", "تم الإقرار بالتكليف", { name: visit, doctype: VISIT_DT }); });
}
/** Record the access outcome / block of a visit (inaccessible is recorded, never turned into not-applicable). */
export function recordAccess(visit: string, access: string, block = "None", note = ""): Result {
  const v = get(VISIT_DT, visit); if (!v) return fail("Visit not found", "الزيارة غير موجودة");
  if (!can(VISIT_DT, "write", v)) return denied("update visits", "تحديث الزيارات");
  return guarded(() => { adapter.update(VISIT_DT, visit, { access_outcome: access, block_reason: block, ...(note ? { handover_note: note } : {}) }); return ok("Visit outcome recorded", "تم تسجيل نتيجة الزيارة", { name: visit, doctype: VISIT_DT }); });
}

// ---------------------------------------------------------------- W03 ITM run
/** Active template version for a system type (highest active version). */
export function activeTemplate(systemType: string): Doc | undefined {
  return adapter.list("FSM Inspection Template").filter((t) => s(t["system_type"]) === systemType && s(t["status"]) === "Active").sort((a, b) => Number(b["version"]) - Number(a["version"]))[0];
}
/** Inspection run frozen from the template's CURRENT version: one row per system check, one per device × device check. */
export function createRun(job: string, system: string, visit?: string, retestFor?: string): Result {
  const j = get("FSM Job", job); const sys = get("FSM Service System", system);
  if (!j || !sys) return fail("Job or system not found", "أمر العمل أو النظام غير موجود");
  if (!can("FSM Inspection Run", "create", { site: j["site"], company: j["company"] })) return denied("create inspection runs", "إنشاء تشغيلات الفحص");
  const tpl = activeTemplate(s(sys["system_type"]));
  if (!tpl) return fail(`No active template for ${s(sys["system_type"])}`, `لا يوجد قالب نشط لنوع ${s(sys["system_type"])}`);
  const existing = adapter.list("FSM Inspection Run").find((r) => s(r["job"]) === job && s(r["system"]) === system && !["Reviewed", "Published"].includes(s(r["workflow_state"])) && s(r["retest_for"]) === s(retestFor));
  if (existing) return ok(`Run ${existing.name} already open`, `تشغيل الفحص ${existing.name} مفتوح مسبقاً`, { name: existing.name, doctype: "FSM Inspection Run", existing: true });
  const def = retestFor ? get("FSM Deficiency", retestFor) : undefined;
  const devices = adapter.list("FSM Device").filter((d) => s(d["system"]) === system && s(d["lifecycle"]) === "Active" && (!def?.["device"] || d.name === s(def["device"])));
  const results: Row[] = [];
  for (const c of rows(tpl, "checks")) {
    if (def && s(def["source_check"]) && s(c["check_code"]) !== s(def["source_check"])) continue;
    const targets = s(c["applies_to"]) === "Device" ? devices.map((d) => d.name) : [""];
    for (const dev of targets) results.push({ name: `${c["check_code"]}-${dev || "sys"}-${results.length + 1}`, idx: results.length + 1, doctype: "FSM Inspection Result", parentfield: "results", check_code: c["check_code"], check_text: c["check_text"], device: dev || undefined, outcome: "Untested", evidence_required: c["evidence_required"] ? 1 : 0 });
  }
  if (!results.length) return fail("The template has no checks for this system", "لا يحتوي القالب على بنود فحص لهذا النظام");
  return guarded(() => {
    const r = adapter.insertDoc("FSM Inspection Run", { job, visit, site: j["site"], system, template: tpl.name, template_version: Number(tpl["version"]) || 1, expected_devices: new Set(results.map((x) => s(x["device"])).filter(Boolean)).size,
      retest_for: retestFor, company: j["company"], workflow_state: "Draft", technical_result: "Pending", return_count: 0, results });
    return ok(`Run ${r.name} created with ${results.length} checks`, `تم إنشاء الفحص ${r.name} بعدد ${results.length} بند`, { name: r.name, doctype: "FSM Inspection Run" });
  });
}

/** Record one result row; measurement outside the template range forces Fail; every change appends a Result Event. */
export function recordResult(run: string, rowName: string, patch: { outcome?: string; measurement?: number | string; note?: string }): Result {
  const r = get("FSM Inspection Run", run); if (!r) return fail("Run not found", "الفحص غير موجود");
  if (!can("FSM Inspection Run", "write", r)) return denied("record results", "تسجيل النتائج");
  if (!["Draft", "In Progress"].includes(s(r["workflow_state"]))) return fail("Results are locked after submission", "النتائج مقفلة بعد التقديم");
  const tpl = get("FSM Inspection Template", r["template"]);
  let event: Row | undefined;
  const res = rows(r, "results").map((x): Row => {
    if (s(x["name"]) !== rowName) return x;
    const next = { ...x, ...patch };
    if (patch.measurement === "") delete next["measurement"];
    const chk = rows(tpl, "checks").find((c) => s(c["check_code"]) === s(x["check_code"]));
    if (chk && measurementFails(next["measurement"], chk["min_value"], chk["max_value"])) next["outcome"] = "Fail";
    if (s(next["outcome"]) !== s(x["outcome"]) || (patch.measurement !== undefined && s(patch.measurement) !== s(x["measurement"])))
      event = { run, result_row: rowName, check_code: x["check_code"], device: x["device"], previous_outcome: s(x["outcome"]) || "Untested", new_outcome: next["outcome"], measurement: next["measurement"], recorded_by: currentUser(), recorded_on: nowIso(), site: r["site"], company: r["company"] };
    return next;
  });
  if (!res.some((x) => s(x["name"]) === rowName)) return fail("Result row not found", "صف النتيجة غير موجود");
  return guarded(() => {
    adapter.batch(() => {
      adapter.update("FSM Inspection Run", run, { results: res, workflow_state: s(r["workflow_state"]) === "Draft" ? "In Progress" : r["workflow_state"] });
      if (event) adapter.insertDoc("FSM Result Event", event);
    });
    return ok("Result recorded", "تم تسجيل النتيجة", { name: run, doctype: "FSM Inspection Run" });
  });
}
/** Mark every still-Untested row of a device (or the whole run) with one outcome (e.g. Inaccessible for a locked room). */
export function bulkOutcome(run: string, outcome: string, device?: string, note?: string): Result {
  const r = get("FSM Inspection Run", run); if (!r) return fail("Run not found", "الفحص غير موجود");
  const targets = rows(r, "results").filter((x) => (s(x["outcome"]) || "Untested") === "Untested" && (!device || s(x["device"]) === device));
  for (const t of targets) { const x = recordResult(run, s(t["name"]), note ? { outcome, note } : { outcome }); if (!x.ok) return x; }
  return ok(`${targets.length} check(s) set to ${outcome}`, `تم تعيين ${targets.length} بند`, { name: run, doctype: "FSM Inspection Run" });
}

/**
 * F3-01 photo evidence of one result row: a native File attached to the run (`attached_to_field` = results, the row name in
 * `digit_fsm_result_row`); the browser passes a downscaled image as a data URL so the customer report can show it.
 */
export function attachResultPhoto(run: string, rowName: string, file: { name: string; url: string; size?: number }): Result {
  const r = get("FSM Inspection Run", run); if (!r) return fail("Run not found", "الفحص غير موجود");
  if (!can("FSM Inspection Run", "write", r)) return denied("attach evidence", "إرفاق الأدلة");
  if (!["Draft", "In Progress"].includes(s(r["workflow_state"]))) return fail("Results are locked after submission", "النتائج مقفلة بعد التقديم");
  if (!rows(r, "results").some((x) => s(x["name"]) === rowName)) return fail("Result row not found", "صف النتيجة غير موجود");
  return guarded(() => {
    const f = adapter.insertDoc("File", { file_name: file.name, file_url: file.url, file_size: file.size ?? 0, is_private: 1, attached_to_doctype: "FSM Inspection Run", attached_to_name: run, attached_to_field: "results", digit_fsm_result_row: rowName, owner: currentUser() });
    return ok("Photo attached", "تم إرفاق الصورة", { name: f.name, doctype: "File" });
  });
}
/** Photos of one result row (or of the whole run). */
export function resultPhotos(run: string, rowName?: string): Doc[] {
  return adapter.list("File").filter((f) => s(f["attached_to_doctype"]) === "FSM Inspection Run" && s(f["attached_to_name"]) === run && (!rowName || s(f["digit_fsm_result_row"]) === rowName));
}

/**
 * F3-02 reviewer decision on a submitted run. Approve = the workflow's «Approve Review»; reject and request changes both
 * return the run to the technician (the workflow has no rejected state), the decision and comment are kept as a Comment
 * on the run and dropped files become its attachments. A comment is required to reject or ask for changes.
 */
export function decideRun(run: string, decision: "approve" | "reject" | "changes", comment: string, files: { name: string; url: string; size?: number }[] = []): Result {
  const r = get("FSM Inspection Run", run); if (!r) return fail("Run not found", "الفحص غير موجود");
  if (s(r["workflow_state"]) !== "Submitted for Review") return fail("Only a submitted run can be decided", "لا يُقرَّر إلا تشغيل مقدّم للمراجعة");
  const note = comment.trim();
  if (decision !== "approve" && !note) return fail("A comment is required to reject or ask for changes", "التعليق مطلوب للرفض أو طلب التعديل");
  const res = decision === "approve" ? transition("FSM Inspection Run", run, "Approve Review") : returnRun(run, note);
  if (!res.ok) return res;
  const who = currentUser();
  adapter.batch(() => {
    if (note || decision !== "approve") adapter.insertDoc("Comment", { comment_type: "Comment", reference_doctype: "FSM Inspection Run", reference_name: run, comment_email: who, owner: who, digit_review_decision: decision,
      content: `${decision === "approve" ? "Review approved" : decision === "reject" ? "Review rejected" : "Changes requested"}${note ? `: ${note}` : ""}` });
    for (const f of files) adapter.insertDoc("File", { file_name: f.name, file_url: f.url, file_size: f.size ?? 0, is_private: 1, attached_to_doctype: "FSM Inspection Run", attached_to_name: run, digit_review_decision: decision, owner: who });
  });
  return ok(decision === "approve" ? "Review approved" : decision === "reject" ? "Run rejected and returned to the technician" : "Changes requested — returned to the technician",
    decision === "approve" ? "تم اعتماد المراجعة" : decision === "reject" ? "تم الرفض وإعادة التشغيل للفني" : "طُلب التعديل — أُعيد للفني", { name: run, doctype: "FSM Inspection Run" });
}

/** Return a submitted run to the technician with a reason (W07). */
export function returnRun(run: string, reason: string): Result {
  if (!reason.trim()) return fail("A return reason is required", "سبب الإعادة مطلوب");
  const r = get("FSM Inspection Run", run);
  return transition("FSM Inspection Run", run, "Return", { return_reason: reason.trim(), return_count: Number(r?.["return_count"] ?? 0) + 1 });
}

/** W04 — one stable deficiency per failed (run, check, device); repeated calls never duplicate. */
export function raiseDeficiencies(run: string): Result {
  const r = get("FSM Inspection Run", run); if (!r) return fail("Run not found", "الفحص غير موجود");
  if (!can("FSM Deficiency", "create", { site: r["site"], company: r["company"] })) return denied("record deficiencies", "تسجيل الملاحظات");
  if (r["retest_for"]) return fail("A retest run does not raise new findings; its result verifies the original finding", "تشغيل إعادة الفحص لا ينشئ ملاحظات جديدة؛ نتيجته تتحقق من الملاحظة الأصلية");
  const keys = new Map(adapter.list("FSM Deficiency").map((d) => [s(d["source_key"]), d.name]));
  const made: string[] = [];
  const sev = s(setting("default_severity", "Major")) || "Major";
  return guarded(() => {
    adapter.batch(() => {
      const res = rows(r, "results").map((x) => {
        if (s(x["outcome"]) !== "Fail") return x;
        const key = deficiencyKey(run, s(x["check_code"]), s(x["device"]));
        let def = keys.get(key);
        if (!def) {
          const dev = get("FSM Device", x["device"]);
          const d = adapter.insertDoc("FSM Deficiency", { title: `${s(x["check_text"])}${dev ? ` — ${s(dev["device_label"])}` : ""}`, site: r["site"], system: r["system"], device: x["device"], severity: sev, opened_on: today(),
            source_run: run, source_check: x["check_code"], workflow_state: "Open", commercial_decision: "None", source_key: key, reopen_count: 0, observation: s(x["note"]), company: r["company"] });
          def = d.name; keys.set(key, def); made.push(def);
        }
        return { ...x, deficiency: def };
      });
      adapter.update("FSM Inspection Run", run, { results: res });
    });
    return ok(`${made.length} deficiency(ies) recorded`, `تم تسجيل ${made.length} ملاحظة`, { names: made, doctype: "FSM Deficiency" });
  });
}

/** W07 — immutable published revision (counts + results snapshot); the previous current revision is superseded. */
export function publishRun(run: string): Result {
  const r = get("FSM Inspection Run", run); if (!r) return fail("Run not found", "الفحص غير موجود");
  if (Number(setting("require_review", 1)) && s(r["workflow_state"]) !== "Reviewed") return fail("Only a technically reviewed run can be published", "يُنشر الفحص المراجَع فنياً فقط");
  const t = transition("FSM Inspection Run", run, "Publish", { published_on: nowIso() });
  if (!t.ok) return t;
  const res = rows(r, "results");
  const c = runCoverage(res, Number(r["expected_devices"]) || undefined);
  const prev = adapter.list("FSM Report Revision").filter((x) => s(x["run"]) === run);
  let rev!: Doc;
  adapter.batch(() => {
    for (const p of prev) if (s(p["status"]) === "Current") adapter.update("FSM Report Revision", p.name, { status: "Superseded" });
    rev = adapter.insertDoc("FSM Report Revision", { run, revision: prev.length + 1, site: r["site"], system: r["system"], technical_result: technicalResult(res) === "Pending" ? "Incomplete" : technicalResult(res), published_on: nowIso(), published_by: currentUser(), status: "Current",
      expected: c.expected, passed: c.passChecks, failed: c.failChecks, inaccessible: res.filter((x) => s(x["outcome"]) === "Inaccessible").length, not_applicable: c.naChecks, untested: c.untestedChecks,
      snapshot: JSON.stringify(res.map((x) => ({ check: x["check_code"], device: x["device"] ?? null, outcome: x["outcome"], measurement: x["measurement"] ?? null }))), company: r["company"] });
  });
  return ok(`Published revision ${rev.name}`, `تم نشر الإصدار ${rev.name}`, { name: rev.name, doctype: "FSM Report Revision" });
}

// ---------------------------------------------------------------- W04 finding → quote → repair → retest
/** Native Quotation draft for one or more open findings of one site; each line carries the deficiency bridge. */
export function quoteDeficiencies(deficiencies: string[], rate = 0, item_code = ""): Result {
  const defs = deficiencies.map((n) => get("FSM Deficiency", n)).filter(Boolean) as Doc[];
  if (!defs.length) return fail("Select at least one finding", "اختر ملاحظة واحدة على الأقل");
  const already = defs.filter((d) => d["quotation"]);
  if (already.length === defs.length) return ok(`Already quoted on ${s(already[0]!["quotation"])}`, `مُسعّرة مسبقاً في ${s(already[0]!["quotation"])}`, { name: s(already[0]!["quotation"]), doctype: "Quotation", existing: true });
  const todo = defs.filter((d) => !d["quotation"]);
  if (todo.some((d) => s(d["workflow_state"]) !== "Open")) return fail("Only Open findings can be quoted", "تُسعّر الملاحظات المفتوحة فقط");
  if (new Set(todo.map((d) => s(d["site"]))).size !== 1) return fail("Findings must belong to one site", "يجب أن تتبع الملاحظات موقعاً واحداً");
  if (!todo.every((d) => can("FSM Deficiency", "write", d))) return denied("quote these findings", "تسعير هذه الملاحظات");
  const site = get("FSM Service Site", todo[0]!["site"]);
  if (!can("Quotation", "create", { company: site?.["company"] })) return denied("create quotations", "إنشاء عروض الأسعار");
  return guarded(() => {
    let q!: Doc;
    adapter.batch(() => {
      const items = todo.map((d, i) => ({ name: `${d.name}-qi`, idx: i + 1, doctype: "Quotation Item", parentfield: "items", item_code: item_code || undefined, item_name: s(d["title"]).slice(0, 140), description: s(d["title"]), qty: 1, rate, amount: rate, digit_fsm_deficiency: d.name }));
      const total = items.reduce((t, x) => t + x.amount, 0);
      q = adapter.insertDoc("Quotation", { quotation_to: "Customer", party_name: site?.["customer"], customer_name: site?.["customer"], company: site?.["company"], transaction_date: today(), valid_till: addDays(today(), 30), status: "Draft", docstatus: 0, order_type: "Maintenance", currency: "SAR",
        is_latest_revision: 1, items, total_qty: items.length, total, net_total: total, grand_total: total, rounded_total: total });
      for (const d of todo) adapter.update("FSM Deficiency", d.name, { quotation: q.name, workflow_state: "Quoted", commercial_decision: "Quoted" });
    });
    return ok(`Quotation ${q.name} drafted for ${todo.length} finding(s)`, `تم إنشاء مسودة عرض السعر ${q.name} لعدد ${todo.length} ملاحظة`, { name: q.name, doctype: "Quotation" });
  });
}
export const quoteDeficiency = (deficiency: string, item_code = "", rate = 0) => quoteDeficiencies([deficiency], rate, item_code);

/** New native quotation revision (revision_of): bridge lines move to the revision; findings are never multiplied. */
export function reviseQuotation(quotation: string, rate?: number): Result {
  const q = get("Quotation", quotation); if (!q) return fail("Quotation not found", "عرض السعر غير موجود");
  if (!can("Quotation", "create", { company: q["company"] })) return denied("revise quotations", "مراجعة عروض الأسعار");
  const latest = adapter.list("Quotation").find((x) => s(x["revision_of"]) === quotation);
  if (latest) return ok(`Already revised as ${latest.name}`, `تمت مراجعته مسبقاً في ${latest.name}`, { name: latest.name, doctype: "Quotation", existing: true });
  const defs = adapter.list("FSM Deficiency").filter((d) => s(d["quotation"]) === quotation);
  return guarded(() => {
    let nq!: Doc;
    adapter.batch(() => {
      const items = rows(q, "items").map((x, i) => { const r = rate ?? Number(x["rate"] ?? 0); return { ...x, name: `${s(x["name"])}-r`, idx: i + 1, rate: r, amount: r * (Number(x["qty"]) || 1) }; });
      const total = items.reduce((t, x) => t + Number(x["amount"] ?? 0), 0);
      const { name: _n, creation: _c, modified: _m, ...rest } = q;
      nq = adapter.insertDoc("Quotation", { ...rest, docstatus: 0, status: "Draft", transaction_date: today(), revision_of: quotation, is_latest_revision: 1, items, total, net_total: total, grand_total: total, rounded_total: total });
      adapter.update("Quotation", quotation, { is_latest_revision: 0 });
      for (const d of defs) adapter.update("FSM Deficiency", d.name, { quotation: nq.name });
    });
    return ok(`Revision ${nq.name} created`, `تم إنشاء المراجعة ${nq.name}`, { name: nq.name, doctype: "Quotation" });
  });
}

/** Customer decision per finding (partial approval = some accepted, some declined); acceptance never closes the finding. */
export function recordDecision(deficiency: string, decision: "Accepted" | "Declined"): Result {
  const d = get("FSM Deficiency", deficiency); if (!d) return fail("Deficiency not found", "الملاحظة غير موجودة");
  if (!can("FSM Deficiency", "write", d)) return denied("record decisions", "تسجيل القرارات");
  if (s(d["workflow_state"]) !== "Quoted") return fail("A decision needs a quoted finding", "يتطلب القرار ملاحظة مُسعّرة");
  return guarded(() => { adapter.update("FSM Deficiency", deficiency, { commercial_decision: decision, workflow_state: decision === "Accepted" ? "Approved for Repair" : "Quoted" }); return ok(`Decision recorded: ${decision}`, `تم تسجيل القرار: ${decision === "Accepted" ? "مقبول" : "مرفوض"}`, { name: deficiency, doctype: "FSM Deficiency" }); });
}

/** Repair job + retest requirement from an accepted finding (idempotent via repair_job). */
export function createRepair(deficiency: string): Result {
  const d = get("FSM Deficiency", deficiency); if (!d) return fail("Deficiency not found", "الملاحظة غير موجودة");
  if (!can("FSM Job", "create", { site: d["site"], company: d["company"] })) return denied("create jobs", "إنشاء أوامر العمل");
  if (d["repair_job"]) return ok(`Repair job ${s(d["repair_job"])} exists`, `أمر الإصلاح ${s(d["repair_job"])} موجود`, { name: s(d["repair_job"]), doctype: "FSM Job", existing: true });
  if (s(d["commercial_decision"]) !== "Accepted") return fail("Customer acceptance is required first", "يلزم قبول العميل أولاً");
  const site = get("FSM Service Site", d["site"]);
  return guarded(() => {
    let j!: Doc;
    adapter.batch(() => {
      j = adapter.insertDoc("FSM Job", { job_title: `Repair — ${s(d["title"])}`.slice(0, 140), customer: site?.["customer"], site: d["site"], job_type: "Repair", priority: s(d["severity"]) === "Critical" ? "Urgent" : "High", deficiency, quotation: d["quotation"], company: d["company"], workflow_state: "Draft", hold_reason: "None", planned_days: 1, scope: s(d["title"]), obligations: [] });
      adapter.insertDoc("FSM Retest", { deficiency, repair_job: j.name, status: "Required", due_date: addDays(today(), Number(setting("retest_due_days", 14)) || 14), site: d["site"], company: d["company"] });
      adapter.update("FSM Deficiency", deficiency, { repair_job: j.name, workflow_state: "Retest Pending" });
    });
    return ok(`Repair job ${j.name} and retest requirement created`, `تم إنشاء أمر الإصلاح ${j.name} ومتطلب إعادة الفحص`, { name: j.name, doctype: "FSM Job" });
  });
}

/** Retest run for a retest requirement (same system, failed check only, device scope of the finding). */
export function createRetestRun(retest: string): Result {
  const rt = get("FSM Retest", retest); if (!rt) return fail("Retest not found", "إعادة الفحص غير موجودة");
  const d = get("FSM Deficiency", rt["deficiency"]); if (!d?.["system"]) return fail("The finding has no system", "الملاحظة بلا نظام");
  if (!rt["repair_job"]) return fail("Repair job missing", "أمر الإصلاح غير موجود");
  const r = createRun(s(rt["repair_job"]), s(d["system"]), undefined, d.name);
  if (r.ok && !r.existing) adapter.update("FSM Retest", retest, { retest_run: r.name, status: "Scheduled" });
  return r;
}
/** Retest outcome only from a Reviewed/Published run's technical result. */
export function recordRetest(retest: string, run: string): Result {
  const rt = get("FSM Retest", retest); const r = get("FSM Inspection Run", run);
  if (!rt || !r) return fail("Retest or run not found", "إعادة الفحص أو التشغيل غير موجود");
  if (!can("FSM Retest", "write", rt)) return denied("record retests", "تسجيل إعادة الفحص");
  if (!["Reviewed", "Published"].includes(s(r["workflow_state"]))) return fail("The retest run must be technically reviewed", "يجب مراجعة تشغيل إعادة الفحص فنياً");
  const res = s(r["technical_result"]);
  if (res !== "Pass" && res !== "Fail") return fail("The retest run is incomplete", "تشغيل إعادة الفحص غير مكتمل");
  return guarded(() => { adapter.update("FSM Retest", retest, { retest_run: run, status: res === "Pass" ? "Passed" : "Failed" }); return ok(`Retest ${res === "Pass" ? "passed" : "failed"}`, res === "Pass" ? "نجحت إعادة الفحص" : "رسبت إعادة الفحص", { name: retest, doctype: "FSM Retest" }); });
}
/** Reviewer closure: only with a Passed retest (hook-enforced); a failed retest keeps the finding open. */
export const verifyClose = (deficiency: string) => transition("FSM Deficiency", deficiency, "Verify Close", { closed_on: today() });

/** Mark a finding as a duplicate of another one (kept, linked, excluded from open counts). */
export function markDuplicate(deficiency: string, of: string): Result {
  const d = get("FSM Deficiency", deficiency); const o = get("FSM Deficiency", of);
  if (!d || !o) return fail("Finding not found", "الملاحظة غير موجودة");
  if (deficiency === of) return fail("A finding cannot duplicate itself", "لا يمكن أن تكون الملاحظة مكررة من نفسها");
  if (!can("FSM Deficiency", "write", d)) return denied("update findings", "تحديث الملاحظات");
  if (!["Open", "Disputed"].includes(s(d["workflow_state"]))) return fail("Only an open finding can be marked duplicate", "تُعلَّم الملاحظة المفتوحة فقط كمكررة");
  return guarded(() => { adapter.update("FSM Deficiency", deficiency, { workflow_state: "Duplicate", duplicate_of: of }); return ok("Marked as duplicate", "تم التعليم كمكررة", { name: deficiency, doctype: "FSM Deficiency" }); });
}

/** System impairment interval (open/restore); the system operating status follows it. */
export function openImpairment(system: string, scope: string, deficiency?: string): Result {
  const sys = get("FSM Service System", system); if (!sys) return fail("System not found", "النظام غير موجود");
  if (!can("FSM Impairment", "create", { site: sys["site"], company: sys["company"] })) return denied("record impairments", "تسجيل التعطّلات");
  const active = adapter.list("FSM Impairment").find((i) => s(i["system"]) === system && s(i["status"]) === "Active");
  if (active) return ok(`Impairment ${active.name} already active`, `التعطّل ${active.name} قائم مسبقاً`, { name: active.name, doctype: "FSM Impairment", existing: true });
  return guarded(() => {
    let i!: Doc;
    adapter.batch(() => {
      i = adapter.insertDoc("FSM Impairment", { system, site: sys["site"], scope, started_on: nowIso(), status: "Active", deficiency, company: sys["company"] });
      adapter.update("FSM Service System", system, { operating_status: scope === "Full System" ? "Out of Service" : "Impaired" });
    });
    return ok(`Impairment ${i.name} opened`, `تم فتح التعطّل ${i.name}`, { name: i.name, doctype: "FSM Impairment" });
  });
}
export function restoreImpairment(impairment: string): Result {
  const i = get("FSM Impairment", impairment); if (!i) return fail("Impairment not found", "التعطّل غير موجود");
  if (!can("FSM Impairment", "write", i)) return denied("update impairments", "تحديث التعطّلات");
  if (s(i["status"]) === "Restored") return ok("Already restored", "عاد للخدمة مسبقاً", { name: impairment, existing: true });
  return guarded(() => {
    adapter.batch(() => {
      adapter.update("FSM Impairment", impairment, { status: "Restored", restored_on: nowIso() });
      const still = adapter.list("FSM Impairment").some((x) => x.name !== impairment && s(x["system"]) === s(i["system"]) && s(x["status"]) === "Active");
      if (!still) adapter.update("FSM Service System", s(i["system"]), { operating_status: "In Service" });
    });
    return ok("System restored to service", "عاد النظام للخدمة", { name: impairment, doctype: "FSM Impairment" });
  });
}

// ---------------------------------------------------------------- fulfilment & missed obligations
/** Fulfil job obligations only from reviewed run results per system (job completion alone never fulfils). */
export function fulfilFromJob(job: string): Result {
  const j = get("FSM Job", job); if (!j) return fail("Job not found", "أمر العمل غير موجود");
  if (!can("FSM Obligation", "write", { site: j["site"], company: j["company"] })) return denied("fulfil obligations", "تنفيذ الالتزامات");
  const runs = adapter.list("FSM Inspection Run").filter((r) => s(r["job"]) === job && ["Reviewed", "Published"].includes(s(r["workflow_state"])) && !r["retest_for"]);
  let n = 0;
  return guarded(() => {
    adapter.batch(() => {
      const bridge = rows(j, "obligations").map((b) => {
        const run = runs.find((r) => s(r["system"]) === s(b["system"]));
        if (!run) return b;
        const res = s(run["technical_result"]);
        // a failed inspection still fulfils the inspection obligation; the failure lives on the deficiency. Incomplete = partial.
        const outcome = res === "Incomplete" ? "Partial" : res === "Pending" ? "Pending" : "Fulfilled";
        const o = get("FSM Obligation", b["obligation"]);
        if (outcome === "Fulfilled" && o && s(o["status"]) !== "Fulfilled") { adapter.update("FSM Obligation", o.name, { status: "Fulfilled", fulfilled_by: job, fulfilled_on: s(run["reviewed_on"]).slice(0, 10) || today() }); n++; }
        return { ...b, outcome };
      });
      adapter.update("FSM Job", job, { obligations: bridge });
    });
    return ok(`${n} obligation(s) fulfilled`, `تم تنفيذ ${n} التزام`, { name: job, doctype: "FSM Job" });
  });
}
/** Mark Due/Scheduled obligations past their window as Missed (idempotent); the job bridge stays for catch-up. */
export function markMissed(asOf = today()): Result {
  if (!can("FSM Obligation", "write")) return denied("update obligations", "تحديث الالتزامات");
  const list = adapter.list("FSM Obligation").filter((o) => ["Due", "Scheduled"].includes(s(o["status"])) && (s(o["window_end"]) || s(o["due_date"])) < asOf && can("FSM Obligation", "write", o));
  adapter.batch(() => { for (const o of list) adapter.update("FSM Obligation", o.name, { status: "Missed" }); });
  return ok(`${list.length} obligation(s) marked missed`, `تم تعليم ${list.length} التزام كفائت`, { names: list.map((o) => o.name) });
}

// ---------------------------------------------------------------- W01 / W05 intake
/** Service request (native Issue) → service job (Corrective, or Emergency for urgent priority). Idempotent via Issue.digit_fsm_job. */
export function jobFromRequest(issue: string, emergency = false): Result {
  const i = get("Issue", issue); if (!i) return fail("Service request not found", "طلب الخدمة غير موجود");
  if (i["digit_fsm_job"]) return ok(`Job ${s(i["digit_fsm_job"])} exists`, `أمر العمل ${s(i["digit_fsm_job"])} موجود`, { name: s(i["digit_fsm_job"]), doctype: "FSM Job", existing: true });
  const site = get("FSM Service Site", i["digit_fsm_site"]);
  if (!site) return fail("Set the service site on the request first", "حدد موقع الخدمة في الطلب أولاً");
  if (!can("FSM Job", "create", { site: site.name, company: site["company"] })) return denied("create jobs", "إنشاء أوامر العمل");
  const urgent = emergency || /urgent|high/i.test(s(i["priority"]));
  return guarded(() => {
    let j!: Doc;
    adapter.batch(() => {
      j = adapter.insertDoc("FSM Job", { job_title: s(i["subject"]).slice(0, 140) || `Request ${issue}`, customer: site["customer"], site: site.name, job_type: urgent ? "Emergency" : "Corrective", priority: urgent ? "Urgent" : "Normal", issue, company: site["company"], workflow_state: "Draft", hold_reason: "None", planned_days: 1, scope: s(i["description"]).replace(/<[^>]+>/g, "").slice(0, 500), obligations: [] });
      adapter.update("Issue", issue, { digit_fsm_job: j.name });
    });
    return ok(`Job ${j.name} created from ${issue}`, `تم إنشاء أمر العمل ${j.name} من ${issue}`, { name: j.name, doctype: "FSM Job" });
  });
}
/** Emergency dispatch: job (from the request) + visit + lead booking now for the chosen eligible technician. */
export function emergencyDispatch(issue: string, technician: string, hours = 3): Result {
  const j = jobFromRequest(issue, true); if (!j.ok || !j.name) return j;
  const job = get("FSM Job", j.name)!;
  if (s(job["workflow_state"]) === "Draft") { const t = transition("FSM Job", job.name, "Schedule"); if (!t.ok) return t; }
  let visit = adapter.list(VISIT_DT).find((v) => s(v["job"]) === job.name && !["Completed", "Cancelled"].includes(s(v["workflow_state"])));
  if (!visit) { const v = createVisit(job.name, { purpose: "Emergency" }); if (!v.ok) return v; visit = get(VISIT_DT, v.name)!; }
  if (s(visit["workflow_state"]) === "Unscheduled") {
    const start = nowIso().slice(0, 16), end = new Date(Date.now() + hours * 3600000).toISOString().slice(0, 16).replace("T", " ");
    const b = bookVisit(visit.name, technician, start.replace("T", " "), end);
    if (!b.ok) return b;
  }
  if (s(get(VISIT_DT, visit.name)?.["workflow_state"]) === "Planned") { const t = transition(VISIT_DT, visit.name, "Dispatch"); if (!t.ok) return t; }
  return ok(`Emergency visit ${visit.name} dispatched`, `تم إرسال الزيارة الطارئة ${visit.name}`, { name: visit.name, doctype: VISIT_DT });
}

// ---------------------------------------------------------------- W09 materials (native documents only)
/** Native Material Request draft (Material Issue) linked to the job; stock moves stay native (no ledger write here). */
export function requestMaterials(job: string, items: { item_code: string; qty: number }[]): Result {
  const j = get("FSM Job", job); if (!j) return fail("Job not found", "أمر العمل غير موجود");
  const lines = items.filter((x) => x.item_code && x.qty > 0);
  if (!lines.length) return fail("Add at least one item with a quantity", "أضف صنفاً واحداً على الأقل بكمية");
  if (!can("Material Request", "create", { company: j["company"] })) return denied("create material requests", "إنشاء طلبات المواد");
  return guarded(() => {
    const mr = adapter.insertDoc("Material Request", { material_request_type: "Material Issue", title: `FSM ${job}`, company: j["company"], customer: j["customer"], transaction_date: today(), schedule_date: addDays(today(), 2), status: "Draft", docstatus: 0, digit_fsm_job: job,
      items: lines.map((l, i) => ({ name: `${job}-mr-${Date.now().toString(36)}-${i}`, idx: i + 1, doctype: "Material Request Item", parentfield: "items", item_code: l.item_code, item_name: s(get("Item", l.item_code)?.["item_name"]) || l.item_code, qty: l.qty, schedule_date: addDays(today(), 2), uom: s(get("Item", l.item_code)?.["stock_uom"]) || "Nos" })) });
    return ok(`Material Request ${mr.name} drafted`, `تم إنشاء مسودة طلب المواد ${mr.name}`, { name: mr.name, doctype: "Material Request" });
  });
}

// ---------------------------------------------------------------- W10 commercial control
/**
 * Charge proposal per completed job (idempotent). The amount is the billing equation (domain/billing.ts jobBilling):
 * approved labour + parts used + charges − covered by agreement, plus VAT 15 %. A job with no approved labour, parts or
 * charges falls back to its accepted quotation total (the earlier rule), so nothing that had a price loses it.
 */
export function proposeCharge(job: string): Result {
  const j = get("FSM Job", job); if (!j) return fail("Job not found", "أمر العمل غير موجود");
  if (!can("FSM Charge Proposal", "create", { site: j["site"], company: j["company"] })) return denied("propose charges", "اقتراح التحصيل");
  if (!["Completed", "Closed"].includes(s(j["workflow_state"]))) return fail("Only completed jobs can be charged", "تُحصّل أوامر العمل المكتملة فقط");
  const key = `charge|${job}`;
  const ex = adapter.list("FSM Charge Proposal").find((c) => s(c["idempotency_key"]) === key);
  if (ex) return ok(`Proposal ${ex.name} exists`, `المقترح ${ex.name} موجود مسبقاً`, { name: ex.name, doctype: "FSM Charge Proposal", existing: true });
  const b = jobBilling(job); const q = get("Quotation", j["quotation"]);
  const fromQuote = b.decision !== "Covered" && b.gross <= 0 && !!q;
  const amount = b.decision === "Covered" ? 0 : fromQuote ? Number(q?.["grand_total"] ?? 0) : b.gross;
  const basis = b.decision === "Covered" ? `Covered: ${b.coverBasis[0]}` : fromQuote ? `Quotation ${q!.name} (${s(q!["status"]) || "Draft"}) — no approved labour or parts yet` : `${b.decision}: ${equationText(b)[0]}`;
  return guarded(() => { const c = adapter.insertDoc("FSM Charge Proposal", { job, customer: j["customer"], site: j["site"], coverage_decision: b.decision, amount, basis, status: "Proposed", idempotency_key: key, company: j["company"] }); return ok(`Proposal ${c.name} created`, `تم إنشاء المقترح ${c.name}`, { name: c.name, doctype: "FSM Charge Proposal" }); });
}
export function approveCharge(proposal: string): Result {
  const c = get("FSM Charge Proposal", proposal); if (!c) return fail("Proposal not found", "المقترح غير موجود");
  if (!can("FSM Charge Proposal", "delete", c)) return denied("approve charges", "اعتماد التحصيل");
  if (s(c["status"]) !== "Proposed") return fail("Only a proposed charge can be approved", "يُعتمد المقترح بحالة مقترح فقط");
  if (s(c["coverage_decision"]) !== "Covered" && !(Number(c["amount"]) > 0)) return fail("A chargeable proposal needs an amount", "المقترح القابل للتحصيل يحتاج مبلغاً");
  return guarded(() => { adapter.update("FSM Charge Proposal", proposal, { status: "Approved" }); return ok("Charge approved", "تم اعتماد التحصيل", { name: proposal, doctype: "FSM Charge Proposal" }); });
}
/**
 * F4-05 finance hand-off: one native DRAFT Sales Invoice per charge, built from the billing equation lines that are not
 * covered (labour, parts used, call-out) with VAT 15 %. Idempotent — a second call returns the same invoice
 * («موجود مسبقاً»). Posting stays with finance in the native form (posting.ts on submit); nothing here writes a ledger.
 */
export function handOffCharge(proposal: string): Result {
  const c = get("FSM Charge Proposal", proposal); if (!c) return fail("Proposal not found", "المقترح غير موجود");
  if (!can("FSM Charge Proposal", "write", c)) return denied("hand off charges", "تسليم التحصيل");
  if (s(c["coverage_decision"]) === "Covered") return fail("Covered work is not invoiced", "العمل المغطى لا يُفوتر");
  const job = s(c["job"]);
  const si = get("Sales Invoice", c["sales_invoice"]) ?? adapter.list("Sales Invoice").find((i) => s(i["digit_fsm_job"]) === job && Number(i["docstatus"] ?? 0) !== 2);
  if (si) {
    if (s(c["status"]) !== "Handed Off" || s(c["sales_invoice"]) !== si.name) adapter.update("FSM Charge Proposal", proposal, { status: "Handed Off", sales_invoice: si.name, error: "" });
    return ok(`Sales Invoice ${si.name} already exists`, `فاتورة المبيعات ${si.name} موجودة مسبقاً`, { name: si.name, doctype: "Sales Invoice", existing: true });
  }
  if (!["Approved", "Error"].includes(s(c["status"]))) return fail("Approve the charge first", "اعتمد التحصيل أولاً");
  const j = get("FSM Job", job); const company = s(c["company"]) || s(j?.["company"]);
  if (!can("Sales Invoice", "create", { company })) return denied("create sales invoices", "إنشاء فواتير المبيعات");
  const b = jobBilling(job);
  if (b.blockers.length) return fail(`Not ready for invoicing: ${b.blockers.map((x) => x[0]).join(" · ")}`, `غير جاهز للفوترة: ${b.blockers.map((x) => x[1]).join(" · ")}`);
  const lines = b.lines.filter((l) => !l.covered && l.amount > 0);
  if (!lines.length || !(b.net > 0)) return fail("Nothing to invoice — the work is covered", "لا شيء للفوترة — العمل مغطى");
  const abbr = s(get("Company", company)?.["abbr"]);
  const cust = get("Customer", c["customer"] ?? j?.["customer"]);
  return guarded(() => {
    let name = "";
    adapter.batch(() => {
      const inv = adapter.insertDoc("Sales Invoice", {
        customer: s(cust?.name) || s(c["customer"]), customer_name: s(cust?.["customer_name"]), company, posting_date: today(), due_date: addDays(today(), 30), currency: "SAR", docstatus: 0, status: "Draft", digit_fsm_job: job,
        remarks: `DIGIT FSM ${job} · ${equationText(b)[0]}`,
        items: lines.map((l, i) => ({ idx: i + 1, doctype: "Sales Invoice Item", parentfield: "items", item_code: l.item_code || LABOUR_ITEM, item_name: l.item_name, description: l.item_name, qty: l.qty, uom: l.uom, rate: l.rate, amount: l.amount })),
        total: b.net, net_total: b.net, total_taxes_and_charges: b.vat, grand_total: b.gross, rounded_total: b.gross, outstanding_amount: b.gross,
        taxes: [{ idx: 1, doctype: "Sales Taxes and Charges", parentfield: "taxes", charge_type: "On Net Total", account_head: abbr ? `VAT 15% Output - ${abbr}` : "VAT 15% Output", description: "VAT 15%", rate: VAT_RATE * 100, tax_amount: b.vat, total: b.gross }],
      });
      name = inv.name;
      adapter.update("FSM Charge Proposal", proposal, { status: "Handed Off", sales_invoice: inv.name, error: "", ...(r2(Number(c["amount"] ?? 0)) !== b.gross ? { amount: b.gross, basis: `${b.decision}: ${equationText(b)[0]}` } : {}) });
      const open = adapter.list("FSM Integration Exception").find((e) => s(e["idempotency_key"]) === `handoff|${proposal}` && s(e["status"]) !== "Resolved");
      if (open) adapter.update("FSM Integration Exception", open.name, { status: "Resolved", resolution: `Draft Sales Invoice ${inv.name} created` });
    });
    const was = r2(Number(c["amount"] ?? 0)); const moved = was !== b.gross;
    return ok(`Draft Sales Invoice ${name} created${moved ? ` — proposal amount ${was} replaced by the equation total ${b.gross}` : ""}`, `تم إنشاء مسودة فاتورة المبيعات ${name}${moved ? ` — مبلغ المقترح ${was} استُبدل بإجمالي المعادلة ${b.gross}` : ""}`, { name, doctype: "Sales Invoice" });
  });
}

// ---------------------------------------------------------------- templates & governance
/** New Draft version of a template (checks copied); the active version stays in force until the new one is activated. */
export function newTemplateVersion(template: string): Result {
  const t = get("FSM Inspection Template", template); if (!t) return fail("Template not found", "القالب غير موجود");
  if (!can("FSM Inspection Template", "create")) return denied("version templates", "إصدار القوالب");
  const draft = adapter.list("FSM Inspection Template").find((x) => s(x["supersedes"]) === template && s(x["status"]) === "Draft");
  if (draft) return ok(`Draft ${draft.name} already exists`, `المسودة ${draft.name} موجودة مسبقاً`, { name: draft.name, doctype: "FSM Inspection Template", existing: true });
  return guarded(() => {
    const { name: _n, creation: _c, modified: _m, ...rest } = t;
    const d = adapter.insertDoc("FSM Inspection Template", { ...rest, version: Number(t["version"] ?? 1) + 1, status: "Draft", supersedes: template, published_on: "", checks: rows(t, "checks").map((c, i) => ({ ...c, name: `${s(c["name"])}-v${Number(t["version"] ?? 1) + 1}`, idx: i + 1 })) });
    return ok(`Version ${s(d["version"])} drafted (${d.name})`, `تم إنشاء مسودة الإصدار ${s(d["version"])} (${d.name})`, { name: d.name, doctype: "FSM Inspection Template" });
  });
}
/** Activate a Draft template version; the previously active version of the same system type is superseded. Existing runs keep their frozen version. */
export function activateTemplate(template: string): Result {
  const t = get("FSM Inspection Template", template); if (!t) return fail("Template not found", "القالب غير موجود");
  if (!can("FSM Inspection Template", "write", t)) return denied("publish templates", "نشر القوالب");
  if (s(t["status"]) !== "Draft") return fail("Only a Draft version can be activated", "تُفعَّل مسودة الإصدار فقط");
  if (!rows(t, "checks").length) return fail("A template needs at least one check", "يحتاج القالب بند فحص واحداً على الأقل");
  return guarded(() => {
    adapter.batch(() => {
      for (const x of adapter.list("FSM Inspection Template")) if (x.name !== template && s(x["system_type"]) === s(t["system_type"]) && s(x["status"]) === "Active") adapter.update("FSM Inspection Template", x.name, { status: "Superseded" });
      adapter.update("FSM Inspection Template", template, { status: "Active", published_on: nowIso() });
    });
    return ok(`Version ${s(t["version"])} is now active`, `الإصدار ${s(t["version"])} نشط الآن`, { name: template, doctype: "FSM Inspection Template" });
  });
}
/** Approve a proposed asset change: device location / lifecycle follow it (effective-dated record kept). */
export function approveAssetChange(change: string, approve = true): Result {
  const c = get("FSM Asset Change", change); if (!c) return fail("Change not found", "التغيير غير موجود");
  if (!can("FSM Asset Change", "write", c)) return denied("review asset changes", "مراجعة تغييرات الأصول");
  if (s(c["status"]) !== "Proposed") return fail("Already reviewed", "تمت مراجعته مسبقاً");
  return guarded(() => {
    adapter.batch(() => {
      adapter.update("FSM Asset Change", change, { status: approve ? "Approved" : "Rejected" });
      if (approve) {
        const t = s(c["change_type"]);
        if (t === "Moved" && c["new_location"]) adapter.update("FSM Device", s(c["device"]), { location: c["new_location"] });
        if (t === "Removed" || t === "Missing") adapter.update("FSM Device", s(c["device"]), { lifecycle: "Removed" });
      }
    });
    return ok(approve ? "Change approved" : "Change rejected", approve ? "تم اعتماد التغيير" : "تم رفض التغيير", { name: change, doctype: "FSM Asset Change" });
  });
}
/** Open (idempotently) a renewal case for an agreement. */
export function openRenewal(agreement: string): Result {
  const a = get("FSM Service Agreement", agreement); if (!a) return fail("Agreement not found", "الاتفاقية غير موجودة");
  if (!can("FSM Renewal Case", "create", { company: a["company"] })) return denied("open renewals", "فتح التجديدات");
  const ex = adapter.list("FSM Renewal Case").find((r) => s(r["agreement"]) === agreement && ["Open", "Proposed"].includes(s(r["status"])));
  if (ex) return ok(`Renewal ${ex.name} is open`, `التجديد ${ex.name} مفتوح`, { name: ex.name, doctype: "FSM Renewal Case", existing: true });
  return guarded(() => { const r = adapter.insertDoc("FSM Renewal Case", { agreement, customer: a["customer"], current_end: a["end_date"], proposed_end: addDays(s(a["end_date"]), 365), proposed_value: a["annual_value"], status: "Open", company: a["company"] }); return ok(`Renewal ${r.name} opened`, `تم فتح التجديد ${r.name}`, { name: r.name, doctype: "FSM Renewal Case" }); });
}
/** Resolve an integration exception with a note (the underlying server action is still required). */
export function resolveException(exc: string, resolution: string): Result {
  const e = get("FSM Integration Exception", exc); if (!e) return fail("Exception not found", "الاستثناء غير موجود");
  if (!can("FSM Integration Exception", "write", e)) return denied("resolve exceptions", "معالجة الاستثناءات");
  if (!resolution.trim()) return fail("A resolution note is required", "ملاحظة المعالجة مطلوبة");
  return guarded(() => { adapter.update("FSM Integration Exception", exc, { status: "Resolved", resolution: resolution.trim() }); return ok("Exception resolved", "تمت معالجة الاستثناء", { name: exc, doctype: "FSM Integration Exception" }); });
}

export { technicalResult };
