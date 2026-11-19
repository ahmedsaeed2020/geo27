/** Existing installed HR extension/native records only; no new contract or onboarding policies. */
import { useRouterState } from '@tanstack/react-router';
import { useTx } from '@/components/digithr/DigitHrLayout';
import { useStoreVersion } from '@/lib/adapter';
import { scopedGet, scopedList, useScopeMetas } from '@/plugins/digit_hr/compat/scope';
import { useSessionUser } from '@/plugins/digit_hr/compat/session';
import { relatedRows } from '@/plugins/digit_hr/developmentRelations';
import { readRegister } from '@/plugins/digit_hr/registerState';
import { ClearContext, Register, type Field } from './DevelopmentWorkspace';
import { useSearchPatch } from '@/components/digithr/home/kit';
import type { ContractFilter } from '@/plugins/digit_hr/orgDepth';
import { OnboardingBoard } from './TalentDepth';
import { StatRow } from './shared';
import { CONTRACT_FILTERS, ContractIndicatorsPanel, FilterNote, JobArchitectureMap, MovementPipeline, useContractIndicators } from './OrgDepth';

const employee: Field = { key: 'employee', ar: 'الموظف', en: 'Employee', link: 'Employee' };
const company: Field = { key: 'company', ar: 'الشركة', en: 'Company' };

export function JobArchitectureWorkspace() {
  const { tx } = useTx(); useStoreVersion(); useSessionUser();
  useScopeMetas(['DIGIT Job Family', 'DIGIT Job Profile', 'Designation']);
  const search = useRouterState({ select: r => r.location.search });
  const selected = readRegister(search['hr'], 'development-DIGIT Job Family').selected;
  const parent = selected ? scopedGet('DIGIT Job Family', selected) : undefined;
  const fam = scopedList('DIGIT Job Family').length, prof = scopedList('DIGIT Job Profile').length, des = scopedList('Designation').length;
  return <div className="space-y-6" data-job-architecture>
    <StatRow items={[{ label: tx('العائلات الوظيفية', 'Job families'), value: fam }, { label: tx('الملفات الوظيفية', 'Job profiles'), value: prof }, { label: tx('المسميات الوظيفية', 'Designations'), value: des }]} />
    <JobArchitectureMap tx={tx} />
    <Register dt="DIGIT Job Family" section="01.2" title={tx('العائلات الوظيفية', 'Job families')} select selected={selected} fields={[{ key: 'family_name', ar: 'العائلة', en: 'Family' }, { key: 'parent_family', ar: 'العائلة الأم', en: 'Parent family', link: 'DIGIT Job Family' }]} />
    {selected && <ClearContext label="development-DIGIT Job Family" />}
    <Register dt="DIGIT Job Profile" section="01.2" title={tx('الملفات الوظيفية', 'Job profiles')} rows={relatedRows(scopedList('DIGIT Job Profile'), 'job_family', selected, parent)} fields={[{ key: 'profile_name', ar: 'الملف الوظيفي', en: 'Job profile' }, { key: 'job_family', ar: 'العائلة', en: 'Family', link: 'DIGIT Job Family' }, { key: 'designation', ar: 'المسمى', en: 'Designation', link: 'Designation' }, { key: 'grade_band', ar: 'فئة الدرجة', en: 'Grade band' }]} />
  </div>;
}

export function ContractsWorkspace() {
  const { tx } = useTx(); useStoreVersion(); useSessionUser();
  useScopeMetas(['DIGIT Employment Contract', 'DIGIT Contract Amendment', 'Employee']);
  const search = useRouterState({ select: r => r.location.search });
  const selected = readRegister(search['hr'], 'development-DIGIT Employment Contract').selected;
  const parent = selected ? scopedGet('DIGIT Employment Contract', selected) : undefined;
  const patch = useSearchPatch(); const { ind } = useContractIndicators(tx);
  const cf = CONTRACT_FILTERS.find(f => f.id === (search as Record<string, unknown>)['cf'])?.id as ContractFilter | undefined;
  const filtered = cf ? new Set(ind[cf]) : null;
  return <div className="space-y-6" data-contract-workbench>
    <ContractIndicatorsPanel tx={tx} filter={cf ?? ''} onFilter={f => patch({ cf: f || undefined })} />
    {cf && <FilterNote tx={tx} onClear={() => patch({ cf: undefined })}>{(() => { const f = CONTRACT_FILTERS.find(x => x.id === cf)!; return tx(f.ar, f.en); })()}</FilterNote>}
    <Register dt="DIGIT Employment Contract" section="01.6" title={tx('عقود العمل', 'Employment contracts')} {...(filtered ? { rows: scopedList('DIGIT Employment Contract').filter(c => filtered.has(String(c.name))) } : {})} select selected={selected} profile="/digit-hr/contracts/$name" fields={[employee, company, { key: 'contract_type', ar: 'نوع العقد', en: 'Contract type' }, { key: 'contract_status', ar: 'حالة العقد', en: 'Contract status' }, { key: 'start_date', ar: 'تاريخ البداية', en: 'Start date' }, { key: 'end_date', ar: 'تاريخ النهاية', en: 'End date' }]} />
    {selected && <ClearContext label="development-DIGIT Employment Contract" />}
    <Register dt="DIGIT Contract Amendment" section="01.6" title={tx('مراجعات تعديل العقود', 'Contract amendment reviews')} rows={relatedRows(scopedList('DIGIT Contract Amendment'), 'contract', selected, parent)} fields={[{ key: 'contract', ar: 'العقد', en: 'Contract', link: 'DIGIT Employment Contract' }, { key: 'amendment_type', ar: 'نوع التعديل', en: 'Amendment type' }, { key: 'effective_date', ar: 'تاريخ السريان', en: 'Effective date' }, { key: 'new_end_date', ar: 'النهاية المقترحة', en: 'Proposed end date' }]} />
  </div>;
}

export function OnboardingWorkspace() {
  const { tx } = useTx(); useStoreVersion(); useSessionUser();
  useScopeMetas(['Employee Onboarding', 'Employee Onboarding Template', 'Employee']);
  const rows = [...scopedList('Employee Onboarding')].sort((a, b) => String(a['date_of_joining'] ?? '').localeCompare(String(b['date_of_joining'] ?? '')));
  return <div className="space-y-6" data-onboarding-workbench>
    <OnboardingBoard tx={tx} />
    <Register dt="Employee Onboarding" section="02.2" title={tx('مباشرة العمل والتهيئة', 'Joining and onboarding')} rows={rows} fields={[employee, { key: 'employee_name', ar: 'اسم الموظف', en: 'Employee name' }, company, { key: 'boarding_status', ar: 'حالة التهيئة', en: 'Onboarding status' }, { key: 'date_of_joining', ar: 'تاريخ المباشرة', en: 'Joining date' }, { key: 'boarding_begins_on', ar: 'بدء التهيئة', en: 'Onboarding begins' }, { key: 'employee_onboarding_template', ar: 'القالب', en: 'Template', link: 'Employee Onboarding Template' }]} />
    <Register dt="Employee Onboarding Template" section="02.2" title={tx('قوالب التهيئة', 'Onboarding templates')} fields={[{ key: 'title', ar: 'عنوان القالب', en: 'Template title' }, company, { key: 'department', ar: 'القسم', en: 'Department' }, { key: 'designation', ar: 'المسمى', en: 'Designation' }]} />
  </div>;
}

export function PositionsWorkspace() {
  const { tx } = useTx(); useStoreVersion(); useSessionUser();
  useScopeMetas(['DIGIT Position', 'DIGIT Position Budget', 'Employee', 'Department', 'Designation', 'DIGIT Job Profile']);
  const pos = scopedList('DIGIT Position'); const by = (v: string) => pos.filter(d => String(d['position_status'] ?? '') === v).length;
  const approved = scopedList('DIGIT Position Budget').filter(b => Number(b.docstatus ?? 0) === 1).reduce((a, b) => a + Number(b['approved_headcount'] ?? 0), 0);
  return <div className="space-y-6" data-position-workbench>
    <StatRow items={[{ label: tx('المناصب', 'Positions'), value: pos.length }, { label: tx('مشغولة', 'Filled'), value: by('Filled') }, { label: tx('شاغرة', 'Vacant'), value: by('Vacant'), tone: by('Vacant') ? 'warn' : undefined }, { label: tx('مجمّدة', 'Frozen'), value: by('Frozen') }, { label: tx('العدد المعتمد في الميزانيات', 'Approved headcount in budgets'), value: approved }]} />
    <Register dt="DIGIT Position" section="01.3" title={tx('المناصب وشاغلوها', 'Positions and incumbents')} profile="/digit-hr/positions/$name" fields={[{ key: 'position_title', ar: 'مسمى المنصب', en: 'Position title' }, company, { key: 'department', ar: 'القسم', en: 'Department' }, { key: 'designation', ar: 'المسمى', en: 'Designation' }, { key: 'position_status', ar: 'حالة المنصب', en: 'Position status' }, { key: 'incumbent', ar: 'شاغل المنصب', en: 'Incumbent', link: 'Employee' }, { key: 'effective_from', ar: 'ساري من', en: 'Effective from' }]} />
    <Register dt="DIGIT Position Budget" section="01.3" title={tx('ميزانيات المناصب المسجلة', 'Recorded position budgets')} fields={[{ key: 'budget_title', ar: 'عنوان الميزانية', en: 'Budget title' }, company, { key: 'department', ar: 'القسم', en: 'Department' }, { key: 'from_date', ar: 'من تاريخ', en: 'From date' }, { key: 'to_date', ar: 'إلى تاريخ', en: 'To date' }, { key: 'approved_headcount', ar: 'العدد المعتمد', en: 'Approved headcount' }, { key: 'budget_status', ar: 'حالة الميزانية', en: 'Budget status' }]} />
  </div>;
}

export function MovementsWorkspace() {
  const { tx } = useTx(); useStoreVersion(); useSessionUser();
  useScopeMetas(['Employee Transfer', 'Employee Promotion', 'Employee']);
  const tr = scopedList('Employee Transfer'), pr = scopedList('Employee Promotion'); const all = [...tr, ...pr];
  const st = (k: number) => all.filter(d => Number(d.docstatus ?? 0) === k).length;
  return <div className="space-y-6" data-movement-workbench>
    <StatRow items={[{ label: tx('طلبات النقل', 'Transfers'), value: tr.length }, { label: tx('طلبات الترقية', 'Promotions'), value: pr.length }, { label: tx('بانتظار الاعتماد', 'Awaiting approval'), value: st(0), tone: st(0) ? 'warn' : undefined }, { label: tx('معتمدة ومطبّقة', 'Approved and applied'), value: st(1), tone: 'ok' }]} />
    <MovementPipeline tx={tx} />
    <Register dt="Employee Transfer" section="01.5" title={tx('طلبات النقل', 'Transfer requests')} fields={[employee, company, { key: 'department', ar: 'القسم', en: 'Department' }, { key: 'transfer_date', ar: 'تاريخ النقل', en: 'Transfer date' }]} />
    <Register dt="Employee Promotion" section="01.5" title={tx('طلبات الترقية', 'Promotion requests')} fields={[employee, company, { key: 'department', ar: 'القسم', en: 'Department' }, { key: 'promotion_date', ar: 'تاريخ الترقية', en: 'Promotion date' }]} />
  </div>;
}