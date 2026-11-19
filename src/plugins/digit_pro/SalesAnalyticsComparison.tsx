// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * SC-S-08 Sales Analytics (/pro/sales-analytics) — RXP-01: selecting a month bar or a group/month cell filters an in-page
 * source-document list whose total equals the selected cell (same per-document contributions), then opens the native
 * document. Saved Views keep basis, dimension, dates, selection, columns and sort per user.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { useCallback } from "react";
import { useLang } from "@/i18n";
import { Columns } from "@/components/enterprise/kit";
import { Button } from "@/components/ui/button";
import { fmtCurrency } from "@/lib/format";
import { adapter } from "@/lib/adapter";
import { ProFrame, SourceState } from "./ProFrame";
import { can, financeContext, slug } from "./finance";
import { salesAnalytics, salesSelection, type SaDoc, type SaTree } from "./ops";
import { previousPeriod, variance } from "./intelligence";
import { SortTh, ViewToolbar, useRegister } from "./ViewToolbar";
import { SALES_SPEC } from "./viewSpecs";
import type { Search } from "./savedViews";
import { DateInput } from "@/components/form/DateInput";

type Q = Record<string, string | undefined>;
const docs: SaDoc[] = ["Sales Order", "Delivery Note", "Sales Invoice"];
const trees: SaTree[] = ["Customer", "Customer Group", "Territory", "Item", "Item Group", "Sales Person"];
const CLEAR_SEL = { sel_key: undefined, sel_month: undefined, sel_prev: undefined };

export function SalesAnalyticsComparison({ search }: { search: Q }) {
  const nav = useNavigate(), ar = useLang() === "ar", t = (en: string, arabic: string) => (ar ? arabic : en);
  const set = useCallback((p: Q) => void nav({ to: "/pro/sales-analytics", search: (prev: Q) => ({ ...prev, ...p }), replace: true }), [nav]);
  const doc = docs.includes(search["doc"] as SaDoc) ? search["doc"] as SaDoc : "Sales Invoice", tree = trees.includes(search["tree"] as SaTree) ? search["tree"] as SaTree : "Customer", measure = search["measure"] === "qty" ? "qty" : "value", months = search["months"] === "12" ? 12 : 6;
  const labels: Record<string, string> = { "Sales Order": "أمر بيع", "Delivery Note": "إشعار تسليم", "Sales Invoice": "فاتورة مبيعات", Customer: "العميل", "Customer Group": "مجموعة العملاء", Territory: "المنطقة", Item: "الصنف", "Item Group": "مجموعة الأصناف", "Sales Person": "مندوب المبيعات" };
  const reg = useRegister(SALES_SPEC, search as Search);
  return <ProFrame title={t("Sales Analytics", "تحليل المبيعات")} tabs={false} doctypes={[...docs, "Customer", "Item", "Sales Person"]}>{({ user }) => {
    const ctx = financeContext(search["company"], user), r = salesAnalytics(ctx.company, { doc, tree, measure, months, from: search["from_date"], to: search["to_date"] }, user), period = previousPeriod(r.from, r.to);
    const prior = period ? salesAnalytics(ctx.company, { doc, tree, measure, months, from: period.from, to: period.to }, user) : null;
    if (r.status !== "ok") return <SourceState status={r.status} doctype={doc} />;
    const fmt = (n: number) => measure === "qty" ? n.toLocaleString(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 3 }) : fmtCurrency(n, ctx.currency);
    const old = new Map(prior?.rows.map((x) => [x.key, x]) || []), current = new Map(r.rows.map((x) => [x.key, x]));
    const val = (key: string, f: string) => { const c = current.get(key)?.total || 0, p = old.get(key)?.total || 0; return f === "previous" ? p : f === "variance" ? c - p : f === "dimension" ? 0 : c; };
    const so = reg.sort ?? SALES_SPEC.defaultSort!;
    const keys = [...new Set([...current.keys(), ...old.keys()])].sort((a, b) => so.field === "dimension" ? a.localeCompare(b) * (so.dir === "asc" ? 1 : -1) : (val(a, so.field) - val(b, so.field)) * (so.dir === "asc" ? 1 : -1) || a.localeCompare(b));
    const selKey = search["sel_key"], selMonth = search["sel_month"], selPrev = search["sel_prev"] === "1";
    const hasSel = selKey !== undefined || !!selMonth || selPrev;
    const src = selPrev ? prior : r;
    const selection = hasSel && src ? salesSelection(src.lines, selKey, selMonth) : null;
    const select = (key: string | null, month: string | null, previous = false) => set({ sel_key: key ?? undefined, sel_month: month ?? undefined, sel_prev: previous ? "1" : undefined });
    const openNative = () => {
      if (!src || !selection) return;
      const from = selMonth ? `${selMonth}-01` : src.from, to = selMonth ? new Date(Date.UTC(Number(selMonth.slice(0, 4)), Number(selMonth.slice(5, 7)), 0)).toISOString().slice(0, 10) : src.to;
      const filters: unknown[] = [["company", "=", ctx.company], ["docstatus", "=", "1"], [src.dateField, ">=", from > src.from ? from : src.from], [src.dateField, "<=", to < src.to ? to : src.to], ["name", "in", selection.rows.map((x) => x.doc)]];
      void nav({ to: "/app/$app/$doctype", params: { app: "erpnext", doctype: slug(doc) }, search: { filters: JSON.stringify(filters) } as never });
    };
    const isSel = (key: string | null, month: string | null, previous = false) => hasSel && (selKey ?? null) === key && (selMonth ?? null) === month && selPrev === previous;
    const select_ = (label: string, value: string, choices: string[], change: (v: string) => void) => <label className="dp-ctx-item"><span>{label}</span><select className="field-input" value={value} onChange={(e) => change(e.target.value)}>{choices.map((c) => <option key={c} value={c}>{ar ? labels[c] || c : c}</option>)}</select></label>;
    const cell = (key: string | null, v: number, month: string | null = null, previous = false) => <Button variant="link" className={`h-auto p-0 tabular-nums ${isSel(key, month, previous) ? "font-bold underline" : ""}`} aria-pressed={isSel(key, month, previous)} onClick={() => select(key, month, previous)} data-dp-sales-source={`${key ?? "*"}|${month ?? "*"}|${previous ? "prev" : "cur"}`} data-no-i18n>{fmt(v)}</Button>;
    const nameOf = (key: string) => { const f = tree === "Customer" ? ["Customer", "customer_name"] : tree === "Item" ? ["Item", "item_name"] : null; const d = f ? adapter.get(f[0]!, key) : undefined; const v = d && can(f![0]!, "read", d, user) ? String(d[f![1]!] ?? "") : ""; return v && v !== key ? v : ""; };
    const dimLabel = (key: string) => { if (key === "—") return <span>{t("Unassigned / unverified allocation", "غير معيّن / تخصيص غير متحقق")}</span>; const nm = nameOf(key);
      return <span className="block min-w-[10rem]" data-no-i18n>{nm ? <><span className="block font-medium">{nm}</span><bdi className="block whitespace-nowrap text-[11px] text-muted-foreground">{key}</bdi></> : <bdi className="whitespace-nowrap">{key}</bdi>}</span>; };
    return <>
      <section className="dp-context flex-wrap">{select_(t("Company", "الشركة"), ctx.company, ctx.companies, (v) => set({ company: v, ...CLEAR_SEL }))}{select_(t("Based On", "بناءً على"), doc, docs, (v) => set({ doc: v, ...CLEAR_SEL }))}{select_(t("Dimension", "البعد"), tree, trees, (v) => set({ tree: v, ...CLEAR_SEL }))}<label className="dp-ctx-item"><span>{t("Measure", "المقياس")}</span><select className="field-input" value={measure} onChange={(e) => set({ measure: e.target.value, ...CLEAR_SEL })}><option value="value">{t("Company currency value", "القيمة بعملة الشركة")}</option><option value="qty">{t("Quantity", "الكمية")}</option></select></label><label className="dp-ctx-item"><span>{t("From Date", "من تاريخ")}</span><DateInput className="field-input" value={r.from} onChange={(e) => set({ from_date: e.target.value, ...CLEAR_SEL })} /></label><label className="dp-ctx-item"><span>{t("To Date", "إلى تاريخ")}</span><DateInput className="field-input" value={r.to} onChange={(e) => set({ to_date: e.target.value, ...CLEAR_SEL })} /></label><Button asChild variant="outline" size="sm"><Link to="/report/$name" params={{ name: "Sales Analytics" }} search={{ company: ctx.company, from_date: r.from, to_date: r.to, doc_type: doc, tree_type: tree, value_quantity: measure === "qty" ? "Quantity" : "Value" } as never}>{t("Source report", "التقرير المصدر")}</Link></Button></section>
      <ViewToolbar spec={SALES_SPEC} search={search as Search} companies={ctx.companies} onApply={set} exporter={{ doctype: doc, filename: `sales_analytics_${ctx.company}_${r.from}_${r.to}`, build: () => {
        const columns = reg.cols.flatMap((k) => k === "months" ? r.months.map((m) => ({ fieldname: `m:${m}`, label: m })) : [{ fieldname: k, label: (() => { const c = SALES_SPEC.columns.find((x) => x.key === k)!; return k === "dimension" ? (ar ? labels[tree] ?? tree : tree) : ar ? c.ar : c.label; })() }]);
        const rows = keys.map((key) => { const c = val(key, "current"), p = val(key, "previous"); const cells = current.get(key)?.cells ?? {};
          return Object.fromEntries(columns.map((col) => [col.fieldname, col.fieldname.startsWith("m:") ? cells[col.fieldname.slice(2)] || 0 : col.fieldname === "dimension" ? (key === "—" ? t("Unassigned / unverified allocation", "غير معيّن / تخصيص غير متحقق") : key) : col.fieldname === "pct" ? (p ? Math.round(((c - p) / Math.abs(p)) * 1000) / 10 : "") : val(key, col.fieldname)])); });
        return { columns, rows }; } }} />
      {!r.valid ? <p className="mt-4 text-destructive">{t("Choose a valid date range.", "اختر نطاق تاريخ صحيحًا.")}</p> : <>
        <div className="mt-4 grid gap-3 md:grid-cols-3">{[{ label: t("Current period", "الفترة الحالية"), value: r.total }, { label: t("Previous equal-length period", "الفترة السابقة المساوية في المدة"), value: prior?.total || 0 }, { label: t("Variance", "الانحراف"), value: variance(r.total, prior?.total || 0).amount }].map((x) => <div key={x.label} className="ek-kpi-tile"><p className="text-xs text-muted-foreground">{x.label}</p><p className="mt-2 text-xl font-semibold tabular-nums" data-no-i18n>{fmt(x.value)}</p></div>)}</div>
        <p className="mt-3 text-xs text-muted-foreground" data-no-i18n>{r.from} — {r.to} / {period?.from} — {period?.to}</p>
        <section className="mt-5 border-y border-border py-4" aria-label={t("Monthly sales", "المبيعات الشهرية")} data-dp-sa-chart>
          <h2 className="text-sm font-semibold">{t("Monthly sales", "المبيعات الشهرية")} <span className="text-xs font-normal text-muted-foreground">· {ar ? labels[doc] : doc} · {measure === "qty" ? t("Quantity", "الكمية") : <bdi data-no-i18n>{ctx.currency}</bdi>}</span></h2>
          <div className="mt-3"><Columns ar={ar} height={180} fmt={fmt} axisFmt={fmt} data={r.months.map((m) => { const value = r.colTotals[m] || 0; const on = isSel(null, m);
            return { key: m, label: m, value, data: true, drill: m, ...(value < 0 ? { tone: "risk" as const } : {}), attrs: { "aria-pressed": String(on), "data-dp-sa-bar": m, "data-value": String(value), ...(on ? { "data-selected": "" } : {}) } }; })}
            wrap={(m, child, attrs) => <button type="button" className="ek-col-hit" onClick={() => select(null, String(m))} {...attrs}>{child}</button>} /></div>
          <p className="mt-1 text-[11px] text-muted-foreground">{t("Select a month bar or any amount below to list the exact source documents.", "اختر عمود شهر أو أي مبلغ أدناه لعرض المستندات المصدر بدقة.")}</p>
        </section>
        {selection && <section className="mt-4 dp-card" data-dp-sa-selection={selection.rows.length}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{t("Source documents", "المستندات المصدر")}</h2>
            <span className="chip bg-muted text-[11px]">{ar ? labels[tree] : tree}: {selKey === undefined ? t("All", "الكل") : dimLabel(selKey)}</span>
            <span className="chip bg-muted text-[11px]">{t("Month", "الشهر")}: <bdi data-no-i18n>{selMonth ?? (selPrev ? `${prior?.from} — ${prior?.to}` : `${r.from} — ${r.to}`)}</bdi></span>
            {selPrev && <span className="chip bg-warning/20 text-[11px]">{t("Previous period", "الفترة السابقة")}</span>}
            <span className="ms-auto text-sm">{t("Total", "الإجمالي")}: <b className="tabular-nums" data-dp-sa-selection-total data-no-i18n>{fmt(selection.total)}</b></span>
            <Button size="sm" variant="outline" disabled={!selection.rows.length} onClick={openNative} data-dp-sa-native>{t("Open these documents in the native list", "فتح هذه المستندات في القائمة الأصلية")}</Button>
            <Button size="sm" variant="ghost" onClick={() => set(CLEAR_SEL)}>{t("Clear selection", "إلغاء التحديد")}</Button>
          </div>
          {!selection.rows.length ? <p className="mt-2 text-sm text-muted-foreground">{t("No submitted documents make up this cell.", "لا توجد مستندات معتمدة تكوّن هذه الخلية.")}</p> :
            <div className="dp-reg mt-2"><EntTable id="pro-sales-cell-docs" wrap views={false}><table><thead><tr><th className="px-3 py-2 text-start">{ar ? labels[doc] : doc}</th><th className="px-3 py-2 text-start">{t("Date", "التاريخ")}</th><th className="px-3 py-2 text-start">{t("Customer", "العميل")}</th>{tree !== "Customer" && <th className="px-3 py-2 text-start">{ar ? labels[tree] : tree}</th>}<th className="px-3 py-2 text-end">{measure === "qty" ? t("Quantity", "الكمية") : t("Net amount (company currency)", "صافي المبلغ (عملة الشركة)")}</th></tr></thead>
              <tbody>{selection.rows.map((x) => <tr key={x.doc} data-dp-sa-doc={x.doc}><td className={reg.cell}><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: slug(doc), name: x.doc }} className="font-medium text-primary hover:underline" data-no-i18n><bdi>{x.doc}</bdi></Link></td><td className={`${reg.cell} tabular-nums`} data-no-i18n>{x.date}</td><td className={reg.cell} data-no-i18n>{(() => { const c = x.party ? adapter.get("Customer", x.party) : undefined; const nm = c && can("Customer", "read", c, user) ? String(c["customer_name"] ?? "") : ""; return nm && nm !== x.party ? <>{nm} <bdi className="text-[11px] text-muted-foreground">{x.party}</bdi></> : <bdi>{x.party || "—"}</bdi>; })()}</td>{tree !== "Customer" && <td className={`${reg.cell} text-xs`} data-no-i18n>{x.groups.join(", ")}</td>}<td className={`${reg.cell} text-end tabular-nums`} data-no-i18n>{fmt(x.value)}</td></tr>)}</tbody>
              <tfoot><tr><td className={reg.cell} colSpan={tree !== "Customer" ? 4 : 3}>{t("Total", "الإجمالي")} · <bdi data-no-i18n>{selection.rows.length}</bdi></td><td className={`${reg.cell} text-end tabular-nums`} data-no-i18n>{fmt(selection.total)}</td></tr></tfoot></table></EntTable></div>}
          {tree === "Sales Person" && <p className="mt-2 text-[11px] text-muted-foreground">{t("Amounts are each document's validated salesperson share — never the full document counted twice.", "المبالغ هي حصة مندوب المبيعات المتحقق منها لكل مستند — دون احتساب المستند كاملاً مرتين.")}</p>}
        </section>}
        <section className="mt-4" data-dp-sales-analytics>{!keys.length ? <div className="py-6"><SourceState status="empty" /></div> : <div className="dp-reg"><EntTable id="pro-sales-compare" wrap views={false}><table className="min-w-[720px]"><thead><tr>
          {reg.cols.flatMap((k) => k === "dimension" ? [<SortTh key={k} k="dimension" label={ar ? labels[tree]! : tree} sort={reg.sort} sortable onSort={(s) => set({ sort: s })} />]
            : k === "months" ? r.months.map((m) => <th key={m} className="px-3 py-2 text-end" data-no-i18n>{m}</th>)
            : [<SortTh key={k} k={k} label={ar ? SALES_SPEC.columns.find((c) => c.key === k)!.ar : SALES_SPEC.columns.find((c) => c.key === k)!.label} sort={reg.sort} sortable={SALES_SPEC.sorts.includes(k)} align="end" onSort={(s) => set({ sort: s })} />])}
        </tr></thead><tbody>{keys.map((key) => { const row = current.get(key), prev = old.get(key), v = variance(row?.total || 0, prev?.total || 0); return <tr key={key} data-dp-sa-row={key}>
          {reg.cols.flatMap((k) => k === "dimension" ? [<td key={k} className={reg.cell}>{dimLabel(key)}</td>]
            : k === "months" ? r.months.map((m) => <td key={m} className={`${reg.cell} text-end`}>{cell(key, row?.cells[m] || 0, m)}</td>)
            : k === "current" ? [<td key={k} className={`${reg.cell} text-end font-semibold`}>{cell(key, row?.total || 0)}</td>]
            : k === "previous" ? [<td key={k} className={`${reg.cell} text-end`}>{cell(key, prev?.total || 0, null, true)}</td>]
            : k === "variance" ? [<td key={k} className={`${reg.cell} text-end tabular-nums`} data-no-i18n>{fmt(v.amount)}</td>]
            : [<td key={k} className={`${reg.cell} text-end tabular-nums`} data-no-i18n>{v.percent === null ? "—" : `${v.percent.toFixed(1)}%`}</td>])}
        </tr>; })}</tbody></table></EntTable></div>}</section>
        {!!(r.allocationIssues + (prior?.allocationIssues || 0)) && <p className="mt-3 text-xs text-warning">{t("Unverified salesperson allocations remain unassigned; no percentages are guessed.", "تخصيصات مندوبي المبيعات غير المتحققة تبقى غير معيّنة؛ لا تُفترض نسب.")}</p>}
        <p className="mt-3 text-xs text-muted-foreground">{t("Submitted documents, net of returns. Orders are commitments, deliveries are fulfilment, invoices are billed sales—not collected cash or gross profit. Quantity totals may include different units.", "المستندات المرحّلة بصافي المرتجعات. الأوامر التزامات والتسليمات تنفيذ والفواتير مبيعات مفوترة؛ ليست نقدًا محصّلًا أو ربحًا إجماليًا. إجمالي الكمية قد يجمع وحدات مختلفة.")}</p>
      </>}
    </>;
  }}</ProFrame>;
}
