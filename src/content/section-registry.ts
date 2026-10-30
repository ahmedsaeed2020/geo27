import { HOME_SHOWCASE } from './product-proof';

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
  { id: 'hero', label: 'الواجهة الرئيسية (ثابتة)', locked: true },
  { id: 'trust', label: 'شريط الثقة' },
  { id: 'explorer', label: 'مستكشف التطبيقات', heading: { ar: 'ابدأ من شغلك، مش من اسم البرنامج', en: 'Start with your work, not a software name' } },
  { id: 'journey', label: 'رحلة العمل', heading: { ar: 'نفس العمل. أربع زوايا أوضح.', en: 'One operation. Four clearer perspectives.' } },
  { id: 'chaos', label: 'من الفوضى إلى التحكّم', heading: { ar: 'من الفوضى… إلى التحكّم' } },
  { id: 'band', label: 'شريط المحاسبة', heading: { ar: 'محاسبتك أوضح' } },
  { id: 'modules', label: 'الموديولات', heading: { ar: 'منصة واحدة… لكل إدارات شركتك' } },
  { id: 'showcase', label: 'شاشات النظام الحقيقية', heading: HOME_SHOWCASE.title },
  { id: 'capabilities', label: 'القدرات', heading: { ar: 'قدرات تمتد عبر النظام كله.' } },
  { id: 'problems', label: 'مشاكل الأنظمة التقليدية', heading: { ar: 'وداعاً لمشاكل الأنظمة التقليدية' } },
  { id: 'industries', label: 'القطاعات', heading: { ar: 'مصمَّم لقطاع عملك' } },
  { id: 'saudi', label: 'التوطين السعودي', heading: { ar: 'جاهز لفاتورة هيئة الزكاة… من اليوم الأول' } },
  { id: 'faq', label: 'الأسئلة الشائعة', heading: { ar: 'أسئلة قبل أن تقرّر — إجابات مباشرة' } },
  { id: 'cms', label: 'أقسام مضافة من الإدارة' },
  { id: 'lead', label: 'نموذج الطلب' },
  { id: 'final', label: 'الدعوة الختامية', heading: { ar: 'جاهز تشوف كيف يناسب النظام شركتك؟' } },
] as const satisfies readonly SectionDef[];

export type HomeSectionId = (typeof HOME_SECTIONS)[number]['id'];

/** Pro sections are keyed by the source container's design class; `showcase` is the real-screens gallery. */
export const PRO_SECTIONS = [
  { id: 'band-crumb', label: 'مسار التنقل (ثابت)', locked: true },
  { id: 'hero', label: 'الواجهة الرئيسية (ثابتة)', locked: true },
  { id: 'features', label: 'ماذا تشمل الباقة' },
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
