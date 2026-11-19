import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { PipelineBoard, NativeLink, s, type Stage } from "@/components/digithr/PipelineBoard";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { handoffOffer } from "@/plugins/digit_hr/compat/offerHandoff";
import { toast } from "sonner";
import { CandidateRegister } from "@/components/digithr/workspaces/TalentWorkspace";
import { arLabel, StatRow, useSources, SourceNotice, live } from "@/components/digithr/workspaces/shared";

export const Route = createFileRoute("/digit-hr/hiring")({
  head: () => ({ meta: [
    { title: "DIGIT HR — Hiring to Employee Pipeline" },
    { name: "description", content: "Requisition, applicant, interview, offer and onboarding pipeline from native recruitment records." },
    { property: "og:title", content: "DIGIT HR — Hiring Pipeline" },
    { property: "og:description", content: "Recruitment funnel from requisition to onboarded employee." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: HiringBoard,
});

const STAGES: Stage[] = [
  { key: "req", ar: "طلبات التوظيف", en: "Job requisitions", dt: "Job Requisition", statusField: "status", label: (r) => s(r.designation) },
  { key: "app", ar: "المتقدمون", en: "Applicants", dt: "Job Applicant", statusField: "status", label: (r) => s(r.applicant_name) },
  { key: "int", ar: "المقابلات", en: "Interviews", dt: "Interview", statusField: "status", label: (r) => `${s(r.job_applicant)} · ${s(r.scheduled_on)}` },
  { key: "off", ar: "عروض العمل", en: "Job offers", dt: "Job Offer", statusField: "status", label: (r) => `${s(r.applicant_name)} · ${s(r.designation)}` },
  { key: "onb", ar: "التهيئة", en: "Onboarding", dt: "Employee Onboarding", statusField: "boarding_status", label: (r) => s(r.employee_name) || s(r.job_applicant),
    note: { ar: "إنشاء الموظف من التهيئة يتم على الخادم.", en: "Creating the Employee from onboarding runs on the server." } },
];

function HiringBoard() {
  const { tx } = useTx();
  useStoreVersion(); useSessionUser();
  const src = useSources(tx);
  const applicants = src.rows("Job Applicant").filter(live);
  const offers = src.rows("Job Offer").filter(live);
  const accepted = offers.filter((o) => s(o.status) === "Accepted");
  const rejected = offers.filter((o) => s(o.status) === "Rejected");
  const onb = src.rows("Employee Onboarding").filter(live);
  const hired = onb.filter((o) => s(o.employee));
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : "—");
  // Unique applicants with an accepted offer / unique applicants (Job Offer.job_applicant Link).
  const acceptedApplicants = new Set(accepted.map((o) => s(o.job_applicant)).filter(Boolean));
  const uniqueApplicants = new Set(applicants.map((a) => s(a.name)));
  const KPI_SRC: string[][] = [["Job Applicant"], ["Job Offer"], ["Job Offer"], ["Job Applicant", "Job Offer"], ["Employee Onboarding"]];
  const kpis: [string, string, string | number, string, string][] = [
    ["المتقدمون", "Applicants", uniqueApplicants.size, "", ""],
    ["قبول العروض المحسومة", "Decided-offer acceptance", pct(accepted.length, accepted.length + rejected.length), `${accepted.length} / ${accepted.length + rejected.length}`, "مقبول ÷ (مقبول + مرفوض)، دون العروض المعلقة"],
    ["العروض المقبولة من كل العروض", "Accepted / all offers", pct(accepted.length, offers.length), `${accepted.length} / ${offers.length}`, "مقبول ÷ إجمالي العروض"],
    ["تحويل المتقدمين إلى عرض مقبول", "Applicant → accepted offer", pct(acceptedApplicants.size, uniqueApplicants.size), `${acceptedApplicants.size} / ${uniqueApplicants.size}`, "متقدمون بعرض مقبول ÷ المتقدمين"],
    ["تهيئة مرتبطة بموظف", "Onboarding linked to employee", hired.length, `${hired.length} / ${onb.length}`, ""],
  ];
  return (
    <DigitHrLayout title={tx("من التوظيف إلى الموظف", "Hiring to employee")} subtitle={tx("مسار التوظيف من السجلات الأصلية: اضغط أي رقم أو حالة لرؤية السجلات نفسها وفتحها. الأعداد هي السجلات المتاحة لك فقط.", "Recruitment pipeline from native records: click any number or status to see the exact records and open them. Counts are records visible to you only.")} crumbs={[{ label: tx("التوظيف", "Hiring") }]}>
      <SourceNotice src={src} />
      <div className="mb-4"><StatRow items={kpis.map(([ar, en, v, frac, hint], i) => ({ label: `${tx(ar, en)}${frac && src.ready(...(KPI_SRC[i] ?? [])) ? ` (${frac})` : ""}`, value: src.v(v, ...(KPI_SRC[i] ?? [])), hint }))} /></div>
      <div className="mb-4"><CandidateRegister /></div>
      <PipelineBoard stages={STAGES} module="02" />
      <section className="dhr-card rounded-[18px] p-4">
        <h2 className="mb-2 font-semibold">{tx("عروض مقبولة بانتظار التهيئة", "Accepted offers awaiting onboarding")}</h2>
        {(() => { const pend = accepted.filter((o) => !onb.some((b) => s(b.job_applicant) === s(o.job_applicant))); return pend.length === 0 ? src.empty("Job Offer", "Employee Onboarding") : (
          <ul className="divide-y">{pend.map((o) => <li key={s(o.name)} className="flex min-h-11 items-center justify-between gap-2" data-no-i18n><NativeLink dt="Job Offer" name={s(o.name)} module="02">{tx(arLabel(s(o.applicant_name) || s(o.name)),s(o.applicant_name) || s(o.name))}</NativeLink><Button variant="outline" type="button" className="dhr-chip min-h-9" onClick={() => { try { const r = handoffOffer(s(o.name)); toast.success(r.created ? tx("أُنشئت تهيئة مسودة", "Draft onboarding created") : tx("التهيئة موجودة مسبقًا", "Onboarding already exists")); } catch (e) { toast.error((e as Error).message); } }}>{tx("+ تهيئة", "+ Onboarding")}</Button></li>)}</ul>
        ); })()}
      </section>
    </DigitHrLayout>
  );
}
