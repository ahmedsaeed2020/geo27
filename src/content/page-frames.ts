import type { L } from "@/content/product-shots";

/**
 * Fills for the imported pages' browser-style frames ("digit-erp.com / app / …") outside the hero.
 * Owner rule (2026-11-05): no page may show an empty or "مثال توضيحي" frame. A frame shows a registered real
 * screen when one matches the section, otherwise the page's own clear contextual photo with a caption that only
 * restates what the page already says. Hero frames are not listed: the hero shows the page photo itself.
 * Keyed by page key, then by the frame container's source node id.
 */
export type FrameFill =
  | { kind: "screen"; id: string; caption?: L }
  | { kind: "photo"; scene: "body"; caption: L };

const photo = (ar: string, en: string): FrameFill => ({ kind: "photo", scene: "body", caption: { ar, en } });
const screen = (id: string): FrameFill => ({ kind: "screen", id });

export const PAGE_FRAMES: Record<string, Record<string, FrameFill>> = {
  "modules-accounting": { "52a74f64": screen("02-cash-01-f9") },
  "modules-sales": { "327cc60d": screen("03-doc-01-d1") },
  "modules-purchasing": { "55f76f04": screen("04-360-05-d9") },
  "modules-inventory": { "16cd87f6": screen("07-inv-04-in11") },
  "modules-fixed-assets": { "662f8df": screen("04-360-04-fa2") },
  "modules-reports": { "7e0c79bb": screen("09-rep-03-r6") },
  "modules-hr-payroll": { "41de371b": screen("hr-s21") },
  "modules-crm": { "48ab7358": photo("فريق المبيعات يتابع الفرص وسجل التواصل من مساحة واحدة", "The sales team follows opportunities and contact history from one workspace") },
  "modules-contracting": { "7292605d": photo("مهندس المشروع يراجع التكلفة والمستخلص مع الإدارة المالية", "The project engineer reviews cost and progress billing with finance") },
  "modules-manufacturing": { "5f0edb70": photo("فحص الجودة على خط الإنتاج قبل إقفال أمر التشغيل", "Quality inspection on the line before a work order is closed") },
  "modules-projects": { "3e0bcefc": photo("مراجعة تكلفة المشروع مقابل الموازنة قبل فوترة المرحلة", "Reviewing project cost against budget before billing a milestone") },
  "modules-pos": { "28c3c141": photo("الكاشير يبيع، والمخزون والحسابات تتحدث في نفس اللحظة", "The cashier sells while stock and accounts update at the same moment") },
  "modules-e-invoicing-zatca": { "297973f6": photo("متابعة الفواتير الإلكترونية وحالتها في مكان واحد", "Tracking e-invoices and their status in one place") },
  "industries-contracting-industry": { "3f50ddc9": photo("متابعة تكاليف المشروع ومشترياته بين الموقع والمكتب", "Following project costs and purchases between site and office") },
  "industries-distribution": { "2a3a6908": screen("04-360-03-in2") },
  "industries-education": { "3eed15b2": screen("01-cfo-01-e1") },
  "industries-healthcare": { "73226fa": screen("07-inv-04-in11") },
  "industries-manufacturing-industry": { "a72b3ad": photo("متابعة أوامر التشغيل وتكلفتها من أرض المصنع", "Following work orders and their cost from the factory floor") },
  "industries-professional-services": { "cff0602": photo("مراجعة ساعات المشروع وفوترة المراحل مع العميل", "Reviewing project hours and milestone billing with the client") },
  "industries-real-estate-2": { "6b96d408": screen("02-cash-01-f9") },
  "industries-retail": { "3d7d6027": photo("كاشير متصل بالمخزون والحسابات في كل فرع", "A till connected to stock and accounts in every branch") },
  "pos-solutions-electrical-appliances": { "2bc98ba3": photo("تسجيل الرقم التسلسلي والضمان عند البيع", "Recording the serial number and warranty at the point of sale") },
  "pos-solutions-florist": { "772769d1": photo("تجهيز الباقة وتسجيل الطلب في فاتورة واحدة", "Preparing the bouquet and recording the order on one invoice") },
  "pos-solutions-furniture": { "1e2fd5fb": photo("اختيار الموديل والخامة وجدولة التوصيل من نقطة البيع", "Choosing model and material and scheduling delivery at the till") },
  "pos-solutions-mobile-shops": { "778ca569": photo("تسجيل IMEI الجهاز والضمان مع الفاتورة", "Recording the device IMEI and warranty with the invoice") },
  "pos-solutions-optical": { "4e549699": photo("النظارة والعدسات والوصفة في طلب واحد عند الكاشير", "Frame, lenses and prescription on one order at the till") },
  "pos-solutions-pharmacies": { "749bef8c": photo("بيع بالباركود مع تتبّع دفعات الأدوية وصلاحيتها", "Barcode sales with medicine batch and expiry tracking") },
  "pos-solutions-restaurants-cafes": { "6ff03753": photo("طلبات الصالة والطاولات تُسجَّل وتُحاسَب من نقطة البيع", "Dine-in and table orders recorded and settled at the till") },
  "pos-solutions-salons": { "656d4286": photo("الخدمات والمنتجات وعمولة الموظف في فاتورة واحدة", "Services, products and staff commission on one invoice") },
  "pos-solutions-sweets": { "1050ca42": photo("بيع بالوزن والقطعة وتسجيل الطلبات المسبقة", "Selling by weight or piece and recording pre-orders") },
};

export const frameFill = (pageKey: string, nodeId: string): FrameFill | undefined => PAGE_FRAMES[pageKey]?.[nodeId];

/** Pages whose body photo already fills a frame, so it is not repeated beside a section heading. */
export const bodyPhotoInFrame = (pageKey: string): boolean =>
  Object.values(PAGE_FRAMES[pageKey] ?? {}).some(fill => fill.kind === "photo");

/** True for a source container that is a browser-style frame (its own child carries the address bar). */
export const isSourceFrame = (node: { type: string; children?: { html?: string }[] }): boolean =>
  node.type === "container" && (node.children ?? []).some(child => (child.html ?? "").includes("digit-erp.com / app /"));
