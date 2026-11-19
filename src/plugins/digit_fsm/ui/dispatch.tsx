import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * Dispatch board (N31) and emergency triage (N14). Bookings are technician time on one visit; the board shows them per
 * technician lane for one day, next to the unscheduled-visit queue. Reserving checks eligibility (skill + certificate
 * valid on the booking date), overlapping bookings and approved unavailability BEFORE writing (services.bookVisit), and
 * the board previews the same checks live so the dispatcher sees why a slot is refused.
 */
import { DateInput } from "@/components/form/DateInput";
import { useMemo, useState } from "react";
import type { Doc } from "@/lib/adapter";
import { list, raw, titleOf } from "../domain/data";
import { addDays, eligibility, s, today } from "../domain/rules";
import * as svc from "../domain/services";
import { ActionButton, AppLink, BAND, BTN, DataTable, DocRef, INPUT, Kpi, PageHeader, Panel, PersonRef, SignalGrid, SlaCell, StateChip, WorkflowButtons, dateTxt, dtTxt, notify, numTxt, opt, useFx, useUrlState } from "./kit";
import { BoardCard, DRAG_MIME, DayBoard, RouteMap, WeekBoard, type MapPin } from "@/components/enterprise/kit";
import { Avatar, Pill } from "@/components/enterprise/kit/RecordFrame";
import { KeyFacts } from "@/components/enterprise/kit/KeyFacts";
import { openQuickView } from "@/components/enterprise/QuickView";
import { slaOf } from "../domain/workState";
import { H0, H1, Legend, ROUTE_HUES, STATUS, addHours, dayModel, hhmm, nm, nowHour, visitHue } from "./dayBoard";
import { PageInsights } from "./ov/ded";

export function DispatchPage() {
  const fx = useFx(); const { t, ar } = fx;
  const [f, set] = useUrlState();
  const day = f["date"] ?? today(); const week = f["view"] === "week";
  const visitId = f["visit"] ?? "";
  const [tech, setTech] = useState(""); const [time, setTime] = useState("09:00"); const [hours, setHours] = useState("3"); const [role, setRole] = useState<"Lead" | "Assistant">("Lead");
  const [picked, setPicked] = useState<string>(""); const [city, setCity] = useState("");
  const techs = list("FSM Technician").filter((x) => s(x["status"]) !== "Inactive").sort((a, b) => s(a["crew"]).localeCompare(s(b["crew"])) || s(a["technician_name"]).localeCompare(s(b["technician_name"])));
  const model = dayModel(day, techs, ar, (b) => setPicked((p) => (p === b.name ? "" : b.name)));
  const queue = list(VISIT_DT).filter((v) => ["Unscheduled", "Planned"].includes(s(v["workflow_state"])) && !(s(v["workflow_state"]) === "Planned" && list("FSM Booking").some((b) => s(b["visit"]) === v.name && s(b["status"]) !== "Cancelled")))
    .sort((a, b) => (s(a["workflow_state"]) === "Unscheduled" ? -1 : 1) - (s(b["workflow_state"]) === "Unscheduled" ? -1 : 1) || (slaOf(VISIT_DT, a).leftH - slaOf(VISIT_DT, b).leftH));
  const visit = visitId ? raw(VISIT_DT, visitId) : undefined;
  const skill = svc.requiredSkill(visit);
  const start = `${day} ${time}`; const end = addHours(day, time, Number(hours) || 0);
  const preview = useMemo(() => {
    if (!visit || !tech) return null;
    const el = eligibility(raw("FSM Technician", tech), skill, start);
    const c = svc.bookingConflicts(tech, start, end);
    return { el, c };
  }, [visit, tech, skill, start, end]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickedB = picked ? raw("FSM Booking", picked) : undefined;
  const pickedV = pickedB ? raw(VISIT_DT, pickedB["visit"]) : undefined;
  /** drop a waiting visit on a technician row: book straight away when eligible and free, otherwise open the booking form with the reason */
  const drop = (row: string, hour: number, vis: string) => {
    const v = raw(VISIT_DT, vis); if (!v) return;
    const tm = hhmm(Math.min(H1 - 1, Math.max(H0, hour))); const len = Number(hours) || 3; const a = `${day} ${tm}`, b = addHours(day, tm, len);
    const el = eligibility(raw("FSM Technician", row), svc.requiredSkill(v), a); const c = svc.bookingConflicts(row, a, b);
    set({ visit: vis }); setTech(row); setTime(tm);
    if (el.ok && !c.bookings.length && !c.unavailable.length) notify(svc.bookVisit(vis, row, a, b, "Lead"), ar);
  };
  // week view (shared WeekBoard): Sunday → Saturday, Friday and Saturday off
  const dow = new Date(`${day}T00:00:00`).getDay(); const ws = addDays(day, -dow);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const weekBookings = week ? list("FSM Booking").filter((b) => s(b["status"]) !== "Cancelled" && s(b["booking_start"]).slice(0, 10) >= ws && s(b["booking_start"]).slice(0, 10) <= days[6]!) : [];
  const hrs = (b: Doc) => Math.max(0, (Date.parse(s(b["booking_end"]).replace(" ", "T")) - Date.parse(s(b["booking_start"]).replace(" ", "T"))) / 3600000);
  // route map: lead bookings of the day per technician in time order, one city at a time
  const leadToday = model.bookings.filter((b) => s(b["booking_role"]) !== "Assistant");
  const cities = [...new Set(leadToday.map((b) => s(raw("FSM Service Site", b["site"])?.["city"])).filter(Boolean))].sort((a, b) => leadToday.filter((x) => s(raw("FSM Service Site", x["site"])?.["city"]) === b).length - leadToday.filter((x) => s(raw("FSM Service Site", x["site"])?.["city"]) === a).length);
  const mapCity = city && cities.includes(city) ? city : cities[0] ?? "";
  const routeTechs = [...new Set(leadToday.filter((b) => s(raw("FSM Service Site", b["site"])?.["city"]) === mapCity).map((b) => s(b["technician"])))];
  const pins: MapPin[] = routeTechs.flatMap((tk) => leadToday.filter((b) => s(b["technician"]) === tk && s(raw("FSM Service Site", b["site"])?.["city"]) === mapCity).sort((a, b) => s(a["booking_start"]).localeCompare(s(b["booking_start"]))).map((b, i) => {
    const site = raw("FSM Service Site", b["site"]); const v = raw(VISIT_DT, b["visit"]); const blk = model.blocks.find((x) => x.key === b.name);
    return { key: b.name, lat: Number(site?.["latitude"]), lng: Number(site?.["longitude"]), order: i + 1, route: tk, tone: blk?.alert ? "alert" : (STATUS[s(v?.["workflow_state"])] ?? "planned"), title: nm("FSM Service Site", b["site"], ar), sub: `${s(b["booking_start"]).slice(11, 16)} · ${nm("FSM Technician", tk, ar)}`,
      onOpen: (el: HTMLElement) => { if (v) openQuickView({ kind: "doc", doctype: VISIT_DT, name: v.name }, el); } } satisfies MapPin;
  })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const isToday = day === today();
  const util = model.capacity ? Math.round((model.booked / model.capacity) * 100) : 0;
  const waiting = queue.filter((v) => s(v["workflow_state"]) === "Unscheduled").length;
  return (
    <div className="w-full min-w-0" data-page="fsm-dispatch">
      <PageHeader title={t("Dispatch board", "لوحة الجدولة")} band={{
        question: t("Who goes where, when — and is each technician eligible and free?", "من يذهب إلى أين ومتى — وهل كل فني مؤهل ومتاح؟"),
        basis: t("One row per active technician, grouped by crew. A booking is one technician's time on one visit; the lead booking plans the visit. Eligibility, overlaps and approved unavailability are checked before saving — drag a waiting visit onto a technician to book it.", "صف لكل فني نشط مجمّع حسب الطاقم. الحجز وقت فني واحد على زيارة واحدة؛ حجز الفني الرئيسي يخطط الزيارة. تُفحص الأهلية والتداخل وعدم التوفر المعتمد قبل الحفظ — اسحب زيارة منتظرة إلى فني لحجزها."),
        controls: <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[9rem] flex-col gap-1 text-[11px] font-medium text-dx-on-band-muted">{t("Day", "اليوم")}<DateInput className="min-h-9 rounded-md border border-dx-on-band/25 bg-dx-on-band/10 px-2.5 py-1.5 text-sm text-dx-on-band max-md:min-h-11" value={day} onChange={(e) => set({ date: e.target.value || undefined })} data-scope="date" /></label>
          <span className="inline-flex gap-1" role="group" aria-label={t("Board view", "عرض اللوحة")}>
            {([["day", t("Day", "يوم")], ["week", t("Week", "أسبوع")]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={(k === "week") === week} data-board-view={k} onClick={() => set({ view: k === "week" ? "week" : undefined })}
              className={(k === "week") === week ? BAND.primary : BAND.secondary}>{l}</button>)}
          </span></div>,
        meta: [{ label: t("Bookings", "الحجوزات"), value: <span data-no-i18n>{model.bookings.length}</span> }, { label: t("Waiting visits", "زيارات بالانتظار"), value: <span data-no-i18n>{waiting}</span> }],
        actions: <><button type="button" className={BAND.secondary} onClick={() => set({ date: addDays(day, week ? -7 : -1) })}>{week ? t("Previous week", "الأسبوع السابق") : t("Previous day", "اليوم السابق")}</button><button type="button" className={BAND.secondary} onClick={() => set({ date: undefined })}>{t("Today", "اليوم")}</button><button type="button" className={BAND.secondary} onClick={() => set({ date: addDays(day, week ? 7 : 1) })}>{week ? t("Next week", "الأسبوع التالي") : t("Next day", "اليوم التالي")}</button></>,
      }} />
      <SignalGrid cols={4}>
        <Kpi label={t("Booked hours", "الساعات المحجوزة")} value={<span data-no-i18n>{numTxt(model.booked, 1)}</span>} unit={t("h", "س")} tone="info" basis={t(`of ${numTxt(model.capacity)} h available today`, `من ${numTxt(model.capacity)} س متاحة اليوم`)} />
        <Kpi label={t("Utilisation", "الاستغلال")} value={<span data-no-i18n>{util}%</span>} tone={util > 100 ? "bad" : util >= 60 ? "good" : "warn"} basis={t("Booked ÷ available hours of active technicians", "المحجوز ÷ الساعات المتاحة للفنيين النشطين")} />
        <Kpi label={t("Conflicts", "التعارضات")} value={<span data-no-i18n data-conflicts={model.conflicts}>{model.conflicts}</span>} tone={model.conflicts ? "bad" : "good"} basis={t("Double bookings, skill or certificate mismatch, unavailability", "حجز مزدوج أو عدم تطابق المهارة أو الشهادة أو عدم توفر")} />
        <Kpi label={t("Waiting visits", "زيارات بالانتظار")} value={<span data-no-i18n>{waiting}</span>} tone={waiting ? "warn" : "good"} basis={t("Unscheduled visits in the list to plan", "زيارات غير مجدولة في قائمة التخطيط")} />
      </SignalGrid>
      <PageInsights k="dispatch" blocks={[{ id: "board", first: true, title: ["Technician lanes", "مسارات الفنيين"], node: (
      <div className="flex min-w-0 flex-col gap-4">
          <Panel title={t("Unscheduled", "غير مجدول")} subtitle={t("Drag a visit onto a technician, or pick it and choose the time.", "اسحب الزيارة إلى فني، أو اخترها وحدد الموعد.")} flush={false} attrs={{ "data-unscheduled": String(queue.length) }}>
            {!queue.length ? <p className="text-sm text-muted-foreground">{t("No visits waiting.", "لا زيارات بالانتظار.")}</p> : (
              <ul className="flex snap-x gap-2 overflow-x-auto pb-1" aria-label={t("Visits to plan", "زيارات للتخطيط")}>
                {queue.map((v) => { const hue = visitHue(v); const req = svc.requiredSkill(v); return <li key={v.name} className="w-[17rem] shrink-0 snap-start"><button type="button" draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, v.name); e.dataTransfer.setData("text/plain", v.name); e.dataTransfer.effectAllowed = "copy"; }}
                  onClick={() => set({ visit: v.name })} aria-pressed={visitId === v.name} data-pick-visit={v.name}
                  className={`ek-uq w-full cursor-grab rounded-lg border bg-card px-3 py-2.5 text-start text-xs shadow-sm transition hover:-translate-y-px hover:shadow-md ${visitId === v.name ? "border-primary ring-2 ring-primary/25" : "border-border"}`} style={{ borderInlineStartWidth: 4, borderInlineStartColor: `var(--${hue})` }}>
                  <span className="flex items-center justify-between gap-2"><span className="truncate text-[13px] font-bold text-foreground" data-no-i18n>{titleOf("FSM Service Site", v["site"])}</span><SlaCell doctype={VISIT_DT} doc={v} /></span>
                  <span className="mt-0.5 block truncate text-muted-foreground" data-no-i18n>{titleOf("FSM Job", v["job"])}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1"><StateChip value={v["workflow_state"]} /><Pill hue={hue === "grey" ? undefined : hue === "rose" ? "coral" : hue === "amber" ? "amber" : hue === "violet" ? "violet" : hue === "teal" ? "teal" : "blue"}>{opt(raw("FSM Job", v["job"])?.["job_type"] ?? v["visit_purpose"], ar)}</Pill>{req ? <Pill>{opt(req, ar)}</Pill> : null}{s(v["block_reason"]) && s(v["block_reason"]) !== "None" ? <Pill tone="warn">{t("Blocked: ", "معلق: ")}{opt(v["block_reason"], ar)}</Pill> : null}</span>
                </button></li>; })}
              </ul>)}
          </Panel>
          <Panel title={week ? `${t("Week board", "لوحة الأسبوع")} · ${dateTxt(ws)} – ${dateTxt(days[6])}` : `${t("Technician lanes", "مسارات الفنيين")} · ${dtTxt(`${day} 00:00`).slice(0, -6)}`} flush={false} attrs={{ "data-board": week ? "week" : "day" }}>
            {!week ? <DayBoard rows={model.rows} blocks={model.blocks} gaps={model.gaps} from={H0} to={H1} ar={ar} now={isToday ? nowHour() : undefined} onDrop={drop} rowHead={t("Technician", "الفني")}
              groups={Object.fromEntries(model.rows.filter((r) => r.group).map((r) => [r.group!, <span key={r.group}><span data-no-i18n>{r.group}</span> · <span data-no-i18n>{model.rows.filter((x) => x.group === r.group).length}</span> {t("technicians", "فنيين")}</span>]))}
              legend={<Legend ar={ar} />} empty={t("No active technicians.", "لا فنيين نشطين.")} />
            : <WeekBoard rowHead={t("Technician", "الفني")} totalHead={t("Week", "الأسبوع")} legend={<span className="flex flex-wrap gap-3"><Legend ar={ar} /></span>} empty={t("No active technicians.", "لا فنيين نشطين.")}
                rows={techs.map((x) => { const wk = weekBookings.filter((b) => s(b["technician"]) === x.name); const h = wk.reduce((a, b) => a + hrs(b), 0); return { key: x.name, head: <span className="inline-flex items-center gap-2"><Avatar name={s(x["technician_name"])} size={28} /><span data-no-i18n>{s(x["technician_name"])}</span></span>, sub: <span data-no-i18n>{numTxt(h, 1)} {t("h booked", "س محجوزة")} · {Math.round((h / ((Number(x["daily_hours"]) || 8) * 5)) * 100)}%</span> }; })}
                days={days.map((d, i) => ({ key: d, label: new Date(`${d}T00:00:00`).toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { weekday: "short" }), sub: d.slice(8, 10), today: d === today(), off: i >= 5 }))}
                cell={(row, d) => { const bs = weekBookings.filter((b) => s(b["technician"]) === row && s(b["booking_start"]).slice(0, 10) === d).sort((a, b) => s(a["booking_start"]).localeCompare(s(b["booking_start"]))); return bs.length ? <div className="flex flex-col gap-1">{bs.map((b) => { const v = raw(VISIT_DT, b["visit"]); return <button key={b.name} type="button" className="text-start" onClick={(e) => v && openQuickView({ kind: "doc", doctype: VISIT_DT, name: v.name }, e.currentTarget)} data-booking={b.name}><BoardCard hue={visitHue(v)} title={<span data-no-i18n>{titleOf("FSM Service Site", b["site"])}</span>} value={<span data-no-i18n>{s(b["booking_start"]).slice(11, 16)}</span>} /></button>; })}</div> : null; }}
                foot={[{ key: "hours", label: t("Booked hours", "الساعات المحجوزة"), tone: "strong", cell: (d) => <span data-no-i18n>{numTxt(weekBookings.filter((b) => s(b["booking_start"]).slice(0, 10) === d).reduce((a, b) => a + hrs(b), 0), 1)}</span>, total: <span data-no-i18n>{numTxt(weekBookings.reduce((a, b) => a + hrs(b), 0), 1)}</span> },
                  { key: "visits", label: t("Bookings", "الحجوزات"), cell: (d) => <span data-no-i18n>{weekBookings.filter((b) => s(b["booking_start"]).slice(0, 10) === d).length}</span>, total: <span data-no-i18n>{weekBookings.length}</span> }]} />}
          </Panel>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
          {visit && <Panel title={`${t("Book", "حجز")} · ${titleOf("FSM Service Site", visit["site"])}`} subtitle={skill ? `${t("Skill needed", "المهارة المطلوبة")}: ${opt(skill, ar)}` : t("No specific skill required", "لا تتطلب مهارة محددة")} attrs={{ "data-book-form": visit.name }}>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="col-span-2 flex flex-col gap-1">{t("Technician", "الفني")}<select className={INPUT} value={tech} onChange={(e) => setTech(e.target.value)} data-field="technician"><option value="">{t("Choose…", "اختر…")}</option>
                {techs.map((x) => { const el = eligibility(x, skill, start); return <option key={x.name} value={x.name} data-no-i18n>{s(x["technician_name"])}{el.ok ? "" : ` — ${ar ? el.reason_ar : el.reason}`}</option>; })}</select></label>
              <label className="flex flex-col gap-1">{t("Start", "البداية")}<input type="time" className={INPUT} value={time} onChange={(e) => setTime(e.target.value)} data-field="time" /></label>
              <label className="flex flex-col gap-1">{t("Hours", "الساعات")}<input type="number" min={0.5} step={0.5} className={INPUT} value={hours} onChange={(e) => setHours(e.target.value)} data-field="hours" /></label>
              <label className="col-span-2 flex flex-col gap-1">{t("Role", "الدور")}<select className={INPUT} value={role} onChange={(e) => setRole(e.target.value as "Lead" | "Assistant")}><option value="Lead">{opt("Lead", ar)}</option><option value="Assistant">{opt("Assistant", ar)}</option></select></label>
            </div>
            {preview && <ul className="mt-3 space-y-1 text-xs" data-preview>
              <li className={preview.el.ok ? "text-dx-good" : "text-dx-bad"}>{preview.el.ok ? t("Eligible for this visit", "مؤهل لهذه الزيارة") : (ar ? preview.el.reason_ar : preview.el.reason)}</li>
              <li className={preview.c.bookings.length ? "text-dx-bad" : "text-dx-good"}>{preview.c.bookings.length ? `${t("Overlaps", "يتداخل مع")} ${preview.c.bookings.map((b) => nm("FSM Service Site", b["site"], ar)).join(ar ? "، " : ", ")}` : t("No overlapping booking", "لا حجز متداخل")}</li>
              <li className={preview.c.unavailable.length ? "text-dx-bad" : "text-dx-good"}>{preview.c.unavailable.length ? t("Technician unavailable (approved exception)", "الفني غير متاح (استثناء معتمد)") : t("Available", "متاح")}</li>
            </ul>}
            <div className="mt-3 flex flex-wrap gap-2"><ActionButton primary label={t("Reserve", "حجز")} disabled={!tech} reason={t("Choose a technician", "اختر فنياً")} run={() => svc.bookVisit(visit.name, tech, start, end, role)} onDone={(r) => { if (r.ok) setTech(""); }} />
              {s(visit["workflow_state"]) === "Planned" && <ActionButton label={t("Dispatch visit", "إرسال الزيارة")} run={() => svc.transition(VISIT_DT, visit.name, "Dispatch")} />}
              <button type="button" className={BTN.secondary} onClick={(e) => openQuickView({ kind: "doc", doctype: VISIT_DT, name: visit.name }, e.currentTarget)}>{t("Quick view", "عرض سريع")}</button>
              <button type="button" className={BTN.secondary} onClick={() => set({ visit: undefined })}>{t("Close", "إغلاق")}</button></div>
          </Panel>}
          {pickedB && <Panel title={`${t("Booking", "الحجز")} · ${titleOf("FSM Service Site", pickedB["site"])}`} attrs={{ "data-booking-panel": pickedB.name }} actions={<><button type="button" className={BTN.secondary} onClick={(e) => pickedV && openQuickView({ kind: "doc", doctype: VISIT_DT, name: pickedV.name }, e.currentTarget)}>{t("Quick view", "عرض سريع")}</button><ActionButton compact label={t("Cancel booking", "إلغاء الحجز")} run={() => svc.cancelBooking(pickedB.name)} onDone={(r) => { if (r.ok) setPicked(""); }} />{pickedV && <WorkflowButtons doctype={VISIT_DT} doc={pickedV} except={["Cancel Visit", "Arrive", "Finish Visit"]} />}</>}>
            {(() => { const blk = model.blocks.find((x) => x.key === pickedB.name); return <>{blk?.alert && <p className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive" data-picked-alert>{blk.alert}</p>}
              <KeyFacts items={[[t("Visit", "الزيارة"), <DocRef doctype={VISIT_DT} name={pickedB["visit"]} title />], [t("Technician", "الفني"), <PersonRef doctype="FSM Technician" name={pickedB["technician"]} />],
                [t("Time", "الوقت"), <span data-no-i18n>{dtTxt(pickedB["booking_start"])} → {s(pickedB["booking_end"]).slice(11, 16)}</span>], [t("Visit status", "حالة الزيارة"), <StateChip value={pickedV?.["workflow_state"]} />],
                [t("Arrived", "الوصول"), <span data-no-i18n>{pickedV?.["arrived_on"] ? dtTxt(pickedV["arrived_on"]) : "—"}</span>], [t("Response window", "نافذة الالتزام"), <SlaCell doctype={VISIT_DT} doc={pickedV} />]]} /></>; })()}
          </Panel>}
          {!visit && !pickedB && <Panel title={t("Book a visit", "حجز زيارة")} flush={false}><p className="text-sm text-muted-foreground">{t("Drag a waiting visit onto a technician row, or pick it to choose technician and time. Click a booking on the board to see it, cancel it or move its visit on.", "اسحب زيارة منتظرة إلى صف فني، أو اخترها لتحديد الفني والموعد. اضغط حجزًا على اللوحة لعرضه أو إلغائه أو نقل زيارته للخطوة التالية.")}</p></Panel>}
          </div>
          <div className="min-w-0">
          {!week && <Panel title={t("Today's routes", "مسارات اليوم")} subtitle={t("Numbered in visit order per technician; colour = visit state. Click a pin for the visit.", "مرقمة بترتيب الزيارات لكل فني؛ اللون = حالة الزيارة. اضغط الدبوس لعرض الزيارة.")} flush={false} attrs={{ "data-routes": String(pins.length) }}
            actions={cities.length > 1 ? <span className="inline-flex gap-1" role="group" aria-label={t("City", "المدينة")}>{cities.map((c) => <button key={c} type="button" aria-pressed={c === mapCity} onClick={() => setCity(c)} className={c === mapCity ? BTN.primary : BTN.secondary} data-map-city={c}>{opt(c, ar)}</button>)}</span> : undefined}>
            <RouteMap pins={pins} ar={ar} routes={routeTechs.map((tk, i) => ({ key: tk, hue: ROUTE_HUES[i % ROUTE_HUES.length]!, label: <span data-no-i18n>{titleOf("FSM Technician", tk)}</span> }))} empty={t("No bookings with a located site on this day.", "لا حجوزات بمواقع محددة في هذا اليوم.")} />
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">{([["planned", t("Planned", "مخطط")], ["dispatched", t("Dispatched", "مرسل")], ["onsite", t("On site", "في الموقع")], ["done", t("Completed", "مكتمل")], ["alert", t("Conflict", "تعارض")]] as const).map(([k, l]) => <span key={k} className="inline-flex items-center gap-1.5"><i className="ek-map-dot" data-tone={k} />{l}</span>)}</div>
          </Panel>}
          </div>
        </div>
      </div>
      ) }]} />
    </div>
  );
}

export function EmergencyPage() {
  const fx = useFx(); const { t, ar } = fx;
  const [issue, setIssue] = useState(""); const [tech, setTech] = useState("");
  const open = list("Issue").filter((i) => !["Closed", "Resolved"].includes(s(i["status"])) && i["digit_fsm_site"]).sort((a, b) => (s(a["priority"]) === "High" || s(a["priority"]) === "Urgent" ? -1 : 1) - (s(b["priority"]) === "High" || s(b["priority"]) === "Urgent" ? -1 : 1));
  const sel = issue ? raw("Issue", issue) : undefined;
  const site = sel ? raw("FSM Service Site", sel["digit_fsm_site"]) : undefined;
  const sysType = sel ? s(raw("FSM Service System", sel["digit_fsm_system"])?.["system_type"]) || s(list("FSM Service System").find((x) => s(x["site"]) === s(sel["digit_fsm_site"]))?.["system_type"]) : "";
  const now = new Date().toISOString().slice(0, 16).replace("T", " "); const later = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 16).replace("T", " ");
  const techs = list("FSM Technician").filter((x) => s(x["status"]) !== "Inactive").map((x): Record<string, unknown> & { name: string } => { const el = eligibility(x, sysType, now); const c = svc.bookingConflicts(x.name, now, later); return { ...(x as Record<string, unknown>), name: x.name, ok: el.ok && !c.bookings.length && !c.unavailable.length, why: !el.ok ? (ar ? el.reason_ar : el.reason) : c.bookings.length ? t("Busy in the next 3 hours", "مشغول خلال 3 ساعات") : c.unavailable.length ? t("Unavailable", "غير متاح") : t("Eligible and free", "مؤهل ومتاح") }; });
  const active = list("FSM Job").filter((j) => s(j["job_type"]) === "Emergency" && !["Closed", "Cancelled"].includes(s(j["workflow_state"])));
  return (
    <div className="w-full min-w-0" data-page="fsm-emergency">
      <PageHeader title={t("Emergency triage", "فرز الطوارئ")} band={{
        question: t("Which urgent request do we answer now, and who can go immediately?", "أي طلب عاجل نستجيب له الآن، ومن يستطيع الذهاب فوراً؟"),
        basis: t("Open service requests with a site. Dispatching creates (or reuses) the emergency job and visit, books an eligible free technician for the next 3 hours and dispatches the visit — each step is idempotent.", "طلبات الخدمة المفتوحة ذات الموقع. الإرسال ينشئ (أو يعيد استخدام) أمر العمل الطارئ والزيارة، ويحجز فنياً مؤهلاً متاحاً للساعات الثلاث القادمة ويرسل الزيارة — كل خطوة لا تتكرر."),
        actions: <AppLink to="queue/requests" className={BAND.secondary}>{t("All service requests", "كل طلبات الخدمة")}</AppLink>,
      }} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
        <Panel title={t("1. Choose the request", "1. اختر الطلب")}>
          <DataTable id="emg-issues" rows={open} searchable={false} empty={t("No open requests with a service site.", "لا طلبات مفتوحة بموقع خدمة.")} cols={[
            { key: "pick", label: "", render: (r) => <input type="radio" name="emg-issue" checked={issue === r.name} onChange={() => setIssue(String(r.name))} aria-label={`${t("Choose", "اختر")} ${String(r.name)}`} /> },
            { key: "name", label: t("Request", "الطلب"), render: (r) => <DocRef doctype="Issue" name={r.name} form /> }, { key: "subject", label: t("Subject", "الموضوع") },
            { key: "priority", label: t("Priority", "الأولوية"), render: (r) => <span>{opt(r["priority"], ar)}</span> }, { key: "sla", label: t("SLA", "مستوى الخدمة"), render: (r) => <SlaCell doctype="Issue" doc={r} /> }, { key: "digit_fsm_site", label: t("Site", "الموقع"), render: (r) => <DocRef doctype="FSM Service Site" name={r["digit_fsm_site"]} title /> },
            { key: "digit_fsm_job", label: t("Job", "أمر العمل"), render: (r) => <DocRef doctype="FSM Job" name={r["digit_fsm_job"]} /> }]} />
        </Panel>
        <Panel title={t("2. Choose the technician", "2. اختر الفني")} subtitle={sel ? <span data-no-i18n>{titleOf("FSM Service Site", sel["digit_fsm_site"])}{site?.["access_instructions"] ? ` · ${s(site["access_instructions"])}` : ""}{sysType ? ` · ${opt(sysType, ar)}` : ""}</span> : t("Choose a request first.", "اختر طلباً أولاً.")}>
          {sel ? <>
            <DataTable id="emg-techs" rows={techs} searchable={false} empty={t("No active technicians.", "لا فنيين نشطين.")} cols={[
              { key: "pick", label: "", render: (r) => <input type="radio" name="emg-tech" checked={tech === r.name} disabled={!r["ok"]} onChange={() => setTech(String(r.name))} aria-label={`${t("Choose", "اختر")} ${s(r["technician_name"])}`} /> },
              { key: "technician_name", label: t("Technician", "الفني") }, { key: "why", label: t("Status", "الحالة"), render: (r) => <span className={r["ok"] ? "text-dx-good" : "text-muted-foreground"}>{String(r["why"])}</span> }]} />
            <div className="mt-3"><ActionButton primary label={t("Dispatch now", "إرسال الآن")} disabled={!tech} reason={t("Choose an eligible free technician", "اختر فنياً مؤهلاً متاحاً")} run={() => svc.emergencyDispatch(issue, tech)} onDone={(r) => { if (r.ok) { setTech(""); } }} /></div>
          </> : <p className="text-sm text-muted-foreground">{t("Eligibility is checked for the site's system type and the next 3 hours.", "تُفحص الأهلية لنوع نظام الموقع وللساعات الثلاث القادمة.")}</p>}
        </Panel>
      </div>
      <Panel title={t("Active emergency jobs", "أوامر العمل الطارئة النشطة")}>
        <DataTable id="emg-active" rows={active} searchable={false} empty={t("No active emergency jobs.", "لا أوامر عمل طارئة نشطة.")} cols={[{ key: "name", label: t("Job", "أمر العمل"), render: (r) => <DocRef doctype="FSM Job" name={r.name} /> }, { key: "job_title", label: t("Title", "العنوان") }, { key: "site", label: t("Site", "الموقع"), render: (r) => <DocRef doctype="FSM Service Site" name={r["site"]} title /> }, { key: "workflow_state", label: t("Status", "الحالة"), render: (r) => <StateChip value={r["workflow_state"]} /> }, { key: "sla", label: t("SLA", "مستوى الخدمة"), render: (r) => <SlaCell doctype="FSM Job" doc={r} /> }]} />
      </Panel>
    </div>
  );
}
