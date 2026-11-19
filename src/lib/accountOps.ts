/**
 * Chart of Accounts tree operations — local port of erpnext/accounts/doctype/account/account.py
 * (autoname get_autoname_with_number, validate_parent, validate_root_details, validate_account_number,
 * set_root_and_report_type, convert_group_to_ledger, convert_ledger_to_group, update_account_number, on_trash)
 * and erpnext/accounts/utils.py add_ac, pinned to frappe/erpnext@7b5179fbd348c1ffdd1643ee139716811939b94b.
 * Used by the DIGIT Pro Chart of Accounts tree (R2 P0-COA). Every operation validates first and returns the
 * source error text instead of writing; masters change only through the adapter, never ledger rows.
 * Permissions are enforced inside each operation (frappe has_permission on the Account record: create / write / delete,
 * incl. User Permission on Company) so callers cannot bypass them by skipping a UI gate.
 */
import { adapter, type Doc } from "./adapter";
import { renameDoc } from "./rename";
import { assertScoped } from "./scope";
import { currentUser, type PType } from "./session";

export const ACCOUNT_OPS_SOURCE = "erpnext/accounts/doctype/account/account.py @7b5179f";
/**
 * M-15 native capability gate for the Account tree (account.js form actions + account_tree.js toolbar/menu + frappe
 * treeview). Every native action maps to the DIGIT Pro operation or destination that provides it, or to a recorded
 * exception. nativeGate.test.ts fails when the frozen catalog gains an action that is not classified here.
 */
export const ACCOUNT_ACTION_MAP: Record<string, { op?: "addAccount" | "updateAccountNumber" | "convertGroupToLedger" | "convertLedgerToGroup" | "moveAccount" | "deleteAccount"; route?: string; exception?: string }> = {
  "Add Child": { op: "addAccount" },
  "New": { op: "addAccount" },
  "Update Account Name / Number": { op: "updateAccountNumber" },
  "Convert to Non-Group": { op: "convertGroupToLedger" },
  "Convert to Group": { op: "convertLedgerToGroup" },
  "Move": { op: "moveAccount" },
  "Delete": { op: "deleteAccount" },
  "View Ledger": { route: "/pro/general-ledger" },
  "General Ledger": { route: "/pro/general-ledger" },
  "Chart of Accounts": { route: "/pro/accounts" },
  "Expand All": { route: "/pro/accounts" },
  "Collapse All": { route: "/pro/accounts" },
  "Merge Account": { exception: "OWNER_FINANCE_DECISION: merging re-points posted GL Entry rows to another account and combines balances; the preview never rewrites ledger rows. The native Account form remains the place to merge on a real site." },
};
export type OpResult = { ok: true; name: string } | { ok: false; error: string };
const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const ROOT_TYPES = ["Asset", "Liability", "Equity", "Income", "Expense"] as const;
export const reportTypeOf = (rootType: string) => (rootType === "Income" || rootType === "Expense" ? "Profit and Loss" : "Balance Sheet");

/** get_autoname_with_number: "<number> - <name> - <abbr>" (number optional). */
export function accountAutoname(accountName: string, accountNumber: string, company: string): string {
  const abbr = s(adapter.get("Company", company)?.["abbr"]);
  const base = accountNumber.trim() ? `${accountNumber.trim()} - ${accountName.trim()}` : accountName.trim();
  return abbr ? `${base} - ${abbr}` : base;
}
const hasGle = (name: string) => adapter.list("GL Entry").some((g) => g["account"] === name);
const children = (name: string) => adapter.list("Account").filter((a) => a["parent_account"] === name);
const numberTaken = (num: string, company: string, except?: string) => adapter.list("Account").find((a) => a["company"] === company && s(a["account_number"]) === num && a.name !== except);
/** Permission gate shared by every operation; returns the frappe PermissionError text instead of throwing. */
function denied(ptype: PType, doc: Doc | undefined, user: string): string | undefined {
  try { assertScoped("Account", ptype, doc, user); return undefined; } catch (e) { return e instanceof Error ? e.message : `No permission to ${ptype} Account`; }
}
/**
 * frappe.model.delete_doc.check_if_doc_is_linked (value-based): any non-cancelled record other than the account and its
 * own GL rows whose field or child-table row holds the account name blocks deletion with the source message.
 */
/** frappe/model/delete_doc.py doctypes_to_skip — log/trail records removed with the document, never blocking. */
const SKIP_LINKED = new Set(["Communication", "ToDo", "DocShare", "Email Unsubscribe", "Activity Log", "File", "Version", "Document Follow", "Comment", "View Log", "Tag Link", "Notification Log", "Email Queue", "Document Share Key", "Integration Request", "Unhandled Email", "Webhook Request Log", "Workspace", "Route History", "Access Log", "Permission Log", "Deleted Document", "Error Log"]);
function linkedFrom(name: string): string | undefined {
  for (const dt of adapter.doctypes()) {
    if (dt === "GL Entry" || SKIP_LINKED.has(dt)) continue;
    for (const d of adapter.list(dt)) {
      if (dt === "Account" && d.name === name) continue;
      if (Number(d["docstatus"]) === 2) continue;
      for (const [k, v] of Object.entries(d)) {
        if (k === "name" || k === "doctype") continue;
        if (v === name || (Array.isArray(v) && v.some((r) => r && typeof r === "object" && Object.values(r as Record<string, unknown>).includes(name)))) return `Cannot delete or cancel because Account ${name} is linked with ${dt} ${d.name}`;
      }
    }
  }
  return undefined;
}
const isDescendant = (candidate: string, of: string): boolean => { for (let p = s(adapter.get("Account", candidate)?.["parent_account"]), guard = 0; p && guard < 100; p = s(adapter.get("Account", p)?.["parent_account"]), guard++) if (p === of) return true; return false; };

export interface NewAccount { account_name: string; account_number?: string | undefined; is_group?: boolean | undefined; root_type?: string | undefined; account_type?: string | undefined; account_category?: string | undefined; tax_rate?: number | undefined; account_currency?: string | undefined; parent_account?: string | undefined; company: string }

/** utils.add_ac + Account.validate: a child inherits root/report type from its parent; a root must be a group with a root type. */
export function addAccount(a: NewAccount, user = currentUser()): OpResult {
  const perm = denied("create", { doctype: "Account", name: "", company: a.company } as Doc, user); if (perm) return { ok: false, error: perm };
  const name0 = s(a.account_name).trim();
  if (!name0) return { ok: false, error: "New Account Name is required" };
  if (!adapter.get("Company", a.company)) return { ok: false, error: `Company ${a.company} does not exist` };
  const parent = a.parent_account ? adapter.get("Account", a.parent_account) : undefined;
  if (a.parent_account && !parent) return { ok: false, error: `Account ${a.parent_account} does not exist` };
  const name = accountAutoname(name0, s(a.account_number), a.company);
  if (adapter.get("Account", name)) return { ok: false, error: `Account ${name} already exists` };
  if (parent) {
    if (!n(parent["is_group"])) return { ok: false, error: `Account ${name}: Parent account ${parent.name} can not be a ledger` };
    if (parent["company"] !== a.company) return { ok: false, error: `Account ${name}: Parent account ${parent.name} does not belong to company: ${a.company}` };
  } else {
    if (!a.is_group) return { ok: false, error: `The root account ${name} must be a group` };
    if (!a.root_type || !(ROOT_TYPES as readonly string[]).includes(a.root_type)) return { ok: false, error: "Root Type is mandatory" };
  }
  const num = s(a.account_number).trim();
  if (num) { const t = numberTaken(num, a.company); if (t) return { ok: false, error: `Account Number ${num} already used in account ${t.name}` }; }
  const rootType = parent ? s(parent["root_type"]) : s(a.root_type);
  const coCur = s(adapter.get("Company", a.company)?.["default_currency"]);
  const doc: Doc = {
    name, doctype: "Account", account_name: name0, account_number: num, company: a.company, parent_account: parent?.name ?? "", is_group: a.is_group ? 1 : 0,
    root_type: rootType, report_type: reportTypeOf(rootType), account_type: a.account_type ?? "", ...(a.account_category ? { account_category: a.account_category } : {}),
    tax_rate: !a.is_group && a.account_type === "Tax" ? n(a.tax_rate) : 0, account_currency: a.account_currency || coCur, freeze_account: "No", disabled: 0,
  };
  adapter.insertDoc("Account", doc);
  return { ok: true, name };
}

/** Account.convert_group_to_ledger */
export function convertGroupToLedger(name: string, user = currentUser()): OpResult {
  const a = adapter.get("Account", name); if (!a) return { ok: false, error: `Account ${name} does not exist` };
  const perm = denied("write", a, user); if (perm) return { ok: false, error: perm };
  if (children(name).length) return { ok: false, error: "Account with child nodes cannot be converted to ledger" };
  if (hasGle(name)) return { ok: false, error: "Account with existing transaction cannot be converted to ledger" };
  if (!a["parent_account"]) return { ok: false, error: `The root account ${name} must be a group` };
  adapter.update("Account", name, { is_group: 0 });
  return { ok: true, name };
}

/** Account.convert_ledger_to_group */
export function convertLedgerToGroup(name: string, user = currentUser()): OpResult {
  const a = adapter.get("Account", name); if (!a) return { ok: false, error: `Account ${name} does not exist` };
  const perm = denied("write", a, user); if (perm) return { ok: false, error: perm };
  if (hasGle(name)) return { ok: false, error: "Account with existing transaction can not be converted to group." };
  if (a["account_type"]) return { ok: false, error: "Cannot covert to Group because Account Type is selected." };
  adapter.update("Account", name, { is_group: 1 });
  return { ok: true, name };
}

/** account.update_account_number: new name/number, unique number per company, renamed through rename_doc (no merge). */
export function updateAccountNumber(name: string, accountName: string, accountNumber: string, user = currentUser()): OpResult {
  const a = adapter.get("Account", name); if (!a) return { ok: false, error: `Account ${name} does not exist` };
  const perm = denied("write", a, user); if (perm) return { ok: false, error: perm };
  const nm = accountName.trim(); if (!nm) return { ok: false, error: "Account Name is required" };
  const num = accountNumber.trim(); const company = s(a["company"]);
  if (num) { const t = numberTaken(num, company, name); if (t) return { ok: false, error: `Account Number ${num} already used in account ${t.name}` }; }
  const next = accountAutoname(nm, num, company);
  if (next !== name && adapter.get("Account", next)) return { ok: false, error: `Account ${next} already exists` };
  adapter.update("Account", name, { account_name: nm, account_number: num });
  if (next === name) return { ok: true, name };
  const r = renameDoc("Account", name, next, { title: nm });
  if (!r.ok) { adapter.update("Account", name, { account_name: s(a["account_name"]), account_number: s(a["account_number"]) }); return { ok: false, error: r.error ?? "Rename failed" }; }
  return { ok: true, name: next };
}

/** frappe treeview "Move to..." + Account.validate_parent / nested-set descendant guard; root/report type follow the parent. */
export function moveAccount(name: string, newParent: string, user = currentUser()): OpResult {
  const a = adapter.get("Account", name); const p = adapter.get("Account", newParent);
  if (!a) return { ok: false, error: `Account ${name} does not exist` };
  const perm = denied("write", a, user); if (perm) return { ok: false, error: perm };
  if (!p) return { ok: false, error: `Account ${newParent} does not exist` };
  if (newParent === name) return { ok: false, error: `Account ${name}: You can not assign itself as parent account` };
  if (!n(p["is_group"])) return { ok: false, error: `Account ${name}: Parent account ${newParent} can not be a ledger` };
  if (p["company"] !== a["company"]) return { ok: false, error: `Account ${name}: Parent account ${newParent} does not belong to company: ${s(a["company"])}` };
  if (isDescendant(newParent, name)) return { ok: false, error: `Item cannot be added to its own descendants` };
  if (hasGle(name) && s(p["root_type"]) !== s(a["root_type"])) return { ok: false, error: "Cannot change Root Type of an account with existing transactions" };
  const rt = s(p["root_type"]);
  adapter.update("Account", name, { parent_account: newParent, root_type: rt, report_type: reportTypeOf(rt) });
  // set_root_and_report_type propagates to descendants of a group
  const walk = (x: string) => { for (const c of children(x)) { adapter.update("Account", c.name, { root_type: rt, report_type: reportTypeOf(rt) }); walk(c.name); } };
  walk(name);
  return { ok: true, name };
}

/** Account.on_trash + NestedSet child check + frappe delete_doc link check. */
export function deleteAccount(name: string, user = currentUser()): OpResult {
  const a = adapter.get("Account", name); if (!a) return { ok: false, error: `Account ${name} does not exist` };
  const perm = denied("delete", a, user); if (perm) return { ok: false, error: perm };
  if (hasGle(name)) return { ok: false, error: "Account with existing transaction can not be deleted" };
  if (children(name).length) return { ok: false, error: `Cannot delete ${name} as it has child nodes` };
  const linked = linkedFrom(name); if (linked) return { ok: false, error: linked };
  adapter.remove("Account", name);
  return { ok: true, name };
}
