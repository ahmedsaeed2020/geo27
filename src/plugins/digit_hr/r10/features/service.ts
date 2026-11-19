/**
 * Round-2 HR service delivery: POR-01 help portal (native Help Article search; "Still need help" opens a case in the
 * article's category), CAS-02 case creation with employee check and a non-blocking duplicate warning that links the
 * earlier case, CAS-03 case lifecycle (pause with SLA extension, resume, reopen, employee acceptance, close refused
 * while tasks / child cases are open, 80% / breach alerts), CAS-05 confidential ER cases with a conflict-of-interest
 * check, LEV-06 long leave opened as a case. Statuses follow the case's own case_status field.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser, userRoles } from "@/lib/session";
import { scopedList, scopedGet } from "../../compat/scope";
import { policyValue } from "../../product/settings";
import { slaState } from "../../r9/logic";
import { fold } from "./platform";
import { createDoc, updateDoc, guarded, ok, fail, s, n, d10, todayISO, nowISO, addDays, daysBetween, type ActionResult } from "../write";

export const DSC = "DIGIT HR Service Case";
const list = (dt: string, user = currentUser()): Doc[] => { try { return scopedList(dt, user); } catch { return []; } };
const mins = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b.replace(" ", "T") + "Z") - Date.parse(a.replace(" ", "T") + "Z")) / 60000));
const plusMin = (t: string, m: number) => new Date(Date.parse(t.replace(" ", "T") + "Z") + m * 60000).toISOString().slice(0, 19).replace("T", " ");
const OPEN = ["Open", "Assigned", "In Progress", "On Hold"];

/* ------------------------------------------------------------------ POR-01 help portal */
const CAT_MAP: [RegExp, string][] = [[/leave|إجاز/i, "Leave Query"], [/salary|payroll|payslip|راتب|رواتب/i, "Payroll Query"], [/letter|certificate|خطاب|شهادة/i, "HR Letter"], [/document|iqama|passport|وثيق|إقامة/i, "Document Request"], [/access|password|it |دخول|كلمة المرور/i, "IT & Access"]];
export function categoryFor(text: string): string { return CAT_MAP.find(([re]) => re.test(text))?.[1] ?? "HR Letter"; }
/** Search published help articles (title, category and content, Arabic-aware); best matches first. */
export function searchHelp(q: string): { name: string; title: string; category: string; snippet: string; score: number }[] {
  const fq = fold(q); if (fq.length < 2) return [];
  const words = fq.split(" ").filter((w) => w.length > 1);
  return adapter.list("Help Article").filter((a) => Number(a["published"] ?? 1) === 1).map((a) => {
    const t = fold(s(a["title"])), c = fold(s(a["content"]).replace(/<[^>]+>/g, " ")), cat = fold(s(adapter.get("Help Category", s(a["category"]))?.["category_name"] || a["category"]));
    const score = words.reduce((x, w) => x + (t.includes(w) ? 10 : 0) + (cat.includes(w) ? 4 : 0) + (c.includes(w) ? 2 : 0), 0) + (t.includes(fq) ? 20 : 0);
    const plain = s(a["content"]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); const i = Math.max(0, fold(plain).indexOf(words[0] ?? ""));
    return { name: a.name, title: s(a["title"]), category: s(a["category"]), snippet: plain.slice(Math.max(0, i - 40), i + 120), score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
}
export function markHelpful(article: string, helpful: boolean): void { const a = adapter.get("Help Article", article); if (a) adapter.update("Help Article", article, helpful ? { helpful: n(a["helpful"]) + 1 } : { not_helpful: n(a["not_helpful"]) + 1 }); }

/* ------------------------------------------------------------------ CAS-02 create a case */
export function duplicatesOf(employee: string, category: string, on = todayISO()): Doc[] {
  const days = policyValue("case_duplicate_days", on) ?? 7;
  // unfiltered duplicate detection (AGENTS: separation handoffs pattern); callers only show what scopedGet returns
  return adapter.list(DSC).filter((c) => c["employee"] === employee && c["category"] === category && OPEN.includes(s(c["case_status"]) || "Open") && daysBetween(d10(c["opened_on"] || c["creation"]), on) <= days);
}
export interface CaseInput { employee: string; category: string; subject: string; description?: string; channel?: string; severity?: string; article?: string; is_confidential?: boolean }
/** Step 1 verify the employee (in scope, active), step 2 create; a duplicate is a warning with links, never a block. */
export function createCase(inp: CaseInput, user = currentUser(), now = nowISO()): ActionResult & { duplicates?: string[] } {
  return guarded(() => {
    const e = scopedGet("Employee", inp.employee, user); if (!e) return fail("Employee not found or not in your scope.", "الموظف غير موجود أو خارج صلاحيتك.");
    if (s(e["status"]) === "Left") return fail("The employee has left; open the case on the separation instead.", "غادر الموظف؛ افتح الحالة على إنهاء الخدمة.");
    const dups = duplicatesOf(inp.employee, inp.category, now.slice(0, 10)).filter((d) => scopedGet(DSC, d.name, user)).map((d) => d.name);
    const d = createDoc(DSC, { subject: inp.subject, employee: inp.employee, employee_name: e["employee_name"], company: e["company"], category: inp.category, severity: inp.severity ?? "Medium", case_status: "Open", opened_on: now, description: [inp.description ?? "", inp.article ? `From help article: ${inp.article}` : ""].filter(Boolean).join("\n"), channel: inp.channel ?? "Portal", is_confidential: inp.is_confidential || inp.category === "Confidential" ? 1 : 0 }, user);
    const r = ok(dups.length ? `Case ${d.name} opened. A similar open case exists: ${dups.join(", ")}.` : `Case ${d.name} opened.`, dups.length ? `فُتحت الحالة ${d.name}. توجد حالة مشابهة مفتوحة: ${dups.join("، ")}.` : `فُتحت الحالة ${d.name}.`, { created: [[DSC, d.name]] });
    return { ...r, duplicates: dups };
  });
}

/* ------------------------------------------------------------------ CAS-03 lifecycle */
export function pauseCase(name: string, reason: string, user = currentUser(), now = nowISO()): ActionResult {
  return guarded(() => {
    const c = scopedGet(DSC, name, user); if (!c) return fail("Case not found.", "الحالة غير موجودة.");
    if (s(c["sla_paused_at"])) return fail("The case is already on hold.", "الحالة معلّقة مسبقًا.");
    if (!OPEN.includes(s(c["case_status"]) || "Open")) return fail("Only an open case can be put on hold.", "تُعلَّق الحالات المفتوحة فقط.");
    updateDoc(DSC, name, { sla_paused_at: now, case_status: "On Hold", resolution_notes: [s(c["resolution_notes"]), `On hold: ${reason}`].filter(Boolean).join("\n") }, user);
    return ok("Case on hold; the deadline is paused.", "عُلّقت الحالة وتوقفت المهلة.");
  });
}
/** Resume: the due time moves by exactly the time spent on hold (a 2-hour hold extends the deadline by 2 hours). */
export function resumeCase(name: string, user = currentUser(), now = nowISO()): ActionResult {
  return guarded(() => {
    const c = scopedGet(DSC, name, user); if (!c) return fail("Case not found.", "الحالة غير موجودة.");
    const at = s(c["sla_paused_at"]); if (!at) return fail("The case is not on hold.", "الحالة ليست معلّقة.");
    const held = mins(at, now);
    updateDoc(DSC, name, { sla_paused_at: "", paused_minutes: n(c["paused_minutes"]) + held, due_at: s(c["due_at"]) ? plusMin(s(c["due_at"]).slice(0, 19).replace("T", " "), held) : "", case_status: s(c["assigned_to"]) ? "In Progress" : "Open" }, user);
    return ok(`Resumed; deadline moved by ${held} minutes.`, `استُؤنفت؛ مُددت المهلة ${held} دقيقة.`, { data: { held } });
  });
}
export function openChildren(name: string): Doc[] {
  return [...adapter.list("Task").filter((t) => t["reference_type"] === DSC && t["reference_name"] === name && !["Completed", "Cancelled", "Closed"].includes(s(t["status"]))),
    ...adapter.list(DSC).filter((x) => x["parent_case"] === name && OPEN.includes(s(x["case_status"]) || "Open"))];
}
export function closeCase(name: string, notes: string, user = currentUser()): ActionResult {
  return guarded(() => {
    const c = scopedGet(DSC, name, user); if (!c) return fail("Case not found.", "الحالة غير موجودة.");
    const kids = openChildren(name);
    if (kids.length) return fail(`Close the open tasks or sub-cases first: ${kids.map((k) => k.name).join(", ")}.`, `أغلق المهام أو الحالات الفرعية المفتوحة أولًا: ${kids.map((k) => k.name).join("، ")}.`);
    updateDoc(DSC, name, { case_status: "Resolved", sla_paused_at: "", resolution_notes: [s(c["resolution_notes"]), notes].filter(Boolean).join("\n") }, user);
    return ok("Case resolved; waiting for the employee to accept.", "حُلّت الحالة بانتظار قبول الموظف.");
  });
}
export function acceptResolution(name: string, accepted: boolean, user = currentUser()): ActionResult {
  return guarded(() => {
    const c = adapter.get(DSC, name); if (!c) return fail("Case not found.", "الحالة غير موجودة.");
    const me = adapter.list("Employee").find((e) => e["user_id"] === user);
    if (user !== "Administrator" && me?.name !== c["employee"]) return fail("Only the employee who raised the case can accept it.", "قبول الحل لصاحب الحالة فقط.");
    if (s(c["case_status"]) !== "Resolved") return fail("The case is not resolved yet.", "الحالة لم تُحل بعد.");
    adapter.update(DSC, name, accepted ? { employee_accepted: 1, case_status: "Closed" } : { employee_accepted: 0, case_status: "In Progress", reopened_count: n(c["reopened_count"]) + 1 });
    return ok(accepted ? "Thank you — the case is closed." : "The case was reopened for the team.", accepted ? "شكرًا — أُغلقت الحالة." : "أُعيد فتح الحالة للفريق.");
  });
}
export function reopenCase(name: string, reason: string, user = currentUser()): ActionResult {
  return guarded(() => {
    const c = scopedGet(DSC, name, user); if (!c) return fail("Case not found.", "الحالة غير موجودة.");
    if (!["Resolved", "Closed"].includes(s(c["case_status"]))) return fail("Only a resolved or closed case can be reopened.", "يُعاد فتح الحالات المحلولة أو المغلقة فقط.");
    updateDoc(DSC, name, { case_status: "In Progress", employee_accepted: 0, reopened_count: n(c["reopened_count"]) + 1, resolution_notes: [s(c["resolution_notes"]), `Reopened: ${reason}`].filter(Boolean).join("\n") }, user);
    return ok("Case reopened.", "أُعيد فتح الحالة.");
  });
}
export function addSubCase(parent: string, subject: string, user = currentUser()): ActionResult {
  return guarded(() => {
    const c = scopedGet(DSC, parent, user); if (!c) return fail("Case not found.", "الحالة غير موجودة.");
    const d = createDoc(DSC, { subject, employee: c["employee"], employee_name: c["employee_name"], company: c["company"], category: c["category"], case_status: "Open", opened_on: nowISO(), parent_case: parent, is_confidential: c["is_confidential"] ?? 0, due_at: c["due_at"] ?? "" }, user);
    return ok(`Sub-case ${d.name} added.`, `أُضيفت الحالة الفرعية ${d.name}.`, { created: [[DSC, d.name]] });
  });
}
/** Alerts for open cases: at or above the alert share of their time (default 80%) or past due; held cases are skipped. */
export function slaAlerts(now = new Date(), user = currentUser()): { name: string; subject: string; state: string; ratio: number }[] {
  const pct = (policyValue("case_sla_alert_pct", now.toISOString().slice(0, 10)) ?? 80) / 100;
  return list(DSC, user).filter((c) => OPEN.includes(s(c["case_status"]) || "Open") && !s(c["sla_paused_at"]) && s(c["due_at"])).map((c) => { const st = slaState(c, now); return { name: c.name, subject: s(c["subject"]), state: st.state === "breached" ? "Breached" : (st.elapsed_ratio ?? 0) >= pct ? "At risk" : "", ratio: st.elapsed_ratio ?? 1 }; }).filter((x) => x.state).sort((a, b) => b.ratio - a.ratio);
}

/* ------------------------------------------------------------------ CAS-05 confidential ER conflict check */
/** A specialist may not handle a confidential case about themselves, their line manager or someone they manage. */
export function conflictOf(caseDoc: Doc, specialist: string): string {
  const emp = adapter.get("Employee", s(caseDoc["employee"])); const me = adapter.list("Employee").find((e) => e["user_id"] === specialist);
  if (!emp || !me) return "";
  if (me.name === emp.name) return "The specialist is the employee in the case";
  if (s(emp["reports_to"]) === me.name) return "The specialist is the employee's line manager";
  if (s(me["reports_to"]) === emp.name) return "The employee is the specialist's line manager";
  return "";
}
export function assignConfidential(name: string, specialist: string, user = currentUser()): ActionResult {
  return guarded(() => {
    const c = scopedGet(DSC, name, user) ?? scopedGet("DIGIT Confidential Grievance", name, user);
    if (!c) return fail("Case not found or not permitted.", "الحالة غير موجودة أو غير مسموحة.");
    if (!userRoles(specialist).some((r) => ["Employee Relations Specialist", "HR Manager", "CHRO"].includes(r))) return fail("Confidential cases go to an employee-relations specialist.", "الحالات السرية تُسند لأخصائي علاقات الموظفين.");
    const why = conflictOf(c, specialist); if (why) return fail(`Conflict of interest: ${why}.`, "تعارض مصالح: لا يجوز إسناد الحالة لهذا الأخصائي.");
    const dt = c.doctype === "DIGIT Confidential Grievance" || adapter.get("DIGIT Confidential Grievance", name) ? "DIGIT Confidential Grievance" : DSC;
    updateDoc(dt, name, dt === DSC ? { assigned_to: specialist, case_status: "Assigned" } : { assigned_specialist: specialist, conflict_checked: 1, status: "Under Investigation" }, user);
    return ok("Assigned after the conflict check.", "أُسندت بعد فحص التعارض.");
  });
}

/* ------------------------------------------------------------------ LEV-06 long leave as a case */
/** A leave longer than long_leave_days (default 30) gets one "Long Leave" case for the return-to-work follow-up. */
export function longLeaveCase(leave: Doc): Doc | undefined {
  const days = n(leave["total_leave_days"]) || (d10(leave["from_date"]) && d10(leave["to_date"]) ? daysBetween(d10(leave["from_date"]), d10(leave["to_date"])) + 1 : 0);
  const lim = policyValue("long_leave_days", d10(leave["from_date"]) || todayISO(), s(leave["company"])) ?? 30;
  if (days <= lim || !s(leave["employee"])) return undefined;
  const prior = adapter.list(DSC).find((c) => c["category"] === "Long Leave" && s(c["description"]).includes(leave.name));
  if (prior) return prior;
  const d = adapter.insertDoc(DSC, { subject: `Long leave follow-up: ${s(leave["employee_name"])} (${days} days)`, employee: leave["employee"], employee_name: leave["employee_name"], company: leave["company"], category: "Long Leave", severity: "Medium", case_status: "Open", opened_on: nowISO(), due_at: `${addDays(d10(leave["to_date"]) || todayISO(), 1)} 17:00:00`, description: `Leave Application ${leave.name}: ${s(leave["leave_type"])} ${d10(leave["from_date"])} → ${d10(leave["to_date"])}. Plan cover, keep in touch, return-to-work check.` });
  adapter.update("Leave Application", leave.name, { digit_case: d.name });
  return d;
}
