/**
 * Module 07 — Governance Console (Premium V2). Hero (8/12): configuration readiness by domain (status bars over the
 * check-based setup review) and the findings list with rule, source, evidence and next action (URL `area`).
 * Side (4/12): governance panel — access & privacy review, workflows, templates, integration errors, administrative
 * exceptions and when the review was evaluated. Lower (URL `view`): checks register / configuration library /
 * integration log. Findings are review evidence, not a compliance verdict; nothing writes configuration from here.
 */
import { useEffect, useState } from "react";
import { DevOnly } from "@/components/DevOnly";
import { Link, useRouterState } from "@tanstack/react-router";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { t as tr, tLabel } from "@/i18n";

/** ONE STANDARD R5: a check's source is shown as its document names (field paths stay in the technical evidence). */
const sourceNames = (src: string, ar: boolean) => [...new Set(src.split(/\s*(?:[+,;·|/→←×]|\band\b|\bor\b|\bvia\b)\s*/).map((x) => x.replace(/\(.*?\)/g, "").replace(/\.[a-z_][\w.]*.*$/, "").trim()).filter((x) => /^[A-Z][A-Za-z ]+$/.test(x)))].map((x) => (ar ? tLabel(x) : x)).join(" · ") || "—";
import { Native, Chip, WorkTable, useSources, SourceNotice, SourceMark, stateText, isReady, s, live, type SourceRead, type Sources } from "./shared";
import { isHrAdmin } from "@/plugins/digit_hr/compat/employeeIdentity";
import { useModuleScope } from "@/components/digithr/ModuleScope";
import { setupChecks, type SetupCheck, type CheckStatus } from "@/plugins/digit_hr/setupChecks";
import { ClearScope, CompanyScope, HrCommandHeader, HrContextToolbar, HrEmptyOrBlockedState, HrInsightPanel, HrPriorityQueue, HrTabs, HrWorkspaceGrid, ModuleLinks, Pill, ScopeDenied, SourcesPill, useSearchPatch, useToday, type QueueGroup, type Tone } from "../home/kit";

type Tx = (ar: string, en: string) => string;
const CHECK_AREAS = [
  { id: "calendar", ar: "التقويم والعطلات", en: "Calendar & holidays" }, { id: "leave", ar: "الإجازات", en: "Leave" }, { id: "approval", ar: "الاعتمادات", en: "Approvals" },
  { id: "payroll", ar: "الرواتب", en: "Payroll" }, { id: "identity", ar: "الهوية والخدمة الذاتية", en: "Identity & self-service" }, { id: "organization", ar: "الهيكل", en: "Organization" }, { id: "shift", ar: "الورديات", en: "Shifts" },
];
const STATUS: Record<CheckStatus, [string, string, "neutral" | "warn" | "danger" | undefined]> = {
  PASS: ["لا ملاحظات", "No finding", undefined], FINDING: ["ملاحظة", "Finding", "warn"], INFO: ["للعلم", "Info", "neutral"], NOT_EVALUATED: ["لم يُقيَّم", "Not evaluated", "neutral"],
};
const BAR: Record<CheckStatus, string> = { FINDING: "var(--dhr-warn)", NOT_EVALUATED: "var(--dhr-border)", INFO: "var(--dhr-info)", PASS: "var(--dhr-success)" };
const ORDER: CheckStatus[] = ["FINDING", "NOT_EVALUATED", "INFO", "PASS"];
/** Company-linked sources narrowed by the module company scope; configuration masters without a company field stay whole. */
const CO_SCOPED = new Set(["Employee", "Leave Allocation", "Leave Application", "Expense Claim", "Salary Structure Assignment", "Department", "Shift Assignment", "Salary Structure"]);
const CHECK_SOURCES = ["Employee", "Company", "Holiday List", "Leave Allocation", "Leave Application", "Expense Claim", "Salary Structure Assignment", "Department", "Shift Assignment"];
const CFG_GROUPS = [
  { id: "settings", ar: "إعدادات", en: "Settings" }, { id: "policy", ar: "سياسات", en: "Policies" }, { id: "workflow", ar: "سير العمل", en: "Workflow" },
  { id: "comms", ar: "قوالب وإشعارات", en: "Templates & notifications" }, { id: "access", ar: "الأدوار والصلاحيات", en: "Roles & permissions" },
];
const SETUP_LINKS: { dt: string; ar: string; en: string }[] = [
  { dt: "HR Settings", ar: "إعدادات الموارد البشرية", en: "HR Settings" }, { dt: "Leave Type", ar: "أنواع الإجازات", en: "Leave types" },
  { dt: "Leave Policy", ar: "سياسات الإجازات", en: "Leave policies" }, { dt: "Shift Type", ar: "أنواع الورديات", en: "Shift types" },
  { dt: "Salary Structure", ar: "هياكل الرواتب", en: "Salary structures" }, { dt: "Workflow", ar: "سير العمل", en: "Workflows" },
  { dt: "Notification", ar: "قوالب الإشعارات", en: "Notification templates" }, { dt: "Print Format", ar: "قوالب الطباعة", en: "Print formats" },
  { dt: "Role", ar: "الأدوار", en: "Roles" }, { dt: "User Permission", ar: "صلاحيات المستخدمين", en: "User permissions" },
];
const AREA: Record<string, string> = { "HR Settings": "settings", "Leave Type": "policy", "Leave Policy": "policy", "Shift Type": "policy", "Salary Structure": "policy", Workflow: "workflow", Notification: "comms", "Print Format": "comms", Role: "access", "User Permission": "access" };
type Cfg = { dt: string; ar: string; en: string; area: string; count: number; read: SourceRead };
type View = "checks" | "library" | "integrations";

export function GovernanceWorkspace({ home = false }: { home?: boolean }) {
  const { tx } = useTx();
  useStoreVersion(); useSessionUser();
  useScopeMetas(["HR Settings", "Leave Type", "Leave Policy", "Shift Type", "Salary Structure", "Workflow", "Notification", "Print Format", "Role", "User Permission", "DIGIT Integration Log", "DIGIT Saudi Rule Set", "DIGIT Employment Contract", ...CHECK_SOURCES]);
  const src = useSources(tx);
  const scope = useModuleScope(src);
  const admin = isHrAdmin();
  const today = useToday();
  const patch = useSearchPatch();
  const search = useRouterState({ select: (st) => st.location.search }) as Record<string, unknown>;
  const area = typeof search["area"] === "string" && CHECK_AREAS.some((a) => a.id === search["area"]) ? (search["area"] as string) : "";
  const view: View = search["view"] === "library" || search["view"] === "integrations" ? (search["view"] as View) : "checks";
  const [evaluatedAt, setEvaluatedAt] = useState("");
  useEffect(() => { setEvaluatedAt(new Date().toTimeString().slice(0, 5)); }, []);

  const workflows = src.rows("Workflow").filter(live);
  const hrWorkflows = workflows.filter((w) => /leave|attendance|shift|expense|employee|appraisal|offer|onboard|separation|hr/i.test(s(w.document_type)));
  const logs = src.rows("DIGIT Integration Log").filter(live);
  const failedLogs = logs.filter((l) => ["Failed", "Error"].includes(s(l.log_status)));
  const rules = src.rows("DIGIT Saudi Rule Set").filter(live);
  const draftRules = rules.filter((r) => s(r.rule_status) === "Draft");
  const contracts = src.rows("DIGIT Employment Contract").filter((c) => s(c.contract_status) === "Draft");
  // Each setup area keeps its explicit source state: an area that is loading, denied, unavailable or failed is "not evaluated", never healthy.
  const cfg: Cfg[] = SETUP_LINKS.filter((l) => admin || AREA[l.dt] !== "access").map((l) => { const read = src.read(l.dt); return { ...l, area: AREA[l.dt] ?? "settings", read, count: isReady(read) ? read.rows.length : -1 }; }).filter((r) => r.read.state !== "DENIED");
  const evaluated = cfg.filter((r) => r.count >= 0);
  const unevaluated = cfg.filter((r) => r.count < 0);

  const checks = setupChecks({
    today: today || new Date().toISOString().slice(0, 10), fullScope: admin,
    // Existence only (no content) so a link to a record hidden from the reader is not reported as broken.
    exists: (dt, name) => !!adapter.get(dt, name),
    rows: (dt) => {
      if (!scope.companyKnown || !src.ready(dt)) return null;
      const r = src.rows(dt);
      if (dt === "Company") return scope.company ? r.filter((x) => s(x.name) === scope.company) : r;
      return CO_SCOPED.has(dt) ? scope.filter(r) : r;
    },
  });
  const count = (st: CheckStatus, rows: SetupCheck[] = checks) => rows.filter((c) => c.status === st).length;
  const listed = checks.filter((c) => c.status !== "PASS" && (!area || c.area === area));
  const G: (QueueGroup & { id: CheckStatus })[] = [{ id: "FINDING", ar: "ملاحظات", en: "Findings", tone: "warn" }, { id: "NOT_EVALUATED", ar: "لم تُقيَّم", en: "Not evaluated" }, { id: "INFO", ar: "للعلم", en: "For information", tone: "info" }];
  const exceptions = draftRules.length + contracts.length + failedLogs.length;

  return (
    <div className="space-y-4" data-module-home="07">
      <HrCommandHeader embedded={!home} id="07" code="07" suite={tx("الإعدادات والحوكمة", "Administration & Governance")} title={tx("وحدة الحوكمة", "Governance Console")}
        purpose={tx("جاهزية الإعداد وملاحظاته من سجلات الإعداد — دليل مراجعة وليس حكم امتثال.", "Configuration readiness and findings from setup records — review evidence, not a compliance verdict.")}
        actions={<><Native dt="HR Settings" module="07" className="dhr-act">{tx("إعدادات الموارد البشرية", "HR Settings")}</Native><ModuleLinks module="07" tx={tx} /></>}>
        <HrContextToolbar tx={tx} active={scope.company ? 1 : 0} scopeKey={scope.company} end={<><SourcesPill src={src} /><Pill tone="warn" title={tx("صلاحيات محاكاة داخل النطاق فقط — لا تُعدّ إثباتًا لصلاحيات DIGIT الحقيقية على الخادم.", "Simulated in-scope permissions only — not proof of real DIGIT server ACL.")}>{tx("صلاحيات محاكاة", "Simulated permissions")}</Pill><ClearScope scope={scope} tx={tx} /></>}>
          <CompanyScope scope={scope} tx={tx} />
        </HrContextToolbar>
      </HrCommandHeader>
      <ScopeDenied scope={scope} tx={tx} />
      <SourceNotice src={src} quietLoading />

      <HrWorkspaceGrid split="8/4"
        main={<>
          <HrInsightPanel title={tx("جاهزية الإعداد حسب المجال", "Configuration readiness by domain")} data-setup-checks={checks.length}
            meta={<><b className="dhr-tnum" data-no-i18n>{checks.length}</b> {tx("فحصًا قائمًا على القواعد · اضغط مجالًا لتصفية الملاحظات", "rule-based checks · select a domain to filter findings")}</>}
            info={tx("كل فحص يذكر قاعدته ومصدره وأثره. «لم يُقيَّم» = مصدر غير مقروء أو رؤية مقيّدة — ولا يعني سليمًا. لا يُكتب أي إعداد من هنا.", "Each check names its rule, source and consequence. \"Not evaluated\" = an unreadable source or a limited view — never healthy. Nothing is written from here.")}
            toolbar={<div className="flex flex-wrap items-center gap-2 text-[12.5px]" data-check-summary>{ORDER.map((st) => <span key={st} className="dhr-legend dhr-pill"><i style={{ background: BAR[st] }} aria-hidden />{tx(STATUS[st][0], STATUS[st][1])} <b className="dhr-tnum" data-no-i18n data-check-count={st}>{count(st)}</b></span>)}</div>}>
            <div className="grid gap-0.5" role="group" aria-label={tx("مجالات الإعداد", "Setup domains")}>
              {CHECK_AREAS.map((a) => { const rows = checks.filter((c) => c.area === a.id); const n = Math.max(1, rows.length); return (
                <button key={a.id} type="button" className="dhr-hbar" aria-pressed={area === a.id} onClick={() => patch({ area: area === a.id ? "" : a.id }, true)} data-check-area={a.id}>
                  <span className="truncate">{tx(a.ar, a.en)}</span>
                  <span className="dhr-stack h-3.5" role="img" aria-label={ORDER.map((st) => `${tx(STATUS[st][0], STATUS[st][1])} ${count(st, rows)}`).join(" · ")}>{ORDER.map((st) => count(st, rows) ? <span key={st} style={{ width: `${(count(st, rows) / n) * 100}%`, background: BAR[st] }} /> : null)}</span>
                  <span className="dhr-tnum text-end" data-no-i18n>{count("FINDING", rows) ? <b className="text-[var(--dhr-warn-text)]">{count("FINDING", rows)}</b> : <span className="text-[var(--dhr-muted)]">0</span>}<span className="text-[11px] text-[var(--dhr-muted)]">/{rows.length}</span></span>
                </button>); })}
            </div>
            <p className="mt-2 text-[11px] text-[var(--dhr-muted)]">{tx("العمود الأخير: ملاحظات / عدد الفحوص. اضغط مجالًا لتصفية القائمة.", "Last column: findings / checks. Click a domain to filter the list.")}</p>
          </HrInsightPanel>
          <HrInsightPanel title={area ? <>{tx("ملاحظات المجال", "Domain findings")} · {tx(CHECK_AREAS.find((a) => a.id === area)!.ar, CHECK_AREAS.find((a) => a.id === area)!.en)}</> : tx("الملاحظات والإجراء التالي", "Findings & next action")} flush data-findings-list={listed.length}
            actions={area ? <button type="button" className="dhr-act dhr-act-ghost" onClick={() => patch({ area: "" }, true)}>{tx("كل المجالات", "All domains")}</button> : undefined}
            meta={<><b className="dhr-tnum" data-no-i18n>{count("PASS", area ? checks.filter((c) => c.area === area) : checks)}</b> {tx("فحص بلا ملاحظات (في السجل أدناه)", "checks with no finding (in the register below)")}</>}>
            <HrPriorityQueue<SetupCheck> label={tx("ملاحظات الإعداد", "Setup findings")} tx={tx} items={listed} groups={G} groupOf={(c) => c.status} keyOf={(c) => c.id} toneOf={(c): Tone | undefined => c.status === "FINDING" ? "warn" : c.status === "INFO" ? "info" : undefined} maxHeight="560px"
              empty={<div className="p-4"><HrEmptyOrBlockedState tx={tx} title={tx("لا ملاحظات أو فحوص غير مقيّمة هنا.", "No findings or unevaluated checks here.")} body={tx("لا يُعدّ ذلك حكم امتثال.", "This is not a compliance verdict.")} /></div>}
              render={(c) => (
                <div className="grid gap-1" data-check={c.id} data-check-status={c.status}>
                  <div className="flex items-start justify-between gap-2"><span className="min-w-0"><span className="block text-[13px] font-semibold">{tx(c.ar, c.en)}</span><span className="block text-[12px] text-[var(--dhr-muted)]">{tx(c.ruleAr, c.ruleEn)}</span></span><Chip tone={STATUS[c.status][2]}>{tx(STATUS[c.status][0], STATUS[c.status][1])}</Chip></div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[var(--dhr-muted)]">
                    {/* NB1-05/UX-10: "what is missing" stays visible; the technical DocType.field rule sits behind a disclosure. */}
                    <span className="text-[11px] text-[var(--dhr-muted)]" data-check-source data-no-i18n>{sourceNames(c.source, tx("ar", "en") === "ar")}</span><DevOnly><details className="dhr-tech min-w-0" data-tech-evidence><summary className="cursor-pointer select-none">{tx("الدليل التقني", "Technical evidence")}</summary><bdi dir="ltr" className="dhr-code block break-all text-[11px]" data-no-i18n>{c.source}</bdi></details></DevOnly>
                    {c.status === "NOT_EVALUATED"
                      ? <span>{c.missing.length ? c.missing.map((dt) => <span key={dt} className="me-2 inline-flex items-center gap-1"><span data-no-i18n>{tr(dt)}</span><SourceMark read={src.read(dt)} tx={tx} /></span>) : tx(c.reasonAr ?? "", c.reasonEn ?? "")}</span>
                      : c.evidence.names.length ? <Native dt={c.evidence.doctype} module="07" filters={[["name", "in", c.evidence.names]]} className="dhr-act"><b className="dhr-tnum" data-no-i18n>{c.evidence.names.length}</b> · {tr(c.evidence.doctype)}</Native>
                      : <Native dt={c.evidence.doctype} module="07" className="dhr-act">{tx("مراجعة", "Review")}</Native>}
                  </div>
                </div>
              )} />
          </HrInsightPanel>
        </>}
        side={<>
          <HrInsightPanel title={tx("لوحة الحوكمة", "Governance panel")} flush meta={evaluatedAt ? <span data-no-i18n>{tx("قُيّم عند فتح الصفحة", "Evaluated on page load")} · {today} {evaluatedAt}</span> : undefined} data-governance-panel>
            <ul className="divide-y divide-[var(--dhr-sep)] text-[13px]">
              <GovRow title={tx("مراجعة الصلاحيات والخصوصية", "Access & privacy review")} sub={tx("قراءة فقط · للمسؤول", "Read-only · admin")} value={admin ? src.v(src.rows("Role").length, "Role") : <span className="text-[11.5px] text-[var(--dhr-muted)]">{tx("للمسؤول فقط", "Admin only")}</span>} label={tx("أدوار", "roles")} to={<Link to="/digit-hr/s/$section" params={{ section: "07.2" }} className="dhr-act dhr-act-ghost">{tx("فتح", "Open")}</Link>} />
              <GovRow title={tx("سير عمل الموارد البشرية", "HR workflows")} sub={tx("على مستندات الموارد البشرية", "On HR documents")} value={src.v(hrWorkflows.length, "Workflow")} to={<Native dt="Workflow" module="07" className="dhr-act dhr-act-ghost">{tx("فتح", "Open")}</Native>} />
              <GovRow title={tx("القوالب والإشعارات", "Templates & notifications")} sub={tx("إشعارات · قوالب طباعة", "Notifications · print formats")} value={<span title={tx("إشعارات · قوالب طباعة", "Notifications · print formats")}>{src.v(src.rows("Notification").length, "Notification")}<span className="text-[var(--dhr-muted)]"> · </span>{src.v(src.rows("Print Format").length, "Print Format")}</span>} to={<Link to="/digit-hr/s/$section" params={{ section: "07.3" }} className="dhr-act dhr-act-ghost">{tx("فتح", "Open")}</Link>} />
              <GovRow title={tx("أخطاء التكامل", "Integration errors")} sub={tx("أحداث فاشلة مسجلة", "Recorded failed events")} value={src.v(failedLogs.length, "DIGIT Integration Log")} tone={failedLogs.length ? "danger" : undefined} to={<Link to="/digit-hr/s/$section" params={{ section: "07.4" }} className="dhr-act dhr-act-ghost">{tx("فتح", "Open")}</Link>} />
              <GovRow title={tx("استثناءات إدارية", "Administrative exceptions")} sub={tx("قواعد وعقود مسودة · فشل تكامل", "Draft rules & contracts · failed integrations")} value={src.v(exceptions, "DIGIT Saudi Rule Set", "DIGIT Employment Contract", "DIGIT Integration Log")} tone={exceptions ? "warn" : undefined} />
            </ul>
            {src.ready("DIGIT Integration Log") && !failedLogs.length && <p className="border-t border-[var(--dhr-sep)] px-4 py-2 text-[11px] text-[var(--dhr-muted)]">{tx("لا أحداث فاشلة مسجلة — هذا لا يعني أن التكاملات سليمة؛ لا اتصال فعلي بأنظمة خارجية في المعاينة.", "No failed events recorded — this does not mean integrations are healthy; there is no live external connectivity in the preview.")}</p>}
          </HrInsightPanel>
          <HrInsightPanel title={tx("الاستثناءات المفتوحة", "Open exceptions")} flush data-admin-exceptions={exceptions}>
            {exceptions ? <ul className="divide-y divide-[var(--dhr-sep)]">
              {draftRules.slice(0, 4).map((d) => <li key={s(d.name)} className="flex min-h-10 items-center justify-between gap-2 px-4 py-1.5"><Native dt="DIGIT Saudi Rule Set" name={s(d.name)} module="07" className="dhr-link min-w-0 truncate text-[13px]"><span data-no-i18n>{s(d.rule_area) || s(d.name)}</span></Native><Chip tone="warn">{tx("قاعدة مسودة", "Draft rule")}</Chip></li>)}
              {contracts.slice(0, 4).map((d) => <li key={s(d.name)} className="flex min-h-10 items-center justify-between gap-2 px-4 py-1.5"><Native dt="DIGIT Employment Contract" name={s(d.name)} module="07" className="dhr-link min-w-0 truncate text-[13px]"><span data-no-i18n>{s(d.employee_name) || s(d.employee) || s(d.name)}</span></Native><Chip tone="warn">{tx("عقد مسودة", "Draft contract")}</Chip></li>)}
              {failedLogs.slice(0, 4).map((d) => <li key={s(d.name)} className="flex min-h-10 items-center justify-between gap-2 px-4 py-1.5"><Native dt="DIGIT Integration Log" name={s(d.name)} module="07" className="dhr-link min-w-0 truncate text-[13px]"><span data-no-i18n>{s(d.integration) || s(d.name)}</span></Native><Chip tone="danger">{tx("فشل تكامل", "Integration failed")}</Chip></li>)}
            </ul> : <div className="p-4"><HrEmptyOrBlockedState read={src.worst("DIGIT Saudi Rule Set", "DIGIT Employment Contract", "DIGIT Integration Log")} tx={tx} title={tx("لا استثناءات مفتوحة.", "No open exceptions.")} /></div>}
          </HrInsightPanel>
          <HrInsightPanel title={tx("مراجعة عناصر الإعداد", "Setup items review")} data-setup-review>
            <div className="flex flex-wrap gap-2">
              {evaluated.filter((r) => r.count === 0).map((r) => <Native key={r.dt} dt={r.dt} module="07" className="dhr-act">{tx(r.ar, r.en)} <Chip tone="warn">{tx("لا سجلات", "No records")}</Chip></Native>)}
              {unevaluated.map((r) => <Native key={r.dt} dt={r.dt} module="07" className="dhr-act" data-setup-unevaluated={r.dt}>{tx(r.ar, r.en)} <Chip tone="neutral">{stateText(r.read.state, tx)}</Chip></Native>)}
              {!unevaluated.length && evaluated.length > 0 && !evaluated.some((r) => r.count === 0) && <span className="text-[13px] text-[var(--dhr-muted)]" data-setup-all-present>{tx("توجد سجلات لكل عناصر الإعداد المقيَّمة.", "Records exist for every evaluated setup area.")}</span>}
            </div>
          </HrInsightPanel>
        </>}
      />

      <section className="dhr-panel" data-governance-tabs={view}>
        <HrTabs idBase="gov" label={tx("سجلات الحوكمة", "Governance registers")} value={view} onChange={(v) => patch({ view: v === "checks" ? "" : v }, true)}
          tabs={[{ id: "checks", label: tx("سجل الفحوص", "Checks register"), count: checks.length }, { id: "library", label: tx("مكتبة الإعداد", "Configuration library"), count: cfg.length }, { id: "integrations", label: tx("سجل التكاملات", "Integration log"), count: src.ready("DIGIT Integration Log") ? logs.length : undefined }]} />
        <div id="gov-panel" role="tabpanel" aria-labelledby={`gov-tab-${view}`} className="p-4">
          {view === "checks" ? <ChecksRegister checks={checks} src={src} tx={tx} />
            : view === "library" ? <Library cfg={cfg} tx={tx} />
            : <IntegrationLog logs={logs} src={src} tx={tx} />}
        </div>
      </section>
    </div>
  );
}

function GovRow({ title, sub, value, label, tone, to }: { title: string; sub: string; value: React.ReactNode; label?: string; tone?: Tone | undefined; to?: React.ReactNode }) {
  return (
    <li className="flex min-h-12 items-center justify-between gap-2 px-4 py-2">
      <span className="min-w-0"><span className="block font-medium">{title}</span><span className="block text-[11.5px] text-[var(--dhr-muted)]">{sub}</span></span>
      <span className="flex shrink-0 items-center gap-2"><b className={`dhr-tnum ${tone === "danger" ? "text-[var(--dhr-danger)]" : tone === "warn" ? "text-[var(--dhr-warn-text)]" : ""}`} data-no-i18n>{value}</b>{label && <span className="text-[11px] text-[var(--dhr-muted)]">{label}</span>}{to}</span>
    </li>
  );
}

function ChecksRegister({ checks, src, tx }: { checks: SetupCheck[]; src: Sources; tx: Tx }) {
  return (
    <div data-checks-register>
      <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("كل الفحوص بما فيها التي بلا ملاحظات. الملاحظات دليل مراجعة وليست حكم امتثال.", "Every check, including those with no finding. Findings are review evidence, not a compliance verdict.")}</p>
      <WorkTable<SetupCheck> label="setup-checks" tx={tx} rows={checks} rowKey={(c) => c.id} pageSize={12} groups={CHECK_AREAS} groupOf={(c) => c.area} searchText={(c) => `${c.en} ${c.ar} ${c.source}`} minWidth={720}
        cols={[
          { key: "c", ar: "الفحص", en: "Check", sort: (c) => c.en, render: (c) => <span><span className="font-medium">{tx(c.ar, c.en)}</span><span className="block text-[11px] text-[var(--dhr-muted)]">{tx(c.ruleAr, c.ruleEn)}</span></span> },
          { key: "s", ar: "المصدر", en: "Source", render: (c) => <span className="text-[11px] text-[var(--dhr-muted)]" data-no-i18n title={c.source}>{sourceNames(c.source, tx("ar", "en") === "ar")}</span> },
          { key: "t", ar: "النتيجة", en: "Result", sort: (c) => ORDER.indexOf(c.status), render: (c) => <Chip tone={STATUS[c.status][2]}>{tx(STATUS[c.status][0], STATUS[c.status][1])}</Chip> },
          { key: "e", ar: "الدليل", en: "Evidence", sort: (c) => c.evidence.names.length, render: (c) => c.status === "NOT_EVALUATED"
            ? <span className="text-xs text-[var(--dhr-muted)]">{c.missing.length ? c.missing.map((dt) => <span key={dt} className="me-2 inline-flex items-center gap-1"><span data-no-i18n>{tr(dt)}</span><SourceMark read={src.read(dt)} tx={tx} /></span>) : tx(c.reasonAr ?? "", c.reasonEn ?? "")}</span>
            : c.evidence.names.length ? <Native dt={c.evidence.doctype} module="07" filters={[["name", "in", c.evidence.names]]} className="dhr-act"><span data-no-i18n>{c.evidence.names.length}</span> · {tr(c.evidence.doctype)}</Native>
            : <span className="text-xs text-[var(--dhr-muted)]">—</span> },
        ]} />
    </div>
  );
}

function Library({ cfg, tx }: { cfg: Cfg[]; tx: Tx }) {
  return (
    <div data-config-register>
      <p className="mb-3 text-xs text-[var(--dhr-muted)]">{tx("عدد السجلات المتاحة لا يثبت اعتماد الإعداد أو الامتثال.", "Accessible record counts do not establish configuration approval or compliance.")}</p>
      <WorkTable<Cfg> label="config-register" tx={tx} rows={cfg} rowKey={(r) => r.dt} pageSize={12} groups={CFG_GROUPS} groupOf={(r) => r.area} searchText={(r) => `${r.en} ${r.ar} ${r.dt}`}
        cols={[
          { key: "n", ar: "الإعداد", en: "Setup area", sort: (r) => r.en, render: (r) => <Native dt={r.dt} module="07" className="dhr-link font-medium">{tx(r.ar, r.en)}</Native> },
          { key: "a", ar: "المجال", en: "Area", sort: (r) => r.area, render: (r) => { const g = CFG_GROUPS.find((x) => x.id === r.area); return g ? <Chip>{tx(g.ar, g.en)}</Chip> : null; } },
          { key: "c", ar: "السجلات", en: "Records", sort: (r) => r.count, render: (r) => r.count < 0 ? <SourceMark read={r.read} tx={tx} /> : <span data-no-i18n className="dhr-tnum">{r.count}</span> },
          { key: "s", ar: "الحالة", en: "Status", sort: (r) => r.count, render: (r) => r.count < 0 ? <Chip tone="neutral">{tx("لم يُقيَّم", "Not evaluated")}</Chip> : r.count ? <Chip>{tx("سجلات متاحة", "Records available")}</Chip> : <Chip tone="warn">{tx("لا سجلات", "No records")}</Chip> },
          { key: "x", ar: "الإجراء", en: "Action", render: (r) => <Native dt={r.dt} module="07" className="dhr-act">{r.count ? tx("مراجعة", "Review") : tx("إعداد", "Set up")}</Native> },
        ]} />
    </div>
  );
}

function IntegrationLog({ logs, src, tx }: { logs: ReturnType<Sources["rows"]>; src: Sources; tx: Tx }) {
  if (!src.ready("DIGIT Integration Log")) return <HrEmptyOrBlockedState read={src.read("DIGIT Integration Log")} tx={tx} rows={4} />;
  if (!logs.length) return <HrEmptyOrBlockedState tx={tx} title={tx("لا أحداث تكامل مسجلة.", "No integration events recorded.")} body={tx("لا اتصال فعلي بأنظمة خارجية في المعاينة.", "There is no live external connectivity in the preview.")} />;
  return (
    <div className="overflow-x-auto" data-integration-log={logs.length}>
      <p className="mb-2 text-xs text-[var(--dhr-muted)]">{tx("أحدث أحداث التكامل المسجلة — لا يوجد اتصال فعلي بأنظمة خارجية في المعاينة.", "Latest recorded integration events — no live external connectivity in the preview.")}</p>
      <table className="w-full min-w-[560px] text-[13px]">
        <thead className="text-xs text-[var(--dhr-muted)]"><tr>{[tx("التكامل", "Integration"), tx("الاتجاه", "Direction"), tx("الحالة", "Status"), tx("المرجع", "Reference")].map((h, i) => <th key={i} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
        <tbody>{logs.slice(0, 20).map((l) => (
          <tr key={s(l.name)} className="border-t border-[var(--dhr-sep)]">
            <td className="px-3 py-2"><Native dt="DIGIT Integration Log" name={s(l.name)} module="07" className="dhr-link font-medium"><span data-no-i18n>{s(l.integration) || s(l.name)}</span></Native></td>
            <td className="px-3 py-2" data-no-i18n>{s(l.direction)}</td>
            <td className="px-3 py-2"><Chip tone={["Failed", "Error"].includes(s(l.log_status)) ? "danger" : "neutral"}>{tr(s(l.log_status))}</Chip></td>
            <td className="px-3 py-2 text-xs text-[var(--dhr-muted)]" data-no-i18n>{s(l.reference || l.message || "")}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

