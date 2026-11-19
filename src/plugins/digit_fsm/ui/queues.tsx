import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * Work queues of DIGIT FSM + ITM — derived projections over canonical records (kit 03 screens such as N21 Due
 * obligations, N42 Technical review, N51 Closure review). A queue never stores anything: rows are permitted records
 * matching a rule, and every action calls a domain service (permission-checked, idempotent, hook-validated).
 * One registry serves the queue pages, the "My work" home sections and the field-execution "my" views.
 */
import { ReviewDesk } from "./review";
import { DefChain, chainIndex } from "./riskBits";
import { useState, type ReactNode } from "react";
import type { Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import type { PluginPageProps } from "@/plugins/pages";
import { by, inScope, list, raw, rows, titleOf, CLOSED_JOB, OPEN_VISIT } from "../domain/data";
import { addDays, dueDates, eligibility, isMissed, nowIso, OPEN_DEFICIENCY, runCoverage, s, today, type Row } from "../domain/rules";
import * as svc from "../domain/services";
import { screenById } from "../screens";
import { ActionButton, AppLink, BAND, BTN, DataTable, DocRef, INPUT, ListRef, NewDoc, NextCell, PageHeader, Panel, PersonRef, ReasonAction, SlaCell, StateChip, WorkflowButtons, dateTxt, dtTxt, money, numTxt, opt, useFx, useUrlState, type Col } from "./kit";
import { nextStep, slaOf } from "../domain/workState";
import { PageInsights } from "./ov/ded";
import { workPack } from "../domain/field";
import { jobBilling } from "../domain/billing";
import { BillAction, BillChip } from "./fieldMoney";

type Fx = ReturnType<typeof useFx>;
type R = Record<string, unknown> & { name?: string };
export interface QueueDef {
  key: string; screen?: string; title: string; title_ar: string; question: string; question_ar: string; basis: string; basis_ar: string;
  rows: (f: Record<string, string>) => R[]; cols: (fx: Fx) => Col<R>[]; actions?: (r: R, fx: Fx) => ReactNode;
  select?: { label: string; label_ar: string; run: (names: string[]) => svc.Result | Promise<svc.Result> };
  band?: (fx: Fx) => ReactNode; my?: boolean; note?: (fx: Fx) => ReactNode;
}

// ---------------------------------------------------------------- column helpers
const PEOPLE = new Set(["FSM Technician", "Employee", "Customer", "Contact"]);
// names, not codes: every reference shows the record's title; people carry the Enterprise avatar
const ref = (key: string, dt: string, label: string, label_ar: string, _title = true): ((fx: Fx) => Col<R>) => (fx) => ({ key, label: fx.t(label, label_ar), value: (r) => titleOf(dt, r[key]), render: (r) => (PEOPLE.has(dt) ? <PersonRef doctype={dt} name={r[key]} /> : <DocRef doctype={dt} name={r[key]} title />) });
const site = ref("site", "FSM Service Site", "Site", "الموقع", true);
const sys = ref("system", "FSM Service System", "System", "النظام", true);
const job = ref("job", "FSM Job", "Job", "أمر العمل");
const self = (dt: string, label = "Record", label_ar = "السجل"): ((fx: Fx) => Col<R>) => (fx) => ({ key: "name", label: fx.t(label, label_ar), value: (r) => titleOf(dt, r.name), render: (r) => <span className="inline-flex min-w-0 flex-col"><DocRef doctype={dt} name={r.name} title className="font-semibold text-primary hover:underline" /><small className="text-[11px] text-muted-foreground" data-no-i18n>{s(r.name)}</small></span> });
const state = (key: string, label: string, label_ar: string): ((fx: Fx) => Col<R>) => (fx) => ({ key, label: fx.t(label, label_ar), value: (r) => s(r[key]), render: (r) => <StateChip value={r[key]} /> });
const date = (key: string, label: string, label_ar: string, time = false): ((fx: Fx) => Col<R>) => (fx) => ({ key, label: fx.t(label, label_ar), value: (r) => s(r[key]), render: (r) => <span data-no-i18n>{time ? dtTxt(r[key]) : dateTxt(r[key])}</span> });
const text = (key: string, label: string, label_ar: string, translate = false): ((fx: Fx) => Col<R>) => (fx) => ({ key, label: fx.t(label, label_ar), value: (r) => s(r[key]), render: (r) => (translate ? <span>{opt(r[key], fx.ar) || "—"}</span> : <span data-no-i18n>{s(r[key]) || "—"}</span>) });
const num = (key: string, label: string, label_ar: string): ((fx: Fx) => Col<R>) => (fx) => ({ key, label: fx.t(label, label_ar), numeric: true, value: (r) => Number(r[key] ?? 0), render: (r) => <span data-no-i18n>{numTxt(r[key])}</span> });
const cols = (...c: ((fx: Fx) => Col<R>)[]) => (fx: Fx) => c.map((x) => x(fx));

/** Technician record of the session user (User link, else Employee.user_id); undefined for unlinked users. */
export function myTechnician(): Doc | undefined {
  const u = currentUser();
  return list("FSM Technician").find((t) => s(t["user"]) === u || (t["employee"] && s(raw("Employee", t["employee"])?.["user_id"]) === u));
}
/** Rows of the session user's technician; a user not linked to a technician (e.g. Administrator) sees all, and the page says so. */
const mine = (techField: string) => (r: Doc) => { const me = myTechnician(); return !me || s(r[techField]) === me.name; };

const visitsBy = () => by(list(VISIT_DT), "job");
const quoteRef = (q: unknown) => <DocRef doctype="Quotation" name={q} form />;

export const QUEUES: QueueDef[] = [
  // ---------------------------------------------------------------- home / governance
  { key: "exceptions", screen: "N04", title: "Data & integration exceptions", title_ar: "استثناءات البيانات والتكامل", question: "Which imports, hand-offs or syncs failed and need a decision?", question_ar: "ما عمليات الاستيراد أو التسليم أو المزامنة التي فشلت وتحتاج قراراً؟",
    basis: "Open FSM Integration Exception records. Resolving records a note; the underlying server action is still required.", basis_ar: "سجلات استثناءات التكامل المفتوحة. المعالجة تسجل ملاحظة؛ إجراء الخادم الأصلي يبقى مطلوباً.",
    rows: (f) => list("FSM Integration Exception").filter((e) => s(e["status"]) !== "Resolved" && inScope(e, f)),
    cols: cols(self("FSM Integration Exception"), text("source", "Source", "المصدر", true), text("reference_name", "Reference", "المرجع"), num("attempts", "Attempts", "المحاولات"), state("status", "Status", "الحالة"), text("error", "Error", "الخطأ")),
    actions: (r, fx) => <ReasonAction compact label={fx.t("Resolve", "معالجة")} placeholder={fx.t("Resolution note", "ملاحظة المعالجة")} run={(x) => svc.resolveException(s(r.name), x)} /> },
  // ---------------------------------------------------------------- portfolio
  { key: "site-contacts", screen: "N06", title: "Contacts & site access", title_ar: "جهات الاتصال والوصول للمواقع", question: "Who must we call to get into each site, and what does access require?", question_ar: "بمن نتصل للدخول إلى كل موقع، وما متطلبات الوصول؟",
    basis: "Site contact rows and access rules of each service site. Portal invitations need server-side site grants (N83).", basis_ar: "صفوف جهات اتصال المواقع وقواعد الوصول. دعوات البوابة تتطلب منح مواقع على الخادم (N83).",
    rows: (f) => list("FSM Service Site").filter((x) => inScope(x, f)).flatMap((st) => (rows(st, "contacts").length ? rows(st, "contacts") : [{}]).map((c, i) => ({ name: `${st.name}-${i}`, site: st.name, contact: c["contact"] ?? "", role: c["contact_role"] ?? "", phone: c["phone"] ?? "", escort: st["requires_escort"] ? 1 : 0, permit: st["requires_permit"] ? 1 : 0, window: st["service_window"] ?? "" }))),
    cols: cols(site, ref("contact", "Contact", "Contact", "جهة الاتصال"), text("role", "Role", "الدور", true), text("phone", "Phone", "الهاتف"), text("window", "Service window", "نافذة الخدمة"), (fx) => ({ key: "escort", label: fx.t("Escort / permit", "مرافق / تصريح"), render: (r) => <span>{[r["escort"] ? fx.t("Escort", "مرافق") : "", r["permit"] ? fx.t("Permit", "تصريح") : ""].filter(Boolean).join(" · ") || "—"}</span> })) },
  { key: "asset-changes", screen: "N11", title: "Asset changes & reconciliation", title_ar: "تغييرات الأصول والمطابقة", question: "Which field-reported asset changes wait for approval before the inventory changes?", question_ar: "ما تغييرات الأصول المبلغ عنها ميدانياً التي تنتظر الاعتماد قبل تعديل الجرد؟",
    basis: "Proposed FSM Asset Change records. Approval moves / retires the device with an effective date; nothing merges silently.", basis_ar: "سجلات تغييرات الأصول المقترحة. الاعتماد ينقل الجهاز أو يخرجه بتاريخ سريان؛ لا دمج صامت.",
    rows: (f) => list("FSM Asset Change").filter((x) => inScope(x, f)).sort((a, b) => (s(a["status"]) === "Proposed" ? -1 : 1) - (s(b["status"]) === "Proposed" ? -1 : 1)),
    cols: cols(self("FSM Asset Change"), ref("device", "FSM Device", "Device", "الجهاز", true), text("change_type", "Change", "التغيير", true), date("effective_date", "Effective", "السريان"), ref("new_location", "FSM Location Node", "New location", "المكان الجديد", true), state("status", "Review", "المراجعة")),
    actions: (r, fx) => s(r["status"]) === "Proposed" ? <><ActionButton compact label={fx.t("Approve", "اعتماد")} run={() => svc.approveAssetChange(s(r.name), true)} /><ActionButton compact label={fx.t("Reject", "رفض")} run={() => svc.approveAssetChange(s(r.name), false)} /></> : null },
  // ---------------------------------------------------------------- intake & commercial
  { key: "requests", screen: "N13", title: "Service requests", title_ar: "طلبات الخدمة", question: "Which service requests are open, and which still need a job?", question_ar: "ما طلبات الخدمة المفتوحة، وأيها ما زال يحتاج أمر عمل؟",
    basis: "Native Issue records (support desk) with an FSM service site. Creating a job links both ways and never duplicates.", basis_ar: "سجلات بلاغات الدعم الأصلية المرتبطة بموقع خدمة. إنشاء أمر العمل يربط الطرفين ولا يكرر.",
    rows: (f) => list("Issue").filter((i) => !!i["digit_fsm_site"] && !["Closed", "Resolved"].includes(s(i["status"])) && (!f["site"] || s(i["digit_fsm_site"]) === f["site"])).map((i) => ({ ...i, site: i["digit_fsm_site"] })),
    cols: cols((fx) => ({ key: "name", label: fx.t("Request", "الطلب"), value: (r) => s(r["subject"]) || s(r.name), render: (r) => <span className="inline-flex min-w-0 flex-col"><DocRef doctype="Issue" name={r.name} form className="font-semibold text-primary hover:underline"><span data-no-i18n>{s(r["subject"]) || s(r.name)}</span></DocRef><small className="text-[11px] text-muted-foreground" data-no-i18n>{s(r.name)}</small></span> }), site, text("priority", "Priority", "الأولوية", true), date("opening_date", "Opened", "الفتح"), state("status", "Status", "الحالة"), ref("digit_fsm_job", "FSM Job", "Job", "أمر العمل")),
    actions: (r, fx) => !r["digit_fsm_job"] ? <ActionButton compact label={fx.t("Create job", "إنشاء أمر عمل")} disabled={!r["digit_fsm_site"]} reason={fx.t("Set the service site on the request first", "حدد موقع الخدمة في الطلب أولاً")} run={() => svc.jobFromRequest(s(r.name))} /> : null,
    band: (fx) => <NewDoc doctype="Issue" band label={fx.t("New service request", "طلب خدمة جديد")} /> },
  { key: "decisions", screen: "N16", title: "Customer decisions", title_ar: "قرارات العملاء", question: "Which quoted findings wait for the customer's decision?", question_ar: "ما الملاحظات المسعّرة التي تنتظر قرار العميل؟",
    basis: "Findings in state Quoted with their native quotation. Each finding is decided on its own line, so partial approval stays visible; acceptance never closes the finding.", basis_ar: "الملاحظات المسعّرة مع عرض السعر الأصلي. كل ملاحظة يُقرر سطرها منفرداً فيبقى القبول الجزئي ظاهراً؛ القبول لا يغلق الملاحظة.",
    rows: (f) => list("FSM Deficiency").filter((d) => s(d["workflow_state"]) === "Quoted" && inScope(d, f)),
    cols: cols(self("FSM Deficiency", "Finding", "الملاحظة"), text("title", "Finding", "الوصف"), site, text("severity", "Severity", "الخطورة", true), (fx) => ({ key: "quotation", label: fx.t("Quotation", "عرض السعر"), value: (r) => s(r["quotation"]), render: (r) => quoteRef(r["quotation"]) }), (fx) => ({ key: "amount", label: fx.t("Quoted", "المسعّر"), numeric: true, value: (r) => Number(raw("Quotation", r["quotation"])?.["grand_total"] ?? 0), render: (r) => <span data-no-i18n>{money(raw("Quotation", r["quotation"])?.["grand_total"])}</span> })),
    actions: (r, fx) => <><ActionButton compact label={fx.t("Accept", "قبول")} run={() => svc.recordDecision(s(r.name), "Accepted")} /><ActionButton compact label={fx.t("Decline", "رفض")} run={() => svc.recordDecision(s(r.name), "Declined")} /><ActionButton compact label={fx.t("Revise quote", "مراجعة العرض")} run={() => svc.reviseQuotation(s(r["quotation"]))} /></> },
  { key: "to-quote", screen: "N17", title: "Findings to quote", title_ar: "ملاحظات للتسعير", question: "Which open findings still need a price, grouped by site?", question_ar: "ما الملاحظات المفتوحة التي ما زالت تحتاج سعراً، مجمعة حسب الموقع؟",
    basis: "Open findings without a quotation. Select findings of ONE site to draft one native Quotation; each line carries the finding (Quotation Item › FSM Deficiency).", basis_ar: "الملاحظات المفتوحة بلا عرض سعر. اختر ملاحظات موقع واحد لإنشاء عرض سعر أصلي واحد؛ كل سطر يحمل الملاحظة.",
    rows: (f) => list("FSM Deficiency").filter((d) => s(d["workflow_state"]) === "Open" && !d["quotation"] && inScope(d, f)).sort((a, b) => s(a["site"]).localeCompare(s(b["site"]))),
    cols: cols(self("FSM Deficiency", "Finding", "الملاحظة"), text("title", "Finding", "الوصف"), site, sys, text("severity", "Severity", "الخطورة", true), date("opened_on", "Opened", "الفتح")),
    select: { label: "Draft quotation for selected", label_ar: "إنشاء عرض سعر للمحدد", run: (names) => svc.quoteDeficiencies(names, 0, "FSM-SVC-REPAIR") } },
  // ---------------------------------------------------------------- agreements & PM
  { key: "coverage", screen: "N19", title: "Coverage & service profiles", title_ar: "التغطية وملفات الخدمة", question: "What does each agreement cover, how often, and with which template?", question_ar: "ماذا تغطي كل اتفاقية، وبأي تكرار، وبأي قالب؟",
    basis: "Coverage lines of every agreement (one row per line). Overlap = the same system covered by two active agreements.", basis_ar: "بنود تغطية كل اتفاقية (صف لكل بند). التداخل = النظام نفسه مغطى باتفاقيتين نشطتين.",
    rows: (f) => { const all = list("FSM Service Agreement").filter((a) => inScope(a, f)); const active = all.filter((a) => s(a["workflow_state"]) === "Active"); const cnt = new Map<string, number>(); for (const a of active) for (const c of rows(a, "coverage")) cnt.set(s(c["system"]), (cnt.get(s(c["system"])) ?? 0) + 1);
      return all.flatMap((a) => rows(a, "coverage").map((c, i) => ({ name: `${a.name}-${i}`, agreement: a.name, state: a["workflow_state"], site: a["site"], system: c["system"], service_type: c["service_type"], frequency: c["frequency"], window_days: c["window_days"], template: c["template"], overlap: (cnt.get(s(c["system"])) ?? 0) > 1 && s(a["workflow_state"]) === "Active" ? 1 : 0 }))); },
    cols: cols(ref("agreement", "FSM Service Agreement", "Agreement", "الاتفاقية"), state("state", "Agreement status", "حالة الاتفاقية"), site, sys, text("service_type", "Service", "الخدمة", true), text("frequency", "Frequency", "التكرار", true), num("window_days", "Window (days)", "النافذة (أيام)"), ref("template", "FSM Inspection Template", "Template", "القالب", true), (fx) => ({ key: "overlap", label: fx.t("Overlap", "تداخل"), render: (r) => (r["overlap"] ? <StateChip value="Disputed" /> : <span className="text-muted-foreground">—</span>) })) },
  { key: "recurrence", screen: "N20", title: "Recurrence policies", title_ar: "سياسات التكرار", question: "When will each coverage line fall due over the generation horizon?", question_ar: "متى تستحق كل خدمة مغطاة خلال أفق التوليد؟",
    basis: "Preview of the recurrence rule of each coverage line (frequency + window from the agreement start; first due = start + one period). Read-only — generation itself is idempotent (N23).", basis_ar: "معاينة قاعدة التكرار لكل بند (التكرار + النافذة من بداية الاتفاقية؛ أول استحقاق = البداية + فترة). للقراءة فقط — التوليد نفسه لا يكرر (N23).",
    rows: (f) => list("FSM Service Agreement").filter((a) => inScope(a, f)).flatMap((a) => rows(a, "coverage").map((c, i) => { const d = dueDates(s(a["start_date"]), s(a["end_date"]), s(c["frequency"]), 12); return { name: `${a.name}-${i}`, agreement: a.name, system: c["system"], frequency: c["frequency"], window_days: c["window_days"], count: d.length, next: d.find((x) => x >= today()) ?? "", dates: d.join("  ") }; })),
    cols: cols(ref("agreement", "FSM Service Agreement", "Agreement", "الاتفاقية"), sys, text("frequency", "Frequency", "التكرار", true), num("window_days", "Window (days)", "النافذة (أيام)"), num("count", "Occurrences (12 months)", "مرات الاستحقاق (12 شهراً)"), date("next", "Next due", "الاستحقاق التالي"), text("dates", "Due dates", "تواريخ الاستحقاق")) },
  { key: "due", screen: "N21", title: "Due obligations", title_ar: "الالتزامات المستحقة", question: "Which obligations are due and not yet on a job?", question_ar: "ما الالتزامات المستحقة غير المدرجة في أمر عمل بعد؟",
    basis: "Obligations in status Due. Select obligations of ONE site to release one job; the bridge lets one job fulfil several obligations and one obligation be served by repeat visits.", basis_ar: "الالتزامات بحالة مستحق. اختر التزامات موقع واحد لإصدار أمر عمل واحد؛ الربط يسمح لأمر عمل واحد بتنفيذ عدة التزامات.",
    rows: (f) => list("FSM Obligation").filter((o) => s(o["status"]) === "Due" && inScope(o, f)).sort((a, b) => s(a["due_date"]).localeCompare(s(b["due_date"]))),
    cols: cols(self("FSM Obligation", "Obligation", "الالتزام"), ref("agreement", "FSM Service Agreement", "Agreement", "الاتفاقية"), site, sys, date("due_date", "Due", "الاستحقاق"), date("window_end", "Window end", "نهاية النافذة"), (fx) => ({ key: "late", label: fx.t("Window", "النافذة"), render: (r) => (isMissed(r) ? <StateChip value="Missed" /> : <StateChip value="Due" />) })),
    select: { label: "Release one job for selected", label_ar: "إصدار أمر عمل للمحدد", run: (names) => svc.createJobForObligations(names) },
    band: (fx) => <ActionButton band label={fx.t("Mark past-window obligations missed", "تعليم المتجاوز للنافذة كفائت")} run={() => svc.markMissed()} /> },
  { key: "overdue", screen: "N22", title: "Overdue & catch-up", title_ar: "المتأخر والاستدراك", question: "Which obligations are past their window, and how do we catch up?", question_ar: "ما الالتزامات التي تجاوزت نافذتها، وكيف نستدرك؟",
    basis: "Missed obligations and Due/Scheduled obligations whose window has ended. A missed obligation is never erased: catch up with a job, or waive it with a reason (FSM Manager).", basis_ar: "الالتزامات الفائتة والمستحقة التي انتهت نافذتها. الالتزام الفائت لا يُمحى: استدرك بأمر عمل أو أعفِ منه بسبب (مدير الخدمة).",
    rows: (f) => list("FSM Obligation").filter((o) => (s(o["status"]) === "Missed" || isMissed(o)) && inScope(o, f)).sort((a, b) => s(a["due_date"]).localeCompare(s(b["due_date"]))),
    cols: cols(self("FSM Obligation", "Obligation", "الالتزام"), site, sys, date("due_date", "Due", "الاستحقاق"), date("window_end", "Window end", "نهاية النافذة"), state("status", "Status", "الحالة"), ref("fulfilled_by", "FSM Job", "Job", "أمر العمل")),
    actions: (r, fx) => <>{["Due", "Missed"].includes(s(r["status"])) && <ActionButton compact label={fx.t("Catch-up job", "أمر استدراك")} run={() => svc.createJobForObligations([s(r.name)])} />}<ReasonAction compact label={fx.t("Waive", "إعفاء")} placeholder={fx.t("Waiver reason", "سبب الإعفاء")} run={(x) => svc.waiveObligation(s(r.name), x)} /></> },
  { key: "renewals", screen: "N24", title: "Renewals", title_ar: "التجديدات", question: "Which agreements end within 120 days, and is a renewal case open?", question_ar: "ما الاتفاقيات التي تنتهي خلال 120 يوماً، وهل فُتحت حالة تجديد؟",
    basis: "Active agreements by end date with their renewal case (FSM Renewal Case).", basis_ar: "الاتفاقيات النشطة حسب تاريخ الانتهاء مع حالة التجديد.",
    rows: (f) => { const ren = by(list("FSM Renewal Case"), "agreement"); return list("FSM Service Agreement").filter((a) => s(a["workflow_state"]) === "Active" && s(a["end_date"]) <= addDays(today(), 120) && inScope(a, f)).map((a) => ({ ...a, renewal: (ren.get(a.name) ?? [])[0]?.name ?? "", renewal_status: (ren.get(a.name) ?? [])[0]?.["status"] ?? "" })); },
    cols: cols(self("FSM Service Agreement", "Agreement", "الاتفاقية"), text("agreement_title", "Title", "العنوان"), ref("customer", "Customer", "Customer", "العميل", true), date("end_date", "Ends", "النهاية"), (fx) => ({ key: "annual_value", label: fx.t("Annual value", "القيمة السنوية"), numeric: true, value: (r) => Number(r["annual_value"] ?? 0), render: (r) => <span data-no-i18n>{money(r["annual_value"])}</span> }), ref("renewal", "FSM Renewal Case", "Renewal", "التجديد"), state("renewal_status", "Renewal status", "حالة التجديد")),
    actions: (r, fx) => !r["renewal"] ? <ActionButton compact label={fx.t("Open renewal", "فتح تجديد")} run={() => svc.openRenewal(s(r.name))} /> : null },
  // ---------------------------------------------------------------- operations
  { key: "blocked", screen: "N27", title: "Blocked & incomplete work", title_ar: "الأعمال المتعطلة وغير المكتملة", question: "What is stuck — held jobs, blocked or partly accessed visits, incomplete inspections?", question_ar: "ما المتوقف — أوامر عمل موقوفة، زيارات متعطلة أو بوصول جزئي، فحوص غير مكتملة؟",
    basis: "Three separate record types listed side by side (never merged): jobs On Hold, open visits with a block or partial/no access, runs whose technical result is Incomplete.", basis_ar: "ثلاثة أنواع سجلات منفصلة (لا تُدمج): أوامر عمل موقوفة، زيارات بتعطّل أو وصول جزئي/معدوم، فحوص نتيجتها غير مكتملة.",
    rows: (f) => [
      ...list("FSM Job").filter((j) => s(j["workflow_state"]) === "On Hold" && inScope(j, f)).map((j) => ({ name: j.name, kind: "FSM Job", site: j["site"], status: j["workflow_state"], reason: j["hold_reason"], note: j["job_title"] })),
      ...list(VISIT_DT).filter((v) => !["Completed", "Cancelled"].includes(s(v["workflow_state"])) && (s(v["block_reason"]) && s(v["block_reason"]) !== "None" || ["Partial Access", "No Access"].includes(s(v["access_outcome"]))) && inScope(v, f)).map((v) => ({ name: v.name, kind: VISIT_DT, site: v["site"], status: v["workflow_state"], reason: s(v["block_reason"]) !== "None" ? v["block_reason"] : v["access_outcome"], note: v["handover_note"] })),
      ...list("FSM Inspection Run").filter((r) => s(r["technical_result"]) === "Incomplete" && inScope(r, f)).map((r) => ({ name: r.name, kind: "FSM Inspection Run", site: r["site"], status: r["workflow_state"], reason: "Incomplete", note: titleOf("FSM Service System", r["system"]) })),
    ],
    cols: cols((fx) => ({ key: "name", label: fx.t("Record", "السجل"), value: (r) => s(r.name), render: (r) => <DocRef doctype={s(r["kind"])} name={r.name} /> }), (fx) => ({ key: "kind", label: fx.t("Type", "النوع"), value: (r) => s(r["kind"]), render: (r) => <span>{fx.ar ? ({ "FSM Job": "أمر عمل", [VISIT_DT]: "زيارة", "FSM Inspection Run": "تشغيل فحص" } as Record<string, string>)[s(r["kind"])] : s(r["kind"]).replace("FSM ", "")}</span> }), site, state("status", "Status", "الحالة"), text("reason", "Reason", "السبب", true), text("note", "Note", "ملاحظة")) },
  { key: "multiday", screen: "N28", title: "Multi-day plans & handovers", title_ar: "الخطط متعددة الأيام والتسليم", question: "Which jobs span several visits or days, and what was handed over between them?", question_ar: "ما أوامر العمل الممتدة عبر عدة زيارات أو أيام، وما الذي سُلِّم بينها؟",
    basis: "Open or recent jobs with more than one visit or more than one planned day; crew-hours and elapsed days are shown separately.", basis_ar: "أوامر العمل ذات أكثر من زيارة أو أكثر من يوم مخطط؛ ساعات الطاقم والأيام المنقضية تُعرض منفصلة.",
    rows: (f) => { const vb = visitsBy(); const bk = by(list("FSM Booking").filter((b) => s(b["status"]) !== "Cancelled"), "visit");
      return list("FSM Job").filter((j) => inScope(j, f) && ((vb.get(j.name) ?? []).length > 1 || Number(j["planned_days"] ?? 1) > 1)).map((j) => { const vs = vb.get(j.name) ?? []; const starts = vs.map((v) => s(v["scheduled_start"])).filter(Boolean).sort();
        return { name: j.name, site: j["site"], status: j["workflow_state"], planned_days: j["planned_days"], visits: vs.length, crew_h: Math.round(vs.reduce((h, v) => h + (bk.get(v.name) ?? []).reduce((x, b) => x + (Date.parse(s(b["booking_end"]).replace(" ", "T")) - Date.parse(s(b["booking_start"]).replace(" ", "T"))) / 3600000, 0), 0) * 10) / 10, span: starts.length ? `${starts[0]!.slice(0, 10)} → ${starts[starts.length - 1]!.slice(0, 10)}` : "", handover: vs.map((v) => s(v["handover_note"])).filter(Boolean).join(" | ") }; }); },
    cols: cols(self("FSM Job", "Job", "أمر العمل"), site, state("status", "Status", "الحالة"), num("planned_days", "Planned days", "الأيام المخططة"), num("visits", "Visits", "الزيارات"), num("crew_h", "Crew-hours", "ساعات الطاقم"), text("span", "Elapsed", "المدة"), text("handover", "Handover notes", "ملاحظات التسليم")) },
  { key: "readiness", screen: "N30", title: "Completion & billing readiness", title_ar: "جاهزية الإكمال والفوترة", question: "Which completed jobs can be closed and charged — and what is still missing?", question_ar: "ما أوامر العمل المكتملة القابلة للإغلاق والتحصيل — وما الناقص؟",
    basis: "Completed jobs with their checks: inspections reviewed, obligations fulfilled (only from reviewed runs), charge proposal. Each action is a separate, idempotent step.", basis_ar: "أوامر العمل المكتملة مع فحوصها: المراجعة الفنية، تنفيذ الالتزامات (من الفحوص المراجَعة فقط)، مقترح التحصيل. كل إجراء خطوة مستقلة لا تتكرر.",
    rows: (f) => { const runs = by(list("FSM Inspection Run"), "job"); const ch = by(list("FSM Charge Proposal"), "job");
      return list("FSM Job").filter((j) => s(j["workflow_state"]) === "Completed" && inScope(j, f)).map((j) => { const rs = runs.get(j.name) ?? []; const bridge = rows(j, "obligations");
        return { name: j.name, site: j["site"], job_type: j["job_type"], runs: rs.length, unreviewed: rs.filter((r) => !["Reviewed", "Published"].includes(s(r["workflow_state"]))).length, obligations: bridge.length, pending: bridge.filter((b) => s(b["outcome"]) !== "Fulfilled").length, charge: (ch.get(j.name) ?? [])[0]?.name ?? "" }; }); },
    cols: cols(self("FSM Job", "Job", "أمر العمل"), site, text("job_type", "Type", "النوع", true), num("runs", "Runs", "الفحوص"), num("unreviewed", "Not reviewed", "غير مراجَع"), num("obligations", "Obligations", "الالتزامات"), num("pending", "Not fulfilled", "غير منفّذ"), ref("charge", "FSM Charge Proposal", "Charge", "التحصيل")),
    actions: (r, fx) => <>{Number(r["pending"]) > 0 && <ActionButton compact label={fx.t("Fulfil obligations", "تنفيذ الالتزامات")} run={() => svc.fulfilFromJob(s(r.name))} />}{!r["charge"] && <ActionButton compact label={fx.t("Propose charge", "اقتراح التحصيل")} run={() => svc.proposeCharge(s(r.name))} />}<ActionButton compact label={fx.t("Close job", "إغلاق أمر العمل")} run={() => svc.transition("FSM Job", s(r.name), "Close")} /></> },
  // ---------------------------------------------------------------- dispatch
  { key: "unscheduled", screen: "N32", title: "Unscheduled visits", title_ar: "الزيارات غير المجدولة", question: "Which visits have no technician or time yet?", question_ar: "ما الزيارات التي لا فني ولا موعد لها بعد؟",
    basis: "Visits in state Unscheduled, oldest job first. Book them on the dispatch board (eligibility and conflicts are checked there).", basis_ar: "الزيارات بحالة غير مجدولة، الأقدم أولاً. احجزها من لوحة الجدولة (تُفحص الأهلية والتعارضات هناك).",
    rows: (f) => list(VISIT_DT).filter((v) => s(v["workflow_state"]) === "Unscheduled" && inScope(v, f)).map((v) => ({ ...v, priority: raw("FSM Job", v["job"])?.["priority"], skill: svc.requiredSkill(v) })),
    cols: cols(self(VISIT_DT, "Visit", "الزيارة"), job, site, text("priority", "Priority", "الأولوية", true), text("visit_purpose", "Purpose", "الغرض", true), text("skill", "Skill needed", "المهارة المطلوبة", true), text("block_reason", "Block", "التعطّل", true)),
    actions: (r, fx) => <AppLink to={`dispatch?visit=${encodeURIComponent(s(r.name))}`} className={BTN.compact}>{fx.t("Plan on board", "جدولة في اللوحة")}</AppLink> },
  { key: "certifications", screen: "N35", title: "Skills & certifications", title_ar: "المهارات والشهادات", question: "Which technician certificates are valid, expiring or expired?", question_ar: "ما شهادات الفنيين السارية أو القريبة من الانتهاء أو المنتهية؟",
    basis: "Skill rows of every technician. Expired certificates block dispatch for that skill when the FSM setting is on.", basis_ar: "صفوف مهارات كل فني. الشهادة المنتهية تمنع الإرسال لتلك المهارة عند تفعيل الإعداد.",
    rows: () => list("FSM Technician").flatMap((t) => rows(t, "skills").map((k, i) => { const v = s(k["valid_until"]); const st = !v ? "Active" : v < today() ? "Expired" : v < addDays(today(), 60) ? "Expiring" : "Active"; return { name: `${t.name}-${i}`, technician: t.name, skill: k["skill"], certificate_no: k["certificate_no"], valid_until: v, cert_state: st }; })).sort((a, b) => (a.cert_state === "Expired" ? -1 : 1) - (b.cert_state === "Expired" ? -1 : 1)),
    cols: cols(ref("technician", "FSM Technician", "Technician", "الفني", true), text("skill", "Skill", "المهارة", true), text("certificate_no", "Certificate", "الشهادة"), date("valid_until", "Valid until", "صالحة حتى"), (fx) => ({ key: "cert_state", label: fx.t("Status", "الحالة"), value: (r) => s(r["cert_state"]), render: (r) => <StateChip value={r["cert_state"] === "Expiring" ? "Pending" : r["cert_state"]} /> })) },
  { key: "acks", screen: "N37", title: "Assignment acknowledgements", title_ar: "الإقرار بالتكليفات", question: "Which dispatched visits has the technician not acknowledged?", question_ar: "ما الزيارات المرسلة التي لم يقر بها الفني؟",
    basis: "Visits in state Dispatched without an acknowledgement time; escalate by calling the technician.", basis_ar: "الزيارات المرسلة بلا وقت إقرار؛ صعّد بالاتصال بالفني.",
    rows: (f) => list(VISIT_DT).filter((v) => s(v["workflow_state"]) === "Dispatched" && !v["acknowledged_on"] && inScope(v, f)),
    cols: cols(self(VISIT_DT, "Visit", "الزيارة"), job, site, ref("technician", "FSM Technician", "Technician", "الفني", true), date("scheduled_start", "Starts", "يبدأ", true), text("visit_purpose", "Purpose", "الغرض", true)),
    actions: (r, fx) => <ActionButton compact label={fx.t("Record acknowledgement", "تسجيل الإقرار")} run={() => svc.acknowledgeVisit(s(r.name))} /> },
  { key: "day-plan", screen: "N38", title: "Route plans (day sequence)", title_ar: "خطط المسارات (تسلسل اليوم)", question: "In what order will each technician reach their sites today and tomorrow?", question_ar: "بأي ترتيب سيصل كل فني إلى مواقعه اليوم وغداً؟",
    basis: "Reserved bookings ordered by start time per technician. This is a sequence, not an optimised route — travel optimisation is not claimed.", basis_ar: "الحجوزات المؤكدة مرتبة بوقت البداية لكل فني. هذا تسلسل وليس مساراً محسّناً — لا ندّعي تحسين التنقل.",
    rows: () => { const from = today(), to = addDays(today(), 1); return list("FSM Booking").filter((b) => s(b["status"]) !== "Cancelled" && s(b["booking_start"]).slice(0, 10) >= from && s(b["booking_start"]).slice(0, 10) <= to).sort((a, b) => s(a["technician"]).localeCompare(s(b["technician"])) || s(a["booking_start"]).localeCompare(s(b["booking_start"]))).map((b, i, all) => ({ ...b, seq: all.slice(0, i + 1).filter((x) => s(x["technician"]) === s(b["technician"]) && s(x["booking_start"]).slice(0, 10) === s(b["booking_start"]).slice(0, 10)).length, city: s(raw("FSM Service Site", b["site"])?.["city"]) })); },
    cols: cols(ref("technician", "FSM Technician", "Technician", "الفني", true), num("seq", "Stop", "المحطة"), date("booking_start", "Start", "البداية", true), date("booking_end", "End", "النهاية", true), ref("visit", VISIT_DT, "Visit", "الزيارة"), site, text("city", "City", "المدينة")) },
  // ---------------------------------------------------------------- ITM
  { key: "review", screen: "N42", title: "Technical review", title_ar: "المراجعة الفنية", question: "Which submitted inspection runs wait for a reviewer's decision?", question_ar: "ما تشغيلات الفحص المقدمة التي تنتظر قرار المراجع؟",
    basis: "Runs in state Submitted for Review. Approve the exact submitted results, or return them with a reason; results stay locked until returned.", basis_ar: "التشغيلات بحالة مقدّم للمراجعة. اعتمد النتائج المقدمة كما هي أو أعدها بسبب؛ النتائج مقفلة حتى الإعادة.",
    rows: (f) => list("FSM Inspection Run").filter((r) => s(r["workflow_state"]) === "Submitted for Review" && inScope(r, f)).map((r) => { const c = runCoverage(rows(r, "results"), Number(r["expected_devices"]) || undefined); return { ...r, cov: c.coverage === null ? "" : Math.round(c.coverage * 100), fails: c.failChecks, inacc: c.inaccessibleDevices }; }),
    cols: cols(self("FSM Inspection Run", "Run", "التشغيل"), site, sys, state("technical_result", "Technical result", "النتيجة الفنية"), num("cov", "Coverage %", "التغطية %"), num("fails", "Failed checks", "بنود راسبة"), num("inacc", "Inaccessible devices", "أجهزة تعذر الوصول"), date("submitted_on", "Submitted", "التقديم", true), num("return_count", "Returned", "مرات الإعادة")),
    actions: (r, fx) => <><ActionButton compact label={fx.t("Approve review", "اعتماد المراجعة")} run={() => svc.transition("FSM Inspection Run", s(r.name), "Approve Review")} /><ReasonAction compact label={fx.t("Return", "إعادة")} placeholder={fx.t("What must be corrected?", "ما الذي يجب تصحيحه؟")} run={(x) => svc.returnRun(s(r.name), x)} /></> },
  { key: "evidence", screen: "N44", title: "Evidence library", title_ar: "مكتبة الأدلة", question: "Which photos and files are attached to FSM records, and which checks still need a photo?", question_ar: "ما الصور والملفات المرفقة بسجلات الخدمة، وما البنود التي ما زالت تحتاج صورة؟",
    basis: "Native File records attached to FSM documents, plus result rows whose template requires a photo. Restricted records hide their files.", basis_ar: "سجلات الملفات الأصلية المرفقة بمستندات الخدمة، وصفوف النتائج التي يتطلب قالبها صورة. السجلات المقيدة تخفي ملفاتها.",
    rows: () => [
      ...list("File").filter((x) => s(x["attached_to_doctype"]).startsWith("FSM ")).map((x) => ({ name: x.name, kind: "File", doctype: x["attached_to_doctype"], record: x["attached_to_name"], detail: x["file_name"] })),
      ...list("FSM Inspection Run").flatMap((r) => rows(r, "results").filter((x) => x["evidence_required"] && ["Pass", "Fail"].includes(s(x["outcome"]))).map((x) => ({ name: `${r.name}:${s(x["name"])}`, kind: "Photo required", doctype: "FSM Inspection Run", record: r.name, detail: `${s(x["check_code"])} ${titleOf("FSM Device", x["device"])}`, has: list("File").some((f) => s(f["attached_to_name"]) === r.name) ? 1 : 0 }))),
    ],
    cols: cols((fx) => ({ key: "kind", label: fx.t("Item", "العنصر"), value: (r) => s(r["kind"]), render: (r) => <span>{s(r["kind"]) === "File" ? fx.t("Attached file", "ملف مرفق") : fx.t("Photo required", "صورة مطلوبة")}</span> }), (fx) => ({ key: "record", label: fx.t("Record", "السجل"), value: (r) => s(r["record"]), render: (r) => <DocRef doctype={s(r["doctype"])} name={r["record"]} /> }), text("detail", "Detail", "التفاصيل"), (fx) => ({ key: "has", label: fx.t("Evidence on record", "دليل مرفق"), render: (r) => (s(r["kind"]) === "File" || r["has"] ? <StateChip value="Pass" /> : <StateChip value="Untested" />) })) },
  // ---------------------------------------------------------------- deficiencies & safety
  { key: "critical", screen: "N47", title: "Critical findings", title_ar: "الملاحظات الحرجة", question: "Which critical findings are still open, and what is the next step on each?", question_ar: "ما الملاحظات الحرجة التي ما زالت مفتوحة، وما الخطوة التالية لكل منها؟",
    basis: "Open findings classified Critical (duplicates excluded), oldest first.", basis_ar: "الملاحظات المفتوحة المصنفة حرجة (بدون المكرر)، الأقدم أولاً.",
    rows: (f) => list("FSM Deficiency").filter((d) => s(d["severity"]) === "Critical" && OPEN_DEFICIENCY.has(s(d["workflow_state"])) && inScope(d, f)).sort((a, b) => s(a["opened_on"]).localeCompare(s(b["opened_on"]))),
    cols: cols(self("FSM Deficiency", "Finding", "الملاحظة"), text("title", "Finding", "الوصف"), site, sys, date("opened_on", "Opened", "الفتح"), state("workflow_state", "Technical state", "الحالة الفنية"), state("commercial_decision", "Decision", "القرار")),
    actions: (r, fx) => <>{s(r["workflow_state"]) === "Open" && !r["quotation"] && <ActionButton compact label={fx.t("Draft quotation", "إنشاء عرض سعر")} run={() => svc.quoteDeficiencies([s(r.name)], 0, "FSM-SVC-REPAIR")} />}{r["system"] && <ActionButton compact label={fx.t("Record impairment", "تسجيل تعطّل")} run={() => svc.openImpairment(s(r["system"]), "Partial / Zone", s(r.name))} />}</> },
  { key: "impairments", screen: "N48", title: "System impairments", title_ar: "تعطّلات الأنظمة", question: "Which systems are out of service or impaired, and since when?", question_ar: "ما الأنظمة الخارجة عن الخدمة أو المتعطلة، ومنذ متى؟",
    basis: "Impairment intervals (active first). Restoring closes the interval and returns the system to service only when no other impairment is active.", basis_ar: "فترات التعطّل (القائمة أولاً). الإرجاع يغلق الفترة ويعيد النظام للخدمة فقط إن لم يوجد تعطّل آخر قائم.",
    rows: (f) => list("FSM Impairment").filter((i) => inScope(i, f)).sort((a, b) => (s(a["status"]) === "Active" ? -1 : 1) - (s(b["status"]) === "Active" ? -1 : 1)),
    cols: cols(self("FSM Impairment", "Impairment", "التعطّل"), sys, site, text("scope", "Scope", "النطاق", true), date("started_on", "Started", "البداية", true), date("restored_on", "Restored", "الإرجاع", true), state("status", "Status", "الحالة"), (fx) => ({ key: "fire_watch", label: fx.t("Fire watch", "حراسة حريق"), render: (r) => <span>{r["fire_watch"] ? fx.t("Yes", "نعم") : fx.t("No", "لا")}</span> })),
    actions: (r, fx) => s(r["status"]) === "Active" ? <ActionButton compact label={fx.t("Restore to service", "إعادة للخدمة")} run={() => svc.restoreImpairment(s(r.name))} /> : null,
    band: (fx) => <NewDoc doctype="FSM Impairment" band label={fx.t("New impairment", "تعطّل جديد")} defaults={{ status: "Active", started_on: nowIso() }} /> },
  { key: "corrective", screen: "N49", title: "Corrective work", title_ar: "الأعمال التصحيحية", question: "Which repair and corrective jobs are open, and are their visits planned?", question_ar: "ما أوامر الإصلاح والأعمال التصحيحية المفتوحة، وهل زياراتها مخططة؟",
    basis: "Open jobs of type Repair, Corrective or Emergency with their visit status. Completing a repair never closes the finding — that needs a reviewed passing retest.", basis_ar: "أوامر العمل المفتوحة من نوع إصلاح أو تصحيحي أو طارئ مع حالة زياراتها. إكمال الإصلاح لا يغلق الملاحظة — يلزم إعادة فحص ناجحة مراجَعة.",
    rows: (f) => { const vb = visitsBy(); return list("FSM Job").filter((j) => ["Repair", "Corrective", "Emergency"].includes(s(j["job_type"])) && !CLOSED_JOB.has(s(j["workflow_state"])) && inScope(j, f)).map((j) => ({ ...j, visits: (vb.get(j.name) ?? []).length, open_visits: (vb.get(j.name) ?? []).filter((v) => OPEN_VISIT.has(s(v["workflow_state"])) || s(v["workflow_state"]) === "Unscheduled").length })); },
    cols: cols(self("FSM Job", "Job", "أمر العمل"), text("job_title", "Title", "العنوان"), site, text("job_type", "Type", "النوع", true), text("priority", "Priority", "الأولوية", true), state("workflow_state", "Status", "الحالة"), ref("deficiency", "FSM Deficiency", "Finding", "الملاحظة"), num("visits", "Visits", "الزيارات")),
    actions: (r, fx) => <>{Number(r["visits"]) === 0 && <ActionButton compact label={fx.t("Create visit", "إنشاء زيارة")} run={() => svc.createVisit(s(r.name))} />}<WorkflowButtons doctype="FSM Job" doc={r as Doc} except={["Cancel Job"]} /></> },
  { key: "retests", screen: "N50", title: "Retest requirements", title_ar: "متطلبات إعادة الفحص", question: "Which repaired findings still need their verification retest?", question_ar: "ما الملاحظات المصلحة التي ما زالت تحتاج إعادة فحص للتحقق؟",
    basis: "Retest requirements not yet passed. A retest run covers only the failed check of the original device; its reviewed result sets the retest outcome.", basis_ar: "متطلبات إعادة الفحص غير الناجحة بعد. تشغيل إعادة الفحص يغطي البند الراسب للجهاز الأصلي فقط؛ نتيجته المراجَعة تحدد النتيجة.",
    rows: (f) => list("FSM Retest").filter((r) => s(r["status"]) !== "Passed" && inScope(r, f)),
    cols: cols(self("FSM Retest", "Retest", "إعادة الفحص"), ref("deficiency", "FSM Deficiency", "Finding", "الملاحظة"), site, ref("repair_job", "FSM Job", "Repair job", "أمر الإصلاح"), (fx) => ({ key: "repair_state", label: fx.t("Repair status", "حالة الإصلاح"), render: (r) => <StateChip value={raw("FSM Job", r["repair_job"])?.["workflow_state"]} /> }), date("due_date", "Due", "الاستحقاق"), state("status", "Retest status", "حالة إعادة الفحص"), ref("retest_run", "FSM Inspection Run", "Retest run", "تشغيل إعادة الفحص")),
    actions: (r, fx) => !r["retest_run"] || s(r["status"]) === "Failed" ? <ActionButton compact label={fx.t("Create retest run", "إنشاء تشغيل إعادة فحص")} run={() => svc.createRetestRun(s(r.name))} /> : <AppLink to={`run/${encodeURIComponent(s(r["retest_run"]))}`} className={BTN.compact}>{fx.t("Open run", "فتح التشغيل")}</AppLink> },
  { key: "closure", screen: "N51", title: "Closure review", title_ar: "مراجعة الإغلاق", question: "Which findings have a reviewed retest result and wait for closure or rework?", question_ar: "ما الملاحظات التي لها نتيجة إعادة فحص مراجَعة وتنتظر الإغلاق أو إعادة العمل؟",
    basis: "Findings in Retest Pending with their latest retest. Close only on a Passed retest; a Failed retest keeps the finding open for rework.", basis_ar: "الملاحظات بانتظار إعادة الفحص مع آخر إعادة فحص. تُغلق فقط عند النجاح؛ الرسوب يبقيها مفتوحة لإعادة العمل.",
    rows: (f) => { const rt = by(list("FSM Retest"), "deficiency"); return list("FSM Deficiency").filter((d) => s(d["workflow_state"]) === "Retest Pending" && inScope(d, f)).map((d) => { const r = (rt.get(d.name) ?? []).sort((a, b) => s(b["modified"]).localeCompare(s(a["modified"])))[0]; return { ...d, retest: r?.name ?? "", retest_status: r?.["status"] ?? "" }; }); },
    cols: cols(self("FSM Deficiency", "Finding", "الملاحظة"), text("title", "Finding", "الوصف"), site, ref("repair_job", "FSM Job", "Repair job", "أمر الإصلاح"), ref("retest", "FSM Retest", "Retest", "إعادة الفحص"), state("retest_status", "Retest status", "حالة إعادة الفحص")),
    actions: (r, fx) => <ActionButton compact label={fx.t("Verify & close", "تحقق وأغلق")} disabled={s(r["retest_status"]) !== "Passed"} reason={fx.t("Needs a passed, reviewed retest", "يتطلب إعادة فحص ناجحة مراجَعة")} run={() => svc.verifyClose(s(r.name))} /> },
  { key: "disputes", screen: "N52", title: "Disputes, duplicates & reopened findings", title_ar: "الاعتراضات والمكرر والمعاد فتحه", question: "Which findings are disputed, duplicated or were reopened after closure?", question_ar: "ما الملاحظات المعترض عليها أو المكررة أو المعاد فتحها بعد الإغلاق؟",
    basis: "Findings in Disputed or Duplicate state, plus any finding reopened at least once. Duplicates stay linked to the original and out of open counts.", basis_ar: "الملاحظات المعترض عليها أو المكررة، وأي ملاحظة أُعيد فتحها مرة على الأقل. المكررة تبقى مرتبطة بالأصل وخارج العدّ المفتوح.",
    rows: (f) => list("FSM Deficiency").filter((d) => (["Disputed", "Duplicate"].includes(s(d["workflow_state"])) || Number(d["reopen_count"] ?? 0) > 0) && inScope(d, f)),
    cols: cols(self("FSM Deficiency", "Finding", "الملاحظة"), text("title", "Finding", "الوصف"), site, state("workflow_state", "State", "الحالة"), ref("duplicate_of", "FSM Deficiency", "Duplicate of", "مكررة من"), num("reopen_count", "Reopened", "مرات إعادة الفتح"), text("observation", "Note", "ملاحظة")),
    actions: (r) => <WorkflowButtons doctype="FSM Deficiency" doc={r as Doc} /> },
  // ---------------------------------------------------------------- field execution (my views)
  { key: "my-visits", screen: "N53", my: true, title: "My visits", title_ar: "زياراتي", question: "Where am I going, and what do I do next on each visit?", question_ar: "إلى أين أذهب، وما خطوتي التالية في كل زيارة؟",
    basis: "Open visits where I am the lead technician (planned, dispatched or on site), soonest first.", basis_ar: "الزيارات المفتوحة التي أنا فنيها الرئيسي (مخططة أو مرسلة أو في الموقع)، الأقرب أولاً.",
    rows: (f) => list(VISIT_DT).filter((v) => OPEN_VISIT.has(s(v["workflow_state"])) && mine("technician")(v) && inScope(v, f)).sort((a, b) => s(a["scheduled_start"]).localeCompare(s(b["scheduled_start"]))),
    cols: cols(self(VISIT_DT, "Visit", "الزيارة"), job, site, date("scheduled_start", "Starts", "يبدأ", true), state("workflow_state", "Status", "الحالة"), state("access_outcome", "Access", "الوصول")),
    actions: (r, fx) => <>{s(r["workflow_state"]) === "Dispatched" && !r["acknowledged_on"] && <ActionButton compact label={fx.t("Acknowledge", "إقرار")} run={() => svc.acknowledgeVisit(s(r.name))} />}{s(r["workflow_state"]) === "On Site" && <AccessPicker visit={s(r.name)} />}<WorkflowButtons doctype={VISIT_DT} doc={r as Doc} except={["Cancel Visit", "Plan", "Dispatch"]} /></> },
  { key: "my-inspections", screen: "N54", my: true, title: "My inspections", title_ar: "فحوصاتي", question: "Which inspection runs must I record and submit?", question_ar: "ما تشغيلات الفحص التي يجب أن أسجلها وأقدمها؟",
    basis: "Draft / in-progress runs on visits where I am the lead technician, and runs returned to me with a reason.", basis_ar: "التشغيلات المسودة / قيد التنفيذ في زياراتي، والتشغيلات المعادة إلي بسبب.",
    rows: (f) => list("FSM Inspection Run").filter((r) => ["Draft", "In Progress"].includes(s(r["workflow_state"])) && inScope(r, f) && mine("technician")(raw(VISIT_DT, r["visit"]) ?? ({} as Doc))).map((r) => { const c = runCoverage(rows(r, "results"), Number(r["expected_devices"]) || undefined); return { ...r, untested: c.untestedChecks }; }),
    cols: cols(self("FSM Inspection Run", "Run", "التشغيل"), site, sys, state("workflow_state", "Status", "الحالة"), num("untested", "Untested checks", "بنود لم تُفحص"), text("return_reason", "Returned because", "سبب الإعادة")),
    actions: (r, fx) => <AppLink to={`run/${encodeURIComponent(s(r.name))}`} className={BTN.compact}>{fx.t("Record results", "تسجيل النتائج")}</AppLink> },
  { key: "my-repairs", screen: "N55", my: true, title: "My repairs & retests", title_ar: "إصلاحاتي وإعادات الفحص", question: "Which repairs and retests are assigned to me?", question_ar: "ما الإصلاحات وإعادات الفحص المسندة إلي؟",
    basis: "Open repair/corrective jobs with a visit where I am the lead technician, and retest runs on those jobs.", basis_ar: "أوامر الإصلاح المفتوحة التي لها زيارة أنا فنيها الرئيسي، وتشغيلات إعادة الفحص عليها.",
    rows: (f) => { const myVisits = list(VISIT_DT).filter((v) => mine("technician")(v)); const jobs = new Set(myVisits.map((v) => s(v["job"])));
      return list("FSM Job").filter((j) => ["Repair", "Corrective", "Emergency"].includes(s(j["job_type"])) && !CLOSED_JOB.has(s(j["workflow_state"])) && jobs.has(j.name) && inScope(j, f)).map((j) => ({ ...j, retest_run: list("FSM Inspection Run").find((r) => s(r["job"]) === j.name && r["retest_for"])?.name ?? "" })); },
    cols: cols(self("FSM Job", "Job", "أمر العمل"), text("job_title", "Title", "العنوان"), site, state("workflow_state", "Status", "الحالة"), ref("deficiency", "FSM Deficiency", "Finding", "الملاحظة"), ref("retest_run", "FSM Inspection Run", "Retest run", "تشغيل إعادة الفحص")),
    actions: (r) => <WorkflowButtons doctype="FSM Job" doc={r as Doc} except={["Cancel Job", "Schedule", "Close"]} /> },
  { key: "workpacks", screen: "N56", title: "Work-pack readiness", title_ar: "جاهزية حزمة العمل", question: "Is everything ready for each upcoming visit before the technician leaves?", question_ar: "هل كل شيء جاهز لكل زيارة قادمة قبل مغادرة الفني؟",
    basis: "Planned and dispatched visits checked on five cards: skills, certificate valid on the visit day, published template for each system, parts reserved for repairs, site access contact. «Fix» opens the record that closes the gap.", basis_ar: "الزيارات المخططة والمرسلة على خمس بطاقات: المهارات، الشهادة سارية يوم الزيارة، قالب منشور لكل نظام، القطع محجوزة للإصلاحات، جهة اتصال الوصول للموقع. «إصلاح» يفتح السجل الذي يسد النقص.",
    rows: (f) => list(VISIT_DT).filter((v) => ["Planned", "Dispatched"].includes(s(v["workflow_state"])) && inScope(v, f)).map((v) => {
      const w = workPack(v.name, s(v["scheduled_start"]).slice(0, 10) || today());
      return { ...v, ready: w.ready ? 1 : 0, missing: w.missing, issues: w.items.filter((x) => !x.ok).map((x) => x.label[0]).join(" · "), issues_ar: w.items.filter((x) => !x.ok).map((x) => x.label[1]).join(" · ") };
    }),
    cols: cols(self(VISIT_DT, "Visit", "الزيارة"), job, site, ref("technician", "FSM Technician", "Technician", "الفني", true), date("scheduled_start", "Starts", "يبدأ", true),
      (fx) => ({ key: "ready", label: fx.t("Readiness", "الجاهزية"), value: (r) => Number(r["missing"] ?? 0), render: (r) => <span className={`fsm-pack-chip`} data-pack-state={r["ready"] ? "ok" : "missing"}>{r["ready"] ? fx.t("Sound", "سليم") : fx.ar ? `ناقص ${s(r["missing"])}` : `${s(r["missing"])} missing`}</span> }),
      (fx) => ({ key: "issues", label: fx.t("Open points", "نقاط مفتوحة"), value: (r) => s(r["issues"]), render: (r) => <span className="text-xs">{s(fx.ar ? r["issues_ar"] : r["issues"]) || "—"}</span> })),
    actions: (r, fx) => <AppLink to={`field/visit/${encodeURIComponent(s(r.name))}`} className={BTN.compact}>{r["ready"] ? fx.t("Open visit", "فتح الزيارة") : fx.t("Fix", "إصلاح")}</AppLink> },
  { key: "my-time", screen: "N58", my: true, title: "My time & materials", title_ar: "وقتي وموادي", question: "Which timesheets and material requests are linked to my jobs?", question_ar: "ما سجلات الوقت وطلبات المواد المرتبطة بأوامر عملي؟",
    basis: "Native Timesheets and Material Requests whose FSM Job is one of my jobs. Posting stays native (submit in the native form).", basis_ar: "سجلات الوقت وطلبات المواد الأصلية المرتبطة بأوامر عملي. الترحيل يبقى أصلياً (الاعتماد من النموذج الأصلي).",
    rows: () => { const jobs = new Set(list(VISIT_DT).filter((v) => mine("technician")(v)).map((v) => s(v["job"])));
      return [...list("Timesheet").filter((t) => jobs.has(s(t["digit_fsm_job"]))).map((t) => ({ name: t.name, doctype: "Timesheet", job: t["digit_fsm_job"], detail: `${numTxt(t["total_hours"], 1)} h`, status: Number(t["docstatus"]) === 1 ? "Submitted" : "Draft" })),
        ...list("Material Request").filter((m) => jobs.has(s(m["digit_fsm_job"]))).map((m) => ({ name: m.name, doctype: "Material Request", job: m["digit_fsm_job"], detail: rows(m, "items").map((i) => `${s(i["item_code"])} × ${s(i["qty"])}`).join(", "), status: Number(m["docstatus"]) === 1 ? "Submitted" : "Draft" }))]; },
    cols: cols((fx) => ({ key: "name", label: fx.t("Document", "المستند"), value: (r) => s(r.name), render: (r) => <DocRef doctype={s(r["doctype"])} name={r.name} form /> }), text("doctype", "Type", "النوع"), job, text("detail", "Detail", "التفاصيل"), state("status", "Status", "الحالة")) },
  // ---------------------------------------------------------------- commercial control
  { key: "invoice-ready", screen: "N67", title: "Invoice-ready work", title_ar: "أعمال جاهزة للفوترة", question: "Which approved chargeable work can be handed to finance?", question_ar: "ما الأعمال المعتمدة القابلة للتحصيل الجاهزة للتسليم للمالية؟",
    basis: "Charge proposals not covered, with the billing equation of the job (approved labour + parts used + charges − covered by agreement). «Create draft invoice» makes one native draft Sales Invoice per proposal; a second click says it already exists. Finance posts it from the invoice form.", basis_ar: "مقترحات التحصيل غير المغطاة مع معادلة الفوترة لأمر العمل (العمالة المعتمدة + القطع المستخدمة + الرسوم − المغطى بالاتفاقية). «إنشاء مسودة الفاتورة» ينشئ مسودة فاتورة مبيعات أصلية واحدة لكل مقترح؛ الضغطة الثانية تقول إنها موجودة مسبقاً. المالية ترحّلها من نموذج الفاتورة.",
    rows: (f) => list("FSM Charge Proposal").filter((c) => ["Proposed", "Approved", "Error"].includes(s(c["status"])) && s(c["coverage_decision"]) !== "Covered" && inScope(c, f)).map((c) => { const b = jobBilling(s(c["job"])); return { ...c, eq_net: b.net, eq_gross: b.gross, bill_state: b.state, bill_blockers: b.blockers.map((x) => x[0]).join(" · "), bill_blockers_ar: b.blockers.map((x) => x[1]).join(" · ") }; }),
    cols: cols(self("FSM Charge Proposal", "Proposal", "المقترح"), job, ref("customer", "Customer", "Customer", "العميل", true), text("coverage_decision", "Coverage", "التغطية", true), (fx) => ({ key: "amount", label: fx.t("Proposed", "المقترح"), numeric: true, money: true, value: (r) => Number(r["amount"] ?? 0), render: (r) => <span data-no-i18n>{money(r["amount"])}</span> }),
      (fx) => ({ key: "eq_gross", label: fx.t("Equation incl. VAT", "المعادلة شاملة الضريبة"), numeric: true, money: true, value: (r) => Number(r["eq_gross"] ?? 0), render: (r) => <span data-no-i18n>{money(r["eq_gross"])}</span> }),
      (fx) => ({ key: "bill_state", label: fx.t("Billing", "الفوترة"), value: (r) => s(r["bill_state"]), render: (r) => <BillChip b={jobBilling(s(r["job"]))} ar={fx.ar} /> }), state("status", "Status", "الحالة")),
    actions: (r, fx) => <BillAction b={jobBilling(s(r["job"]))} t={fx.t} compact /> },
  { key: "handoffs", screen: "N68", title: "Financial hand-offs", title_ar: "التسليمات المالية", question: "Which charges reached finance as a draft invoice, which are posted, and which hand-off failed?", question_ar: "ما التحصيلات التي وصلت للمالية كمسودة فاتورة، وما المرحّل، وما التسليم الذي تعثر؟",
    basis: "Handed-off charge proposals with their native Sales Invoice (draft until finance posts it), and any earlier Finance Handoff exception still open. Retry is idempotent.", basis_ar: "مقترحات التحصيل المسلّمة مع فاتورة المبيعات الأصلية (مسودة حتى ترحّلها المالية)، وأي استثناء تسليم مالي سابق ما زال مفتوحاً. إعادة المحاولة لا تكرر.",
    rows: (f) => [
      ...list("FSM Charge Proposal").filter((c) => s(c["status"]) === "Handed Off" && inScope(c, f)).map((c) => { const si = raw("Sales Invoice", c["sales_invoice"]); return { name: c.name, kind: "Proposal", doctype: "FSM Charge Proposal", job: c["job"], customer: c["customer"], sales_invoice: s(c["sales_invoice"]), amount: Number(si?.["grand_total"] ?? c["amount"] ?? 0), status: !si ? "Error" : Number(si["docstatus"]) === 1 ? "Submitted" : Number(si["docstatus"]) === 2 ? "Cancelled" : "Draft", attempts: "", error: "" }; }),
      ...list("FSM Integration Exception").filter((e) => s(e["source"]) === "Finance Handoff" && s(e["status"]) !== "Resolved" && inScope(e, f)).map((e) => { const c = raw("FSM Charge Proposal", e["reference_name"]); return { name: e.name, kind: "Exception", doctype: "FSM Integration Exception", proposal: s(e["reference_name"]), job: c?.["job"], customer: c?.["customer"], sales_invoice: "", amount: Number(c?.["amount"] ?? 0), status: s(e["status"]), attempts: e["attempts"], error: e["error"] }; }),
    ],
    cols: cols((fx) => ({ key: "name", label: fx.t("Record", "السجل"), value: (r) => s(r.name), render: (r) => <DocRef doctype={s(r["doctype"])} name={r.name} form /> }), job, ref("customer", "Customer", "Customer", "العميل", true),
      (fx) => ({ key: "sales_invoice", label: fx.t("Sales invoice", "فاتورة المبيعات"), value: (r) => s(r["sales_invoice"]), render: (r) => s(r["sales_invoice"]) ? <DocRef doctype="Sales Invoice" name={r["sales_invoice"]} form /> : <span>—</span> }),
      (fx) => ({ key: "amount", label: fx.t("Amount", "المبلغ"), numeric: true, money: true, value: (r) => Number(r["amount"] ?? 0), render: (r) => <span data-no-i18n>{money(r["amount"])}</span> }), state("status", "Status", "الحالة"), num("attempts", "Attempts", "المحاولات"), text("error", "Error", "الخطأ")),
    actions: (r, fx) => s(r["kind"]) === "Exception" ? <><ActionButton compact label={fx.t("Retry", "إعادة المحاولة")} run={() => svc.handOffCharge(s(r["proposal"]))} /><ReasonAction compact label={fx.t("Resolve", "معالجة")} placeholder={fx.t("Resolution note", "ملاحظة المعالجة")} run={(x) => svc.resolveException(s(r.name), x)} /></> : null },
  // ---------------------------------------------------------------- configuration
  { key: "templates", screen: "N77", title: "Template versions & publishing", title_ar: "إصدارات القوالب والنشر", question: "Which template version is in force for each system type, and which drafts wait to be published?", question_ar: "ما إصدار القالب الساري لكل نوع نظام، وما المسودات التي تنتظر النشر؟",
    basis: "All template versions. Active and superseded versions are frozen; runs keep the version they were created with. Activating a draft supersedes the previous active version.", basis_ar: "كل إصدارات القوالب. النشط والمستبدل مجمدان؛ التشغيلات تحتفظ بإصدارها. تفعيل المسودة يستبدل الإصدار النشط السابق.",
    rows: () => { const runs = by(list("FSM Inspection Run"), "template"); return list("FSM Inspection Template").map((t): R => ({ ...(t as Record<string, unknown>), name: t.name, checks: rows(t, "checks").length, runs: (runs.get(t.name) ?? []).length })).sort((a, b) => s(a["system_type"]).localeCompare(s(b["system_type"])) || Number(b["version"]) - Number(a["version"])); },
    cols: cols(self("FSM Inspection Template", "Template", "القالب"), text("template_name", "Name", "الاسم"), text("system_type", "System type", "نوع النظام", true), num("version", "Version", "الإصدار"), state("status", "Status", "الحالة"), num("checks", "Checks", "البنود"), num("runs", "Runs using it", "التشغيلات المستخدمة"), date("published_on", "Published", "النشر", true)),
    actions: (r, fx) => s(r["status"]) === "Draft" ? <ActionButton compact label={fx.t("Activate", "تفعيل")} run={() => svc.activateTemplate(s(r.name))} /> : s(r["status"]) === "Active" ? <ActionButton compact label={fx.t("New version", "إصدار جديد")} run={() => svc.newTemplateVersion(s(r.name))} /> : null },
];
export const queueByKey = (k: string) => QUEUES.find((q) => q.key === k);

/** Access outcome picker for an on-site visit (inaccessible is recorded as such, never as N/A). */
function AccessPicker({ visit }: { visit: string }) {
  const { t, ar } = useFx(); const [v, setV] = useState("Accessed");
  return (
    <span className="inline-flex items-center gap-1">
      <select className={`${INPUT} min-h-8 py-0.5 text-xs`} value={v} onChange={(e) => setV(e.target.value)} aria-label={t("Access outcome", "نتيجة الوصول")}>
        {["Accessed", "Partial Access", "No Access"].map((o) => <option key={o} value={o}>{opt(o, ar)}</option>)}
      </select>
      <ActionButton compact label={t("Record", "تسجيل")} run={() => svc.recordAccess(visit, v)} />
    </span>
  );
}

/** Generic queue page (queue/:key and my/:key). Scope filters live in the URL, so Back restores the exact view. */
export function QueueView({ q }: { q: QueueDef }) {
  const fx = useFx(); const { t, ar } = fx;
  const [f] = useUrlState();
  const data = q.rows(f);
  const me = q.my ? myTechnician() : undefined;
  const screen = q.screen ? screenById(q.screen) : undefined;
  // the leads-list pattern: rows that carry an SLA clock or a next step get those columns (derived, never stored)
  const dtOf = (r: R) => s(r["doctype"]) || s(r["kind"]);
  const base = q.cols(fx);
  const extra: Col<R>[] = [
    ...(data.some((r) => nextStep(dtOf(r), r as Doc)) ? [{ key: "__next", label: t("Next step", "الخطوة التالية"), value: (r: R) => s(nextStep(dtOf(r), r as Doc)?.date), render: (r: R) => <NextCell doctype={dtOf(r)} doc={r} /> }] : []),
    ...(["critical", "closure", "disputes"].includes(q.key) && data.length ? [{ key: "__chain", label: t("Chain", "السلسلة"), value: (r: R) => chainIndex(r as Doc), render: (r: R) => <DefChain d={r as Doc} compact /> }] : []),
    ...(data.some((r) => slaOf(dtOf(r), r as Doc).state !== "na") ? [{ key: "__sla", label: t("SLA", "مستوى الخدمة"), value: (r: R) => slaOf(dtOf(r), r as Doc).state, render: (r: R) => <SlaCell doctype={dtOf(r)} doc={r} /> }] : []),
  ];
  const table = (
    <DataTable register id={q.key} title={ar ? q.title_ar : q.title} rows={data} cols={[...base, ...extra]} empty={t("Nothing in this queue right now.", "لا يوجد شيء في هذا الطابور الآن.")}
      {...(q.select ? { bulk: { label: ar ? q.select.label_ar : q.select.label, run: (names: string[]) => q.select!.run(names) } } : {})} {...(q.actions ? { actions: (r: R) => q.actions!(r, fx) } : {})} />
  );
  return (
    <div className="w-full min-w-0" data-page={`fsm-queue-${q.key}`}>
      <PageHeader title={ar ? q.title_ar : q.title} band={{ question: ar ? q.question_ar : q.question, basis: ar ? q.basis_ar : q.basis,
        meta: [{ label: t("Rows", "الصفوف"), value: <span data-no-i18n>{data.length}</span> }, ...(screen ? [{ label: t("Screen", "الشاشة"), value: <span data-no-i18n>{screen.id}</span> }] : []), ...(q.my ? [{ label: t("Technician", "الفني"), value: me ? <span data-no-i18n>{s(me["technician_name"])}</span> : t("not linked — showing all", "غير مرتبط — عرض الكل") }] : [])],
        actions: <>{q.band?.(fx)}</> }} />
      {q.key === "exceptions" ? <PageInsights k="exceptions" blocks={[{ id: "rows", title: [q.title, q.title_ar], node: table }]} /> : table}
    </div>
  );
}
export function QueuePage({ params }: PluginPageProps) {
  const { t } = useFx(); const key = String(params["key"] ?? ""); const q = queueByKey(key);
  if (key === "review" && q) return <ReviewDesk />;
  if (!q) return <Panel title={t("Unknown queue", "طابور غير معروف")}><AppLink to="">{t("Back to My work", "العودة إلى عملي")}</AppLink></Panel>;
  return <QueueView q={q} />;
}
export function MyPage({ params }: PluginPageProps) {
  const { t } = useFx(); const q = queueByKey(`my-${String(params["key"] ?? "")}`);
  if (!q) return <Panel title={t("Unknown view", "عرض غير معروف")}><AppLink to="">{t("Back to My work", "العودة إلى عملي")}</AppLink></Panel>;
  return <QueueView q={q} />;
}
export { ListRef, BAND };
