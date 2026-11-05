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
  ['con-risk-matrix', 1330, 748, 1330, 748, 'مصفوفة المخاطر 5×5: توزيع المخاطر النشطة حسب الأثر والاحتمال', '5×5 risk matrix: active risks by impact and likelihood'],
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

// Feature close-ups for the screen mosaics: one card, chart or navigation panel each, cut from the same CRM captures
// (inline up to 1200 px, full up to 2400 px). Same rules: rectangular crop, uniform downscale, nothing edited.
const CRM_TILE_ROWS: Row[] = [
  ['crm2-home-activity', 1200, 276, 2400, 551, 'حجم النشاط اليومي لفريق المبيعات عبر الأيام', 'Daily activity volume for the sales team across the days'],
  ['crm2-nav-home', 1069, 1355, 1069, 1355, 'تنقّل DIGIT CRM: لوحة علاقات العملاء وعملي اليوم ومنصة المدير، بجانب بقية منتجات DIGIT', 'DIGIT CRM navigation: the CRM board, My day and the manager desk, beside the other DIGIT products'],
  ['crm2-leads-funnel', 1200, 286, 2263, 540, 'قمع التأهيل: من كل العملاء المحتملين إلى التواصل والتأهيل والتحويل', 'Qualification funnel: from all leads to contacted, qualified and converted'],
  ['crm2-leads-sources', 1200, 280, 2264, 529, 'العملاء المحتملون حسب المصدر: الموقع وحملات واتساب والترشيح والاتصال المباشر', 'Leads by source: website, WhatsApp campaigns, referrals and direct calls'],
  ['crm2-leads-first-contact', 1200, 352, 2264, 665, 'زمن أول تواصل: كم عميلًا وصلناه خلال ساعة، وكم لم يُتواصل معه بعد', 'Time to first contact: how many leads were reached within an hour, and how many are still waiting'],
  ['crm2-leads-conversion', 1200, 251, 2263, 474, 'التحويل حسب المصدر: أي قناة تجلب العملاء الذين يتحولون فعلًا', 'Conversion by source: which channel brings the leads that actually convert'],
  ['crm2-nav-leads', 809, 918, 809, 918, 'قسم العملاء والتأهيل: العملاء المحتملون وجهات الاتصال والحسابات والعميل 360 وصحة العملاء', 'Leads and qualification menu: leads, contacts, accounts, Customer 360 and customer health'],
  ['crm2-opp-ageing', 1200, 371, 2263, 700, 'خريطة أعمار المراحل: كم صفقة بقيت في كل مرحلة 0–7 و8–14 و15–30 وأكثر من 30 يومًا', 'Stage ageing map: how many deals sat in each stage for 0–7, 8–14, 15–30 and 30+ days'],
  ['crm2-opp-conversion', 1200, 371, 2264, 700, 'معدلات التحويل بين المراحل: من الفتح والتواصل وعرض السعر والتفاوض إلى الإغلاق الناجح', 'Stage-to-stage conversion: from open, contacted, quoted and negotiating to closed won'],
  ['crm2-opp-closings', 1200, 367, 2264, 692, 'الإغلاقات المتوقعة شهرًا بشهر حسب تاريخ الإغلاق المتوقع للصفقات المفتوحة', 'Expected closings month by month from the open deals’ expected close dates'],
  ['crm2-opp-weighted', 1200, 305, 2263, 575, 'القيمة المرجحة حسب المرحلة بالريال، من التفاوض إلى الإغلاق الناجح', 'Weighted value by stage in riyals, from negotiation to closed won'],
  ['crm2-nav-opp', 809, 902, 809, 902, 'قسم الفرص والمبيعات: الفرص والصفقات وخط الأنابيب ولوحة كانبان وعروض الأسعار وأوامر البيع والفواتير', 'Opportunities and sales menu: deals, pipeline, Kanban board, quotations, sales orders and invoices'],
  ['crm2-acc-health', 1200, 309, 2260, 582, 'توزيع صحة الحسابات: السليمة والصامتة من إجمالي حسابات المحفظة', 'Account health split: healthy and quiet accounts across the portfolio'],
  ['crm2-acc-open-opps', 1200, 214, 2260, 403, 'الفرص المفتوحة لكل حساب: أين تتركز الصفقات الجارية بين عملائك', 'Open deals per account: where the live deals sit across your customers'],
  ['crm2-act-daily', 1200, 220, 2400, 440, 'حجم النشاط اليومي: المكالمات والمهام والملاحظات المسجلة كل يوم', 'Daily activity volume: calls, tasks and notes logged each day'],
  ['crm2-act-mix', 868, 656, 868, 656, 'مزيج الأنشطة: المهام والاتصالات والملاحظات من إجمالي النشاط', 'Activity mix: tasks, calls and notes within all activity'],
  ['crm2-act-calls', 868, 688, 868, 688, 'المكالمات حسب النتيجة: مكتمل ولا يوجد رد ومشغول وقائمة الانتظار', 'Calls by outcome: completed, no answer, busy and queued'],
  ['crm2-rep-activity-type', 1200, 326, 2198, 598, 'تقرير الأنشطة حسب النوع مع التصدير إلى CSV', 'Activities by type report with CSV export'],
  ['crm2-nav-reports', 572, 918, 572, 918, 'التقارير والتحليلات: مركز التقارير ولوحات المعلومات وتقارير خط المبيعات والمصادر وأنشطة المندوبين', 'Reports and analytics: report centre, dashboards, and pipeline, source and sales-rep activity reports'],
  ['crm2-exec-cards', 1200, 129, 2400, 257, 'مؤشرات الإدارة العليا: إجمالي خط الأنابيب المفتوح والمسار المرجح ونسبة الفوز وإيراد الصفقات الرابحة', 'Executive indicators: open pipeline, weighted pipeline, win rate and won-deal revenue'],
  ['crm2-exec-health', 1200, 288, 2191, 525, 'توزيع صحة المحفظة كما تراه الإدارة: الحسابات الصامتة مقابل السليمة', 'Portfolio health as management sees it: quiet against healthy accounts'],
];

const toShots = (rows: Row[], inline = '1600'): Record<string, Shot> =>
  Object.fromEntries(
    rows.map(([id, width, height, fullWidth, fullHeight, ar, en]) => [
      id,
      { id, src: url(`${id}-${inline}.webp`), width, height, theme: 0, caption: { ar, en }, full: { src: url(`${id}-full.webp`), width: fullWidth, height: fullHeight } },
    ]),
  );

export const CONSTRUCTION_SHOTS: Record<string, Shot> = toShots(CONSTRUCTION_ROWS);
export const CRM_SHOTS: Record<string, Shot> = { ...toShots(CRM_ROWS), ...toShots(CRM_TILE_ROWS, '1200') };
