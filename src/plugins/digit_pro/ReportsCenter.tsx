// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { reportsQuery, type ReportEntry } from "@/lib/catalog";
import { RUNNERS } from "@/lib/reportRunner";
import { ProFrame } from "./ProFrame";
import { useNavResolver } from "./ProSidebar";
import { targetHref } from "./nav";
import { AREAS, KIND_LABEL, buildCenter, type CenterEntry, type ReportKind } from "./reportsCenter";
import { translateTo, useLang } from "@/i18n";
import { useSessionUser, userRoles } from "@/lib/session";
import { allOwnViews, sanitizeView, searchFromState, useViewsVersion, type SavedView } from "./savedViews";
import { specById, specByRoute } from "./viewSpecs";
import { appOf, financeContext, slug } from "./finance";
import { canReadType } from "@/lib/scope";
import { LINK_CHIP } from "@/components/enterprise/kit";
import { Star } from "lucide-react";
import { clearRecent, favorites, isFavorite, recent, recordOpen, resolvePrefs, toggleFavorite, useReportPrefsVersion } from "./reportPrefs";
import { CENTER_TABS, DECISION_GROUPS, asTab, decisionSearch, defaultTabFor, freshness, resolveDecisions, type CenterTab, type DecisionGroup, type DecisionTab, type ResolvedDecision } from "./reportsDecision";

type Q = { area?: string | undefined; q?: string | undefined; kind?: string | undefined; all?: string | undefined; tab?: string | undefined; company?: string | undefined };
const KIND_CLS: Record<ReportKind, string> = { pro: "bg-primary/10 text-primary", preview: "bg-success/15", server: "bg-warning/20", list: "bg-muted", missing: "bg-muted text-muted-foreground" };
const FRESH_DTS = [...new Set(DECISION_GROUPS.flatMap((g) => g.items.flatMap((i) => (i.fresh ? [i.fresh.doctype] : []))).concat(["Warehouse", "Item", "Bin"]))];
/** DocTypes offered in the report builder row (Report View of the native list), shown only when the user may read them. */
const BUILDER_DTS = ["Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry", "GL Entry", "Stock Ledger Entry", "Sales Order", "Purchase Order"];
const TAB_LABEL: Record<"mine" | "all", [string, string]> = { mine: ["My reports", "تقاريري"], all: ["All reports", "كل التقارير"] };

/** Reports Center: decision reports by role group (CFO / Sales / Procurement / Inventory / Assets), My reports and the
 * full directory of every department report, DIGIT Pro screen and compliance resource — each opening its source. */
export function ReportsCenter({ search }: { search: Q }) {
  const nav = useNavigate();
  const set = (p: Q) => void nav({ to: "/pro/reports", search: ((prev: Q) => ({ ...prev, ...p })) as never, replace: true });
  const reps = useQuery(reportsQuery);
  const r = useNavResolver();
  const ar = useLang() === "ar"; const tr = (en: string, arabic: string) => (ar ? arabic : en);
  return (
    <ProFrame title="Reports & Compliance" subtitle="Every report by department — DIGIT Pro screens, native DIGIT reports and compliance resources, each opening its source." tabs={false} icon="/icons/digit/mod/digit-mod-reports-light.svg" doctypes={FRESH_DTS}>
      {({ user }) => {
        const all = buildCenter(reps.data ?? [], (n) => n in RUNNERS);
        const visible = all.filter((e) => r.state(e.item) !== "denied");
        const hidden = all.length - visible.length;
        const ctx = financeContext(search.company, user);
        const directory = !!(search.q || search.area || search.kind || search.all);
        const tab: CenterTab = asTab(search.tab) ?? (directory ? "all" : defaultTabFor(user));
        const group = DECISION_GROUPS.find((g) => g.id === tab);
        const roles = userRoles(user).filter((x) => x !== "All" && x !== "Guest");
        return (
          <div className="dp-ws" data-dp-reports-center data-tab={tab}>
            {/* section tabs directly under the band (ONE STANDARD R2), then the report context */}
            <div role="tablist" aria-label={tr("Report groups", "مجموعات التقارير")} className="dp-cc-tabs dp-rc-tabs" data-dp-rc-tabs>
              {CENTER_TABS.map((id) => { const g = DECISION_GROUPS.find((x) => x.id === id); const lbl = g ? g.label : TAB_LABEL[id as "mine" | "all"];
                return <button key={id} type="button" role="tab" id={`dp-rc-tab-${id}`} aria-controls="dp-rc-panel" aria-selected={tab === id} className="dp-cc-tab" onClick={() => set({ tab: id })} data-dp-rc-tab={id}>
                  {ar ? lbl[1] : lbl[0]}{g && <span className="dp-cc-badge chip bg-muted text-[10px]" data-no-i18n>{g.items.length}</span>}</button>; })}
            </div>
            <section className="dp-context" aria-label={tr("Report context", "سياق التقارير")} data-dp-rc-context>
              <label className="dp-ctx-item"><span>{tr("Company", "الشركة")}</span>
                <select className="field-input" value={ctx.company} onChange={(e) => set({ company: e.target.value || undefined })} data-dp-rc-company>{ctx.companies.map((c) => <option key={c} value={c} data-no-i18n>{c}</option>)}</select></label>
              <div className="dp-ctx-item"><span>{tr("Currency", "العملة")}</span><b data-no-i18n>{ctx.currency || "—"}</b></div>
              <div className="dp-ctx-item"><span>{tr("Role", "الدور")}</span><b className="truncate" data-no-i18n title={roles.join(", ")}>{user === "Administrator" ? tr("Administrator", "المسؤول") : roles.slice(0, 2).map((x) => translateTo(x, ar ? "ar" : "en")).join(" · ") || "—"}</b></div>
              <div className="dp-ctx-item"><span>{tr("Reports you can open", "التقارير المتاحة لك")}</span><b data-no-i18n data-dp-rc-count={visible.length}>{reps.data ? visible.length : "…"}</b></div>
              <label className="dp-ctx-item min-w-[14rem] flex-1"><span>{tr("Search all reports", "ابحث في كل التقارير")}</span>
                <input type="search" className="field-input w-full" placeholder={tr("Find a report or source document", "ابحث عن تقرير أو مستند مصدر")} aria-label={tr("Find a report or source document", "ابحث عن تقرير أو مستند مصدر")} value={search.q ?? ""} onChange={(e) => set({ q: e.target.value || undefined, ...(e.target.value ? { tab: "all" } : {}) })} data-dp-ws-search /></label>
            </section>
            {/* Report builder (Frappe Report View): pick columns, group, filter and save a view over a native list — one click from here */}
            <nav className="ek-link-row flex flex-wrap items-center gap-2" aria-label={tr("Build a report", "منشئ التقارير")} data-dp-rc-builder>
              <span className="text-sm font-semibold">{tr("Build a report", "منشئ التقارير")}</span>
              {BUILDER_DTS.filter((dt) => canReadType(dt, user)).map((dt) => <Link key={dt} to="/app/$app/$doctype" params={{ app: appOf(dt), doctype: slug(dt) }} search={{ view: "report" } as never} className={LINK_CHIP} data-dp-rc-builder-dt={dt}>{translateTo(dt, ar ? "ar" : "en")}</Link>)}
            </nav>
            <div id="dp-rc-panel" role="tabpanel" aria-labelledby={`dp-rc-tab-${tab}`} className="grid gap-4">
              {group && <DecisionZone group={group} reports={reps.data} center={all} company={ctx.company} user={user} r={r} ar={ar} />}
              {tab === "mine" && <><MySavedViews /><MyReports visible={visible} r={r} /></>}
              {tab === "all" && <Directory search={search} set={set} visible={visible} hidden={hidden} loaded={!!reps.data} r={r} />}
            </div>
            <p className="text-xs text-muted-foreground">{ar ? "التقارير الموسومة «تعمل على خادم DIGIT» تفتح بعوامل تصفيتها الأصلية؛ ونتائجها ينتجها خادم DIGIT وليس هذه المعاينة." : "\"Runs on DIGIT server\" reports open with their native filters; their results are produced by the DIGIT server, not by this preview."}</p>
          </div>
        );
      }}
    </ProFrame>
  );
}

/** Decision reports for one role group: question answered, calculation basis, source freshness and type. */
function DecisionZone({ group, reports, center, company, user, r, ar }: { group: DecisionGroup; reports: ReportEntry[] | undefined; center: CenterEntry[]; company: string; user: string; r: ReturnType<typeof useNavResolver>; ar: boolean }) {
  const tr = (en: string, arabic: string) => (ar ? arabic : en);
  if (!reports) return <p className="dp-card text-sm text-muted-foreground" aria-busy="true">{tr("Loading reports…", "جارٍ تحميل التقارير…")}</p>;
  const items = resolveDecisions(group, reports, center, (n) => n in RUNNERS);
  return <section className="dp-card" data-dp-rc-group={group.id} aria-labelledby={`dp-rc-h-${group.id}`}>
    <div className="flex flex-wrap items-baseline gap-2">
      <h3 id={`dp-rc-h-${group.id}`} className="text-sm font-semibold">{tr(`${group.label[0]} decision reports`, `تقارير قرار ${group.label[1]}`)}</h3>
      <span className="text-xs text-muted-foreground">{ar ? group.intro[1] : group.intro[0]}</span>
      <Link to="/pro/reports" search={{ tab: "all", area: AREA_OF[group.id] } as never} className="ms-auto text-xs text-primary hover:underline" data-dp-rc-more={group.id}>{tr("Every report in this area", "كل تقارير هذا القسم")}</Link>
    </div>
    <ul className="dp-rc-grid mt-3">{items.map((d) => <li key={d.id}><DecisionCard d={d} company={company} user={user} r={r} ar={ar} /></li>)}</ul>
    <p className="mt-2 text-[11px] text-muted-foreground">{tr("“Latest record” is the newest permitted source date for this company — it shows how current the source is, not a live feed. The report itself calculates every figure.", "«آخر سجل» هو أحدث تاريخ مصدر مسموح به لهذه الشركة — يبيّن حداثة المصدر وليس بثًا مباشرًا. التقرير نفسه يحسب كل رقم.")}</p>
  </section>;
}
const AREA_OF: Record<DecisionTab, string> = { cfo: "accounting", sales: "selling", procurement: "purchasing", inventory: "inventory", assets: "assets" };

function DecisionCard({ d, company, user, r, ar }: { d: ResolvedDecision; company: string; user: string; r: ReturnType<typeof useNavResolver>; ar: boolean }) {
  const tr = (en: string, arabic: string) => (ar ? arabic : en);
  const state = d.available ? r.state({ label: d.label, target: d.target }) : "unavailable";
  const h = state === "ok" ? targetHref(d.target, r.appOf) : undefined;
  const search = decisionSearch(d, company);
  const f = d.fresh && state === "ok" ? freshness(d.fresh, company, user) : undefined;
  const freshLabel = !d.fresh ? tr("Dated per row in the report", "التاريخ لكل صف داخل التقرير")
    : !f ? "—" : f.status === "denied" ? tr("Source not permitted", "المصدر غير مسموح") : f.status !== "ok" ? tr("Source unavailable", "المصدر غير متاح")
    : f.latest ? null : f.future ? tr("Only future-dated records", "سجلات مؤرخة مستقبلًا فقط") : tr("No records for this company yet", "لا توجد سجلات لهذه الشركة بعد");
  const title = translateTo(d.label, ar ? "ar" : "en");
  return <article className="dp-rc-card" data-dp-rc-card={d.id} data-state={state}>
    <div className="flex items-start gap-2">
      {d.centerKey && state === "ok" && <FavStar k={d.centerKey} label={d.label} user={user} />}
      {h ? <Link to={h.to as never} params={h.params as never} search={{ ...(h.search ?? {}), ...search } as never} className="min-w-0 flex-1 font-semibold text-primary hover:underline" onClick={() => d.centerKey && recordOpen(d.centerKey, user)} data-dp-rc-open={d.id}>{title}</Link>
        : <span className="min-w-0 flex-1 font-semibold text-muted-foreground">{title}</span>}
      <span className={`chip shrink-0 text-[10px] ${KIND_CLS[d.kind]}`}>{translateTo(KIND_LABEL[d.kind], ar ? "ar" : "en")}</span>
    </div>
    <p className="mt-1 text-sm">{ar ? d.purpose[1] : d.purpose[0]}</p>
    <dl className="mt-2 grid gap-0.5 text-[11px] text-muted-foreground">
      <div className="flex gap-1"><dt className="shrink-0">{tr("Basis", "الأساس")}:</dt><dd>{ar ? d.basis[1] : d.basis[0]}</dd></div>
      <div className="flex gap-1" data-dp-rc-fresh={f?.latest ?? f?.status ?? "none"}><dt className="shrink-0">{tr("Latest record", "آخر سجل")}:</dt><dd>{freshLabel ?? <bdi className="tabular-nums" data-no-i18n>{f!.latest}</bdi>}{f && f.future > 0 && <span data-dp-rc-future={f.future}> · <bdi data-no-i18n>{f.future}</bdi> {tr("dated after today", "مؤرخة بعد اليوم")}</span>}</dd></div>
      {state === "ok" && search["company"] && <div className="flex gap-1"><dt className="shrink-0">{tr("Opens for", "يفتح على")}:</dt><dd><bdi data-no-i18n>{company}</bdi></dd></div>}
    </dl>
    {state !== "ok" && <p className="mt-2 text-[11px] text-muted-foreground" data-dp-rc-reason>{state === "denied" ? tr("Your role cannot open this report.", "لا يسمح دورك بفتح هذا التقرير.") : state === "loading" ? tr("Checking access…", "جارٍ التحقق من الصلاحية…") : tr("This report is not in the installed sources.", "هذا التقرير غير موجود في المصادر المثبتة.")}</p>}
  </article>;
}

/** Full directory — every department report, DIGIT Pro screen and catalog report, filterable by area and type. */
function Directory({ search, set, visible, hidden, loaded, r }: { search: Q; set: (p: Q) => void; visible: CenterEntry[]; hidden: number; loaded: boolean; r: ReturnType<typeof useNavResolver> }) {
  const ql = (search.q ?? "").trim().toLowerCase();
  const rows = visible.filter((e) => (!search.area || e.area === search.area) && (!search.kind || e.kind === search.kind) && (search.all || e.featured) && (!ql || e.label.toLowerCase().includes(ql) || (e.source ?? "").toLowerCase().includes(ql) || translateTo(e.label, "ar").includes(ql) || (e.source ? translateTo(e.source, "ar").includes(ql) : false)));
  const count = (a?: string) => visible.filter((e) => (!a || e.area === a) && (search.all || e.featured)).length;
  const areas = search.area ? AREAS.filter((a) => a.id === search.area) : AREAS;
  const chips = [search.q && ["q", search.q], search.area && ["area", AREAS.find((a) => a.id === search.area)?.label ?? search.area], search.kind && ["kind", KIND_LABEL[search.kind as ReportKind] ?? search.kind]].filter(Boolean) as [keyof Q, string][];
  return <>
    <section className="dp-card flex flex-wrap items-center gap-2">
      <button type="button" className={`chip inline-flex gap-1 ${!search.area ? "bg-primary text-primary-foreground" : "bg-muted"}`} onClick={() => set({ area: undefined })} data-dp-area="all"><span>All departments</span> <span data-no-i18n>{count()}</span></button>
      {AREAS.map((a) => <button key={a.id} type="button" className={`chip inline-flex gap-1 ${search.area === a.id ? "bg-primary text-primary-foreground" : "bg-muted"}`} onClick={() => set({ area: a.id })} data-dp-area={a.id}><span>{a.label}</span> <span data-no-i18n>{count(a.id)}</span></button>)}
    </section>
    <section className="dp-ws-scope flex flex-wrap items-center gap-2">
      <select className="field-input w-auto" aria-label="Report type" value={search.kind ?? ""} onChange={(e) => set({ kind: e.target.value || undefined })} data-dp-kind>
        <option value="">All types</option>
        {(Object.keys(KIND_LABEL) as ReportKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
      </select>
      <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={!!search.all} onChange={(e) => set({ all: e.target.checked ? "yes" : undefined })} data-dp-all /> <span>Include every DIGIT report of the module</span></label>
      {chips.map(([k, v]) => <button key={k} type="button" className="chip inline-flex items-center gap-1 bg-muted" onClick={() => set({ [k]: undefined } as Q)} data-dp-rc-chip={k}><span>{v}</span> <span aria-hidden>×</span></button>)}
      {hidden > 0 && <p className="text-xs text-muted-foreground" data-dp-hidden><span data-no-i18n>{hidden}</span> <span>items hidden by your permissions</span></p>}
    </section>
    {!loaded ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? <p className="dp-card text-sm text-muted-foreground" data-dp-empty>No reports match these filters.</p> : (
      <div className="grid gap-4">
        {areas.map((a) => {
          const list = rows.filter((e) => e.area === a.id);
          if (!list.length) return null;
          return (
            <section key={a.id} className="dp-card" data-dp-center-area={a.id}>
              <h3 className="text-sm font-semibold"><span>{a.label}</span> <span className="text-muted-foreground" data-no-i18n>({list.length})</span></h3>
              <ul className="mt-2 divide-y divide-border text-sm">{list.map((e) => <Row key={e.key} e={e} r={r} />)}</ul>
            </section>
          );
        })}
      </div>
    )}
  </>;
}

function Row({ e, r }: { e: CenterEntry; r: ReturnType<typeof useNavResolver> }) {
  const t = e.item.target;
  const h = r.state(e.item) === "ok" ? targetHref(t, r.appOf) : undefined;
  const user = useSessionUser();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" data-dp-report={e.label}>
      <FavStar k={e.key} label={e.label} user={user} />
      {h ? <Link to={h.to as never} params={h.params as never} search={h.search as never} className="font-medium hover:underline" onClick={() => recordOpen(e.key, user)} data-dp-report-open={e.key}>{e.label}</Link> : <span className="font-medium text-muted-foreground">{e.label}</span>}
      <span className={`chip text-[11px] ${KIND_CLS[e.kind]}`}>{KIND_LABEL[e.kind]}</span>
      {e.hint && <span className="text-xs text-muted-foreground">{e.hint}</span>}
      <ViewCount e={e} />
      {t.kind === "missing" && <span className="text-xs text-muted-foreground">{t.reason}</span>}
      <span className="ms-auto flex items-center gap-3 text-xs text-muted-foreground">
        {e.source && <span><span>Source</span>: {r.appOf(e.source) ? <Link to="/app/$app/$doctype" params={{ app: r.appOf(e.source)!, doctype: e.source.toLowerCase().replace(/[^a-z0-9]+/g, "_") }} className="hover:underline">{e.source}</Link> : e.source}</span>}
        {e.filters > 0 && <span><span data-no-i18n>{e.filters}</span> <span>filters</span></span>}
      </span>
    </li>
  );
}

function FavStar({ k, label: name, user }: { k: string; label: string; user: string }) {
  useReportPrefsVersion();
  const ar = useLang() === "ar";
  const on = isFavorite(k, user);
  const label = `${on ? (ar ? "إزالة من المفضلة" : "Remove from favorites") : (ar ? "إضافة إلى المفضلة" : "Add to favorites")}: ${translateTo(name, ar ? "ar" : "en")}`;
  return <button type="button" className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" aria-pressed={on} aria-label={label} title={label} onClick={() => toggleFavorite(k, user)} data-dp-fav={k}>
    <Star className={`h-4 w-4 ${on ? "fill-current text-warning" : ""}`} aria-hidden /></button>;
}

/** Favorites and reports recently opened from this directory — personal, browser-scoped, re-checked against current permissions. */
function MyReports({ visible, r }: { visible: CenterEntry[]; r: ReturnType<typeof useNavResolver> }) {
  useReportPrefsVersion();
  const user = useSessionUser();
  const ar = useLang() === "ar"; const t = (en: string, arabic: string) => (ar ? arabic : en);
  const fav = resolvePrefs(favorites(user), visible);
  const rec = resolvePrefs(recent(user), visible);
  const list = (items: CenterEntry[], attr: string) => <ul className="mt-2 divide-y divide-border text-sm" data-dp-pref-list={attr}>{items.map((e) => <Row key={e.key} e={e} r={r} />)}</ul>;
  return <section className="grid gap-4 md:grid-cols-2" data-dp-my-reports>
    <div className="dp-card" data-dp-favorites={fav.items.length}>
      <h3 className="text-sm font-semibold">{t("Favorite reports", "التقارير المفضلة")}</h3>
      {fav.items.length ? list(fav.items, "fav") : <p className="mt-1 text-sm text-muted-foreground">{t("Use the star next to a report to keep it here.", "استخدم النجمة بجانب أي تقرير لإبقائه هنا.")}</p>}
      {fav.hidden > 0 && <p className="mt-1 text-[11px] text-muted-foreground" data-dp-fav-hidden={fav.hidden}><bdi data-no-i18n>{fav.hidden}</bdi> {t("favorites are hidden because you can no longer open them", "مفضلات مخفية لأنه لم يعد بإمكانك فتحها")}</p>}
    </div>
    <div className="dp-card" data-dp-recent={rec.items.length}>
      <div className="flex items-baseline gap-2"><h3 className="text-sm font-semibold">{t("Recently opened", "فُتحت مؤخرًا")}</h3>
        {rec.items.length > 0 && <button type="button" className="ms-auto text-xs text-muted-foreground hover:underline" onClick={() => clearRecent(user)} data-dp-recent-clear>{t("Clear", "مسح")}</button>}</div>
      {rec.items.length ? list(rec.items, "recent") : <p className="mt-1 text-sm text-muted-foreground">{t("Reports you open from this page appear here.", "تظهر هنا التقارير التي تفتحها من هذه الصفحة.")}</p>}
    </div>
    <p className="text-[11px] text-muted-foreground md:col-span-2">{t("Favorites and recent reports of", "المفضلة والتقارير الأخيرة للمستخدم")} <bdi data-no-i18n>{user}</bdi></p>
  </section>;
}

/** RXP-01: the current user's own saved views across DIGIT Pro registers (browser-scoped preference storage). */
function MySavedViews() {
  useViewsVersion();
  const user = useSessionUser();
  const ar = useLang() === "ar"; const t = (en: string, arabic: string) => (ar ? arabic : en);
  const views = allOwnViews(user).filter((v) => specById(v.report));
  const companies = financeContext(undefined, user).companies;
  return (
    <section className="dp-card" data-dp-my-views={views.length}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold">{t("My saved views", "عروضي المحفوظة")}</h3>
        <span className="text-xs text-muted-foreground">{t("Saved in this browser for", "محفوظة في هذا المتصفح للمستخدم")} <bdi data-no-i18n>{user}</bdi></span>
      </div>
      {!views.length ? <p className="mt-1 text-sm text-muted-foreground">{t("No saved views yet. Open a register such as Receivables, General Ledger, Sales Analytics, Open Purchase Orders or Stock Balance and use “Save as…”.", "لا توجد عروض محفوظة بعد. افتح سجلًا مثل الذمم المدينة أو دفتر الأستاذ العام أو تحليل المبيعات أو أوامر الشراء المفتوحة أو رصيد المخزون واستخدم «حفظ باسم…».")}</p> :
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{views.map((v: SavedView) => { const spec = specById(v.report)!; const search = searchFromState(spec, sanitizeView(v, spec, companies).state, { view: v.id });
          return <li key={v.id} className="flex items-center gap-2" data-dp-my-view={v.id}>
            <Link to={spec.route as never} search={search as never} className="min-w-0 truncate font-medium hover:underline" data-no-i18n>{v.isDefault ? "★ " : ""}{v.name}</Link>
            <span className="text-xs text-muted-foreground">{ar ? spec.ar : spec.label}</span>
          </li>; })}</ul>}
    </section>
  );
}
function ViewCount({ e }: { e: CenterEntry }) {
  useViewsVersion();
  const user = useSessionUser();
  const ar = useLang() === "ar";
  const spec = e.item.target.kind === "pro" ? specByRoute(e.item.target.to) : undefined;
  if (!spec) return null;
  const n = allOwnViews(user).filter((v) => v.report === spec.id).length;
  return <span className="chip inline-flex gap-1 bg-muted text-[11px]" data-dp-view-count={n}>{n ? <><bdi data-no-i18n>{n}</bdi> {ar ? "عروض محفوظة" : "saved views"}</> : (ar ? "يدعم العروض المحفوظة" : "Saved views supported")}</span>;
}
