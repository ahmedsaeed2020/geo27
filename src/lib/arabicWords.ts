/** Arabic amount in words (SAR: ريال / هللة) with gender agreement and counted-noun grammar. Display text only. */
const M = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة"];
const F = ["", "واحدة", "اثنتان", "ثلاث", "أربع", "خمس", "ست", "سبع", "ثماني", "تسع", "عشر"];
const TENS = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

function below100(x: number, fem: boolean): string {
  const ones = fem ? F : M;
  if (x <= 10) return x === 10 ? (fem ? "عشر" : "عشرة") : ones[x]!;
  if (x < 20) {
    if (x === 11) return fem ? "إحدى عشرة" : "أحد عشر";
    if (x === 12) return fem ? "اثنتا عشرة" : "اثنا عشر";
    return ones[x - 10] + (fem ? " عشرة" : " عشر");
  }
  const o = x % 10, t = TENS[Math.floor(x / 10)]!;
  return o ? ones[o] + " و" + t : t;
}
function below1000(x: number, fem: boolean): string {
  const h = Math.floor(x / 100), r = x % 100;
  const parts = [h ? HUNDREDS[h]! : "", r ? below100(r, fem) : ""].filter(Boolean);
  return parts.join(" و");
}
const SCALES: [number, string, string, string][] = [
  [1e9, "مليار", "ملياران", "مليارات"],
  [1e6, "مليون", "مليونان", "ملايين"],
  [1e3, "ألف", "ألفان", "آلاف"],
];
export function arabicNumberWords(n: number, fem = false): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "صفر";
  const parts: string[] = [];
  for (const [v, one, two, plural] of SCALES) {
    const c = Math.floor(n / v);
    if (!c) continue;
    n %= v;
    if (c === 1) parts.push(one);
    else if (c === 2) parts.push(two);
    else if (c <= 10) parts.push(below1000(c, false) + " " + plural);
    else parts.push(below1000(c, false) + " " + one);
  }
  if (n) parts.push(below1000(n, fem));
  return parts.join(" و");
}
/** Counted noun: n=1 → "X واحد", 2 → dual, 3–10 → plural, 11–99 (last two digits) → accusative singular, else singular. */
function counted(n: number, fem: boolean, sing: string, dual: string, plural: string, acc: string): string {
  if (n === 1) return sing + " " + (fem ? "واحدة" : "واحد");
  if (n === 2) return dual;
  const r = n % 100;
  const words = arabicNumberWords(n, fem);
  if (r >= 3 && r <= 10) return words + " " + plural;
  if (r >= 11) return words + " " + acc;
  return words + " " + sing;
}
export function arabicMoneyInWords(amount: number): string {
  const a = Math.abs(amount);
  const main = Math.floor(a + 1e-9); const frac = Math.round((a - main) * 100);
  const parts: string[] = [];
  if (main) parts.push(counted(main, false, "ريال", "ريالان", "ريالات", "ريالاً"));
  if (frac) parts.push(counted(frac, true, "هللة", "هللتان", "هللات", "هللة"));
  if (!parts.length) parts.push("صفر ريال");
  return "فقط " + parts.join(" و") + " لا غير";
}
