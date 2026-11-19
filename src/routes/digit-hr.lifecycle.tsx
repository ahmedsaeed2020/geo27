import { createFileRoute, Link } from "@tanstack/react-router";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { enterHrNative } from "@/components/digithr/HrNav";
import { useStoreVersion } from "@/lib/adapter";
import { scopedList } from "@/plugins/digit_hr/compat/scope";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { LIFECYCLE, placeDoc } from "@/plugins/digit_hr/v6/nav";
import { SECTIONS } from "@/plugins/digit_hr/v5/data";
import { t as tr } from "@/i18n";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

export const Route = createFileRoute("/digit-hr/lifecycle")({
  head: () => ({ meta: [
    { title: "DIGIT HR — Employee Lifecycle" },
    { name: "description", content: "Twelve-step employee journey from requisition to final settlement, linked to native HR registers." },
    { property: "og:title", content: "DIGIT HR — Employee Lifecycle" },
    { property: "og:description", content: "Cross-module employee journey over native HR documents." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Lifecycle,
});

const visible = (dt: string) => { try { return scopedList(dt).length; } catch { return null; } };

function Lifecycle() {
  const { tx } = useTx();
  useStoreVersion(); useSessionUser();
  return (
    <DigitHrLayout title={tx("رحلة الموظف", "Employee lifecycle")} subtitle={tx("اثنتا عشرة مرحلة من طلب التوظيف حتى التصفية النهائية، مرتبطة بالمستندات الأصلية. الأعداد هي السجلات المتاحة لك فقط، وليست مؤشرات أداء.", "Twelve stages from requisition to final settlement, linked to native documents. Counts are records visible to you, not performance metrics.")} crumbs={[{ label: tx("رحلة الموظف", "Employee lifecycle") }]}>
      <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {LIFECYCLE.map((s) => {
          const sec = SECTIONS.find((x) => x.id === s.section);
          return (
            <li key={s.step} data-stage={s.step} className="dhr-card rounded-[18px] p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="dhr-num inline-flex h-7 w-7 items-center justify-center rounded text-xs" data-no-i18n>{s.step}</span>
                <h2 className="font-semibold">{tx(s.ar, s.en)}</h2>
              </div>
              {sec && <Link to="/digit-hr/s/$section" params={{ section: sec.id }} className="mb-3 inline-block text-sm text-[var(--dhr-emerald)] underline-offset-2 hover:underline">{tx(`مساحة القسم: ${sec.ar}`, `Section workspace: ${sec.en}`)}</Link>}
              <ul className="space-y-1">
                {s.docs.map((d) => {
                  const p = placeDoc(d, s.section.slice(0, 2));
                  if (!p) return <li key={d} data-gap={d} className="flex min-h-11 items-center justify-between rounded-md px-2 text-sm opacity-70"><span>{tr(d)}</span><span className="dhr-chip text-xs">{tx("غير متوفر في المصدر", "Not in source")}</span></li>;
                  const n = visible(d);
                  return (
                    <li key={d}>
                      <Link to="/app/$app/$doctype" search={HR_DOC_SEARCH as never} params={{ app: p.app, doctype: p.slug }} onClick={() => enterHrNative(p.sub)} className="flex min-h-11 items-center justify-between rounded-md px-2 text-sm hover:bg-[var(--dhr-mint-50, var(--em-50))]">
                        <span>{tr(d)}</span>
                        <span className="text-xs tabular-nums" data-no-i18n>{n === null ? "—" : n}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </DigitHrLayout>
  );
}
