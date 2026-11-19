/**
 * DIGIT CRM register extensions for the native Leads and Deals lists (opt-in via Core listExt).
 * Adds operational highlights, separated status/quality/urgency columns, row actions and a preview inspector.
 * Native columns, tools, saved views and the full record form stay untouched and reachable.
 */
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { registerListExtension } from "@/components/crm/listExt";
import { useL } from "@/components/crm/crmI18n";
// CRM C4: lead and deal quick-view drawer bodies register with the Enterprise QuickView host
import "./CrmRecordParts";
import { assignLead, createTask, isManager, userLabel } from "./wf01";
import { customerForDeal, quotationsForDeal, dealProb, dealValue } from "./wf02";
import { Button } from "@/components/ui/button";
import { dealFlags, duplicatesOf, qualification, setLeadQualification } from "./wf05";

const FACTOR_AR: Record<string, string> = { "Email or mobile on record": "يوجد بريد أو جوال", "Company named": "الشركة محددة", "Lead source recorded": "مصدر العميل مسجل", "Owner assigned": "تم تعيين مسؤول", "No logged activity yet": "لا يوجد نشاط مسجل بعد", "Next action scheduled": "الإجراء التالي مجدول", "No next action scheduled": "لا يوجد إجراء تالٍ مجدول", "Overdue follow-up": "متابعة متأخرة", "Status is Qualified": "الحالة: مؤهل" };
export function factorLabel(label: string, lang: string): string {
  if (lang !== "ar") return label;
  if (FACTOR_AR[label]) return FACTOR_AR[label];
  const m = label.match(/^Activity (\d+) days?(?:\(s\))? ago$/); if (m) return `آخر نشاط قبل ${m[1]} يوم`;
  const n = label.match(/^No activity for (\d+) days$/); if (n) return `لا نشاط منذ ${n[1]} يوم`;
  return label;
}
import { crmActivityRows, lastCrmActivity } from "@/lib/crmActivity";
import { dealAgeDays, dealMatches, DEAL_HIGHLIGHTS, LEAD_HIGHLIGHTS, leadMatches, leadRow, REGISTER_RULES, weightedOf, type Urgency } from "./wf08";
import { dealsMoney, fmtMoney } from "./wf05";
import { CalendarClock, UserRound, Activity } from "lucide-react";
import { linkTitle } from "@/lib/linkTitle";
const orgTitle = (v: unknown) => linkTitle("CRM Organization", v);

const AR: Record<string, string> = {
  "No first contact recorded": "لا يوجد تواصل أول مسجل", "Response overdue": "تجاوزت مهلة الاستجابة",
  "Lead": "العميل المحتمل", "Quality": "التقييم", "Owner": "المسؤول", "Next Action": "الإجراء التالي", "Last Activity": "آخر نشاط",
  "Source": "المصدر", "SLA": "الاستجابة", "Created": "تاريخ الإنشاء", "Actions": "الإجراءات", "Deal": "الصفقة", "Stage": "المرحلة",
  "Value": "القيمة", "Probability": "الاحتمال", "Weighted": "القيمة المرجحة", "Stage Age": "عمر المرحلة", "Deal Age": "عمر الصفقة",
  "Expected Close": "الإغلاق المتوقع", "Health": "الحالة التشغيلية", "ERP handoff": "الربط بالمستندات", "Customer linked": "عميل مرتبط", "Quotation linked": "عرض سعر مرتبط", "Not linked": "غير مرتبط",
  "New leads": "عملاء جدد", "Unassigned": "غير مسندة", "Qualified": "مؤهلة", "First response overdue": "تأخر الرد الأول",
  "No follow-up": "بلا متابعة", "Possible duplicates": "تكرار محتمل", "Stale": "راكدة", "No next action": "بلا إجراء تالٍ",
  "Close date passed": "تجاوزت تاريخ الإغلاق", "High value, no follow-up": "قيمة عالية بلا متابعة",
  "Overdue": "متأخر", "Due today": "مستحق اليوم", "Scheduled": "مجدول", "None": "لا يوجد", "—": "—",
  "Hot": "ساخن", "Warm": "دافئ", "Cold": "بارد", "Met": "ضمن المهلة", "Pending": "قيد الانتظار", "Breached": "متأخر",
  "Open": "فتح", "Qualify": "تأهيل", "Follow up": "متابعة", "Assign to me": "إسناد لي", "Full form": "النموذج الكامل",
  "Workspace": "مساحة التأهيل", "Clear": "مسح", "Showing": "عرض", "Score": "الدرجة", "Score explanation": "تفسير الدرجة",
  "Qualification": "التأهيل", "Upcoming": "القادم", "Duplicates": "التكرارات", "Linked deal": "الصفقة المرتبطة", "Close": "إغلاق",
  "days": "يوم", "Today": "اليوم", "Yesterday": "أمس", "{n} days ago": "منذ {n} يوم", "{n} days ago (few)": "منذ {n} أيام", "Administrator": "المسؤول", "{n} days": "{n} يوم", "{n} days (few)": "{n} أيام", "h": "س", "d": "ي", "Unassigned owner": "غير مسند", "Follow-up scheduled": "تمت جدولة المتابعة", "Lead qualified": "تم تأهيل العميل",
  "Assigned": "تم الإسناد", "Deal flags": "مؤشرات الصفقة", "Weighted value in deal currency": "القيمة المرجحة بعملة الصفقة",
  "Compact": "مضغوط", "Comfortable": "مريح", "Working default": "قيمة افتراضية قابلة للتعديل", "Organization": "المنظمة", "Lifecycle": "دورة الحياة", "Recent activity": "آخر نشاط",
};
function useT() { const { lang } = useL(); return { lang, t: (s: string) => (lang === "ar" ? AR[s] ?? s : s) }; }

const URG_TONE: Record<Urgency, string> = { overdue: "red", today: "orange", scheduled: "blue", none: "gray", clear: "green" };
const URG_LABEL: Record<Urgency, string> = { overdue: "Overdue", today: "Due today", scheduled: "Scheduled", none: "No follow-up", clear: "—" };
const BAND_ICON = { Hot: "▲", Warm: "◆", Cold: "▽" } as const;

function Pill({ tone, children, title }: { tone: string; children: React.ReactNode; title?: string }) {
  return <span title={title} className="inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] leading-4" style={{ borderColor: `var(--status-${tone})`, color: "var(--crm-ink, inherit)" }}>{children}</span>;
}
/** Relative age: "Today" / "Yesterday" / "N days ago" (Arabic: اليوم / أمس / منذ N يوم) — reads as recency, not a bare count. */
const EN_FEW = (k: string) => k.replace(" (few)", "");
const ago = (iso: string, t: (s: string) => string) => { const x = Date.parse(iso); if (!Number.isFinite(x)) return t("—"); const d = Math.max(0, Math.floor((Date.now() - x) / 864e5)); if (d === 0) return t("Today"); if (d === 1) return t("Yesterday"); const tt = (k: string) => EN_FEW(t(k)); return tt(d >= 3 && d <= 10 ? "{n} days ago (few)" : "{n} days ago").replace("{n}", String(d)); };
/** Elapsed hours as "3d 4h" beyond 48h, else "5h" — SLA durations stay scannable. */
export const hoursText = (h: number, t: (s: string) => string = (x) => x) => { const n = Math.max(0, Math.round(h)); return n >= 48 ? `${Math.floor(n / 24)}${t("d")} ${n % 24}${t("h")}` : `${n}${t("h")}`; };
const dueText = (v: unknown) => String(v ?? "").slice(0, 16).replace("T", " ");

function T({ s, n }: { s: string; n?: number }) { const { t } = useT(); const v = n !== undefined && n >= 3 && n <= 10 && t(s + " (few)") !== s + " (few)" ? t(s + " (few)") : t(s); return <>{n === undefined ? v : v.replace("{n}", String(n))}</>; }
function Ago({ iso }: { iso: string }) { const { t } = useT(); return <span className="whitespace-nowrap text-crm-muted tabular-nums" data-no-i18n title={iso ? iso.slice(0, 16).replace("T", " ") : undefined}>{iso ? ago(iso, t) : "—"}</span>; }

/* ---------------- Leads ---------------- */
function leadCell(key: string, l: Doc) {
  const r = leadRow(l);
  switch (key) {
    case "x_lead": return <div className="max-w-[11rem] break-words leading-tight"><Link to="/digit-crm/leads/$leadId" params={{ leadId: l.name }} className="font-medium hover:underline" data-no-i18n>{String(l["lead_name"] || l["first_name"] || l.name)}</Link><div className="text-[11px] text-crm-muted" data-no-i18n>{orgTitle(l["organization"])} · {l.name}</div></div>;
    case "x_quality": return <Pill tone={r.band === "Hot" ? "green" : r.band === "Warm" ? "orange" : "gray"} title={r.factors.map((f) => `${factorLabel(f.label, typeof document === "undefined" ? "ar" : document.documentElement.lang || "en")} ${f.points}`).join("\n")}><span aria-hidden>{BAND_ICON[r.band]}</span><span dir="ltr" data-no-i18n>{r.score}</span> <T s={r.band} /></Pill>;
    case "x_owner": return l["lead_owner"] ? <span data-no-i18n>{l["lead_owner"] === "Administrator" ? <T s="Administrator" /> : userLabel(l["lead_owner"])}</span> : <span className="text-crm-muted"><T s="Unassigned owner" /></span>;
    case "x_next": return <div className="leading-tight"><Pill tone={URG_TONE[r.urgency]}><T s={URG_LABEL[r.urgency]} /></Pill>{r.next && <div className="mt-0.5 max-w-[8rem] break-words text-[11px] text-crm-muted"><span data-no-i18n>{String(r.next["title"] ?? "")}</span> · <span dir="ltr" data-no-i18n>{dueText(r.next["due_date"])}</span></div>}</div>;
    case "x_last": return <Ago iso={lastCrmActivity("CRM Lead", l.name)} />;
    case "x_sla": return r.sla.state === "na" ? <span className="text-crm-muted">—</span> : <div className="space-y-1">{r.sla.missingContact && <div className="text-[11px] text-crm-muted"><T s="No first contact recorded" /></div>}<Pill tone={r.sla.state === "met" ? "green" : r.sla.state === "pending" ? "blue" : "red"}><T s={r.sla.state === "met" ? "Met" : r.sla.state === "pending" ? "Pending" : r.sla.missingContact ? "Response overdue" : "Breached"} />{(!r.sla.missingContact || r.sla.state === "breached") && <span className="tabular-nums" data-no-i18n>{hoursText(r.sla.hours ?? 0, (x) => (typeof document !== "undefined" && document.documentElement.lang === "ar" ? AR[x] ?? x : x))}</span>}</Pill></div>;
    case "x_created": return <Ago iso={String(l["creation"] ?? "")} />;
    case "x_source": return <span>{String(l["source"] ?? "—")}</span>;
    default: return null;
  }
}
function LeadActions({ row }: { row: Doc }) {
  const { t } = useT(); const user = currentUser();
  const [, bump] = useState(0);
  const follow = () => { const d = new Date(Date.now() + 864e5); d.setHours(10, 0, 0, 0); const r = createTask({ lead: row.name, title: `Follow up: ${row["lead_name"] ?? row.name}`, due: d.toISOString().slice(0, 19).replace("T", " "), priority: "Medium" }, user); if (r.ok) toast.success(t("Follow-up scheduled")); else toast.error(Object.values(r.errors)[0]); bump((n) => n + 1); };
  const qualify = () => { const r = setLeadQualification(row.name, "Qualified", user); if (r.ok) toast.success(t("Lead qualified")); else toast.error(r.error); bump((n) => n + 1); };
  const assign = () => { const r = assignLead(row.name, user, user); if (r.ok) toast.success(t("Assigned")); else toast.error(Object.values(r.errors)[0]); bump((n) => n + 1); };
  const b = "rounded border border-crm-line px-1.5 py-0.5 text-[11px] hover:bg-crm-hover";
  return <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
    {row["status"] !== "Qualified" && <button type="button" className={b} onClick={qualify}>{t("Qualify")}</button>}
    <button type="button" className={b} onClick={follow}>{t("Follow up")}</button>
    {isManager(user) && !row["lead_owner"] && <button type="button" className={b} onClick={assign}>{t("Assign to me")}</button>}
  </div>;
}
function LeadInspector({ row, onClose }: { row: Doc; onClose: () => void }) {
  const { t, lang } = useT(); const r = leadRow(row); const q = qualification(row);
  const dupes = duplicatesOf({ name: row.name, email: row["email"], mobile_no: row["mobile_no"], phone: row["phone"] });
  const deal = adapter.related("CRM Deal", "lead", row.name)[0];
  const acts = crmActivityRows("CRM Lead", row.name).filter(a => Date.parse(a.when) <= Date.now()).slice(0, 5);
  return <Panel title={String(row["lead_name"] || row.name)} sub={`${orgTitle(row["organization"])} · ${row.name}`} onClose={onClose}>
    <Kv k={t("Lifecycle")} v={<span data-no-i18n>{String(row["status"] ?? "")}</span>} />
    <Kv k={t("Source")} v={<span data-no-i18n>{String(row["source"] ?? "—")}</span>} />
    <Kv k={t("Owner")} v={row["lead_owner"] ? <span data-no-i18n>{userLabel(row["lead_owner"])}</span> : t("Unassigned owner")} />
    <H>{t("Score")} · <span dir="ltr" data-no-i18n>{r.score}</span> <T s={r.band} /></H>
    <ul className="space-y-0.5 text-xs">{r.factors.map((f) => <li key={f.id} className="flex justify-between gap-2"><span>{f.kind === "positive" ? "✓" : f.kind === "negative" ? "✕" : "○"} <span data-no-i18n>{factorLabel(f.label, lang)}</span></span><span dir="ltr" data-no-i18n>{f.points > 0 ? `+${f.points}` : f.points}</span></li>)}</ul>
    <H>{t("Qualification")} · <span dir="ltr" data-no-i18n>{q.completeness}%</span></H>
    <ul className="space-y-0.5 text-xs">{q.checks.map((c) => <li key={c.id}>{c.ok ? "✓" : "○"} {c.label}</li>)}</ul>
    <H>{t("Upcoming")}</H>
    {r.next ? <p className="text-xs"><span data-no-i18n>{String(r.next["title"] ?? "")}</span> · <span dir="ltr" data-no-i18n>{dueText(r.next["due_date"])}</span></p> : <p className="text-xs text-crm-muted">{t("No next action")}</p>}
    <H>{t("Recent activity")}</H>
    {acts.length ? <ul className="space-y-0.5 text-xs">{acts.map((a) => <li key={a.doc.doctype + a.doc.name} data-no-i18n>{String(a.doc["title"] ?? a.doc["subject"] ?? a.doc["type"] ?? a.doc.name)} · <span dir="ltr">{a.when.slice(0, 10)}</span></li>)}</ul> : <p className="text-xs text-crm-muted">—</p>}
    {dupes.length > 0 && <><H>{t("Duplicates")}</H><ul className="text-xs">{dupes.map((d) => <li key={d.dt + d.name} data-no-i18n>{d.dt}: {d.title} ({d.on})</li>)}</ul></>}
    {deal && <><H>{t("Linked deal")}</H><Link to="/digit-crm/deals/$dealId" params={{ dealId: deal.name }} className="text-xs underline" data-no-i18n>{deal.name}</Link></>}
    <div className="mt-3 flex flex-wrap gap-2">
      <Link to="/app/$app/$doctype/$name" params={{ app: "crm", doctype: "crm_lead", name: row.name }} className="crm-btn-solid text-xs">{t("Full form")}</Link>
      <Link to="/digit-crm/leads/$leadId" params={{ leadId: row.name }} className="rounded border border-crm-line px-2 py-1 text-xs">{t("Workspace")}</Link>
    </div>
  </Panel>;
}

/* ---------------- Deals ---------------- */
function dealCell(key: string, d: Doc) {
  const f = dealFlags(d); const cur = String(d["currency"] || "SAR");
  const num = (v: number | null, suffix = "") => v === null ? <span className="text-crm-muted">—</span> : <span dir="ltr" className="whitespace-nowrap tabular-nums" data-no-i18n>{v.toLocaleString("en-US")}{suffix}</span>;
  switch (key) {
    case "x_deal": return <div className="max-w-[11rem] break-words leading-tight"><Link to="/digit-crm/deals/$dealId" params={{ dealId: d.name }} className="font-medium hover:underline" data-no-i18n>{orgTitle(d["organization"]) || d.name}</Link><div className="text-[11px] text-crm-muted" data-no-i18n>{d.name}</div></div>;
    case "x_value": return weightedOf(d) !== null ? <span dir="ltr" className="whitespace-nowrap tabular-nums" data-no-i18n>{cur} {dealValue(d).toLocaleString("en-US")}</span> : <span className="text-crm-muted">—</span>;
    case "x_handoff": { const quotes = quotationsForDeal(d.name); const customer = customerForDeal(d.name); return <div className="space-y-1 text-xs">{quotes.map((q) => <Link key={q.name} to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "quotation", name: q.name }} className="block text-primary hover:underline" data-no-i18n>{q.name}</Link>)}{customer && <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "customer", name: customer.name }} className="block text-primary hover:underline"><T s="Customer linked" /></Link>}{!quotes.length && !customer && <T s="Not linked" />}</div>; }
    case "x_prob": return num(dealProb(d), "%");
    case "x_weighted": { const w = weightedOf(d); return w === null ? <span className="text-crm-muted">—</span> : <span dir="ltr" className="whitespace-nowrap tabular-nums" data-no-i18n title="Weighted value in deal currency">{cur} {w.toLocaleString("en-US")}</span>; }
    case "x_owner": return d["deal_owner"] ? <span data-no-i18n>{d["deal_owner"] === "Administrator" ? <T s="Administrator" /> : userLabel(d["deal_owner"])}</span> : <span className="text-crm-muted"><T s="Unassigned owner" /></span>;
    case "x_stageage": { const a = f.stageAge; return a === null || a === undefined ? num(null) : <span className="whitespace-nowrap tabular-nums"><T s="{n} days" n={a} /></span>; }
    case "x_age": { const a = dealAgeDays(d); return a === null ? num(null) : <span className="whitespace-nowrap tabular-nums"><T s="{n} days" n={a} /></span>; }
    case "x_close": return <span dir="ltr" data-no-i18n className={f.overdueClose ? "font-medium text-destructive" : ""}>{String(d["expected_closure_date"] ?? "—").slice(0, 10)}</span>;
    case "x_last": return <Ago iso={f.last} />;
    case "x_next": return f.next ? <span className="text-xs" data-no-i18n>{String(f.next["title"] ?? "")} · <span dir="ltr">{dueText(f.next["due_date"])}</span></span> : <Pill tone="gray"><T s="No next action" /></Pill>;
    case "x_health": { const fl = [f.stale && "Stale", f.overdueClose && "Close date passed", f.highNoFollow && "High value, no follow-up"].filter(Boolean) as string[]; return fl.length ? <div className="flex flex-wrap gap-1">{fl.map((x) => <Pill key={x} tone="red"><T s={x} /></Pill>)}</div> : <span className="text-crm-muted">—</span>; }
    default: return null;
  }
}
function DealActions({ row }: { row: Doc }) {
  const { t } = useT(); const b = "rounded border border-crm-line px-1.5 py-0.5 text-[11px] hover:bg-crm-hover";
  return <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
    <Link to="/digit-crm/deals/$dealId" params={{ dealId: row.name }} className={b}>{t("Open")}</Link>
    <Link to="/digit-crm/deals/$dealId" params={{ dealId: row.name }} className={b}>{t("Full form")}</Link>
  </div>;
}
function DealInspector({ row, onClose }: { row: Doc; onClose: () => void }) {
  const { t } = useT(); const f = dealFlags(row); const cur = String(row["currency"] || "SAR");
  return <Panel title={orgTitle(row["organization"]) || row.name} sub={row.name} onClose={onClose}>
    <Kv k={t("Stage")} v={<span data-no-i18n>{String(row["status"] ?? "")}</span>} />
    <Kv k={t("Value")} v={<span dir="ltr" data-no-i18n>{cur} {dealValue(row).toLocaleString("en-US")}</span>} />
    <Kv k={t("Probability")} v={<span dir="ltr" data-no-i18n>{dealProb(row)}%</span>} />
    <Kv k={t("Weighted")} v={<span dir="ltr" data-no-i18n>{weightedOf(row) === null ? "—" : (cur === "SAR" ? `\u20C1 ${weightedOf(row)!.toLocaleString("en-US")}` : `${cur} ${weightedOf(row)!.toLocaleString("en-US")}`)}</span>} />
    <Kv k={t("Stage Age")} v={f.stageAge == null ? "—" : <T s="{n} days" n={f.stageAge} />} />
    <Kv k={t("Expected Close")} v={<span dir="ltr" data-no-i18n>{String(row["expected_closure_date"] ?? "—").slice(0, 10)}</span>} />
    <Kv k={t("Last Activity")} v={<Ago iso={f.last} />} />
    <H>{t("Next Action")}</H>
    {f.next ? <p className="text-xs" data-no-i18n>{String(f.next["title"] ?? "")} · <span dir="ltr">{dueText(f.next["due_date"])}</span></p> : <p className="text-xs text-crm-muted">{t("No next action")}</p>}
    <H>{t("Deal flags")}</H>
    <div className="flex flex-wrap gap-1">{dealCell("x_health", row)}</div>
    <div className="mt-3 flex flex-wrap gap-2">
      <Link to="/digit-crm/deals/$dealId" params={{ dealId: row.name }} className="crm-btn-solid text-xs">{t("Open")}</Link>
      <Link to="/digit-crm/deals/$dealId" params={{ dealId: row.name }} className="rounded border border-crm-line px-2 py-1 text-xs">{t("Full form")}</Link>
    </div>
  </Panel>;
}

/* ---------------- shared bits ---------------- */
function Panel({ title, sub, onClose, children }: { title: string; sub: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = useT();
  return <aside className="w-full shrink-0 border-crm-line bg-crm-surface p-4 text-sm md:w-80 md:border-s" data-dc-inspector aria-label={title}>
    <div className="mb-2 flex items-start gap-2"><div className="min-w-0 flex-1"><div className="truncate text-base font-semibold" data-no-i18n>{title}</div><div className="truncate text-xs text-crm-muted" data-no-i18n>{sub}</div></div><button type="button" onClick={onClose} className="rounded px-2 text-crm-muted hover:bg-crm-hover" aria-label={t("Close")}>×</button></div>
    {children}
  </aside>;
}
const Kv = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between gap-2 py-0.5 text-xs"><span className="text-crm-muted">{k}</span><span>{v}</span></div>;
const H = ({ children }: { children: React.ReactNode }) => <div className="mt-3 mb-1 text-xs font-semibold">{children}</div>;

const LEAD_HL_LABEL: Record<string, string> = { new: "New leads", unassigned: "Unassigned", qualified: "Qualified", sla: "First response overdue", nofollow: "No follow-up", dupes: "Possible duplicates" };
const DEAL_HL_LABEL: Record<string, string> = { stale: "Stale", nonext: "No next action", overdueclose: "Close date passed", highnofollow: "High value, no follow-up" };

export function DealKanbanContent({ row }: { row: Doc }) {
  const { t } = useT();
  return <div className="space-y-2"><div className="font-semibold">{dealCell("x_value", row)} <span className="text-xs font-normal text-muted-foreground">· {dealCell("x_prob", row)}</span></div><div className="text-xs text-muted-foreground">{t("Weighted")} {dealCell("x_weighted", row)}</div><div className="flex flex-wrap gap-1">{dealCell("x_health", row)}</div><div className="flex items-start gap-1 text-xs"><CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />{dealCell("x_next", row)}</div><div className="flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5" />{dealCell("x_last", row)}</span><span className="flex min-w-0 items-center gap-1"><UserRound className="h-5 w-5 shrink-0 rounded-full bg-muted p-0.5" />{dealCell("x_owner", row)}</span></div></div>;
}
function LeadKanbanContent({ row }: { row: Doc }) {
  return <div className="space-y-2"><div className="flex flex-wrap gap-1">{leadCell("x_quality", row)}{leadCell("x_source", row)}</div><div className="flex items-start gap-1 text-xs"><CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />{leadCell("x_next", row)}</div><div className="flex items-center justify-between gap-2 text-xs">{leadCell("x_last", row)}<span className="flex items-center gap-1"><UserRound className="h-5 w-5 rounded-full bg-muted p-0.5" />{leadCell("x_owner", row)}</span></div></div>;
}
export const dealKanbanSummary = (rows: Doc[]) => <><span data-no-i18n dir="ltr">{fmtMoney(dealsMoney(rows))}</span><div><T s="Weighted" /> <span data-no-i18n dir="ltr">{fmtMoney(dealsMoney(rows, true))}</span></div></>;

/** Explicit startup dependency survives production tree-shaking. */
export function registerCrmListExtensions() {
registerListExtension("digit_crm", "CRM Lead", {
  columns: [
    { key: "x_lead", label: "Lead" }, { key: "x_quality", label: "Quality" }, { key: "x_owner", label: "Owner" }, { key: "x_next", label: "Next Action" },
    { key: "x_last", label: "Last Activity" }, { key: "x_source", label: "Source" }, { key: "x_sla", label: "SLA" }, { key: "x_created", label: "Created" },
  ],
  defaultCols: ["x_lead", "status", "x_quality", "x_owner", "x_next", "x_last", "x_source", "x_sla", "x_created"],
  highlights: (rows) => LEAD_HIGHLIGHTS.map((id) => ({ id, label: LEAD_HL_LABEL[id]!, count: rows.filter((r) => leadMatches(id, r)).length, tone: id === "sla" || id === "dupes" ? "red" : id === "nofollow" || id === "unassigned" ? "orange" : "blue" })),
  matches: (id, r) => leadMatches(id, r),
  cell: leadCell, Actions: LeadActions, Inspector: LeadInspector, t: (s, lang) => (lang === "ar" ? AR[s] ?? s : s),
  KanbanContent: LeadKanbanContent,
});
registerListExtension("digit_crm", "CRM Deal", {
  columns: [
    { key: "x_deal", label: "Deal" }, { key: "x_value", label: "Value" }, { key: "x_prob", label: "Probability" }, { key: "x_weighted", label: "Weighted" },
    { key: "x_owner", label: "Owner" }, { key: "x_stageage", label: "Stage Age" }, { key: "x_age", label: "Deal Age" }, { key: "x_close", label: "Expected Close" },
    { key: "x_last", label: "Last Activity" }, { key: "x_next", label: "Next Action" }, { key: "x_health", label: "Health" }, { key: "x_handoff", label: "ERP handoff" },
  ],
  defaultCols: ["x_deal", "status", "x_value", "x_prob", "x_weighted", "x_owner", "x_stageage", "x_close", "x_last", "x_next", "x_health", "x_handoff"],
  highlights: (rows) => DEAL_HIGHLIGHTS.map((id) => ({ id, label: DEAL_HL_LABEL[id]!, count: rows.filter((r) => dealMatches(id, r)).length, tone: id === "nonext" ? "orange" : "red" })),
  matches: (id, r) => dealMatches(id, r),
  cell: dealCell, Actions: DealActions, Inspector: DealInspector, t: (s, lang) => (lang === "ar" ? AR[s] ?? s : s),
  KanbanContent: DealKanbanContent, kanbanSummary: dealKanbanSummary,
});
}

export const REGISTER_LABELS = AR;
export { REGISTER_RULES };
