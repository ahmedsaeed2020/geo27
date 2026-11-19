/** Contracts & requests workspace overviews: Requests, Contract 360, Coverage, Obligation schedule, Renewals. */
import { list, raw, rows, titleOf } from "../../domain/data";
import { agingBucket, s } from "../../domain/rules";
import { money, numTxt, opt } from "../kit";
import { Bars, Cols, Funnel, Insight, Ring, Stack, countBy, inF, monthAxis, monthEnd, monthLabel, perMonth, pts, rp, sumBy, titleL, type Pt } from "../insights";
import { C, K, M, Q, R, type OvFn } from "./ctx";

const site = (k: string) => titleOf("FSM Service Site", k);
const agr = (k: string) => titleOf("FSM Service Agreement", k);

export const requests: OvFn = (c) => {
  const { t, ar, F } = c;
  const rq = R("RP11", F);
  const months = monthAxis(rq.map((r) => r["opened"]), F);
  const pri = [...new Set(rq.map((r) => s(r["priority"]) || "—"))]; const sts = [...new Set(rq.map((r) => s(r["status"]) || "—"))];
  const withJob = rq.filter((r) => s(r["job"])); const jobDone = withJob.filter((r) => ["Completed", "Closed"].includes(s(raw("FSM Job", r["job"])?.["workflow_state"])));
  const openRq = rq.filter((r) => s(r["status"]) === "Open").length;
  return {
    charts: <>
      <Insight id="req-month" title={["Requests opened by month", "الطلبات المفتوحة حسب الشهر"]} q={["Is demand rising or falling?", "هل الطلب في ازدياد أم انخفاض؟"]}
        meta={M(["Issue"], ["One service request (RP11 row)", "طلب خدمة واحد (صف RP11)"], ["Count of requests by opening month", "عدد الطلبات حسب شهر الفتح"], ["RP11 for that month", "RP11 لذلك الشهر"])}>
        <Cols labels={months} labelText={(m) => monthLabel(m, ar)} series={[{ name: "n", label: t("Requests", "الطلبات"), values: perMonth(rq, "opened", months) }]} drill={(li) => ({ to: rp("RP11", F, { from: `${months[li]}-01`, to: monthEnd(months[li]!) }) })} empty={t("No service requests in scope.", "لا طلبات خدمة ضمن النطاق.")} />
      </Insight>
      <Insight id="req-pri" title={["Requests by priority and status", "الطلبات حسب الأولوية والحالة"]} q={["Where are the urgent requests stuck?", "أين تتعثر الطلبات العاجلة؟"]}
        meta={M(["Issue"], ["One request; priority × status", "طلب واحد؛ الأولوية × الحالة"], ["Count per priority, split by status", "العدد لكل أولوية مقسماً حسب الحالة"], ["RP11 filtered to priority and status", "RP11 مفلتراً بالأولوية والحالة"])}>
        <Stack legend={sts.map((x) => ({ key: x, label: opt(x, ar) }))} rows={pri.map((p) => ({ key: p, label: opt(p, ar), to: rp("RP11", F, { priority: p }), segs: sts.map((x) => ({ key: x, value: rq.filter((r) => (s(r["priority"]) || "—") === p && (s(r["status"]) || "—") === x).length, to: rp("RP11", F, { priority: p, status: x }) })) }))} empty={t("No service requests in scope.", "لا طلبات خدمة ضمن النطاق.")} />
      </Insight>
      <Insight id="req-sla" title={["First-response SLA", "مستوى الخدمة للاستجابة الأولى"]} q={["How many requests breached the response target?", "كم طلباً تجاوز هدف الاستجابة؟"]}
        meta={M(["Issue", "Service Level Agreement"], ["One request and its response clock", "طلب واحد وساعة استجابته"], ["response_breach = 1 when first response came after the response-by time (or none yet and the time passed)", "الإخلال = 1 إذا جاءت الاستجابة بعد الموعد (أو لم تأتِ ومضى الموعد)"], ["RP11 filtered to breach / no breach", "RP11 مفلتراً بالإخلال / عدمه"], ["Pauses and business calendars are applied by the server SLA engine; the preview uses the stored deadlines", "الإيقاف والتقويمات تطبقها خدمة مستوى الخدمة على الخادم؛ المعاينة تستخدم المواعيد المخزنة"])}>
        <Ring items={[{ key: "1", label: t("Breached", "مخالف"), value: rq.filter((r) => Number(r["response_breach"]) === 1).length, tone: "bad", to: rp("RP11", F, { response_breach: "1" }) }, { key: "0", label: t("Not breached", "غير مخالف"), value: rq.filter((r) => Number(r["response_breach"]) !== 1).length, tone: "good", to: rp("RP11", F, { response_breach: "0" }) }]} total={t("requests", "طلب")} empty={t("No service requests in scope.", "لا طلبات خدمة ضمن النطاق.")} />
      </Insight>
      <Insight id="req-funnel" title={["Request → job → completion", "الطلب ← أمر العمل ← الإكمال"]} q={["How many requests became field work, and how many were finished?", "كم طلباً تحول إلى عمل ميداني، وكم اكتمل؟"]}
        meta={M(["Issue", "FSM Job"], ["One request; job via Issue.digit_fsm_job", "طلب واحد؛ أمر العمل عبر حقل الربط"], ["Requests → with an FSM job → job Completed or Closed", "الطلبات ← بأمر عمل ← أمر العمل مكتمل أو مغلق"], ["Request register, then the job", "سجل الطلبات ثم أمر العمل"])}>
        <Funnel steps={[{ key: "all", label: t("Requests", "الطلبات"), value: rq.length, to: rp("RP11", F) }, { key: "job", label: t("With an FSM job", "بأمر عمل"), value: withJob.length, list: ["Issue", [["Issue", "digit_fsm_site", ["is", "set"]], ["Issue", "digit_fsm_job", ["is", "set"]]]] }, { key: "done", label: t("Job completed / closed", "أمر العمل مكتمل/مغلق"), value: jobDone.length, list: ["FSM Job", [["FSM Job", "issue", ["is", "set"]], ["FSM Job", "workflow_state", ["in", ["Completed", "Closed"]]]]] }]} empty={t("No service requests in scope.", "لا طلبات خدمة ضمن النطاق.")} />
      </Insight>
    </>,
    kpis: <><C c={c} label={["Open requests", "الطلبات المفتوحة"]} value={openRq} basis={["RP11 rows in status Open for the scope", "صفوف RP11 بحالة مفتوح ضمن النطاق"]} to={rp("RP11", F, { status: "Open" })} tone={openRq ? "warn" : "good"} /><K id="K21" F={F} c={c} /><Q k="to-quote" c={c} /><Q k="decisions" c={c} /></>,
    next: [{ to: "emergency", label: ["Emergency intake", "استقبال الطوارئ"] }],
  };
};

export const contracts: OvFn = (c) => {
  const { t, ar, F } = c;
  const ags = list("FSM Service Agreement").filter((a) => inF(a, F));
  const rp12 = R("RP12", F);
  const active = ags.filter((a) => s(a["workflow_state"]) === "Active");
  return {
    charts: <>
      <Insight id="agr-state" title={["Agreements by status", "الاتفاقيات حسب الحالة"]} q={["How many agreements are in force, draft or ended?", "كم اتفاقية سارية أو مسودة أو منتهية؟"]}
        meta={M(["FSM Service Agreement"], ["One agreement", "اتفاقية واحدة"], ["Count by workflow_state", "العدد حسب الحالة"], ["Agreement register filtered to the status", "سجل الاتفاقيات مفلتراً بالحالة"])}>
        <Ring items={pts(countBy(ags, "workflow_state"), { label: (k) => opt(k, ar), tone: (k) => (k === "Active" ? "good" : k === "Draft" ? "warn" : undefined), drill: (k) => ({ list: ["FSM Service Agreement", [["FSM Service Agreement", "workflow_state", k]]] }) })} total={t("agreements", "اتفاقية")} empty={t("No agreements in scope.", "لا اتفاقيات ضمن النطاق.")} />
      </Insight>
      <Insight id="agr-delivery" title={["Delivery per agreement", "التنفيذ لكل اتفاقية"]} q={["Is each agreement delivering its obligations?", "هل تنفذ كل اتفاقية التزاماتها؟"]}
        meta={M(["FSM Service Agreement", "FSM Obligation"], ["One agreement (RP12); obligations aggregated on their own key", "اتفاقية واحدة (RP12)؛ الالتزامات مجمعة على مفتاحها"], ["Fulfilled, missed and remaining (= obligations − fulfilled − missed)", "منفّذ وفائت ومتبقٍ (= الالتزامات − المنفّذ − الفائت)"], ["RP08 filtered to the agreement and status", "RP08 مفلتراً بالاتفاقية والحالة"])}>
        <Stack legend={[{ key: "Fulfilled", label: opt("Fulfilled", ar), tone: "good" }, { key: "Missed", label: opt("Missed", ar), tone: "bad" }, { key: "Open", label: t("Remaining", "متبقٍ"), tone: "neutral" }]}
          rows={rp12.map((r) => ({ key: s(r["agreement"]), label: <span data-no-i18n>{agr(s(r["agreement"]))}</span>, to: `agreement/${encodeURIComponent(s(r["agreement"]))}`, segs: [
            { key: "Fulfilled", value: Number(r["fulfilled"]) || 0, to: rp("RP08", F, { agreement: s(r["agreement"]), status: "Fulfilled" }) },
            { key: "Missed", value: Number(r["missed"]) || 0, to: rp("RP08", F, { agreement: s(r["agreement"]), status: "Missed" }) },
            { key: "Open", value: Math.max(0, (Number(r["obligations"]) || 0) - (Number(r["fulfilled"]) || 0) - (Number(r["missed"]) || 0)), to: rp("RP08", F, { agreement: s(r["agreement"]) }) }] }))} empty={t("No agreements in scope.", "لا اتفاقيات ضمن النطاق.")} />
      </Insight>
      <Insight id="agr-value" title={["Annual value by customer", "القيمة السنوية حسب العميل"]} q={["Which customers carry the contracted revenue?", "أي العملاء يحملون الإيراد المتعاقد عليه؟"]}
        meta={M(["FSM Service Agreement", "Customer"], ["Active agreements grouped by customer", "الاتفاقيات النشطة مجمعة حسب العميل"], ["Sum of annual_value", "مجموع القيمة السنوية"], ["Agreements of that customer", "اتفاقيات ذلك العميل"], ["Agreements without a value add 0; no revenue is inferred", "الاتفاقيات بلا قيمة تضيف 0؛ لا يُستنتج إيراد"])}>
        <Bars fmt={(v) => money(v)} items={pts(sumBy(active, "customer", (a) => Number(a["annual_value"]) || 0), { label: titleL((k) => titleOf("Customer", k)), drill: (k) => ({ list: ["FSM Service Agreement", [["FSM Service Agreement", "customer", k]]] }) })} empty={t("No active agreement.", "لا اتفاقية نشطة.")} />
      </Insight>
      <Insight id="agr-findings" title={["Open findings at contracted sites", "الملاحظات المفتوحة في المواقع المتعاقدة"]} q={["Which agreements carry open safety findings?", "أي الاتفاقيات تحمل ملاحظات سلامة مفتوحة؟"]}
        meta={M(["FSM Service Agreement", "FSM Deficiency"], ["One agreement (RP12); findings counted per site key", "اتفاقية واحدة (RP12)؛ الملاحظات معدودة لكل موقع"], ["Open findings at the agreement's site", "الملاحظات المفتوحة في موقع الاتفاقية"], ["RP05 filtered to the site", "RP05 مفلتراً بالموقع"])}>
        <Bars items={rp12.map((r) => ({ key: s(r["agreement"]), label: <span data-no-i18n>{agr(s(r["agreement"]))}</span>, value: Number(r["open_findings"]) || 0, tone: "warn" as const, to: rp("RP05", F, { site: s(r["site"]) }) }))} empty={t("No open findings at contracted sites.", "لا ملاحظات مفتوحة في المواقع المتعاقدة.")} />
      </Insight>
    </>,
    kpis: <><K id="K01" F={F} c={c} /><K id="K02" F={F} c={c} /><K id="K04" F={F} c={c} /><K id="K23" F={F} c={c} /></>,
  };
};

export const coverage: OvFn = (c) => {
  const { t, ar, F } = c;
  const ags = list("FSM Service Agreement").filter((a) => inF(a, F));
  const lines = ags.flatMap((a) => rows(a, "coverage").map((l) => ({ ...l, agreement: a.name, state: s(a["workflow_state"]), site: a["site"], system_type: s(raw("FSM Service System", l["system"])?.["system_type"]) }) as Record<string, unknown>));
  const activeLines = lines.filter((l) => l["state"] === "Active");
  const covered = new Set(activeLines.map((l) => s(l["system"])));
  const systems = list("FSM Service System").filter((x) => inF(x, F));
  const sites = [...new Set(systems.map((x) => s(x["site"])))];
  const overlap = [...countBy(activeLines, "system")].filter(([, n]) => n > 1).length;
  return {
    charts: <>
      <Insight id="cov-type" title={["Coverage lines by system type", "بنود التغطية حسب نوع النظام"]} q={["Which trades does the contract book cover?", "ما التخصصات التي تغطيها العقود؟"]}
        meta={M(["FSM Service Agreement", "FSM Coverage Line", "FSM Service System"], ["One coverage line of an active agreement; system → system_type", "بند تغطية في اتفاقية نشطة؛ النظام ← نوعه"], ["Count of lines per system type", "عدد البنود لكل نوع نظام"], ["Systems of that type", "أنظمة ذلك النوع"])}>
        <Bars share items={pts(countBy(activeLines, "system_type"), { label: (k) => opt(k, ar), drill: (k) => ({ list: ["FSM Service System", [["FSM Service System", "system_type", k]]] }) })} empty={t("No active coverage lines.", "لا بنود تغطية نشطة.")} />
      </Insight>
      <Insight id="cov-freq" title={["Service frequency", "تكرار الخدمة"]} q={["How often are covered systems serviced?", "كم مرة تُخدم الأنظمة المغطاة؟"]}
        meta={M(["FSM Coverage Line"], ["One active coverage line", "بند تغطية نشط"], ["Count by frequency", "العدد حسب التكرار"], ["Coverage queue (all lines)", "طابور التغطية (كل البنود)"])}>
        <Ring items={pts(countBy(activeLines, "frequency"), { label: (k) => opt(k, ar), order: ["Monthly", "Quarterly", "Semi-Annual", "Annual"], drill: () => ({ to: "queue/coverage" }) })} total={t("lines", "بند")} empty={t("No active coverage lines.", "لا بنود تغطية نشطة.")} />
      </Insight>
      <Insight id="cov-site" title={["Covered vs uncovered systems by site", "الأنظمة المغطاة وغير المغطاة حسب الموقع"]} q={["Which installed systems have no active agreement?", "ما الأنظمة المركبة بلا اتفاقية نشطة؟"]}
        meta={M(["FSM Service System", "FSM Coverage Line"], ["One system; covered = listed on an active agreement's coverage line", "نظام واحد؛ مغطى = مدرج في بند تغطية لاتفاقية نشطة"], ["Systems per site split covered / not covered", "الأنظمة لكل موقع: مغطاة / غير مغطاة"], ["Site 360 (systems tab)", "الموقع 360 (الأنظمة)"])}>
        <Stack legend={[{ key: "cov", label: t("Covered", "مغطى"), tone: "good" }, { key: "unc", label: t("Not covered", "غير مغطى"), tone: "warn" }]}
          rows={sites.map((k) => { const sy = systems.filter((x) => s(x["site"]) === k); return { key: k, label: <span data-no-i18n>{site(k)}</span>, to: `site/${encodeURIComponent(k)}`, segs: [
            { key: "cov", value: sy.filter((x) => covered.has(x.name)).length, list: ["FSM Service System", [["FSM Service System", "site", k]]] as [string, [string, string, unknown][]] },
            { key: "unc", value: sy.filter((x) => !covered.has(x.name)).length, to: `site/${encodeURIComponent(k)}` }] }; })} empty={t("No systems in scope.", "لا أنظمة ضمن النطاق.")} />
      </Insight>
      <Insight id="cov-devices" title={["Devices under coverage by system", "الأجهزة المشمولة حسب النظام"]} q={["How many devices does each covered system hold?", "كم جهازاً في كل نظام مغطى؟"]}
        meta={M(["FSM Device", "FSM Service System"], ["One active device of a covered system", "جهاز نشط واحد في نظام مغطى"], ["Count of devices per covered system", "عدد الأجهزة لكل نظام مغطى"], ["Device register filtered to the system", "سجل الأجهزة مفلتراً بالنظام"])}>
        <Bars items={pts(countBy(list("FSM Device").filter((d) => covered.has(s(d["system"])) && s(d["lifecycle"]) !== "Retired" && inF(d, F)), "system"), { label: titleL((k) => titleOf("FSM Service System", k)), limit: 10, drill: (k) => ({ list: ["FSM Device", [["FSM Device", "system", k]]] }) })} empty={t("No device under coverage.", "لا أجهزة مشمولة.")} />
      </Insight>
    </>,
    kpis: <><C c={c} label={["Active coverage lines", "بنود التغطية النشطة"]} value={activeLines.length} basis={["Lines of active agreements", "بنود الاتفاقيات النشطة"]} to="queue/coverage" /><C c={c} label={["Covered systems", "الأنظمة المغطاة"]} value={covered.size} basis={["Distinct systems on an active line", "أنظمة مميزة في بند نشط"]} to="queue/coverage" tone="good" />
      <C c={c} label={["Uncovered systems", "الأنظمة غير المغطاة"]} value={systems.filter((x) => !covered.has(x.name)).length} basis={["Installed systems on no active agreement", "أنظمة مركبة بلا اتفاقية نشطة"]} to="sites" tone="warn" /><C c={c} label={["Overlapping coverage", "تغطية متداخلة"]} value={overlap} basis={["Systems on two active agreements", "أنظمة في اتفاقيتين نشطتين"]} to="queue/coverage" tone={overlap ? "bad" : "good"} /></>,
  };
};

export const obligations: OvFn = (c) => {
  const { t, ar, F } = c;
  const ob = R("RP08", F);
  const months = monthAxis(ob.map((r) => r["due_date"]), F);
  const inM = (m: string, pred: (r: Record<string, unknown>) => boolean) => ob.filter((r) => s(r["due_date"]).slice(0, 7) === m && pred(r)).length;
  const over = R("RP09", F).filter((r) => r["dataset"] === "Obligation");
  const ful = ob.filter((r) => s(r["status"]) === "Fulfilled");
  const sites = [...new Set(ful.map((r) => s(r["site"])))];
  return {
    charts: <>
      <Insight id="obl-month" title={["Obligations due by month", "الالتزامات المستحقة حسب الشهر"]} q={["How much recurring work falls due each month, and how much was delivered?", "كم من العمل الدوري يستحق كل شهر، وكم نُفذ؟"]}
        meta={M(["FSM Obligation"], ["One obligation whose window meets the period (RP08)", "التزام واحد تتقاطع نافذته مع الفترة (RP08)"], ["Count per due month: fulfilled, open (due / scheduled), missed", "العدد لكل شهر استحقاق: منفّذ، مفتوح، فائت"], ["RP08 for the month and status", "RP08 للشهر والحالة"])}>
        <Cols labels={months} labelText={(m) => monthLabel(m, ar)} series={[{ name: "f", label: opt("Fulfilled", ar), values: months.map((m) => inM(m, (r) => s(r["status"]) === "Fulfilled")) }, { name: "o", label: t("Open", "مفتوح"), values: months.map((m) => inM(m, (r) => ["Due", "Scheduled"].includes(s(r["status"])))) }, { name: "x", label: opt("Missed", ar), values: months.map((m) => inM(m, (r) => s(r["status"]) === "Missed")) }]}
          drill={(li, si) => ({ to: rp("RP08", F, { from: `${months[li]}-01`, to: monthEnd(months[li]!), ...(si === 0 ? { status: "Fulfilled" } : si === 2 ? { status: "Missed" } : {}) }) })} empty={t("No obligations in scope.", "لا التزامات ضمن النطاق.")} />
      </Insight>
      <Insight id="obl-status" title={["Status mix", "توزيع الحالات"]} q={["What share of the cohort is delivered, scheduled, due or missed?", "ما نسبة المنفّذ والمجدول والمستحق والفائت؟"]}
        meta={M(["FSM Obligation"], ["One obligation (RP08)", "التزام واحد (RP08)"], ["Count by status; Waived shown separately, never as fulfilled", "العدد حسب الحالة؛ المعفى منفصل ولا يُعد منفّذاً"], ["RP08 filtered to the status", "RP08 مفلتراً بالحالة"])}>
        <Ring items={pts(countBy(ob, "status"), { label: (k) => opt(k, ar), order: ["Fulfilled", "Scheduled", "Due", "Missed", "Waived"], tone: (k) => (k === "Missed" ? "bad" : k === "Fulfilled" ? "good" : undefined), drill: (k) => ({ to: rp("RP08", F, { status: k }) }) })} total={t("obligations", "التزام")} empty={t("No obligations in scope.", "لا التزامات ضمن النطاق.")} />
      </Insight>
      <Insight id="obl-over" title={["Overdue obligations by days past window", "الالتزامات المتأخرة حسب أيام التجاوز"]} q={["How far behind is the overdue work?", "إلى أي مدى تأخر العمل المتأخر؟"]}
        meta={M(["FSM Obligation"], ["One missed / past-window obligation (RP09 obligation dataset)", "التزام فائت أو متجاوز (مجموعة الالتزامات في RP09)"], ["days_over = as-of − window end, bucketed", "أيام التجاوز = التاريخ − نهاية النافذة، في فئات"], ["RP09 obligation dataset", "مجموعة الالتزامات في RP09"])}>
        <Bars items={pts(countBy(over, (r) => agingBucket(Number(r["days_over"]) || 0)), { order: ["0–7", "8–30", "31–90", ">90"], tone: (k) => (k === ">90" || k === "31–90" ? "bad" : "warn"), drill: () => ({ to: rp("RP09", F, { dataset: "Obligation" }) }) })} empty={t("No overdue obligation.", "لا التزام متأخر.")} />
      </Insight>
      <Insight id="obl-ontime" title={["On-time vs late fulfilment by site", "التنفيذ في الموعد أو متأخراً حسب الموقع"]} q={["Which sites are served late?", "أي المواقع تُخدم متأخرة؟"]}
        meta={M(["FSM Obligation"], ["One fulfilled obligation (RP08)", "التزام منفّذ واحد (RP08)"], ["on_time = fulfilled on or before window end", "في الموعد = نُفذ في نهاية النافذة أو قبلها"], ["RP08 filtered to site and on-time flag", "RP08 مفلتراً بالموقع وعلامة الموعد"])}>
        <Stack legend={[{ key: "1", label: t("On time", "في الموعد"), tone: "good" }, { key: "0", label: t("Late", "متأخر"), tone: "bad" }]}
          rows={sites.map((k) => ({ key: k, label: <span data-no-i18n>{site(k)}</span>, segs: ["1", "0"].map((v) => ({ key: v, value: ful.filter((r) => s(r["site"]) === k && String(Number(r["on_time"])) === v).length, to: rp("RP08", F, { site: k, status: "Fulfilled", on_time: v }) })) }))} empty={t("No fulfilled obligation in scope.", "لا التزام منفّذ ضمن النطاق.")} />
      </Insight>
    </>,
    kpis: <><K id="K01" F={F} c={c} /><K id="K02" F={F} c={c} /><K id="K03" F={F} c={c} /><K id="K04" F={F} c={c} /></>,
  };
};

export const renewals: OvFn = (c) => {
  const { t, ar, F } = c;
  const rp12 = R("RP12", F).filter((r) => s(r["state"]) === "Active").sort((a, b) => (Number(a["days_to_expiry"]) || 0) - (Number(b["days_to_expiry"]) || 0));
  const ren = list("FSM Renewal Case").filter((x) => inF(x, F));
  const soon = rp12.filter((r) => (Number(r["days_to_expiry"]) || 0) <= 120);
  const label = (r: Record<string, unknown>) => <span data-no-i18n>{agr(s(r["agreement"]))}</span>;
  const pt = (r: Record<string, unknown>, value: number, tone?: Pt["tone"]): Pt => ({ key: s(r["agreement"]), label: label(r), value, tone, to: `agreement/${encodeURIComponent(s(r["agreement"]))}` });
  return {
    charts: <>
      <Insight id="ren-days" title={["Days to expiry", "الأيام حتى الانتهاء"]} q={["Which active agreements end first?", "أي الاتفاقيات النشطة تنتهي أولاً؟"]}
        meta={M(["FSM Service Agreement"], ["One active agreement (RP12)", "اتفاقية نشطة واحدة (RP12)"], ["end_date − as-of, ascending", "تاريخ الانتهاء − التاريخ، تصاعدياً"], ["Agreement 360", "الاتفاقية 360"])}>
        <Bars fmt={(v) => `${numTxt(v)} ${t("d", "ي")}`} items={rp12.slice(0, 8).map((r) => pt(r, Math.max(0, Number(r["days_to_expiry"]) || 0), (Number(r["days_to_expiry"]) || 0) <= 60 ? "bad" : (Number(r["days_to_expiry"]) || 0) <= 120 ? "warn" : undefined))} empty={t("No active agreement.", "لا اتفاقية نشطة.")} />
      </Insight>
      <Insight id="ren-value" title={["Annual value at renewal", "القيمة السنوية عند التجديد"]} q={["How much contracted value comes up for renewal?", "كم من القيمة المتعاقدة تقترب من التجديد؟"]}
        meta={M(["FSM Service Agreement", "FSM Renewal Case"], ["One active agreement (RP12)", "اتفاقية نشطة واحدة (RP12)"], ["annual_value; amber when ending within 120 days without an open renewal case", "القيمة السنوية؛ كهرماني إذا انتهت خلال 120 يوماً بلا حالة تجديد"], ["Agreement 360", "الاتفاقية 360"])}>
        <Bars fmt={(v) => money(v)} items={rp12.slice(0, 8).map((r) => pt(r, Number(r["annual_value"]) || 0, (Number(r["days_to_expiry"]) || 0) <= 120 && !s(r["renewal"]) ? "warn" : undefined))} empty={t("No active agreement.", "لا اتفاقية نشطة.")} />
      </Insight>
      <Insight id="ren-cases" title={["Renewal cases by status", "حالات التجديد حسب الحالة"]} q={["Are renewals being worked?", "هل يجري العمل على التجديدات؟"]}
        meta={M(["FSM Renewal Case"], ["One renewal case", "حالة تجديد واحدة"], ["Count by status", "العدد حسب الحالة"], ["Renewal case register filtered to the status", "سجل حالات التجديد مفلتراً بالحالة"])}>
        <Ring items={pts(countBy(ren, "status"), { label: (k) => opt(k, ar), drill: (k) => ({ list: ["FSM Renewal Case", [["FSM Renewal Case", "status", k]]] }) })} total={t("cases", "حالة")} empty={t("No renewal case opened yet.", "لم تُفتح حالة تجديد بعد.")} />
      </Insight>
      <Insight id="ren-health" title={["Delivery health of agreements ending soon", "سلامة تنفيذ الاتفاقيات القريبة من الانتهاء"]} q={["Do expiring agreements have missed work or open findings that threaten renewal?", "هل للاتفاقيات المنتهية عمل فائت أو ملاحظات مفتوحة تهدد التجديد؟"]}
        meta={M(["FSM Service Agreement", "FSM Obligation", "FSM Deficiency"], ["One agreement ending within 120 days (RP12)", "اتفاقية تنتهي خلال 120 يوماً (RP12)"], ["Fulfilled, missed obligations and open findings, each on its own key", "المنفّذ والفائت والملاحظات المفتوحة، كلٌ على مفتاحه"], ["RP08 / RP05 for the agreement or site", "RP08 / RP05 للاتفاقية أو الموقع"])}>
        <Stack legend={[{ key: "f", label: opt("Fulfilled", ar), tone: "good" }, { key: "m", label: opt("Missed", ar), tone: "bad" }, { key: "d", label: t("Open findings", "ملاحظات مفتوحة"), tone: "warn" }]}
          rows={soon.map((r) => ({ key: s(r["agreement"]), label: label(r), to: `agreement/${encodeURIComponent(s(r["agreement"]))}`, segs: [{ key: "f", value: Number(r["fulfilled"]) || 0, to: rp("RP08", F, { agreement: s(r["agreement"]), status: "Fulfilled" }) }, { key: "m", value: Number(r["missed"]) || 0, to: rp("RP08", F, { agreement: s(r["agreement"]), status: "Missed" }) }, { key: "d", value: Number(r["open_findings"]) || 0, to: rp("RP05", F, { site: s(r["site"]) }) }] }))} empty={t("No agreement ends within 120 days.", "لا اتفاقية تنتهي خلال 120 يوماً.")} />
      </Insight>
    </>,
    kpis: <><K id="K23" F={F} c={c} /><Q k="renewals" c={c} label={["Ending within 120 days", "تنتهي خلال 120 يوماً"]} /><C c={c} label={["Open renewal cases", "حالات تجديد مفتوحة"]} value={ren.filter((x) => s(x["status"]) === "Open").length} basis={["FSM Renewal Case in status Open", "حالات التجديد المفتوحة"]} to="queue/renewals" />
      <C c={c} label={["Value ending ≤120 days", "قيمة تنتهي خلال 120 يوماً"]} value={money(soon.reduce((a, r) => a + (Number(r["annual_value"]) || 0), 0))} basis={["Sum of annual value, active agreements ending within 120 days", "مجموع القيمة السنوية للاتفاقيات المنتهية خلال 120 يوماً"]} to="queue/renewals" tone={soon.length ? "warn" : "good"} /></>,
  };
};

