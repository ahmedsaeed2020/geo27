/**
 * NB-2 Organization depth panels for 01.2 (job architecture map), 01.5 (employment-change pipeline + person history) and
 * 01.6 (contract indicators). Display-only over scoped reads; the native registers below each panel stay unchanged and
 * every figure opens the rows it counts. Selection lives in the URL (?jp, ?emp, ?cf) so reload/back keep context.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { HrContextInspector, HrInsightPanel, HrOperationalKpi, Meter, Pill, useSearchPatch, type Tone } from "@/components/digithr/home/kit";
import { todayIso } from "@/components/digithr/Record360Kit";
import { allProfiles, contractIndicators, employeeTimeline, findProfile, jobArchitecture, movements, type ContractFilter, type FamilyNode, type Movement, type MovementStage, type TimelineEvent } from "@/plugins/digit_hr/orgDepth";
import { DateRange, Native, arLabel, s, useSources, type Sources } from "./shared";

type Tx = (ar: string, en: string) => string;
type Search = Record<string, unknown>;
const useSearch = () => useRouterState({ select: (r) => r.location.search as Search });
const str = (v: unknown) => (typeof v === "string" ? v : "");
const label = (tx: Tx, v: string) => tx(arLabel(v), v);

function EmpLink({ id, name, tx }: { id: string; name?: string | undefined; tx: Tx }) {
  if (!id) return <span>—</span>;
  const text = name || id;
  return <Link to="/digit-hr/employees/$name" params={{ name: id }} className="dhr-link" data-emp-link={id} data-no-i18n>{tx(arLabel(text), text)}</Link>;
}
function Chevron() { return <><ChevronLeft className="hidden h-3.5 w-3.5 rtl:block" aria-hidden /><ChevronRight className="h-3.5 w-3.5 rtl:hidden" aria-hidden /></>; }
function Notice({ src, dts }: { src: Sources; dts: string[] }) {
  const w = src.worst(...dts);
  return w ? <div className="py-2">{src.empty(...dts)}</div> : null;
}

/* ================================================================ 01.2 job architecture map */

export function JobArchitectureMap({ tx }: { tx: Tx }) {
  const src = useSources(tx); const search = useSearch(); const patch = useSearchPatch();
  const DTS = ["DIGIT Job Family", "DIGIT Job Profile", "Employee"];
  const ready = src.ready(...DTS);
  const arch = jobArchitecture(src.rows("DIGIT Job Family"), src.rows("DIGIT Job Profile"), src.rows("Employee"));
  const profiles = new Map(src.rows("DIGIT Job Profile").map((p) => [s(p.name), p]));
  const empName = new Map(src.rows("Employee").map((e) => [s(e.name), s(e.employee_name) || s(e.name)]));
  const sel = str(search["jp"]); const node = sel ? findProfile(arch, sel) : undefined; const rec = node ? profiles.get(node.name) : undefined;
  const pct = arch.coverage.designationsInUse ? Math.round((arch.coverage.covered / arch.coverage.designationsInUse) * 100) : 0;
  return (
    <HrInsightPanel data-job-map title={tx("خريطة البنية الوظيفية", "Job architecture map")}
      meta={tx("العائلة ← الملف الوظيفي ← المسمى ← الموظفون النشطون الذين يحملونه.", "Family → job profile → designation → active employees holding it.")}
      info={tx("الربط بين الموظف والوظيفة يتم عبر حقل المسمى في سجل الموظف فقط. المسمى الذي يصفه ملفان يُحتسب شاغلوه تحت كليهما. لا تُستنتج درجات أو رواتب.", "People are matched to jobs only through the Employee designation field. A designation described by two profiles counts its holders under both. No grades or pay are inferred.")}>
      {!ready ? <Notice src={src} dts={DTS} /> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-3">
            <div className="grid grid-cols-3 gap-2" data-job-kpis>
              <HrOperationalKpi label={tx("عائلات وظيفية", "Job families")} value={src.rows("DIGIT Job Family").length} source="DIGIT Job Family" />
              <HrOperationalKpi label={tx("ملفات وظيفية", "Job profiles")} value={profiles.size} source="DIGIT Job Profile" />
              <HrOperationalKpi label={tx("مسميات مستخدمة موصوفة", "Designations in use described")} value={<span data-job-coverage>{arch.coverage.covered}/{arch.coverage.designationsInUse}</span>} tone={pct < 50 ? "warn" : undefined} source="Employee.designation × DIGIT Job Profile.designation" sub={<Meter value={arch.coverage.covered} max={arch.coverage.designationsInUse} tone={pct < 50 ? "warn" : "success"} label={`${pct}%`} />} />
            </div>
            {arch.families.length === 0 && arch.unfiled.length === 0
              ? <p className="dhr-empty" data-job-empty>{tx("لا توجد عائلات أو ملفات وظيفية بعد — ابدأ من سجل العائلات الوظيفية أدناه.", "No job families or profiles yet — start from the job family register below.")}</p>
              : <ul className="space-y-0.5" role="tree" aria-label={tx("العائلات الوظيفية", "Job families")}>
                  {arch.families.map((f) => <FamilyBranch key={f.name} f={f} depth={0} sel={sel} onPick={(p) => patch({ jp: p === sel ? undefined : p })} tx={tx} />)}
                  {arch.unfiled.length > 0 && <li data-job-unfiled><div className="px-2 pt-2 text-[12px] font-semibold text-[var(--dhr-muted)]">{tx("ملفات بلا عائلة مقروءة", "Profiles without a readable family")}</div>
                    <ul>{arch.unfiled.map((p) => <ProfileRow key={p.name} p={p} depth={1} sel={sel} onPick={(x) => patch({ jp: x === sel ? undefined : x })} tx={tx} />)}</ul></li>}
                </ul>}
          </div>
          <div className="min-w-0 space-y-3">
            {node && rec ? (
              <HrContextInspector tx={tx} title={label(tx, node.title)} subtitle={<span data-no-i18n>{node.name}</span>} onClose={() => patch({ jp: undefined })}
                actions={<Native dt="DIGIT Job Profile" name={node.name} module="01" className="dhr-act dhr-act-sm">{tx("فتح الملف الأصلي", "Open native profile")}</Native>}>
                <div className="space-y-3 text-[13px]" data-job-inspector={node.name}>
                  <dl className="grid grid-cols-2 gap-2">
                    <div><dt className="text-[11px] text-[var(--dhr-muted)]">{tx("المسمى", "Designation")}</dt><dd>{node.designation ? label(tx, node.designation) : <Pill tone="warn">{tx("غير مرتبط", "Not linked")}</Pill>}</dd></div>
                    <div><dt className="text-[11px] text-[var(--dhr-muted)]">{tx("فئة الدرجة", "Grade band")}</dt><dd>{node.grade ? label(tx, node.grade) : "—"}</dd></div>
                  </dl>
                  {s(rec.responsibilities) && <div><div className="text-[11px] text-[var(--dhr-muted)]">{tx("المسؤوليات", "Responsibilities")}</div><p className="whitespace-pre-line" data-no-i18n>{s(rec.responsibilities)}</p></div>}
                  {s(rec.competencies) && <div><div className="text-[11px] text-[var(--dhr-muted)]">{tx("الكفاءات", "Competencies")}</div><p className="whitespace-pre-line" data-no-i18n>{s(rec.competencies)}</p></div>}
                  <div>
                    <div className="mb-1 text-[11px] text-[var(--dhr-muted)]">{tx("الموظفون النشطون بهذا المسمى", "Active employees with this designation")} <b data-no-i18n>{node.incumbents.length}</b></div>
                    {node.incumbents.length ? <ul className="divide-y divide-[var(--dhr-sep)] rounded-[var(--dhr-r-sm)] border border-[var(--dhr-sep)]" data-job-incumbents>{node.incumbents.map((id) => <li key={id} className="flex min-h-10 items-center justify-between gap-2 px-3 py-1.5"><EmpLink id={id} name={empName.get(id)} tx={tx} /><span className="dhr-code" data-no-i18n>{id}</span></li>)}</ul>
                      : <p className="dhr-empty">{tx("لا يوجد موظف نشط يحمل هذا المسمى.", "No active employee holds this designation.")}</p>}
                  </div>
                </div>
              </HrContextInspector>
            ) : (
              <section className="dhr-panel" data-job-findings>
                <div className="dhr-panel-h"><div className="min-w-0"><h3 className="dhr-panel-t">{tx("ما يحتاج استكمالاً", "What needs completing")}</h3><div className="dhr-panel-m">{tx("اختر ملفاً وظيفياً لعرض شاغليه، أو راجع المسميات غير الموصوفة.", "Pick a job profile to see its holders, or review undescribed designations.")}</div></div></div>
                <div className="dhr-panel-b space-y-2 text-[13px]">
                  {arch.uncoveredDesignations.length === 0 && arch.profilesWithoutDesignation.length === 0 && <p className="dhr-empty">{tx("كل المسميات المستخدمة موصوفة بملف وظيفي.", "Every designation in use is described by a job profile.")}</p>}
                  {arch.uncoveredDesignations.length > 0 && <div data-job-uncovered>
                    <div className="mb-1 text-[11px] text-[var(--dhr-muted)]">{tx("مسميات يحملها موظفون نشطون بلا ملف وظيفي", "Designations held by active employees with no job profile")}</div>
                    <ul className="divide-y divide-[var(--dhr-sep)] rounded-[var(--dhr-r-sm)] border border-[var(--dhr-sep)]">{arch.uncoveredDesignations.map((d) => (
                      <li key={d.designation} className="flex min-h-10 items-center justify-between gap-2 px-3 py-1.5" data-uncovered={d.designation}>
                        <Native dt="Employee" filters={[["designation", "=", d.designation], ["status", "=", "Active"]]} module="01" className="dhr-link"><span data-no-i18n>{label(tx, d.designation)}</span></Native>
                        <span className="dhr-pill dhr-tnum" data-no-i18n>{d.incumbents.length}</span>
                      </li>))}</ul>
                  </div>}
                  {arch.profilesWithoutDesignation.length > 0 && <p data-job-nodesig><Pill tone="warn">{arch.profilesWithoutDesignation.length}</Pill> {tx("ملفات وظيفية بلا مسمى مرتبط — لا يمكن مطابقتها بموظفين.", "job profiles have no linked designation — they cannot be matched to employees.")}</p>}
                  <Native dt="DIGIT Job Profile" module="01" className="dhr-act dhr-act-sm">{tx("سجل الملفات الوظيفية", "Job profile register")}</Native>
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </HrInsightPanel>
  );
}

function FamilyBranch({ f, depth, sel, onPick, tx }: { f: FamilyNode; depth: number; sel: string; onPick: (p: string) => void; tx: Tx }) {
  const [open, setOpen] = useState(true);
  const count = allProfiles(f).length;
  return (
    <li role="treeitem" aria-expanded={open} aria-selected={false} data-job-family={f.name} style={{ paddingInlineStart: `${depth * 14}px` }}>
      <button type="button" className="dhr-treerow" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Chevron />}
        <span className="min-w-0 flex-1 truncate font-semibold" data-no-i18n>{label(tx, f.title)}</span>
        {f.missingParent && <Pill tone="warn" title={f.parent}>{tx("العائلة الأم غير مقروءة", "Parent not readable")}</Pill>}
        <span className="whitespace-nowrap text-[11px] text-[var(--dhr-muted)]" data-no-i18n data-family-counts>{tx(`${count} ملفات · ${f.incumbents} موظفين`, `${count} profiles · ${f.incumbents} people`)}</span>
      </button>
      {open && <ul role="group">
        {f.profiles.map((p) => <ProfileRow key={p.name} p={p} depth={depth + 1} sel={sel} onPick={onPick} tx={tx} />)}
        {f.children.map((c) => <FamilyBranch key={c.name} f={c} depth={depth + 1} sel={sel} onPick={onPick} tx={tx} />)}
      </ul>}
    </li>
  );
}
function ProfileRow({ p, depth, sel, onPick, tx }: { p: { name: string; title: string; designation: string; incumbents: string[] }; depth: number; sel: string; onPick: (p: string) => void; tx: Tx }) {
  return (
    <li role="treeitem" aria-selected={sel === p.name} data-job-profile={p.name} style={{ paddingInlineStart: `${depth * 14}px` }}>
      <button type="button" className="dhr-treerow" aria-current={sel === p.name} onClick={() => onPick(p.name)}>
        <span className="min-w-0 flex-1 truncate" data-no-i18n>{label(tx, p.title)}</span>
        <span className="hidden truncate text-[11px] text-[var(--dhr-muted)] sm:inline" data-no-i18n>{p.designation ? label(tx, p.designation) : tx("بلا مسمى", "No designation")}</span>
        <span className="dhr-pill dhr-tnum" data-no-i18n>{p.incumbents.length}</span>
      </button>
    </li>
  );
}

/* ================================================================ 01.5 employment-change pipeline */

const STAGE: Record<MovementStage, { ar: string; en: string; tone: Tone }> = {
  "draft-ready": { ar: "مسودة جاهزة للمراجعة", en: "Draft ready for review", tone: "warn" },
  "draft-scheduled": { ar: "مسودة مجدولة (تاريخ مستقبلي)", en: "Scheduled draft (future date)", tone: "info" },
  effective: { ar: "سارٍ (معتمد)", en: "Effective (submitted)", tone: "success" },
  cancelled: { ar: "ملغى", en: "Cancelled", tone: "neutral" },
};
const DT_LABEL: Record<Movement["doctype"], [string, string]> = { "Employee Transfer": ["نقل", "Transfer"], "Employee Promotion": ["ترقية", "Promotion"] };
const FIELD_LABEL: Record<string, [string, string]> = { department: ["القسم", "Department"], designation: ["المسمى", "Designation"], branch: ["الفرع", "Branch"], reports_to: ["المدير المباشر", "Reports to"], grade: ["الدرجة", "Grade"] };

function ChangeList({ changes, tx, names }: { changes: { property: string; fieldname: string; from: string; to: string }[]; tx: Tx; names: Map<string, string> }) {
  if (!changes.length) return <span className="text-[var(--dhr-muted)]">{tx("لا توجد تفاصيل تغيير", "No change details")}</span>;
  const show = (field: string, v: string) => !v ? "—" : field === "reports_to" ? tx(arLabel(names.get(v) ?? v), names.get(v) ?? v) : label(tx, v);
  return <ul className="space-y-0.5">{changes.map((c, i) => {
    const f = FIELD_LABEL[c.fieldname]; return (
      <li key={i} className="text-[12.5px]" data-change={c.fieldname}><span className="text-[var(--dhr-muted)]">{f ? tx(...f) : label(tx, c.property || c.fieldname)}:</span> <bdi data-no-i18n>{show(c.fieldname, c.from)}</bdi> <span aria-hidden className="text-[var(--dhr-muted)]">{tx("←", "→")}</span><span className="sr-only">{tx("إلى", "to")}</span> <bdi className="font-medium" data-no-i18n>{show(c.fieldname, c.to)}</bdi></li>
    ); })}</ul>;
}

export function MovementPipeline({ tx }: { tx: Tx }) {
  const src = useSources(tx); const search = useSearch(); const patch = useSearchPatch();
  const DTS = ["Employee Transfer", "Employee Promotion", "Employee"];
  const today = todayIso();
  const all = movements(src.rows("Employee Transfer"), src.rows("Employee Promotion"), today);
  const names = new Map(src.rows("Employee").map((e) => [s(e.name), s(e.employee_name) || s(e.name)]));
  const stageFilter = (["draft-ready", "draft-scheduled", "effective", "cancelled"] as MovementStage[]).includes(str(search["mst"]) as MovementStage) ? (str(search["mst"]) as MovementStage) : "";
  const shown = all.filter((m) => (stageFilter ? m.stage === stageFilter : m.stage !== "cancelled"));
  const by = (st: MovementStage) => all.filter((m) => m.stage === st).length;
  const emp = str(search["emp"]);
  const anyReady = src.ready("Employee Transfer") || src.ready("Employee Promotion");
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <HrInsightPanel data-movement-pipeline title={tx("مسار التغييرات الوظيفية", "Employment change pipeline")}
        meta={tx("النقل والترقية حسب مرحلتها. المسودة لا تغيّر سجل الموظف؛ الاعتماد فقط يطبق التغيير ويضيفه إلى سجل العمل الداخلي.", "Transfers and promotions by stage. A draft never changes the employee; only submission applies the change and adds it to internal work history.")}
        info={tx("المرحلة مشتقة من حالة المستند وتاريخ السريان: المسودة ذات التاريخ المستقبلي لا يمكن اعتمادها قبل تاريخها. تغييرات الراتب والشركة ورقم الموظف الجديد تتطلب الخادم ولا تُطبق هنا.", "Stage comes from document status and effective date: a draft dated in the future cannot be submitted before that date. Pay, company and new-employee-ID changes require the server and are not applied here.")}
        toolbar={<div className="flex flex-wrap gap-1.5" role="group" aria-label={tx("المرحلة", "Stage")}>
          <Button variant="ghost" className="dhr-filter" aria-pressed={!stageFilter} onClick={() => patch({ mst: undefined })}>{tx("المفتوحة والسارية", "Open and effective")} <b data-no-i18n>{all.length - by("cancelled")}</b></Button>
          {(Object.keys(STAGE) as MovementStage[]).map((st) => <Button key={st} variant="ghost" className="dhr-filter" data-tone={STAGE[st].tone === "warn" ? "warn" : undefined} data-stage-filter={st} aria-pressed={stageFilter === st} disabled={!by(st) && stageFilter !== st} onClick={() => patch({ mst: stageFilter === st ? undefined : st })}>{tx(STAGE[st].ar, STAGE[st].en)} <b data-no-i18n>{by(st)}</b></Button>)}
        </div>} flush>
        {!anyReady ? <div className="dhr-panel-b"><Notice src={src} dts={DTS.slice(0, 2)} /></div> : shown.length === 0
          ? <div className="dhr-panel-b"><p className="dhr-empty" data-movement-empty>{tx("لا توجد تغييرات وظيفية في هذه المرحلة.", "No employment changes at this stage.")}</p></div>
          : <ul className="divide-y divide-[var(--dhr-sep)]" data-movement-list>{shown.map((m) => (
              <li key={m.name} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]" data-movement={m.name} data-stage={m.stage}>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={STAGE[m.stage].tone}>{tx(STAGE[m.stage].ar, STAGE[m.stage].en)}</Pill>
                    <span className="text-[12px] text-[var(--dhr-muted)]">{tx(...DT_LABEL[m.doctype])}</span>
                    <bdi dir="ltr" className="text-[12px] text-[var(--dhr-muted)]" data-no-i18n>{m.date || "…"}</bdi>
                  </div>
                  <div className="font-medium"><EmpLink id={m.employee} name={names.get(m.employee) ?? m.employeeName} tx={tx} /></div>
                  <ChangeList changes={m.changes} tx={tx} names={names} />
                </div>
                <div className="flex flex-wrap items-start gap-1.5 sm:justify-end">
                  <Button variant="ghost" className="dhr-act dhr-act-sm" aria-pressed={emp === m.employee} onClick={() => patch({ emp: emp === m.employee ? undefined : m.employee })} data-show-history={m.employee}>{tx("السجل الزمني", "History")}</Button>
                  <Native dt={m.doctype} name={m.name} module="01" className="dhr-act dhr-act-sm">{m.stage.startsWith("draft") ? tx("مراجعة المسودة", "Review draft") : tx("فتح المستند", "Open document")}</Native>
                </div>
              </li>))}</ul>}
      </HrInsightPanel>
      <PersonHistory emp={emp} names={names} tx={tx} src={src} onClose={() => patch({ emp: undefined })} onPick={(id) => patch({ emp: id || undefined })} />
    </div>
  );
}

const KIND: Record<TimelineEvent["kind"], [string, string]> = { joined: ["المباشرة", "Joined"], history: ["سجل العمل الداخلي", "Internal work history"], transfer: ["نقل", "Transfer"], promotion: ["ترقية", "Promotion"], assignment: ["تعيين على منصب", "Position assignment"], relieved: ["انتهاء الخدمة", "Relieved"] };

function PersonHistory({ emp, names, tx, src, onClose, onPick }: { emp: string; names: Map<string, string>; tx: Tx; src: Sources; onClose: () => void; onPick: (id: string) => void }) {
  const employees = src.rows("Employee");
  const rec = emp ? employees.find((e) => s(e.name) === emp) : undefined;
  const picker = (
    <label className="flex min-w-0 items-center gap-2 text-[12.5px]">
      <span className="shrink-0 text-[var(--dhr-muted)]">{tx("الموظف", "Employee")}</span>
      <select className="field-input min-w-0 flex-1" value={emp} onChange={(e) => onPick(e.target.value)} aria-label={tx("اختر موظفاً لعرض سجله", "Choose an employee to see their history")} data-history-picker data-no-i18n>
        <option value="">—</option>
        {[...employees].sort((a, b) => s(a.employee_name).localeCompare(s(b.employee_name))).map((e) => <option key={s(e.name)} value={s(e.name)}>{tx(arLabel(s(e.employee_name) || s(e.name)), s(e.employee_name) || s(e.name))}</option>)}
      </select>
    </label>
  );
  if (!rec) return (
    <HrInsightPanel data-person-history="" title={tx("السجل الوظيفي للموظف", "Employee job history")} meta={tx("اختر موظفاً لرؤية تاريخه الفعلي: المباشرة، سجل العمل الداخلي، النقل والترقية والتعيين على المناصب.", "Pick an employee to see their effective-dated history: joining, internal work history, transfers, promotions and position assignments.")}>
      <div className="space-y-2">{picker}{emp && !rec && <p className="dhr-empty" role="status">{tx("الموظف غير متاح لهذا المستخدم.", "This employee is not available to this user.")}</p>}</div>
    </HrInsightPanel>
  );
  const events = employeeTimeline(rec, src.rows("Employee Transfer"), src.rows("Employee Promotion"), src.rows("DIGIT Assignment History"));
  return (
    <HrContextInspector tx={tx} title={<EmpLink id={emp} name={names.get(emp)} tx={tx} />} subtitle={<span data-no-i18n>{[s(rec.designation) && label(tx, s(rec.designation)), s(rec.department) && label(tx, s(rec.department))].filter(Boolean).join(" · ")}</span>} onClose={onClose}
      actions={<Link to="/digit-hr/employees/$name" params={{ name: emp }} className="dhr-act dhr-act-sm dhr-act-primary">{tx("ملف الموظف 360", "Employee 360")}</Link>}>
      <div className="space-y-3" data-person-history={emp}>
        {picker}
        {events.length === 0 ? <p className="dhr-empty">{tx("لا توجد أحداث مؤرخة لهذا الموظف.", "No dated events for this employee.")}</p> : (
          <ol className="relative space-y-3 border-s border-[var(--dhr-sep)] ps-4" data-timeline>
            {events.map((e, i) => (
              <li key={`${e.kind}-${e.date}-${i}`} className="relative" data-event={e.kind} data-pending={e.pending ? 1 : undefined}>
                <span aria-hidden className="absolute -start-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--dhr-surface)]" style={{ background: e.pending ? "var(--dhr-warn)" : e.kind === "relieved" ? "var(--dhr-danger)" : "var(--dhr-emerald)" }} />
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  {e.to ? <DateRange from={e.date} to={e.to} className="text-[var(--dhr-muted)]" /> : <bdi dir="ltr" className="text-[var(--dhr-muted)]" data-no-i18n>{e.date}</bdi>}
                  <span className="font-semibold">{tx(...KIND[e.kind])}</span>
                  {e.pending && <Pill tone="warn">{tx("مسودة — غير سارية", "Draft — not effective")}</Pill>}
                </div>
                {e.label && <div className="text-[13px]" data-no-i18n>{e.label.split(" · ").map((x) => label(tx, x)).join(" · ")}</div>}
                {e.changes.length > 0 && <ChangeList changes={e.changes} tx={tx} names={names} />}
                {e.name && <Native dt={e.source} name={e.name} module="01" className="text-[12px] dhr-link">{tx("المستند المصدر", "Source document")} <span className="dhr-code" data-no-i18n>{e.name}</span></Native>}
              </li>))}
          </ol>
        )}
        <p className="text-[11px] text-[var(--dhr-muted)]">{tx("المصادر: الموظف، سجل العمل الداخلي، نقل الموظف، ترقية الموظف، سجل تعيينات المناصب. المسودات معروضة للعلم ولا تُعد سارية.", "Sources: Employee, Internal Work History, Employee Transfer, Employee Promotion, DIGIT Assignment History. Drafts are shown for awareness and are not effective.")}</p>
      </div>
    </HrContextInspector>
  );
}

/* ================================================================ 01.6 contract indicators */

export const CONTRACT_FILTERS: { id: ContractFilter; ar: string; en: string; tone?: Tone; def: [string, string] }[] = [
  { id: "active", ar: "عقود سارية", en: "Active contracts", def: ["حالة العقد سارٍ وتاريخ اليوم بين البداية والنهاية.", "Status Active and today between start and end."] },
  { id: "ending90", ar: "تنتهي خلال 90 يوماً", en: "Ending within 90 days", tone: "warn", def: ["عقود سارية تاريخ نهايتها خلال 90 يوماً من اليوم.", "Active contracts whose end date is within 90 days."] },
  { id: "probation30", ar: "تجربة تنتهي خلال 30 يوماً", en: "Probation ending within 30 days", tone: "warn", def: ["تاريخ البداية + أيام التجربة المسجلة في العقد يقع خلال 30 يوماً. لا تُطبق مدة نظامية.", "Start date + the contract's recorded probation days falls within 30 days. No statutory period is applied."] },
  { id: "expired", ar: "منتهية بلا عقد لاحق", en: "Expired, no later contract", tone: "danger", def: ["عقد انتهى تاريخه أو حالته منتهٍ ولا يوجد للموظف عقد سارٍ آخر.", "End date passed or status Expired, and the employee has no other active contract."] },
  { id: "reviews", ar: "مراجعات تعديل مفتوحة", en: "Open amendment reviews", def: ["عقود لها مراجعة تعديل لم تُعتمد بعد.", "Contracts with an amendment review not yet submitted."] },
  { id: "extension-pending", ar: "تمديد معتمد لم يُنعكس", en: "Extension not on contract", tone: "info", def: ["مراجعة تمديد معتمدة بتاريخ نهاية أبعد من العقد. قرار المالك D-01 مفتوح: المراجعة لا تغيّر تاريخ العقد.", "A submitted extension review with a later end date than the contract. Owner decision D-01 is open: reviews do not change the contract date."] },
];

export function useContractIndicators(tx: Tx) {
  const src = useSources(tx);
  const DTS = ["DIGIT Employment Contract", "DIGIT Contract Amendment", "Employee"];
  return { src, DTS, ready: src.ready(...DTS), ind: contractIndicators(src.rows("DIGIT Employment Contract"), src.rows("DIGIT Contract Amendment"), src.rows("Employee"), todayIso()), names: new Map(src.rows("Employee").map((e) => [s(e.name), s(e.employee_name) || s(e.name)])) };
}

export function ContractIndicatorsPanel({ tx, filter, onFilter }: { tx: Tx; filter: ContractFilter | ""; onFilter: (f: ContractFilter | "") => void }) {
  const { src, DTS, ready, ind, names } = useContractIndicators(tx);
  const [showAll, setShowAll] = useState(false);
  const without = showAll ? ind.withoutContract : ind.withoutContract.slice(0, 6);
  return (
    <HrInsightPanel data-contract-indicators title={tx("مؤشرات العقود", "Contract indicators")}
      meta={tx("من سجلات عقود العمل ومراجعات التعديل فقط. اختر مؤشراً لتصفية سجل العقود أدناه.", "From employment contract and amendment review records only. Pick an indicator to filter the contract register below.")}
      info={<div className="space-y-1">{CONTRACT_FILTERS.map((f) => <p key={f.id}><b>{tx(f.ar, f.en)}:</b> {tx(...f.def)}</p>)}<p>{tx("بطاقات العروض الوظيفية في لوحة المؤشرات أسفل الصفحة تخص مرحلة ما قبل العقد ولا تُحتسب عقوداً.", "Job offer cards in the dashboard further down are the pre-contract stage and are not counted as contracts.")}</p></div>}>
      {!ready ? <Notice src={src} dts={DTS} /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6" role="group" aria-label={tx("تصفية العقود", "Filter contracts")}>
            {CONTRACT_FILTERS.map((f) => {
              const count = ind[f.id].length; const on = filter === f.id; return (
                <button key={f.id} type="button" className="ek-kpi-tile disabled:opacity-60" aria-pressed={on} disabled={!count && !on} data-tone={count ? f.tone : undefined} data-contract-filter={f.id} title={tx(...f.def)} onClick={() => onFilter(on ? "" : f.id)}>
                  <div className="ek-tile-label">{tx(f.ar, f.en)}</div>
                  <div className="ek-tile-value dhr-tnum" data-no-i18n>{count}</div>
                </button>); })}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0" data-contract-renewals>
              <h3 className="mb-1.5 text-xs font-semibold text-[var(--dhr-muted)]">{tx("أقرب تواريخ انتهاء العقود السارية", "Nearest end dates of active contracts")}</h3>
              {ind.renewals.length ? <ul className="divide-y divide-[var(--dhr-sep)] rounded-[var(--dhr-r-sm)] border border-[var(--dhr-sep)]">{ind.renewals.slice(0, 5).map((r) => (
                <li key={r.name} className="flex min-h-10 items-center justify-between gap-2 px-3 py-1.5 text-[13px]" data-renewal={r.name}>
                  <span className="min-w-0 truncate"><Link to="/digit-hr/contracts/$name" params={{ name: r.name }} className="dhr-link font-medium">{tx(arLabel(names.get(r.employee) ?? r.employee), names.get(r.employee) ?? r.employee)}</Link> <span className="dhr-code" data-no-i18n>{r.name}</span></span>
                  <span className="flex shrink-0 items-center gap-2"><bdi dir="ltr" className="text-[12px] text-[var(--dhr-muted)]" data-no-i18n>{r.end}</bdi><Pill tone={r.days <= 90 ? "warn" : "neutral"}>{tx(`${r.days} يوماً`, `${r.days} days`)}</Pill></span>
                </li>))}</ul> : <p className="dhr-empty">{tx("لا توجد عقود سارية محددة المدة.", "No active fixed-term contracts.")}</p>}
            </div>
            <div className="min-w-0" data-contract-missing>
              <h3 className="mb-1.5 text-xs font-semibold text-[var(--dhr-muted)]">{tx("موظفون نشطون بلا عقد مسجل ساري", "Active employees with no active contract record")} <b data-no-i18n>{ind.withoutContract.length}</b></h3>
              {ind.withoutContract.length ? <>
                <ul className="flex flex-wrap gap-1.5">{without.map((id) => <li key={id}><EmpLink id={id} name={names.get(id)} tx={tx} /></li>)}</ul>
                {ind.withoutContract.length > 6 && <Button variant="ghost" className="dhr-act dhr-act-ghost dhr-act-sm mt-1" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>{showAll ? tx("عرض أقل", "Show less") : tx(`عرض الكل (${ind.withoutContract.length})`, `Show all (${ind.withoutContract.length})`)}</Button>}
                <p className="mt-1 text-[11px] text-[var(--dhr-muted)]">{tx("قد تكون عقودهم خارج النظام؛ هذا مؤشر اكتمال بيانات وليس حكماً نظامياً.", "Their contracts may be held outside the system; this is a data-completeness signal, not a legal finding.")}</p>
              </> : <p className="dhr-empty">{tx("لكل موظف نشط عقد سارٍ مسجل.", "Every active employee has an active contract record.")}</p>}
            </div>
          </div>
        </div>
      )}
    </HrInsightPanel>
  );
}

export function FilterNote({ children, onClear, tx }: { children: ReactNode; onClear: () => void; tx: Tx }) {
  return <div className="flex flex-wrap items-center gap-2 text-[12.5px]" role="status" data-register-filter-note><span className="text-[var(--dhr-muted)]">{tx("السجل مصفّى:", "Register filtered:")}</span><b>{children}</b><Button variant="ghost" className="dhr-act dhr-act-ghost dhr-act-sm" onClick={onClear}>{tx("إزالة التصفية", "Clear filter")}</Button></div>;
}
