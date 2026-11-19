import { createFileRoute, Link } from "@tanstack/react-router";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { enterHrNative } from "@/components/digithr/HrNav";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { placeDoc } from "@/plugins/digit_hr/v6/nav";
import { useSources, SourceNotice } from "@/components/digithr/workspaces/shared";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

export const Route = createFileRoute("/digit-hr/talent")({
  head: () => ({ meta: [
    { title: "DIGIT HR — Talent Board" },
    { name: "description", content: "Appraisals, training, succession and skills from native and DIGIT records." },
    { property: "og:title", content: "DIGIT HR — Talent Board" },
    { property: "og:description", content: "Track appraisals, learning paths, succession plans and skills gaps." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: TalentBoard,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;
const s = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => Number(v || 0);

function NativeLink({ dt, name, children }: { dt: string; name?: string; children: React.ReactNode }) {
  const p = placeDoc(dt, "02");
  if (!p) return <span>{children}</span>;
  return name
    ? <Link to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: p.app, doctype: p.slug, name }} onClick={() => enterHrNative(p.sub)} className="hover:underline">{children}</Link>
    : <Link to="/app/$app/$doctype" search={HR_DOC_SEARCH as never} params={{ app: p.app, doctype: p.slug }} onClick={() => enterHrNative(p.sub)} className="hover:underline">{children}</Link>;
}

const AR: Record<string, string> = { Draft: "مسودة", Open: "مفتوح", "In Progress": "قيد التنفيذ", Completed: "مكتمل", Cancelled: "ملغى", Scheduled: "مجدول", Active: "نشط" };

function TalentBoard() {
  const { tx } = useTx();
  const src = useSources(tx);
  useStoreVersion(); useSessionUser();
  const appraisals = src.rows("Appraisal").filter((r) => num(r.docstatus) !== 2);
  const cycles = src.rows("Appraisal Cycle").filter((r) => num(r.docstatus) !== 2);
  const events = src.rows("Training Event").filter((r) => num(r.docstatus) !== 2);
  const programs = src.rows("Training Program").filter((r) => num(r.docstatus) !== 2);
  const succession = src.rows("DIGIT Succession Plan");
  const paths = src.rows("DIGIT Learning Path");
  const skills = src.rows("DIGIT Skills Matrix");
  const reviews = src.rows("DIGIT Compensation Review");

  const label = (v: string) => tx(AR[v] ?? v, v);
  const kpi = (ar: string, en: string, v: number, dt?: string) => (
    <div className="dhr-card rounded-[18px] p-4"><div className="text-xs opacity-70">{tx(ar, en)}</div>
      <div className="mt-1 text-2xl font-semibold" data-no-i18n>{dt ? src.v(<NativeLink dt={dt}>{v}</NativeLink>, dt) : v}</div></div>
  );
  const card = (ar: string, en: string, body: React.ReactNode) => <section className="dhr-card rounded-[18px] p-4"><h2 className="mb-2 font-semibold">{tx(ar, en)}</h2>{body}</section>;
  const empty = (...dts: string[]) => src.empty(...dts);

  const openAppraisals = appraisals.filter((r) => s(r.status) !== "Completed");
  const upcomingEvents = events.filter((r) => s(r.event_status || r.status) !== "Completed");

  return (
    <DigitHrLayout title={tx("لوحة المواهب", "Talent board")} subtitle={tx("التقييمات والتدريب وخطط التعاقب والمهارات — كلها من السجلات المتاحة لك فقط.", "Appraisals, training, succession plans and skills — all from records visible to you only.")} crumbs={[{ label: tx("المواهب", "Talent") }]}>
      <SourceNotice src={src} />
      <p className="mb-4 text-xs opacity-70">{tx("احتساب الدرجات النهائية وإشعارات الدورات تتم على الخادم ولا تعمل في هذه المعاينة؛ اللوحة تعرض ما هو مسجّل فقط.", "Final score computation and cycle notifications run on the server and do not run in this preview; the board shows recorded values only.")}</p>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {kpi("تقييمات مفتوحة", "Open appraisals", openAppraisals.length, "Appraisal")}
        {kpi("دورات تقييم", "Appraisal cycles", cycles.length, "Appraisal Cycle")}
        {kpi("فعاليات تدريب قادمة", "Upcoming training", upcomingEvents.length, "Training Event")}
        {kpi("خطط تعاقب", "Succession plans", succession.length, "DIGIT Succession Plan")}
        {kpi("مسارات تعلم", "Learning paths", paths.length, "DIGIT Learning Path")}
        {kpi("مراجعات تعويضات", "Compensation reviews", reviews.length, "DIGIT Compensation Review")}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {card("التقييمات المفتوحة", "Open appraisals", openAppraisals.length ? (
          <ul className="divide-y text-sm">{openAppraisals.slice(0, 20).map((r) => (
            <li key={s(r.name)} className="flex min-h-9 items-center justify-between gap-2 py-1">
              <span data-no-i18n><NativeLink dt="Appraisal" name={s(r.name)}>{s(r.employee_name) || s(r.employee) || s(r.name)}</NativeLink></span>
              <span className="dhr-chip text-xs">{label(s(r.status || "Draft"))}</span>
            </li>))}</ul>) : empty("Appraisal"))}
        {card("فعاليات وبرامج التدريب", "Training events & programs", (upcomingEvents.length || programs.length) ? (
          <ul className="divide-y text-sm">
            {upcomingEvents.slice(0, 10).map((r) => (
              <li key={s(r.name)} className="flex min-h-9 items-center justify-between gap-2 py-1">
                <span data-no-i18n><NativeLink dt="Training Event" name={s(r.name)}>{s(r.event_name) || s(r.name)}</NativeLink></span>
                <span className="opacity-60" data-no-i18n>{s(r.start_date)}</span>
              </li>))}
            {programs.slice(0, 10).map((r) => (
              <li key={s(r.name)} className="flex min-h-9 items-center justify-between gap-2 py-1">
                <span data-no-i18n><NativeLink dt="Training Program" name={s(r.name)}>{s(r.program_name) || s(r.name)}</NativeLink></span>
                <span className="dhr-chip text-xs">{tx("برنامج", "Program")}</span>
              </li>))}
          </ul>) : empty("Training Event", "Training Program"))}
        {card("خطط التعاقب الوظيفي", "Succession plans", succession.length ? (
          <ul className="divide-y text-sm">{succession.slice(0, 20).map((r) => (
            <li key={s(r.name)} className="flex min-h-9 items-center justify-between gap-2 py-1">
              <span data-no-i18n><NativeLink dt="DIGIT Succession Plan" name={s(r.name)}>{s(r.position) || s(r.name)}</NativeLink></span>
              <span className="opacity-60" data-no-i18n>{s(r.successor_name) || s(r.successor)}</span>
            </li>))}</ul>) : empty("DIGIT Succession Plan"))}
        {card("مصفوفة المهارات ومسارات التعلم", "Skills matrix & learning paths", (skills.length || paths.length) ? (
          <ul className="divide-y text-sm">
            {skills.slice(0, 10).map((r) => (
              <li key={s(r.name)} className="flex min-h-9 items-center justify-between gap-2 py-1">
                <span data-no-i18n><NativeLink dt="DIGIT Skills Matrix" name={s(r.name)}>{s(r.employee_name) || s(r.employee) || s(r.name)}</NativeLink></span>
                <span className="dhr-chip text-xs">{tx("مهارات", "Skills")}</span>
              </li>))}
            {paths.slice(0, 10).map((r) => (
              <li key={s(r.name)} className="flex min-h-9 items-center justify-between gap-2 py-1">
                <span data-no-i18n><NativeLink dt="DIGIT Learning Path" name={s(r.name)}>{s(r.employee_name) || s(r.employee) || s(r.name)}</NativeLink></span>
                <span className="dhr-chip text-xs">{tx("مسار", "Path")}</span>
              </li>))}
          </ul>) : empty("DIGIT Skills Matrix", "DIGIT Learning Path"))}
      </div>
    </DigitHrLayout>
  );
}
