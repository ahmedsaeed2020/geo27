/**
 * NB-1 section workspace context (presentation only). Each section states its operational question in one line, and
 * the planned-screen classification codes from the 98-screen register get display labels. Stored codes stay unchanged.
 */
export const SECTION_PURPOSE: Record<string, [string, string]> = {
  "01.1": ["كيف تتوزع الشركات والأقسام وخطوط الإشراف، وأين توجد فجوات في الهيكل؟", "How are companies, departments and reporting lines arranged, and where are the structural gaps?"],
  "01.2": ["ما العائلات والملفات الوظيفية المعرّفة وكيف ترتبط بالمسميات؟", "Which job families and profiles are defined, and how do they map to designations?"],
  "01.3": ["أي المناصب مشغولة أو شاغرة، وما العدد المعتمد في ميزانيات المناصب المسجلة؟", "Which positions are filled or vacant, and what headcount do recorded position budgets approve?"],
  "01.4": ["من الموظفون في نطاقك، وما الذي يحتاج تحديثًا في سجلاتهم؟", "Who is employed in your scope, and which records need attention?"],
  "01.5": ["ما طلبات النقل والترقية والتغييرات الوظيفية المسجلة وحالتها؟", "Which transfers, promotions and employment changes are recorded, and where do they stand?"],
  "01.6": ["أي العقود والوثائق قاربت الانتهاء أو تحتاج مراجعة تعديل؟", "Which contracts and documents are expiring or waiting for an amendment review?"],
  "02.1": ["أين يقف المرشحون في مسار التوظيف، وما المقابلات والعروض المعلقة؟", "Where are applicants in the pipeline, and which interviews and offers are pending?"],
  "02.2": ["من يباشر العمل قريبًا، وأي رحلات تهيئة لم تكتمل؟", "Who is joining soon, and which onboarding journeys are still open?"],
  "02.3": ["أي دورات التقييم والأهداف والملاحظات قيد التنفيذ؟", "Which appraisal cycles, goals and feedback are in progress?"],
  "02.4": ["ما برامج وفعاليات التدريب المسجلة ونتائجها وتقييماتها؟", "Which training programs and events are recorded, with their results and feedback?"],
  "02.5": ["من المرشحون للتعاقب على الأدوار الحرجة؟", "Who is nominated to succeed critical roles?"],
  "03.1": ["أي طلبات الإجازة تنتظر القرار، وما أثرها على الأرصدة والتغطية؟", "Which leave requests await a decision, and what do they do to balances and cover?"],
  "03.2": ["ما الحضور المسجّل لليوم المحدد، وأي الاستثناءات تحتاج تصحيحًا مصرحًا به؟", "What attendance is recorded for the selected day, and which exceptions need an authorized correction?"],
  "03.3": ["من مسند إلى أي وردية هذا الأسبوع، وأين تتعارض الإسنادات مع الإجازات؟", "Who is rostered on which shift this week, and where do assignments clash with leave?"],
  "03.4": ["من أين تأتي سجلات الحضور، وما الذي يمكن استيراده بأمان؟", "Where do attendance records come from, and what can be imported safely?"],
  "04.1": ["هل دورة الرواتب المحددة جاهزة، وما الذي يمنع التشغيل؟", "Is the selected payroll cycle ready, and what is blocking the run?"],
  "04.2": ["ما حالة إعداد الصرف لكشوف الرواتب المعتمدة؟", "What is the disbursement preparation state of submitted salary slips?"],
  "04.3": ["ما متطلبات التوطين والامتثال السعودي، وأيها يحتاج تكاملًا رسميًا؟", "Which Saudi localization obligations apply, and which need an official integration?"],
  "04.4": ["ما هياكل الرواتب والمزايا المسندة دون عرض مبالغ؟", "Which salary structures and benefits are assigned, without exposing amounts?"],
  "04.5": ["أي السلف والمطالبات تنتظر قرارًا أو إقفالًا؟", "Which advances and claims await a decision or settlement?"],
  "05.1": ["ما خدماتي وطلباتي المفتوحة وما المطلوب مني؟", "What are my services and open requests, and what is waiting on me?"],
  "05.2": ["ما الذي ينتظر قراري كمدير لفريقي؟", "What is waiting for my decision as a manager?"],
  "05.3": ["أي حالات الخدمة مفتوحة، ولمن هي، وكم مضى عليها؟", "Which service cases are open, who owns them and how old are they?"],
  "06.1": ["ما أولويات الموارد البشرية عبر الوحدات للنطاق والفترة المحددين؟", "What are the cross-module HR priorities for the selected scope and period?"],
  "06.2": ["كيف تقارن خطط التوظيف بالقوى العاملة الحالية؟", "How do staffing plans compare with the current workforce?"],
  "06.3": ["ما المؤشرات والتقارير المسجلة وكيف تُتتبع إلى سجلاتها؟", "Which metrics and reports exist, and how do they trace back to records?"],
  "07.1": ["أي إعدادات التأسيس ناقصة أو غير مقروءة؟", "Which setup checks are incomplete or not evaluated?"],
  "07.2": ["من يرى ماذا، وأين توجد مخاطر خصوصية تحتاج مراجعة؟", "Who can see what, and where are privacy risks to review?"],
  "07.3": ["ما قوالب ومراسلات الموارد البشرية المعرفة ومن يستخدمها؟", "Which HR templates and notifications are defined, and where are they used?"],
  "07.4": ["ما التكاملات وسجلات التشغيل المسجلة وحالتها؟", "Which integrations and run logs are recorded, and what is their state?"],
};

/** Display labels for the 98-screen fit-gap codes (codes themselves stay visible as untranslated identifiers). */
export const FIT_LABEL: Record<string, [string, string]> = {
  REUSE_NATIVE: ["مستند أصلي كما هو", "Native document as is"],
  NEW_UI_OVERLAY: ["واجهة ديجيت فوق السجلات الأصلية", "DIGIT screen over native records"],
  CONFIGURE_NATIVE: ["إعداد أصلي", "Native configuration"],
  PROPOSED_GAP: ["فجوة مقترحة — بانتظار اعتماد", "Proposed gap — awaiting approval"],
  NEW_DIGIT_DOCTYPE: ["مستند ديجيت جديد", "New DIGIT document"],
  EXTEND_NATIVE: ["امتداد للمستند الأصلي", "Native extension"],
  REUSE_NATIVE_PLUS_DIGIT_IMPORT_UI: ["أصلي مع واجهة استيراد ديجيت", "Native with DIGIT import screen"],
  INTEGRATION_PROPOSED: ["تكامل مقترح — يتطلب خادمًا", "Proposed integration — server required"],
  OPTIONAL_INTEGRATION: ["تكامل اختياري", "Optional integration"],
};

export const fitLabels = (fit: string, tx: (ar: string, en: string) => string) =>
  fit.split("/").filter(Boolean).map((code) => ({ code, label: FIT_LABEL[code] ? tx(...FIT_LABEL[code]) : code }));

export const waveLabel = (wave: string, tx: (ar: string, en: string) => string) => {
  const n = /^W(\d+)$/.exec(wave)?.[1];
  return n ? tx(`الموجة ${n}`, `Wave ${n}`) : wave;
};

/**
 * UX-21: registers whose records can only come from an official Saudi integration or an owner-approved rule pack
 * (D-05). An empty register is labelled with that dependency so a zero is never read as "compliant / nothing due".
 * The real record count is still shown; nothing is computed or submitted.
 */
export const OFFICIAL_DEPENDENCY: Record<string, { ar: string; en: string }> = {
  "DIGIT Saudi Rule Set": { ar: "بانتظار حزمة قواعد رسمية معتمدة", en: "Awaits an approved official rule pack" },
  "DIGIT GOSI Assessment": { ar: "يتطلب تكاملًا رسميًا مع التأمينات", en: "Needs the official GOSI integration" },
  "DIGIT WPS Submission": { ar: "يتطلب تكاملًا رسميًا لحماية الأجور", en: "Needs the official WPS/Mudad integration" },
};
