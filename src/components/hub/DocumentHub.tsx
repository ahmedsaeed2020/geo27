/**
 * Native ERPNext document hub (DIGIT-CORE-PRO-UX-006 §6) — Core presentation shared by every DIGIT app workspace.
 *
 * Regions: A quick access counters → B business-process groups (source-classified by src/lib/hub.ts) → C operational
 * workbench (searchable, filterable native register) → D Document 360 drawer (header, child rows, source and downstream
 * documents through src/lib/relations.ts, ledger rows, attachments/comments, actions) → E report shortcuts (reports
 * group + a link to the workspace's full reports). The host app supplies the entries, counters, links (so its own
 * context/breadcrumb rules apply) and permission checks; every destination is a native list, form, report or page.
 * State (register, search, status, open document) lives in the URL through `state`/`onState`, so Back restores it.
 */
import { OverdueTag, StatusStrip } from "@/components/enterprise/StatusStrip";
import { peekRow } from "@/components/enterprise/QuickView";
import { INTERACTIVE as ROW_INTERACTIVE } from "@/components/enterprise/rowLink";
import { inStripTab, overdueDays, stripTabs } from "@/lib/statusStrip";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { cachedMeta, dashboardsQuery, ensureMetas, indexQuery, metaQuery, TABLE_TYPES, type DocTypeMeta } from "@/lib/catalog";
import type { Filter } from "@/lib/desk";
import { HUB_GROUPS, type Bi, type HubEntry, type HubModel } from "@/lib/hub";
import { connectionCount, connectionGroups, outgoingLinks, relationCount, reverseLinksFor, reverseLinksQuery } from "@/lib/relations";
import { scopedGet, scopedList } from "@/lib/scope";
import { ApprovalDrawer, BulkBar, DecisionMenu, MinePill, type QueueCan, type QueueDecision } from "@/components/enterprise/kit/ApprovalQueue";
import { toast } from "sonner";
import { getSettings, setSettings, useSettings, type RegisterView } from "@/lib/userSettings";
import { deleteView, viewsFor, type SharedView } from "@/lib/sharedViews";
import { SaveShareDialog, ViewChip } from "@/components/enterprise/SaveShareView";
import { Open360 } from "@/components/enterprise/Open360";
import { PROFILES_360 } from "@/lib/coreShared/profile360";

export type HubLink =
  | { kind: "list"; doctype: string; filters?: Filter[] | undefined; view?: "report" | undefined }
  | { kind: "doc"; doctype: string; name: string }
  | { kind: "new"; doctype: string }
  | { kind: "report"; report: string }
  | { kind: "page"; page: string }
  | { kind: "app"; key: string }
  | { kind: "print"; doctype: string; name: string };
export type HubAccess = "ok" | "denied" | "unavailable" | "loading";
export interface QuickTile { id: string; label: Bi; hint: Bi; doctype: string; status: "ok" | "empty" | "denied" | "unavailable"; count: number; filters: Filter[]; tone?: "risk" | "action" | "info" | undefined; canCreate: boolean }
/** `v`: standard / saved register view (all · mine · waiting · overdue · saved:<id>); `g`: group-by field. */
export interface HubState { dt?: string | undefined; q?: string | undefined; st?: string | undefined; doc?: string | undefined; v?: string | undefined; g?: string | undefined }
/**
 * Optional richer registers (the host opts in; hosts without it keep the plain register): standard views All / Mine /
 * Waiting on me / Overdue with counts, the user's own saved views, group by status / project, document age and project.
 */
export interface RegisterViewsSpec {
  /** a document waiting for a decision the session user may take now */
  waitingOnMe: (doctype: string, d: Doc) => boolean;
  /** a document whose due date has passed and that is not closed */
  overdue: (doctype: string, d: Doc) => boolean;
  /** display of a group value (e.g. a project's title); defaults to the stored value */
  groupLabel?: ((field: string, value: string) => ReactNode) | undefined;
}
/** An extra register column supplied by the host (approval / payment / payout statuses, a per-row distribution bar …). */
export interface HubColumn { key: string; label: Bi; cell: (d: Doc) => ReactNode; end?: boolean | undefined; /** the approval column: the «awaiting your approval» pill is drawn in it for the current approver */ approval?: boolean | undefined }
/**
 * Opt-in approval queue on a register (Construction phase 4 C4-04): separate status columns, the current approver's
 * decision menu (اعتمد + رفض / طلب تعديل) and decision drawer (comment + attachments), and the «تحتاج مراجعة» view with
 * bulk approve. The host decides who may decide and applies the decision (its own workflow and rules); registers whose
 * `columns` are empty keep the plain register.
 */
export interface HubApprovalsSpec {
  columns: (doctype: string) => HubColumn[];
  /** decisions the session user may take now (current approver only, never the document's owner) */
  can: (doctype: string, d: Doc) => QueueCan;
  /** applies one decision with its comment and attachments; returns errors (empty = done) */
  decide: (doctype: string, d: Doc, decision: QueueDecision, comment: string, files: File[]) => string[];
  /** shown once above the register (e.g. the legend of a row bar) */
  legend?: ((doctype: string) => ReactNode) | undefined;
  /** the drawer's summary of one document */
  summary?: ((doctype: string, d: Doc) => ReactNode) | undefined;
}
const anyCan = (c: QueueCan) => !!(c.approve || c.reject || c.changes);
export interface DocumentHubProps {
  ar: boolean;
  model: HubModel;
  quick: QuickTile[];
  registers: string[];
  company?: string | undefined;
  user: string;
  state: HubState;
  onState: (p: Partial<HubState>) => void;
  link: (to: HubLink, children: ReactNode, attrs?: Record<string, string>) => ReactNode;
  access: (e: HubEntry) => HubAccess;
  canCreate: (doctype: string) => boolean;
  /** Display of a DocType / report / label in the active language. */
  label: (text: string) => ReactNode;
  reportsLink?: ReactNode;
  /** Host content kept between quick access and the process groups (e.g. the app's existing register cards). */
  afterQuick?: ReactNode;
  /** Optional host tag for an entry (e.g. the app's placement ids), rendered as data-hub-tag; never changes behaviour. */
  entryTag?: ((e: HubEntry) => string | undefined) | undefined;
  /** opt-in register views (see RegisterViewsSpec) */
  views?: RegisterViewsSpec | undefined;
  /** opt-in approval queue (see HubApprovalsSpec) */
  approvals?: HubApprovalsSpec | undefined;
  /** display title of a register row (e.g. the party's name instead of its code); defaults to the title / party field */
  rowTitle?: ((doctype: string, d: Doc) => string | undefined) | undefined;
}

const pick = (ar: boolean, b: Bi) => (ar ? b[1] : b[0]);
const T = {
  quick: ["Quick access", "وصول سريع"], groups: ["Documents by business process", "المستندات حسب العملية"], workbench: ["Operational workbench", "منضدة العمل التشغيلية"],
  open: ["Open", "فتح"], list: ["List", "القائمة"], report: ["Report view", "عرض التقرير"], newDoc: ["New", "جديد"], showAll: ["Show all", "عرض الكل"], showLess: ["Show less", "عرض أقل"],
  denied: ["Not permitted", "غير مسموح"], unavailable: ["Not available", "غير متاح"], loading: ["Checking access…", "جارٍ التحقق من الصلاحية…"],
  search: ["Search number, name or title", "ابحث بالرقم أو الاسم أو العنوان"], status: ["Status", "الحالة"], all: ["All", "الكل"], draft: ["Draft", "مسودة"], submitted: ["Submitted", "معتمد"], cancelled: ["Cancelled", "ملغى"],
  rows: ["records", "سجل"], more: ["Show more", "عرض المزيد"], inList: ["Open these records in the native list", "فتح هذه السجلات في القائمة الأصلية"], noRows: ["No records match these filters.", "لا توجد سجلات مطابقة لهذه المرشحات."],
  number: ["Number", "الرقم"], title: ["Title / party", "العنوان / الطرف"], date: ["Date", "التاريخ"], amount: ["Amount", "المبلغ"], modified: ["Last change", "آخر تعديل"],
  d360: ["Document 360", "المستند 360"], close: ["Close", "إغلاق"], openForm: ["Open full form", "فتح النموذج الكامل"], print: ["Print", "طباعة"],
  sources: ["Source documents", "المستندات المصدر"], downstream: ["Related documents", "المستندات المرتبطة"], ledger: ["Ledger rows", "قيود الدفاتر"], items: ["Rows", "البنود"],
  activity: ["Attachments & comments", "المرفقات والتعليقات"], attachments: ["Attachments", "المرفقات"], comments: ["Comments", "التعليقات"], none: ["None", "لا يوجد"],
  limited: ["Limited to records you can see", "يقتصر على السجلات المسموح لك برؤيتها"], fullReports: ["All reports of this workspace", "كل تقارير مساحة العمل"],
  company: ["Company", "الشركة"], owner: ["Created by", "أنشأه"], notFound: ["This document is not available or you cannot read it.", "هذا المستند غير متاح أو لا يمكنك قراءته."],
  vAll: ["All", "الكل"], vMine: ["Mine", "مستنداتي"], vWaiting: ["Waiting on me", "بانتظاري"], vOverdue: ["Overdue", "متأخرة"], vReview: ["Needs review", "تحتاج مراجعة"], views: ["Views", "العروض"],
  decision: ["Decision", "القرار"], select: ["Select", "تحديد"], approveSel: ["Approve selected", "اعتماد المحدد"],
  saveView: ["Save view", "حفظ العرض"], viewName: ["View name", "اسم العرض"], removeView: ["Remove view", "حذف العرض"], groupBy: ["Group by", "التجميع حسب"], noGroup: ["No grouping", "بدون تجميع"],
  project: ["Project", "المشروع"], age: ["Age", "العمر"], days: ["d", "يوم"], none_: ["(none)", "(بدون)"],
} satisfies Record<string, Bi>;

const TITLE_FIELDS = ["title", "customer_name", "supplier_name", "party_name", "item_name", "asset_name", "employee_name", "account_name", "bank_account_no", "warehouse_name", "price_list_name", "party", "customer", "supplier", "item_code"];
const DATE_FIELDS = ["posting_date", "transaction_date", "schedule_date", "available_for_use_date", "date", "creation"];
const AMOUNT_FIELDS = ["grand_total", "rounded_total", "total", "paid_amount", "total_debit", "net_amount", "price_list_rate", "gross_purchase_amount", "value_after_depreciation"];
const titleOf = (m: DocTypeMeta | undefined, d: Doc) => { const tf = m?.title_field; const v = (tf && d[tf]) || TITLE_FIELDS.map((f) => d[f]).find((x) => typeof x === "string" && x && x !== d.name); return typeof v === "string" ? v : ""; };
const dateOf = (d: Doc) => { for (const f of DATE_FIELDS) { const v = d[f]; if (typeof v === "string" && v) return v.slice(0, 10); } return ""; };
/** The row amount: a standard total field first, else the DocType's own first list-view Currency field (e.g. a variation's `amount`), so no row shows "—" while the totals above it have a value. */
const amountFieldsOf = (m: DocTypeMeta | undefined) => { const cur = (m?.fields ?? []).filter((f) => f.fieldtype === "Currency" && f.fieldname && !AMOUNT_FIELDS.includes(f.fieldname)); return [...AMOUNT_FIELDS, ...cur.filter((f) => f.in_list_view).map((f) => f.fieldname as string), ...cur.filter((f) => !f.in_list_view).map((f) => f.fieldname as string)]; };
export const hubRowAmount = (d: Doc, m?: DocTypeMeta): { v: number; cur: string } | null => { for (const f of amountFieldsOf(m)) { const v = d[f]; if (typeof v === "number" || (typeof v === "string" && v !== "" && !isNaN(Number(v)))) return { v: Number(v), cur: String(d["currency"] ?? d["paid_from_account_currency"] ?? d["company_currency"] ?? "") }; } return null; };
const fmtNum = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** A master that is never submitted (Department, Designation, Branch …) has no Draft state: it reads Enabled / Disabled
 *  from its own disabled/enabled check, as the Frappe list indicator does, instead of a misleading «Draft». */
const isMaster = (m: DocTypeMeta | undefined) => !!m && !m.is_submittable;
const offOf = (d: Doc) => Number(d["disabled"] ?? 0) === 1 || d["enabled"] === 0 || d["enabled"] === "0";
const statusOf = (d: Doc, m?: DocTypeMeta) => (typeof d["status"] === "string" && d["status"] ? String(d["status"]) : isMaster(m) ? (offOf(d) ? "Disabled" : "Enabled") : d.docstatus === 1 ? "Submitted" : d.docstatus === 2 ? "Cancelled" : "Draft");
/** Whether a register row belongs to a standard view (all · mine · waiting · overdue); no spec or an unknown view keeps every row. */
export function registerViewMatch(spec: RegisterViewsSpec | undefined, view: string | undefined, doctype: string, d: Doc, user: string): boolean {
  if (!spec || !view || view === "all") return true;
  if (view === "mine") return d["owner"] === user;
  if (view === "waiting") return spec.waitingOnMe(doctype, d);
  if (view === "overdue") return spec.overdue(doctype, d);
  return true;
}
/** Days since the document's own date (or creation) — the document age column. */
const ageOf = (d: Doc, today = new Date().toISOString().slice(0, 10)) => { const v = dateOf(d) || String(d["creation"] ?? "").slice(0, 10); return v ? Math.max(0, Math.round((Date.parse(today) - Date.parse(v)) / 86400000)) : null; };
const toneOf = (d: Doc, m?: DocTypeMeta) => (isMaster(m) && !(typeof d["status"] === "string" && d["status"]) ? (offOf(d) ? "bg-muted text-muted-foreground" : "bg-success/15 text-success-text") : d.docstatus === 2 ? "bg-destructive/10 text-destructive" : d.docstatus === 1 ? "bg-success/15 text-success-text" : "bg-warning/15 text-warning-text");

export function DocumentHub(p: DocumentHubProps) {
  useStoreVersion();
  return (
    <div className="space-y-4" data-hub>
      <QuickAccess {...p} />
      {p.afterQuick}
      <ProcessGroups {...p} />
      <Workbench {...p} />
      {p.state.doc && p.state.dt && <Doc360 {...p} doctype={p.state.dt} name={p.state.doc} />}
    </div>
  );
}

/* ------------------------------------------------------------------ A quick access ------------------------------------------------------------------ */
function QuickAccess({ ar, quick: all, link, label }: DocumentHubProps) {
  const quick = all.filter((t) => t.status !== "denied"); // denied destinations are hidden (owner decision 2026-11-11)
  if (!quick.length) return null;
  return (
    <section className="panel p-4" aria-label={pick(ar, T.quick)} data-hub-quick>
      <h3 className="mb-3 text-sm font-semibold">{pick(ar, T.quick)}</h3>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {quick.map((t) => (
          <li key={t.id} className="flex flex-col gap-1 rounded-md border border-border p-3" data-hub-tile={t.id} data-hub-tile-status={t.status}>
            <span className="text-xs text-muted-foreground">{label(t.doctype)}</span>
            <span className="text-sm font-medium">{pick(ar, t.label)}</span>
            {t.status === "denied" || t.status === "unavailable"
              ? <span className="text-sm text-muted-foreground" data-hub-tile-state={t.status}>— {pick(ar, t.status === "denied" ? T.denied : T.unavailable)}</span>
              : <span className={`text-2xl font-semibold tabular-nums ${t.tone === "risk" && t.count ? "text-destructive" : ""}`} data-no-i18n data-hub-tile-count>{t.count}</span>}
            <span className="text-[11px] text-muted-foreground">{pick(ar, t.hint)}</span>
            <span className="mt-auto flex flex-wrap gap-2 pt-1 text-xs">
              {t.status !== "denied" && t.status !== "unavailable" && link({ kind: "list", doctype: t.doctype, filters: t.filters }, <>{pick(ar, T.open)} →</>, { className: "text-primary hover:underline", "data-hub-tile-open": t.id })}
              {t.canCreate && link({ kind: "new", doctype: t.doctype }, <>+ {pick(ar, T.newDoc)}</>, { className: "ms-auto text-primary hover:underline", "data-hub-tile-new": t.id })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ B process groups ------------------------------------------------------------------ */
function ProcessGroups(p: DocumentHubProps) {
  const { ar, model, reportsLink } = p;
  if (!model.groups.length) return null;
  return (
    <section aria-label={pick(ar, T.groups)} data-hub-groups>
      <h3 className="mb-2 text-sm font-semibold">{pick(ar, T.groups)}</h3>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {model.groups.map((g) => <GroupCard key={g.id} p={p} id={g.id} entries={g.entries} />)}
      </div>
      {reportsLink && <p className="mt-2 text-xs" data-hub-full-reports>{reportsLink}</p>}
    </section>
  );
}
function GroupCard({ p, id, entries }: { p: DocumentHubProps; id: string; entries: HubEntry[] }) {
  const { ar } = p;
  const [all, setAll] = useState(false);
  const g = HUB_GROUPS.find((x) => x.id === id)!;
  // owner decision 2026-11-11: a destination the session role cannot read is hidden, not listed as "Not permitted"
  const visible = entries.filter((e) => p.access(e) !== "denied");
  const shown = all ? visible : visible.slice(0, 8);
  if (!visible.length) return null;
  return (
    <article className="panel flex flex-col p-3" data-hub-group={id}>
      <header className="mb-2 flex items-baseline gap-2">
        <h4 className="text-sm font-semibold">{pick(ar, g.label)}</h4>
        <span className="chip bg-muted tabular-nums" data-no-i18n>{entries.length}</span>
      </header>
      <p className="mb-2 text-[11px] text-muted-foreground">{pick(ar, g.hint)}</p>
      <ul className="space-y-1">{shown.map((e) => <EntryRow key={JSON.stringify(e.target)} p={p} e={e} />)}</ul>
      {visible.length > 8 && <button type="button" className="btn-ghost mt-2 min-h-9 self-start text-xs" onClick={() => setAll((x) => !x)} aria-expanded={all} data-hub-group-toggle={id}>{all ? pick(ar, T.showLess) : `${pick(ar, T.showAll)} (${visible.length})`}</button>}
    </article>
  );
}
function EntryRow({ p, e }: { p: DocumentHubProps; e: HubEntry }) {
  const { ar, link, access, canCreate, label } = p;
  const st = access(e);
  const t = e.target;
  const text = <span className="min-w-0 truncate">{label(e.label)}</span>;
  const tag = p.entryTag?.(e);
  if (st !== "ok") return <li className="flex items-center gap-2 text-sm text-muted-foreground" data-hub-entry={e.label} data-hub-entry-state={st} data-hub-tag={tag}>{text}<span className="ms-auto text-[11px]">{pick(ar, st === "denied" ? T.denied : st === "loading" ? T.loading : T.unavailable)}</span></li>;
  const main: HubLink = t.kind === "doctype" ? { kind: "list", doctype: t.doctype, filters: t.filters } : t.kind === "tree" ? { kind: "list", doctype: t.doctype } : t.kind === "report" ? { kind: "report", report: t.report } : t.kind === "page" ? { kind: "page", page: t.page } : { kind: "app", key: t.key };
  const single = (t.kind === "doctype" || t.kind === "tree") && !!cachedMeta(t.doctype)?.issingle;
  return (
    <li className="flex min-h-9 items-center gap-2 text-sm" data-hub-entry={e.label} data-hub-entry-kind={t.kind} data-hub-entry-state="ok" data-hub-tag={tag}>
      {link(single && (t.kind === "doctype" || t.kind === "tree") ? { kind: "doc", doctype: t.doctype, name: t.doctype } : main, text, { className: "min-w-0 flex-1 truncate text-primary hover:underline", ...(e.hint ? { title: e.hint } : {}), "data-hub-entry-open": e.label })}
      {t.kind === "doctype" && !single && !t.filters && link({ kind: "list", doctype: t.doctype, view: "report" }, <span aria-hidden>▤</span>, { className: "rounded px-1 text-muted-foreground hover:bg-muted", "aria-label": `${pick(ar, T.report)}: ${e.label}`, title: pick(ar, T.report), "data-hub-entry-report": e.label })}
      {(t.kind === "doctype" || t.kind === "tree") && !single && canCreate(t.doctype) && link({ kind: "new", doctype: t.doctype }, <span aria-hidden>＋</span>, { className: "rounded px-1 text-muted-foreground hover:bg-muted", "aria-label": `${pick(ar, T.newDoc)}: ${e.label}`, title: pick(ar, T.newDoc), "data-hub-entry-new": e.label })}
    </li>
  );
}

/* ------------------------------------------------------------------ C workbench ------------------------------------------------------------------ */
function useMeta(doctype: string | undefined): DocTypeMeta | undefined {
  const idx = useQuery(indexQuery);
  const cached = doctype ? cachedMeta(doctype) : undefined;
  const e = doctype ? idx.data?.find((x) => x.name === doctype) : undefined;
  const q = useQuery({ ...metaQuery(e?.app ?? "erpnext", e?.slug ?? "_"), enabled: !!e && !cached && typeof window !== "undefined" });
  return cached ?? q.data;
}
function Workbench(p: DocumentHubProps) {
  const { ar, registers, state, onState, link, label, company, user, access } = p;
  const readable = registers.filter((r) => access({ label: r, target: { kind: "doctype", doctype: r } }) !== "denied");
  const dt = state.dt && readable.includes(state.dt) ? state.dt : readable[0];
  const meta = useMeta(dt);
  const [limit, setLimit] = useState(25);
  useEffect(() => setLimit(25), [dt, state.q, state.st, state.v, state.g]);
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [drawer, setDrawer] = useState<{ names: string[]; decision: QueueDecision } | null>(null);
  useEffect(() => setSel(new Set()), [dt, state.v]);
  if (!readable.length) return null; // every register denied: the workbench is hidden, not shown disabled
  const st = dt ? access({ label: dt, target: { kind: "doctype", doctype: dt } }) : "unavailable";
  const hasCompany = !!meta?.fields.some((f) => f.fieldname === "company");
  const rows = dt && st === "ok" && meta ? scopedList(dt, user) : [];
  const q = (state.q ?? "").trim().toLowerCase();
  const statuses = [...new Set(rows.map((d) => statusOf(d, meta)))].sort();
  const spec = p.views;
  const savedBase = state.v?.startsWith("saved:") ? getSettings().register_views[dt ?? ""]?.find((x) => `saved:${x.id}` === state.v)?.v
    : state.v?.startsWith("shared:") ? (() => { const b = viewsFor(dt ?? "", "hub", user).find((x) => `shared:${x.id}` === state.v)?.payload["v"]; return typeof b === "string" ? b : undefined; })() : undefined;
  const viewOk = (v0: string | undefined, d: Doc) => { const v = v0?.startsWith("saved:") || v0?.startsWith("shared:") ? savedBase : v0; return viewOk_(v, d); };
  const ap = p.approvals; const apCols = ap && dt ? ap.columns(dt) : [];
  const reviewing = apCols.length > 0 && state.v === "review";
  const canOf = (d: Doc): QueueCan => (ap && apCols.length ? ap.can(dt!, d) : {});
  const viewOk_ = (v: string | undefined, d: Doc) => (v === "review" ? anyCan(canOf(d)) : registerViewMatch(spec, v, dt!, d, user));
  const base = rows.filter((d) => (!hasCompany || !company || d["company"] === company));
  const preStrip = base.filter((d) => viewOk(state.v, d) && (!q || d.name.toLowerCase().includes(q) || titleOf(meta, d).toLowerCase().includes(q)));
  // the Enterprise status strip (Round 1 §6): tabs count the rows of the other filters; a tab pick is `r1:<state>` in hub_st
  const strip = meta ? stripTabs(meta, preStrip) : [];
  const filtered = preStrip.filter((d) => !state.st || (state.st.startsWith("r1:") ? !!meta && inStripTab(meta, d, state.st.slice(3)) : state.st === "docstatus:0" ? (d.docstatus ?? 0) === 0 : state.st === "docstatus:1" ? d.docstatus === 1 : state.st === "docstatus:2" ? d.docstatus === 2 : statusOf(d, meta) === state.st));
  const hasProject = !!meta?.fields.some((f) => f.fieldname === "project");
  const groupField = spec && (state.g === "status" || (state.g === "project" && hasProject)) ? state.g : undefined;
  const groupVal = (d: Doc) => (groupField === "status" ? statusOf(d, meta) : String(d["project"] ?? ""));
  const ordered = groupField ? [...filtered].sort((a, b) => groupVal(a).localeCompare(groupVal(b))) : filtered;
  const groupCount = groupField ? ordered.reduce((m, d) => m.set(groupVal(d), (m.get(groupVal(d)) ?? 0) + 1), new Map<string, number>()) : undefined;
  const listFilters: Filter[] = [...(hasCompany && company ? [["company", "=", company] as Filter] : []), ...(q ? [["name", "like", `%${state.q}%`] as Filter] : []),
    ...(state.st?.startsWith("docstatus:") ? [["docstatus", "=", Number(state.st.slice(10))] as Filter] : state.st && !state.st.startsWith("r1:") ? [["status", "=", state.st] as Filter] : [])];
  return (
    <section className="panel p-4" aria-label={pick(ar, T.workbench)} data-hub-workbench={dt ?? ""}>
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{pick(ar, T.workbench)}</h3>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={pick(ar, T.workbench)}>
          {readable.map((r) => <button key={r} type="button" role="tab" aria-selected={r === dt} onClick={() => onState({ dt: r, q: undefined, st: undefined, doc: undefined, v: undefined, g: undefined })}
              className={`min-h-11 rounded-md px-2.5 text-xs sm:min-h-9 ${r === dt ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:bg-muted"}`} data-hub-register={r}>{label(r)}</button>)}
        </div>
      </header>
      {st !== "ok" ? <p className="text-sm text-muted-foreground" data-hub-workbench-state={st}>{pick(ar, st === "denied" ? T.denied : st === "loading" ? T.loading : T.unavailable)}</p> : !meta ? <p className="text-sm text-muted-foreground" data-hub-workbench-state="loading">{pick(ar, T.loading)}</p> : (
        <>
          {spec && dt && <RegisterViews p={p} dt={dt} counts={{ all: base.length, mine: base.filter((d) => viewOk("mine", d)).length, waiting: base.filter((d) => viewOk("waiting", d)).length, overdue: base.filter((d) => viewOk("overdue", d)).length, ...(apCols.length ? { review: base.filter((d) => viewOk("review", d)).length } : {}) }} hasProject={hasProject} />}
          {strip.length > 1 && <StatusStrip tabs={strip} active={state.st?.startsWith("r1:") ? state.st.slice(3) : undefined} ar={ar} onPick={(k) => onState({ st: k ? `r1:${k}` : undefined })} />}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input type="search" className="field-input min-h-11 max-w-sm" placeholder={pick(ar, T.search)} aria-label={pick(ar, T.search)} value={state.q ?? ""} onChange={(e) => onState({ q: e.target.value || undefined })} data-hub-search />
            <label className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">{pick(ar, T.status)}</span>
              <select className="field-input min-h-11 w-auto" value={state.st ?? ""} onChange={(e) => onState({ st: e.target.value || undefined })} data-hub-status>
                <option value="">{pick(ar, T.all)}</option>
                {meta.is_submittable ? <><option value="docstatus:0">{pick(ar, T.draft)}</option><option value="docstatus:1">{pick(ar, T.submitted)}</option><option value="docstatus:2">{pick(ar, T.cancelled)}</option></> : null}
                {statuses.filter((s) => !(meta.is_submittable && ["Draft", "Submitted", "Cancelled"].includes(s))).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <span className="text-xs text-muted-foreground tabular-nums" data-hub-count data-no-i18n>{filtered.length} {pick(ar, T.rows)}</span>
            <span className="ms-auto text-xs">{dt && link({ kind: "list", doctype: dt, filters: listFilters }, <>{pick(ar, T.inList)} →</>, { className: "text-primary hover:underline", "data-hub-open-list": dt })}</span>
          </div>
          {apCols.length > 0 && ap?.legend && <div className="mb-2" data-hub-legend>{ap.legend(dt!)}</div>}
          {reviewing && filtered.length > 0 && <BulkBar count={[...sel].filter((n) => filtered.some((d) => d.name === n)).length} total={filtered.length} ar={ar}
            onAll={() => setSel(new Set(filtered.map((d) => d.name)))} onClear={() => setSel(new Set())} onApprove={() => setDrawer({ names: [...sel].filter((n) => filtered.some((d) => d.name === n && canOf(d).approve)), decision: "approve" })} />}
          {!filtered.length ? <p className="py-4 text-sm text-muted-foreground" data-hub-empty>{pick(ar, T.noRows)}</p> : (
            <div className="overflow-x-auto">
              <table className={`w-full ${apCols.length ? "text-[13px]" : "text-sm"}`} data-hub-table {...(apCols.length ? { "data-hub-compact": "" } : {})}>
                <thead><tr className="text-xs text-muted-foreground">{reviewing && <th className="w-8 py-1.5"><input type="checkbox" aria-label={pick(ar, T.select)} checked={filtered.length > 0 && filtered.every((d) => sel.has(d.name))} onChange={(e) => setSel(e.target.checked ? new Set(filtered.map((d) => d.name)) : new Set())} data-hub-select-all /></th>}<th className="py-1.5 text-start font-medium">{pick(ar, T.number)}</th><th className="py-1.5 text-start font-medium">{pick(ar, T.title)}</th>{spec && hasProject && <th className="py-1.5 text-start font-medium">{pick(ar, T.project)}</th>}<th className="py-1.5 text-start font-medium">{pick(ar, T.status)}</th>{apCols.map((c) => <Fragment key={c.key}><th className={`py-1.5 font-medium ${c.end ? "text-end" : "text-start"}`} data-hub-col={c.key}>{pick(ar, c.label)}</th>{c.approval && <th className="py-1.5 text-start font-medium">{pick(ar, T.decision)}</th>}</Fragment>)}<th className="py-1.5 text-start font-medium">{apCols.length && spec ? `${pick(ar, T.date)} / ${pick(ar, T.age)}` : pick(ar, T.date)}</th>{spec && !apCols.length && <th className="py-1.5 text-end font-medium">{pick(ar, T.age)}</th>}<th className="py-1.5 text-end font-medium">{pick(ar, T.amount)}</th>{apCols.length > 0 && !apCols.some((c) => c.approval) && <th className="py-1.5 text-end font-medium">{pick(ar, T.decision)}</th>}</tr></thead>
                <tbody>
                  {ordered.slice(0, limit).map((d, i, arr) => {
                    const amt = hubRowAmount(d, meta ?? undefined);
                    const age = spec ? ageOf(d) : null;
                    const gv = groupField ? groupVal(d) : undefined;
                    const head = groupField && (i === 0 || groupVal(arr[i - 1]!) !== gv);
                    const cols = 5 + (spec && !apCols.length ? 1 : 0) + (spec && hasProject ? 1 : 0) + apCols.length + (apCols.length ? 1 : 0) + (reviewing ? 1 : 0);
                    const can = canOf(d); const mine = anyCan(can);
                    return (
                      <Fragment key={d.name}>
                      {head && <tr className="border-t border-border bg-muted/50" data-hub-group-row={gv}><td colSpan={cols} className="px-1 py-1.5 text-xs font-semibold">{gv ? (spec?.groupLabel ? spec.groupLabel(groupField!, gv) : <bdi data-no-i18n>{gv}</bdi>) : pick(ar, T.none_)} <span className="chip ms-1 bg-card tabular-nums" data-no-i18n>{groupCount!.get(gv!) ?? 0}</span></td></tr>}
                      <tr className={`border-t border-border ${state.doc === d.name ? "bg-primary/5" : ""}`} data-hub-row={d.name} data-r1-peek-row={d.name}
                        onClick={(e) => { if ((e.target as Element).closest(ROW_INTERACTIVE)) return; peekRow(dt!, d.name, ordered.map((x) => x.name), e.currentTarget); }} {...(mine ? { "data-hub-mine": "" } : {})}>
                        {reviewing && <td className="py-1.5"><input type="checkbox" aria-label={`${pick(ar, T.select)}: ${d.name}`} checked={sel.has(d.name)} onChange={(e) => setSel((x) => { const n = new Set(x); if (e.target.checked) n.add(d.name); else n.delete(d.name); return n; })} data-hub-select={d.name} /></td>}
                        <td className="py-1.5">{/* the number opens the document at the app's own address; 360 keeps the Document 360 drawer (under the number in compact registers) */}<span className={apCols.length ? "inline-flex items-center gap-1.5 sm:flex-col sm:items-start sm:gap-0.5" : "inline-flex items-center gap-1.5"}>
                          {link({ kind: "doc", doctype: dt!, name: d.name }, <bdi data-no-i18n>{d.name}</bdi>, { className: "whitespace-nowrap text-start font-medium text-primary hover:underline", "data-hub-row-link": d.name })}
                          <button type="button" className="rounded border border-border px-1 text-[10px] font-semibold leading-4 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => onState({ dt, doc: d.name })} aria-label={`${pick(ar, T.d360)}: ${d.name}`} title={pick(ar, T.d360)} data-hub-row-open={d.name}><bdi data-no-i18n>360</bdi></button>
                          {/* owner SH-05: a register of a kind with a 360 profile also opens that profile from the row */}
                          {PROFILES_360.some((x) => x.doctype === dt) && <Open360 doctype={dt!} name={d.name} compact />}</span></td>
                        <td className={`${apCols.length ? "max-w-[7.5rem]" : "max-w-[18rem]"} truncate py-1.5`} title={p.rowTitle?.(dt!, d) || titleOf(meta, d) || undefined}><bdi data-no-i18n>{p.rowTitle?.(dt!, d) || titleOf(meta, d) || "—"}</bdi></td>
                        {spec && hasProject && <td className={`${apCols.length ? "max-w-[6rem]" : "max-w-[14rem]"} truncate py-1.5`}>{d["project"] ? (spec.groupLabel ? spec.groupLabel("project", String(d["project"])) : <bdi data-no-i18n>{String(d["project"])}</bdi>) : "—"}</td>}
                        <td className="py-1.5"><span className={`chip ${toneOf(d, meta)}`}>{statusOf(d, meta)}</span>{meta && <OverdueTag days={overdueDays(meta, d)} ar={ar} />}</td>
                        {apCols.map((c) => <Fragment key={c.key}><td className={`py-1.5 ${c.end ? "text-end" : ""}`} data-hub-cell={c.key}><span className="inline-flex flex-wrap items-center gap-1">{c.cell(d)}{c.approval && mine && <MinePill ar={ar} />}</span></td>
                          {c.approval && <td className="py-1.5" data-hub-decision={d.name}>{mine ? <DecisionMenu can={can} ar={ar} id={d.name} onPick={(k) => setDrawer({ names: [d.name], decision: k })} /> : null}</td>}</Fragment>)}
                        {/* with approval columns the age sits under the date (same figure, one column) so every column fits without sideways scrolling */}
                        <td className="whitespace-nowrap py-1.5 tabular-nums r1-date"><span data-no-i18n>{dateOf(d) ? fmtDate(dateOf(d)) : "—"}</span>
                          {spec && apCols.length > 0 && <span className="block text-[11px] text-muted-foreground" data-hub-age={age ?? ""}>{age === null ? "—" : <><bdi data-no-i18n>{age}</bdi> {pick(ar, T.days)}</>}</span>}</td>
                        {spec && !apCols.length && <td className="whitespace-nowrap py-1.5 text-end tabular-nums" data-hub-age={age ?? ""}>{age === null ? "—" : <><bdi data-no-i18n>{age}</bdi> {pick(ar, T.days)}</>}</td>}
                        <td className="whitespace-nowrap py-1.5 text-end tabular-nums" data-no-i18n>{amt ? (amt.cur && amt.cur !== "SAR" ? `${amt.cur} ${fmtNum(amt.v)}` : fmtCurrency(amt.v, "SAR")) : "—"}</td>
                        {apCols.length > 0 && !apCols.some((c) => c.approval) && <td className="py-1.5 text-end">{mine ? <DecisionMenu can={can} ar={ar} id={d.name} onPick={(k) => setDrawer({ names: [d.name], decision: k })} /> : null}</td>}
                      </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length > limit && <button type="button" className="btn-ghost mt-2 min-h-11 text-xs" onClick={() => setLimit((x) => x + 25)} data-hub-more>{pick(ar, T.more)} ({filtered.length - limit})</button>}
            </div>
          )}
          {ap && dt && drawer && <DecisionDrawer ap={ap} dt={dt} ar={ar} names={drawer.names} decision={drawer.decision} onClose={() => setDrawer(null)} onDone={() => setSel(new Set())} />}
        </>
      )}
    </section>
  );
}

/** The decision drawer of one document or of the selected rows (bulk approve); decisions run through the host. */
function DecisionDrawer({ ap, dt, ar, names, decision, onClose, onDone }: { ap: HubApprovalsSpec; dt: string; ar: boolean; names: string[]; decision: QueueDecision; onClose: () => void; onDone: () => void }) {
  const docs = names.map((n) => scopedGet(dt, n)).filter((d): d is Doc => !!d);
  const one = docs.length === 1 ? docs[0] : undefined;
  const can: QueueCan = one ? ap.can(dt, one) : { approve: true };
  const confirm = (d: QueueDecision, comment: string, files: File[]) => {
    const errs: string[] = []; let done = 0;
    for (const doc of docs) { const e = ap.decide(dt, doc, d, comment, files); if (e.length) errs.push(...e.map((x) => (docs.length > 1 ? `${doc.name}: ${x}` : x))); else done++; }
    if (done) { toast.success(d === "approve" ? (ar ? `اعتُمد ${done}` : `${done} approved`) : d === "reject" ? (ar ? "تم الرفض" : "Rejected") : (ar ? "أُرسل طلب التعديل" : "Change request sent")); onDone(); }
    return errs;
  };
  return <ApprovalDrawer open onOpenChange={(o) => { if (!o) onClose(); }} ar={ar} can={can} initial={can[decision] ? decision : "approve"} count={docs.length} onConfirm={confirm}
    title={one ? <bdi data-no-i18n>{one.name}</bdi> : pick(ar, T.approveSel)} summary={one && ap.summary ? ap.summary(dt, one) : !one ? <ul className="flex flex-wrap gap-1 text-xs" data-no-i18n>{docs.map((d) => <li key={d.name} className="chip bg-muted">{d.name}</li>)}</ul> : undefined} />;
}

/** Standard views with counts, the user's own saved views (save / remove) and the group-by choice of one register. */
function RegisterViews({ p, dt, counts, hasProject }: { p: DocumentHubProps; dt: string; counts: Record<"all" | "mine" | "waiting" | "overdue", number> & { review?: number | undefined }; hasProject: boolean }) {
  const { ar, state, onState, label } = p;
  const settings = useSettings();
  const saved: RegisterView[] = settings.register_views[dt] ?? [];
  // phase 4 C4-09: save (step 1) then share (step 2) through the Enterprise saved-views dialog; older personal views stay listed
  useStoreVersion();
  const shared = viewsFor(dt, "hub", p.user);
  const [dlg, setDlg] = useState<{ editing?: SharedView } | null>(null);
  const cur = state.v ?? "all";
  const baseV = state.v?.startsWith("saved:") || state.v?.startsWith("shared:") ? undefined : state.v;
  const payload: Record<string, unknown> = { ...(baseV ? { v: baseV } : {}), ...(state.st ? { st: state.st } : {}), ...(state.q ? { q: state.q } : {}), ...(state.g ? { g: state.g } : {}) };
  const VLABEL: Record<string, Bi> = { mine: T.vMine, waiting: T.vWaiting, overdue: T.vOverdue, review: T.vReview };
  const summary: ReactNode[] = [
    ...(baseV && VLABEL[baseV] ? [<>{pick(ar, T.views)}: <b>{pick(ar, VLABEL[baseV]!)}</b></>] : []),
    ...(state.st ? [<>{pick(ar, T.status)}: <b data-no-i18n>{label(state.st)}</b></>] : []),
    ...(state.q ? [<>{ar ? "بحث" : "Search"}: <b data-no-i18n>{state.q}</b></>] : []),
    ...(state.g ? [<>{pick(ar, T.groupBy)}: <b>{state.g === "project" ? pick(ar, T.project) : pick(ar, T.status)}</b></>] : []),
  ];
  const applyShared = (v: SharedView) => { const x = v.payload; onState({ v: `shared:${v.id}`, st: typeof x["st"] === "string" ? x["st"] : undefined, q: typeof x["q"] === "string" ? x["q"] : undefined, g: typeof x["g"] === "string" ? x["g"] : undefined }); };
  const apply = (v: RegisterView) => onState({ v: `saved:${v.id}`, st: v.st, q: v.q, g: v.g });
  const remove = (id: string) => { const all = getSettings().register_views; setSettings({ register_views: { ...all, [dt]: (all[dt] ?? []).filter((x) => x.id !== id) } }); if (cur === `saved:${id}`) onState({ v: undefined }); };
  const std: [string, Bi, number][] = [["all", T.vAll, counts.all], ["mine", T.vMine, counts.mine], ["waiting", T.vWaiting, counts.waiting], ["overdue", T.vOverdue, counts.overdue], ...(counts.review !== undefined ? [["review", T.vReview, counts.review] as [string, Bi, number]] : [])];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label={pick(ar, T.views)} data-hub-views={dt}>
      {std.map(([k, l, n]) => <button key={k} type="button" aria-pressed={cur === k || (k === "all" && !state.v)} onClick={() => onState({ v: k === "all" ? undefined : k })}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs sm:min-h-9 ${cur === k || (k === "all" && !state.v) ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-card hover:bg-muted"}`} data-hub-view={k}>
        {pick(ar, l)} <span className="tabular-nums" data-no-i18n>{n}</span></button>)}
      {saved.map((v) => <span key={v.id} className={`inline-flex items-center rounded-full border text-xs ${cur === `saved:${v.id}` ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"}`} data-hub-saved-view={v.id}>
        <button type="button" className="min-h-11 px-3 sm:min-h-9" onClick={() => apply(v)} aria-pressed={cur === `saved:${v.id}`}><bdi data-no-i18n>{v.title}</bdi></button>
        <button type="button" className="min-h-11 px-2 text-muted-foreground hover:text-destructive sm:min-h-9" onClick={() => remove(v.id)} aria-label={`${pick(ar, T.removeView)}: ${v.title}`}>✕</button></span>)}
      {shared.map((v) => <ViewChip key={v.id} v={v} ar={ar} active={cur === `shared:${v.id}`} onApply={() => applyShared(v)} onShare={() => setDlg({ editing: v })}
        onDelete={() => { const e = deleteView(v.id, p.user); if (e.length) toast.error(e[0]!); else if (cur === `shared:${v.id}`) onState({ v: undefined }); }} />)}
      <button type="button" className="btn-ghost min-h-11 text-xs sm:min-h-9" onClick={() => setDlg({})} data-hub-view-save>＋ {pick(ar, T.saveView)}</button>
      {dlg && <SaveShareDialog key={dlg.editing?.id ?? "new"} open onOpenChange={(o) => { if (!o) setDlg(null); }} ar={ar} doctype={dt} surface="hub" payload={payload} summary={summary} editing={dlg.editing}
        onSaved={(v) => { setDlg(null); if (!dlg.editing) onState({ v: `shared:${v.id}` }); toast.success(ar ? "حُفظ العرض" : "View saved"); }} />}
      <label className="ms-auto flex items-center gap-1 text-xs"><span className="text-muted-foreground">{pick(ar, T.groupBy)}</span>
        <select className="field-input min-h-11 w-auto py-1 text-xs sm:min-h-9" value={state.g ?? ""} onChange={(e) => onState({ g: e.target.value || undefined })} data-hub-group-by>
          <option value="">{pick(ar, T.noGroup)}</option><option value="status">{pick(ar, T.status)}</option>{hasProject && <option value="project">{pick(ar, T.project)}</option>}
        </select></label>
    </div>
  );
}

/* ------------------------------------------------------------------ D Document 360 ------------------------------------------------------------------ */
function Doc360(p: DocumentHubProps & { doctype: string; name: string }) {
  const { ar, doctype, name, onState, link, label, user } = p;
  const meta = useMeta(doctype);
  const dashes = useQuery(dashboardsQuery);
  const rev = useQuery(reverseLinksQuery);
  const head = useRef<HTMLHeadingElement>(null);
  const [, setTick] = useState(0);
  useEffect(() => { head.current?.focus(); }, [name]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onState({ doc: undefined }); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onState]);
  // child-table and linked definitions: exact child-row relation paths and permission checks
  const groups = useMemo(() => (meta ? connectionGroups(meta, dashes.data?.[meta.name], reverseLinksFor(meta.name, rev.data?.doctypes)) : []), [meta, dashes.data, rev.data]);
  const need = useMemo(() => [...new Set([...(meta?.fields ?? []).filter((f) => TABLE_TYPES.has(f.fieldtype) && f.options).map((f) => String(f.options)), ...groups.flatMap((g) => g.items.map((i) => i.link_doctype)), "GL Entry", "Stock Ledger Entry"])].filter((d) => !cachedMeta(d)).sort().join("|"), [meta, groups]);
  useEffect(() => { if (!need) return; let live = true; void ensureMetas(need.split("|")).then(() => { if (live) setTick((x) => x + 1); }); return () => { live = false; }; }, [need]);
  const doc = scopedGet(doctype, name, user);
  const close = () => onState({ doc: undefined });
  const tables = (meta?.fields ?? []).filter((f) => f.fieldname && TABLE_TYPES.has(f.fieldtype) && Array.isArray(doc?.[f.fieldname]) && (doc![f.fieldname] as unknown[]).length);
  const outgoing = doc && meta ? outgoingLinks(doc, meta).filter((o) => !["Company", "Currency", "UOM", "Account", "Cost Center", "Warehouse", "Price List", "Item Tax Template", "Item Group", "Brand", "Country", "Fiscal Year", "Mode of Payment", "Letter Head", "Print Heading", "Terms and Conditions", "Address", "Contact"].includes(o.doctype)) : [];
  const gl = doc && meta?.is_submittable && doc.docstatus === 1 ? relationCount("GL Entry", "voucher_no", doctype, name, user) : null;
  const sle = doc && meta?.is_submittable && doc.docstatus === 1 ? relationCount("Stock Ledger Entry", "voucher_no", doctype, name, user) : null;
  const files = adapter.list("File").filter((f) => f["attached_to_doctype"] === doctype && f["attached_to_name"] === name).length;
  const comments = adapter.list("Comment").filter((c) => c["reference_doctype"] === doctype && c["reference_name"] === name && (c["comment_type"] ?? "Comment") === "Comment").length;
  const amt = doc ? hubRowAmount(doc, meta ?? undefined) : null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-foreground/20" onClick={close} data-hub-360-backdrop>
      <aside role="dialog" aria-modal="true" aria-labelledby="hub-360-title" className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-background shadow-2xl sm:border-s sm:border-border" onClick={(e) => e.stopPropagation()} data-hub-360={`${doctype}|${name}`}>
        <header className="sticky top-0 z-10 flex items-start gap-2 border-b border-border bg-background p-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{pick(ar, T.d360)} · {label(doctype)}</p>
            <h3 id="hub-360-title" ref={head} tabIndex={-1} className="truncate text-lg font-semibold outline-none"><bdi data-no-i18n>{name}</bdi></h3>
            {doc && <p className="truncate text-sm text-muted-foreground"><bdi data-no-i18n>{titleOf(meta, doc)}</bdi></p>}
          </div>
          <button type="button" className="btn-ghost min-h-11 min-w-11 justify-center" onClick={close} aria-label={pick(ar, T.close)} data-hub-360-close>✕</button>
        </header>
        {!doc ? <p className="p-4 text-sm text-muted-foreground" data-hub-360-missing>{pick(ar, T.notFound)}</p> : (
          <div className="space-y-4 p-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">{pick(ar, T.status)}</dt><dd><span className={`chip ${toneOf(doc)}`}>{statusOf(doc)}</span></dd></div>
              <div><dt className="text-xs text-muted-foreground">{pick(ar, T.date)}</dt><dd className="tabular-nums" data-no-i18n>{dateOf(doc) || "—"}</dd></div>
              {typeof doc["company"] === "string" && <div><dt className="text-xs text-muted-foreground">{pick(ar, T.company)}</dt><dd className="truncate" data-no-i18n>{String(doc["company"])}</dd></div>}
              <div><dt className="text-xs text-muted-foreground">{pick(ar, T.amount)}</dt><dd className="tabular-nums" data-no-i18n>{amt ? `${amt.cur ? `${amt.cur} ` : ""}${fmtNum(amt.v)}` : "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{pick(ar, T.owner)}</dt><dd className="truncate" data-no-i18n>{String(doc["owner"] ?? "—")}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{pick(ar, T.modified)}</dt><dd className="tabular-nums" data-no-i18n>{String(doc.modified ?? "").slice(0, 16).replace("T", " ")}</dd></div>
            </dl>
            <div className="flex flex-wrap gap-2">
              {link({ kind: "doc", doctype, name }, <>{pick(ar, T.openForm)} →</>, { className: "btn-primary min-h-11", "data-hub-360-open": name })}
              {link({ kind: "print", doctype, name }, <>🖨 {pick(ar, T.print)}</>, { className: "btn-ghost min-h-11", "data-hub-360-print": name })}
            </div>
            {tables.length > 0 && (
              <section data-hub-360-items>
                <h4 className="mb-1 text-sm font-semibold">{pick(ar, T.items)}</h4>
                {tables.slice(0, 2).map((f) => {
                  const rs = doc[f.fieldname!] as Record<string, unknown>[];
                  return <div key={f.fieldname} className="mb-2">
                    <p className="text-xs text-muted-foreground">{label(f.label ?? f.fieldname!)} · <span data-no-i18n>{rs.length}</span></p>
                    <ul className="divide-y divide-border text-sm">{rs.slice(0, 5).map((r, i) => <li key={i} className="flex gap-2 py-1"><bdi className="min-w-0 flex-1 truncate" data-no-i18n>{String(r["item_name"] ?? r["item_code"] ?? r["account"] ?? r["reference_name"] ?? r["asset"] ?? r["description"] ?? `#${i + 1}`)}</bdi>{r["qty"] !== undefined && <span className="tabular-nums text-muted-foreground" data-no-i18n>× {String(r["qty"])}</span>}{(r["amount"] ?? r["allocated_amount"] ?? r["debit"]) !== undefined && <span className="tabular-nums" data-no-i18n>{fmtNum(Number(r["amount"] ?? r["allocated_amount"] ?? r["debit"]) || 0)}</span>}</li>)}</ul>
                  </div>;
                })}
              </section>
            )}
            <section data-hub-360-sources>
              <h4 className="mb-1 text-sm font-semibold">{pick(ar, T.sources)}</h4>
              {outgoing.length ? <ul className="space-y-1 text-sm">{outgoing.map((o) => <li key={`${o.doctype}|${o.table ?? ""}|${o.field}`} className="flex flex-wrap items-baseline gap-x-2" data-hub-360-source={o.doctype}>
                <span className="text-xs text-muted-foreground">{label(o.doctype)}</span>
                {o.names.slice(0, 6).map((n) => <span key={n}>{link({ kind: "doc", doctype: o.doctype, name: n }, <bdi data-no-i18n>{n}</bdi>, { className: "text-primary hover:underline" })}</span>)}
                {o.names.length > 6 && <span className="text-xs text-muted-foreground" data-no-i18n>+{o.names.length - 6}</span>}
              </li>)}</ul> : <p className="text-sm text-muted-foreground">{pick(ar, T.none)}</p>}
            </section>
            <section data-hub-360-related>
              <h4 className="mb-1 text-sm font-semibold">{pick(ar, T.downstream)}</h4>
              {groups.length ? <ul className="space-y-1 text-sm">{groups.flatMap((g) => g.items).map((it) => {
                const rc = connectionCount(it, doctype, doc, user);
                const shown = rc.status === "ok" || rc.status === "limited";
                if (shown && rc.count === 0) return null;
                return <li key={it.link_doctype + it.link_fieldname} className="flex items-center gap-2" data-hub-360-rel={it.link_doctype} data-hub-360-rel-status={rc.status} data-hub-360-rel-match={rc.path.match}>
                  <span className="chip bg-muted tabular-nums" data-no-i18n title={rc.status === "limited" ? pick(ar, T.limited) : undefined}>{shown ? rc.count : "—"}</span>
                  {shown ? link({ kind: "list", doctype: it.link_doctype, filters: rc.filters }, label(it.link_doctype), { className: "text-primary hover:underline" }) : <span className="text-muted-foreground">{label(it.link_doctype)} · {pick(ar, rc.status === "denied" ? T.denied : T.unavailable)}</span>}
                </li>;
              })}</ul> : <p className="text-sm text-muted-foreground">{pick(ar, T.none)}</p>}
            </section>
            {(gl || sle) && (
              <section data-hub-360-ledger>
                <h4 className="mb-1 text-sm font-semibold">{pick(ar, T.ledger)}</h4>
                <ul className="space-y-1 text-sm">
                  {([["GL Entry", gl], ["Stock Ledger Entry", sle]] as const).map(([dt, rc]) => rc && (
                    <li key={dt} className="flex items-center gap-2" data-hub-360-ledger-row={dt}>
                      <span className="chip bg-muted tabular-nums" data-no-i18n>{rc.status === "ok" || rc.status === "limited" ? rc.count : "—"}</span>
                      {rc.status === "ok" || rc.status === "limited" ? link({ kind: "list", doctype: dt, filters: [["voucher_no", "=", name]] }, label(dt), { className: "text-primary hover:underline" }) : <span className="text-muted-foreground">{label(dt)} · {pick(ar, rc.status === "denied" ? T.denied : T.unavailable)}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section data-hub-360-activity>
              <h4 className="mb-1 text-sm font-semibold">{pick(ar, T.activity)}</h4>
              <p className="text-sm"><span className="text-muted-foreground">{pick(ar, T.attachments)}:</span> <span className="tabular-nums" data-no-i18n>{files}</span> · <span className="text-muted-foreground">{pick(ar, T.comments)}:</span> <span className="tabular-nums" data-no-i18n>{comments}</span></p>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
