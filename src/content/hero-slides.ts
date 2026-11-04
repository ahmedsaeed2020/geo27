// Home first fold: one slide per product family (owner 2026-11-04). Photographs are generated from the supplied
// Saudi characters (text-free, no logos, no readable screens). Proof is either a registered real screen (Pro, HR) or
// the journey stages the product hub already publishes (Construction, CRM, POS) — never a reconstructed screen.
import type { L, Shot } from '@/content/product-shots';
import { productByKey, type ProductKey } from '@/content/catalog';
import { screenById } from '@/content/screens';
import { REPORTS } from '@/content/pro/reports';
import { CONSTRUCTION_JOURNEY, CRM_JOURNEY } from '@/content/specialist/stories';
import proCfo960 from '@/assets/home/hero/pro-cfo-960.webp';
import proCfo640 from '@/assets/home/hero/pro-cfo-640.webp';
import hrDirector960 from '@/assets/home/hero/hr-director-960.webp';
import hrDirector640 from '@/assets/home/hero/hr-director-640.webp';
import construction960 from '@/assets/home/hero/construction-director-960.webp';
import construction640 from '@/assets/home/hero/construction-director-640.webp';
import crmSales960 from '@/assets/home/hero/crm-sales-960.webp';
import crmSales640 from '@/assets/home/hero/crm-sales-640.webp';
import posRetail960 from '@/assets/home/hero/pos-retail-960.webp';
import posRetail640 from '@/assets/home/hero/pos-retail-640.webp';

const t = (ar: string, en: string): L => ({ ar, en });

export type HeroProof =
  | { kind: 'screen'; screen: Shot }
  | { kind: 'flow'; label: L; steps: L[] };

export type HeroSlide = {
  id: 'pro' | 'hr' | 'construction' | 'crm' | 'pos';
  /** Catalog family attached to a demo request started from this slide. */
  product: ProductKey;
  name: string;
  tag: L;
  title: L;
  lead: L;
  points: L[];
  stat: { value: string; label: L };
  photo: { large: string; small: string; alt: L };
  proof: HeroProof;
  link: { path: string; label: L };
};

const screen = (id: string): HeroProof => {
  const found = screenById(id);
  if (!found) throw new Error(`Home hero references an unregistered screen: ${id}`);
  return { kind: 'screen', screen: found };
};

export const HERO_COPY = {
  brand: t('لمنشأتك في السعودية', 'For your Saudi business'),
  trust: t('أكثر من 50 منشأة سعودية', 'More than 50 Saudi businesses'),
  region: t('منتجات DIGIT', 'DIGIT products'),
  slides: t('اختر المنتج', 'Choose a product'),
  demo: t('احجز عرضًا توضيحيًا', 'Book a demo'),
  real: t('شاشة فعلية من النظام', 'A real system screen'),
  enlarge: t('تكبير الشاشة', 'Enlarge screen'),
  prev: t('المنتج السابق', 'Previous product'),
  next: t('المنتج التالي', 'Next product'),
  pause: t('إيقاف التشغيل التلقائي', 'Pause autoplay'),
  play: t('تشغيل تلقائي', 'Play autoplay'),
  of: t('من', 'of'),
};

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: 'pro',
    product: 'pro',
    name: 'DIGIT Pro',
    tag: t('المالية والعمليات', 'Finance & operations'),
    title: t('من مستند البيع إلى قرار المدير المالي', 'From a sales document to a CFO decision'),
    lead: t(
      'المحاسبة والمبيعات والمشتريات والمخزون والأصول في نظام واحد مترابط، بتقارير جاهزة وشاشات توصلك من الرقم إلى مستنده.',
      'Accounting, sales, purchasing, inventory and fixed assets in one connected system, with ready reports and screens that take you from a figure to its document.',
    ),
    points: [
      t(`${REPORTS.length} تقريرًا جاهزًا للتشغيل`, `${REPORTS.length} reports ready to run`),
      t('لوحات تنفيذية للمدير المالي والإدارة', 'Executive dashboards for the CFO and management'),
      t('متوافق مع متطلبات الفوترة الإلكترونية / المرحلة الثانية', 'Compliant with e-invoicing / Phase 2 requirements'),
    ],
    stat: { value: '20', label: t('مساحة عمل لخمس إدارات', 'workspaces across five departments') },
    photo: { large: proCfo960, small: proCfo640, alt: t('مدير مالي سعودي في مكتبه المطل على الرياض', 'A Saudi CFO in his office overlooking Riyadh') },
    proof: screen('01-cfo-01-e1'),
    link: { path: '/pro', label: t('استكشف DIGIT Pro', 'Explore DIGIT Pro') },
  },
  {
    id: 'hr',
    product: 'hr',
    name: 'DIGIT HR',
    tag: t('الموارد البشرية والرواتب', 'HR & payroll'),
    title: t('فريقك كله… في ملف واحد واضح', 'Your whole team, in one clear record'),
    lead: t(
      'التوظيف والعقود والحضور والإجازات والورديات وجاهزية الرواتب في سبع وحدات مترابطة.',
      'Recruitment, contracts, attendance, leave, shifts and payroll readiness across seven connected modules.',
    ),
    points: [
      t('ملف الموظف 360 بعقوده وحضوره', 'Employee 360 with contracts and attendance'),
      t('قرارات الإجازات وجداول الورديات في مكان واحد', 'Leave decisions and shift schedules in one place'),
      t('جاهزية مسير الرواتب قبل الاعتماد', 'Payroll readiness before approval'),
    ],
    stat: { value: '7', label: t('وحدات مترابطة', 'connected modules') },
    photo: { large: hrDirector960, small: hrDirector640, alt: t('مدير موارد بشرية سعودي في مقر شركته', 'A Saudi HR director at his head office') },
    proof: screen('hr-s16'),
    link: { path: '/modules/hr-payroll', label: t('استكشف DIGIT HR', 'Explore DIGIT HR') },
  },
  {
    id: 'construction',
    product: 'construction',
    name: 'DIGIT Construction',
    tag: t('المقاولات والمشاريع', 'Contracting & projects'),
    title: t('كل مشروع من المقايسة حتى التحصيل', 'Every project, from BOQ to collection'),
    lead: t(
      'المقايسة والعقد والتنفيذ والمستخلص والتحصيل في مسار واحد، مع ملف Project 360 لكل مشروع.',
      'BOQ, contract, execution, claim and collection in one path, with a Project 360 file for every project.',
    ),
    points: [
      t('ملف Project 360 لكل مشروع', 'A Project 360 file for every project'),
      t('المستخلصات وأوامر التغيير وأثرها', 'Claims, variations and their impact'),
      t('التكلفة الفعلية منفصلة عن الملتزم بها', 'Actual cost kept apart from committed cost'),
    ],
    stat: { value: String(CONSTRUCTION_JOURNEY.length), label: t('مراحل من المقايسة إلى التحصيل', 'stages from BOQ to collection') },
    photo: { large: construction960, small: construction640, alt: t('مدير مشاريع سعودي في موقع إنشاء بالرياض', 'A Saudi project director on a Riyadh construction site') },
    proof: { kind: 'flow', label: t('مسار المشروع في DIGIT', 'The project path in DIGIT'), steps: CONSTRUCTION_JOURNEY.map(stage => stage.label) },
    link: { path: '/modules/contracting', label: t('استكشف حلول المقاولات', 'Explore Construction') },
  },
  {
    id: 'crm',
    product: 'crm',
    name: 'DIGIT CRM',
    tag: t('إدارة علاقات العملاء', 'Customer relationships'),
    title: t('من أول تواصل… إلى صفقة رابحة', 'From first contact to a won deal'),
    lead: t(
      'العملاء المحتملون والفرص والمتابعات في مسار واحد، ومنصة لمدير المبيعات تعرض الاستثناءات ونشاط الفريق.',
      'Leads, opportunities and follow-ups in one path, with a manager workbench that shows exceptions and team activity.',
    ),
    points: [
      t('عميل محتمل له مصدر ومالك', 'Every lead has a source and an owner'),
      t('المتابعات المتأخرة والمستحقة اليوم في قائمة واحدة', 'Overdue and due-today follow-ups in one list'),
      t('خط الأنابيب وتحقيق الأهداف لكل مندوب', 'Pipeline and target attainment per rep'),
    ],
    stat: { value: String(CRM_JOURNEY.length), label: t('مراحل من العميل المحتمل إلى التسليم', 'stages from lead to handoff') },
    photo: { large: crmSales960, small: crmSales640, alt: t('مدير مبيعات سعودي في اتصال مع عميل', 'A Saudi sales manager on a call with a client') },
    proof: { kind: 'flow', label: t('مسار العميل في DIGIT', 'The customer path in DIGIT'), steps: CRM_JOURNEY.map(stage => stage.label) },
    link: { path: '/modules/crm', label: t('استكشف DIGIT CRM', 'Explore DIGIT CRM') },
  },
  {
    id: 'pos',
    product: 'pos',
    name: 'DIGIT POS',
    tag: t('نقاط البيع', 'Point of sale'),
    title: t('كل عملية بيع… فاتورة وقيد ومخزون', 'Every sale: an invoice, an entry and a stock update'),
    lead: t(
      'كل عملية بيع تتحوّل تلقائيًا إلى فاتورة متوافقة وقيد محاسبي وخصم مخزون — للتجزئة والمطاعم والأنشطة المتخصصة.',
      'Every sale automatically becomes a compliant invoice, an accounting entry and a stock deduction — for retail, restaurants and specialist trades.',
    ),
    points: [
      t('فاتورة مبسطة برمز QR', 'Simplified invoice with a QR code'),
      t('خصم المخزون لحظة البيع', 'Stock deducted at the moment of sale'),
      t('قيد محاسبي تلقائي لكل عملية', 'An automatic accounting entry for every sale'),
    ],
    stat: { value: String(productByKey('pos')?.solutions.length ?? 0), label: t('أنشطة بحلول جاهزة', 'trades with ready solutions') },
    photo: { large: posRetail960, small: posRetail640, alt: t('موظف مبيعات سعودي يسلّم طلب عميل في متجر', 'A Saudi sales associate handing over an order in a boutique') },
    proof: { kind: 'flow', label: t('من البيع إلى الدفاتر', 'From the till to the books'), steps: [t('بيع على الكاشير', 'Sale at the till'), t('فاتورة مبسطة + QR', 'Simplified invoice + QR'), t('قيد محاسبي', 'Accounting entry'), t('خصم مخزون', 'Stock deduction')] },
    link: { path: '/modules/pos', label: t('استكشف DIGIT POS', 'Explore DIGIT POS') },
  },
];
