/**
 * DIGIT CRM C4 deal record (/digit-crm/deals/<name>, D-01 … D-09) on the same Enterprise record frame as the lead:
 * header (company link, value, owner, followers, «ربح» / «خسارة», ⋯), stage path with days and the stage requirements
 * (settings), focus block, three columns (summary + fields + contacts with roles · composer + timeline · related cards)
 * and, below, products with VAT, the documents chain (amounts for finance roles only), the customer hand-off and the
 * pipeline guidance. Native documents keep their lifecycle; writes go through dealDesk / wf02 / wf03 only.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { DateInput } from "@/components/form/DateInput";
import { useState } from "react";
import { toast } from "sonner";
import { useLang } from "@/i18n";
import { adapter, type Doc } from "@/lib/adapter";
import { plainMoney } from "@/lib/format";
import { EntDialog } from "@/components/enterprise/Surfaces";
import { QuickLink } from "@/components/enterprise/QuickView";
import { CommitteeStrip, DocChain, FieldGroups, Pill, RecordColumns, RecordHeader, SideCard, StatusPath, type ChainStep, type PathStep, type RfGroup } from "@/components/enterprise/kit/RecordFrame";
import type { ComposerMode } from "@/components/enterprise/kit/RecordTimeline";
import { CrmFrame } from "./CrmApp";
import { crmUsers, isManager, OPEN_TASK, userLabel } from "./wf01";
import { createCustomerFromDeal, customerForDeal, dealStages, dealStatusType, scopedDeals } from "./wf02";
import { createQuotation, quotationsOf } from "./wf03";
import { canSeeFinance } from "./salesDesk";
import { leadRules, PIPELINE_AR, type StageNeed } from "./leadRules";
import { filesOf, followersOf, stageDays, toggleFollow, type Msg } from "./leadDesk";
import {
  addDealContact, committee, competitorsSeen, dealChain, dealContacts, dealCsv, dealFocus, dealSummary, dealTitle, duplicateDeal, FORECAST_AR, FORECAST_EN, LOST_AR, lostReasons, lostStage, mergeDeals,
  moveDealGated, needLabel, productTotals, ROLES, setArchived, setContactRole, setDealOwner, setDealProbability, setForecast, stageGate, syncDealValue, updateDealField, wonStage,
} from "./dealDesk";
import { ActivityPanel, ago, dmy, fieldLabel, INDUSTRIES, indLabel, m, NextStepCard, sar, SIZES, SOURCES, srcLabel, stageLabelOf, tx, personLabel } from "./CrmRecordParts";
import { DealLines, DealQuotation } from "./Wave3";
import { DealDiscipline } from "./Wave5";
import { attachFile } from "./leadDesk";

const s = (v: unknown) => String(v ?? "");
const STAGE_HUE: Record<string, PathStep["hue"]> = { Qualification: "blue", "Demo/Making": "teal", "Proposal/Quotation": "violet", Negotiation: "amber", "Ready to Close": "emerald", Won: "emerald", Lost: "rose" };

export function DealRecordPage({ dealId }: { dealId: string }) {
  const ar = useLang() === "ar";
  return <CrmFrame title={tx(ar, "Deal", "صفقة")} subtitle={dealId} actions={<Link to="/digit-crm/pipeline" className="ek-context-btn" data-deal-back>{tx(ar, "Pipeline", "مسار الصفقات")}</Link>}>{(user) => <DealBody dealId={dealId} user={user} ar={ar} />}</CrmFrame>;
}

type Gate = { to: string; missing: StageNeed[] } | null;
function DealBody({ dealId, user, ar }: { dealId: string; user: string; ar: boolean }) {
  const nav = useNavigate();
  const [mode, setMode] = useState<ComposerMode>("note"); const [focus, setFocus] = useState(0);
  const [gate, setGate] = useState<Gate>(null); const [lose, setLose] = useState(false); const [merge, setMerge] = useState(false);
  const [repeat, setRepeat] = useState<string | null>(null);
  const d = scopedDeals(user).find((x) => x.name === dealId);
  if (!d) return <div className="ek-card ek-card-pad" data-dc-state="denied"><h2 className="ek-h3">{tx(ar, "Deal not found or not permitted", "الصفقة غير موجودة أو غير مسموحة")}</h2><Link to="/digit-crm/pipeline" className="btn-primary mt-2 inline-flex">{tx(ar, "Back to the pipeline", "العودة إلى مسار الصفقات")}</Link></div>;
  const sm = dealSummary(d), fin = canSeeFinance(user), mgr = isManager(user), editable = mgr || d["deal_owner"] === user, closed = !sm.open;
  const stages = dealStages(), days = stageDays(d), ci = stages.findIndex((x) => x.name === d["status"]);
  const openStages = stages.filter((x) => !["Won", "Lost"].includes(s(x["type"])));
  const followers = followersOf("CRM Deal", d.name), following = followers.includes(user);
  const focusB = dealFocus(d), t = productTotals(d), cs = dealContacts(d), cm = committee(d), chain = dealChain(d, user);
  const quick = (k: ComposerMode) => () => { setMode(k); setFocus((x) => x + 1); };
  const tryMove = (to: string) => {
    if (to === s(d["status"])) return;
    if (dealStatusType(to) === "Lost") { setLose(true); return; }
    const g = stageGate(d, to);
    if (g.missing.length && g.mode === "block") { setGate({ to, missing: g.missing }); return; }
    const x = moveDealGated(d.name, to, user); if (!x.ok) { toast.error(m(x.error, ar)); return; }
    toast.success(tx(ar, `Moved to ${to}`, `نُقلت إلى ${stageLabelOf(to, true)}`), x.warned.length ? { description: tx(ar, `Still missing: ${x.warned.map((n) => needLabel(n, false)).join(", ")}`, `ما زال ناقصًا: ${x.warned.map((n) => needLabel(n, true)).join("، ")}`) } : undefined);
  };
  const steps: PathStep[] = [...openStages, ...stages.filter((x) => x["type"] === "Won")].map((st) => { const i = stages.indexOf(st); return { key: st.name, label: stageLabelOf(st.name, ar), hue: STAGE_HUE[st.name], state: sm.type === "Lost" ? "next" : i < ci ? "done" : i === ci ? "current" : "next", days: days[st.name] ?? (i === ci ? 0 : undefined) }; });
  const save = (field: string, value: string) => { const x = updateDealField(d.name, field, value, user); if (!x.ok) return m(x.error, ar); const before = x.before; toast.success(tx(ar, `${fieldLabel(field, false)} saved`, `حُفظ ${fieldLabel(field, true)}`), { action: { label: tx(ar, "Undo", "تراجع"), onClick: () => { updateDealField(d.name, field, s(before), user); } } }); return null; };
  const F = (key: string, value: unknown, more: Partial<RfGroup["fields"][number]> = {}) => ({ key, label: fieldLabel(key, ar), value: s(value), ...more });
  const groups: RfGroup[] = [{ key: "deal", label: tx(ar, "Deal details", "تفاصيل الصفقة"), fields: [F("custom_deal_name", d["custom_deal_name"], { core: true }), F("custom_pipeline", d["custom_pipeline"], { core: true, type: "select", options: leadRules().pipelines.map((p) => ({ value: p, label: ar ? PIPELINE_AR[p] ?? p : p })), display: ar ? PIPELINE_AR[s(d["custom_pipeline"])] ?? s(d["custom_pipeline"]) : s(d["custom_pipeline"]) }),
    F("source", d["source"], { core: true, type: "select", options: [...new Set([...SOURCES, s(d["source"])].filter(Boolean))].map((x) => ({ value: x, label: srcLabel(x, ar) })), display: srcLabel(s(d["source"]), ar) }), F("industry", d["industry"], { type: "select", options: INDUSTRIES.map((x) => ({ value: x, label: indLabel(x, ar) })), display: indLabel(s(d["industry"]), ar) }),
    F("no_of_employees", d["no_of_employees"], { type: "select", options: SIZES.map((x) => ({ value: x, label: x })) }), F("territory", d["territory"]), F("website", d["website"], { display: <bdi dir="ltr" data-no-i18n>{s(d["website"])}</bdi> })] }];
  const tasks = adapter.list("CRM Task").filter((x) => x["reference_doctype"] === "CRM Deal" && x["reference_docname"] === d.name);
  const meetings = adapter.list("Event").filter((x) => x["reference_doctype"] === "CRM Deal" && x["reference_docname"] === d.name);
  const notes = adapter.list("FCRM Note").filter((x) => x["reference_doctype"] === "CRM Deal" && x["reference_docname"] === d.name);
  const files = filesOf("CRM Deal", d.name), quotes = quotationsOf(d.name), cust = customerForDeal(d.name);
  const amountText = (n: number | null) => (n === null ? undefined : <bdi dir="ltr" data-no-i18n>{sar(n)}</bdi>);
  const chainSteps: ChainStep[] = [
    { key: "quote", label: tx(ar, "Quotation", "عرض السعر"), docs: chain.quotes.map((x) => ({ key: x.name, title: <QuickLink doctype="Quotation" name={x.name}><bdi data-no-i18n>{x.name}</bdi></QuickLink>, status: ({ Sent: tx(ar, "Sent", "مُرسل"), Draft: tx(ar, "Draft", "مسودة"), Cancelled: tx(ar, "Cancelled", "ملغى") } as Record<string, string>)[x.status] ?? x.status, tone: x.tone, amount: amountText(x.amount) })),
      empty: tx(ar, "No quotation yet", "لا يوجد عرض سعر بعد"),
      action: <button type="button" className="btn-secondary mt-2" disabled={sm.type === "Lost" || !t.rows.length} title={!t.rows.length ? tx(ar, "Add products first", "أضف المنتجات أولًا") : undefined} onClick={() => { const r = createQuotation(d.name, user); if (!r.ok) { toast.error(r.error); return; } if (r.existing) { setRepeat(r.name); toast.message(tx(ar, "Already exists", "موجود مسبقاً"), { description: tx(ar, `Quotation ${r.name} already exists for this deal — no new one was created.`, `عرض السعر ${r.name} موجود لهذه الصفقة — لم يُنشأ عرض جديد.`) }); } else { setRepeat(null); toast.success(tx(ar, "Draft quotation created", "أُنشئ عرض سعر كمسودة"), { description: r.name }); } }} data-chain-create-quote>{tx(ar, "Create quotation", "إنشاء عرض سعر")}</button> },
    { key: "order", label: tx(ar, "Sales order", "أمر البيع"), docs: chain.orders.map((x) => ({ key: x.name, title: <QuickLink doctype="Sales Order" name={x.name}><bdi data-no-i18n>{x.name}</bdi></QuickLink>, status: x.status === "Submitted" ? tx(ar, "Confirmed", "مؤكد") : x.status === "Draft" ? tx(ar, "Draft", "مسودة") : x.status, tone: x.tone, amount: amountText(x.amount) })), empty: tx(ar, "No order — after a sent quotation", "لا يوجد أمر — بعد إرسال العرض") },
    { key: "invoice", label: tx(ar, "Invoice", "الفاتورة"), docs: chain.invoices.map((x) => ({ key: x.name, title: <QuickLink doctype="Sales Invoice" name={x.name}><bdi data-no-i18n>{x.name}</bdi></QuickLink>, status: ({ Paid: tx(ar, "Paid", "مدفوعة"), Unpaid: tx(ar, "Unpaid", "غير مدفوعة"), Overdue: tx(ar, "Overdue", "متأخرة"), Draft: tx(ar, "Draft", "مسودة") } as Record<string, string>)[x.status] ?? x.status, tone: x.tone, amount: amountText(x.amount) })), empty: tx(ar, "Not invoiced", "لم تُفوتر") },
    { key: "payment", label: tx(ar, "Collection", "التحصيل"), docs: chain.payments.map((x) => ({ key: x.name, title: <QuickLink doctype="Payment Entry" name={x.name}><bdi data-no-i18n>{x.name}</bdi></QuickLink>, status: tx(ar, "Received", "مُحصّل"), tone: x.tone, amount: amountText(x.amount) })), empty: tx(ar, "Not collected", "لم يُحصّل") },
  ];
  const start = <div className="grid gap-3">
    <SideCard id="deal-summary" title={tx(ar, "Summary", "ملخص الصفقة")} icon="◆" hue="emerald">
      <dl className="ek-rf-sum" data-deal-summary>
        <div><dt>{tx(ar, "Value", "القيمة")}</dt><dd><bdi dir="ltr" data-no-i18n data-deal-value={sm.value}>{sar(sm.value)}</bdi></dd></div>
        <div><dt>{tx(ar, "Probability", "الاحتمالية")}</dt><dd className="flex flex-wrap items-center gap-1">{editable && sm.open ? <input className="field-input min-h-8 w-20 text-sm" type="number" min={0} max={100} dir="ltr" defaultValue={sm.prob} key={`${sm.prob}-${sm.probOwn}`} onBlur={(e) => { const v = Number(e.target.value); if (v === sm.prob) return; const x = setDealProbability(d.name, v, user); if (!x.ok) toast.error(m(x.error, ar)); }} aria-label={tx(ar, "Probability", "الاحتمالية")} data-deal-prob /> : <bdi dir="ltr" data-no-i18n>{sm.prob}%</bdi>}
          <small className="ek-rl-sub">{sm.probOwn ? <>{tx(ar, "overridden", "معدّلة")} · <button type="button" className="ek-rl-link" onClick={() => setDealProbability(d.name, null, user)} data-deal-prob-reset>{tx(ar, `stage default ${sm.stageProb}%`, `افتراضي المرحلة ${sm.stageProb}%`)}</button></> : tx(ar, "stage default", "افتراضي المرحلة")}</small></dd></div>
        <div><dt>{tx(ar, "Weighted", "المرجّحة")}</dt><dd><bdi dir="ltr" data-no-i18n data-deal-weighted={sm.weighted}>{sar(sm.weighted)}</bdi></dd></div>
        <div><dt>{tx(ar, "Expected close", "الإغلاق المتوقع")}</dt><dd>{editable && sm.open ? <DateInput className={`field-input min-h-8 text-sm ${sm.closeLate ? "text-[var(--negative)] font-semibold" : ""}`} dir="ltr" defaultValue={sm.close} key={sm.close} onChange={(e) => { if (e.target.value && e.target.value !== sm.close) { const x = updateDealField(d.name, "expected_closure_date", e.target.value, user); if (!x.ok) toast.error(m(x.error, ar)); } }} data-deal-close data-late={sm.closeLate || undefined} /> : <bdi dir="ltr" className={sm.closeLate ? "text-[var(--negative)]" : ""} data-no-i18n>{sm.close ? dmy(sm.close) : "—"}</bdi>}{sm.closeLate && <small className="block font-semibold text-[var(--negative)]" data-deal-close-late>{tx(ar, "Date passed", "فات التاريخ")}</small>}</dd></div>
        <div><dt>{tx(ar, "Forecast category", "فئة التوقع")}</dt><dd>{editable && sm.open ? <select className="field-input min-h-8 text-sm" value={sm.forecastOwn ? sm.forecast : ""} onChange={(e) => setForecast(d.name, e.target.value, user)} data-deal-forecast><option value="">{tx(ar, `Auto (${FORECAST_EN[sm.forecast]})`, `تلقائي (${FORECAST_AR[sm.forecast]})`)}</option>{(["commit", "best", "pipeline"] as const).map((k) => <option key={k} value={k}>{ar ? FORECAST_AR[k] : FORECAST_EN[k]}</option>)}</select> : <span>{ar ? FORECAST_AR[sm.forecast] : FORECAST_EN[sm.forecast]}</span>}</dd></div>
        <div><dt>{tx(ar, "Source", "المصدر")}</dt><dd>{srcLabel(sm.source, ar)}</dd></div>
        <div><dt>{tx(ar, "Deal age", "عمر الصفقة")}</dt><dd><bdi data-no-i18n>{sm.ageDays ?? "—"}</bdi> {tx(ar, "days", "يومًا")}</dd></div>
        <div><dt>{tx(ar, "Last activity", "آخر نشاط")}</dt><dd><bdi data-no-i18n>{sm.lastAt ? ago(sm.lastAt, ar) : tx(ar, "None yet", "لا يوجد")}</bdi></dd></div>
      </dl>
    </SideCard>
    <FieldGroups groups={groups} ar={ar} onSave={save} locked={!editable || closed} />
    <SideCard id="deal-contacts" title={tx(ar, "Contacts and roles", "جهات الاتصال والأدوار")} icon="👥" hue="blue" count={cs.length}>
      <CommitteeStrip ar={ar} roles={cm.map((x) => ({ key: x.key, label: ar ? x.ar : x.en, names: x.names }))} />
      <ul className="mt-2 grid gap-1.5 text-sm" data-deal-contact-list={cs.length}>{cs.map((c) => <li key={c.contact} className="flex flex-wrap items-center gap-2" data-deal-contact={c.contact}>
        <QuickLink doctype="Contact" name={c.contact}><bdi className="font-medium" data-no-i18n>{c.name}</bdi></QuickLink>{c.primary && <Pill tone="info">{tx(ar, "Primary", "أساسية")}</Pill>}
        <select className="field-input ms-auto min-h-8 text-xs" value={c.role} disabled={!editable} onChange={(e) => { const x = setContactRole(d.name, c.contact, e.target.value, user); if (!x.ok) toast.error(m(x.error, ar)); }} aria-label={tx(ar, "Role", "الدور")} data-deal-role={c.contact}><option value="">{tx(ar, "No role", "بلا دور")}</option>{ROLES.map(([k, en, a]) => <option key={k} value={k}>{ar ? a : en}</option>)}</select></li>)}</ul>
      {editable && <AddContact deal={d} user={user} ar={ar} />}
    </SideCard>
  </div>;
  const middle = <ActivityPanel dt="CRM Deal" name={d.name} user={user} ar={ar} mode={mode} setMode={setMode} focusKey={focus} emailTo={s(d["email"] || cs[0]?.email)} phoneTo={s(d["mobile_no"] || cs[0]?.mobile)} firstName={s(cs[0]?.name.split(" ")[0]) || dealTitle(d)} />;
  const end = <div className="grid gap-3">
    <NextStepCard dt="CRM Deal" name={d.name} user={user} ar={ar} open={sm.open} locked={!editable} />
    <SideCard id="deal-company" title={tx(ar, "Company", "الشركة")} icon="🏢" hue="teal">{d["organization"] ? <p className="text-sm"><Link to="/digit-crm/customers/$org" params={{ org: s(d["organization"]) }} className="font-semibold text-primary hover:underline" data-no-i18n data-deal-c360>{s(d["organization"])}</Link> <small className="ek-rl-sub">· {tx(ar, "Customer 360", "ملف العميل 360")}</small></p> : <p className="text-sm text-muted-foreground">{tx(ar, "No company linked.", "لا توجد شركة مرتبطة.")}</p>}
      {cust && <p className="mt-1 text-xs">{tx(ar, "Customer", "العميل")}: <QuickLink doctype="Customer" name={cust.name}><bdi data-no-i18n>{s(cust["customer_name"]) || cust.name}</bdi></QuickLink></p>}</SideCard>
    <SideCard id="deal-quotes" title={tx(ar, "Quotations", "عروض الأسعار")} icon="₪" hue="violet" count={quotes.length}>{quotes.length ? <ul className="grid gap-1 text-sm">{quotes.map((q) => <li key={q.name} className="flex items-center gap-2"><QuickLink doctype="Quotation" name={q.name}><bdi data-no-i18n>{q.name}</bdi></QuickLink><Pill tone={Number(q["docstatus"]) === 1 ? "info" : Number(q["docstatus"]) === 2 ? "bad" : "neutral"}>{Number(q["docstatus"]) === 1 ? tx(ar, "Sent", "مُرسل") : Number(q["docstatus"]) === 2 ? tx(ar, "Cancelled", "ملغى") : tx(ar, "Draft", "مسودة")}</Pill></li>)}</ul> : <p className="text-sm text-muted-foreground">{tx(ar, "None yet.", "لا يوجد بعد.")}</p>}</SideCard>
    <SideCard id="deal-meetings" title={tx(ar, "Meetings", "الاجتماعات")} icon="◷" hue="amber" count={meetings.length}>{meetings.length ? <ul className="grid gap-1 text-sm">{meetings.slice(0, 4).map((e) => <li key={e.name} className="truncate"><bdi data-no-i18n>{s(e["subject"])}</bdi> · <bdi dir="ltr" data-no-i18n>{dmy(e["starts_on"])}</bdi></li>)}</ul> : <button type="button" className="ek-rl-link" onClick={quick("meeting")}>{tx(ar, "Schedule a meeting", "جدولة اجتماع")}</button>}</SideCard>
    <SideCard id="deal-tasks" title={tx(ar, "Tasks", "المهام")} icon="☑" hue="lime" count={tasks.filter((x) => OPEN_TASK.includes(s(x["status"]))).length}>{tasks.length ? <ul className="grid gap-1 text-sm">{tasks.slice(0, 5).map((x) => <li key={x.name} className={`truncate ${OPEN_TASK.includes(s(x["status"])) ? "" : "text-muted-foreground line-through"}`} data-no-i18n>{s(x["title"])}</li>)}</ul> : <button type="button" className="ek-rl-link" onClick={quick("task")}>{tx(ar, "Add a task", "إضافة مهمة")}</button>}</SideCard>
    <SideCard id="deal-notes" title={tx(ar, "Notes", "الملاحظات")} icon="✎" hue="blue" count={notes.length}>{notes.length ? <p className="line-clamp-3 text-sm" data-no-i18n>{s(notes[0]!["title"])}</p> : <button type="button" className="ek-rl-link" onClick={quick("note")}>{tx(ar, "Write a note", "كتابة ملاحظة")}</button>}</SideCard>
    <SideCard id="deal-files" title={tx(ar, "Attachments", "المرفقات")} icon="📎" hue="gold" count={files.length}
      action={editable ? <label className="ek-rl-link cursor-pointer">{tx(ar, "Attach", "إرفاق")}<input type="file" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { const er = attachFile("CRM Deal", d.name, { name: f.name, size: f.size, url: String(rd.result) }, user); if (er) toast.error(m(er, ar)); else toast.success(tx(ar, "Attached", "أُرفق الملف")); }; rd.readAsDataURL(f); e.target.value = ""; }} /></label> : undefined}>
      {files.length ? <ul className="grid gap-1 text-sm">{files.map((f) => <li key={f.name} className="truncate" data-no-i18n>📄 {s(f["file_name"])}</li>)}</ul> : <p className="text-sm text-muted-foreground">{tx(ar, "No attachments.", "لا توجد مرفقات.")}</p>}</SideCard>
    <SideCard id="deal-competitors" title={tx(ar, "Competitors", "المنافسون")} icon="⚑" hue="coral">{d["custom_competitor"] ? <p className="text-sm" data-no-i18n data-deal-competitor>{s(d["custom_competitor"]) === "None" ? tx(ar, "No competitor involved", "لا يوجد منافس") : s(d["custom_competitor"])}</p> : <p className="text-sm text-muted-foreground">{tx(ar, "Recorded when the deal is lost.", "يُسجّل عند خسارة الصفقة.")}{competitorsSeen().length ? <> {tx(ar, "Seen before", "سبق ظهورهم")}: <bdi data-no-i18n>{competitorsSeen().slice(0, 3).join("، ")}</bdi></> : null}</p>}</SideCard>
  </div>;
  return <div className="ek-rf grid gap-4" data-deal-record={d.name} data-deal-stage={s(d["status"])}>
    <RecordHeader ar={ar} name={dealTitle(d)} kicker={<bdi data-no-i18n>{d.name}</bdi>} title={<bdi data-no-i18n>{dealTitle(d)}</bdi>} attrs={{ "data-deal-head": d.name }}
      sub={d["organization"] ? <Link to="/digit-crm/customers/$org" params={{ org: s(d["organization"]) }} className="text-primary hover:underline" data-no-i18n>{s(d["organization"])}</Link> : tx(ar, "No company", "بدون شركة")}
      pills={<><Pill hue={STAGE_HUE[s(d["status"])]} attrs={{ "data-deal-stage-pill": s(d["status"]) }}>{stageLabelOf(s(d["status"]), ar)}</Pill><Pill tone="neutral">{ar ? FORECAST_AR[sm.forecast] : FORECAST_EN[sm.forecast]}</Pill>
        {sm.type === "Lost" && d["lost_reason"] ? <Pill tone="bad">{ar ? LOST_AR[s(d["lost_reason"])] ?? s(d["lost_reason"]) : s(d["lost_reason"])}</Pill> : null}{Number(d["custom_archived"]) ? <Pill tone="neutral">{tx(ar, "Archived", "مؤرشف")}</Pill> : null}</>}
      facts={<dl className="ek-rf-factlist"><div><dt>{tx(ar, "Value", "القيمة")}</dt><dd><bdi dir="ltr" data-no-i18n>{sar(sm.value)}</bdi> <small className="ek-rl-sub" data-no-i18n>{sm.currency}</small></dd></div>
        <div><dt>{tx(ar, "Owner", "المالك")}</dt><dd>{mgr ? <select className="field-input min-h-8 text-xs" value={s(d["deal_owner"])} onChange={(e) => { const x = setDealOwner(d.name, e.target.value, user); if (x.ok) toast.success(tx(ar, "Owner changed", "تغيّر المالك")); else toast.error(m(x.error, ar)); }} data-deal-owner-select>{[...new Set([s(d["deal_owner"]), ...crmUsers().map((u) => u.name)])].filter(Boolean).map((u) => <option key={u} value={u}>{personLabel(u, ar) || u}</option>)}</select> : <bdi data-no-i18n>{personLabel(d["deal_owner"], ar) || "—"}</bdi>}</dd></div>
        <div><dt>{tx(ar, "Followers", "المتابعون")}</dt><dd><bdi className="tabular-nums" data-no-i18n>{followers.length}</bdi></dd></div></dl>}
      actions={<>{sm.open && editable && <><button type="button" className="btn-primary ek-rf-btn-ok" onClick={() => tryMove(wonStage())} data-deal-win>{tx(ar, "Won", "ربح")}</button><button type="button" className="btn-secondary ek-rf-btn-bad" onClick={() => setLose(true)} data-deal-lose>{tx(ar, "Lost", "خسارة")}</button></>}
        <button type="button" className="btn-secondary" onClick={() => { const on = toggleFollow("CRM Deal", d.name, user); toast.message(on ? tx(ar, "Following", "تتابع هذه الصفقة") : tx(ar, "Unfollowed", "ألغيت المتابعة")); }} data-deal-follow={following ? "on" : "off"}>{following ? tx(ar, "Following", "متابَع") : tx(ar, "Follow", "متابعة")}</button></>}
      quick={[{ key: "note", label: tx(ar, "Note", "ملاحظة"), icon: "✎", run: quick("note") }, { key: "email", label: tx(ar, "Email", "بريد"), icon: "✉", run: quick("email") }, { key: "call", label: tx(ar, "Call", "اتصال"), icon: "☎", run: quick("call") }, { key: "task", label: tx(ar, "Task", "مهمة"), icon: "☑", run: quick("task") }, { key: "meeting", label: tx(ar, "Meeting", "اجتماع"), icon: "◷", run: quick("meeting") }, { key: "whatsapp", label: tx(ar, "WhatsApp", "واتساب"), icon: "◉", run: quick("whatsapp") }]}
      menu={[{ key: "duplicate", label: tx(ar, "Duplicate", "تكرار"), run: () => { const x = duplicateDeal(d.name, user); if (!x.ok) { toast.error(m(x.error, ar)); return; } toast.success(tx(ar, `Copy ${x.name} created`, `أُنشئت نسخة ${x.name}`)); void nav({ to: "/digit-crm/deals/$dealId", params: { dealId: x.name } }); } },
        { key: "merge", label: tx(ar, "Merge", "دمج"), run: () => setMerge(true), blocked: editable ? undefined : tx(ar, "Owner or manager only", "للمالك أو المدير فقط") },
        { key: "export", label: tx(ar, "Export", "تصدير"), run: () => { const csv = plainMoney(dealCsv(d, ar)); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); a.download = `${d.name}.csv`; a.click(); } },
        { key: "archive", label: Number(d["custom_archived"]) ? tx(ar, "Restore from archive", "استعادة من الأرشيف") : tx(ar, "Archive", "أرشفة"), run: () => { const x = setArchived("CRM Deal", d.name, !Number(d["custom_archived"]), user); if (x.ok) toast.success(tx(ar, "Saved", "حُفظ")); else toast.error(m(x.error, ar)); } }]} />
    {(focusB.overdue.length > 0 || focusB.stale !== null || (sm.open && !focusB.next)) && <section className="ek-rf-focus" data-deal-focus>
      <b>{tx(ar, "Focus now", "التركيز الآن")}</b>
      {sm.open && !focusB.next && <span className="ek-pill" data-tone="bad" data-focus="nonext">{tx(ar, "No next step — required while the deal is open", "لا توجد خطوة تالية — مطلوبة ما دامت الصفقة مفتوحة")}</span>}
      {focusB.overdue.length > 0 && <span className="ek-pill" data-tone="bad" data-focus="overdue">{tx(ar, `${focusB.overdue.length} overdue task(s)`, `${focusB.overdue.length} مهام متأخرة`)}</span>}
      {focusB.stale !== null && <span className="ek-pill" data-tone="warn" data-focus="stale">{tx(ar, `No activity for ${focusB.stale} days`, `لا نشاط منذ ${focusB.stale} يومًا`)}</span>}
      {sm.closeLate && <span className="ek-pill" data-tone="bad" data-focus="late">{tx(ar, "Expected close has passed", "فات تاريخ الإغلاق المتوقع")}</span>}
    </section>}
    <StatusPath ar={ar} steps={steps} attrs={{ "data-deal-path": s(d["status"]) }} onPick={editable ? tryMove : undefined}
      exit={editable ? { label: sm.type === "Lost" ? tx(ar, "Lost — reopen", "خسارة — إعادة فتح") : tx(ar, "Lost", "خسارة"), active: sm.type === "Lost", run: () => (sm.type === "Lost" ? tryMove(openStages[0]?.name ?? "Qualification") : setLose(true)),
        note: sm.type === "Lost" ? <small className="ek-path-why">{ar ? LOST_AR[s(d["lost_reason"])] ?? s(d["lost_reason"]) : s(d["lost_reason"])}{d["custom_competitor"] && s(d["custom_competitor"]) !== "None" ? <> · <bdi data-no-i18n>{s(d["custom_competitor"])}</bdi></> : null}</small> : undefined } : undefined} />
    <RecordColumns ar={ar} start={start} middle={middle} end={end} />
    <section className="ek-card ek-card-pad" data-deal-products>
      <div className="mb-2 flex flex-wrap items-center gap-2"><h2 className="ek-h3">{tx(ar, "Products and value", "المنتجات والقيمة")}</h2>
        {t.manual && <span className="ek-pill" data-tone="warn" data-deal-manual>{tx(ar, "Value typed by hand", "القيمة يدوية")}</span>}
        {t.manual && editable && <button type="button" className="ek-rl-link" onClick={() => { const x = syncDealValue(d.name, user); if (x.ok) toast.success(tx(ar, "Deal value = products total", "قيمة الصفقة = إجمالي المنتجات")); else toast.error(m(x.error, ar)); }} data-deal-sync>{tx(ar, "Use the products total", "استخدام إجمالي المنتجات")}</button>}</div>
      <DealLines key={s(d["modified"])} deal={d} user={user} />
      <dl className="ek-rf-totals" data-deal-totals={t.gross}>
        <div><dt>{tx(ar, "Net (deal value)", "الصافي (قيمة الصفقة)")}</dt><dd><bdi dir="ltr" data-no-i18n>{sar(t.net)}</bdi></dd></div>
        <div><dt>{tx(ar, `VAT ${t.rate}% (company sales template)`, `ضريبة القيمة المضافة ${t.rate}% (قالب ضريبة المبيعات)`)}</dt><dd><bdi dir="ltr" data-no-i18n data-deal-vat={t.vat}>{sar(t.vat)}</bdi></dd></div>
        <div><dt>{tx(ar, "Total incl. VAT", "الإجمالي شامل الضريبة")}</dt><dd><b><bdi dir="ltr" data-no-i18n>{sar(t.gross)}</bdi></b></dd></div>
      </dl>
    </section>
    <section className="ek-card ek-card-pad" data-deal-chain>
      <div className="mb-2 flex flex-wrap items-center gap-2"><h2 className="ek-h3">{tx(ar, "Documents chain", "سلسلة المستندات")}</h2>{!fin && <span className="ek-pill" data-tone="info" data-chain-locked>{tx(ar, "Amounts are shown to finance roles only", "المبالغ تظهر لأصحاب الصلاحية المالية فقط")}</span>}</div>
      {repeat && <p className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-[var(--warning-bg)] px-3 py-2 text-sm" role="status" data-crm-quote-exists={repeat}><span className="ek-pill" data-tone="warn">{tx(ar, "Already exists", "موجود مسبقاً")}</span><QuickLink doctype="Quotation" name={repeat}><bdi data-no-i18n>{repeat}</bdi></QuickLink></p>}
      <DocChain ar={ar} steps={chainSteps} />
    </section>
    <div className="grid gap-4 lg:grid-cols-2">
      <DealQuotation deal={d} user={user} />
      <section className="ek-card ek-card-pad" data-deal-handoff>
        <h2 className="ek-h3">{tx(ar, "Customer hand-off", "تسليم العميل")}</h2>
        <p className="mb-2 text-xs text-muted-foreground">{tx(ar, "A won deal becomes a customer; quotations stay drafts until finished in the quotation form.", "الصفقة الرابحة تصبح عميلًا؛ وعروض الأسعار تبقى مسودات حتى تُكمل في نموذج عرض السعر.")}</p>
        <button type="button" className="btn-primary" disabled={sm.type !== "Won" || !!cust} onClick={() => { const r = createCustomerFromDeal(d.name, user); if (r.ok) toast.success(tx(ar, "Customer linked", "رُبط العميل"), { description: r.name }); else toast.error(r.error); }} data-crm-action="create-customer">{tx(ar, "Create customer", "إنشاء عميل")}</button>
        {sm.type !== "Won" && !cust && <p className="mt-1 text-xs text-muted-foreground">{tx(ar, "Mark the deal as won to create the customer.", "علّم الصفقة كرابحة لإنشاء العميل.")}</p>}
        {cust && <p className="mt-1 text-sm">{tx(ar, "Customer", "العميل")}: <QuickLink doctype="Customer" name={cust.name}><bdi data-no-i18n>{s(cust["customer_name"]) || cust.name}</bdi></QuickLink></p>}
      </section>
    </div>
    <DealDiscipline d={d} user={user} />
    {gate && <GateDialog d={d} gate={gate} user={user} ar={ar} onClose={() => setGate(null)} onJump={(k) => { setGate(null); if (k === "next_step" || k === "decision_maker" || k === "contact") document.querySelector(k === "next_step" ? "[data-sc='next-step']" : "[data-sc='deal-contacts']")?.scrollIntoView({ behavior: "smooth", block: "center" }); else document.querySelector(k === "products" ? "[data-deal-products]" : "[data-deal-chain]")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />}
    {lose && <LoseDialog name={d.name} user={user} ar={ar} onClose={() => setLose(false)} />}
    {merge && <MergeDealDialog d={d} user={user} ar={ar} onClose={() => setMerge(false)} />}
  </div>;
}

function AddContact({ deal, user, ar }: { deal: Doc; user: string; ar: boolean }) {
  const [q, setQ] = useState(""); const [role, setRole] = useState("");
  const have = new Set(dealContacts(deal).map((c) => c.contact));
  const all = adapter.list("Contact").filter((c) => !have.has(c.name)).map((c) => ({ key: c.name, label: s(c["full_name"]) || [c["first_name"], c["last_name"]].filter(Boolean).join(" ") || c.name, co: s(c["company_name"]) }));
  const pick = all.find((c) => c.label === q || c.key === q);
  return <div className="mt-2 flex flex-wrap items-center gap-2" data-deal-add-contact>
    <input className="field-input min-h-8 min-w-0 flex-1 text-xs" list={`deal-contacts-${deal.name}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx(ar, "Add a contact…", "إضافة جهة اتصال…")} aria-label={tx(ar, "Add a contact", "إضافة جهة اتصال")} />
    <datalist id={`deal-contacts-${deal.name}`}>{all.slice(0, 200).map((c) => <option key={c.key} value={c.label}>{c.co}</option>)}</datalist>
    <select className="field-input min-h-8 text-xs" value={role} onChange={(e) => setRole(e.target.value)} aria-label={tx(ar, "Role", "الدور")}><option value="">{tx(ar, "Role", "الدور")}</option>{ROLES.map(([k, en, a]) => <option key={k} value={k}>{ar ? a : en}</option>)}</select>
    <button type="button" className="btn-secondary min-h-8 text-xs" disabled={!pick} onClick={() => { const x = addDealContact(deal.name, pick!.key, role, user); if (!x.ok) toast.error(m(x.error as Msg, ar)); else { toast.success(tx(ar, "Contact added", "أُضيفت جهة الاتصال")); setQ(""); setRole(""); } }} data-deal-add-contact-save>{tx(ar, "Add", "إضافة")}</button>
  </div>;
}

/** D-02: a stage that needs more asks for it — value and close date right here, the rest with a jump to its card. */
function GateDialog({ d, gate, user, ar, onClose, onJump }: { d: Doc; gate: { to: string; missing: StageNeed[] }; user: string; ar: boolean; onClose: () => void; onJump: (k: StageNeed) => void }) {
  const [value, setValue] = useState(String(Number(d["deal_value"] ?? 0) || "")); const [close, setClose] = useState(s(d["expected_closure_date"]));
  const [err, setErr] = useState<string | null>(null);
  const inline = gate.missing.filter((n) => n === "value" || n === "close_date"), other = gate.missing.filter((n) => n !== "value" && n !== "close_date");
  const jumpLabel: Partial<Record<StageNeed, [string, string]>> = { products: ["Add products", "إضافة المنتجات"], quote_sent: ["Go to the quotation", "الذهاب إلى عرض السعر"], decision_maker: ["Mark the decision maker", "تحديد صاحب القرار"], contact: ["Add a contact", "إضافة جهة اتصال"], next_step: ["Set the next step", "تحديد الخطوة التالية"] };
  const run = () => { const x = moveDealGated(d.name, gate.to, user, { ...(inline.includes("value") ? { value: Number(value) } : {}), ...(inline.includes("close_date") ? { close } : {}) }); if (!x.ok) { setErr(m(x.error, ar)); return; } toast.success(tx(ar, `Moved to ${gate.to}`, `نُقلت إلى ${stageLabelOf(gate.to, true)}`)); onClose(); };
  return <EntDialog open onOpenChange={(o) => { if (!o) onClose(); }} size="md" tone="warn" id="deal-gate" title={tx(ar, `Before ${gate.to}`, `قبل الانتقال إلى «${stageLabelOf(gate.to, true)}»`)} kicker={tx(ar, "Stage requirements come from the CRM settings", "متطلبات المرحلة من إعدادات العملاء")}
    footer={<div className="flex w-full justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>{tx(ar, "Cancel", "إلغاء")}</button><button type="button" className="btn-primary" onClick={run} disabled={other.length > 0} title={other.length ? tx(ar, "Complete the items listed first", "أكمل البنود المذكورة أولًا") : undefined} data-gate-move>{tx(ar, "Move", "نقل")}</button></div>}>
    <div className="grid gap-3 text-sm" data-gate={gate.missing.join(",")}>
      {inline.includes("value") && <label className="grid gap-1">{needLabel("value", ar)} (⃁) *<input className="field-input min-h-9" type="number" min={1} dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} data-gate-value /></label>}
      {inline.includes("close_date") && <label className="grid gap-1">{needLabel("close_date", ar)} *<DateInput className="field-input min-h-9" dir="ltr" value={close} onChange={(e) => setClose(e.target.value)} data-gate-close /></label>}
      {other.length > 0 && <ul className="grid gap-1.5">{other.map((n) => <li key={n} className="flex items-center gap-2 rounded-md border border-[var(--line)] p-2" data-gate-need={n}><span className="text-[var(--negative)]" aria-hidden>✕</span><span className="flex-1">{needLabel(n, ar)}</span><button type="button" className="ek-rl-link" onClick={() => onJump(n)}>{jumpLabel[n]?.[ar ? 1 : 0] ?? tx(ar, "Open", "فتح")}</button></li>)}</ul>}
      {err && <p className="ek-ff-err" role="alert" data-gate-err>{err}</p>}
    </div>
  </EntDialog>;
}

function LoseDialog({ name, user, ar, onClose }: { name: string; user: string; ar: boolean; onClose: () => void }) {
  const [reason, setReason] = useState(""); const [comp, setComp] = useState(""); const [none, setNone] = useState(false); const [notes, setNotes] = useState(""); const [err, setErr] = useState<string | null>(null);
  const run = () => { const x = moveDealGated(name, lostStage(), user, {}, { reason, competitor: none ? "None" : comp, notes }); if (!x.ok) { setErr(m(x.error, ar)); return; } toast.success(tx(ar, "Marked as lost", "سُجّلت كخسارة")); onClose(); };
  return <EntDialog open onOpenChange={(o) => { if (!o) onClose(); }} size="sm" tone="warn" id="deal-lose" title={tx(ar, "Mark the deal as lost", "تسجيل الصفقة كخسارة")} kicker={tx(ar, "Reason and competitor are required", "السبب والمنافس مطلوبان")}
    footer={<div className="flex w-full justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>{tx(ar, "Cancel", "إلغاء")}</button><button type="button" className="btn-primary" onClick={run} data-lose-save>{tx(ar, "Save", "حفظ")}</button></div>}>
    <div className="grid gap-2 text-sm">
      <label className="grid gap-1">{tx(ar, "Loss reason", "سبب الخسارة")} *<select className="field-input min-h-9" value={reason} onChange={(e) => setReason(e.target.value)} data-lose-reason><option value="">—</option>{lostReasons().map((r) => <option key={r} value={r}>{ar ? LOST_AR[r] ?? r : r}</option>)}</select></label>
      <label className="grid gap-1">{tx(ar, "Competitor", "المنافس")} *<input className="field-input min-h-9" list="deal-competitors" value={comp} disabled={none} onChange={(e) => setComp(e.target.value)} data-lose-competitor /><datalist id="deal-competitors">{competitorsSeen().map((c) => <option key={c} value={c} />)}</datalist></label>
      <label className="inline-flex items-center gap-2"><input type="checkbox" checked={none} onChange={(e) => setNone(e.target.checked)} data-lose-none /> {tx(ar, "No competitor involved", "لا يوجد منافس")}</label>
      <label className="grid gap-1">{tx(ar, "Notes", "ملاحظات")}<textarea className="field-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {err && <p className="ek-ff-err" role="alert" data-lose-err>{err}</p>}
    </div>
  </EntDialog>;
}

function MergeDealDialog({ d, user, ar, onClose }: { d: Doc; user: string; ar: boolean; onClose: () => void }) {
  const [pick, setPick] = useState("");
  const others = scopedDeals(user).filter((x) => x.name !== d.name && (!d["organization"] || x["organization"] === d["organization"]));
  return <EntDialog open onOpenChange={(o) => { if (!o) onClose(); }} size="md" id="deal-merge" title={tx(ar, "Merge another deal into this one", "دمج صفقة أخرى في هذه الصفقة")} kicker={tx(ar, "Same company only; a deal with quotations or a customer is kept.", "من نفس الشركة فقط؛ الصفقة التي لها عروض أسعار أو عميل لا تُحذف.")}
    footer={<div className="flex w-full justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>{tx(ar, "Cancel", "إلغاء")}</button><button type="button" className="btn-primary" disabled={!pick} onClick={() => { const x = mergeDeals(d.name, pick, user); if (!x.ok) { toast.error(m(x.error, ar)); return; } toast.success(tx(ar, "Merged", "تم الدمج")); onClose(); }} data-deal-merge-run>{tx(ar, "Merge", "دمج")}</button></div>}>
    {others.length ? <ul className="grid gap-1.5 text-sm">{others.slice(0, 30).map((x) => <li key={x.name}><label className="flex items-center gap-2 rounded-md border border-[var(--line)] p-2"><input type="radio" name="deal-merge" checked={pick === x.name} onChange={() => setPick(x.name)} /><span className="min-w-0 flex-1"><b data-no-i18n>{dealTitle(x)}</b> <small className="ek-rl-sub" data-no-i18n>{x.name}</small></span><Pill tone="info">{stageLabelOf(s(x["status"]), ar)}</Pill></label></li>)}</ul> : <p className="text-sm text-muted-foreground">{tx(ar, "No other deal for this company.", "لا توجد صفقة أخرى لهذه الشركة.")}</p>}
  </EntDialog>;
}
