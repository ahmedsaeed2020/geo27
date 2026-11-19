import { createFileRoute, Link } from "@tanstack/react-router";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { Native, arLabel, s, useSources, DateRange, Chip, type R } from "@/components/digithr/workspaces/shared";
import { BackTo, ChangeLog, D, EmployeeRef, Fact, Facts, Findings, PositionRef, ProfileGate, ProfileHeader, RelatedTable, optLabel, todayIso, docState, type Finding } from "@/components/digithr/Record360Kit";
import { useStoreVersion } from "@/lib/adapter";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { assignmentTimeline, budgetCovering, departmentSeats, employeeContracts, positionFindings, reportingChain } from "@/plugins/digit_hr/record360Facts";

export const Route = createFileRoute("/digit-hr/positions/$name")({
  head: ({ params }) => ({ meta: [
    { title: `Position 360 — ${params.name} — DIGIT HR` },
    { name: "description", content: "Position 360: incumbent, reporting line, direct reports, successors, assignment history and the department headcount budget, from scoped HR records." },
    { property: "og:title", content: `Position 360 — ${params.name} — DIGIT HR` },
    { property: "og:description", content: "One position's holder, reporting line, succession and headcount context." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Position360,
});

const SRC = ["DIGIT Position", "DIGIT Succession Plan", "DIGIT Assignment History", "DIGIT Position Budget", "DIGIT Employment Contract", "Employee"];

function Position360() {
  const { name } = Route.useParams();
  const { tx } = useTx();
  useStoreVersion(); useSessionUser(); useScopeMetas(SRC);
  const src = useSources(tx);
  const title = tx("ملف المنصب 360", "Position 360");
  const crumbs = [{ label: tx("الهيكل التنظيمي", "Organization") }, { label: tx("المناصب", "Positions") }, { label: name }];
  const back = <BackTo section="01.3" label={tx("سجل المناصب", "Positions register")} attr="position" />;
  const positions = src.rows("DIGIT Position");
  const p = positions.find((x: R) => s(x.name) === name);
  return (
    <ProfileGate title={title} crumbs={crumbs} back={back} read={src.read("DIGIT Position")} found={!!p} missingAttr="position">
      {() => {
        const byName = (n: string) => positions.find((x: R) => s(x.name) === n);
        const line = reportingChain(p, byName);
        const reports = positions.filter((x: R) => s(x.reports_to) === name).sort((a: R, b: R) => s(a.position_title).localeCompare(s(b.position_title)) || s(a.name).localeCompare(s(b.name)));
        const history = assignmentTimeline(src.rows("DIGIT Assignment History"), name);
        const successors = src.rows("DIGIT Succession Plan").filter((x: R) => s(x.position) === name);
        const today = todayIso();
        const budgetsReady = src.ready("DIGIT Position Budget");
        const covering: R = budgetsReady ? budgetCovering(src.rows("DIGIT Position Budget"), p, today) : null;
        const otherBudgets = src.rows("DIGIT Position Budget").filter((b: R) => s(b.department) && s(b.department) === s(p.department) && s(b.company) === s(p.company) && b.name !== covering?.name);
        const seats = departmentSeats(positions, s(p.company), s(p.department));
        const incumbent = s(p.incumbent);
        const incumbentRow = incumbent ? (src.rows("Employee").find((e: R) => s(e.name) === incumbent) ?? null) : undefined;
        const contract: R = incumbent && src.ready("DIGIT Employment Contract") ? employeeContracts(src.rows("DIGIT Employment Contract"), incumbent).find((c: R) => s(c.contract_status) === "Active" && Number(c.docstatus ?? 0) !== 2) : undefined;
        const raw = positionFindings({ position: p, incumbentRow, successors, history, budgetCovering: budgetsReady ? covering : { name: "__not_evaluated__" } });
        const findings: Finding[] = raw.map((f) => ({
          key: f.code, tone: f.code === "filled_without_incumbent" || f.code === "history_holder_mismatch" ? "danger" : "warn",
          text: f.code === "vacant_no_successor" ? tx("المنصب شاغر ولا توجد خطة إحلال مسجلة له.", "The position is vacant and has no recorded succession plan.")
            : f.code === "filled_without_incumbent" ? tx("حالة المنصب «مشغول» لكن لا يوجد شاغل مسجل.", "The position is marked Filled but no incumbent is recorded.")
            : f.code === "incumbent_mismatch" ? tx(`قسم/مسمى الشاغل في ملفه يختلف عن المنصب: ${f.detail ?? ""}`, `The incumbent's own department/designation differs from the position: ${f.detail ?? ""}`)
            : f.code === "history_holder_mismatch" ? tx(`سجل الإسناد المفتوح يخص موظفاً آخر (${f.detail ?? ""}).`, `The open assignment-history row belongs to another employee (${f.detail ?? ""}).`)
            : tx("لا توجد ميزانية مناصب تغطي اليوم لهذا القسم.", "No position budget covers today for this department."),
        }));
        if (line.cycle) findings.push({ key: "reporting_cycle", tone: "danger", text: tx("خط التبعية يدور على نفسه؛ راجع حقل «يتبع».", "The reporting line loops back on itself; review the Reports to field.") });
        const t = s(p.position_title) || name;
        return (
          <DigitHrLayout record title={tx(arLabel(t), t)} crumbs={crumbs} subtitle={title}>
            {back}
            <ProfileHeader code={name} dt="DIGIT Position" module="01" attr="position" chips={<><Chip tone={s(p.position_status) === "Vacant" ? "warn" : undefined}>{optLabel(tx, p.position_status)}</Chip></>}>
              <Facts>
                <Fact label={tx("الشاغل", "Incumbent")} attr="incumbent"><EmployeeRef id={p.incumbent} tx={tx} /></Fact>
                <Fact label={tx("يتبع", "Reports to")} attr="reports-to"><PositionRef id={p.reports_to} tx={tx} /></Fact>
                <Fact label={tx("القسم", "Department")}><Native dt="Department" name={s(p.department) || undefined} module="01" className="text-primary hover:underline"><span data-no-i18n>{s(p.department) ? tx(arLabel(s(p.department)), s(p.department)) : "—"}</span></Native></Fact>
                <Fact label={tx("المسمى", "Designation")}><span data-no-i18n>{s(p.designation) ? tx(arLabel(s(p.designation)), s(p.designation)) : "—"}</span></Fact>
                <Fact label={tx("الملف الوظيفي", "Job profile")}>{s(p.job_profile) ? <Native dt="DIGIT Job Profile" name={s(p.job_profile)} module="01" className="text-primary hover:underline"><span data-no-i18n>{s(p.job_profile)}</span></Native> : <span>—</span>}</Fact>
                <Fact label={tx("الشركة", "Company")}><span data-no-i18n>{s(p.company) || "—"}</span></Fact>
                <Fact label={tx("ساري من", "Effective from")}><D v={p.effective_from} /></Fact>
                <Fact label={tx("عقد الشاغل الساري", "Incumbent's active contract")} attr="incumbent-contract">{contract ? <Link to="/digit-hr/contracts/$name" params={{ name: s(contract.name) }} className="text-primary hover:underline" data-contract-ref={s(contract.name)}><span data-no-i18n>{s(contract.name)}</span> · {optLabel(tx, contract.contract_type)}</Link> : !incumbent ? <span>—</span> : !src.ready("DIGIT Employment Contract") ? src.v(null, "DIGIT Employment Contract") : <span className="text-muted-foreground">{tx("لا يوجد عقد ساري مسجل", "No active contract recorded")}</span>}</Fact>
              </Facts>
            </ProfileHeader>
            <Findings items={findings} attr="position" tx={tx} />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
              <div className="min-w-0">
                <section className="mb-4" data-position-line>
                  <h2 className="mb-2 text-sm font-semibold">{tx("خط التبعية", "Reporting line")}</h2>
                  <ol className="space-y-1 text-sm">
                    {[...line.chain].reverse().map((x: R, i) => <li key={s(x.name)} className="flex min-h-9 items-center gap-2" style={{ paddingInlineStart: `${i * 14}px` }} data-line-up={s(x.name)}><PositionRef id={x.name} tx={tx} /><span className="text-xs text-muted-foreground">· <EmployeeRef id={x.incumbent} tx={tx} /></span></li>)}
                    <li className="flex min-h-9 items-center gap-2 font-semibold" style={{ paddingInlineStart: `${line.chain.length * 14}px` }} aria-current="true" data-line-self><span data-no-i18n>{tx(arLabel(t), t)}</span><span className="dhr-code text-xs text-muted-foreground" data-no-i18n>{name}</span></li>
                    {reports.map((x: R) => <li key={s(x.name)} className="flex min-h-9 flex-wrap items-center gap-2" style={{ paddingInlineStart: `${(line.chain.length + 1) * 14}px` }} data-line-down={s(x.name)}><PositionRef id={x.name} tx={tx} /><Chip tone={s(x.position_status) === "Vacant" ? "warn" : undefined}>{optLabel(tx, x.position_status)}</Chip>{s(x.incumbent) && <span className="text-xs text-muted-foreground"><EmployeeRef id={x.incumbent} tx={tx} /></span>}</li>)}
                  </ol>
                  {line.brokenAt && <p className="mt-1 text-xs text-muted-foreground" data-line-broken>{tx(`المنصب الأعلى ${line.brokenAt} غير متاح لك، لذلك يتوقف الخط هنا.`, `The parent position ${line.brokenAt} is not visible to you, so the line stops here.`)}</p>}
                  {!reports.length && <p className="mt-1 text-xs text-muted-foreground">{tx("لا توجد مناصب تابعة مسجلة.", "No direct-report positions recorded.")}</p>}
                </section>
                <RelatedTable title={tx("سجل الإسناد", "Assignment history")} read={src.read("DIGIT Assignment History")} rows={history} attr="position-history" tx={tx}
                  head={[tx("السجل", "Record"), tx("الموظف", "Employee"), tx("الفترة", "Period"), tx("سبب التغيير", "Change reason")]}
                  row={(r: R) => <tr key={s(r.name)} className="h-11 border-t" data-history-row={s(r.name)} data-current={r.current ? "1" : undefined}>
                    <td className="px-3"><Native dt="DIGIT Assignment History" name={s(r.name)} module="01" className="text-primary hover:underline"><span data-no-i18n>{s(r.name)}</span></Native></td>
                    <td className="px-3"><EmployeeRef id={r.employee} tx={tx} />{r.current && <span className="ms-2"><Chip>{tx("حالي", "Current")}</Chip></span>}</td>
                    <td className="px-3"><DateRange from={r.from_date} to={r.to_date} /></td>
                    <td className="px-3">{optLabel(tx, r.change_reason)}</td>
                  </tr>} />
                <RelatedTable title={tx("خطة الإحلال", "Succession")} read={src.read("DIGIT Succession Plan")} rows={successors} attr="position-succession" tx={tx}
                  head={[tx("السجل", "Record"), tx("الخليفة", "Successor"), tx("الجاهزية", "Readiness"), tx("خطر الفقد", "Risk of loss")]}
                  row={(r: R) => <tr key={s(r.name)} className="h-11 border-t" data-succession-row={s(r.name)}>
                    <td className="px-3"><Native dt="DIGIT Succession Plan" name={s(r.name)} module="02" className="text-primary hover:underline"><span data-no-i18n>{s(r.name)}</span></Native></td>
                    <td className="px-3"><EmployeeRef id={r.successor} tx={tx} /></td>
                    <td className="px-3">{optLabel(tx, r.readiness)}</td>
                    <td className="px-3">{optLabel(tx, r.risk_of_loss)}</td>
                  </tr>} />
                <ChangeLog dt="DIGIT Position" name={name} tx={tx} />
              </div>
              <aside className="min-w-0 space-y-4" aria-label={tx("سياق القسم", "Department context")}>
                <section className="dhr-card rounded-[14px] p-4" data-position-budget={covering ? s(covering.name) : budgetsReady ? "none" : src.read("DIGIT Position Budget").state}>
                  <h2 className="mb-1 text-sm font-semibold">{tx("العدد المعتمد للقسم", "Department approved headcount")}</h2>
                  <p className="mb-3 text-[11px] text-muted-foreground">{tx("يقارن العدد المعتمد بالمناصب المسجلة فقط؛ لا تُحسب أي تكلفة.", "Compares approved headcount with recorded positions only; no cost is calculated.")}</p>
                  {!budgetsReady ? src.empty("DIGIT Position Budget") : covering ? <>
                    <Native dt="DIGIT Position Budget" name={s(covering.name)} module="01" className="font-medium text-primary hover:underline"><span data-no-i18n>{s(covering.budget_title) || s(covering.name)}</span></Native>
                    <div className="mt-1 text-xs text-muted-foreground"><DateRange from={covering.from_date} to={covering.to_date} /> · {optLabel(tx, covering.budget_status)} · {docState(tx, covering)}</div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                      <div><dt className="text-[11px] text-muted-foreground">{tx("معتمد", "Approved")}</dt><dd className="text-lg font-semibold" data-no-i18n data-budget-approved>{s(covering.approved_headcount) || "—"}</dd></div>
                      <div><dt className="text-[11px] text-muted-foreground">{tx("مناصب مسجلة", "Recorded")}</dt><dd className="text-lg font-semibold" data-no-i18n data-budget-recorded>{seats.total}</dd></div>
                      <div><dt className="text-[11px] text-muted-foreground">{tx("شاغرة", "Vacant")}</dt><dd className="text-lg font-semibold" data-no-i18n data-budget-vacant>{seats.vacant}</dd></div>
                    </dl>
                  </> : <p className="text-sm text-muted-foreground">{tx("لا توجد ميزانية تغطي اليوم.", "No budget covers today.")}</p>}
                  {otherBudgets.length > 0 && <ul className="mt-3 border-t pt-2 text-xs">{otherBudgets.map((b: R) => <li key={s(b.name)} className="flex min-h-8 items-center justify-between gap-2"><Native dt="DIGIT Position Budget" name={s(b.name)} module="01" className="text-primary hover:underline"><span data-no-i18n>{s(b.budget_title) || s(b.name)}</span></Native><DateRange from={b.from_date} to={b.to_date} /></li>)}</ul>}
                </section>
                <section className="dhr-card rounded-[14px] p-4" data-position-incumbent-card>
                  <h2 className="mb-2 text-sm font-semibold">{tx("الشاغل الحالي", "Current holder")}</h2>
                  {!incumbent ? <p className="text-sm text-muted-foreground">{tx("لا يوجد شاغل مسجل.", "No incumbent recorded.")}</p> : <dl className="space-y-2 text-sm">
                    <div><dt className="text-[11px] text-muted-foreground">{tx("الموظف", "Employee")}</dt><dd><EmployeeRef id={incumbent} tx={tx} /></dd></div>
                    {incumbentRow && <div><dt className="text-[11px] text-muted-foreground">{tx("قسم/مسمى الموظف", "Employee's department / designation")}</dt><dd data-no-i18n>{[s(incumbentRow.department), s(incumbentRow.designation)].filter(Boolean).map((x) => tx(arLabel(x), x)).join(" · ") || "—"}</dd></div>}
                    {incumbentRow && <div><dt className="text-[11px] text-muted-foreground">{tx("تاريخ الالتحاق", "Joined")}</dt><dd><D v={incumbentRow.date_of_joining} /></dd></div>}
                  </dl>}
                </section>
              </aside>
            </div>
          </DigitHrLayout>
        );
      }}
    </ProfileGate>
  );
}
