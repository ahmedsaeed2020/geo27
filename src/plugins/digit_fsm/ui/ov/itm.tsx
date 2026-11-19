/** Inspection & technical approval workspace overviews: ITM command, Runs, Results, Evidence review, Published reports. */
import { list, rows, titleOf } from "../../domain/data";
import { s } from "../../domain/rules";
import { numTxt, opt } from "../kit";
import { Bars, Cols, Funnel, Heat, Insight, Ring, Stack, countBy, inF, inWin, monthAxis, monthEnd, monthLabel, perMonth, pts, rp, titleL } from "../insights";
import { C, K, LS, M, Q, R, num, type OvFn } from "./ctx";

const RUN = "FSM Inspection Run";
const STAGES = ["Draft", "In Progress", "Submitted for Review", "Reviewed", "Published"];
const OUTCOMES = ["Pass", "Fail", "Inaccessible", "Untested", "Not Applicable"];
const OUT_TONE = (k: string) => (k === "Pass" ? "good" as const : k === "Fail" ? "bad" as const : k === "Inaccessible" ? "warn" as const : k === "Untested" ? "neutral" as const : undefined);
const site = (k: string) => titleL((k) => titleOf("FSM Service Site", k))(k);
const sys = (k: string) => titleL((k) => titleOf("FSM Service System", k))(k);
const waitBucket = (d: number) => (d <= 2 ? "0–2" : d <= 7 ? "3–7" : d <= 14 ? "8–14" : ">14");
const runsOf = (F: Parameters<OvFn>[0]["F"]) => list(RUN).filter((r) => inF(r, F) && inWin(r["submitted_on"] || r["creation"], F));

export const itmLead: OvFn = (c) => {
  const { t, ar, F } = c;
  const runs = runsOf(F); const done = runs.filter((r) => ["Reviewed", "Published"].includes(s(r["workflow_state"])));
  const rp17 = R("RP17", F).filter((r) => s(r["state"]) === "Submitted for Review"); const rp03 = R("RP03", F);
  return {
    charts: <>
      <Insight id="itm-funnel" title={["Inspection pipeline", "مسار الفحص"]} q={["How many runs reached each stage?", "كم جولة وصلت إلى كل مرحلة؟"]}
        meta={M([RUN], ["One inspection run; a run counts at its stage and every earlier one", "جولة فحص واحدة؛ تُحسب في مرحلتها وكل مرحلة قبلها"], ["Runs at or beyond Started → Submitted → Reviewed → Published", "الجولات في مرحلة البدء ← التقديم ← المراجعة ← النشر أو بعدها"], ["Run register filtered to the stages counted", "سجل الجولات مفلتراً بالمراحل المعدودة"])}>
        <Funnel steps={[1, 2, 3, 4].map((i) => { const st = STAGES.slice(i); return { key: STAGES[i]!, label: opt(i === 1 ? "In Progress" : STAGES[i]!, ar), value: runs.filter((r) => st.includes(s(r["workflow_state"]))).length, ...LS(RUN, ["workflow_state", ["in", st]]) }; })} empty={t("No inspection run has started in scope.", "لم تبدأ أي جولة فحص ضمن النطاق.")} />
      </Insight>
      <Insight id="itm-result" title={["Technical result of reviewed runs", "النتيجة الفنية للجولات المراجَعة"]} q={["Of the runs a reviewer approved, how many passed?", "من الجولات التي اعتمدها المراجع، كم نجحت؟"]}
        meta={M([RUN], ["Reviewed or published runs only", "الجولات المراجَعة أو المنشورة فقط"], ["Count by technical_result; Pending / Incomplete are never passes", "العدد حسب النتيجة الفنية؛ المعلق / غير المكتمل ليس نجاحاً"], ["Run register filtered to the result", "سجل الجولات مفلتراً بالنتيجة"])}>
        <Ring items={pts(countBy(done, "technical_result"), { label: (k) => opt(k, ar), order: ["Pass", "Fail", "Incomplete", "Pending"], tone: (k) => (k === "Pass" ? "good" : k === "Fail" ? "bad" : "warn"), drill: (k) => LS(RUN, ["workflow_state", ["in", ["Reviewed", "Published"]]], ["technical_result", k]) })} total={t("reviewed", "مراجَعة")} empty={t("No reviewed run yet.", "لا جولات مراجَعة بعد.")} />
      </Insight>
      <Insight id="itm-wait" title={["Review queue by waiting time", "طابور المراجعة حسب مدة الانتظار"]} q={["How long have submitted runs waited for a reviewer?", "كم انتظرت الجولات المقدمة المراجع؟"]}
        meta={M([RUN], ["One run Submitted for Review (RP17)", "جولة مقدمة للمراجعة (RP17)"], ["waiting_days = as-of − submitted_on, bucketed", "أيام الانتظار = التاريخ − تاريخ التقديم، في فئات"], ["RP17 filtered to submitted runs", "RP17 مفلتراً بالجولات المقدمة"])}>
        <Bars items={pts(countBy(rp17, (r) => waitBucket(num(r["waiting_days"]))), { order: ["0–2", "3–7", "8–14", ">14"], tone: (k) => (k === ">14" ? "bad" : k === "8–14" ? "warn" : undefined), drill: () => ({ to: rp("RP17", F, { state: "Submitted for Review" }) }) })} empty={t("No run waits for review.", "لا جولة بانتظار المراجعة.")} />
      </Insight>
      <Insight id="itm-cov" title={["Device coverage per run", "تغطية الأجهزة لكل جولة"]} q={["Did each run inspect every expected device?", "هل فحصت كل جولة جميع الأجهزة المتوقعة؟"]}
        meta={M([RUN, "FSM Inspection Result"], ["One run (RP03); results aggregated per run", "جولة واحدة (RP03)؛ النتائج مجمعة لكل جولة"], ["coverage % = inspected ÷ expected devices", "التغطية % = المفحوص ÷ الأجهزة المتوقعة"], ["Run 360", "الجولة 360"], ["A run without an expected device count shows 0 % and is never treated as complete", "الجولة بلا عدد أجهزة متوقع تظهر 0% ولا تُعد مكتملة"])}>
        <Bars fmt={(v) => `${numTxt(v)}%`} items={rp03.slice().sort((a, b) => num(a["coverage"]) - num(b["coverage"])).slice(0, 10).map((r) => ({ key: s(r["run"]), label: <span data-no-i18n>{s(r["run"])} · {titleOf("FSM Service System", r["system"])}</span>, value: Math.round(num(r["coverage"])), tone: num(r["coverage"]) < 100 ? "warn" as const : "good" as const, to: `run/${encodeURIComponent(s(r["run"]))}` }))} empty={t("No inspection run in scope.", "لا جولات فحص ضمن النطاق.")} />
      </Insight>
    </>,
    kpis: <><K id="K05" F={F} c={c} /><K id="K07" F={F} c={c} /><K id="K08" F={F} c={c} /><K id="K27" F={F} c={c} /></>,
  };
};

export const runs: OvFn = (c) => {
  const { t, ar, F } = c;
  const all = runsOf(F); const sub = all.filter((r) => s(r["submitted_on"]));
  const months = monthAxis(sub.map((r) => r["submitted_on"]), F);
  const rp17 = R("RP17", F);
  return {
    charts: <>
      <Insight id="runs-state" title={["Runs by status", "الجولات حسب الحالة"]} q={["How many runs sit at each stage?", "كم جولة في كل مرحلة؟"]}
        meta={M([RUN], ["One inspection run", "جولة فحص واحدة"], ["Count by workflow_state", "العدد حسب الحالة"], ["Run register filtered to the status", "سجل الجولات مفلتراً بالحالة"])}>
        <Ring items={pts(countBy(all, "workflow_state"), { label: (k) => opt(k, ar), order: STAGES, tone: (k) => (k === "Published" ? "good" : k === "Submitted for Review" ? "warn" : undefined), drill: (k) => LS(RUN, ["workflow_state", k]) })} total={t("runs", "جولة")} empty={t("No inspection runs.", "لا جولات فحص.")} />
      </Insight>
      <Insight id="runs-month" title={["Runs submitted by month", "الجولات المقدمة حسب الشهر"]} q={["Is inspection output keeping pace?", "هل يواكب إنتاج الفحص الخطة؟"]}
        meta={M([RUN], ["One submitted run", "جولة مقدمة واحدة"], ["Count by submitted_on month", "العدد حسب شهر التقديم"], ["Run register for the month", "سجل الجولات للشهر"], ["Runs never submitted have no submission date and are not counted here", "الجولات غير المقدمة بلا تاريخ تقديم ولا تُحسب هنا"])}>
        <Cols labels={months} labelText={(m) => monthLabel(m, ar)} series={[{ name: "n", label: t("Submitted runs", "جولات مقدمة"), values: perMonth(sub, "submitted_on", months) }]} drill={(li) => LS(RUN, ["submitted_on", ["between", [`${months[li]}-01`, `${monthEnd(months[li]!)} 23:59:59`]]])} empty={t("No run submitted in scope.", "لا جولة مقدمة ضمن النطاق.")} />
      </Insight>
      <Insight id="runs-system" title={["Runs per system", "الجولات لكل نظام"]} q={["Which systems are inspected most?", "أي الأنظمة تُفحص أكثر؟"]}
        meta={M([RUN, "FSM Service System"], ["One run → its system", "جولة واحدة ← نظامها"], ["Count of runs per system", "عدد الجولات لكل نظام"], ["RP03 filtered to the system", "RP03 مفلتراً بالنظام"])}>
        <Bars items={pts(countBy(all, "system"), { label: sys, limit: 10, drill: (k) => ({ to: rp("RP03", F, { system: k }) }) })} empty={t("No inspection runs.", "لا جولات فحص.")} />
      </Insight>
      <Insight id="runs-returned" title={["Runs returned for correction", "الجولات المعادة للتصحيح"]} q={["How often do reviewers send runs back?", "كم مرة يعيد المراجعون الجولات؟"]}
        meta={M([RUN], ["One run in the review backlog (RP17)", "جولة في متأخرات المراجعة (RP17)"], ["Runs never returned vs returned at least once (return_count)", "جولات لم تُعد مقابل جولات أُعيدت مرة على الأقل"], ["RP17 filtered to the return count", "RP17 مفلتراً بعدد الإعادات"])}>
        <Ring items={pts(countBy(rp17, (r) => (num(r["return_count"]) > 0 ? "ret" : "first")), { label: (k) => (k === "ret" ? t("Returned at least once", "أُعيدت مرة على الأقل") : t("First submission", "تقديم أول")), tone: (k) => (k === "ret" ? "warn" : "good"), drill: (k) => (k === "first" ? { to: rp("RP17", F, { return_count: "0" }) } : { to: rp("RP17", F) }) })} total={t("in backlog", "في المتأخرات")} empty={t("No run in the review backlog.", "لا جولات في متأخرات المراجعة.")} />
      </Insight>
    </>,
    kpis: <><K id="K05" F={F} c={c} /><K id="K06" F={F} c={c} /><K id="K07" F={F} c={c} /><Q k="review" c={c} /></>,
  };
};

export const results: OvFn = (c) => {
  const { t, ar, F } = c;
  const r2 = R("RP02", F);
  const sites = [...new Set(r2.map((r) => s(r["site"])))];
  const tpls = [...new Set(r2.map((r) => s(r["template"])))];
  return {
    charts: <>
      <Insight id="res-outcome" title={["Check outcomes", "نتائج البنود"]} q={["What did the device checks return?", "ماذا أعادت بنود فحص الأجهزة؟"]}
        meta={M(["FSM Inspection Result", RUN], ["One check result row (RP02)", "صف نتيجة بند واحد (RP02)"], ["Count by outcome; Untested and Inaccessible are separate, never passes", "العدد حسب النتيجة؛ غير المختبر وغير الممكن الوصول منفصلان وليسا نجاحاً"], ["RP02 filtered to the outcome", "RP02 مفلتراً بالنتيجة"])}>
        <Ring items={pts(countBy(r2, "outcome"), { label: (k) => opt(k, ar), order: OUTCOMES, tone: OUT_TONE, drill: (k) => ({ to: rp("RP02", F, { outcome: k }) }) })} total={t("checks", "بند")} empty={t("No check result in scope.", "لا نتائج بنود ضمن النطاق.")} />
      </Insight>
      <Insight id="res-heat" title={["Outcomes by site", "النتائج حسب الموقع"]} q={["Which sites concentrate failures or access problems?", "أي المواقع تتركز فيها الإخفاقات أو مشاكل الوصول؟"]}
        meta={M(["FSM Inspection Result", "FSM Service Site"], ["One result row; site × outcome", "صف نتيجة واحد؛ الموقع × النتيجة"], ["Count per cell", "العدد لكل خلية"], ["RP02 filtered to site and outcome", "RP02 مفلتراً بالموقع والنتيجة"])}>
        <Heat rows={sites.map((k) => ({ key: k, label: site(k) }))} cols={OUTCOMES.map((k) => ({ key: k, label: opt(k, ar) }))} cell={(r, o) => ({ value: r2.filter((x) => s(x["site"]) === r && s(x["outcome"]) === o).length, to: rp("RP02", F, { site: r, outcome: o }) })} empty={t("No check result in scope.", "لا نتائج بنود ضمن النطاق.")} />
      </Insight>
      <Insight id="res-fail" title={["Most failed checks", "البنود الأكثر إخفاقاً"]} q={["Which checks fail most often?", "أي البنود تفشل أكثر؟"]}
        meta={M(["FSM Inspection Result", "FSM Template Check"], ["One failed result row", "صف نتيجة فاشلة"], ["Count of Fail per check code", "عدد الإخفاقات لكل رمز بند"], ["RP02 filtered to the check and Fail", "RP02 مفلتراً بالبند والإخفاق"])}>
        <Bars items={pts(countBy(r2.filter((r) => s(r["outcome"]) === "Fail"), "check_code"), { label: (k) => <span data-no-i18n>{k} · {s(r2.find((r) => s(r["check_code"]) === k)?.["check_text"])}</span>, limit: 10, tone: () => "bad", drill: (k) => ({ to: rp("RP02", F, { check_code: k, outcome: "Fail" }) }) })} empty={t("No failed check.", "لا بنود فاشلة.")} />
      </Insight>
      <Insight id="res-tpl" title={["Outcomes by template", "النتائج حسب القالب"]} q={["Do some templates produce more untested or failed checks?", "هل تنتج بعض القوالب بنوداً غير مختبرة أو فاشلة أكثر؟"]}
        meta={M(["FSM Inspection Result", "FSM Inspection Template"], ["One result row → run → template", "صف نتيجة ← الجولة ← القالب"], ["Count per template split by outcome", "العدد لكل قالب مقسماً حسب النتيجة"], ["RP02 filtered to template and outcome", "RP02 مفلتراً بالقالب والنتيجة"])}>
        <Stack legend={OUTCOMES.map((k) => ({ key: k, label: opt(k, ar), tone: OUT_TONE(k) }))} rows={tpls.map((k) => ({ key: k, label: <span data-no-i18n>{titleOf("FSM Inspection Template", k)}</span>, to: rp("RP02", F, { template: k }), segs: OUTCOMES.map((o) => ({ key: o, value: r2.filter((x) => s(x["template"]) === k && s(x["outcome"]) === o).length, to: rp("RP02", F, { template: k, outcome: o }) })) }))} empty={t("No check result in scope.", "لا نتائج بنود ضمن النطاق.")} />
      </Insight>
    </>,
    kpis: <><C c={c} label={["Check results", "نتائج البنود"]} value={r2.length} basis={["RP02 rows in scope", "صفوف RP02 ضمن النطاق"]} to={rp("RP02", F)} /><K id="K08" F={F} c={c} /><K id="K09" F={F} c={c} /><K id="K10" F={F} c={c} /></>,
  };
};

export const evidence: OvFn = (c) => {
  const { t, ar, F } = c;
  const runsIn = list(RUN).filter((r) => inF(r, F));
  const files = list("File").filter((f) => s(f["attached_to_doctype"]).startsWith("FSM "));
  const withFile = new Set(files.filter((f) => f["attached_to_doctype"] === RUN).map((f) => s(f["attached_to_name"])));
  const need = runsIn.map((r) => ({ run: r, n: rows(r, "results").filter((x) => x["evidence_required"] && ["Pass", "Fail"].includes(s(x["outcome"]))).length })).filter((x) => x.n > 0);
  const rp17 = R("RP17", F).filter((r) => s(r["state"]) === "Submitted for Review");
  const returned = runsIn.filter((r) => num(r["return_count"]) > 0);
  return {
    charts: <>
      <Insight id="ev-need" title={["Photo-required checks by run", "البنود المطلوب لها صورة حسب الجولة"]} q={["Which runs need photos, and do they carry any file?", "أي الجولات تحتاج صوراً، وهل عليها ملفات؟"]}
        meta={M([RUN, "FSM Inspection Result", "File"], ["One run with result rows whose check requires evidence (Pass / Fail)", "جولة بها صفوف نتائج يتطلب بندها دليلاً (نجاح/إخفاق)"], ["Required checks per run; green when the run has at least one attached File, amber when none", "البنود المطلوبة لكل جولة؛ أخضر إذا كان على الجولة ملف واحد على الأقل، كهرماني إذا لا"], ["Run 360 (attachments)", "الجولة 360 (المرفقات)"], ["Files are linked to the run, not to each check row, so a run with one file is not proof every check has a photo", "الملفات مرتبطة بالجولة لا بكل بند، فوجود ملف لا يثبت أن لكل بند صورة"])}>
        <Bars items={need.sort((a, b) => b.n - a.n).slice(0, 10).map((x) => ({ key: x.run.name, label: <span data-no-i18n>{x.run.name} · {titleOf("FSM Service System", x.run["system"])}</span>, value: x.n, tone: withFile.has(x.run.name) ? "good" as const : "warn" as const, to: `run/${encodeURIComponent(x.run.name)}` }))} empty={t("No check in scope requires a photo.", "لا بنود تتطلب صورة ضمن النطاق.")} />
      </Insight>
      <Insight id="ev-files" title={["Attached files by document type", "الملفات المرفقة حسب نوع المستند"]} q={["Where does field evidence live?", "أين تُحفظ أدلة الميدان؟"]}
        meta={M(["File"], ["One native File attached to an FSM record you may read", "ملف أصلي مرفق بسجل خدمة يحق لك قراءته"], ["Count by attached_to_doctype", "العدد حسب نوع المستند المرفق به"], ["File list filtered to the document type", "قائمة الملفات مفلترة بنوع المستند"])}>
        <Bars share items={pts(countBy(files, "attached_to_doctype"), { label: (k) => <span data-no-i18n>{ar ? titleOf("DocType", k) : k}</span>, drill: (k) => LS("File", ["attached_to_doctype", k]) })} empty={t("No file is attached to FSM records yet.", "لم تُرفق ملفات بسجلات الخدمة بعد.")} />
      </Insight>
      <Insight id="ev-wait" title={["Runs waiting for review by site", "الجولات بانتظار المراجعة حسب الموقع"]} q={["Where is evidence waiting for a reviewer?", "أين تنتظر الأدلة مراجعاً؟"]}
        meta={M([RUN], ["One run Submitted for Review (RP17)", "جولة مقدمة للمراجعة (RP17)"], ["Count per site", "العدد لكل موقع"], ["RP17 filtered to the site", "RP17 مفلتراً بالموقع"])}>
        <Bars items={pts(countBy(rp17, "site"), { label: site, tone: () => "warn", drill: (k) => ({ to: rp("RP17", { ...F, site: k }, { state: "Submitted for Review" }) }) })} empty={t("No run waits for review.", "لا جولة بانتظار المراجعة.")} />
      </Insight>
      <Insight id="ev-return" title={["Return reasons", "أسباب الإعادة"]} q={["Why do reviewers send runs back?", "لماذا يعيد المراجعون الجولات؟"]}
        meta={M([RUN], ["One run returned at least once", "جولة أُعيدت مرة على الأقل"], ["Count by the last return_reason", "العدد حسب آخر سبب إعادة"], ["Run register filtered to the reason", "سجل الجولات مفلتراً بالسبب"], ["Runs returned without a recorded reason are shown as —", "الجولات المعادة بلا سبب مسجل تظهر «—»"])}>
        <Bars items={pts(countBy(returned, "return_reason"), { label: (k) => <span data-no-i18n>{k}</span>, tone: () => "warn", drill: (k) => (k === "—" ? LS(RUN, ["return_count", [">", 0]]) : LS(RUN, ["return_reason", k])) })} empty={t("No run has been returned.", "لم تُعد أي جولة.")} />
      </Insight>
    </>,
    kpis: <><C c={c} label={["Runs needing photos", "جولات تحتاج صوراً"]} value={need.length} basis={["Runs with evidence-required Pass / Fail checks", "جولات ببنود نجاح/إخفاق تتطلب دليلاً"]} to="queue/evidence" />
      <C c={c} label={["…without any file", "…بلا أي ملف"]} value={need.filter((x) => !withFile.has(x.run.name)).length} basis={["Of those, runs with no attached File", "منها جولات بلا ملف مرفق"]} to="queue/evidence" tone={need.some((x) => !withFile.has(x.run.name)) ? "bad" : "good"} /><Q k="review" c={c} /><K id="K27" F={F} c={c} /></>,
  };
};

export const published: OvFn = (c) => {
  const { t, ar, F } = c;
  const revs = list("FSM Report Revision").filter((r) => inF(r, F) && inWin(r["published_on"], F));
  const cur = revs.filter((r) => s(r["status"]) === "Current");
  const months = monthAxis(revs.map((r) => r["published_on"]), F);
  const perRun = countBy(revs, "run");
  const rev17 = R("RP17", F).filter((r) => s(r["state"]) === "Reviewed");
  return {
    charts: <>
      <Insight id="pub-result" title={["Current reports by technical result", "التقارير الحالية حسب النتيجة الفنية"]} q={["What do the reports customers can rely on say?", "ماذا تقول التقارير التي يعتمد عليها العملاء؟"]}
        meta={M(["FSM Report Revision"], ["One published revision with status Current (one per run)", "إصدار منشور حالي واحد (واحد لكل جولة)"], ["Count by technical_result", "العدد حسب النتيجة الفنية"], ["Revision register filtered to Current and the result", "سجل الإصدارات مفلتراً بالحالي والنتيجة"])}>
        <Ring items={pts(countBy(cur, "technical_result"), { label: (k) => opt(k, ar), order: ["Pass", "Fail", "Incomplete"], tone: (k) => (k === "Pass" ? "good" : k === "Fail" ? "bad" : "warn"), drill: (k) => LS("FSM Report Revision", ["status", "Current"], ["technical_result", k]) })} total={t("current", "حالي")} empty={t("No report published yet.", "لم يُنشر أي تقرير بعد.")} />
      </Insight>
      <Insight id="pub-month" title={["Revisions published by month", "الإصدارات المنشورة حسب الشهر"]} q={["How steadily are reports issued?", "ما مدى انتظام إصدار التقارير؟"]}
        meta={M(["FSM Report Revision"], ["One published revision (current or superseded)", "إصدار منشور واحد (حالي أو مستبدل)"], ["Count by published_on month", "العدد حسب شهر النشر"], ["Revision register for the month", "سجل الإصدارات للشهر"])}>
        <Cols labels={months} labelText={(m) => monthLabel(m, ar)} series={[{ name: "c", label: opt("Current", ar), values: perMonth(cur, "published_on", months) }, { name: "s", label: opt("Superseded", ar), values: perMonth(revs.filter((r) => s(r["status"]) === "Superseded"), "published_on", months) }]}
          drill={(li, si) => LS("FSM Report Revision", ["status", si === 0 ? "Current" : "Superseded"], ["published_on", ["between", [`${months[li]}-01`, `${monthEnd(months[li]!)} 23:59:59`]]])} empty={t("No report published in scope.", "لا تقارير منشورة ضمن النطاق.")} />
      </Insight>
      <Insight id="pub-reissue" title={["Reports reissued", "التقارير المعاد إصدارها"]} q={["Which runs needed more than one published revision?", "أي الجولات احتاجت أكثر من إصدار منشور؟"]}
        meta={M(["FSM Report Revision"], ["One run; revisions counted per run", "جولة واحدة؛ الإصدارات معدودة لكل جولة"], ["Runs with 2 or more revisions, by revision count", "الجولات ذات إصدارين أو أكثر، حسب العدد"], ["Run 360 (revision history)", "الجولة 360 (سجل الإصدارات)"])}>
        <Bars items={[...perRun].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => ({ key: k, label: <span data-no-i18n>{k}</span>, value: n, tone: "warn" as const, to: `run/${encodeURIComponent(k)}` }))} empty={t("No report has been reissued.", "لم يُعد إصدار أي تقرير.")} />
      </Insight>
      <Insight id="pub-pending" title={["Reviewed, not yet published, by site", "مراجَعة ولم تُنشر، حسب الموقع"]} q={["Which approved results have not reached the customer?", "أي النتائج المعتمدة لم تصل إلى العميل؟"]}
        meta={M([RUN], ["One run in state Reviewed (RP17)", "جولة بحالة مراجَعة (RP17)"], ["Count per site", "العدد لكل موقع"], ["RP17 filtered to Reviewed and the site", "RP17 مفلتراً بالمراجَعة والموقع"])}>
        <Bars items={pts(countBy(rev17, "site"), { label: site, tone: () => "warn", drill: (k) => ({ to: rp("RP17", { ...F, site: k }, { state: "Reviewed" }) }) })} empty={t("Every reviewed run is published.", "كل الجولات المراجَعة منشورة.")} />
      </Insight>
    </>,
    kpis: <><C c={c} label={["Current reports", "التقارير الحالية"]} value={cur.length} basis={["Revisions with status Current", "إصدارات بحالة حالي"]} to="ws/published?tab=documents" /><C c={c} label={["Superseded revisions", "الإصدارات المستبدلة"]} value={revs.length - cur.length} basis={["Revisions replaced by a newer one", "إصدارات استُبدلت بأحدث"]} /><K id="K28" F={F} c={c} /><K id="K27" F={F} c={c} /></>,
  };
};

