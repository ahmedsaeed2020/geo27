/**
 * Enterprise print frame (owner 2026-11-12 §C6, template T6): the one frame every document prints in — branding header
 * (logo, company name in Arabic and English, VAT number, CR, address, phone), a document title band, the print format's
 * own body, the ZATCA QR on tax invoices and a footer (bank details, terms, page x of y). Branding comes from the Core
 * "Digit Print Branding" record of the document's company (Administration → Print branding); choosing a Letter Head in
 * the print toolbar replaces the branding header with that letter head, as frappe does. Returns HTML only; nothing is written.
 */
import { renderSVG } from "uqr";
import { adapter, type Doc } from "./adapter";
import { CORE_DT } from "./coreShared/doctypes";
import { zatcaPrepare } from "./coreShared/providers";
import { sanitizeHtml } from "./jinja";
import { fmtDate } from "./format";
import { arabicMoneyInWords } from "./arabicWords";
import { moneyInWords } from "./formCalc";
import { translateTo, type Lang } from "@/i18n";
import { recordLabel } from "@/components/enterprise/kit/labels";

/** Print toolbar value that selects the company branding header (the default). */
export const BRAND_HEADER = "__brand";
export const TAX_QR_DOCTYPES = new Set(["Sales Invoice", "POS Invoice"]);

export interface Branding { company: string; nameAr: string; nameEn: string; logo: string; vat: string; cr: string; addressAr: string; addressEn: string; phone: string; email: string; website: string;
  bankName: string; accountName: string; iban: string; termsAr: string; termsEn: string; noteAr: string; noteEn: string }
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
/** Branding of a company: its Digit Print Branding record, falling back to the native Company fields. */
export function brandingFor(company: string): Branding {
  const b: Doc | undefined = company ? adapter.get(CORE_DT.printBranding, company) : undefined; const co: Doc | undefined = company ? adapter.get("Company", company) : undefined;
  const name = s(co?.["company_name"]) || company;
  return { company, nameAr: s(b?.["company_name_ar"]) || name, nameEn: s(b?.["company_name_en"]), logo: s(b?.["logo"]) || s(co?.["company_logo"]), vat: s(b?.["vat_number"]) || s(co?.["tax_id"]), cr: s(b?.["cr_number"]),
    addressAr: s(b?.["address_ar"]), addressEn: s(b?.["address_en"]), phone: s(b?.["phone"]) || s(co?.["phone_no"]), email: s(b?.["email"]) || s(co?.["email"]), website: s(b?.["website"]) || s(co?.["website"]),
    bankName: s(b?.["bank_name"]), accountName: s(b?.["account_name"]), iban: s(b?.["iban"]), termsAr: s(b?.["terms_ar"]), termsEn: s(b?.["terms_en"]), noteAr: s(b?.["footer_note_ar"]), noteEn: s(b?.["footer_note_en"]) };
}

type Bi = readonly [string, string];
/** Printed document titles (English, Arabic). */
export function printTitle(doctype: string, doc: Doc): Bi {
  const ret = !!Number(doc["is_return"] ?? 0);
  if (doctype === "Sales Invoice") return ret ? ["Tax Credit Note", "إشعار دائن ضريبي"] : ["Tax Invoice", "فاتورة ضريبية"];
  if (doctype === "POS Invoice") return ret ? ["Simplified Tax Credit Note", "إشعار دائن ضريبي مبسط"] : ["Simplified Tax Invoice", "فاتورة ضريبية مبسطة"];
  if (doctype === "Purchase Invoice") return ret ? ["Debit Note", "إشعار مدين"] : ["Purchase Invoice", "فاتورة مشتريات"];
  if (doctype === "Payment Entry") return doc["payment_type"] === "Receive" ? ["Receipt Voucher", "سند قبض"] : doc["payment_type"] === "Pay" ? ["Payment Voucher", "سند صرف"] : ["Internal Transfer", "تحويل داخلي"];
  if (doctype === "Journal Entry") return ["Journal Voucher", "قيد يومية"];
  if (doctype === "Delivery Note") return ret ? ["Sales Return", "مرتجع مبيعات"] : ["Delivery Note", "إشعار تسليم"];
  const T: Record<string, Bi> = { Quotation: ["Quotation", "عرض سعر"], "Sales Order": ["Sales Order", "أمر بيع"], "Purchase Order": ["Purchase Order", "أمر شراء"], "Purchase Receipt": ["Goods Receipt", "إيصال استلام"],
    "Material Request": ["Material Request", "طلب مواد"], "Supplier Quotation": ["Supplier Quotation", "عرض سعر مورد"], "Stock Entry": ["Stock Entry", "قيد مخزني"], "Request for Quotation": ["Request for Quotation", "طلب عرض سعر"] };
  return T[doctype] ?? APP_TITLES[doctype] ?? [doctype, translateTo(doctype, "ar")];
}
const APP_TITLES: Record<string, Bi> = {};
/** Apps name their printed document titles in both languages (e.g. Construction: "Client Certificate" / "شهادة دفعة"). */
export function registerPrintTitles(titles: Record<string, Bi>): void { Object.assign(APP_TITLES, titles); }
const ROLE_LABELS: Record<string, Bi> = {};
/** Apps name their roles for printed signature blocks (English, Arabic). */
export function registerPrintRoles(roles: Record<string, Bi>): void { Object.assign(ROLE_LABELS, roles); }
const DATE_FIELDS = ["posting_date", "transaction_date", "bill_date", "cert_date", "claim_date", "mb_date", "wo_date", "ce_date", "eot_date", "report_date", "attendance_date", "usage_date", "inspection_date", "assessment_date", "requested_on", "sent_on", "effective_date", "schedule_date", "date"];
const STATUS: Record<string, Bi> = { "0": ["Draft", "مسودة"], "1": ["Submitted", "معتمد"], "2": ["Cancelled", "ملغى"] };

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** Only a same-origin path, an https URL or an inline image may be a logo. */
export const safeLogo = (src: string) => (/^(?:\/[\w\-./]+|https:\/\/[\w\-./%?=&:]+|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+)$/.test(src) ? src : "");

export interface FrameInput { doctype: string; doc: Doc; lang: Lang; body: string;
  /** "brand" = company branding header; a Letter Head record = its content; null = no header */
  header: "brand" | Doc | null;
  /** false when the print format draws its own title (Jinja / builder formats) */
  titleBand: boolean;
  /** whether the DocType is submittable (a draft of a submittable document prints with a DRAFT watermark) */
  submittable?: boolean | undefined }

/** The document's own date: a known date field, else its first *_date / *_on date, else the day it was created. */
export function docDate(doc: Doc): string {
  const known = DATE_FIELDS.map((f) => s(doc[f])).find(Boolean); if (known) return known;
  const own = Object.entries(doc).find(([k, v]) => /(_date|_on)$/.test(k) && !/^(modified|creation)/.test(k) && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v));
  return own ? String(own[1]) : s(doc["creation"]).slice(0, 10);
}
/** Hijri (Umm al-Qura) date beside the Gregorian one, in the print language. */
export function hijriDate(d: string, lang: Lang): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(d)) return "";
  try { return new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-islamic-umalqura-nu-latn" : "en-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${d.slice(0, 10)}T12:00:00Z`)); } catch { return ""; }
}
/** workflow states (and statuses of documents without a workflow) that mean the document is approved / final */
const FINAL_STATES = new Set(["Approved", "Certified", "Partly Certified", "Agreed", "Active", "Completed", "Closed", "Issued", "Granted", "Partially Granted", "Invoiced", "Paid", "Acknowledged", "Answered", "Reviewed", "Confirmed", "Superseded", "Submitted", "Sent", "Won", "Lost", "Posted"]);
/** DRAFT on an unapproved document (a submittable draft, or a document whose own state is Draft), CANCELLED on a cancelled one. */
export function watermarkOf(doc: Doc, submittable: boolean | undefined): Bi | null {
  const ds = Number(doc.docstatus ?? 0); const ws = s(doc["workflow_state"]);
  if (ds === 2) return ["CANCELLED", "ملغى"];
  if (ds === 1) return null;
  if (submittable) return ws && FINAL_STATES.has(ws) && ws !== "Submitted" ? null : ["DRAFT", "مسودة"];
  return ws === "Draft" || (!ws && s(doc["status"]) === "Draft") ? ["DRAFT", "مسودة"] : null;
}
/** A workflow state in Arabic; "Submitted" on a document still waiting for approval is "submitted for approval", not the
 *  ERPNext docstatus word "معتمد" (approved). */
export const stateAr = (ws: string, doc: Doc) => (ws === "Submitted" && Number(doc.docstatus ?? 0) === 0 ? "مقدّم للاعتماد" : translateTo(ws, "ar"));
const markSvg = (b: Bi, ar: boolean) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="620" height="1100"><text x="310" y="520" text-anchor="middle" transform="rotate(-32 310 520)" font-family="Tahoma,Arial,sans-serif" font-size="110" font-weight="700" fill="rgba(192,57,43,0.10)"${ar ? ' direction="rtl"' : ""}>${ar ? b[1] : b[0]}</text></svg>`)}")`;

const PARTY: [string, Bi][] = [["customer", ["Customer", "العميل"]], ["supplier", ["Supplier", "المورد"]], ["subcontractor", ["Subcontractor", "مقاول الباطن"]], ["party", ["Party", "الطرف"]], ["employee", ["Employee", "الموظف"]]];
const CONTRACT: [string, Bi, string][] = [["contract", ["Contract", "العقد"], "Digit Client Contract"], ["work_order", ["Work order", "أمر العمل"], "Digit Subcontract Work Order"]];
const titleOf = (dt: string, v: string) => { const d = adapter.get(dt, v); return s(d?.["title"] ?? d?.["project_name"] ?? d?.["work_order_title"]) || v; };
/** Project, contract and party of the document by their names (never codes), for the title band. */
export function docFacts(doc: Doc, lang: Lang): [Bi, string][] {
  const out: [Bi, string][] = []; const tr = (v: string) => (lang === "ar" ? translateTo(v, "ar") : v);
  if (s(doc["project"])) out.push([["Project", "المشروع"], tr(recordLabel(s(doc["project"]), ["Project"]))]);
  for (const [f, l, dt] of CONTRACT) if (s(doc[f])) { out.push([l, tr(titleOf(dt, s(doc[f])))]); break; }
  for (const [f, l] of PARTY) { const v = s(doc[`${f}_name`]) || s(doc[f]); if (v) { out.push([l, tr(recordLabel(v, ["Customer", "Supplier", "Employee"]))]); break; } }
  return out;
}
/** The amount a document is worth (grand total, net payable, net certified …) for the amount in words. */
const AMOUNT_FIELDS = ["rounded_total", "grand_total", "net_payable", "net_certified", "net_amount", "this_claim", "paid_amount", "final_value", "total_amount", "requested_amount", "net_change", "total_original", "revised_value", "total_value", "contract_value", "accepted_value", "approved_amount", "quote_amount", "cost_impact", "est_selling", "total", "amount"];
export const docAmount = (doc: Doc) => { for (const f of AMOUNT_FIELDS) { const v = Number(doc[f]); if (Number.isFinite(v) && v !== 0) return Math.abs(v); } return 0; };
const GENERIC_ROLES = new Set(["Desk User", "Projects User", "Accounts User", "Purchase User", "Stock User", "Employee", "System Manager", "All", "Guest"]);
interface Sig { label: Bi; name: string; role: string; date: string }
/** Signatures from the document's workflow history (state, user, date) and its own approval fields; the preparer first. */
export function signaturesOf(doctype: string, doc: Doc, lang: Lang): Sig[] {
  const tr = (v: string) => (lang === "ar" ? translateTo(v, "ar") : v);
  const user = (u: string) => { const x = adapter.get("User", u); const roles = Array.isArray(x?.["roles"]) ? (x!["roles"] as Doc[]).map((r) => s(r["role"])).filter((r) => r && !GENERIC_ROLES.has(r)) : [];
    const r0 = roles.find((r) => ROLE_LABELS[r]) ?? roles[0];
    return { name: s(x?.["full_name"]) || recordLabel(u, ["Employee"]), role: r0 ? (ROLE_LABELS[r0] ? (lang === "ar" ? ROLE_LABELS[r0]![1] : ROLE_LABELS[r0]![0]) : tr(r0)) : "" }; };
  const out: Sig[] = []; const seen = new Set<string>();
  const push = (label: Bi, u: string, date: string) => { if (!u || u === "Administrator") return; const k = `${u}|${label[0]}`; if (seen.has(k)) return; seen.add(k); out.push({ label, ...user(u), date: date.slice(0, 10) }); };
  push(["Prepared by", "أعدّه"], s(doc["owner"]), s(doc["creation"]));
  const log = adapter.list("Comment").filter((c) => c["comment_type"] === "Workflow" && c["reference_doctype"] === doctype && c["reference_name"] === doc.name).sort((a, b) => s(a["creation"]).localeCompare(s(b["creation"])));
  for (const c of log) { const st = s(c["content"]); push([st, translateTo(st, "ar")], s(c["comment_email"]) || s(c["owner"]), s(c["creation"])); }
  for (const [u, d, l] of [["reviewed_by", "reviewed_on", ["Reviewed by", "راجعه"]], ["approved_by", "approved_on", ["Approved by", "اعتمده"]], ["decided_by", "decided_on", ["Decided by", "قرّره"]], ["verified_by", "verified_on", ["Verified by", "تحقق منه"]], ["digit_close_approved_by", "digit_close_approved_on", ["Closing approved by", "اعتمد الإغلاق"]]] as [string, string, Bi][])
    if (s(doc[u]).includes("@")) push(l, s(doc[u]), s(doc[d]));
  return out.slice(0, 4);
}

/** ZATCA phase-1 QR (seller, VAT number, time, total with VAT, VAT) as an inline SVG — submitted tax invoices only. */
export function taxQrSvg(doctype: string, doc: Doc): string {
  if (!TAX_QR_DOCTYPES.has(doctype) || Number(doc.docstatus) !== 1) return "";
  try { const q = zatcaPrepare(doc).qr; return q ? renderSVG(q, { border: 1 }) : ""; } catch { return ""; }
}

export function frameHtml({ doctype, doc, lang, body, header, titleBand, submittable }: FrameInput): string {
  const ar = lang === "ar"; const L = (b: Bi) => (ar ? b[1] : b[0]);
  const b = brandingFor(s(doc["company"]));
  const logo = safeLogo(b.logo);
  const arBlock = `<div class="pfx-co" dir="rtl" lang="ar"><div class="pfx-name">${esc(b.nameAr)}</div>${b.addressAr ? `<div class="pfx-addr">${esc(b.addressAr)}</div>` : ""}</div>`;
  const enBlock = b.nameEn || b.addressEn ? `<div class="pfx-co pfx-en" dir="ltr" lang="en"><div class="pfx-name">${esc(b.nameEn)}</div>${b.addressEn ? `<div class="pfx-addr">${esc(b.addressEn)}</div>` : ""}</div>` : `<div class="pfx-co pfx-en"></div>`;
  const mark = logo ? `<img class="pfx-logo" src="${esc(logo)}" alt="${esc(b.nameEn || b.nameAr)}"/>` : `<div class="pfx-mono">${esc((b.nameEn || b.nameAr).slice(0, 1))}</div>`;
  const ids = [[["VAT No.", "الرقم الضريبي"], b.vat], [["CR No.", "السجل التجاري"], b.cr], [["Phone", "الهاتف"], b.phone], [["Email", "البريد"], b.email]] as [Bi, string][];
  const idRow = ids.filter(([, v]) => v).map(([l, v]) => `<span><b>${esc(L(l))}</b> <bdi dir="ltr">${esc(v)}</bdi></span>`).join("");
  const head = header === "brand"
    ? `<header class="pfx-head" data-pf-header="brand"><div class="pfx-brand">${ar ? arBlock : enBlock}<div class="pfx-mark">${mark}</div>${ar ? enBlock : arBlock}</div>${idRow ? `<div class="pfx-ids">${idRow}</div>` : ""}</header>`
    : header ? `<header class="pfx-head pf-letterhead" data-pf-header="letterhead">${sanitizeHtml(String(header["content"] ?? ""))}</header>` : "";
  const title = printTitle(doctype, doc); const date = docDate(doc);
  const ws = s(doc["workflow_state"]);
  const st: Bi = ws ? [ws, stateAr(ws, doc)] : STATUS[String(Number(doc.docstatus ?? 0))] ?? STATUS["0"]!;
  const hijri = date ? hijriDate(date, lang) : "";
  const facts = docFacts(doc, lang).map(([l, v]) => `<span data-pf-fact><b>${esc(L(l))}</b> ${esc(v)}</span>`).join("");
  const qr = taxQrSvg(doctype, doc);
  // a tax invoice names the buyer's VAT number beside its own number and date (the buyer's Customer record)
  const custVat = TAX_QR_DOCTYPES.has(doctype) && s(doc["customer"]) ? s(adapter.get("Customer", s(doc["customer"]))?.["tax_id"]) || s(doc["tax_id"]) : "";
  const qrBox = qr ? `<figure class="pfx-qr" data-pf-qr>${qr}<figcaption>${esc(L(["ZATCA e-invoice QR", "رمز الفاتورة الإلكترونية — هيئة الزكاة والضريبة والجمارك"]))}</figcaption></figure>`
    : TAX_QR_DOCTYPES.has(doctype) ? `<div class="pfx-qr pfx-qr-wait" data-pf-qr-pending>${esc(L(["The ZATCA QR appears once the invoice is submitted.", "يظهر رمز هيئة الزكاة والضريبة بعد اعتماد الفاتورة."]))}</div>` : "";
  const band = titleBand ? `<section class="pfx-band" data-pf-title><div class="pfx-title"><h1>${esc(L(title))}</h1><div class="pfx-title-alt" lang="${ar ? "en" : "ar"}">${esc(ar ? title[0] : title[1])}</div>
    <div class="pfx-meta"><span><b>${esc(L(["No.", "الرقم"]))}</b> <bdi dir="ltr">${esc(doc.name)}</bdi></span>${date ? `<span><b>${esc(L(["Date", "التاريخ"]))}</b> <bdi dir="ltr">${esc(fmtDate(date))}</bdi>${hijri ? ` <span class="pfx-hijri" data-pf-hijri>(${esc(hijri)})</span>` : ""}</span>` : ""}${custVat ? `<span data-pf-customer-vat><b>${esc(L(["Customer VAT No.", "الرقم الضريبي للعميل"]))}</b> <bdi dir="ltr">${esc(custVat)}</bdi></span>` : ""}<span class="pfx-status" data-docstatus="${esc(doc.docstatus ?? 0)}">${esc(L(st))}</span></div>${facts ? `<div class="pfx-facts">${facts}</div>` : ""}</div>${qrBox}</section>`
    // a format with its own title still shows the Hijri date and status the band would carry
    : `${qrBox ? `<section class="pfx-band pfx-band-qr">${qrBox}</section>` : ""}${date || ws ? `<div class="pfx-strip" data-pf-strip>${date ? `<span><b>${esc(L(["Date", "التاريخ"]))}</b> <bdi dir="ltr">${esc(fmtDate(date))}</bdi>${hijri ? ` <span class="pfx-hijri" data-pf-hijri>(${esc(hijri)})</span>` : ""}</span>` : ""}<span class="pfx-status" data-docstatus="${esc(doc.docstatus ?? 0)}">${esc(L(st))}</span></div>` : ""}`;
  // amount in words (unless the format prints it) and the signature block from the workflow history
  const amt = /pf-words|data-pf-words/.test(body) ? 0 : docAmount(doc);
  const words = amt ? `<div class="pf-words pfx-words" data-pf-words><b>${esc(L(["Amount in words", "المبلغ كتابةً"]))}</b> ${esc(ar ? arabicMoneyInWords(amt) : moneyInWords(amt, s(doc["currency"]) || "SAR"))}</div>` : "";
  const sigs = signaturesOf(doctype, doc, lang); const ownSign = /dcp-sign|data-pf-sign/.test(body);
  const boxes = sigs.length ? sigs : ownSign ? [] : ([[["Prepared by", "أعدّه"]], [["Reviewed by", "راجعه"]], [["Approved by", "اعتمده"]]] as [Bi][]).map(([l]) => ({ label: l, name: "", role: "", date: "" }));
  const sign = boxes.length ? `<section class="pfx-sign" data-pf-signatures>${ownSign && sigs.length ? `<h5>${esc(L(["Approval record", "سجل الاعتماد"]))}</h5>` : ""}<div class="pfx-sign-row">${boxes.map((x) => `<div class="pfx-sig" data-pf-signer><div class="pfx-sig-l">${esc(L(x.label))}</div><div class="pfx-sig-n">${esc(x.name) || "&nbsp;"}</div><div class="pfx-sig-r">${esc(x.role) || "&nbsp;"}</div><div class="pfx-sig-line"></div><div class="pfx-sig-d"><bdi dir="ltr">${esc(x.date ? fmtDate(x.date) : "")}</bdi></div></div>`).join("")}</div></section>` : "";
  const wmark = watermarkOf(doc, submittable);
  const bank = b.bankName || b.iban ? `<div class="pfx-foot-col"><h5>${esc(L(["Bank details", "البيانات البنكية"]))}</h5>${b.bankName ? `<div>${esc(b.bankName)}</div>` : ""}${b.accountName ? `<div>${esc(b.accountName)}</div>` : ""}${b.iban ? `<div><b>IBAN</b> <bdi dir="ltr">${esc(b.iban)}</bdi></div>` : ""}</div>` : "";
  const terms = (ar ? b.termsAr : b.termsEn) || b.termsAr || b.termsEn;
  const termsCol = terms ? `<div class="pfx-foot-col pfx-terms"><h5>${esc(L(["Terms", "الشروط"]))}</h5><div>${esc(terms)}</div></div>` : "";
  const note = (ar ? b.noteAr : b.noteEn) || b.noteAr || b.noteEn;
  const page = `<div class="pfx-foot-col pfx-page">${note ? `<div class="pfx-note">${esc(note)}</div>` : ""}${b.website ? `<div dir="ltr">${esc(b.website)}</div>` : ""}<div class="pf-pageno" data-pf-pageno>${esc(L(["Page", "صفحة"]))} <b data-pf-page>1</b> ${esc(L(["of", "من"]))} <b data-pf-pages>1</b></div></div>`;
  const foot = `<footer class="pfx-foot" data-pf-footer>${bank}${termsCol}${page}</footer>`;
  return `<div class="pfx" data-pf-frame="T6"${wmark ? ` data-pf-mark="${esc(wmark[0])}" style='background-image:${markSvg(wmark, ar)}'` : ""}>${head}${band}<div class="pfx-body">${body}${words}</div>${sign}${foot}</div>`;
}

/** Frame styles (white sheet, brand header with mint rule, emphasised names and titles); printed sheets use fixed brand colours. */
export const FRAME_CSS = `
.pfx{display:flex;flex-direction:column;min-height:100%}
.pfx-head{border-bottom:3px solid #34D399;padding-bottom:10px;margin-bottom:14px}
.pfx-brand{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px}
.pfx-co{min-width:0}.pfx-brand>.pfx-co:last-child{text-align:end}
.pfx-name{font-size:17px;font-weight:700;color:#064E3B;line-height:1.3}.pfx-addr{color:#5B6B63;font-size:11.5px;margin-top:2px}
.pfx-mark{display:flex;justify-content:center}.pfx-logo{max-height:56px;max-width:180px;object-fit:contain}
.pfx-mono{width:52px;height:52px;border-radius:14px;background:#064E3B;color:#fff;display:grid;place-items:center;font-size:24px;font-weight:700}
.pfx-ids{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:8px;font-size:11.5px;color:#0B1F17}.pfx-ids b{color:#5B6B63;font-weight:600}
.pfx-band{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;background:#F4F3EE;border:1px solid #E2E8E4;border-radius:12px;padding:12px 16px;margin-bottom:16px}
.pfx-band-qr{justify-content:flex-end;background:none;border:0;padding:0}
.pfx-title h1{margin:0;font-size:22px;font-weight:800;color:#064E3B;letter-spacing:-.01em}.pfx-title-alt{color:#5B6B63;font-size:12px;font-weight:600}
.pfx-meta{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:8px;font-size:12px}.pfx-meta b{color:#5B6B63;font-weight:600}
.pfx-status{border-radius:999px;padding:1px 10px;font-weight:600;background:#E6F6EE;color:#0A8754}.pfx-status[data-docstatus="0"]{background:#FBF3E2;color:#8A5A00}.pfx-status[data-docstatus="2"]{background:#FBE9E7;color:#C0392B}
.pfx-qr{margin:0;display:flex;flex-direction:column;align-items:center;gap:4px;width:118px;flex:none}.pfx-qr svg{width:110px;height:110px;background:#fff;border-radius:6px}
.pfx-qr figcaption{font-size:9px;color:#5B6B63;text-align:center;line-height:1.3}.pfx-qr-wait{font-size:10px;color:#8A5A00;text-align:center;border:1px dashed #C08A1E;border-radius:8px;padding:8px}
.pfx-body{flex:1 1 auto}
.pfx-body .pf-table th{background:#F4F3EE;color:#0B1F17;border-color:#E2E8E4}.pfx-body .pf-table td{border-color:#E2E8E4}
.pfx-body .pf-grand td{border-top-color:#064E3B;color:#064E3B}.pfx-body .pf-section h4{color:#064E3B;border-bottom-color:#E2E8E4}
.pfx-foot{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:18px;border-top:2px solid #34D399;margin-top:24px;padding-top:10px;font-size:11px;color:#0B1F17;break-inside:avoid}
.pfx-foot h5{margin:0 0 4px;font-size:11px;color:#064E3B}.pfx-terms div{color:#5B6B63}.pfx-page{text-align:end;color:#5B6B63}.pfx-note{color:#064E3B;font-weight:600}
.pfx[data-pf-mark]{background-repeat:repeat-y;background-position:center 140px;background-size:620px 1100px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pfx-facts{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:6px;font-size:12px}.pfx-facts b{color:#5B6B63;font-weight:600}.pfx-hijri{color:#5B6B63;font-size:11px}
.pfx-strip{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;justify-content:flex-end;font-size:12px;margin:-6px 0 10px}.pfx-strip b{color:#5B6B63;font-weight:600}
.pfx-words{margin-top:10px;border-radius:8px;background:#F4F3EE;border:1px solid #E2E8E4}.pfx-words b{color:#064E3B;margin-inline-end:6px}
.pfx-sign{margin-top:22px;break-inside:avoid}.pfx-sign h5{margin:0 0 6px;font-size:11px;color:#064E3B}.pfx-sign-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px}
.pfx-sig{border:1px solid #E2E8E4;border-radius:10px;padding:8px 10px;font-size:11px;min-height:96px;display:flex;flex-direction:column;gap:2px}.pfx-sig-l{color:#5B6B63;font-weight:600}
.pfx-sig-n{font-weight:700;color:#0B1F17;font-size:12px}.pfx-sig-r{color:#5B6B63}.pfx-sig-line{margin-top:auto;border-bottom:1px solid #0B1F17;height:22px}.pfx-sig-d{color:#5B6B63;font-size:10px}
.pfx-body thead{display:table-header-group}.pfx-body tfoot{display:table-footer-group}.pfx-body tr{break-inside:avoid;page-break-inside:avoid}
@media print{.pf-pageno{display:none}.pfx-band{-webkit-print-color-adjust:exact;print-color-adjust:exact}.pfx-mono,.pfx-status{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;
/** Browser print page box with "page x of y" in the margin (the sheet itself shows the count on screen and in PDF). */
export const pageCss = (lang: Lang) => `@page{size:A4;margin:12mm 12mm 16mm;@bottom-center{content:"${lang === "ar" ? "صفحة " : "Page "}" counter(page) "${lang === "ar" ? " من " : " of "}" counter(pages);font-size:9pt;color:#5B6B63}}`;
