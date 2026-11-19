/**
 * List view menu and bulk-action policy — pure ports of frappe/public/js/frappe/list/list_view.js get_menu_items()
 * and get_actions_menu_items(), plus frappe/public/js/frappe/form/toolbar.js make_customize_buttons(), so the list
 * "…" menu, the list Actions menu and the form menu apply the same source gates (roles, permissions, workflow,
 * developer_mode, desk bulk_actions). Callers pass the session facts; nothing here reads or writes records.
 */
import { LAYOUT_TYPES, TABLE_TYPES, type DocField, type DocTypeMeta } from "./catalog";
import type { PType } from "./session";

/** frappe/public/js/frappe/model/model.js core_doctypes_list (no Customize / Settings for these). */
export const CORE_DOCTYPES: ReadonlySet<string> = new Set([
  "DocType", "DocField", "DocPerm", "User", "Role", "Has Role", "Page", "Module Def", "Print Format", "Report",
  "Customize Form", "Customize Form Field", "Property Setter", "Custom Field", "Client Script",
]);

/** frappe.boot.developer_mode of the simulated site: 0 (no site_config), as in expr.ts — Edit DocType stays hidden. */
export const SITE_DEVELOPER_MODE = false;

export interface PolicyCtx {
  roles: string[];
  /** frappe.perm.has_perm(doctype, 0, ptype) for the list DocType. */
  can: (ptype: PType) => boolean;
  /** frappe.model.can_create(other DocType). */
  canCreate: (doctype: string) => boolean;
  /** frappe.boot.developer_mode — 0 in this preview (no site config), see expr.ts. */
  developerMode: boolean;
  /** DocType allow_import flag (source JSON). */
  allowImport: boolean;
}
const isSM = (c: Pick<PolicyCtx, "roles">) => c.roles.includes("System Manager") || c.roles.includes("Administrator");

export type ListMenuItem = "Import" | "User Permissions" | "Role Permissions Manager" | "Customize" | "Settings" | "Edit DocType" | "Customize Quick Filters" | "List Settings";

/** get_menu_items(): visible list "…" menu items in source order. */
export function listMenuItems(meta: Pick<DocTypeMeta, "name" | "istable">, c: PolicyCtx): ListMenuItem[] {
  const out: ListMenuItem[] = [];
  // frappe.model.can_import: boot.user.can_import = DocTypes with allow_import and the import permission
  if (!meta.istable && c.allowImport && c.can("import")) out.push("Import");
  if (isSM(c)) out.push("User Permissions", "Role Permissions Manager");
  if (c.canCreate("Custom Field") && c.canCreate("Property Setter") && !CORE_DOCTYPES.has(meta.name)) out.push("Customize", "Settings");
  if (isSM(c) && c.developerMode) out.push("Edit DocType");
  out.push("Customize Quick Filters");
  if (isSM(c)) out.push("List Settings");
  return out;
}

/** toolbar.js make_customize_buttons(): form-menu Settings / Customize / Edit DocType. */
export function formCustomizeItems(meta: Pick<DocTypeMeta, "name" | "issingle">, c: PolicyCtx): { settings: boolean; customize: boolean; editDocType: boolean } {
  const cust = c.canCreate("Custom Field") && c.canCreate("Property Setter") && !CORE_DOCTYPES.has(meta.name) && !meta.issingle;
  return { settings: cust, customize: cust, editDocType: c.canCreate("DocType") && c.developerMode && meta.name !== "DocType" };
}

export type BulkActionId = "copy" | "edit" | "export" | "assign" | "clear_assignment" | "assignment_rule" | "add_tags" | "print" | "submit" | "cancel" | "delete";
export const BULK_LABEL: Record<BulkActionId, string> = {
  copy: "Copy to Clipboard", edit: "Edit", export: "Export", assign: "Assign To", clear_assignment: "Clear Assignment",
  assignment_rule: "Apply Assignment Rule", add_tags: "Add Tags", print: "Print", submit: "Submit", cancel: "Cancel", delete: "Delete",
};

export interface BulkCtx {
  can: (ptype: PType) => boolean;
  /** desk_settings.bulk_actions (User.bulk_actions). */
  bulkActions: boolean;
  /** frappe.model.has_workflow(doctype). */
  hasWorkflow: boolean;
  /** List View Settings.allow_edit (only consulted when a workflow exists). */
  workflowAllowEdit: boolean;
  /** boot.user.can_export_owner_only includes the DocType. */
  exportOwnerOnly: boolean;
}

/** frappe.model.is_value_type and list_view.js is_field_editable. */
export function isBulkEditable(f: DocField): boolean {
  return !!f.fieldname && !LAYOUT_TYPES.has(f.fieldtype) && !TABLE_TYPES.has(f.fieldtype) && f.fieldtype !== "Read Only" && !f.hidden && !f.read_only && !f["is_virtual"];
}

/** get_actions_menu_items(): Actions menu for checked rows, in source order. */
export function bulkActionItems(meta: Pick<DocTypeMeta, "is_submittable" | "fields">, c: BulkCtx): BulkActionId[] {
  const out: BulkActionId[] = ["copy"];
  if (!c.bulkActions) return out;
  const editAllowed = c.hasWorkflow ? c.workflowAllowEdit : true;
  if (meta.fields.some(isBulkEditable) && editAllowed) out.push("edit");
  if (c.can("export") && !c.exportOwnerOnly) out.push("export");
  out.push("assign", "clear_assignment", "assignment_rule", "add_tags");
  if (c.can("print")) out.push("print");
  if (meta.is_submittable && c.can("submit") && !c.hasWorkflow) out.push("submit");
  // can_cancel: a cancel DocPerm is only valid on a submittable DocType (core/doctype/doctype/doctype.py validate_permissions)
  if (meta.is_submittable && c.can("cancel") && !c.hasWorkflow) out.push("cancel");
  if (c.can("delete") && editAllowed) out.push("delete");
  return out;
}

/** boot.user.can_export_owner_only: every export rule the user holds is an if_owner rule. */
export function exportOwnerOnly(rules: Record<string, unknown>[], roles: string[]): boolean {
  if (roles.includes("Administrator")) return false;
  const mine = rules.filter((r) => roles.includes(String(r["role"])) && Number(r["permlevel"] ?? 0) === 0 && Number(r["export"] ?? 0));
  return mine.length > 0 && mine.every((r) => Number(r["if_owner"] ?? 0));
}

/** Copy to Clipboard: tab-separated header + rows, HTML stripped, null → "". */
export function clipboardTSV(columns: { label: string; value: (row: Record<string, unknown>) => unknown }[], rows: Record<string, unknown>[]): string {
  const cell = (v: unknown) => (v == null ? "" : String(v).replace(/<[^>]*>/g, ""));
  return [columns.map((c) => c.label).join("\t"), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join("\t"))].join("\n");
}

export const MAX_PRINT_LIMIT = 500;
/** bulk_operations.js print(): which selected documents may be printed together. */
export function printSelectionError(isSubmittable: boolean, docs: { docstatus?: number | undefined }[], settings: { allow_print_for_draft?: unknown; allow_print_for_cancelled?: unknown }, isAdministrator: boolean): string | null {
  const ok = (d: { docstatus?: number | undefined }) => !isSubmittable || Number(d.docstatus ?? 0) === 1 || (Number(settings.allow_print_for_cancelled ?? 0) && Number(d.docstatus) === 2) || (Number(settings.allow_print_for_draft ?? 0) && Number(d.docstatus ?? 0) === 0) || isAdministrator;
  if (docs.some((d) => !ok(d))) return "You selected Draft or Cancelled documents";
  if (!docs.length) return "Select atleast 1 record for printing";
  if (docs.length > MAX_PRINT_LIMIT) return `You can only print upto ${MAX_PRINT_LIMIT} documents at a time`;
  return null;
}
