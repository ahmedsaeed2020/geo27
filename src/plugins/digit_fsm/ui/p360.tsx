import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * 360 pages of DIGIT FSM + ITM: Site, Device, Agreement, Job and Deficiency. Each page reads the canonical record and
 * every related record through the scope boundary, shows them grouped (identity → state → related records → reports)
 * and offers only the actions the record's state and the user's permissions allow (domain services / workflow engine).
 */
import { JobMoney } from "./fieldMoney";
import { useState, type ReactNode } from "react";
import { TabBar } from "@/components/digit/Experience";
import type { Doc } from "@/lib/adapter";
import type { PluginPageProps } from "@/plugins/pages";
import { by, list, raw, rows, titleOf } from "../domain/data";
import { FSM_REPORTS } from "../domain/reports";
import { OPEN_DEFICIENCY, runCoverage, s, today, isMissed } from "../domain/rules";
import * as svc from "../domain/services";
import { WorkRecordFrame, workFacts } from "./workRecord";
import { AgreementInsight, DeviceTrend, SiteOverview } from "./p360more";
import { DefChain, ImpairmentBanner } from "./riskBits";
import { tv } from "./runWalk";
import { ActionButton, AppLink, BAND, BTN, DataTable, DocRef, Facts, INPUT, Kpi, ListRef, Missing, NewDoc, PageHeader, Panel, SignalGrid, StateChip, WorkflowButtons, dateTxt, dtTxt, money, numTxt, opt, useFx, type Col } from "./kit";

type Fx = ReturnType<typeof useFx>;
type R = Record<string, unknown> & { name?: string };
const c = (fx: Fx, key: string, en: string, ar: string, render?: (r: R) => ReactNode, numeric = false): Col<R> => ({ key, label: fx.t(en, ar), numeric, value: (r) => (numeric ? Number(r[key] ?? 0) : s(r[key])), ...(render ? { render } : {}) });
const link = (dt: string, key = "name", title = false, form = false) => (r: R) => <DocRef doctype={dt} name={r[key]} title={title} form={form} />;
const chip = (key: string) => (r: R) => <StateChip value={r[key]} />;
const d8 = (key: string) => (r: R) => <span data-no-i18n>{dateTxt(r[key])}</span>;
const dt8 = (key: string) => (r: R) => <span data-no-i18n>{dtTxt(r[key])}</span>;
const tx = (key: string, fx: Fx) => (r: R) => <span>{opt(r[key], fx.ar) || "—"}</span>;
function useTab(first: string) { return useState(first); }

// ---------------------------------------------------------------- Site 360
export function Site360Page({ params }: PluginPageProps) {
  const fx = useFx(); const { t, ar } = fx;
  const id = String(params["id"] ?? ""); const site = list("FSM Service Site").find((x) => x.name === id);
  const [tab, setTab] = useTab("assets");
  if (!site) return <Missing doctype="FSM Service Site" name={id} />;
  const systems = list("FSM Service System").filter((x) => s(x["site"]) === id);
  const devices = list("FSM Device").filter((x) => s(x["site"]) === id);
  const nodes = list("FSM Location Node").filter((x) => s(x["site"]) === id);
  const agreements = list("FSM Service Agreement").filter((x) => s(x["site"]) === id);
  const obls = list("FSM Obligation").filter((x) => s(x["site"]) === id);
  const jobs = list("FSM Job").filter((x) => s(x["site"]) === id);
  const visits = list(VISIT_DT).filter((x) => s(x["site"]) === id);
  const runs = list("FSM Inspection Run").filter((x) => s(x["site"]) === id);
  const defs = list("FSM Deficiency").filter((x) => s(x["site"]) === id);
  const revs = list("FSM Report Revision").filter((x) => s(x["site"]) === id);
  const imps = list("FSM Impairment").filter((x) => s(x["site"]) === id && s(x["status"]) === "Active");
  const openDefs = defs.filter((d) => OPEN_DEFICIENCY.has(s(d["workflow_state"])));
  const devBySys = by(devices, "system");
  const nextDue = obls.filter((o) => ["Due", "Scheduled"].includes(s(o["status"]))).map((o) => s(o["due_date"])).sort()[0];
  const history = FSM_REPORTS.find((r) => r.id === "RP16")!.run({ site: id }).slice(0, 40);
  const tabs = [{ key: "assets", label: t("Systems & devices", "الأنظمة والأجهزة"), count: devices.length }, { key: "contracts", label: t("Agreements & obligations", "العقود والالتزامات"), count: obls.length }, { key: "work", label: t("Jobs & visits", "أوامر العمل والزيارات"), count: jobs.length },
    { key: "itm", label: t("Inspections & reports", "الفحوص والتقارير"), count: runs.length }, { key: "findings", label: t("Findings", "الملاحظات"), count: defs.length }, { key: "history", label: t("History", "السجل"), count: history.length }];
  return (
    <div className="w-full min-w-0" data-page="fsm-site360" data-record={id}>
      <PageHeader title={s(site["site_name"])} crumbs={[{ label: t("Service sites", "مواقع الخدمة"), to: "sites" }]} band={{
        question: t("Site 360 — what is installed here, what is due, and what is unsafe?", "الموقع 360 — ما المركّب هنا، وما المستحق، وما غير الآمن؟"),
        basis: t("All records linked to this service site that you may read.", "كل السجلات المرتبطة بهذا الموقع والمسموح لك بقراءتها."),
        meta: [{ label: t("Customer", "العميل"), value: <DocRef doctype="Customer" name={site["customer"]} title form className="text-dx-on-band underline" /> }, { label: t("City", "المدينة"), value: <span data-no-i18n>{s(site["city"]) || "—"}</span> }, { label: t("Status", "الحالة"), value: opt(site["status"], ar) }],
        actions: <><DocRef doctype="FSM Service Site" name={id} form className={BAND.secondary}>{t("Edit site", "تعديل الموقع")}</DocRef><NewDoc doctype="FSM Service System" band label={t("Add system", "إضافة نظام")} defaults={{ site: id, company: site["company"] }} /><NewDoc doctype="FSM Job" band label={t("New job", "أمر عمل جديد")} defaults={{ site: id, customer: site["customer"], company: site["company"], job_type: "Corrective", workflow_state: "Draft" }} /></>,
      }} />
      <SignalGrid cols={6}>
        <Kpi label={t("Systems", "الأنظمة")} value={numTxt(systems.length)} basis={t("Service systems on site", "أنظمة الخدمة في الموقع")} />
        <Kpi label={t("Active devices", "الأجهزة النشطة")} value={numTxt(devices.filter((d) => s(d["lifecycle"]) === "Active").length)} basis={t("Lifecycle Active", "دورة حياة نشطة")} to={`reports/RP01?site=${encodeURIComponent(id)}`} />
        <Kpi label={t("Open findings", "ملاحظات مفتوحة")} value={numTxt(openDefs.length)} tone={openDefs.some((d) => s(d["severity"]) === "Critical") ? "bad" : openDefs.length ? "warn" : "good"} basis={t("Duplicates excluded", "بدون المكرر")} to={`reports/RP05?site=${encodeURIComponent(id)}`} />
        <Kpi label={t("Impaired systems", "أنظمة متعطلة")} value={numTxt(imps.length)} tone={imps.length ? "bad" : "good"} basis={t("Active impairment intervals", "فترات تعطّل قائمة")} to={`reports/RP07?site=${encodeURIComponent(id)}`} />
        <Kpi label={t("Overdue obligations", "التزامات متأخرة")} value={numTxt(obls.filter((o) => s(o["status"]) === "Missed" || isMissed(o)).length)} tone={obls.some((o) => isMissed(o)) ? "bad" : "good"} basis={t("Window ended, not fulfilled", "انتهت النافذة دون تنفيذ")} to={`reports/RP09?site=${encodeURIComponent(id)}`} />
        <Kpi label={t("Next due", "الاستحقاق التالي")} value={nextDue ? dateTxt(nextDue) : "—"} basis={t("Earliest due or scheduled obligation", "أقرب التزام مستحق أو مجدول")} to={`reports/RP08?site=${encodeURIComponent(id)}`} />
      </SignalGrid>
      <SiteOverview id={id} />
      <Panel title={t("Access & contacts", "الوصول وجهات الاتصال")}>
        <Facts items={[[t("Service window", "نافذة الخدمة"), <span data-no-i18n>{tv(site["service_window"], ar) || "—"}</span>], [t("Access instructions", "تعليمات الوصول"), <span data-no-i18n>{tv(site["access_instructions"], ar) || "—"}</span>], [t("Escort / permit", "مرافق / تصريح"), [site["requires_escort"] ? t("Escort required", "يتطلب مرافقاً") : "", site["requires_permit"] ? t("Work permit", "تصريح عمل") : ""].filter(Boolean).join(" · ") || "—"],
          [t("Contacts", "جهات الاتصال"), rows(site, "contacts").map((x, i) => <div key={i}><span>{opt(x["contact_role"], ar)}</span> · <span data-no-i18n>{s(x["phone"])}</span></div>)], [t("Locations", "الأماكن"), <span data-no-i18n>{nodes.map((n) => tv(n["node_label"], ar)).join(" · ") || "—"}</span>]]} />
      </Panel>
      <TabBar tabs={tabs} value={tab} onChange={setTab} ariaLabel={t("Site sections", "أقسام الموقع")} wrap />
      {tab === "assets" && <>
        <Panel title={t("Systems", "الأنظمة")} actions={<NewDoc doctype="FSM Location Node" label={t("Add location", "إضافة مكان")} defaults={{ site: id, company: site["company"] }} />}>
          <DataTable id="site-systems" rows={systems.map((x) => ({ ...x, devices: (devBySys.get(x.name) ?? []).length }))} empty={t("No systems on this site yet.", "لا أنظمة في هذا الموقع بعد.")} cols={[c(fx, "system_name", "System", "النظام", link("FSM Service System", "name", true, true)), c(fx, "system_type", "Type", "النوع", tx("system_type", fx)), c(fx, "operating_status", "Operating status", "الحالة التشغيلية", chip("operating_status")), c(fx, "devices", "Devices", "الأجهزة", undefined, true)]}
            actions={(r) => <NewDoc doctype="FSM Device" label={t("Add device", "إضافة جهاز")} defaults={{ system: r.name, site: id, company: site["company"], lifecycle: "Active" }} />} />
        </Panel>
        <Panel title={t("Devices", "الأجهزة")} actions={<AppLink to={`reports/RP01?site=${encodeURIComponent(id)}`}>{t("Inventory & condition (RP01)", "الجرد والحالة (RP01)")}</AppLink>}>
          <DataTable id="site-devices" rows={devices} empty={t("No devices registered.", "لا أجهزة مسجلة.")} cols={[c(fx, "device_label", "Device", "الجهاز", link("FSM Device", "name", true)), c(fx, "system", "System", "النظام", link("FSM Service System", "system", true, true)), c(fx, "serial_no", "Serial", "التسلسلي"), c(fx, "location", "Location", "المكان", link("FSM Location Node", "location", true, true)), c(fx, "lifecycle", "Lifecycle", "دورة الحياة", chip("lifecycle"))]} />
        </Panel>
      </>}
      {tab === "contracts" && <>
        <Panel title={t("Agreements", "الاتفاقيات")} actions={<NewDoc doctype="FSM Service Agreement" label={t("New agreement", "اتفاقية جديدة")} defaults={{ site: id, customer: site["customer"], company: site["company"], workflow_state: "Draft" }} />}>
          <DataTable id="site-agreements" rows={agreements} empty={t("No agreements for this site.", "لا اتفاقيات لهذا الموقع.")} cols={[c(fx, "name", "Agreement", "الاتفاقية", link("FSM Service Agreement")), c(fx, "agreement_title", "Title", "العنوان"), c(fx, "end_date", "Ends", "النهاية", d8("end_date")), c(fx, "workflow_state", "Status", "الحالة", chip("workflow_state"))]} />
        </Panel>
        <Panel title={t("Obligations", "الالتزامات")} actions={<AppLink to={`reports/RP08?site=${encodeURIComponent(id)}`}>{t("Compliance (RP08)", "الالتزام (RP08)")}</AppLink>}>
          <DataTable id="site-obls" rows={obls.sort((a, b) => s(a["due_date"]).localeCompare(s(b["due_date"])))} empty={t("No obligations generated.", "لم تُولَّد التزامات.")} cols={[c(fx, "name", "Obligation", "الالتزام", link("FSM Obligation", "name", false, true)), c(fx, "system", "System", "النظام", link("FSM Service System", "system", true, true)), c(fx, "due_date", "Due", "الاستحقاق", d8("due_date")), c(fx, "status", "Status", "الحالة", chip("status")), c(fx, "fulfilled_by", "Job", "أمر العمل", link("FSM Job", "fulfilled_by"))]} />
        </Panel>
      </>}
      {tab === "work" && <>
        <Panel title={t("Jobs", "أوامر العمل")}><DataTable id="site-jobs" rows={jobs} empty={t("No jobs.", "لا أوامر عمل.")} cols={[c(fx, "name", "Job", "أمر العمل", link("FSM Job")), c(fx, "job_title", "Title", "العنوان"), c(fx, "job_type", "Type", "النوع", tx("job_type", fx)), c(fx, "workflow_state", "Status", "الحالة", chip("workflow_state"))]} /></Panel>
        <Panel title={t("Visits", "الزيارات")}><DataTable id="site-visits" rows={visits} empty={t("No visits.", "لا زيارات.")} cols={[c(fx, "name", "Visit", "الزيارة", link(VISIT_DT, "name", false, true)), c(fx, "job", "Job", "أمر العمل", link("FSM Job", "job")), c(fx, "technician", "Technician", "الفني", link("FSM Technician", "technician", true, true)), c(fx, "scheduled_start", "Scheduled", "الموعد", dt8("scheduled_start")), c(fx, "workflow_state", "Status", "الحالة", chip("workflow_state")), c(fx, "access_outcome", "Access", "الوصول", chip("access_outcome"))]} /></Panel>
      </>}
      {tab === "itm" && <>
        <Panel title={t("Inspection runs", "تشغيلات الفحص")} actions={<AppLink to={`reports/RP03?site=${encodeURIComponent(id)}`}>{t("Coverage (RP03)", "التغطية (RP03)")}</AppLink>}>
          <DataTable id="site-runs" rows={runs.map((r) => { const cv = runCoverage(rows(r, "results"), Number(r["expected_devices"]) || undefined); return { ...r, cov: cv.coverage === null ? "" : Math.round(cv.coverage * 100) }; })} empty={t("No inspection runs.", "لا تشغيلات فحص.")}
            cols={[c(fx, "name", "Run", "التشغيل", link("FSM Inspection Run")), c(fx, "system", "System", "النظام", link("FSM Service System", "system", true, true)), c(fx, "workflow_state", "Status", "الحالة", chip("workflow_state")), c(fx, "technical_result", "Result", "النتيجة", chip("technical_result")), c(fx, "cov", "Coverage %", "التغطية %", undefined, true)]} />
        </Panel>
        <Panel title={t("Published reports", "التقارير المنشورة")}><DataTable id="site-revs" rows={revs} empty={t("Nothing published yet.", "لم يُنشر شيء بعد.")} cols={[c(fx, "name", "Revision", "الإصدار", link("FSM Report Revision", "name", false, true)), c(fx, "run", "Run", "التشغيل", link("FSM Inspection Run", "run")), c(fx, "revision", "Rev.", "رقم", undefined, true), c(fx, "technical_result", "Result", "النتيجة", chip("technical_result")), c(fx, "published_on", "Published", "النشر", dt8("published_on")), c(fx, "status", "Status", "الحالة", chip("status"))]} /></Panel>
      </>}
      {tab === "findings" && <Panel title={t("Findings", "الملاحظات")} actions={<AppLink to={`reports/RP06?site=${encodeURIComponent(id)}`}>{t("Lifecycle (RP06)", "دورة الحياة (RP06)")}</AppLink>}>
        <DataTable id="site-defs" rows={defs} empty={t("No findings.", "لا ملاحظات.")} cols={[c(fx, "name", "Finding", "الملاحظة", link("FSM Deficiency")), c(fx, "title", "Finding", "الوصف"), c(fx, "severity", "Severity", "الخطورة", tx("severity", fx)), c(fx, "workflow_state", "State", "الحالة", chip("workflow_state")), c(fx, "commercial_decision", "Decision", "القرار", chip("commercial_decision"))]} />
      </Panel>}
      {tab === "history" && <Panel title={t("Service history", "سجل الخدمة")} actions={<AppLink to={`reports/RP16?site=${encodeURIComponent(id)}`}>{t("Full history (RP16)", "السجل الكامل (RP16)")}</AppLink>}>
        <DataTable id="site-history" rows={history.map((h, i) => ({ ...h, name: `${s(h["record"])}-${i}` }))} empty={t("No events.", "لا أحداث.")} cols={[c(fx, "date", "Date", "التاريخ", d8("date")), c(fx, "event", "Event", "الحدث", tx("event", fx)), c(fx, "record", "Record", "السجل", (r) => <DocRef doctype={s(r["record_doctype"])} name={r["record"]} />), c(fx, "subject", "Subject", "الموضوع")]} />
      </Panel>}
    </div>
  );
}

// ---------------------------------------------------------------- Device 360
export function Device360Page({ params }: PluginPageProps) {
  const fx = useFx(); const { t, ar } = fx;
  const id = String(params["id"] ?? ""); const dev = list("FSM Device").find((x) => x.name === id);
  if (!dev) return <Missing doctype="FSM Device" name={id} />;
  const history = FSM_REPORTS.find((r) => r.id === "RP02")!.run({ device: id });
  const defs = list("FSM Deficiency").filter((d) => s(d["device"]) === id);
  const changes = list("FSM Asset Change").filter((x) => s(x["device"]) === id);
  const last = history.filter((h) => ["Reviewed", "Published"].includes(s(h["state"]))).sort((a, b) => s(b["date"]).localeCompare(s(a["date"])))[0];
  return (
    <div className="w-full min-w-0" data-page="fsm-device360" data-record={id}>
      <PageHeader title={s(dev["device_label"])} crumbs={[{ label: titleOf("FSM Service Site", dev["site"]), to: `site/${encodeURIComponent(s(dev["site"]))}` }]} band={{
        question: t("Device 360 — what is this device, where is it, and how has it tested?", "الجهاز 360 — ما هذا الجهاز، وأين هو، وكيف كانت نتائج فحصه؟"),
        basis: t("Identity, location history (approved changes) and every recorded check attempt of this device.", "الهوية وتاريخ المكان (التغييرات المعتمدة) وكل محاولة فحص مسجلة لهذا الجهاز."),
        meta: [{ label: t("System", "النظام"), value: <span data-no-i18n>{titleOf("FSM Service System", dev["system"])}</span> }, { label: t("Lifecycle", "دورة الحياة"), value: opt(dev["lifecycle"], ar) }, { label: t("Last tested", "آخر فحص"), value: <span data-no-i18n>{last ? dateTxt(last["date"]) : t("never", "لم يُفحص")}</span> }],
        actions: <><DocRef doctype="FSM Device" name={id} form className={BAND.secondary}>{t("Edit device", "تعديل الجهاز")}</DocRef><NewDoc doctype="FSM Asset Change" band label={t("Report a change", "الإبلاغ عن تغيير")} defaults={{ device: id, site: dev["site"], company: dev["company"], status: "Proposed", effective_date: today(), old_location: dev["location"] }} /></>,
      }} />
      <ImpairmentBanner system={dev["system"]} />
      <Panel title={t("Identity", "الهوية")}>
        <Facts items={[[t("Device type", "نوع الجهاز"), <span data-no-i18n>{s(dev["device_type"]) || "—"}</span>], [t("Serial no", "الرقم التسلسلي"), <span data-no-i18n>{s(dev["serial_no"]) || "—"}</span>], [t("Barcode / tag", "الباركود / الوسم"), <span data-no-i18n>{s(dev["barcode"]) || "—"}</span>], [t("Item", "الصنف"), <DocRef doctype="Item" name={dev["item"]} title form />],
          [t("Location", "المكان"), <DocRef doctype="FSM Location Node" name={dev["location"]} title form />], [t("Installed", "التركيب"), <span data-no-i18n>{dateTxt(dev["install_date"])}</span>], [t("Site", "الموقع"), <DocRef doctype="FSM Service Site" name={dev["site"]} title />], [t("System", "النظام"), <DocRef doctype="FSM Service System" name={dev["system"]} title form />]]} />
      </Panel>
      <DeviceTrend id={id} />
      <Panel title={t("Inspection history", "سجل الفحص")} actions={<AppLink to={`reports/RP02?device=${encodeURIComponent(id)}`}>{t("Full history (RP02)", "السجل الكامل (RP02)")}</AppLink>}>
        <DataTable id="dev-history" rows={history.map((h, i) => ({ ...h, name: `${s(h["run"])}-${i}` }))} empty={t("This device has never been inspected.", "لم يُفحص هذا الجهاز قط.")} cols={[c(fx, "date", "Date", "التاريخ", d8("date")), c(fx, "run", "Run", "التشغيل", link("FSM Inspection Run", "run")), c(fx, "check_text", "Check", "البند"), c(fx, "outcome", "Outcome", "النتيجة", chip("outcome")), c(fx, "measurement", "Measurement", "القياس"), c(fx, "state", "Run status", "حالة التشغيل", chip("state"))]} />
      </Panel>
      <Panel title={t("Findings", "الملاحظات")}><DataTable id="dev-defs" rows={defs} empty={t("No findings on this device.", "لا ملاحظات على هذا الجهاز.")} cols={[c(fx, "name", "Finding", "الملاحظة", link("FSM Deficiency")), c(fx, "severity", "Severity", "الخطورة", tx("severity", fx)), c(fx, "workflow_state", "State", "الحالة", chip("workflow_state")), c(fx, "opened_on", "Opened", "الفتح", d8("opened_on"))]} /></Panel>
      <Panel title={t("Asset changes", "تغييرات الأصل")}><DataTable id="dev-changes" rows={changes} empty={t("No changes recorded.", "لا تغييرات مسجلة.")} cols={[c(fx, "name", "Change", "التغيير", link("FSM Asset Change", "name", false, true)), c(fx, "change_type", "Type", "النوع", tx("change_type", fx)), c(fx, "effective_date", "Effective", "السريان", d8("effective_date")), c(fx, "status", "Review", "المراجعة", chip("status"))]}
        actions={(r) => s(r["status"]) === "Proposed" ? <><ActionButton compact label={t("Approve", "اعتماد")} run={() => svc.approveAssetChange(s(r.name), true)} /><ActionButton compact label={t("Reject", "رفض")} run={() => svc.approveAssetChange(s(r.name), false)} /></> : null} /></Panel>
    </div>
  );
}

// ---------------------------------------------------------------- Agreement 360
export function Agreement360Page({ params }: PluginPageProps) {
  const fx = useFx(); const { t, ar } = fx;
  const id = String(params["id"] ?? ""); const a = list("FSM Service Agreement").find((x) => x.name === id);
  if (!a) return <Missing doctype="FSM Service Agreement" name={id} />;
  const obls = list("FSM Obligation").filter((o) => s(o["agreement"]) === id).sort((x, y) => s(x["due_date"]).localeCompare(s(y["due_date"])));
  const jobs = list("FSM Job").filter((j) => s(j["agreement"]) === id);
  const gens = list("FSM Generation Run").filter((g) => s(g["agreement"]) === id);
  const ren = list("FSM Renewal Case").filter((r) => s(r["agreement"]) === id);
  const fulfilled = obls.filter((o) => s(o["status"]) === "Fulfilled").length; const missed = obls.filter((o) => s(o["status"]) === "Missed" || isMissed(o)).length;
  const ended = obls.filter((o) => s(o["status"]) !== "Waived" && (s(o["status"]) === "Fulfilled" || (s(o["window_end"]) || s(o["due_date"])) < today()));
  const ontime = ended.length ? Math.round((ended.filter((o) => s(o["status"]) === "Fulfilled" && s(o["fulfilled_on"]).slice(0, 10) <= (s(o["window_end"]) || s(o["due_date"]))).length / ended.length) * 1000) / 10 : null;
  return (
    <div className="w-full min-w-0" data-page="fsm-agreement360" data-record={id}>
      <PageHeader title={s(a["agreement_title"])} crumbs={[{ label: titleOf("FSM Service Site", a["site"]), to: `site/${encodeURIComponent(s(a["site"]))}` }]} band={{
        question: t("Agreement 360 — what did we promise, and are we delivering it on time?", "الاتفاقية 360 — بماذا التزمنا، وهل ننفذه في الموعد؟"),
        basis: t("Coverage lines, the obligations generated from them (idempotent), the jobs that fulfil them through the bridge, and renewal.", "بنود التغطية والالتزامات المولدة منها (بدون تكرار) وأوامر العمل التي تنفذها عبر الربط، والتجديد."),
        meta: [{ label: t("Status", "الحالة"), value: opt(a["workflow_state"], ar) }, { label: t("Term", "المدة"), value: <span data-no-i18n>{dateTxt(a["start_date"])} → {dateTxt(a["end_date"])}</span> }, { label: t("Annual value", "القيمة السنوية"), value: <span data-no-i18n>{money(a["annual_value"])}</span> }],
        actions: <><WorkflowButtons doctype="FSM Service Agreement" doc={a} /><ActionButton band primary label={t("Generate obligations", "توليد الالتزامات")} disabled={s(a["workflow_state"]) !== "Active"} reason={t("Activate the agreement first", "فعّل الاتفاقية أولاً")} run={() => svc.generateObligations(id)} /><DocRef doctype="FSM Service Agreement" name={id} form className={BAND.secondary}>{t("Edit", "تعديل")}</DocRef></>,
      }} />
      <SignalGrid cols={4}>
        <Kpi label={t("Obligations", "الالتزامات")} value={numTxt(obls.length)} basis={t("Generated within the horizon", "مولدة ضمن الأفق")} to={`reports/RP08?agreement=${encodeURIComponent(id)}`} />
        <Kpi label={t("Fulfilled", "منفّذ")} value={numTxt(fulfilled)} tone="good" basis={t("From reviewed inspections", "من فحوص مراجَعة")} to={`reports/RP08?agreement=${encodeURIComponent(id)}&status=Fulfilled`} />
        <Kpi label={t("Missed / overdue", "فائت / متأخر")} value={numTxt(missed)} tone={missed ? "bad" : "good"} basis={t("Window ended, not fulfilled", "انتهت النافذة دون تنفيذ")} to={`queue/overdue?site=${encodeURIComponent(s(a["site"]))}`} />
        <Kpi label={t("On-time fulfilment", "التنفيذ في الموعد")} value={ontime === null ? "—" : numTxt(ontime, 1)} unit="%" tone={ontime === null ? "neutral" : ontime >= 95 ? "good" : ontime >= 80 ? "warn" : "bad"} basis={t("Fulfilled in window ÷ ended windows", "المنفّذ في النافذة ÷ النوافذ المنتهية")} to={`reports/RP08?agreement=${encodeURIComponent(id)}`} />
      </SignalGrid>
      <AgreementInsight a={a} />
      <Panel title={t("Coverage lines", "بنود التغطية")}>
        <DataTable id="agr-coverage" rows={rows(a, "coverage").map((x, i) => ({ ...x, name: s(x["name"]) || String(i) }))} searchable={false} empty={t("No coverage lines — add them in the form.", "لا بنود تغطية — أضفها في النموذج.")} cols={[c(fx, "system", "System", "النظام", link("FSM Service System", "system", true, true)), c(fx, "service_type", "Service", "الخدمة", tx("service_type", fx)), c(fx, "frequency", "Frequency", "التكرار", tx("frequency", fx)), c(fx, "window_days", "Window (days)", "النافذة (أيام)", undefined, true), c(fx, "template", "Template", "القالب", link("FSM Inspection Template", "template", true, true))]} />
      </Panel>
      <Panel title={t("Obligations", "الالتزامات")} subtitle={t("Cancelling a job releases its obligations back to Due; obligations are never deleted.", "إلغاء أمر العمل يعيد التزاماته إلى مستحق؛ الالتزامات لا تُحذف.")}>
        <DataTable id="agr-obls" rows={obls} empty={t("No obligations yet — activate and generate.", "لا التزامات بعد — فعّل ثم ولّد.")} cols={[c(fx, "name", "Obligation", "الالتزام", link("FSM Obligation", "name", false, true)), c(fx, "system", "System", "النظام", link("FSM Service System", "system", true, true)), c(fx, "due_date", "Due", "الاستحقاق", d8("due_date")), c(fx, "window_end", "Window end", "نهاية النافذة", d8("window_end")), c(fx, "status", "Status", "الحالة", chip("status")), c(fx, "fulfilled_by", "Job", "أمر العمل", link("FSM Job", "fulfilled_by")), c(fx, "fulfilled_on", "Fulfilled", "التنفيذ", d8("fulfilled_on"))]}
          actions={(r) => s(r["status"]) === "Due" ? <ActionButton compact label={t("Release job", "إصدار أمر عمل")} run={() => svc.createJobForObligations([s(r.name)])} /> : null} />
      </Panel>
      <Panel title={t("Jobs under this agreement", "أوامر العمل ضمن الاتفاقية")}><DataTable id="agr-jobs" rows={jobs} empty={t("No jobs yet.", "لا أوامر عمل بعد.")} cols={[c(fx, "name", "Job", "أمر العمل", link("FSM Job")), c(fx, "job_title", "Title", "العنوان"), c(fx, "workflow_state", "Status", "الحالة", chip("workflow_state")), c(fx, "obligations", "Obligations bridged", "الالتزامات المربوطة", (r) => <span data-no-i18n>{rows(r as Doc, "obligations").length}</span>)]} /></Panel>
      <Panel title={t("Generation runs & renewal", "دورات التوليد والتجديد")} actions={<ActionButton compact label={t("Open renewal", "فتح تجديد")} run={() => svc.openRenewal(id)} />}>
        <DataTable id="agr-gens" rows={[...gens.map((g) => ({ ...g, kind: "FSM Generation Run", what: `${s(g["created_count"])} / ${s(g["skipped_count"])}`, st: g["outcome"] })), ...ren.map((r) => ({ ...r, kind: "FSM Renewal Case", what: dateTxt(r["proposed_end"]), st: r["status"] }))]} searchable={false} empty={t("None yet.", "لا شيء بعد.")}
          cols={[c(fx, "name", "Record", "السجل", (r) => <DocRef doctype={s(r["kind"])} name={r.name} form />), c(fx, "kind", "Type", "النوع", (r) => <span>{s(r["kind"]) === "FSM Generation Run" ? t("Generation run (created / skipped)", "دورة توليد (منشأ / متخطى)") : t("Renewal case (proposed end)", "حالة تجديد (النهاية المقترحة)")}</span>), c(fx, "what", "Detail", "التفاصيل"), c(fx, "st", "Status", "الحالة", chip("st"))]} />
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- Job 360
export function Job360Page({ params }: PluginPageProps) {
  const fx = useFx(); const { t, ar } = fx;
  const id = String(params["id"] ?? ""); const j = list("FSM Job").find((x) => x.name === id);
  const [item, setItem] = useState(""); const [qty, setQty] = useState("1");
  if (!j) return <Missing doctype="FSM Job" name={id} />;
  const visits = list(VISIT_DT).filter((v) => s(v["job"]) === id);
  const bookings = list("FSM Booking").filter((b) => visits.some((v) => v.name === s(b["visit"])));
  const runs = list("FSM Inspection Run").filter((r) => s(r["job"]) === id);
  const defs = list("FSM Deficiency").filter((d) => runs.some((r) => r.name === s(d["source_run"])) || s(d["repair_job"]) === id);
  const mrs = list("Material Request").filter((m) => s(m["digit_fsm_job"]) === id);
  const ses = list("Stock Entry").filter((m) => s(m["digit_fsm_job"]) === id);
  const tss = list("Timesheet").filter((m) => s(m["digit_fsm_job"]) === id);
  const charge = list("FSM Charge Proposal").find((x) => s(x["job"]) === id);
  const subs = list("FSM Subcontract Assignment").filter((x) => s(x["job"]) === id);
  const bridge = rows(j, "obligations");
  const systems = [...new Set([...bridge.map((b) => s(b["system"])), ...(j["deficiency"] ? [s(raw("FSM Deficiency", j["deficiency"])?.["system"])] : [])].filter(Boolean))];
  const items = list("Item").filter((x) => s(x.name).startsWith("FSM-PART") || Number(x["is_stock_item"]) === 1).slice(0, 50);
  const lastVisit = visits.sort((a, b) => s(b["scheduled_start"]).localeCompare(s(a["scheduled_start"])))[0];
  return (
    <div className="w-full min-w-0" data-page="fsm-job360" data-record={id}>
      <PageHeader title={s(j["job_title"])} crumbs={[{ label: titleOf("FSM Service Site", j["site"]), to: `site/${encodeURIComponent(s(j["site"]))}` }]} band={{
        question: t("Job 360 — scope, visits, people, inspections, parts and charge for this job", "أمر العمل 360 — النطاق والزيارات والفنيون والفحوص والمواد والتحصيل"),
        basis: t("A job is the scope; each visit is one attendance; each booking is one technician's time. Completing the job never closes findings or posts invoices.", "أمر العمل هو النطاق؛ كل زيارة حضور واحد؛ كل حجز وقت فني واحد. إكمال أمر العمل لا يغلق الملاحظات ولا يرحّل الفواتير."),
        meta: [{ label: t("Type", "النوع"), value: opt(j["job_type"], ar) }, { label: t("Status", "الحالة"), value: opt(j["workflow_state"], ar) }, { label: t("Priority", "الأولوية"), value: opt(j["priority"], ar) }, { label: t("Customer", "العميل"), value: <span data-no-i18n>{titleOf("Customer", j["customer"])}</span> }],
        actions: <><WorkflowButtons doctype="FSM Job" doc={j} /><DocRef doctype="FSM Job" name={id} form className={BAND.secondary}>{t("Edit", "تعديل")}</DocRef></>,
      }} />
      <WorkRecordFrame dt="FSM Job" doc={j} w={workFacts(j)} />
      <Panel title={t("Scope & sources", "النطاق والمصادر")}>
        <Facts items={[[t("Scope of work", "نطاق العمل"), <span data-no-i18n>{s(j["scope"]) || "—"}</span>], [t("Agreement", "الاتفاقية"), <DocRef doctype="FSM Service Agreement" name={j["agreement"]} />], [t("Service request", "طلب الخدمة"), <DocRef doctype="Issue" name={j["issue"]} form />], [t("Source finding", "الملاحظة المصدر"), <DocRef doctype="FSM Deficiency" name={j["deficiency"]} />],
          [t("Quotation", "عرض السعر"), <DocRef doctype="Quotation" name={j["quotation"]} form />], [t("Planned days", "الأيام المخططة"), <span data-no-i18n>{numTxt(j["planned_days"])}</span>], [t("Hold reason", "سبب الإيقاف"), opt(j["hold_reason"], ar) || "—"], [t("Completed", "الإكمال"), <span data-no-i18n>{dtTxt(j["completed_on"])}</span>]]} />
      </Panel>
      {bridge.length > 0 && <Panel title={t("Obligations fulfilled by this job", "الالتزامات التي ينفذها أمر العمل")} subtitle={t("Fulfilment comes only from a reviewed inspection of the same system.", "التنفيذ يأتي فقط من فحص مراجَع للنظام نفسه.")} actions={<ActionButton compact label={t("Fulfil from reviewed runs", "تنفيذ من الفحوص المراجَعة")} run={() => svc.fulfilFromJob(id)} />}>
        <DataTable id="job-bridge" rows={bridge.map((b) => ({ ...b, due: raw("FSM Obligation", b["obligation"])?.["due_date"], ostatus: raw("FSM Obligation", b["obligation"])?.["status"] }))} searchable={false} empty="—" cols={[c(fx, "obligation", "Obligation", "الالتزام", link("FSM Obligation", "obligation", false, true)), c(fx, "system", "System", "النظام", link("FSM Service System", "system", true, true)), c(fx, "due", "Due", "الاستحقاق", d8("due")), c(fx, "outcome", "Bridge outcome", "نتيجة الربط", chip("outcome")), c(fx, "ostatus", "Obligation status", "حالة الالتزام", chip("ostatus"))]} />
      </Panel>}
      <Panel title={t("Visits", "الزيارات")} actions={<><ActionButton compact label={t("New visit", "زيارة جديدة")} run={() => svc.createVisit(id)} />{lastVisit && <ActionButton compact label={t("Return visit", "زيارة عودة")} run={() => svc.createVisit(id, { predecessor: lastVisit.name, returnReason: "Planned Continuation" })} />}<AppLink to="dispatch" className={BTN.compact}>{t("Dispatch board", "لوحة الجدولة")}</AppLink></>}>
        <DataTable id="job-visits" rows={visits} searchable={false} empty={t("No visits yet — create one, then book it on the dispatch board.", "لا زيارات بعد — أنشئ زيارة ثم احجزها في لوحة الجدولة.")} cols={[c(fx, "name", "Visit", "الزيارة", link(VISIT_DT, "name", false, true)), c(fx, "visit_purpose", "Purpose", "الغرض", tx("visit_purpose", fx)), c(fx, "technician", "Lead", "الرئيسي", link("FSM Technician", "technician", true, true)), c(fx, "scheduled_start", "Scheduled", "الموعد", dt8("scheduled_start")), c(fx, "workflow_state", "Status", "الحالة", chip("workflow_state")), c(fx, "access_outcome", "Access", "الوصول", chip("access_outcome")), c(fx, "handover_note", "Handover", "التسليم")]}
          actions={(r) => <WorkflowButtons doctype={VISIT_DT} doc={r as Doc} except={["Cancel Visit"]} />} />
        {bookings.length > 0 && <div className="mt-3"><DataTable id="job-bookings" rows={bookings} searchable={false} empty="—" cols={[c(fx, "name", "Booking", "الحجز", link("FSM Booking", "name", false, true)), c(fx, "technician", "Technician", "الفني", link("FSM Technician", "technician", true, true)), c(fx, "booking_role", "Role", "الدور", tx("booking_role", fx)), c(fx, "booking_start", "Start", "البداية", dt8("booking_start")), c(fx, "booking_end", "End", "النهاية", dt8("booking_end")), c(fx, "status", "Status", "الحالة", chip("status"))]} /></div>}
      </Panel>
      <Panel title={t("Inspections", "الفحوص")} actions={<>{systems.filter((x) => !runs.some((r) => s(r["system"]) === x && !r["retest_for"])).map((x) => <ActionButton key={x} compact label={t("Start run", "بدء فحص")} detail={titleOf("FSM Service System", x)} run={() => svc.createRun(id, x, lastVisit?.name)} />)}</>}>
        <DataTable id="job-runs" rows={runs.map((r) => { const cv = runCoverage(rows(r, "results"), Number(r["expected_devices"]) || undefined); return { ...r, cov: cv.coverage === null ? "" : Math.round(cv.coverage * 100) }; })} searchable={false} empty={t("No inspection runs on this job.", "لا تشغيلات فحص على أمر العمل.")}
          cols={[c(fx, "name", "Run", "التشغيل", link("FSM Inspection Run")), c(fx, "system", "System", "النظام", link("FSM Service System", "system", true, true)), c(fx, "template_version", "Template v.", "إصدار القالب", undefined, true), c(fx, "workflow_state", "Status", "الحالة", chip("workflow_state")), c(fx, "technical_result", "Result", "النتيجة", chip("technical_result")), c(fx, "cov", "Coverage %", "التغطية %", undefined, true)]} />
      </Panel>
      {defs.length > 0 && <Panel title={t("Findings", "الملاحظات")}><DataTable id="job-defs" rows={defs} searchable={false} empty="—" cols={[c(fx, "name", "Finding", "الملاحظة", link("FSM Deficiency")), c(fx, "title", "Finding", "الوصف"), c(fx, "severity", "Severity", "الخطورة", tx("severity", fx)), c(fx, "workflow_state", "State", "الحالة", chip("workflow_state"))]} /></Panel>}
      <Panel title={t("Parts & labour (native documents)", "المواد وساعات العمل (مستندات أصلية)")} subtitle={t("Requests, issues and timesheets stay native; posting happens in the native form.", "الطلبات والصرف وسجلات الوقت تبقى أصلية؛ الترحيل يتم في النموذج الأصلي.")}
        actions={<span className="inline-flex flex-wrap items-center gap-1.5"><select className={`${INPUT} min-h-8 py-0.5 text-xs`} value={item} onChange={(e) => setItem(e.target.value)} aria-label={t("Item", "الصنف")}><option value="">{t("Choose item…", "اختر صنفاً…")}</option>{items.map((x) => <option key={x.name} value={x.name} data-no-i18n>{s(x["item_name"]) || x.name}</option>)}</select>
          <input className={`${INPUT} min-h-8 w-16 py-0.5 text-xs`} type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} aria-label={t("Quantity", "الكمية")} />
          <ActionButton compact label={t("Request materials", "طلب مواد")} disabled={!item} run={() => svc.requestMaterials(id, [{ item_code: item, qty: Number(qty) || 0 }])} onDone={(r) => { if (r.ok) setItem(""); }} /></span>}>
        <DataTable id="job-parts" rows={[...mrs.map((m) => ({ ...m, kind: "Material Request", detail: rows(m, "items").map((x) => `${s(x["item_code"])} × ${s(x["qty"])}`).join(", "), st: Number(m["docstatus"]) === 1 ? "Submitted" : "Draft" })), ...ses.map((m) => ({ ...m, kind: "Stock Entry", detail: s(m["purpose"]), st: Number(m["docstatus"]) === 1 ? "Submitted" : "Draft" })), ...tss.map((m) => ({ ...m, kind: "Timesheet", detail: `${numTxt(m["total_hours"], 1)} ${ar ? "ساعة" : "h"}`, st: Number(m["docstatus"]) === 1 ? "Submitted" : "Draft" }))]} searchable={false}
          empty={t("No native material or labour documents linked yet.", "لا مستندات مواد أو ساعات أصلية مرتبطة بعد.")} cols={[c(fx, "name", "Document", "المستند", (r) => <DocRef doctype={s(r["kind"])} name={r.name} form />), c(fx, "kind", "Type", "النوع", (r) => (ar ? ({ "Material Request": "طلب مواد", "Stock Entry": "قيد مخزون", Timesheet: "سجل وقت" } as Record<string, string>)[s(r["kind"])] ?? s(r["kind"]) : s(r["kind"]))), c(fx, "detail", "Detail", "التفاصيل"), c(fx, "st", "Status", "الحالة", chip("st"))]} />
        <div className="mt-2 flex flex-wrap gap-2"><NewDoc doctype="Timesheet" label={t("New timesheet", "سجل وقت جديد")} defaults={{ digit_fsm_job: id, company: j["company"], customer: j["customer"] }} /><NewDoc doctype="Stock Entry" label={t("New stock entry", "قيد مخزون جديد")} defaults={{ digit_fsm_job: id, company: j["company"], purpose: "Material Issue" }} /><NewDoc doctype="FSM Subcontract Assignment" label={t("Assign subcontractor", "إسناد لمقاول باطن")} defaults={{ job: id, site: j["site"], company: j["company"], status: "Proposed" }} /></div>
        {subs.length > 0 && <div className="mt-3"><DataTable id="job-subs" rows={subs} searchable={false} empty="—" cols={[c(fx, "name", "Assignment", "الإسناد", link("FSM Subcontract Assignment", "name", false, true)), c(fx, "supplier", "Supplier", "المورد", link("Supplier", "supplier", true, true)), c(fx, "agreed_cost", "Agreed cost", "التكلفة المتفق عليها", (r) => <span data-no-i18n>{money(r["agreed_cost"])}</span>, true), c(fx, "status", "Status", "الحالة", chip("status"))]} /></div>}
      </Panel>
      <JobMoney job={j} />
      <Panel title={t("Charge", "التحصيل")} actions={!charge ? <ActionButton compact label={t("Propose charge", "اقتراح التحصيل")} run={() => svc.proposeCharge(id)} /> : null}>
        {charge ? <Facts items={[[t("Proposal", "المقترح"), <DocRef doctype="FSM Charge Proposal" name={charge.name} form />], [t("Coverage decision", "قرار التغطية"), opt(charge["coverage_decision"], ar)], [t("Amount", "المبلغ"), <span data-no-i18n>{money(charge["amount"])}</span>], [t("Basis", "الأساس"), <span data-no-i18n>{(ar ? svc.arRule : svc.enRule)(s(charge["basis"]))}</span>], [t("Hand-off status", "حالة التسليم"), <StateChip value={charge["status"]} />], [t("Sales invoice", "فاتورة المبيعات"), <DocRef doctype="Sales Invoice" name={charge["sales_invoice"]} form />]]} />
          : <p className="text-sm text-muted-foreground">{t("No charge proposal yet. Proposals are created for completed jobs; covered PM work is recorded at zero.", "لا مقترح تحصيل بعد. تُنشأ المقترحات لأوامر العمل المكتملة؛ أعمال الصيانة المغطاة تُسجل بصفر.")}</p>}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- Deficiency 360
const STAGES = ["Open", "Quoted", "Approved for Repair", "Retest Pending", "Verified Closed"];
export function Deficiency360Page({ params }: PluginPageProps) {
  const fx = useFx(); const { t, ar } = fx;
  const id = String(params["id"] ?? ""); const d = list("FSM Deficiency").find((x) => x.name === id);
  const [dup, setDup] = useState("");
  if (!d) return <Missing doctype="FSM Deficiency" name={id} />;
  const st = s(d["workflow_state"]);
  const quotes = list("Quotation").filter((q) => rows(q, "items").some((it) => s(it["digit_fsm_deficiency"]) === id));
  const retests = list("FSM Retest").filter((r) => s(r["deficiency"]) === id);
  const repair = raw("FSM Job", d["repair_job"]);
  const repairVisits = list(VISIT_DT).filter((v) => s(v["job"]) === s(d["repair_job"]));
  const run = raw("FSM Inspection Run", d["source_run"]);
  const srcRow = rows(run, "results").find((x) => s(x["deficiency"]) === id);
  const imps = list("FSM Impairment").filter((i) => s(i["deficiency"]) === id || (s(i["system"]) === s(d["system"]) && s(i["status"]) === "Active"));
  const passed = retests.some((r) => s(r["status"]) === "Passed");
  const others = list("FSM Deficiency").filter((x) => x.name !== id && s(x["site"]) === s(d["site"]) && !["Duplicate"].includes(s(x["workflow_state"])));
  const stageIdx = STAGES.indexOf(st);
  return (
    <div className="w-full min-w-0" data-page="fsm-deficiency360" data-record={id}>
      <PageHeader title={s(d["title"])} crumbs={[{ label: titleOf("FSM Service Site", d["site"]), to: `site/${encodeURIComponent(s(d["site"]))}` }]} band={{
        question: t("Deficiency 360 — from the failed check to a verified closure", "الملاحظة 360 — من البند الراسب إلى الإغلاق بعد التحقق"),
        basis: t("Technical state and customer decision are separate. An accepted quote, a completed repair or a paid invoice never closes the finding — only a reviewed, passing retest does.", "الحالة الفنية وقرار العميل منفصلان. قبول العرض أو إكمال الإصلاح أو سداد الفاتورة لا يغلق الملاحظة — فقط إعادة فحص ناجحة ومراجَعة."),
        meta: [{ label: t("Severity", "الخطورة"), value: opt(d["severity"], ar) }, { label: t("Technical state", "الحالة الفنية"), value: opt(st, ar) }, { label: t("Customer decision", "قرار العميل"), value: opt(d["commercial_decision"], ar) }, { label: t("Opened", "الفتح"), value: <span data-no-i18n>{dateTxt(d["opened_on"])}</span> }],
        actions: <>
          {st === "Open" && !d["quotation"] && <ActionButton band primary label={t("Draft quotation", "إنشاء عرض سعر")} run={() => svc.quoteDeficiencies([id], 0, "FSM-SVC-REPAIR")} />}
          {st === "Quoted" && <><ActionButton band primary label={t("Customer accepted", "قبِل العميل")} run={() => svc.recordDecision(id, "Accepted")} /><ActionButton band label={t("Customer declined", "رفض العميل")} run={() => svc.recordDecision(id, "Declined")} /><ActionButton band label={t("Revise quotation", "مراجعة العرض")} run={() => svc.reviseQuotation(s(d["quotation"]))} /></>}
          {st === "Approved for Repair" && <ActionButton band primary label={t("Create repair job", "إنشاء أمر إصلاح")} run={() => svc.createRepair(id)} />}
          {st === "Retest Pending" && <ActionButton band primary label={t("Verify & close", "تحقق وأغلق")} disabled={!passed} reason={t("Needs a passed, reviewed retest", "يتطلب إعادة فحص ناجحة مراجَعة")} run={() => svc.verifyClose(id)} />}
          <WorkflowButtons doctype="FSM Deficiency" doc={d} except={["Verify Close"]} />
          <DocRef doctype="FSM Deficiency" name={id} form className={BAND.secondary}>{t("Edit", "تعديل")}</DocRef>
        </>,
      }} />
      <ImpairmentBanner system={d["system"]} />
      <div className="mb-4 rounded-xl border bg-card p-3" aria-label={t("Lifecycle", "دورة الحياة")} data-lifecycle={st}>
        <DefChain d={d} />
        {stageIdx < 0 && <p className="mt-2 text-xs text-muted-foreground">{t("Off the repair chain:", "خارج سلسلة الإصلاح:")} {opt(st, ar)}</p>}
      </div>
      <Panel title={t("Origin", "المصدر")}>
        <Facts items={[[t("Site", "الموقع"), <DocRef doctype="FSM Service Site" name={d["site"]} title />], [t("System", "النظام"), <DocRef doctype="FSM Service System" name={d["system"]} title form />], [t("Device", "الجهاز"), <DocRef doctype="FSM Device" name={d["device"]} title />], [t("Source run", "تشغيل الفحص المصدر"), <DocRef doctype="FSM Inspection Run" name={d["source_run"]} />],
          [t("Failed check", "البند الراسب"), <span data-no-i18n>{srcRow ? `${s(srcRow["check_code"])} — ${s(srcRow["check_text"])}${srcRow["measurement"] !== undefined ? ` (${s(srcRow["measurement"])})` : ""}` : s(d["source_check"]) || "—"}</span>], [t("Observation", "الوصف"), <span data-no-i18n>{tv(d["observation"], ar) || "—"}</span>], [t("Duplicate of", "مكررة من"), <DocRef doctype="FSM Deficiency" name={d["duplicate_of"]} />], [t("Times reopened", "مرات إعادة الفتح"), <span data-no-i18n>{numTxt(d["reopen_count"])}</span>]]} />
        {["Open", "Disputed"].includes(st) && <div className="mt-3 flex flex-wrap items-center gap-1.5"><select className={`${INPUT} min-h-8 py-0.5 text-xs`} value={dup} onChange={(e) => setDup(e.target.value)} aria-label={t("Original finding", "الملاحظة الأصلية")}><option value="">{t("Duplicate of…", "مكررة من…")}</option>{others.map((x) => <option key={x.name} value={x.name} data-no-i18n>{x.name} — {s(x["title"]).slice(0, 50)}</option>)}</select><ActionButton compact label={t("Mark duplicate", "تعليم كمكررة")} disabled={!dup} run={() => svc.markDuplicate(id, dup)} />
          {!!d["system"] && <ActionButton compact label={t("Record system impairment", "تسجيل تعطّل النظام")} run={() => svc.openImpairment(s(d["system"]), "Partial / Zone", id)} />}</div>}
      </Panel>
      <Panel title={t("Quotations (native, via bridge lines)", "عروض الأسعار (أصلية عبر سطور الربط)")} subtitle={t("Each revision keeps its own line for this finding; revisions never create extra findings.", "كل مراجعة تحتفظ بسطرها لهذه الملاحظة؛ المراجعات لا تنشئ ملاحظات إضافية.")}>
        <DataTable id="def-quotes" rows={quotes.map((q) => ({ ...q, line: rows(q, "items").find((it) => s(it["digit_fsm_deficiency"]) === id)?.["amount"] }))} searchable={false} empty={t("Not quoted yet.", "لم تُسعّر بعد.")} cols={[c(fx, "name", "Quotation", "عرض السعر", link("Quotation", "name", false, true)), c(fx, "revision_of", "Revision of", "مراجعة لـ", link("Quotation", "revision_of", false, true)), c(fx, "is_latest_revision", "Latest", "الأحدث", (r) => <span>{Number(r["is_latest_revision"]) ? t("Yes", "نعم") : t("No", "لا")}</span>), c(fx, "line", "Line amount", "مبلغ السطر", (r) => <span data-no-i18n>{money(r["line"])}</span>, true), c(fx, "status", "Status", "الحالة", chip("status"))]} />
      </Panel>
      <Panel title={t("Repair & retest", "الإصلاح وإعادة الفحص")}>
        <Facts items={[[t("Repair job", "أمر الإصلاح"), <DocRef doctype="FSM Job" name={d["repair_job"]} />], [t("Repair status", "حالة الإصلاح"), repair ? <StateChip value={repair["workflow_state"]} /> : "—"], [t("Repair visits", "زيارات الإصلاح"), <span data-no-i18n>{repairVisits.length}</span>], [t("Closed", "الإغلاق"), <span data-no-i18n>{dateTxt(d["closed_on"])}</span>]]} />
        <div className="mt-3"><DataTable id="def-retests" rows={retests} searchable={false} empty={t("No retest requirement yet (created with the repair job).", "لا متطلب إعادة فحص بعد (يُنشأ مع أمر الإصلاح).")} cols={[c(fx, "name", "Retest", "إعادة الفحص", link("FSM Retest", "name", false, true)), c(fx, "status", "Status", "الحالة", chip("status")), c(fx, "due_date", "Due", "الاستحقاق", d8("due_date")), c(fx, "retest_run", "Retest run", "تشغيل إعادة الفحص", link("FSM Inspection Run", "retest_run"))]}
          actions={(r) => (!r["retest_run"] || s(r["status"]) === "Failed") ? <ActionButton compact label={t("Create retest run", "إنشاء تشغيل إعادة فحص")} run={() => svc.createRetestRun(s(r.name))} /> : null} /></div>
      </Panel>
      {imps.length > 0 && <Panel title={t("System impairments", "تعطّلات النظام")}><DataTable id="def-imps" rows={imps} searchable={false} empty="—" cols={[c(fx, "name", "Impairment", "التعطّل", link("FSM Impairment", "name", false, true)), c(fx, "scope", "Scope", "النطاق", tx("scope", fx)), c(fx, "started_on", "Started", "البداية", dt8("started_on")), c(fx, "status", "Status", "الحالة", chip("status"))]} actions={(r) => s(r["status"]) === "Active" ? <ActionButton compact label={t("Restore", "إعادة للخدمة")} run={() => svc.restoreImpairment(s(r.name))} /> : null} /></Panel>}
      <p className="text-xs text-muted-foreground"><ListRef doctype="FSM Deficiency">{t("All findings", "كل الملاحظات")}</ListRef> · <AppLink to={`reports/RP06?site=${encodeURIComponent(s(d["site"]))}`}>{t("Finding lifecycle report (RP06)", "تقرير دورة حياة الملاحظات (RP06)")}</AppLink></p>
    </div>
  );
}
