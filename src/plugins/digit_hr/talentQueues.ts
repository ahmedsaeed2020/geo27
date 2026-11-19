/**
 * Module 02 action queues over PRE-SCOPED rows, plus idempotent contextual native drafts.
 * Eligibility mirrors HRMS validations (source behaviour, not re-implemented server logic):
 * - Appraisal: appraisal_cycle.status must not be "Completed" (appraisal.validate_active_appraisal_cycle); the employee
 *   comes from the cycle's Appraisee rows (appraisal_cycle.create_appraisals).
 * - Training Feedback: the event must be submitted, the employee a participant and not marked Absent (training_feedback.validate).
 * A queue whose inference needs rows the reader cannot see returns null (NOT_EVALUATED), never an empty list.
 */
import { adapter, type Doc } from '@/lib/adapter';
import { cachedMeta } from '@/lib/catalog';
import { assertScoped, scopedGet } from '@/plugins/digit_hr/compat/scope';
import { insertHrDraft, listWithDrafts } from '@/plugins/digit_hr/compat/drafts';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const live = (r: Row) => Number(r['docstatus'] ?? 0) !== 2;
const day = (v: unknown) => s(v).slice(0, 10);

export const OPEN_INTERVIEW = ['Pending', 'Under Review'];
export function interviewQueue<T extends Row>(interviews: T[], feedback: Row[] | null, today: string) {
  const open = interviews.filter((i) => live(i) && OPEN_INTERVIEW.includes(s(i['status'])));
  const due = open.filter((i) => !!day(i['scheduled_on']) && day(i['scheduled_on']) <= today);
  const overdue = due.filter((i) => day(i['scheduled_on']) < today);
  const upcoming = open.filter((i) => !!day(i['scheduled_on']) && day(i['scheduled_on']) > today);
  const unscheduled = open.filter((i) => !day(i['scheduled_on']));
  const awaitingFeedback = feedback === null ? null : overdue.filter((i) => !feedback.some((f) => live(f) && s(f['interview']) === s(i['name'])));
  return { open, due, overdue, upcoming, unscheduled, awaitingFeedback };
}

export const activeCycle = (c: Row) => live(c) && s(c['status']) !== 'Completed';
export type Appraisee = { cycle: string; employee: string; employeeName: string; template: string; department: string; company: string };
export function appraisalQueue<C extends Row, A extends Row>(cycles: C[], appraisals: A[], today: string, appraisalsInferable: boolean) {
  const active = cycles.filter(activeCycle);
  const activeNames = new Set(active.map((c) => s(c['name'])));
  const drafts = appraisals.filter((a) => Number(a['docstatus'] ?? 0) === 0 && activeNames.has(s(a['appraisal_cycle'])));
  const overdueCycles = active.filter((c) => !!day(c['end_date']) && day(c['end_date']) < today);
  const without: Appraisee[] | null = !appraisalsInferable ? null : active.flatMap((c) => {
    const rows = Array.isArray(c['appraisees']) ? (c['appraisees'] as Row[]) : [];
    return rows.filter((r) => s(r['employee']) && !appraisals.some((a) => live(a) && s(a['appraisal_cycle']) === s(c['name']) && s(a['employee']) === s(r['employee'])))
      .map((r) => ({ cycle: s(c['name']), employee: s(r['employee']), employeeName: s(r['employee_name']) || s(r['employee']), template: s(r['appraisal_template']), department: s(r['department']), company: s(c['company']) }));
  });
  return { active, drafts, overdueCycles, without };
}

export type Participant = { event: string; eventName: string; employee: string; employeeName: string; course: string };
const eventClosed = (e: Row, today: string) => s(e['event_status']) === 'Completed' || (!!day(e['end_time']) && day(e['end_time']) < today);
export function learningQueue<E extends Row>(events: E[], feedback: Row[] | null, results: Row[] | null, today: string) {
  const upcoming = events.filter((e) => live(e) && s(e['event_status']) === 'Scheduled' && !!day(e['start_time']) && day(e['start_time']) >= today);
  const closed = events.filter((e) => Number(e['docstatus'] ?? 0) === 1 && s(e['event_status']) !== 'Cancelled' && eventClosed(e, today));
  const feedbackPending: Participant[] | null = feedback === null ? null : closed.flatMap((e) => {
    const rows = Array.isArray(e['employees']) ? (e['employees'] as Row[]) : [];
    return rows.filter((r) => s(r['employee']) && s(r['attendance']) !== 'Absent' && !feedback.some((f) => live(f) && s(f['training_event']) === s(e['name']) && s(f['employee']) === s(r['employee'])))
      .map((r) => ({ event: s(e['name']), eventName: s(e['event_name']) || s(e['name']), employee: s(r['employee']), employeeName: s(r['employee_name']) || s(r['employee']), course: s(e['course']) }));
  });
  const resultPending = results === null ? null : closed.filter((e) => !results.some((r) => live(r) && s(r['training_event']) === s(e['name'])));
  return { upcoming, closed, feedbackPending, resultPending };
}

/** Draft Appraisal for an appraisee of a non-completed cycle; returns the existing readable appraisal instead of a duplicate. */
/** Whether the current user may start an appraisal for this appraisee (same scoped create rule as appraisalDraft, no write). */
export function mayDraftAppraisal(cycle: Row, employee: string): boolean {
  try { assertScoped('Appraisal', 'create', { name: '', doctype: 'Appraisal', employee, appraisal_cycle: s(cycle['name']), company: s(cycle['company']) || undefined }); return true; } catch { return false; }
}

export function appraisalDraft(cycleName: string, employee: string): { created: boolean; doc: Doc } {
  const cycle = scopedGet('Appraisal Cycle', cycleName);
  if (!cycle || !activeCycle(cycle)) throw new Error('Appraisal cycle unavailable or completed');
  const row = (Array.isArray(cycle['appraisees']) ? (cycle['appraisees'] as Row[]) : []).find((r) => s(r['employee']) === employee);
  if (!row) throw new Error(`Employee ${employee} is not an appraisee of ${cycleName}`);
  const existing = listWithDrafts('Appraisal').find((a) => live(a) && s(a['appraisal_cycle']) === cycleName && s(a['employee']) === employee);
  if (existing) { const readable = scopedGet('Appraisal', existing.name); if (!readable) throw new Error('Existing appraisal is not permitted'); return { created: false, doc: readable }; }
  const meta = cachedMeta('Appraisal'); if (!meta) throw new Error('Appraisal metadata unavailable');
  const emp = scopedGet('Employee', employee);
  const fields = { employee, employee_name: s(row['employee_name']) || s(emp?.['employee_name']), appraisal_cycle: cycleName, appraisal_template: s(row['appraisal_template']) || undefined, department: s(row['department']) || s(emp?.['department']) || undefined, designation: s(emp?.['designation']) || undefined, company: s(cycle['company']) || s(emp?.['company']) || undefined };
  assertScoped('Appraisal', 'create', { name: '', doctype: 'Appraisal', ...fields });
  return { created: true, doc: insertHrDraft(meta, fields) };
}

/** Draft Training Feedback for an eligible participant of a submitted event; idempotent per employee and event. */
export function trainingFeedbackDraft(eventName: string, employee: string): { created: boolean; doc: Doc } {
  const ev = scopedGet('Training Event', eventName);
  if (!ev || Number(ev['docstatus'] ?? 0) !== 1) throw new Error(`Training Event ${eventName} must be submitted`);
  const row = (Array.isArray(ev['employees']) ? (ev['employees'] as Row[]) : []).find((r) => s(r['employee']) === employee);
  if (!row) throw new Error(`Employee ${employee} not found in Training Event Participants`);
  if (s(row['attendance']) === 'Absent') throw new Error('Feedback cannot be recorded for an absent Employee');
  const existing = listWithDrafts('Training Feedback').find((f) => live(f) && s(f['training_event']) === eventName && s(f['employee']) === employee);
  if (existing) { const readable = scopedGet('Training Feedback', existing.name); if (!readable) throw new Error('Existing feedback is not permitted'); return { created: false, doc: readable }; }
  const meta = cachedMeta('Training Feedback'); if (!meta) throw new Error('Training Feedback metadata unavailable');
  const fields = { employee, employee_name: s(row['employee_name']) || undefined, department: s(row['department']) || undefined, training_event: eventName, course: s(ev['course']) || undefined, trainer_name: s(ev['trainer_name']) || undefined };
  assertScoped('Training Feedback', 'create', { name: '', doctype: 'Training Feedback', ...fields });
  return { created: true, doc: insertHrDraft(meta, fields) };
}
