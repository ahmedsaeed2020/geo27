import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useDevMode } from "@/lib/mode";
import { useLang } from "@/i18n";
import { AUDIT_CHECKS, auditDocument, type AuditCheck, type AuditFinding } from "@/lib/visualAudit";
import { HR_DEPTS, HR_SECTIONS, hrDeptPath, hrSectionPath } from "@/plugins/digit_hr/product/structure";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { DEPT_NAMES, DEPT_SLUGS, WS_INDEX, wsRoute } from "@/plugins/digit_construction/r19/wsIndex";
import { DEPARTMENTS as PRO_DEPTS, SECTION_PAGES } from "@/plugins/digit_pro/nav";

export const Route = createFileRoute("/dev/visual-audit")({
  head: () => ({ meta: [
    { title: "DIGIT — Visual audit (developer)" }, { name: "description", content: "Developer tool: scans DIGIT screens for the visual system rules (tokens, type, charts, dates, KPI cards, heroes, dark contrast)." },
    { property: "og:title", content: "DIGIT — Visual audit" }, { property: "og:description", content: "Developer tool that scans DIGIT screens for the visual system rules." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: VisualAudit,
});

interface Page { group: "HR" | "Construction" | "Pro"; path: string; label: string }
/** Screens of this round (HR → Construction → Pro/Enterprise); CRM, POS and Manufacturing are out of scope. */
const AUDIT_PAGES: Page[] = [
  ...HR_DEPTS.map((d) => ({ group: "HR" as const, path: hrDeptPath(d.id), label: `HR · ${d.en}` })),
  ...HR_SECTIONS.map((s) => ({ group: "HR" as const, path: hrSectionPath(s.id), label: `HR · ${s.id} ${s.en}` })),
  { group: "HR", path: "/hr/employee/DCC-EMP-001", label: "HR · Employee 360" },
  { group: "HR", path: "/hr/intelligence/people-analytics/reports", label: "HR · Reports hub (06.3)" },
  { group: "HR", path: "/report/HR%20Turnover%20Rate", label: "HR · Turnover report" },
  { group: "Construction", path: "/construction", label: "Construction · Home" },
  ...Object.entries(DEPT_SLUGS).map(([id, slug]) => ({ group: "Construction" as const, path: `/construction/${slug}`, label: `Construction · ${DEPT_NAMES[id]?.[0] ?? slug}` })),
  ...WS_INDEX.map(([id, en]) => ({ group: "Construction" as const, path: `/construction/${wsRoute(id)}`, label: `Construction · ${id} ${en}` })),
  { group: "Construction", path: "/construction/budget-cost/budgets/overview", label: "Construction · Budgets overview" },
  { group: "Construction", path: "/report/Budget%20vs%20Actual", label: "Construction · Cost report" },
  { group: "Pro", path: "/pro/dashboard", label: "Pro · Dashboard" },
  ...PRO_DEPTS.map((d) => ({ group: "Pro" as const, path: `/pro/${d.id}`, label: `Pro · ${d.id}` })),
  ...SECTION_PAGES.map((p) => ({ group: "Pro" as const, path: `/pro/${p.dept}/${p.slug}`, label: `Pro · ${p.id} ${p.label}` })),
  { group: "Pro", path: "/enterprise", label: "Enterprise · Home" },
];

interface Result { page: Page; findings: AuditFinding[]; error?: string | undefined }
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Loads one page in a hidden same-origin frame at 1440px, waits for it to settle and scans it. */
async function scan(frame: HTMLIFrameElement, page: Page, dark: boolean): Promise<Result> {
  // the first page boots the app in the frame; later pages navigate inside it (no reboot), so a full scan stays quick
  const w = frame.contentWindow as (Window & { location: Location }) | null;
  const booted = !!w && !!frame.contentDocument?.querySelector("[data-shell-main]") && w.location.origin === window.location.origin;
  if (booted && w) { w.history.pushState({}, "", page.path); w.dispatchEvent(new PopStateEvent("popstate", { state: {} })); await wait(400); }
  else await new Promise<void>((res) => { frame.onload = () => res(); frame.src = page.path; setTimeout(res, 20000); });
  const doc = frame.contentDocument; if (!doc) return { page, findings: [], error: "frame not readable" };
  for (let i = 0; i < 60; i++) { if (doc.querySelector("[data-shell-main]") && !doc.querySelector("[data-shell-pending]")) break; await wait(250); }
  if (dark) doc.documentElement.classList.add("dark");
  await wait(1800);
  try { return { page, findings: auditDocument(doc, { dark }) }; } catch (e) { return { page, findings: [], error: e instanceof Error ? e.message : String(e) }; }
}

function VisualAudit() {
  const dev = useDevMode(); const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en);
  const frame = useRef<HTMLIFrameElement>(null);
  const [groups, setGroups] = useState<Set<Page["group"]>>(new Set(["HR"]));
  const [dark, setDark] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  if (!dev) return <div className="p-6"><ContextStrip title={t("Visual audit", "التدقيق البصري")} sub={t("Available in Developer mode only.", "متاح في وضع المطور فقط.")} /><p className="mt-4 text-sm"><Link to="/developer" className="text-primary underline">{t("Open developer tools", "فتح أدوات المطور")}</Link></p></div>;
  const pages = AUDIT_PAGES.filter((p) => groups.has(p.group));
  const run = async () => {
    if (!frame.current) return; const out: Result[] = []; setResults([]);
    for (const p of pages) { setBusy(p.label); out.push(await scan(frame.current, p, dark)); setResults([...out]); }
    // developer tool: the full result is also left on the window for scripted runs (browser checks read it)
    (window as unknown as { __visualAudit?: Result[] }).__visualAudit = out;
    setBusy(null);
  };
  const total = results.reduce((a, r) => a + r.findings.length, 0);
  const clean = results.filter((r) => !r.findings.length && !r.error).length;
  const byCheck = (c: AuditCheck) => results.reduce((a, r) => a + r.findings.filter((f) => f.check === c).length, 0);
  return (
    <div className="space-y-4 p-4" data-visual-audit data-audit-findings={results.length ? total : ""} data-audit-pages={`${clean}/${results.length}`}>
      <ContextStrip eyebrow={t("Developer", "المطور")} title={t("Visual audit", "التدقيق البصري")} sub={t("Developer helper: scans each screen at 1440px for the visual rules that stay (tokens, small Emerald text, dates, KPI change, dark contrast). It never blocks a release.", "أداة مساعدة للمطور: تفحص كل شاشة بعرض 1440 بكسل وفق القواعد البصرية الباقية (الرموز، النص الزمردي الصغير، التواريخ، تغير المؤشر، تباين الوضع الداكن). لا توقف أي إصدار.")}
        chips={results.length ? <><span className="ek-hero-chip" data-audit-total={total}>{t("Findings", "الملاحظات")} <bdi data-no-i18n>{total}</bdi></span><span className="ek-hero-chip">{t("Clean pages", "صفحات سليمة")} <bdi data-no-i18n>{clean}/{results.length}</bdi></span></> : undefined} />
      <div className="ek-card flex flex-wrap items-center gap-3 p-4">
        {(["HR", "Construction", "Pro"] as const).map((g) => <label key={g} className="flex items-center gap-2 text-sm"><input type="checkbox" data-audit-group={g} checked={groups.has(g)} onChange={(e) => { const n = new Set(groups); if (e.target.checked) n.add(g); else n.delete(g); setGroups(n); }} />{g} <span className="text-muted-foreground" data-no-i18n>({AUDIT_PAGES.filter((p) => p.group === g).length})</span></label>)}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} data-audit-dark />{t("Dark mode (adds the contrast check)", "الوضع الداكن (يضيف فحص التباين)")}</label>
        <button type="button" className="btn-primary min-h-10 px-4" disabled={!!busy || !pages.length} onClick={() => void run()} data-audit-run>{busy ? t(`Scanning ${busy}…`, `جارٍ فحص ${busy}…`) : t(`Run on ${pages.length} pages`, `تشغيل على ${pages.length} صفحة`)}</button>
      </div>
      {results.length > 0 && <div className="ek-card p-4">
        <h2 className="ek-h3 mb-3">{t("Findings by rule", "الملاحظات حسب القاعدة")}</h2>
        <table className="r3-table w-full"><thead><tr><th className="text-start">{t("Rule", "القاعدة")}</th><th className="text-end" data-num>{t("Findings", "الملاحظات")}</th></tr></thead>
          <tbody>{AUDIT_CHECKS.filter((c) => c.id !== "dark-contrast" || dark).map((c) => <tr key={c.id} {...(byCheck(c.id) ? { "data-row-tone": "bad" } : {})} data-audit-check={c.id}><td>{t(c.en, c.ar)}</td><td className="text-end" data-num><span className="r3-pill" data-tone={byCheck(c.id) ? "error" : "success"} data-no-i18n>{byCheck(c.id)}</span></td></tr>)}</tbody></table>
      </div>}
      {results.length > 0 && <div className="ek-card p-4">
        <h2 className="ek-h3 mb-3">{t("Pages", "الصفحات")}</h2>
        <table className="r3-table w-full"><thead><tr><th className="text-start">{t("Page", "الصفحة")}</th><th className="text-end" data-num>{t("Findings", "الملاحظات")}</th><th className="text-start">{t("First findings", "أولى الملاحظات")}</th></tr></thead>
          <tbody>{results.map((r) => <tr key={r.page.path} {...(r.findings.length || r.error ? { "data-row-tone": "bad" } : {})} data-audit-page={r.page.path}>
            <td><a href={r.page.path} className="text-primary hover:underline" data-no-i18n>{r.page.label}</a></td>
            <td className="text-end" data-num><span className="r3-pill" data-tone={r.findings.length || r.error ? "error" : "success"} data-no-i18n>{r.error ? "!" : r.findings.length}</span></td>
            <td className="text-xs" data-no-i18n data-raw-date>{r.error ?? r.findings.slice(0, 4).map((f) => `${f.check}: ${f.sample}`).join(" | ")}</td></tr>)}</tbody></table>
      </div>}
      <iframe ref={frame} title="audit frame" aria-hidden tabIndex={-1} style={{ position: "fixed", insetInlineStart: -20000, top: 0, width: 1440, height: 1000, border: 0 }} />
    </div>
  );
}
