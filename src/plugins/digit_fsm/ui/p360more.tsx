import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * F3-04 360 depth (owner FSM round F3): the Site overview (impairment banner, coverage ring = latest run per system,
 * devices by their latest result, system cards, open findings, next due visit, service history timeline), the Device
 * measurement trend, the Agreement 12-month obligation strip + renewal ring + contribution, and Technician 360 (skills and
 * certificate expiry, today's plan, utilisation, first-time fix). Figures come only from the records; every block names
 * its basis and opens the records behind it.
 */
import { TechMoney } from "./fieldMoney";
import type { ReactNode } from "react";
import type { Doc } from "@/lib/adapter";
import type { PluginPageProps } from "@/plugins/pages";
import { AreaChart, Avatar, BigRing, Donut as EkDonut, KeyFacts, Pill, StackedColumns, Timeline, monthLabel, type TlItem } from "@/components/enterprise/kit";
import { list, raw, rows } from "../domain/data";
import { FSM_REPORTS } from "../domain/reports";
import { OPEN_DEFICIENCY, addDays, isMissed, runCoverage, s, today, type Row } from "../domain/rules";
import { TeamDayTimeline, nm } from "./dayBoard";
import { deviceState } from "./runWalk";
import { ImpairmentBanner } from "./riskBits";
import { AppLink, DocRef, Kpi, Missing, PageHeader, Panel, SignalGrid, dateTxt, dtTxt, money, numTxt, opt, useFx } from "./kit";

const enc = encodeURIComponent;
const KF = ({ items }: { items: { label: string; value: ReactNode }[] }) => <KeyFacts items={items.map((x): [string, ReactNode] => [x.label, x.value])} />;
const dayMs = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / dayMs);

/** Latest run per system of a site (any submitted or reviewed state first, else the newest). */
export function latestRuns(site: string): Doc[] {
  const by = new Map<string, Doc>();
  for (const r of list("FSM Inspection Run").filter((x) => s(x["site"]) === site)) { const k = s(r["system"]); const cur = by.get(k); const at = s(r["submitted_on"]) || s(r["modified"]) || s(r["creation"]); if (!cur || at > (s(cur["submitted_on"]) || s(cur["modified"]) || s(cur["creation"]))) by.set(k, r); }
  return [...by.values()];
}
/** Site coverage from the latest run of every system: Σ inspected ÷ Σ expected (the K07 formula over the site). */
export function siteCoverage(site: string): { inspected: number; expected: number; value: number | null } {
  let i = 0, e = 0; for (const r of latestRuns(site)) { const c = runCoverage(rows(r, "results"), Number(r["expected_devices"]) || undefined); i += c.inspected; e += c.expected; }
  return { inspected: i, expected: e, value: e ? i / e : null };
}
/** Each device's latest recorded state across the site's runs (never tested when no run covered it). */
export function deviceStates(site: string): Map<string, string> {
  const out = new Map<string, string>(); const at = new Map<string, string>();
  for (const r of list("FSM Inspection Run").filter((x) => s(x["site"]) === site)) {
    const when = s(r["submitted_on"]) || s(r["modified"]) || s(r["creation"]); const g = new Map<string, Row[]>();
    for (const x of rows(r, "results")) { const d = s(x["device"]); if (!d) continue; const l = g.get(d) ?? []; l.push(x); g.set(d, l); }
    for (const [d, rs] of g) { if ((at.get(d) ?? "") > when) continue; at.set(d, when); out.set(d, deviceState(rs)); }
  }
  return out;
}

export function SiteOverview({ id }: { id: string }) {
  const { t, ar } = useFx();
  const systems = list("FSM Service System").filter((x) => s(x["site"]) === id);
  const devices = list("FSM Device").filter((x) => s(x["site"]) === id && s(x["lifecycle"]) !== "Retired");
  const cov = siteCoverage(id); const st = deviceStates(id);
  const tally = { done: 0, fail: 0, inacc: 0, untested: 0, never: 0 };
  for (const d of devices) { const x = st.get(d.name); if (!x) tally.never++; else if (x === "done") tally.done++; else if (x === "fail") tally.fail++; else if (x === "inacc") tally.inacc++; else tally.untested++; }
  const defs = list("FSM Deficiency").filter((d) => s(d["site"]) === id && OPEN_DEFICIENCY.has(s(d["workflow_state"])));
  const now = new Date().toISOString().slice(0, 16).replace("T", " ");
  const nextVisit = list(VISIT_DT).filter((v) => s(v["site"]) === id && ["Planned", "Dispatched", "Unscheduled"].includes(s(v["workflow_state"])) && s(v["scheduled_start"]) >= now.slice(0, 10)).sort((a, b) => s(a["scheduled_start"]).localeCompare(s(b["scheduled_start"])))[0];
  const nextObl = list("FSM Obligation").filter((o) => s(o["site"]) === id && ["Due", "Scheduled"].includes(s(o["status"]))).sort((a, b) => s(a["due_date"]).localeCompare(s(b["due_date"])))[0];
  const history = FSM_REPORTS.find((r) => r.id === "RP16")!.run({ site: id }).sort((a, b) => s(b["date"]).localeCompare(s(a["date"]))).slice(0, 10);
  const items: TlItem[] = history.map((h, i) => ({ id: `h${i}`, kind: /Finding|Deficiency/.test(s(h["event"])) ? "change" : "system", at: s(h["date"]), tone: /raised|Finding/.test(s(h["event"])) ? "warn" : undefined,
    title: <span>{opt(h["event"], ar)} · <DocRef doctype={s(h["record_doctype"])} name={h["record"]} /></span>, body: s(h["subject"]) ? <span data-no-i18n>{s(h["subject"])}</span> : undefined }));
  const defBySys = new Map<string, number>(); for (const d of defs) defBySys.set(s(d["system"]), (defBySys.get(s(d["system"])) ?? 0) + 1);
  const devBySys = new Map<string, number>(); for (const d of devices) devBySys.set(s(d["system"]), (devBySys.get(s(d["system"])) ?? 0) + 1);
  const lr = new Map(latestRuns(id).map((r) => [s(r["system"]), r]));
  return (
    <div data-site-overview={id}>
      <ImpairmentBanner site={id} />
      <div className="fsm-360-row">
        <Panel title={t("Coverage", "التغطية")} subtitle={t("Latest run of every system: inspected ÷ expected devices (K07 over the site)", "آخر تشغيل لكل نظام: المفحوص ÷ المتوقع (K07 على مستوى الموقع)")}>
          <BigRing value={cov.value} label={t("Site coverage", "تغطية الموقع")} sub={t(`${cov.inspected} of ${cov.expected} devices`, `${cov.inspected} من ${cov.expected} جهاز`)} code="K07" />
        </Panel>
        <Panel title={t("Devices by latest result", "الأجهزة حسب آخر نتيجة")} subtitle={t(`${devices.length} active devices`, `${devices.length} جهاز نشط`)}>
          <EkDonut ar={ar} centerLabel={t("devices", "جهاز")} data={[
            { key: "done", label: t("Passed", "ناجح"), value: tally.done, tone: "good" }, { key: "fail", label: t("Failed", "راسب"), value: tally.fail, tone: "risk" },
            { key: "inacc", label: t("Inaccessible", "تعذر الوصول"), value: tally.inacc, tone: "attention" }, { key: "untested", label: t("Untested in run", "لم يُفحص في التشغيل"), value: tally.untested, tone: "secondary" },
            { key: "never", label: t("Never tested", "لم يُفحص قط"), value: tally.never, tone: "neutral" }]} />
        </Panel>
        <Panel title={t("What comes next", "ما التالي")}>
          <KF items={[
            { label: t("Next visit", "الزيارة التالية"), value: nextVisit ? <AppLink to={`visit/${enc(nextVisit.name)}`}><span data-no-i18n>{dtTxt(nextVisit["scheduled_start"]) || t("not scheduled", "غير مجدولة")}</span></AppLink> : "—" },
            { label: t("Next obligation due", "الالتزام المستحق التالي"), value: nextObl ? <span data-no-i18n>{dateTxt(nextObl["due_date"])} · {nm("FSM Service System", nextObl["system"], ar)}</span> : "—" },
            { label: t("Open findings", "ملاحظات مفتوحة"), value: <AppLink to={`list/fsm_deficiency?filters=${enc(JSON.stringify([["site", "=", id]]))}`}><span data-no-i18n>{defs.length}</span> {defs.some((d) => s(d["severity"]) === "Critical") ? <Pill tone="bad">{t(`${defs.filter((d) => s(d["severity"]) === "Critical").length} critical`, `${defs.filter((d) => s(d["severity"]) === "Critical").length} حرجة`)}</Pill> : null}</AppLink> },
          ]} />
        </Panel>
      </div>
      <Panel title={t("Systems", "الأنظمة")} subtitle={t("Operating status, devices, open findings and the latest run of each system", "الحالة التشغيلية والأجهزة والملاحظات المفتوحة وآخر تشغيل لكل نظام")}>
        <ul className="fsm-sys-grid">{systems.map((x) => { const imp = s(x["operating_status"]) !== "In Service"; const r = lr.get(x.name); const c = r ? runCoverage(rows(r, "results"), Number(r["expected_devices"]) || undefined) : null;
          return <li key={x.name} className="fsm-sys-card" data-impaired={imp || undefined} data-system-card={x.name}>
            <div className="flex items-start justify-between gap-2"><p className="fsm-sys-n" data-no-i18n>{nm("FSM Service System", x.name, ar)}</p><Pill tone={imp ? "bad" : "ok"}>{opt(x["operating_status"], ar)}</Pill></div>
            <p className="fsm-sys-s">{opt(x["system_type"], ar)}</p>
            <dl className="fsm-sys-f"><div><dt>{t("Devices", "الأجهزة")}</dt><dd data-no-i18n>{devBySys.get(x.name) ?? 0}</dd></div><div><dt>{t("Open findings", "ملاحظات")}</dt><dd data-no-i18n data-tone={defBySys.get(x.name) ? "bad" : undefined}>{defBySys.get(x.name) ?? 0}</dd></div><div><dt>{t("Last coverage", "آخر تغطية")}</dt><dd data-no-i18n>{c?.coverage == null ? "—" : `${numTxt(c.coverage * 100, 0)}%`}</dd></div></dl>
            {r && <AppLink to={`run/${enc(r.name)}`} className="fsm-sys-l">{t("Latest run", "آخر تشغيل")} · <span data-no-i18n>{opt(r["workflow_state"], ar)}</span></AppLink>}
          </li>; })}</ul>
      </Panel>
      <Panel title={t("Service history", "سجل الخدمة")} subtitle={t("Latest 10 events, newest first — the History tab and RP16 hold all", "آخر 10 أحداث، الأحدث أولاً — تبويب السجل وتقرير RP16 يحويان الكل")} actions={<AppLink to={`reports/RP16?site=${enc(id)}`}>{t("Full history (RP16)", "السجل الكامل (RP16)")}</AppLink>}>
        <Timeline items={items} now={[]} ar={ar} when={(at) => dateTxt(at)} empty={t("No events yet.", "لا أحداث بعد.")} />
      </Panel>
    </div>
  );
}

export function DeviceTrend({ id }: { id: string }) {
  const { t, ar } = useFx(); const dev = raw("FSM Device", id);
  const hist = FSM_REPORTS.find((r) => r.id === "RP02")!.run({ device: id }).filter((h) => h["measurement"] !== undefined && h["measurement"] !== "" && Number.isFinite(Number(h["measurement"])));
  const by = new Map<string, Row[]>(); for (const h of hist) { const k = s(h["check_code"]); const l = by.get(k) ?? []; l.push(h); by.set(k, l); }
  const best = [...by].sort((a, b) => b[1].length - a[1].length)[0];
  const tpl = list("FSM Inspection Template").flatMap((x) => rows(x, "checks")).find((c) => s(c["check_code"]) === best?.[0]);
  const all = FSM_REPORTS.find((r) => r.id === "RP02")!.run({ device: id });
  const n = (o: string) => all.filter((h) => s(h["outcome"]) === o).length;
  return (
    <Panel title={t("Measurements over time", "القياسات عبر الزمن")} subtitle={best ? <span><span data-no-i18n>{best[0]} · {s(best[1][0]?.["check_text"])}</span>{tpl ? <span data-no-i18n> · {[tpl["min_value"] !== undefined ? `${ar ? "أدنى" : "min"} ${s(tpl["min_value"])}` : "", tpl["max_value"] !== undefined ? `${ar ? "أقصى" : "max"} ${s(tpl["max_value"])}` : "", s(tpl["unit"])].filter(Boolean).join(" · ")}</span> : null}</span> : t("No numeric measurement has been recorded for this device.", "لم يُسجَّل قياس رقمي لهذا الجهاز.")}>
      <div className="fsm-dev-trend" data-device-trend={id}>
        <div className="flex flex-wrap gap-2 mb-2"><Pill tone="ok">{t("Pass", "ناجح")} <b data-no-i18n>{n("Pass")}</b></Pill><Pill tone="bad">{t("Fail", "راسب")} <b data-no-i18n>{n("Fail")}</b></Pill><Pill tone="warn">{t("Inaccessible", "تعذر الوصول")} <b data-no-i18n>{n("Inaccessible")}</b></Pill><Pill tone="neutral">{t("Not applicable", "لا ينطبق")} <b data-no-i18n>{n("Not Applicable")}</b></Pill>{dev?.["location"] ? <Pill tone="info"><span data-no-i18n>{nm("FSM Location Node", dev["location"], ar)}</span></Pill> : null}</div>
        {best ? <AreaChart ar={ar} valueLabel={t("Measurement", "القياس")} data={[...best[1]].sort((a, b) => s(a["date"]).localeCompare(s(b["date"]))).map((h, i) => ({ key: `${s(h["run"])}-${i}`, label: dateTxt(h["date"]), value: Number(h["measurement"]), tone: s(h["outcome"]) === "Fail" ? "risk" as const : undefined }))} /> : null}
      </div>
    </Panel>
  );
}

/** 12-month obligation strip of an agreement: the current term year, per month on time / late / missed / due. */
export function obligationStrip(a: Doc): { months: string[]; values: Record<string, [number, number, number, number]> } {
  const start = s(a["start_date"]) || today(); let y0 = start.slice(0, 7);
  const add = (ym: string, m: number) => { const [y, mo] = ym.split("-").map(Number) as [number, number]; const d = new Date(Date.UTC(y, mo - 1 + m, 1)); return d.toISOString().slice(0, 7); };
  while (add(y0, 12) <= today().slice(0, 7)) y0 = add(y0, 12);
  const months = Array.from({ length: 12 }, (_, i) => add(y0, i)); const values: Record<string, [number, number, number, number]> = Object.fromEntries(months.map((m) => [m, [0, 0, 0, 0]]));
  for (const o of list("FSM Obligation").filter((x) => s(x["agreement"]) === a.name && s(x["status"]) !== "Waived")) {
    const m = s(o["due_date"]).slice(0, 7); const v = values[m]; if (!v) continue;
    const end = s(o["window_end"]) || s(o["due_date"]);
    if (s(o["status"]) === "Fulfilled") { if (s(o["fulfilled_on"]).slice(0, 10) <= end) v[0]++; else v[1]++; }
    else if (s(o["status"]) === "Missed" || isMissed(o)) v[2]++; else v[3]++;
  }
  return { months, values };
}
export function AgreementInsight({ a }: { a: Doc }) {
  const { t, ar } = useFx(); const strip = obligationStrip(a);
  const end = s(a["end_date"]); const start = s(a["start_date"]); const term = start && end ? Math.max(1, daysBetween(start, end)) : 0; const left = end ? daysBetween(today(), end) : 0;
  const ren = list("FSM Renewal Case").filter((r) => s(r["agreement"]) === a.name).sort((x, y) => s(y["modified"]).localeCompare(s(x["modified"])))[0];
  const jobs = new Set(list("FSM Job").filter((j) => s(j["agreement"]) === a.name).map((j) => j.name));
  const extra = list("FSM Charge Proposal").filter((p) => jobs.has(s(p["job"])) && s(p["coverage_decision"]) !== "Covered").reduce((x, p) => x + Number(p["amount"] ?? 0), 0);
  const hours = list("Timesheet").filter((ts) => jobs.has(s(ts["digit_fsm_job"])) && Number(ts["docstatus"]) === 1).reduce((x, ts) => x + Number(ts["total_hours"] ?? 0), 0);
  const value = Number(a["annual_value"] ?? 0);
  return (
    <div data-agreement-insight={a.name}>
      <Panel title={t("12-month obligation strip", "شريط الالتزامات لـ 12 شهرًا")} subtitle={t("Current term year by due month: on time · late · missed · still due", "سنة العقد الحالية حسب شهر الاستحقاق: في الموعد · متأخر · فائت · ما زال مستحقًا")} actions={<AppLink to={`reports/RP08?agreement=${enc(a.name)}`}>{t("Compliance (RP08)", "الالتزام (RP08)")}</AppLink>}>
        <StackedColumns ar={ar} attrs={{ "data-obligation-strip": a.name }} parts={[{ label: t("On time", "في الموعد"), tone: "good" }, { label: t("Late", "متأخر"), tone: "attention" }, { label: t("Missed", "فائت"), tone: "risk" }, { label: t("Due", "مستحق"), tone: "neutral" }]}
          cols={strip.months.map((m) => ({ key: m, label: monthLabel(m, ar), values: strip.values[m]! }))} />
      </Panel>
      <div className="fsm-360-row">
      <Panel title={t("Renewal", "التجديد")} subtitle={ren ? <span>{t("Renewal case", "حالة التجديد")} · <span data-no-i18n>{opt(ren["status"], ar)}</span></span> : t("No renewal case yet", "لا حالة تجديد بعد")}>
        <BigRing value={term ? Math.min(1, Math.max(0, (term - Math.max(0, left)) / term)) : null} tone={left <= 30 ? "bad" : left <= 90 ? "warn" : "ok"} label={left >= 0 ? t(`Ends in ${left} days`, `تنتهي خلال ${left} يوم`) : t(`Ended ${-left} days ago`, `انتهت منذ ${-left} يوم`)} sub={<span>{t("from", "من")} <span data-no-i18n>{dateTxt(start)}</span> {t("to", "إلى")} <span data-no-i18n>{dateTxt(end)}</span></span>} />
      </Panel>
      <Panel title={t("Contribution", "المساهمة")} subtitle={t("Contract value plus work charged outside the coverage, against approved labour hours", "قيمة العقد مع الأعمال المحمّلة خارج التغطية، مقابل ساعات العمل المعتمدة")}>
        <KF items={[
          { label: t("Annual value", "القيمة السنوية"), value: <span data-no-i18n>{money(value)}</span> },
          { label: t("Charged outside coverage", "محمّل خارج التغطية"), value: <span data-no-i18n>{money(extra)}</span> },
          { label: t("Agreement revenue", "إيراد الاتفاقية"), value: <b data-no-i18n>{money(value + extra)}</b> },
          { label: t("Approved labour hours", "ساعات العمل المعتمدة"), value: <span data-no-i18n>{numTxt(hours, 1)}</span> },
          { label: t("Revenue per labour hour", "الإيراد لكل ساعة عمل"), value: <span data-no-i18n>{hours ? money((value + extra) / hours) : "—"}</span> },
        ]} />
      </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Technician 360
export function technicianFacts(id: string, day = today()) {
  const tc = raw("FSM Technician", id);
  const bk = list("FSM Booking").filter((b) => s(b["technician"]) === id && s(b["status"]) !== "Cancelled");
  const hrs = (b: Doc) => Math.max(0, (Date.parse(s(b["booking_end"]).replace(" ", "T")) - Date.parse(s(b["booking_start"]).replace(" ", "T"))) / 3_600_000) || 0;
  const wk0 = addDays(day, -new Date(`${day}T12:00:00Z`).getUTCDay()); const wk1 = addDays(wk0, 7); // Saudi working week Sunday–Thursday
  const week = bk.filter((b) => s(b["booking_start"]).slice(0, 10) >= wk0 && s(b["booking_start"]).slice(0, 10) < wk1);
  const booked = week.reduce((a, b) => a + hrs(b), 0); const avail = (Number(tc?.["daily_hours"]) || 8) * 5;
  const led = new Set(bk.filter((b) => s(b["booking_role"]) !== "Assistant").map((b) => s(b["visit"])));
  const visits = list(VISIT_DT).filter((v) => led.has(v.name) || s(v["technician"]) === id);
  const jobs = new Map<string, Doc[]>(); for (const v of visits) { const k = s(v["job"]); if (!k) continue; const l = jobs.get(k) ?? []; l.push(v); jobs.set(k, l); }
  const fixJobs = [...jobs].filter(([j]) => ["Repair", "Corrective", "Emergency"].includes(s(raw("FSM Job", j)?.["job_type"])) && s(raw("FSM Job", j)?.["workflow_state"]) !== "Cancelled");
  const doneFix = fixJobs.filter(([, vs]) => vs.some((v) => s(v["workflow_state"]) === "Completed"));
  const firstTime = doneFix.filter(([, vs]) => vs.filter((v) => s(v["workflow_state"]) !== "Cancelled").length === 1).length;
  const skills = rows(tc, "skills").map((x) => ({ skill: s(x["skill"]), cert: s(x["certificate_no"]), until: s(x["valid_until"]), left: s(x["valid_until"]) ? daysBetween(day, s(x["valid_until"])) : null }));
  return { tc, booked, avail, util: avail ? booked / avail : null, weekFrom: wk0, firstTime, fixDone: doneFix.length, ftf: doneFix.length ? firstTime / doneFix.length : null, skills, visits, todayN: bk.filter((b) => s(b["booking_start"]).slice(0, 10) === day).length };
}
export function Technician360Page({ params }: PluginPageProps) {
  const { t, ar } = useFx(); const id = String(params["id"] ?? ""); const f = technicianFacts(id);
  if (!f.tc) return <Missing doctype="FSM Technician" name={id} />;
  const name = nm("FSM Technician", id, ar);
  const open = f.visits.filter((v) => ["Planned", "Dispatched", "On Site"].includes(s(v["workflow_state"]))).length;
  const exp = f.skills.filter((x) => x.left !== null && x.left <= 60);
  const tone = (left: number | null): "bad" | "warn" | "ok" | "neutral" => (left === null ? "neutral" : left < 0 ? "bad" : left <= 60 ? "warn" : "ok");
  const row = (label: string, value: ReactNode) => ({ label, value });
  return (
    <div className="w-full min-w-0" data-page="fsm-technician360" data-record={id}>
      <PageHeader title={name} crumbs={[{ label: t("Team & technicians", "الفريق والفنيون"), to: "technicians" }]} band={{
        question: t("Technician 360 — what can this technician do, what is today's plan, and how well is the work landing?", "الفني 360 — ماذا يستطيع هذا الفني، وما خطة اليوم، وما جودة إنجاز العمل؟"),
        basis: t("Skills and certificates from the technician record; plan and utilisation from bookings (Saudi working week Sunday–Thursday, daily hours × 5); first-time fix from completed repair jobs.", "المهارات والشهادات من سجل الفني؛ الخطة والاستغلال من الحجوزات (أسبوع العمل السعودي الأحد–الخميس، الساعات اليومية × 5)؛ الإصلاح من أول زيارة من أوامر الإصلاح المكتملة."),
        meta: [{ label: t("Crew", "الطاقم"), value: <span data-no-i18n>{nm("FSM Crew", f.tc["crew"], ar) || s(f.tc["crew"]) || "—"}</span> }, { label: t("Territory", "المنطقة"), value: <span data-no-i18n>{s(f.tc["territory"]) || "—"}</span> }, { label: t("Status", "الحالة"), value: opt(f.tc["status"], ar) }],
        actions: <><DocRef doctype="FSM Technician" name={id} form className="btn-secondary inline-flex min-h-9 items-center px-3 text-sm">{t("Edit technician", "تعديل الفني")}</DocRef><AppLink to="dispatch" className="btn-secondary inline-flex min-h-9 items-center px-3 text-sm">{t("Dispatch board", "لوحة الجدولة")}</AppLink></>,
      }} />
      {exp.length > 0 && <div className="mb-3"><Pill tone={exp.some((x) => (x.left ?? 0) < 0) ? "bad" : "warn"}>{t(`${exp.length} certificate(s) expire within 60 days`, `${exp.length} شهادة تنتهي خلال 60 يومًا`)}</Pill></div>}
      <SignalGrid cols={4}>
        <Kpi label={t("Bookings today", "حجوزات اليوم")} value={numTxt(f.todayN)} basis={t("Reserved bookings starting today", "حجوزات قائمة تبدأ اليوم")} to="dispatch" />
        <Kpi label={t("Utilisation this week", "الاستغلال هذا الأسبوع")} value={f.util === null ? "—" : numTxt(f.util * 100, 0)} unit="%" tone={f.util === null ? "neutral" : f.util > 1 ? "bad" : f.util >= 0.6 ? "good" : "warn"} basis={t(`${numTxt(f.booked, 1)} of ${numTxt(f.avail, 0)} h booked`, `${numTxt(f.booked, 1)} من ${numTxt(f.avail, 0)} ساعة محجوزة`)} />
        <Kpi label={t("First-time fix", "الإصلاح من أول زيارة")} value={f.ftf === null ? "—" : numTxt(f.ftf * 100, 0)} unit="%" tone={f.ftf === null ? "neutral" : f.ftf >= 0.8 ? "good" : "warn"} basis={t(`${f.firstTime} of ${f.fixDone} completed repairs in one visit`, `${f.firstTime} من ${f.fixDone} إصلاح مكتمل بزيارة واحدة`)} />
        <Kpi label={t("Open visits", "زيارات مفتوحة")} value={numTxt(open)} basis={t("Planned, dispatched or on site", "مخططة أو مرسلة أو في الموقع")} to={`visits?tech=${enc(id)}`} />
      </SignalGrid>
      <div className="fsm-360-row">
        <Panel title={t("Identity", "الهوية")}>
          <div className="flex items-center gap-3 mb-3"><Avatar name={name} size={56} /><div><p className="font-bold" data-no-i18n>{name}</p><p className="text-xs text-muted-foreground" data-no-i18n>{s(f.tc["phone"]) || "—"}</p></div></div>
          <KF items={[row(t("Employee", "الموظف"), <DocRef doctype="Employee" name={f.tc["employee"]} title form />), row(t("Van (warehouse)", "سيارة الخدمة (المستودع)"), <span data-no-i18n>{nm("Warehouse", f.tc["van_warehouse"], ar) || "—"}</span>), row(t("Daily hours", "الساعات اليومية"), <span data-no-i18n>{numTxt(f.tc["daily_hours"] ?? 8, 0)}</span>)]} />
        </Panel>
        <Panel title={t("Skills & certificates", "المهارات والشهادات")} subtitle={t("Expiry within 60 days in amber, expired in red", "الانتهاء خلال 60 يومًا بالأصفر، والمنتهية بالأحمر")}>
          <ul className="fsm-skill-list" data-skill-list={f.skills.length}>{f.skills.map((x, i) => <li key={i} data-tone={tone(x.left)}>
            <span className="fsm-skill-n">{opt(x.skill, ar)}</span><span className="fsm-skill-c" data-no-i18n>{x.cert || "—"}</span>
            <Pill tone={tone(x.left)}>{x.left === null ? t("no expiry", "بلا انتهاء") : x.left < 0 ? t(`expired ${-x.left} d ago`, `انتهت منذ ${-x.left} يوم`) : t(`valid ${x.left} d · ${x.until}`, `صالحة ${x.left} يوم · ${x.until}`)}</Pill></li>)}</ul>
        </Panel>
      </div>
      <Panel title={t("Today's plan — planned vs actual", "خطة اليوم — المخطط مقابل الفعلي")} subtitle={t("Bookings by hour with check-in / check-out under each block", "الحجوزات حسب الساعة مع الوصول والمغادرة تحت كل كتلة")}>
        <TeamDayTimeline techFilter={(x) => x.name === id} />
      </Panel>
      <TechMoney tech={id} />
    </div>
  );
}
