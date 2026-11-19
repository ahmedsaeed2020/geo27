import { isServerHosted } from "@/lib/serverHost";
/**
 * Demo billing for one CRM-linked customer so Customer 360 "Billing & receivables" has data.
 * Insert-if-missing with explicit names; invoices are submitted only through posting.ts (no direct ledger writes).
 */
import { adapter } from "@/lib/adapter";
import { submit } from "@/lib/posting";

export const DEMO_CUST = "DCRM-CUST-001";

export function seedCrmBilling(): string[] {
  if (isServerHosted()) return [] as never;
  const errs: string[] = [];
  const org = adapter.list("CRM Organization")[0];
  const item = adapter.get("Item", "SYN-ITEM-001") ?? adapter.list("Item")[0];
  const base = adapter.get("Sales Invoice", "SYN-SINV-0001");
  if (!org || !item || !base) return ["missing org/item/base invoice"];
  if (!adapter.get("Customer", DEMO_CUST))
    adapter.insertDoc("Customer", { name: DEMO_CUST, customer_name: org.name, customer_type: "Company", customer_group: "Commercial", territory: "Saudi Arabia", default_currency: "SAR" });
  const row = (qty: number) => [{ ...(base["items"] as Record<string, unknown>[])[0], item_code: item.name, item_name: item["item_name"], qty, amount: qty * Number(item["standard_rate"] ?? 100), rate: Number(item["standard_rate"] ?? 100), name: undefined }];
  const mk = (n: string, qty: number, date: string, due: string) => {
    if (adapter.get("Sales Invoice", n)) return;
    const items = row(qty); const t = items.reduce((a, r) => a + r.amount, 0);
    const { name: _b, docstatus: _d, ...rest } = base as Record<string, unknown>;
    adapter.insertDoc("Sales Invoice", { ...rest, name: n, customer: DEMO_CUST, customer_name: org.name, posting_date: date, due_date: due, items, total: t, net_total: t, grand_total: t, outstanding_amount: t, status: "Draft", __synthetic: 1 });
    errs.push(...submit("Sales Invoice", n));
  };
  // dates relative to today (owner rule: no fixed calendar dates in demo data)
  const rel = (d: number) => { const x = new Date(); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
  mk("DCRM-SINV-0001", 3, rel(-50), rel(-20)); // overdue 20 days
  mk("DCRM-SINV-0002", 2, rel(-15), rel(15)); // current
  return errs;
}
