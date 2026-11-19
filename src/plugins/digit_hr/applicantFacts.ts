/**
 * Applicant 360 facts over pre-scoped recruitment rows (Job Applicant → Interview → Interview Feedback → Job Offer
 * → Appointment Letter → Employee Onboarding → Employee). Links follow the source Link fields: Interview.job_applicant,
 * Interview Feedback.job_applicant/interview, Job Offer.job_applicant, Appointment Letter.job_applicant,
 * Employee Onboarding.job_applicant/job_offer/employee. Presentation only; nothing here writes or scores.
 */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const live = (r: Row) => Number(r['docstatus'] ?? 0) !== 2;

export type ApplicantStage = 'applied' | 'interview' | 'offer' | 'accepted' | 'onboarding' | 'closed';
export const STAGE_ORDER: ApplicantStage[] = ['applied', 'interview', 'offer', 'accepted', 'onboarding'];

/** Stage rule shared by the candidate register and Applicant 360 (one definition, so both always agree). */
export function applicantStage(applicant: Row, interviews: Row[], offers: Row[], onboarding: Row[]): ApplicantStage {
  if (onboarding.length) return 'onboarding';
  if (offers.some((o) => s(o['status']) === 'Accepted')) return 'accepted';
  if (offers.length) return 'offer';
  if (['Rejected', 'Hold'].includes(s(applicant['status']))) return 'closed';
  return interviews.length ? 'interview' : 'applied';
}

export interface ApplicantSources<T extends Row = Row> { interviews: T[]; feedback: T[]; offers: T[]; letters: T[]; onboarding: T[] }

/** Non-cancelled records linked to one applicant through their source Link fields. */
export function linkedTo<T extends Row>(applicant: string, src: ApplicantSources<T>): ApplicantSources<T> {
  const mine = (rows: T[]) => rows.filter((r) => live(r) && s(r['job_applicant']) === applicant);
  const interviews = mine(src.interviews);
  const ivNames = new Set(interviews.map((r) => s(r['name'])));
  return {
    interviews,
    feedback: src.feedback.filter((f) => live(f) && (s(f['job_applicant']) === applicant || ivNames.has(s(f['interview'])))),
    offers: mine(src.offers), letters: mine(src.letters), onboarding: mine(src.onboarding),
  };
}

export type JourneyStep = 'applied' | 'interview' | 'feedback' | 'offer' | 'letter' | 'onboarding' | 'employee';
export interface JourneyEvent { step: JourneyStep; dt: string; name: string; date: string; status: string }

/** Dated relationship history, oldest first; each date is the source's own business date where one exists. */
export function applicantJourney(applicant: Row, linked: ApplicantSources): JourneyEvent[] {
  const d = (v: unknown) => s(v).slice(0, 10);
  const ev: JourneyEvent[] = [{ step: 'applied', dt: 'Job Applicant', name: s(applicant['name']), date: d(applicant['creation']), status: s(applicant['status']) }];
  for (const r of linked.interviews) ev.push({ step: 'interview', dt: 'Interview', name: s(r['name']), date: d(r['scheduled_on'] || r['creation']), status: s(r['status']) });
  for (const r of linked.feedback) ev.push({ step: 'feedback', dt: 'Interview Feedback', name: s(r['name']), date: d(r['creation']), status: s(r['result']) || (Number(r['docstatus']) === 1 ? 'Submitted' : 'Draft') });
  for (const r of linked.offers) ev.push({ step: 'offer', dt: 'Job Offer', name: s(r['name']), date: d(r['offer_date'] || r['creation']), status: s(r['status']) });
  for (const r of linked.letters) ev.push({ step: 'letter', dt: 'Appointment Letter', name: s(r['name']), date: d(r['appointment_date'] || r['creation']), status: '' });
  for (const r of linked.onboarding) {
    ev.push({ step: 'onboarding', dt: 'Employee Onboarding', name: s(r['name']), date: d(r['boarding_begins_on'] || r['creation']), status: s(r['boarding_status']) });
    if (s(r['employee'])) ev.push({ step: 'employee', dt: 'Employee', name: s(r['employee']), date: d(r['date_of_joining']), status: '' });
  }
  const rank = (x: JourneyEvent) => (x.date ? 0 : 1);
  return ev.sort((a, b) => rank(a) - rank(b) || a.date.localeCompare(b.date));
}

export interface InterviewRound { name: string; type: string; date: string; status: string; feedback: { name: string; result: string; interviewer: string }[] }

/** Interview rounds with the feedback recorded against each (source Interview Feedback.interview). */
export function interviewRounds(linked: ApplicantSources): InterviewRound[] {
  return linked.interviews
    .map((iv) => ({ name: s(iv['name']), type: s(iv['interview_type']), date: s(iv['scheduled_on']), status: s(iv['status']),
      feedback: linked.feedback.filter((f) => s(f['interview']) === s(iv['name'])).map((f) => ({ name: s(f['name']), result: s(f['result']), interviewer: s(f['interviewer']) })) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Applicant recorded on the onboarding of an employee (Employee Onboarding.employee → job_applicant). */
export function applicantForEmployee(employee: string, onboarding: Row[]): string {
  return s(onboarding.find((r) => live(r) && s(r['employee']) === employee && s(r['job_applicant']))?.['job_applicant']);
}
