import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { indexQuery, slugOf } from "@/lib/catalog";
import { printFormatsQuery, formatsFor, renderPrint, STANDARD } from "@/lib/printEngine";
import { adapter } from "@/lib/adapter";
import { useLang, type Lang } from "@/i18n";
import { useHydrated } from "@/components/hrms/HrShell";
import { BRAND_HEADER, FRAME_CSS, pageCss } from "@/lib/printFrame";

type Search = { doctype: string; name: string; names?: string | undefined; format?: string | undefined; lang?: Lang | undefined; letterhead?: string | undefined; trigger?: string | undefined };
export const Route = createFileRoute("/printview")({
  validateSearch: (raw: Record<string, unknown>): Search => { const s = raw as { doctype?: unknown; name?: unknown; names?: unknown; format?: unknown; lang?: unknown; letterhead?: unknown; trigger?: unknown }; return { doctype: String(s.doctype ?? ""), name: String(s.name ?? ""), ...(typeof s.names === "string" && s.names ? { names: s.names } : {}), format: s.format ? String(s.format) : undefined, lang: s.lang === "en" || s.lang === "ar" ? s.lang : undefined, letterhead: s.letterhead !== undefined ? String(s.letterhead) : undefined, trigger: s.trigger ? String(s.trigger) : undefined }; },
  head: () => ({ meta: [{ title: "Print — Digit Virtual Core" }, { name: "description", content: "Print preview, print format, letter head, language and PDF download for any document." }, { property: "og:title", content: "Print — Digit Virtual Core" }, { property: "og:description", content: "Print preview and PDF for documents." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: PrintView,
});

const PRINT_CSS = `
.pf-page{background:#fff;color:#111;font-size:13px;line-height:1.5;padding:32px 40px;max-width:820px;margin:0 auto;font-family:"Noto Naskh Arabic","IBM Plex Sans Arabic",system-ui,sans-serif}
.pf-page h2{font-size:22px;margin:0}.pf-heading{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #222;padding-bottom:8px;margin-bottom:16px}
.pf-sub{color:#555;direction:ltr}.pf-section{margin:10px 0}.pf-section h4{font-size:12px;text-transform:uppercase;color:#666;margin:12px 0 6px;border-bottom:1px solid #ddd}
.pf-row{display:grid;gap:24px}.pf-field{display:flex;gap:8px;margin:3px 0}.pf-label{color:#666;min-width:40%}.pf-value{font-weight:500}
.pf-wide{display:block}.pf-table{width:100%;border-collapse:collapse;margin:10px 0}.pf-table th,.pf-table td{border:1px solid #d4d4d4;padding:5px 7px;text-align:start;vertical-align:top}
.pf-table th{background:#f3f3f3;font-weight:600}.pf-num{text-align:end!important;font-variant-numeric:tabular-nums}.pf-sr{width:32px}
.pf-totals{margin-inline-start:auto;width:55%;border-collapse:collapse}.pf-totals td{padding:5px 7px;border-bottom:1px solid #e5e5e5}.pf-grand td{font-weight:700;border-top:2px solid #222}
.pf-bi{display:inline-flex;flex-direction:column;line-height:1.2}.pf-bi small{color:#777;font-size:10px}.pf-words{margin-top:12px;padding:8px;background:#f7f7f7}
.pf-flex{display:flex;gap:3%}.pf-bfield{margin:4px 0}.pf-bl{display:flex;gap:8px}.pf-merged{color:#6b7280;font-size:11px;display:block}.pf-divider{border:0;border-top:1px solid #e5e7eb;margin:10px 0}.pf-repeat{display:flex;padding:3px 0}
.pf-letterhead{margin-bottom:12px}.pf-letterhead img{max-height:80px}
@media print{body *{visibility:hidden}.pf-page,.pf-page *{visibility:visible}.pf-page{position:absolute;inset:0;padding:12mm;max-width:none}}
.pf-multi .pf-page{margin-bottom:24px}
@media print{.pf-multi{position:absolute;inset:0}.pf-multi .pf-page{position:static;break-after:page;margin:0}}
`;

function PrintView() {
  const s = Route.useSearch(); const nav = useNavigate(); const ui = useLang(); const hydrated = useHydrated();
  const ix = useQuery(indexQuery); const pfs = useQuery({ ...printFormatsQuery, enabled: typeof window !== "undefined" });
  const lang: Lang = s.lang ?? ui; const fmts = pfs.data ? formatsFor(pfs.data, s.doctype) : [STANDARD];
  const format = s.format ?? fmts[0] ?? STANDARD;
  const heads = hydrated ? adapter.list("Letter Head") : [];
  // default header = the company branding of the Enterprise print frame; a Letter Head or "none" is still selectable
  const lh = s.letterhead ?? BRAND_HEADER; const header = lh === "" ? null : lh;
  const [out, setOut] = useState<{ html: string; css: string; kind: string } | null>(null);
  // bulk print (list Actions → Print, bulk_operations.js print): one page per selected document, same format/letter head
  const many = (() => { try { const a: unknown = s.names ? JSON.parse(s.names) : null; return Array.isArray(a) && a.length > 1 ? a.map(String) : null; } catch { return null; } })();
  const manyKey = many?.join("\u0000") ?? "";
  const [pages, setPages] = useState<{ name: string; html: string; css: string; kind: string }[] | null>(null);
  const ref = useRef<HTMLDivElement>(null); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!hydrated || !ix.data || !pfs.data) return;
    if (many) { void Promise.all(many.map((n) => renderPrint(ix.data!, pfs.data!, s.doctype, n, format, lang, header).then((o) => ({ ...o, name: n })))).then((ps) => { setPages(ps); setOut(ps[0] ?? null); }); return; }
    setPages(null);
    renderPrint(ix.data, pfs.data, s.doctype, s.name, format, lang, header).then(setOut);
  }, [hydrated, ix.data, pfs.data, s.doctype, s.name, manyKey, format, lang, lh]); // eslint-disable-line react-hooks/exhaustive-deps
  // "page x of y": the frame footer sits on the last A4 sheet of each document; browser print numbers every page in the @page margin
  useEffect(() => {
    const root = ref.current; if (!root) return;
    const sheets = pages ? Array.from(root.querySelectorAll<HTMLElement>("[data-print-page]")) : [root];
    for (const el of sheets) { const n = Math.max(1, Math.ceil(el.scrollHeight / ((el.clientWidth * 297) / 210) - 0.02)); el.querySelectorAll("[data-pf-pages],[data-pf-page]").forEach((x) => { x.textContent = String(n); }); el.setAttribute("data-pf-sheets", String(n)); }
  }, [out, pages]);
  const set = (p: Partial<Search>) => nav({ to: "/printview", search: { ...s, ...p } });
  const app = ix.data?.find((e) => e.name === s.doctype)?.app ?? "erpnext";
  async function pdf() {
    if (!ref.current) return; setBusy(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
      const doc = new jsPDF({ unit: "mm", format: "a4" }); const w = 210; const pageH = 297;
      const sheets = pages ? Array.from(ref.current.querySelectorAll<HTMLElement>("[data-print-page]")) : [ref.current];
      let first = true;
      for (const el of sheets) {
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", onclone: (d) => d.querySelectorAll<HTMLElement>("[data-pf-pageno]").forEach((x) => { x.style.display = "none"; }) });
        // A4 pages break between table rows, and a table that continues on the next page repeats its header row there
        for (const page of pdfPages(el, canvas)) { if (!first) doc.addPage(); first = false; doc.addImage(page, "JPEG", 0, 0, w, pageH); }
      }
      const total = doc.getNumberOfPages();
      for (let i = 1; i <= total; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(91, 107, 99); doc.text(`${i} / ${total}`, w / 2, pageH - 6, { align: "center" }); }
      doc.save(`${s.doctype}-${pages ? `${pages.length}` : s.name}.pdf`.replace(/\s+/g, "_"));
      (window as unknown as { __lastPdfPages?: number }).__lastPdfPages = doc.getNumberOfPages();
    } finally { setBusy(false); }
  }
  return (
    <div className="min-h-screen bg-muted/40">
      <style>{PRINT_CSS + FRAME_CSS + pageCss(lang) + (out?.css ?? "")}</style>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2 text-sm print:hidden" data-print-toolbar>
        {pages ? <Link to="/app/$app/$doctype" params={{ app, doctype: slugOf(s.doctype) }} className="btn-ghost" data-print-back-list>← <span>{s.doctype}</span> <span data-no-i18n>({pages.length})</span></Link>
          : <Link to="/app/$app/$doctype/$name" params={{ app, doctype: slugOf(s.doctype), name: s.name }} className="btn-ghost">← <span data-no-i18n>{s.name}</span></Link>}
        <label className="flex items-center gap-1"><span>Print Format</span>
          <select className="input py-1" value={format} onChange={(e) => set({ format: e.target.value })} data-print-format data-no-i18n>{fmts.map((f) => <option key={f} value={f}>{f === "Digit Arabic Tax Invoice" && ui === "ar" ? "الفاتورة الضريبية العربية (ديجيت)" : f === "Standard" && ui === "ar" ? "قياسي" : f}</option>)}</select></label>
        <label className="flex items-center gap-1"><span>Letter Head</span>
          <select className="input py-1" value={lh} onChange={(e) => set({ letterhead: e.target.value })} data-print-letterhead><option value={BRAND_HEADER}>{ui === "ar" ? "هوية الشركة" : "Company branding"}</option><option value="">No Letterhead</option>{heads.map((h) => <option key={h.name} value={h.name} data-no-i18n>{h.name}</option>)}</select></label>
        <label className="flex items-center gap-1"><span>Language</span>
          <select className="input py-1" value={lang} onChange={(e) => set({ lang: e.target.value as Lang })} data-print-lang><option value="ar">العربية</option><option value="en">English</option></select></label>
        <span className="ms-auto" />
        <button type="button" className="btn-ghost" onClick={() => window.print()} data-print-now>Print</button>
        <button type="button" className="btn-primary" onClick={pdf} disabled={busy || !out?.html} data-print-pdf>{busy ? "…" : "PDF"}</button>
      </div>
      <div className="p-6">
        {!out ? <p className="text-center text-muted-foreground">Loading…</p>
          : out.kind === "missing" ? <p className="text-center text-muted-foreground">Print format or document not found.</p>
          : pages ? <div ref={ref} className="pf-multi" data-print-pages={pages.length}>{pages.map((p) => <div key={p.name} className="pf-page shadow" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} data-no-i18n data-print-page={p.name} data-print-kind={p.kind} data-print-rendered={format} dangerouslySetInnerHTML={{ __html: p.html }} />)}</div>
          : <div ref={ref} className="pf-page shadow" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} data-no-i18n data-print-kind={out.kind} data-print-rendered={format} dangerouslySetInnerHTML={{ __html: out.html }} />}
      </div>
    </div>
  );
}

/**
 * Cut one rendered sheet into A4 page images: a page ends at the last table row that fits (never inside a row), and a
 * page that starts inside a table first repeats that table's header row — the PDF twin of thead{display:table-header-group}.
 */
function pdfPages(el: HTMLElement, canvas: HTMLCanvasElement): string[] {
  const top = el.getBoundingClientRect().top; const k = canvas.width / Math.max(1, el.offsetWidth);
  const pagePx = (el.offsetWidth * 297) / 210; const H = canvas.height / k;
  const rows = Array.from(el.querySelectorAll("tr")).map((tr) => {
    const r = tr.getBoundingClientRect(); const th = tr.closest("thead") ? null : tr.closest("table")?.querySelector("thead")?.getBoundingClientRect();
    return { y0: r.top - top, y1: r.bottom - top, body: !tr.closest("thead"), head: th ? { y0: th.top - top, y1: th.bottom - top } : null };
  });
  const out: string[] = []; let y = 0;
  while (y < H - 1 && out.length < 500) {
    const first = rows.find((r) => r.body && Math.abs(r.y0 - y) < 1);
    const head = y > 0 && first?.head && first.head.y1 <= y + 0.5 ? first.head : null;
    const hh = head ? head.y1 - head.y0 : 0;
    let end = Math.min(H, y + pagePx - hh);
    if (end < H) { const cross = rows.find((r) => r.body && r.y0 < end - 0.5 && r.y1 > end + 0.5); if (cross && cross.y0 > y + 1) end = cross.y0; }
    const pc = document.createElement("canvas"); pc.width = canvas.width; pc.height = Math.round(pagePx * k);
    const g = pc.getContext("2d")!; g.fillStyle = "#ffffff"; g.fillRect(0, 0, pc.width, pc.height);
    if (head) g.drawImage(canvas, 0, head.y0 * k, canvas.width, hh * k, 0, 0, canvas.width, hh * k);
    g.drawImage(canvas, 0, y * k, canvas.width, (end - y) * k, 0, hh * k, canvas.width, (end - y) * k);
    out.push(pc.toDataURL("image/jpeg", 0.9)); y = end;
  }
  return out;
}
