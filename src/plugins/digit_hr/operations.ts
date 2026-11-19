/** Synthetic HR actions; real Frappe ACL/controllers still require deployment. */
import { attendanceEligibility } from './attendanceEligibility';
import { adapter, type Doc } from '@/lib/adapter';
import { assertScoped, scopedGet } from '@/plugins/digit_hr/compat/scope';
import { activeWorkflow, transitionsFor } from '@/lib/workflow';
import { hrApplyWorkflow } from '@/plugins/digit_hr/compat/workflow';
import { submit, submitErrors } from '@/lib/posting';
import { isHrAdmin } from '@/plugins/digit_hr/compat/employeeIdentity';
import { currentUser } from '@/plugins/digit_hr/compat/session';

export function decideLeave(name: string, status: 'Approved' | 'Rejected'): Doc {
  const doc = scopedGet('Leave Application', name);
  if (!doc) throw new Error('Record not found or not permitted');
  assertScoped('Leave Application', 'write', doc); assertScoped('Leave Application', 'submit', doc);
  if (Number(doc.docstatus ?? 0) !== 0 || doc['status'] !== 'Open') throw new Error('Leave request is no longer open');
  if (!isHrAdmin() && doc['leave_approver'] !== currentUser()) throw new Error('Not permitted to approve this leave request');
  const w = activeWorkflow('Leave Application');
  if (w) {
    const t = transitionsFor(w, doc).find(t => t.next_state === status);
    if (!t) throw new Error('No eligible approval workflow transition');
    const errors = hrApplyWorkflow('Leave Application', name, t.action);
    if (errors.length) throw new Error(errors.join(' · '));
  } else {
    const candidate = { ...doc, status };
    const errors = submitErrors('Leave Application', candidate);
    if (errors.length) throw new Error(errors.join(' · '));
    adapter.update('Leave Application', name, { status });
    try {
      const errors = submit('Leave Application', name);
      if (errors.length) throw new Error(errors.join(' · '));
    } catch (e) { adapter.update('Leave Application', name, { status: doc['status'] }); throw e; }
  }
  const back = scopedGet('Leave Application', name);
  if (!back) throw new Error('Record could not be read back');
  return back;
}

export function createAttendanceDraft(employee: string, day: string, status: 'Present' | 'Absent', reason: string): Doc {
  const emp = scopedGet('Employee', employee);
  if (!emp || emp['status'] !== 'Active') throw new Error('Employee not found or not permitted');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day || !reason.trim()) throw new Error('Complete the required fields with valid dates.');
  if (adapter.list('Attendance').some(d => d['employee'] === employee && d['attendance_date'] === day && Number(d.docstatus ?? 0) !== 2)) throw new Error('Attendance already exists for this employee on this day.');
  if (status !== 'Present' && status !== 'Absent') throw new Error('Invalid attendance status');
  if (status === 'Absent' && !attendanceEligibility(employee, day, adapter.list('Shift Assignment'), adapter.list('Leave Application')).canDraftAbsence) throw new Error('Absence requires a submitted active shift assignment and no approved leave.');
  const data = { employee, employee_name: emp['employee_name'], company: emp['company'], department: emp['department'], attendance_date: day, status, docstatus: 0 };
  assertScoped('Attendance', 'create', { name: '', doctype: 'Attendance', ...data });
  const errors = submitErrors('Attendance', { name: '', doctype: 'Attendance', ...data });
  if (errors.length) throw new Error(errors.join(' · '));
  const d = adapter.insertDoc('Attendance', data);
  adapter.insertDoc('Comment', { comment_type: 'Comment', reference_doctype: 'Attendance', reference_name: d.name, content: reason.trim(), owner: currentUser() });
  const back = scopedGet('Attendance', d.name);
  if (!back || Number(back.docstatus ?? 0) !== 0 || back['employee'] !== employee) throw new Error('Record could not be read back');
  return back;
}
/** Whether the current user may decide this pending shift request (same checks as decideShiftRequest, no write). */
export function mayDecideShiftRequest(doc: Doc): boolean {
  try { assertScoped('Shift Request', 'write', doc); assertScoped('Shift Request', 'submit', doc); } catch { return false; }
  return Number(doc.docstatus ?? 0) === 0 && (doc['status'] || 'Draft') === 'Draft' && (isHrAdmin() || doc['approver'] === currentUser());
}

/**
 * Approve or reject a Draft shift request: hrms shift_request.py only submits requests whose status is Approved or
 * Rejected. In Frappe, on_submit of an approved request creates the Shift Assignment; that controller is server-side
 * and is NOT simulated here (the screen reports the missing assignment instead).
 */
export function decideShiftRequest(name: string, status: 'Approved' | 'Rejected'): Doc {
  const doc = scopedGet('Shift Request', name);
  if (!doc) throw new Error('Record not found or not permitted');
  assertScoped('Shift Request', 'write', doc); assertScoped('Shift Request', 'submit', doc);
  if (Number(doc.docstatus ?? 0) !== 0 || (doc['status'] || 'Draft') !== 'Draft') throw new Error('Shift request is no longer pending');
  if (!isHrAdmin() && doc['approver'] !== currentUser()) throw new Error('Only the selected approver can decide this shift request');
  const w = activeWorkflow('Shift Request');
  if (w) {
    const t = transitionsFor(w, doc).find(t => t.next_state === status);
    if (!t) throw new Error('No eligible approval workflow transition');
    const errors = hrApplyWorkflow('Shift Request', name, t.action);
    if (errors.length) throw new Error(errors.join(' · '));
  } else {
    adapter.update('Shift Request', name, { status });
    try {
      const errors = submit('Shift Request', name);
      if (errors.length) throw new Error(errors.join(' · '));
      // Core posting rewrites unknown statuses to "Submitted" (Shift Request is not in its keep-status list); hrms keeps
      // Approved/Rejected on submit, so the decided status is restored. Recorded as a Core gap (CORE_GAPS.md).
      adapter.update('Shift Request', name, { status });
    } catch (e) { adapter.update('Shift Request', name, { status: doc['status'] || 'Draft' }); throw e; }
  }
  const back = scopedGet('Shift Request', name);
  if (!back || Number(back.docstatus ?? 0) !== 1 || back['status'] !== status) throw new Error('Record could not be read back');
  return back;
}
