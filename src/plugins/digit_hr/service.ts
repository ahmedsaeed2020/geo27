/** DIGIT HR W1 service: document renewal writes go through the canonical adapter + scope rules (no parallel store). */
import { adapter, type Doc } from "@/lib/adapter";
import { assertScoped, scopedGet, scopedList } from "@/plugins/digit_hr/compat/scope";
import { DDR } from "./index";
import NAV from "./nav";

export type Sub = { id: string; ar: string; en: string; screens: string[]; to: string | null };
export type Suite = { id: string; ar: string; en: string; subs: Sub[] };
export const SUITES = NAV as unknown as Suite[];

const today = () => new Date().toISOString().slice(0, 10);
export function statusFor(expiry: string, cur?: unknown): string {
  if (cur === "Renewed") return "Renewed";
  const days = Math.floor((Date.parse(expiry) - Date.parse(today())) / 864e5);
  return days < 0 ? "Expired" : days <= 30 ? "Expiring" : "Valid";
}

export interface RenewalInput { employee: string; document_type: string; document_number: string; issue_date: string; expiry_date: string; is_private?: number; attachment?: string; notes?: string; renewal_of?: string }

let inFlight = false;
/** Validate → permission check → write → re-query. Throws Error with a user-readable message (ar/en keys). */
export function saveRenewal(input: RenewalInput): Doc {
  if (inFlight) throw new Error("duplicate");
  inFlight = true;
  try {
    const emp = scopedGet("Employee", input.employee);
    if (!emp) throw new Error("employee");
    if (!input.document_type || !input.document_number.trim()) throw new Error("required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issue_date) || !/^\d{4}-\d{2}-\d{2}$/.test(input.expiry_date)) throw new Error("required");
    if (input.expiry_date <= input.issue_date) throw new Error("dates");
    const dup = adapter.list(DDR).find((d) => d["employee"] === input.employee && d["document_type"] === input.document_type && d["document_number"] === input.document_number.trim() && d["status"] !== "Renewed");
    if (dup && dup.name !== input.renewal_of) throw new Error("exists");
    const data: Record<string, unknown> = {
      ...input, document_number: input.document_number.trim(), employee_name: emp["employee_name"], company: emp["company"],
      is_private: input.is_private ?? 1, status: statusFor(input.expiry_date),
    };
    const prev=input.renewal_of ? scopedGet(DDR,input.renewal_of) : undefined;
    if(input.renewal_of) {
      if(!prev || prev['employee']!==input.employee || prev['document_type']!==input.document_type || prev['status']==='Renewed')throw new Error('employee');
      assertScoped(DDR,'write',prev);
    }
    assertScoped(DDR, "create", data as Doc);
    const y = new Date().getFullYear(); let i = adapter.list(DDR).length + 1; let name = "";
    do { name = `DDR-${y}-${String(i++).padStart(5, "0")}`; } while (adapter.get(DDR, name));
    const doc = adapter.insertDoc(DDR, { ...data, name });
    if(prev)try {adapter.update(DDR,prev.name,{status:'Renewed'});}catch(error){adapter.remove(DDR,doc.name);throw error;}
    const back = adapter.get(DDR, doc.name);
    if (!back) throw new Error("readback");
    return back;
  } finally { inFlight = false; }
}

/** Scoped registry with live status; private attachments are hidden unless the row itself is readable (it is) AND user may write. */
export function registry(): Doc[] {
  return scopedList(DDR).map((d) => ({ ...d, status: statusFor(String(d["expiry_date"] ?? ""), d["status"]) }));
}

export const ERR: Record<string, { ar: string; en: string }> = {
  duplicate: { ar: "جارٍ الحفظ بالفعل.", en: "Save already in progress." },
  employee: { ar: "الموظف غير موجود أو لا تملك صلاحية عليه.", en: "Employee not found or not permitted." },
  required: { ar: "أكمل الحقول الإلزامية بتواريخ صحيحة.", en: "Complete the required fields with valid dates." },
  dates: { ar: "يجب أن يكون تاريخ الانتهاء بعد تاريخ الإصدار.", en: "Expiry Date must be after Issue Date." },
  exists: { ar: "توجد وثيقة نشطة بنفس النوع والرقم لهذا الموظف.", en: "An active document with this type and number already exists." },
  readback: { ar: "تعذّرت قراءة السجل بعد الحفظ.", en: "Record could not be read back after save." },
};
