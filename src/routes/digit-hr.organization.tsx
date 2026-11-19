import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { enterHrNative } from "@/components/digithr/HrNav";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { placeDoc } from "@/plugins/digit_hr/v6/nav";
import { useSources, SourceNotice } from "@/components/digithr/workspaces/shared";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

export const Route = createFileRoute("/digit-hr/organization")({
  head: () => ({ meta: [
    { title: "DIGIT HR — Organization Explorer" },
    { name: "description", content: "Company and department hierarchy with headcount, positions and approved budgets from native HR records." },
    { property: "og:title", content: "DIGIT HR — Organization Explorer" },
    { property: "og:description", content: "Explore companies, departments, branches and positions." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: OrgExplorer,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;
const s = (v: unknown) => (v == null ? "" : String(v));

function NativeLink({ dt, name, children }: { dt: string; name?: string; children: React.ReactNode }) {
  const p = placeDoc(dt, "01");
  if (!p) return <span>{children}</span>;
  return name
    ? <Link to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: p.app, doctype: p.slug, name }} onClick={() => enterHrNative(p.sub)} className="hover:underline">{children}</Link>
    : <Link to="/app/$app/$doctype" search={HR_DOC_SEARCH as never} params={{ app: p.app, doctype: p.slug }} onClick={() => enterHrNative(p.sub)} className="hover:underline">{children}</Link>;
}

function OrgExplorer() {
  const { tx } = useTx();
  const src = useSources(tx);
  useStoreVersion(); useSessionUser();
  const companies = src.rows("Company");
  const depts = src.rows("Department");
  const emps = src.rows("Employee").filter((e) => s(e.status || "Active") === "Active");
  const positions = src.rows("DIGIT Position");
  const budgets = src.rows("DIGIT Position Budget").filter((b) => s(b.budget_status) === "Approved");
  const branches = src.rows("Branch");
  const [company, setCompany] = useState<string>("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const inCo = (r: R) => !company || !r.company || s(r.company) === company;
  const D = depts.filter(inCo);
  const kids = (parent: string) => D.filter((d) => s(d.parent_department) === parent && s(d.name) !== parent);
  const roots = D.filter((d) => !d.parent_department || !D.some((x) => s(x.name) === s(d.parent_department)));
  const stat = (dep: string) => {
    const p = positions.filter((x) => s(x.department) === dep);
    return {
      hc: emps.filter((e) => s(e.department) === dep && inCo(e)).length,
      pos: p.length,
      vacant: p.filter((x) => s(x.position_status) === "Vacant").length,
      approved: budgets.filter((b) => s(b.department) === dep).reduce((a, b) => a + Number(b.approved_headcount || 0), 0),
    };
  };

  const Node = ({ d, depth }: { d: R; depth: number }) => {
    const n = s(d.name); const c = kids(n); const st = stat(n); const isOpen = open[n] ?? depth < 1;
    return (
      <li>
        <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-md px-2 hover:bg-[var(--dhr-mint-50, var(--em-50))]" style={{ paddingInlineStart: 8 + depth * 20 }}>
          <button type="button" aria-label={tx("توسيع", "Toggle")} disabled={!c.length} onClick={() => setOpen({ ...open, [n]: !isOpen })} className="h-7 w-7 rounded text-sm disabled:opacity-30">{c.length ? (isOpen ? "▾" : "▸") : "•"}</button>
          <span className="min-w-0 flex-1 truncate font-medium" data-no-i18n><NativeLink dt="Department" name={n}>{s(d.department_name) || n}</NativeLink></span>
          <span className="flex basis-full flex-wrap gap-2 ps-9 sm:basis-auto sm:ps-0">
            <span className="dhr-chip text-xs">{tx("الموظفون", "Headcount")} <b data-no-i18n>{src.v(st.hc, "Employee")}</b></span>
            <span className="dhr-chip text-xs">{tx("المناصب", "Positions")} <b data-no-i18n>{src.v(st.pos, "DIGIT Position")}</b></span>
            <span className="dhr-chip text-xs">{tx("شاغرة", "Vacant")} <b data-no-i18n>{src.v(st.vacant, "DIGIT Position")}</b></span>
            <span className="dhr-chip text-xs">{tx("المعتمد", "Approved")} <b data-no-i18n>{src.v(st.approved || "—", "DIGIT Position Budget")}</b></span>
          </span>
        </div>
        {isOpen && c.length > 0 && <ul>{c.map((k) => <Node key={s(k.name)} d={k} depth={depth + 1} />)}</ul>}
      </li>
    );
  };

  return (
    <DigitHrLayout title={tx("مستكشف الهيكل التنظيمي", "Organization explorer")} subtitle={tx("الشركات والأقسام والفروع والمناصب من السجلات الأصلية. الأعداد هي السجلات المتاحة لك فقط.", "Companies, departments, branches and positions from native records. Counts are records visible to you only.")} crumbs={[{ label: tx("الهيكل التنظيمي", "Organization") }]}>
      <SourceNotice src={src} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm">{tx("الشركة", "Company")}{" "}
          <select value={company} onChange={(e) => setCompany(e.target.value)} className="ms-2 min-h-11 rounded-md border bg-background px-2">
            <option value="">{tx("كل الشركات", "All companies")}</option>
            {companies.map((c) => <option key={s(c.name)} value={s(c.name)} data-no-i18n>{s(c.name)}</option>)}
          </select>
        </label>
        <NativeLink dt="Company"><span className="dhr-chip">{tx("الشركات", "Companies")} <b data-no-i18n>{companies.length}</b></span></NativeLink>
        <NativeLink dt="Branch"><span className="dhr-chip">{tx("الفروع", "Branches")} <b data-no-i18n>{branches.length}</b></span></NativeLink>
        <NativeLink dt="DIGIT Position"><span className="dhr-chip">{tx("المناصب", "Positions")} <b data-no-i18n>{positions.length}</b></span></NativeLink>
      </div>
      <section className="dhr-card mb-6 rounded-[18px] p-4">
        <h2 className="mb-2 font-semibold">{tx("شجرة الأقسام", "Department tree")}</h2>
        {roots.length ? <ul>{roots.map((d) => <Node key={s(d.name)} d={d} depth={0} />)}</ul> : <p className="text-sm opacity-70">{tx("لا توجد أقسام متاحة لك.", "No departments visible to you.")}</p>}
      </section>
      <section className="dhr-card rounded-[18px] p-4">
        <h2 className="mb-2 font-semibold">{tx("سجل المناصب", "Position register")}</h2>
        {positions.length ? (
          <ul className="divide-y">
            {positions.filter((p) => !company || !p.company || s(p.company) === company).map((p) => (
              <li key={s(p.name)}>
                <Link to="/digit-hr/positions/$name" params={{ name: s(p.name) }} className="flex min-h-11 items-center justify-between gap-2 px-2 text-sm hover:bg-[var(--dhr-mint-50, var(--em-50))]">
                  <span data-no-i18n>{s(p.position_title) || s(p.name)}</span>
                  <span className="dhr-chip text-xs">{tx(({ Vacant: "شاغر", Filled: "مشغول", Frozen: "مجمّد", Closed: "مغلق" } as Record<string, string>)[s(p.position_status)] ?? s(p.position_status), s(p.position_status))}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm opacity-70">{tx("لا توجد مناصب بعد. أنشئ منصبًا من السجل الأصلي.", "No positions yet. Create one from the native register.")} <NativeLink dt="DIGIT Position"><u>{tx("فتح السجل", "Open register")}</u></NativeLink></p>}
      </section>
    </DigitHrLayout>
  );
}
