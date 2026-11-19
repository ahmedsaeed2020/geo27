/**
 * DIGIT shared Core close controls (Part B: F14-b allocation rules, F15-b ZATCA reconciliation, F12-b period closing
 * voucher correction).
 *  - Allocation rules (Core "Digit Allocation Rule": source account + cost centre, target cost centres by %): the period's
 *    balance on the source is moved to the targets by one native Journal Entry; a period is allocated once per rule.
 *  - ZATCA reconciliation: the period's submitted sales invoices against the latest e-invoicing hand-over of each, with
 *    the VAT the return declares versus the VAT ZATCA has accepted, and the invoices still to clear.
 *  - PCV correction: a submitted Period Closing Voucher whose booked result no longer equals the period's income and
 *    expense (entries posted into the period after it closed) is flagged; correcting cancels it, prepares the amended
 *    voucher and opens a Correction Task — only through documentApi/posting.ts, so the ledger has one posting path.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { currentUser, hasPerm, userRoles } from "@/lib/session";
import { amendDocument, cancelDocument } from "@/lib/documentApi";
import { pclBalances } from "@/lib/posting";
import { CORE_DT } from "./doctypes";
import { closeStage, newVoucher } from "./finance";
import { closeTasks, type CloseTask } from "./controls";
import { latestStatus, type LogStatus } from "./providers";

export type Bi = [string, string];
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc | undefined, f: string) => (Array.isArray(d?.[f]) ? (d![f] as Doc[]) : []);
const can = (dt: string, p: "read" | "write" | "create" | "submit" | "cancel", user = currentUser(), d?: Doc) => { const m = cachedMeta(dt); return m ? hasPerm(m, p, d, user) : user === "Administrator"; };

/* ------------------------------------------------------------------ allocation rules (F14-b) ------------------------------------------------------------------ */
export interface AllocationPlan { rule: string; company: string; account: string; sourceCostCenter: string; from: string; to: string; balance: number; lines: { cost_center: string; percentage: number; amount: number }[]; errors: Bi[]; posted: string }
const tag = (rule: string, from: string, to: string) => `Allocation ${rule} ${from}..${to}`;

export function allocationPlan(ruleName: string, from: string, to: string): AllocationPlan {
  const r = adapter.get(CORE_DT.allocationRule, ruleName); const errors: Bi[] = [];
  const company = s(r?.["company"]); const account = s(r?.["source_account"]); const src = s(r?.["source_cost_center"]);
  if (!r) errors.push(["Allocation rule not found.", "قاعدة التوزيع غير موجودة."]);
  else if (!n(r["enabled"] ?? 1)) errors.push(["This rule is disabled.", "هذه القاعدة معطلة."]);
  const targets = rows(r, "lines").filter((l) => s(l["cost_center"]));
  const pct = r2(targets.reduce((t, l) => t + n(l["percentage"]), 0));
  if (r && Math.abs(pct - 100) > 0.005) errors.push([`Target percentages add up to ${pct}%, not 100%.`, `مجموع نسب التوزيع ${pct}% وليس 100%.`]);
  for (const l of targets) { const cc = adapter.get("Cost Center", s(l["cost_center"])); if (!cc || n(cc["is_group"]) || (company && s(cc["company"]) && cc["company"] !== company)) errors.push([`Cost centre ${s(l["cost_center"])} is not a ledger cost centre of ${company}.`, `مركز التكلفة ${s(l["cost_center"])} ليس مركزًا فرعيًا للشركة ${company}.`]); }
  if (targets.some((l) => l["cost_center"] === src)) errors.push(["The source cost centre cannot also be a target.", "لا يكون مركز المصدر هدفًا أيضًا."]);
  if (!from || !to || from > to) errors.push(["Choose a valid period.", "اختر فترة صحيحة."]);
  let balance = 0;
  for (const g of adapter.list("GL Entry")) {
    if (n(g["is_cancelled"]) || g["company"] !== company || g["account"] !== account) continue;
    const pd = s(g["posting_date"]); if (pd < from || pd > to) continue;
    if (src && g["cost_center"] !== src) continue;
    if (s(g["voucher_type"]) === "Journal Entry" && s(adapter.get("Journal Entry", s(g["voucher_no"]))?.["user_remark"]).startsWith(`Allocation ${ruleName} `)) continue; // earlier allocations are not re-allocated
    balance += n(g["debit"]) - n(g["credit"]);
  }
  balance = r2(balance);
  const posted = adapter.list("Journal Entry").find((j) => n(j.docstatus) !== 2 && s(j["user_remark"]) === tag(ruleName, from, to))?.name ?? "";
  if (posted) errors.push([`This period is already allocated by ${posted}.`, `وُزعت هذه الفترة بالقيد ${posted}.`]);
  if (!errors.length && Math.abs(balance) < 0.005) errors.push(["Nothing to allocate: the source has no balance in this period.", "لا شيء للتوزيع: لا رصيد للمصدر في هذه الفترة."]);
  let left = balance;
  const lines = targets.map((l, i) => { const amt = i === targets.length - 1 ? r2(left) : r2(balance * n(l["percentage"]) / 100); left = r2(left - amt); return { cost_center: s(l["cost_center"]), percentage: n(l["percentage"]), amount: amt }; });
  return { rule: ruleName, company, account, sourceCostCenter: src, from, to, balance, lines, errors, posted };
}

/** Books the plan as one Journal Entry (credit the source, debit each target on the same account), submitted or as a draft. */
export function postAllocation(ruleName: string, from: string, to: string, submit: boolean, user = currentUser()): { ok: true; name: string } | { ok: false; reason: Bi } {
  const p = allocationPlan(ruleName, from, to); if (p.errors.length) return { ok: false, reason: p.errors[0]! };
  if (!can("Journal Entry", submit ? "submit" : "create", user)) return { ok: false, reason: ["You may not create journal entries.", "لا يحق لك إنشاء القيود."] };
  const dr = p.balance > 0; const line = (cc: string, amt: number, debit: boolean, idx: number) => { const a = Math.abs(amt); const d = debit ? a : 0, c = debit ? 0 : a; return { idx, account: p.account, cost_center: cc, debit: d, credit: c, debit_in_account_currency: d, credit_in_account_currency: c }; };
  const accounts = [line(p.sourceCostCenter || s(adapter.get("Company", p.company)?.["cost_center"]), p.balance, !dr, 1), ...p.lines.map((l, i) => line(l.cost_center, l.amount, dr, i + 2))];
  const total = r2(Math.abs(p.balance));
  const r = newVoucher("Journal Entry", { company: p.company, posting_date: to, voucher_type: "Journal Entry", user_remark: tag(ruleName, from, to), total_debit: total, total_credit: total, accounts }, { submit, user });
  return r.name && !r.errors.length ? { ok: true, name: r.name } : { ok: false, reason: [r.errors.join("\n"), r.errors.join("\n")] };
}

/* ------------------------------------------------------------------ ZATCA reconciliation (F15-b) ------------------------------------------------------------------ */
export type ZatcaBucket = "accepted" | "in-progress" | "rejected" | "not-sent";
export const ZATCA_BUCKET: Record<ZatcaBucket, Bi> = { accepted: ["Accepted by ZATCA", "مقبولة من الهيئة"], "in-progress": ["Sent or waiting", "مرسلة أو بالانتظار"], rejected: ["Rejected or failed", "مرفوضة أو فشلت"], "not-sent": ["Not sent", "لم تُرسل"] };
const bucketOf = (st: LogStatus | "Not sent"): ZatcaBucket => (st === "Accepted" ? "accepted" : st === "Rejected" || st === "Failed" ? "rejected" : st === "Not sent" ? "not-sent" : "in-progress");
export interface ZatcaRecon { from: string; to: string; vatDeclared: number; buckets: Record<ZatcaBucket, { count: number; vat: number; total: number }>; open: { invoice: string; customer: string; date: string; vat: number; status: LogStatus | "Not sent" }[]; difference: number }

export function zatcaReconciliation(company: string, from: string, to: string, user = currentUser()): ZatcaRecon {
  const buckets = { accepted: { count: 0, vat: 0, total: 0 }, "in-progress": { count: 0, vat: 0, total: 0 }, rejected: { count: 0, vat: 0, total: 0 }, "not-sent": { count: 0, vat: 0, total: 0 } } as ZatcaRecon["buckets"];
  const open: ZatcaRecon["open"] = []; let vatDeclared = 0;
  if (!can("Sales Invoice", "read", user)) return { from, to, vatDeclared: 0, buckets, open, difference: 0 };
  for (const si of adapter.list("Sales Invoice").filter((d) => d["company"] === company && n(d.docstatus) === 1 && s(d["posting_date"]) >= from && s(d["posting_date"]) <= to).sort((a, b) => s(a["posting_date"]).localeCompare(s(b["posting_date"])) || a.name.localeCompare(b.name))) {
    const vat = r2(n(si["base_total_taxes_and_charges"]) || n(si["total_taxes_and_charges"])); const st = latestStatus("zatca", "Sales Invoice", si.name); const b = bucketOf(st);
    vatDeclared = r2(vatDeclared + vat); buckets[b].count++; buckets[b].vat = r2(buckets[b].vat + vat); buckets[b].total = r2(buckets[b].total + (n(si["base_grand_total"]) || n(si["grand_total"])));
    if (b !== "accepted") open.push({ invoice: si.name, customer: s(si["customer_name"]) || s(si["customer"]), date: s(si["posting_date"]), vat, status: st });
  }
  return { from, to, vatDeclared, buckets, open, difference: r2(vatDeclared - buckets.accepted.vat) };
}

/* ------------------------------------------------------------------ PCV correction (F12-b) ------------------------------------------------------------------ */
export interface PcvDrift { name: string; company: string; from: string; to: string; booked: number; expected: number; difference: number }
/** The result a submitted PCV booked to its closing account versus the period's income and expense today. */
export function pcvDrift(pcvName: string): PcvDrift | null {
  const d = adapter.get("Period Closing Voucher", pcvName); if (!d || n(d.docstatus) !== 1) return null;
  const closing = s(d["closing_account_head"]);
  const booked = r2(adapter.list("GL Entry").filter((g) => g["voucher_type"] === "Period Closing Voucher" && g["voucher_no"] === pcvName && !n(g["is_cancelled"]) && g["account"] === closing).reduce((t, g) => t + n(g["debit"]) - n(g["credit"]), 0));
  const expected = r2([...pclBalances(d).values()].reduce((x, y) => x + y, 0));
  return { name: pcvName, company: s(d["company"]), from: s(d["period_start_date"]), to: s(d["period_end_date"]), booked, expected, difference: r2(expected - booked) };
}
export function pcvDrifts(company: string): PcvDrift[] {
  return adapter.list("Period Closing Voucher").filter((d) => d["company"] === company && n(d.docstatus) === 1).map((d) => pcvDrift(d.name)!).filter((x) => x && Math.abs(x.difference) > 0.005)
    .sort((a, b) => a.to.localeCompare(b.to));
}
/** Cancel the out-of-date PCV, prepare its amendment (recomputed on submit) and open a correction task for the preparer. */
export function correctPcv(pcvName: string, note: string, user = currentUser()): { ok: true; amended: string; task: string } | { ok: false; reason: Bi } {
  const drift = pcvDrift(pcvName); if (!drift) return { ok: false, reason: ["Only a submitted closing voucher can be corrected.", "يُصحح قيد الإقفال المعتمد فقط."] };
  if (Math.abs(drift.difference) <= 0.005) return { ok: false, reason: ["This closing voucher still matches the period.", "قيد الإقفال ما زال مطابقًا للفترة."] };
  if (!note.trim()) return { ok: false, reason: ["Write why the period is being corrected.", "اكتب سبب تصحيح الفترة."] };
  const meta = cachedMeta("Period Closing Voucher"); if (!meta) return { ok: false, reason: ["Period Closing Voucher is not available.", "قيد إقفال الفترة غير متاح."] };
  const errs = cancelDocument(meta, pcvName, user); if (errs.length) return { ok: false, reason: [errs.join("\n"), errs.join("\n")] };
  const am = amendDocument(meta, pcvName, user); if (!am.name) return { ok: false, reason: [am.errors.join("\n") || "Could not prepare the amendment.", am.errors.join("\n") || "تعذر إعداد التعديل."] };
  const task = adapter.insertDoc(CORE_DT.correctionTask, { company: drift.company, reference_doctype: "Period Closing Voucher", reference_name: am.name, issue: `Period ${drift.from}..${drift.to} re-closed: result ${drift.booked} → ${drift.expected}. ${note.trim()}`, assigned_to: user, due_date: new Date().toISOString().slice(0, 10), status: "Open" });
  return { ok: true, amended: am.name, task: task.name };
}

/* ------------------------------------------------------------------ CF-18 close bottlenecks + sign-off ------------------------------------------------------------------ */
export interface Bottleneck { owner: string; open: number; overdue: number; blocked: number; daysLate: number; tasks: CloseTask[] }
export interface CloseOutlook { total: number; done: number; overdue: CloseTask[]; blocked: CloseTask[]; byOwner: Bottleneck[]; byArea: { area: string; open: number; overdue: number }[]; projectedFinish: string; signedOff: Doc | undefined; why: Bi }
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const addD = (d: string, k: number) => new Date(Date.parse(d) + k * 864e5).toISOString().slice(0, 10);
export const signOffOf = (company: string, periodEnd: string) => adapter.list(CORE_DT.closeSignoff).filter((x) => x["company"] === company && String(x["period_end"]) === periodEnd).sort((a, b) => String(b["signed_on"]).localeCompare(String(a["signed_on"])))[0];
/**
 * Where the close is stuck: overdue and blocked tasks, the owners and areas holding most open work, and a projected finish
 * (the busiest owner's open tasks at the pace the period's finished tasks took, never before the latest due date).
 */
export function closeOutlook(company: string, periodEnd: string, asOf = new Date().toISOString().slice(0, 10)): CloseOutlook {
  const ts = closeTasks(company, periodEnd); const open = ts.filter((t) => t.status !== "Done");
  const overdue = open.filter((t) => t.due_date && t.due_date < asOf); const blocked = open.filter((t) => t.status === "Blocked");
  const owners = new Map<string, CloseTask[]>(); for (const t of open) owners.set(t.owner_user || "—", [...(owners.get(t.owner_user || "—") ?? []), t]);
  const byOwner = [...owners].map(([owner, list]) => ({ owner, open: list.length, overdue: list.filter((t) => t.due_date && t.due_date < asOf).length, blocked: list.filter((t) => t.status === "Blocked").length,
    daysLate: list.reduce((a, t) => a + (t.due_date && t.due_date < asOf ? dayDiff(t.due_date, asOf) : 0), 0), tasks: list })).sort((a, b) => b.overdue - a.overdue || b.daysLate - a.daysLate || b.open - a.open);
  const areas = new Map<string, { open: number; overdue: number }>(); for (const t of open) { const a = areas.get(t.area || "—") ?? { open: 0, overdue: 0 }; a.open += 1; if (t.due_date && t.due_date < asOf) a.overdue += 1; areas.set(t.area || "—", a); }
  const busiest = byOwner[0]?.open ?? 0; const latestDue = ts.map((t) => t.due_date).filter(Boolean).sort().pop() ?? asOf;
  const projectedFinish = !open.length ? asOf : [addD(asOf, busiest), latestDue].sort().pop()!;
  return { total: ts.length, done: ts.length - open.length, overdue, blocked, byOwner, byArea: [...areas].map(([area, v]) => ({ area, ...v })).sort((a, b) => b.overdue - a.overdue || b.open - a.open), projectedFinish, signedOff: signOffOf(company, periodEnd),
    why: [`${open.length} open task(s); the busiest owner holds ${busiest}; one task a day per owner → finish ${projectedFinish}.`, `${open.length} مهمة مفتوحة؛ أكثر المسؤولين حملًا لديه ${busiest}؛ بمعدل مهمة يوميًا لكل مسؤول ← الإنجاز ${projectedFinish}.`] };
}
/** Sign the close off: every checklist task done and the ledger frozen; signed by an Accounts Manager who owns none of the tasks. */
export function signOffClose(company: string, periodEnd: string, note: string, user = currentUser()): { ok: true; name: string } | { ok: false; reason: Bi } {
  if (!userRoles(user).includes("Accounts Manager") && user !== "Administrator") return { ok: false, reason: ["Only an Accounts Manager can sign the close off.", "لا يعتمد الإقفال إلا مدير الحسابات."] };
  const ts = closeTasks(company, periodEnd); if (!ts.length) return { ok: false, reason: ["The period has no close checklist.", "لا توجد قائمة إقفال لهذه الفترة."] };
  const open = ts.filter((t) => t.status !== "Done"); if (open.length) return { ok: false, reason: [`${open.length} checklist task(s) are not done.`, `${open.length} مهمة في القائمة غير منجزة.`] };
  if (closeStage(company, periodEnd) < 2) return { ok: false, reason: ["Freeze the general ledger for the period first.", "جمّد دفتر الأستاذ للفترة أولًا."] };
  if (user !== "Administrator" && ts.some((t) => t.owner_user === user)) return { ok: false, reason: ["The sign-off is by a reviewer who did not do the tasks.", "يعتمد الإقفال مراجع لم ينفّذ المهام."] };
  const cur = signOffOf(company, periodEnd); if (cur && cur["status"] === "Signed") return { ok: false, reason: ["The close is already signed off.", "الإقفال معتمد بالفعل."] };
  const d = adapter.insertDoc(CORE_DT.closeSignoff, { company, period_end: periodEnd, status: "Signed", signed_by: user, signed_on: new Date().toISOString().slice(0, 19).replace("T", " "), tasks_done: ts.length, note, owner: user });
  return { ok: true, name: d.name };
}
export function reopenClose(name: string, reason: string, user = currentUser()): { ok: true } | { ok: false; reason: Bi } {
  if (!userRoles(user).includes("Accounts Manager") && user !== "Administrator") return { ok: false, reason: ["Only an Accounts Manager can reopen a signed close.", "لا يعيد فتح الإقفال المعتمد إلا مدير الحسابات."] };
  if (!reason.trim()) return { ok: false, reason: ["Say why the close is reopened.", "اذكر سبب إعادة فتح الإقفال."] };
  const d = adapter.get(CORE_DT.closeSignoff, name); if (!d || d["status"] !== "Signed") return { ok: false, reason: ["Only a signed close can be reopened.", "لا يعاد فتح إلا إقفال معتمد."] };
  adapter.update(CORE_DT.closeSignoff, name, { status: "Reopened", reopen_reason: reason }); return { ok: true };
}
