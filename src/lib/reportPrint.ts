/**
 * Report Print / PDF (query_report.js print_report / pdf_report with the print_grid template): title, optional
 * applied-filter subtitle (get_filters_html_for_print), the shown columns and rows, letter head and orientation from
 * the print settings dialog. Rendered in the browser from the rows on screen — no Frappe print server is involved;
 * PDF is produced client-side (html2canvas + jsPDF), so fonts/pagination are the browser's, not wkhtmltopdf's.
 */
import { adapter } from "./adapter";

export interface PrintOpts {
  title: string; columns: { label: string; numeric: boolean }[]; rows: { cells: string[]; bold: boolean; indent: number }[];
  filters: [string, string][]; includeFilters: boolean; orientation: "Landscape" | "Portrait"; letterHead?: string | undefined;
  dir: "rtl" | "ltr"; lang: string; printedOn: string;
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Letter Head content without scripts/handlers (Letter Head source HTML or Image). */
export function letterHeadHtml(name: string | undefined): string {
  if (!name) return "";
  const lh = adapter.get("Letter Head", name);
  if (!lh) return "";
  if (lh["source"] === "Image" && lh["image"]) return `<img src="${esc(String(lh["image"]))}" style="max-height:80px" alt="">`;
  const raw = String(lh["content"] ?? lh["letter_head_name"] ?? name);
  return raw.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+="[^"]*"/gi, "").replace(/\son\w+='[^']*'/gi, "").replace(/javascript:/gi, "");
}
export function buildPrintHtml(o: PrintOpts): string {
  const head = o.columns.map((c) => `<th class="${c.numeric ? "num" : ""}">${esc(c.label)}</th>`).join("");
  const body = o.rows.map((r) => `<tr class="${r.bold ? "b" : ""}">${r.cells.map((v, i) => `<td class="${o.columns[i]?.numeric ? "num" : ""}"${i === 0 && r.indent ? ` style="padding-inline-start:${6 + r.indent * 14}px"` : ""}>${esc(v)}</td>`).join("")}</tr>`).join("");
  const subtitle = o.includeFilters && o.filters.length ? `<div class="filters">${o.filters.map(([k, v]) => `<span><b>${esc(k)}:</b> ${esc(v)}</span>`).join("")}</div>` : "";
  return `<!doctype html><html lang="${o.lang}" dir="${o.dir}"><head><meta charset="utf-8"><title>${esc(o.title)}</title><style>
@page { size: A4 ${o.orientation === "Landscape" ? "landscape" : "portrait"}; margin: 12mm; }
body { font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif; color: #111; font-size: ${o.columns.length > 10 ? 9 : 10.5}px; margin: 0; padding: 12px; background: #fff; }
h2 { font-size: 16px; margin: 6px 0 4px; } .filters { display: flex; flex-wrap: wrap; gap: 4px 14px; color: #444; margin-bottom: 8px; }
table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #d0d0d0; padding: 3px 6px; text-align: start; vertical-align: top; }
th { background: #f3f3f3; } .num { text-align: end; font-variant-numeric: tabular-nums; } tr.b td { font-weight: 600; background: #fafafa; }
.lh { margin-bottom: 8px; } .foot { margin-top: 8px; color: #666; font-size: 9px; text-align: end; }
</style></head><body data-report-print><div class="lh">${letterHeadHtml(o.letterHead)}</div><h2>${esc(o.title)}</h2>${subtitle}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><div class="foot">${esc(o.printedOn)}</div></body></html>`;
}
/** Print: a new window with the print grid, then the browser print dialog. Returns false when pop-ups are blocked. */
export function openPrint(html: string): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  w.addEventListener("load", () => { try { w.focus(); w.print(); } catch { /* user closed */ } });
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* already printed */ } }, 400);
  return true;
}
/** PDF: renders the same HTML off-screen and saves an A4 PDF in the chosen orientation. Returns the page count. */
export async function savePdf(html: string, filename: string, orientation: "Landscape" | "Portrait"): Promise<number> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: orientation === "Landscape" ? "1123px" : "794px", height: "1200px", border: "0" });
  document.body.appendChild(frame);
  try {
    const d = frame.contentDocument!; d.open(); d.write(html); d.close();
    await new Promise((r) => setTimeout(r, 50));
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
    const canvas = await html2canvas(d.body, { scale: 2, backgroundColor: "#ffffff", windowWidth: frame.clientWidth });
    const land = orientation === "Landscape";
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: land ? "landscape" : "portrait" });
    const w = land ? 297 : 210, pageH = land ? 210 : 297; const h = (canvas.height * w) / canvas.width;
    const img = canvas.toDataURL("image/jpeg", 0.92);
    for (let y = 0; y < h; y += pageH) { if (y) pdf.addPage(); pdf.addImage(img, "JPEG", 0, -y, w, h); }
    pdf.save(filename);
    return pdf.getNumberOfPages();
  } finally { frame.remove(); }
}
