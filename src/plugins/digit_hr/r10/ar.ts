/** Arabic for the round-2 Select options and labels. Keys the Core dictionaries already translate are left to the Core
 *  (coreKeys.json, checked by r10.test.ts), so the app never changes an existing Arabic wording on any other screen. */
import { R10_AR_BASE } from "./doctypes";
import CORE from "./coreKeys.json";

export const OPTION_AR: Record<string, string> = {
  "Merge Departments": "دمج إدارات", "Move Department": "نقل إدارة", "Close Department": "إغلاق إدارة", "Pending Worker": "عامل معلّق", Former: "سابق",
  Spouse: "الزوج/الزوجة", Son: "ابن", Daughter: "ابنة", Father: "الأب", Mother: "الأم", Iqama: "إقامة", "Work Permit": "رخصة عمل", Visa: "تأشيرة",
  "Saudi National ID": "الهوية الوطنية", Eligible: "مؤهل", "Not Eligible": "غير مؤهل", Identity: "هوية", Financial: "مالي", Expiring: "قارب على الانتهاء",
  Acknowledged: "تم الإقرار", Declined: "مرفوض من الموظف", Extend: "تمديد", "End Employment": "إنهاء التوظيف", Host: "الجهة المستضيفة",
  "Salary Certificate": "شهادة راتب", "Experience Letter": "شهادة خبرة", "Employment Verification": "إثبات توظيف", "Embassy Letter": "خطاب سفارة", "Bank Letter": "خطاب بنك",
  Arabic: "العربية", English: "الإنجليزية", Bilingual: "ثنائي اللغة", Hire: "تعيين", "Probation End": "نهاية التجربة", Promotion: "ترقية", Secondment: "إعارة",
  "Salary Change": "تغيير الراتب", "Contract Renewal": "تجديد العقد", Separation: "إنهاء الخدمة", Calculated: "محسوب", "Department Change": "تغيير الإدارة",
  "Branch Change": "تغيير الفرع", Previewed: "تمت المعاينة", "Data Processing": "معالجة البيانات", "Interview Recording": "تسجيل المقابلة", "Talent Pool": "مجمع المواهب",
  "Background Check": "التحقق من الخلفية", Given: "ممنوحة", Withdrawn: "مسحوبة", Paper: "ورقي", "Strong Hire": "توظيف بقوة", "No Hire": "عدم التوظيف",
  "Strong No Hire": "رفض قاطع", "Job Board": "موقع وظائف", Referral: "ترشيح", Agency: "وكالة توظيف", "Career Site": "صفحة الوظائف", "Walk In": "حضور مباشر",
  Bayt: "بيت.كوم", Indeed: "إنديد", Tanqeeb: "تنقيب", Posted: "منشور", Ready: "جاهز", Saudi: "سعودي", Expat: "وافد", "Government Form": "نموذج حكومي",
  Grant: "منح", ERP: "نظام تخطيط الموارد", VPN: "الشبكة الخاصة", Badge: "بطاقة الدخول", "Payroll Portal": "بوابة الرواتب", "Completed Successfully": "اكتملت بنجاح",
  Extended: "ممددة", Unsuccessful: "غير ناجحة", Retired: "متقاعد", Classroom: "حضوري", Online: "عن بعد", Blended: "مدمج", "On the Job": "أثناء العمل",
  Enrolled: "مسجل", Technical: "فنية", Leadership: "قيادية", Behavioural: "سلوكية", Safety: "السلامة", Digital: "رقمية", Assessment: "تقييم",
  "Manager Observation": "ملاحظة المدير", Succession: "التعاقب", "High Potential": "إمكانات عالية", "Critical Skills": "مهارات حرجة", Candidate: "مرشح",
  "Ready Now": "جاهز الآن", "1-2 Years": "سنة إلى سنتين", "3+ Years": "3 سنوات فأكثر", "Not Ready": "غير جاهز", Selected: "تم الاختيار", "Not Selected": "لم يتم الاختيار",
  Superseded: "مستبدل", Explained: "مفسّر", Adjusted: "تمت التسوية", "Missing Checkout": "خروج غير مسجل", Late: "تأخير", "Outside Geofence": "خارج النطاق الجغرافي",
  "Duplicate Punch": "بصمة مكررة", Excused: "معذور", "Sent to Payroll": "أُرسلت للرواتب", GeoInTime: "جيو إن تايم", Ended: "منتهي", "Unknown Employee": "موظف غير معروف",
  "Clock Skew": "فرق توقيت الجهاز", "WPS SIF": "ملف حماية الأجور", "Bank CSV": "ملف البنك", Filed: "مقدّم", "Termination by Employer": "إنهاء من صاحب العمل",
  Resignation: "استقالة", "End of Contract": "انتهاء العقد", Retirement: "تقاعد", Death: "وفاة", Life: "تأمين على الحياة", Dental: "أسنان", Transport: "نقل",
  Elect: "اشتراك", Waive: "تنازل", Elected: "مشترك", Marriage: "زواج", Birth: "مولود", Divorce: "طلاق", Equal: "بالتساوي", "By Base Salary": "حسب الراتب الأساسي", "By Rating": "حسب التقييم",
  Economy: "اقتصادية", Business: "أعمال", "Non-Saudi": "غير سعودي", "Fixed Term": "محدد المدة", Unlimited: "غير محدد المدة", "GOSI Annuities": "المعاشات",
  SANED: "ساند", "Occupational Hazards": "الأخطار المهنية", "Nitaqat Count": "احتساب نطاقات", GOSI: "التأمينات الاجتماعية", Qiwa: "قوى", Muqeem: "مقيم", Mudad: "مدد",
  MHRSD: "وزارة الموارد البشرية", "Low Green": "أخضر منخفض", "Mid Green": "أخضر متوسط", "High Green": "أخضر مرتفع", Platinum: "بلاتيني", WPS: "حماية الأجور",
  Saudization: "التوطين", "Accepted Risk": "مخاطرة مقبولة", "Pending Employee": "بانتظار الموظف", Authenticated: "موثّق", "Partially Accepted": "مقبول جزئيًا",
  "ID Card": "بطاقة تعريف", "Business Card": "بطاقة عمل", Harassment: "تحرش", Discrimination: "تمييز", Ethics: "أخلاقيات", Investigating: "قيد التحقيق",
  "Written Warning": "إنذار كتابي", "Final Warning": "إنذار نهائي", Suspension: "إيقاف عن العمل", Termination: "فصل", Hearing: "جلسة استماع", Decided: "صدر القرار",
  Appealed: "متظلَّم منه", "Yes/No": "نعم/لا", "Thank You": "شكرًا لك", Teamwork: "روح الفريق", "Safety Star": "نجم السلامة", "Customer Hero": "بطل خدمة العملاء",
  Innovation: "ابتكار", Keep: "إبقاء", Requisitioned: "مطلوب توظيفه", Compared: "تمت المقارنة", Adopted: "معتمد", Live: "مباشر", "Only Me": "أنا فقط", "My Role": "دوري",
  "Payroll Processing": "معالجة الرواتب", "Medical Data": "البيانات الطبية", "Biometric Attendance": "الحضور بالبصمة", "Photo Use": "استخدام الصورة", "Data Sharing": "مشاركة البيانات",
  "Flag for Review": "تعليم للمراجعة", Anonymise: "إخفاء الهوية", Correction: "تصحيح", Erasure: "محو", "Read Sensitive": "اطلاع على بيانات حساسة", "Permission Change": "تغيير صلاحية",
  "Failed Login": "دخول فاشل", "Bulk Action": "إجراء جماعي", "Sync Create": "إنشاء بالمزامنة", "Sync Disable": "تعطيل بالمزامنة", "Sync Update": "تحديث بالمزامنة",
  "MFA Success": "تحقق ثنائي ناجح", "MFA Failed": "تحقق ثنائي فاشل", "Sign In": "تسجيل دخول", "Time Device": "جهاز حضور", AI: "الذكاء الاصطناعي", Inbound: "وارد",
  Outbound: "صادر", Processed: "تمت المعالجة", "Dead Letter": "متعثر", Replayed: "أعيد إرساله", DIGIT: "ديجيت", Validated: "تم التحقق", "Job Boards": "مواقع الوظائف",
  "Identity Provider": "مزود الهوية", Simulated: "محاكاة", "Live (server)": "مباشر (الخادم)", Blocked: "موقوف", Inside: "داخل النطاق", Outside: "خارج النطاق",
  "No Location": "دون موقع", "Long Leave": "إجازة طويلة",
};

export const R10_CORE_KEYS = new Set<string>(CORE as string[]);
/** Round-2 Arabic overlay, minus every key the Core already translates. */
export const R10_TRANSLATIONS: Record<string, string> = Object.fromEntries(
  Object.entries({ ...OPTION_AR, ...R10_AR_BASE }).filter(([k]) => !R10_CORE_KEYS.has(k)),
);
