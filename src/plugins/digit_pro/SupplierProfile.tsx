// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * Supplier 360 page (/pro/supplier-360, owner OWN-56) — the purchasing twin of Customer 360. Without `supplier`: the
 * supplier directory ranked by payable. With `supplier`: identity (VAT, IBAN), payables / open orders / receipts to bill /
 * payments (Supplier360Panel, same basis as Accounts Payable), delivery reliability, open disputes and the supplier's
 * native documents. Every figure opens the filtered list or document.
 */
import { useState } from "react";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { Link } from "@tanstack/react-router";
import { fmtCurrency } from "@/lib/format";
import { useLang } from "@/i18n";
import { openDisputes } from "@/lib/coreShared/controls";
import { ProFrame } from "./ProFrame";
import { financeContext, todayIso } from "./finance";
import { Supplier360Panel } from "./SalesFlowPanel";
import { DocLink, NativeList } from "./Q2cUi";
import { deliveryReliability, supplierDirectory, supplierIdentity } from "./supplierProfile";
import { adapter } from "@/lib/adapter";
import { Meter } from "@/components/enterprise/kit";
import { PartyScoreCard, UpcomingDueCard } from "./ArInsights";
import { arRegister, filterAr } from "./aging";

export interface S360Search { supplier?: string | undefined; company?: string | undefined; q?: string | undefined }
export const S360_KEYS = ["supplier", "company", "q"];
const DTS = ["Supplier", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Payment Entry", "Supplier Quotation", "Bank Account", "Company"];

export function SupplierProfilePro({ search }: { search: S360Search }) {
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en);
  const [q, setQ] = useState(search.q ?? "");
  return <ProFrame title={t("Supplier 360", "ملف المورد الشامل 360")} tabs={false} doctypes={DTS}>{({ user }) => {
    const ctx = financeContext(search.company, user); const today = todayIso();
    if (!search.supplier) {
      const rows = supplierDirectory(today, user, q);
      return <section className="ent-frame" data-s360-directory={rows.length}>
        <header className="ent-frame-h flex-wrap"><div className="min-w-0 flex-1"><h2 className="ent-title">{t("Suppliers by payable", "الموردون حسب المستحق")}</h2>
          <p className="ent-frame-note">{t("Open a supplier for its full relationship: orders, receipts, invoices, payments, disputes and delivery reliability.", "افتح موردًا لترى العلاقة كاملة: الأوامر والاستلامات والفواتير والمدفوعات والنزاعات وموثوقية التوريد.")}</p></div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search suppliers", "ابحث عن مورد")} aria-label={t("Search suppliers", "ابحث عن مورد")} className="ent-colfilter h-9 w-56 text-sm" data-s360-search /></header>
        <div className="ent-frame-b overflow-x-auto">
          {!rows.length ? <p className="text-sm text-muted-foreground">{t("No suppliers you may read match.", "لا موردون مطابقون مسموح لك برؤيتهم.")}</p> :
          <EntTable id="pro-supplier-directory" wrap><table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr>
            <th className="py-2 text-start">{t("Supplier", "المورد")}</th><th className="text-start">{t("Group", "المجموعة")}</th><th className="text-end">{t("Payable", "المستحق")}</th>
            <th className="text-end">{t("Open orders", "أوامر مفتوحة")}</th><th className="text-end">{t("Receipts to bill", "استلامات للفوترة")}</th><th className="text-end">{t("Disputes", "نزاعات")}</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.supplier} className="border-t border-border hover:bg-muted/50" data-s360-row={r.supplier}>
              <td className="py-2"><Link to="/pro/supplier-360" search={{ supplier: r.supplier, company: search.company } as never} className="ent-title text-primary hover:underline" data-no-i18n>{r.name}</Link></td>
              <td data-no-i18n>{r.group}</td><td className="text-end tabular-nums" data-no-i18n>{fmtCurrency(r.payable, ctx.currency)}</td>
              <td className="text-end tabular-nums" data-no-i18n>{r.openOrders}</td><td className="text-end tabular-nums" data-no-i18n>{r.toBill}</td>
              <td className="text-end tabular-nums" data-no-i18n>{r.disputes || ""}</td></tr>)}</tbody></table></EntTable>}
        </div></section>;
    }
    const id = supplierIdentity(search.supplier); const doc = adapter.get("Supplier", search.supplier);
    if (!id || !doc) return <p className="text-sm text-muted-foreground" data-s360-missing>{t("This supplier does not exist or you may not read it.", "هذا المورد غير موجود أو لا يحق لك رؤيته.")}</p>;
    const rel = deliveryReliability(search.supplier, user);
    const disputes = openDisputes({ type: "Purchase Invoice" }).filter((d) => d.party === search.supplier);
    const f = (dt: string): [string, string, string][] => [["supplier", "=", search.supplier!], ...(dt === "Supplier" ? [] : [["company", "=", ctx.company] as [string, string, string]])];
    return <div className="space-y-4" data-s360-profile={search.supplier}>
      <section className="ent-frame"><div className="ent-frame-b flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1"><p className="ent-mint-chip" data-no-i18n>{id.group || t("Supplier", "مورد")}</p>
          <h2 className="ent-title mt-1 text-xl" data-no-i18n>{id.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground"><span>{t("VAT number", "الرقم الضريبي")}</span>: <bdi data-no-i18n data-s360-vat>{id.vat || "—"}</bdi>{id.country && <> · <span data-no-i18n>{id.country}</span></>}</p>
          <p className="text-xs text-muted-foreground"><span>{t("IBAN", "الآيبان")}</span>: <bdi data-no-i18n data-s360-iban>{id.ibans.join(" · ") || "—"}</bdi></p></div>
        <div className="flex flex-wrap gap-2">
          <Link to="/pro/supplier-360" search={{ company: search.company } as never} className="btn-ghost" data-s360-back>{t("← All suppliers", "← كل الموردين")}</Link>
          <Link to="/pro/general-ledger" search={{ company: ctx.company, party_type: "Supplier", party: search.supplier, from: "supplier-360" } as never} className="btn-ghost" data-s360-ledger>{t("Ledger", "دفتر الأستاذ")}</Link>
          <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "supplier", name: search.supplier }} className="btn-ghost">{t("Open supplier", "فتح المورد")}</Link>
        </div></div></section>
      <Supplier360Panel doc={doc} />
      <div className="grid gap-4 md:grid-cols-2">
        <section className="ent-frame" data-s360-reliability={rel.pct ?? "none"}><header className="ent-frame-h"><h3 className="ent-title">{t("Delivery reliability", "موثوقية التوريد")}</h3></header>
          <div className="ent-frame-b">{rel.pct === null ? <p className="text-sm text-muted-foreground">{t("No receipts against orders yet.", "لا استلامات مقابل أوامر بعد.")}</p> : <>
            <p className="text-3xl font-semibold tabular-nums" data-no-i18n>{rel.pct}%</p>
            <p className="text-xs text-muted-foreground"><span>{t("Lines received on or before the order's required date", "بنود استُلمت في موعدها أو قبله")}</span> · <span data-no-i18n>{rel.onTime}/{rel.onTime + rel.late}</span> · <span>{t("Receipts", "الاستلامات")}</span> <span data-no-i18n>{rel.receipts}</span></p>
            <div className="mt-2"><Meter value={rel.pct} max={100} label={`${rel.pct}%`} /></div></>}
          </div></section>
        <section className="ent-frame" data-s360-disputes={disputes.length}><header className="ent-frame-h"><h3 className="ent-title">{t("Open disputes", "نزاعات مفتوحة")}</h3></header>
          <div className="ent-frame-b">{!disputes.length ? <p className="text-sm text-muted-foreground">{t("No open disputes.", "لا نزاعات مفتوحة.")}</p> :
            <ul className="space-y-1 text-sm">{disputes.map((d) => <li key={d.name} className="flex gap-2"><DocLink dt="Purchase Invoice" name={d.invoice} /><span className="text-muted-foreground" data-no-i18n>{d.reason}</span><span className="ms-auto tabular-nums" data-no-i18n>{fmtCurrency(d.disputed_amount, ctx.currency)}</span></li>)}</ul>}
          </div></section>
      </div>
      <div className="grid gap-4 md:grid-cols-2" data-s360-pay>
        <PartyScoreCard side="payable" company={ctx.company} party={search.supplier} user={user} ar={ar} currency={ctx.currency || "SAR"} />
        <UpcomingDueCard rows={filterAr(arRegister("payable", ctx.company, undefined, user).rows, { party: search.supplier })} side="payable" ar={ar} currency={ctx.currency || "SAR"} />
      </div>
      <section className="ent-frame"><header className="ent-frame-h"><h3 className="ent-title">{t("Documents", "المستندات")}</h3></header>
        <div className="ent-frame-b flex flex-wrap gap-2" data-s360-docs>
          {(["Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice"] as const).map((dt) => <NativeList key={dt} doctype={dt} filters={f(dt) as never} className="btn-ghost"><span>{t(dt, ({ "Supplier Quotation": "عروض أسعار الموردين", "Purchase Order": "أوامر الشراء", "Purchase Receipt": "إيصالات الاستلام", "Purchase Invoice": "فواتير المشتريات" } as Record<string, string>)[dt]!)}</span></NativeList>)}
          <NativeList doctype="Payment Entry" filters={[["party_type", "=", "Supplier"], ["party", "=", search.supplier], ["company", "=", ctx.company]] as never} className="btn-ghost"><span>{t("Payments", "المدفوعات")}</span></NativeList>
          <Link to="/pro/payables" search={{ party: search.supplier, company: search.company } as never} className="btn-ghost">{t("Accounts payable", "الذمم الدائنة")}</Link>
        </div></section>
    </div>;
  }}</ProFrame>;
}
