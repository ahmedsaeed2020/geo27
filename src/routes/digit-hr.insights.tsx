import { IntelligenceWorkspace } from "@/components/digithr/workspaces/IntelligenceWorkspace";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { useStoreVersion } from "@/lib/adapter";
import { canReadType } from "@/plugins/digit_hr/compat/scope";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { useSources, SourceNotice } from "@/components/digithr/workspaces/shared";

export const Route = createFileRoute("/digit-hr/insights")({
  head: () => ({ meta: [
    { title: "DIGIT HR — Workforce Insights" },
    { name: "description", content: "Headcount, turnover, distribution and HR health indicators from recorded data." },
    { property: "og:title", content: "DIGIT HR — Workforce Insights" },
    { property: "og:description", content: "Workforce indicators computed only from records you can see." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Insights,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;
const s = (v: unknown) => (v == null ? "" : String(v));

function groupCount(rows: R[], key: string) {
  const m = new Map<string, number>();
  for (const r of rows) { const k = s(r[key]) || "—"; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function Insights() {
  const { tx } = useTx();
  const src = useSources(tx);
  useStoreVersion(); useSessionUser();
  const emps = src.rows("Employee");
  const active = emps.filter((e) => s(e.status) === "Active");
  const left = emps.filter((e) => s(e.status) === "Left");
  const year = new Date().getFullYear();
  const joinedYr = emps.filter((e) => s(e.date_of_joining).startsWith(String(year)));
  const leftYr = left.filter((e) => s(e.relieving_date).startsWith(String(year)));
  const turnover = active.length ? Math.round((leftYr.length / active.length) * 1000) / 10 : 0;
  const female = active.filter((e) => s(e.gender) === "Female").length;
  const cases = src.rows("DIGIT HR Service Case").filter((c) => !["Resolved", "Closed"].includes(s(c.status)));
  const readable = canReadType("Employee");

  const kpi = (ar: string, en: string, v: string | number) => (
    <div className="dhr-card rounded-[18px] p-4"><div className="text-xs opacity-70">{tx(ar, en)}</div>
      <div className="mt-1 text-2xl font-semibold" data-no-i18n>{readable ? v : "—"}</div></div>
  );
  const bars = (ar: string, en: string, rows: [string, number][]) => {
    const max = Math.max(1, ...rows.map((r) => r[1]));
    return (
      <section className="dhr-card rounded-[18px] p-4"><h2 className="mb-3 font-semibold">{tx(ar, en)}</h2>
        {rows.length ? <ul className="space-y-2 text-sm">{rows.slice(0, 10).map(([k, n]) => (
          <li key={k}><div className="flex justify-between gap-2"><span data-no-i18n className="truncate">{k}</span><span data-no-i18n>{n}</span></div>
            <div className="mt-1 h-2 rounded bg-[var(--dhr-border)]"><div className="h-2 rounded bg-primary" style={{ width: `${(n / max) * 100}%` }} /></div></li>))}</ul>
          : <p className="text-sm opacity-70">{tx("لا توجد سجلات.", "No records.")}</p>}
      </section>
    );
  };

  return (
    <DigitHrLayout title={tx("مؤشرات القوى العاملة", "Workforce insights")} subtitle={tx("مؤشرات محسوبة من السجلات المتاحة لك فقط — بدون تقديرات.", "Indicators computed only from records visible to you — no estimates.")} crumbs={[{ label: tx("المؤشرات", "Insights") }]}
      actions={<Link to="/digit-hr/reports" className="inline-flex h-10 items-center rounded-md bg-muted px-4 text-sm">{tx("مركز التقارير", "Report Center")}</Link>}>
      <SourceNotice src={src} />
      <p className="mb-4 text-xs opacity-70">{tx("التنبؤات والتحليلات الذكية تحتاج خادمًا حقيقيًا ولا تعمل في هذه المعاينة.", "Predictions and AI analytics need a real server and do not run in this preview.")}</p>
      <IntelligenceWorkspace />
    </DigitHrLayout>
  );
}
