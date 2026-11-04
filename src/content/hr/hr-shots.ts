// Real DIGIT HR screenshots from the owner's HR 7-module handoff (16 originals, SHA-256 verified against its
// asset manifest). Derivatives are uniform downscales of the originals; seven drop only the app's top bar
// (crop boxes in hr-shots-provenance.json). Captions describe what each screen actually shows.
// Privacy: the data looks like a demo tenant (digit-demo.test / digit.local); owner confirmation is still
// required before any page that shows these screens is published.
import type { Shot } from '@/content/product-shots';

const pointers = import.meta.glob<{ url: string }>('/src/assets/hr/*.asset.json', { eager: true, import: 'default' });

type Row = [no: string, slug: string, width: number, height: number, fullWidth: number, fullHeight: number, ar: string, en: string];
const ROWS: Row[] = [
  ['S01', 'command-center', 1600, 879, 2800, 1539, 'مركز قيادة الموارد البشرية: أولويات الاعتماد والمؤشرات الرئيسية', 'HR command center: approval priorities and key indicators'],
  ['S06', 'recruitment-register', 1600, 902, 2800, 1578, 'من التوظيف إلى الموظف: سجل المرشحين ومراحلهم', 'From recruitment to employee: the candidate register and its stages'],
  ['S08', 'applicant-file', 1600, 734, 2800, 1285, 'ملف المتقدم والسجلات المرتبطة به في مسار التوظيف', 'Applicant file and its linked recruitment records'],
  ['S09', 'contracts-register', 1600, 879, 2800, 1538, 'مؤشرات العقود وسجل عقود العمل', 'Contract indicators and the employment contract register'],
  ['S10', 'org-structure-explorer', 1600, 900, 2800, 1576, 'مستكشف الهيكل التنظيمي والملاحظات الهيكلية', 'Organization structure explorer with structural notes'],
  ['S13', 'leave-decisions', 1600, 1340, 2800, 2346, 'صندوق قرارات الإجازات والأرصدة', 'Leave decision inbox and balances'],
  ['S16', 'employee-360-timeline', 1600, 881, 2800, 1542, 'ملف الموظف 360: الخط الزمني لدورة العمل', 'Employee 360: the employment lifecycle timeline'],
  ['S17', 'employee-360-contracts', 1600, 881, 2800, 1542, 'ملف الموظف 360: علاقة العمل والعقود', 'Employee 360: employment relationship and contracts'],
  ['S18', 'employee-360-attendance', 1600, 881, 2800, 1542, 'ملف الموظف 360: الحضور والورديات والإجازات', 'Employee 360: attendance, shifts and leave'],
  ['S19', 'leave-entitlements', 1600, 702, 2800, 1228, 'الإجازات والاستحقاقات مع تقويم الفريق', 'Leave and entitlements with the team calendar'],
  ['S20', 'shift-schedule', 1600, 901, 2800, 1577, 'جدول الورديات والعمل الإضافي', 'Shift schedule and overtime'],
  ['S21', 'payroll-readiness', 1600, 975, 2800, 1707, 'دورات الرواتب وجاهزية المسير', 'Payroll cycles and run readiness'],
  ['S26', 'workforce-distribution', 1600, 1014, 2800, 1774, 'أين تتركز القوى العاملة؟ تحليل التوزيع', 'Where is the workforce concentrated? Distribution analysis'],
  ['S27', 'workforce-plans-cost', 1600, 667, 2800, 1168, 'الخطط مقابل القوى العاملة الحالية، مع التكلفة وميزانيات المناصب', 'Plans vs. current workforce, with cost and position budgets'],
  ['S28', 'analytics-reports', 1600, 1243, 2800, 2174, 'التحليلات والتقارير واتجاه القوى العاملة الشهري', 'Analytics and reports with the monthly workforce trend'],
  ['S29', 'setup-governance', 1600, 961, 2800, 1682, 'جاهزية الإعداد حسب المجال ولوحة الحوكمة', 'Setup readiness by domain and the governance board'],
];

const url = (file: string) => {
  const pointer = pointers[`/src/assets/hr/${file}.asset.json`];
  if (!pointer) throw new Error(`Missing HR screenshot asset: ${file}`);
  return pointer.url;
};

export const HR_SHOTS: Record<string, Shot> = Object.fromEntries(
  ROWS.map(([no, slug, width, height, fullWidth, fullHeight, ar, en]) => {
    const id = `hr-${no.toLowerCase()}`;
    const base = `hr-${no.toLowerCase()}-${slug}`;
    return [id, { id, src: url(`${base}-1600.webp`), width, height, theme: 0, caption: { ar, en }, full: { src: url(`${base}-full.webp`), width: fullWidth, height: fullHeight } }];
  }),
);
