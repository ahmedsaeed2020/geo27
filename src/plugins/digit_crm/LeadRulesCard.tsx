/**
 * DIGIT CRM C4 F-01 settings card (CRM settings page): lead score points, unqualified reasons, deal stage requirements,
 * first-response promise and at-risk point, AI summary switch (off by default) and pipelines — all stored on FCRM
 * Settings through leadRules.saveLeadRules, so the list, the records and the reports read one setting. Sales Manager only.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLang } from "@/i18n";
import { isManager } from "./wf01";
import { dealStages } from "./wf02";
import { leadRules, PIPELINE_AR, saveLeadRules, SCORE_DEFAULTS, STAGE_NEED_LABEL, UNQUALIFIED_AR, type ScoreRules, type StageNeed } from "./leadRules";
import { srcLabel, stageLabelOf, tx } from "./CrmRecordParts";

const NEEDS = Object.keys(STAGE_NEED_LABEL) as StageNeed[];
const ENG_LABEL: Record<keyof ScoreRules["engagement"], [string, string]> = { contact: ["Email or mobile", "بريد أو جوال"], company: ["Company named", "الشركة محددة"], recent7: ["Activity in 7 days", "نشاط خلال 7 أيام"], recent30: ["Activity in 30 days", "نشاط خلال 30 يومًا"], stale: ["No activity > 30 days", "لا نشاط أكثر من 30 يومًا"], completedCall: ["Answered call", "مكالمة تم الرد عليها"], nextStep: ["Next step set", "خطوة تالية محددة"], overdue: ["Overdue follow-up", "متابعة متأخرة"], qualified: ["Status Qualified", "الحالة مؤهل"] };
export function LeadRulesCard({ user }: { user: string }) {
  const ar = useLang() === "ar"; const mgr = isManager(user);
  const R = leadRules();
  const [score, setScore] = useState<ScoreRules>(R.score);
  // Arabic screens edit the Arabic labels; a known label is saved back as its stored key, any new line is kept as typed
  const show = (keys: string[], map: Record<string, string>) => keys.map((k) => (ar ? map[k] ?? k : k)).join("\n");
  const keyOf = (line: string, map: Record<string, string>) => Object.keys(map).find((k) => map[k] === line) ?? line;
  const lines = (v: string, map: Record<string, string>) => v.split("\n").map((x) => x.trim()).filter(Boolean).map((x) => keyOf(x, map));
  const [reasons, setReasons] = useState(() => show(R.unqualified, UNQUALIFIED_AR)); const [pipes, setPipes] = useState(() => show(R.pipelines, PIPELINE_AR));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const r = leadRules(); setReasons(show(r.unqualified, UNQUALIFIED_AR)); setPipes(show(r.pipelines, PIPELINE_AR)); }, [ar]);
  const [needs, setNeeds] = useState<Record<string, StageNeed[]>>(R.stages.needs); const [modeB, setModeB] = useState(R.stages.mode);
  const [hours, setHours] = useState(String(R.slaHours)); const [risk, setRisk] = useState(String(R.slaRiskPct)); const [ai, setAi] = useState(R.aiSummary);
  const num = (v: string) => (v.trim() === "" ? 0 : Number(v));
  const save = () => {
    const x = saveLeadRules({ score, unqualified: lines(reasons, UNQUALIFIED_AR), pipelines: lines(pipes, PIPELINE_AR), stages: { mode: modeB, needs }, slaHours: Number(hours), slaRiskPct: Number(risk), aiSummary: ai }, user);
    if (x.ok) toast.success(tx(ar, "Lead and deal rules saved", "حُفظت قواعد العملاء المحتملين والصفقات")); else toast.error(ar ? ({ "Only a Sales Manager can change the working rules": "تغيير القواعد لمدير المبيعات فقط", "Enter first-response hours between 1 and 168": "أدخل ساعات أول رد بين 1 و168", "Enter an at-risk point between 10% and 95%": "أدخل نقطة «معرّض للتأخر» بين 10% و95%", "Keep at least one unqualified reason": "أبقِ سببًا واحدًا على الأقل", "Keep at least one pipeline": "أبقِ مسارًا واحدًا على الأقل", "Hot must be above Warm, both between 1 and 100": "«ساخن» أعلى من «دافئ» وكلاهما بين 1 و100" } as Record<string, string>)[x.error] ?? x.error : x.error);
  };
  const stages = dealStages().filter((s) => s["type"] !== "Lost");
  const box = "grid gap-1 text-sm";
  return <section className="ek-card ek-card-pad" data-crm-lead-rules>
    <h3 className="ek-h3">{tx(ar, "Lead and deal rules", "قواعد العملاء المحتملين والصفقات")}</h3>
    <p className="mb-3 text-xs text-muted-foreground">{tx(ar, "DIGIT working defaults (best practice). Changes apply at once to the lead list, the records and the reports.", "قيم ديجيت الافتراضية (أفضل الممارسات). يسري التغيير فورًا على قائمة العملاء والسجلات والتقارير.")}</p>
    <fieldset disabled={!mgr} className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="grid gap-2" data-rule-score>
          <h4 className="text-sm font-semibold">{tx(ar, "Lead score points", "نقاط درجة العميل")}</h4>
          <div className="grid grid-cols-2 gap-2">{Object.keys(score.source).map((k) => <label key={k} className={box}>{srcLabel(k, ar)}<input type="number" className="field-input min-h-9" dir="ltr" value={score.source[k]} onChange={(e) => setScore({ ...score, source: { ...score.source, [k]: num(e.target.value) } })} /></label>)}</div>
          <div className="grid grid-cols-3 gap-2">{Object.keys(score.size).map((k) => <label key={k} className={box}><span dir="ltr">{k}</span><input type="number" className="field-input min-h-9" dir="ltr" value={score.size[k]} onChange={(e) => setScore({ ...score, size: { ...score.size, [k]: num(e.target.value) } })} /></label>)}</div>
          <div className="grid grid-cols-3 gap-2">{(Object.keys(score.engagement) as (keyof ScoreRules["engagement"])[]).map((k) => <label key={k} className={box}>{ENG_LABEL[k][ar ? 1 : 0]}<input type="number" className="field-input min-h-9" dir="ltr" value={score.engagement[k]} onChange={(e) => setScore({ ...score, engagement: { ...score.engagement, [k]: num(e.target.value) } })} /></label>)}</div>
          <div className="grid grid-cols-2 gap-2">{score.budget.map((b, i) => <label key={i} className={box}>{tx(ar, `Value ≥ ${b.min.toLocaleString("en-US")}`, `القيمة ≥ ${b.min.toLocaleString("en-US")}`)}<input type="number" className="field-input min-h-9" dir="ltr" value={b.points} onChange={(e) => setScore({ ...score, budget: score.budget.map((x, j) => (j === i ? { ...x, points: num(e.target.value) } : x)) })} /></label>)}</div>
          <div className="grid grid-cols-2 gap-2"><label className={box}>{tx(ar, "Hot from", "ساخن من")}<input type="number" className="field-input min-h-9" dir="ltr" value={score.bands.hot} onChange={(e) => setScore({ ...score, bands: { ...score.bands, hot: num(e.target.value) } })} data-rule-hot /></label><label className={box}>{tx(ar, "Warm from", "دافئ من")}<input type="number" className="field-input min-h-9" dir="ltr" value={score.bands.warm} onChange={(e) => setScore({ ...score, bands: { ...score.bands, warm: num(e.target.value) } })} /></label></div>
          <button type="button" className="ek-rl-link justify-self-start" onClick={() => setScore(SCORE_DEFAULTS)}>{tx(ar, "Restore the default points", "استعادة النقاط الافتراضية")}</button>
        </div>
        <div className="grid content-start gap-3">
          <div className="grid grid-cols-2 gap-2"><label className={box}>{tx(ar, "First response within (hours)", "أول رد خلال (ساعات)")}<input type="number" min={1} max={168} className="field-input min-h-9" dir="ltr" value={hours} onChange={(e) => setHours(e.target.value)} data-rule-sla /></label>
            <label className={box}>{tx(ar, "«At risk» from (% of the time)", "«معرّض للتأخر» من (% من المهلة)")}<input type="number" min={10} max={95} className="field-input min-h-9" dir="ltr" value={risk} onChange={(e) => setRisk(e.target.value)} data-rule-risk /></label></div>
          <label className={box}>{tx(ar, "Unqualified reasons (one per line)", "أسباب عدم التأهيل (سطر لكل سبب)")}<textarea className="field-input" rows={5} value={reasons} onChange={(e) => setReasons(e.target.value)} data-rule-reasons /></label>
          <label className={box}>{tx(ar, "Pipelines (one per line)", "مسارات المبيعات (سطر لكل مسار)")}<textarea className="field-input" rows={3} value={pipes} onChange={(e) => setPipes(e.target.value)} data-rule-pipelines /></label>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} data-rule-ai /> {tx(ar, "AI record summary (off by default; the rule-based summary always shows)", "ملخص السجل بالذكاء الاصطناعي (معطّل افتراضيًا؛ الملخص المبني على القواعد يظهر دائمًا)")}</label>
        </div>
      </div>
      <div data-rule-stages>
        <h4 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">{tx(ar, "Deal stage requirements", "متطلبات مراحل الصفقة")}
          <span className="ek-seg" role="radiogroup">{(["block", "warn"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={modeB === k} onClick={() => setModeB(k)} data-rule-stage-mode={k}>{k === "block" ? tx(ar, "Block the move", "منع النقل") : tx(ar, "Warn only", "تنبيه فقط")}</button>)}</span></h4>
        <div className="overflow-x-auto"><table className="dp-table w-full text-xs" data-compact><thead><tr><th className="text-start">{tx(ar, "Stage", "المرحلة")}</th>{NEEDS.map((n) => <th key={n}>{STAGE_NEED_LABEL[n][ar ? 1 : 0]}</th>)}</tr></thead>
          <tbody>{stages.map((s) => <tr key={s.name}><td>{stageLabelOf(s.name, ar)}</td>{NEEDS.map((n) => <td key={n} className="text-center"><input type="checkbox" checked={(needs[s.name] ?? []).includes(n)} onChange={(e) => setNeeds({ ...needs, [s.name]: e.target.checked ? [...(needs[s.name] ?? []), n] : (needs[s.name] ?? []).filter((x) => x !== n) })} aria-label={`${s.name} · ${n}`} data-rule-need={`${s.name}:${n}`} /></td>)}</tr>)}</tbody></table></div>
      </div>
    </fieldset>
    <div className="mt-3">{mgr ? <button type="button" className="btn-primary" onClick={save} data-lead-rules-save>{tx(ar, "Save", "حفظ")}</button> : <span className="text-xs text-muted-foreground">{tx(ar, "Only a Sales Manager can change these rules.", "يغيّر هذه القواعد مدير المبيعات فقط.")}</span>}</div>
  </section>;
}
