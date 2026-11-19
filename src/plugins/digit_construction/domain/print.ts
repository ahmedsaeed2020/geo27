/**
 * EXT-03 controlled print outputs — templates and read side.
 *
 * Bilingual (Arabic + English) Jinja print formats for the construction documents that leave the company:
 * BOQ, client claim (interim payment application), client certificate (interim payment certificate) and
 * subcontractor bill (running bill), plus the department 06 cost-control records (budget, budget revision, cost
 * allocation; DEC-086 / DEC-125). The same Jinja exports to Frappe as Print Format fixtures (manifest
 * `print_formats`). Templates use only the safe subset of src/plugins/jinja.ts (doc fields, get_formatted, for/if),
 * so the virtual preview and Frappe render the same markup. Signature blocks are blank: signing authority is an owner
 * policy (unknown), never filled in by the app.
 *
 * A template version is a fingerprint of its markup, so an issued copy records exactly which template produced it.
 * Finality follows the document's own state: only submitted documents in an approved state print as final; anything
 * else prints with a draft band. Cancelled documents cannot be issued. Nothing here writes records (see
 * domain/printActions.ts).
 */
import type { Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { renderJinja } from "@/plugins/jinja";
import type { PrintFormat } from "@/plugins/types";

const CSS = `.dcp{font-family:"Noto Naskh Arabic","Segoe UI",Tahoma,sans-serif;font-size:12px;line-height:1.45;color:#111}
.dcp h1{font-size:18px;margin:0}.dcp h1 small{display:block;font-size:12px;font-weight:normal;color:#555}
.dcp-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:10px}
.dcp-id{font-family:monospace;font-size:13px;text-align:end}.dcp-id small{display:block;font-family:inherit;color:#555}
.dcp table{width:100%;border-collapse:collapse;margin-bottom:10px}.dcp th,.dcp td{border:1px solid #bbb;padding:4px 6px;vertical-align:top;text-align:start}
.dcp th{background:#f2f2f2;font-weight:600;white-space:nowrap}.dcp th small,.dcp td small{display:block;font-weight:normal;color:#555}
.dcp-meta th{width:18%}.dcp-num{text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap}
.dcp-tot{width:60%!important;margin-inline-start:auto}.dcp-tot th{width:60%}.dcp-tot tr.dcp-strong td,.dcp-tot tr.dcp-strong th{font-weight:700;border-top:2px solid #333}
.dcp-note{font-size:11px;color:#444}.dcp-sign{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:28px}
.dcp-sign div{border-top:1px solid #333;padding-top:4px;min-height:42px;font-size:11px}.dcp-sign small{display:block;color:#555}.dcp-note span{display:block}
.dcp-band{border:2px dashed #b45309;color:#b45309;text-align:center;font-weight:700;padding:4px;margin-bottom:8px;letter-spacing:.05em}
.dcp-foot{margin-top:14px;border-top:1px solid #bbb;padding-top:4px;font-size:10px;color:#555;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}`;

const th = (ar: string, en: string) => `<th>${ar}<small dir="ltr">${en}</small></th>`;
const meta = (rows: [string, string, string][]) => `<table class="dcp-meta">${rows.reduce<string[]>((acc, r, i) => { if (i % 2 === 0) acc.push(""); acc[acc.length - 1] += `${th(r[0], r[1])}<td>${r[2]}</td>`; return acc; }, []).map((r) => `<tr>${r}</tr>`).join("")}</table>`;
const head = (ar: string, en: string) => `<header class="dcp-h"><div><h1>${ar}<small dir="ltr">${en}</small></h1><div>{{ doc.company }}</div></div><div class="dcp-id" dir="ltr">{{ doc.name }}<small>Document No. · رقم المستند</small></div></header>`;
const sign = (a: [string, string], b: [string, string], c: [string, string]) => `<footer class="dcp-sign">${[a, b, c].map(([x, y]) => `<div>${x}<small dir="ltr">${y}</small></div>`).join("")}</footer>`;
const tot = (rows: [string, string, string, boolean?][]) => `<table class="dcp-tot">${rows.map(([ar, en, f, strong]) => `<tr${strong ? ' class="dcp-strong"' : ""}>${th(ar, en)}<td class="dcp-num">{{ doc.get_formatted("${f}") }}</td></tr>`).join("")}</table>`;
const VAT_NOTE = `<p class="dcp-note">المبالغ قبل ضريبة القيمة المضافة؛ تُطبَّق الضريبة على الفاتورة الأصلية في النظام.<br><span dir="ltr">Amounts are before VAT; tax is applied on the native invoice.</span></p>`;

/**
 * Sheet 16 BUILD documents (owner work list MISS-*): one bilingual record print each, from the same helpers. `$` marks a
 * money/number field printed with get_formatted; a field list ends with the record's own note when it has one.
 */
type PF = [ar: string, en: string, field: string];
function recordPrint(dt: string, ar: string, en: string, fields: PF[], note: string | null, signs: [[string, string], [string, string], [string, string]]): PrintFormat {
  const val = (f: string) => (f.startsWith("$") ? `{{ doc.get_formatted("${f.slice(1)}") }}` : `{{ doc.${f} }}`);
  return {
    name: `${dt} (Bilingual)`, doc_type: dt, print_format_type: "Jinja", css: CSS,
    html: `<div class="dcp">${head(ar, en)}
${meta(fields.map(([a, e, f]) => [a, e, val(f)] as [string, string, string]))}
${note ? `<p class="dcp-note">{{ doc.${note} }}</p>` : ""}
${sign(...signs)}</div>`,
  };
}
function SHEET16_PRINTS(): PrintFormat[] {
  return [
    recordPrint("Digit Work Permit", "تصريح عمل", "Work Permit", [["المشروع", "Project", "project"], ["نوع التصريح", "Permit type", "permit_type"], ["الموقع", "Location", "location"], ["الحالة", "Status", "status"],
      ["صالح من", "Valid from", "valid_from"], ["صالح حتى", "Valid to", "valid_to"], ["المُصدِر", "Issuer", "issuer"], ["المستلم", "Receiver", "receiver"]], null,
      [["المستلم", "Receiver"], ["مسؤول السلامة", "Safety officer"], ["مدير المشروع", "Project manager"]]),
    recordPrint("Digit Site Induction", "تعريف بالموقع", "Site Induction", [["المشروع", "Project", "project"], ["الشخص", "Person", "person"], ["الموظف", "Employee", "employee"], ["الجهة", "Company", "company_name"],
      ["تاريخ التعريف", "Inducted on", "inducted_on"], ["صالح حتى", "Valid until", "valid_until"], ["المعرِّف", "Inductor", "inductor"], ["الاعتماد", "Approval", "approval_status"]], null,
      [["المتدرب", "Inductee"], ["المعرِّف", "Inductor"], ["مدير المشروع", "Project manager"]]),
    recordPrint("Digit Maintenance Order", "أمر صيانة", "Maintenance Order", [["المعدة", "Machinery", "machinery"], ["نوع الأمر", "Order type", "order_type"], ["الحالة", "Status", "status"], ["الاعتماد", "Approval", "approval_status"],
      ["تاريخ التنفيذ", "Work date", "work_date"], ["قراءة العداد", "Meter reading", "$meter_at"], ["ساعات التوقف", "Downtime hours", "$downtime_hours"], ["التكلفة", "Cost", "$cost"],
      ["العداد التالي", "Next due meter", "$next_due_meter"], ["الاستحقاق التالي", "Next due date", "next_due_date"], ["المنفّذ", "Employee or crew", "employee_or_crew"]], null,
      [["الفني", "Technician"], ["مهندس الموقع", "Site engineer"], ["مدير المشروع", "Project manager"]]),
    recordPrint("Digit Commissioning Test", "اختبار تشغيل", "Commissioning Test", [["المشروع", "Project", "project"], ["النظام", "System", "system"], ["الأصل", "Asset", "asset"], ["نوع الاختبار", "Test type", "test_type"],
      ["المنطقة", "Zone", "zone"], ["التاريخ المخطط", "Planned date", "planned_date"], ["تاريخ الاختبار", "Test date", "test_date"], ["النتيجة", "Result", "result"],
      ["جهة الشهادة", "Witness", "witness_party"], ["الشاهد", "Witness name", "witness"], ["الشهادة", "Certificate", "certificate"], ["اجتاز / الكل", "Passed / total", "passed_count"]], "result_note",
      [["المنفّذ", "Performed by"], ["الشاهد", "Witness"], ["مدير المشروع", "Project manager"]]),
    recordPrint("Digit Handover Asset", "أصل تسليم", "Handover Asset", [["المشروع", "Project", "project"], ["رقم الأصل", "Asset tag", "asset_tag"], ["النظام", "System", "system"], ["الموقع", "Location", "location"],
      ["الصانع", "Manufacturer", "manufacturer"], ["الطراز", "Model", "model"], ["الرقم التسلسلي", "Serial no.", "serial_no"], ["الضمان حتى", "Warranty until", "warranty_until"],
      ["الحالة", "Status", "status"], ["اكتمال البيانات", "Completeness", "$completeness_pct"]], null,
      [["أعدّه", "Prepared by"], ["راجعه", "Reviewed by"], ["استلمه المالك", "Received by owner"]]),
    recordPrint("Digit WIP Adjustment", "تسوية أعمال تحت التنفيذ", "WIP Adjustment", [["المشروع", "Project", "project"], ["الفترة", "Period", "period"], ["المفوتر", "Billed", "$billed"], ["فواتير غير مرحّلة", "Unposted billings", "$unposted_billings"],
      ["الإيراد المكتسب", "Earned revenue", "$earned_revenue"], ["تجاوز الإيراد", "Earned override", "$earned_override"], ["زيادة / نقص الفوترة", "Over / under billing", "$over_under"], ["حالة الترحيل", "Posting status", "posted_unposted_status"]], null,
      [["أعدّه المحاسب", "Prepared by accountant"], ["راجعه", "Reviewed by"], ["اعتمده", "Approved by"]]),
    recordPrint("Digit Job Snapshot", "لقطة المشروع", "Job Snapshot", [["المشروع", "Project", "project"], ["رمز اللقطة", "Snapshot code", "snapshot_code"], ["حتى تاريخ", "As of", "as_of"], ["فترة الترحيل", "Posting period", "posting_period"],
      ["التكلفة الفعلية", "Actual cost", "$cost_source_state"], ["أنشأها", "Created by", "created_by"]], null,
      [["أعدّه", "Prepared by"], ["راجعه", "Reviewed by"], ["اعتمده", "Approved by"]]),
    recordPrint("Digit Override Log", "سجل تجاوز", "Override Log", [["نوع المستند", "Document type", "ref_doctype"], ["المستند", "Document", "ref_name"], ["القاعدة", "Rule", "rule"], ["المستخدم", "User", "user"],
      ["الفترة", "Fiscal period", "fiscal_period"], ["السبب", "Reason", "reason"]], "message",
      [["المستخدم", "User"], ["المراجع", "Reviewer"], ["المدير", "Director"]]),
  ];
}

export const PRINT_FORMATS: PrintFormat[] = [
  {
    name: "Digit BOQ (Bilingual)", doc_type: "Digit BOQ", print_format_type: "Jinja", css: CSS,
    html: `<div class="dcp">${head("جدول الكميات", "Bill of Quantities")}
${meta([["العنوان", "Title", "{{ doc.title }}"], ["المشروع", "Project", "{{ doc.project }}"], ["المراجعة", "Revision", "{{ doc.revision }}"], ["الحالة", "Status", "{{ doc.workflow_state }}"], ["اعتمد بواسطة", "Approved by", "{{ doc.approved_by }}"], ["تاريخ الاعتماد", "Approved on", "{{ doc.get_formatted(\"approved_on\") }}"]])}
<table><thead><tr>${th("#", "No.")}${th("الرمز", "Code")}${th("الوصف", "Description")}${th("الوحدة", "Unit")}${th("الكمية", "Qty")}${th("السعر", "Rate")}${th("المبلغ", "Amount")}</tr></thead>
<tbody>{% for row in doc.items %}<tr><td>{{ row.idx }}</td><td>{{ row.code }}</td><td>{{ row.description }}</td><td>{{ row.uom }}</td><td class="dcp-num">{{ row.qty }}</td><td class="dcp-num">{{ row.get_formatted("rate") }}</td><td class="dcp-num">{{ row.get_formatted("amount") }}</td></tr>{% endfor %}</tbody></table>
${tot([["المبلغ الإجمالي", "Total amount", "total_amount", true]])}
${VAT_NOTE}
${sign(["أعدّه", "Prepared by"], ["راجعه", "Reviewed by"], ["اعتمده", "Approved by"])}</div>`,
  },
  {
    name: "Digit Client Claim (Bilingual)", doc_type: "Digit Client Claim", print_format_type: "Jinja", css: CSS,
    html: `<div class="dcp">${head("طلب دفعة مرحلية", "Interim Payment Application")}
${meta([["العقد", "Contract", "{{ doc.contract }}"], ["المشروع", "Project", "{{ doc.project }}"], ["العميل", "Customer", "{{ doc.customer }}"], ["رقم المطالبة", "Claim No.", "{{ doc.claim_no }}"], ["بداية الفترة", "Period start", "{{ doc.get_formatted(\"period_start\") }}"], ["نهاية الفترة", "Period end", "{{ doc.get_formatted(\"period_end\") }}"], ["تاريخ المطالبة", "Claim date", "{{ doc.get_formatted(\"claim_date\") }}"], ["الحالة", "Status", "{{ doc.workflow_state }}"]])}
<table><thead><tr>${th("#", "No.")}${th("البند", "Line")}${th("الوصف", "Description")}${th("كمية العقد", "Contract qty")}${th("السابق", "Previous")}${th("التراكمي", "Cumulative")}${th("الفترة", "This period")}${th("السعر", "Rate")}${th("المبلغ", "Amount")}</tr></thead>
<tbody>{% for row in doc.lines %}<tr><td>{{ row.idx }}</td><td>{{ row.sov_line_key }}</td><td>{{ row.description }}</td><td class="dcp-num">{{ row.contract_qty }}</td><td class="dcp-num">{{ row.previous_qty }}</td><td class="dcp-num">{{ row.cumulative_qty }}</td><td class="dcp-num">{{ row.this_period_qty }}</td><td class="dcp-num">{{ row.get_formatted("rate") }}</td><td class="dcp-num">{{ row.get_formatted("amount") }}</td></tr>{% endfor %}</tbody></table>
${tot([["الإجمالي حتى تاريخه", "Gross to date", "gross_to_date"], ["المطالب به سابقاً", "Previously claimed", "previous_claimed"], ["قيمة المطالبة", "This claim", "this_claim", true]])}
${VAT_NOTE}
${sign(["قدّمه المقاول", "Submitted by contractor"], ["استلمه الاستشاري", "Received by consultant"], ["ملاحظات", "Remarks"])}</div>`,
  },
  {
    name: "Digit Client Certificate (Bilingual)", doc_type: "Digit Client Certificate", print_format_type: "Jinja", css: CSS,
    html: `<div class="dcp">${head("شهادة دفعة مرحلية", "Interim Payment Certificate")}
${meta([["مطالبة العميل", "Client claim", "{{ doc.claim }}"], ["العقد", "Contract", "{{ doc.contract }}"], ["المشروع", "Project", "{{ doc.project }}"], ["العميل", "Customer", "{{ doc.customer }}"], ["تاريخ الشهادة", "Certificate date", "{{ doc.get_formatted(\"cert_date\") }}"], ["مرجع الاستشاري", "Consultant reference", "{{ doc.external_ref }}"], ["المراجع", "Reviewer", "{{ doc.reviewer }}"], ["الحالة", "Status", "{{ doc.workflow_state }}"]])}
<table><thead><tr>${th("#", "No.")}${th("البند", "Line")}${th("الوصف", "Description")}${th("المطالب بها", "Claimed")}${th("المقبولة", "Accepted")}${th("المرفوضة", "Rejected")}${th("السعر", "Rate")}${th("المبلغ المعتمد", "Certified amount")}</tr></thead>
<tbody>{% for row in doc.lines %}<tr><td>{{ row.idx }}</td><td>{{ row.sov_line_key }}</td><td>{{ row.description }}{% if row.reason %}<small>{{ row.reason }}</small>{% endif %}</td><td class="dcp-num">{{ row.claimed_qty }}</td><td class="dcp-num">{{ row.accepted_qty }}</td><td class="dcp-num">{{ row.rejected_qty }}</td><td class="dcp-num">{{ row.get_formatted("rate") }}</td><td class="dcp-num">{{ row.get_formatted("amount") }}</td></tr>{% endfor %}</tbody></table>
${tot([["إجمالي هذه الشهادة", "Gross this certificate", "gross_this"], ["الإجمالي السابق", "Gross previous", "gross_previous"], ["الإجمالي التراكمي", "Gross cumulative", "gross_cumulative"], ["استرداد الدفعة المقدمة", "Advance recovery", "advance_recovery"], ["المحتجزات", "Retention", "retention"], ["خصومات أخرى", "Other deductions", "other_deductions"], ["صافي المعتمد (قبل الضريبة)", "Net certified (before tax)", "net_certified", true]])}
{% if doc.other_deductions_note %}<p class="dcp-note">{{ doc.other_deductions_note }}</p>{% endif %}
${VAT_NOTE}
${sign(["أعدّه مهندس الكميات", "Prepared by QS"], ["راجعه", "Reviewed by"], ["اعتمده", "Certified by"])}</div>`,
  },
  {
    name: "Digit Subcontractor Bill (Bilingual)", doc_type: "Digit Subcontractor Bill", print_format_type: "Jinja", css: CSS,
    html: `<div class="dcp">${head("مستخلص مقاول باطن", "Subcontractor Running Bill")}
${meta([["أمر العمل", "Work order", "{{ doc.work_order }}"], ["مقاول الباطن", "Subcontractor", "{{ doc.subcontractor }}"], ["المشروع", "Project", "{{ doc.project }}"], ["رقم المستخلص", "Running bill no.", "{{ doc.ra_no }}"], ["تاريخ المستخلص", "Bill date", "{{ doc.get_formatted(\"bill_date\") }}"], ["دفتر القياس", "Measurement book", "{{ doc.measurement_book }}"], ["فاتورة المورّد", "Supplier invoice", "{{ doc.supplier_invoice_no }}"], ["الحالة", "Status", "{{ doc.workflow_state }}"]])}
<table><thead><tr>${th("#", "No.")}${th("البند", "Line")}${th("نطاق العمل", "Scope")}${th("الوحدة", "Unit")}${th("السابق", "Previous")}${th("الفترة", "This period")}${th("التراكمي", "Cumulative")}${th("السعر", "Rate")}${th("المبلغ", "Amount")}</tr></thead>
<tbody>{% for row in doc.lines %}<tr><td>{{ row.idx }}</td><td>{{ row.wo_line_key }}</td><td>{{ row.scope }}</td><td>{{ row.uom }}</td><td class="dcp-num">{{ row.previous_qty }}</td><td class="dcp-num">{{ row.this_period_qty }}</td><td class="dcp-num">{{ row.cumulative_qty }}</td><td class="dcp-num">{{ row.get_formatted("rate") }}</td><td class="dcp-num">{{ row.get_formatted("amount") }}</td></tr>{% endfor %}</tbody></table>
${tot([["المبلغ الإجمالي", "Gross amount", "gross_amount"], ["المحتجزات", "Retention", "retention_amount"], ["استرداد الدفعة المقدمة", "Advance recovery", "advance_recovery"], ["خصومات أخرى", "Other deductions", "other_deductions"], ["الصافي (قبل الضريبة)", "Net amount (before tax)", "net_amount", true]])}
${VAT_NOTE}
${sign(["أعدّه مقاول الباطن", "Submitted by subcontractor"], ["راجعه مهندس الكميات", "Checked by QS"], ["اعتمده مدير المشروع", "Approved by project manager"])}</div>`,
  },
  // department 06 (DEC-086 bilingual with a draft band, DEC-125 preparer + approver + approval date; signatures stay blank — no electronic signing is claimed)
  {
    name: "Digit Project Cost Budget (Bilingual)", doc_type: "Digit Project Cost Budget", print_format_type: "Jinja", css: CSS,
    html: `<div class="dcp">${head("موازنة تكلفة المشروع", "Project Cost Budget")}
${meta([["المشروع", "Project", "{{ doc.project }}"], ["الإصدار", "Version", "{{ doc.version }}"], ["تاريخ السريان", "Effective date", "{{ doc.get_formatted(\"effective_date\") }}"], ["الحالة", "Status", "{{ doc.workflow_state }}"], ["اعتمد بواسطة", "Approved by", "{{ doc.approved_by }}"], ["تاريخ الاعتماد", "Approved on", "{{ doc.get_formatted(\"approved_on\") }}"]])}
<table><thead><tr>${th("#", "No.")}${th("رمز التكلفة", "Cost code")}${th("الوصف", "Description")}${th("الفئة", "Category")}${th("المبلغ الأصلي", "Original amount")}</tr></thead>
<tbody>{% for row in doc.lines %}<tr><td>{{ row.idx }}</td><td>{{ row.cost_code }}</td><td>{{ row.description }}</td><td>{{ row.category }}</td><td class="dcp-num">{{ row.get_formatted("original_amount") }}</td></tr>{% endfor %}</tbody></table>
${tot([["الموازنة الأصلية", "Original budget", "total_original", true]])}
${VAT_NOTE}
${sign(["أعدّه مهندس الكميات", "Prepared by QS"], ["راجعه مدير المشروع", "Reviewed by project manager"], ["اعتمده", "Approved by"])}</div>`,
  },
  {
    name: "Digit Budget Revision (Bilingual)", doc_type: "Digit Budget Revision", print_format_type: "Jinja", css: CSS,
    html: `<div class="dcp">${head("تعديل موازنة", "Budget Revision")}
${meta([["الموازنة", "Budget", "{{ doc.budget }}"], ["المشروع", "Project", "{{ doc.project }}"], ["الأمر التغييري", "Linked variation", "{{ doc.linked_variation }}"], ["الحالة", "Status", "{{ doc.workflow_state }}"], ["اعتمد بواسطة", "Approved by", "{{ doc.approved_by }}"], ["تاريخ الاعتماد", "Approved on", "{{ doc.get_formatted(\"approved_on\") }}"]])}
<p class="dcp-note">{{ doc.reason }}</p>
<table><thead><tr>${th("#", "No.")}${th("بند الموازنة", "Budget line")}${th("رمز التكلفة", "Cost code")}${th("مبلغ التغيير", "Change amount")}${th("السبب", "Reason")}</tr></thead>
<tbody>{% for row in doc.deltas %}<tr><td>{{ row.idx }}</td><td>{{ row.line_key }}</td><td>{{ row.cost_code }}</td><td class="dcp-num">{{ row.get_formatted("delta_amount") }}</td><td>{{ row.reason }}</td></tr>{% endfor %}</tbody></table>
${tot([["صافي التغيير", "Net change", "net_change", true]])}
${sign(["أعدّه مهندس الكميات", "Prepared by QS"], ["راجعه مدير المشروع", "Reviewed by project manager"], ["اعتمده المدير", "Approved by director"])}</div>`,
  },
  {
    name: "Digit Cost Allocation (Bilingual)", doc_type: "Digit Cost Allocation", print_format_type: "Jinja", css: CSS,
    html: `<div class="dcp">${head("إسناد تكلفة", "Cost Allocation")}
${meta([["المشروع", "Project", "{{ doc.project }}"], ["الموازنة", "Budget", "{{ doc.budget }}"], ["نوع المصدر", "Source type", "{{ doc.source_doctype }}"], ["مستند المصدر", "Source document", "{{ doc.source_name }}"], ["سطر المصدر", "Source row", "{{ doc.source_row }}"], ["رمز تكلفة المصدر", "Source cost code", "{{ doc.source_code }}"], ["بند الموازنة", "Budget line", "{{ doc.budget_line }}"], ["رمز التكلفة المخصص", "Allocated cost code", "{{ doc.cost_code }}"], ["خصّص بواسطة", "Allocated by", "{{ doc.allocated_by }}"], ["تاريخ الاعتماد", "Approved on", "{{ doc.get_formatted(\"modified\") }}"]])}
{% if doc.allocation_splits %}<table><thead><tr>${th("#", "No.")}${th("بند الموازنة", "Budget line")}${th("رمز التكلفة", "Cost code")}${th("النسبة", "Percent")}${th("المبلغ", "Amount")}</tr></thead>
<tbody>{% for row in doc.allocation_splits %}<tr><td>{{ row.idx }}</td><td>{{ row.budget_line }}</td><td>{{ row.cost_code }}</td><td class="dcp-num">{{ row.percent }}</td><td class="dcp-num">{{ row.get_formatted("amount") }}</td></tr>{% endfor %}</tbody></table>{% endif %}
${tot([["المبلغ عند التخصيص", "Amount at allocation", "amount", true]])}
<p class="dcp-note">{{ doc.reason }}</p>
${sign(["أعدّه", "Prepared by"], ["راجعه", "Reviewed by"], ["اعتمده", "Approved by"])}</div>`,
  },
  ...SHEET16_PRINTS(),
];

export const PRINTABLE_DOCTYPES = [...new Set(PRINT_FORMATS.map((p) => p.doc_type))];
export const formatsFor = (doctype: string) => PRINT_FORMATS.filter((p) => p.doc_type === doctype);
export const formatByName = (name: string) => PRINT_FORMATS.find((p) => p.name === name);
/** Languages a template supports. These templates carry both languages on every label, so they are bilingual only. */
export const templateLanguages = (_pf: PrintFormat): string[] => ["Bilingual"];

/** FNV-1a fingerprint (8 hex). */
export function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
/** Template version = fingerprint of its markup and style, so any template edit changes the version. */
export const templateVersion = (pf: PrintFormat) => fnv(`${pf.html}\n${pf.css ?? ""}`);

const FINAL_STATES: Record<string, string[]> = {
  "Digit BOQ": ["Approved"],
  "Digit Client Claim": ["Submitted", "Certified", "Partly Certified"],
  "Digit Client Certificate": ["Confirmed", "Invoiced"],
  "Digit Subcontractor Bill": ["Approved", "Invoiced"],
  "Digit Project Cost Budget": ["Approved", "Superseded"],
  "Digit Budget Revision": ["Approved"],
  "Digit Cost Allocation": [""], // no workflow: a submitted allocation is final
};
/** Sheet 16 documents are not submittable: they print as final when their own state field holds an approved value
 * (an empty field name = an immutable record, always final). */
const FINAL_BY_FIELD: Record<string, [string, string[]]> = {
  "Digit Work Permit": ["status", ["Issued", "Closed"]], "Digit Site Induction": ["approval_status", ["Approved"]], "Digit Maintenance Order": ["approval_status", ["Approved"]],
  "Digit Commissioning Test": ["result", ["Pass", "Fail"]], "Digit Handover Asset": ["status", ["Reviewed"]], "Digit WIP Adjustment": ["posted_unposted_status", ["Posted"]],
  "Digit Job Snapshot": ["", []], "Digit Override Log": ["", []],
};
export type Finality = "Final" | "Draft copy";
/** Final only when submitted and in an approved state of that document; cancelled → not printable as a controlled copy. */
export function finality(doctype: string, d: Doc): { finality: Finality; blocked?: [string, string] } {
  const ds = Number(d["docstatus"] ?? 0);
  if (ds === 2) return { finality: "Draft copy", blocked: ["Cancelled documents cannot be issued as controlled copies", "لا يمكن إصدار نسخة مضبوطة من مستند ملغى"] };
  const st = String(d["workflow_state"] ?? "");
  if (doctype === "Digit Client Claim" && st === "Rejected") return { finality: "Draft copy", blocked: ["A rejected claim cannot be issued", "لا يمكن إصدار مطالبة مرفوضة"] };
  const byField = FINAL_BY_FIELD[doctype];
  if (byField) return { finality: !byField[0] || byField[1].includes(String(d[byField[0]] ?? "")) ? "Final" : "Draft copy" };
  return { finality: ds === 1 && (FINAL_STATES[doctype] ?? []).includes(st) ? "Final" : "Draft copy" };
}
export interface Rendered { html: string; finality: Finality; template_version: string; source_modified: string; source_state: string }
/**
 * Render the document with the template. Draft copies carry a band in the markup itself; every output carries a
 * lineage footer (template version, source revision, as-of), so the issued snapshot is self-describing.
 */
export function renderPrint(pf: PrintFormat, d: Doc, asOf: string): Rendered {
  const f = finality(pf.doc_type, d);
  const body = renderJinja(pf.html, { doc: d, __fields: fieldsOf(pf.doc_type) });
  const band = f.finality === "Final" ? "" : `<div class="dcp-band">مسودة — غير نهائية · DRAFT — NOT FINAL</div>`;
  const src = String(d["modified"] ?? "");
  const foot = `<div class="dcp-foot"><span>نسخة مضبوطة · <bdi>Controlled copy · ${esc(pf.name)} · v${templateVersion(pf)}</bdi></span><span>مراجعة المصدر · <bdi>Source revision ${esc(src)}</bdi></span><span>حتى تاريخ · <bdi>As of ${esc(asOf)}</bdi></span></div>`;
  const html = `<style>${pf.css ?? ""}</style>${band}${body}${foot}`;
  return { html, finality: f.finality, template_version: templateVersion(pf), source_modified: src, source_state: String(d["workflow_state"] ?? "") };
}
/** fieldname → { fieldtype, options } of the DocType and its child tables, so get_formatted formats like Frappe (Currency, Date, Float). */
function fieldsOf(doctype: string): Record<string, { fieldtype: string; options?: string | undefined }> {
  const out: Record<string, { fieldtype: string; options?: string | undefined }> = {};
  const add = (dt: string, depth: number) => {
    const m = cachedMeta(dt); if (!m) return;
    for (const f of m.fields) {
      if (!f.fieldname) continue;
      if (f.fieldtype === "Table" && f.options && depth === 0) add(String(f.options), 1);
      else if (!(f.fieldname in out)) out[f.fieldname] = { fieldtype: f.fieldtype, options: f.options ? String(f.options) : undefined };
    }
  };
  add(doctype, 0);
  return out;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** SHA-256 hex of the snapshot (Web Crypto; available in the browser and in the test runtime). */
export async function sha256(s: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Snapshot markup shown back to users: same sanitising as the Jinja renderer (no scripts, handlers or javascript: URLs). */
export const sanitizeSnapshot = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/javascript:/gi, "");

const IMMUTABLE = ["source_doctype", "source_name", "project", "company", "print_format", "template_version", "language", "finality", "source_state", "source_docstatus", "source_modified", "as_of", "generated_at", "content_hash", "copy_reason", "html_snapshot"];
const VOIDERS = ["System Manager", "Digit Director"];
/**
 * Validation hook for Digit Print Artifact. Create: readable source, template of that source type at its current
 * version, source not cancelled/rejected, snapshot and SHA-256 present, status Issued; project/company copied from the
 * source. Update: lineage is immutable; the only change is Issued → Void with a reason, by the issuer or a
 * director / System Manager. Deleting is not permitted by the DocType permissions.
 */
export function checkArtifact(doc: Doc, before: Doc | undefined, user: string, ctx: { source?: Doc | undefined; canRead: boolean; roles: string[] }): { doc: Doc; errors: string[] } {
  const e: string[] = [];
  if (!before) {
    const pf = formatByName(String(doc["print_format"] ?? ""));
    if (!ctx.source) e.push(`Source ${String(doc["source_doctype"] ?? "")} ${String(doc["source_name"] ?? "")} not found`);
    else if (!ctx.canRead) e.push("You cannot read the source document");
    if (!pf) e.push(`Unknown template ${String(doc["print_format"] ?? "")}`);
    else if (pf.doc_type !== doc["source_doctype"]) e.push(`Template ${pf.name} is for ${pf.doc_type}, not ${String(doc["source_doctype"] ?? "")}`);
    else if (doc["template_version"] !== templateVersion(pf)) e.push("The template changed since the preview; preview again");
    if (ctx.source) { const b = finality(String(doc["source_doctype"]), ctx.source).blocked; if (b) e.push(b[0]); }
    if (!String(doc["html_snapshot"] ?? "").trim()) e.push("The issued copy is empty");
    if (!/^[0-9a-f]{64}$/.test(String(doc["content_hash"] ?? ""))) e.push("Content hash must be a SHA-256 hex digest");
    if ((doc["status"] ?? "Issued") !== "Issued") e.push("A new copy is always Issued");
    const s: Record<string, unknown> = ctx.source ?? {};
    return { doc: { ...doc, status: "Issued", language: "Bilingual", project: s["project"] ?? doc["project"] ?? "", company: s["company"] ?? doc["company"] ?? "" }, errors: e };
  }
  const changed = Object.keys({ ...before, ...doc }).filter((k) => !META_KEYS.has(k) && JSON.stringify(doc[k] ?? null) !== JSON.stringify(before[k] ?? null));
  const was = String(before["status"] ?? "Issued"), now = String(doc["status"] ?? "Issued");
  if (was === "Void") return { doc, errors: changed.length ? ["A void copy cannot change"] : [] };
  const locked = changed.find((k) => IMMUTABLE.includes(k));
  if (locked) e.push(`${locked} of an issued copy cannot change`);
  if (now === "Void") {
    if (!String(doc["void_reason"] ?? "").trim()) e.push("A reason is required to void a copy");
    const allowed = user === "Administrator" || user === String(before["owner"] ?? "") || ctx.roles.some((r) => VOIDERS.includes(r));
    if (!allowed) e.push("Only the issuer, a Digit Director or a System Manager can void a copy");
    return { doc: { ...doc, voided_by: user, voided_on: new Date().toISOString() }, errors: e };
  }
  if (now !== "Issued") e.push("Status can only change from Issued to Void");
  else if (changed.some((k) => VOID_KEYS.includes(k))) e.push("Void details are set only when voiding");
  return { doc, errors: e };
}
const META_KEYS = new Set(["modified", "modified_by", "_version", "_comments", "_assign", "_liked_by", "_user_tags"]);
const VOID_KEYS = ["void_reason", "voided_by", "voided_on"];
