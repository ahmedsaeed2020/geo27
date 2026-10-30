export const APPS = [
 {path:'/modules/accounting',ar:'المحاسبة والمالية',en:'Accounting & finance',group:'finance',role:'CFO',problem:'close',industry:'all'},
 {path:'/modules/reports',ar:'التقارير ومؤشرات الإدارة',en:'Reports & management indicators',group:'finance',role:'CFO',problem:'visibility',industry:'all'},
 {path:'/modules/fixed-assets',ar:'دورة حياة الأصول',en:'Asset lifecycle',group:'finance',role:'Controller',problem:'close',industry:'all'},
 {path:'/modules/sales',ar:'المبيعات وملف العميل',en:'Sales & customer profile',group:'operations',role:'Sales',problem:'collections',industry:'distribution'},
 {path:'/modules/purchasing',ar:'المشتريات والموردون',en:'Purchasing & suppliers',group:'operations',role:'Buyer',problem:'visibility',industry:'distribution'},
 {path:'/modules/inventory',ar:'المخزون والمستودعات',en:'Inventory & warehouses',group:'operations',role:'Warehouse',problem:'availability',industry:'distribution'},
 {path:'/modules/pos',ar:'نقاط البيع',en:'Point of sale',group:'operations',role:'Sales',problem:'collections',industry:'retail'},
 {path:'/pro',ar:'DIGIT Pro',en:'DIGIT Pro',group:'products',role:'CFO',problem:'visibility',industry:'all'},
 {path:'/starter',ar:'DIGIT Starter',en:'DIGIT Starter',group:'products',role:'Owner',problem:'visibility',industry:'all'},
] as const;