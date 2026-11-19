/**
 * DIGIT HR prints (owner brief 2026-11-15 §2; skill: employment contract, amendment, offer letter, salary certificate,
 * salary definition letter, experience certificate, payslip, payroll register, end-of-service settlement, leave approval,
 * warning letter, clearance, bank letter, GOSI and WPS files).
 *
 * Bilingual Jinja formats drawn inside the shared Enterprise print frame (letterhead, Hijri + Gregorian date, status
 * watermark, page numbers); they use only the safe Jinja subset (doc fields, frappe.get_list with filters (permission-checked), get_doc,
 * frappe.utils.fmt_money / formatdate / money_in_words), so the preview and the Frappe export render the same markup.
 * Signature lines are blank: who signs is the company's own policy, never filled in here. Nothing here writes records.
 */
import type { PrintFormat } from "@/plugins/types";

const CSS = `.dhp{font-family:"Noto Naskh Arabic","Segoe UI",Tahoma,sans-serif;font-size:12px;line-height:1.55;color:#111}
.dhp h1{font-size:18px;margin:0}.dhp h1 small{display:block;font-size:12px;font-weight:normal;color:#555}
.dhp-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:2px solid #0B3D2E;padding-bottom:8px;margin-bottom:10px}
.dhp-id{font-family:monospace;font-size:13px;text-align:end}.dhp-id small{display:block;font-family:inherit;color:#555}
.dhp table{width:100%;border-collapse:collapse;margin-bottom:10px}.dhp th,.dhp td{border:1px solid #c9d3cf;padding:4px 6px;vertical-align:top;text-align:start}
.dhp thead{display:table-header-group}.dhp tr{page-break-inside:avoid}
.dhp th{background:#EEF5F1;font-weight:600;white-space:nowrap}.dhp th small,.dhp td small{display:block;font-weight:normal;color:#555}
.dhp-meta th{width:18%}.dhp-num{text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap}
.dhp-tot{width:60%!important;margin-inline-start:auto}.dhp-tot th{width:60%}.dhp-strong td,.dhp-strong th{font-weight:700;border-top:2px solid #0B3D2E}
.dhp-two{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:8px 0}.dhp-two>div{border:1px solid #c9d3cf;border-radius:6px;padding:8px 10px}
.dhp-two [dir=ltr]{text-align:left}.dhp-p{margin:6px 0}.dhp-to{font-weight:600;margin:4px 0 8px}
.dhp-note{font-size:11px;color:#444}.dhp-sign{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:28px}
.dhp-sign div{border-top:1px solid #333;padding-top:4px;min-height:42px;font-size:11px}.dhp-sign small{display:block;color:#555}
.dhp-words{border:1px dashed #0B3D2E;border-radius:6px;padding:4px 8px;margin:6px 0 10px}`;

const th = (ar: string, en: string) => `<th>${ar}<small dir="ltr">${en}</small></th>`;
const meta = (rows: [string, string, string][]) => `<table class="dhp-meta">${rows.reduce<string[]>((acc, r, i) => { if (i % 2 === 0) acc.push(""); acc[acc.length - 1] += `${th(r[0], r[1])}<td>${r[2]}</td>`; return acc; }, []).map((r) => `<tr>${r}</tr>`).join("")}</table>`;
const head = (ar: string, en: string) => `<header class="dhp-h"><div><h1>${ar}<small dir="ltr">${en}</small></h1><div>{{ doc.company }}</div></div><div class="dhp-id" dir="ltr">{{ doc.name }}<small>Document No. · رقم المستند</small></div></header>`;
const sign = (a: [string, string], b: [string, string], c: [string, string]) => `<footer class="dhp-sign" data-pf-sign>${[a, b, c].map(([x, y]) => `<div>${x}<small dir="ltr">${y}</small></div>`).join("")}</footer>`;
const two = (ar: string, en: string) => `<div class="dhp-two"><div dir="rtl" lang="ar">${ar}</div><div dir="ltr" lang="en">${en}</div></div>`;
/** An identifier cell (employee no.) keeps the code: the zero-width space stops the print's code-to-name relabel. */
const code = (expr: string) => `<bdi dir="ltr">{{ ${expr} }}&#8203;</bdi>`;
const money = (expr: string) => `{{ frappe.utils.fmt_money(${expr}) }}`;
const date = (expr: string) => `{{ frappe.utils.formatdate(${expr}) }}`;
const words = (expr: string) => `<div class="dhp-words pf-words" data-pf-words><b>المبلغ كتابةً · Amount in words</b> {{ frappe.utils.money_in_words(${expr}) }}</div>`;
/** The employee's latest submitted payslip (the salary the letters state). */
const LATEST_SLIP = `{% set sl = frappe.get_list("Salary Slip", filters={"employee": doc.name, "docstatus": 1}, fields=["name", "gross_pay", "net_pay", "end_date"], order_by="end_date desc", limit=1) %}{% set s0 = sl | first %}`;
const SLIP_LINES = `{% if s0 %}{% set s = frappe.get_doc("Salary Slip", s0.name) %}<table><thead><tr>${th("البند", "Component")}${th("المبلغ الشهري", "Monthly amount")}</tr></thead><tbody>{% for e in s.earnings %}<tr><td>{{ _(e.salary_component) }}</td><td class="dhp-num">${money("e.amount")}</td></tr>{% endfor %}<tr class="dhp-strong"><th>إجمالي الراتب<small dir="ltr">Gross salary</small></th><td class="dhp-num">${money("s.gross_pay")}</td></tr></tbody></table>${words("s.gross_pay")}{% else %}<p class="dhp-note">لا توجد قسيمة راتب معتمدة لهذا الموظف بعد. · No submitted payslip on file for this employee yet.</p>{% endif %}`;
const EMP_FACTS = meta([["الموظف", "Employee", "{{ doc.employee_name }}"], ["الرقم الوظيفي", "Employee No.", code("doc.name")], ["المسمى الوظيفي", "Designation", "{{ _(doc.designation) }}"], ["القسم", "Department", "{{ _(doc.department) }}"], ["تاريخ الالتحاق", "Date of joining", date("doc.date_of_joining")], ["الجنسية", "Nationality", "{{ _(doc.nationality) }}"]]);
/** Print building blocks reused by the round-2 document prints (same frame, same CSS). */
export const PRINT_KIT = { CSS, th, meta, head, sign, two } as const;
const HR_SIGN = sign(["مدير الموارد البشرية", "HR Manager"], ["الختم", "Company stamp"], ["التاريخ", "Date"]);

export const HR_PRINT_FORMATS: PrintFormat[] = [
  {
    name: "Employment Contract (Bilingual)", doc_type: "DIGIT Employment Contract", print_format_type: "Jinja", css: CSS,
    html: `<div class="dhp">${head("عقد عمل", "Employment Contract")}
{% set e = frappe.get_doc("Employee", doc.employee) %}{% set a = frappe.get_list("Salary Structure Assignment", filters={"employee": doc.employee, "docstatus": 1}, fields=["base", "from_date", "salary_structure"], order_by="from_date desc", limit=1) | first %}
${meta([["الطرف الأول (صاحب العمل)", "First party (employer)", "{{ doc.company }}"], ["الطرف الثاني (العامل)", "Second party (employee)", "{{ doc.employee_name }}"], ["الرقم الوظيفي", "Employee No.", code("doc.employee")], ["الجنسية", "Nationality", "{{ _(e.nationality) }}"], ["المسمى الوظيفي", "Designation", "{{ _(e.designation) }}"], ["نوع العقد", "Contract type", "{{ _(doc.contract_type) }}"], ["تاريخ البداية", "Start date", date("doc.start_date")], ["تاريخ النهاية", "End date", "{% if doc.end_date %}" + date("doc.end_date") + "{% else %}غير محدد المدة · Unlimited{% endif %}"], ["فترة التجربة (يوم)", "Probation (days)", "{{ doc.probation_days }}"], ["فترة الإشعار (يوم)", "Notice (days)", "{{ doc.notice_days }}"], ["الأجر الأساسي الشهري", "Monthly base pay", "{% if a %}" + money("a.base") + "{% else %}—{% endif %}"], ["الحالة", "Status", "{{ _(doc.contract_status) }}"]])}
${two("يخضع هذا العقد لنظام العمل في المملكة العربية السعودية ولائحته التنفيذية، وما لم يرد فيه نص تسري أحكام النظام.", "This contract is governed by the Saudi Labor Law and its implementing regulations; anything it does not cover follows the Law.")}
{% if doc.terms_text %}<h3>الشروط · Terms</h3><p class="dhp-p">{{ doc.terms_text }}</p>{% endif %}
${sign(["الطرف الأول", "First party"], ["الطرف الثاني", "Second party"], ["الموارد البشرية", "Human Resources"])}</div>`,
  },
  {
    name: "Contract Amendment (Bilingual)", doc_type: "DIGIT Contract Amendment", print_format_type: "Jinja", css: CSS,
    html: `<div class="dhp">${head("ملحق تعديل عقد عمل", "Employment Contract Amendment")}
${meta([["العقد", "Contract", "{{ doc.contract }}"], ["الموظف", "Employee", "{{ doc.employee_name }}"], ["نوع التعديل", "Amendment type", "{{ _(doc.amendment_type) }}"], ["تاريخ السريان", "Effective date", date("doc.effective_date")], ["تاريخ النهاية الجديد", "New end date", "{% if doc.new_end_date %}" + date("doc.new_end_date") + "{% else %}—{% endif %}"]])}
<h3>تفاصيل التعديل · Details</h3><p class="dhp-p">{{ doc.details }}</p>
${two("تبقى جميع بنود العقد الأصلي سارية فيما لم يُعدَّل بهذا الملحق.", "All terms of the original contract remain in force except as amended here.")}
${sign(["صاحب العمل", "Employer"], ["الموظف", "Employee"], ["الموارد البشرية", "Human Resources"])}</div>`,
  },
  {
    name: "Offer Letter (Bilingual)", doc_type: "Job Offer", print_format_type: "Jinja", css: CSS,
    html: `<div class="dhp">${head("خطاب عرض وظيفي", "Offer Letter")}
<p class="dhp-to">السيد/ة {{ doc.applicant_name }} · Dear {{ doc.applicant_name }}</p>
${two("يسر {{ doc.company }} أن تعرض عليكم وظيفة <b>{{ _(doc.designation) }}</b> وفق الشروط أدناه. يسري العرض حتى قبولكم كتابيًا، ويخضع لاستكمال المستندات والفحص الطبي.", "{{ doc.company }} is pleased to offer you the position of <b>{{ doc.designation }}</b> on the terms below. The offer stands until you accept it in writing and is subject to documents and a medical check.")}
${meta([["المتقدم", "Applicant", "{{ doc.applicant_name }}"], ["البريد", "Email", "{{ doc.applicant_email }}"], ["تاريخ العرض", "Offer date", date("doc.offer_date")], ["الحالة", "Status", "{{ _(doc.status) }}"]])}
{% if doc.offer_terms %}<table><thead><tr>${th("البند", "Term")}${th("القيمة", "Value")}</tr></thead><tbody>{% for t in doc.offer_terms %}<tr><td>{{ _(t.offer_term) }}</td><td>{{ t.value }}</td></tr>{% endfor %}</tbody></table>{% endif %}
{% if doc.terms %}<div class="dhp-p">{{ doc.terms }}</div>{% endif %}
${sign(["عن الشركة", "For the company"], ["قبول المتقدم", "Accepted by applicant"], ["التاريخ", "Date"])}</div>`,
  },
  {
    name: "Salary Certificate (Bilingual)", doc_type: "Employee", print_format_type: "Jinja", css: CSS,
    html: `<div class="dhp">${head("شهادة راتب", "Salary Certificate")}${LATEST_SLIP}
${two("تشهد {{ doc.company }} بأن الموظف/ة <b>{{ doc.employee_name }}</b> يعمل لديها بوظيفة {{ _(doc.designation) }} منذ " + date("doc.date_of_joining") + "، ويتقاضى راتبًا شهريًا تفاصيله أدناه.", "{{ doc.company }} certifies that <b>{{ doc.employee_name }}</b> has worked for the company as {{ doc.designation }} since " + date("doc.date_of_joining") + " and is paid the monthly salary detailed below.")}
${EMP_FACTS}${SLIP_LINES}
${two("أعطيت هذه الشهادة بناءً على طلبه دون أدنى مسؤولية على الشركة.", "Issued at the employee's request without any liability on the company.")}
${HR_SIGN}</div>`,
  },
  {
    name: "Salary Definition Letter (Bilingual)", doc_type: "Employee", print_format_type: "Jinja", css: CSS,
    html: `<div class="dhp">${head("خطاب تعريف بالراتب", "Salary Definition Letter")}${LATEST_SLIP}
<p class="dhp-to">إلى من يهمه الأمر · To whom it may concern</p>
${two("نفيدكم بأن <b>{{ doc.employee_name }}</b> (الرقم الوظيفي {{ doc.name }}) يعمل لدى {{ doc.company }} بوظيفة {{ _(doc.designation) }} منذ " + date("doc.date_of_joining") + "{% if s0 %}، وإجمالي راتبه الشهري " + money("s0.gross_pay") + "{% endif %}.", "This is to confirm that <b>{{ doc.employee_name }}</b> (employee no. {{ doc.name }}) has worked for {{ doc.company }} as {{ doc.designation }} since " + date("doc.date_of_joining") + "{% if s0 %}, with a total monthly salary of " + money("s0.gross_pay") + "{% endif %}.")}
{% if s0 %}${words("s0.gross_pay")}{% endif %}
${two("صدر هذا الخطاب بناءً على طلبه دون أدنى مسؤولية على الشركة.", "Issued at the employee's request without any liability on the company.")}
${HR_SIGN}</div>`,
  },
  {
    name: "Experience Certificate (Bilingual)", doc_type: "Employee", print_format_type: "Jinja", css: CSS,
    html: `<div class="dhp">${head("شهادة خبرة", "Experience Certificate")}
<p class="dhp-to">إلى من يهمه الأمر · To whom it may concern</p>
${two("تشهد {{ doc.company }} بأن <b>{{ doc.employee_name }}</b> عمل لديها بوظيفة {{ _(doc.designation) }} في {{ _(doc.department) }} من " + date("doc.date_of_joining") + " {% if doc.relieving_date %}حتى " + date("doc.relieving_date") + "{% else %}ولا يزال على رأس العمل{% endif %}.", "{{ doc.company }} certifies that <b>{{ doc.employee_name }}</b> worked for the company as {{ doc.designation }} in {{ doc.department }} from " + date("doc.date_of_joining") + " {% if doc.relieving_date %}to " + date("doc.relieving_date") + "{% else %}and is still in service{% endif %}.")}
${EMP_FACTS}
${two("أعطيت هذه الشهادة بناءً على طلبه دون أدنى مسؤولية على الشركة.", "Issued at the employee's request without any liability on the company.")}
${HR_SIGN}</div>`,
  },
  {
    name: "Salary Transfer Letter to Bank (Bilingual)", doc_type: "Employee", print_format_type: "Jinja", css: CSS,
    html: `<div class="dhp">${head("خطاب تحويل راتب إلى البنك", "Salary Transfer Letter")}${LATEST_SLIP}
{% set bc = frappe.get_list("DIGIT Bank Change Request", filters={"employee": doc.name, "request_status": "Applied"}, fields=["new_bank_name", "new_iban", "applied_on"], order_by="applied_on desc", limit=1) | first %}
{% set bank = doc.bank_name or (bc and bc.new_bank_name) %}{% set iban = doc.iban or doc.bank_ac_no or (bc and bc.new_iban) %}
<p class="dhp-to">السادة/ {{ bank }} المحترمين · To: {{ bank }}</p>
${two("نفيدكم بأن <b>{{ doc.employee_name }}</b> (الرقم الوظيفي {{ doc.name }}) يعمل لدينا بوظيفة {{ _(doc.designation) }} منذ " + date("doc.date_of_joining") + "{% if s0 %}، وإجمالي راتبه الشهري " + money("s0.gross_pay") + "{% endif %}، ويُحوَّل راتبه شهريًا إلى الحساب رقم <bdi dir=ltr>{{ iban }}</bdi> لديكم عبر نظام حماية الأجور. وسنشعركم قبل أي تغيير على حساب تحويل الراتب.", "<b>{{ doc.employee_name }}</b> (employee no. {{ doc.name }}) has worked for us as {{ doc.designation }} since " + date("doc.date_of_joining") + "{% if s0 %}, with a total monthly salary of " + money("s0.gross_pay") + "{% endif %}. The salary is paid monthly through the Wage Protection System to account <bdi>{{ iban }}</bdi> with you. We will inform you before any change to the salary account.")}
${HR_SIGN}</div>`,
  },
  {
    name: "Payslip (Bilingual)", doc_type: "Salary Slip", print_format_type: "Jinja", css: CSS,
    html: `<div class="dhp">${head("قسيمة راتب", "Payslip")}
${meta([["الموظف", "Employee", "{{ doc.employee_name }}"], ["الرقم الوظيفي", "Employee No.", code("doc.employee")], ["المسمى الوظيفي", "Designation", "{{ _(doc.designation) }}"], ["القسم", "Department", "{{ _(doc.department) }}"], ["الفترة", "Period", date("doc.start_date") + " – " + date("doc.end_date")], ["أيام العمل / أيام الدفع", "Working / payment days", "{{ doc.total_working_days }} / {{ doc.payment_days }}"], ["إجازة بدون راتب", "Leave without pay", "{{ doc.leave_without_pay }}"], ["أيام الغياب", "Absent days", "{{ doc.absent_days }}"]])}
<div class="dhp-two"><div><table><thead><tr>${th("الاستحقاقات", "Earnings")}${th("المبلغ", "Amount")}</tr></thead><tbody>{% for e in doc.earnings %}<tr><td>{{ _(e.salary_component) }}</td><td class="dhp-num">{{ e.get_formatted("amount") }}</td></tr>{% endfor %}<tr class="dhp-strong"><th>الإجمالي<small dir="ltr">Gross pay</small></th><td class="dhp-num">{{ doc.get_formatted("gross_pay") }}</td></tr></tbody></table></div>
<div><table><thead><tr>${th("الاستقطاعات", "Deductions")}${th("المبلغ", "Amount")}</tr></thead><tbody>{% for e in doc.deductions %}<tr><td>{{ _(e.salary_component) }}</td><td class="dhp-num">{{ e.get_formatted("amount") }}</td></tr>{% endfor %}<tr class="dhp-strong"><th>الإجمالي<small dir="ltr">Total deductions</small></th><td class="dhp-num">{{ doc.get_formatted("total_deduction") }}</td></tr></tbody></table></div></div>
<table class="dhp-tot"><tr class="dhp-strong">${th("صافي الراتب", "Net pay")}<td class="dhp-num">{{ doc.get_formatted("net_pay") }}</td></tr></table>
${words("doc.net_pay")}
${sign(["أعدّه", "Prepared by"], ["راجعه", "Reviewed by"], ["استلمه الموظف", "Received by employee"])}</div>`,
  },
  {
    name: "Payroll Register (Bilingual)", doc_type: "Payroll Entry", print_format_type: "Jinja", css: CSS,
    html: `<div class="dhp">${head("سجل الرواتب", "Payroll Register")}
{% set rows = frappe.get_list("Salary Slip", filters={"payroll_entry": doc.name}, fields=["employee", "employee_name", "department", "payment_days", "gross_pay", "total_deduction", "net_pay"], order_by="employee asc") %}
${meta([["الفترة", "Period", date("doc.start_date") + " – " + date("doc.end_date")], ["تاريخ الترحيل", "Posting date", date("doc.posting_date")], ["عدد الموظفين", "Employees", "{{ rows | length }}"], ["الحالة", "Status", "{{ _(doc.status) }}"]])}
<table><thead><tr>${th("#", "No.")}${th("الموظف", "Employee")}${th("القسم", "Department")}${th("أيام الدفع", "Pay days")}${th("الإجمالي", "Gross")}${th("الاستقطاعات", "Deductions")}${th("الصافي", "Net")}</tr></thead>
<tbody>{% for r in rows %}<tr><td>{{ loop.index }}</td><td>{{ r.employee_name }}<small dir="ltr">{{ r.employee }}</small></td><td>{{ _(r.department) }}</td><td class="dhp-num">{{ r.payment_days }}</td><td class="dhp-num">${money("r.gross_pay")}</td><td class="dhp-num">${money("r.total_deduction")}</td><td class="dhp-num">${money("r.net_pay")}</td></tr>{% else %}<tr><td colspan="7">لا قسائم بعد · No slips yet</td></tr>{% endfor %}</tbody></table>
<table class="dhp-tot"><tr>${th("إجمالي الرواتب", "Total gross")}<td class="dhp-num">${money('rows | sum(attribute="gross_pay")')}</td></tr><tr>${th("إجمالي الاستقطاعات", "Total deductions")}<td class="dhp-num">${money('rows | sum(attribute="total_deduction")')}</td></tr><tr class="dhp-strong">${th("صافي الرواتب", "Total net")}<td class="dhp-num">${money('rows | sum(attribute="net_pay")')}</td></tr></table>
${words('rows | sum(attribute="net_pay")')}
${sign(["أعدّه أخصائي الرواتب", "Prepared by payroll"], ["راجعه المدير المالي", "Reviewed by finance"], ["اعتمده", "Approved by"])}</div>`,
  },
  {
    name: "GOSI Monthly File (Bilingual)", doc_type: "Payroll Entry", print_format_type: "Jinja", css: CSS,
    html: `<div class="dhp">${head("ملف التأمينات الاجتماعية الشهري", "GOSI Monthly Contribution File")}
{% set rows = frappe.get_list("DIGIT GOSI Assessment", filters={"company": doc.company, "period_month": doc.start_date}, fields=["employee", "employee_name", "contributory_wage", "employee_share", "employer_share"], order_by="employee asc") %}
${meta([["الشهر", "Month", date("doc.start_date")], ["عدد المشتركين", "Contributors", "{{ rows | length }}"]])}
<table><thead><tr>${th("#", "No.")}${th("الموظف", "Employee")}${th("الأجر الخاضع", "Contributory wage")}${th("حصة الموظف", "Employee share")}${th("حصة صاحب العمل", "Employer share")}</tr></thead>
<tbody>{% for r in rows %}<tr><td>{{ loop.index }}</td><td>{{ r.employee_name }}<small dir="ltr">{{ r.employee }}</small></td><td class="dhp-num">${money("r.contributory_wage")}</td><td class="dhp-num">${money("r.employee_share")}</td><td class="dhp-num">${money("r.employer_share")}</td></tr>{% else %}<tr><td colspan="5">لا تقييمات مسجلة لهذا الشهر · No assessments recorded for this month</td></tr>{% endfor %}</tbody></table>
<table class="dhp-tot"><tr>${th("إجمالي حصة الموظفين", "Total employee share")}<td class="dhp-num">${money('rows | sum(attribute="employee_share")')}</td></tr><tr>${th("إجمالي حصة صاحب العمل", "Total employer share")}<td class="dhp-num">${money('rows | sum(attribute="employer_share")')}</td></tr></table>
<p class="dhp-note">الإرسال إلى المؤسسة العامة للتأمينات الاجتماعية يتم عبر بوابتها أو عبر الربط المعتمد. · Filing with GOSI is done on its portal or through the approved integration.</p>
${sign(["أعدّه", "Prepared by"], ["راجعه", "Reviewed by"], ["اعتمده", "Approved by"])}</div>`,
  },
  {
    name: "WPS Salary File (Bilingual)", doc_type: "DIGIT WPS Submission", print_format_type: "Jinja", css: CSS,
    html: `<div class="dhp">${head("ملف حماية الأجور", "WPS Salary File")}
{% set rows = frappe.get_list("Salary Slip", filters={"payroll_entry": doc.payroll_entry, "docstatus": 1}, fields=["employee", "employee_name", "net_pay"], order_by="employee asc") %}
${meta([["مسير الرواتب", "Payroll run", "{{ doc.payroll_entry }}"], ["الشهر", "Month", date("doc.period_month")], ["عدد الموظفين", "Employees", "{{ doc.employee_count }}"], ["الحالة", "Status", "{{ _(doc.submission_status) }}"]])}
<table><thead><tr>${th("#", "No.")}${th("الموظف", "Employee")}${th("الآيبان", "IBAN")}${th("صافي الراتب", "Net pay")}</tr></thead>
<tbody>{% for r in rows %}{% set e = frappe.get_doc("Employee", r.employee) %}{% set bc = frappe.get_list("DIGIT Bank Change Request", filters={"employee": r.employee, "request_status": "Applied"}, fields=["new_iban"], limit=1) | first %}<tr><td>{{ loop.index }}</td><td>{{ r.employee_name }}<small dir="ltr">{{ r.employee }}</small></td><td dir="ltr">{{ e.iban or e.bank_ac_no or (bc and bc.new_iban) }}</td><td class="dhp-num">${money("r.net_pay")}</td></tr>{% endfor %}</tbody></table>
<table class="dhp-tot"><tr class="dhp-strong">${th("إجمالي المبلغ", "Total amount")}<td class="dhp-num">{{ doc.get_formatted("total_amount") }}</td></tr></table>
<p class="dhp-note">يُرفع الملف إلى البنك عبر قناته المعتمدة؛ تُسجَّل نتيجة القبول أو الرفض على هذا المستند. · The file is uploaded through the bank's approved channel; acceptance or rejection is recorded on this document.</p>
${sign(["أعدّه", "Prepared by"], ["راجعه المالية", "Reviewed by finance"], ["اعتمده", "Approved by"])}</div>`,
  },
  {
    name: "End of Service Settlement (Bilingual)", doc_type: "Full and Final Statement", print_format_type: "Jinja", css: CSS,
    html: `<div class="dhp">${head("مخالصة نهاية الخدمة", "End of Service Settlement")}
${meta([["الموظف", "Employee", "{{ doc.employee_name }}"], ["الرقم الوظيفي", "Employee No.", code("doc.employee")], ["تاريخ الالتحاق", "Date of joining", date("doc.date_of_joining")], ["تاريخ الانتهاء", "Relieving date", date("doc.relieving_date")], ["المسمى الوظيفي", "Designation", "{{ _(doc.designation) }}"], ["الحالة", "Status", "{{ _(doc.status) }}"]])}
<div class="dhp-two"><div><table><thead><tr>${th("المستحقات", "Payables")}${th("المبلغ", "Amount")}</tr></thead><tbody>{% for p in doc.payables %}<tr><td>{{ _(p.component) }}{% if p.reference_document %}<small dir="ltr">{{ p.reference_document }}</small>{% endif %}</td><td class="dhp-num">${money("p.amount")}</td></tr>{% endfor %}<tr class="dhp-strong"><th>الإجمالي<small dir="ltr">Total payable</small></th><td class="dhp-num">${money("doc.total_payable_amount")}</td></tr></tbody></table></div>
<div><table><thead><tr>${th("المستقطعات", "Receivables")}${th("المبلغ", "Amount")}</tr></thead><tbody>{% for p in doc.receivables %}<tr><td>{{ _(p.component) }}</td><td class="dhp-num">${money("p.amount")}</td></tr>{% endfor %}<tr class="dhp-strong"><th>الإجمالي<small dir="ltr">Total receivable</small></th><td class="dhp-num">${money("doc.total_receivable_amount")}</td></tr></tbody></table></div></div>
<table class="dhp-tot"><tr class="dhp-strong">${th("الصافي المستحق للموظف", "Net due to the employee")}<td class="dhp-num">${money("doc.total_payable_amount - doc.total_receivable_amount")}</td></tr></table>
${words("doc.total_payable_amount - doc.total_receivable_amount")}
${two("أقر أنا الموقع أدناه باستلام كامل مستحقاتي المبينة أعلاه، وأنه لا توجد لي أي مطالبات أخرى تجاه الشركة.", "I, the undersigned, confirm receipt of all my dues shown above and that I have no further claims against the company.")}
${sign(["الموظف", "Employee"], ["الموارد البشرية", "Human Resources"], ["المالية", "Finance"])}</div>`,
  },
  {
    name: "Leave Approval (Bilingual)", doc_type: "Leave Application", print_format_type: "Jinja", css: CSS,
    html: `<div class="dhp">${head("إشعار اعتماد إجازة", "Leave Approval")}
${meta([["الموظف", "Employee", "{{ doc.employee_name }}"], ["الرقم الوظيفي", "Employee No.", code("doc.employee")], ["نوع الإجازة", "Leave type", "{{ _(doc.leave_type) }}"], ["القسم", "Department", "{{ _(doc.department) }}"], ["من", "From", date("doc.from_date")], ["إلى", "To", date("doc.to_date")], ["عدد الأيام", "Days", "{{ doc.total_leave_days }}"], ["الرصيد قبل الإجازة", "Balance before", "{{ doc.leave_balance }}"], ["المعتمد", "Approver", "{{ doc.leave_approver_name or doc.leave_approver }}"], ["الحالة", "Status", "{{ _(doc.status) }}"]])}
{% if doc.description %}<p class="dhp-p"><b>السبب · Reason:</b> {{ doc.description }}</p>{% endif %}
${two("{% if doc.status == 'Approved' %}تمت الموافقة على الإجازة أعلاه، وعلى الموظف المباشرة في اليوم التالي لنهايتها.{% else %}هذا الطلب لم يُعتمد بعد.{% endif %}", "{% if doc.status == 'Approved' %}The leave above is approved; the employee resumes work the day after it ends.{% else %}This request is not approved yet.{% endif %}")}
${sign(["الموظف", "Employee"], ["المدير المباشر", "Line manager"], ["الموارد البشرية", "Human Resources"])}</div>`,
  },
  {
    name: "Warning Letter (Bilingual)", doc_type: "Employee Grievance", print_format_type: "Jinja", css: CSS,
    html: `<div class="dhp">${head("خطاب إنذار", "Warning Letter")}
{% if doc.grievance_against_party == "Employee" and doc.grievance_against %}{% set e = frappe.get_doc("Employee", doc.grievance_against) %}
<p class="dhp-to">السيد/ة {{ e.employee_name }} · To: {{ e.employee_name }}</p>
${meta([["الرقم الوظيفي", "Employee No.", code("doc.grievance_against")], ["المسمى الوظيفي", "Designation", "{{ _(e.designation) }}"], ["الموضوع", "Subject", "{{ doc.subject }}"], ["تاريخ الواقعة", "Date of incident", date("doc.date")], ["نتيجة التحقيق", "Investigation result", "{{ _(doc.status) }}"], ["تاريخ القرار", "Decision date", date("doc.resolution_date")]])}
<h3>الواقعة · Incident</h3><p class="dhp-p">{{ doc.description }}</p>
<h3>القرار · Decision</h3><p class="dhp-p">{{ doc.resolution_detail }}</p>
${two("نأمل منكم الالتزام بأنظمة العمل ولائحة تنظيم العمل في الشركة، علمًا بأن تكرار المخالفة يعرضكم للجزاء المنصوص عليه في اللائحة.", "You are asked to comply with the Labor Law and the company's work regulations; a repeated violation leads to the penalty set in the regulations.")}
${sign(["الموارد البشرية", "Human Resources"], ["المدير المباشر", "Line manager"], ["استلام الموظف", "Received by employee"])}
{% else %}<p class="dhp-note">يُصدر خطاب الإنذار فقط عن شكوى ضد موظف بعد التحقيق. · A warning letter is issued only from a grievance against an employee, after investigation.</p>{% endif %}</div>`,
  },
  {
    name: "Exit Clearance (Bilingual)", doc_type: "Employee Separation", print_format_type: "Jinja", css: CSS,
    html: `<div class="dhp">${head("نموذج إخلاء طرف", "Exit Clearance")}
${meta([["الموظف", "Employee", "{{ doc.employee_name }}"], ["الرقم الوظيفي", "Employee No.", code("doc.employee")], ["القسم", "Department", "{{ _(doc.department) }}"], ["المسمى الوظيفي", "Designation", "{{ _(doc.designation) }}"], ["تاريخ خطاب الاستقالة", "Resignation letter date", date("doc.resignation_letter_date")], ["حالة الإخلاء", "Clearance status", "{{ _(doc.boarding_status) }}"]])}
<table><thead><tr>${th("#", "No.")}${th("البند", "Item")}${th("الجهة / الدور", "Owner / role")}${th("الحالة", "Status")}${th("التوقيع", "Signature")}</tr></thead>
<tbody>{% for a in doc.activities %}<tr><td>{{ loop.index }}</td><td>{{ _(a.activity_name) }}</td><td>{{ _(a.role) or a.user }}</td><td>{% if a.task %}{{ _(frappe.db.get_value("Task", a.task, "status")) }}{% elif doc.boarding_status == "Completed" %}{{ _("Completed") }}{% else %}—{% endif %}</td><td></td></tr>{% else %}<tr><td colspan="5">لا بنود إخلاء مسجلة · No clearance items recorded</td></tr>{% endfor %}</tbody></table>
${sign(["الموظف", "Employee"], ["الموارد البشرية", "Human Resources"], ["المدير المباشر", "Line manager"])}</div>`,
  },
  {
    name: "GOSI Contribution Statement (Bilingual)", doc_type: "DIGIT GOSI Assessment", print_format_type: "Jinja", css: CSS,
    html: `<div class="dhp">${head("بيان اشتراك التأمينات الاجتماعية", "GOSI Contribution Statement")}
${meta([["الموظف", "Employee", "{{ doc.employee_name }}"], ["الرقم الوظيفي", "Employee No.", code("doc.employee")], ["الشهر", "Month", date("doc.period_month")], ["مجموعة القواعد", "Rule set", "{{ doc.rule_set }}"]])}
<table class="dhp-tot"><tr>${th("الأجر الخاضع للاشتراك", "Contributory wage")}<td class="dhp-num">{{ doc.get_formatted("contributory_wage") }}</td></tr><tr>${th("حصة الموظف", "Employee share")}<td class="dhp-num">{{ doc.get_formatted("employee_share") }}</td></tr><tr class="dhp-strong">${th("حصة صاحب العمل", "Employer share")}<td class="dhp-num">{{ doc.get_formatted("employer_share") }}</td></tr></table>
${sign(["أعدّه", "Prepared by"], ["راجعه", "Reviewed by"], ["اعتمده", "Approved by"])}</div>`,
  },
];

/** Print titles and form-print menus (Arabic first). */
export const HR_PRINT_TITLES: Record<string, readonly [string, string]> = {
  "DIGIT Employment Contract": ["Employment Contract", "عقد عمل"], "DIGIT Contract Amendment": ["Contract Amendment", "ملحق تعديل عقد"],
  "DIGIT WPS Submission": ["WPS Salary File", "ملف حماية الأجور"], "DIGIT GOSI Assessment": ["GOSI Contribution Statement", "بيان اشتراك التأمينات"],
};

/** Arabic for print-only component labels (display-only, merged into the HR translations). */
export const PRINT_AR: Record<string, string> = { "Basic Salary": "الراتب الأساسي", "Housing Allowance": "بدل السكن", "Transport Allowance": "بدل النقل", "Performance Bonus": "مكافأة أداء", "Loan Repayment": "سداد قرض", "GOSI Employee Share": "حصة الموظف في التأمينات", "Salary (final month)": "راتب الشهر الأخير", "Employee Advance": "سلفة موظف", "Return laptop and access card": "إعادة الحاسب المحمول وبطاقة الدخول", "Close system accounts": "إغلاق حسابات الأنظمة", "Return site PPE and tools": "إعادة معدات السلامة والأدوات", "Settle advances and petty cash": "تسوية السلف والعهد", "Hand over files and duties": "تسليم الملفات والمهام", "Payslip (Bilingual)": "قسيمة راتب (ثنائية اللغة)", "Payroll Register (Bilingual)": "سجل الرواتب (ثنائي اللغة)", "GOSI Monthly File (Bilingual)": "ملف التأمينات الشهري (ثنائي اللغة)", "WPS Salary File (Bilingual)": "ملف حماية الأجور (ثنائي اللغة)", "End of Service Settlement (Bilingual)": "مخالصة نهاية الخدمة (ثنائية اللغة)", "Leave Approval (Bilingual)": "إشعار اعتماد إجازة (ثنائي اللغة)", "Warning Letter (Bilingual)": "خطاب إنذار (ثنائي اللغة)", "Exit Clearance (Bilingual)": "إخلاء طرف (ثنائي اللغة)", "GOSI Contribution Statement (Bilingual)": "بيان اشتراك التأمينات (ثنائي اللغة)", "Employment Contract (Bilingual)": "عقد عمل (ثنائي اللغة)", "Contract Amendment (Bilingual)": "ملحق تعديل عقد (ثنائي اللغة)", "Offer Letter (Bilingual)": "خطاب عرض وظيفي (ثنائي اللغة)", "Salary Certificate (Bilingual)": "شهادة راتب (ثنائية اللغة)", "Salary Definition Letter (Bilingual)": "خطاب تعريف بالراتب (ثنائي اللغة)", "Experience Certificate (Bilingual)": "شهادة خبرة (ثنائية اللغة)", "Salary Transfer Letter to Bank (Bilingual)": "خطاب تحويل راتب إلى البنك (ثنائي اللغة)" };
