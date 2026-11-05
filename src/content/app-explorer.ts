import { HR_INDEX } from './hr/hr-index';
import { SPECIALIST_INDEX } from './specialist/index-data';
import { specialistPath } from './specialist/registry';

export type App = { path: string; ar: string; en: string; group: string; role: string; problem: string; industry: string };

const CORE: App[] = [
 {path:'/modules/accounting',ar:'المحاسبة والمالية',en:'Accounting & finance',group:'finance',role:'CFO',problem:'close',industry:'all'},
 {path:'/modules/reports',ar:'التقارير ومؤشرات الإدارة',en:'Reports & management indicators',group:'finance',role:'CFO',problem:'visibility',industry:'all'},
 {path:'/modules/fixed-assets',ar:'دورة حياة الأصول',en:'Asset lifecycle',group:'finance',role:'Controller',problem:'close',industry:'all'},
 {path:'/modules/sales',ar:'المبيعات وملف العميل',en:'Sales & customer profile',group:'operations',role:'Sales',problem:'collections',industry:'distribution'},
 {path:'/modules/purchasing',ar:'المشتريات والموردون',en:'Purchasing & suppliers',group:'operations',role:'Buyer',problem:'visibility',industry:'distribution'},
 {path:'/modules/inventory',ar:'المخزون والمستودعات',en:'Inventory & warehouses',group:'operations',role:'Warehouse',problem:'availability',industry:'distribution'},
 {path:'/modules/pos',ar:'نقاط البيع',en:'Point of sale',group:'operations',role:'Sales',problem:'collections',industry:'retail'},
 {path:'/pro',ar:'DIGIT Pro',en:'DIGIT Pro',group:'products',role:'CFO',problem:'visibility',industry:'all'},
 {path:'/starter',ar:'DIGIT Starter',en:'DIGIT Starter',group:'products',role:'Owner',problem:'visibility',industry:'all'},
];

// Every HR module and every Construction/CRM/FSM department has its own detail page, listed here from the same registries.
const SPECIALIST_ROLE: Record<string, string> = { construction: 'Projects', crm: 'Sales', fsm: 'Service' };
const DEPARTMENT_APPS: App[] = [
  ...HR_INDEX.map(m => ({ path: `/hr/${m.slug}`, ar: m.label.ar, en: m.label.en, group: 'hr', role: 'HR', problem: 'people', industry: 'all' })),
  ...SPECIALIST_INDEX.filter(d => d.product === 'construction').map(d => ({ path: specialistPath(d), ar: d.label.ar, en: d.label.en, group: d.product, role: SPECIALIST_ROLE[d.product] ?? 'Owner', problem: d.product === 'construction' ? 'projects' : 'visibility', industry: d.product === 'construction' ? 'contracting' : 'all' })),
];

export const APPS: App[] = [...CORE, ...DEPARTMENT_APPS];