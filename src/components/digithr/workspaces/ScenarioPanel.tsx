/**
 * 06.2 headcount scenario panel: a what-if over live headcount per designation for one company. Typed hires/exits stay
 * on screen (unsaved-change guard) until saved as a native Staffing Plan draft (hires only, no cost); exits are shown for
 * planning but never written. Rules live in plugins/digit_hr/scenario.ts.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useUnsavedGuard } from "@/components/digithr/UnsavedGuard";
import { HrInsightPanel } from "@/components/digithr/home/kit";
import { cachedMeta } from "@/lib/catalog";
import { hasPerm } from "@/plugins/digit_hr/compat/session";
import { clampDelta, projected, saveScenarioAsPlan, scenarioBase, scenarioErrors, scenarioTotals, type Delta } from "@/plugins/digit_hr/scenario";
import { plansOn } from "@/plugins/digit_hr/staffingFacts";
import { Native, arLabel, type Sources } from "./shared";
import { DateInput } from "@/components/form/DateInput";

type Tx = (ar: string, en: string) => string;
const yearEnd = (iso: string) => `${iso.slice(0, 4)}-12-31`;

export function ScenarioPanel({ src, company, companies, tx }: { src: Sources; company: string; companies: string[]; tx: Tx }) {
  const today = new Date().toISOString().slice(0, 10);
  const [co, setCo] = useState(company || companies[0] || "");
  const effective = company || co;
  const [deltas, setDeltas] = useState<Record<string, Delta>>({});
  const [name, setName] = useState(""); const [from, setFrom] = useState(today); const [to, setTo] = useState(yearEnd(today));
  const [result, setResult] = useState<{ tone: "ok" | "err"; text: string; plan?: string } | null>(null);
  const dirty = Object.values(deltas).some((d) => d.hires || d.exits);
  const guard = useUnsavedGuard(dirty);
  const plans = src.rows("Staffing Plan");
  const base = effective ? scenarioBase(effective, src.rows("Employee"), src.rows("Job Opening"), plansOn(plans, today)) : [];
  const tot = scenarioTotals(base, deltas);
  const meta = cachedMeta("Staffing Plan"); const canSave = !!meta && hasPerm(meta, "create");
  const set = (d: string, k: keyof Delta, v: string) => { setResult(null); setDeltas((p) => ({ ...p, [d]: { hires: p[d]?.hires ?? 0, exits: p[d]?.exits ?? 0, [k]: clampDelta(v) } })); };
  const input = { name, company: effective, from, to, base, deltas };
  const errs = dirty || name ? scenarioErrors(input, plans) : [];
  const save = () => {
    try { const doc = saveScenarioAsPlan(input, plans); guard.release(); setDeltas({}); setName(""); setResult({ tone: "ok", text: tx("حُفظت مسودة خطة التوظيف الأصلية (التعيينات فقط، بلا تكلفة).", "Native staffing plan draft saved (hires only, no cost)."), plan: doc.name }); }
    catch (e) { setResult({ tone: "err", text: (e as Error).message }); }
  };
  const ready = src.ready("Employee", "Job Opening", "Staffing Plan");
  return (
    <HrInsightPanel data-headcount-scenario title={tx("سيناريو عدد الموظفين", "Headcount scenario")}
      meta={tx("ماذا لو: أضف تعيينات أو مغادرات لكل مسمى وشاهد العدد المتوقع مقابل الخطة السارية. لا رواتب ولا تكاليف.", "What-if: add hires or exits per designation and see projected headcount against the plan in effect. No pay or cost.")}
      info={tx("الأساس = الموظفون النشطون والشواغر المفتوحة في الشركة اليوم. المتوقع = الفعلي + التعيينات − المغادرات. الحفظ ينشئ مسودة «خطة توظيف» أصلية بالتعيينات فقط (الشواغر = التعيينات، عدد المناصب = الشواغر + العدد الحالي)؛ المغادرات لا تُحفظ لأن الخطة لا تتضمنها. تُرفض الخطة إذا تداخلت مع خطة قائمة لنفس المسمى في الفترة.", "Baseline = active employees and open job openings in the company today. Projected = actual + hires − exits. Saving creates a native Staffing Plan draft with hires only (vacancies = hires, positions = vacancies + current count); exits are not saved because a staffing plan has no exit line. A plan overlapping an existing plan for the same designation in the period is rejected.")}
      actions={!company && companies.length > 1 ? <label className="flex items-center gap-2 text-[12.5px]"><span className="text-[var(--dhr-muted)]">{tx("الشركة", "Company")}</span><select className="field-input max-w-[14rem]" value={co} onChange={(e) => { setCo(e.target.value); setDeltas({}); }} aria-label={tx("شركة السيناريو", "Scenario company")} data-scenario-company>{companies.map((c) => <option key={c} value={c}>{tx(arLabel(c), c)}</option>)}</select></label> : undefined}>
      {guard.dialog}
      {!ready ? <div className="py-2">{src.empty("Employee", "Job Opening", "Staffing Plan")}</div> : base.length === 0 ? <p className="dhr-empty">{tx("لا يوجد موظفون نشطون في هذه الشركة.", "No active employees in this company.")}</p> : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-[var(--dhr-r-sm)] border border-[var(--dhr-sep)]">
            <table className="w-full min-w-[560px] text-[13px]" data-scenario-table>
              <thead><tr><th className="sticky start-0 z-[1] bg-[var(--dhr-surface)] text-start">{tx("المسمى", "Designation")}</th><th>{tx("الفعلي", "Actual")}</th><th>{tx("شواغر مفتوحة", "Open openings")}</th><th>{tx("الخطة السارية", "Plan in effect")}</th><th>{tx("+ تعيينات", "+ Hires")}</th><th>{tx("− مغادرات", "− Exits")}</th><th>{tx("المتوقع", "Projected")}</th></tr></thead>
              <tbody>{base.map((b) => { const d = deltas[b.designation]; const p = projected(b, d); const vs = b.planned === null ? null : p - b.planned; return (
                <tr key={b.designation} className="border-t" data-scenario-row={b.designation}>
                  <td className="sticky start-0 z-[1] bg-[var(--dhr-surface)] py-1.5 font-medium" data-no-i18n>{tx(arLabel(b.designation), b.designation)}</td>
                  <td className="text-center dhr-tnum" data-no-i18n>{b.actual}</td>
                  <td className="text-center dhr-tnum" data-no-i18n>{b.openings}</td>
                  <td className="text-center dhr-tnum" data-no-i18n>{b.planned ?? "—"}</td>
                  <td className="text-center"><input type="number" min={0} inputMode="numeric" className="field-input w-16 text-center" value={d?.hires || ""} onChange={(e) => set(b.designation, "hires", e.target.value)} aria-label={tx(`تعيينات ${arLabel(b.designation)}`, `Hires for ${b.designation}`)} data-scenario-hires={b.designation} /></td>
                  <td className="text-center"><input type="number" min={0} max={b.actual} inputMode="numeric" className="field-input w-16 text-center" value={d?.exits || ""} onChange={(e) => set(b.designation, "exits", e.target.value)} aria-label={tx(`مغادرات ${arLabel(b.designation)}`, `Exits for ${b.designation}`)} data-scenario-exits={b.designation} /></td>
                  <td className="text-center"><b className="dhr-tnum" data-no-i18n data-scenario-projected={b.designation}>{p}</b>{vs !== null && vs !== 0 && <span className="ms-1 text-[11px]" style={{ color: vs > 0 ? "var(--dhr-danger-text)" : "var(--dhr-warn-text)" }} data-no-i18n>{vs > 0 ? `+${vs}` : vs} {tx("عن الخطة", "vs plan")}</span>}</td>
                </tr>); })}</tbody>
              <tfoot><tr className="border-t font-semibold" data-scenario-totals><td className="sticky start-0 z-[1] bg-[var(--dhr-surface)] py-1.5">{tx("الإجمالي", "Total")}</td><td className="text-center dhr-tnum" data-no-i18n>{tot.actual}</td><td /><td /><td className="text-center dhr-tnum" data-no-i18n>+{tot.hires}</td><td className="text-center dhr-tnum" data-no-i18n>−{tot.exits}</td><td className="text-center dhr-tnum" data-no-i18n data-scenario-total-projected>{tot.projected}</td></tr></tfoot>
            </table>
          </div>
          {canSave ? (
            <div className="flex flex-wrap items-end gap-2" data-scenario-save>
              <label className="text-[12px]"><span className="block text-[var(--dhr-muted)]">{tx("اسم الخطة", "Plan name")}</span><input className="field-input w-56" value={name} onChange={(e) => { setName(e.target.value); setResult(null); }} aria-label={tx("اسم الخطة", "Plan name")} data-scenario-name /></label>
              <label className="text-[12px]"><span className="block text-[var(--dhr-muted)]">{tx("من", "From")}</span><DateInput className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={tx("من تاريخ", "From date")} data-no-i18n /></label>
              <label className="text-[12px]"><span className="block text-[var(--dhr-muted)]">{tx("إلى", "To")}</span><DateInput className="field-input" value={to} onChange={(e) => setTo(e.target.value)} aria-label={tx("إلى تاريخ", "To date")} data-no-i18n /></label>
              <Button variant="outline" disabled={!dirty || errs.length > 0} onClick={save} data-scenario-submit>{tx("حفظ كمسودة خطة توظيف", "Save as staffing plan draft")}</Button>
              {dirty && <Button variant="ghost" onClick={() => { setDeltas({}); setResult(null); }} data-scenario-reset>{tx("مسح السيناريو", "Clear scenario")}</Button>}
            </div>
          ) : <p className="text-[12px] text-[var(--dhr-muted)]">{tx("يمكنك تجربة السيناريو؛ الحفظ كخطة يتطلب صلاحية إنشاء خطة توظيف.", "You can try the scenario; saving it as a plan needs permission to create a staffing plan.")}</p>}
          {errs.length > 0 && (dirty || name) && <ul className="text-[12px] text-[var(--dhr-warn-text)]" data-scenario-errors>{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
          {result && <p role={result.tone === "err" ? "alert" : "status"} className={result.tone === "err" ? "dhr-alert text-sm" : "text-[12.5px] text-[var(--dhr-emerald)]"} data-scenario-result={result.tone}>{result.text} {result.plan && <Native dt="Staffing Plan" name={result.plan} module="06" className="dhr-link font-medium"><span data-no-i18n>{result.plan}</span></Native>}</p>}
        </div>
      )}
    </HrInsightPanel>
  );
}
