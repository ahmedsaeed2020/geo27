/**
 * Block menu (owner 2026-11-13 §2.3): every dashboard block can be adjusted in place without opening the full editor —
 * its own period (last month … year to date, custom range), comparison (previous period / same period last year / none),
 * view (chart ⇄ table where the data allows), size (S / M / L), position, export (PNG, Excel) and hiding (Round 1 §5). Each change is saved at once for
 * the user (DashboardDesigner persists it as the personal layout); the page filter bar stays the default.
 */
import { useEffect, useRef, useState } from "react";
import { DateInput } from "@/components/form/DateInput";
import { BLOCK_COMPARE, BLOCK_PERIOD, type WidgetDef } from "@/lib/dashboards/registry";
import { VIEW_LABEL, type Bi, type ViewKind } from "@/lib/dashboards/views";
import type { DesignerItem } from "@/lib/dashboards/layout";

const pick = (ar: boolean, b: Bi) => (ar ? b[1] : b[0]);
export interface BlockPatch { opts?: Record<string, string | undefined>; view?: ViewKind | null; w?: number; reset?: boolean }
export function BlockMenu<C>({ w, it, ar, views, first, last, onPatch, onMove, onRemove, label, align = "end", noSize, onExport, openSignal }: {
  w: Pick<WidgetDef<C>, "id" | "options" | "required" | "defaultView" | "shape">; it: Pick<DesignerItem, "id" | "w" | "view" | "opts" | "title">; ar: boolean; views: ViewKind[];
  first: boolean; last: boolean; onPatch: (p: BlockPatch) => void; onMove?: ((dir: -1 | 1) => void) | undefined; onRemove?: (() => void) | undefined; label: string; align?: "start" | "end"; noSize?: boolean | undefined;
  /** Round 1 §5: export the card as a picture or an Excel file */ onExport?: ((kind: "png" | "excel") => void) | undefined;
  /** opens the menu when it changes (the card's period dropdown asks for a custom range) */ openSignal?: number | undefined;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const has = (k: string) => !!w.options?.some((o) => o.key === k);
  // a widget declaring the full set (BLOCK_OPTIONS_FULL) gets its own choices; others keep the standard menu
  const perOpt = w.options?.find((o) => o.key === "per") ?? BLOCK_PERIOD, cmpOpt = w.options?.find((o) => o.key === "pcmp") ?? BLOCK_COMPARE;
  const per = it.opts?.["per"] ?? "", cmp = it.opts?.["pcmp"] ?? "";
  const [from, setFrom] = useState(it.opts?.["pfrom"] ?? ""); const [to, setTo] = useState(it.opts?.["pto"] ?? "");
  const [base, setBase] = useState(it.opts?.["pbase"] ?? "");
  const view = (it.view as ViewKind | undefined) ?? w.defaultView;
  const custom = !!(it.opts && Object.keys(it.opts).length) || !!it.view || !!it.title;
  const T = (en: string, a: string) => (ar ? a : en);
  return <div ref={ref} className="dash-bm" data-dash-block-menu={it.id} data-open={open ? "" : undefined}>
    <button type="button" className="dash-bm-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((x) => !x)} aria-label={`${T("Block options", "خيارات الكتلة")}: ${label}`} title={T("Block options", "خيارات الكتلة")} data-dash-bm-open={it.id}>
      <svg viewBox="0 0 20 20" aria-hidden width="16" height="16"><circle cx="4" cy="10" r="1.7" fill="currentColor" /><circle cx="10" cy="10" r="1.7" fill="currentColor" /><circle cx="16" cy="10" r="1.7" fill="currentColor" /></svg>
    </button>
    {open && <div role="dialog" aria-label={`${T("Block options", "خيارات الكتلة")}: ${label}`} className="dash-bm-pop" data-align={align} data-dash-bm-panel={it.id}>
      <p className="dash-bm-title">{label}</p>
      {has("per") && <div className="dash-bm-row">
        <label className="dash-bm-l" htmlFor={`bm-per-${it.id}`}>{pick(ar, BLOCK_PERIOD.label)}</label>
        <select id={`bm-per-${it.id}`} className="dash-bm-in" value={per} onChange={(e) => { const v = e.target.value; if (v !== "custom" && v !== "asof") onPatch({ opts: { per: v || undefined, pfrom: undefined, pto: undefined } }); else onPatch({ opts: { per: v, pfrom: undefined } }); }} data-dash-bm-period>
          {perOpt.choices.map((c) => <option key={c.value} value={c.value}>{pick(ar, c.label)}</option>)}
        </select>
        {per === "asof" && <div className="dash-bm-dates">
          <DateInput className="dash-bm-in" value={to} onChange={(e) => setTo(e.target.value)} aria-label={T("As of", "حتى تاريخ")} data-dash-bm-asof />
          <button type="button" className="dash-bm-chip" disabled={!to} onClick={() => onPatch({ opts: { per: "asof", pto: to } })} data-dash-bm-apply-asof>{T("Apply", "تطبيق")}</button>
        </div>}
        {per === "custom" && <div className="dash-bm-dates">
          <DateInput className="dash-bm-in" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={T("From", "من")} data-dash-bm-from />
          <DateInput className="dash-bm-in" value={to} onChange={(e) => setTo(e.target.value)} aria-label={T("To", "إلى")} data-dash-bm-to />
          <button type="button" className="dash-bm-chip" disabled={!from || (!!to && from > to)} onClick={() => onPatch({ opts: { per: "custom", pfrom: from, pto: to || undefined } })} data-dash-bm-apply>{T("Apply", "تطبيق")}</button>
        </div>}
      </div>}
      {has("pcmp") && <div className="dash-bm-row">
        <label className="dash-bm-l" htmlFor={`bm-cmp-${it.id}`}>{pick(ar, BLOCK_COMPARE.label)}</label>
        <select id={`bm-cmp-${it.id}`} className="dash-bm-in" value={cmp} onChange={(e) => onPatch({ opts: { pcmp: e.target.value || undefined, ...(e.target.value !== "baseline" ? { pbase: undefined } : {}) } })} data-dash-bm-compare>
          {cmpOpt.choices.map((c) => <option key={c.value} value={c.value}>{pick(ar, c.label)}</option>)}
        </select>
        {cmp === "baseline" && <div className="dash-bm-dates">
          <DateInput className="dash-bm-in" value={base} onChange={(e) => setBase(e.target.value)} aria-label={T("Baseline date", "تاريخ خط الأساس")} data-dash-bm-base />
          <button type="button" className="dash-bm-chip" disabled={!base} onClick={() => onPatch({ opts: { pcmp: "baseline", pbase: base } })} data-dash-bm-apply-base>{T("Apply", "تطبيق")}</button>
        </div>}
      </div>}
      {views.length > 1 && <div className="dash-bm-row"><span className="dash-bm-l">{T("View", "طريقة العرض")}</span>
        <div className="dash-bm-chips">{views.map((v) => <button key={v} type="button" className="dash-bm-chip" aria-pressed={v === view} onClick={() => onPatch({ view: v === w.defaultView ? null : v })} data-dash-bm-view={v}>{pick(ar, VIEW_LABEL[v])}</button>)}</div></div>}
      {!noSize && <div className="dash-bm-row"><span className="dash-bm-l">{T("Size", "الحجم")}</span>
        <div className="dash-bm-chips">
          <button type="button" className="dash-bm-chip" aria-pressed={it.w <= 4} onClick={() => onPatch({ w: 4 })} data-dash-bm-size="small" title={T("Small (a third)", "صغير (الثلث)")}>{T("S", "ص")}</button>
          <button type="button" className="dash-bm-chip" aria-pressed={it.w > 4 && it.w < 12} onClick={() => onPatch({ w: 6 })} data-dash-bm-size="half" title={T("Medium (half)", "متوسط (النصف)")}>{T("M", "م")}</button>
          <button type="button" className="dash-bm-chip" aria-pressed={it.w === 12} onClick={() => onPatch({ w: 12 })} data-dash-bm-size="full" title={T("Large (full width)", "كبير (العرض كاملًا)")}>{T("L", "ك")}</button>
        </div></div>}
      {onMove && <div className="dash-bm-row"><span className="dash-bm-l">{T("Position", "الموضع")}</span>
        <div className="dash-bm-chips">
          <button type="button" className="dash-bm-chip" disabled={first} onClick={() => onMove(-1)} data-dash-bm-move="earlier">{T("Move earlier", "نقل للأمام")}</button>
          <button type="button" className="dash-bm-chip" disabled={last} onClick={() => onMove(1)} data-dash-bm-move="later">{T("Move later", "نقل للخلف")}</button>
        </div></div>}
      {onExport && <div className="dash-bm-row"><span className="dash-bm-l">{T("Export", "تصدير")}</span>
        <div className="dash-bm-chips">
          <button type="button" className="dash-bm-chip" onClick={() => { onExport("png"); setOpen(false); }} data-dash-bm-export="png">{T("Picture (PNG)", "صورة (PNG)")}</button>
          <button type="button" className="dash-bm-chip" onClick={() => { onExport("excel"); setOpen(false); }} data-dash-bm-export="excel">{T("Excel", "إكسل")}</button>
        </div></div>}
      <div className="dash-bm-foot">
        {custom && <button type="button" className="dash-bm-link" onClick={() => onPatch({ reset: true })} data-dash-bm-reset>{T("Reset this block", "إعادة الكتلة للأصل")}</button>}
        {onRemove && !w.required && <button type="button" className="dash-bm-link dash-bm-danger" onClick={() => { setOpen(false); onRemove(); }} data-dash-bm-remove>{T("Hide from my dashboard", "إخفاء من لوحتي")}</button>}
      </div>
      <p className="dash-bm-note">{T("Saved for you only. The page filters stay the default for other blocks.", "يُحفظ لك وحدك. مرشحات الصفحة تبقى الافتراضية لبقية الكتل.")}</p>
    </div>}
  </div>;
}
