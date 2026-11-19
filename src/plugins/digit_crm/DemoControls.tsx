import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Database, RotateCcw, LogOut, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { activeDemoProfile } from "./dataContext";
import { useSessionUser } from "@/lib/session";
import { useSettings } from "@/lib/userSettings";
import { useLang } from "@/i18n";
import { useActiveExperience } from "../theme";
import { DEMO_UNAVAILABLE } from "./enterpriseDemo";
import { demoPartitionAvailable } from "./dataContext";
import { activateEnterpriseDemo, demoAsOf, demoCounts, demoVersion, DEMO_VERSION, leaveEnterpriseDemo, reseedEnterpriseDemo } from "./enterpriseDemo";
import { crmDataChoice, rememberOwnRecords } from "./demoContext";
import { SamplePreview } from "./SamplePreview";
import { DateInput } from "@/components/form/DateInput";

/** Explicit DEMO label on every CRM screen while the isolated demo is selected; otherwise, when the CRM holds no leads or
 *  deals and the user has not chosen their own records, a one-time offer to load the demo. Never seeds by itself. */
export function DemoBanner() {
  const lang = useLang(), ar = lang === "ar", user = useSessionUser(), settings = useSettings(); useStoreVersion();
  const experience = useActiveExperience(), path = useRouterState({ select: (s) => s.location.pathname });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (activeDemoProfile()) return <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted px-4 py-2 text-xs" data-no-i18n data-demo-banner>
    <span className="flex flex-wrap items-center gap-2"><span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary-foreground" data-demo-label>{ar ? "تجريبي" : "DEMO"}</span>
      <span>{ar ? "بيئة تجريبية معزولة · بيانات محاكاة · لا إرسال فعلي أو ترحيل مالي حقيقي" : "Isolated demo · Synthetic records · No real messages or financial postings"}</span>
      <span className="text-muted-foreground">{ar ? "محفوظة في هذا المتصفح على هذا الجهاز فقط، وتبقى مختارة حتى تعود إلى سجلاتك." : "Saved in this browser on this device only; stays selected until you return to your records."}</span></span>
    <Link to="/digit-crm/demo" className="text-primary underline">{ar ? "إدارة البيانات التجريبية" : "Manage demo dataset"}</Link>
  </div>;
  // Final Core: no isolated demo partition (CRM-G1), so no offer to load one; CRM works on the shared records
  if (!demoPartitionAvailable) return null;
  const empty = !adapter.list("CRM Lead").length && !adapter.list("CRM Deal").length;
  if (experience !== "digit_crm" || path === "/digit-crm/demo" || !empty || crmDataChoice(user, settings)?.choice.context === "records") return null;
  const load = () => { setError(""); setBusy(true); window.setTimeout(() => { try { activateEnterpriseDemo(); window.location.assign(window.location.pathname + window.location.search); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); } }, 50); };
  return <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted px-4 py-3 text-sm" data-no-i18n data-demo-offer aria-busy={busy}>
    <Database className="h-5 w-5 shrink-0 text-primary" aria-hidden />
    <p className="min-w-0 flex-1">{ar
      ? "لا توجد عملاء محتملون أو صفقات في CRM بعد. حمّل بيانات العرض التجريبية لاستكشاف التطبيق بسجل مبيعات سعودي تجريبي لمدة 18 شهرًا — منفصلة عن سجلاتك ومحفوظة في هذا المتصفح فقط."
      : "Your CRM has no leads or deals yet. Load the demo dataset to explore DIGIT CRM with 18 months of synthetic Saudi sales history — kept separate from your records and saved in this browser only."}</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={busy} onClick={load} data-demo-offer-load><Database />{busy ? (ar ? "جاري التحضير…" : "Preparing…") : (ar ? "تحميل بيانات العرض" : "Load demo dataset")}</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => rememberOwnRecords(user)} data-demo-offer-dismiss>{ar ? "البدء بسجلاتي" : "Start with my own records"}</Button>
    </div>
    {error && <p role="alert" className="w-full text-xs text-destructive">{error}</p>}
  </div>;
}
export function DemoControls() {
  useStoreVersion();
  const lang = useLang(), ar = lang === "ar", active = Boolean(activeDemoProfile());
  const [asOf, setDate] = useState(demoAsOf() || new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const run = (fn: () => unknown) => { setError(""); setBusy(true); window.setTimeout(() => { try { fn(); window.location.assign("/digit-crm/demo"); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); } }, 50); };
  const exportManifest = () => { const blob = new Blob([JSON.stringify({ fixture: activeDemoProfile(), asOf: demoAsOf(), counts: demoCounts(), production: false }, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "digit-crm-demo-manifest.json"; a.click(); URL.revokeObjectURL(a.href); };
  if (!demoPartitionAvailable) return <section className="space-y-2 border-t border-border pt-4" data-demo-controls data-demo-unavailable>
    <h2 className="text-base font-semibold">{ar ? "بيانات CRM التجريبية" : "CRM enterprise demo dataset"}</h2>
    <p className="text-sm text-muted-foreground" data-no-i18n>{ar ? "لا تتوفر في النواة النهائية بيئة تجريبية معزولة قابلة للتعديل: يعمل ديجيت CRM على السجلات المشتركة نفسها التي تستخدمها بقية التطبيقات، مع تطبيق صلاحيات المستخدم. يمكنك تصفّح بيانات العرض الكاملة للقراءة فقط أدناه." : DEMO_UNAVAILABLE + " Every app reads the same permission-scoped records; the full sample dataset can be browsed read-only below."}</p>
    <p className="text-xs text-muted-foreground" data-no-i18n>{ar ? "سجلات CRM الحالية:" : "Current CRM records:"} <span data-no-i18n>{adapter.list("CRM Lead").length}</span> {ar ? "عميل محتمل ·" : "leads ·"} <span data-no-i18n>{adapter.list("CRM Deal").length}</span> {ar ? "صفقة" : "deals"}</p>
    <SamplePreview />
  </section>;
  return <section className="space-y-4 border-t border-border pt-4" data-no-i18n data-demo-controls aria-busy={busy}>
    <h2 className="text-base font-semibold">{ar ? "بيانات CRM التجريبية" : "CRM enterprise demo dataset"}</h2>
    <p className="text-sm text-muted-foreground">{ar ? "عرض سعودي تجريبي لمدة 18 شهرًا، منفصل عن سجلاتك. الرسائل والعمولات محاكاة وليست عمليات فعلية." : "18 months of synthetic Saudi business history, separate from your records. Messages and commissions are illustrative, not real operations."}</p>
    <p className="text-xs text-muted-foreground" data-demo-persistence>{ar ? "يُحفظ اختيارك في هذا المتصفح لهذا المستخدم، ويبقى بعد التحديث أو إعادة فتح المتصفح حتى تختار «العودة إلى سجلاتي». لا تُشارك هذه البيانات مع أجهزة أو مواقع أخرى، ولا تُستورد إلى أي شركة فعلية." : "Your choice is saved in this browser for this user and stays selected after refresh or a browser restart until you choose “Return to my records”. The records are not shared with other devices or sites and are never imported into a real company."}</p>
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">{ar ? "تاريخ العرض" : "As-of date"}<DateInput className="input" value={asOf} onChange={e => setDate(e.target.value)} disabled={busy} /></label>
      {!active ? <Button disabled={busy || !asOf} onClick={() => run(() => activateEnterpriseDemo(asOf))}><Database />{busy ? (ar ? "جاري التحضير…" : "Preparing…") : (ar ? "تفعيل العرض التجريبي" : "Activate demo dataset")}</Button> : <>
        <Button variant="outline" disabled={busy} onClick={() => { if (window.confirm(ar ? "حذف بيانات هذه البيئة التجريبية فقط وإعادة إنشائها؟" : "Replace records in this isolated demo dataset only?")) run(() => reseedEnterpriseDemo(asOf)); }}><RotateCcw />{ar ? "إعادة إنشاء العرض" : "Reset and reseed demo"}</Button>
        <Button variant="outline" disabled={busy} onClick={() => run(leaveEnterpriseDemo)}><LogOut />{ar ? "العودة إلى سجلاتي" : "Return to my records"}</Button>
        <Button variant="ghost" onClick={exportManifest}><Download />{ar ? "تصدير سجل الأعداد" : "Export count manifest"}</Button>
      </>}
    </div>
    {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    {active && demoVersion() !== DEMO_VERSION && <p role="status" className="rounded border border-border bg-muted p-2 text-sm" data-demo-outdated>{ar
      ? "أُنشئت هذه البيانات التجريبية بإصدار أقدم (بعض الصفقات مرتبطة بحسابات شركة أخرى، وعروض الأسعار تظهر «غير نشط»). استخدم «إعادة إنشاء العرض» لتطبيق التصحيحات؛ سجلاتك العادية لا تتأثر."
      : "This demo dataset was generated by an older version (some deals linked to another company's accounts, and quotations show as Inactive). Use “Reset and reseed demo” to apply the corrections; your normal records are not affected."}</p>}
    {active && <div className="overflow-x-auto"><table className="dp-table w-full text-sm"><thead><tr><th>{ar ? "السجلات" : "Records"}</th><th>{ar ? "العدد" : "Count"}</th></tr></thead><tbody>{Object.entries(demoCounts()).map(([dt, count]) => <tr key={dt}><td><span data-demo-doctype={dt}>{dt}</span></td><td dir="ltr">{count.toLocaleString("en-US")}</td></tr>)}</tbody></table></div>}
  </section>;
}