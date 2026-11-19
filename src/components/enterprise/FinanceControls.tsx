/**
 * DIGIT Enterprise shared finance controls (Part B): bank rules + match suggestions + matched-by stamps
 * (src/lib/coreShared/bankControls.ts), allocation rules, ZATCA reconciliation and closing-voucher correction
 * (src/lib/coreShared/closeControls.ts). Logic lives in the Core modules; every app's forms and pages reuse these.
 */
import { useState } from "react";
import { DateInput } from "@/components/form/DateInput";
import { toast } from "sonner";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { canReadType, useScopeMetas } from "@/lib/scope";
import { hasPerm, useSessionUser } from "@/lib/session";
import { CORE_DT } from "@/lib/coreShared/doctypes";
import * as BK from "@/lib/coreShared/bankControls";
import * as CL from "@/lib/coreShared/closeControls";
import { STATUS_LABEL } from "@/lib/coreShared/providers";
import { EntFrame } from "./Surfaces";
import { Bar, CompanySelect, Denied, DocLink, Field, Kpi, Table, money, pick, today, tr, useCompany, useT } from "./FinanceDesk";
import { bankMonths, reconAccounts } from "@/lib/coreShared/bankRecon";
import { exportExcel } from "@/lib/dashboards/exportBlock";
import { fmtCurrencyPlain, fmtDate } from "@/lib/format";
import { NeedMatch, ReconEquations, ReconStrips } from "./BankRecon";
import { SelectionBar } from "./kit/ReconKit";
import { Signed } from "./kit/FinanceKit";

const cur = (company: string) => String(adapter.get("Company", company)?.["default_currency"] ?? "SAR");
const METHOD_AR: Record<string, string> = { "Bank rule": "قاعدة بنكية", Suggestion: "اقتراح", Manual: "يدوي" };

/* ------------------------------------------------------------------ bank matching ------------------------------------------------------------------ */
function Stamps({ bt }: { bt: string }) {
  const { ar, t } = useT(); const list = BK.matchStamps(bt);
  if (!list.length) return <p className="text-xs text-muted-foreground" data-bank-stamps={0}>{t("No allocation stamped yet.", "لا توجد مطابقة مختومة بعد.")}</p>;
  return <ul className="space-y-1 text-xs" data-bank-stamps={list.length}>{list.map((m) => <li key={m.name} className="flex flex-wrap gap-2" data-bank-stamp={String(m["method"])} data-status={String(m["status"])}>
    <DocLink dt={String(m["payment_document"])} name={String(m["payment_entry"])} />
    <span className="ent-mint-chip">{ar ? METHOD_AR[String(m["method"])] ?? String(m["method"]) : String(m["method"])}</span>
    <span data-no-i18n>{String(m["matched_by"] ?? "")}</span><span className="tabular-nums text-muted-foreground" data-no-i18n>{String(m["matched_on"] ?? "")}</span>
    {m["status"] === "Unmatched" && <span className="ent-qv-status ent-qv-tone-bad">{t("Unmatched", "أُلغيت المطابقة")}</span>}
  </li>)}</ul>;
}

export function BankMatchPanel({ doc }: { doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  if (Number(doc.docstatus ?? 0) !== 1) return null;
  const meta = cachedMeta("Bank Transaction"); const canWrite = !!meta && hasPerm(meta, "write", doc, user);
  const open = Number(doc["unallocated_amount"] ?? BK.btAmount(doc)) > 0.005; const rule = BK.ruleFor(doc); const sug = open ? BK.matchSuggestions(doc) : []; const c = String(doc["company"] ?? "");
  const apply = () => { const r = BK.applyBankRule(doc.name, user); if (r.ok) toast.success(t(`${r.name} booked and matched.`, `رُحّل ${r.name} وطوبق.`)); else toast.error(pick(ar, r.reason)); };
  const accept = (p: string) => { const r = BK.acceptSuggestion(doc.name, p, user); if (r.ok) toast.success(t("Matched.", "تمت المطابقة.")); else toast.error(pick(ar, r.reason)); };
  return <EntFrame id="bank-match" title={t("Bank matching", "المطابقة البنكية")} note={t("Bank rules name who a line is from; suggestions are confirmed by a person; every allocation is stamped with who matched it and how.", "تحدد القواعد البنكية مصدر البند؛ تُعتمد الاقتراحات من شخص؛ وتُختم كل مطابقة بمن طابقها وكيف.")}>
    <div className="space-y-3">
      {open && <div className="flex flex-wrap items-center gap-2 text-sm" data-bank-rule={rule?.name ?? ""}>
        <span className="text-muted-foreground">{t("Bank rule", "القاعدة البنكية")}:</span>
        {rule ? <><DocLink dt={CORE_DT.bankRule} name={rule.name}>{String(rule["rule_name"] ?? rule.name)}</DocLink><span className="text-xs text-muted-foreground" data-no-i18n>{String(rule["party"] || rule["account"] || "")}</span>
          {canWrite && <button type="button" className="btn-primary" data-bank-apply-rule onClick={apply}>{t("Apply rule", "تطبيق القاعدة")}</button>}</> : <span className="text-xs text-muted-foreground">{t("No rule fits this line.", "لا تنطبق قاعدة على هذا البند.")}</span>}
      </div>}
      {open && (sug.length ? <Table id="bank-suggestions" head={[t("Payment", "الدفعة"), t("Party", "الطرف"), t("Date", "التاريخ"), t("Amount", "المبلغ"), t("Why", "السبب"), t("Score", "الدرجة"), ""]}>
        {sug.map((x) => <tr key={x.name} className={tr} data-bank-suggestion={x.name}>
          <td className="p-2"><DocLink dt="Payment Entry" name={x.name} /></td><td className="p-2" data-no-i18n>{x.party}</td><td className="p-2 tabular-nums" data-no-i18n>{x.date}</td>
          <td className="p-2 tabular-nums" data-no-i18n>{money(x.amount, cur(c))}</td><td className="p-2 text-xs">{x.reasons.map((r) => pick(ar, r)).join(" · ")}</td><td className="p-2 tabular-nums" data-no-i18n>{x.score}</td>
          <td className="p-2">{canWrite && <button type="button" className="btn-ghost" data-bank-accept={x.name} onClick={() => accept(x.name)}>{t("Match", "مطابقة")}</button>}</td></tr>)}
      </Table> : <p className="text-xs text-muted-foreground" data-bank-suggestions={0}>{t("No posted payment fits this line yet.", "لا توجد دفعة مرحّلة تطابق هذا البند بعد.")}</p>)}
      <div><p className="mb-1 text-xs font-semibold">{t("Matched by", "طوبق بواسطة")}</p><Stamps bt={doc.name} /></div>
    </div>
  </EntFrame>;
}

export function BankMatchingPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); const user = useSessionUser();
  useScopeMetas(["Bank Transaction", "Bank Account", "Payment Entry", "Journal Entry", "GL Entry", "Account", CORE_DT.bankRule, CORE_DT.bankMatch]);
  // P2-03: picked rows for the floating bulk bar; P2-02: a month picked on the strip narrows the open lines
  const [picked, setPicked] = useState<string[]>([]); const [month, setMonth] = useState<{ ba: string; k: string } | null>(null);
  if (!canReadType("Bank Transaction")) return <Denied />;
  const allLines = BK.openLines(c.company); const lines = month ? allLines.filter((b) => String(b["bank_account"] ?? "") === month.ba && String(b["date"] ?? "").startsWith(month.k)) : allLines;
  const withRule = lines.map((b) => ({ b, rule: BK.ruleFor(b), top: BK.matchSuggestions(b, 1)[0] }));
  const toLines = () => { setMonth(null); setTimeout(() => document.querySelector("[data-bank-open-wrap]")?.scrollIntoView({ block: "start", behavior: "smooth" }), 60); };
  const rules = BK.bankRules(); const stamps = adapter.list(CORE_DT.bankMatch).filter((m) => { const bt = adapter.get("Bank Transaction", String(m["bank_transaction"])); return bt && (String(bt["company"] ?? "") === c.company || !bt["company"]); })
    .sort((a, b) => String(b["matched_on"]).localeCompare(String(a["matched_on"]))).slice(0, 40);
  const meta = cachedMeta("Bank Transaction"); const canWrite = !!meta && hasPerm(meta, "write", undefined, user);
  const ruleHits = withRule.filter((x) => x.rule).length; const exact = withRule.filter((x) => x.top && x.top.reasons.some((r) => r[0] === "Amount matches")).length;
  const runAll = () => { const r = BK.applyAllRules(c.company, user); toast[r.booked.length ? "success" : "error"](r.booked.length ? t(`${r.booked.length} line(s) booked by rules.`, `رُحّل ${r.booked.length} بند بالقواعد.`) : r.refused.map((x) => `${x.line}: ${pick(ar, x.reason)}`).join("\n") || t("No rule fits the open lines.", "لا تنطبق قاعدة على البنود المفتوحة.")); };
  return <div className="space-y-3" data-bank-page>
    <Bar><CompanySelect c={c} />{canWrite && <button type="button" className="btn-primary" data-bank-apply-all disabled={!ruleHits} onClick={runAll}>{t("Apply all rule matches", "تطبيق كل مطابقات القواعد")} ({ruleHits})</button>}</Bar>
    <div className="flex flex-wrap gap-2">
      <Kpi id="bank-open" label={t("Open statement lines", "بنود كشف مفتوحة")} value={String(lines.length)} sub={money(lines.reduce((a, b) => a + Number(b["unallocated_amount"] ?? BK.btAmount(b)), 0), cur(c.company))} />
      <Kpi id="bank-rule-hits" label={t("Lines a rule fits", "بنود تنطبق عليها قاعدة")} value={String(ruleHits)} />
      <Kpi id="bank-exact" label={t("Lines with an exact-amount payment", "بنود لها دفعة بالمبلغ نفسه")} value={String(exact)} />
      <Kpi id="bank-rules" label={t("Bank rules", "القواعد البنكية")} value={String(rules.length)} />
    </div>
    <EntFrame id="bank-recon" title={t("Reconciliation position", "موقف المطابقة")} note={t("Statement balance − cleared balance = difference; select a month to list its open lines.", "رصيد الكشف − الرصيد المسوّى = الفرق؛ اختر شهرًا لعرض بنوده المفتوحة.")}>
      <ReconEquations view={reconAccounts(c.company, today(), user)} ar={ar} onOpenLines={toLines} />
      <div className="mt-3" data-bank-months><ReconStrips rows={bankMonths(c.company, today(), user)} ar={ar} current={today().slice(0, 7)} onCell={(ba, k) => { setMonth({ ba, k }); setTimeout(() => document.querySelector("[data-bank-open-wrap]")?.scrollIntoView({ block: "start", behavior: "smooth" }), 60); }} /></div>
    </EntFrame>
    <EntFrame id="bank-open-lines" title={t("Open statement lines", "بنود الكشف المفتوحة")} note={t("The rule that fits each line and its best payment suggestion. Open a line to confirm a match.", "القاعدة المنطبقة على كل بند وأفضل اقتراح دفعة له. افتح البند لتأكيد المطابقة.")}>
      <div data-bank-open-wrap>
      {month && <p className="mb-2 flex flex-wrap items-center gap-2 text-xs" data-bank-month={`${month.ba}|${month.k}`}><span className="ek-chip"><bdi data-no-i18n>{month.ba}</bdi> · <bdi data-no-i18n>{`${month.k.slice(5, 7)}/${month.k.slice(0, 4)}`}</bdi></span><button type="button" className="text-primary hover:underline" onClick={() => setMonth(null)}>{t("All months", "كل الأشهر")}</button></p>}
      {withRule.length ? <div className="max-h-[28rem] overflow-auto"><Table id="bank-open-rows" head={["", t("Line", "البند"), t("Date", "التاريخ"), t("Description", "الوصف"), t("Open amount", "المبلغ المفتوح"), t("Rule", "القاعدة"), t("Best suggestion", "أفضل اقتراح"), ""]}>
        {withRule.map(({ b, rule, top }) => <tr key={b.name} className={tr} data-bank-line={b.name} data-has-rule={rule ? 1 : 0}>
          <td className="p-2">{canWrite && <input type="checkbox" aria-label={`${t("Select", "تحديد")} ${b.name}`} checked={picked.includes(b.name)} onChange={(e) => setPicked(e.target.checked ? [...picked, b.name] : picked.filter((n) => n !== b.name))} data-bank-pick={b.name} />}</td>
          <td className="p-2"><span className="inline-flex flex-wrap items-center gap-1.5"><DocLink dt="Bank Transaction" name={b.name} /><NeedMatch ar={ar} /></span></td><td className="p-2 tabular-nums" data-no-i18n>{fmtDate(b["date"])}</td>
          <td className="p-2 text-xs" data-no-i18n>{String(b["description"] ?? "")}</td><td className="p-2 tabular-nums" data-no-i18n>{money(Number(b["unallocated_amount"] ?? BK.btAmount(b)), cur(c.company))}</td>
          <td className="p-2 text-xs">{rule ? <DocLink dt={CORE_DT.bankRule} name={rule.name}>{String(rule["rule_name"] ?? rule.name)}</DocLink> : "—"}</td>
          <td className="p-2 text-xs">{top ? <><DocLink dt="Payment Entry" name={top.name} /> <span className="text-muted-foreground">{top.reasons.map((r) => pick(ar, r)).join(" · ")}</span></> : "—"}</td>
          <td className="p-2">{canWrite && rule && <button type="button" className="btn-ghost" data-bank-line-apply={b.name} onClick={() => { const r = BK.applyBankRule(b.name, user); if (r.ok) toast.success(t(`${r.name} booked and matched.`, `رُحّل ${r.name} وطوبق.`)); else toast.error(pick(ar, r.reason)); }}>{t("Apply rule", "تطبيق القاعدة")}</button>}</td>
        </tr>)}
      </Table></div> : <p className="text-sm text-muted-foreground">{month ? t("No open line in this month.", "لا توجد بنود مفتوحة في هذا الشهر.") : t("Every statement line is reconciled.", "كل بنود الكشف مسوّاة.")}</p>}
      {(() => {
        const chosen = withRule.filter((x) => picked.includes(x.b.name));
        if (!chosen.length || !canWrite) return null;
        const ruled = chosen.filter((x) => x.rule); const exact = chosen.filter((x) => x.top && x.top.reasons.some((r) => r[0] === "Amount matches"));
        const open = (b: Doc) => Number(b["unallocated_amount"] ?? BK.btAmount(b));
        const total = chosen.reduce((a, x) => a + (BK.btDirection(x.b) === "Deposit" ? open(x.b) : -open(x.b)), 0);
        const run = (list: typeof chosen, f: (x: (typeof chosen)[number]) => { ok: boolean; reason?: [string, string] }, done: (k: number) => string) => {
          let ok = 0; const errs: string[] = [];
          for (const x of list) { const r = f(x); if (r.ok) ok++; else errs.push(`${x.b.name}: ${r.reason ? pick(ar, r.reason) : ""}`); }
          if (ok) toast.success(done(ok)); if (errs.length) toast.error(errs.join("\n"));
          setPicked(picked.filter((n) => !list.some((x) => x.b.name === n)));
        };
        const applyRules = () => { if (confirm(t(`Book and match ${ruled.length} line(s) by their bank rule?`, `ترحيل ومطابقة ${ruled.length} بند حسب قاعدته البنكية؟`))) run(ruled, (x) => { const r = BK.applyBankRule(x.b.name, user); return r.ok ? { ok: true } : { ok: false, reason: r.reason }; }, (k) => t(`${k} line(s) booked and matched.`, `رُحّل وطوبق ${k} بند.`)); };
        const acceptExact = () => { if (confirm(t(`Match ${exact.length} line(s) to their exact-amount payment suggestion?`, `مطابقة ${exact.length} بند مع اقتراح الدفعة بالمبلغ نفسه؟`))) run(exact, (x) => { const r = BK.acceptSuggestion(x.b.name, x.top!.name, user); return r.ok ? { ok: true } : { ok: false, reason: r.reason }; }, (k) => t(`${k} line(s) matched.`, `طوبق ${k} بند.`)); };
        const exportSel = () => exportExcel(`bank_lines_${c.company}`, [[t("Line", "البند"), t("Date", "التاريخ"), t("Bank account", "الحساب البنكي"), t("Description", "الوصف"), t("Open amount", "المبلغ المفتوح")],
          ...chosen.map((x) => [x.b.name, String(x.b["date"] ?? ""), String(x.b["bank_account"] ?? ""), String(x.b["description"] ?? ""), fmtCurrencyPlain(open(x.b), cur(c.company))])]);
        const all = withRule.map((x) => x.b.name);
        return <SelectionBar count={chosen.length} ar={ar} onClear={() => setPicked([])} attrs={{ "data-bank-selbar": String(chosen.length) }}
          total={<>{t("Open amount", "المبلغ المفتوح")} <Signed text={money(total, cur(c.company))} /></>}
          onAll={all.length > chosen.length ? () => setPicked([...new Set([...picked, ...all])]) : undefined} allLabel={<>{t("Select all", "تحديد الكل")} (<bdi data-no-i18n>{all.length}</bdi>)</>}
          actions={[
            { key: "match", primary: true, label: <>{t("Match exact suggestions", "مطابقة الاقتراحات المطابقة")} (<bdi data-no-i18n>{exact.length}</bdi>)</>, disabled: !exact.length, onClick: acceptExact },
            { key: "rules", label: <>{t("Apply bank rules", "تطبيق القواعد البنكية")} (<bdi data-no-i18n>{ruled.length}</bdi>)</>, disabled: !ruled.length, onClick: applyRules },
            { key: "export", label: t("Export selected", "تصدير المحدد"), onClick: exportSel },
          ]} />;
      })()}
      </div>
    </EntFrame>
    <div className="grid gap-3 lg:grid-cols-2">
      <EntFrame id="bank-rule-list" title={t("Bank rules", "القواعد البنكية")} note={t("First fitting rule by priority wins.", "تطبق أول قاعدة منطبقة حسب الأولوية.")}>
        {rules.length ? <div className="max-h-[18rem] overflow-auto"><Table id="bank-rule-rows" head={[t("Rule", "القاعدة"), t("Words", "الكلمات"), t("Direction", "الاتجاه"), t("Books to", "يرحّل إلى"), t("Priority", "الأولوية")]}>
          {rules.map((r) => <tr key={r.name} className={tr}><td className="p-2"><DocLink dt={CORE_DT.bankRule} name={r.name}>{String(r["rule_name"] ?? r.name)}</DocLink></td><td className="p-2 text-xs" data-no-i18n>{String(r["description_contains"] ?? "")}</td>
            <td className="p-2 text-xs">{String(r["direction"] ?? "Any")}</td><td className="p-2 text-xs" data-no-i18n>{String(r["party"] || r["account"] || "")}</td><td className="p-2 tabular-nums" data-no-i18n>{String(r["priority"] ?? "")}</td></tr>)}
        </Table></div> : <p className="text-sm text-muted-foreground">{t("No bank rule yet.", "لا توجد قواعد بنكية بعد.")}</p>}
      </EntFrame>
      <EntFrame id="bank-stamp-list" title={t("Recent matches", "المطابقات الأخيرة")} note={t("Who matched, when and how.", "من طابق ومتى وكيف.")}>
        {stamps.length ? <div className="max-h-[18rem] overflow-auto"><Table id="bank-stamp-rows" head={[t("Line", "البند"), t("Document", "المستند"), t("Method", "الطريقة"), t("Matched by", "طابقه"), t("When", "متى")]}>
          {stamps.map((m) => <tr key={m.name} className={tr} data-bank-stamp-row={m.name}><td className="p-2"><DocLink dt="Bank Transaction" name={String(m["bank_transaction"])} /></td><td className="p-2"><DocLink dt={String(m["payment_document"])} name={String(m["payment_entry"])} /></td>
            <td className="p-2 text-xs">{ar ? METHOD_AR[String(m["method"])] ?? String(m["method"]) : String(m["method"])}</td><td className="p-2 text-xs" data-no-i18n>{String(m["matched_by"] ?? "")}</td><td className="p-2 text-xs tabular-nums" data-no-i18n>{String(m["matched_on"] ?? "")}</td></tr>)}
        </Table></div> : <p className="text-sm text-muted-foreground">{t("No match stamped yet.", "لا مطابقة مختومة بعد.")}</p>}
      </EntFrame>
    </div>
  </div>;
}

/* ------------------------------------------------------------------ allocation rules ------------------------------------------------------------------ */
const monthBounds = (iso: string) => { const [y, m] = iso.split("-").map(Number) as [number, number]; const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}` }; };

export function AllocationPanel({ rule }: { rule: Doc }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  const prev = monthBounds(new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10));
  const [from, setFrom] = useState(prev.from); const [to, setTo] = useState(prev.to);
  const p = CL.allocationPlan(rule.name, from, to); const c = String(rule["company"] ?? "");
  const post = (submit: boolean) => { const r = CL.postAllocation(rule.name, from, to, submit, user); if (r.ok) toast.success(t(`Journal ${r.name} ${submit ? "posted" : "drafted"}.`, `${submit ? "رُحّل" : "أُعد"} القيد ${r.name}.`)); else toast.error(pick(ar, r.reason)); };
  return <EntFrame id="allocation-run" title={t("Allocate a period", "توزيع فترة")} note={t("The source balance of the period is moved to the target cost centres by one journal entry.", "يُنقل رصيد المصدر للفترة إلى مراكز التكلفة المستهدفة بقيد واحد.")}>
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3"><Field label={t("From", "من")}><DateInput className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} data-alloc-from /></Field>
        <Field label={t("To", "إلى")}><DateInput className="field-input" value={to} onChange={(e) => setTo(e.target.value)} data-alloc-to /></Field>
        <span className="text-sm">{t("Balance to allocate", "الرصيد المراد توزيعه")}: <bdi className="tabular-nums" data-no-i18n data-alloc-balance={p.balance}>{money(p.balance, cur(c))}</bdi></span></div>
      <Table id="allocation-lines" head={[t("Cost centre", "مركز التكلفة"), "%", t("Amount", "المبلغ")]}>
        {p.lines.map((l) => <tr key={l.cost_center} className={tr} data-alloc-line={l.cost_center}><td className="p-2" data-no-i18n>{l.cost_center}</td><td className="p-2 tabular-nums" data-no-i18n>{l.percentage}</td><td className="p-2 tabular-nums" data-no-i18n>{money(l.amount, cur(c))}</td></tr>)}
      </Table>
      {p.errors.length ? <p className="text-xs text-destructive" data-alloc-error>{pick(ar, p.errors[0]!)}</p> : <div className="flex gap-2"><button type="button" className="btn-ghost" data-alloc-draft onClick={() => post(false)}>{t("Create draft journal", "إنشاء قيد مسودة")}</button><button type="button" className="btn-primary" data-alloc-post onClick={() => post(true)}>{t("Post journal", "ترحيل القيد")}</button></div>}
      {p.posted && <p className="text-xs"><DocLink dt="Journal Entry" name={p.posted} /></p>}
    </div>
  </EntFrame>;
}

/* ------------------------------------------------------------------ close extras: allocations + closing vouchers ------------------------------------------------------------------ */
export function CloseControls({ company, periodEnd }: { company: string; periodEnd: string }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  const [note, setNote] = useState("");
  const rules = adapter.list(CORE_DT.allocationRule).filter((r) => r["company"] === company && Number(r["enabled"] ?? 1));
  const from = `${periodEnd.slice(0, 7)}-01`; const drifts = CL.pcvDrifts(company);
  return <div className="grid gap-3 lg:grid-cols-2" data-close-controls>
    <EntFrame id="close-allocations" title={t("Allocations for the period", "توزيعات الفترة")} note={t("Run each allocation rule once per period before freezing the ledger.", "شغّل كل قاعدة توزيع مرة لكل فترة قبل تجميد الدفتر.")}>
      {rules.length ? <Table id="close-allocation-rows" head={[t("Rule", "القاعدة"), t("Balance", "الرصيد"), t("State", "الحالة"), ""]}>
        {rules.map((r) => { const p = CL.allocationPlan(r.name, from, periodEnd); return <tr key={r.name} className={tr} data-close-alloc={r.name}>
          <td className="p-2"><DocLink dt={CORE_DT.allocationRule} name={r.name}>{String(r["rule_name"] ?? r.name)}</DocLink></td><td className="p-2 tabular-nums" data-no-i18n>{money(p.balance, cur(company))}</td>
          <td className="p-2 text-xs">{p.posted ? <DocLink dt="Journal Entry" name={p.posted} /> : p.errors.length ? pick(ar, p.errors[0]!) : t("Ready", "جاهزة")}</td>
          <td className="p-2">{!p.errors.length && <button type="button" className="btn-ghost" data-close-alloc-post={r.name} onClick={() => { const x = CL.postAllocation(r.name, from, periodEnd, true, user); if (x.ok) toast.success(t(`Journal ${x.name} posted.`, `رُحّل القيد ${x.name}.`)); else toast.error(pick(ar, x.reason)); }}>{t("Post", "ترحيل")}</button>}</td></tr>; })}
      </Table> : <p className="text-sm text-muted-foreground">{t("No allocation rule for this company.", "لا توجد قواعد توزيع لهذه الشركة.")}</p>}
    </EntFrame>
    <EntFrame id="close-pcv-drift" title={t("Closing vouchers out of date", "قيود إقفال غير محدّثة")} note={t("Entries posted into a closed period after its closing voucher: cancel, amend and re-submit it.", "قيود رُحّلت في فترة مقفلة بعد قيد إقفالها: ألغه وعدّله وأعد اعتماده.")}>
      {drifts.length ? <div className="space-y-2"><Table id="close-pcv-rows" head={[t("Voucher", "القيد"), t("Period", "الفترة"), t("Booked", "المرحّل"), t("Now", "الآن"), t("Difference", "الفرق"), ""]}>
        {drifts.map((d) => <tr key={d.name} className={tr} data-close-pcv={d.name}><td className="p-2"><DocLink dt="Period Closing Voucher" name={d.name} /></td><td className="p-2 text-xs tabular-nums" data-no-i18n>{d.from} → {d.to}</td>
          <td className="p-2 tabular-nums" data-no-i18n>{money(d.booked, cur(company))}</td><td className="p-2 tabular-nums" data-no-i18n>{money(d.expected, cur(company))}</td><td className="p-2 tabular-nums" data-no-i18n>{money(d.difference, cur(company))}</td>
          <td className="p-2"><button type="button" className="btn-ghost" data-close-pcv-correct={d.name} onClick={() => { const r = CL.correctPcv(d.name, note, user); if (r.ok) toast.success(t(`Amended voucher ${r.amended} prepared; task ${r.task} opened.`, `أُعد القيد المعدل ${r.amended} وفُتحت المهمة ${r.task}.`)); else toast.error(pick(ar, r.reason)); }}>{t("Correct", "تصحيح")}</button></td></tr>)}
      </Table><Field label={t("Why the period is corrected", "سبب تصحيح الفترة")}><input className="field-input" value={note} onChange={(e) => setNote(e.target.value)} data-close-pcv-note /></Field></div>
        : <p className="text-sm text-muted-foreground" data-close-pcv-rows={0}>{t("Every closing voucher matches its period.", "كل قيود الإقفال مطابقة لفتراتها.")}</p>}
    </EntFrame>
  </div>;
}

/* ------------------------------------------------------------------ ZATCA reconciliation ------------------------------------------------------------------ */
export function ZatcaReconFrame({ company, from, to }: { company: string; from: string; to: string }) {
  useStoreVersion(); const { ar, t } = useT();
  const r = CL.zatcaReconciliation(company, from, to); const k = Object.keys(CL.ZATCA_BUCKET) as CL.ZatcaBucket[];
  return <EntFrame id="zatca-recon" title={t("ZATCA reconciliation", "مطابقة الهيئة")} note={t("VAT the return declares for the period against the VAT on invoices ZATCA has accepted.", "ضريبة الإقرار للفترة مقابل ضريبة الفواتير التي قبلتها الهيئة.")}
    actions={<span className={`ent-qv-status ent-qv-tone-${Math.abs(r.difference) > 0.005 ? "warn" : "ok"}`} data-zatca-diff={r.difference}>{t("Difference", "الفرق")}: <bdi data-no-i18n>{money(r.difference, cur(company))}</bdi></span>}>
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2"><Kpi id="zatca-declared" label={t("VAT declared", "الضريبة المقرّة")} value={money(r.vatDeclared, cur(company))} />
        {k.map((b) => <Kpi key={b} id={`zatca-${b}`} label={pick(ar, CL.ZATCA_BUCKET[b])} value={String(r.buckets[b].count)} sub={money(r.buckets[b].vat, cur(company))} />)}</div>
      {r.open.length ? <div className="max-h-[18rem] overflow-auto"><Table id="zatca-open" head={[t("Invoice", "الفاتورة"), t("Customer", "العميل"), t("Date", "التاريخ"), t("VAT", "الضريبة"), t("Status", "الحالة")]}>
        {r.open.slice(0, 100).map((x) => <tr key={x.invoice} className={tr} data-zatca-open={x.invoice}><td className="p-2"><DocLink dt="Sales Invoice" name={x.invoice} /></td><td className="p-2" data-no-i18n>{x.customer}</td><td className="p-2 tabular-nums" data-no-i18n>{x.date}</td>
          <td className="p-2 tabular-nums" data-no-i18n>{money(x.vat, cur(company))}</td><td className="p-2"><span className="ent-mint-chip">{pick(ar, STATUS_LABEL[x.status])}</span></td></tr>)}
      </Table></div> : <p className="text-sm text-muted-foreground">{t("Every invoice of the period is accepted by ZATCA.", "كل فواتير الفترة مقبولة من الهيئة.")}</p>}
    </div>
  </EntFrame>;
}
