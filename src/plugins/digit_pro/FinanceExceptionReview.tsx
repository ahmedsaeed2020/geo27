// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
import { Link } from "@tanstack/react-router";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { fmtCurrency } from "@/lib/format";
import { financeExceptions, exceptionCurrencyTotals, type FinanceException } from "./financeExceptions";
import { SourceState } from "./ProFrame";
import { slug, type SourceStatus } from "./finance";

export function FinanceExceptionReview({company,from,to,user}:{company:string;from:string;to:string;user:string}) {
  const ar=useLang()==="ar",t=(en:string,arabic:string)=>ar?arabic:en;
  const result=financeExceptions(company,from,to,user);
  const register=(title:string,rows:FinanceException[],status:SourceStatus,bank:boolean)=> <section className="min-w-0" data-dp-exception-kind={bank?"bank":"payment"}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2"><h3 className="text-sm font-semibold">{title} <span className="text-muted-foreground" data-no-i18n>({status==="ok"?rows.length:"—"})</span></h3>{bank && <Button asChild variant="ghost" size="sm"><Link to="/pro/bank-reconciliation" search={{company}}>{t("Review matches","مراجعة المطابقة")}<ArrowUpRight /></Link></Button>}</div>
    {status!=="ok"?<SourceState status={status}/>:!rows.length?<div className="py-4"><SourceState status="empty"/></div>:<>
      <div className="flex flex-wrap gap-3 py-3 text-sm">{exceptionCurrencyTotals(rows).map(total=><span key={total.currency} className="font-semibold tabular-nums" data-no-i18n>{total.currency?fmtCurrency(total.amount,total.currency):`${total.amount.toLocaleString()} —`}</span>)}</div>
      <div className="max-h-80 overflow-auto"><EntTable id="pro-period-exceptions" wrap><table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="py-2 text-start">{t("Source document","المستند المصدر")}</th><th className="py-2 text-start">{t("Date","التاريخ")}</th><th className="py-2 text-end">{t("Unallocated","غير المخصص")}</th></tr></thead><tbody>{rows.map(row=><tr key={row.name} className="border-t border-border"><td className="py-3 pe-3"><Button asChild variant="link" className="h-auto whitespace-normal p-0 text-start"><Link to="/app/$app/$doctype/$name" params={{app:"erpnext",doctype:slug(row.doctype),name:row.name}} data-no-i18n data-dp-fin-exception={row.name}>{row.name}</Link></Button><div className="mt-1 text-xs text-muted-foreground" data-no-i18n>{row.party || "—"}</div></td><td className="py-3 pe-2 text-xs tabular-nums" data-no-i18n>{row.date}</td><td className="py-3 text-end tabular-nums" data-no-i18n>{row.currency?fmtCurrency(row.amount,row.currency):`${row.amount.toLocaleString()} —`}</td></tr>)}</tbody></table></EntTable></div>
    </>}
  </section>;
  return <section className="dp-card mt-6" data-dp-fin-exceptions data-dp-surface="finance-exceptions"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{t("Bank and allocation exceptions","استثناءات البنك والتخصيص")}</h2><span className="text-xs text-muted-foreground" data-no-i18n>{from} — {to}</span></div><div className="grid gap-6 xl:grid-cols-2">{register(t("Unreconciled bank amounts","مبالغ البنك غير المسوّاة"),result.bank,result.bankStatus,true)}{register(t("Unallocated posted payments","دفعات مرحّلة غير مخصصة"),result.payments,result.paymentStatus,false)}</div><p className="mt-3 text-xs text-muted-foreground">{t("Current unresolved amounts on documents dated in this period; not historical balances. Totals remain separate by currency. Review is advisory; native records control allocation.","المبالغ الحالية غير المعالجة في مستندات مؤرخة ضمن الفترة؛ ليست أرصدة تاريخية. الإجماليات منفصلة حسب العملة. المراجعة استرشادية؛ المستندات الأصلية تتحكم في التخصيص.")}</p></section>;
}