import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * DIGIT FSM + ITM home pages: N01 My work (role-first worklists, not a KPI grid), N02 Executive overview (sourced KPIs
 * with report drill), N03 Operations control (ranked exceptions) and N07 Service sites (portfolio register → Site 360).
 * Every number is computed from permitted records at render time and opens the queue or report it came from.
 */
import { BandTabsHost, WorkPanel, type WorkTab } from "@/components/enterprise/kit/templates";
import { DateInput } from "@/components/form/DateInput";
import { useState, type ReactNode } from "react";
import { BucketBars, DxSplit, ExceptionList, type ExceptionItem } from "@/components/digit/Experience";
import { by, canRead, inScope, list, raw, rows, type Filters } from "../domain/data";
import { addDays, isMissed, OPEN_DEFICIENCY, s, today } from "../domain/rules";
import { FSM_KPIS, kpiValue } from "../analytics/kpis";
import { QUEUES, myTechnician, type QueueDef } from "./queues";
import { AppLink, BAND, DataTable, DocRef, INPUT, Kpi, ListRef, NewDoc, PageHeader, Panel, SignalGrid, StateChip, dateTxt, numTxt, opt, toneOf, useFx, useUrlState } from "./kit";
import { MODE_HINT, MODE_LABEL, useWorkspaceMode } from "./mode";
import type { WorkspaceMode } from "../screens";
import { PageInsights } from "./ov/ded";
import { DispatcherDesk, OpsSignals } from "./opsDesk";
import { TeamDayTimeline } from "./dayBoard";

type Fx = ReturnType<typeof useFx>;
const q = (k: string) => QUEUES.find((x) => x.key === k)!;
const KPI_ICON: Record<string, "alert" | "time" | "doc" | "money" | "count"> = { critical: "alert", overdue: "time", review: "doc", unscheduled: "time", blocked: "alert", "invoice-ready": "money", impairments: "alert", retests: "doc" };

/** One worklist panel: the first rows of a queue with its actions, and a link to the full queue. */
export function Worklist({ def, limit = 5, fx }: { def: QueueDef; limit?: number; fx: Fx }) {
  const data = def.rows({});
  const path = def.my ? `my/${def.key.replace(/^my-/, "")}` : `queue/${def.key}`;
  return (
    <Panel title={<span>{fx.ar ? def.title_ar : def.title} <span className="ms-1 rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground" data-no-i18n>{data.length}</span></span>} subtitle={fx.ar ? def.question_ar : def.question}
      actions={<AppLink to={path}>{fx.t("Open queue", "فتح الطابور")}</AppLink>} attrs={{ "data-worklist": def.key }}>
      <DataTable id={`home-${def.key}`} rows={data.slice(0, limit)} cols={def.cols(fx).slice(0, 4)} searchable={false} empty={fx.t("Nothing waiting.", "لا شيء بالانتظار.")} {...(def.actions ? { actions: (r: Record<string, unknown> & { name?: string }) => def.actions!(r, fx) } : {})} />
    </Panel>
  );
}

/**
 * Several worklists side by side read as one block: the shared Enterprise WorkPanel shows one tab per queue with its count
 * (ONE STANDARD worklist zone, owner 2026-11-13 §2c), the chosen queue's first rows with their actions, and the link to the
 * full queue. A single queue keeps its own panel.
 */
export function WorklistTabs({ defs, limit = 6, fx, id = "fsm-worklists", title }: { defs: QueueDef[]; limit?: number; fx: Fx; id?: string; title?: ReactNode }) {
  const [cur, setCur] = useState("");
  if (!defs.length) return null;
  if (defs.length === 1) return <Worklist def={defs[0]!} fx={fx} limit={limit} />;
  const active = defs.find((d) => d.key === cur) ?? defs[0]!;
  const path = (d: QueueDef) => (d.my ? `my/${d.key.replace(/^my-/, "")}` : `queue/${d.key}`);
  const tabs: WorkTab[] = defs.map((d) => { const data = d.rows({}); return {
    id: d.key, label: fx.ar ? d.title_ar : d.title, count: data.length, attrs: { "data-worklist": d.key },
    content: <DataTable id={`home-${d.key}`} rows={data.slice(0, limit)} cols={d.cols(fx).slice(0, 4)} searchable={false} empty={fx.t("Nothing waiting.", "لا شيء بالانتظار.")} {...(d.actions ? { actions: (r: Record<string, unknown> & { name?: string }) => d.actions!(r, fx) } : {})} />,
  }; });
  return <WorkPanel id={id} title={title ?? fx.t("Worklists", "قوائم العمل")} sub={fx.ar ? active.question_ar : active.question} tabs={tabs} active={active.key} onTab={setCur} height={420}
    actions={<AppLink to={path(active)} className="text-[12.5px] font-medium text-primary hover:underline">{fx.t("Open queue", "فتح الطابور")}</AppLink>} />;
}

/** Role-first sections: each role sees its own work first; managers / administrators see every section. */
const SECTIONS: { role: string; label: string; label_ar: string; queues: string[] }[] = [
  { role: "FSM Technician", label: "Field work", label_ar: "العمل الميداني", queues: ["my-visits", "my-inspections", "my-repairs"] },
  { role: "FSM Dispatcher", label: "Dispatch", label_ar: "الجدولة", queues: ["unscheduled", "acks", "due"] },
  { role: "FSM Reviewer", label: "Technical review", label_ar: "المراجعة الفنية", queues: ["review", "closure", "retests"] },
  { role: "FSM Estimator", label: "Commercial", label_ar: "التجاري", queues: ["to-quote", "decisions", "invoice-ready"] },
  { role: "FSM Manager", label: "Risk & control", label_ar: "المخاطر والرقابة", queues: ["critical", "overdue", "exceptions"] },
];
/** Workspace emphasis (switcher): which worklists each role section shows first, and the section order. "all" = SECTIONS. */
const MODE_SECTIONS: Record<Exclude<WorkspaceMode, "all">, { order: string[]; queues: Record<string, string[]> }> = {
  field: { order: ["FSM Dispatcher", "FSM Technician", "FSM Estimator", "FSM Manager", "FSM Reviewer"], queues: {
    "FSM Technician": ["my-visits", "my-repairs", "workpacks"], "FSM Dispatcher": ["unscheduled", "acks", "blocked"], "FSM Estimator": ["requests", "decisions", "invoice-ready"],
    "FSM Manager": ["overdue", "due", "exceptions"], "FSM Reviewer": ["readiness", "closure"] } },
  itm: { order: ["FSM Reviewer", "FSM Manager", "FSM Technician", "FSM Estimator", "FSM Dispatcher"], queues: {
    "FSM Technician": ["my-inspections", "my-repairs", "evidence"], "FSM Dispatcher": ["retests", "unscheduled", "due"], "FSM Reviewer": ["review", "closure", "retests"],
    "FSM Estimator": ["to-quote", "decisions"], "FSM Manager": ["critical", "impairments", "disputes"] } },
};
export function sectionsFor(mode: WorkspaceMode) {
  if (mode === "all") return SECTIONS;
  const m = MODE_SECTIONS[mode];
  return m.order.map((r) => { const base = SECTIONS.find((x) => x.role === r)!; return { ...base, queues: m.queues[r] ?? base.queues }; });
}

export function HomePage() {
  const fx = useFx(); const { t, ar, has, admin } = fx;
  const mode = useWorkspaceMode();
  const mine = sectionsFor(mode).filter((x) => has(x.role));
  // the chosen role tab belongs to the workspace it was chosen in; switching workspace starts at that workspace's first section
  const [pick, setPick] = useState<[WorkspaceMode, string]>(["all", ""]);
  const setTab = (role: string) => setPick([mode, role]);
  const me = myTechnician();
  const sec = (pick[0] === mode ? mine.find((x) => x.role === pick[1]) : undefined) ?? mine[0];
  const n = (k: string) => q(k).rows({}).length;
  const KPIS: Record<WorkspaceMode, [string, string, string, string, string, "bad" | "warn"][]> = {
    all: [["critical", "Critical open findings", "ملاحظات حرجة مفتوحة", "Open, severity Critical", "مفتوحة بخطورة حرجة", "bad"], ["overdue", "Overdue obligations", "التزامات متأخرة", "Window ended, not fulfilled", "انتهت النافذة دون تنفيذ", "bad"], ["review", "Runs awaiting review", "فحوص بانتظار المراجعة", "Submitted for review", "مقدّمة للمراجعة", "warn"], ["unscheduled", "Unscheduled visits", "زيارات غير مجدولة", "No technician or time yet", "بلا فني أو موعد بعد", "warn"]],
    field: [["unscheduled", "Unscheduled visits", "زيارات غير مجدولة", "No technician or time yet", "بلا فني أو موعد بعد", "warn"], ["overdue", "Overdue obligations", "التزامات متأخرة", "Window ended, not fulfilled", "انتهت النافذة دون تنفيذ", "bad"], ["blocked", "Blocked or incomplete work", "أعمال متعطلة أو غير مكتملة", "Jobs, visits and runs on hold or incomplete", "أوامر وزيارات وفحوص معلّقة أو غير مكتملة", "warn"], ["invoice-ready", "Invoice-ready work", "أعمال جاهزة للفوترة", "Chargeable, approved, not handed off", "قابلة للتحصيل ومعتمدة ولم تُسلَّم", "warn"]],
    itm: [["critical", "Critical open findings", "ملاحظات حرجة مفتوحة", "Open, severity Critical", "مفتوحة بخطورة حرجة", "bad"], ["review", "Runs awaiting review", "فحوص بانتظار المراجعة", "Submitted for review", "مقدّمة للمراجعة", "warn"], ["impairments", "Active impairments", "تعطّلات قائمة", "Systems out of service with an active impairment", "أنظمة خارج الخدمة بتعطّل قائم", "bad"], ["retests", "Retests pending", "إعادات فحص معلّقة", "Repairs waiting for the original check to pass again", "إصلاحات بانتظار نجاح البند الأصلي مجدداً", "warn"]],
  };
  const qPath = (k: string) => (q(k).my ? `my/${k.replace(/^my-/, "")}` : `queue/${k}`);
  const roleTabs = mine.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-1 border-b border-border" role="tablist" aria-label={t("Work by role", "العمل حسب الدور")}>
          {mine.map((x) => <button key={x.role} type="button" role="tab" aria-selected={x.role === sec?.role} onClick={() => setTab(x.role)} data-tab={x.role}
            className={`-mb-px border-b-2 px-3 py-2 text-[13.5px] font-medium max-md:min-h-11 ${x.role === sec?.role ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{ar ? x.label_ar : x.label}</button>)}
        </div>
  ) : null;
  return (
    <BandTabsHost tabs={roleTabs}>
    <div className="w-full min-w-0" data-page="fsm-home" data-mode={mode}>
      <PageHeader title={t("My work", "عملي")} band={{
        question: t("What needs my attention today?", "ما الذي يحتاج انتباهي اليوم؟"),
        basis: <>{t("Worklists for your FSM roles, computed from the records you may read. Each row opens its record; each list opens its full queue.", "قوائم العمل لأدوارك في الخدمة الميدانية، محسوبة من السجلات المسموح لك بقراءتها. كل صف يفتح سجله وكل قائمة تفتح طابورها الكامل.")} {ar ? MODE_HINT[mode][1] : MODE_HINT[mode][0]}</>,
        meta: [{ label: t("Date", "التاريخ"), value: <span data-no-i18n>{dateTxt(today())}</span> }, { label: t("Workspace", "مساحة العمل"), value: ar ? MODE_LABEL[mode][1] : MODE_LABEL[mode][0] }, { label: t("Roles", "الأدوار"), value: admin ? t("All (administrator)", "الكل (مسؤول)") : mine.map((x) => (ar ? x.label_ar : x.label)).join(" · ") || "—" }, ...(me ? [{ label: t("Technician", "الفني"), value: <span data-no-i18n>{s(me["technician_name"])}</span> }] : [])],
        actions: mode === "itm"
          ? <><AppLink to="queue/review" className={BAND.primary}>{t("Review queue", "طابور المراجعة")}</AppLink><AppLink to="queue/critical" className={BAND.secondary}>{t("Critical findings", "الملاحظات الحرجة")}</AppLink></>
          : <><AppLink to="dispatch" className={BAND.primary}>{t("Dispatch board", "لوحة الجدولة")}</AppLink><NewDoc doctype="FSM Service Site" band label={t("New site", "موقع جديد")} /></>,
      }} />
      <PageInsights k="my" blocks={[
        { id: "kpis", title: ["Work signals", "مؤشرات العمل"], node: (
      <SignalGrid cols={4}>
        {KPIS[mode].map(([k, en, a, ben, bar, tone]) => { const v = n(k); return <Kpi key={k} icon={KPI_ICON[k] ?? "count"} label={t(en, a)} value={numTxt(v)} tone={v ? tone : "good"} basis={t(ben, bar)} to={qPath(k)} cta={t("Open queue", "فتح الطابور")} />; })}
      </SignalGrid>
        ) },
        { id: "worklists", title: ["Worklists", "قوائم العمل"], node: (
      !mine.length ? <Panel title={t("No FSM role", "لا يوجد دور في الخدمة الميدانية")}><p className="text-sm text-muted-foreground">{t("Your user has no FSM role. Ask an administrator to assign FSM Manager, Dispatcher, Technician, Reviewer or Estimator.", "لا يملك مستخدمك دوراً في الخدمة الميدانية. اطلب من المسؤول إسناد دور مدير أو مجدول أو فني أو مراجع أو مسعّر.")}</p></Panel>
        : <WorklistTabs key={sec!.role} defs={sec!.queues.map(q)} fx={fx} />
        ) },
        ...(sec?.role === "FSM Dispatcher" ? [{ id: "dispatcher", title: ["Dispatcher desk", "مكتب المجدول"] as [string, string], node: (
      <Panel title={t("Dispatcher desk — queue → record → next step", "مكتب المجدول — الطابور ← السجل ← الخطوة التالية")} subtitle={t("Waiting visits, unacknowledged dispatches and field requests without a job, worst SLA first.", "زيارات منتظرة وإرسالات دون إقرار وطلبات ميدانية بلا أمر عمل، الأقرب لتجاوز المهلة أولاً.")} actions={<AppLink to="dispatch">{t("Dispatch board", "لوحة الجدولة")}</AppLink>}><DispatcherDesk /></Panel>
        ) }] : []),
      ]} />
    </div>
    </BandTabsHost>
  );
}

// ---------------------------------------------------------------- scope controls (URL-backed)
export function ScopeControls({ f, set, fields = ["site", "from", "to"] }: { f: Record<string, string>; set: (p: Record<string, string | undefined>) => void; fields?: string[] }) {
  const { t } = useFx();
  const sites = list("FSM Service Site");
  const lbl = "flex min-w-[9rem] flex-col gap-1 text-[11px] font-medium text-dx-on-band-muted";
  const inp = "min-h-9 rounded-md border border-dx-on-band/25 bg-dx-on-band/10 px-2.5 py-1.5 text-sm text-dx-on-band max-md:min-h-11";
  return (
    <>
      {fields.includes("site") && <label className={lbl}>{t("Site", "الموقع")}<select className={inp} value={f["site"] ?? ""} onChange={(e) => set({ site: e.target.value || undefined })} data-scope="site"><option value="">{t("All sites", "كل المواقع")}</option>{sites.map((x) => <option key={x.name} value={x.name} data-no-i18n>{s(x["site_name"])}</option>)}</select></label>}
      {fields.includes("customer") && <label className={lbl}>{t("Customer", "العميل")}<select className={inp} value={f["customer"] ?? ""} onChange={(e) => set({ customer: e.target.value || undefined })} data-scope="customer"><option value="">{t("All customers", "كل العملاء")}</option>{[...new Set(sites.map((x) => s(x["customer"])))].map((c) => <option key={c} value={c} data-no-i18n>{s(raw("Customer", c)?.["customer_name"]) || c}</option>)}</select></label>}
      {fields.includes("from") && <label className={lbl}>{t("From", "من")}<DateInput className={inp} value={f["from"] ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} data-scope="from" /></label>}
      {fields.includes("to") && <label className={lbl}>{t("To", "إلى")}<DateInput className={inp} value={f["to"] ?? ""} onChange={(e) => set({ to: e.target.value || undefined })} data-scope="to" /></label>}
      {fields.includes("as_of") && <label className={lbl}>{t("As of", "حتى تاريخ")}<DateInput className={inp} value={f["as_of"] ?? ""} onChange={(e) => set({ as_of: e.target.value || undefined })} data-scope="as_of" /></label>}
    </>
  );
}
const qs = (o: Record<string, string | undefined>) => { const p = new URLSearchParams(Object.entries(o).filter(([, v]) => !!v) as [string, string][]).toString(); return p ? `?${p}` : ""; };

export function ExecutivePage() {
  const fx = useFx(); const { t, ar } = fx;
  const [f, set] = useUrlState();
  const scope: Filters = { from: f["from"] ?? "2026-01-01", to: f["to"] ?? "2026-12-31", ...(f["site"] ? { site: f["site"] } : {}) };
  const pick = ["K04", "K07", "K03", "K11", "K16", "K23", "K27", "K24"];
  const sev = list("FSM Deficiency").filter((d) => OPEN_DEFICIENCY.has(s(d["workflow_state"])) && inScope(d, scope));
  const obls = list("FSM Obligation").filter((o) => inScope(o, scope) && s(o["due_date"]) >= (scope.from ?? "") && s(o["due_date"]) <= (scope.to ?? "9999"));
  const obState = ["Fulfilled", "Scheduled", "Due", "Missed", "Waived"].map((k) => ({ key: k, label: opt(k, ar), value: obls.filter((o) => s(o["status"]) === k).length, tone: toneOf(k), wrap: (n: ReactNode) => <AppLink to={`reports/RP08${qs({ ...scope, status: k })}`} className="block rounded hover:bg-muted">{n}</AppLink> }));
  return (
    <div className="w-full min-w-0" data-page="fsm-executive">
      <PageHeader title={t("Executive overview", "النظرة التنفيذية")} crumbs={[]} band={{
        question: t("Are we delivering what we contracted, safely, and is renewal revenue at risk?", "هل ننفذ ما تعاقدنا عليه بأمان، وهل إيراد التجديد معرّض للخطر؟"),
        basis: t("Each card is a K-metric computed from the same permitted rows as its report; open a card to see those rows. Finance contribution needs posted native costs (server).", "كل بطاقة مؤشر K محسوب من نفس صفوف تقريره المسموح بها؛ افتح البطاقة لرؤية الصفوف. مساهمة المالية تتطلب تكاليف أصلية مرحّلة (الخادم)."),
        controls: <ScopeControls f={f} set={set} />, meta: [{ label: t("Period", "الفترة"), value: <span data-no-i18n>{scope.from} → {scope.to}</span> }],
      }} />
      <PageInsights k="management" F={scope} blocks={[
        { id: "kpis", title: ["Delivery, safety and renewal KPIs", "مؤشرات التنفيذ والسلامة والتجديد"], node: (
      <SignalGrid cols={4}>
          {pick.map((id) => { const k = FSM_KPIS.find((x) => x.id === id)!; const v = kpiValue(k, scope);
            return <Kpi key={id} label={`${id} · ${ar ? k.label_ar : k.label}`} value={v === null ? "—" : numTxt(v, k.unit === "h" || k.unit === "d" ? 1 : k.unit === "%" ? 1 : 0)} unit={k.unit === "%" ? "%" : k.unit === "h" ? t("h", "س") : k.unit === "d" ? t("days", "يوم") : undefined}
              tone={v === null ? "neutral" : k.tone ? k.tone(v) : "neutral"} basis={ar ? k.definition_ar : k.definition} to={`reports/${k.report}${qs({ ...scope, ...(k.drill ?? {}), kpi: id })}`} server={k.status === "SERVER_REQUIRED"} />; })}
        </SignalGrid> ) },
        { id: "renewals", title: ["Agreements ending in the next 120 days", "الاتفاقيات المنتهية خلال 120 يوماً"], node: (
      <Panel title={t("Agreements ending in the next 120 days", "الاتفاقيات المنتهية خلال 120 يوماً")} actions={<AppLink to="reports/RP12">{t("Open RP12", "فتح RP12")}</AppLink>}>
          <DataTable id="exec-renewals" rows={q("renewals").rows(scope.site ? { site: scope.site } : {})} cols={q("renewals").cols(fx)} searchable={false} empty={t("No agreement ends in the next 120 days.", "لا اتفاقية تنتهي خلال 120 يوماً.")} actions={(r) => q("renewals").actions!(r, fx)} />
        </Panel> ) },
      ]} />
    </div>
  );
}

export function OperationsPage() {
  const fx = useFx(); const { t } = fx;
  const visits = list(VISIT_DT); const runs = list("FSM Inspection Run");
  const stale = runs.filter((r) => s(r["workflow_state"]) === "Submitted for Review" && s(r["submitted_on"]).slice(0, 10) < addDays(today(), -2)).length;
  const notReady = q("workpacks").rows({}).filter((w) => !w["ready"]).length;
  const items: ExceptionItem[] = [
    { key: "overdue", severity: "bad", count: list("FSM Obligation").filter((o) => s(o["status"]) === "Missed" || isMissed(o)).length, title: t("Obligations past their window", "التزامات تجاوزت نافذتها"), detail: t("Contract delivery at risk — plan catch-up or waive with a reason", "تنفيذ العقد معرّض — خطط للاستدراك أو أعفِ بسبب"), action: <AppLink to="queue/overdue">{t("Open", "فتح")}</AppLink> },
    { key: "critical", severity: "bad", count: q("critical").rows({}).length, title: t("Critical findings open", "ملاحظات حرجة مفتوحة"), detail: t("Life-safety risk until repaired and verified", "خطر على السلامة حتى الإصلاح والتحقق"), action: <AppLink to="queue/critical">{t("Open", "فتح")}</AppLink> },
    { key: "impair", severity: "bad", count: list("FSM Impairment").filter((i) => s(i["status"]) === "Active").length, title: t("Systems impaired", "أنظمة متعطلة"), detail: t("Fire watch / authority notice must be in place", "يجب وجود حراسة حريق / إبلاغ الجهة"), action: <AppLink to="queue/impairments">{t("Open", "فتح")}</AppLink> },
    { key: "unack", severity: "warn", count: q("acks").rows({}).length, title: t("Dispatched visits not acknowledged", "زيارات مرسلة دون إقرار"), action: <AppLink to="queue/acks">{t("Open", "فتح")}</AppLink> },
    { key: "unsched", severity: "warn", count: q("unscheduled").rows({}).length, title: t("Visits without technician or time", "زيارات بلا فني أو موعد"), action: <AppLink to="queue/unscheduled">{t("Open", "فتح")}</AppLink> },
    { key: "blocked", severity: "warn", count: q("blocked").rows({}).length, title: t("Blocked or incomplete work", "أعمال متعطلة أو غير مكتملة"), action: <AppLink to="queue/blocked">{t("Open", "فتح")}</AppLink> },
    { key: "stale", severity: "warn", count: stale, title: t("Runs waiting more than 2 days for review", "فحوص تنتظر المراجعة أكثر من يومين"), action: <AppLink to="queue/review">{t("Open", "فتح")}</AppLink> },
    { key: "ready", severity: "warn", count: notReady, title: t("Upcoming visits not ready (eligibility, access, template, parts)", "زيارات قادمة غير جاهزة (الأهلية، الوصول، القالب، المواد)"), action: <AppLink to="queue/workpacks">{t("Open", "فتح")}</AppLink> },
    { key: "exc", severity: "info", count: q("exceptions").rows({}).length, title: t("Open data & integration exceptions", "استثناءات بيانات وتكامل مفتوحة"), action: <AppLink to="queue/exceptions">{t("Open", "فتح")}</AppLink> },
  ];
  return (
    <div className="w-full min-w-0" data-page="fsm-operations">
      <PageHeader title={t("Operations control", "مركز التحكم بالعمليات")} band={{
        question: t("What is going wrong in operations right now, worst first?", "ما الذي يسير بشكل خاطئ في العمليات الآن، الأسوأ أولاً؟"),
        basis: t("Ranked exceptions computed from obligations, visits, runs, findings, impairments and exceptions you may read. Each line opens the queue that resolves it.", "استثناءات مرتبة محسوبة من الالتزامات والزيارات والفحوص والملاحظات والتعطلات والاستثناءات المسموح بها. كل سطر يفتح الطابور الذي يعالجه."),
        actions: <AppLink to="reports/RP09" className={BAND.secondary}>{t("Overdue report (RP09)", "تقرير المتأخر (RP09)")}</AppLink>,
      }} />
      <OpsSignals />
      <PageInsights k="control" blocks={[
        { id: "desk", title: ["Dispatcher desk", "مكتب المجدول"], node: (
      <Panel title={t("Dispatcher desk — queue → record → next step", "مكتب المجدول — الطابور ← السجل ← الخطوة التالية")} subtitle={t("Waiting visits, unacknowledged dispatches and field requests without a job, worst SLA first.", "زيارات منتظرة وإرسالات دون إقرار وطلبات ميدانية بلا أمر عمل، الأقرب لتجاوز المهلة أولاً.")} actions={<AppLink to="dispatch">{t("Dispatch board", "لوحة الجدولة")}</AppLink>}><DispatcherDesk /></Panel>
        ) },
        { id: "timeline", title: ["Team day timeline", "الجدول الزمني للفريق"], node: (
      <Panel title={t("Today per technician — planned vs actual", "اليوم لكل فني — المخطط مقابل الفعلي")} subtitle={t("Block = booking (colour by job type); bar under it = actual check-in → check-out, amber when late.", "الكتلة = الحجز (اللون حسب نوع العمل)؛ الشريط تحتها = الوصول ← المغادرة فعلياً، كهرماني عند التأخر.")} actions={<AppLink to="dispatch">{t("Dispatch board", "لوحة الجدولة")}</AppLink>} flush={false}><TeamDayTimeline /></Panel>
        ) },
        { id: "exceptions", title: ["Exceptions", "الاستثناءات"], node: (
      <Panel title={t("Exceptions", "الاستثناءات")}><div data-fsm-chart="exceptions" /><ExceptionList items={items} empty={t("No open exceptions.", "لا استثناءات مفتوحة.")} severityLabel={(x) => (x === "bad" ? t("Critical", "حرج") : x === "warn" ? t("Attention", "انتباه") : t("Info", "معلومة"))} /></Panel>
        ) },
        { id: "today", title: ["Today's visits", "زيارات اليوم"], node: (
      <Panel title={t("Today's visits", "زيارات اليوم")} actions={<AppLink to="dispatch">{t("Dispatch board", "لوحة الجدولة")}</AppLink>}><div data-fsm-chart="table" />
        <DataTable id="ops-today" rows={visits.filter((v) => s(v["scheduled_start"]).slice(0, 10) === today())} searchable={false} empty={t("No visits scheduled today.", "لا زيارات مجدولة اليوم.")}
          cols={[{ key: "name", label: t("Visit", "الزيارة"), render: (r) => <DocRef doctype={VISIT_DT} name={r.name} /> }, { key: "site", label: t("Site", "الموقع"), render: (r) => <DocRef doctype="FSM Service Site" name={r["site"]} title /> }, { key: "technician", label: t("Technician", "الفني"), render: (r) => <DocRef doctype="FSM Technician" name={r["technician"]} title form /> }, { key: "workflow_state", label: t("Status", "الحالة"), render: (r) => <StateChip value={r["workflow_state"]} /> }, { key: "access_outcome", label: t("Access", "الوصول"), render: (r) => <StateChip value={r["access_outcome"]} /> }]} />
      </Panel>
        ) },
      ]} />
    </div>
  );
}

/**
 * N07 Sites portfolio (owner correction 2026-10-21): one row per service site with its linked documents — Customer, Site
 * 360, active Devices, open Jobs, Visits still to happen, Inspection runs and open Deficiencies — each count opening exactly
 * those records (filtered native list or Visits portfolio), plus a linked-documents panel for the sites shown.
 */
const CLOSED_JOBS = ["Completed", "Closed", "Cancelled"];
const OPEN_VISIT_ST = ["Unscheduled", "Planned", "Dispatched", "On Site"];
export function SitesPage() {
  const fx = useFx(); const { t } = fx;
  const [f, set] = useUrlState();
  const systems = by(list("FSM Service System"), "site"); const devices = by(list("FSM Device").filter((d) => s(d["lifecycle"]) === "Active"), "site");
  const defs = by(list("FSM Deficiency").filter((d) => OPEN_DEFICIENCY.has(s(d["workflow_state"]))), "site"); const ags = by(list("FSM Service Agreement").filter((a) => s(a["workflow_state"]) === "Active"), "site");
  const obls = by(list("FSM Obligation").filter((o) => ["Due", "Scheduled"].includes(s(o["status"]))), "site");
  const jobs = by(list("FSM Job").filter((j) => !CLOSED_JOBS.includes(s(j["workflow_state"]))), "site");
  const visits = by(list(VISIT_DT).filter((v) => OPEN_VISIT_ST.includes(s(v["workflow_state"]))), "site");
  const runs = by(list("FSM Inspection Run"), "site");
  const n = (m: Map<string, unknown[]>, k: string) => (m.get(k) ?? []).length;
  const data = list("FSM Service Site").filter((x) => inScope(x, f) && (!f["site"] || x.name === f["site"])).map((x): Record<string, unknown> & { name: string } => ({ ...(x as Record<string, unknown>), name: x.name, systems: n(systems, x.name), devices: n(devices, x.name), open_findings: n(defs, x.name), critical: (defs.get(x.name) ?? []).filter((d) => s(d["severity"]) === "Critical").length,
    jobs: n(jobs, x.name), visits: n(visits, x.name), runs: n(runs, x.name),
    agreement: (ags.get(x.name) ?? [])[0]?.name ?? "", next_due: (obls.get(x.name) ?? []).map((o) => s(o["due_date"])).sort()[0] ?? "" }));
  const ids = data.map((x) => x.name); const custs = [...new Set(data.map((x) => s(x["customer"])).filter(Boolean))];
  const cnt = (v: unknown, doctype: string, filters: [string, string, unknown][], cls = "") => { const k = Number(v) || 0;
    return k ? <ListRef doctype={doctype} filters={filters.map(([, a, b]) => [doctype, a, b] as [string, string, unknown])} className={`tabular-nums text-primary hover:underline ${cls}`}><span data-no-i18n>{numTxt(k)}</span></ListRef> : <span className="tabular-nums text-muted-foreground" data-no-i18n>0</span>; };
  const linked: { dt: string; label: [string, string]; count: number; filters?: [string, string, unknown][]; to?: string }[] = [
    { dt: "Customer", label: ["Customers", "العملاء"], count: custs.length, filters: [["Customer", "name", ["in", custs]]] },
    { dt: "FSM Service Site", label: ["Service sites", "مواقع الخدمة"], count: ids.length, filters: [["FSM Service Site", "name", ["in", ids]]] },
    { dt: "FSM Device", label: ["Active devices", "الأجهزة النشطة"], count: ids.reduce((a, k) => a + n(devices, k), 0), filters: [["FSM Device", "site", ["in", ids]], ["FSM Device", "lifecycle", "Active"]] },
    { dt: "FSM Job", label: ["Open service jobs", "أوامر العمل المفتوحة"], count: ids.reduce((a, k) => a + n(jobs, k), 0), filters: [["FSM Job", "site", ["in", ids]], ["FSM Job", "workflow_state", ["not in", CLOSED_JOBS]]] },
    { dt: VISIT_DT, label: ["Visits still to happen", "الزيارات المتبقية"], count: ids.reduce((a, k) => a + n(visits, k), 0), filters: [[VISIT_DT, "site", ["in", ids]], [VISIT_DT, "workflow_state", ["in", OPEN_VISIT_ST]]] },
    { dt: "FSM Inspection Run", label: ["Inspection runs", "جولات الفحص"], count: ids.reduce((a, k) => a + n(runs, k), 0), filters: [["FSM Inspection Run", "site", ["in", ids]]] },
    { dt: "FSM Deficiency", label: ["Open deficiencies", "الملاحظات المفتوحة"], count: ids.reduce((a, k) => a + n(defs, k), 0), filters: [["FSM Deficiency", "site", ["in", ids]], ["FSM Deficiency", "workflow_state", ["in", [...OPEN_DEFICIENCY]]]] },
  ];
  return (
    <div className="w-full min-w-0" data-page="fsm-sites">
      <PageHeader title={t("Service sites", "مواقع الخدمة")} band={{
        question: t("Which sites do we serve, what do they hold, and where is the risk?", "ما المواقع التي نخدمها، وماذا تحتوي، وأين الخطر؟"),
        basis: t("One row per service site (native customer linked) with its linked customer, devices, jobs, visits, inspections and deficiencies. Counts are permitted records; each count opens exactly those records, and a site opens its 360 view.", "صف لكل موقع خدمة (مرتبط بعميل أصلي) مع العميل والأجهزة وأوامر العمل والزيارات والفحوص والملاحظات المرتبطة. الأعداد من السجلات المسموح بها؛ كل عدد يفتح تلك السجلات بالضبط، والموقع يفتح عرض 360."),
        controls: <ScopeControls f={f} set={set} fields={["customer"]} />, meta: [{ label: t("Sites", "المواقع"), value: <span data-no-i18n>{data.length}</span> }],
        actions: <NewDoc doctype="FSM Service Site" band label={t("New site", "موقع جديد")} />,
      }} />
      <PageInsights k="sites" blocks={[
        { id: "sites", title: ["Sites", "المواقع"], node: (
      <Panel title={t("Sites", "المواقع")} flush={false}>
        <DataTable id="sites" rows={data} empty={t("No service sites yet — create the first one.", "لا مواقع خدمة بعد — أنشئ أول موقع.")} cols={[
          { key: "site_name", label: t("Site", "الموقع"), value: (r) => s(r["site_name"]), render: (r) => <DocRef doctype="FSM Service Site" name={r.name} title /> },
          { key: "customer", label: t("Customer", "العميل"), value: (r) => s(r["customer"]), render: (r) => <DocRef doctype="Customer" name={r["customer"]} title form /> },
          { key: "city", label: t("City", "المدينة"), value: (r) => s(r["city"]) },
          { key: "systems", label: t("Systems", "الأنظمة"), numeric: true, value: (r) => Number(r["systems"]), render: (r) => cnt(r["systems"], "FSM Service System", [["", "site", r.name]]) },
          { key: "devices", label: t("Active devices", "الأجهزة النشطة"), numeric: true, value: (r) => Number(r["devices"]), render: (r) => cnt(r["devices"], "FSM Device", [["", "site", r.name], ["", "lifecycle", "Active"]]) },
          { key: "jobs", label: t("Open jobs", "أوامر مفتوحة"), numeric: true, value: (r) => Number(r["jobs"]), render: (r) => cnt(r["jobs"], "FSM Job", [["", "site", r.name], ["", "workflow_state", ["not in", CLOSED_JOBS]]]) },
          { key: "visits", label: t("Visits to come", "زيارات متبقية"), numeric: true, value: (r) => Number(r["visits"]), render: (r) => Number(r["visits"]) ? <AppLink to={`visits?site=${encodeURIComponent(r.name)}`} className="tabular-nums text-primary hover:underline"><span data-no-i18n>{numTxt(r["visits"])}</span></AppLink> : <span className="tabular-nums text-muted-foreground" data-no-i18n>0</span> },
          { key: "runs", label: t("Inspections", "الفحوص"), numeric: true, value: (r) => Number(r["runs"]), render: (r) => cnt(r["runs"], "FSM Inspection Run", [["", "site", r.name]]) },
          { key: "open_findings", label: t("Open findings", "ملاحظات مفتوحة"), numeric: true, value: (r) => Number(r["open_findings"]), render: (r) => <span className={Number(r["critical"]) ? "font-semibold text-dx-bad" : ""}>{cnt(r["open_findings"], "FSM Deficiency", [["", "site", r.name], ["", "workflow_state", ["in", [...OPEN_DEFICIENCY]]]], Number(r["critical"]) ? "text-dx-bad" : "")}{Number(r["critical"]) ? <span data-no-i18n>{` (${numTxt(r["critical"])}!)`}</span> : null}</span> },
          { key: "agreement", label: t("Active agreement", "الاتفاقية النشطة"), value: (r) => s(r["agreement"]), render: (r) => <DocRef doctype="FSM Service Agreement" name={r["agreement"]} /> },
          { key: "next_due", label: t("Next due", "الاستحقاق التالي"), value: (r) => s(r["next_due"]), render: (r) => <span data-no-i18n>{dateTxt(r["next_due"])}</span> },
        ]} />
      </Panel>
        ) },
        { id: "linked", title: ["Linked documents", "المستندات المرتبطة"], node: (
      <Panel title={t("Linked documents", "المستندات المرتبطة")} subtitle={t("For the sites shown above; records you may read, each opening its filtered list", "للمواقع المعروضة أعلاه؛ السجلات المسموح بقراءتها، كل منها يفتح قائمته المفلترة")} attrs={{ "data-site-links": "" }}>
        <ul className="grid gap-1.5 text-sm sm:grid-cols-2 xl:grid-cols-4">{linked.map((x) => { const ok = canRead(x.dt); return (
          <li key={x.dt} className="flex items-center justify-between gap-3 rounded border border-border/70 px-3 py-2 hover:bg-muted" data-site-link={x.dt}>
            {ok && x.count ? <ListRef doctype={x.dt} filters={x.filters} className="min-w-0 truncate text-primary hover:underline">{t(...x.label)}</ListRef> : <span className="min-w-0 truncate">{t(...x.label)}</span>}
            <span className="tabular-nums text-muted-foreground" data-no-i18n>{ok ? numTxt(x.count) : t("Restricted", "مقيّد")}</span>
          </li>); })}</ul>
        <p className="mt-2 text-[11.5px] text-muted-foreground">{t("Customer, Site and Job link to native and FSM records; visits and inspection runs are joined on their site, deficiencies on the site of the finding.", "العميل والموقع وأمر العمل روابط لسجلات أصلية وسجلات الخدمة؛ الزيارات وجولات الفحص مربوطة بموقعها، والملاحظات بموقع الملاحظة.")}</p>
      </Panel>
        ) },
      ]} />
    </div>
  );
}
export { INPUT, rows };
