/**
 * Module 02 — Talent Studio (Premium V2). Hero (8/12): stage-column pipeline of candidates, stage derived from linked
 * native records, one eligible next action per card. Side (4/12): talent decision queue (interviews due, feedback
 * awaited, offers awaiting response, accepted offers without onboarding). Lower: development layer (onboarding,
 * performance, learning, succession), open vacancies, then URL-backed tabs: work queues / candidate register / schedule.
 * `CandidateRegister` and `TalentQueues` are shared with /digit-hr/hiring and the section pages.
 */
import { Button } from "@/components/ui/button";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { useState, type ReactNode } from "react";
import { interviewsOn } from "@/plugins/digit_hr/review";
import { toast } from "sonner";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { handoffOffer } from "@/plugins/digit_hr/compat/offerHandoff";
import { applicantDraft, interviewFeedbackDraft } from "@/plugins/digit_hr/recruitment";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { applicantStage, type ApplicantStage } from "@/plugins/digit_hr/applicantFacts";
import { enterHrNative } from "@/components/digithr/HrNav";
import { cachedMeta } from "@/lib/catalog";
import { hasPerm } from "@/plugins/digit_hr/compat/session";
import { Native, Chip, StatRow, WorkTable, arLabel, useSources, SourceNotice, NotEvaluated, s, live, type R, type Sources } from "./shared";
import { appraisalDraft, appraisalQueue, interviewQueue, learningQueue, trainingFeedbackDraft } from "@/plugins/digit_hr/talentQueues";
import { latestScores } from "@/plugins/digit_hr/talentReview";
import { isHrAdmin } from "@/plugins/digit_hr/compat/employeeIdentity";
import { placeDoc } from "@/plugins/digit_hr/v6/nav";
import { MetricValue } from "@/components/digithr/ModuleScope";
import { CtxField, HrCommandHeader, HrContextToolbar, HrEmptyOrBlockedState, HrInsightPanel, HrPriorityQueue, HrSectionNavigator, HrTabs, HrWorkspaceGrid, ModuleLinks, Pill, SourcesPill, initials, relDay, useSearchPatch, useToday, type NavItem, type QueueGroup, type Tone } from "../home/kit";
import { DateInput } from "@/components/form/DateInput";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

type Tx = (ar: string, en: string) => string;
const STATUS_AR: Record<string, string> = { Pending: "معلقة", "Under Review": "قيد التقييم", "Awaiting Response": "بانتظار الرد", Accepted: "مقبول", Rejected: "مرفوض", Open: "مفتوح", Completed: "مكتمل", Draft: "مسودة", Scheduled: "مجدولة" };
const DT_AR: Record<string, string> = { "Job Applicant": "طلب التقديم", Interview: "مقابلة", "Job Offer": "عرض عمل", "Employee Onboarding": "تهيئة" };
const STAGES: { id: ApplicantStage; ar: string; en: string; tone?: "warn" | "neutral" }[] = [
  { id: "applied", ar: "تقدّم", en: "Applied" }, { id: "interview", ar: "مقابلة", en: "Interview" },
  { id: "offer", ar: "عرض", en: "Offer" }, { id: "accepted", ar: "عرض مقبول", en: "Offer accepted", tone: "warn" },
  { id: "onboarding", ar: "تهيئة", en: "Onboarding" }, { id: "closed", ar: "مغلق/مرفوض", en: "Closed / rejected", tone: "neutral" },
];
const CAND_SRC = ["Job Applicant", "Interview", "Job Offer", "Employee Onboarding"];
const HIDDEN: [string, string] = ["غير مُقيّم: يتطلب رؤية كل السجلات (دور موارد بشرية).", "Not evaluated: needs every record (HR role)."];

/* ------------------------------------------------------------------ shared candidate model */

type CandFacts = { id: string; who: string; openingId: string; opening: string; stage: ApplicantStage; owner: string; last: string; lastDoc: { dt: string; name: string }; accepted?: R; onboarding?: R; offer?: R; pendingInterview?: R; feedback: R[] };

/** One row per readable Job Applicant with its stage derived from linked native records (applicantFacts). */
function useCandidateModel(tx: Tx) {
  const navigate = useNavigate();
  useStoreVersion(); useSessionUser();
  useScopeMetas(["Job Applicant", "Interview", "Interview Feedback", "Interview Type", "Job Offer", "Employee Onboarding", "Job Opening"]);
  const src = useSources(tx);
  const [err, setErr] = useState("");
  const go = (doctype: string, name: string) => { enterHrNative("02.1"); void navigate({ to: "/app/$app/$doctype/$name", params: { app: "hrms", doctype, name }, search: HR_DOC_SEARCH as never }); };
  const attempt = (f: () => void) => { setErr(""); try { f(); } catch (e) { setErr((e as Error).message); } };
  const createOffer = (name: string) => attempt(() => go("job_offer", applicantDraft(name, "Job Offer").name));
  const createInterview = (name: string) => attempt(() => go("interview", applicantDraft(name, "Interview").name));
  const createFeedback = (name: string) => attempt(() => go("interview_feedback", interviewFeedbackDraft(name).name));
  const handoff = (name: string) => attempt(() => { const r = handoffOffer(name); toast.success(r.created ? tx("أُنشئت تهيئة مسودة", "Draft onboarding created") : tx("التهيئة موجودة مسبقًا", "Onboarding already exists")); });
  const canCreate = (dt: string) => { const m = cachedMeta(dt); return !!m && hasPerm(m, "create"); };

  const applicants = src.rows("Job Applicant").filter(live);
  const interviews = src.rows("Interview").filter(live);
  const offers = src.rows("Job Offer").filter(live);
  const onboarding = src.rows("Employee Onboarding").filter(live);
  const openings = src.rows("Job Opening");
  const feedback = src.rows("Interview Feedback").filter(live);
  const ready = src.ready(...CAND_SRC);
  const rows: CandFacts[] = !ready ? [] : applicants.map((a: R) => {
    const id = s(a.name);
    const iv = interviews.filter((i) => s(i.job_applicant) === id);
    const of = offers.filter((o) => s(o.job_applicant) === id);
    const ob = onboarding.filter((o) => s(o.job_applicant) === id);
    const linked: { dt: string; r: R }[] = [{ dt: "Job Applicant", r: a }, ...iv.map((r) => ({ dt: "Interview", r })), ...of.map((r) => ({ dt: "Job Offer", r })), ...ob.map((r) => ({ dt: "Employee Onboarding", r }))];
    const latest = linked.sort((x, y) => s(y.r.modified).localeCompare(s(x.r.modified)))[0] ?? { dt: "Job Applicant", r: a };
    const op = openings.find((o) => s(o.name) === s(a.job_title));
    const pendingIv = iv.find((i) => ["Pending", "Under Review", "Scheduled"].includes(s(i.status)));
    return { id, who: s(a.applicant_name) || id, openingId: s(a.job_title), opening: s(op?.job_title) || s(a.job_title) || s(a.designation), stage: applicantStage(a, iv, of, ob), owner: s(pendingIv?.interviewer ?? a.owner ?? ""), last: s(latest.r.modified).slice(0, 10), lastDoc: { dt: latest.dt, name: s(latest.r.name) }, accepted: of.find((o) => s(o.status) === "Accepted"), onboarding: ob[0], offer: of[0], pendingInterview: pendingIv, feedback: pendingIv ? feedback.filter((f) => s(f.interview) === s(pendingIv.name)) : [] };
  });
  return { src, rows, ready, err, applicants, interviews, offers, onboarding, openings, createOffer, createInterview, createFeedback, handoff, canCreate, feedbackMeta: cachedMeta("Interview Feedback") };
}
type CandidateModel = ReturnType<typeof useCandidateModel>;

/** Single compact action for a pipeline card (the register keeps the full action set). */
function cardAction(r: CandFacts, m: CandidateModel, tx: Tx): ReactNode {
  if (r.stage === "accepted" && r.accepted) return <button type="button" className="dhr-act dhr-act-primary" onClick={() => m.handoff(s(r.accepted?.name))} data-card-handoff={r.id}>{tx("+ تهيئة", "+ Onboarding")}</button>;
  if (r.stage === "onboarding") return <Native dt="Employee Onboarding" name={s(r.onboarding?.name)} module="02" className="dhr-act">{tx("متابعة", "Follow up")}</Native>;
  if (r.stage === "offer") return <Native dt="Job Offer" name={s(r.offer?.name)} module="02" className="dhr-act">{tx("العرض", "Offer")}</Native>;
  if (r.pendingInterview) return <Native dt="Interview" name={s(r.pendingInterview.name)} module="02" className="dhr-act">{tx("المقابلة", "Interview")}</Native>;
  if (r.stage === "applied" && m.canCreate("Interview")) return <button type="button" className="dhr-act" onClick={() => m.createInterview(r.id)} data-card-interview={r.id}>{tx("جدولة مقابلة", "Schedule")}</button>;
  if (r.stage === "closed") return null;
  return <Native dt="Job Applicant" name={r.id} module="02" className="dhr-act">{tx("فتح", "Open")}</Native>;
}

/* ------------------------------------------------------------------ module home */

type View = "queues" | "candidates" | "schedule";
type DGroup = "interview" | "feedback" | "offer" | "handoff";
type Decision = { key: string; group: DGroup; who: string; what: [string, string]; dt: string; name: string; date: string; action: ReactNode; tone: Tone };

export function TalentWorkspace({ home = false }: { home?: boolean }) {
  const { tx } = useTx();
  useScopeMetas(["Appraisal Cycle", "Appraisal", "Training Event", "Training Feedback", "Training Result", "Employee"]);
  const m = useCandidateModel(tx);
  const src = m.src;
  const admin = isHrAdmin();
  const today = useToday();
  const patch = useSearchPatch();
  const search = useRouterState({ select: (st) => st.location.search }) as Record<string, unknown>;
  const opening = typeof search["opening"] === "string" ? (search["opening"] as string) : "";
  const view: View = search["view"] === "candidates" || search["view"] === "schedule" ? (search["view"] as View) : "queues";
  const iday = typeof search["iday"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search["iday"] as string) ? (search["iday"] as string) : today;

  const openOpenings = m.openings.filter((o) => live(o) && s(o.status) === "Open");
  const cands = m.rows.filter((r) => !opening || r.openingId === opening);
  const fbReady = admin && src.ready("Interview Feedback");
  const iq = interviewQueue(m.interviews, fbReady ? src.rows("Interview Feedback") : null, today);
  const offersWaiting = m.offers.filter((o) => s(o.status) === "Awaiting Response");
  const acceptedNoOnb = m.offers.filter((o) => s(o.status) === "Accepted" && !m.onboarding.some((b) => s(b.job_applicant) === s(o.job_applicant)));
  const onbActive = m.onboarding.filter((o) => s(o.boarding_status) !== "Completed");
  const aq = appraisalQueue(src.rows("Appraisal Cycle"), src.rows("Appraisal"), today, admin && src.ready("Appraisal"));
  const lq = learningQueue(src.rows("Training Event"), admin && src.ready("Training Feedback") ? src.rows("Training Feedback") : null, src.ready("Training Result") ? src.rows("Training Result") : null, today);
  const reviewed = src.ready("Employee", "Appraisal") ? latestScores(src.rows("Appraisal"), src.rows("Employee")).length : null;
  const applicantName = new Map(m.applicants.map((a) => [s(a.name), s(a.applicant_name)]));
  const cand = (i: R) => applicantName.get(s(i.job_applicant)) || s(i.job_applicant);
  const ne = <NotEvaluated tx={tx} why={HIDDEN} />;

  const DGROUPS: (QueueGroup & { id: DGroup })[] = [
    { id: "interview", ar: "مقابلات مستحقة", en: "Interviews due", tone: "danger" },
    { id: "feedback", ar: "بانتظار تقييم المقابلة", en: "Interview feedback awaited", tone: "warn" },
    { id: "offer", ar: "عروض بانتظار رد المرشح", en: "Offers awaiting response", tone: "info" },
    { id: "handoff", ar: "عروض مقبولة بلا تهيئة", en: "Accepted offers without onboarding", tone: "warn" },
  ];
  const decisions: Decision[] = [
    ...iq.due.map((i): Decision => ({ key: "iv" + s(i.name), group: "interview", who: cand(i), what: s(i.scheduled_on).slice(0, 10) < today ? ["مقابلة تجاوزت موعدها", "Interview past its date"] : ["مقابلة اليوم", "Interview today"], dt: "Interview", name: s(i.name), date: s(i.scheduled_on), tone: s(i.scheduled_on).slice(0, 10) < today ? "danger" : "warn", action: <Native dt="Interview" name={s(i.name)} module="02" className="dhr-act">{tx("مراجعة المقابلة", "Review interview")}</Native> })),
    ...(iq.awaitingFeedback ?? []).map((i): Decision => ({ key: "fb" + s(i.name), group: "feedback", who: cand(i), what: ["لم يُسجَّل تقييم للمقابلة", "No interview feedback recorded"], dt: "Interview", name: s(i.name), date: s(i.scheduled_on), tone: "warn", action: m.canCreate("Interview Feedback") ? <button type="button" className="dhr-act dhr-act-primary" onClick={() => m.createFeedback(s(i.name))} data-decision-feedback={s(i.name)}>{tx("تقييم المقابلة", "Evaluate interview")}</button> : <Native dt="Interview" name={s(i.name)} module="02" className="dhr-act">{tx("فتح", "Open")}</Native> })),
    ...offersWaiting.map((o): Decision => ({ key: "of" + s(o.name), group: "offer", who: s(o.applicant_name) || s(o.job_applicant), what: ["أُرسل العرض ولم يُسجَّل رد", "Offer sent, no response recorded"], dt: "Job Offer", name: s(o.name), date: s(o.offer_date), tone: "info", action: <Native dt="Job Offer" name={s(o.name)} module="02" className="dhr-act">{tx("مراجعة العرض", "Review offer")}</Native> })),
    ...acceptedNoOnb.map((o): Decision => ({ key: "ho" + s(o.name), group: "handoff", who: s(o.applicant_name) || s(o.job_applicant), what: ["عرض مقبول — لم تبدأ التهيئة", "Offer accepted — onboarding not started"], dt: "Job Offer", name: s(o.name), date: s(o.offer_date), tone: "warn", action: <button type="button" className="dhr-act dhr-act-primary" onClick={() => m.handoff(s(o.name))}>{tx("+ تهيئة", "+ Onboarding")}</button> })),
  ];
  const decReady = src.ready("Interview", "Job Offer", "Employee Onboarding", "Job Applicant");

  const dev: NavItem[] = [
    { id: "02.1", title: tx("التوظيف والاستقطاب", "Talent Acquisition"), sub: tx("الوظائف والمتقدمون", "Openings and applicants"), to: <Link to="/digit-hr/s/$section" params={{ section: "02.1" }} className="dhr-act dhr-act-ghost">{tx("فتح", "Open")}</Link>,
      figures: [{ label: tx("وظائف معلنة", "Open openings"), value: src.v(<Native dt="Job Opening" module="02" filters={[["status", "=", "Open"]]} className="dhr-link">{openOpenings.length}</Native>, "Job Opening") }, { label: tx("مرشحون قيد المسار", "Candidates in process"), value: src.v(m.rows.filter((r) => r.stage !== "closed").length, ...CAND_SRC) }] },
    { id: "02.2", title: tx("التعيين والتهيئة", "Onboarding"), sub: tx("تهيئة الموظفين الجدد", "New-hire onboarding"), to: <Link to="/digit-hr/s/$section" params={{ section: "02.2" }} className="dhr-act dhr-act-ghost">{tx("فتح", "Open")}</Link>,
      figures: [{ label: tx("تهيئة جارية", "In progress"), value: src.v(<Native dt="Employee Onboarding" module="02" filters={[["name", "in", onbActive.map((o) => s(o.name))]]} className="dhr-link">{onbActive.length}</Native>, "Employee Onboarding") }, { label: tx("عروض مقبولة بلا تهيئة", "Accepted, no onboarding"), value: src.v(acceptedNoOnb.length, "Job Offer", "Employee Onboarding"), tone: acceptedNoOnb.length ? "warn" : undefined }] },
    { id: "02.3", title: tx("الأهداف وتقييم الأداء", "Performance & Goals"), sub: tx("دورات التقييم النشطة", "Active appraisal cycles"), to: <Link to="/digit-hr/s/$section" params={{ section: "02.3" }} className="dhr-act dhr-act-ghost">{tx("فتح", "Open")}</Link>,
      figures: [{ label: tx("تقييمات مسودة", "Draft appraisals"), value: src.v(aq.drafts.length, "Appraisal Cycle", "Appraisal") }, { label: tx("مشمولون بلا تقييم", "Appraisees without appraisal"), value: aq.without === null ? ne : src.v(aq.without.length, "Appraisal Cycle", "Appraisal"), tone: aq.without?.length ? "warn" : undefined }, { label: tx("دورات تجاوزت موعدها", "Cycles past end date"), value: src.v(aq.overdueCycles.length, "Appraisal Cycle"), tone: aq.overdueCycles.length ? "danger" : undefined }] },
    { id: "02.4", title: tx("التعلم والمهارات", "Learning & Skills"), sub: tx("فعاليات التدريب", "Training events"), to: <Link to="/digit-hr/s/$section" params={{ section: "02.4" }} className="dhr-act dhr-act-ghost">{tx("فتح", "Open")}</Link>,
      figures: [{ label: tx("فعاليات قادمة", "Upcoming events"), value: src.v(lq.upcoming.length, "Training Event") }, { label: tx("بانتظار تقييم التدريب", "Feedback pending"), value: lq.feedbackPending === null ? ne : src.v(lq.feedbackPending.length, "Training Event", "Training Feedback") }, { label: tx("فعاليات بلا نتائج", "Results not recorded"), value: lq.resultPending === null ? src.v(null, "Training Result") : src.v(lq.resultPending.length, "Training Event") }] },
    { id: "02.5", title: tx("المواهب والتعاقب", "Succession & Talent Pool"), sub: tx("آخر تقييم معتمد لكل موظف", "Latest submitted appraisal per employee"), to: <Link to="/digit-hr/s/$section" params={{ section: "02.5" }} className="dhr-act dhr-act-ghost">{tx("فتح", "Open")}</Link>,
      figures: [{ label: tx("موظفون لديهم تقييم معتمد", "Employees with a submitted appraisal"), value: reviewed === null ? src.v(null, "Employee", "Appraisal") : reviewed }, { label: tx("ترشيحات الخلافة", "Successor nominations"), value: <Chip tone="neutral">{tx("مخطط", "Planned")}</Chip> }] },
  ];

  const board = STAGES.filter((st) => st.id !== "closed");
  const closed = cands.filter((r) => r.stage === "closed").length;
  const PER_COL = 5;

  return (
    <div className="space-y-4" data-module-home="02">
      <HrCommandHeader embedded={!home} id="02" code="02" suite={tx("رأس المال البشري والمواهب", "Human Capital Management")} title={tx("استوديو المواهب", "Talent Studio")}
        purpose={tx("المرشحون عبر مراحل مشتقة من سجلاتهم المرتبطة؛ كل إجراء يفتح مسودة أصلية واحدة.", "Candidates move through stages derived from their linked records; every action opens one native draft.")}
        actions={<><Native dt="Job Applicant" module="02" className="dhr-act dhr-act-primary">{tx("المتقدمون", "Applicants")}</Native><Native dt="Job Opening" module="02" className="dhr-act">{tx("الوظائف", "Openings")}</Native><ModuleLinks module="02" tx={tx} /></>}>
        <HrContextToolbar tx={tx} active={opening ? 1 : 0} scopeKey={opening} end={<><SourcesPill src={src} /><Pill title={tx("لا تُعرض مدة المرحلة لعدم تسجيل تاريخ دخولها.", "Stage dwell time is not shown because stage-entry dates are not recorded.")}>{tx("المرحلة من السجلات المرتبطة", "Stage from linked records")}</Pill></>}>
          <CtxField label={tx("الوظيفة", "Opening")}>
            <select aria-label={tx("تصفية حسب الوظيفة", "Filter by opening")} value={opening} onChange={(e) => patch({ opening: e.target.value })} className="max-w-[18rem]">
              <option value="">{tx("كل الوظائف", "All openings")}</option>
              {openOpenings.map((o) => <option key={s(o.name)} value={s(o.name)} data-no-i18n>{tx(arLabel(s(o.job_title) || s(o.name)), s(o.job_title) || s(o.name))}</option>)}
            </select>
          </CtxField>
          {opening && <button type="button" className="dhr-act" onClick={() => patch({ opening: "" })}>{tx("مسح", "Clear")}</button>}
        </HrContextToolbar>
      </HrCommandHeader>
      <SourceNotice src={src} quietLoading />
      {m.err && <p role="alert" className="dhr-alert text-sm">{m.err}</p>}

      {/* Pipeline spans the width (five stage columns need it); decisions sit beside the development layer. Phones: decisions → pipeline → development. */}
      <div className="grid gap-4 xl:grid-cols-12" data-workspace-grid="talent">
        <div className="order-2 min-w-0 xl:order-none xl:col-span-12 xl:row-start-1">
            <HrInsightPanel title={tx("مسار المرشحين", "Candidate pipeline")} data-pipeline={cands.length}
              info={tx("المرحلة مشتقة من آخر سجل مرتبط (مقابلة، عرض، تهيئة). مرشحون مرئيون لك فقط. إنشاء الموظف من التهيئة يتم على الخادم. لا تُعرض مدة المرحلة لعدم تسجيل تاريخ دخولها.", "The stage is derived from the latest linked record (interview, offer, onboarding). Only candidates visible to you. Employee creation from onboarding runs on the server. Stage dwell time is not shown because stage-entry dates are not recorded.")}
              meta={<><b className="dhr-tnum" data-no-i18n>{cands.length}</b> {tx("مرشحًا نشطًا", "active candidates")}{closed > 0 && <> · {tx("مغلق/مرفوض:", "Closed / rejected:")} <b className="dhr-tnum" data-no-i18n>{closed}</b></>}</>}>
              {!m.ready ? <HrEmptyOrBlockedState read={src.worst(...CAND_SRC) ?? { state: "LOADING" }} tx={tx} rows={4} />
                : !cands.length ? <HrEmptyOrBlockedState tx={tx} title={opening ? tx("لا مرشحين لهذه الوظيفة.", "No candidates for this opening.") : tx("لا مرشحين بعد.", "No candidates yet.")} body={tx("يظهر هنا كل متقدم مع مرحلته والإجراء التالي.", "Each applicant appears here with their stage and next action.")} action={<Native dt="Job Applicant" module="02" className="dhr-act">{tx("المتقدمون", "Applicants")}</Native>} />
                : <div className="dhr-board" role="list" aria-label={tx("مراحل المسار", "Pipeline stages")}>
                    {board.map((st) => { const col = cands.filter((r) => r.stage === st.id); return (
                      <section key={st.id} role="listitem" className="dhr-col" data-stage-col={st.id} data-stage-count={col.length} aria-label={tx(st.ar, st.en)}>
                        <div className="dhr-col-h"><span>{tx(st.ar, st.en)}</span><b className="dhr-tnum text-[var(--dhr-muted)]" data-no-i18n>{col.length}</b></div>
                        <ul className="flex flex-col gap-2 p-2">
                          {col.slice(0, PER_COL).map((r) => (
                            <li key={r.id} className="dhr-card-sm" data-pipeline-card={r.id}>
                              <div className="flex items-start gap-2">
                                <span className="dhr-avatar" aria-hidden data-no-i18n>{initials(r.who)}</span>
                                <div className="min-w-0 flex-1">
                                  <Link to="/digit-hr/applicants/$name" params={{ name: r.id }} className="dhr-link block truncate text-[13px] font-semibold"><span data-no-i18n>{tx(arLabel(r.who), r.who)}</span></Link>
                                  <span className="block truncate text-[11.5px] text-[var(--dhr-muted)]" data-no-i18n>{r.opening ? tx(arLabel(r.opening), r.opening) : "—"}</span>
                                </div>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-[var(--dhr-muted)]">
                                <span className="min-w-0 truncate"><Native dt={r.lastDoc.dt} name={r.lastDoc.name} module="02" className="dhr-link">{tx(DT_AR[r.lastDoc.dt] ?? r.lastDoc.dt, r.lastDoc.dt)}</Native> <span data-no-i18n>{relDay(today, r.last, tx)}</span></span>
                                {cardAction(r, m, tx)}
                              </div>
                            </li>
                          ))}
                          {col.length > PER_COL && <li><button type="button" className="dhr-act dhr-act-ghost w-full" onClick={() => patch({ view: "candidates" })}>{tx(`+${col.length - PER_COL} في سجل المرشحين`, `+${col.length - PER_COL} more in the register`)}</button></li>}
                          {!col.length && <li className="px-1 text-[11.5px] text-[var(--dhr-muted)]">{tx("لا أحد", "No one")}</li>}
                        </ul>
                      </section>); })}
                  </div>}
            </HrInsightPanel>
        </div>
        <aside className="order-1 flex min-w-0 flex-col gap-4 xl:order-none xl:col-span-5 xl:col-start-8 xl:row-start-2">
            <HrInsightPanel title={tx("قرارات المواهب", "Talent decisions")} flush data-talent-decisions={decReady ? decisions.length : ""}
              meta={decReady ? <><b className="dhr-tnum" data-no-i18n>{decisions.length}</b> {tx("بانتظار إجراء", "awaiting action")}</> : tx("مقابلات · تقييمات · عروض · تهيئة", "Interviews · feedback · offers · onboarding")}>
              {!decReady ? <div className="p-4"><HrEmptyOrBlockedState read={src.worst("Interview", "Job Offer", "Employee Onboarding", "Job Applicant") ?? { state: "LOADING" }} tx={tx} rows={4} /></div>
                : <HrPriorityQueue<Decision> label={tx("قرارات المواهب", "Talent decisions")} tx={tx} items={decisions} groups={DGROUPS} groupOf={(d) => d.group} keyOf={(d) => d.key} toneOf={(d) => d.tone} maxHeight="620px"
                    empty={<div className="p-4"><HrEmptyOrBlockedState tx={tx} title={tx("لا قرارات معلقة.", "No pending decisions.")} body={tx("تظهر هنا المقابلات المستحقة والعروض والتهيئة التي تنتظر إجراء.", "Interviews due, offers and onboarding handoffs that need action appear here.")} /></div>}
                    render={(d) => (
                      <div className="grid gap-1">
                        <div className="flex items-start justify-between gap-2"><span className="min-w-0"><span className="block truncate text-[13px] font-semibold" data-no-i18n>{tx(arLabel(d.who), d.who)}</span><span className="block text-[12px]">{tx(...d.what)}</span></span><span className="shrink-0 text-[11px] text-[var(--dhr-muted)]" data-no-i18n>{relDay(today, d.date, tx)}</span></div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[var(--dhr-muted)]"><Native dt={d.dt} name={d.name} module="02" className="dhr-link dhr-code !text-[11px]">{d.name}</Native>{d.action}</div>
                      </div>
                    )} />}
              {decReady && !fbReady && <p className="border-t border-[var(--dhr-sep)] px-4 py-2 text-[11.5px] text-[var(--dhr-muted)]">{tx("تقييمات المقابلات المنتظرة:", "Interview feedback awaited:")} {ne}</p>}
            </HrInsightPanel>
        </aside>
        <div className="order-3 flex min-w-0 flex-col gap-4 xl:order-none xl:col-span-7 xl:col-start-1 xl:row-start-2">
        <HrInsightPanel title={tx("طبقة التطوير", "Development layer")} meta={tx("التهيئة · الأداء · التعلم · التعاقب", "Onboarding · performance · learning · succession")} info={tx("كل رقم من سجلات القسم نفسه ويفتح المجتمع نفسه.", "Every figure comes from the section's own records and opens the same population.")} data-development-layer>
          <HrSectionNavigator items={dev} label={tx("أقسام المواهب", "Talent sections")} />
        </HrInsightPanel>
        <HrInsightPanel title={tx("الوظائف المعلنة", "Open vacancies")} meta={tx("اختر وظيفة لتصفية المسار.", "Pick an opening to filter the pipeline.")} flush data-open-vacancies={openOpenings.length}>
          {openOpenings.length ? <ul className="divide-y divide-[var(--dhr-sep)]">{openOpenings.slice(0, 8).map((o) => { const n_ = m.applicants.filter((a) => s(a.job_title) === s(o.name)).length; const on = opening === s(o.name); return (
            <li key={s(o.name)} className="flex min-h-11 items-center justify-between gap-2 px-4 py-1.5">
              <button type="button" onClick={() => patch({ opening: on ? "" : s(o.name) })} aria-pressed={on} className={`dhr-link min-w-0 truncate text-start text-[13px] ${on ? "font-semibold" : ""}`}><span data-no-i18n>{tx(arLabel(s(o.job_title) || s(o.designation) || s(o.name)), s(o.job_title) || s(o.designation) || s(o.name))}</span></button>
              <span className="flex shrink-0 items-center gap-2 text-[12px] text-[var(--dhr-muted)]">{tx("متقدمون", "applicants")} <b className="dhr-tnum text-[var(--dhr-text)]" data-no-i18n>{n_}</b><Native dt="Job Opening" name={s(o.name)} module="02" className="dhr-act dhr-act-ghost">{tx("فتح", "Open")}</Native></span>
            </li>); })}</ul>
            : <div className="p-4"><HrEmptyOrBlockedState read={src.read("Job Opening")} tx={tx} title={tx("لا وظائف معلنة.", "No open vacancies.")} action={<Native dt="Job Opening" module="02" className="dhr-act">{tx("الوظائف", "Openings")}</Native>} /></div>}
        </HrInsightPanel>
        </div>
      </div>

      <section className="dhr-panel" data-talent-tabs={view}>
        <HrTabs idBase="talent" label={tx("أدوات المواهب", "Talent tools")} value={view} onChange={(v) => patch({ view: v === "queues" ? "" : v }, true)}
          tabs={[{ id: "queues", label: tx("قوائم العمل", "Work queues") }, { id: "candidates", label: tx("سجل المرشحين", "Candidate register"), count: m.ready ? m.rows.length : undefined }, { id: "schedule", label: tx("جدول المقابلات", "Interview schedule") }]} />
        <div id="talent-panel" role="tabpanel" aria-labelledby={`talent-tab-${view}`}>
          {view === "queues" ? <TalentQueues bare /> : view === "candidates" ? <CandidateRegister bare /> : <InterviewSchedule day={iday} onDay={(d) => patch({ iday: d }, true)} interviews={m.interviews} cand={cand} src={src} tx={tx} />}
        </div>
      </section>
    </div>
  );
}

function InterviewSchedule({ day, onDay, interviews, cand, src, tx }: { day: string; onDay: (d: string) => void; interviews: R[]; cand: (i: R) => string; src: Sources; tx: Tx }) {
  const list = interviewsOn(interviews, day) as R[];
  return (
    <div className="p-4" data-interview-schedule>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <DateInput aria-label={tx("يوم المقابلات", "Interview day")} className="dhr-compact-input w-44" value={day} onChange={(e) => onDay(e.target.value)} data-no-i18n />
        <Native dt="Interview" module="02" className="dhr-act">{tx("سجل المقابلات", "Interview register")}</Native>
      </div>
      {list.length ? <ul className="divide-y divide-[var(--dhr-sep)] rounded-md border border-[var(--dhr-sep)]">{list.map((r) => (
        <li key={s(r.name)} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px]">
          <span className="flex items-center gap-3"><span className="dhr-tnum w-24 text-[12px] text-[var(--dhr-muted)]" dir="ltr" data-no-i18n>{s(r.from_time).slice(0, 5) || "—"}–{s(r.to_time).slice(0, 5) || "—"}</span><Native dt="Interview" name={s(r.name)} module="02" className="dhr-link font-medium"><span data-no-i18n>{tx(arLabel(cand(r)), cand(r))}</span></Native></span>
          <span className="flex items-center gap-2"><span className="text-[12px] text-[var(--dhr-muted)]" data-no-i18n>{tx(arLabel(s(r.interview_round)), s(r.interview_round))}</span><Chip>{tx(STATUS_AR[s(r.status)] ?? s(r.status), s(r.status))}</Chip></span>
        </li>))}</ul>
        : <HrEmptyOrBlockedState read={src.read("Interview")} tx={tx} title={tx("لا مقابلات في هذا اليوم.", "No interviews on this day.")} />}
    </div>
  );
}

/* ------------------------------------------------------------------ shared registers */

type Cand = CandFacts & { next: ReactNode };

/** V9.3 primary working surface: one row per Job Applicant with its derived stage from linked native records. Shared by module 02 and /digit-hr/hiring. */
export function CandidateRegister({ bare = false }: { bare?: boolean } = {}) {
  const { tx } = useTx();
  const m = useCandidateModel(tx);
  const rows: Cand[] = m.rows.map((r) => {
    const id = r.id, pendingIv = r.pendingInterview;
    const next = r.stage === "accepted" && r.accepted ? <Button variant="outline" type="button" className="dhr-btn dhr-btn-sm dhr-btn-primary" onClick={(e) => { e.stopPropagation(); m.handoff(s(r.accepted?.name)); }}>{tx("+ تهيئة", "+ Onboarding")}</Button>
      : r.stage === "onboarding" ? <Native dt="Employee Onboarding" name={s(r.onboarding?.name)} module="02" className="dhr-btn dhr-btn-sm">{tx("متابعة التهيئة", "Open onboarding")}</Native>
      : r.stage === "offer" ? <Native dt="Job Offer" name={s(r.offer?.name)} module="02" className="dhr-btn dhr-btn-sm">{tx("مراجعة العرض", "Review offer")}</Native>
      : pendingIv ? <span className="flex flex-wrap gap-1"><Native dt="Interview" name={s(pendingIv.name)} module="02" className="dhr-btn dhr-btn-sm">{tx("مراجعة المقابلة", "Review interview")}</Native>{m.feedbackMeta && hasPerm(m.feedbackMeta, "create") && <Button variant="outline" data-interview-feedback={s(pendingIv.name)} onClick={() => m.createFeedback(s(pendingIv.name))}>{tx("تقييم المقابلة", "Evaluate interview")}</Button>}{r.feedback.map((f) => <Native key={s(f.name)} dt="Interview Feedback" name={s(f.name)} module="02" className="dhr-btn dhr-btn-sm">{tx("مراجعة التقييم", "Review feedback")}</Native>)}{m.canCreate("Job Offer") && <Button variant="outline" data-applicant-offer={id} onClick={() => m.createOffer(id)}>{tx("+ عرض عمل", "+ Job offer")}</Button>}</span>
      : r.stage === "closed" ? <span className="text-xs text-[var(--dhr-muted)]">—</span>
      : <span className="flex flex-wrap gap-1"><Native dt="Job Applicant" name={id} module="02" className="dhr-btn dhr-btn-sm">{tx("فتح المتقدم", "Open applicant")}</Native>{m.canCreate("Interview") && <Button variant="outline" data-schedule-interview={id} onClick={() => m.createInterview(id)}>{tx("جدولة مقابلة", "Schedule interview")}</Button>}</span>;
    return { ...r, next };
  });
  return (
    <section className={bare ? "p-4" : "dhr-card rounded-[14px] p-4"} data-candidate-register>
      <h2 className={bare ? "sr-only" : "font-semibold"}>{tx("سجل المرشحين", "Candidate register")}</h2>
      <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("المرحلة مشتقة من السجلات المرتبطة بالمتقدم (مقابلة، عرض، تهيئة). «آخر حدث» هو آخر تعديل موثّق — لا تُعرض مدة المرحلة لعدم تسجيل تاريخ دخولها.", "Stage is derived from records linked to the applicant (interview, offer, onboarding). \"Latest event\" is the last documented change — stage dwell time is not shown because stage-entry dates are not recorded.")}</p>
      {m.err && <p role="alert" className="dhr-alert mb-2 text-sm">{m.err}</p>}
      <WorkTable<Cand> label="candidates" tx={tx} rows={rows} emptyState={m.ready ? undefined : m.src.empty(...CAND_SRC)} rowKey={(r) => r.id} groups={STAGES} groupOf={(r) => r.stage} searchText={(r) => `${r.who} ${r.id} ${r.opening}`}
        cols={[
          { key: "who", ar: "المرشح", en: "Candidate", sort: (r) => r.who, render: (r) => <span data-no-i18n><Native dt="Job Applicant" name={r.id} module="02" className="font-medium hover:underline">{tx(arLabel(r.who), r.who)}</Native><span className="block text-[11px] text-[var(--dhr-muted)]">{r.id} · <Link to="/digit-hr/applicants/$name" params={{ name: r.id }} className="text-primary hover:underline" data-applicant-360={r.id}>{tx("ملف 360", "360 view")}</Link></span></span> },
          { key: "op", ar: "الوظيفة", en: "Opening", sort: (r) => r.opening, render: (r) => <span data-no-i18n>{r.opening ? tx(arLabel(r.opening), r.opening) : "—"}</span> },
          { key: "st", ar: "المرحلة", en: "Stage", sort: (r) => STAGES.findIndex((x) => x.id === r.stage), render: (r) => { const g = STAGES.find((x) => x.id === r.stage); return g ? <Chip tone={g.tone}>{tx(g.ar, g.en)}</Chip> : null; } },
          { key: "ow", ar: "المسؤول", en: "Owner", render: (r) => <span data-no-i18n className="text-xs">{r.owner ? tx(arLabel(r.owner), r.owner) : "—"}</span> },
          { key: "ls", ar: "آخر حدث", en: "Latest event", sort: (r) => r.last, render: (r) => <span className="text-xs"><Native dt={r.lastDoc.dt} name={r.lastDoc.name} module="02" className="hover:underline">{tx(DT_AR[r.lastDoc.dt] ?? r.lastDoc.dt, r.lastDoc.dt)}</Native> <span data-no-i18n className="text-[var(--dhr-muted)]">{r.last}</span></span> },
          { key: "nx", ar: "الإجراء التالي", en: "Next action", render: (r) => r.next },
        ]} />
    </section>
  );
}

type QItem = { key: string; queue: string; dt: string; name: string; who: string; context: string; when: string; action: ReactNode };
const QUEUES = [
  { id: "interview-due", ar: "مقابلات مستحقة", en: "Interviews due", tone: "danger" as const },
  { id: "feedback-awaited", ar: "بانتظار تقييم المقابلة", en: "Interview feedback awaited", tone: "warn" as const },
  { id: "appraisal-missing", ar: "مشمول بالدورة بلا تقييم", en: "Appraisee without appraisal", tone: "warn" as const },
  { id: "appraisal-draft", ar: "تقييم أداء مسودة", en: "Draft appraisal" },
  { id: "cycle-overdue", ar: "دورة تقييم تجاوزت موعدها", en: "Appraisal cycle past end date", tone: "danger" as const },
  { id: "training-feedback", ar: "بانتظار تقييم التدريب", en: "Training feedback pending", tone: "warn" as const },
  { id: "training-result", ar: "فعالية بلا نتائج", en: "Training results not recorded" },
  { id: "interview-upcoming", ar: "مقابلات قادمة", en: "Upcoming interviews" },
  { id: "training-upcoming", ar: "فعاليات تدريب قادمة", en: "Upcoming training" },
];

/** Batch B: one source-backed queue register for recruitment, performance and learning; actions open idempotent native drafts. */
export function TalentQueues({ bare = false }: { bare?: boolean } = {}) {
  const { tx } = useTx();
  const navigate = useNavigate();
  useStoreVersion(); useSessionUser();
  useScopeMetas(["Interview", "Interview Feedback", "Appraisal Cycle", "Appraisal", "Training Event", "Training Feedback", "Training Result", "Employee", "Job Applicant"]);
  const src = useSources(tx);
  const [err, setErr] = useState("");
  const applicant = new Map(src.rows("Job Applicant").map((a) => [s(a.name), s(a.applicant_name)]));
  const cand = (i: { job_applicant?: unknown }) => applicant.get(s(i.job_applicant)) || s(i.job_applicant);
  const admin = isHrAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const fbReady = src.ready("Interview Feedback") && admin;
  const iq = interviewQueue(src.rows("Interview"), fbReady ? src.rows("Interview Feedback") : null, today);
  const aq = appraisalQueue(src.rows("Appraisal Cycle"), src.rows("Appraisal"), today, admin && src.ready("Appraisal"));
  const lq = learningQueue(src.rows("Training Event"), admin && src.ready("Training Feedback") ? src.rows("Training Feedback") : null, src.ready("Training Result") ? src.rows("Training Result") : null, today);
  const open = (dt: string, name: string) => { const p = placeDoc(dt, "02"); if (p) { enterHrNative(p.sub); void navigate({ to: "/app/$app/$doctype/$name", params: { app: p.app, doctype: p.slug, name }, search: HR_DOC_SEARCH as never }); } };
  const run = (f: () => { doc: { name: string } }, dt: string) => { setErr(""); try { const r = f(); open(dt, r.doc.name); } catch (e) { setErr((e as Error).message); } };
  const canCreate = (dt: string) => { const m = cachedMeta(dt); return !!m && hasPerm(m, "create"); };
  const btn = (label: ReactNode, onClick: () => void, data: Record<string, string>) => <Button variant="outline" type="button" className="dhr-btn dhr-btn-sm dhr-btn-primary min-h-9" onClick={onClick} {...data}>{label}</Button>;
  const items: QItem[] = [
    ...iq.due.map((i): QItem => ({ key: "iv" + s(i.name), queue: "interview-due", dt: "Interview", name: s(i.name), who: cand(i), context: s(i.status), when: s(i.scheduled_on), action: <Native dt="Interview" name={s(i.name)} module="02" className="dhr-btn dhr-btn-sm">{tx("مراجعة المقابلة", "Review interview")}</Native> })),
    ...(iq.awaitingFeedback ?? []).map((i): QItem => ({ key: "fb" + s(i.name), queue: "feedback-awaited", dt: "Interview", name: s(i.name), who: cand(i), context: s(i.interview_type), when: s(i.scheduled_on), action: canCreate("Interview Feedback") ? btn(tx("تقييم المقابلة", "Evaluate interview"), () => run(() => ({ doc: interviewFeedbackDraft(s(i.name)) }), "Interview Feedback"), { "data-queue-feedback": s(i.name) }) : <Native dt="Interview" name={s(i.name)} module="02" className="dhr-btn dhr-btn-sm">{tx("فتح", "Open")}</Native> })),
    ...(aq.without ?? []).map((a): QItem => ({ key: "am" + a.cycle + a.employee, queue: "appraisal-missing", dt: "Appraisal Cycle", name: a.cycle, who: a.employeeName, context: a.template, when: "", action: canCreate("Appraisal") ? btn(tx("+ تقييم أداء (مسودة)", "+ Draft appraisal"), () => run(() => appraisalDraft(a.cycle, a.employee), "Appraisal"), { "data-queue-appraisal": `${a.cycle}|${a.employee}` }) : <Native dt="Appraisal Cycle" name={a.cycle} module="02" className="dhr-btn dhr-btn-sm">{tx("فتح الدورة", "Open cycle")}</Native> })),
    ...aq.drafts.map((a): QItem => ({ key: "ad" + s(a.name), queue: "appraisal-draft", dt: "Appraisal", name: s(a.name), who: s(a.employee_name) || s(a.employee), context: s(a.appraisal_cycle), when: "", action: <Native dt="Appraisal" name={s(a.name)} module="02" className="dhr-btn dhr-btn-sm">{tx("استكمال التقييم", "Complete appraisal")}</Native> })),
    ...aq.overdueCycles.map((c): QItem => ({ key: "co" + s(c.name), queue: "cycle-overdue", dt: "Appraisal Cycle", name: s(c.name), who: s(c.cycle_name) || s(c.name), context: s(c.status), when: s(c.end_date), action: <Native dt="Appraisal Cycle" name={s(c.name)} module="02" className="dhr-btn dhr-btn-sm">{tx("مراجعة الدورة", "Review cycle")}</Native> })),
    ...(lq.feedbackPending ?? []).map((p): QItem => ({ key: "tf" + p.event + p.employee, queue: "training-feedback", dt: "Training Event", name: p.event, who: p.employeeName, context: p.eventName, when: "", action: canCreate("Training Feedback") ? btn(tx("+ تقييم التدريب (مسودة)", "+ Draft feedback"), () => run(() => trainingFeedbackDraft(p.event, p.employee), "Training Feedback"), { "data-queue-training": `${p.event}|${p.employee}` }) : <Native dt="Training Event" name={p.event} module="02" className="dhr-btn dhr-btn-sm">{tx("فتح الفعالية", "Open event")}</Native> })),
    ...(lq.resultPending ?? []).map((e): QItem => ({ key: "tr" + s(e.name), queue: "training-result", dt: "Training Event", name: s(e.name), who: s(e.event_name) || s(e.name), context: s(e.event_status), when: s(e.end_time).slice(0, 10), action: <Native dt="Training Result" module="02" className="dhr-btn dhr-btn-sm">{tx("سجل النتائج", "Results register")}</Native> })),
    ...iq.upcoming.map((i): QItem => ({ key: "iu" + s(i.name), queue: "interview-upcoming", dt: "Interview", name: s(i.name), who: cand(i), context: s(i.status), when: s(i.scheduled_on), action: <Native dt="Interview" name={s(i.name)} module="02" className="dhr-btn dhr-btn-sm">{tx("فتح", "Open")}</Native> })),
    ...lq.upcoming.map((e): QItem => ({ key: "tu" + s(e.name), queue: "training-upcoming", dt: "Training Event", name: s(e.name), who: s(e.event_name) || s(e.name), context: s(e.type), when: s(e.start_time).slice(0, 10), action: <Native dt="Training Event" name={s(e.name)} module="02" className="dhr-btn dhr-btn-sm">{tx("فتح", "Open")}</Native> })),
  ];
  const Q_SRC = ["Interview", "Appraisal Cycle", "Appraisal", "Training Event"];
  const ne = (why: [string, string]) => <NotEvaluated tx={tx} why={why} />;
  const kpi = (label: string, deps: string[]) => <MetricValue label={label} src={src} tx={tx} back="02" deps={deps} />;
  const QST: Record<string, string> = { Pending: "معلقة", "Under Review": "قيد التقييم", Scheduled: "مجدولة", Completed: "مكتملة", "In Progress": "جارية", "Not Started": "لم تبدأ" };
  return (
    <section className={bare ? "p-4" : "dhr-card rounded-[14px] p-4"} data-talent-queues={items.length}>
      <h2 className={bare ? "sr-only" : "font-semibold"}>{tx("قوائم العمل: المقابلات والأداء والتعلم", "Work queues: interviews, performance & learning")}</h2>
      <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("القواعد من المصدر: التقييم يُنشأ فقط لمشمولي دورة غير مكتملة؛ تقييم التدريب فقط لمشارك غير غائب في فعالية معتمدة. الإجراءات تفتح مسودة أصلية واحدة لكل موظف، ولا تُدخل درجات.", "Source rules: an appraisal is created only for an appraisee of a non-completed cycle; training feedback only for a non-absent participant of a submitted event. Actions open one native draft per employee and never enter scores.")}</p>
      <StatRow items={[
        { label: tx("مقابلات مستحقة", "Interviews due"), value: kpi("Interviews Due", ["Interview"]), tone: iq.due.length ? "warn" : undefined },
        { label: tx("بانتظار تقييم المقابلة", "Interview feedback awaited"), value: fbReady ? kpi("Interview Feedback Awaited", ["Interview", "Interview Feedback"]) : ne(HIDDEN) },
        { label: tx("تقييمات أداء مسودة", "Draft appraisals"), value: kpi("Appraisals To Complete", ["Appraisal Cycle", "Appraisal"]) },
        { label: tx("مشمولون بلا تقييم", "Appraisees without appraisal"), value: admin ? kpi("Appraisees Without Appraisal", ["Appraisal Cycle", "Appraisal"]) : ne(HIDDEN) },
        { label: tx("فعاليات بانتظار تقييم التدريب", "Events awaiting training feedback"), value: admin ? kpi("Training Feedback Pending", ["Training Event", "Training Feedback"]) : ne(HIDDEN) },
        { label: tx("فعاليات بلا نتائج", "Events without results"), value: kpi("Training Results Pending", ["Training Event", "Training Result"]) },
      ]} />
      {err && <p role="alert" className="dhr-alert my-2 text-sm">{err}</p>}
      <div className="mt-3">
        <WorkTable<QItem> label="talent-queues" tx={tx} rows={src.ready(...Q_SRC) ? items : []} rowKey={(r) => r.key} groups={QUEUES} groupOf={(r) => r.queue} pageSize={12} emptyState={src.ready(...Q_SRC) ? undefined : src.empty(...Q_SRC)} searchText={(r) => `${r.who} ${r.name} ${r.context}`}
          cols={[
            { key: "w", ar: "الموظف / المرشح", en: "Employee / candidate", sort: (r) => r.who, render: (r) => <span data-no-i18n className="font-medium">{tx(arLabel(r.who), r.who)}</span> },
            { key: "q", ar: "القائمة", en: "Queue", sort: (r) => r.queue, render: (r) => { const g = QUEUES.find((x) => x.id === r.queue); return g ? <Chip tone={g.tone}>{tx(g.ar, g.en)}</Chip> : null; } },
            { key: "s", ar: "السجل المصدر", en: "Source record", render: (r) => <span data-no-i18n className="text-xs"><Native dt={r.dt} name={r.name} module="02" className="hover:underline">{r.name}</Native>{r.context ? <span className="ms-1 text-[var(--dhr-muted)]">· {tx(QST[r.context] ?? arLabel(r.context), r.context)}</span> : null}</span> },
            { key: "d", ar: "التاريخ", en: "Date", sort: (r) => r.when, render: (r) => <span data-no-i18n className="text-xs">{r.when || "—"}</span> },
            { key: "a", ar: "الإجراء المؤهل", en: "Eligible action", render: (r) => r.action },
          ]} />
      </div>
    </section>
  );
}
