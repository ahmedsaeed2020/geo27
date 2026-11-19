/**
 * DIGIT Core external engines (owner decision DEC-02, 2026-11-11): ZATCA e-invoice submission, bank transfer files, e-mail,
 * invoice OCR, barcode scanning and bank feeds. Every engine has its full UI and logic in the Core now; only the real
 * hand-over to an outside system waits for a provider the administrator configures (Administration → Integrations).
 *
 * - Provider settings are records of the Core DocType "Digit Pro Provider Setting" (one per engine; the key itself is
 *   never stored — only the NAME of the secret that holds it on the server).
 * - Every hand-over writes one "Digit Integration Log" row: what was prepared (payload), for which document, and its state.
 *   Preview mode (no provider) → "Awaiting Provider"; server mode → "Queued" for the server worker. The browser never
 *   calls an outside system.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { CORE_DT } from "./doctypes";

export type Bi = [string, string];
export type Engine = "zatca" | "bank_transfer" | "email" | "ocr" | "barcode" | "bank_feed" | "support_desk" | "live_chat" | "marketplace" | "einvoice_inbound" | "sales_inbox";
export const ENGINES: Engine[] = ["zatca", "bank_transfer", "email", "ocr", "barcode", "bank_feed", "support_desk", "live_chat", "marketplace", "einvoice_inbound", "sales_inbox"];
export const PROVIDER_DT = CORE_DT.provider;
export const LOG_DT = CORE_DT.integrationLog;
export const PROVIDER_LABEL: Record<Engine, Bi> = {
  zatca: ["ZATCA e-invoicing (Fatoora)", "الفوترة الإلكترونية — هيئة الزكاة (فاتورة)"],
  bank_transfer: ["Bank transfer file", "ملف التحويل البنكي"],
  email: ["E-mail sending", "إرسال البريد الإلكتروني"],
  ocr: ["Invoice OCR", "قراءة الفواتير آليًا"],
  barcode: ["Barcode scanning", "مسح الباركود"],
  bank_feed: ["Bank feed", "تغذية كشوف البنك"],
  support_desk: ["DIGIT vendor support desk", "مكتب دعم ديجيت"],
  live_chat: ["Live chat with a person", "المحادثة المباشرة مع موظف"],
  marketplace: ["Marketplace channels (Salla, Zid, Amazon.sa, Noon)", "قنوات المتاجر (سلة، زد، أمازون السعودية، نون)"],
  einvoice_inbound: ["Inbound supplier e-invoices", "الفواتير الإلكترونية الواردة من الموردين"],
  sales_inbox: ["Sales inbox (customer requests by e-mail)", "صندوق المبيعات (طلبات العملاء بالبريد)"],
};
const DEFAULT_PROVIDER: Record<Engine, string> = {
  zatca: "ZATCA Fatoora portal (not connected)", bank_transfer: "Bank file (SARIE CSV) — upload in your bank portal", email: "Outgoing mail server (not connected)",
  ocr: "DIGIT preview text extractor", barcode: "Camera / keyboard wedge (browser)", bank_feed: "CSV / MT940 statement file",
  support_desk: "DIGIT support desk (not connected)", live_chat: "Live chat service (not connected)", marketplace: "Marketplace order feed (not connected)",
  einvoice_inbound: "Supplier e-invoice mailbox / ZATCA UBL file upload (preview: paste or upload)", sales_inbox: "Sales mailbox (preview: paste the customer's message)",
};
/** Arabic names of the default (preview) providers; a provider the administrator types in shows as typed. */
export const DEFAULT_PROVIDER_AR: Record<Engine, string> = {
  zatca: "بوابة فاتورة (غير متصلة)", bank_transfer: "ملف بنكي (سريع CSV) — يُرفع في بوابة البنك", email: "خادم البريد الصادر (غير متصل)",
  ocr: "قارئ النصوص في المعاينة", barcode: "الكاميرا / قارئ لوحة المفاتيح (المتصفح)", bank_feed: "ملف كشف CSV / MT940",
  support_desk: "مكتب دعم ديجيت (غير متصل)", live_chat: "خدمة المحادثة المباشرة (غير متصلة)", marketplace: "تغذية طلبات المتجر (غير متصلة)",
  einvoice_inbound: "بريد الفواتير الإلكترونية للموردين / رفع ملف UBL (المعاينة: الصق أو ارفع)", sales_inbox: "بريد المبيعات (المعاينة: الصق رسالة العميل)",
};
export const providerName = (engine: Engine, provider: string, ar: boolean): string => (ar && provider === DEFAULT_PROVIDER[engine] ? DEFAULT_PROVIDER_AR[engine] : provider);
export interface ProviderSetting { name: string; engine: Engine; provider: string; mode: "preview" | "server"; endpoint: string; secret_name: string }
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export function providerSettings(): ProviderSetting[] {
  return adapter.list(PROVIDER_DT).map((d: Doc) => ({ name: d.name, engine: d["engine"] as Engine, provider: str(d["provider"]), mode: d["mode"] === "server" ? "server" : "preview", endpoint: str(d["endpoint"]), secret_name: str(d["secret_name"]) }));
}
export function providerFor(engine: Engine): ProviderSetting {
  return providerSettings().find((p) => p.engine === engine) ?? { name: engine, engine, provider: DEFAULT_PROVIDER[engine], mode: "preview", endpoint: "", secret_name: "" };
}
/** A provider is "connected" only in server mode with an https endpoint and a secret name. */
export const providerConnected = (engine: Engine) => { const p = providerFor(engine); return p.mode === "server" && /^https:\/\//.test(p.endpoint) && !!p.secret_name; };
/** Save the provider of one engine. A server provider needs an https endpoint; the key is referenced by its secret name only. */
export function setProvider(engine: Engine, p: { provider: string; mode: "preview" | "server"; endpoint?: string; secret_name?: string }): { ok: true } | { ok: false; reason: Bi } {
  if (p.mode === "server" && !/^https:\/\//.test(p.endpoint ?? "")) return { ok: false, reason: ["A server provider needs an https endpoint.", "مزوّد الخادم يحتاج عنوان https."] };
  if (/[A-Za-z0-9_-]{24,}/.test(p.secret_name ?? "") && !/^[A-Z][A-Z0-9_]+$/.test(p.secret_name ?? "")) return { ok: false, reason: ["Enter the secret's NAME (e.g. OCR_API_KEY), never the key itself.", "أدخل اسم السر (مثل OCR_API_KEY) وليس المفتاح نفسه."] };
  const fields = { engine, provider: p.provider || DEFAULT_PROVIDER[engine], mode: p.mode, endpoint: p.endpoint ?? "", secret_name: p.secret_name ?? "" };
  if (adapter.get(PROVIDER_DT, engine)) adapter.update(PROVIDER_DT, engine, fields); else adapter.insertDoc(PROVIDER_DT, { name: engine, ...fields });
  return { ok: true };
}

/* ------------------------------------------------------------------ integration log ------------------------------------------------------------------ */
export type LogStatus = "Prepared" | "Awaiting Provider" | "Queued" | "Sent" | "Accepted" | "Rejected" | "Failed";
export interface LogRow { name: string; engine: Engine; status: LogStatus; reference_doctype: string; reference_name: string; summary: string; payload: string; provider: string; attempts: number; last_attempt: string; company: string }
const asLog = (d: Doc): LogRow => ({ name: d.name, engine: d["engine"] as Engine, status: (str(d["status"]) || "Prepared") as LogStatus, reference_doctype: str(d["reference_doctype"]), reference_name: str(d["reference_name"]),
  summary: str(d["summary"]), payload: str(d["payload"]), provider: str(d["provider"]), attempts: Number(d["attempts"] ?? 0), last_attempt: str(d["last_attempt"]), company: str(d["company"]) });
export function integrationLogs(filter: { engine?: Engine; doctype?: string; name?: string } = {}): LogRow[] {
  return adapter.list(LOG_DT).map(asLog).filter((r) => (!filter.engine || r.engine === filter.engine) && (!filter.doctype || r.reference_doctype === filter.doctype) && (!filter.name || r.reference_name === filter.name))
    .sort((a, b) => (a.last_attempt < b.last_attempt ? 1 : a.last_attempt > b.last_attempt ? -1 : b.name.localeCompare(a.name)));
}
const nowIso = () => new Date().toISOString().slice(0, 19).replace("T", " ");
/** Hand one prepared payload to the engine's provider: one log row per attempt (re-sending the same document adds an attempt). */
export function dispatch(engine: Engine, ref: { doctype: string; name: string; company?: string }, payload: unknown, summary: string): LogRow {
  const p = providerFor(engine);
  const status: LogStatus = providerConnected(engine) ? "Queued" : "Awaiting Provider";
  const prev = integrationLogs({ engine, doctype: ref.doctype, name: ref.name })[0];
  const fields = { engine, company: ref.company ?? "", reference_doctype: ref.doctype, reference_name: ref.name, status, provider: p.provider, attempts: (prev?.attempts ?? 0) + 1, last_attempt: nowIso(), summary, payload: JSON.stringify(payload, null, 2) };
  if (prev && (prev.status === "Awaiting Provider" || prev.status === "Queued" || prev.status === "Failed" || prev.status === "Prepared")) { adapter.update(LOG_DT, prev.name, fields); return asLog(adapter.get(LOG_DT, prev.name)!); }
  return asLog(adapter.insertDoc(LOG_DT, fields));
}
/** Status label of the latest hand-over for one document (or "Not sent"). */
export function latestStatus(engine: Engine, doctype: string, name: string): LogStatus | "Not sent" { return integrationLogs({ engine, doctype, name })[0]?.status ?? "Not sent"; }
export const STATUS_LABEL: Record<LogStatus | "Not sent", Bi> = {
  "Not sent": ["Not submitted", "لم يُرسل"], Prepared: ["Prepared", "مُعد"], "Awaiting Provider": ["Prepared — waiting for the provider to be connected", "مُعد — بانتظار ربط المزوّد"],
  Queued: ["Queued for sending", "في طابور الإرسال"], Sent: ["Sent", "مرسل"], Accepted: ["Accepted", "مقبول"], Rejected: ["Rejected", "مرفوض"], Failed: ["Failed", "فشل"],
};

/* ------------------------------------------------------------------ ZATCA (Saudi e-invoicing) ------------------------------------------------------------------ */
/** Saudi VAT registration number: 15 digits, starts and ends with 3. */
export const validSaudiVat = (v: string) => /^3\d{13}3$/.test(v.trim());
/** ZATCA phase-1 QR: TLV (tag, length, UTF-8 value) of seller, VAT no., timestamp, total with VAT, VAT total → base64. */
export function zatcaQr(f: { seller: string; vat: string; timestamp: string; total: number; vatTotal: number }): string {
  const enc = new TextEncoder(); const parts: number[] = [];
  const add = (tag: number, value: string) => { const b = enc.encode(value); parts.push(tag, b.length, ...b); };
  add(1, f.seller); add(2, f.vat); add(3, f.timestamp); add(4, f.total.toFixed(2)); add(5, f.vatTotal.toFixed(2));
  let bin = ""; for (const x of parts) bin += String.fromCharCode(x);
  return btoa(bin);
}
/** Decode a ZATCA TLV QR (for display and tests). */
export function decodeZatcaQr(b64: string): Record<number, string> {
  const bin = atob(b64); const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0)); const out: Record<number, string> = {}; const dec = new TextDecoder();
  for (let i = 0; i < bytes.length;) { const tag = bytes[i]!; const len = bytes[i + 1]!; out[tag] = dec.decode(bytes.slice(i + 2, i + 2 + len)); i += 2 + len; }
  return out;
}
export interface ZatcaCheck { ok: boolean; errors: Bi[]; kind: "standard" | "simplified"; qr: string; payload: Record<string, unknown> }
/** Everything ZATCA needs from one Sales Invoice: checks, invoice type (B2B standard / B2C simplified), QR and the clearance payload. */
export function zatcaPrepare(si: Doc): ZatcaCheck {
  const errors: Bi[] = [];
  const company: Record<string, unknown> = adapter.get("Company", str(si["company"])) ?? {};
  const customer: Record<string, unknown> = adapter.get("Customer", str(si["customer"])) ?? {};
  const sellerVat = str(company["tax_id"]); const buyerVat = str(customer["tax_id"]);
  if (Number(si["docstatus"]) !== 1) errors.push(["Submit the invoice first — only submitted invoices go to ZATCA.", "اعتمد الفاتورة أولًا — تُرسل الفواتير المعتمدة فقط."]);
  if (!validSaudiVat(sellerVat)) errors.push(["The company VAT number must be 15 digits starting and ending with 3 (Company → Tax ID).", "يجب أن يكون الرقم الضريبي للشركة 15 رقمًا يبدأ وينتهي بالرقم 3 (الشركة ← الرقم الضريبي)."]);
  const kind = buyerVat ? "standard" : "simplified";
  if (buyerVat && !validSaudiVat(buyerVat)) errors.push(["The customer VAT number is not a valid Saudi VAT number.", "الرقم الضريبي للعميل غير صالح."]);
  const total = Number(si["grand_total"] ?? 0); const vatTotal = Number(si["total_taxes_and_charges"] ?? 0);
  const timestamp = `${str(si["posting_date"]) || "1970-01-01"}T${(str(si["posting_time"]) || "00:00:00").slice(0, 8)}Z`;
  const seller = str(company["company_name"]) || str(si["company"]);
  const qr = zatcaQr({ seller, vat: sellerVat, timestamp, total, vatTotal });
  const payload = { invoiceNumber: si.name, uuid: str(si["name"]), issueDate: str(si["posting_date"]), invoiceType: kind === "standard" ? "388 (standard tax invoice)" : "388 (simplified tax invoice)",
    isReturn: !!Number(si["is_return"] ?? 0), seller: { name: seller, vat: sellerVat }, buyer: { name: str(si["customer_name"]) || str(si["customer"]), vat: buyerVat || null },
    currency: str(si["currency"]) || "SAR", totalExclVat: Number(si["net_total"] ?? total - vatTotal), vatTotal, totalInclVat: total, qr };
  return { ok: !errors.length, errors, kind, qr, payload };
}
/** Submit (clearance for standard, reporting for simplified) — prepared now; sent by the provider once connected. */
export function zatcaSubmit(si: Doc): { ok: true; log: LogRow } | { ok: false; errors: Bi[] } {
  const c = zatcaPrepare(si); if (!c.ok) return { ok: false, errors: c.errors };
  const log = dispatch("zatca", { doctype: "Sales Invoice", name: si.name, company: str(si["company"]) }, c.payload, `${c.kind === "standard" ? "Clearance" : "Reporting"} · ${si.name} · ${c.payload["totalInclVat"]}`);
  return { ok: true, log };
}

/* ------------------------------------------------------------------ bank transfer file ------------------------------------------------------------------ */
/** Saudi IBAN: SA + 2 check digits + 20 characters (24 total), mod-97 valid. */
export function validSaudiIban(iban: string): boolean {
  const v = iban.replace(/\s+/g, "").toUpperCase(); if (!/^SA\d{2}[0-9A-Z]{20}$/.test(v)) return false;
  const re = v.slice(4) + v.slice(0, 4); let r = 0;
  for (const ch of re) { const n = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55); for (const d of n) r = (r * 10 + Number(d)) % 97; }
  return r === 1;
}
export interface TransferLine { payment: string; beneficiary: string; iban: string; amount: number; currency: string; reference: string }
/** Bank transfer file (SARIE-style CSV) from submitted outgoing Payment Entries; lines without a valid Saudi IBAN are refused. */
export function bankTransferFile(entries: Doc[]): { lines: TransferLine[]; refused: { payment: string; reason: Bi }[]; csv: string } {
  const lines: TransferLine[] = []; const refused: { payment: string; reason: Bi }[] = [];
  for (const pe of entries) {
    if (Number(pe["docstatus"]) !== 1 || pe["payment_type"] !== "Pay") { refused.push({ payment: pe.name, reason: ["Only submitted outgoing payments can be transferred.", "تُحوَّل المدفوعات الصادرة المعتمدة فقط."] }); continue; }
    const party = str(pe["party"]); const ba = adapter.list("Bank Account").find((b) => str(b["party"]) === party || str(b["account_name"]) === party);
    const iban = str(ba?.["iban"]);
    if (!validSaudiIban(iban)) { refused.push({ payment: pe.name, reason: ["The beneficiary has no valid Saudi IBAN on its bank account.", "لا يوجد للمستفيد رقم آيبان سعودي صالح في حسابه البنكي."] }); continue; }
    lines.push({ payment: pe.name, beneficiary: str(pe["party_name"]) || party, iban, amount: Number(pe["paid_amount"] ?? 0), currency: str(pe["paid_from_account_currency"]) || "SAR", reference: str(pe["reference_no"]) || pe.name });
  }
  const csv = ["payment,beneficiary,iban,amount,currency,reference", ...lines.map((l) => [l.payment, l.beneficiary, l.iban, l.amount.toFixed(2), l.currency, l.reference].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))].join("\n");
  return { lines, refused, csv };
}
export function sendBankTransfer(company: string, entries: Doc[]) {
  const f = bankTransferFile(entries); if (!f.lines.length) return { ok: false as const, refused: f.refused };
  const total = f.lines.reduce((s, l) => s + l.amount, 0);
  const log = dispatch("bank_transfer", { doctype: "Payment Entry", name: f.lines.map((l) => l.payment).join(", "), company }, { lines: f.lines, csv: f.csv }, `${f.lines.length} transfers · ${total.toFixed(2)}`);
  return { ok: true as const, log, refused: f.refused, csv: f.csv };
}

/* ------------------------------------------------------------------ e-mail ------------------------------------------------------------------ */
export function queueEmail(m: { to: string; subject: string; body: string; doctype: string; name: string; company?: string }): { ok: true; log: LogRow } | { ok: false; reason: Bi } {
  const to = m.to.split(/[,;]\s*/).filter(Boolean);
  if (!to.length || to.some((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) return { ok: false, reason: ["Enter valid recipient e-mail addresses.", "أدخل عناوين بريد صحيحة للمستلمين."] };
  if (!m.subject.trim()) return { ok: false, reason: ["The subject is required.", "الموضوع مطلوب."] };
  adapter.insertDoc("Communication", { communication_type: "Communication", communication_medium: "Email", sent_or_received: "Sent", subject: m.subject, content: m.body, recipients: to.join(", "), reference_doctype: m.doctype, reference_name: m.name, communication_date: nowIso(), status: "Linked", delivery_status: providerConnected("email") ? "Sending" : "Not Sent" });
  return { ok: true, log: dispatch("email", { doctype: m.doctype, name: m.name, ...(m.company ? { company: m.company } : {}) }, { to, subject: m.subject, body: m.body }, `${m.subject} → ${to.join(", ")}`) };
}

/* ------------------------------------------------------------------ OCR (supplier invoices) ------------------------------------------------------------------ */
export interface OcrFields { supplierVat: string; invoiceNo: string; date: string; total: number | null; vat: number | null; supplier: string }
/** Preview extractor: reads the fields a Saudi tax invoice prints (VAT no., invoice no., date, totals) from its text. */
export function ocrExtract(text: string): OcrFields {
  const num = (re: RegExp) => { const m = text.match(re); return m ? Number(m[1]!.replace(/,/g, "")) : null; };
  const vat = text.match(/\b(3\d{13}3)\b/)?.[1] ?? "";
  const supplier = vat ? str(adapter.list("Supplier").find((s) => str(s["tax_id"]) === vat)?.name) : "";
  return {
    supplierVat: vat, supplier,
    invoiceNo: text.match(/(?:invoice\s*(?:no|number|#)\.?|رقم\s*الفاتورة)\s*[:#]?\s*([A-Za-z0-9\-/]+)/i)?.[1] ?? "",
    date: text.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? "",
    total: num(/(?:total\s*(?:incl(?:uding)?\.?\s*vat|amount\s*due)|الإجمالي\s*شامل)[^\d]*([\d,]+(?:\.\d+)?)/i) ?? num(/total[^\d]*([\d,]+(?:\.\d+)?)/i),
    // the VAT amount line, never the "VAT No." registration line
    vat: num(/(?:vat|ضريبة\s*القيمة\s*المضافة)(?!\s*(?:no\b|number|reg|#|رقم))\s*(?:amount|total|15\s*%|\(15%\))?[^\d\n]*([\d,]+(?:\.\d+)?)/i),
  };
}
/** OCR → a draft Purchase Invoice (nothing posted); logged so the server engine can re-read the original image once connected. */
export function ocrToDraft(text: string, company: string): { ok: true; fields: OcrFields; log: LogRow } | { ok: false; reason: Bi; fields: OcrFields } {
  const fields = ocrExtract(text);
  if (!fields.invoiceNo || fields.total === null) return { ok: false, fields, reason: ["Could not read the invoice number and total; check the text or attach a clearer image.", "تعذر قراءة رقم الفاتورة والإجمالي؛ راجع النص أو أرفق صورة أوضح."] };
  return { ok: true, fields, log: dispatch("ocr", { doctype: "Purchase Invoice", name: fields.invoiceNo, company }, fields, `${fields.supplier || fields.supplierVat || "?"} · ${fields.invoiceNo} · ${fields.total}`) };
}

/* ------------------------------------------------------------------ vendor support desk + live chat ------------------------------------------------------------------ */
const ISSUE_PRIORITY: Record<string, string> = { Low: "low", Medium: "normal", High: "high", Urgent: "urgent" };
/** Hand one support issue to the vendor support desk: subject, description, priority and contact are sent; the issue stays the record. */
export function escalateIssue(issue: Doc, user: string): { ok: true; log: LogRow } | { ok: false; reason: Bi } {
  const subject = str(issue["subject"]).trim();
  if (!subject) return { ok: false, reason: ["The issue needs a subject before it can be sent to DIGIT support.", "يحتاج الطلب إلى عنوان قبل إرساله إلى دعم ديجيت."] };
  if (str(issue["status"]) === "Closed") return { ok: false, reason: ["A closed issue is not sent; reopen it first.", "لا يُرسل الطلب المغلق؛ أعد فتحه أولًا."] };
  const payload = { ticket: issue.name, subject, description: str(issue["description"]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), priority: ISSUE_PRIORITY[str(issue["priority"])] ?? "normal",
    type: str(issue["issue_type"]), contact: str(issue["raised_by"]) || user, company: str(issue["company"]), opened: str(issue["opening_date"] ?? issue["creation"]) };
  return { ok: true, log: dispatch("support_desk", { doctype: "Issue", name: issue.name, company: str(issue["company"]) }, payload, subject) };
}
/** Ask for a person to chat with: the request is kept as a support issue (so it is never lost) and handed to the chat service. */
export function requestChat(m: { topic: string; message: string; user: string; company: string; phone?: string }): { ok: true; issue: Doc; log: LogRow } | { ok: false; reason: Bi } {
  const topic = m.topic.trim(); const message = m.message.trim();
  if (!topic || message.length < 5) return { ok: false, reason: ["Write a topic and a short message for the agent.", "اكتب موضوعًا ورسالة قصيرة للموظف."] };
  if (m.phone && !/^(\+?966|0)5\d{8}$/.test(m.phone.replace(/[\s-]/g, ""))) return { ok: false, reason: ["Enter a Saudi mobile number (05xxxxxxxx).", "أدخل رقم جوال سعوديًا (05xxxxxxxx)."] };
  const issue = adapter.insertDoc("Issue", { subject: `Chat: ${topic}`, description: m.phone ? `${message}\n\nMobile: ${m.phone}` : message, raised_by: m.user, status: "Open", priority: "Medium", company: m.company, opening_date: nowIso().slice(0, 10) });
  const log = dispatch("live_chat", { doctype: "Issue", name: issue.name, company: m.company }, { topic, message, contact: m.user, mobile: m.phone ?? "", issue: issue.name }, topic);
  return { ok: true, issue, log };
}

/* ------------------------------------------------------------------ cross-app defect hand-off (SH-045) ------------------------------------------------------------------ */
/** What a person saw wrong on one screen, with the context captured by the shared shell (never typed by the user). */
export interface ScreenDefect {
  app: string; appLabel: string; route: string; screenId?: string | undefined; rendererOwner?: string | undefined;
  area: "screen" | "shell"; lang: string; viewport: string; summary: string; detail: string; user: string; company: string;
}
/** Team that fixes it: the app that owns the screen, or DIGIT Enterprise for the shared shell (header, dock, menus, side panels). */
export function defectOwner(d: Pick<ScreenDefect, "area" | "app">): string {
  return d.area === "shell" || !d.app ? "digit_enterprise" : d.app;
}
export const DEFECT_MARK = "DIGIT screen report";
/** Record a screen problem as a support issue for its owning team; the issue keeps app, screen, route, language and screen size. */
export function raiseScreenDefect(d: ScreenDefect): { ok: true; issue: Doc; owner: string } | { ok: false; reason: Bi } {
  const summary = d.summary.trim();
  if (summary.length < 5) return { ok: false, reason: ["Describe the problem in a few words (at least 5 letters).", "صف المشكلة في كلمات قليلة (5 أحرف على الأقل)."] };
  const owner = defectOwner(d);
  const ctx = [`${DEFECT_MARK}`, `App: ${d.appLabel} (${d.app})`, `Screen: ${d.screenId || "not registered"}`, `Route: ${d.route}`, `Area: ${d.area}`, `Owner team: ${owner}`, `Renderer: ${d.rendererOwner || "shared shell"}`,
    `Language: ${d.lang}`, `Screen size: ${d.viewport}`, `Reported by: ${d.user}`];
  const issue = adapter.insertDoc("Issue", { subject: `[${d.appLabel}] ${summary}`.slice(0, 140), description: [d.detail.trim(), ctx.join("\n")].filter(Boolean).join("\n\n"),
    raised_by: d.user, status: "Open", priority: "Medium", company: d.company, opening_date: nowIso().slice(0, 10) });
  return { ok: true, issue, owner };
}
/** Screen reports of one owning team (or all), newest first. */
export function screenDefects(owner?: string): Doc[] {
  return adapter.list("Issue").filter((i) => str(i["description"]).includes(DEFECT_MARK) && (!owner || str(i["description"]).includes(`Owner team: ${owner}`)))
    .sort((a, b) => String(b["opening_date"] ?? "").localeCompare(String(a["opening_date"] ?? "")) || b.name.localeCompare(a.name));
}
