/**
 * Access state of a DIGIT Pro navigation item or workspace action — one rule for the sidebar, directories, workspace
 * links and Run11 actions (owner decision 2026-11-11: a denied destination is hidden, never offered as a link).
 * Pure: the React resolver (ProSidebar useNavResolver) passes the catalog index, report index and session roles in.
 */
import { canReadType } from "@/lib/scope";
import { ADMIN } from "@/lib/session";
import { dtOf, pageBySlug, pageItems, PRO_SOURCE, type NavItem } from "./nav";
import type { Run11Action } from "./run11";
import { featureEnabled } from "./admin/featureControl";
import { defaultCompany } from "@/lib/sessionDefaults";

export type NavState = "ok" | "denied" | "unavailable" | "loading";
export interface NavEnv {
  user: string; roles: string[];
  /** catalog DocType index (undefined while loading) */
  index: { name: string; app: string }[] | undefined;
  /** catalog report index (undefined while loading) */
  reports: { name: string; ref_doctype?: string | undefined; roles?: string[] | undefined }[] | undefined;
}

export function navItemState(i: NavItem, env: NavEnv): NavState {
  const { user, roles, index, reports } = env;
  const appOf = (n: string) => index?.find((e) => e.name === n)?.app;
  const t = i.target;
  if (t.kind === "missing") return "unavailable";
  if (i.roles && user !== ADMIN && !i.roles.some((x) => roles.includes(x))) return "denied";
  if (t.kind === "doctype" || t.kind === "tree") { if (!index) return "loading"; if (!appOf(t.doctype)) return "unavailable"; return canReadType(t.doctype, user) ? "ok" : "denied"; }
  if (t.kind === "pro") { const need = PRO_SOURCE[t.to]; if (!need || user === ADMIN) return "ok"; if (!index) return "loading"; return need.every((d) => canReadType(d, user)) ? "ok" : "denied"; }
  if (t.kind === "section") {
    // a section workspace is offered when the user may read at least one of the source DocTypes it hosts
    const pg = pageBySlug(t.dept, t.section); if (!pg) return "unavailable"; if (user === ADMIN) return "ok";
    // ADM-01 Feature Control: a workspace switched off for every role of this user at their company is hidden
    if (!featureEnabled(`ws:${pg.id}`, { user, roles, company: defaultCompany(user) })) return "denied";
    if (!index) return "loading";
    const dts = [...new Set(pageItems(pg).flatMap((x) => dtOf(x.target)))];
    return dts.some((d) => !!appOf(d) && canReadType(d, user)) ? "ok" : "denied";
  }
  if (t.kind === "report") {
    if (!reports) return "loading"; const r = reports.find((x) => x.name === t.report); if (!r) return "unavailable"; if (user === ADMIN) return "ok";
    // same two gates as the report page (routes/report.$name.tsx): a report role, and read on its ref_doctype
    return (!r.roles?.length || r.roles.some((x) => roles.includes(x))) && (!r.ref_doctype || canReadType(r.ref_doctype, user)) ? "ok" : "denied";
  }
  return "ok";
}

/**
 * State of a Run11 workspace action: server / policy / missing actions keep their labelled state; the others are "ok"
 * when the role may use the destination (create for a new document, read for a list or tool, the menu rule for Pro
 * screens and reports) and "denied" otherwise — a denied action is not rendered.
 */
export function actionState(a: Run11Action, env: NavEnv, can: (doctype: string, perm: "create" | "read") => boolean): NavState | "server" | "policy" | "missing" | "tab" {
  if (a.kind === "server" || a.kind === "policy" || a.kind === "missing" || a.kind === "tab") return a.kind;
  if (a.kind === "native-new") return a.doctype && can(a.doctype, "create") ? "ok" : "denied";
  if (a.kind === "tool" || a.kind === "list") return a.doctype && can(a.doctype, "read") ? "ok" : "denied";
  if (a.kind === "pro") return navItemState({ label: "", target: { kind: "pro", to: a.to! } } as NavItem, env);
  if (a.kind === "report") return navItemState({ label: a.report!, target: { kind: "report", report: a.report! } } as NavItem, env);
  return "ok";
}
