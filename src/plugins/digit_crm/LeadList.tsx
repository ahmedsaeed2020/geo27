/**
 * DIGIT CRM C4 lead list (/digit-crm/leads, A-01 … A-10) on the Enterprise RecordList: table / kanban by status / grouped
 * view, saved views, quick-filter chips, advanced filters, status strip, columns, row actions, quick view, bulk bar and
 * footer totals. Rows come from leadDesk.leadRows (scoped to the reader), so the strip, the totals and every view read the
 * same records. Writes only through leadDesk.
 */
import { useNavigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLang } from "@/i18n";
import { adapter } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { capabilityQuery } from "@/lib/capabilities";
import { deleteDocuments } from "@/lib/deleteDoc";
import { hasPerm } from "@/lib/session";
import { plainMoney } from "@/lib/format";
import { EntDialog } from "@/components/enterprise/Surfaces";
import { peekRow } from "@/components/enterprise/QuickView";
import { RecordList, SplitButton, type RlBulk, type RlChip, type RlColumn, type RlField, type RlRowAction, type RlView } from "@/components/enterprise/kit/RecordList";
import { Avatar, Pill } from "@/components/enterprise/kit/RecordFrame";
import { Composer, type ComposerMode } from "@/components/enterprise/kit/RecordTimeline";
import type { StageCard } from "@/components/enterprise/kit/StageBoard";
import { CrmFrame } from "./CrmApp";
import { crmUsers, isManager, userLabel } from "./wf01";
import { crmRules } from "./salesDesk";
import { leadRules } from "./leadRules";
import {
  bulkCampaign, bulkOwner, bulkSend, bulkStatus, CALL_OUTCOMES, LEAD_STATUS_AR, LEAD_STATUS_HUE, LEAD_STATUS_ORDER, leadRows, leadsCsv, leadStrip, leadViewTest, logActivity, mergeLeads,
  setLeadStatus, WA_TEMPLATES, type LeadRow, type Msg,
} from "./leadDesk";
import { ago, CITIES, dueText, indLabel, INDUSTRIES, LeadScore, LeadSlaChip, m, OwnerTag, sar, SOURCES, srcLabel, StatusPill, stLabel, tx, personLabel } from "./CrmRecordParts";
import { LeadCreateDrawer, type CreateMode } from "./LeadCreate";
import { UNQUALIFIED_AR } from "./leadRules";
import { leadCard } from "./leadCard";

const s = (v: unknown) => String(v ?? "");
const HUE_VAR: Record<string, string> = { blue: "var(--blue)", amber: "var(--amber)", violet: "var(--violet)", emerald: "var(--emerald)", teal: "var(--teal)", rose: "var(--rose)", grey: "var(--grey)" };
const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function ageBucket(v: string, now = Date.now()) { const t = Date.parse(v); if (!Number.isFinite(t)) return "none"; const d = (now - t) / 864e5; return localDay(new Date(t)) === localDay(new Date(now)) ? "today" : d <= 3 ? "3d" : d <= 7 ? "7d" : d <= 30 ? "30d" : "older"; }
const AGE_OPTS = (ar: boolean, none: string) => [["today", tx(ar, "Today", "اليوم")], ["3d", tx(ar, "Last 3 days", "آخر 3 أيام")], ["7d", tx(ar, "Last 7 days", "آخر 7 أيام")], ["30d", tx(ar, "Last 30 days", "آخر 30 يومًا")], ["older", tx(ar, "Older", "أقدم")], ["none", none]].map(([value, label]) => ({ value: value!, label: label! }));
const reportBulk = (r: { done: string[]; refused: { name: string; error: Msg }[] }, ar: boolean, what: string) => {
  if (r.refused.length) toast.error(tx(ar, `${r.done.length} ${what}, ${r.refused.length} refused`, `تم ${r.done.length} ورُفض ${r.refused.length}`), { description: r.refused.slice(0, 3).map((x) => `${x.name}: ${m(x.error, ar)}`).join(" · ") });
  else toast.success(tx(ar, `${r.done.length} ${what}`, `تم تنفيذ ${r.done.length}`));
};

export function LeadListPage() {
  const ar = useLang() === "ar";
  return <CrmFrame title={tx(ar, "Leads", "العملاء المحتملون")} subtitle={tx(ar, "Saved views, quick filters, status strip, score and first-response time — click a row for the quick view, Ctrl-click for the full record.", "عروض محفوظة وفلاتر سريعة وشريط الحالات والدرجة ومهلة أول رد — انقر الصف للعرض السريع، وCtrl+نقرة للسجل الكامل.")}>{(user) => <LeadListBody user={user} ar={ar} />}</CrmFrame>;
}

type Dlg = null | { kind: "log"; row: LeadRow; mode: ComposerMode } | { kind: "owner" | "status" | "campaign" | "send" | "merge" | "delete"; keys: string[] };
function LeadListBody({ user, ar }: { user: string; ar: boolean }) {
  const nav = useNavigate();
  const rows = leadRows(user);
  const [create, setCreate] = useState<null | CreateMode>(null);
  const [dlg, setDlg] = useState<Dlg>(null);
  const reg = useQuery(capabilityQuery);
  const mgr = isManager(user), idle = crmRules().inactivityDays, rules = leadRules();
  const meta = cachedMeta("CRM Lead"); const canDelete = !!meta && hasPerm(meta, "delete", undefined, user);
  const byName = useMemo(() => new Map(rows.map((r) => [r.name, r])), [rows]);
  const live = (r: LeadRow) => !Number(r.l["custom_archived"]);
  const views: RlView<LeadRow>[] = [
    { key: "all", label: tx(ar, "All leads", "كل العملاء المحتملين"), test: live },
    { key: "mine", label: tx(ar, "My leads", "عملائي"), test: (r) => live(r) && leadViewTest("mine", user)(r) },
    { key: "unowned", label: tx(ar, "No owner", "بدون مالك"), test: (r) => live(r) && leadViewTest("unowned", user)(r) },
    { key: "today", label: tx(ar, "New today", "جديد اليوم"), test: (r) => live(r) && leadViewTest("today", user)(r) },
    { key: "stale", label: tx(ar, `No follow-up for ${idle} days`, `بلا متابعة منذ ${idle} أيام`), test: (r) => live(r) && leadViewTest("stale", user)(r) },
    { key: "hot", label: tx(ar, "Hot", "ساخن"), test: (r) => live(r) && leadViewTest("hot", user)(r) },
    { key: "archived", label: tx(ar, "Archived", "المؤرشفة"), test: (r) => !live(r) },
  ];
  const owners = [...new Set(rows.map((r) => r.owner))].map((o) => ({ value: o, label: o ? personLabel(o, ar) || o : tx(ar, "No owner", "بدون مالك") }));
  const srcOpts = [...new Set([...SOURCES, ...rows.map((r) => r.source).filter(Boolean)])].map((x) => ({ value: x, label: srcLabel(x, ar) }));
  const cityOpts = [...new Set([...rows.map((r) => r.city).filter(Boolean), ...CITIES])].map((x) => ({ value: x, label: x }));
  const indOpts = [...new Set([...INDUSTRIES, ...rows.map((r) => r.industry).filter(Boolean)])].map((x) => ({ value: x, label: indLabel(x, ar) }));
  const stOpts = LEAD_STATUS_ORDER.map((k) => ({ value: k, label: stLabel(k, ar) }));
  const slaOpts = [["ok", tx(ar, "On time", "في الوقت")], ["risk", tx(ar, "At risk", "معرّض للتأخر")], ["breached", tx(ar, "Breached", "متجاوز")], ["met", tx(ar, "Met", "تم الرد")], ["na", tx(ar, "No SLA", "لا ينطبق")]].map(([value, label]) => ({ value: value!, label: label! }));
  const campOpts = [...new Set(rows.map((r) => r.campaign))].map((c) => ({ value: c, label: c || tx(ar, "No campaign", "بدون حملة") }));
  const chips: RlChip<LeadRow>[] = [
    { key: "owner", label: tx(ar, "Owner", "المالك"), get: (r) => r.owner, options: owners },
    { key: "status", label: tx(ar, "Status", "الحالة"), get: (r) => r.stage, options: stOpts },
    { key: "source", label: tx(ar, "Source", "المصدر"), get: (r) => r.source, options: srcOpts },
    { key: "city", label: tx(ar, "City / region", "المدينة/المنطقة"), get: (r) => r.city, options: cityOpts },
    { key: "industry", label: tx(ar, "Industry", "القطاع"), get: (r) => r.industry, options: indOpts },
    { key: "created", label: tx(ar, "Created", "تاريخ الإنشاء"), get: (r) => ageBucket(r.created), options: AGE_OPTS(ar, tx(ar, "No date", "بلا تاريخ")) },
    { key: "last", label: tx(ar, "Last activity", "آخر نشاط"), get: (r) => ageBucket(r.lastAt), options: AGE_OPTS(ar, tx(ar, "No activity", "بلا نشاط")) },
    { key: "band", label: tx(ar, "Score band", "فئة الدرجة"), get: (r) => r.band, options: [["Hot", tx(ar, "Hot", "ساخن")], ["Warm", tx(ar, "Warm", "دافئ")], ["Cold", tx(ar, "Cold", "بارد")]].map(([value, label]) => ({ value: value!, label: label! })), more: true },
    { key: "sla", label: tx(ar, "First response", "مهلة أول رد"), get: (r) => r.sla.state, options: slaOpts, more: true },
    { key: "campaign", label: tx(ar, "Campaign", "الحملة"), get: (r) => r.campaign, options: campOpts, more: true },
  ];
  const fields: RlField<LeadRow>[] = [
    { key: "title", label: tx(ar, "Name", "الاسم"), type: "text", get: (r) => r.title }, { key: "company", label: tx(ar, "Company", "الشركة"), type: "text", get: (r) => r.company },
    { key: "status", label: tx(ar, "Status", "الحالة"), type: "select", get: (r) => r.stage, options: stOpts }, { key: "source", label: tx(ar, "Source", "المصدر"), type: "select", get: (r) => r.source, options: srcOpts },
    { key: "owner", label: tx(ar, "Owner", "المالك"), type: "select", get: (r) => r.owner, options: owners }, { key: "city", label: tx(ar, "City / region", "المدينة/المنطقة"), type: "select", get: (r) => r.city, options: cityOpts },
    { key: "industry", label: tx(ar, "Industry", "القطاع"), type: "select", get: (r) => r.industry, options: indOpts }, { key: "score", label: tx(ar, "Score", "الدرجة"), type: "number", get: (r) => r.score },
    { key: "value", label: tx(ar, "Estimated value", "القيمة التقديرية"), type: "number", get: (r) => r.value }, { key: "created", label: tx(ar, "Created on", "تاريخ الإنشاء"), type: "date", get: (r) => r.created.slice(0, 10) },
    { key: "last", label: tx(ar, "Last activity on", "تاريخ آخر نشاط"), type: "date", get: (r) => r.lastAt.slice(0, 10) }, { key: "sla", label: tx(ar, "First response", "مهلة أول رد"), type: "select", get: (r) => r.sla.state, options: slaOpts },
    { key: "campaign", label: tx(ar, "Campaign", "الحملة"), type: "text", get: (r) => r.campaign }, { key: "mobile", label: tx(ar, "Mobile", "الجوال"), type: "text", get: (r) => r.phone }, { key: "email", label: tx(ar, "Email", "البريد"), type: "text", get: (r) => r.email },
  ];
  const columns: RlColumn<LeadRow>[] = [
    { key: "name", label: tx(ar, "Name", "الاسم"), fixed: true, minWidth: 200, sortValue: (r) => r.title, filterValue: (r) => `${r.title} ${r.name}`,
      render: (r) => <span className="ek-rl-name"><Avatar name={r.title} size={28} hue={LEAD_STATUS_HUE[r.stage] === "grey" ? "grey" : undefined} /><span className="min-w-0"><Link to="/digit-crm/leads/$leadId" params={{ leadId: r.name }} className="block truncate font-semibold text-primary hover:underline" data-no-i18n data-lead-link={r.name}>{r.title}</Link><small className="ek-rl-sub" data-no-i18n>{r.name}</small></span></span> },
    { key: "company", label: tx(ar, "Company", "الشركة"), minWidth: 150, sortValue: (r) => r.company, filterValue: (r) => r.company, render: (r) => <bdi className="block max-w-[14rem] truncate" data-no-i18n>{r.company || "—"}</bdi> },
    { key: "status", label: tx(ar, "Status", "الحالة"), sortValue: (r) => LEAD_STATUS_ORDER.indexOf(r.stage), filterValue: (r) => r.stage, filterOptions: stOpts, render: (r) => <StatusPill k={r.stage} ar={ar} /> },
    { key: "score", label: tx(ar, "Score", "الدرجة"), sortValue: (r) => r.score, render: (r) => <LeadScore r={r} ar={ar} /> },
    { key: "source", label: tx(ar, "Source", "المصدر"), sortValue: (r) => r.source, filterValue: (r) => r.source, filterOptions: srcOpts, render: (r) => <span>{srcLabel(r.source, ar)}</span> },
    { key: "owner", label: tx(ar, "Owner", "المالك"), sortValue: (r) => personLabel(r.owner, ar), filterValue: (r) => r.owner, filterOptions: owners, render: (r) => <OwnerTag user={r.owner} ar={ar} /> },
    { key: "next", label: tx(ar, "Next step", "الخطوة التالية"), minWidth: 170, sortValue: (r) => r.nextDue || "9999", render: (r) => { if (!r.next) return r.open ? <span className="text-xs font-semibold text-[var(--negative)]" data-next="none">{tx(ar, "No next step", "لا توجد خطوة تالية")}</span> : <span className="ek-rl-sub">—</span>; const d = dueText(r.nextDue, ar); return <span className="block min-w-0" data-next-tone={d.tone ?? "ok"}><span className="block truncate" data-no-i18n>{s(r.next["title"])}</span><small className={d.tone === "bad" ? "font-semibold text-[var(--negative)]" : d.tone === "warn" ? "font-semibold text-[var(--warning)]" : "ek-rl-sub"} data-no-i18n>{d.text}</small></span>; } },
    { key: "last", label: tx(ar, "Last activity", "آخر نشاط"), sortValue: (r) => r.lastAt || "0", render: (r) => <span className="whitespace-nowrap text-xs" data-no-i18n>{r.lastAt ? ago(r.lastAt, ar) : tx(ar, "None yet", "لا يوجد")}</span> },
    { key: "sla", label: tx(ar, "First response", "مهلة أول رد"), sortValue: (r) => ["breached", "risk", "ok", "met", "na"].indexOf(r.sla.state), filterValue: (r) => r.sla.state, filterOptions: slaOpts, render: (r) => <LeadSlaChip sla={r.sla} ar={ar} /> },
    { key: "phone", label: tx(ar, "Mobile", "الجوال"), filterValue: (r) => r.phone, render: (r) => r.phone ? <button type="button" className="ek-rl-link whitespace-nowrap" dir="ltr" onClick={() => setDlg({ kind: "log", row: r, mode: "call" })} title={tx(ar, "Call (sandbox) and log it", "اتصال (تجريبي) وتسجيله")} data-click-call={r.name} data-no-i18n>☎ {r.phone}</button> : <span className="ek-rl-sub">—</span> },
    { key: "city", label: tx(ar, "City", "المدينة"), sortValue: (r) => r.city, filterValue: (r) => r.city, filterOptions: cityOpts, render: (r) => <bdi data-no-i18n>{r.city || "—"}</bdi> },
    { key: "value", label: tx(ar, "Estimated value", "القيمة التقديرية"), align: "end", sortValue: (r) => r.value, amount: (r) => r.value, amountText: (n) => sar(n), render: (r) => <bdi dir="ltr" className="whitespace-nowrap tabular-nums" data-no-i18n>{r.value ? sar(r.value) : "—"}</bdi> },
    { key: "email", label: tx(ar, "Email", "البريد"), defaultHidden: true, filterValue: (r) => r.email, render: (r) => <bdi dir="ltr" className="text-xs" data-no-i18n>{r.email || "—"}</bdi> },
    { key: "industry", label: tx(ar, "Industry", "القطاع"), defaultHidden: true, sortValue: (r) => r.industry, filterValue: (r) => r.industry, filterOptions: indOpts, render: (r) => <span>{indLabel(r.industry, ar)}</span> },
    { key: "campaign", label: tx(ar, "Campaign", "الحملة"), defaultHidden: true, filterValue: (r) => r.campaign, render: (r) => <bdi data-no-i18n>{r.campaign || "—"}</bdi> },
    { key: "created", label: tx(ar, "Created", "تاريخ الإنشاء"), defaultHidden: true, sortValue: (r) => r.created, render: (r) => <span className="text-xs" data-no-i18n>{ago(r.created, ar)}</span> },
  ];
  const act = (mode: ComposerMode): RlRowAction<LeadRow>["run"] => (r) => setDlg({ kind: "log", row: r, mode });
  const rowActions: RlRowAction<LeadRow>[] = [
    { key: "call", label: tx(ar, "Call", "اتصال"), icon: "☎", run: act("call"), hidden: (r) => !!Number(r.l["converted"]) },
    { key: "email", label: tx(ar, "Email", "بريد"), icon: "✉", run: act("email"), hidden: (r) => !!Number(r.l["converted"]) },
    { key: "whatsapp", label: tx(ar, "WhatsApp", "واتساب"), icon: "◉", run: act("whatsapp"), hidden: (r) => !!Number(r.l["converted"]) },
    { key: "task", label: tx(ar, "Task", "مهمة"), icon: "☑", run: act("task"), hidden: (r) => !!Number(r.l["converted"]) },
    { key: "note", label: tx(ar, "Note", "ملاحظة"), icon: "✎", run: act("note"), hidden: (r) => !!Number(r.l["converted"]) },
  ];
  const bulk: RlBulk[] = [
    { key: "owner", label: tx(ar, "Change owner", "تغيير المالك"), blocked: mgr ? undefined : tx(ar, "Sales Manager only", "لمدير المبيعات فقط"), run: (keys) => setDlg({ kind: "owner", keys }) },
    { key: "status", label: tx(ar, "Change status", "تغيير الحالة"), run: (keys) => setDlg({ kind: "status", keys }) },
    { key: "campaign", label: tx(ar, "Add to campaign", "إضافة لحملة"), run: (keys) => setDlg({ kind: "campaign", keys }) },
    { key: "send", label: tx(ar, "Send (sandbox)", "إرسال (تجريبي)"), run: (keys) => setDlg({ kind: "send", keys }) },
    { key: "merge", label: tx(ar, "Merge", "دمج"), min: 2, max: 2, run: (keys) => setDlg({ kind: "merge", keys }) },
    { key: "export", label: tx(ar, "Export", "تصدير"), run: (keys) => { const csv = plainMoney(leadsCsv(keys.map((k) => byName.get(k)!).filter(Boolean), ar)); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); a.download = `leads-${localDay(new Date())}.csv`; a.click(); toast.success(tx(ar, `${keys.length} leads exported`, `صُدّر ${keys.length} عميلًا`)); } },
    { key: "delete", label: tx(ar, "Delete", "حذف"), tone: "bad", blocked: canDelete ? undefined : tx(ar, "No delete permission", "لا توجد صلاحية حذف"), run: (keys) => setDlg({ kind: "delete", keys }) },
  ];
  const card = (r: LeadRow): StageCard => leadCard(r, ar, rows.map((x) => x.name));
  return <>
    <RecordList<LeadRow> id="digit_crm:leads" doctype="CRM Lead" ar={ar} rows={rows} rowKey={(r) => r.name} views={views} chips={chips} fields={fields} columns={columns}
      title={<>{tx(ar, "Leads", "العملاء المحتملون")} <bdi className="ek-sc-n tabular-nums" data-no-i18n>{rows.length}</bdi></>}
      actions={<SplitButton ar={ar} label={<>+ {tx(ar, "New lead", "عميل محتمل جديد")}</>} onClick={() => setCreate("form")} attrs={{ "data-lead-new": "" }}
        items={[{ key: "import", label: tx(ar, "Import", "استيراد"), hint: tx(ar, "CSV / Excel through Data Import", "ملف CSV / Excel عبر استيراد البيانات"), run: () => void nav({ to: "/app/data-import/new" }) },
          { key: "card", label: tx(ar, "Add from a business card", "إضافة من بطاقة عمل"), hint: tx(ar, "Paste the card text", "الصق نص البطاقة"), run: () => setCreate("card") },
          { key: "whatsapp", label: tx(ar, "Add from WhatsApp (sandbox)", "إضافة من واتساب (تجريبي)"), hint: tx(ar, "No live WhatsApp connection", "دون اتصال فعلي بواتساب"), run: () => setCreate("whatsapp") },
          { key: "classic", label: tx(ar, "Classic list", "القائمة الكلاسيكية"), hint: tx(ar, "The standard lead list with its own views", "قائمة العملاء المحتملين القياسية بعروضها"), run: () => void nav({ to: "/digit-crm/leads" }) }]} />}
      strip={{ tabs: (xs) => leadStrip(xs), of: (r) => r.stage }} search={(r) => `${r.title} ${r.company} ${r.phone} ${r.email} ${r.name}`}
      rowActions={rowActions} bulk={bulk} tone={(r) => (r.nextTone === "bad" ? "bad" : r.open && r.sla.state === "risk" ? "warn" : undefined)}
      kanban={{ columns: LEAD_STATUS_ORDER.map((k) => ({ key: k, label: stLabel(k, ar), hue: HUE_VAR[LEAD_STATUS_HUE[k] ?? "grey"]! })), of: (r) => r.stage, card,
        onDrop: (key, _from, to) => { if (to === "Converted") return { moved: 0, refused: [], note: tx(ar, "Open the lead and use «Convert» to create the deal.", "افتح العميل واستخدم «تحويل» لإنشاء الصفقة.") }; if (to === "Unqualified" || to === "Junk") { setDlg({ kind: "status", keys: [key] }); return { moved: 0, refused: [], note: tx(ar, "Pick the reason to finish the move.", "اختر السبب لإكمال النقل.") }; } const r = setLeadStatus(key, to, user); return r.ok ? { moved: 1, refused: [] } : { moved: 0, refused: [`${key} — ${m(r.error, ar)}`] }; } }}
      groups={[{ key: "source", label: tx(ar, "Source", "المصدر"), of: (r) => r.source, labelOf: (v) => srcLabel(v, ar) }, { key: "owner", label: tx(ar, "Owner", "المالك"), of: (r) => r.owner, labelOf: (v) => (v && v !== "—" ? personLabel(v, ar) || v : tx(ar, "No owner", "بدون مالك")) }, { key: "city", label: tx(ar, "City", "المدينة"), of: (r) => r.city }, { key: "status", label: tx(ar, "Status", "الحالة"), of: (r) => r.stage, labelOf: (v) => stLabel(v, ar) }]}
      onOpen={(r, keys, el) => peekRow("CRM Lead", r.name, keys, el)} onOpenFull={(r) => void nav({ to: "/digit-crm/leads/$leadId", params: { leadId: r.name } })}
      empty={{ title: tx(ar, "No leads yet", "لا يوجد عملاء محتملون بعد"), hint: tx(ar, "Add the first lead, import a file or add one from a business card.", "أضف أول عميل محتمل أو استورد ملفًا أو أضف من بطاقة عمل."), action: <button type="button" className="btn-primary" onClick={() => setCreate("form")} data-lead-empty-new>{tx(ar, "New lead", "عميل محتمل جديد")}</button> }} />
    <LeadCreateDrawer open={!!create} onOpenChange={(o) => { if (!o) setCreate(null); }} user={user} ar={ar} mode={create ?? "form"} />
    {dlg?.kind === "log" && <QuickLog row={dlg.row} mode={dlg.mode} user={user} ar={ar} onClose={() => setDlg(null)} />}
    {dlg && dlg.kind !== "log" && <BulkDialog kind={dlg.kind} keys={dlg.keys} rows={byName} user={user} ar={ar} rules={rules} onClose={() => setDlg(null)} onDelete={(keys) => {
      if (!meta || !reg.data) { toast.error(tx(ar, "Still loading the delete rules — try again", "قواعد الحذف قيد التحميل — أعد المحاولة")); return; }
      const r = deleteDocuments(meta, keys, reg.data, user); if (r.failed.length) toast.error(tx(ar, `${r.deleted.length} deleted, ${r.failed.length} refused`, `حُذف ${r.deleted.length} ورُفض ${r.failed.length}`), { description: r.failed.slice(0, 3).map((f) => `${f.name}: ${f.errors[0]}`).join(" · ") }); else toast.success(tx(ar, `${r.deleted.length} deleted`, `حُذف ${r.deleted.length}`)); setDlg(null); }} />}
  </>;
}

/** A-06: log a call / email / WhatsApp / task / note on a lead without leaving the list. */
function QuickLog({ row, mode, user, ar, onClose }: { row: LeadRow; mode: ComposerMode; user: string; ar: boolean; onClose: () => void }) {
  const [md, setMd] = useState<ComposerMode>(mode);
  return <EntDialog open onOpenChange={(o) => { if (!o) onClose(); }} size="lg" id="lead-quick-log" title={<bdi data-no-i18n>{row.title}</bdi>} kicker={tx(ar, "Logged on the lead's timeline", "يُسجّل في سجل نشاط العميل")}>
    <Composer ar={ar} mode={md} onMode={setMd} focusKey={1} emailTo={row.email} phoneTo={row.phone} outcomes={CALL_OUTCOMES.map(([k, a]) => ({ value: k, label: ar ? a : k }))}
      templates={WA_TEMPLATES.map((t) => ({ key: t.key, label: ar ? t.ar : t.en, body: t.body[ar ? 1 : 0].replace("{name}", s(row.l["first_name"]) || row.title) }))}
      onSubmit={(mm, p) => { const e = logActivity("CRM Lead", row.name, mm, p, user); if (e) return m(e, ar); toast.success(mm === "email" || mm === "whatsapp" ? tx(ar, "Recorded (sandbox — not sent)", "سُجّلت (تجريبي — لم تُرسل)") : tx(ar, "Saved to the lead's timeline", "حُفظ في سجل العميل")); onClose(); return null; }} />
  </EntDialog>;
}

export function BulkDialog({ kind, keys, rows, user, ar, rules, onClose, onDelete }: { kind: "owner" | "status" | "campaign" | "send" | "merge" | "delete"; keys: string[]; rows: Map<string, LeadRow>; user: string; ar: boolean; rules: ReturnType<typeof leadRules>; onClose: () => void; onDelete: (keys: string[]) => void }) {
  const [owner, setOwner] = useState(""); const [status, setStatus] = useState(""); const [reason, setReason] = useState(""); const [notes, setNotes] = useState("");
  const [camp, setCamp] = useState(""); const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp"); const [tpl, setTpl] = useState<string>(WA_TEMPLATES[0].key); const [keep, setKeep] = useState(keys[0] ?? "");
  const n = keys.length; const exit = status === "Unqualified" || status === "Junk";
  const title = { owner: tx(ar, "Change owner", "تغيير المالك"), status: tx(ar, "Change status", "تغيير الحالة"), campaign: tx(ar, "Add to a campaign", "إضافة لحملة"), send: tx(ar, "Send (sandbox)", "إرسال (تجريبي)"), merge: tx(ar, "Merge two leads", "دمج عميلين"), delete: tx(ar, "Delete leads", "حذف العملاء") }[kind];
  const run = () => {
    if (kind === "owner") { if (!owner) return toast.error(tx(ar, "Pick the owner", "اختر المالك")); reportBulk(bulkOwner(keys, owner, user), ar, tx(ar, "reassigned", "")); }
    else if (kind === "status") { if (!status) return toast.error(tx(ar, "Pick the status", "اختر الحالة")); if (exit && !reason) return toast.error(tx(ar, "Pick the reason", "اختر السبب")); reportBulk(bulkStatus(keys, status, user, exit ? { reason, notes } : undefined), ar, tx(ar, "moved", "")); }
    else if (kind === "campaign") { if (!camp) return toast.error(tx(ar, "Pick the campaign", "اختر الحملة")); reportBulk(bulkCampaign(keys, camp, user), ar, tx(ar, "added", "")); }
    else if (kind === "send") reportBulk(bulkSend(keys, channel, tpl, user, ar), ar, tx(ar, "recorded (sandbox)", ""));
    else if (kind === "merge") { const drop = keys.find((k) => k !== keep)!; const r = mergeLeads(keep, drop, user); if (!r.ok) return toast.error(m(r.error, ar)); toast.success(tx(ar, `Merged into ${keep}`, `دُمج في ${keep}`)); }
    else if (kind === "delete") return onDelete(keys);
    onClose();
  };
  const reasons = rules.unqualified;
  return <EntDialog open onOpenChange={(o) => { if (!o) onClose(); }} size="md" id={`lead-bulk-${kind}`} title={title} kicker={tx(ar, `${n} selected`, `تم تحديد ${n}`)} tone={kind === "delete" ? "warn" : undefined}
    footer={<div className="flex w-full justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>{tx(ar, "Cancel", "إلغاء")}</button><button type="button" className={kind === "delete" ? "btn-primary bg-[var(--negative)]" : "btn-primary"} onClick={run} data-bulk-run={kind}>{kind === "delete" ? tx(ar, "Delete", "حذف") : tx(ar, "Apply", "تطبيق")}</button></div>}>
    <div className="grid gap-3 text-sm" data-bulk-dialog={kind}>
      {kind === "owner" && <label className="grid gap-1">{tx(ar, "New owner", "المالك الجديد")}<select className="field-input min-h-9" value={owner} onChange={(e) => setOwner(e.target.value)} data-bulk-owner><option value="">—</option>{crmUsers().map((u) => <option key={u.name} value={u.name}>{personLabel(u.name, ar)}</option>)}</select></label>}
      {kind === "status" && <><label className="grid gap-1">{tx(ar, "New status", "الحالة الجديدة")}<select className="field-input min-h-9" value={status} onChange={(e) => setStatus(e.target.value)} data-bulk-status><option value="">—</option>{LEAD_STATUS_ORDER.filter((k) => k !== "Converted").map((k) => <option key={k} value={k}>{stLabel(k, ar)}</option>)}</select></label>
        {exit && <><label className="grid gap-1">{tx(ar, "Reason (required)", "السبب (مطلوب)")}<select className="field-input min-h-9" value={reason} onChange={(e) => setReason(e.target.value)} data-bulk-reason><option value="">—</option>{reasons.map((r) => <option key={r} value={r}>{ar ? UNQUALIFIED_AR[r] ?? r : r}</option>)}</select></label>
          <label className="grid gap-1">{tx(ar, "Notes", "ملاحظات")}<textarea className="field-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label></>}
        <p className="text-xs text-muted-foreground">{tx(ar, "Moving forward needs a next step on each lead; converted leads are skipped.", "التقدم في المسار يحتاج خطوة تالية لكل عميل؛ المحوّلون لا يتغيرون.")}</p></>}
      {kind === "campaign" && <label className="grid gap-1">{tx(ar, "Campaign", "الحملة")}<select className="field-input min-h-9" value={camp} onChange={(e) => setCamp(e.target.value)} data-bulk-campaign><option value="">—</option>{adapter.list("Campaign").map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</select></label>}
      {kind === "send" && <><div className="ek-seg" role="radiogroup">{(["whatsapp", "email"] as const).map((c) => <button key={c} type="button" role="radio" aria-checked={channel === c} onClick={() => setChannel(c)} data-bulk-channel={c}>{c === "whatsapp" ? tx(ar, "WhatsApp", "واتساب") : tx(ar, "Email", "البريد")}</button>)}</div>
        <label className="grid gap-1">{tx(ar, "Template", "القالب")}<select className="field-input min-h-9" value={tpl} onChange={(e) => setTpl(e.target.value)}>{WA_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{ar ? t.ar : t.en}</option>)}</select></label>
        <p className="rounded-md bg-[var(--info-bg)] p-2 text-xs">{tx(ar, "Sandbox: one message is recorded on each lead's timeline; nothing leaves the app. Leads without consent for the channel are skipped and listed.", "تجريبي: تُسجّل رسالة في سجل كل عميل ولا يخرج شيء من التطبيق. يُتخطّى من لا توجد موافقته على القناة مع ذكره.")}</p></>}
      {kind === "merge" && <><p>{tx(ar, "Keep one record; the other one's blanks, activities, attachments and deals move to it, then it is removed.", "احتفظ بسجل واحد؛ تنتقل إليه بيانات السجل الآخر الناقصة وأنشطته ومرفقاته وصفقاته، ثم يُحذف.")}</p>
        {keys.map((k) => { const r = rows.get(k); return <label key={k} className="flex items-center gap-2 rounded-md border border-[var(--line)] p-2" data-merge-keep={k}><input type="radio" name="merge-keep" checked={keep === k} onChange={() => setKeep(k)} /><span className="min-w-0 flex-1"><b data-no-i18n>{r?.title}</b> <small className="ek-rl-sub" data-no-i18n>{k} · {r?.company}</small></span>{r && <StatusPill k={r.stage} ar={ar} />}{keep === k && <Pill tone="ok">{tx(ar, "Keep", "يُحتفظ به")}</Pill>}</label>; })}</>}
      {kind === "delete" && <p>{tx(ar, `Delete ${n} lead(s)? Leads linked to deals or other documents are refused and listed.`, `حذف ${n} عميل؟ يُرفض حذف المرتبط بصفقات أو مستندات أخرى مع ذكره.`)}</p>}
    </div>
  </EntDialog>;
}
