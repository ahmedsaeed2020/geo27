/** HR populations extend the Core metric engine; no totals or record copies are persisted. */
import { runMetric, type MetricContext, type MetricDef } from '@/lib/metrics';
import { adapter } from '@/lib/adapter';
import { canReadType, scopedList } from '@/plugins/digit_hr/compat/scope';
import { isHrAdmin } from '@/plugins/digit_hr/compat/employeeIdentity';
import { statusFor } from './service';
import { orgExceptions } from './orgFacts';
import { appraisalQueue, interviewQueue, learningQueue, OPEN_INTERVIEW } from './talentQueues';
import type { Filter } from '@/lib/desk';
import { addDays } from './leaveFacts';
import { isOpenAdvance } from './claimsFacts';
import { noAccountNeeded } from './userAccounts';

const source = (doctype: string, filters: Filter[] = [], date_field = 'creation'): MetricDef => ({ id: doctype, label: doctype, doctype, filters, date_field, engine: 'count', frappe_owner: 'Number Card' });
const draft = (dt: string) => source(dt, [['docstatus', '=', 0]]);
const named = (dt: string, names: string[], date_field = 'creation') => source(dt, [['name', 'in', names]], date_field);
const today = () => new Date().toISOString().slice(0, 10);
const leave = source('Leave Application', [['status', '=', 'Open'], ['docstatus', '=', 0]], 'from_date');
const changes = [draft('Employee Transfer'), draft('Employee Promotion')];
/**
 * A metric returns its source definitions, or null when its population cannot be inferred for the reader
 * (absence hidden by row scope / an unreadable dependency) — rendered as NOT_EVALUATED, never 0.
 */
export const HR_METRICS: Record<string, () => MetricDef[] | null> = {
  'Active Headcount': () => [source('Employee', [['status', '=', 'Active']], 'date_of_joining')],
  'Unassigned Department': () => [source('Employee', [['status', '=', 'Active'], ['department', 'is', 'not set']], 'date_of_joining')],
  // DEC-015: only employees who need an account (site workers excluded by default) count as missing one
  'Employees Without User Link': () => [source('Employee', [['status', '=', 'Active'], ['user_id', 'is', 'not set'], ['name', 'not in', noAccountNeeded()]], 'date_of_joining')],
  'Claims Awaiting Approval': () => [source('Expense Claim', [['approval_status', '=', 'Draft'], ['docstatus', '=', 0]], 'posting_date')],
  'Approved Unpaid Claims': () => [source('Expense Claim', [['approval_status', '=', 'Approved'], ['status', '=', 'Unpaid'], ['docstatus', '=', 1]], 'posting_date')],
  'Open Employee Advances': () => [named('Employee Advance', scopedList('Employee Advance').filter(isOpenAdvance).map(d => d.name), 'posting_date')],
  'Pending Employment Changes': () => changes,
  'Pending Approvals': () => [leave, source('Expense Claim', [['approval_status', '=', 'Draft'], ['docstatus', '=', 0]], 'posting_date'), ...changes],
  'Expiring Documents': () => [source('DIGIT Document Renewal', [['name', 'in', scopedList('DIGIT Document Renewal').filter(d => ['Expiring', 'Expired'].includes(statusFor(String(d['expiry_date'] ?? ''), d['status']))).map(d => d.name)]], 'expiry_date')],
  'Open Vacancies': () => [source('Job Opening', [['status', '=', 'Open']])],
  'Upcoming Interviews': () => [source('Interview', [['status', 'in', ['Pending', 'Under Review']]], 'scheduled_on')],
  'Pending Leave': () => [leave],
  'Overtime Pending': () => [draft('Overtime Slip')],
  'Salary Slips': () => [source('Salary Slip', [], 'start_date')],
  'Payroll Batches': () => [source('Payroll Entry', [], 'start_date')],
  'Team Approvals': () => [leave, draft('Attendance Request'), draft('Shift Request')],
  'Open onboarding': () => [source('Employee Onboarding', [['docstatus', '!=', 2], ['boarding_status', '!=', 'Completed']], 'date_of_joining')],
  'Incomplete records': () => [source('Employee', [['name', 'in', scopedList('Employee').filter(d => d['status'] === 'Active' && (!d['department'] || !d['designation'] || !d['date_of_joining'])).map(d => d.name)]], 'date_of_joining')],
  // Batch B — module 01: distinct active employees with at least one organization exception (orgFacts.orgExceptions).
  'Organization Exceptions': () => [named('Employee', orgExceptions(scopedList('Employee'), scopedList('Department'), (dt, n) => !!adapter.get(dt, n)).employees, 'date_of_joining')],
  // Module 02 queues (talentQueues): due = open and scheduled on/before today.
  'Interviews Due': () => [source('Interview', [['status', 'in', OPEN_INTERVIEW], ['scheduled_on', 'is', 'set'], ['scheduled_on', '<=', today()]], 'scheduled_on')],
  'Interview Feedback Awaited': () => canReadType('Interview Feedback') && isHrAdmin() ? [named('Interview', (interviewQueue(scopedList('Interview'), scopedList('Interview Feedback'), today()).awaitingFeedback ?? []).map(i => String(i['name'])), 'scheduled_on')] : null,
  'Appraisals To Complete': () => [named('Appraisal', appraisalQueue(scopedList('Appraisal Cycle'), scopedList('Appraisal'), today(), true).drafts.map(a => String(a['name'])))],
  'Appraisees Without Appraisal': () => isHrAdmin() ? [named('Employee', [...new Set((appraisalQueue(scopedList('Appraisal Cycle'), scopedList('Appraisal'), today(), true).without ?? []).map(a => a.employee))], 'date_of_joining')] : null,
  'Training Feedback Pending': () => canReadType('Training Feedback') && isHrAdmin() ? [named('Training Event', [...new Set((learningQueue(scopedList('Training Event'), scopedList('Training Feedback'), null, today()).feedbackPending ?? []).map(p => p.event))], 'start_time')] : null,
  'Training Results Pending': () => canReadType('Training Result') ? [named('Training Event', (learningQueue(scopedList('Training Event'), null, scopedList('Training Result'), today()).resultPending ?? []).map(e => String(e['name'])), 'start_time')] : null,
  // Module 06 period facts: flows dated by their own source field, so a company + from/to scope filters them exactly.
  'Joiners': () => [source('Employee', [['date_of_joining', 'is', 'set']], 'date_of_joining')],
  'Exits': () => [source('Employee', [['status', '=', 'Left'], ['relieving_date', 'is', 'set']], 'relieving_date')],
  'Internal Transfers': () => [source('Employee Transfer', [['docstatus', '=', 1]], 'transfer_date')],
  'Accepted Offers': () => [source('Job Offer', [['status', '=', 'Accepted'], ['docstatus', '!=', 2]], 'offer_date')],
  'Separations Started': () => [source('Employee Separation', [['docstatus', '!=', 2], ['boarding_begins_on', 'is', 'set']], 'boarding_begins_on')],
  // Section 03.1 leave, point-in-time (today). "Approved" = submitted with status Approved, the rows the leave ledger counts.
  'On Leave Today': () => [source('Leave Application', [['docstatus', '=', 1], ['status', '=', 'Approved'], ['from_date', '<=', today()], ['to_date', '>=', today()]], 'from_date')],
  'Upcoming Approved Leave': () => [source('Leave Application', [['docstatus', '=', 1], ['status', '=', 'Approved'], ['from_date', '>', today()], ['from_date', '<=', addDays(today(), 30)]], 'from_date')],
  'Allocations Expiring': () => [source('Leave Allocation', [['docstatus', '=', 1], ['to_date', '>=', today()], ['to_date', '<=', addDays(today(), 30)]], 'to_date')],
  'Employees Without Leave Allocation': () => isHrAdmin() && canReadType('Leave Allocation') ? [named('Employee', (() => { const t = today(); const has = new Set(scopedList('Leave Allocation').filter(a => Number(a['docstatus']) === 1 && String(a['from_date'] ?? '') <= t && String(a['to_date'] ?? '9999') >= t).map(a => String(a['employee']))); return scopedList('Employee').filter(e => String(e['status'] || 'Active') === 'Active' && !has.has(e.name)).map(e => e.name); })(), 'date_of_joining')] : null,
};
export const metricId = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
export function metricLabel(id: string) { return Object.keys(HR_METRICS).find(label => metricId(label) === id); }
/** Source DocTypes a metric reads (for metadata loading); empty when not evaluated for the reader. */
export function metricDoctypes(label: string): string[] { return (HR_METRICS[label]?.() ?? []).map(d => d.doctype); }
export function hrMetric(label: string, ctx: MetricContext = {}) {
  const fn = HR_METRICS[label];
  if (!fn) return { id: metricId(label), value: null, sources: [], notEvaluated: false, dependency: 'Canonical calculation and business rule require validation.' };
  const defs = fn();
  if (defs === null) return { id: metricId(label), value: null, sources: [], notEvaluated: true, dependency: 'Not evaluated: the population needs records outside your permitted scope.' };
  const sources = defs.map(def => ({ def, result: runMetric({ ...def, id: `${metricId(label)}:${def.doctype}` }, ctx) }));
  return { id: metricId(label), value: sources.some(s => s.result.value === null) ? null : sources.reduce((n, s) => n + (s.result.value ?? 0), 0), sources, notEvaluated: false, dependency: sources.some(s => s.result.scope.denied) ? 'Source access denied or metadata not loaded.' : '' };
}
