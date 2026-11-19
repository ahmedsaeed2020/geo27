// Port of crm Settings/Hierarchy (Hierarchy.vue, useDragDrop.js, useRemoveNode.js),
// crm_sales_hierarchy.py validate() and permissions/org_hierarchy.py team subtree.
import { adapter, type Doc } from "@/lib/adapter";

export const DOCTYPE = "CRM Sales Hierarchy";
export const ROLE_RANK: Record<string, number> = { "Sales Manager": 0, "Sales User": 1 };
export type HNode = { name: string; user: string; reports_to: string; full_name: string; email: string; enabled: boolean; role: string; role_rank: number; children: HNode[] };

const rolesOf = (u?: Doc) => (Array.isArray(u?.["roles"]) ? (u["roles"] as { role?: string }[]).map(r => r.role || "") : []);
export function userRole(user: string): string {
  const roles = rolesOf(adapter.get("User", user));
  if (user === "Administrator" || roles.includes("System Manager")) return "System Manager";
  return roles.includes("Sales Manager") ? "Sales Manager" : "Sales User";
}

export function enrich(rows: Doc[]): HNode[] {
  return rows.flatMap(n => {
    const user = String(n["user"] || ""); const u = adapter.get("User", user); const role = userRole(user); const rank = ROLE_RANK[role];
    if (rank === undefined) return [];
    return [{ name: n.name, user, reports_to: String(n["reports_to"] || ""), full_name: String(u?.["full_name"] || n["full_name"] || user), email: String(u?.["email"] || user), enabled: u?.["enabled"] !== 0, role, role_rank: rank, children: [] }];
  });
}

export function buildTree(nodes: HNode[]): HNode[] {
  const by = new Map(nodes.map(n => [n.name, { ...n, children: [] as HNode[] }])); const roots: HNode[] = [];
  for (const n of by.values()) { const p = n.reports_to && by.get(n.reports_to); if (p) p.children.push(n); else roots.push(n); }
  return roots;
}

export function filterTree(roots: HNode[], query: string, role: string): HNode[] {
  const q = query.trim().toLowerCase();
  const match = (n: HNode) => (!q || n.full_name.toLowerCase().includes(q) || n.email.toLowerCase().includes(q)) && (role === "All" || n.role === role);
  const clear = (n: HNode): HNode | null => { if (match(n)) return n; const c = n.children.map(clear).filter((x): x is HNode => x !== null); return c.length ? { ...n, children: c } : null; };
  return roots.map(clear).filter((x): x is HNode => x !== null);
}

const isDescendant = (src: HNode, name: string) => { const s = [...src.children]; while (s.length) { const n = s.pop()!; if (n.name === name) return true; s.push(...n.children); } return false; };
export function canDrop(src?: HNode, tgt?: HNode) { return !!src && !!tgt && src.name !== tgt.name && src.role_rank >= tgt.role_rank && !isDescendant(src, tgt.name); }

export function candidates(parent: HNode | null, placed: Set<string>) {
  const rank = parent?.role_rank ?? -1;
  return adapter.list("User").filter(u => { if (placed.has(u.name) || u.name === "Administrator") return false; const r = userRole(u.name); return r in ROLE_RANK && (ROLE_RANK[r] ?? 99) >= rank; });
}

/** crm_sales_hierarchy.py validate(): unique user; parent becomes a group. */
export function validateNode(name: string, user: string, reportsTo: string): string | null {
  const existing = adapter.list(DOCTYPE).find(n => n["user"] === user && n.name !== name);
  if (existing) return `User ${user} is already mapped to hierarchy node ${existing.name}.`;
  if (reportsTo) { const p = adapter.get(DOCTYPE, reportsTo); if (p && !Number(p["is_group"])) adapter.update(DOCTYPE, reportsTo, { is_group: 1 }); }
  return null;
}

export function addUsers(parent: HNode | null, users: string[]) {
  let added = 0; let error: string | null = null;
  for (const user of users) { const e = validateNode("", user, parent?.name || ""); if (e) { error = e; continue; } adapter.insertDoc(DOCTYPE, { user, reports_to: parent?.name || "", is_group: 0, full_name: String(adapter.get("User", user)?.["full_name"] || user) }); added++; }
  return { added, error };
}

export function reparent(name: string, parent: string) { const n = adapter.get(DOCTYPE, name); if (!n) return; validateNode(name, String(n["user"]), parent); adapter.update(DOCTYPE, name, { reports_to: parent || "", old_parent: n["reports_to"] || "" }); }

export function removeNode(nodes: HNode[], node: HNode, mode: "simple" | "reassign" | "cascade" = "simple") {
  if (mode === "reassign") nodes.filter(n => n.reports_to === node.name).forEach(c => adapter.update(DOCTYPE, c.name, { reports_to: node.reports_to || "" }));
  if (mode === "cascade") { const del: string[] = []; const visit = (n: string) => { nodes.filter(x => x.reports_to === n).forEach(x => visit(x.name)); del.push(n); }; visit(node.name); del.forEach(d => adapter.remove(DOCTYPE, d)); return; }
  adapter.remove(DOCTYPE, node.name);
}

export const hierarchyEnabled = () => Boolean(Number(adapter.get("FCRM Settings", "FCRM Settings")?.["enable_sales_hierarchy"]));

/** org_hierarchy._team_mem_query: user plus everyone in their subtree. */
export function teamOf(user: string): Set<string> {
  const rows = adapter.list(DOCTYPE); const me = rows.find(r => r["user"] === user); const out = new Set([user]);
  if (!me) return out; const stack = [me.name];
  while (stack.length) { const p = stack.pop(); rows.filter(r => r["reports_to"] === p).forEach(r => { out.add(String(r["user"])); stack.push(r.name); }); }
  return out;
}

/** org_hierarchy._has_permission for CRM Lead / CRM Deal. */
export function canSeeRecord(user: string, doctype: "CRM Lead" | "CRM Deal", doc: Doc, assignees: string[] = []): boolean {
  const role = userRole(user); if (role === "System Manager") return true;
  const inTree = hierarchyEnabled() && adapter.list(DOCTYPE).some(r => r["user"] === user);
  if (role === "Sales Manager" && !inTree) return true;
  const owner = String(doc[doctype === "CRM Lead" ? "lead_owner" : "deal_owner"] || "");
  const team = inTree ? teamOf(user) : new Set([user]);
  return team.has(owner) || assignees.some(a => team.has(a));
}
