/**
 * SHL-07 guided form tours — port of digit_hr.api.tours.for_form. Tour definitions and their Arabic come only from the
 * source (tours.generated.json ← scripts/hr-r9-tours.py ← tours.py + ar.csv). A tour is returned to users holding one of
 * its roles who may read (or create) the DocType; each step is checked against the live meta: absent / hidden fields are
 * dropped and a field on a permission level the user may not read is only counted, never named. Tours carry text only;
 * they never save, submit or change a document.
 */
import { cachedMeta } from "@/lib/catalog";
import { adapter } from "@/lib/adapter";
import { levelAccess, userRoles, currentUser } from "@/lib/session";
import { t } from "@/i18n";
import { _, can, PermissionError, requireApp } from "./core";
import SRC from "./tours.generated.json";

type Text = { en: string; ar: string | null };
type SrcTour = { key: string; doctype: string; section: string; roles: string[]; title: Text; steps: { fieldname: string; title: Text; description: Text; position: string }[] };
export type TourStep = { fieldname: string; fieldtype: string; label: string; title: Text; description: Text; position: string; depends_on: string | null };
export type Tour = { key: string; section: string; title: Text; roles: string[]; steps: TourStep[]; skipped: { absent: string[]; hidden: string[]; restricted: number }; save_on_complete: 0 };

export const TOURS = (SRC as { tours: SrcTour[] }).tours;
export const TOUR_DOCTYPES: ReadonlySet<string> = new Set(TOURS.map((x) => x.doctype));
/** Arabic from the source ar.csv; the 3 common words it lacks (Email, Employee, Status) use the Core dictionary. */
export const tourText = (x: Text, ar: boolean) => (ar ? x.ar ?? t(x.en) : x.en);

export function forForm(doctype: string, name?: string, user = currentUser()) {
  requireApp(user);
  if (!TOUR_DOCTYPES.has(doctype)) return { contract: "digit-hr-tours", version: 1, doctype, state: "no_tour" as const, tours: [] as Tour[] };
  if (name) {
    const d = adapter.get(doctype, name);
    if (!d || !can(doctype, "read", d, user)) throw new PermissionError(_("You do not have permission to view this document"));
  } else if (!(can(doctype, "read", undefined, user) || can(doctype, "create", undefined, user))) {
    throw new PermissionError(_("You do not have permission to view this document"));
  }
  const meta = cachedMeta(doctype);
  const roles = new Set(userRoles(user)); if (user === "Administrator") ["HR Manager", "HR User", "Employee", "Leave Approver", "Accounts Manager", "Accounts User"].forEach((r) => roles.add(r));
  const levels = meta ? new Set([0, ...levelAccess(meta, user).read]) : new Set([0]);
  const tours: Tour[] = [];
  for (const tour of TOURS) {
    if (tour.doctype !== doctype || !tour.roles.some((r) => roles.has(r)) || !meta) continue;
    const skipped = { absent: [] as string[], hidden: [] as string[], restricted: 0 }; const steps: TourStep[] = [];
    for (const st of tour.steps) {
      const df = meta.fields.find((f) => f.fieldname === st.fieldname);
      if (!df) { skipped.absent.push(st.fieldname); continue; }
      if (!levels.has(Number(df["permlevel"] ?? 0))) { skipped.restricted++; continue; }
      if (Number(df.hidden ?? 0)) { skipped.hidden.push(st.fieldname); continue; }
      steps.push({ fieldname: st.fieldname, fieldtype: df.fieldtype, label: df.label ? t(df.label, doctype) : st.fieldname, title: st.title, description: st.description, position: st.position, depends_on: df.depends_on || null });
    }
    if (steps.length) tours.push({ key: tour.key, section: tour.section, title: tour.title, roles: tour.roles.filter((r) => roles.has(r)), steps, skipped, save_on_complete: 0 });
  }
  const canWrite = name ? can(doctype, "write", adapter.get(doctype, name), user) : can(doctype, "create", undefined, user);
  return { contract: "digit-hr-tours", version: 1, doctype, name: name ?? null, state: (tours.length ? "ok" : "no_tour") as "ok" | "no_tour", can_write: canWrite, buttons: ["Next", "Previous", "Done", "Close"], tours };
}
