/**
 * DIGIT Pro General Ledger controls over the SHARED Core General Ledger runner (src/lib/generalLedger.ts via
 * RUNNERS["General Ledger"]). Pro keeps its URL vocabulary (`group_by` = "Group by …", multi values, check overrides)
 * and maps it onto the Core runner's native filters (`categorize_by` = "Categorize by …"), so the Pro screen and the
 * standard report always run the same engine over the same GL Entry rows. Nothing here computes ledger values.
 */
import { adapter } from "@/lib/adapter";
import { GL_CATEGORIES, list } from "@/lib/generalLedger";
import { RUNNERS, type F, type RFilter, type RResult } from "@/lib/reportRunner";

/** Check options of the native report (general_ledger.js), in source order. */
export const GL_CHECKS = ["include_dimensions", "disable_opening_balance_calculation", "show_opening_entries", "include_default_book_entries", "show_cancelled_entries", "show_net_values_in_party_account", "show_amount_in_company_currency", "add_values_in_transaction_currency", "show_remarks", "ignore_err", "ignore_cr_dr_notes"] as const;
/** Pro `group_by` values ("" = no categorization); each maps 1:1 to a Core `categorize_by` value. */
export const GL_GROUP_BY = ["", ...GL_CATEGORIES.map((c) => c.replace("Categorize by", "Group by"))] as const;

export const toCategorize = (groupBy: string | undefined) => (groupBy ? groupBy.replace("Group by", "Categorize by") : "");
export const toGroupBy = (categorize: string | undefined) => (categorize ? categorize.replace("Categorize by", "Group by") : "");

/** MultiSelectList value → names (JSON array, comma list or one value) — same parser the Core runner uses. */
export const parseMulti = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : list(v === undefined || v === null ? "" : String(v)));
/** Serialise a multi value for a URL/filter: one value stays a plain string so existing drill links keep working. */
export const joinMulti = (xs: string[]): string => (xs.length === 0 ? "" : xs.length === 1 && !xs[0]!.includes(",") ? xs[0]! : JSON.stringify(xs));

const companyCurrency = (c: string) => String(adapter.get("Company", c)?.["default_currency"] ?? "");
/** erpnext.get_presentation_currency_list: company currencies plus currencies used by the company's accounts. */
export function presentationCurrencies(company?: string): string[] {
  const out = new Set<string>();
  for (const c of adapter.list("Company")) if ((!company || c.name === company) && companyCurrency(c.name)) out.add(companyCurrency(c.name));
  for (const a of adapter.list("Account")) if ((!company || a["company"] === company) && a["account_currency"]) out.add(String(a["account_currency"]));
  return ["", ...[...out].sort()];
}

/** Native filter definitions of the shared Core runner (source of truth for the capability gate). */
export const glNativeFilters = (): RFilter[] => RUNNERS["General Ledger"]?.filters ?? [];

/** Runner defaults expressed in Pro vocabulary (`group_by` mirrors the Core `categorize_by` default). */
export function glDefaults(defaults: F): F {
  return { ...defaults, group_by: toGroupBy(defaults["categorize_by"]) };
}

/** Validation stop message (frappe.throw) of a runner result — the Core runner reports it as `error`. */
export const resultMessage = (r: RResult | undefined): string | undefined => r?.error;
/** Currency the amount columns are presented in (Core rows carry `presentation_currency`). */
export const resultCurrency = (r: RResult | undefined): string | undefined => {
  const c = r?.rows.find((x) => x["presentation_currency"])?.["presentation_currency"];
  return c ? String(c) : undefined;
};
