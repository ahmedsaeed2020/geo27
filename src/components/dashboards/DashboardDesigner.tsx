/**
 * Universal Dashboard Designer (DIGIT-CORE-PRO-UX-006 §9) — the ONE composer every DIGIT application uses.
 *
 * View mode: renders the resolved layout (personal → role template → global default → app default). When nothing is
 * customized and the app passes `fallback`, the app's original dashboard renders untouched, so defaults never change.
 * Edit mode: a live preview of a draft layout with add (catalog), remove (non-mandatory only), reorder (drag, buttons,
 * keyboard arrows), resize, rename, view switching (compatible views only; incompatible requests explain why), approved
 * options, undo, restore default, cancel, and save for me / a role / everyone (permission-checked in src/lib/dashboards).
 * Phones get full-width widgets and 44px controls; Arabic mirrors via logical properties.
 */
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLang } from "@/i18n";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { ADMIN, useSessionUser, userRoles } from "@/lib/session";
import { useSettings } from "@/lib/userSettings";
import { activateView, canManage, clearLayout, cloneView, createView, defaultLayout, deleteView, namedViews, renameView, resolveLayout, restoreViewVersion, sameLayout, saveLayout, saveView, type DesignerItem, type DesignerLayout, type LayoutSource, type NamedView } from "@/lib/dashboards/layout";
import { blockLabel, WIDTHS, type DashboardDef, type WidgetDef, type Width } from "@/lib/dashboards/registry";
import { featureOn } from "@/lib/coreShared/features";
import { BlockMenu, type BlockPatch } from "./BlockMenu";
import { AddSlotProvider } from "@/components/enterprise/kit/AddSlot";
import { checkView, VIEW_KINDS, VIEW_LABEL, viewsFor, type Bi, type ViewKind } from "@/lib/dashboards/views";
import { KpiWidgetCard, KpiChip, ChartFoot, WidgetView, type CrossFilter, type LinkFor } from "./views";
import { FrameAction, FrameCtx, FramePeriod, FrameSub, FrameToggle, freshOf, frameSources } from "./CardFrame";
import { cardRows, exportExcel, exportPng } from "@/lib/dashboards/exportBlock";

const today = () => new Date().toISOString().slice(0, 10);
import { withPulse } from "./DocPulse";
import { useCatalogIndex } from "./useCatalogIndex";
import { DASH_EDIT_EVENT, KpiStrip, type ScoreRow, type StripItem } from "@/components/enterprise/kit";
export { DASH_EDIT_EVENT, openDashboardEditor } from "@/components/enterprise/kit";
/** Feature Control key of one block (Administration → which blocks each role may see or add). */
export const blockFeature = (app: string, dash: string, widget: string) => `block:${app}:${dash}:${widget}`;

const pick = (ar: boolean, b: Bi) => (ar ? b[1] : b[0]);
const SPAN: Record<Width, string> = { 3: "col-span-12 sm:col-span-6 lg:col-span-3", 4: "col-span-12 sm:col-span-6 lg:col-span-4", 6: "col-span-12 lg:col-span-6", 8: "col-span-12 lg:col-span-8", 12: "col-span-12" };
// 3 = tall: spans two grid rows so two blocks stack beside it (design-contract floorplans, owner 2026-11-12)
const HEIGHT: Record<number, string> = { 1: "", 2: "min-h-[18rem]", 3: "lg:row-span-2 dash-tall" };
const T = {
  customize: ["Customize dashboard", "تخصيص لوحة المعلومات"], done: ["Done", "تم"], add: ["Add widget", "إضافة أداة"], undo: ["Undo", "تراجع"],
  restore: ["Restore default layout", "استعادة التخطيط الافتراضي"], cancel: ["Cancel", "إلغاء"], saveMe: ["Save for me", "حفظ لي"],
  saveRole: ["Save for role", "حفظ للدور"], saveGlobal: ["Save as default for everyone", "حفظ كافتراضي للجميع"], preview: ["Preview", "معاينة"], edit: ["Edit", "تعديل"],
  earlier: ["Move earlier", "نقل للأمام"], later: ["Move later", "نقل للخلف"], smaller: ["Narrower", "أضيق"], wider: ["Wider", "أعرض"],
  remove: ["Remove", "إزالة"], rename: ["Title", "العنوان"], view: ["Visualization", "نوع العرض"], required: ["Mandatory widget — cannot be removed", "أداة إلزامية — لا يمكن إزالتها"],
  catalog: ["Widget catalog", "كتالوج الأدوات"], noMore: ["Every available widget is already on this dashboard.", "كل الأدوات المتاحة موجودة على اللوحة."],
  srcPersonal: ["Your layout", "تخطيطك"], srcRole: ["Team template", "قالب الفريق"], srcGlobal: ["Default for everyone", "الافتراضي للجميع"], srcDefault: ["Standard layout", "التخطيط القياسي"],
  resetMine: ["Use the shared layout", "استخدام التخطيط المشترك"], clearRole: ["Remove role template", "حذف قالب الدور"], clearGlobal: ["Remove default for everyone", "حذف الافتراضي للجميع"],
  noPerm: ["Not visible to you (permission)", "غير ظاهرة لك (الصلاحيات)"], failed: ["This widget could not be displayed.", "تعذّر عرض هذه الأداة."],
  unsaved: ["Unsaved changes", "تغييرات غير محفوظة"], sources: ["Source", "المصدر"], size: ["Width", "العرض"], drag: ["Drag to reorder", "اسحب لإعادة الترتيب"],
  close: ["Close", "إغلاق"], role: ["Role", "الدور"],
  srcNamed: ["My dashboard", "لوحتي"], srcCompany: ["Company preset", "إعداد الشركة المسبق"], saveCompany: ["Save as company preset", "حفظ كإعداد مسبق للشركة"], clearCompany: ["Remove company preset", "حذف إعداد الشركة المسبق"],
  dashboards: ["Dashboard", "اللوحة"], shared: ["Shared layout", "التخطيط المشترك"], saveAs: ["Save as new dashboard…", "حفظ كلوحة جديدة…"], cloneIt: ["Duplicate", "نسخ"], renameIt: ["Rename", "إعادة تسمية"],
  deleteIt: ["Delete", "حذف"], versions: ["Versions", "النسخ"], restoreV: ["Restore", "استعادة"], name: ["Dashboard name", "اسم اللوحة"], ok: ["OK", "موافق"], confirmDel: ["Delete this dashboard? Its saved versions are deleted too.", "حذف هذه اللوحة؟ تُحذف نسخها المحفوظة أيضًا."],
  reload: ["Reload latest", "إعادة تحميل الأحدث"], filters: ["Dashboard filters", "مرشحات اللوحة"], allF: ["All", "الكل"], clearF: ["Clear filters", "مسح المرشحات"], rev: ["revision", "مراجعة"],
} satisfies Record<string, Bi>;

class WidgetBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export interface DashboardDesignerProps<C> {
  def: DashboardDef<C>;
  ctx: C;
  /** The application's original dashboard, rendered while no customized layout applies. */
  fallback?: ReactNode;
  link?: LinkFor | undefined;
  /** Extra class for each generic widget frame (app look); the app's own default renderers keep their own frames. */
  frameClassName?: string | undefined;
  className?: string | undefined;
  /** Company in context: resolves and publishes company presets (TemplateScope "Company"). */
  company?: string | undefined;
  /** Dashboard filter values owned by the host (URL state); without them the designer keeps them in memory. */
  filterValues?: Record<string, string> | undefined;
  onFilters?: ((next: Record<string, string>) => void) | undefined;
  /**
   * Template one-indicator-row: host tiles drawn before / after the layout's KPI widgets. While viewing, the KPI widgets
   * (default "kpi" view) and these tiles form ONE strip at the first KPI's place (one figure once, six visible, the rest under
   * "All indicators"); while editing, KPI widgets keep their grid cells so they can be moved, resized and removed.
   */
  strip?: { before?: StripItem[]; after?: StripItem[]; tagAttr?: string; /** equal cards, no wide Hero */ flat?: boolean; /** shown under the indicator row (sourced insight sentences) */ note?: ReactNode; /** a tile widget whose figure is zero with no data (never a main card) */ empty?: (widgetId: string) => boolean;
    /** the same figure as a scorecard row (this period · previous · change) for tiles that are not main cards */ score?: (widgetId: string, opts: Record<string, string>) => ScoreRow | undefined } | undefined;
  /** the page header band carries the Customize button (openDashboardEditor), so the view bar does not repeat it */
  bandEdit?: boolean | undefined;
  /** «أضف عنصرًا +» as the last cell of the page's first KPI row: lists the widgets not on the layout and adds one straight into the user's own layout */
  addSlot?: boolean | undefined;
}

function sourceLabel(ar: boolean, s: LayoutSource) {
  if (s.kind === "personal") return pick(ar, T.srcPersonal);
  if (s.kind === "named") return `${pick(ar, T.srcNamed)} · ${s.title}`;
  if (s.kind === "company") return `${pick(ar, T.srcCompany)} · ${s.company}`;
  if (s.kind === "role") return `${pick(ar, T.srcRole)} · ${s.role}`;
  if (s.kind === "global") return pick(ar, T.srcGlobal);
  return pick(ar, T.srcDefault);
}

export function DashboardDesigner<C>({ def: given, ctx, fallback, link, frameClassName, className, company, filterValues, onFilters, strip, bandEdit, addSlot }: DashboardDesignerProps<C>) {
  const ar = useLang() === "ar";
  const user = useSessionUser(); const roles = userRoles(user);
  useSettings(); useStoreVersion();
  // ONE STANDARD R9: a dashboard with fewer than four rows gets the shared document pulse built from its own sources
  const index = useCatalogIndex();
  const def = useMemo(() => (index ? withPulse(given, (dt) => index.some((e) => e.name === dt && !e.istable), !!strip) : given), [given, index, !!strip]);
  const d = def as unknown as DashboardDef<unknown>;
  const resolved = resolveLayout(d, user, roles, undefined, company);
  const views = namedViews(d, user);
  const activeView: NamedView | undefined = resolved.source.kind === "named" ? views.find((v) => v.id === (resolved.source as { id: string }).id) : undefined;
  const [localF, setLocalF] = useState<Record<string, string>>({});
  const fvals = filterValues ?? localF;
  const setF = (next: Record<string, string>) => { const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v)); if (onFilters) onFilters(clean); else setLocalF(clean); };
  const cross: CrossFilter | undefined = def.filters?.length ? { active: fvals, set: (k, v) => setF({ ...fvals, [k]: v ?? "" }) } : undefined;
  const [startRev, setStartRev] = useState<number | null>(null);
  const [naming, setNaming] = useState<null | "new" | "rename">(null);
  const [nameText, setNameText] = useState("");
  const [menuAsk, setMenuAsk] = useState<Record<string, number>>({});
  const [conflict, setConflict] = useState(false);
  const [draft, setDraft] = useState<DesignerLayout | null>(null);
  const [history, setHistory] = useState<DesignerLayout[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [catalog, setCatalog] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState<Bi | null>(null);
  const [role, setRole] = useState("");
  const dragId = useRef<string | null>(null);
  const editing = !!draft;
  const byId = useMemo(() => new Map(def.widgets.map((w) => [w.id, w])), [def]);
  // Administration → Dashboard control: a block switched off for every role of the user at this company is neither shown nor offered
  const allowed = (w: WidgetDef<C>) => w.required || featureOn(blockFeature(def.app, def.id, w.id), { user, roles, company: company ?? "" });
  const readable = (w: WidgetDef<C>) => { try { return allowed(w) && (w.readable ? w.readable(ctx) : true); } catch { return false; } };
  const rootRef = useRef<HTMLDivElement>(null);
  const roleChoices = useMemo(() => {
    // managers choose any role defined on the site (Role records, plus roles already assigned to users when the Role
    // master is not loaded); other publishers only roles they hold
    const siteRoles = () => [...adapter.list("Role").map((r) => r.name), ...adapter.list("User").flatMap((u) => (Array.isArray(u["roles"]) ? (u["roles"] as Record<string, unknown>[]).map((r) => String(r["role"] ?? "")) : []))];
    const all = (user === ADMIN || roles.includes("System Manager") ? siteRoles() : roles).filter((n) => !!n && !["Guest", "All", "Administrator"].includes(n));
    return [...new Set(all)].sort();
  }, [user, roles.join("|")]);
  const canRole = canManage(d, "Role", user, roles, role || roleChoices[0]);
  const canGlobal = canManage(d, "Global", user, roles);
  const canCompany = canManage(d, "Company", user, roles, undefined, company);

  const layout = draft ?? resolved.layout;
  const dirty = !!draft && !sameLayout(draft, resolved.layout);
  const announce = (en: string, arText: string) => setMsg(ar ? arText : en);
  const change = (next: DesignerLayout) => { if (!draft) return; setHistory((h) => [...h.slice(-29), draft]); setDraft(next); setErr(null); };
  const setItems = (items: DesignerItem[]) => draft && change({ ...draft, items });
  const titleOf = (w: WidgetDef<C>, it?: DesignerItem) => it?.title || pick(ar, w.title);

  const move = (id: string, to: number) => {
    if (!draft) return; const items = [...draft.items]; const from = items.findIndex((i) => i.id === id);
    if (from < 0 || to < 0 || to >= items.length || from === to) return;
    const [it] = items.splice(from, 1); items.splice(to, 0, it!); setItems(items);
    const w = byId.get(id); if (w) announce(`Moved ${titleOf(w, it)} to position ${to + 1} of ${items.length}`, `نُقلت ${titleOf(w, it)} إلى الموضع ${to + 1} من ${items.length}`);
  };
  const resize = (id: string, dir: 1 | -1) => {
    if (!draft) return; const w = byId.get(id); if (!w) return;
    setItems(draft.items.map((i) => { if (i.id !== id) return i; const k = WIDTHS.indexOf(i.w as Width); const nk = Math.min(WIDTHS.length - 1, Math.max(0, (k < 0 ? 2 : k) + dir)); const nw = WIDTHS[nk]!; if (w.minW && nw < w.minW) return i; announce(`Width ${nw} of 12`, `العرض ${nw} من 12`); return { ...i, w: nw }; }));
  };
  const setView = (id: string, v: ViewKind) => {
    const w = byId.get(id); if (!w || !draft) return;
    const c = checkView(w.shape, v, w.views, w.facts);
    if (!c.ok) { setErr(c.reason); announce(c.reason[0], c.reason[1]); return; }
    setItems(draft.items.map((i) => { if (i.id !== id) return i; const { view: _old, ...rest } = i; return v === w.defaultView ? rest : { ...rest, view: v }; }));
    announce(`${titleOf(w)} shown as ${VIEW_LABEL[v][0]}`, `${titleOf(w)} معروضة كـ ${VIEW_LABEL[v][1]}`);
  };
  const setOpt = (id: string, k: string, v: string) => {
    if (!draft) return;
    const o = byId.get(id)?.options?.find((x) => x.key === k);
    setItems(draft.items.map((i) => {
      if (i.id !== id) return i;
      const opts = { ...(i.opts ?? {}) };
      if (o && v === o.default) delete opts[k]; else opts[k] = v;
      const { opts: _old, ...rest } = i;
      return Object.keys(opts).length ? { ...rest, opts } : rest;
    }));
  };
  const setTitle = (id: string, t: string) => {
    if (!draft) return;
    setItems(draft.items.map((i) => { if (i.id !== id) return i; const { title: _old, ...rest } = i; return t.trim() ? { ...rest, title: t.slice(0, 80) } : rest; }));
  };
  const remove = (id: string) => { const w = byId.get(id); if (!w || w.required || !draft) return; setItems(draft.items.filter((i) => i.id !== id)); announce(`Removed ${titleOf(w)}`, `أزيلت ${titleOf(w)}`); };
  const add = (id: string) => { const w = byId.get(id); if (!w || !draft) return; setItems([...draft.items, { id, w: w.size.w, ...(w.size.h ? { h: w.size.h } : {}) }]); announce(`Added ${titleOf(w)}`, `أضيفت ${titleOf(w)}`); };

  // «أضف عنصرًا +»: one widget added straight into the user's own layout (or the active named dashboard), outside edit mode
  const quickAdd = (id: string) => {
    const w = byId.get(id); if (!w || draft) return;
    const next: DesignerLayout = { ...resolved.layout, items: [...resolved.layout.items, { id, w: w.size.w, ...(w.size.h ? { h: w.size.h } : {}) }] };
    const r = activeView ? saveView(d, user, activeView.id, next, activeView.revision) : saveLayout(d, "personal", next, user, roles, undefined, undefined, company);
    if (!r.ok) { setErr(r.reason); announce(r.reason[0], r.reason[1]); return; }
    setErr(null); announce(`Added ${titleOf(w)}`, `أضيفت ${titleOf(w)}`);
  };
  const slotOwner = useRef<string | null>(null); slotOwner.current = null;
  const start = () => { setDraft(resolved.layout); setHistory([]); setErr(null); setPreviewing(false); setConflict(false); setStartRev(activeView?.revision ?? null); };
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<string | undefined>).detail; const el = rootRef.current; if (!el) return;
      if (id ? id === def.id : document.querySelector("[data-dash]") === el) { if (!draft) start(); requestAnimationFrame(() => el.scrollIntoView({ block: "start", behavior: "smooth" })); }
    };
    window.addEventListener(DASH_EDIT_EVENT, on); return () => window.removeEventListener(DASH_EDIT_EVENT, on);
  });
  const stop = () => { setDraft(null); setHistory([]); setCatalog(false); setErr(null); setPreviewing(false); setNaming(null); setConflict(false); setStartRev(null); };
  const fail = (reason: Bi, isConflict?: boolean) => { setErr(reason); setConflict(!!isConflict); announce(reason[0], reason[1]); };
  const save = (scope: "personal" | "Role" | "Global" | "Company") => {
    if (!draft) return;
    // with a named dashboard active, "Save for me" saves into it (revision-checked against the revision the edit started from)
    if (scope === "personal" && activeView) {
      const r = saveView(d, user, activeView.id, draft, startRev ?? activeView.revision);
      if (!r.ok) { fail(r.reason, r.conflict); return; }
      announce(`Saved ${r.view.title}`, `حُفظت ${r.view.title}`); stop(); return;
    }
    const r = saveLayout(d, scope, draft, user, roles, scope === "Role" ? role || roleChoices[0] : undefined, undefined, company);
    if (!r.ok) { fail(r.reason); return; }
    announce("Layout saved", "حُفظ التخطيط"); stop();
  };
  const saveAsNew = () => {
    const base = draft ?? resolved.layout;
    const r = draft ? createView(d, user, nameText, base) : cloneView(d, user, activeView ?? base, nameText);
    if (!r.ok) { fail(r.reason); return; }
    announce(`Created ${r.view.title}`, `أُنشئت ${r.view.title}`); setNaming(null); setNameText(""); if (draft) stop();
  };
  const doRename = () => {
    if (!activeView) return;
    const r = renameView(d, user, activeView.id, nameText, activeView.revision);
    if (!r.ok) { fail(r.reason, r.conflict); return; }
    announce(`Renamed to ${r.view.title}`, `أعيدت التسمية إلى ${r.view.title}`); setNaming(null); setNameText("");
  };
  const doDelete = () => {
    if (!activeView || !window.confirm(pick(ar, T.confirmDel))) return;
    const r = deleteView(d, user, activeView.id); if (!r.ok) { fail(r.reason); return; }
    announce("Dashboard deleted", "حُذفت اللوحة");
  };
  const doRestore = (rev: number) => {
    if (!activeView) return;
    const r = restoreViewVersion(d, user, activeView.id, rev, activeView.revision);
    if (!r.ok) { fail(r.reason, r.conflict); return; }
    announce(`Restored ${pick(ar, T.rev)} ${rev}`, `استُعيدت المراجعة ${rev}`);
  };
  const reloadLatest = () => { const v = namedViews(d, user).find((x) => x.id === activeView?.id); if (v) { setDraft(v.layout); setStartRev(v.revision); setHistory([]); } setErr(null); setConflict(false); };
  const clear = (scope: "personal" | "Role" | "Global" | "Company") => {
    const r = clearLayout(d, scope, user, roles, scope === "Role" ? (resolved.source.kind === "role" ? resolved.source.role : role) : undefined, undefined, company);
    if (!r.ok) { setErr(r.reason); return; }
    announce("Layout removed", "حُذف التخطيط");
  };

  // block menu: a change in view mode is saved at once as the user's own layout (or into the active named dashboard)
  const live = (items: DesignerItem[], en: string, arText: string) => {
    const next: DesignerLayout = { ...resolved.layout, items };
    const r = activeView ? saveView(d, user, activeView.id, next, activeView.revision) : saveLayout(d, "personal", next, user, roles, undefined, undefined, company);
    if (!r.ok) { fail(r.reason); return; } setErr(null); announce(en, arText);
  };
  const patchItem = (id: string, p: BlockPatch) => {
    const w = byId.get(id); if (!w) return;
    live(resolved.layout.items.map((i) => {
      if (i.id !== id) return i;
      if (p.reset) return { id: i.id, w: w.size.w, ...(w.size.h ? { h: w.size.h } : {}) };
      let n: DesignerItem = { ...i };
      if (p.w) n.w = p.w === 12 ? 12 : Math.min(i.w === 12 ? 6 : i.w, 6) as Width;
      if (p.view !== undefined) { const { view: _v, ...rest } = n; n = p.view ? { ...rest, view: p.view } : rest; }
      if (p.opts) { const o: Record<string, string> = { ...(n.opts ?? {}) }; for (const [k, v] of Object.entries(p.opts)) { if (v) o[k] = v; else delete o[k]; } const { opts: _o, ...rest } = n; n = Object.keys(o).length ? { ...rest, opts: o } : rest; }
      return n;
    }), "Block updated", "حُدّثت الكتلة");
  };
  const moveLive = (id: string, dir: -1 | 1) => { const items = [...resolved.layout.items]; const from = items.findIndex((i) => i.id === id); const to = from + dir; if (from < 0 || to < 0 || to >= items.length) return; const [x] = items.splice(from, 1); items.splice(to, 0, x!); live(items, "Block moved", "نُقلت الكتلة"); };
  const removeLive = (id: string) => { const w = byId.get(id); if (!w || w.required) return; live(resolved.layout.items.filter((i) => i.id !== id), `Removed ${titleOf(w)}`, `أزيلت ${titleOf(w)}`); };
  /** Strip menu: one period / comparison for every indicator tile that can re-read its window. */
  const patchTiles = (ids: string[], opts: Record<string, string | undefined>) => live(resolved.layout.items.map((i) => {
    if (!ids.includes(i.id)) return i; const o: Record<string, string> = { ...(i.opts ?? {}) }; for (const [k, v] of Object.entries(opts)) { if (v) o[k] = v; else delete o[k]; }
    const { opts: _o, ...rest } = i; return Object.keys(o).length ? { ...rest, opts: o } : rest;
  }), "Indicators updated", "حُدّثت المؤشرات");
  const custom = resolved.source.kind !== "default";
  const onKey = (e: React.KeyboardEvent, id: string, idx: number) => {
    const rtl = ar; const k = e.key;
    if (k === "ArrowUp" || (k === "ArrowLeft" && !rtl) || (k === "ArrowRight" && rtl)) { e.preventDefault(); move(id, idx - 1); }
    if (k === "ArrowDown" || (k === "ArrowRight" && !rtl) || (k === "ArrowLeft" && rtl)) { e.preventDefault(); move(id, idx + 1); }
  };

  const body = (w: WidgetDef<C>, it: DesignerItem) => {
    // dashboard filter values first, then the widget's own approved options (an option never overrides a filter key)
    const opts = { ...Object.fromEntries((w.options ?? []).map((o) => [o.key, it.opts?.[o.key] ?? o.default])), ...fvals };
    const view = (it.view as ViewKind | undefined) ?? w.defaultView;
    if (w.render) return w.render(ctx, opts);
    // the app's original renderer knows nothing of dashboard filters: use it only while no dashboard filter is set
    const nativeOnly = !it.opts || Object.keys(it.opts).every((k) => w.options?.find((o) => o.key === k)?.native);
    if (w.renderDefault && view === w.defaultView && nativeOnly && !it.title && !Object.keys(fvals).length) return w.renderDefault(ctx, opts);
    const data = w.data?.(ctx, opts);
    // number widgets are the one Enterprise KPI card (Round 1 §4); the band chips keep reading their figure
    if (data?.kind === "number") return <>
      <KpiWidgetCard d={data} ar={ar} link={link} title={titleOf(w, it)} info={<span className="cursor-help text-xs text-muted-foreground" title={`${pick(ar, w.meaning)} — ${pick(ar, T.sources)}: ${w.sources.join(", ")}`} aria-label={pick(ar, w.meaning)}>ⓘ</span>} attrs={frameClassName ? { "data-frame-class": frameClassName } : undefined} />
      {!editing && <KpiChip k={`${def.id}:${it.id}`} order={shown.findIndex((x) => x.id === it.id)} label={titleOf(w, it)} d={data} link={link} />}
    </>;
    // the Enterprise card frame (Round 1 §5): sub-line, freshness, two-view toggle, footer action with its count
    const allowed = viewsFor(w.shape, w.defaultView, w.views, w.facts).filter((v) => v !== "panel");
    const two = (w.options ?? []).find((o) => !o.hidden && o.choices.length === 2);
    const toggle = allowed.length >= 2
      ? <FrameToggle label={`${ar ? "طريقة العرض" : "View"}: ${titleOf(w, it)}`} active={view} onPick={(v) => patchItem(it.id, { view: v === w.defaultView ? null : (v as ViewKind) })} items={allowed.slice(0, 3).map((v) => ({ id: v, label: pick(ar, VIEW_LABEL[v]) }))} />
      : two ? <FrameToggle label={`${pick(ar, two.label)}: ${titleOf(w, it)}`} active={it.opts?.[two.key] ?? two.default} onPick={(v) => patchItem(it.id, { opts: { [two.key]: v === two.default ? undefined : v } })} items={two.choices.map((c) => ({ id: c.value, label: pick(ar, c.label) }))} /> : null;
    const n = data?.kind === "series" ? (data.points.some((p) => p.count !== undefined) ? data.points.reduce((t, p) => t + (p.count ?? 0), 0) : data.points.length) : data?.kind === "rows" ? (data.total ?? data.rows.length) : undefined;
    const action = data?.drill && link ? link(data.drill, <>{ar ? "عرض" : "View"} {titleOf(w, it)}{n !== undefined ? <> · <bdi data-no-i18n>{n.toLocaleString("en-US")}</bdi></> : null} <span aria-hidden className="rtl:rotate-180 inline-block">→</span></>, { className: "r1-card-action", "data-r1-action": it.id }) : null;
    return (
      <section className={`panel flex h-full flex-col p-4 ${frameClassName ?? ""}`} data-dash-frame data-r1-card {...(data ? { "data-dash-kind": data.kind } : {})}>
        <header className="mb-1 flex items-start gap-2">
          <h3 className="r1-card-title min-w-0 flex-1 text-sm font-semibold">{titleOf(w, it)}</h3>
          <span className="cursor-help text-xs text-muted-foreground" title={`${pick(ar, w.meaning)} — ${pick(ar, T.sources)}: ${w.sources.join(", ")}`} aria-label={pick(ar, w.meaning)}>ⓘ</span>
        </header>
        <FrameSub sub={pick(ar, w.meaning)} fresh={freshOf(frameSources(def.app, w.sources, []), ar)} toggle={toggle} />
        {data ? <div className="mt-2 min-w-0 flex-1"><WidgetView data={data} view={view} ar={ar} link={link} cross={cross} /></div> : null}
        {data ? <ChartFoot data={data} ar={ar} on={today()} /> : null}
        {action && <FrameAction>{action}</FrameAction>}
      </section>
    );
  };

  const pickView = (id: string) => { const r = activateView(d, user, id || null); if (!r.ok) fail(r.reason); else { setErr(null); announce(id ? "Dashboard switched" : "Shared layout", id ? "تم تبديل اللوحة" : "التخطيط المشترك"); } };
  const nameForm = naming && (
    <form className="flex w-full flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (naming === "rename") doRename(); else saveAsNew(); }} data-dash-naming={naming}>
      <label className="sr-only" htmlFor={`dash-name-${def.id}`}>{pick(ar, T.name)}</label>
      <input id={`dash-name-${def.id}`} className="field-input min-h-11 w-64 max-w-full" value={nameText} maxLength={60} autoFocus placeholder={pick(ar, T.name)} onChange={(e) => setNameText(e.target.value)} data-dash-name />
      <button type="submit" className="btn-primary min-h-11" data-dash-name-ok>{pick(ar, T.ok)}</button>
      <button type="button" className="btn-ghost min-h-11" onClick={() => { setNaming(null); setNameText(""); }}>{pick(ar, T.cancel)}</button>
    </form>
  );
  const quietBar = bandEdit && !views.length && resolved.source.kind !== "personal" && !nameForm && !err;
  const viewBar = !editing && !quietBar && (
    <div className="mb-2 flex flex-wrap items-center justify-end gap-2 text-xs" data-dash-bar>
      {views.length > 0 && (
        <label className="flex items-center gap-1">
          <span className="text-muted-foreground">{pick(ar, T.dashboards)}</span>
          <select className="field-input min-h-9 w-auto py-1 text-xs" value={activeView?.id ?? ""} onChange={(e) => pickView(e.target.value)} data-dash-views>
            <option value="">{pick(ar, T.shared)}</option>
            {views.map((v) => <option key={v.id} value={v.id} data-no-i18n>{v.title}</option>)}
          </select>
        </label>
      )}
      <span className="text-muted-foreground" data-dash-source-label>{sourceLabel(ar, resolved.source)}</span>
      {activeView && <>
        <button type="button" className="btn-ghost min-h-9 text-xs" onClick={() => { setNaming("rename"); setNameText(activeView.title); }} data-dash-rename>{pick(ar, T.renameIt)}</button>
        <button type="button" className="btn-ghost min-h-9 text-xs" onClick={() => { setNaming("new"); setNameText(`${activeView.title} (2)`); }} data-dash-clone>{pick(ar, T.cloneIt)}</button>
        <VersionsMenu ar={ar} view={activeView} onRestore={doRestore} />
        <button type="button" className="btn-ghost min-h-9 text-xs text-destructive" onClick={doDelete} data-dash-delete>{pick(ar, T.deleteIt)}</button>
      </>}
      {resolved.source.kind === "personal" && <button type="button" className="btn-ghost min-h-9 text-xs" onClick={() => clear("personal")} data-dash-reset>{pick(ar, T.resetMine)}</button>}
      {!bandEdit && <button type="button" className="btn-ghost min-h-9 text-xs" onClick={start} data-dash-edit>✎ {pick(ar, T.customize)}</button>}
      {nameForm}
      {err && <p role="alert" className="w-full rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-dash-error>{pick(ar, err)}</p>}
    </div>
  );
  const filterBar = def.filters?.length ? (
    <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-2" role="group" aria-label={pick(ar, T.filters)} data-dash-filters>
      {def.filters.map((f) => { const choices = (() => { try { return f.choices(ctx); } catch { return []; } })(); return (
        <label key={f.key} className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted-foreground">{pick(ar, f.label)}</span>
          <select className="field-input min-h-11 w-auto min-w-40 py-1 text-sm" value={fvals[f.key] ?? ""} onChange={(e) => setF({ ...fvals, [f.key]: e.target.value })} data-dash-filter={f.key}>
            <option value="">{pick(ar, T.allF)}</option>
            {choices.map((c) => <option key={c.value} value={c.value} {...(c.data ? { "data-no-i18n": "" } : {})}>{c.label}</option>)}
          </select>
        </label>
      ); })}
      {Object.keys(fvals).length > 0 && <button type="button" className="btn-ghost min-h-11 text-xs" onClick={() => setF({})} data-dash-filters-clear>{pick(ar, T.clearF)}</button>}
    </div>
  ) : null;

  if (!editing && !custom && fallback !== undefined) {
    return (
      <div ref={rootRef} className={className} data-dash={`${def.app}:${def.id}`} data-dash-source="default">
        {viewBar}
        {fallback}
      </div>
    );
  }

  const absent = (w: WidgetDef<C>) => { try { return !!w.absent?.(ctx); } catch { return true; } };
  const shown = layout.items.filter((i) => byId.has(i.id) && !absent(byId.get(i.id)!));
  // a KPI widget in its own default tile view joins the page's one indicator row (see `strip`)
  const isTile = (it: DesignerItem) => { const w = byId.get(it.id); return !!w && w.defaultView === "kpi" && ((it.view as ViewKind | undefined) ?? w.defaultView) === "kpi" && readable(w); };
  const missing = def.widgets.filter((w) => !layout.items.some((i) => i.id === w.id) && readable(w) && !absent(w));
  return (
    <div ref={rootRef} className={className} data-dash={`${def.app}:${def.id}`} data-dash-source={resolved.source.kind} data-dash-editing={editing ? "1" : undefined}>
      <p className="sr-only" aria-live="polite" data-dash-live>{msg}</p>
      {viewBar}
      {filterBar}
      {editing && (
        <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 shadow-sm" role="toolbar" aria-label={pick(ar, T.customize)} data-dash-toolbar>
          <button type="button" className="btn-ghost min-h-11" onClick={() => setCatalog((x) => !x)} aria-expanded={catalog} data-dash-add>＋ {pick(ar, T.add)}</button>
          <button type="button" className="btn-ghost min-h-11" onClick={() => { const prev = history[history.length - 1]; if (prev) { setDraft(prev); setHistory((h) => h.slice(0, -1)); } }} disabled={!history.length} data-dash-undo>↶ {pick(ar, T.undo)}</button>
          <button type="button" className="btn-ghost min-h-11" onClick={() => change(defaultLayout(d))} data-dash-restore>{pick(ar, T.restore)}</button>
          <button type="button" className="btn-ghost min-h-11" onClick={() => setPreviewing((x) => !x)} aria-pressed={previewing} data-dash-preview>{pick(ar, previewing ? T.edit : T.preview)}</button>
          {dirty && <span className="chip bg-warning/15 text-warning-text" data-dash-dirty>{pick(ar, T.unsaved)}</span>}
          <span className="ms-auto flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost min-h-11" onClick={stop} data-dash-cancel>{pick(ar, T.cancel)}</button>
            <button type="button" className="btn-primary min-h-11" onClick={() => save("personal")} data-dash-save="personal">{pick(ar, T.saveMe)}</button>
            {roleChoices.length > 0 && (
              <span className="flex items-center gap-1">
                <label className="sr-only" htmlFor={`dash-role-${def.id}`}>{pick(ar, T.role)}</label>
                <select id={`dash-role-${def.id}`} className="field-input min-h-11 w-auto" value={role || roleChoices[0]} onChange={(e) => setRole(e.target.value)} data-dash-role data-no-i18n>
                  {roleChoices.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button type="button" className="btn-ghost min-h-11" onClick={() => save("Role")} disabled={!canRole.ok} title={canRole.ok ? undefined : pick(ar, canRole.reason)} data-dash-save="role">{pick(ar, T.saveRole)}</button>
              </span>
            )}
            {company && <button type="button" className="btn-ghost min-h-11" onClick={() => save("Company")} disabled={!canCompany.ok} title={canCompany.ok ? undefined : pick(ar, canCompany.reason)} data-dash-save="company">{pick(ar, T.saveCompany)}</button>}
            <button type="button" className="btn-ghost min-h-11" onClick={() => save("Global")} disabled={!canGlobal.ok} title={canGlobal.ok ? undefined : pick(ar, canGlobal.reason)} data-dash-save="global">{pick(ar, T.saveGlobal)}</button>
            <button type="button" className="btn-ghost min-h-11" onClick={() => { setNaming("new"); setNameText(""); }} data-dash-save="new">{pick(ar, T.saveAs)}</button>
          </span>
          {(resolved.source.kind === "role" && canManage(d, "Role", user, roles, resolved.source.role).ok) && <button type="button" className="btn-ghost min-h-11 text-xs" onClick={() => clear("Role")} data-dash-clear="role">{pick(ar, T.clearRole)}</button>}
          {(canCompany.ok && resolved.source.kind === "company") && <button type="button" className="btn-ghost min-h-11 text-xs" onClick={() => clear("Company")} data-dash-clear="company">{pick(ar, T.clearCompany)}</button>}
          {(canGlobal.ok && resolved.source.kind === "global") && <button type="button" className="btn-ghost min-h-11 text-xs" onClick={() => clear("Global")} data-dash-clear="global">{pick(ar, T.clearGlobal)}</button>}
          {nameForm}
          {err && <p role="alert" className="w-full rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-dash-error>{pick(ar, err)}{conflict && <button type="button" className="btn-ghost ms-2 min-h-9 text-xs" onClick={reloadLatest} data-dash-reload>{pick(ar, T.reload)}</button>}</p>}
        </div>
      )}
      {editing && catalog && (
        <section className="panel mb-3 p-3" aria-label={pick(ar, T.catalog)} data-dash-catalog>
          <header className="mb-2 flex items-center gap-2"><h3 className="text-sm font-semibold">{pick(ar, T.catalog)}</h3><button type="button" className="btn-ghost ms-auto min-h-11" onClick={() => setCatalog(false)}>{pick(ar, T.close)}</button></header>
          {missing.length ? (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {missing.map((w) => (
                <li key={w.id} className="flex flex-col gap-1 rounded-md border border-border p-2" data-dash-catalog-item={w.id}>
                  <span className="text-sm font-medium">{pick(ar, w.title)}</span>
                  <span className="text-xs text-muted-foreground">{pick(ar, w.meaning)}</span>
                  <span className="text-[11px] text-muted-foreground">{pick(ar, VIEW_LABEL[w.defaultView])} · {w.size.w}/12{w.group ? ` · ${pick(ar, w.group)}` : ""}</span>
                  <button type="button" className="btn-ghost mt-1 min-h-11 self-start" onClick={() => add(w.id)} data-dash-catalog-add={w.id}>＋ {pick(ar, T.add)}</button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">{pick(ar, T.noMore)}</p>}
        </section>
      )}
      {addSlot && !editing && err && <p role="alert" className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-dash-error>{pick(ar, err)}</p>}
      <AddSlotProvider value={addSlot && !editing ? { items: missing.map((w) => ({ id: w.id, title: pick(ar, w.title), meaning: pick(ar, w.meaning) !== pick(ar, w.title) ? pick(ar, w.meaning) : undefined })), add: quickAdd, customize: start, owner: slotOwner } : null}>
      <div className="grid grid-cols-12 gap-4" data-dash-grid>
        {strip && !editing && !shown.some(isTile) && <div className="col-span-12" data-dash-kpi-strip><KpiStrip id={def.id} ar={ar} tagAttr={strip.tagAttr} flat={strip.flat} items={[...(strip.before ?? []), ...(strip.after ?? [])]} />{strip.note}</div>}
        {shown.map((it, idx) => {
          const w = byId.get(it.id)!;
          if (strip && !editing && isTile(it)) {
            if (shown.find(isTile) !== it) return null;
            const tileIts = shown.filter(isTile);
            const optsOf = (x: DesignerItem) => { const tw = byId.get(x.id)!; return { ...Object.fromEntries((tw.options ?? []).map((o) => [o.key, x.opts?.[o.key] ?? o.default])) } as Record<string, string>; };
            const tiles: StripItem[] = tileIts.map((x) => ({ key: x.id, empty: strip.empty?.(x.id), score: strip.score?.(x.id, optsOf(x)), node: <WidgetBoundary key={x.id} fallback={null}>{body(byId.get(x.id)!, x)}</WidgetBoundary> }));
            const periodic = tileIts.filter((x) => byId.get(x.id)!.options?.some((o) => o.key === "per"));
            const lead = periodic[0]; const label = lead ? blockLabel(lead.opts ?? {}, ar) : "";
            return <div key="kpi-strip" className="dash-block col-span-12" data-dash-kpi-strip>
              {lead && <div className="dash-block-tools">{label && <span className="dash-per-chip" data-dash-per-chip>{label}</span>}
                <BlockMenu w={{ ...byId.get(lead.id)!, id: "kpi-strip", required: true }} it={{ ...lead, id: "kpi-strip", w: 12 }} ar={ar} views={[]} first last noSize label={ar ? "المؤشرات الرئيسية" : "Key figures"}
                  onPatch={(p) => { if (p.reset) patchTiles(periodic.map((x) => x.id), { per: undefined, pfrom: undefined, pto: undefined, pcmp: undefined }); else if (p.opts) patchTiles(periodic.map((x) => x.id), p.opts); }} /></div>}
              <KpiStrip id={def.id} ar={ar} tagAttr={strip.tagAttr} flat={strip.flat} items={[...(strip.before ?? []), ...tiles, ...(strip.after ?? [])]} />{strip.note}</div>;
          }
          // an unreadable widget keeps its place and states why it is empty (never a fake zero, never silently gone)
          const ok = readable(w);
          const views = viewsFor(w.shape, w.defaultView, w.views, w.facts);
          const view = (it.view as ViewKind | undefined) ?? w.defaultView;
          const controls = editing && !previewing;
          return (
            <div key={it.id} className={`dash-block ${SPAN[(WIDTHS.includes(it.w as Width) ? it.w : w.size.w) as Width]} ${HEIGHT[it.h ?? 1] ?? ""} min-w-0 ${controls ? "rounded-lg outline-dashed outline-1 outline-offset-4 outline-border" : ""}`}
              role="group" aria-label={titleOf(w, it)} data-dash-widget={it.id} data-dash-shape={w.shape} data-dash-view-active={view} data-dash-w={it.w}
              onDragOver={controls ? (e) => { if (dragId.current && dragId.current !== it.id) e.preventDefault(); } : undefined}
              onDrop={controls ? (e) => { e.preventDefault(); const from = dragId.current; dragId.current = null; if (from && from !== it.id) move(from, idx); } : undefined}>
              {controls && (
                <div className="mb-2 flex flex-wrap items-center gap-1 rounded-md bg-muted/60 p-1 text-xs" data-dash-controls={it.id}>
                  <button type="button" draggable onDragStart={(e) => { dragId.current = it.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", it.id); }} onKeyDown={(e) => onKey(e, it.id, idx)}
                    className="btn-ghost min-h-11 min-w-11 cursor-grab justify-center px-2" aria-label={`${pick(ar, T.drag)}: ${titleOf(w, it)}`} title={pick(ar, T.drag)} data-dash-handle>⠿</button>
                  <button type="button" className="btn-ghost min-h-11 min-w-11 justify-center px-2" onClick={() => move(it.id, idx - 1)} disabled={idx === 0} aria-label={`${pick(ar, T.earlier)}: ${titleOf(w, it)}`} data-dash-move="earlier"><span className="rtl:rotate-180" aria-hidden>←</span></button>
                  <button type="button" className="btn-ghost min-h-11 min-w-11 justify-center px-2" onClick={() => move(it.id, idx + 1)} disabled={idx === shown.length - 1} aria-label={`${pick(ar, T.later)}: ${titleOf(w, it)}`} data-dash-move="later"><span className="rtl:rotate-180" aria-hidden>→</span></button>
                  <button type="button" className="btn-ghost min-h-11 min-w-11 justify-center px-2" onClick={() => resize(it.id, -1)} disabled={it.w <= (w.minW ?? 3)} aria-label={`${pick(ar, T.smaller)}: ${titleOf(w, it)}`} data-dash-size="-">−</button>
                  <span className="tabular-nums text-muted-foreground" aria-label={pick(ar, T.size)} data-no-i18n>{it.w}/12</span>
                  <button type="button" className="btn-ghost min-h-11 min-w-11 justify-center px-2" onClick={() => resize(it.id, 1)} disabled={it.w >= 12} aria-label={`${pick(ar, T.wider)}: ${titleOf(w, it)}`} data-dash-size="+">+</button>
                  {w.shape !== "panel" && (
                    <ViewPicker ar={ar} current={view} allowed={views} onPick={(v) => setView(it.id, v)} label={`${pick(ar, T.view)}: ${titleOf(w, it)}`} id={it.id} />
                  )}
                  {(w.options ?? []).filter((o) => !o.hidden).map((o) => (
                    <label key={o.key} className="flex items-center gap-1">
                      <span className="text-muted-foreground">{pick(ar, o.label)}</span>
                      <select className="field-input min-h-11 w-auto py-1 text-xs" value={it.opts?.[o.key] ?? o.default} onChange={(e) => setOpt(it.id, o.key, e.target.value)} data-dash-opt={o.key}>
                        {o.choices.map((c) => <option key={c.value} value={c.value}>{pick(ar, c.label)}</option>)}
                      </select>
                    </label>
                  ))}
                  {w.shape !== "panel" && (
                    <label className="flex min-w-[8rem] flex-1 items-center gap-1">
                      <span className="sr-only">{pick(ar, T.rename)}</span>
                      <input className="field-input min-h-11 py-1 text-xs" value={it.title ?? ""} placeholder={pick(ar, w.title)} onChange={(e) => setTitle(it.id, e.target.value)} aria-label={`${pick(ar, T.rename)}: ${pick(ar, w.title)}`} data-dash-title />
                    </label>
                  )}
                  {w.required
                    ? <span className="px-1 text-muted-foreground" title={pick(ar, T.required)} aria-label={pick(ar, T.required)} data-dash-required>🔒</span>
                    : <button type="button" className="btn-ghost min-h-11 px-2 text-destructive" onClick={() => remove(it.id)} aria-label={`${pick(ar, T.remove)}: ${titleOf(w, it)}`} data-dash-remove>✕ {pick(ar, T.remove)}</button>}
                </div>
              )}
              {!editing && ok && <div className="dash-block-tools">
                {w.options?.some((o) => o.key === "per") && w.shape !== "number" /* a KPI card keeps its own header; its period stays in the ⋯ menu */
                  ? <FramePeriod value={it.opts?.["per"] ?? ""} opts={it.opts ?? {}} ar={ar} label={titleOf(w, it)} onPick={(v) => { if (v === "custom") { patchItem(it.id, { opts: { per: "custom", pfrom: undefined } }); setMenuAsk((m) => ({ ...m, [it.id]: (m[it.id] ?? 0) + 1 })); } else patchItem(it.id, { opts: { per: v || undefined, pfrom: undefined, pto: undefined } }); }} />
                  : blockLabel(it.opts ?? {}, ar) && <span className="dash-per-chip" data-dash-per-chip>{blockLabel(it.opts ?? {}, ar)}</span>}
                <BlockMenu w={w} it={it} ar={ar} views={w.shape === "panel" ? [] : views} first={idx === 0} last={idx === shown.length - 1} label={titleOf(w, it)} openSignal={menuAsk[it.id]}
                  onPatch={(p) => patchItem(it.id, p)} onMove={(dir) => moveLive(it.id, dir)} onRemove={() => removeLive(it.id)}
                  onExport={(kind) => { const el = document.querySelector(`[data-dash-widget="${CSS.escape(it.id)}"]`); if (kind === "png") void exportPng(el, titleOf(w, it)).then((done) => { if (!done) exportExcel(titleOf(w, it), cardRows(w.data?.(ctx, { ...(it.opts ?? {}), ...fvals } as Record<string, string>), el, ar)); }); else exportExcel(titleOf(w, it), cardRows(w.data?.(ctx, { ...(it.opts ?? {}), ...fvals } as Record<string, string>), el, ar)); }} />
              </div>}
              {ok
                ? <WidgetBoundary fallback={<section className="panel p-4 text-sm text-muted-foreground" data-dash-failed>{pick(ar, T.failed)}</section>}><FrameCtx.Provider value={{ fresh: freshOf(frameSources(def.app, w.sources, []), ar) }}>{body(w, it)}</FrameCtx.Provider></WidgetBoundary>
                : <section className="panel p-4 text-sm text-muted-foreground" data-dash-denied>{titleOf(w, it)} — {pick(ar, T.noPerm)}</section>}
            </div>
          );
        })}
      </div>
      </AddSlotProvider>
    </div>
  );
}

function VersionsMenu({ ar, view, onRestore }: { ar: boolean; view: NamedView; onRestore: (rev: number) => void }) {
  const [open, setOpen] = useState(false);
  const older = [...view.versions].reverse().filter((v) => v.revision !== view.revision || !sameLayout(v.layout, view.layout));
  return (
    <span className="relative">
      <button type="button" className="btn-ghost min-h-9 text-xs" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((x) => !x)} data-dash-versions>{pick(ar, T.versions)} <span className="tabular-nums" data-no-i18n>({view.versions.length})</span> ▾</button>
      {open && (
        <span role="menu" className="absolute end-0 top-full z-30 mt-1 grid w-64 gap-0.5 rounded-md border border-border bg-popover p-1 shadow-lg" data-dash-versions-menu>
          {older.length ? older.map((v) => (
            <span key={v.revision} className="flex items-center gap-2 rounded px-2 py-1 text-xs">
              <span className="min-w-0 flex-1 tabular-nums" data-no-i18n>#{v.revision} · {v.savedAt.slice(0, 16).replace("T", " ")}</span>
              <button type="button" role="menuitem" className="btn-ghost min-h-9 text-xs" onClick={() => { onRestore(v.revision); setOpen(false); }} data-dash-restore-version={v.revision}>{pick(ar, T.restoreV)}</button>
            </span>
          )) : <span className="px-2 py-1 text-xs text-muted-foreground">{ar ? "لا توجد نسخ سابقة" : "No earlier versions"}</span>}
        </span>
      )}
    </span>
  );
}

function ViewPicker({ ar, current, allowed, onPick, label, id }: { ar: boolean; current: ViewKind; allowed: ViewKind[]; onPick: (v: ViewKind) => void; label: string; id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button type="button" className="btn-ghost min-h-11 px-2" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((x) => !x)} aria-label={label} data-dash-view-btn={id}>
        {pick(ar, VIEW_LABEL[current])} ▾
      </button>
      {open && (
        <span role="menu" className="absolute start-0 top-full z-30 mt-1 grid w-56 gap-0.5 rounded-md border border-border bg-popover p-1 shadow-lg" data-dash-view-menu={id}>
          {[...allowed, ...VIEW_KINDS.filter((v) => !allowed.includes(v))].filter((v) => v !== "panel").map((v) => {
            const ok = allowed.includes(v);
            return (
              <button key={v} type="button" role="menuitemradio" aria-checked={v === current} onClick={() => { onPick(v); setOpen(false); }}
                className={`min-h-9 rounded px-2 text-start text-xs ${v === current ? "bg-primary/10 font-semibold" : "hover:bg-muted"} ${ok ? "" : "text-muted-foreground"}`} data-dash-view-opt={v} data-dash-view-ok={ok ? "1" : "0"}>
                {pick(ar, VIEW_LABEL[v])}{ok ? "" : " ⊘"}
              </button>
            );
          })}
        </span>
      )}
    </span>
  );
}
