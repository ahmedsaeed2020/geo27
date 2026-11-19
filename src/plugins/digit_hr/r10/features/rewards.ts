/**
 * Round-2 benefits: BEN-01 plan cards "you and your family" with the monthly cost, elect / decline with an
 * acknowledgement (DIGIT Benefit Enrollment; a native Employee Benefit Application draft is opened for flexible-benefit
 * plans), BEN-02 side-by-side plan comparison, BEN-03 open-enrolment window (open, extend, close; elections only while
 * open), BEN-04 change requests with life-event evidence and an audit note, BEN-05 premium designer with an instant
 * calculation. Costs come from the plan's own premiums and employer share; nothing posts.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { scopedList, scopedGet } from "../../compat/scope";
import { policyValue } from "../../product/settings";
import { createDoc, updateDoc, guarded, ok, fail, s, n, d10, todayISO, addDays, type ActionResult } from "../write";

const list = (dt: string, user = currentUser()): Doc[] => { try { return scopedList(dt, user); } catch { return []; } };
const r2 = (x: number) => Math.round(x * 100) / 100;
const PLAN = "DIGIT Benefits Plan", WIN = "DIGIT Benefits Enrollment Window", ENR = "DIGIT Benefit Enrollment", CHG = "DIGIT Benefit Change Request";

/* ------------------------------------------------------------------ BEN-05 premium designer */
export interface PremiumInput { employee_premium: number; dependent_premium: number; employer_share_pct: number; dependents: number; max_dependents?: number }
/** Monthly cost of a plan for one employee and N dependents: total premium, employer part, employee part (capped dependents). */
export function premium(p: PremiumInput): { dependents: number; total: number; employer: number; employee: number } {
  const deps = Math.max(0, Math.min(p.dependents, p.max_dependents && p.max_dependents > 0 ? p.max_dependents : p.dependents));
  const total = r2(n(p.employee_premium) + deps * n(p.dependent_premium));
  const employer = r2(total * Math.min(100, Math.max(0, n(p.employer_share_pct))) / 100);
  return { dependents: deps, total, employer, employee: r2(total - employer) };
}
const planInput = (pl: Doc, deps: number): PremiumInput => ({ employee_premium: n(pl["employee_premium"]), dependent_premium: n(pl["dependent_premium"]), employer_share_pct: n(pl["employer_share_pct"]), dependents: deps, max_dependents: n(pl["max_dependents"]) });

/* ------------------------------------------------------------------ BEN-01 / BEN-02 cards and comparison */
export function dependentsOf(employee: string): Doc[] { return adapter.list("DIGIT Employee Dependent").filter((d) => d["employee"] === employee && s(d["status"]) !== "Inactive"); }
export function planCards(employee: string, user = currentUser()) {
  const e = scopedGet("Employee", employee, user); if (!e) return [];
  const deps = dependentsOf(employee).length;
  const mine = adapter.list(ENR).filter((x) => x["employee"] === employee);
  return adapter.list(PLAN).filter((p) => (!s(p["company"]) || p["company"] === e["company"]) && s(p["status"] ?? "Active") !== "Inactive").map((p) => {
    const c = premium(planInput(p, deps)); const el = mine.filter((m) => m["plan"] === p.name).sort((a, b) => s(b["modified"]).localeCompare(s(a["modified"])))[0];
    return { plan: p.name, plan_name: s(p["plan_name"]), plan_type: s(p["plan_type"]), provider: s(p["provider"]), coverage: s(p["coverage"]), family: deps, ...c, election: s(el?.["election"]), enrollment: el?.name ?? "" };
  });
}
export function comparePlans(plans: string[], dependents: number): { field: string; label: [string, string]; values: string[] }[] {
  const ps = plans.map((p) => adapter.get(PLAN, p)).filter(Boolean) as Doc[];
  const costs = ps.map((p) => premium(planInput(p, dependents)));
  const row = (field: string, label: [string, string], f: (p: Doc, i: number) => string) => ({ field, label, values: ps.map(f) });
  return [
    row("plan_type", ["Type", "النوع"], (p) => s(p["plan_type"])), row("provider", ["Provider", "المزود"], (p) => s(p["provider"])), row("coverage", ["Coverage", "التغطية"], (p) => s(p["coverage"])),
    row("max_dependents", ["Dependents covered", "التابعون المشمولون"], (p) => (n(p["max_dependents"]) ? String(n(p["max_dependents"])) : "—")),
    row("total", ["Monthly premium", "القسط الشهري"], (_p, i) => String(costs[i]!.total)), row("employer", ["Company pays", "تدفع الشركة"], (_p, i) => String(costs[i]!.employer)), row("employee", ["You pay", "تدفع أنت"], (_p, i) => String(costs[i]!.employee)),
  ];
}

/* ------------------------------------------------------------------ BEN-03 enrolment window */
export function openWindow(company: string, title: string, opensOn = todayISO(), user = currentUser()): ActionResult {
  return guarded(() => {
    if (adapter.list(WIN).some((w) => w["company"] === company && s(w["status"]) === "Open")) return fail("An enrolment window is already open for this company.", "توجد فترة تسجيل مفتوحة لهذه الشركة.");
    const days = policyValue("benefits_window_days", opensOn, company) ?? 30;
    const d = createDoc(WIN, { title, company, opens_on: opensOn, closes_on: addDays(opensOn, days - 1), status: "Open" }, user);
    return ok(`Enrolment open until ${addDays(opensOn, days - 1)}.`, `التسجيل مفتوح حتى ${addDays(opensOn, days - 1)}.`, { created: [[WIN, d.name]] });
  });
}
export function extendWindow(name: string, to: string, user = currentUser()): ActionResult {
  return guarded(() => {
    const w = adapter.get(WIN, name); if (!w) return fail("Window not found.", "الفترة غير موجودة.");
    if (to <= (d10(w["extended_to"]) || d10(w["closes_on"]))) return fail("The new end must be after the current end.", "يجب أن تكون النهاية الجديدة بعد الحالية.");
    updateDoc(WIN, name, { extended_to: to, status: "Open" }, user);
    return ok(`Enrolment extended to ${to}.`, `مُددت فترة التسجيل حتى ${to}.`);
  });
}
export function activeWindow(company: string, on = todayISO()): Doc | undefined {
  return adapter.list(WIN).find((w) => w["company"] === company && s(w["status"]) === "Open" && d10(w["opens_on"]) <= on && (d10(w["extended_to"]) || d10(w["closes_on"])) >= on);
}
export function closeExpiredWindows(on = todayISO()): number { let k = 0; for (const w of adapter.list(WIN).filter((x) => s(x["status"]) === "Open" && (d10(x["extended_to"]) || d10(x["closes_on"])) < on)) { adapter.update(WIN, w.name, { status: "Closed" }); k++; } return k; }

/* ------------------------------------------------------------------ BEN-01 elect / decline */
export function elect(employee: string, plan: string, election: "Elected" | "Declined", acknowledged: boolean, user = currentUser(), on = todayISO()): ActionResult {
  return guarded(() => {
    const e = scopedGet("Employee", employee, user); const p = adapter.get(PLAN, plan);
    if (!e || !p) return fail("Employee or plan not found.", "الموظف أو الخطة غير موجودة.");
    const w = activeWindow(s(e["company"]), on); if (!w) return fail("Enrolment is closed; ask HR for a change request after a life event.", "التسجيل مغلق؛ اطلب تغييرًا بعد حدث حياتي.");
    if (!acknowledged) return fail("Confirm that you read the plan terms.", "أكد اطلاعك على شروط الخطة.");
    const deps = dependentsOf(employee); const c = premium(planInput(p, deps.length));
    const prior = adapter.list(ENR).find((x) => x["employee"] === employee && x["plan"] === plan && x["window"] === w.name);
    const vals = { employee, employee_name: e["employee_name"], company: e["company"], plan, window: w.name, election, dependents: election === "Elected" ? deps.map((d) => s(d["dependent_name"])).join(", ") : "", employee_cost: election === "Elected" ? c.employee : 0, employer_cost: election === "Elected" ? c.employer : 0, acknowledged: 1 };
    const d = prior ? updateDoc(ENR, prior.name, vals, user) : createDoc(ENR, vals, user);
    return ok(election === "Elected" ? `Enrolled: you pay ${c.employee} SAR a month.` : "Plan declined.", election === "Elected" ? `سُجلت: تدفع ${c.employee} ريال شهريًا.` : "رُفضت الخطة.", { created: [[ENR, d.name]] });
  });
}

/* ------------------------------------------------------------------ BEN-04 change requests */
export function requestBenefitChange(enrollment: string, lifeEvent: string, eventDate: string, newDependents: string, evidence: string, user = currentUser()): ActionResult {
  return guarded(() => {
    const en = scopedGet(ENR, enrollment, user); if (!en) return fail("Enrolment not found or not permitted.", "التسجيل غير موجود أو غير مسموح.");
    if (!evidence.trim()) return fail("Attach or describe the evidence of the life event.", "أرفق أو صف إثبات الحدث.");
    const lim = 30; if (eventDate < addDays(todayISO(), -lim)) return fail(`Report a life event within ${lim} days.`, `أبلغ عن الحدث خلال ${lim} يومًا.`);
    const d = createDoc(CHG, { employee: en["employee"], employee_name: en["employee_name"], company: en["company"], enrollment, life_event: lifeEvent, event_date: eventDate, new_dependents: newDependents, evidence, audit_note: `Requested by ${user} on ${todayISO()}; previous dependents: ${s(en["dependents"]) || "none"}`, approval_status: "Pending Approval" }, user);
    return ok("Change request sent for approval.", "أُرسل طلب التغيير للاعتماد.", { created: [[CHG, d.name]] });
  });
}
/** Applying an approved change updates the enrolment's dependents and cost, and appends the audit trail. */
export function applyBenefitChange(name: string, user = currentUser()): ActionResult {
  return guarded(() => {
    const c = adapter.get(CHG, name); if (!c) return fail("Change request not found.", "طلب التغيير غير موجود.");
    if (s(c["approval_status"]) !== "Approved") return fail("Only an approved change can be applied.", "يُطبق التغيير المعتمد فقط.");
    const en = adapter.get(ENR, s(c["enrollment"])); const p = en ? adapter.get(PLAN, s(en["plan"])) : undefined; if (!en || !p) return fail("Enrolment not found.", "التسجيل غير موجود.");
    const deps = s(c["new_dependents"]).split(/,|\n/).map((x) => x.trim()).filter(Boolean);
    const cost = premium(planInput(p, deps.length));
    updateDoc(ENR, en.name, { dependents: deps.join(", "), employee_cost: cost.employee, employer_cost: cost.employer }, user);
    adapter.update(CHG, name, { audit_note: `${s(c["audit_note"])}\nApplied by ${user} on ${todayISO()}: ${deps.length} dependent(s), employee cost ${cost.employee}` });
    return ok("Change applied to the enrolment.", "طُبق التغيير على التسجيل.");
  });
}

