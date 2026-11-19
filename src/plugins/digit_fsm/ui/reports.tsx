/**
 * N73 Dashboard & report catalogue and the report runner (RP01–RP20). A report page reads only permitted rows (the
 * report's run() uses the shared scope boundary), applies URL filters (scope filters + exact column filters coming from
 * a KPI drill), shows the KPI that opened it computed from the SAME filtered rows (K → RP reconciliation), renders Link
 * columns as canonical record links, and exports exactly the visible rows as CSV. Server-required columns say so.
 */
import { useMemo } from "react";
import type { PluginPageProps } from "@/plugins/pages";
import { FSM_KPIS, kpiById, kpiValue } from "../analytics/kpis";
import { FSM_REPORTS, reportAccess, reportById, type ReportColumn, type ReportDef } from "../domain/reports";
import { s, type Row } from "../domain/rules";
import { ScopeControls } from "./home";
import { AppLink, BAND, DataTable, DocRef, DxState, Kpi, PageHeader, Panel, SignalGrid, StateChip, dateTxt, dtLabel, dtTxt, money, numTxt, opt, useFx, useUrlState, type Col } from "./kit";
import { PageInsights } from "./ov/ded";

const STATUS_AR: Record<string, string> = { VIRTUAL: "افتراضي كامل", PARTIAL: "جزئي", SERVER_REQUIRED: "يتطلب الخادم" };
const statusChip = (st: string, ar: boolean) => <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${st === "VIRTUAL" ? "bg-dx-good-soft text-dx-good" : st === "PARTIAL" ? "bg-dx-warn-soft text-dx-warn" : "bg-dx-neutral-soft text-dx-neutral"}`} data-report-status={st}>{ar ? STATUS_AR[st] ?? st : st === "VIRTUAL" ? "Virtual" : st === "PARTIAL" ? "Partial" : "Server required"}</span>;
const SCOPE_KEYS = new Set(["company", "site", "customer", "from", "to", "as_of", "system", "technician", "device", "agreement"]);
const CHIP_FIELDS = /status|state|outcome|result|decision|lifecycle|severity/;

export function ReportsPage() {
  const fx = useFx(); const { t, ar } = fx;
  const groups = [...new Set(FSM_KPIS.map((k) => (ar ? k.role_ar : k.role)))];
  return (
    <div className="w-full min-w-0" data-page="fsm-reports">
      <PageHeader title={t("Dashboard & report catalogue", "دليل اللوحات والتقارير")} band={{
        question: t("Which metric answers my question, and which report proves it?", "أي مؤشر يجيب عن سؤالي، وأي تقرير يثبته؟"),
        basis: t("30 KPI contracts (K01–K30) and 20 relational reports (RP01–RP20). Every KPI opens its report filtered to the rows it counts. Server-required metrics are labelled, never filled with demo numbers.", "30 مؤشراً (K01–K30) و20 تقريراً علائقياً (RP01–RP20). كل مؤشر يفتح تقريره مصفى بالصفوف التي يعدّها. المؤشرات التي تتطلب الخادم موسومة ولا تُملأ بأرقام تجريبية."),
        meta: [{ label: t("Reports", "التقارير"), value: <span data-no-i18n>{FSM_REPORTS.length}</span> }, { label: t("KPIs", "المؤشرات"), value: <span data-no-i18n>{FSM_KPIS.length}</span> }, { label: t("Server required", "يتطلب الخادم"), value: <span data-no-i18n>{FSM_KPIS.filter((k) => k.status === "SERVER_REQUIRED").length + FSM_REPORTS.filter((r) => r.status === "SERVER_REQUIRED").length}</span> }],
        actions: <AppLink to="executive" className={BAND.secondary}>{t("Executive overview", "النظرة التنفيذية")}</AppLink>,
      }} />
      <PageInsights k="all-reports" blocks={[
        { id: "catalogue", title: ["Relational reports", "التقارير العلائقية"], node: (
      <Panel title={t("Relational reports", "التقارير العلائقية")} flush={false}>
        <DataTable id="report-catalogue" rows={FSM_REPORTS.map((r) => ({ ...r, name: r.id, access: reportAccess(r).ok ? 1 : 0 }) as unknown as Row & { name: string })} pageSize={25} empty="—" cols={[
          { key: "name", label: t("Report", "التقرير"), value: (r) => s(r.name), render: (r) => <AppLink to={`reports/${s(r.name)}`}><span className="font-mono text-xs text-muted-foreground" data-no-i18n>{s(r.name)}</span> {ar ? s(r["title_ar"]) : s(r["title"])}</AppLink> },
          { key: "question", label: t("Question", "السؤال"), render: (r) => <span>{ar ? s(r["question_ar"]) : s(r["question"])}</span> },
          { key: "grain", label: t("Grain", "الحبيبة"), render: (r) => <span>{ar ? s(r["grain_ar"]) : s(r["grain"])}</span> },
          { key: "status", label: t("Status", "الحالة"), value: (r) => s(r["status"]), render: (r) => statusChip(s(r["status"]), ar) },
          { key: "access", label: t("Access", "الصلاحية"), render: (r) => (r["access"] ? <StateChip value="Active" /> : <span className="text-muted-foreground">{t("Restricted", "مقيّد")}</span>) },
        ]} />
      </Panel> ) },
        { id: "kpis", title: ["KPI library by role", "مكتبة المؤشرات حسب الدور"], node: (
        <Panel title={t("KPI library by role", "مكتبة المؤشرات حسب الدور")}>
          {groups.map((g) => <div key={g} className="mb-4 last:mb-0" data-kpi-group={g}><h3 className="mb-2 text-[13px] font-semibold text-muted-foreground">{g}</h3>
          <SignalGrid>
            {FSM_KPIS.filter((k) => (ar ? k.role_ar : k.role) === g).map((k) => { const v = kpiValue(k, {}); const dec = k.unit === "%" || k.unit === "h" || k.unit === "d" ? 1 : 0;
              return <Kpi key={k.id} label={`${k.id} · ${ar ? k.label_ar : k.label}`} value={v === null ? "—" : numTxt(v, dec)} unit={k.unit === "%" ? "%" : k.unit === "h" ? t("h", "س") : k.unit === "d" ? t("days", "يوم") : undefined} tone={v === null ? "neutral" : k.tone ? k.tone(v) : "neutral"} basis={ar ? k.definition_ar : k.definition}
                to={`reports/${k.report}?${new URLSearchParams({ ...(k.drill as Record<string, string> | undefined ?? {}), kpi: k.id }).toString()}`} server={k.status === "SERVER_REQUIRED"} />; })}
          </SignalGrid></div>)}
        </Panel> ) },
      ]} />
    </div>
  );
}

function cell(c: ReportColumn, r: Row, ar: boolean, t: (en: string, a: string) => string) {
  const v = r[c.fieldname];
  if (c.server && (v === undefined || v === null || v === "SERVER_REQUIRED")) return <span className="text-xs text-muted-foreground" data-server>{t("Server required", "يتطلب الخادم")}</span>;
  if (v === undefined || v === null || v === "") return <span className="text-muted-foreground">—</span>;
  switch (c.fieldtype) {
    case "Link": return c.options ? <DocRef doctype={c.options} name={v} title={/^FSM (Service Site|Service System|Device|Technician|Location Node|Inspection Template)$|^(Customer|Supplier|Item|Employee)$/.test(c.options)} /> : <span data-no-i18n>{s(v)}</span>;
    case "Currency": return <span data-no-i18n>{money(v)}</span>;
    case "Date": return <span data-no-i18n>{dateTxt(v)}</span>;
    case "Datetime": return <span data-no-i18n>{dtTxt(v)}</span>;
    case "Percent": return <span data-no-i18n>{numTxt(v, 1)}%</span>;
    case "Int": return <span data-no-i18n>{numTxt(v)}</span>;
    case "Float": return <span data-no-i18n>{numTxt(v, 1)}</span>;
    case "Check": return <span>{Number(v) ? t("Yes", "نعم") : t("No", "لا")}</span>;
    default:
      if (c.fieldname === "record_doctype") return <span data-no-i18n>{dtLabel(s(v), ar)}</span>;
      return CHIP_FIELDS.test(c.fieldname) ? <StateChip value={v} /> : <span data-no-i18n>{opt(v, ar)}</span>;
  }
}
const csvEsc = (v: unknown) => { const x = v === undefined || v === null ? "" : String(v); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
function downloadCsv(r: ReportDef, rows: Row[], ar: boolean) {
  const head = r.columns.map((c) => (ar ? c.label_ar : c.label));
  const body = rows.map((x) => r.columns.map((c) => csvEsc(x[c.fieldname])).join(","));
  const blob = new Blob([`\uFEFF${[head.map(csvEsc).join(","), ...body].join("\n")}`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${r.id}_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

export function ReportPage({ params }: PluginPageProps) {
  const fx = useFx(); const { t, ar } = fx;
  const [f, set] = useUrlState();
  const r = reportById(String(params["id"] ?? ""));
  const scope = useMemo(() => Object.fromEntries(Object.entries(f).filter(([k]) => SCOPE_KEYS.has(k))), [f]);
  const colFilters = useMemo(() => Object.entries(f).filter(([k]) => !SCOPE_KEYS.has(k) && k !== "kpi" && r?.columns.some((c) => c.fieldname === k)), [f, r]);
  if (!r) return <DxState kind="empty" title={t("Unknown report", "تقرير غير معروف")} action={<AppLink to="reports">{t("Report catalogue", "دليل التقارير")}</AppLink>} />;
  const access = reportAccess(r);
  const all = access.ok ? r.run(scope) : [];
  const data = all.filter((x) => colFilters.every(([k, v]) => s(x[k]) === v)).map((x, i) => ({ ...x, name: `${r.id}-${i}` }));
  const kpi = f["kpi"] ? kpiById(f["kpi"]) : undefined;
  const kv = kpi ? kpiValue(kpi, scope) : null;
  const cols: Col<Row & { name: string }>[] = r.columns.map((c) => ({ key: c.fieldname, label: ar ? c.label_ar : c.label, numeric: ["Int", "Float", "Currency", "Percent"].includes(c.fieldtype), value: (x) => (["Int", "Float", "Currency", "Percent"].includes(c.fieldtype) ? Number(x[c.fieldname] ?? 0) : s(x[c.fieldname])), render: (x) => cell(c, x, ar, t) }));
  const fields = ["site", ...(r.filters.includes("customer") ? ["customer"] : []), ...(r.filters.includes("from") ? ["from", "to"] : []), ...(r.filters.includes("as_of") ? ["as_of"] : [])];
  return (
    <div className="w-full min-w-0" data-page="fsm-report" data-report={r.id}>
      <PageHeader title={`${r.id} · ${ar ? r.title_ar : r.title}`} crumbs={[{ label: t("Reports", "التقارير"), to: "reports" }]} band={{
        question: ar ? r.question_ar : r.question,
        basis: <>{t("Grain", "الحبيبة")}: {ar ? r.grain_ar : r.grain}. {r.server_note ? (ar ? r.server_note_ar : r.server_note) : t("Rows are the permitted records; each link opens the source record.", "الصفوف هي السجلات المسموح بها؛ كل رابط يفتح السجل المصدر.")}</>,
        controls: <ScopeControls f={f} set={set} fields={fields} />,
        meta: [{ label: t("Rows", "الصفوف"), value: <span data-no-i18n data-row-count={data.length}>{data.length}</span> }, { label: t("Status", "الحالة"), value: ar ? STATUS_AR[r.status] : r.status }],
        actions: <><button type="button" className={BAND.secondary} disabled={!data.length} onClick={() => downloadCsv(r, data, ar)} data-export="csv">{t("Export CSV", "تصدير CSV")}</button>{Object.keys(f).length > 0 && <button type="button" className={BAND.secondary} onClick={() => set(Object.fromEntries(Object.keys(f).map((k) => [k, undefined])))}>{t("Clear filters", "مسح المرشحات")}</button>}</>,
      }} />
      {kpi && <div className="mb-4 rounded-md border border-dx-info/30 bg-dx-info-soft px-4 py-3 text-sm" data-kpi-context={kpi.id} role="note">
        <strong data-no-i18n>{kpi.id}</strong> · {ar ? kpi.label_ar : kpi.label}: <strong data-no-i18n data-kpi-value>{kv === null ? (kpi.status === "SERVER_REQUIRED" ? t("Server required", "يتطلب الخادم") : "—") : numTxt(kv, kpi.unit ? 1 : 0)}{kpi.unit === "%" ? "%" : ""}</strong>
        <span className="text-muted-foreground"> — {ar ? kpi.definition_ar : kpi.definition}</span></div>}
      {colFilters.length > 0 && <div className="mb-3 flex flex-wrap gap-2 text-xs" aria-label={t("Active filters", "المرشحات النشطة")}>{colFilters.map(([k, v]) => <button key={k} type="button" onClick={() => set({ [k]: undefined })} className="rounded-full border border-border bg-card px-2.5 py-1 hover:bg-muted" data-col-filter={k}>{(ar ? r.columns.find((c) => c.fieldname === k)?.label_ar : r.columns.find((c) => c.fieldname === k)?.label) ?? k}: <span data-no-i18n>{opt(v, ar)}</span> ✕</button>)}</div>}
      <Panel title={ar ? r.title_ar : r.title} flush={false}>
        {!access.ok ? <DxState kind="denied" title={t("You do not have permission to read the records of this report", "لا تملك صلاحية قراءة سجلات هذا التقرير")} detail={<span data-no-i18n>{r.ref_doctype}</span>} />
          : <DataTable id={`report-${r.id}`} rows={data} cols={cols} pageSize={50} empty={t("No rows for these filters.", "لا صفوف لهذه المرشحات.")} />}
      </Panel>
    </div>
  );
}
