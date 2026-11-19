/**
 * Phase 5 cost screens (owner 2026-11-16): budget sheet with use lines and the green «المتبقي» bar (C5-01), remaining-
 * to-spend rings per project and per subcontract (C5-02), the EAC equation (C5-03), the 12-period forecast strip (C5-04),
 * the cost-code ranked list with «عرض الكل» in the shared side panel (C5-05), the Budget vs Actual summary (C5-06) and
 * the department 06 progress against budget (C5-07). Figures come only from domain/costScreens.ts (costPosition /
 * Subcontract Position measures); the look is the Enterprise cost kit, so these panels never compute or style on their own.
 */
import { adapter } from "@/lib/adapter";
import type { ReactNode } from "react";
import { riyal } from "@/lib/format";
import { BudgetBar } from "@/components/enterprise/kit/BudgetBar";
import { BudgetSheet, EquationBand, PeriodStrips, RemainingBar, RemainingRing, RingGrid, type PeriodCell, type SheetRow, type UseLevel } from "@/components/enterprise/kit/CostKit";
import { RankCard, type RankRow } from "@/components/enterprise/kit/rank";
import { get, projectTitle, today } from "../domain/data";
import { budgetThresholds, budgetSheet, costCodeRank, eacEquation, forecastStrip, periodsEnding, remainingParts, subcontractPositions, useLevel, type SheetLine, type Thresholds } from "../domain/costScreens";
import { AppLink, amount, compact, DocRef, useCx } from "./kit";
import { reportLink } from "./reports";

type T = (en: string, ar: string) => string;
/** Amount with a real minus sign (U+2212) when negative. */
export const signedAmount = (v: number) => (v < 0 ? `−${amount(-v)}` : amount(v));
const signedCompact = (v: number, ar: boolean) => (v < 0 ? `−${compact(-v, ar)}` : compact(v, ar));
const big = (v: number, ar: boolean) => riyal(signedCompact(v, ar));
const pctText = (p: number | null) => (p === null ? "—" : `${p}%`);
const lvl = (l: SheetLine["level"]): UseLevel => l;
const pTitle = (name: string, ar: boolean) => projectTitle(get("Project", name), !ar) || name;
const link = (to: string) => (node: ReactNode) => <AppLink to={to}>{node}</AppLink>;
const levelWords = (t: T, l: UseLevel, th: Thresholds) => l === "over" ? t(`over the ${th.over}% limit`, `تجاوز حد ${th.over}%`) : l === "warn" ? t(`past the ${th.warn}% alert`, `بلغ تنبيه ${th.warn}%`) : l === "ok" ? t("within budget", "ضمن الموازنة") : t("no budget", "بلا موازنة");

/* ------------------------------------------------------------------ C5-01 budget sheet ------------------------------------------------------------------ */
function remainingTop(sheet: ReturnType<typeof budgetSheet>, t: T, ar: boolean, to?: string) {
  const tt = sheet.total; const p = remainingParts(tt); const b = tt.budget || 1;
  const share = (v: number) => (tt.budget > 0 ? v / Math.max(b, tt.used) : 0);
  return <RemainingBar label={t("Remaining", "المتبقي")} value={riyal(signedAmount(tt.remaining))} negative={tt.remaining < 0} level={lvl(tt.level)}
    pctText={tt.budget > 0 ? t(`${Math.round((tt.remaining / tt.budget) * 1000) / 10}% of the budget left`, `${Math.round((tt.remaining / tt.budget) * 1000) / 10}% من الموازنة متبقٍ`) : t("no approved budget", "لا موازنة معتمدة")}
    budgetText={t(`of ${amount(tt.budget)} budget`, `من موازنة ${amount(tt.budget)}`)} link={to ? link(to) : undefined}
    parts={[
      { key: "actual", label: t("Actual", "الفعلي"), display: amount(p.actual), share: share(p.actual), tone: "actual" },
      { key: "committed", label: t("Open commitment", "الالتزام المفتوح"), display: amount(p.committed), share: share(p.committed), tone: "committed" },
      { key: "remaining", label: t("Remaining", "المتبقي"), display: amount(p.left), share: share(p.left), tone: "remaining" },
      ...(p.over > 0 ? [{ key: "over", label: t("Over budget", "تجاوز"), display: amount(p.over), share: share(p.over), tone: "over" as const }] : []),
    ]}
    note={t(`Remaining = budget − open commitment − actual. Lines turn amber at ${sheet.thresholds.warn}% used and red past ${sheet.thresholds.over}% (Construction settings).`, `المتبقي = الموازنة − الالتزام المفتوح − الفعلي. يصبح البند كهرمانيًا عند استهلاك ${sheet.thresholds.warn}% وأحمر بعد ${sheet.thresholds.over}% (إعدادات المقاولات).`)} />;
}
/** Cost category Select values shown in the reader's language (stored values unchanged). */
const CAT_AR: Record<string, string> = { Material: "مواد", Subcontract: "مقاولو باطن", Labour: "عمالة", Labor: "عمالة", Equipment: "معدات", Overhead: "مصاريف عامة", Services: "خدمات", Other: "أخرى" };
const catLabel = (c: string | undefined, ar: boolean) => (c ? (ar ? CAT_AR[c] ?? c : c) : "");
export function BudgetSheetPanel({ projects, asOf, title }: { projects: string[]; asOf?: string | undefined; title?: string | undefined }) {
  const { t, ar } = useCx();
  if (!projects.length) return null;
  const one = projects.length === 1 ? projects[0]! : undefined;
  const sheet = budgetSheet(one ?? projects, asOf);
  const cut = asOf && asOf !== today() ? asOf : undefined;
  const src = (measure: "Commitment" | "Actual", code?: string) => one ? reportLink("Project Cost Sources", { project: one, as_of: cut, measure, ...(code ? { cost_code: code } : {}) }) : reportLink("Budget vs Actual", { as_of: cut, ...(code ? { cost_code: code } : {}) });
  const bud = (code?: string) => one ? reportLink("Project Cost Report", { project: one, as_of: cut }) : reportLink("Budget vs Actual", { as_of: cut, ...(code ? { cost_code: code } : {}) });
  const row = (l: SheetLine, label: ReactNode, sub?: ReactNode): SheetRow => ({
    key: l.key, label, sub, budget: amount(l.budget), committed: amount(l.committed), actual: amount(l.actual), remaining: signedAmount(l.remaining), remainingNeg: l.remaining < 0, pct: l.pct, level: lvl(l.level),
    lineLabel: `${l.pct === null ? "—" : `${l.pct}%`} ${t("used", "مستخدم")} · ${levelWords(t, l.level, sheet.thresholds)}`,
    links: { committed: l.committed ? link(src("Commitment", l.cost_code)) : undefined, actual: l.actual ? link(src("Actual", l.cost_code)) : undefined, budget: l.budget ? link(bud(l.cost_code)) : undefined },
    attrs: { "data-cs-code": l.cost_code },
  });
  const rows = sheet.lines.map((l) => l.unallocated
    ? row(l, t("Not on an approved budget line", "غير مرتبط ببند موازنة معتمد"), <span data-no-i18n>{l.cost_code === "UNALLOCATED" ? t("no cost code", "بلا رمز تكلفة") : l.cost_code}</span>)
    : row(l, <span data-no-i18n>{l.description || l.cost_code}</span>, <span data-no-i18n>{[l.cost_code, catLabel(l.category, ar), ...(one ? [] : [t(`${l.projects.length} projects`, `${l.projects.length} مشاريع`)])].filter(Boolean).join(" · ")}</span>));
  const total = { ...row(sheet.total, t("Total", "الإجمالي"), one ? undefined : <span>{t(`${projects.length} projects`, `${projects.length} مشاريع`)}</span>), links: { committed: link(src("Commitment")), actual: link(src("Actual")), budget: link(bud()) } };
  return <BudgetSheet title={title ?? t("Budget sheet", "ورقة الموازنة")} sub={t("Per cost code: budget, open commitment, actual and what is left; the line under each row is the share used.", "لكل رمز تكلفة: الموازنة والالتزام المفتوح والفعلي والمتبقي؛ الخط تحت كل صف نسبة الاستهلاك.")}
    heads={{ label: t("Cost code", "رمز التكلفة"), budget: t("Budget", "الموازنة"), committed: t("Commitment", "الالتزام"), actual: t("Actual", "الفعلي"), remaining: t("Remaining", "المتبقي") }}
    rows={rows} total={total} warnAt={sheet.thresholds.warn} top={remainingTop(sheet, t, ar, bud())} empty={t("No budget lines or spend yet.", "لا بنود موازنة أو إنفاق بعد.")}
    attrs={{ "data-cs-projects": String(projects.length) }} />;
}

/* ------------------------------------------------------------------ C5-02 remaining rings ------------------------------------------------------------------ */
function ProjectRing({ project, asOf }: { project: string; asOf?: string | undefined }) {
  const { t, ar } = useCx();
  const s = budgetSheet(project, asOf); const tt = s.total; const p = remainingParts(tt);
  return <RemainingRing title={<span data-no-i18n>{pTitle(project, ar)}</span>} sub={t("Remaining to spend of the revised budget", "المتبقي للصرف من الموازنة المعدلة")} level={lvl(tt.level)} negative={tt.remaining < 0}
    center={signedCompact(tt.remaining, ar)} centerLabel={t("remaining to spend", "المتبقي للصرف")} link={link(`cost/sheet?project=${encodeURIComponent(project)}`)} attrs={{ "data-cs-ring-project": project }}
    parts={[
      { key: "actual", label: t("Actual", "الفعلي"), value: p.actual, display: compact(p.actual, ar), tone: "actual" },
      { key: "committed", label: t("Open commitment", "الالتزام المفتوح"), value: p.committed, display: compact(p.committed, ar), tone: "committed" },
      { key: "remaining", label: t("Remaining", "المتبقي"), value: p.left, display: compact(p.left, ar), tone: "remaining" },
      ...(p.over > 0 ? [{ key: "over", label: t("Over budget", "تجاوز"), value: p.over, display: compact(p.over, ar), tone: "over" as const }] : []),
    ]}
    facts={[{ key: "budget", label: t("Revised budget", "الموازنة المعدلة"), display: compact(tt.budget, ar) }, { key: "used", label: t("Used", "المستخدم"), display: pctText(tt.pct) }]} />;
}
/** Rings of the projects (most used first) and, optionally, of their submitted subcontract work orders, in one grid. */
export function RemainingRings({ projects, asOf, max = 6, subcontracts = 0 }: { projects: string[]; asOf?: string | undefined; max?: number; subcontracts?: number }) {
  if (!projects.length) return null;
  const ranked = projects.map((p) => ({ p, t: budgetSheet(p, asOf).total })).sort((a, b) => (b.t.pct ?? 0) - (a.t.pct ?? 0)).slice(0, max);
  return <RingGrid attrs={{ "data-cs-rings": subcontracts ? "projects+subcontracts" : "projects" }}>{ranked.map(({ p }) => <ProjectRing key={p} project={p} asOf={asOf} />)}{subcontracts > 0 && <SubRings projects={projects} max={subcontracts} />}</RingGrid>;
}
/** Rings of the submitted subcontract work orders only (Work orders workspace). */
export function SubcontractRings({ projects, max = 8 }: { projects: string[]; max?: number }) {
  const { t } = useCx();
  if (!subcontractPositions(projects).length) return <p className="text-sm text-muted-foreground">{t("No submitted subcontract work order in this scope.", "لا يوجد أمر عمل باطن معتمد في هذا النطاق.")}</p>;
  return <RingGrid attrs={{ "data-cs-rings": "subcontracts" }}><SubRings projects={projects} max={max} /></RingGrid>;
}
function SubRings({ projects, max }: { projects: string[]; max: number }) {
  const { t, ar } = useCx();
  return <>{subcontractPositions(projects).slice(0, max).map((x) => (
    <RemainingRing key={x.work_order} title={<DocRef doctype="Supplier" name={x.subcontractor}>{String(adapter.get("Supplier", x.subcontractor)?.["supplier_name"] ?? x.subcontractor)}</DocRef>} sub={<><DocRef doctype="Digit Subcontract Work Order" name={x.work_order} /> · <span data-no-i18n>{pTitle(x.project, ar)}</span></>}
      level={lvl(x.level)} negative={x.remaining < 0} center={signedCompact(x.remaining, ar)} centerLabel={t("remaining to spend", "المتبقي للصرف")} link={link(reportLink("Subcontract Position", { project: x.project }))} attrs={{ "data-cs-ring-wo": x.work_order }}
      parts={[{ key: "billed", label: t("Billed (gross)", "المستخلص (إجمالي)"), value: x.billed, display: compact(x.billed, ar), tone: "billed" }, { key: "remaining", label: t("Remaining", "المتبقي"), value: Math.max(0, x.remaining), display: compact(Math.max(0, x.remaining), ar), tone: "remaining" }, ...(x.remaining < 0 ? [{ key: "over", label: t("Over the work order", "تجاوز أمر العمل"), value: -x.remaining, display: compact(-x.remaining, ar), tone: "over" as const }] : [])]}
      facts={[{ key: "value", label: t("Work order value", "قيمة أمر العمل"), display: compact(x.value, ar) }, { key: "certified", label: t("Certified measurement", "القياس المعتمد"), display: compact(x.certified, ar) }, { key: "paid", label: t("Paid", "المدفوع"), display: compact(x.paid, ar) }, { key: "retention", label: t("Retention withheld", "المحتجز"), display: compact(x.retention, ar) }]} />
  ))}</>;
}

/* ------------------------------------------------------------------ C5-03 EAC equation ------------------------------------------------------------------ */
export function EacEquationPanel({ projects, asOf }: { projects: string[]; asOf?: string | undefined }) {
  const { t, ar } = useCx();
  if (!projects.length) return null;
  const one = projects.length === 1 ? projects[0]! : undefined;
  const e = eacEquation(one ?? projects, asOf);
  const cut = asOf && asOf !== today() ? asOf : undefined;
  const cost = one ? reportLink("Project Cost Report", { project: one, as_of: cut }) : reportLink("Budget vs Actual", { as_of: cut });
  const src = (measure: string) => one ? reportLink("Project Cost Sources", { project: one, as_of: cut, measure }) : reportLink("Budget vs Actual", { as_of: cut });
  return <EquationBand attrs={{ "data-cs-eq-projects": String(projects.length) }}
    terms={[
      { key: "actual", label: t("Actual", "الفعلي"), display: big(e.actual, ar), sub: <span data-no-i18n>{amount(e.actual)}</span>, link: link(src("Actual")) },
      { key: "etc", label: t("Estimate to complete", "المتبقي المتوقع"), display: e.etc === null ? "—" : big(e.etc, ar), link: link(cost),
        sub: e.etc === null ? t("a forecast line has no ETC yet", "بند توقع بلا متبقٍ بعد") : <>{t("of which open commitment", "منه التزام مفتوح")} <b data-no-i18n>{amount(e.committed)}</b> · {t("uncommitted", "غير ملتزم")} <b data-no-i18n>{signedAmount(e.uncommitted ?? 0)}</b></> },
    ]}
    result={{ key: "eac", label: t("Cost at completion", "التكلفة عند الإنجاز"), display: e.eac === null ? "—" : big(e.eac, ar), sub: e.eac === null ? undefined : <span data-no-i18n>{amount(e.eac)}</span>, link: link(cost) }}
    flag={e.vac === null ? undefined : { label: t("Variance at completion (budget − EAC)", "الفرق عند الإنجاز (الموازنة − التكلفة المتوقعة)"), display: big(e.vac, ar), negative: e.vac < 0, link: link(cost),
      sub: <>{t("revised budget", "الموازنة المعدلة")} <b data-no-i18n>{amount(e.revised)}</b>{e.vac < 0 ? <> · {t("forecast overrun", "تجاوز متوقع")}</> : null}</> }}
    note={t("EAC = actual + ETC; the open commitment is already inside the ETC, so nothing is counted twice. ETC follows the latest approved forecast, else the remaining budget (never below the open commitment).", "التكلفة عند الإنجاز = الفعلي + المتبقي المتوقع؛ الالتزام المفتوح داخل المتبقي فلا يُحسب مرتين. يتبع المتبقي آخر توقع معتمد، وإلا باقي الموازنة (ولا يقل عن الالتزام المفتوح).")} />;
}

/* ------------------------------------------------------------------ C5-04 forecast strip ------------------------------------------------------------------ */
export function ForecastStripPanel({ projects, on = today() }: { projects: string[]; on?: string | undefined }) {
  const { t, ar } = useCx();
  if (!projects.length) return null;
  const months = periodsEnding(on).map((k) => ({ key: k, label: `${k.slice(5, 7)}/${k.slice(2, 4)}`, full: `${k.slice(5, 7)}/${k.slice(0, 4)}` }));
  const word = (s: PeriodCell["state"]) => s === "approved" ? t("forecast approved", "توقع معتمد") : s === "draft" ? t("forecast in draft", "توقع مسودة") : t("not started", "لم يبدأ");
  const rows = projects.map((p) => ({ key: p, label: <span data-no-i18n>{pTitle(p, ar)}</span>, cells: forecastStrip(p, on).map((c): PeriodCell => ({ key: c.period, state: c.state, title: `${c.period.slice(5, 7)}/${c.period.slice(0, 4)} · ${word(c.state)}${c.docs[0] ? ` · ${c.docs[0]}` : ""}`,
    ...(c.docs[0] ? { link: (node: ReactNode) => <DocRef doctype="Digit Cost Forecast Snapshot" name={c.docs[0]}>{node}</DocRef> } : {}) })) }));
  return <PeriodStrips months={months} rows={rows} current={on.slice(0, 7)} legend={{ approved: t("approved", "معتمد"), draft: t("draft", "مسودة"), none: t("not started", "لم يبدأ") }} attrs={{ "data-cs-strip-projects": String(projects.length) }} />;
}

/* ------------------------------------------------------------------ C5-05 ranked cost codes ------------------------------------------------------------------ */
export function CostRankPanel({ projects, asOf, top = 10 }: { projects: string[]; asOf?: string | undefined; top?: number }) {
  const { t, ar } = useCx();
  if (!projects.length) return null;
  const one = projects.length === 1 ? projects[0]! : undefined;
  const ls = costCodeRank(one ?? projects, asOf);
  const cut = asOf && asOf !== today() ? asOf : undefined;
  const to = (code: string) => one ? reportLink("Project Cost Sources", { project: one, as_of: cut, cost_code: code }) : reportLink("Budget vs Actual", { as_of: cut, cost_code: code });
  const rows: RankRow[] = ls.map((l) => ({ key: l.key, value: l.used, of: l.budget, level: l.level === "none" ? undefined : l.level, share: l.pct ?? undefined, title: l.cost_code,
    label: <AppLink to={to(l.cost_code)}><span data-no-i18n>{l.unallocated ? `${t("Unallocated", "غير موزع")} · ${l.cost_code}` : l.description || l.cost_code}</span></AppLink>,
    shown: <span>{compact(l.used, ar)} <span className="text-muted-foreground">/ {compact(l.budget, ar)}</span></span>, attrs: { "data-cs-rank-code": l.cost_code, "data-level": l.level } }));
  return <RankCard id="cost-codes" ar={ar} top={top} title={t("Cost codes by spend against budget", "رموز التكلفة حسب الإنفاق مقابل الموازنة")}
    sub={t("Committed + actual of each cost code against its own budget; amber past the alert, red over the limit.", "الملتزم + الفعلي لكل رمز تكلفة مقابل موازنته؛ كهرماني بعد التنبيه وأحمر فوق الحد.")} rows={rows}
    total={<span>{t(`${ls.filter((l) => l.level === "over").length} over · ${ls.filter((l) => l.level === "warn").length} near the limit`, `${ls.filter((l) => l.level === "over").length} متجاوز · ${ls.filter((l) => l.level === "warn").length} قرب الحد`)}</span>}
    empty={t("No cost code has budget or spend yet.", "لا يوجد رمز تكلفة له موازنة أو إنفاق بعد.")} />;
}

/* ------------------------------------------------------------------ C5-07 progress against budget (stage bar per project) ------------------------------------------------------------------ */
export function CostProgressPanel({ projects, asOf }: { projects: string[]; asOf?: string | undefined }) {
  const { t, ar } = useCx();
  if (!projects.length) return null;
  const all = budgetSheet(projects, asOf);
  const per = projects.map((p) => ({ p, s: budgetSheet(p, asOf) })).filter((x) => x.s.total.budget > 0 || x.s.total.used > 0).sort((a, b) => (b.s.total.pct ?? 0) - (a.s.total.pct ?? 0));
  const th = [all.thresholds.warn, all.thresholds.over];
  return (
    <div className="grid gap-3" data-cs-progress={projects.length}>
      {remainingTop(all, t, ar, reportLink("Budget vs Actual"))}
      <div className="grid gap-3 md:grid-cols-2">
        {per.map(({ p, s }) => (
          <div key={p} className="rounded-lg border border-border bg-card p-3" data-cs-progress-project={p}>
            <BudgetBar ar={ar} thresholds={th} title={<AppLink to={`cost/sheet?project=${encodeURIComponent(p)}`}><span data-no-i18n>{pTitle(p, ar)}</span></AppLink>} budget={s.total.budget} budgetText={`${t("budget", "الموازنة")} ${compact(s.total.budget, ar)}`}
              parts={[{ key: "actual", label: t("Actual", "الفعلي"), value: s.total.actual, display: compact(s.total.actual, ar), tone: "actual" }, { key: "committed", label: t("Open commitment", "الالتزام المفتوح"), value: s.total.committed, display: compact(s.total.committed, ar), tone: "committed" }]}
              note={<>{t("Remaining", "المتبقي")} <b data-no-i18n className={s.total.remaining < 0 ? "text-destructive" : "text-success"}>{signedCompact(s.total.remaining, ar)}</b></>} attrs={{ "data-cs-progress-pct": String(s.total.pct ?? "") }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ C5-06 Budget vs Actual summary (the same rows as the table) ------------------------------------------------------------------ */
export function BudgetVsActualSummary({ rows }: { rows: Record<string, unknown>[] }) {
  const { t, ar } = useCx();
  const n = (r: Record<string, unknown>, k: string) => Number(r[k] ?? 0) || 0;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const budget = r2(rows.reduce((a, r) => a + n(r, "revised"), 0)), committed = r2(rows.reduce((a, r) => a + n(r, "committed"), 0)), actual = r2(rows.reduce((a, r) => a + n(r, "actual"), 0));
  const used = r2(committed + actual), remaining = r2(budget - used), over = rows.filter((r) => n(r, "over_budget")).length;
  const share = (v: number) => (budget > 0 ? v / Math.max(budget, used) : 0);
  const pct = budget > 0 ? Math.round((used / budget) * 1000) / 10 : null;
  return (
    <div className="mb-3 grid gap-2" data-bva-summary data-bva-rows={rows.length}>
      <RemainingBar label={t("Remaining", "المتبقي")} value={riyal(signedAmount(remaining))} negative={remaining < 0} level={budget > 0 ? (useLevel(used, budget, budgetThresholds()) === "none" ? "ok" : useLevel(used, budget, budgetThresholds()) as "ok" | "warn" | "over") : over ? "over" : "ok"}
        pctText={pct === null ? "—" : t(`${pct}% used`, `${pct}% مستخدم`)} budgetText={t(`of ${amount(budget)} revised budget · ${rows.length} lines · ${over} over budget`, `من موازنة معدلة ${amount(budget)} · ${rows.length} بندًا · ${over} متجاوز`)}
        parts={[{ key: "actual", label: t("Actual", "الفعلي"), display: amount(actual), share: share(actual), tone: "actual" }, { key: "committed", label: t("Open commitment", "الالتزام المفتوح"), display: amount(committed), share: share(committed), tone: "committed" },
          { key: "remaining", label: t("Remaining", "المتبقي"), display: amount(Math.max(0, remaining)), share: share(Math.max(0, remaining)), tone: "remaining" }, ...(used > budget ? [{ key: "over", label: t("Over budget", "تجاوز"), display: amount(r2(used - budget)), share: share(used - budget), tone: "over" as const }] : [])]}
        note={t(`Computed from the ${rows.length} rows below (the records you may read); compact: budget ${compact(budget, ar)}, commitment ${compact(committed, ar)}, actual ${compact(actual, ar)}.`, `محسوب من ${rows.length} صفًا أدناه (السجلات التي يحق لك قراءتها)؛ مختصر: الموازنة ${compact(budget, ar)}، الالتزام ${compact(committed, ar)}، الفعلي ${compact(actual, ar)}.`)} />
    </div>
  );
}

/* ------------------------------------------------------------------ one project (cost sheet, Project 360 cost tab) ------------------------------------------------------------------ */
export function ProjectCostOverview({ project, asOf }: { project: string; asOf?: string | undefined }) {
  const { t } = useCx();
  return (
    <div className="mb-4 grid gap-4" data-cs-overview={project}>
      <EacEquationPanel projects={[project]} asOf={asOf} />
      <section className="grid gap-2" data-cs-block="rings"><h3 className="ek-h3">{t("Remaining to spend — project and its subcontracts", "المتبقي للصرف — المشروع ومقاولو الباطن")}</h3><RemainingRings projects={[project]} asOf={asOf} subcontracts={5} /></section>
      <section className="ek-card" data-cs-block="strip"><header className="ek-card-head"><div className="min-w-0"><h3 className="ek-h3">{t("Forecast — last 12 periods", "التوقع — آخر 12 فترة")}</h3><p className="ek-card-sub">{t("One cell per month: green approved, amber draft, grey not started; a cell opens its forecast.", "خلية لكل شهر: أخضر معتمد، كهرماني مسودة، رمادي لم يبدأ؛ الخلية تفتح توقعها.")}</p></div></header><div className="ek-card-pad"><ForecastStripPanel projects={[project]} /></div></section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <BudgetSheetPanel projects={[project]} asOf={asOf} />
        <CostRankPanel projects={[project]} asOf={asOf} />
      </div>
    </div>
  );
}
