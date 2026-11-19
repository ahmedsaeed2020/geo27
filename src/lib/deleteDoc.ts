/**
 * Document delete — port of frappe/model/delete_doc.py delete_doc for the virtual adapter, shared by the form menu
 * and the list bulk action so both apply one rule set:
 *   check_permission_and_not_submitted → on_trash → check_if_doc_is_linked / check_if_doc_is_dynamically_linked
 *   → delete → after_delete → add_to_deleted_document → delete_dynamic_links + remove_all (attachments).
 *
 * Link discovery uses the generated capability graph (explicit schema Link / Dynamic Link / child-table relations)
 * over adapter rows, never hand-written lists. Controller `on_trash` / `after_delete` effects run only where a source
 * port exists below (TRASH_PORTS, each citing its controller); a business DocType whose controller defines those hooks
 * without a port is SERVER_ONLY, so the preview never deletes a record whose server cleanup it cannot reproduce.
 */
import { adapter, type Doc } from "./adapter";
import type { DocTypeMeta } from "./catalog";
import type { CapabilityRegistry, Relationship } from "./sourceTypes";
import { relationsOf } from "./capabilities";
import { currentUser, hasPerm } from "./session";
import { cachedRuntimeContract } from "./runtimeContract";
import { projectPercent } from "./departments";

/** hooks.py ignore_links_on_delete of frappe, erpnext and hrms (develop). */
export const IGNORE_LINKS_ON_DELETE: ReadonlySet<string> = new Set([
  // frappe/hooks.py
  "Communication", "ToDo", "DocShare", "Email Unsubscribe", "Activity Log", "File", "Version", "Document Follow", "Comment",
  "View Log", "Tag Link", "Notification Log", "Email Queue", "Document Share Key", "Integration Request", "Unhandled Email",
  "Webhook Request Log", "Workspace", "Route History", "Access Log", "Permission Log", "Desktop Icon", "Sidebar", "Custom Sidebar", "Dock",
  // erpnext/hooks.py
  "Tax Withholding Entry",
  // hrms/hooks.py
  "PWA Notification",
]);

const s = (v: unknown) => String(v ?? "");
const rowsOf = (d: Doc, field: string): Record<string, unknown>[] => (Array.isArray(d[field]) ? (d[field] as Record<string, unknown>[]) : []);

export interface LinkRef { doctype: string; name: string; field: string; single?: boolean; row?: number; dynamic?: boolean }
/** Predicate for references a ported on_trash clears before Frappe's link check runs (so they never block). */
type Clears = (holderDoctype: string, holder: Doc, field: string) => boolean;
type PortClears = (holderDoctype: string, holder: Doc, field: string, doc: Doc) => boolean;

interface TrashPort {
  source: string;
  validate?: (doc: Doc) => string[];
  clears?: PortClears;
  /** Same-DocType records deleted by on_trash through frappe.delete_doc (each goes through the full delete). */
  cascade?: (doc: Doc) => string[];
  apply?: (doc: Doc) => void;
  after?: (doc: Doc) => void;
}

/** frappe/contacts/address_and_contact.py delete_contact_and_address: unlink, or delete when it is the only link. */
function deleteContactAndAddress(doctype: string, name: string) {
  for (const parenttype of ["Contact", "Address"]) {
    for (const c of adapter.list(parenttype)) {
      const links = rowsOf(c, "links");
      if (!links.some((l) => l["link_doctype"] === doctype && l["link_name"] === name)) continue;
      if (links.length === 1) removeRecord(parenttype, c.name);
      else adapter.update(parenttype, c.name, { links: links.filter((l) => !(l["link_doctype"] === doctype && l["link_name"] === name)) });
    }
  }
}
const contactOrAddress: Clears = (dt, holder, field) => (dt === "Contact" || dt === "Address") && field === "link_name" && !!holder;

const partyPort = (source: string, extra?: (d: Doc) => void): TrashPort => ({
  source, clears: contactOrAddress,
  apply: (d) => { deleteContactAndAddress(s(d.doctype), d.name); extra?.(d); },
});

export const TRASH_PORTS: Record<string, TrashPort> = {
  Customer: partyPort("erpnext/selling/doctype/customer/customer.py on_trash", (d) => { const lead = s(d["lead_name"]); if (lead && adapter.get("Lead", lead)) adapter.update("Lead", lead, { status: "Interested" }); }),
  Supplier: partyPort("erpnext/buying/doctype/supplier/supplier.py on_trash"),
  Bank: partyPort("erpnext/accounts/doctype/bank/bank.py on_trash"),
  "Bank Account": partyPort("erpnext/accounts/doctype/bank_account/bank_account.py on_trash"),
  Shareholder: partyPort("erpnext/accounts/doctype/shareholder/shareholder.py on_trash"),
  Prospect: partyPort("erpnext/crm/doctype/prospect/prospect.py on_trash"),
  Lead: {
    source: "erpnext/crm/doctype/lead/lead.py on_trash (Issue.lead cleared, contacts/addresses unlinked, removed from Prospect leads)",
    clears: (dt, holder, field) => contactOrAddress(dt, holder, field) || (dt === "Issue" && field === "lead") || (dt === "Prospect" && field === "lead"),
    apply: (d) => {
      for (const i of adapter.list("Issue")) if (i["lead"] === d.name) adapter.update("Issue", i.name, { lead: null });
      deleteContactAndAddress("Lead", d.name);
      for (const p of adapter.list("Prospect")) { const rows = rowsOf(p, "leads"); if (rows.some((r) => r["lead"] === d.name)) adapter.update("Prospect", p.name, { leads: rows.filter((r) => r["lead"] !== d.name) }); }
    },
  },
  Item: {
    source: "erpnext/stock/doctype/item/item.py on_trash (Bin and Item Price deleted, variants deleted)",
    clears: (dt, holder, field) => dt === "Bin" || dt === "Item Price" || (dt === "Item" && field === "variant_of"),
    cascade: (d) => adapter.list("Item").filter((v) => v["variant_of"] === d.name).map((v) => v.name),
    apply: (d) => { for (const dt of ["Bin", "Item Price"]) for (const r of adapter.list(dt)) if (r["item_code"] === d.name) adapter.remove(dt, r.name); },
  },
  Project: {
    source: "erpnext/projects/doctype/project/project.py on_trash (Sales Order.project cleared)",
    clears: (dt, _h, field) => dt === "Sales Order" && field === "project",
    apply: (d) => { for (const so of adapter.list("Sales Order")) if (so["project"] === d.name) adapter.update("Sales Order", so.name, { project: "" }); },
  },
  Task: {
    source: "erpnext/projects/doctype/task/task.py on_trash + after_delete",
    validate: (d) => (adapter.list("Task").some((t) => t["parent_task"] === d.name) ? ["Child Task exists for this Task. You cannot delete this Task."] : []),
    // remove_from_parent_depends_on: the parent task's depends_on row for this task is removed first
    clears: (dt, holder, field, d) => dt === "Task" && field === "task" && holder.name === s(d["parent_task"]),
    apply: (d) => {
      const parent = s(d["parent_task"]); const p = parent ? adapter.get("Task", parent) : undefined;
      if (p) { const rows = rowsOf(p, "depends_on"); const keep = rows.filter((r) => r["task"] !== d.name); if (keep.length !== rows.length) adapter.update("Task", parent, { depends_on: keep }); }
    },
    after: (d) => { const pr = s(d["project"]); if (pr && adapter.get("Project", pr)) adapter.update("Project", pr, { percent_complete: projectPercent(pr) }); },
  },
  Employee: {
    source: "erpnext/setup/doctype/employee/employee.py on_trash (update_nsm_model, delete_events)",
    clears: (dt, holder, field) => dt === "Event" && field === "reference_docname" && rowsOf(holder, "event_participants").length <= 1,
    apply: (d) => {
      // frappe/desk/doctype/event/event.py delete_events: an event whose only participant is this record is deleted
      for (const ev of adapter.list("Event")) {
        const parts = rowsOf(ev, "event_participants");
        if (parts.some((p) => p["reference_doctype"] === "Employee" && p["reference_docname"] === d.name) && parts.length <= 1) adapter.remove("Event", ev.name);
      }
    },
  },
  "Leave Application": { source: "hrms/hr/doctype/leave_application/leave_application.py after_delete (realtime refetch only — no data effect)" },
};

export type DeleteSupport = { ok: true; unsimulated: string[]; port?: string } | { ok: false; reason: string };

/** Whether the preview can delete this DocType (source controller evidence from the runtime contract). */
export function deleteSupport(meta: Pick<DocTypeMeta, "name" | "source">): DeleteSupport {
  if (String(meta.source ?? "").startsWith("plugin:")) return { ok: true, unsimulated: [] };
  const rc = cachedRuntimeContract();
  if (!rc) return { ok: false, reason: "Source runtime contract is still loading" };
  const ev = rc.lifecycle[meta.name];
  if (!ev) return { ok: true, unsimulated: [] }; // site-defined (custom) DocType: no controller
  const hooks = ev.hooks.filter((h) => h === "on_trash" || h === "after_delete");
  const port = TRASH_PORTS[meta.name];
  if (!hooks.length || port) return { ok: true, unsimulated: [], ...(port ? { port: port.source } : {}) };
  // framework DocTypes: on_trash clears caches / derived artefacts the live virtual runtime re-derives from records
  if (ev.owner === "frappe") return { ok: true, unsimulated: hooks };
  return { ok: false, reason: `${meta.name}: deleting requires the DIGIT server — its controller runs ${hooks.join(" and ")}` };
}

/** Holders of child tables (child DocType → parent DocType + table field). */
function childParents(registry: CapabilityRegistry): Map<string, { parent: string; field: string }[]> {
  const m = new Map<string, { parent: string; field: string }[]>();
  for (const r of registry.relationships) if (r.kind === "CHILD_TABLE" && r.to) (m.get(r.to) ?? m.set(r.to, []).get(r.to)!).push({ parent: r.from, field: r.field });
  return m;
}
const capOf = (registry: CapabilityRegistry, dt: string) => registry.doctypes[dt]?.schema;

/**
 * get_linked_docs + get_dynamic_linked_docs (method "Delete"): records referencing `dt/name` through explicit schema
 * links. Static links block whatever their docstatus; dynamic links block unless the referencing record is cancelled.
 * Holders in ignore_links_on_delete, the document itself and unsaved local drafts never block.
 */
export function linkedForDelete(registry: CapabilityRegistry, dt: string, name: string, clears?: Clears): LinkRef[] {
  const parents = childParents(registry);
  const out: LinkRef[] = [];
  const consider = (r: Relationship, match: (row: Record<string, unknown>) => boolean, dynamic: boolean) => {
    const sc = capOf(registry, r.from);
    if (IGNORE_LINKS_ON_DELETE.has(r.from)) return;
    if (sc?.issingle) {
      const one = adapter.get(r.from, r.from);
      if (one && match(one)) out.push({ doctype: r.from, name: r.from, field: r.field, single: true, dynamic });
      return;
    }
    if (sc?.istable) {
      for (const p of parents.get(r.from) ?? []) {
        if (IGNORE_LINKS_ON_DELETE.has(p.parent)) continue;
        for (const d of adapter.list(p.parent)) {
          if (dynamic && Number(d.docstatus ?? 0) === 2) continue;
          if (p.parent === dt && d.name === name) continue;
          const rows = rowsOf(d, p.field); const i = rows.findIndex(match);
          if (i < 0 || clears?.(p.parent, d, r.field)) continue;
          out.push({ doctype: p.parent, name: d.name, field: r.field, dynamic, ...(dynamic ? { row: Number(rows[i]!["idx"] ?? i + 1) } : {}) });
        }
      }
      return;
    }
    for (const d of adapter.list(r.from)) {
      if (r.from === dt && d.name === name) continue;
      if (dynamic && Number(d.docstatus ?? 0) === 2) continue;
      if (!match(d) || clears?.(r.from, d, r.field)) continue;
      out.push({ doctype: r.from, name: d.name, field: r.field, dynamic });
    }
  };
  for (const r of relationsOf(registry, dt, "incoming")) if (r.kind === "LINK") consider(r, (row) => row[r.field] === name, false);
  for (const r of registry.relationships) if (r.kind === "DYNAMIC_LINK" && r.discriminator) { const disc = r.discriminator; consider(r, (row) => row[disc] === dt && row[r.field] === name, true); }
  return out;
}

/** raise_link_exists_exception wording (a Single reference names itself once; dynamic child rows add "at Row: n"). */
export function linkExistsMessage(dt: string, name: string, ref: LinkRef): string {
  const target = ref.single ? ref.name : `${ref.doctype} ${ref.name}`;
  return `Cannot delete or cancel because ${dt} ${name} is linked with ${target}${ref.row ? ` at Row: ${ref.row}` : ""}`;
}

/**
 * Tree parent fields whose source DocType JSON sets nsm_parent_field to a name other than the
 * `parent_<scrub(doctype)>` convention (frappe/utils/nestedset.py line 8 / 202): erpnext employee.json and
 * crm crm_sales_hierarchy.json both use "reports_to". Every other is_tree DocType follows the convention.
 */
const NSM_PARENT_EXCEPTIONS: Readonly<Record<string, string>> = { Employee: "reports_to", "CRM Sales Hierarchy": "reports_to" };
export function nsmParentField(meta: Pick<DocTypeMeta, "name" | "fields"> & { nsm_parent_field?: unknown }): string | null {
  const pf = String(meta.nsm_parent_field ?? "") || NSM_PARENT_EXCEPTIONS[meta.name] || `parent_${meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
  return meta.fields.some((f) => f.fieldname === pf) ? pf : null;
}

/** NestedSet.on_trash validate_if_child_exists: a tree node with children cannot be deleted (runs inside on_trash). */
function treeChildError(meta: DocTypeMeta, doc: Doc): string | null {
  if (!meta.is_tree) return null;
  const pf = nsmParentField(meta);
  if (!pf) return null;
  return adapter.list(meta.name).some((d) => d[pf] === doc.name) ? `Cannot delete ${doc.name} as it has child nodes` : null;
}

interface Plan { errors: string[]; order: Doc[] }
function plan(meta: DocTypeMeta, name: string, registry: CapabilityRegistry, user: string, seen: Set<string>): Plan {
  const d = adapter.get(meta.name, name);
  if (!d) return { errors: [`${meta.name} ${name} not found`], order: [] };
  if (seen.has(name)) return { errors: [], order: [] };
  seen.add(name);
  if (d["__islocal"]) return { errors: [], order: [d] };
  // check_permission_and_not_submitted (Administrator bypasses the permission check)
  if (user !== "Administrator" && !hasPerm(meta, "delete", d, user)) return { errors: [`No permission to delete ${meta.name}`], order: [] };
  if (meta.is_submittable && Number(d.docstatus ?? 0) === 1) return { errors: [`${meta.name} ${name}: Submitted Record cannot be deleted. You must Cancel it first.`], order: [] };
  const sup = deleteSupport(meta);
  if (!sup.ok) return { errors: [sup.reason], order: [] };
  const port = TRASH_PORTS[meta.name];
  // on_trash validations: the controller's own checks, then NestedSet.on_trash (update_nsm_model) for trees
  const v = port?.validate?.(d) ?? [];
  if (v.length) return { errors: v, order: [] };
  const tree = treeChildError(meta, d);
  if (tree) return { errors: [tree], order: [] };
  const order: Doc[] = [];
  for (const child of port?.cascade?.(d) ?? []) {
    const p = plan(meta, child, registry, user, seen);
    if (p.errors.length) return p;
    order.push(...p.order);
  }
  const clears: Clears | undefined = port?.clears ? (h, hd, f) => port.clears!(h, hd, f, d) : undefined;
  const blockers = linkedForDelete(registry, meta.name, name, clears).filter((r) => !(r.doctype === meta.name && seen.has(r.name)));
  if (blockers.length) {
    // delete_doc: a DocType that can be disabled suggests disabling instead
    const canDisable = meta.fields.some((f) => f.fieldname === "enabled" || f.fieldname === "disabled");
    return { errors: [canDisable ? `You can disable this ${meta.name} instead of deleting it.` : linkExistsMessage(meta.name, name, blockers[0]!)], order: [] };
  }
  order.push(d);
  return { errors: [], order };
}

/** delete_dynamic_links + remove_all: references that go with the deleted record. */
function deleteDynamicLinks(dt: string, name: string) {
  const del: [string, string, string][] = [
    ["Submission Queue", "ref_doctype", "ref_docname"], ["ToDo", "reference_type", "reference_name"], ["Email Unsubscribe", "reference_doctype", "reference_name"],
    ["DocShare", "share_doctype", "share_name"], ["Version", "ref_doctype", "docname"], ["Comment", "reference_doctype", "reference_name"],
    ["View Log", "reference_doctype", "reference_name"], ["Document Follow", "ref_doctype", "ref_docname"], ["Notification Log", "document_type", "document_name"],
    ["File", "attached_to_doctype", "attached_to_name"],
  ];
  for (const [holder, tf, nf] of del) for (const r of adapter.list(holder)) if (r[tf] === dt && r[nf] === name) adapter.remove(holder, r.name);
  for (const [holder, tf, nf] of [["Communication", "reference_doctype", "reference_name"], ["Activity Log", "reference_doctype", "reference_name"], ["Activity Log", "timeline_doctype", "timeline_name"]] as const)
    for (const r of adapter.list(holder)) if (r[tf] === dt && r[nf] === name) adapter.update(holder, r.name, { [tf]: null, [nf]: null });
  for (const c of adapter.list("Communication")) { const tl = rowsOf(c, "timeline_links"); if (tl.some((l) => l["link_doctype"] === dt && l["link_name"] === name)) adapter.update("Communication", c.name, { timeline_links: tl.filter((l) => !(l["link_doctype"] === dt && l["link_name"] === name)) }); }
}

function removeRecord(dt: string, name: string, user = currentUser()) {
  const d = adapter.get(dt, name); if (!d) return;
  adapter.remove(dt, name);
  if (d["__islocal"]) return;
  if (dt !== "Deleted Document") adapter.insertDoc("Deleted Document", { deleted_doctype: dt, deleted_name: name, data: JSON.stringify(d), restored: 0, owner: user });
  deleteDynamicLinks(dt, name);
}

/** frappe.delete_doc for one record. Returns the errors that stopped it ([] = deleted). */
export function deleteDocument(meta: DocTypeMeta, name: string, registry: CapabilityRegistry, user = currentUser()): string[] {
  const p = plan(meta, name, registry, user, new Set());
  if (p.errors.length) return p.errors;
  const port = TRASH_PORTS[meta.name];
  for (const d of p.order) {
    port?.apply?.(d);
    removeRecord(meta.name, d.name, user);
    port?.after?.(d);
  }
  return [];
}

/** frappe.desk.reportview.delete_items: each record deletes on its own; failures are collected, the rest proceed. */
export function deleteDocuments(meta: DocTypeMeta, names: string[], registry: CapabilityRegistry, user = currentUser()): { deleted: string[]; failed: { name: string; errors: string[] }[] } {
  const deleted: string[] = []; const failed: { name: string; errors: string[] }[] = [];
  for (const n of names) {
    if (!adapter.get(meta.name, n)) { if (!deleted.includes(n)) failed.push({ name: n, errors: [`${meta.name} ${n} not found`] }); continue; }
    const errs = deleteDocument(meta, n, registry, user);
    if (errs.length) failed.push({ name: n, errors: errs }); else deleted.push(n);
  }
  return { deleted, failed };
}
