/**
 * Module 01 — Organization Explorer (Premium V2 flagship). Hero: company → department tree ↔ members of the selected
 * unit → employee card → Employee 360 / native record. Side: structural findings from real link checks (orgFacts),
 * span of control and attention items. Lower: full employee register and the organization exception register.
 * Selection, department filter and register state stay in the URL (`hr` register state), so Back returns to them.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { readRegister, writeRegister } from "@/plugins/digit_hr/registerState";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { sampleNameEn } from "@/i18n";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { statusFor } from "@/plugins/digit_hr/service";
import { branchOf, departmentTree, orgExceptions, rootsByCompany, unitFacts, type DeptNode, type OrgException } from "@/plugins/digit_hr/orgFacts";
import { MetricValue, useModuleScope } from "@/components/digithr/ModuleScope";
import { StatusBadge } from "@/components/digithr/ui";
import { Native, Chip, WorkTable, StatRow, arLabel, useSources, SourceNotice, s, live, drafts, type R } from "./shared";
import { ClearScope, CompanyScope, Facts, HrCommandHeader, HrContextToolbar, HrEmptyOrBlockedState, HrInsightPanel, HrOperationalKpi, HrWorkspaceGrid, Meter, Pill, ScopeDenied, Seg, SourcesPill, initials, relDay, useSearchPatch, useToday } from "../home/kit";

const UNSET = "—";
const EXC_GROUPS = [
  { id: "dept-missing", ar: "القسم غير موجود", en: "Department record missing", tone: "danger" as const, hintAr: "رابط القسم في سجل الموظف لا يطابق قسمًا موجودًا.", hintEn: "The employee's department link matches no Department record." },
  { id: "dept-company", ar: "قسم من شركة أخرى", en: "Department of another company", tone: "danger" as const, hintAr: "القسم ينتمي لشركة غير شركة الموظف.", hintEn: "The department belongs to a different company." },
  { id: "dept-disabled", ar: "قسم معطّل", en: "Disabled department", tone: "warn" as const, hintAr: "الموظف مرتبط بقسم معطّل.", hintEn: "The employee is linked to a disabled department." },
  { id: "manager-missing", ar: "المدير غير موجود", en: "Manager record missing", tone: "danger" as const, hintAr: "«المدير المباشر» لا يطابق موظفًا موجودًا.", hintEn: "Reports To matches no Employee record." },
  { id: "manager-inactive", ar: "المدير غير نشط", en: "Manager not active", tone: "warn" as const, hintAr: "المدير المباشر حالته ليست نشطة.", hintEn: "The Reports To employee is not active." },
  { id: "reporting-loop", ar: "حلقة في التسلسل الإداري", en: "Reporting loop", tone: "danger" as const, hintAr: "سلسلة «المدير المباشر» تعود إلى الموظف نفسه.", hintEn: "The Reports To chain returns to the same employee." },
  { id: "incomplete", ar: "بيانات ناقصة", en: "Incomplete record", tone: "warn" as const, hintAr: "القسم أو المسمى أو تاريخ الالتحاق فارغ.", hintEn: "Department, designation or joining date is empty." },
];
const FIELD_AR: Record<string, string> = { department: "القسم", designation: "المسمى", date_of_joining: "تاريخ الالتحاق" };
const MEMBER_COLS = "grid-cols-[minmax(0,1fr)_5.75rem_3.25rem]";

export function OrgWorkspace({ home = false }: { home?: boolean }) {
  const { tx } = useTx();
  useStoreVersion(); useSessionUser();
  useScopeMetas(["Employee", "Department", "Designation", "Employee Transfer", "Employee Promotion", "DIGIT Document Renewal"]);
  const search = useRouterState({ select: (state) => state.location.search }) as Record<string, unknown>;
  const navigate = useNavigate();
  const register = readRegister(search["hr"], "employee-directory");
  const src = useSources(tx);
  const scope = useModuleScope(src);
  const today = useToday();
  const [find, setFind] = useState("");
  const [showClean, setShowClean] = useState(false);
  const patch = useSearchPatch();
  const dept = register.group;
  const showAll = search["emp"] === "all";
  // NB1-06/UX-08: the explorer already lists the selected unit's members; the searchable register opens on demand
  // (URL `reg=open`) and stays open whenever it carries state (all statuses, search, sort, page).
  const regOpen = search["reg"] === "open" || showAll || !!register.q || !!register.sort || register.page > 0;
  const setReg = (label: string, patch: Record<string, unknown>) => void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, hr: writeRegister(prev["hr"], label, { ...readRegister(prev["hr"], label), ...patch }) }) });
  const setDept = (group: string) => setReg("employee-directory", { group, page: 0, selected: "" });
  const select = (name: string) => setReg("employee-directory", { selected: name });
  const showException = (kind: string) => { setReg("org-exceptions", { group: kind, page: 0 }); requestAnimationFrame(() => document.getElementById("org-exceptions")?.scrollIntoView({ block: "start" })); };

  const allEmps = src.rows("Employee");
  const inCo = (e: R) => scope.filter([e]).length > 0;
  const scoped = scope.filter(allEmps).filter(live);
  const emps = scoped.filter((e) => s(e.status || "Active") === "Active");
  const allDepts = src.rows("Department").filter(live);
  const depts = scope.company ? allDepts.filter((d) => !s(d.company) || s(d.company) === scope.company) : allDepts;
  const moves = scope.filter([...drafts(src.rows("Employee Transfer")), ...drafts(src.rows("Employee Promotion"))]);
  const docs = scope.filter(src.rows("DIGIT Document Renewal").map((d: R) => ({ ...d, status: statusFor(s(d.expiry_date), d.status) }))).filter((d) => s(d.status) === "Expiring" || s(d.status) === "Expired");
  const exists = (dt: string, name: string) => !!adapter.get(dt, name);
  const tree = useMemo(() => departmentTree(depts, emps, (name) => exists("Department", name)), [depts, emps]);
  const orgReady = src.ready("Employee", "Department") && scope.companyKnown;
  const exc = orgReady ? orgExceptions(allEmps, allDepts, exists, inCo) : { rows: [] as OrgException[], notEvaluated: 0, employees: [] as string[] };
  const byKind = (k: string) => exc.rows.filter((r) => r.kind === k).length;

  const inBranch = dept && dept !== UNSET ? branchOf(tree.roots, dept) : null;
  const inUnit = (e: R) => (!dept ? true : dept === UNSET ? !s(e.department) : !!inBranch?.has(s(e.department)));
  const members = emps.filter(inUnit).sort((a, b) => s(a.employee_name || a.name).localeCompare(s(b.employee_name || b.name)));
  const registerRows = (showAll ? scoped : emps).filter(inUnit);
  const cur = scoped.find((e) => s(e.name) === register.selected);
  const nameOf = (id: string) => (id ? s(allEmps.find((e) => s(e.name) === id)?.employee_name) || id : "");
  /** English screens show the sample people by their English name (display only), as every HR register does. */
  const en = (v: string) => sampleNameEn(v) ?? v;
  const reportsOf = (id: string) => emps.filter((e) => s(e.reports_to) === id).length;
  const kpi = (label: string, deps: string[]) => <MetricValue label={label} scope={scope} src={src} tx={tx} back="01" deps={deps} />;
  const node = dept && dept !== UNSET ? findNode(tree.roots, dept) : null;
  const maxTotal = Math.max(1, ...tree.roots.map((n) => n.total), tree.unassigned);
  const unitLabel = !dept ? tx("كل الأقسام", "All departments") : dept === UNSET ? tx("بلا قسم", "No department") : tx(arLabel(dept), dept);
  const span = emps.map((e) => ({ e, n: reportsOf(s(e.name)) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 6);
  const spanMax = Math.max(1, ...span.map((x) => x.n));
  const attention = [
    ...moves.map((d) => ({ key: "m" + s(d.name), dt: s(d.doctype) || (d.promotion_date ? "Employee Promotion" : "Employee Transfer"), name: s(d.name), who: s(d.employee_name) || s(d.employee), kind: tx("حركة وظيفية مسودة", "Draft employment change"), date: s(d.transfer_date || d.promotion_date), tone: "warn" as const })),
    ...docs.map((d) => ({ key: "d" + s(d.name), dt: "DIGIT Document Renewal", name: s(d.name), who: s(d.employee_name) || s(d.employee), kind: s(d.status) === "Expired" ? tx("وثيقة منتهية", "Document expired") : tx("وثيقة تنتهي قريبًا", "Document expiring"), date: s(d.expiry_date), tone: s(d.status) === "Expired" ? "danger" as const : "warn" as const })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const empRead = !scope.companyKnown ? { state: "DENIED" as const } : src.worst("Employee", "Department");
  const companyGroups = rootsByCompany(tree.roots);
  const anyKids = tree.roots.some((r) => r.children.length > 0);
  const flagged = new Set(exc.employees);
  const facts = unitFacts(members, emps, exc.employees, today);
  const cleanGroups = EXC_GROUPS.filter((g) => !byKind(g.id));
  const findingRow = (g: (typeof EXC_GROUPS)[number]) => { const c = byKind(g.id); return (
    <li key={g.id} className="flex min-h-11 items-center justify-between gap-3 py-1.5" data-finding={g.id}>
      <span className="min-w-0"><span className="flex items-center gap-2 text-[13px]"><span className="dhr-dot" data-tone={c ? g.tone : undefined} aria-hidden />{tx(g.ar, g.en)}</span><span className="block text-[11px] text-[var(--dhr-muted)]">{tx(g.hintAr, g.hintEn)}</span></span>
      {!orgReady ? <span className="text-[var(--dhr-muted)]">—</span> : c ? <button type="button" className="dhr-act shrink-0" onClick={() => showException(g.id)} aria-label={tx(`عرض ${c} — ${g.ar}`, `Show ${c} — ${g.en}`)}><b className="dhr-tnum" data-no-i18n>{c}</b></button> : <span className="dhr-tnum px-3 text-[var(--dhr-muted)]" data-no-i18n>0</span>}
    </li>); };

  return (
    <div className="space-y-4" data-module-home="01">
      <HrCommandHeader embedded={!home} id="01" code="01" suite={tx("الموارد البشرية الأساسية", "Core HR & Organization")} title={tx("مستكشف الهيكل التنظيمي", "Organization Explorer")}
        purpose={tx("الشركة ← القسم ← الموظف، مع ملاحظات هيكلية من روابط سجلات الموظفين والأقسام.", "Company → department → employee, with structural findings from Employee and Department links.")}
        actions={<><Native dt="Employee" module="01" className="dhr-act dhr-act-primary">{tx("سجل الموظفين الأصلي", "Employee records")}</Native><Native dt="Department" module="01" className="dhr-act">{tx("الأقسام", "Departments")}</Native></>}>
        <HrContextToolbar tx={tx} active={[scope.company, dept].filter(Boolean).length} scopeKey={[scope.company, scope.from, scope.to].join("|")} end={<><SourcesPill src={src} />{today && <Pill>{tx("بتاريخ", "As of")} <span data-no-i18n>{today}</span></Pill>}</>}>
          <CompanyScope scope={scope} tx={tx} />
          {dept && <Pill tone="info">{tx("الوحدة:", "Unit:")} <span data-no-i18n>{unitLabel}</span> <button type="button" className="ms-1 underline" onClick={() => setDept("")}>{tx("إلغاء", "clear")}</button></Pill>}
          <ClearScope scope={scope} tx={tx} />
        </HrContextToolbar>
      </HrCommandHeader>
      <ScopeDenied scope={scope} tx={tx} />
      <SourceNotice src={src} quietLoading />
      {/* owner HR-01: coloured counter cards from the same rows the explorer, findings and waiting list read */}
      {orgReady && <StatRow items={[{ label: tx("موظفون نشطون", "Active employees"), value: emps.length }, { label: tx("الأقسام", "Departments"), value: depts.length },
        { label: tx("مديرون لديهم فريق", "Managers with a team"), value: emps.filter((e) => reportsOf(s(e.name)) > 0).length },
        { label: tx("ملاحظات هيكلية", "Structural findings"), value: exc.rows.length, tone: exc.rows.length ? "warn" : undefined },
        { label: tx("بانتظار الإجراء", "Waiting for action"), value: attention.length, tone: attention.length ? "warn" : undefined }]} />}

      <HrWorkspaceGrid
        main={
          <HrInsightPanel title={tx("مستكشف الهيكل", "Organization explorer")} flush data-org-explorer
            meta={orgReady ? (() => { const co = companyGroups.filter((g) => g.company).length; return <><span data-no-i18n>{co}</span> {tx(co === 1 ? "شركة" : "شركات", co === 1 ? "company" : "companies")} · <span data-no-i18n>{depts.length}</span> {tx("قسم", depts.length === 1 ? "department" : "departments")} · <span data-no-i18n>{emps.length}</span> {tx("موظف نشط", "active employees")}</>; })() : undefined}
            info={tx("الشجرة من «القسم الأب» في سجلات الأقسام، مجمّعة حسب شركة القسم. العدد والشريط = الموظفون النشطون شاملًا الأقسام الفرعية (مباشر / إجمالي). اختيار شركة يضبط نطاق الصفحة كلها.", "Tree from Department.parent_department, grouped by the department's company. Count and bar = active employees including sub-units (direct / total). Choosing a company sets the scope of the whole page.")}
            actions={<label className="relative block w-full sm:w-52"><Search className="pointer-events-none absolute start-2.5 top-2.5 h-3.5 w-3.5 text-[var(--dhr-muted)]" aria-hidden /><input value={find} onChange={(e) => setFind(e.target.value)} placeholder={tx("بحث في الأقسام…", "Find a department…")} aria-label={tx("بحث في الأقسام", "Find a department")} className="dhr-compact-input w-full !ps-8" /></label>}>
            <div className="@container"><div className="grid @xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] @xl:divide-x @xl:divide-[var(--dhr-sep)] rtl:@xl:divide-x-reverse">
              {/* company → department tree */}
              <div className="max-h-[320px] overflow-auto p-2 @xl:h-[548px] @xl:max-h-none" data-dept-tree>
                {orgReady ? (
                  <ul className="space-y-0.5">
                    <li><TreeRow active={!dept} onClick={() => setDept("")} label={tx("كل الأقسام", "All departments")} count={emps.length} max={maxTotal} total={emps.length} indent={false} /></li>
                    {companyGroups.map((g) => { const on = !!g.company && scope.company === g.company; return (
                      <li key={g.company || "_"} data-company-node={g.company || "—"}>
                        {g.company ? (
                          <button type="button" className="dhr-co-row rounded-md hover:bg-[var(--dhr-neutral)]" aria-pressed={on} onClick={() => scope.set({ company: on ? "" : g.company })} title={on ? tx("إلغاء نطاق الشركة", "Clear the company scope") : tx("اجعل هذه الشركة نطاق الصفحة", "Make this company the page scope")}>
                            <span className="dhr-dot" data-tone={on ? "success" : undefined} aria-hidden /><span className="min-w-0 flex-1 truncate text-start" data-no-i18n>{tx(arLabel(g.company), g.company)}</span><b className="dhr-tnum" data-no-i18n>{g.total}</b>
                          </button>
                        ) : <div className="dhr-co-row"><span className="dhr-dot" aria-hidden /><span className="min-w-0 flex-1 truncate">{tx("شركة القسم غير مسجلة", "Company not recorded")}</span><b className="dhr-tnum" data-no-i18n>{g.total}</b></div>}
                        <ul className="space-y-0.5">{g.nodes.map((n) => <DeptBranch key={n.name} node={n} depth={0} dept={dept} setDept={setDept} tx={tx} find={find.trim().toLocaleLowerCase()} max={maxTotal} indent={anyKids} />)}</ul>
                      </li>); })}
                    {tree.unassigned > 0 && <li className="pt-1"><TreeRow active={dept === UNSET} onClick={() => setDept(dept === UNSET ? "" : UNSET)} label={tx("بلا قسم", "No department")} count={tree.unassigned} max={maxTotal} total={tree.unassigned} indent={false} flag={<Chip tone="warn">{tx("ملاحظة", "finding")}</Chip>} /></li>}
                  </ul>
                ) : <div className="p-2"><HrEmptyOrBlockedState read={empRead} tx={tx} rows={6} /></div>}
              </div>
              {/* the selected unit: facts, employee card, members */}
              <div className="flex min-h-[320px] flex-col border-t border-[var(--dhr-sep)] @xl:h-[548px] @xl:border-t-0" data-org-members={members.length}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--dhr-sep)] px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold" data-no-i18n>{unitLabel}</div>
                    <div className="text-[11.5px] text-[var(--dhr-muted)]">
                      {node ? <><span data-no-i18n>{node.children.length}</span> {tx("وحدة فرعية", "sub-units")}{node.company ? <> · <span data-no-i18n>{tx(arLabel(node.company), node.company)}</span></> : null}{node.parent ? <> · {tx("تتبع", "under")} <span data-no-i18n>{tx(arLabel(node.parent), node.parent)}</span></> : null}</> : dept === UNSET ? tx("موظفون نشطون بلا قسم في سجلهم", "Active employees with no department on their record") : tx("كل الوحدات ضمن نطاقك", "Every unit in your scope")}
                    </div>
                  </div>
                  {node && !node.missing && <Native dt="Department" name={node.name} module="01" className="dhr-act">{tx("فتح القسم", "Open department")}</Native>}
                </div>
                {orgReady && (
                  <dl className="dhr-facts-strip" data-unit-facts>
                    <div title={tx("موظفون نشطون في الوحدة وفروعها", "Active employees in the unit and its sub-units")}><dt>{tx("نشطون", "Active")}</dt><dd data-no-i18n data-unit-fact="headcount">{facts.headcount}</dd></div>
                    <div title={tx("أعضاء لديهم مرؤوس مباشر نشط واحد على الأقل", "Members with at least one active direct report")}><dt>{tx("مديرون", "Managers")}</dt><dd data-no-i18n data-unit-fact="managers">{facts.managers}</dd></div>
                    <div title={tx("مسميات وظيفية مختلفة مسجلة", "Distinct designations recorded")}><dt>{tx("مسميات", "Designations")}</dt><dd data-no-i18n data-unit-fact="designations">{facts.designations}</dd></div>
                    <div title={tx("التحقوا خلال آخر 90 يومًا حسب تاريخ الالتحاق", "Joined in the last 90 days, by date of joining")}><dt>{tx("جدد (90 يومًا)", "New (90 d)")}</dt><dd data-no-i18n data-unit-fact="recent">{facts.recentJoiners ?? "—"}</dd></div>
                    <div title={tx("أعضاء لديهم ملاحظة هيكلية واحدة على الأقل", "Members with at least one structural finding")}><dt>{tx("بملاحظات", "With findings")}</dt><dd data-no-i18n data-unit-fact="findings" data-tone={facts.withFindings ? "warn" : undefined}>{facts.withFindings}</dd></div>
                  </dl>
                )}
                {cur && inUnit(cur) && (
                  <div className="dhr-fade-in border-b border-[var(--dhr-sep)] bg-[color-mix(in_oklab,var(--dhr-mint)_7%,transparent)] px-4 py-3" data-employee-card={s(cur.name)}>
                    <div className="flex items-start gap-3">
                      <span className="dhr-avatar !h-10 !w-10 !text-[13px]" aria-hidden data-no-i18n>{initials(tx(s(cur.employee_name) || s(cur.name), en(s(cur.employee_name) || s(cur.name))))}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><span className="truncate font-semibold" data-no-i18n>{tx(arLabel(s(cur.employee_name) || s(cur.name)), en(s(cur.employee_name) || s(cur.name)))}</span><StatusBadge value={cur.status || "Active"} />{flagged.has(s(cur.name)) && <Chip tone="warn">{tx("لديه ملاحظة", "Has a finding")}</Chip>}</div>
                        <div className="text-[12px] text-[var(--dhr-muted)]" data-no-i18n>{s(cur.name)} · {cur.designation ? tx(arLabel(s(cur.designation)), s(cur.designation)) : "—"}</div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 max-lg:hidden">
                        <Link to="/digit-hr/employees/$name" params={{ name: s(cur.name) }} className="dhr-act dhr-act-primary" data-open-360={s(cur.name)}>{tx("ملف الموظف 360", "Employee 360")}</Link>
                        <Native dt="Employee" name={s(cur.name)} module="01" className="dhr-act">{tx("السجل الأصلي", "Native record")}</Native>
                        <button type="button" className="dhr-act dhr-act-ghost" onClick={() => select("")}>{tx("إغلاق", "Close")}</button>
                      </div>
                    </div>
                    <div className="mt-3"><Facts items={[
                      [tx("القسم", "Department"), cur.department ? tx(arLabel(s(cur.department)), s(cur.department)) : "—"],
                      [tx("المدير المباشر", "Reports to"), cur.reports_to ? <Link to="/digit-hr/employees/$name" params={{ name: s(cur.reports_to) }} className="dhr-link">{tx(arLabel(nameOf(s(cur.reports_to))), nameOf(s(cur.reports_to)))}</Link> : "—"],
                      [tx("تاريخ الالتحاق", "Date of joining"), s(cur.date_of_joining)],
                      [tx("مرؤوسون مباشرون", "Direct reports"), String(reportsOf(s(cur.name)))],
                    ]} /></div>
                    <div className="mt-3 flex flex-wrap gap-2 lg:hidden">
                      <Link to="/digit-hr/employees/$name" params={{ name: s(cur.name) }} className="dhr-act dhr-act-primary">{tx("ملف الموظف 360", "Employee 360")}</Link>
                      <Native dt="Employee" name={s(cur.name)} module="01" className="dhr-act">{tx("السجل الأصلي", "Native record")}</Native>
                      <button type="button" className="dhr-act dhr-act-ghost" onClick={() => select("")}>{tx("إغلاق", "Close")}</button>
                    </div>
                  </div>
                )}
                {orgReady && members.length > 0 && <div className={`dhr-mhead ${MEMBER_COLS}`} aria-hidden><span>{tx("الموظف", "Employee")}</span><span>{tx("الالتحاق", "Joined")}</span><span className="text-end">{tx("مرؤوسون", "Reports")}</span></div>}
                <div className="min-h-0 flex-1 overflow-auto">
                  {orgReady ? members.length ? (
                    <ul aria-label={tx("موظفو الوحدة", "Unit members")}>
                      {members.slice(0, 300).map((e) => { const id = s(e.name); const nm = s(e.employee_name) || id; const n = reportsOf(id); return (
                        <li key={id}>
                          <button type="button" onClick={() => select(register.selected === id ? "" : id)} aria-pressed={register.selected === id} className={`dhr-mrow ${MEMBER_COLS}`} data-member={id}>
                            <span className="flex min-w-0 items-center gap-2.5">
                              <span className="dhr-avatar" aria-hidden data-no-i18n>{initials(tx(nm, en(nm)))}</span>
                              <span className="min-w-0"><span className="flex items-center gap-1.5"><span className="truncate font-medium" data-no-i18n>{tx(arLabel(nm), en(nm))}</span>{flagged.has(id) && <span className="dhr-dot" data-tone="warn" title={tx("لديه ملاحظة هيكلية", "Has a structural finding")} aria-label={tx("لديه ملاحظة هيكلية", "Has a structural finding")} />}</span><span className="block truncate text-[11.5px] font-normal text-[var(--dhr-muted)]" data-no-i18n>{e.designation ? tx(arLabel(s(e.designation)), s(e.designation)) : tx("بلا مسمى", "No designation")}{e.reports_to ? ` · ${tx("يتبع", "reports to")} ${tx(arLabel(nameOf(s(e.reports_to))), en(nameOf(s(e.reports_to))))}` : ""}</span></span>
                            </span>
                            <span className="dhr-tnum text-[12px] text-[var(--dhr-muted)]" data-no-i18n>{s(e.date_of_joining) || "—"}</span>
                            <span className="text-end">{n > 0 ? <span className="dhr-pill" title={tx("مرؤوسون مباشرون", "Direct reports")}><span data-no-i18n>{n}</span></span> : null}</span>
                          </button>
                        </li>); })}
                    </ul>
                  ) : <div className="p-4"><HrEmptyOrBlockedState tx={tx} title={tx("لا موظفين نشطين في هذه الوحدة.", "No active employees in this unit.")} body={tx("الوحدة موجودة لكن لا يرتبط بها موظف نشط ضمن نطاقك.", "The unit exists but no active employee in your scope is linked to it.")} /></div>
                  : <div className="p-4"><HrEmptyOrBlockedState read={empRead} tx={tx} rows={5} /></div>}
                </div>
              </div>
            </div></div>
          </HrInsightPanel>
        }
        side={<>
          <HrInsightPanel title={tx("ملاحظات هيكلية", "Structural findings")} meta={tx("فحوص روابط فعلية — ليست درجات مخاطر.", "Real link checks — not risk scores.")} data-structural-findings
            info={tx("كل فحص يقارن رابطًا في سجل الموظف بسجل موجود فعلًا (قسم، شركة القسم، المدير المباشر). الرابط الذي لا تملك قراءته لا يُعدّ خطأً ولا سليمًا.", "Each check compares a link on the Employee record with a record that actually exists (department, department company, Reports To). A link you cannot read counts as neither an error nor healthy.")}>
            <div className="grid grid-cols-3 gap-2">
              <HrOperationalKpi label={tx("موظفون نشطون", "Active employees")} value={kpi("Active Headcount", ["Employee"])} />
              <HrOperationalKpi label={tx("أقسام في النطاق", "Departments")} value={src.v(<Native dt="Department" module="01" filters={scope.company ? [["company", "=", scope.company]] : undefined}>{depts.length}</Native>, "Department")} />
              <HrOperationalKpi label={tx("موظفون بملاحظات", "With findings")} value={kpi("Organization Exceptions", ["Employee", "Department"])} tone={exc.employees.length ? "warn" : undefined} />
            </div>
            <ul className="mt-3 divide-y divide-[var(--dhr-sep)]">
              {(orgReady ? EXC_GROUPS.filter((g) => byKind(g.id) > 0) : EXC_GROUPS).map((g) => findingRow(g))}
              {orgReady && cleanGroups.length > 0 && (
                <li data-clean-checks={cleanGroups.length}>
                  <button type="button" className="flex min-h-10 w-full items-center justify-between gap-3 py-1.5 text-start text-[13px]" aria-expanded={showClean} onClick={() => setShowClean(!showClean)}>
                    <span className="flex items-center gap-2"><span className="dhr-dot" data-tone="success" aria-hidden />{tx(`${cleanGroups.length} فحوص بلا ملاحظات`, `${cleanGroups.length} checks with no finding`)}</span>
                    <span className="text-[12px] text-[var(--dhr-emerald)]">{showClean ? tx("إخفاء", "Hide") : tx("عرض", "Show")}</span>
                  </button>
                  {showClean && <ul className="divide-y divide-[var(--dhr-sep)] border-t border-[var(--dhr-sep)]">{cleanGroups.map((g) => findingRow(g))}</ul>}
                </li>
              )}
              <li className="flex min-h-10 items-center justify-between gap-3 py-1.5"><span className="text-[13px]">{tx("بلا قسم", "No department")}</span><span className="dhr-tnum px-3 font-semibold">{kpi("Unassigned Department", ["Employee"])}</span></li>
              <li className="flex min-h-10 items-center justify-between gap-3 py-1.5"><span className="text-[13px]">{tx("حركات وظيفية معلقة", "Pending employment changes")}</span><span className="dhr-tnum px-3 font-semibold">{kpi("Pending Employment Changes", ["Employee Transfer", "Employee Promotion"])}</span></li>
              <li className="flex min-h-10 items-center justify-between gap-3 py-1.5"><span className="text-[13px]">{tx("وثائق تنتهي أو منتهية", "Documents expiring / expired")}</span><span className="dhr-tnum px-3 font-semibold">{kpi("Expiring Documents", ["DIGIT Document Renewal"])}</span></li>
            </ul>
            {exc.notEvaluated > 0 && <p className="mt-2 text-[11px] text-[var(--dhr-muted)]" data-inference="NOT_EVALUATED">{tx(`${exc.notEvaluated} رابط (قسم/مدير) خارج صلاحية قراءتك لم يُقيَّم.`, `${exc.notEvaluated} department/manager link(s) outside your read scope were not evaluated.`)}</p>}
          </HrInsightPanel>

          <HrInsightPanel title={tx("نطاق الإشراف", "Span of control")} meta={span.length ? tx(`أكثر ${span.length} مديرين مرؤوسين`, `Top ${span.length} managers by direct reports`) : undefined} info={tx("عدد الموظفين النشطين الذين يشير حقل «المدير المباشر» في سجلهم إلى المدير.", "Active employees whose Reports To field points to the manager.")} data-span-of-control>
            {!orgReady ? <HrEmptyOrBlockedState read={empRead} tx={tx} rows={3} /> : span.length ? (
              <ul className="space-y-2">{span.map(({ e, n }) => (
                <li key={s(e.name)} className="grid grid-cols-[minmax(0,1fr)_5rem_2rem] items-center gap-2 text-[13px]">
                  <Link to="/digit-hr/employees/$name" params={{ name: s(e.name) }} className="dhr-link truncate" data-no-i18n>{tx(arLabel(s(e.employee_name) || s(e.name)), s(e.employee_name) || s(e.name))}</Link>
                  <Meter value={n} max={spanMax} label={tx(`${n} مرؤوس`, `${n} reports`)} />
                  <b className="dhr-tnum text-end" data-no-i18n>{n}</b>
                </li>))}</ul>
            ) : <HrEmptyOrBlockedState tx={tx} title={tx("لا توجد علاقات «مدير مباشر» مسجلة.", "No Reports To relationships recorded.")} body={tx("أضف المدير المباشر في سجل الموظف لعرض نطاق الإشراف.", "Set Reports To on employee records to see spans of control.")} />}
          </HrInsightPanel>

          <HrInsightPanel title={tx("بانتظار الإجراء", "Waiting for action")} meta={tx("حركات وظيفية مسودة ووثائق قاربت على الانتهاء", "Draft employment changes and documents near expiry")} flush data-org-attention={attention.length}>
            {attention.length ? (
              <ul className="divide-y divide-[var(--dhr-sep)]">{attention.slice(0, 6).map((a) => (
                <li key={a.key} className="flex min-h-11 items-center justify-between gap-2 px-4 py-2">
                  <span className="min-w-0"><Native dt={a.dt} name={a.name} module="01" className="dhr-link block truncate text-[13px] font-medium"><span data-no-i18n>{tx(arLabel(a.who), a.who) || a.name}</span></Native><span className="block text-[11.5px] text-[var(--dhr-muted)]">{a.kind}</span></span>
                  {a.date && <Pill tone={a.tone}><span data-no-i18n>{relDay(today, a.date, tx)}</span></Pill>}
                </li>))}</ul>
            ) : <div className="p-4"><HrEmptyOrBlockedState read={src.worst("Employee Transfer", "Employee Promotion", "DIGIT Document Renewal")} tx={tx} title={tx("لا شيء بانتظار الإجراء.", "Nothing waiting.")} /></div>}
          </HrInsightPanel>
        </>}
      />

      <HrInsightPanel title={tx("سجل الموظفين", "Employee register")} data-employee-register
        meta={<>{tx("مرشّح بوحدة المستكشف:", "Filtered by the explorer unit:")} <span data-no-i18n>{unitLabel}</span></>}
        actions={regOpen
          ? <><Seg label={tx("حالة التوظيف", "Employment status")} value={showAll ? "all" : "active"} onChange={(v) => patch({ emp: v === "all" ? "all" : undefined })} options={[{ id: "active", label: tx("النشطون", "Active") }, { id: "all", label: tx("كل الحالات", "All statuses") }]} />
              {!showAll && <button type="button" className="dhr-act dhr-act-ghost" aria-expanded onClick={() => patch({ reg: undefined }, true)} data-register-toggle="close">{tx("طيّ السجل", "Collapse register")}</button>}</>
          : <button type="button" className="dhr-act" aria-expanded={false} onClick={() => patch({ reg: "open" }, true)} data-register-toggle="open">{tx(`بحث وأعمدة وكل الحالات (${registerRows.length})`, `Search, columns & all statuses (${registerRows.length})`)}</button>}>
        {!regOpen ? <p className="text-[12.5px] text-[var(--dhr-muted)]" data-register-collapsed>{tx("موظفو الوحدة المختارة معروضون في المستكشف أعلاه. افتح السجل للبحث أو تغيير الأعمدة أو عرض غير النشطين.", "The selected unit's members are listed in the explorer above. Open the register to search, change columns or include inactive employees.")}</p> :
        <WorkTable<R> label="employee-directory" tx={tx} rows={registerRows} emptyState={orgReady ? undefined : <HrEmptyOrBlockedState read={empRead} tx={tx} rows={4} />} rowKey={(e) => s(e.name)} selected={register.selected} onSelect={() => undefined} pageSize={12} minWidth={860}
          searchText={(e) => `${s(e.employee_name)} ${s(e.name)} ${s(e.designation)} ${s(e.department)}`}
          cols={[
            { key: "n", ar: "الموظف", en: "Employee", sort: (e) => s(e.employee_name), render: (e) => <span data-no-i18n><Link to="/digit-hr/employees/$name" params={{ name: s(e.name) }} onClick={(x) => x.stopPropagation()} className="dhr-link font-medium">{tx(arLabel(s(e.employee_name) || s(e.name)), s(e.employee_name) || s(e.name))}</Link><span className="block text-[11px] text-[var(--dhr-muted)]">{s(e.name)}</span></span> },
            { key: "st", ar: "حالة التوظيف", en: "Status", sort: (e) => s(e.status), render: (e) => <StatusBadge value={e.status || "Active"} /> },
            { key: "c", ar: "الشركة", en: "Company", sort: (e) => s(e.company), render: (e) => <span data-no-i18n className="text-[12.5px]">{e.company ? tx(arLabel(s(e.company)), s(e.company)) : "—"}</span> },
            { key: "d", ar: "القسم", en: "Department", sort: (e) => s(e.department), render: (e) => <span data-no-i18n>{e.department ? tx(arLabel(s(e.department)), s(e.department)) : "—"}</span> },
            { key: "g", ar: "المسمى", en: "Designation", sort: (e) => s(e.designation), render: (e) => <span data-no-i18n>{e.designation ? tx(arLabel(s(e.designation)), s(e.designation)) : "—"}</span> },
            { key: "m", ar: "المدير المباشر", en: "Reports to", sort: (e) => nameOf(s(e.reports_to)), render: (e) => <span data-no-i18n className="text-[12.5px]">{e.reports_to ? tx(arLabel(nameOf(s(e.reports_to))), en(nameOf(s(e.reports_to)))) : "—"}</span> },
            { key: "j", ar: "تاريخ الالتحاق", en: "Joined", sort: (e) => s(e.date_of_joining), render: (e) => <span data-no-i18n className="text-[12.5px]">{s(e.date_of_joining) || "—"}</span> },
            { key: "a", ar: "الإجراء", en: "Action", render: (e) => <Native dt="Employee" name={s(e.name)} module="01" className="dhr-act">{tx("فتح", "Open")}</Native> },
          ]} />}
      </HrInsightPanel>

      <section id="org-exceptions" className="dhr-panel scroll-mt-4" data-org-exceptions={exc.rows.length}>
        <div className="dhr-panel-h"><div><h2 className="dhr-panel-t">{tx("سجل الاستثناءات التنظيمية", "Organization exception register")}</h2><div className="dhr-panel-m">{tx("الرابط الذي لا تملك قراءته لا يُعدّ خطأً ولا سليمًا. التصحيح يتم في السجل الأصلي.", "A link you cannot read counts as neither an error nor healthy. Corrections happen in the native record.")}</div></div></div>
        <div className="dhr-panel-b">
          <WorkTable<OrgException> label="org-exceptions" tx={tx} rows={exc.rows} rowKey={(r) => `${r.employee}:${r.kind}`} groups={EXC_GROUPS} groupOf={(r) => r.kind} pageSize={10}
            emptyState={orgReady ? undefined : <HrEmptyOrBlockedState read={empRead} tx={tx} rows={3} />} searchText={(r) => `${r.employeeName} ${r.employee} ${r.detail}`}
            cols={[
              { key: "e", ar: "الموظف", en: "Employee", sort: (r) => r.employeeName, render: (r) => <span data-no-i18n><Native dt="Employee" name={r.employee} module="01" className="dhr-link font-medium">{tx(arLabel(r.employeeName), r.employeeName)}</Native><span className="block text-[11px] text-[var(--dhr-muted)]">{r.employee}</span></span> },
              { key: "k", ar: "الاستثناء", en: "Exception", sort: (r) => r.kind, render: (r) => { const g = EXC_GROUPS.find((x) => x.id === r.kind); return g ? <Chip tone={g.tone}>{tx(g.ar, g.en)}</Chip> : null; } },
              { key: "d", ar: "الدليل", en: "Evidence", render: (r) => <span data-no-i18n className="text-xs">{r.kind === "incomplete" ? r.detail.split(", ").map((f) => tx(FIELD_AR[f] ?? f, f)).join("، ") : r.ref ? <Native dt={r.ref.doctype} name={r.ref.name} module="01" className="dhr-link">{tx(arLabel(r.detail), r.detail)}</Native> : tx(arLabel(r.detail), r.detail)}</span> },
              { key: "a", ar: "الإجراء", en: "Action", render: (r) => <Native dt="Employee" name={r.employee} module="01" className="dhr-act">{tx("تصحيح في السجل الأصلي", "Fix in native record")}</Native> },
            ]} />
        </div>
      </section>
    </div>
  );
}

function findNode(roots: DeptNode[], name: string): DeptNode | null {
  for (const n of roots) { if (n.name === name) return n; const c = findNode(n.children, name); if (c) return c; }
  return null;
}
const matches = (n: DeptNode, q: string): boolean => !q || n.name.toLocaleLowerCase().includes(q) || n.children.some((c) => matches(c, q));

function TreeRow({ active, onClick, label, count, total, max, flag, toggle, indent = true }: { active: boolean; onClick: () => void; label: ReactNode; count: ReactNode; total: number; max: number; flag?: ReactNode; toggle?: ReactNode; /** reserve the expand column (only when some node has children) */ indent?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {indent && <span className="inline-flex w-6 shrink-0 justify-center">{toggle}</span>}
      <button type="button" onClick={onClick} aria-current={active ? true : undefined} className="dhr-treerow min-w-0 flex-1">
        <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="truncate" data-no-i18n>{label}</span>{flag}</span><span className="mt-1 block w-full max-w-[9rem]"><Meter value={total} max={max} tone={active ? "success" : "neutral"} /></span></span>
        <b className="dhr-tnum shrink-0 text-[12.5px]" data-no-i18n>{count}</b>
      </button>
    </div>
  );
}

function DeptBranch({ node, depth, dept, setDept, tx, find, max, indent }: { node: DeptNode; depth: number; dept: string; setDept: (d: string) => void; tx: (a: string, b: string) => string; find: string; max: number; indent: boolean }) {
  const [open, setOpen] = useState(true);
  if (!matches(node, find)) return null;
  const expanded = open || !!find;
  const toggle = node.children.length > 0 ? (
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={expanded} aria-label={expanded ? tx(`طي ${arLabel(node.name)}`, `Collapse ${node.name}`) : tx(`توسيع ${arLabel(node.name)}`, `Expand ${node.name}`)} className="inline-flex h-7 w-6 items-center justify-center rounded text-[var(--dhr-muted)] hover:bg-[var(--dhr-neutral)]">
      {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />}
    </button>
  ) : null;
  return (
    <li data-dept-node={node.name} data-dept-missing={node.missing ? 1 : undefined} style={{ paddingInlineStart: `${depth * 14}px` }}>
      <TreeRow active={dept === node.name} onClick={() => setDept(dept === node.name ? "" : node.name)} toggle={toggle} indent={indent} max={max} total={node.total}
        label={tx(arLabel(node.name), node.name)} count={node.children.length ? `${node.direct} / ${node.total}` : node.direct}
        flag={node.missing ? <Chip tone="danger">{tx("غير موجود", "missing")}</Chip> : node.disabled ? <Chip tone="warn">{tx("معطّل", "disabled")}</Chip> : undefined} />
      {expanded && node.children.length > 0 && <ul className="space-y-0.5">{node.children.map((c) => <DeptBranch key={c.name} node={c} depth={depth + 1} dept={dept} setDept={setDept} tx={tx} find={find} max={max} indent={indent} />)}</ul>}
    </li>
  );
}
