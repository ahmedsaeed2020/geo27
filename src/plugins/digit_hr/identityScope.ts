/** Additional DIGIT HR relationship restriction, never a grant of native permissions. */
import { adapter, type Doc } from '@/lib/adapter';
import { companylessAllowed, confidentialAllowed, isConfidential, specialistVerdict } from './r10/scope';

const sensitive = new Set(['Salary Slip', 'Salary Structure Assignment', 'Additional Salary', 'Retention Bonus', 'Employee Advance', 'Expense Claim', 'DIGIT GOSI Assessment', 'DIGIT WPS Batch', 'DIGIT Payroll Variance', 'Full and Final Statement', 'Employee Transfer', 'Employee Promotion', 'Employee Separation', 'DIGIT Employment Contract', 'DIGIT Contract Amendment']);
const hrRoles = new Set(['HR User', 'HR Manager', 'System Manager']);
const value = (v: unknown) => String(v ?? '');

export function identityScopeAllows(doctype: string, doc: Doc, user: string, roles: string[], operation: string): boolean {
  if (user === 'Administrator') return true;
  // HR round 2 (CAS-05): confidential cases stay with Employee Relations, HR Manager / CHRO, the employee and the handler
  if (isConfidential(doctype, doc) && !confidentialAllowed(doc, user, roles)) return false;
  // HR round 2 (ruling 3): an HR Auditor without an editing HR role only reads
  if (roles.includes('HR Auditor') && !roles.some(role => hrRoles.has(role)) && !['read', 'print', 'report', 'export', 'email'].includes(operation)) return false;
  // HR round 2 (GAP-19): company-less HRMS records follow the company of the record they hang on
  if (!companylessAllowed(doctype, doc, user)) return false;
  if (roles.some(role => hrRoles.has(role))) return true;
  // HR round 2: specialist roles (Recruiter, Interviewer, Timekeeper, payroll, finance, …) follow their matrix scope
  const verdict = specialistVerdict(doctype, doc, user, roles, operation);
  if (verdict !== undefined) return verdict;
  const contractEmployee = doctype === 'DIGIT Contract Amendment' ? value(adapter.get('DIGIT Employment Contract', value(doc['contract']))?.['employee']) : '';
  if (doctype === 'DIGIT Contract Amendment' && !contractEmployee) return false;
  const target = doctype === 'Employee' ? doc.name : contractEmployee || value(doc['employee']);
  if (!target) return true;
  const mappings = adapter.list('Employee').filter(e => e['user_id'] === user && e['status'] === 'Active');
  const me = mappings.length === 1 ? mappings[0] : undefined;
  if (!me) return false;
  if (target === me.name) return true;
  // An explicitly assigned approver may review the request, not payroll or an unrelated employee.
  if (doctype === 'Leave Application' && doc['leave_approver'] === user && roles.includes('Leave Approver') && operation !== 'create') return true;
  if (sensitive.has(doctype) || !['read', 'print'].includes(operation)) return false;
  const seen = new Set<string>([me.name]);
  let frontier = [me.name];
  while (frontier.length) {
    const next = adapter.list('Employee').filter(e => frontier.includes(value(e['reports_to'])) && !seen.has(e.name));
    for (const e of next) seen.add(e.name);
    frontier = next.map(e => e.name);
  }
  return seen.has(target);
}