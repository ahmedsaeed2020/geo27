import type { Doc } from "@/lib/adapter";
import { useL } from "@/components/crm/crmI18n";
import { dealProb, dealValue } from "./wf02";
import { weightedOf } from "./wf08";

/** Additive calculated forecast; the native Expected Deal Value field remains untouched. */
export function DealFinancialSummary({ doc }: { doc: Doc }) {
  const { lang } = useL();
  const currency = String(doc["currency"] || "");
  const money = (value: number | null) => value === null ? "—" : `${currency} ${value.toLocaleString("en-US")}`;
  const labels = lang === "ar" ? ["قيمة الصفقة", "الاحتمالية", "القيمة المرجحة"] : ["Deal Value", "Probability", "Weighted Value"];
  const values = [money(dealValue(doc)), `${dealProb(doc)}%`, money(weightedOf(doc))];
  return <dl data-crm-financial-summary className="my-4 grid grid-cols-3 gap-4 border-y border-border py-4">{labels.map((label, i) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd data-no-i18n dir="ltr" className="mt-1 overflow-x-auto whitespace-nowrap text-lg font-semibold tabular-nums">{values[i]}</dd></div>)}</dl>;
}