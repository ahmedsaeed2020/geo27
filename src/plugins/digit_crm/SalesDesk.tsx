/**
 * DIGIT CRM C1–C3 screens (owner 2026-11-17) drawn only with Enterprise components (StageBoard, Funnel, QueueSplit,
 * RemainingRing, UpcomingList, SelectionBar, FocusList, StageProgress, InvoiceStatusSection, PartyScoreCard, ChangeLog).
 * Figures come from salesDesk.ts; writes go through the existing CRM functions (moveDeal, completeTask, createTask,
 * rescheduleTask) and the new createDealTask / saveCrmRules. No message is sent anywhere (sandbox only).
 */
import { Link } from "@tanstack/react-router";
import { leadTitle } from "./leadDesk";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { canMoveKanban } from "@/lib/kanbanMove";
import { linkTitle } from "@/lib/linkTitle";
import { useSettings, setCardFields } from "@/lib/userSettings";
import { translateTo, useLang } from "@/i18n";
import { EntDialog } from "@/components/enterprise/Surfaces";
import { QuickLink, openQuickView, peekRow } from "@/components/enterprise/QuickView";
import { StageBoard, StageProgress, CardFieldPicker, type MoveResult, type StageColumn, type StageCard, type StageFact } from "@/components/enterprise/kit/StageBoard";
import { Funnel, short, type Datum } from "@/components/enterprise/kit/charts";
import { QueueSplit, ChangeLog } from "@/components/enterprise/kit/QueueSplit";
import { RemainingRing } from "@/components/enterprise/kit/CostKit";
import { UpcomingList, dueTag, SelectionBar } from "@/components/enterprise/kit/ReconKit";
import { ViewToggle } from "@/components/enterprise/kit/FinanceKit";
import { FocusList, type FocusRow } from "@/components/enterprise/kit/FocusList";
import { BlockCard } from "@/components/enterprise/kit/rank";
import { InvoiceStatusSection, PartyScoreCard } from "@/components/enterprise/InvoiceStatus";
import { StatusStrip } from "@/components/enterprise/StatusStrip";
import { stripTabs, inStripTab } from "@/lib/statusStrip";
import { fmtCurrency } from "@/lib/format";
import { completeTask, createTask, isManager, userLabel } from "./wf01";
import { customer360, dealStatusType, moveDeal } from "./wf02";
import { dealsMoney, fmtMoney, type MoneySum } from "./wf05";
import { actionQueue, type QueueItem } from "./wf09";
import {
  boardCheck, bulkReschedule, canSeeFinance, createDealTask, crmRules, focusNow, localDay, openDealStages, pipelineStages, RULE_DEFAULTS, saveCrmRules, shiftDue,
  stageLogEntries, targetPosition, upcomingWork, winFunnel, type DealView, type FocusItem,
} from "./salesDesk";

const tx = (ar: boolean, en: string, a: string) => (ar ? a : en);
/** «يوم» · «يومين» · «3 أيام» · «11 يومًا» */
/** Ring centre figure: whole figures stay readable inside the ring (exact values are listed beside it). */
const shortAmt = (v: number, ar: boolean) => { const a = Math.abs(v); if (!ar) return short(v); return a >= 1e6 ? `${(v / 1e6).toFixed(1)} مليون` : a >= 1e4 ? `${Math.round(v / 1e3)} ألف` : v.toLocaleString("en-US"); };
const ROLE_AR: Record<string, string> = { "Accounts User": "مستخدم الحسابات", "Accounts Manager": "مدير الحسابات", "System Manager": "مدير النظام", "Sales Manager": "مدير المبيعات", "Sales User": "مستخدم المبيعات" };
export const daysAr = (n: number) => (n === 1 ? "يوم" : n === 2 ? "يومين" : n >= 3 && n <= 10 ? `${n} أيام` : `${n} يومًا`);
const money = (m: MoneySum | null | undefined) => (m ? fmtMoney(m).replace(/\bSAR (?=[-−]?[\d.,])/g, "\u20C1 ") : "—");
/** SAR figures as the Riyal sign with up to two decimals (CRM shows whole riyals like fmtMoney); LTR-isolated where rendered. */
const dealMoney = (d: Doc | undefined) => (d ? dealsMoney([d]) : null);
const sar = (v: number) => { const d = Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2; return `\u20C1 ${v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`; };
export const dmy = (iso: string) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const orgTitle = (v: unknown) => linkTitle("CRM Organization", v);
const stageLabel = (name: string, ar: boolean) => (ar ? translateTo(name, "ar") : name);
const stageHue = (color: string) => `var(--status-${color || "gray"}, var(--ek-neutral))`;
const dealLink = (name: string, node: ReactNode) => <Link to="/digit-crm/deals/$dealId" params={{ dealId: name }} className="text-primary hover:underline" data-no-i18n>{node}</Link>;

/* ================================================================== C1 — pipeline ================================================================== */
const BOARD = "digit_crm:pipeline";
const FIELDS: [string, string, string][] = [
  ["value", "Value", "القيمة"], ["prob", "Probability", "الاحتمال"], ["weighted", "Weighted", "المرجّح"], ["close", "Expected close", "الإغلاق المتوقع"],
  ["owner", "Owner", "المسؤول"], ["next", "Next action", "الإجراء التالي"], ["last", "Last activity", "آخر نشاط"], ["age", "Days in stage", "أيام في المرحلة"],
  ["contact", "Contact", "جهة الاتصال"], ["territory", "Territory", "المنطقة"], ["source", "Source", "المصدر"], ["queue", "Priority reason", "سبب الأولوية"],
];
export const DEFAULT_CARD_FIELDS = ["value", "prob", "close", "owner", "next"];
export const REASON_AR: Record<string, [string, string]> = {
  overdue: ["Overdue follow-up", "متابعة متأخرة"], today: ["Due today", "مستحقة اليوم"], high_no_next: ["High value · no next action", "قيمة عالية · بدون إجراء تالٍ"],
  close_soon: ["Closing within 7 days", "تُغلق خلال 7 أيام"], new_lead: ["New lead · first contact", "عميل محتمل جديد · أول تواصل"], no_next: ["No next action", "بدون إجراء تالٍ"], upcoming: ["Scheduled", "مجدولة"],
};
function factOf(key: string, v: DealView, ar: boolean, q: QueueItem | undefined): StageFact | null {
  const d = v.deal, L = FIELDS.find((f) => f[0] === key); if (!L) return null;
  const label = ar ? L[2] : L[1];
  switch (key) {
    case "value": return { key, label, value: <bdi data-no-i18n dir="ltr">{money(v.value)}</bdi> };
    case "prob": return { key, label, value: <bdi data-no-i18n>{v.prob}%</bdi> };
    case "weighted": return { key, label, value: <bdi data-no-i18n dir="ltr">{money({ ...v.value, base: v.value.base === null ? null : (v.value.base * v.prob) / 100, byCur: Object.fromEntries(Object.entries(v.value.byCur).map(([c, x]) => [c, (x * v.prob) / 100])) })}</bdi> };
    case "close": return { key, label, value: <bdi data-no-i18n data-close-late={v.closeLate || undefined}>{dmy(v.close)}</bdi>, tone: v.closeLate ? "bad" : undefined };
    case "owner": return { key, label, value: <span data-no-i18n>{userLabel(d["deal_owner"]) || "—"}</span> };
    case "next": return { key, label, value: v.next ? <span data-no-i18n>{String(v.next["title"] ?? v.next.name)} · {dmy(String(v.next["due_date"] ?? "").slice(0, 10))}</span> : tx(ar, "None", "لا يوجد"), tone: v.next ? undefined : "warn" };
    case "last": return { key, label, value: <bdi data-no-i18n>{dmy(v.lastAt.slice(0, 10))}</bdi> };
    case "age": return { key, label, value: v.stageAge === null ? "—" : ar ? daysAr(v.stageAge) : `${v.stageAge} d` };
    case "contact": return { key, label, value: <span data-no-i18n>{String(d["contact"] || d["lead_name"] || "—")}</span> };
    case "territory": return { key, label, value: <span data-no-i18n>{String(d["territory"] || "—")}</span> };
    case "source": return { key, label, value: String(d["source"] || "—") };
    case "queue": return { key, label, value: q ? tx(ar, REASON_AR[q.reason]![0], REASON_AR[q.reason]![1]) : "—", tone: q && ["overdue", "high_no_next"].includes(q.reason) ? "bad" : undefined };
  }
  return null;
}

/** C1-01 deal board (Enterprise stage columns): coloured heads with count · probability · total · weighted, «+N أخرى» after
 *  10 cards, «لا نشاط منذ N أيام», a passed close date in red, the reader's card fields, drag-and-drop and the stage menu. */
export function PipelineBoard({ user }: { user: string }) {
  const ar = useLang() === "ar";
  const st = useSettings();
  const chosen = st.card_fields[BOARD] ?? DEFAULT_CARD_FIELDS;
  const [lost, setLost] = useState<{ deals: string[]; stage: string } | null>(null);
  const cols = pipelineStages(user), meta = cachedMeta("CRM Deal");
  const queue = new Map(actionQueue(user).filter((x) => x.dt === "CRM Deal" && !x.task).map((x) => [x.name, x] as [string, QueueItem]));
  const all = cols.flatMap((c) => c.deals.map((v) => v.deal));
  const canMove = (d: Doc | undefined, stage?: string) => !!d && !!meta && canMoveKanban(meta, d, "status", stage) && (isManager(user) || d["deal_owner"] === user);
  const titleOf = (d: Doc | undefined, k: string) => (d ? orgTitle(d["organization"]) || String(d["lead_name"] || d.name) : k);
  const apply = (keys: string[], to: string): MoveResult => {
    const refused: string[] = []; const ok: string[] = [];
    for (const k of keys) { const d = all.find((x) => x.name === k); if (canMove(d, to)) ok.push(k); else refused.push(`${titleOf(d, k)} — ${tx(ar, "not permitted", "غير مسموح")}`); }
    if (dealStatusType(to) === "Lost" && ok.length) {
      setLost({ deals: ok, stage: to });
      return { moved: 0, refused, note: tx(ar, `Choose the lost reason to move ${ok.length} deal(s) to ${to}.`, `اختر سبب الخسارة لنقل ${ok.length} صفقة إلى ${stageLabel(to, true)}.`) };
    }
    let moved = 0;
    for (const k of ok) { const r = moveDeal(k, to, user); if (r.ok) moved++; else refused.push(`${titleOf(all.find((x) => x.name === k), k)} — ${r.error}`); }
    return { moved, refused };
  };
  const columns: StageColumn[] = cols.map((c) => ({
    key: c.key, label: stageLabel(c.key, ar), hue: stageHue(c.color), tinted: true, count: c.count, totalText: money(c.total),
    facts: [{ key: "prob", label: tx(ar, "Probability", "الاحتمال"), value: `${c.prob}%` }, { key: "weighted", label: tx(ar, "Weighted", "المرجّح"), value: <bdi dir="ltr">{money(c.weighted)}</bdi> }],
    foot: <><span><b data-no-i18n>{c.count}</b> {tx(ar, "deals", "صفقة")}</span><span>{tx(ar, "Total", "الإجمالي")} <b data-no-i18n dir="ltr">{money(c.total)}</b></span><span>{tx(ar, "Weighted", "المرجّح")} <b data-no-i18n dir="ltr">{money(c.weighted)}</b></span></>,
    cards: c.deals.map((v): StageCard => {
      const d = v.deal, q = queue.get(d.name), movable = canMove(d);
      const flags: StageCard["flags"] = [];
      if (v.inactive !== null) flags.push({ key: "idle", tone: "warn", label: ar ? `لا نشاط منذ ${daysAr(v.inactive)}` : `No activity for ${v.inactive} day${v.inactive === 1 ? "" : "s"}` });
      if (v.closeLate && !chosen.includes("close")) flags.push({ key: "late", tone: "bad", label: tx(ar, "Close date passed", "فات تاريخ الإغلاق") });
      return {
        key: d.name, title: dealLink(d.name, titleOf(d, d.name)), sub: <span data-no-i18n>{d.name}</span>, late: v.closeLate, draggable: movable, flags, onOpen: (el) => peekRow("CRM Deal", d.name, cols.flatMap((x) => x.deals.map((y) => y.deal.name)), el),
        facts: chosen.map((k) => factOf(k, v, ar, q)).filter((x): x is StageFact => !!x),
      };
    }),
  }));
  const chk = boardCheck(user);
  return <>
    <StageBoard columns={columns} ar={ar} onMove={(keys, _from, to) => apply(keys, to)} onDropCard={(key, _from, to) => apply([key], to)}
      title={tx(ar, "Deals by stage", "الصفقات حسب المرحلة")} attrs={{ "data-crm-board": String(chk.colCount) }}
      settings={<CardFieldPicker ar={ar} fields={FIELDS.map(([k, en, a]) => ({ key: k, label: ar ? a : en }))} chosen={chosen} defaults={DEFAULT_CARD_FIELDS} onChange={(k) => setCardFields(BOARD, k)} />}
      footer={<span className="ek-sb-check" data-crm-board-check={chk.ok ? "ok" : "diff"} data-col-count={chk.colCount} data-list-count={chk.listCount} data-col-total={chk.colTotal} data-list-total={chk.listTotal}>
        <span>{tx(ar, "Sum of the columns", "مجموع الأعمدة")} <b data-no-i18n>{chk.colCount}</b> {tx(ar, "deals", "صفقة")} · <b data-no-i18n dir="ltr">{sar(chk.colTotal)}</b></span>
        <span data-ok={chk.ok ? "yes" : "no"}>{chk.ok ? "=" : "≠"}</span>
        <span>{tx(ar, "Deal list", "قائمة الصفقات")} <b data-no-i18n>{chk.listCount}</b> {tx(ar, "deals", "صفقة")} · <b data-no-i18n dir="ltr">{sar(chk.listTotal)}</b></span>
        <Link to="/digit-crm/pipeline" className="text-primary hover:underline">{tx(ar, "Open the deal list", "فتح قائمة الصفقات")}</Link>
        <span>· {ar ? `تنبيه «لا نشاط» بعد ${daysAr(crmRules().inactivityDays)} (قاعدة عمل قابلة للتعديل في الإعدادات)` : `“No activity” warning after ${crmRules().inactivityDays} days (a working rule in Settings)`}</span>
      </span>} />
    {lost && <LostReasonDialog ar={ar} count={lost.deals.length} stage={stageLabel(lost.stage, ar)} onClose={() => setLost(null)} onSave={(reason, notes) => {
      let n = 0; const errs: string[] = [];
      for (const k of lost.deals) { const r = moveDeal(k, lost.stage, user, { reason, notes }); if (r.ok) n++; else errs.push(`${k}: ${r.error}`); }
      if (errs.length) return errs[0]!;
      toast.success(tx(ar, `Marked as lost (${n})`, `سُجّلت خسارة ${n} صفقة`)); setLost(null); return null;
    }} />}
  </>;
}

function LostReasonDialog({ ar, count, stage, onClose, onSave }: { ar: boolean; count: number; stage: string; onClose: () => void; onSave: (reason: string, notes: string) => string | null }) {
  const [reason, setReason] = useState(""), [notes, setNotes] = useState(""), [err, setErr] = useState("");
  const reasons = adapter.list("CRM Lost Reason");
  return <EntDialog open onOpenChange={(o) => { if (!o) onClose(); }} title={tx(ar, "Lost reason", "سبب الخسارة")} kicker={<span>{stage} · <bdi data-no-i18n>{count}</bdi></span>} size="sm" id="crm-lost-reason"
    footer={<><button type="button" className="btn-ghost" onClick={onClose}>{tx(ar, "Cancel", "إلغاء")}</button><button type="button" className="btn-primary" data-lost-save onClick={() => {
      if (!reason) { setErr(tx(ar, "Choose a reason", "اختر السبب")); return; }
      if (reason === "Other" && !notes.trim()) { setErr(tx(ar, "Notes are required for Other", "الملاحظات مطلوبة عند اختيار «أخرى»")); return; }
      const e = onSave(reason, notes); if (e) setErr(e);
    }}>{tx(ar, "Save", "حفظ")}</button></>}>
    <select className="field-input" value={reason} onChange={(e) => setReason(e.target.value)} aria-label={tx(ar, "Lost reason", "سبب الخسارة")} data-lost-reason><option value="">{tx(ar, "Select…", "اختر…")}</option>{reasons.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}</select>
    <textarea className="field-input mt-2" rows={3} placeholder={tx(ar, "Lost notes", "ملاحظات الخسارة")} value={notes} onChange={(e) => setNotes(e.target.value)} />
    {err && <p role="alert" className="mt-1 text-xs text-destructive">{err}</p>}
  </EntDialog>;
}

/** C1-02 funnel with conversion between stages under the «نسبة الفوز» title. */
export function WinFunnelCard({ user }: { user: string }) {
  const ar = useLang() === "ar";
  const f = winFunnel(user);
  const data: Datum[] = f.steps.map((x) => ({ key: x.key, label: stageLabel(x.label, ar), value: x.reached, color: stageHue(x.color), attrs: { "data-funnel-stage": x.key, "data-reached": String(x.reached) } }));
  return <BlockCard id="crm-win-funnel" attrs={{ "data-crm-funnel": String(f.winRate ?? ""), "data-won": String(f.won), "data-lost": String(f.lost) }}
    title={<>{tx(ar, "Win rate", "نسبة الفوز")} <bdi data-no-i18n className="ms-1 text-[22px] font-bold tabular-nums">{f.winRate === null ? "—" : `${f.winRate}%`}</bdi></>}
    sub={f.winRate === null ? tx(ar, "No closed deal yet — the rate appears with the first won or lost deal.", "لا توجد صفقات مغلقة بعد — تظهر النسبة مع أول صفقة رابحة أو خاسرة.")
      : <>{tx(ar, "Won", "ربح")} <bdi data-no-i18n>{f.won}</bdi> ÷ {tx(ar, "closed", "المغلقة")} <bdi data-no-i18n>{f.won + f.lost}</bdi> · {tx(ar, "deals that reached each stage, with the conversion from the stage before", "الصفقات التي وصلت كل مرحلة مع نسبة التحويل من المرحلة السابقة")}</>}>
    <div className="ek-card-pad pt-1"><Funnel data={data} ar={ar} between="conversion" /></div>
  </BlockCard>;
}

/* ================================================================== C2 — salesperson daily work ================================================================== */
/** C2-01 queue → record → next step (Enterprise QueueSplit): the queue on the side, the record beside it, «الخطوة التالية». */
export function SalesQueue({ user }: { user: string }) {
  const ar = useLang() === "ar";
  const items = actionQueue(user).filter((i) => i.reason !== "upcoming");
  const [open, setOpen] = useState<string | undefined>(undefined);
  const keys = items.map((i) => i.key);
  const cur = items.find((i) => i.key === open);
  const titleOf = (i: QueueItem) => i.dt === "CRM Deal" ? orgTitle(i.title) || i.title : i.dt === "CRM Lead" && !i.task ? i.title : (() => { const l = adapter.get("CRM Lead", i.name); return l ? leadTitle(l) : i.name; })();
  const list = <section className="ek-card" data-crm-queue={items.length}>
    <header className="ek-card-head"><div className="min-w-0"><h3 className="ek-h3">{tx(ar, "Needed now", "المطلوب الآن")}</h3><p className="ek-card-sub">{tx(ar, "Overdue and due-today follow-ups, then deals that need a step — open one to work on it here.", "المتابعات المتأخرة والمستحقة اليوم ثم الصفقات التي تحتاج خطوة — افتح أيًا منها لتعمل عليه هنا.")}</p></div><span className="ek-sb-count tabular-nums" data-no-i18n>{items.length}</span></header>
    {!items.length ? <p className="ek-card-pad pt-0 text-sm text-muted-foreground">{tx(ar, "Your queue is clear.", "لا يوجد شيء مطلوب الآن.")}</p> :
      <ol className="ek-focus-rows max-h-[520px] overflow-auto">{items.slice(0, 60).map((i) => <li key={i.key} data-tone={["overdue", "high_no_next"].includes(i.reason) ? "bad" : ["today", "close_soon"].includes(i.reason) ? "warn" : "info"} data-queue-row={i.key} aria-current={open === i.key || undefined}>
        <span className="ek-focus-kind" data-kind={i.dt === "CRM Deal" ? "deal" : "task"}>{i.dt === "CRM Deal" ? tx(ar, "Deal", "صفقة") : tx(ar, "Lead", "عميل محتمل")}</span>
        <button type="button" className="ek-focus-main text-start" onClick={() => setOpen(i.key)} data-queue-open={i.key}><span className="ek-focus-title" data-no-i18n>{titleOf(i)}</span><span className="ek-focus-sub"> · {tx(ar, REASON_AR[i.reason]![0], REASON_AR[i.reason]![1])}</span></button>
        <span className="ek-focus-when" data-no-i18n>{i.due ? dmy(i.due.slice(0, 10)) : "—"}</span>
      </li>)}</ol>}
  </section>;
  return <QueueSplit ar={ar} list={list} keys={keys} open={open} onOpen={setOpen} onClose={() => setOpen(undefined)} title={cur ? titleOf(cur) : undefined} attrs={{ "data-crm-queue-split": "" }}>
    {open && (cur ? <QueueRecord key={cur.key} item={cur} user={user} ar={ar} title={titleOf(cur)} /> : <p className="text-sm text-muted-foreground" data-queue-done>{tx(ar, "Done — this item left the queue. Use «Next step» to continue.", "تم — خرج هذا البند من القائمة. اضغط «الخطوة التالية» للمتابعة.")}</p>)}
  </QueueSplit>;
}
function QueueRecord({ item, user, ar, title }: { item: QueueItem; user: string; ar: boolean; title: string }) {
  const tomorrow = shiftDue(undefined, 1);
  const [f, setF] = useState({ title: "", due: tomorrow }); const [err, setErr] = useState("");
  const isDeal = item.dt === "CRM Deal";
  const d = isDeal ? adapter.get("CRM Deal", item.name) : adapter.get("CRM Lead", item.name);
  const save = () => {
    const r = isDeal ? createDealTask(item.name, { title: f.title, due: f.due }, user) : (() => { const x = createTask({ lead: item.name, title: f.title, due: f.due }, user); return x.ok ? x : { ok: false as const, error: Object.values(x.errors)[0] ?? "" }; })();
    if (!r.ok) { setErr(r.error); return; }
    setErr(""); setF({ title: "", due: tomorrow }); toast.success(tx(ar, "Next step scheduled", "جُدولت الخطوة التالية"), { description: r.name });
  };
  const facts: [string, ReactNode][] = isDeal && d ? [[tx(ar, "Stage", "المرحلة"), stageLabel(String(d["status"] ?? ""), ar)], [tx(ar, "Value", "القيمة"), <bdi key="v" data-no-i18n>{item.amount ? (!item.cur || item.cur === "SAR" ? sar(item.amount) : `${item.cur} ${item.amount.toLocaleString("en-US")}`) : "—"}</bdi>],
    [tx(ar, "Expected close", "الإغلاق المتوقع"), <bdi key="c" data-no-i18n>{dmy(String(d["expected_closure_date"] ?? ""))}</bdi>], [tx(ar, "Owner", "المسؤول"), <span key="o" data-no-i18n>{userLabel(d["deal_owner"]) || "—"}</span>]]
    : d ? [[tx(ar, "Lead", "العميل المحتمل"), <span key="l" data-no-i18n>{leadTitle(d)}</span>], [tx(ar, "Company", "الشركة"), <span key="c" data-no-i18n>{orgTitle(d["organization"]) || "—"}</span>], [tx(ar, "Status", "الحالة"), String(d["status"] ?? "")], [tx(ar, "Owner", "المسؤول"), <span key="o" data-no-i18n>{userLabel(d["lead_owner"]) || "—"}</span>]] : [];
  return <div className="grid gap-3" data-queue-record={item.key}>
    <div className="flex flex-wrap items-center gap-2"><span className="ek-sb-flag" data-tone={["overdue", "high_no_next"].includes(item.reason) ? "bad" : "warn"}>{tx(ar, REASON_AR[item.reason]![0], REASON_AR[item.reason]![1])}</span>
      {item.task && <span className="text-sm" data-no-i18n>{item.title}{item.due ? ` · ${dmy(item.due.slice(0, 10))} ${item.due.slice(11, 16)}` : ""}</span>}
      <span className="ms-auto">{isDeal ? dealLink(item.name, tx(ar, "Open the deal", "فتح الصفقة")) : <Link to="/digit-crm/leads/$leadId" params={{ leadId: item.name }} className="text-primary hover:underline">{tx(ar, "Open the lead", "فتح العميل المحتمل")}</Link>}</span></div>
    <dl className="grid grid-cols-2 gap-2 text-sm">{facts.map(([k, v], i) => <div key={i}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl>
    {item.task && <div><button type="button" className="btn-primary min-h-9 text-sm" data-queue-complete onClick={() => { const r = completeTask(item.task!, user); if (r.ok) toast.success(tx(ar, "Follow-up completed", "اكتملت المتابعة")); else toast.error(Object.values(r.errors)[0]); }}>{tx(ar, "Mark this follow-up done", "إنهاء هذه المتابعة")}</button></div>}
    <form className="grid gap-2 rounded-md border border-border p-3" onSubmit={(e) => { e.preventDefault(); save(); }} data-queue-next-form>
      <p className="text-sm font-semibold">{tx(ar, "Schedule the next step", "جدولة الخطوة التالية")}</p>
      <input className="field-input" placeholder={tx(ar, "What happens next (call, visit, send the quotation…)", "ما الخطوة القادمة (اتصال، زيارة، إرسال العرض…)")} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label={tx(ar, "Next step", "الخطوة التالية")} />
      <input dir="ltr" type="datetime-local" className="field-input" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} aria-label={tx(ar, "Due", "الموعد")} />
      {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
      <div><button type="submit" className="btn-ghost min-h-9 text-sm" data-queue-schedule>{tx(ar, "Save the next step", "حفظ الخطوة التالية")}</button></div>
    </form>
    <div><p className="mb-1 text-sm font-semibold">{tx(ar, "Changes on this record", "التعديلات على هذا السجل")}</p><ChangeLog doctype={item.dt} name={item.name} ar={ar} limit={5} extra={isDeal && d ? stageLogEntries(d) : undefined} /></div>
    <p className="text-[11px] text-muted-foreground">{tx(ar, "Calls, WhatsApp and email are not sent from the preview; log what you did as a note or call.", "لا تُرسل مكالمات أو واتساب أو بريد من المعاينة؛ سجّل ما تم كملاحظة أو مكالمة.")}</p>
  </div>;
}

/** C2-03 «المتبقي للهدف» ring. */
export function TargetRingCard({ user }: { user: string }) {
  const ar = useLang() === "ar";
  const t = targetPosition(user);
  if (t.scope === "none") return <BlockCard id="crm-target-ring" title={tx(ar, "Left to target", "المتبقي للهدف")} attrs={{ "data-crm-target": "none" }}
    sub={t.fiscalYear ? tx(ar, `No target is set for you in fiscal year ${t.fiscalYear}.`, `لا يوجد هدف مسجل لك في السنة المالية ${t.fiscalYear}.`) : tx(ar, "No open fiscal year covers today.", "لا توجد سنة مالية تغطي اليوم.")}>
    <div className="ek-card-pad pt-0"><Link to="/digit-crm/targets" className="text-sm font-semibold text-primary hover:underline">{tx(ar, "Open targets", "فتح الأهداف")}</Link></div></BlockCard>;
  return <RemainingRing title={tx(ar, "Left to target", "المتبقي للهدف")} level={t.level === "over" ? "over" : t.level === "warn" ? "warn" : "ok"} attrs={{ "data-crm-target": String(t.remaining), "data-target": String(t.target), "data-achieved": String(t.achieved) }}
    sub={<>{t.scope === "team" ? tx(ar, `Team · ${t.people} salespeople`, `الفريق · ${t.people} مندوبين`) : <bdi data-no-i18n>{t.who}</bdi>} · {tx(ar, "fiscal year", "السنة المالية")} <bdi data-no-i18n>{t.fiscalYear}</bdi></>}
    center={`\u20C1 ${shortAmt(t.over > 0 ? t.over : t.remaining, ar)}`} centerLabel={t.over > 0 ? tx(ar, "above target", "فوق الهدف") : tx(ar, "left to target", "المتبقي للهدف")}
    parts={[{ key: "achieved", label: tx(ar, "Achieved", "المحقق"), value: t.achieved, display: sar(t.achieved), tone: "actual" }, { key: "remaining", label: tx(ar, "Remaining", "المتبقي"), value: t.remaining, display: sar(t.remaining), tone: "remaining" }]}
    facts={[{ key: "target", label: tx(ar, "Target", "الهدف"), display: sar(t.target) }, { key: "pct", label: tx(ar, "Achieved", "نسبة التحقيق"), display: t.pct === null ? "—" : `${t.pct}%` },
      { key: "pace", label: tx(ar, "Expected by today", "المتوقع حتى اليوم"), display: sar(t.expected) },
      { key: "basis", label: tx(ar, "Counted from", "يُحسب من"), display: t.attributed ? tx(ar, "submitted sales orders", "أوامر البيع المعتمدة") : tx(ar, "no attributed orders yet", "لا توجد أوامر منسوبة بعد") }]}
    link={(n) => <Link to="/digit-crm/targets" aria-label={tx(ar, "Open targets", "فتح الأهداف")} data-crm-target-link>{n}</Link>} />;
}

/** C2-04 upcoming list: today / 14 days. */
export function UpcomingCard({ user }: { user: string }) {
  const ar = useLang() === "ar";
  const [win, setWin] = useState<"today" | "14">("today");
  const rows = upcomingWork(user, win === "today" ? 0 : 14);
  return <UpcomingList ar={ar} attrs={{ "data-crm-upcoming-window": win }}
    title={tx(ar, "Upcoming", "القادم")} sub={win === "today" ? tx(ar, "Follow-ups due and deals closing today", "متابعات مستحقة وصفقات تُغلق اليوم") : tx(ar, "Follow-ups due and deals closing in the next 14 days", "متابعات مستحقة وصفقات تُغلق خلال 14 يومًا")}
    action={<ViewToggle id="crm-upcoming" label={tx(ar, "Window", "الفترة")} value={win} onChange={setWin} options={[{ id: "today", label: tx(ar, "Today", "اليوم") }, { id: "14", label: tx(ar, "14 days", "14 يومًا") }]} />}
    rows={rows.slice(0, 12).map((r) => ({ key: r.key, date: dmy(r.date), tag: dueTag(r.days, ar), attrs: { "data-upcoming-row": r.key },
      label: r.kind === "close" ? dealLink(r.name, orgTitle(r.title) || r.title) : <Link to="/digit-crm/leads/$leadId" params={{ leadId: r.name }} className="hover:underline" data-no-i18n>{r.title}</Link>,
      sub: r.kind === "close" ? tx(ar, "Expected close", "إغلاق متوقع") : <span data-no-i18n>{r.sub}</span>, amount: r.amount ? money(r.amount) : tx(ar, "Follow-up", "متابعة") }))}
    total={rows.length > 12 ? tx(ar, `${rows.length} in total — showing 12`, `${rows.length} إجمالًا — المعروض 12`) : tx(ar, `${rows.length} in total`, `${rows.length} إجمالًا`)}
    empty={win === "today" ? tx(ar, "Nothing due today.", "لا شيء مستحق اليوم.") : tx(ar, "Nothing due in the next 14 days.", "لا شيء مستحق خلال 14 يومًا.")} />;
}

/** C2-02 bulk bar on the follow-up rows: reschedule (quick +1 / +3 / +7 days or a date) or complete every selected follow-up. */
export function FollowBulkBar({ selected, tasks, user, onClear, onAll }: { selected: string[]; tasks: Doc[]; user: string; onClear: () => void; onAll: () => void }) {
  const ar = useLang() === "ar";
  const [open, setOpen] = useState(false);
  const first = tasks.find((t) => selected.includes(t.name));
  const [due, setDue] = useState("");
  const run = (when: string) => {
    const r = bulkReschedule(selected, when, user);
    if (r.moved.length) toast.success(tx(ar, `${r.moved.length} follow-up(s) rescheduled`, `أُعيدت جدولة ${r.moved.length} متابعة`), { description: when.replace("T", " ") });
    if (r.refused.length) toast.error(tx(ar, `${r.refused.length} refused`, `رُفض ${r.refused.length}`), { description: r.refused.map((x) => `${x.name}: ${x.error}`).join(" · ") });
    setOpen(false); onClear();
  };
  return <>
    <SelectionBar ar={ar} count={selected.length} onClear={onClear} onAll={onAll} attrs={{ "data-crm-bulk": String(selected.length) }}
      actions={[{ key: "reschedule", label: tx(ar, "Reschedule", "إعادة الجدولة"), primary: true, onClick: () => { setDue(shiftDue(first?.["due_date"], 1)); setOpen(true); } },
        { key: "complete", label: tx(ar, "Mark done", "إنهاء"), onClick: () => { let n = 0; for (const k of selected) if (completeTask(k, user).ok) n++; toast.success(tx(ar, `${n} completed`, `اكتمل ${n}`)); onClear(); } }]} />
    {open && <EntDialog open onOpenChange={(o) => { if (!o) setOpen(false); }} id="crm-bulk-reschedule" size="sm" title={tx(ar, "Reschedule follow-ups", "إعادة جدولة المتابعات")} kicker={<span><bdi data-no-i18n>{selected.length}</bdi> {tx(ar, "selected", "محدد")}</span>}
      footer={<><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{tx(ar, "Cancel", "إلغاء")}</button><button type="button" className="btn-primary" disabled={!due} onClick={() => run(due)} data-bulk-save>{tx(ar, "Save", "حفظ")}</button></>}>
      <div className="mb-3 flex flex-wrap gap-2">{[1, 3, 7].map((n) => <button key={n} type="button" className="ek-focus-chip" onClick={() => run(shiftDue(undefined, n))} data-bulk-quick={n}>{ar ? `بعد ${daysAr(n)}` : `+${n} day${n === 1 ? "" : "s"}`}</button>)}</div>
      <label className="grid gap-1 text-sm"><span className="text-muted-foreground">{tx(ar, "Or pick the new due date and time", "أو اختر الموعد الجديد")}</span><input dir="ltr" type="datetime-local" className="field-input" value={due} onChange={(e) => setDue(e.target.value)} data-bulk-due /></label>
    </EntDialog>}
  </>;
}
/** «متأخر N يوم» / «اليوم» chip beside a follow-up's due date. */
export function WaitChip({ due, bucket, ar }: { due: unknown; bucket: string; ar: boolean }) {
  if (bucket === "today") return <span className="ek-wait" data-tone="warn" data-wait="today">{tx(ar, "Today", "اليوم")}</span>;
  if (bucket !== "overdue") return null;
  const t = Date.parse(String(due ?? "").replace(" ", "T")); if (!Number.isFinite(t)) return null;
  const n = Math.max(0, Math.floor((Date.parse(`${localDay(new Date())}T00:00:00`) - Date.parse(`${localDay(new Date(t))}T00:00:00`)) / 864e5));
  return <span className="ek-wait" data-wait={n}>{n === 0 ? tx(ar, "Earlier today", "فات اليوم") : ar ? `متأخر ${daysAr(n)}` : `${n} day${n === 1 ? "" : "s"} late`}</span>;
}

/* ================================================================== C3 — Customer 360 ================================================================== */
type C360 = NonNullable<ReturnType<typeof customer360>>;
const KIND: Record<FocusItem["kind"], [string, string]> = { task: ["Follow-up", "متابعة"], deal: ["Deal", "صفقة"], quote: ["Quotation", "عرض سعر"], invoice: ["Invoice", "فاتورة"] };
const WHY: Record<FocusItem["reason"], [string, string]> = {
  task_overdue: ["overdue", "متأخرة"], task_today: ["due today", "مستحقة اليوم"], close_passed: ["close date passed", "فات تاريخ الإغلاق"], close_soon: ["closes within 7 days", "تُغلق خلال 7 أيام"],
  no_next: ["no next action", "بدون إجراء تالٍ"], quote_expired: ["validity ended", "انتهت صلاحيته"], quote_expiring: ["expires within 7 days", "تنتهي صلاحيته خلال 7 أيام"], invoice_overdue: ["overdue", "متأخرة السداد"],
};
/** C3-02 «التركيز الآن» above the history, with filters by kind. */
export function FocusNowCard({ c, user }: { c: C360; user: string }) {
  const ar = useLang() === "ar";
  const items = focusNow(c, user);
  const rows: FocusRow[] = items.map((i) => ({ key: i.key, kind: i.kind, tone: i.tone, kindLabel: tx(ar, KIND[i.kind][0], KIND[i.kind][1]), attrs: { "data-focus-reason": i.reason },
    title: i.kind === "deal" ? <>{stageLabel(i.title, ar)} · <bdi data-no-i18n dir="ltr">{money(dealMoney(c.deals.find((d) => d.name === i.name)))}</bdi></> : <bdi data-no-i18n>{i.title}</bdi>,
    sub: <>{tx(ar, WHY[i.reason][0], WHY[i.reason][1])}{i.kind === "task" ? <> · <bdi data-no-i18n>{orgTitle(i.sub) || i.sub}</bdi></> : null}{i.kind === "invoice" || i.kind === "quote" ? <> · <bdi data-no-i18n dir="ltr">{sar(Number(i.sub) || 0)}</bdi></> : null}</>,
    when: i.date ? <>{dmy(i.date)}{i.days > 0 && i.tone === "bad" ? ` · ${ar ? daysAr(i.days) : `${i.days} d`}` : ""}</> : undefined,
    link: i.dt === "CRM Deal" ? (n) => dealLink(i.name, n) : (n) => <button type="button" className="text-start hover:underline" onClick={(e) => openQuickView({ kind: "doc", doctype: i.dt, name: i.name }, e.currentTarget)} data-focus-open={i.name}>{n}</button> }));
  const kinds = (["task", "deal", "quote", "invoice"] as const).filter((k) => k !== "invoice" || canSeeFinance(user)).map((k) => ({ key: k, label: tx(ar, KIND[k][0], KIND[k][1]) }));
  return <FocusList ar={ar} rows={rows} kinds={kinds} attrs={{ "data-crm-focus": String(items.length) }} title={tx(ar, "Focus now", "التركيز الآن")}
    sub={tx(ar, "What needs action on this customer today — most urgent first.", "ما يحتاج إجراءً على هذا العميل اليوم — الأكثر إلحاحًا أولًا.")} empty={tx(ar, "Nothing needs action on this customer now.", "لا يوجد ما يحتاج إجراءً على هذا العميل الآن.")} />;
}
/** C3-03 open deals with a stage bar. */
export function OpenDealsCard({ c }: { c: C360 }) {
  const ar = useLang() === "ar";
  const { stages, deals } = openDealStages(c);
  const today = localDay(new Date());
  const st = stages.map((x) => ({ key: x.name, label: stageLabel(x.name, ar), hue: stageHue(String(x["color"] ?? "gray")) }));
  return <BlockCard id="crm-c360-open-deals" title={tx(ar, "Open deals", "الصفقات المفتوحة")} attrs={{ "data-crm-open-deals": String(deals.length) }}
    sub={deals.length ? <>{tx(ar, "Stage bar: every stage up to Won", "شريط المراحل حتى الربح")} · <bdi data-no-i18n>{deals.length}</bdi></> : undefined}>
    {!deals.length ? <p className="ek-card-pad pt-0 text-sm text-muted-foreground">{tx(ar, "No open deal for this customer.", "لا توجد صفقة مفتوحة لهذا العميل.")}</p> :
      <ol className="ek-deals">{deals.map(({ deal: d, index, value }) => { const close = String(d["expected_closure_date"] ?? "").slice(0, 10); const late = !!close && close < today;
        return <li key={d.name} data-open-deal={d.name}>
          <div className="ek-deal-top">{dealLink(d.name, <span>{d.name}</span>)}<span className="text-muted-foreground" data-no-i18n>{userLabel(d["deal_owner"])}</span>
            <span className="ek-deal-close" data-late={late || undefined}>{tx(ar, "Close", "الإغلاق")} <bdi data-no-i18n>{dmy(close)}</bdi></span><span className="ek-deal-amt" data-no-i18n dir="ltr">{money(value)}</span></div>
          <StageProgress stages={st} current={index} ar={ar} />
        </li>; })}</ol>}
  </BlockCard>;
}
/** C3-04 / C3-05 invoices and collections (finance permission) — same blocks as Pro receivables. */
export function FinanceTabs({ c, user }: { c: C360; user: string }) {
  const ar = useLang() === "ar";
  const [tab, setTab] = useState<"invoices" | "collections">("invoices");
  const [inv, setInv] = useState<string | undefined>(undefined);
  const [pay, setPay] = useState<string | undefined>(undefined);
  const parties = c.customers.map((x) => x.name);
  if (!canSeeFinance(user)) return <section className="ek-card ek-card-pad" data-crm-finance="locked">
    <h3 className="ek-h3">{tx(ar, "Invoices, collections and payment score", "الفواتير والتحصيلات وانتظام السداد")}</h3>
    <p className="mt-1 text-sm text-muted-foreground">{tx(ar, "Balances, aging and the payment score are shown only to users with the finance permission.", "الأرصدة والتقادم وانتظام السداد تظهر فقط لمن لديه صلاحية المالية.")}</p>
    <p className="mt-1 text-xs text-muted-foreground">{tx(ar, "Finance roles", "أدوار المالية")}: <bdi data-no-i18n>{crmRules().financeRoles.map((r) => (ar ? ROLE_AR[r] ?? translateTo(r, "ar") : r)).join(" · ")}</bdi></p>
  </section>;
  if (!parties.length) return <section className="ek-card ek-card-pad" data-crm-finance="no-customer"><h3 className="ek-h3">{tx(ar, "Invoices and collections", "الفواتير والتحصيلات")}</h3>
    <p className="mt-1 text-sm text-muted-foreground">{tx(ar, "No customer record is linked to this company yet — invoices appear once the won deal becomes a customer.", "لا يوجد سجل عميل مرتبط بهذه الشركة بعد — تظهر الفواتير بعد تحويل الصفقة الرابحة إلى عميل.")}</p></section>;
  const meta = cachedMeta("Payment Entry");
  const pays = adapter.list("Payment Entry").filter((p) => p["party_type"] === "Customer" && parties.includes(String(p["party"])) && Number(p.docstatus) !== 2)
    .sort((a, b) => String(b["posting_date"] ?? "").localeCompare(String(a["posting_date"] ?? "")));
  const ptabs = meta ? stripTabs(meta, pays) : [];
  const prow = meta ? pays.filter((p) => inStripTab(meta, p, pay)) : pays;
  return <section className="grid gap-3" data-crm-finance="open">
    <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{tx(ar, "Billing", "الفوترة")}</h2>
      <ViewToggle id="crm-c360-finance" label={tx(ar, "Billing view", "عرض الفوترة")} value={tab} onChange={setTab} options={[{ id: "invoices", label: tx(ar, "Invoices", "الفواتير") }, { id: "collections", label: tx(ar, "Collections", "التحصيلات") }]} />
      <span className="ms-auto text-xs text-muted-foreground">{tx(ar, "Read only — invoices and payments are posted in their own documents.", "للعرض فقط — تُرحّل الفواتير والمدفوعات من مستنداتها.")}</span></div>
    {tab === "invoices" ? <InvoiceStatusSection side="receivable" company="" asOf={localDay(new Date())} user={user} ar={ar} tab={inv} onTab={setInv} party={parties} currency="SAR" hideParty={parties.length === 1} />
      : <section className="ek-card ek-card-pad" data-crm-collections={prow.length}>
        <h3 className="mb-2 font-semibold">{tx(ar, "Collections by status", "التحصيلات حسب الحالة")}</h3>
        {ptabs.length > 0 && <StatusStrip tabs={ptabs} active={pay} ar={ar} onPick={setPay} label={tx(ar, "Payment states", "حالات التحصيل")} />}
        {!prow.length ? <p className="text-sm text-muted-foreground">{tx(ar, "No collection recorded for this customer.", "لا يوجد تحصيل مسجل لهذا العميل.")}</p> :
          <div className="dp-reg"><table className="whitespace-nowrap"><thead><tr><th className="px-3 py-2 text-start">{tx(ar, "Payment", "سند القبض")}</th><th className="px-2 py-2 text-start">{tx(ar, "Date", "التاريخ")}</th><th className="px-2 py-2 text-start">{tx(ar, "Against invoices", "مقابل الفواتير")}</th><th className="px-3 py-2 text-end">{tx(ar, "Amount", "المبلغ")}</th></tr></thead>
            <tbody>{prow.slice(0, 50).map((p) => <tr key={p.name} data-crm-payment={p.name}><td className="px-3 py-2"><QuickLink doctype="Payment Entry" name={p.name}><bdi>{p.name}</bdi></QuickLink></td><td className="px-2 py-2 tabular-nums" data-no-i18n>{dmy(String(p["posting_date"] ?? ""))}</td>
              <td className="px-2 py-2" data-no-i18n>{((p["references"] as Doc[] | undefined) ?? []).map((r) => String(r["reference_name"])).join(" · ") || "—"}</td><td className="px-3 py-2 text-end tabular-nums" data-no-i18n><bdi dir="ltr">{sar(Number(p["paid_amount"]) || 0)}</bdi></td></tr>)}</tbody>
            <tfoot><tr><td className="px-3 py-2" colSpan={3}>{tx(ar, "Total", "الإجمالي")} · <bdi data-no-i18n>{prow.length}</bdi></td><td className="px-3 py-2 text-end tabular-nums" data-no-i18n data-crm-collections-total={prow.reduce((a, p) => a + (Number(p["paid_amount"]) || 0), 0)}><bdi dir="ltr">{sar(prow.reduce((a, p) => a + (Number(p["paid_amount"]) || 0), 0))}</bdi></td></tr></tfoot></table></div>}
      </section>}
  </section>;
}
export function PaymentScoreBlock({ c, user }: { c: C360; user: string }) {
  const ar = useLang() === "ar";
  if (!canSeeFinance(user) || !c.customers.length) return null;
  return <PartyScoreCard side="receivable" company="" party={c.customers.map((x) => x.name)} user={user} ar={ar} currency="SAR" partyName={orgTitle(c.org.name)} attrs={{ "data-crm-score": c.org.name }} />;
}
/** C3-06 activity log: saved field changes old → new of the company and each deal (deal stage changes from its stage log). */
export function CompanyChangeLog({ c }: { c: C360 }) {
  const ar = useLang() === "ar";
  const recs: { dt: string; name: string; label: ReactNode; extra?: ReturnType<typeof stageLogEntries> }[] = [
    { dt: "CRM Organization", name: c.org.name, label: tx(ar, "Company", "الشركة") },
    ...c.deals.slice(0, 8).map((d) => ({ dt: "CRM Deal", name: d.name, label: <>{tx(ar, "Deal", "صفقة")} <bdi data-no-i18n dir="ltr">{money(dealMoney(d))}</bdi></>, extra: stageLogEntries(d) })),
  ];
  const first = recs.find((r) => (r.extra?.length ?? 0) > 0) ?? recs[0]!;
  const [pick, setPick] = useState(`${first.dt}|${first.name}`);
  const cur = recs.find((r) => `${r.dt}|${r.name}` === pick) ?? first;
  return <BlockCard id="crm-c360-changes" title={tx(ar, "Activity log — changed fields", "سجل النشاط — الحقول المعدلة")} sub={tx(ar, "Each saved change shows the old value → the new value.", "كل تعديل محفوظ يظهر القيمة السابقة ← القيمة الجديدة.")} attrs={{ "data-crm-changes": pick }}>
    <div className="ek-focus-filters" role="group" aria-label={tx(ar, "Record", "السجل")}>{recs.map((r) => <button key={`${r.dt}|${r.name}`} type="button" className="ek-focus-chip" aria-pressed={`${r.dt}|${r.name}` === pick} onClick={() => setPick(`${r.dt}|${r.name}`)} data-changes-pick={r.name}>{r.label}</button>)}</div>
    <div className="ek-card-pad pt-0"><ChangeLog key={pick} doctype={cur.dt} name={cur.name} ar={ar} extra={cur.extra} value={(f, v) => (f === "status" ? stageLabel(v, ar) : undefined)} /></div>
  </BlockCard>;
}

/* ================================================================== working rules (Settings) ================================================================== */
export function WorkingRules({ user }: { user: string }) {
  const ar = useLang() === "ar";
  const r = crmRules();
  const [days, setDays] = useState(String(r.inactivityDays)); const [roles, setRoles] = useState(r.financeRoles.join(", "));
  const mgr = isManager(user);
  const save = () => { const x = saveCrmRules({ inactivityDays: Number(days), financeRoles: roles.split(",").map((v) => v.trim()).filter(Boolean) }, user); if (x.ok) toast.success(tx(ar, "Working rules saved", "حُفظت قواعد العمل")); else toast.error(x.error); };
  return <section className="ek-card ek-card-pad" data-crm-rules>
    <h3 className="ek-h3">{tx(ar, "Daily work rules", "قواعد العمل اليومي")}</h3>
    <p className="mb-3 text-xs text-muted-foreground">{tx(ar, `Defaults: “no activity” warning after ${RULE_DEFAULTS.inactivityDays} days; balances and aging for ${RULE_DEFAULTS.financeRoles.join(", ")}.`, `الافتراضي: تنبيه «لا نشاط» بعد ${daysAr(RULE_DEFAULTS.inactivityDays)}، والأرصدة والتقادم لأدوار ${RULE_DEFAULTS.financeRoles.join("، ")}.`)}</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm"><span>{tx(ar, "Warn on a deal with no activity after (days)", "تنبيه الصفقة بلا نشاط بعد (أيام)")}</span><input type="number" min={1} max={90} className="field-input" value={days} onChange={(e) => setDays(e.target.value)} disabled={!mgr} data-rule-days /></label>
      <label className="grid gap-1 text-sm"><span>{tx(ar, "Roles that see balances, aging and the payment score", "الأدوار التي ترى الأرصدة والتقادم وانتظام السداد")}</span><input className="field-input" value={roles} onChange={(e) => setRoles(e.target.value)} disabled={!mgr} data-rule-roles /></label>
    </div>
    <div className="mt-3">{mgr ? <button type="button" className="btn-primary" onClick={save} data-rule-save>{tx(ar, "Save", "حفظ")}</button> : <span className="text-xs text-muted-foreground">{tx(ar, "Only a Sales Manager can change these rules.", "يغيّر هذه القواعد مدير المبيعات فقط.")}</span>}</div>
  </section>;
}

/** C1-04 stage totals beside the funnel: per stage count · probability · total · weighted, and the sum against the deal list. */
export function StageTotalsCard({ user }: { user: string }) {
  const ar = useLang() === "ar";
  const cols = pipelineStages(user), chk = boardCheck(user);
  const wsum = chk.perStage.reduce((a, x) => a + x.weighted, 0);
  return <BlockCard id="crm-stage-totals" title={tx(ar, "Stage totals", "إجماليات المراحل")} sub={tx(ar, "Every deal sits in exactly one stage, so the stages add up to the deal list.", "كل صفقة في مرحلة واحدة فقط، لذلك مجموع المراحل يساوي قائمة الصفقات.")} attrs={{ "data-crm-stage-totals": chk.ok ? "ok" : "diff" }}>
    <div className="overflow-x-auto px-4 pb-4"><table className="dp-table w-full whitespace-nowrap text-[12.5px]" data-compact>
      <thead><tr><th className="text-start">{tx(ar, "Stage", "المرحلة")}</th><th className="text-end">{tx(ar, "Deals", "الصفقات")}</th><th className="text-end">{tx(ar, "Probability", "الاحتمال")}</th><th className="text-end">{tx(ar, "Total", "الإجمالي")}</th><th className="text-end">{tx(ar, "Weighted", "المرجّح")}</th></tr></thead>
      <tbody>{cols.map((c) => <tr key={c.key} data-stage-total={c.key}><td><span className="me-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: stageHue(c.color) }} aria-hidden />{stageLabel(c.key, ar)}</td>
        <td className="text-end tabular-nums" data-no-i18n>{c.count}</td><td className="text-end tabular-nums" data-no-i18n>{c.prob}%</td><td className="text-end tabular-nums" data-no-i18n><bdi dir="ltr">{money(c.total)}</bdi></td><td className="text-end tabular-nums" data-no-i18n><bdi dir="ltr">{money(c.weighted)}</bdi></td></tr>)}</tbody>
      <tfoot><tr className="font-semibold"><td>{tx(ar, "All stages", "كل المراحل")}</td><td className="text-end tabular-nums" data-no-i18n>{chk.colCount}</td><td /><td className="text-end tabular-nums" data-no-i18n><bdi dir="ltr">{sar(chk.colTotal)}</bdi></td><td className="text-end tabular-nums" data-no-i18n><bdi dir="ltr">{sar(Math.round(wsum * 100) / 100)}</bdi></td></tr>
        <tr><td>{tx(ar, "Deal list", "قائمة الصفقات")}</td><td className="text-end tabular-nums" data-no-i18n>{chk.listCount}</td><td /><td className="text-end tabular-nums" data-no-i18n><bdi dir="ltr">{sar(chk.listTotal)}</bdi></td><td className="text-end"><span className={chk.ok ? "font-bold text-success" : "font-bold text-destructive"} data-crm-totals-match={chk.ok ? "yes" : "no"}>{chk.ok ? tx(ar, "= matches", "= مطابق") : tx(ar, "≠ differs", "≠ غير مطابق")}</span></td></tr></tfoot>
    </table></div>
  </BlockCard>;
}
