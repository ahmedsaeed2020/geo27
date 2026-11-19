import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { enterHrNative } from "@/components/digithr/HrNav";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { BandStat, StatusBadge } from "@/components/digithr/ui";
import { WorkTable } from "@/components/digithr/EnterpriseRegister";
import { Button } from "@/components/ui/button";
import { cachedMeta } from "@/lib/catalog";
import { hasPerm } from "@/plugins/digit_hr/compat/session";
import { useStoreVersion } from "@/lib/adapter";
import { scopedList, useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { readRegister } from "@/plugins/digit_hr/registerState";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

export const Route = createFileRoute("/digit-hr/employees/")({
  validateSearch: (s: Record<string, unknown>): { company?: string | undefined; department?: string | undefined; status?: string | undefined; hr?: string | undefined } => ({ hr: typeof s["hr"] === "string" && s["hr"].length < 12000 ? s["hr"] : undefined, company: typeof s["company"] === "string" ? s["company"] : undefined, department: typeof s["department"] === "string" ? s["department"] : undefined, status: typeof s["status"] === "string" ? s["status"] : undefined }),
  head: () => ({ meta: [
    { title: "Employee Directory — DIGIT HR" },
    { name: "description", content: "Search and filter canonical employees by company, department and status." },
    { property: "og:title", content: "Employee Directory — DIGIT HR" },
    { property: "og:description", content: "Permission-scoped employee directory on the native Employee record." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Directory,
});

const LAYOUT_KEY = "digit_hr.directory.layout";
type Layout = { q: string; company: string; department: string; status: string };
const EMPTY: Layout = { q: "", company: "", department: "", status: "" };

function Directory() {
  useStoreVersion(); const user = useSessionUser(); useScopeMetas(["Employee"]);
  const { tx } = useTx();
  const [f, setF] = useState<Layout>(EMPTY);
  const [saved, setSaved] = useState(false);
  const scope = Route.useSearch(); const navigate = Route.useNavigate();
  useEffect(() => { setF(EMPTY); try { const s = localStorage.getItem(`${LAYOUT_KEY}:${user}`) || (user === 'Administrator' ? localStorage.getItem(LAYOUT_KEY) : null); if (s) setF({ ...EMPTY, ...JSON.parse(s) }); } catch { /* ignore */ } }, [user]);
  const rows = scopedList("Employee");
  const opts = (k: string) => [...new Set(rows.map((r) => String(r[k] ?? "")).filter(Boolean))].sort();
  const shown = useMemo(() => rows.filter((r) => {
    return (!(scope.company ?? f.company) || r["company"] === (scope.company ?? f.company)) && (!(scope.department ?? f.department) || r["department"] === (scope.department ?? f.department)) && (!(scope.status ?? f.status) || r["status"] === (scope.status ?? f.status));
  }), [rows, f, scope]);
  const query = readRegister(scope.hr, 'directory').q.toLocaleLowerCase();
  const searchText = (r: typeof rows[number]) => [r.name, r['employee_name'], r['designation'], r['department']].join(' ');
  const shownCount = query ? shown.filter(r => searchText(r).toLocaleLowerCase().includes(query)).length : shown.length;
  const sel = (k: keyof Layout, label: string, values: string[]) => (
    <label className="dhr-label">{label}
      <select value={scope[k as keyof typeof scope] ?? f[k]} onChange={(e) => { setF({ ...f, [k]: e.target.value }); void navigate({ search: prev => ({ ...prev, [k]: e.target.value }) }); }} className="mt-1 block w-full md:w-44">
        <option value="">{tx("الكل", "All")}</option>{values.map((v) => <option key={v} value={v} data-no-i18n>{v}</option>)}
      </select>
    </label>
  );
  return (
    <DigitHrLayout title={tx("دليل الموظفين", "Employee Directory")} crumbs={[{ label: tx("دليل الموظفين", "Employee Directory") }]}
      subtitle={tx("سجل الموظفين الأصلي حسب صلاحياتك", "Canonical Employee records within your permissions")}
      actions={cachedMeta("Employee") && hasPerm(cachedMeta("Employee") as NonNullable<ReturnType<typeof cachedMeta>>, "create") ? <Link onClick={() => enterHrNative("01.4")} to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: "erpnext", doctype: "employee", name: "new" }} className="dhr-btn dhr-btn-primary">{tx("موظف جديد", "New employee")}</Link> : undefined}
      band={<div className="flex flex-wrap gap-2">
        <BandStat label={tx("إجمالي", "Total")} value={rows.length} />
        <BandStat label={tx("نشط", "Active")} value={rows.filter((r) => r["status"] === "Active").length} />
        <BandStat label={tx("المعروض", "Shown")} value={shownCount} />
      </div>}>
      <div className="dhr-card mb-4 flex flex-wrap items-end gap-3 p-4">
        {sel("company", tx("الشركة", "Company"), opts("company"))}
        {sel("department", tx("القسم", "Department"), opts("department"))}
        {sel("status", tx("الحالة", "Status"), opts("status"))}
        <Button variant="outline" onClick={() => { localStorage.setItem(`${LAYOUT_KEY}:${user}`, JSON.stringify({ company: scope.company ?? f.company, department: scope.department ?? f.department, status: scope.status ?? f.status })); setSaved(true); setTimeout(() => setSaved(false), 1500); }} className="dhr-btn">{saved ? tx("تم الحفظ", "Saved") : tx("حفظ المرشحات", "Save filters")}</Button>
        <Button variant="ghost" onClick={() => { setF(EMPTY); void navigate({ search: prev => ({ ...prev, company: '', department: '', status: '' }) }); }}>{tx('مسح المرشحات', 'Clear filters')}</Button>
      </div>
      <WorkTable label="directory" tx={tx} rows={shown} rowKey={r => r.name} pageSize={20} profile360={r => ({ doctype: "Employee", name: r.name })}
        searchText={searchText}
        cols={[
          { key: 'name', ar: 'الموظف', en: 'Employee', sort: r => String(r['employee_name'] || r.name), render: r => <div><Link to="/digit-hr/employees/$name" params={{ name: r.name }} className="font-medium text-primary hover:underline" data-no-i18n>{String(r['employee_name'] || r.name)}</Link><div className="dhr-code" data-no-i18n>{r.name}</div></div> },
          ...(['company', 'department', 'designation'] as const).map((key, i) => ({ key, ar: ['الشركة', 'القسم', 'المسمى'][i] || key, en: ['Company', 'Department', 'Designation'][i] || key, sort: (r: typeof shown[number]) => String(r[key] || ''), render: (r: typeof shown[number]) => <span data-no-i18n>{String(r[key] || '—')}</span> })),
          { key: 'status', ar: 'الحالة', en: 'Status', sort: r => String(r['status'] || ''), render: r => <StatusBadge value={r['status']} /> },
          { key: 'source', ar: 'السجل الأصلي', en: 'Native record', render: r => <Link to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: 'erpnext', doctype: 'employee', name: r.name }} onClick={() => enterHrNative('01.4')} className="text-primary hover:underline">{tx('فتح', 'Open')}</Link> },
        ]} />
    </DigitHrLayout>
  );
}
