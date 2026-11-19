import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useHydrated } from "@tanstack/react-router";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { scopedList } from "@/plugins/digit_hr/compat/scope";
import { useLang } from "@/i18n";
import { DashboardDesigner } from "@/components/dashboards/DashboardDesigner";
import { defaultStore, LAYOUT_V, type DesignerLayout } from "@/lib/dashboards/layout";
import { registerDashboard, type DashboardDef, type WidgetData, type WidgetDef } from "@/lib/dashboards/registry";
import { WORKSPACES, rows, drillFilters, type Widget, type Scope, type BarWidget, type QueueWidget, type WorkspaceDef } from "./registry";
import { legacyLayouts, type Layout } from "./layout";
import { HR_DOC_SEARCH, hrSearch } from "@/plugins/digit_hr/product/urls";

/** Bar tones are the shared Enterprise status tokens (ONE STANDARD R7), so day and night mode keep their contrast. */
const TONE: Record<string, string> = { ok: "var(--dx-good)", warn: "var(--dx-warn)", bad: "var(--dx-bad)", info: "var(--dx-info-ink)" };
const PERIODS = [0, 30, 90, 365];
const scopeKey = (ws: string) => `digit-ws:scope:${ws}`;
const HR_APP = "digit_hr";

/** Context handed to every HR widget by the shared designer: the composer's filters and display helpers. */
interface HrDashCtx { scope: Scope; tx: (a: string, e: string) => string; lang: string; onDrill?: (() => void) | undefined; display?: ((value: string) => string) | undefined; blocks?: Partial<Record<PageBlockId, ReactNode>> | undefined }

/**
 * The section page's own registers (documents, native reports) are blocks of the same designer (ONE STANDARD R9, owner
 * 2026-11-13): one dashboard per page with a block menu on every block; they render exactly what the page showed before.
 */
export type PageBlockId = "documents" | "reports";
const PAGE_BLOCKS: { id: PageBlockId; title: [string, string] }[] = [{ id: "documents", title: ["Section documents", "مستندات القسم"] }, { id: "reports", title: ["Native reports", "التقارير الأصلية"] }];

/**
 * HR workspace dashboards on the shared Universal Dashboard Designer (DIGIT-CORE-PRO-UX-006 §9, the non-Pro consumer).
 * HR keeps its widget registry (definitions, filters, drills) and its widget visuals as the default renderers; the
 * Core designer owns layout, sizes, view switching, templates and persistence.
 */
const DEFS = new Map<string, DashboardDef<HrDashCtx>>();
function hrDashboard(def: WorkspaceDef): DashboardDef<HrDashCtx> {
  const hit = DEFS.get(def.id); if (hit) return hit;
  const inDefault = new Set(def.defaultOrder);
  const ordered = [...def.defaultOrder.map((id) => def.widgets.find((w) => w.id === id)).filter((w): w is Widget => !!w), ...def.widgets.filter((w) => !inDefault.has(w.id))];
  const widgets: WidgetDef<HrDashCtx>[] = ordered.map((w) => ({
    id: w.id, version: 1, title: [w.title.en, w.title.ar], meaning: [w.def.en, w.def.ar], sources: [w.doctype],
    shape: w.kind === "kpi" ? "number" : w.kind === "bar" ? "category" : w.dateField ? "dated-rows" : "rows",
    defaultView: w.kind === "kpi" ? "kpi" : w.kind === "bar" ? "bar" : "queue",
    size: { w: w.size }, inDefault: inDefault.has(w.id),
    readable: () => { try { scopedList(w.doctype); return true; } catch { return false; } },
    renderDefault: (c) => <div className="dhr-card relative flex h-full flex-col rounded-[18px] p-4" data-widget={w.id} data-widget-kind={w.kind}><WidgetBody w={w} scope={c.scope} tx={c.tx} lang={c.lang} onDrill={c.onDrill} display={c.display} /></div>,
    data: (c) => hrData(w, c),
  }));
  for (const b of PAGE_BLOCKS) widgets.push({ id: `page:${b.id}`, version: 1, title: b.title, meaning: b.title, sources: [], shape: "panel", defaultView: "panel", size: { w: 12 },
    absent: (c) => !c.blocks?.[b.id], render: (c) => <div className="min-w-0" data-page-block={b.id} data-chart={b.id === "documents" ? "doc-cards" : "report-links"}>{c.blocks?.[b.id] ?? null}</div> });
  const d = registerDashboard<HrDashCtx>({ app: HR_APP, id: def.id, title: [def.id, def.id], widgets, managerRoles: ["HR Manager"] });
  DEFS.set(def.id, d);
  return d;
}

function hrData(w: Widget, c: HrDashCtx): WidgetData {
  const data = rows(w, c.scope);
  const listDrill = (extra: [string, string, unknown][] = []) => ({ app: w.app, slug: w.slug, filters: drillFilters(w, c.scope, extra) });
  if (data === null) return { kind: w.kind === "kpi" ? "number" : w.kind === "bar" ? "series" : "rows", status: "denied", value: 0, points: [], columns: [], rows: [] } as WidgetData;
  if (w.kind === "kpi") return { kind: "number", status: "ok", value: data.length, drill: listDrill() };
  if (w.kind === "bar") return { kind: "series", status: data.length ? "ok" : "empty", points: w.groups.map((g) => ({ key: g.value, label: c.tx(g.label.ar, g.label.en), value: data.filter((d) => d[w.groupBy] === g.value).length, tone: g.tone, drill: listDrill([[w.groupBy, "=", g.value]]) })), valueLabel: ["Records", "السجلات"] };
  const q = w as QueueWidget;
  const show = (v: unknown) => { const t = String(v ?? ""); return c.display && t ? c.display(t) : t; };
  const sorted = [...data].sort((a, b) => String(a[q.subField ?? "name"] ?? "").localeCompare(String(b[q.subField ?? "name"] ?? ""))).slice(0, 12);
  return {
    kind: "rows", status: sorted.length ? "ok" : "empty", total: data.length, drill: listDrill(), reason: ["Nothing waiting for action.", "لا توجد عناصر بانتظار الإجراء."],
    columns: [{ key: "title", label: ["Record", "السجل"], data: true }, { key: "sub", label: ["Detail", "التفصيل"], data: true }],
    rows: sorted.map((d) => ({ id: String(d["name"]), date: q.dateField ? String(d[q.dateField] ?? "").slice(0, 10) || undefined : undefined, drill: { app: w.app, slug: w.slug, name: String(d["name"]) }, cells: { title: show(d[q.titleField] ?? d["name"]), sub: show(d[q.subField ?? ""]) || null } })),
  };
}

/** HR drills: a native list with the widget's filters, or one native record. */
function hrLink(onDrill?: () => void) {
  return (drill: unknown, children: ReactNode, attrs?: Record<string, string>) => {
    const d = drill as { app: string; slug: string; filters?: unknown; name?: string };
    if (d.name) return <Link to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: d.app, doctype: d.slug, name: d.name }} onClick={onDrill} className="hover:underline" {...(attrs ?? {})}>{children}</Link>;
    return <Link to="/app/$app/$doctype" params={{ app: d.app, doctype: d.slug }} search={hrSearch({ filters: JSON.stringify(d.filters ?? []) }) as never} onClick={onDrill} className="hover:underline" {...(attrs ?? {})}>{children}</Link>;
  };
}

/** One-time import of layouts saved by the earlier HR composer into the shared designer (nothing is lost; legacy keys stay for rollback). */
function importLegacy(def: WorkspaceDef, dash: DashboardDef<HrDashCtx>, user: string) {
  const conv = (l: Layout): DesignerLayout => ({ v: LAYOUT_V, items: l.order.filter((id) => def.widgets.some((w) => w.id === id)).map((id) => ({ id, w: l.sizes[id] ?? def.widgets.find((w) => w.id === id)!.size })), seen: dash.widgets.map((w) => w.id), widgetVersions: Object.fromEntries(dash.widgets.map((w) => [w.id, w.version])) });
  const legacy = legacyLayouts(def.id, user);
  if (legacy.personal && !defaultStore.getPersonal(HR_APP, def.id, user)) defaultStore.setPersonal(HR_APP, def.id, user, conv(legacy.personal));
  if (legacy.published && !defaultStore.templates(HR_APP, def.id).some((t) => t.scope === "Global")) defaultStore.saveTemplate({ app: HR_APP, dashboard: def.id, scope: "Global", layout: conv(legacy.published), modified: new Date().toISOString(), modified_by: "legacy-import" });
}

/** Reusable workspace composer: HR header filters + the shared Dashboard Designer (customize, save, templates). */
/** `display` (optional, display-only) lets a host app label stored record values for the active language; stored values are unchanged. */
export function WorkspaceComposer({ wsId, onDrill, display, blocks }: { wsId: string; onDrill?: (() => void) | undefined; display?: ((value: string) => string) | undefined; blocks?: Partial<Record<PageBlockId, ReactNode>> | undefined }) {
  const def = WORKSPACES[wsId];
  const hydrated = useHydrated();
  const lang = useLang(); const tx = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const user = useSessionUser(); useStoreVersion();
  const dash = useMemo(() => (def ? hrDashboard(def) : null), [def]);
  const [scope, setScope] = useState<Scope>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!hydrated || !def || !dash) return;
    importLegacy(def, dash, user);
    try { const s = sessionStorage.getItem(scopeKey(wsId)); setScope(s ? JSON.parse(s) : legacyLayouts(def.id, user).personal?.scope ?? {}); } catch { setScope({}); }
    setReady(true);
  }, [hydrated, wsId, def, dash, user]);
  const setSc = (s: Scope) => { setScope(s); sessionStorage.setItem(scopeKey(wsId), JSON.stringify(s)); };
  if (!def || !dash) return null;
  if (!hydrated || !ready) return <div role="status" className="dhr-card mb-5 rounded-[18px] p-6 text-sm">{tx("جارٍ تحميل مساحة العمل…", "Loading workspace…")}</div>;
  const companies = (() => { try { return scopedList("Company").map((c) => c.name); } catch { return []; } })();

  return (
    <section aria-label={tx("مساحة العمل", "Workspace")} data-ws={wsId} className="mb-6">
      <div className="dhr-card mb-4 flex flex-wrap items-center gap-3 rounded-[18px] p-3">
        <label className="flex items-center gap-2 text-sm">{tx("الشركة", "Company")}
          <select data-ws-company value={scope.company ?? ""} onChange={(e) => setSc({ ...scope, company: e.target.value || undefined })} className="min-h-11 rounded-md border border-[var(--dhr-border)] bg-transparent px-2">
            <option value="">{tx("كل الشركات المصرّح بها", "All authorised companies")}</option>
            {companies.map((c) => <option key={c} value={c} data-no-i18n>{c}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">{tx("الفترة", "Period")}
          <select data-ws-period value={scope.days ?? 0} onChange={(e) => setSc({ ...scope, days: Number(e.target.value) || undefined })} className="min-h-11 rounded-md border border-[var(--dhr-border)] bg-transparent px-2">
            {PERIODS.map((p) => <option key={p} value={p}>{p === 0 ? tx("كل الفترات", "All time") : tx(`آخر ${p} يوماً`, `Last ${p} days`)}</option>)}
          </select>
        </label>
      </div>
      <DashboardDesigner def={dash} ctx={{ scope, tx, lang, onDrill, display, blocks }} link={hrLink(onDrill)} frameClassName="dhr-card rounded-[18px]" />
      <p className="mt-2 text-xs opacity-60">{tx("التخطيط محفوظ في هذا المتصفح لكل مستخدم فقط، ولا ينتقل بين الأجهزة.", "Layouts are saved per user in this browser only; they do not sync across devices.")}</p>
    </section>
  );
}

function ListLink({ w, scope, extra = [], onDrill, children, className, label }: { w: Widget; scope: Scope; extra?: import("@/lib/desk").Filter[]; onDrill?: (() => void) | undefined; children: React.ReactNode; className?: string; label?: string }) {
  return <Link to="/app/$app/$doctype" params={{ app: w.app, doctype: w.slug }} search={hrSearch({ filters: JSON.stringify(drillFilters(w, scope, extra)) }) as never} onClick={onDrill} aria-label={label} className={className}>{children}</Link>;
}

function WidgetBody({ w, scope, tx, lang, onDrill, display }: { w: Widget; scope: Scope; tx: (a: string, e: string) => string; lang: string; onDrill?: (() => void) | undefined; display?: ((value: string) => string) | undefined }) {
  const data = rows(w, scope);
  const head = <><h3 className="text-sm font-semibold">{tx(w.title.ar, w.title.en)}</h3><p className="mt-0.5 text-xs opacity-70">{tx(w.def.ar, w.def.en)}</p></>;
  if (data === null) return <>{head}<p className="mt-3 text-sm" data-ws-state="denied">{tx("غير متاح — لا تملك صلاحية قراءة المصدر.", "Unavailable — you cannot read this source.")}</p></>;
  if (w.kind === "kpi") return (
    <ListLink w={w} scope={scope} onDrill={onDrill} className="flex h-full min-h-[112px] flex-col rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--dhr-emerald)]" label={`${tx(w.title.ar, w.title.en)}: ${data.length}`}>
      {head}<span className="mt-auto pt-2 text-3xl font-bold tabular-nums" data-kpi-value data-no-i18n>{data.length}</span>
    </ListLink>
  );
  if (w.kind === "bar") return <Bars w={w} data={data} scope={scope} tx={tx} lang={lang} head={head} onDrill={onDrill} />;
  return <Queue w={w} data={data} scope={scope} tx={tx} head={head} onDrill={onDrill} display={display} />;
}

function Bars({ w, data, scope, tx, head, onDrill }: { w: BarWidget; data: Record<string, unknown>[]; scope: Scope; tx: (a: string, e: string) => string; lang: string; head: React.ReactNode; onDrill?: (() => void) | undefined }) {
  const counts = w.groups.map((g) => ({ g, n: data.filter((d) => d[w.groupBy] === g.value).length }));
  const max = Math.max(1, ...counts.map((c) => c.n));
  return (
    <>
      {head}
      {data.length === 0 ? <p className="mt-4 text-sm" data-ws-state="empty">{tx("لا توجد سجلات ضمن الفلاتر الحالية.", "No records match the current filters.")}</p> : (
        <ul className="mt-3 space-y-2" aria-label={tx(w.title.ar, w.title.en)}>
          {counts.map(({ g, n }) => (
            <li key={g.value}>
              <ListLink w={w} scope={scope} extra={[[w.groupBy, "=", g.value]]} onDrill={onDrill} label={`${tx(g.label.ar, g.label.en)}: ${n}`} className="group grid min-h-11 grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2 rounded-md px-1 hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--dhr-emerald)]">
                <span className="truncate text-sm">{tx(g.label.ar, g.label.en)}</span>
                <span className="h-5 rounded bg-black/5"><span data-bar={g.value} className="block h-5 rounded" style={{ width: `${(n / max) * 100}%`, background: TONE[g.tone ?? ""] ?? "var(--muted-foreground)" }} /></span>
                <span className="text-end text-sm tabular-nums" data-no-i18n>{n}</span>
              </ListLink>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Queue({ w, data, scope, tx, head, onDrill, display }: { w: QueueWidget; data: Record<string, unknown>[]; scope: Scope; tx: (a: string, e: string) => string; head: React.ReactNode; onDrill?: (() => void) | undefined; display?: ((value: string) => string) | undefined }) {
  const show = (v: unknown) => { const t = String(v ?? ""); return display && t ? display(t) : t; };
  const sorted = [...data].sort((a, b) => String(a[w.subField ?? "name"] ?? "").localeCompare(String(b[w.subField ?? "name"] ?? ""))).slice(0, 6);
  return (
    <>
      {head}
      {sorted.length === 0 ? <p className="mt-4 text-sm" data-ws-state="empty">{tx("لا توجد عناصر بانتظار الإجراء.", "Nothing waiting for action.")}</p> : (
        <ul className="mt-3 divide-y divide-[var(--dhr-border)]">
          {sorted.map((d) => (
            <li key={String(d["name"])}>
              <Link to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: w.app, doctype: w.slug, name: String(d["name"]) }} onClick={onDrill} className="flex min-h-11 items-center justify-between gap-2 px-1 text-sm hover:bg-black/5">
                <span className="truncate" data-no-i18n>{show(d[w.titleField] ?? d["name"])}</span>
                <span className="text-xs opacity-70" data-no-i18n>{show(d[w.subField ?? ""])}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ListLink w={w} scope={scope} onDrill={onDrill} className="mt-auto pt-3 text-sm text-[var(--dhr-emerald)] hover:underline">{tx(`عرض الكل (${data.length})`, `View all (${data.length})`)}</ListLink>
    </>
  );
}
