/** Scoped relationship registers; native forms own edits, scoring and transitions. */
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { CycleCompletionPanel, SkillsMatrixPanel, TrainingCompletionPanel } from './TalentDepth';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTx } from '@/components/digithr/DigitHrLayout';
import { enterHrNative } from '@/components/digithr/HrNav';
import { WorkTable, type Col, type Group } from '@/components/digithr/EnterpriseRegister';
import { Button } from '@/components/ui/button';
import { type Doc, useStoreVersion } from '@/lib/adapter';
import { cachedMeta } from '@/lib/catalog';
import { formatValue } from '@/lib/format';
import { canReadType, scopedGet, scopedList, useScopeMetas } from '@/plugins/digit_hr/compat/scope';
import { useSessionUser } from '@/plugins/digit_hr/compat/session';
import { readRegister, writeRegister } from '@/plugins/digit_hr/registerState';
import { relatedRows } from '@/plugins/digit_hr/developmentRelations';
import NATIVE from '@/plugins/digit_hr/nativeMap';
import { arLabel, Chip, s } from './shared';
import { NewButton } from '@/components/digithr/SectionTabs';
import { t as tr } from '@/i18n';
import { openQuickView } from '@/components/enterprise/QuickView';
import { isPlainClick } from '@/lib/reportLinks';
import { linkTitle } from '@/lib/linkTitle';
import { Avatar, Pill, type RfTone } from '@/components/enterprise/kit/RecordFrame';
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

export type Field = { key: string; ar: string; en: string; link?: string };
const employee: Field = { key: 'employee', ar: 'الموظف', en: 'Employee', link: 'Employee' };
const company: Field = { key: 'company', ar: 'الشركة', en: 'Company' };
const start: Field = { key: 'start_date', ar: 'من تاريخ', en: 'Start date' };
const end: Field = { key: 'end_date', ar: 'إلى تاريخ', en: 'End date' };
const cycle: Field = { key: 'appraisal_cycle', ar: 'دورة التقييم', en: 'Appraisal cycle', link: 'Appraisal Cycle' };
const event: Field = { key: 'training_event', ar: 'فعالية التدريب', en: 'Training event', link: 'Training Event' };
const status: Field = { key: 'status', ar: 'الحالة', en: 'Status' };

export function ClearContext({ label }: { label: string }) {
  const navigate = useNavigate(); const { tx } = useTx();
  return <Button variant="ghost" size="icon" aria-label={tx('مسح الاختيار', 'Clear selection')} title={tx('مسح الاختيار', 'Clear selection')} onClick={() => void navigate({ to: '.', search: prev => ({ ...prev, hr: writeRegister(prev['hr'], label, { ...readRegister(prev['hr'], label), selected: '' }) }) })}><X className="h-4 w-4" /></Button>;
}

export function RecordLink({ dt, name, section, children }: { dt: string; name: string; section: string; children: ReactNode }) {
  const target = NATIVE[section]?.find(d => d.doctype === dt);
  if (!target || !scopedGet(dt, name)) return <span>{children}</span>;
  // owner SH-02 / CD-02: a plain click opens the shared same-screen quick view («فتح كامل» inside it); a modifier click opens the full page
  return <Link to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: target.app, doctype: target.slug, name }} onClick={(e) => { if (isPlainClick(e)) { e.preventDefault(); openQuickView({ kind: 'doc', doctype: dt, name }, e.currentTarget); return; } enterHrNative(section); }} aria-haspopup="dialog" className="font-medium text-primary hover:underline" data-hr-record-link={dt}>{children}</Link>;
}

/** 360 profile pages a register can link each row to (in addition to the native record link). */
export type ProfileRoute = '/digit-hr/positions/$name' | '/digit-hr/contracts/$name' | '/digit-hr/cases/$name';

/** Guided empty register (NB1-06 / UX-12): says where records come from and offers the native New/register path, never a substitute figure. */
function RegisterEmpty({ dt, section, filtered }: { dt: string; section: string; filtered: boolean }) {
  const { tx } = useTx();
  const target = NATIVE[section]?.find(d => d.doctype === dt);
  return <div className="dhr-empty mx-auto max-w-xl text-start" data-register-empty={dt}>
    <div className="font-medium">{filtered ? tx('لا توجد سجلات مرتبطة بالاختيار الحالي.', 'No records are linked to the current selection.') : tx('لم يُسجَّل شيء هنا بعد.', 'Nothing has been recorded here yet.')}</div>
    <p className="mt-0.5 text-[12px] text-[var(--dhr-muted)]">{tx(`تظهر السجلات هنا عند حفظها في سجل «${tr(dt)}» الأصلي؛ لا يُستنتج أي سجل ولا يُعرض رقم بديل.`, `Records appear here once they are saved in the native ${dt} register; nothing is inferred and no substitute figure is shown.`)}</p>
    {target && <div className="mt-2 flex flex-wrap items-center gap-2"><NewButton d={target} section={section} tx={tx} /><Link to="/app/$app/$doctype" search={HR_DOC_SEARCH as never} params={{ app: target.app, doctype: target.slug }} onClick={() => enterHrNative(section)} className="dhr-link text-[12.5px]">{tx('فتح السجل الأصلي', 'Open the native register')}</Link></div>}
  </div>;
}

/** Colour of a state value (owner HR-01: status pills with colours), from the value's meaning, never invented. */
export function stateTone(v: string): RfTone {
  if (/^(filled|active|approved|submitted|completed|signed|valid|current|open|accepted|paid|enabled|present)$/i.test(v)) return 'ok';
  if (/^(vacant|pending|draft|requested|planned|under review|in review|expiring|awaiting.*|to renew|on leave|scheduled)$/i.test(v)) return 'warn';
  if (/^(cancelled|rejected|expired|terminated|left|overdue|failed|suspended|absent)$/i.test(v)) return 'bad';
  if (/^(frozen|closed|inactive|on hold|archived|disabled|superseded)$/i.test(v)) return 'neutral';
  return 'info';
}
const GROUP_TONE: Record<RfTone, NonNullable<Group['tone']>> = { ok: 'ok', warn: 'warn', bad: 'danger', neutral: 'neutral', info: 'info' };
const STATE_KEY = /(^status$|_status$)/;

export function Register({ dt, section, title, fields, rows, select, selected, groups, groupOf, profile }: { dt: string; section: string; title: string; fields: Field[]; rows?: Doc[]; select?: boolean; selected?: string; groups?: Group[]; groupOf?: (d: Doc) => string; profile?: ProfileRoute }) {
  const { tx, lang } = useTx(); const ar = lang === 'ar';
  const target = NATIVE[section]?.find(d => d.doctype === dt);
  const readable = canReadType(dt);
  const meta = cachedMeta(dt); const metaFields = meta?.fields ?? [];
  const list = rows ?? scopedList(dt);
  // NB1-06/UX-11: a column whose value is identical on every row (e.g. one company in scope) starts hidden; the column chooser still offers it.
  const uniform = (key: string) => key === 'company' && list.length > 0 && list.every(d => s(d[key]) && s(d[key]) === s(list[0]?.[key]));
  const nowrap = (key: string) => /^(Date|Datetime|Time|Int|Float|Currency|Percent)$/.test(metaFields.find(m => m.fieldname === key)?.fieldtype ?? '') ? 'whitespace-nowrap' : undefined;
  // owner HR-01: the register's own state field gives the status strip (counts per state) and coloured pills
  const stateKey = fields.find(f => STATE_KEY.test(f.key) && list.some(d => s(d[f.key])))?.key;
  const stateLabel = (v: string) => tx(arLabel(tr(v)), v);
  const derived: Group[] | undefined = !groups && stateKey ? [...new Set(list.map(d => s(d[stateKey])).filter(Boolean))].sort((a, b) => list.filter(d => s(d[stateKey]) === b).length - list.filter(d => s(d[stateKey]) === a).length)
    .map(v => ({ id: v, ar: arLabel(tr(v)), en: v, tone: GROUP_TONE[stateTone(v)] })) : undefined;
  const strip = groups ?? derived; const stripOf = groups ? groupOf : stateKey ? (d: Doc) => s(d[stateKey]) : undefined;
  const linkName = (link: string, v: string) => link === 'Employee' ? s(scopedGet('Employee', v)?.['employee_name']) || v : linkTitle(link, v) || v;
  const cols: Col<Doc>[] = [
    { key: 'name', ar: 'السجل', en: 'Record', className: 'whitespace-nowrap', sort: d => d.name, render: d => <RecordLink dt={dt} name={d.name} section={section}><span data-no-i18n>{d.name}</span></RecordLink> },
    ...fields.map(f => ({ key: f.key, ar: f.ar, en: f.en, ...(nowrap(f.key) ? { className: 'whitespace-nowrap' } : {}), ...(uniform(f.key) ? { defaultHidden: true } : {}), sort: (d: Doc) => typeof d[f.key] === 'number' ? Number(d[f.key]) : s(d[f.key]), render: (d: Doc) => {
      const value = d[f.key];
      if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
      const fm = metaFields.find(m => m.fieldname === f.key);
      if (f.key === stateKey) return <Pill tone={stateTone(s(value))} attrs={{ 'data-hr-state': s(value) }}><span data-no-i18n>{stateLabel(s(value))}</span></Pill>;
      // names, not codes (owner HR-01 / SH-06): a linked employee shows avatar + name, any other link its record title; the code stays in the tooltip
      const link = f.link ?? (fm?.fieldtype === 'Link' ? fm.options : undefined);
      if (link) {
        const name = linkName(link, s(value)); const text = <span data-no-i18n title={name !== s(value) ? s(value) : undefined}>{tx(arLabel(name), name)}</span>;
        const body = link === 'Employee' ? <span className="inline-flex items-center gap-2"><Avatar name={name} size={28} />{text}</span> : text;
        return f.link ? <RecordLink dt={link} name={s(value)} section={section}>{body}</RecordLink> : body;
      }
      const label = formatValue(fm?.fieldtype ?? 'Data', value, { doc: d, options: fm?.options });
      return <span data-no-i18n>{tx(arLabel(label), label)}</span>;
    } })),
    ...(profile ? [{ key: '__profile', ar: 'الملف 360', en: '360 profile', render: (d: Doc) => <Link to={profile} params={{ name: d.name }} className="text-primary hover:underline" data-profile-link={d.name} aria-label={`${tx('فتح الملف 360', 'Open 360 profile')} ${d.name}`}>{tx('فتح', 'Open')}</Link> }] : []),
    // the document state only for documents that are submitted (a master such as a position has no draft / submitted state)
    ...(meta?.is_submittable ? [{ key: 'docstatus', ar: 'حالة المستند', en: 'Document state', className: 'whitespace-nowrap', sort: (d: Doc) => Number(d.docstatus ?? 0), render: (d: Doc) => { const n = Number(d.docstatus ?? 0); return <Pill tone={n === 2 ? 'bad' : n === 1 ? 'ok' : 'warn'}>{n === 2 ? tx('ملغى', 'Cancelled') : n === 1 ? tx('مُقدَّم', 'Submitted') : tx('مسودة', 'Draft')}</Pill>; } }] : []),
  ];
  return <section className="ek-card min-w-0 space-y-3 p-4" data-development-register={dt}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">{title} <span className="ek-tab-n" data-no-i18n>{list.length}</span></h2>{target && readable && <Button variant="outline" size="sm" asChild><Link to="/app/$app/$doctype" search={HR_DOC_SEARCH as never} params={{ app: target.app, doctype: target.slug }} onClick={() => enterHrNative(section)}>{tx('فتح السجل الكامل', 'Full register')}</Link></Button>}</div>
    {!readable ? <p className="py-4 text-sm text-muted-foreground" role="status">{tx('غير متاح لهذا المستخدم.', 'Not available to this user.')}</p> : <WorkTable<Doc> label={`development-${dt}`} rows={list} cols={cols} tx={tx} rowKey={d => d.name} quick={d => ({ doctype: dt, name: d.name })} {...(strip && stripOf ? { groups: strip, groupOf: stripOf } : {})} {...(select ? { selected: selected ?? '', onSelect: () => undefined } : {})} searchText={d => [d.name, ...fields.map(f => { const v = s(d[f.key]); const fm = metaFields.find(m => m.fieldname === f.key); const link = f.link ?? (fm?.fieldtype === 'Link' ? fm.options : undefined); return link && v ? `${v} ${linkName(link, v)}` : v; })].join(' ')} emptyState={<RegisterEmpty dt={dt} section={section} filtered={!!rows && scopedList(dt).length > 0} />} />}
  </section>;
}

export function PerformanceWorkspace() {
  const { tx } = useTx(); useStoreVersion(); useSessionUser();
  useScopeMetas(['Appraisal Cycle', 'Appraisal', 'Goal', 'Employee Performance Feedback', 'Employee']);
  const search = useRouterState({ select: r => r.location.search });
  const selection = readRegister(search['hr'], 'development-Appraisal Cycle').selected;
  const parent = selection ? scopedGet('Appraisal Cycle', selection) : undefined;
  const children = (dt: string) => relatedRows(scopedList(dt), 'appraisal_cycle', selection, parent);
  return <div className="space-y-6" data-performance-workbench>
    <CycleCompletionPanel tx={tx} />
    <Register dt="Appraisal Cycle" section="02.3" title={tx('دورات التقييم', 'Appraisal cycles')} select selected={selection} fields={[{ key: 'cycle_name', ar: 'اسم الدورة', en: 'Cycle name' }, company, status, start, end]} />
    {selection && <div className="flex items-center gap-2"><ClearContext label="development-Appraisal Cycle" />{!parent && <span role="status">{tx('الاختيار غير متاح.', 'Selection unavailable.')}</span>}</div>}
    {parent && <div className="flex flex-wrap items-center gap-2 border-y border-border py-3" data-cycle-context><span>{tx('دورة التقييم', 'Appraisal cycle')}:</span><RecordLink dt="Appraisal Cycle" name={parent.name} section="02.3"><span data-no-i18n>{s(parent['cycle_name']) || parent.name}</span></RecordLink></div>}
    <Register dt="Appraisal" section="02.3" title={tx('تقييمات الموظفين', 'Employee appraisals')} rows={children('Appraisal')} fields={[employee, cycle, start, end, { key: 'final_score', ar: 'النتيجة النهائية', en: 'Final score' }]} />
    <Register dt="Goal" section="02.3" title={tx('الأهداف', 'Goals')} rows={children('Goal')} fields={[{ key: 'goal_name', ar: 'الهدف', en: 'Goal' }, employee, cycle, { key: 'parent_goal', ar: 'الهدف الأصل', en: 'Parent goal', link: 'Goal' }, status, { key: 'progress', ar: 'التقدم', en: 'Progress' }, end]} />
    <Register dt="Employee Performance Feedback" section="02.3" title={tx('ملاحظات أداء الموظف', 'Employee performance feedback')} rows={children('Employee Performance Feedback')} fields={[employee, cycle, { key: 'reviewer', ar: 'المراجع', en: 'Reviewer' }]} />
  </div>;
}

export function LearningWorkspace() {
  const { tx } = useTx(); useStoreVersion(); useSessionUser();
  useScopeMetas(['Training Program', 'Training Event', 'Training Result', 'Training Feedback', 'Employee']);
  const search = useRouterState({ select: r => r.location.search });
  const programSelection = readRegister(search['hr'], 'development-Training Program').selected;
  const eventSelection = readRegister(search['hr'], 'development-Training Event').selected;
  const program = programSelection ? scopedGet('Training Program', programSelection) : undefined;
  const events = relatedRows(scopedList('Training Event'), 'training_program', programSelection, program);
  const current = events.find(d => d.name === eventSelection);
  const eventNames = new Set(events.map(d => d.name));
  const children = (dt: string) => eventSelection ? relatedRows(scopedList(dt), 'training_event', eventSelection, current) : scopedList(dt).filter(d => !programSelection || eventNames.has(s(d['training_event'])));
  return <div className="space-y-6" data-learning-workbench>
    <SkillsMatrixPanel tx={tx} />
    <TrainingCompletionPanel tx={tx} />
    <Register dt="Training Program" section="02.4" title={tx('برامج التدريب', 'Training programs')} select selected={programSelection} fields={[{ key: 'training_program', ar: 'البرنامج', en: 'Program' }, company, status, { key: 'trainer_name', ar: 'المدرب', en: 'Trainer' }]} />
    {programSelection && <div className="flex items-center gap-2"><ClearContext label="development-Training Program" />{!program && <span role="status">{tx('الاختيار غير متاح.', 'Selection unavailable.')}</span>}</div>}
    {program && <div className="border-y border-border py-3" data-program-context><RecordLink dt="Training Program" name={program.name} section="02.4"><span data-no-i18n>{s(program['training_program']) || program.name}</span></RecordLink></div>}
    <Register dt="Training Event" section="02.4" title={tx('فعاليات التدريب', 'Training events')} rows={events} select selected={current?.name ?? ''} fields={[{ key: 'event_name', ar: 'الفعالية', en: 'Event' }, { key: 'training_program', ar: 'البرنامج', en: 'Program', link: 'Training Program' }, { key: 'event_status', ar: 'الحالة', en: 'Status' }, { key: 'start_time', ar: 'البداية', en: 'Start' }, { key: 'end_time', ar: 'النهاية', en: 'End' }, { key: 'location', ar: 'الموقع', en: 'Location' }]} />
    {current && <div className="border-y border-border py-3" data-event-context><RecordLink dt="Training Event" name={current.name} section="02.4"><span data-no-i18n>{s(current['event_name']) || current.name}</span></RecordLink></div>}
    {eventSelection && <div className="flex items-center gap-2"><ClearContext label="development-Training Event" />{!current && <span role="status">{tx('الاختيار غير متاح.', 'Selection unavailable.')}</span>}</div>}
    <Register dt="Training Result" section="02.4" title={tx('نتائج التدريب', 'Training results')} rows={children('Training Result')} fields={[event]} />
    <Register dt="Training Feedback" section="02.4" title={tx('تقييم التدريب', 'Training feedback')} rows={children('Training Feedback')} fields={[employee, event, { key: 'course', ar: 'الدورة', en: 'Course' }, { key: 'trainer_name', ar: 'المدرب', en: 'Trainer' }]} />
  </div>;
}
