/** CMP-06 salary increase letter (bilingual, shared print frame): reads only the proposal / review and its employee. */
import type { PrintFormat } from "@/plugins/types";
import { PRINT_KIT } from "../product/prints";

const { CSS, head, meta, sign, two } = PRINT_KIT;
const money = (e: string) => `{{ frappe.utils.fmt_money(${e}) }}`;
const words = (e: string) => `<div class="dhp-words pf-words" data-pf-words><b>المبلغ كتابةً · Amount in words</b> {{ frappe.utils.money_in_words(${e}) }}</div>`;
const letter = (dt: string, cur: string, nw: string, eff: string): PrintFormat => ({
  name: `Salary Increase Letter${dt === "DIGIT Compensation Review" ? "" : " (Cycle)"} (Bilingual)`, doc_type: dt, print_format_type: "Jinja", css: CSS,
  html: `<div class="dhp">${head("خطاب زيادة الراتب", "Salary Increase Letter")}${meta([["الموظف", "Employee", "{{ doc.employee_name }}"], ["تاريخ السريان", "Effective date", `{{ frappe.utils.formatdate(${eff}) if ${eff} else "—" }}`], ["الراتب الأساسي الحالي", "Current basic", money(cur)], ["الراتب الأساسي الجديد", "New basic", money(nw)], ["مقدار الزيادة", "Increase", money(`(${nw} or 0) - (${cur} or 0)`)], ["النسبة", "Percent", `{{ "%.2f"|format((((${nw} or 0) - (${cur} or 0)) / (${cur} or 1)) * 100) }}%`]])}${words(nw)}${two("يسرنا إبلاغكم بزيادة راتبكم الأساسي كما هو موضح أعلاه تقديرًا لأدائكم، وتسري الزيادة من التاريخ المذكور، وتبقى بقية شروط العقد دون تغيير.", "We are pleased to confirm the increase of your basic salary shown above in recognition of your performance. It takes effect on the stated date; all other terms of your contract remain unchanged.")}${sign(["الموظف", "Employee"], ["مدير الموارد البشرية", "HR Manager"], ["الختم", "Company stamp"])}</div>`,
} as PrintFormat);
export const R10_EXTRA_PRINTS: PrintFormat[] = [letter("DIGIT Compensation Review", "doc.current_base", "doc.proposed_base", "doc.review_date"), letter("DIGIT Salary Change Proposal", "doc.current_base", "doc.proposed_base", "frappe.db.get_value('DIGIT Compensation Review Cycle', doc.cycle, 'effective_date')")];
export const R10_EXTRA_TITLES: Record<string, [string, string]> = { "DIGIT Salary Change Proposal": ["Salary Change Proposal", "مقترح تغيير الراتب"] };
