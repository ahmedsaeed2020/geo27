import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * F3-02 technical review desk (N42 queue/review, N43): runs by approval state with the meaning of each state
 * (مسجّل — results still being recorded ≠ بانتظار المراجعة ≠ مراجَع — approved, not yet sent ≠ منشور — the customer report),
 * «بانتظار اعتمادك» only on runs the session user may approve (the workflow's own transition rule), the Enterprise
 * decision menu (اعتمد ▾ رفض / طلب تعديل) and decision drawer (comment required to reject or ask for changes, files
 * become attachments) and bulk approval from «تحتاج مراجعة». Decisions go through services.decideRun only.
 */
import { useState } from "react";
import type { Doc } from "@/lib/adapter";
import { activeWorkflow, transitionsFor } from "@/lib/workflow";
import { ApprovalDrawer, BulkBar, DecisionMenu, Meter, MinePill, StatePill, type PillState, type QueueDecision } from "@/components/enterprise/kit";
import { list, rows } from "../domain/data";
import { runCoverage, s } from "../domain/rules";
import * as svc from "../domain/services";
import { nm } from "./dayBoard";
import { AppLink, PageHeader, dtTxt, notify, numTxt, useFx } from "./kit";

export type ReviewTab = "need" | "recorded" | "reviewed" | "published";
export const REVIEW_STATE: Record<string, ReviewTab> = { Draft: "recorded", "In Progress": "recorded", "Submitted for Review": "need", Reviewed: "reviewed", Published: "published" };
export const statePill = (st: string, ar: boolean): PillState => {
  const k = REVIEW_STATE[st] ?? "recorded";
  return k === "need" ? { key: k, label: ar ? "بانتظار المراجعة" : "Awaiting review", tone: "warn", hint: ar ? "قدّمها الفني؛ النتائج مقفلة حتى القرار" : "Submitted by the technician; results locked until a decision" }
    : k === "reviewed" ? { key: k, label: ar ? "مراجَع" : "Reviewed", tone: "info", hint: ar ? "اعتمدها المراجع؛ لم يصدر تقرير العميل بعد" : "Approved by the reviewer; the customer report is not issued yet" }
    : k === "published" ? { key: k, label: ar ? "منشور" : "Published", tone: "ok", hint: ar ? "صدر تقرير العميل كنسخة نهائية" : "The customer report is issued as a final revision" }
    : { key: k, label: ar ? "مسجّل" : "Recorded", tone: "neutral", hint: ar ? "النتائج تُسجَّل في الموقع؛ لم تُقدَّم للمراجعة" : "Results are being recorded on site; not submitted" };
};
/** The session user may approve this run (the workflow transition rule, the same one the Actions menu uses). */
export function canApprove(run: Doc): boolean { const w = activeWorkflow("FSM Inspection Run"); return !!w && transitionsFor(w, run).some((x) => x.action === "Approve Review"); }
const ageDays = (iso: unknown) => { const t = Date.parse(s(iso).replace(" ", "T")); return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86_400_000)) : null; };

export function ReviewDesk() {
  const fx = useFx(); const { t, ar } = fx;
  const [tab, setTab] = useState<ReviewTab>("need"); const [sel, setSel] = useState<Set<string>>(new Set());
  const [draw, setDraw] = useState<{ names: string[]; d: QueueDecision } | null>(null);
  const runs = list("FSM Inspection Run");
  const by = (k: ReviewTab) => runs.filter((r) => (REVIEW_STATE[s(r["workflow_state"])] ?? "recorded") === k);
  const shown = by(tab).sort((a, b) => s(a["submitted_on"] ?? a["modified"]).localeCompare(s(b["submitted_on"] ?? b["modified"])));
  const mine = by("need").filter(canApprove);
  const tabs: { key: ReviewTab; en: string; ar: string }[] = [{ key: "need", en: "Needs review", ar: "تحتاج مراجعة" }, { key: "recorded", en: "Recorded", ar: "مسجّلة" }, { key: "reviewed", en: "Reviewed", ar: "مراجَعة" }, { key: "published", en: "Published", ar: "منشورة" }];
  const files = (fs: File[]) => fs.map((f) => ({ name: f.name, url: `/files/${f.name}`, size: f.size }));
  const decide = (names: string[], d: QueueDecision, note: string, fs: File[]) => {
    const errs: string[] = []; let okN = 0;
    for (const n of names) { const r = svc.decideRun(n, d, note, files(fs)); if (r.ok) okN++; else errs.push(`${n}: ${ar ? r.message_ar : r.message}`); }
    if (okN) notify({ ok: true, message: `${okN} run(s): ${d === "approve" ? "approved" : d === "reject" ? "rejected" : "changes requested"}`, message_ar: `${okN} تشغيل: ${d === "approve" ? "تم الاعتماد" : d === "reject" ? "تم الرفض" : "طُلب التعديل"}` }, ar);
    if (!errs.length) setSel(new Set());
    return errs;
  };
  const selectable = tab === "need" ? shown.filter(canApprove) : [];
  return (
    <div className="w-full min-w-0" data-page="fsm-queue-review" data-review-desk>
      <PageHeader title={t("Technical review", "المراجعة الفنية")} band={{
        question: t("Which submitted inspection runs wait for your decision?", "ما تشغيلات الفحص المقدمة التي تنتظر قرارك؟"),
        basis: t("Approve the exact submitted results, or return them with a comment. Reject and request changes both return the run to the technician; the decision stays in the run's comments.", "اعتمد النتائج المقدمة كما هي أو أعدها بتعليق. الرفض وطلب التعديل كلاهما يعيد التشغيل للفني، ويبقى القرار في تعليقات التشغيل."),
        meta: [{ label: t("Awaiting review", "بانتظار المراجعة"), value: <span data-no-i18n>{by("need").length}</span> }, { label: t("Awaiting you", "بانتظار اعتمادك"), value: <span data-no-i18n>{mine.length}</span> }, { label: t("Reviewed, not published", "مراجَعة غير منشورة"), value: <span data-no-i18n>{by("reviewed").length}</span> }],
        actions: <AppLink to="list/fsm_inspection_run" className="btn-secondary inline-flex min-h-9 items-center px-3 text-sm">{t("All runs", "كل التشغيلات")}</AppLink>,
      }} />
      <ul className="fsm-rv-legend" aria-label={t("What each state means", "معنى كل حالة")}>
        {(["Draft", "Submitted for Review", "Reviewed", "Published"] as const).map((x) => { const p = statePill(x, ar); return <li key={x}><StatePill s={p} /><span>{p.hint}</span></li>; })}
      </ul>
      <div className="fsm-rv-tabs" role="tablist">
        {tabs.map((x) => <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} data-on={tab === x.key || undefined} onClick={() => { setTab(x.key); setSel(new Set()); }} data-review-tab={x.key}>{ar ? x.ar : x.en} <b data-no-i18n>{by(x.key).length}</b></button>)}
      </div>
      {tab === "need" && selectable.length > 0 && <BulkBar count={sel.size} total={selectable.length} ar={ar} onAll={() => setSel(new Set(selectable.map((r) => r.name)))} onClear={() => setSel(new Set())} onApprove={() => setDraw({ names: [...sel], d: "approve" })} />}
      {!shown.length ? <p className="fsm-walk-empty">{tab === "need" ? t("Nothing waits for review.", "لا شيء ينتظر المراجعة.") : t("No run in this state.", "لا تشغيل بهذه الحالة.")}</p> :
      <ul className="fsm-rv-list">
        {shown.map((r) => { const cov = runCoverage(rows(r, "results"), Number(r["expected_devices"]) || undefined); const may = canApprove(r); const age = ageDays(r["submitted_on"]);
          const visit = list(VISIT_DT).find((v) => v.name === s(r["visit"])); const tech = visit?.["technician"];
          return <li key={r.name} className="fsm-rv-row" data-review-row={r.name} data-mine={may && tab === "need" ? "" : undefined}>
            {tab === "need" && <input type="checkbox" className="fsm-rv-sel" disabled={!may} checked={sel.has(r.name)} onChange={(e) => setSel((x) => { const n = new Set(x); if (e.target.checked) n.add(r.name); else n.delete(r.name); return n; })} aria-label={t("Select", "تحديد")} />}
            <div className="min-w-0 flex-1">
              <p className="fsm-rv-t"><AppLink to={`run/${encodeURIComponent(r.name)}`}><span data-no-i18n>{nm("FSM Service System", r["system"], ar)}</span></AppLink> <span className="fsm-rv-id" data-no-i18n>{r.name}</span></p>
              <p className="fsm-rv-s" data-no-i18n>{[nm("FSM Service Site", r["site"], ar), tech ? nm("FSM Technician", tech, ar) : "", r["submitted_on"] ? `${ar ? "قُدّم" : "submitted"} ${dtTxt(r["submitted_on"])}` : ""].filter(Boolean).join(" · ")}</p>
              <div className="fsm-rv-f">
                <span className="fsm-rv-cov"><Meter value={cov.coverage === null ? 0 : cov.coverage * 100} tone={cov.coverage === 1 ? "good" : "attention"} label={t("Coverage", "التغطية")} /><b data-no-i18n>{cov.coverage === null ? "—" : `${numTxt(cov.coverage * 100, 0)}%`}</b></span>
                <span data-tone={cov.failChecks ? "bad" : undefined}>{t("Failed checks", "بنود راسبة")} <b data-no-i18n>{cov.failChecks}</b></span>
                <span data-tone={cov.inaccessibleDevices ? "warn" : undefined}>{t("Inaccessible", "تعذر الوصول")} <b data-no-i18n>{cov.inaccessibleDevices}</b></span>
                {age !== null && tab === "need" && <span data-tone={age > 2 ? "bad" : undefined}>{t("Waiting", "ينتظر")} <b data-no-i18n>{age}</b> {t("d", "يوم")}</span>}
                {Number(r["return_count"]) > 0 && <span data-tone="warn">{t("Returned", "أُعيد")} <b data-no-i18n>{s(r["return_count"])}</b></span>}
              </div>
            </div>
            <div className="fsm-rv-a">
              <StatePill s={statePill(s(r["workflow_state"]), ar)} />
              {may && tab === "need" && <MinePill ar={ar} />}
              {tab === "need" && <DecisionMenu id={r.name} ar={ar} can={{ approve: may, reject: may, changes: may }} onPick={(d) => (d === "approve" ? decide([r.name], "approve", "", []) : setDraw({ names: [r.name], d }))} />}
              {tab === "reviewed" && <AppLink to={`report-preview/${encodeURIComponent(r.name)}`} className="btn-secondary inline-flex min-h-9 items-center px-3 text-sm">{t("Report preview", "معاينة التقرير")}</AppLink>}
            </div>
          </li>; })}
      </ul>}
      <ApprovalDrawer open={!!draw} onOpenChange={(o) => { if (!o) setDraw(null); }} ar={ar} count={draw?.names.length ?? 1} initial={draw?.d ?? "approve"} can={{ approve: true, reject: true, changes: true }}
        title={draw && draw.names.length === 1 ? <span data-no-i18n>{nm("FSM Service System", list("FSM Inspection Run").find((x) => x.name === draw.names[0])?.["system"], ar)} · {draw.names[0]}</span> : t("Selected runs", "التشغيلات المحددة")}
        summary={<p className="text-sm text-muted-foreground">{t("Reject and request changes return the run to the technician with your comment; approval locks the exact submitted results.", "الرفض وطلب التعديل يعيدان التشغيل للفني مع تعليقك؛ الاعتماد يقفل النتائج المقدمة كما هي.")}</p>}
        onConfirm={(d, note, fs) => decide(draw?.names ?? [], d, note, fs)} />
    </div>
  );
}
