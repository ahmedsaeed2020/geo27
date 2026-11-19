/** Deficiencies & safety workspace overviews: Risk command, Findings by site, Findings aging, Retests. */
import { list, titleOf } from "../../domain/data";
import { AGING_BUCKETS, OPEN_DEFICIENCY, addDays, s, today } from "../../domain/rules";
import { numTxt, opt } from "../kit";
import { Bars, Cols, Funnel, Heat, Insight, Ring, Stack, SEV_TONE, countBy, inF, inWin, monthAxis, monthEnd, monthLabel, perMonth, pts, rp, titleL } from "../insights";
import { C, K, LS, M, Q, R, num, per, type OvFn } from "./ctx";

const DEF = "FSM Deficiency";
const SEV = ["Critical", "Major", "Minor"];
const OPEN = [...OPEN_DEFICIENCY];
const site = (k: string) => titleL((k) => titleOf("FSM Service Site", k))(k);
const sevLegend = (ar: boolean) => SEV.map((k) => ({ key: k, label: opt(k, ar), tone: SEV_TONE(k) }));

export const risk: OvFn = (c) => {
  const { t, ar, F } = c;
  const r5 = R("RP05", F); const r7 = R("RP07", F);
  const states = OPEN.filter((x) => r5.some((r) => s(r["state"]) === x));
  const sites = [...new Set(r5.map((r) => s(r["site"])))];
  const impSites = [...new Set(r7.map((r) => s(r["site"])))];
  return {
    charts: <>
      <Insight id="risk-sev" title={["Open findings by severity", "الملاحظات المفتوحة حسب الخطورة"]} q={["How much of the open risk is critical?", "كم من الخطر المفتوح حرج؟"]}
        meta={M([DEF], ["One open finding (RP05; duplicates and rejected excluded)", "ملاحظة مفتوحة واحدة (RP05؛ بدون المكرر والمرفوض)"], ["Count by severity", "العدد حسب الخطورة"], ["RP05 filtered to the severity", "RP05 مفلتراً بالخطورة"])}>
        <Ring items={pts(countBy(r5, "severity"), { label: (k) => opt(k, ar), order: SEV, tone: SEV_TONE, drill: (k) => ({ to: rp("RP05", F, { severity: k }) }) })} total={t("open", "مفتوحة")} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
      </Insight>
      <Insight id="risk-stage" title={["Where open findings are stuck", "أين تتعثر الملاحظات المفتوحة"]} q={["Which stage holds the critical findings?", "أي مرحلة تحتجز الملاحظات الحرجة؟"]}
        meta={M([DEF], ["One open finding; stage × severity", "ملاحظة مفتوحة؛ المرحلة × الخطورة"], ["Count per workflow stage split by severity", "العدد لكل مرحلة مقسماً حسب الخطورة"], ["RP05 filtered to stage and severity", "RP05 مفلتراً بالمرحلة والخطورة"])}>
        <Stack legend={sevLegend(ar)} rows={states.map((st) => ({ key: st, label: opt(st, ar), to: rp("RP05", F, { state: st }), segs: SEV.map((k) => ({ key: k, value: r5.filter((r) => s(r["state"]) === st && s(r["severity"]) === k).length, to: rp("RP05", F, { state: st, severity: k }) })) }))} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
      </Insight>
      <Insight id="risk-heat" title={["Risk map: site × severity", "خريطة الخطر: الموقع × الخطورة"]} q={["Which sites carry the most severe open findings?", "أي المواقع تحمل أخطر الملاحظات المفتوحة؟"]}
        meta={M([DEF, "FSM Service Site"], ["One open finding; site × severity", "ملاحظة مفتوحة؛ الموقع × الخطورة"], ["Count per cell", "العدد لكل خلية"], ["RP05 filtered to site and severity", "RP05 مفلتراً بالموقع والخطورة"])}>
        <Heat rows={sites.map((k) => ({ key: k, label: site(k) }))} cols={SEV.map((k) => ({ key: k, label: opt(k, ar) }))} cell={(r, k) => ({ value: r5.filter((x) => s(x["site"]) === r && s(x["severity"]) === k).length, to: rp("RP05", { ...F, site: r }, { severity: k }) })} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
      </Insight>
      <Insight id="risk-imp" title={["Active impairments and fire watch", "التعطّلات النشطة والحراسة"]} q={["Which impaired systems run without a fire watch?", "أي الأنظمة المعطلة تعمل دون حراسة؟"]}
        meta={M(["FSM Impairment"], ["One active impairment (RP07)", "تعطّل نشط واحد (RP07)"], ["Per site: impairments with fire watch vs without", "لكل موقع: تعطّلات بحراسة مقابل دونها"], ["RP07 filtered to site and fire watch", "RP07 مفلتراً بالموقع والحراسة"], ["An impairment without a fire-watch record counts as without — never assumed covered", "التعطّل بلا سجل حراسة يُحسب دونها ولا يُفترض مغطى"])}>
        <Stack legend={[{ key: "1", label: t("Fire watch in place", "حراسة قائمة"), tone: "good" }, { key: "0", label: t("No fire watch", "بلا حراسة"), tone: "bad" }]}
          rows={impSites.map((k) => ({ key: k, label: site(k), segs: ["1", "0"].map((v) => ({ key: v, value: r7.filter((r) => s(r["site"]) === k && (num(r["fire_watch"]) ? "1" : "0") === v).length, to: rp("RP07", { ...F, site: k }, { fire_watch: v }) })) }))} empty={t("No active impairment.", "لا تعطّلات نشطة.")} />
      </Insight>
    </>,
    kpis: <><K id="K11" F={F} c={c} /><K id="K12" F={F} c={c} /><Q k="critical" c={c} tone="bad" /><Q k="impairments" c={c} tone="bad" /></>,
  };
};

export const bySite: OvFn = (c) => {
  const { t, ar, F } = c;
  const r5 = R("RP05", F); const r6 = R("RP06", F);
  const sites = [...new Set([...r5, ...r6].map((r) => s(r["site"])))];
  const openDocs = list(DEF).filter((d) => OPEN_DEFICIENCY.has(s(d["workflow_state"])) && inF(d, F));
  return {
    charts: <>
      <Insight id="bys-open" title={["Open findings by site", "الملاحظات المفتوحة حسب الموقع"]} q={["Which sites hold the most open findings?", "أي المواقع تحمل أكثر الملاحظات المفتوحة؟"]}
        meta={M([DEF], ["One open finding (RP05)", "ملاحظة مفتوحة واحدة (RP05)"], ["Count per site", "العدد لكل موقع"], ["RP05 filtered to the site", "RP05 مفلتراً بالموقع"])}>
        <Bars share items={pts(countBy(r5, "site"), { label: site, limit: 12, drill: (k) => ({ to: rp("RP05", { ...F, site: k }) }) })} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
      </Insight>
      <Insight id="bys-sev" title={["Severity mix per site", "توزيع الخطورة لكل موقع"]} q={["Is each site's backlog critical or minor?", "هل متأخرات كل موقع حرجة أم بسيطة؟"]}
        meta={M([DEF], ["One open finding; site × severity", "ملاحظة مفتوحة؛ الموقع × الخطورة"], ["Count per site split by severity", "العدد لكل موقع مقسماً حسب الخطورة"], ["RP05 filtered to site and severity", "RP05 مفلتراً بالموقع والخطورة"])}>
        <Stack legend={sevLegend(ar)} rows={sites.map((k) => ({ key: k, label: site(k), to: `site/${encodeURIComponent(k)}`, segs: SEV.map((v) => ({ key: v, value: r5.filter((r) => s(r["site"]) === k && s(r["severity"]) === v).length, to: rp("RP05", { ...F, site: k }, { severity: v }) })) }))} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
      </Insight>
      <Insight id="bys-system" title={["Open findings by system", "الملاحظات المفتوحة حسب النظام"]} q={["Which installed systems generate the findings?", "أي الأنظمة المركبة تولّد الملاحظات؟"]}
        meta={M([DEF, "FSM Service System"], ["One open finding → its system", "ملاحظة مفتوحة ← نظامها"], ["Count per system", "العدد لكل نظام"], ["Finding register filtered to the system and open stages", "سجل الملاحظات مفلتراً بالنظام والمراحل المفتوحة"])}>
        <Ring items={pts(countBy(openDocs, "system"), { label: titleL((k) => titleOf("FSM Service System", k)), limit: 10, drill: (k) => LS(DEF, ["system", k], ["workflow_state", ["in", OPEN]]) })} total={t("open", "مفتوحة")} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
      </Insight>
      <Insight id="bys-flow" title={["Opened vs closed by site", "المفتوحة مقابل المغلقة حسب الموقع"]} q={["Is each site closing findings as fast as they open?", "هل يغلق كل موقع الملاحظات بسرعة فتحها؟"]}
        meta={M([DEF], ["One finding opened in the period (RP06)", "ملاحظة فُتحت في الفترة (RP06)"], ["Per site: verified closed vs still open / other", "لكل موقع: مغلقة موثقة مقابل مفتوحة / أخرى"], ["RP06 filtered to site and state", "RP06 مفلتراً بالموقع والحالة"])}>
        <Stack legend={[{ key: "closed", label: opt("Verified Closed", ar), tone: "good" }, { key: "open", label: t("Not closed", "غير مغلقة"), tone: "warn" }]}
          rows={sites.map((k) => ({ key: k, label: site(k), segs: [{ key: "closed", value: r6.filter((r) => s(r["site"]) === k && s(r["state"]) === "Verified Closed").length, to: rp("RP06", { ...F, site: k }, { state: "Verified Closed" }) }, { key: "open", value: r6.filter((r) => s(r["site"]) === k && s(r["state"]) !== "Verified Closed").length, to: rp("RP06", { ...F, site: k }) }] }))} empty={t("No finding opened in the period.", "لم تُفتح ملاحظات في الفترة.")} />
      </Insight>
    </>,
    kpis: <><K id="K11" F={F} c={c} /><K id="K12" F={F} c={c} /><Q k="corrective" c={c} /><C c={c} label={["Sites with a critical finding", "مواقع بها ملاحظة حرجة"]} value={new Set(r5.filter((r) => s(r["severity"]) === "Critical").map((r) => s(r["site"]))).size} basis={["Distinct sites in RP05 with severity Critical", "مواقع مميزة في RP05 بخطورة حرجة"]} to={rp("RP05", F, { severity: "Critical" })} tone="bad" /></>,
  };
};

export const aging: OvFn = (c) => {
  const { t, ar, F } = c;
  const r5 = R("RP05", F);
  const openDocs = list(DEF).filter((d) => OPEN_DEFICIENCY.has(s(d["workflow_state"])) && inF(d, F) && inWin(d["opened_on"], F));
  const months = monthAxis(openDocs.map((d) => d["opened_on"]), F);
  return {
    charts: <>
      <Insight id="age-bucket" title={["Open findings by age", "الملاحظات المفتوحة حسب العمر"]} q={["How long have findings stayed open?", "منذ متى بقيت الملاحظات مفتوحة؟"]}
        meta={M([DEF], ["One open finding (RP05)", "ملاحظة مفتوحة واحدة (RP05)"], ["age = as-of − opened_on, bucketed 0–7 / 8–30 / 31–90 / >90 days", "العمر = التاريخ − تاريخ الفتح، في فئات 0–7 / 8–30 / 31–90 / >90 يوماً"], ["RP05 filtered to the bucket", "RP05 مفلتراً بالفئة"])}>
        <Bars items={pts(countBy(r5, "bucket"), { order: AGING_BUCKETS, label: (k) => <span>{k} {t("days", "يوم")}</span>, tone: (k) => (k === ">90" ? "bad" : k === "31–90" ? "warn" : undefined), drill: (k) => ({ to: rp("RP05", F, { bucket: k }) }) })} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
      </Insight>
      <Insight id="age-heat" title={["Age × severity", "العمر × الخطورة"]} q={["Are critical findings ageing?", "هل تتقادم الملاحظات الحرجة؟"]}
        meta={M([DEF], ["One open finding; age bucket × severity", "ملاحظة مفتوحة؛ فئة العمر × الخطورة"], ["Count per cell", "العدد لكل خلية"], ["RP05 filtered to bucket and severity", "RP05 مفلتراً بالفئة والخطورة"])}>
        <Heat rows={SEV.map((k) => ({ key: k, label: opt(k, ar) }))} cols={AGING_BUCKETS.map((k) => ({ key: k, label: <span data-no-i18n>{k}</span> }))} cell={(sv, b) => ({ value: r5.filter((r) => s(r["severity"]) === sv && s(r["bucket"]) === b).length, to: rp("RP05", F, { severity: sv, bucket: b }) })} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
      </Insight>
      <Insight id="age-month" title={["Still-open findings by month opened", "الملاحظات المفتوحة حسب شهر الفتح"]} q={["When were today's open findings raised?", "متى أُثيرت الملاحظات المفتوحة اليوم؟"]}
        meta={M([DEF], ["One finding in an open stage", "ملاحظة في مرحلة مفتوحة"], ["Count by opened_on month", "العدد حسب شهر الفتح"], ["Finding register: open stages, that month", "سجل الملاحظات: المراحل المفتوحة لذلك الشهر"])}>
        <Cols labels={months} labelText={(m) => monthLabel(m, ar)} series={[{ name: "n", label: t("Still open", "ما زالت مفتوحة"), values: perMonth(openDocs, "opened_on", months) }]} drill={(li) => LS(DEF, ["workflow_state", ["in", OPEN]], ["opened_on", ["between", [`${months[li]}-01`, monthEnd(months[li]!)]]])} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
      </Insight>
      <Insight id="age-decision" title={["Commercial decision on open findings", "القرار التجاري على الملاحظات المفتوحة"]} q={["Are old findings waiting on the customer or on us?", "هل الملاحظات القديمة بانتظار العميل أم بانتظارنا؟"]}
        meta={M([DEF, "Quotation"], ["One open finding (RP05)", "ملاحظة مفتوحة واحدة (RP05)"], ["Count by commercial decision", "العدد حسب القرار التجاري"], ["RP05 filtered to the decision", "RP05 مفلتراً بالقرار"])}>
        <Ring items={pts(countBy(r5, "decision"), { label: (k) => opt(k, ar), order: ["None", "Quoted", "Accepted", "Declined"], tone: (k) => (k === "Declined" ? "bad" : k === "Accepted" ? "good" : undefined), drill: (k) => ({ to: rp("RP05", F, { decision: k }) }) })} total={t("open", "مفتوحة")} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
      </Insight>
    </>,
    kpis: <><K id="K12" F={F} c={c} /><C c={c} label={["Open > 90 days", "مفتوحة أكثر من 90 يوماً"]} value={r5.filter((r) => s(r["bucket"]) === ">90").length} basis={["RP05 rows in the >90 bucket", "صفوف RP05 في فئة >90"]} to={rp("RP05", F, { bucket: ">90" })} tone="bad" /><Q k="critical" c={c} tone="bad" /><Q k="disputes" c={c} /></>,
  };
};

export const retests: OvFn = (c) => {
  const { t, ar, F } = c;
  const defs = list(DEF).filter((d) => inF(d, F) && inWin(d["opened_on"], F) && !["Rejected", "Duplicate"].includes(s(d["workflow_state"])));
  const p = per(F, "opened_on");
  const rts = list("FSM Retest").filter((r) => inF(r, F));
  const open = rts.filter((r) => ["Required", "Scheduled"].includes(s(r["status"])));
  const now = today(); const wk = addDays(now, 7);
  const due = (r: Record<string, unknown>) => { const d = s(r["due_date"]); return !d ? "none" : d < now ? "over" : d <= wk ? "week" : "later"; };
  const r6 = R("RP06", F).filter((r) => s(r["state"]) === "Verified Closed");
  const dBucket = (d: number) => (d <= 7 ? "0–7" : d <= 30 ? "8–30" : d <= 90 ? "31–90" : ">90");
  return {
    charts: <>
      <Insight id="rt-funnel" title={["Finding → repair → retest → closure", "الملاحظة ← الإصلاح ← إعادة الفحص ← الإغلاق"]} q={["Where do findings drop out before a verified closure?", "أين تتوقف الملاحظات قبل الإغلاق الموثق؟"]}
        meta={M([DEF, "Quotation", "FSM Job", "FSM Retest"], ["One finding opened in the period (rejected / duplicates excluded)", "ملاحظة فُتحت في الفترة (بدون المرفوض/المكرر)"], ["Findings → quoted → accepted → repair job → retest passed / closed", "الملاحظات ← مسعّرة ← مقبولة ← أمر إصلاح ← مغلقة موثقة"], ["Finding register filtered to the step", "سجل الملاحظات مفلتراً بالخطوة"], ["A finding closes only after a passed retest; quoting alone never closes it", "لا تُغلق الملاحظة إلا بعد إعادة فحص ناجحة؛ التسعير وحده لا يغلقها"])}>
        <Funnel steps={[
          { key: "all", label: t("Findings", "الملاحظات"), value: defs.length, ...LS(DEF, ["workflow_state", ["not in", ["Rejected", "Duplicate"]]], ...p) },
          { key: "q", label: t("Quoted", "مسعّرة"), value: defs.filter((d) => s(d["quotation"])).length, ...LS(DEF, ["quotation", ["is", "set"]], ["workflow_state", ["not in", ["Rejected", "Duplicate"]]], ...p) },
          { key: "a", label: opt("Accepted", ar), value: defs.filter((d) => s(d["commercial_decision"]) === "Accepted").length, ...LS(DEF, ["commercial_decision", "Accepted"], ["workflow_state", ["not in", ["Rejected", "Duplicate"]]], ...p) },
          { key: "j", label: t("Repair job", "أمر إصلاح"), value: defs.filter((d) => s(d["repair_job"])).length, ...LS(DEF, ["repair_job", ["is", "set"]], ["workflow_state", ["not in", ["Rejected", "Duplicate"]]], ...p) },
          { key: "c", label: opt("Verified Closed", ar), tone: "good", value: defs.filter((d) => s(d["workflow_state"]) === "Verified Closed").length, ...LS(DEF, ["workflow_state", "Verified Closed"], ...p) },
        ]} empty={t("No finding opened in scope.", "لم تُفتح ملاحظات ضمن النطاق.")} />
      </Insight>
      <Insight id="rt-status" title={["Retests by status", "إعادات الفحص حسب الحالة"]} q={["How many retests are pending, passed or failed?", "كم إعادة فحص معلقة أو ناجحة أو فاشلة؟"]}
        meta={M(["FSM Retest"], ["One retest record", "سجل إعادة فحص واحد"], ["Count by status", "العدد حسب الحالة"], ["Retest register filtered to the status", "سجل إعادات الفحص مفلتراً بالحالة"])}>
        <Ring items={pts(countBy(rts, "status"), { label: (k) => opt(k, ar), order: ["Required", "Scheduled", "Passed", "Failed"], tone: (k) => (k === "Passed" ? "good" : k === "Failed" ? "bad" : k === "Required" ? "warn" : undefined), drill: (k) => LS("FSM Retest", ["status", k]) })} total={t("retests", "إعادة")} empty={t("No retest recorded.", "لا إعادات فحص مسجلة.")} />
      </Insight>
      <Insight id="rt-due" title={["Pending retests by due date", "إعادات الفحص المعلقة حسب الاستحقاق"]} q={["Which retests are overdue?", "أي إعادات الفحص متأخرة؟"]}
        meta={M(["FSM Retest"], ["One Required / Scheduled retest", "إعادة فحص مطلوبة أو مجدولة"], ["Overdue (due before today), due within 7 days, later, no due date", "متأخرة (قبل اليوم)، خلال 7 أيام، لاحقاً، بلا تاريخ"], ["Retest register filtered to the due window", "سجل إعادات الفحص مفلتراً بنافذة الاستحقاق"])}>
        <Bars items={pts(countBy(open, due), { order: ["over", "week", "later", "none"], label: (k) => ({ over: t("Overdue", "متأخرة"), week: t("Due within 7 days", "خلال 7 أيام"), later: t("Later", "لاحقاً"), none: t("No due date", "بلا تاريخ") } as Record<string, string>)[k], tone: (k) => (k === "over" ? "bad" : k === "week" ? "warn" : undefined),
          drill: (k) => LS("FSM Retest", ["status", ["in", ["Required", "Scheduled"]]], ...(k === "over" ? [["due_date", ["<", now]] as [string, unknown]] : k === "week" ? [["due_date", ["between", [now, wk]]] as [string, unknown]] : k === "later" ? [["due_date", [">", wk]] as [string, unknown]] : [["due_date", ["is", "not set"]] as [string, unknown]])) })} empty={t("No pending retest.", "لا إعادات فحص معلقة.")} />
      </Insight>
      <Insight id="rt-close" title={["Days to verified closure", "الأيام حتى الإغلاق الموثق"]} q={["How long does a finding take from opening to verified closure?", "كم تستغرق الملاحظة من الفتح حتى الإغلاق الموثق؟"]}
        meta={M([DEF, "FSM Retest"], ["One verified-closed finding opened in the period (RP06)", "ملاحظة مغلقة موثقة فُتحت في الفترة (RP06)"], ["days_to_close = closed_on − opened_on, bucketed", "أيام الإغلاق = تاريخ الإغلاق − تاريخ الفتح، في فئات"], ["RP06 filtered to Verified Closed", "RP06 مفلتراً بالمغلقة الموثقة"])}>
        <Bars fmt={(v) => numTxt(v)} items={pts(countBy(r6, (r) => dBucket(num(r["days_to_close"]))), { order: AGING_BUCKETS, label: (k) => <span>{k} {t("days", "يوم")}</span>, tone: (k) => (k === ">90" ? "bad" : k === "31–90" ? "warn" : "good"), drill: () => ({ to: rp("RP06", F, { state: "Verified Closed" }) }) })} empty={t("No finding was closed in scope.", "لم تُغلق ملاحظات ضمن النطاق.")} />
      </Insight>
    </>,
    kpis: <><K id="K13" F={F} c={c} /><K id="K14" F={F} c={c} /><K id="K15" F={F} c={c} /><K id="K16" F={F} c={c} /></>,
  };
};
