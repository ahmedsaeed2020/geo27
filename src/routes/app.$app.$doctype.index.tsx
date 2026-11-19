import { filterReadable, hasPerm, userRoles, useSessionUser } from "@/lib/session";
import { BandWatermark } from "@/components/enterprise/BandMark";
import { Open360 } from "@/components/enterprise/Open360";
import { PROFILES_360 } from "@/lib/coreShared/profile360";
import { hasMasterName, masterName } from "@/lib/coreShared/masterName";
import { formatValue, NUMERIC } from "@/lib/format";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Shell, Loading } from "@/components/Shell";
import { DocTypeNotFound } from "@/components/DocTypeNotFound";
import { LAYOUT_TYPES, TABLE_TYPES, cachedMeta, ensureMetas, metaQuery, slugOf } from "@/lib/catalog";
import { childParents, reverseLinksQuery } from "@/lib/relations";
import { childRows } from "@/lib/childRows";
import { useScopeMetas } from "@/lib/scope";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { matchFilter, type Filter } from "@/lib/desk";
import { cellMatches, parseCellFilter } from "@/lib/reportWorkbench";
import { EntGlyph } from "@/components/enterprise/DigitIcon";
import { listBehaviorsQuery, treeViewsQuery, indicatorFor, COLOR_CLASS } from "@/lib/engines";
import { calendarEvents, calendarFields, calendarViewsQuery } from "@/lib/calendarViews";
import { CalendarView, GanttView } from "@/components/list/TimeViews";
import { DeskKanban } from "@/components/list/DeskKanban";
import { defaultLayouts, savedLayouts, saveLayouts, type ListLayout } from "@/lib/listLayouts";
import { deleteView, viewsFor, type SharedView } from "@/lib/sharedViews";
import { SaveShareDialog, shareLabel } from "@/components/enterprise/SaveShareView";
import { ListSidebar } from "@/components/list/ListSidebar";
import { ImportModal } from "@/components/list/ImportModal";
import { MarkAttendanceButton } from "@/components/list/MarkAttendance";
import { DocTypeSettings } from "@/components/list/DocTypeSettings";
import { useHydrated } from "@/components/hrms/HrShell";
import { useSettings } from "@/lib/userSettings";
import { relTime } from "@/lib/relTime";
import { translateTo, useLang } from "@/i18n";
import { createDraft } from "@/lib/documentApi";
import { classifyDocument, runtimeContractQuery } from "@/lib/runtimeContract";
import { leadCrumbs } from "@/components/desk/AppCrumb";
import { BulkActions, type BulkColumn } from "@/components/list/BulkActions";
import { listMenuItems, SITE_DEVELOPER_MODE } from "@/lib/listActions";
import { useEnterprise } from "@/plugins/enterprise";
import { enabledPlugins } from "@/plugins/runtime";
import { ListKpis } from "@/components/list/ListKpis";
import { OverdueTag, StatusStrip } from "@/components/enterprise/StatusStrip";
import { peekRow } from "@/components/enterprise/QuickView";
import { INTERACTIVE as ROW_INTERACTIVE } from "@/components/enterprise/rowLink";
import { inStripTab, overdueDays, stripTabs } from "@/lib/statusStrip";
import { t as tr } from "@/i18n";

type Search = { filters?: string | undefined; layout?: string | undefined; view?: string | undefined; app?: string | undefined; /** status strip tab (Round 1 §6) */ st?: string | undefined };
export const Route = createFileRoute("/app/$app/$doctype/")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const o: Search = {};
    for (const k of ["filters", "layout", "view", "app", "st"] as const) if (typeof s[k] === "string") o[k] = s[k] as string;
    return o;
  },
  head: ({ params }) => {
    const t = params.doctype.replace(/_/g, " ");
    return { meta: [
      { title: `${t} list — Digit Desk` },
      { name: "description", content: `Synthetic ${t} records rendered from source metadata.` },
      { property: "og:title", content: `${t} list — Digit Desk` },
      { property: "og:description", content: `Synthetic ${t} records rendered from source metadata.` },
    ] };
  },
  component: ListView,
});

const OPS = ["=", "!=", "like", ">", "<", ">=", "<=", "is"];
const PAGE_SIZES = [20, 100, 500, 2500]; // spec §0 footer page sizes

/** Generated List View (frappe list_view.js) + spec §0/§3: layout switcher, "…" menu, sidebar, resizable/reorderable columns. */
function ListView() {
  const { app, doctype } = Route.useParams();
  const search = Route.useSearch();
  // a row opens inside the app the list was opened from (its address map keeps the app's own address, lib/appUrls.ts)
  const rowSearch = search.app ? { app: search.app } : {};
  const { data: meta, error } = useQuery(metaQuery(app, doctype));
  const nav = useNavigate({ from: "/app/$app/$doctype/" });
  const { data: lbs } = useQuery(listBehaviorsQuery);
  const rcQ = useQuery(runtimeContractQuery);
  const { data: trees } = useQuery(treeViewsQuery);
  // a child table lists its rows across the parents that hold it (src/lib/childRows.ts), each row opening its parent
  const { data: rev } = useQuery(reverseLinksQuery);
  const childOf = meta?.istable ? childParents(meta.name, rev?.doctypes) : [];
  const parentMetaV = useScopeMetas(childOf);
  const { data: catalogCals } = useQuery(calendarViewsQuery);
  // enabled apps add calendar views for their own dated DocTypes; the frozen catalog configs are never overridden
  const cals = useMemo(() => (catalogCals ? { ...Object.assign({}, ...enabledPlugins().map((p) => p.calendar_views ?? {})), ...catalogCals } : catalogCals), [catalogCals]);
  // a calendar field_map on a child table (Holiday List, Timesheet) needs the child DocType definitions first
  const [, setCalTick] = useState(0);
  useEffect(() => {
    if (!meta || !cals?.[meta.name]) return;
    const tbl = meta.fields.filter((f) => f.fieldtype === "Table" && f.options).map((f) => f.options!);
    if (tbl.length) void ensureMetas(tbl).then(() => setCalTick((n) => n + 1));
  }, [meta?.name, !!cals]); // eslint-disable-line react-hooks/exhaustive-deps
  const us = useSettings();
  const lang = useLang();
  const hyd = useHydrated();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Filter[]>(() => { try { return search.filters ? JSON.parse(search.filters) : []; } catch { return []; } });
  const [sort, setSort] = useState<{ f: string; dir: "asc" | "desc" }>({ f: "modified", dir: "desc" });
  const [pageLen, setPageLen] = useState(20);
  const [shown, setShown] = useState(20);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [cols, setCols] = useState<string[] | null>(null);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [panel, setPanel] = useState<null | "filters" | "cols" | "menu" | "layouts" | "create" | "manage">(null);
  // phones: the list sidebar is collapsed behind a toggle (frappe list view sidebar-toggle on small screens)
  const [sideOpen, setSideOpen] = useState(false);
  const [modal, setModal] = useState<null | "import" | { settings: string }>(null);
  const [saved, setSaved] = useState<ListLayout[]>([]);
  const [nf, setNf] = useState<Filter>(["", "=", ""]);
  const [newName, setNewName] = useState("");
  const [shared, setShared] = useState(false);
  // owner decision 2: a filter box under every column header, as the native report view (frappe-datatable inline filters)
  const [colF, setColF] = useState<Record<string, string>>({});
  const drag = useRef<string | null>(null);
  useStoreVersion(); const user = useSessionUser(); const ent = useEnterprise();
  // permission checks for menu gates (frappe.model.can_create("Custom Field") …) need these metas loaded
  const [, setMetaTick] = useState(0);
  useEffect(() => { void ensureMetas(["Custom Field", "Property Setter", "DocType"]).then(() => setMetaTick((n) => n + 1)); }, []);
  useEffect(() => { if (meta) adapter.ensureSeed(meta); }, [meta]);
  useEffect(() => { if (meta?.issingle) nav({ to: "/app/$app/$doctype/$name", params: { app, doctype, name: meta.name }, replace: true }); }, [meta, app, doctype, nav]);
  useEffect(() => { if (meta) setSaved(savedLayouts(meta.name)); }, [meta]);

  const lb = meta ? lbs?.[meta.name] : undefined;
  // phase 4 C4-09: views saved and shared through the Enterprise two-step dialog appear as layouts (id sv-<view>)
  const [shareDlg, setShareDlg] = useState<{ editing?: SharedView } | null>(null);
  const sharedViews = meta ? viewsFor(meta.name, "list", user) : [];
  const svKey = sharedViews.map((v) => `${v.id}:${v.title}:${v.share}`).join("|");
  const sharedLayouts = useMemo(() => sharedViews.map((v) => ({ ...(v.payload as Omit<ListLayout, "id" | "name">), id: `sv-${v.id}`, name: v.title, shared: v.share !== "private" }) as ListLayout), [svKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const layouts = useMemo(() => (meta ? [...defaultLayouts(meta, lb), ...saved, ...sharedLayouts] : []), [meta, lb, saved, sharedLayouts]);
  const active = layouts.find((l) => l.id === (search.layout ?? "default")) ?? layouts[0];
  // apply a layout when the URL layout changes (URL is the source of truth for the active layout)
  useEffect(() => {
    if (!active) return;
    setFilters(search.filters && !search.layout ? JSON.parse(search.filters) : active.filters);
    setSort(active.sort); setCols(active.columns); setWidths(active.widths); setPageLen(active.pageLen); setShown(active.pageLen);
  }, [active?.id]); // eslint-disable-line

  const dataFields = useMemo(() => (meta?.fields ?? []).filter((f) => f.fieldname && !LAYOUT_TYPES.has(f.fieldtype) && !TABLE_TYPES.has(f.fieldtype)), [meta]);
  if (error) return <Shell><DocTypeNotFound slug={doctype} error={error} /></Shell>;
  if (!meta || meta.issingle) return <Shell><Loading what="DocType" /></Shell>;

  let defCols = dataFields.filter((f) => f.in_list_view);
  if (!defCols.length) defCols = dataFields.filter((f) => !f.hidden).slice(0, 4);
  const colNames = cols ?? defCols.map((c) => c.fieldname!);
  const shownCols = colNames.map((n) => dataFields.find((f) => f.fieldname === n)!).filter(Boolean);
  // unsaved local drafts (+ Add not yet saved) are not records yet, as in frappe.get_list
  void parentMetaV;
  const base = !hyd ? [] : meta.istable && childOf.length ? childRows(meta.name, childOf) : filterReadable(meta, adapter.list(meta.name)).filter((r) => !r["__islocal"]);
  // source in_create/read_only/is_virtual flags hide Add (frappe list view); until the runtime contract loads Add stays visible but disabled
  const capPending = !rcQ.data && !meta.source.startsWith("plugin:");
  const canCreate = capPending || classifyDocument(meta, rcQ.data?.lifecycle[meta.name]).create;
  const status = (r: Doc) => (meta.is_submittable ? ["Draft", "Submitted", "Cancelled"][r.docstatus ?? 0] : r["status"] ? String(r["status"]) : null);
  const pre = base
    .filter((r) => filters.every((f) => matchFilter(r, f)))
    .filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()))
    .filter((r) => Object.entries(colF).every(([fn, raw]) => {
      const p = parseCellFilter(raw); if (!p) return true;
      if (fn === "__status") { const ind = indicatorFor(meta, lb, r); return cellMatches(ind?.label ?? status(r) ?? "", "Data", p); }
      const fld = fn === "name" ? undefined : dataFields.find((f) => f.fieldname === fn);
      return cellMatches(r[fn], fld?.fieldtype ?? "Data", p, fld ? formatValue(fld.fieldtype, r[fn], { options: fld.options, doc: r }) : undefined);
    }))
    ;
  // status strip (Round 1 §6): the tabs count the rows of every other filter; the picked tab filters with the same rule
  const strip = ent.on && !meta.istable ? stripTabs(meta, pre) : [];
  const all = pre.filter((r) => !ent.on || inStripTab(meta, r, search.st))
    .sort((a, b) => { const x = String(a[sort.f] ?? ""), y = String(b[sort.f] ?? ""); const c = isNaN(Number(x)) || isNaN(Number(y)) ? x.localeCompare(y) : Number(x) - Number(y); return sort.dir === "asc" ? c : -c; });
  const rows = all.slice(0, shown);
  const calF = calendarFields(meta, cals?.[meta.name], cachedMeta);
  const profiled = PROFILES_360.some((p) => p.doctype === meta.name);
  const titleOf = (d: Doc) => { const tf = (meta as { title_field?: string }).title_field; return String((tf && d[tf]) || d.name); };
  const toneOf = (d: Doc) => indicatorFor(meta, lb, d)?.color;
  // a free-text status (Data field, e.g. a scorecard standing name) is record content; only Select options are translated
  const statusOptions = meta?.fields.some((f) => f.fieldname === "status" && f.fieldtype === "Select") ?? false;
  const calEvents = calF && (search.view === "calendar" || search.view === "gantt") ? calendarEvents(all, calF, titleOf) : [];
  const standardFilters = dataFields.filter((f) => f.in_standard_filter).slice(0, 4);
  const comments = (r: Doc) => adapter.list("Comment").filter((c) => c["reference_doctype"] === meta.name && c["reference_name"] === r.name).length;
  const liked = (r: Doc) => String(r["_liked_by"] ?? "").includes("Administrator");
  const sortLabel = sort.f === "modified" ? "Last Updated On" : sort.f === "name" ? "ID" : dataFields.find((f) => f.fieldname === sort.f)?.label ?? sort.f;
  const setLayout = (id: string) => { setPanel(null); void nav({ search: (s: Search) => ({ ...s, layout: id === "default" ? undefined : id, filters: undefined }) }); };
  const current = (): Omit<ListLayout, "id" | "name"> => ({ filters, sort, columns: colNames, widths, pageLen, shared });
  const startResize = (fn: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, w0 = widths[fn] ?? 160;
    const mv = (ev: MouseEvent) => setWidths((w) => ({ ...w, [fn]: Math.max(60, w0 + (document.dir === "rtl" ? x0 - ev.clientX : ev.clientX - x0)) }));
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };
  const reorder = (to: string) => { const from = drag.current; drag.current = null; if (!from || from === to) return; const n = colNames.filter((c) => c !== from); n.splice(n.indexOf(to), 0, from); setCols(n); };
  const menu = "flex w-full items-center rounded px-2 py-1.5 text-start text-sm hover:bg-muted";
  // list_view.js get_menu_items(): source gates per item (System Manager, can_import, Custom Field + Property Setter create, developer_mode)
  const canCreateOther = (dt: string) => { if (user === "Administrator") return true; const m = cachedMeta(dt); return !!m && hasPerm(m, "create", undefined, user); };
  const menuItems = new Set(hyd ? listMenuItems(meta, {
    roles: userRoles(user), can: (p) => hasPerm(meta, p, undefined, user), canCreate: canCreateOther, developerMode: SITE_DEVELOPER_MODE,
    allowImport: !!Number((meta as { allow_import?: number }).allow_import ?? rcQ.data?.lifecycle[meta.name]?.flags?.["allow_import"] ?? (meta.source.startsWith("plugin:") ? 1 : 0)),
  }) : []);
  const selectedDocs = rows.filter((r) => sel.has(r.name));
  const clipCols: BulkColumn[] = [
    { label: "ID", value: (r) => r["name"] },
    { label: "Status", value: (r) => indicatorFor(meta, lb, r as Doc)?.label ?? status(r as Doc) ?? "" },
    ...shownCols.map((c) => ({ label: c.label ?? c.fieldname!, value: (r: Record<string, unknown>) => formatValue(c.fieldtype, r[c.fieldname!], { options: c.options, doc: r as Doc }) })),
  ];
  const view = search.view ?? "list";
  const viewLabel = view === "report" ? "Report View" : view === "dashboard" ? "Dashboard View" : view === "kanban" ? "Kanban View" : view === "calendar" && calF ? "Calendar View" : view === "gantt" && calF ? "Gantt View" : active?.name ?? "Default Layout";

  if (hyd && !hasPerm(meta, "read")) return <Shell><div className="panel p-6" data-not-permitted><h2 className="font-semibold">Not Permitted</h2><p className="mt-1 text-sm text-muted-foreground"><span>No permission to read</span> <span data-no-i18n>{meta.name}</span></p></div></Shell>;
  return (
    <Shell crumbs={[...leadCrumbs(meta, app), { label: "", to: <Link to="/app/$app/$doctype" params={{ app, doctype }} className="hover:underline" data-crumb-doctype>{meta.name}</Link> }]}>
      {/* DIGIT Enterprise: every document list opens with the shared green band and its main actions (owner 2026-11-12 evening §6/§11) */}
      <div className={ent.on ? "ek-context ek-list-band" : "flex flex-wrap items-center gap-2"} data-tone={ent.on ? "brand" : undefined} data-ek-context={ent.on ? "" : undefined} data-list-band={ent.on ? "" : undefined}>
        {ent.on ? <div className="ek-context-main"><span className="ek-context-icon" aria-hidden><img src="/icons/digit/feat/digit-feat-documents-dark.svg" alt="" /></span>
          <div className="min-w-0"><p className="ek-eyebrow">{tr(String(meta.module ?? "Documents"))}</p><h1 className="ek-h1">{meta.name}</h1><p className="ek-context-sub">{lang === "ar" ? "كل سجل يفتح في اللوحة الجانبية أو صفحته الكاملة؛ الفلاتر والأعمدة تُحفظ في التخطيط." : "Every record opens in the side panel or its full page; filters and columns are saved in the layout."}</p></div></div>
          : <h1 className="text-xl font-semibold">{meta.name}</h1>}
        {meta.istable ? <span className="chip bg-warning/20">Child table — normally edited inside its parent record</span> : null}
        {ent.on && <BandWatermark />}
        <div className={`relative flex flex-wrap items-center gap-2 ${ent.on ? "ek-context-actions" : "ms-auto"}`}>
          {sel.size > 0 && <span className="text-xs text-muted-foreground" data-selected-count><span data-no-i18n>{sel.size}</span> <span>{sel.size === 1 ? "item selected" : "items selected"}</span></span>}
          {sel.size > 0 && <BulkActions meta={meta} selected={selectedDocs} columns={clipCols} onDone={() => setSel(new Set())} />}
          {trees?.[meta.name] && <Link className="btn-ghost" to="/app/$app/$doctype/view/tree" params={{ app, doctype }} data-tree-link>Tree</Link>}
          {lb?.button && <span className="chip self-center bg-muted" title={lb.source}>{lb.button}</span>}
          <div className="relative" data-us="view-switcher">
            <button type="button" className="btn-ghost" data-layout-switcher aria-haspopup="menu" onClick={() => setPanel(panel === "layouts" ? null : "layouts")}>☰ <span data-active-layout data-no-i18n={active && !active.builtin && view === "list" ? "" : undefined}>{viewLabel}</span> ⌃</button>
            {panel === "layouts" && (
              <div role="menu" className="absolute end-0 top-10 z-40 flex rounded-md border border-border bg-popover shadow-lg">
                <div className="w-48 p-1">
                  {[["list", "List View ›"], ["report", "Report View ›"], ["dashboard", "Dashboard View"], ["kanban", "Kanban View ›"], ...(calF ? [["calendar", "Calendar View"], ["gantt", "Gantt View"]] : [])].map(([v, l]) => <button key={v} type="button" data-view={v} className={`${menu} ${view === v ? "bg-muted" : ""}`} onClick={() => { if (v !== "list") { setPanel(null); } void nav({ search: (s: Search) => ({ ...s, view: v === "list" ? undefined : v }) }); if (v === "list") setPanel("layouts"); }}>{l}</button>)}
                </div>
                <div className="w-56 border-s border-border p-1" data-layout-submenu>
                  {layouts.map((l) => <button key={l.id} type="button" data-layout={l.name} className={`${menu} ${active?.id === l.id ? "font-semibold" : ""}`} onClick={() => setLayout(l.id)}>{l.name}{!l.builtin && l.shared ? <span className="ms-1 text-[10px] text-muted-foreground">(Shared)</span> : null}</button>)}
                  <div className="my-1 border-t border-border" />
                  <button type="button" className={menu} onClick={() => setPanel("create")}>+ Create Layout</button>
                  <button type="button" className={menu} onClick={() => { setPanel(null); setShareDlg({}); }} data-list-save-share>{lang === "ar" ? "+ حفظ العرض ومشاركته" : "+ Save and share view"}</button>
                  <button type="button" className={menu} onClick={() => setPanel("manage")}>Manage Layouts</button>
                </div>
              </div>
            )}
            {panel === "create" && (
              <div className="absolute end-0 top-10 z-40 w-72 space-y-2 rounded-md border border-border bg-popover p-3 shadow-lg" role="dialog" aria-label="Create Layout">
                <input className="field-input" placeholder="Layout Name" aria-label="Layout Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />Shared with everyone</label>
                <p className="text-[11px] text-muted-foreground">Saves the current filters, sort, columns, column order, widths and page length.</p>
                <button type="button" className="btn-primary" disabled={!newName.trim()} onClick={() => { const l: ListLayout = { ...current(), id: `u-${Date.now()}`, name: newName.trim() }; const n = [...saved, l]; setSaved(n); saveLayouts(meta.name, n); setNewName(""); toast("Saved"); setLayout(l.id); }}>Save</button>
              </div>
            )}
            {panel === "manage" && (
              <div className="absolute end-0 top-10 z-40 w-80 rounded-md border border-border bg-popover p-3 shadow-lg" role="dialog" aria-label="Manage Layouts">
                <h3 className="mb-2 font-semibold">Manage Layouts</h3>
                {saved.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 border-t border-border py-1.5 text-sm">
                    <span className="flex-1" data-no-i18n>{l.name}</span>
                    <button type="button" className="text-xs text-primary" onClick={() => { const n = saved.map((x) => (x.id === l.id ? { ...x, ...current(), name: x.name } : x)); setSaved(n); saveLayouts(meta.name, n); toast("Saved"); }}>Update</button>
                    <button type="button" className="text-xs text-destructive" onClick={() => { const n = saved.filter((x) => x.id !== l.id); setSaved(n); saveLayouts(meta.name, n); if (active?.id === l.id) setLayout("default"); }}>Delete</button>
                  </div>
                ))}
                {sharedViews.map((v) => (
                  <div key={v.id} className="flex items-center gap-2 border-t border-border py-1.5 text-sm" data-list-shared-view={v.id}>
                    <span className="flex-1" data-no-i18n>{v.title}</span><span className="text-[10px] text-muted-foreground">{shareLabel(v.share, lang === "ar")}</span>
                    {v.owner === user && <button type="button" className="text-xs text-primary" onClick={() => { setPanel(null); setShareDlg({ editing: v }); }}>{lang === "ar" ? "المشاركة" : "Sharing"}</button>}
                    {v.owner === user && <button type="button" className="text-xs text-destructive" onClick={() => { const e = deleteView(v.id, user); if (e.length) toast.error(e[0]!); else if (active?.id === `sv-${v.id}`) setLayout("default"); }}>Delete</button>}
                  </div>
                ))}
                {!saved.length && !sharedViews.length && <p className="text-sm text-muted-foreground">No saved layouts</p>}
              </div>
            )}
          </div>
          <button type="button" className="btn-ghost" aria-label="Refresh" title="Refresh" onClick={() => { adapter.flush(); toast("Refreshed"); }}><EntGlyph name="ui-refresh" on={ent.on ? "dark" : "light"} fallback="⟳" /></button>
          <div className="relative">
            <button type="button" className="btn-ghost" aria-label="Menu" data-list-menu onClick={() => setPanel(panel === "menu" ? null : "menu")}>…</button>
            {panel === "menu" && (
              <div role="menu" className="absolute end-0 top-10 z-40 w-64 rounded-md border border-border bg-popover p-1 shadow-lg">
                {menuItems.has("Import") && <button type="button" className={menu} data-menu-item="Import" onClick={() => { setPanel(null); setModal("import"); }}><EntGlyph name="ui-upload" /><span>Import</span></button>}
                {/* report_view.js: Export sits in the Report View menu; in List View it is a bulk action on checked rows */}
                {view === "report" && !meta.istable && hasPerm(meta, "export", undefined, user) && <Link className={menu} data-menu-item="Export" to="/app/data-export" search={sel.size ? { doctype: meta.name, names: [...sel].join(",") } : { doctype: meta.name }}><EntGlyph name="ui-download" /><span>Export</span></Link>}
                {menuItems.has("User Permissions") && <button type="button" className={menu} data-menu-item="User Permissions" onClick={() => { setPanel(null); setModal({ settings: "User Permissions" }); }}><EntGlyph name="ui-user" /><span>User Permissions</span></button>}
                {menuItems.has("Role Permissions Manager") && <button type="button" className={menu} data-menu-item="Role Permissions Manager" onClick={() => { setPanel(null); setModal({ settings: "Roles" }); }}><EntGlyph name="feat-permissions" /><span>Role Permissions Manager</span></button>}
                {menuItems.has("Customize") && <Link className={menu} data-menu-item="Customize" to="/customize-form" search={{ doctype: meta.name }}><EntGlyph name="svc-customization" /><span>Customize</span></Link>}
                {menuItems.has("Settings") && <button type="button" className={menu} data-menu-item="Settings" data-open-settings onClick={() => { setPanel(null); setModal({ settings: "General" }); }}><EntGlyph name="ui-settings" /><span>Settings</span></button>}
                {menuItems.has("Edit DocType") && <Link className={menu} data-menu-item="Edit DocType" to="/app/$app/$doctype" params={{ app: "frappe", doctype: "doctype" }}><EntGlyph name="ui-edit" /><span>Edit DocType</span></Link>}
                {menuItems.has("Customize Quick Filters") && <button type="button" className={menu} data-menu-item="Customize Quick Filters" onClick={() => setPanel("filters")}><EntGlyph name="ui-filter" /><span>Customize Quick Filters</span></button>}
                {menuItems.has("List Settings") && <button type="button" className={menu} data-menu-item="List Settings" onClick={() => setPanel("cols")}>List Settings</button>}
              </div>
            )}
          </div>
          {meta.name === "Attendance" && <MarkAttendanceButton />}
          {!meta.istable && canCreate && (!hyd || hasPerm(meta, "create")) && <button className="btn-primary disabled:opacity-60" data-list-add disabled={capPending} onClick={() => { const r = createDraft(meta); if (!r.doc) { toast.error(r.errors.join("\n")); return; } nav({ to: "/app/$app/$doctype/$name", params: { app, doctype, name: r.doc.name } }); }}><EntGlyph name="ui-add" on="dark" fallback="+ " />Add {meta.name}</button>}
        </div>
      </div>

      {ent.on && !meta.istable && view === "list" && <ListKpis meta={meta} rows={base} ar={lang === "ar"} filters={filters} onFilter={setFilters} />}
      {ent.on && !meta.istable && <div className="mt-3"><StatusStrip tabs={strip} active={search.st} ar={lang === "ar"} onPick={(k) => { void nav({ search: (x: Search) => ({ ...x, st: k }) }); }} /></div>}
      <div className={`mt-3 flex flex-wrap items-center gap-2 ${ent.on ? "ek-card ek-filterbar" : ""}`} data-list-filterbar>
        {us.list_sidebar && !meta.istable && <button type="button" className="btn-ghost md:hidden" aria-expanded={sideOpen} data-list-sidebar-toggle onClick={() => setSideOpen(!sideOpen)}>☰ <span>Sidebar</span></button>}
        <input className="field-input w-48 max-md:min-w-0 max-md:flex-1" placeholder="ID / search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search list" />
        {standardFilters.map((f) => (
          <input key={f.fieldname} className="field-input w-40" placeholder={f.label} aria-label={`Filter ${f.label}`}
            value={String(filters.find((x) => x[0] === f.fieldname && x[1] === "like")?.[2] ?? "")}
            onChange={(e) => setFilters([...filters.filter((x) => !(x[0] === f.fieldname && x[1] === "like")), ...(e.target.value ? [[f.fieldname!, "like", e.target.value] as Filter] : [])])} />
        ))}
        <span className="flex items-center rounded-md border border-border text-sm">
          <button type="button" className="px-2 py-1" data-filters-button onClick={() => setPanel(panel === "filters" ? null : "filters")}><span>Filters</span> <span data-no-i18n>{filters.length || ""}</span></button>
          {filters.length > 0 && <button type="button" className="border-s border-border px-1.5 py-1" aria-label="Clear filters" onClick={() => setFilters([])}>×</button>}
        </span>
        <div className="ms-auto flex items-center gap-1 text-sm">
          <button type="button" className="btn-ghost" onClick={() => setSort({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" })} aria-label="Toggle sort order">⇅</button>
          <select aria-label="Sort field" className="field-input w-44" value={sort.f} onChange={(e) => setSort({ ...sort, f: e.target.value })} title={sortLabel}>
            <option value="modified">Last Updated On</option><option value="name">ID</option>
            {dataFields.map((f) => <option key={f.fieldname} value={f.fieldname}>{f.label ?? f.fieldname}</option>)}
          </select>
        </div>
      </div>

      {panel === "filters" && (
        <div className="panel mt-2 flex flex-wrap items-center gap-2 p-2 text-xs" data-filter-panel>
          {filters.map((f, i) => <span key={i} className="chip bg-accent"><span>{dataFields.find((d) => d.fieldname === f[0])?.label ?? f[0]}</span> <span data-no-i18n>{f[1]} {String(f[2])}</span><button className="ms-1" onClick={() => setFilters(filters.filter((_, j) => j !== i))} aria-label="Remove filter">×</button></span>)}
          <select aria-label="Filter field" className="field-input w-36 py-1" value={nf[0]} onChange={(e) => setNf([e.target.value, nf[1], nf[2]])}><option value="">+ Filter field</option><option value="docstatus">docstatus</option>{dataFields.map((f) => <option key={f.fieldname} value={f.fieldname}>{f.label ?? f.fieldname}</option>)}</select>
          <select aria-label="Filter operator" className="field-input w-20 py-1" value={nf[1]} onChange={(e) => setNf([nf[0], e.target.value, nf[2]])}>{OPS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
          <input aria-label="Filter value" className="field-input w-32 py-1" value={String(nf[2])} onChange={(e) => setNf([nf[0], nf[1], e.target.value])} />
          <button className="btn-ghost py-1" disabled={!nf[0]} onClick={() => { setFilters([...filters, nf]); setNf(["", "=", ""]); toast("Applied"); }}><EntGlyph name="ui-filter" /><span>Apply</span></button>
        </div>
      )}
      {panel === "cols" && (
        <div className="panel mt-2 flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-auto p-3 text-xs">
          {dataFields.map((f) => <label key={f.fieldname} className="flex items-center gap-1"><input type="checkbox" checked={colNames.includes(f.fieldname!)} onChange={(e) => setCols(e.target.checked ? [...colNames, f.fieldname!] : colNames.filter((c) => c !== f.fieldname))} />{f.label ?? f.fieldname}</label>)}
        </div>
      )}

      <div className="mt-3 flex gap-4 max-md:flex-col">
        {us.list_sidebar && !meta.istable && <div className={sideOpen ? "" : "max-md:hidden"} data-list-sidebar-wrap><ListSidebar meta={meta} docs={base} layouts={layouts} onFilter={(f) => { setFilters([...filters, f]); setSideOpen(false); }} onLayout={setLayout} /></div>}
        <div className="min-w-0 flex-1">
          {view === "dashboard" ? <DashboardView docs={all} label={(r) => indicatorFor(meta, lb, r)?.label ?? status(r) ?? "—"} />
          : view === "kanban" ? <DeskKanban meta={meta} docs={all} fields={shownCols} titleOf={titleOf} tone={toneOf} />
          : view === "calendar" && calF ? <CalendarView meta={meta} events={calEvents} tone={toneOf} app={app} doctype={doctype} />
          : view === "gantt" && calF ? <GanttView meta={meta} events={calEvents} tone={toneOf} app={app} doctype={doctype} />
          : (
          <div className="panel overflow-x-auto" data-list-behavior={lb ? lb.indicators.length : 0}>
            <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
              <thead className="bg-muted text-start text-xs text-muted-foreground">
                <tr>
                  <th data-us="bulk" className="w-8 px-3 py-2"><input type="checkbox" aria-label="Select all" checked={rows.length > 0 && rows.every((r) => sel.has(r.name))} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.name)) : new Set())} /></th>
                  <th className="w-32 px-3 py-2 text-start">ID</th><th className="w-24 px-3 py-2 text-start">Status</th>
                  {(view === "report" ? dataFields.slice(0, 12) : shownCols).map((c) => (
                    <th key={c.fieldname} draggable onDragStart={() => (drag.current = c.fieldname!)} onDragOver={(e) => e.preventDefault()} onDrop={() => reorder(c.fieldname!)}
                      data-col={c.fieldname} style={{ width: widths[c.fieldname!] ?? (view === "report" ? 160 : undefined) }} className="relative cursor-move select-none px-3 py-2 text-start">
                      <span className="block truncate">{c.label ?? c.fieldname}</span>
                      <span role="separator" aria-label="Resize column" data-resize={c.fieldname} onMouseDown={(e) => startResize(c.fieldname!, e)} className="absolute end-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40" />
                    </th>
                  ))}
                  <th className="w-36 px-3 py-2" />
                </tr>
                <tr className="ent-colfilter-row" data-col-filters>
                  <th data-us="bulk" className="px-3 pb-2" />
                  {[["name", "ID"], ["__status", "Status"]].map(([fn, lbl]) => <th key={fn} className="px-2 pb-2"><input value={colF[fn!] ?? ""} onChange={(e) => setColF({ ...colF, [fn!]: e.target.value })} aria-label={`Filter ${lbl}`} placeholder="⌕" data-col-filter={fn} className="ent-colfilter" /></th>)}
                  {(view === "report" ? dataFields.slice(0, 12) : shownCols).map((c) => (
                    <th key={c.fieldname} className="px-2 pb-2"><input value={colF[c.fieldname!] ?? ""} onChange={(e) => setColF({ ...colF, [c.fieldname!]: e.target.value })} aria-label={`Filter ${c.label ?? c.fieldname}`} placeholder={NUMERIC.has(c.fieldtype) ? "> 0" : "⌕"} data-col-filter={c.fieldname} className="ent-colfilter" /></th>
                  ))}
                  <th className="px-2 pb-2">{Object.values(colF).some((v) => v.trim()) && <button type="button" className="text-xs text-primary hover:underline" data-col-filters-clear onClick={() => setColF({})}>Clear</button>}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} className="border-t border-border hover:bg-muted/50" {...(ent.on && !meta.istable ? { "data-r1-peek-row": r.name, onClick: (e: { target: EventTarget; currentTarget: HTMLTableRowElement }) => { if ((e.target as Element).closest(ROW_INTERACTIVE)) return; peekRow(meta.name, r.name, all.map((x) => x.name), e.currentTarget); } } : {})}>
                    <td data-us="bulk" className="overflow-hidden px-3 py-2"><input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(r.name)} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(r.name); else s.delete(r.name); setSel(s); }} /></td>
                    <td className="truncate px-3 py-2">{meta.istable && r["parenttype"] ? (() => { const pm = cachedMeta(String(r["parenttype"])); return pm ? <Link to="/app/$app/$doctype/$name" params={{ app: pm.app, doctype: slugOf(pm.name), name: String(r["parent"]) }} search={rowSearch as never} className="font-medium text-primary hover:underline" data-child-parent={String(r["parenttype"])}><bdi data-no-i18n>{String(r["parent"])}</bdi> <span className="text-xs text-muted-foreground">· {translateTo(pm.name, lang === "ar" ? "ar" : "en")} #{String(r["idx"] ?? "")}</span></Link> : <span data-no-i18n>{r.name}</span>; })() : <><Link to="/app/$app/$doctype/$name" params={{ app, doctype, name: r.name }} search={rowSearch as never} className="font-medium text-primary hover:underline" data-no-i18n title={hasMasterName(meta.name) ? r.name : undefined}>{hasMasterName(meta.name) ? masterName(meta.name, r.name) : r.name}</Link>{ent.on && profiled && <Open360 doctype={meta.name} name={r.name} compact className="dx-360 ms-2" />}</>}</td>
                    <td className="truncate px-3 py-2">{(() => { const ind = indicatorFor(meta, lb, r); return <>{ind ? <span className={`chip ${COLOR_CLASS[ind.color] ?? "bg-muted"}`} data-indicator={ind.label} data-source={ind.source} data-no-i18n={ind.source === "status field" && !statusOptions ? "" : undefined}>{ind.label}</span> : status(r) && <span className="chip bg-accent">{status(r)}</span>}{ent.on && <OverdueTag days={overdueDays(meta, r)} ar={lang === "ar"} />}</>; })()}</td>
                    {(view === "report" ? dataFields.slice(0, 12) : shownCols).map((c) => { const txt = formatValue(c.fieldtype, r[c.fieldname!], { options: c.options, doc: r }); return <td key={c.fieldname} title={txt} dir={NUMERIC.has(c.fieldtype) ? undefined : "auto"} className={`truncate px-3 py-2 ${NUMERIC.has(c.fieldtype) ? "text-end tabular-nums" : "bidi-iso"}`}>{c.fieldtype === "Check" ? (r[c.fieldname!] ? "✓" : "") : <span data-no-i18n={c.fieldtype === "Select" ? undefined : ""}>{txt}</span>}</td>; })}
                    <td className="overflow-hidden whitespace-nowrap px-3 py-2 text-end text-xs text-muted-foreground">
                      <span data-rel-time>{relTime(String(r.modified ?? r["creation"] ?? ""), lang)}</span>
                      <span className="ms-2" title="Comments">💬 <span data-no-i18n>{comments(r)}</span></span>
                      <button type="button" aria-label="Like" data-like className={`ms-2 ${liked(r) ? "text-destructive" : ""}`} onClick={() => adapter.update(meta.name, r.name, { _liked_by: liked(r) ? "" : JSON.stringify(["Administrator"]) })}>{liked(r) ? "♥" : "♡"}</button>
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={shownCols.length + 4}><span>No</span> <span>{meta.name}</span> <span>found</span></td></tr>}
              </tbody>
            </table>
          </div>)}
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            {PAGE_SIZES.map((n) => <button key={n} className={`btn-ghost py-0.5 ${pageLen === n ? "bg-accent" : ""}`} onClick={() => { setPageLen(n); setShown(n); }} data-no-i18n>{n}</button>)}
            {shown < all.length && <button type="button" className="btn-ghost py-0.5" onClick={() => setShown(shown + pageLen)}>Load More</button>}
            <span className="ms-auto"><span data-no-i18n>{rows.length}</span> <span>of</span> <span data-no-i18n>{all.length}</span></span>
          </div>
        </div>
      </div>
      {shareDlg && <SaveShareDialog key={shareDlg.editing?.id ?? "new"} open onOpenChange={(o) => { if (!o) setShareDlg(null); }} ar={lang === "ar"} doctype={meta.name} surface="list" editing={shareDlg.editing}
        payload={(() => { const { shared: _s, ...rest } = current(); return rest as Record<string, unknown>; })()}
        summary={[...filters.map((f, i) => <span key={`f${i}`} data-no-i18n>{translateTo(meta.fields.find((x) => x.fieldname === f[0])?.label ?? String(f[0]), lang)} {String(f[1])} {String(f[2] ?? "")}</span>),
          ...(sort ? [<span key="s">{lang === "ar" ? "الترتيب" : "Sort"}: <b data-no-i18n>{translateTo(meta.fields.find((x) => x.fieldname === sort.f)?.label ?? sort.f, lang)} {sort.dir === "asc" ? "↑" : "↓"}</b></span>] : []),
          <span key="c">{lang === "ar" ? "الأعمدة" : "Columns"}: <b data-no-i18n>{colNames.length}</b></span>]}
        onSaved={(v) => { setShareDlg(null); if (!shareDlg.editing) setLayout(`sv-${v.id}`); toast.success(lang === "ar" ? "حُفظ العرض" : "View saved"); }} />}
      {modal === "import" && <ImportModal meta={meta} onClose={() => setModal(null)} />}
      {modal && typeof modal === "object" && <DocTypeSettings meta={meta} initial={modal.settings as "General"} onClose={() => setModal(null)} />}
    </Shell>
  );
}

function DashboardView({ docs, label }: { docs: Doc[]; label: (d: Doc) => string }) {
  const m = new Map<string, number>(); docs.forEach((d) => m.set(label(d), (m.get(label(d)) ?? 0) + 1));
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-dashboard-view>{[...m].map(([k, n]) => <div key={k} className="panel p-4"><div className="text-xs text-muted-foreground">{k}</div><div className="text-2xl font-semibold" data-no-i18n>{n}</div></div>)}</div>;
}
