import { createFileRoute, Link } from "@tanstack/react-router";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { enterHrNative } from "@/components/digithr/HrNav";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { placeDoc } from "@/plugins/digit_hr/v6/nav";
import { useSources, SourceNotice, DateRange } from "@/components/digithr/workspaces/shared";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

export const Route = createFileRoute("/digit-hr/compliance")({
  head: () => ({ meta: [
    { title: "DIGIT HR — Saudi Compliance Board" },
    { name: "description", content: "Saudi rule sets, GOSI assessments, WPS submissions and Saudization counts from recorded data." },
    { property: "og:title", content: "DIGIT HR — Saudi Compliance Board" },
    { property: "og:description", content: "Track Saudi compliance rules, GOSI, WPS and Saudization from recorded data." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ComplianceBoard,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;
const s = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => Number(v || 0);
const money = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);

function NativeLink({ dt, name, children }: { dt: string; name?: string; children: React.ReactNode }) {
  const p = placeDoc(dt, "04");
  if (!p) return <span>{children}</span>;
  return name
    ? <Link to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: p.app, doctype: p.slug, name }} onClick={() => enterHrNative(p.sub)} className="hover:underline">{children}</Link>
    : <Link to="/app/$app/$doctype" search={HR_DOC_SEARCH as never} params={{ app: p.app, doctype: p.slug }} onClick={() => enterHrNative(p.sub)} className="hover:underline">{children}</Link>;
}

const AR: Record<string, string> = {
  Draft: "مسودة", Approved: "معتمدة", Superseded: "ملغاة", Prepared: "مُجهّز", "Submitted Externally": "مُرسل خارجيًا", Accepted: "مقبول", Rejected: "مرفوض",
  GOSI: "التأمينات الاجتماعية", WPS: "حماية الأجور", "End of Service": "نهاية الخدمة", Saudization: "السعودة", Other: "أخرى",
};

function ComplianceBoard() {
  const { tx } = useTx();
  const src = useSources(tx);
  useStoreVersion(); useSessionUser();
  const t = today();
  const rules = src.rows("DIGIT Saudi Rule Set").filter((r) => num(r.docstatus) !== 2);
  const gosi = src.rows("DIGIT GOSI Assessment").filter((r) => num(r.docstatus) !== 2);
  const wps = src.rows("DIGIT WPS Submission").filter((r) => num(r.docstatus) !== 2);
  const emps = src.rows("Employee").filter((e) => s(e.status || "Active") === "Active");
  const saudi = emps.filter((e) => /saudi|سعودي/i.test(s(e.nationality)));

  const activeRules = rules.filter((r) => s(r.rule_status) === "Approved" && s(r.effective_from) <= t && (!s(r.effective_to) || s(r.effective_to) >= t));
  const expiring = activeRules.filter((r) => s(r.effective_to) && s(r.effective_to) <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10));
  const wpsOpen = wps.filter((w) => !["Accepted"].includes(s(w.submission_status)));
  const gosiTotal = gosi.reduce((a, g) => a + num(g.employee_share) + num(g.employer_share), 0);
  const pct = emps.length ? Math.round((saudi.length / emps.length) * 100) : 0;

  const label = (v: string) => tx(AR[v] ?? v, v);
  const kpi = (ar: string, en: string, v: React.ReactNode, dt?: string) => (
    <div className="dhr-card rounded-[18px] p-4"><div className="text-xs opacity-70">{tx(ar, en)}</div>
      <div className="mt-1 text-2xl font-semibold" data-no-i18n>{dt ? src.v(<NativeLink dt={dt}>{v}</NativeLink>, dt) : v}</div></div>
  );
  const card = (ar: string, en: string, body: React.ReactNode) => <section className="dhr-card rounded-[18px] p-4"><h2 className="mb-2 font-semibold">{tx(ar, en)}</h2>{body}</section>;
  const empty = (...dts: string[]) => src.empty(...dts);

  return (
    <DigitHrLayout title={tx("لوحة الامتثال السعودي", "Saudi compliance board")} subtitle={tx("قواعد الامتثال المعتمدة، تقييمات التأمينات، ملفات حماية الأجور ونسبة السعودة — كلها من السجلات المسجلة المتاحة لك.", "Approved compliance rules, GOSI assessments, WPS files and the Saudization ratio — all from records visible to you.")} crumbs={[{ label: tx("الامتثال", "Compliance") }]}>
      <SourceNotice src={src} />
      <p className="mb-4 text-xs opacity-70">{tx("هذه اللوحة تعرض المبالغ والقواعد المسجلة فقط؛ لا تُحتسب نسب التأمينات أو حماية الأجور أو نهاية الخدمة هنا، والتقديم الفعلي للجهات الحكومية يحتاج خادمًا حقيقيًا.", "This board shows recorded amounts and rules only; GOSI/WPS/end-of-service rates are not computed here, and actual government submission needs a real server.")}</p>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {kpi("قواعد سارية", "Active rules", activeRules.length, "DIGIT Saudi Rule Set")}
        {kpi("تنتهي خلال 30 يومًا", "Expiring in 30 days", expiring.length, "DIGIT Saudi Rule Set")}
        {kpi("تقييمات التأمينات", "GOSI assessments", gosi.length, "DIGIT GOSI Assessment")}
        {kpi("إجمالي حصص التأمينات", "Total GOSI shares", money(gosiTotal), "DIGIT GOSI Assessment")}
        {kpi("ملفات حماية أجور مفتوحة", "Open WPS files", wpsOpen.length, "DIGIT WPS Submission")}
        {kpi("نسبة السعودة", "Saudization", src.v(`${pct}%`, "Employee"))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {card("قواعد الامتثال", "Compliance rules", rules.length ? (
          <ul className="divide-y text-sm">{rules.sort((a, b) => s(b.effective_from).localeCompare(s(a.effective_from))).slice(0, 20).map((r) => (
            <li key={s(r.name)} className="flex min-h-9 flex-wrap items-center justify-between gap-2 py-1">
              <span><NativeLink dt="DIGIT Saudi Rule Set" name={s(r.name)}>{tx(AR[s(r.rule_title)] ?? s(r.rule_title), s(r.rule_title))}</NativeLink> <span className="opacity-60">{label(s(r.rule_area || "Other"))}</span></span>
              <span className="dhr-chip text-xs">{label(s(r.rule_status || "Draft"))} {s(r.effective_to) ? <DateRange from={r.effective_from} to={r.effective_to} /> : <span data-no-i18n>{s(r.effective_from)}</span>}</span>
            </li>))}</ul>) : empty("DIGIT Saudi Rule Set"))}
        {card("ملفات حماية الأجور", "WPS submissions", wps.length ? (
          <ul className="divide-y text-sm">{wps.sort((a, b) => s(b.period_month).localeCompare(s(a.period_month))).slice(0, 20).map((w) => (
            <li key={s(w.name)} className="flex min-h-9 flex-wrap items-center justify-between gap-2 py-1">
              <span data-no-i18n><NativeLink dt="DIGIT WPS Submission" name={s(w.name)}>{s(w.name)}</NativeLink> <span className="opacity-60">{s(w.period_month)}</span></span>
              <span className="dhr-chip text-xs">{label(s(w.submission_status || "Draft"))} · <span data-no-i18n>{money(num(w.total_amount))}</span></span>
            </li>))}</ul>) : empty("DIGIT WPS Submission"))}
        {card("تقييمات التأمينات الاجتماعية", "GOSI assessments", gosi.length ? (
          <ul className="divide-y text-sm">{gosi.sort((a, b) => s(b.period_month).localeCompare(s(a.period_month))).slice(0, 20).map((g) => (
            <li key={s(g.name)} className="flex min-h-9 flex-wrap items-center justify-between gap-2 py-1">
              <span data-no-i18n><NativeLink dt="DIGIT GOSI Assessment" name={s(g.name)}>{s(g.employee_name) || s(g.employee)}</NativeLink> <span className="opacity-60">{s(g.period_month)}</span></span>
              <span className="text-xs opacity-70" data-no-i18n>{tx("موظف", "EE")} {money(num(g.employee_share))} · {tx("منشأة", "ER")} {money(num(g.employer_share))}</span>
            </li>))}</ul>) : empty("DIGIT GOSI Assessment"))}
        {card("السعودة", "Saudization", emps.length ? (
          <div className="text-sm">
            <p className="mb-2">{tx("الموظفون السعوديون من إجمالي الموظفين النشطين، حسب الجنسية المسجلة في ملف الموظف.", "Saudi employees out of all active employees, by the nationality recorded on the employee record.")}</p>
            <div className="dhr-display text-3xl font-semibold" data-no-i18n>{saudi.length} / {emps.length} · {pct}%</div>
          </div>) : empty("Employee"))}
      </div>
    </DigitHrLayout>
  );
}
