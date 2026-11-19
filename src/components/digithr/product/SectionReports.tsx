/**
 * HR section "Full reports" (owner brief 2026-11-15 §2): the section's HR report library entries (R01–R25) and its
 * native reports as cards that open the shared report page, plus an inline preview of one report (rpt in the URL)
 * computed by the same runner, so the preview, the report page and the overview figures read one calculation.
 */
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Star, Search } from "lucide-react";
import { CATEGORY_LABEL, CATEGORY_ORDER, recordRun, reportCategory, toggleFavourite, useReportPrefs, type ReportCategory } from "@/plugins/digit_hr/product/reportHub";
import { useStoreVersion } from "@/lib/adapter";
import { formatValue } from "@/lib/format";
import { RUNNERS, runnerDefaults } from "@/lib/reportRunner";
import { t as tr } from "@/i18n";
import { DxPanel } from "@/components/digit/Experience";
import { ReportModeBadge } from "@/components/digithr/ReportModeBadge";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { HR_REPORTS, reportsOfSection } from "@/plugins/digit_hr/product/reports";
import { fmtCurrency } from "@/lib/format";
import { KpiRow } from "@/components/enterprise/kit/templates";
import { RankedBars } from "@/components/enterprise/kit/charts";

export interface NativeReport { id: string; report: string; ref: string }
type Filter = "all" | "fav" | "used";
/** A small picture of what the report draws: ranked bars (reports with a chart column) or a table. */
function Thumb({ kind }: { kind: "bars" | "table" }) {
  return <svg viewBox="0 0 48 32" className="r3-thumb" aria-hidden data-thumb={kind}>
    {kind === "bars" ? <><rect x="4" y="6" width="34" height="5" rx="1.5" fill="var(--deep)" /><rect x="4" y="14" width="24" height="5" rx="1.5" fill="var(--emerald)" /><rect x="4" y="22" width="15" height="5" rx="1.5" fill="var(--em-300)" /></>
      : <><rect x="4" y="5" width="40" height="5" rx="1" fill="var(--em-100)" /><rect x="4" y="13" width="40" height="2" rx="1" fill="var(--line)" /><rect x="4" y="19" width="40" height="2" rx="1" fill="var(--line)" /><rect x="4" y="25" width="40" height="2" rx="1" fill="var(--line)" /></>}
  </svg>;
}
const dmy = (iso: string) => iso.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1");
export function SectionReports({ section, ar, native, rpt, onRpt }: { section: string; ar: boolean; native: NativeReport[]; rpt?: string | undefined; onRpt: (name: string | undefined) => void }) {
  const t = (en: string, a: string) => (ar ? a : en);
  const user = useSessionUser(); const prefs = useReportPrefs(user);
  const [q, setQ] = useState(""); const [filter, setFilter] = useState<Filter>("all");
  const own = reportsOfSection(section);
  const all = [...own.map((r) => ({ key: r.name, title: ar ? r.ar : r.name, sub: `${r.id} · ${tr(r.ref)}`, native: false, ref: r.ref, owner: r.roles[0], chart: !!r.chart })), ...native.filter((r) => !own.some((o) => o.name === r.report)).map((r) => ({ key: r.report, title: tr(r.report), sub: tr(r.ref), native: true, ref: r.ref, owner: undefined as string | undefined, chart: false }))];
  const current = rpt && all.some((r) => r.key === rpt) ? rpt : all.find((r) => RUNNERS[r.key])?.key;
  const needle = q.trim().toLowerCase();
  const shown = all.filter((r) => (filter !== "fav" || prefs.fav.includes(r.key)) && (filter !== "used" || (prefs.runs[r.key]?.n ?? 0) > 0) && (!needle || `${r.title} ${r.key} ${r.sub}`.toLowerCase().includes(needle)))
    .sort((a, b) => (filter === "used" ? (prefs.runs[b.key]?.n ?? 0) - (prefs.runs[a.key]?.n ?? 0) : 0));
  const groups = CATEGORY_ORDER.map((cat) => ({ cat, items: shown.filter((r) => reportCategory(r.key, r.ref) === cat) })).filter((g) => g.items.length);
  const card = (r: (typeof all)[number]) => { const run = prefs.runs[r.key]; const fav = prefs.fav.includes(r.key);
    return <div key={r.key} className={`ek-card r3-report-card flex flex-col p-4 ${r.key === current ? "ring-2 ring-primary" : ""}`} data-hr-report={r.key}>
      <div className="flex items-start gap-3">
        <Thumb kind={r.chart ? "bars" : "table"} />
        <span className="min-w-0 flex-1"><span className="block font-semibold text-foreground">{r.title}</span><span className="mt-0.5 block text-xs text-muted-foreground" data-no-i18n>{r.sub}</span></span>
        <button type="button" className="r3-fav" aria-pressed={fav} onClick={() => toggleFavourite(user, r.key)} title={fav ? t("Remove from favourites", "إزالة من المفضلة") : t("Add to favourites", "إضافة إلى المفضلة")} aria-label={fav ? t(`Remove ${r.title} from favourites`, `إزالة ${r.title} من المفضلة`) : t(`Add ${r.title} to favourites`, `إضافة ${r.title} إلى المفضلة`)} data-hr-report-fav={r.key}><Star size={16} fill={fav ? "currentColor" : "none"} /></button>
      </div>
      <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{t(...CATEGORY_LABEL[reportCategory(r.key, r.ref)])}</span>
        {r.owner && <><span aria-hidden>·</span><span>{t("Owner: ", "المالك: ")}{tr(r.owner)}</span></>}
        <span aria-hidden>·</span><span data-hr-report-last={run?.last ?? ""}>{run ? <>{t("Last run ", "آخر تشغيل ")}<bdi data-no-i18n>{dmy(run.last)}</bdi></> : t("Not run yet", "لم يُشغَّل بعد")}</span>
        {r.native ? <ReportModeBadge report={r.key} refDoctype={r.ref} /> : null}
      </span>
      <span className="mt-auto flex flex-wrap gap-3 pt-3 text-xs font-medium">
        <Link to="/report/$name" params={{ name: r.key }} className="text-primary hover:underline" onClick={() => recordRun(user, r.key)}>{t("Open report", "فتح التقرير")}</Link>
        {RUNNERS[r.key] && r.key !== current && <button type="button" className="text-primary hover:underline" onClick={() => { recordRun(user, r.key); onRpt(r.key); }} data-hr-report-preview={r.key}>{t("Preview here", "معاينة هنا")}</button>}
      </span>
    </div>; };
  const chip = (k: Filter, label: string) => <button type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} data-hr-report-filter={k}>{label}</button>;
  return (
    <div className="space-y-4" data-hr-reports={section}>
      {all.length > 0 && <div className="flex flex-wrap items-center gap-3" data-hr-report-tools>
        <label className="r3-search"><Search size={16} aria-hidden /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search reports", "ابحث في التقارير")} aria-label={t("Search reports", "ابحث في التقارير")} data-hr-report-search /></label>
        <div className="r3-toggle" role="group" aria-label={t("Show", "عرض")}>{chip("all", t(`All (${all.length})`, `الكل (${all.length})`))}{chip("fav", t(`Favourites (${prefs.fav.filter((k) => all.some((r) => r.key === k)).length})`, `المفضلة (${prefs.fav.filter((k) => all.some((r) => r.key === k)).length})`))}{chip("used", t("Most used", "الأكثر استخدامًا"))}</div>
      </div>}
      {all.length === 0 ? <p className="text-sm text-muted-foreground">{t("No report is linked to this section.", "لا توجد تقارير مرتبطة بهذا القسم.")}</p>
        : groups.length === 0 ? <p className="r3-empty text-sm text-muted-foreground" data-hr-report-none>{filter === "fav" ? t("No favourite reports yet — mark one with ★.", "لا توجد تقارير مفضلة بعد — ميّز تقريرًا بـ ★.") : filter === "used" ? t("You have not opened any report here yet — open one to see it here.", "لم تفتح أي تقرير هنا بعد — افتح تقريرًا ليظهر هنا.") : t("No report matches the search.", "لا يوجد تقرير يطابق البحث.")}</p>
        : groups.map((g) => <section key={g.cat} data-hr-report-group={g.cat as ReportCategory}>
          <h3 className="ek-h3 mb-2">{t(...CATEGORY_LABEL[g.cat])} <span className="r3-count" data-no-i18n>{g.items.length}</span></h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-3">{g.items.map(card)}</div>
        </section>)}
      {current && <Preview name={current} ar={ar} title={all.find((r) => r.key === current)?.title ?? current} />}
    </div>
  );
}

function Preview({ name, ar, title }: { name: string; ar: boolean; title: string }) {
  const ver = useStoreVersion(); const user = useSessionUser();
  const t = (en: string, a: string) => (ar ? a : en);
  const res = useMemo(() => { const r = RUNNERS[name]; if (!r) return null; try { return r.run(runnerDefaults(name)); } catch (e) { return { columns: [], rows: [], error: e instanceof Error ? e.message : String(e) }; } }, [name, ver, user]);
  if (!res) return null;
  const cols = res.columns.filter((c) => !c.hidden).slice(0, 8); const rows = res.rows.slice(0, 12);
  // round-2 reports name their cards (= the table totals) and one chart column pair; earlier reports show the table only
  const def = HR_REPORTS.find((r) => r.name === name);
  const kind = (k: string) => def?.cards?.find((c) => c.label === k)?.kind ?? "Float";
  const show = (v: number, k: string) => kind(k) === "Currency" ? fmtCurrency(v, "SAR") : kind(k) === "Percent" ? `${v.toLocaleString(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 1 })}%` : v.toLocaleString(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 1 });
  const cardItems = def?.cards && res.summary ? res.summary.map((x) => ({ id: `${def.id}-${x.label}`, label: ar ? def.cards!.find((c) => c.label === x.label)?.ar ?? x.label : x.label, value: show(x.value, x.label) })) : [];
  const chartCol = def?.chart ? res.columns.find((c) => c.fieldname === def.chart!.value) : undefined;
  const chartData = def?.chart && chartCol ? res.rows.filter((r) => !r["is_total"] && Number(r[def.chart!.value])).map((r, i) => ({ key: `${i}`, label: String(r[def.chart!.label] ?? "—"), value: Number(r[def.chart!.value]) || 0 })) : [];
  return (
    <DxPanel title={title} subtitle={t(`First ${rows.length} of ${res.rows.length} rows with the report's default filters`, `أول ${rows.length} من ${res.rows.length} صفًا بالمرشحات الافتراضية للتقرير`)} flush attrs={{ "data-hr-report-inline": name }}
      actions={<Link to="/report/$name" params={{ name }} className="btn-secondary inline-flex h-8 items-center px-3 text-xs">{t("Full report, filters and export", "التقرير الكامل والمرشحات والتصدير")}</Link>}>
      {cardItems.length > 0 && <div className="px-3 pt-3" data-hr-report-cards={name}><KpiRow items={cardItems} ar={ar} id={`hr-rpt-${def!.id}`} max={4} /></div>}
      {chartData.length > 1 && <div className="px-3 pt-3" data-hr-report-chart={name}><p className="mb-1 text-xs font-medium text-muted-foreground">{tr(chartCol!.label)}</p><RankedBars data={chartData} ar={ar} max={8} fmt={(v) => chartCol!.fieldtype === "Currency" ? fmtCurrency(v, "SAR") : chartCol!.fieldtype === "Percent" ? `${v}%` : v.toLocaleString(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 1 })} /></div>}
      {res.error ? <p className="px-3 py-4 text-sm text-muted-foreground">{res.error}</p> : rows.length ? <div className="max-h-[28rem] overflow-auto">
        <table className="r3-table w-full min-w-[640px] text-sm" data-density="compact">
          <thead className="sticky top-0 bg-card"><tr>{cols.map((c) => <th key={c.fieldname} className={["Currency", "Float", "Int", "Percent"].includes(c.fieldtype) ? "text-end" : "text-start"}>{tr(c.label)}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} {...(r["is_total"] ? { "data-total": "" } : {})}>{cols.map((c) => <td key={c.fieldname} className={`${["Currency", "Float", "Int", "Percent"].includes(c.fieldtype) ? "text-end tabular-nums" : ""}`} data-no-i18n={["Link", "Dynamic Link", "Data"].includes(c.fieldtype) && c.fieldname !== "status" ? true : undefined}>{r[c.fieldname] == null || r[c.fieldname] === "" ? "—" : ["Currency", "Float", "Int", "Percent", "Date"].includes(c.fieldtype) ? formatValue(c.fieldtype, r[c.fieldname]) : String(r[c.fieldname])}</td>)}</tr>)}</tbody>
        </table></div> : <p className="px-3 py-4 text-sm text-muted-foreground">{t("No rows for the default filters.", "لا توجد صفوف بالمرشحات الافتراضية.")}</p>}
    </DxPanel>
  );
}
