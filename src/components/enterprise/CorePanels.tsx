/**
 * DIGIT Core document panels (shared by every app; merged with app panels into the OWN-65 brand tabs):
 *  - ZATCA e-invoice status inside every Sales Invoice (OWN-60): checks, QR, submit → Integration Log (provider-gated).
 *  - Integration log of a document (sent e-mails, bank files, ZATCA hand-overs).
 *  - Invoice disputes (Core DocType "Digit Invoice Dispute") on Sales / Purchase Invoices.
 *  - Where the document stands, "can this be submitted?", "why this price" and reclassify-a-line — enterprise/DocInsight.tsx.
 *  - Quote acceptance (Quotation), backorder decision (Sales Order), procurement policy (Purchase Order / Material
 *    Request) and approval path (every document type with an approval template) — enterprise/OpsDesk.tsx.
 */
import { useState } from "react";
import { renderSVG } from "uqr";
import { toast } from "sonner";
import type { DocTypeMeta } from "@/lib/catalog";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { hasPerm, useSessionUser } from "@/lib/session";
import { useLang } from "@/i18n";
import { integrationLogs, latestStatus, PROVIDER_LABEL, providerConnected, STATUS_LABEL, zatcaPrepare, zatcaSubmit, type LogRow } from "@/lib/coreShared/providers";
import { CORE_DT } from "@/lib/coreShared/doctypes";
import { openDisputes, raiseDispute, resolveDispute } from "@/lib/coreShared/controls";
import type { DocPanel } from "./DocPanels";
import { EntFrame } from "./Surfaces";
import { ApprovalPathPanel, BackorderPanel, ProcurementPolicyPanel, QuoteAcceptancePanel } from "./OpsDesk";
import { APPROVAL_DOCTYPES, backorderState } from "@/lib/coreShared/operations";
import { IssueSupportPanel } from "./SupportDesk";
import { ReceivingChecksPanel, ReviewPanel, RfqFollowUpPanel } from "./ControlPanels";
import { AllocationPanel, BankMatchPanel } from "./FinanceControls";
import { isStockReceipt } from "@/lib/coreShared/receiving";
import { DocStatusPanel, LedgerImpactPanel, PostCheckPanel, PriceWhyPanel, ReclassifyPanel, useMetaReady } from "./DocInsight";
import { BUYING_DOCTYPES, SELLING_DOCTYPES } from "@/lib/coreShared/docInsight";
import { tradePanels } from "./TradeDesk";
import { SalesAssistPanel } from "./TradeAssist";

const pick = (ar: boolean, b: [string, string]) => (ar ? b[1] : b[0]);
const tone = (s: string) => (s === "Accepted" || s === "Sent" ? "ok" : s === "Rejected" || s === "Failed" ? "bad" : "draft");

export function ZatcaPanel({ doc }: { doc: Doc }) {
  const ar = useLang() === "ar"; useStoreVersion(); const user = useSessionUser();
  const [open, setOpen] = useState(false);
  const check = zatcaPrepare(doc); const status = latestStatus("zatca", "Sales Invoice", doc.name);
  const m = cachedMeta("Sales Invoice"); const canSend = !!m && hasPerm(m, "submit", doc, user);
  const svg = check.qr ? renderSVG(check.qr, { border: 1 }) : "";
  return <EntFrame id="zatca" title={ar ? "الفوترة الإلكترونية (هيئة الزكاة والضريبة والجمارك)" : "ZATCA e-invoice"}
    note={pick(ar, [check.kind === "standard" ? "Standard tax invoice (B2B) — needs clearance before sharing." : "Simplified tax invoice (B2C) — reported within 24 hours.",
      check.kind === "standard" ? "فاتورة ضريبية قياسية (بين المنشآت) — تحتاج اعتماد الهيئة قبل مشاركتها." : "فاتورة ضريبية مبسطة (للأفراد) — تُبلَّغ خلال 24 ساعة."])}
    actions={<span className={`ent-qv-status ent-qv-tone-${tone(status)}`} data-zatca-status={status}>{pick(ar, STATUS_LABEL[status])}</span>}>
    <div className="flex flex-wrap items-start gap-4">
      {svg && <button type="button" className="rounded-lg border border-border bg-card p-1" onClick={() => setOpen((x) => !x)} aria-label={ar ? "رمز الاستجابة السريعة للفاتورة" : "Invoice QR code"} data-zatca-qr>
        <span className="block h-24 w-24 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /></button>}
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        {check.errors.length ? <ul className="space-y-1" data-zatca-errors={check.errors.length}>{check.errors.map((e) => <li key={e[0]} className="text-destructive">• {pick(ar, e)}</li>)}</ul>
          : <p className="text-muted-foreground" data-zatca-ready>{ar ? "الفاتورة جاهزة للإرسال: الرقم الضريبي صحيح والرمز مُنشأ." : "Ready to send: VAT numbers valid and the QR is generated."}</p>}
        {!providerConnected("zatca") && <p className="text-xs text-muted-foreground" data-zatca-provider="none">{ar ? `المزوّد: ${pick(ar, PROVIDER_LABEL.zatca)} غير متصل بعد — يُعد الإرسال ويُحفظ في سجل التكامل حتى يربطه المسؤول من الإدارة ← التكاملات.` : `Provider: ${PROVIDER_LABEL.zatca[0]} is not connected yet — the hand-over is prepared and kept in the integration log until an administrator connects it (Administration → Integrations).`}</p>}
        {open && <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-[11px]" data-no-i18n>{JSON.stringify(check.payload, null, 2)}</pre>}
        <div className="flex flex-wrap gap-2 pt-1">
          {canSend && <button type="button" className="btn-primary" disabled={!check.ok} data-zatca-submit onClick={() => { const r = zatcaSubmit(doc); if (r.ok) toast.success(pick(ar, STATUS_LABEL[r.log.status])); else toast.error(r.errors.map((e) => pick(ar, e)).join("\n")); }}>
            {check.kind === "standard" ? (ar ? "إرسال للاعتماد" : "Submit for clearance") : (ar ? "إبلاغ الهيئة" : "Report to ZATCA")}</button>}
          <button type="button" className="btn-ghost" onClick={() => setOpen((x) => !x)} data-zatca-payload>{open ? (ar ? "إخفاء البيانات" : "Hide data") : (ar ? "عرض بيانات الفاتورة الإلكترونية" : "Show e-invoice data")}</button>
        </div>
      </div>
    </div>
  </EntFrame>;
}

export function IntegrationLogTable({ rows, ar }: { rows: LogRow[]; ar: boolean }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground" data-intlog-empty>{ar ? "لا توجد عمليات إرسال بعد." : "Nothing has been sent yet."}</p>;
  return <div className="overflow-auto"><table className="w-full text-sm" data-intlog-rows={rows.length}>
    <thead className="text-xs text-muted-foreground"><tr><th className="p-2 text-start">{ar ? "المحرك" : "Engine"}</th><th className="p-2 text-start">{ar ? "المرجع" : "Reference"}</th><th className="p-2 text-start">{ar ? "الحالة" : "Status"}</th><th className="p-2 text-start">{ar ? "المحاولات" : "Attempts"}</th><th className="p-2 text-start">{ar ? "آخر محاولة" : "Last attempt"}</th></tr></thead>
    <tbody>{rows.map((r) => <tr key={r.name} className="border-t border-border" data-intlog={r.name}>
      <td className="p-2">{pick(ar, PROVIDER_LABEL[r.engine])}</td><td className="p-2" data-no-i18n>{r.reference_name}<div className="text-xs text-muted-foreground">{r.summary}</div></td>
      <td className="p-2"><span className={`ent-qv-status ent-qv-tone-${tone(r.status)}`}>{pick(ar, STATUS_LABEL[r.status])}</span></td>
      <td className="p-2 tabular-nums" data-no-i18n>{r.attempts}</td><td className="p-2 tabular-nums" data-no-i18n>{r.last_attempt}</td></tr>)}</tbody></table></div>;
}
export function IntegrationLogPanel({ ar, engine, doctype, name }: { ar: boolean; engine?: LogRow["engine"]; doctype?: string; name?: string }) {
  useStoreVersion();
  const rows = integrationLogs({ ...(engine ? { engine } : {}), ...(doctype ? { doctype } : {}), ...(name ? { name } : {}) });
  return <EntFrame id="integration-log" title={ar ? "سجل التكامل والإرسال" : "Integration & sending log"}
    note={ar ? "كل ما أُعد للإرسال إلى جهة خارجية وحالته؛ يُرسل فعليًا بعد ربط المزوّد." : "Everything prepared for an outside system and its state; it is actually sent once the provider is connected."}>
    <IntegrationLogTable rows={rows} ar={ar} />
  </EntFrame>;
}

export function DisputePanel({ doctype, doc }: { doctype: "Sales Invoice" | "Purchase Invoice"; doc: Doc }) {
  const ar = useLang() === "ar"; useStoreVersion(); const user = useSessionUser();
  const [reason, setReason] = useState(""); const [amount, setAmount] = useState("");
  useMetaReady([CORE_DT.dispute]); // load the dispute definition on a directly opened invoice before deciding the create right
  const m = cachedMeta(CORE_DT.dispute); const canWrite = !!m && hasPerm(m, "create", undefined, user);
  const rows = openDisputes({ invoice: doc.name });
  return <EntFrame id="dispute" title={ar ? "نزاعات الفاتورة" : "Invoice disputes"} note={ar ? "النزاع المفتوح يُستبعد من التحصيل الآلي ويظهر في قائمة «فواتير متنازع عليها»." : "An open dispute is excluded from automatic dunning and listed under 'Disputed invoices'."}>
    {rows.length ? <ul className="space-y-1 text-sm" data-dispute-rows={rows.length}>{rows.map((r) => <li key={r.name} className="flex flex-wrap items-center gap-2"><span className="ent-mint-chip" data-no-i18n>{r.name}</span><span>{r.reason}</span>
      <span className="tabular-nums" data-no-i18n>{r.disputed_amount.toFixed(2)}</span>
      {canWrite && <button type="button" className="btn-ghost" onClick={() => resolveDispute(r.name)} data-dispute-resolve>{ar ? "حل النزاع" : "Resolve"}</button>}</li>)}</ul>
      : <p className="text-sm text-muted-foreground" data-dispute-none>{ar ? "لا يوجد نزاع مفتوح." : "No open dispute."}</p>}
    {canWrite && Number(doc.docstatus ?? 0) === 1 && <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const r = raiseDispute(doctype, doc, reason, Number(amount || doc["outstanding_amount"] || 0)); if (r.ok) { setReason(""); setAmount(""); toast.success(ar ? "سُجّل النزاع" : "Dispute recorded"); } else toast.error(pick(ar, r.reason)); }}>
      <label className="text-xs"><span className="block text-muted-foreground">{ar ? "السبب" : "Reason"}</span><input className="field-input" value={reason} onChange={(e) => setReason(e.target.value)} data-dispute-reason /></label>
      <label className="text-xs"><span className="block text-muted-foreground">{ar ? "المبلغ" : "Amount"}</span><input className="field-input w-28" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-dispute-amount data-no-i18n /></label>
      <button type="submit" className="btn-ghost" data-dispute-raise>{ar ? "فتح نزاع" : "Raise dispute"}</button>
    </form>}
  </EntFrame>;
}

/** Core panels for one document (shown in every app and in the plain desk). */
export function coreDocPanels(meta: DocTypeMeta, doc: Doc): DocPanel[] {
  const out: DocPanel[] = []; const saved = !doc["__islocal"];
  if (!saved) return out;
  if (meta.is_submittable) out.push({ id: "doc-status", group: "flow", node: <DocStatusPanel meta={meta} doc={doc} /> });
  if (meta.is_submittable) out.push({ id: "ledger-impact", group: "flow", node: <LedgerImpactPanel meta={meta} doc={doc} /> });
  if (meta.is_submittable && Number(doc.docstatus ?? 0) === 0) out.push({ id: "post-check", group: "control", node: <PostCheckPanel meta={meta} doc={doc} /> });
  if ((SELLING_DOCTYPES.includes(meta.name) || BUYING_DOCTYPES.includes(meta.name)) && Array.isArray(doc["items"]) && (doc["items"] as unknown[]).length) out.push({ id: "price-why", group: "insight", node: <PriceWhyPanel meta={meta} doc={doc} /> });
  if (meta.name === "Journal Entry" && Number(doc.docstatus ?? 0) === 1) out.push({ id: "reclassify", group: "work", node: <ReclassifyPanel doc={doc} /> });
  if (meta.name === "Sales Invoice") out.push({ id: "zatca", group: "control", node: <ZatcaPanel doc={doc} /> });
  if (meta.name === "Sales Invoice" || meta.name === "Purchase Invoice") out.push({ id: "dispute", group: "control", node: <DisputePanel doctype={meta.name} doc={doc} /> });
  if (meta.name === "Quotation" && Number(doc.docstatus ?? 0) === 1) out.push({ id: "quote-acceptance", group: "work", node: <QuoteAcceptancePanel doc={doc} /> });
  if (meta.name === "Sales Order" && Number(doc.docstatus ?? 0) === 1) { const st = backorderState(doc); if (st.open || st.decision) out.push({ id: "backorder", group: "work", node: <BackorderPanel doc={doc} /> }); }
  if (meta.name === "Issue") out.push({ id: "support-desk", group: "control", node: <IssueSupportPanel doc={doc} /> });
  if ((meta.name === "Purchase Receipt" || meta.name === "Purchase Invoice") && isStockReceipt(meta.name, doc)) out.push({ id: "receiving-checks", group: "control", node: <ReceivingChecksPanel doctype={meta.name} doc={doc} /> });
  if ((meta.name === "Journal Entry" || meta.name === "Stock Reconciliation") && Number(doc.docstatus ?? 0) === 0) out.push({ id: "review-stamp", group: "control", node: <ReviewPanel doctype={meta.name} doc={doc} /> });
  if (meta.name === "Request for Quotation" && Number(doc.docstatus ?? 0) === 1) out.push({ id: "rfq-followup", group: "control", node: <RfqFollowUpPanel doc={doc} /> });
  if (meta.name === "Bank Transaction" && Number(doc.docstatus ?? 0) === 1) out.push({ id: "bank-match", group: "control", node: <BankMatchPanel doc={doc} /> });
  if (meta.name === CORE_DT.allocationRule && !doc["__islocal"]) out.push({ id: "allocation-run", group: "control", node: <AllocationPanel rule={doc} /> });
  if (meta.name === "Purchase Order" || meta.name === "Material Request") out.push({ id: "procurement-policy", group: "control", node: <ProcurementPolicyPanel doctype={meta.name} doc={doc} /> });
  if (APPROVAL_DOCTYPES.includes(meta.name) && adapter.list(CORE_DT.approvalTemplate).some((t) => t["document_type"] === meta.name)) out.push({ id: "approval-path", group: "control", node: <ApprovalPathPanel doctype={meta.name} doc={doc} /> });
  if (["Quotation", "Sales Order", "Delivery Note"].includes(meta.name) && Number(doc.docstatus ?? 0) === 0) out.push({ id: "sales-assist", group: "work", node: <SalesAssistPanel doctype={meta.name} doc={doc} /> });
  out.push(...tradePanels(meta, doc));
  if (adapter.list(CORE_DT.integrationLog).some((r) => r["reference_doctype"] === meta.name && String(r["reference_name"] ?? "").split(", ").includes(doc.name)))
    out.push({ id: "integration-log", group: "control", node: <IntegrationLogPanelFor doctype={meta.name} name={doc.name} /> });
  return out;
}
function IntegrationLogPanelFor({ doctype, name }: { doctype: string; name: string }) { const ar = useLang() === "ar"; return <IntegrationLogPanel ar={ar} doctype={doctype} name={name} />; }
