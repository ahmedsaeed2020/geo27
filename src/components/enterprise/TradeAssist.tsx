/**
 * DIGIT Enterprise shared trade assistance screens (Part B): supplier invoice capture → order match → draft invoice (CF-01,
 * CF-20), the sales inbox → quotation (CF-02), and the substitute / suggested-lines panel inside quotations and sales
 * orders (CF-04, CF-05). Logic lives in src/lib/coreShared/invoiceCapture.ts and salesAssist.ts.
 */
import { useState } from "react";
import { toast } from "sonner";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { canReadType, useScopeMetas } from "@/lib/scope";
import { hasPerm, useSessionUser } from "@/lib/session";
import * as IC from "@/lib/coreShared/invoiceCapture";
import * as SA from "@/lib/coreShared/salesAssist";
import { providerFor, providerName, PROVIDER_LABEL } from "@/lib/coreShared/providers";
import { EntFrame } from "./Surfaces";
import { Bar, CompanySelect, Denied, DocLink, Field, GoToAction, Kpi, Table, money, pick, tr, useCompany, useT } from "./FinanceDesk";

const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const cur = (company: string) => s(adapter.get("Company", company)?.["default_currency"]) || "SAR";

/* ------------------------------------------------------------------ CF-01 / CF-20 invoice capture ------------------------------------------------------------------ */
export function InvoiceCapturePage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); const user = useSessionUser();
  useScopeMetas(["Purchase Invoice", "Purchase Order", "Purchase Receipt", "Supplier", "Item"]);
  const [text, setText] = useState(""); const [cap, setCap] = useState<IC.Captured | null>(null); const [made, setMade] = useState<{ name: string; ok: boolean; issues: [string, string][] } | null>(null);
  if (!canReadType("Purchase Order")) return <Denied />;
  const meta = cachedMeta("Purchase Invoice"); const canCreate = !!meta && hasPerm(meta, "create", undefined, user);
  const cands = cap ? IC.poCandidates(cap, c.company) : [];
  const read = () => { const r = IC.captureInvoice(text); setCap(r); setMade(null); if (!r.invoiceNo) toast.error(t("The invoice number could not be read; check the file or text.", "تعذر قراءة رقم الفاتورة؛ راجع الملف أو النص.")); };
  const onFile = async (f: File | undefined) => { if (!f) return; setText(await f.text()); };
  const draft = (po: string) => { if (!cap) return; const r = IC.draftFromCapture(cap, po, c.company, user); if (r.ok) { setMade({ name: r.name, ok: r.match.ok, issues: r.match.issues }); toast.success(t(`Draft ${r.name} prepared from ${po}.`, `جُهزت المسودة ${r.name} من ${po}.`)); } else toast.error(pick(ar, r.reason)); };
  const prov = providerFor("einvoice_inbound");
  const recent = IC.recentCaptures(c.company); const matched = recent.filter((x) => x.match.ok).length;
  const openPos = adapter.list("Purchase Order").filter((p) => n(p.docstatus) === 1 && s(p["company"]) === c.company && !["Closed", "Completed", "On Hold"].includes(s(p["status"])) && n(p["per_billed"]) < 100).length;
  const sample = IC.sampleInvoice(c.company);
  const readSample = () => { setText(sample); const r = IC.captureInvoice(sample); setCap(r); setMade(null); };
  return <div className="space-y-3" data-invoice-capture>
    <Bar><CompanySelect c={c} /><span className="text-xs text-muted-foreground">{pick(ar, PROVIDER_LABEL.einvoice_inbound)}: <bdi data-no-i18n>{providerName("einvoice_inbound", prov.provider, ar)}</bdi></span>
      {sample && <button type="button" className="btn-primary" data-capture-read-sample onClick={readSample}>{t("Read a sample e-invoice", "قراءة فاتورة إلكترونية نموذجية")}</button>}</Bar>
    <div className="flex flex-wrap gap-2" data-capture-kpis>
      <Kpi id="cap-recent" label={t("Invoices captured", "فواتير ملتقطة")} value={String(recent.length)} sub={t("Read from e-invoices and scans", "مقروءة من الفواتير الإلكترونية والمسح")} />
      <Kpi id="cap-matched" label={t("Within the three-way match", "ضمن المطابقة الثلاثية")} value={String(matched)} tone="ok" />
      <Kpi id="cap-diff" label={t("With differences to review", "بها فروقات للمراجعة")} value={String(recent.length - matched)} {...(recent.length - matched ? { tone: "warn" } : {})} />
      <Kpi id="cap-open-po" label={t("Open orders awaiting an invoice", "أوامر مفتوحة بانتظار فاتورة")} value={String(openPos)} drill={{ doctype: "Purchase Order", filters: [["docstatus", "=", 1], ["company", "=", c.company], ["per_billed", "<", 100]] }} />
    </div>
    <div className="grid gap-3 lg:grid-cols-2">
      <EntFrame id="capture-input" title={t("Incoming supplier invoice", "فاتورة المورد الواردة")} note={t("Upload the supplier's ZATCA e-invoice (XML) or paste the text of a scanned / PDF invoice.", "ارفع الفاتورة الإلكترونية للمورد (XML) أو الصق نص فاتورة ممسوحة / PDF.")}>
        <div className="space-y-2">
          <label className="btn-ghost inline-flex cursor-pointer items-center gap-1 text-xs"><input type="file" accept=".xml,.txt,text/xml,text/plain" className="sr-only" data-capture-file onChange={(e) => void onFile(e.target.files?.[0])} /><span>{t("Choose a file (XML / text)", "اختر ملفًا (XML / نص)")}</span></label>
          {!text.trim() && IC.sampleInvoice(c.company) && <button type="button" className="btn-ghost ms-2 text-xs" data-capture-sample onClick={() => { setText(IC.sampleInvoice(c.company)); setCap(null); setMade(null); }}>{t("Load a sample e-invoice (from an open order)", "تحميل فاتورة إلكترونية نموذجية (من أمر مفتوح)")}</button>}
          <textarea className="field-input h-40 w-full font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} data-capture-text data-no-i18n placeholder={t("<Invoice …> or: Invoice No: INV-1001 …", "<Invoice …> أو: رقم الفاتورة: INV-1001 …")} />
          <button type="button" className="btn-primary" disabled={!text.trim()} data-capture-read onClick={read}>{t("Read invoice", "قراءة الفاتورة")}</button>
        </div>
      </EntFrame>
      <EntFrame id="capture-fields" title={t("What was read", "ما تمت قراءته")}>
        {cap ? <div className="space-y-2 text-sm" data-captured={cap.source}>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">{t("Source", "المصدر")}</dt><dd>{cap.source === "ubl" ? t("ZATCA e-invoice (UBL)", "فاتورة إلكترونية (UBL)") : t("Scanned / PDF text", "نص ممسوح / PDF")}</dd>
            <dt className="text-muted-foreground">{t("Supplier", "المورد")}</dt><dd data-no-i18n>{cap.supplier ? <DocLink dt="Supplier" name={cap.supplier}>{cap.supplierName || cap.supplier}</DocLink> : `${cap.supplierName || "—"} ${cap.supplierVat}`}</dd>
            <dt className="text-muted-foreground">{t("Invoice no.", "رقم الفاتورة")}</dt><dd data-no-i18n>{cap.invoiceNo || "—"}</dd>
            <dt className="text-muted-foreground">{t("Date", "التاريخ")}</dt><dd data-no-i18n>{cap.date || "—"}</dd>
            <dt className="text-muted-foreground">{t("Order reference", "مرجع الأمر")}</dt><dd data-no-i18n>{cap.orderRef || "—"}</dd>
            <dt className="text-muted-foreground">{t("Total incl. VAT", "الإجمالي شامل الضريبة")}</dt><dd className="tabular-nums" data-no-i18n>{cap.total !== null ? money(cap.total, cap.currency) : "—"}{cap.vat !== null ? ` · ${t("VAT", "الضريبة")} ${money(cap.vat, cap.currency)}` : ""}</dd>
          </dl>
          {cap.lines.length > 0 && <Table id="capture-lines" head={[t("Line", "السطر"), t("Qty", "الكمية"), t("Rate", "السعر"), t("Amount", "المبلغ")]}>
            {cap.lines.map((l, i) => <tr key={i} className={tr}><td className="p-2 text-xs" data-no-i18n>{l.description}{l.itemCode ? ` · ${l.itemCode}` : ""}</td><td className="p-2 tabular-nums" data-no-i18n>{l.qty}</td><td className="p-2 tabular-nums" data-no-i18n>{money(l.rate, cap.currency)}</td><td className="p-2 tabular-nums" data-no-i18n>{money(l.amount, cap.currency)}</td></tr>)}
          </Table>}
        </div> : <p className="text-sm text-muted-foreground">{t("Read an invoice to see its fields and lines.", "اقرأ فاتورة لعرض حقولها وسطورها.")}</p>}
      </EntFrame>
    </div>
    <EntFrame id="capture-recent" title={t("Recently captured invoices", "الفواتير الملتقطة مؤخرًا")} note={t("Supplier invoices read from their e-invoice or scanned copy, the order they were matched to and the live three-way match. Open an invoice in the side panel.", "فواتير الموردين المقروءة من فاتورتها الإلكترونية أو نسختها الممسوحة، والأمر الذي طوبقت معه، ونتيجة المطابقة الثلاثية الحالية. افتح الفاتورة في اللوحة الجانبية.")}>
      {recent.length ? <div className="max-h-[22rem] overflow-auto"><Table id="capture-recent-rows" head={[t("Supplier invoice", "فاتورة المورد"), t("Supplier", "المورد"), t("Order", "الأمر"), t("Invoice", "الفاتورة"), t("Read from", "مصدر القراءة"), t("Match", "المطابقة"), t("Status", "الحالة")]}>
        {recent.map((x) => <tr key={x.log} className={tr} data-capture-recent={x.invoice.name} data-match-ok={x.match.ok ? 1 : 0}>
          <td className="p-2 tabular-nums" data-no-i18n>{x.invoiceNo}</td><td className="p-2 text-xs" data-no-i18n>{x.supplierName}</td>
          <td className="p-2">{x.order ? <DocLink dt="Purchase Order" name={x.order} /> : "—"}</td><td className="p-2"><DocLink dt="Purchase Invoice" name={x.invoice.name} /></td>
          <td className="p-2 text-xs">{x.source === "ubl" ? t("E-invoice (XML)", "فاتورة إلكترونية (XML)") : t("Scanned copy", "نسخة ممسوحة")}</td>
          <td className="p-2"><span className={`ent-qv-status ent-qv-tone-${x.match.ok ? "ok" : "bad"}`} data-capture-match={x.match.ok ? "ok" : "diff"}>{x.match.ok ? t("Matched", "مطابقة") : `${t("Differences", "فروقات")} · ${x.match.issues.length}`}</span></td>
          <td className="p-2 text-xs">{n(x.invoice.docstatus) === 1 ? t("Submitted", "معتمدة") : t("Draft", "مسودة")}</td></tr>)}
      </Table></div> : <p className="text-sm text-muted-foreground" data-capture-recent-empty>{t("No supplier invoice captured yet for this company.", "لم تُلتقط فاتورة مورد لهذه الشركة بعد.")}</p>}
    </EntFrame>
    {cap && <EntFrame id="capture-orders" title={t("Matching purchase orders", "أوامر الشراء المطابقة")} note={t("Open orders of the supplier ranked by order reference, amount and lines. The draft takes the order's lines with the invoice's quantities and rates; the three-way match shows at once.", "الأوامر المفتوحة للمورد مرتبة حسب المرجع والمبلغ والسطور. تأخذ المسودة سطور الأمر بكميات وأسعار الفاتورة؛ وتظهر المطابقة الثلاثية فورًا.")}>
      {cands.length ? <Table id="capture-candidates" head={[t("Order", "الأمر"), t("Date", "التاريخ"), t("Open amount", "المبلغ المفتوح"), t("Why", "السبب"), t("Score", "الدرجة"), ""]}>
        {cands.map((x) => <tr key={x.po.name} className={tr} data-capture-po={x.po.name}><td className="p-2"><DocLink dt="Purchase Order" name={x.po.name} /></td><td className="p-2 tabular-nums" data-no-i18n>{s(x.po["transaction_date"])}</td>
          <td className="p-2 tabular-nums" data-no-i18n>{money(x.open, cur(c.company))}</td><td className="p-2 text-xs">{x.reasons.map((r) => pick(ar, r)).join(" · ") || "—"}</td><td className="p-2 tabular-nums" data-no-i18n>{x.score}</td>
          <td className="p-2">{canCreate && <button type="button" className="btn-primary" data-capture-draft={x.po.name} onClick={() => draft(x.po.name)}>{t("Prepare draft invoice", "تجهيز مسودة الفاتورة")}</button>}</td></tr>)}
      </Table> : <p className="text-sm text-muted-foreground" data-capture-nopo>{t("No open purchase order of this supplier fits the invoice.", "لا يوجد أمر شراء مفتوح لهذا المورد يطابق الفاتورة.")}</p>}
      {made && <p className={`mt-3 text-sm ${made.ok ? "" : "text-destructive"}`} data-capture-made={made.name} data-match-ok={made.ok ? 1 : 0}><DocLink dt="Purchase Invoice" name={made.name} /> · {made.ok ? t("Within the three-way match tolerance.", "ضمن حدود المطابقة الثلاثية.") : made.issues.map((i) => pick(ar, i)).join(" · ")}</p>}
    </EntFrame>}
  </div>;
}

/* ------------------------------------------------------------------ CF-02 sales inbox ------------------------------------------------------------------ */
export function SalesInboxPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); const user = useSessionUser();
  useScopeMetas(["Quotation", "Customer", "Item", "Item Price", "Contact", "Digit Inbound Message"]);
  const list = SA.inbox(c.company); const [sel, setSel] = useState(""); const msg = list.find((x) => x.name === sel) ?? list.find((x) => x["status"] === "New") ?? list[0];
  const parsed = msg ? SA.parseRequest(msg) : null; const [edit, setEdit] = useState<Record<string, number>>({}); const [cust, setCust] = useState(""); const [why, setWhy] = useState("");
  const [nw, setNw] = useState({ from_email: "", subject: "", body: "" });
  if (!canReadType("Quotation")) return <Denied />;
  const qMeta = cachedMeta("Quotation"); const canQuote = !!qMeta && hasPerm(qMeta, "create", undefined, user);
  const customer = cust || parsed?.customer || "";
  const lines = (parsed?.lines ?? []).map((l) => ({ ...l, qty: edit[`${msg?.name}:${l.item}`] ?? l.qty }));
  const quote = () => { if (!msg) return; const r = SA.quoteFromMessage(msg.name, { customer, lines: lines.filter((l) => l.qty > 0).map((l) => ({ item: l.item, qty: l.qty, rate: l.rate })) }, user); if (r.ok) toast.success(t(`Draft quotation ${r.quotation} prepared.`, `جُهز عرض السعر ${r.quotation}.`)); else toast.error(pick(ar, r.reason)); };
  const add = () => { const r = SA.receiveMessage({ ...nw, company: c.company }, user); if (r.ok) { setSel(r.name); setNw({ from_email: "", subject: "", body: "" }); toast.success(t("Request added.", "أضيف الطلب.")); } else toast.error(pick(ar, r.reason)); };
  return <div className="space-y-3" data-sales-inbox={list.length}>
    <Bar><CompanySelect c={c} /><GoToAction to="[data-inbox-add]" data-inbox-add-go>{t("Record a customer request", "تسجيل طلب عميل")}</GoToAction></Bar>
    <div className="flex flex-wrap gap-2"><Kpi id="inbox-new" label={t("New requests", "طلبات جديدة")} value={String(list.filter((x) => x["status"] === "New").length)} /><Kpi id="inbox-quoted" label={t("Quoted", "تم التسعير")} value={String(list.filter((x) => x["status"] === "Quoted").length)} /></div>
    <div className="grid gap-3 lg:grid-cols-2">
      <EntFrame id="inbox-list" title={t("Customer requests", "طلبات العملاء")}>
        <ul className="max-h-[26rem] space-y-1 overflow-auto" data-inbox-list>{list.map((m) => <li key={m.name}><button type="button" data-inbox-msg={m.name} data-status={s(m["status"])} onClick={() => { setSel(m.name); setCust(""); }} className={`w-full rounded-md border border-border p-2 text-start text-sm ${msg?.name === m.name ? "bg-muted" : ""}`}>
          <span className="block font-medium" data-no-i18n>{s(m["subject"])}</span><span className="text-xs text-muted-foreground" data-no-i18n>{s(m["from_name"]) || s(m["from_email"])} · {s(m["received_on"]).slice(0, 16)}</span>
          <span className={`ms-2 ent-qv-status ent-qv-tone-${m["status"] === "Quoted" ? "ok" : m["status"] === "Dismissed" ? "bad" : "draft"}`}>{m["status"] === "Quoted" ? t("Quoted", "تم التسعير") : m["status"] === "Dismissed" ? t("Dismissed", "مستبعد") : t("New", "جديد")}</span></button></li>)}</ul>
        <div className="mt-3 space-y-2 border-t border-border pt-3" data-inbox-add>
          <p className="text-xs font-semibold">{t("Add a request received by e-mail", "إضافة طلب وصل بالبريد")}</p>
          <input className="field-input w-full" placeholder={t("Sender e-mail", "بريد المرسل")} value={nw.from_email} onChange={(e) => setNw({ ...nw, from_email: e.target.value })} data-no-i18n />
          <input className="field-input w-full" placeholder={t("Subject", "الموضوع")} value={nw.subject} onChange={(e) => setNw({ ...nw, subject: e.target.value })} />
          <textarea className="field-input h-20 w-full" placeholder={t("Message", "الرسالة")} value={nw.body} onChange={(e) => setNw({ ...nw, body: e.target.value })} />
          <button type="button" className="btn-ghost" onClick={add} data-inbox-add-btn>{t("Add request", "إضافة الطلب")}</button>
        </div>
      </EntFrame>
      <EntFrame id="inbox-detail" title={msg ? <span data-no-i18n>{s(msg["subject"])}</span> : t("Request", "الطلب")}>
        {msg && parsed ? <div className="space-y-3 text-sm">
          <p className="whitespace-pre-line rounded-md bg-muted/50 p-2 text-xs" data-no-i18n>{s(msg["body"])}</p>
          <Field label={t("Customer", "العميل")}><select className="field-input" value={customer} onChange={(e) => setCust(e.target.value)} data-inbox-customer><option value="">{t("Choose the customer", "اختر العميل")}</option>{adapter.list("Customer").map((x) => <option key={x.name} value={x.name} data-no-i18n>{s(x["customer_name"]) || x.name}</option>)}</select></Field>
          {parsed.customerWhy && !cust && <p className="text-xs text-muted-foreground">{pick(ar, parsed.customerWhy)}</p>}
          {lines.length ? <Table id="inbox-lines" head={[t("Item", "الصنف"), t("Qty", "الكمية"), t("Rate", "السعر"), t("Read as", "قُرئ كـ")]}>
            {lines.map((l) => <tr key={l.item} className={tr} data-inbox-line={l.item}><td className="p-2 text-xs" data-no-i18n>{l.itemName}</td>
              <td className="p-2"><input type="number" min={0} className="field-input w-20" value={l.qty} disabled={msg["status"] !== "New"} onChange={(e) => setEdit({ ...edit, [`${msg.name}:${l.item}`]: Number(e.target.value) })} /></td>
              <td className="p-2 tabular-nums" data-no-i18n>{money(l.rate, cur(c.company))}</td><td className="p-2 text-xs text-muted-foreground" data-no-i18n>{pick(ar, l.why)}</td></tr>)}
          </Table> : <p className="text-xs text-muted-foreground">{t("No item of the catalogue was found in this message.", "لم يُعثر على صنف من الكتالوج في هذه الرسالة.")}</p>}
          {msg["status"] === "New" ? <div className="flex flex-wrap items-center gap-2">
            {canQuote && <button type="button" className="btn-primary" data-inbox-quote disabled={!customer || !lines.some((l) => l.qty > 0)} onClick={quote}>{t("Prepare quotation", "تجهيز عرض السعر")}</button>}
            <input className="field-input" placeholder={t("Reason to dismiss", "سبب الاستبعاد")} value={why} onChange={(e) => setWhy(e.target.value)} />
            <button type="button" className="btn-ghost" data-inbox-dismiss onClick={() => { const r = SA.dismissMessage(msg.name, why, user); if (r.ok) toast.success(t("Dismissed.", "استُبعد.")); else toast.error(pick(ar, r.reason)); }}>{t("Dismiss", "استبعاد")}</button>
          </div> : msg["quotation"] ? <p data-inbox-quotation={s(msg["quotation"])}>{t("Quotation", "عرض السعر")}: <DocLink dt="Quotation" name={s(msg["quotation"])} /></p> : <p className="text-xs text-muted-foreground" data-no-i18n>{s(msg["dismiss_reason"])}</p>}
        </div> : <p className="text-sm text-muted-foreground">{t("No customer requests yet.", "لا توجد طلبات عملاء بعد.")}</p>}
      </EntFrame>
    </div>
  </div>;
}

/* ------------------------------------------------------------------ CF-04 / CF-05 panel ------------------------------------------------------------------ */
export function SalesAssistPanel({ doctype, doc }: { doctype: string; doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const meta = cachedMeta(doctype); const canWrite = !!meta && hasPerm(meta, "write", doc, user) && n(doc.docstatus) === 0;
  const short = SA.shortLines(doc); const sug = doctype === "Delivery Note" ? [] : SA.composeLines(doc); const c = s(doc["currency"]) || "SAR";
  const addSel = () => { const lines = sug.filter((x) => picked[x.item]).map((x) => ({ item: x.item, qty: x.qty, rate: x.rate })); const r = SA.addLines(doctype, doc.name, lines, user); if (r.ok) { setPicked({}); toast.success(t(`${r.added} line(s) added.`, `أضيف ${r.added} سطر.`)); } else toast.error(pick(ar, r.reason)); };
  return <EntFrame id="sales-assist" title={t("Line assistant", "مساعد السطور")} note={t("Alternatives for lines the warehouse cannot cover, and lines this customer usually orders or that sell with these items. Nothing changes until you choose.", "بدائل للسطور التي لا يغطيها المستودع، وسطور يطلبها هذا العميل عادة أو تُباع مع هذه الأصناف. لا يتغير شيء حتى تختار.")}>
    <div className="space-y-3" data-sales-assist>
      <div><p className="mb-1 text-xs font-semibold">{t("Short lines and alternatives", "سطور ناقصة وبدائلها")}</p>
        {short.length ? <Table id="assist-short" head={[t("Line", "السطر"), t("Needed", "المطلوب"), t("In stock", "المتوفر"), t("Alternatives with stock", "بدائل متوفرة")]}>
          {short.map((l) => <tr key={l.idx} className={tr} data-assist-short={l.item}><td className="p-2 text-xs" data-no-i18n>{l.idx} · {l.item}</td><td className="p-2 tabular-nums" data-no-i18n>{l.qty}</td><td className="p-2 tabular-nums" data-no-i18n>{l.available}</td>
            <td className="p-2 text-xs">{l.substitutes.length ? <div className="flex flex-wrap gap-1">{l.substitutes.map((x) => <button key={x.item} type="button" className="btn-ghost" disabled={!canWrite} data-assist-use={x.item}
              onClick={() => { const r = SA.applySubstitute(doctype, doc.name, l.idx, x.item, user); if (r.ok) toast.success(t(`Line ${l.idx} now uses ${x.itemName}.`, `السطر ${l.idx} يستخدم الآن ${x.itemName}.`)); else toast.error(pick(ar, r.reason)); }}><span data-no-i18n>{x.itemName}</span> ({x.available})</button>)}</div> : t("No alternative in stock", "لا يوجد بديل متوفر")}</td></tr>)}
        </Table> : <p className="text-xs text-muted-foreground" data-assist-noshort>{t("Every line is covered by stock.", "كل السطور مغطاة بالمخزون.")}</p>}
      </div>
      {doctype !== "Delivery Note" && <div><p className="mb-1 text-xs font-semibold">{t("Suggested lines", "سطور مقترحة")}</p>
        {sug.length ? <><Table id="assist-suggest" head={["", t("Item", "الصنف"), t("Qty", "الكمية"), t("Rate", "السعر"), t("Why", "السبب")]}>
          {sug.map((x) => <tr key={x.item} className={tr} data-assist-suggest={x.item}><td className="p-2"><input type="checkbox" disabled={!canWrite} checked={!!picked[x.item]} onChange={(e) => setPicked({ ...picked, [x.item]: e.target.checked })} /></td>
            <td className="p-2 text-xs" data-no-i18n>{x.itemName}</td><td className="p-2 tabular-nums" data-no-i18n>{x.qty}</td><td className="p-2 tabular-nums" data-no-i18n>{money(x.rate, c)}</td><td className="p-2 text-xs text-muted-foreground">{pick(ar, x.why)}</td></tr>)}
        </Table>{canWrite && <button type="button" className="btn-primary mt-2" data-assist-add disabled={!Object.values(picked).some(Boolean)} onClick={addSel}>{t("Add selected lines", "إضافة السطور المختارة")}</button>}</>
          : <p className="text-xs text-muted-foreground">{t("No suggestion: this customer has no history yet.", "لا توجد اقتراحات: لا يوجد سجل لهذا العميل بعد.")}</p>}
      </div>}
    </div>
  </EntFrame>;
}
