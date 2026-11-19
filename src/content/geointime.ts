/**
 * GeoInTime landing copy. Arabic is the owner's V5 landing content (GeoInTime_Landing_V5_Preview.html) laid out on the
 * owner's landing design; English mirrors it. Screens are authentic GeoInTime interface captures from that file; people
 * are the approved GeoInTime atlas characters. No DIGIT claims, prices, KPIs or customer counts.
 */
export type GeoLocale = 'ar' | 'en';
export type GeoGroup = 'operations' | 'hr' | 'tasks';
export type GeoScreen = 'ui-operations' | 'ui-map' | 'ui-hr' | 'ui-time' | 'ui-location' | 'ui-overtime' | 'ui-payroll' | 'ui-tasks' | 'ui-evidence';
export type GeoPhoto = 'band-sites' | 'arrival' | 'band-evidence' | 'band-overtime';

/** Official contact points from the owner's V5 content. */
export const GEO_WHATSAPP = '966595051150';
export const GEO_PHONE_DISPLAY = '+966 59 505 1150';
export const GEO_SITE = 'https://geointime.com';

/** Challenge values are stored with the lead, so both languages keep one stable key per scenario. */
export const GEO_CHALLENGES = ['sites', 'presence', 'tasks', 'overtime', 'other'] as const;
export type GeoChallenge = typeof GEO_CHALLENGES[number];

export interface GeoView { key: string; label: string; screen: GeoScreen; width: number; height: number }
export interface GeoScenario { photo: GeoPhoto; mirror?: boolean; alt: string; caption: string; tab: [string, string]; quote: [string, string]; summary: string; feature: string; flow: [string, string, string]; proof: [GeoGroup, string]; challenge: GeoChallenge }

const SCREEN_SIZE: Record<GeoScreen, [number, number]> = {
  'ui-operations': [898, 610], 'ui-map': [757, 610], 'ui-hr': [972, 618], 'ui-time': [787, 383], 'ui-location': [972, 618],
  'ui-overtime': [828, 415], 'ui-payroll': [972, 618], 'ui-tasks': [940, 468], 'ui-evidence': [972, 618],
};
const view = (key: string, label: string, screen: GeoScreen): GeoView => ({ key, label, screen, width: SCREEN_SIZE[screen][0], height: SCREEN_SIZE[screen][1] });

export const GEO_COPY = {
  ar: {
    skip: 'انتقل إلى المحتوى', language: 'English', home: 'GeoInTime — الرئيسية', menuOpen: 'فتح القائمة', menuClose: 'إغلاق القائمة', navLabel: 'التنقل الرئيسي',
    nav: [['experience', 'داخل المنصة'], ['scenarios', 'حالات الاستخدام'], ['journey', 'رحلة العمل'], ['request', 'اطلب عرضك']] as [string, string][],
    headerCta: 'ابدأ من واقع شغلك',
    hero: {
      overline: 'منصة GeoInTime لإدارة القوى العاملة والتشغيل',
      title: 'من حضور فريقك…', titleB: 'إلى رؤية ', titleEm: 'أوضح', titleC: ' للعمل.',
      lead: 'الحضور بداية القصة. التشغيل هو الصورة الكاملة.',
      description: 'ما يكفي تعرف إن فريقك حضر. الأهم تشوف سياق العمل: المواقع، الأشخاص، المهام، والمعلومات اللي تحتاجها قبل القرار.',
      primary: 'شاهد المنصة من الداخل', secondary: 'اطلب عرضًا على حالة استخدامك',
      pathLabel: 'مسار الرؤية', path: ['الميدان', 'المعلومات', 'القرار'],
      circles: [
        { label: 'المواقع والفرق', alt: 'منسّق عمليات يتابع فرق العمل من ممر علوي داخل مستودع' },
        { label: 'الحضور والموقع', alt: 'موظف ميداني يصل إلى بوابة المنشأة في بداية الوردية' },
        { label: 'المهام والتنفيذ', alt: 'فني ميداني ينفّذ مهمة فحص لوحة كهربائية' },
      ],
      circleAction: 'اعرض الموقف', scroll: 'انزل واستكشف',
    },
    scenarios: {
      overline: 'YOUR WORLD / YOUR BUSINESS', title: 'كل يوم فيه موقف.', titleAccent: 'وكل موقف محتاج رؤية.',
      intro: 'اختار أقرب سؤال من واقع شغلك. هنورّيك الشاشة المرجعية المرتبطة بيه من غير ما نفترض إن كل سيناريو متاح بنفس الإعدادات.',
      relevance: 'من داخل GeoInTime', toScreen: 'شاهد الشاشة المرتبطة', request: 'اطلب عرضًا لهذا السيناريو', pickerLabel: 'اختيار موقف تشغيلي',
      prev: 'الموقف السابق', next: 'الموقف التالي', pause: 'إيقاف التنقل التلقائي', play: 'تشغيل التنقل التلقائي', of: 'من',
      items: [
        { photo: 'band-sites', alt: 'مدير عمليات يوجّه فريقًا ميدانيًا بجانب مركبات الخدمة في ساحة المنشأة', caption: 'OPERATIONS / 01', tab: ['الموقع شغّال', 'مين مسؤول؟'], quote: ['الموقع شغّال…', 'مين ماسك المهمة؟'], summary: 'لما الفريق يكون موزع بين مواقع ومسؤوليات مختلفة، تحتاج تشوف الأشخاص والمهام في نفس سياق التشغيل.', feature: 'Operations Center / متابعة التشغيل', flow: ['الموقع', 'الفريق', 'المهام'], proof: ['operations', 'main'], challenge: 'sites' },
        { photo: 'arrival', mirror: true, alt: 'موظف يدخل من بوابة الحضور ومشرف الموقع يتابع بداية الوردية', caption: 'LOCATION / 02', tab: ['داخل الموقع', 'فين سجل الحضور؟'], quote: ['داخل الموقع…', 'فين سجل الحضور؟'], summary: 'السؤال مش إن فيه تسجيل حضور وبس؛ الأهم مراجعة سياق الوقت والموقع حسب إعدادات التحقق المتاحة.', feature: 'القوى العاملة / سياق الموقع', flow: ['الموظف', 'الموقع', 'الحضور'], proof: ['hr', 'location'], challenge: 'presence' },
        { photo: 'band-evidence', alt: 'مفتشة ميدانية تراجع قائمة التحقق بجانب معدات السلامة وفني يعمل في الخلفية', caption: 'FIELD TASKS / 03', tab: ['مهمة اتنفذت', 'فين التفاصيل؟'], quote: ['المهمة اتنفذت…', 'فين تفاصيلها؟'], summary: 'راجع المهمة وقائمة التحقق وما يرتبط بها من معلومات بدل الاعتماد على وصف شفهي غير موثق.', feature: 'المهام / قوائم التحقق', flow: ['المهمة', 'قائمة التحقق', 'التوثيق'], proof: ['tasks', 'evidence'], challenge: 'tasks' },
        { photo: 'band-overtime', alt: 'مديرة الموارد البشرية ومسؤول الوقت يراجعان سجل ساعات العمل الأسبوعي', caption: 'WORKFORCE / 04', tab: ['الساعات الإضافية', 'مين بيراجعها؟'], quote: ['الساعات الإضافية…', 'مين بيراجعها؟'], summary: 'من سجل الوقت إلى شاشة الطلب والمراجعة: شوف الرحلة المرئية من غير افتراض موافقات تلقائية.', feature: 'القوى العاملة / الساعات الإضافية', flow: ['سجل الوقت', 'الطلب', 'المراجعة'], proof: ['hr', 'overtime'], challenge: 'overtime' },
      ] as GeoScenario[],
    },
    request: {
      overline: 'START FROM YOUR BUSINESS', title: 'جرّب تفكر في المشكلة', titleAccent: 'من شاشة أوضح.',
      intro: 'الفرق مش في عدد الشاشات. الفرق في معرفة الشاشة المناسبة لسؤال شركتك. اكتب التحدي اللي يهمك، واطلب عرضًا توضيحيًا يناقش احتياجك الفعلي.',
      photoAlt: 'قائد فريق المرافق يوجّه فريقه داخل ممر مستودع', photoTitle: ['من واقع موقعك', 'إلى عرض يناسبك.'],
      screenCaption: 'لقطة من شاشة الخريطة', screenAlt: 'لقطة أصلية من شاشة الخريطة في GeoInTime',
      nodesLabel: 'اختر التحدي من المدار', nodes: [['presence', 'الحضور'], ['sites', 'المواقع'], ['tasks', 'المهام']] as [GeoChallenge, string][],
    },
    form: {
      kicker: 'GEOINTIME / REQUEST A DEMO', title: 'اطلب عرضًا خاصًا', titleB: 'بنشاطك.',
      intro: 'ادخل بيانات التواصل والتحدي الأهم لك. نحفظ طلبك لفريق GeoInTime ونجهّز لك رسالة واتساب تراجعها وترسلها بنفسك.',
      name: 'الاسم الكامل', namePh: 'اسمك', company: 'اسم الشركة', companyPh: 'اسم المؤسسة / الشركة', phone: 'رقم الجوال', phonePh: '05xxxxxxxx',
      role: 'طبيعة دورك', rolePh: 'اختر الدور', roles: ['العمليات والتشغيل', 'الموارد البشرية', 'الإدارة التنفيذية', 'إدارة المشاريع', 'أخرى'],
      challenge: 'التحدي الأهم عندك', challengePh: 'اختر السيناريو الأقرب لشغلك',
      challenges: { sites: 'متابعة المواقع والتغطية', presence: 'تسجيل الحضور من المواقع', tasks: 'متابعة المهام والتوثيق', overtime: 'مراجعة الساعات الإضافية', other: 'احتياج آخر — أريد مناقشته' } as Record<GeoChallenge, string>,
      consent: 'أوافق على استخدام بياناتي للتواصل بشأن هذا الطلب فقط.', required: 'مطلوب',
      submit: 'أرسل طلبي وجهّز رسالة واتساب', sending: 'جارٍ حفظ الطلب…',
      note: 'نحفظ طلبك لدى فريق GeoInTime. رسالة واتساب لا تُرسل تلقائيًا؛ تراجعها وترسلها بنفسك.',
      missingIdentity: 'أدخل الاسم الكامل واسم الشركة.', badPhone: 'راجع رقم الجوال، واستخدم أرقامًا ورموز اتصال صالحة.',
      missingRole: 'اختر طبيعة دورك.', missingChallenge: 'اختر التحدي الأهم عندك.', missingConsent: 'يلزم الموافقة على استخدام بياناتك للتواصل.',
      error: 'تعذّر حفظ الطلب الآن. حاول مرة أخرى أو تواصل معنا عبر واتساب.',
      success: 'تم حفظ طلبك. سيتواصل معك فريق GeoInTime.', successNext: 'تقدر كمان تراجع رسالة الطلب وترسلها على واتساب.',
      openWhatsapp: 'افتح رسالة واتساب', another: 'إرسال طلب آخر',
      message: { title: 'طلب عرض توضيحي — GeoInTime', name: 'الاسم', company: 'الشركة', phone: 'الجوال', role: 'الدور', roleNone: 'غير محدد', challenge: 'السيناريو' },
    },
    experience: {
      overline: 'PRODUCT / REAL INTERFACES', title: 'شاهد الشغل من ', titleAccent: 'داخل النظام.', titleB: 'مش من وعود على صفحة.',
      intro: 'دي لقطات واجهة من مواد GeoInTime التعريفية. اختار المجال، افتح الشاشة، وشوف شكل المعلومات اللي هتتناقش عليها في العرض.',
      tabsLabel: 'مجالات استكشاف النظام', subtabsLabel: 'الشاشات المتاحة داخل القسم', screenBar: 'GEOINTIME / PRODUCT VIEW', real: 'لقطة أصلية من المواد التعريفية',
      zoom: 'تكبير الشاشة', request: 'اطلب عرضًا لهذا السيناريو', screenAlt: 'لقطة أصلية من المواد التعريفية لـGeoInTime: ',
      source: 'الصور مرجعية من ملف GeoInTime التعريفي، وليست اختبارًا مباشرًا للنسخة الحالية أو إثباتًا لتفعيل جميع الوظائف لدى كل عميل.',
      dialogNote: 'لقطة واجهة مرجعية من ملف GeoInTime التعريفي.', close: 'إغلاق',
      groups: {
        operations: { tab: 'متابعة المواقع', photoAlt: 'مشرف موقع يتابع فريقًا ميدانيًا في ساحة التحميل', counter: '01 / OPERATIONS', title: 'من مكان واحد… تابع صورة تشغيل مواقعك.', text: 'واجهة مرجعية تعرض حالة العمل والمواقع والبيانات التي يمكن مراجعتها من مركز العمليات.', bullets: ['متابعة حالة التشغيل', 'عرض معلومات الموقع', 'الانتقال للتفاصيل'], views: [view('main', 'مركز العمليات', 'ui-operations'), view('map', 'الخريطة', 'ui-map')] },
        hr: { tab: 'القوى العاملة', photoAlt: 'مديرة الموارد البشرية في مكتب الإدارة', counter: '02 / WORKFORCE', title: 'الموظف والوقت والحضور… في سياق واحد.', text: 'شاشات مرجعية تستعرض بيانات القوى العاملة وسجل الوقت والموقع والساعات الإضافية ومراجعة الرواتب.', bullets: ['لوحات معلومات العاملين', 'الوقت والموقع', 'طلبات ومراجعات'], views: [view('main', 'القوى العاملة', 'ui-hr'), view('time', 'الوقت والحضور', 'ui-time'), view('location', 'الموقع', 'ui-location'), view('overtime', 'الساعات الإضافية', 'ui-overtime'), view('payroll', 'مراجعة الرواتب', 'ui-payroll')] },
        tasks: { tab: 'المهام الميدانية', photoAlt: 'فني ميداني ينفّذ مهمة فحص', counter: '03 / FIELD TASKS', title: 'كل مهمة لها تفاصيل تستحق المتابعة.', text: 'شاهد أمثلة من شاشات المهام وقوائم التحقق وسياق الإثبات والمرفقات حسب الإعدادات المتاحة.', bullets: ['تفاصيل المهمة', 'قوائم التحقق', 'المرفقات والسياق'], views: [view('main', 'المهام', 'ui-tasks'), view('evidence', 'قوائم التحقق والتوثيق', 'ui-evidence')] },
      } as Record<GeoGroup, { tab: string; photoAlt: string; counter: string; title: string; text: string; bullets: string[]; views: GeoView[] }>,
      railLabel: 'رحلة يوم العمل', rail: ['الموظف', 'الوردية', 'الحضور', 'الموقع', 'المهمة', 'التوثيق', 'المراجعة'],
    },
    journey: {
      overline: 'FROM FIELD TO CLARITY', title: 'مش بس بيانات.', titleAccent: 'سياق يساعدك تسأل صح.',
      intro: 'رحلة استكشاف توضح إزاي تقدر تبدأ من سؤال تشغيلي، تشوف الشاشة المرتبطة، وتناقش احتياج فريقك في عرض مخصص.', link: 'ناقش سيناريوك معنا',
      steps: [['حدّد التحدي', 'موقع، فريق، حضور، أو مهمة تحتاج متابعة.'], ['شاهد شاشة حقيقية', 'تصفّح اللقطات المرجعية الموجودة في الصفحة.'], ['اطلب عرضًا لحالتك', 'شارك سياق نشاطك لمناقشة ملاءمة الإعدادات والوظائف.']] as [string, string][],
    },
    closing: {
      kicker: 'GEOINTIME / THE NEXT MOVE', title: 'من الحضور… إلى ', titleEm: 'رؤية أوضح.',
      text: 'GeoInTime لإدارة القوى العاملة والحضور والمواقع والمهام.', cta: 'خلّي البداية من شغلك',
      photoAlt: 'مشرف موقع واثق داخل مستودع وفريقه في الخلفية',
    },
    footer: { rights: '© 2026 GeoInTime — جميع الحقوق محفوظة.', site: 'الموقع الرسمي', whatsapp: 'واتساب', platform: 'المنصة', linksLabel: 'روابط GeoInTime' },
  },
  en: {
    skip: 'Skip to content', language: 'العربية', home: 'GeoInTime — Home', menuOpen: 'Open menu', menuClose: 'Close menu', navLabel: 'Main navigation',
    nav: [['experience', 'Inside the platform'], ['scenarios', 'Use cases'], ['journey', 'How it works'], ['request', 'Request a demo']] as [string, string][],
    headerCta: 'Start from your operations',
    hero: {
      overline: 'GeoInTime workforce and operations platform',
      title: 'From your team’s attendance…', titleB: 'to a ', titleEm: 'clearer', titleC: ' view of work.',
      lead: 'Attendance starts the story. Operations are the full picture.',
      description: 'Knowing your team showed up is not enough. What matters is the context of the work: sites, people, tasks and the information you need before deciding.',
      primary: 'See the platform from inside', secondary: 'Request a demo for your use case',
      pathLabel: 'Path to clarity', path: ['The field', 'The information', 'The decision'],
      circles: [
        { label: 'Sites & teams', alt: 'An operations coordinator following teams from a warehouse mezzanine' },
        { label: 'Presence & location', alt: 'A field employee arriving at the facility gate at the start of the shift' },
        { label: 'Tasks & execution', alt: 'A field technician carrying out an electrical panel inspection' },
      ],
      circleAction: 'Show the situation', scroll: 'Scroll to explore',
    },
    scenarios: {
      overline: 'YOUR WORLD / YOUR BUSINESS', title: 'Every day brings a situation.', titleAccent: 'Every situation needs visibility.',
      intro: 'Pick the question closest to your work. We’ll show the reference screen linked to it, without assuming every scenario is available with the same settings.',
      relevance: 'Inside GeoInTime', toScreen: 'See the related screen', request: 'Request a demo for this scenario', pickerLabel: 'Choose an operational situation',
      prev: 'Previous situation', next: 'Next situation', pause: 'Pause autoplay', play: 'Play autoplay', of: 'of',
      items: [
        { photo: 'band-sites', alt: 'An operations director directing a field team beside service vehicles in the facility yard', caption: 'OPERATIONS / 01', tab: ['The site is running', 'Who owns it?'], quote: ['The site is running…', 'who owns the task?'], summary: 'When your team is spread across sites and responsibilities, you need to see people and tasks in the same operational context.', feature: 'Operations Center / Operations monitoring', flow: ['Site', 'Team', 'Tasks'], proof: ['operations', 'main'], challenge: 'sites' },
        { photo: 'arrival', mirror: true, alt: 'An employee entering through the attendance gate while the site supervisor follows the start of the shift', caption: 'LOCATION / 02', tab: ['On site', 'Where’s the attendance record?'], quote: ['On site…', 'where’s the attendance record?'], summary: 'The question is not just whether attendance is recorded; it is reviewing time and location context according to the available verification settings.', feature: 'Workforce / Location context', flow: ['Employee', 'Site', 'Attendance'], proof: ['hr', 'location'], challenge: 'presence' },
        { photo: 'band-evidence', alt: 'A field inspector reviewing a checklist beside safety equipment while a technician works behind her', caption: 'FIELD TASKS / 03', tab: ['A task is done', 'Where are the details?'], quote: ['The task is done…', 'where are its details?'], summary: 'Review the task, its checklist and related information instead of relying on an undocumented verbal account.', feature: 'Tasks / Checklists', flow: ['Task', 'Checklist', 'Documentation'], proof: ['tasks', 'evidence'], challenge: 'tasks' },
        { photo: 'band-overtime', alt: 'An HR manager and a timekeeper reviewing the weekly timesheet', caption: 'WORKFORCE / 04', tab: ['Overtime', 'Who reviews it?'], quote: ['Overtime…', 'who reviews it?'], summary: 'From the time record to the request and review screen: see the visual journey without assuming automatic approvals.', feature: 'Workforce / Overtime', flow: ['Time record', 'Request', 'Review'], proof: ['hr', 'overtime'], challenge: 'overtime' },
      ] as GeoScenario[],
    },
    request: {
      overline: 'START FROM YOUR BUSINESS', title: 'Think through the problem', titleAccent: 'from a clearer screen.',
      intro: 'The difference isn’t the number of screens. It’s knowing the right screen for your company’s question. Tell us the challenge that matters and request a demo built around your actual need.',
      photoAlt: 'A facilities team lead briefing his team in a warehouse aisle', photoTitle: ['From your site’s reality', 'to a demo that fits you.'],
      screenCaption: 'Map screen capture', screenAlt: 'Authentic capture of the GeoInTime map screen',
      nodesLabel: 'Pick a challenge from the orbit', nodes: [['presence', 'Attendance'], ['sites', 'Sites'], ['tasks', 'Tasks']] as [GeoChallenge, string][],
    },
    form: {
      kicker: 'GEOINTIME / REQUEST A DEMO', title: 'Request a demo', titleB: 'for your business.',
      intro: 'Enter your contact details and the challenge that matters most. We save your request for the GeoInTime team and prepare a WhatsApp message you can review and send yourself.',
      name: 'Full name', namePh: 'Your name', company: 'Company name', companyPh: 'Organization / company', phone: 'Mobile number', phonePh: '05xxxxxxxx',
      role: 'Your role', rolePh: 'Choose a role', roles: ['Operations', 'Human resources', 'Executive management', 'Project management', 'Other'],
      challenge: 'Your main challenge', challengePh: 'Choose the closest scenario',
      challenges: { sites: 'Site monitoring & coverage', presence: 'Attendance from sites', tasks: 'Task follow-up & documentation', overtime: 'Overtime review', other: 'Another need — I’d like to discuss it' } as Record<GeoChallenge, string>,
      consent: 'I agree to the use of my details to contact me about this request only.', required: 'required',
      submit: 'Send request & prepare WhatsApp', sending: 'Saving your request…',
      note: 'Your request is saved with the GeoInTime team. The WhatsApp message is never sent automatically; you review and send it.',
      missingIdentity: 'Enter your full name and company name.', badPhone: 'Check the mobile number and use valid digits and dialing symbols.',
      missingRole: 'Choose your role.', missingChallenge: 'Choose your main challenge.', missingConsent: 'Please agree to being contacted about this request.',
      error: 'We couldn’t save your request right now. Try again or reach us on WhatsApp.',
      success: 'Your request is saved. The GeoInTime team will contact you.', successNext: 'You can also review the request message and send it on WhatsApp.',
      openWhatsapp: 'Open WhatsApp message', another: 'Send another request',
      message: { title: 'Demo request — GeoInTime', name: 'Name', company: 'Company', phone: 'Mobile', role: 'Role', roleNone: 'Not specified', challenge: 'Scenario' },
    },
    experience: {
      overline: 'PRODUCT / REAL INTERFACES', title: 'See the work from ', titleAccent: 'inside the system.', titleB: 'Not from promises on a page.',
      intro: 'These are interface captures from GeoInTime’s introductory material. Choose an area, open the screen and see the information you’ll discuss in the demo.',
      tabsLabel: 'Areas to explore', subtabsLabel: 'Screens in this area', screenBar: 'GEOINTIME / PRODUCT VIEW', real: 'Authentic capture from introductory material',
      zoom: 'Enlarge screen', request: 'Request a demo for this scenario', screenAlt: 'Authentic GeoInTime capture from introductory material: ',
      source: 'Screens are reference captures from the GeoInTime profile, not a live test of the current version or proof that every function is enabled for every customer.',
      dialogNote: 'Reference interface capture from the GeoInTime profile.', close: 'Close',
      groups: {
        operations: { tab: 'Site monitoring', photoAlt: 'A site supervisor following a field team in the loading yard', counter: '01 / OPERATIONS', title: 'From one place… follow how your sites are running.', text: 'A reference screen showing work status, sites and the data you can review from the operations center.', bullets: ['Operational status', 'Site information', 'Drill into details'], views: [view('main', 'Operations center', 'ui-operations'), view('map', 'Map', 'ui-map')] },
        hr: { tab: 'Workforce', photoAlt: 'An HR manager in the administration office', counter: '02 / WORKFORCE', title: 'People, time and attendance… in one context.', text: 'Reference screens covering workforce data, time records, location, overtime and payroll review.', bullets: ['Workforce dashboards', 'Time & location', 'Requests & reviews'], views: [view('main', 'Workforce', 'ui-hr'), view('time', 'Time & attendance', 'ui-time'), view('location', 'Location', 'ui-location'), view('overtime', 'Overtime', 'ui-overtime'), view('payroll', 'Payroll review', 'ui-payroll')] },
        tasks: { tab: 'Field tasks', photoAlt: 'A field technician carrying out an inspection task', counter: '03 / FIELD TASKS', title: 'Every task has details worth following.', text: 'See examples of task screens, checklists, evidence context and attachments according to the available settings.', bullets: ['Task details', 'Checklists', 'Attachments & context'], views: [view('main', 'Tasks', 'ui-tasks'), view('evidence', 'Checklists & documentation', 'ui-evidence')] },
      } as Record<GeoGroup, { tab: string; photoAlt: string; counter: string; title: string; text: string; bullets: string[]; views: GeoView[] }>,
      railLabel: 'The working-day journey', rail: ['Employee', 'Shift', 'Attendance', 'Site', 'Task', 'Documentation', 'Review'],
    },
    journey: {
      overline: 'FROM FIELD TO CLARITY', title: 'Not just data.', titleAccent: 'Context that helps you ask the right question.',
      intro: 'An exploration path showing how you can start from an operational question, see the related screen and discuss your team’s needs in a tailored demo.', link: 'Discuss your scenario with us',
      steps: [['Define the challenge', 'A site, team, attendance or task that needs follow-up.'], ['See a real screen', 'Browse the reference captures on this page.'], ['Request a demo for your case', 'Share your business context to discuss which settings and functions fit.']] as [string, string][],
    },
    closing: {
      kicker: 'GEOINTIME / THE NEXT MOVE', title: 'From attendance… to ', titleEm: 'a clearer view.',
      text: 'GeoInTime for managing workforce, attendance, sites and tasks.', cta: 'Start from your operations',
      photoAlt: 'A confident site supervisor in a warehouse with his team behind him',
    },
    footer: { rights: '© 2026 GeoInTime — All rights reserved.', site: 'Official website', whatsapp: 'WhatsApp', platform: 'Platform', linksLabel: 'GeoInTime links' },
  },
} as const;
