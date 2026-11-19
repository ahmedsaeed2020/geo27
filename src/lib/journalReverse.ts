/**
 * Port of erpnext/accounts/doctype/journal_entry/journal_entry.py make_reverse_journal_entry (journal_entry.js
 * "Reverse Journal Entry", Actions group, shown for a submitted entry that is not itself a reversal).
 * get_mapped_doc copies the header (no_copy fields left out), swaps debit/credit on every account row through the
 * source field_map, keeps reference_type / reference_name, and post_process sets reversal_of. The result is a draft:
 * nothing is posted until the user submits it through the normal posting engine.
 */
import { adapter, type Doc } from "./adapter";

const today = () => new Date().toISOString().slice(0, 10);
type Row = Record<string, unknown>;

/** Header fields get_mapped_doc carries over (Journal Entry fields without no_copy that describe the entry). */
const HEADER = ["voucher_type", "company", "finance_book", "multi_currency", "is_opening", "remark", "pay_to_recd_from", "letter_head", "select_print_heading", "mode_of_payment", "apply_tds", "tax_withholding_category"] as const;
/** Account-row fields copied as is (source field_map keeps currency, rate and the reference). */
const ROW = ["account", "account_type", "party_type", "party", "cost_center", "project", "account_currency", "exchange_rate", "bank_account", "reference_type", "reference_name", "reference_due_date"] as const;

/** Rows of the reversal: every debit becomes a credit and vice versa, in company and account currency. */
export function reverseRows(rows: Row[]): Row[] {
  return rows.map((r, i) => {
    const out: Row = { idx: i + 1 };
    for (const f of ROW) if (r[f] !== undefined && r[f] !== null && r[f] !== "") out[f] = r[f];
    out["debit_in_account_currency"] = Number(r["credit_in_account_currency"] ?? r["credit"] ?? 0) || 0;
    out["credit_in_account_currency"] = Number(r["debit_in_account_currency"] ?? r["debit"] ?? 0) || 0;
    out["debit"] = Number(r["credit"] ?? 0) || 0;
    out["credit"] = Number(r["debit"] ?? 0) || 0;
    return out;
  });
}

/** Mapped draft fields (no insert): what the Reverse Journal Entry action opens. */
export function reverseJournalDraft(src: Doc, on = today()): Row {
  const head: Row = {};
  for (const f of HEADER) if (src[f] !== undefined && src[f] !== null && src[f] !== "") head[f] = src[f];
  return { ...head, posting_date: on, reversal_of: src.name, accounts: reverseRows((src["accounts"] as Row[] | undefined) ?? []) };
}

/** Validations of make_reverse_journal_entry: the source must be submitted and not already reversed by a submitted entry. */
export function reverseJournalErrors(src: Doc | undefined): string[] {
  if (!src) return ["Journal Entry not found"];
  if (Number(src.docstatus ?? 0) !== 1) return ["Journal Entry must be submitted"];
  if (src["reversal_of"]) return ["This Journal Entry is already a reversal"];
  const done = adapter.list("Journal Entry").find((j) => j["reversal_of"] === src.name && Number(j.docstatus ?? 0) === 1);
  if (done) return [`A Reverse Journal Entry ${done.name} already exists for this Journal Entry.`];
  return [];
}

/** Creates the reversal as a draft Journal Entry and returns its name. */
export function makeReverseJournal(name: string, on = today()): string {
  const src = adapter.get("Journal Entry", name);
  const e = reverseJournalErrors(src); if (e.length) throw new Error(e.join("\n"));
  return adapter.insertDoc("Journal Entry", { ...reverseJournalDraft(src!, on), docstatus: 0 }).name;
}
