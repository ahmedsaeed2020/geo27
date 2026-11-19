/**
 * Date display (owner visual round R3, 2026-11-15): every date reads dd/mm/yyyy and every month «أكت 2026» / «Oct 2026».
 * Pure formatters for code that builds labels, plus one display-only DOM pass (started from src/routes/__root.tsx) that
 * rewrites ISO dates (yyyy-mm-dd[ hh:mm]), dd-mm-yyyy and bare months (yyyy-mm) in visible text — the same display-only
 * approach as the language layer: stored values, inputs, exports and URLs never change. Text inside [data-raw-date],
 * inputs, textareas, scripts and editable regions is left alone.
 */
const MON_AR = ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"];
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isAr = () => typeof document !== "undefined" && document.documentElement.lang === "ar";

/** "2026-11-15" (or a Date / "2026-11-15 09:30") → "15/11/2026" (" 09:30" kept). Anything else is returned as given. */
export function fmtDay(v: unknown): string {
  const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return String(v ?? "");
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
}
/** "2026-10" → «أكت 2026» / «Oct 2026». */
export function fmtMonth(ym: string, ar = isAr()): string {
  const m = ym.match(/^(\d{4})-(\d{2})/); if (!m) return ym;
  const i = Number(m[2]) - 1; if (i < 0 || i > 11) return ym;
  return `${(ar ? MON_AR : MON_EN)[i]} ${m[1]}`;
}
const okDay = (mo: string, d: string) => { const a = Number(mo), b = Number(d); return a >= 1 && a <= 12 && b >= 1 && b <= 31; };
const ISO = /(?<![\w/.-])(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(?![\w/-])/g;
const DMY = /(?<![\w/.-])(\d{2})-(\d{2})-(\d{4})(?![\w/-])/g;
const YM = /(?<![\w/.-])((?:19|20)\d{2})-(0[1-9]|1[0-2])(?![\w/-])/g;
/** Every date and month in a text, in display form (dd/mm/yyyy, «أكت 2026»). */
export function displayDates(s: string, ar = isAr()): string {
  if (!/\d{2}-\d{2}/.test(s) && !/\d{4}-\d{2}/.test(s)) return s;
  return s.replace(ISO, (all, y: string, mo: string, d: string, h?: string, mi?: string) => (okDay(mo, d) ? `${d}/${mo}/${y}${h ? ` ${h}:${mi}` : ""}` : all))
    .replace(DMY, (all, d: string, mo: string, y: string) => (okDay(mo, d) ? `${d}/${mo}/${y}` : all))
    .replace(YM, (_all, y: string, mo: string) => fmtMonth(`${y}-${mo}`, ar));
}

/* ---------------------------------------------------------------- display-only DOM pass ---------------------------------------------------------------- */
const SKIP = "script, style, textarea, input, select option[value], [contenteditable], [data-raw-date], code, pre";
const hydrated = (el: Element) => Object.keys(el).some((k) => k.startsWith("__reactFiber$"));
let observer: MutationObserver | null = null; let retry = 0; let skipped = false; let busy = false;
/* Owner notes A-11: a negative amount reads red with a real minus sign (U+2212) on every screen. Display only: the text
 * node that holds just the amount ("-1,250.00", "⃁ -1,250.00", "SAR -1,250.00") gets the minus sign and its element
 * data-neg (coloured by round1.css); inputs, charts' SVG text, exports and stored values never change. */
const NEG = /^[\s\u2066-\u2069\u200e\u200f]*(?:\u20C1\s?|[A-Z]{3}\s)?[-\u2212]\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?[\s\u2066-\u2069]*$/;
const NEG_SKIP = "input, textarea, select, svg, [contenteditable], script, style, code, pre, [data-neg-off]";
export function negativeAmount(text: string): boolean { return NEG.test(text); }
function neg(node: Node, p: Element) {
  const cur = node.nodeValue ?? "";
  if (NEG.test(cur)) {
    if (p.closest(NEG_SKIP)) return;
    const out = cur.replace(/-(?=\s?\d)/, "\u2212"); if (out !== cur) node.nodeValue = out;
    if (!p.hasAttribute("data-neg")) p.setAttribute("data-neg", "");
  } else if (p.hasAttribute("data-neg") && !NEG.test(p.textContent ?? "")) p.removeAttribute("data-neg");
}
function fix(node: Node) {
  const p = node.parentElement; if (!p || p.closest(SKIP)) return;
  if (document.body && hydrated(document.body) && !hydrated(p)) { skipped = true; return; }
  const cur = node.nodeValue ?? "";
  if (/\d/.test(cur) && /[-\u2212]/.test(cur) || p.hasAttribute("data-neg")) neg(node, p);
  if (cur.length < 7) return;
  const out = displayDates(node.nodeValue ?? ""); if (out !== node.nodeValue) node.nodeValue = out;
}
function walk(root: Node) {
  if (root.nodeType === 3) { fix(root); return; }
  if (root.nodeType !== 1) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) fix(n);
}
function pass() {
  skipped = false; busy = true; walk(document.body); busy = false;
  if (skipped && retry++ < 60) setTimeout(pass, 150);
}
/** Starts the display-only date pass for the whole document (idempotent). */
export function startDateDisplay() {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined" || observer) return;
  pass();
  observer = new MutationObserver((muts) => {
    if (busy) return; busy = true;
    for (const m of muts) { if (m.type === "characterData") fix(m.target); else m.addedNodes.forEach(walk); }
    busy = false;
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
}
