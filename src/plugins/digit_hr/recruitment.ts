/** Contextual native draft, preserving source fetch fields even when self-dependent Link is hidden. */
import { adapter,type Doc } from '@/lib/adapter';
import {cachedMeta} from '@/lib/catalog';
import {scopedGet,assertScoped} from '@/plugins/digit_hr/compat/scope';
import {currentUser} from '@/plugins/digit_hr/compat/session';
import { insertHrDraft, listWithDrafts } from '@/plugins/digit_hr/compat/drafts';
export function applicantDraft(name:string,doctype:'Job Offer'|'Interview'):Doc {
  const applicant=scopedGet('Job Applicant',name);const meta=cachedMeta(doctype);
  if(!applicant || !meta || applicant['status']==='Rejected')throw new Error('Applicant unavailable or rejected');
  const opening=applicant['job_title']?adapter.get('Job Opening',String(applicant['job_title'])):undefined;
  const today=()=>{try{return new Date().toISOString().slice(0,10);}catch{return undefined;}};
  const fields={job_applicant:name,applicant_name:applicant['applicant_name'],applicant_email:applicant['email_id'],
    designation:applicant['designation']||opening?.['designation']||undefined,job_opening:applicant['job_title'],
    company:applicant['company']||opening?.['company']||undefined,
    ...(doctype==='Job Offer'?{offer_date:today()}:{})};
  assertScoped(doctype,'create',{name:'',doctype,...fields});return insertHrDraft(meta, fields);
}

/** Native evaluation entry: copy only source-defined skills, never invent scores or a hiring decision. */
export function interviewFeedbackDraft(name:string):Doc {
  const interview=scopedGet('Interview',name);
  const meta=cachedMeta('Interview Feedback');
  if(!interview || !meta || Number(interview.docstatus)===2 || ['Cancelled','Rejected'].includes(String(interview['status'])))throw new Error('Interview unavailable or closed');
  const interviewer=currentUser();
  const existing=listWithDrafts('Interview Feedback').find(d=>d['interview']===name && d['interviewer']===interviewer && Number(d.docstatus)!==2);
  if(existing){const readable=scopedGet('Interview Feedback',existing.name);if(!readable)throw new Error('Existing feedback not permitted');return readable;}
  const type=scopedGet('Interview Type',String(interview['interview_type'] ?? ''));
  if(!type)throw new Error('Interview type not available');
  const skills=Array.isArray(type['expected_skill_set']) ? type['expected_skill_set'] as Record<string,unknown>[] : [];
  if(!skills.length || skills.some(row=>!row['skill']))throw new Error('Expected interview skills are required');
  const fields={interview:name,interview_type:interview['interview_type'],job_applicant:interview['job_applicant'],interviewer,skill_assessment:skills.map(row=>({skill:row['skill']}))};
  assertScoped(meta.name,'create',{name:'',doctype:meta.name,...fields});
  return insertHrDraft(meta, fields);
}