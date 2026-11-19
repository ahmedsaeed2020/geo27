import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * Shared building blocks of the DIGIT FSM + ITM pages. Every piece is drawn by the Enterprise frame (owner FSM round F1-01,
 * 2026-11-18): band = ContextStrip (CommandBand), cards = ek-card, KPI = Enterprise KpiCard (icon tile, featured first card),
 * state = Enterprise Pill, buttons = Enterprise btn-primary / btn-ghost, registers = Enterprise RecordList (saved views,
 * column-header sort and filter, status strip, row click → shared quick view), facts = Enterprise KeyFacts — no app theme. Every value is read from the shared
 * adapter through the scope boundary at render time; links open canonical native/app forms with the app context kept
 * (?app=digit_fsm), and record content is marked data-no-i18n so the display translation layer never rewrites it.
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import type React from "react";
import { toast } from "sonner";
import { translateTo, useLang } from "@/i18n";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { indexQuery, loadMeta } from "@/lib/catalog";
import { createDraft } from "@/lib/documentApi";
import { Open360 } from "@/components/enterprise/Open360";
import { fmtCurrency, fmtDate, fmtNumber } from "@/lib/format";
import { canReadType } from "@/lib/scope";
import { userRoles, useSessionUser, ADMIN } from "@/lib/session";
import { activeWorkflow, transitionsFor } from "@/lib/workflow";
import { pluginSlug, usePluginsVersion } from "@/plugins/runtime";
import { useActiveApp } from "@/plugins/appShell";
import { useAppModules } from "@/components/plugins/ModuleRailNav";
import { NavIcon } from "@/components/plugins/navIcons";
import { BAND_BTN, CommandBand, DxCrumbs, DxPanel, DxState, Chev, type BandMeta, type DxTone } from "@/components/digit/Experience";
import { Avatar, KeyFacts, Pill, RecordList, SlaChip, type RfTone, type RlColumn, type RlChip, type RlField, type RlRowAction, type StripTab } from "@/components/enterprise/kit";
import { slaOf, nextStep } from "../domain/workState";
import { KpiCard, KpiSlots, useLeadRow, type KpiIconKind } from "@/components/enterprise/kit/KpiCard";
import type { Delta, Tone } from "@/components/enterprise/kit/charts";
import { peekRow } from "@/components/enterprise/QuickView";
import { Children, Fragment, isValidElement, type CSSProperties } from "react";
import { DOCTYPE_AR, FSM_DOCTYPE_NAMES, FSM_DOCTYPES, OPTION_AR } from "../schema";
import { ACTION_AR } from "../workflows";
import { APP, titleOf } from "../domain/data";
import { transition, type Result } from "../domain/services";
// eslint-disable-next-line import/no-cycle -- render-time only: the switcher uses AppLink/useFx from this module
import { WorkspaceSwitcher } from "./mode";

export { APP };
const FSM_SINGLES = new Set(FSM_DOCTYPES.filter((d) => d.issingle).map((d) => d.name));
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
// Enterprise buttons (btn-primary / btn-ghost are themed by the Enterprise visual layer); sizes only are set here
const BTN_SIZE = `min-h-9 justify-center whitespace-nowrap max-md:min-h-11 disabled:cursor-not-allowed ${FOCUS}`;
export const BTN = {
  primary: `btn-primary ${BTN_SIZE}`,
  secondary: `btn-ghost ${BTN_SIZE}`,
  compact: `btn-ghost min-h-8 justify-center whitespace-nowrap px-2.5 text-xs max-md:min-h-10 disabled:cursor-not-allowed ${FOCUS}`,
  danger: `btn-ghost ${BTN_SIZE} text-destructive`,
} as const;
export const BAND = BAND_BTN;
export const INPUT = `field-input min-h-9 text-sm max-md:min-h-11 ${FOCUS}`;

/** Re-render on record, plugin and session changes; returns language helpers and the session roles. */
export function useFx() {
  useStoreVersion(); usePluginsVersion(); const user = useSessionUser();
  const ar = useLang() === "ar";
  const t = (en: string, arText: string) => (ar ? arText : en);
  const roles = userRoles(user);
  const admin = user === ADMIN || roles.includes("System Manager");
  const has = (r: string) => admin || roles.includes(r) || roles.includes("FSM Manager");
  return { ar, t, user, roles, admin, has };
}

// ---------------------------------------------------------------- formatting
export const money = (n: unknown) => (n === null || n === undefined || n === "" ? "—" : fmtCurrency(Number(n), "SAR"));
export const numTxt = (n: unknown, d = 0) => (n === null || n === undefined || n === "" || !Number.isFinite(Number(n)) ? "—" : fmtNumber(Number(n), d));
export const dateTxt = (v: unknown) => (v ? fmtDate(String(v).slice(0, 10)) : "—");
export const dtTxt = (v: unknown) => (v ? `${fmtDate(String(v).slice(0, 10))} ${String(v).slice(11, 16)}` : "—");
export const opt = (v: unknown, ar: boolean) => { const x = v === undefined || v === null ? "" : String(v); return ar ? OPTION_AR[x] ?? x : x; };
/** measurement units of template checks, shown in the screen's language (the stored unit never changes) */
const UNIT_AR: Record<string, string> = { A: "أمبير", V: "فولت", bar: "بار", kg: "كجم", min: "دقيقة", s: "ث", "°C": "°م", m: "م", mm: "مم", Pa: "باسكال", "%": "%" };
export const unitTxt = (u: string, ar: boolean) => (ar ? UNIT_AR[u] ?? u : u);
export const dtLabel = (dt: string, ar: boolean) => (ar ? DOCTYPE_AR[dt] ?? translateTo(dt, "ar") : dt);

// ---------------------------------------------------------------- navigation
/** App pages that act as the 360 view of an FSM record. */
const P360: Record<string, string> = { "FSM Service Site": "site", "FSM Device": "device", "FSM Service Agreement": "agreement", "FSM Job": "job", "FSM Deficiency": "deficiency", "FSM Inspection Run": "run", [VISIT_DT]: "visit", "FSM Technician": "technician" };
export const page360 = (dt: string, name: string) => (P360[dt] ? `${P360[dt]}/${encodeURIComponent(name)}` : "");
export function useDocRoute() {
  const idx = useQuery(indexQuery);
  return (doctype: string) => {
    if (FSM_DOCTYPE_NAMES.has(doctype)) return { app: "erpnext", slug: pluginSlug(doctype) };
    const e = idx.data?.find((x) => x.name === doctype);
    return e ? { app: e.app, slug: e.slug } : undefined;
  };
}
function Restricted() { const { t } = useFx(); return <span className="text-muted-foreground" data-restricted title={t("You do not have permission to view this record", "لا تملك صلاحية عرض هذا السجل")}>{t("Restricted", "مقيّد")}</span>; }
/** Link to a record: its 360 page when it has one (prefer360), else its canonical form; app context kept. */
export function DocRef({ doctype, name, children, className, form, title }: { doctype: string; name: unknown; children?: ReactNode; className?: string | undefined; form?: boolean; title?: boolean }) {
  const route = useDocRoute();
  const n = name === undefined || name === null ? "" : String(name);
  if (!n) return <span className="text-muted-foreground">—</span>;
  if (!canReadType(doctype)) return <Restricted />;
  const label = children ?? (title ? <span data-no-i18n>{titleOf(doctype, n)}</span> : <span data-no-i18n>{n}</span>);
  const cls = className ?? "text-primary hover:underline";
  const p = !form ? page360(doctype, n) : "";
  if (p) return <AppLink to={p} className={cls}>{label}</AppLink>;
  const r = route(doctype);
  if (!r) return <span data-no-i18n>{label}</span>;
  return <Link to="/app/$app/$doctype/$name" params={{ app: r.app, doctype: r.slug, name: n }} search={{ app: APP } as never} className={cls}>{label}</Link>;
}
/**
 * Filters of a list link. The native list reads Frappe `[field, operator, value]` triples; FSM call sites write
 * `[DocType, field, value]` (value may be `[operator, operand]`, e.g. ["in", [...]] or ["is", "set"]), which is
 * normalised here so every drill opens exactly the counted rows instead of an unfiltered list.
 */
const OPS = new Set(["=", "!=", ">", "<", ">=", "<=", "in", "not in", "like", "not like", "is", "between", "timespan"]);
export function listFilters(doctype: string, filters: [string, string, unknown][]): [string, string, unknown][] {
  return filters.map(([a, b, c]) => {
    if (a !== doctype) return [a, b, c];
    if (Array.isArray(c) && c.length === 2 && typeof c[0] === "string" && OPS.has(c[0])) return [b, c[0], c[1]];
    return [b, "=", c];
  });
}
/** Link to the (filtered) native list of a DocType. */
export function ListRef({ doctype, filters, children, className, native }: { doctype: string; filters?: [string, string, unknown][] | undefined; children: ReactNode; className?: string | undefined; native?: boolean }) {
  const route = useDocRoute(); const r = route(doctype);
  if (!r || !canReadType(doctype)) return <span>{children}</span>;
  // FSM registers open in the app's own Enterprise list (owner F1-03); the standard list is linked from its band
  if (!native && FSM_DOCTYPE_NAMES.has(doctype) && !FSM_SINGLES.has(doctype)) return <AppLink to={`list/${pluginSlug(doctype)}${filters?.length ? `?filters=${encodeURIComponent(JSON.stringify(listFilters(doctype, filters)))}` : ""}`} className={className ?? "text-primary hover:underline"}>{children}</AppLink>;
  const search = { app: APP, ...(filters?.length ? { filters: JSON.stringify(listFilters(doctype, filters)) } : {}) };
  return <Link to="/app/$app/$doctype" params={{ app: r.app, doctype: r.slug }} search={search as never} className={className ?? "text-primary hover:underline"}>{children}</Link>;
}
/** Link inside the app (page path relative to /plugins/digit_fsm/, optional query string). */
export function AppLink({ to, children, className, title, attrs }: { to: string; children: ReactNode; className?: string | undefined; title?: string | undefined; /** data-* attributes of the link (e.g. a KPI card's variant and tone) */ attrs?: Record<string, unknown> | undefined }) {
  const [path = "", qs] = to.split("?");
  const search = qs ? Object.fromEntries(new URLSearchParams(qs)) : undefined;
  if (!path) return <Link to="/plugins/$name" params={{ name: APP }} search={search as never} className={className ?? "text-primary hover:underline"} title={title} {...attrs}>{children}</Link>;
  return <Link to="/plugins/$name/$" params={{ name: APP, _splat: decodeURIComponent(path) }} search={search as never} className={className ?? "text-primary hover:underline"} title={title} {...attrs}>{children}</Link>;
}
/** New local draft of a DocType with link defaults, opened in its form (named on first save, Frappe new-doc semantics). */
export function NewDoc({ doctype, defaults = {}, label, band }: { doctype: string; defaults?: Record<string, unknown>; label: string; band?: boolean }) {
  const { t } = useFx(); const idx = useQuery(indexQuery); const route = useDocRoute(); const nav = useNavigate();
  if (!canReadType(doctype)) return null;
  const go = async () => {
    const meta = idx.data ? await loadMeta(idx.data, doctype) : undefined;
    if (!meta) { toast.error(t(`${doctype}: metadata unavailable`, `${dtLabel(doctype, true)}: البيانات الوصفية غير متاحة`)); return; }
    const r = createDraft(meta); if (!r.doc) { toast.error(r.errors.join("\n")); return; }
    adapter.insertDocQuiet(doctype, { ...r.doc, ...defaults }); adapter.flush();
    const where = route(doctype); if (where) void nav({ to: "/app/$app/$doctype/$name", params: { app: where.app, doctype: where.slug, name: r.doc.name }, search: { app: APP } as never });
  };
  return <button type="button" onClick={() => void go()} data-new-doc={doctype} className={band ? BAND.secondary : BTN.compact}><span aria-hidden>+</span> {label}</button>;
}

// ---------------------------------------------------------------- page anatomy
export interface BandSpec { question: ReactNode; basis?: ReactNode; meta?: BandMeta[]; controls?: ReactNode; actions?: ReactNode; compact?: boolean }
export function PageHeader({ title, subtitle, crumbs, band }: { title: string; subtitle?: ReactNode; crumbs?: { label: string; to: string }[]; band: BandSpec }) {
  const { t, ar } = useFx();
  const { current } = useAppModules(useActiveApp());
  const mod = current ? (ar ? current.label_ar ?? current.label : current.label) : undefined;
  const eyebrow = <>{t("DIGIT FSM + ITM", "ديجيت للخدمات الميدانية والفحص")}{mod && <> · {mod}</>}</>;
  const trail = [<AppLink key="app" to="" className="hover:text-foreground hover:underline">{t("DIGIT FSM + ITM", "ديجيت للخدمات الميدانية")}</AppLink>,
    ...(crumbs ?? []).map((c) => <AppLink key={c.to} to={c.to} className="hover:text-foreground hover:underline"><span data-no-i18n>{c.label}</span></AppLink>)];
  return (
    <>
      <WorkspaceSwitcher />
      <DxCrumbs crumbs={trail} ariaCrumbs={t("Breadcrumb", "مسار التنقل")} />
      <CommandBand icon={<NavIcon name={current?.icon} on="dark" className="h-5 w-5" />} eyebrow={eyebrow} title={<span data-no-i18n>{title}</span>}
        description={<>{band.question}{(band.basis ?? subtitle) && <span className="ek-context-basis">{band.basis ?? subtitle}</span>}</>}
        meta={band.meta} controls={band.controls} actions={band.actions} compact={band.compact} />
    </>
  );
}
export const Panel = DxPanel;
export { DxState, Chev };
/** Enterprise KPI row: each card knows its place (the first is featured; the page's first row may carry the dark card). */
export function SignalGrid({ children, cols = "auto", lead: asLead }: { children: ReactNode; cols?: "auto" | 3 | 4 | 6 | undefined; /** false: a register row (documents), never the page's lead KPI row */ lead?: boolean }) {
  const first = useLeadRow(); const lead = asLead === false ? false : first;
  const flat = (c: ReactNode): ReactNode[] => Children.toArray(c).flatMap((x) => (isValidElement(x) && x.type === Fragment ? flat((x.props as { children?: ReactNode }).children) : [x]));
  const cards = flat(children); const n = Math.max(1, Math.min(6, cols === "auto" ? cards.length : cols));
  return <div className="ek-kpi-grid mb-4" style={{ "--ek-kpi-n": n } as CSSProperties} data-signal-grid data-fsm-kpis><KpiSlots lead={lead}>{cards}</KpiSlots></div>;
}

// ---------------------------------------------------------------- status chips
const TONE: Record<string, DxTone> = {
  Active: "good", Pass: "good", Passed: "good", Fulfilled: "good", Completed: "good", Closed: "neutral", Published: "good", Reviewed: "good", "Verified Closed": "good", Approved: "good", Accessed: "good", Restored: "good", Current: "good", Resolved: "good", Reserved: "info", Renewed: "good",
  Draft: "neutral", Unscheduled: "warn", Planned: "info", Scheduled: "info", Dispatched: "info", "On Site": "info", "In Progress": "info", "Submitted for Review": "info", Due: "info", Required: "warn", Proposed: "info", Open: "warn", Quoted: "info", "Approved for Repair": "info", "Retest Pending": "warn",
  Fail: "bad", Failed: "bad", Missed: "bad", Critical: "bad", Error: "bad", Rejected: "neutral", Cancelled: "neutral", Duplicate: "neutral", Superseded: "neutral", Waived: "neutral", Expired: "neutral", Terminated: "neutral", Inactive: "neutral",
  Incomplete: "warn", Inaccessible: "warn", "No Access": "bad", "Partial Access": "warn", Untested: "warn", "Not Applicable": "neutral", Disputed: "warn", "On Hold": "warn", Suspended: "warn", Major: "warn", Minor: "neutral", Impaired: "warn", "Out of Service": "bad", "In Service": "good", Pending: "neutral",
};
const PILL: Record<DxTone, RfTone> = { good: "ok", warn: "warn", bad: "bad", info: "info", neutral: "neutral" };
export const toneOf = (v: unknown): DxTone => TONE[String(v ?? "")] ?? "neutral";
/** Record state as the Enterprise pill (one colour per state family across every FSM page). */
export function StateChip({ value }: { value: unknown }) {
  const { ar } = useFx(); const v = String(value ?? ""); if (!v) return <span className="text-muted-foreground">—</span>;
  return <Pill tone={PILL[toneOf(v)]} attrs={{ "data-state": v }}>{opt(v, ar)}</Pill>;
}

// ---------------------------------------------------------------- list cells (leads-list pattern)
/** SLA chip with the time left / over (request response → resolution; job & visit carry the request or compliance window). */
export function SlaCell({ doctype, doc }: { doctype: string; doc: Doc | Record<string, unknown> | undefined }) {
  const { ar, t } = useFx(); const x = slaOf(doctype, doc as Doc | undefined);
  if (x.state === "na") return <span className="text-muted-foreground">—</span>;
  const h = Math.abs(x.leftH); const span = h >= 48 ? t(`${Math.round(h / 24)} d`, `${Math.round(h / 24)} يوم`) : t(`${Math.max(1, Math.round(h))} h`, `${Math.max(1, Math.round(h))} س`);
  const text = x.state === "met" ? undefined : x.state === "breached" ? t(`over by ${span}`, `متجاوز ${span}`) : t(`${span} left`, `متبقٍ ${span}`);
  return <span data-sla-of={x.basis} data-sla-due={x.due} title={`${x.basis === "response" ? t("First response by", "الاستجابة قبل") : x.basis === "window" ? t("Compliance window ends", "نهاية نافذة الالتزام") : t("Resolve by", "الحل قبل")} ${dtTxt(x.due)}`}><SlaChip ar={ar} state={x.state} {...(text ? { text } : {})} /></span>;
}
/** Next step of a record with its date coloured (overdue red, today amber). */
export function NextCell({ doctype, doc }: { doctype: string; doc: Doc | Record<string, unknown> | undefined }) {
  const { ar } = useFx(); const n = nextStep(doctype, doc as Doc | undefined);
  if (!n) return <span className="text-muted-foreground">—</span>;
  return <span className="ek-next" data-next-tone={n.tone}><span>{ar ? n.label[1] : n.label[0]}</span>{n.date && <small data-no-i18n>{n.date.length > 10 ? dtTxt(n.date) : dateTxt(n.date)}</small>}</span>;
}
/** A person (technician, employee, customer) with the Enterprise avatar. */
export function PersonRef({ doctype, name }: { doctype: string; name: unknown }) {
  const n = name === undefined || name === null ? "" : String(name); if (!n) return <span className="text-muted-foreground">—</span>;
  return <span className="inline-flex min-w-0 items-center gap-2" data-person={n}><Avatar name={titleOf(doctype, n)} size={28} /><DocRef doctype={doctype} name={n} title /></span>;
}

// ---------------------------------------------------------------- actions
/** A service outcome: immediate in the Virtual Core, or the server's answer when the app runs on Frappe (frappe_apps/digit_fsm/ui). */
export type Outcome = Result | Promise<Result>;
const settle = (fn: () => Outcome, ar: boolean): Promise<Result> => Promise.resolve().then(fn).catch((e: unknown): Result => {
  const m = e instanceof Error ? e.message : String(e);
  return { ok: false, message: m || "The action could not be completed", message_ar: m || "تعذّر تنفيذ الإجراء" };
}).then((r) => { notify(r, ar); return r; });
export function notify(r: Outcome, ar: boolean) { void Promise.resolve(r).then((x) => { if (x.ok) toast.success(ar ? x.message_ar : x.message); else toast.error(ar ? x.message_ar : x.message); }); }
/** Runs a service once (busy guard against double clicks) and shows the localized outcome; never claims success on refusal. */
export function ActionButton({ label, detail, run, disabled, reason, primary, band, compact, onDone }: { label: string; detail?: string; run: () => Outcome; disabled?: boolean | undefined; reason?: string | undefined; primary?: boolean; band?: boolean; compact?: boolean; onDone?: (r: Result) => void }) {
  const { ar, t } = useFx(); const [busy, setBusy] = useState(false);
  const go = () => { if (busy) return; setBusy(true); void settle(run, ar).then((r) => { onDone?.(r); }).finally(() => setBusy(false)); };
  // band buttons (shared BAND_BTN) carry no disabled look, so an ineligible action is dimmed here and its reason shown as title
  const cls = band ? `${primary ? BAND.primary : BAND.secondary} disabled:cursor-not-allowed disabled:opacity-50` : compact ? BTN.compact : primary ? BTN.primary : BTN.secondary;
  return <button type="button" onClick={go} disabled={disabled || busy} aria-busy={busy} title={disabled ? reason : undefined} className={cls} data-action={label}>{busy ? t("Working…", "جارٍ التنفيذ…") : <>{label}{detail && <>: <span data-no-i18n>{detail}</span></>}</>}</button>;
}
/** Action that needs a reason (return, waive, cancel, resolve): inline field, confirm only with text. */
export function ReasonAction({ label, placeholder, run, compact, disabled }: { label: string; placeholder: string; run: (reason: string) => Outcome; compact?: boolean; disabled?: boolean }) {
  const { ar, t } = useFx(); const [open, setOpen] = useState(false); const [v, setV] = useState("");
  if (!open) return <button type="button" className={compact ? BTN.compact : BTN.secondary} disabled={disabled} onClick={() => setOpen(true)} data-reason-action={label}>{label}</button>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" data-reason-form>
      <input autoFocus className={`${INPUT} min-w-[12rem]`} value={v} placeholder={placeholder} aria-label={placeholder} onChange={(e) => setV(e.target.value)} />
      <button type="button" className={BTN.compact} disabled={!v.trim()} onClick={() => { void settle(() => run(v), ar).then((r) => { if (r.ok) { setOpen(false); setV(""); } }); }}>{t("Confirm", "تأكيد")}</button>
      <button type="button" className={BTN.compact} onClick={() => { setOpen(false); setV(""); }}>{t("Cancel", "إلغاء")}</button>
    </span>
  );
}
/** Workflow actions the session user may take on a record (shared engine; hooks may still refuse with a reason). */
export function WorkflowButtons({ doctype, doc, except = [] }: { doctype: string; doc: Doc; except?: string[] }) {
  const { ar } = useFx();
  const w = activeWorkflow(doctype); if (!w) return null;
  const ts = transitionsFor(w, doc).filter((x) => !except.includes(x.action));
  if (!ts.length) return null;
  return <>{ts.map((x) => <ActionButton key={x.action} compact label={ar ? ACTION_AR[x.action] ?? x.action : x.action} run={() => transition(doctype, doc.name, x.action)} />)}</>;
}

// ---------------------------------------------------------------- KPI cards
const KTONE: Record<DxTone, Tone | undefined> = { good: "good", warn: "attention", bad: "risk", info: "info", neutral: undefined };
/**
 * Enterprise KPI card (icon tile, featured first card of its row, change vs the comparison period when the caller has one).
 * `to` makes the whole card the drill into the report or register behind the figure.
 */
export function Kpi({ label, value, unit, tone = "neutral", basis, to, server, cta, icon, delta, spark }: { label: string; value: ReactNode; unit?: string | undefined; tone?: DxTone; basis?: ReactNode; to?: string; server?: boolean; cta?: string; icon?: KpiIconKind; delta?: Delta | undefined; spark?: number[] | undefined }) {
  const { t, ar } = useFx();
  const v = server ? undefined : <>{value}{unit ? <span className="ek-kpi-unit"> {unit}</span> : null}</>;
  const meta = <>{basis}{to && <span className="ek-kpi-open"> · {cta ?? t("Open report", "فتح التقرير")} <Chev /></span>}</>;
  return <KpiCard ar={ar} label={label} value={v ?? "—"} state={server ? t("Needs live data", "يحتاج بيانات حية") : undefined} tone={server ? undefined : KTONE[tone]} meta={meta}
    {...(icon ? { icon } : {})} {...(delta ? { delta } : {})} {...(spark ? { spark } : {})} attrs={{ "data-kpi": to ?? "" }}
    {...(to ? { Root: ({ className, children, ...rest }: { className: string; children: ReactNode } & Record<string, unknown>) => <AppLink to={to} className={`${className} ek-kpi-link`} attrs={rest}>{children}</AppLink> } : {})} />;
}

// ---------------------------------------------------------------- URL-backed filters (Back keeps the exact view)
export function useUrlState(): [Record<string, string>, (patch: Record<string, string | undefined>) => void] {
  const loc = useRouterState({ select: (s) => s.location });
  const nav = useNavigate();
  const search = useMemo(() => Object.fromEntries(Object.entries((loc.search ?? {}) as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])), [loc.search]);
  const set = (patch: Record<string, string | undefined>) => {
    const next = { ...search, ...patch }; for (const k of Object.keys(next)) if (!next[k]) delete next[k];
    void nav({ to: loc.pathname as never, search: next as never, replace: true });
  };
  return [search, set];
}

// ---------------------------------------------------------------- registers (Enterprise RecordList / compact Enterprise table)
export interface Col<T> { key: string; label: string; render?: (r: T) => ReactNode; value?: (r: T) => string | number; numeric?: boolean; className?: string; /** amount column: totalled in the footer */ money?: boolean }
const STATE_KEYS = ["workflow_state", "status", "state", "outcome", "severity"];
const HUE: Record<DxTone, string> = { good: "var(--emerald)", warn: "var(--amber)", bad: "var(--rose)", info: "var(--blue)", neutral: "var(--grey)" };
const STRIP_TONE: Record<DxTone, StripTab["tone"]> = { good: "ok", warn: "warn", bad: "bad", info: "info", neutral: "neutral" };
/**
 * Register table. Longer registers (more than eight rows) are the Enterprise RecordList: saved views, search, column-header
 * sort + filter, the status strip, column manager, footer totals, phone cards and row click → the shared quick view (Ctrl/Cmd
 * click opens the full record). Short tables inside a card are the compact Enterprise table (same look, header sort, optional
 * selection) so a three-row card never carries a filter bar.
 */
export function DataTable<T extends { name?: string } & Record<string, unknown>>({ rows, cols, empty, select, onSelect, selected, pageSize = 25, id, actions, searchable = true, doctype, title, register, bulk, kanban, groupBy }: {
  rows: T[]; cols: Col<T>[]; empty: ReactNode; select?: boolean; onSelect?: (names: string[]) => void; selected?: string[]; pageSize?: number; id?: string; actions?: (r: T) => ReactNode; searchable?: boolean; doctype?: string; title?: ReactNode;
  /** always the Enterprise RecordList (queue and register pages), whatever the row count */ register?: boolean;
  /** bulk action over the ticked rows (RecordList «تم تحديد N» bar) */ bulk?: { label: string; run: (names: string[]) => Outcome } | undefined;
  /** kanban by the state column (state order + card title / sub / amount); grouped view by the given columns */
  kanban?: { order: string[]; title: (r: T) => ReactNode; sub?: (r: T) => ReactNode; amount?: (r: T) => number; facts?: (r: T) => { label: string; value: string; tone?: "bad" }[];
    /** F3-03: card flags (severity), age text, a red card and a free card body (e.g. the deficiency chain) */
    flags?: (r: T) => { key: string; label: string; tone: "bad" | "warn" | "info" | "ok" }[]; age?: (r: T) => string | undefined; late?: (r: T) => boolean; body?: (r: T) => ReactNode } | undefined;
  groupBy?: string[] | undefined;
}) {
  const { t, ar } = useFx(); const route = useDocRoute(); const nav = useNavigate();
  const val = (r: T, c: Col<T>) => (c.value ? c.value(r) : (r[c.key] as string | number | undefined) ?? "");
  const dtOf = (r: T) => doctype ?? (typeof r["doctype"] === "string" ? String(r["doctype"]) : "");
  const keyOf = (r: T, i = 0) => String(r.name ?? i);
  const peekable = (r: T) => { const dt = dtOf(r); return !!dt && !!r.name && canReadType(dt); };
  const open = (r: T, keys: string[], el: HTMLElement) => { if (peekable(r)) peekRow(dtOf(r), String(r.name), keys, el); };
  const full = (r: T) => { const dt = dtOf(r); if (!dt || !r.name) return; const p = page360(dt, String(r.name)); if (p) { void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: p }, search: {} as never }); return; } const w = route(dt); if (w) void nav({ to: "/app/$app/$doctype/$name", params: { app: w.app, doctype: w.slug, name: String(r.name) }, search: { app: APP } as never }); };
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null); const [page, setPage] = useState(0);
  if (register || (!select && searchable && rows.length > 8)) {
    const stateCol = STATE_KEYS.map((k) => cols.find((c) => c.key === k)).find(Boolean);
    const distinct = (c: Col<T>) => [...new Set(rows.map((r) => String(val(r, c))).filter(Boolean))].sort().slice(0, 40);
    const columns: RlColumn<T>[] = [
      ...cols.map((c, i): RlColumn<T> => {
        const opts = c === stateCol || (!c.numeric && distinct(c).length <= 12 && rows.length > 12) ? distinct(c).map((v) => ({ value: v, label: opt(v, ar) })) : undefined;
        return { key: c.key, label: c.label, fixed: i === 0, minWidth: i === 0 ? 200 : c.numeric ? 90 : 120, render: (r) => (c.render ? c.render(r) : <span data-no-i18n>{String(val(r, c) || "—")}</span>), sortValue: (r) => val(r, c), filterValue: (r) => String(val(r, c)), ...(opts ? { filterOptions: opts } : {}), ...(c.numeric ? { align: "end" as const } : {}), ...(c.money ? { amount: (r: T) => Number(val(r, c)) || 0, amountText: (n: number) => money(n) } : {}) };
      }),
      ...(actions ? [{ key: "__actions", label: t("Actions", "الإجراءات"), fixed: true, render: (r: T) => <span className="flex flex-wrap justify-end gap-1.5" data-rl-stop>{actions(r)}</span> }] : []),
    ];
    const chips: RlChip<T>[] = stateCol ? [{ key: stateCol.key, label: stateCol.label, get: (r) => String(val(r, stateCol)), options: distinct(stateCol).map((v) => ({ value: v, label: opt(v, ar) })) }] : [];
    const fields: RlField<T>[] = cols.map((c) => ({ key: c.key, label: c.label, type: c.numeric ? "number" : "text", get: (r) => val(r, c) }));
    const strip = stateCol ? { of: (r: T) => String(val(r, stateCol)), tabs: (xs: T[]): StripTab[] => { const m = new Map<string, number>(); for (const r of xs) { const k = String(val(r, stateCol)); m.set(k, (m.get(k) ?? 0) + 1); } return [...m].map(([k, n]) => ({ key: k, label: [opt(k, false) || "—", opt(k, true) || "—"] as [string, string], tone: STRIP_TONE[toneOf(k)], count: n })); } } : undefined;
    const label = title ?? (doctype ? dtLabel(doctype, ar) : t("Records", "السجلات"));
    // hover actions: quick view, the 360 page when the record has one, and the full record
    const rowActions: RlRowAction<T>[] = [
      { key: "peek", label: t("Quick view", "عرض سريع"), icon: <span aria-hidden>◱</span>, run: (r, el) => open(r, rows.map((x, i) => keyOf(x, i)), el), hidden: (r) => !peekable(r) },
      { key: "360", label: t("360 view", "ملف 360"), icon: <span aria-hidden className="text-[10px] font-bold">360</span>, run: (r) => full(r), hidden: (r) => !page360(dtOf(r), String(r.name ?? "")) },
      { key: "full", label: t("Open full page", "فتح الصفحة كاملة"), icon: <span aria-hidden>↗</span>, run: (r) => { const dt = dtOf(r); const w = route(dt); if (w && r.name) void nav({ to: "/app/$app/$doctype/$name", params: { app: w.app, doctype: w.slug, name: String(r.name) }, search: { app: APP } as never }); }, hidden: (r) => !peekable(r) },
    ];
    return <div className="min-w-0" data-fsm-table={id}><RecordList<T> id={`digit_fsm:${id ?? doctype ?? "table"}`} doctype={doctype ?? `digit_fsm:${id ?? "table"}`} ar={ar} title={label} rows={rows} rowKey={(r) => keyOf(r, rows.indexOf(r))}
      views={[{ key: "all", label: t("All", "الكل"), test: () => true }]} chips={chips} fields={fields} columns={columns} {...(strip ? { strip } : {})}
      search={(r) => cols.map((c) => String(val(r, c))).join(" ") + " " + String(r.name ?? "")} onOpen={open} onOpenFull={full} empty={{ title: empty }} rowActions={rowActions}
      {...(bulk ? { bulk: [{ key: "bulk", label: bulk.label, run: (keys: string[]) => { void settle(() => bulk.run(keys), ar); } }] } : {})}
      {...(kanban && stateCol ? { kanban: { columns: [...kanban.order, ...distinct(stateCol).filter((v) => !kanban.order.includes(v))].map((k) => ({ key: k, label: opt(k, ar), hue: HUE[toneOf(k)] })), of: (r: T) => String(val(r, stateCol)),
        card: (r: T) => ({ key: keyOf(r, rows.indexOf(r)), title: kanban.title(r), ...(kanban.sub ? { sub: kanban.sub(r) } : {}), ...(kanban.amount ? { amountText: money(kanban.amount(r)) } : {}), ...(kanban.facts ? { facts: kanban.facts(r).map((x, i) => ({ key: `f${i}`, ...x })) } : {}), ...(kanban.flags ? { flags: kanban.flags(r) } : {}), ...(kanban.age ? { age: kanban.age(r) } : {}), ...(kanban.late ? { late: kanban.late(r) } : {}), ...(kanban.body ? { body: kanban.body(r) } : {}), onOpen: (el: HTMLElement) => open(r, rows.map((x, i) => keyOf(x, i)), el) }) } } : {})}
      {...(groupBy?.length ? { groups: groupBy.map((k) => { const c = cols.find((x) => x.key === k); return { key: k, label: c?.label ?? k, of: (r: T) => (c ? String(val(r, c)) : String(r[k] ?? "")), labelOf: (v: string) => opt(v, ar) || "—" }; }) } : {})} /></div>;
  }
  const sorted = sort ? (() => { const c = cols.find((x) => x.key === sort.k); return c ? [...rows].sort((a, b) => { const x = val(a, c), y = val(b, c); return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir; }) : rows; })() : rows;
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize)); const p = Math.min(page, pages - 1);
  const view = sorted.slice(p * pageSize, p * pageSize + pageSize);
  const sel = new Set(selected ?? []);
  const toggle = (n: string) => { const x = new Set(sel); if (x.has(n)) x.delete(n); else x.add(n); onSelect?.([...x]); };
  const keys = sorted.map((r, i) => keyOf(r, i));
  const onRow = (e: React.MouseEvent<HTMLElement>, r: T) => { if ((e.target as HTMLElement).closest("a, button, input, select, label, textarea")) return; if (e.metaKey || e.ctrlKey) { full(r); return; } open(r, keys, e.currentTarget); };
  return (
    <div className="min-w-0" data-fsm-table={id}>
      {!rows.length ? <DxState kind="empty" title={empty} /> : (
        <div className="ek-rl-scroll"><table className="ek-rl-table" data-compact>
          <thead><tr>
            {select && <th className="ek-rl-sel"><span className="sr-only">{t("Select", "تحديد")}</span></th>}
            {cols.map((c) => <th key={c.key} data-align={c.numeric ? "end" : undefined} aria-sort={sort?.k === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
              <span className="ek-rl-th"><button type="button" onClick={() => setSort((x) => (x?.k === c.key ? { k: c.key, dir: x.dir === 1 ? -1 : 1 } : { k: c.key, dir: 1 }))}>{c.label}<span aria-hidden className="ek-rl-arrow">{sort?.k === c.key ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span></button></span></th>)}
            {actions && <th data-align="end">{t("Actions", "الإجراءات")}</th>}
          </tr></thead>
          <tbody>{view.map((r, i) => { const k = keyOf(r, i); return (
            <tr key={k} className="ek-rl-row" tabIndex={peekable(r) ? 0 : undefined} onClick={(e) => onRow(e, r)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) open(r, keys, e.currentTarget); }} data-row={k} data-peek={peekable(r) ? "" : undefined}>
              {select && <td className="ek-rl-sel"><input type="checkbox" checked={sel.has(String(r.name))} onChange={() => toggle(String(r.name))} aria-label={`${t("Select", "تحديد")} ${String(r.name)}`} /></td>}
              {cols.map((c, ci) => <td key={c.key} data-label={c.label} data-align={c.numeric ? "end" : undefined} className={`${c.numeric ? "tabular-nums" : ""} ${c.className ?? ""}`}>{c.render ? c.render(r) : <span data-no-i18n>{String(val(r, c) || "—")}</span>}{ci === 0 && r.name && dtOf(r) ? <> <Open360 doctype={dtOf(r)} name={String(r.name)} compact /></> : null}</td>)}
              {actions && <td data-align="end"><div className="flex flex-wrap justify-end gap-1.5">{actions(r)}</div></td>}
            </tr>); })}</tbody>
        </table></div>
      )}
      {pages > 1 && (
        <footer className="ek-rl-foot"><span>{t(`${rows.length} records`, `${rows.length} سجل`)}</span>
          <span className="ek-rl-pager"><button type="button" disabled={p === 0} onClick={() => setPage(p - 1)} aria-label={t("Previous page", "الصفحة السابقة")}><span className="inline-block rtl:-scale-x-100">‹</span></button>
            <span data-no-i18n>{p + 1} / {pages}</span>
            <button type="button" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} aria-label={t("Next page", "الصفحة التالية")}><span className="inline-block rtl:-scale-x-100">›</span></button></span></footer>
      )}
    </div>
  );
}

/** Key/value grid for a record's identity section (Enterprise KeyFacts). */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return <KeyFacts items={items} />;
}
/** Not-found / denied guard for 360 pages. */
export function Missing({ doctype, name }: { doctype: string; name: string }) {
  const { t, ar } = useFx();
  const denied = !canReadType(doctype);
  return <DxState kind={denied ? "denied" : "empty"} title={denied ? t("You do not have permission to view this record", "لا تملك صلاحية عرض هذا السجل") : t("Record not found", "السجل غير موجود")} detail={<span data-no-i18n>{dtLabel(doctype, ar)} · {name}</span>} action={<AppLink to="">{t("Back to My work", "العودة إلى عملي")}</AppLink>} />;
}
