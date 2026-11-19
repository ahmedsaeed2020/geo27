/**
 * Section 02.5 — Talent pool & succession. Primary register: DIGIT Succession Plan (position → successor with readiness
 * and risk of loss as recorded by HR), joined to the position, its incumbent and the successor's latest submitted
 * appraisal score. Coverage facts list filled positions without any successor. Readiness is never inferred from scores.
 * Supporting views: latest appraisal score bands, talent review register and single-incumbent designations.
 * URL state: ?rd (readiness filter), ?addpos (prefilled position for the add-successor form).
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useUnsavedGuard } from "@/components/digithr/UnsavedGuard";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { useStoreVersion } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { hasPerm, useSessionUser } from "@/plugins/digit_hr/compat/session";
import { isHrAdmin } from "@/plugins/digit_hr/compat/employeeIdentity";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { ScopeBar, useModuleScope } from "@/components/digithr/ModuleScope";
import { WorkTable } from "@/components/digithr/EnterpriseRegister";
import { HrInsightPanel, Pill, useSearchPatch, type Tone } from "@/components/digithr/home/kit";
import { Native, StatRow, NotEvaluated, arLabel, useSources, SourceNotice, type Sources } from "./shared";
import { latestScores, scoreBands, singleIncumbent, type ReviewRow } from "@/plugins/digit_hr/talentReview";
import { READINESS, RISK, addSuccessor, successionCoverage, successionRegister, successorErrors, type SuccessionRow } from "@/plugins/digit_hr/succession";

const DT = ["Employee", "Appraisal"];
const SDT = ["DIGIT Succession Plan", "DIGIT Position"];
type Tx = (ar: string, en: string) => string;
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const READY_AR: Record<string, string> = { "Ready Now": "جاهز الآن", "1-2 Years": "خلال سنة إلى سنتين", "3+ Years": "ثلاث سنوات فأكثر" };
const RISK_AR: Record<string, string> = { Low: "منخفض", Medium: "متوسط", High: "مرتفع" };
const readyTone = (r: string): Tone => (r === "Ready Now" ? "success" : r === "1-2 Years" ? "info" : "neutral");
const riskTone = (r: string): Tone => (r === "High" ? "danger" : r === "Medium" ? "warn" : "neutral");
const useSearch = () => useRouterState({ select: (r) => r.location.search as Record<string, unknown> });

export function SuccessionWorkspace() {
  const { tx } = useTx();
  useStoreVersion(); useSessionUser();
  useScopeMetas([...DT, ...SDT]);
  const src = useSources(tx);
  const scope = useModuleScope(src);
  const search = useSearch(); const patch = useSearchPatch();
  const ready = src.ready(...DT) && scope.companyKnown;
  const sReady = ready && src.ready(...SDT);
  const emps = scope.filter(src.rows("Employee"));
  const rows = ready ? latestScores(scope.filter(src.rows("Appraisal")), emps) : [];
  const bands = scoreBands(rows);
  const max = Math.max(1, ...bands.map((b) => b.employees.length));
  // Single-incumbent roles need the whole population; a row-scoped reader would see false singles.
  const admin = isHrAdmin();
  const singles = ready && admin ? singleIncumbent(emps) : null;

  const positions = scope.filter(src.rows("DIGIT Position"));
  const posNames = new Set(positions.map((p) => s(p.name)));
  const plans = src.rows("DIGIT Succession Plan").filter((p: Row) => posNames.has(s(p["position"])));
  const scoreMap = new Map(rows.map((r) => [r.employee, r.score]));
  const register = sReady ? successionRegister(plans, positions, emps, scoreMap) : [];
  const cov = successionCoverage(positions, plans);
  const rd = typeof search["rd"] === "string" && READINESS.includes(search["rd"] as never) ? (search["rd"] as string) : "";
  const shown = rd ? register.filter((r) => r.readiness === rd) : register;
  const addpos = typeof search["addpos"] === "string" ? (search["addpos"] as string) : "";
  const meta = cachedMeta("DIGIT Succession Plan"); const canAdd = !!meta && hasPerm(meta, "create");

  return (
    <div className="space-y-5" data-succession-workspace>
      <SourceNotice src={src} />
      <ScopeBar scope={scope} tx={tx} />
      <StatRow items={[
        { label: tx("مناصب مشغولة لها خليفة", "Filled positions with a successor"), value: src.v(<span data-succ-covered>{cov.covered}/{cov.filled}</span>, ...DT, ...SDT), tone: cov.filled && cov.covered < cov.filled ? "warn" : undefined },
        { label: tx("مناصب لها خليفة جاهز الآن", "Positions with a ready-now successor"), value: src.v(<span data-succ-readynow>{cov.readyNow}</span>, ...DT, ...SDT) },
        { label: tx("خطط التعاقب", "Succession plans"), value: src.v(<span data-succ-plans>{register.length}</span>, ...DT, ...SDT) },
        { label: tx("موظفون لديهم تقييم معتمد", "Employees with a submitted appraisal"), value: src.v(<span data-reviewed>{rows.length}</span>, ...DT) },
        { label: tx("مسميات يشغلها موظف واحد", "Single-incumbent designations"), value: singles === null ? (ready ? <NotEvaluated tx={tx} why={["غير مُقيّم: يتطلب الاطلاع على كل الموظفين.", "Not evaluated: needs the whole workforce."]} /> : src.v(null, ...DT)) : <span data-singles={singles.length}>{singles.length}</span>, tone: singles?.length ? "warn" : undefined },
      ]} />

      <HrInsightPanel data-succession-register={shown.length} flush title={tx("سجل خطط التعاقب", "Succession plan register")}
        meta={tx("كل منصب ← خلفاؤه، مع الجاهزية وخطر الفقد كما سجّلها فريق الموارد البشرية.", "Each position → its successors, with readiness and risk of loss as recorded by HR.")}
        info={tx("المصدر: خطة التعاقب (امتداد DIGIT مقترح) مرتبطة بالمنصب. الجاهزية وخطر الفقد قيم مُدخلة يدويًا ولا تُستنتج من نتائج التقييم؛ عمود «آخر نتيجة» للعرض فقط من آخر تقييم معتمد للخليفة.", "Source: DIGIT Succession Plan (proposed DIGIT extension) linked to the position. Readiness and risk of loss are entered values and are never inferred from appraisal results; the latest score column is display-only from the successor's last submitted appraisal.")}
        toolbar={<div className="flex items-center gap-1.5 px-4 py-2" role="group" aria-label={tx("تصفية حسب الجاهزية", "Filter by readiness")}>
          <button type="button" className="dhr-act dhr-act-sm" aria-pressed={!rd} onClick={() => patch({ rd: undefined })} data-succ-filter="">{tx("الكل", "All")} <span data-no-i18n>{register.length}</span></button>
          {READINESS.map((r) => <button key={r} type="button" className="dhr-act dhr-act-sm" aria-pressed={rd === r} onClick={() => patch({ rd: rd === r ? undefined : r })} data-succ-filter={r}>{tx(READY_AR[r]!, r)} <span data-no-i18n>{cov.byReadiness[r] ?? 0}</span></button>)}
        </div>}>
        {!sReady ? <div className="p-4">{src.empty(...DT, ...SDT)}</div> : (
          <div className="p-3">
            <WorkTable<SuccessionRow> label="succession-plans" tx={tx} rows={shown} rowKey={(r) => r.plan} pageSize={10}
              emptyState={<p className="dhr-empty" data-succ-empty>{rd ? tx("لا خطط بهذه الجاهزية.", "No plans with this readiness.") : tx("لا توجد خطط تعاقب بعد.", "No succession plans yet.")}</p>}
              searchText={(r) => `${r.positionTitle} ${r.successorName} ${r.incumbentName} ${r.designation}`}
              cols={[
                { key: "p", ar: "المنصب", en: "Position", sort: (r) => r.positionTitle, render: (r) => <Link to="/digit-hr/positions/$name" params={{ name: r.position }} className="dhr-link font-medium" data-succ-position={r.position}><span data-no-i18n>{tx(arLabel(r.positionTitle), r.positionTitle)}</span></Link> },
                { key: "i", ar: "شاغل المنصب", en: "Incumbent", sort: (r) => r.incumbentName, render: (r) => r.incumbent ? <Link to="/digit-hr/employees/$name" params={{ name: r.incumbent }} className="dhr-link text-xs"><span data-no-i18n>{tx(arLabel(r.incumbentName), r.incumbentName)}</span></Link> : <span className="text-xs text-[var(--dhr-muted)]">{tx("شاغر", "Vacant")}</span> },
                { key: "s", ar: "الخليفة", en: "Successor", sort: (r) => r.successorName, render: (r) => <Link to="/digit-hr/employees/$name" params={{ name: r.successor }} className="dhr-link" data-succ-successor={r.successor}><span data-no-i18n>{tx(arLabel(r.successorName), r.successorName)}</span></Link> },
                { key: "r", ar: "الجاهزية", en: "Readiness", sort: (r) => READINESS.indexOf(r.readiness as never), render: (r) => r.readiness ? <Pill tone={readyTone(r.readiness)}><span data-succ-readiness={r.readiness}>{tx(READY_AR[r.readiness] ?? r.readiness, r.readiness)}</span></Pill> : "—" },
                { key: "k", ar: "خطر الفقد", en: "Risk of loss", sort: (r) => RISK.indexOf(r.risk as never), render: (r) => r.risk ? <Pill tone={riskTone(r.risk)}>{tx(RISK_AR[r.risk] ?? r.risk, r.risk)}</Pill> : "—" },
                { key: "sc", ar: "آخر نتيجة", en: "Latest score", sort: (r) => r.score ?? -1, render: (r) => <span className="dhr-tnum" data-no-i18n>{r.score === null ? "—" : r.score.toFixed(2)}</span> },
                { key: "n", ar: "الخطة", en: "Plan", render: (r) => <Native dt="DIGIT Succession Plan" name={r.plan} module="02" className="text-xs hover:underline" ><span data-no-i18n title={r.notes || undefined}>{r.plan}</span></Native> },
              ]} />
          </div>
        )}
      </HrInsightPanel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <HrInsightPanel data-succ-uncovered={cov.uncovered.length} flush title={tx("مناصب مشغولة بلا خليفة", "Filled positions without a successor")}
          meta={tx("حقيقة من سجل المناصب وخطط التعاقب، لا تقدير خطر.", "A fact from the position register and succession plans, not a risk score.")}>
          {!sReady ? <div className="p-4">{src.empty(...SDT)}</div> : cov.uncovered.length ? <ul className="divide-y divide-[var(--dhr-sep)]">{cov.uncovered.map((u) => { const inc = emps.find((e) => s(e.name) === u.incumbent); return (
            <li key={u.position} className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm" data-succ-gap={u.position}>
              <span className="min-w-0"><Link to="/digit-hr/positions/$name" params={{ name: u.position }} className="dhr-link font-medium"><span data-no-i18n>{tx(arLabel(u.title), u.title)}</span></Link>
                <span className="block text-[12px] text-[var(--dhr-muted)]" data-no-i18n>{inc ? tx(arLabel(s(inc.employee_name)), s(inc.employee_name)) : u.incumbent}</span></span>
              {canAdd && <button type="button" className="dhr-act dhr-act-sm" onClick={() => patch({ addpos: u.position })} data-succ-add-for={u.position}>{tx("إضافة خليفة", "Add successor")}</button>}
            </li>); })}</ul> : <p className="px-4 py-3 text-sm text-[var(--dhr-muted)]">{tx("لكل منصب مشغول خليفة واحد على الأقل.", "Every filled position has at least one successor.")}</p>}
        </HrInsightPanel>
        {sReady && (canAdd
          ? <AddSuccessor key={addpos} tx={tx} src={src} positions={positions} plans={plans} emps={emps} initial={addpos} />
          : <HrInsightPanel title={tx("إضافة خليفة", "Add successor")}><p className="text-sm text-[var(--dhr-muted)]" data-succ-add-denied>{tx("إضافة خليفة تتطلب صلاحية إنشاء خطة تعاقب.", "Adding a successor needs permission to create a succession plan.")}</p></HrInsightPanel>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="dhr-card min-w-0 rounded-[14px] p-4" data-score-bands>
          <h2 className="font-semibold">{tx("توزيع آخر نتيجة تقييم", "Latest appraisal score distribution")}</h2>
          <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("نطاقات بعرض نقطة على مقياس المصدر 0–5، بلا تصنيف أو عتبات.", "One-point bands on the source 0–5 scale, without ratings or thresholds.")}</p>
          {ready ? <ul className="space-y-2">{bands.map((b) => (
            <li key={b.band} className="grid grid-cols-[3.5rem_minmax(0,1fr)_2rem] items-center gap-2 text-sm" data-band={b.band} data-band-count={b.employees.length}>
              <span data-no-i18n dir="ltr" className="text-xs">{b.band}</span>
              <span className="h-3 overflow-hidden rounded bg-[var(--dhr-sep)]"><span className="block h-full bg-[var(--dhr-emerald)]" style={{ width: `${(b.employees.length / max) * 100}%` }} /></span>
              {b.employees.length ? <Native dt="Appraisal" module="02" filters={[["employee", "in", b.employees], ["docstatus", "=", 1]]} className="tabular-nums hover:underline"><span data-no-i18n>{b.employees.length}</span></Native> : <span data-no-i18n className="tabular-nums">0</span>}
            </li>))}</ul> : src.empty(...DT)}
        </section>
        <section className="dhr-card min-w-0 rounded-[14px] p-4" data-talent-register={rows.length}>
          <h2 className="mb-2 font-semibold">{tx("سجل مراجعة المواهب", "Talent review register")}</h2>
          <WorkTable<ReviewRow> label="talent-review" tx={tx} rows={rows} rowKey={(r) => r.employee} pageSize={8}
            emptyState={ready ? undefined : src.empty(...DT)}
            searchText={(r) => `${r.employeeName} ${r.designation} ${r.department}`}
            cols={[
              { key: "e", ar: "الموظف", en: "Employee", sort: (r) => r.employeeName, render: (r) => <Native dt="Employee" name={r.employee} module="02" className="hover:underline"><span data-no-i18n>{tx(arLabel(r.employeeName), r.employeeName)}</span></Native> },
              { key: "d", ar: "المسمى", en: "Designation", sort: (r) => r.designation, render: (r) => <span data-no-i18n className="text-xs">{r.designation ? tx(arLabel(r.designation), r.designation) : "—"}</span> },
              { key: "s", ar: "آخر نتيجة", en: "Latest score", sort: (r) => r.score, render: (r) => <span data-no-i18n className="tabular-nums" data-score={r.employee}>{r.score.toFixed(2)}</span> },
              { key: "a", ar: "التقييم", en: "Appraisal", render: (r) => <Native dt="Appraisal" name={r.appraisal} module="02" className="text-xs hover:underline"><span data-no-i18n>{r.cycle || r.appraisal}</span></Native> },
            ]} />
        </section>
      </div>

      <section className="dhr-card rounded-[14px] p-4" data-single-incumbent>
        <h2 className="font-semibold">{tx("مسميات يشغلها موظف واحد", "Designations held by one person")}</h2>
        <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("حقيقة من سجل الموظفين لا تقدير خطر. مفيدة لبدء نقاش الخلافة.", "A fact from the employee register, not a risk score. Useful to start a succession conversation.")}</p>
        {singles === null ? (ready ? <NotEvaluated tx={tx} why={["غير مُقيّم: يتطلب الاطلاع على كل الموظفين.", "Not evaluated: needs the whole workforce."]} /> : src.empty(...DT))
          : singles.length ? <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{singles.map((x) => (
            <li key={x.designation} className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--dhr-border)] p-2 text-sm">
              <span data-no-i18n className="font-medium">{tx(arLabel(x.designation), x.designation)}</span>
              <Native dt="Employee" name={x.employee} module="02" className="text-xs text-[var(--dhr-emerald)] hover:underline"><span data-no-i18n>{tx(arLabel(x.employeeName), x.employeeName)}</span></Native>
            </li>))}</ul> : <p className="text-sm text-[var(--dhr-muted)]">{tx("كل المسميات يشغلها أكثر من موظف.", "Every designation has more than one holder.")}</p>}
      </section>
    </div>
  );
}

/** Add-successor form: validates like addSuccessor (position open, not the incumbent, no duplicate) and reads back. */
function AddSuccessor({ tx, positions, plans, emps, initial }: { tx: Tx; src: Sources; positions: Row[]; plans: Row[]; emps: Row[]; initial: string }) {
  const open = positions.filter((p) => !["Closed", "Frozen"].includes(s(p["position_status"])));
  const [position, setPosition] = useState(open.some((p) => s(p["name"]) === initial) ? initial : "");
  const [successor, setSuccessor] = useState(""); const [readiness, setReadiness] = useState<string>(READINESS[1]); const [risk, setRisk] = useState<string>(RISK[0]); const [notes, setNotes] = useState("");
  const [result, setResult] = useState<{ tone: "ok" | "err"; text: string; plan?: string } | null>(null);
  const dirty = !!(successor || notes.trim());
  const guard = useUnsavedGuard(dirty);
  const pos = open.find((p) => s(p["name"]) === position);
  const taken = new Set(plans.filter((p) => s(p["position"]) === position && Number(p["docstatus"] ?? 0) !== 2).map((p) => s(p["successor"])));
  const candidates = emps.filter((e) => s(e["status"] || "Active") === "Active" && s(e["name"]) !== s(pos?.["incumbent"]) && !taken.has(s(e["name"])) && (!pos || !s(pos["company"]) || s(e["company"]) === s(pos["company"])));
  const inp = { position, successor, readiness, risk, notes };
  const errs = position || successor ? successorErrors(inp, plans, positions) : [];
  const save = () => {
    try { const d = addSuccessor(inp, plans, positions); guard.release(); setSuccessor(""); setNotes(""); setResult({ tone: "ok", text: tx("حُفظت خطة التعاقب.", "Succession plan saved."), plan: d.name }); }
    catch (e) { setResult({ tone: "err", text: (e as Error).message }); }
  };
  return (
    <HrInsightPanel data-succ-add title={tx("إضافة خليفة", "Add successor")} meta={tx("ينشئ خطة تعاقب لمنصب مفتوح؛ الجاهزية وخطر الفقد تُحدد هنا يدويًا.", "Creates a succession plan for an open position; readiness and risk of loss are set here by hand.")}>
      {guard.dialog}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[12px]"><span className="block text-[var(--dhr-muted)]">{tx("المنصب", "Position")}</span>
          <select className="field-input w-full" value={position} onChange={(e) => { setPosition(e.target.value); setSuccessor(""); setResult(null); }} aria-label={tx("المنصب", "Position")} data-succ-pos data-no-i18n>
            <option value="">{tx("اختر منصبًا", "Choose a position")}</option>
            {open.map((p) => <option key={s(p["name"])} value={s(p["name"])}>{tx(arLabel(s(p["position_title"])), s(p["position_title"]))} · {s(p["name"])}</option>)}
          </select></label>
        <label className="text-[12px]"><span className="block text-[var(--dhr-muted)]">{tx("الخليفة", "Successor")}</span>
          <select className="field-input w-full" value={successor} onChange={(e) => { setSuccessor(e.target.value); setResult(null); }} disabled={!position} aria-label={tx("الخليفة", "Successor")} data-succ-emp data-no-i18n>
            <option value="">{tx("اختر موظفًا", "Choose an employee")}</option>
            {candidates.map((e) => <option key={s(e["name"])} value={s(e["name"])}>{tx(arLabel(s(e["employee_name"])), s(e["employee_name"]))} · {s(e["name"])}</option>)}
          </select></label>
        <label className="text-[12px]"><span className="block text-[var(--dhr-muted)]">{tx("الجاهزية", "Readiness")}</span>
          <select className="field-input w-full" value={readiness} onChange={(e) => setReadiness(e.target.value)} aria-label={tx("الجاهزية", "Readiness")} data-succ-ready>{READINESS.map((r) => <option key={r} value={r}>{tx(READY_AR[r]!, r)}</option>)}</select></label>
        <label className="text-[12px]"><span className="block text-[var(--dhr-muted)]">{tx("خطر الفقد", "Risk of loss")}</span>
          <select className="field-input w-full" value={risk} onChange={(e) => setRisk(e.target.value)} aria-label={tx("خطر الفقد", "Risk of loss")} data-succ-risk>{RISK.map((r) => <option key={r} value={r}>{tx(RISK_AR[r]!, r)}</option>)}</select></label>
        <label className="text-[12px] sm:col-span-2"><span className="block text-[var(--dhr-muted)]">{tx("ملاحظات التطوير (اختياري)", "Development notes (optional)")}</span>
          <textarea className="field-input min-h-16 w-full" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label={tx("ملاحظات التطوير", "Development notes")} data-succ-notes /></label>
      </div>
      {errs.length > 0 && <ul className="mt-2 text-[12px] text-[var(--dhr-warn-text)]" data-succ-errors>{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={!position || !successor || errs.length > 0} onClick={save} data-succ-save>{tx("حفظ خطة التعاقب", "Save succession plan")}</Button>
        {result && <p role={result.tone === "err" ? "alert" : "status"} className={result.tone === "err" ? "dhr-alert text-sm" : "text-[12.5px] text-[var(--dhr-emerald)]"} data-succ-result={result.tone}>{result.text} {result.plan && <Native dt="DIGIT Succession Plan" name={result.plan} module="02" className="dhr-link font-medium"><span data-no-i18n>{result.plan}</span></Native>}</p>}
      </div>
    </HrInsightPanel>
  );
}
