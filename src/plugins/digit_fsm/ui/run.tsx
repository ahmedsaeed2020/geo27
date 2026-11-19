import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * Inspection run execution (N39/N40, W03 + W07). Results are recorded per device and per check against the frozen
 * template version of the run; measurements outside the template range fail the check automatically; every change
 * appends an FSM Result Event. Access (Inaccessible) is a separate outcome from Not Applicable. Submission is refused by
 * the controller hook while checks are Untested; after submission results are locked until the reviewer returns the run.
 */
import { useMemo, useState } from "react";
import type { PluginPageProps } from "@/plugins/pages";
import { list, raw, rows, titleOf } from "../domain/data";
import { runCoverage, s, technicalResult, type Row } from "../domain/rules";
import * as svc from "../domain/services";
import { OutcomePad } from "@/components/enterprise/kit";
import { ActionButton, AppLink, DataTable, DocRef, Facts, INPUT, Kpi, Missing, PageHeader, Panel, ReasonAction, SignalGrid, StateChip, WorkflowButtons, dtTxt, notify, numTxt, opt, useFx } from "./kit";
import { ImpairmentBanner } from "./riskBits";
import { RunWalk, outcomeOptions, tv } from "./runWalk";

function MeasureInput({ run, row, unit, locked }: { run: string; row: Row; unit: string; locked: boolean }) {
  const { t, ar } = useFx(); const [v, setV] = useState(row["measurement"] == null ? "" : String(row["measurement"]));
  const commit = () => { if (v === (row["measurement"] == null ? "" : String(row["measurement"]))) return; const r = svc.recordResult(run, s(row["name"]), { measurement: v === "" ? "" : Number(v) }); notify(r, ar); };
  return (
    <span className="inline-flex items-center gap-1">
      <input type="number" inputMode="decimal" step="any" className={`${INPUT} min-h-8 w-24 py-0.5 text-xs`} value={v} disabled={locked} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} aria-label={`${t("Measurement", "القياس")} ${s(row["check_code"])}`} data-measure={s(row["name"])} />
      <span className="text-xs text-muted-foreground" data-no-i18n>{unit}</span>
    </span>
  );
}

export function RunPage({ params }: PluginPageProps) {
  const fx = useFx(); const { t, ar } = fx;
  const id = String(params["id"] ?? ""); const run = list("FSM Inspection Run").find((x) => x.name === id);
  const [device, setDevice] = useState("");
  const tpl = raw("FSM Inspection Template", run?.["template"]);
  const checks = useMemo(() => new Map(rows(tpl, "checks").map((c) => [s(c["check_code"]), c])), [tpl]);
  if (!run) return <Missing doctype="FSM Inspection Run" name={id} />;
  const results = rows(run, "results");
  const state = s(run["workflow_state"]);
  const locked = !["Draft", "In Progress"].includes(state) || !svc.can("FSM Inspection Run", "write", run);
  const cov = runCoverage(results, Number(run["expected_devices"]) || undefined);
  const tr = technicalResult(results);
  const devices = [...new Set(results.map((r) => s(r["device"])))];
  const shown = results.filter((r) => !device || s(r["device"]) === (device === "__sys" ? "" : device));
  const events = list("FSM Result Event").filter((e) => s(e["run"]) === id).sort((a, b) => s(b["recorded_on"]).localeCompare(s(a["recorded_on"]))).slice(0, 30);
  const revs = list("FSM Report Revision").filter((x) => s(x["run"]) === id);
  const retest = run["retest_for"] ? list("FSM Retest").find((x) => s(x["retest_run"]) === id) : undefined;
  const fails = results.filter((r) => s(r["outcome"]) === "Fail");
  const unraised = fails.filter((r) => !r["deficiency"]).length;
  const lastDecision = s(list("Comment").filter((c) => s(c["reference_doctype"]) === "FSM Inspection Run" && s(c["reference_name"]) === id && c["digit_review_decision"]).sort((a, b) => s(b["creation"]).localeCompare(s(a["creation"])))[0]?.["digit_review_decision"]);
  return (
    <div className="w-full min-w-0" data-page="fsm-run" data-record={id}>
      <PageHeader title={`${t("Inspection run", "تشغيل الفحص")} ${id}`} crumbs={[{ label: titleOf("FSM Job", run["job"]), to: `job/${encodeURIComponent(s(run["job"]))}` }]} band={{
        question: run["retest_for"] ? t("Retest — does the repaired check now pass on the original device?", "إعادة الفحص — هل ينجح البند بعد الإصلاح على الجهاز الأصلي؟") : t("Record every check of this system, then submit for technical review", "سجّل كل بنود فحص هذا النظام ثم قدّمها للمراجعة الفنية"),
        basis: t("Population frozen from the template version when the run was created. Pass only when every applicable check passed; Inaccessible is not Not Applicable; a run with Untested checks cannot be submitted.", "المجتمع مجمّد من إصدار القالب عند إنشاء التشغيل. النجاح فقط عند نجاح كل البنود المنطبقة؛ تعذر الوصول ليس «لا ينطبق»؛ لا يُقدَّم تشغيل فيه بنود لم تُفحص."),
        meta: [{ label: t("System", "النظام"), value: <span data-no-i18n>{titleOf("FSM Service System", run["system"])}</span> }, { label: t("Template", "القالب"), value: <span data-no-i18n>{tv(titleOf("FSM Inspection Template", run["template"]), ar)} v{s(run["template_version"])}</span> }, { label: t("Status", "الحالة"), value: opt(state, ar) }, { label: t("Technical result", "النتيجة الفنية"), value: opt(tr, ar) }],
        actions: <>
          {["Draft", "In Progress"].includes(state) && !locked && cov.untestedChecks > 0 && <ReasonAction label={t("Mark untested as inaccessible", "تعليم غير المفحوص كمتعذر الوصول")} placeholder={t("Why could these devices not be reached?", "لماذا تعذر الوصول إلى هذه الأجهزة؟")} run={(x) => svc.bulkOutcome(id, "Inaccessible", device && device !== "__sys" ? device : undefined, x)} />}
          <AppLink to={`report-preview/${encodeURIComponent(id)}`} className="btn-secondary inline-flex min-h-9 items-center px-3 text-sm">{t("Customer report preview", "معاينة تقرير العميل")}</AppLink>
          {fails.length > 0 && !run["retest_for"] && <ActionButton band primary={unraised > 0} label={t(`Raise findings (${unraised})`, `إنشاء الملاحظات (${unraised})`)} disabled={!unraised} reason={t("Every failed check already has its finding", "كل بند راسب له ملاحظته")} run={() => svc.raiseDeficiencies(id)} />}
          {state === "Submitted for Review" && <ReasonAction label={t("Return to technician", "إعادة للفني")} placeholder={t("What must be corrected?", "ما الذي يجب تصحيحه؟")} run={(x) => svc.returnRun(id, x)} />}
          {state === "Reviewed" && <ActionButton band primary label={t("Publish report", "نشر التقرير")} run={() => svc.publishRun(id)} />}
          {retest && ["Reviewed", "Published"].includes(state) && <ActionButton band label={t("Apply retest result", "تطبيق نتيجة إعادة الفحص")} run={() => svc.recordRetest(retest.name, id)} />}
          <WorkflowButtons doctype="FSM Inspection Run" doc={run} except={["Return", "Publish"]} />
        </>,
      }} />
      <SignalGrid cols={6}>
        <Kpi label={t("Expected devices", "الأجهزة المتوقعة")} value={numTxt(cov.expected)} basis={t("Frozen snapshot", "لقطة مجمدة")} />
        <Kpi label={t("Devices inspected", "الأجهزة المفحوصة")} value={numTxt(cov.inspected)} tone={cov.inspected === cov.expected ? "good" : "warn"} basis={t("Every applicable check Pass/Fail", "كل بند منطبق ناجح/راسب")} />
        <Kpi label={t("Coverage", "التغطية")} value={cov.coverage === null ? "—" : numTxt(cov.coverage * 100, 1)} unit="%" tone={cov.coverage === 1 ? "good" : "warn"} basis={t("Inspected ÷ expected devices", "المفحوص ÷ المتوقع")} />
        <Kpi label={t("Failed checks", "بنود راسبة")} value={numTxt(cov.failChecks)} tone={cov.failChecks ? "bad" : "good"} basis={t(`${cov.failedDevices} device(s)`, `${cov.failedDevices} جهاز`)} />
        <Kpi label={t("Inaccessible devices", "أجهزة تعذر الوصول")} value={numTxt(cov.inaccessibleDevices)} tone={cov.inaccessibleDevices ? "warn" : "good"} basis={t("Access, not a result", "وصول وليس نتيجة")} />
        <Kpi label={t("Untested checks", "بنود لم تُفحص")} value={numTxt(cov.untestedChecks)} tone={cov.untestedChecks ? "warn" : "good"} basis={t("Blocks submission", "تمنع التقديم")} />
      </SignalGrid>
      <ImpairmentBanner system={run["system"]} />
      {s(run["return_reason"]) && ["Draft", "In Progress"].includes(state) && <div className="mb-4 rounded-md border border-dx-warn/40 bg-dx-warn-soft px-4 py-3 text-sm text-dx-warn" role="alert"><strong>{lastDecision === "reject" ? t("Rejected by the reviewer:", "رفضه المراجع:") : lastDecision === "changes" ? t("The reviewer asked for changes:", "طلب المراجع تعديلًا:") : t("Returned by reviewer:", "أعاده المراجع:")}</strong> <span data-no-i18n>{s(run["return_reason"])}</span></div>}
      <RunWalk run={run} locked={locked} />
      <Panel title={t("All checks (table)", "كل البنود (جدول)")} subtitle={locked ? t("Results are locked (submitted, reviewed or no write permission).", "النتائج مقفلة (مقدّمة أو مراجَعة أو لا توجد صلاحية كتابة).") : t("Choose an outcome per check; measurements outside the template range fail automatically.", "اختر نتيجة لكل بند؛ القياس خارج نطاق القالب يرسب تلقائياً.")}
        actions={<select className={`${INPUT} min-h-8 py-0.5 text-xs`} value={device} onChange={(e) => setDevice(e.target.value)} aria-label={t("Device", "الجهاز")} data-device-filter><option value="">{t("All devices", "كل الأجهزة")}</option>{devices.map((d) => <option key={d || "sys"} value={d || "__sys"} data-no-i18n>{d ? titleOf("FSM Device", d) : t("System-level checks", "بنود مستوى النظام")}</option>)}</select>}>
        <DataTable id="run-results" rows={shown} pageSize={40} empty={t("No result rows.", "لا صفوف نتائج.")} cols={[
          { key: "device", label: t("Device", "الجهاز"), value: (r) => titleOf("FSM Device", r["device"]), render: (r) => (r["device"] ? <DocRef doctype="FSM Device" name={r["device"]} title /> : <span className="text-muted-foreground">{t("System", "النظام")}</span>) },
          { key: "check_code", label: t("Check", "البند"), value: (r) => s(r["check_code"]), render: (r) => <span data-no-i18n><span className="font-mono text-xs text-muted-foreground">{s(r["check_code"])}</span> {tv(r["check_text"], ar)}{r["evidence_required"] ? " 📷" : ""}</span> },
          { key: "outcome", label: t("Outcome", "النتيجة"), value: (r) => s(r["outcome"]), render: (r) => locked ? <StateChip value={r["outcome"] || "Untested"} /> : (
            <OutcomePad id={`t-${s(r["name"])}`} value={s(r["outcome"]) === "Untested" ? "" : s(r["outcome"])} options={outcomeOptions(ar)} ar={ar} note={s(r["note"])} onPick={(k, why) => notify(svc.recordResult(id, s(r["name"]), why ? { outcome: k, note: why } : { outcome: k }), ar)} />) },
          { key: "measurement", label: t("Measurement", "القياس"), value: (r) => Number(r["measurement"] ?? 0), render: (r) => { const c = checks.get(s(r["check_code"])); if (!c || (c["min_value"] === undefined && c["max_value"] === undefined && !c["unit"])) return <span className="text-muted-foreground">—</span>;
            return locked ? <span data-no-i18n>{r["measurement"] === undefined ? "—" : `${s(r["measurement"])} ${s(c["unit"])}`}</span> : <span className="inline-flex flex-col gap-0.5"><MeasureInput run={id} row={r} unit={s(c["unit"])} locked={locked} /><span className="text-[11px] text-muted-foreground" data-no-i18n>{[c["min_value"] !== undefined ? `≥ ${s(c["min_value"])}` : "", c["max_value"] !== undefined ? `≤ ${s(c["max_value"])}` : ""].filter(Boolean).join("  ")}</span></span>; } },
          { key: "deficiency", label: t("Finding", "الملاحظة"), value: (r) => s(r["deficiency"]), render: (r) => <DocRef doctype="FSM Deficiency" name={r["deficiency"]} /> },
        ]} />
      </Panel>
      <Panel title={t("Run details", "تفاصيل التشغيل")}>
        <Facts items={[[t("Job", "أمر العمل"), <DocRef doctype="FSM Job" name={run["job"]} />], [t("Visit", "الزيارة"), <DocRef doctype={VISIT_DT} name={run["visit"]} form />], [t("Site", "الموقع"), <DocRef doctype="FSM Service Site" name={run["site"]} title />], [t("Retest of finding", "إعادة فحص للملاحظة"), <DocRef doctype="FSM Deficiency" name={run["retest_for"]} />],
          [t("Submitted", "التقديم"), <span data-no-i18n>{dtTxt(run["submitted_on"])}</span>], [t("Reviewed", "المراجعة"), <span data-no-i18n>{dtTxt(run["reviewed_on"])}</span>], [t("Times returned", "مرات الإعادة"), <span data-no-i18n>{numTxt(run["return_count"])}</span>], [t("Native form", "النموذج الأصلي"), <DocRef doctype="FSM Inspection Run" name={id} form>{t("Open form", "فتح النموذج")}</DocRef>]]} />
      </Panel>
      {revs.length > 0 && <Panel title={t("Published revisions", "الإصدارات المنشورة")} subtitle={t("Immutable snapshots; a new publication supersedes the previous one.", "لقطات غير قابلة للتعديل؛ النشر الجديد يستبدل السابق.")}>
        <DataTable id="run-revs" rows={revs} searchable={false} empty="—" cols={[{ key: "name", label: t("Revision", "الإصدار"), render: (r) => <DocRef doctype="FSM Report Revision" name={r.name} form /> }, { key: "revision", label: t("Rev.", "رقم"), numeric: true }, { key: "technical_result", label: t("Result", "النتيجة"), render: (r) => <StateChip value={r["technical_result"]} /> }, { key: "published_on", label: t("Published", "النشر"), render: (r) => <span data-no-i18n>{dtTxt(r["published_on"])}</span> }, { key: "status", label: t("Status", "الحالة"), render: (r) => <StateChip value={r["status"]} /> }]} />
      </Panel>}
      <Panel title={t("Result events (audit)", "أحداث النتائج (تدقيق)")} actions={<AppLink to={`reports/RP02?system=${encodeURIComponent(s(run["system"]))}`}>{t("Device results (RP02)", "نتائج الأجهزة (RP02)")}</AppLink>}>
        <DataTable id="run-events" rows={events} searchable={false} empty={t("No result recorded yet.", "لم تُسجل نتائج بعد.")} cols={[{ key: "recorded_on", label: t("When", "الوقت"), render: (r) => <span data-no-i18n>{dtTxt(r["recorded_on"])}</span> }, { key: "check_code", label: t("Check", "البند") }, { key: "device", label: t("Device", "الجهاز"), render: (r) => <DocRef doctype="FSM Device" name={r["device"]} title /> }, { key: "previous_outcome", label: t("From", "من"), render: (r) => <StateChip value={r["previous_outcome"]} /> }, { key: "new_outcome", label: t("To", "إلى"), render: (r) => <StateChip value={r["new_outcome"]} /> }, { key: "recorded_by", label: t("By", "بواسطة") }]} />
      </Panel>
    </div>
  );
}
