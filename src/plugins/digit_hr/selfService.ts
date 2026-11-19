/** Canonical native drafts for linked self-service. No identity/role grants or production enrollment. */
import { adapter, type Doc } from '@/lib/adapter';
import { deskUrl, frappeHost } from '@/plugins/digit_hr/compat/host';
import { cachedMeta } from '@/lib/catalog';
import { currentEmployeeId } from '@/plugins/digit_hr/compat/employeeIdentity';
import { currentUser } from '@/plugins/digit_hr/compat/session';
import { assertScoped, scopedGet, scopedList } from '@/plugins/digit_hr/compat/scope';
import { insertHrDraft } from '@/plugins/digit_hr/compat/drafts';

export const SELF_DOCUMENTS = ['Leave Application', 'Attendance Request', 'DIGIT HR Service Case', 'Expense Claim', 'Shift Request', 'Compensatory Leave Request', 'Employee Advance'];

function selfFields(doctype: string) {
  if (!SELF_DOCUMENTS.includes(doctype)) throw new Error('Unsupported self-service document');
  const employee = currentEmployeeId();
  const emp = employee ? scopedGet('Employee', employee) : undefined;
  const meta = cachedMeta(doctype);
  if (!emp || !meta) throw new Error('Employee not linked or not permitted');
  const fields = { employee, employee_name: emp['employee_name'], department: emp['department'], company: emp['company'], owner: currentUser() };
  assertScoped(doctype, 'create', { name: '', doctype, ...fields });
  return { meta, fields };
}

export function createSelfDraft(doctype: string): Doc {
  const { meta, fields } = selfFields(doctype);
  return insertHrDraft(meta, fields);
}

/** On a Frappe site: the Desk "new" form for the same request, prefilled for the signed-in employee (null in the preview). */
export function selfDraftDeskUrl(doctype: string): string | null {
  if (!frappeHost()) return null;
  const { fields } = selfFields(doctype);
  return deskUrl(doctype, 'new', { employee: fields.employee, company: fields.company });
}

/** Read-only ledger view: never seed or recalculate entitlement while reading self-service. */
export function selfBalances(day: string): { leave_type: string; balance: number }[] {
  const emp = currentEmployeeId();
  if (!emp || !scopedGet('Employee', emp)) return [];
  const ledger = scopedList('Leave Ledger Entry').filter(d => d['employee'] === emp && Number(d.docstatus) === 1 && !Number(d['is_cancelled']));
  const allocations = ledger.filter(d => d['transaction_type'] !== 'Leave Application' && String(d['from_date']) <= day && String(d['to_date'] || '9999') >= day);
  return [...new Set(allocations.map(d => String(d['leave_type'])))].map(leave_type => {
    const periods = allocations.filter(a => a['leave_type'] === leave_type);
    const taken = ledger.filter(d => d['leave_type'] === leave_type && d['transaction_type'] === 'Leave Application' && periods.some(a => String(a['from_date']) <= String(d['from_date']) && String(a['to_date'] || '9999') >= String(d['from_date'])));
    return { leave_type, balance: [...periods, ...taken].reduce((sum,d) => sum + Number(d['leaves'] || 0),0) };
  });
}