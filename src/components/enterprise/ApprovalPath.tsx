/**
 * The Enterprise approval path (Visual Round 1 §9) in the document frame and the drawer: vertical steps — done (✓ success,
 * who + date), current (warning, «بانتظار <name> منذ 3 أيام»; error «متأخر يومين» past the step allowance), next (grey) —
 * an average-waiting chip from the DocType's history, and the current approver's «اعتمد» / «ارفض» / «اطلب تعديل» (a comment
 * is required to reject or ask for changes). Apps pass the document; decisions run through lib/approvalPath.ts.
 */
import { useState } from "react";
import { toast } from "sonner";
import { approvalModel, decide, verbText, type Decision } from "@/lib/approvalPath";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { fmtDate } from "@/lib/format";
import { useSessionUser } from "@/lib/session";
import { t as tr } from "@/i18n";

const STATE_AR: Record<string, string> = { Draft: "مسودة", "Pending Approval": "بانتظار الاعتماد", Approved: "معتمد", Rejected: "مرفوض", Open: "مفتوح", Submitted: "مقدَّم", Cancelled: "ملغى" };
export const stateLabel = (s: string, ar: boolean) => (ar ? STATE_AR[s] ?? tr(s) : s);
export function userName(u: string | undefined): string {
  if (!u) return "";
  const r = adapter.get("User", u); const emp = adapter.list("Employee").find((e) => e["user_id"] === u);
  return String(r?.["full_name"] || emp?.["employee_name"] || [r?.["first_name"], r?.["last_name"]].filter(Boolean).join(" ") || u);
}
export function hoursText(h: number, ar: boolean): string {
  if (h < 1) return ar ? "أقل من ساعة" : "under an hour";
  if (h < 48) { const n = Math.round(h); return ar ? `${n} ${n === 1 ? "ساعة" : n === 2 ? "ساعتين" : n <= 10 ? "ساعات" : "ساعة"}` : `${n} hour${n === 1 ? "" : "s"}`; }
  const d = Math.round(h / 24); return ar ? (d === 2 ? "يومين" : `${d} ${d <= 10 ? "أيام" : "يومًا"}`) : `${d} day${d === 1 ? "" : "s"}`;
}

export function ApprovalPath({ doctype, doc, ar, compact }: { doctype: string; doc: Doc; ar: boolean; compact?: boolean }) {
  useStoreVersion(); const user = useSessionUser();
  const [mode, setMode] = useState<Decision | null>(null); const [note, setNote] = useState("");
  const m = approvalModel(doctype, doc, user);
  if (!m || m.steps.length < 2) return null;
  const t = (en: string, a: string) => (ar ? a : en);
  const run = (d: Decision) => {
    if ((d === "reject" || d === "changes") && mode !== d) { setMode(d); return; }
    const errs = decide(doctype, doc.name, d, note, m);
    if (errs.length) { toast.error(errs.join("\n")); return; }
    toast.success(d === "approve" ? t("Approved", "تم الاعتماد") : d === "reject" ? t("Rejected", "تم الرفض") : t("Changes requested", "طُلب التعديل"));
    setMode(null); setNote("");
  };
  const c = m.current;
  return <section className={`r1-ap ${compact ? "r1-ap-compact" : ""}`} aria-label={t("Approval path", "مسار الاعتماد")} data-r1-approval={doctype}>
    <header className="r1-ap-head"><h3 className="r1-card-title">{t("Approval path", "مسار الاعتماد")}</h3>
      {m.avgH !== undefined && <span className="r1-ap-avg" data-r1-ap-avg={Math.round(m.avgH)}>{t("Average", "متوسط")} {hoursText(m.avgH, ar)}</span>}</header>
    <ol className="r1-ap-steps">
      {m.steps.map((s, i) => {
        const cur = s.status === "current";
        const late = cur && c && c.overdueH > 0;
        return <li key={`${s.state}:${i}`} className="r1-ap-step" data-status={late ? "late" : s.status} data-r1-ap-step={s.state}>
          <span className="r1-ap-dot" aria-hidden>{s.status === "done" ? "✓" : s.status === "rejected" ? "×" : i + 1}</span>
          <div className="r1-ap-body">
            <p className="r1-ap-state">{stateLabel(s.state, ar)}</p>
            {s.status === "done" || s.status === "rejected" ? <p className="r1-ap-meta">{s.verb && <><b className="r1-ap-verb" data-r1-ap-verb={s.verb}>{verbText(s.verb, ar)}</b>{s.who || s.at ? " · " : ""}</>}{s.who && <bdi data-no-i18n>{userName(s.who)}</bdi>}{s.who && s.at ? " · " : ""}{s.at && <bdi data-no-i18n>{fmtDate(s.at.slice(0, 10))}</bdi>}</p>
              : cur && c ? <p className="r1-ap-meta" data-r1-ap-waiting={Math.round(c.waitingH)}>{t("Awaiting", "بانتظار")} <bdi data-no-i18n>{userName(c.approver)}</bdi>{/* a request dated after today has no waiting time yet */}{c.since && Date.parse(c.since.replace(" ", "T")) <= Date.now() ? <> {t("for", "منذ")} {hoursText(c.waitingH, ar)}</> : null}
                {late && <span className="r1-ap-late" data-r1-ap-late={Math.round(c.overdueH)}> · {t("overdue by", "متأخر")} {hoursText(c.overdueH, ar)}</span>}</p>
              : <p className="r1-ap-meta">{t("Next", "التالي")}</p>}
          </div>
        </li>;
      })}
    </ol>
    {(m.can.approve || m.can.reject || m.can.changes) && <div className="r1-ap-actions" data-r1-ap-actions>
      {mode && <label className="r1-ap-note"><span className="sr-only">{t("Comment", "تعليق")}</span>
        <textarea className="field-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "reject" ? t("Why is it rejected? (required)", "سبب الرفض (مطلوب)") : t("What should change? (required)", "ما المطلوب تعديله؟ (مطلوب)")} data-r1-ap-note /></label>}
      <div className="flex flex-wrap gap-2">
        {m.can.approve && <button type="button" className="btn-primary" onClick={() => run("approve")} data-r1-ap-do="approve">{t("Approve", "اعتمد")}</button>}
        {m.can.reject && <button type="button" className="btn-secondary r1-ap-reject" onClick={() => run("reject")} disabled={mode === "reject" && !note.trim()} data-r1-ap-do="reject">{t("Reject", "ارفض")}</button>}
        {(m.can.changes || m.can.approve) && <button type="button" className="btn-ghost" onClick={() => run("changes")} disabled={mode === "changes" && !note.trim()} data-r1-ap-do="changes">{t("Request changes", "اطلب تعديل")}</button>}
        {mode && <button type="button" className="btn-ghost" onClick={() => { setMode(null); setNote(""); }}>{t("Cancel", "إلغاء")}</button>}
      </div>
    </div>}
  </section>;
}
