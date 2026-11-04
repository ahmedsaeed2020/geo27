// Central SEO layer: every content route wraps its head() with withSeo(path, head)
// so canonical, og:url, locale, hreflang and JSON-LD stay consistent site-wide.
import { departmentTrail } from "@/content/catalog";
import { PRO_AREAS } from "@/content/pro/pro-pages";

export const SITE_URL = "https://digit-erp.com";

type MetaTag = { title?: string; name?: string; property?: string; content?: string; charSet?: string };
type Head = { meta?: MetaTag[]; links?: Record<string, string>[]; scripts?: Record<string, string>[] };

const AR_OVERRIDES: Record<string, { title: string; description: string; crumb?: string }> = {
  "/": {
    title: "Digit | نظام ERP سعودي للمحاسبة والمبيعات والمخزون",
    description: "نظام أعمال سعودي سحابي من Digit: محاسبة، مبيعات، مخزون، نقاط بيع وموارد بشرية، مع دعم الربط بمنظومة الفوترة الإلكترونية (فاتورة). يخدم أكثر من 50 منشأة سعودية. احجز عرضًا.",
  },
  "/modules/e-invoicing-zatca": {
    title: "الفوترة الإلكترونية | ربط منظومة فاتورة مع Digit",
    description: "Digit يدعم الربط مع منظومة الفوترة الإلكترونية (فاتورة)، ونجهّز لك الربط حسب احتياج منشأتك. ربط فعلي مستخدم مع عملاء قائمين. ابدأ فواتيرك الإلكترونية بسرعة.",
    crumb: "الفوترة الإلكترونية",
  },
  "/pricing": {
    title: "أسعار Digit | باقات واضحة للشركات السعودية",
    description: "باقات Digit واضحة: Starter للشركات الناشئة مع دفع إلكتروني وتجهيز سريع، وPro للمنشآت الأكبر عبر عرض مخصص. قارن الباقات واطلب السعر المناسب لمنشأتك.",
  },
  "/modules/accounting": {
    title: "نظام محاسبة سعودي | تقارير مالية لحظية من Digit",
    description: "أدر حساباتك وتدفقاتك النقدية مع Digit: شجرة حسابات، فواتير، ضريبة القيمة المضافة، وتقارير أرباح وخسائر لحظية. وضوح مالي كامل لمنشأتك. احجز عرضًا.",
    crumb: "المحاسبة",
  },
  "/modules/pos": {
    title: "نظام نقاط بيع سعودي | POS متكامل من Digit",
    description: "نظام نقاط بيع (POS) من Digit يربط المبيعات بالمخزون والمحاسبة لحظيًا ويدعم فروعك المتعددة. ابدأ نقطة بيعك الأولى واطلب عرضًا.",
    crumb: "نقاط البيع",
  },
  "/modules/inventory": {
    title: "نظام إدارة المخزون والمشتريات | Digit",
    description: "سيطر على مخزونك ومشترياتك مع Digit: متابعة الكميات، أوامر الشراء، وربط المخزون بالمبيعات والمحاسبة لحظيًا لتقليل الهدر. شاهد النظام.",
    crumb: "المخزون",
  },
  "/modules/hr-payroll": {
    title: "نظام موارد بشرية ورواتب | إدارة موظفيك مع Digit",
    description: "أدر موظفيك ورواتبهم وإجازاتهم في نظام واحد مع Digit، مع تقارير واضحة لإدارة الموارد البشرية في منشأتك. احجز عرضًا توضيحيًا.",
    crumb: "الموارد البشرية والرواتب",
  },
  "/about-4": {
    title: "عن Digit | نظام أعمال سعودي سحابي",
    description: "Digit نظام أعمال سعودي سحابي يوحّد المحاسبة والمبيعات والمخزون والموارد البشرية لمنشأتك، بدعم محلي وفريق يفهم السوق السعودي.",
  },
  "/demo": {
    title: "احجز عرضًا توضيحيًا لـ Digit | شاهد النظام حسب إدارتك",
    description: "جولة مخصصة داخل Digit حسب دورك: المالية، المبيعات، المخزون، نقاط البيع أو الموارد البشرية. شاهد كيف يناسب منشأتك. احجز الآن.",
  },
  "/contact-4": {
    title: "تواصل مع Digit | دعم ومبيعات في السعودية",
    description: "تحدّث مع فريق Digit على +966 59 505 1150 أو a.saeed@digit-erp.com، أو اطلب عرضًا توضيحيًا لمنشأتك. دعم محلي بالعربي.",
  },
  // Audit 2026-11-04: titles under 15 characters, descriptions under 70 characters or shared between two pages.
  "/modules": {
    title: "موديولات Digit | المحاسبة والمبيعات والمخزون والموارد البشرية",
    description: "استعرض موديولات Digit في منصة واحدة: المحاسبة والمبيعات والمشتريات والمخزون والأصول ونقاط البيع والموارد البشرية والمقاولات وعلاقات العملاء، مترابطة لحظيًا.",
  },
  "/services-3": {
    title: "خدمات Digit | التحليل والتطبيق وترحيل البيانات والتدريب",
    description: "خدمات Digit لإطلاق نظامك بثقة: جلسة تحليل وتهيئة، تطبيق النظام، ترحيل البيانات، التخصيص، التدريب، تجهيز الفوترة الإلكترونية، الاستضافة والدعم.",
  },
  "/services-3/support": {
    title: "الدعم الفني بالعربي واتفاقية مستوى الخدمة | Digit",
    description: "خدمة الدعم ضمن تشغيل Digit: اتفاقية مستوى خدمة بأوقات استجابة مكتوبة، قنوات تواصل واضحة، ومتابعة كل طلب حتى إغلاقه مع فريق عربي تعرفه بالاسم.",
  },
  "/support": {
    title: "مركز دعم عملاء Digit | تذاكر وقاعدة معرفة عربية",
    description: "مركز دعم عملاء Digit: افتح تذكرة من داخل النظام، وتابع أوقات الاستجابة المكتوبة، واستفد من قاعدة المعرفة العربية وفريق دعم تعرفه بالاسم.",
  },
  "/resources": {
    title: "مركز المعرفة وجولات النظام | DIGIT",
    description: "مركز معرفة Digit: شروحات عملية للمحاسبة والمخزون والتقارير، وجولة في شاشات DIGIT Pro الفعلية تعرّفك على طريقة العمل قبل العرض التوضيحي.",
  },
  "/terms": {
    title: "الشروط والأحكام لاستخدام منصة Digit",
    description: "الشروط والأحكام المنظمة لاستخدام منصة Digit: الحساب والتسجيل، الاشتراك والباقات والدفع، الترخيص، الاستخدام المقبول، وبيانات العميل والخصوصية.",
  },
  "/pos-solutions/florist": {
    title: "نقاط بيع لمحلات الزهور والهدايا | Digit",
    description: "بيع الباقات والورود والهدايا، وطلبات مسبقة للمناسبات، وتتبّع مخزون قصير الصلاحية، وتوصيل مع فاتورة مبسطة، وفق إعدادات النظام.",
  },
};

/** English counterparts where the imported page title or description was too short or shared with another page. */
const EN_OVERRIDES: Record<string, { title: string; description: string; crumb?: string }> = {
  "/demo": {
    title: "Book a Digit Demo | See the System by Department",
    description: "A tailored walkthrough of Digit by role: finance, sales, inventory, point of sale or HR. See how it fits your company and book your session.",
  },
  "/modules": {
    title: "Digit Modules | Accounting, Sales, Inventory, HR and More",
    description: "Explore Digit modules on one platform: accounting, sales, purchasing, inventory, fixed assets, point of sale, HR, construction and CRM, connected in real time.",
  },
  "/modules/crm": {
    title: "DIGIT CRM | From Lead to Deal for Sales Teams",
    description: "Clear sales stages, complete communication logs and follow-ups that never get lost, connected to sales and collections in DIGIT.",
    crumb: "CRM",
  },
  "/modules/pos": {
    title: "Saudi POS System Connected to Inventory | Digit",
    description: "Every sale automatically becomes a compliant invoice, an accounting entry and an inventory deduction, for retail and restaurants across your branches.",
    crumb: "POS",
  },
  "/modules/sales": {
    title: "Sales Management from Quote to Collection | Digit",
    description: "Bilingual quotes, sales orders, compliant invoices and collection tracking, connected to inventory and accounting in Digit.",
    crumb: "Sales",
  },
  "/industries/retail": {
    title: "Retail POS and Multi-Branch Operations | Digit",
    description: "Points of sale connected to inventory and accounting across all your branches, with compliant invoicing and no manual reconciliation.",
  },
  "/pos-solutions/salons": {
    title: "POS for Salons and Beauty Centers | Digit",
    description: "Services and products on one invoice, specialist commissions, packages and repeat customers, and supply inventory, per system settings.",
  },
  "/services-3": {
    title: "Digit Services | Discovery, Implementation, Migration and Training",
    description: "Digit services to launch with confidence: discovery workshop, implementation, data migration, customization, training, e-invoicing onboarding, hosting and support.",
  },
  "/services-3/support": {
    title: "Arabic Support with a Service Level Agreement | Digit",
    description: "Support as part of running Digit: a service level agreement with written response times, clear contact channels, and every request followed to closure.",
  },
  "/support": {
    title: "Digit Customer Support Center | Tickets and Arabic Knowledge Base",
    description: "The Digit customer support center: open tickets from inside the system, follow written response times, and use the Arabic knowledge base and a team you know by name.",
  },
  "/resources": {
    title: "Resources and Product Tours | DIGIT",
    description: "The Digit knowledge center: practical accounting, inventory and reporting explainers, and a tour of real DIGIT Pro screens before your demo.",
  },
  "/terms": {
    title: "Terms and Conditions for Using Digit",
    description: "The terms that govern use of the Digit platform: account and registration, subscriptions, plans and payment, licensing, acceptable use, customer data and privacy.",
  },
};

const HOME_JSONLD = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Digit",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Cloud",
    inLanguage: "ar",
    description: "نظام ERP سعودي سحابي: محاسبة، مبيعات، مخزون، نقاط بيع وموارد بشرية، مع دعم الربط بمنظومة الفوترة الإلكترونية.",
    featureList: ["المحاسبة والتقارير المالية", "المبيعات والعملاء", "إدارة المخزون والمشتريات", "نقاط البيع (POS)", "الموارد البشرية والرواتب", "دعم الربط مع منظومة الفوترة الإلكترونية (فاتورة)"],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      ["ماذا يقدّم نظام Digit؟", "Digit نظام أعمال سعودي سحابي يشمل المحاسبة والمبيعات والمخزون ونقاط البيع والموارد البشرية في منصة واحدة."],
      ["هل يدعم Digit الفوترة الإلكترونية؟", "نعم، يدعم Digit الربط مع منظومة الفوترة الإلكترونية (فاتورة)، ونجهّز لك الربط حسب احتياج منشأتك، ولدينا ربط فعلي مستخدم مع عملاء قائمين."],
      ["كم عدد المنشآت التي تستخدم Digit؟", "يخدم Digit أكثر من 50 منشأة سعودية."],
      ["كيف أبدأ مع باقة Starter؟", "تختار الباقة وتدفع إلكترونيًا عبر Moyasar، ويتم تجهيز نظامك خلال ساعات. أما باقة Pro والمنشآت الأكبر فعبر عرض توضيحي وعرض سعر مخصص."],
    ].map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })),
  },
];

export const ORGANIZATION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Digit",
  url: SITE_URL,
  contactPoint: { "@type": "ContactPoint", telephone: "+966595051150", email: "a.saeed@digit-erp.com", contactType: "sales", availableLanguage: ["Arabic", "English"] },
};

const url = (path: string) => SITE_URL + (path === "/" ? "/" : path);

/** Branded 1200×630 share cards (public/og), used when a page has no share image of its own in the CMS. */
export const SHARE_IMAGES = {
  ar: { url: `${SITE_URL}/og/digit-share-ar.jpg`, alt: "DIGIT — منشأتك كلها في نظام واحد" },
  en: { url: `${SITE_URL}/og/digit-share-en.jpg`, alt: "DIGIT — Your whole company on one system" },
} as const;

function shareImage(own: string | undefined, english: boolean): MetaTag[] {
  if (own?.startsWith("https://")) return [{ property: "og:image", content: own }, { name: "twitter:image", content: own }];
  const card = SHARE_IMAGES[english ? "en" : "ar"];
  return [
    { property: "og:image", content: card.url },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: card.alt },
    { name: "twitter:image", content: card.url },
  ];
}

export function withSeo(path: string, head: Head = {}, records: import('./cms-schema').PublishedRecord[] = []): Head {
  const english = path === "/en" || path.startsWith("/en/");
  const arPath = english ? path.replace(/^\/en/, "") || "/" : path;
  const enPath = arPath === "/" ? "/en" : "/en" + arPath;
  const override = english ? EN_OVERRIDES[arPath] : AR_OVERRIDES[arPath];
  const meta = [...(head.meta ?? [])];
  const get = (key: string) => meta.find(m => m.name === key || m.property === key)?.content;
  const content = records.find(r => r.path===arPath)?.published;
  const localized=content?.[english?'en':'ar'];
  const title = localized?.title || override?.title || meta.find(m => m.title)?.title || "Digit";
  const description = localized?.description || override?.description || get("description") || "";
  const kept = meta.filter(m => !m.title && !["description", "og:title", "og:description", "og:url", "og:locale", "og:type", "twitter:card", "twitter:title", "twitter:description"].includes((m.name ?? m.property) as string));
  const scripts = [...(head.scripts ?? [])];
  const jsonld: object[] = [];
  if (arPath === "/" && !english) jsonld.push(...HOME_JSONLD);
  const trail = departmentTrail(arPath);
  if (trail) {
    // Department pages sit under their product overview: Home › DIGIT Pro › Inventory & Warehouses.
    const lang = english ? "en" : "ar";
    const overview = trail.product.overview;
    jsonld.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: english ? "Home" : "الرئيسية", item: url(english ? "/en" : "/") },
        { "@type": "ListItem", position: 2, name: trail.product.name[lang], item: url(english ? `/en${overview}` : overview) },
        { "@type": "ListItem", position: 3, name: localized?.navLabel || trail.department.label[lang], item: url(path) },
      ],
    });
  } else if (PRO_AREAS.some(a => a.path === arPath)) {
    // Cross-department DIGIT Pro pages: Home › DIGIT Pro › page.
    const area = PRO_AREAS.find(a => a.path === arPath)!;
    jsonld.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: english ? "Home" : "الرئيسية", item: url(english ? "/en" : "/") },
        { "@type": "ListItem", position: 2, name: "DIGIT Pro", item: url(english ? "/en/pro" : "/pro") },
        { "@type": "ListItem", position: 3, name: localized?.navLabel || area.label[english ? "en" : "ar"], item: url(path) },
      ],
    });
  } else if (arPath.startsWith("/modules/")) {
    const crumb = override?.crumb ?? (title.split(/[—|]/)[0] ?? title).trim();
    jsonld.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: english ? "Home" : "الرئيسية", item: url(english ? "/en" : "/") },
        { "@type": "ListItem", position: 2, name: english ? "Modules" : "الموديولات", item: url(english ? "/en/modules" : "/modules") },
        { "@type": "ListItem", position: 3, name: crumb, item: url(path) },
      ],
    });
  }
  for (const item of jsonld) scripts.push({ type: "application/ld+json", children: JSON.stringify(item) });
  return {
    ...head,
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: arPath === "/" ? "website" : "article" },
      { property: "og:url", content: url(path) },
      { property: "og:locale", content: english ? "en_US" : "ar_SA" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      ...(content?.indexable===false ? [{name:'robots',content:'noindex, nofollow'}] : []),
      ...shareImage(content?.ogImage, english),
      ...kept,
    ],
    links: [
      ...(head.links ?? []),
      { rel: "canonical", href: url(content?.canonical || path) },
      { rel: "alternate", hrefLang: "ar", href: url(arPath) },
      { rel: "alternate", hrefLang: "en", href: url(enPath) },
      { rel: "alternate", hrefLang: "x-default", href: url(arPath) },
    ],
    scripts,
  };
}
