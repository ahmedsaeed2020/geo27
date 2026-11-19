/**
 * DIGIT Enterprise document insight panels (Run11.1 B6 D1, D2, D5, D6, F3, F6, SL7), shared by every app through
 * CorePanels.coreDocPanels: stage strip + five order axes + audit stamps, "why can't this post?" with the fix,
 * "why this price" for each line, and reclassify-a-posted-line with preview. Logic: src/lib/coreShared/docInsight.ts.
 */
import { useEffect, useMemo, useState } from "react";
import { DateInput } from "@/components/form/DateInput";
import { toast } from "sonner";
import type { DocTypeMeta } from "@/lib/catalog";
import { cachedMeta, ensureMetas } from "@/lib/catalog";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { hasPerm, useSessionUser } from "@/lib/session";
import * as DI from "@/lib/coreShared/docInsight";
import { Link } from "@tanstack/react-router";
import { EntFrame } from "./Surfaces";
import { QuickKpiButton, QuickLink } from "./QuickView";
import { budgetCheck } from "@/lib/budget";
import { fmtDate } from "@/lib/format";
import { DocLink, Field, money, pick, today, useT } from "./FinanceDesk";
import { Meter } from "@/components/enterprise/kit";

const when = (iso: string) => (iso ? iso.slice(0, 16).replace("T", " ") : "");

/* ---------------------------------------------- D1 + D2 + F6: where the document stands ---------------------------------------------- */
export function DocStatusPanel({ meta, doc }: { meta: DocTypeMeta; doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT();
  const strip = DI.stageStrip(meta.name, doc); const axes = DI.orderAxes(meta.name, doc); const audit = DI.auditTrail(meta.name, doc.name);
  const stamps: [string, [string, string], DI.Stamp | undefined][] = [
    ["created", ["Created by", "أنشأه"], audit.created], ["submitted", ["Submitted by", "اعتمده"], audit.submitted], ["cancelled", ["Cancelled by", "ألغاه"], audit.cancelled],
    ["cleared", ["Cleared by", "سوّاه بنكياً"], audit.cleared], ["matched", ["Matched by", "طابقه"], audit.matched],
  ];
  return <EntFrame id="doc-status" title={t("Where this document stands", "أين يقف هذا المستند")}>
    <ol className="flex flex-wrap items-center gap-1.5" data-di-stage={strip.status} aria-label={t("Stages", "المراحل")}>
      {strip.steps.map((x, i) => <li key={i} className="flex items-center gap-1.5" data-di-step={x.state}>
        <span className={`rounded-full px-2.5 py-0.5 text-xs ${x.state === "current" ? "bg-primary font-semibold text-primary-foreground" : x.state === "done" ? "ent-mint-chip" : "border border-border text-muted-foreground"}`}>{pick(ar, x.label)}</span>
        {i < strip.steps.length - 1 && <span aria-hidden className="text-muted-foreground">{ar ? "←" : "→"}</span>}
      </li>)}
      {strip.off && <li data-di-off={strip.status}><span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">{pick(ar, strip.off)}</span></li>}
    </ol>
    {axes.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-5" data-di-axes={axes.length}>
      {axes.map((a) => <div key={a.key} className="ent-frame p-2" data-di-axis={a.key} data-di-pct={a.pct}>
        <p className="text-[11px] text-muted-foreground">{pick(ar, a.label)}</p>
        <p className="ent-title text-sm">{pick(ar, a.state)}</p>
        <div className="mt-1"><Meter size="sm" value={Math.max(0, Math.min(100, a.pct))} max={100} label={`${a.pct}%`} /></div>
      </div>)}
    </div>}
    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs" data-di-audit>
      {stamps.filter(([, , v]) => v).map(([k, label, v]) => <div key={k} className="flex gap-1" data-di-stamp={k}><dt className="text-muted-foreground">{pick(ar, label)}</dt><dd><bdi className="font-medium" data-no-i18n>{v!.by}</bdi> <bdi className="text-muted-foreground" data-no-i18n>{when(v!.on)}</bdi></dd></div>)}
    </dl>
  </EntFrame>;
}

/* ---------------------------------------------- D5 + D6: why can't this post — with the fix ---------------------------------------------- */
export function PostCheckPanel({ meta, doc }: { meta: DocTypeMeta; doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  const [open, setOpen] = useState(false);
  const r = useMemo(() => (open ? DI.postReadiness(meta, doc, user) : null), [open, meta, doc, user]); // eslint-disable-line react-hooks/exhaustive-deps
  return <EntFrame id="post-check" title={t("Can this be submitted?", "هل يمكن اعتماد هذا المستند؟")} note={t("Runs the same checks as Submit and tells you how to fix each one.", "يجري فحوص الاعتماد نفسها ويوضح طريقة إصلاح كل مشكلة.")}
    actions={<button type="button" className="btn-primary" data-di-postcheck-run onClick={() => setOpen(true)}>{r ? t("Check again", "أعد الفحص") : t("Check now", "افحص الآن")}</button>}>
    {!r ? <p className="text-sm text-muted-foreground">{t("Not checked yet.", "لم يُفحص بعد.")}</p>
      : r.ok ? <p className="text-sm" data-di-postcheck="ok"><span className="ent-mint-chip">{t("Ready to submit", "جاهز للاعتماد")}</span></p>
      : <ul className="space-y-2" data-di-postcheck="blocked" data-di-blockers={r.blockers.length}>{r.blockers.map((b, i) => <li key={i} className="ent-frame p-2" data-di-blocker={b.kind}>
        <p className="ent-title text-sm text-destructive">{pick(ar, b.title)}</p>
        <p className="text-sm" data-di-fix>{pick(ar, b.fix)}</p>
        {ar ? <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">{t("Details", "التفاصيل")}</summary><span data-no-i18n>{b.message}</span></details>
          : <p className="mt-1 text-xs text-muted-foreground" data-no-i18n>{b.message}</p>}
      </li>)}</ul>}
  </EntFrame>;
}

/* ---------------------------------------------- SL7: why this price ---------------------------------------------- */
const VERDICT: Record<DI.PriceRuleCheck["verdict"], [string, string]> = { applied: ["Applied", "مطبّقة"], outranked: ["Outranked", "تقدمت عليها أخرى"], rejected: ["Not applied", "غير مطبّقة"] };
export function PriceWhyPanel({ meta, doc }: { meta: DocTypeMeta; doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT();
  const items = ((doc["items"] as Record<string, unknown>[] | undefined) ?? []).filter((r) => r["item_code"]);
  const [idx, setIdx] = useState(0);
  if (!items.length) return null;
  const row = items[Math.min(idx, items.length - 1)]!; const x = DI.explainPrice(meta.name, doc, row); const cur = String(doc["currency"] ?? "SAR");
  return <EntFrame id="price-why" title={t("Why this price", "لماذا هذا السعر")} note={t("Every pricing rule checked against the line: which applied, which did not and why.", "كل قواعد التسعير مفحوصة على السطر: ما طُبّق وما لم يُطبّق ولماذا.")}>
    <div className="flex flex-wrap items-end gap-3">
      <Field label={t("Line", "السطر")}><select className="field-input" value={idx} onChange={(e) => setIdx(Number(e.target.value))} data-di-price-row>
        {items.map((r, i) => <option key={i} value={i} data-no-i18n>{`${i + 1}. ${String(r["item_name"] ?? r["item_code"])}`}</option>)}</select></Field>
      <p className="text-sm" data-di-price-list={x.listRate}>{t("List price", "سعر القائمة")} <bdi className="ent-title" data-no-i18n>{money(x.listRate, cur)}</bdi> <span className="text-xs text-muted-foreground" data-no-i18n>{x.priceList}</span></p>
      <p className="text-sm" data-di-price-expected={x.expectedRate}>{t("Rules give", "تعطي القواعد")} <bdi className="ent-title" data-no-i18n>{money(x.expectedRate, cur)}</bdi></p>
      <p className="text-sm" data-di-price-rate={x.rowRate}>{t("Line rate", "سعر السطر")} <bdi className="ent-title" data-no-i18n>{money(x.rowRate, cur)}</bdi>{x.differs && <span className="ms-1 rounded-full bg-destructive/10 px-2 text-xs text-destructive" data-di-price-differs>{t("changed by hand", "عُدّل يدوياً")}</span>}</p>
    </div>
    {x.rules.length ? <ul className="mt-2 space-y-1" data-di-price-rules={x.rules.length}>{x.rules.map((r) => <li key={r.name} className="flex flex-wrap items-baseline gap-2 text-sm" data-di-rule={r.verdict}>
      <span className={r.verdict === "applied" ? "ent-mint-chip" : "rounded-full border border-border px-2 text-xs text-muted-foreground"}>{pick(ar, VERDICT[r.verdict])}</span>
      <span className="ent-title" data-no-i18n>{r.title}</span><span className="text-xs text-muted-foreground">{pick(ar, r.effect)}</span><span className="text-xs">— {pick(ar, r.reason)}</span>
    </li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground" data-di-price-rules="0">{t("No pricing rules are defined; the line uses the price list.", "لا توجد قواعد تسعير؛ يستخدم السطر قائمة الأسعار.")}</p>}
  </EntFrame>;
}

/** Loads the definitions a panel's permission check needs (a directly opened form has not loaded them yet); re-renders once ready. */
export function useMetaReady(doctypes: string[]): boolean {
  const key = doctypes.join("|");
  const [, setV] = useState(0);
  useEffect(() => {
    let live = true;
    const need = key.split("|").filter((d) => d && !cachedMeta(d));
    if (need.length) void ensureMetas(need).then(() => { if (live) setV((x) => x + 1); }, () => undefined);
    return () => { live = false; };
  }, [key]);
  return doctypes.every((d) => !!cachedMeta(d));
}

/* ---------------------------------------------- F3: reclassify a posted line ---------------------------------------------- */
export function ReclassifyPanel({ doc }: { doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  const lines = (doc["accounts"] as Record<string, unknown>[] | undefined) ?? [];
  const [idx, setIdx] = useState(Number(lines[0]?.["idx"] ?? 1)); const [to, setTo] = useState(""); const [date, setDate] = useState(today());
  const meta = cachedMeta("Journal Entry"); const may = !!meta && hasPerm(meta, "create", undefined, user) && hasPerm(meta, "submit", undefined, user);
  const accounts = useMemo(() => adapter.list("Account").filter((a) => a["company"] === doc["company"] && !Number(a["is_group"] ?? 0) && !Number(a["disabled"] ?? 0)).map((a) => a.name).sort(), [doc]);
  const p = DI.reclassifyPreview(doc.name, idx, to); const done = DI.reclassificationsOf(doc.name); const cur = String(doc["currency"] ?? "SAR");
  return <EntFrame id="reclassify" title={t("Reclassify a line", "إعادة تصنيف سطر")} note={t("Moves a posted amount to another account with one linked entry; the original stays untouched.", "ينقل مبلغاً مرحّلاً إلى حساب آخر بقيد واحد مرتبط؛ ويبقى القيد الأصلي كما هو.")}>
    {may ? <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("Line", "السطر")}><select className="field-input" value={idx} onChange={(e) => setIdx(Number(e.target.value))} data-di-reclass-row>
          {lines.map((r, i) => <option key={i} value={Number(r["idx"] ?? i + 1)} data-no-i18n>{`${Number(r["idx"] ?? i + 1)}. ${String(r["account"])} · ${Number(r["debit"] ?? 0) ? `Dr ${Number(r["debit"])}` : `Cr ${Number(r["credit"] ?? 0)}`}`}</option>)}</select></Field>
        <Field label={t("Move to account", "النقل إلى الحساب")}><input className="field-input min-w-[16rem]" list="di-reclass-accounts" value={to} onChange={(e) => setTo(e.target.value)} data-di-reclass-to data-no-i18n />
          <datalist id="di-reclass-accounts">{accounts.map((a) => <option key={a} value={a} />)}</datalist></Field>
        <Field label={t("Posting date", "تاريخ القيد")}><DateInput className="field-input" value={date} onChange={(e) => setDate(e.target.value)} data-di-reclass-date /></Field>
      </div>
      {to && (p.errors.length ? <ul className="text-sm text-destructive" data-di-reclass-errors={p.errors.length}>{p.errors.map((e, i) => <li key={i} data-no-i18n>{e}</li>)}</ul>
        : <table className="w-full text-sm" data-di-reclass-preview={p.lines.length}><thead><tr className="text-xs text-muted-foreground"><th className="text-start">{t("Account", "الحساب")}</th><th className="text-end">{t("Debit", "مدين")}</th><th className="text-end">{t("Credit", "دائن")}</th></tr></thead>
          <tbody>{p.lines.map((l, i) => <tr key={i}><td data-no-i18n>{l.account}</td><td className="text-end" data-no-i18n>{l.debit ? money(l.debit, cur) : ""}</td><td className="text-end" data-no-i18n>{l.credit ? money(l.credit, cur) : ""}</td></tr>)}</tbody></table>)}
      <button type="button" className="btn-primary" disabled={!to || p.errors.length > 0} data-di-reclass-go onClick={() => {
        const r = DI.reclassify(doc.name, idx, to, date, user);
        if (r.errors.length) toast.error(r.errors.join(" · ")); else { toast.success(t(`Reclassified in ${r.name}`, `أُعيد التصنيف في ${r.name}`)); setTo(""); }
      }}>{t("Reclassify", "إعادة التصنيف")}</button>
    </div> : <p className="text-sm text-muted-foreground" data-di-reclass="denied">{t("You cannot create journal entries.", "لا تملك صلاحية إنشاء القيود.")}</p>}
    {done.length > 0 && <ul className="mt-2 space-y-0.5 text-sm" data-di-reclass-done={done.length}>{done.map((d) => <li key={d.name} className="flex gap-2"><DocLink dt="Journal Entry" name={d.name} /><span className="text-xs text-muted-foreground" data-no-i18n>{String(d["user_remark"] ?? "")}</span></li>)}</ul>}
  </EntFrame>;
}

/** OWN-41 ledger impact inside the document: the GL rows it posted (or, for a draft, what submitting will post), balanced check,
 *  account / party rows open in the shared Quick View, and the native General Ledger pre-filtered to this voucher. */
export function LedgerImpactPanel({ meta, doc }: { meta: DocTypeMeta; doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  useMetaReady(["GL Entry"]); // a form opened directly has not loaded the GL Entry definition yet: load it, then decide the read right
  const gl = cachedMeta("GL Entry");
  const imp = useMemo(() => DI.ledgerImpact(meta.name, doc), [meta.name, doc]);
  if (!gl || !hasPerm(gl, "read", undefined, user) || imp.mode === "none") return null;
  const cur = String(doc["currency"] ?? doc["company_currency"] ?? doc["paid_from_account_currency"] ?? "SAR");
  const date = String(doc["posting_date"] ?? doc["transaction_date"] ?? "");
  const search = { filters: JSON.stringify({ ...(doc["company"] ? { company: doc["company"] } : {}), ...(date ? { from_date: date, to_date: date } : {}), voucher_no: doc.name }) };
  return <EntFrame id="ledger-impact" title={imp.mode === "posted" ? t("Ledger impact", "الأثر على دفتر الأستاذ") : t("Ledger impact when submitted", "الأثر على دفتر الأستاذ عند الاعتماد")}
    note={imp.mode === "posted" ? t("Posted by this document", "ما رحّله هذا المستند") : t("Preview from the posting rules — nothing is posted yet", "معاينة من قواعد الترحيل — لم يُرحَّل شيء بعد")}
    actions={imp.mode === "posted" && imp.lines.length > 0 ? <span className="flex flex-wrap gap-2">
      <QuickKpiButton doctype="GL Entry" filters={[["voucher_no", "=", doc.name], ["is_cancelled", "=", 0]] as never} title={t(`Ledger rows of ${doc.name}`, `قيود ${doc.name}`)} className="btn-ghost"><span data-di-impact-side>{t("Ledger rows in side panel", "القيود في اللوحة الجانبية")}</span></QuickKpiButton>
      <Link to="/report/$name" params={{ name: "General Ledger" }} search={search as never} className="btn-ghost" data-di-impact-gl>{t("Open in General Ledger", "فتح في دفتر الأستاذ العام")}</Link></span> : undefined}>
    <div data-di-impact={imp.mode} data-di-impact-lines={imp.lines.length} data-di-impact-balanced={imp.balanced ? "1" : "0"}>
      {imp.lines.length > 0 && <table className="w-full text-sm">
        <thead><tr className="text-xs text-muted-foreground"><th className="p-1.5 text-start">{t("Account", "الحساب")}</th><th className="p-1.5 text-start">{t("Party / cost center", "الطرف / مركز التكلفة")}</th>
          <th className="p-1.5 text-end">{t("Debit", "مدين")}</th><th className="p-1.5 text-end">{t("Credit", "دائن")}</th></tr></thead>
        <tbody>{imp.lines.map((l, i) => <tr key={i} className="border-t border-border" data-di-impact-line={l.account}>
          <td className="p-1.5">{l.missing ? <span className="text-destructive" data-di-impact-missing={l.account}><bdi data-no-i18n>{l.account}</bdi> · {t("account not found", "الحساب غير موجود")}</span> : <QuickLink doctype="Account" name={l.account} />}</td>
          <td className="p-1.5 text-xs text-muted-foreground">{l.party && <QuickLink doctype={l.party_type || String(doc["party_type"] ?? (doc["supplier"] ? "Supplier" : "Customer"))} name={l.party} className="text-primary hover:underline" />}{l.party && l.cost_center ? " · " : ""}{l.cost_center && <bdi data-no-i18n>{l.cost_center}</bdi>}</td>
          <td className="p-1.5 text-end tabular-nums" data-no-i18n>{l.debit ? money(l.debit, cur) : ""}</td><td className="p-1.5 text-end tabular-nums" data-no-i18n>{l.credit ? money(l.credit, cur) : ""}</td></tr>)}</tbody>
        <tfoot><tr className="border-t-2 border-border font-semibold"><td className="p-1.5" colSpan={2}>{t("Total", "الإجمالي")}
          <span className={`ms-2 rounded-full px-2 py-0.5 text-[11px] ${imp.balanced ? "ent-mint-chip" : "bg-destructive/10 text-destructive"}`} data-di-impact-check>{imp.balanced ? t("Balanced", "متوازن") : t(`Out of balance by ${money(Math.abs(imp.debit - imp.credit), cur)}`, `غير متوازن بفارق ${money(Math.abs(imp.debit - imp.credit), cur)}`)}</span></td>
          <td className="p-1.5 text-end tabular-nums" data-no-i18n>{money(imp.debit, cur)}</td><td className="p-1.5 text-end tabular-nums" data-no-i18n>{money(imp.credit, cur)}</td></tr></tfoot>
      </table>}
      {imp.missingAccounts > 0 && <p role="alert" className="mt-2 text-sm text-destructive" data-di-impact-blocked={imp.missingAccounts}>{t("Set the missing accounts (company defaults or item accounts) before submitting.", "حدّد الحسابات الناقصة (افتراضيات الشركة أو حسابات الأصناف) قبل الاعتماد.")}</p>}
      {imp.mode === "preview" && <BudgetLine meta={meta} doc={doc} />}
      {imp.stockRows > 0 && <p className="mt-2 text-xs text-muted-foreground" data-di-impact-stock={imp.stockRows}>{ar ? `${imp.stockRows} حركة في دفتر المخزون` : `${imp.stockRows} stock ledger movement(s)`}</p>}
    </div>
  </EntFrame>;
}

/** Stock effect inside the document (owner 2026-11-12 evening §9): the stock ledger rows it posted, or for a draft what submitting
 *  will move — item, warehouse, quantity in/out and (once posted) the value change. Items open in the shared Quick View. */
export function StockImpactPanel({ meta, doc }: { meta: DocTypeMeta; doc: Doc }) {
  useStoreVersion(); const { t } = useT(); const user = useSessionUser();
  useMetaReady(["Stock Ledger Entry"]);
  const sle = cachedMeta("Stock Ledger Entry");
  const imp = useMemo(() => DI.stockImpact(meta.name, doc), [meta.name, doc]);
  if (!sle || !hasPerm(sle, "read", undefined, user) || imp.mode === "none") return null;
  const cur = String(doc["company_currency"] ?? doc["currency"] ?? "SAR");
  const itemName = (code: string) => String(adapter.get("Item", code)?.["item_name"] ?? code);
  return <EntFrame id="stock-impact" title={imp.mode === "posted" ? t("Stock impact", "الأثر على المخزون") : t("Stock impact when submitted", "الأثر على المخزون عند الاعتماد")}
    note={imp.mode === "posted" ? t("Moved by this document", "ما حرّكه هذا المستند") : t("Preview from the posting rules — nothing is moved yet", "معاينة من قواعد الترحيل — لم يتحرك شيء بعد")}>
    <div data-di-stock={imp.mode} data-di-stock-lines={imp.lines.length} className="overflow-x-auto">
      <table className="ek-effect-t">
        <thead><tr><th>{t("Item", "الصنف")}</th><th>{t("Warehouse", "المستودع")}</th><th data-num>{t("Quantity", "الكمية")}</th>{imp.mode === "posted" && <th data-num>{t("Value change", "تغير القيمة")}</th>}</tr></thead>
        <tbody>{imp.lines.map((l, i) => <tr key={i} data-di-stock-line={l.item_code}>
          <td><QuickLink doctype="Item" name={l.item_code}><bdi data-no-i18n>{itemName(l.item_code)}</bdi></QuickLink></td>
          <td className="text-xs text-muted-foreground"><bdi data-no-i18n>{l.warehouse}</bdi></td>
          <td data-num className={l.qty < 0 ? "ek-effect-out" : "ek-effect-in"} data-no-i18n>{l.qty > 0 ? "+" : ""}{l.qty}</td>
          {imp.mode === "posted" && <td data-num data-no-i18n>{l.value !== null ? money(l.value, cur) : ""}</td>}</tr>)}</tbody>
        <tfoot><tr><td colSpan={2}>{t("Total", "الإجمالي")}</td><td data-num data-no-i18n><span className="ek-effect-in">+{imp.qtyIn}</span> / <span className="ek-effect-out">−{imp.qtyOut}</span></td>{imp.mode === "posted" && <td data-num data-no-i18n>{imp.value !== null ? money(imp.value, cur) : ""}</td>}</tr></tfoot>
      </table>
    </div>
  </EntFrame>;
}

/** Ledger and stock effect of a posting document, always visible under the document header before and after posting
 *  (owner 2026-11-12 evening §9) — one place, never inside a tab. Documents with no ledger or stock effect show nothing. */
export const EFFECT_DOCTYPES = ["Asset", "Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry", "Stock Entry", "Delivery Note", "Purchase Receipt", "Stock Reconciliation",
  "Landed Cost Voucher", "Asset Capitalization", "Asset Repair", "Asset Value Adjustment", "Digit Asset Impairment", "Expense Claim", "Period Closing Voucher", "Invoice Discounting", "Dunning", "Payroll Entry"];
export function EffectPreview({ meta, doc }: { meta: DocTypeMeta; doc: Doc }) {
  // owner FINAL WORK LIST D4-b: shown on every posting draft — also a new, unsaved one as soon as it has lines — and after submit
  if (!meta.is_submittable || !EFFECT_DOCTYPES.includes(meta.name)) return null;
  if (meta.name === "Asset") return <div className="ek-effect" data-ek-effect={meta.name}><AssetEffectPanel doc={doc} /></div>;
  return <div className="ek-effect ek-pair" data-ek-effect={meta.name}><LedgerImpactPanel meta={meta} doc={doc} /><StockImpactPanel meta={meta} doc={doc} /></div>;
}

/** Budget effect of a draft (budget.ts, the same rule Submit applies): within budget, or each warning / stop with its figures. */
function BudgetLine({ meta, doc }: { meta: DocTypeMeta; doc: Doc }) {
  const { t } = useT();
  const r = useMemo(() => { try { return budgetCheck(meta.name, doc); } catch { return { errors: [], warnings: [] }; } }, [meta.name, doc]);
  if (!["Journal Entry", "Purchase Invoice", "Purchase Order", "Material Request"].includes(meta.name)) return null;
  const all = [...r.errors.map((m) => ["stop", m] as const), ...r.warnings.map((m) => ["warn", m] as const)];
  return <div className="mt-2 text-xs" data-di-budget={all.length ? (r.errors.length ? "stop" : "warn") : "ok"}>
    <span className="font-semibold">{t("Budget effect:", "أثر الميزانية:")}</span>{" "}
    {all.length ? all.map(([k, m], i) => <span key={i} className={k === "stop" ? "text-destructive" : "text-warning-foreground"} data-no-i18n>{m}</span>) : <span className="ent-mint-chip">{t("Within budget", "ضمن الميزانية")}</span>}
  </div>;
}

/** Asset effect: submitting books the asset; depreciation then posts by schedule — posted rows, the next rows and the book value. */
function AssetEffectPanel({ doc }: { doc: Doc }) {
  useStoreVersion(); const { t } = useT();
  const cur = String(doc["currency"] ?? "SAR");
  const rows = adapter.list("Asset Depreciation Schedule").filter((x) => x["asset"] === doc.name && Number(x.docstatus ?? 0) !== 2)
    .flatMap((x) => ((x["depreciation_schedule"] as Doc[] | undefined) ?? [])).sort((a, b) => String(a["schedule_date"]).localeCompare(String(b["schedule_date"])));
  const posted = rows.filter((r) => r["journal_entry"]); const next = rows.filter((r) => !r["journal_entry"]).slice(0, 3);
  const cost = Number(doc["gross_purchase_amount"] ?? 0); const book = Number(doc["value_after_depreciation"] ?? cost);
  const postedAmt = posted.reduce((a, r) => a + Number(r["depreciation_amount"] ?? 0), 0);
  const ds = Number(doc.docstatus ?? 0);
  return <EntFrame id="asset-effect" title={ds === 1 ? t("Ledger effect of this asset", "الأثر المحاسبي لهذا الأصل") : t("Ledger effect when submitted", "الأثر المحاسبي عند الاعتماد")}
    note={ds === 1 ? t("Depreciation posts by schedule through journal entries", "يُرحَّل الإهلاك حسب الجدول عبر قيود اليومية") : t("Preview — nothing is posted yet", "معاينة — لم يُرحَّل شيء بعد")}>
    <div className="grid gap-3 sm:grid-cols-3" data-di-asset-effect={ds}>
      <div><p className="text-xs text-muted-foreground">{t("Cost", "التكلفة")}</p><p className="ent-title tabular-nums" data-no-i18n>{money(cost, cur)}</p></div>
      <div><p className="text-xs text-muted-foreground">{t("Depreciation posted", "الإهلاك المرحّل")}</p><p className="ent-title tabular-nums" data-no-i18n data-di-asset-posted={posted.length}>{money(postedAmt, cur)} <span className="text-xs text-muted-foreground">({posted.length})</span></p></div>
      <div><p className="text-xs text-muted-foreground">{t("Book value", "القيمة الدفترية")}</p><p className="ent-title tabular-nums" data-no-i18n>{money(book, cur)}</p></div>
    </div>
    {next.length > 0 ? <table className="ek-effect-t mt-2" data-di-asset-next={next.length}><thead><tr><th>{t("Next depreciation", "الإهلاك القادم")}</th><th data-num>{t("Amount", "المبلغ")}</th></tr></thead>
      <tbody>{next.map((r, i) => <tr key={i}><td data-no-i18n>{fmtDate(String(r["schedule_date"]))}</td><td data-num data-no-i18n>{money(Number(r["depreciation_amount"] ?? 0), cur)}</td></tr>)}</tbody></table>
      : <p className="mt-2 text-xs text-muted-foreground" data-di-asset-next="0">{Number(doc["calculate_depreciation"] ?? 0) ? t("No depreciation rows left in the schedule.", "لا توجد أسطر إهلاك متبقية في الجدول.") : t("This asset is not depreciated.", "هذا الأصل لا يُهلك.")}</p>}
  </EntFrame>;
}
