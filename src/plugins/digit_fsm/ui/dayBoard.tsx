import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * FSM day board model (owner FSM round F2-01 / F2-03): one day of technician bookings as Enterprise DayBoard rows and
 * blocks — hue by job type, border by visit state, conflicts (double booking, skill / certificate mismatch, approved
 * unavailability) in red with the reason, travel gaps between consecutive sites, actual time on site under the plan with
 * check-in / check-out and the late / early mark. Pure reads; the dispatch board, Operations control and Team pages share it.
 */
import type { Doc } from "@/lib/adapter";
import type { BoardHue, DayBlock, DayGap, DayRow } from "@/components/enterprise/kit";
import { DayBoard } from "@/components/enterprise/kit/DispatchKit";
import { Avatar, Pill } from "@/components/enterprise/kit/RecordFrame";
import { list, raw, titleOf } from "../domain/data";
import { addDays, eligibility, s, today } from "../domain/rules";
import * as svc from "../domain/services";
import { fsmNameAr } from "../demo/names";
import { DocRef, opt, useFx } from "./kit";
/** a site / technician name inside a sentence (alerts, tooltips): the Arabic display of a sample name, the stored name otherwise */
export const nm = (dt: string, v: unknown, ar: boolean) => { const x = titleOf(dt, v); return ar ? fsmNameAr(x) ?? x : x; };

export const H0 = 7, H1 = 19; // board window (local wall-clock hours)
export const hourOf = (dt: string) => { const m = /(\d{2}):(\d{2})/.exec(dt.slice(11)); return m ? Number(m[1]) + Number(m[2]) / 60 : H0; };
export const pad = (n: number) => String(n).padStart(2, "0");
export const hhmm = (h: number) => `${pad(Math.floor(h))}:${pad(Math.round((h % 1) * 60) % 60)}`;
export const addHours = (date: string, time: string, h: number) => { const [hh, mm] = time.split(":").map(Number) as [number, number]; const total = hh * 60 + mm + Math.round(h * 60); const dayOff = Math.floor(total / 1440); const m = total % 1440; return `${addDays(date, dayOff)} ${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
/** job type → board hue (inspection blue, corrective teal, repair amber, retest violet, emergency rose) */
export const TYPE_HUE: Record<string, BoardHue> = { "PM Inspection": "blue", Corrective: "teal", Repair: "amber", Retest: "violet", Emergency: "rose" };
export const STATUS: Record<string, DayBlock["status"]> = { Planned: "planned", Dispatched: "dispatched", "On Site": "onsite", Completed: "done", Cancelled: "cancelled" };
export const ROUTE_HUES = ["var(--blue)", "var(--violet)", "var(--teal)", "var(--coral)", "var(--gold)", "var(--lime)", "var(--amber)", "var(--rose)"];
export const km = (a: Doc | undefined, b: Doc | undefined) => { const la = Number(a?.["latitude"]), lb = Number(b?.["latitude"]), oa = Number(a?.["longitude"]), ob = Number(b?.["longitude"]); if (![la, lb, oa, ob].every(Number.isFinite)) return null; const r = Math.PI / 180, dLa = (lb - la) * r, dLo = (ob - oa) * r; const h = Math.sin(dLa / 2) ** 2 + Math.cos(la * r) * Math.cos(lb * r) * Math.sin(dLo / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
export const nowHour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
export const visitHue = (v: Doc | undefined) => TYPE_HUE[s(raw("FSM Job", v?.["job"])?.["job_type"])] ?? (s(v?.["visit_purpose"]) === "Emergency" ? "rose" : "grey");

export interface DayModel { bookings: Doc[]; blocks: DayBlock[]; gaps: DayGap[]; rows: DayRow[]; conflicts: number; booked: number; capacity: number }
/** One day of the board: bookings → blocks (hue by job type, border by visit state), conflicts (double booking / not eligible) in red with the
 *  reason, travel gaps between consecutive sites (distance at 40 km/h), actual time on site under the plan with the late / early mark. */
export function dayModel(day: string, techs: Doc[], ar: boolean, onOpen: (b: Doc, el: HTMLElement) => void): DayModel {
  const bookings = list("FSM Booking").filter((b) => s(b["status"]) !== "Cancelled" && s(b["booking_start"]).slice(0, 10) <= day && s(b["booking_end"]).slice(0, 10) >= day);
  const unav = list("FSM Calendar Exception").filter((c) => s(c["status"]) === "Approved" && s(c["from_time"]).slice(0, 10) <= day && s(c["to_time"]).slice(0, 10) >= day);
  const blocks: DayBlock[] = []; const gaps: DayGap[] = []; const rows: DayRow[] = []; let conflicts = 0, booked = 0, capacity = 0;
  const hOf = (dt: string, edge: "a" | "b") => (edge === "a" ? (dt.slice(0, 10) < day ? H0 : hourOf(dt)) : dt.slice(0, 10) > day ? H1 : hourOf(dt));
  for (const tech of techs) {
    const mine = bookings.filter((b) => s(b["technician"]) === tech.name).sort((a, b) => s(a["booking_start"]).localeCompare(s(b["booking_start"])));
    const off = unav.filter((u) => s(u["technician"]) === tech.name);
    const fullOff = off.some((u) => ["Leave", "Unavailable"].includes(s(u["exception_type"])) && hOf(s(u["from_time"]), "a") <= H0 + 1 && hOf(s(u["to_time"]), "b") >= H1 - 1);
    let hours = 0;
    const onCall = off.filter((u) => s(u["exception_type"]) === "On-call");
    for (const u of off.filter((x) => s(x["exception_type"]) !== "On-call")) blocks.push({ key: u.name, row: tech.name, start: hOf(s(u["from_time"]), "a"), end: hOf(s(u["to_time"]), "b"), hue: "grey", status: "cancelled", title: opt(u["exception_type"], ar), sub: s(u["reason"]) ? <span data-no-i18n>{s(u["reason"])}</span> : undefined, attrs: { "data-unavailable": u.name } });
    mine.forEach((b, i) => {
      const v = raw(VISIT_DT, b["visit"]); const a = hOf(s(b["booking_start"]), "a"), e = hOf(s(b["booking_end"]), "b"); hours += Math.max(0, e - a);
      const el = eligibility(tech, svc.requiredSkill(v), s(b["booking_start"]));
      const clash = mine.find((o) => o.name !== b.name && s(o["booking_start"]) < s(b["booking_end"]) && s(b["booking_start"]) < s(o["booking_end"]));
      const busy = off.find((u) => ["Unavailable", "Leave", "Training"].includes(s(u["exception_type"])) && s(u["from_time"]) < s(b["booking_end"]) && s(b["booking_start"]) < s(u["to_time"]));
      const alert = clash ? `${ar ? "حجز مزدوج مع" : "Double booking with"} ${nm("FSM Service Site", clash["site"], ar)}` : !el.ok ? (ar ? el.reason_ar : el.reason) : busy ? (ar ? "الفني غير متاح" : "Technician unavailable") : undefined;
      if (alert) conflicts++;
      const arrived = s(v?.["arrived_on"]); const doneAt = s(v?.["completed_on"]); const lead = s(b["booking_role"]) !== "Assistant";
      const lateMin = arrived ? Math.round((hourOf(arrived) - hourOf(s(v?.["scheduled_start"]) || s(b["booking_start"]))) * 60) : 0;
      blocks.push({ key: b.name, row: tech.name, start: a, end: e, hue: visitHue(v), status: STATUS[s(v?.["workflow_state"])], alert,
        title: <span data-no-i18n>{titleOf("FSM Service Site", b["site"])}</span>,
        sub: <span><bdi dir="ltr" data-no-i18n>{hhmm(a)}–{hhmm(e)}</bdi> · {opt(raw("FSM Job", v?.["job"])?.["job_type"] ?? v?.["visit_purpose"], ar)}{lead ? "" : ` · ${ar ? "مساعد" : "assist"}`}</span>,
        actual: lead && arrived && arrived.slice(0, 10) === day ? { start: hourOf(arrived), end: doneAt && doneAt.slice(0, 10) === day ? hourOf(doneAt) : Math.max(hourOf(arrived) + 0.25, Math.min(day === today() ? nowHour() : e, e)), title: `${ar ? "وصل" : "Checked in"} ${arrived.slice(11, 16)}${doneAt && doneAt.slice(0, 10) === day ? ` · ${ar ? "غادر" : "checked out"} ${doneAt.slice(11, 16)}` : ` · ${ar ? "ما زال في الموقع" : "still on site"}`}`, late: lateMin > 5, mark: Math.abs(lateMin) > 5 ? (lateMin > 0 ? (ar ? `تأخر ${lateMin} د` : `${lateMin} m late`) : (ar ? `مبكر ${-lateMin} د` : `${-lateMin} m early`)) : undefined } : undefined,
        onOpen: (node) => onOpen(b, node), attrs: { "data-booking": b.name, ...(alert ? { "data-conflict": clash ? "double" : "eligibility" } : {}) } });
      const next = mine[i + 1];
      if (next && s(next["site"]) !== s(b["site"])) { const d = km(raw("FSM Service Site", b["site"]), raw("FSM Service Site", next["site"])); const travel = d === null ? 0.5 : Math.max(0.25, d / 40); const ns = hOf(s(next["booking_start"]), "a"); const gEnd = Math.min(ns, e + travel);
        if (gEnd - e >= 0.2) gaps.push({ key: `${b.name}>${next.name}`, row: tech.name, start: e, end: gEnd, label: `${ar ? "تنقل" : "travel"} ${d === null ? "" : `${Math.round(d)} ${ar ? "كم" : "km"} · `}${Math.round(travel * 60)} ${ar ? "د" : "m"}` }); }
    });
    const avail = fullOff ? null : Number(tech["daily_hours"]) || 8; booked += hours; capacity += avail ?? 0;
    rows.push({ key: tech.name, group: s(tech["crew"]) || undefined, booked: hours, available: avail,
      head: <><Avatar name={s(tech["technician_name"]) || tech.name} size={28} /><DocRef doctype="FSM Technician" name={tech.name} title className="min-w-0 truncate font-bold text-foreground hover:underline" /></>,
      sub: <span data-no-i18n>{(tech["skills"] as Doc[] | undefined ?? []).map((k) => opt(k["skill"], ar)).join(" · ") || "—"}</span>,
      tag: <>{tech["van_warehouse"] ? <Pill hue="teal"><span data-no-i18n>{titleOf("Warehouse", tech["van_warehouse"])}</span></Pill> : null}{tech["territory"] ? <Pill>{opt(tech["territory"], ar)}</Pill> : null}{fullOff ? <Pill tone="warn">{ar ? "غير متاح اليوم" : "Off today"}</Pill> : null}{onCall.map((u) => <Pill key={u.name} hue="violet" attrs={{ "data-on-call": u.name }}>{ar ? "مناوب من" : "On call from"} <bdi data-no-i18n>{s(u["from_time"]).slice(0, 10) < day ? "00:00" : s(u["from_time"]).slice(11, 16)}</bdi></Pill>)}</> });
  }
  return { bookings, blocks, gaps, rows, conflicts, booked, capacity };
}

export function Legend({ ar }: { ar: boolean }) {
  const types: [string, BoardHue][] = [["PM Inspection", "blue"], ["Corrective", "teal"], ["Repair", "amber"], ["Retest", "violet"], ["Emergency", "rose"]];
  return <>{types.map(([k, h]) => <span key={k} className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: `var(--${h})` }} />{opt(k, ar)}</span>)}
    <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-5 rounded-sm" style={{ background: "repeating-linear-gradient(135deg, color-mix(in oklab, var(--grey) 35%, transparent) 0 3px, transparent 3px 6px)" }} />{ar ? "تنقل" : "Travel"}</span>
    <span className="inline-flex items-center gap-1.5"><i className="inline-block h-1.5 w-5 rounded-sm bg-primary" />{ar ? "الوقت الفعلي" : "Actual on site"}</span>
    <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm" style={{ outline: "2px solid var(--negative)" }} />{ar ? "تعارض" : "Conflict"}</span></>;
}


/** Read-only team day timeline (scheduled vs actual, check-in / check-out, late / early) — Operations control and Team pages. */
export function TeamDayTimeline({ day = today(), techFilter, onOpen }: { day?: string; techFilter?: (t: Doc) => boolean; onOpen?: (b: Doc, el: HTMLElement) => void }) {
  const { t, ar } = useFx();
  const techs = list("FSM Technician").filter((x) => s(x["status"]) !== "Inactive" && (!techFilter || techFilter(x))).sort((a, b) => s(a["crew"]).localeCompare(s(b["crew"])) || s(a["technician_name"]).localeCompare(s(b["technician_name"])));
  const m = dayModel(day, techs, ar, onOpen ?? (() => {}));
  return <DayBoard rows={m.rows} blocks={m.blocks} gaps={m.gaps} from={H0} to={H1} ar={ar} now={day === today() ? nowHour() : undefined} rowHead={t("Technician", "الفني")}
    groups={Object.fromEntries(m.rows.filter((r) => r.group).map((r) => [r.group!, <span key={r.group}><span data-no-i18n>{r.group}</span> · <span data-no-i18n>{m.rows.filter((x) => x.group === r.group).length}</span> {t("technicians", "فنيين")}</span>]))}
    legend={<Legend ar={ar} />} empty={t("No active technicians.", "لا فنيين نشطين.")} attrs={{ "data-team-timeline": day }} />;
}
