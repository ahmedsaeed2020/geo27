/**
 * FSM register page (/plugins/digit_fsm/list/<doctype>) — every FSM list on the CRM leads-list pattern (owner FSM round
 * F1-03): the Enterprise RecordList with saved-view tabs, state chips, the status strip (counts = rows), names not codes,
 * coloured pills, avatars, SLA chip, next step with its date colour, hover actions (quick view, 360, full page), row click →
 * the shared quick view, kanban by state and grouped views. Columns come from the DocType's own list-view fields; a drill
 * (?filters=[[field, op, value], …]) shows exactly the counted rows. The standard list stays one click away in the band.
 */
import { useMemo, type ReactNode } from "react";
import type { PluginPageProps } from "@/plugins/pages";
import type { Doc } from "@/lib/adapter";
import { matchFilter, parseFilters, type Filter } from "@/lib/desk";
import { useRouterState } from "@tanstack/react-router";
import { pluginSlug } from "@/plugins/runtime";
import { FSM_DOCTYPES, FSM_TRANSLATIONS } from "../schema";
import { activeWorkflow } from "@/lib/workflow";
import { canRead, list, titleOf } from "../domain/data";
import { nextStep, slaOf } from "../domain/workState";
import { s } from "../domain/rules";
import { DefChain, chainIndex } from "./riskBits";
import { AppLink, BAND, DataTable, DocRef, DxState, ListRef, NewDoc, NextCell, PageHeader, PersonRef, SlaCell, StateChip, dateTxt, dtLabel, dtTxt, money, numTxt, opt, useFx, useUrlState, type Col } from "./kit";

type R = Doc & Record<string, unknown>;
type Field = { fieldname: string; label: string; fieldtype: string; options?: string; in_list_view?: number };
const PEOPLE = new Set(["FSM Technician", "Employee", "Customer", "Contact", "User"]);
const STATE_FIELDS = ["workflow_state", "status"];
/** The state order of a register's kanban (workflow states first, then the select options). */
function stateOrder(dt: string, f: Field | undefined): string[] {
  const w = activeWorkflow(dt) as { states?: { state: string }[] } | undefined;
  const ws = (w?.states ?? []).map((x) => x.state);
  return ws.length ? ws : (f?.options ?? "").split("\n").filter(Boolean);
}
const AR = (l: string, ar: boolean) => (ar ? FSM_TRANSLATIONS[l] ?? l : l);

export function registerColumns(dt: string, ar: boolean, t: (en: string, a: string) => string): { cols: Col<R>[]; state?: Field | undefined; amount?: Field | undefined } {
  const meta = FSM_DOCTYPES.find((d) => d.name === dt); const fields = ((meta?.fields ?? []) as Field[]).filter((f) => !["Section Break", "Column Break", "Tab Break", "Table", "HTML"].includes(f.fieldtype));
  const state = STATE_FIELDS.map((k) => fields.find((f) => f.fieldname === k)).find(Boolean);
  const amount = fields.find((f) => f.fieldtype === "Currency" && f.in_list_view) ?? fields.find((f) => f.fieldtype === "Currency");
  const shown = fields.filter((f) => f.in_list_view && f !== state && f.fieldname !== "naming_series").slice(0, 6);
  const col = (f: Field): Col<R> => {
    const label = AR(f.label, ar);
    if (f.fieldtype === "Link" && f.options) { const o = f.options; return { key: f.fieldname, label, value: (r) => titleOf(o, r[f.fieldname]), render: (r) => (PEOPLE.has(o) ? <PersonRef doctype={o} name={r[f.fieldname]} /> : <DocRef doctype={o} name={r[f.fieldname]} title />) }; }
    if (f.fieldtype === "Select") return { key: f.fieldname, label, value: (r) => s(r[f.fieldname]), render: (r) => (/severity|result|outcome|status|state/.test(f.fieldname) ? <StateChip value={r[f.fieldname]} /> : <span>{opt(r[f.fieldname], ar) || "—"}</span>) };
    if (f.fieldtype === "Date") return { key: f.fieldname, label, value: (r) => s(r[f.fieldname]), render: (r) => <span data-no-i18n>{dateTxt(r[f.fieldname])}</span> };
    if (f.fieldtype === "Datetime") return { key: f.fieldname, label, value: (r) => s(r[f.fieldname]), render: (r) => <span data-no-i18n>{dtTxt(r[f.fieldname])}</span> };
    if (f.fieldtype === "Currency") return { key: f.fieldname, label, numeric: true, money: true, value: (r) => Number(r[f.fieldname] ?? 0), render: (r) => <span data-no-i18n>{money(r[f.fieldname])}</span> };
    if (["Int", "Float", "Percent"].includes(f.fieldtype)) return { key: f.fieldname, label, numeric: true, value: (r) => Number(r[f.fieldname] ?? 0), render: (r) => <span data-no-i18n>{numTxt(r[f.fieldname], f.fieldtype === "Int" ? 0 : 1)}</span> };
    if (f.fieldtype === "Check") return { key: f.fieldname, label, value: (r) => (r[f.fieldname] ? 1 : 0), render: (r) => <span>{r[f.fieldname] ? t("Yes", "نعم") : t("No", "لا")}</span> };
    return { key: f.fieldname, label, value: (r) => s(r[f.fieldname]), render: (r) => <span data-no-i18n>{s(r[f.fieldname]) || "—"}</span> };
  };
  const cols: Col<R>[] = [
    { key: "name", label: dtLabel(dt, ar), value: (r) => titleOf(dt, r.name), render: (r) => <span className="inline-flex min-w-0 flex-col"><DocRef doctype={dt} name={r.name} title className="font-semibold text-primary hover:underline" /><small className="text-[11px] text-muted-foreground" data-no-i18n>{s(r.name)}</small></span> },
    ...shown.filter((f) => f.fieldname !== "title" && !(f.fieldtype === "Data" && /title|label|_name$/.test(f.fieldname))).map(col),
    ...(state ? [{ key: state.fieldname, label: AR(state.label, ar), value: (r: R) => s(r[state.fieldname]), render: (r: R) => <StateChip value={r[state.fieldname]} /> }] : []),
  ];
  return { cols, state, amount };
}

export function RegisterPage({ params }: PluginPageProps) {
  const fx = useFx(); const { t, ar } = fx; const [f] = useUrlState();
  const slug = String(params["doctype"] ?? "");
  const dt = FSM_DOCTYPES.find((d) => pluginSlug(d.name) === slug && !d.issingle)?.name ?? "";
  // the router parses a JSON search value into an array; a hand-typed address may still carry the JSON text
  const rawF = useRouterState({ select: (x) => (x.location.search as Record<string, unknown>)["filters"] });
  const { filters, unsupported } = Array.isArray(rawF) ? { filters: rawF as Filter[], unsupported: [] as string[] } : parseFilters(typeof rawF === "string" ? rawF : f["filters"]);
  const all = useMemo(() => (dt && canRead(dt) ? (list(dt) as R[]) : []), [dt, fx.user]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!dt) return <DxState kind="empty" title={t("Unknown register", "سجل غير معروف")} detail={<span data-no-i18n>{slug}</span>} action={<AppLink to="">{t("Back to My work", "العودة إلى عملي")}</AppLink>} />;
  if (!canRead(dt)) return <DxState kind="denied" title={t("You do not have permission to read this register", "لا تملك صلاحية قراءة هذا السجل")} />;
  const rows = all.filter((r) => filters.every((x) => matchFilter(r, x)));
  const { cols, state, amount } = registerColumns(dt, ar, t);
  const extra: Col<R>[] = [
    ...(rows.some((r) => nextStep(dt, r)) ? [{ key: "__next", label: t("Next step", "الخطوة التالية"), value: (r: R) => s(nextStep(dt, r)?.date), render: (r: R) => <NextCell doctype={dt} doc={r} /> }] : []),
    ...(dt === "FSM Deficiency" ? [{ key: "__chain", label: t("Chain", "السلسلة"), value: (r: R) => chainIndex(r), render: (r: R) => <DefChain d={r} compact /> }] : []),
    ...(rows.some((r) => slaOf(dt, r).state !== "na") ? [{ key: "__sla", label: t("SLA", "مستوى الخدمة"), value: (r: R) => slaOf(dt, r).state, render: (r: R) => <SlaCell doctype={dt} doc={r} /> }] : []),
  ];
  const label = dtLabel(dt, ar);
  const fieldsByKey = new Map(((FSM_DOCTYPES.find((d) => d.name === dt)?.fields ?? []) as Field[]).map((x) => [x.fieldname, x]));
  const filterText: ReactNode = filters.length ? filters.map(([k, op, v]) => `${AR(fieldsByKey.get(k)?.label ?? k, ar)} ${op === "=" ? ":" : op} ${Array.isArray(v) ? v.map((x) => opt(x, ar)).join("، ") : opt(v, ar)}`).join(" · ") : t("All records you may read", "كل السجلات المسموح لك بقراءتها");
  const groupBy = ["site", "technician", "system", "customer", "severity", "job_type"].filter((k) => fieldsByKey.has(k));
  return (
    <div className="w-full min-w-0" data-page="fsm-register" data-register={dt} data-register-rows={rows.length}>
      <PageHeader title={label} band={{
        question: t(`Which ${label} records need attention, and what is the next step on each?`, `ما سجلات ${label} التي تحتاج انتباهاً، وما الخطوة التالية لكل منها؟`),
        basis: <>{filterText}{unsupported.length ? <> · {t("Ignored filters", "فلاتر لم تُطبّق")}: <span data-no-i18n>{unsupported.join(", ")}</span></> : null}</>,
        meta: [{ label: t("Records", "السجلات"), value: <span data-no-i18n>{numTxt(rows.length)}</span> }, ...(filters.length ? [{ label: t("Of all", "من الكل"), value: <span data-no-i18n>{numTxt(all.length)}</span> }] : []),
          ...(amount ? [{ label: AR(amount.label, ar), value: <span data-no-i18n>{money(rows.reduce((a, r) => a + Number(r[amount.fieldname] ?? 0), 0))}</span> }] : [])],
        actions: <>{filters.length > 0 && <AppLink to={`list/${slug}`} className={BAND.secondary}>{t("Clear the drill", "إلغاء التصفية")}</AppLink>}<NewDoc doctype={dt} band label={t("New", "جديد")} /><ListRef doctype={dt} native className={BAND.secondary}>{t("Standard list", "القائمة القياسية")}</ListRef></>,
      }} />
      <DataTable register id={`reg-${slug}`} doctype={dt} title={label} rows={rows} cols={[...cols, ...extra]} groupBy={groupBy}
        empty={filters.length ? t("No records match this drill.", "لا سجلات تطابق هذه التصفية.") : t(`No ${label} records yet.`, `لا توجد سجلات ${label} بعد.`)}
        {...(state ? { kanban: { order: stateOrder(dt, state), title: (r: R) => <span data-no-i18n>{titleOf(dt, r.name)}</span>, sub: (r: R) => <span data-no-i18n>{r["site"] ? titleOf("FSM Service Site", r["site"]) : s(r.name)}</span>,
          ...(amount ? { amount: (r: R) => Number(r[amount.fieldname] ?? 0) } : {}), facts: (r: R) => { const n = nextStep(dt, r); return n ? [{ label: ar ? n.label[1] : n.label[0], value: n.date ? dateTxt(n.date) : "—", ...(n.tone === "bad" ? { tone: "bad" as const } : {}) }] : []; },
          ...(dt === "FSM Deficiency" ? defKanban(ar) : {}) } } : {})} />
    </div>
  );
}

/** F3-03 deficiency cards: severity flag (critical red), age since opened, a red card for critical and the chain bar. */
export function defKanban(ar: boolean) {
  const SEV: Record<string, { label: [string, string]; tone: "bad" | "warn" | "info" }> = { Critical: { label: ["Critical", "حرجة"], tone: "bad" }, Major: { label: ["Major", "رئيسية"], tone: "warn" }, Minor: { label: ["Minor", "ثانوية"], tone: "info" } };
  const days = (d: unknown) => { const t = Date.parse(s(d)); return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86_400_000)) : null; };
  return {
    flags: (r: R) => { const x = SEV[s(r["severity"])]; return x ? [{ key: "sev", label: ar ? x.label[1] : x.label[0], tone: x.tone }] : []; },
    age: (r: R) => { const n = days(r["opened_on"]); return n === null ? undefined : ar ? `منذ ${n} يوم` : `${n} d open`; },
    late: (r: R) => s(r["severity"]) === "Critical" && chainIndex(r) < 5,
    body: (r: R) => <DefChain d={r} compact />,
  };
}

