/**
 * Card export (Enterprise Visual Round 1 §5 ⋯ menu): PNG of the card's chart and an Excel-ready file (UTF-8 CSV with BOM,
 * opens in Excel with Arabic intact; the Riyal sign leaves the screen as "SAR") of the card's figures. Browser-only; nothing is stored.
 */
import type { WidgetData } from "./registry";

const csvCell = (v: unknown) => { const s = String(v ?? "").replace(/\u20C1\s?/g, "SAR "); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** Rows of a card: from its widget data when known, else from the first table drawn inside it, else from chart mark labels. */
export function cardRows(data: WidgetData | undefined, el: Element | null, ar: boolean): string[][] {
  if (data?.kind === "number") return [[ar ? "القيمة" : "Value"], [data.display ?? String(data.value)]];
  if (data?.kind === "series") return [[ar ? "البند" : "Item", data.valueLabel ? (ar ? data.valueLabel[1] : data.valueLabel[0]) : ar ? "القيمة" : "Value"], ...data.points.map((p) => [p.label, String(p.value)])];
  if (data?.kind === "matrix") return [["", ...data.colKeys], ...data.rowKeys.map((r, i) => [r, ...(data.values[i] ?? []).map(String)])];
  if (data?.kind === "rows") return [data.columns.map((c) => (ar ? c.label[1] : c.label[0])), ...data.rows.map((r) => data.columns.map((c) => String((r as unknown as { cells?: Record<string, unknown> }).cells?.[c.key] ?? (r as unknown as Record<string, unknown>)[c.key] ?? "")))];
  const table = el?.querySelector("table");
  if (table) return [...table.querySelectorAll("tr")].map((tr) => [...tr.querySelectorAll("th,td")].map((c) => (c.textContent ?? "").trim()));
  const marks = el ? [...el.querySelectorAll("[data-ek-chart] [aria-label], [data-ek-chart] title")] : [];
  return [[ar ? "البند" : "Item"], ...marks.map((m) => [(m.getAttribute("aria-label") ?? m.textContent ?? "").trim()]).filter((r) => r[0])];
}
const download = (href: string, name: string) => { const a = document.createElement("a"); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
const safe = (name: string) => name.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "card";
/** Excel-ready download of a card's rows. */
export function exportExcel(name: string, rows: string[][]) {
  const text = "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  download(url, `${safe(name)}.csv`); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** PNG of the largest chart drawn in a card (computed colours inlined so the image matches the screen). */
export async function exportPng(el: Element | null, name: string): Promise<boolean> {
  const svgs = el ? [...el.querySelectorAll("svg")] : [];
  const svg = svgs.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
  if (!svg) return false;
  const box = svg.getBoundingClientRect(); const w = Math.max(1, Math.round(box.width)), h = Math.max(1, Math.round(box.height));
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = [svg, ...svg.querySelectorAll("*")], dst = [clone, ...clone.querySelectorAll("*")];
  src.forEach((n, i) => { const cs = getComputedStyle(n); const d = dst[i] as SVGElement | undefined; if (!d) return; for (const p of ["fill", "stroke", "color", "opacity", "stroke-width", "font-size", "font-family", "font-weight"]) d.style.setProperty(p, cs.getPropertyValue(p)); });
  clone.setAttribute("width", String(w)); clone.setAttribute("height", String(h)); clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  try {
    const img = new Image(); await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error("image")); img.src = url; });
    const c = document.createElement("canvas"); c.width = w * 2; c.height = h * 2; const g = c.getContext("2d"); if (!g) return false;
    g.fillStyle = getComputedStyle(el as Element).backgroundColor || "white"; g.fillRect(0, 0, c.width, c.height); g.scale(2, 2); g.drawImage(img, 0, 0, w, h);
    download(c.toDataURL("image/png"), `${safe(name)}.png`); return true;
  } catch { return false; } finally { URL.revokeObjectURL(url); }
}
