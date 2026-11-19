/**
 * Owner notes C-07 activities read model (/digit-crm/activities): tasks, calls and notes (wf02.activities, same
 * visibility) plus meetings (Event with a CRM participant) and e-mail / WhatsApp messages (Communication on a lead or
 * deal), each with its kind, linked record, owner, status and time bucket (overdue / today / upcoming / done / logged).
 * Read-only; the list, its strip, KPIs and calendar read these rows. Rescheduling goes through salesDesk.bulkReschedule.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { activities } from "./wf02";
import { bucketOf, isManager, parseDue, scopedLeads } from "./wf01";
import { scopedDeals } from "./wf02";

const s = (v: unknown) => String(v ?? "");
export type ActKind = "task" | "meeting" | "call" | "note" | "email" | "whatsapp";
export const ACT_KINDS: ActKind[] = ["task", "meeting", "call", "note", "email", "whatsapp"];
export const ACT_LABEL: Record<ActKind, [string, string]> = { task: ["Task", "مهمة"], meeting: ["Meeting", "اجتماع"], call: ["Call", "مكالمة"], note: ["Note", "ملاحظة"], email: ["Email", "بريد"], whatsapp: ["WhatsApp", "واتساب"] };
export const ACT_ICON: Record<ActKind, string> = { task: "☑", meeting: "▦", call: "☎", note: "✎", email: "✉", whatsapp: "◉" };
export const ACT_HUE: Record<ActKind, "blue" | "violet" | "teal" | "amber" | "coral" | "emerald"> = { task: "blue", meeting: "violet", call: "teal", note: "amber", email: "coral", whatsapp: "emerald" };
export const ACT_DT: Record<ActKind, string> = { task: "CRM Task", meeting: "Event", call: "CRM Call Log", note: "FCRM Note", email: "Communication", whatsapp: "Communication" };
export type ActBucket = "overdue" | "today" | "upcoming" | "undated" | "done" | "logged";
export const ACT_BUCKETS: ActBucket[] = ["overdue", "today", "upcoming", "undated", "done", "logged"];
export const BUCKET_LABEL: Record<ActBucket, [string, string]> = { overdue: ["Overdue", "متأخر"], today: ["Today", "اليوم"], upcoming: ["Upcoming", "قادم"], undated: ["No date", "بلا تاريخ"], done: ["Done", "منجز"], logged: ["Logged", "مسجّل"] };
export const BUCKET_TONE: Record<ActBucket, "bad" | "warn" | "info" | "neutral" | "ok"> = { overdue: "bad", today: "warn", upcoming: "info", undated: "neutral", done: "ok", logged: "neutral" };
export interface ActRow { key: string; kind: ActKind; doctype: string; name: string; title: string; when: string; day: string; refDt: string; refName: string; owner: string; status: string; bucket: ActBucket; doc: Doc | undefined }

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function timeBucket(when: string, now: Date): ActBucket { const d = parseDue(when); if (!d) return "undated"; if (d < now) return "overdue"; return localDay(d) === localDay(now) ? "today" : "upcoming"; }

export function activityRows(user: string, now = new Date()): ActRow[] {
  const out: ActRow[] = [];
  for (const a of activities(user)) {
    const doc = adapter.get(a.kind === "Task" ? "CRM Task" : a.kind === "Note" ? "FCRM Note" : "CRM Call Log", a.name);
    const kind: ActKind = a.kind === "Task" ? "task" : a.kind === "Note" ? "note" : "call";
    const bucket: ActBucket = kind === "task" ? (() => { const b = bucketOf(doc ?? ({ name: a.name, doctype: "CRM Task", status: a.status, due_date: a.when } as Doc), now); return b === "closed" ? "done" : b; })() : "logged";
    out.push({ key: `${kind}:${a.name}`, kind, doctype: ACT_DT[kind], name: a.name, title: a.title, when: a.when, day: (parseDue(a.when) ? localDay(parseDue(a.when)!) : ""), refDt: a.refDt, refName: a.refName, owner: s(a.owner || doc?.["owner"]), status: s(a.status), bucket, doc });
  }
  const leads = new Set(scopedLeads(user).map((l) => l.name)), deals = new Set(scopedDeals(user).map((d) => d.name));
  const crmRef = (dt: unknown, n: unknown) => (dt === "CRM Lead" && leads.has(s(n))) || (dt === "CRM Deal" && deals.has(s(n)));
  for (const e of scopedList("Event", user)) {
    const parts = Array.isArray(e["event_participants"]) ? e["event_participants"] as Doc[] : [];
    const ref = parts.find((p) => crmRef(p["reference_doctype"], p["reference_docname"])) ?? (crmRef(e["reference_doctype"], e["reference_docname"]) ? e : undefined);
    if (!ref && !(isManager(user) && parts.some((p) => p["reference_doctype"] === "CRM Lead" || p["reference_doctype"] === "CRM Deal"))) continue;
    const when = s(e["starts_on"]); const d = parseDue(when);
    const bucket: ActBucket = s(e["status"]) === "Closed" || s(e["status"]) === "Cancelled" ? "done" : d && d < now ? "logged" : timeBucket(when, now);
    out.push({ key: `meeting:${e.name}`, kind: "meeting", doctype: "Event", name: e.name, title: s(e["subject"] || e.name), when, day: d ? localDay(d) : "", refDt: s(ref?.["reference_doctype"]), refName: s(ref?.["reference_docname"]), owner: s(e["owner"]), status: s(e["status"]), bucket, doc: e });
  }
  for (const c of scopedList("Communication", user)) {
    if (!crmRef(c["reference_doctype"], c["reference_docname"])) continue;
    const kind: ActKind = s(c["communication_medium"]) === "Chat" || /whatsapp/i.test(s(c["custom_channel"])) ? "whatsapp" : "email";
    const when = s(c["communication_date"] || c["creation"]); const d = parseDue(when);
    out.push({ key: `${kind}:${c.name}`, kind, doctype: "Communication", name: c.name, title: s(c["subject"] || c.name), when, day: d ? localDay(d) : "", refDt: s(c["reference_doctype"]), refName: s(c["reference_docname"]), owner: s(c["sender_full_name"] ? c["owner"] : c["owner"]), status: s(c["delivery_status"] || c["sent_or_received"]), bucket: "logged", doc: c });
  }
  const at = (r: ActRow) => parseDue(r.when)?.getTime() ?? 0;
  return out.sort((a, b) => at(b) - at(a));
}
/** Status strip by time bucket; counts add up to the rows. */
export function activityStrip(rows: ActRow[]) {
  return ACT_BUCKETS.map((k) => ({ key: k, label: BUCKET_LABEL[k], tone: BUCKET_TONE[k], count: rows.filter((r) => r.bucket === k).length })).filter((t) => t.count > 0 || t.key === "overdue" || t.key === "today");
}
