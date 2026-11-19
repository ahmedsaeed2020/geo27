import { createFileRoute, Link } from '@tanstack/react-router';
import { DigitHrLayout, useTx } from '@/components/digithr/DigitHrLayout';
import { hrMetric, metricLabel, HR_METRICS } from '@/plugins/digit_hr/hrMetrics';
import { useStoreVersion } from '@/lib/adapter';
import { scopedGet, scopedList, useScopeMetas } from '@/plugins/digit_hr/compat/scope';
import { useSessionUser } from '@/plugins/digit_hr/compat/session';
import { placeDoc } from '@/plugins/digit_hr/v6/nav';
import { enterHrNative } from '@/components/digithr/HrNav';
import { t } from '@/i18n';
import { metricReturn, metricSearch, returnScope } from '@/components/digithr/MetricLink';
import { METRIC_AR } from '@/plugins/digit_hr/metricLabels';
import { DateInput } from "@/components/form/DateInput";

export const Route = createFileRoute('/digit-hr/metrics/$metric')({
  validateSearch: (s: Record<string, unknown>) => metricSearch(s),
  head: ({ params }) => ({ meta: [{ title: `${metricLabel(params.metric) ?? 'Metric'} — DIGIT HR` }, { name: 'description', content: 'Authorized canonical records and source breakdown for this HR metric.' }, { property: 'og:title', content: `${metricLabel(params.metric) ?? 'Metric'} — DIGIT HR` }, { property: 'og:description', content: 'Reconciled HR source records within your permissions.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: MetricRegister,
});
function MetricRegister() {
  useStoreVersion(); useSessionUser();
  const { metric } = Route.useParams(); const scope = Route.useSearch(); const nav = Route.useNavigate(); const { tx } = useTx();
  const label = metricLabel(metric) ?? ''; const defs = HR_METRICS[label]?.() ?? [];
  const display = (s: string) => (METRIC_AR[s] ? tx(METRIC_AR[s], s) : t(s));
  useScopeMetas(['Employee', ...defs.map(d => d.doctype)]);
  const result = hrMetric(label, { ...(scope.company ? { company: scope.company } : {}), ...(scope.from ? { from: scope.from } : {}), ...(scope.to ? { to: scope.to } : {}) });
  const companies = [...new Set(scopedList('Employee').map(d => String(d['company'] ?? '')).filter(Boolean))];
  return <DigitHrLayout title={display(label)} crumbs={[{ label: display(label) }]}>
    {(() => { const r = metricReturn(scope.back); const label = r.to === '/digit-hr' ? tx('→ العودة إلى مركز العمليات بنفس النطاق', '← Back to command center (same scope)') : tx('→ العودة إلى مساحة العمل بنفس النطاق', '← Back to the workspace (same scope)'); return <Link {...r} search={returnScope(scope)} className='mb-3 inline-block text-sm text-primary hover:underline' data-metric-return={scope.back || 'command-center'}>{label}</Link>; })()}
    <div className='mb-4 flex flex-wrap items-end gap-3'>
      <label>{tx('الشركة', 'Company')}<select aria-label={tx('شركة المؤشر', 'Metric company')} className='field-input mt-1' value={scope.company} onChange={e => void nav({ search: { ...scope, company: e.target.value } })}><option value=''>{tx('الكل', 'All')}</option>{companies.map(c => <option key={c} value={c} data-no-i18n>{c}</option>)}</select></label>
      {(['from', 'to'] as const).map(k => <label key={k}>{k === 'from' ? tx('من', 'From') : tx('إلى', 'To')}<DateInput aria-label={k === 'from' ? tx('بداية فترة المؤشر', 'Metric from') : tx('نهاية فترة المؤشر', 'Metric to')} className='field-input mt-1' value={scope[k]} onChange={e => void nav({ search: { ...scope, [k]: e.target.value } })}/></label>)}
      <div className='ms-auto text-2xl font-semibold' data-metric-total={metric} data-no-i18n>{result.value ?? '—'}</div>
    </div>
    {result.value === null && (result.notEvaluated
      ? <p role='status' data-inference='NOT_EVALUATED'>{tx('غير مُقيّم — يتطلب هذا المؤشر سجلات خارج نطاق صلاحياتك، فلا يُستنتج غيابها.', 'Not evaluated — this population needs records outside your permitted scope, so absence is not inferred.')}</p>
      : <p role='status'>{tx('غير متاح — تحقق من صلاحية الوصول وتعريف المؤشر.', 'Unavailable — verify source access and metric definition.')}</p>)}
    {result.sources.map(({ def, result: r }) => { const p = placeDoc(def.doctype); return <section key={def.doctype} className='mb-6' data-metric-source={def.doctype}>
      <div className='mb-2 flex flex-wrap items-center justify-between gap-2'><h2 className='font-semibold'>{t(def.doctype)} <span data-no-i18n>({r.value ?? '—'})</span></h2>{p && r.value !== null && <Link to='/app/$app/$doctype' params={{ app: p.app, doctype: p.slug }} search={{ filters: JSON.stringify([['name', 'in', r.drill.names]]) }} onClick={() => enterHrNative(p.sub)} className='text-primary hover:underline' data-source-register={def.doctype}>{tx('السجل الأصلي', 'Canonical register')} ↗</Link>}</div>
      <div className='max-w-full overflow-x-auto'><table className='w-full text-sm'><thead><tr>{[tx('السجل', 'Record'), tx('الموظف / الموضوع', 'Employee / Subject'), tx('الحالة', 'Status'), tx('التاريخ', 'Date')].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{r.drill.names.map(name => { const d = scopedGet(def.doctype, name); if (!d) return null; return <tr key={name} data-source-id={name}><td>{p ? <Link to='/app/$app/$doctype/$name' params={{ app: p.app, doctype: p.slug, name }} onClick={() => enterHrNative(p.sub)} className='text-primary' data-no-i18n>{name}</Link> : <span data-no-i18n>{name}</span>}</td><td data-no-i18n>{String(d['employee_name'] || d['employee'] || d['subject'] || d['job_applicant'] || '—')}</td><td>{t(String(d['status'] || d['approval_status'] || d['boarding_status'] || (d.docstatus === 1 ? 'Submitted' : 'Draft')))}</td><td data-no-i18n>{String(d[def.date_field ?? 'creation'] ?? '').slice(0,10)}</td></tr>; })}{!r.count && <tr><td colSpan={4}>{r.scope.denied ? tx('غير مصرح', 'Not permitted') : tx('لا توجد سجلات مطابقة', 'No matching records')}</td></tr>}</tbody></table></div>
    </section>; })}
  </DigitHrLayout>;
}