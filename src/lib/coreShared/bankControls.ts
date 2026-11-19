/**
 * DIGIT shared Core bank matching (Part B: F5-b, F6-b, CF-03).
 *  - Bank rules (Core "Digit Bank Rule": bank account, words in the description, direction, party or account, priority):
 *    the first enabled rule that fits a statement line names who it is; applying it books the native voucher (Payment
 *    Entry for a party, Journal Entry for an account) and allocates it to the Bank Transaction.
 *  - Match suggestions: posted, uncleared Payment Entries on the line's bank GL account in the same direction, scored by
 *    amount, reference and date (Control Policy "bank match days"), never matched without a person confirming.
 *  - Matched-by stamp: every allocation added to (or removed from) a Bank Transaction — by this screen, the Pro bank
 *    reconciliation, the native tool or an import — writes a "Digit Bank Match" row with who, when, how and which rule.
 */
import { adapter, registerDocHook, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { currentUser, hasPerm } from "@/lib/session";
import { CORE_DT } from "./doctypes";
import { controlPolicy } from "./controls";
import { newVoucher } from "./finance";

export type Bi = [string, string];
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (d: Doc | undefined, f: string) => (Array.isArray(d?.[f]) ? (d![f] as Doc[]) : []);
const nowIso = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const days = (a: string, b: string) => Math.abs(Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000));
const can = (dt: string, p: "read" | "write" | "create" | "submit", user = currentUser(), d?: Doc) => { const m = cachedMeta(dt); return m ? hasPerm(m, p, d, user) : user === "Administrator"; };

export const btAmount = (bt: Doc) => r2(n(bt["deposit"]) || n(bt["withdrawal"]));
export const btDirection = (bt: Doc): "Deposit" | "Withdrawal" => (n(bt["deposit"]) > 0 ? "Deposit" : "Withdrawal");
const glOf = (bt: Doc) => s(adapter.get("Bank Account", s(bt["bank_account"]))?.["account"]);
const btCompany = (bt: Doc) => s(bt["company"]) || s(adapter.get("Bank Account", s(bt["bank_account"]))?.["company"]);
const text = (bt: Doc) => `${s(bt["description"])} ${s(bt["reference_number"])}`.toLowerCase();

/* ------------------------------------------------------------------ rules ------------------------------------------------------------------ */
export function bankRules(bankAccount = ""): Doc[] {
  return adapter.list(CORE_DT.bankRule).filter((r) => n(r["enabled"] ?? 1) && (!s(r["bank_account"]) || !bankAccount || r["bank_account"] === bankAccount))
    .sort((a, b) => n(a["priority"] ?? 10) - n(b["priority"] ?? 10) || a.name.localeCompare(b.name));
}
/** The first enabled rule (by priority) whose bank account, direction and description words fit the statement line. */
export function ruleFor(bt: Doc): Doc | undefined {
  const dir = btDirection(bt); const tx = text(bt);
  return bankRules(s(bt["bank_account"])).find((r) => (!s(r["bank_account"]) || r["bank_account"] === bt["bank_account"]) && (s(r["direction"]) || "Any") !== (dir === "Deposit" ? "Withdrawal" : "Deposit")
    && !!s(r["description_contains"]).trim() && tx.includes(s(r["description_contains"]).trim().toLowerCase()) && (!!s(r["party"]) || !!s(r["account"])));
}

/* ------------------------------------------------------------------ suggestions ------------------------------------------------------------------ */
export interface MatchSuggestion { doctype: "Payment Entry"; name: string; amount: number; date: string; party: string; reference: string; score: number; reasons: Bi[] }
const allocatedElsewhere = (bt: string) => { const used = new Set<string>(); for (const x of adapter.list("Bank Transaction")) if (x.name !== bt && n(x.docstatus) !== 2) for (const r of rows(x, "payment_entries")) used.add(`${s(r["payment_document"])}:${s(r["payment_entry"])}`); return used; };

export function matchSuggestions(bt: Doc, limit = 5): MatchSuggestion[] {
  const gl = glOf(bt); if (!gl) return [];
  const dir = btDirection(bt); const amt = r2(n(bt["unallocated_amount"]) || btAmount(bt)); const date = s(bt["date"]); const tx = text(bt);
  const windowDays = Math.max(1, controlPolicy(btCompany(bt)).bank_match_days); const rule = ruleFor(bt);
  const used = allocatedElsewhere(bt.name); const own = new Set(rows(bt, "payment_entries").map((r) => `${s(r["payment_document"])}:${s(r["payment_entry"])}`));
  const out: MatchSuggestion[] = [];
  for (const pe of adapter.list("Payment Entry")) {
    if (n(pe.docstatus) !== 1 || s(pe["clearance_date"]) || used.has(`Payment Entry:${pe.name}`) || own.has(`Payment Entry:${pe.name}`)) continue;
    if (dir === "Deposit" ? pe["paid_to"] !== gl : pe["paid_from"] !== gl) continue;
    const pa = r2(dir === "Deposit" ? n(pe["received_amount"]) || n(pe["paid_amount"]) : n(pe["paid_amount"]));
    const reasons: Bi[] = []; let score = 0;
    if (Math.abs(pa - amt) < 0.005) { score += 50; reasons.push(["Amount matches", "المبلغ مطابق"]); } else if (pa < amt) { score += 15; reasons.push(["Partial amount", "مبلغ جزئي"]); } else continue;
    const ref = s(pe["reference_no"]); if (ref && tx.includes(ref.toLowerCase())) { score += 30; reasons.push(["Reference matches", "المرجع مطابق"]); }
    const gap = date && s(pe["posting_date"]) ? days(date, s(pe["posting_date"])) : 99;
    if (gap <= windowDays) { score += Math.max(5, 20 - gap * 3); reasons.push([`Within ${windowDays} days`, `خلال ${windowDays} أيام`]); }
    if (rule && s(rule["party"]) && pe["party"] === rule["party"]) { score += 10; reasons.push(["Party of the bank rule", "طرف قاعدة البنك"]); }
    out.push({ doctype: "Payment Entry", name: pe.name, amount: pa, date: s(pe["posting_date"]), party: s(pe["party_name"]) || s(pe["party"]), reference: ref, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

/* ------------------------------------------------------------------ allocate + stamp ------------------------------------------------------------------ */
let pending: { method: "Bank rule" | "Suggestion" | "Manual"; rule?: string; user?: string } | null = null;

function allocate(bt: Doc, doctype: string, name: string, amount: number, how: NonNullable<typeof pending>): { ok: true } | { ok: false; reason: Bi } {
  pending = how;
  try { adapter.update("Bank Transaction", bt.name, { payment_entries: [...rows(bt, "payment_entries"), { payment_document: doctype, payment_entry: name, allocated_amount: amount }] }); }
  catch (e) { return { ok: false, reason: [String((e as Error).message), String((e as Error).message)] }; }
  finally { pending = null; }
  return { ok: true };
}

/** Confirm one suggestion: allocate the payment to the statement line (up to what is still open). */
export function acceptSuggestion(btName: string, payment: string, user = currentUser()): { ok: true } | { ok: false; reason: Bi } {
  const bt = adapter.get("Bank Transaction", btName); if (!bt) return { ok: false, reason: ["Bank transaction not found.", "الحركة البنكية غير موجودة."] };
  if (!can("Bank Transaction", "write", user, bt)) return { ok: false, reason: ["You may not reconcile bank transactions.", "لا يحق لك تسوية الحركات البنكية."] };
  const sug = matchSuggestions(bt, 50).find((x) => x.name === payment); if (!sug) return { ok: false, reason: ["This payment is no longer a match for the line.", "لم تعد هذه الدفعة مطابقة للبند."] };
  return allocate(bt, "Payment Entry", payment, Math.min(sug.amount, r2(n(bt["unallocated_amount"]) || btAmount(bt))), { method: "Suggestion", user });
}

/** Apply the line's bank rule: book the native voucher for what is still open and allocate it, stamped with the rule. */
export function applyBankRule(btName: string, user = currentUser()): { ok: true; doctype: string; name: string } | { ok: false; reason: Bi } {
  const bt = adapter.get("Bank Transaction", btName); if (!bt) return { ok: false, reason: ["Bank transaction not found.", "الحركة البنكية غير موجودة."] };
  if (n(bt.docstatus) !== 1) return { ok: false, reason: ["Submit the bank transaction first.", "اعتمد الحركة البنكية أولًا."] };
  if (!can("Bank Transaction", "write", user, bt)) return { ok: false, reason: ["You may not reconcile bank transactions.", "لا يحق لك تسوية الحركات البنكية."] };
  const rule = ruleFor(bt); if (!rule) return { ok: false, reason: ["No bank rule fits this line.", "لا تنطبق أي قاعدة بنكية على هذا البند."] };
  const amt = r2(n(bt["unallocated_amount"]) || btAmount(bt)); if (amt <= 0) return { ok: false, reason: ["This line is already fully reconciled.", "هذا البند مسوّى بالكامل."] };
  const company = btCompany(bt); const co = adapter.get("Company", company); const gl = glOf(bt); const cur = s(co?.["default_currency"]) || "SAR";
  if (!gl) return { ok: false, reason: ["The bank account has no ledger account.", "الحساب البنكي غير مربوط بحساب في الدفتر."] };
  const dep = btDirection(bt) === "Deposit"; const date = s(bt["date"]) || new Date().toISOString().slice(0, 10); const ref = s(bt["reference_number"]) || bt.name;
  let r: { name?: string; errors: string[] }; let dt: string;
  if (s(rule["party"])) {
    dt = "Payment Entry"; const pt = s(rule["party_type"]) || "Customer"; const partyAcc = pt === "Customer" ? s(co?.["default_receivable_account"]) : s(co?.["default_payable_account"]);
    const pname = s(adapter.get(pt, s(rule["party"]))?.[pt === "Customer" ? "customer_name" : "supplier_name"]) || s(rule["party"]);
    if (!can("Payment Entry", "submit", user)) return { ok: false, reason: ["You may not submit payments.", "لا يحق لك اعتماد المدفوعات."] };
    r = newVoucher("Payment Entry", { payment_type: dep ? "Receive" : "Pay", company, posting_date: date, party_type: pt, party: s(rule["party"]), party_name: pname, paid_from: dep ? partyAcc : gl, paid_to: dep ? gl : partyAcc,
      paid_amount: amt, received_amount: amt, paid_from_account_currency: cur, paid_to_account_currency: cur, source_exchange_rate: 1, target_exchange_rate: 1, reference_no: ref, reference_date: date, mode_of_payment: "Wire Transfer", remarks: `Bank rule ${s(rule["rule_name"]) || rule.name}` }, { submit: true, user });
  } else {
    dt = "Journal Entry"; const cc = s(co?.["cost_center"]);
    if (!can("Journal Entry", "submit", user)) return { ok: false, reason: ["You may not submit journal entries.", "لا يحق لك اعتماد القيود."] };
    const line = (account: string, dr: number, cr: number, idx: number) => ({ idx, account, debit: dr, credit: cr, debit_in_account_currency: dr, credit_in_account_currency: cr, ...(cc ? { cost_center: cc } : {}) });
    r = newVoucher("Journal Entry", { company, posting_date: date, voucher_type: "Bank Entry", cheque_no: ref, cheque_date: date, user_remark: `Bank rule ${s(rule["rule_name"]) || rule.name}: ${s(bt["description"])}`, total_debit: amt, total_credit: amt,
      accounts: dep ? [line(gl, amt, 0, 1), line(s(rule["account"]), 0, amt, 2)] : [line(s(rule["account"]), amt, 0, 1), line(gl, 0, amt, 2)] }, { submit: true, user });
  }
  if (!r.name || r.errors.length) return { ok: false, reason: [r.errors.join("\n") || "The voucher could not be booked.", r.errors.join("\n") || "تعذر ترحيل المستند."] };
  const a = allocate(adapter.get("Bank Transaction", btName)!, dt, r.name, amt, { method: "Bank rule", rule: rule.name, user });
  return a.ok ? { ok: true, doctype: dt, name: r.name } : a;
}

/** Apply every fitting rule to the open lines of one bank account (or all); returns what was booked and what was refused. */
export function applyAllRules(company: string, user = currentUser()): { booked: { line: string; doctype: string; name: string }[]; refused: { line: string; reason: Bi }[] } {
  const booked: { line: string; doctype: string; name: string }[] = []; const refused: { line: string; reason: Bi }[] = [];
  for (const bt of openLines(company)) { if (!ruleFor(bt)) continue; const r = applyBankRule(bt.name, user); if (r.ok) booked.push({ line: bt.name, doctype: r.doctype, name: r.name }); else refused.push({ line: bt.name, reason: r.reason }); }
  return { booked, refused };
}
export const openLines = (company: string) => adapter.list("Bank Transaction").filter((b) => n(b.docstatus) === 1 && btCompany(b) === company && n(b["unallocated_amount"] ?? btAmount(b)) > 0.005 && s(b["status"]) !== "Reconciled")
  .sort((a, b) => s(b["date"]).localeCompare(s(a["date"])) || a.name.localeCompare(b.name));

export const matchStamps = (bt: string) => adapter.list(CORE_DT.bankMatch).filter((m) => m["bank_transaction"] === bt).sort((a, b) => s(b["matched_on"]).localeCompare(s(a["matched_on"])) || b.name.localeCompare(a.name));

let hooked = false;
export function registerBankMatchHooks() {
  if (hooked) return; hooked = true;
  registerDocHook("Bank Transaction", (doc: Doc, before?: Doc) => ({ doc, after: (x: Doc) => {
    const demo = x["__synthetic"] && !pending ? { __synthetic: 1 } : {}; // a stamp written while demo lines are seeded is demo data too
    const key = (r: Doc) => `${s(r["payment_document"])}:${s(r["payment_entry"])}`;
    const prev = new Map(rows(before, "payment_entries").map((r) => [key(r), r])); const now = new Map(rows(x, "payment_entries").map((r) => [key(r), r]));
    const how = pending ?? { method: "Manual" as const };
    for (const [k, r] of now) if (!prev.has(k)) adapter.insertDoc(CORE_DT.bankMatch, { bank_transaction: x.name, payment_document: s(r["payment_document"]), payment_entry: s(r["payment_entry"]), allocated_amount: n(r["allocated_amount"]),
      method: how.method, ...(how.rule ? { rule: how.rule } : {}), matched_by: how.user ?? currentUser(), matched_on: nowIso(), status: "Matched", ...demo });
    for (const k of prev.keys()) if (!now.has(k)) for (const st of matchStamps(x.name).filter((m) => `${s(m["payment_document"])}:${s(m["payment_entry"])}` === k && m["status"] === "Matched")) adapter.update(CORE_DT.bankMatch, st.name, { status: "Unmatched" });
  } }));
}
