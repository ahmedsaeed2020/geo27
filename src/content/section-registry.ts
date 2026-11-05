import { HOME_SHOWCASE } from './product-proof';
import { CAPABILITIES, CHAOS, EXPLORER, FAQ_COPY, FINAL, INDUSTRIES_COPY, JOURNEY, MODULES, PROBLEMS, SAUDI } from './home';
import { orderSections, type SectionLayoutConfig } from '@/lib/site-config-schema';

/**
 * Editable section lists for the Home and Pro pages. Order/visibility and heading overrides are stored in the
 * `home` / `pro` site settings; anything not overridden falls back to the source design and copy.
 */
export type SectionDef = {
  id: string;
  label: string;
  /** Locked sections always render in their source position (heroes, breadcrumb). */
  locked?: boolean;
  /** Source heading; English falls back to the site translation dictionary when omitted. */
  heading?: { ar: string; en?: string };
};

export const HOME_SECTIONS = [
  { id: 'hero', label: 'سلايدر المنتجات الرئيسي (ثابت)', locked: true },
  { id: 'trust', label: 'شريط الثقة' },
  { id: 'layers', label: 'المنصة والتطبيقات والتنفيذ', heading: { ar: 'منصة أعمال. تطبيقات متخصصة. قدرة على التنفيذ.', en: 'A business platform. Specialist applications. The capability to deliver.' } },
  { id: 'explorer', label: 'ابدأ من دورك (الأدوار والأسئلة)', heading: EXPLORER.heading },
  { id: 'journey', label: 'رحلة العمل (أربع زوايا من DIGIT Pro)', heading: JOURNEY.heading },
  { id: 'chaos', label: 'من الفوضى إلى التحكّم (المنتجات الستة)', heading: CHAOS.heading },
  { id: 'band', label: 'سلايدر المنتجات (محاسبتك أوضح)', heading: { ar: 'محاسبتك أوضح' } },
  { id: 'modules', label: 'المنتجات والأقسام', heading: MODULES.heading },
  { id: 'portfolio', label: 'محفظة الحلول (المنتجات الستة والأدوار)', heading: { ar: 'محفظة حلول واحدة… لا باقة واحدة لكل شيء.', en: 'One solution portfolio… not one bundle for everything.' } },
  { id: 'blueprint', label: 'صمّم منظومتك (المخطط التفاعلي)', heading: { ar: 'ارسم منظومتك في دقيقة… ثم احجز العرض عليها', en: 'Sketch your system in a minute… then book the demo on it' } },
  { id: 'showcase', label: 'شاشات النظام الحقيقية', heading: HOME_SHOWCASE.title },
  { id: 'capabilities', label: 'القدرات', heading: CAPABILITIES.heading },
  { id: 'problems', label: 'مشاكل الأنظمة التقليدية', heading: PROBLEMS.heading },
  { id: 'industries', label: 'القطاعات', heading: INDUSTRIES_COPY.heading },
  { id: 'saudi', label: 'التوطين السعودي', heading: SAUDI.heading },
  { id: 'delivery', label: 'التنفيذ والتسليم', heading: { ar: 'التنفيذ ليس تثبيتًا… بل تشغيل مقبول.', en: 'Implementation isn’t an install… it’s accepted operation.' } },
  { id: 'faq', label: 'الأسئلة الشائعة', heading: FAQ_COPY.heading },
  { id: 'cms', label: 'أقسام مضافة من الإدارة' },
  { id: 'lead', label: 'نموذج الطلب' },
  { id: 'final', label: 'الدعوة الختامية', heading: FINAL.heading },
] as const satisfies readonly SectionDef[];

export type HomeSectionId = (typeof HOME_SECTIONS)[number]['id'];

/** Pro sections are keyed by the source container's design class; `showcase` is the real-screens gallery. */
export const PRO_SECTIONS = [
  { id: 'band-crumb', label: 'مسار التنقل (ثابت)', locked: true },
  { id: 'hero', label: 'الواجهة الرئيسية (ثابتة)', locked: true },
  { id: 'features', label: 'ماذا تشمل الباقة' },
  { id: 'departments', label: 'أقسام DIGIT Pro (اختيار القسم)' },
  { id: 'paths', label: 'مسارات: أسئلة المدير المالي والأدوار والتقارير', heading: { ar: 'ابدأ من سؤالك، أو من دورك، أو من التقرير', en: 'Start from your question, your role or the report' } },
  { id: 'showcase', label: 'ماذا تحصل في DIGIT Pro (الشاشات)' },
  { id: 'zatca', label: 'الفوترة الإلكترونية' },
  { id: 'preview', label: 'معاينة النظام' },
  { id: 'fit', label: 'لمن تناسب' },
  { id: 'demoform', label: 'طلب العرض' },
  { id: 'steps', label: 'خطوات البدء' },
  { id: 'faq', label: 'الأسئلة الشائعة' },
  { id: 'cta', label: 'الدعوة الختامية' },
  { id: 'cms', label: 'أقسام مضافة من الإدارة' },
  { id: 'lead', label: 'نموذج الطلب' },
] as const satisfies readonly SectionDef[];

export type ProSectionId = (typeof PRO_SECTIONS)[number]['id'];

export const sectionIds = <T extends readonly SectionDef[]>(defs: T) => defs.map(d => d.id) as unknown as readonly T[number]['id'][];

/** Locked sections stay first and visible; the rest follow the stored order, with new source sections inserted after their source predecessor. */
export function arrangeSections<T extends readonly SectionDef[]>(defs: T, layout: SectionLayoutConfig): { id: T[number]['id']; enabled: boolean; locked: boolean }[] {
  const locked = defs.filter(d => d.locked).map(d => ({ id: d.id as T[number]['id'], enabled: true, locked: true }));
  const movable = orderSections(defs.filter(d => !d.locked).map(d => d.id as T[number]['id']), layout).map(s => ({ ...s, locked: false }));
  return [...locked, ...movable];
}

/** The editable section id of a top-level Pro container (its design class, e.g. "features"). */
export function proSectionIdOf(node: { className: string }): ProSectionId | undefined {
  const classes = node.className.split(' ');
  return PRO_SECTIONS.find(s => classes.includes(s.id))?.id;
}
