/**
 * HR Overview frame (owner brief 2026-11-15 §2): one section's or department's overview hosted on the Core Dashboard
 * Designer — 4 layers: headline figures (change and trend from the records' own dates), the section's charts, computed
 * insights and the decision list with the document's own decision buttons. Every figure, bar and row opens the records it
 * counts (same filters, same scope); layouts and block options are personal through the Designer, gated per role and
 * company by Administration.
 */
import { useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { indexQuery, slugOf } from "@/lib/catalog";
import { fmtNumber, riyal } from "@/lib/format";
import { useSessionUser } from "@/lib/session";
import { BLOCK_OPTIONS_FULL, blockCompareDate, blockWindow, registerDashboard, type DashboardDef, type WidgetData, type WidgetDef } from "@/lib/dashboards/registry";
import { DashboardDesigner } from "@/components/dashboards/DashboardDesigner";
import { DxPanel } from "@/components/digit/Experience";
import { HeroChips, type HeroChipItem } from "@/components/enterprise/kit/templates";
import { scopedList } from "@/plugins/digit_hr/compat/scope";
import { HR_DOC_SEARCH, hrSearch } from "@/plugins/digit_hr/product/urls";
import { approvalRule, decide, decisionErrorText, mayDecide } from "@/plugins/digit_hr/product/approvals";
import { resetCompanyIndex, type Bi, type ChartSpec, type Ctx, type Drill, type KpiSpec, type SectionSpec } from "@/plugins/digit_hr/product/overview/kit";
import { SECTION_PANELS } from "./sectionPanels";

export interface HrOvCtx { on: string; ar: boolean; user: string }
const pick = (ar: boolean, b: Bi) => (ar ? b[1] : b[0]);
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, k: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
function compact(v: number, ar: boolean) { const a = Math.abs(v); const [d, s] = a >= 1e9 ? [1e9, ar ? " مليار" : "B"] : a >= 1e6 ? [1e6, ar ? " مليون" : "M"] : a >= 1e3 ? [1e3, ar ? " ألف" : "K"] : [1, ""]; return `${fmtNumber(v / d, d === 1 ? 0 : 1)}${s}`; }
const UNIT_WORDS: Record<KpiSpec["unit"], Bi> = { count: ["Count", "عدد"], money: ["SAR", "ريال سعودي"], pct: ["Percent", "نسبة مئوية"], days: ["Days", "أيام"], hours: ["Hours", "ساعات"] };
export function figText(v: number, unit: KpiSpec["unit"], ar: boolean) {
  if (unit === "money") return riyal(compact(v, ar));
  if (unit === "pct") return `${fmtNumber(v, 1)}%`;
  if (unit === "days") return `${fmtNumber(v, Number.isInteger(v) ? 0 : 1)} ${ar ? "يوم" : "d"}`;
  if (unit === "hours") return `${fmtNumber(v, Number.isInteger(v) ? 0 : 1)} ${ar ? "ساعة" : "h"}`;
  return fmtNumber(v, Number.isInteger(v) ? 0 : 1);
}
/** Month-ends of the five months before `on`, then `on` (oldest first). */
const trendDates = (on: string) => { const y = Number(on.slice(0, 4)), m = Number(on.slice(5, 7)); const out: string[] = []; for (let i = 5; i >= 1; i--) out.push(new Date(Date.UTC(y, m - i, 0)).toISOString().slice(0, 10)); return [...out, on]; };
const ctxOf = (c: HrOvCtx, o: Record<string, string>, on = c.on): Ctx => ({ on, ar: c.ar, user: c.user, company: o["company"] || undefined });
const readable = (dts: string[]) => () => dts.some((d) => { try { scopedList(d); return true; } catch { return false; } });

/** One figure as a KPI block: value at the block's window end, change against the comparison date and a six-point trend when the figure can be rebuilt from dates. */
export function kpiWidget(k: KpiSpec, scope?: string): WidgetDef<HrOvCtx> {
  return { id: `k:${k.id}`, version: 1, title: k.title, meaning: k.meaning, sources: k.sources, shape: "number", defaultView: "kpi", size: { w: 3 }, group: ["Key figures", "المؤشرات الرئيسية"], readable: readable(k.sources), options: BLOCK_OPTIONS_FULL,
    data: (c, o): WidgetData => { try {
      resetCompanyIndex();
      const win = blockWindow(o, c.on); const on = win ? (win.to > c.on ? c.on : win.to) : c.on;
      const cx = ctxOf(c, o, on);
      const f = on !== c.on && k.at ? { value: k.at(cx, on) } as ReturnType<KpiSpec["value"]> : k.value(cx);
      if (f.status && f.status !== "ok") return { kind: "number", status: f.status, value: 0, ...(f.reason ? { reason: f.reason } : {}) };
      if (f.value === null) return { kind: "number", status: "unavailable", value: 0, reason: f.reason ?? ["No value for this scope.", "لا توجد قيمة لهذا النطاق."] };
      const out: WidgetData = { kind: "number", status: "ok", value: f.value, display: figText(f.value, k.unit, c.ar), ...(f.sub ? { sub: [pick(c.ar, f.sub)] } : {}), ...(f.drill ? { drill: f.drill } : {}), asOf: on, scopeLabel: o["company"] ? [o["company"], o["company"]] : ["All companies", "كل الشركات"], unitLabel: UNIT_WORDS[k.unit], ...(scope ? { seenKey: `${c.user}:${scope}:${k.id}` } : {}) };
      if (k.at) {
        const pts = trendDates(on).map((d) => (d === on ? f.value : k.at!(cx, d)));
        if (pts.every((v) => v !== null) && new Set(pts).size > 1) out.spark = pts as number[];
        if (o["pcmp"] !== "none") { const cd = blockCompareDate(o, c.on) ?? addDays(on, -30); const prev = k.at(cx, cd); const v = f.value;
          if (prev !== null) { const pct = prev === 0 ? (v === 0 ? 0 : null) : ((v - prev) / Math.abs(prev)) * 100; if (pct !== null) out.delta = { pct: Math.round(pct * 10) / 10, ...(k.better !== "none" ? { better: k.better } : {}), label: `${c.ar ? "عن" : "vs"} ${cd}` }; } }
      }
      return out;
    } catch { return { kind: "number", status: "unavailable", value: 0, reason: ["This figure could not be computed from the records in scope.", "تعذر حساب هذا الرقم من السجلات ضمن النطاق."] }; } } };
}
export function chartWidget(v: ChartSpec, group: Bi = ["Charts", "الرسوم البيانية"]): WidgetDef<HrOvCtx> {
  return { id: `c:${v.id}`, version: 1, title: v.title, meaning: v.meaning, sources: v.sources, shape: v.shape, defaultView: v.view, size: v.size, group, readable: readable(v.sources),
    data: (c, o) => { try { resetCompanyIndex(); return v.data(ctxOf(c, o)); } catch { return { kind: "series", status: "unavailable", points: [], reason: ["This chart could not be computed from the records in scope.", "تعذر حساب هذا الرسم من السجلات ضمن النطاق."] }; } } };
}
const CACHE = new Map<string, DashboardDef<HrOvCtx>>();
/** The Designer contract of one overview (registered once per section / department). */
export function overviewDashboard(key: string, title: Bi, spec: SectionSpec): DashboardDef<HrOvCtx> {
  const hit = CACHE.get(key); if (hit) return hit;
  const sources = [...new Set([...spec.kpis.flatMap((k) => k.sources), spec.primary.sources].flat())];
  const widgets: WidgetDef<HrOvCtx>[] = [
    ...spec.kpis.map((k) => kpiWidget(k, key)),
    ...(SECTION_PANELS[key] ?? []),
    chartWidget(spec.primary), ...(spec.secondary ? [chartWidget(spec.secondary)] : []), ...(spec.extra ?? []).map((x) => chartWidget(x)),
    { id: "insights", version: 1, title: ["What changed and why", "ما الذي تغير ولماذا"], meaning: ["Computed sentences from the records behind this overview: risks first, each with the records it is about.", "جمل محسوبة من السجلات التي تقوم عليها هذه النظرة العامة: المخاطر أولًا، ولكل جملة سجلاتها."], sources, shape: "panel", defaultView: "panel", size: { w: 12 }, group: ["Insight", "التحليل"], render: (c, o) => <InsightPanel spec={spec} ctx={ctxOf(c, o)} /> },
    { id: "decisions", version: 1, title: ["Decisions waiting", "قرارات بانتظارك"], meaning: ["Items that need an action from you here, approvals first then the oldest; approve and reject run the document's own decision step.", "البنود التي تحتاج إجراءً منك هنا، الاعتمادات أولًا ثم الأقدم؛ الاعتماد والرفض ينفذان خطوة القرار الخاصة بالمستند."], sources, shape: "panel", defaultView: "panel", size: { w: 12 }, group: ["Work", "العمل"], render: (c, o) => <DecisionPanel spec={spec} ctx={ctxOf(c, o)} /> },
  ];
  const def = registerDashboard<HrOvCtx>({ app: "digit_hr", id: `hr-ov:${key}`, title, widgets, managerRoles: ["HR Manager"], companyRoles: ["HR Manager"], globalRoles: ["System Manager"],
    filters: [{ key: "company", label: ["Company", "الشركة"], choices: () => { try { return scopedList("Company").map((x) => ({ value: x.name, label: String(x["company_name"] ?? x.name), data: true })); } catch { return []; } } }] });
  CACHE.set(key, def); return def;
}

/** Drill → link to the native list (with the card's filters) or form, kept inside the HR app frame. */
export function useHrDrill() {
  const idx = useQuery(indexQuery);
  const route = (dt: string) => { const e = idx.data?.find((x) => x.name === dt); return e ? { app: e.app, slug: e.slug } : dt.startsWith("DIGIT ") ? { app: "hrms", slug: slugOf(dt) } : undefined; };
  return (drill: unknown, children: ReactNode, attrs: Record<string, string> = {}): ReactNode => {
    const d = drill as Drill | undefined; const cls = attrs["className"] ?? "hover:underline"; const { className: _c, ...rest } = attrs;
    if (!d || typeof d !== "object" || !("kind" in d)) return children;
    if (d.kind === "list" || d.kind === "doc") {
      const r = route(d.doctype); if (!r) return children;
      if (d.kind === "doc") return <Link to="/app/$app/$doctype/$name" params={{ app: r.app, doctype: r.slug, name: d.name }} search={HR_DOC_SEARCH as never} className={cls} {...rest} data-hr-drill="doc">{children}</Link>;
      return <Link to="/app/$app/$doctype" params={{ app: r.app, doctype: r.slug }} search={hrSearch(d.filters?.length ? { filters: JSON.stringify(d.filters) } : {}) as never} className={cls} {...rest} data-hr-drill="list">{children}</Link>;
    }
    if (d.kind === "report") return <Link to="/report/$name" params={{ name: d.report }} search={hrSearch(d.filters ?? {}) as never} className={cls} {...rest} data-hr-drill="report">{children}</Link>;
    return <Link to={d.to as never} search={(d.search ?? {}) as never} className={cls} {...rest} data-hr-drill="page">{children}</Link>;
  };
}

function InsightPanel({ spec, ctx }: { spec: SectionSpec; ctx: Ctx }) {
  const link = useHrDrill(); const ver = useStoreVersion();
  const items = useMemo(() => { try { resetCompanyIndex(); return spec.insights(ctx); } catch { return []; } }, [spec, ctx.on, ctx.company, ctx.user, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <DxPanel title={pick(ctx.ar, ["What changed and why", "ما الذي تغير ولماذا"])} subtitle={pick(ctx.ar, ["Computed from the records behind the figures above", "محسوبة من السجلات التي تقوم عليها الأرقام أعلاه"])} attrs={{ "data-hr-insights": spec.id }}>
      {items.length ? <ul className="ek-insights space-y-1.5 text-sm">{items.map((i) => (
        <li key={i.key} className="flex items-start gap-2" data-insight={i.key} data-tone={i.tone}>
          <span aria-hidden className={`mt-1.5 inline-block size-2 shrink-0 rounded-full ${i.tone === "good" ? "bg-success" : i.tone === "risk" ? "bg-destructive" : "bg-info"}`} />
          <span>{i.drill ? link(i.drill, pick(ctx.ar, i.text), { className: "hover:underline" }) : pick(ctx.ar, i.text)}</span>
        </li>))}</ul> : <p className="text-sm text-muted-foreground">{pick(ctx.ar, ["Nothing to report for this scope.", "لا شيء يستحق الذكر في هذا النطاق."])}</p>}
    </DxPanel>
  );
}

const KIND: Record<string, Bi> = { approve: ["Approve", "اعتماد"], fix: ["Fix", "معالجة"], follow: ["Follow up", "متابعة"] };
function DecisionPanel({ spec, ctx }: { spec: SectionSpec; ctx: Ctx }) {
  const link = useHrDrill(); const ver = useStoreVersion(); const user = useSessionUser();
  const items = useMemo(() => { try { resetCompanyIndex(); return spec.decisions(ctx); } catch { return []; } }, [spec, ctx.on, ctx.company, ctx.user, ver, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = items.slice(0, 10);
  const act = (dt: string, name: string, verdict: "approve" | "reject") => {
    let note = ""; if (verdict === "reject") { const r = window.prompt(pick(ctx.ar, ["Reason for rejecting", "سبب الرفض"])); if (r === null) return; note = r; }
    const errs = decide(dt, name, verdict, note, user);
    if (errs.length) toast.error(errs.map((e) => decisionErrorText(e, ctx.ar)).join("\n")); else toast.success(pick(ctx.ar, verdict === "approve" ? ["Approved", "تم الاعتماد"] : ["Rejected", "تم الرفض"]));
  };
  return (
    <DxPanel title={<span>{pick(ctx.ar, ["Decisions waiting", "قرارات بانتظارك"])} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({items.length})</span></span>} subtitle={pick(ctx.ar, ["Approvals first, then the oldest; each button runs the document's own step", "الاعتمادات أولًا ثم الأقدم؛ كل زر ينفذ خطوة المستند نفسه"])} flush attrs={{ "data-hr-decisions": spec.id }}>
      {shown.length ? <ul className="divide-y divide-border text-sm">{shown.map((d) => { const can = d.kind === "approve" && approvalRule(d.doctype) ? (() => { const doc = adapter.get(d.doctype, d.name); return doc ? mayDecide(d.doctype, doc, user) : { ok: false }; })() : { ok: false };
        return (
        <li key={d.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2" data-decision={d.name} data-decision-kind={d.kind}>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{link(d.drill ?? { kind: "doc", doctype: d.doctype, name: d.name }, <span data-no-i18n>{d.title}</span>, { className: "text-primary hover:underline" })}</span>
            <span className="block text-xs text-muted-foreground"><span data-no-i18n>{pick(ctx.ar, d.sub)}</span> · {pick(ctx.ar, [`${d.age} days`, `${d.age} يومًا`])}</span>
          </span>
          {can.ok ? <span className="flex gap-1.5">
            <button type="button" className="btn-primary h-8 px-3 text-xs" onClick={() => act(d.doctype, d.name, "approve")} data-decide="approve">{pick(ctx.ar, ["Approve", "اعتماد"])}</button>
            <button type="button" className="btn-secondary h-8 px-3 text-xs" onClick={() => act(d.doctype, d.name, "reject")} data-decide="reject">{pick(ctx.ar, ["Reject", "رفض"])}</button>
          </span> : <span className="chip bg-muted text-muted-foreground">{pick(ctx.ar, KIND[d.kind] ?? KIND["follow"]!)}</span>}
        </li>); })}</ul> : <p className="px-3 py-4 text-sm text-muted-foreground">{pick(ctx.ar, ["Nothing is waiting for you here.", "لا شيء بانتظارك هنا."])}</p>}
    </DxPanel>
  );
}

/** The overview of one section or department on the Core Dashboard Designer (company filter in the host's URL state). */
export function OverviewFrame({ dashKey, title, spec, ar, company, onCompany }: { dashKey: string; title: Bi; spec: SectionSpec; ar: boolean; company?: string | undefined; onCompany: (c: string | undefined) => void }) {
  const user = useSessionUser();
  const def = useMemo(() => overviewDashboard(dashKey, title, spec), [dashKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const link = useHrDrill();
  return (
    <div data-hr-overview={dashKey}>
      <DashboardDesigner def={def} ctx={{ on: today(), ar, user }} link={link} company={company} strip={{ tagAttr: "data-hr-kpi", flat: true }} filterValues={company ? { company } : {}} onFilters={(n) => onCompany(n["company"] || undefined)} />
    </div>
  );
}

/**
 * The band's three live headline chips of a section or department (visual round R3 §3.1): the spec's `hero` figures (else
 * the first three with a value), computed by the same KPI block as the overview cards, so a chip, its card and its drill
 * read one formula. Count figures read "244 employees paid"; amounts and rates read "Net pay, last run ⃁ 2.1M · ▲1.3%".
 */
export function SectionHeroChips({ spec, ar, company }: { spec: SectionSpec | undefined; ar: boolean; company?: string | undefined }) {
  const user = useSessionUser(); const ver = useStoreVersion(); const link = useHrDrill();
  const items = useMemo<HeroChipItem[]>(() => {
    if (!spec) return [];
    const pickK = spec.hero?.length ? spec.hero.map((id) => spec.kpis.find((k) => k.id === id || k.id.endsWith(`-${id}`))).filter((k): k is KpiSpec => !!k) : spec.kpis;
    const out: HeroChipItem[] = [];
    for (const k of pickK) {
      if (out.length >= 3) break;
      const d = kpiWidget(k).data?.({ on: today(), ar, user }, company ? { company } : {});
      if (!d || d.kind !== "number" || d.status !== "ok") continue;
      const label = pick(ar, k.chip ?? [k.title[0].split(" — ")[0]!, k.title[1].split(" — ")[0]!]);
      const value = d.display ?? String(d.value);
      out.push({ id: k.id, label: k.unit === "count" ? undefined : label, value: k.unit === "count" ? <>{value} <span className="ek-hero-chip-l">{label}</span></> : value,
        ...(d.delta ? { delta: { pct: d.delta.pct, better: k.better } } : {}), ...(d.drill ? { wrap: (n: ReactNode) => link(d.drill, n, { className: "contents" }) } : {}) });
    }
    return out;
  }, [spec, ar, user, ver, company]); // eslint-disable-line react-hooks/exhaustive-deps
  return items.length ? <HeroChips items={items} ar={ar} /> : null;
}
