// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
import { adapter } from "@/lib/adapter";
/**
 * Rich department rows (owner 2026-11-13 §2.1–2.2): extra dashboard rows built from figures the Core records already hold —
 * each a different visual idea (gauge against a full-scale target, party × ageing heatmap, category × location matrix,
 * in-vs-out comparison). Every figure is a sum over permission-scoped native records (scopedList / aging), every block
 * states its source and opens the register behind it; nothing is stored and no figure is invented.
 */
import type { ReactNode } from "react";
import { SplitBars } from "@/components/enterprise/kit/SplitCard";
import { linkTitle } from "@/lib/linkTitle";
import { Link } from "@tanstack/react-router";
import { AreaChart, ChartCard, HalfGauge, Heatmap, money, moneyShort, monthLabel, type Datum } from "@/components/enterprise/kit";
import { fmtCurrency } from "@/lib/format";
import { scopedList } from "@/lib/scope";
import { translateTo } from "@/i18n";
import { aging, SEGMENTS, SEGMENTS_AR, type Side } from "./aging";
import { sourceStatus } from "./finance";
import { SourceState } from "./ProFrame";
import { proWrap } from "./ProKit";

const n = (v: unknown) => Number(v) || 0;
const sub = (ar: boolean, doctype: string, extra?: string) => <>{ar ? "المصدر: " : "Source: "}{translateTo(doctype, ar ? "ar" : "en")}{extra ? ` · ${extra}` : ""}</>;

/** Parties × ageing bands (open invoice balances, company currency) — the receivables / payables ageing as a heatmap. */
/** the party's own name (customer_name / supplier_name) instead of its code; the code stays when no name is stored */
function partyName(side: "receivable" | "payable", party: string): string {
  const dt = side === "receivable" ? "Customer" : "Supplier", d = adapter.get(dt, party);
  const n = d?.[side === "receivable" ? "customer_name" : "supplier_name"];
  return typeof n === "string" && n.trim() ? n : linkTitle(dt, party) || party;
}
export function AgingHeat({ side, company, currency, user, ar }: { side: Side; company: string; currency: string; user: string; ar: boolean }) {
  const a = aging(side, company, user);
  const t = (en: string, x: string) => (ar ? x : en);
  const top = a.parties.slice().sort((x, y) => y.total - x.total).slice(0, 8);
  const to = side === "receivable" ? "/pro/receivables" : "/pro/payables";
  return <ChartCard id={`heat-${side}`} title={side === "receivable" ? t("Customers × ageing", "العملاء × أعمار الديون") : t("Suppliers × due ageing", "الموردون × أعمار الاستحقاق")}
    sub={sub(ar, a.doctype, t("open balances, top 8 parties", "الأرصدة المفتوحة، أعلى 8 أطراف"))} action={<Link to={to} search={{ company } as never} data-dp-heat-open={side}>{t("Open the register", "فتح السجل")}</Link>}
    attrs={{ "data-dp-rich": `heat-${side}` }}>
    {a.status !== "ok" ? <SourceState status={a.status} doctype={a.doctype} /> : !top.length ? <SourceState status="empty" />
      : <Heatmap ar={ar} dataRows rows={top.map((p) => partyName(side, p.party))} cols={(ar ? SEGMENTS_AR : SEGMENTS).slice(0, 5) as string[]} values={top.map((p) => p.buckets.slice(0, 5))} fmt={(v) => fmtCurrency(v, currency)} scale={side === "receivable" ? "attention" : "secondary"} />}
  </ChartCard>;
}

type GaugeKind = "collection" | "receipt" | "depreciation";
/** One ratio against its full scale as a gauge (collected of invoiced this year, received of ordered, depreciated of cost). */
export function RatioGauge({ kind, company, currency, user, ar, from, to: until }: { kind: GaugeKind; company: string; currency: string; user: string; ar: boolean; from?: string | undefined; /** a block period end (block menu): documents dated after it are left out */ to?: string | undefined }) {
  const t = (en: string, x: string) => (ar ? x : en);
  const dt = kind === "collection" ? "Sales Invoice" : kind === "receipt" ? "Purchase Order" : "Asset";
  const st = sourceStatus(dt, user);
  const rows = st === "ok" ? scopedList(dt, user).filter((d) => (!company || d["company"] === company) && (kind === "depreciation" ? Number(d.docstatus) === 1 && !["Sold", "Scrapped"].includes(String(d["status"])) : Number(d.docstatus) === 1)) : [];
  const yr = from ?? `${new Date().getUTCFullYear()}-01-01`;
  let value = 0, full = 0; let label: [string, string]; let to: string; let note: [string, string];
  if (kind === "collection") {
    const inv = rows.filter((d) => !Number(d["is_return"]) && String(d["posting_date"] ?? "") >= yr && (!until || String(d["posting_date"] ?? "") <= until));
    full = inv.reduce((s, d) => s + n(d["base_grand_total"] ?? d["grand_total"]), 0); value = full - inv.reduce((s, d) => s + Math.max(0, n(d["outstanding_amount"])), 0);
    label = ["Collected of invoiced", "المحصّل من المفوتر"]; to = "/pro/receivables"; note = until ? [`Submitted sales invoices ${yr} → ${until}`, `فواتير البيع المعتمدة ${yr} ← ${until}`] : [`Submitted sales invoices since ${yr}`, `فواتير البيع المعتمدة منذ ${yr}`];
  } else if (kind === "receipt") {
    const po = rows.filter((d) => !["Closed", "Cancelled"].includes(String(d["status"])) && (!from || String(d["transaction_date"] ?? "") >= from) && (!until || String(d["transaction_date"] ?? "") <= until));
    full = po.reduce((s, d) => s + n(d["base_grand_total"] ?? d["grand_total"]), 0); value = po.reduce((s, d) => s + n(d["base_grand_total"] ?? d["grand_total"]) * Math.min(100, n(d["per_received"])) / 100, 0);
    label = ["Received of ordered", "المستلم من المطلوب"]; to = "/pro/purchasing-overview"; note = from ? [`Open submitted purchase orders dated ${from} → ${until ?? ""}, weighted by value`, `أوامر الشراء المعتمدة المفتوحة المؤرخة ${from} ← ${until ?? ""}، موزونة بالقيمة`] : ["Open submitted purchase orders, weighted by value", "أوامر الشراء المعتمدة المفتوحة، موزونة بالقيمة"];
  } else {
    full = rows.reduce((s, d) => s + n(d["gross_purchase_amount"]), 0); value = full - rows.reduce((s, d) => s + n(d["value_after_depreciation"] ?? d["gross_purchase_amount"]), 0);
    label = ["Depreciated of cost", "المُهلك من التكلفة"]; to = "/pro/assets-overview"; note = ["Assets in use: cost less value after depreciation", "الأصول قيد الاستخدام: التكلفة ناقص القيمة بعد الإهلاك"];
  }
  return <ChartCard id={`gauge-${kind}`} size="sm" title={ar ? label[1] : label[0]} sub={sub(ar, dt, ar ? note[1] : note[0])} attrs={{ "data-dp-rich": `gauge-${kind}`, "data-value": String(Math.round(value)), "data-full": String(Math.round(full)) }}
    footer={<Link to={to as never} search={{ company } as never} className="ek-card-link">{t("Open the records", "فتح السجلات")} {ar ? "←" : "→"}</Link>}>
    {st !== "ok" ? <SourceState status={st} doctype={dt} /> : full <= 0 ? <SourceState status="empty" doctype={dt} />
      : kind === "receipt" ? <ReceiptSplit company={company} currency={currency} user={user} ar={ar} from={from} until={until} ordered={full} received={value} />
      : <div className="ek-gauge-grad"><HalfGauge value={value} target={full} ar={ar} fmt={(v) => fmtCurrency(v, currency)} label={ar ? label[1] : label[0]} tone="good" /></div>}
  </ChartCard>;
}

/** Enterprise Visual Round 1 §8 — received of ordered as a split card: submitted orders and receipts solid, draft orders and draft
 *  receipts of the same window hatched, the received share as the % chip, ordered against the same window a year earlier. */
function ReceiptSplit({ company, currency, user, ar, from, until, ordered, received }: { company: string; currency: string; user: string; ar: boolean; from?: string | undefined; until?: string | undefined; ordered: number; received: number }) {
  const t = (en: string, x: string) => (ar ? x : en);
  const inWin = (d: Record<string, unknown>, f: string, a?: string, b?: string) => (!a || String(d[f] ?? "") >= a) && (!b || String(d[f] ?? "") <= b);
  const val = (d: Record<string, unknown>) => n(d["base_grand_total"] ?? d["grand_total"]);
  const mine = (dt: string) => scopedList(dt, user).filter((d) => !company || d["company"] === company);
  const dPo = mine("Purchase Order").filter((d) => Number(d.docstatus ?? 0) === 0 && inWin(d, "transaction_date", from, until));
  const dPr = sourceStatus("Purchase Receipt", user) === "ok" ? mine("Purchase Receipt").filter((d) => Number(d.docstatus ?? 0) === 0 && inWin(d, "posting_date", from, until)) : [];
  const shift = (iso?: string) => (iso ? `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}` : undefined);
  const yr = from ?? `${new Date().getUTCFullYear()}-01-01`;
  const prev = mine("Purchase Order").filter((d) => Number(d.docstatus) === 1 && inWin(d, "transaction_date", shift(yr), shift(until ?? new Date().toISOString().slice(0, 10)))).reduce((x, d) => x + val(d), 0);
  const pend = dPo.reduce((x, d) => x + val(d), 0), pendR = dPr.reduce((x, d) => x + val(d), 0);
  const list = (dt: string) => ({ to: "/app/$app/$doctype", params: { app: "erpnext", doctype: dt.toLowerCase().replace(/ /g, "_") }, filters: [["docstatus", "=", 0], ...(company ? [["company", "=", company]] : [])] });
  const wrap = (drill: unknown, node: ReactNode, attrs?: Record<string, string>) => { const d = drill as ReturnType<typeof list>; return <Link to={d.to as never} params={d.params as never} search={{ filters: JSON.stringify(d.filters) } as never} {...attrs}>{node}</Link>; };
  return <SplitBars ar={ar} wrap={wrap} value={fmtCurrency(ordered, currency)} pct={ordered ? { value: (received / ordered) * 100, label: t("received", "مستلم") } : undefined}
    delta={prev ? { pct: Math.round(((ordered - prev) / prev) * 1000) / 10, vs: (shift(yr) ?? "").slice(0, 4), better: "up" } : undefined}
    bars={[{ key: "ordered", label: t("Ordered", "المطلوب"), solid: ordered, pending: pend, display: fmtCurrency(ordered, currency), pendingDisplay: fmtCurrency(pend, currency), tone: "teal", drill: dPo.length ? list("Purchase Order") : undefined },
      { key: "received", label: t("Received", "المستلم"), solid: received, pending: pendR, display: fmtCurrency(received, currency), pendingDisplay: fmtCurrency(pendR, currency), tone: "emerald", drill: dPr.length ? list("Purchase Receipt") : undefined }]}
    review={dPo.length + dPr.length ? { count: dPo.length + dPr.length, drill: dPo.length >= dPr.length ? list("Purchase Order") : list("Purchase Receipt") } : undefined} />;
}

/** Asset category × location (count of assets in use, value in the cell title) — where the asset base sits. */
export function AssetMatrix({ company, currency, user, ar }: { company: string; currency: string; user: string; ar: boolean }) {
  const t = (en: string, x: string) => (ar ? x : en);
  const st = sourceStatus("Asset", user);
  const rows = st === "ok" ? scopedList("Asset", user).filter((d) => (!company || d["company"] === company) && Number(d.docstatus) === 1 && !["Sold", "Scrapped"].includes(String(d["status"]))) : [];
  const cats = [...new Set(rows.map((d) => String(d["asset_category"] || "—")))].slice(0, 8);
  const locs = [...new Set(rows.map((d) => String(d["location"] || "—")))].slice(0, 6);
  const values = cats.map((c) => locs.map((l) => rows.filter((d) => String(d["asset_category"] || "—") === c && String(d["location"] || "—") === l).reduce((s, d) => s + n(d["gross_purchase_amount"]), 0)));
  return <ChartCard id="asset-matrix" title={t("Asset category × location", "فئة الأصل × الموقع")} sub={sub(ar, "Asset", t("cost of assets in use", "تكلفة الأصول قيد الاستخدام"))} attrs={{ "data-dp-rich": "asset-matrix" }}
    action={<Link to="/pro/asset-register" search={{ company } as never}>{t("Asset register", "سجل الأصول")}</Link>}>
    {st !== "ok" ? <SourceState status={st} doctype="Asset" /> : !rows.length ? <SourceState status="empty" doctype="Asset" />
      : <Heatmap ar={ar} dataRows dataCols rows={cats} cols={locs} values={values} fmt={(v) => fmtCurrency(v, currency)} scale="secondary" />}
  </ChartCard>;
}

/** Cash in vs cash out by month (submitted Payment Entries, company currency) — the two lines on one axis. */
export function CashInOut({ company, currency, user, ar, today, from }: { company: string; currency: string; user: string; ar: boolean; today: string; /** a block period start (block menu): the months from it to `today`, at most 24 */ from?: string | undefined }) {
  const t = (en: string, x: string) => (ar ? x : en);
  const st = sourceStatus("Payment Entry", user);
  const rows = st === "ok" ? scopedList("Payment Entry", user).filter((d) => (!company || d["company"] === company) && Number(d.docstatus) === 1) : [];
  const months: string[] = []; const d0 = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  const span = from ? Math.min(24, Math.max(1, (d0.getUTCFullYear() - Number(from.slice(0, 4))) * 12 + d0.getUTCMonth() - (Number(from.slice(5, 7)) - 1) + 1)) : 6;
  for (let i = span - 1; i >= 0; i--) { const d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - i, 1)); months.push(d.toISOString().slice(0, 7)); }
  const sum = (m: string, type: string) => rows.filter((d) => String(d["posting_date"] ?? "").startsWith(m) && d["payment_type"] === type).reduce((s, d) => s + n(d["base_paid_amount"] ?? d["paid_amount"]), 0);
  const inn: Datum[] = months.map((m) => ({ key: m, label: monthLabel(m, ar), data: true, value: sum(m, "Receive"), drill: { kind: "list", doctype: "Payment Entry", filters: [["docstatus", "=", 1], ["payment_type", "=", "Receive"], ["company", "=", company], ["posting_date", "between", [`${m}-01`, `${m}-31`]]] } }));
  const out = months.map((m) => sum(m, "Pay"));
  const tIn = inn.reduce((s, d) => s + d.value, 0), tOut = out.reduce((s, v) => s + v, 0);
  return <ChartCard id="cash-in-out" title={t("Cash in vs cash out", "النقد الداخل مقابل الخارج")} sub={sub(ar, "Payment Entry", span === 6 ? t("six months, receipts against payments", "ستة أشهر، المقبوضات مقابل المدفوعات") : t(`${span} months, receipts against payments`, `${span} شهرًا، المقبوضات مقابل المدفوعات`))} attrs={{ "data-dp-rich": "cash-in-out" }}
    footer={<>{t("In", "الداخل")} <b className="tabular-nums" data-no-i18n>{fmtCurrency(tIn, currency)}</b> · {t("Out", "الخارج")} <b className="tabular-nums" data-no-i18n>{fmtCurrency(tOut, currency)}</b> · {t("Net", "الصافي")} <b className="tabular-nums" data-no-i18n>{fmtCurrency(tIn - tOut, currency)}</b></>}>
    {st !== "ok" ? <SourceState status={st} doctype="Payment Entry" /> : !rows.length ? <SourceState status="empty" doctype="Payment Entry" />
      : <AreaChart data={inn} compare={out} valueLabel={t("Received", "المقبوض")} compareLabel={t("Paid", "المدفوع")} fmt={money(currency)} axisFmt={moneyShort(currency)} ar={ar} wrap={proWrap} height={190} />}
  </ChartCard>;
}
