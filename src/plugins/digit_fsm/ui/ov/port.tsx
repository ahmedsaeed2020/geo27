import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/** Customers, sites & assets workspace overview: Service history. */
import { list, titleOf } from "../../domain/data";
import { s } from "../../domain/rules";
import { opt } from "../kit";
import { Bars, Cols, Insight, Ring, countBy, inF, inWin, monthAxis, monthEnd, monthLabel, perMonth, pts, rp, titleL } from "../insights";
import { C, K, LS, M, R, per, type OvFn } from "./ctx";

const site = (k: string) => titleL((k) => titleOf("FSM Service Site", k))(k);

export const serviceHistory: OvFn = (c) => {
  const { t, ar, F } = c;
  const r16 = R("RP16", F);
  const months = monthAxis(r16.map((r) => r["date"]), F);
  const visits = list(VISIT_DT).filter((v) => s(v["workflow_state"]) === "Completed" && inF(v, F) && inWin(v["completed_on"], F));
  const cur = list("FSM Report Revision").filter((r) => s(r["status"]) === "Current" && inF(r, F) && inWin(r["published_on"], F));
  const r2 = R("RP02", F);
  return {
    charts: <>
      <Insight id="hist-month" title={["Service events by month", "أحداث الخدمة حسب الشهر"]} q={["What was done, and when?", "ما الذي نُفذ، ومتى؟"]}
        meta={M(["FSM Job", VISIT_DT, "FSM Inspection Run", "FSM Deficiency", "FSM Report Revision"], ["One dated service event (RP16)", "حدث خدمة مؤرخ (RP16)"], ["Count of events per month", "عدد الأحداث لكل شهر"], ["RP16 for the month", "RP16 للشهر"])}>
        <Cols labels={months} labelText={(m) => monthLabel(m, ar)} series={[{ name: "n", label: t("Events", "الأحداث"), values: perMonth(r16, "date", months) }]} drill={(li) => ({ to: rp("RP16", { ...F, from: `${months[li]}-01`, to: monthEnd(months[li]!) }) })} empty={t("No service event in scope.", "لا أحداث خدمة ضمن النطاق.")} />
      </Insight>
      <Insight id="hist-event" title={["Events by type", "الأحداث حسب النوع"]} q={["What kind of work dominates the history?", "أي نوع من العمل يغلب على السجل؟"]}
        meta={M(["FSM Job", VISIT_DT, "FSM Inspection Run", "FSM Deficiency", "FSM Report Revision"], ["One service event (RP16)", "حدث خدمة (RP16)"], ["Count by event type", "العدد حسب نوع الحدث"], ["RP16 filtered to the event", "RP16 مفلتراً بالحدث"])}>
        <Bars share items={pts(countBy(r16, "event"), { label: (k) => opt(k, ar), drill: (k) => ({ to: rp("RP16", F, { event: k }) }) })} empty={t("No service event in scope.", "لا أحداث خدمة ضمن النطاق.")} />
      </Insight>
      <Insight id="hist-visits" title={["Completed visits by site", "الزيارات المكتملة حسب الموقع"]} q={["Which sites received the most field work?", "أي المواقع تلقت أكثر عمل ميداني؟"]}
        meta={M([VISIT_DT], ["One completed visit", "زيارة مكتملة"], ["Count per site (completed_on in the period)", "العدد لكل موقع (تاريخ الإكمال في الفترة)"], ["Visit register filtered to the site and Completed", "سجل الزيارات مفلتراً بالموقع والمكتملة"])}>
        <Bars items={pts(countBy(visits, "site"), { label: site, limit: 10, drill: (k) => LS(VISIT_DT, ["site", k], ["workflow_state", "Completed"], ...per(F, "completed_on")) })} empty={t("No completed visit in scope.", "لا زيارات مكتملة ضمن النطاق.")} />
      </Insight>
      <Insight id="hist-evidence" title={["Published evidence by result", "الأدلة المنشورة حسب النتيجة"]} q={["What do the published reports say?", "ماذا تقول التقارير المنشورة؟"]}
        meta={M(["FSM Report Revision"], ["One current published revision", "إصدار منشور حالي"], ["Count by technical result", "العدد حسب النتيجة الفنية"], ["Revision register filtered to Current and the result", "سجل الإصدارات مفلتراً بالحالي والنتيجة"])}>
        <Ring items={pts(countBy(cur, "technical_result"), { label: (k) => opt(k, ar), order: ["Pass", "Fail", "Incomplete"], tone: (k) => (k === "Pass" ? "good" : k === "Fail" ? "bad" : "warn"), drill: (k) => LS("FSM Report Revision", ["status", "Current"], ["technical_result", k], ...per(F, "published_on")) })} total={t("reports", "تقرير")} empty={t("No report published in scope.", "لا تقارير منشورة ضمن النطاق.")} />
      </Insight>
    </>,
    kpis: <><C c={c} label={["Service events", "أحداث الخدمة"]} value={r16.length} basis={["RP16 rows in scope", "صفوف RP16 ضمن النطاق"]} to={rp("RP16", F)} /><C c={c} label={["Completed visits", "الزيارات المكتملة"]} value={visits.length} basis={["Visits completed in the period", "زيارات أُكملت في الفترة"]} to="visits?state=Completed" tone="good" />
      <C c={c} label={["Current reports", "التقارير الحالية"]} value={cur.length} basis={["Published revisions with status Current", "إصدارات منشورة بحالة حالي"]} to="ws/published" /><C c={c} label={["Check results", "نتائج البنود"]} value={r2.length} basis={["RP02 rows in scope", "صفوف RP02 ضمن النطاق"]} to={rp("RP02", F)} /><K id="K08" F={F} c={c} /></>,
  };
};
