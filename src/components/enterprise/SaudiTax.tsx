/**
 * Saudi tax screens in the shared Core (owner DEC-01, OWN-16, OWN-36): ZATCA VAT return, Zakat estimate and the
 * e-invoicing queue. Figures come from src/lib/coreShared/ksaTax.ts and providers.ts; every box drills to its documents,
 * every table exports, and filing is handed over through the Administration provider setting. Used by every DIGIT app.
 */
import { useState, type ReactNode } from "react";
import { DateInput } from "@/components/form/DateInput";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { scopedList, canReadType } from "@/lib/scope";
import { useSessionUser } from "@/lib/session";
import { fmtCurrency } from "@/lib/format";
import { useLang } from "@/i18n";
import { ksaVatReturn, zakatEstimate, type VatBox } from "@/lib/coreShared/ksaTax";
import { dispatch, latestStatus, providerConnected, STATUS_LABEL, zatcaPrepare, zatcaSubmit, PROVIDER_LABEL } from "@/lib/coreShared/providers";
import { defaultCompany } from "@/lib/sessionDefaults";
import { InBand } from "./bandSlot";
import { EntFrame } from "./Surfaces";
import { ZatcaReconFrame } from "./FinanceControls";

const iso = (d: Date) => d.toISOString().slice(0, 10);
function quarterOf(today = new Date()) { const q = Math.floor(today.getUTCMonth() / 3); const from = new Date(Date.UTC(today.getUTCFullYear(), q * 3, 1)); const to = new Date(Date.UTC(today.getUTCFullYear(), q * 3 + 3, 0)); return { from: iso(from), to: iso(to) }; }
function download(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
function useCompany() {
  const user = useSessionUser(); const cos = scopedList("Company", user).map((c) => c.name);
  const [co, setCo] = useState(() => { const d = defaultCompany(user); return cos.includes(d) ? d : cos[0] ?? ""; });
  return { co: cos.includes(co) ? co : cos[0] ?? "", setCo, cos, user };
}
/** Filter row of a tax page: in the ServiceRoute band when one is open (owner 2026-11-13), else the shared filter card. */
function Bar({ children }: { children: ReactNode }) {
  return <InBand fallback={<div className="ek-card ek-filterbar mb-3 flex flex-wrap items-end gap-3" data-tax-filters data-list-filterbar>{children}</div>}><div className="ek-band-bar" data-tax-filters data-band-bar>{children}</div></InBand>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="flex flex-col gap-1 text-xs text-muted-foreground"><span>{label}</span>{children}</label>; }
const docsLink = (dt: string, names: string[]) => ({ to: "/app/$app/$doctype" as const, params: { app: "erpnext", doctype: dt.toLowerCase().replace(/ /g, "_") }, search: { filters: JSON.stringify([["name", "in", names.join(",")]]) } as never });
function Denied({ ar }: { ar: boolean }) { return <p className="text-sm text-muted-foreground" data-tax-denied>{ar ? "لا يحق لك قراءة الفواتير والقيود اللازمة لهذه الشاشة." : "You may not read the invoices and ledger this screen needs."}</p>; }

export function VatReturnPage() {
  useStoreVersion();
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en);
  const { co, setCo, cos, user } = useCompany(); const q = quarterOf();
  const [from, setFrom] = useState(q.from); const [to, setTo] = useState(q.to);
  if (!canReadType("Sales Invoice", user) || !canReadType("Purchase Invoice", user)) return <Denied ar={ar} />;
  const r = ksaVatReturn(co, from, to, user); const m = (v: number) => fmtCurrency(v, "SAR");
  const row = (b: VatBox, total = false) => <tr key={b.box} className={`border-t border-border ${total ? "font-semibold" : ""}`} data-vat-box={b.box}>
    <td className="py-2 tabular-nums text-muted-foreground" data-no-i18n>{b.box}</td>
    <td>{b.names.length && !total ? <Link {...docsLink(b.doctype, b.names)} className="text-primary hover:underline">{ar ? b.label[1] : b.label[0]}</Link> : <span>{ar ? b.label[1] : b.label[0]}</span>}
      {b.names.length > 0 && <span className="ms-2 text-xs text-muted-foreground" data-no-i18n>({b.names.length})</span>}</td>
    <td className="text-end tabular-nums" data-no-i18n>{m(b.amount)}</td><td className="text-end tabular-nums" data-no-i18n>{m(b.adjustment)}</td><td className="text-end tabular-nums" data-no-i18n>{m(b.vat)}</td></tr>;
  const exportCsv = () => download(`vat-return_${co}_${from}_${to}.csv`, [["Box", "Description", "Amount (SAR)", "Adjustment (SAR)", "VAT (SAR)"], ...[...r.sales, ...r.purchases].map((b) => [b.box, b.label[0], b.amount, b.adjustment, b.vat]), ["13", "Total VAT due for current period", "", "", r.netDue]]);
  const prepare = () => { const log = dispatch("zatca", { doctype: "VAT Return", name: `${co} ${from}…${to}`, company: co }, r, `VAT return ${from} – ${to}`); toast.success(ar ? `أُعد الإقرار: ${STATUS_LABEL[log.status][1]}` : `Return prepared: ${STATUS_LABEL[log.status][0]}`); };
  const head = <thead className="text-xs text-muted-foreground"><tr><th className="w-10 py-2 text-start">#</th><th className="text-start">{t("Description", "البيان")}</th><th className="text-end">{t("Amount (SAR)", "المبلغ (ر.س)")}</th><th className="text-end">{t("Adjustment", "التعديلات")}</th><th className="text-end">{t("VAT amount", "مبلغ الضريبة")}</th></tr></thead>;
  return <div className="space-y-4" data-page="vat-return">
    <Bar>
      <Field label={t("Company", "الشركة")}><select className="field-input" value={co} onChange={(e) => setCo(e.target.value)} data-no-i18n>{cos.map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label={t("From", "من")}><DateInput className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} data-vat-from /></Field>
      <Field label={t("To", "إلى")}><DateInput className="field-input" value={to} onChange={(e) => setTo(e.target.value)} data-vat-to /></Field>
      <div className="ms-auto flex gap-2"><button type="button" className="btn-ghost" onClick={exportCsv} data-vat-export>{t("Export", "تصدير")}</button>
        <button type="button" className="btn-primary" onClick={prepare} data-vat-prepare>{t("Prepare for ZATCA", "إعداد للإرسال إلى الهيئة")}</button></div>
    </Bar>
    <div className="grid gap-3 sm:grid-cols-3" data-vat-summary>
      {[["output", t("Output VAT", "ضريبة المخرجات"), r.outputVat], ["input", t("Input VAT", "ضريبة المدخلات"), r.inputVat], ["net", r.netDue >= 0 ? t("Net VAT due", "صافي الضريبة المستحقة") : t("VAT refundable", "ضريبة قابلة للاسترداد"), Math.abs(r.netDue)]].map(([k, l, v]) =>
        <div key={k as string} className="ent-frame p-4" data-vat-sum={k}><p className="text-xs text-muted-foreground">{l}</p><p className={`mt-1 text-xl font-semibold tabular-nums ${k === "net" ? "ent-title" : ""}`} data-no-i18n>{m(v as number)}</p></div>)}
    </div>
    <EntFrame title={t("VAT on sales", "ضريبة القيمة المضافة على المبيعات")} note={t("Boxes 1–6 of the ZATCA VAT return; returns and credit notes are the adjustment column.", "الخانات 1–6 من إقرار الهيئة؛ المرتجعات والإشعارات الدائنة في عمود التعديلات.")} id="vat-sales">
      <div className="overflow-x-auto"><table className="w-full text-sm">{head}<tbody>{r.sales.map((b) => row(b, b.box === 6))}</tbody></table></div></EntFrame>
    <EntFrame title={t("VAT on purchases", "ضريبة القيمة المضافة على المشتريات")} note={t("Boxes 7–12; imports from suppliers outside the Kingdom go to boxes 8–9.", "الخانات 7–12؛ الاستيراد من موردين خارج المملكة في الخانتين 8–9.")} id="vat-purchases">
      <div className="overflow-x-auto"><table className="w-full text-sm">{head}<tbody>{r.purchases.map((b) => row(b, b.box === 12))}</tbody></table></div></EntFrame>
    <p className="text-xs text-muted-foreground" data-vat-provider={providerConnected("zatca") ? "connected" : "none"}>{providerConnected("zatca") ? t("ZATCA provider connected — Prepare queues the return for filing.", "مزوّد الهيئة متصل — «إعداد» يضع الإقرار في قائمة الإرسال.") : t("Filing happens on the ZATCA portal; until the provider is connected in Administration, the prepared return waits in the integration log.", "يتم التقديم عبر بوابة الهيئة؛ إلى أن يُربط المزوّد من الإدارة ينتظر الإقرار المُعد في سجل التكامل.")}</p>
  </div>;
}

export function ZakatPage() {
  useStoreVersion();
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en);
  const { co, setCo, cos, user } = useCompany(); const [asOf, setAsOf] = useState(iso(new Date()));
  if (!canReadType("GL Entry", user) || !canReadType("Account", user)) return <Denied ar={ar} />;
  const z = zakatEstimate(co, asOf, user); const m = (v: number) => fmtCurrency(v, "SAR");
  const gl = (accounts: string[]) => ({ to: "/app/$app/$doctype" as const, params: { app: "erpnext", doctype: "gl_entry" }, search: { filters: JSON.stringify([["company", "=", co], ["account", "in", accounts.join(",")], ["is_cancelled", "=", "0"], ["posting_date", "<=", asOf]]) } as never });
  const lines = (xs: typeof z.sources) => xs.map((l) => <tr key={l.key} className="border-t border-border" data-zakat-line={l.key}>
    <td className="py-2">{l.accounts.length ? <Link {...gl(l.accounts)} className="text-primary hover:underline">{ar ? l.label[1] : l.label[0]}</Link> : <span>{ar ? l.label[1] : l.label[0]}</span>}<span className="ms-2 text-xs text-muted-foreground" data-no-i18n>({l.accounts.length})</span></td>
    <td className="text-end tabular-nums" data-no-i18n>{m(l.amount)}</td></tr>);
  const exportCsv = () => download(`zakat_${co}_${asOf}.csv`, [["Section", "Line", "Amount (SAR)"], ...z.sources.map((l) => ["Sources", l.label[0], l.amount]), ...z.deductions.map((l) => ["Deductions", l.label[0], l.amount]), ["", "Zakat base", z.base], ["", "Zakat 2.5% (Hijri year)", z.zakat], ["", "Zakat 2.5776% (Gregorian year)", z.zakatGregorian]]);
  return <div className="space-y-4" data-page="zakat">
    <Bar>
      <Field label={t("Company", "الشركة")}><select className="field-input" value={co} onChange={(e) => setCo(e.target.value)} data-no-i18n>{cos.map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label={t("As of", "بتاريخ")}><DateInput className="field-input" value={asOf} onChange={(e) => setAsOf(e.target.value)} data-zakat-asof /></Field>
      <button type="button" className="btn-primary" data-band-primary onClick={exportCsv} data-zakat-export>{t("Export", "تصدير")}</button>
    </Bar>
    <div className="grid gap-3 sm:grid-cols-3" data-zakat-summary>
      <div className="ent-frame p-4" data-zakat-sum="base"><p className="text-xs text-muted-foreground">{t("Zakat base", "الوعاء الزكوي")}</p><p className="mt-1 text-xl font-semibold tabular-nums" data-no-i18n>{m(z.base)}</p></div>
      <div className="ent-frame p-4" data-zakat-sum="hijri"><p className="text-xs text-muted-foreground">{t("Zakat due — Hijri year (2.5%)", "الزكاة المستحقة — سنة هجرية (2.5%)")}</p><p className="ent-title mt-1 text-xl tabular-nums" data-no-i18n>{m(z.zakat)}</p></div>
      <div className="ent-frame p-4" data-zakat-sum="gregorian"><p className="text-xs text-muted-foreground">{t("Zakat due — Gregorian year (2.5776%)", "الزكاة المستحقة — سنة ميلادية (2.5776%)")}</p><p className="mt-1 text-xl font-semibold tabular-nums" data-no-i18n>{m(z.zakatGregorian)}</p></div>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <EntFrame title={t("Sources (added to the base)", "المصادر (تضاف للوعاء)")} id="zakat-sources"><table className="w-full text-sm"><tbody>{lines(z.sources)}</tbody></table></EntFrame>
      <EntFrame title={t("Deductions (taken from the base)", "الحسميات (تخصم من الوعاء)")} id="zakat-deductions"><table className="w-full text-sm"><tbody>{lines(z.deductions)}</tbody></table></EntFrame>
    </div>
    <p className="text-xs text-muted-foreground">{t("Estimate from posted ledger balances: base = sources − deductions (never below zero). The filed declaration is prepared with your accountant on the ZATCA portal.", "تقدير من أرصدة الدفتر المرحّلة: الوعاء = المصادر − الحسميات (لا يقل عن صفر). يُعد الإقرار النهائي مع محاسبك عبر بوابة الهيئة.")}</p>
  </div>;
}

export function EInvoicingPage() {
  useStoreVersion();
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en);
  const { co, setCo, cos, user } = useCompany(); const q = quarterOf();
  const [from, setFrom] = useState(q.from); const [st, setSt] = useState(""); const [sel, setSel] = useState<Set<string>>(new Set());
  if (!canReadType("Sales Invoice", user)) return <Denied ar={ar} />;
  const rows = scopedList("Sales Invoice", user).filter((d) => d["company"] === co && Number(d.docstatus) === 1 && String(d["posting_date"] ?? "") >= from)
    .map((d) => ({ d, z: zatcaPrepare(d), status: latestStatus("zatca", "Sales Invoice", d.name) })).filter((x) => !st || x.status === st)
    .sort((a, b) => String(b.d["posting_date"]).localeCompare(String(a.d["posting_date"])));
  const counts = new Map<string, number>(); for (const x of rows) counts.set(x.status, (counts.get(x.status) ?? 0) + 1);
  const submit = () => { let ok = 0, bad = 0; for (const x of rows.filter((r) => sel.has(r.d.name))) { const r = zatcaSubmit(adapter.get("Sales Invoice", x.d.name) as Doc); if (r.ok) ok++; else bad++; } setSel(new Set());
    toast.success(ar ? `أُرسلت ${ok} فاتورة${bad ? `، تعذر ${bad}` : ""}` : `${ok} invoice(s) handed over${bad ? `, ${bad} need fixing` : ""}`); };
  return <div className="space-y-4" data-page="e-invoicing">
    <Bar>
      <Field label={t("Company", "الشركة")}><select className="field-input" value={co} onChange={(e) => setCo(e.target.value)} data-no-i18n>{cos.map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label={t("From", "من")}><DateInput className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label={t("Status", "الحالة")}><select className="field-input" value={st} onChange={(e) => setSt(e.target.value)} data-einv-status-filter><option value="">{t("All", "الكل")}</option>{Object.keys(STATUS_LABEL).map((k) => <option key={k} value={k}>{ar ? STATUS_LABEL[k as keyof typeof STATUS_LABEL][1] : STATUS_LABEL[k as keyof typeof STATUS_LABEL][0]}</option>)}</select></Field>
      <span className={`ent-mint-chip ms-auto`} data-einv-provider={providerConnected("zatca") ? "connected" : "none"}>{ar ? PROVIDER_LABEL.zatca[1] : PROVIDER_LABEL.zatca[0]}: {providerConnected("zatca") ? t("connected", "متصل") : t("not connected", "غير متصل")}</span>
      <button type="button" className="btn-primary" disabled={!sel.size} onClick={submit} data-einv-submit>{t("Submit selected", "إرسال المحدد")} ({sel.size})</button>
    </Bar>
    <div className="flex flex-wrap gap-2" data-einv-counts>{[...counts].map(([k, v]) => <span key={k} className="ent-kb-area" data-einv-count={k}>{ar ? STATUS_LABEL[k as keyof typeof STATUS_LABEL][1] : STATUS_LABEL[k as keyof typeof STATUS_LABEL][0]} · <span data-no-i18n>{v}</span></span>)}</div>
    <EntFrame title={t("Sales invoices for ZATCA", "فواتير المبيعات للهيئة")} note={t("Standard (B2B) invoices are cleared, simplified (B2C) invoices are reported within 24 hours.", "الفواتير القياسية (بين المنشآت) تُعتمد، والمبسطة (للأفراد) يُبلغ عنها خلال 24 ساعة.")} id="einv-list">
      <div className="max-h-[60vh] overflow-auto"><table className="w-full text-sm" data-einv-rows={rows.length}><thead className="sticky top-0 bg-card text-xs text-muted-foreground"><tr>
        <th className="w-8 py-2"><input type="checkbox" aria-label={t("Select all", "تحديد الكل")} checked={rows.length > 0 && rows.every((x) => sel.has(x.d.name))} onChange={(e) => setSel(e.target.checked ? new Set(rows.filter((x) => x.z.ok).map((x) => x.d.name)) : new Set())} /></th>
        <th className="text-start">{t("Invoice", "الفاتورة")}</th><th className="text-start">{t("Customer", "العميل")}</th><th className="text-start">{t("Type", "النوع")}</th><th className="text-end">{t("Total", "الإجمالي")}</th><th className="text-start">{t("ZATCA status", "حالة الهيئة")}</th><th className="text-start">{t("Checks", "الفحوصات")}</th></tr></thead>
        <tbody>{rows.slice(0, 200).map((x) => <tr key={x.d.name} className="border-t border-border" data-einv-row={x.d.name}>
          <td className="py-2"><input type="checkbox" aria-label={x.d.name} disabled={!x.z.ok} checked={sel.has(x.d.name)} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(x.d.name); else s.delete(x.d.name); setSel(s); }} /></td>
          <td><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "sales_invoice", name: x.d.name }} className="text-primary hover:underline" data-no-i18n>{x.d.name}</Link></td>
          <td data-no-i18n>{String(x.d["customer_name"] ?? x.d["customer"] ?? "")}</td>
          <td>{x.z.kind === "standard" ? t("Standard (B2B)", "قياسية") : t("Simplified (B2C)", "مبسطة")}</td>
          <td className="text-end tabular-nums" data-no-i18n>{fmtCurrency(Number(x.d["grand_total"] ?? 0), "SAR")}</td>
          <td><span className="ent-mint-chip">{ar ? STATUS_LABEL[x.status][1] : STATUS_LABEL[x.status][0]}</span></td>
          <td className="text-xs">{x.z.ok ? <span className="text-muted-foreground">{t("Ready", "جاهزة")}</span> : <span className="text-destructive">{ar ? x.z.errors[0]![1] : x.z.errors[0]![0]}</span>}</td></tr>)}</tbody></table></div>
    </EntFrame>
    <ZatcaReconFrame company={co} from={from} to={iso(new Date())} />
  </div>;
}
