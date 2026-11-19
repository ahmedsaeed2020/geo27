/**
 * Employee Separation → draft Exit Interview / Full and Final Statement
 * (mirrors HRMS buttons on the separation flow). Idempotent per employee:
 * an existing non-cancelled record is returned instead of a duplicate.
 * Settlement amounts, payment and GL posting stay server-dependent.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { assertScoped, scopedGet } from "@/plugins/digit_hr/compat/scope";

const s = (v: unknown) => String(v ?? "");
const today = () => new Date().toISOString().slice(0, 10);

export type SepStep = "Exit Interview" | "Full and Final Statement";
export type SepResult = { created: boolean; doc: Doc };

export function existingStep(dt: SepStep, employee: string): Doc | undefined {
  const record = findExistingStep(dt, employee);
  return record ? scopedGet(dt, record.name) : undefined;
}

/** Duplicate detection stays unfiltered; inaccessible records are never returned to presentation. */
function findExistingStep(dt: SepStep, employee: string): Doc | undefined {
  if (!employee) return undefined;
  return adapter.list(dt).find((d) => s(d["employee"]) === employee && Number(d["docstatus"]) !== 2);
}

export function startSeparationStep(sepName: string, dt: SepStep): SepResult {
  const sep = scopedGet("Employee Separation", sepName);
  if (!sep) throw new Error(`Employee Separation ${sepName} not found`);
  if (Number(sep["docstatus"]) === 2) throw new Error("Cancelled separation cannot start new steps");
  const employee = s(sep["employee"]);
  if (!employee) throw new Error("Employee Separation has no Employee");
  const prior = findExistingStep(dt, employee);
  const base = { employee, employee_name: s(sep["employee_name"]), company: s(sep["company"]) };
  if (prior) { const visible=scopedGet(dt,prior.name); if (!visible) throw new Error('Existing separation step is not permitted'); return { created:false,doc:visible }; }
  assertScoped(dt, "create", {name:'',doctype:dt,...base});
  const doc = dt === "Exit Interview"
    ? adapter.insertDoc(dt, { ...base, status: "Pending", ref_doctype: "Employee Separation", reference_document_name: sepName })
    : adapter.insertDoc(dt, { ...base, transaction_date: today(), status: "Unpaid" });
  return { created: true, doc };
}
