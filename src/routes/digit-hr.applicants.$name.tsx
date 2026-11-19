import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { enterHrNative } from "@/components/digithr/HrNav";
import { StatusBadge } from "@/components/digithr/ui";
import { Attachments } from "@/components/digithr/Record360Kit";
import { Native, Chip, arLabel, useSources, SourceNotice, s, type R } from "@/components/digithr/workspaces/shared";
import { useStoreVersion } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { hasPerm, useSessionUser } from "@/plugins/digit_hr/compat/session";
import { handoffOffer } from "@/plugins/digit_hr/compat/offerHandoff";
import { applicantDraft, interviewFeedbackDraft } from "@/plugins/digit_hr/recruitment";
import { applicantUpdateFor, decideInterview, mayDecideInterview, updateApplicantFromInterview, type InterviewDecision } from "@/plugins/digit_hr/interviewDecision";
import { applicantJourney, applicantStage, interviewRounds, linkedTo, STAGE_ORDER, type ApplicantStage, type JourneyStep } from "@/plugins/digit_hr/applicantFacts";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

export const Route = createFileRoute("/digit-hr/applicants/$name")({
  head: () => ({ meta: [
    { title: "Applicant 360 — DIGIT HR" },
    { name: "description", content: "Applicant 360: one candidate's interviews, feedback, offer, appointment letter, onboarding and resulting employee, dated from native recruitment records." },
    { property: "og:title", content: "Applicant 360 — DIGIT HR" },
    { property: "og:description", content: "One candidate's full recruitment journey from native records." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Applicant360,
});

const OPEN_ROUND = ["Pending", "Under Review", "Scheduled"];
const SRC = ["Job Applicant", "Interview Type", "Job Opening", "Interview", "Interview Feedback", "Job Offer", "Appointment Letter", "Employee Onboarding"];
const STAGE_LABEL: Record<ApplicantStage, [string, string]> = {
  applied: ["تقدّم", "Applied"], interview: ["مقابلة", "Interview"], offer: ["عرض عمل", "Offer"], accepted: ["عرض مقبول", "Offer accepted"], onboarding: ["تهيئة", "Onboarding"], closed: ["مغلق", "Closed"],
};
const STEP_LABEL: Record<JourneyStep, [string, string]> = {
  applied: ["التقديم", "Application"], interview: ["مقابلة", "Interview"], feedback: ["تقييم مقابلة", "Interview feedback"], offer: ["عرض عمل", "Job offer"], letter: ["خطاب تعيين", "Appointment letter"], onboarding: ["تهيئة", "Onboarding"], employee: ["موظف", "Employee"],
};

function Applicant360() {
  const { name } = Route.useParams();
  const { tx } = useTx();
  const navigate = useNavigate();
  useStoreVersion(); useSessionUser(); useScopeMetas(SRC);
  const src = useSources(tx);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState<{ round: string; decision: InterviewDecision } | null>(null);
  const [decided, setDecided] = useState("");
  const [roundErr, setRoundErr] = useState<{ round: string; msg: string } | null>(null);
  const title = tx("ملف المتقدم 360", "Applicant 360");
  const crumbs = [{ label: tx("التوظيف", "Hiring") }, { label: name }];
  const back = <Link to="/digit-hr/s/$section" params={{ section: "02.1" }} className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm text-primary hover:underline" data-applicant-back><ArrowLeft size={16} className="rtl:rotate-180" />{tx("سجل المرشحين", "Candidate register")}</Link>;
  if (!src.ready("Job Applicant")) return <DigitHrLayout title={title} crumbs={crumbs}>{back}<div className="panel p-6">{src.empty("Job Applicant")}</div></DigitHrLayout>;
  const a = src.rows("Job Applicant").find((r) => s(r.name) === name);
  if (!a) return <DigitHrLayout title={title} crumbs={crumbs}>{back}<p className="panel p-6 text-muted-foreground" data-applicant-missing>{tx("المتقدم غير موجود أو لا تملك صلاحية عرضه.", "Applicant not found or you do not have permission.")}</p></DigitHrLayout>;

  const linked = linkedTo(name, { interviews: src.rows("Interview"), feedback: src.rows("Interview Feedback"), offers: src.rows("Job Offer"), letters: src.rows("Appointment Letter"), onboarding: src.rows("Employee Onboarding") });
  const stage = applicantStage(a, linked.interviews, linked.offers, linked.onboarding);
  const journey = applicantJourney(a, linked);
  const rounds = interviewRounds(linked);
  const opening = src.rows("Job Opening").find((o) => s(o.name) === s(a.job_title));
  const accepted = linked.offers.find((o) => s(o.status) === "Accepted");
  const can = (dt: string) => { const m = cachedMeta(dt); return !!m && hasPerm(m, "create"); };
  const run = (fn: () => void) => { setErr(""); try { fn(); } catch (e) { setErr((e as Error).message); } };
  const openNative = (slug: string, doc: string) => { enterHrNative("02.1"); void navigate({ to: "/app/$app/$doctype/$name", params: { app: "hrms", doctype: slug, name: doc }, search: HR_DOC_SEARCH as never }); };
  const stageIdx = STAGE_ORDER.indexOf(stage);
  const field = (label: string, value: string, translate = false) => <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium break-words" data-no-i18n>{value ? (translate ? tx(arLabel(value), value) : value) : "—"}</dd></div>;
  const who = s(a.applicant_name) || name;

  return (
    <DigitHrLayout record title={tx(arLabel(who), who)} crumbs={crumbs} subtitle={title}>
      {back}
      <section className="dhr-cmdband dhr-recordband mb-4" data-applicant-overview={name}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2"><span className="dhr-code text-muted-foreground" data-no-i18n>{name}</span><StatusBadge value={a.status} /></span>
          <Native dt="Job Applicant" name={name} module="02" className="dhr-btn inline-flex gap-2"><Pencil size={16} />{tx("تعديل السجل الكامل", "Edit full applicant record")}</Native>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-muted-foreground">{tx("الوظيفة المعلنة", "Job opening")}</dt><dd className="mt-1 font-medium break-words" data-no-i18n>{opening ? <Native dt="Job Opening" name={s(opening.name)} module="02" className="text-primary hover:underline">{tx(arLabel(s(opening.job_title) || s(opening.name)), s(opening.job_title) || s(opening.name))}</Native> : s(a.job_title) || "—"}</dd></div>
          {field(tx("المسمى", "Designation"), s(a.designation || opening?.designation), true)}
          {field(tx("المصدر", "Source"), s(a.source), true)}
          {field(tx("البريد الإلكتروني", "Email"), s(a.email_id))}
        </dl>
      </section>

      <section className="mb-4" aria-label={tx("مرحلة المرشح", "Candidate stage")} data-applicant-stage={stage}>
        {stage === "closed"
          ? <p className="text-sm"><Chip tone="neutral">{tx(...STAGE_LABEL.closed)}</Chip> <span className="text-muted-foreground">{tx("الطلب معلّق أو مرفوض في سجل المتقدم.", "The application is on hold or rejected on the applicant record.")}</span></p>
          : <ol className="flex flex-wrap gap-2">{STAGE_ORDER.map((st, i) => <li key={st} aria-current={st === stage ? "step" : undefined} className={`rounded-md border px-3 py-1.5 text-xs ${i < stageIdx ? "border-[var(--dhr-border)] text-muted-foreground" : st === stage ? "border-primary font-semibold text-primary" : "border-dashed border-[var(--dhr-border)] text-muted-foreground"}`}>{i + 1}. {tx(...STAGE_LABEL[st])}</li>)}</ol>}
        <p className="mt-1 text-[11px] text-muted-foreground">{tx("المرحلة مشتقة من السجلات المرتبطة بنفس قاعدة سجل المرشحين.", "Stage is derived from linked records with the same rule as the candidate register.")}</p>
        <div className="mt-2 flex flex-wrap gap-2" data-applicant-actions>
          {stage === "applied" && can("Interview") && <Button variant="outline" onClick={() => run(() => openNative("interview", applicantDraft(name, "Interview").name))} data-applicant-schedule>{tx("جدولة مقابلة", "Schedule interview")}</Button>}
          {stage === "interview" && can("Job Offer") && <Button variant="outline" onClick={() => run(() => openNative("job_offer", applicantDraft(name, "Job Offer").name))} data-applicant-offer>{tx("+ عرض عمل", "+ Job offer")}</Button>}
          {stage === "offer" && linked.offers[0] && <Native dt="Job Offer" name={s(linked.offers[0].name)} module="02" className="dhr-btn dhr-btn-sm">{tx("مراجعة العرض", "Review offer")}</Native>}
          {stage === "accepted" && accepted && <Button variant="outline" onClick={() => run(() => { const r = handoffOffer(s(accepted.name)); toast.success(r.created ? tx("أُنشئت تهيئة مسودة", "Draft onboarding created") : tx("التهيئة موجودة مسبقًا", "Onboarding already exists")); })} data-applicant-handoff>{tx("+ تهيئة", "+ Onboarding")}</Button>}
          {stage === "onboarding" && linked.onboarding[0] && <Native dt="Employee Onboarding" name={s(linked.onboarding[0].name)} module="02" className="dhr-btn dhr-btn-sm">{tx("متابعة التهيئة", "Open onboarding")}</Native>}
        </div>
        {err && <p role="alert" className="dhr-alert mt-2 text-sm">{err}</p>}
      </section>

      <SourceNotice src={src} />

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-md border p-3" data-applicant-journey={journey.length}>
          <h2 className="mb-2 text-sm font-semibold">{tx("مسار التوظيف المؤرخ", "Dated recruitment journey")}</h2>
          <ol className="divide-y">{journey.map((e) => <li key={e.dt + e.name} className="flex min-h-11 flex-wrap items-center gap-2 py-1.5 text-sm" data-journey-step={e.step}>
            <span className="w-24 shrink-0 tabular-nums text-muted-foreground" data-no-i18n>{e.date || "—"}</span>
            <Chip>{tx(...STEP_LABEL[e.step])}</Chip>
            {e.dt === "Employee"
              ? <Link to="/digit-hr/employees/$name" params={{ name: e.name }} className="text-primary hover:underline" data-no-i18n data-journey-employee={e.name}>{e.name}</Link>
              : <Native dt={e.dt} name={e.name} module="02" className="text-primary hover:underline"><span data-no-i18n>{e.name}</span></Native>}
            {e.status && <span className="ms-auto text-xs" data-no-i18n>{tx(arLabel(e.status), e.status)}</span>}
          </li>)}</ol>
        </section>

        <section className="min-w-0 rounded-md border p-3" data-applicant-rounds={rounds.length}>
          <h2 className="mb-2 text-sm font-semibold">{tx("جولات المقابلة والتقييمات", "Interview rounds and feedback")}</h2>
          {!src.ready("Interview") ? src.empty("Interview") : rounds.length === 0 ? <p className="text-sm text-muted-foreground">{tx("لا توجد مقابلات لهذا المتقدم.", "No interviews for this applicant.")}</p>
            : <ul className="space-y-2">{rounds.map((r) => <li key={r.name} className="rounded-md border p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Native dt="Interview" name={r.name} module="02" className="font-medium text-primary hover:underline"><span data-no-i18n>{r.type ? tx(arLabel(r.type), r.type) : r.name}</span></Native><span className="tabular-nums text-xs text-muted-foreground" data-no-i18n>{r.date || "—"}</span><span className="ms-auto text-xs" data-no-i18n>{tx(arLabel(r.status), r.status)}</span>
                {/* Same eligibility as the candidate register; reopens the session interviewer's existing feedback instead of duplicating it. */}
                {OPEN_ROUND.includes(r.status) && can("Interview Feedback") && <Button variant="outline" size="sm" className="min-h-10" onClick={() => run(() => openNative("interview_feedback", interviewFeedbackDraft(r.name).name))} data-applicant-feedback={r.name}>{tx("تقييم المقابلة", "Evaluate interview")}</Button>}</div>
              {/* hrms interview.py: an interview is submitted only as Cleared or Rejected; the decision is confirmed inline, then submitted natively. */}
              {mayDecideInterview(linked.interviews.find((i) => s(i.name) === r.name)) && (confirm?.round === r.name
                ? <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-xs" role="group" aria-label={tx("تأكيد القرار", "Confirm decision")} data-interview-confirm={r.name}>
                    <span>{confirm.decision === "Cleared" ? tx("اعتماد المقابلة كـ«ناجح»؟ لا يمكن تعديلها بعد الاعتماد إلا بالإلغاء.", "Submit this interview as Cleared? It can only be changed afterwards by cancelling it.") : tx("اعتماد المقابلة كـ«مرفوض»؟ لا يمكن تعديلها بعد الاعتماد إلا بالإلغاء.", "Submit this interview as Rejected? It can only be changed afterwards by cancelling it.")}</span>
                    <Button size="sm" className="min-h-10" onClick={() => { const d = confirm.decision; setConfirm(null); try { decideInterview(r.name, d); setDecided(r.name); toast.success(tx("اعتُمد قرار المقابلة", "Interview decision submitted")); } catch (e) { setRoundErr({ round: r.name, msg: (e as Error).message }); } }} data-interview-confirm-yes>{tx("اعتماد القرار", "Submit decision")}</Button>
                    <Button size="sm" variant="ghost" className="min-h-10" onClick={() => setConfirm(null)}>{tx("إلغاء", "Cancel")}</Button>
                  </div>
                : <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" data-interview-decide={r.name}>
                    <span className="text-muted-foreground">{tx("قرار المقابلة:", "Interview decision:")}</span>
                    <Button size="sm" variant="outline" className="min-h-10" onClick={() => { setRoundErr(null); setConfirm({ round: r.name, decision: "Cleared" }); }} data-interview-decision="Cleared">{tx("ناجح", "Cleared")}</Button>
                    <Button size="sm" variant="outline" className="min-h-10" onClick={() => { setRoundErr(null); setConfirm({ round: r.name, decision: "Rejected" }); }} data-interview-decision="Rejected">{tx("مرفوض", "Rejected")}</Button>
                    <span className="text-muted-foreground">{tx(`التقييمات المسجلة: ${r.feedback.length}`, `Feedback recorded: ${r.feedback.length}`)}</span>
                  </div>)}
              {roundErr?.round === r.name && <p role="alert" className="dhr-alert mt-2 text-xs" data-interview-error={r.name}>{roundErr.msg} — {tx("أكمل الحقول في السجل الكامل للمقابلة ثم أعد المحاولة.", "Complete the fields on the full interview record, then try again.")}</p>}
              {decided === r.name && (() => { const up = applicantUpdateFor(linked.interviews.find((i) => s(i.name) === r.name)); return up ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-muted p-2 text-xs" role="status" data-applicant-update-offer={up.status}>
                  <span>{up.status === "Accepted" ? tx("تحديث حالة المتقدم إلى «مقبول» بناءً على نتيجة المقابلة؟", "Update the applicant to Accepted based on this interview result?") : tx("تحديث حالة المتقدم إلى «مرفوض» بناءً على نتيجة المقابلة؟", "Update the applicant to Rejected based on this interview result?")}</span>
                  <Button size="sm" className="min-h-10" onClick={() => run(() => { updateApplicantFromInterview(r.name); setDecided(""); toast.success(tx("حُدّثت حالة المتقدم", "Applicant status updated")); })} data-applicant-update-yes>{tx("تحديث المتقدم", "Update applicant")}</Button>
                  <Button size="sm" variant="ghost" className="min-h-10" onClick={() => setDecided("")} data-applicant-update-no>{tx("ليس الآن", "Not now")}</Button>
                </div>) : null; })()}
              {!src.ready("Interview Feedback") ? <div className="mt-1 text-xs">{src.empty("Interview Feedback")}</div>
                : r.feedback.length ? <ul className="mt-1 flex flex-wrap gap-2 text-xs">{r.feedback.map((f) => <li key={f.name}><Native dt="Interview Feedback" name={f.name} module="02" className="hover:underline"><span data-no-i18n>{f.interviewer || f.name}</span></Native> · <span data-no-i18n>{f.result ? tx(arLabel(f.result), f.result) : tx("بلا نتيجة", "No result")}</span></li>)}</ul>
                : <p className="mt-1 text-xs text-muted-foreground">{tx("لم يُسجَّل تقييم لهذه الجولة.", "No feedback recorded for this round.")}</p>}
            </li>)}</ul>}
        </section>

        <section className="min-w-0 rounded-md border p-3 lg:col-span-2" data-applicant-offers={linked.offers.length}>
          <h2 className="mb-2 text-sm font-semibold">{tx("العرض والتعيين والتهيئة", "Offer, appointment and onboarding")}</h2>
          {!src.ready("Job Offer") ? src.empty("Job Offer") : linked.offers.length === 0 ? <p className="text-sm text-muted-foreground">{tx("لا يوجد عرض عمل.", "No job offer.")}</p>
            : <div className="overflow-x-auto"><table className="w-full min-w-[28rem] text-sm"><thead><tr className="text-xs text-muted-foreground"><th className="px-2 py-1 text-start">{tx("العرض", "Offer")}</th><th className="px-2 py-1 text-start">{tx("التاريخ", "Date")}</th><th className="px-2 py-1 text-start">{tx("المسمى", "Designation")}</th><th className="px-2 py-1 text-start">{tx("الحالة", "Status")}</th></tr></thead>
              <tbody>{linked.offers.map((o) => <tr key={s(o.name)} className="h-10 border-t"><td className="px-2" data-no-i18n><Native dt="Job Offer" name={s(o.name)} module="02" className="text-primary hover:underline">{s(o.name)}</Native></td><td className="px-2 tabular-nums" data-no-i18n>{s(o.offer_date) || "—"}</td><td className="px-2" data-no-i18n>{o.designation ? tx(arLabel(s(o.designation)), s(o.designation)) : "—"}</td><td className="px-2" data-no-i18n>{tx(arLabel(s(o.status)), s(o.status))}</td></tr>)}</tbody></table></div>}
          {src.ready("Appointment Letter") && linked.letters.length > 0 && <p className="mt-2 text-sm">{tx("خطاب التعيين:", "Appointment letter:")} {linked.letters.map((l) => <Native key={s(l.name)} dt="Appointment Letter" name={s(l.name)} module="02" className="ms-1 text-primary hover:underline"><span data-no-i18n>{s(l.name)}</span></Native>)}</p>}
          {src.ready("Employee Onboarding") && linked.onboarding.map((b: R) => <p key={s(b.name)} className="mt-2 flex flex-wrap items-center gap-2 text-sm" data-applicant-onboarding={s(b.name)}>
            <span>{tx("التهيئة:", "Onboarding:")}</span><Native dt="Employee Onboarding" name={s(b.name)} module="02" className="text-primary hover:underline"><span data-no-i18n>{s(b.name)}</span></Native>
            <span className="text-xs" data-no-i18n>{tx(arLabel(s(b.boarding_status)), s(b.boarding_status))}</span>
            {s(b.employee) ? <Link to="/digit-hr/employees/$name" params={{ name: s(b.employee) }} className="text-primary hover:underline" data-no-i18n>{tx("ملف الموظف", "Employee 360")} · {s(b.employee)}</Link> : <span className="text-xs text-muted-foreground">{tx("لم يُربط موظف بعد.", "No employee linked yet.")}</span>}
          </p>)}
          <p className="mt-2 text-[11px] text-muted-foreground">{tx("نطاق الراتب المتوقع وشروط العرض تبقى في السجل الأصلي.", "Expected salary range and offer terms stay on the native record.")}</p>
        </section>
        <section className="min-w-0 rounded-md border p-3 lg:col-span-2" data-applicant-files>
          <Attachments dt="Job Applicant" name={name} fields={["resume_attachment"]} doc={a} module="02" tx={tx} />
          {s(a.resume_link) && <p className="text-sm">{tx("رابط السيرة الذاتية:", "Resume link:")} <a href={s(a.resume_link)} target="_blank" rel="noreferrer" className="text-primary hover:underline" data-no-i18n data-applicant-resume-link>{s(a.resume_link)}</a></p>}
        </section>
      </div>
    </DigitHrLayout>
  );
}
