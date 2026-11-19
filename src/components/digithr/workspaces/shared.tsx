/** Shared helpers for the seven DIGIT HR module workspaces (V9.2). Display-only; all records through the scoped adapter. */
import { Button } from "@/components/ui/button";
import { Link, useHydrated } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { enterHrNative } from "@/components/digithr/HrNav";
import { canReadType, scopedList } from "@/plugins/digit_hr/compat/scope";
import { cachedMeta, ensureMetas } from "@/lib/catalog";
import { currentUser } from "@/plugins/digit_hr/compat/session";
import { isHrAdmin, resolveEmployee } from "@/plugins/digit_hr/compat/employeeIdentity";
import { sampleNameAr, translateTo, useLang } from "@/i18n";
import { KpiCard } from "@/components/enterprise/kit/KpiCard";
import { kpiCols } from "@/components/enterprise/kit/templates";
import { placeDoc } from "@/plugins/digit_hr/v6/nav";
import { HR_DOC_SEARCH, hrSearch } from "@/plugins/digit_hr/product/urls";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type R = any;
type Tx = (ar: string, en: string) => string;

/** Explicit presentation state for a source read, so loading/denial/error/unavailable never look like zero records.
 * These are display states only — never ERPNext workflow or document statuses. */
export type SourceRead =
  | { state: "READY_WITH_DATA"; rows: R[] } | { state: "READY_EMPTY"; rows: [] } | { state: "LOADING" }
  | { state: "DENIED" } | { state: "SOURCE_UNAVAILABLE" } | { state: "SOURCE_ERROR"; message: string };
export type SourceStateName = SourceRead["state"];
export const isReady = (r: SourceRead): r is Extract<SourceRead, { rows: R[] }> => r.state === "READY_WITH_DATA" || r.state === "READY_EMPTY";
/** Pure read: `loading` marks metadata whose load has not been attempted yet (LOADING instead of SOURCE_UNAVAILABLE). */
export function readSource(dt: string, user = currentUser(), loading = false): SourceRead {
  if (!cachedMeta(dt)) return loading ? { state: "LOADING" } : { state: "SOURCE_UNAVAILABLE" };
  if (!canReadType(dt, user)) return { state: "DENIED" };
  try { const rows = scopedList(dt, user) as R[]; return rows.length ? { state: "READY_WITH_DATA", rows } : { state: "READY_EMPTY", rows: [] }; }
  catch (e) { return { state: "SOURCE_ERROR", message: (e as Error).message }; }
}
/** Most significant non-ready state among reads (error > denied > unavailable > loading); undefined when all are ready. */
export function worstOf(reads: SourceRead[]): SourceRead | undefined {
  const rank: Partial<Record<SourceStateName, number>> = { SOURCE_ERROR: 4, DENIED: 3, SOURCE_UNAVAILABLE: 2, LOADING: 1 };
  return reads.filter((r) => !isReady(r)).sort((a, b) => (rank[b.state] ?? 0) - (rank[a.state] ?? 0))[0];
}
const STATE_TEXT: Record<SourceStateName, [string, string]> = {
  READY_WITH_DATA: ["", ""], READY_EMPTY: ["لا توجد سجلات.", "No records."], LOADING: ["جارٍ تحميل المصدر…", "Loading source…"],
  DENIED: ["لا تملك صلاحية قراءة هذا المصدر.", "You lack permission to read this source."],
  SOURCE_UNAVAILABLE: ["المصدر غير متاح حالياً.", "Source unavailable."], SOURCE_ERROR: ["تعذّر قراءة المصدر.", "Could not read source."],
};
export const stateText = (st: SourceStateName, tx: Tx) => tx(...STATE_TEXT[st]);

export function SourceState({ state, tx, children }: { state: SourceRead; tx: Tx; children: (count: number) => ReactNode }) {
  if (state.state === "READY_WITH_DATA") return <>{children(state.rows.length)}</>;
  return <p role={state.state === "READY_EMPTY" ? undefined : "status"} data-source-state={state.state} className="py-2 text-sm text-[var(--dhr-muted)]">{stateText(state.state, tx)}</p>;
}
/** Inline replacement for a number whose source is not ready: "—" (or "…" while loading), never a fabricated 0. */
export function SourceMark({ read, tx }: { read: SourceRead; tx: Tx }) {
  const label = stateText(read.state, tx);
  return <span data-source-state={read.state} title={label} aria-label={label} className="text-[var(--dhr-muted)]">{read.state === "LOADING" ? "…" : "—"}</span>;
}

/** A derived figure that cannot be inferred from the reader's scoped rows (e.g. absence hidden by row scoping): "—", never 0. */
export function NotEvaluated({ tx, why }: { tx: Tx; why: [string, string] }) {
  const label = tx(...why);
  return <span data-inference="NOT_EVALUATED" title={label} aria-label={label} className="text-[var(--dhr-muted)]">—</span>;
}

/* Metadata load tracking shared by every mounted workspace: LOADING until one attempt completes, then SOURCE_UNAVAILABLE if still unknown. */
const metaTried = new Set<string>();
const metaInflight = new Map<string, Promise<void>>();
function loadMetas(dts: string[]): Promise<void> {
  return Promise.all(dts.map((dt) => {
    if (metaTried.has(dt)) return Promise.resolve();
    let p = metaInflight.get(dt);
    if (!p) { p = ensureMetas([dt]).catch(() => undefined).finally(() => { metaTried.add(dt); metaInflight.delete(dt); }); metaInflight.set(dt, p); }
    return p;
  })).then(() => undefined);
}

export interface Sources {
  /** Explicit state for one source (memoized per render). */
  read(dt: string): SourceRead;
  /** Rows when the source is ready; [] otherwise — pair every count with `v`/`empty`/notice so [] never reads as zero. */
  rows(dt: string): R[];
  ready(...dts: string[]): boolean;
  worst(...dts: string[]): SourceRead | undefined;
  /** The value when all sources are ready, else a state mark. */
  v(value: ReactNode, ...dts: string[]): ReactNode;
  /** Empty-state text for a genuine zero, else the source state. */
  empty(...dts: string[]): ReactNode;
  issues(): { dt: string; read: SourceRead }[];
  tx: Tx;
}
/** State-aware replacement for the former `safe()` reader: one hook per workspace, all reads through the scoped adapter. */
export function useSources(tx: Tx): Sources {
  const hydrated = useHydrated();
  const user = currentUser();
  const [, bump] = useState(0);
  const want = useRef<string[]>([]);
  const seen = new Map<string, SourceRead>();
  want.current = [];
  const read = (dt: string): SourceRead => {
    const hit = seen.get(dt); if (hit) return hit;
    let r: SourceRead;
    if (!hydrated) r = { state: "LOADING" };
    else { r = readSource(dt, user, !metaTried.has(dt)); if (!cachedMeta(dt) && !metaTried.has(dt)) want.current.push(dt); }
    seen.set(dt, r); return r;
  };
  useEffect(() => {
    const need = [...new Set(want.current)];
    if (!need.length) return;
    let alive = true;
    void loadMetas(need).then(() => { if (alive) bump((x) => x + 1); });
    return () => { alive = false; };
  });
  const api: Sources = {
    tx, read,
    rows: (dt) => { const r = read(dt); return isReady(r) ? r.rows : []; },
    ready: (...dts) => dts.every((dt) => isReady(read(dt))),
    worst: (...dts) => worstOf(dts.map(read)),
    v: (value, ...dts) => { const w = api.worst(...dts); return w ? <SourceMark read={w} tx={tx} /> : value; },
    empty: (...dts) => { const w = api.worst(...dts); return w ? <SourceState state={w} tx={tx}>{() => null}</SourceState> : <Empty tx={tx} />; },
    issues: () => [...seen.entries()].filter(([, r]) => !isReady(r)).map(([dt, r]) => ({ dt, read: r })),
  };
  return api;
}
/** Lists every source this workspace could not read, by state. Renders after the parent's reads, so the list is complete. */
export function SourceNotice({ src, quietLoading }: { src: Sources; /** loading is shown elsewhere (SourcesPill + skeletons); only real problems render */ quietLoading?: boolean }) {
  const issues = src.issues().filter((i) => !quietLoading || i.read.state !== "LOADING"); if (!issues.length) return null;
  const by = new Map<SourceStateName, string[]>();
  for (const i of issues) by.set(i.read.state, [...(by.get(i.read.state) ?? []), i.dt]);
  const onlyLoading = by.size === 1 && by.has("LOADING");
  return (
    <div role="status" data-source-notice={[...by.keys()].join(" ")} className={onlyLoading ? "text-[11px] text-[var(--dhr-muted)]" : "dhr-alert text-sm"}>
      {[...by.entries()].map(([st, dts]) => <div key={st} data-source-state={st}>{stateText(st, src.tx)} <span className="text-[11px] opacity-80" data-no-i18n>{dts.map((d) => src.tx(translateTo(d, "ar"), d)).join(" · ")}</span></div>)}
      {by.has("DENIED") && <EssDirection tx={src.tx} />}
    </div>
  );
}
/** True for a signed-in user linked to an active Employee who holds no HR role (an employee or line manager). */
export function isEssUser(user = currentUser()): boolean { return resolveEmployee(user).state === "linked" && !isHrAdmin(user); }

/**
 * NB1-04: when an employee meets HR-team panels they cannot read, point them to their own self-service instead of a bare
 * denial. Presentation only — access is unchanged and no restricted figure is shown.
 */
export function EssDirection({ tx, compact }: { tx: (ar: string, en: string) => string; compact?: boolean }) {
  if (!isEssUser()) return null;
  return (
    <p className={compact ? "mt-1 text-[12px]" : "mt-1.5 text-[12.5px]"} data-ess-direction>
      {compact ? null : <>{tx("هذه اللوحات لفريق الموارد البشرية. طلباتك وأرصدتك ووثائقك في مساحتك.", "These panels are for the HR team. Your requests, balances and documents are in your own workspace.")} </>}
      <Link to="/digit-hr/m/$module" params={{ module: "05" }} className="dhr-link font-medium">{tx("افتح مساحتي للموارد البشرية", "Open My HR workspace")}</Link>
    </p>
  );
}
export const s = (v: unknown) => (v == null ? "" : String(v));
export const n = (v: unknown) => Number(v || 0);
export const live = (r: R) => Number(r.docstatus ?? 0) !== 2;
export const drafts = (rows: R[]) => rows.filter((d) => n(d.docstatus) === 0);

/** Start → end, isolated left-to-right so an Arabic line reads start → end instead of reversed. Missing ends show "…". */
export function DateRange({ from, to, className }: { from: unknown; to?: unknown; className?: string | undefined }) {
  return <bdi dir="ltr" data-no-i18n data-date-range className={`inline-block whitespace-nowrap${className ? ` ${className}` : ""}`}>{s(from) || "…"} → {s(to) || "…"}</bdi>;
}

/** Link to a native register (optionally filtered) or record via nativeMap; plain text when unmapped. */
export function Native({ dt, name, filters, module, className, children }: { dt: string; name?: string | undefined; filters?: unknown[][] | undefined; module?: string | undefined; className?: string | undefined; children: ReactNode }) {
  const p = placeDoc(dt, module);
  if (!p) return <span className={className}>{children}</span>;
  const go = () => enterHrNative(p.sub);
  return name
    ? <Link to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: p.app, doctype: p.slug, name }} onClick={go} className={className}>{children}</Link>
    : <Link to="/app/$app/$doctype" params={{ app: p.app, doctype: p.slug }} search={hrSearch(filters?.length ? { filters: JSON.stringify(filters) } : {}) as never} onClick={go} className={className}>{children}</Link>;
}

export function Panel({ title, hint, children, className }: { title: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`dhr-card rounded-[14px] p-4 ${className ?? ""}`}>
      <h2 className="mb-1 text-sm font-semibold">{title}</h2>
      {hint && <p className="mb-2 text-[11px] text-[var(--dhr-muted)]">{hint}</p>}
      {children}
    </section>
  );
}

export function Empty({ tx }: { tx: (ar: string, en: string) => string }) {
  return <p className="py-3 text-sm text-[var(--dhr-muted)]">{tx("لا توجد سجلات.", "No records.")}</p>;
}

export function Chip({ children, tone }: { children: ReactNode; tone?: "warn" | "danger" | "neutral" | undefined }) {
  return <span className="dhr-badge" data-tone={tone ?? "neutral"}>{children}</span>;
}

/** Grouped distribution bars drilled to the filtered native list. */
const AR_BASE: Record<string, string> = { "Night Shift": "الوردية الليلية", "Storekeeper": "أمين مستودع", "Annual Leave": "إجازة سنوية", "Casual Leave": "إجازة عارضة", "Approved": "معتمد", "Cancelled": "ملغى", "Open": "مفتوح", "Rejected": "مرفوض", "Pending": "معلق", "Work From Home": "عمل عن بعد", "DDT Monthly 2026": "هيكل راتب شهري 2026", "Digit Synthetic Co": "شركة ديجيت التجريبية", Male: "ذكر", Female: "أنثى", Unpaid: "غير مدفوع", Administrator: "مدير النظام", HR: "الموارد البشرية", IT: "تقنية المعلومات", Accountant: "محاسب", Technician: "فني", "Finance Manager": "مدير المالية", "Warehouse Supervisor": "مشرف المستودع", "HR Manager": "مدير الموارد البشرية", "IT Manager": "مدير تقنية المعلومات", "Systems Engineer": "مهندس أنظمة", "Operations Manager": "مدير العمليات", "HR Officer": "أخصائي موارد بشرية", "Sales Executive": "تنفيذي مبيعات", "Sales Manager": "مدير المبيعات", "Branch": "الفرع", "Grade": "الدرجة", "Employment Type": "نوع التوظيف", "Day Shift": "الوردية النهارية", "Huda Synthetic": "هدى التجريبية", "Lama Applicant": "لمى المتقدمة", "Yousef Applicant": "يوسف المتقدم", "Reem Applicant": "ريم المتقدمة", "Faisal Applicant": "فيصل المتقدم", "Mona Applicant": "منى المتقدمة", "Khalid Applicant": "خالد المتقدم", "Noor Applicant": "نور المتقدمة", "Prepare laptop and accounts": "تجهيز الحاسب والحسابات", "Issue access badge": "إصدار بطاقة الدخول", "Policy acknowledgement": "الإقرار بالسياسات", "Welcome meeting with manager": "لقاء ترحيبي مع المدير", "Standard office onboarding": "تهيئة مكتبية قياسية", "Financial Reporting": "التقارير المالية", "Bank Reconciliation": "التسويات البنكية", "ERP Systems": "أنظمة تخطيط الموارد", "Spreadsheet Modelling": "النمذجة بالجداول", Finance: "المالية", Warehouse: "المستودع", "Human Resources": "الموارد البشرية", Operations: "العمليات", Sales: "المبيعات", Purchasing: "المشتريات", Management: "الإدارة", Marketing: "التسويق", Accounting: "المحاسبة", "Operations and Warehousing": "العمليات والمستودعات", Entry: "مبتدئ", Professional: "مهني", Senior: "أول", Lead: "قيادي", Executive: "تنفيذي" };
/** Display-only: translate a record label's base, keep its company suffix (e.g. "Finance - SYN"). */
const LEAVE_AR: Record<string, string> = { "Hajj Leave": "إجازة حج", "Leave Without Pay": "إجازة بدون راتب", "Maternity Leave": "إجازة أمومة", "Paternity Leave": "إجازة أبوة", "Compensatory Off": "إجازة تعويضية" };
export function arLabel(k: string): string {
  const [first, ...rest] = k.split(" - ");
  const base = first ?? k;
  const translated = translateTo(base, "ar");
  const t = AR_BASE[base] ?? LEAVE_AR[base] ?? (translated !== base ? translated : sampleNameAr(base) ?? base);
  return rest.length ? `${t} - ${rest.join(" - ")}` : t;
}
export function Bars({ rows, field, dt, tx, extraFilters }: { rows: R[]; field: string; dt: string; tx: (a: string, b: string) => string; extraFilters?: unknown[][] }) {
  const g = Object.entries(rows.reduce<Record<string, number>>((a, r) => { const k = s(r[field]) || "—"; a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!g.length) return <Empty tx={tx} />;
  const max = Math.max(...g.map(([, v]) => v));
  return (
    <ul className="space-y-1.5">
      {g.map(([k, v]) => (
        <li key={k}>
          <Native dt={dt} filters={[[field, k === "—" ? "is" : "=", k === "—" ? "not set" : k], ...(extraFilters ?? [])]} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-2 rounded px-1 py-1 text-xs hover:bg-[var(--dhr-neutral)]">
            <span className="truncate" data-no-i18n>{k === "—" ? k : tx(arLabel(k), k)}</span>
            <span className="h-2.5 rounded-full bg-[var(--dhr-neutral)]"><span className="block h-full rounded-full bg-[var(--dhr-emerald)]" style={{ width: `${(v / max) * 100}%` }} /></span>
            <span className="text-end font-semibold" data-no-i18n>{v}</span>
          </Native>
        </li>
      ))}
    </ul>
  );
}

/* ---------- V9.3 shared working-surface primitives (display-only; rows always come from scoped records) ---------- */

/** One compact metric bar (replaces rows of equal KPI cards). Each value can drill to its exact source. */
/** HR summary counters on the shared Enterprise KPI cards (owner HR-01 / BUG-01): coloured cards with icon tiles in the shared
 *  KPI grid, which wraps a card to the next row instead of squeezing its text (never one letter per line). */
export function StatRow({ items }: { items: { label: string; value: ReactNode; tone?: "warn" | "danger" | "ok" | undefined; hint?: string | undefined }[] }) {
  const ar = useLang() === "ar"; const n = items.length;
  return (
    <section className="ek-kpis dhr-kpis" aria-label={ar ? "الملخص" : "Summary"} data-hr-statrow={n}>
      <div className="ek-kpi-grid" style={{ ["--ek-kpi-n" as string]: String(Math.max(1, n)), ["--ek-kpi-rest" as string]: String(Math.max(1, n)), ["--ek-kpi-cols" as string]: String(kpiCols(n)) }}>
        {items.map((it) => <KpiCard key={it.label} ar={ar} label={it.label} value={<span data-no-i18n>{it.value}</span>} meta={it.hint} tone={it.tone === "warn" ? "attention" : it.tone === "danger" ? "risk" : it.tone === "ok" ? "good" : undefined} attrs={{ "data-hr-stat": it.tone ?? "" }} />)}
      </div>
    </section>
  );
}

export { WorkTable, type Col, type Group } from "../EnterpriseRegister";

/** Shared DIGIT Enterprise categorical palette (enterprise.css --dx-chart-N): distinct hues, not shades of one green. */
const DONUT_COLORS = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)", "var(--cat-6)", "var(--cat-other)"];
/** Share chart with legend + accessible table alternative; each segment/legend row drills to the filtered register. */
export function Donut({ rows, field, dt, tx, extraFilters }: { rows: R[]; field: string; dt: string; tx: (a: string, b: string) => string; extraFilters?: unknown[][] }) {
  const g = Object.entries(rows.reduce<Record<string, number>>((a, r) => { const k = s(r[field]) || "—"; a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!g.length) return <Empty tx={tx} />;
  const total = g.reduce((a, [, v]) => a + v, 0); let acc = 0;
  const C = 2 * Math.PI * 40;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0 -rotate-90" role="img" aria-label={tx("مخطط الحصص", "Share chart")}>
        {g.map(([k, v], i) => { const len = (v / total) * C; const el = <circle key={k} cx="50" cy="50" r="40" fill="none" stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />; acc += len; return el; })}
      </svg>
      <table className="min-w-0 flex-1 text-xs"><tbody>
        {g.map(([k, v], i) => (
          <tr key={k}><td className="!p-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} /></td>
            <td className="!p-1" data-no-i18n><Native dt={dt} filters={[[field, k === "—" ? "is" : "=", k === "—" ? "not set" : k], ...(extraFilters ?? [])]} className="hover:underline">{k === "—" ? tx("غير محدد", "Not set") : tx(arLabel(k), k)}</Native></td>
            <td className="!p-1 text-end font-semibold" data-no-i18n>{v}</td><td className="!p-1 text-end text-[var(--dhr-muted)]" data-no-i18n>{Math.round((v / total) * 100)}%</td></tr>
        ))}
      </tbody></table>
    </div>
  );
}
