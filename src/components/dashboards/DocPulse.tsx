/**
 * Document pulse (ONE STANDARD R9, owner 2026-11-12): a shared small-multiples block of the documents a dashboard already
 * reads (its widgets' source DocTypes). Each tile counts the permission-scoped records — drafts, submitted, cancelled and
 * created this month — and opens the list. Nothing is stored; every figure is counted from adapter records at render time.
 */
import { Link } from "@tanstack/react-router";
import { t as tr, useLang } from "@/i18n";
import { useCatalogIndex } from "./useCatalogIndex";
import { useStoreVersion } from "@/lib/adapter";
import { canReadType, scopedList } from "@/lib/scope";
import type { DashboardDef, WidgetDef } from "@/lib/dashboards/registry";

export const PULSE_ID = "core:pulse";
const MAX = 6;

/** Rows the default layout fills on a 12-column grid (items wrap when the next one does not fit). */
export function defaultRows(def: { widgets: { size: { w: number }; defaultView?: string; inDefault?: boolean | undefined; required?: boolean | undefined }[] }, stripKpis = false): number {
  // KPI widgets form ONE indicator row; on a page with the indicator strip (DashboardDesigner `strip`) they leave the
  // grid for the strip above it, so they add no dashboard row there
  let rows = 0, used = 12, strip = false;
  for (const w of def.widgets) {
    if (w.inDefault === false && !w.required) continue;
    if (w.defaultView === "kpi") { if (!strip && !stripKpis) { rows++; used = 12; } strip = true; continue; }
    const n = Math.min(12, w.size.w); if (used + n > 12) { rows++; used = n; } else used += n;
  }
  return rows;
}
/** Source DocTypes of a dashboard (traceable to its widgets), in first-use order. */
export function pulseSources(def: { widgets: { sources: string[] }[] }, isDoctype: (dt: string) => boolean): string[] {
  return [...new Set(def.widgets.flatMap((w) => w.sources))].filter(isDoctype);
}

export interface PulseTile { doctype: string; total: number; draft: number; submitted: number; cancelled: number; month: number }
export function pulseTiles(doctypes: string[], user?: string, today = new Date().toISOString().slice(0, 7)): PulseTile[] {
  return doctypes.filter((dt) => canReadType(dt, user)).map((dt) => {
    const rows = scopedList(dt, user);
    const n = (s: number) => rows.filter((r) => Number(r["docstatus"] ?? 0) === s).length;
    return { doctype: dt, total: rows.length, draft: n(0), submitted: n(1), cancelled: n(2), month: rows.filter((r) => String(r["creation"] ?? r["posting_date"] ?? "").startsWith(today)).length };
  }).filter((x) => x.total > 0).sort((a, b) => b.total - a.total).slice(0, MAX);
}

export function DocPulse({ doctypes }: { doctypes: string[] }) {
  useStoreVersion(); const ar = useLang() === "ar"; const index = useCatalogIndex();
  const tiles = pulseTiles(doctypes);
  if (!tiles.length) return <p className="ek-card-sub p-4">{ar ? "لا توجد مستندات ظاهرة لك في هذه المساحة." : "No documents visible to you in this workspace."}</p>;
  return <div className="ek-pulse" data-dash-view="small-multiples" data-doc-pulse>
    {tiles.map((x) => {
      const e = index?.find((d) => d.name === x.doctype);
      const pct = (v: number) => `${x.total ? Math.round((v / x.total) * 100) : 0}%`;
      const body = <>
        <span className="ek-pulse-label">{tr(x.doctype)}</span>
        <span className="ek-pulse-value" data-no-i18n>{x.total.toLocaleString("en-US")}</span>
        <span className="ek-pulse-bar" aria-hidden><i data-k="submitted" style={{ width: pct(x.submitted) }} /><i data-k="draft" style={{ width: pct(x.draft) }} /><i data-k="cancelled" style={{ width: pct(x.cancelled) }} /></span>
        <span className="ek-pulse-legend"><span><b data-no-i18n>{x.draft}</b> {ar ? "مسودة" : "draft"}</span><span><b data-no-i18n>{x.submitted}</b> {ar ? "معتمد" : "submitted"}</span><span><b data-no-i18n>{x.month}</b> {ar ? "هذا الشهر" : "this month"}</span></span>
      </>;
      return e ? <Link key={x.doctype} to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} className="ek-pulse-tile" data-doc-pulse-tile={x.doctype}>{body}</Link>
        : <div key={x.doctype} className="ek-pulse-tile" data-doc-pulse-tile={x.doctype}>{body}</div>;
    })}
  </div>;
}

/**
 * A dashboard whose default layout fills fewer than four rows gets the document pulse as one more row, built from the
 * DocTypes its own widgets read (owner: rich pages, four rows or more, every row a different visual idea).
 */
export function withPulse<C>(def: DashboardDef<C>, isDoctype: (dt: string) => boolean, stripKpis = false): DashboardDef<C> {
  if (def.widgets.some((w) => w.id === PULSE_ID) || defaultRows(def, stripKpis) >= 4) return def;
  const sources = pulseSources(def, isDoctype);
  if (sources.length < 2) return def;
  const w: WidgetDef<C> = {
    id: PULSE_ID, version: 1, title: ["Documents at a glance", "المستندات في لمحة"],
    meaning: ["Records of the documents this dashboard reads, by state, counted from the records you may see.", "سجلات المستندات التي تقرؤها هذه اللوحة حسب الحالة، محسوبة من السجلات المسموح لك برؤيتها."],
    sources, shape: "panel", defaultView: "panel", size: { w: 12 }, render: () => <DocPulse doctypes={sources} />,
  };
  return { ...def, widgets: [...def.widgets, w] };
}
