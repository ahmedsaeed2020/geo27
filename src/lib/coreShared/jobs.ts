/**
 * DIGIT shared Core background jobs (Part B: L3-b bulk jobs with a per-row log, PL2-b background Data Import). Ports the
 * frappe split: bulk submit / cancel of 20 or more documents (bulk_update.py submit_cancel_or_update_docs) and deleting
 * more than 10 (reportview.py delete_items) are enqueued; a Data Import runs in the background (data_import.py
 * start_import). The preview has no worker, so a job runs in small chunks after the current screen has rendered and the
 * user can keep working. Every row goes through the shared document API (permissions, hooks, posting), and its outcome is
 * written to the Core "Digit Background Job" per-row log (and, for imports, to the native Data Import + Data Import Log).
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { currentUser } from "@/lib/session";
import { cancelDocument, submitDocument } from "@/lib/documentApi";
import { runImport, type ImportResult, type ImportType, type Parsed, type RowIssue, type TableSpec } from "@/lib/dataImport";
import { CORE_DT } from "./doctypes";

export type Bi = [string, string];
export type BulkAction = "submit" | "cancel" | "delete";
/** frappe thresholds: submit / cancel from 20 documents, delete above 10. */
export const BACKGROUND_FROM: Record<BulkAction, number> = { submit: 20, cancel: 20, delete: 11 };
export const runsInBackground = (action: BulkAction, count: number) => count >= BACKGROUND_FROM[action];
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const nowStamp = () => new Date().toISOString().slice(0, 19).replace("T", " ");
type JobRow = { idx: number; row_ref: string; status: "Queued" | "Done" | "Failed" | "Skipped"; message: string };
const rowsOf = (j: Doc | undefined): JobRow[] => (Array.isArray(j?.["rows"]) ? (j!["rows"] as JobRow[]) : []);

/** Deleting needs the capability registry the list already loaded (deleteDoc.ts); the list passes its delete function in. */
type Deleter = (name: string) => string[];
const deleters = new Map<string, Deleter>();
const imports = new Map<string, { docs: Parsed[]; issues: RowIssue[]; specs: TableSpec[]; type: ImportType; submit: boolean; results: ImportResult[] }>();

export function startBulkJob(o: { doctype: string; names: string[]; action: BulkAction; user?: string; title?: string; deleter?: Deleter; schedule?: boolean }): { ok: true; name: string } | { ok: false; reason: Bi } {
  const meta = cachedMeta(o.doctype); if (!meta) return { ok: false, reason: ["The document definition is still loading — try again.", "تعريف المستند ما زال يُحمَّل — حاول مجددًا."] };
  if (!o.names.length) return { ok: false, reason: ["Select the documents first.", "اختر المستندات أولًا."] };
  if (o.action === "delete" && !o.deleter) return { ok: false, reason: ["Deleting needs the list's link check; start it from the list.", "الحذف يحتاج فحص الروابط في القائمة؛ ابدأه من القائمة."] };
  const user = o.user ?? currentUser(); const verb = { submit: "Submit", cancel: "Cancel", delete: "Delete" }[o.action];
  const j = adapter.insertDoc(CORE_DT.job, { title: o.title ?? `${verb} ${o.names.length} ${o.doctype}`, kind: "Bulk action", reference_doctype: o.doctype, status: "Queued", started_by: user, started_on: nowStamp(), owner: user,
    total: o.names.length, done: 0, failed: 0, rows: o.names.map((x, i) => ({ idx: i + 1, row_ref: x, status: "Queued", message: "" })), __action: o.action });
  if (o.deleter) deleters.set(j.name, o.deleter);
  if (o.schedule !== false) schedule(j.name);
  return { ok: true, name: j.name };
}

/** A Data Import that runs in the background: the native Data Import record exists at once (status Pending) and fills row by row. */
export function startImportJob(o: { doctype: string; docs: Parsed[]; issues: RowIssue[]; specs: TableSpec[]; type: ImportType; submit: boolean; fileName: string; header: string[]; mute?: boolean; user?: string; schedule?: boolean }): { job: string; dataImport: string } {
  const user = o.user ?? currentUser();
  const imp = adapter.insertDoc("Data Import", { reference_doctype: o.doctype, import_type: o.type, status: "Pending", import_file: o.fileName, submit_after_import: o.submit ? 1 : 0, mute_emails: o.mute ? 1 : 0,
    template_options: JSON.stringify({ header: o.header }), import_log: "[]", owner: user });
  const j = adapter.insertDoc(CORE_DT.job, { title: `Import ${o.docs.length} ${o.doctype}`, kind: "Data import", reference_doctype: o.doctype, status: "Queued", started_by: user, started_on: nowStamp(), owner: user,
    total: o.docs.length, done: 0, failed: 0, rows: o.docs.map((d, i) => ({ idx: i + 1, row_ref: `Row ${d.row}`, status: "Queued", message: "" })), __data_import: imp.name });
  imports.set(j.name, { docs: o.docs, issues: o.issues, specs: o.specs, type: o.type, submit: o.submit, results: [] });
  if (o.schedule !== false) schedule(j.name);
  return { job: j.name, dataImport: imp.name };
}

function finishImport(j: Doc, results: ImportResult[]) {
  const di = s(j["__data_import"]); if (!di || !adapter.get("Data Import", di)) return;
  const ok = results.filter((r) => r.ok).length;
  adapter.update("Data Import", di, { status: !results.length ? "Error" : ok === results.length ? "Success" : ok ? "Partial Success" : "Error", import_log: JSON.stringify(results) });
}

/** Run up to `chunk` queued rows of a job; returns true while rows remain. */
export function runJobStep(name: string, chunk = 10): boolean {
  const j = adapter.get(CORE_DT.job, name); if (!j || ["Completed", "Completed with errors", "Failed"].includes(s(j["status"]))) return false;
  const rows = rowsOf(j).map((r) => ({ ...r })); const todo = rows.filter((r) => r.status === "Queued").slice(0, chunk);
  const user = s(j["started_by"]) || currentUser(); const dt = s(j["reference_doctype"]);
  if (s(j["kind"]) === "Data import") {
    const p = imports.get(name);
    for (const r of todo) {
      if (!p) { r.status = "Skipped"; r.message = "The page was closed before this row was imported — import the errored rows again."; continue; }
      const d = p.docs[r.idx - 1]!; let res: ImportResult;
      try { res = runImport([d], p.issues.filter((x) => x.row === d.row), p.specs, p.type, p.submit)[0]!; } catch (e) { res = { row: d.row, ok: false, messages: [e instanceof Error ? e.message : String(e)], raw: d.raw }; }
      p.results.push(res); r.status = res.ok ? "Done" : "Failed"; r.message = `${res.name ? `${res.name}: ` : ""}${res.messages.join("; ")}`;
      const di = s(j["__data_import"]); if (di) adapter.insertDoc("Data Import Log", { data_import: di, row_indexes: JSON.stringify([res.row]), success: res.ok ? 1 : 0, docname: res.name ?? "", messages: JSON.stringify(res.messages) });
    }
  } else {
    const meta = cachedMeta(dt); const action = s(j["__action"]) as BulkAction;
    for (const r of todo) {
      const d = adapter.get(dt, r.row_ref); const ds = n(d?.docstatus); let errs: string[] = [];
      if (!meta) { r.status = "Failed"; r.message = `${dt}: the document definition is not loaded`; continue; }
      if (!d) { r.status = "Failed"; r.message = `${dt} ${r.row_ref} not found`; continue; }
      if (action === "submit" && ds !== 0) { r.status = "Skipped"; r.message = "Not a draft"; continue; }
      if (action === "cancel" && ds !== 1) { r.status = "Skipped"; r.message = "Not submitted"; continue; }
      try {
        if (action === "submit") errs = submitDocument(meta, r.row_ref, user);
        else if (action === "cancel") errs = cancelDocument(meta, r.row_ref, user);
        else { const del = deleters.get(name); errs = del ? del(r.row_ref) : ["The page was closed before this row ran — delete it again from the list."]; }
      } catch (e) { errs = [e instanceof Error ? e.message : String(e)]; }
      r.status = errs.length ? "Failed" : "Done"; r.message = errs.length ? errs.join("; ") : { submit: "Submitted", cancel: "Cancelled", delete: "Deleted" }[action];
    }
  }
  const done = rows.filter((r) => r.status === "Done").length, failed = rows.filter((r) => r.status === "Failed" || r.status === "Skipped").length;
  const left = rows.some((r) => r.status === "Queued");
  adapter.update(CORE_DT.job, name, { rows, done, failed, status: left ? "Running" : failed ? (done ? "Completed with errors" : "Failed") : "Completed", ...(left ? {} : { finished_on: nowStamp() }) });
  if (!left) { if (s(j["kind"]) === "Data import") finishImport(adapter.get(CORE_DT.job, name)!, imports.get(name)?.results ?? []); imports.delete(name); deleters.delete(name); }
  return left;
}
/** Run a job to the end in one go (tests, and "finish now" from the jobs screen). */
export function runJob(name: string) { let guard = 0; while (runJobStep(name, 25) && guard++ < 10_000) { /* next chunk */ } return adapter.get(CORE_DT.job, name)!; }
const running = new Set<string>();
/** Chunks run one after another off the current interaction (frappe enqueue → worker). */
export function schedule(name: string) {
  if (running.has(name) || typeof setTimeout === "undefined") return; running.add(name);
  const tick = () => { let more = false; try { more = runJobStep(name); } catch { more = false; } if (more) setTimeout(tick, 30); else running.delete(name); };
  setTimeout(tick, 30);
}
/** Jobs left queued or running when the page was closed carry on (bulk) or report their unrun rows (imports). */
export function resumeJobs(user = currentUser()) {
  for (const j of adapter.list(CORE_DT.job)) if (["Queued", "Running"].includes(s(j["status"])) && (s(j["started_by"]) === user || user === "Administrator")) schedule(j.name);
}
export const jobsFor = (user = currentUser()) => adapter.list(CORE_DT.job).filter((j) => user === "Administrator" || s(j["started_by"]) === user).sort((a, b) => s(b["started_on"]).localeCompare(s(a["started_on"])) || b.name.localeCompare(a.name, undefined, { numeric: true }));
