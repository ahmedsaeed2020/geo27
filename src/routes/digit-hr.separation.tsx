import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { PipelineBoard, NativeLink, s, type Stage } from "@/components/digithr/PipelineBoard";
import { startSeparationStep, existingStep, type SepStep } from "@/plugins/digit_hr/compat/separationHandoff";
import { toast } from "sonner";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { Button } from '@/components/ui/button';
import { clearanceRows,startClearanceTask } from '@/plugins/digit_hr/clearance';
import { useScopeMetas } from '@/plugins/digit_hr/compat/scope';
import { arLabel, useSources, SourceNotice, live } from '@/components/digithr/workspaces/shared';
import { t } from '@/i18n';
import { enterHrNative } from '@/components/digithr/HrNav';
import { placeDoc } from '@/plugins/digit_hr/v6/nav';

export const Route = createFileRoute("/digit-hr/separation")({
  head: () => ({ meta: [
    { title: "DIGIT HR — Separation & Final Settlement" },
    { name: "description", content: "Separation, exit interview, asset clearance, gratuity review and full-and-final statements from native records." },
    { property: "og:title", content: "DIGIT HR — Separation & Final Settlement" },
    { property: "og:description", content: "Offboarding pathway from resignation to settlement evidence." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: SeparationBoard,
});

const STAGES: Stage[] = [
  { key: "sep", ar: "إنهاء الخدمة", en: "Separation", dt: "Employee Separation", statusField: "boarding_status", label: (r) => s(r.employee_name) },
  { key: "exit", ar: "مقابلة الخروج", en: "Exit interview", dt: "Exit Interview", statusField: "status", label: (r) => s(r.employee_name) },
  { key: "asset", ar: "إخلاء الأصول", en: "Asset clearance", dt: "Asset Movement", statusField: "purpose", label: (r) => s(r.transaction_date) },
  { key: "grat", ar: "مراجعة مكافأة نهاية الخدمة", en: "Gratuity review", dt: "Gratuity", statusField: "status", label: (r) => s(r.employee_name),
    note: { ar: "لا يُحسب مبلغ المكافأة هنا — يحتاج قاعدة نظامية معتمدة وخادمًا.", en: "No gratuity amount is computed here — needs an approved statutory rule and a server." } },
  { key: "fnf", ar: "المخالصة النهائية", en: "Full & final statement", dt: "Full and Final Statement", statusField: "status", label: (r) => s(r.employee_name),
    note: { ar: "حالة الدفع منفصلة؛ الترحيل المالي على الخادم.", en: "Payment status is separate; financial posting runs on the server." } },
];

function SeparationBoard() {
  const { tx } = useTx();
  const navigate = useNavigate();
  useStoreVersion(); useSessionUser();
  useScopeMetas(['Task','Employee Separation']);
  const src = useSources(tx);
  const seps = src.rows("Employee Separation").filter(live);
  const fnf = src.rows("Full and Final Statement").filter(live);
  const open = seps.filter((r) => s(r.boarding_status) !== "Completed");
  const noFnf = src.ready("Employee Separation", "Full and Final Statement") ? seps.filter((r) => !fnf.some((f) => s(f.employee) === s(r.employee))) : [];
  const unpaid = fnf.filter((f) => s(f.status) !== "Paid");
  return (
    <DigitHrLayout title={tx("إنهاء الخدمة والمخالصة", "Separation & final settlement")} subtitle={tx("المسار من طلب إنهاء الخدمة حتى المخالصة النهائية من السجلات الأصلية. اضغط أي رقم لرؤية السجلات نفسها.", "Pathway from separation request to final settlement from native records. Click any number to see the exact records.")} crumbs={[{ label: tx("إنهاء الخدمة", "Separation") }]}>
      <SourceNotice src={src} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["إنهاء خدمة مفتوح", "Open separations", open.length], ["بلا مخالصة نهائية", "Without final statement", noFnf.length], ["مخالصات غير مدفوعة", "Unpaid statements", unpaid.length], ["مخالصات إجمالًا", "Statements total", fnf.length]].map(([ar, en, v], i) => (
          <div key={String(en)} className="dhr-card rounded-[18px] p-4"><div className="text-xs opacity-70">{tx(String(ar), String(en))}</div><div className="mt-1 text-2xl font-semibold" data-no-i18n>{src.v(v, ...([["Employee Separation"], ["Employee Separation", "Full and Final Statement"], ["Full and Final Statement"], ["Full and Final Statement"]][i] ?? []))}</div></div>
        ))}
      </div>
      <PipelineBoard stages={STAGES} module="01" />
      <section className="mb-4 border-b pb-4" data-clearance>
        <h2 className="mb-2 font-semibold">{tx('تتبّع إخلاء الطرف','Clearance tracking')}</h2>
        {open.map(sep=><div key={s(sep.name)} className="border-b py-3"><NativeLink dt="Employee Separation" name={s(sep.name)} module="01">{tx(arLabel(s(sep.employee_name)),s(sep.employee_name)) || s(sep.name)}</NativeLink>
          {clearanceRows(sep).length ? <ul className="divide-y">{clearanceRows(sep).map(row=><li key={row.index} className="flex flex-wrap items-center justify-between gap-2 py-2"><span data-no-i18n>{row.activity} · {t(row.responsible)}</span><span className="flex items-center gap-2"><span>{t(row.status)}</span>{row.task ? <NativeLink dt="Task" name={row.task} module="01">{tx('فتح المهمة','Open task')}</NativeLink> : row.status==='Pending' ? <Button variant="outline" data-clearance-create={`${sep.name}:${row.index}`} onClick={()=>{try{startClearanceTask(s(sep.name),row.index);toast.success(tx('أُنشئت مهمة مفتوحة مرتبطة','Linked open task created'));}catch(e){toast.error((e as Error).message);}}}>{tx('+ مهمة إخلاء','+ Clearance task')}</Button> : null}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">{tx('لم تُحدد أنشطة إخلاء الطرف. أضفها في سجل إنهاء الخدمة الأصلي.','No clearance activities defined. Add them in the original separation record.')}</p>}
        </div>)}
      </section>
      <section className="dhr-card rounded-[18px] p-4" data-separation-steps>
        <h2 className="mb-2 font-semibold">{tx("مقابلة الخروج ومراجعة المخالصة", "Exit interview & settlement review")}</h2>
        <p className="mb-2 text-xs opacity-70">{tx("تُنشأ مسودات مرتبطة بالموظف؛ المبالغ والدفع والترحيل على الخادم.", "Creates drafts linked to the employee; amounts, payment and posting run on the server.")}</p>
        {(() => {
          const rows = open.map((r) => ({ r, ei: existingStep("Exit Interview", s(r.employee)), ff: existingStep("Full and Final Statement", s(r.employee)) }));
          const go = (name: string, dt: SepStep) => { try {
            const route = placeDoc(dt, '01');
            if (!route) throw new Error(tx('السجل الأصلي غير متاح.', 'Original record is unavailable.'));
            const res = startSeparationStep(name, dt);
            enterHrNative(route.sub);
            void navigate({ to: '/app/$app/$doctype/$name', params: { app: route.app, doctype: route.slug, name: res.doc.name } });
            toast.success(res.created ? tx("أُنشئت مسودة", "Draft created") : tx("السجل موجود مسبقًا", "Record already exists"));
          } catch (e) { toast.error((e as Error).message); } };
          return rows.length === 0 ? <p className="text-sm opacity-70">{tx("لا توجد سجلات.", "No records.")}</p> : (
            <ul className="divide-y">{rows.map(({ r, ei, ff }) => (
              <li key={s(r.name)} data-separation-step={s(r.name)} className="flex min-h-11 flex-wrap items-center justify-between gap-2">
                <span data-no-i18n><NativeLink dt="Employee Separation" name={s(r.name)} module="01">{tx(arLabel(s(r.employee_name)),s(r.employee_name)) || s(r.name)}</NativeLink></span>
                <span className="flex flex-wrap gap-2">
                  {ei ? <NativeLink dt="Exit Interview" name={ei.name} module="01">{tx('مراجعة مقابلة الخروج', 'Review exit interview')}</NativeLink> : <Button variant="outline" type="button" data-separation-create="Exit Interview" onClick={() => go(s(r.name), "Exit Interview")}>{tx("+ مقابلة خروج", "+ Exit interview")}</Button>}
                  {ff ? <NativeLink dt="Full and Final Statement" name={ff.name} module="01">{tx('مراجعة المخالصة', 'Review final statement')}</NativeLink> : <Button variant="outline" type="button" data-separation-create="Full and Final Statement" onClick={() => go(s(r.name), "Full and Final Statement")}>{tx("+ مخالصة نهائية", "+ Final statement")}</Button>}
                </span>
              </li>))}</ul>
          );
        })()}
      </section>
    </DigitHrLayout>
  );
}
