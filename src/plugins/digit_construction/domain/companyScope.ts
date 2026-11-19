/**
 * R4-I company isolation for app DocTypes. Every app document that links a Project carries that project's company:
 * DocTypes without their own company field get a read-only `company` fetched from the project (schema.ts
 * withCompany), and the adapter hook below keeps it equal to the project's company on every save; DocTypes that already
 * own a company field refuse a company that differs from the project's. A Company User Permission then scopes app
 * records exactly like native documents (Desk lists, link search, reports and app screens).
 *
 * backfillCompany() fills the derived company on stored records that predate the field (empty values only, quiet
 * write, never overwrites) — the virtual equivalent of a Frappe patch that populates a new fetch_from field.
 */
import { adapter, registerDocHook, type Doc } from "@/lib/adapter";
import { currentUser, userPermissions } from "@/lib/session";
import { isEnabled } from "@/plugins/runtime";
import { COMPANY_FROM_PROJECT, CONSTRUCTION_DOCTYPES } from "../schema";

const APP = "digit_construction";
/** DocType → its Project link field, for every app DocType that has both a project link and a company field. */
export const PROJECT_COMPANY_TYPES: Record<string, string> = Object.fromEntries(CONSTRUCTION_DOCTYPES
  .filter((d) => !d.istable && !d.issingle && d.fields.some((f) => f.fieldname === "company"))
  .map((d) => [d.name, COMPANY_FROM_PROJECT[d.name] ?? d.fields.find((f) => f.fieldtype === "Link" && f.options === "Project")?.fieldname ?? ""])
  .filter(([, pf]) => !!pf));

export const projectCompany = (project: unknown): string => (project ? String(adapter.get("Project", String(project))?.["company"] ?? "") : "");

/** Company rule for one document (pure): derived types follow the project; owned company fields must match it. */
export function companyRule(dt: string, doc: Doc): { doc: Doc; errors: string[] } {
  const pf = PROJECT_COMPANY_TYPES[dt]; if (!pf) return { doc, errors: [] };
  const pc = projectCompany(doc[pf]);
  if (!pc) return { doc, errors: [] };
  if (COMPANY_FROM_PROJECT[dt]) return { doc: doc["company"] === pc ? doc : { ...doc, company: pc }, errors: [] };
  if (doc["company"] && doc["company"] !== pc) return { doc, errors: [`Company ${String(doc["company"])} is not the company of project ${String(doc[pf])} (${pc})`] };
  return { doc: doc["company"] ? doc : { ...doc, company: pc }, errors: [] };
}

/**
 * Hook: derive / check the company, then (like frappe, which fetches link values before checking create permission)
 * refuse a derived company outside the current user's Company User Permissions, so nobody files a record into a
 * company they cannot see by picking that company's project.
 */
for (const dt of Object.keys(PROJECT_COMPANY_TYPES)) registerDocHook(dt, (doc, before) => {
  if (!isEnabled(APP) || doc["__synthetic"]) return { doc };
  const r = companyRule(dt, doc);
  const co = String(r.doc["company"] ?? "");
  if (co && co !== String(before?.["company"] ?? "")) {
    const allowed = userPermissions(currentUser(), dt).get("Company");
    if (allowed && !allowed.has(co)) r.errors.push(`Not permitted: company ${co} is outside your User Permissions`);
  }
  return { doc: r.doc, ...(r.errors.length ? { errors: r.errors } : {}) };
});

/** Fill the derived company on stored records whose company is empty (quiet, never overwrites). Returns the count. */
export function backfillCompany(): number {
  let n = 0;
  for (const [dt, pf] of Object.entries(COMPANY_FROM_PROJECT)) for (const d of adapter.list(dt)) {
    if (d["company"] || d["__islocal"]) continue;
    const pc = projectCompany(d[pf]); if (!pc) continue;
    adapter.insertDocQuiet(dt, { ...d, company: pc }); n++;
  }
  return n;
}
