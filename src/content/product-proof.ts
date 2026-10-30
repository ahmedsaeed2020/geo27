import { themeByKey, type L } from "@/content/product-shots";

// Page placements for the real DIGIT Pro screenshots. Copy stays limited to what each
// screenshot shows: no certification, prediction, guarantee or competitor wording.
export type ProofBlock = {
  id: string;
  eyebrow: L;
  title: L;
  hook: L;
  pain?: L;
  /** Screenshot shown large next to the copy; the rest follow in the grid in order. */
  lead: string;
  shots: string[];
  bullets?: L[];
};

export const PROOF_COPY = {
  eyebrow: { ar: "من داخل DIGIT Pro", en: "Inside DIGIT Pro" },
  footnote: { ar: "لقطات حقيقية من DIGIT Pro", en: "Real DIGIT Pro screens" },
  cta: { ar: "احجز عرضًا توضيحيًا", en: "Book a demo" },
  enlarge: { ar: "تكبير اللقطة", en: "Enlarge screen" },
  showAll: { ar: "عرض كل اللقطات", en: "Show all screens" },
  showLess: { ar: "إخفاء اللقطات الإضافية", en: "Show fewer screens" },
  close: { ar: "إغلاق", en: "Close" },
  previous: { ar: "اللقطة السابقة", en: "Previous screen" },
  next: { ar: "اللقطة التالية", en: "Next screen" },
} satisfies Record<string, L>;

export const DEMO_HREF = "/demo";

const theme = (key: string) => themeByKey(key);

export const PAGE_PROOFS: Record<string, ProofBlock[]> = {
  "modules-accounting": [
    {
      id: "cfo",
      eyebrow: PROOF_COPY.eyebrow,
      title: theme("cfo").title,
      hook: theme("cfo").hook,
      pain: { ar: "بدل ما تجمع أرقام السيولة والمخاطر وجاهزية الإقفال من شيتات متفرقة.", en: "Instead of pulling cash, risk and close-readiness figures together from scattered spreadsheets." },
      lead: "01-cfo-01-e1",
      shots: ["01-cfo-01-e1", "01-cfo-02-e2", "01-cfo-03-e3", "01-cfo-04-f11", "01-cfo-05-r7"],
      bullets: [
        { ar: "توقع نقدي بثلاث آفاق مع فصل الفعلي عن المجدول", en: "Cash forecast over three horizons, with actuals kept apart from scheduled amounts" },
        { ar: "قائمة إقفال شهرية تكشف فروقات الذمم والمخزون قبل الإقفال", en: "A monthly close checklist that surfaces receivable and stock variances before closing" },
        { ar: "كل مؤشر قابل للنقر حتى المستند الأصلي", en: "Every indicator clicks through to the source document" },
      ],
    },
    {
      id: "collections",
      eyebrow: PROOF_COPY.eyebrow,
      title: theme("cash").title,
      hook: theme("cash").hook,
      lead: "02-cash-01-f9",
      shots: ["02-cash-01-f9", "02-cash-02-sl6", "02-cash-03-f19", "02-cash-04-f8", "02-cash-05-pu13", "02-cash-06-sl11"],
    },
  ],
  "modules-sales": [
    {
      id: "sales",
      eyebrow: PROOF_COPY.eyebrow,
      title: theme("sales").title,
      hook: theme("sales").hook,
      lead: "04-360-01-sl1",
      shots: ["05-sales-01-sl2", "05-sales-02-sl5", "05-sales-03-sl7", "05-sales-04-sel-004", "04-360-01-sl1"],
      bullets: [
        { ar: "توفر الصنف ظاهر على كل سطر قبل ما تأكد للعميل", en: "Item availability shows on every line before you confirm to the customer" },
        { ar: "سبب أي سعر أو خصم واضح للبائع", en: "The reason behind any price or discount is clear to the salesperson" },
        { ar: "متابعة تحويل العروض إلى أوامر", en: "Track how quotations convert into orders" },
      ],
    },
  ],
  "modules-purchasing": [
    {
      id: "purchasing",
      eyebrow: PROOF_COPY.eyebrow,
      title: theme("pur").title,
      hook: theme("pur").hook,
      lead: "06-pur-03-pu12",
      shots: ["06-pur-01-pu6", "06-pur-02-pu9", "06-pur-03-pu12", "06-pur-04-pur-015", "06-pur-05-pur-016", "04-360-02-pur-007"],
    },
  ],
  "modules-inventory": [
    {
      id: "inventory",
      eyebrow: PROOF_COPY.eyebrow,
      title: theme("inv").title,
      hook: theme("inv").hook,
      lead: "07-inv-04-in11",
      shots: ["07-inv-01-in1", "07-inv-02-in3", "07-inv-03-inv-014", "07-inv-04-in11", "07-inv-05-in13", "07-inv-06-inv-017", "04-360-03-in2"],
    },
  ],
  "modules-fixed-assets": [
    {
      id: "fixed-assets",
      eyebrow: PROOF_COPY.eyebrow,
      title: theme("ast").title,
      hook: theme("ast").hook,
      lead: "04-360-04-fa2",
      shots: ["08-ast-01-fa4", "08-ast-02-fa5", "08-ast-03-fix-003", "04-360-04-fa2"],
    },
  ],
  "modules-reports": [
    {
      id: "reports",
      eyebrow: PROOF_COPY.eyebrow,
      title: theme("rep").title,
      hook: theme("rep").hook,
      lead: "09-rep-03-r6",
      shots: theme("rep").shots,
      bullets: [
        { ar: "فلاتر ظاهرة وفترة ومقارنة موحدة في كل تقرير", en: "Visible filters, with the same period and comparison controls in every report" },
        { ar: "تنبيه واضح لما صلاحيتك محدودة بدل أرقام ناقصة", en: "A clear warning when your access is limited, instead of incomplete figures" },
        { ar: "تصدير Excel/PDF حسب الصلاحية", en: "Excel/PDF export based on permissions" },
      ],
    },
  ],
  features: [
    {
      id: "smart-document",
      eyebrow: PROOF_COPY.eyebrow,
      title: theme("doc").title,
      hook: theme("doc").hook,
      lead: "03-doc-01-d1",
      shots: [...theme("doc").shots, "04-360-05-d9"],
    },
    {
      id: "daily-control",
      eyebrow: PROOF_COPY.eyebrow,
      title: theme("ctl").title,
      hook: theme("ctl").hook,
      lead: "10-ctl-01-s1",
      shots: theme("ctl").shots,
    },
  ],
};

export type HomeTab = { key: string; label: L; hook: L; lead: string; smalls: [string, string]; href: string; linkLabel: L };

export const HOME_SHOWCASE = {
  eyebrow: PROOF_COPY.eyebrow,
  title: { ar: "مش مجرد وعود… دي شاشات النظام الحقيقية", en: "Not promises: these are real DIGIT screens" },
  sub: { ar: "كل رقم بمصدره، وكل مستند مرتبط باللي قبله واللي بعده، بالعربي من أول شاشة.", en: "Every number has its source, every document links to what came before and after, in Arabic from the first screen." },
  tabs: [
    { key: "cfo", label: { ar: "المدير المالي", en: "CFO" }, hook: { ar: "موقفك المالي كله في شاشة واحدة، وكل رقم بمصدره", en: "Your whole financial position on one screen, every number traced to its source" }, lead: "01-cfo-01-e1", smalls: ["01-cfo-02-e2", "01-cfo-04-f11"], href: "/modules/accounting", linkLabel: { ar: "تفاصيل المحاسبة", en: "Explore accounting" } },
    { key: "cash", label: { ar: "التحصيل", en: "Collections" }, hook: { ar: "اعرف مين متأخر وليه قبل ما يأثر على السيولة", en: "Know who is late and why before it hits cash" }, lead: "02-cash-01-f9", smalls: ["02-cash-03-f19", "02-cash-02-sl6"], href: "/modules/accounting", linkLabel: { ar: "تفاصيل المحاسبة", en: "Explore accounting" } },
    { key: "doc", label: { ar: "المستند الذكي", en: "Smart document" }, hook: { ar: "كل مستند بيقولك هو فين وليه مش بيترحّل", en: "Every document tells you where it stands and why it can't post" }, lead: "03-doc-04-d5", smalls: ["03-doc-01-d1", "03-doc-02-d2"], href: "/features", linkLabel: { ar: "كل القدرات", en: "See all capabilities" } },
    { key: "sales", label: { ar: "المبيعات", en: "Sales" }, hook: { ar: "وعد العميل على حاجة متوفرة فعلًا وبسعر مفهوم", en: "Promise only what you actually have, at a price you can explain" }, lead: "05-sales-01-sl2", smalls: ["05-sales-02-sl5", "05-sales-03-sl7"], href: "/modules/sales", linkLabel: { ar: "تفاصيل المبيعات", en: "Explore sales" } },
    { key: "inv", label: { ar: "المخزون", en: "Inventory" }, hook: { ar: "رصيد المخزن هو نفسه اللي في الدفاتر", en: "Warehouse stock that matches the books" }, lead: "07-inv-01-in1", smalls: ["07-inv-03-inv-014", "07-inv-02-in3"], href: "/modules/inventory", linkLabel: { ar: "تفاصيل المخزون", en: "Explore inventory" } },
    { key: "ast", label: { ar: "الأصول", en: "Fixed assets" }, hook: { ar: "الإهلاك المجدول والمستحق والمرحّل، بمطابقة صفر فرق", en: "Scheduled, due and posted depreciation, reconciled to the GL" }, lead: "08-ast-02-fa5", smalls: ["08-ast-01-fa4", "08-ast-03-fix-003"], href: "/modules/fixed-assets", linkLabel: { ar: "تفاصيل الأصول الثابتة", en: "Explore fixed assets" } },
  ] satisfies HomeTab[],
};

/** Challenge slides on the home page that get a supporting screenshot thumbnail. */
export const PROBLEM_SHOTS: Record<string, string> = {
  "تقارير متأخّرة": "09-rep-04-l1",
  "موافقات بطيئة": "10-ctl-03-s4",
  "اعتماد زائد على الإكسل": "04-360-01-sl1",
};

export const PRO_SHOWCASE = {
  eyebrow: PROOF_COPY.eyebrow,
  title: { ar: "ماذا تحصل في DIGIT Pro", en: "What you get in DIGIT Pro" },
  sub: { ar: "عشر مساحات عمل من النظام الحقيقي، بالترتيب اللي فريقك هيشتغل بيه.", en: "Ten workspaces from the live product, in the order your team will use them." },
  ctaTitle: { ar: "جاهز تشوفها على بياناتك؟", en: "Ready to see it on your own data?" },
  // The only price on the site (owner prompt 2026-10-30): shown on /pro alone.
  price: { ar: "DIGIT Pro: 9,999 ر.س سنويًا (بدون ضريبة)، أو 12,999 ر.س مع ربط الفوترة الإلكترونية", en: "DIGIT Pro: SAR 9,999 per year (excl. VAT), or SAR 12,999 with e-invoicing integration" },
  navLabel: { ar: "مساحات DIGIT Pro", en: "DIGIT Pro workspaces" },
  compactCount: 3,
};
