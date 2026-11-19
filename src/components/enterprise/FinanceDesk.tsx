/**
 * DIGIT Enterprise shared finance screens (Run11.1 E2, E3, E6, F1, F4, F7, F8, F9, F10, F11, F18, F19, PU8, PU13, R6, SL13):
 * cash forecast, exceptions & risks, collections (dunning levels, promises to pay, disputes, write-off reasons,
 * statements), supplier payment run with the Saudi bank file, AR/AP netting, AP control (touchless rate, processing
 * days, duplicate bills), period close, group consolidation, statement designer and recurring documents.
 * Logic lives in src/lib/coreShared (finance.ts, groupReporting.ts, recurring.ts); every app opens these screens.
 */
import { CloseOutlookPanel } from "./PlanningDesk";
import { EntTable } from "./kit/EntTable";
import { DateInput } from "@/components/form/DateInput";
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { canReadType, scopedList, useScopeMetas } from "@/lib/scope";
import { cachedMeta } from "@/lib/catalog";
import { hasPerm, userRoles, useSessionUser } from "@/lib/session";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { useLang } from "@/i18n";
import { defaultCompany } from "@/lib/sessionDefaults";
import { CORE_DT, coreSlug, isCoreDocType } from "@/lib/coreShared/doctypes";
import * as FIN from "@/lib/coreShared/finance";
import { consolidate, consolidatedOutstanding, layoutRows, renderLayout, statementLayouts, type DueSide, type LayoutRow } from "@/lib/coreShared/groupReporting";
import { FREQ_LABEL, FREQUENCIES, makeRecurring, runSchedule, schedules, type Frequency } from "@/lib/coreShared/recurring";
import { EntDialog, EntFrame } from "./Surfaces";
import { InBand } from "./bandSlot";
import { AreaChart, KpiTile, type Tone } from "./kit";
import { openQuickView, quickGet } from "./QuickView";
import { isPlainClick } from "@/lib/reportLinks";
import { CloseControls } from "./FinanceControls";
import { closeChecks, closeMonths } from "@/lib/coreShared/bankRecon";
import { CloseStrip } from "./BankRecon";
import { RequirementCards, type RequirementItem } from "./kit/RequirementCards";

type Bi = [string, string];
export const today = () => new Date().toISOString().slice(0, 10);
export const pick = (ar: boolean, b: Bi) => (ar ? b[1] : b[0]);
const slugFor = (dt: string) => (isCoreDocType(dt) ? coreSlug(dt) : dt.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
export function ListLink({ drill, children, className, ...data }: { drill: FIN.ListDrill; children: ReactNode; className?: string } & Record<`data-${string}`, string | number | undefined>) {
  return <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: slugFor(drill.doctype) }} search={{ filters: JSON.stringify(drill.filters) } as never} className={className ?? "text-primary hover:underline"} {...data}>{children}</Link>;
}
/** A document reference on a shared page: a plain click opens it in the same-screen side panel (Quick View, permission
 *  checked); Ctrl / Cmd / middle click still open the full form. A record the viewer may not read keeps the plain link. */
export function DocLink({ dt, name, children }: { dt: string; name: string; children?: ReactNode }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => { if (!isPlainClick(e) || !quickGet(dt, name)) return; e.preventDefault(); openQuickView({ kind: "doc", doctype: dt, name }, e.currentTarget); };
  return <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slugFor(dt), name }} onClick={onClick} aria-haspopup="dialog" data-quick-link={`${dt}:${name}`} className="text-primary hover:underline" data-no-i18n>{children ?? name}</Link>;
}
export function useT() { const ar = useLang() === "ar"; return { ar, t: (en: string, a: string) => (ar ? a : en) }; }
export function useCompany() {
  const user = useSessionUser(); const cos = scopedList("Company", user).map((c) => c.name);
  const [co, setCo] = useState(() => { const d = defaultCompany(user); return cos.includes(d) ? d : cos[0] ?? ""; });
  const company = cos.includes(co) ? co : cos[0] ?? "";
  return { company, setCo, cos, user, currency: String(adapter.get("Company", company)?.["default_currency"] ?? "SAR") };
}
/** Filter row of a service page: inside a ServiceRoute band it renders IN the band (company / filters and the page's main
 *  action, owner 2026-11-13); a panel reused elsewhere keeps the shared filter bar card (ONE STANDARD). */
export function Bar({ children }: { children: ReactNode }) {
  return <InBand fallback={<div className="ek-card ek-filterbar mb-3 flex flex-wrap items-end gap-3" data-fin-filters data-list-filterbar>{children}</div>}>
    <div className="ek-band-bar" data-fin-filters data-band-bar>{children}</div></InBand>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="flex flex-col gap-1 text-xs text-muted-foreground"><span>{label}</span>{children}</label>; }
export function CompanySelect({ c }: { c: ReturnType<typeof useCompany> }) { const { t } = useT(); return <Field label={t("Company", "الشركة")}><select className="field-input" value={c.company} onChange={(e) => c.setCo(e.target.value)} data-fin-company data-no-i18n>{c.cos.map((x) => <option key={x}>{x}</option>)}</select></Field>; }
export function Denied() { const { t } = useT(); return <p className="text-sm text-muted-foreground" data-fin-denied>{t("You may not read the records this screen needs.", "لا يحق لك قراءة السجلات التي تحتاجها هذه الشاشة.")}</p>; }
const KPI_TONE: Record<string, Tone> = { bad: "risk", risk: "risk", warn: "attention", attention: "attention", ok: "good", good: "good" };
/** One summary figure of a shared page, drawn as the shared kit KPI card (same look as every dashboard); `drill` opens the records behind it. */
export function Kpi({ label, value, sub, drill, tone, id }: { label: string; value: string; sub?: string; drill?: FIN.ListDrill; tone?: string; id: string }) {
  const ar = useLang() === "ar";
  return <div className="min-w-[11rem] flex-1" data-fin-kpi={id} data-tone={tone}>
    <KpiTile ar={ar} label={label} value={<bdi className="tabular-nums">{value}</bdi>} sub={sub} tone={tone ? KPI_TONE[tone] : undefined} wrap={drill ? (n) => <ListLink drill={drill} className="hover:text-primary">{n}</ListLink> : undefined} />
  </div>;
}
export const money = (v: number, cur: string) => fmtCurrency(v, cur);
/** Shared service-page table: the Enterprise list pattern (saved views, status strip, search, column filters) around the page's rows (owner OS-02). */
export function Table({ head, children, id }: { head: string[]; children: ReactNode; id: string }) {
  return <EntTable id={id} head={head}>{children}</EntTable>;
}
export const tr = "border-t border-border";

/* ------------------------------------------------------------------ band main actions (owner 2026-11-13) ------------------------------------------------------------------
 * A shared page's main action sits in the band (Bar renders into the band slot): open a new record, go to the page's
 * entry block, or export the page's table. */
/** Main action that opens a new record of `dt` (the record route prepares the draft). */
export function NewDocLink({ dt, children, ...data }: { dt: string; children: ReactNode } & Record<`data-${string}`, string | number | undefined>) {
  return <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slugFor(dt), name: "new" }} className="btn-primary" data-band-primary {...data}>{children}</Link>;
}
/** Main action that takes the user to the page's entry block (scrolls it into view and puts the cursor in its first field). */
export function GoToAction({ to, children, ...data }: { to: string; children: ReactNode } & Record<`data-${string}`, string | number | undefined>) {
  const go = () => { const el = document.querySelector(to); if (!el) return; el.scrollIntoView({ behavior: "smooth", block: "start" }); (el.querySelector("input:not([type=checkbox]),select,textarea") as HTMLElement | null)?.focus({ preventScroll: true }); };
  return <button type="button" className="btn-primary" data-band-primary onClick={go} {...data}>{children}</button>;
}
/** Main action that downloads rows the page computed (CSV, UTF-8, Excel-ready). */
export function CsvAction({ name, rows, children }: { name: string; rows: (string | number)[][]; children: ReactNode }) {
  const q = (v: string | number) => { const x = String(v); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  return <button type="button" className="btn-primary" data-band-primary data-csv-action={name} disabled={rows.length < 2} onClick={() => download(`${name}.csv`, rows.map((r) => r.map(q).join(",")).join("\n"))}>{children}</button>;
}
/** Main action of a statement-like page: downloads the page table `[data-fin-table=id]` as it reads (CSV, UTF-8, Excel-ready). */
export function TableExport({ id, name, children }: { id: string; name: string; children: ReactNode }) {
  const run = () => {
    const tb = document.querySelector(`[data-fin-table="${id}"]`); if (!tb) { toast.error("—"); return; }
    const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [...tb.querySelectorAll("tr")].map((r) => [...r.querySelectorAll("th,td")].map((c) => q((c.textContent ?? "").replace(/\s+/g, " ").trim())).join(","));
    download(`${name}.csv`, lines.join("\n"));
  };
  return <button type="button" className="btn-primary" data-band-primary data-table-export={id} onClick={run}>{children}</button>;
}

/* ------------------------------------------------------------------ E2 cash forecast ------------------------------------------------------------------ */
/** Closing-balance forecast on the shared kit AreaChart (one chart look everywhere; zero line drawn by the kit axis). */
function Line({ points, cur }: { points: { date: string; closing: number }[]; cur: string }) {
  const ar = useLang() === "ar";
  if (points.length < 2) return null;
  return <div data-fin-forecast-chart={points.length} role="img" aria-label="cash forecast"><AreaChart ar={ar} height={170} data={points.map((p) => ({ key: p.date, label: p.date, value: p.closing, data: true }))} fmt={(v) => money(v, cur)} /></div>;
}
export function CashForecastPanel({ company, currency, compact }: { company: string; currency: string; compact?: boolean }) {
  useStoreVersion(); const { ar, t } = useT();
  const [sc, setSc] = useState<FIN.Scenario>("expected");
  if (!canReadType("GL Entry") || !canReadType("Sales Invoice") || !canReadType("Purchase Invoice")) return <Denied />;
  const f = FIN.cashForecast(company, today(), sc);
  return <EntFrame id="cash-forecast" title={t("Cash forecast — 7 / 30 / 90 days", "توقع النقد — 7 / 30 / 90 يومًا")}
    note={t("Actual cash and bank balance plus expected receipts minus expected payments. Choose a scenario; click a figure for its invoices.", "رصيد النقد والبنك الفعلي مع المقبوضات المتوقعة ناقص المدفوعات المتوقعة. اختر سيناريو واضغط الرقم لعرض فواتيره.")}
    actions={<div className="flex gap-1" role="group" data-fin-scenarios>{(["expected", "conservative", "optimistic"] as const).map((k) => <button key={k} type="button" className={sc === k ? "btn-primary" : "btn-ghost"} aria-pressed={sc === k} onClick={() => setSc(k)} data-fin-scenario={k}>{pick(ar, FIN.SCENARIO_LABEL[k])}</button>)}</div>}>
    <div className="flex flex-wrap gap-2">
      <Kpi id="opening" label={t("Cash and bank today", "النقد والبنك اليوم")} value={money(f.opening, currency)} />
      {f.buckets.map((b) => <div key={b.days} className="ent-frame min-w-[12rem] flex-1 p-3" data-fin-bucket={b.days}>
        <span className="block text-xs text-muted-foreground">{t(`In ${b.days} days`, `خلال ${b.days} يومًا`)}</span>
        <bdi className={`block text-lg font-semibold tabular-nums ${b.closing < 0 ? "text-destructive" : ""}`} data-no-i18n data-fin-bucket-closing>{money(b.closing, currency)}</bdi>
        <span className="flex flex-wrap gap-2 text-[11px]"><ListLink drill={b.drillIn}>{t("In", "داخل")} <bdi data-no-i18n>{money(b.inflow, currency)}</bdi></ListLink><ListLink drill={b.drillOut}>{t("Out", "خارج")} <bdi data-no-i18n>{money(b.outflow, currency)}</bdi></ListLink></span>
      </div>)}
    </div>
    <Line points={f.weeks} cur={currency} />
    <p className={`text-xs ${f.lowest.closing < 0 ? "text-destructive" : "text-muted-foreground"}`} data-fin-lowest>{t("Lowest point", "أدنى نقطة")}: <bdi data-no-i18n>{f.lowest.date} · {money(f.lowest.closing, currency)}</bdi></p>
    {!compact && <Table id="forecast-lines" head={[t("Date", "التاريخ"), t("Document", "المستند"), t("Party", "الطرف"), t("Basis", "الأساس"), t("Amount", "المبلغ")]}>
      {f.lines.slice(0, 60).map((l) => <tr key={l.doctype + l.name} className={tr}><td className="p-2 tabular-nums" data-no-i18n>{l.date}</td><td className="p-2"><DocLink dt={l.doctype} name={l.name} /></td><td className="p-2" data-no-i18n>{l.party}</td><td className="p-2 text-xs">{pick(ar, l.basis)}</td><td className={`p-2 tabular-nums ${l.amount < 0 ? "text-destructive" : ""}`} data-no-i18n>{money(l.amount, currency)}</td></tr>)}
    </Table>}
  </EntFrame>;
}
export function CashForecastPage() { const c = useCompany(); const { t } = useT(); return <div className="space-y-3"><Bar><CompanySelect c={c} /><TableExport id="forecast-lines" name="cash-forecast">{t("Export the forecast", "تصدير التوقع")}</TableExport></Bar><CashForecastPanel company={c.company} currency={c.currency} /></div>; }

/* ------------------------------------------------------------------ E3 exceptions & risks ------------------------------------------------------------------ */
const AREA: Record<FIN.Risk["area"], Bi> = { payments: ["Payments", "المدفوعات"], receivables: ["Receivables", "الذمم المدينة"], stock: ["Stock", "المخزون"], procurement: ["Procurement", "المشتريات"] };
export function RiskBoard({ company, currency }: { company: string; currency: string }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  const risks = FIN.riskBoard(company, today(), user);
  return <EntFrame id="risk-board" title={t("Exceptions and risks", "الاستثناءات والمخاطر")} note={t("Payment, receivable, stock and procurement risks in one place; each opens exactly its records. Areas you may not read are hidden.", "مخاطر المدفوعات والذمم والمخزون والمشتريات في مكان واحد؛ كل بند يفتح سجلاته بالضبط. تُخفى المجالات التي لا يحق لك قراءتها.")}>
    <div className="grid gap-3 md:grid-cols-2">{(Object.keys(AREA) as FIN.Risk["area"][]).map((a) => { const rs = risks.filter((r) => r.area === a); if (!rs.length) return null; return <section key={a} className="ent-frame p-3" data-fin-risk-area={a}>
      <h4 className="ent-title mb-2 text-sm">{pick(ar, AREA[a])}</h4>
      <ul className="space-y-1.5 text-sm">{rs.map((r) => <li key={r.id} className="flex items-center gap-2" data-fin-risk={r.id} data-count={r.count}>
        <span className="dp-ws-sev" data-severity={r.severity} aria-hidden /><span className="flex-1">{pick(ar, r.title)}</span>
        {r.count ? <ListLink drill={r.drill} className="font-semibold tabular-nums text-primary hover:underline"><bdi data-no-i18n>{r.count}{r.amount ? ` · ${money(r.amount, currency)}` : ""}</bdi></ListLink> : <span className="text-xs text-muted-foreground">{t("None", "لا يوجد")}</span>}
      </li>)}</ul></section>; })}</div>
  </EntFrame>;
}
export function RiskBoardPage() {
  useStoreVersion(); const c = useCompany(); const { ar, t } = useT();
  const rows = [[t("Area", "المجال"), t("Risk", "الخطر"), t("Records", "السجلات"), t("Amount", "المبلغ")], ...FIN.riskBoard(c.company, today(), c.user).map((r) => [pick(ar, AREA[r.area]), pick(ar, r.title), r.count, r.amount ?? 0])];
  return <div className="space-y-3"><Bar><CompanySelect c={c} /><CsvAction name="exceptions-and-risks" rows={rows}>{t("Export the risk list", "تصدير قائمة المخاطر")}</CsvAction></Bar><RiskBoard company={c.company} currency={c.currency} /></div>; }

/* ------------------------------------------------------------------ F1 journal cards ------------------------------------------------------------------ */
export function JournalCards({ company, currency }: { company: string; currency: string }) {
  useStoreVersion(); const { ar, t } = useT();
  const cards = FIN.journalCards(company, today()).filter((c) => c.metrics.every((m) => canReadType(m.drill.doctype)));
  return <EntFrame id="journal-cards" title={t("Journals", "اليوميات")} note={t("Drafts, late and unmatched work per journal; click a line to open it.", "المسودات والمتأخر وغير المطابق لكل يومية؛ اضغط السطر لفتحه.")}>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{cards.map((c) => <div key={c.id} className="ent-frame p-3" data-fin-journal={c.id}>
      <h4 className="ent-title mb-1 text-sm">{pick(ar, c.title)}</h4>
      <ul className="space-y-1 text-xs">{c.metrics.map((m) => <li key={m.label[0]} className="flex items-center justify-between gap-2"><span className={m.tone === "bad" && m.count ? "text-destructive" : ""}>{pick(ar, m.label)}</span>
        <ListLink drill={m.drill} className="tabular-nums text-primary hover:underline" data-fin-journal-metric={m.count}><bdi data-no-i18n>{m.count}{m.amount ? ` · ${money(m.amount, currency)}` : ""}</bdi></ListLink></li>)}</ul>
    </div>)}</div>
  </EntFrame>;
}

/* ------------------------------------------------------------------ F9 / F10 / SL13 collections ------------------------------------------------------------------ */
export function CollectionsPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); useScopeMetas(["Journal Entry", "Journal Entry Account", "Communication", "Process Statement Of Accounts"]);
  const asOf = today(); FIN.refreshPromises(asOf);
  const [dlg, setDlg] = useState<null | { kind: "dun" | "promise" | "writeoff" | "statement"; row: FIN.CollectionRow }>(null);
  const [to, setTo] = useState(""); const [date, setDate] = useState(""); const [amt, setAmt] = useState(""); const [note, setNote] = useState(""); const [reason, setReason] = useState(FIN.WRITE_OFF_REASONS[0]!.id);
  const [from, setFrom] = useState(`${asOf.slice(0, 4)}-01-01`);
  if (!canReadType("Sales Invoice")) return <Denied />;
  const rows = FIN.collectionRows(c.company, asOf); const isAm = userRoles(c.user).includes("Accounts Manager") || c.user === "Administrator";
  const canPromise = !!cachedMeta(CORE_DT.paymentPromise) && hasPerm(cachedMeta(CORE_DT.paymentPromise)!, "create", undefined, c.user);
  const open = (kind: "dun" | "promise" | "writeoff" | "statement", row: FIN.CollectionRow) => { setDlg({ kind, row }); setTo(FIN.defaultRecipient(row.customer)); setDate(FIN.addDays(asOf, 7)); setAmt(String(row.outstanding)); setNote(""); };
  const due = FIN.dueStatementSchedules(asOf);
  const st = dlg?.kind === "statement" ? FIN.statementOfAccount(c.company, dlg.row.customer, from, asOf) : null;
  const act = () => {
    if (!dlg) return; const r = dlg.row;
    const res = dlg.kind === "dun" ? FIN.sendDunning(r.invoice, to, asOf, c.user) : dlg.kind === "promise" ? FIN.recordPromise(r.invoice, date, Number(amt), note, c.user) : dlg.kind === "writeoff" ? FIN.writeOff(r.invoice, reason, c.user) : FIN.sendStatement(c.company, r.customer, from, asOf, to, undefined, c.user);
    if (res.ok) { toast.success(t("Done", "تم")); setDlg(null); } else toast.error(pick(ar, res.reason));
  };
  const counts = [1, 2, 3, 4].map((l) => rows.filter((r) => r.level === l));
  return <div className="space-y-3">
    <Bar><CompanySelect c={c} /><TableExport id="collections" name="collections">{t("Export the collection list", "تصدير قائمة التحصيل")}</TableExport></Bar>
    <div className="flex flex-wrap gap-2">{FIN.DUNNING_LEVELS.map((L, i) => <Kpi key={L.level} id={`level-${L.level}`} label={`${t("Level", "المستوى")} ${L.level} · ${pick(ar, L.title)}`} value={String(counts[i]!.length)} sub={money(counts[i]!.reduce((t2, r) => t2 + r.outstanding, 0), c.currency)} drill={{ doctype: "Sales Invoice", filters: [["name", "in", counts[i]!.map((r) => r.invoice)]] }} />)}
      <Kpi id="promises" label={t("Open promises to pay", "وعود سداد مفتوحة")} value={String(rows.filter((r) => r.promise?.state === "Open").length)} drill={{ doctype: CORE_DT.paymentPromise, filters: [["company", "=", c.company], ["status", "=", "Open"]] }} />
      <Kpi id="broken" label={t("Broken promises", "وعود لم تُنفذ")} value={String(rows.filter((r) => r.promise?.state === "Broken").length)} tone="bad" drill={{ doctype: CORE_DT.paymentPromise, filters: [["company", "=", c.company], ["status", "=", "Broken"]] }} />
    </div>
    <EntFrame id="collections" title={t("Collections work list", "قائمة عمل التحصيل")} note={t("Overdue invoices with their reminder level, promise and dispute. Disputed invoices are never reminded automatically.", "الفواتير المتأخرة مع مستوى التذكير والوعد والنزاع. لا تُذكَّر الفواتير المتنازع عليها تلقائيًا.")}>
      <Table id="collections" head={[t("Invoice", "الفاتورة"), t("Customer", "العميل"), t("Days late", "أيام التأخير"), t("Outstanding", "المتبقي"), t("Level", "المستوى"), t("Promise", "الوعد"), t("Next step", "الخطوة التالية"), ""]}>
        {rows.map((r) => <tr key={r.invoice} className={tr} data-fin-collection={r.invoice} data-level={r.level}>
          <td className="p-2"><DocLink dt="Sales Invoice" name={r.invoice} /></td><td className="p-2" data-no-i18n>{r.customerName}</td><td className="p-2 tabular-nums" data-no-i18n>{r.daysLate}</td>
          <td className="p-2 tabular-nums" data-no-i18n>{money(r.outstanding, r.currency)}</td>
          <td className="p-2"><span className="ent-mint-chip">{r.level}{r.lastSent ? ` · ${t("sent", "أُرسل")} ${r.lastSent}` : ""}</span>{r.disputed && <span className="ms-1 text-xs text-destructive">{t("disputed", "متنازع")}</span>}</td>
          <td className="p-2 text-xs">{r.promise ? <span data-fin-promise={r.promise.state}><bdi data-no-i18n>{r.promise.date} · {money(r.promise.amount, r.currency)}</bdi> · {t(r.promise.state, ({ Open: "مفتوح", Kept: "منفذ", Broken: "لم يُنفذ", Cancelled: "ملغى" } as Record<string, string>)[r.promise.state] ?? r.promise.state)}</span> : "—"}</td>
          <td className="p-2 text-xs">{pick(ar, r.next)}</td>
          <td className="p-2"><div className="flex flex-wrap gap-1">
            <button type="button" className="btn-ghost" disabled={r.disputed} onClick={() => open("dun", r)} data-fin-dun>{t("Remind", "تذكير")}</button>
            {canPromise && <button type="button" className="btn-ghost" onClick={() => open("promise", r)} data-fin-promise-add>{t("Promise", "وعد")}</button>}
            <button type="button" className="btn-ghost" onClick={() => open("statement", r)} data-fin-statement>{t("Statement", "كشف حساب")}</button>
            {isAm && <button type="button" className="btn-ghost" onClick={() => open("writeoff", r)} data-fin-writeoff>{t("Write off", "شطب")}</button>}
          </div></td></tr>)}
      </Table>
    </EntFrame>
    <EntFrame id="statement-schedules" title={t("Scheduled statements", "كشوف الحساب المجدولة")} note={t("Statement schedules due now (native Process Statement Of Accounts with automatic e-mail).", "جداول كشوف الحساب المستحقة الآن (معالجة كشف الحساب الأصلية مع البريد التلقائي).")}
      actions={due.length ? <button type="button" className="btn-primary" onClick={() => { const r = FIN.runStatementSchedules(asOf, c.user); toast.success(t(`${r.sent} statements prepared`, `أُعد ${r.sent} كشف حساب`)); }} data-fin-run-statements>{t("Send due statements", "إرسال الكشوف المستحقة")}</button> : undefined}>
      {due.length ? <ul className="text-sm" data-fin-due-statements={due.length}>{due.map((p) => <li key={p.name}><DocLink dt="Process Statement Of Accounts" name={p.name} /> · {String(p["frequency"] ?? "")} · {((p["customers"] as Doc[] | undefined) ?? []).length} {t("customers", "عملاء")}</li>)}</ul> : <p className="text-sm text-muted-foreground">{t("No statement schedule is due.", "لا يوجد كشف مجدول مستحق.")}</p>}
    </EntFrame>
    <EntDialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)} title={dlg ? ({ dun: t("Send reminder", "إرسال تذكير"), promise: t("Record a promise to pay", "تسجيل وعد بالسداد"), writeoff: t("Write off the balance", "شطب الرصيد"), statement: t("Statement of account", "كشف الحساب") })[dlg.kind] : ""}
      kicker={dlg ? <bdi data-no-i18n>{dlg.row.invoice} · {dlg.row.customerName}</bdi> : undefined} size={dlg?.kind === "statement" ? "lg" : "md"}
      footer={<><button type="button" className="btn-ghost" onClick={() => setDlg(null)}>{t("Cancel", "إلغاء")}</button><button type="button" className="btn-primary" onClick={act} data-fin-dialog-ok>{dlg?.kind === "promise" ? t("Save promise", "حفظ الوعد") : dlg?.kind === "writeoff" ? t("Write off", "شطب") : t("Send", "إرسال")}</button></>}>
      {dlg && <div className="space-y-3 text-sm">
        {dlg.kind === "dun" && <><p>{t("Level", "المستوى")} {dlg.row.level}: {pick(ar, FIN.DUNNING_LEVELS[dlg.row.level - 1]!.title)}</p><Field label={t("Send to", "إرسال إلى")}><input className="field-input" value={to} onChange={(e) => setTo(e.target.value)} data-fin-to data-no-i18n /></Field></>}
        {dlg.kind === "promise" && <div className="grid gap-2 sm:grid-cols-2"><Field label={t("Promised date", "تاريخ الوعد")}><DateInput className="field-input" value={date} onChange={(e) => setDate(e.target.value)} data-fin-promise-date /></Field>
          <Field label={t("Amount", "المبلغ")}><input className="field-input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} data-fin-promise-amount data-no-i18n /></Field>
          <Field label={t("Note from the call", "ملاحظة من الاتصال")}><input className="field-input" value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>}
        {dlg.kind === "writeoff" && <><p>{t("The outstanding balance is written off to the company's write-off account with this reason.", "يُشطب الرصيد المتبقي إلى حساب الشطب للشركة بهذا السبب.")} <bdi data-no-i18n>{money(dlg.row.outstanding, dlg.row.currency)}</bdi></p>
          <Field label={t("Reason", "السبب")}><select className="field-input" value={reason} onChange={(e) => setReason(e.target.value)} data-fin-writeoff-reason>{FIN.WRITE_OFF_REASONS.map((r) => <option key={r.id} value={r.id}>{pick(ar, r.label)}</option>)}</select></Field></>}
        {dlg.kind === "statement" && st && <><div className="grid gap-2 sm:grid-cols-2"><Field label={t("From", "من")}><DateInput className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label={t("Send to", "إرسال إلى")}><input className="field-input" value={to} onChange={(e) => setTo(e.target.value)} data-no-i18n /></Field></div>
          <Table id="statement" head={[t("Date", "التاريخ"), t("Document", "المستند"), t("Debit", "مدين"), t("Credit", "دائن"), t("Balance", "الرصيد")]}>
            <tr className={tr}><td className="p-2" colSpan={4}>{t("Opening balance", "الرصيد الافتتاحي")}</td><td className="p-2 tabular-nums" data-no-i18n>{money(st.opening, dlg.row.currency)}</td></tr>
            {st.lines.map((l, i) => <tr key={i} className={tr}><td className="p-2 tabular-nums" data-no-i18n>{l.date}</td><td className="p-2"><DocLink dt={l.voucherType} name={l.voucher} /></td><td className="p-2 tabular-nums" data-no-i18n>{l.debit ? money(l.debit, dlg.row.currency) : ""}</td><td className="p-2 tabular-nums" data-no-i18n>{l.credit ? money(l.credit, dlg.row.currency) : ""}</td><td className="p-2 tabular-nums" data-no-i18n>{money(l.balance, dlg.row.currency)}</td></tr>)}
            <tr className={`${tr} font-semibold`}><td className="p-2" colSpan={4}>{t("Closing balance", "الرصيد الختامي")} · {t("overdue", "متأخر")} <bdi data-no-i18n>{money(st.overdue, dlg.row.currency)}</bdi></td><td className="p-2 tabular-nums" data-no-i18n data-fin-statement-closing>{money(st.closing, dlg.row.currency)}</td></tr>
          </Table></>}
      </div>}
    </EntDialog>
  </div>;
}

/* ------------------------------------------------------------------ F7 / PU8 payment run ------------------------------------------------------------------ */
function download(name: string, text: string) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" })); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
export function PaymentRunPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); useScopeMetas(["Payment Entry", "Payment Entry Reference", "Purchase Invoice"]);
  const asOf = today(); const [until, setUntil] = useState(FIN.addDays(asOf, 14)); const [sel, setSel] = useState<Set<string>>(new Set());
  const [rel, setRel] = useState<null | string>(null); const [why, setWhy] = useState("");
  const banks = adapter.list("Account").filter((a) => a["company"] === c.company && a["account_type"] === "Bank" && !Number(a["is_group"] ?? 0)).map((a) => a.name);
  const [bank, setBank] = useState("");
  if (!canReadType("Purchase Invoice")) return <Denied />;
  const prop = FIN.proposePaymentRun(c.company, until, asOf); const runs = adapter.list(CORE_DT.paymentRun).filter((r) => r["company"] === c.company).sort((a, b) => b.name.localeCompare(a.name));
  const canCreate = !!cachedMeta(CORE_DT.paymentRun) && hasPerm(cachedMeta(CORE_DT.paymentRun)!, "create", undefined, c.user);
  const total = prop.filter((p) => sel.has(p.invoice)).reduce((t2, p) => t2 + p.amount, 0);
  const isAm = userRoles(c.user).includes("Accounts Manager") || c.user === "Administrator";
  return <div className="space-y-3">
    <Bar><CompanySelect c={c} />{canCreate ? <button type="button" className="btn-primary" disabled={!sel.size} data-fin-create-run onClick={() => { const r = FIN.createPaymentRun(c.company, until, [...sel], asOf, c.user); if (r.ok) { toast.success(`${t("Payment run", "دفعة السداد")} ${r.name}`); setSel(new Set()); } else toast.error(pick(ar, r.reason)); }}>{t("Prepare run", "إعداد الدفعة")} · <bdi data-no-i18n>{money(total, c.currency)}</bdi></button> : undefined}<Field label={t("Pay invoices due until", "سداد المستحق حتى")}><DateInput className="field-input" value={until} onChange={(e) => setUntil(e.target.value)} data-fin-until /></Field></Bar>
    <EntFrame id="payment-proposal" title={t("Invoices to pay", "فواتير للسداد")} note={t("Invoices on hold, outside the three-way match tolerance or disputed are marked 'Do not pay' and cannot be selected until an Accounts Manager releases them.", "الفواتير الموقوفة أو الخارجة عن حدود المطابقة الثلاثية أو المتنازع عليها مُعلَّمة «لا تُسدد» ولا تُختار حتى يرفعها مدير الحسابات.")}
      >
      <Table id="payment-proposal" head={["", t("Invoice", "الفاتورة"), t("Supplier", "المورد"), t("Due", "الاستحقاق"), t("Amount", "المبلغ"), t("Status", "الحالة")]}>
        {prop.map((p) => <tr key={p.invoice} className={tr} data-fin-proposal={p.invoice} data-blocked={p.hold ? 1 : 0}>
          <td className="p-2"><input type="checkbox" disabled={!!p.hold} checked={sel.has(p.invoice)} onChange={(e) => setSel((x) => { const y = new Set(x); if (e.target.checked) y.add(p.invoice); else y.delete(p.invoice); return y; })} aria-label={p.invoice} /></td>
          <td className="p-2"><DocLink dt="Purchase Invoice" name={p.invoice} /></td><td className="p-2" data-no-i18n>{p.supplierName}</td><td className="p-2 tabular-nums" data-no-i18n>{p.due}</td><td className="p-2 tabular-nums" data-no-i18n>{money(p.amount, c.currency)}</td>
          <td className="p-2 text-xs">{p.hold ? <span className="text-destructive" data-fin-do-not-pay>{pick(ar, p.hold)}{isAm && /match/.test(p.hold[0]) && <button type="button" className="btn-ghost ms-1" onClick={() => { setRel(p.invoice); setWhy(""); }} data-fin-release>{t("Release", "رفع")}</button>}</span> : <span className="ent-mint-chip">{t("Ready", "جاهزة")}</span>}</td></tr>)}
      </Table>
    </EntFrame>
    <EntFrame id="payment-runs" title={t("Payment runs", "دفعات السداد")} note={t("A run is approved by an Accounts Manager who did not prepare it, then paid: one payment per supplier and the Saudi bank transfer file (IBAN checked).", "تُعتمد الدفعة من مدير حسابات غير من أعدّها ثم تُسدد: دفعة لكل مورد وملف التحويل البنكي السعودي (مع التحقق من الآيبان).")}>
      <Table id="payment-runs" head={[t("Run", "الدفعة"), t("Date", "التاريخ"), t("Status", "الحالة"), t("Total", "الإجمالي"), t("Prepared / approved", "أعدّها / اعتمدها"), ""]}>
        {runs.map((r) => <tr key={r.name} className={tr} data-fin-run={r.name} data-status={String(r["status"])}>
          <td className="p-2"><DocLink dt={CORE_DT.paymentRun} name={r.name} /></td><td className="p-2 tabular-nums" data-no-i18n>{String(r["run_date"] ?? "")}</td><td className="p-2"><span className="ent-mint-chip">{t(String(r["status"]), ({ Draft: "مسودة", Approved: "معتمدة", Paid: "مسددة", Cancelled: "ملغاة" } as Record<string, string>)[String(r["status"])] ?? String(r["status"]))}</span></td>
          <td className="p-2 tabular-nums" data-no-i18n>{money(Number(r["total"] ?? 0), c.currency)}</td><td className="p-2 text-xs" data-no-i18n>{String(r["prepared_by"] ?? "")} / {String(r["approved_by"] ?? "—")}</td>
          <td className="p-2"><div className="flex flex-wrap items-center gap-1">
            {r["status"] === "Draft" && isAm && <button type="button" className="btn-ghost" data-fin-approve onClick={() => { const x = FIN.approvePaymentRun(r.name, c.user); if (x.ok) toast.success(t("Approved", "اعتُمدت")); else toast.error(pick(ar, x.reason)); }}>{t("Approve", "اعتماد")}</button>}
            {r["status"] === "Approved" && <><select className="field-input" value={bank} onChange={(e) => setBank(e.target.value)} aria-label={t("Bank account", "الحساب البنكي")} data-no-i18n><option value="">{t("Pay from…", "السداد من…")}</option>{banks.map((b) => <option key={b}>{b}</option>)}</select>
              <button type="button" className="btn-primary" disabled={!bank} data-fin-pay onClick={() => { const x = FIN.executePaymentRun(r.name, bank, c.user); if (x.ok) { toast.success(t(`${x.payments.length} payments submitted; bank file prepared`, `اعتُمدت ${x.payments.length} دفعات وأُعد ملف البنك`)); if (x.refused.length) toast.warning(x.refused.map((y) => `${y.payment}: ${pick(ar, y.reason)}`).join("\n")); if (x.csv) download(`${r.name}-bank-file.csv`, x.csv); } else toast.error(pick(ar, x.reason)); }}>{t("Pay and create bank file", "سداد وإنشاء ملف البنك")}</button></>}
          </div></td></tr>)}
      </Table>
    </EntFrame>
    <EntDialog open={!!rel} onOpenChange={(o) => !o && setRel(null)} title={t("Release the match exception", "رفع استثناء المطابقة")} kicker={<bdi data-no-i18n>{rel}</bdi>}
      footer={<><button type="button" className="btn-ghost" onClick={() => setRel(null)}>{t("Cancel", "إلغاء")}</button><button type="button" className="btn-primary" data-fin-release-ok onClick={() => { const r = FIN.releaseMatch(rel!, why, c.user); if (r.ok) { toast.success(t("Released", "رُفع")); setRel(null); } else toast.error(pick(ar, r.reason!)); }}>{t("Release", "رفع")}</button></>}>
      {rel && <div className="space-y-2 text-sm"><ul className="list-disc ps-5 text-xs">{FIN.threeWayMatch(adapter.get("Purchase Invoice", rel)!).issues.map((i) => <li key={i[0]}>{pick(ar, i)}</li>)}</ul><Field label={t("Reason", "السبب")}><input className="field-input" value={why} onChange={(e) => setWhy(e.target.value)} data-fin-release-reason /></Field></div>}
    </EntDialog>
  </div>;
}

/* ------------------------------------------------------------------ F18 netting ------------------------------------------------------------------ */
export function NettingPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); useScopeMetas(["Journal Entry", "Journal Entry Account"]);
  if (!canReadType("Sales Invoice") || !canReadType("Purchase Invoice")) return <Denied />;
  const pairs = FIN.nettingPairs(c.company); const canNet = canReadType("Journal Entry") && !!cachedMeta("Journal Entry") && hasPerm(cachedMeta("Journal Entry")!, "submit", undefined, c.user);
  return <div className="space-y-3"><Bar><CompanySelect c={c} /><TableExport id="netting" name="customer-supplier-netting">{t("Export the netting list", "تصدير قائمة المقاصة")}</TableExport></Bar>
    <EntFrame id="netting" title={t("Customer and supplier netting", "مقاصة العميل والمورد")} note={t("Parties that are both a customer and a supplier (Party Link or the same name). Netting offsets the smaller balance with one contra journal, oldest invoices first.", "أطراف هي عميل ومورد معًا (ربط الأطراف أو نفس الاسم). تُقاص المقاصة الرصيد الأصغر بقيد مقاصة واحد بدءًا بأقدم الفواتير.")}>
      {pairs.length ? <Table id="netting" head={[t("Customer", "العميل"), t("Supplier", "المورد"), t("Receivable", "مدين"), t("Payable", "دائن"), t("Can net", "قابل للمقاصة"), t("Linked by", "الربط"), ""]}>
        {pairs.map((p) => <tr key={p.customer + p.supplier} className={tr} data-fin-netting={p.customer}><td className="p-2"><DocLink dt="Customer" name={p.customer} /></td><td className="p-2"><DocLink dt="Supplier" name={p.supplier} /></td>
          <td className="p-2 tabular-nums" data-no-i18n>{money(p.receivable, c.currency)}</td><td className="p-2 tabular-nums" data-no-i18n>{money(p.payable, c.currency)}</td><td className="p-2 font-semibold tabular-nums" data-no-i18n>{money(p.nettable, c.currency)}</td>
          <td className="p-2 text-xs">{p.via === "Party Link" ? t("Party Link", "ربط الأطراف") : t("Same name", "نفس الاسم")}</td>
          <td className="p-2">{canNet && <button type="button" className="btn-primary" data-fin-net onClick={() => { const r = FIN.netParty(c.company, p.customer, p.supplier, c.user); if (r.ok) toast.success(`${t("Netted", "تمت المقاصة")} ${r.journal}`); else toast.error(pick(ar, r.reason)); }}>{t("Net balances", "مقاصة الأرصدة")}</button>}</td></tr>)}
      </Table> : <p className="text-sm text-muted-foreground" data-fin-netting-none>{t("No party has open balances on both sides.", "لا يوجد طرف بأرصدة مفتوحة على الجانبين.")}</p>}
    </EntFrame></div>;
}

/* ------------------------------------------------------------------ F8 / F19 / PU13 AP control ------------------------------------------------------------------ */
export function ApControlPanel({ company }: { company: string }) {
  useStoreVersion(); const { ar, t } = useT(); const asOf = today(); const [from, setFrom] = useState(`${asOf.slice(0, 4)}-01-01`);
  if (!canReadType("Purchase Invoice")) return <Denied />;
  const m = FIN.apMetrics(company, from, asOf); const flags = FIN.billAnomalies(company);
  return <EntFrame id="ap-control" title={t("Supplier invoice processing", "معالجة فواتير الموردين")} note={t("Touchless = created from an order or receipt, within the match tolerance, never held, disputed or edited by hand. Processing days = submission minus the supplier's bill date.", "دون تدخل = أُنشئت من أمر أو استلام، ضمن حدود المطابقة، دون إيقاف أو نزاع أو تعديل يدوي. أيام المعالجة = تاريخ الاعتماد ناقص تاريخ فاتورة المورد.")}
    actions={<Field label={t("From", "من")}><DateInput className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>}>
    <div className="flex flex-wrap gap-2">
      <Kpi id="touchless" label={t("Touchless rate", "نسبة المعالجة دون تدخل")} value={`${m.touchlessPct}%`} sub={`${m.touchless} / ${m.invoices}`} drill={{ doctype: "Purchase Invoice", filters: [["name", "in", m.touchlessNames]] }} />
      <Kpi id="days" label={t("Average processing days", "متوسط أيام المعالجة")} value={String(m.avgDays)} />
      {m.buckets.map((b, i) => <Kpi key={i} id={`days-${i}`} label={pick(ar, b.label)} value={String(b.count)} drill={{ doctype: "Purchase Invoice", filters: [["name", "in", b.names]] }} />)}
    </div>
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <div><h4 className="ent-title mb-1 text-sm">{t("Needed a person", "احتاجت تدخلًا")}</h4><Table id="ap-exceptions" head={[t("Invoice", "الفاتورة"), t("Supplier", "المورد"), t("Why", "السبب")]}>{m.exceptions.slice(0, 30).map((e) => <tr key={e.invoice} className={tr}><td className="p-2"><DocLink dt="Purchase Invoice" name={e.invoice} /></td><td className="p-2" data-no-i18n>{e.supplier}</td><td className="p-2 text-xs">{pick(ar, e.reason)}</td></tr>)}</Table></div>
      <div><h4 className="ent-title mb-1 text-sm">{t("Possible duplicates and unusual rates", "تكرار محتمل وأسعار غير معتادة")}</h4>{flags.length ? <Table id="bill-flags" head={[t("Invoice", "الفاتورة"), t("Supplier", "المورد"), t("Flag", "التنبيه")]}>{flags.map((f) => <tr key={f.invoice + f.kind} className={tr} data-fin-flag={f.kind}><td className="p-2"><DocLink dt="Purchase Invoice" name={f.invoice} /></td><td className="p-2" data-no-i18n>{f.supplier}</td><td className="p-2 text-xs">{pick(ar, f.reason)}</td></tr>)}</Table> : <p className="text-sm text-muted-foreground">{t("Nothing unusual.", "لا يوجد ما يلفت.")}</p>}</div>
    </div>
  </EntFrame>;
}
export function ApControlPage() { const c = useCompany(); const { t } = useT(); const pi = cachedMeta("Purchase Invoice"); return <div className="space-y-3"><Bar><CompanySelect c={c} />{pi && hasPerm(pi, "create", undefined, c.user) && <NewDocLink dt="Purchase Invoice" data-ap-new>{t("New supplier invoice", "فاتورة مورد جديدة")}</NewDocLink>}</Bar><ApControlPanel company={c.company} /></div>; }

/* ------------------------------------------------------------------ F11 period close ------------------------------------------------------------------ */
const monthEnd = (d: string) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).toISOString().slice(0, 10);
const CLOSE_AREA_AR: Record<string, string> = { Banking: "البنوك", Receivables: "الذمم المدينة", Payables: "الذمم الدائنة", Inventory: "المخزون", "Fixed Assets": "الأصول الثابتة", Tax: "الضرائب", Journals: "القيود", Reporting: "التقارير" };
const CLOSE_DT_AR: Record<string, string> = { "Sales Invoice": "فواتير مبيعات", "Purchase Invoice": "فواتير مشتريات", "Payment Entry": "سندات دفع", "Journal Entry": "قيود يومية" };
const CLOSE_STATUS_AR: Record<string, string> = { Open: "مفتوحة", "In Progress": "قيد التنفيذ", Blocked: "متوقفة", Done: "منجزة" };
export function ClosePage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); useScopeMetas(["Accounting Period", "Period Closing Voucher", "File"]);
  const ends = [...new Set(adapter.list(CORE_DT.closeTask).filter((x) => x["company"] === c.company).map((x) => String(x["period_end"])))].sort().reverse();
  const [pe, setPe] = useState(""); const periodEnd = pe || ends[0] || monthEnd(FIN.addDays(today(), -30));
  if (!canReadType(CORE_DT.closeTask)) return <Denied />;
  const tasks = adapter.list(CORE_DT.closeTask).filter((x) => x["company"] === c.company && x["period_end"] === periodEnd).sort((a, b) => String(a["due_date"]).localeCompare(String(b["due_date"])));
  const stage = FIN.closeStage(c.company, periodEnd); const done = tasks.filter((x) => x["status"] === "Done").length;
  const isAm = userRoles(c.user).includes("Accounts Manager") || c.user === "Administrator";
  const next = FIN.CLOSE_STAGES.find((s2) => s2.stage === stage + 1);
  const advance = () => { if (!next) return; const r = FIN.advanceClose(c.company, periodEnd, c.user); if (r.ok) toast.success(pick(ar, next.title)); else toast.error(pick(ar, r.reason)); };
  return <div className="space-y-3">
    <Bar><CompanySelect c={c} />{isAm && next && <button type="button" className="btn-primary" data-band-primary data-fin-advance={next.stage} onClick={advance}>{t("Complete", "إنجاز")}: {pick(ar, next.title)}</button>}<Field label={t("Period end", "نهاية الفترة")}><select className="field-input" value={periodEnd} onChange={(e) => setPe(e.target.value)} data-fin-period data-no-i18n>{[...new Set([periodEnd, ...ends])].map((x) => <option key={x}>{x}</option>)}</select></Field></Bar>
    <div className="flex flex-wrap gap-2" data-fin-close-kpis>
      <Kpi id="close-stage" label={t("Close stage reached", "المرحلة المنجزة")} value={`${stage} / ${FIN.CLOSE_STAGES.length}`} />
      <Kpi id="close-areas" label={t("Areas in the checklist", "مجالات القائمة")} value={String(new Set(tasks.map((x) => String(x["area"] ?? "")).filter(Boolean)).size)} />
      <Kpi id="close-owners" label={t("Task owners", "مسؤولو المهام")} value={String(new Set(tasks.map((x) => String(x["owner_user"] ?? "")).filter(Boolean)).size)} />
      <Kpi id="close-days" label={periodEnd >= today() ? t("Days to period end", "أيام حتى نهاية الفترة") : t("Days since period end", "أيام منذ نهاية الفترة")} value={String(Math.abs(Math.round((Date.parse(`${periodEnd}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86_400_000)))} />
    </div>
    {(() => {
      // P2-02 (close) 12-month strip and P2-04 the checklist as requirement cards (one per area + two live checks); the table below stays
      const ms = closeMonths(c.company, today());
      const areas = [...new Set(tasks.map((x) => String(x["area"] ?? "")))];
      const st = (x: Doc) => String(x["status"] ?? "");
      const items: RequirementItem[] = areas.map((a) => {
        const list = tasks.filter((x) => String(x["area"] ?? "") === a); const open = list.filter((x) => st(x) !== "Done"); const blocked = open.filter((x) => st(x) === "Blocked").length;
        return { key: `area:${a}`, label: ar ? CLOSE_AREA_AR[a] ?? a : a, state: open.length ? "missing" : "ok", missing: open.length, ...(blocked ? { badge: ar ? `متوقفة ${blocked}` : `${blocked} blocked` } : {}),
          detail: open.length ? <ul className="space-y-0.5">{open.slice(0, 3).map((x) => <li key={x.name}><span data-no-i18n>{String(x["task"])}</span> · <span>{ar ? CLOSE_STATUS_AR[st(x)] ?? st(x) : st(x)}</span></li>)}</ul>
            : <span>{list.length} {t("task(s) done", "مهمة منجزة")}</span>,
          action: open[0] ? <DocLink dt={CORE_DT.closeTask} name={open[0].name}>{t("Open the task", "افتح المهمة")}</DocLink> : undefined };
      });
      const [bank, drafts] = closeChecks(c.company, periodEnd, c.user);
      if (bank) items.push({ key: "check:bank", label: t("Bank lines matched to period end", "مطابقة بنود البنك حتى نهاية الفترة"), state: bank.count ? "missing" : "ok", missing: bank.count,
        detail: bank.count ? <><bdi data-no-i18n>{bank.count}</bdi> {t("open statement lines", "بند كشف مفتوح")} · <bdi data-no-i18n>{money(bank.amount, c.currency)}</bdi></> : t("No open statement line on or before the period end.", "لا توجد بنود كشف مفتوحة حتى نهاية الفترة."),
        action: bank.count ? <Link to="/finance/bank-matching" className="text-primary hover:underline" data-close-go-bank>{t("Match the lines", "طابق البنود")}</Link> : undefined });
      if (drafts) { const first = Object.keys(drafts.byType)[0];
        items.push({ key: "check:drafts", label: t("No draft vouchers in the period", "لا مستندات مسودة في الفترة"), state: drafts.count ? "missing" : "ok", missing: drafts.count,
          detail: drafts.count ? <>{Object.entries(drafts.byType).map(([dt, k], i) => <span key={dt}>{i ? " · " : ""}{ar ? CLOSE_DT_AR[dt] ?? dt : dt} <bdi data-no-i18n>{k}</bdi></span>)}</> : t("Every voucher dated in the period is submitted or cancelled.", "كل مستندات الفترة معتمدة أو ملغاة."),
          action: first ? <ListLink drill={{ doctype: first, filters: [["company", "=", c.company], ["docstatus", "=", 0], ["posting_date", ">=", `${periodEnd.slice(0, 7)}-01`], ["posting_date", "<=", periodEnd]] }} className="text-primary hover:underline">{t("Open the drafts", "افتح المسودات")}</ListLink> : undefined }); }
      return <>
        <EntFrame id="close-months" title={t("Close by month — last 12 months", "الإقفال حسب الشهر — آخر 12 شهرًا")} note={t("Green: checklist complete or ledger frozen · amber: closing started · grey: not started. Select a month to open its checklist.", "أخضر: اكتملت القائمة أو جُمّد الدفتر · كهرماني: بدأ الإقفال · رمادي: لم يبدأ. اختر شهرًا لفتح قائمته.")}>
          <CloseStrip months={ms} ar={ar} current={periodEnd.slice(0, 7)} label={<bdi data-no-i18n>{c.company}</bdi>} onCell={(e) => setPe(e)} />
        </EntFrame>
        <RequirementCards items={items} ar={ar} title={<>{t("Close requirements", "متطلبات الإقفال")} · <bdi data-no-i18n>{fmtDate(periodEnd)}</bdi></>} note={t("One card per checklist area plus two live checks read from the period's records; the full checklist stays below.", "بطاقة لكل مجال في القائمة وفحصان مباشران من سجلات الفترة؛ القائمة الكاملة تبقى أدناه.")} />
      </>;
    })()}
    <EntFrame id="close-stages" title={t("Close stages", "مراحل الإقفال")}>
      <ol className="grid gap-2 md:grid-cols-3" data-fin-close-stage={stage}>{FIN.CLOSE_STAGES.map((s2) => <li key={s2.stage} className="ent-frame p-3" data-done={stage >= s2.stage ? 1 : 0}>
        <span className="ent-title text-sm">{s2.stage}. {pick(ar, s2.title)} {stage >= s2.stage && <span className="ent-mint-chip ms-1">{t("Done", "منجز")}</span>}</span>
        <p className="mt-1 text-xs text-muted-foreground">{pick(ar, s2.how)}</p>
        {isAm && stage === s2.stage - 1 && <span className="ek-chip mt-2 inline-block" data-fin-next={s2.stage}>{t("Next — complete it from the band above", "التالية — أنجزها من الشريط أعلاه")}</span>}
      </li>)}</ol>
    </EntFrame>
    <EntFrame id="close-tasks" title={t("Close checklist", "قائمة الإقفال")} note={t("Each task has an owner, a due date and evidence; attach working papers on the task's page.", "لكل مهمة مسؤول وتاريخ ودليل؛ أرفق أوراق العمل في صفحة المهمة.")}>
      <Table id="close-tasks" head={[t("Task", "المهمة"), t("Area", "المجال"), t("Owner", "المسؤول"), t("Due", "الاستحقاق"), t("Status", "الحالة"), t("Evidence", "الدليل"), t("Attachments", "المرفقات")]}>
        {tasks.map((x) => <tr key={x.name} className={tr} data-fin-close-task={x.name} data-status={String(x["status"])}><td className="p-2"><DocLink dt={CORE_DT.closeTask} name={x.name}>{String(x["task"])}</DocLink></td><td className="p-2 text-xs">{String(x["area"] ?? "")}</td>
          <td className="p-2 text-xs" data-no-i18n>{String(x["owner_user"] ?? "")}</td><td className="p-2 tabular-nums" data-no-i18n>{String(x["due_date"] ?? "")}</td><td className="p-2"><span className="ent-mint-chip">{String(x["status"])}</span></td>
          <td className="p-2 text-xs" data-no-i18n>{String(x["evidence"] ?? "")}</td><td className="p-2 tabular-nums" data-no-i18n>{FIN.attachmentsOf(CORE_DT.closeTask, x.name)}</td></tr>)}
      </Table>
    </EntFrame>
    <CloseOutlookPanel company={c.company} periodEnd={periodEnd} />
    <CloseControls company={c.company} periodEnd={periodEnd} />
  </div>;
}

/* ------------------------------------------------------------------ E6 consolidation ------------------------------------------------------------------ */
export function ConsolidationPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); const y = today().slice(0, 4);
  const [from, setFrom] = useState(`${y}-01-01`); const [to, setTo] = useState(today()); const [group, setGroup] = useState<string[] | null>(null);
  const cos = group ?? c.cos; const [cur, setCur] = useState("SAR");
  if (!canReadType("GL Entry") || !canReadType("Account")) return <Denied />;
  const r = consolidate(cos, from, to, cur); const roots: Bi[] = [["Asset", "الأصول"], ["Liability", "الخصوم"], ["Equity", "حقوق الملكية"], ["Income", "الإيرادات"], ["Expense", "المصروفات"]];
  return <div className="space-y-3">
    <Bar><TableExport id="consolidation" name="consolidated-trial-balance">{t("Export the consolidated trial balance", "تصدير الميزان الموحد")}</TableExport><Field label={t("Companies in the group", "شركات المجموعة")}><div className="flex flex-wrap gap-2" data-fin-group>{c.cos.map((x) => <label key={x} className="flex items-center gap-1 text-sm text-foreground"><input type="checkbox" checked={cos.includes(x)} onChange={(e) => setGroup(e.target.checked ? [...cos, x] : cos.filter((z) => z !== x))} /><span data-no-i18n>{x}</span></label>)}</div></Field>
      <Field label={t("From", "من")}><DateInput className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label={t("To", "إلى")}><DateInput className="field-input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      <Field label={t("Presentation currency", "عملة العرض")}><select className="field-input" value={cur} onChange={(e) => setCur(e.target.value)} data-no-i18n>{[...new Set(["SAR", ...adapter.list("Company").map((x) => String(x["default_currency"] ?? "SAR"))])].map((x) => <option key={x}>{x}</option>)}</select></Field></Bar>
    <div className="flex flex-wrap gap-2">{([["assets", "Total assets", "إجمالي الأصول"], ["liabilities", "Liabilities", "الخصوم"], ["equity", "Equity", "حقوق الملكية"], ["profit", "Profit for the period", "ربح الفترة"], ["translationReserve", "Translation reserve", "احتياطي الترجمة"]] as const).map(([k, en, a]) => <Kpi key={k} id={`consol-${k}`} label={t(en, a)} value={money(r.totals[k], cur)} />)}
      <Kpi id="consol-check" label={t("Balance check", "فحص التوازن")} value={Math.abs(r.totals.check) < 0.01 ? t("Balanced", "متوازن") : money(r.totals.check, cur)} tone={Math.abs(r.totals.check) < 0.01 ? "ok" : "bad"} /></div>
    <EntFrame id="consolidation" title={t("Consolidated trial balance", "ميزان المراجعة الموحد")} note={t("Balance sheet at the closing rate, profit and loss at the average rate; intercompany postings (parties that represent a group company) are eliminated.", "الميزانية بسعر الإقفال والأرباح والخسائر بالسعر المتوسط؛ تُستبعد القيود بين شركات المجموعة (الأطراف التي تمثل شركة في المجموعة).")}>
      <Table id="consolidation" head={[t("Account", "الحساب"), ...r.companies.map((x) => `${x.name} (${x.currency}${x.currency !== cur ? ` × ${x.closing.toFixed(4)}` : ""})`), t("Elimination", "الاستبعاد"), t("Consolidated", "الموحد")]}>
        {roots.map(([root, rAr]) => { const rows = r.rows.filter((x) => x.rootType === root); if (!rows.length) return null; return [<tr key={root} className={`${tr} bg-muted/40`}><td className="p-2 font-semibold" colSpan={r.companies.length + 3}>{ar ? rAr : root}</td></tr>,
          ...rows.map((x) => <tr key={x.key} className={tr} data-fin-consol-row={x.rootType}><td className="p-2"><ListLink drill={{ doctype: "GL Entry", filters: [["account", "in", x.accounts], ["company", "in", cos], ["is_cancelled", "=", 0]] }}><bdi data-no-i18n>{x.label}</bdi></ListLink></td>
            {r.companies.map((co) => <td key={co.name} className="p-2 tabular-nums" data-no-i18n>{money(x.translated[co.name] ?? 0, cur)}</td>)}<td className={`p-2 tabular-nums ${x.elimination ? "text-destructive" : ""}`} data-no-i18n>{x.elimination ? money(x.elimination, cur) : ""}</td><td className="p-2 font-semibold tabular-nums" data-no-i18n>{money(x.consolidated, cur)}</td></tr>)]; })}
      </Table>
      <p className="mt-2 text-xs text-muted-foreground" data-fin-eliminated={r.eliminated.length}>{t("Eliminated postings", "قيود مستبعدة")}: {r.eliminated.length}</p>
    </EntFrame>
    <ConsolidatedDues cos={cos} asOf={to} />
  </div>;
}

/** Consolidated receivables / payables of the selected group companies, per company and currency (no mixed-currency total). */
function ConsolidatedDues({ cos, asOf }: { cos: string[]; asOf: string }) {
  const { t } = useT(); const user = useSessionUser(); const [side, setSide] = useState<DueSide>("Receivable"); const [allParties, setAllParties] = useState(false);
  const dt = side === "Receivable" ? "Sales Invoice" : "Purchase Invoice";
  if (!canReadType(dt)) return <EntFrame id="consol-dues" title={t("Consolidated receivables and payables", "الذمم المدينة والدائنة الموحدة")}><Denied /></EntFrame>;
  const r = consolidatedOutstanding(cos, asOf, side, user); const pf = side === "Receivable" ? "customer" : "supplier";
  const open = (extra: [string, string, unknown][]) => ({ doctype: dt, filters: [["docstatus", "=", 1], ["outstanding_amount", "!=", 0], ["posting_date", "<=", asOf], ...extra] as FIN.ListDrill["filters"] });
  return <EntFrame id="consol-dues" title={t("Consolidated receivables and payables", "الذمم المدينة والدائنة الموحدة")} note={t("Open invoices of the selected companies as of the closing date, each in its own currency; totals are kept per currency.", "الفواتير المفتوحة لشركات المجموعة المختارة حتى تاريخ الإقفال، كلٌّ بعملتها؛ الإجماليات لكل عملة على حدة.")}>
    <div className="mb-2 flex flex-wrap items-center gap-2" data-fin-dues-side={side}>
      {(["Receivable", "Payable"] as const).map((x) => <button key={x} type="button" className={`rounded-full border px-3 py-1 text-sm ${side === x ? "border-primary bg-primary/10 font-semibold" : "border-border"}`} aria-pressed={side === x} onClick={() => setSide(x)} data-fin-dues-tab={x}>{x === "Receivable" ? t("Receivables", "الذمم المدينة") : t("Payables", "الذمم الدائنة")}</button>)}
    </div>
    <div className="mb-3 flex flex-wrap gap-2">{r.currencies.length ? r.currencies.map((c) => <Kpi key={c.currency} id={`dues-${c.currency}`} label={`${t("Open", "مفتوح")} · ${c.currency}`} value={money(c.outstanding, c.currency)} />) : <p className="text-sm text-muted-foreground">{t("No open invoices", "لا توجد فواتير مفتوحة")}</p>}</div>
    {r.groups.length > 0 && <Table id="consol-dues" head={[t("Company", "الشركة"), t("Currency", "العملة"), t("Parties", "الأطراف"), t("Invoices", "الفواتير"), t("Outstanding", "المستحق"), t("Overdue", "المتأخر")]}>
      {r.groups.map((g) => <tr key={`${g.company}|${g.currency}`} className={tr} data-fin-dues-row={`${g.company}|${g.currency}`}><td className="p-2"><bdi data-no-i18n>{g.company}</bdi></td><td className="p-2" data-no-i18n>{g.currency}</td><td className="p-2 tabular-nums" data-no-i18n>{g.parties}</td>
        <td className="p-2 tabular-nums"><ListLink drill={open([["company", "=", g.company]])}><span data-no-i18n>{g.invoices}</span></ListLink></td><td className="p-2 font-semibold tabular-nums" data-no-i18n>{money(g.outstanding, g.currency)}</td><td className={`p-2 tabular-nums ${g.overdue ? "text-destructive" : ""}`} data-no-i18n>{g.overdue ? money(g.overdue, g.currency) : "—"}</td></tr>)}
    </Table>}
    {r.parties.length > 0 && <div className="mt-3"><h4 className="mb-1 text-sm font-semibold">{side === "Receivable" ? t("By customer", "حسب العميل") : t("By supplier", "حسب المورد")}</h4>
      <Table id="consol-dues-party" head={[side === "Receivable" ? t("Customer", "العميل") : t("Supplier", "المورد"), t("Company", "الشركة"), t("Currency", "العملة"), t("Invoices", "الفواتير"), t("Outstanding", "المستحق"), t("Overdue", "المتأخر")]}>
        {r.parties.slice(0, allParties ? r.parties.length : 10).map((p) => <tr key={`${p.company}|${p.party}|${p.currency}`} className={tr} data-fin-dues-party={p.party}><td className="p-2"><ListLink drill={open([["company", "=", p.company], [pf, "=", p.party]])}><bdi data-no-i18n>{p.partyName}</bdi></ListLink>{p.intercompany && <span className="ms-1 rounded bg-muted px-1 text-[10px]">{t("Intercompany", "بين الشركات")}</span>}</td>
          <td className="p-2"><bdi data-no-i18n>{p.company}</bdi></td><td className="p-2" data-no-i18n>{p.currency}</td><td className="p-2 tabular-nums" data-no-i18n>{p.invoices}</td><td className="p-2 tabular-nums" data-no-i18n>{money(p.outstanding, p.currency)}</td><td className={`p-2 tabular-nums ${p.overdue ? "text-destructive" : ""}`} data-no-i18n>{p.overdue ? money(p.overdue, p.currency) : "—"}</td></tr>)}
      </Table>
      {r.parties.length > 10 && <button type="button" className="btn-ghost mt-2 text-sm" aria-expanded={allParties} onClick={() => setAllParties(!allParties)} data-fin-dues-more>
        {allParties ? t("Show the top 10", "عرض أعلى 10") : <>{t("Show all", "عرض الكل")} (<span data-no-i18n>{r.parties.length}</span>)</>}</button>}</div>}
  </EntFrame>;
}

/* ------------------------------------------------------------------ R6 statement designer ------------------------------------------------------------------ */
const blankRow = (): LayoutRow => ({ label: "", label_ar: "", row_type: "Accounts", root_type: "Income", account_type: "", account_prefix: "", sum_rows: "", sign: "Natural", bold: 0 });
export function StatementDesignerPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); const y = today().slice(0, 4);
  const layouts = statementLayouts(); const [name, setName] = useState(""); const cur = adapter.get(CORE_DT.statementLayout, name || layouts[0]?.name || "");
  const [draft, setDraft] = useState<null | { name: string; rows: LayoutRow[]; columns: string; basis: string }>(null);
  const [from, setFrom] = useState(`${y}-01-01`); const [to, setTo] = useState(today());
  const meta = cachedMeta(CORE_DT.statementLayout); const canEdit = !!meta && hasPerm(meta, "write", cur ?? undefined, c.user); const canCreate = !!meta && hasPerm(meta, "create", undefined, c.user);
  const work = draft ?? (cur ? { name: cur.name, rows: layoutRows(cur), columns: String(cur["columns"] ?? "Current"), basis: String(cur["basis"] ?? "Period movement") } : { name: "", rows: [blankRow()], columns: "Current", basis: "Period movement" });
  const out = useMemo(() => renderLayout(work.rows, { company: c.company, from, to, basis: work.basis, columns: work.columns }), [work, c.company, from, to]);
  if (!canReadType("GL Entry")) return <Denied />;
  const edit = (i: number, patch: Partial<LayoutRow>) => setDraft({ ...work, rows: work.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const move = (i: number, d: -1 | 1) => { const rows = [...work.rows]; const j = i + d; if (j < 0 || j >= rows.length) return; [rows[i], rows[j]] = [rows[j]!, rows[i]!]; setDraft({ ...work, rows }); };
  const save = () => {
    if (!work.name.trim()) { toast.error(t("Give the layout a name.", "سمِّ التصميم.")); return; }
    if (out.errors.length) { toast.error(pick(ar, out.errors[0]!)); return; }
    const data = { layout_name: work.name, columns: work.columns, basis: work.basis, rows: work.rows.map((r, i) => ({ idx: i + 1, ...r })) };
    if (adapter.get(CORE_DT.statementLayout, work.name)) { if (!canEdit) return; adapter.update(CORE_DT.statementLayout, work.name, data); } else { if (!canCreate) return; adapter.insertDoc(CORE_DT.statementLayout, { ...data, name: work.name }); }
    setName(work.name); setDraft(null); toast.success(t("Layout saved", "حُفظ التصميم"));
  };
  return <div className="space-y-3">
    <Bar><CompanySelect c={c} />{(canEdit || canCreate) ? <button type="button" className="btn-primary" onClick={save} data-fin-layout-save>{t("Save layout", "حفظ التصميم")}</button> : undefined}<Field label={t("Layout", "التصميم")}><select className="field-input" value={cur?.name ?? ""} onChange={(e) => { setName(e.target.value); setDraft(null); }} data-fin-layout data-no-i18n>{layouts.map((l) => <option key={l.name}>{l.name}</option>)}</select></Field>
      <Field label={t("From", "من")}><DateInput className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label={t("To", "إلى")}><DateInput className="field-input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      {canCreate && <button type="button" className="btn-ghost" onClick={() => setDraft({ name: "", rows: [blankRow()], columns: "Current | Prior period | Change", basis: "Period movement" })} data-fin-layout-new>{t("New layout", "تصميم جديد")}</button>}</Bar>
    <div className="grid gap-3 xl:grid-cols-2">
      <EntFrame id="statement-design" title={t("Design", "التصميم")} >
        <div className="mb-2 grid gap-2 sm:grid-cols-3"><Field label={t("Name", "الاسم")}><input className="field-input" value={work.name} onChange={(e) => setDraft({ ...work, name: e.target.value })} disabled={!!cur && !draft?.name && !canEdit} data-no-i18n /></Field>
          <Field label={t("Columns", "الأعمدة")}><select className="field-input" value={work.columns} onChange={(e) => setDraft({ ...work, columns: e.target.value })} data-fin-columns>{["Current", "Current | Prior period | Change", "Current | Prior year | Change", "Current | Budget | Variance"].map((x) => <option key={x} value={x}>{x.split("|").map((p) => pick(ar, ({ Current: ["Current", "الحالي"], "Prior period": ["Prior period", "الفترة السابقة"], "Prior year": ["Prior year", "السنة السابقة"], Budget: ["Budget", "الموازنة"], Change: ["Change", "التغير"], Variance: ["Variance", "الانحراف"] } as Record<string, Bi>)[p.trim()]!)).join(" | ")}</option>)}</select></Field>
          <Field label={t("Basis", "الأساس")}><select className="field-input" value={work.basis} onChange={(e) => setDraft({ ...work, basis: e.target.value })}><option value="Period movement">{t("Period movement", "حركة الفترة")}</option><option value="Balance as of date">{t("Balance as of date", "الرصيد في تاريخ")}</option></select></Field></div>
        <div className="space-y-2" data-fin-layout-rows={work.rows.length}>{work.rows.map((r, i) => <div key={i} className="grid grid-cols-2 gap-1 rounded border border-border p-2 sm:grid-cols-6">
          <input className="field-input" placeholder={t("Label", "التسمية")} value={r.label} onChange={(e) => edit(i, { label: e.target.value })} data-no-i18n />
          <input className="field-input" placeholder={t("Arabic label", "التسمية بالعربية")} value={r.label_ar ?? ""} onChange={(e) => edit(i, { label_ar: e.target.value })} data-no-i18n />
          <select className="field-input" value={r.row_type} onChange={(e) => edit(i, { row_type: e.target.value as LayoutRow["row_type"] })}><option value="Accounts">{t("Accounts", "حسابات")}</option><option value="Total">{t("Total", "إجمالي")}</option><option value="Heading">{t("Heading", "عنوان")}</option></select>
          {r.row_type === "Accounts" ? <><select className="field-input" value={r.root_type ?? ""} onChange={(e) => edit(i, { root_type: e.target.value })}>{["", "Asset", "Liability", "Equity", "Income", "Expense"].map((x) => <option key={x} value={x}>{x || "—"}</option>)}</select>
            <input className="field-input" placeholder={t("Name/number starts with", "الاسم/الرقم يبدأ بـ")} value={r.account_prefix ?? ""} onChange={(e) => edit(i, { account_prefix: e.target.value })} data-no-i18n /></>
            : r.row_type === "Total" ? <input className="field-input col-span-2" placeholder={t("Rows to add, e.g. Revenue, -Cost of sales", "الأسطر، مثل: الإيرادات، -تكلفة المبيعات")} value={r.sum_rows ?? ""} onChange={(e) => edit(i, { sum_rows: e.target.value })} data-no-i18n /> : <span className="col-span-2" />}
          <div className="flex items-center gap-1"><button type="button" className="btn-ghost" onClick={() => move(i, -1)} aria-label={t("Move up", "لأعلى")}>↑</button><button type="button" className="btn-ghost" onClick={() => move(i, 1)} aria-label={t("Move down", "لأسفل")}>↓</button><button type="button" className="btn-ghost" onClick={() => setDraft({ ...work, rows: work.rows.filter((_, j) => j !== i) })} aria-label={t("Remove", "حذف")}>×</button></div>
        </div>)}
          <button type="button" className="btn-ghost" onClick={() => setDraft({ ...work, rows: [...work.rows, blankRow()] })} data-fin-row-add>{t("Add row", "إضافة سطر")}</button></div>
      </EntFrame>
      <EntFrame id="statement-preview" title={t("Preview", "المعاينة")} note={out.errors.length ? <span className="text-destructive">{pick(ar, out.errors[0]!)}</span> : undefined}>
        <Table id="statement-preview" head={["", ...out.columns.map((x) => pick(ar, x))]}>
          {out.rows.map((r, i) => <tr key={i} className={`${tr} ${r.bold ? "font-semibold" : ""}`} data-fin-preview-row={r.kind}><td className="p-2">{r.kind === "Heading" ? <span className="ent-title">{ar ? r.labelAr : r.label}</span> : r.drill ? <ListLink drill={r.drill}>{ar ? r.labelAr : r.label}</ListLink> : (ar ? r.labelAr : r.label)}</td>{r.values.map((v, j) => <td key={j} className={`p-2 tabular-nums ${v < 0 ? "text-destructive" : ""}`} data-no-i18n>{v.toFixed(2)}</td>)}</tr>)}
        </Table>
      </EntFrame>
    </div>
  </div>;
}

/* ------------------------------------------------------------------ F4 / D12 / SL14 recurring ------------------------------------------------------------------ */
export const RECURRING_DOCTYPES = ["Journal Entry", "Sales Invoice", "Sales Order", "Purchase Invoice", "Purchase Order", "Quotation"];
export function RecurringPage() {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser(); const asOf = today(); useScopeMetas(["Auto Repeat", ...RECURRING_DOCTYPES]);
  const [dt, setDt] = useState("Journal Entry"); const [doc, setDoc] = useState(""); const [freq, setFreq] = useState<Frequency>("Monthly"); const [start, setStart] = useState(FIN.addDays(asOf, 1)); const [end, setEnd] = useState(""); const [sub, setSub] = useState(false);
  const list = schedules(asOf).filter((x) => canReadType(x.doctype)); const docs = canReadType(dt) ? adapter.list(dt).filter((d) => Number(d.docstatus ?? 0) !== 2).slice(0, 200) : [];
  return <div className="space-y-3">
    <Bar><GoToAction to='[data-ent-frame="recurring-new"]' data-fin-recurring-go>{t("Make a document repeat", "جعل مستند متكررًا")}</GoToAction></Bar>
    <EntFrame id="recurring" title={t("Recurring documents", "المستندات المتكررة")} note={t("Monthly journals, contract orders and repeat invoices. Due schedules create their documents dated on the schedule date; past periods are caught up.", "قيود شهرية وطلبات عقود وفواتير متكررة. تُنشئ الجداول المستحقة مستنداتها بتاريخ الجدول مع تدارك الفترات الفائتة.")}>
      <Table id="recurring" head={[t("Document", "المستند"), t("Repeats", "التكرار"), t("Next date", "التاريخ التالي"), t("Until", "حتى"), t("Created", "المُنشأ"), t("Status", "الحالة"), ""]}>
        {list.map((x) => <tr key={x.name} className={tr} data-fin-schedule={x.name} data-due={x.due ? 1 : 0}><td className="p-2"><span className="text-xs text-muted-foreground">{x.doctype}</span> <DocLink dt={x.doctype} name={x.reference} /></td>
          <td className="p-2">{pick(ar, FREQ_LABEL[(x.frequency === "Year" ? "Yearly" : x.frequency) as Frequency] ?? [x.frequency, x.frequency])}{x.submit && <span className="ms-1 text-xs text-muted-foreground">· {t("submitted automatically", "يُعتمد تلقائيًا")}</span>}</td>
          <td className={`p-2 tabular-nums ${x.due ? "font-semibold text-destructive" : ""}`} data-no-i18n>{x.next}</td><td className="p-2 tabular-nums" data-no-i18n>{x.end || "—"}</td>
          <td className="p-2 text-xs">{x.created.length ? <ListLink drill={{ doctype: x.doctype, filters: [["auto_repeat", "=", x.name]] }}><bdi data-no-i18n>{x.created.length}</bdi></ListLink> : "0"}</td><td className="p-2"><span className="ent-mint-chip">{x.status}</span></td>
          <td className="p-2">{x.due && <button type="button" className="btn-primary" data-fin-run-schedule onClick={() => { const r = runSchedule(x.name, asOf, user); if (r.created.length) toast.success(t(`${r.created.length} created`, `أُنشئ ${r.created.length}`)); if (r.errors.length) toast.error(r.errors.join("\n")); }}>{t("Create now", "إنشاء الآن")}</button>}</td></tr>)}
      </Table>
    </EntFrame>
    <EntFrame id="recurring-new" title={t("Make a document repeat", "جعل مستند متكررًا")}>
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t("Document type", "نوع المستند")}><select className="field-input" value={dt} onChange={(e) => { setDt(e.target.value); setDoc(""); }}>{RECURRING_DOCTYPES.filter((d) => canReadType(d)).map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label={t("Document", "المستند")}><select className="field-input" value={doc} onChange={(e) => setDoc(e.target.value)} data-fin-recurring-doc data-no-i18n><option value="">—</option>{docs.map((d) => <option key={d.name}>{d.name}</option>)}</select></Field>
        <Field label={t("Repeats", "التكرار")}><select className="field-input" value={freq} onChange={(e) => setFreq(e.target.value as Frequency)}>{FREQUENCIES.map((f) => <option key={f} value={f}>{pick(ar, FREQ_LABEL[f])}</option>)}</select></Field>
        <Field label={t("Start", "البداية")}><DateInput className="field-input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label={t("End (optional)", "النهاية (اختياري)")}><DateInput className="field-input" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={sub} onChange={(e) => setSub(e.target.checked)} />{t("Submit automatically", "اعتماد تلقائي")}</label>
        <button type="button" className="btn-primary" disabled={!doc} data-fin-recurring-save onClick={() => { const r = makeRecurring(dt, doc, freq, start, end, sub, user); if (r.ok) { toast.success(t("Schedule created", "أُنشئ الجدول")); setDoc(""); } else toast.error(pick(ar, r.reason)); }}>{t("Create schedule", "إنشاء الجدول")}</button>
      </div>
    </EntFrame>
  </div>;
}
