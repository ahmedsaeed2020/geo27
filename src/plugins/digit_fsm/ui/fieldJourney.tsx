import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * F4-01 / F4-02 / F4-06 technician journey at 390 (owner FSM round F4, N53–N58): «يومي» lists the day's visits in order
 * with time, site and distance; a visit opens as short steps — الزيارة (directions, call, work-pack readiness cards) →
 * الوصول → الفحص (per device: big buttons, measurement, photo) → الملاحظات (photo, severity buttons) → القطع والوقت →
 * توقيع العميل → الإرسال — with a progress bar on top and the main buttons in a bar at the bottom for one hand.
 * Every step goes through domain/fieldOps + services; while «العمل دون اتصال» is on, the same step is captured in the
 * offline queue (domain/offline) and replayed on sync, so the device and the office read one queue.
 */
import { useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Doc } from "@/lib/adapter";
import type { PluginPageProps } from "@/plugins/pages";
import { DayStops, HoursBar, MiniRing, OfflineBanner, OutcomePad, RequirementCards, SignaturePad, StepBar, StockCard, SyncChip, ThumbBar, type DayStop, type OutcomeOpt, type RequirementItem } from "@/components/enterprise/kit";
import { Pill } from "@/components/enterprise/kit/RecordFrame";
import { list, raw, rows } from "../domain/data";
import { addDays, runCoverage, s, today, type Row } from "../domain/rules";
import { visitFacts, visitIndex } from "../domain/visits";
import * as svc from "../domain/services";
import { myDay, sessionTechnician, workPack, type PackItem } from "../domain/field";
import { checkIn, logTime, moveParts, setFindingSeverity, signVisit, submitBlockers, submitVisit } from "../domain/fieldOps";
import { hoursOf, partsFlow, vanStock } from "../domain/billing";
import { capture, isOffline, offlineCounts, pendingResult, queue, setOffline, subscribeOffline, syncOffline, payloadOf, type OfflinePayload } from "../domain/offline";
import { nm } from "./dayBoard";
import { outcomeOptions, shrink, tv, walkModel } from "./runWalk";
import { AppLink, DocRef, INPUT, Missing, NewDoc, PageHeader, SignalGrid, Kpi, StateChip, notify, numTxt, opt, unitTxt, useFx, useUrlState, type Outcome } from "./kit";

export function useOfflineMode(): boolean { return useSyncExternalStore(subscribeOffline, isOffline, () => false); }
const hm = (v: unknown) => s(v).slice(11, 16);
const n0 = (v: unknown) => Number(v) || 0;
/** One journey step: online → the service now; offline → captured on the device for the next sync. */
function act(offline: boolean, tech: string, p: Omit<OfflinePayload, "base">, online: () => Outcome, ar: boolean) { notify(offline ? capture(tech, p) : online(), ar); }

/** Offline band with the queue link; sync replays the technician's queue. */
export function OfflineBand({ tech }: { tech: string }) {
  const { t, ar } = useFx(); const offline = useOfflineMode(); const c = offlineCounts(tech || undefined);
  return <OfflineBanner ar={ar} offline={offline} pending={c.pending} conflicts={c.conflict} onToggle={() => setOffline(!offline)}
    onSync={() => { const r = syncOffline(tech || undefined); notify(r, ar); }}
    queue={<AppLink to={`field/offline${tech ? `?tech=${encodeURIComponent(tech)}` : ""}`} className="ek-fk-btn" attrs={{ "data-size": "sm", "data-offline-queue-link": "" }}>{t("Queue", "الطابور")} <span data-no-i18n>{c.total}</span></AppLink>} />;
}

// ---------------------------------------------------------------- my day
export function FieldDayPage() {
  const { t, ar } = useFx(); const [q, set] = useUrlState();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q["day"] ?? "") ? q["day"]! : today();
  const techs = list("FSM Technician").filter((x) => s(x["status"]) !== "Inactive");
  const me = sessionTechnician();
  const busiest = useMemo(() => techs.map((x) => [x.name, myDay(x.name, day).stops.length] as const).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "", [techs.length, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const tech = q["tech"] || me?.name || busiest;
  const d = myDay(tech, day);
  const stops: DayStop[] = d.stops.map((x) => {
    const st = s(x.visit["workflow_state"]); const pack = workPack(x.visit.name, day);
    const tone = st === "Completed" ? "ok" : st === "On Site" ? "info" : x.facts.overdue ? "bad" : pack.ready ? "neutral" : "warn";
    const cta = st === "Completed" ? t("View", "عرض") : st === "On Site" ? t("Continue", "متابعة") : t("Start", "ابدأ");
    return { key: x.visit.name, time: hm(x.start), until: hm(x.end), tone,
      title: <span data-no-i18n>{nm("FSM Service Site", x.visit["site"], ar)}</span>,
      sub: <><span data-no-i18n>{nm("FSM Job", x.visit["job"], ar)}</span> · {opt(x.visit["visit_purpose"], ar)}{x.lead ? null : <> · {t("Assistant", "مساعد")}</>}</>,
      km: x.km, state: opt(st, ar),
      badge: st === "Completed" ? undefined : <Pill tone={pack.ready ? "ok" : "warn"} attrs={{ "data-pack": pack.ready ? "ok" : String(pack.missing) }}>{pack.ready ? t("Pack ready", "الحزمة سليمة") : t(`${pack.missing} missing`, `ناقص ${pack.missing}`)}</Pill>,
      open: <AppLink to={`field/visit/${encodeURIComponent(x.visit.name)}`} className="ek-fk-btn" attrs={{ "data-tone": st === "Completed" ? undefined : "primary", "data-size": "sm", "data-stop-open": x.visit.name }}>{cta}</AppLink> };
  });
  const name = nm("FSM Technician", tech, ar);
  return (
    <div className="w-full min-w-0 fsm-field" data-page="fsm-field-day" data-tech={tech} data-day={day}>
      <PageHeader title={t("My day", "يومي")} crumbs={[{ label: t("Technician workspace", "مساحة الفني الميدانية"), to: "field" }]} band={{
        question: t("Where do I go today, in which order, and is each visit ready?", "إلى أين أذهب اليوم، وبأي ترتيب، وهل كل زيارة جاهزة؟"),
        basis: t("Visits where the technician is the lead or a team member, in time order; distance is the straight line from the previous stop's site.", "الزيارات التي يكون الفني رئيسها أو عضوًا في فريقها، بترتيب الوقت؛ المسافة خط مستقيم من موقع الزيارة السابقة."),
        meta: [{ label: t("Technician", "الفني"), value: <span data-no-i18n>{name || "—"}</span> }, { label: t("Day", "اليوم"), value: <span data-no-i18n>{day}</span> }],
        controls: <div className="flex flex-wrap items-center gap-2">
          <select className={`${INPUT} min-h-10`} value={tech} onChange={(e) => set({ tech: e.target.value })} aria-label={t("Technician", "الفني")} data-tech-pick>
            {techs.map((x) => <option key={x.name} value={x.name}>{nm("FSM Technician", x.name, ar)}</option>)}
          </select>
          <button type="button" className="ek-fk-btn" data-size="sm" onClick={() => set({ day: addDays(day, -1) })}>{t("Previous day", "اليوم السابق")}</button>
          <button type="button" className="ek-fk-btn" data-size="sm" onClick={() => set({ day: undefined })} disabled={day === today()}>{t("Today", "اليوم")}</button>
          <button type="button" className="ek-fk-btn" data-size="sm" onClick={() => set({ day: addDays(day, 1) })}>{t("Next day", "اليوم التالي")}</button>
        </div>,
      }} />
      <OfflineBand tech={tech} />
      <SignalGrid cols={4}>
        <Kpi label={t("Visits today", "زيارات اليوم")} value={numTxt(d.stops.length)} basis={t("Lead or team member", "رئيسي أو ضمن الفريق")} icon="count" />
        <Kpi label={t("Done", "منجزة")} value={numTxt(d.done)} tone={d.done ? "good" : "neutral"} basis={t("Completed visits", "زيارات مكتملة")} icon="percent" />
        <Kpi label={t("Still to do", "متبقية")} value={numTxt(d.open)} tone={d.open ? "info" : "neutral"} basis={t("Planned, dispatched or on site", "مخططة أو مرسلة أو في الموقع")} icon="time" />
        <Kpi label={t("Distance", "المسافة")} value={numTxt(d.km, 1)} unit={t("km", "كم")} basis={t("Between consecutive sites", "بين المواقع المتتالية")} icon="chart" />
      </SignalGrid>
      <DayStops ar={ar} stops={stops} empty={t("No visits on this day for this technician.", "لا زيارات لهذا الفني في هذا اليوم.")} />
    </div>
  );
}

// ---------------------------------------------------------------- visit journey
const STEPS = ["visit", "checkin", "checklist", "findings", "parts", "sign", "submit"] as const;
type StepKey = (typeof STEPS)[number];
const STEP_LABEL: Record<StepKey, [string, string]> = { visit: ["Visit", "الزيارة"], checkin: ["Check-in", "الوصول"], checklist: ["Checklist", "الفحص"], findings: ["Findings", "الملاحظات"], parts: ["Parts & time", "القطع والوقت"], sign: ["Signature", "توقيع العميل"], submit: ["Submit", "الإرسال"] };
const SEVERITY = (ar: boolean): OutcomeOpt[] => [{ key: "Critical", label: ar ? "حرجة" : "Critical", tone: "bad" }, { key: "Major", label: ar ? "رئيسية" : "Major", tone: "warn" }, { key: "Minor", label: ar ? "ثانوية" : "Minor", tone: "neutral" }];

interface Ctx { v: Doc; tech: string; offline: boolean; runs: Doc[]; ar: boolean; t: (en: string, a: string) => string }
const pend = (tech: string, kind: OfflinePayload["kind"], visit: string) => queue(tech).filter((a) => s(a["sync_state"]) === "Pending").map(payloadOf).filter((p): p is OfflinePayload => !!p && p.kind === kind && p.visit === visit);
/** The row outcome as the device sees it (queued value first). */
const seen = (run: string, r: Row) => { const p = pendingResult(run, s(r["name"])); return { outcome: p?.kind === "Result" && p.outcome !== undefined ? p.outcome : s(r["outcome"]) || "Untested", queued: !!p }; };

function stepDone(k: StepKey, c: Ctx): boolean {
  const st = s(c.v["workflow_state"]);
  switch (k) {
    case "visit": return workPack(c.v.name).ready;
    case "checkin": return st === "On Site" || st === "Completed" || pend(c.tech, "Check-in", c.v.name).length > 0;
    case "checklist": return c.runs.every((r) => rows(r, "results").every((x) => seen(r.name, x).outcome !== "Untested"));
    case "findings": return c.runs.every((r) => rows(r, "results").every((x) => seen(r.name, x).outcome !== "Fail" || !!x["deficiency"] || !!pendingResult(r.name, s(x["name"]))));
    case "parts": return list("Timesheet").some((x) => s(x["digit_fsm_visit"]) === c.v.name) || pend(c.tech, "Time", c.v.name).length > 0;
    case "sign": return !!c.v["customer_signature"] || pend(c.tech, "Signature", c.v.name).length > 0;
    case "submit": return st === "Completed";
  }
}

export function FieldVisitPage({ params }: PluginPageProps) {
  const { t, ar } = useFx(); const [q, set] = useUrlState(); const offline = useOfflineMode();
  const id = String(params["id"] ?? ""); const v = raw(VISIT_DT, id);
  if (!v) return <Missing doctype={VISIT_DT} name={id} />;
  const f = visitFacts(v, visitIndex()); const tech = f.lead?.technician ?? s(v["technician"]);
  const runs = list("FSM Inspection Run").filter((r) => s(r["visit"]) === id);
  const c: Ctx = { v, tech, offline, runs, ar, t };
  const done = STEPS.map((k) => stepDone(k, c));
  const want = (STEPS as readonly string[]).includes(q["step"] ?? "") ? (q["step"] as StepKey) : STEPS[Math.max(0, done.findIndex((x) => !x))] ?? "visit";
  const i = STEPS.indexOf(want);
  const go = (k: StepKey) => { set({ step: k }); if (typeof window !== "undefined") window.scrollTo({ top: 0 }); };
  const pack = workPack(id, today(), (x) => (ar ? tv(x, true) : x));
  const body: Record<StepKey, ReactNode> = {
    visit: <StepVisit c={c} pack={pack.items} />, checkin: <StepCheckin c={c} />, checklist: <StepChecklist c={c} />, findings: <StepFindings c={c} />,
    parts: <StepParts c={c} />, sign: <StepSign c={c} />, submit: <StepSubmit c={c} />,
  };
  const site = nm("FSM Service Site", v["site"], ar);
  return (
    <div className="w-full min-w-0 fsm-field fsm-journey" data-page="fsm-field-visit" data-record={id} data-step={want}>
      <header className="fsm-jh">
        <AppLink to={`field/day?tech=${encodeURIComponent(tech)}`} className="fsm-jh-back" attrs={{ "data-back-day": "" }}>{ar ? "→" : "←"} {t("My day", "يومي")}</AppLink>
        <div className="fsm-jh-t"><h1 data-no-i18n>{site}</h1><span><bdi dir="ltr" data-no-i18n>{hm(v["scheduled_start"])}–{hm(v["scheduled_end"])}</bdi> · <span data-no-i18n>{nm("FSM Job", v["job"], ar)}</span></span></div>
        <StateChip value={v["workflow_state"]} />
      </header>
      <StepBar ar={ar} current={i} onPick={(k) => go(k as StepKey)} steps={STEPS.map((k, n) => ({ key: k, label: ar ? STEP_LABEL[k][1] : STEP_LABEL[k][0], done: done[n], warn: k === "visit" && !pack.ready }))} />
      <OfflineBand tech={tech} />
      <div className="fsm-jbody" data-step-body={want}>{body[want]}</div>
      <ThumbBar>
        <button type="button" className="ek-fk-btn" onClick={() => go(STEPS[Math.max(0, i - 1)]!)} disabled={i === 0} data-step-prev>{t("Back", "السابق")}</button>
        {i < STEPS.length - 1 && <button type="button" className="ek-fk-btn" data-tone="primary" onClick={() => go(STEPS[i + 1]!)} data-step-next>{t("Next", "التالي")}: {ar ? STEP_LABEL[STEPS[i + 1]!][1] : STEP_LABEL[STEPS[i + 1]!][0]}</button>}
      </ThumbBar>
    </div>
  );
}

function packCards(items: PackItem[], ar: boolean, t: (en: string, a: string) => string): RequirementItem[] {
  return items.map((it) => {
    const fix = it.fix; const label = fix ? (ar ? fix.label[1] : fix.label[0]) : "";
    const action = !fix || it.ok ? undefined : fix.kind === "link" ? <AppLink to={fix.to} className="ek-fk-btn" attrs={{ "data-size": "sm", "data-pack-fix": it.key }}>{label}</AppLink>
      : fix.kind === "doctype" ? <DocRef doctype={fix.to.split("|")[0]!} name={fix.to.split("|")[1]} form className="ek-fk-btn">{label}</DocRef>
        : <NewDoc doctype={fix.to} defaults={fix.defaults ?? {}} label={label} />;
    return { key: it.key, label: ar ? it.label[1] : it.label[0], state: it.ok ? (it.warn ? "warn" : "ok") : "missing", missing: it.missing, detail: ar ? it.detail[1] : it.detail[0], ...(it.ok && it.warn ? { badge: t("Check", "تنبيه") } : {}), ...(action ? { action } : {}) };
  });
}

function StepVisit({ c, pack }: { c: Ctx; pack: PackItem[] }) {
  const { v, ar, t } = c; const site = raw("FSM Service Site", v["site"]);
  const contact = rows(site, "contacts").find((x) => s(x["contact_role"]) === "Site Access" && s(x["phone"])) ?? rows(site, "contacts").find((x) => s(x["phone"]));
  const lat = Number(site?.["latitude"]), lng = Number(site?.["longitude"]); const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0;
  return <>
    <section className="fsm-jcard" data-visit-card>
      <p className="fsm-jcard-k">{t("Site", "الموقع")}</p>
      <h2 className="fsm-jcard-t" data-no-i18n>{nm("FSM Service Site", v["site"], ar)}</h2>
      <p className="fsm-jcard-s"><span data-no-i18n>{tv(site?.["city"], ar)}</span>{s(site?.["service_window"]) ? <> · {t("Window", "النافذة")} <span data-no-i18n>{tv(site?.["service_window"], ar)}</span></> : null}</p>
      {s(site?.["access_instructions"]) && <p className="fsm-jcard-note" data-no-i18n>{tv(site?.["access_instructions"], ar)}</p>}
      <div className="fsm-jcard-a">
        <a className="ek-fk-btn" data-tone="primary" href={hasGeo ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : undefined} target="_blank" rel="noreferrer" aria-disabled={!hasGeo} data-directions>{t("Directions", "الاتجاهات")}</a>
        <a className="ek-fk-btn" href={contact ? `tel:${s(contact["phone"]).replace(/\s+/g, "")}` : undefined} aria-disabled={!contact} data-call>{t("Call site", "اتصال بالموقع")}{contact ? <small className="ms-1" data-no-i18n>{s(contact["phone"])}</small> : null}</a>
      </div>
    </section>
    <RequirementCards ar={ar} title={t("Work-pack readiness", "جاهزية حزمة العمل")} items={packCards(pack, ar, t)} note={t("Each card is checked from the records now; fix a missing card before leaving.", "كل بطاقة تُفحص من السجلات الآن؛ أصلح البطاقة الناقصة قبل الخروج.")} />
  </>;
}

function StepCheckin({ c }: { c: Ctx }) {
  const { v, ar, t, offline, tech } = c; const st = s(v["workflow_state"]); const queued = pend(tech, "Check-in", v.name).length > 0;
  const late = v["arrived_on"] && v["scheduled_start"] ? Math.round((Date.parse(s(v["arrived_on"]).replace(" ", "T")) - Date.parse(s(v["scheduled_start"]).replace(" ", "T"))) / 60000) : null;
  return <section className="fsm-jcard fsm-jcenter" data-checkin>
    {st === "On Site" || st === "Completed" ? <>
      <p className="fsm-big-ok" aria-hidden>✓</p>
      <h2 className="fsm-jcard-t">{t("Checked in", "تم تسجيل الوصول")} <span data-no-i18n>{hm(v["arrived_on"])}</span></h2>
      {late !== null && <p className="fsm-jcard-s">{late > 5 ? t(`${late} min after the window start`, `بعد بداية الموعد بـ ${late} دقيقة`) : late < -5 ? t(`${-late} min early`, `مبكرًا بـ ${-late} دقيقة`) : t("On time", "في الموعد")}</p>}
    </> : queued ? <>
      <p className="fsm-big-ok" data-tone="warn" aria-hidden>⟳</p><h2 className="fsm-jcard-t">{t("Check-in saved on the device", "حُفظ الوصول على الجهاز")}</h2><SyncChip state="pending" ar={ar} />
    </> : <>
      <p className="fsm-jcard-s">{st === "Dispatched" ? t("Tap when you reach the site.", "اضغط عند وصولك للموقع.") : t("This visit has not been sent to you yet.", "لم تُرسل هذه الزيارة إليك بعد.")}</p>
      <button type="button" className="ek-fk-btn fsm-jbig" data-tone="primary" disabled={st !== "Dispatched"} onClick={() => act(offline, tech, { kind: "Check-in", visit: v.name }, () => checkIn(v.name), ar)} data-checkin-btn>{t("Check in now", "تسجيل الوصول الآن")}</button>
    </>}
  </section>;
}

function RowMeasure({ c, run, r, locked }: { c: Ctx; run: Doc; r: Row; locked: boolean }) {
  const { ar, t, offline, tech } = c; const tpl = raw("FSM Inspection Template", run["template"]);
  const chk = rows(tpl, "checks").find((x) => s(x["check_code"]) === s(r["check_code"]));
  const p = pendingResult(run.name, s(r["name"])); const cur = p?.measurement !== undefined ? String(p.measurement) : r["measurement"] == null ? "" : String(r["measurement"]);
  const [val, setVal] = useState(cur);
  if (!chk || (chk["min_value"] === undefined && chk["max_value"] === undefined && !chk["unit"])) return null;
  const commit = () => { if (val === cur) return; const m = val === "" ? "" : Number(val); act(offline, tech, { kind: "Result", run: run.name, row: s(r["name"]), measurement: m }, () => svc.recordResult(run.name, s(r["name"]), { measurement: m }), ar); };
  return <label className="fsm-jmeasure">
    <span>{t("Reading", "القراءة")}</span>
    <input type="number" inputMode="decimal" step="any" className={`${INPUT} min-h-11 w-28`} value={val} disabled={locked} onChange={(e) => setVal(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} data-j-measure={s(r["name"])} />
    <span data-no-i18n>{unitTxt(s(chk["unit"]), ar)}</span>
    <small data-no-i18n>{[chk["min_value"] !== undefined ? `${ar ? "أدنى" : "min"} ${s(chk["min_value"])}` : "", chk["max_value"] !== undefined ? `${ar ? "أقصى" : "max"} ${s(chk["max_value"])}` : ""].filter(Boolean).join(" · ")}</small>
  </label>;
}
function RowPhoto({ c, run, r, locked }: { c: Ctx; run: Doc; r: Row; locked: boolean }) {
  const { ar, t, offline, tech } = c; const ref = useRef<HTMLInputElement>(null);
  const photos = svc.resultPhotos(run.name, s(r["name"]));
  const queued = queue(tech).filter((a) => s(a["sync_state"]) === "Pending").map(payloadOf).filter((p) => p?.kind === "Photo" && p.run === run.name && p.row === s(r["name"]));
  return <span className="fsm-jphoto">
    {photos.slice(0, 3).map((p) => <img key={p.name} src={s(p["file_url"])} alt={s(p["file_name"])} />)}
    {queued.slice(0, 2).map((p, k) => p?.file ? <img key={`q${k}`} src={p.file.url} alt="" data-queued /> : null)}
    {!locked && <><input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" aria-label={t("Take a photo", "التقاط صورة")} data-j-photo-input={s(r["name"])}
      onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { const x = await shrink(file); act(offline, tech, { kind: "Photo", run: run.name, row: s(r["name"]), file: x }, () => svc.attachResultPhoto(run.name, s(r["name"]), x), ar); } catch { notify({ ok: false, message: "The photo could not be read", message_ar: "تعذر قراءة الصورة" }, ar); } }} />
      <button type="button" className="ek-fk-btn" data-size="sm" onClick={() => ref.current?.click()} data-j-photo={s(r["name"])}>📷 {photos.length + queued.length ? numTxt(photos.length + queued.length) : t("Photo", "صورة")}</button></>}
  </span>;
}

function StepChecklist({ c }: { c: Ctx }) {
  const { ar, t, offline, tech, runs } = c; const [only, setOnly] = useState(false);
  if (!runs.length) return <section className="fsm-jcard"><p className="fsm-jcard-s">{t("No inspection on this visit — go on to parts and time.", "لا فحص على هذه الزيارة — انتقل إلى القطع والوقت.")}</p></section>;
  return <>{runs.map((run) => {
    const locked = !["Draft", "In Progress"].includes(s(run["workflow_state"])); const m = walkModel(run, ar);
    const cov = runCoverage(rows(run, "results"), Number(run["expected_devices"]) || undefined);
    const devs = m.devices.filter((d) => !only || d.rows.some((x) => seen(run.name, x).outcome === "Untested"));
    return <section key={run.name} className="fsm-jrun" data-j-run={run.name}>
      <header className="fsm-jrun-h">
        <MiniRing done={cov.inspected} total={cov.expected} fail={cov.failedDevices} size={34} />
        <div><b data-no-i18n>{nm("FSM Service System", run["system"], ar)}</b><small><span data-no-i18n>{cov.inspected}/{cov.expected}</span> {t("devices inspected", "جهاز مفحوص")}{locked ? <> · {t("locked after submission", "مقفل بعد التقديم")}</> : null}</small></div>
        <label className="fsm-jonly"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} data-j-only /> {t("Untested only", "غير المفحوص فقط")}</label>
      </header>
      {devs.map((d) => <article key={d.id} className="fsm-jdev" data-j-device={d.id} data-state={d.state}>
        <p className="fsm-jdev-t"><b data-no-i18n>{d.id === "__sys" ? t("System-level checks", "بنود مستوى النظام") : nm("FSM Device", d.id, ar)}</b>{d.path.length ? <small data-no-i18n>{d.path.map((p) => nm("FSM Location Node", p, ar)).join(" › ")}</small> : null}</p>
        {d.rows.map((r) => { const x = seen(run.name, r); return <div key={s(r["name"])} className="fsm-jrow" data-j-row={s(r["name"])} data-outcome={x.outcome}>
          <p className="fsm-jrow-t"><span data-no-i18n>{tv(r["check_text"], ar)}</span>{x.queued && <SyncChip state="pending" ar={ar} />}</p>
          <OutcomePad id={`${run.name}-${s(r["name"])}`} ar={ar} value={x.outcome === "Untested" ? "" : x.outcome} options={outcomeOptions(ar)} disabled={locked} note={s(r["note"])}
            onPick={(k, why) => act(offline, tech, { kind: "Result", run: run.name, row: s(r["name"]), outcome: k, ...(why ? { note: why } : {}) }, () => svc.recordResult(run.name, s(r["name"]), why ? { outcome: k, note: why } : { outcome: k }), ar)} />
          <div className="fsm-jrow-x"><RowMeasure c={c} run={run} r={r} locked={locked} /><RowPhoto c={c} run={run} r={r} locked={locked} /></div>
        </div>; })}
      </article>)}
      {!devs.length && <p className="fsm-jcard-s">{t("Every device of this system has a result.", "كل أجهزة هذا النظام لها نتيجة.")}</p>}
    </section>;
  })}</>;
}

function StepFindings({ c }: { c: Ctx }) {
  const { ar, t, offline, tech, runs } = c;
  const fails = runs.flatMap((run) => rows(run, "results").filter((r) => seen(run.name, r).outcome === "Fail").map((r) => ({ run, r })));
  if (!fails.length) return <section className="fsm-jcard fsm-jcenter"><p className="fsm-big-ok" aria-hidden>✓</p><p className="fsm-jcard-s">{t("No failed checks — nothing to report.", "لا بنود راسبة — لا ملاحظات.")}</p></section>;
  return <>{fails.map(({ run, r }) => {
    const def = raw("FSM Deficiency", r["deficiency"]); const p = pendingResult(run.name, s(r["name"])); const sev = p?.kind === "Severity" ? s(p.severity) : s(def?.["severity"]);
    return <article key={`${run.name}-${s(r["name"])}`} className="fsm-jdev" data-j-finding={s(r["name"])} data-state="fail">
      <p className="fsm-jdev-t"><b data-no-i18n>{tv(r["check_text"], ar)}</b><small data-no-i18n>{r["device"] ? nm("FSM Device", r["device"], ar) : nm("FSM Service System", run["system"], ar)}</small></p>
      {s(r["note"]) && <p className="fsm-jcard-s" data-no-i18n>{tv(r["note"], ar)}</p>}
      <p className="fsm-jrow-t">{t("Severity", "الخطورة")}{p?.kind === "Severity" && <SyncChip state="pending" ar={ar} />}</p>
      <OutcomePad id={`sev-${run.name}-${s(r["name"])}`} ar={ar} value={sev} options={SEVERITY(ar)} disabled={!["Draft", "In Progress"].includes(s(run["workflow_state"])) && !def}
        onPick={(k) => act(offline, tech, { kind: "Severity", run: run.name, row: s(r["name"]), severity: k as "Critical" | "Major" | "Minor" }, () => setFindingSeverity(run.name, s(r["name"]), k as "Critical" | "Major" | "Minor"), ar)} />
      <div className="fsm-jrow-x"><RowPhoto c={c} run={run} r={r} locked={!["Draft", "In Progress"].includes(s(run["workflow_state"]))} />{def && <AppLink to={`deficiency/${encodeURIComponent(def.name)}`} className="ek-fk-btn" attrs={{ "data-size": "sm" }}>{t("Open finding", "فتح الملاحظة")}</AppLink>}</div>
    </article>;
  })}</>;
}

function StepParts({ c }: { c: Ctx }) {
  const { v, ar, t, offline, tech } = c; const van = vanStock(tech); const job = s(v["job"]); const flow = partsFlow(job);
  const draftQty = (purpose: string, item: string) => n0(rows(list("Stock Entry").find((x) => s(x["digit_fsm_visit"]) === v.name && n0(x["docstatus"]) === 0 && s(x["purpose"]) === purpose), "items").find((l) => s(l["item_code"]) === item)?.["qty"]);
  const queuedQty = (mode: "use" | "return", item: string) => { const p = pend(tech, "Parts", v.name).filter((x) => x.item === item && (x.mode ?? "use") === mode).slice(-1)[0]; return p ? n0(p.qty) : undefined; };
  const step = (item: string, mode: "use" | "return", next: number) => act(offline, tech, { kind: "Parts", visit: v.name, item, qty: next, mode }, () => moveParts(v.name, item, next, mode), ar);
  const stepper = (item: string, mode: "use" | "return", max: number) => { const q0 = queuedQty(mode, item) ?? draftQty(mode === "use" ? "Material Issue" : "Material Transfer", item);
    return <span className="fsm-jstep" data-j-parts={`${mode}:${item}`}><button type="button" className="ek-fk-btn" data-size="sm" disabled={q0 <= 0} onClick={() => step(item, mode, q0 - 1)} aria-label={t("Less", "أقل")}>−</button><b data-no-i18n>{q0}</b><button type="button" className="ek-fk-btn" data-size="sm" disabled={q0 >= max} onClick={() => step(item, mode, q0 + 1)} aria-label={t("More", "أكثر")}>+</button></span>; };
  const ts = list("Timesheet").find((x) => s(x["digit_fsm_visit"]) === v.name && n0(x["docstatus"]) !== 2);
  const since = v["arrived_on"] ? (Date.now() - Date.parse(s(v["arrived_on"]).replace(" ", "T"))) / 3_600_000 : NaN;
  const dflt = ts ? n0(ts["total_hours"]) : Number.isFinite(since) && since > 0 ? Math.min(8, Math.max(0.5, Math.round(since * 4) / 4)) : Math.max(0.5, Math.round(((Date.parse(s(v["scheduled_end"]).replace(" ", "T")) - Date.parse(s(v["scheduled_start"]).replace(" ", "T"))) / 3_600_000 || 2) * 4) / 4);
  const [hours, setHours] = useState(String(dflt)); const h = hoursOf({ job });
  const returnable = flow.lines.filter((l) => l.issued - l.used > 0);
  return <>
    <StockCard ar={ar} title={t("Van stock", "مخزون السيارة")} sub={<span data-no-i18n>{nm("Warehouse", van.warehouse, ar) || van.warehouse}</span>}
      lines={van.lines.map((l) => ({ key: l.item, label: <span data-no-i18n>{tv(l.item_name, ar)}</span>, qty: l.qty, unit: opt(l.uom, ar), pending: l.pending, low: l.low, action: stepper(l.item, "use", Math.max(0, l.free + draftQty("Material Issue", l.item))) }))}
      total={<>{t("Use on this visit with + / − — saved as a draft stock entry that stores posts.", "سجّل المستخدم في هذه الزيارة بـ + / − — يُحفظ مسودة قيد مخزون يرحّلها المستودع.")}</>} empty={t("The van has no stock.", "لا رصيد في السيارة.")} />
    {returnable.length > 0 && <section className="fsm-jcard" data-j-returns>
      <p className="fsm-jcard-k">{t("Return unused parts to stores", "إرجاع القطع غير المستخدمة للمستودع")}</p>
      <ul className="fsm-jlist">{returnable.map((l) => <li key={l.item}><span data-no-i18n>{tv(l.item_name, ar)}</span><small>{t("issued", "مصروف")} <span data-no-i18n>{l.issued}</span> · {t("used", "مستخدم")} <span data-no-i18n>{l.used}</span></small>{stepper(l.item, "return", l.issued - l.used)}</li>)}</ul>
    </section>}
    <section className="fsm-jcard" data-j-time>
      <p className="fsm-jcard-k">{t("Time on this visit", "الوقت في هذه الزيارة")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">{t("Hours", "الساعات")}<input type="number" min={0.25} max={16} step={0.25} inputMode="decimal" className={`${INPUT} min-h-12 w-32 text-lg`} value={hours} onChange={(e) => setHours(e.target.value)} data-j-hours /></label>
        <button type="button" className="ek-fk-btn" data-tone="primary" onClick={() => act(offline, tech, { kind: "Time", visit: v.name, hours: Number(hours) }, () => logTime(v.name, Number(hours)), ar)} data-j-time-save>{ts ? t("Update time", "تحديث الوقت") : t("Save time", "حفظ الوقت")}</button>
        {ts && <DocRef doctype="Timesheet" name={ts.name} form className="text-sm text-primary hover:underline">{ts.name}</DocRef>}
      </div>
      <div className="mt-3"><HoursBar ar={ar} label={t("This job", "أمر العمل هذا")} booked={h.booked} logged={h.logged} approved={h.approved} /></div>
    </section>
  </>;
}

function StepSign({ c }: { c: Ctx }) {
  const { v, ar, t, offline, tech } = c; const site = raw("FSM Service Site", v["site"]);
  const fm = rows(site, "contacts").find((x) => s(x["contact_role"]) === "Facility Manager");
  const queued = pend(tech, "Signature", v.name).slice(-1)[0];
  const [who, setWho] = useState(s(v["signed_by"]) || queued?.signer || nm("Contact", fm?.["contact"], ar) || "");
  const [img, setImg] = useState<string | null>(null);
  const signed = s(v["customer_signature"]) || queued?.image || "";
  const locked = s(v["workflow_state"]) === "Completed";
  return <section className="fsm-jcard" data-j-sign>
    <p className="fsm-jcard-k">{t("Customer signature", "توقيع العميل")}</p>
    {signed && !img ? <div className="fsm-jsigned"><img src={signed} alt={t("Customer signature", "توقيع العميل")} data-j-signed-img /><p><b data-no-i18n>{s(v["signed_by"]) || queued?.signer}</b> <span data-no-i18n>{hm(v["signed_on"])}</span>{queued && !v["customer_signature"] ? <> <SyncChip state="pending" ar={ar} /></> : null}</p></div> : null}
    {!locked && <>
      <label className="grid gap-1 text-sm">{t("Name of the person signing", "اسم الموقّع")}<input className={`${INPUT} min-h-12`} value={who} onChange={(e) => setWho(e.target.value)} data-j-signer /></label>
      <div className="mt-2"><SignaturePad ar={ar} onChange={setImg} /></div>
      <div className="mt-2 flex flex-wrap gap-2"><button type="button" className="ek-fk-btn" data-tone="primary" disabled={!img || !who.trim()} onClick={() => { if (!img) return; act(offline, tech, { kind: "Signature", visit: v.name, signer: who, image: img }, () => signVisit(v.name, who, img), ar); setImg(null); }} data-j-sign-save>{t("Save signature", "حفظ التوقيع")}</button></div>
    </>}
  </section>;
}

function StepSubmit({ c }: { c: Ctx }) {
  const { v, ar, t, offline, tech } = c; const st = s(v["workflow_state"]); const block = submitBlockers(v.name); const pending = offlineCounts(tech).pending;
  if (st === "Completed") return <section className="fsm-jcard fsm-jcenter" data-j-submitted><p className="fsm-big-ok" aria-hidden>✓</p><h2 className="fsm-jcard-t">{t("Visit submitted", "تم إرسال الزيارة")} <span data-no-i18n>{hm(v["completed_on"])}</span></h2><AppLink to={`visit/${encodeURIComponent(v.name)}`} className="ek-fk-btn">{t("Open the visit record", "فتح سجل الزيارة")}</AppLink></section>;
  return <section className="fsm-jcard" data-j-submit>
    <p className="fsm-jcard-k">{t("Before you submit", "قبل الإرسال")}</p>
    <ul className="fsm-jchecks">{block.length ? block.map((b, k) => <li key={k} data-tone="bad">✕ {ar ? b[1] : b[0]}</li>) : <li data-tone="ok">✓ {t("Everything is recorded", "كل شيء مسجل")}</li>}</ul>
    {offline || pending > 0 ? <p className="fsm-jcard-note">{t("Sync the steps saved on the device first — the visit is submitted once the office has them.", "زامن الخطوات المحفوظة على الجهاز أولاً — تُرسل الزيارة بعد وصولها للمكتب.")}</p> : null}
    <button type="button" className="ek-fk-btn fsm-jbig" data-tone="primary" disabled={offline || pending > 0 || block.length > 0} onClick={() => notify(submitVisit(v.name), ar)} data-j-submit-btn>{t("Submit the visit", "إرسال الزيارة")}</button>
  </section>;
}
