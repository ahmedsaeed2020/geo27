// Home product slider (the editable `band` section). Every slide pairs a generated, text-free environment photograph
// with real DIGIT screens from the Pro/HR registries; copy only describes what those screens show.
import type { L, Shot } from '@/content/product-shots';
import { screenById } from '@/content/screens';
import { REPORTS } from '@/content/pro/reports';
import statements1920 from '@/assets/home/slider/statements-1920.webp';
import statements960 from '@/assets/home/slider/statements-960.webp';
import collections1920 from '@/assets/home/slider/collections-1920.webp';
import collections960 from '@/assets/home/slider/collections-960.webp';
import customers1920 from '@/assets/home/slider/customers-1920.webp';
import customers960 from '@/assets/home/slider/customers-960.webp';
import inventory1920 from '@/assets/home/slider/inventory-1920.webp';
import inventory960 from '@/assets/home/slider/inventory-960.webp';
import documents1920 from '@/assets/home/slider/documents-1920.webp';
import documents960 from '@/assets/home/slider/documents-960.webp';
import people1920 from '@/assets/home/slider/people-1920.webp';
import people960 from '@/assets/home/slider/people-960.webp';

export type SlideScene = { large: string; small: string };
export type HomeSlide = {
  id: string;
  /** Catalog product key and department id, attached to a demo request started from this slide. */
  product: 'pro' | 'hr';
  department?: string;
  chip: L;
  short: L;
  title: L;
  lead: L;
  points: L[];
  metric?: { value: number; label: L };
  screen: Shot;
  /** A second real screen shown as a floating detail card, or as a phone when `phone` is set. */
  detail: Shot;
  phone?: boolean;
  /** Magnifies the right-hand (Arabic start) part of a wide detail strip so its text stays legible. */
  detailZoom?: number;
  /** Tall screens drift slowly inside the device so the lower part is seen too. */
  scroll?: boolean;
  scene: SlideScene;
  link: { path: string; label: L };
};

const need = (id: string): Shot => {
  const found = screenById(id);
  if (!found) throw new Error(`Home slider references an unregistered screen: ${id}`);
  return found;
};

export const SLIDER_COPY = {
  eyebrow: 'DIGIT',
  heading: { ar: 'محاسبتك أوضح', en: 'Clearer accounting' },
  sub: { ar: 'ليست موديولات مستقلة — بل أساس أمني وتشغيلي يدعم كل عملية في Digit.', en: 'Not just independent modules—but a security and operational foundation supporting every process in Digit.' },
  region: { ar: 'جولة في شاشات DIGIT الفعلية', en: 'A tour of real DIGIT screens' },
  real: { ar: 'شاشة فعلية من النظام', en: 'Actual product screen' },
  enlarge: { ar: 'تكبير الشاشة', en: 'Enlarge screen' },
  demo: { ar: 'احجز عرضًا توضيحيًا', en: 'Book a demo' },
  prev: { ar: 'الشريحة السابقة', en: 'Previous slide' },
  next: { ar: 'الشريحة التالية', en: 'Next slide' },
  pause: { ar: 'إيقاف التشغيل التلقائي', en: 'Pause autoplay' },
  play: { ar: 'تشغيل تلقائي', en: 'Play autoplay' },
  of: { ar: 'من', en: 'of' },
  slides: { ar: 'اختر الشاشة', en: 'Choose a screen' },
} as const;

/** Verified figures only: 6 catalog families, 5 Pro departments × 4 workspaces, the runnable report list, 50+ customers. */
export const SLIDER_FACTS: { value: number; suffix?: string; label: L }[] = [
  { value: 50, suffix: '+', label: { ar: 'منشأة سعودية', en: 'Saudi businesses' } },
  { value: 6, label: { ar: 'منتجات متخصصة', en: 'specialist products' } },
  { value: 20, label: { ar: 'مساحة عمل في DIGIT Pro', en: 'DIGIT Pro workspaces' } },
  { value: REPORTS.length, label: { ar: 'تقريرًا جاهزًا للتشغيل', en: 'reports ready to run' } },
];

export const HOME_SLIDES: HomeSlide[] = [
  {
    id: 'statements',
    product: 'pro',
    department: 'accounting',
    chip: { ar: 'DIGIT Pro · المحاسبة والتقارير', en: 'DIGIT Pro · Accounting & reporting' },
    short: { ar: 'القوائم المالية', en: 'Financial statements' },
    title: { ar: 'الأرباح والخسائر والمركز المالي والتدفق النقدي… من مصدر واحد', en: 'Profit & loss, financial position and cash flow… from one source' },
    lead: { ar: 'القوائم الثلاث بنفس المصدر والمرشحات والإجماليات. اختر الفترة ومركز التكلفة، احفظ العرض باسمك، ثم صدّر أو اطبع.', en: 'All three statements share the same source, filters and totals. Pick the period and cost center, save the view under a name, then export or print.' },
    points: [
      { ar: 'ثلاث قوائم في شاشة واحدة: الأرباح والخسائر، المركز المالي، التدفق النقدي', en: 'Three statements on one screen: profit & loss, financial position, cash flow' },
      { ar: 'مرشحات الفترة والشركة ومركز التكلفة', en: 'Filters for period, company and cost center' },
      { ar: 'قائمة إقفال الفترة ومراجعة الفروقات قبل الإقفال', en: 'Period-close checklist with variance review before closing' },
    ],
    metric: { value: REPORTS.length, label: { ar: 'تقريرًا جاهزًا للتشغيل في مركز التقارير', en: 'reports ready to run in the report center' } },
    screen: need('09-rep-03-r6'),
    detail: need('01-cfo-04-f11'),
    detailZoom: 1.7,
    scene: { large: statements1920, small: statements960 },
    link: { path: '/modules/reports', label: { ar: 'افتح مركز التقارير', en: 'Open the report center' } },
  },
  {
    id: 'collections',
    product: 'pro',
    department: 'accounting',
    chip: { ar: 'DIGIT Pro · التحصيل والذمم', en: 'DIGIT Pro · Collections & receivables' },
    short: { ar: 'التحصيل', en: 'Collections' },
    title: { ar: 'اعرف مين متأخر، وليه… قبل ما يأثر على السيولة', en: 'Know who is late, and why… before it hits cash' },
    lead: { ar: 'مساحة التحصيل تفصل المتأخر عن الصافي المطلوب تحصيله، وتعرض لكل عميل أقدم استحقاق وعدد الأيام وآخر دفعة.', en: 'The collections workspace separates what is overdue from the net amount to collect, and shows each customer’s oldest due date, days outstanding and last payment.' },
    points: [
      { ar: 'العملاء المتأخرون، والمتأخر، والدفعات غير المخصصة، وصافي المطلوب تحصيله', en: 'Late customers, overdue amount, unallocated payments and net to collect' },
      { ar: 'أقدم استحقاق وعدد الأيام وآخر دفعة لكل عميل', en: 'Oldest due date, days outstanding and last payment per customer' },
      { ar: 'حظر ائتمان بسبب مقروء، وطريقة الإفراج عنه', en: 'A credit hold with a readable reason, and how to release it' },
    ],
    screen: need('02-cash-01-f9'),
    detail: need('02-cash-02-sl6'),
    detailZoom: 1.3,
    scene: { large: collections1920, small: collections960 },
    link: { path: '/modules/accounting', label: { ar: 'استكشف المحاسبة والمالية', en: 'Explore Accounting & Finance' } },
  },
  {
    id: 'customers',
    product: 'pro',
    department: 'selling',
    chip: { ar: 'DIGIT Pro · المبيعات', en: 'DIGIT Pro · Selling' },
    short: { ar: 'العميل 360', en: 'Customer 360' },
    title: { ar: 'ملف العميل 360: الائتمان ودورة البيع والذمم في شاشة واحدة', en: 'Customer 360: credit, the sales cycle and receivables on one screen' },
    lead: { ar: 'من عروض الأسعار والأوامر المفتوحة إلى التسليمات والفواتير وأعمار الذمم. وما لا تملك صلاحيته يظهر «غير مسموح» بدل أن يختفي.', en: 'From quotations and open orders to deliveries, invoices and receivables ageing. Anything outside your permissions shows as “not permitted” instead of disappearing.' },
    points: [
      { ar: 'الائتمان والتعرض لكل عميل', en: 'Credit and exposure for each customer' },
      { ar: 'دورة البيع: عروض وأوامر وتسليمات للفوترة', en: 'The sales cycle: quotations, orders and deliveries to invoice' },
      { ar: 'المتاح والمحجوز والمتوقع على سطر البيع', en: 'Available, reserved and projected stock on the sales line' },
    ],
    screen: need('04-360-01-sl1'),
    detail: need('05-sales-02-sl5'),
    scene: { large: customers1920, small: customers960 },
    link: { path: '/modules/sales', label: { ar: 'استكشف المبيعات', en: 'Explore Selling' } },
  },
  {
    id: 'inventory',
    product: 'pro',
    department: 'inventory',
    chip: { ar: 'DIGIT Pro · المخزون والمستودعات', en: 'DIGIT Pro · Inventory & warehouses' },
    short: { ar: 'المخزون', en: 'Inventory' },
    title: { ar: 'رصيد المخزن هو نفسه اللي في الدفاتر', en: 'Warehouse stock that matches the books' },
    lead: { ar: 'تحليل ABC والدوران والأعمار لكل صنف، ولوحة عمليات لكل مستودع تتابعها حتى من الجوال.', en: 'ABC analysis, turnover and ageing for every item, plus an operations board for each warehouse that you can follow on your phone.' },
    points: [
      { ar: 'تحليل ABC والدوران والأعمار', en: 'ABC analysis, turnover and ageing' },
      { ar: 'لكل مستودع: جاهز للشحن، بانتظار المخزون، متأخر، للاستلام', en: 'Per warehouse: ready to ship, awaiting stock, late, to receive' },
      { ar: 'مطابقة قيمة المخزون مع الأستاذ العام', en: 'Stock value reconciled to the general ledger' },
    ],
    screen: need('07-inv-04-in11'),
    detail: need('07-inv-06-inv-017'),
    phone: true,
    scene: { large: inventory1920, small: inventory960 },
    link: { path: '/modules/inventory', label: { ar: 'استكشف المخزون والمستودعات', en: 'Explore Inventory & Warehouses' } },
  },
  {
    id: 'documents',
    product: 'pro',
    chip: { ar: 'DIGIT Pro · المستند الذكي', en: 'DIGIT Pro · Smart document' },
    short: { ar: 'المستند الذكي', en: 'Smart document' },
    title: { ar: 'كل مستند بيقولك هو فين، ومرتبط بإيه، وليه مش بيترحّل', en: 'Every document tells you where it stands, what it links to and why it can’t post' },
    lead: { ar: 'شريط مراحل واضح، وأزرار للمستندات المرتبطة عليها عدّاد، ولوحة العميل أو المورد داخل المستند نفسه.', en: 'A clear stage strip, related-document buttons with counts, and the customer or supplier panel inside the document itself.' },
    points: [
      { ar: 'شريط مراحل المستند', en: 'Document stage strip' },
      { ar: 'أزرار المستندات المرتبطة وعليها عدّاد', en: 'Related-document buttons with counts' },
      { ar: '«لماذا لا يمكن ترحيله؟» مع السبب', en: '“Why can’t this post?” with the reason' },
    ],
    screen: need('03-doc-01-d1'),
    detail: need('03-doc-04-d5'),
    detailZoom: 1.35,
    scroll: true,
    scene: { large: documents1920, small: documents960 },
    link: { path: '/pro/capabilities', label: { ar: 'استكشف القدرات المتقدمة', en: 'Explore advanced capabilities' } },
  },
  {
    id: 'people',
    product: 'hr',
    chip: { ar: 'DIGIT HR · الموارد البشرية', en: 'DIGIT HR · Human Resources' },
    short: { ar: 'الموارد البشرية', en: 'Human Resources' },
    title: { ar: 'مركز قيادة الموارد البشرية: الأولويات والاعتمادات في مكان واحد', en: 'The HR command center: priorities and approvals in one place' },
    lead: { ar: 'دورة الموظف والقوى العاملة في نظام واحد: من التوظيف والعقود إلى الحضور والإجازات وجاهزية مسير الرواتب.', en: 'The employee and workforce lifecycle in one system: from recruitment and contracts to attendance, leave and payroll run readiness.' },
    points: [
      { ar: 'أولويات الاعتماد والمؤشرات الرئيسية', en: 'Approval priorities and key indicators' },
      { ar: 'ملف الموظف 360 والخط الزمني لدورة العمل', en: 'Employee 360 and the employment lifecycle timeline' },
      { ar: 'دورات الرواتب وجاهزية المسير', en: 'Payroll cycles and run readiness' },
    ],
    screen: need('hr-s01'),
    detail: need('hr-s21'),
    scene: { large: people1920, small: people960 },
    link: { path: '/modules/hr-payroll', label: { ar: 'استكشف DIGIT HR', en: 'Explore DIGIT HR' } },
  },
];
