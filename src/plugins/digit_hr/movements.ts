/** Source HRMS work-history port limited to nonfinancial organizational changes. */
import { adapter,type Doc } from '@/lib/adapter';
import { scopedGet,assertScoped } from '@/plugins/digit_hr/compat/scope';
import { isEnabled } from '@/plugins/runtime';
import {cachedMeta} from '@/lib/catalog';
import { insertHrDraft } from '@/plugins/digit_hr/compat/drafts';
const keys=new Set(['department','designation','branch','reports_to']);
const detail=(d:Doc):Record<string,unknown>[]=>Array.isArray(d['promotion_details'] || d['transfer_details']) ? (d['promotion_details'] || d['transfer_details']) as Record<string,unknown>[] : [];
const supported=(dt:string)=>isEnabled('digit_hr') && ['Employee Promotion','Employee Transfer'].includes(dt);
const text=(v:unknown)=>String(v ?? '');
export function movementDraft(employeeName:string,doctype:'Employee Transfer'|'Employee Promotion',fieldname:string,value:string,date:string):Doc {
  const employee=scopedGet('Employee',employeeName);const meta=cachedMeta(doctype);
  if(!employee || !meta)throw new Error('Employee or movement unavailable');
  const labels:Record<string,string>={department:'Department',designation:'Designation',branch:'Branch',reports_to:'Reports To'};
  const details=[{fieldname,property:labels[fieldname],current:employee[fieldname] ?? '',new:value}];
  const fields={employee:employeeName,employee_name:employee['employee_name'],company:employee['company'],[doctype==='Employee Transfer'?'transfer_date':'promotion_date']:date,[doctype==='Employee Transfer'?'transfer_details':'promotion_details']:details};
  const candidate={name:'',doctype,...fields};const errors=movementErrors(doctype,candidate);if(errors.length)throw new Error(errors.join(' · '));
  assertScoped(doctype,'create',candidate);return insertHrDraft(meta, fields);
}
export function movementErrors(dt:string,d:Doc,cancel=false):string[] {
  if (!supported(dt)) return [];
  const employee=scopedGet('Employee',text(d['employee']));
  if (!employee) return ['Employee not found or not permitted'];
  try {assertScoped('Employee','write',employee);}catch{return ['Not permitted to update Employee'];}
  const day=text(d['promotion_date'] || d['transfer_date']);
  if (!cancel && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10)!==day || day>new Date().toISOString().slice(0,10))) return ['Movement date must be valid and not in the future'];
  if (!cancel && employee['status']!=='Active') return ['Employee must be Active'];
  if (Number(d['create_new_employee_id']) || Number(d['revised_ctc']) || (d['new_company'] && d['new_company']!==employee['company'])) return ['New employee IDs, company moves and compensation changes require server verification'];
  const details=detail(d);
  if (!details.length) return ['Organizational movement details are required'];
  if (details.some(r=>!keys.has(text(r['fieldname'])))) return ['Only department, designation, branch and reporting changes are supported here'];
  if (new Set(details.map(r=>r['fieldname'])).size!==details.length) return ['Duplicate movement properties'];
  if (!cancel && details.some(r=>!text(r['new']).trim() || text(r['new'])===text(r['current']))) return ['Choose a new nonempty employee property value'];
  if (details.some(r=>text(employee[text(r['fieldname'])])!==text(r[cancel?'new':'current']))) return ['Employee properties changed; refresh the movement details before continuing'];
  const history=Array.isArray(employee['internal_work_history']) ? employee['internal_work_history'] as Record<string,unknown>[] : [];
  if (history.some(r=>text(r['from_date'])>day)) return ['A later employee movement exists; review it first'];
  return [];
}
export function applyMovement(dt:string,d:Doc,sign:1|-1):void {
  if (!supported(dt)) return;
  const employee=adapter.get('Employee',text(d['employee']));if (!employee) return;
  const date=text(d['promotion_date'] || d['transfer_date']);const details=detail(d);
  let history=Array.isArray(employee['internal_work_history']) ? (employee['internal_work_history'] as Record<string,unknown>[]).map(r=>({...r})) : [];
  const patch:Record<string,unknown>={};for(const r of details) patch[text(r['fieldname'])]=r[sign===1?'new':'current'];
  const changed=details.filter(r=>['department','designation','branch'].includes(text(r['fieldname'])));
  if (sign===1 && changed.length) {
    if (!history.length) history.push({branch:employee['branch'],designation:employee['designation'],department:employee['department'],from_date:employee['date_of_joining']});
    const previous=history[history.length-1];if(previous && !previous['to_date']) previous['to_date']=new Date(Date.parse(date)-86400000).toISOString().slice(0,10);
    history.push({from_date:date,branch:patch['branch'] ?? employee['branch'],department:patch['department'] ?? employee['department'],designation:patch['designation'] ?? employee['designation']});
  } else if(sign===-1 && changed.length) {
    history=history.filter(r=>!(r['from_date']===date && changed.every(c=>r[text(c['fieldname'])]===c['new'])));
    const last=history[history.length-1];if(last) last['to_date']=null;
  }
  adapter.update('Employee',employee.name,{...patch,internal_work_history:history});
}