import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/** Parts, labour & billing workspace overviews: Commercial execution, Materials, Labour hours, Billing, Profitability. */
import { canRead, list, rows, titleOf } from "../../domain/data";
import { tLabel } from "@/i18n";
import { s, type Row } from "../../domain/rules";
import { AppLink, DataTable, DocRef, ListRef, Panel, money, numTxt, opt } from "../kit";
import { Bars, Cols, Funnel, Insight, Ring, Stack, Unavailable, countBy, inF, pts, rp, sumBy, titleL } from "../insights";
import { C, K, LS, M, Q, R, num, sum, type Ctx, type OvFn } from "./ctx";
import { BillingDesk, LabourDesk, PartsDesk } from "../fieldMoney";

const CP = "FSM Charge Proposal";
const STATUS = ["Proposed", "Approved", "Handed Off", "Error"];
const ST_TONE = (k: string) => (k === "Handed Off" ? "good" as const : k === "Error" ? "bad" as const : k === "Approved" ? "info" as const : undefined);
const cust = (k: string) => titleL((k) => titleOf("Customer", k))(k);
const tech = (k: string) => titleL((k) => titleOf("FSM Technician", k))(k);
const hrs = (v: number) => numTxt(v, 1);

export const commercial: OvFn = (c) => {
  const { t, ar, F } = c;
  const jobs = list("FSM Job").filter((j) => inF(j, F)); const done = jobs.filter((j) => ["Completed", "Closed"].includes(s(j["workflow_state"])));
  const props = list(CP).filter((p) => inF(p, F)); const doneSet = new Set(done.map((j) => j.name));
  const propJobs = new Set(props.map((p) => s(p["job"])).filter((j) => doneSet.has(j)));
  const r19 = R("RP19", F); const custs = [...new Set(r19.map((r) => s(r["customer"])))];
  return {
    charts: <>
      <Insight id="com-funnel" title={["Completed work → charge → finance", "العمل المكتمل ← التحصيل ← المالية"]} q={["How much completed work reached finance?", "كم من العمل المكتمل وصل إلى المالية؟"]}
        meta={M(["FSM Job", CP, "Sales Invoice"], ["One completed / closed job; proposals joined on job", "أمر عمل مكتمل/مغلق؛ مقترحات التحصيل مربوطة بأمر العمل"], ["Completed jobs → with a charge proposal → proposals approved or handed off → with a Sales Invoice", "أوامر مكتملة ← بمقترح تحصيل ← مقترحات معتمدة أو مسلّمة ← بفاتورة مبيعات"], ["Job / charge proposal registers filtered to the step", "سجل أوامر العمل/المقترحات مفلتراً بالخطوة"], ["Invoices are created by native finance; a proposal without a Sales Invoice is not counted as billed", "الفواتير تنشئها المالية الأصلية؛ المقترح بلا فاتورة لا يُعد مفوتراً"])}>
        <Funnel steps={[
          { key: "done", label: t("Completed jobs", "أوامر مكتملة"), value: done.length, ...LS("FSM Job", ["workflow_state", ["in", ["Completed", "Closed"]]]) },
          { key: "prop", label: t("With a charge proposal", "بمقترح تحصيل"), value: propJobs.size, ...LS(CP, ["job", ["in", [...propJobs]]]) },
          { key: "appr", label: t("Approved / handed off", "معتمدة/مسلّمة"), value: props.filter((p) => ["Approved", "Handed Off"].includes(s(p["status"]))).length, ...LS(CP, ["status", ["in", ["Approved", "Handed Off"]]]) },
          { key: "inv", label: t("With a Sales Invoice", "بفاتورة مبيعات"), tone: "good", value: props.filter((p) => s(p["sales_invoice"])).length, ...LS(CP, ["sales_invoice", ["is", "set"]]) },
        ]} empty={t("No completed job in scope.", "لا أوامر عمل مكتملة ضمن النطاق.")} />
      </Insight>
      <Insight id="com-status" title={["Charge proposals by status", "مقترحات التحصيل حسب الحالة"]} q={["Where are charges waiting?", "أين تنتظر التحصيلات؟"]}
        meta={M([CP], ["One charge proposal (RP19)", "مقترح تحصيل واحد (RP19)"], ["Count by status", "العدد حسب الحالة"], ["RP19 filtered to the status", "RP19 مفلتراً بالحالة"])}>
        <Ring items={pts(countBy(r19, "status"), { label: (k) => opt(k, ar), order: STATUS, tone: ST_TONE, drill: (k) => ({ to: rp("RP19", F, { status: k }) }) })} total={t("proposals", "مقترح")} empty={t("No charge proposal in scope.", "لا مقترحات تحصيل ضمن النطاق.")} />
      </Insight>
      <Insight id="com-cov" title={["Amount by coverage decision", "المبلغ حسب قرار التغطية"]} q={["How much work is chargeable versus covered by contract?", "كم من العمل قابل للتحصيل مقابل المغطى بالعقد؟"]}
        meta={M([CP], ["One charge proposal (RP19)", "مقترح تحصيل واحد (RP19)"], ["Sum of amount by coverage decision", "مجموع المبلغ حسب قرار التغطية"], ["RP19 filtered to the decision", "RP19 مفلتراً بالقرار"])}>
        <Bars fmt={(v) => money(v)} share items={pts(sumBy(r19, "coverage", (r) => num(r["amount"])), { label: (k) => opt(k, ar), order: ["Chargeable", "Partly Covered", "Covered"], drill: (k) => ({ to: rp("RP19", F, { coverage: k }) }) })} empty={t("No charge proposal in scope.", "لا مقترحات تحصيل ضمن النطاق.")} />
      </Insight>
      <Insight id="com-cust" title={["Charges by customer and status", "التحصيلات حسب العميل والحالة"]} q={["Which customers have charges stuck before finance?", "أي العملاء لديهم تحصيلات متوقفة قبل المالية؟"]}
        meta={M([CP, "Customer"], ["One charge proposal; customer × status", "مقترح تحصيل؛ العميل × الحالة"], ["Sum of amount per customer split by status", "مجموع المبلغ لكل عميل مقسماً حسب الحالة"], ["RP19 filtered to customer and status", "RP19 مفلتراً بالعميل والحالة"])}>
        <Stack fmt={(v) => money(v)} legend={STATUS.map((k) => ({ key: k, label: opt(k, ar), tone: ST_TONE(k) }))} rows={custs.map((k) => ({ key: k, label: cust(k), to: rp("RP19", { ...F, customer: k }), segs: STATUS.map((st) => ({ key: st, value: sum(r19.filter((r) => s(r["customer"]) === k && s(r["status"]) === st), "amount"), to: rp("RP19", { ...F, customer: k }, { status: st }) })) }))} empty={t("No charge proposal in scope.", "لا مقترحات تحصيل ضمن النطاق.")} />
      </Insight>
    </>,
    kpis: <><Q k="readiness" c={c} /><Q k="invoice-ready" c={c} /><Q k="handoffs" c={c} /><C c={c} label={["Handed-off amount", "المبلغ المسلّم"]} value={money(sum(r19.filter((r) => s(r["status"]) === "Handed Off"), "amount"))} basis={["Sum of RP19 amount with status Handed Off", "مجموع مبلغ RP19 بحالة مسلّم"]} to={rp("RP19", F, { status: "Handed Off" })} tone="good" /></>,
  };
};

export const materials: OvFn = (c) => {
  const { t, ar, F } = c;
  const r13 = R("RP13", F);
  const jobs = [...new Set(r13.map((r) => s(r["job"])))];
  const types = [...new Set(r13.map((r) => s(r["doctype_label"])))];
  return {
    extra: <PartsDesk />,
    charts: <>
      <Insight id="mat-job" title={["Quantities per job", "الكميات لكل أمر عمل"]} q={["Were requested parts issued, and were any returned?", "هل صُرفت المواد المطلوبة، وهل أُرجع شيء؟"]}
        meta={M(["Material Request", "Stock Entry", "FSM Job"], ["One material line linked to a job (RP13)", "بند مواد مرتبط بأمر عمل (RP13)"], ["Sum of requested, issued (submitted issues) and returned (submitted receipts/returns) quantities", "مجموع المطلوب والمصروف (صرف معتمد) والمرتجع (استلام/إرجاع معتمد)"], ["RP13 filtered to the job", "RP13 مفلتراً بأمر العمل"], ["Draft stock entries are not counted as issued", "قيود المخزون المسودة لا تُحسب مصروفة"])}>
        <Stack legend={[{ key: "req", label: t("Requested", "مطلوب"), tone: "info" }, { key: "iss", label: t("Issued", "مصروف"), tone: "good" }, { key: "ret", label: t("Returned", "مرتجع"), tone: "warn" }]}
          rows={jobs.map((k) => { const js = r13.filter((r) => s(r["job"]) === k); return { key: k, label: <span data-no-i18n>{titleOf("FSM Job", k)}</span>, to: `job/${encodeURIComponent(k)}`, segs: [{ key: "req", value: sum(js, "requested"), to: rp("RP13", F, { job: k, doctype_label: "Material Request" }) }, { key: "iss", value: sum(js, "issued"), to: rp("RP13", F, { job: k, doctype_label: "Stock Entry" }) }, { key: "ret", value: sum(js, "returned"), to: rp("RP13", F, { job: k, doctype_label: "Stock Entry" }) }] }; })} empty={t("No material linked to a job.", "لا مواد مرتبطة بأمر عمل.")} />
      </Insight>
      <Insight id="mat-item" title={["Most issued items", "الأصناف الأكثر صرفاً"]} q={["Which parts does field work consume most?", "أي المواد يستهلكها العمل الميداني أكثر؟"]}
        meta={M(["Stock Entry", "Item"], ["One submitted issue line (RP13)", "بند صرف معتمد (RP13)"], ["Sum of issued quantity per item", "مجموع الكمية المصروفة لكل صنف"], ["RP13 filtered to the item", "RP13 مفلتراً بالصنف"])}>
        <Bars items={pts(sumBy(r13.filter((r) => num(r["issued"]) > 0), "item_code", (r) => num(r["issued"])), { label: (k) => <span data-no-i18n>{titleOf("Item", k)}</span>, limit: 10, drill: (k) => ({ to: rp("RP13", F, { item_code: k }) }) })} empty={t("No issued quantity yet.", "لا كميات مصروفة بعد.")} />
      </Insight>
      <Insight id="mat-post" title={["Lines by document and posting status", "البنود حسب المستند وحالة الترحيل"]} q={["How many material lines are still drafts?", "كم بند مواد ما زال مسودة؟"]}
        meta={M(["Material Request", "Stock Entry"], ["One material line (RP13)", "بند مواد واحد (RP13)"], ["Count per document type split Draft / Submitted", "العدد لكل نوع مستند: مسودة / معتمد"], ["RP13 filtered to type and status", "RP13 مفلتراً بالنوع والحالة"])}>
        <Cols labels={types} labelText={(k) => (ar ? tLabel(k) : k)} series={["Submitted", "Draft"].map((st) => ({ name: st, label: opt(st, ar), values: types.map((k) => r13.filter((r) => s(r["doctype_label"]) === k && s(r["status"]) === st).length) }))}
        drill={(li, si) => ({ to: rp("RP13", F, { doctype_label: types[li]!, status: si === 0 ? "Submitted" : "Draft" }) })} empty={t("No material linked to a job.", "لا مواد مرتبطة بأمر عمل.")} />
      </Insight>
      <Insight id="mat-visit" title={["Parts per visit", "المواد لكل زيارة"]} q={["Which visit consumed which parts?", "أي زيارة استهلكت أي مواد؟"]}
        meta={M(["Stock Entry", VISIT_DT], ["Would be one issue line per visit", "سيكون بند صرف لكل زيارة"], ["Not computed — stock movements carry the job, not the visit", "غير محسوب — حركات المخزون تحمل أمر العمل لا الزيارة"], ["RP13 by job instead", "RP13 حسب أمر العمل بدلاً من ذلك"], ["No visit link exists on Stock Entry; nothing is apportioned or estimated", "لا يوجد ربط زيارة في قيد المخزون؛ لا توزيع ولا تقدير"])}>
        <Bars items={pts(sumBy(list("Stock Entry").filter((x) => s(x["digit_fsm_visit"]) && Number(x["docstatus"] ?? 0) !== 2).flatMap((x) => rows(x, "items").map((l) => ({ visit: s(x["digit_fsm_visit"]), qty: num(l["qty"]) }))), "visit", (r) => num(r["qty"])), { label: (k) => <span data-no-i18n>{titleOf(VISIT_DT, k)}</span>, limit: 10, drill: (k) => ({ to: `visit/${encodeURIComponent(k)}` }) })} empty={t("No parts recorded from a visit yet — the technician journey records them per visit.", "لا مواد مسجلة من زيارة بعد — رحلة الفني تسجلها لكل زيارة.")} />
      </Insight>
    </>,
    kpis: <><K id="K29" F={F} c={c} /><C c={c} label={["Material lines", "بنود المواد"]} value={r13.length} basis={["RP13 rows", "صفوف RP13"]} to={rp("RP13", F)} /><C c={c} label={["Quantity issued", "الكمية المصروفة"]} value={sum(r13, "issued")} basis={["Submitted issue lines", "بنود الصرف المعتمدة"]} to={rp("RP13", F, { doctype_label: "Stock Entry" })} /><C c={c} label={["Quantity returned", "الكمية المرتجعة"]} value={sum(r13, "returned")} basis={["Submitted receipt / return lines", "بنود الاستلام/الإرجاع المعتمدة"]} to={rp("RP13", F, { doctype_label: "Stock Entry" })} /></>,
  };
};

export const labour: OvFn = (c) => {
  const { t, F } = c;
  const r10 = R("RP10", F); const r14 = R("RP14", F);
  return {
    extra: <LabourDesk />,
    charts: <>
      <Insight id="lab-tech" title={["Booked hours per technician", "الساعات المحجوزة لكل فني"]} q={["Who carries the booked workload?", "من يحمل عبء العمل المحجوز؟"]}
        meta={M(["FSM Booking", "FSM Technician"], ["One technician (RP10); bookings in the period", "فني واحد (RP10)؛ الحجوزات في الفترة"], ["Sum of booking hours", "مجموع ساعات الحجز"], ["RP10 filtered to the technician", "RP10 مفلتراً بالفني"])}>
        <Bars fmt={hrs} items={r10.slice().sort((a, b) => num(b["booked_h"]) - num(a["booked_h"])).slice(0, 10).map((r) => ({ key: s(r["technician"]), label: tech(s(r["technician"])), value: num(r["booked_h"]), to: rp("RP10", { ...F, technician: s(r["technician"]) }) }))} empty={t("No booking in the period.", "لا حجوزات في الفترة.")} />
      </Insight>
      <Insight id="lab-appr" title={["Booked vs approved labour", "المحجوز مقابل العمل المعتمد"]} q={["Are booked hours backed by approved timesheets?", "هل الساعات المحجوزة مدعومة بسجلات ساعات معتمدة؟"]}
        meta={M(["FSM Booking", "Timesheet"], ["One technician (RP10)", "فني واحد (RP10)"], ["Booked hours vs approved (submitted) timesheet hours on FSM jobs", "الساعات المحجوزة مقابل ساعات السجلات المعتمدة على أوامر الخدمة"], ["RP10 filtered to the technician", "RP10 مفلتراً بالفني"], ["Only submitted timesheets linked to an FSM job count as approved labour", "فقط سجلات الساعات المعتمدة المرتبطة بأمر خدمة تُحسب عملاً معتمداً"])}>
        <Stack fmt={hrs} legend={[{ key: "b", label: t("Booked", "محجوز"), tone: "info" }, { key: "l", label: t("Approved labour", "عمل معتمد"), tone: "good" }]} rows={r10.map((r) => ({ key: s(r["technician"]), label: tech(s(r["technician"])), segs: [{ key: "b", value: num(r["booked_h"]), to: rp("RP10", { ...F, technician: s(r["technician"]) }) }, { key: "l", value: num(r["labour_h"]), list: ["Timesheet", [["Timesheet", "digit_fsm_job", ["is", "set"]], ["Timesheet", "docstatus", 1]]] as [string, [string, string, unknown][]] }] }))} empty={t("No booking in the period.", "لا حجوزات في الفترة.")} />
      </Insight>
      <Insight id="lab-job" title={["Booked hours per job", "الساعات المحجوزة لكل أمر عمل"]} q={["Which jobs consume the most technician time?", "أي أوامر العمل تستهلك أكثر وقت الفنيين؟"]}
        meta={M(["FSM Job", VISIT_DT, "FSM Booking"], ["One job (RP14); bookings via its visits", "أمر عمل واحد (RP14)؛ الحجوزات عبر زياراته"], ["Sum of booking hours per job", "مجموع ساعات الحجز لكل أمر عمل"], ["Job 360", "أمر العمل 360"])}>
        <Bars fmt={hrs} items={r14.filter((r) => num(r["booked_h"]) > 0).sort((a, b) => num(b["booked_h"]) - num(a["booked_h"])).slice(0, 10).map((r) => ({ key: s(r["job"]), label: <span data-no-i18n>{titleOf("FSM Job", r["job"])}</span>, value: num(r["booked_h"]), to: `job/${encodeURIComponent(s(r["job"]))}` }))} empty={t("No booked hours on jobs.", "لا ساعات محجوزة على أوامر العمل.")} />
      </Insight>
      <Insight id="lab-type" title={["Booked hours by job type", "الساعات المحجوزة حسب نوع العمل"]} q={["How is labour split between planned and reactive work?", "كيف يتوزع العمل بين المخطط والطارئ؟"]}
        meta={M(["FSM Job", "FSM Booking"], ["One job (RP14) grouped by job_type", "أمر عمل (RP14) مجمع حسب النوع"], ["Sum of booked hours per job type", "مجموع الساعات المحجوزة لكل نوع"], ["RP14 filtered to the job type", "RP14 مفلتراً بالنوع"])}>
        <Bars fmt={hrs} share items={pts(sumBy(r14, "job_type", (r) => num(r["booked_h"])), { label: (k) => opt(k, c.ar), drill: (k) => ({ to: rp("RP14", F, { job_type: k }) }) })} empty={t("No booked hours on jobs.", "لا ساعات محجوزة على أوامر العمل.")} />
      </Insight>
    </>,
    kpis: <><K id="K17" F={F} c={c} /><K id="K18" F={F} c={c} /><K id="K20" F={F} c={c} /><C c={c} label={["Approved labour hours", "ساعات العمل المعتمدة"]} value={hrs(sum(r10, "labour_h"))} unit={t("h", "س")} basis={["Submitted FSM timesheets in the period (RP10)", "سجلات الساعات المعتمدة في الفترة (RP10)"]} to={rp("RP10", F)} /></>,
  };
};

/**
 * Customer billing in native documents (owner correction 2026-10-21). Only genuine links are followed:
 *   Sales Invoice  ← FSM Charge Proposal.sales_invoice (set by the server hand-off), and Sales Invoice Item.sales_order of
 *                    those Sales Orders;
 *   Sales Order    ← Sales Order Item.prevdoc_docname = a Quotation that FSM work carries (FSM Job / Deficiency /
 *                    Agreement .quotation — the native "make Sales Order from Quotation" link).
 * The customer's other native orders and invoices are shown as customer-level references, never attributed to FSM work.
 */
function CustomerBilling({ c, r19 }: { c: Ctx; r19: Row[] }) {
  const { t, F, fx } = c;
  const okSO = canRead("Sales Order"), okSI = canRead("Sales Invoice");
  const quotes = new Set([...list("FSM Job"), ...list("FSM Deficiency"), ...list("FSM Service Agreement")].map((d) => s(d["quotation"])).filter(Boolean));
  const sos = okSO ? list("Sales Order").filter((so) => rows(so, "items").some((i) => quotes.has(s(i["prevdoc_docname"])))) : [];
  const soSet = new Set(sos.map((x) => x.name));
  const propSi = new Set(r19.map((r) => s(r["sales_invoice"])).filter(Boolean));
  const sis = okSI ? list("Sales Invoice").filter((si) => propSi.has(si.name) || rows(si, "items").some((i) => soSet.has(s(i["sales_order"])))) : [];
  const custs = [...new Set([...list("FSM Service Site").filter((x) => inF(x, F)).map((x) => s(x["customer"])), ...r19.map((r) => s(r["customer"]))].filter(Boolean))];
  const data = custs.map((k) => ({ name: k, charges: r19.filter((r) => s(r["customer"]) === k).length, fso: sos.filter((x) => s(x["customer"]) === k), fsi: sis.filter((x) => s(x["customer"]) === k),
    so: okSO ? list("Sales Order").filter((x) => s(x["customer"]) === k).length : 0, si: okSI ? list("Sales Invoice").filter((x) => s(x["customer"]) === k).length : 0 }));
  const refs = (dt: string, ds: { name: string }[], ok: boolean) => !ok ? <span className="text-muted-foreground">{t("Restricted", "مقيّد")}</span> : ds.length ? <span className="flex flex-wrap gap-x-2">{ds.slice(0, 3).map((d) => <DocRef key={d.name} doctype={dt} name={d.name} form />)}{ds.length > 3 && <span className="text-muted-foreground" data-no-i18n>+{numTxt(ds.length - 3)}</span>}</span> : <span className="text-muted-foreground">{t("None linked", "لا ربط")}</span>;
  const cnt = (dt: string, k: string, n: number, ok: boolean) => !ok ? <span className="text-muted-foreground">{t("Restricted", "مقيّد")}</span> : n ? <ListRef doctype={dt} filters={[[dt, "customer", k]]} className="tabular-nums text-primary hover:underline"><span data-no-i18n>{numTxt(n)}</span></ListRef> : <span className="tabular-nums text-muted-foreground" data-no-i18n>0</span>;
  return (
    <Panel title={t("Customer billing in native documents", "فوترة العملاء في المستندات الأصلية")} subtitle={t("Sales Orders and Sales Invoices genuinely linked to FSM work, next to each customer's other native documents", "أوامر البيع وفواتير المبيعات المرتبطة فعلاً بأعمال الخدمة، بجانب مستندات العميل الأصلية الأخرى")} attrs={{ "data-customer-billing": "" }}>
      <DataTable id="bil-customers" rows={data} searchable={false} empty={t("No FSM customer in scope.", "لا عملاء خدمة ضمن النطاق.")} cols={[
        { key: "name", label: t("Customer", "العميل"), render: (r) => <DocRef doctype="Customer" name={r.name} title form /> },
        { key: "charges", label: t("FSM charges", "تحصيلات الخدمة"), numeric: true, value: (r) => r.charges, render: (r) => r.charges ? <AppLink to={rp("RP19", F, { customer: r.name })} className="tabular-nums"><span data-no-i18n>{numTxt(r.charges)}</span></AppLink> : <span className="tabular-nums text-muted-foreground" data-no-i18n>0</span> },
        { key: "fso", label: t("Sales Orders from FSM quotations", "أوامر بيع من عروض الخدمة"), render: (r) => refs("Sales Order", r.fso, okSO) },
        { key: "fsi", label: t("Sales Invoices from FSM charges", "فواتير مبيعات من تحصيلات الخدمة"), render: (r) => refs("Sales Invoice", r.fsi, okSI) },
        { key: "so", label: t("All customer Sales Orders", "كل أوامر بيع العميل"), numeric: true, value: (r) => r.so, render: (r) => cnt("Sales Order", r.name, r.so, okSO) },
        { key: "si", label: t("All customer Sales Invoices", "كل فواتير مبيعات العميل"), numeric: true, value: (r) => r.si, render: (r) => cnt("Sales Invoice", r.name, r.si, okSI) },
      ]} />
      <p className="mt-2 text-[11.5px] text-muted-foreground" data-billing-basis>{fx.t(
        "Linked = Sales Invoice set on an FSM charge proposal by the server hand-off (or invoicing one of those Sales Orders); Sales Order made from a Quotation that an FSM job, finding or agreement carries. The last two columns are the customer's native documents for reference — they are not allocated to FSM work.",
        "المرتبط = فاتورة مبيعات مسجلة على مقترح تحصيل عبر التسليم من الخادم (أو تفوتر أحد أوامر البيع تلك)؛ أمر بيع منشأ من عرض سعر يحمله أمر عمل أو ملاحظة أو اتفاقية خدمة. العمودان الأخيران مستندات العميل الأصلية للمرجع — ولا تُنسب إلى أعمال الخدمة.")}</p>
    </Panel>
  );
}

export const billing: OvFn = (c) => {
  const { t, ar, F } = c;
  const r19 = R("RP19", F);
  const diff = r19.filter((r) => s(r["sales_invoice"]) && num(r["difference"]) !== 0);
  return {
    extra: <><BillingDesk /><CustomerBilling c={c} r19={r19} /></>,
    charts: <>
      <Insight id="bil-amt" title={["Amount by status", "المبلغ حسب الحالة"]} q={["How much value sits at each billing stage?", "كم قيمة في كل مرحلة فوترة؟"]}
        meta={M([CP], ["One charge proposal (RP19)", "مقترح تحصيل واحد (RP19)"], ["Sum of amount per status", "مجموع المبلغ لكل حالة"], ["RP19 filtered to the status", "RP19 مفلتراً بالحالة"])}>
        <Bars fmt={(v) => money(v)} items={pts(sumBy(r19, "status", (r) => num(r["amount"])), { label: (k) => opt(k, ar), order: STATUS, tone: ST_TONE, drill: (k) => ({ to: rp("RP19", F, { status: k }) }) })} empty={t("No charge proposal in scope.", "لا مقترحات تحصيل ضمن النطاق.")} />
      </Insight>
      <Insight id="bil-inv" title={["Invoiced vs not invoiced", "المفوتر مقابل غير المفوتر"]} q={["Which approved charges still have no invoice?", "أي التحصيلات المعتمدة بلا فاتورة بعد؟"]}
        meta={M([CP, "Sales Invoice"], ["One approved / handed-off proposal (RP19)", "مقترح معتمد/مسلّم (RP19)"], ["With a linked Sales Invoice vs without", "بفاتورة مرتبطة مقابل دونها"], ["Charge proposal register filtered accordingly", "سجل المقترحات مفلتراً وفقاً لذلك"])}>
        <Ring items={[{ key: "y", label: t("Invoiced", "مفوتر"), tone: "good" as const, value: r19.filter((r) => ["Approved", "Handed Off"].includes(s(r["status"])) && s(r["sales_invoice"])).length, ...LS(CP, ["status", ["in", ["Approved", "Handed Off"]]], ["sales_invoice", ["is", "set"]]) }, { key: "n", label: t("No invoice yet", "بلا فاتورة بعد"), tone: "warn" as const, value: r19.filter((r) => ["Approved", "Handed Off"].includes(s(r["status"])) && !s(r["sales_invoice"])).length, ...LS(CP, ["status", ["in", ["Approved", "Handed Off"]]], ["sales_invoice", ["is", "not set"]]) }]} total={t("approved", "معتمد")} empty={t("No approved charge.", "لا تحصيلات معتمدة.")} />
      </Insight>
      <Insight id="bil-diff" title={["Invoice differences", "فروقات الفواتير"]} q={["Where does the invoice differ from the approved charge?", "أين تختلف الفاتورة عن التحصيل المعتمد؟"]}
        meta={M([CP, "Sales Invoice"], ["One invoiced proposal (RP19)", "مقترح مفوتر (RP19)"], ["difference = invoiced − amount (non-zero only)", "الفرق = المفوتر − المبلغ (غير الصفري فقط)"], ["RP19 filtered to the proposal", "RP19 مفلتراً بالمقترح"])}>
        <Bars fmt={(v) => money(v)} items={diff.slice(0, 10).map((r) => ({ key: s(r["proposal"]), label: <span data-no-i18n>{s(r["proposal"])}</span>, value: Math.abs(num(r["difference"])), tone: "bad" as const, to: rp("RP19", F, { proposal: s(r["proposal"]) }) }))} empty={t("No invoice differs from its approved charge.", "لا توجد فاتورة تختلف عن تحصيلها المعتمد.")} />
      </Insight>
      <Insight id="bil-cov" title={["Proposals by coverage decision", "المقترحات حسب قرار التغطية"]} q={["How often is work billed outside the contract?", "كم مرة يُفوتر العمل خارج العقد؟"]}
        meta={M([CP], ["One charge proposal (RP19)", "مقترح تحصيل واحد (RP19)"], ["Count by coverage decision", "العدد حسب قرار التغطية"], ["RP19 filtered to the decision", "RP19 مفلتراً بالقرار"])}>
        <Ring items={pts(countBy(r19, "coverage"), { label: (k) => opt(k, ar), order: ["Chargeable", "Partly Covered", "Covered"], drill: (k) => ({ to: rp("RP19", F, { coverage: k }) }) })} total={t("proposals", "مقترح")} empty={t("No charge proposal in scope.", "لا مقترحات تحصيل ضمن النطاق.")} />
      </Insight>
    </>,
    kpis: <><Q k="invoice-ready" c={c} /><Q k="handoffs" c={c} /><C c={c} label={["Approved amount", "المبلغ المعتمد"]} value={money(sum(r19.filter((r) => ["Approved", "Handed Off"].includes(s(r["status"]))), "amount"))} basis={["Sum of RP19 amount, Approved or Handed Off", "مجموع مبلغ RP19 المعتمد أو المسلّم"]} to={rp("RP19", F)} /><C c={c} label={["Proposals in error", "مقترحات بخطأ"]} value={r19.filter((r) => s(r["status"]) === "Error").length} basis={["Handoff failed; see integration exceptions", "فشل التسليم؛ راجع استثناءات التكامل"]} to={rp("RP19", F, { status: "Error" })} tone="bad" /></>,
  };
};

export const profitability: OvFn = (c) => {
  const { t, F } = c;
  const r14 = R("RP14", F); const r15 = R("RP15", F);
  return {
    charts: <>
      <Insight id="pro-unavail" title={["Contribution per job and agreement", "المساهمة لكل أمر عمل واتفاقية"]} q={["What does each job and agreement contribute after cost?", "ما مساهمة كل أمر عمل واتفاقية بعد التكلفة؟"]}
        meta={M(["FSM Job", "Sales Invoice", "Stock Ledger Entry", "Timesheet"], ["Would be one job / agreement with posted revenue and cost", "سيكون أمر عمل/اتفاقية بإيراد وتكلفة مرحّلين"], ["Not computed in the preview", "غير محسوب في المعاينة"], ["RP14 / RP15 (columns marked server-required)", "RP14 / RP15 (أعمدة تتطلب الخادم)"], ["No margin is estimated: costs and invoices must be posted by native finance", "لا يُقدّر هامش: يجب ترحيل التكاليف والفواتير بالمالية الأصلية"])}>
        <Unavailable need={["Contribution needs posted native costs (stock valuation, labour costing, purchase invoices) and submitted Sales Invoices allocated to the job.", "المساهمة تتطلب تكاليف أصلية مرحّلة (تقييم المخزون، تكلفة العمل، فواتير الشراء) وفواتير مبيعات معتمدة مخصصة لأمر العمل."]} backlog={["Server cost allocation for RP14 / RP15 on the DIGIT site", "توزيع التكاليف على الخادم لتقريري RP14 / RP15"]} />
      </Insight>
      <Insight id="pro-quoted" title={["Quoted value per job", "القيمة المسعّرة لكل أمر عمل"]} q={["Which jobs carry the largest quoted value?", "أي أوامر العمل تحمل أكبر قيمة مسعّرة؟"]}
        meta={M(["FSM Job", "Quotation"], ["One job with a linked quotation (RP14)", "أمر عمل بعرض سعر مرتبط (RP14)"], ["Quotation grand total", "إجمالي عرض السعر"], ["Job 360", "أمر العمل 360"], ["Jobs without a quotation are not shown; a quote is not revenue", "أوامر العمل بلا عرض لا تظهر؛ العرض ليس إيراداً"])}>
        <Bars fmt={(v) => money(v)} items={r14.filter((r) => num(r["quoted"]) > 0).sort((a, b) => num(b["quoted"]) - num(a["quoted"])).slice(0, 10).map((r) => ({ key: s(r["job"]), label: <span data-no-i18n>{titleOf("FSM Job", r["job"])}</span>, value: num(r["quoted"]), to: `job/${encodeURIComponent(s(r["job"]))}` }))} empty={t("No job carries a quotation.", "لا أوامر عمل بعروض أسعار.")} />
      </Insight>
      <Insight id="pro-agr" title={["Annual value vs hours per agreement", "القيمة السنوية مقابل الساعات لكل اتفاقية"]} q={["Which agreements absorb the most technician time?", "أي الاتفاقيات تستهلك أكثر وقت الفنيين؟"]}
        meta={M(["FSM Service Agreement", "FSM Booking"], ["One agreement (RP15); bookings via its jobs' visits", "اتفاقية واحدة (RP15)؛ الحجوزات عبر زيارات أوامرها"], ["Booked hours per agreement (bar); annual value shown in the label", "الساعات المحجوزة لكل اتفاقية؛ القيمة السنوية في التسمية"], ["RP15 filtered to the agreement", "RP15 مفلتراً بالاتفاقية"])}>
        <Bars fmt={hrs} items={r15.map((r) => ({ key: s(r["agreement"]), label: <span data-no-i18n>{titleOf("FSM Service Agreement", r["agreement"])} · {money(num(r["annual_value"]))}</span>, value: num(r["booked_h"]), to: rp("RP15", { ...F, agreement: s(r["agreement"]) }) }))} empty={t("No agreement in scope.", "لا اتفاقيات ضمن النطاق.")} />
      </Insight>
      <Insight id="pro-jobs" title={["Completed visits per agreement", "الزيارات المكتملة لكل اتفاقية"]} q={["How much field delivery does each agreement require?", "كم من التنفيذ الميداني تتطلبه كل اتفاقية؟"]}
        meta={M(["FSM Service Agreement", "FSM Job", VISIT_DT], ["One agreement (RP15)", "اتفاقية واحدة (RP15)"], ["Completed visits of the agreement's jobs", "الزيارات المكتملة لأوامر الاتفاقية"], ["RP15 filtered to the agreement", "RP15 مفلتراً بالاتفاقية"])}>
        <Bars items={r15.map((r) => ({ key: s(r["agreement"]), label: <span data-no-i18n>{titleOf("FSM Service Agreement", r["agreement"])}</span>, value: num(r["visits"]), to: rp("RP15", { ...F, agreement: s(r["agreement"]) }) }))} empty={t("No agreement in scope.", "لا اتفاقيات ضمن النطاق.")} />
      </Insight>
    </>,
    kpis: <><K id="K24" F={F} c={c} /><K id="K25" F={F} c={c} /><C c={c} label={["Quoted value", "القيمة المسعّرة"]} value={money(sum(r14, "quoted"))} basis={["Sum of RP14 quoted (not revenue)", "مجموع المسعّر في RP14 (ليس إيراداً)"]} to={rp("RP14", F)} /><C c={c} label={["Contracted annual value", "القيمة السنوية المتعاقدة"]} value={money(sum(r15, "annual_value"))} basis={["Sum of RP15 annual value", "مجموع القيمة السنوية في RP15"]} to={rp("RP15", F)} /></>,
  };
};

