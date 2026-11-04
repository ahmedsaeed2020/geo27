// Genuine DIGIT CRM screens from the owner's isolated demo environment, as supplied in the DIGIT Corporate Profile
// 2026 (pp. 25–26). The banner inside each screen reads "isolated demo environment · simulated data"; every name
// and amount is demo data, never a customer result. Pixels are unchanged.
import type { Shot } from '@/content/product-shots';

const pointers = import.meta.glob<{ url: string }>('/src/assets/crm/*.asset.json', { eager: true, import: 'default' });
const src = (file: string) => pointers[`/src/assets/crm/${file}.asset.json`]?.url ?? '';

export const CRM_SHOTS: Record<string, Shot> = {
  'crm-01-deals': {
    id: 'crm-01-deals',
    src: src('crm-deals-kanban.png'),
    width: 1200,
    height: 675,
    theme: 0,
    caption: {
      ar: 'الصفقات: مؤشرات مسار البيع ولوحة كانبان حسب المرحلة (بيانات تجريبية)',
      en: 'Deals: pipeline indicators and a Kanban board by stage (demo data)',
    },
  },
  'crm-02-manager': {
    id: 'crm-02-manager',
    src: src('crm-manager-workbench.png'),
    width: 1200,
    height: 675,
    theme: 0,
    caption: {
      ar: 'منصة المدير: عملاء غير مسندين ومتابعات متأخرة وأهداف الفريق (بيانات تجريبية)',
      en: 'Manager workbench: unassigned leads, overdue follow-ups and team targets (demo data)',
    },
  },
};

/** Where each CRM screen came from, for the source-to-page mapping. */
export const CRM_SHOT_SOURCE: Record<string, { profilePage: number; file: string }> = {
  'crm-01-deals': { profilePage: 25, file: 'img_p25_2.png' },
  'crm-02-manager': { profilePage: 26, file: 'img_p26_1.png' },
};
