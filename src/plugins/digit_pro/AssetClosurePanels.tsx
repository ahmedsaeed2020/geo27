/**
 * DIGIT Pro Fixed Assets closure panels: FA1-b create asset from a Purchase Invoice line, FA8-b posted disposal
 * reconciliation, FA10-b maintenance calendar + repair cost vs book value, FIX-016-b book vs tax book.
 * Read-only views; the only write is a native Asset draft (documentApi.createDraft) opened for the user to complete.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import type { Doc } from "@/lib/adapter";
import { useStoreVersion } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { createDraft } from "@/lib/documentApi";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { useScopeMetas } from "@/lib/scope";
import { useSessionUser } from "@/lib/session";
import { t as tr, useLang } from "@/i18n";
import { can } from "./finance";
import { SourceState } from "./ProFrame";
import { assetFromInvoiceLine, bookTaxDifferences, fixedAssetLines, maintenanceCalendar, postedDisposals, repairVsNbv } from "./assetClosure";
import { Meter } from "@/components/enterprise/kit";

const useT = () => { const ar = useLang() === "ar"; return { ar, t: (en: string, a: string) => (ar ? a : en) }; };
const AssetA = ({ name, label }: { name: string; label?: string }) => <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "asset", name }} className="font-medium text-primary hover:underline" data-no-i18n>{label ?? name}</Link>;

/* FA1-b — on a submitted Purchase Invoice */
export function InvoiceAssetLinesPanel({ doc }: { doc: Doc }) {
  useStoreVersion(); useScopeMetas(["Asset"]);
  const { t } = useT(); const user = useSessionUser(); const nav = useNavigate();
  const r = fixedAssetLines(doc, user);
  if (r.status === "ok" && !r.lines.length) return null;
  const canCreate = can("Asset", "create", undefined, user);
  const create = (i: number) => {
    const meta = cachedMeta("Asset"); const line = r.lines[i]; if (!meta || !line) return;
    const d = createDraft(meta, { mapped: assetFromInvoiceLine(doc, line) });
    if (!d.doc) { toast.error(d.errors.map((x) => tr(x)).join("\n")); return; }
    void nav({ to: "/app/$app/$doctype/$name", params: { app: "erpnext", doctype: "asset", name: d.doc.name } });
  };
  return <section className="panel mt-4 p-4" data-dp-invoice-assets={r.lines.length} aria-label={t("Fixed asset lines", "بنود الأصول الثابتة")}>
    <h2 className="text-sm font-semibold">{t("Fixed asset lines", "بنود الأصول الثابتة")}</h2>
    {r.status !== "ok" ? <SourceState status={r.status} doctype="Asset" /> : <>
      <div className="mt-2 overflow-x-auto"><table className="w-full text-xs [&_td]:px-1"><thead><tr className="text-muted-foreground">
        <th className="py-1 text-start">#</th><th className="text-start">{t("Item", "الصنف")}</th><th className="text-end">{t("Qty", "الكمية")}</th><th className="text-end">{t("Amount", "المبلغ")}</th>
        <th className="text-start">{t("Asset Category", "فئة الأصل")}</th><th className="text-start">{t("Assets", "الأصول")}</th><th /></tr></thead>
        <tbody>{r.lines.map((l, i) => <tr key={l.row || i} className="border-t border-border" data-dp-invoice-asset-line={l.item}>
          <td className="py-1" data-no-i18n>{l.idx}</td><td data-no-i18n>{l.item} <span className="text-muted-foreground">{l.itemName !== l.item ? l.itemName : ""}</span></td>
          <td className="text-end tabular-nums" data-no-i18n>{l.qty}</td><td className="text-end tabular-nums" data-no-i18n>{fmtCurrency(l.amount, String(doc["currency"] ?? "") || undefined)}</td>
          <td data-no-i18n>{l.category || "—"}</td>
          <td>{l.assets.length ? l.assets.map((a) => <span key={a} className="me-1"><AssetA name={a} /></span>) : <span className="text-muted-foreground">{t("None yet", "لا يوجد بعد")}</span>}</td>
          <td className="text-end">{canCreate && <button type="button" className="btn-ghost py-0.5 text-xs" onClick={() => create(i)} data-dp-invoice-asset-create={l.item}>{t("Create asset", "إنشاء أصل")}</button>}</td></tr>)}</tbody></table></div>
      <p className="mt-2 text-[11px] text-muted-foreground">{t("Opens a draft Asset with the invoice, line, item, cost and date filled in; add the location if missing, then submit it as usual.", "يفتح أصلًا مسودة بالفاتورة والبند والصنف والتكلفة والتاريخ؛ أضف الموقع إن لم يوجد ثم اعتمده كالمعتاد.")}</p>
    </>}
  </section>;
}

/* FA8-b — on the Sell or Scrap Asset page */
export function PostedDisposalsPanel({ company, currency, user }: { company: string; currency: string; user: string }) {
  useScopeMetas(["GL Entry", "Journal Entry"]);
  const { t } = useT(); const r = postedDisposals(company, user);
  const money = (v: number) => fmtCurrency(v, currency);
  return <section className="dp-card mt-4" data-dp-posted-disposals={r.rows.length}>
    <h2 className="text-sm font-semibold">{t("Posted disposals — ledger check", "عمليات الاستبعاد المرحّلة — مطابقة الدفتر")}</h2>
    <p className="mt-1 text-xs text-muted-foreground">{t("Gain or loss posted in the General Ledger compared with selling amount minus value after depreciation, from the disposal journal entry's own GL rows.", "الربح أو الخسارة المرحّلة في دفتر الأستاذ مقارنةً بمبلغ البيع ناقص القيمة بعد الإهلاك، من قيود دفتر الأستاذ لقيد الاستبعاد نفسه.")}</p>
    {r.status !== "ok" ? <SourceState status={r.status} doctype="GL Entry" /> : !r.rows.length ? <p className="mt-2 text-xs text-muted-foreground" data-dp-posted-disposals-empty>{t("No sold or scrapped assets with a posted disposal entry.", "لا توجد أصول مباعة أو مخردة لها قيد استبعاد مرحّل.")}</p> :
      <div className="mt-2 overflow-x-auto"><table className="w-full text-xs [&_td]:whitespace-nowrap [&_td]:px-1"><thead><tr className="text-muted-foreground">
        <th className="py-1 text-start">{t("Asset", "الأصل")}</th><th className="text-start">{t("Date", "التاريخ")}</th><th className="text-start">{t("Journal Entry", "قيد اليومية")}</th>
        <th className="text-end">{t("Selling Amount", "مبلغ البيع")}</th><th className="text-end">{t("Value After Depreciation", "القيمة بعد الإهلاك")}</th><th className="text-end">{t("Posted gain / loss", "الربح / الخسارة المرحّلة")}</th><th className="text-start">{t("Check", "المطابقة")}</th></tr></thead>
        <tbody>{r.rows.map((x) => <tr key={x.asset} className="border-t border-border" data-dp-posted-disposal={x.asset} data-reconciled={x.reconciled && x.balanced}>
          <td className="py-1"><AssetA name={x.asset} /> <span className="text-muted-foreground" data-no-i18n>{x.assetName}</span></td><td className="tabular-nums" data-no-i18n>{fmtDate(x.date)}</td>
          <td><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "journal_entry", name: x.journal }} className="hover:underline" data-no-i18n>{x.journal}</Link></td>
          <td className="text-end tabular-nums" data-no-i18n>{money(x.proceeds)}</td><td className="text-end tabular-nums" data-no-i18n>{money(x.nbv)}</td>
          <td className={`text-end tabular-nums ${x.gainLoss < 0 ? "text-destructive" : "text-success-text"}`} data-no-i18n>{money(x.gainLoss)}</td>
          <td>{x.reconciled && x.balanced ? <span className="chip bg-success/15 text-[11px] text-success-text">{t("Matches", "مطابق")}</span>
            : <span className="chip bg-destructive/10 text-[11px] text-destructive" title={`${money(x.expected)}`}>{x.balanced ? t("Differs", "مختلف") : t("Not balanced", "غير متوازن")}</span>}</td></tr>)}</tbody></table></div>}
  </section>;
}

/* FA10-b — Maintenance & disposal workspace */
const WD_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], WD_AR = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const addMonth = (ym: string, k: number) => { const [y, m] = ym.split("-").map(Number) as [number, number]; const d = new Date(Date.UTC(y, m - 1 + k, 1)); return d.toISOString().slice(0, 7); };
export function MaintenanceCalendarPanel({ company, asOf, user }: { company: string; asOf: string; user: string }) {
  useScopeMetas(["Asset Maintenance", "Asset Maintenance Log", "Asset Maintenance Task"]);
  const { ar, t } = useT();
  const [month, setMonth] = useState(asOf.slice(0, 7));
  const [day, setDay] = useState<string | null>(null);
  const c = maintenanceCalendar(company, month, user);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array.from({ length: first }, () => null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(ar ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const sel = day ? c.days.get(day) ?? [] : [];
  return <section className="dp-card mt-4" data-dp-maint-calendar={c.total} aria-label={t("Maintenance calendar", "تقويم الصيانة")}>
    <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{t("Maintenance calendar", "تقويم الصيانة")}</h2>
      {c.overdue > 0 && <span className="chip bg-destructive/10 text-xs text-destructive">{t("Overdue", "متأخرة")} <bdi className="ms-1" data-no-i18n>{c.overdue}</bdi></span>}
      <div className="ms-auto flex items-center gap-1">
        <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => { setMonth(addMonth(month, -1)); setDay(null); }} aria-label={t("Previous month", "الشهر السابق")} data-dp-maint-prev><span aria-hidden>{ar ? "›" : "‹"}</span></button>
        <span className="min-w-[8rem] text-center text-xs font-medium" data-no-i18n data-dp-maint-month={month}>{label}</span>
        <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => { setMonth(addMonth(month, 1)); setDay(null); }} aria-label={t("Next month", "الشهر التالي")} data-dp-maint-next><span aria-hidden>{ar ? "‹" : "›"}</span></button></div></div>
    <p className="text-xs text-muted-foreground">{t("Open maintenance logs by due date, plus each plan task's next due date that has no log yet. Completed and cancelled items are left out.", "سجلات الصيانة المفتوحة حسب تاريخ الاستحقاق، ومعها تاريخ الاستحقاق التالي لكل مهمة لم يُنشأ لها سجل. تُستبعد المكتملة والملغاة.")}</p>
    {c.status !== "ok" ? <SourceState status={c.status} doctype="Asset Maintenance" /> : <>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px]" role="grid">
        {(ar ? WD_AR : WD_EN).map((w) => <div key={w} className="text-muted-foreground" role="columnheader">{w}</div>)}
        {cells.map((d, i) => { const ev = d ? c.days.get(d) ?? [] : []; const od = ev.some((e) => e.status === "Overdue");
          return d ? <button key={d} type="button" role="gridcell" disabled={!ev.length} onClick={() => setDay(day === d ? null : d)} aria-pressed={day === d} data-dp-maint-day={d} data-count={ev.length}
            className={`h-10 rounded-md border text-xs ${ev.length ? (od ? "border-destructive/40 bg-destructive/10" : "border-warning/50 bg-warning/15") : "border-border text-muted-foreground"} ${day === d ? "ring-2 ring-primary" : ""}`}>
            <span className="block tabular-nums" data-no-i18n>{Number(d.slice(8))}</span>{ev.length > 0 && <span className="block text-[10px] font-semibold tabular-nums" data-no-i18n>{ev.length}</span>}</button>
            : <div key={`b${i}`} />; })}
      </div>
      {!c.total && <p className="mt-2 text-xs text-muted-foreground" data-dp-maint-empty>{t("Nothing due this month.", "لا شيء مستحق هذا الشهر.")}</p>}
      {day && <ul className="mt-2 divide-y divide-border text-xs" data-dp-maint-list={day}>{sel.map((e) => <li key={`${e.refType}-${e.ref}-${e.task}`} className="flex flex-wrap items-center gap-2 py-1">
        <span className="tabular-nums" data-no-i18n>{fmtDate(e.date)}</span><AssetA name={e.asset} /><span data-no-i18n>{e.task}</span>
        <span className={`chip text-[11px] ${e.status === "Overdue" ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>{tr(e.status)}</span>
        <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: e.refType === "Asset Maintenance Log" ? "asset_maintenance_log" : "asset_maintenance", name: e.ref }} className="ms-auto hover:underline" data-no-i18n>{e.ref}</Link></li>)}</ul>}
    </>}
  </section>;
}
export function RepairVsNbvPanel({ company, currency, user }: { company: string; currency: string; user: string }) {
  useScopeMetas(["Asset Repair", "Asset"]);
  const { t } = useT(); const r = repairVsNbv(company, user);
  const max = Math.max(1, ...r.rows.flatMap((x) => [x.repairCost, x.nbv]));
  const money = (v: number) => fmtCurrency(v, currency);
  return <section className="dp-card mt-4" data-dp-repair-nbv={r.rows.length} aria-label={t("Repair cost vs book value", "تكلفة الإصلاح مقابل القيمة الدفترية")}>
    <h2 className="font-semibold">{t("Repair cost vs book value", "تكلفة الإصلاح مقابل القيمة الدفترية")}</h2>
    <p className="text-xs text-muted-foreground">{t("Submitted Asset Repairs (total repair cost) per asset against its current value after depreciation. Highest share first.", "إصلاحات الأصول المعتمدة (إجمالي تكلفة الإصلاح) لكل أصل مقابل قيمته الحالية بعد الإهلاك. الأعلى نسبة أولًا.")}</p>
    {r.status !== "ok" ? <SourceState status={r.status} doctype="Asset Repair" /> : !r.rows.length ? <SourceState status="empty" doctype="Asset Repair" /> :
      <ul className="mt-2 grid gap-2 text-xs">{r.rows.slice(0, 10).map((x) => <li key={x.asset} data-dp-repair-row={x.asset} data-ratio={x.ratio ?? ""}>
        <div className="flex flex-wrap items-center gap-2"><AssetA name={x.asset} /><span className="text-muted-foreground" data-no-i18n>{x.assetName}</span>
          <span className="ms-auto tabular-nums" data-no-i18n>{x.ratio === null ? "—" : `${x.ratio}%`}</span></div>
        <div className="mt-1 grid grid-cols-[6.5rem_1fr_auto] items-center gap-2"><span className="text-muted-foreground">{t("Repairs", "الإصلاحات")} <bdi data-no-i18n>({x.repairs})</bdi></span>
          <Meter value={x.repairCost} max={max} tone="attention" label={money(x.repairCost)} /><span className="tabular-nums" data-no-i18n>{money(x.repairCost)}</span></div>
        <div className="mt-0.5 grid grid-cols-[6.5rem_1fr_auto] items-center gap-2"><span className="text-muted-foreground">{t("Book value", "القيمة الدفترية")}</span>
          <Meter value={x.nbv} max={max} label={money(x.nbv)} /><span className="tabular-nums" data-no-i18n>{money(x.nbv)}</span></div></li>)}</ul>}
  </section>;
}

/* FIX-016-b — Depreciation & value workspace */
export function BookTaxPanel({ company, currency, user }: { company: string; currency: string; user: string }) {
  useScopeMetas(["Asset Depreciation Schedule", "Asset"]);
  const { t } = useT(); const r = bookTaxDifferences(company, user);
  const money = (v: number) => fmtCurrency(v, currency);
  return <section className="dp-card mt-4" data-dp-book-tax={r.rows.length} aria-label={t("Book vs tax book", "الدفتر المحاسبي مقابل الدفتر الضريبي")}>
    <h2 className="font-semibold">{t("Book vs tax book", "الدفتر المحاسبي مقابل الدفتر الضريبي")}</h2>
    <p className="text-xs text-muted-foreground">{t("Assets depreciated in more than one Finance Book: value after depreciation in the asset's default book and in each other book, and the difference (other − default).", "الأصول المهلكة في أكثر من دفتر تمويل: القيمة بعد الإهلاك في الدفتر الافتراضي للأصل وفي كل دفتر آخر، والفرق (الآخر − الافتراضي).")}</p>
    {r.status !== "ok" ? <SourceState status={r.status} doctype="Asset Depreciation Schedule" /> : !r.rows.length ? <p className="mt-2 text-xs text-muted-foreground" data-dp-book-tax-empty>{t("No asset has a second Finance Book yet. Add a tax Finance Book row on the asset to compare.", "لا يوجد أصل له دفتر تمويل ثانٍ بعد. أضف صف دفتر تمويل ضريبي على الأصل للمقارنة.")}</p> :
      <div className="mt-2 overflow-x-auto"><table className="w-full text-xs [&_td]:whitespace-nowrap [&_td]:px-1"><thead><tr className="text-muted-foreground">
        <th className="py-1 text-start">{t("Asset", "الأصل")}</th><th className="text-start">{t("Default book", "الدفتر الافتراضي")}</th><th className="text-end">{t("Value", "القيمة")}</th>
        <th className="text-start">{t("Other book", "الدفتر الآخر")}</th><th className="text-end">{t("Value", "القيمة")}</th><th className="text-end">{t("Difference", "الفرق")}</th></tr></thead>
        <tbody>{r.rows.map((x) => <tr key={`${x.asset}-${x.other}`} className="border-t border-border" data-dp-book-tax-row={x.asset} data-difference={x.difference}>
          <td className="py-1"><AssetA name={x.asset} /> <span className="text-muted-foreground" data-no-i18n>{x.assetName}</span></td>
          <td data-no-i18n>{x.book || "—"}</td><td className="text-end tabular-nums" data-no-i18n>{money(x.bookValue)}</td>
          <td data-no-i18n>{x.other || "—"}</td><td className="text-end tabular-nums" data-no-i18n>{money(x.otherValue)}</td>
          <td className="text-end font-medium tabular-nums" data-no-i18n>{money(x.difference)}</td></tr>)}
          <tr className="border-t-2 border-border font-semibold"><td className="py-1" colSpan={5}>{t("Total difference", "إجمالي الفرق")}</td><td className="text-end tabular-nums" data-no-i18n>{money(r.total)}</td></tr></tbody></table></div>}
  </section>;
}
