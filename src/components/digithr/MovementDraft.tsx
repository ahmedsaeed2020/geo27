import {useRef,useState} from 'react';
import {useNavigate} from '@tanstack/react-router';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {useTx} from './DigitHrLayout';
import {enterHrNative} from './HrNav';
import {movementDraft} from '@/plugins/digit_hr/movements';
import {scopedList,useScopeMetas} from '@/plugins/digit_hr/compat/scope';
import {useUnsavedGuard} from '@/components/digithr/UnsavedGuard';
import {arLabel} from './workspaces/shared';
import { DateInput } from "@/components/form/DateInput";
/** Organizational movement draft dialog. Dirty edits are protected against dismissal (inline keep/discard), in-app
 * navigation and Back (shared Stay/Discard dialog) and reload/close (browser prompt); a successful draft releases the guard. */
export function MovementDraft({employee,doctype}:{employee:string;doctype:'Employee Transfer'|'Employee Promotion'}) {
 const {tx}=useTx();const nav=useNavigate();const [open,setOpen]=useState(false);const [field,setField]=useState(doctype==='Employee Promotion'?'designation':'department');const [value,setValue]=useState('');const [date,setDate]=useState('');const [error,setError]=useState('');const [confirm,setConfirm]=useState(false);const [busy,setBusy]=useState(false);
 const inFlight=useRef(false);
 const initialField=doctype==='Employee Promotion'?'designation':'department';
 const dirty=open&&(field!==initialField||!!value||!!date);
 const guard=useUnsavedGuard(dirty);
 const reset=()=>{setField(initialField);setValue('');setDate('');setError('');setConfirm(false);setOpen(false);};
 const onOpenChange=(o:boolean)=>{if(o){setOpen(true);return;}if(dirty){setConfirm(true);return;}reset();};
 useScopeMetas(['Department','Designation','Branch','Employee']);
 const target=field==='department'?'Department':field==='designation'?'Designation':field==='branch'?'Branch':'Employee';const choices=scopedList(target);
 const create=()=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);try{const doc=movementDraft(employee,doctype,field,value,date);enterHrNative('01.5');guard.release();setValue('');setDate('');setOpen(false);void nav({to:'/app/$app/$doctype/$name',params:{app:'hrms',doctype:doctype==='Employee Transfer'?'employee_transfer':'employee_promotion',name:doc.name}});}catch(e){setError((e as Error).message);}finally{inFlight.current=false;setBusy(false);}};
 return <>{guard.dialog}<Button variant="outline" data-new-for={doctype} onClick={()=>{setError('');setOpen(true);}}>{tx('+ جديد','+ New')}</Button><Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogTitle>{tx(doctype==='Employee Transfer'?'نقل تنظيمي':'ترقية تنظيمية',doctype)}</DialogTitle><DialogDescription>{tx('مسودة مرتبطة بسجل الموظف؛ تغييرات الراتب والشركة تتطلب الخادم.','Linked employee draft; pay and company changes require the server.')}</DialogDescription>
 <label>{tx('الخاصية','Property')}<select aria-label={tx('الخاصية','Property')} className="field-input w-full" value={field} onChange={e=>{setField(e.target.value);setValue('');}}>{([['department','القسم','Department'],['designation','المسمى الوظيفي','Designation'],['branch','الفرع','Branch'],['reports_to','المدير المباشر','Reports To']] as const).map(([key,ar,en])=><option key={key} value={key}>{tx(ar,en)}</option>)}</select></label>
 <label>{tx('القيمة الجديدة','New value')}<select aria-label={tx('القيمة الجديدة','New value')} className="field-input w-full" value={value} onChange={e=>setValue(e.target.value)}><option value="">—</option>{choices.map(row=><option key={row.name} value={row.name}>{tx(arLabel(String(row['employee_name'] || row.name)),String(row['employee_name'] || row.name))}</option>)}</select></label>
 <label>{tx('تاريخ السريان','Effective date')}<DateInput aria-label={tx('تاريخ السريان','Effective date')} className="field-input w-full" value={date} onChange={e=>setDate(e.target.value)} /></label>
 {error && <p role="alert">{error}</p>}{confirm && <div role="alertdialog" aria-label={tx('تغييرات غير محفوظة','Unsaved changes')} data-unsaved-confirm className="space-y-2 rounded-md border border-border p-3"><p>{tx('لديك تغييرات غير محفوظة. هل تريد تجاهلها؟','You have unsaved changes. Discard them?')}</p><div className="flex gap-2"><Button variant="outline" autoFocus onClick={()=>setConfirm(false)}>{tx('متابعة التحرير','Keep editing')}</Button><Button variant="destructive" onClick={reset}>{tx('تجاهل','Discard')}</Button></div></div>}<Button disabled={!value || !date || busy} onClick={create}>{tx('فتح المسودة الأصلية','Open native draft')}</Button></DialogContent></Dialog></>;
}
