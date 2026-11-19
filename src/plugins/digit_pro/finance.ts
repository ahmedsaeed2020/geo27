/**
 * DIGIT Pro Finance Batch 01 — read-only selectors over Core records (SC-F-01/02/03).
 * Every value is read from the canonical adapter through src/lib/scope.ts (role perms, if_owner, User Permission).
 * Nothing is posted, balanced or stored here; GL rows come from the Core General Ledger runner (src/lib/reportRunner.ts).
 * A source the user may not read returns status "denied"; a source whose meta is missing returns "unavailable".
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { canReadType, scopedList } from "@/lib/scope";
import { runnerDefaults } from "@/lib/reportRunner";
import { currentUser, hasPerm, type PType } from "@/lib/session";
import { plainMoney } from "@/lib/format";

export const FINANCE_DOCTYPES = ["Company", "Fiscal Year", "Account", "GL Entry", "Journal Entry", "Payment Entry", "Sales Invoice", "Purchase Invoice", "ToDo", "Report"];
export const slug = (dt: string) => dt.toLowerCase().replace(/[^a-z0-9]+/g, "_");
export const appOf = (dt: string) => (dt === "ToDo" ? "frappe" : "erpnext");
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
export const todayIso = () => new Date().toISOString().slice(0, 10);

export type SourceStatus = "ok" | "denied" | "unavailable";
export function sourceStatus(dt: string, user = currentUser()): SourceStatus {
  if (!cachedMeta(dt) && user !== "Administrator") return "unavailable";
  return canReadType(dt, user) ? "ok" : "denied";
}
export function can(dt: string, ptype: PType, doc?: Doc, user = currentUser()): boolean {
  const m = cachedMeta(dt); if (!m) return user === "Administrator";
  return hasPerm(m, ptype, doc, user);
}

// ---------- context ----------
/** Core user-default company (Global Defaults), unless it has no ledger activity — then the company with most GL Entries. */
function defaultCompany(companies: string[]): string {
  const gd = runnerDefaults("General Ledger")["company"] ?? "";
  const cnt = new Map<string, number>(); for (const g of adapter.list("GL Entry")) cnt.set(String(g["company"]), (cnt.get(String(g["company"])) ?? 0) + 1);
  if (gd && cnt.get(gd)) return gd;
  return [...companies].sort((a, b) => (cnt.get(b) ?? 0) - (cnt.get(a) ?? 0))[0] ?? gd;
}
export interface FinanceContext { companies: string[]; company: string; currency: string; fiscalYear?: { name: string; start: string; end: string } }
export function financeContext(company?: string, user = currentUser()): FinanceContext {
  const companies = scopedList("Company", user).map((c) => c.name);
  const co = company && companies.includes(company) ? company : defaultCompany(companies);
  const cdoc = adapter.get("Company", co);
  const t = todayIso();
  const fys = scopedList("Fiscal Year", user).filter((y) => !n(y["disabled"]));
  const fy = fys.find((y) => String(y["year_start_date"]) <= t && String(y["year_end_date"]) >= t)
    ?? [...fys].sort((a, b) => String(b["year_end_date"]).localeCompare(String(a["year_end_date"])))[0];
  return { companies, company: companies.includes(co) ? co : companies[0] ?? "", currency: String(cdoc?.["default_currency"] ?? ""),
    ...(fy ? { fiscalYear: { name: fy.name, start: String(fy["year_start_date"]), end: String(fy["year_end_date"]) } } : {}) };
}

// ---------- SC-F-01 work queue (PAT-06 exception-first) ----------
export type QueueKind = "unbalanced_je" | "draft_je" | "draft_pe" | "overdue_si" | "overdue_pi" | "todo";
export interface QueueItem { kind: QueueKind; severity: "high" | "medium" | "low"; doctype: string; name: string; date: string; party?: string; amount?: number; currency?: string; reference?: { doctype: string; name: string } }
export interface QueueSource { kind: QueueKind; doctype: string; status: SourceStatus; items: QueueItem[] }

const coOk = (d: Doc, company: string) => !company || !d["company"] || d["company"] === company;
export function workQueue(company: string, user = currentUser()): QueueSource[] {
  const t = todayIso();
  const src = (kind: QueueKind, dt: string, pick: (rows: Doc[]) => QueueItem[]): QueueSource => {
    const status = sourceStatus(dt, user);
    return { kind, doctype: dt, status, items: status === "ok" ? pick(scopedList(dt, user).filter((d) => coOk(d, company))) : [] };
  };
  const je = (rows: Doc[]) => rows.filter((d) => n(d.docstatus) === 0);
  return [
    src("unbalanced_je", "Journal Entry", (rows) => je(rows).filter((d) => Math.abs(n(d["total_debit"]) - n(d["total_credit"])) > 0.005)
      .map((d) => ({ kind: "unbalanced_je", severity: "high", doctype: "Journal Entry", name: d.name, date: String(d["posting_date"] ?? ""), amount: r2(n(d["total_debit"]) - n(d["total_credit"])) }))),
    src("overdue_si", "Sales Invoice", (rows) => rows.filter((d) => n(d.docstatus) === 1 && n(d["outstanding_amount"]) > 0 && d["due_date"] && String(d["due_date"]) < t)
      .map((d) => ({ kind: "overdue_si", severity: "high", doctype: "Sales Invoice", name: d.name, date: String(d["due_date"]), party: String(d["customer"] ?? ""), amount: r2(n(d["outstanding_amount"])), currency: String(d["currency"] ?? "") }))),
    src("overdue_pi", "Purchase Invoice", (rows) => rows.filter((d) => n(d.docstatus) === 1 && n(d["outstanding_amount"]) > 0 && d["due_date"] && String(d["due_date"]) < t)
      .map((d) => ({ kind: "overdue_pi", severity: "medium", doctype: "Purchase Invoice", name: d.name, date: String(d["due_date"]), party: String(d["supplier"] ?? ""), amount: r2(n(d["outstanding_amount"])), currency: String(d["currency"] ?? "") }))),
    src("draft_je", "Journal Entry", (rows) => je(rows).filter((d) => Math.abs(n(d["total_debit"]) - n(d["total_credit"])) <= 0.005)
      .map((d) => ({ kind: "draft_je", severity: "medium", doctype: "Journal Entry", name: d.name, date: String(d["posting_date"] ?? ""), amount: r2(n(d["total_debit"])) }))),
    src("draft_pe", "Payment Entry", (rows) => rows.filter((d) => n(d.docstatus) === 0)
      .map((d) => ({ kind: "draft_pe", severity: "low", doctype: "Payment Entry", name: d.name, date: String(d["posting_date"] ?? ""), party: String(d["party"] ?? ""), amount: r2(n(d["paid_amount"])) }))),
    src("todo", "ToDo", (rows) => rows.filter((d) => d["status"] === "Open" && d["allocated_to"] === user && FINANCE_DOCTYPES.includes(String(d["reference_type"] ?? "")))
      .map((d) => ({ kind: "todo", severity: "low", doctype: "ToDo", name: d.name, date: String(d["date"] ?? ""), reference: { doctype: String(d["reference_type"]), name: String(d["reference_name"] ?? "") } }))),
  ].map((s) => ({ ...s, items: s.items.sort((a, b) => a.date.localeCompare(b.date)) }));
}

// ---------- verified summaries (sums of Core-owned fields only) ----------
export interface Summary { key: string; label: string; status: SourceStatus; value?: number; count?: number; source: string }
export function financeSummaries(company: string, user = currentUser()): Summary[] {
  const gl = sourceStatus("GL Entry", user), acc = sourceStatus("Account", user);
  const cashAcc = acc === "ok" ? new Set(scopedList("Account", user).filter((a) => a["company"] === company && ["Bank", "Cash"].includes(String(a["account_type"])) && !n(a["is_group"])).map((a) => a.name)) : new Set<string>();
  const cash = gl === "ok" && acc === "ok" ? r2(scopedList("GL Entry", user).filter((g) => g["company"] === company && !n(g["is_cancelled"]) && cashAcc.has(String(g["account"]))).reduce((s, g) => s + n(g["debit"]) - n(g["credit"]), 0)) : undefined;
  const outs = (dt: string) => { const st = sourceStatus(dt, user); if (st !== "ok") return { st }; const r = scopedList(dt, user).filter((d) => d["company"] === company && n(d.docstatus) === 1 && n(d["outstanding_amount"]) > 0); return { st, v: r2(r.reduce((s, d) => s + n(d["outstanding_amount"]), 0)), c: r.length }; };
  const si = outs("Sales Invoice"), pi = outs("Purchase Invoice");
  const status = (a: SourceStatus, b: SourceStatus = "ok"): SourceStatus => (a !== "ok" ? a : b);
  return [
    { key: "cash", label: "Cash and bank balance", status: status(gl, acc), ...(cash !== undefined ? { value: cash, count: cashAcc.size } : {}), source: "GL Entry · Bank/Cash accounts" },
    { key: "receivable", label: "Receivables outstanding", status: si.st, ...(si.v !== undefined ? { value: si.v, count: si.c } : {}), source: "Sales Invoice · outstanding_amount" },
    { key: "payable", label: "Payables outstanding", status: pi.st, ...(pi.v !== undefined ? { value: pi.v, count: pi.c } : {}), source: "Purchase Invoice · outstanding_amount" },
  ];
}

// ---------- SC-F-02 chart of accounts ----------
export interface AccNode { doc: Doc; name: string; parent: string; depth: number; children: AccNode[]; balance: number; /** own balance in account currency (ledger accounts), as account_tree.js shows for foreign-currency accounts */ balanceAc?: number }
export function accountTree(company: string, user = currentUser()): { roots: AccNode[]; byName: Map<string, AccNode>; glReadable: boolean } {
  const rows = scopedList("Account", user).filter((a) => !company || a["company"] === company);
  const byName = new Map<string, AccNode>(rows.map((d) => [d.name, { doc: d, name: d.name, parent: String(d["parent_account"] ?? ""), depth: 0, children: [], balance: 0 }]));
  const roots: AccNode[] = [];
  for (const a of byName.values()) { const p = byName.get(a.parent); if (p) p.children.push(a); else roots.push(a); }
  const ORDER = ["Asset", "Liability", "Equity", "Income", "Expense"];
  const sortK = (x: AccNode) => `${String(x.doc["account_number"] ?? "").padStart(8, "0")}|${x.name}`;
  const glReadable = sourceStatus("GL Entry", user) === "ok";
  const own = new Map<string, number>();
  const ownAc = new Map<string, number>();
  if (glReadable) for (const g of scopedList("GL Entry", user)) if (!n(g["is_cancelled"]) && (!company || g["company"] === company)) { own.set(String(g["account"]), (own.get(String(g["account"])) ?? 0) + n(g["debit"]) - n(g["credit"])); ownAc.set(String(g["account"]), (ownAc.get(String(g["account"])) ?? 0) + n(g["debit_in_account_currency"] ?? g["debit"]) - n(g["credit_in_account_currency"] ?? g["credit"])); }
  const walk = (a: AccNode, d: number): number => { a.depth = d; a.children.sort((x, y) => sortK(x).localeCompare(sortK(y))); a.balance = r2((own.get(a.name) ?? 0) + a.children.reduce((s, c) => s + walk(c, d + 1), 0)); if (!a.children.length && ownAc.has(a.name)) a.balanceAc = r2(ownAc.get(a.name)!); return a.balance; };
  roots.sort((x, y) => (ORDER.indexOf(String(x.doc["root_type"])) - ORDER.indexOf(String(y.doc["root_type"]))) || sortK(x).localeCompare(sortK(y)));
  roots.forEach((r) => walk(r, 0));
  return { roots, byName, glReadable };
}
/**
 * account_tree.js (erpnext@7b5179f) onload: tree balances render only when the user can read GL Entry AND
 * Accounts Settings.show_balance_in_coa is set (Check, default 1). Returns "show" | "hidden" (setting off) | "denied".
 */
export function coaBalanceMode(glReadable: boolean): "show" | "hidden" | "denied" {
  if (!glReadable) return "denied";
  const v = adapter.get("Accounts Settings", "Accounts Settings")?.["show_balance_in_coa"];
  return v === undefined || v === null || v === "" || Number(v) !== 0 ? "show" : "hidden";
}
/** Names matching the search (name, account name, number) plus all their ancestors, so matches keep their hierarchy. */
export function accountMatches(byName: Map<string, AccNode>, q: string, rootType: string, showDisabled: boolean): Set<string> | null {
  const s = q.trim().toLowerCase();
  if (!s && !rootType && showDisabled) return null;
  const keep = new Set<string>();
  for (const a of byName.values()) {
    if (!showDisabled && n(a.doc["disabled"])) continue;
    if (rootType && a.doc["root_type"] !== rootType) continue;
    if (s && ![a.name, a.doc["account_name"], a.doc["account_number"]].some((v) => String(v ?? "").toLowerCase().includes(s))) continue;
    for (let x: AccNode | undefined = a; x && !keep.has(x.name); x = byName.get(x.parent)) keep.add(x.name);
  }
  return keep;
}

/** CSV of the GL rows exactly as rendered (export action is offered only with GL Entry export permission). */
export function toCsv(cols: { fieldname: string; label: string }[], rows: Record<string, unknown>[]): string {
  const q = (v: unknown) => { const s = v === undefined || v === null ? "" : plainMoney(String(v)); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map((c) => q(c.label)).join(","), ...rows.map((r) => cols.map((c) => q(r[c.fieldname])).join(","))].join("\n");
}
