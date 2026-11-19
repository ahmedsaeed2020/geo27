/** Round-2 write helper: permission check (Core + HR identity + role scope), the DocType's Before Save rules, then the
 *  adapter insert / update — the same path a form save takes, so a feature never writes what the form would refuse. */
import { adapter, DocValidationError, type Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";
import { runDocEvent } from "@/plugins/runtime";
import { assertScoped } from "../compat/scope";

export function rulesErrors(dt: string, doc: Doc): string[] { return runDocEvent(dt, "before_save", doc).errors; }
export function createDoc(dt: string, values: Record<string, unknown>, user = currentUser(), opts: { skipPerm?: boolean } = {}): Doc {
  if (!opts.skipPerm) assertScoped(dt, "create", { doctype: dt, name: "", owner: user, ...values } as Doc, user);
  const errs = rulesErrors(dt, { doctype: dt, name: "", ...values } as Doc);
  if (errs.length) throw new DocValidationError(errs);
  return adapter.insertDoc(dt, values);
}
export function updateDoc(dt: string, name: string, patch: Record<string, unknown>, user = currentUser(), opts: { skipPerm?: boolean } = {}): Doc {
  const cur = adapter.get(dt, name); if (!cur) throw new DocValidationError([`${dt} ${name} not found`]);
  if (!opts.skipPerm) assertScoped(dt, "write", cur, user);
  const errs = rulesErrors(dt, { ...cur, ...patch } as Doc);
  if (errs.length) throw new DocValidationError(errs);
  adapter.update(dt, name, patch);
  return adapter.get(dt, name)!;
}
export const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
export const n = (v: unknown) => Number(v) || 0;
export const d10 = (v: unknown) => s(v).slice(0, 10);
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const nowISO = () => new Date().toISOString().slice(0, 19).replace("T", " ");
export const addDays = (iso: string, days: number) => { const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400000);
/** Result of a feature action: bilingual message, errors, and the records it wrote (shown with links). */
export interface ActionResult { ok: boolean; message: [string, string]; errors?: string[]; created?: [string, string][]; rows?: Record<string, unknown>[]; data?: unknown }
export const ok = (en: string, ar: string, extra: Partial<ActionResult> = {}): ActionResult => ({ ok: true, message: [en, ar], ...extra });
export const fail = (en: string, ar: string, errors: string[] = []): ActionResult => ({ ok: false, message: [en, ar], errors });
/** Run an action and turn permission / validation errors into a failed result. */
export function guarded(fn: () => ActionResult): ActionResult {
  try { return fn(); } catch (e) {
    const errs = e instanceof DocValidationError ? e.errors : [e instanceof Error ? e.message : String(e)];
    return fail("The action was refused.", "رُفض الإجراء.", errs);
  }
}
