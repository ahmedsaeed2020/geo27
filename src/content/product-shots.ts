// Real DIGIT Pro screenshots (owner upload 2026-10-30). Pixel sizes come from the
// manifest so every frame reserves its space before the image loads.
export type L = { ar: string; en: string };
export type Shot = { id: string; src: string; width: number; height: number; theme: number; caption: L };
export type Theme = { no: number; key: string; chip: L; title: L; hook: L; shots: string[] };

const pointers = import.meta.glob<{ url: string }>("/src/assets/product/*.asset.json", { eager: true, import: "default" });

type Row = [id: string, theme: number, width: number, height: number, ar: string, en: string];
const ROWS: Row[] = [
  ["01-cfo-01-e1", 1, 1440, 900, "لوحات المدير المالي", "CFO dashboards"],
  ["01-cfo-02-e2", 1, 1024, 328, "توقع النقد 7/30/90 يوم: الفعلي منفصل عن المتوقع", "7/30/90-day cash forecast, with actuals kept apart from projections"],
  ["01-cfo-03-e3", 1, 455, 53, "لوحة الاستثناءات والمخاطر", "Exceptions and risk board"],
  ["01-cfo-04-f11", 1, 1024, 247, "قائمة الإقفال ومراجعة الفروقات قبل الإقفال", "Close checklist with variance review before closing"],
  ["01-cfo-05-r7", 1, 1440, 400, "كل كارت معاه تعريفه ومصدره", "Every card carries its definition and source"],
  ["02-cash-01-f9", 2, 1024, 592, "مساحة التحصيل: المتأخر مقابل الصافي القابل للتحصيل", "Collections workspace: overdue vs. net collectible"],
  ["02-cash-02-sl6", 2, 1024, 109, "حظر ائتمان بسبب مقروء", "Credit hold with a readable reason"],
  ["02-cash-03-f19", 2, 1024, 87, "كشف فواتير الموردين المكررة", "Duplicate supplier invoice detection"],
  ["02-cash-04-f8", 2, 366, 267, "استثناءات الذمم الدائنة", "Payables exceptions"],
  ["02-cash-05-pu13", 2, 1024, 113, "نسبة الفواتير المعالجة بدون تدخل وأيام المعالجة", "Share of invoices processed without intervention, and processing days"],
  ["02-cash-06-sl11", 2, 1024, 191, "تم التسليم ولم تتم الفوترة، مع الأعمار", "Delivered but not yet invoiced, with ageing"],
  ["03-doc-01-d1", 3, 1440, 1400, "شريط مراحل المستند", "Document stage strip"],
  ["03-doc-02-d2", 3, 366, 173, "حالة الطلب على 5 محاور: الطلب والحجز والتسليم والفوترة والائتمان", "Order status on 5 axes: order, reservation, delivery, billing and credit"],
  ["03-doc-03-d3", 3, 1024, 258, "أزرار المستندات المرتبطة وعليها عدّاد", "Related-document buttons with counts"],
  ["03-doc-04-d5", 3, 1024, 81, "«لماذا لا يمكن ترحيله؟» مع السبب", "“Why can’t this post?” with the reason"],
  ["03-doc-05-d13", 3, 366, 203, "الحقول المهمة أولًا", "Key fields first"],
  ["03-doc-06-s10", 3, 1024, 417, "مساعدة داخل المهمة نفسها", "Help inside the task itself"],
  ["04-360-01-sl1", 4, 1024, 656, "ملف العميل 360", "Customer 360 profile"],
  ["04-360-02-pur-007", 4, 1024, 226, "ملف المورد 360 وتقييمه", "Supplier 360 profile and rating"],
  ["04-360-03-in2", 4, 1024, 817, "ملف الصنف 360: من أمر الشراء حتى القيد", "Item 360 profile: from purchase order to journal entry"],
  ["04-360-04-fa2", 4, 1024, 476, "ملف الأصل 360 وخط حياته", "Asset 360 profile and lifecycle"],
  ["04-360-05-d9", 4, 1440, 1400, "لوحة العميل/المورد الجانبية داخل المستند", "Customer/supplier side panel inside the document"],
  ["05-sales-01-sl2", 5, 1024, 259, "قمع عروض الأسعار ونسبة التحويل", "Quotation funnel and conversion rate"],
  ["05-sales-02-sl5", 5, 1024, 158, "المتاح والمحجوز والمتوقع على سطر البيع", "Available, reserved and projected stock on the sales line"],
  ["05-sales-03-sl7", 5, 1024, 60, "«ليه السعر ده؟»: شرح التسعير", "“Why this price?”: pricing explained"],
  ["05-sales-04-sel-004", 5, 1024, 53, "حالة أمر البيع ومراحله", "Sales order status and stages"],
  ["06-pur-01-pu6", 6, 1024, 174, "الالتزامات المفتوحة وأوامر الشراء المتأخرة", "Open commitments and late purchase orders"],
  ["06-pur-02-pu9", 6, 1024, 155, "انحرافات السعر والكمية والعملة", "Price, quantity and currency variances"],
  ["06-pur-03-pu12", 6, 1024, 515, "تقييم المورد: الالتزام بالمواعيد والتركّز", "Supplier scorecard: on-time delivery and concentration"],
  ["06-pur-04-pur-015", 6, 366, 515, "تحليل الإنفاق وتركّز الموردين", "Spend analysis and supplier concentration"],
  ["06-pur-05-pur-016", 6, 1024, 515, "موثوقية التوريد", "Supply reliability"],
  ["07-inv-01-in1", 7, 1024, 213, "لوحة عمليات كل مستودع", "Operations board for each warehouse"],
  ["07-inv-02-in3", 7, 366, 919, "الفعلي والمتاح والمحجوز والمتوقع منفصلة", "Actual, available, reserved and projected kept separate"],
  ["07-inv-03-inv-014", 7, 1024, 269, "مطابقة قيمة المخزون مع الأستاذ العام", "Stock value reconciled to the general ledger"],
  ["07-inv-04-in11", 7, 1024, 594, "تحليل ABC والدوران والأعمار", "ABC analysis, turnover and ageing"],
  ["07-inv-05-in13", 7, 366, 69, "التحويل على مرحلتين وتتبع البضاعة في الطريق", "Two-step transfers with goods-in-transit tracking"],
  ["07-inv-06-inv-017", 7, 366, 567, "مؤشرات المستودع على الجوال", "Warehouse indicators on mobile"],
  ["08-ast-01-fa4", 8, 366, 178, "المجدول مقابل المستحق مقابل المرحّل لكل دفتر", "Scheduled vs. due vs. posted for each book"],
  ["08-ast-02-fa5", 8, 1024, 376, "جسر حركة الأصول ومطابقته مع الأستاذ العام", "Asset movement bridge reconciled to the general ledger"],
  ["08-ast-03-fix-003", 8, 366, 640, "سجل الأصل وتاريخه", "Asset register and history"],
  ["09-rep-02-r2", 9, 1024, 44, "تنبيه واضح لما نطاق الصلاحية يكون مقيد", "A clear warning when your access scope is restricted"],
  ["09-rep-03-r6", 9, 1440, 900, "مصمم القوائم المالية", "Financial statement designer"],
  ["09-rep-04-l1", 9, 366, 978, "عرض Pivot وتقويم", "Pivot and calendar views"],
  ["09-rep-05-l4", 9, 1440, 1120, "تصدير نظيف", "Clean export"],
  ["09-rep-07-s9", 9, 1024, 60, "عربي ومن اليمين لليسار، بالهجري والميلادي", "Arabic, right-to-left, with Hijri and Gregorian dates"],
  ["10-ctl-01-s1", 10, 1440, 1400, "البحث الشامل وأوامر Ctrl+K", "Global search and Ctrl+K commands"],
  ["10-ctl-02-s3", 10, 604, 34, "عدّاد «شغلي»", "“My Work” counter"],
  ["10-ctl-03-s4", 10, 390, 1400, "صندوق الاعتمادات الموحد", "Unified approvals inbox"],
  ["10-ctl-04-s7", 10, 1440, 1400, "شارات الاستثناءات على القائمة الجانبية", "Exception badges in the sidebar"],
];

export const SHOTS: Record<string, Shot> = Object.fromEntries(ROWS.map(([id, theme, width, height, ar, en]) => {
  const pointer = pointers[`/src/assets/product/${id}.jpg.asset.json`];
  if (!pointer) throw new Error(`Missing product screenshot asset: ${id}`);
  return [id, { id, src: pointer.url, width, height, theme, caption: { ar, en } }];
}));

export function shot(id: string): Shot {
  const found = SHOTS[id];
  if (!found) throw new Error(`Unknown product screenshot: ${id}`);
  return found;
}

const themeShots = (no: number) => ROWS.filter(row => row[1] === no).map(row => row[0]);

export const THEMES: Theme[] = [
  { no: 1, key: "cfo", chip: { ar: "المدير المالي", en: "CFO" }, title: { ar: "مركز قيادة المدير المالي", en: "CFO command center" }, hook: { ar: "موقفك المالي كله في شاشة واحدة، وكل رقم بمصدره", en: "Your whole financial position on one screen, every number traced to its source" }, shots: themeShots(1) },
  { no: 2, key: "cash", chip: { ar: "التحصيل", en: "Collections" }, title: { ar: "التحصيل والذمم", en: "Collections and receivables" }, hook: { ar: "اعرف مين متأخر، وليه، وإيه المكرر، قبل ما يأثر على السيولة", en: "Know who is late, why, and what is duplicated before it hits cash" }, shots: themeShots(2) },
  { no: 3, key: "doc", chip: { ar: "المستند الذكي", en: "Smart document" }, title: { ar: "المستند الذكي", en: "Smart document" }, hook: { ar: "كل مستند بيقولك هو فين، ومرتبط بإيه، وليه مش بيترحّل", en: "Every document tells you where it stands and why it can't post" }, shots: themeShots(3) },
  { no: 4, key: "360", chip: { ar: "رؤية 360", en: "360° view" }, title: { ar: "رؤية 360 لكل عميل ومورد وصنف وأصل", en: "A 360° view of every customer, supplier, item and asset" }, hook: { ar: "كل اللي تحتاجه عن العميل أو المورد أو الصنف أو الأصل في صفحة واحدة", en: "Everything about a customer, supplier, item or asset on one page" }, shots: themeShots(4) },
  { no: 5, key: "sales", chip: { ar: "المبيعات", en: "Sales" }, title: { ar: "مبيعات من غير مفاجآت", en: "Sales without surprises" }, hook: { ar: "وعد العميل على حاجة متوفرة فعلًا، وبسعر مفهوم", en: "Promise only what you actually have, at a price you can explain" }, shots: themeShots(5) },
  { no: 6, key: "pur", chip: { ar: "المشتريات", en: "Purchasing" }, title: { ar: "مشتريات تحت السيطرة", en: "Purchasing under control" }, hook: { ar: "اعرف التزاماتك، وانحرافات الأسعار، وأحسن موردينك", en: "See commitments, price variances and your best suppliers" }, shots: themeShots(6) },
  { no: 7, key: "inv", chip: { ar: "المخزون", en: "Inventory" }, title: { ar: "مخزون دقيق ومتطابق مع الحسابات", en: "Accurate inventory that matches the accounts" }, hook: { ar: "رصيد المخزن هو نفسه اللي في الدفاتر", en: "Warehouse stock that matches the books" }, shots: themeShots(7) },
  { no: 8, key: "ast", chip: { ar: "الأصول", en: "Fixed assets" }, title: { ar: "أصول ثابتة متطابقة مع الدفاتر", en: "Fixed assets that match the books" }, hook: { ar: "الإهلاك المجدول والمستحق والمرحّل، بمطابقة صفر فرق مع الأستاذ العام", en: "Scheduled, due and posted depreciation, reconciled to the GL" }, shots: themeShots(8) },
  { no: 9, key: "rep", chip: { ar: "التقارير", en: "Reports" }, title: { ar: "تقارير موحدة بالعربي", en: "Unified Arabic reports" }, hook: { ar: "أكثر من 130 تقريرًا بشاشة واحدة، والصلاحيات واضحة، والتصدير نظيف", en: "130+ reports in one Arabic viewer with clear permissions" }, shots: themeShots(9) },
  { no: 10, key: "ctl", chip: { ar: "التحكم اليومي", en: "Daily control" }, title: { ar: "تحكم وسرعة في الشغل اليومي", en: "Control and speed in daily work" }, hook: { ar: "شغلك ومهامك واستثناءاتك قدامك من غير ما تدور", en: "Your work, approvals and exceptions in front of you" }, shots: themeShots(10) },
];

export const themeByKey = (key: string): Theme => {
  const found = THEMES.find(theme => theme.key === key);
  if (!found) throw new Error(`Unknown product theme: ${key}`);
  return found;
};
