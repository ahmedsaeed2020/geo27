/**
 * Answers to the 12 DIGIT Pro executive questions (Run11.1 PART_C_EXECUTIVE_12, EXE-01..12), computed in the preview from
 * the same defined workspace formulas the department pages show (run11Formulas.ts via workspaceSpec), so an executive figure
 * always equals the department figure and drills to the same records. Approval backlog reads the shared approval inbox and
 * close readiness the Core close checklist; nothing is stored.
 */
import { closeProgress, currentClosePeriod } from "@/lib/coreShared/controls";
import { hasPerm } from "@/lib/session";
import { cachedMeta } from "@/lib/catalog";
import { fmtCurrency } from "@/lib/format";
import type { Bi, Drill } from "./command";
import { approvalInbox } from "./policyDefaults";
import { PLACEMENTS } from "./run11";
import { workspaceSpec } from "./run11Formulas";
import { evalKpi, figureText, type SectionCtx } from "./sections";

export interface ExecFigure { key: string; label: Bi; status: "ok" | "empty" | "denied" | "unavailable"; text: string; count: number; drill?: Drill }
/** Question → the workspace placements (same formula, same drill) that answer it. */
export const EXEC_SOURCES: Record<string, string[]> = {
  "EXE-01": ["KPI-SEL-INTEL-01", "KPI-SEL-INTEL-03"],
  "EXE-02": ["KPI-ACC-CASH-01", "KPI-ACC-CASH-03", "KPI-ACC-CASH-04"],
  "EXE-03": ["KPI-SEL-FULFILL-01", "KPI-SEL-FULFILL-03"],
  "EXE-04": ["KPI-SEL-FULFILL-02"],
  "EXE-05": ["KPI-PUR-ORDERS-01", "KPI-PUR-ORDERS-02"],
  "EXE-06": ["KPI-PUR-RECEIVE-01"],
  "EXE-07": ["KPI-INV-MASTER-03", "KPI-INV-MASTER-04", "KPI-INV-REPORT-03"],
  "EXE-08": ["KPI-INV-REPORT-02", "KPI-INV-CONTROL-03"],
  "EXE-09": ["KPI-INV-REPORT-04"],
  "EXE-10": ["KPI-AST-REGISTER-03", "KPI-AST-DEP-02", "KPI-AST-DEP-01"],
  "EXE-11": [],
  "EXE-12": ["KPI-ACC-REPORT-01", "KPI-INV-REPORT-04"],
};

function placementFigure(pid: string, ctx: SectionCtx, user: string, ar: boolean): ExecFigure | undefined {
  const p = PLACEMENTS.find((x) => x.id === pid); if (!p) return undefined;
  const bind = p.binds.find((b) => b.startsWith("kpi:")); if (!bind) return undefined;
  const def = workspaceSpec(p.ws)?.kpis(ctx).find((k) => k.id === bind.slice(4)); if (!def) return undefined;
  const r = evalKpi(def, ctx, user);
  const label: Bi = [p.label?.[0] ?? def.label[0], p.label?.[1] ?? def.label[1]];
  if (r.status === "denied" || r.status === "unavailable") return { key: pid, label, status: r.status, text: "", count: 0 };
  const text = r.figure ? figureText(r.figure, ar) : r.totals.length ? r.totals.map((t) => fmtCurrency(t.amount, t.currency)).join(" · ") : r.count.toLocaleString("en-US");
  return { key: pid, label, status: r.status === "empty" ? "empty" : "ok", text, count: r.count, drill: r.drill };
}

export function execAnswer(id: string, ctx: SectionCtx, user: string, ar: boolean): ExecFigure[] {
  if (id === "EXE-11") {
    const allowed = (dt: string, pt: "read" | "submit", d: Record<string, unknown>) => { const m = cachedMeta(dt); return m ? hasPerm(m, pt, d as never, user) : user === "Administrator"; };
    const items = approvalInbox(user, ctx.company, allowed);
    const old = items.filter((i) => i.modified && Date.parse(ctx.asOf) - Date.parse(i.modified.slice(0, 10)) > 3 * 864e5).length;
    return [
      { key: "inbox", label: ["Waiting for you", "بانتظارك"], status: items.length ? "ok" : "empty", text: items.length.toLocaleString("en-US"), count: items.length, drill: { kind: "pro", to: "/pro/dashboard", search: { company: ctx.company } } },
      { key: "inbox-old", label: ["Older than 3 days", "أقدم من 3 أيام"], status: old ? "ok" : "empty", text: old.toLocaleString("en-US"), count: old, drill: { kind: "pro", to: "/pro/dashboard", search: { company: ctx.company } } },
    ];
  }
  const out = (EXEC_SOURCES[id] ?? []).map((pid) => placementFigure(pid, ctx, user, ar)).filter((x): x is ExecFigure => !!x);
  if (id === "EXE-12") {
    const cm = cachedMeta("Digit Close Task"); if (!(cm ? hasPerm(cm, "read", undefined, user) : user === "Administrator")) return out;
    const pe = currentClosePeriod(ctx.company); const cp = closeProgress(ctx.company, pe || undefined);
    out.unshift({ key: "close", label: ["Close checklist done", "إنجاز قائمة الإقفال"], status: cp.total ? "ok" : "empty", text: `${cp.done}/${cp.total} (${cp.pct}%)`, count: cp.total, drill: { kind: "list", doctype: "Digit Close Task", filters: [["company", "=", ctx.company], ...(pe ? [["period_end", "=", pe] as [string, string, string]] : [])] } });
  }
  return out;
}
