// Real DIGIT Construction and DIGIT CRM screens from the owner's uploads (con.zip, CRM.zip; 2026-11-05). Each shot
// is a rectangular crop of one original capture, uniformly downscaled; nothing inside a crop is edited. Crops keep
// only regions without sample-tenant labels, sign-in addresses or the floating assistant button, so the visible
// names and figures are illustrative records. Boxes are recorded in specialist-shots-provenance.json.
// The CRM screens are the current green DIGIT CRM; the withdrawn captures with the old pink module logos are not
// among them and must never be registered.
import type { Shot } from '@/content/product-shots';

const pointers = import.meta.glob<{ url: string }>(['/src/assets/construction-screens/*.asset.json', '/src/assets/crm-screens/*.asset.json'], { eager: true, import: 'default' });

type Row = [id: string, width: number, height: number, fullWidth: number, fullHeight: number, ar: string, en: string];

const CONSTRUCTION_ROWS: Row[] = [
  ['con-executive-kpis', 1600, 449, 2800, 786, 'مساحة الإدارة العليا: ما يحتاج انتباهك، والمعتمد والمفوتر والمحصل والتكلفة المتوقعة للمحفظة', 'Executive workspace: what needs your attention, plus approved, invoiced, collected and forecast cost for the portfolio'],
  ['con-risk-matrix', 1350, 1236, 1350, 1236, 'مصفوفة المخاطر 5×5: إجمالي التعرض والمخاطر العالية حسب الأثر والاحتمال', '5×5 risk matrix: total exposure and high risks by impact and likelihood'],
  ['con-project-360', 1600, 1168, 2088, 1524, 'ملف المشروع: الإنجاز وتأخر الجدول، ومن العقد إلى النقد، ومن الموازنة إلى التكلفة', 'Project file: progress and schedule delay, contract to cash, and budget to cost'],
  ['con-wbs', 1600, 562, 2800, 984, 'هيكل تجزئة العمل: حزم العمل والمهام المرتبطة بكل عقدة ونسبة إنجازها', 'Work breakdown structure: work packages, linked tasks per node and their progress'],
  ['con-decisions-today', 1600, 429, 2800, 752, 'قرارات اليوم: إصدارات التقدير والأوامر التغييرية بانتظار الاعتماد مع العمر والمسؤول', 'Today’s decisions: estimate versions and change orders awaiting approval, with age and owner'],
  ['con-approval-queue', 1600, 538, 2800, 942, 'بانتظار قرارك: مقدرات وتغييرات وعقود ومراجعات موازنة بانتظار الاعتماد أو التفعيل', 'Awaiting your decision: estimates, changes, contracts and budget revisions pending approval or activation'],
  ['con-cost-sheet', 1600, 1074, 2800, 1880, 'ورقة التكلفة: الموازنة المعدلة والملتزم والفعلي والمتوقع لكل رمز تكلفة، ومنها بنود مقاولي الباطن', 'Cost sheet: revised budget, committed, actual and forecast per cost code, including subcontract lines'],
  ['con-cash-flow', 1600, 736, 2800, 1288, 'التدفق النقدي للمشروع: المقبوضات والمدفوعات المتوقعة أسبوعًا بأسبوع حتى الرصيد الختامي', 'Project cash flow: expected receipts and payments week by week to the closing balance'],
  ['con-cost-cash-chain', 1600, 235, 2800, 412, 'التكلفة مقابل الخطة، وسلسلة النقد من المطالبة إلى التحصيل', 'Cost against plan, and the cash chain from claim to collection'],
  ['con-receivables-ageing', 1600, 267, 2800, 467, 'أعمار الذمم: كم مضى على كل ريال لم يُحصَّل', 'Receivables ageing: how long each unpaid riyal has been outstanding'],
];

const CRM_ROWS: Row[] = [
  ['crm2-home', 1600, 930, 2800, 1627, 'الرئيسية في DIGIT CRM: المتابعات المتأخرة والمستحق اليوم وخط الأنابيب وحجم النشاط اليومي', 'DIGIT CRM home: overdue follow-ups, today’s tasks, the pipeline and daily activity volume'],
  ['crm2-executive', 1600, 520, 2800, 909, 'لوحة الإدارة العليا: خط الأنابيب المفتوح والمسار المرجح ونسبة الفوز وإيراد الصفقات الرابحة', 'Executive dashboard: open pipeline, weighted pipeline, win rate and won-deal revenue'],
  ['crm2-leads', 1600, 384, 2800, 672, 'العملاء والتأهيل: عملاء بلا مسؤول، واتفاقية زمن الاستجابة، وسرعة الوصول، والسجلات المكررة', 'Leads and qualification: unassigned leads, response SLA, time to contact and duplicate records'],
  ['crm2-opportunities', 1600, 611, 2800, 1068, 'الفرص والمبيعات: أعمار المراحل ومعدلات التحويل بينها والصفقات عالية القيمة بلا متابعة', 'Opportunities: stage ageing, stage-to-stage conversion and high-value deals without follow-up'],
  ['crm2-forecast', 1600, 214, 2800, 375, 'القيمة المرجحة حسب المرحلة والإغلاقات المتوقعة شهرًا بشهر', 'Weighted value by stage and expected closings month by month'],
  ['crm2-activities', 1600, 911, 2800, 1594, 'الأنشطة والتواصل: المتابعات المتأخرة ومعدل إنجاز المهام وحجم النشاط والقنوات', 'Activities: overdue follow-ups, task completion, activity volume and channels'],
  ['crm2-accounts-health', 1600, 502, 2800, 878, 'صحة العملاء: الحسابات النشطة والذمم المتأخرة والحسابات المعرضة للخطر وتوزيع الصحة', 'Customer health: active accounts, overdue receivables, accounts at risk and the health split'],
];

const url = (file: string) => {
  const folder = file.startsWith('con-') ? 'construction-screens' : 'crm-screens';
  const pointer = pointers[`/src/assets/${folder}/${file}.asset.json`];
  if (!pointer) throw new Error(`Missing specialist screenshot asset: ${file}`);
  return pointer.url;
};

const toShots = (rows: Row[]): Record<string, Shot> =>
  Object.fromEntries(
    rows.map(([id, width, height, fullWidth, fullHeight, ar, en]) => [
      id,
      { id, src: url(`${id}-1600.webp`), width, height, theme: 0, caption: { ar, en }, full: { src: url(`${id}-full.webp`), width: fullWidth, height: fullHeight } },
    ]),
  );

export const CONSTRUCTION_SHOTS: Record<string, Shot> = toShots(CONSTRUCTION_ROWS);
export const CRM_SHOTS: Record<string, Shot> = toShots(CRM_ROWS);
