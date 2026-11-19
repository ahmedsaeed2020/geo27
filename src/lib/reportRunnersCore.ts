/**
 * Runners of the shared Core reports (src/lib/coreShared/coreReportEntries.ts). Zatca Integration Summary lists the
 * submitted sales invoices of the period with their e-invoice type and the latest ZATCA submission state recorded by
 * the Core integration log (providers.ts) — the regional app's summary, read from the same records the invoice form uses.
 */
import { adapter } from "./adapter";
import { integrationLogs, providerFor, STATUS_LABEL } from "./coreShared/providers";
import { C0, FROM, TO, S, between, col, cur, fl, flt, n, r2, rows as itemsOf, sub, type F, type Row, type Runner } from "./reportKit";
import { assetAccounts } from "./assets";

const STATES = ["", "Not sent", "Prepared", "Awaiting Provider", "Queued", "Sent", "Accepted", "Rejected", "Failed"];
const zatcaSummary: Runner = {
  src: "digit_core: ksa regional zatca_integration_summary (Core port)",
  filters: [C0, FROM, TO, fl("status", "ZATCA Status", "Select", STATES, "")],
  run: (f: F) => {
    const company = f["company"] || ""; const from = f["from_date"] || "0000-01-01"; const to = f["to_date"] || "9999-12-31";
    const logs = integrationLogs({ engine: "zatca", doctype: "Sales Invoice" }); const last = new Map<string, (typeof logs)[number]>();
    for (const l of logs) if (!last.has(l.reference_name)) last.set(l.reference_name, l);
    const prov = providerFor("zatca");
    const rows: Row[] = adapter.list("Sales Invoice").filter((d) => sub(d) && (!company || d["company"] === company) && between(d["posting_date"], from, to))
      .sort((a, b) => S(b["posting_date"]).localeCompare(S(a["posting_date"])) || a.name.localeCompare(b.name))
      .map((d) => { const l = last.get(d.name); const cust: Record<string, unknown> = adapter.get("Customer", S(d["customer"])) ?? {};
        const state = l?.status ?? "Not sent";
        return { sales_invoice: d.name, posting_date: S(d["posting_date"]), customer: S(d["customer"]), invoice_type: S(cust["tax_id"]).trim() ? "Standard (B2B)" : "Simplified (B2C)",
          is_return: n(d["is_return"]) ? 1 : 0, grand_total: r2(n(d["base_grand_total"] ?? d["grand_total"])), zatca_status: state, status_label: STATUS_LABEL[state][0],
          last_attempt: l?.last_attempt ?? "", attempts: l?.attempts ?? 0, provider: `${prov.provider} (${prov.mode})`, message: l?.summary ?? "" } as Row; })
      .filter((r) => !f["status"] || r["zatca_status"] === f["status"]);
    const total: Row = { sales_invoice: "Total", is_total: true, bold: true, grand_total: r2(rows.reduce((x, r) => x + n(r["grand_total"]), 0)), attempts: rows.reduce((x, r) => x + n(r["attempts"]), 0) };
    return { columns: [col("sales_invoice", "Sales Invoice", "Link", "Sales Invoice", 170), col("posting_date", "Posting Date", "Date", undefined, 100), col("customer", "Customer", "Link", "Customer", 180),
      col("invoice_type", "E-Invoice Type", "Data", undefined, 130), col("is_return", "Credit Note", "Int", undefined, 80), cur("grand_total", "Grand Total"), col("zatca_status", "ZATCA Status", "Data", undefined, 130),
      col("last_attempt", "Last Attempt", "Data", undefined, 150), col("attempts", "Attempts", "Int", undefined, 80), col("provider", "Provider", "Data", undefined, 150), col("message", "Message", "Data", undefined, 240)],
      rows: rows.length ? [...rows, total] : [] };
  },
};

/** Run11.1 B6-PU9: each billed line against its order and receipt — price, quantity and exchange-rate variance in company currency. */
const purchasePriceVariance: Runner = {
  src: "digit_core: purchase price / quantity / exchange variance by invoice line (Core report)",
  filters: [C0, FROM, TO, fl("supplier", "Supplier", "Link", "Supplier")],
  run: (f: F) => {
    const company = f["company"] || ""; const out: Row[] = [];
    for (const pi of adapter.list("Purchase Invoice")) {
      if (!sub(pi) || n(pi["is_return"]) || (company && pi["company"] !== company) || !between(pi["posting_date"], f["from_date"], f["to_date"]) || (f["supplier"] && pi["supplier"] !== f["supplier"])) continue;
      for (const it of itemsOf(pi)) {
        const po = it["purchase_order"] ? adapter.get("Purchase Order", S(it["purchase_order"])) : undefined; if (!po || n(po["docstatus"]) !== 1) continue;
        const poRow = itemsOf(po).find((r) => it["po_detail"] && r.name === it["po_detail"]) ?? itemsOf(po).find((r) => r["item_code"] === it["item_code"]); if (!poRow) continue;
        const pr = it["purchase_receipt"] ? adapter.get("Purchase Receipt", S(it["purchase_receipt"])) : undefined;
        const prRow = pr ? itemsOf(pr).find((r) => it["pr_detail"] && r.name === it["pr_detail"]) ?? itemsOf(pr).find((r) => r["item_code"] === it["item_code"]) : undefined;
        const qty = n(it["qty"]); const poRate = n(poRow["rate"]); const piRate = n(it["rate"]);
        const piFx = n(pi["conversion_rate"]) || 1; const poFx = n(po["conversion_rate"]) || 1;
        const received = prRow ? n(prRow["received_qty"] ?? prRow["qty"]) : poRow["received_qty"] !== undefined ? n(poRow["received_qty"]) : qty;
        const price = r2((piRate - poRate) * qty * piFx); const qtyVar = r2((qty - Math.min(qty, received)) * poRate * poFx); const fx = r2((piFx - poFx) * qty * poRate);
        out.push({ purchase_invoice: pi.name, posting_date: S(pi["posting_date"]), supplier: S(pi["supplier"]), purchase_order: po.name, purchase_receipt: pr?.name ?? "", item_code: S(it["item_code"]),
          qty, received_qty: received, po_rate: poRate, invoice_rate: piRate, price_variance: price, qty_variance: qtyVar, fx_variance: fx, total_variance: r2(price + qtyVar + fx) });
      }
    }
    out.sort((a, b) => Math.abs(n(b["total_variance"])) - Math.abs(n(a["total_variance"])) || S(a["purchase_invoice"]).localeCompare(S(b["purchase_invoice"])));
    const sum = (k: string) => r2(out.reduce((x, r) => x + n(r[k]), 0));
    const total: Row = { purchase_invoice: "Total", is_total: true, bold: true, price_variance: sum("price_variance"), qty_variance: sum("qty_variance"), fx_variance: sum("fx_variance"), total_variance: sum("total_variance") };
    return { columns: [col("purchase_invoice", "Purchase Invoice", "Link", "Purchase Invoice", 160), col("posting_date", "Posting Date", "Date", undefined, 100), col("supplier", "Supplier", "Link", "Supplier", 170),
      col("purchase_order", "Purchase Order", "Link", "Purchase Order", 150), col("purchase_receipt", "Purchase Receipt", "Link", "Purchase Receipt", 150), col("item_code", "Item Code", "Link", "Item", 150),
      flt("qty", "Qty"), flt("received_qty", "Received Qty"), cur("po_rate", "Order Rate"), cur("invoice_rate", "Invoice Rate"), cur("price_variance", "Price Variance"), cur("qty_variance", "Qty Variance"),
      cur("fx_variance", "Exchange Variance"), cur("total_variance", "Total Variance")], rows: out.length ? [...out, total] : [] };
  },
};

/** Run11.1 B6-FA5: opening → additions → disposals → closing cost and accumulated depreciation per fixed asset account, reconciled with the ledger. */
const assetRollforward: Runner = {
  src: "digit_core: fixed asset rollforward bridge with asset ↔ GL reconciliation (Core report)",
  filters: [C0, FROM, TO, fl("finance_book", "Finance Book", "Link", "Finance Book")],
  run: (f: F) => {
    const company = f["company"] || ""; const from = f["from_date"] || "0000-01-01"; const to = f["to_date"] || "9999-12-31";
    type G = { account: string; accumulated: string; categories: Set<string>; count: number; opening: number; additions: number; disposals: number; accOpen: number; dep: number; accDisp: number };
    const groups = new Map<string, G>();
    const schedules = adapter.list("Asset Depreciation Schedule").filter((s) => n(s["docstatus"]) !== 2);
    for (const a of adapter.list("Asset")) {
      if (!sub(a) || (company && a["company"] !== company)) continue;
      const start = S(a["available_for_use_date"] || a["purchase_date"]); if (!start || start > to) continue;
      const gone = ["Sold", "Scrapped"].includes(S(a["status"])) ? S(a["disposal_date"]) : ""; if (gone && gone < from) continue;
      const acc = assetAccounts(a); const g = groups.get(acc.fixed) ?? { account: acc.fixed, accumulated: acc.accumulated, categories: new Set<string>(), count: 0, opening: 0, additions: 0, disposals: 0, accOpen: 0, dep: 0, accDisp: 0 };
      groups.set(acc.fixed, g); g.categories.add(S(a["asset_category"])); g.count++;
      const cost = n(a["gross_purchase_amount"] ?? a["net_purchase_amount"] ?? a["total_asset_cost"]);
      const book = f["finance_book"] || S(a["default_finance_book"]); const mine = schedules.filter((s) => s["asset"] === a.name);
      const sch = mine.find((s) => S(s["finance_book"]) === book) ?? mine[0];
      const posted = ((sch?.["depreciation_schedule"] as Row[] | undefined) ?? []).filter((r) => r["journal_entry"] && r["journal_entry"] !== "preview");
      const before = posted.filter((r) => S(r["schedule_date"]) < from).reduce((x, r) => x + n(r["depreciation_amount"]), 0);
      const inPeriod = posted.filter((r) => between(r["schedule_date"], from, to)).reduce((x, r) => x + n(r["depreciation_amount"]), 0);
      const openAcc = n(a["opening_accumulated_depreciation"]);
      if (start < from) { g.opening += cost; g.accOpen += openAcc + before; } else { g.additions += cost; g.accOpen += openAcc; }
      g.dep += inPeriod;
      if (gone && between(gone, from, to)) { g.disposals += cost; g.accDisp += openAcc + before + inPeriod; }
    }
    const gl = (account: string, sign: 1 | -1) => r2(adapter.list("GL Entry").filter((e) => e["account"] === account && !n(e["is_cancelled"]) && (!company || e["company"] === company) && S(e["posting_date"]) <= to)
      .reduce((x, e) => x + sign * (n(e["debit"]) - n(e["credit"])), 0));
    const out: Row[] = [...groups.values()].sort((a, b) => a.account.localeCompare(b.account)).map((g) => {
      const closing = r2(g.opening + g.additions - g.disposals); const closingAcc = r2(g.accOpen + g.dep - g.accDisp);
      const glCost = gl(g.account, 1); const glAcc = gl(g.accumulated, -1);
      return { account: g.account, categories: [...g.categories].filter(Boolean).join(", "), assets: g.count, opening_cost: r2(g.opening), additions: r2(g.additions), disposals: r2(g.disposals), closing_cost: closing,
        opening_accumulated: r2(g.accOpen), period_depreciation: r2(g.dep), accumulated_disposals: r2(g.accDisp), closing_accumulated: closingAcc, net_book_value: r2(closing - closingAcc),
        gl_cost: glCost, cost_difference: r2(glCost - closing), accumulated_account: g.accumulated, gl_accumulated: glAcc, accumulated_difference: r2(glAcc - closingAcc) } as Row;
    });
    const sum = (k: string) => r2(out.reduce((x, r) => x + n(r[k]), 0));
    const keys = ["opening_cost", "additions", "disposals", "closing_cost", "opening_accumulated", "period_depreciation", "accumulated_disposals", "closing_accumulated", "net_book_value", "gl_cost", "cost_difference", "gl_accumulated", "accumulated_difference"];
    const total: Row = { account: "Total", is_total: true, bold: true, assets: out.reduce((x, r) => x + n(r["assets"]), 0), ...Object.fromEntries(keys.map((k) => [k, sum(k)])) };
    return { columns: [col("account", "Fixed Asset Account", "Link", "Account", 200), col("categories", "Asset Categories", "Data", undefined, 180), col("assets", "Assets", "Int", undefined, 70),
      cur("opening_cost", "Opening Cost"), cur("additions", "Additions"), cur("disposals", "Disposals"), cur("closing_cost", "Closing Cost"), cur("opening_accumulated", "Opening Accumulated"),
      cur("period_depreciation", "Period Depreciation"), cur("accumulated_disposals", "Accumulated on Disposals"), cur("closing_accumulated", "Closing Accumulated"), cur("net_book_value", "Net Book Value"),
      cur("gl_cost", "GL Fixed Asset Balance"), cur("cost_difference", "Cost Difference"), col("accumulated_account", "Accumulated Depreciation Account", "Link", "Account", 200),
      cur("gl_accumulated", "GL Accumulated Balance"), cur("accumulated_difference", "Accumulated Difference")], rows: out.length ? [...out, total] : [] };
  },
};

export const CORE_RUNNERS: Record<string, Runner> = { "Zatca Integration Summary": zatcaSummary, "Purchase Price Variance": purchasePriceVariance, "Asset Rollforward": assetRollforward };
