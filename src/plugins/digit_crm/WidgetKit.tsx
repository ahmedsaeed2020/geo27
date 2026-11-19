import { DevOnly } from "@/components/DevOnly";
/**
 * Shared CRM widget presentation: one renderer for board widgets (W-xxx) and contextual metrics (C-xxx), the owner/period
 * filter bar and the layout editor. Presentation only — formulas live in wf10/wf11 and every link is the widget's drill.
 */
import { plainSource } from "./sourceLabel";
import { tLabel } from "@/i18n";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, CircleAlert, Eye, EyeOff, Filter, X } from "lucide-react";
import type { Bar, BoardFilter, Widget } from "./wf10";
import { ownerChoices, userLabel, isManager } from "./wf01";
import type { LayoutSource } from "./boardLayout";
import type { WidgetLayout } from "@/lib/userSettings";
import { DateInput } from "@/components/form/DateInput";

export const Go = ({ to, search, children, className, label }: { to?: string | undefined; search?: Record<string, string> | undefined; children: ReactNode; className?: string; label?: string }) =>
  to ? <Link to={to as never} search={(search ?? {}) as never} className={className ?? "hover:underline"} aria-label={label}>{children}</Link> : <>{children}</>;
/** Saudi Riyal amounts show the official sign on screen (stored values and exports keep "SAR"). */
export const N = ({ v }: { v: ReactNode }) => <span dir="ltr" data-no-i18n className="tabular-nums">{typeof v === "string" ? v.replace(/\bSAR (?=[-−]?[\d.,])/g, "\u20C1 ") : v}</span>;
/** Record codes (DCE-CAMP-0001, user ids) stay untranslated; business labels (stages, states) go through i18n. */
const L = ({ v }: { v: string }) => (/^[A-Z]{2,}-[A-Z0-9-]+$|@/.test(v) ? <bdi data-no-i18n>{v}</bdi> : <>{v}</>);

const TREND = new Set(["W-022", "W-025", "W-036", "W-047", "C-TG-01"]);
const FUNNEL = new Set(["W-030", "W-033"]);
const SPLIT = new Set(["W-007", "W-042", "W-057", "W-067", "C-CT-03", "C-CT-04", "C-QH-02"]);
export const URGENT = new Set(["W-011", "W-015", "W-018", "W-037", "W-041", "W-058", "W-074", "W-077", "W-080"]);

function Distribution({ bars }: { bars: Bar[] }) {
  const total = bars.reduce((sum, b) => sum + b.value, 0);
  return <><div className="flex h-5 overflow-hidden rounded bg-muted" aria-hidden>{bars.map((b, i) => <div key={b.label} className={`dc-series-${i % 3}`} style={{ width: `${total ? b.value / total * 100 : 0}%` }} />)}</div><div className="mt-4 grid gap-3 sm:grid-cols-3">{bars.map((b, i) => <Go key={b.label} to={b.to} search={b.search} className="block"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className={`h-2 w-2 rounded-full dc-series-${i % 3}`} /><L v={b.label} /></div><div className="mt-1 text-xl font-semibold"><N v={b.display ?? b.value} /></div></Go>)}</div></>;
}
function Trend({ bars }: { bars: Bar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return <div className="overflow-x-auto"><div className={`flex h-44 items-end gap-2 border-b border-border pb-7 ${bars.length > 8 ? "min-w-96" : ""}`} dir="ltr">{bars.map((b, i) => <div key={b.label} title={`${b.label}: ${b.display ?? b.value}`} className="relative flex h-full min-w-0 flex-1 flex-col justify-end text-center"><Go to={b.to} search={b.search} className="flex h-full flex-col justify-end"><span className="mb-1 text-xs text-muted-foreground"><N v={b.display ?? b.value} /></span><div className="mx-auto w-full max-w-12 rounded-t bg-primary/80" style={{ height: `${b.value / max * 75}%`, minHeight: b.value ? 3 : 0 }} />{/* Dense series (> 10 bars) label every other column so date labels never wrap; each bar keeps its full label as a tooltip. */}
<span className="absolute -bottom-6 start-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground">{bars.length <= 10 || (bars.length - 1 - i) % 2 === 0 ? <N v={b.label} /> : null}</span></Go></div>)}</div></div>;
}
/** Long bar lists show the first BAR_LIMIT rows with a toggle, so one 30-person chart cannot stretch the whole board row. */
const BAR_LIMIT = 10;
function BarTable({ bars }: { bars: Bar[] }) {
  const [all, setAll] = useState(false);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const shown = all ? bars : bars.slice(0, BAR_LIMIT);
  return <><table className="w-full text-sm"><tbody>{shown.map((b) => <tr key={b.label} className="border-b border-border last:border-0"><td className="max-w-48 py-2 pe-3"><Go to={b.to} search={b.search} className="text-primary hover:underline"><L v={b.label} /></Go></td><td className="w-1/3 pe-3"><div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary/70" style={{ width: `${b.value / max * 100}%` }} /></div></td><td className="whitespace-nowrap text-end"><N v={b.display ?? b.value} /></td></tr>)}</tbody></table>
    {bars.length > BAR_LIMIT && <button type="button" className="mt-2 text-xs text-primary hover:underline" aria-expanded={all} data-dc-bars-toggle onClick={() => setAll((v) => !v)}>{all ? <span>Show fewer</span> : <><span>Show all</span> (<N v={bars.length} />)</>}</button>}</>;
}
function Funnel({ bars }: { bars: Bar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return <ol className="space-y-2">{bars.map((b) => <li key={b.label}><Go to={b.to} search={b.search} className="block"><div className="mb-1 flex justify-between gap-2 text-xs"><span><L v={b.label} /></span><N v={b.display ?? b.value} /></div><div className="mx-auto h-7 rounded bg-primary/80" style={{ width: `${Math.max(2, b.value / max * 100)}%` }} /></Go></li>)}</ol>;
}
export function WidgetBody({ w }: { w: Widget }) {
  if (w.kind === "blocked") return <div className="flex gap-2 py-2 text-sm text-muted-foreground" data-dc-state="blocked"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><p>{w.reason}</p></div>;
  if (w.kind === "kpi" || w.kind === "progress") return <Go to={w.to} search={w.search} className="group block"><div className="relative min-w-0 pe-5"><div className="overflow-x-auto whitespace-nowrap text-2xl font-semibold leading-tight"><N v={w.kind === "progress" ? `${w.pct ?? 0}%` : w.value} />{w.unit && <span className="ms-1 text-sm font-normal text-muted-foreground" data-dc-unit>{w.unit}</span>}</div>{w.to && <ArrowUpRight className="absolute end-0 top-1 h-4 w-4 text-muted-foreground group-hover:text-primary" />}</div>{w.hint && <div className="mt-2 text-xs text-muted-foreground"><N v={w.hint} /></div>}{w.note && <div className="mt-1 text-[11px] leading-snug text-muted-foreground" data-dc-note>{w.note}</div>}{w.kind === "progress" && <><div className="mt-4 h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${Math.max(0, Math.min(100, w.pct ?? 0))}%` }} /></div><div className="mt-2 text-xs text-muted-foreground"><N v={w.value} /></div></>}</Go>;
  if (w.kind === "bars") {
    const bars = w.bars ?? []; if (!bars.length) return <p className="text-sm text-muted-foreground" data-dc-state="empty">No data yet.</p>;
    if (TREND.has(w.id)) return <Trend bars={bars} />;
    if (FUNNEL.has(w.id)) return <Funnel bars={bars} />;
    if (SPLIT.has(w.id)) return <Distribution bars={bars} />;
    return <BarTable bars={bars} />;
  }
  if (w.kind === "heat" && w.heat) { const h = w.heat, max = Math.max(1, ...h.cells.flat()); return <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th />{h.cols.map((c) => <th key={c} className="px-2 pb-2 text-xs font-normal text-muted-foreground"><N v={c} /></th>)}</tr></thead><tbody>{h.rows.map((r, i) => <tr key={r}><td className="py-1 pe-3 text-xs">{r}</td>{(h.cells[i] ?? []).map((v, j) => { const link = w.heatCell?.(r, h.cols[j] ?? ""); return <td key={j} className="p-1"><Go to={link?.to} search={link?.search} className="block rounded py-3 text-center focus:outline-none focus:ring-2 focus:ring-primary"><span className="block rounded" style={{ backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(v / max * 60)}%, var(--muted))` }}><N v={v} /></span></Go></td>; })}</tr>)}</tbody></table></div>; }
  const rows = w.rows ?? [];
  return !rows.length ? <p className="text-sm text-muted-foreground" data-dc-state="empty">Nothing needs action.</p> : <><ol className="divide-y divide-border">{rows.slice(0, 6).map((r, i) => <li key={r.to + r.label} className="flex items-start gap-3 py-3 text-sm"><span className="pt-0.5 text-[11px] text-muted-foreground"><N v={i + 1} /></span><Go to={r.to} search={r.search} className="min-w-0 flex-1 text-primary hover:underline"><span className="block break-words" data-no-i18n>{r.label}</span>{r.sub && <span className="mt-0.5 block text-[11px] text-muted-foreground" data-no-i18n>{r.sub}</span>}</Go>{r.value && <span className="shrink-0 text-xs"><N v={r.value} /></span>}<Go to={r.to} search={r.search}><ArrowUpRight className="h-4 w-4 text-muted-foreground" /></Go></li>)}</ol>{w.to && <Go to={w.to} search={w.search} className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">View all <ArrowUpRight className="h-3 w-3" /></Go>}{!w.to && rows.length > 6 && <div className="text-xs text-muted-foreground"><N v={`+${rows.length - 6}`} /></div>}</>;
}
/** "Filtered" / "All permitted records" chip — shown only while an owner/period filter is active. */
export function ScopeChip({ w }: { w: Widget }) {
  if (!w.scope) return null;
  return w.scope === "filtered"
    ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary" data-dc-scope="filtered">Filtered</span>
    : <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" data-dc-scope="all">All permitted records</span>;
}
export function WidgetCard({ w, className, lang }: { w: Widget; className?: string; lang: string }) {
  return <section className={`min-w-0 rounded-lg border bg-card p-4 ${className ?? ""} ${URGENT.has(w.id) ? "border-destructive/30" : "border-border"} ${w.kind === "blocked" ? "bg-muted/30" : ""}`} data-widget={w.id} data-kind={w.kind}>
    <div className="mb-4"><div className="flex items-start gap-2"><h3 className="min-w-0 text-sm font-semibold">{w.title}</h3><DevOnly><span className="ms-auto shrink-0 text-[10px] text-muted-foreground" data-dc-code><N v={w.id} /></span></DevOnly></div>{w.scope && <div className="mt-1"><ScopeChip w={w} /></div>}</div>
    <WidgetBody w={w} />
    <details className="mt-4 border-t border-border pt-2 text-[11px] text-muted-foreground"><summary className="cursor-pointer">{lang === "ar" ? "المصدر والحساب" : "Source and calculation"}</summary><p className="mt-1">{w.calc}</p>{plainSource(w.source, tLabel, lang === "ar") && <p className="mt-1" data-no-i18n data-dc-source-plain>{plainSource(w.source, tLabel, lang === "ar")}</p>}<DevOnly><p className="mt-1" data-no-i18n dir="ltr">{w.source}</p></DevOnly></details>
  </section>;
}

/** Owner/period filter (creation date window + deal/lead owner). Salespeople only see themselves in the owner list. */
export function FilterBar({ user, f, onChange, note }: { user: string; f: BoardFilter; onChange: (f: BoardFilter) => void; note?: ReactNode }) {
  const active = Boolean(f.from || f.to || f.owner), owners = ownerChoices(user);
  return <div className="panel flex flex-wrap items-end gap-3 p-3 text-sm" data-dc-filter>
    <Filter className="mb-2 h-4 w-4 text-muted-foreground" aria-hidden />
    <label className="grid gap-1"><span className="text-xs text-muted-foreground">From</span><DateInput className="field-input" value={f.from ?? ""} onChange={(e) => onChange({ ...f, from: e.target.value || undefined })} data-dc-filter-from /></label>
    <label className="grid gap-1"><span className="text-xs text-muted-foreground">To</span><DateInput className="field-input" value={f.to ?? ""} onChange={(e) => onChange({ ...f, to: e.target.value || undefined })} data-dc-filter-to /></label>
    {(isManager(user) || owners.length > 1) && <label className="grid gap-1"><span className="text-xs text-muted-foreground">Owner</span><select className="field-input" value={f.owner ?? ""} onChange={(e) => onChange({ ...f, owner: e.target.value || undefined })} data-dc-filter-owner><option value="">All</option>{owners.map((u) => <option key={u.name} value={u.name} data-no-i18n>{userLabel(u.name)}</option>)}</select></label>}
    {active && <div className="flex flex-wrap items-center gap-1" data-dc-filter-chips>
      {f.from && <Chip label="From" value={f.from} onClear={() => onChange({ ...f, from: undefined })} />}
      {f.to && <Chip label="To" value={f.to} onClear={() => onChange({ ...f, to: undefined })} />}
      {f.owner && <Chip label="Owner" value={userLabel(f.owner) || f.owner} onClear={() => onChange({ ...f, owner: undefined })} />}
      <button type="button" className="btn-ghost text-xs" onClick={() => onChange({})} data-dc-filter-clear>Clear filters</button>
    </div>}
    <p className="ms-auto max-w-md text-xs text-muted-foreground">{note ?? <>Date basis: created on · Your permitted records only</>}</p>
  </div>;
}
function Chip({ label, value, onClear }: { label: string; value: string; onClear: () => void }) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary"><span>{label}</span>: <bdi data-no-i18n>{value}</bdi><button type="button" onClick={onClear} aria-label="Remove filter" className="rounded-full hover:bg-primary/20"><X className="h-3 w-3" /></button></span>;
}

const SOURCE_LABEL: Record<LayoutSource, string> = { personal: "My layout", team: "Team default", default: "System default" };
export const LayoutSourceChip = ({ source }: { source: LayoutSource }) => <span className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground" data-dc-layout-source={source}><span>Layout</span>: <span>{SOURCE_LABEL[source]}</span></span>;

/** Reorder / hide widgets, then save as my layout, publish as team default (permitted roles) or reset to the default. */
export function LayoutEditor({ titles, layout, canPublish, onSave, onPublish, onReset, onCancel }: {
  titles: Map<string, string>; layout: WidgetLayout; canPublish: boolean;
  onSave: (l: WidgetLayout) => void; onPublish: (l: WidgetLayout) => void; onReset: () => void; onCancel: () => void;
}) {
  const [l, setL] = useState<WidgetLayout>(layout);
  const move = (id: string, d: -1 | 1) => setL((x) => { const o = [...x.order], i = o.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= o.length) return x; [o[i], o[j]] = [o[j]!, o[i]!]; return { ...x, order: o }; });
  const toggle = (id: string) => setL((x) => ({ ...x, hidden: x.hidden.includes(id) ? x.hidden.filter((h) => h !== id) : [...x.hidden, id] }));
  return <div className="panel p-4" data-dc-layout-editor>
    <p className="mb-3 text-xs text-muted-foreground">Order and visibility only — values and access never change. Your layout applies to you; a team default applies to everyone without a personal layout.</p>
    <ol className="divide-y divide-border rounded border border-border">{l.order.map((id, i) => { const hidden = l.hidden.includes(id); return <li key={id} className={`flex items-center gap-2 px-3 py-2 text-sm ${hidden ? "text-muted-foreground" : ""}`} data-dc-layout-item={id}>
      <DevOnly><span className="w-14 text-[11px] text-muted-foreground"><N v={id} /></span></DevOnly><span className={`min-w-0 flex-1 truncate ${hidden ? "line-through" : ""}`}>{titles.get(id) ?? id}</span>
      <button type="button" className="rounded p-1 hover:bg-muted disabled:opacity-30" disabled={i === 0} onClick={() => move(id, -1)} aria-label="Move up" data-dc-layout-up={id}><ArrowUp className="h-4 w-4" /></button>
      <button type="button" className="rounded p-1 hover:bg-muted disabled:opacity-30" disabled={i === l.order.length - 1} onClick={() => move(id, 1)} aria-label="Move down" data-dc-layout-down={id}><ArrowDown className="h-4 w-4" /></button>
      <button type="button" className="rounded p-1 hover:bg-muted" onClick={() => toggle(id)} aria-label={hidden ? "Show" : "Hide"} aria-pressed={hidden} data-dc-layout-toggle={id}>{hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
    </li>; })}</ol>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className="btn-primary" onClick={() => onSave(l)} data-dc-layout-save>Save my layout</button>
      {canPublish && <button type="button" className="btn-ghost border border-border" onClick={() => onPublish(l)} data-dc-layout-publish>Publish team default</button>}
      <button type="button" className="btn-ghost" onClick={onReset} data-dc-layout-reset>Reset to default</button>
      <button type="button" className="btn-ghost ms-auto" onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}
