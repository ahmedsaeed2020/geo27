/**
 * DIGIT HR home-surface presentation kit (Premium V2). Display-only primitives shared by the eight home screens:
 * they own typography, spacing, loading/empty/denied states, focus and responsive behaviour, never data or rules.
 * Every value passed in comes from scoped Virtual Core records or the HR metric engine.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Info, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { arLabel, EssDirection, Native, stateText, type SourceRead, type Sources } from "../workspaces/shared";
import type { ModuleScope } from "../ModuleScope";
import { DateInput } from "@/components/form/DateInput";
import { ContextStrip } from "@/components/enterprise/kit/templates";

type Tx = (ar: string, en: string) => string;
export type Tone = "danger" | "warn" | "info" | "success" | "neutral";

/* ------------------------------------------------------------------ header + context */

/**
 * Command header (Visual Fidelity V2): compact page identity on the canvas (eyebrow path code · DIGIT HR / suite ·
 * sections, title), then the two-tone green command band with the page's existing purpose question, its actions and the
 * context toolbar. Without purpose/toolbar there is no band: actions sit beside the identity. `embedded` (inside a
 * section page that already has its own band) renders only the white context row.
 */
export function HrCommandHeader({ code, suite, title, purpose, actions, children, id, embedded, module }: { code?: string; suite: string; title: ReactNode; purpose?: ReactNode; actions?: ReactNode; children?: ReactNode; id?: string; /** inside a section page that already has its own heading: context row only */ embedded?: boolean; /** module number: eyebrow gets quiet links to Mission control and the module's sections */ module?: string }) {
  const { tx } = useTxLocal();
  const mod = module ?? (/^0[1-7]$/.test(code ?? "") ? code : undefined);
  if (embedded) return children ? <div className="dhr-cmd mb-4" data-hr-home-context={id}>{children}</div> : null;
  const band = !!(purpose || children);
  // ONE STANDARD (owner 2026-11-12): title, purpose and actions in the shared Enterprise band; the context toolbar follows
  // directly under it in a shared card
  return (
    <header className="dhr-pagehead mb-4" data-dhr-band data-hr-home-header={id} data-band-mode={band ? "band" : "identity"}>
      <ContextStrip icon={<img src="/icons/digit/mod/digit-mod-hr-dark.svg" alt="" className="h-6 w-6" />}
        eyebrow={<span className="dhr-eyebrow">
          {code && <span className="dhr-code-chip" data-no-i18n>{code}</span>}
          {mod ? <><Link to="/digit-hr" activeOptions={{ exact: true }} className="dhr-eyebrow-link" data-eyebrow-home>{tx("ديجيت للموارد البشرية", "DIGIT HR")}</Link><span aria-hidden className="opacity-50">/</span></> : null}
          <span className="truncate">{suite}</span>
          {mod && <Link to="/digit-hr/s/$section" params={{ section: `${mod}.1` }} activeOptions={{ exact: true }} className="dhr-eyebrow-link dhr-eyebrow-sections max-sm:hidden" data-eyebrow-sections>{tx("الأقسام", "Sections")}</Link>}
        </span>}
        title={title} sub={purpose ? <span className="dhr-cmd-sub" title={typeof purpose === "string" ? purpose : undefined}>{purpose}</span> : undefined}
        actions={actions ? <HrActionStrip>{actions}</HrActionStrip> : undefined} />
      {children && <div className="ek-card ek-filterbar dhr-band-ctx mt-3" data-dhr-cmdband>{children}</div>}
    </header>
  );
}
/** Local language helper (kit must not import the HR layout, which imports the kit's consumers). */
function useTxLocal() { const lang = useLang(); return { lang, tx: (ar: string, en: string) => (lang === "ar" ? ar : en) }; }

/** Thin context row under the header: scope controls on the start side, context facts on the end side. */
export function HrContextToolbar({ children, end, scopeKey, active = 0, tx }: { children?: ReactNode; end?: ReactNode; scopeKey?: string; /** number of active filters, shown on the phone disclosure */ active?: number; tx?: Tx }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="dhr-ctx" data-module-scope={scopeKey}>
      {tx && <button type="button" className="dhr-act sm:hidden" aria-expanded={open} onClick={() => setOpen(!open)} data-ctx-toggle>
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />{tx("النطاق والمرشحات", "Scope & filters")}{active > 0 && <b className="dhr-tnum" data-no-i18n>{active}</b>}
      </button>}
      <div className={`dhr-ctx-main ${tx && !open ? "hidden" : "flex"} min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 sm:flex`}>{children}</div>
      {end && <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--dhr-muted)]">{end}</div>}
    </div>
  );
}

/** Labelled compact control inside the context toolbar. */
export function CtxField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="dhr-ctx-field"><span className="dhr-ctx-label">{label}</span>{children}</label>;
}

/** Company scope select (URL `company`); a company outside the permitted set shows an explicit denial, never all companies. */
export function CompanyScope({ scope, tx, ariaLabel }: { scope: ModuleScope; tx: Tx; ariaLabel?: [string, string] }) {
  const opts = scope.company && !scope.companies.includes(scope.company) ? [...scope.companies, scope.company] : scope.companies;
  return (
    <CtxField label={tx("الشركة", "Company")}>
      <select aria-label={tx(...(ariaLabel ?? ["شركة مساحة العمل", "Workspace company"]))} value={scope.company} onChange={(e) => scope.set({ company: e.target.value })} className="max-w-[15rem]">
        <option value="">{tx("كل الشركات المتاحة لك", "All companies you may see")}</option>
        {opts.map((c) => <option key={c} value={c} data-no-i18n>{tx(arLabel(c), c)}</option>)}
      </select>
    </CtxField>
  );
}

/** Period scope (URL `from`/`to`). */
export function PeriodScope({ scope, tx, labels }: { scope: ModuleScope; tx: Tx; labels?: { from: [string, string]; to: [string, string] } }) {
  return <>{(["from", "to"] as const).map((k) => (
    <CtxField key={k} label={k === "from" ? tx("من", "From") : tx("إلى", "To")}>
      <DateInput aria-label={tx(...(labels?.[k] ?? (k === "from" ? ["بداية الفترة", "Period start"] : ["نهاية الفترة", "Period end"])))} value={scope[k]} onChange={(e) => scope.set({ [k]: e.target.value })} data-no-i18n />
    </CtxField>
  ))}</>;
}

/** Clear-scope action shown only while a scope is active. */
export function ClearScope({ scope, tx, period }: { scope: ModuleScope; tx: Tx; period?: boolean }) {
  if (!scope.company && !(period && (scope.from || scope.to))) return null;
  return <button type="button" className="dhr-act" onClick={() => scope.set({ company: "", ...(period ? { from: "", to: "" } : {}) })}><X className="h-3.5 w-3.5" aria-hidden />{tx("مسح النطاق", "Clear scope")}</button>;
}

/** Scope denial (company outside the reader's permitted employees). */
export function ScopeDenied({ scope, tx }: { scope: ModuleScope; tx: Tx }) {
  if (scope.companyKnown) return null;
  return <p role="alert" data-scope-denied className="dhr-alert mb-4 text-sm">{tx("الشركة المحددة خارج نطاق صلاحياتك؛ لا تُعرض أي سجلات بدلًا من عرض كل الشركات.", "The selected company is outside your permitted scope; no records are shown instead of widening to all companies.")} <span data-no-i18n>{scope.company}</span></p>;
}

/** Small factual pill (role, date, cycle id…). */
export function Pill({ children, tone, title }: { children: ReactNode; tone?: Tone | undefined; title?: string }) {
  return <span className="dhr-pill" data-tone={tone} title={title}>{children}</span>;
}

/** Quiet loading indicator for the context toolbar; non-loading problems are reported by SourceNotice as an alert. */
export function SourcesPill({ src }: { src: Sources }) {
  const loading = src.issues().filter((i) => i.read.state === "LOADING").length;
  if (!loading) return null;
  return <span className="dhr-pill" role="status" data-sources-loading={loading}><span className="dhr-dot-pulse" aria-hidden />{src.tx(`جارٍ تحميل ${loading} مصدر`, `Loading ${loading} source${loading > 1 ? "s" : ""}`)}</span>;
}

/* ------------------------------------------------------------------ layout */

export function HrActionStrip({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2" data-action-strip>{children}</div>;
}

/** 12-column composition ≥1280 px: main + side regions (8/4 or 7/5); stacked below. */
export function HrWorkspaceGrid({ main, side, split = "8/4", mobileSideFirst = false }: { main: ReactNode; side: ReactNode; split?: "8/4" | "7/5"; mobileSideFirst?: boolean }) {
  const [m, s] = split === "8/4" ? ["xl:col-span-8", "xl:col-span-4"] : ["xl:col-span-7", "xl:col-span-5"];
  return (
    <div className="grid gap-4 xl:grid-cols-12" data-workspace-grid={split}>
      <div className={`flex min-w-0 flex-col gap-4 ${m} ${mobileSideFirst ? "order-2 xl:order-1" : ""}`}>{main}</div>
      <aside className={`flex min-w-0 flex-col gap-4 ${s} ${mobileSideFirst ? "order-1 xl:order-2" : ""}`}>{side}</aside>
    </div>
  );
}

/**
 * Working panel with a fixed-height header row. `meta` = a short live fact; `info` = the rule/definition behind the
 * panel, behind an accessible disclosure (ⓘ), so honesty text stays one tap away without reading like documentation.
 */
export function HrInsightPanel({ title, meta, info, actions, toolbar, toolbarWrap, children, className, bodyClassName, flush, ...rest }: { title: ReactNode; meta?: ReactNode; info?: ReactNode; actions?: ReactNode; /** filter row under the header (scrolls horizontally on narrow screens) */ toolbar?: ReactNode; /** let the toolbar segments wrap onto a second line from sm up instead of scrolling */ toolbarWrap?: boolean; children: ReactNode; className?: string; bodyClassName?: string; flush?: boolean } & Record<`data-${string}`, unknown>) {
  const [open, setOpen] = useState(false);
  const defId = useId();
  const { tx } = useTxLocal();
  return (
    <section className={`dhr-panel ${className ?? ""}`} {...rest}>
      <div className="dhr-panel-h">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="dhr-panel-t truncate">{title}</h2>
            {info && <button type="button" className="dhr-info-btn" aria-expanded={open} aria-controls={defId} onClick={() => setOpen(!open)} aria-label={tx("التعريف ومصدر البيانات", "Definition and data source")} title={tx("التعريف ومصدر البيانات", "Definition and data source")} data-panel-info><Info className="h-3.5 w-3.5" aria-hidden /></button>}
          </div>
          {meta && <div className="dhr-panel-m">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5 max-sm:w-full">{actions}</div>}
      </div>
      {info && open && <div id={defId} className="dhr-panel-def dhr-fade-in" data-panel-definition>{info}</div>}
      {toolbar && <div className="dhr-panel-tb" data-wrap={toolbarWrap ? true : undefined}>{toolbar}</div>}
      <div className={flush ? bodyClassName ?? "" : `dhr-panel-b ${bodyClassName ?? ""}`}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ figures */

/** Compact KPI: value (usually a MetricValue drill), label and source tooltip. */
export function HrOperationalKpi({ label, value, source, tone, sub }: { label: string; value: ReactNode; source?: string; tone?: Tone | undefined; sub?: ReactNode }) {
  // `source` is a technical DocType/field definition (English identifiers): shown as a tooltip in English only; in Arabic
  // it stays available as data for audits so no untranslated text reaches the Arabic interface.
  const { lang } = useTxLocal();
  // Card anatomy (V2): semantic top rule (tone) → muted label → prominent value → existing basis/sub line.
  return (
    <div className="ek-kpi-tile" data-tone={tone} data-hr-kpi title={lang === "en" ? source : undefined} data-kpi-source={source}>
      <div className="ek-tile-label">{label}</div>
      <div className="ek-tile-value dhr-tnum" data-no-i18n>{value}</div>
      {sub && <div className="ek-tile-meta">{sub}</div>}
    </div>
  );
}

/** Horizontal meter (value/max) with a tone. */
export function Meter({ value, max, tone, label }: { value: number; max: number; tone?: Tone | undefined; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return <span className="dhr-meter" data-tone={tone} role="img" aria-label={label ?? `${value}/${max}`}><i style={{ width: `${pct}%` }} /></span>;
}

/** Segmented control (single choice). */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: ReactNode; count?: ReactNode; disabled?: boolean }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="dhr-seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" aria-pressed={value === o.id} disabled={o.disabled} onClick={() => onChange(o.id)} data-seg={o.id}>{o.label}{o.count !== undefined && <b className="dhr-tnum" data-no-i18n>{o.count}</b>}</button>)}
    </div>
  );
}

/** Tabs (WAI-ARIA tablist): arrow keys/Home/End move between tabs (mirrored in RTL); the selected tab is controlled (usually URL-backed). */
export function HrTabs<T extends string>({ value, tabs, onChange, label, idBase }: { value: T; tabs: { id: T; label: ReactNode; count?: ReactNode }[]; onChange: (v: T) => void; label: string; idBase: string }) {
  const key = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const rtl = document.documentElement.dir === "rtl";
    const fwd = rtl ? "ArrowLeft" : "ArrowRight", back = rtl ? "ArrowRight" : "ArrowLeft";
    const j = e.key === fwd ? i + 1 : e.key === back ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (j === null) return;
    e.preventDefault();
    const k = (j + tabs.length) % tabs.length;
    const next = tabs[k]; if (!next) return;
    onChange(next.id);
    e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[k]?.focus();
  };
  return (
    <div className="dhr-htabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => <button key={t.id} type="button" role="tab" id={`${idBase}-tab-${t.id}`} aria-controls={`${idBase}-panel`} aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1} className="dhr-htab" onClick={() => onChange(t.id)} onKeyDown={(e) => key(e, i)} data-tab={t.id}>{t.label}{t.count !== undefined && <b className="dhr-tnum" data-no-i18n>{t.count}</b>}</button>)}
    </div>
  );
}

/* ------------------------------------------------------------------ queues + inspector */

export type QueueGroup = { id: string; ar: string; en: string; tone?: Tone };
/**
 * Grouped priority list. Rows are buttons-in-rows: the row itself is selectable (click, Enter/Space, ↑/↓ move focus);
 * links and buttons inside a row keep their own behaviour.
 */
export function HrPriorityQueue<T>({ items, groups, groupOf, keyOf, selected, onSelect, render, tx, empty, label, maxHeight, toneOf }: {
  items: T[]; groups: QueueGroup[]; groupOf: (t: T) => string; keyOf: (t: T) => string; selected?: string; onSelect?: (k: string) => void;
  render: (t: T) => ReactNode; tx: Tx; empty: ReactNode; label: string; maxHeight?: string; toneOf?: (t: T) => Tone | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: KeyboardEvent<HTMLDivElement>, k: string) => {
    if ((e.target as HTMLElement).closest("a,button:not([data-qrow]),input,select")) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(k); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const rows = [...(ref.current?.querySelectorAll<HTMLElement>("[data-qrow]") ?? [])];
    const i = rows.indexOf(e.currentTarget as HTMLElement);
    rows[e.key === "ArrowDown" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1)]?.focus();
  };
  if (!items.length) return <>{empty}</>;
  return (
    <div ref={ref} className="dhr-queue" style={maxHeight ? { maxHeight } : undefined} role="list" aria-label={label}>
      {groups.map((g) => {
        const rows = items.filter((t) => groupOf(t) === g.id);
        if (!rows.length) return null;
        return (
          <div key={g.id} role="presentation" data-queue-group={g.id}>
            <div className="dhr-group-h"><span>{tx(g.ar, g.en)}</span><b className="dhr-tnum" data-no-i18n>{rows.length}</b></div>
            {rows.map((t) => { const k = keyOf(t); return (
              <div key={k} role="listitem" tabIndex={0} data-qrow={k} data-tone={toneOf?.(t) ?? g.tone} aria-selected={selected === k} className="dhr-qrow"
                onClick={(e) => { if ((e.target as HTMLElement).closest("a,button,input,select")) return; onSelect?.(k); }} onKeyDown={(e) => move(e, k)}>
                {render(t)}
              </div>); })}
          </div>
        );
      })}
    </div>
  );
}

/** Selected-record inspector: facts + canonical actions. */
export function HrContextInspector({ title, subtitle, onClose, children, actions, tx }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children?: ReactNode; actions?: ReactNode; tx: Tx }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.focus(); }, [title]);
  return (
    <section ref={ref} tabIndex={-1} className="dhr-panel dhr-inspector dhr-fade-in" aria-label={tx("تفاصيل السجل المحدد", "Selected record details")} data-inspector onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="dhr-panel-h">
        <div className="min-w-0"><h2 className="dhr-panel-t truncate">{title}</h2>{subtitle && <div className="dhr-panel-m">{subtitle}</div>}</div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={tx("إغلاق التفاصيل", "Close details")}><X className="h-4 w-4" /></Button>
      </div>
      <div className="dhr-panel-b space-y-3">
        {children}
        {actions && <div className="flex flex-wrap gap-2 border-t border-[var(--dhr-sep)] pt-3">{actions}</div>}
      </div>
    </section>
  );
}

/** Definition grid used inside inspectors and cards. */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">{items.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-[11px] text-[var(--dhr-muted)]">{k}</dt><dd className="truncate" data-no-i18n>{v || "—"}</dd></div>)}</dl>;
}

/* ------------------------------------------------------------------ navigation + links */

export type NavItem = { id: string; title: string; sub?: string; to: ReactNode; figures?: { label: string; value: ReactNode; tone?: Tone | undefined }[] };
/** Compact navigator rows (modules or sections) with live figures. */
export function HrSectionNavigator({ items, label }: { items: NavItem[]; label: string }) {
  return (
    <nav aria-label={label} className="dhr-navgrid">
      {items.map((it) => (
        <div key={it.id} className="dhr-navcell" data-nav-item={it.id}>
          {/* UX-18: the title gets the full card width (two lines); the open action moves to the card footer. */}
          <div className="min-w-0">
            <div className="flex items-start gap-2"><span className="dhr-code-chip mt-px shrink-0" data-no-i18n>{it.id}</span><span className="line-clamp-2 text-[13px] font-semibold leading-snug" data-nav-title>{it.title}</span></div>
            {it.sub && <div className="mt-0.5 truncate text-[11.5px] text-[var(--dhr-muted)]">{it.sub}</div>}
          </div>
          {it.figures && <dl className="mt-2 grid gap-1">{it.figures.map((f) => <div key={f.label} className="flex items-center justify-between gap-2 text-[12px]"><dt className="truncate text-[var(--dhr-muted)]" title={f.label}>{f.label}</dt><dd className="dhr-tnum font-semibold" data-tone={f.tone} data-no-i18n>{f.value}</dd></div>)}</dl>}
          {it.to && <div className="mt-auto flex justify-end pt-2">{it.to}</div>}
        </div>
      ))}
    </nav>
  );
}

/** Canonical record/register link with the consistent HR link style (keeps the HR shell context). */
export function HrSourceLink(props: Parameters<typeof Native>[0]) {
  return <Native {...props} className={props.className ?? "dhr-link"} />;
}

/** Round 2: Mission control / Sections moved into the header eyebrow as quiet links (HrCommandHeader `module`/`code`). Kept for callers. */
export function ModuleLinks(_: { module: string; tx: Tx }) { return null; }

/* ------------------------------------------------------------------ states */

/**
 * Structured empty / blocked state. LOADING renders a stable skeleton (no layout jump); denial, unavailability and
 * errors explain what is missing; a genuine zero explains what would appear and offers the permitted next action.
 */
export function HrEmptyOrBlockedState({ read, tx, title, body, action, rows = 3 }: { read?: SourceRead | undefined; tx: Tx; title?: string; body?: string; action?: ReactNode; rows?: number }) {
  if (read && read.state === "LOADING") return (
    <div role="status" data-source-state="LOADING" className="space-y-2 py-1" aria-label={stateText("LOADING", tx)}>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="dhr-skeleton h-8" style={{ width: `${92 - i * 11}%` }} />)}
      <span className="sr-only">{stateText("LOADING", tx)}</span>
    </div>
  );
  const blocked = read && read.state !== "READY_EMPTY" && read.state !== "READY_WITH_DATA";
  return (
    <div className="dhr-empty" data-source-state={read?.state ?? "READY_EMPTY"} role={blocked ? "status" : undefined} data-blocked={blocked ? 1 : undefined}>
      <div className="font-medium">{blocked ? stateText(read.state, tx) : title ?? tx("لا توجد سجلات.", "No records.")}</div>
      {(body || blocked) && <p className="mt-0.5 text-[12px] text-[var(--dhr-muted)]">{blocked ? read.state === "DENIED" ? tx("المحتوى مقيّد على مستوى البيانات؛ لا تُعرض أرقام بديلة.", "Restricted at the data level; no substitute figures are shown.") : tx("لا يُعرض صفر بدلًا من مصدر غير مقروء.", "An unreadable source is never shown as zero.") : body}</p>}
      {action && !blocked && <div className="mt-2">{action}</div>}
      {blocked && read.state === "DENIED" && <EssDirection tx={tx} compact />}
    </div>
  );
}

/* ------------------------------------------------------------------ helpers */

/** Patches URL search params (empty value removes the key), keeping every other param (scope, register state). */
export function useSearchPatch() {
  const navigate = useNavigate();
  return (patch: Record<string, string | undefined>, replace = false) => void navigate({ to: ".", replace, search: ((prev: Record<string, unknown>) => {
    const next: Record<string, unknown> = { ...prev };
    for (const [k, v] of Object.entries(patch)) { if (v) next[k] = v; else delete next[k]; }
    return next;
  }) as never });
}

/** Matches a min-width media query after hydration (false during SSR). */
export function useMinWidth(px: number): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const q = window.matchMedia(`(min-width: ${px}px)`);
    const on = () => setOk(q.matches); on();
    q.addEventListener("change", on); return () => q.removeEventListener("change", on);
  }, [px]);
  return ok;
}

/** Today's ISO date, set after hydration (empty during SSR so markup matches). */
export function useToday(): string {
  const [d, setD] = useState("");
  useEffect(() => { setD(new Date().toISOString().slice(0, 10)); }, []);
  return d;
}

/** Signed whole days from `today` to an ISO date (positive = future); null when either is missing. */
export function daysFrom(today: string, date: string): number | null {
  if (!today || !date) return null;
  const a = Date.parse(today.slice(0, 10)), b = Date.parse(date.slice(0, 10));
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 864e5);
}

/** "in 3 d" / "3 d ago" / "today" label for a dated item. */
export function relDay(today: string, date: string, tx: Tx): string {
  const d = daysFrom(today, date);
  if (d === null) return "—";
  if (d === 0) return tx("اليوم", "today");
  return d > 0 ? tx(`بعد ${d} يوم`, `in ${d} d`) : tx(`منذ ${-d} يوم`, `${-d} d ago`);
}

/** Initials for a person label (display only). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "·";
}
