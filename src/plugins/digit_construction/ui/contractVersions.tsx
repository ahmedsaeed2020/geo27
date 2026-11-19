/**
 * CON-03 Contract versions & effective terms (Run 6). For one client contract: the versions derived from the contract
 * SOV and each approved client variation, the version and terms in effect on a chosen date, a comparison of two
 * versions, and the terms-revision requests (request, approve, reject through the contract services). Nothing here
 * stores a version; a stored version document with its own approval and future-effective dates waits on the owner.
 * Contract, date and comparison live in the URL so Back restores them.
 */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { notifyError, notifySaved } from "./notify";
import { cachedMeta } from "@/lib/catalog";
import { formatRowAnchor } from "@/lib/rowAnchor";
import { useScopeMetas } from "@/lib/scope";
import { hasPerm, useSessionUser } from "@/lib/session";
import type { PluginPageProps } from "@/plugins/pages";
import { BandField, bandInput } from "@/components/digit/Experience";
import { compareVersions, contractVersions, REVISABLE_TERMS, termsAt, versionAt, versionContracts, type ContractVersion, type TermEvent, type Term } from "../domain/contractVersions";
import { contractPosition, get, linkTitle, projectTitle, today } from "../domain/data";
import { constructionProjects } from "../domain/queues";
import { decideTermsRevision, requestTermsRevision } from "../domain/services";
import { AppLink, BAND, BTN, compact, DataTable, DocRef, Empty, Field, hasRole, inputCls, Kpi, KpiGrid, ListRef, money, Note, PageHeader, Section, StateBadge, StateText, amount, dateTxt, qty, useCx, type Col } from "./kit";
import { reportLink } from "./reports";
import { DateInput } from "@/components/form/DateInput";

const APP = "digit_construction";
const TERM_LABEL: Record<Term, [string, string]> = {
  advance_recovery_pct: ["Advance recovery %", "نسبة استرداد الدفعة المقدمة"], retention_pct: ["Retention %", "نسبة المحتجزات"],
  retention_cap_pct: ["Retention cap %", "سقف المحتجزات"], payment_days: ["Payment days", "مدة السداد (أيام)"],
};
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
type Row = Record<string, unknown>;

export function ContractVersionsPage(_: PluginPageProps) {
  const { t, ar } = useCx();
  const user = useSessionUser();
  useScopeMetas(["Project", "Customer", "Digit Client Contract", "Digit Client Variation"]);
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const str = (k: string) => (typeof search[k] === "string" ? String(search[k]) : "");
  const set = (p: Record<string, string>) => void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: "contracts/versions" }, search: Object.fromEntries(Object.entries({ ...search, ...p }).filter(([, v]) => v)) as never, replace: true });
  const [, bump] = useState(0);
  const [req, setReq] = useState<{ term: Term; value: string; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const projects = new Set(constructionProjects().map((p) => p.name));
  const contracts = versionContracts(projects);
  const name = contracts.some((c) => c.name === str("contract")) ? str("contract") : "";
  const asOf = isDate(str("as_of")) ? str("as_of") : today();
  const title = t("Contract versions & effective terms", "إصدارات العقد والشروط السارية");
  const crumbs = [{ label: t("Contracts & claims", "العقود والمستخلصات"), to: "dept/con" }];
  const termLabel = (k: Term) => (ar ? TERM_LABEL[k][1] : TERM_LABEL[k][0]);
  const valTxt = (k: Term, v: number | null) => (v === null ? "—" : k === "payment_days" ? qty(v) : `${amount(v)}%`);

  const picker = (
    <BandField label={t("Client contract", "عقد العميل")}>
      <select className={bandInput} value={name} data-cv-filter="contract" onChange={(e) => { setReq(null); set({ contract: e.target.value, a: "", b: "" }); }}>
        <option value="">{t("Select a contract…", "اختر عقدًا…")}</option>
        {contracts.map((c) => <option key={c.name} value={c.name} data-no-i18n>{c.name} — {ar ? String(c["title"] ?? "") : projectTitle(get("Project", c["project"]), true) || String(c["title"] ?? "")}</option>)}
      </select>
    </BandField>
  );
  if (!name) return (
    <div className="w-full min-w-0" data-page="construction-contract-versions">
      <PageHeader title={title} crumbs={crumbs} band={{ question: t("Which contract version and terms apply on a date?", "أي إصدار من العقد وأي شروط تسري في تاريخ معيّن؟"), basis: t("Versions are derived from the contract schedule of values and each approved client variation; terms from approved terms revisions.", "تُشتق الإصدارات من جدول قيم العقد وكل أمر تغيير معتمد للعميل، والشروط من مراجعات الشروط المعتمدة."), controls: picker }} />
      <Empty>{contracts.length ? t("Select a client contract to see its versions.", "اختر عقد عميل لعرض إصداراته.") : t("No client contracts you can read.", "لا توجد عقود عملاء يمكنك قراءتها.")}</Empty>
    </div>
  );

  const cv = contractVersions(name)!;
  const c = cv.contract;
  const pos = contractPosition(c);
  const at = versionAt(cv, asOf);
  const termsOn = termsAt(cv, asOf);
  const a = Number(str("a")) || Math.max(1, cv.current.no - 1), b = Number(str("b")) || cv.current.no;
  const cmp = compareVersions(cv, a, b);
  const meta = cachedMeta("Digit Client Contract");
  const canRequest = !!meta && hasPerm(meta, "write", c, user) && !["Draft", "Closed"].includes(String(c["workflow_state"] ?? "Draft"));
  const canDecide = hasRole("Digit Director");
  const pendingAmount = cv.pending_variations.reduce((s, v) => s + Number(v["amount"] ?? 0), 0);

  const run = (fn: () => { ok: boolean; errors: string[] }, okMsg: string, after?: () => void) => {
    if (busy) return; setBusy(true);
    try { const r = fn(); if (!r.ok) { notifyError(t("Not saved", "لم يُحفظ"), { description: r.errors.join("\n") }); return; } notifySaved(okMsg, { description: name }); after?.(); bump((n) => n + 1); }
    finally { setBusy(false); }
  };
  const submitReq = () => {
    if (!req) return;
    const v = Number(req.value);
    if (req.value.trim() === "" || !Number.isFinite(v)) { notifyError(t("Enter the new value", "أدخل القيمة الجديدة")); return; }
    if (!req.reason.trim()) { notifyError(t("A reason is required", "السبب مطلوب")); return; }
    run(() => requestTermsRevision(name, req.term, v, req.reason, user), t("Revision requested", "طُلبت المراجعة"), () => setReq(null));
  };

  const colsV: Col<ContractVersion & Row>[] = [
    { key: "no", label: t("Version", "الإصدار"), render: (v) => <span className="font-semibold" data-no-i18n data-cv-version={v.no}>{v.no}{v.no === at.no ? <span className="ms-1.5 rounded-full bg-primary/10 px-1.5 text-[11px] font-medium text-primary">{t("in effect", "سارٍ")}</span> : null}</span> },
    { key: "source", label: t("Source", "المصدر"), render: (v) => v.kind === "Contract" ? <span>{t("Contract schedule of values", "جدول قيم العقد")}</span> : v.reference ? <DocRef doctype="Digit Client Variation" name={v.reference}>{v.reference}</DocRef> : <span>{t("Variation lines without a link", "بنود تغيير بلا ارتباط")}</span> },
    { key: "title", label: t("Title", "العنوان"), render: (v) => <span data-no-i18n>{v.kind === "Variation" && v.reference ? linkTitle("Digit Client Variation", v.reference) || "—" : String(c["title"] ?? "")}</span> },
    { key: "current_from", label: t("Current from", "سارٍ من"), render: (v) => <span data-no-i18n>{v.current_from ? dateTxt(v.current_from) : "—"}</span> },
    { key: "approved_by", label: t("Approved by", "اعتمده"), render: (v) => <span data-no-i18n>{v.approved_by || "—"}</span> },
    { key: "lines_added", label: t("Lines added", "البنود المضافة"), get: (v) => v.lines.length, kind: "num" },
    { key: "added_amount", label: t("Value added", "القيمة المضافة"), kind: "money" },
    { key: "cumulative", label: t("Contract value", "قيمة العقد"), kind: "money" },
  ];
  const colsL: Col<Row>[] = [
    { key: "version", label: t("Version", "الإصدار"), kind: "num" },
    { key: "line_key", label: t("SOV line", "بند جدول القيم"), render: (l) => <DocRef doctype="Digit Client Contract" name={name} row={formatRowAnchor("sov_lines", l["idx"])}>{String(l["line_key"] ?? "")}</DocRef> },
    { key: "description", label: t("Description", "الوصف"), render: (l) => <span className="block max-w-[18rem] whitespace-normal" data-no-i18n>{String(l["description"] ?? "")}</span> },
    { key: "boq_item", label: t("Against SOV line", "مقابل بند"), render: (l) => <span data-no-i18n>{String(l["boq_item"] || "—")}</span> },
    { key: "qty", label: t("Quantity", "الكمية"), kind: "num" },
    { key: "rate", label: t("Rate", "السعر"), kind: "money" },
    { key: "amount", label: t("Amount", "المبلغ"), kind: "money", total: true },
  ];
  const evRow = (e: TermEvent, decide: boolean) => (
    <tr key={`${e.term}-${e.idx}`} className="border-t border-border" data-cv-rev={e.idx}>
      <td className="px-2 py-1.5">{termLabel(e.term)}</td>
      <td className="px-2 py-1.5 tabular-nums" data-no-i18n>{valTxt(e.term, e.from)} {ar ? "←" : "→"} {valTxt(e.term, e.to)}</td>
      <td className="px-2 py-1.5"><StateBadge state={e.status} /></td>
      <td className="px-2 py-1.5 text-xs" data-no-i18n>{e.requested_by || "—"}</td>
      <td className="px-2 py-1.5 text-xs" data-no-i18n>{e.decided_by ? `${e.decided_by} · ${dateTxt(e.decided_on)}` : "—"}</td>
      <td className="max-w-[16rem] whitespace-normal px-2 py-1.5 text-xs" data-no-i18n>{e.reason || "—"}</td>
      <td className="px-2 py-1.5">{decide && canDecide && <div className="flex flex-wrap gap-1">
        <button type="button" className={BTN.compact} disabled={busy || e.requested_by === user} title={e.requested_by === user ? t("Another user must decide your own request", "يجب أن يقرر طلبك مستخدم آخر") : undefined} data-cv-approve={e.idx} onClick={() => run(() => decideTermsRevision(name, e.idx, true), t("Revision approved — applies from today", "اعتُمدت المراجعة — تسري من اليوم"))}>{t("Approve", "اعتماد")}</button>
        <button type="button" className={BTN.compact} disabled={busy} data-cv-reject={e.idx} onClick={() => run(() => decideTermsRevision(name, e.idx, false), t("Revision rejected", "رُفضت المراجعة"))}>{t("Reject", "رفض")}</button></div>}</td>
    </tr>
  );
  const evTable = (evs: TermEvent[], decide: boolean, empty: string) => evs.length ? (
    <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-sm"><thead><tr className="text-start text-xs text-muted-foreground">
      <th className="px-2 py-1.5 text-start font-medium">{t("Term", "البند")}</th><th className="px-2 py-1.5 text-start font-medium">{t("Change", "التغيير")}</th><th className="px-2 py-1.5 text-start font-medium">{t("Status", "الحالة")}</th>
      <th className="px-2 py-1.5 text-start font-medium">{t("Requested by", "طلبه")}</th><th className="px-2 py-1.5 text-start font-medium">{t("Decided", "القرار")}</th><th className="px-2 py-1.5 text-start font-medium">{t("Reason", "السبب")}</th><th className="px-2 py-1.5" /></tr></thead>
      <tbody>{evs.map((e) => evRow(e, decide))}</tbody></table></div>) : <Empty>{empty}</Empty>;

  return (
    <div className="w-full min-w-0" data-page="construction-contract-versions" data-contract={name}>
      <PageHeader title={title} crumbs={crumbs}
        subtitle={t("Derived from approved records only: nothing on this page is a separate stored version.", "مشتقة من السجلات المعتمدة فقط: لا شيء في هذه الصفحة إصدار محفوظ مستقل.")}
        band={{ question: t("Which contract version and terms apply on a date?", "أي إصدار من العقد وأي شروط تسري في تاريخ معيّن؟"),
          basis: t("Version 1 is the contract schedule of values; each approved client variation adds the next version from its approval date. Approved terms revisions apply from their decision date onwards.", "الإصدار 1 هو جدول قيم العقد؛ ويضيف كل أمر تغيير معتمد للعميل الإصدار التالي من تاريخ اعتماده. وتسري مراجعات الشروط المعتمدة من تاريخ قرارها فصاعدًا."),
          controls: <>{picker}<BandField label={t("As of", "في تاريخ")}><DateInput className={bandInput} value={asOf} data-cv-filter="as_of" onChange={(e) => set({ as_of: e.target.value && e.target.value !== today() ? e.target.value : "" })} /></BandField></>,
          meta: [
            { label: t("Project", "المشروع"), value: <span data-no-i18n>{projectTitle(get("Project", c["project"]), !ar)}</span> },
            { label: t("Status", "الحالة"), value: <StateText state={c["workflow_state"]} /> },
            { label: t("Version in effect", "الإصدار الساري"), value: <span data-no-i18n>{at.no} / {cv.versions.length}</span> },
            { label: t("Stored SOV version", "إصدار جدول القيم المحفوظ"), value: <span data-no-i18n>{cv.stored_version}</span> },
          ],
          actions: <><DocRef doctype="Digit Client Contract" name={name} className={BAND.secondary}>{t("Open contract", "فتح العقد")}</DocRef><AppLink to={reportLink("Variations Register", { project: String(c["project"] ?? "") })} className={BAND.secondary}>{t("Variations register", "سجل التغييرات")}</AppLink><AppLink to={reportLink("BOQ Measurement Reconciliation", { contract: name })} className={BAND.secondary}>{t("Quantity reconciliation", "مطابقة الكميات")}</AppLink></> }} />
      <KpiGrid cols={6}>
        <Kpi label={t("Original value", "القيمة الأصلية")} value={compact(pos.original, ar)} hint={money(pos.original)} anchor="cv-versions" />
        <Kpi label={t("Approved variations", "التغييرات المعتمدة")} value={compact(pos.variations, ar)} hint={t(`Versions added: ${cv.versions.length - 1}`, `الإصدارات المضافة: ${cv.versions.length - 1}`)} anchor="cv-versions" />
        <Kpi label={t("Current contract value", "قيمة العقد الحالية")} value={compact(cv.current.cumulative, ar)} hint={money(cv.current.cumulative)} tone="info" />
        <Kpi label={t("Value on the chosen date", "القيمة في التاريخ المختار")} value={compact(at.cumulative, ar)} hint={dateTxt(asOf)} />
        <Kpi label={t("Client variations awaiting decision", "تغييرات العميل بانتظار القرار")} value={String(cv.pending_variations.length)} hint={cv.pending_variations.length ? money(pendingAmount) : t("none", "لا يوجد")} tone={cv.pending_variations.length ? "warn" : "good"}
          list={{ doctype: "Digit Client Variation", filters: [["contract", "=", name], ["workflow_state", "=", "Submitted"]] }} />
        <Kpi label={t("Terms revisions requested", "مراجعات شروط مطلوبة")} value={String(cv.requested.length)} tone={cv.requested.length ? "warn" : "good"} anchor="cv-terms" />
      </KpiGrid>
      {cv.checks.length > 0 && <Note tone="warn"><strong>{t("Consistency checks", "فحوص الاتساق")}:</strong> <span data-no-i18n>{cv.checks.join(" · ")}</span></Note>}
      <Section id="cv-versions" title={t("Contract versions", "إصدارات العقد")}>
        <DataTable<ContractVersion & Row> rows={cv.versions as (ContractVersion & Row)[]} cols={colsV} rowKey={(v) => String(v.no)} empty={t("No schedule of values yet", "لا يوجد جدول قيم بعد")} />
        {cv.internal_changes.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{t("Internal scope changes do not change the contract value and are not versions:", "التغييرات الداخلية في النطاق لا تغيّر قيمة العقد وليست إصدارات:")} {cv.internal_changes.map((x) => <DocRef key={x.name} doctype="Digit Client Variation" name={x.name} className="ms-1" />)}</p>}
      </Section>
      <Section title={t("Compare two versions", "مقارنة إصدارين")} actions={<div className="flex flex-wrap items-end gap-2">
        <Field label={t("From version", "من الإصدار")}><select className={inputCls} value={a} data-cv-compare="a" onChange={(e) => set({ a: e.target.value })}>{cv.versions.slice(0, -1).map((v) => <option key={v.no} value={v.no} data-no-i18n>{v.no}</option>)}</select></Field>
        <Field label={t("To version", "إلى الإصدار")}><select className={inputCls} value={b} data-cv-compare="b" onChange={(e) => set({ b: e.target.value })}>{cv.versions.slice(1).map((v) => <option key={v.no} value={v.no} data-no-i18n>{v.no}</option>)}</select></Field></div>}>
        {cv.versions.length < 2 ? <Empty>{t("Only one version: no approved client variation has changed this contract.", "إصدار واحد فقط: لم يغيّر أي أمر تغيير معتمد هذا العقد.")}</Empty>
          : !cmp ? <Note tone="warn">{t("Choose a 'from' version earlier than the 'to' version.", "اختر إصدار «من» أقدم من إصدار «إلى».")}</Note>
          : <><p className="mb-2 text-sm" data-cv-delta={cmp.delta}>{t("Value change", "تغير القيمة")}: <strong data-no-i18n>{money(cmp.delta)}</strong> ({t("version", "الإصدار")} <span data-no-i18n>{cmp.from.no} → {cmp.to.no}</span>)</p>
            <DataTable<Row> rows={cmp.added} cols={colsL} rowKey={(l, i) => `${String(l["line_key"])}-${i}`} empty={t("No lines added between these versions", "لا بنود مضافة بين هذين الإصدارين")} /></>}
      </Section>
      <Section id="cv-terms" title={t("Terms in effect", "الشروط السارية")}>
        <div className="overflow-x-auto"><table className="w-full min-w-[36rem] text-sm"><thead><tr className="text-xs text-muted-foreground">
          <th className="px-2 py-1.5 text-start font-medium">{t("Term", "البند")}</th><th className="px-2 py-1.5 text-end font-medium">{t("Original", "الأصلي")}</th>
          <th className="px-2 py-1.5 text-end font-medium">{t("On the chosen date", "في التاريخ المختار")}</th><th className="px-2 py-1.5 text-end font-medium">{t("Today", "اليوم")}</th><th className="px-2 py-1.5 text-end font-medium">{t("Approved revisions", "المراجعات المعتمدة")}</th></tr></thead>
          <tbody>{cv.terms.map((x) => <tr key={x.term} className="border-t border-border" data-cv-term={x.term}>
            <td className="px-2 py-1.5">{termLabel(x.term)}</td><td className="px-2 py-1.5 text-end tabular-nums" data-no-i18n>{valTxt(x.term, x.original)}</td>
            <td className="px-2 py-1.5 text-end font-semibold tabular-nums" data-no-i18n data-cv-at={termsOn[x.term]}>{valTxt(x.term, termsOn[x.term])}</td><td className="px-2 py-1.5 text-end tabular-nums" data-no-i18n>{valTxt(x.term, x.current)}</td>
            <td className="px-2 py-1.5 text-end tabular-nums" data-no-i18n>{x.events.length}</td></tr>)}</tbody></table></div>
        <p className="mt-2 text-xs text-muted-foreground">{t("Contract terms, not ledger balances. The advance amount itself is not revised here.", "شروط تعاقدية وليست أرصدة محاسبية. مبلغ الدفعة المقدمة نفسه لا يُراجع هنا.")}</p>
      </Section>
      <Section title={t("Terms revisions", "مراجعات الشروط")} actions={canRequest ? <button type="button" className={BTN.secondary} data-cv-request aria-expanded={!!req} onClick={() => setReq(req ? null : { term: "retention_pct", value: "", reason: "" })}>{t("Request a revision", "طلب مراجعة")}</button> : undefined}>
        {req && <div className="mb-3 rounded-md border border-primary/40 bg-primary/5 p-3" data-cv-form>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label={t("Term", "البند")}><select className={inputCls} value={req.term} data-cv-term-select onChange={(e) => setReq({ ...req, term: e.target.value as Term })}>{REVISABLE_TERMS.map((k) => <option key={k} value={k}>{termLabel(k)}</option>)}</select></Field>
            <Field label={`${t("New value", "القيمة الجديدة")} (${t("current", "الحالية")} ${valTxt(req.term, Number(c[req.term] ?? 0))})`}><input type="number" min={0} step={req.term === "payment_days" ? 1 : 0.5} className={inputCls} value={req.value} data-cv-value onChange={(e) => setReq({ ...req, value: e.target.value })} /></Field>
            <Field label={t("Reason", "السبب")}><input className={inputCls} value={req.reason} data-cv-reason onChange={(e) => setReq({ ...req, reason: e.target.value })} /></Field>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("The term changes only when a director approves the request, and only from that day onwards.", "لا يتغير البند إلا عند اعتماد مدير للطلب، ومن ذلك اليوم فصاعدًا.")}</p>
          <div className="mt-2 flex gap-2"><button type="button" className={BTN.primary} disabled={busy} data-cv-submit onClick={submitReq}>{t("Submit request", "إرسال الطلب")}</button><button type="button" className={BTN.secondary} onClick={() => setReq(null)}>{t("Cancel", "إلغاء")}</button></div>
        </div>}
        <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{t("Waiting for a decision", "بانتظار القرار")}</h3>
        {evTable(cv.requested, true, t("No revision is waiting for a decision.", "لا توجد مراجعة بانتظار القرار."))}
        <h3 className="mb-1 mt-3 text-xs font-semibold text-muted-foreground">{t("Decided", "تم القرار")}</h3>
        {evTable([...cv.terms.flatMap((x) => x.events), ...cv.rejected].sort((x, y) => y.decided_on.localeCompare(x.decided_on) || y.idx - x.idx), false, t("No terms revision has been decided; the contract's original terms apply.", "لم يُتخذ قرار في أي مراجعة شروط؛ تسري الشروط الأصلية للعقد."))}
        {cv.requested.length > 0 && !canDecide && <p className="mt-2 text-xs text-muted-foreground">{t("Only a director decides terms revisions.", "لا يقرر مراجعات الشروط إلا المدير.")}</p>}
        <Note>{t("A stored contract version document with its own approval and future effective dates is not available until the owner decides how contract versions are approved.", "لا تتوفر وثيقة إصدار عقد محفوظة باعتماد مستقل وتواريخ سريان مستقبلية حتى يقرر المالك كيفية اعتماد إصدارات العقد.")}</Note>
      </Section>
      <p className="mt-2 text-xs text-muted-foreground"><ListRef doctype="Digit Client Variation" filters={[["contract", "=", name]]}>{t("All variations of this contract", "كل تغييرات هذا العقد")}</ListRef></p>
    </div>
  );
}
