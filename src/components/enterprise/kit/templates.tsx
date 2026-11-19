/**
 * DIGIT Enterprise page templates (presentation layer, owner 2026-11-12 §A). Six shared templates — T1 Home, T2
 * Department overview, T3 Workspace Overview tab, T4 Analysis board, T5 Executive sub-page, T6 Document / print frame —
 * each with fixed zones and a maximum block count. Apps pass data and configuration only; no app draws its own layout.
 * Every template enforces: one figure once per page (FigureScope + KpiRow de-duplication), fixed-height panels with
 * inner scroll, white framed cards on the warm canvas, brand colour roles, and display labels without internal codes.
 */
import { KpiSlots, useLeadRow } from "./KpiCard";
import { AddSlotTile, useAddSlot } from "./AddSlot";
import { useFrame } from "@/components/dashboards/CardFrame";
import { useDomChips, useFeedOwner, useHeroFeed } from "./heroFeed";
import { BandWatermark } from "../BandMark";
import { Children, cloneElement, createContext, Fragment, isValidElement, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { KpiTile, Scorecard, type KpiTileProps, type ScoreRow } from "./charts";
import { darkArt } from "./accents";
import { useLang } from "@/i18n";

/* ------------------------------------------------------------------ template contract ------------------------------------------------------------------ */
export type TemplateId = "T1" | "T2" | "T3" | "T4" | "T5" | "T6";
export interface TemplateRule { name: [string, string]; zones: readonly string[]; /** blocks a zone may hold */ maxPerZone: Record<string, number>; kpiMax: number }
export const TEMPLATES: Record<TemplateId, TemplateRule> = {
  T1: { name: ["Home", "الرئيسية"], zones: ["hero", "apps", "work", "footer"], maxPerZone: { hero: 1, apps: 8, work: 1, footer: 1 }, kpiMax: 0 },
  T2: { name: ["Department overview", "نظرة القسم"], zones: ["context", "kpis", "charts", "rows", "strip", "work", "more", "links"], maxPerZone: { context: 1, kpis: 1, charts: 3, rows: 8, strip: 1, work: 1, more: 1, links: 1 }, kpiMax: 6 },
  T3: { name: ["Workspace overview", "لوحة مساحة العمل"], zones: ["kpis", "charts", "tables", "links"], maxPerZone: { kpis: 1, charts: 8, tables: 4, links: 1 }, kpiMax: 6 },
  T4: { name: ["Analysis board", "لوحة التحليل"], zones: ["context", "kpis", "charts", "statement", "panels", "links"], maxPerZone: { context: 1, kpis: 1, charts: 4, statement: 1, panels: 6, links: 1 }, kpiMax: 6 },
  T5: { name: ["Executive page", "صفحة تنفيذية"], zones: ["context", "kpis", "charts", "rows", "panels", "links"], maxPerZone: { context: 1, kpis: 1, charts: 4, rows: 8, panels: 8, links: 1 }, kpiMax: 6 },
  T6: { name: ["Document frame", "إطار المستند"], zones: ["header", "body", "footer"], maxPerZone: { header: 1, body: 1, footer: 1 }, kpiMax: 0 },
};

/* ------------------------------------------------------------------ one figure once ------------------------------------------------------------------ */
interface FigureRegistry { claim: (key: string, owner: string) => boolean; release: (key: string, owner: string) => void }
const FigureCtx = createContext<FigureRegistry | null>(null);
const TemplateCtx = createContext<TemplateId | null>(null);
/** Page-wide figure registry: the first block that shows a figure owns it; a later block asking for the same figure is told to skip it. */
function useRegistry(): FigureRegistry {
  const map = useRef(new Map<string, string>());
  return { claim: (k, o) => { const cur = map.current.get(k); if (!cur) { map.current.set(k, o); return true; } return cur === o; }, release: (k, o) => { if (map.current.get(k) === o) map.current.delete(k); } };
}
/** True when this block may show `key` on the current page (false = an earlier block already shows the same figure). */
export function useFigure(key: string | undefined): boolean {
  const reg = useContext(FigureCtx); const owner = useId();
  const ok = !key || !reg ? true : reg.claim(key, owner);
  useEffect(() => () => { if (key && reg) reg.release(key, owner); }, [key, reg, owner]);
  return ok;
}
/** Value-based identity for an amount: the same non-trivial amount on one page is the same figure. Counts keep their own ids. */
export const amountFigure = (v: number | null | undefined) => (typeof v === "number" && Math.abs(v) >= 100 ? `amt:${Math.round(v)}` : undefined);
export const useTemplate = () => useContext(TemplateCtx);

/* ------------------------------------------------------------------ page + zones ------------------------------------------------------------------ */
export function Page({ template, id, children, className }: { template: TemplateId; id?: string; children: ReactNode; className?: string }) {
  const reg = useRegistry();
  return <TemplateCtx.Provider value={template}><FigureCtx.Provider value={reg}>
    <div className={`ek-page${className ? ` ${className}` : ""}`} data-ek-template={template} data-ek-page={id}>{children}</div>
  </FigureCtx.Provider></TemplateCtx.Provider>;
}
/** A template zone: holds at most the template's block count for this zone (extra blocks are not rendered — the page config must place them elsewhere). */
export function Zone({ zone, title, sub, actions, children, className, label }: { zone: string; title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; label?: string }) {
  const t = useTemplate(); const rule = t ? TEMPLATES[t] : undefined;
  const max = rule?.maxPerZone[zone] ?? 99;
  const kids = Children.toArray(children).filter(Boolean);
  if (import.meta.env.DEV && rule && !rule.zones.includes(zone)) console.warn(`[ek] zone "${zone}" is not part of template ${t}`);
  if (import.meta.env.DEV && kids.length > max) console.warn(`[ek] zone "${zone}" of ${t} holds ${kids.length} blocks; max ${max}`);
  if (!kids.length) return null;
  return <section className={`ek-zone${className ? ` ${className}` : ""}`} data-ek-zone={zone} data-ek-blocks={Math.min(kids.length, max)} aria-label={label ?? (typeof title === "string" ? title : undefined)}>
    {(title || actions) && <header className="ek-zone-head"><div className="min-w-0">{title && <h2 className="ek-h2">{title}</h2>}{sub && <p className="ek-sub">{sub}</p>}</div>{actions && <div className="ek-zone-actions">{actions}</div>}</header>}
    {kids.slice(0, max)}
  </section>;
}

/* ------------------------------------------------------------------ customize trigger (owner 2026-11-13 §2.4) ------------------------------------------------------------------ */
/** The header band's "Customize dashboard" opens the editor of the page's first dashboard (DashboardDesigner listens). */
export const DASH_EDIT_EVENT = "digit:dash-edit";
export const openDashboardEditor = (id?: string) => window.dispatchEvent(new CustomEvent(DASH_EDIT_EVENT, { detail: id }));
const CustomizeCtx = createContext(false);
/** Pages whose body is a dashboard wrap their band in this, so the band carries the Customize button. */
export function CustomizeScope({ children, on = true }: { children: ReactNode; on?: boolean }) { return <CustomizeCtx.Provider value={on}>{children}</CustomizeCtx.Provider>; }
export function CustomizeButton({ ar, className = "ek-context-btn" }: { ar: boolean; className?: string }) {
  return <button type="button" className={className} onClick={() => openDashboardEditor()} data-dash-band-edit>
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden><path d="M3 14.5V17h2.5l7.4-7.4-2.5-2.5L3 14.5Zm11.8-6.8a.7.7 0 0 0 0-1l-1.5-1.5a.7.7 0 0 0-1 0l-1.2 1.2 2.5 2.5 1.2-1.2Z" fill="currentColor" /></svg>
    {ar ? "تخصيص اللوحة" : "Customize dashboard"}</button>;
}

/* ------------------------------------------------------------------ band tabs (owner 2026-11-12 evening §1) ------------------------------------------------------------------ */
/**
 * One tab position on every screen: band first, the page's section tabs directly under it. A frame that owns section tabs
 * (ProFrame, app frames) wraps its body in BandTabsHost; the FIRST ContextStrip on the page draws the tabs right under
 * itself. When the page draws no band, the host shows the tabs at the top (claimed before paint, so nothing jumps).
 */
interface BandTabsApi { tabs: () => ReactNode; claim: (id: string) => boolean; claimed: (on: boolean) => void; release: (id: string) => void }
const BandTabsCtx = createContext<BandTabsApi | null>(null);
export function BandTabsHost({ tabs, children }: { tabs: ReactNode; children: ReactNode }) {
  const [claimed, setClaimed] = useState(false); const owner = useRef<string | null>(null); const cur = useRef<ReactNode>(tabs); cur.current = tabs;
  const api = useMemo<BandTabsApi>(() => ({ tabs: () => cur.current, claim: (id) => { if (!owner.current) owner.current = id; return owner.current === id; }, claimed: setClaimed,
    release: (id) => { if (owner.current === id) { owner.current = null; setClaimed(false); } } }), []);
  return <BandTabsCtx.Provider value={api}>{!claimed && tabs}{children}</BandTabsCtx.Provider>;
}
function useBandTabs(): ReactNode {
  const api = useContext(BandTabsCtx); const id = useId();
  const mine = !!api && api.claim(id);
  useLayoutEffect(() => { if (!api || !mine) return; api.claimed(true); return () => api.release(id); }, [api, mine, id]);
  return mine ? api!.tabs() : null;
}

/* ------------------------------------------------------------------ band icon (owner 2026-11-12 evening §2) ------------------------------------------------------------------ */
/** The band is dark green: an icon file passed in its light-surface variant (dark ink) is swapped for the official light-on-dark
 *  variant (white + mint) of the same artwork, so the glyph is always readable. Other nodes pass through. */
export const bandIconSrc = darkArt;
function bandIcon(icon: ReactNode): ReactNode {
  if (!isValidElement(icon)) return icon;
  const el = icon as ReactElement<{ src?: unknown }>;
  return typeof el.props.src === "string" ? cloneElement(el, { src: bandIconSrc(el.props.src) }) : icon;
}

/* ------------------------------------------------------------------ context strip (hero) ------------------------------------------------------------------ */
export function ContextStrip({ eyebrow, title, sub, facts = [], actions, aside, tone = "brand", icon, chips, cover }: { /** a record cover strip above the identity in this hue (e.g. the department colour of a person) */ cover?: string | undefined; eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; facts?: { label: ReactNode; value: ReactNode; id?: string; /** value text goes through the display translation layer */ i18n?: boolean }[]; actions?: ReactNode; aside?: ReactNode; tone?: "brand" | "light"; icon?: ReactNode; /** up to three live headline figures (HeroChips) drawn on the band where the decorative mark used to be (visual round R3) */ chips?: ReactNode }) {
  const cz = useContext(CustomizeCtx); const ar = useLang() === "ar"; const tabs = useBandTabs();
  // the DIGIT mark stays 20px from the physical left edge at one fixed 72px size; CSS reserves that area and wraps controls below the title on the right
  return <><div className="ek-context" data-tone={tone} data-ek-context {...(cover ? { "data-cover": cover } : {})}>
    {cover && <div className="ek-context-cover" data-hue={cover} aria-hidden data-ek-cover />}
    <div className="ek-context-main"><div className="min-w-0">{eyebrow && <p className="ek-eyebrow">{eyebrow}</p>}<h1 className="ek-h1">{title}</h1>{sub && <p className="ek-context-sub">{sub}</p>}</div>{icon && <span className="ek-context-icon" aria-hidden>{tone === "brand" ? bandIcon(icon) : icon}</span>}</div>
    {chips ? <div className="ek-hero-chips" data-ek-hero-chips>{chips}</div> : tone === "brand" && <FeedChips ar={ar} />}
    {(facts.length > 0 || actions || aside || cz) && <div className="ek-context-side">
      {facts.length > 0 && <dl className="ek-facts">{facts.map((f, i) => <div key={f.id ?? i} data-ek-fact={f.id}><dt>{f.label}</dt><dd {...(f.i18n ? {} : { "data-no-i18n": true })}>{f.value}</dd></div>)}</dl>}
      {aside}{(actions || cz) && <div className="ek-context-actions">{actions}{cz && <CustomizeButton ar={ar} />}</div>}
    </div>}
  </div>{tabs && <div className="ek-band-tabs" data-ek-band-tabs>{tabs}</div>}</>;
}

/* ------------------------------------------------------------------ hero chips (visual round R3 §3.1) ------------------------------------------------------------------ */
/** The page's own headline figures (first three KPI cards of its dashboard) in the band; the brand mark when there are none. */
function FeedChips({ ar }: { ar: boolean }) {
  const owner = useFeedOwner(); const feed = useHeroFeed(); const dom = useDomChips(owner && !feed.length);
  if (owner && feed.length) return <div className="ek-hero-chips" data-ek-hero-chips data-ek-hero-feed="dashboard"><HeroChips items={feed} ar={ar} /></div>;
  if (owner && dom.length) return <div className="ek-hero-chips" data-ek-hero-chips data-ek-hero-feed="page">{dom.map((c) => {
    const body = <><span className="ek-hero-chip-l">{c.label}</span><bdi data-no-i18n dangerouslySetInnerHTML={{ __html: c.html }} />{c.delta && <span className="ek-hero-chip-d" data-good="flat">· <bdi data-no-i18n>{c.delta}</bdi></span>}</>;
    return c.open ? <button key={c.id} type="button" className="ek-hero-chip" data-ek-hero-chip={c.id} onClick={c.open}>{body}</button> : <span key={c.id} className="ek-hero-chip" data-ek-hero-chip={c.id}>{body}</span>;
  })}</div>;
  return <BandWatermark />;
}
export interface HeroChipItem { id: string; label: ReactNode; value: ReactNode; /** signed change in percent against the previous period */ delta?: { pct: number; better?: "up" | "down" | "none" | undefined } | undefined; wrap?: ((node: ReactNode) => ReactNode) | undefined }
/** White-on-Deep headline chips of the band: «صافي آخر مسير ⃁ 2.1M · ▲1.3%»; each opens the records behind its figure. */
export function HeroChips({ items, ar }: { items: HeroChipItem[]; ar: boolean }) {
  return <>{items.slice(0, 3).map((c) => {
    const d = c.delta; const flat = !d || Math.abs(d.pct) < 0.05; const good = !d || flat || d.better === "none" ? undefined : (d.better ?? "up") === "up" ? d.pct > 0 : d.pct < 0;
    const body = <span className="ek-hero-chip" data-ek-hero-chip={c.id}><span className="ek-hero-chip-l">{c.label}</span><bdi data-no-i18n>{c.value}</bdi>
      {d && !flat && <span className="ek-hero-chip-d" data-good={good === undefined ? "flat" : good ? "yes" : "no"} title={ar ? "التغير عن الفترة السابقة" : "Change vs the previous period"}>· <bdi data-no-i18n>{d.pct > 0 ? "▲" : "▼"}{Math.abs(d.pct).toLocaleString("en-US", { maximumFractionDigits: 1 })}%</bdi></span>}</span>;
    return <Fragment key={c.id}>{c.wrap ? c.wrap(body) : body}</Fragment>;
  })}</>;
}

/* ------------------------------------------------------------------ KPI row ------------------------------------------------------------------ */
export interface KpiItem extends Omit<KpiTileProps, "ar"> { id: string; /** figure identity for one-figure-once (defaults to id) */ figure?: string | undefined; /** the previous-period value shown in the scorecard */ prev?: ReactNode }
function KpiSlot({ k, ar, hero }: { k: KpiItem; ar: boolean; hero?: boolean }) {
  const ok = useFigure(k.figure ?? k.id);
  if (!ok) return null;
  return <KpiTile {...k} hero={hero} ar={ar} attrs={{ "data-ek-kpi": k.id, ...k.attrs }} />;
}
/** A shown value that is zero with nothing behind it (0, 0.00, ⃁ 0.00 …) — never a main card (owner 2026-11-12). */
export const isEmptyValue = (v: ReactNode) => typeof v === "string" && /^[^\d]*0(?:[.,]0+)?[^\d]*$/.test(v.trim());
/**
 * Hero + smart cards (owner 2026-11-12 Part A add §4): the first meaningful figure becomes the page's one Hero KPI and
 * three to four smart cards follow; empty zero figures move to the visible scorecard below; the smart cards either all
 * carry a sparkline or none does (cards with a trend are preferred when at least three have one). Pure ordering — nothing
 * is dropped or folded: every other figure stays visible in the scorecard.
 */
export function heroOrder<T>(items: T[], empty: (x: T) => boolean, spark: (x: T) => boolean | undefined, cards = 4): { hero?: T; head: T[]; rest: T[]; sparks: boolean } {
  const full = items.filter((x) => !empty(x)), zero = items.filter(empty);
  const [hero, ...cand] = full;
  if (!hero) return { head: [], rest: zero, sparks: false };
  const withSpark = cand.filter((x) => spark(x) === true);
  const known = cand.some((x) => spark(x) !== undefined);
  let head: T[];
  if (known && withSpark.length >= 3) head = withSpark.slice(0, cards);
  else head = cand.slice(0, cards);
  const sparks = known && head.length > 0 && head.every((x) => spark(x) === true);
  const shown = new Set<T>([hero, ...head]);
  return { hero, head, rest: [...cand.filter((x) => !shown.has(x)), ...zero], sparks };
}
/** A scorecard row that shows only when its figure is not already on the page (one figure once). */
function FigureGate({ figure, children }: { figure: string | undefined; children: ReactNode }) { return useFigure(figure) ? <>{children}</> : null; }
const scoreOfKpi = (k: KpiItem): ScoreRow => ({ id: k.id, label: k.label, value: k.value, prev: k.prev, pct: k.delta?.pct ?? null, better: k.delta?.better, sub: k.sub, wrap: k.wrap, tone: k.tone, state: k.state, attrs: { "data-ek-kpi": k.id, ...k.attrs } });
/**
 * The indicator block (owner 2026-11-13 rich pages): a Hero + four smart cards, then EVERY other figure visible as a KPI
 * scorecard (indicator · this period · previous · change) — no indicator fold and no hidden zero figures. Duplicates
 * by figure are still drawn once.
 */
/** Cards per line of a KPI row: up to six on one line, more are spread evenly over the fewest lines (7 → 4 + 3, 8 → 4 + 4,
 *  11 → 6 + 5), so a card is never left alone on a line (owner page rule 15). */
export const kpiCols = (n: number) => (n <= 6 ? Math.max(1, n) : Math.ceil(n / Math.ceil(n / 6)));
export function KpiRow({ items, ar, max, id, scoreTitle }: { items: KpiItem[]; ar: boolean; max?: number; moreLabel?: string; id?: string; scoreTitle?: ReactNode }) {
  const t = useTemplate(); const lead = useLeadRow(); const lim = max ?? (t ? TEMPLATES[t].kpiMax || 6 : 6);
  const seen = new Set<string>(); const uniq = items.filter((k) => { const f = k.figure ?? k.id; if (seen.has(f)) return false; seen.add(f); return true; });
  const o = heroOrder(uniq, (k) => !k.state && !k.delta && isEmptyValue(k.value), (k) => !!(k.spark && k.spark.length > 1), Math.max(0, Math.min(4, lim - 1)));
  const cards = o.sparks ? o.head : o.head.map((k) => ({ ...k, spark: undefined }));
  const rest = o.rest; const n = cards.length + (o.hero ? 1 : 0);
  // the page's first KPI row ends with «أضف عنصرًا +» when its dashboard offers one (Dashboard Designer addSlot)
  const slotOwner = useId(); const slot = useAddSlot(slotOwner); const cells = n + (slot ? 1 : 0);
  return <div className="ek-kpis" data-ek-kpi-row={id ?? ""} data-ek-kpi-count={n}>
    <div className="ek-kpi-grid" data-ek-hero={o.hero ? "" : undefined} style={{ ["--ek-kpi-n" as string]: String(Math.max(1, cells)), ["--ek-kpi-rest" as string]: String(Math.max(1, cards.length)), ["--ek-kpi-cols" as string]: String(kpiCols(cells)) }}><KpiSlots lead={lead}>{o.hero && <KpiSlot key={o.hero.id} k={o.hero} ar={ar} hero />}{cards.map((k) => <KpiSlot key={k.id} k={k} ar={ar} />)}</KpiSlots>{slot && <AddSlotTile api={slot} ar={ar} />}</div>
    {rest.length > 0 && <div className="ek-kpi-rest" data-ek-kpi-rest={rest.length}><ScoreTable rows={rest.map((k) => ({ row: scoreOfKpi(k), figure: k.figure ?? k.id }))} ar={ar} id={id} title={scoreTitle} /></div>}
  </div>;
}
function ScoreTable({ rows, ar, id, title }: { rows: { row: ScoreRow; figure: string | undefined }[]; ar: boolean; id?: string | undefined; title?: ReactNode }) {
  return <Scorecard id={id} ar={ar} title={title ?? (ar ? "بطاقة المؤشرات" : "Indicator scorecard")} sub={ar ? "كل مؤشر بقيمته الحالية والسابقة ونسبة التغير؛ يفتح السجلات التي كوّنته." : "Every indicator with its current and previous value and the change; each opens the records behind it."}
    rows={rows.map((x) => x.row)} rowWrap={(r, tr) => <FigureGate key={r.id} figure={rows.find((x) => x.row.id === r.id)?.figure}>{tr}</FigureGate>} />;
}

/** A tile the host already rendered (an app's own indicator card), with the figure identities it shows. */
export interface StripItem { key: string; figures?: (string | undefined)[]; node: ReactNode; tags?: string[]; /** zero with no data — never a main card */ empty?: boolean | undefined; /** the tile draws a sparkline (unknown when undefined) */ spark?: boolean | undefined; /** the same figure as a scorecard row (shown in the scorecard when it is not a main card) */ score?: ScoreRow | undefined }
/**
 * ONE indicator block from tiles drawn by different owners (workspace KPIs, board tiles): an item whose key or figure was
 * already shown is dropped (its tags move onto the tile that shows the figure); a Hero + four cards lead, and every other
 * figure stays VISIBLE — as a scorecard row when the owner supplies its score, else in a compact indicator list.
 */
export function KpiStrip({ items, ar, max = 6, id, tagAttr = "data-ek-tags", scoreTitle, flat }: { items: StripItem[]; ar: boolean; max?: number; id?: string | undefined; tagAttr?: string | undefined; moreLabel?: string | undefined; scoreTitle?: ReactNode; /** equal cards (no wide Hero): up to `max` figures side by side at one height (visual round R3 §3.3) */ flat?: boolean | undefined }) {
  const lead = useLeadRow(); const seen = new Map<string, number>(); const out: { item: StripItem; tags: string[] }[] = [];
  for (const it of items) {
    const fs = [it.key, ...(it.figures ?? [])].filter((f): f is string => !!f);
    const hit = fs.map((f) => seen.get(f)).find((x) => x !== undefined);
    if (hit !== undefined) { out[hit]!.tags.push(...(it.tags ?? [])); fs.forEach((f) => seen.set(f, hit)); continue; }
    fs.forEach((f) => seen.set(f, out.length)); out.push({ item: it, tags: [] });
  }
  const tagged = (o: (typeof out)[number]) => (o.tags.length ? { [tagAttr]: o.tags.join(" ") } : {});
  const cell = (o: (typeof out)[number], hero?: boolean) => o.tags.length || hero ? <div key={o.item.key} className={hero ? "ek-kpi-cell ek-hero-cell" : "ek-kpi-cell"} {...tagged(o)}>{o.item.node}</div> : <Fragment key={o.item.key}>{o.item.node}</Fragment>;
  if (!out.length) return null;
  const ho0 = heroOrder(out, (x) => !!x.item.empty, (x) => x.item.spark, Math.max(0, Math.min(flat ? max - 1 : 4, max - 1)));
  const ho = flat && ho0.hero ? { ...ho0, hero: undefined, head: [ho0.hero, ...ho0.head] } : ho0;
  const head = ho.head, rest = ho.rest; const n = head.length + (ho.hero ? 1 : 0);
  const scored = rest.filter((o) => o.item.score), listed = rest.filter((o) => !o.item.score);
  return <div className="ek-kpis" data-ek-kpi-row={id ?? ""} data-ek-kpi-count={n}>
    <div className="ek-kpi-grid" data-ek-hero={ho.hero ? "" : undefined} data-ek-sparks={ho.sparks ? "all" : "none"} style={{ ["--ek-kpi-n" as string]: String(Math.max(1, n)), ["--ek-kpi-rest" as string]: String(Math.max(1, head.length)), ["--ek-kpi-cols" as string]: String(kpiCols(n)) }}><KpiSlots lead={lead}>{ho.hero && cell(ho.hero, true)}{head.map((o) => cell(o))}</KpiSlots></div>
    {rest.length > 0 && <div className="ek-kpi-rest" data-ek-kpi-rest={rest.length} data-split={scored.length && listed.length ? "" : undefined}>
      {scored.length > 0 && <Scorecard id={id} ar={ar} title={scoreTitle ?? (ar ? "بطاقة المؤشرات" : "Indicator scorecard")} sub={ar ? "كل مؤشر بقيمته الحالية والسابقة ونسبة التغير؛ يفتح السجلات التي كوّنته." : "Every indicator with its current and previous value and the change; each opens the records behind it."}
        rows={scored.map((o) => ({ ...o.item.score!, attrs: { ...o.item.score!.attrs, ...tagged(o) } }))} />}
      {listed.length > 0 && <section className="ek-card ek-kpi-list" aria-label={ar ? "مؤشرات إضافية" : "More indicators"} data-ek-kpi-list={listed.length}><header className="ek-card-head"><h3 className="ek-h3">{ar ? "مؤشرات إضافية" : "More indicators"}</h3></header><div className="ek-kpi-list-b">{listed.map((o) => <div key={o.item.key} className="ek-kpi-li" {...tagged(o)}>{o.item.node}</div>)}</div></section>}
    </div>}
  </div>;
}

/* ------------------------------------------------------------------ cards, rows and panels ------------------------------------------------------------------ */
export function ChartRow({ children, cols }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  const n = cols ?? Math.min(3, Math.max(1, Children.toArray(children).filter(Boolean).length)) as 1 | 2 | 3;
  return <div className="ek-chart-row" data-cols={n}>{children}</div>;
}
export function ChartCard({ title, sub, action, children, size = "md", id, span, footer, attrs, fresh }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; size?: "sm" | "md" | "lg" | "auto"; id?: string; span?: 1 | 2 | 3; footer?: ReactNode; attrs?: Record<string, string | number | undefined>; /** freshness line (Round 1 §5); default: the Dashboard Designer block's */ fresh?: string | undefined }) {
  const frame = useFrame(); const f = fresh ?? frame?.fresh;
  return <article className="ek-card ek-chart-card" data-size={size} data-span={span} data-ek-card={id} data-r1-card {...attrs}>
    <header className="ek-card-head"><div className="min-w-0"><h3 className="ek-h3">{title}</h3>{(sub || f) && <p className="ek-card-sub">{sub}{sub && f ? <span aria-hidden> · </span> : null}{f && <span className="r1-fresh" data-r1-fresh>{f}</span>}</p>}</div>{action && <div className="ek-card-action">{action}</div>}</header>
    <div className="ek-card-body">{children}</div>
    {footer && <footer className="ek-card-foot">{footer}</footer>}
  </article>;
}
/** Fixed-height panel: the header stays, the body scrolls (sticky table headers inside). */
export function FixedPanel({ title, sub, actions, children, height = 420, id, toolbar, attrs }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; height?: number | "auto"; id?: string; toolbar?: ReactNode; attrs?: Record<string, string | number | undefined> }) {
  return <section className="ek-card ek-panel" data-ek-panel={id} {...attrs}>
    <header className="ek-card-head"><div className="min-w-0"><h3 className="ek-h3">{title}</h3>{sub && <p className="ek-card-sub">{sub}</p>}</div>{actions && <div className="ek-card-action">{actions}</div>}</header>
    {toolbar && <div className="ek-panel-toolbar">{toolbar}</div>}
    <div className="ek-panel-body" style={height === "auto" ? undefined : { maxHeight: height }}>{children}</div>
  </section>;
}
export interface WorkTab { id: string; label: ReactNode; count?: number | undefined; tone?: "risk" | "attention" | undefined; content: ReactNode; attrs?: Record<string, string> }
/** One worklist panel: tabs inside the header, a fixed-height list and a detail pane beside it. */
export function WorkPanel({ title, sub, tabs, active, onTab, detail, height = 440, id, actions }: { title: ReactNode; sub?: ReactNode; tabs: WorkTab[]; active: string; onTab: (id: string) => void; detail?: ReactNode; height?: number; id?: string; actions?: ReactNode }) {
  const cur = tabs.find((t) => t.id === active) ?? tabs[0];
  return <section className="ek-card ek-work" data-ek-work={id} data-has-detail={detail ? "" : undefined}>
    <header className="ek-card-head ek-work-head"><div className="min-w-0"><h3 className="ek-h3">{title}</h3>{sub && <p className="ek-card-sub">{sub}</p>}</div>{actions}</header>
    <div role="tablist" className="ek-tabs" aria-label={typeof title === "string" ? title : undefined}>{tabs.map((t) => <button key={t.id} type="button" role="tab" aria-selected={cur?.id === t.id} className="ek-tab" onClick={() => onTab(t.id)} {...t.attrs}>{t.label}{t.count !== undefined && <span className="ek-tab-n" data-tone={t.count ? t.tone : undefined} data-no-i18n>{t.count}</span>}</button>)}</div>
    <div className="ek-work-body"><div className="ek-work-list" role="tabpanel" style={{ maxHeight: height }}>{cur?.content}</div>{detail && <aside className="ek-work-detail" style={{ maxHeight: height }}>{detail}</aside>}</div>
  </section>;
}
/** Compact link group (reports, shortcuts): chips in one framed row. */
export function LinkGroup({ title, children, id }: { title: ReactNode; children: ReactNode; id?: string }) {
  return <nav className="ek-card ek-links" aria-label={typeof title === "string" ? title : undefined} data-ek-links={id}><span className="ek-links-title">{title}</span><div className="ek-links-list">{children}</div></nav>;
}
export const LINK_CHIP = "ek-link-chip";
/** The shared small indicator tile (kit card look) for pages whose figure is a link or a status cell, e.g. a reconciliation
 *  total; label / value / meta children use the kit typography. One look for every app (owner 2026-11-13 §3.5). */
export const KPI_TILE = "ek-kpi-tile";
