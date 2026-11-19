/**
 * D4-b — "Preview before posting": the exact GL / stock ledger lines a draft would write on submit, read from the same
 * posting.ts builders (glLines → dimensions.offsetLines, slLines) and the budget rule (budget.ts budgetCheck).
 * Read-only: nothing is written here; ledger rows stay written only by posting.ts.
 */
import type { Doc } from "./adapter";
import { budgetCheck, budgetPosition, BUDGET_DOCTYPES, type BudgetPosition } from "./budget";
import { offsetLines } from "./dimensions";
import { GL_DOCTYPES, glLines, slLines, STOCK_DOCTYPES } from "./posting";

export interface PreviewGl { account: string; debit: number; credit: number; party_type?: string | undefined; party?: string | undefined; cost_center?: string | undefined }
export interface PreviewSl { item_code: string; warehouse: string; actual_qty: number }
export interface PostingPreview {
  gl: PreviewGl[]; sl: PreviewSl[];
  /** stock documents value their GL from the moving average at submit time (repost), so it is listed as computed then */
  stockGlAtSubmit: boolean;
  totals: { debit: number; credit: number; balanced: boolean };
  budget: { errors: string[]; warnings: string[]; position: BudgetPosition[] };
}
export const PREVIEW_DOCTYPES = [...new Set([...GL_DOCTYPES.filter((d) => d !== "Period Closing Voucher" && d !== "Process Deferred Accounting"), ...STOCK_DOCTYPES, ...BUDGET_DOCTYPES])];
const r2 = (x: number) => Math.round(x * 100) / 100;

export function postingPreview(dt: string, d: Doc): PostingPreview {
  const gl: PreviewGl[] = GL_DOCTYPES.includes(dt)
    ? offsetLines(d["company"], glLines(dt, d)).map((l) => ({ account: l.account, debit: r2(l.debit), credit: r2(l.credit), party_type: l.party_type || undefined, party: l.party || undefined, cost_center: l.cost_center || undefined }))
    : [];
  const sl = STOCK_DOCTYPES.includes(dt) ? slLines(dt, d).map((s) => ({ item_code: s.item_code, warehouse: s.warehouse, actual_qty: s.actual_qty })) : [];
  const debit = r2(gl.reduce((a, l) => a + l.debit, 0)), credit = r2(gl.reduce((a, l) => a + l.credit, 0));
  const b = BUDGET_DOCTYPES.includes(dt) ? budgetCheck(dt, d) : { errors: [], warnings: [] };
  const position = budgetPosition(dt, d);
  return { gl, sl, stockGlAtSubmit: STOCK_DOCTYPES.includes(dt), totals: { debit, credit, balanced: Math.abs(debit - credit) < 0.005 }, budget: { errors: b.errors, warnings: b.warnings, position } };
}
