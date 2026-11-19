import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/** Analytics & reports workspace overviews: Service manager board, Technicians, Quality & compliance, Contracts & profitability. */
import { titleOf } from "../../domain/data";
import { AGING_BUCKETS, s } from "../../domain/rules";
import { money, numTxt, opt } from "../kit";
import { Bars, Cols, Insight, Ring, Stack, SEV_TONE, Unavailable, countBy, monthAxis, monthEnd, monthLabel, perMonth, pts, rp, sumBy, titleL } from "../insights";
import { C, K, M, R, num, sum, type OvFn } from "./ctx";

const tech = (k: string) => titleL((k) => titleOf("FSM Technician", k))(k);
const hrs = (v: number) => numTxt(v, 1);

export const rptManager: OvFn = (c) => {
  const { t, ar, F } = c;
  const r9 = R("RP09", F); const r16 = R("RP16", F); const r11 = R("RP11", F); const r8 = R("RP08", F);
  const months = monthAxis(r16.map((r) => r["date"]), F);
  const evs = [...countBy(r16, "event")].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  return {
    queues: false,
    charts: <>
      <Insight id="mgr-overdue" title={["Overdue work by type", "العمل المتأخر حسب النوع"]} q={["Is the backlog visits or contract obligations?", "هل المتأخرات زيارات أم التزامات عقود؟"]}
        meta={M([VISIT_DT, "FSM Obligation"], ["Two separate datasets (RP09): late visits and past-window obligations — never merged into one rate", "مجموعتان منفصلتان (RP09): زيارات متأخرة والتزامات متجاوزة — لا تُدمجان في معدل واحد"], ["Count per dataset", "العدد لكل مجموعة"], ["RP09 filtered to the dataset", "RP09 مفلتراً بالمجموعة"])}>
        <Bars items={pts(countBy(r9, "dataset"), { label: (k) => (k === "Visit" ? t("Late visits", "زيارات متأخرة") : k === "Obligation" ? t("Past-window obligations", "التزامات متجاوزة") : k), tone: () => "bad", drill: (k) => ({ to: rp("RP09", F, { dataset: k }) }) })} empty={t("Nothing is overdue.", "لا شيء متأخر.")} />
      </Insight>
      <Insight id="mgr-events" title={["Service activity by month", "نشاط الخدمة حسب الشهر"]} q={["Is delivery activity steady?", "هل نشاط التنفيذ منتظم؟"]}
        meta={M(["FSM Job", VISIT_DT, "FSM Inspection Run", "FSM Deficiency", "FSM Report Revision"], ["One dated service event (RP16)", "حدث خدمة مؤرخ (RP16)"], ["Count per month for the three most frequent event types", "العدد لكل شهر لأكثر ثلاثة أنواع أحداث"], ["RP16 for the month and event", "RP16 للشهر والحدث"])}>
        <Cols labels={months} labelText={(m) => monthLabel(m, ar)} series={evs.map((e) => ({ name: e, label: opt(e, ar), values: perMonth(r16.filter((r) => s(r["event"]) === e), "date", months) }))} drill={(li, si) => ({ to: rp("RP16", { ...F, from: `${months[li]}-01`, to: monthEnd(months[li]!) }, { event: evs[si] }) })} empty={t("No service event in scope.", "لا أحداث خدمة ضمن النطاق.")} />
      </Insight>
      <Insight id="mgr-sla" title={["Response SLA", "مستوى خدمة الاستجابة"]} q={["Are requests answered on time?", "هل يُرد على الطلبات في الموعد؟"]}
        meta={M(["Issue"], ["One service request (RP11)", "طلب خدمة واحد (RP11)"], ["Breached vs not breached first response", "استجابة أولى مخالفة مقابل غير مخالفة"], ["RP11 filtered to breach", "RP11 مفلتراً بالإخلال"], ["Resolution SLA (K22) needs the server SLA engine", "مستوى خدمة الحل (K22) يتطلب محرك الخادم"])}>
        <Ring items={[{ key: "1", label: t("Breached", "مخالف"), tone: "bad" as const, value: r11.filter((r) => num(r["response_breach"]) === 1).length, to: rp("RP11", F, { response_breach: "1" }) }, { key: "0", label: t("Not breached", "غير مخالف"), tone: "good" as const, value: r11.filter((r) => num(r["response_breach"]) !== 1).length, to: rp("RP11", F, { response_breach: "0" }) }]} total={t("requests", "طلب")} empty={t("No service requests in scope.", "لا طلبات خدمة ضمن النطاق.")} />
      </Insight>
      <Insight id="mgr-obl" title={["Obligation delivery", "تنفيذ الالتزامات"]} q={["Is contracted work delivered?", "هل يُنفذ العمل المتعاقد عليه؟"]}
        meta={M(["FSM Obligation"], ["One obligation in the period (RP08)", "التزام في الفترة (RP08)"], ["Count by status", "العدد حسب الحالة"], ["RP08 filtered to the status", "RP08 مفلتراً بالحالة"])}>
        <Ring items={pts(countBy(r8, "status"), { label: (k) => opt(k, ar), order: ["Fulfilled", "Scheduled", "Due", "Missed", "Waived"], tone: (k) => (k === "Missed" ? "bad" : k === "Fulfilled" ? "good" : undefined), drill: (k) => ({ to: rp("RP08", F, { status: k }) }) })} total={t("obligations", "التزام")} empty={t("No obligations in scope.", "لا التزامات ضمن النطاق.")} />
      </Insight>
    </>,
    kpis: <><K id="K03" F={F} c={c} /><K id="K21" F={F} c={c} /><K id="K01" F={F} c={c} /><K id="K04" F={F} c={c} /></>,
  };
};

export const rptTech: OvFn = (c) => {
  const { t, F } = c;
  const r10 = R("RP10", F);
  const row = (r: Record<string, unknown>, v: number, tone?: "good" | "warn" | "bad") => ({ key: s(r["technician"]), label: tech(s(r["technician"])), value: v, tone, to: rp("RP10", { ...F, technician: s(r["technician"]) }) });
  return {
    queues: false, scope: ["company", "from", "to"],
    charts: <>
      <Insight id="tec-util" title={["Booked utilisation", "نسبة الحجز"]} q={["How much of each technician's available time is booked?", "كم من الوقت المتاح لكل فني محجوز؟"]}
        meta={M(["FSM Technician", "FSM Booking", "FSM Calendar Exception"], ["One technician (RP10)", "فني واحد (RP10)"], ["booked_pct = booked hours ÷ available hours (daily hours × working days − approved unavailability)", "نسبة الحجز = المحجوز ÷ المتاح (الساعات اليومية × أيام العمل − عدم التوفر المعتمد)"], ["RP10 filtered to the technician", "RP10 مفلتراً بالفني"])}>
        <Bars fmt={(v) => `${numTxt(v)}%`} items={r10.map((r) => row(r, Math.round(num(r["booked_pct"])), num(r["booked_pct"]) > 100 ? "bad" : num(r["booked_pct"]) < 40 ? "warn" : "good"))} empty={t("No technician in scope.", "لا فنيون ضمن النطاق.")} />
      </Insight>
      <Insight id="tec-visits" title={["Completed visits", "الزيارات المكتملة"]} q={["Who completed the most visits?", "من أكمل أكثر الزيارات؟"]}
        meta={M([VISIT_DT, "FSM Booking"], ["One technician (RP10); lead booking → visit", "فني واحد (RP10)؛ حجز القائد ← الزيارة"], ["Count of completed visits led", "عدد الزيارات المكتملة التي قادها"], ["RP10 filtered to the technician", "RP10 مفلتراً بالفني"])}>
        <Bars items={r10.slice().sort((a, b) => num(b["visits_completed"]) - num(a["visits_completed"])).map((r) => row(r, num(r["visits_completed"])))} empty={t("No technician in scope.", "لا فنيون ضمن النطاق.")} />
      </Insight>
      <Insight id="tec-returns" title={["Unplanned return visits", "زيارات العودة غير المخططة"]} q={["Whose work needs a second trip?", "عمل من يحتاج زيارة ثانية؟"]}
        meta={M([VISIT_DT], ["One technician (RP10)", "فني واحد (RP10)"], ["Return visits for parts, access, rework or customer request (planned continuations excluded)", "زيارات العودة للمواد أو الوصول أو إعادة العمل أو طلب العميل (بدون الاستمرار المخطط)"], ["RP10 filtered to the technician", "RP10 مفلتراً بالفني"])}>
        <Bars items={r10.filter((r) => num(r["return_visits"]) > 0).map((r) => row(r, num(r["return_visits"]), "warn"))} empty={t("No unplanned return visit.", "لا زيارات عودة غير مخططة.")} />
      </Insight>
      <Insight id="tec-hours" title={["Available vs booked hours", "الساعات المتاحة مقابل المحجوزة"]} q={["Where is spare capacity?", "أين توجد الطاقة الفائضة؟"]}
        meta={M(["FSM Technician", "FSM Booking"], ["One technician (RP10)", "فني واحد (RP10)"], ["Booked hours and remaining available hours (available − booked, never below 0)", "الساعات المحجوزة والمتبقية (المتاح − المحجوز، لا تقل عن 0)"], ["RP10 filtered to the technician", "RP10 مفلتراً بالفني"])}>
        <Stack fmt={hrs} legend={[{ key: "b", label: t("Booked", "محجوز"), tone: "info" }, { key: "f", label: t("Free", "متاح"), tone: "neutral" }]} rows={r10.map((r) => ({ key: s(r["technician"]), label: tech(s(r["technician"])), segs: [{ key: "b", value: num(r["booked_h"]), to: rp("RP10", { ...F, technician: s(r["technician"]) }) }, { key: "f", value: Math.max(0, num(r["available_h"]) - num(r["booked_h"])), to: rp("RP10", { ...F, technician: s(r["technician"]) }) }] }))} empty={t("No technician in scope.", "لا فنيون ضمن النطاق.")} />
      </Insight>
    </>,
    kpis: <><K id="K17" F={F} c={c} /><K id="K18" F={F} c={c} /><K id="K20" F={F} c={c} /><C c={c} label={["Technicians", "الفنيون"]} value={r10.length} basis={["Technicians in RP10 for the scope", "الفنيون في RP10 ضمن النطاق"]} to={rp("RP10", F)} /></>,
  };
};

export const rptQuality: OvFn = (c) => {
  const { t, ar, F } = c;
  const r3 = R("RP03", F); const r4 = R("RP04", F); const r5 = R("RP05", F); const r17 = R("RP17", F);
  return {
    queues: false,
    charts: <>
      <Insight id="qua-cov" title={["Inspection completeness", "اكتمال الفحص"]} q={["Are inspections covering every expected device?", "هل تغطي الفحوص كل الأجهزة المتوقعة؟"]}
        meta={M(["FSM Inspection Run", "FSM Inspection Result"], ["Device totals over runs (RP03)", "مجاميع الأجهزة عبر الجولات (RP03)"], ["Expected = inspected + untested; failed and inaccessible shown separately", "المتوقع = المفحوص + غير المختبر؛ الفاشل وغير الممكن الوصول منفصلان"], ["RP03 / RP04 filtered to the outcome", "RP03 / RP04 مفلتراً بالنتيجة"])}>
        <Bars items={[
          { key: "insp", label: t("Inspected devices", "أجهزة مفحوصة"), value: sum(r3, "inspected"), tone: "good" as const, to: rp("RP03", F) },
          { key: "fail", label: t("Failed devices", "أجهزة فاشلة"), value: sum(r3, "failed"), tone: "bad" as const, to: rp("RP04", F, { outcome: "Fail" }) },
          { key: "inac", label: t("Inaccessible", "تعذّر الوصول"), value: sum(r3, "inaccessible"), tone: "warn" as const, to: rp("RP04", F, { outcome: "Inaccessible" }) },
          { key: "unt", label: t("Untested", "غير مختبر"), value: sum(r3, "untested"), tone: "neutral" as const, to: rp("RP04", F, { outcome: "Untested" }) },
        ]} empty={t("No inspection run in scope.", "لا جولات فحص ضمن النطاق.")} />
      </Insight>
      <Insight id="qua-exc" title={["Exceptions by outcome", "الاستثناءات حسب النتيجة"]} q={["What kind of exception dominates?", "أي نوع من الاستثناءات يغلب؟"]}
        meta={M(["FSM Inspection Result"], ["One exception result row (RP04)", "صف نتيجة استثنائية (RP04)"], ["Count by outcome", "العدد حسب النتيجة"], ["RP04 filtered to the outcome", "RP04 مفلتراً بالنتيجة"])}>
        <Ring items={pts(countBy(r4, "outcome"), { label: (k) => opt(k, ar), order: ["Fail", "Inaccessible", "Untested"], tone: (k) => (k === "Fail" ? "bad" : k === "Inaccessible" ? "warn" : "neutral"), drill: (k) => ({ to: rp("RP04", F, { outcome: k }) }) })} total={t("exceptions", "استثناء")} empty={t("No exception result.", "لا نتائج استثنائية.")} />
      </Insight>
      <Insight id="qua-sev" title={["Open findings by severity and age", "الملاحظات المفتوحة حسب الخطورة والعمر"]} q={["Are serious findings closed quickly?", "هل تُغلق الملاحظات الخطيرة بسرعة؟"]}
        meta={M(["FSM Deficiency"], ["One open finding (RP05)", "ملاحظة مفتوحة (RP05)"], ["Count per severity split by age bucket", "العدد لكل خطورة مقسماً حسب فئة العمر"], ["RP05 filtered to severity and bucket", "RP05 مفلتراً بالخطورة والفئة"])}>
        <Stack legend={AGING_BUCKETS.map((k, i) => ({ key: k, label: <span data-no-i18n>{k}</span>, tone: i === 3 ? "bad" as const : i === 2 ? "warn" as const : undefined }))} rows={["Critical", "Major", "Minor"].map((sv) => ({ key: sv, label: opt(sv, ar), to: rp("RP05", F, { severity: sv }), segs: AGING_BUCKETS.map((b) => ({ key: b, value: r5.filter((r) => s(r["severity"]) === sv && s(r["bucket"]) === b).length, to: rp("RP05", F, { severity: sv, bucket: b }) })) }))} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} />
      </Insight>
      <Insight id="qua-backlog" title={["Review and publication backlog", "متأخرات المراجعة والنشر"]} q={["Is technical approval keeping up?", "هل يواكب الاعتماد الفني العمل؟"]}
        meta={M(["FSM Inspection Run"], ["One run waiting for review or publication (RP17)", "جولة بانتظار المراجعة أو النشر (RP17)"], ["Count by state", "العدد حسب الحالة"], ["RP17 filtered to the state", "RP17 مفلتراً بالحالة"])}>
        <Bars items={pts(countBy(r17, "state"), { label: (k) => opt(k, ar), tone: () => "warn", drill: (k) => ({ to: rp("RP17", F, { state: k }) }) })} empty={t("No backlog.", "لا متأخرات.")} />
      </Insight>
    </>,
    kpis: <><K id="K07" F={F} c={c} /><K id="K11" F={F} c={c} /><K id="K16" F={F} c={c} /><K id="K27" F={F} c={c} /></>,
  };
};

export const rptContracts: OvFn = (c) => {
  const { t, ar, F } = c;
  const r8 = R("RP08", F); const r12 = R("RP12", F).filter((r) => s(r["state"]) === "Active"); const r19 = R("RP19", F);
  const expBucket = (d: number) => (d <= 30 ? "≤30" : d <= 90 ? "31–90" : d <= 180 ? "91–180" : ">180");
  return {
    queues: false,
    charts: <>
      <Insight id="ctr-obl" title={["Obligation delivery", "تنفيذ الالتزامات"]} q={["Are agreements delivered?", "هل تُنفذ الاتفاقيات؟"]}
        meta={M(["FSM Obligation"], ["One obligation in the period (RP08)", "التزام في الفترة (RP08)"], ["Count by status", "العدد حسب الحالة"], ["RP08 filtered to the status", "RP08 مفلتراً بالحالة"])}>
        <Ring items={pts(countBy(r8, "status"), { label: (k) => opt(k, ar), order: ["Fulfilled", "Scheduled", "Due", "Missed", "Waived"], tone: (k) => (k === "Missed" ? "bad" : k === "Fulfilled" ? "good" : undefined), drill: (k) => ({ to: rp("RP08", F, { status: k }) }) })} total={t("obligations", "التزام")} empty={t("No obligations in scope.", "لا التزامات ضمن النطاق.")} />
      </Insight>
      <Insight id="ctr-exp" title={["Contracted value by time to expiry", "القيمة المتعاقدة حسب الوقت حتى الانتهاء"]} q={["How much value comes up for renewal, and when?", "كم قيمة تقترب من التجديد، ومتى؟"]}
        meta={M(["FSM Service Agreement"], ["One active agreement (RP12)", "اتفاقية نشطة (RP12)"], ["Sum of annual value by days-to-expiry bucket", "مجموع القيمة السنوية حسب فئة الأيام حتى الانتهاء"], ["Renewals workspace", "مساحة التجديدات"])}>
        <Bars fmt={(v) => money(v)} items={pts(sumBy(r12, (r) => expBucket(num(r["days_to_expiry"])), (r) => num(r["annual_value"])), { order: ["≤30", "31–90", "91–180", ">180"], label: (k) => <span>{k} {t("days", "يوم")}</span>, tone: (k) => (k === "≤30" ? "bad" : k === "31–90" ? "warn" : undefined), drill: () => ({ to: "ws/renewals" }) })} empty={t("No active agreement.", "لا اتفاقية نشطة.")} />
      </Insight>
      <Insight id="ctr-bill" title={["Charges by status", "التحصيلات حسب الحالة"]} q={["How much chargeable work reached finance?", "كم من العمل القابل للتحصيل وصل إلى المالية؟"]}
        meta={M(["FSM Charge Proposal"], ["One charge proposal (RP19)", "مقترح تحصيل (RP19)"], ["Sum of amount by status", "مجموع المبلغ حسب الحالة"], ["RP19 filtered to the status", "RP19 مفلتراً بالحالة"])}>
        <Bars fmt={(v) => money(v)} items={pts(sumBy(r19, "status", (r) => num(r["amount"])), { label: (k) => opt(k, ar), order: ["Proposed", "Approved", "Handed Off", "Error"], tone: (k) => (k === "Handed Off" ? "good" : k === "Error" ? "bad" : undefined), drill: (k) => ({ to: rp("RP19", F, { status: k }) }) })} empty={t("No charge proposal in scope.", "لا مقترحات تحصيل ضمن النطاق.")} />
      </Insight>
      <Insight id="ctr-margin" title={["Contract contribution", "مساهمة العقود"]} q={["Which agreements are profitable?", "أي الاتفاقيات مربحة؟"]}
        meta={M(["FSM Service Agreement", "Sales Invoice", "Timesheet", "Stock Ledger Entry"], ["Would be one agreement with posted revenue and cost (RP15)", "سيكون اتفاقية بإيراد وتكلفة مرحّلين (RP15)"], ["Not computed in the preview", "غير محسوب في المعاينة"], ["RP15", "RP15"], ["No margin is estimated", "لا يُقدّر هامش"])}>
        <Unavailable need={["Contract contribution needs posted native revenue and cost allocated to the agreement.", "مساهمة العقد تتطلب إيراداً وتكلفة أصليين مرحّلين مخصصين للاتفاقية."]} backlog={["Server cost allocation for RP15 (K25)", "توزيع التكاليف على الخادم لـ RP15 (K25)"]} />
      </Insight>
    </>,
    kpis: <><K id="K04" F={F} c={c} /><K id="K23" F={F} c={c} /><K id="K25" F={F} c={c} /><C c={c} label={["Active annual value", "القيمة السنوية النشطة"]} value={money(sum(r12, "annual_value"))} basis={["Sum of RP12 annual value, active agreements", "مجموع القيمة السنوية في RP12 للاتفاقيات النشطة"]} to={rp("RP12", F)} /></>,
  };
};

