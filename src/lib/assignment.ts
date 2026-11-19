/**
 * Assignments and tags — frappe/desk/form/assign_to.py (add / remove / clear) and frappe/desk/doctype/tag (add_tags)
 * over adapter records, shared by the form sidebar and the list bulk actions so both write the same data:
 * an Open `ToDo` per assignee, the reference document's `_assign` list (todo.py update_in_reference), the optional
 * `assigned_to` field, and the timeline Comment (comment_type Assigned / Assignment Completed / Tag).
 */
import { adapter } from "./adapter";
import { currentUser } from "./session";

const arr = (v: unknown): string[] => { try { const a = typeof v === "string" ? JSON.parse(v) : v; return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };
const today = () => new Date().toISOString().slice(0, 10);

function comment(doctype: string, name: string, comment_type: string, content: string, by: string) {
  adapter.insertDoc("Comment", { comment_type, reference_doctype: doctype, reference_name: name, content, comment_email: by, creation: new Date().toISOString() });
}
const openTodos = (doctype: string, name: string) => adapter.list("ToDo").filter((t) => t["reference_type"] === doctype && t["reference_name"] === name && t["status"] === "Open");

export function assignees(doctype: string, name: string): string[] { return arr(adapter.get(doctype, name)?.["_assign"]); }

export interface AssignOptions { description?: string; priority?: "Low" | "Medium" | "High"; date?: string; by?: string; hasAssignedToField?: boolean }

/** assign_to.add: one Open ToDo per new assignee; users already holding an Open ToDo are reported as duplicates. */
export function addAssignment(doctype: string, name: string, users: string[], opts: AssignOptions = {}): { added: string[]; duplicates: string[] } {
  const doc = adapter.get(doctype, name); if (!doc) return { added: [], duplicates: [] };
  const by = opts.by ?? currentUser();
  const open = new Set(openTodos(doctype, name).map((t) => String(t["allocated_to"])));
  const current = assignees(doctype, name);
  const added: string[] = []; const duplicates: string[] = [];
  for (const u of [...new Set(users.map((x) => x.trim()).filter(Boolean))]) {
    if (open.has(u) || current.includes(u)) { duplicates.push(u); continue; }
    adapter.insertDoc("ToDo", {
      allocated_to: u, reference_type: doctype, reference_name: name, status: "Open", priority: opts.priority ?? "Medium",
      date: opts.date || today(), assigned_by: by, description: opts.description?.trim() || `Assignment for ${doctype} ${name}`,
    });
    added.push(u);
    comment(doctype, name, "Assigned", u, by);
  }
  if (added.length) adapter.update(doctype, name, { _assign: JSON.stringify([...current, ...added]), ...(opts.hasAssignedToField ? { assigned_to: added.at(-1) } : {}) });
  return { added, duplicates };
}

/** assign_to.remove → set_status("Cancelled"): the user's Open ToDo is cancelled and dropped from `_assign`. */
export function removeAssignment(doctype: string, name: string, user: string, by = currentUser()): boolean {
  const doc = adapter.get(doctype, name); if (!doc) return false;
  const current = assignees(doctype, name);
  const todos = openTodos(doctype, name).filter((t) => t["allocated_to"] === user);
  if (!current.includes(user) && !todos.length) return false;
  for (const t of todos) adapter.update("ToDo", t.name, { status: "Cancelled" });
  adapter.update(doctype, name, { _assign: JSON.stringify(current.filter((x) => x !== user)) });
  comment(doctype, name, "Assignment Completed", user, by);
  return true;
}

/** assign_to.remove_multiple → clear: every current assignment of each record is removed. */
export function clearAssignments(doctype: string, names: string[], by = currentUser()): number {
  let n = 0;
  for (const nm of names) for (const u of new Set([...assignees(doctype, nm), ...openTodos(doctype, nm).map((t) => String(t["allocated_to"]))])) if (removeAssignment(doctype, nm, u, by)) n++;
  return n;
}

export const tagsOf = (doctype: string, name: string): string[] => String(adapter.get(doctype, name)?.["_user_tags"] ?? "").split(",").map((t) => t.trim()).filter(Boolean);

/** tag.py add_tags / DocTags.add: tags join `_user_tags`; a `Tag` master is created when missing. */
export function addTags(doctype: string, names: string[], tags: string[], by = currentUser()): number {
  const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  let n = 0;
  for (const t of clean) if (!adapter.get("Tag", t)) adapter.insertDoc("Tag", { name: t });
  for (const nm of names) {
    const cur = tagsOf(doctype, nm); const add = clean.filter((t) => !cur.includes(t));
    if (!add.length || !adapter.get(doctype, nm)) continue;
    adapter.update(doctype, nm, { _user_tags: [...cur, ...add].join(",") });
    for (const t of add) comment(doctype, nm, "Tag", t, by);
    n++;
  }
  return n;
}

export function removeTag(doctype: string, name: string, tag: string) {
  adapter.update(doctype, name, { _user_tags: tagsOf(doctype, name).filter((x) => x !== tag).join(",") });
}
