/**
 * Safe ledger repost (ERPNext 2026 "Repost Accounting Ledger" with preview, owner gap list B04 / U26F-05). First compare:
 * the voucher's posted ledger rows against what the shared posting logic computes now (posting.ts expectedGl), net per
 * account and party. Only when they differ may an authorised person (submit right on the native "Repost Accounting
 * Ledger" DocType — System Manager by the source permissions) repost; the rewrite itself is
 * posting.ts repostVoucherGl (locked periods and reconciled vouchers refused), and every repost leaves a submitted native
 * Repost Accounting Ledger record plus a timeline note, so who reposted what and why stays auditable.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { expectedGl, GL_DOCTYPES, repostVoucherGl } from "@/lib/posting";
import { currentUser, hasPerm } from "@/lib/session";

type Bi = [string, string];
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;

export const REPOST_DT = "Repost Accounting Ledger";
/** Accounts Settings ▸ Repost Allowed Types default (repost_accounting_ledger.py get_allowed_types_from_settings). */
export const REPOST_TYPES = ["Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry"];
export interface LedgerDiffRow { account: string; party: string; posted: number; expected: number; diff: number }
export interface LedgerCheck { applicable: boolean; matches: boolean; rows: LedgerDiffRow[]; postedCount: number; expectedCount: number }

const key = (account: string, party: string) => `${account}\u0000${party}`;
export function ledgerCheck(dt: string, d: Doc | undefined): LedgerCheck {
  if (!d || n(d.docstatus) !== 1 || !GL_DOCTYPES.includes(dt) || !REPOST_TYPES.includes(dt)) return { applicable: false, matches: true, rows: [], postedCount: 0, expectedCount: 0 };
  const posted = adapter.list("GL Entry").filter((g) => g["voucher_type"] === dt && g["voucher_no"] === d.name && !n(g["is_cancelled"]) && !s(g.name).startsWith(`GLE-${d.name}-S`));
  const expected = expectedGl(dt, d);
  const m = new Map<string, LedgerDiffRow>();
  const at = (a: string, p: string) => { const k = key(a, p); let r = m.get(k); if (!r) { r = { account: a, party: p, posted: 0, expected: 0, diff: 0 }; m.set(k, r); } return r; };
  for (const g of posted) at(s(g["account"]), s(g["party"])).posted += n(g["debit"]) - n(g["credit"]);
  for (const l of expected) at(l.account, l.party).expected += l.debit - l.credit;
  const rows = [...m.values()].map((r) => ({ ...r, posted: r2(r.posted), expected: r2(r.expected), diff: r2(r.expected - r.posted) })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.account.localeCompare(b.account));
  return { applicable: true, matches: rows.every((r) => Math.abs(r.diff) < 0.005), rows, postedCount: posted.length, expectedCount: expected.length };
}

export const mayRepost = (user = currentUser()) => { const m = cachedMeta(REPOST_DT); return !!m && hasPerm(m, "create", undefined, user) && hasPerm(m, "submit", undefined, user); };

export function repostLedger(dt: string, name: string, reason: string, user = currentUser()): { ok: true; record: string } | { ok: false; reason: Bi } {
  const d = adapter.get(dt, name); const chk = ledgerCheck(dt, d);
  if (!chk.applicable) return { ok: false, reason: ["Only a submitted invoice, payment or journal can be reposted.", "يُعاد ترحيل الفاتورة أو الدفعة أو القيد المعتمد فقط."] };
  if (!mayRepost(user)) return { ok: false, reason: ["Only an authorised administrator may repost the ledger.", "إعادة الترحيل لمسؤول النظام المخوّل فقط."] };
  if (chk.matches) return { ok: false, reason: ["The ledger already matches this document; nothing to repost.", "القيود مطابقة لهذا المستند؛ لا حاجة لإعادة الترحيل."] };
  if (!reason.trim()) return { ok: false, reason: ["Write why the ledger is reposted.", "اكتب سبب إعادة الترحيل."] };
  const errs = repostVoucherGl(dt, name);
  if (errs.length) return { ok: false, reason: [errs.join(" "), errs.join(" ")] };
  const rec = adapter.insertDoc(REPOST_DT, { company: d!["company"], delete_cancelled_entries: 0, vouchers: [{ idx: 1, voucher_type: dt, voucher_no: name }], docstatus: 1, owner: user, digit_reason: reason.trim(),
    digit_difference: chk.rows.filter((r) => Math.abs(r.diff) >= 0.005).map((r) => `${r.account}${r.party ? ` (${r.party})` : ""}: ${r.posted} → ${r.expected}`).join("; ") });
  adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: dt, reference_name: name, content: `Ledger reposted (${rec.name}): ${reason.trim()}`, comment_email: user, owner: user });
  return { ok: true, record: rec.name };
}
