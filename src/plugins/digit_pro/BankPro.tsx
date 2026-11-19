// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * SC-F-08 Bank Reconciliation — statement lines (native Bank Transaction) vs candidate native Payment Entries; matching is user-confirmed only.
 * RXP-02: exception classes explain why a line is not cleanly reconciled, a bank-account filter scopes the lines, and a
 * side-by-side comparison shows date / amount / reference of the line against one candidate. Nothing is matched automatically.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { useState } from "react";
import { toast } from "sonner";
import { adapter, DocValidationError } from "@/lib/adapter";
import { fmtCurrency, fmtCurrencyPlain, fmtDate } from "@/lib/format";
import { scopedList } from "@/lib/scope";
import { unreconcileTransaction } from "@/lib/reconciliation";
import { useLang } from "@/i18n";
import { Signed } from "@/components/enterprise/kit/FinanceKit";
import { allocatePatch, bankCandidates, bankExceptionCounts, bankLines, BANK_EXCEPTIONS, classifyBankLines, compareLine, matchesBankException, STALE_DAYS, type BankException, type Classified } from "./bank";
import { can, financeContext, slug, sourceStatus, todayIso } from "./finance";
import { ProFrame, SourceState } from "./ProFrame";
import { inPeriod } from "./closeReview";
import { DateInput } from "@/components/form/DateInput";
import { bankMonths, monthEndOf, reconAccounts } from "@/lib/coreShared/bankRecon";
import * as BK from "@/lib/coreShared/bankControls";
import { exportExcel } from "@/lib/dashboards/exportBlock";
import { NeedMatch, ReconEquations, ReconStrips } from "@/components/enterprise/BankRecon";
import { SelectionBar } from "@/components/enterprise/kit/ReconKit";

export interface BankSearch { company?: string | undefined; status?: string | undefined; sel?: string | undefined; ex?: string | undefined; account?: string | undefined; cand?: string | undefined; from_date?: string | undefined; to_date?: string | undefined }
const REASON_AR: Record<string, string> = { "Amount matches": "المبلغ مطابق", "Partial amount": "مبلغ جزئي", "Reference matches": "المرجع مطابق", "Within 7 days": "خلال 7 أيام" };
const isEx = (v: string | undefined): v is BankException => !!v && (BANK_EXCEPTIONS as readonly string[]).includes(v);

const EX_TEXT: Record<BankException, [string, string, string, string]> = {
  inconsistent: ["Marked reconciled, amount unallocated", "مسوّاة شكليًا ومبلغها غير مخصص", "The native controller sets Reconciled only when the whole amount is allocated to vouchers. Check the Bank Transaction.", "المتحكم الأصلي يضع حالة «مسوّاة» فقط عند تخصيص كامل المبلغ لمستندات. راجع المعاملة البنكية."],
  partial: ["Partly allocated", "مخصصة جزئيًا", "Some vouchers are allocated but part of the amount is still open.", "خُصصت بعض المستندات وما زال جزء من المبلغ مفتوحًا."],
  ambiguous: ["Several exact-amount payments", "عدة دفعات بالمبلغ نفسه", "Two or more posted payments have exactly this amount. Choose the right one by date and reference.", "دفعتان مرحّلتان أو أكثر بالمبلغ نفسه تمامًا. اختر الصحيحة حسب التاريخ والمرجع."],
  nomatch: ["No exact-amount payment", "لا توجد دفعة بالمبلغ نفسه", "No posted, uncleared payment of this company and direction has this amount. A payment may be missing or split.", "لا توجد دفعة مرحّلة غير مسوّاة لهذه الشركة والاتجاه بهذا المبلغ. قد تكون الدفعة مفقودة أو مجزأة."],
  single: ["One exact-amount payment", "دفعة واحدة بالمبلغ نفسه", "One posted payment has exactly this amount. Compare date and reference, then confirm.", "دفعة مرحّلة واحدة بالمبلغ نفسه تمامًا. قارن التاريخ والمرجع ثم أكّد."],
  stale: [`Older than ${STALE_DAYS} days`, `أقدم من ${STALE_DAYS} يومًا`, `Open statement lines dated more than ${STALE_DAYS} days ago.`, `بنود كشف مفتوحة يزيد عمرها عن ${STALE_DAYS} يومًا.`],
};

export function BankPro({ search }: { search: BankSearch }) {
  const nav = useNavigate();
  const ar = useLang() === "ar"; const t = (en: string, arabic: string) => (ar ? arabic : en);
  const set = (p: Partial<BankSearch>) => void nav({ to: "/pro/bank-reconciliation", search: (prev: BankSearch) => ({ ...prev, ...p }) as never, replace: true });
  // P2-03: rows picked for a bulk action (page state only; every action re-reads the records and asks for confirmation)
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <ProFrame title="Bank Reconciliation" subtitle="Match bank statement lines to posted payments — you confirm every match." doctypes={["Bank Account"]}>
      {({ user }) => {
        const ctx = financeContext(search.company, user);
        if (!ctx.companies.length) return <SourceState status={sourceStatus("Company", user) === "ok" ? "empty" : "denied"} doctype="Company" />;
        const st = sourceStatus("Bank Transaction", user);
        if (st !== "ok") return <SourceState status={st} doctype="Bank Transaction" />;
        const all = scopedList("Bank Transaction", user);
        const peOk = sourceStatus("Payment Entry", user) === "ok";
        const pes = peOk ? scopedList("Payment Entry", user) : [];
        const dated = !!(search.from_date || search.to_date);
        const companyLines = bankLines(all, ctx.company).filter((l) => !dated || inPeriod(l.date, search.from_date, search.to_date));
        const accounts = [...new Set(companyLines.map((l) => l.account).filter(Boolean))].sort();
        const account = search.account && accounts.includes(search.account) ? search.account : undefined;
        const scoped = account ? companyLines.filter((l) => l.account === account) : companyLines;
        const classified = classifyBankLines(scoped, pes, all, todayIso(), peOk);
        const exCounts = bankExceptionCounts(classified);
        const ex = isEx(search.ex) ? search.ex : undefined;
        const status = ex ? undefined : search.status === "all" ? undefined : search.status ?? "Unreconciled";
        const rows: Classified[] = ex ? classified.filter((c) => matchesBankException(c, ex)) : classified.filter((c) => !status || c.line.status === status);
        const sel = (rows.find((c) => c.line.name === search.sel) ?? rows[0])?.line;
        const selC = sel ? classified.find((c) => c.line.name === sel.name) : undefined;
        const cands = sel && sel.unallocated > 0.005 && sel.status !== "Reconciled" && peOk ? bankCandidates(sel, pes, all) : [];
        const cand = cands.find((c) => c.name === search.cand) ?? cands[0];
        const canWrite = can("Bank Transaction", "write");
        const isOpen = (l: { status: string; unallocated: number }) => l.status !== "Reconciled" && l.status !== "Cancelled" && l.unallocated > 0.005;
        const openShown = rows.filter(({ line: l }) => isOpen(l)).map(({ line: l }) => l.name);
        const cur = (l: { doc: Record<string, unknown> }) => String(l.doc["currency"] || ctx.currency || "");
        const money = (v: number, c = ctx.currency) => (c ? fmtCurrency(v, c) : v.toLocaleString("en-US", { minimumFractionDigits: 2 }));
        const un = scoped.filter((l) => l.status === "Unreconciled"), re = scoped.filter((l) => l.status === "Reconciled");
        const unTotals = [...new Set(un.map(cur))].map((c) => ({ c, v: un.filter((l) => cur(l) === c).reduce((s, l) => s + l.unallocated, 0) }));
        const write = (p: Record<string, unknown>, ok: string) => { try { adapter.update("Bank Transaction", sel!.name, p); toast.success(ok); } catch (e) { toast.error(e instanceof DocValidationError ? e.errors.join("\n") : String(e)); } };
        const chip = (on: boolean, label: string, v: string | undefined, key: string) => <button key={key} type="button" aria-pressed={on} className={`dp-chip ${on ? "dp-chip-on" : ""}`} onClick={() => set({ status: v, ex: undefined, sel: undefined, cand: undefined })} data-dp-bank-status={key}>{label}</button>;
        const exLabel = (k: BankException) => EX_TEXT[k][ar ? 1 : 0];
        return <>
          <section className="dp-context" data-dp-context>
            <label className="dp-ctx-item"><span>{t("Company", "الشركة")}</span>
              <select className="field-input" value={ctx.company} onChange={(e) => set({ company: e.target.value, account: undefined, sel: undefined, cand: undefined })} data-no-i18n>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="dp-ctx-item"><span>{t("Bank Account", "الحساب البنكي")}</span>
              <select className="field-input max-w-[16rem]" value={account ?? ""} onChange={(e) => set({ account: e.target.value || undefined, sel: undefined, cand: undefined })} data-dp-bank-account><option value="">{t("All accounts", "كل الحسابات")}</option>{accounts.map((a) => <option key={a} value={a} data-no-i18n>{a}</option>)}</select></label>
            <label className="dp-ctx-item"><span>{t("From Date", "من تاريخ")}</span><DateInput className="field-input" value={search.from_date ?? ""} onChange={(e) => set({ from_date: e.target.value || undefined, sel: undefined, cand: undefined })} data-dp-bank-from /></label>
            <label className="dp-ctx-item"><span>{t("To Date", "إلى تاريخ")}</span><DateInput className="field-input" value={search.to_date ?? ""} onChange={(e) => set({ to_date: e.target.value || undefined, sel: undefined, cand: undefined })} data-dp-bank-to /></label>
            <div className="flex flex-wrap gap-1">{chip(!ex && status === "Unreconciled", t("Unreconciled", "غير مسوّاة"), undefined, "Unreconciled")}{chip(!ex && status === "Reconciled", t("Reconciled", "مسوّاة"), "Reconciled", "Reconciled")}{chip(!ex && !status, t("All", "الكل"), "all", "all")}</div>
            <div className="ms-auto flex gap-2">
              <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "bank_transaction" }} className="btn-ghost">Standard list</Link>
              <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "bank_reconciliation_tool" }} className="btn-ghost">Bank Reconciliation Tool</Link>
            </div>
          </section>

          {(() => {
            // P2-01 / P2-02: statement − cleared = difference per bank ledger account, and the 12-month strip per bank account
            const asOf = search.to_date || todayIso();
            const toLines = () => { set({ status: undefined, ex: undefined, sel: undefined, cand: undefined }); setTimeout(() => document.querySelector("[data-dp-bank-lines]")?.scrollIntoView({ block: "start", behavior: "smooth" }), 60); };
            return <section className="mt-4 grid gap-3" data-dp-bank-recon>
              <ReconEquations view={reconAccounts(ctx.company, asOf, user)} ar={ar} bankAccount={account} onOpenLines={toLines} />
              <div className="ek-card ek-card-pad" data-dp-bank-months>
                <h2 className="mb-2 text-sm font-semibold">{t("Reconciliation by month — last 12 months", "المطابقة حسب الشهر — آخر 12 شهرًا")}</h2>
                <ReconStrips rows={bankMonths(ctx.company, todayIso(), user)} ar={ar} current={todayIso().slice(0, 7)}
                  onCell={(ba, k) => set({ account: accounts.includes(ba) ? ba : undefined, from_date: `${k}-01`, to_date: monthEndOf(k), status: "all", ex: undefined, sel: undefined, cand: undefined })} />
                <p className="mt-1 text-[11px] text-muted-foreground">{t("Select a month to list its statement lines.", "اختر شهرًا لعرض بنود كشفه.")}</p>
              </div>
            </section>;
          })()}

          <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4" data-dp-bank-kpis>
            <div className="ek-kpi-tile" data-tone={un.length ? "warn" : undefined}><p className="text-xs text-muted-foreground">{t("Unreconciled", "غير مسوّاة")}</p><p className="mt-1 text-lg font-semibold tabular-nums" data-no-i18n>{un.length}</p></div>
            <div className="ek-kpi-tile"><p className="text-xs text-muted-foreground">{t("Unallocated amount", "المبلغ غير المخصص")}</p>{unTotals.length ? unTotals.map((x) => <p key={x.c} className="mt-1 text-lg font-semibold tabular-nums" data-no-i18n>{money(x.v, x.c)}</p>) : <p className="mt-1 text-lg font-semibold" data-no-i18n>—</p>}</div>
            <div className="ek-kpi-tile"><p className="text-xs text-muted-foreground">{t("Reconciled", "مسوّاة")}</p><p className="mt-1 text-lg font-semibold tabular-nums" data-no-i18n>{re.length}</p></div>
            <div className="dp-card"><p className="text-xs text-muted-foreground">{t("Source", "المصدر")}</p><p className="mt-1 text-sm">{t("Bank Transaction · Payment Entry", "بنود كشف البنك · سندات الدفع")}</p></div>
          </section>

          <section className="mt-4" aria-labelledby="dp-bank-ex-h" data-dp-bank-exceptions>
            <h2 id="dp-bank-ex-h" className="text-sm font-semibold">{t("Why lines are not reconciled", "لماذا لم تُسوَّ البنود")}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {BANK_EXCEPTIONS.map((k) => { const on = ex === k; return <button key={k} type="button" aria-pressed={on} disabled={!exCounts[k] && !on} title={EX_TEXT[k][ar ? 3 : 2]} className={`dp-chip ${on ? "dp-chip-on" : ""} disabled:opacity-50`} onClick={() => set({ ex: on ? undefined : k, sel: undefined, cand: undefined })} data-dp-bank-ex={k}>
                <span>{exLabel(k)}</span> <b className="tabular-nums" data-no-i18n>{exCounts[k]}</b></button>; })}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{ex ? EX_TEXT[ex][ar ? 3 : 2] : t("Classes are explanations for review; matching is always confirmed by a person on native records.", "التصنيفات شروحات للمراجعة؛ المطابقة يؤكدها شخص دائمًا على المستندات الأصلية.")}{!peOk && <> {t("Payment Entries are not readable, so candidate-based classes cannot be determined.", "قيود الدفع غير مقروءة، لذا لا يمكن تحديد التصنيفات المعتمدة على المرشحين.")}</>}</p>
          </section>

          <div className="mt-4 grid gap-4">
            <section className="dp-card overflow-x-auto p-0" data-dp-bank-lines={rows.length}>
              {!rows.length ? <div className="p-6"><SourceState status="empty" /></div> :
                <EntTable id="pro-bank-rows" wrap><table className="w-full whitespace-nowrap text-sm">
                  <thead><tr className="border-b border-border text-xs text-muted-foreground"><th scope="col" className="w-8 ps-3"><input type="checkbox" aria-label={t("Select all open lines shown", "تحديد كل البنود المفتوحة المعروضة")} checked={openShown.length > 0 && openShown.every((n) => picked.includes(n))} disabled={!openShown.length || !canWrite} onChange={(e) => setPicked(e.target.checked ? [...new Set([...picked, ...openShown])] : picked.filter((n) => !openShown.includes(n)))} data-dp-bank-pick-all /></th><th scope="col" className="px-3 py-2 text-start">{t("Date", "التاريخ")}</th><th scope="col" className="text-start">{t("Description", "الوصف")}</th><th scope="col" className="px-2 text-start">{t("Review", "المراجعة")}</th><th scope="col" className="px-2 text-end">{t("Amount", "المبلغ")}</th><th scope="col" className="px-3 text-end">{t("Unallocated", "غير مخصص")}</th></tr></thead>
                  <tbody>{rows.map(({ line: l, ex: cls, stale, age }) => <tr key={l.name} tabIndex={0} aria-selected={sel?.name === l.name} className={`dp-row cursor-pointer border-b border-border ${sel?.name === l.name ? "dp-row-on" : ""}`} onClick={() => set({ sel: l.name, cand: undefined })} onKeyDown={(e) => { if (e.key === "Enter") set({ sel: l.name, cand: undefined }); }} data-dp-bank-line={l.name} data-dp-bank-class={cls ?? "ok"}>
                    <td className="ps-3" onClick={(e) => e.stopPropagation()}>{isOpen(l) && canWrite && <input type="checkbox" aria-label={`${t("Select", "تحديد")} ${l.name}`} checked={picked.includes(l.name)} onChange={(e) => setPicked(e.target.checked ? [...picked, l.name] : picked.filter((n) => n !== l.name))} data-dp-bank-pick={l.name} />}</td>
                    <td className="px-3 py-2 tabular-nums" data-no-i18n>{fmtDate(l.date)}</td>
                    <td className="max-w-[12rem] truncate px-2" data-no-i18n title={l.description}>{l.description}</td>
                    <td className="px-2 text-xs">{isOpen(l) && <span className="me-1"><NeedMatch ar={ar} /></span>}{cls ? <span className={`chip text-[11px] ${cls === "inconsistent" || cls === "nomatch" ? "bg-destructive/10 text-destructive" : cls === "single" ? "bg-success/15 text-success-text" : "bg-warning/20"}`}>{exLabel(cls)}</span> : <span className="text-success-text">{t("Reconciled", "مسوّاة")}</span>}{stale && <span className="chip ms-1 inline-flex gap-1 bg-muted text-[11px]" title={EX_TEXT.stale[ar ? 3 : 2]}><bdi data-no-i18n>{age}</bdi><span>{t("days", "يومًا")}</span></span>}</td>
                    <td className="px-2 text-end tabular-nums"><span className={`me-1 text-[11px] ${l.direction === "deposit" ? "text-success-text" : "text-muted-foreground"}`}>{l.direction === "deposit" ? t("Deposit", "إيداع") : t("Withdrawal", "سحب")}</span><bdi data-no-i18n>{money(l.amount, cur(l))}</bdi></td>
                    <td className={`px-3 text-end tabular-nums ${l.unallocated > 0.005 ? "font-semibold text-destructive" : "text-success-text"}`} data-no-i18n>{money(l.unallocated, cur(l))}</td></tr>)}</tbody>
                </table></EntTable>}
            </section>
            {(() => {
              const chosen = picked.map((n) => companyLines.find((l) => l.name === n)).filter((l): l is NonNullable<typeof l> => !!l && isOpen(l));
              if (!chosen.length) return null;
              const exact = chosen.flatMap((l) => { const c = classified.find((x) => x.line.name === l.name); return c?.ex === "single" ? [l] : []; });
              const ruled = chosen.filter((l) => BK.ruleFor(l.doc));
              const total = chosen.reduce((a, l) => a + (l.direction === "deposit" ? l.unallocated : -l.unallocated), 0);
              const matchExact = () => {
                if (!confirm(t(`Match ${exact.length} line(s) to their single exact-amount payment?`, `مطابقة ${exact.length} بند مع الدفعة الوحيدة بالمبلغ نفسه لكل منها؟`))) return;
                let ok = 0; const errs: string[] = [];
                adapter.batch(() => { for (const l of exact) {
                  const fresh = bankLines(scopedList("Bank Transaction", user), ctx.company).find((x) => x.name === l.name);
                  const c = fresh && bankCandidates(fresh, scopedList("Payment Entry", user), scopedList("Bank Transaction", user)).find((x) => Math.abs(x.amount - fresh.unallocated) < 0.005);
                  if (!fresh || !c) { errs.push(l.name); continue; }
                  try { adapter.update("Bank Transaction", l.name, allocatePatch(fresh, c)); ok++; } catch (e) { errs.push(`${l.name}: ${e instanceof DocValidationError ? e.errors.join(" ") : String(e)}`); }
                } });
                if (ok) toast.success(t(`${ok} line(s) matched.`, `طوبق ${ok} بند.`)); if (errs.length) toast.error(errs.join("\n"));
                setPicked(picked.filter((n) => !exact.some((l) => l.name === n)));
              };
              const applyRules = () => {
                if (!confirm(t(`Book and match ${ruled.length} line(s) by their bank rule?`, `ترحيل ومطابقة ${ruled.length} بند حسب قاعدته البنكية؟`))) return;
                let ok = 0; const errs: string[] = [];
                for (const l of ruled) { const r = BK.applyBankRule(l.name, user); if (r.ok) ok++; else errs.push(`${l.name}: ${ar ? r.reason[1] : r.reason[0]}`); }
                if (ok) toast.success(t(`${ok} line(s) booked and matched.`, `رُحّل وطوبق ${ok} بند.`)); if (errs.length) toast.error(errs.join("\n"));
                setPicked(picked.filter((n) => !ruled.some((l) => l.name === n)));
              };
              const exportSel = () => exportExcel(`bank_lines_${ctx.company}`, [[t("Line", "البند"), t("Date", "التاريخ"), t("Bank account", "الحساب البنكي"), t("Description", "الوصف"), t("Direction", "الاتجاه"), t("Amount", "المبلغ"), t("Open amount", "المبلغ المفتوح")],
                ...chosen.map((l) => [l.name, l.date, l.account, l.description, l.direction === "deposit" ? t("Deposit", "إيداع") : t("Withdrawal", "سحب"), fmtCurrencyPlain(l.amount, cur(l)), fmtCurrencyPlain(l.unallocated, cur(l))])]);
              const allOpen = rows.filter(({ line: l }) => isOpen(l)).map(({ line: l }) => l.name);
              return <SelectionBar count={chosen.length} ar={ar} onClear={() => setPicked([])} attrs={{ "data-dp-bank-selbar": String(chosen.length) }}
                total={<>{t("Open amount", "المبلغ المفتوح")} <Signed text={money(total)} /></>}
                onAll={allOpen.length > chosen.length ? () => setPicked([...new Set([...picked, ...allOpen])]) : undefined} allLabel={<>{t("Select all", "تحديد الكل")} (<bdi data-no-i18n>{allOpen.length}</bdi>)</>}
                actions={[
                  { key: "match", primary: true, label: <>{t("Match exact payments", "مطابقة الدفعات المطابقة تمامًا")} (<bdi data-no-i18n>{exact.length}</bdi>)</>, disabled: !exact.length, hint: t("Only lines with exactly one posted payment of the same amount.", "فقط البنود التي لها دفعة مرحّلة واحدة بالمبلغ نفسه."), onClick: matchExact },
                  { key: "rules", label: <>{t("Apply bank rules", "تطبيق القواعد البنكية")} (<bdi data-no-i18n>{ruled.length}</bdi>)</>, disabled: !ruled.length, onClick: applyRules },
                  { key: "export", label: t("Export selected", "تصدير المحدد"), onClick: exportSel },
                ]} />;
            })()}

            <aside className="dp-card" data-dp-bank-detail={sel?.name ?? ""}>
              {!sel ? <SourceState status="empty" /> : <>
                <div className="flex flex-wrap items-center gap-2">
                  <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "bank_transaction", name: sel.name }} className="font-semibold hover:underline" data-no-i18n>{sel.name}</Link>
                  <span className={`chip ${sel.status === "Reconciled" ? "bg-success/15 text-success-text" : "bg-warning/20"}`}>{sel.status === "Reconciled" ? t("Reconciled", "مسوّاة") : t("Unreconciled", "غير مسوّاة")}</span>
                  <span className="ms-auto text-xs text-muted-foreground" data-no-i18n>{sel.account}</span>
                </div>
                {selC?.ex && <p className="mt-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs" data-dp-bank-explain={selC.ex}><b>{exLabel(selC.ex)}</b> — {EX_TEXT[selC.ex][ar ? 3 : 2]}</p>}
                <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-[11px] text-muted-foreground">{t("Amount", "المبلغ")}</dt><dd className="font-semibold tabular-nums" data-no-i18n>{money(sel.amount, cur(sel))}</dd></div>
                  <div><dt className="text-[11px] text-muted-foreground">{t("Allocated", "المخصص")}</dt><dd className="font-semibold tabular-nums" data-no-i18n>{money(sel.allocated, cur(sel))}</dd></div>
                  <div><dt className="text-[11px] text-muted-foreground">{t("Unallocated", "غير مخصص")}</dt><dd className="font-semibold tabular-nums" data-no-i18n data-dp-bank-unalloc={sel.unallocated}>{money(sel.unallocated, cur(sel))}</dd></div>
                </dl>
                {sel.allocated > 0 && <div className="mt-3"><h3 className="text-sm font-semibold">{t("Matched vouchers", "المستندات المطابقة")}</h3>
                  <ul className="mt-1 flex flex-wrap gap-2 text-xs">{((sel.doc["payment_entries"] as Record<string, unknown>[] | undefined) ?? []).map((r, i) => <li key={i}><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(String(r["payment_document"] ?? "Payment Entry")), name: String(r["payment_entry"]) }} className="chip bg-accent hover:underline" data-no-i18n>{String(r["payment_entry"])} · {money(Number(r["allocated_amount"]) || 0, cur(sel))}</Link></li>)}</ul>
                  {canWrite && <button type="button" className="btn-ghost mt-2 text-xs" onClick={() => { if (confirm(t("Unreconcile Transaction?", "إلغاء تسوية المعاملة؟"))) { unreconcileTransaction(sel.name); toast.success(t("Bank Transaction unreconciled", "أُلغيت تسوية المعاملة البنكية")); } }} data-dp-bank-unreconcile>{t("Unreconcile Transaction", "إلغاء تسوية المعاملة")}</button>}
                </div>}
                {sel.unallocated > 0.005 && sel.status !== "Reconciled" && <div className="mt-3" data-dp-bank-cands={cands.length}>
                  <h3 className="text-sm font-semibold">{t("Candidate payments", "الدفعات المرشحة")}</h3>
                  <p className="text-xs text-muted-foreground">{t("Same company and direction, posted, not yet cleared. Hints only — nothing is matched automatically. Journal Entry and paid-invoice candidates need the server tool.", "نفس الشركة والاتجاه، مرحّلة وغير مسوّاة بعد. تلميحات فقط — لا تتم أي مطابقة تلقائيًا. مرشحو القيود والفواتير المدفوعة يحتاجون أداة الخادم.")}</p>
                  {!peOk ? <SourceState status="denied" doctype="Payment Entry" /> : !cands.length ? <p className="mt-2 text-xs text-muted-foreground">{t("Nothing to show", "لا توجد بيانات")}</p> : <>
                    <ul className="mt-2 divide-y divide-border">{cands.slice(0, 12).map((c) => { const on = cand?.name === c.name; return <li key={c.name} className={`flex flex-wrap items-center gap-2 py-2 text-sm ${on ? "dp-row-on" : ""}`} data-dp-bank-cand={c.name}>
                      <button type="button" aria-pressed={on} className="text-xs underline-offset-2 hover:underline" onClick={() => set({ cand: c.name })} data-dp-bank-compare={c.name}>{t("Compare", "قارن")}</button>
                      <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "payment_entry", name: c.name }} className="font-medium hover:underline" data-no-i18n>{c.name}</Link>
                      <span className="text-xs text-muted-foreground tabular-nums" data-no-i18n>{c.date}</span>
                      <span className="text-xs" data-no-i18n>{c.party}</span>
                      <span className="flex flex-wrap gap-1">{c.reasons.map((r) => <span key={r} className="chip bg-success/15 text-[11px] text-success-text">{ar ? REASON_AR[r] ?? r : r}</span>)}</span>
                      <span className="ms-auto tabular-nums" data-no-i18n>{money(c.amount, cur(sel))}</span>
                      {canWrite && <button type="button" className="btn-primary py-0.5 text-xs" onClick={() => write(allocatePatch(sel, c), t("Reconciled", "تمت التسوية"))} data-dp-bank-match={c.name}>{t("Match", "مطابقة")}</button>}
                    </li>; })}</ul>
                    {cand && <table className="mt-3 w-full text-xs" data-dp-bank-compare-table={cand.name}>
                      <caption className="mb-1 text-start text-sm font-semibold">{t("Statement line vs payment", "بند الكشف مقابل الدفعة")} · <bdi data-no-i18n>{cand.name}</bdi></caption>
                      <thead><tr className="text-muted-foreground"><th scope="col" className="py-1 text-start">{t("Field", "الحقل")}</th><th scope="col" className="py-1 text-start">{t("Statement line", "بند الكشف")}</th><th scope="col" className="py-1 text-start">{t("Payment Entry", "قيد الدفع")}</th><th scope="col" className="py-1 text-start">{t("Result", "النتيجة")}</th></tr></thead>
                      <tbody>{compareLine(sel, cand).map((r) => <tr key={r.field} className="border-t border-border" data-dp-bank-cmp={r.field} data-ok={r.ok ? "1" : "0"}>
                        <th scope="row" className="py-1 text-start font-normal">{r.field === "date" ? t("Date", "التاريخ") : r.field === "amount" ? t("Amount", "المبلغ") : t("Reference", "المرجع")}</th>
                        <td className="max-w-[10rem] truncate py-1 tabular-nums" title={r.line} data-no-i18n>{r.line || "—"}</td>
                        <td className="max-w-[10rem] truncate py-1 tabular-nums" title={r.payment} data-no-i18n>{r.payment || "—"}</td>
                        <td className={`py-1 ${r.ok ? "text-success-text" : "text-destructive"}`}>{r.ok ? t("Matches", "مطابق") : r.field === "date" ? <>{t("Days apart", "فرق الأيام")} <bdi data-no-i18n>{r.note}</bdi></> : r.field === "amount" ? <>{t("Difference", "الفرق")} <bdi data-no-i18n>{r.note}</bdi></> : t("Not found", "غير موجود")}</td>
                      </tr>)}</tbody>
                    </table>}
                  </>}
                </div>}
              </>}
            </aside>
          </div>
        </>;
      }}
    </ProFrame>
  );
}
