/**
 * Shared bank reconciliation pieces (PRO P2, owner 2026-11-17): the reconciliation equation per bank ledger account
 * (رصيد الكشف − الرصيد المسوّى = الفرق, amber when the difference is not zero), the 12-month reconciliation strip per bank
 * account, the amber «تحتاج مطابقة» tag and the 12-month close strip. Figures come from src/lib/coreShared/bankRecon.ts;
 * the Enterprise kit draws them, so the Pro bank page, the shared bank matching page and the close page show one look.
 */
import type { ReactNode } from "react";
import { fmtCurrency, fmtDate } from "@/lib/format";
import type { BankMonthRow, CloseMonth, ReconView } from "@/lib/coreShared/bankRecon";
import { EquationBand, PeriodStrips, type PeriodCell } from "./kit/CostKit";
import { Signed } from "./kit/FinanceKit";

const mLabel = (k: string) => `${k.slice(5, 7)}/${k.slice(2, 4)}`;
const mFull = (k: string) => `${k.slice(5, 7)}/${k.slice(0, 4)}`;
const months = (keys: string[]) => keys.map((k) => ({ key: k, label: mLabel(k), full: mFull(k) }));

/** The amber tag on a statement line that still needs matching. */
export function NeedMatch({ ar }: { ar: boolean }) { return <span className="ek-need-match" data-need-match>{ar ? "تحتاج مطابقة" : "Needs matching"}</span>; }

/** P2-01 — one equation per bank ledger account with imported statement lines (optionally only the account of one bank account). */
export function ReconEquations({ view, ar, bankAccount, onOpenLines }: { view: ReconView; ar: boolean; bankAccount?: string | undefined; onOpenLines?: ((account: string) => void) | undefined }) {
  const t = (en: string, a: string) => (ar ? a : en);
  if (view.status === "denied") return <p className="text-sm text-muted-foreground" data-recon-eq-state="denied">{t("Statement lines or the ledger are not readable for this user.", "بنود الكشف أو دفتر الأستاذ غير متاحة لهذا المستخدم.")}</p>;
  const rows = bankAccount ? view.rows.filter((r) => r.bankAccounts.includes(bankAccount)) : view.rows;
  if (!rows.length) return <p className="text-sm text-muted-foreground" data-recon-eq-state="empty">{t("No bank statement lines are imported for this company yet.", "لم تُستورد بنود كشف بنكي لهذه الشركة بعد.")}</p>;
  return <div className="grid gap-3" data-recon-eqs={rows.length}>
    {rows.map((r) => {
      const m = (v: number) => fmtCurrency(v, r.currency);
      const dep = r.openLines.filter((l) => l.direction === "deposit"), wd = r.openLines.filter((l) => l.direction === "withdrawal");
      const sum = (xs: typeof dep) => xs.reduce((a, l) => a + l.unallocated, 0);
      const zero = Math.abs(r.diff) < 0.005;
      const open = onOpenLines ? (node: ReactNode) => <button type="button" className="hover:underline" onClick={() => onOpenLines(r.account)} data-recon-open={r.account}>{node}</button> : undefined;
      return <div key={r.account} data-recon-eq={r.account} data-statement={r.statement} data-cleared={r.cleared} data-diff={r.diff}>
        <p className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs"><b className="text-sm">{t("Reconciliation", "معادلة المطابقة")}</b><bdi data-no-i18n>{r.account}</bdi>
          <span className="text-muted-foreground">{t("as of", "حتى")} <bdi data-no-i18n>{fmtDate(view.asOf)}</bdi> · {r.bankAccounts.map((b, i) => <span key={b}>{i ? "، " : ""}<bdi data-no-i18n>{b}</bdi></span>)}</span></p>
        <EquationBand
          terms={[
            { key: "statement", label: t("Statement balance", "رصيد الكشف"), display: <Signed text={m(r.statement)} />, sub: <><bdi data-no-i18n>{r.lines.toLocaleString("en-US")}</bdi> {t("statement lines to date", "بند كشف حتى التاريخ")}</> },
            { key: "cleared", op: "−", label: t("Cleared balance", "الرصيد المسوّى"), display: <Signed text={m(r.cleared)} />, sub: <>{t("book balance", "رصيد الدفاتر")} <Signed text={m(r.books)} /> · {t("without entries the bank has not cleared", "دون القيود التي لم تظهر في البنك")}</> },
          ]}
          result={{ key: "diff", label: t("Difference", "الفرق"), display: <Signed text={m(r.diff)} />, tone: zero ? "ok" : "warn", link: zero ? undefined : open }}
          flag={zero ? { label: t("Matched", "مطابق"), display: "✓", negative: false, tone: "ok", sub: t("Every statement line is matched.", "كل بنود الكشف مطابقة.") }
            : { label: t("Needs matching", "تحتاج مطابقة"), display: <>{r.openLines.length.toLocaleString("en-US")} {t("lines", "بند")}</>, negative: false, tone: "warn", link: open,
              sub: <>{t("deposits", "إيداعات")} <bdi data-no-i18n>{dep.length}</bdi> · <Signed text={m(sum(dep))} /> — {t("withdrawals", "سحوبات")} <bdi data-no-i18n>{wd.length}</bdi> · <Signed text={m(-sum(wd))} /></> }}
          note={t("Statement balance = the cleared balance plus the statement lines not matched yet (imported bank statement). The difference becomes 0 when every line is matched. Cleared balance = the standard bank reconciliation statement on this date.",
            "رصيد الكشف = الرصيد المسوّى زائد بنود الكشف التي لم تُطابق بعد (كشف البنك المستورد)، ويصبح الفرق صفرًا عند مطابقة كل البنود. الرصيد المسوّى = كشف مطابقة البنك القياسي في هذا التاريخ.")}
          attrs={{ "data-recon-band": r.account }} />
      </div>;
    })}
    {view.withoutLines.length > 0 && <p className="text-[11px] text-muted-foreground" data-recon-no-lines={view.withoutLines.length}>{t("No imported statement lines yet for", "لا توجد بنود كشف مستوردة بعد لـ")}: <bdi data-no-i18n>{view.withoutLines.join("، ")}</bdi></p>}
  </div>;
}

/** P2-02 — 12-month reconciliation strip, one row per bank account. */
export function ReconStrips({ rows, ar, current, onCell }: { rows: BankMonthRow[]; ar: boolean; current: string; onCell?: ((bankAccount: string, month: string) => void) | undefined }) {
  const t = (en: string, a: string) => (ar ? a : en);
  if (!rows.length) return null;
  const word = (s: PeriodCell["state"]) => s === "approved" ? t("reconciled", "مسوّى") : s === "draft" ? t("open lines", "بنود مفتوحة") : t("no statement lines", "لا بنود كشف");
  return <PeriodStrips months={months(rows[0]!.months.map((x) => x.key))} current={current}
    rows={rows.map((r) => ({ key: r.bankAccount, label: <bdi data-no-i18n title={r.account}>{r.bankAccount}</bdi>, cells: r.months.map((c): PeriodCell => ({ key: c.key, state: c.state,
      title: `${mFull(c.key)} · ${word(c.state)} · ${c.lines} ${t("lines", "بند")}${c.open ? ` · ${c.open} ${t("open", "مفتوح")}` : ""}`,
      ...(onCell && c.lines ? { link: (node: ReactNode) => <button type="button" className="block w-full" onClick={() => onCell(r.bankAccount, c.key)} data-recon-cell={`${r.bankAccount}|${c.key}`}>{node}</button> } : {}) })) }))}
    legend={{ approved: t("reconciled", "مسوّى"), draft: t("open — needs matching", "مفتوح — يحتاج مطابقة"), none: t("not started", "لم يبدأ") }} attrs={{ "data-recon-strip": String(rows.length) }} />;
}

/** P2-02 (close) — 12-month close strip of one company. */
export function CloseStrip({ months: ms, ar, current, label, onCell }: { months: CloseMonth[]; ar: boolean; current: string; label: ReactNode; onCell?: ((periodEnd: string) => void) | undefined }) {
  const t = (en: string, a: string) => (ar ? a : en);
  if (!ms.length) return null;
  const word = (c: CloseMonth) => c.state === "approved" ? (c.stage >= 2 ? t("closed", "مقفل") : t("checklist complete", "اكتملت القائمة")) : c.state === "draft" ? t("closing", "قيد الإقفال") : t("not started", "لم يبدأ");
  return <PeriodStrips months={months(ms.map((x) => x.key))} current={current}
    rows={[{ key: "close", label, cells: ms.map((c): PeriodCell => ({ key: c.key, state: c.state,
      title: `${mFull(c.key)} · ${word(c)}${c.total ? ` · ${c.done}/${c.total} ${t("tasks done", "مهام منجزة")}` : ""} · ${t("stage", "المرحلة")} ${c.stage}/${c.stages}`,
      ...(onCell && (c.total || c.stage) ? { link: (node: ReactNode) => <button type="button" className="block w-full" onClick={() => onCell(c.periodEnd)} data-close-cell={c.periodEnd}>{node}</button> } : {}) })) }]}
    legend={{ approved: t("complete", "مكتمل"), draft: t("closing", "قيد الإقفال"), none: t("not started", "لم يبدأ") }} attrs={{ "data-close-strip": String(ms.length) }} />;
}
