/**
 * BUD-EXT-02/03 Cost source verifier: for one explicitly chosen project (and optional as-of date) every row behind the
 * commitment and actual figures, the related events that are not cost, and the exceptions that make a figure doubtful.
 * An unmapped row can be allocated to a budget line (Digit Cost Allocation) and any exception can be reviewed
 * (Digit Cost Exception Review); the source document is never edited. Filters, view and selection live in the URL.
 */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { notifyError, notifySaved } from "./notify";
import type { PluginPageProps } from "@/plugins/pages";
import { cachedMeta } from "@/lib/catalog";
import { formatRowAnchor } from "@/lib/rowAnchor";
import { useScopeMetas } from "@/lib/scope";
import { hasPerm } from "@/lib/session";
import { allocateSource, reviewException } from "../domain/costActions";
import { EXCEPTION_LABEL, allocationTargets, costVerification, type ExceptionCode, type ExceptionItem, type VerifyRow } from "../domain/costVerify";
import { get, projectTitle, today } from "../domain/data";
import { constructionProjects } from "../domain/queues";
import { DOCTYPE_AR, OPTION_AR } from "../schema";
import { AppLink, BTN, compact, DataTable, DocRef, Empty, Field, Filters, inputCls, Kpi, KpiGrid, ListRef, Note, OWN, PageHeader, Section, useCx, amount, dateTxt, type Col } from "./kit";
import { reportLink } from "./reports";
import { DateInput } from "@/components/form/DateInput";

const SOURCE_TYPES = ["Purchase Order", "Digit Subcontract Work Order", "Purchase Invoice", "Journal Entry", "Purchase Receipt", "Stock Entry", "Payment Entry"];
const SRC_AR: Record<string, string> = { "Purchase Order": "أمر شراء", "Purchase Invoice": "فاتورة مشتريات", "Journal Entry": "قيد يومية", "Purchase Receipt": "إيصال استلام", "Stock Entry": "قيد مخزون", "Payment Entry": "سند دفع" };
const ELIG_AR: Record<string, string> = { Eligible: "مؤهل", "Pending mapping": "بانتظار التخصيص", Excluded: "مستبعد" };
const MEASURE_AR: Record<string, string> = { Commitment: "التزام", Actual: "فعلي", "Not a cost event": "ليس حدث تكلفة" };
const STATUS_AR: Record<string, string> = { Open: "مفتوح", Reviewed: "تمت المراجعة", "Correction requested": "طُلب التصحيح" };
const NOTE_AR: Record<string, string> = {
  "Receipt — cost is the purchase invoice": "استلام — التكلفة هي فاتورة المشتريات", "Purchase return — not a cost event": "مرتجع مشتريات — ليس حدث تكلفة",
  "Material movement — not a cost event": "حركة مواد — ليست حدث تكلفة", "Payment — settles an invoice, never a cost": "دفعة — تسدد فاتورة ولا تُعد تكلفة",
};
/** What each exception means and how it is resolved (display only). */
const EXPLAIN: Record<ExceptionCode, [string, string]> = {
  UNMAPPED: ["The row has no cost code, so its amount sits in the unallocated bucket. Allocate it to a budget line or correct the source.", "السطر بلا رمز تكلفة فيظهر مبلغه ضمن غير الموزع. خصّصه لبند موازنة أو صحّح المستند المصدر."],
  CODE_NOT_IN_BUDGET: ["The row's cost code is not a line of the approved budget. Allocate it to a budget line or revise the budget.", "رمز تكلفة السطر ليس بندًا في الموازنة المعتمدة. خصّصه لبند موازنة أو عدّل الموازنة."],
  DOUBLE_COUNT_RISK: ["Invoice row without a purchase-order link while the same item still has an open PO commitment: the amount may be counted as both commitment and actual.", "سطر فاتورة غير مرتبط بأمر شراء بينما للصنف نفسه التزام مفتوح: قد يُحتسب المبلغ التزامًا وفعليًا معًا."],
  BILLED_MISMATCH: ["The PO line's billed amount differs from the invoices that reference it, so its open commitment is wrong.", "المبلغ المفوتر في سطر أمر الشراء يختلف عن الفواتير المرتبطة به، فالالتزام المفتوح غير صحيح."],
  BILL_NOT_INVOICED: ["Approved subcontractor bill: relieved from the work-order commitment but not yet an actual cost until its purchase invoice is submitted.", "مستخلص مقاول معتمد: خُصم من التزام أمر العمل لكنه ليس تكلفة فعلية حتى تُعتمد فاتورة المشتريات."],
  EXPENSE_NOT_POSTED: ["Approved site expense without a journal entry (policy P7): not yet in actual cost.", "مصروف موقع معتمد بلا قيد يومية (السياسة P7): لم يدخل التكلفة الفعلية بعد."],
  ALLOCATION_STALE: ["The source changed after it was allocated. Check the allocation still applies.", "تغيّر المصدر بعد تخصيصه. تحقق من أن التخصيص ما زال صحيحًا."],
  ALLOCATION_ORPHAN: ["The allocated row is no longer an open cost source (cancelled, closed or fully billed). Cancel the allocation.", "السطر المخصّص لم يعد مصدر تكلفة مفتوحًا (ملغى أو مغلق أو مفوتر بالكامل). ألغِ التخصيص."],
};
const SEV_TONE: Record<string, string> = { High: "bg-destructive/10 text-destructive", Medium: "bg-warning/15 text-warning", Low: "bg-muted text-muted-foreground" };
const ELIG_TONE: Record<string, string> = { Eligible: "bg-success/15 text-success", "Pending mapping": "bg-warning/15 text-warning", Excluded: "bg-muted text-muted-foreground" };
const Chip = ({ tone, children }: { tone: string; children: ReactNode }) => <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${tone}`} data-no-i18n>{children}</span>;
const can = (dt: string) => { const m = cachedMeta(dt); return !!m && hasPerm(m, "create"); };

type View = "exceptions" | "register";
export function CostVerifyPage(_: PluginPageProps) {
  const { t, ar } = useCx();
  useScopeMetas(["Project", "Purchase Order", "Purchase Invoice", "Journal Entry", "Purchase Receipt", "Stock Entry", "Payment Entry", "Account", "Supplier"]);
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const str = (k: string) => (typeof search[k] === "string" ? String(search[k]) : "");
  const set = (p: Record<string, string>) => void nav({ to: "/plugins/$name/$", params: { name: "digit_construction", _splat: "cost/verify" }, search: Object.fromEntries(Object.entries({ ...search, ...p }).filter(([, v]) => v)) as never, replace: true });
  const projects = constructionProjects();
  const project = projects.some((p) => p.name === str("project")) ? str("project") : "";
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(str("as_of")) ? str("as_of") : "";
  const view: View = str("view") === "register" ? "register" : "exceptions";
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ key: string; mode: "allocate" | "review"; line: string; text: string; resolution: "Accepted as Is" | "Correction Requested" } | null>(null);
  const srcLabel = (dt: string) => (ar ? SRC_AR[dt] ?? (OWN.has(dt) ? DOCTYPE_AR[dt] ?? dt : dt) : dt.replace(/^Digit /, ""));
  const title = t("Cost source verifier", "محقق مصادر التكلفة");
  const crumbs = [{ label: t("Budget & cost", "الموازنة والتكلفة"), to: "dept/cst" }];

  const head = (
    <Filters>
      <Field label={t("Project", "المشروع")}>
        <select className={inputCls} value={project} data-verify-filter="project" onChange={(e) => { setForm(null); set({ project: e.target.value }); }}>
          <option value="">{t("Select a project…", "اختر مشروعًا…")}</option>
          {projects.map((p) => <option key={p.name} value={p.name} data-no-i18n>{projectTitle(p, !ar)}</option>)}
        </select>
      </Field>
      <Field label={t("As of (empty = all dates)", "حتى تاريخ (فارغ = كل التواريخ)")}><DateInput className={inputCls} value={asOf} max={today()} data-verify-filter="as_of" onChange={(e) => set({ as_of: e.target.value })} /></Field>
      {project && view === "register" && <Field label={t("Source type", "نوع المصدر")}><select className={inputCls} value={str("source")} onChange={(e) => set({ source: e.target.value })}><option value="">{t("All", "الكل")}</option>{SOURCE_TYPES.map((s) => <option key={s} value={s}>{srcLabel(s)}</option>)}</select></Field>}
      {project && view === "register" && <Field label={t("Eligibility", "الأهلية")}><select className={inputCls} value={str("elig")} data-verify-filter="elig" onChange={(e) => set({ elig: e.target.value })}><option value="">{t("All", "الكل")}</option>{Object.keys(ELIG_AR).map((s) => <option key={s} value={s}>{ar ? ELIG_AR[s] : s}</option>)}</select></Field>}
      {project && view === "exceptions" && <Field label={t("Status", "الحالة")}><select className={inputCls} value={str("status") || "open"} data-verify-filter="status" onChange={(e) => set({ status: e.target.value === "open" ? "" : e.target.value })}>
        <option value="open">{t("Needs attention", "تحتاج إجراء")}</option><option value="reviewed">{t("Reviewed", "تمت المراجعة")}</option><option value="all">{t("All", "الكل")}</option></select></Field>}
    </Filters>
  );
  if (!project) return (
    <div className="w-full min-w-0" data-page="construction-cost-verify">
      <PageHeader title={title} crumbs={crumbs} subtitle={t("Checks every row behind a project's commitments and actual cost, and the events that are deliberately not cost.", "يتحقق من كل سطر خلف التزامات المشروع وتكلفته الفعلية، ومن الحركات التي لا تُعد تكلفة عمدًا.")} />
      {head}
      <Empty>{projects.length ? t("Select a project to verify its cost sources.", "اختر مشروعًا للتحقق من مصادر تكلفته.") : t("No construction projects you can read.", "لا توجد مشاريع مقاولات يمكنك قراءتها.")}</Empty>
    </div>
  );

  const v = costVerification(project, asOf || undefined);
  const p = get("Project", project);
  const canAllocate = can("Digit Cost Allocation"), canReview = can("Digit Cost Exception Review");
  const targets = allocationTargets(project);
  const rep = (measure: "Commitment" | "Actual") => reportLink("Project Cost Sources", { project, as_of: asOf || undefined, measure });
  const rowRef = (dt: string, name: string, table: string, row: number) => <><DocRef doctype={dt} name={name} row={table && row ? formatRowAnchor(table, row) : undefined} />{row ? <span className="ms-1 text-xs text-muted-foreground" data-no-i18n>#{row}</span> : null}</>;

  const run = (fn: () => { ok: boolean; name?: string; errors: string[] }, okMsg: string) => {
    if (busy) return; setBusy(true);
    try { const r = fn(); if (!r.ok) { notifyError(t("Not saved", "لم يُحفظ"), { description: r.errors.join("\n") }); return; } notifySaved(okMsg, { description: r.name }); setForm(null); }
    finally { setBusy(false); }
  };
  const submitForm = (x: ExceptionItem) => {
    if (!form) return;
    if (form.mode === "allocate") {
      if (!form.line) { notifyError(t("Choose a budget line", "اختر بند موازنة")); return; }
      if (!form.text.trim()) { notifyError(t("A reason is required", "السبب مطلوب")); return; }
      run(() => allocateSource(project, { doctype: x.source_doctype, name: x.source_name, row: x.row }, form.line, form.text), t("Row allocated to the budget line", "خُصّص السطر لبند الموازنة"));
    } else {
      if (!form.text.trim()) { notifyError(t("A note is required", "الملاحظة مطلوبة")); return; }
      run(() => reviewException(project, x, form.resolution, form.text), t("Review recorded", "سُجّلت المراجعة"));
    }
  };

  const statusSel = str("status") || "open";
  const exRows = v.exceptions.filter((x) => statusSel === "all" || (statusSel === "reviewed" ? x.status === "Reviewed" : x.status !== "Reviewed"));
  const colsE: Col<ExceptionItem & Record<string, unknown>>[] = [
    { key: "label", label: t("Exception", "الاستثناء"), render: (x) => <div className="min-w-[11rem] max-w-[19rem] whitespace-normal"><div className="flex flex-wrap items-center gap-1.5"><Chip tone={SEV_TONE[x.severity] ?? ""}>{ar ? OPTION_AR[x.severity] ?? x.severity : x.severity}</Chip><span className="font-medium" data-no-i18n>{ar ? OPTION_AR[x.label] ?? x.label : x.label}</span></div><div className="mt-0.5 text-xs text-muted-foreground" data-no-i18n>{ar ? EXPLAIN[x.code][1] : EXPLAIN[x.code][0]}</div></div> },
    { key: "source", label: t("Source", "المصدر"), render: (x) => <div><div className="text-xs text-muted-foreground" data-no-i18n>{srcLabel(x.source_doctype)}</div>{rowRef(x.source_doctype, x.source_name, x.table, x.row)}</div> },
    { key: "detail", label: t("Item / account", "الصنف / الحساب"), render: (x) => <span data-no-i18n>{x.detail ? (ar ? OPTION_AR[x.detail] ?? x.detail : x.detail) : "—"}</span> },
    { key: "amount", label: t("Amount", "المبلغ"), kind: "money" },
    { key: "status", label: t("Status", "الحالة"), render: (x) => <div><StateBadgeLike s={x.status} ar={ar} />{x.review && <div className="mt-0.5 text-xs"><DocRef doctype="Digit Cost Exception Review" name={x.review} /></div>}</div> },
    { key: "act", label: "", render: (x) => (
      <div className="flex flex-wrap gap-1" data-verify-actions={x.key}>
        {x.allocatable && canAllocate && targets.length > 0 && <button type="button" className={BTN.compact} aria-expanded={form?.key === x.key && form.mode === "allocate"} onClick={() => setForm({ key: x.key, mode: "allocate", line: "", text: "", resolution: "Accepted as Is" })}>{t("Allocate", "تخصيص")}</button>}
        {canReview && <button type="button" className={BTN.compact} aria-expanded={form?.key === x.key && form.mode === "review"} onClick={() => setForm({ key: x.key, mode: "review", line: "", text: "", resolution: "Accepted as Is" })}>{t("Review", "مراجعة")}</button>}
      </div>) },
  ];
  const sel = form ? v.exceptions.find((x) => x.key === form.key) : undefined;

  const src = str("source"), elig = str("elig");
  const regRows = v.rows.filter((r) => (!src || r.source_doctype === src) && (!elig || r.eligibility === elig));
  const colsR: Col<VerifyRow & Record<string, unknown>>[] = [
    { key: "source", label: t("Source", "المصدر"), render: (r) => <div><div className="text-xs text-muted-foreground" data-no-i18n>{srcLabel(r.source_doctype)}</div>{rowRef(r.source_doctype, r.source_name, r.table, r.row)}</div> },
    { key: "detail", label: t("Item / account", "الصنف / الحساب"), render: (r) => <span data-no-i18n>{r.detail || "—"}</span> },
    { key: "party", label: t("Party", "الطرف"), render: (r) => <span data-no-i18n>{r.party || "—"}</span> },
    { key: "date", label: t("Date", "التاريخ"), render: (r) => <span data-no-i18n>{dateTxt(r.date)}</span> },
    { key: "measure", label: t("Measure", "المقياس"), render: (r) => <span data-no-i18n>{ar ? MEASURE_AR[r.measure] : r.measure}</span> },
    { key: "commitment", label: t("Open commitment", "الالتزام المفتوح"), kind: "money", total: true },
    { key: "actual", label: t("Actual to date", "الفعلي حتى تاريخه"), kind: "money", total: true },
    { key: "cost_code", label: t("Cost code", "رمز التكلفة"), render: (r) => r.eligibility === "Excluded" ? <span className="text-muted-foreground">—</span>
      : <span data-no-i18n>{r.allocation ? <>{r.source_code || "∅"} → <strong>{r.cost_code}</strong> <span className="text-xs">(<DocRef doctype="Digit Cost Allocation" name={r.allocation} />)</span></> : r.cost_code || "—"}</span> },
    { key: "eligibility", label: t("Eligibility", "الأهلية"), render: (r) => <div><Chip tone={ELIG_TONE[r.eligibility] ?? ""}>{ar ? ELIG_AR[r.eligibility] : r.eligibility}</Chip>{r.note && <div className="mt-0.5 text-xs text-muted-foreground" data-no-i18n>{ar ? NOTE_AR[r.note] ?? r.note : r.note}</div>}</div> },
    { key: "exceptions", label: t("Exceptions", "الاستثناءات"), render: (r) => r.exceptions.length ? <div className="flex flex-wrap gap-1">{r.exceptions.map((c) => <Chip key={c} tone="bg-warning/15 text-warning">{ar ? OPTION_AR[EXCEPTION_LABEL[c]] ?? EXCEPTION_LABEL[c] : EXCEPTION_LABEL[c]}</Chip>)}</div> : <span className="text-muted-foreground">—</span> },
  ];

  const tab = (k: View, en: string, a: string, n: number) => (
    <button key={k} type="button" role="tab" aria-selected={view === k} data-verify-view={k} onClick={() => { setForm(null); set({ view: k === "exceptions" ? "" : k, status: "", source: "", elig: "" }); }}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${view === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
      {ar ? a : en} <span className="ms-1 rounded-full bg-muted px-1.5 text-xs" data-no-i18n>{n}</span>
    </button>
  );
  return (
    <div className="w-full min-w-0" data-page="construction-cost-verify" data-project={project}>
      <PageHeader title={title} crumbs={crumbs}
        subtitle={t("Purchase basis: open purchase-order and work-order lines are commitments; submitted purchase invoices and expense journal lines are actual cost. Receipts, material issues and payments are listed but never counted.", "أساس الشراء: سطور أوامر الشراء وأوامر العمل المفتوحة التزامات؛ وفواتير المشتريات المعتمدة وسطور قيود المصروفات تكلفة فعلية. تُعرض الاستلامات وصرف المواد والدفعات ولا تُحتسب أبدًا.")}
        actions={<><AppLink to={`cost/sheet?project=${encodeURIComponent(project)}${asOf ? `&as_of=${asOf}` : ""}`} className={BTN.secondary}>{t("Cost sheet", "ورقة التكلفة")}</AppLink><ListRef doctype="Digit Cost Allocation" filters={[["project", "=", project]]} className={BTN.secondary}>{t("Allocations", "التخصيصات")}</ListRef><ListRef doctype="Digit Cost Exception Review" filters={[["project", "=", project]]} className={BTN.secondary}>{t("Reviews", "المراجعات")}</ListRef></>} />
      {head}
      <p className="mb-2 text-sm" data-no-i18n>{p ? projectTitle(p, !ar) : project} · {v.budget ? <><span>{t("Approved budget", "الموازنة المعتمدة")}: </span><DocRef doctype="Digit Project Cost Budget" name={v.budget.name} /></> : <span className="text-warning">{t("No approved budget", "لا توجد موازنة معتمدة")}</span>} · {asOf ? `${t("As of", "حتى")} ${dateTxt(asOf)}` : t("All dates", "كل التواريخ")}</p>
      <KpiGrid>
        <Kpi label={t("Actual to date", "الفعلي حتى تاريخه")} value={compact(v.kpis.atd, ar)} to={rep("Actual")} />
        <Kpi label={t("Open commitment", "الالتزام المفتوح")} value={compact(v.kpis.open_commitment, ar)} to={rep("Commitment")} />
        <Kpi label={t("Unmapped amount", "مبالغ غير مخصّصة")} value={compact(v.kpis.unmapped, ar)} tone={v.kpis.unmapped ? "warn" : "good"} to={`cost/verify?project=${encodeURIComponent(project)}&view=register&elig=${encodeURIComponent("Pending mapping")}${asOf ? `&as_of=${asOf}` : ""}`} />
        <Kpi label={t("Approved, not yet actual", "معتمد ولم يصبح فعليًا")} value={compact(v.kpis.pending_actual, ar)} tone={v.kpis.pending_actual ? "warn" : "good"} hint={t("bills not invoiced, expenses not posted", "مستخلصات غير مفوترة ومصروفات غير مرحّلة")} />
        <Kpi label={t("Exceptions to act on", "استثناءات تحتاج إجراء")} value={String(v.kpis.open_exceptions)} tone={v.kpis.open_exceptions ? "bad" : "good"} to={`cost/verify?project=${encodeURIComponent(project)}${asOf ? `&as_of=${asOf}` : ""}`} />
      </KpiGrid>
      {!v.budget && <Note tone="warn">{t("Without an approved budget no row can be allocated; every amount stays unallocated.", "بدون موازنة معتمدة لا يمكن تخصيص أي سطر؛ وتبقى كل المبالغ غير موزعة.")}</Note>}
      <div className="mb-3 flex flex-wrap gap-1 border-b border-border" role="tablist" aria-label={title}>
        {tab("exceptions", "Exceptions", "الاستثناءات", v.kpis.open_exceptions)}{tab("register", "Source register", "سجل المصادر", v.rows.length)}
      </div>
      {view === "exceptions" && <Section title={t("Source exceptions", "استثناءات المصادر")}>
        <DataTable<ExceptionItem & Record<string, unknown>> rows={exRows as (ExceptionItem & Record<string, unknown>)[]} cols={colsE} rowKey={(x) => x.key} pageSize={25}
          empty={v.exceptions.length ? t("No exceptions with this status", "لا استثناءات بهذه الحالة") : t("No exceptions: every cost row is mapped and consistent.", "لا استثناءات: كل سطور التكلفة مخصّصة ومتسقة.")} />
        {form && sel && <div className="mt-3 rounded-md border border-primary/40 bg-primary/5 p-3" data-verify-form={form.mode}>
          <h3 className="mb-2 text-sm font-semibold" data-no-i18n>{form.mode === "allocate" ? t("Allocate to a budget line", "تخصيص لبند موازنة") : t("Review exception", "مراجعة الاستثناء")} — {srcLabel(sel.source_doctype)} {sel.source_name}{sel.row ? ` #${sel.row}` : ""} · {amount(sel.amount)}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {form.mode === "allocate"
              ? <Field label={t("Budget line", "بند الموازنة")}><select className={inputCls} value={form.line} data-verify-line onChange={(e) => setForm({ ...form, line: e.target.value })}><option value="">{t("Choose…", "اختر…")}</option>{targets.map((l) => <option key={l.line_key} value={l.line_key} data-no-i18n>{l.cost_code} — {l.description}</option>)}</select></Field>
              : <Field label={t("Resolution", "القرار")}><select className={inputCls} value={form.resolution} onChange={(e) => setForm({ ...form, resolution: e.target.value as typeof form.resolution })}><option value="Accepted as Is">{t("Accepted as is", "مقبول كما هو")}</option><option value="Correction Requested">{t("Correction requested", "طُلب التصحيح")}</option></select></Field>}
            <Field label={form.mode === "allocate" ? t("Reason", "السبب") : t("Note", "الملاحظة")}><textarea className={`${inputCls} min-h-16`} value={form.text} data-verify-text onChange={(e) => setForm({ ...form, text: e.target.value })} /></Field>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{form.mode === "allocate" ? t("The source document is not changed. The allocation can be cancelled from its form, which restores the original attribution.", "لا يتغير المستند المصدر. يمكن إلغاء التخصيص من نموذجه فتعود النسبة الأصلية.") : t("A review applies to this version of the source only; if the source changes, the exception reopens.", "تنطبق المراجعة على هذا الإصدار من المصدر فقط؛ وإذا تغيّر المصدر يُعاد فتح الاستثناء.")}</p>
          <div className="mt-2 flex gap-2"><button type="button" className={BTN.primary} disabled={busy} data-verify-submit onClick={() => submitForm(sel)}>{form.mode === "allocate" ? t("Allocate", "تخصيص") : t("Save review", "حفظ المراجعة")}</button><button type="button" className={BTN.secondary} onClick={() => setForm(null)}>{t("Cancel", "إلغاء")}</button></div>
        </div>}
        {!canAllocate && !canReview && <p className="mt-2 text-xs text-muted-foreground">{t("You can view exceptions; allocating and reviewing need a cost-control role (QS, project manager or accountant).", "يمكنك عرض الاستثناءات؛ ويتطلب التخصيص والمراجعة دور تحكم بالتكلفة (مهندس كميات أو مدير مشروع أو محاسب).")}</p>}
      </Section>}
      {view === "register" && <Section title={t("Source register", "سجل المصادر")}>
        <DataTable<VerifyRow & Record<string, unknown>> rows={regRows as (VerifyRow & Record<string, unknown>)[]} cols={colsR} rowKey={(r) => r.key} pageSize={50} empty={t("No source rows match these filters", "لا سطور مصادر مطابقة لهذه المرشحات")} />
        <p className="mt-2 text-xs text-muted-foreground">{t("Only documents you may read are listed. Each source opens its exact row.", "تظهر فقط المستندات التي يحق لك قراءتها. يفتح كل مصدر سطره المحدد.")}</p>
      </Section>}
    </div>
  );
}
function StateBadgeLike({ s, ar }: { s: string; ar: boolean }) {
  const tone = s === "Reviewed" ? "bg-success/15 text-success" : s === "Open" ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning";
  return <Chip tone={tone}>{ar ? STATUS_AR[s] ?? s : s}</Chip>;
}
