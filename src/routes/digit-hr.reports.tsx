import { createFileRoute, Link } from "@tanstack/react-router";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { MODULES, REPORTS, EXTENSIONS } from "@/plugins/digit_hr/v5/data";
import { t as tr } from "@/i18n";
import { ReportModeBadge } from "@/components/digithr/ReportModeBadge";
import { arV5 } from "@/plugins/digit_hr/v5/ar";

export const Route = createFileRoute("/digit-hr/reports")({
  head: () => ({ meta: [
    { title: "DIGIT HR — Report Center" },
    { name: "description", content: "One HR report center: 25 native DIGIT HR report definitions with honest engine status and extension candidates." },
    { property: "og:title", content: "DIGIT HR — Report Center" },
    { property: "og:description", content: "Native HR report registry with server-dependent status." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ReportCenter,
});

function ReportCenter() {
  const { tx } = useTx();
  const mod = (id: string) => { const m = MODULES.find((x) => x.id === id); return m ? tx(m.ar, m.en) : id; };
  return (
    <DigitHrLayout title={tx("مركز التقارير", "Report Center")} subtitle={tx("سجل واحد للتقارير الأصلية — التقارير التي تحتاج الخادم الأصلي لا تُعرض لها أرقام.", "One registry of native reports — server-dependent reports never show totals here.")} crumbs={[{ label: tx("مركز التقارير", "Report Center") }]}>
      <section className="dhr-card mb-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--dhr-canvas)]"><tr><th className="px-3 py-2 text-start">ID</th><th className="px-3 py-2 text-start">{tx("التقرير", "Report")}</th><th className="px-3 py-2 text-start">{tx("المستند", "Document")}</th><th className="px-3 py-2 text-start">{tx("الوحدات", "Modules")}</th><th className="px-3 py-2 text-start">{tx("الحالة", "Status")}</th></tr></thead>
          <tbody>{REPORTS.map((r) => (
            <tr key={r.id} id={r.id} className="border-t target:bg-[color-mix(in_oklab,var(--dhr-mint)_15%,transparent)]">
              <td className="px-3 py-2 font-mono text-xs" data-no-i18n>{r.id}</td>
              <td className="px-3 py-2"><Link to="/report/$name" params={{ name: r.report }} className="font-medium hover:underline">{tr(r.report)}</Link></td>
              <td className="px-3 py-2">{tr(r.ref)}</td>
              <td className="px-3 py-2 text-xs">{r.modules.map(mod).join(" · ")}</td>
              <td className="px-3 py-2"><ReportModeBadge report={r.report} refDoctype={r.ref} /></td>
            </tr>))}</tbody>
        </table>
      </section>
      <h2 className="mb-3 text-base font-semibold">{tx("امتدادات مقترحة (غير معتمدة)", "Proposed extensions (not approved)")}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EXTENSIONS.map((e) => (
          <div key={e.candidate} className="dhr-card p-4 text-sm">
            <div className="font-semibold" data-no-i18n>{tx(arV5(e.candidate), e.candidate)}</div>
            <p className="mt-1 text-muted-foreground" data-no-i18n>{tx(arV5(e.purpose), e.purpose)}</p>
            <span className="dhr-badge mt-2" data-tone="neutral">{tx("بانتظار قرار المالك", "Awaiting owner decision")}</span>
          </div>
        ))}
      </div>
    </DigitHrLayout>
  );
}
