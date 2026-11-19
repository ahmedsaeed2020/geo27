/**
 * Arabic display of the DIGIT FSM demo masters (owner rule: names, not codes; Arabic screens show Arabic sample values).
 * Stored values stay English; the shared display layer (src/i18n addSampleNameResolver) shows these on Arabic screens and
 * the English resolver maps Arabic back. Composite titles ("<part> — <part>", "<code>-<nn> <device type>") resolve part
 * by part, so every generated job, deficiency and device title reads in one language.
 */
export const FSM_AR: Record<string, string> = {
  // customers
  "Riyadh Gate Mall Management Co.": "شركة إدارة مجمع بوابة الرياض", "Al Waha Hospital Group": "مجموعة مستشفيات الواحة", "Eastern Gulf Industrial Parks Co.": "شركة الخليج الشرقي للمجمعات الصناعية",
  "Gulf Fire Pump Services": "خدمات مضخات الحريق الخليجية",
  // sites
  "Riyadh Gate Mall": "مجمع بوابة الرياض", "Al Nakheel Plaza": "النخيل بلازا", "Granada Center": "مركز غرناطة", "Qurtuba Mall": "مجمع قرطبة",
  "Al Waha Hospital — North Tower": "مستشفى الواحة — البرج الشمالي", "Al Waha Hospital — South Tower": "مستشفى الواحة — البرج الجنوبي", "Al Waha Clinic — Al Rawdah": "عيادة الواحة — الروضة", "Al Waha Medical Store — Al Khumrah": "مستودع الواحة الطبي — الخمرة",
  "Second Industrial City — Plant A": "المدينة الصناعية الثانية — المصنع أ", "Second Industrial City — Plant B": "المدينة الصناعية الثانية — المصنع ب", "Dammam Logistics Hub": "مركز الدمام اللوجستي", "Al Khobar Admin Building": "المبنى الإداري بالخبر",
  "Atlas Trading HQ": "المقر الرئيسي لأطلس للتجارة", "Noor Clinic — Olaya": "عيادة نور — العليا",
  // site parts
  "North Tower": "البرج الشمالي", "South Tower": "البرج الجنوبي", "Al Rawdah": "الروضة", "Al Khumrah": "الخمرة", "Plant A": "المصنع أ", "Plant B": "المصنع ب",
  // locations
  "Building A": "المبنى أ", "Building B": "المبنى ب", "Main building": "المبنى الرئيسي", Basement: "القبو", "Ground floor": "الطابق الأرضي", "Level 1": "الطابق الأول", "Level 2": "الطابق الثاني",
  "Zone A": "المنطقة أ", "Zone B": "المنطقة ب", "Zone C": "المنطقة ج",
  // systems
  "Addressable fire alarm system": "نظام إنذار الحريق المعنون", "Wet sprinkler system": "نظام الرشاشات الرطبة", "Fire pump set": "مجموعة مضخات الحريق", "Portable extinguishers": "الطفايات المحمولة",
  "Emergency & exit lighting": "إنارة الطوارئ والمخارج", "Kitchen hood suppression": "نظام إطفاء مداخن المطابخ", "Smoke control dampers": "مخمدات التحكم بالدخان", "Electrical distribution boards": "لوحات التوزيع الكهربائي",
  "Main fire alarm panel (Notifier NFS2)": "لوحة إنذار الحريق الرئيسية", "Wet sprinkler riser A": "صاعد الرشاشات الرطبة أ", "Portable extinguishers — retail level": "الطفايات المحمولة — مستوى المحلات",
  "North tower addressable system": "نظام البرج الشمالي المعنون", "Escape route lighting": "إنارة مسارات الهروب", "Basement sprinkler zone": "منطقة رشاشات القبو",
  // inspection templates and checks (catalog.ts)
  "Agent cylinder pressure": "ضغط أسطوانة المادة المطفئة", "Churn discharge pressure": "ضغط التصريف أثناء التشغيل بلا تدفق", "Circuit breakers labelled": "القواطع معلَّمة",
  "Closing time (seconds)": "زمن الإغلاق (ثوانٍ)", "Control valve supervised open and sealed": "صمام التحكم مراقَب مفتوح ومختوم", "Damper closes on alarm signal": "المخمد يُغلق عند إشارة الإنذار",
  "Detector functional test": "اختبار وظيفي للكاشف", "Device clean and unobstructed": "الجهاز نظيف وغير معاق", "Distribution board thermographic survey": "مسح حراري للوحة التوزيع",
  "Emergency lighting duration test": "اختبار مدة إنارة الطوارئ", "Fire alarm inspection & test": "فحص واختبار إنذار الحريق", "Fire pump churn test": "اختبار تشغيل مضخة الحريق بلا تدفق",
  "Gross weight within tolerance": "الوزن الإجمالي ضمن السماح", "Hottest terminal temperature (°C)": "أعلى حرارة طرف توصيل (°م)", "Kitchen suppression semi-annual service": "خدمة نصف سنوية لإطفاء المطابخ",
  "Luminaire lights on mains failure": "الوحدة تضيء عند انقطاع الكهرباء", "Main drain test pressure": "ضغط اختبار التصريف الرئيسي", "Nozzles clean and capped": "الفوهات نظيفة ومغطاة",
  "Panel normal, no faults or disablements": "اللوحة طبيعية بلا أعطال أو تعطيلات", "Portable extinguisher inspection": "فحص طفايات الحريق المحمولة", "Pressure gauge in operating range": "مقياس الضغط ضمن نطاق التشغيل",
  "Pump starts on pressure drop": "المضخة تعمل عند انخفاض الضغط", "Rated duration test (minutes)": "اختبار المدة المقررة (دقائق)", "Running current": "تيار التشغيل",
  "Seal and tamper indicator intact": "الختم ومؤشر العبث سليمان", "Smoke damper functional test": "اختبار وظيفي لمخمد الدخان", "Sounder audible in every zone": "صوت الإنذار مسموع في كل منطقة",
  "Sounder not audible": "صوت الإنذار غير مسموع", "Sprinkler quarterly inspection": "الفحص الربع سنوي للرشاشات", "Standby battery voltage": "جهد البطارية الاحتياطية",
  // site access and finding texts (v2.ts)
  "Report to hospital security; infection-control briefing before wards.": "المراجعة مع أمن المستشفى؛ إحاطة مكافحة العدوى قبل دخول الأجنحة.", "Report to the security desk; escort required in plant rooms.": "المراجعة مع مكتب الأمن؛ يلزم مرافق في غرف المعدات.",
  "Daily 07:00–19:00 (wards by appointment)": "يوميًا 07:00–19:00 (الأجنحة بموعد)", "Sat–Thu 08:00–17:00": "السبت–الخميس 08:00–17:00", "Customer states the item is landlord scope.": "يفيد العميل بأن البند من نطاق المالك.",
  // device types
  "Smoke detector": "كاشف دخان", "Heat detector": "كاشف حرارة", "Manual call point": "نقطة نداء يدوية", "Control valve": "صمام تحكم", "Flow switch": "مفتاح تدفق",
  "Main electric pump": "المضخة الكهربائية الرئيسية", "Jockey pump": "مضخة الضغط", "Pump controller": "لوحة تحكم المضخة", "CO2 extinguisher 6 kg": "طفاية ثاني أكسيد الكربون 6 كجم", "Dry powder extinguisher 6 kg": "طفاية بودرة جافة 6 كجم",
  "Emergency luminaire": "وحدة إنارة طوارئ", "Exit sign": "لوحة مخرج", "Kitchen hood suppression unit": "وحدة إطفاء مدخنة المطبخ", "Smoke damper": "مخمد دخان", "Distribution board": "لوحة توزيع",
  // people, crews, vans
  "Khalid Al-Harbi": "خالد الحربي", "Faisal Al-Otaibi": "فيصل العتيبي", "Yousef Al-Qahtani": "يوسف القحطاني", "Huda Al-Shehri": "هدى الشهري", "Majed Al-Shammari": "ماجد الشمري", "Saud Al-Mutairi": "سعود المطيري", "Abdulaziz Al-Ghamdi": "عبدالعزيز الغامدي", "Nasser Al-Zahrani": "ناصر الزهراني",
  "Reem Al-Saleh": "ريم الصالح", "Turki Al-Anazi": "تركي العنزي", "Lama Al-Fahad": "لمى الفهد", "Field Technician": "فني ميداني", "Facility Manager": "مدير المرفق", "Crew A": "الطاقم أ", "Crew B": "الطاقم ب",
  "Service van": "سيارة الخدمة",
  // work titles
  "Planned inspection": "فحص دوري", Repair: "إصلاح", Retest: "إعادة فحص", Emergency: "طارئ", Corrective: "تصحيحي", "Imported service history": "سجل خدمة مستورد",
  "annual maintenance contract": "عقد الصيانة السنوي", "fire pump maintenance": "صيانة مضخات الحريق", "kitchen suppression service": "خدمة إطفاء المطابخ", "monthly life-safety testing": "اختبارات السلامة الشهرية", "renewal proposal": "مقترح تجديد",
  // items
  "Fire & life safety inspection visit": "زيارة فحص السلامة من الحريق", "Corrective repair labour": "أجور إصلاح تصحيحي", "Optical smoke detector": "كاشف دخان بصري", "Emergency luminaire battery pack": "حزمة بطارية وحدة الطوارئ",
  "Sprinkler control valve tamper switch": "مفتاح عبث صمام الرشاشات", "Exit sign LED module": "وحدة LED للوحة المخرج", "Damper actuator 24V": "مشغل مخمد 24 فولت",
  // failure phrases
  "Panel shows faults": "اللوحة تُظهر أعطالًا", "Battery voltage low": "جهد البطارية منخفض", "No alarm on functional test": "لا إنذار عند الاختبار الوظيفي", "Detector dirty or obstructed": "الكاشف متسخ أو محجوب",
  "Main drain pressure low": "ضغط التصريف الرئيسي منخفض", "Valve not supervised open": "الصمام غير مراقب في وضع الفتح", "Gauge below operating range": "المؤشر أقل من نطاق التشغيل", "Seal or tamper indicator broken": "الختم أو مؤشر العبث مكسور",
  "Weight out of tolerance": "الوزن خارج التفاوت المسموح", "Luminaire failed on mains failure": "الوحدة لم تعمل عند انقطاع الكهرباء", "Duration below 90 minutes": "مدة التشغيل أقل من 90 دقيقة", "Churn pressure out of range": "ضغط التشغيل خارج النطاق",
  "Pump failed to start on demand": "المضخة لم تعمل عند الطلب", "Running current out of range": "تيار التشغيل خارج النطاق", "Cylinder pressure low": "ضغط الأسطوانة منخفض", "Nozzle blocked": "الفوهة مسدودة",
  "Damper did not close on alarm": "المخمد لم يُغلق عند الإنذار", "Closing time too long": "زمن الإغلاق طويل", "Hot spot on thermal scan": "نقطة ساخنة في المسح الحراري", "Breakers not labelled": "القواطع غير معنونة",
  // requests
  "Fire alarm panel shows earth fault": "لوحة الإنذار تُظهر عطلًا أرضيًا", "Sprinkler pipe leaking in basement car park": "تسرب من أنبوب الرشاشات في موقف القبو", "Exit sign not lit at stair 3": "لوحة المخرج مطفأة عند الدرج 3",
  "Kitchen suppression discharged in food court": "تفريغ نظام إطفاء المطبخ في منطقة المطاعم", "Fire pump running continuously": "مضخة الحريق تعمل باستمرار", "Smoke detector beeping in ward 4B": "كاشف الدخان يصدر تنبيهًا في الجناح 4ب",
  "Damaged manual call point at entrance": "نقطة نداء يدوية تالفة عند المدخل", "Annual inspection certificate requested by civil defence": "طلب شهادة الفحص السنوي من الدفاع المدني",
  // reactive work
  "Replace damaged detector head": "استبدال رأس كاشف تالف", "Clear sprinkler head obstruction": "إزالة عائق عن رأس الرشاش", "Check pump controller alarm": "فحص إنذار لوحة تحكم المضخة",
  "Re-pressurise extinguisher after use": "إعادة ضغط طفاية بعد الاستخدام", "Replace exit sign battery": "استبدال بطارية لوحة المخرج", "Clean kitchen hood nozzles": "تنظيف فوهات مدخنة المطبخ",
  "Replace damper actuator": "استبدال مشغل المخمد", "Tighten loose terminals in distribution board": "شد الأطراف المرتخية في لوحة التوزيع", "Relocate exit sign after fit-out": "نقل لوحة المخرج بعد التجهيز",
  // reasons and notes
  "Plant room locked — key holder off site": "غرفة المعدات مقفلة — حامل المفتاح خارج الموقع", "Ceiling void not accessible without a lift": "الفراغ العلوي غير متاح دون رافعة", "Patient room occupied — infection control": "غرفة مريض مشغولة — مكافحة العدوى",
  "Annual leave": "إجازة سنوية", "Work-at-height refresher": "تجديد تدريب العمل على المرتفعات", "Weekday on-call rota": "مناوبة أيام الأسبوع",
  "Tenant shop closed": "المحل المستأجر مغلق", "Basement zone isolated pending repair": "منطقة القبو معزولة بانتظار الإصلاح",
};
const AR_TO_EN = new Map(Object.entries(FSM_AR).map(([en, ar]) => [ar, en]));
const CODE = /^([A-Z]{1,4})-(\d{2,3}) (.+)$/;
const SEP = " — ";
const VAN = /^FSM Van (\d{2}) - ([A-Z]{2,4})$/;
function part(v: string): string | undefined {
  const hit = FSM_AR[v]; if (hit) return hit;
  const van = VAN.exec(v); if (van) return `سيارة الخدمة ${van[1]}`;
  const m = CODE.exec(v); if (m) { const t = FSM_AR[m[3]!]; if (t) return `${m[1]}-${m[2]} ${t}`; }
  return undefined;
}
/** Arabic display of an FSM demo value (exact, «code-nn type», or «part — part» with every part known). */
/** A compound title ("Planned inspection — Al Waha Hospital — South Tower"): the longest known head, then the rest. */
function compound(v: string, one: (x: string) => string | undefined): string | undefined {
  const whole = one(v.trim()); if (whole) return whole;
  const xs = v.split(SEP);
  for (let k = xs.length - 1; k >= 1; k--) {
    const head = one(xs.slice(0, k).join(SEP).trim()); if (!head) continue;
    const tail = compound(xs.slice(k).join(SEP), one); if (tail) return `${head}${SEP}${tail}`;
  }
  return undefined;
}
const FAILED_OBS = /^(.+): recorded as failed during the inspection\.$/;
export function fsmNameAr(v: string): string | undefined {
  const m = FAILED_OBS.exec(v); if (m) { const c = part(m[1]!); return c ? `${c}: سُجّل راسبًا أثناء الفحص.` : undefined; }
  return v.includes(SEP) ? compound(v, part) : part(v);
}
function partEn(v: string): string | undefined {
  const hit = AR_TO_EN.get(v); if (hit) return hit;
  const m = /^([A-Z]{1,4})-(\d{2,3}) (.+)$/.exec(v); if (m) { const t = AR_TO_EN.get(m[3]!); if (t) return `${m[1]}-${m[2]} ${t}`; }
  return undefined;
}
/** English display of an Arabic FSM demo value (the inverse of fsmNameAr). */
export function fsmNameEn(v: string): string | undefined {
  return v.includes(SEP) ? compound(v, partEn) : partEn(v);
}
