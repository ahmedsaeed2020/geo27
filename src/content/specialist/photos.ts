// Photography from the approved DIGIT Corporate Profile 2026 (owner upload 2026-11-04), used as contextual imagery
// on the remaining product hubs, department heroes and corporate pages. Only the photographs are reused: no PDF
// page, headline or overlay text is embedded. Every image was checked for the site rule that any woman shown wears
// a hijab fully covering her hair.
import type { L } from './types';

const pointers = import.meta.glob<{ url: string }>('/src/assets/profile/*.asset.json', { eager: true, import: 'default' });
const url = (name: string) => pointers[`/src/assets/profile/${name}.webp.asset.json`]?.url ?? '';

export type Photo = { key: string; src: string; width: number; height: number; alt: L; profilePage: number };

const P = (key: string, profilePage: number, width: number, height: number, ar: string, en: string): Photo => ({ key, src: url(key), width, height, alt: { ar, en }, profilePage });

export const PHOTOS: Record<string, Photo> = Object.fromEntries(
  [
    P('corporate-model-table', 1, 1920, 1088, 'مسؤول سعودي يراجع مجسمًا لمنشآت شركة متعددة الأنشطة', 'A Saudi executive reviewing a model of a multi-site business'),
    P('workflow-whiteboard', 2, 1024, 1280, 'مستشار يشرح مسار عمل مؤسسة على لوحة الحائط', 'A consultant walking through an organization’s workflow on a wall board'),
    P('departments-cross-section', 3, 1920, 1088, 'منظر علوي لمكاتب إدارات مختلفة تفصل بينها فجوات', 'Top-down view of separate department offices divided by gaps'),
    P('construction-levels', 21, 1920, 1088, 'مبنى قيد الإنشاء يظهر فيه كل طابق بمرحلة مختلفة من المشروع', 'A building under construction with each floor at a different project stage'),
    P('construction-aerial', 22, 1920, 1088, 'منظر جوي لموقع مشروع إنشائي بمناطق عمل متعددة', 'Aerial view of a construction site with several work zones'),
    P('construction-change-review', 23, 1920, 1088, 'مهندسان سعوديان يراجعان المخططات في الموقع', 'Two Saudi engineers reviewing drawings on site'),
    P('construction-measurement', 24, 1920, 1088, 'مهندس يقيس الأعمال المنفذة بشريط القياس في الموقع', 'An engineer measuring completed work on site with a tape'),
    P('crm-sales-call', 25, 1024, 1280, 'مدير مبيعات يتابع عميلًا عبر الهاتف', 'A sales manager following up with a customer by phone'),
    P('pos-counter', 27, 1920, 1088, 'كاشير يسلّم مشتريات لعميلة عند نقطة البيع في متجر عطور', 'A cashier handing a purchase to a customer at a perfume store counter'),
    P('pos-retail-arcade', 28, 1024, 1280, 'ممر تجاري سعودي بمتاجر متنوعة في المساء', 'A Saudi retail arcade with a variety of stores in the evening'),
    P('fsm-rooftop-technician', 29, 1920, 1088, 'فني خدمة يراجع جهاز تكييف مركزي على سطح مبنى في الرياض', 'A service technician checking rooftop air-conditioning units in Riyadh'),
    P('fsm-inspection', 30, 1024, 1280, 'فنيان يفحصان جهاز إنذار في ممر مبنى', 'Two technicians inspecting a detector in a building corridor'),
    P('implementation-workshop', 33, 1920, 1088, 'جلسة اكتشاف مع فريق العميل لتحديد نطاق التنفيذ', 'A discovery session with the customer team to define the implementation scope'),
    P('trilogy-infrastructure', 34, 1920, 1088, 'مسؤولان في غرفة الخوادم يراجعان البنية التقنية', 'Two specialists reviewing infrastructure in a server room'),
    P('next-step-boardroom', 36, 1024, 1280, 'قاعة اجتماعات جاهزة لجلسة اكتشاف', 'A meeting room set for a discovery session'),
    P('role-training', 20, 1024, 1280, 'مدربة بحجاب تشرح سيناريو عمل لفريق', 'A trainer in a hijab walking a team through a work scenario'),
  ].map(p => [p.key, p]),
);

export const photo = (key: string): Photo | undefined => PHOTOS[key];
