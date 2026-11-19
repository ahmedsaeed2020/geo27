/**
 * DIGIT shared Core supplier invoice capture (Part B: CF-01 invoice capture & three-way matching, CF-20 e-document → PO match).
 * An incoming supplier invoice — a ZATCA UBL 2.1 e-invoice (XML) or the text of a scanned / PDF invoice — is read into its
 * fields and lines, the supplier's open purchase orders are ranked against it (order reference, amount, lines), and a draft
 * Purchase Invoice is prepared from the chosen order's lines through the shared document API, so the three-way match,
 * "do not pay" and every submit rule apply as for a typed invoice. Nothing is posted. The hand-over is logged on the
 * inbound-documents (or OCR) provider, which Administration connects to the real mailbox / OCR service.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { dispatch, ocrExtract, type LogRow } from "./providers";
import { newVoucher, threeWayMatch, type MatchResult } from "./finance";

export type Bi = [string, string];
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc | undefined, f = "items") => (Array.isArray(d?.[f]) ? (d![f] as Doc[]) : []);

export interface CapturedLine { description: string; itemCode: string; qty: number; rate: number; amount: number }
export interface Captured { source: "ubl" | "text"; supplierVat: string; supplier: string; supplierName: string; invoiceNo: string; date: string; currency: string; net: number | null; vat: number | null; total: number | null; orderRef: string; lines: CapturedLine[] }

/* ------------------------------------------------------------------ reading ------------------------------------------------------------------ */
const tag = (xml: string, path: string): string => { const m = xml.match(new RegExp(`<(?:\\w+:)?${path}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${path}>`)); return m ? m[1]!.trim() : ""; };
const block = (xml: string, name: string): string[] => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "g"))].map((m) => m[1]!);
const unxml = (v: string) => v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
/** ZATCA UBL 2.1 tax invoice: header, supplier VAT, order reference, monetary totals and invoice lines. */
export function parseUbl(xml: string): Captured | null {
  if (!/<(?:\w+:)?Invoice\b/.test(xml)) return null;
  const head = xml.replace(/<(?:\w+:)?InvoiceLine\b[\s\S]*?<\/(?:\w+:)?InvoiceLine>/g, "");
  const supplierParty = block(xml, "AccountingSupplierParty")[0] ?? "";
  const vat = (block(supplierParty, "PartyTaxScheme").map((b) => tag(b, "CompanyID"))[0] ?? "").trim();
  const supplierName = unxml(tag(block(supplierParty, "PartyLegalEntity")[0] ?? "", "RegistrationName") || tag(supplierParty, "Name"));
  const totals = block(xml, "LegalMonetaryTotal")[0] ?? "";
  const num = (v: string) => (v === "" ? null : n(v));
  const lines: CapturedLine[] = block(xml, "InvoiceLine").map((l) => {
    const item = block(l, "Item")[0] ?? ""; const qty = n(tag(l, "InvoicedQuantity")) || 1; const amount = n(tag(l, "LineExtensionAmount"));
    const rate = n(tag(block(l, "Price")[0] ?? "", "PriceAmount")) || (qty ? r2(amount / qty) : 0);
    return { description: unxml(tag(item, "Name")), itemCode: unxml(tag(block(item, "SellersItemIdentification")[0] ?? "", "ID") || tag(block(item, "BuyersItemIdentification")[0] ?? "", "ID")), qty, rate, amount: amount || r2(qty * rate) };
  });
  const taxTotal = block(head, "TaxTotal").map((b) => n(tag(b, "TaxAmount"))).find((x) => x > 0) ?? null;
  return { source: "ubl", supplierVat: vat, supplier: supplierFor(vat, supplierName), supplierName, invoiceNo: unxml(tag(head, "ID")), date: tag(head, "IssueDate"), currency: tag(head, "DocumentCurrencyCode") || "SAR",
    net: num(tag(totals, "TaxExclusiveAmount")), vat: taxTotal, total: num(tag(totals, "TaxInclusiveAmount")) ?? num(tag(totals, "PayableAmount")), orderRef: unxml(tag(block(head, "OrderReference")[0] ?? "", "ID")), lines };
}
function supplierFor(vat: string, name = ""): string {
  const sup = adapter.list("Supplier"); const byVat = vat ? sup.find((x) => s(x["tax_id"]) === vat) : undefined; if (byVat) return byVat.name;
  const nm = name.trim().toLowerCase(); return nm ? sup.find((x) => s(x["supplier_name"]).toLowerCase() === nm || x.name.toLowerCase() === nm)?.name ?? "" : "";
}
/** Lines of a scanned invoice's text: "<code or name> <qty> x <rate> [= amount]". */
function textLines(text: string): CapturedLine[] {
  const out: CapturedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\s*(.+?)\s+(\d+(?:\.\d+)?)\s*(?:x|×|\*)\s*([\d,]+(?:\.\d+)?)(?:\s*=\s*([\d,]+(?:\.\d+)?))?\s*$/i); if (!m) continue;
    const desc = m[1]!.trim(); const qty = n(m[2]); const rate = n(m[3]!.replace(/,/g, "")); const it = adapter.get("Item", desc) ?? adapter.list("Item").find((i) => s(i["item_name"]).toLowerCase() === desc.toLowerCase());
    out.push({ description: desc, itemCode: it?.name ?? "", qty, rate, amount: m[4] ? n(m[4].replace(/,/g, "")) : r2(qty * rate) });
  }
  return out;
}
/** Read an incoming invoice: UBL XML when it is one, else the text a scanner / PDF gives. */
export function captureInvoice(input: string): Captured {
  const ubl = input.trim().startsWith("<") ? parseUbl(input) : null; if (ubl) return ubl;
  const f = ocrExtract(input); const sup = adapter.get("Supplier", f.supplier);
  return { source: "text", supplierVat: f.supplierVat, supplier: f.supplier, supplierName: s(sup?.["supplier_name"]) || f.supplier, invoiceNo: f.invoiceNo, date: f.date, currency: "SAR", net: f.total !== null && f.vat !== null ? r2(f.total - f.vat) : null,
    vat: f.vat, total: f.total, orderRef: input.match(/(?:P\.?O\.?|purchase order|order\s*(?:no|ref)|أمر\s*الشراء)\s*[:#]?\s*([A-Za-z0-9\-/]+)/i)?.[1] ?? "", lines: textLines(input) };
}

/* ------------------------------------------------------------------ order discovery ------------------------------------------------------------------ */
export interface PoMatchLine { line: CapturedLine; poItem?: Doc }
export interface PoCandidate { po: Doc; score: number; reasons: Bi[]; lines: PoMatchLine[]; open: number }
const openAmount = (po: Doc) => r2(n(po["base_grand_total"] ?? po["grand_total"]) * (1 - Math.min(100, n(po["per_billed"])) / 100));
/** Child-row identity: the row name, or parent + idx where stored rows carry no name (preview demo rows). */
const rid = (parent: Doc, r: Doc) => s(r.name) || `${parent.name}:${s(r["idx"])}`;
const lineFor = (po: Doc, l: CapturedLine, used: Set<string>) => rows(po).find((r) => !used.has(rid(po, r)) && ((l.itemCode && s(r["item_code"]) === l.itemCode) || (!!l.description && (s(r["item_name"]).toLowerCase() === l.description.toLowerCase() || s(r["description"]).toLowerCase().includes(l.description.toLowerCase())))));
/** The supplier's open purchase orders ranked against the invoice (order reference, amount, matching lines, dates). */
export function poCandidates(c: Captured, company: string): PoCandidate[] {
  const pos = adapter.list("Purchase Order").filter((p) => n(p.docstatus) === 1 && s(p["company"]) === company && !["Closed", "Completed", "On Hold"].includes(s(p["status"])) && n(p["per_billed"]) < 100 && (!c.supplier || s(p["supplier"]) === c.supplier));
  return pos.map((po) => {
    const reasons: Bi[] = []; let score = 0; const used = new Set<string>();
    if (c.orderRef && (po.name === c.orderRef || s(po["po_no"] ?? "") === c.orderRef || po.name.endsWith(c.orderRef))) { score += 50; reasons.push(["Order reference matches", "مرجع الأمر مطابق"]); }
    const open = openAmount(po); const amt = c.net ?? (c.total !== null ? c.total / 1.15 : null);
    if (amt !== null && open > 0 && Math.abs(open - (c.total ?? 0)) / open <= 0.02 || (amt !== null && open > 0 && Math.abs(n(po["base_net_total"] ?? po["net_total"]) - amt) / Math.max(1, amt) <= 0.02)) { score += 25; reasons.push(["Amount matches the open order", "المبلغ يطابق الأمر المفتوح"]); }
    const lines = c.lines.map((l) => { const poItem = lineFor(po, l, used); if (poItem) used.add(rid(po, poItem)); return { line: l, ...(poItem ? { poItem } : {}) }; });
    const hit = lines.filter((x) => x.poItem).length;
    if (c.lines.length && hit) { score += Math.round((20 * hit) / c.lines.length); reasons.push([`${hit} of ${c.lines.length} lines found on the order`, `${hit} من ${c.lines.length} سطور موجودة في الأمر`]); }
    if (c.date && s(po["transaction_date"]) && s(po["transaction_date"]) <= c.date) score += 5;
    return { po, score, reasons, lines, open };
  }).filter((x) => x.score > 0 || !c.orderRef).sort((a, b) => b.score - a.score || s(b.po["transaction_date"]).localeCompare(s(a.po["transaction_date"]))).slice(0, 6);
}

/** A sample supplier e-invoice for the preview (no supplier mailbox is connected): a ZATCA UBL 2.1 tax invoice for the
 *  oldest open purchase order of the company — its supplier, order reference and lines at the order rates with 15% VAT —
 *  so the reading, order matching and three-way match can be tried on demo data. Empty when no order is open. */
export function sampleInvoice(company: string, today = new Date().toISOString().slice(0, 10)): string {
  const po = adapter.list("Purchase Order").filter((p) => n(p.docstatus) === 1 && s(p["company"]) === company && !["Closed", "Completed", "On Hold"].includes(s(p["status"])) && n(p["per_billed"]) < 100 && rows(p).length)
    .sort((a, b) => s(a["transaction_date"]).localeCompare(s(b["transaction_date"])) || a.name.localeCompare(b.name))[0];
  if (!po) return "";
  const sup = adapter.get("Supplier", s(po["supplier"])); const x = (v: unknown) => s(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = rows(po).map((r, i) => { const qty = n(r["qty"]) - n(r["billed_qty"] ?? 0) || n(r["qty"]); const rate = n(r["rate"]); return { i: i + 1, code: s(r["item_code"]), name: s(r["item_name"]) || s(r["item_code"]), qty, rate, amount: r2(qty * rate) }; });
  const net = r2(lines.reduce((t, l) => t + l.amount, 0)); const vat = r2(net * 0.15);
  const no = `INV-${today.slice(0, 4)}-${String(1000 + (po.name.length * 37) % 900)}`;
  return [`<?xml version="1.0" encoding="UTF-8"?>`, `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`,
    `  <cbc:ID>${no}</cbc:ID>`, `  <cbc:IssueDate>${today}</cbc:IssueDate>`, `  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>`, `  <cac:OrderReference><cbc:ID>${x(po.name)}</cbc:ID></cac:OrderReference>`,
    `  <cac:AccountingSupplierParty><cac:Party><cac:PartyTaxScheme><cbc:CompanyID>${x(sup?.["tax_id"])}</cbc:CompanyID></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>${x(sup?.["supplier_name"] ?? po["supplier"])}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>`,
    `  <cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${vat.toFixed(2)}</cbc:TaxAmount></cac:TaxTotal>`,
    `  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount currencyID="SAR">${net.toFixed(2)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="SAR">${r2(net + vat).toFixed(2)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="SAR">${r2(net + vat).toFixed(2)}</cbc:PayableAmount></cac:LegalMonetaryTotal>`,
    ...lines.map((l) => `  <cac:InvoiceLine><cbc:ID>${l.i}</cbc:ID><cbc:InvoicedQuantity unitCode="PCE">${l.qty}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="SAR">${l.amount.toFixed(2)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${x(l.name)}</cbc:Name><cac:SellersItemIdentification><cbc:ID>${x(l.code)}</cbc:ID></cac:SellersItemIdentification></cac:Item><cac:Price><cbc:PriceAmount currencyID="SAR">${l.rate.toFixed(2)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`),
    `</Invoice>`].join("\n");
}

/* ------------------------------------------------------------------ draft ------------------------------------------------------------------ */
const receiptLine = (po: Doc, poItem: Doc) => {
  for (const pr of adapter.list("Purchase Receipt").filter((p) => n(p.docstatus) === 1)) {
    const r = rows(pr).find((x) => (poItem.name ? s(x["purchase_order_item"]) === poItem.name : s(x["purchase_order"]) === po.name && s(x["item_code"]) === s(poItem["item_code"])));
    if (r) return { pr: pr.name, row: r };
  }
  return null;
};
/** Prepare the draft Purchase Invoice from the chosen order's lines with the invoice's quantities and rates; the three-way match is shown at once. */
export function draftFromCapture(c: Captured, poName: string, company: string, user = currentUser()): { ok: true; name: string; match: MatchResult; log: LogRow } | { ok: false; reason: Bi } {
  const po = adapter.get("Purchase Order", poName); if (!po || n(po.docstatus) !== 1) return { ok: false, reason: ["Choose an open purchase order.", "اختر أمر شراء مفتوحًا."] };
  if (!c.invoiceNo) return { ok: false, reason: ["The supplier invoice number could not be read.", "تعذر قراءة رقم فاتورة المورد."] };
  const supplier = s(po["supplier"]);
  const dup = adapter.list("Purchase Invoice").find((p) => n(p.docstatus) !== 2 && s(p["supplier"]) === supplier && s(p["bill_no"]) === c.invoiceNo);
  if (dup) return { ok: false, reason: [`Supplier Invoice No exists in Purchase Invoice ${dup.name}`, `رقم فاتورة المورد مسجل في ${dup.name}`] };
  const used = new Set<string>(); const missing: string[] = [];
  const items = (c.lines.length ? c.lines : rows(po).map((r) => ({ description: s(r["item_name"]), itemCode: s(r["item_code"]), qty: r2(n(r["qty"]) - n(r["billed_qty"] ?? 0)) || n(r["qty"]), rate: n(r["rate"]), amount: 0 }))).map((l, i) => {
    const poItem = lineFor(po, l, used); if (!poItem) { missing.push(l.description || l.itemCode); return null; } used.add(rid(po, poItem)); const rec = receiptLine(po, poItem);
    const qty = l.qty || n(poItem["qty"]); const rate = l.rate || n(poItem["rate"]);
    return { idx: i + 1, item_code: poItem["item_code"], item_name: poItem["item_name"], description: poItem["description"] ?? poItem["item_name"], qty, rate, amount: r2(qty * rate), base_rate: rate, base_amount: r2(qty * rate), net_amount: r2(qty * rate), base_net_amount: r2(qty * rate),
      uom: poItem["uom"] ?? "Nos", stock_uom: poItem["stock_uom"] ?? poItem["uom"] ?? "Nos", conversion_factor: n(poItem["conversion_factor"]) || 1, warehouse: poItem["warehouse"] ?? "", expense_account: poItem["expense_account"] ?? "", cost_center: poItem["cost_center"] ?? "",
      purchase_order: po.name, ...(poItem.name ? { po_detail: poItem.name } : {}), ...(rec ? { purchase_receipt: rec.pr, ...(rec.row.name ? { pr_detail: rec.row.name } : {}) } : {}) };
  });
  if (missing.length) return { ok: false, reason: [`These invoice lines are not on ${po.name}: ${missing.join(", ")}. Choose another order or correct the lines.`, `هذه السطور غير موجودة في ${po.name}: ${missing.join("، ")}. اختر أمرًا آخر أو صحّح السطور.`] };
  const lines = items.filter(Boolean) as Record<string, unknown>[]; const net = r2(lines.reduce((a, l) => a + n(l["amount"]), 0));
  const r = newVoucher("Purchase Invoice", { company, supplier, bill_no: c.invoiceNo, bill_date: c.date || undefined, posting_date: c.date || new Date().toISOString().slice(0, 10), currency: po["currency"] ?? "SAR", conversion_rate: n(po["conversion_rate"]) || 1,
    credit_to: adapter.get("Company", company)?.["default_payable_account"] ?? "", taxes_and_charges: po["taxes_and_charges"] ?? "", taxes: rows(po, "taxes").map((t, i) => ({ ...t, idx: i + 1, name: undefined, parent: undefined })),
    items: lines, total: net, net_total: net, base_net_total: net, remarks: `Captured from ${c.source === "ubl" ? "e-invoice" : "scanned invoice"} ${c.invoiceNo}` }, { user });
  if (r.errors.length || !r.name) return { ok: false, reason: [r.errors.join("; "), r.errors.join("؛ ")] };
  const log = dispatch(c.source === "ubl" ? "einvoice_inbound" : "ocr", { doctype: "Purchase Invoice", name: r.name, company }, c, `${c.supplierName || supplier} · ${c.invoiceNo} → ${po.name}`);
  return { ok: true, name: r.name, match: threeWayMatch(adapter.get("Purchase Invoice", r.name)!), log };
}

/* ------------------------------------------------------------------ recent captures ------------------------------------------------------------------ */
export interface RecentCapture { log: string; invoice: Doc; invoiceNo: string; supplierName: string; order: string; source: "ubl" | "text"; when: string; match: MatchResult }
/** Supplier invoices read by capture (inbound e-invoice / OCR hand-over log rows on a Purchase Invoice) of one company, newest
 *  first, each with its live three-way match — the "recent captured invoices" of the capture screen. */
export function recentCaptures(company: string, limit = 12): RecentCapture[] {
  return adapter.list("Digit Integration Log").filter((l) => (l["engine"] === "einvoice_inbound" || l["engine"] === "ocr") && l["reference_doctype"] === "Purchase Invoice" && (!company || s(l["company"]) === company))
    .flatMap((l) => {
      const pi = adapter.get("Purchase Invoice", s(l["reference_name"])); if (!pi || n(pi.docstatus) === 2) return [];
      let p: Record<string, unknown> = {}; try { p = JSON.parse(s(l["payload"]) || "{}"); } catch { /* keep empty */ }
      const order = s(p["orderRef"]) || s(rows(pi).find((x) => x["purchase_order"])?.["purchase_order"]);
      return [{ log: l.name, invoice: pi, invoiceNo: s(pi["bill_no"]) || s(p["invoiceNo"]) || pi.name, supplierName: s(p["supplierName"]) || s(adapter.get("Supplier", s(pi["supplier"]))?.["supplier_name"]) || s(pi["supplier"]),
        order, source: (s(p["source"]) === "text" || l["engine"] === "ocr" ? "text" : "ubl") as "ubl" | "text", when: s(l["last_attempt"]), match: threeWayMatch(pi) }];
    })
    .sort((a, b) => b.when.localeCompare(a.when) || b.log.localeCompare(a.log)).slice(0, limit);
}
