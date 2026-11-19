/** Read-only exception review; native bank/payment records remain the allocation authority. */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { bankLines } from "./bank";
import { sourceStatus } from "./finance";

export const EXCEPTION_SOURCES = ["Bank Transaction", "Bank Account"];
export type FinanceException = { name: string; doctype: "Bank Transaction" | "Payment Entry"; date: string; currency: string; amount: number; party: string; direction: string };
const number = (v: unknown) => Number(v) || 0;
/** Never infer company for an orphan bank line or combine different currencies into a total. */
export function selectFinanceExceptions(bank: Doc[], accounts: Doc[], payments: Doc[], company: string, from: string, to: string) {
  const owners = new Map(accounts.map(a => [a.name, String(a["company"] || "")]));
  const dated = (date: string) => !!date && (!from || date >= from) && (!to || date <= to);
  const bankRows: FinanceException[] = bankLines(bank.filter(d => {
    const owner = owners.get(String(d["bank_account"] || ""));
    return d["company"] ? d["company"] === company && (!owner || owner === company) : owner === company;
  }), company).filter(l => l.unallocated > 0 && !["Reconciled","Settled","Cancelled"].includes(l.status) && dated(l.date)).map(l => ({ name:l.name,doctype:"Bank Transaction",date:l.date,currency:String(l.doc["currency"] || ""),amount:l.unallocated,party:l.account,direction:l.direction }));
  // Core formCalc derives unallocated_amount from paid_amount (paid-from currency), not bank received_amount.
  const paymentRows: FinanceException[] = payments.filter(d => d["company"] === company && number(d.docstatus) === 1 && ["Receive","Pay"].includes(String(d["payment_type"])) && number(d["unallocated_amount"]) > 0 && dated(String(d["posting_date"] || ""))).map(d => ({name:d.name,doctype:"Payment Entry",date:String(d["posting_date"]),currency:String(d["paid_from_account_currency"] || ""),amount:number(d["unallocated_amount"]),party:String(d["party"] || ""),direction:String(d["payment_type"])}));
  const sort = (rows: FinanceException[]) => rows.sort((a,b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  return { bank:sort(bankRows), payments:sort(paymentRows) };
}
export function exceptionCurrencyTotals(rows: FinanceException[]) {
  const totals = new Map<string,number>();
  for (const row of rows) totals.set(row.currency,(totals.get(row.currency) || 0)+row.amount);
  return [...totals].map(([currency,amount]) => ({currency,amount:Math.round(amount*100)/100}));
}
export function financeExceptions(company: string, from: string, to: string, user: string) {
  const bankStatus = sourceStatus("Bank Transaction",user), accountStatus = sourceStatus("Bank Account",user), paymentStatus = sourceStatus("Payment Entry",user);
  const bankAccess = bankStatus === "ok" ? accountStatus : bankStatus;
  const rows = selectFinanceExceptions(bankAccess === "ok" ? scopedList("Bank Transaction",user) : [],bankAccess === "ok" ? scopedList("Bank Account",user) : [],paymentStatus === "ok" ? scopedList("Payment Entry",user) : [],company,from,to);
  return { ...rows, bankStatus:bankAccess, paymentStatus };
}