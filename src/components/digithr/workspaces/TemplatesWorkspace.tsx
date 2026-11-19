/** Native template authoring remains in Core forms; selection only narrows linked records. */
import { useRouterState } from '@tanstack/react-router';
import { useTx } from '@/components/digithr/DigitHrLayout';
import { useStoreVersion } from '@/lib/adapter';
import { scopedGet, scopedList, useScopeMetas } from '@/plugins/digit_hr/compat/scope';
import { useSessionUser } from '@/plugins/digit_hr/compat/session';
import { readRegister } from '@/plugins/digit_hr/registerState';
import { ClearContext, RecordLink, Register } from './DevelopmentWorkspace';
import { s } from './shared';
import { Button } from '@/components/ui/button';
import { useSearchPatch } from '@/components/digithr/home/kit';
import NATIVE from '@/plugins/digit_hr/nativeMap';

/** UX-15: HR-owned document types (every section's native documents + DIGIT HR extensions) — the default template scope. */
const HR_DOCTYPES = new Set(Object.values(NATIVE).flat().map(d => d.doctype));
export const isHrDoctype = (dt: unknown) => typeof dt === 'string' && (HR_DOCTYPES.has(dt) || dt.startsWith('DIGIT '));

export function TemplatesWorkspace() {
  const { tx } = useTx(); useStoreVersion(); useSessionUser();
  useScopeMetas(['Notification', 'Email Template', 'Print Format']);
  const search = useRouterState({ select: r => r.location.search });
  const label = 'development-Notification';
  const selected = readRegister(search['hr'], label).selected;
  const current = selected ? scopedGet('Notification', selected) : undefined;
  const patch = useSearchPatch();
  const all = (search as Record<string, unknown>)['tscope'] === 'all';
  const hrOnly = <T extends Record<string, unknown>>(rows: T[], field: string) => all ? rows : rows.filter(d => isHrDoctype(d[field]));
  // A selected rule shows its own linked templates even when they carry no HR reference type.
  const notifications = hrOnly(scopedList('Notification'), 'document_type');
  // HR-owned templates: their own reference type is an HR document, or an HR notification rule uses them.
  const usedBy = (field: string) => new Set(notifications.map(n => s(n[field])).filter(Boolean));
  const linked = (dt: string, field: string, typeField: string) => selected ? scopedList(dt).filter(d => current && d.name === s(current[field]))
    : all ? scopedList(dt) : scopedList(dt).filter(d => isHrDoctype(d[typeField]) || usedBy(field).has(d.name));
  return <div className="space-y-6" data-templates-workbench>
    <div className="flex flex-wrap items-center gap-2 text-[12.5px]" data-template-scope={all ? 'all' : 'hr'}>
      <span className="text-[var(--dhr-muted)]">{tx('النطاق:', 'Scope:')}</span>
      <div className="dhr-seg" role="group" aria-label={tx('نطاق القوالب', 'Template scope')}>
        <Button variant="ghost" size="sm" aria-pressed={!all} onClick={() => patch({ tscope: undefined })}>{tx('مستندات الموارد البشرية', 'HR documents')}</Button>
        <Button variant="ghost" size="sm" aria-pressed={all} data-tscope-all onClick={() => patch({ tscope: 'all' })}>{tx('كل الوحدات', 'All modules')}</Button>
      </div>
      {!all && <span className="text-[var(--dhr-muted)]">{tx('يعرض القواعد والقوالب المرتبطة بمستندات أقسام الموارد البشرية فقط.', 'Shows only rules and templates tied to HR section documents.')}</span>}
    </div>
    <Register dt="Notification" section="07.3" title={tx('قواعد الإشعارات', 'Notification rules')} rows={notifications} select selected={selected} fields={[
      { key: 'document_type', ar: 'نوع المستند', en: 'Document type' },
      { key: 'channel', ar: 'القناة', en: 'Channel' }, { key: 'event', ar: 'الحدث', en: 'Event' },
      { key: 'enabled', ar: 'مفعّل', en: 'Enabled' }, { key: 'subject', ar: 'الموضوع', en: 'Subject' },
      { key: 'email_template', ar: 'قالب البريد', en: 'Email template', link: 'Email Template' },
      { key: 'print_format', ar: 'قالب الطباعة', en: 'Print format', link: 'Print Format' },
    ]} />
    {selected && <div className="flex flex-wrap items-center gap-2 border-y border-border py-3" data-template-context>
      <ClearContext label={label} />
      {current ? <RecordLink dt="Notification" name={current.name} section="07.3"><span data-no-i18n>{current.name}</span></RecordLink> : <span role="status">{tx('الاختيار غير متاح.', 'Selection unavailable.')}</span>}
    </div>}
    <Register dt="Email Template" section="07.3" title={tx('قوالب البريد الإلكتروني', 'Email templates')} rows={linked('Email Template', 'email_template', 'reference_doctype')} fields={[
      { key: 'subject', ar: 'الموضوع', en: 'Subject' }, { key: 'reference_doctype', ar: 'نوع المستند المرجعي', en: 'Reference document type' },
      { key: 'use_html', ar: 'استخدام HTML', en: 'Use HTML' },
    ]} />
    <Register dt="Print Format" section="07.3" title={tx('قوالب الطباعة', 'Print formats')} rows={linked('Print Format', 'print_format', 'doc_type')} fields={[
      { key: 'doc_type', ar: 'نوع المستند', en: 'Document type' }, { key: 'print_format_for', ar: 'نوع القالب', en: 'Format for' },
      { key: 'standard', ar: 'قياسي', en: 'Standard' }, { key: 'disabled', ar: 'معطّل', en: 'Disabled' },
      { key: 'default_print_language', ar: 'لغة الطباعة', en: 'Print language' },
    ]} />
  </div>;
}