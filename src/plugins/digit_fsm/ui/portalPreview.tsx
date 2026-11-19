/**
 * F4-06 customer portal preview (owner FSM round F4, P01–P08): pick a customer and see exactly what its contacts would
 * see — granted sites, published current reports, open findings and active impairments, the next 14 days of visits and
 * requests where the grant allows them. Scope comes only from domain/portal.ts (FSM Portal Grant); a revoked site is
 * named and left out. Staff preview: links open the staff records.
 */
import { Pill } from "@/components/enterprise/kit/RecordFrame";
import { list, raw } from "../domain/data";
import { daysBetween, s, today } from "../domain/rules";
import { portalCustomers, portalView } from "../domain/portal";
import { FSM_SCREENS } from "../screens";
import { nm } from "./dayBoard";
import { tv } from "./runWalk";
import { AppLink, BAND, DataTable, INPUT, Kpi, PageHeader, Panel, SignalGrid, StateChip, dateTxt, dtTxt, numTxt, opt, useFx, useUrlState } from "./kit";

const SEV_TONE: Record<string, "bad" | "warn" | "neutral"> = { Critical: "bad", Major: "warn", Minor: "neutral" };
export function PortalHubPage() {
  const { t, ar } = useFx(); const [q, set] = useUrlState();
  const custs = portalCustomers(); const cust = q["c"] && custs.includes(q["c"]) ? q["c"] : custs[0] ?? "";
  if (!cust) return <div data-page="fsm-portal-hub"><PageHeader title={t("Customer portal (staff preview)", "بوابة العميل (معاينة للموظفين)")} band={{ question: t("What would a customer see for their own sites?", "ماذا سيرى العميل لمواقعه؟") }} /><Panel title={t("No portal access yet", "لا وصول للبوابة بعد")}><p className="text-sm text-muted-foreground">{t("Give a customer contact access to a site with a portal grant.", "امنح جهة اتصال العميل وصولًا لموقع عبر منحة البوابة.")} <AppLink to="list/fsm_portal_grant">{t("Portal grants", "منح البوابة")}</AppLink></p></Panel></div>;
  const v = portalView(cust); const sc = v.scope; const crit = v.findings.filter((d) => s(d["severity"]) === "Critical").length;
  const lastRep = (site: string) => v.reports.find((r) => s(r["site"]) === site);
  const nextVisit = (site: string) => v.visits.find((x) => s(x["site"]) === site);
  const portal = FSM_SCREENS.filter((x) => x.module === "PORTAL");
  return (
    <div className="w-full min-w-0" data-page="fsm-portal-hub" data-portal-customer={cust}>
      <PageHeader title={t("Customer portal (staff preview)", "بوابة العميل (معاينة للموظفين)")} band={{
        question: t("What would this customer see for their own sites?", "ماذا سيرى هذا العميل لمواقعه؟"),
        basis: t("Only sites with an active portal grant; per site the grant switches reports, findings and requests. Only published, current report revisions are shown.", "المواقع ذات منحة البوابة النشطة فقط؛ لكل موقع تحدد المنحة التقارير والملاحظات والطلبات. لا تُعرض إلا الإصدارات المنشورة الحالية من التقارير."),
        meta: [{ label: t("Customer", "العميل"), value: <span data-no-i18n>{nm("Customer", cust, ar)}</span> }, { label: t("Seen as", "يُرى بصفة"), value: <span data-no-i18n>{sc.contacts.map((c) => nm("Contact", c, ar)).join("، ") || "—"}</span> }],
        controls: <select className={`${INPUT} min-h-10`} value={cust} onChange={(e) => set({ c: e.target.value })} aria-label={t("Customer", "العميل")} data-portal-pick>{custs.map((c) => <option key={c} value={c}>{nm("Customer", c, ar)}</option>)}</select>,
        actions: <AppLink to="list/fsm_portal_grant" className={BAND.secondary}>{t("Portal grants", "منح البوابة")}</AppLink>,
      }} />
      {sc.revoked.length > 0 && <p className="mb-3 text-sm" data-portal-revoked>{t("Not visible (grant revoked):", "غير ظاهر (منحة ملغاة):")} {sc.revoked.map((g) => <span key={g.name} className="ms-1 font-bold" data-no-i18n>{nm("FSM Service Site", g["site"], ar)}</span>)}</p>}
      <SignalGrid cols={4}>
        <Kpi label={t("Sites", "المواقع")} value={numTxt(sc.sites.length)} basis={t("Active grants", "منح نشطة")} icon="count" />
        <Kpi label={t("Published reports", "التقارير المنشورة")} value={numTxt(v.reports.length)} tone="good" basis={t("Current revisions", "الإصدارات الحالية")} icon="doc" />
        <Kpi label={t("Open findings", "الملاحظات المفتوحة")} value={numTxt(v.findings.length)} tone={crit ? "bad" : v.findings.length ? "warn" : "good"} basis={t(`${crit} critical`, `${crit} حرجة`)} icon="alert" />
        <Kpi label={t("Visits in 14 days", "زيارات خلال 14 يومًا")} value={numTxt(v.visits.length)} tone="info" basis={t("Planned or dispatched", "مخططة أو مرسلة")} icon="time" />
      </SignalGrid>
      {v.impairments.length > 0 && <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm" role="alert" data-portal-impairments={v.impairments.length}><b>{t("System out of service", "نظام خارج الخدمة")}</b> · {v.impairments.map((i) => <span key={i.name} className="ms-1" data-no-i18n>{nm("FSM Service System", i["system"], ar)} ({nm("FSM Service Site", i["site"], ar)})</span>)}</div>}
      <Panel title={t("My sites", "مواقعي")}>
        <div className="fsm-portal-sites">{sc.sites.map((x) => { const r = lastRep(x.name); const nv = nextVisit(x.name); const open = v.findings.filter((d) => s(d["site"]) === x.name).length;
          return <article key={x.name} className="fsm-psite" data-portal-site={x.name}>
            <h3 data-no-i18n>{nm("FSM Service Site", x.name, ar)}</h3><p className="text-xs text-muted-foreground" data-no-i18n>{tv(x["city"], ar)}</p>
            <dl><div><dt>{t("Last report", "آخر تقرير")}</dt><dd>{r ? <><StateChip value={r["technical_result"]} /> <span data-no-i18n>{dateTxt(r["published_on"])}</span></> : "—"}</dd></div>
              <div><dt>{t("Open findings", "ملاحظات مفتوحة")}</dt><dd data-no-i18n>{sc.findings.has(x.name) ? numTxt(open) : "—"}</dd></div>
              <div><dt>{t("Next visit", "الزيارة القادمة")}</dt><dd data-no-i18n>{nv ? dtTxt(nv["scheduled_start"]) : "—"}</dd></div></dl>
          </article>; })}</div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("Published reports", "التقارير المنشورة")} subtitle={t("Opens the bilingual customer report", "يفتح تقرير العميل الثنائي اللغة")}>
          <DataTable id="portal-reports-v" rows={v.reports.slice(0, 20)} searchable={false} empty={t("No published reports.", "لا تقارير منشورة.")} cols={[
            { key: "published_on", label: t("Published", "النشر"), value: (r) => s(r["published_on"]), render: (r) => <span data-no-i18n>{dateTxt(r["published_on"])}</span> },
            { key: "site", label: t("Site", "الموقع"), render: (r) => <span data-no-i18n>{nm("FSM Service Site", r["site"], ar)}</span> },
            { key: "system", label: t("System", "النظام"), render: (r) => <span data-no-i18n>{nm("FSM Service System", r["system"], ar)}</span> },
            { key: "technical_result", label: t("Result", "النتيجة"), render: (r) => <StateChip value={r["technical_result"]} /> },
            { key: "run", label: t("Report", "التقرير"), render: (r) => <AppLink to={`report-preview/${encodeURIComponent(s(r["run"]))}`} attrs={{ "data-portal-report": s(r["run"]) }}>{t("Open", "فتح")}</AppLink> },
          ]} />
        </Panel>
        <Panel title={t("Open findings", "الملاحظات المفتوحة")} subtitle={t("Worst first", "الأخطر أولاً")}>
          <DataTable id="portal-findings-v" rows={[...v.findings].sort((a, b) => ["Critical", "Major", "Minor"].indexOf(s(a["severity"])) - ["Critical", "Major", "Minor"].indexOf(s(b["severity"])))} searchable={false} empty={t("No open findings.", "لا ملاحظات مفتوحة.")} cols={[
            { key: "severity", label: t("Severity", "الخطورة"), value: (r) => s(r["severity"]), render: (r) => <Pill tone={SEV_TONE[s(r["severity"])] ?? "neutral"}>{opt(r["severity"], ar)}</Pill> },
            { key: "title", label: t("Finding", "الملاحظة"), render: (r) => <span data-no-i18n>{tv(r["title"], ar)}</span> },
            { key: "site", label: t("Site", "الموقع"), render: (r) => <span data-no-i18n>{nm("FSM Service Site", r["site"], ar)}</span> },
            { key: "opened_on", label: t("Age", "العمر"), value: (r) => s(r["opened_on"]), render: (r) => <span data-no-i18n>{r["opened_on"] ? `${daysBetween(s(r["opened_on"]), today())} ${ar ? "يوم" : "d"}` : "—"}</span> },
            { key: "workflow_state", label: t("Status", "الحالة"), render: (r) => <StateChip value={r["workflow_state"]} /> },
          ]} />
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("Upcoming visits", "الزيارات القادمة")} subtitle={t("Next 14 days", "خلال 14 يومًا")}>
          <DataTable id="portal-visits-v" rows={v.visits} searchable={false} empty={t("No visits in the next 14 days.", "لا زيارات خلال 14 يومًا.")} cols={[
            { key: "scheduled_start", label: t("When", "الموعد"), value: (r) => s(r["scheduled_start"]), render: (r) => <span data-no-i18n>{dtTxt(r["scheduled_start"])}</span> },
            { key: "site", label: t("Site", "الموقع"), render: (r) => <span data-no-i18n>{nm("FSM Service Site", r["site"], ar)}</span> },
            { key: "visit_purpose", label: t("Purpose", "الغرض"), render: (r) => opt(r["visit_purpose"], ar) },
            { key: "workflow_state", label: t("Status", "الحالة"), render: (r) => <StateChip value={r["workflow_state"]} /> },
          ]} />
        </Panel>
        <Panel title={t("Service requests", "طلبات الخدمة")} subtitle={sc.requests.size ? t("Sites where the grant allows requests", "المواقع التي تسمح منحتها بالطلبات") : t("No site allows requests", "لا موقع يسمح بالطلبات")}>
          <DataTable id="portal-requests-v" rows={v.requests} searchable={false} empty={t("No requests.", "لا طلبات.")} cols={[
            { key: "subject", label: t("Request", "الطلب"), render: (r) => <span data-no-i18n>{tv(r["subject"], ar)}</span> },
            { key: "digit_fsm_site", label: t("Site", "الموقع"), render: (r) => <span data-no-i18n>{nm("FSM Service Site", r["digit_fsm_site"], ar)}</span> },
            { key: "opening_date", label: t("Opened", "الفتح"), render: (r) => <span data-no-i18n>{dateTxt(r["opening_date"])}</span> },
            { key: "status", label: t("Status", "الحالة"), render: (r) => <StateChip value={r["status"]} /> },
          ]} />
        </Panel>
      </div>
      <Panel title={t("Portal pages", "صفحات البوابة")}>
        <ul className="flex flex-wrap gap-2">{portal.map((x) => <li key={x.id}><AppLink to={`${x.to}?c=${encodeURIComponent(cust)}`} className="ek-fk-btn" attrs={{ "data-size": "sm" }}>{ar ? x.label_ar : x.label} <small data-no-i18n>{x.id}</small></AppLink></li>)}</ul>
      </Panel>
      <p className="mt-2 text-xs text-muted-foreground">{t("Contacts with access:", "جهات الاتصال ذات الوصول:")} <span data-no-i18n>{list("FSM Portal Grant").filter((g) => s(g["customer"]) === cust && s(g["status"]) === "Active").length}</span> · <span data-no-i18n>{nm("Customer", raw("Customer", cust)?.name, ar)}</span></p>
    </div>
  );
}
