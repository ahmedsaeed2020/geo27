/**
 * Construction's form panel on native and app forms (experience slot FormPanels, shown only inside the Construction app):
 *  - non-blocking notices (ENTERPRISE_NEEDS #4, owner ruling 2026-11-14: no budget limit set = warning only) from
 *    domain/costControl.ts costWarnings, in one amber notice that never stops saving or submitting;
 *  - the Create-From / service buttons the test run listed for the shared screens (ENTERPRISE_NEEDS #17, #20, #21),
 *    each calling the existing service in domain/services.ts (role check, idempotent «Already exists», refusal shown).
 *  - owner UX depth round: «Document rules — checked while typing» (the department rule hook run on the unsaved
 *    values: the exact refusal message the save would return, then the approved rule list from the prototype) and
 *    «Inspired by» (the research systems of the approved prototype, ux/docGuide.generated.json).
 * Display and dispatch only — every write stays in services.ts.
 */
import type { FormPanelProps } from "../../experienceSlots";
import { useLang } from "@/i18n";
import { adapter, type Doc } from "@/lib/adapter";
import { useEffect, useMemo, useState } from "react";
import { costWarnings } from "../domain/costControl";
import { computeDoc, hasHook } from "../domain/hooks";
import * as FN from "../domain/finance";
import { ruleMessageAr } from "../i18n/ruleMessages";
import * as SV from "../domain/services";
import { ActionButton, DocRef, ListRef, dateTxt, useCx } from "./kit";
import { RequirementCards } from "@/components/enterprise/kit/RequirementCards";
import { prequalRequirements } from "../domain/subcontract";
import { closeoutRequirements } from "../domain/finance";
import { notifyError, notifySaved } from "./notify";
import { BidLevelingBoard, RfqComparison } from "./compare";
import { DecisionPanel } from "./decision";
import { DayHoursPanel } from "./boards";
import { isDecisionDoctype } from "../domain/changePage";

const WARN_DOCTYPES = new Set(["Purchase Order", "Purchase Invoice", "Payment Entry"]);
const rowsOf = (d: Doc | undefined, f: string) => (Array.isArray(d?.[f]) ? (d![f] as Record<string, unknown>[]) : []);
const today = () => new Date().toISOString().slice(0, 10);

export function constructionFormWarnings(doctype: string, name: string): { en: string; ar: string }[] {
  if (!WARN_DOCTYPES.has(doctype) || !name || name.startsWith("new-")) return [];
  const d = adapter.get(doctype, name); if (!d) return [];
  const bi = (m: string) => ({ en: m, ar: ruleMessageAr(m) });
  // DEC-064: paying a non-compliant subcontractor is allowed — shown as information and logged on submit (finance.ts)
  if (doctype === "Payment Entry") return Number(d["docstatus"] ?? 0) === 0 ? FN.paymentComplianceWarnings(d).map(bi) : [];
  const out = costWarnings(doctype as "Purchase Order" | "Purchase Invoice", name);
  // F09-14-1: an order over its revised budget is submitted with the reason in «Override reason», written to the override log
  if (doctype === "Purchase Order" && Number(d["docstatus"] ?? 0) === 0) for (const m of FN.poBudgetWarnings(d)) out.push({ en: `${m} — enter the override reason before submitting; it is logged`, ar: `${ruleMessageAr(m)} — أدخل سبب التجاوز قبل الاعتماد؛ ويُسجَّل في سجل التجاوزات` });
  return out;
}

export interface FormAction { id: string; en: string; ar: string; run: () => SV.Result }
/** The service buttons a saved document offers (shown when the document is in the state the service accepts; the service still checks the role). */
export function constructionFormActions(doctype: string, name: string, ask: (q: string, def?: string) => string | null = () => null, confirm: (q: string) => boolean = () => false): FormAction[] {
  const d = name && !name.startsWith("new-") ? adapter.get(doctype, name) : undefined; if (!d) return [];
  const ds = Number(d["docstatus"] ?? 0); const out: FormAction[] = [];
  if (doctype === "Material Request" && ds === 1) out.push({ id: "shortage", en: "Create shortage request", ar: "إنشاء طلب للنواقص", run: () => SV.createShortageRequest(name) });
  if (doctype === "Purchase Order" && ds === 1) {
    const open = rowsOf(d, "items").filter((r) => r["digit_promised_date"] && r["digit_promised_date"] !== r["schedule_date"]);
    if (open.length) out.push({ id: "promise", en: "Accept supplier dates", ar: "قبول مواعيد المورد", run: () => {
      for (const r of open) { const x = SV.acceptPromisedDate(name, String(r["name"] ?? "")); if (!x.ok) return x; }
      return { ok: true, doctype, name, errors: [] };
    } });
  }
  if (doctype === "Digit Issue Request" && ds === 1) out.push({ id: "issue", en: "Create stock entry", ar: "إنشاء قيد مخزني", run: () => SV.createIssueEntry(name) });
  if (doctype === "Digit Field Attendance" && ds === 0) out.push({ id: "crew", en: "Fill from crew", ar: "التعبئة من الطاقم", run: () => SV.fillAttendanceFromCrew(name) });
  if (doctype === "Digit WIP Adjustment" && ds === 0 && d["project"]) out.push({ id: "wipfill", en: "Fill from project", ar: "التعبئة من المشروع", run: () => SV.fillWipFromProject(name) });
  if (doctype === "Payment Entry" && ds === 1 && d["party_type"] === "Supplier") out.push({ id: "remit", en: "Send remittance notice", ar: "إرسال إشعار السداد", run: () => SV.remittanceAdvice(name) });
  // owner round 2026-11-14: the five journey links (each opens one draft and links back)
  if (doctype === "Digit Budget Revision" && ds === 1 && d["workflow_state"] === "Approved") out.push({ id: "po-brv", en: "Create purchase order", ar: "إنشاء أمر شراء", run: () => SV.purchaseOrderFromBudgetRevision(name) });
  if (doctype === "Digit Tender" && !["Lost", "Cancelled"].includes(String(d["status"]))) out.push({ id: "takeoff", en: "Create takeoff sheet", ar: "إنشاء ورقة حصر كميات", run: () => SV.takeoffFromTender(name) });
  if (doctype === "Digit Change Event" && d["workflow_state"] === "Approved") out.push({ id: "variation", en: "Create client variation", ar: "إنشاء أمر تغيير للعميل", run: () => {
    const linked = String(d["variation"] || d["associated_variation"] || "");
    return linked && adapter.get("Digit Client Variation", linked) ? { ok: true, doctype: "Digit Client Variation", name: linked, existing: true, errors: [] } : SV.variationFromEvents([name]);
  } });
  if (doctype === "Digit Drawing") out.push({ id: "transmittal", en: "Create transmittal", ar: "إنشاء خطاب إرسال", run: () => SV.transmittalFromDrawing(name) });
  if (doctype === "Digit Transmittal") out.push({ id: "inspection", en: "Request inspection", ar: "طلب فحص", run: () => SV.inspectionFromTransmittal(name) });
  if (doctype === "Digit Crew" && d["status"] === "Active") out.push({ id: "mu-crew", en: "Record machinery usage", ar: "تسجيل استخدام معدة", run: () => SV.machineryUsageFromCrew(name) });
  if (doctype === "Project") {
    out.push({ id: "snapshot", en: "Create snapshot", ar: "إنشاء لقطة", run: () => {
      const code = ask("Snapshot code", `SNAP-${today().slice(0, 7)}`); if (code === null) return { ok: false, errors: [] };
      const r = SV.createJobSnapshot(name, today(), code);
      return r.existing && !r.ok && confirm(r.errors.join("\n")) ? SV.createJobSnapshot(name, today(), code, true) : r;
    } });
    out.push({ id: "curve", en: "Spread by curve", ar: "التوزيع حسب المنحنى", run: () => {
      const total = ask("Total to spread (SAR)"); if (total === null) return { ok: false, errors: [] };
      const curve = ask("Monthly percentages (sum 100)", "25,25,25,25"); if (curve === null) return { ok: false, errors: [] };
      const start = ask("First month (YYYY-MM-DD)", today()); if (start === null) return { ok: false, errors: [] };
      const r = SV.spreadCashflowCurve({ project: name, total: Number(total), curve: curve.split(/[,\s]+/).filter(Boolean).map(Number), start });
      return r.ok ? { ...r, doctype: "Project", name } : r;
    } });
  }
  return out;
}

async function compileManual(project: string, t: (en: string, ar: string) => string) {
  const r = await SV.exportOmManual(project);
  if (!r.ok || !r.zip) { notifyError(t("Action not completed", "لم يكتمل الإجراء"), { description: r.errors.join("\n") }); return; }
  const url = URL.createObjectURL(new Blob([r.zip as BlobPart], { type: "application/zip" }));
  const a = document.createElement("a"); a.href = url; a.download = `om-manual-${project}.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  notifySaved(t("O&M manual compiled", "تم تجميع دليل التشغيل والصيانة"));
}

export function ConstructionFormNotices({ meta, doc, dirty }: FormPanelProps) {
  const lang = useLang(); const ar = lang === "ar"; const { t } = useCx();
  const name = String(doc["name"] ?? "");
  const ws = constructionFormWarnings(meta.name, name);
  const ask = (q: string, def = "") => window.prompt(q, def);
  const acts = dirty ? [] : constructionFormActions(meta.name, name, ask, (q) => window.confirm(q));
  const manual = !dirty && meta.name === "Project" && !!adapter.get("Project", name);
  const guide = useDocGuide(meta.name);
  const draft = Number(doc["docstatus"] ?? 0) === 0;
  // the department rule hook on the values as typed (pure (doc, before) rule; `after` side effects are never run here)
  const live = useMemo(() => {
    if (!draft || !hasHook(meta.name)) return [] as string[];
    try { return computeDoc(meta.name, JSON.parse(JSON.stringify(doc)) as Doc, name && !name.startsWith("new-") ? adapter.get(meta.name, name) : undefined).errors ?? []; } catch { return []; }
  }, [doc, draft, meta.name, name]);
  const hasRules = draft && (live.length > 0 || (guide?.fn.length ?? 0) > 0);
  const closeProject = meta.name === "Digit Closeout Assessment" ? String(doc["project"] ?? "") : "";
  const prequal = meta.name === "Digit Subcontractor Profile";
  const stored = !!name && !name.startsWith("new-") && !!adapter.get(meta.name, name);
  const bidLev = stored && meta.name === "Digit Bid Leveling";
  const rfqBoardOn = stored && meta.name === "Request for Quotation" && adapter.list("Supplier Quotation").some((q) => Number(q["docstatus"] ?? 0) !== 2 && rowsOf(q, "items").some((i) => i["request_for_quotation"] === name));
  const decisionOn = stored && isDecisionDoctype(meta.name);
  const dayOn = stored && (meta.name === "Digit Site Activity Report" || meta.name === "Digit Field Attendance") && !!doc["project"];
  if (!ws.length && !acts.length && !manual && !hasRules && !(guide?.src.length) && !closeProject && !prequal && !bidLev && !rfqBoardOn && !decisionOn && !dayOn) return null;
  return (
    <div className="mt-3 grid gap-3" data-construction-form-panel>
      {closeProject && <CloseGateCards project={closeProject} self={name} />}
      {decisionOn && isDecisionDoctype(meta.name) && <DecisionPanel doctype={meta.name} name={name} />}
      {bidLev && <BidLevelingBoard name={name} dirty={dirty} />}
      {dayOn && <section className="rounded-lg border border-border bg-card px-4 py-3"><DayHoursPanel project={String(doc["project"])} date={String(doc[meta.name === "Digit Field Attendance" ? "attendance_date" : "report_date"] ?? "").slice(0, 10)} {...(meta.name === "Digit Field Attendance" ? { sheet: name } : {})} /></section>}
      {rfqBoardOn && <section data-rfq-form-board><p className="mb-1 text-sm font-semibold">{t("Quotations side by side", "العروض جنبًا إلى جنب")}</p><RfqComparison rfq={name} compact={dirty} /></section>}
      {prequal && <RequirementCards ar={ar} title={t("Prequalification checklist", "قائمة تأهيل مقاول الباطن")}
        note={t("Checked on the values as entered; the Director approves the profile only when every item is complete.", "تُفحص على القيم المدخلة؛ يعتمد المدير الملف فقط عند اكتمال كل البنود.")}
        items={prequalRequirements(doc as Doc).map((r) => ({ key: r.key, label: t(r.en.charAt(0).toUpperCase() + r.en.slice(1), r.ar), state: r.state,
          badge: r.state === "warn" ? t("Expires soon", "ينتهي قريبًا") : undefined,
          detail: r.expiry ? <span data-no-i18n>{t("Expiry", "الانتهاء")} {dateTxt(r.expiry)}</span> : undefined,
          action: r.state === "missing" ? <span className="text-muted-foreground">{t("Add it in Compliance documents", "أضفه في مستندات الامتثال")}</span> : r.state === "warn" ? <span className="text-muted-foreground">{t("Renew it before the expiry date", "جدّده قبل تاريخ الانتهاء")}</span> : undefined }))} />}
      {hasRules && <section className="rounded-lg border border-border bg-card px-4 py-3 text-sm" data-form-live-rules>
        <p className="font-semibold">{t("Document rules — checked while you type", "قواعد المستند — تعمل أثناء الإدخال")}</p>
        {live.length > 0
          ? <ul role="alert" className="mt-1 space-y-0.5 text-destructive" data-form-live-errors data-no-i18n>{live.map((m, i) => <li key={i}>{ar ? `سيُرفض الحفظ: «${ruleMessageAr(m)}»` : `Saving will be refused: “${m}”`}</li>)}</ul>
          : <p className="mt-1 text-success-text" data-form-live-ok>{t("The values entered pass the document rules.", "القيم المدخلة تجتاز قواعد المستند.")}</p>}
        {ar && guide && guide.fn.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-xs text-muted-foreground">{`قواعد هذا المستند (${guide.fn.length})`}</summary>
          <ul className="mt-1 grid gap-1.5" data-form-rule-list data-no-i18n>{guide.fn.map((r) => <li key={r[0]} className="rounded-md bg-muted/40 px-2 py-1"><span className="me-1 rounded bg-accent px-1.5 text-[11px]">{r[0]}</span><b>{r[1]}</b> — {r[2]}{r[3] ? <div className="text-xs text-muted-foreground">رسالة الرفض: «{r[3]}»{r[4] ? ` · عند: ${r[4]}` : ""}</div> : null}</li>)}</ul></details>}
      </section>}
      {guide && guide.src.length > 0 && <details className="rounded-lg border border-border bg-card px-4 py-2 text-sm" data-form-inspired>
        <summary className="cursor-pointer font-semibold">{t("Inspired by", "مستوحى من الأنظمة")}</summary>
        <ul className="mt-1 grid gap-1" data-no-i18n>{guide.src.map(([sys, note], i) => <li key={i}><b className="bidi-iso" dir="ltr">{sys}</b>{ar && note ? ` — ${note}` : ""}</li>)}</ul>
      </details>}
      {ws.length > 0 && <div role="status" data-form-warnings className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-text">
        <p className="font-semibold">{ar ? "تنبيه — لا يمنع الحفظ" : "Notice — does not stop saving"}</p>
        <ul className="mt-1 list-disc space-y-0.5 ps-5" data-no-i18n>{ws.map((w, i) => <li key={i}>{ar ? w.ar : w.en}</li>)}</ul>
      </div>}
      {(acts.length > 0 || manual) && <div className="flex flex-wrap items-center gap-2" data-construction-actions>
        {acts.map((a) => <ActionButton key={a.id} label={t(a.en, a.ar)} run={a.run} />)}
        {manual && <button type="button" className="btn-ghost min-h-9 text-sm" onClick={() => void compileManual(name, t)}>{t("Compile O&M manual", "تجميع دليل التشغيل والصيانة")}</button>}
      </div>}
    </div>
  );
}

type Guide = { fn: [id: string, title: string, rule: string, refusal: string, when: string][]; src: [system: string, note: string][] };
let GUIDE: Record<string, Guide> | undefined;
/** The approved prototype's rule list and research systems of a DocType, loaded once on first use (kept out of the main bundle). */
function useDocGuide(doctype: string): Guide | undefined {
  const [g, setG] = useState<Record<string, Guide> | undefined>(GUIDE);
  useEffect(() => { if (!GUIDE) void import("../ux/docGuide.generated.json").then((m) => { GUIDE = m.default as unknown as Record<string, Guide>; setG(GUIDE); }); }, []);
  return g?.[doctype];
}

function CloseGateCards({ project, self }: { project: string; self: string }) {
  const { t, ar } = useCx();
  return <RequirementCards ar={ar} title={t("Close gates of the project", "بوابات إقفال المشروع")} items={closeoutRequirements(project).map((r) => ({
    key: r.key, label: t(r.en, r.ar), state: r.state, missing: r.missing,
    detail: r.key === "critical" && r.names?.length ? <span data-no-i18n>{r.names.slice(0, 3).join("، ")}{r.names.length > 3 ? " …" : ""}</span> : undefined,
    action: r.name === self ? undefined : r.name ? <DocRef doctype={r.doctype} name={r.name} /> : <ListRef doctype={r.doctype} filters={[["project", "=", project]]}>{t("Open list", "افتح القائمة")}</ListRef>,
  }))} />;
}
