import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * F3-05 customer inspection report preview (N43): the run as the customer will receive it — letterhead, both languages,
 * pass / fail summary in colour, the device list, findings with their photos, inaccessible devices with the reason,
 * technician / customer / reviewer signatures and a «مسودة · DRAFT» watermark until the run is published. Read only:
 * publishing stays the workflow action (services.publishRun), which freezes the revision.
 */
import type { PluginPageProps } from "@/plugins/pages";
import { Bil, Pill, ReportSheet, SheetSection } from "@/components/enterprise/kit";
import { list, raw, rows } from "../domain/data";
import { runCoverage, s, technicalResult } from "../domain/rules";
import * as svc from "../domain/services";
import { nm } from "./dayBoard";
import { deviceState, tv } from "./runWalk";
import { ActionButton, AppLink, Missing, PageHeader, dtTxt, numTxt, opt, useFx } from "./kit";

const RESULT_TONE: Record<string, "ok" | "bad" | "warn" | "neutral"> = { Pass: "ok", Fail: "bad", Incomplete: "warn", Pending: "neutral" };
const enc = encodeURIComponent;

export function ReportPreviewPage({ params }: PluginPageProps) {
  const { t, ar } = useFx(); const id = String(params["id"] ?? "");
  const run = list("FSM Inspection Run").find((x) => x.name === id);
  if (!run) return <Missing doctype="FSM Inspection Run" name={id} />;
  const results = rows(run, "results"); const state = s(run["workflow_state"]); const draft = state !== "Published";
  const cov = runCoverage(results, Number(run["expected_devices"]) || undefined); const tr = s(run["technical_result"]) || technicalResult(results);
  const site = raw("FSM Service Site", run["site"]); const visit = raw(VISIT_DT, run["visit"]); const company = raw("Company", run["company"] ?? site?.["company"]);
  const rev = list("FSM Report Revision").filter((x) => s(x["run"]) === id).sort((a, b) => Number(b["revision"] ?? 0) - Number(a["revision"] ?? 0))[0];
  const n = (o: string) => results.filter((r) => (s(r["outcome"]) || "Untested") === o).length;
  const byDev = new Map<string, typeof results>(); for (const r of results) { const k = s(r["device"]); if (!k) continue; const l = byDev.get(k) ?? []; l.push(r); byDev.set(k, l); }
  const fails = results.filter((r) => s(r["outcome"]) === "Fail"); const inacc = results.filter((r) => s(r["outcome"]) === "Inaccessible");
  const sigImg = s(visit?.["customer_signature"]); const tech = visit?.["technician"];
  const stPill = (st: string) => st === "done" ? <Pill tone="ok">{t("Pass", "ناجح")}</Pill> : st === "fail" ? <Pill tone="bad">{t("Fail", "راسب")}</Pill> : st === "inacc" ? <Pill tone="warn">{t("Inaccessible", "تعذر الوصول")}</Pill> : st === "na" ? <Pill tone="neutral">{t("N/A", "لا ينطبق")}</Pill> : <Pill tone="warn">{t("Untested", "لم يُفحص")}</Pill>;
  return (
    <div className="w-full min-w-0" data-page="fsm-report-preview" data-record={id}>
      <PageHeader title={t("Customer inspection report", "تقرير الفحص للعميل")} crumbs={[{ label: id, to: `run/${enc(id)}` }]} band={{
        question: t("What will the customer receive for this inspection?", "ماذا سيستلم العميل عن هذا الفحص؟"),
        basis: t("Built from the run's own results, findings, photos and sign-offs. Until the run is published the page carries the draft watermark.", "مبني من نتائج التشغيل وملاحظاته وصوره وتوقيعاته. حتى نشر التشغيل تحمل الصفحة علامة المسودة."),
        meta: [{ label: t("Run status", "حالة التشغيل"), value: opt(state, ar) }, { label: t("Revision", "الإصدار"), value: <span data-no-i18n>{rev ? `${rev.name} · ${s(rev["revision"])}` : "—"}</span> }],
        actions: <>
          <button type="button" className="btn-secondary inline-flex min-h-9 items-center px-3 text-sm" onClick={() => window.print()} data-report-print>{t("Print", "طباعة")}</button>
          {state === "Reviewed" && <ActionButton band primary label={t("Publish report", "نشر التقرير")} run={() => svc.publishRun(id)} />}
          <AppLink to={`run/${enc(id)}`} className="btn-secondary inline-flex min-h-9 items-center px-3 text-sm">{t("Back to the run", "العودة إلى التشغيل")}</AppLink>
        </>,
      }} />
      <ReportSheet ar={ar} draft={draft} title={["Fire & life-safety inspection report", "تقرير فحص أنظمة الحريق والسلامة"]}
        reference={<>{rev ? rev.name : id}{rev ? ` · Rev ${s(rev["revision"])}` : ""}</>}
        letterhead={{ name: <span data-no-i18n>{s(company?.["company_name"]) || s(run["company"]) || s(site?.["company"]) || "—"}</span>, lines: [<span key="t" data-no-i18n>{[company?.["tax_id"] ? `VAT ${s(company["tax_id"])}` : "", s(company?.["phone_no"]), s(company?.["email"])].filter(Boolean).join(" · ") || " "}</span>] }}
        meta={[
          { label: ["Customer", "العميل"], value: <span data-no-i18n>{nm("Customer", site?.["customer"], ar)}</span> },
          { label: ["Site", "الموقع"], value: <span data-no-i18n>{nm("FSM Service Site", run["site"], ar)}{site?.["city"] ? ` · ${nm("City", site["city"], ar) || s(site["city"])}` : ""}</span> },
          { label: ["System", "النظام"], value: <span data-no-i18n>{nm("FSM Service System", run["system"], ar)}</span> },
          { label: ["Inspection date", "تاريخ الفحص"], value: <span data-no-i18n>{dtTxt(visit?.["completed_on"] ?? run["submitted_on"]) || "—"}</span> },
          { label: ["Template", "القالب"], value: <span data-no-i18n>{nm("FSM Inspection Template", run["template"], ar)} v{s(run["template_version"])}</span> },
          { label: ["Technical result", "النتيجة الفنية"], value: <Pill tone={RESULT_TONE[tr] ?? "neutral"}>{opt(tr, ar)}</Pill> },
        ]}
        signatures={[
          { label: ["Technician", "الفني"], name: tech ? nm("FSM Technician", tech, ar) : undefined, at: dtTxt(visit?.["completed_on"]) || undefined },
          { label: ["Customer representative", "ممثل العميل"], name: s(visit?.["signed_by"]) || undefined, at: dtTxt(visit?.["signed_on"]) || undefined, image: sigImg.startsWith("data:") ? sigImg : undefined },
          { label: ["Technical reviewer", "المراجع الفني"], name: s(run["reviewed_by"]) || undefined, at: dtTxt(run["reviewed_on"]) || undefined },
        ]}
        foot={<Bil pair={["Generated from DIGIT records. A published revision is immutable; a correction is issued as a new revision.", "صادر من سجلات ديجيت. الإصدار المنشور لا يُعدَّل؛ أي تصحيح يصدر كإصدار جديد."]} ar={ar} />}>
        <SheetSection title={["Summary", "الملخص"]} ar={ar} attrs={{ "data-sheet-summary": "" }}>
          <div className="fsm-rp-sum">
            <span data-tone="ok"><b data-no-i18n>{n("Pass")}</b><Bil pair={["checks passed", "بند ناجح"]} ar={ar} /></span>
            <span data-tone="bad"><b data-no-i18n>{n("Fail")}</b><Bil pair={["checks failed", "بند راسب"]} ar={ar} /></span>
            <span data-tone="warn"><b data-no-i18n>{cov.inaccessibleDevices}</b><Bil pair={["devices inaccessible", "جهاز تعذر الوصول إليه"]} ar={ar} /></span>
            <span><b data-no-i18n>{n("Not Applicable")}</b><Bil pair={["not applicable", "لا ينطبق"]} ar={ar} /></span>
            <span data-tone={cov.coverage === 1 ? "ok" : "warn"}><b data-no-i18n>{cov.coverage === null ? "—" : `${numTxt(cov.coverage * 100, 0)}%`}</b><Bil pair={[`coverage (${cov.inspected}/${cov.expected})`, `التغطية (${cov.inspected}/${cov.expected})`]} ar={ar} /></span>
          </div>
        </SheetSection>
        <SheetSection title={["Devices", "الأجهزة"]} ar={ar} attrs={{ "data-sheet-devices": String(byDev.size) }}>
          <table><thead><tr><th><Bil pair={["Device", "الجهاز"]} ar={ar} /></th><th><Bil pair={["Location", "المكان"]} ar={ar} /></th><th><Bil pair={["Checks", "البنود"]} ar={ar} /></th><th><Bil pair={["Result", "النتيجة"]} ar={ar} /></th></tr></thead>
            <tbody>{[...byDev].map(([d, rs]) => { const dev = raw("FSM Device", d); return <tr key={d}><td data-no-i18n>{nm("FSM Device", d, ar)}</td><td data-no-i18n>{dev?.["location"] ? nm("FSM Location Node", dev["location"], ar) : "—"}</td><td data-no-i18n>{rs.filter((x) => s(x["outcome"]) === "Pass").length}/{rs.length}</td><td>{stPill(deviceState(rs))}</td></tr>; })}</tbody></table>
        </SheetSection>
        <SheetSection title={["Findings", "الملاحظات"]} ar={ar} attrs={{ "data-sheet-findings": String(fails.length) }}>
          {!fails.length ? <p className="text-sm"><Bil pair={["No failed check — no finding raised.", "لا بند راسب — لا ملاحظات."]} ar={ar} /></p> :
          <ol className="fsm-rp-find">{fails.map((r) => { const df = raw("FSM Deficiency", r["deficiency"]); const ph = svc.resultPhotos(id, s(r["name"]));
            return <li key={s(r["name"])} data-sev={s(df?.["severity"])}>
              <p className="fsm-rp-ft"><span data-no-i18n>{nm("FSM Device", r["device"], ar) || t("System", "النظام")} — {s(r["check_code"])} {tv(r["check_text"], ar)}</span>{df?.["severity"] ? <Pill tone={s(df["severity"]) === "Critical" ? "bad" : "warn"}>{opt(df["severity"], ar)}</Pill> : null}</p>
              {r["measurement"] !== undefined && <p className="text-xs" data-no-i18n>{ar ? "القياس" : "Measurement"}: {s(r["measurement"])}</p>}
              {df && <p className="text-xs text-muted-foreground" data-no-i18n>{df.name} · {tv(df["title"], ar)}</p>}
              {ph.length > 0 ? <div className="fsm-rp-ph">{ph.map((p) => <img key={p.name} src={s(p["file_url"])} alt={s(p["file_name"])} />)}</div> : r["evidence_required"] ? <p className="text-xs" style={{ color: "var(--ek-risk)" }}><Bil pair={["Photo required — not attached", "الصورة مطلوبة — غير مرفقة"]} ar={ar} /></p> : null}
            </li>; })}</ol>}
        </SheetSection>
        {inacc.length > 0 && <SheetSection title={["Devices not reached", "أجهزة تعذر الوصول إليها"]} ar={ar} attrs={{ "data-sheet-inaccessible": String(inacc.length) }}>
          <ul className="fsm-rp-inacc">{inacc.map((r) => <li key={s(r["name"])}><span data-no-i18n>{nm("FSM Device", r["device"], ar)} — {s(r["check_code"])}</span> · <span data-no-i18n>{s(r["note"]) || (ar ? "لم يُذكر سبب" : "no reason recorded")}</span></li>)}</ul>
        </SheetSection>}
      </ReportSheet>
    </div>
  );
}
