/**
 * Visual audit (dev helper): scans a rendered page (a same-origin iframe document) for the rules of the visual system that
 * stay after Enterprise Visual Round 1 (tokens only, Emerald text >= 16px on white, dd/mm/yyyy, KPI change or range, no
 * skeleton hero, dark text contrast >= 4.5:1) and returns findings with a sample. Read-only; used by the developer-only
 * /dev/visual-audit screen as a helper — it never blocks a release (Round 1 §2 removed the "zero findings" gate, the
 * chart-colour cap and the "two green blocks" finding).
 */
export type AuditCheck = "raw-hex" | "emerald-small-text" | "date-format" | "kpi-delta-range" | "hero-skeleton" | "dark-contrast";
export interface AuditFinding { check: AuditCheck; sample: string }
export const AUDIT_CHECKS: { id: AuditCheck; en: string; ar: string }[] = [
  { id: "raw-hex", en: "Raw hex colour outside the tokens", ar: "لون سداسي خام خارج الرموز" },
  { id: "emerald-small-text", en: "Emerald text under 16px", ar: "نص زمردي أصغر من 16px" },
  { id: "date-format", en: "Date not dd/mm/yyyy", ar: "تاريخ ليس بصيغة dd/mm/yyyy" },
  { id: "kpi-delta-range", en: "KPI card without change or range", ar: "بطاقة مؤشر بلا تغير أو نطاق" },
  { id: "hero-skeleton", en: "Hero with skeleton decoration", ar: "شريط علوي بزخرفة هيكلية" },
  { id: "dark-contrast", en: "Dark mode text contrast under 4.5:1", ar: "تباين نص الوضع الداكن أقل من 4.5:1" },
];

type RGBA = [number, number, number, number];
export function parseRgb(v: string): RGBA | null {
  const m = v.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
  return [Number(m[1]), Number(m[2]), Number(m[3]), a];
}
const lum = ([r, g, b]: RGBA) => { const f = (c: number) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
/** WCAG contrast ratio of two opaque colours. */
export function contrast(a: RGBA, b: RGBA): number { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
const blend = (fg: RGBA, bg: RGBA): RGBA => [fg[0] * fg[3] + bg[0] * (1 - fg[3]), fg[1] * fg[3] + bg[1] * (1 - fg[3]), fg[2] * fg[3] + bg[2] * (1 - fg[3]), 1];
const near = (a: RGBA, b: RGBA, tol = 6) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;

/** dd-mm-yyyy or yyyy-mm-dd in visible text (codes such as PAY-2026-11-0001 do not count). */
export const BAD_DATE = /(?<![\w/.-])(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})(?![\w/-])/;
export const HEX = /#[0-9a-fA-F]{3,8}\b/;
const SKIP = "script, style, textarea, input, select, code, pre, [data-raw-date], [contenteditable], [aria-hidden='true'] title";

function visible(el: Element, win: Window): boolean {
  const cs = win.getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
  const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
}
function textOf(el: Element): string { let t = ""; el.childNodes.forEach((n) => { if (n.nodeType === 3) t += n.nodeValue ?? ""; }); return t.trim(); }

export function auditDocument(doc: Document, o: { dark?: boolean } = {}): AuditFinding[] {
  const win = doc.defaultView!; const out: AuditFinding[] = [];
  const main = doc.querySelector("[data-shell-main]") ?? doc.body;
  const probe = doc.createElement("i"); probe.style.display = "none"; doc.body.appendChild(probe);
  const tok = (name: string): RGBA | null => { probe.style.color = `var(${name})`; return parseRgb(win.getComputedStyle(probe).color); };
  const emerald = tok("--emerald");
  probe.remove();
  const push = (check: AuditCheck, sample: string) => { if (out.filter((f) => f.check === check).length < 40) out.push({ check, sample: sample.slice(0, 140) }); };
  const els = [...main.querySelectorAll("*")];

  // 1 raw hex in inline styles / svg paint attributes
  for (const el of els) {
    if (!visible(el, win)) continue; // a hidden element (e.g. the CRM band mark under R3) is not seen
    const st = el.getAttribute("style") ?? ""; const paint = `${el.getAttribute("fill") ?? ""} ${el.getAttribute("stroke") ?? ""} ${el.getAttribute("stop-color") ?? ""}`;
    if (HEX.test(st) || HEX.test(paint)) push("raw-hex", `<${el.tagName.toLowerCase()} ${(st.match(HEX) ?? paint.match(HEX))![0]}> ${textOf(el)}`);
  }
  // 2 emerald text under 16px, 4 dates, 8 dark contrast
  const bgOf = (el: Element): RGBA => {
    const layers: RGBA[] = []; let cur: Element | null = el;
    while (cur) { const c = parseRgb(win.getComputedStyle(cur).backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 0.99) break; } cur = cur.parentElement; }
    let base: RGBA = layers.length && layers[layers.length - 1]![3] >= 0.99 ? layers.pop()! : parseRgb(win.getComputedStyle(doc.body).backgroundColor) ?? [255, 255, 255, 1];
    for (let k = layers.length - 1; k >= 0; k--) base = blend(layers[k]!, base);
    return base;
  };
  for (const el of els) {
    const txt = textOf(el); if (!txt || el.closest(SKIP) || !visible(el, win)) continue;
    const cs = win.getComputedStyle(el); const size = parseFloat(cs.fontSize); const col = parseRgb(cs.color);
    if (emerald && col && col[3] > 0.5 && near(col, emerald, 4) && size < 16) push("emerald-small-text", `${txt} (${size}px)`);
    if (BAD_DATE.test(txt)) push("date-format", txt);
    if (o.dark && col) { const bg = bgOf(el); const fg = blend(col, bg); const big = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700); const ratio = contrast(fg, bg); if (ratio < (big ? 3 : 4.5)) push("dark-contrast", `${txt} (${ratio.toFixed(2)}:1)`); }
  }
  // 5 KPI cards without a change and without an as-of / range line
  for (const k of main.querySelectorAll("[data-dash-view='kpi'], .ek-kpi")) {
    if (!visible(k, win) || k.closest("[data-dash-view='kpi']") !== k && k.matches(".ek-kpi") && k.querySelector("[data-dash-view='kpi']")) continue;
    if (!k.querySelector(".ek-delta, [data-dash-meta], .ek-kpi-sub, .ek-kpi-updated, [data-kpi-meta]")) push("kpi-delta-range", (k.textContent ?? "").trim());
  }
  // 6 skeleton decoration on a hero
  for (const m of main.querySelectorAll(".ek-band-mark")) if (visible(m, win)) push("hero-skeleton", "band mark visible");
  return out;
}
