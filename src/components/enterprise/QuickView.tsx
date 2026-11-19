/**
 * DIGIT Enterprise shared surfaces: Quick View (side panel / split view on desktop, bottom drawer on phones, or a centred
 * dialog — the user's choice is remembered). Any voucher, party, item, account, report row or KPI can open here without
 * leaving the screen: documents show their summary, key figures and actions (open, edit, print, copy link); KPIs show the
 * contributing documents with the same drill. Reads are permission-checked through scope.ts (unreadable → plain text).
 * Core component, app-agnostic: apps pass targets only.
 */
import { Link } from "@tanstack/react-router";
import { masterName } from "@/lib/coreShared/masterName";
import { useEffect, useRef, useSyncExternalStore, type ComponentType, type MouseEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { cachedMeta, indexQuery } from "@/lib/catalog";
import { useStoreVersion, type Doc } from "@/lib/adapter";
import { scopedGet, scopedList } from "@/lib/scope";
import { currentUser, hasPerm, useSessionUser } from "@/lib/session";
import { matchFilter, type Filter } from "@/lib/desk";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { useLang, t as tr } from "@/i18n";
import { isPlainClick } from "@/lib/reportLinks";
import { accountSnapshot, itemSnapshot, partySnapshot } from "@/lib/coreShared/docInsight";
import { DocDrawerBody } from "./DocDrawer";
import { useUnderBand } from "./underBand";

export type QuickTarget = { kind: "doc"; doctype: string; name: string } | { kind: "list"; doctype: string; filters: Filter[]; title: string }
  /** a full ranked list / breakdown a card shows only the top of ("Show all", owner 2026-11-12 evening §8) */
  | { kind: "content"; title: string; sub?: string; node: ReactNode; doctype?: undefined };
export type QuickMode = "panel" | "dialog";
/** `rows` = the list order behind a drawer (↑/↓ walk it); `peek` keeps ?peek=<name> in the address while open (Round 1 §7). */
type State = { target: QuickTarget | null; mode: QuickMode; history: QuickTarget[]; rows?: string[] | undefined; peek?: boolean | undefined };
const MODE_KEY = "digit-virtual-core:quick-view-mode";
let state: State = { target: null, mode: "panel", history: [] };
const subs = new Set<() => void>();
const emit = (s: State) => { state = s; subs.forEach((f) => f()); };
let trigger: HTMLElement | null = null;
export function openQuickView(t: QuickTarget, from?: HTMLElement | null, opts?: { rows?: string[] | undefined; peek?: boolean | undefined; replace?: boolean | undefined }) {
  if (from) trigger = from;
  const mode = opts?.peek ? "panel" : typeof localStorage !== "undefined" && localStorage.getItem(MODE_KEY) === "dialog" ? "dialog" : state.mode;
  // ↑ / ↓ inside a list (replace) keep the history; a new opening from inside the panel adds the current one to Back
  const history = opts?.replace ? state.history : state.target && !opts?.peek ? [...state.history, state.target].slice(-8) : [];
  emit({ target: t, mode, history, rows: opts?.rows ?? (opts?.peek || opts?.replace ? state.rows : undefined), peek: opts?.peek });
}
export function closeQuickView() { emit({ ...state, target: null, history: [], rows: undefined, peek: undefined }); trigger?.focus(); trigger = null; }
/** Opens a list row in the drawer (row click, not the name link): the list stays visible, ↑/↓ walk `rows`, the URL keeps ?peek. */
export function peekRow(doctype: string, name: string, rows: string[], from?: HTMLElement | null) { openQuickView({ kind: "doc", doctype, name }, from, { rows, peek: true }); }
/** Address sync of the drawer: ?peek=<name>&peek_dt=<doctype> while a peeked row is open. */
function syncPeek(s: State) {
  if (typeof window === "undefined") return;
  const u = new URL(window.location.href);
  const want = s.peek && s.target?.kind === "doc" ? s.target : null;
  if (want) { u.searchParams.set("peek", want.name); u.searchParams.set("peek_dt", want.doctype); } else if (u.searchParams.has("peek")) { u.searchParams.delete("peek"); u.searchParams.delete("peek_dt"); } else return;
  if (u.href !== window.location.href) window.history.replaceState(window.history.state, "", u.href);
}
subs.add(() => syncPeek(state));
export function quickBack() { const h = [...state.history]; const t = h.pop() ?? null; emit({ ...state, target: t, history: h }); }
export function setQuickMode(m: QuickMode) { try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } emit({ ...state, mode: m }); }
export const quickViewState = () => state;
const useQV = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => state, () => state);

const slug = (dt: string) => dt.toLowerCase().replace(/ /g, "_");
const s = (v: unknown) => String(v ?? "");
const TITLE = ["title", "customer_name", "supplier_name", "item_name", "account_name", "employee_name", "party_name", "asset_name", "project_name", "subject"];
const PARTY = ["customer", "supplier", "party", "party_name", "employee"];
const DATE = ["posting_date", "transaction_date", "schedule_date", "due_date", "creation"];
const AMOUNT = ["grand_total", "rounded_total", "paid_amount", "total_debit", "total", "gross_purchase_amount", "valuation_rate", "standard_rate", "amount"];
/** Display summary of any document (generic field-name conventions of ERPNext). */
export function quickSummary(d: Doc) {
  const pick = (ks: string[]) => ks.find((k) => d[k] !== undefined && d[k] !== null && d[k] !== "");
  const ds = Number(d.docstatus ?? 0);
  const amountKey = pick(AMOUNT); const out = Number(d["outstanding_amount"] ?? NaN);
  return {
    title: pick(TITLE) ? s(d[pick(TITLE)!]) : "",
    status: s(d["status"]) || (ds === 1 ? "Submitted" : ds === 2 ? "Cancelled" : "Draft"),
    docstatus: ds,
    party: pick(PARTY) ? { field: pick(PARTY)!, value: s(d[pick(PARTY)!]) } : null,
    date: pick(DATE) ? s(d[pick(DATE)!]).slice(0, 10) : "",
    amount: amountKey ? { field: amountKey, value: Number(d[amountKey] ?? 0) } : null,
    outstanding: Number.isFinite(out) ? out : null,
    currency: s(d["currency"] || d["company_currency"] || d["paid_from_account_currency"]) || undefined,
    company: s(d["company"]),
  };
}
/** Documents behind a KPI / list drill, read with the session user's permissions. */
export function quickListRows(doctype: string, filters: Filter[], user = currentUser()): Doc[] {
  const m = cachedMeta(doctype); if (!m || !hasPerm(m, "read", undefined, user)) return [];
  return scopedList(doctype, user).filter((d) => hasPerm(m, "read", d, user) && filters.every((f) => matchFilter(d, f)));
}
/** One permission-checked document read (role read + User Permission scope). */
export function quickGet(doctype: string, name: string, user = currentUser()): Doc | undefined {
  const m = cachedMeta(doctype); const d = scopedGet(doctype, name, user);
  return d && m && hasPerm(m, "read", d, user) ? d : undefined;
}

/** Link that opens the Quick View on a plain click (modifier / middle click keeps the normal full-page link). */
export function QuickLink({ doctype, name, children, className }: { doctype: string; name: string; children?: ReactNode; className?: string }) {
  const idx = useQuery(indexQuery); useSessionUser();
  const entry = idx.data?.find((e) => e.name === doctype);
  // owner notes A-07: a party / item / employee / project link shows its name; the code stays in the tooltip
  const label = children ?? masterName(doctype, name); const tip = children === undefined && label !== name ? name : undefined;
  if (!entry || !quickGet(doctype, name)) return <span data-no-i18n className={className} title={tip}>{label}</span>;
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => { if (!isPlainClick(e)) return; e.preventDefault(); openQuickView({ kind: "doc", doctype, name }, e.currentTarget); };
  return <Link to="/app/$app/$doctype/$name" params={{ app: entry.app, doctype: entry.slug, name }} onClick={onClick} aria-haspopup="dialog" data-quick-link={`${doctype}:${name}`}
    className={className ?? "font-medium text-primary hover:underline"} title={tip} data-no-i18n>{label}</Link>;
}
/** Customer / supplier figures inside the Quick View (balance, overdue, credit used, open orders); hidden when the viewer cannot read the invoices. */
function PartyFigures({ doctype, name }: { doctype: "Customer" | "Supplier"; name: string }) {
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en); const user = useSessionUser();
  const p = partySnapshot(doctype, name, "", user);
  if (!p) return null;
  return <>{p.hold?.held && <p className="ent-frame mb-2 p-2 text-sm text-destructive" role="status" data-qv-hold={p.hold.release || "open"}>{ar ? p.hold.message[1] : p.hold.message[0]}</p>}
  <div className="ent-qv-figs" data-qv-party-figs={doctype} data-qv-balance={p.balance} data-qv-overdue={p.overdue}>
    <div className="ent-qv-fig"><span>{doctype === "Customer" ? t("Receivable", "الذمم المدينة") : t("Payable", "الذمم الدائنة")}</span><b data-no-i18n>{fmtCurrency(p.balance, "SAR")}</b></div>
    <div className="ent-qv-fig"><span>{t("Overdue", "متأخر السداد")}</span><b data-no-i18n className={p.overdue > 0 ? "text-destructive" : ""}>{fmtCurrency(p.overdue, "SAR")}</b>
      <small className="text-xs text-muted-foreground">{ar ? `${p.overdueCount} فاتورة` : `${p.overdueCount} invoice(s)`}</small></div>
    {p.creditLimit !== null && <div className="ent-qv-fig" data-qv-credit={p.creditUsedPct ?? 0}><span>{t("Credit used", "الائتمان المستخدم")}</span>
      <b data-no-i18n className={(p.creditUsedPct ?? 0) > 100 ? "text-destructive" : ""}>{`${p.creditUsedPct ?? 0}%`}</b><small className="text-xs text-muted-foreground" data-no-i18n>{fmtCurrency(p.creditLimit, "SAR")}</small></div>}
    <div className="ent-qv-fig"><span>{t("Open orders", "أوامر مفتوحة")}</span><b data-no-i18n>{p.openOrders}</b>
      {p.lastInvoice && <small className="text-xs text-muted-foreground">{t("Last invoice", "آخر فاتورة")} <bdi data-no-i18n>{fmtDate(p.lastInvoice)}</bdi></small>}</div>
  </div></>;
}

/** Account balance, totals and its latest ledger rows, with the General Ledger pre-filtered to the account (R2-G-08). */
function AccountFigures({ name }: { name: string }) {
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en); const user = useSessionUser();
  const a = accountSnapshot(name, user);
  if (!a) return null;
  const search = { filters: JSON.stringify({ ...(a.company ? { company: a.company } : {}), account: [name] }) };
  return <div className="grid gap-2" data-qv-account={name} data-qv-account-balance={a.balance}>
    <div className="ent-qv-figs">
      <div className="ent-qv-fig"><span>{t("Balance", "الرصيد")}</span><b data-no-i18n>{fmtCurrency(a.balance, "SAR")}</b><small className="text-xs text-muted-foreground">{a.balance >= 0 ? t("Debit", "مدين") : t("Credit", "دائن")}</small></div>
      <div className="ent-qv-fig"><span>{t("Ledger rows", "قيود الدفتر")}</span><b data-no-i18n>{a.entries}</b></div>
    </div>
    {a.last.length > 0 && <table className="ent-qv-table"><thead><tr><th>{t("Date", "التاريخ")}</th><th>{t("Voucher", "السند")}</th><th>{t("Amount", "المبلغ")}</th></tr></thead>
      <tbody>{a.last.map((r) => <tr key={`${r.voucher_type}:${r.voucher_no}:${r.amount}`}><td data-no-i18n>{fmtDate(r.date)}</td>
        <td><button type="button" className="text-primary hover:underline" onClick={() => openQuickView({ kind: "doc", doctype: r.voucher_type, name: r.voucher_no })} data-no-i18n>{r.voucher_no}</button></td>
        <td className="tabular-nums" data-no-i18n>{fmtCurrency(r.amount, "SAR")}</td></tr>)}</tbody></table>}
    <Link to="/report/$name" params={{ name: "General Ledger" }} search={search as never} className="btn-ghost justify-self-start" onClick={closeQuickView} data-qv-account-gl>{t("Open in General Ledger", "فتح في دفتر الأستاذ العام")}</Link>
  </div>;
}
/** Item stock on hand by warehouse, quantity on open purchase orders and the last purchase rate. */
function ItemFigures({ code }: { code: string }) {
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en); const user = useSessionUser();
  const it = itemSnapshot(code, user);
  if (!it) return null;
  return <div className="grid gap-2" data-qv-item={code} data-qv-onhand={it.onHand}>
    <div className="ent-qv-figs">
      <div className="ent-qv-fig"><span>{t("On hand", "المتوفر")}</span><b data-no-i18n>{`${it.onHand} ${it.uom}`.trim()}</b></div>
      <div className="ent-qv-fig"><span>{t("On order", "تحت الطلب")}</span><b data-no-i18n>{it.onOrder}</b></div>
      {it.lastRate !== null && <div className="ent-qv-fig"><span>{t("Last purchase rate", "آخر سعر شراء")}</span><b data-no-i18n>{fmtCurrency(it.lastRate, "SAR")}</b></div>}
    </div>
    {it.warehouses.length > 0 && <ul className="grid gap-0.5 text-sm" data-qv-item-wh={it.warehouses.length}>{it.warehouses.slice(0, 6).map((w) => <li key={w.warehouse} className="flex justify-between gap-2"><bdi data-no-i18n className="truncate">{w.warehouse}</bdi><span className="tabular-nums" data-no-i18n>{w.qty}</span></li>)}</ul>}
  </div>;
}

/** Button that opens a KPI's contributing documents in the Quick View. */
export function QuickKpiButton({ doctype, filters, title, children, className }: { doctype: string; filters: Filter[]; title: string; children: ReactNode; className?: string }) {
  return <button type="button" className={className} aria-haspopup="dialog" data-quick-kpi={doctype} onClick={(e) => openQuickView({ kind: "list", doctype, filters, title }, e.currentTarget)}>{children}</button>;
}

/** SH-031 cross-app record identity: the app a record's type belongs to (catalog app), so a record opened from another
 * app says where it lives. Product names only — no framework names. */
const HOME_APP: Record<string, [string, string]> = {
  erpnext: ["DIGIT Pro", "ديجيت برو"], hrms: ["DIGIT HR", "ديجيت للموارد البشرية"], crm: ["DIGIT CRM", "ديجيت لإدارة العملاء"],
  frappe: ["DIGIT Enterprise", "ديجيت إنتربرايز"], digit_construction: ["DIGIT Construction", "ديجيت للمقاولات"], digit_hr: ["DIGIT HR", "ديجيت للموارد البشرية"],
  digit_pro: ["DIGIT Pro", "ديجيت برو"], digit_crm: ["DIGIT CRM", "ديجيت لإدارة العملاء"], digit_fsm: ["DIGIT Services", "ديجيت للخدمات"],
};
export function recordHomeApp(app: string | undefined): [string, string] { return HOME_APP[app ?? ""] ?? HOME_APP["frappe"]!; }

/** An app's own drawer body for one DocType (CRM C4 A-07 / D-10: lead and deal quick view). The host keeps the frame —
 *  side panel, ↑/↓ through the list behind the row, Esc, ?peek=<name> — and the app draws only the body. */
export type DrawerBodyProps = { d: Doc; ar: boolean; head: (title: ReactNode, sub: ReactNode, extra?: ReactNode) => ReactNode; close: () => void };
const drawerBodies = new Map<string, ComponentType<DrawerBodyProps>>();
export function registerDrawerBody(doctype: string, body: ComponentType<DrawerBodyProps>) { drawerBodies.set(doctype, body); }

/** A drill-list row's party by name (owner notes A-07): the row's own name field, else the party master's name. */
function partyName(d: Doc, p: { field: string; value: string } | null | undefined): string {
  if (!p?.value) return "";
  const own = d[`${p.field === "party" ? "party" : p.field}_name`];
  if (typeof own === "string" && own.trim()) return own;
  const dt = p.field === "party" ? s(d["party_type"]) : p.field === "customer" ? "Customer" : p.field === "supplier" ? "Supplier" : p.field === "employee" ? "Employee" : "";
  return dt ? masterName(dt, p.value) : p.value;
}
/** Marks the row of the open document (data-qv-current) and clears the previous one. */
function markCurrent(tg: { doctype: string; name: string } | null) {
  if (typeof document === "undefined") return;
  document.querySelectorAll("[data-qv-current]").forEach((el) => el.removeAttribute("data-qv-current"));
  if (!tg) return;
  const n = CSS.escape(tg.name);
  const hits = [...document.querySelectorAll(`[data-shell-main] :is([data-r1-peek-row="${n}"], [data-row="${n}"], [data-quick-link="${CSS.escape(`${tg.doctype}:${tg.name}`)}"], [data-dx-row="${n}"], [data-rl-row="${n}"]), .ent-qv [data-qv-row="${n}"]`)];
  const from = trigger && document.contains(trigger) ? [trigger] : [];
  for (const el of hits.length ? hits : from) (el.closest("tr, li, [role=row]") ?? el).setAttribute("data-qv-current", "");
}

/** Mounted once by the shared Shell. */
export function QuickViewHost() {
  const st = useQV(); useStoreVersion(); const user = useSessionUser();
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!st.target) return; box.current?.focus(); const f = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeQuickView();
    // ↑ / ↓ walk the list behind a peeked row (not while typing)
    const tg = state.target; const rows = state.rows;
    // ↑ / ↓ inside a drill list move the selected row (Enter opens it, Back returns to the list)
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && tg?.kind === "list" && box.current && !(e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable=true]"))) {
      const btns = [...box.current.querySelectorAll<HTMLButtonElement>(".ent-qv-li")];
      if (btns.length) {
        e.preventDefault();
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        const j = i < 0 ? (e.key === "ArrowDown" ? 0 : btns.length - 1) : Math.min(btns.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)));
        btns.forEach((b, k) => b.toggleAttribute("data-qv-current", k === j)); btns[j]!.focus(); btns[j]!.scrollIntoView({ block: "nearest" });
      }
      return;
    }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && tg?.kind === "doc" && rows?.length && !(e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable=true]"))) {
      const i = rows.indexOf(tg.name); const j = i + (e.key === "ArrowDown" ? 1 : -1);
      if (i >= 0 && j >= 0 && j < rows.length) { e.preventDefault(); openQuickView({ kind: "doc", doctype: tg.doctype, name: rows[j]! }, null, { rows, peek: state.peek, replace: true }); }
    }
  }; window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, [st.target]);
  // a shared address with ?peek=<name> opens that row's drawer
  useEffect(() => {
    const u = new URL(window.location.href); const name = u.searchParams.get("peek"); const dt = u.searchParams.get("peek_dt");
    if (name && dt && !state.target && quickGet(dt, name, user)) openQuickView({ kind: "doc", doctype: dt, name }, null, { peek: true });
  }, [user]);
  const idx = useQuery(indexQuery);
  // owner notes A-03: the panel opens under the green band (never over it), full height below it
  useUnderBand(!!st.target);
  // the row behind the open document stays highlighted (list, drill list, report row or card) while the panel is open
  useEffect(() => { markCurrent(st.target?.kind === "doc" ? st.target : null); }, [st.target]);
  const tg = st.target; if (!tg) return null;
  const entry = tg.doctype ? idx.data?.find((e) => e.name === tg.doctype) : undefined;
  const app = entry?.app ?? "erpnext"; const dts = entry?.slug ?? slug(tg.doctype ?? "");
  const head = (title: ReactNode, sub: ReactNode, extra?: ReactNode) => <header className="ent-qv-head" data-qv-head>
    {st.history.length > 0 && <button type="button" className="ent-qv-icon" onClick={quickBack} aria-label={t("Back", "رجوع")} data-qv-back><span className="rtl:-scale-x-100 inline-block">‹</span></button>}
    <div className="min-w-0 flex-1"><p className="ent-qv-kicker">{sub}</p><h2 className="ent-qv-title">{title}</h2>{extra && <div className="ent-qv-extra" data-qv-extra>{extra}</div>}</div>
    <div className="ent-qv-modes" role="radiogroup" aria-label={t("View as", "طريقة العرض")}>
      {(["panel", "dialog"] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={st.mode === m} className="ent-qv-mode" onClick={() => setQuickMode(m)} data-qv-mode={m}>{m === "panel" ? t("Side panel", "لوحة جانبية") : t("Dialog", "نافذة")}</button>)}
    </div>
    <button type="button" className="ent-qv-icon" onClick={closeQuickView} aria-label={t("Close", "إغلاق")} data-qv-close>×</button>
  </header>;
  let body: ReactNode;
  if (tg.kind === "doc") {
    const d = quickGet(tg.doctype, tg.name, user);
    const pos = st.rows ? st.rows.indexOf(tg.name) : -1;
    const Custom = drawerBodies.get(tg.doctype);
    if (!d) body = <>{head(<bdi data-no-i18n>{tg.name}</bdi>, tr(tg.doctype))}<p className="ent-qv-empty" data-qv-denied>{t("Not permitted or not found.", "غير مسموح أو غير موجود.")}</p></>;
    else if (Custom) body = <><Custom d={d} ar={ar} head={head} close={closeQuickView} />
        {pos >= 0 && st.rows && <p className="r1-dr-nav" data-r1-dr-pos={pos + 1}><span aria-hidden>↑ ↓</span> {t("Row", "الصف")} <bdi data-no-i18n>{pos + 1}</bdi> {t("of", "من")} <bdi data-no-i18n>{st.rows.length}</bdi> · Esc</p>}</>;
    else if (!["Customer", "Supplier", "Account", "Item"].includes(tg.doctype)) {
      // documents open as the Enterprise drawer (Round 1 §7); masters keep their figure panels below
      body = <><DocDrawerBody doctype={tg.doctype} d={d} app={app} dts={dts} ar={ar} onClose={closeQuickView} head={head} />
        {pos >= 0 && st.rows && <p className="r1-dr-nav" data-r1-dr-pos={pos + 1}><span aria-hidden>↑ ↓</span> {t("Row", "الصف")} <bdi data-no-i18n>{pos + 1}</bdi> {t("of", "من")} <bdi data-no-i18n>{st.rows.length}</bdi> · Esc</p>}</>;
    } else {
      const q = quickSummary(d);
      const tone = q.docstatus === 2 ? "ent-qv-tone-bad" : q.docstatus === 1 ? "ent-qv-tone-ok" : "ent-qv-tone-draft";
      body = <>
        {head(<bdi data-no-i18n>{q.title && q.title !== tg.name ? q.title : tg.name}</bdi>, <>{tr(tg.doctype)}{q.title && q.title !== tg.name ? <> · <bdi className="r1-mono" data-no-i18n>{tg.name}</bdi></> : null}</>,
          <><span className={`ent-qv-status ${tone}`}>{tr(q.status)}</span>{q.amount && <b className="ent-qv-amount" data-no-i18n>{fmtCurrency(q.amount.value, q.currency)}</b>}</>)}
        <div className="ent-qv-body" data-qv-doc={`${tg.doctype}:${tg.name}`}>
          <div className="flex flex-wrap items-center gap-2"><span className="ent-qv-chip font-medium" data-qv-identity={app} data-no-i18n>{recordHomeApp(app)[ar ? 1 : 0]} · {tr(tg.doctype)}</span>{q.company && <span className="ent-qv-chip" data-no-i18n>{q.company}</span>}{q.date && <span className="ent-qv-chip" data-no-i18n>{fmtDate(q.date)}</span>}</div>
          <div className="ent-qv-figs">
            {q.amount && <div className="ent-qv-fig"><span>{t("Amount", "المبلغ")}</span><b data-no-i18n>{fmtCurrency(q.amount.value, q.currency)}</b></div>}
            {q.outstanding !== null && <div className="ent-qv-fig"><span>{t("Outstanding", "المتبقي")}</span><b data-no-i18n className={q.outstanding > 0 ? "text-destructive" : ""}>{fmtCurrency(q.outstanding, q.currency)}</b></div>}
          </div>
          {(tg.doctype === "Customer" || tg.doctype === "Supplier") && <PartyFigures doctype={tg.doctype} name={tg.name} />}
          {tg.doctype === "Account" && <AccountFigures name={tg.name} />}
          {tg.doctype === "Item" && <ItemFigures code={tg.name} />}
          {q.party && <p className="ent-qv-row"><span>{tr(q.party.field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))}</span>
            {(() => { const pdt = q.party.field === "party" ? s(d["party_type"]) : q.party.field === "party_name" ? s(d["quotation_to"]) || "Customer" : q.party.field.replace(/\b\w/g, (c) => c.toUpperCase()); return pdt ? <button type="button" className="font-medium text-primary hover:underline" onClick={() => openQuickView({ kind: "doc", doctype: pdt, name: q.party!.value })} data-qv-party data-no-i18n title={q.party.value}>{masterName(pdt, q.party.value, d)}</button> : <bdi data-no-i18n>{q.party.value}</bdi>; })()}</p>}
          {Array.isArray(d["items"]) && (d["items"] as Doc[]).length > 0 && <table className="ent-qv-table"><thead><tr><th>{t("Item", "الصنف")}</th><th>{t("Qty", "الكمية")}</th><th>{t("Amount", "المبلغ")}</th></tr></thead>
            <tbody>{(d["items"] as Doc[]).slice(0, 8).map((r, i) => <tr key={i}><td><button type="button" className="text-primary hover:underline" onClick={() => openQuickView({ kind: "doc", doctype: "Item", name: s(r["item_code"]) })} data-no-i18n>{s(r["item_name"] || r["item_code"])}</button></td><td data-no-i18n className="tabular-nums">{s(r["qty"])}</td><td data-no-i18n className="tabular-nums">{fmtCurrency(Number(r["amount"] ?? 0), q.currency)}</td></tr>)}</tbody></table>}
        </div>
        <footer className="ent-qv-foot">
          <Link to="/app/$app/$doctype/$name" params={{ app, doctype: dts, name: tg.name }} className="btn-primary" onClick={closeQuickView} data-qv-open>{t("Open full ↗", "فتح كامل ↗")}</Link>
          {q.docstatus === 1 && <Link to="/printview" search={{ doctype: tg.doctype, name: tg.name } as never} className="btn-ghost" onClick={closeQuickView} data-qv-print>{t("Print", "طباعة")}</Link>}
          <button type="button" className="btn-ghost" onClick={() => { void navigator.clipboard?.writeText(`${location.origin}/app/${app}/${dts}/${encodeURIComponent(tg.name)}`); }} data-qv-copy>{t("Copy link", "نسخ الرابط")}</button>
        </footer>
      </>;
    }
  } else if (tg.kind === "content") {
    body = <>{head(<span>{tg.title}</span>, tg.sub ?? "")}<div className="ent-qv-body" data-qv-content>{tg.node}</div></>;
  } else {
    const rows = quickListRows(tg.doctype, tg.filters, user);
    body = <>{head(<span>{tg.title}</span>, <>{tr(tg.doctype)} · <span data-no-i18n>{rows.length}</span></>)}
      <div className="ent-qv-body" data-qv-list={tg.doctype} data-count={rows.length}>
        {!rows.length ? <p className="ent-qv-empty">{t("No documents.", "لا توجد مستندات.")}</p> : <ul className="grid gap-1">{rows.slice(0, 50).map((d) => { const q = quickSummary(d); return <li key={d.name}>
          <button type="button" className="ent-qv-li" onClick={(e) => openQuickView({ kind: "doc", doctype: tg.doctype, name: d.name }, e.currentTarget, { rows: rows.slice(0, 50).map((x) => x.name) })} data-qv-row={d.name}>
            <span className="min-w-0 flex-1 text-start"><bdi className="block truncate font-medium" data-no-i18n>{d.name}</bdi><span className="block truncate text-xs text-muted-foreground" data-no-i18n>{partyName(d, q.party) || q.title} {q.date && `· ${fmtDate(q.date)}`}</span></span>
            {q.amount && <span className="tabular-nums text-xs" data-no-i18n>{fmtCurrency(q.amount.value, q.currency)}</span>}</button></li>; })}</ul>}
      </div>
      <footer className="ent-qv-foot"><Link to="/app/$app/$doctype" params={{ app, doctype: dts }} className="btn-ghost" onClick={closeQuickView} data-qv-open-list>{t("Open the full list", "فتح القائمة كاملة")}</Link></footer></>;
  }
  return <div className={`ent-qv ent-qv-${st.mode}${st.peek ? " ent-qv-peek" : ""}`} dir={ar ? "rtl" : "ltr"} data-panel-side={ar ? "left" : "right"} data-quick-view={st.mode} data-r1-peek={st.peek ? "" : undefined}>
    <button type="button" className="ent-qv-scrim" aria-label={t("Close", "إغلاق")} onClick={closeQuickView} tabIndex={-1} />
    <div ref={box} tabIndex={-1} role="dialog" aria-modal={st.mode === "dialog"} aria-label={tg.kind === "doc" ? tg.name : tg.title} className="ent-qv-card">{body}</div>
  </div>;
}
