// Central SEO layer: every content route wraps its head() with withSeo(path, head)
// so canonical, og:url, locale, hreflang and JSON-LD stay consistent site-wide.
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
    description: "أدر موظفيك ورواتبهم وإجازاتهم في نظام واحد مع Digit، مع تقارير واضحة لإدارة الموارد البشرية في منشأتك. احجز عرضًا تجريبيًا.",
    crumb: "الموارد البشرية والرواتب",
  },
  "/about-4": {
    title: "عن Digit | نظام أعمال سعودي سحابي",
    description: "Digit نظام أعمال سعودي سحابي يوحّد المحاسبة والمبيعات والمخزون والموارد البشرية لمنشأتك، بدعم محلي وفريق يفهم السوق السعودي.",
  },
  "/demo": {
    title: "احجز عرضًا تجريبيًا لـ Digit | شاهد النظام حسب إدارتك",
    description: "جولة مخصصة داخل Digit حسب دورك: المالية، المبيعات، المخزون، نقاط البيع أو الموارد البشرية. شاهد كيف يناسب منشأتك. احجز الآن.",
  },
  "/contact-4": {
    title: "تواصل مع Digit | دعم ومبيعات في السعودية",
    description: "تحدّث مع فريق Digit على +966 59 505 1150 أو a.saeed@digit-erp.com، أو اطلب عرضًا تجريبيًا لمنشأتك. دعم محلي بالعربي.",
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
      ["كيف أبدأ مع باقة Starter؟", "تختار الباقة وتدفع إلكترونيًا عبر Moyasar، ويتم تجهيز نظامك خلال ساعات. أما باقة Pro والمنشآت الأكبر فعبر عرض تجريبي وعرض سعر مخصص."],
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

export function withSeo(path: string, head: Head = {}): Head {
  const english = path === "/en" || path.startsWith("/en/");
  const arPath = english ? path.replace(/^\/en/, "") || "/" : path;
  const enPath = arPath === "/" ? "/en" : "/en" + arPath;
  const override = english ? undefined : AR_OVERRIDES[arPath];
  const meta = [...(head.meta ?? [])];
  const get = (key: string) => meta.find(m => m.name === key || m.property === key)?.content;
  const title = override?.title ?? meta.find(m => m.title)?.title ?? "Digit";
  const description = override?.description ?? get("description") ?? "";
  const kept = meta.filter(m => !m.title && !["description", "og:title", "og:description", "og:url", "og:locale", "og:type", "twitter:card", "twitter:title", "twitter:description"].includes((m.name ?? m.property) as string));
  const scripts = [...(head.scripts ?? [])];
  const jsonld: object[] = [];
  if (arPath === "/" && !english) jsonld.push(...HOME_JSONLD);
  if (arPath.startsWith("/modules/")) {
    const crumb = (english ? (title.split(/[—|]/)[0] ?? title).trim() : override?.crumb ?? (title.split(/[—|]/)[0] ?? title).trim());
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
      ...kept,
    ],
    links: [
      ...(head.links ?? []),
      { rel: "canonical", href: url(path) },
      { rel: "alternate", hrefLang: "ar", href: url(arPath) },
      { rel: "alternate", hrefLang: "en", href: url(enPath) },
      { rel: "alternate", hrefLang: "x-default", href: url(arPath) },
    ],
    scripts,
  };
}
