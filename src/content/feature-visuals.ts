import type { L } from "@/content/product-shots";
import scenes from "@/content/page-scenes.json";
import signature from "@/assets/features/feature-e-signature.webp.asset.json";
import documents from "@/assets/features/feature-documents.webp.asset.json";
import mfa from "@/assets/features/feature-mfa.webp.asset.json";

/**
 * Visuals for the ten capability rows on /features (owner 2026-11-05: icons alone are not acceptable).
 * Each row mixes a clear photo of the capability in use, a registered real screen, or a designed icon map;
 * captions only restate the row's own bullets. Keyed by the row's visual container id in features.json.
 */
export type FeatureVisual =
  | { kind: "photo"; src: string; width: number; height: number; alt: L; caption: L }
  | { kind: "screen"; id: string; caption?: L }
  | { kind: "icons"; caption: L; items: { icon: "api" | "store" | "payment" | "sync"; label: L }[] };

const scene = scenes as Record<string, { background: string; body: string }>;

export const FEATURE_VISUALS: Record<string, FeatureVisual> = {
  // التوقيع الرقمي
  "797bd3e8": {
    kind: "photo", src: signature.url, width: 1600, height: 1008,
    alt: { ar: "مدير سعودي يوقّع مستندًا إلكترونيًا من جواله", en: "A Saudi manager signing a document electronically on his phone" },
    caption: { ar: "اعتماد المستند من الجوال، مع أثر لمن وقّع ومتى", en: "Approving a document from the phone, with a record of who signed and when" },
  },
  // إدارة المستندات
  "c0ec34f": {
    kind: "photo", src: documents.url, width: 1600, height: 1008,
    alt: { ar: "موظف ينقل ملف مستندات إلى التخزين السحابي", en: "An employee moving a document folder into cloud storage" },
    caption: { ar: "المستندات مرفقة بمعاملاتها ومحفوظة أونلاين", en: "Documents attached to their transactions and stored online" },
  },
  // الصلاحيات والأدوار
  "2182953d": {
    kind: "photo", src: scene["trust-security"].background, width: 1398, height: 864,
    alt: { ar: "دخول مقيّد بالصلاحية إلى منطقة محمية", en: "Role-restricted access to a protected area" },
    caption: { ar: "كل دور يرى ويعدّل ما يخصه فقط، لكل فرع", en: "Each role sees and edits only what is theirs, per branch" },
  },
  // التكاملات و API
  "1b1be329": {
    kind: "icons",
    caption: { ar: "الربط يُحدَّد حسب التكامل المطلوب", en: "Connections are set per integration" },
    items: [
      { icon: "api", label: { ar: "منافذ API", en: "API endpoints" } },
      { icon: "store", label: { ar: "المتاجر الإلكترونية", en: "Online stores" } },
      { icon: "payment", label: { ar: "بوابات الدفع", en: "Payment gateways" } },
      { icon: "sync", label: { ar: "مزامنة البيانات", en: "Data sync" } },
    ],
  },
  // الأمان والتحقق الثنائي
  "5ff1e3ba": {
    kind: "photo", src: mfa.url, width: 1600, height: 1008,
    alt: { ar: "مستخدم يؤكد خطوة دخول ثانية من جواله", en: "A user confirming a second sign-in step on his phone" },
    caption: { ar: "خطوة تحقق ثانية من الجوال قبل الدخول", en: "A second verification step from the phone before signing in" },
  },
  // الذكاء الاصطناعي (مؤشرات لحظية)
  "1e8f8799": { kind: "screen", id: "01-cfo-01-e1" },
  // سحابي أو محلي
  "11d3d984": {
    kind: "photo", src: scene["services-3-hosting"].body, width: 1398, height: 864,
    alt: { ar: "فريق تقني سعودي يراجع خوادم التشغيل", en: "A Saudi technical team reviewing the servers" },
    caption: { ar: "سحابة مُدارة، أو تشغيل محلي على خوادمك", en: "Managed cloud, or on-premise on your own servers" },
  },
  // تعدّد العملات
  "5e0d9af1": { kind: "screen", id: "06-pur-02-pu9" },
  // ثنائية اللغة
  "2f7b13f1": { kind: "screen", id: "hr-s01", caption: { ar: "واجهة عربية كاملة من اليمين لليسار: مركز قيادة الموارد البشرية", en: "A complete right-to-left Arabic interface: the HR command center" } },
  // النسخ الاحتياطي
  "38199eda": {
    kind: "photo", src: scene["trust-security"].body, width: 1398, height: 864,
    alt: { ar: "مهندسان يراجعان النسخ الاحتياطي في غرفة الخوادم", en: "Two engineers reviewing backups in the server room" },
    caption: { ar: "نسخ احتياطي دوري واسترجاع عند الحاجة", en: "Scheduled backups and restore when needed" },
  },
};
