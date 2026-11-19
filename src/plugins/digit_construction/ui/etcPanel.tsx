/**
 * Phase 4 C4-07 on the Forecasts workspace: edit a draft cost forecast's ETC line by line in a side panel while the
 * budget bar and the EAC-by-line chart stay visible and follow the edit live. Methods include Manual, Percent Complete
 * and Burn Rate (domain/calc.ts lineEtc, Python twin rules/calc.py line_etc); each line has its planned finish date and a
 * note; switching a manual line to another method warns that its manual figure is dropped; the bar marks 80 % / 100 % of
 * the revised budget. Saving goes through documentApi.saveDocument on the draft snapshot, so the snapshot hook recomputes
 * every figure and permissions apply.
 */
import { useState } from "react";
import { BudgetBar } from "@/components/enterprise/kit/BudgetBar";
import { budgetThresholds } from "../domain/costScreens";
import { cachedMeta } from "@/lib/catalog";
import { saveDocument } from "@/lib/documentApi";
import { useScopeMetas } from "@/lib/scope";
import { hasPerm, useSessionUser } from "@/lib/session";
import { useStoreVersion, type Doc } from "@/lib/adapter";
import { burnDays, eac as eacOf, ETC_METHODS, lineEtc, num, r2, vac, type EtcMethod } from "../domain/calc";
import { costPosition, get, list, projectTitle, rows } from "../domain/data";
import { constructionProjects } from "../domain/queues";
import * as S from "../domain/services";
import { amount, BTN, compact, DocRef, Empty, hasRole, StateBadge, useCx } from "./kit";
import { DateInput } from "@/components/form/DateInput";

type Row = Record<string, unknown>;
const SNAP = "Digit Cost Forecast Snapshot";
const METHOD_AR: Record<EtcMethod, string> = { "Budget Remaining": "متبقي الموازنة", "Committed + Uncommitted": "الملتزم + غير الملتزم", "Manual ETC": "تقدير يدوي", "Qty × Rate": "الكمية × السعر", "Average Performance": "متوسط الأداء", "Percent Complete": "نسبة الإنجاز", "Burn Rate": "معدل الصرف" };
const METHOD_HINT: Record<EtcMethod, [string, string]> = {
  "Budget Remaining": ["ETC = revised budget − actual", "المتبقي = الموازنة المعدلة − الفعلي"], "Committed + Uncommitted": ["ETC = open commitments + uncommitted estimate", "المتبقي = الالتزامات المفتوحة + تقدير غير الملتزم"],
  "Manual ETC": ["ETC = the figure you enter", "المتبقي = الرقم الذي تُدخله"], "Qty × Rate": ["ETC = (budget qty − installed) × unit rate", "المتبقي = (الكمية الموازنة − المنفذة) × سعر الوحدة"],
  "Average Performance": ["ETC = (actual ÷ installed) × (budget qty − installed)", "المتبقي = (الفعلي ÷ المنفذ) × (الكمية الموازنة − المنفذة)"],
  "Percent Complete": ["ETC = actual × (100 − %) ÷ %", "المتبقي = الفعلي × (100 − النسبة) ÷ النسبة"], "Burn Rate": ["ETC = (actual ÷ days since start) × days left to the planned finish", "المتبقي = (الفعلي ÷ الأيام منذ البدء) × الأيام المتبقية حتى الانتهاء المخطط"],
};
const INPUTS = ["method", "manual_etc", "uncommitted_remaining", "qty_budget", "qty_installed", "unit_rate", "pct_complete", "planned_finish", "note", "confidence"] as const;
const blank = (v: unknown) => v === undefined || v === null || v === "";
export const isManualDrop = (from: Row, method: string) => from["method"] === "Manual ETC" && !blank(from["manual_etc"]) && method !== "Manual ETC";

/** The ETC a line would have with these inputs (the same function and inputs the snapshot hook uses). */
export function previewLine(l: Row, start: unknown, cutoff: unknown): { etc: number | null; eac: number | null; variance: number | null } {
  const actual = num(l["actual"]), revised = num(l["revised_budget"]);
  const etc = lineEtc((l["method"] as EtcMethod) || "Budget Remaining", { revised, committed: num(l["committed"]), actual, uncommitted: l["uncommitted_remaining"], manual: l["manual_etc"], qtyBudget: l["qty_budget"], qtyInstalled: l["qty_installed"], unitRate: l["unit_rate"], pctComplete: l["pct_complete"], burn: burnDays(start, cutoff, l["planned_finish"]) });
  const e = eacOf(actual, etc); return { etc, eac: e, variance: vac(revised, e) };
}

export function EtcPanel({ scope, on }: { scope: { company?: string | undefined; project?: string | undefined }; on: string }) {
  const { t, ar } = useCx(); useStoreVersion(); const user = useSessionUser();
  useScopeMetas([SNAP, "Digit Forecast Line"]);
  const projects = constructionProjects(scope.company ? { company: scope.company } : {});
  const withFc = projects.filter((p) => list(SNAP, (f) => f["project"] === p.name).length);
  const [pick, setPick] = useState(scope.project || withFc[0]?.name || projects[0]?.name || "");
  const project = projects.some((p) => p.name === pick) ? pick : scope.project || withFc[0]?.name || projects[0]?.name || "";
  const [edit, setEdit] = useState<string | null>(null);
  const [vals, setVals] = useState<Row>({});
  const [bulk, setBulk] = useState<EtcMethod | "">("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string[] } | null>(null);
  if (!project) return <Empty>{t("No construction projects you can read.", "لا توجد مشاريع مقاولات يمكنك قراءتها.")}</Empty>;
  const pj = get("Project", project); const start = pj?.["actual_start_date"] || pj?.["expected_start_date"] || "";
  const draft: Doc | undefined = list(SNAP, (f) => f["project"] === project && f["workflow_state"] === "Draft" && num(f.docstatus) === 0)[0];
  const meta = cachedMeta(SNAP);
  const canWrite = !!draft && !!meta && hasPerm(meta, "write", draft, user);
  const c = costPosition(project, on);
  const base = rows(draft, "lines");
  const cutoff = draft?.["cutoff_date"] || on;
  const lines: Row[] = base.map((l) => (edit && l["line_key"] === edit ? { ...l, ...vals } : l));
  const pv = lines.map((l) => ({ l, ...previewLine(l, start, cutoff) }));
  const known = pv.every((x) => x.etc !== null);
  const actual = r2(pv.reduce((a, x) => a + num(x.l["actual"]), 0)), etcSum = r2(pv.reduce((a, x) => a + (x.etc ?? 0), 0));
  const revised = draft ? num(draft["total_revised"]) || c.revised : c.revised;
  const cur = edit ? lines.find((l) => l["line_key"] === edit) : undefined;
  const orig = edit ? base.find((l) => l["line_key"] === edit) : undefined;
  const curPv = cur ? previewLine(cur, start, cutoff) : null;
  const set = (k: string, v: unknown) => setVals((x) => ({ ...x, [k]: v }));
  const descOf = (k: unknown) => c.lines.find((x) => x.line_key === k)?.description ?? "";
  const open = (l: Row) => { setEdit(String(l["line_key"])); setVals(Object.fromEntries(INPUTS.map((k) => [k, l[k] ?? ""]))); setMsg(null); };
  const save = (next: Row[], done: string) => {
    if (!draft || !meta) return;
    const r = saveDocument(meta, draft.name, { lines: next }, { user });
    if (r.errors.length) setMsg({ tone: "bad", text: r.errors }); else { setMsg({ tone: "ok", text: [done] }); setEdit(null); setVals({}); setBulk(""); }
  };
  const saveLine = () => {
    if (!cur || !orig) return;
    const drop = isManualDrop(orig, String(cur["method"]));
    save(base.map((l) => (l["line_key"] === edit ? { ...l, ...vals, ...(drop ? { manual_etc: null } : {}) } : l)), t("Forecast line saved", "حُفظ بند التوقع"));
  };
  const dropping = bulk ? base.filter((l) => isManualDrop(l, bulk)) : [];
  const applyBulk = () => { if (!bulk) return; save(base.map((l) => ({ ...l, method: bulk, ...(isManualDrop(l, bulk) ? { manual_etc: null } : {}) })), t(`Method applied to ${base.length} lines`, `طُبقت الطريقة على ${base.length} بندًا`)); };
  const maxV = Math.max(1, ...pv.map((x) => Math.max(num(x.l["revised_budget"]), x.eac ?? 0)));
  const num_ = (k: string, label: string, step = "0.01") => <label className="block text-xs font-semibold">{label}
    <input type="number" step={step} className="field-input mt-1 min-h-11 w-full text-sm sm:min-h-9" value={String(vals[k] ?? "")} onChange={(e) => set(k, e.target.value === "" ? "" : Number(e.target.value))} data-etc-input={k} /></label>;
  const method = (cur?.["method"] as EtcMethod) || "Budget Remaining";
  return (
    <div className="grid gap-4" data-etc-panel={project}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold">{t("Project", "المشروع")}
          <select className="field-input mt-1 min-h-11 w-auto text-sm sm:min-h-9" value={project} onChange={(e) => { setPick(e.target.value); setEdit(null); setMsg(null); }} data-etc-project>
            {projects.map((p) => <option key={p.name} value={p.name} data-no-i18n>{projectTitle(p, !ar)}</option>)}</select></label>
        {draft ? <p className="text-sm">{t("Draft forecast", "مسودة التوقع")}: <DocRef doctype={SNAP} name={draft.name} /> <StateBadge state={draft["workflow_state"]} /> <span className="text-xs text-muted-foreground" data-no-i18n>· {String(draft["cutoff_date"] ?? "")}</span></p>
          : <p className="text-sm text-muted-foreground">{c.forecast ? <>{t("Latest forecast", "أحدث توقع")}: <DocRef doctype={SNAP} name={c.forecast.name} /> <StateBadge state={c.forecast["workflow_state"]} /> · </> : null}{t("No draft forecast to edit.", "لا توجد مسودة توقع للتعديل.")}</p>}
        {!draft && hasRole("Digit QS", "Digit Project Manager") && <button type="button" className={BTN.primary} data-etc-new onClick={() => { const r = S.createForecast(project); setMsg(r.ok ? { tone: "ok", text: [t("Draft forecast created", "أُنشئت مسودة التوقع")] } : { tone: "bad", text: r.errors }); }}>{t("Start a draft forecast", "بدء مسودة توقع")}</button>}
      </div>
      {!draft && c.budget && <BudgetBar ar={ar} thresholds={[budgetThresholds().warn, budgetThresholds().over]} title={t("Latest position against the revised budget", "آخر موقف مقابل الموازنة المعدلة")} budget={c.revised} budgetText={`${t("budget", "الموازنة")} ${compact(c.revised, ar)}`}
        parts={[{ key: "actual", label: t("Actual", "الفعلي"), value: c.actual, display: compact(c.actual, ar), tone: "actual" }, ...(c.eac !== null ? [{ key: "etc", label: t("ETC (remaining)", "المتبقي المتوقع"), value: Math.max(0, c.eac - c.actual), display: compact(Math.max(0, c.eac - c.actual), ar), tone: "forecast" as const }] : [])]}
        note={t("Start a draft forecast to edit each line's ETC.", "ابدأ مسودة توقع لتعديل المتبقي لكل بند.")} />}
      {msg && <div className={`rounded-md p-2 text-xs ${msg.tone === "bad" ? "bg-destructive/10 text-destructive" : "bg-success/15 text-success-text"}`} role="status" data-etc-msg={msg.tone}>{msg.text.map((x) => <p key={x}>{x}</p>)}</div>}
      {draft && <div className={`grid gap-4 ${edit ? "lg:grid-cols-[minmax(0,1fr)_360px]" : ""}`}>
        <div className="min-w-0 space-y-4">
          <BudgetBar ar={ar} thresholds={[budgetThresholds().warn, budgetThresholds().over]} title={t("Forecast against the revised budget", "التوقع مقابل الموازنة المعدلة")} budget={revised} budgetText={`${t("budget", "الموازنة")} ${compact(revised, ar)}`}
            parts={[{ key: "actual", label: t("Actual", "الفعلي"), value: actual, display: compact(actual, ar), tone: "actual" }, { key: "etc", label: t("ETC (remaining)", "المتبقي المتوقع"), value: etcSum, display: known ? compact(etcSum, ar) : `${compact(etcSum, ar)}+`, tone: "forecast" }]}
            note={known ? t("EAC = actual + ETC of every line; markers at 80 % and 100 % of the revised budget.", "التكلفة المتوقعة = الفعلي + المتبقي لكل البنود؛ العلامات عند 80% و100% من الموازنة المعدلة.") : t("Some lines have no ETC yet (a method without its input); the bar shows the known part.", "بعض البنود بلا تقدير بعد (طريقة بلا مدخلها)؛ يعرض الشريط الجزء المعروف.")} />
          <div data-etc-chart>
            <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{t("EAC by line against its revised budget", "التكلفة المتوقعة لكل بند مقابل موازنته المعدلة")}</h4>
            <ul className="space-y-1.5">{pv.map(({ l, eac, variance }) => { const k = String(l["line_key"]); const over = variance !== null && variance < 0;
              return <li key={k} className={`grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-2 rounded-md px-1 text-xs ${edit === k ? "bg-primary/10" : ""}`} data-etc-bar={k}>
                <button type="button" className="truncate text-start text-primary hover:underline" onClick={() => open(l)} disabled={!canWrite} title={descOf(k)} data-no-i18n>{String(l["cost_code"] || k)}{descOf(k) ? <span className="ms-1 text-muted-foreground">· {descOf(k)}</span> : null}</button>
                <span className="relative h-3 rounded-full bg-muted"><span className="absolute inset-y-0 start-0 rounded-full bg-muted-foreground/30" style={{ width: `${(num(l["revised_budget"]) / maxV) * 100}%` }} />
                  <span className={`absolute inset-y-0.5 start-0 rounded-full ${over ? "bg-destructive" : "bg-primary"}`} style={{ width: `${((eac ?? num(l["actual"])) / maxV) * 100}%` }} /></span>
                <span className={`tabular-nums ${over ? "text-destructive" : ""}`} data-no-i18n>{eac === null ? "—" : compact(eac, ar)}</span></li>; })}</ul>
          </div>
          <div className="overflow-x-auto">
            <table className={`w-full text-xs ${edit ? "min-w-[34rem]" : "min-w-[44rem]"}`} data-etc-lines>
              <thead><tr className="border-b border-border text-muted-foreground">{[t("Cost code", "رمز التكلفة"), t("Revised", "المعدلة"), t("Actual", "الفعلي"), t("Method", "الطريقة"), t("ETC", "المتبقي"), t("EAC", "المتوقعة"), ...(edit ? [] : [t("Planned finish", "الانتهاء المخطط")]), ""].map((h, i) => <th key={i} className={`px-1.5 py-1.5 font-semibold ${i && i < 6 && i !== 3 ? "text-end" : "text-start"}`}>{h}</th>)}</tr></thead>
              <tbody>{pv.map(({ l, etc, eac }) => { const k = String(l["line_key"]); return <tr key={k} className={`border-b border-border/60 ${edit === k ? "bg-primary/10" : ""}`} data-etc-line={k}>
                <td className="px-1.5 py-1.5" data-no-i18n><div className="whitespace-nowrap font-medium">{String(l["cost_code"] || k)}</div>{descOf(k) && <div className="max-w-[12rem] truncate text-[11px] text-muted-foreground" title={descOf(k)}>{descOf(k)}</div>}</td><td className="px-1.5 py-1.5 text-end tabular-nums" data-no-i18n>{amount(num(l["revised_budget"]))}</td><td className="px-1.5 py-1.5 text-end tabular-nums" data-no-i18n>{amount(num(l["actual"]))}</td>
                <td className="px-1.5 py-1.5 whitespace-nowrap">{ar ? METHOD_AR[(l["method"] as EtcMethod) || "Budget Remaining"] : String(l["method"] || "Budget Remaining")}</td>
                <td className="px-1.5 py-1.5 text-end tabular-nums" data-no-i18n>{etc === null ? "—" : amount(etc)}</td><td className="px-1.5 py-1.5 text-end tabular-nums" data-no-i18n>{eac === null ? "—" : amount(eac)}</td>
                {!edit && <td className="px-1.5 py-1.5" data-no-i18n>{String(l["planned_finish"] || "—")}</td>}
                <td className="px-1.5 py-1.5 text-end">{canWrite && <button type="button" className={BTN.compact} onClick={() => open(l)} data-etc-edit={k}>{t("Edit ETC", "تعديل المتبقي")}</button>}</td></tr>; })}</tbody>
            </table>
          </div>
          {canWrite && <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2" data-etc-bulk>
            <label className="text-xs font-semibold">{t("Apply one method to every line", "تطبيق طريقة واحدة على كل البنود")}
              <select className="field-input mt-1 min-h-11 w-auto text-sm sm:min-h-9" value={bulk} onChange={(e) => setBulk(e.target.value as EtcMethod | "")} data-etc-bulk-method><option value="">—</option>{ETC_METHODS.map((m) => <option key={m} value={m}>{ar ? METHOD_AR[m] : m}</option>)}</select></label>
            <button type="button" className={BTN.secondary} disabled={!bulk} onClick={applyBulk} data-etc-bulk-apply>{t("Apply", "تطبيق")}</button>
            {dropping.length > 0 && <p className="basis-full text-xs font-semibold text-warning" role="alert" data-etc-drop-warning={dropping.length}>{t(`${dropping.length} manual line(s) will be dropped: their manual ETC is cleared and the new method computes the figure.`, `سيُسقط ${dropping.length} بند يدوي: يُمسح تقديره اليدوي وتحسب الطريقة الجديدة الرقم.`)}</p>}
          </div>}
          {!canWrite && <p className="text-xs text-muted-foreground">{t("You can view this forecast; editing needs write permission on the draft.", "يمكنك عرض هذا التوقع؛ التعديل يحتاج صلاحية كتابة على المسودة.")}</p>}
        </div>
        {edit && cur && <aside className="rounded-xl border border-border bg-card p-3 shadow-sm lg:sticky lg:top-4 lg:self-start" aria-label={t("Edit ETC", "تعديل المتبقي")} data-etc-side={edit}>
          <div className="mb-2 flex items-center gap-2"><h4 className="text-sm font-bold" data-no-i18n>{String(cur["cost_code"] || edit)}</h4><button type="button" className="ms-auto min-h-9 min-w-9 rounded-md hover:bg-muted" onClick={() => { setEdit(null); setVals({}); }} aria-label={t("Close", "إغلاق")} data-etc-close>✕</button></div>
          <div className="space-y-2">
            <label className="block text-xs font-semibold">{t("ETC method", "طريقة التقدير")}
              <select className="field-input mt-1 min-h-11 w-full text-sm sm:min-h-9" value={method} onChange={(e) => set("method", e.target.value)} data-etc-input="method">{ETC_METHODS.map((m) => <option key={m} value={m}>{ar ? METHOD_AR[m] : m}</option>)}</select></label>
            <p className="text-[11px] text-muted-foreground" data-etc-formula>{METHOD_HINT[method][ar ? 1 : 0]}</p>
            {method === "Manual ETC" && num_("manual_etc", t("Manual ETC", "التقدير اليدوي"))}
            {method === "Percent Complete" && num_("pct_complete", t("Percent complete %", "نسبة الإنجاز %"), "1")}
            {method === "Committed + Uncommitted" && num_("uncommitted_remaining", t("Uncommitted remaining", "غير الملتزم المتبقي"))}
            {(method === "Qty × Rate" || method === "Average Performance") && <>{num_("qty_budget", t("Budget qty", "الكمية الموازنة"))}{num_("qty_installed", t("Installed qty", "الكمية المنفذة"))}</>}
            {method === "Qty × Rate" && num_("unit_rate", t("Unit rate", "سعر الوحدة"))}
            {method === "Burn Rate" && <p className="text-xs" data-etc-burn>{(() => { const b = burnDays(start, cutoff, vals["planned_finish"]); return b.elapsed ? (b.left === null ? t(`Burn ${compact(num(cur["actual"]) / b.elapsed, ar)} a day over ${b.elapsed} days — enter the planned finish to get the ETC.`, `الصرف ${compact(num(cur["actual"]) / b.elapsed, ar)} يوميًا على ${b.elapsed} يومًا — أدخل تاريخ الانتهاء المخطط ليظهر المتبقي.`) : t(`Burn ${compact(num(cur["actual"]) / b.elapsed, ar)} a day over ${b.elapsed} days; ${b.left} days left`, `الصرف ${compact(num(cur["actual"]) / b.elapsed, ar)} يوميًا على ${b.elapsed} يومًا؛ متبقٍ ${b.left} يومًا`)) : t("The project has no start date before the cut-off.", "لا يوجد تاريخ بدء للمشروع قبل تاريخ القطع."); })()}</p>}
            <label className="block text-xs font-semibold">{t("Planned finish", "تاريخ الانتهاء المخطط")}
              <DateInput className="field-input mt-1 min-h-11 w-full text-sm sm:min-h-9" value={String(vals["planned_finish"] ?? "")} onChange={(e) => set("planned_finish", e.target.value)} data-etc-input="planned_finish" /></label>
            <label className="block text-xs font-semibold">{t("Note", "ملاحظة")}
              <textarea className="field-input mt-1 min-h-16 w-full text-sm" value={String(vals["note"] ?? "")} onChange={(e) => set("note", e.target.value)} data-etc-input="note" /></label>
            <dl className="grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-2 text-center text-xs" data-etc-preview>
              <div><dt className="text-muted-foreground">{t("ETC", "المتبقي")}</dt><dd className="font-semibold tabular-nums" data-no-i18n data-etc-preview-etc>{curPv?.etc === null || !curPv ? "—" : compact(curPv.etc, ar)}</dd></div>
              <div><dt className="text-muted-foreground">{t("EAC", "المتوقعة")}</dt><dd className="font-semibold tabular-nums" data-no-i18n>{curPv?.eac === null || !curPv ? "—" : compact(curPv.eac, ar)}</dd></div>
              <div><dt className="text-muted-foreground">{t("Variance", "الانحراف")}</dt><dd className={`font-semibold tabular-nums ${curPv && curPv.variance !== null && curPv.variance < 0 ? "text-destructive" : ""}`} data-no-i18n>{curPv?.variance === null || !curPv ? "—" : compact(curPv.variance, ar)}</dd></div>
            </dl>
            {curPv?.etc === null && <p className="text-xs text-warning">{t("This method needs its input before it gives an ETC.", "هذه الطريقة تحتاج مدخلها قبل أن تعطي تقديرًا.")}</p>}
            {orig && isManualDrop(orig, method) && <p className="rounded-md bg-warning/15 p-2 text-xs font-semibold text-warning" role="alert" data-etc-drop-warning="1">{t(`The manual ETC (${compact(num(orig["manual_etc"]), ar)}) will be dropped when you save.`, `سيُسقط التقدير اليدوي (${compact(num(orig["manual_etc"]), ar)}) عند الحفظ.`)}</p>}
            <div className="flex gap-2 pt-1"><button type="button" className={BTN.primary} onClick={saveLine} data-etc-save>{t("Save line", "حفظ البند")}</button><button type="button" className={BTN.secondary} onClick={() => { setEdit(null); setVals({}); }}>{t("Cancel", "إلغاء")}</button></div>
          </div>
        </aside>}
      </div>}
    </div>
  );
}
