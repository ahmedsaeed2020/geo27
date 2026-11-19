/**
 * DIGIT CRM C4 lead record (/digit-crm/leads/<name>, C-01 … C-08) on the Enterprise record frame: header (avatar, status,
 * score, owner, followers, convert, quick actions, ⋯), status path with days per status and the «غير مؤهل» exit, three
 * columns at desktop widths (field groups with inline edit · composer + timeline · side cards) that become tabs on phones,
 * and the convert dialog (company / contact new or existing, optional deal, idempotent). A converted lead is read-only
 * with links to what it became. Writes only through leadDesk.
 */
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { DateInput } from "@/components/form/DateInput";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { sampleNameAr, useLang } from "@/i18n";
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { capabilityQuery } from "@/lib/capabilities";
import { deleteDocument } from "@/lib/deleteDoc";
import { hasPerm } from "@/lib/session";
import { EntDialog } from "@/components/enterprise/Surfaces";
import { peekRow, QuickLink } from "@/components/enterprise/QuickView";
import { FieldGroups, NewOrExisting, Pill, RecordColumns, RecordHeader, SideCard, StatusPath, type PathStep, type RfGroup } from "@/components/enterprise/kit/RecordFrame";
import type { ComposerMode } from "@/components/enterprise/kit/RecordTimeline";
import { CrmFrame } from "./CrmApp";
import { crmUsers, isManager, scopedLeads, userLabel } from "./wf01";
import { dealStages } from "./wf02";
import { qualification } from "./wf05";
import { leadRules, PIPELINE_AR, UNQUALIFIED_AR } from "./leadRules";
import { leadTitle,
  attachFile, contactChoices, convertedOf, convertLead, dealsOfLead, filesOf, followersOf, leadDuplicates, leadRowOf, leadSummary, LEAD_PATH, linkedCompany, mergeLeads, nextPathStep,
  nextStepOf, orgChoices, setLeadOwner, setLeadStatus, stageDays, toggleFollow, updateLeadField, type LeadRow,
} from "./leadDesk";
import { setArchived } from "./dealDesk";
import { ActivityPanel, CITIES, dmy, fieldLabel, INDUSTRIES, indLabel, LeadScore, LeadSlaChip, m, NextStepCard, sar, SIZES, SOURCES, srcLabel, stageLabelOf, StatusPill, stLabel, tx, personLabel } from "./CrmRecordParts";
import { LeadCreateDrawer } from "./LeadCreate";

const s = (v: unknown) => String(v ?? "");
const HUE: Record<string, PathStep["hue"]> = { New: "blue", Contacted: "amber", Nurture: "violet", Qualified: "emerald", Converted: "teal" };

export function LeadRecordPage({ leadId }: { leadId: string }) {
  const ar = useLang() === "ar";
  return <CrmFrame title={tx(ar, "Lead", "عميل محتمل")} subtitle={leadId}>{(user) => <LeadBody leadId={leadId} user={user} ar={ar} />}</CrmFrame>;
}

function LeadBody({ leadId, user, ar }: { leadId: string; user: string; ar: boolean }) {
  const nav = useNavigate();
  const [mode, setMode] = useState<ComposerMode>("note"); const [focus, setFocus] = useState(0);
  const convertAsked = (useSearch({ strict: false }) as { convert?: string | undefined }).convert === "1";
  // owner notes C-05: a card dropped on «محوّل» on the qualification board lands here with the conversion dialog open
  const [dlg, setDlg] = useState<null | "convert" | "unqualify" | "merge" | "delete">(convertAsked ? "convert" : null);
  const [dup, setDup] = useState(false);
  const reg = useQuery(capabilityQuery);
  const d = scopedLeads(user).find((x) => x.name === leadId);
  if (!d) return <div className="ek-card ek-card-pad" data-dc-state="denied"><h2 className="ek-h3">{tx(ar, "Lead not found or not permitted", "العميل المحتمل غير موجود أو غير مسموح")}</h2><Link to="/digit-crm/leads" className="btn-primary mt-2 inline-flex">{tx(ar, "Back to the leads", "العودة إلى العملاء المحتملين")}</Link></div>;
  const r = leadRowOf(d), conv = convertedOf(d), locked = !!conv, rules = leadRules(), mgr = isManager(user);
  const st = adapter.get("CRM Lead Status", s(d["status"]));
  const lost = s(st?.["type"]) === "Lost";
  const days = stageDays(d), cur = LEAD_PATH.indexOf(r.stage as never);
  const followers = followersOf("CRM Lead", d.name), following = followers.includes(user);
  const meta = cachedMeta("CRM Lead"); const canDelete = !!meta && hasPerm(meta, "delete", d, user);
  const quick = (k: ComposerMode) => () => { setMode(k); setFocus((x) => x + 1); };
  const go = (to: string) => { if (to === "Converted") { setDlg("convert"); return; } const x = setLeadStatus(d.name, to, user); if (x.ok) toast.success(tx(ar, `Status: ${to}`, `الحالة: ${stLabel(to, true)}`)); else toast.error(m(x.error, ar)); };
  const next = nextPathStep(d);
  const steps: PathStep[] = LEAD_PATH.map((k, i) => ({ key: k, label: stLabel(k, ar), hue: HUE[k], state: lost ? "next" : i < cur ? "done" : i === cur ? "current" : "next", days: days[k] ?? (i === cur ? 0 : undefined) }));
  const save = (field: string, value: string) => {
    const x = updateLeadField(d.name, field, value, user); if (!x.ok) return m(x.error, ar);
    const before = x.before;
    toast.success(tx(ar, `${fieldLabel(field, false)} saved`, `حُفظ ${fieldLabel(field, true)}`), { action: { label: tx(ar, "Undo", "تراجع"), onClick: () => { const u = updateLeadField(d.name, field, s(before), user); if (!u.ok) toast.error(m(u.error, ar)); } } });
    return null;
  };
  const yes = (v: unknown) => (Number(v) ? "1" : "");
  const yesNo = (v: unknown) => (Number(v) ? tx(ar, "Yes", "نعم") : tx(ar, "No", "لا"));
  const opt = (xs: string[], lab?: (x: string) => string) => xs.map((x) => ({ value: x, label: lab ? lab(x) : x }));
  const F = (key: string, value: unknown, more: Partial<RfGroup["fields"][number]> = {}) => ({ key, label: fieldLabel(key, ar), value: s(value), ...more });
  const groups: RfGroup[] = [
    { key: "about", label: tx(ar, "About the customer", "عن العميل"), fields: [F("first_name", d["first_name"], { core: true, required: true }), F("last_name", d["last_name"], { core: true }), F("job_title", d["job_title"], { core: true }),
      F("lead_owner", d["lead_owner"], { readOnly: true, display: <bdi data-no-i18n>{personLabel(d["lead_owner"], ar) || "—"}</bdi> }), { key: "creation", label: tx(ar, "Created", "تاريخ الإنشاء"), value: s(d["creation"]), readOnly: true, display: <bdi dir="ltr" data-no-i18n>{dmy(d["creation"])}</bdi> }] },
    { key: "reach", label: tx(ar, "Contact", "التواصل"), fields: [F("mobile_no", d["mobile_no"], { core: true, type: "tel", display: <bdi dir="ltr" data-no-i18n>{s(d["mobile_no"])}</bdi> }), F("email", d["email"], { core: true, type: "email", display: <bdi dir="ltr" data-no-i18n>{s(d["email"])}</bdi> }),
      F("custom_consent_whatsapp", yes(d["custom_consent_whatsapp"]), { type: "select", options: [{ value: "1", label: tx(ar, "Yes", "نعم") }], display: yesNo(d["custom_consent_whatsapp"]) }), F("custom_consent_email", yes(d["custom_consent_email"]), { type: "select", options: [{ value: "1", label: tx(ar, "Yes", "نعم") }], display: yesNo(d["custom_consent_email"]) }),
      F("custom_consent_sms", yes(d["custom_consent_sms"]), { type: "select", options: [{ value: "1", label: tx(ar, "Yes", "نعم") }], display: yesNo(d["custom_consent_sms"]) }), F("custom_consent_date", d["custom_consent_date"], { readOnly: true, display: <bdi dir="ltr" data-no-i18n>{d["custom_consent_date"] ? `${dmy(d["custom_consent_date"])} · ${personLabel(d["custom_consent_by"], ar) || ""}` : "—"}</bdi> })] },
    { key: "company", label: tx(ar, "Company", "الشركة"), fields: [F("organization", d["organization"], { core: true }), F("territory", d["territory"], { core: true, type: "select", options: opt([...new Set([...CITIES, s(d["territory"])].filter(Boolean))]) }),
      F("industry", d["industry"], { core: true, type: "select", options: opt(INDUSTRIES, (x) => indLabel(x, ar)), display: indLabel(s(d["industry"]), ar) }), F("no_of_employees", d["no_of_employees"], { type: "select", options: opt(SIZES) }),
      F("custom_cr_no", d["custom_cr_no"], { display: <bdi dir="ltr" data-no-i18n>{s(d["custom_cr_no"])}</bdi> }), F("custom_vat_no", d["custom_vat_no"], { display: <bdi dir="ltr" data-no-i18n>{s(d["custom_vat_no"])}</bdi> }), F("website", d["website"], { display: <bdi dir="ltr" data-no-i18n>{s(d["website"])}</bdi> })] },
    { key: "qual", label: tx(ar, "Qualification", "التأهيل"), fields: [F("source", d["source"], { core: true, required: true, type: "select", options: opt([...new Set([...SOURCES, s(d["source"])].filter(Boolean))], (x) => srcLabel(x, ar)), display: srcLabel(s(d["source"]), ar) }),
      F("custom_estimated_value", d["custom_estimated_value"] ? s(d["custom_estimated_value"]) : "", { core: true, type: "number", display: <bdi dir="ltr" data-no-i18n>{sar(Number(d["custom_estimated_value"] ?? 0))}</bdi> }),
      F("campaign", d["campaign"], { type: "select", options: adapter.list("Campaign").map((c) => ({ value: c.name, label: c.name })) }), F("custom_interest", d["custom_interest"]),
      ...(d["custom_unqualified_reason"] ? [F("custom_unqualified_reason", d["custom_unqualified_reason"], { readOnly: true, core: true, display: ar ? UNQUALIFIED_AR[s(d["custom_unqualified_reason"])] ?? s(d["custom_unqualified_reason"]) : s(d["custom_unqualified_reason"]) })] : [])] },
  ];
  const deals = dealsOfLead(d.name), files = filesOf("CRM Lead", d.name), co = linkedCompany(d), q = qualification(d);
  const dups = leadDuplicates({ name: d.name, email: d["email"], mobile_no: d["mobile_no"], organization: d["organization"], custom_cr_no: d["custom_cr_no"], custom_vat_no: d["custom_vat_no"] });
  const summary = leadSummary(r);
  const ownerFact = mgr && !locked ? <select className="field-input min-h-8 text-xs" value={s(d["lead_owner"])} onChange={(e) => { const x = setLeadOwner(d.name, e.target.value, user); if (x.ok) toast.success(tx(ar, "Owner changed", "تغيّر المالك")); else toast.error(m(x.error, ar)); }} aria-label={tx(ar, "Owner", "المالك")} data-lead-owner-select>
    {!d["lead_owner"] && <option value="">{tx(ar, "No owner", "بدون مالك")}</option>}{crmUsers().map((u) => <option key={u.name} value={u.name}>{personLabel(u.name, ar)}</option>)}</select> : <bdi data-no-i18n>{personLabel(d["lead_owner"], ar) || tx(ar, "No owner", "بدون مالك")}</bdi>;
  const start = <FieldGroups groups={groups} ar={ar} onSave={save} locked={locked} />;
  const middle = <ActivityPanel dt="CRM Lead" name={d.name} user={user} ar={ar} mode={mode} setMode={setMode} focusKey={focus} emailTo={s(d["email"])} phoneTo={s(d["mobile_no"])} firstName={s(d["first_name"]) || r.title}
    locked={locked ? tx(ar, "This lead is converted and read-only — log new activity on the deal.", "هذا العميل محوّل وللقراءة فقط — سجّل النشاط الجديد على الصفقة.") : undefined} />;
  const end = <div className="grid gap-3">
    <NextStepCard dt="CRM Lead" name={d.name} user={user} ar={ar} open={r.open} locked={locked} />
    <SideCard id="summary" title={tx(ar, "Record summary", "ملخص السجل")} icon="≡" hue="blue">
      <ul className="grid gap-1 text-sm" data-lead-summary={summary.length}>{summary.map((x, i) => <li key={i}>{x[ar ? 1 : 0]}</li>)}</ul>
      <p className="mt-2 text-[11px] text-muted-foreground" data-ai-summary={rules.aiSummary ? "on" : "off"}>{tx(ar, "Rule-based summary from this record's own data. AI summary is off by default (settings).", "ملخص مبني على قواعد من بيانات هذا السجل فقط. ملخص الذكاء الاصطناعي معطّل افتراضيًا (الإعدادات).")}</p>
    </SideCard>
    <SideCard id="sla" title={tx(ar, "First response", "مهلة أول رد")} icon="⏱" hue={r.sla.state === "breached" ? "rose" : r.sla.state === "risk" ? "amber" : "emerald"}>
      <LeadSlaChip sla={r.sla} ar={ar} />
      <p className="mt-1 text-xs text-muted-foreground">{tx(ar, `Promise: first response within ${r.sla.hours} h of creation; at risk from ${rules.slaRiskPct}% of it.`, `المهلة: أول رد خلال ${r.sla.hours} ساعات من الإنشاء؛ «معرّض للتأخر» من ${rules.slaRiskPct}% منها.`)}{r.sla.respondedAt ? <> · {tx(ar, "Responded", "تم الرد")} <bdi dir="ltr" data-no-i18n>{dmy(r.sla.respondedAt)}</bdi></> : null}</p>
    </SideCard>
    <SideCard id="dups" title={tx(ar, "Duplicate likelihood", "احتمالية التكرار")} icon="⧉" hue={dups.length ? "amber" : "emerald"} count={dups.length} tone={dups.some((x) => x.on.length > 1) ? "warn" : undefined}>
      {!dups.length ? <p className="text-sm text-muted-foreground">{tx(ar, "No similar record by mobile, email, company, CR or VAT.", "لا يوجد سجل مشابه بالجوال أو البريد أو الشركة أو السجل التجاري أو الرقم الضريبي.")}</p>
        : <ul className="grid gap-1.5 text-sm" data-lead-dups={dups.length}>{dups.slice(0, 5).map((x) => <li key={x.key} className="flex items-center gap-2"><button type="button" className="ek-rl-link min-w-0 flex-1 truncate text-start" onClick={(e) => peekRow(x.dt, x.name, x.dt === "CRM Lead" ? dups.filter((y) => y.dt === "CRM Lead").map((y) => y.name) : [], e.currentTarget)} data-no-i18n>{x.title}</button>
          <small className="ek-rl-sub">{x.on.map((o) => ({ phone: tx(ar, "mobile", "الجوال"), email: tx(ar, "email", "البريد"), company: tx(ar, "company", "الشركة"), cr: tx(ar, "CR", "السجل"), vat: tx(ar, "VAT", "الضريبي") })[o]).join(" + ")}</small></li>)}</ul>}
      {dups.some((x) => x.dt === "CRM Lead") && !locked && <button type="button" className="ek-rl-link mt-1" onClick={() => setDlg("merge")} data-lead-merge-open>{tx(ar, "Merge a duplicate into this lead", "دمج مكرر في هذا السجل")}</button>}
    </SideCard>
    <SideCard id="company" title={tx(ar, "Linked company", "الشركة المرتبطة")} icon="🏢" hue="teal">
      {co ? <p className="flex flex-wrap items-center gap-2 text-sm" data-lead-company={co.kind}><Pill tone={co.kind === "Customer" ? "ok" : "info"}>{co.kind === "Customer" ? tx(ar, "Customer", "عميل") : co.kind === "Prospect" ? tx(ar, "Prospect", "عميل مرتقب") : tx(ar, "CRM company", "شركة")}</Pill>
        {co.kind === "CRM Organization" ? <Link to="/digit-crm/customers/$org" params={{ org: co.name }} className="text-primary hover:underline" data-no-i18n>{co.title}</Link> : <QuickLink doctype={co.kind} name={co.name}><bdi data-no-i18n>{co.title}</bdi></QuickLink>}</p>
        : <p className="text-sm text-muted-foreground">{d["organization"] ? tx(ar, "Not yet a customer or prospect — created on conversion.", "ليست عميلًا أو عميلًا مرتقبًا بعد — تُنشأ عند التحويل.") : tx(ar, "No company named.", "لا توجد شركة محددة.")}</p>}
    </SideCard>
    <SideCard id="deals" title={tx(ar, "Deals", "الصفقات")} icon="◆" hue="violet" count={deals.length}>
      {deals.length ? <ul className="grid gap-1 text-sm">{deals.map((x) => <li key={x.name} className="flex items-center gap-2"><Link to="/digit-crm/deals/$dealId" params={{ dealId: x.name }} className="min-w-0 flex-1 truncate text-primary hover:underline" data-no-i18n>{s(x["custom_deal_name"]) || x.name}</Link><Pill tone="info">{stageLabelOf(s(x["status"]), ar)}</Pill></li>)}</ul> : <p className="text-sm text-muted-foreground">{tx(ar, "No deal yet — convert the lead to open one.", "لا توجد صفقة بعد — حوّل العميل لفتح صفقة.")}</p>}
    </SideCard>
    <SideCard id="files" title={tx(ar, "Attachments", "المرفقات")} icon="📎" hue="gold" count={files.length}
      action={!locked ? <label className="ek-rl-link cursor-pointer">{tx(ar, "Attach", "إرفاق")}<input type="file" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { const er = attachFile("CRM Lead", d.name, { name: f.name, size: f.size, url: String(rd.result) }, user); if (er) toast.error(m(er, ar)); else toast.success(tx(ar, "Attached", "أُرفق الملف")); }; rd.readAsDataURL(f); e.target.value = ""; }} data-lead-attach /></label> : undefined}>
      {files.length ? <ul className="grid gap-1 text-sm">{files.map((f) => <li key={f.name} className="truncate" data-no-i18n>📄 {s(f["file_name"]) || f.name}</li>)}</ul> : <p className="text-sm text-muted-foreground">{tx(ar, "No attachments.", "لا توجد مرفقات.")}</p>}
    </SideCard>
    <SideCard id="qualification" title={tx(ar, "Qualification checklist", "قائمة التأهيل")} icon="✓" hue="lime" count={q.completeness}>
      <ul className="grid gap-1 text-sm" data-lead-qual={q.completeness}>{q.checks.map((c) => <li key={c.id} className={c.ok ? "" : c.blocking ? "font-semibold text-[var(--negative)]" : "text-muted-foreground"}>{c.ok ? "✓" : "○"} {({ name: tx(ar, "Contact name", "اسم جهة الاتصال"), reach: tx(ar, "Email or mobile", "البريد أو الجوال"), org: tx(ar, "Company", "الشركة"), source: tx(ar, "Lead source", "المصدر"), owner: tx(ar, "Owner", "المالك"), next: tx(ar, "Next step", "الخطوة التالية") } as Record<string, string>)[c.id] ?? c.label}{c.blocking && !c.ok ? tx(ar, " — needed before Qualified", " — مطلوب قبل «مؤهل»") : ""}</li>)}</ul>
    </SideCard>
  </div>;
  return <div className="ek-rf grid gap-4" data-lead-record={d.name} data-lead-stage={r.stage}>
    <RecordHeader ar={ar} name={r.title} kicker={<bdi data-no-i18n>{d.name}</bdi>} title={<bdi data-no-i18n>{r.title}</bdi>} attrs={{ "data-lead-head": d.name }}
      sub={<>{r.company ? <bdi data-no-i18n>{r.company}</bdi> : tx(ar, "No company", "بدون شركة")}{d["job_title"] ? <> · <bdi data-no-i18n>{s(d["job_title"])}</bdi></> : null}</>}
      pills={<><StatusPill k={r.stage} ar={ar} /><LeadScore r={r} ar={ar} /><LeadSlaChip sla={r.sla} ar={ar} />{Number(d["custom_archived"]) ? <Pill tone="neutral">{tx(ar, "Archived", "مؤرشف")}</Pill> : null}</>}
      facts={<dl className="ek-rf-factlist"><div><dt>{tx(ar, "Owner", "المالك")}</dt><dd>{ownerFact}</dd></div><div><dt>{tx(ar, "Status", "الحالة")}</dt><dd>{locked ? <StatusPill k={r.stage} ar={ar} /> : <select className="field-input min-h-8 text-xs" value={r.stage} onChange={(e) => { const v = e.target.value; if (v === r.stage) return; if (v === "Unqualified") setDlg("unqualify"); else go(v); }} aria-label={tx(ar, "Status", "الحالة")} data-lead-status-select>{[...new Set([r.stage, ...LEAD_PATH, "Unqualified"])].map((k) => <option key={k} value={k}>{ar ? stLabel(k, true) : k}</option>)}</select>}</dd></div><div><dt>{tx(ar, "Followers", "المتابعون")}</dt><dd><bdi className="tabular-nums" data-no-i18n data-lead-followers={followers.length}>{followers.length}</bdi></dd></div></dl>}
      actions={<>{!locked && <button type="button" className="btn-primary" disabled={lost} title={lost ? tx(ar, "Reopen the lead first", "أعد فتح العميل أولًا") : undefined} onClick={() => setDlg("convert")} data-lead-convert>{tx(ar, "Convert", "تحويل")}</button>}
        <button type="button" className="btn-secondary" onClick={() => { const on = toggleFollow("CRM Lead", d.name, user); toast.message(on ? tx(ar, "Following", "تتابع هذا السجل") : tx(ar, "Unfollowed", "ألغيت المتابعة")); }} data-lead-follow={following ? "on" : "off"}>{following ? tx(ar, "Following", "متابَع") : tx(ar, "Follow", "متابعة")}</button></>}
      quick={locked ? undefined : [{ key: "note", label: tx(ar, "Note", "ملاحظة"), icon: "✎", run: quick("note") }, { key: "email", label: tx(ar, "Email", "بريد"), icon: "✉", run: quick("email") }, { key: "call", label: tx(ar, "Call", "اتصال"), icon: "☎", run: quick("call") }, { key: "task", label: tx(ar, "Task", "مهمة"), icon: "☑", run: quick("task") }, { key: "meeting", label: tx(ar, "Meeting", "اجتماع"), icon: "◷", run: quick("meeting") }, { key: "whatsapp", label: tx(ar, "WhatsApp", "واتساب"), icon: "◉", run: quick("whatsapp") }]}
      menu={[{ key: "duplicate", label: tx(ar, "Duplicate", "تكرار"), run: () => setDup(true) }, { key: "merge", label: tx(ar, "Merge", "دمج"), run: () => setDlg("merge"), blocked: locked ? tx(ar, "Converted", "محوّل") : undefined },
        { key: "archive", label: Number(d["custom_archived"]) ? tx(ar, "Restore from archive", "استعادة من الأرشيف") : tx(ar, "Archive", "أرشفة"), run: () => { const x = setArchived("CRM Lead", d.name, !Number(d["custom_archived"]), user); if (x.ok) toast.success(Number(d["custom_archived"]) ? tx(ar, "Restored", "استُعيد") : tx(ar, "Archived — hidden from the working views", "أُرشف — لا يظهر في عروض العمل")); else toast.error(m(x.error, ar)); } },
        { key: "delete", label: tx(ar, "Delete", "حذف"), tone: "bad", run: () => setDlg("delete"), blocked: canDelete ? undefined : tx(ar, "No delete permission", "لا توجد صلاحية حذف") }]} />
    {conv && <div className="ek-rf-readonly" role="status" data-lead-converted>
      <b>{tx(ar, "Converted — this lead is read-only.", "تم التحويل — هذا السجل للقراءة فقط.")}</b>
      {conv.deal && <> {tx(ar, "Deal", "الصفقة")}: <Link to="/digit-crm/deals/$dealId" params={{ dealId: conv.deal }} className="font-semibold text-primary hover:underline" data-no-i18n data-converted-deal={conv.deal}>{s(adapter.get("CRM Deal", conv.deal)?.["custom_deal_name"]) || conv.deal}</Link></>}
      {conv.org && <> · {tx(ar, "Company", "الشركة")}: <Link to="/digit-crm/customers/$org" params={{ org: conv.org }} className="text-primary hover:underline" data-no-i18n>{conv.org}</Link></>}
      {conv.contact && <> · {tx(ar, "Contact", "جهة الاتصال")}: <QuickLink doctype="Contact" name={conv.contact}><bdi data-no-i18n>{conv.contact}</bdi></QuickLink></>}
      {!conv.deal && <> · {tx(ar, "Converted without a deal.", "حُوّل دون صفقة.")}</>}
    </div>}
    <StatusPath ar={ar} steps={steps} attrs={{ "data-lead-path": r.stage }} onPick={locked ? undefined : (k) => { if (k !== r.stage) go(k); }}
      complete={!locked && !lost && next ? { label: tx(ar, "Mark as complete", "وضع علامة كمكتمل"), run: () => go(next), blocked: next !== "Converted" && !nextStepOf(d.name) ? tx(ar, "Set the next step first", "حدّد الخطوة التالية أولًا") : undefined } : undefined}
      exit={locked ? undefined : { label: lost ? tx(ar, `${stLabel(r.stage, false)} — reopen`, `${stLabel(r.stage, true)} — إعادة فتح`) : tx(ar, "Unqualified", "غير مؤهل"), active: lost, run: () => (lost ? go("New") : setDlg("unqualify")),
        note: lost && d["custom_unqualified_reason"] ? <small className="ek-path-why">{tx(ar, "Reason", "السبب")}: {ar ? UNQUALIFIED_AR[s(d["custom_unqualified_reason"])] ?? s(d["custom_unqualified_reason"]) : s(d["custom_unqualified_reason"])}</small> : undefined }} />
    <RecordColumns ar={ar} start={start} middle={middle} end={end} />
    {dlg === "convert" && <ConvertDialog d={d} r={r} user={user} ar={ar} onClose={() => setDlg(null)} onDone={(deal) => { setDlg(null); if (deal) void nav({ to: "/digit-crm/deals/$dealId", params: { dealId: deal } }); }} />}
    {dlg === "unqualify" && <UnqualifyDialog name={d.name} user={user} ar={ar} onClose={() => setDlg(null)} />}
    {dlg === "merge" && <MergeDialog d={d} user={user} ar={ar} onClose={() => setDlg(null)} />}
    {dlg === "delete" && <EntDialog open onOpenChange={(o) => { if (!o) setDlg(null); }} size="sm" tone="warn" id="lead-delete" title={tx(ar, "Delete this lead?", "حذف هذا العميل المحتمل؟")}
      footer={<div className="flex w-full justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setDlg(null)}>{tx(ar, "Cancel", "إلغاء")}</button><button type="button" className="btn-primary" data-lead-delete-confirm onClick={() => { if (!meta || !reg.data) { toast.error(tx(ar, "Still loading — try again", "قيد التحميل — أعد المحاولة")); return; } const errs = deleteDocument(meta, d.name, reg.data, user); if (errs.length) { toast.error(errs[0]!); return; } toast.success(tx(ar, "Deleted", "حُذف")); void nav({ to: "/digit-crm/leads" }); }}>{tx(ar, "Delete", "حذف")}</button></div>}>
      <p className="text-sm">{tx(ar, "A lead linked to deals or other documents cannot be deleted; archive it instead.", "لا يُحذف عميل مرتبط بصفقات أو مستندات أخرى؛ أرشفه بدلًا من ذلك.")}</p></EntDialog>}
    <LeadCreateDrawer open={dup} onOpenChange={setDup} user={user} ar={ar} preset={{ organization: s(d["organization"]), industry: s(d["industry"]), no_of_employees: s(d["no_of_employees"]), territory: s(d["territory"]), source: s(d["source"]), campaign: s(d["campaign"]), custom_interest: s(d["custom_interest"]) }} />
  </div>;
}

function UnqualifyDialog({ name, user, ar, onClose }: { name: string; user: string; ar: boolean; onClose: () => void }) {
  const [reason, setReason] = useState(""); const [notes, setNotes] = useState(""); const [err, setErr] = useState<string | null>(null);
  const reasons = leadRules().unqualified;
  return <EntDialog open onOpenChange={(o) => { if (!o) onClose(); }} size="sm" tone="warn" id="lead-unqualify" title={tx(ar, "Mark as unqualified", "وضع علامة «غير مؤهل»")} kicker={tx(ar, "The reason is required (list in the CRM settings)", "السبب مطلوب (القائمة في إعدادات العملاء)")}
    footer={<div className="flex w-full justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>{tx(ar, "Cancel", "إلغاء")}</button><button type="button" className="btn-primary" data-unq-save onClick={() => { const x = setLeadStatus(name, "Unqualified", user, { reason, notes }); if (!x.ok) { setErr(m(x.error, ar)); return; } toast.success(tx(ar, "Marked unqualified", "صُنّف «غير مؤهل»")); onClose(); }}>{tx(ar, "Save", "حفظ")}</button></div>}>
    <div className="grid gap-2 text-sm"><label className="grid gap-1">{tx(ar, "Reason", "السبب")} *<select className="field-input min-h-9" value={reason} onChange={(e) => setReason(e.target.value)} data-unq-reason><option value="">—</option>{reasons.map((x) => <option key={x} value={x}>{ar ? UNQUALIFIED_AR[x] ?? x : x}</option>)}</select></label>
      <label className="grid gap-1">{tx(ar, "Notes", "ملاحظات")}<textarea className="field-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>{err && <p className="ek-ff-err" role="alert" data-unq-err>{err}</p>}</div>
  </EntDialog>;
}

function MergeDialog({ d, user, ar, onClose }: { d: Doc; user: string; ar: boolean; onClose: () => void }) {
  const [q, setQ] = useState(""); const [pick, setPick] = useState("");
  const dupNames = new Set(leadDuplicates({ name: d.name, email: d["email"], mobile_no: d["mobile_no"], organization: d["organization"] }).filter((x) => x.dt === "CRM Lead").map((x) => x.name));
  const all = scopedLeads(user).filter((x) => x.name !== d.name && !Number(x["converted"])).map((x) => ({ key: x.name, label: leadTitle(x), sub: `${x.name} · ${s(x["organization"])}`, match: dupNames.has(x.name) })).sort((a, b) => Number(b.match) - Number(a.match));
  return <EntDialog open onOpenChange={(o) => { if (!o) onClose(); }} size="md" id="lead-merge" title={tx(ar, "Merge another lead into this one", "دمج عميل آخر في هذا السجل")} kicker={tx(ar, "This record is kept; the other one's blanks, activities, attachments and deals move here, then it is removed.", "يبقى هذا السجل؛ تنتقل إليه بيانات الآخر الناقصة وأنشطته ومرفقاته وصفقاته ثم يُحذف.")}
    footer={<div className="flex w-full justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>{tx(ar, "Cancel", "إلغاء")}</button><button type="button" className="btn-primary" disabled={!pick} data-merge-run onClick={() => { const x = mergeLeads(d.name, pick, user); if (!x.ok) { toast.error(m(x.error, ar)); return; } toast.success(tx(ar, `${pick} merged into this lead`, `دُمج ${pick} في هذا السجل`)); onClose(); }}>{tx(ar, "Merge", "دمج")}</button></div>}>
    <NewOrExisting id="merge" label={tx(ar, "Lead to merge", "العميل المراد دمجه")} mode="existing" onMode={() => undefined} query={q} onQuery={setQ} options={all} picked={pick} onPick={setPick} ar={ar} />
  </EntDialog>;
}

function ConvertDialog({ d, r, user, ar, onClose, onDone }: { d: Doc; r: LeadRow; user: string; ar: boolean; onClose: () => void; onDone: (deal: string) => void }) {
  const orgs = orgChoices(d), contacts = contactChoices(d), rules = leadRules();
  const stages = dealStages().filter((x) => !["Won", "Lost"].includes(s(x["type"])));
  const [org, setOrg] = useState<{ mode: "new" | "existing"; name: string; q: string }>({ mode: orgs.some((o) => o.match) ? "existing" : "new", name: orgs.find((o) => o.match)?.key ?? "", q: "" });
  const [con, setCon] = useState<{ mode: "new" | "existing"; name: string; q: string }>({ mode: contacts.some((c) => c.match) ? "existing" : "new", name: contacts.find((c) => c.match)?.key ?? "", q: "" });
  const [noDeal, setNoDeal] = useState(false); const [transfer, setTransfer] = useState(true);
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  // the suggested name uses the company as the screen shows it (Arabic sample display on Arabic screens); the user can edit it
  const [deal, setDeal] = useState({ name: `${(r.company && ar ? sampleNameAr(r.company) : undefined) ?? (r.company || r.title)} — ${d["custom_interest"] || tx(ar, "opportunity", "فرصة")}`, pipeline: rules.pipelines[0] ?? "", stage: stages[0]?.name ?? "", value: String(r.value || ""), close: in30, owner: s(d["lead_owner"]) || user });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const run = () => {
    const x = convertLead(d.name, { org: { mode: org.mode, name: org.name }, contact: { mode: con.mode, name: con.name }, deal: noDeal ? null : { ...deal, value: Number(deal.value || 0) }, transfer }, user);
    if (!x.ok) { setErrs(Object.fromEntries(Object.entries(x.errors ?? {}).map(([k, v]) => [k, m(v, ar)]))); toast.error(m(x.error, ar)); return; }
    if (x.existing) toast.message(tx(ar, "Already converted", "موجود مسبقاً"), { description: tx(ar, "This lead was converted before — nothing new was created.", "حُوّل هذا العميل من قبل — لم يُنشأ شيء جديد.") });
    else toast.success(tx(ar, "Lead converted", "تم تحويل العميل المحتمل"), { description: x.deal ? tx(ar, `Deal ${x.deal} opened`, `فُتحت الصفقة ${x.deal}`) : tx(ar, "Company and contact linked, no deal", "رُبطت الشركة وجهة الاتصال دون صفقة") });
    onDone(x.deal);
  };
  const lab = (k: string, en: string, a: string, node: ReactNode) => <label className="grid gap-1 text-sm" data-convert-field={k}>{tx(ar, en, a)}{node}{errs[k] && <small className="ek-ff-err" role="alert">{errs[k]}</small>}</label>;
  return <EntDialog open onOpenChange={(o) => { if (!o) onClose(); }} size="lg" id="lead-convert" title={tx(ar, "Convert the lead", "تحويل العميل المحتمل")} kicker={<bdi data-no-i18n>{r.title} · {d.name}</bdi>}
    footer={<div className="flex w-full flex-wrap items-center justify-end gap-2"><small className="me-auto text-xs text-muted-foreground">{tx(ar, "Converting twice is safe: a converted lead returns what it became.", "التحويل مرتين آمن: العميل المحوّل يعيد ما تحوّل إليه.")}</small><button type="button" className="btn-ghost" onClick={onClose}>{tx(ar, "Cancel", "إلغاء")}</button><button type="button" className="btn-primary" onClick={run} data-convert-run>{tx(ar, "Convert", "تحويل")}</button></div>}>
    <div className="grid gap-3" data-convert-dialog>
      <NewOrExisting id="org" label={tx(ar, "Company", "الشركة")} mode={org.mode} onMode={(mm) => setOrg((x) => ({ ...x, mode: mm }))} query={org.q} onQuery={(q) => setOrg((x) => ({ ...x, q }))} options={orgs} picked={org.name} onPick={(k) => setOrg((x) => ({ ...x, name: k }))} ar={ar}
        newHint={<>{tx(ar, "A new company is created as", "تُنشأ شركة جديدة باسم")} <b data-no-i18n>{r.company || r.title}</b></>} />
      <NewOrExisting id="contact" label={tx(ar, "Contact", "جهة الاتصال")} mode={con.mode} onMode={(mm) => setCon((x) => ({ ...x, mode: mm }))} query={con.q} onQuery={(q) => setCon((x) => ({ ...x, q }))} options={contacts} picked={con.name} onPick={(k) => setCon((x) => ({ ...x, name: k }))} ar={ar}
        newHint={<>{tx(ar, "A new contact is created from", "تُنشأ جهة اتصال جديدة من")} <b data-no-i18n>{r.title}</b> · <bdi dir="ltr" data-no-i18n>{r.phone || r.email}</bdi></>} />
      <fieldset className="ek-noe" data-noe="deal" data-mode={noDeal ? "none" : "new"}>
        <legend>{tx(ar, "Deal", "الصفقة")}</legend>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={noDeal} onChange={(e) => setNoDeal(e.target.checked)} data-convert-nodeal /> {tx(ar, "Do not create a deal", "لا تُنشئ صفقة")}</label>
        {!noDeal && <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {lab("dealName", "Deal name", "اسم الصفقة", <input className="field-input min-h-9" value={deal.name} onChange={(e) => setDeal({ ...deal, name: e.target.value })} data-convert-name />)}
          {lab("pipeline", "Pipeline", "مسار المبيعات", <select className="field-input min-h-9" value={deal.pipeline} onChange={(e) => setDeal({ ...deal, pipeline: e.target.value })} data-convert-pipeline>{rules.pipelines.map((p) => <option key={p} value={p}>{ar ? PIPELINE_AR[p] ?? p : p}</option>)}</select>)}
          {lab("stage", "Stage", "المرحلة", <select className="field-input min-h-9" value={deal.stage} onChange={(e) => setDeal({ ...deal, stage: e.target.value })} data-convert-stage>{stages.map((x) => <option key={x.name} value={x.name}>{stageLabelOf(x.name, ar)}</option>)}</select>)}
          {lab("value", "Value (⃁)", "القيمة (⃁)", <input className="field-input min-h-9" type="number" min={0} dir="ltr" value={deal.value} onChange={(e) => setDeal({ ...deal, value: e.target.value })} data-convert-value />)}
          {lab("close", "Expected close", "الإغلاق المتوقع", <DateInput className="field-input min-h-9" dir="ltr" value={deal.close} onChange={(e) => setDeal({ ...deal, close: e.target.value })} data-convert-close />)}
          {lab("owner", "Owner", "المالك", <select className="field-input min-h-9" value={deal.owner} disabled={!isManager(user)} onChange={(e) => setDeal({ ...deal, owner: e.target.value })} data-convert-owner>{[...new Set([deal.owner, ...crmUsers().map((u) => u.name)])].map((u) => <option key={u} value={u}>{personLabel(u, ar) || u}</option>)}</select>)}
        </div>}
      </fieldset>
      <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={transfer} onChange={(e) => setTransfer(e.target.checked)} data-convert-transfer /> {tx(ar, "Carry the notes, open tasks, activity history and attachments to the deal", "نقل الملاحظات والمهام المفتوحة وسجل النشاط والمرفقات إلى الصفقة")}</label>
    </div>
  </EntDialog>;
}
