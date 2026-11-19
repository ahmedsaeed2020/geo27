import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * F4-01 technician journey writes (owner FSM round F4, 2026-11-18): check-in, time, parts used / returned, finding
 * severity, customer signature and submit. Native documents stay drafts (Timesheet, Stock Entry) for the office to approve
 * and post — nothing here writes GL Entry, Stock Ledger Entry or Payment Ledger Entry; visit / run moves go through the
 * shared workflow engine (services.transition), so the native Actions menu and the journey share one transition table.
 * Every write is permission-checked through services.can and idempotent per visit (one draft timesheet, one draft usage
 * entry and one draft return entry per visit; a repeated call updates the same draft).
 */
import { adapter, type Doc } from "@/lib/adapter";
import { nowIso, s, today, type Row } from "./rules";
import { can, guarded, raiseDeficiencies, transition, type Result } from "./services";
import { labourRate, vanStock } from "./billing";
import { visitFacts, visitIndex } from "./visits";

const ok = (message: string, message_ar: string, x: Partial<Result> = {}): Result => ({ ok: true, message, message_ar, ...x });
const fail = (message: string, message_ar: string): Result => ({ ok: false, message, message_ar });
const get = (dt: string, n: unknown) => (n ? adapter.get(dt, String(n)) : undefined);
const rows = (d: Doc | undefined, f: string) => ((d?.[f] as Row[] | undefined) ?? []);
const n0 = (v: unknown) => Number(v) || 0;
const leadOf = (v: Doc) => { const f = visitFacts(v, visitIndex()); return get("FSM Technician", f.lead?.technician ?? v["technician"]); };
const at = (iso: string, h: number) => { const t = new Date(`${iso.replace(" ", "T").slice(0, 19)}Z`); t.setUTCMinutes(t.getUTCMinutes() + Math.round(h * 60)); return t.toISOString().slice(0, 19).replace("T", " "); };

/** Check-in: a dispatched visit moves to On Site (the hook stamps arrived_on); access is recorded as Accessed. */
export function checkIn(visit: string): Result {
  const v = get(VISIT_DT, visit); if (!v) return fail("Visit not found", "الزيارة غير موجودة");
  const st = s(v["workflow_state"]);
  if (st === "On Site" || st === "Completed") return ok("Already checked in", "تم تسجيل الوصول مسبقاً", { name: visit, doctype: VISIT_DT, existing: true });
  if (st !== "Dispatched") return fail("Only a dispatched visit can be checked in — ask the dispatcher to send it", "يُسجَّل الوصول للزيارة المرسلة فقط — اطلب من المنسق إرسالها");
  if (!can(VISIT_DT, "write", v)) return fail("You do not have permission to update visits", "لا تملك صلاحية تحديث الزيارات");
  return guarded(() => {
    if (!v["acknowledged_on"]) adapter.update(VISIT_DT, visit, { acknowledged_on: nowIso() });
    const r = transition(VISIT_DT, visit, "Arrive"); if (!r.ok) return r;
    if (["", "Not Recorded"].includes(s(get(VISIT_DT, visit)?.["access_outcome"]))) adapter.update(VISIT_DT, visit, { access_outcome: "Accessed" });
    return ok("Checked in", "تم تسجيل الوصول", { name: visit, doctype: VISIT_DT });
  });
}

/** Draft Timesheet of the lead technician for the visit (one per visit; a second call updates its hours). */
export function logTime(visit: string, hours: number, note = ""): Result {
  const v = get(VISIT_DT, visit); if (!v) return fail("Visit not found", "الزيارة غير موجودة");
  const j = get("FSM Job", v["job"]); const t = leadOf(v);
  if (!t || !t["employee"]) return fail("The visit has no lead technician with an employee", "لا فني رئيسي بموظف على الزيارة");
  if (!(hours > 0) || hours > 16) return fail("Enter between 0.25 and 16 hours", "أدخل بين 0.25 و16 ساعة");
  const ts = adapter.list("Timesheet").find((x) => s(x["digit_fsm_visit"]) === visit && n0(x["docstatus"]) !== 2);
  if (ts && n0(ts["docstatus"]) === 1) return fail(`Timesheet ${ts.name} is already approved`, `سجل الوقت ${ts.name} معتمد بالفعل`);
  if (!can("Timesheet", ts ? "write" : "create", { company: j?.["company"] })) return fail("You do not have permission to record time", "لا تملك صلاحية تسجيل الوقت");
  const from = s(v["arrived_on"]) || s(v["scheduled_start"]) || `${today()} 08:00:00`; const h = Math.round(hours * 4) / 4;
  const billable = s(j?.["job_type"]) !== "PM Inspection"; const rate = labourRate();
  const log = { idx: 1, doctype: "Timesheet Detail", parentfield: "time_logs", activity_type: "Field Service", from_time: from.length === 16 ? `${from}:00` : from, to_time: at(from, h), hours: h, billable: billable ? 1 : 0, billing_hours: billable ? h : 0, billing_rate: rate, description: note };
  const data = { employee: t["employee"], employee_name: s(get("Employee", t["employee"])?.["employee_name"]) || s(t["technician_name"]), start_date: from.slice(0, 10), end_date: from.slice(0, 10), digit_fsm_job: s(v["job"]), digit_fsm_visit: visit, company: j?.["company"], status: "Draft", docstatus: 0,
    total_hours: h, total_billable_hours: billable ? h : 0, total_billable_amount: billable ? h * rate : 0, note, time_logs: [log] };
  return guarded(() => {
    if (ts) { adapter.update("Timesheet", ts.name, data); return ok(`Timesheet ${ts.name} updated — ${h} h`, `تم تحديث سجل الوقت ${ts.name} — ${h} ساعة`, { name: ts.name, doctype: "Timesheet", existing: true }); }
    const d = adapter.insertDoc("Timesheet", data); return ok(`Timesheet ${d.name} drafted — ${h} h, waiting for approval`, `تم إنشاء سجل الوقت ${d.name} — ${h} ساعة بانتظار الاعتماد`, { name: d.name, doctype: "Timesheet" });
  });
}

/** Parts used from the van (draft Material Issue, one per visit) or returned to stores (draft Material Transfer, one per visit). */
export function moveParts(visit: string, item: string, qty: number, mode: "use" | "return" = "use"): Result {
  const v = get(VISIT_DT, visit); if (!v) return fail("Visit not found", "الزيارة غير موجودة");
  const j = get("FSM Job", v["job"]); const t = leadOf(v); const van = s(t?.["van_warehouse"]);
  if (!van) return fail("The lead technician has no van warehouse", "لا مستودع سيارة للفني الرئيسي");
  if (!Number.isFinite(qty) || qty < 0) return fail("Enter a quantity of zero or more", "أدخل كمية صفر أو أكثر");
  const purpose = mode === "use" ? "Material Issue" : "Material Transfer";
  const draft = adapter.list("Stock Entry").find((x) => s(x["digit_fsm_visit"]) === visit && n0(x["docstatus"]) === 0 && s(x["purpose"]) === purpose);
  const lines = rows(draft, "items"); const cur = lines.find((l) => s(l["item_code"]) === item); const curQty = n0(cur?.["qty"]);
  const stock = vanStock(s(t?.name)).lines.find((l) => l.item === item); const free = (stock?.free ?? 0) + curQty;
  if (qty > free) return fail(`Only ${free} in the van`, `المتاح في السيارة ${free} فقط`);
  if (!can("Stock Entry", draft ? "write" : "create", { company: j?.["company"] })) return fail("You do not have permission to record parts", "لا تملك صلاحية تسجيل القطع");
  let stores = "";
  if (mode === "return") {
    const issue = adapter.list("Stock Entry").find((x) => s(x["digit_fsm_job"]) === s(v["job"]) && n0(x["docstatus"]) === 1 && s(x["purpose"]) === "Material Transfer" && rows(x, "items").some((l) => s(l["item_code"]) === item && s(l["t_warehouse"]) === van));
    stores = s(issue ? rows(issue, "items").find((l) => s(l["item_code"]) === item)?.["s_warehouse"] : "") || s(issue?.["from_warehouse"]);
    if (!stores) return fail("This part was not issued to the van for this job, so it cannot be returned here", "لم تُصرف هذه القطعة للسيارة لهذا الأمر، لذا لا يمكن إرجاعها هنا");
  }
  const it = get("Item", item); const avg = stock && stock.qty > 0 ? Math.round((stock.value / stock.qty) * 100) / 100 : 0; const rate = avg || n0(it?.["valuation_rate"]); // van moving average from the posted ledger
  const next = [...lines.filter((l) => s(l["item_code"]) !== item), ...(qty > 0 ? [{ ...(cur ?? {}), doctype: "Stock Entry Detail", parentfield: "items", item_code: item, item_name: s(it?.["item_name"]) || item, qty, transfer_qty: qty, uom: s(it?.["stock_uom"]) || "Nos", stock_uom: s(it?.["stock_uom"]) || "Nos", conversion_factor: 1, basic_rate: rate, valuation_rate: rate, basic_amount: rate * qty, amount: rate * qty, s_warehouse: van, ...(mode === "return" ? { t_warehouse: stores } : {}) }] : [])].map((l, i) => ({ ...l, idx: i + 1 }));
  return guarded(() => {
    if (draft) { adapter.update("Stock Entry", draft.name, { items: next }); return ok(qty > 0 ? `${draft.name}: ${item} × ${qty}` : `${item} removed from ${draft.name}`, qty > 0 ? `${draft.name}: ${s(it?.["item_name"]) || item} × ${qty}` : `أُزيل الصنف من ${draft.name}`, { name: draft.name, doctype: "Stock Entry", existing: true }); }
    if (!(qty > 0)) return ok("Nothing to record", "لا شيء للتسجيل");
    const d = adapter.insertDoc("Stock Entry", { stock_entry_type: purpose, purpose, posting_date: today(), posting_time: nowIso().slice(11), company: j?.["company"], from_warehouse: van, ...(mode === "return" ? { to_warehouse: stores } : {}), digit_fsm_job: s(v["job"]), digit_fsm_visit: visit, docstatus: 0,
      remarks: mode === "use" ? `Used on ${s(v["job"])} (visit ${visit})` : `Return of unused parts from ${s(v["job"])} (visit ${visit})`, items: next });
    return ok(`Draft ${mode === "use" ? "usage" : "return"} ${d.name} recorded — stores posts it`, `تم تسجيل مسودة ${mode === "use" ? "الاستهلاك" : "الإرجاع"} ${d.name} — يرحّلها المستودع`, { name: d.name, doctype: "Stock Entry" });
  });
}

/** Severity of the finding raised from a failed result row (the finding is raised first when it does not exist yet). */
export function setFindingSeverity(run: string, rowName: string, severity: "Critical" | "Major" | "Minor"): Result {
  const r = get("FSM Inspection Run", run); if (!r) return fail("Run not found", "الفحص غير موجود");
  const row = rows(r, "results").find((x) => s(x["name"]) === rowName); if (!row) return fail("Result row not found", "صف النتيجة غير موجود");
  if (s(row["outcome"]) !== "Fail") return fail("Only a failed check raises a finding", "البند الراسب فقط ينشئ ملاحظة");
  let def = s(row["deficiency"]);
  if (!def) { const x = raiseDeficiencies(run); if (!x.ok) return x; def = s(rows(get("FSM Inspection Run", run), "results").find((y) => s(y["name"]) === rowName)?.["deficiency"]); }
  const d = get("FSM Deficiency", def); if (!d) return fail("The finding could not be raised", "تعذر إنشاء الملاحظة");
  if (!can("FSM Deficiency", "write", d)) return fail("You do not have permission to update findings", "لا تملك صلاحية تحديث الملاحظات");
  if (s(d["severity"]) === severity) return ok(`Finding ${def} is already ${severity}`, `الملاحظة ${def} بنفس الخطورة مسبقاً`, { name: def, doctype: "FSM Deficiency", existing: true });
  return guarded(() => { adapter.update("FSM Deficiency", def, { severity }); return ok(`Finding ${def} set to ${severity}`, `تم تعيين خطورة الملاحظة ${def}`, { name: def, doctype: "FSM Deficiency" }); });
}

/** Customer sign-off on site: signer name + signature image (PNG data URL) stamped with the time. */
export function signVisit(visit: string, signer: string, dataUrl: string): Result {
  const v = get(VISIT_DT, visit); if (!v) return fail("Visit not found", "الزيارة غير موجودة");
  if (s(v["workflow_state"]) !== "On Site") return fail("Check in before the customer signs", "سجّل الوصول قبل توقيع العميل");
  if (!signer.trim()) return fail("Enter the name of the person signing", "أدخل اسم الموقّع");
  if (!/^data:image\//.test(dataUrl)) return fail("Draw the signature first", "ارسم التوقيع أولاً");
  if (!can(VISIT_DT, "write", v)) return fail("You do not have permission to update visits", "لا تملك صلاحية تحديث الزيارات");
  return guarded(() => { adapter.update(VISIT_DT, visit, { signed_by: signer.trim(), signed_on: nowIso(), customer_signature: dataUrl }); return ok(`Signed by ${signer.trim()}`, `تم التوقيع باسم ${signer.trim()}`, { name: visit, doctype: VISIT_DT }); });
}

/** What still stops the technician from submitting the visit (pure). */
export function submitBlockers(visit: string): [string, string][] {
  const v = get(VISIT_DT, visit); if (!v) return [["Visit not found", "الزيارة غير موجودة"]];
  const out: [string, string][] = [];
  if (s(v["workflow_state"]) !== "On Site") out.push(s(v["workflow_state"]) === "Completed" ? ["The visit is already submitted", "الزيارة مُرسلة مسبقاً"] : ["Check in first", "سجّل الوصول أولاً"]);
  const runs = adapter.list("FSM Inspection Run").filter((r) => s(r["visit"]) === visit && ["Draft", "In Progress"].includes(s(r["workflow_state"])));
  const untested = runs.reduce((a, r) => a + rows(r, "results").filter((x) => (s(x["outcome"]) || "Untested") === "Untested").length, 0);
  if (untested) out.push([`${untested} check(s) still untested`, `${untested} بند لم يُفحص بعد`]);
  const fails = runs.flatMap((r) => rows(r, "results").filter((x) => s(x["outcome"]) === "Fail" && !x["deficiency"]));
  if (fails.length) out.push([`${fails.length} failed check(s) without a finding severity`, `${fails.length} بند راسب بلا خطورة ملاحظة`]);
  if (!v["customer_signature"]) out.push(["Customer signature missing", "توقيع العميل ناقص"]);
  if (!adapter.list("Timesheet").some((x) => s(x["digit_fsm_visit"]) === visit && n0(x["docstatus"]) !== 2)) out.push(["Time not recorded", "الوقت غير مسجل"]);
  return out;
}
/** Submit: every open run of the visit goes to review, then the visit is finished (Completed). */
export function submitVisit(visit: string): Result {
  const block = submitBlockers(visit);
  if (block.length) return fail(`Not ready: ${block.map((b) => b[0]).join(" · ")}`, `غير جاهزة: ${block.map((b) => b[1]).join(" · ")}`);
  return guarded(() => {
    for (const r of adapter.list("FSM Inspection Run").filter((x) => s(x["visit"]) === visit && ["Draft", "In Progress"].includes(s(x["workflow_state"])))) {
      if (s(r["workflow_state"]) === "Draft") { const a = transition("FSM Inspection Run", r.name, "Start Run"); if (!a.ok) return a; }
      const b = transition("FSM Inspection Run", r.name, "Submit for Review"); if (!b.ok) return b;
    }
    const f = transition(VISIT_DT, visit, "Finish Visit"); if (!f.ok) return f;
    return ok("Visit submitted — runs sent for review", "تم إرسال الزيارة — أُرسلت الفحوص للمراجعة", { name: visit, doctype: VISIT_DT });
  });
}
