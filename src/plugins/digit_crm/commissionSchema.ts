import type { PluginDocType } from "../types";
import type { DocField } from "@/lib/catalog";
export const STATEMENT = "DIGIT CRM Commission Statement";
export const SETTINGS = "DIGIT CRM Settings";
const f = (fieldname: string, fieldtype: string, options?: string): DocField => ({ fieldname, label: fieldname.replaceAll("_", " "), fieldtype, ...(options ? { options } : {}) });
const permissions = [{ role: "Sales Manager", read: 1, write: 1, create: 1 }, { role: "System Manager", read: 1, write: 1, create: 1 }];
export const commissionTypes: PluginDocType[] = [
  { name: SETTINGS, module: "DIGIT CRM", issingle: 1, fields: [f("commission_expense", "Link", "Account"), f("commission_payable", "Link", "Account")], permissions },
  { name: "DIGIT CRM Commission Line", module: "DIGIT CRM", istable: 1, permissions: [], fields: [f("sales_invoice", "Link", "Sales Invoice"), f("basis", "Currency"), f("rate", "Percent"), f("amount", "Currency")] },
  { name: STATEMENT, module: "DIGIT CRM", autoname: "hash", fields: [f("salesperson", "Link", "Sales Person"), f("company", "Link", "Company"), f("period", "Data"), { ...f("lines", "Table", "DIGIT CRM Commission Line"), read_only: 1 }, { ...f("total", "Currency"), read_only: 1 }, { ...f("journal_entry", "Link", "Journal Entry"), read_only: 1 }], permissions },
];
