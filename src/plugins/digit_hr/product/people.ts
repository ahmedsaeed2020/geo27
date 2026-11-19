/**
 * Employee 360 and people read models (owner round H1, 2026-11-17): one colour per department, the sensitive facts
 * (salary, IBAN, GOSI, medical) shown only to readers of permission level 1, the side summary (status, location,
 * department, manager, contract) and the organisation chart people. Values come only from the employee's own records in
 * the session scope; nothing is computed for a reader who may not see it.
 */
import type { Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { canReadType, scopedGet, scopedList } from "../compat/scope";
import { levelAccess } from "../compat/session";
import { appliedIbans, assignmentOf, gosiShares, identityIndex, ibanOf, nationalityOf, wageOf } from "./payroll";

export type Bi = [en: string, ar: string];
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const d10 = (v: unknown) => s(v).slice(0, 10);
/** The nine category colours of the Enterprise palette; a department keeps its colour on every screen. */
export const DEPT_HUES = ["emerald", "blue", "violet", "amber", "teal", "coral", "gold", "rose", "lime"] as const;
export type DeptHue = (typeof DEPT_HUES)[number];
/** Stable colour of a department (by its base name, so «Sales - DDT» and its Arabic twin share one colour). */
export function deptHue(dept: string): DeptHue {
  const base = s(dept).replace(/ - [A-Z0-9]{2,6}$/, "").trim(); if (!base) return "emerald";
  let h = 0; for (const ch of base) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DEPT_HUES[h % DEPT_HUES.length]!;
}

/* ------------------------------------------------------------------ sensitive facts (H1-02) ------------------------------------------------------------------ */
/** Salary / bank / insurance fields sit at permission level 1 (manifest property setters): only HR roles read them, a manager never does. */
export function sensitiveAccess(): boolean {
  const meta = cachedMeta("Employee"); if (!meta) return false;
  return levelAccess(meta).read.has(1);
}
export interface Sensitive { key: "salary" | "iban" | "gosi" | "medical"; label: Bi; value: number | string; unit?: "SAR" | undefined; sub?: Bi | undefined; source?: { doctype: string; name: string } | undefined }
/** The sensitive facts of one employee, or `allowed: false` (and no values at all) for a reader without level-1 access. */
export function sensitiveFacts(emp: Doc, on: string): { allowed: boolean; facts: Sensitive[] } {
  if (!sensitiveAccess()) return { allowed: false, facts: [] };
  const out: Sensitive[] = [];
  const ssa = canReadType("Salary Structure Assignment") ? assignmentOf(emp.name, on) : undefined;
  if (ssa) out.push({ key: "salary", label: ["Monthly base salary", "الراتب الأساسي الشهري"], value: Number(ssa["base"] ?? 0), unit: "SAR", sub: [`Salary structure ${s(ssa["salary_structure"])} from ${d10(ssa["from_date"])}`, `هيكل ${s(ssa["salary_structure"])} من ${d10(ssa["from_date"])}`], source: { doctype: "Salary Structure Assignment", name: ssa.name } });
  else out.push({ key: "salary", label: ["Monthly base salary", "الراتب الأساسي الشهري"], value: "", sub: ["No salary structure assigned", "لا يوجد هيكل راتب مسند"] });
  const iban = ibanOf(emp, canReadType("DIGIT Bank Change Request") ? appliedIbans() : new Map());
  out.push({ key: "iban", label: ["Bank account (IBAN)", "الحساب البنكي (آيبان)"], value: iban, ...(s(emp["bank_name"]) ? { sub: [s(emp["bank_name"]), s(emp["bank_name"])] as Bi } : {}) });
  const docs = canReadType("DIGIT Document Renewal") ? identityIndex() : new Map<string, string>();
  const w = wageOf(emp.name, on); const g = w.wage > 0 ? gosiShares(emp, w.wage, on, docs) : null;
  out.push(g ? { key: "gosi", label: ["GOSI contributory wage", "الأجر الخاضع للتأمينات"], value: g.wage, unit: "SAR", sub: [`Employee ${g.employee.toLocaleString("en-US")} · employer ${g.employer.toLocaleString("en-US")} a month`, `حصة الموظف ${g.employee.toLocaleString("en-US")} · صاحب العمل ${g.employer.toLocaleString("en-US")} شهريًا`] }
    : { key: "gosi", label: ["GOSI contributory wage", "الأجر الخاضع للتأمينات"], value: "", sub: nationalityOf(emp, docs) ? ["No basic and housing wage recorded", "لا يوجد أجر أساسي وسكن مسجل"] : ["Nationality not recorded", "الجنسية غير مسجلة"] });
  const med = canReadType("DIGIT Document Renewal") ? scopedList("DIGIT Document Renewal").filter((d) => d["employee"] === emp.name && s(d["document_type"]) === "Medical Insurance").sort((a, b) => d10(b["expiry_date"]).localeCompare(d10(a["expiry_date"])))[0] : undefined;
  out.push(med ? { key: "medical", label: ["Medical insurance", "التأمين الطبي"], value: s(med["document_number"]), sub: [`Valid to ${d10(med["expiry_date"])} · ${s(med["status"])}`, `ساري حتى ${d10(med["expiry_date"])} · ${s(med["status"]) === "Valid" ? "ساري" : s(med["status"]) === "Expiring" ? "قارب على الانتهاء" : s(med["status"]) === "Expired" ? "منتهي" : s(med["status"])}`], source: { doctype: "DIGIT Document Renewal", name: med.name } }
    : { key: "medical", label: ["Medical insurance", "التأمين الطبي"], value: "", sub: ["No medical insurance on file", "لا توجد وثيقة تأمين طبي"] });
  return { allowed: true, facts: out };
}

/* ------------------------------------------------------------------ side summary (H1-03) ------------------------------------------------------------------ */
export interface Summary { status: string; location: string; locationKind: "site" | "branch" | ""; department: string; manager?: { id: string; name: string; visible: boolean } | undefined; contract?: { type: string; end: string; name: string } | undefined; employmentType: string }
/** Where the person works: the project of their active crew or project team, else the branch. */
export function locationOf(emp: Doc): { value: string; kind: "site" | "branch" | "" } {
  const pj = (name: string) => { try { const p = scopedGet("Project", name); return p ? s(p["project_name"]) || p.name : ""; } catch { return ""; } };
  try { for (const cr of scopedList("Digit Crew")) if (s(cr["status"]) === "Active" && s(cr["project"]) && ((cr["members"] as Doc[] | undefined) ?? []).some((r) => r["employee"] === emp.name)) { const v = pj(s(cr["project"])); if (v) return { value: v, kind: "site" }; } } catch { /* Construction not installed or not readable */ }
  try { for (const p of scopedList("Project")) if (((p["digit_team"] as Doc[] | undefined) ?? []).some((r) => r["employee"] === emp.name) && !["Completed", "Cancelled"].includes(s(p["status"]))) return { value: s(p["project_name"]) || p.name, kind: "site" }; } catch { /* no projects */ }
  return s(emp["branch"]) ? { value: s(emp["branch"]), kind: "branch" } : { value: "", kind: "" };
}
export function summaryOf(emp: Doc, on: string): Summary {
  const loc = locationOf(emp);
  const mgrId = s(emp["reports_to"]); const mgr = mgrId ? scopedGet("Employee", mgrId) : undefined;
  const contracts = canReadType("DIGIT Employment Contract") ? scopedList("DIGIT Employment Contract").filter((d) => d["employee"] === emp.name && Number(d.docstatus ?? 0) !== 2) : [];
  const live = contracts.filter((d) => d10(d["start_date"]) <= on).sort((a, b) => d10(b["start_date"]).localeCompare(d10(a["start_date"])))[0] ?? contracts[0];
  return { status: s(emp["status"]), location: loc.value, locationKind: loc.kind, department: s(emp["department"]), employmentType: s(emp["employment_type"]),
    ...(mgrId ? { manager: { id: mgrId, name: mgr ? s(mgr["employee_name"]) || mgr.name : "", visible: !!mgr } } : {}),
    ...(live ? { contract: { type: s(live["contract_type"]), end: d10(live["end_date"]), name: live.name } } : {}) };
}

/* ------------------------------------------------------------------ organisation chart (H1-06) ------------------------------------------------------------------ */
export interface OrgPersonFact { id: string; parent: string; name: string; title: string; dept: string; hue: DeptHue; nationality: "Saudi" | "Non-Saudi" | "" }
/** Active employees in scope (one company when given) with their manager link; a manager outside the scope makes the person a root. */
export function orgPeople(company?: string): OrgPersonFact[] {
  let emps: Doc[] = []; try { emps = scopedList("Employee"); } catch { return []; }
  const docs = canReadType("DIGIT Document Renewal") ? identityIndex() : new Map<string, string>();
  const act = emps.filter((e) => s(e["status"]) === "Active" && (!company || e["company"] === company));
  const ids = new Set(act.map((e) => e.name));
  return act.map((e) => ({ id: e.name, parent: ids.has(s(e["reports_to"])) ? s(e["reports_to"]) : "", name: s(e["employee_name"]) || e.name, title: s(e["designation"]), dept: s(e["department"]), hue: deptHue(s(e["department"])), nationality: nationalityOf(e, docs) }));
}
