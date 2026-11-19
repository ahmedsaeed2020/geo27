/**
 * DIGIT CRM C4 shared record parts (owner 2026-11-17): labels, dates, the activity timeline + composer bound to the lead
 * and deal records, the next-step card, score / SLA chips and the lead and deal quick-view drawer bodies (registered
 * with the Enterprise QuickView host, so a list row or a kanban card opens here without leaving the screen).
 * Display only — every write goes through leadDesk / dealDesk.
 */
import { arabicDisplay } from "@/lib/seedNamesAr";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { adapter, type Doc } from "@/lib/adapter";
import { crmActivityRows } from "@/lib/crmActivity";
import { changeLog } from "@/lib/changeLog";
import { fmtCurrency } from "@/lib/format";
import { useSessionUser } from "@/lib/session";
import { registerDrawerBody, type DrawerBodyProps } from "@/components/enterprise/QuickView";
import { Composer, Timeline, type ComposerMode, type TlItem } from "@/components/enterprise/kit/RecordTimeline";
import { Pill, ScoreBadge, SideCard, SlaChip, type ScorePart } from "@/components/enterprise/kit/RecordFrame";
import { bucketOf, OPEN_TASK, userLabel } from "./wf01";
import { dealStatusType } from "./wf02";
import { CALL_OUTCOMES, commentOn, commentsOf, completeStep, LEAD_STATUS_AR, LEAD_STATUS_HUE, leadRowOf, logActivity, nextStepOf, pinActivity, setNextStep, WA_TEMPLATES, type LeadRow, type LeadSla, type Msg } from "./leadDesk";
import { dealFocus, dealSummary, dealTitle, FORECAST_AR, FORECAST_EN } from "./dealDesk";
import type { Factor } from "./wf05";
import { SOURCE_AR } from "./leadRules";

/** Display name of a user: the seeded sample users (CRM_USERS, Administrator) show their Arabic name on Arabic screens; any
 *  other user stays exactly as typed (seeded = Administrator or a synthetic sample User). */
const seededUser = (u: string) => u === "Administrator" || !!adapter.get("User", u)?.["__synthetic"];
export const personLabel = (u: unknown, ar: boolean) => { const n = userLabel(u) || String(u ?? ""); return ar && seededUser(String(u ?? "")) ? arabicDisplay(n) ?? n : n; };
export const tx = (ar: boolean, en: string, a: string) => (ar ? a : en);
export const m = (x: Msg, ar: boolean) => x[ar ? 1 : 0];
const s = (v: unknown) => String(v ?? "");
const pad = (n: number) => String(n).padStart(2, "0");
const parse = (v: unknown) => { const x = s(v); const d = new Date(/^\d{4}-\d{2}-\d{2} /.test(x) ? x.replace(" ", "T") : x); return Number.isFinite(d.getTime()) ? d : null; };
/** dd/mm/yyyy (owner page rule) */
export const dmy = (v: unknown) => { const d = parse(v); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : "—"; };
export const dmyhm = (v: unknown) => { const d = parse(v); return d ? `${dmy(v)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : "—"; };
export const daysAr = (n: number) => (n === 1 ? "يوم واحد" : n === 2 ? "يومين" : n <= 10 ? `${n} أيام` : `${n} يومًا`);
/** "منذ 3 أيام" / "3 days ago" — past only; a future time reads as its date. */
export function ago(v: unknown, ar: boolean, now = Date.now()) {
  const d = parse(v); if (!d) return "—";
  const ms = now - d.getTime(); if (ms < 0) return dmyhm(v);
  const h = Math.floor(ms / 36e5), dd = Math.floor(ms / 864e5);
  if (h < 1) return tx(ar, "minutes ago", "منذ دقائق");
  if (h < 24) return ar ? `منذ ${h === 1 ? "ساعة" : h === 2 ? "ساعتين" : h <= 10 ? `${h} ساعات` : `${h} ساعة`}` : `${h} h ago`;
  if (dd === 1) return tx(ar, "yesterday", "أمس");
  return ar ? `منذ ${daysAr(dd)}` : `${dd} days ago`;
}
/** Due text with its tone: red overdue, amber today. */
export function dueText(v: unknown, ar: boolean, now = new Date()): { text: string; tone: "bad" | "warn" | undefined } {
  const d = parse(v); if (!d) return { text: tx(ar, "No date", "بلا تاريخ"), tone: undefined };
  const day = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  const t = day(now), k = day(d), hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (k === t) return { text: tx(ar, `Today ${hm}`, `اليوم ${hm}`), tone: d.getTime() < now.getTime() ? "bad" : "warn" };
  if (k < t) { const n = Math.round((Date.parse(`${t}T00:00:00`) - Date.parse(`${k}T00:00:00`)) / 864e5); return { text: ar ? `متأخر ${daysAr(n)}` : `${n} day${n === 1 ? "" : "s"} late`, tone: "bad" }; }
  return { text: dmy(v), tone: undefined };
}
export const sar = (n: number) => fmtCurrency(Math.round(n * 100) / 100, String(adapter.get("FCRM Settings", "FCRM Settings")?.["custom_currency"] ?? "") || "SAR");

/* ------------------------------------------------------------------ labels ------------------------------------------------------------------ */
export const SOURCES = ["Website", "Cold Calling", "Exhibition", "Reference", "Advertisement", "Campaign", "WhatsApp", "Business card"];
export const INDUSTRIES = ["Construction", "Healthcare", "Hospitality", "Logistics", "Education", "Retail", "Manufacturing", "Real Estate", "Government"];
const INDUSTRY_AR: Record<string, string> = { Construction: "المقاولات", Healthcare: "الرعاية الصحية", Hospitality: "الضيافة", Logistics: "الخدمات اللوجستية", Education: "التعليم", Retail: "التجزئة", Manufacturing: "التصنيع", "Real Estate": "العقارات", Government: "القطاع الحكومي" };
export const SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];
export const CITIES = ["الرياض", "جدة", "الدمام", "مكة المكرمة", "المدينة المنورة", "الخبر", "الطائف", "أبها"];
export const srcLabel = (v: string, ar: boolean) => (ar ? SOURCE_AR[v] ?? v : v) || "—";
export const indLabel = (v: string, ar: boolean) => (ar ? INDUSTRY_AR[v] ?? v : v) || "—";
export const stLabel = (v: string, ar: boolean) => (ar ? String(adapter.get("CRM Lead Status", v)?.["custom_label_ar"] ?? "") || LEAD_STATUS_AR[v] || v : v);
const DEAL_STAGE_AR: Record<string, string> = { Qualification: "التأهيل", "Demo/Making": "العرض التوضيحي", "Proposal/Quotation": "العرض / التسعير", Negotiation: "التفاوض", "Ready to Close": "جاهزة للإغلاق", Won: "ربح", Lost: "خسارة" };
export const stageLabelOf = (v: string, ar: boolean) => (ar ? DEAL_STAGE_AR[v] ?? v : v);
export const FIELD_LABEL: Record<string, [string, string]> = {
  first_name: ["First name", "الاسم الأول"], last_name: ["Last name", "اسم العائلة"], lead_name: ["Name", "الاسم"], job_title: ["Job title", "المسمى الوظيفي"], mobile_no: ["Mobile", "الجوال"], email: ["Email", "البريد الإلكتروني"],
  organization: ["Company", "الشركة"], website: ["Website", "الموقع الإلكتروني"], custom_cr_no: ["Commercial registration", "السجل التجاري"], custom_vat_no: ["VAT number", "الرقم الضريبي"], industry: ["Industry", "القطاع"],
  no_of_employees: ["Company size", "حجم الشركة"], territory: ["City / region", "المدينة / المنطقة"], source: ["Source", "المصدر"], campaign: ["Campaign", "الحملة"], custom_interest: ["Interest / products", "الاهتمام / المنتجات"],
  custom_estimated_value: ["Estimated value", "القيمة التقديرية"], lead_owner: ["Owner", "المالك"], status: ["Status", "الحالة"], custom_consent_whatsapp: ["WhatsApp consent", "موافقة واتساب"], custom_consent_email: ["Email consent", "موافقة البريد"],
  custom_consent_sms: ["SMS consent", "موافقة الرسائل النصية"], custom_consent_date: ["Consent recorded", "تاريخ تسجيل الموافقة"], deal_value: ["Deal value", "قيمة الصفقة"], expected_closure_date: ["Expected close", "الإغلاق المتوقع"], next_step: ["Next step", "الخطوة التالية"],
  custom_deal_name: ["Deal name", "اسم الصفقة"], custom_pipeline: ["Pipeline", "مسار المبيعات"], probability: ["Probability", "الاحتمالية"], deal_owner: ["Owner", "المالك"], custom_unqualified_reason: ["Unqualified reason", "سبب عدم التأهيل"],
  lost_reason: ["Loss reason", "سبب الخسارة"], custom_competitor: ["Competitor", "المنافس"], lost_notes: ["Notes", "ملاحظات"], custom_forecast_category: ["Forecast category", "فئة التوقع"], contacts: ["Contacts", "جهات الاتصال"], products: ["Products", "المنتجات"],
  converted: ["Converted", "محوّل"], communication_status: ["Communication status", "حالة التواصل"], custom_archived: ["Archived", "مؤرشف"], lead: ["Lead", "العميل المحتمل"],
};
export const fieldLabel = (k: string, ar: boolean, fallback?: string) => FIELD_LABEL[k]?.[ar ? 1 : 0] ?? fallback ?? k;
const GROUP_LABEL: Record<string, [string, string]> = { source: ["Source", "المصدر"], company: ["Company & size", "الشركة والحجم"], engagement: ["Engagement", "التفاعل"], budget: ["Budget", "الميزانية"] };

/* ------------------------------------------------------------------ chips ------------------------------------------------------------------ */
export const scoreParts = (fs: Factor[], ar: boolean): ScorePart[] => fs.map((f) => ({ key: f.id, group: f.group ?? "engagement", label: ar ? (f.id === "source" && f.label.startsWith("Source: ") ? `المصدر: ${srcLabel(f.label.slice(8), true)}` : f.labelAr ?? f.label) : f.label, points: f.points, kind: f.kind }));
export function LeadScore({ r, ar, plain }: { r: Pick<LeadRow, "score" | "band" | "factors">; ar: boolean; plain?: boolean }) {
  return <ScoreBadge score={r.score} band={r.band} ar={ar} parts={plain ? undefined : scoreParts(r.factors, ar)} groups={Object.fromEntries(Object.entries(GROUP_LABEL).map(([k, v]) => [k, v[ar ? 1 : 0]]))} />;
}
export function LeadSlaChip({ sla, ar }: { sla: LeadSla; ar: boolean }) {
  const h = (n: number | null) => (n === null ? "" : ar ? `${n} س` : `${n} h`);
  const text = sla.state === "met" ? tx(ar, `in ${h(sla.elapsed)}`, `خلال ${h(sla.elapsed)}`) : sla.state === "breached" ? (sla.respondedAt ? tx(ar, `late, ${h(sla.elapsed)}`, `متأخر، ${h(sla.elapsed)}`) : tx(ar, `over ${h(sla.hours)}`, `أكثر من ${h(sla.hours)}`))
    : sla.state === "ok" || sla.state === "risk" ? tx(ar, `${h(Math.max(0, Math.round((sla.hours - (sla.elapsed ?? 0)) * 10) / 10))} left`, `متبقٍ ${h(Math.max(0, Math.round((sla.hours - (sla.elapsed ?? 0)) * 10) / 10))}`) : undefined;
  return <SlaChip state={sla.state} ar={ar} text={text} />;
}
export const StatusPill = ({ k, ar }: { k: string; ar: boolean }) => <Pill hue={LEAD_STATUS_HUE[k] ?? "grey"} attrs={{ "data-lead-status": k }}>{stLabel(k, ar)}</Pill>;
export function OwnerTag({ user, ar }: { user: string; ar: boolean }) {
  if (!user) return <span className="ek-rl-sub" data-owner="none">{tx(ar, "No owner", "بدون مالك")}</span>;
  const n = personLabel(user, ar) || user;
  return <span className="inline-flex min-w-0 items-center gap-1.5" data-owner={user}><span className="ek-av" data-size="28" aria-hidden data-no-i18n>{n.split(/\s+/).map((x) => x[0]).slice(0, 2).join("")}</span><bdi className="truncate" data-no-i18n>{n}</bdi></span>;
}

/* ------------------------------------------------------------------ timeline ------------------------------------------------------------------ */
const strip = (h: unknown) => s(h).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
const OUT_AR: Record<string, string> = Object.fromEntries(CALL_OUTCOMES.map(([k, a]) => [k, a]));
const SKIP_FIELDS = new Set(["status", "modified", "_assign", "status_change_log", "sla_status", "response_by", "first_responded_on", "first_response_time", "last_responded_on", "communication_status", "custom_pinned", "custom_converted_on", "custom_converted_deal", "custom_converted_org", "custom_converted_contact", "__crm_v1"]);
function itemOf(doc: Doc, when: string, ar: boolean, now: Date, fromLead: boolean): TlItem | null {
  const id = `${doc.doctype}::${doc.name}`, pinned = !!Number(doc["custom_pinned"]);
  const comments = commentsOf(doc.doctype, doc.name).map((c) => ({ key: c.name, who: personLabel(c["comment_email"] || c["owner"], ar) || s(c["owner"]), at: s(c["creation"]), text: s(c["content"]) }));
  const meta = fromLead ? <span className="ek-pill" data-tone="info">{tx(ar, "from the lead", "من العميل المحتمل")}</span> : undefined;
  const base = { id, at: when, pinned, comments, meta };
  switch (doc.doctype) {
    case "CRM Task": {
      const open = OPEN_TASK.includes(s(doc["status"])), b = bucketOf(doc, now), due = dueText(doc["due_date"], ar, now);
      return { ...base, kind: "task", title: <><span data-no-i18n>{s(doc["title"]) || doc.name}</span> <small className={due.tone === "bad" && open ? "text-[var(--negative)]" : ""}>· {open ? due.text : tx(ar, s(doc["status"]) === "Done" ? "Done" : "Canceled", s(doc["status"]) === "Done" ? "تمّت" : "أُلغيت")}</small></>, who: personLabel(doc["assigned_to"], ar) || undefined, tone: open && b === "overdue" ? "bad" : open && b === "today" ? "warn" : undefined };
    }
    case "FCRM Note": return { ...base, kind: "note", title: <span data-no-i18n>{s(doc["title"]) || tx(ar, "Note", "ملاحظة")}</span>, body: <p className="whitespace-pre-line" data-no-i18n>{strip(doc["content"])}</p>, who: personLabel(doc["owner"], ar) || undefined };
    case "CRM Call Log": {
      const out = s(doc["status"]), mins = Math.round(Number(doc["duration"] ?? 0) / 60);
      return { ...base, kind: "call", title: <>{s(doc["type"]) === "Incoming" ? tx(ar, "Incoming call", "مكالمة واردة") : tx(ar, "Outgoing call", "مكالمة صادرة")} · {ar ? OUT_AR[out] ?? out : out}{mins > 0 && <> · <bdi dir="ltr" data-no-i18n>{mins}</bdi> {tx(ar, "min", "د")}</>}</>, who: personLabel(doc["caller"] || doc["receiver"], ar) || undefined, tone: out === "Completed" ? "ok" : undefined };
    }
    case "Communication": {
      const wa = s(doc["custom_channel"]) === "WhatsApp" || s(doc["communication_medium"]) === "Chat", sb = !!Number(doc["custom_sandbox"]) || ["Queued", "Not Sent"].includes(s(doc["delivery_status"]));
      return { ...base, kind: wa ? "whatsapp" : s(doc["communication_medium"]) === "Phone" ? "call" : "email", title: <span data-no-i18n>{wa ? `${tx(ar, "WhatsApp", "واتساب")} → ${s(doc["recipients"] || doc["phone_no"])}` : s(doc["subject"]) || tx(ar, "Email", "بريد")}</span>, body: <p className="line-clamp-3 whitespace-pre-line" data-no-i18n>{strip(doc["content"])}</p>, who: personLabel(doc["sender"], ar) || s(doc["sender"]) || undefined, sandbox: sb };
    }
    case "Event": return { ...base, kind: "meeting", title: <><span data-no-i18n>{s(doc["subject"]) || tx(ar, "Meeting", "اجتماع")}</span> <small>· <bdi dir="ltr" data-no-i18n>{dmyhm(doc["starts_on"])}</bdi></small></>, who: personLabel(doc["owner"], ar) || undefined };
    case "Comment": {
      const t = s(doc["comment_type"]); if (Number(doc["custom_on_activity"])) return null;
      return { ...base, kind: t === "Comment" ? "note" : "system", title: t === "Comment" ? tx(ar, "Comment", "تعليق") : t === "Attachment" ? tx(ar, "Attachment added", "أُضيف مرفق") : t === "Assigned" ? tx(ar, "Assigned", "إسناد") : tx(ar, "Record note", "ملاحظة النظام"), body: <p className="whitespace-pre-line" data-no-i18n>{strip(doc["content"])}</p>, who: personLabel(doc["comment_email"] || doc["owner"], ar) || undefined };
    }
    default: return null;
  }
}
export function timelineOf(dt: "CRM Lead" | "CRM Deal", name: string, user: string, ar: boolean, now = new Date()): { items: TlItem[]; now: TlItem[] } {
  const d = adapter.get(dt, name); if (!d) return { items: [], now: [] };
  const fromLead = dt === "CRM Deal" && s(d["lead"]) ? s(d["lead"]) : "";
  const rows = [...crmActivityRows(dt, name, user).map((r) => ({ ...r, lead: false })), ...(fromLead && Number(d["custom_lead_activities"] ?? 1) ? crmActivityRows("CRM Lead", fromLead, user).map((r) => ({ ...r, lead: true })) : [])];
  const items: TlItem[] = [];
  for (const r of rows) { if (r.doc.doctype === "Email Queue") continue; const it = itemOf(r.doc, r.when, ar, now, r.lead); if (it) items.push(it); }
  for (const c of changeLog(dt, name)) {
    const ch = c.changes.filter((x) => !SKIP_FIELDS.has(x.field)); if (!ch.length) continue;
    const first = fieldLabel(ch[0]!.field, ar, ch[0]!.label);
    items.push({ id: `chg::${c.key}`, kind: "change", at: c.at, who: personLabel(c.who, ar) || c.who, title: ch.length > 1 ? tx(ar, `Changed ${first} and ${ch.length - 1} more field${ch.length > 2 ? "s" : ""}`, `غيّر ${first} و${ch.length - 1} ${ch.length - 1 <= 10 ? "حقول" : "حقلًا"} أخرى`) : tx(ar, `Changed ${first}`, `غيّر ${first}`),
      changes: ch.map((x) => ({ label: fieldLabel(x.field, ar, x.label), from: x.from, to: x.to })) });
  }
  const lbl = dt === "CRM Lead" ? stLabel : stageLabelOf;
  for (const [i, r] of ((d["status_change_log"] as Doc[] | undefined) ?? []).entries()) if (r["to"] && r["to_date"]) items.push({ id: `stage::${i}`, kind: "change", at: s(r["to_date"]), who: personLabel(r["log_owner"], ar) || undefined, title: <>{dt === "CRM Lead" ? tx(ar, "Status", "الحالة") : tx(ar, "Stage", "المرحلة")}: <s data-no-i18n>{lbl(s(r["from"]), ar)}</s> <span aria-hidden className="inline-block rtl:-scale-x-100">→</span> <b data-no-i18n>{lbl(s(r["to"]), ar)}</b></> });
  if (fromLead) items.push({ id: "sys::converted", kind: "system", at: s(d["creation"]), title: <>{tx(ar, "Converted from the lead", "تحويل من العميل المحتمل")} <Link to="/digit-crm/leads/$leadId" params={{ leadId: fromLead }} className="text-primary hover:underline" data-no-i18n>{s(adapter.get("CRM Lead", fromLead)?.["lead_name"]) || fromLead}</Link></> });
  else items.push({ id: "sys::created", kind: "system", at: s(d["creation"]), title: dt === "CRM Lead" ? <>{tx(ar, "Lead created", "أُنشئ العميل المحتمل")}{d["source"] ? <> · {srcLabel(s(d["source"]), ar)}</> : null}</> : tx(ar, "Deal created", "أُنشئت الصفقة"), who: personLabel(d["owner"], ar) || undefined });
  items.sort((a, b) => (Date.parse(s(b.at).replace(" ", "T")) || 0) - (Date.parse(s(a.at).replace(" ", "T")) || 0));
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const nowItems = items.filter((i) => (i.kind === "task" && (i.tone === "bad" || i.tone === "warn")) || (i.kind === "meeting" && s(adapter.get("Event", i.id.split("::")[1]!)?.["starts_on"]).slice(0, 10) === today));
  return { items, now: nowItems };
}
export function ActivityPanel({ dt, name, user, ar, mode, setMode, focusKey, emailTo, phoneTo, firstName, locked }: {
  dt: "CRM Lead" | "CRM Deal"; name: string; user: string; ar: boolean; mode: ComposerMode; setMode: (m: ComposerMode) => void; focusKey: number; emailTo: string; phoneTo: string; firstName: string; locked?: string | undefined;
}) {
  const { items, now } = timelineOf(dt, name, user, ar);
  const split = (id: string) => { const [a, b] = id.split("::"); return [a!, b!] as const; };
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3" data-crm-activity={dt}>
    <Composer ar={ar} mode={mode} onMode={setMode} focusKey={focusKey} emailTo={emailTo} phoneTo={phoneTo} disabled={locked}
      outcomes={CALL_OUTCOMES.map(([k, a]) => ({ value: k, label: ar ? a : k }))}
      templates={WA_TEMPLATES.map((t) => ({ key: t.key, label: ar ? t.ar : t.en, body: t.body[ar ? 1 : 0].replace("{name}", firstName) }))}
      onSubmit={(md, p) => { const e = logActivity(dt, name, md, p, user); if (e) return m(e, ar); toast.success(md === "email" || md === "whatsapp" ? tx(ar, "Recorded on the timeline (sandbox — not sent)", "سُجّلت في السجل (تجريبي — لم تُرسل)") : tx(ar, "Saved to the timeline", "حُفظ في السجل")); return null; }} />
    <Timeline items={items} now={now} ar={ar} when={(at) => ago(at, ar)}
      onComment={(id, text) => { const [a, b] = split(id); if (a === "chg" || a === "stage" || a === "sys") return; const e = commentOn(a, b, text, user); if (e) toast.error(m(e, ar)); }}
      onPin={(id, on) => { const [a, b] = split(id); if (a === "chg" || a === "stage" || a === "sys") { toast.message(tx(ar, "Only activities can be pinned", "يُثبّت النشاط فقط")); return; } const e = pinActivity(a, b, on); if (e) toast.error(m(e, ar)); }} />
  </div>;
}

/* ------------------------------------------------------------------ next step (C-06 / D-08) ------------------------------------------------------------------ */
const localInput = (v: unknown) => { const d = parse(v) ?? new Date(Date.now() + 864e5); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export function NextStepCard({ dt, name, user, ar, open, locked }: { dt: "CRM Lead" | "CRM Deal"; name: string; user: string; ar: boolean; open: boolean; locked?: boolean | undefined }) {
  const d = adapter.get(dt, name);
  const t = dt === "CRM Lead" ? nextStepOf(name) : d ? dealFocus(d).next : undefined;
  const [edit, setEdit] = useState(false); const [title, setTitle] = useState(""); const [due, setDue] = useState(""); const [err, setErr] = useState<string | null>(null);
  const start = () => { setTitle(s(t?.["title"])); setDue(localInput(t?.["due_date"])); setErr(null); setEdit(true); };
  const save = () => { const e = setNextStep(dt, name, { title, due }, user); if (e) { setErr(m(e, ar)); return; } setEdit(false); toast.success(tx(ar, "Next step saved", "حُفظت الخطوة التالية")); };
  const dueT = t ? dueText(t["due_date"], ar) : null;
  const missing = open && !t;
  return <SideCard id="next-step" title={tx(ar, "Next step", "الخطوة التالية")} icon="➜" hue={missing || dueT?.tone === "bad" ? "rose" : "emerald"} tone={missing ? "bad" : dueT?.tone === "bad" ? "bad" : dueT?.tone === "warn" ? "warn" : undefined}
    action={!edit && !locked && open ? <button type="button" className="ek-rl-link" onClick={start} data-next-edit>{t ? tx(ar, "Edit", "تعديل") : tx(ar, "Set", "تحديد")}</button> : undefined}>
    {edit ? <div className="grid gap-2" data-next-form>
      <input className="field-input min-h-9 text-sm" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tx(ar, "e.g. Send the technical offer", "مثال: إرسال العرض الفني")} aria-label={tx(ar, "Next step", "الخطوة التالية")} data-next-title />
      <input className="field-input min-h-9 text-sm" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label={tx(ar, "Due", "الاستحقاق")} data-next-due />
      {err && <p className="ek-ff-err" role="alert">{err}</p>}
      <div className="flex gap-2"><button type="button" className="btn-primary" onClick={save} data-next-save>{tx(ar, "Save", "حفظ")}</button><button type="button" className="btn-ghost" onClick={() => setEdit(false)}>{tx(ar, "Cancel", "إلغاء")}</button></div>
    </div> : t ? <div data-next-step={t.name}>
      <p className="font-medium" data-no-i18n>{s(t["title"])}</p>
      <p className={`text-xs ${dueT?.tone === "bad" ? "text-[var(--negative)] font-semibold" : dueT?.tone === "warn" ? "text-[var(--warning)] font-semibold" : "text-muted-foreground"}`} data-next-tone={dueT?.tone ?? "ok"}><bdi data-no-i18n>{dueT?.text}</bdi> · <bdi data-no-i18n>{personLabel(t["assigned_to"], ar)}</bdi></p>
      {!locked && <button type="button" className="ek-rl-link mt-1" onClick={() => { const e = completeStep(t.name, user); if (e) toast.error(m(e, ar)); else toast.success(tx(ar, "Marked done — set the following step", "تمّت — حدّد الخطوة التي تليها")); }} data-next-done>{tx(ar, "Mark done", "تمّت")}</button>}
    </div> : <p className={open ? "text-sm font-semibold text-[var(--negative)]" : "text-sm text-muted-foreground"} data-next-missing>{open ? tx(ar, "No next step — required while the record is open.", "لا توجد خطوة تالية — مطلوبة ما دام السجل مفتوحًا.") : tx(ar, "Closed record — no next step needed.", "سجل مغلق — لا حاجة لخطوة تالية.")}</p>}
  </SideCard>;
}

/* ------------------------------------------------------------------ quick views (A-07 / D-10) ------------------------------------------------------------------ */
function LastThree({ dt, name, user, ar }: { dt: "CRM Lead" | "CRM Deal"; name: string; user: string; ar: boolean }) {
  const xs = timelineOf(dt, name, user, ar).items.filter((i) => i.kind !== "change" && i.kind !== "system").slice(0, 3);
  return <section className="mt-3" data-qv-last={xs.length}><h3 className="mb-1 text-xs font-semibold text-muted-foreground">{tx(ar, "Last activities", "آخر الأنشطة")}</h3>
    {xs.length ? <ul className="grid gap-1.5 text-sm">{xs.map((i) => <li key={i.id} className="rounded-md border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1.5"><div className="truncate">{i.title}</div><small className="text-muted-foreground"><bdi data-no-i18n>{ago(i.at, ar)}</bdi>{i.who ? <> · <bdi data-no-i18n>{i.who}</bdi></> : null}</small></li>)}</ul> : <p className="text-sm text-muted-foreground">{tx(ar, "No activity yet.", "لا يوجد نشاط بعد.")}</p>}
  </section>;
}
const Fact = ({ k, v }: { k: ReactNode; v: ReactNode }) => <div className="ent-qv-fig"><span>{k}</span><b>{v}</b></div>;
/** Side-panel footer standard (owner notes A-03): فتح كامل ↗ · طباعة · نسخ الرابط. */
function QvFoot({ ar, close, full, dt, name, path }: { ar: boolean; close: () => void; full: ReactNode; dt: string; name: string; path: string }) {
  return <footer className="ent-qv-foot">{full}
    <Link to="/printview" search={{ doctype: dt, name } as never} className="btn-ghost" onClick={close} data-qv-print>{tx(ar, "Print", "طباعة")}</Link>
    <button type="button" className="btn-ghost" onClick={() => { void navigator.clipboard?.writeText(`${location.origin}${path}`); }} data-qv-copy>{tx(ar, "Copy link", "نسخ الرابط")}</button></footer>;
}
export function LeadQuickView({ d, ar, head, close }: DrawerBodyProps) {
  const user = useSessionUser(); const r = leadRowOf(d);
  return <>{head(<bdi data-no-i18n>{r.title}</bdi>, <>{tx(ar, "Lead", "عميل محتمل")} · <bdi data-no-i18n>{r.company || d.name}</bdi></>,
    <><StatusPill k={r.stage} ar={ar} />{r.value ? <b className="ent-qv-amount" data-no-i18n>{sar(r.value)}</b> : null}</>)}
    <div className="ent-qv-body" data-qv-lead={d.name}>
      <div className="flex flex-wrap items-center gap-2"><StatusPill k={r.stage} ar={ar} /><LeadScore r={r} ar={ar} /><LeadSlaChip sla={r.sla} ar={ar} /></div>
      <div className="ent-qv-figs">
        <Fact k={tx(ar, "Owner", "المالك")} v={<OwnerTag user={r.owner} ar={ar} />} /><Fact k={tx(ar, "Source", "المصدر")} v={srcLabel(r.source, ar)} />
        <Fact k={tx(ar, "Mobile", "الجوال")} v={<bdi dir="ltr" data-no-i18n>{r.phone || "—"}</bdi>} /><Fact k={tx(ar, "Email", "البريد")} v={<bdi dir="ltr" className="break-all" data-no-i18n>{r.email || "—"}</bdi>} />
        <Fact k={tx(ar, "City", "المدينة")} v={<bdi data-no-i18n>{r.city || "—"}</bdi>} /><Fact k={tx(ar, "Estimated value", "القيمة التقديرية")} v={<bdi dir="ltr" data-no-i18n>{r.value ? sar(r.value) : "—"}</bdi>} />
      </div>
      <div className="mt-3"><NextStepCard dt="CRM Lead" name={d.name} user={user} ar={ar} open={r.open} locked={!!Number(d["converted"])} /></div>
      <LastThree dt="CRM Lead" name={d.name} user={user} ar={ar} />
    </div>
    <QvFoot ar={ar} close={close} full={<Link to="/digit-crm/leads/$leadId" params={{ leadId: d.name }} className="btn-primary" onClick={close} data-qv-open-full>{tx(ar, "Open full ↗", "فتح كامل ↗")}</Link>} dt="CRM Lead" name={d.name} path={`/digit-crm/leads/${encodeURIComponent(d.name)}`} />
  </>;
}
export function DealQuickView({ d, ar, head, close }: DrawerBodyProps) {
  const user = useSessionUser(); const sm = dealSummary(d);
  return <>{head(<bdi data-no-i18n>{dealTitle(d)}</bdi>, <>{tx(ar, "Deal", "صفقة")} · <bdi data-no-i18n>{d.name}</bdi></>,
    <><Pill tone={sm.type === "Won" ? "ok" : sm.type === "Lost" ? "bad" : "info"}>{stageLabelOf(s(d["status"]), ar)}</Pill><b className="ent-qv-amount" data-no-i18n>{sar(sm.value)}</b></>)}
    <div className="ent-qv-body" data-qv-deal={d.name}>
      <div className="flex flex-wrap items-center gap-2"><Pill tone={sm.type === "Won" ? "ok" : sm.type === "Lost" ? "bad" : "info"}>{stageLabelOf(s(d["status"]), ar)}</Pill><Pill tone="neutral">{ar ? FORECAST_AR[sm.forecast] : FORECAST_EN[sm.forecast]}</Pill>{dealStatusType(d["status"]) === "Lost" && d["lost_reason"] ? <Pill tone="bad"><bdi data-no-i18n>{s(d["lost_reason"])}</bdi></Pill> : null}</div>
      <div className="ent-qv-figs">
        <Fact k={tx(ar, "Value", "القيمة")} v={<bdi dir="ltr" data-no-i18n>{sar(sm.value)}</bdi>} /><Fact k={tx(ar, "Probability", "الاحتمالية")} v={<bdi dir="ltr" data-no-i18n>{sm.prob}%</bdi>} />
        <Fact k={tx(ar, "Weighted", "المرجّحة")} v={<bdi dir="ltr" data-no-i18n>{sar(sm.weighted)}</bdi>} /><Fact k={tx(ar, "Expected close", "الإغلاق المتوقع")} v={<bdi dir="ltr" className={sm.closeLate ? "text-[var(--negative)]" : ""} data-no-i18n data-qv-late={sm.closeLate || undefined}>{sm.close ? dmy(sm.close) : "—"}</bdi>} />
        <Fact k={tx(ar, "Owner", "المالك")} v={<OwnerTag user={s(d["deal_owner"])} ar={ar} />} /><Fact k={tx(ar, "Company", "الشركة")} v={<bdi data-no-i18n>{s(d["organization"]) || "—"}</bdi>} />
      </div>
      <div className="mt-3"><NextStepCard dt="CRM Deal" name={d.name} user={user} ar={ar} open={sm.open} /></div>
      <LastThree dt="CRM Deal" name={d.name} user={user} ar={ar} />
    </div>
    <QvFoot ar={ar} close={close} full={<Link to="/digit-crm/deals/$dealId" params={{ dealId: d.name }} className="btn-primary" onClick={close} data-qv-open-full>{tx(ar, "Open full ↗", "فتح كامل ↗")}</Link>} dt="CRM Deal" name={d.name} path={`/digit-crm/deals/${encodeURIComponent(d.name)}`} />
  </>;
}
registerDrawerBody("CRM Lead", LeadQuickView);
registerDrawerBody("CRM Deal", DealQuickView);
