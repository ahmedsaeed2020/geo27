/**
 * DIGIT shared Core recurring documents (Run11.1 F4 recurring journals, D12 recurring documents, SL14 recurring orders).
 *
 * Schedules are native Frappe "Auto Repeat" records (reference document, frequency, start/end, next schedule date,
 * submit on creation). The preview's scheduler (frappe auto_repeat.make_auto_repeat_entry) runs here: a due schedule
 * copies its reference document through documentApi (create permission, naming, posting) dated on the schedule date,
 * optionally submits it, links it back (`auto_repeat`) and moves the next date — catching up missed periods.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { currentUser, hasPerm } from "@/lib/session";
import { newVoucher, type Bi } from "./finance";

const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
export const FREQUENCIES = ["Daily", "Weekly", "Fortnightly", "Monthly", "Quarterly", "Half-yearly", "Yearly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const FREQ_LABEL: Record<Frequency, Bi> = { Daily: ["Daily", "يومي"], Weekly: ["Weekly", "أسبوعي"], Fortnightly: ["Every two weeks", "كل أسبوعين"], Monthly: ["Monthly", "شهري"], Quarterly: ["Quarterly", "ربع سنوي"], "Half-yearly": ["Every six months", "نصف سنوي"], Yearly: ["Yearly", "سنوي"] };
const MONTHS: Partial<Record<Frequency, number>> = { Monthly: 1, Quarterly: 3, "Half-yearly": 6, Yearly: 12 };
const DAYS: Partial<Record<Frequency, number>> = { Daily: 1, Weekly: 7, Fortnightly: 14 };
/** Next schedule date (frappe get_next_schedule_date: months keep the day, clamped to month end; repeat_on_last_day uses the month end). */
export function nextDate(d: string, f: string, lastDay = false): string {
  const fr = (f === "Year" ? "Yearly" : f) as Frequency;
  if (DAYS[fr]) return new Date(Date.parse(`${d}T00:00:00Z`) + DAYS[fr]! * 864e5).toISOString().slice(0, 10);
  const m = MONTHS[fr] ?? 1; const y = Number(d.slice(0, 4)), mo = Number(d.slice(5, 7)) - 1 + m, day = Number(d.slice(8, 10));
  const end = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, mo, lastDay ? end : Math.min(day, end))).toISOString().slice(0, 10);
}
const DATE_FIELDS = ["posting_date", "transaction_date", "bill_date", "cheque_date", "reference_date"];
const SHIFT_FIELDS = ["due_date", "delivery_date", "schedule_date", "valid_till"];
const DROP = new Set(["name", "docstatus", "amended_from", "status", "outstanding_amount", "per_billed", "per_delivered", "per_received", "billing_status", "delivery_status", "modified", "creation", "owner", "modified_by", "__synthetic", "__islocal", "__tab", "auto_repeat", "_assign", "_user_tags", "_comments", "_liked_by", "irn", "ewaybill"]);
const addD = (d: string, k: number) => new Date(Date.parse(`${d}T00:00:00Z`) + k * 864e5).toISOString().slice(0, 10);
const diff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
/** Field values of the new document: the reference copied, dated on `date`, other dates shifted by the same offset. */
export function copyFor(ref: Doc, date: string): Record<string, unknown> {
  const base = s(ref["posting_date"] || ref["transaction_date"]) || date; const off = diff(base, date);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ref)) {
    if (DROP.has(k) || k.startsWith("__")) continue;
    if (Array.isArray(v)) out[k] = (v as Doc[]).map((r, i) => { const row: Record<string, unknown> = {}; for (const [rk, rv] of Object.entries(r ?? {})) if (!["name", "parent", "parenttype", "parentfield", "delivered_qty", "billed_amt", "received_qty", "returned_qty", "against_sales_order", "against_sales_invoice"].includes(rk)) row[rk] = SHIFT_FIELDS.includes(rk) && rv ? addD(s(rv), off) : rv; row["idx"] = i + 1; return row; });
    else if (DATE_FIELDS.includes(k) && v) out[k] = date;
    else if (SHIFT_FIELDS.includes(k) && v) out[k] = addD(s(v), off);
    else out[k] = v;
  }
  return out;
}
export interface Schedule { name: string; doctype: string; reference: string; frequency: string; start: string; end: string; next: string; submit: boolean; status: string; due: boolean; created: string[] }
export function schedules(asOf: string): Schedule[] {
  return adapter.list("Auto Repeat").map((a) => {
    const status = n(a["disabled"]) ? "Disabled" : s(a["status"]) || "Active"; const next = s(a["next_schedule_date"]) || s(a["start_date"]);
    return { name: a.name, doctype: s(a["reference_doctype"]), reference: s(a["reference_document"]), frequency: s(a["frequency"]), start: s(a["start_date"]), end: s(a["end_date"]), next, submit: !!n(a["submit_on_creation"]), status,
      due: status === "Active" && !!next && next <= asOf && (!s(a["end_date"]) || next <= s(a["end_date"])), created: adapter.list(s(a["reference_doctype"])).filter((d) => d["auto_repeat"] === a.name).map((d) => d.name) };
  }).sort((a, b) => a.next.localeCompare(b.next));
}
/** Create every document due up to `asOf` for one schedule (at most 24 catch-up periods). */
export function runSchedule(name: string, asOf: string, user = currentUser()): { ok: boolean; created: string[]; errors: string[] } {
  const ar = adapter.get("Auto Repeat", name); if (!ar) return { ok: false, created: [], errors: ["Schedule not found"] };
  const dt = s(ar["reference_doctype"]); const ref = adapter.get(dt, s(ar["reference_document"]));
  if (!ref) return { ok: false, created: [], errors: [`${dt} ${s(ar["reference_document"])} no longer exists`] };
  if (n(ar["disabled"]) || s(ar["status"]) === "Disabled" || s(ar["status"]) === "Completed") return { ok: false, created: [], errors: ["The schedule is not active"] };
  const created: string[] = []; const errors: string[] = []; let next = s(ar["next_schedule_date"]) || s(ar["start_date"]); const end = s(ar["end_date"]);
  for (let i = 0; i < 24 && next && next <= asOf && (!end || next <= end); i++) {
    const r = newVoucher(dt, { ...copyFor(ref, next), auto_repeat: name }, { submit: !!n(ar["submit_on_creation"]), user });
    if (!r.name) { errors.push(...r.errors); break; }
    created.push(r.name); if (r.errors.length) errors.push(...r.errors);
    next = nextDate(next, s(ar["frequency"]), !!n(ar["repeat_on_last_day"]));
  }
  adapter.update("Auto Repeat", name, { next_schedule_date: next, ...(end && next > end ? { status: "Completed" } : {}) });
  return { ok: !errors.length, created, errors };
}
export function runDueSchedules(asOf: string, user = currentUser(), only?: (a: Schedule) => boolean): { created: string[]; errors: string[] } {
  const out = { created: [] as string[], errors: [] as string[] };
  for (const sc of schedules(asOf).filter((x) => x.due && (!only || only(x)))) { const r = runSchedule(sc.name, asOf, user); out.created.push(...r.created); out.errors.push(...r.errors.map((e) => `${sc.name}: ${e}`)); }
  return out;
}
/** Make a document repeat (native Auto Repeat record; the document must be submitted or saved, and the user may create Auto Repeat). */
export function makeRecurring(dt: string, name: string, frequency: Frequency, start: string, end: string, submit: boolean, user = currentUser()): { ok: true; name: string } | { ok: false; reason: Bi } {
  const m = cachedMeta("Auto Repeat"); if (m && !hasPerm(m, "create", undefined, user)) return { ok: false, reason: ["You may not create schedules.", "لا يحق لك إنشاء جداول التكرار."] };
  const ref = adapter.get(dt, name); if (!ref || ref["__islocal"]) return { ok: false, reason: ["Save the document first.", "احفظ المستند أولًا."] };
  if (n(ref.docstatus) === 2) return { ok: false, reason: ["A cancelled document cannot repeat.", "لا يتكرر مستند ملغى."] };
  if (adapter.list("Auto Repeat").some((a) => a["reference_doctype"] === dt && a["reference_document"] === name && !n(a["disabled"]) && a["status"] !== "Completed")) return { ok: false, reason: ["This document already repeats.", "هذا المستند مكرر بالفعل."] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || (end && end < start)) return { ok: false, reason: ["Check the start and end dates.", "راجع تاريخي البداية والنهاية."] };
  const d = adapter.insertDoc("Auto Repeat", { reference_doctype: dt, reference_document: name, frequency, start_date: start, end_date: end || "", next_schedule_date: start, submit_on_creation: submit ? 1 : 0, status: "Active", disabled: 0 });
  return { ok: true, name: d.name };
}
