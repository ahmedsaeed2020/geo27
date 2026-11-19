import { createFileRoute, Link, useHydrated } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shell, Loading } from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { indexQuery, reportsQuery } from "@/lib/catalog";
import { matchFilter, type Filter } from "@/lib/desk";
import { useStoreVersion } from "@/lib/adapter";
import { scopedList, canReadType, useScopeMetas } from "@/lib/scope";
import { useSessionUser } from "@/lib/session";
import { fmtNumber } from "@/lib/format";
import { t, useLang } from "@/i18n";
import { DEPARTMENTS, DEPT_ANALYTICS, type Ind, type L } from "@/lib/departmentHomes";
import { departmentInjections, usePluginsVersion } from "@/plugins/runtime";
import { DateInput } from "@/components/form/DateInput";

type FinanceScope = { company?: string | undefined; from_date?: string | undefined; to_date?: string | undefined };
const scopeDate = (v: unknown) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : undefined;
};

export const Route = createFileRoute("/department/$dept")({
  validateSearch: (s: Record<string, unknown>): FinanceScope => ({
    company: typeof s["company"] === "string" && s["company"] ? s["company"] : undefined,
    from_date: scopeDate(s["from_date"]),
    to_date: scopeDate(s["to_date"]),
  }),
  head: ({ params }) => {
    const d = DEPARTMENTS.find((x) => x.id === params.dept);
    const title = `${d?.title.en ?? "Department"} — Digit Virtual Core`;
    const desc = d?.desc.en ?? "Department home over shared Core records.";
    return { meta: [{ title }, { name: "description", content: desc }, { property: "og:title", content: title }, { property: "og:description", content: desc }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  component: DepartmentHome,
});

/** Department home: header → indicators → pending work → document lists → reports. Values read live from scoped adapter records. */
function DepartmentHome() {
  const { dept } = Route.useParams();
  const scope = Route.useSearch();
  const navigate = Route.useNavigate();
  const finance = dept === "finance";
  const lang = useLang(); const tx = (l: L) => (lang === "ar" ? l.ar : l.en);
  const idx = useQuery(indexQuery); const reps = useQuery(reportsQuery);
  useStoreVersion(); useSessionUser(); usePluginsVersion(); const hydrated = useHydrated();
  const d = DEPARTMENTS.find((x) => x.id === dept);
  const types = d ? [...d.indicators, ...d.pending].map((i) => i.doctype).concat(d.groups.flatMap((g) => g.doctypes)) : [];
  useScopeMetas(finance ? [...types, "Company"] : types);
  if (!d) return <Shell><p className="text-muted-foreground">{lang === "ar" ? "القسم غير موجود." : "Department not found."}</p></Shell>;
  if (!idx.data || !reps.data) return <Shell><Loading /></Shell>;
  const entries = idx.data;
  const entry = (n: string) => entries.find((e) => e.name === n);
  const repNames = new Set((reps.data as { name: string }[]).map((r) => r.name));
  const companies = hydrated && finance ? scopedList("Company") : [];
  const setScope = (key: keyof FinanceScope, value: string) => {
    void navigate({ search: (prev) => ({ ...prev, [key]: value || undefined }), replace: true });
  };
  // One native filter set for both the displayed figure and its list drill-down.
  const filtersFor = (i: Ind): Filter[] => {
    const filters: Filter[] = [...(i.list ?? [])];
    if (!finance) return filters;
    if (scope.company) filters.push(["company", "=", scope.company]);
    const dateField = i.doctype === "Bank Transaction" ? "date" : "posting_date";
    if (scope.from_date || scope.to_date) filters.push([dateField, "is", "set"]);
    if (scope.from_date) filters.push([dateField, ">=", scope.from_date]);
    if (scope.to_date) filters.push([dateField, "<=", scope.to_date]);
    return filters;
  };
  const value = (i: Ind, filters: Filter[]) => {
    if (!hydrated || !canReadType(i.doctype)) return null;
    const rows = scopedList(i.doctype).filter((r) => filters.every((f) => matchFilter(r, f)))
      .filter(i.list ? () => true : i.filter ?? (() => true));
    const sum = i.sum;
    return sum ? fmtNumber(rows.reduce((s, r) => s + Number(r[sum] ?? 0), 0), 2) : String(rows.length);
  };
  const card = (i: Ind, k: number) => {
    const filters = filtersFor(i);
    const e = entry(i.doctype); const v = value(i, filters);
    const body = <><div className="text-xs text-muted-foreground">{tx(i.label)}</div><div className="mt-1 text-xl font-semibold" data-no-i18n>{v ?? "—"}</div></>;
    return e ? <Link key={k} to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} search={filters.length ? { filters: JSON.stringify(filters) } : {}} className="panel block p-3 hover:shadow-md" data-dept-indicator>{body}</Link> : <div key={k} className="panel p-3">{body}</div>;
  };
  const sb = d.sidebar;
  // enabled DIGIT apps may add subsections to this home (PluginManifest.department_sections); disabling the app removes them
  const injected = hydrated ? departmentInjections(d.id) : [];
  return (
    <Shell crumbs={[{ label: tx(d.title) }]}>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-xl font-semibold tracking-tight">{tx(d.title)}</h1><p className="text-sm text-muted-foreground">{tx(d.desc)}</p></div>
        <div className="flex flex-wrap gap-2 text-sm">
          {sb && <Link to="/desk/$sidebar" params={{ sidebar: sb }} className="rounded border px-3 py-1 hover:bg-muted">{lang === "ar" ? "مساحة العمل" : "Workspace"}</Link>}
          {d.links.map((l, k) => <Link key={k} to={l.to as "/"} params={l.params as never} className="rounded border px-3 py-1 hover:bg-muted">{tx(l.label)}</Link>)}
        </div>
      </header>
      {finance && <section aria-label={lang === "ar" ? "نطاق المالية" : "Finance scope"} className="mb-5 flex flex-wrap items-end gap-3">
        <div className="w-full min-w-0 sm:w-56">
          <label id="finance-company-label" className="mb-1 block text-xs text-muted-foreground">{lang === "ar" ? "الشركة" : "Company"}</label>
          <Select value={scope.company ?? "__all__"} onValueChange={(v) => setScope("company", v === "__all__" ? "" : v)}>
            <SelectTrigger aria-labelledby="finance-company-label" className="min-w-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{lang === "ar" ? "كل الشركات المسموح بها" : "All permitted companies"}</SelectItem>
              {scope.company && !companies.some((c) => c.name === scope.company) && <SelectItem value={scope.company}><span data-no-i18n>{scope.company}</span></SelectItem>}
              {companies.map((c) => <SelectItem key={c.name} value={c.name}><span data-no-i18n>{c.name}</span></SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <fieldset className="flex min-w-0 flex-wrap gap-3">
          <legend className="mb-1 text-xs text-muted-foreground">{lang === "ar" ? "الفترة الزمنية" : "Date period"}</legend>
          <label className="block min-w-0 text-xs text-muted-foreground">{lang === "ar" ? "من تاريخ" : "From date"}<DateInput className="mt-1 w-40 max-w-full text-foreground" value={scope.from_date ?? ""} max={scope.to_date} onChange={(e) => setScope("from_date", e.target.value)} /></label>
          <label className="block min-w-0 text-xs text-muted-foreground">{lang === "ar" ? "إلى تاريخ" : "To date"}<DateInput className="mt-1 w-40 max-w-full text-foreground" value={scope.to_date ?? ""} min={scope.from_date} onChange={(e) => setScope("to_date", e.target.value)} /></label>
        </fieldset>
        {scope.from_date && scope.to_date && scope.from_date > scope.to_date && <p role="alert" className="w-full text-xs text-destructive">{lang === "ar" ? "يجب أن يسبق تاريخ البداية تاريخ النهاية." : "From date must be on or before to date."}</p>}
      </section>}
      {d.indicators.length > 0 && <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{d.indicators.map(card)}</section>}
      {d.pending.length > 0 && <section className="mb-6"><h2 className="mb-2 text-sm font-semibold">{lang === "ar" ? "أعمال معلّقة" : "Pending work"}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{d.pending.map(card)}</div></section>}
      {d.groups.length > 0 && <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {d.groups.map((g, k) => <div key={k} className="panel p-3"><h3 className="mb-2 text-sm font-semibold">{tx(g.label)}</h3>
          {g.doctypes.map((n) => { const e = entry(n); return e ? <Link key={n} to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} className="block py-0.5 text-sm text-primary hover:underline">{t(n)}</Link> : null; })}</div>)}
      </section>}
      {injected.length > 0 && <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-dept-injected>
        {injected.map((g, k) => <div key={k} className="panel border-primary/40 p-3" data-dept-injection={g.plugin}><h3 className="mb-2 text-sm font-semibold" data-no-i18n>{lang === "ar" && g.label_ar ? g.label_ar : g.label}</h3>
          {g.doctypes.map((n) => { const e = entry(n); return e && canReadType(n) ? <Link key={n} to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} search={{ app: g.plugin }} className="block py-0.5 text-sm text-primary hover:underline">{t(n)}</Link> : null; })}
          {(g.reports ?? []).map((r) => repNames.has(r)
            ? <Link key={r} to="/report/$name" params={{ name: r }} className="block py-0.5 text-sm hover:underline">{t(r)}</Link>
            : <Link key={r} to="/plugins/$name/report/$report" params={{ name: g.plugin, report: r }} className="block py-0.5 text-sm hover:underline">{t(r)}</Link>)}</div>)}
      </section>}
      <section className="mb-6"><h2 className="mb-2 text-sm font-semibold">{lang === "ar" ? "التقارير" : "Reports"}</h2>
        <div className="flex flex-wrap gap-2">{d.reports.filter((r) => repNames.has(r)).map((r) => <Link key={r} to="/report/$name" params={{ name: r }} className="rounded border px-3 py-1 text-sm hover:bg-muted">{t(r)}</Link>)}
          {d.id !== "insights" && DEPT_ANALYTICS.map((l, k) => <Link key={k} to={l.to as "/"} className="rounded border px-3 py-1 text-sm hover:bg-muted">{tx(l.label)}</Link>)}</div>
      </section>
      {d.id === "insights" && <p className="text-xs text-muted-foreground">{tx(d.desc)}</p>}
    </Shell>
  );
}
