/**
 * Bilingual name pools for the memory-only sample layer. Values are stored Arabic-first with the English alternate in
 * `__name_en` (the same convention as src/lib/seedNamesAr.ts), so Arabic screens show Arabic party and employee names.
 * All organisations and people are fictional.
 */
export type Pair = readonly [en: string, ar: string];

const BRANDS: Pair[] = [
  ["Al-Masaa", "المساء"], ["Al-Afaq", "الآفاق"], ["Al-Riyadah", "الريادة"], ["Al-Itqan", "الإتقان"], ["Al-Sharq", "الشرق"],
  ["Al-Muntazah", "المنتزه"], ["Al-Barakah", "البركة"], ["Al-Wafa", "الوفاء"], ["Al-Tamayuz", "التميز"], ["Al-Nakheel", "النخيل"],
  ["Al-Fursan", "الفرسان"], ["Al-Yusr", "اليسر"], ["Al-Majd", "المجد"], ["Al-Ruwad", "الرواد"], ["Al-Safa", "الصفا"],
  ["Al-Marwa", "المروة"], ["Al-Hilal", "الهلال"], ["Al-Joud", "الجود"], ["Al-Ufuq", "الأفق"], ["Al-Zahra", "الزهراء"],
];
const SECTORS: Pair[] = [
  ["Trading", "للتجارة"], ["Contracting", "للمقاولات"], ["Industries", "للصناعات"], ["Logistics", "للخدمات اللوجستية"],
  ["Hospitality", "للضيافة"], ["Medical Co.", "الطبية"], ["Real Estate", "العقارية"], ["Foods", "للأغذية"],
];
const SUPPLY: Pair[] = [
  ["Electrical Supply", "للتوريدات الكهربائية"], ["Steel", "للحديد والصلب"], ["Tools", "للعدد والأدوات"], ["Packaging", "للتغليف"],
  ["Industrial Supplies", "للمستلزمات الصناعية"], ["Office Supplies", "للأدوات المكتبية"], ["Transport", "للنقل"], ["Safety Equipment", "لمعدات السلامة"],
];
const SUPPLIER_BRANDS: Pair[] = [
  ["Al-Rashid", "الراشد"], ["Al-Muhanna", "المهنا"], ["Al-Babtain", "البابطين"], ["Al-Suwailem", "السويلم"], ["Al-Fawzan", "الفوزان"],
  ["Al-Hokair", "الحكير"], ["Al-Turki", "التركي"], ["Al-Khudairi", "الخضيري"], ["Al-Jabr", "الجبر"], ["Al-Omran", "العمران"],
];

/** Company-style organisation names: "<prefix><brand> <sector>". */
export function orgName(i: number): Pair {
  const b = BRANDS[i % BRANDS.length]!; const s = SECTORS[(i * 3 + Math.floor(i / BRANDS.length)) % SECTORS.length]!;
  const pre = i % 3 === 0 ? "مؤسسة " : "شركة ";
  return [`${b[0]} ${s[0]}`, `${pre}${b[1]} ${s[1]}`];
}
export function supplierName(i: number): Pair {
  const b = SUPPLIER_BRANDS[i % SUPPLIER_BRANDS.length]!; const s = SUPPLY[(i * 5 + Math.floor(i / SUPPLIER_BRANDS.length)) % SUPPLY.length]!;
  return [`${b[0]} ${s[0]}`, `${i % 2 ? "مؤسسة" : "شركة"} ${b[1]} ${s[1]}`];
}

let ORG_EN: Map<string, string> | null = null;
/** English of an Arabic organisation / supplier name produced by orgName / supplierName (display only; owner X-01: no Arabic
 *  sample names on English screens), or undefined for any other value. */
export function volumeOrgEn(ar: string): string | undefined {
  if (!ORG_EN) {
    ORG_EN = new Map();
    for (const b of BRANDS) for (const s of SECTORS) for (const pre of ["مؤسسة ", "شركة "]) ORG_EN.set(`${pre}${b[1]} ${s[1]}`, `${b[0]} ${s[0]}`);
    for (const b of SUPPLIER_BRANDS) for (const s of SUPPLY) for (const pre of ["مؤسسة", "شركة"]) ORG_EN.set(`${pre} ${b[1]} ${s[1]}`, `${b[0]} ${s[0]}`);
  }
  return ORG_EN.get(ar);
}

export const FIRST_M: Pair[] = [
  ["Ibrahim", "إبراهيم"], ["Abdulrahman", "عبدالرحمن"], ["Mansour", "منصور"], ["Rakan", "راكان"], ["Waleed", "وليد"], ["Hassan", "حسن"],
  ["Ziyad", "زياد"], ["Meshal", "مشعل"], ["Nawaf", "نواف"], ["Hamza", "حمزة"], ["Talal", "طلال"], ["Adel", "عادل"],
  ["Badr", "بدر"], ["Saleh", "صالح"], ["Anas", "أنس"], ["Osama", "أسامة"], ["Yazeed", "يزيد"], ["Mazen", "مازن"],
];
export const FIRST_F: Pair[] = [
  ["Amal", "أمل"], ["Hanan", "حنان"], ["Wafa", "وفاء"], ["Ghada", "غادة"], ["Nouf", "نوف"], ["Razan", "رزان"],
  ["Lina", "لينا"], ["Arwa", "أروى"], ["Bushra", "بشرى"], ["Huda", "هدى"], ["Afnan", "أفنان"], ["Jawaher", "جواهر"],
];
export const LAST: Pair[] = [
  ["Al-Subaie", "السبيعي"], ["Al-Malki", "المالكي"], ["Al-Juhani", "الجهني"], ["Al-Balawi", "البلوي"], ["Al-Rashidi", "الرشيدي"],
  ["Al-Asmari", "الأسمري"], ["Al-Yami", "اليامي"], ["Al-Sahli", "السهلي"], ["Al-Hazmi", "الحازمي"], ["Al-Omari", "العمري"],
  ["Al-Shahrani", "الشهراني"], ["Al-Bishi", "البيشي"], ["Al-Khaldi", "الخالدي"], ["Al-Ruwaili", "الرويلي"], ["Al-Tamimi", "التميمي"],
];
export interface Person { first: Pair; last: Pair; female: boolean }
export function person(i: number): Person {
  const female = i % 4 === 3;
  const first = female ? FIRST_F[(i * 7) % FIRST_F.length]! : FIRST_M[(i * 5) % FIRST_M.length]!;
  return { first, last: LAST[(i * 11 + Math.floor(i / 3)) % LAST.length]!, female };
}
export const fullEn = (p: Person) => `${p.first[0]} ${p.last[0]}`;
export const fullAr = (p: Person) => `${p.first[1]} ${p.last[1]}`;

export const CITIES: Pair[] = [["Riyadh", "الرياض"], ["Jeddah", "جدة"], ["Dammam", "الدمام"], ["Makkah", "مكة المكرمة"], ["Madinah", "المدينة المنورة"], ["Khobar", "الخبر"]];
