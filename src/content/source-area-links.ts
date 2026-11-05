import type { ProductKey } from '@/content/catalog';

/**
 * Cards on imported module pages that describe one product area link to that area's page once it is published
 * (owner 2026-11-05: every CRM module link opens the new area pages). Keyed by page key, then source node id; the
 * source JSON stays untouched and an unpublished area simply renders its card without a link.
 */
export type SourceAreaLink = { product: ProductKey; id: string };

export const SOURCE_AREA_LINKS: Record<string, Record<string, SourceAreaLink>> = {
  'modules-crm': {
    // Proof band
    '6552f47b': { product: 'crm', id: 'opportunities' }, // Pipeline — من فرصة لصفقة
    '3aa7f982': { product: 'crm', id: 'accounts' }, // 360° — سجل العميل
    '29e9aa0c': { product: 'crm', id: 'activities' }, // متابعات — تذكيرات تلقائية
    '687c868a': { product: 'crm', id: 'management' }, // ربط — بالمبيعات والتحصيل
    // "لا فرصة تضيع" capabilities
    'ebb713d': { product: 'crm', id: 'opportunities' }, // مراحل بيع (Pipeline)
    '19e69ee5': { product: 'crm', id: 'accounts' }, // سجل تواصل كامل (ملف العميل)
    '6332eb50': { product: 'crm', id: 'activities' }, // تذكيرات متابعة
    '76d2efcd': { product: 'crm', id: 'opportunities' }, // ربط بالعروض والفواتير
    '1a222615': { product: 'crm', id: 'accounts' }, // شرائح عملاء
    '36d6b68b': { product: 'crm', id: 'activities' }, // متابعة عبر واتساب
    // "من الداخل" copy and the sales-visibility funnel
    '26386229': { product: 'crm', id: 'management' }, // خط أنابيب مبيعات… واضح
    '1855ac63': { product: 'crm', id: 'sales-management' }, // تابع فرصك واحتمالات الإغلاق
    'c65563c': { product: 'crm', id: 'leads' }, // عملاء محتملون
    'bfb60cc': { product: 'crm', id: 'opportunities' }, // فرص
    '633e4a53': { product: 'crm', id: 'opportunities' }, // عروض
    '54d8a73b': { product: 'crm', id: 'sales-management' }, // صفقات
  },
};

export const sourceAreaLink = (pageKey: string, nodeId: string): SourceAreaLink | undefined => SOURCE_AREA_LINKS[pageKey]?.[nodeId];
