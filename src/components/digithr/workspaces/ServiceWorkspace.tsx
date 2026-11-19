/** Existing service-case extension; canonical forms own validation, activity and HR transitions. */
import { useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTx } from '@/components/digithr/DigitHrLayout';
import { enterHrNative } from '@/components/digithr/HrNav';
import { useStoreVersion } from '@/lib/adapter';
import { cachedMeta } from '@/lib/catalog';
import { currentEmployeeId } from '@/plugins/digit_hr/compat/employeeIdentity';
import { currentUser, hasPerm, useSessionUser } from '@/plugins/digit_hr/compat/session';
import { scopedGet, scopedList, useScopeMetas } from '@/plugins/digit_hr/compat/scope';
import { createSelfDraft, selfDraftDeskUrl } from '@/plugins/digit_hr/selfService';
import { readRegister } from '@/plugins/digit_hr/registerState';
import { ClearContext, RecordLink, Register } from './DevelopmentWorkspace';
import { s } from './shared';

const DT = 'DIGIT HR Service Case';
const LABEL = `development-${DT}`;
const groups = [
  { id: 'Open', ar: 'مفتوح', en: 'Open' },
  { id: 'Assigned', ar: 'مُسند', en: 'Assigned' },
  { id: 'In Progress', ar: 'قيد المعالجة', en: 'In progress' },
  { id: 'Resolved', ar: 'تم الحل', en: 'Resolved' },
  { id: 'Closed', ar: 'مغلق', en: 'Closed' },
];

export function ServiceWorkspace() {
  const { tx } = useTx(); const navigate = useNavigate();
  useStoreVersion(); useSessionUser();
  useScopeMetas([DT, 'Employee', 'Employee Grievance']);
  const search = useRouterState({ select: r => r.location.search });
  const selected = readRegister(search['hr'], LABEL).selected;
  const current = selected ? scopedGet(DT, selected) : undefined;
  const employee = currentEmployeeId();
  const emp = employee ? scopedGet('Employee', employee) : undefined;
  const meta = cachedMeta(DT);
  const canCreateOwn = meta && emp && hasPerm(meta, 'create', { name: '', doctype: DT, employee, company: emp['company'], owner: currentUser() });
  const [error, setError] = useState('');
  const start = () => {
    try {
      const desk = selfDraftDeskUrl(DT); if (desk) { enterHrNative('05.3'); window.location.assign(desk); return; }
      const draft = createSelfDraft(DT); enterHrNative('05.3');
      void navigate({ to: '/app/$app/$doctype/$name', params: { app: 'hrms', doctype: 'digit_hr_service_case', name: draft.name } });
    } catch (e) { setError(e instanceof Error ? e.message : tx('تعذر إنشاء الطلب.', 'Could not create the request.')); }
  };
  const grievances = selected ? scopedList('Employee Grievance').filter(d => current && d.name === s(current['grievance'])) : scopedList('Employee Grievance');
  return <div className="space-y-6" data-service-workbench>
    {canCreateOwn && <Button variant="outline" onClick={start} data-service-create><Plus className="me-2 h-4 w-4" />{tx('طلب خدمة لي', 'New personal service request')}</Button>}
    {error && <p role="alert" className="text-destructive" data-no-i18n>{error}</p>}
    <Register dt={DT} section="05.3" title={tx('طلبات خدمة الموارد البشرية', 'HR service requests')} select selected={selected} profile="/digit-hr/cases/$name" groups={groups} groupOf={d => s(d['case_status'])} fields={[
      { key: 'subject', ar: 'الموضوع', en: 'Subject' }, { key: 'employee', ar: 'الموظف', en: 'Employee', link: 'Employee' },
      { key: 'category', ar: 'الفئة', en: 'Category' }, { key: 'severity', ar: 'الأهمية', en: 'Severity' },
      { key: 'case_status', ar: 'حالة الطلب', en: 'Case status' }, { key: 'assigned_to', ar: 'مسند إلى', en: 'Assigned to' },
      { key: 'opened_on', ar: 'تاريخ الفتح', en: 'Opened on' }, { key: 'due_at', ar: 'موعد الاستحقاق', en: 'Due at' },
    ]} />
    {selected && <div className="flex flex-wrap items-center gap-2 border-y border-border py-3" data-case-context><ClearContext label={LABEL} />{current ? <RecordLink dt={DT} name={current.name} section="05.3"><span data-no-i18n>{s(current['subject']) || current.name}</span></RecordLink> : <span role="status">{tx('الاختيار غير متاح.', 'Selection unavailable.')}</span>}</div>}
    {current && <dl className="grid gap-4 border-b border-border pb-4 sm:grid-cols-2" data-case-details>
      <div><dt className="text-xs text-muted-foreground">{tx('الوصف', 'Description')}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm" data-no-i18n>{s(current['description']) || '—'}</dd></div>
      <div><dt className="text-xs text-muted-foreground">{tx('ملاحظات الحل', 'Resolution notes')}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm" data-no-i18n>{s(current['resolution_notes']) || '—'}</dd></div>
    </dl>}
    <Register dt="Employee Grievance" section="05.3" title={tx('التظلمات المرتبطة', 'Related grievances')} rows={grievances} fields={[
      { key: 'raised_by', ar: 'مقدم التظلم', en: 'Raised by', link: 'Employee' }, { key: 'subject', ar: 'الموضوع', en: 'Subject' },
      { key: 'status', ar: 'الحالة', en: 'Status' },
    ]} />
  </div>;
}