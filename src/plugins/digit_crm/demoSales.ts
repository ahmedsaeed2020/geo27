import { isServerHosted } from "@/lib/serverHost";
/** Synthetic commercial documents are submitted ONLY through the canonical virtual posting engine. */
import { adapter, type Doc } from "@/lib/adapter";
import { activeDemoProfile, CRM_DEMO_PROFILE } from "./dataContext";
import { submit, makePaymentEntry } from "@/lib/posting";
import { DEMO_TYPES } from "./demoSchema";
const n = (kind: string, i: number) => `DCE-${kind}-${String(i + 1).padStart(4, "0")}`;
const datePlus = (d: string, days: number) => new Date(Date.parse(`${d.slice(0, 10)}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const tag = { __synthetic: 1, __fixture_id: CRM_DEMO_PROFILE };
export function seedDemoSales(asOf: string) {
  if (isServerHosted()) return undefined as never;
  if (!activeDemoProfile()) throw new Error("Demo partition required");
  const put = (dt: string, name: string, data: Record<string, unknown>) => adapter.insertDocQuiet(dt, { ...tag, ...data, name, owner: "Administrator", creation: `${String(data["posting_date"] ?? data["transaction_date"] ?? asOf).slice(0, 10)}T12:00:00Z` });
  const post = (dt: string, name: string) => { const errors = submit(dt, name); if (errors.length) throw new Error(`${dt} ${name}: ${errors.join("; ")}`); };
  const companies = adapter.list("Company");
  for (const co of companies) {
    const ab = String(co["abbr"]);
    for (const [account, root, type] of [["Debtors", "Asset", "Receivable"], ["Sales", "Income", "Income Account"], ["Demo Bank", "Asset", "Bank"]]) put("Account", `${account} - ${ab}`, { account_name: account, company: co.name, account_currency: "SAR", root_type: root, report_type: root === "Income" ? "Profit and Loss" : "Balance Sheet", account_type: type, is_group: 0 });
  }
  put("Mode of Payment", "Bank Transfer", { type: "Bank", enabled: 1 });
  const deals = adapter.list("CRM Deal").sort((a, b) => a.name.localeCompare(b.name));
  const eligible = deals.filter(d => d["status"] === "Won");
  for (let i = 0; i < 220; i++) {
    const org = adapter.get("CRM Organization", n("ORG", i));
    const deal = eligible.find(d => d["organization"] === org?.name);
    put("Customer", n("CUST", i), { customer_name: String(org?.["organization_name"] ?? n("ORG", i)), customer_type: "Company", customer_group: "DCE-Commercial", territory: String(org?.["territory"] ?? ""), default_currency: "SAR", crm_deal: deal?.name ?? "" });
  }
  const customerFor = (d: Doc) => n("CUST", Number(String(d["organization"]).split("-").at(-1)) - 1);
  const item = (d: Doc, dt: string, name: string, extra: Record<string, unknown> = {}) => {
    const product = (d["products"] as Doc[])[0];
    if (!product) throw new Error("Deal must have products");
    return [{ name: `${name}-ROW`, doctype: `${dt} Item`, parent: name, parenttype: dt, parentfield: "items", idx: 1, item_code: product["product_code"], item_name: product["product_name"], description: product["product_name"], qty: product["qty"], rate: product["rate"], amount: product["amount"], net_amount: product["net_amount"], base_amount: product["amount"], base_net_amount: product["net_amount"], uom: "Nos", stock_uom: "Nos", conversion_factor: 1, income_account: `Sales - ${String(adapter.get("Company", String(d["custom_demo_company"]))?.["abbr"])}`, ...extra }];
  };
  const common = (d: Doc) => ({ company: d["custom_demo_company"], currency: "SAR", conversion_rate: 1, selling_price_list: "DCE-Selling-SAR", price_list_currency: "SAR", plc_conversion_rate: 1, total: d["deal_value"], net_total: d["deal_value"], base_net_total: d["deal_value"], grand_total: d["deal_value"], base_grand_total: d["deal_value"], order_type: "Sales", docstatus: 0 });
  for (let i = 0; i < 400; i++) {
    const d = i < 240 ? eligible[i % eligible.length] : deals[i]; if (!d) continue;
    const name = n("QTN", i), date = String(d["closed_date"] || String(d["creation"]).slice(0, 10));
    put("Quotation", name, { ...common(d), naming_series: "SAL-QTN-.YYYY.-", is_active: 1, quotation_to: "Customer", party_name: customerFor(d), transaction_date: date, valid_till: datePlus(asOf, 90), crm_deal: d.name, items: item(d, "Quotation", name), status: "Draft" });
    if (i < 240) post("Quotation", name);
  }
  for (let i = 0; i < 240; i++) {
    const d = eligible[i % eligible.length]; if (!d) continue;
    const name = n("SO", i), q = n("QTN", i), date = datePlus(String(d["closed_date"]), 1);
    put("Sales Order", name, { ...common(d), naming_series: "SAL-ORD-.YYYY.-", customer: customerFor(d), customer_name: adapter.get("Customer", customerFor(d))?.["customer_name"], transaction_date: date, delivery_date: datePlus(date, 7), items: item(d, "Sales Order", name, { prevdoc_docname: q, quotation_item: `${q}-ROW` }), sales_team: [{ name: `${name}-TEAM`, doctype: "Sales Team", parent: name, parenttype: "Sales Order", parentfield: "sales_team", idx: 1, sales_person: (d["sales_team"] as Doc[])[0]?.["sales_person"], allocated_percentage: 100, allocated_amount: d["deal_value"] }], status: "Draft" });
    post("Sales Order", name);
  }
  const paidInvoices: { invoice: string; payment: string; amount: number; d: Doc; date: string }[] = [];
  for (let i = 0; i < 160; i++) {
    const d = eligible[i % eligible.length]; if (!d) continue;
    const name = n("INV", i), order = n("SO", i), date = datePlus(String(d["closed_date"]), 2), ab = String(adapter.get("Company", String(d["custom_demo_company"]))?.["abbr"]);
    put("Sales Invoice", name, { ...common(d), naming_series: "ACC-SINV-.YYYY.-", customer: customerFor(d), customer_name: adapter.get("Customer", customerFor(d))?.["customer_name"], posting_date: date, due_date: datePlus(date, i % 4 === 0 ? 90 : 30), debit_to: `Debtors - ${ab}`, update_stock: 0, items: item(d, "Sales Invoice", name, { sales_order: order, so_detail: `${order}-ROW` }), status: "Draft" });
    post("Sales Invoice", name);
    if (i < 110) {
      const amount = Number(d["deal_value"]) * (i % 3 === 0 ? 0.5 : 1), payment = makePaymentEntry("Sales Invoice", name, amount), payDate = datePlus(date, 3);
      adapter.update("Payment Entry", payment.name, { ...tag, naming_series: "ACC-PAY-.YYYY.-", posting_date: payDate, reference_date: payDate, reference_no: `SIMULATED-${name}`, creation: `${payDate}T12:00:00Z` });
      post("Payment Entry", payment.name);
      paidInvoices.push({ invoice: name, payment: payment.name, amount, d, date: payDate });
    }
  }
  for (let i = 0; i < 275; i++) {
    const source = paidInvoices[i % paidInvoices.length]; if (!source) continue;
    const states = ["Pending", "Approved", "Held", "Rejected", "Reversed"], state = states[Math.floor(i / 55)] ?? "Pending";
    // Five slices share each collection; total positive basis cannot exceed that collection.
    const basis = source.amount / 5, rate = 2, amount = Math.round(basis * rate) / 100 * (state === "Reversed" ? -1 : 1);
    put(DEMO_TYPES.commission, n("COMMISSION", i), { company: source.d["custom_demo_company"], salesperson: source.d["deal_owner"], period: source.date.slice(0, 7), deal: source.d.name, invoice: source.invoice, payment: source.payment, basis, rate, amount, state, reason: state === "Held" ? "مراجعة مدير" : state === "Rejected" ? "اعتراض تجريبي" : state === "Reversed" ? "مثال استرداد — لا قيد مالي" : "مثال حسابي فقط", policy_version: "DEMO-COLLECTED-2PCT-V1-NOT-PRODUCTION" });
  }
  adapter.flush();
}