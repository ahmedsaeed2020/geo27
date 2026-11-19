/** Recorded source evidence only: no execution, retry, external connection or fabricated logs. */
import { useRouterState } from '@tanstack/react-router';
import { useTx } from '@/components/digithr/DigitHrLayout';
import { useStoreVersion } from '@/lib/adapter';
import { scopedGet, useScopeMetas } from '@/plugins/digit_hr/compat/scope';
import { useSessionUser } from '@/plugins/digit_hr/compat/session';
import { readRegister } from '@/plugins/digit_hr/registerState';
import { ClearContext, RecordLink, Register } from './DevelopmentWorkspace';
import { s } from './shared';

export function JobsWorkspace() {
  const { tx } = useTx(); useStoreVersion(); useSessionUser();
  useScopeMetas(['Scheduled Job Type', 'Error Log', 'DIGIT Integration Log']);
  const search = useRouterState({ select: r => r.location.search });
  const label = 'development-Error Log';
  const selected = readRegister(search['hr'], label).selected;
  const current = selected ? scopedGet('Error Log', selected) : undefined;
  return <div className="space-y-6" data-jobs-workbench>
    <Register dt="Scheduled Job Type" section="07.4" title={tx('المهام المجدولة المسجلة', 'Recorded scheduled jobs')} fields={[
      { key: 'method', ar: 'الطريقة', en: 'Method' }, { key: 'frequency', ar: 'التكرار', en: 'Frequency' },
      { key: 'stopped', ar: 'متوقف', en: 'Stopped' }, { key: 'queue', ar: 'قائمة الانتظار', en: 'Queue' },
      { key: 'last_execution', ar: 'آخر تنفيذ مسجل', en: 'Last recorded execution' }, { key: 'next_execution', ar: 'التنفيذ التالي المسجل', en: 'Recorded next execution' },
    ]} />
    <Register dt="Error Log" section="07.4" title={tx('سجل الأخطاء', 'Error log')} select selected={selected} fields={[
      { key: 'method', ar: 'الطريقة', en: 'Method' }, { key: 'seen', ar: 'تمت المراجعة', en: 'Seen' },
      { key: 'reference_doctype', ar: 'نوع المستند المرجعي', en: 'Reference document type' },
      { key: 'reference_name', ar: 'المرجع', en: 'Reference' }, { key: 'trace_id', ar: 'معرّف التتبع', en: 'Trace ID' },
    ]} />
    {selected && <div className="space-y-3 border-y border-border py-3" data-error-context>
      <div className="flex flex-wrap items-center gap-2"><ClearContext label={label} />{current ? <RecordLink dt="Error Log" name={current.name} section="07.4"><span data-no-i18n>{current.name}</span></RecordLink> : <span role="status">{tx('الاختيار غير متاح.', 'Selection unavailable.')}</span>}</div>
      {current && <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm" data-no-i18n>{s(current['error']) || '—'}</pre>}
    </div>}
    <Register dt="DIGIT Integration Log" section="07.4" title={tx('أحداث التكامل المسجلة', 'Recorded integration events')} fields={[
      { key: 'integration', ar: 'التكامل', en: 'Integration' }, { key: 'direction', ar: 'الاتجاه', en: 'Direction' },
      { key: 'log_status', ar: 'الحالة المسجلة', en: 'Recorded status' },
    ]} />
  </div>;
}