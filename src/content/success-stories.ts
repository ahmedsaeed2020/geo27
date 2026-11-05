/**
 * Customer logos for the "Success stories" marquee shown right before every demo form.
 * Logos were supplied by the owner (300px transparent originals, served as WebP CDN assets); names come from the
 * logo artwork itself and are used as alt text, so no company is described beyond its own mark.
 */
type Pointer = { url: string };

const POINTERS = import.meta.glob<Pointer>('../assets/customers/*.webp.asset.json', { eager: true, import: 'default' });

export type CustomerLogo = {
  /** File stem of the asset pointer in src/assets/customers. */
  file: string;
  name: { ar: string; en: string };
  /** Intrinsic pixel size of the uploaded artwork, so tiles reserve their space. */
  width: number;
  height: number;
  src: string;
};

type Entry = Omit<CustomerLogo, 'src' | 'width'>;

/** Curated order: sectors alternate so similar marks never sit side by side. */
const ENTRIES: Entry[] = [
  { file: 'masar', name: { ar: 'مسار', en: 'Masar' }, height: 356 },
  { file: 'atc-alkhaleej-training', name: { ar: 'مركز الخليج للتدريب ATC', en: 'ATC Al-Khaleej Training Center' }, height: 190 },
  { file: 'kayes-contracting', name: { ar: 'كايس للمقاولات', en: 'Kayes Contracting' }, height: 171 },
  { file: 'loft-rest-cafe', name: { ar: 'LOFT rest. & café', en: 'LOFT rest. & café' }, height: 165 },
  { file: '1000-fikra-real-estate', name: { ar: '1000 فكرة العقارية', en: '1000 Fikra Real Estate' }, height: 303 },
  { file: 'movepay', name: { ar: 'MovePay', en: 'MovePay' }, height: 165 },
  { file: 'tom-dr-tom-clinic', name: { ar: 'عيادة Dr. Tom', en: 'Dr. Tom Clinic' }, height: 358 },
  { file: 'cbl-city-building-leaders', name: { ar: 'CBL City Building Leaders', en: 'CBL City Building Leaders' }, height: 376 },
  { file: 'alraneem-catering', name: { ar: 'شركة الرنيم للإعاشة', en: 'AlRaneem Catering Services' }, height: 288 },
  { file: 'techno-seal', name: { ar: 'تكنو سيل', en: 'Techno Seal' }, height: 272 },
  { file: 'ensan-academy', name: { ar: 'أكاديمية بناء الإنسان', en: 'Ensan Academy' }, height: 313 },
  { file: 'mustaqbal-altatawor-logistics', name: { ar: 'مستقبل التطور للخدمات اللوجستية', en: 'Mustaqbal Al Tatawor Logistics' }, height: 300 },
  { file: 'cosmacare', name: { ar: 'CosmaCare لصناعة مستحضرات التجميل', en: 'CosmaCare Cosmetics Manufacturing' }, height: 72 },
  { file: 'tashyeed-contracting', name: { ar: 'تشييد للمقاولات', en: 'Tashyeed for Contracting' }, height: 321 },
  { file: 'telal-sitta-invest', name: { ar: 'شركة التلال الستة للاستثمار', en: 'Telal Sitta Invest Co.' }, height: 164 },
  { file: 'basic-fitness', name: { ar: 'Basic Fitness', en: 'Basic Fitness' }, height: 406 },
  { file: 'ims-trading', name: { ar: 'IMS Trading', en: 'IMS Trading' }, height: 127 },
  { file: 'falcon-security-system', name: { ar: 'أنظمة الصقر الأمنية', en: 'Falcon Security System' }, height: 271 },
  { file: 'sahem-aloula-real-estate', name: { ar: 'شركة سهم الأولى العقارية', en: 'Sahem Al-Oula Real Estate Co.' }, height: 314 },
  { file: 'water-tech-sys', name: { ar: 'نظم تقنية الماء', en: 'Water Tech. Sys.' }, height: 176 },
  { file: 'alhomaidhi', name: { ar: 'الحميضي', en: 'Alhomaidhi' }, height: 317 },
  { file: 'smartway', name: { ar: 'SmartWay', en: 'SmartWay' }, height: 77 },
  { file: 'sab-transportation', name: { ar: 'نقليات صعب', en: "Sa'b Transportation" }, height: 268 },
  { file: 'lccc', name: { ar: 'LCCC', en: 'LCCC' }, height: 300 },
  { file: 'tatweer', name: { ar: 'تطوير', en: 'Tatweer' }, height: 304 },
  { file: 'double-impact-trading', name: { ar: 'Double Impact Trading', en: 'Double Impact Trading' }, height: 209 },
  { file: 'midad-alofoq', name: { ar: 'شركة مداد الأفق المحدودة', en: 'Midad Al Ofoq Co. Ltd' }, height: 163 },
  { file: 'inca', name: { ar: 'INCA', en: 'INCA' }, height: 436 },
  { file: 'abdulaziz-alsheikh-contracting', name: { ar: 'مؤسسة عبدالعزيز آل الشيخ للمقاولات', en: 'Abdul-Aziz H. Al Sheikh Contracting Est.' }, height: 62 },
  { file: 'sese', name: { ar: 'SESE', en: 'SESE' }, height: 204 },
  { file: 'fursan-alnama', name: { ar: 'شركة فرسان النماء المحدودة', en: 'Fursan Al Nama Co.' }, height: 92 },
  { file: 'missions', name: { ar: 'Missions', en: 'Missions' }, height: 67 },
  { file: 'aramys', name: { ar: 'Aramys', en: 'Aramys' }, height: 58 },
  { file: 'ns', name: { ar: 'NS', en: 'NS' }, height: 199 },
  { file: 'b-logo', name: { ar: 'B', en: 'B' }, height: 334 },
];

export const CUSTOMER_LOGOS: CustomerLogo[] = ENTRIES.map(entry => {
  const pointer = POINTERS[`../assets/customers/${entry.file}.webp.asset.json`];
  if (!pointer) throw new Error(`Missing customer logo asset: ${entry.file}`);
  return { ...entry, width: 300, src: pointer.url };
});

/** Approved customer figure (claims rule): «أكثر من 50 منشأة سعودية». */
export const CUSTOMER_COUNT = 50;

export const SUCCESS_STORIES_COPY = {
  kicker: { ar: 'شركاء النجاح', en: 'Our customers' },
  heading: { ar: 'قصص النجاح', en: 'Success stories' },
  /** Text before and after the counted customer figure. */
  lead: {
    ar: ['أكثر من ', ' منشأة سعودية في المقاولات والعقار والتجارة والخدمات والتدريب اختارت Digit.'],
    en: ['More than ', ' Saudi businesses across contracting, real estate, trading, services and training chose Digit.'],
  },
  listLabel: { ar: 'شعارات عملاء Digit', en: 'Digit customer logos' },
  hoverHint: { ar: 'مرّر المؤشر فوق الشعارات لإيقافها', en: 'Rest the pointer on the logos to hold them still' },
} as const;
