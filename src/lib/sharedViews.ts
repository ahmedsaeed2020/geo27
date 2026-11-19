/**
 * Saved and shared list views (Construction phase 4 C4-09, Enterprise saved views). A view is saved in two steps —
 * the filter first, then who sees it: خاص (owner only) / فريقي (the owner's team, resolved by the host app) / الجميع
 * (everyone who may read the DocType) / مخصص (chosen roles or users). Views are adapter records of frappe's own saved
 * list filter DocType "List Filter" (filter_name, reference_doctype, filters, for_user) plus share columns, written
 * only here; owners alone may change or delete a view, and at most VIEW_LIMIT views per user and DocType are kept.
 * A shared view carries filters only — every reader still sees just the rows their own permissions allow.
 */
import { adapter, type Doc } from "./adapter";
import { currentUser, userRoles } from "./session";

export type ShareScope = "private" | "team" | "all" | "custom";
export const SHARE_SCOPES: ShareScope[] = ["private", "team", "all", "custom"];
export type ViewSurface = "hub" | "list";
export interface SharedView { id: string; owner: string; doctype: string; surface: ViewSurface; title: string; payload: Record<string, unknown>; share: ShareScope; roles: string[]; users: string[]; created: string }
export const VIEW_LIMIT = 20;
export const VIEW_DT = "List Filter";
type Bi = [string, string];

/** Team resolver: a host app names the owner's team (e.g. Construction: the project teams the owner belongs to). */
let resolver: { fn: (user: string) => string[]; label: Bi } | null = null;
export function setTeamResolver(fn: (user: string) => string[], label: Bi) { resolver = { fn, label }; }
/** Default team: users whose Employee record shares the owner's department. */
export function departmentTeam(user: string): string[] {
  const emps = adapter.list("Employee");
  const dep = String(emps.find((e) => e["user_id"] === user)?.["department"] ?? "");
  return dep ? emps.filter((e) => e["department"] === dep && e["user_id"]).map((e) => String(e["user_id"])) : [];
}
export function teamOf(user: string): string[] { return [...new Set((resolver ? resolver.fn(user) : departmentTeam(user)).filter((u) => u && u !== user))]; }
export const teamLabel = (): Bi => resolver?.label ?? ["Users in your department", "مستخدمو قسمك"];

export const SHARE_TEXT: Record<ShareScope, { label: Bi; hint: () => Bi }> = {
  private: { label: ["Private", "خاص"], hint: () => ["Only you see this view.", "يراه أنت فقط."] },
  team: { label: ["My team", "فريقي"], hint: () => { const t = teamLabel(); return [`${t[0]} see it.`, `يراه ${t[1]}.`]; } },
  all: { label: ["Everyone", "الجميع"], hint: () => ["Everyone who may read these documents sees it.", "يراه كل من يملك صلاحية قراءة هذه المستندات."] },
  custom: { label: ["Custom", "مخصص"], hint: () => ["Only the roles or users you choose see it.", "تراه الأدوار أو المستخدمون الذين تختارهم فقط."] },
};

const lines = (v: unknown) => String(v ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
function fromDoc(d: Doc): SharedView | null {
  let payload: Record<string, unknown> = {}; try { payload = JSON.parse(String(d["filters"] ?? "{}")) as Record<string, unknown>; } catch { return null; }
  const share = SHARE_SCOPES.includes(d["digit_share"] as ShareScope) ? (d["digit_share"] as ShareScope) : d["for_user"] ? "private" : "all";
  return { id: d.name, owner: String(d["owner"] ?? d["for_user"] ?? ""), doctype: String(d["reference_doctype"] ?? ""), surface: d["digit_surface"] === "list" ? "list" : "hub", title: String(d["filter_name"] ?? d.name),
    payload, share, roles: lines(d["digit_roles"]), users: lines(d["digit_users"]), created: String(d["creation"] ?? "") };
}
const records = () => adapter.list(VIEW_DT).filter((d) => d["digit_surface"]).map(fromDoc).filter((v): v is SharedView => !!v);

export function canSeeView(v: SharedView, user = currentUser()): boolean {
  if (v.owner === user) return true;
  if (v.share === "all") return true;
  if (v.share === "team") return teamOf(v.owner).includes(user);
  if (v.share === "custom") { const r = userRoles(user); return v.users.includes(user) || v.roles.some((x) => r.includes(x)); }
  return false;
}
/** Views of a DocType + surface the user may see: their own first (oldest first), then shared ones. */
export function viewsFor(doctype: string, surface: ViewSurface, user = currentUser()): SharedView[] {
  const vs = records().filter((v) => v.doctype === doctype && v.surface === surface && canSeeView(v, user));
  return [...vs.filter((v) => v.owner === user), ...vs.filter((v) => v.owner !== user)];
}
export const ownCount = (doctype: string, user = currentUser()) => records().filter((v) => v.doctype === doctype && v.owner === user).length;

export interface ViewInput { doctype: string; surface: ViewSurface; title: string; payload: Record<string, unknown>; share: ShareScope; roles?: string[]; users?: string[] }
export function viewErrors(i: ViewInput, user = currentUser(), editing?: string): string[] {
  const e: string[] = [];
  if (!i.title.trim()) e.push("Name the view");
  if (i.title.trim().length > 60) e.push("A view name has at most 60 characters");
  if (!SHARE_SCOPES.includes(i.share)) e.push("Choose who sees the view");
  if (i.share === "custom" && !(i.roles?.length || i.users?.length)) e.push("Choose at least one role or user");
  if (!editing && ownCount(i.doctype, user) >= VIEW_LIMIT) e.push(`You already have ${VIEW_LIMIT} saved views for this list; delete one first`);
  if (records().some((v) => v.id !== editing && v.owner === user && v.doctype === i.doctype && v.surface === i.surface && v.title.trim().toLowerCase() === i.title.trim().toLowerCase())) e.push("You already have a view with this name");
  return e;
}
const fields = (i: ViewInput, user: string) => ({ filter_name: i.title.trim(), reference_doctype: i.doctype, filters: JSON.stringify(i.payload), for_user: i.share === "private" ? user : "",
  digit_surface: i.surface, digit_share: i.share, digit_roles: i.share === "custom" ? (i.roles ?? []).join("\n") : "", digit_users: i.share === "custom" ? (i.users ?? []).filter((u) => u !== user).join("\n") : "" });
export function saveView(i: ViewInput, user = currentUser()): { view?: SharedView; errors: string[] } {
  const errors = viewErrors(i, user); if (errors.length) return { errors };
  const d = adapter.insertDoc(VIEW_DT, { ...fields(i, user), owner: user });
  return { view: fromDoc(d)!, errors: [] };
}
export function updateView(id: string, patch: Partial<Pick<ViewInput, "title" | "share" | "roles" | "users" | "payload">>, user = currentUser()): { view?: SharedView; errors: string[] } {
  const cur = records().find((v) => v.id === id); if (!cur) return { errors: ["View not found"] };
  if (cur.owner !== user) return { errors: ["Only the owner can change a saved view"] };
  const next: ViewInput = { doctype: cur.doctype, surface: cur.surface, title: patch.title ?? cur.title, payload: patch.payload ?? cur.payload, share: patch.share ?? cur.share, roles: patch.roles ?? cur.roles, users: patch.users ?? cur.users };
  const errors = viewErrors(next, user, id); if (errors.length) return { errors };
  adapter.update(VIEW_DT, id, fields(next, user));
  return { view: fromDoc(adapter.get(VIEW_DT, id)!)!, errors: [] };
}
export function deleteView(id: string, user = currentUser()): string[] {
  const cur = records().find((v) => v.id === id); if (!cur) return ["View not found"];
  if (cur.owner !== user) return ["Only the owner can delete a saved view"];
  adapter.remove(VIEW_DT, id); return [];
}
/** Who sees a view, as a short count for the chip tooltip. */
export function audience(v: SharedView): { users: number; roles: number } {
  return v.share === "custom" ? { users: v.users.length, roles: v.roles.length } : v.share === "team" ? { users: teamOf(v.owner).length, roles: 0 } : { users: 0, roles: 0 };
}
