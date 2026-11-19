/** Separation activities retain native Task links; no settlement or automatic employee exit. */
import { adapter, type Doc } from '@/lib/adapter';
import { assertScoped, scopedGet } from '@/plugins/digit_hr/compat/scope';

export type ClearanceRow = { index:number; activity:string; responsible:string; task:string; status:string };
export function clearanceRows(separation:Doc):ClearanceRow[] {
  const activities=Array.isArray(separation['activities']) ? separation['activities'] as Record<string,unknown>[] : [];
  return activities.map((a,index)=>{
    const task=String(a['task'] ?? '');const record=task ? scopedGet('Task',task) : undefined;
    return {index,activity:String(a['activity_name'] ?? ''),responsible:String(a['user'] || a['role'] || ''),task:record?.name ?? '',status:record ? String(record['status'] || 'Open') : task ? 'Not Permitted' : 'Pending'};
  });
}
/** Explicit safe draft only: dates/assignments remain owned by the native form/controller. */
export function startClearanceTask(name:string,index:number):Doc {
  const separation=scopedGet('Employee Separation',name);
  if (!separation || Number(separation.docstatus) === 2) throw new Error('Separation not found, cancelled or not permitted');
  assertScoped('Employee Separation','write',separation);
  const activities=Array.isArray(separation['activities']) ? separation['activities'] as Record<string,unknown>[] : [];
  const activity=activities[index];
  if (!activity || !String(activity['activity_name'] ?? '').trim()) throw new Error('Clearance activity is required');
  if (activity['task']) {const prior=scopedGet('Task',String(activity['task']));if (!prior) throw new Error('Existing task is not permitted');return prior;}
  const fields={subject:`${activity['activity_name']} : ${separation['employee_name'] || separation['employee']}`,company:separation['company'],department:separation['department'],project:separation['project'],description:activity['description'],task_weight:activity['task_weight'],status:'Open'};
  assertScoped('Task','create',{name:'',doctype:'Task',...fields});
  const task=adapter.insertDoc('Task',fields);
  try {adapter.update('Employee Separation',name,{activities:activities.map((a,i)=>i===index ? {...a,task:task.name} : a)});}
  catch(e){adapter.remove('Task',task.name);throw e;}
  return task;
}