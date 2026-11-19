import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useLang, t } from "@/i18n";
import { useStoreVersion } from "@/lib/adapter";
import { scopedList, useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { formatValue } from "@/lib/format";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { Native, WorkTable, arLabel } from "@/components/digithr/workspaces/shared";
import { Button } from "@/components/ui/button";
import { ANALYTICS_PARAMETERS, INFORMATION_COLUMNS, employeeAnalytics, employeeInformation } from "@/plugins/digit_hr/employeeReports";
import type { Doc } from "@/lib/adapter";
const LABELS: Record<string, [string,string]> = {
  name: ["الموظف","Employee"], employee_number: ["الرقم الوظيفي","Employee Number"], date_of_joining: ["تاريخ الالتحاق","Date of Joining"], branch: ["الفرع","Branch"], department: ["القسم","Department"], designation: ["المسمى الوظيفي","Designation"], gender: ["الجنس","Gender"], status: ["الحالة","Status"], company: ["الشركة","Company"], employment_type: ["نوع التوظيف","Employment Type"], reports_to: ["المدير المباشر","Reports To"], company_email: ["البريد الوظيفي","Company Email"], employee_name: ["اسم الموظف","Employee Name"], date_of_birth: ["تاريخ الميلاد","Date of Birth"],
};
export function EmployeeReports({ analytical }: { analytical: boolean }) {
  const lang = useLang(); const tx = (ar:string,en:string) => lang === "ar" ? ar : en;
  useStoreVersion(); useSessionUser(); useScopeMetas(["Employee","Company"]);
  const employees = scopedList("Employee");
  const companies = [...new Set(employees.map(e=>String(e["company"] ?? "")).filter(Boolean))];
  const [company,setCompany] = useState(""); const [parameter,setParameter] = useState(""); const [query,setQuery] = useState("");
  const [hidden,setHidden] = useState<string[]>([]);
  const result = employeeAnalytics(employees,company,parameter);
  const rows = analytical ? result?.rows ?? [] : employeeInformation(employees,company,query);
  const columns = analytical ? ["name","employee_name","date_of_birth","branch","department","designation","gender","company"] : INFORMATION_COLUMNS;
  return <div className="mt-4 min-w-0 space-y-4" data-employee-report={analytical ? "analytics" : "information"}>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">{tx("الشركة","Company")}{analytical && " *"}<select className="field-input mt-1 block w-60 max-w-full" aria-label={tx("الشركة","Company")} value={company} onChange={e=>setCompany(e.target.value)}><option value="">{tx(analytical ? "اختر الشركة" : "كل الشركات",analytical ? "Select company" : "All companies")}</option>{companies.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
      {analytical ? <label className="text-sm">{tx("معيار التحليل","Parameter")} *<select className="field-input mt-1 block w-52" aria-label={tx("معيار التحليل","Parameter")} value={parameter} onChange={e=>setParameter(e.target.value)}><option value="">{tx("اختر المعيار","Select parameter")}</option>{ANALYTICS_PARAMETERS.map(p=><option key={p} value={p}>{tx(arLabel(p),p)}</option>)}</select></label>
        : <label className="text-sm">{tx("بحث الموظف","Employee search")}<input className="field-input mt-1 block" aria-label={tx("بحث الموظف","Employee search")} value={query} onChange={e=>setQuery(e.target.value)} /></label>}
      <details className="text-sm"><summary className="cursor-pointer">{tx("الأعمدة","Columns")}</summary><div className="flex max-w-xl flex-wrap gap-3 py-2">{columns.map(c=><label key={c} className="flex items-center gap-1"><input type="checkbox" checked={!hidden.includes(c)} disabled={c === "name"} onChange={()=>setHidden(hidden.includes(c) ? hidden.filter(x=>x!==c) : [...hidden,c])} />{tx(...(LABELS[c] ?? [c,c]))}</label>)}</div></details>
      <Button variant="outline" onClick={()=>{setCompany("");setParameter("");setQuery("");setHidden([]);}}>{tx("إعادة ضبط","Reset")}</Button>
    </div>
    {analytical && !result ? <p role="status" className="border-s-2 border-primary ps-3 text-sm">{tx("اختر الشركة ومعيار التحليل لعرض النتائج المحسوبة من سجلات الموظفين المصرح بها.","Select company and parameter to calculate results from authorized Employee records.")}</p> : <>
      {analytical && result && <section className="border-y py-4" data-analytics-groups>
        <h2 className="font-semibold">{tx("توزيع الموظفين النشطين","Active employee distribution")} · <span data-no-i18n>{result.population.length}</span></h2>
        <p className="mb-3 text-xs text-muted-foreground">{tx("يشمل الملخص القيم غير المحددة؛ الجدول الأصلي يعرض الموظفين الذين لديهم قيمة للمعيار فقط. الأعداد ضمن صلاحيات المستخدم.","Summary includes Not Set; the original register includes only employees with a set parameter. Counts respect user scope.")}</p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{result.groups.map(g=><li key={g.label}><Native dt="Employee" filters={[["company","=",company],["status","=","Active"],[result.field,g.label === "Not Set" ? "is" : "=",g.label === "Not Set" ? "not set" : g.label]]} className="flex items-center justify-between gap-3 border-b py-2"><span>{g.label === "Not Set" ? tx("غير محدد","Not Set") : tx(arLabel(g.label),g.label)}</span><span data-no-i18n>{g.count} · {result.population.length ? Math.round(g.count/result.population.length*100) : 0}%</span></Native></li>)}</ul>
      </section>}
      <WorkTable<Doc> label={analytical ? "employee-analytics" : "employee-information"} tx={tx} rows={rows} rowKey={r=>r.name} cols={columns.filter(c=>!hidden.includes(c)).map(c=>({key:c,ar:LABELS[c]?.[0] ?? c,en:LABELS[c]?.[1] ?? c,sort:r=>String(r[c] ?? ""),render:r=>c === "name" ? <Native dt="Employee" name={r.name} className="font-medium text-primary hover:underline"><span data-no-i18n>{r.name}</span></Native> : c === "reports_to" && r[c] ? <Native dt="Employee" name={String(r[c])}><span data-no-i18n>{String(r[c])}</span></Native> : <span data-no-i18n>{/date/.test(c) ? formatValue("Date",r[c]) : ["status","gender","employment_type","department","designation","branch"].includes(c) ? tx(arLabel(String(r[c] ?? "")),String(r[c] ?? "")) : (c === "company" ? tx(arLabel(String(r[c] ?? "")),String(r[c] ?? "")) : String(r[c] ?? ""))}</span>}))} />
      <p className="text-xs text-muted-foreground">{tx("سجلات ظاهرة","Visible records")}: <span data-no-i18n>{rows.length}</span></p>
    </>}
    <p className="text-xs text-muted-foreground">{tx(analytical ? "حساب محلي لتعريف تقرير DIGIT HR الأصلي على سجلات المعاينة؛ ليس تنفيذًا على خادم DIGIT." : "تعريف سجل الموظفين الأصلي على سجلات المعاينة المشتركة.",analytical ? "Local calculation of the original DIGIT HR definition over preview records; not execution on a DIGIT server." : "Original Employee Information definition over shared preview records.")}</p>
  </div>;
}