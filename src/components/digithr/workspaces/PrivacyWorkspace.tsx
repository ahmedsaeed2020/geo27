/** 07.2 Privacy, Permissions & Audit — read-only review of configured rules. No policy mutation, no effective-ACL claim. */
import { Link } from '@tanstack/react-router';
import { useTx } from '@/components/digithr/DigitHrLayout';
import { WorkTable, type Col } from '@/components/digithr/EnterpriseRegister';
import { useStoreVersion } from '@/lib/adapter';
import { cachedMeta } from '@/lib/catalog';
import { canReadType, scopedList } from '@/plugins/digit_hr/compat/scope';
import { useSessionUser, userPermissions } from '@/plugins/digit_hr/compat/session';
import { isHrAdmin } from '@/plugins/digit_hr/compat/employeeIdentity';
import { translateTo } from '@/i18n';
import { ACTIONS, REVIEW_DOCTYPES, companyRestrictions, inspectRules, reviewRows, summary, type ReviewRow } from '@/plugins/digit_hr/privacyReview';
import { useRouterState } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { useSearchPatch } from '@/components/digithr/home/kit';
import { Chip, Panel, isReady, NotEvaluated, SourceMark, SourceState, useSources } from './shared';
import { HR_DOC_SEARCH, hrSearch } from "@/plugins/digit_hr/product/urls";

const CAT: Record<string, [string, string]> = { personal: ['بيانات شخصية', 'Personal data'], compensation: ['تعويضات', 'Compensation'], payroll: ['رواتب', 'Payroll'], documents: ['وثائق خاصة', 'Private documents'], operational: ['تشغيلي', 'Operational'] };
const FIND: Record<string, [string, string]> = { 'override-source-unavailable': ['مصدر التخصيصات غير متاح', 'Override source unavailable'], 'broad-role-on-sensitive': ['دور عام على بيانات حساسة', 'Broad role on sensitive data'], 'export-on-sensitive': ['تصدير بيانات حساسة', 'Export on sensitive data'], 'delete-on-sensitive': ['حذف بيانات حساسة', 'Delete on sensitive data'], 'metadata-unavailable': ['البيانات الوصفية غير متاحة', 'Metadata unavailable'], 'no-rules': ['لا قواعد مُعرّفة', 'No rules defined'] };

export function PrivacyWorkspace() {
  const { tx } = useTx(); useStoreVersion(); const user = useSessionUser();
  const src = useSources(tx);
  if (!isHrAdmin(user)) return <Panel title={tx('الخصوصية والصلاحيات والتدقيق', 'Privacy, Permissions & Audit')}><div role="alert" data-privacy-denied>{tx('هذه المراجعة متاحة لمسؤولي الموارد البشرية فقط.', 'This review is available to HR administrators only.')}</div></Panel>;
  const metas = Object.fromEntries(REVIEW_DOCTYPES.map(d => [d, cachedMeta(d)]));
  // Every source starts LOADING until its metadata load is attempted, so "unavailable"/"not evaluated" never flash while loading.
  const pending = [...REVIEW_DOCTYPES, 'Custom DocPerm', 'Role', 'User Permission', 'Version'].map(d => src.read(d)).some(r => r.state === 'LOADING');
  const overrides = src.read('Custom DocPerm');
  const overridesAvailable = overrides.state === 'READY_WITH_DATA' || overrides.state === 'READY_EMPTY';
  const rows = reviewRows(metas, overrides.state === 'READY_WITH_DATA' ? overrides.rows : [], overridesAvailable);
  const sum = summary(rows);
  const roles = src.read('Role'); const ups = src.read('User Permission'); const versions = src.read('Version');
  const upRows = ups.state === 'READY_WITH_DATA' ? ups.rows : [];
  const myCompanies = [...(userPermissions(user).get('Company') ?? [])];
  const cols: Col<ReviewRow>[] = [
    { key: 'role', ar: 'الدور', en: 'Role', className: 'whitespace-nowrap font-medium', render: r => <span data-no-i18n>{r.role}</span>, sort: r => r.role },
    { key: 'doctype', ar: 'نوع المستند', en: 'Document type', render: r => tx(translateTo(r.doctype, 'ar'), r.doctype), sort: r => r.doctype },
    { key: 'category', ar: 'الفئة', en: 'Category', render: r => { const c = CAT[r.category] ?? ['', r.category]; return tx(c[0], c[1]); } },
    { key: 'actions', ar: 'الإجراءات المُعدّة', en: 'Configured actions', className: 'min-w-[11rem]', render: r => <span data-no-i18n>{r.actions.join(', ') || '—'}</span> },
    { key: 'scope', ar: 'القيد', en: 'Restriction', render: r => `${r.ifOwner ? tx('المالك فقط', 'Owner only') : '—'} · ${tx('المستوى', 'Level')} ${r.permlevel}` },
    { key: 'company', ar: 'نطاق الشركة', en: 'Company scope', render: r => { if (!isReady(ups)) return <SourceMark read={ups} tx={tx} />; const c = companyRestrictions(upRows, r.doctype); return c.users ? <span data-company-restriction={r.doctype}>{tx(`قيود شركة لـ ${c.users} مستخدم`, `Company-restricted for ${c.users} user(s)`)} <span className="text-[11px] text-[var(--dhr-muted)]" data-no-i18n>{c.companies.join(', ')}</span></span> : <span className="text-xs text-[var(--dhr-muted)]">{tx('لا قيود شركة مقروءة', 'No readable company restriction')}</span>; } },
    { key: 'source', ar: 'المصدر', en: 'Evidence source', render: r => <span data-evidence-source={r.source}>{r.source === 'unavailable' ? tx('غير متاح', 'unavailable') : r.source === 'Custom DocPerm' ? tx('صلاحيات مخصّصة', 'Custom DocPerm') : tx('صلاحيات نوع المستند', 'DocType permissions')}</span> },
    { key: 'status', ar: 'الحالة', en: 'Evaluation', className: 'whitespace-nowrap', render: r => <Chip tone={r.status === 'NOT_EVALUATED' ? 'warn' : 'neutral'}>{r.status === 'NOT_EVALUATED' ? tx('غير مُقيّم', 'Not evaluated') : tx('مُعدّ (غير مُتحقق على الخادم)', 'Configured (not server-verified)')}</Chip> },
    // UX-20: the full explanation is identical per status, so it lives once in the legend above the table; cells stay short.
    { key: 'verify', ar: 'ما تم التحقق منه', en: 'Verification', className: 'whitespace-nowrap', render: r => <span className="text-xs" data-verification={r.status}>{r.status === 'CONFIGURED' ? tx('في المصدر: نعم · على الخادم: لم يُتحقق', 'In source: yes · On server: not verified') : tx('المصدر غير مقروء · لا وصول مفترض', 'Source unreadable · no access assumed')}</span> },
    { key: 'findings', ar: 'ملاحظات المراجعة', en: 'Review findings', render: r => r.findings.length ? r.findings.map(f => <Chip key={f} tone="warn">{tx(...(FIND[f] ?? [f, f]))}</Chip>) : '—' },
     { key: 'review', ar: 'مراجعة المصدر', en: 'Review source', render: r => r.source === 'unavailable' ? '—' : <Link to="/app/$app/$doctype" params={{ app: 'frappe', doctype: r.source === 'Custom DocPerm' ? 'custom_docperm' : 'doctype' }} search={hrSearch({ filters: JSON.stringify([[r.source === 'Custom DocPerm' ? 'parent' : 'name', '=', r.doctype]]) }) as never} className="text-primary hover:underline">{tx('المصدر الأصلي', 'Canonical source')}</Link> },
  ];
  return <div className="space-y-6" data-privacy-workbench>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--dhr-muted)]" data-privacy-context>
      <span>{tx('المراجِع:', 'Reviewer:')} <span data-no-i18n>{user}</span></span>
      <span>{tx('نطاق شركتك:', 'Your company scope:')} <span data-no-i18n data-reviewer-companies>{myCompanies.length ? myCompanies.join(', ') : tx('بدون قيد شركة مُعدّ', 'No configured company restriction')}</span></span>
      <span>{tx('الوضع: قراءة فقط', 'Mode: read-only')}</span>
    </div>
    <p role="note" className="rounded-md border border-border p-3 text-sm">{tx('عرض للقراءة فقط: يعرض القواعد المُعدّة في المصدر ولا يغيّر أي صلاحية. الوصول الفعلي يقرره خادم DIGIT ولم يُتحقق منه هنا.', 'Read-only: shows rules configured in source and changes no access. Effective access is decided by the DIGIT server and is not verified here.')}</p>
    {pending ? <SourceState state={{ state: 'LOADING' }} tx={tx}>{() => null}</SourceState> : <>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-privacy-summary>
      {/* Counts come only from evaluated rows: with nothing evaluated they are "—", never a reassuring 0; partial counts say so. */}
      {([[tx('الأدوار في القواعد', 'Roles in rules'), sum.roles, true], [tx('مصادر قابلة للقراءة', 'Readable rule sources'), sum.sources, true], [tx('ملاحظات مراجعة', 'Review findings'), sum.findings, true], [tx('غير مُقيّم', 'Not evaluated'), sum.unknown, false]] as [string, number, boolean][]).map(([l, v, derived]) => <div key={l} className="dhr-card rounded-[14px] p-3"><div className="text-xs text-[var(--dhr-muted)]">{l}</div>
        <div className="text-xl font-semibold" data-no-i18n>{derived && sum.unknown === rows.length ? <NotEvaluated tx={tx} why={['لم يُقيَّم أي مصدر قابل للقراءة.', 'No readable source was evaluated.']} /> : v}</div>
        {derived && sum.unknown > 0 && sum.unknown < rows.length && <div className="text-[11px] text-[var(--dhr-muted)]" data-partial-count>{tx('من الصفوف المُقيّمة فقط', 'Evaluated rows only')}</div>}</div>)}
    </div>
    <PrivacyInspector rows={rows} tx={tx} />
    <Panel title={tx('مصفوفة مراجعة الصلاحيات', 'Permission review matrix')} hint={tx('الملاحظات فئات مراجعة وليست دليلاً على اختراق.', 'Findings are review categories, not evidence of a breach.')}>
      <p className="mb-3 text-xs text-[var(--dhr-muted)]" data-verification-legend>{tx('«في المصدر: نعم» تعني أن القاعدة موجودة في سجلات الصلاحيات الأصلية؛ «على الخادم: لم يُتحقق» تعني أن الوصول الفعلي وإخفاء الحقول لم يُختبرا على خادم DIGIT. المصدر غير المقروء لا يُفترض معه أي وصول.', '"In source: yes" means the rule exists in the native permission records; "On server: not verified" means effective access and field masking were not tested on a DIGIT server. An unreadable source assumes no access.')}</p>
      <WorkTable label="privacy-matrix" rows={rows} cols={cols} rowKey={r => r.id} tx={tx} searchText={r => `${r.role} ${r.doctype} ${r.actions.join(' ')}`} minWidth={1240}
        groups={[{ id: 'personal', ar: 'شخصية', en: 'Personal' }, { id: 'compensation', ar: 'تعويضات', en: 'Compensation' }, { id: 'payroll', ar: 'رواتب', en: 'Payroll' }, { id: 'documents', ar: 'وثائق', en: 'Documents' }, { id: 'operational', ar: 'تشغيلي', en: 'Operational' }]} groupOf={r => r.category} />
    </Panel></>}
    <div className="grid gap-4 md:grid-cols-3">
      <Panel title={tx('الأدوار', 'Roles')}><SourceState state={roles} tx={tx}>{n => <Link to="/app/$app/$doctype" search={HR_DOC_SEARCH as never} params={{ app: 'frappe', doctype: 'role' }} className="text-primary hover:underline">{tx(`${n} دور`, `${n} roles`)}</Link>}</SourceState></Panel>
      <Panel title={tx('قيود المستخدمين', 'User restrictions')} hint={tx('قيم القيود المرئية لك فقط.', 'Only restrictions visible to you.')}><SourceState state={ups} tx={tx}>{n => <Link to="/app/$app/$doctype" search={HR_DOC_SEARCH as never} params={{ app: 'frappe', doctype: 'user_permission' }} className="text-primary hover:underline">{tx(`${n} قيد`, `${n} restrictions`)}</Link>}</SourceState></Panel>
      <Panel title={tx('سجل التغييرات', 'Change history')} hint={tx('سجلات تغييرات المستندات المسجلة فقط؛ لا أحداث مُختلقة.', 'Recorded Version entries only; no fabricated events.')}><SourceState state={versions} tx={tx}>{() => <ul className="space-y-1 text-sm" data-no-i18n>{scopedList('Version').filter(v => (REVIEW_DOCTYPES as readonly string[]).includes(String(v['ref_doctype']))).slice(-5).reverse().map(v => <li key={v.name}>{String(v['ref_doctype'])} · {String(v['docname'] ?? '')} · {String(v['owner'] ?? '')}</li>)}</ul>}</SourceState></Panel>
    </div>
    <p className="text-xs text-[var(--dhr-muted)]">{tx('يتطلب الخادم: تقييم الوصول الفعلي، سجل الوصول للقراءة، وتدقيق التصدير.', 'Server required: effective access evaluation, read-access logs and export auditing.')} {!canReadType('Custom DocPerm') && <>{tx('سجلات ', '')}<span data-no-i18n>Custom DocPerm</span>{tx(' غير قابلة للقراءة لك.', ' records are not readable for you.')}</>}</p>
  </div>;
}

const ACTION_LABEL: Record<string, [string, string]> = { read: ['قراءة', 'Read'], write: ['تعديل', 'Write'], create: ['إنشاء', 'Create'], delete: ['حذف', 'Delete'], submit: ['اعتماد', 'Submit'], cancel: ['إلغاء', 'Cancel'], export: ['تصدير', 'Export'], print: ['طباعة', 'Print'], share: ['مشاركة', 'Share'] };

/** UX-20: answer "who can do what on this document type" (or "what can this role do") without scanning the full matrix. */
function PrivacyInspector({ rows, tx }: { rows: ReviewRow[]; tx: (ar: string, en: string) => string }) {
  const search = useRouterState({ select: r => r.location.search as Record<string, unknown> }); const patch = useSearchPatch();
  const mode: 'doctype' | 'role' = search['pmode'] === 'role' ? 'role' : 'doctype';
  const roles = [...new Set(rows.filter(r => r.status === 'CONFIGURED').map(r => r.role))].sort();
  const options = mode === 'doctype' ? [...REVIEW_DOCTYPES] : roles;
  const asked = typeof search['pkey'] === 'string' ? search['pkey'] : '';
  const key = options.includes(asked) ? asked : options[0] ?? '';
  const lines = key ? inspectRules(rows, mode, key) : [];
  const notEvaluated = mode === 'doctype' && rows.some(r => r.doctype === key && r.status === 'NOT_EVALUATED');
  return <Panel title={tx('مُستكشف الصلاحيات', 'Permission inspector')} hint={tx('اختر نوع مستند لمعرفة الأدوار وما تسمح به، أو اختر دوراً لمعرفة أنواع المستندات المتاحة له. القواعد المُعدّة فقط.', 'Pick a document type to see which roles hold which actions, or pick a role to see its document types. Configured rules only.')}>
    <div className="mb-3 flex flex-wrap items-center gap-2" data-privacy-inspector={mode}>
      <div className="dhr-seg" role="group" aria-label={tx('طريقة العرض', 'View by')}>
        <Button variant="ghost" size="sm" aria-pressed={mode === 'doctype'} onClick={() => patch({ pmode: undefined, pkey: undefined })}>{tx('حسب نوع المستند', 'By document type')}</Button>
        <Button variant="ghost" size="sm" aria-pressed={mode === 'role'} data-pmode-role onClick={() => patch({ pmode: 'role', pkey: undefined })}>{tx('حسب الدور', 'By role')}</Button>
      </div>
      <select className="field-input" value={key} onChange={e => patch({ pkey: e.target.value || undefined })} aria-label={mode === 'doctype' ? tx('نوع المستند', 'Document type') : tx('الدور', 'Role')} data-privacy-key>
        {options.map(o => <option key={o} value={o}>{mode === 'doctype' ? tx(translateTo(o, 'ar'), o) : o}</option>)}
      </select>
    </div>
    {notEvaluated ? <p className="text-sm" role="status" data-inspector-not-evaluated><NotEvaluated tx={tx} why={['مصدر القواعد غير متاح.', 'Rule source unavailable.']} /> {tx('لم تُقيَّم قواعد هذا النوع — لا يُفترض أي وصول.', 'Rules for this type were not evaluated — no access is assumed.')}</p>
      : lines.length === 0 ? <p className="py-2 text-sm text-[var(--dhr-muted)]">{tx('لا توجد قواعد مُعدّة.', 'No configured rules.')}</p>
      : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-[13px]" data-inspector-table>
        <thead><tr><th className="text-start">{mode === 'doctype' ? tx('الدور', 'Role') : tx('نوع المستند', 'Document type')}</th>{ACTIONS.map(a => <th key={a} className="text-center">{tx(...ACTION_LABEL[a]!)}</th>)}<th>{tx('ملاحظات', 'Notes')}</th></tr></thead>
        <tbody>{lines.map(l => <tr key={l.key} className="border-t" data-inspector-line={l.key}>
          <td className="py-1.5 font-medium">{mode === 'doctype' ? <span data-no-i18n>{l.key}</span> : tx(translateTo(l.key, 'ar'), l.key)}</td>
          {ACTIONS.map(a => <td key={a} className="text-center" data-action={a} data-on={l.actions.has(a) ? 1 : 0}>{l.actions.has(a) ? <span aria-label={tx('مسموح', 'Allowed')} className="text-[var(--dhr-emerald)]">●</span> : <span aria-label={tx('غير مسموح', 'Not allowed')} className="text-[var(--dhr-border)]">·</span>}</td>)}
          <td className="space-x-1 rtl:space-x-reverse">{l.ifOwner && <Chip tone="neutral">{tx('سجلاته فقط', 'Own records only')}</Chip>}{l.permlevels.some(p => p > 0) && <Chip tone="neutral">{tx(`مستوى الحقول ${l.permlevels.join('، ')}`, `Field level ${l.permlevels.join(', ')}`)}</Chip>}{l.findings.map(f => <Chip key={f} tone="warn">{tx(...(FIND[f] ?? [f, f]))}</Chip>)}</td>
        </tr>)}</tbody></table></div>}
  </Panel>;
}
