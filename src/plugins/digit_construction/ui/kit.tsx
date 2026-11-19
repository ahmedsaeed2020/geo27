/**
 * Shared building blocks of the DIGIT Construction virtual pages. Every value shown is read from the shared adapter
 * at render time (domain/data.ts); links open the canonical native/app forms and lists with the app context kept.
 * Record content is marked data-no-i18n so the display translation layer never rewrites stored values.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Children, Fragment, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { notifyError, notifySaved } from "./notify";
import { useLang } from "@/i18n";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { cachedMeta, indexQuery, loadMeta } from "@/lib/catalog";
import { createDraft } from "@/lib/documentApi";
import { Open360 } from "@/components/enterprise/Open360";
import { fmtCurrency, fmtDate, fmtNumber } from "@/lib/format";
import { currentUser, hasPerm, useSessionUser, userRoles, ADMIN } from "@/lib/session";
import { pluginSlug, usePluginsVersion } from "@/plugins/runtime";
import { useActiveApp } from "@/plugins/appShell";
import { useAppModules } from "@/components/plugins/ActiveAppNav";
import { NavIcon } from "@/components/plugins/navIcons";
import { BAND_BTN, CommandBand, DxCrumbs, DxPanel, SignalCard, SignalGrid, type BandMeta, type DxTone, type SignalProps, Chev } from "@/components/digit/Experience";
import { CONSTRUCTION_DOCTYPES, OPTION_AR } from "../schema";
import { APP, policyDefined, POLICY_AFFECTS, POLICY_TITLES } from "../domain/data";
import { canReadDoctype, canSeeRecord } from "../domain/access";
import type { Result } from "../domain/services";

export const OWN = new Set(CONSTRUCTION_DOCTYPES.map((d) => d.name));

// ---------------------------------------------------------------- presentation tokens (Run 1: appearance only, handlers untouched)
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const BTN_BASE = `inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3.5 text-sm font-medium transition-colors max-md:min-h-11 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
/** Shared button looks: primary (one main action), secondary, compact (inline section actions), quiet (text-like). */
export const BTN = {
  primary: `${BTN_BASE} bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/80`,
  secondary: `${BTN_BASE} border border-input bg-card text-foreground hover:bg-muted active:bg-muted/80`,
  compact: `inline-flex min-h-8 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-input bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted max-md:min-h-11 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`,
  danger: `${BTN_BASE} border border-destructive/40 bg-card text-destructive hover:bg-destructive/10`,
} as const;

/** Re-render on record, plugin and session changes; returns the language helpers. */
export function useCx() {
  useStoreVersion(); usePluginsVersion(); const user = useSessionUser();
  const ar = useLang() === "ar";
  const t = (en: string, arText: string) => (ar ? arText : en);
  return { ar, t, user };
}

// ---------------------------------------------------------------- formatting
export const money = (n: unknown) => (n === null || n === undefined || n === "" ? "—" : fmtCurrency(Number(n), "SAR"));
export const amount = (n: unknown) => (n === null || n === undefined || n === "" ? "—" : fmtNumber(Number(n), 2));
export const qty = (n: unknown) => (n === null || n === undefined || n === "" ? "—" : fmtNumber(Number(n), Number.isInteger(Number(n)) ? 0 : 2));
export const pctTxt = (n: unknown) => (n === null || n === undefined || n === "" || !Number.isFinite(Number(n)) ? "—" : `${fmtNumber(Number(n), 1)}%`);
export const dateTxt = (v: unknown) => (v ? fmtDate(v) : "—");
/** Compact money for KPI tiles (e.g. 12.4M). */
export function compact(n: unknown, ar: boolean) {
  if (n === null || n === undefined) return "—";
  const v = Number(n), a = Math.abs(v);
  const [d, s] = a >= 1e9 ? [1e9, ar ? " مليار" : "B"] : a >= 1e6 ? [1e6, ar ? " مليون" : "M"] : a >= 1e3 ? [1e3, ar ? " ألف" : "K"] : [1, ""];
  return `${fmtNumber(v / d, d === 1 ? 0 : 1)}${s}`;
}

// ---------------------------------------------------------------- navigation
export function useDocRoute() {
  const idx = useQuery(indexQuery);
  useSessionUser();
  return (doctype: string) => {
    if (!canReadDoctype(doctype)) return undefined;
    if (OWN.has(doctype)) return { app: "erpnext", slug: pluginSlug(doctype) };
    const e = idx.data?.find((x) => x.name === doctype);
    return e ? { app: e.app, slug: e.slug } : undefined;
  };
}
export { canReadDoctype, canSeeRecord } from "../domain/access";
/** A record the session user may not read is never shown — not its name, not a link to a form that would refuse to open. */
function Restricted() {
  const ar = useLang() === "ar";
  return <span className="text-muted-foreground" data-restricted title={ar ? "لا تملك صلاحية عرض هذا السجل" : "You do not have permission to view this record"}>{ar ? "مقيّد" : "Restricted"}</span>;
}
/** Link to a record form (native or app DocType); app context kept so the app menu stays. */
/** row: optional child-row anchor (`table:idx`, src/lib/rowAnchor.ts) — the form opens with that row highlighted. */
export function DocRef({ doctype, name, children, className, row }: { doctype: string; name: unknown; children?: ReactNode; className?: string | undefined; row?: string | undefined }) {
  const route = useDocRoute();
  const n = String(name ?? "");
  if (!n) return <span className="text-muted-foreground">—</span>;
  if (!canSeeRecord(doctype, n)) return <Restricted />;
  const r = route(doctype);
  if (!r) return <span data-no-i18n>{children ?? n}</span>;
  return <Link to="/app/$app/$doctype/$name" params={{ app: r.app, doctype: r.slug, name: n }} search={(row ? { app: APP, row } : { app: APP }) as never} className={className ?? "text-primary hover:underline"} data-no-i18n={children ? undefined : true}>{children ?? n}</Link>;
}
/** Link to a filtered list of a DocType. */
export function ListRef({ doctype, filters, children, className }: { doctype: string; filters?: [string, string, unknown][] | undefined; children: ReactNode; className?: string | undefined }) {
  const route = useDocRoute(); const r = route(doctype);
  if (!r) return <span>{children}</span>;
  const search = { app: APP, ...(filters?.length ? { filters: JSON.stringify(filters) } : {}) };
  return <Link to="/app/$app/$doctype" params={{ app: r.app, doctype: r.slug }} search={search as never} className={className ?? "text-primary hover:underline"}>{children}</Link>;
}
/** Link inside the app (page path relative to /plugins/digit_construction/). */
export function AppLink({ to, children, className, title }: { to: string; children: ReactNode; className?: string | undefined; title?: string | undefined }) {
  const [path = "", qs] = to.split("?");
  const search = qs ? Object.fromEntries(new URLSearchParams(qs)) : undefined;
  // exact: a breadcrumb or in-app link to a parent page is not the current page (the router matches by prefix otherwise)
  if (!path) return <Link to="/plugins/$name" params={{ name: APP }} activeOptions={{ exact: true }} className={className ?? "text-primary hover:underline"} title={title}>{children}</Link>;
  return <Link to="/plugins/$name/$" params={{ name: APP, _splat: decodeURIComponent(path) }} search={search as never} activeOptions={{ exact: true }} className={className ?? "text-primary hover:underline"} title={title}>{children}</Link>;
}
/** Create a local draft of a DocType with link defaults and open its form (named on first save, Frappe new-doc semantics). */
export function NewDoc({ doctype, defaults, label, primary, band }: { doctype: string; defaults: Record<string, unknown>; label: string; primary?: boolean; band?: boolean }) {
  const idx = useQuery(indexQuery); const route = useDocRoute(); const nav = useNavigate();
  const go = async () => {
    const meta = idx.data ? await loadMeta(idx.data, doctype) : undefined;
    if (!meta) { notifyError(`${doctype}: metadata unavailable`); return; }
    const r = createDraft(meta); if (!r.doc) { notifyError(r.errors.join("\n")); return; }
    adapter.insertDocQuiet(doctype, { ...r.doc, ...defaults }); adapter.flush();
    const where = route(doctype); if (where) void nav({ to: "/app/$app/$doctype/$name", params: { app: where.app, doctype: where.slug, name: r.doc.name }, search: { app: APP } as never });
  };
  return <button type="button" onClick={() => void go()} data-new-doc={doctype} className={band ? BAND_BTN.primary : primary ? BTN.primary : BTN.compact}><span aria-hidden>+</span> {label}</button>;
}
export const p360 = (project: string, tab?: string) => `project/${encodeURIComponent(project)}${tab ? `?tab=${tab}` : ""}`;
export function ProjectRef({ project, title }: { project: string; title?: string }) {
  return <AppLink to={`project/${encodeURIComponent(project)}`}><span data-no-i18n>{title ?? project}</span></AppLink>;
}

// ---------------------------------------------------------------- layout (DIGIT Experience: identity → command band → content)
export interface BandSpec { question: ReactNode; basis?: ReactNode; eyebrow?: ReactNode; meta?: BandMeta[]; controls?: ReactNode; actions?: ReactNode; compact?: boolean }
/**
 * Page identity (breadcrumb, module icon, title) followed by the command band. Pages that declare `band` get the full
 * band (question, data basis, scope meta, scope controls, actions); others get the compact band carrying their subtitle
 * and actions, so every Construction page shares one anatomy. The eyebrow names the app and the selected rail module.
 */
export function PageHeader({ title, subtitle, crumbs, actions, band }: { title: string; subtitle?: ReactNode; crumbs?: { label: string; to: string }[]; actions?: ReactNode; band?: BandSpec }) {
  const { t, ar } = useCx();
  const { current } = useAppModules(useActiveApp());
  const mod = current ? (ar ? current.label_ar ?? current.label : current.label) : undefined;
  const eyebrow = <>{t("DIGIT Construction", "ديجيت للمقاولات")}{mod && <> · {mod}</>}</>;
  const trail = [<AppLink key="app" to="" className="hover:text-foreground hover:underline">{t("DIGIT Construction", "ديجيت للمقاولات")}</AppLink>,
    ...(crumbs ?? []).map((c) => <AppLink key={c.to} to={c.to} className="hover:text-foreground hover:underline">{c.label}</AppLink>)];
  const bandActions = band?.actions ?? actions;
  return (
    <>
      <DxCrumbs crumbs={trail} ariaCrumbs={t("Breadcrumb", "مسار التنقل")} />
      <CommandBand icon={<NavIcon name={current?.icon} on="dark" className="h-5 w-5" />} eyebrow={band?.eyebrow ?? eyebrow} title={title}
        description={band ? <>{band.question}{(band.basis ?? subtitle) && <span className="ek-context-basis">{band.basis ?? subtitle}</span>}</> : subtitle}
        meta={band?.meta} controls={band?.controls} actions={bandActions} compact={band?.compact ?? !band} />
    </>
  );
}
/** Band action links/buttons (primary = the one main action). */
export const BAND = BAND_BTN;
export function Section({ title, actions, children, id, className }: { title: ReactNode; actions?: ReactNode; children: ReactNode; id?: string; className?: string }) {
  return <DxPanel title={title} actions={actions} id={id} className={className}>{children}</DxPanel>;
}
type Tone = "default" | "good" | "warn" | "bad" | "info";
const DX_TONE: Record<Tone, DxTone> = { default: "neutral", good: "good", warn: "warn", bad: "bad", info: "info" };
/**
 * KPI signal card; drills to an app page (to), a filtered list (list) or the section of this page holding its source
 * rows (anchor). `delta` only for a comparison the read model already computes; `spark` only for a real series.
 */
export function Kpi({ label, value, hint, tone = "default", to, list, anchor, delta, spark, meter }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone | undefined; to?: string | undefined; list?: { doctype: string; filters?: [string, string, unknown][] }; anchor?: string | undefined; delta?: SignalProps["delta"]; spark?: SignalProps["spark"]; meter?: SignalProps["meter"] }) {
  const { t } = useCx();
  const common = { label, value, tone: DX_TONE[tone], basis: hint, delta, spark, meter };
  if (to !== undefined) return <SignalCard {...common} attrs={{ "data-kpi": "page" }} footer={<>{t("Open", "فتح")} <Chev /></>} link={(b, cls) => <AppLink to={to} className={cls}>{b}</AppLink>} />;
  if (list) return <SignalCard {...common} attrs={{ "data-kpi": "list" }} footer={<>{t("Open records", "فتح السجلات")} <Chev /></>} link={(b, cls) => <ListRef doctype={list.doctype} filters={list.filters} className={cls}>{b}</ListRef>} />;
  if (anchor) {
    // same-page source rows: scroll and move focus there without changing the route (Back keeps its meaning)
    const go = (e: MouseEvent) => { e.preventDefault(); const el = document.getElementById(anchor); if (!el) return; el.scrollIntoView({ behavior: "smooth", block: "start" }); el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); };
    return <SignalCard {...common} attrs={{ "data-kpi": "anchor" }} footer={<>{t("Show source rows", "عرض صفوف المصدر")} <Chev /></>} link={(b, cls) => <a href={`#${anchor}`} onClick={go} className={cls}>{b}</a>} />;
  }
  return <SignalCard {...common} attrs={{ "data-kpi": "" }} />;
}
/** KPI row: an explicit column count, else even rows for 3/4/6 cards (no orphan card on its own row), else auto-fit. */
export function KpiGrid({ children, cols }: { children: ReactNode; cols?: "auto" | 3 | 4 | 6 }) {
  const n = Children.toArray(children).filter(Boolean).length;
  return <SignalGrid cols={cols ?? (n === 6 ? 6 : n === 4 ? 4 : n === 3 ? 3 : "auto")}>{children}</SignalGrid>;
}

const STATE_TONE: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground", Submitted: "bg-primary/10 text-primary", "Under Review": "bg-primary/10 text-primary", "Pending Approval": "bg-primary/10 text-primary", "Under Negotiation": "bg-primary/10 text-primary",
  Approved: "bg-success/15 text-success", Active: "bg-success/15 text-success", Confirmed: "bg-success/15 text-success", Certified: "bg-success/15 text-success", Invoiced: "bg-success/15 text-success", Reviewed: "bg-success/15 text-success", Agreed: "bg-success/15 text-success", Won: "bg-success/15 text-success", Open: "bg-success/15 text-success", Defined: "bg-success/15 text-success", Paid: "bg-success/15 text-success", Completed: "bg-success/15 text-success",
  "Partly Certified": "bg-warning/15 text-warning", Returned: "bg-warning/15 text-warning", Suspended: "bg-warning/15 text-warning", Disputed: "bg-warning/15 text-warning", Pricing: "bg-warning/15 text-warning", Overdue: "bg-destructive/10 text-destructive", "Partly Paid": "bg-warning/15 text-warning", Unpaid: "bg-warning/15 text-warning",
  Rejected: "bg-destructive/10 text-destructive", Cancelled: "bg-destructive/10 text-destructive", Lost: "bg-destructive/10 text-destructive", Undefined: "bg-destructive/10 text-destructive", Superseded: "bg-muted text-muted-foreground", Closed: "bg-muted text-muted-foreground",
};
/** Arabic display of workflow / status values (stored values stay English; unknown values fall back to the shared display layer). */
export const STATE_AR: Record<string, string> = {
  // R19 workflow states (Arabic from the supplied source translations)
  "Pricing Requested": "طُلب التسعير", Granted: "ممنوح", "Partially Granted": "ممنوح جزئيًا", "Under Assessment": "قيد التقييم", "Partially Agreed": "متفق عليه جزئيًا", Deducted: "مخصوم",
  Draft: "مسودة", Submitted: "مُرسل", "Under Review": "قيد المراجعة", "Pending Approval": "بانتظار الاعتماد", "Under Negotiation": "قيد التفاوض", Approved: "معتمد", Active: "نشط", Confirmed: "مؤكد",
  Certified: "معتمد فنياً", Invoiced: "مفوتر", Reviewed: "تمت المراجعة", Agreed: "متفق عليه", Won: "فائز", Open: "مفتوح", Defined: "محدد", Paid: "مدفوع", Completed: "مكتمل", "Partly Certified": "معتمد جزئياً",
  "Changes Requested": "طلب تعديل", Returned: "مُعاد", Suspended: "موقوف", Disputed: "متنازع عليه", Pricing: "قيد التسعير", Overdue: "متأخر", "Partly Paid": "مدفوع جزئياً", Unpaid: "غير مدفوع", Rejected: "مرفوض", Cancelled: "ملغى",
  Lost: "خاسر", Undefined: "غير محدد", Superseded: "مستبدل", Closed: "مغلق", Pending: "معلق", Done: "منجز", "Not Applicable": "غير منطبق", "In Progress": "قيد التنفيذ", "Not Started": "لم يبدأ",
  Planned: "مخطط", Committed: "ملتزم", "To Bill": "بانتظار الفوترة", "To Receive": "بانتظار الاستلام", "To Receive and Bill": "بانتظار الاستلام والفوترة", Ordered: "مطلوب", "Partially Ordered": "مطلوب جزئياً",
  "Partially Received": "مستلم جزئياً", Received: "مستلم", Stopped: "متوقف", Return: "مرتجع", Template: "قالب", Inactive: "غير نشط", Available: "متاح", "In Use": "قيد الاستخدام", Maintenance: "صيانة",
};
/** Plain status text (same Arabic as StateBadge) for places a coloured badge cannot sit, e.g. command band details. */
export function StateText({ state }: { state: unknown }) {
  const { ar } = useCx();
  const s = String(state ?? ""); if (!s) return <span>—</span>;
  const arBase = OPTION_AR[s] ?? STATE_AR[s];
  return <span data-state={s} data-no-i18n={ar && arBase ? true : undefined}>{ar && arBase ? arBase : s}</span>;
}
/** Workflow/status badge (Arabic via schema OPTION_AR then STATE_AR; stored values stay English; values outside both keep the shared display translation). */
export function StateBadge({ state }: { state: unknown }) {
  const { ar } = useCx();
  const s = String(state ?? "");
  if (!s) return <span className="text-muted-foreground">—</span>;
  const m = /^(.*?) \((\d+)\)$/.exec(s); const base = m ? m[1]! : s; // gate values like "Pending (3)" keep their count
  // same Arabic as the native list badge, form field and form header (schema OPTION_AR), then app-only statuses (STATE_AR)
  const arBase = OPTION_AR[base] ?? STATE_AR[base];
  const label = ar && arBase ? (m ? `${arBase} (${m[2]})` : arBase) : undefined;
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${STATE_TONE[base] ?? "bg-muted text-muted-foreground"}`} data-state={s} data-no-i18n={label ? true : undefined}>{label ?? s}</span>;
}
export function Empty({ children }: { children: ReactNode }) { return <p className="py-6 text-center text-sm text-muted-foreground" role="status">{children}</p>; }
export function Note({ tone = "info", children }: { tone?: "info" | "warn" | "bad"; children: ReactNode }) {
  const c = tone === "bad" ? "border-destructive/40 bg-destructive/5" : tone === "warn" ? "border-warning/40 bg-warning/10" : "border-primary/30 bg-primary/5";
  return <div className={`mb-3 rounded-md border px-3 py-2 text-sm ${c}`} role={tone === "info" ? "note" : "alert"}>{children}</div>;
}

// ---------------------------------------------------------------- table
export type ColKind = "text" | "money" | "num" | "pct" | "date" | "state" | "doc" | "project" | "check";
export interface Col<R> { key: string; label: string; kind?: ColKind; doctype?: string; get?: (r: R) => unknown; render?: (r: R) => ReactNode; total?: boolean; align?: "start" | "end" }
const isNum = (k?: ColKind) => k === "money" || k === "num" || k === "pct";
/** `onRow` opens a row (queue → record split view); clicks on links, buttons and inputs inside the row keep their own action. */
export function DataTable<R extends Record<string, unknown>>({ cols, rows, empty, rowKey, caption, pageSize = 50, onRow, activeKey, expand }: { cols: Col<R>[]; rows: R[]; empty: ReactNode; rowKey?: (r: R, i: number) => string; caption?: string; pageSize?: number; onRow?: ((r: R) => void) | undefined; activeKey?: string | undefined;
  /** phase 4 C4-08: a row's expanded detail renders as a full-width row right under it (kept attached when sorting) */
  expand?: { open: (r: R) => boolean; render: (r: R) => ReactNode } | undefined }) {
  const { t } = useCx();
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(pageSize);
  const val = (c: Col<R>, r: R) => (c.get ? c.get(r) : r[c.key]);
  const sorted = useMemo(() => {
    if (!sort) return rows; const c = cols.find((x) => x.key === sort.k); if (!c) return rows;
    return [...rows].sort((a, b) => { const x = val(c, a), y = val(c, b); const d = isNum(c.kind) ? Number(x ?? 0) - Number(y ?? 0) : String(x ?? "").localeCompare(String(y ?? "")); return d * sort.dir; });
  }, [rows, sort, cols]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows.length) return <Empty>{empty}</Empty>;
  const cell = (c: Col<R>, r: R): ReactNode => {
    if (c.render) return c.render(r);
    const v = val(c, r);
    switch (c.kind) {
      case "money": return <span data-no-i18n>{amount(v)}</span>;
      case "num": return <span data-no-i18n>{qty(v)}</span>;
      case "pct": return <span data-no-i18n>{pctTxt(v)}</span>;
      case "date": return <span data-no-i18n>{dateTxt(v)}</span>;
      case "state": return <StateBadge state={v} />;
      case "check": return v ? "✓" : "";
      // owner SH-05: a row's project carries the «360» button (Open360 shows nothing without read access)
      case "doc": return c.doctype === "Project" && v ? <span className="inline-flex items-center gap-1.5"><DocRef doctype={c.doctype} name={v} /><Open360 doctype="Project" name={String(v)} compact /></span> : <DocRef doctype={c.doctype!} name={v} />;
      case "project": return v ? <span className="inline-flex items-center gap-1.5"><ProjectRef project={String(v)} /><Open360 doctype="Project" name={String(v)} compact /></span> : <ProjectRef project="" />;
      default: return <span data-no-i18n>{v === null || v === undefined || v === "" ? "—" : String(v)}</span>;
    }
  };
  const totals = cols.some((c) => c.total);
  const wide = cols.length >= 9; // dense tables switch to compact type so desktop widths fit without scrolling
  const pad = wide ? "px-1.5" : "px-3";
  return (
    <div className="overflow-x-auto [scrollbar-width:thin]" data-table-scroll>
      <table className={`w-full min-w-max border-collapse ${wide ? "text-xs" : "text-sm"}`}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-border bg-muted/70 text-xs text-muted-foreground">
            {cols.map((c) => (
              <th key={c.key} scope="col" className={`whitespace-nowrap ${pad} py-2 font-semibold ${isNum(c.kind) || c.align === "end" ? "text-end" : "text-start"}`} aria-sort={sort?.k === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                <button type="button" className={`rounded-sm hover:text-foreground ${sort?.k === c.key ? "text-foreground" : ""} ${FOCUS}`} onClick={() => setSort(sort?.k === c.key ? { k: c.key, dir: sort.dir === 1 ? -1 : 1 } : { k: c.key, dir: 1 })}>{c.label}{sort?.k === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, limit).map((r, i) => (<Fragment key={rowKey ? rowKey(r, i) : String(r["name"] ?? i)}>
            <tr className={`border-b border-border/70 last:border-0 hover:bg-accent/60 ${onRow ? "cursor-pointer" : ""} ${activeKey && rowKey && rowKey(r, i) === activeKey ? "bg-primary/10" : ""}`}
              {...(onRow ? { tabIndex: 0, "data-row-open": rowKey ? rowKey(r, i) : String(r["name"] ?? i), onClick: (e: MouseEvent) => { if ((e.target as Element).closest("a,button,input,select,textarea,label")) return; onRow(r); }, onKeyDown: (e: KeyboardEvent) => { if (e.key === "Enter" && e.target === e.currentTarget) onRow(r); } } : {})}
              {...(activeKey && rowKey && rowKey(r, i) === activeKey ? { "aria-current": "true" as const } : {})}>
              {cols.map((c) => <td key={c.key} className={`whitespace-nowrap ${pad} py-2 ${isNum(c.kind) || c.align === "end" ? "text-end tabular-nums" : ""}`}>{cell(c, r)}</td>)}
            </tr>
            {expand?.open(r) && <tr className="border-b border-border/70 bg-muted/30" data-row-expanded={rowKey ? rowKey(r, i) : String(r["name"] ?? i)}><td colSpan={cols.length} className={`${pad} py-2`}>{expand.render(r)}</td></tr>}
          </Fragment>))}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/50 font-semibold">
              {cols.map((c, i) => <td key={c.key} className={`${pad} py-2 ${isNum(c.kind) ? "text-end tabular-nums" : ""}`} data-no-i18n={c.total ? true : undefined}>{c.total ? amount(rows.reduce((s, r) => s + Number(val(c, r) ?? 0), 0)) : i === 0 ? t("Total", "الإجمالي") : ""}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
      {rows.length > limit && <div className="pt-2 text-center"><button type="button" className={BTN.compact} onClick={() => setLimit(limit + pageSize)}>{t(`Show more (${rows.length - limit} remaining)`, `عرض المزيد (${rows.length - limit} متبقية)`)}</button></div>}
    </div>
  );
}

// ---------------------------------------------------------------- charts (relational, clickable)
export function Bars({ data, empty, format = (n) => compact(n, false) }: { data: { label: string; value: number; to?: string | undefined; tone?: Tone | undefined; hint?: string | undefined }[]; empty: ReactNode; format?: (n: number) => string }) {
  if (!data.length || data.every((d) => !d.value)) return <Empty>{empty}</Empty>;
  const max = Math.max(...data.map((d) => Math.abs(d.value))) || 1;
  return (
    <ul className="space-y-1.5" role="list" data-chart="bars">
      {data.map((d) => {
        const bar = (
          <div className="flex items-center gap-2 text-sm">
            <span className="w-40 shrink-0 truncate" data-no-i18n title={d.hint ?? d.label}>{d.label}</span>
            <span className="relative h-4 flex-1 overflow-hidden rounded bg-muted" aria-hidden>
              <span className={`absolute inset-y-0 start-0 rounded ${d.tone === "bad" ? "bg-destructive/70" : d.tone === "warn" ? "bg-warning/80" : d.tone === "good" ? "bg-success/70" : "bg-primary/70"}`} style={{ width: `${Math.max(2, (Math.abs(d.value) / max) * 100)}%` }} />
            </span>
            <span className="w-24 shrink-0 text-end tabular-nums" data-no-i18n>{format(d.value)}</span>
          </div>
        );
        return <li key={d.label}>{d.to !== undefined ? <AppLink to={d.to} className="block rounded hover:bg-muted/50">{bar}</AppLink> : bar}</li>;
      })}
    </ul>
  );
}
/** Stacked measure comparison (contract vs certified vs invoiced vs collected) — the measures stay separate, never summed. */
/** Measure bars. A measure with `to` (app page/report) or `list` (filtered native list) opens the exact source records behind its value. */
export function Measures({ items }: { items: { label: string; value: number | null; tone?: Tone | undefined; to?: string | undefined; list?: { doctype: string; filters?: [string, string, unknown][] } | undefined }[] }) {
  const { ar, t } = useCx();
  const max = Math.max(...items.map((i) => Math.abs(i.value ?? 0))) || 1;
  return (
    <dl className="space-y-1.5" data-chart="measures">
      {items.map((i) => (
        <div key={i.label} className="grid grid-cols-[minmax(0,9rem)_minmax(2.5rem,1fr)_minmax(3.5rem,auto)] items-center gap-2 text-sm">
          <dt className="truncate text-muted-foreground" title={i.label}>{i.label}</dt>
          <dd className="relative h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden><span className={`absolute inset-y-0 start-0 rounded-full ${i.tone === "bad" ? "bg-destructive/70" : i.tone === "warn" ? "bg-warning/80" : i.tone === "good" ? "bg-success/70" : "bg-primary/70"}`} style={{ width: `${i.value ? Math.max(1, (Math.abs(i.value) / max) * 100) : 0}%` }} /></dd>
          <dd className="text-end tabular-nums" data-no-i18n>{i.value === null
            ? <span title={t("Not available: no source record yet", "غير متاح: لا يوجد مستند مصدر بعد")} aria-label={t("Not available", "غير متاح")}>—</span>
            : i.to !== undefined ? <AppLink to={i.to} className={`text-primary underline-offset-2 hover:underline ${FOCUS}`} title={t(`Open the records behind ${i.label}`, `فتح المستندات خلف ${i.label}`)}><span data-drill="measure">{compact(i.value, ar)}</span></AppLink>
            : i.list ? <ListRef doctype={i.list.doctype} filters={i.list.filters} className={`text-primary underline-offset-2 hover:underline ${FOCUS}`}><span data-drill="measure">{compact(i.value, ar)}</span></ListRef>
            : compact(i.value, ar)}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Progress({ value, tone }: { value: number; tone?: Tone | undefined }) {
  const v = Math.max(0, Math.min(100, value));
  return <span className="inline-flex items-center gap-1.5"><span className="relative inline-block h-1.5 w-16 overflow-hidden rounded bg-muted" aria-hidden><span className={`absolute inset-y-0 start-0 ${tone === "bad" ? "bg-destructive" : tone === "warn" ? "bg-warning" : "bg-primary"}`} style={{ width: `${v}%` }} /></span><span className="tabular-nums text-xs" data-no-i18n>{fmtNumber(v, 0)}%</span></span>;
}

// ---------------------------------------------------------------- actions
export const hasRole = (...roles: string[]) => { const u = currentUser(); if (u === ADMIN) return true; const r = userRoles(u); return r.includes("System Manager") || roles.some((x) => r.includes(x)); };
/** Runs a domain service; success opens the created record, failure shows every validation message (nothing is half-applied). */
export function ActionButton({ label, run, disabled, reason, onDone, primary, open = true }: { label: string; run: () => Result; disabled?: boolean; reason?: string; onDone?: (r: Result) => void; primary?: boolean; open?: boolean }) {
  const { t } = useCx();
  const route = useDocRoute();
  const [busy, setBusy] = useState(false);
  const go = () => {
    if (busy) return; setBusy(true);
    try {
      const r = run();
      if (!r.ok) { notifyError(t("Action not completed", "لم يكتمل الإجراء"), { description: r.errors.join("\n") }); return; }
      const where = r.doctype && r.name ? route(r.doctype) : undefined;
      notifySaved(r.existing ? t(`Already exists: ${r.name}`, `موجود مسبقاً: ${r.name}`) : t(`Created ${r.name}`, `تم إنشاء ${r.name}`), where && open ? { action: { label: t("Open", "فتح"), onClick: () => { window.location.assign(`/app/${where.app}/${where.slug}/${encodeURIComponent(r.name!)}?app=${APP}`); } } } : undefined);
      onDone?.(r);
    } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={go} disabled={disabled || busy} aria-busy={busy} title={disabled ? reason : undefined}
      className={primary ? BTN.primary : BTN.secondary}>
      {busy ? t("Working…", "جارٍ التنفيذ…") : label}
    </button>
  );
}
/**
 * Policy gate notice: one amber line naming how many final actions wait on owner decisions; the disclosure lists each
 * blocked action (always in the DOM) and links to the decision record. Gates stay enforced by the services, not here.
 */
export function PolicyGate({ keys }: { keys: string[] }) {
  const { t, ar } = useCx();
  const open = keys.filter((k) => !policyDefined(k));
  if (!open.length) return null;
  return (
    <details className="group mb-4 rounded-lg border border-dx-warn/35 bg-dx-warn-soft text-sm" role="note" data-policy-gate={open.join(",")}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-dx-warn px-1.5 text-[11px] font-semibold text-dx-on-band" data-no-i18n>{open.length}</span>
        <span className="font-medium text-foreground">{t("Final actions waiting on owner policy decisions", "إجراءات نهائية بانتظار قرارات سياسات المالك")}</span>
        <span className="text-xs text-muted-foreground" data-no-i18n>{open.join(" · ")}</span>
        <span className="ms-auto text-xs font-medium text-dx-warn"><span className="group-open:hidden">{t("Show details", "عرض التفاصيل")}</span><span className="hidden group-open:inline">{t("Hide details", "إخفاء التفاصيل")}</span></span>
      </summary>
      <div className="border-t border-dx-warn/25 px-3.5 pb-3 pt-2">
        <ul className="list-disc ps-5 text-[13px]">
          {open.map((k) => <li key={k}><span className="font-mono" data-no-i18n>{k}</span> — {ar ? POLICY_TITLES[k]?.[1] : POLICY_TITLES[k]?.[0]}: {t("blocks", "يوقف")} «{ar ? POLICY_AFFECTS[k]?.[1] : POLICY_AFFECTS[k]?.[0]}»</li>)}
        </ul>
        <AppLink to="settings/policies" className="mt-1.5 inline-block text-[13px] font-medium text-primary hover:underline">{t("Record the decisions", "تسجيل القرارات")}</AppLink>
      </div>
    </details>
  );
}
export function Filters({ children }: { children: ReactNode }) { return <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm" role="search" data-filter-bar>{children}</div>; }
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-muted-foreground">{label}{children}</label>; }
export const inputCls = `min-h-9 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm text-foreground transition-colors hover:border-primary/40 max-md:min-h-11 disabled:bg-muted disabled:text-muted-foreground ${FOCUS}`;
export const docTitle = (d: Doc | undefined, f = "title") => String(d?.[f] ?? d?.name ?? "");
