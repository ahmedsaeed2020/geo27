/**
 * NB-3 training completion (02.4). Facts come only from native records: Training Event participants (attendance and
 * row status), submitted Training Results (hours/grade per employee) and submitted Training Feedback. "Result
 * recorded" is derived from submitted results; the participant-status update Frappe performs on result submit is
 * server logic and is not simulated. The draft action mirrors training_result.js (rows fetched from the event's
 * participants) and its validate rule (the event must be submitted).
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { assertScoped, scopedGet, scopedList } from "@/plugins/digit_hr/compat/scope";
import { insertHrDraft, listWithDrafts } from "@/plugins/digit_hr/compat/drafts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapter rows are untyped JSON documents
type Row = Record<string, any>;
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const live = (r: Row) => Number(r["docstatus"] ?? 0) !== 2;

export interface Participant {
  employee: string; name: string; attendance: string; rowStatus: string; mandatory: boolean;
  result: { doc: string; hours: number | null; grade: string } | null; feedback: string | null;
}
export interface EventCompletion {
  event: string; title: string; status: string; submitted: boolean; start: string;
  participants: Participant[]; invited: number; present: number; absent: number; withResult: number; withFeedback: number;
  draftResult: string | null; submittedResults: string[];
}

/** Per-event participant facts. Results/feedback count only when submitted (docstatus 1). */
export function eventCompletion(event: Row, results: Row[], feedback: Row[]): EventCompletion {
  const name = s(event["name"]);
  const forEvent = (r: Row) => s(r["training_event"]) === name;
  const sub = results.filter((r) => forEvent(r) && Number(r["docstatus"]) === 1);
  const draft = results.find((r) => forEvent(r) && Number(r["docstatus"] ?? 0) === 0);
  const fb = feedback.filter((r) => forEvent(r) && Number(r["docstatus"]) === 1);
  const rows: Row[] = Array.isArray(event["employees"]) ? event["employees"] : [];
  const participants: Participant[] = rows.filter((r) => s(r["employee"])).map((r) => {
    const emp = s(r["employee"]);
    let result: Participant["result"] = null;
    for (const doc of sub) {
      const line = (Array.isArray(doc["employees"]) ? doc["employees"] : []).find((x: Row) => s(x["employee"]) === emp);
      if (line) { const h = Number(line["hours"]); result = { doc: s(doc["name"]), hours: line["hours"] === undefined || line["hours"] === "" || Number.isNaN(h) ? null : h, grade: s(line["grade"]) }; }
    }
    const f = fb.find((x) => s(x["employee"]) === emp);
    return { employee: emp, name: s(r["employee_name"]) || emp, attendance: s(r["attendance"]), rowStatus: s(r["status"]), mandatory: !!Number(r["is_mandatory"] ?? 0), result, feedback: f ? s(f["name"]) : null };
  });
  return {
    event: name, title: s(event["event_name"]) || name, status: s(event["event_status"]), submitted: Number(event["docstatus"]) === 1, start: s(event["start_time"]).slice(0, 10),
    participants, invited: participants.length,
    present: participants.filter((p) => p.attendance === "Present").length, absent: participants.filter((p) => p.attendance === "Absent").length,
    withResult: participants.filter((p) => p.result).length, withFeedback: participants.filter((p) => p.feedback).length,
    draftResult: draft ? s(draft["name"]) : null, submittedResults: sub.map((r) => s(r["name"])),
  };
}

/** Why a results draft cannot be started for this event, or null when it can (scope is checked by the caller). */
export function resultBlocker(c: EventCompletion): "not-submitted" | "no-participants" | "cancelled" | null {
  if (c.status === "Cancelled") return "cancelled";
  if (!c.submitted) return "not-submitted";
  if (!c.invited) return "no-participants";
  return null;
}

const draftFields = (event: Row) => ({
  training_event: s(event["name"]),
  employees: (Array.isArray(event["employees"]) ? event["employees"] : []).filter((r: Row) => s(r["employee"])).map((r: Row, i: number) => ({ idx: i + 1, employee: s(r["employee"]), employee_name: s(r["employee_name"]), department: s(r["department"]) || undefined })),
});

/** Dry-run of startTrainingResult's scope check (no write). */
export function mayStartTrainingResult(event: Row | undefined): boolean {
  if (!event) return false;
  try { assertScoped("Training Result", "create", { name: "", doctype: "Training Result", ...draftFields(event) }); return true; } catch { return false; }
}

/**
 * Open the existing draft result for the event, or create one with the event's participants (hours/grade are left
 * for the user to enter in the native form). Returns { name, created }.
 */
export function startTrainingResult(eventName: string): { name: string; created: boolean } {
  const event = scopedGet("Training Event", eventName);
  if (!event) throw new Error("Training event not found or not permitted");
  const c = eventCompletion(event, listWithDrafts("Training Result"), []);
  const block = resultBlocker(c);
  if (block === "not-submitted") throw new Error("Training Event must be submitted");
  if (block === "cancelled") throw new Error("Training Event is cancelled");
  if (block === "no-participants") throw new Error("Training Event has no participants");
  if (c.draftResult) {
    const readable = scopedGet("Training Result", c.draftResult);
    if (!readable) throw new Error("A draft result exists but is not visible to you");
    return { name: readable.name, created: false };
  }
  const meta = cachedMeta("Training Result");
  if (!meta) throw new Error("Training Result metadata unavailable");
  const fields = draftFields(event);
  assertScoped("Training Result", "create", { name: "", doctype: "Training Result", ...fields });
  const doc: Doc = insertHrDraft(meta, fields);
  const back = scopedGet("Training Result", doc.name);
  if (!back || s(back["training_event"]) !== eventName) throw new Error("Draft result could not be read back");
  return { name: back.name, created: true };
}

/** Scoped events newest first (cancelled docs excluded). */
export function trainingEvents(): Row[] {
  return scopedList("Training Event").filter(live).sort((a, b) => s(b["start_time"]).localeCompare(s(a["start_time"])));
}
