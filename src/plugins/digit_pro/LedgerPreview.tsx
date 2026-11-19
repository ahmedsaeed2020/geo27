/** D4-b — "Preview before posting" on draft posting documents: the GL / stock lines submit will write, from posting.ts builders. */
import { useStoreVersion, type Doc } from "@/lib/adapter";
import { fmtCurrency } from "@/lib/format";
import { postingPreview } from "@/lib/postingPreview";
import { useLang } from "@/i18n";

export function LedgerPreviewPanel({ doctype, doc }: { doctype: string; doc: Doc }) {
  useStoreVersion();
  const ar = useLang() === "ar";
  const t = (en: string, a: string) => (ar ? a : en);
  if (Number(doc.docstatus ?? 0) !== 0) return null;
  let pv: ReturnType<typeof postingPreview>;
  try { pv = postingPreview(doctype, doc); } catch { return null; } // incomplete draft: nothing to preview yet
  const cur = String(doc["currency"] ?? doc["company_currency"] ?? "");
  const money = (x: number) => (x ? fmtCurrency(x, cur) : "");
  // the ledger and stock lines are shown once, always visible, by the shared Enterprise effect preview under the document
  // header (owner 2026-11-12 evening §9); this panel keeps the budget position only
  if (!pv.budget.errors.length && !pv.budget.warnings.length && !pv.budget.position.length) return null;
  pv = { ...pv, gl: [], sl: [] };
  const empty = false;
  return <details open className="dp-card" data-dp-ledger-preview={pv.gl.length} data-balanced={pv.totals.balanced ? "1" : "0"}>
    <summary className="cursor-pointer font-semibold">{t("Budget before posting", "الموازنة قبل الترحيل")}
      <span className="ms-2 text-xs font-normal text-muted-foreground">{empty ? t("Nothing to post yet — add lines first.", "لا يوجد ما يُرحَّل بعد — أضف البنود أولًا.")
        : t("The ledger lines Submit will write.", "قيود الدفاتر التي سيكتبها الاعتماد.")}</span></summary>
    {pv.gl.length > 0 && <div className="mt-2 overflow-x-auto">
      <table className="dp-cc-table text-xs" data-dp-preview-gl><thead><tr><th scope="col">{t("Account", "الحساب")}</th><th scope="col">{t("Party", "الطرف")}</th><th scope="col">{t("Debit", "مدين")}</th><th scope="col">{t("Credit", "دائن")}</th></tr></thead>
        <tbody>{pv.gl.map((l, i) => <tr key={i} data-dp-preview-gl-row={l.account}><td data-no-i18n>{l.account}</td><td data-no-i18n>{l.party ?? ""}</td><td className="tabular-nums" data-no-i18n>{money(l.debit)}</td><td className="tabular-nums" data-no-i18n>{money(l.credit)}</td></tr>)}</tbody>
        <tfoot><tr><th scope="row" colSpan={2}>{t("Total", "الإجمالي")}</th><td className="tabular-nums font-semibold" data-no-i18n>{money(pv.totals.debit)}</td><td className="tabular-nums font-semibold" data-no-i18n>{money(pv.totals.credit)}</td></tr></tfoot></table>
      {!pv.totals.balanced && <p className="mt-1 text-xs text-destructive" data-dp-preview-unbalanced>{t("Debit and credit do not match — Submit will be refused.", "المدين والدائن غير متساويين — سيُرفض الاعتماد.")}</p>}
    </div>}
    {pv.sl.length > 0 && <div className="mt-2 overflow-x-auto">
      <table className="dp-cc-table text-xs" data-dp-preview-sl><thead><tr><th scope="col">{t("Item", "الصنف")}</th><th scope="col">{t("Warehouse", "المستودع")}</th><th scope="col">{t("Quantity change", "تغير الكمية")}</th></tr></thead>
        <tbody>{pv.sl.map((s, i) => <tr key={i}><td data-no-i18n>{s.item_code}</td><td data-no-i18n>{s.warehouse}</td><td className={`tabular-nums ${s.actual_qty < 0 ? "text-destructive" : ""}`} data-no-i18n>{s.actual_qty > 0 ? "+" : ""}{s.actual_qty}</td></tr>)}</tbody></table>
      {pv.stockGlAtSubmit && <p className="mt-1 text-[11px] text-muted-foreground">{t("Stock value lines are computed at submit from the moving average.", "تُحسب قيود قيمة المخزون عند الاعتماد من متوسط التكلفة المتحرك.")}</p>}
    </div>}
    {pv.budget.position.length > 0 && <div className="mt-2 overflow-x-auto">
      <table className="dp-cc-table text-xs" data-dp-budget-remaining={pv.budget.position.length}><thead><tr><th scope="col">{t("Budget", "الموازنة")}</th><th scope="col">{t("Annual budget", "الموازنة السنوية")}</th><th scope="col">{t("Spent, ordered and requested", "المصروف والمطلوب والمعتمد شراؤه")}</th><th scope="col">{t("This document", "هذا المستند")}</th><th scope="col">{t("Remaining after", "المتبقي بعده")}</th></tr></thead>
        <tbody>{pv.budget.position.map((b) => <tr key={`${b.budget}|${b.account}|${b.value}`} data-dp-budget-row={b.value} data-remaining-after={b.remainingAfter}><td data-no-i18n>{b.account} · {b.value}</td><td className="tabular-nums" data-no-i18n>{money(b.annual) || "0"}</td>
          <td className="tabular-nums" data-no-i18n>{money(b.actual + b.ordered + b.requested) || "0"}</td><td className="tabular-nums" data-no-i18n>{money(b.thisDoc)}</td>
          <td className={`tabular-nums font-semibold ${b.remainingAfter < 0 ? "text-destructive" : ""}`} data-no-i18n>{fmtCurrency(b.remainingAfter, cur)}</td></tr>)}</tbody></table>
    </div>}
    {(pv.budget.errors.length > 0 || pv.budget.warnings.length > 0) && <ul className="mt-2 grid gap-1 text-xs" data-dp-preview-budget>
      {pv.budget.errors.map((e) => <li key={e} className="text-destructive">{t("Budget — will stop submit:", "الموازنة — ستمنع الاعتماد:")} {e}</li>)}
      {pv.budget.warnings.map((w) => <li key={w} className="text-muted-foreground">{t("Budget warning:", "تنبيه الموازنة:")} {w}</li>)}
    </ul>}
  </details>;
}
