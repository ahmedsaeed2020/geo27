import { arLabel } from "@/components/digithr/workspaces/shared";
import { PayrollWorkspace } from "@/components/digithr/workspaces/PayrollWorkspace";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { enterHrNative } from "@/components/digithr/HrNav";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { placeDoc } from "@/plugins/digit_hr/v6/nav";
import { useSources, SourceNotice, DateRange } from "@/components/digithr/workspaces/shared";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

export const Route = createFileRoute("/digit-hr/payroll")({
  head: () => ({ meta: [
    { title: "DIGIT HR — Payroll Cycle Board" },
    { name: "description", content: "Payroll runs with preflight checks, salary slips, variances and bank-file status from native records." },
    { property: "og:title", content: "DIGIT HR — Payroll Cycle Board" },
    { property: "og:description", content: "Track each payroll run from preflight to bank file." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: PayrollBoard,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;
const s = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => Number(v || 0);
const money = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });

function NativeLink({ dt, name, children }: { dt: string; name?: string; children: React.ReactNode }) {
  const p = placeDoc(dt, "04");
  if (!p) return <span>{children}</span>;
  return name
    ? <Link to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: p.app, doctype: p.slug, name }} onClick={() => enterHrNative(p.sub)} className="hover:underline">{children}</Link>
    : <Link to="/app/$app/$doctype" search={HR_DOC_SEARCH as never} params={{ app: p.app, doctype: p.slug }} onClick={() => enterHrNative(p.sub)} className="hover:underline">{children}</Link>;
}

const AR: Record<string, string> = { Open: "مفتوح", Passed: "ناجح", Blocked: "موقوف", Draft: "مسودة", Prepared: "مُجهّز", "Submitted Externally": "مُرسل خارجيًا", Accepted: "مقبول", Rejected: "مرفوض", Explained: "مُبرّر", Escalated: "مُصعّد" };

function PayrollBoard() {
  const { tx } = useTx();
  const src = useSources(tx);
  useStoreVersion(); useSessionUser();
  const runs = src.rows("Payroll Entry").filter((r) => num(r.docstatus) !== 2).sort((a, b) => s(b.posting_date || b.start_date).localeCompare(s(a.posting_date || a.start_date)));
  const slips = src.rows("Salary Slip").filter((r) => num(r.docstatus) !== 2);
  const pre = src.rows("DIGIT Payroll Preflight");
  const vars = src.rows("DIGIT Payroll Variance");
  const wps = src.rows("DIGIT WPS Submission").filter((r) => num(r.docstatus) !== 2);
  const emps = src.rows("Employee").filter((e) => s(e.status || "Active") === "Active");
  const ssa = src.rows("Salary Structure Assignment").filter((r) => num(r.docstatus) === 1);
  const withSsa = new Set(ssa.map((r) => s(r.employee)));
  const noBank = emps.filter((e) => !s(e.bank_ac_no) && !s(e.iban));
  const noSsa = src.ready("Employee", "Salary Structure Assignment") ? emps.filter((e) => !withSsa.has(s(e.name))) : [];

  const label = (v: string) => tx(AR[v] ?? v, v);
  const kpi = (ar: string, en: string, v: number, dt?: string) => (
    <div className="dhr-card rounded-[18px] p-4"><div className="text-xs opacity-70">{tx(ar, en)}</div>
      <div className="mt-1 text-2xl font-semibold" data-no-i18n>{dt ? src.v(<NativeLink dt={dt}>{v}</NativeLink>, dt) : v}</div></div>
  );
  const card = (ar: string, en: string, body: React.ReactNode) => <section className="dhr-card rounded-[18px] p-4"><h2 className="mb-2 font-semibold">{tx(ar, en)}</h2>{body}</section>;
  const empty = (...dts: string[]) => src.empty(...dts);
  const step = (ar: string, en: string, body: React.ReactNode) => <div className="rounded-md border p-2"><div className="text-[11px] opacity-70">{tx(ar, en)}</div><div className="text-sm font-medium">{body}</div></div>;

  return (
    <DigitHrLayout title={tx("لوحة دورة الرواتب", "Payroll cycle board")} subtitle={tx("كل مسيّر رواتب من الفحص المسبق إلى قسائم الرواتب والفروقات وملف حماية الأجور. الأعداد هي السجلات المتاحة لك فقط.", "Each payroll run from preflight through slips, variances and the WPS bank file. Counts are records visible to you only.")} crumbs={[{ label: tx("الرواتب", "Payroll") }]}>
      <SourceNotice src={src} />
      <p className="mb-4 text-xs opacity-70">{tx("احتساب الرواتب وإنشاء القسائم وإرسال ملف البنك تتم على الخادم ولا تعمل في هذه المعاينة؛ اللوحة تعرض ما هو مسجّل فقط.", "Salary computation, slip generation and bank submission run on the server and do not run in this preview; the board shows recorded values only.")}</p>
      <PayrollWorkspace />
      <div className="grid gap-4">
        {card("مسيّرات الرواتب", "Payroll runs", runs.length ? (
          <ul className="space-y-3">{runs.map((r) => {
            const n = s(r.name);
            const rs = slips.filter((x) => s(x.payroll_entry) === n);
            const p = pre.filter((x) => s(x.payroll_entry) === n).sort((a, b) => s(b.checked_on).localeCompare(s(a.checked_on)))[0];
            const v = vars.filter((x) => s(x.payroll_entry) === n);
            const w = wps.find((x) => s(x.payroll_entry) === n);
            const net = rs.reduce((a, x) => a + num(x.net_pay), 0);
            return (
              <li key={n} className="rounded-md border p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium" data-no-i18n><NativeLink dt="Payroll Entry" name={n}>{n}</NativeLink> <DateRange className="opacity-60" from={r.start_date} to={r.end_date} /></span>
                  <span className="dhr-chip text-xs">{num(r.docstatus) === 1 ? tx("معتمد", "Submitted") : tx("مسودة", "Draft")}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {step("١. الفحص المسبق", "1. Preflight", p ? <NativeLink dt="DIGIT Payroll Preflight" name={s(p.name)}>{label(s(p.preflight_status || "Open"))}</NativeLink> : <span className="opacity-60">{tx("لم يُنفّذ", "Not run")}</span>)}
                  {step("٢. القسائم", "2. Slips", <span data-no-i18n>{rs.length} · {money(net)}</span>)}
                  {step("٣. الفروقات", "3. Variances", <span>{tx("مفتوحة", "Open")} <span data-no-i18n>{v.filter((x) => s(x.variance_status || "Open") !== "Explained").length} / {v.length}</span></span>)}
                  {step("٤. حماية الأجور", "4. WPS file", w ? <NativeLink dt="DIGIT WPS Submission" name={s(w.name)}>{label(s(w.submission_status || "Draft"))}</NativeLink> : <span className="opacity-60">{tx("غير مُجهّز", "Not prepared")}</span>)}
                </div>
              </li>
            );
          })}</ul>) : empty("Payroll Entry"))}
        <div className="grid gap-4 lg:grid-cols-2">
          {card("موظفون بدون حساب بنكي", "Employees without bank details", noBank.length ? <ul className="divide-y text-sm">{noBank.slice(0, 20).map((e) => <li key={s(e.name)} className="min-h-9 py-1" data-no-i18n><NativeLink dt="Employee" name={s(e.name)}>{tx(arLabel(s(e.employee_name) || s(e.name)),s(e.employee_name) || s(e.name))}</NativeLink></li>)}</ul> : empty("Employee"))}
          {card("موظفون بدون هيكل راتب معتمد", "Employees without a salary structure", noSsa.length ? <ul className="divide-y text-sm">{noSsa.slice(0, 20).map((e) => <li key={s(e.name)} className="min-h-9 py-1" data-no-i18n><NativeLink dt="Employee" name={s(e.name)}>{tx(arLabel(s(e.employee_name) || s(e.name)),s(e.employee_name) || s(e.name))}</NativeLink></li>)}</ul> : empty("Employee", "Salary Structure Assignment"))}
        </div>
      </div>
    </DigitHrLayout>
  );
}
