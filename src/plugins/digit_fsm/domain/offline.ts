import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * F4-06 offline queue (owner FSM round F4, 2026-11-18 — built virtually now, no step waits for a server). While the
 * technician works offline every journey step is captured as an FSM Offline Action (Pending) with what the device saw
 * («base»: the visit / run state it expected); «مزامنة» replays the queue in capture order through the same journey
 * services. A step whose record moved meanwhile (run reviewed, visit finished by the office, record gone) is kept as a
 * Conflict with the reason, never applied over the newer state; the dispatcher retries it on the current state or discards
 * it with a note. Mode is per browser (localStorage), the queue is shared adapter data, so office and device read one list.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { nowIso, s } from "./rules";
import { attachResultPhoto, recordResult, type Result } from "./services";
import { checkIn, logTime, moveParts, setFindingSeverity, signVisit } from "./fieldOps";

const KEY = "digit-fsm:offline";
const subs = new Set<() => void>();
export function isOffline(): boolean { try { return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1"; } catch { return false; } }
export function setOffline(on: boolean) { try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* storage blocked */ } subs.forEach((f) => f()); }
export function subscribeOffline(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }

export type OfflineKind = "Check-in" | "Result" | "Photo" | "Signature" | "Time" | "Parts" | "Severity";
const DB_ACTION: Record<OfflineKind, string> = { "Check-in": "Check-in", Result: "Result", Photo: "Photo", Signature: "Signature", Time: "Time", Parts: "Parts", Severity: "Result" };
export interface OfflinePayload { kind: OfflineKind; base: string; /** result rows: the outcome the device saw before this step */ rowBase?: string | undefined; visit?: string | undefined; run?: string | undefined; row?: string | undefined; outcome?: string | undefined; note?: string | undefined; measurement?: number | string | undefined; file?: { name: string; url: string; size?: number } | undefined; signer?: string | undefined; image?: string | undefined; hours?: number | undefined; item?: string | undefined; qty?: number | undefined; mode?: "use" | "return" | undefined; severity?: "Critical" | "Major" | "Minor" | undefined }
const pay = (d: Doc): OfflinePayload | undefined => { try { const p = JSON.parse(s(d["payload"]) || "{}") as OfflinePayload; return p && p.kind ? p : undefined; } catch { return undefined; } };
export const payloadOf = pay;

const OPEN_RUN = new Set(["Draft", "In Progress"]);
/** What the device expects of the record: visit state (after its own queued check-in) or run open / locked. */
export function expectedState(dt: string, name: string): string {
  const d = adapter.get(dt, name); if (!d) return "missing";
  if (dt === "FSM Inspection Run") return OPEN_RUN.has(s(d["workflow_state"])) ? "open" : "locked";
  if (dt === VISIT_DT) { const st = s(d["workflow_state"]); const queuedIn = queue().some((a) => s(a["sync_state"]) === "Pending" && pay(a)?.kind === "Check-in" && pay(a)?.visit === name); return queuedIn && st === "Dispatched" ? "On Site" : st; }
  return s(d["workflow_state"] ?? d["docstatus"]);
}
const refOf = (p: OfflinePayload): [string, string] => (p.run ? ["FSM Inspection Run", p.run] : [VISIT_DT, s(p.visit)]);
const currentState = (dt: string, name: string): string => { const d = adapter.get(dt, name); if (!d) return "missing"; return dt === "FSM Inspection Run" ? (OPEN_RUN.has(s(d["workflow_state"])) ? "open" : "locked") : s(d["workflow_state"]); };

export const queue = (tech?: string) => adapter.list("FSM Offline Action").filter((a) => !tech || s(a["technician"]) === tech).sort((a, b) => s(a["captured_on"]).localeCompare(s(b["captured_on"])) || a.name.localeCompare(b.name));
export function offlineCounts(tech?: string) {
  const q = queue(tech); const c = (st: string) => q.filter((a) => s(a["sync_state"]) === st).length;
  return { pending: c("Pending"), synced: c("Synced"), conflict: c("Conflict"), discarded: c("Discarded"), total: q.length };
}
/** Queued (not yet synced) result of a run row as the device shows it. */
export function pendingResult(run: string, row: string): OfflinePayload | undefined {
  return queue().filter((a) => s(a["sync_state"]) === "Pending").map(pay).filter((p): p is OfflinePayload => !!p && p.run === run && p.row === row && (p.kind === "Result" || p.kind === "Severity")).slice(-1)[0];
}

/** Outcome of a result row as the device sees it: its own queued result first, else the record. */
const rowOutcome = (run: string, row: string) => s(((adapter.get("FSM Inspection Run", run)?.["results"] as Record<string, unknown>[] | undefined) ?? []).find((x) => s(x["name"]) === row)?.["outcome"]) || "Untested";
function seenOutcome(run: string, row: string): string { const q = queue().filter((a) => s(a["sync_state"]) === "Pending").map(pay).filter((x): x is OfflinePayload => !!x && x.kind === "Result" && x.run === run && x.row === row && x.outcome !== undefined).slice(-1)[0]; return q?.outcome ?? rowOutcome(run, row); }
/** Capture one journey step on the device (Pending). */
export function capture(tech: string, p: Omit<OfflinePayload, "base">): Result {
  if (!tech) return { ok: false, message: "No technician for this device", message_ar: "لا فني مرتبط بهذا الجهاز" };
  const [dt, name] = refOf(p as OfflinePayload);
  const base = expectedState(dt, name);
  const site = s(adapter.get(dt, name)?.["site"]);
  const rowBase = p.run && p.row && p.kind === "Result" ? seenOutcome(p.run, p.row) : undefined;
  const d = adapter.insertDoc("FSM Offline Action", { technician: tech, device_id: `TAB-${tech.slice(-3)}`, action: DB_ACTION[p.kind], reference_doctype: dt, reference_name: name, payload: JSON.stringify({ ...p, base, ...(rowBase !== undefined ? { rowBase } : {}) }), captured_on: nowIso(), sync_state: "Pending", ...(site ? { site } : {}) });
  return { ok: true, name: d.name, doctype: "FSM Offline Action", message: `Saved on the device — ${p.kind} waits for sync`, message_ar: "حُفظت على الجهاز — بانتظار المزامنة" };
}
function apply(p: OfflinePayload): Result {
  switch (p.kind) {
    case "Check-in": return checkIn(s(p.visit));
    case "Result": return recordResult(s(p.run), s(p.row), { ...(p.outcome !== undefined ? { outcome: p.outcome } : {}), ...(p.note !== undefined ? { note: p.note } : {}), ...(p.measurement !== undefined ? { measurement: p.measurement } : {}) });
    case "Photo": return p.file ? attachResultPhoto(s(p.run), s(p.row), p.file) : { ok: false, message: "No photo in the step", message_ar: "لا صورة في الخطوة" };
    case "Severity": return setFindingSeverity(s(p.run), s(p.row), p.severity ?? "Major");
    case "Signature": return signVisit(s(p.visit), s(p.signer), s(p.image));
    case "Time": return logTime(s(p.visit), Number(p.hours) || 0, s(p.note));
    case "Parts": return moveParts(s(p.visit), s(p.item), Number(p.qty) || 0, p.mode ?? "use");
  }
}
const conflictNote = (dt: string, name: string, base: string, cur: string): string => cur === "missing"
  ? `${dt} ${name} no longer exists ‖ السجل ${name} لم يعد موجوداً`
  : dt === "FSM Inspection Run" ? `Run ${name} was submitted or reviewed before this step reached the office ‖ الفحص ${name} قُدّم أو رُوجع قبل وصول هذه الخطوة للمكتب`
    : `Visit ${name} changed from ${base} to ${cur} while the device was offline ‖ الزيارة ${name} تغيّرت من ${base} إلى ${cur} أثناء عمل الجهاز دون اتصال`;
/** Replay the Pending steps in capture order; returns synced / conflict counts. */
export function syncOffline(tech?: string): { synced: number; conflict: number; message: string; message_ar: string; ok: boolean } {
  let synced = 0, conflict = 0;
  adapter.batch(() => {
    for (const a of queue(tech).filter((x) => s(x["sync_state"]) === "Pending")) {
      const p = pay(a); const dt = s(a["reference_doctype"]); const name = s(a["reference_name"]);
      if (!p || !name) { adapter.update("FSM Offline Action", a.name, { sync_state: "Conflict", conflict_note: "The step has no record to apply to ‖ الخطوة بلا سجل تُطبَّق عليه" }); conflict++; continue; }
      const cur = currentState(dt, name); const base = p.base;
      const same = cur === base || (dt === VISIT_DT && base === "On Site" && cur === "Dispatched" && p.kind === "Check-in");
      if (!same) { adapter.update("FSM Offline Action", a.name, { sync_state: "Conflict", conflict_note: conflictNote(dt, name, base, cur) }); conflict++; continue; }
      // a check the office changed meanwhile is never overwritten by the device's older view
      if (p.kind === "Result" && p.rowBase !== undefined && p.outcome !== undefined && rowOutcome(s(p.run), s(p.row)) !== p.rowBase) {
        adapter.update("FSM Offline Action", a.name, { sync_state: "Conflict", conflict_note: `Check ${s(p.row)} was changed to ${rowOutcome(s(p.run), s(p.row))} in the office while the device was offline ‖ البند ${s(p.row)} تغيّر في المكتب إلى ${rowOutcome(s(p.run), s(p.row))} أثناء عمل الجهاز دون اتصال` }); conflict++; continue;
      }
      const r = apply(p);
      if (r.ok) { adapter.update("FSM Offline Action", a.name, { sync_state: "Synced", synced_on: nowIso() }); synced++; }
      else { adapter.update("FSM Offline Action", a.name, { sync_state: "Conflict", conflict_note: `${r.message} ‖ ${r.message_ar}` }); conflict++; }
    }
  });
  return { ok: conflict === 0, synced, conflict, message: `${synced} synced${conflict ? `, ${conflict} in conflict` : ""}`, message_ar: `تمت مزامنة ${synced}${conflict ? `، و${conflict} في تعارض` : ""}` };
}
/** Dispatcher decision on a conflict: apply it on the current state now, or discard it with a note. */
export function resolveOffline(name: string, how: "retry" | "discard", note = ""): Result {
  const a = adapter.get("FSM Offline Action", name); if (!a) return { ok: false, message: "Step not found", message_ar: "الخطوة غير موجودة" };
  if (s(a["sync_state"]) !== "Conflict") return { ok: false, message: "Only a step in conflict can be resolved", message_ar: "تُعالج الخطوة المتعارضة فقط" };
  if (how === "discard") {
    if (!note.trim()) return { ok: false, message: "Say why the step is discarded", message_ar: "اذكر سبب الاستبعاد" };
    adapter.update("FSM Offline Action", name, { sync_state: "Discarded", conflict_note: `${s(a["conflict_note"])}\n— ${note.trim()}` });
    return { ok: true, name, message: "Step discarded", message_ar: "تم استبعاد الخطوة" };
  }
  const p = pay(a); if (!p) return { ok: false, message: "The step carries no data to apply", message_ar: "الخطوة لا تحمل بيانات للتطبيق" };
  const r = apply(p);
  if (r.ok) { adapter.update("FSM Offline Action", name, { sync_state: "Synced", synced_on: nowIso() }); return { ok: true, name, message: "Applied on the current record", message_ar: "طُبّقت على السجل الحالي" }; }
  adapter.update("FSM Offline Action", name, { conflict_note: `${r.message} ‖ ${r.message_ar}` });
  return r;
}
