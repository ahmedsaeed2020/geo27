import { migrateCrmAnalytics } from "./migrations";
import { adapter, type Doc } from "@/lib/adapter";
import { activeDemoProfile } from "./dataContext";
import { scopedList } from "@/lib/scope";
import { targets } from "./wf03";
import { DEMO_TYPES } from "./demoSchema";
export const demoEnabled = () => Boolean(activeDemoProfile());
export function demoRows(dt: string, user: string, f: { from?: string | undefined; to?: string | undefined; owner?: string | undefined } = {}) {
  migrateCrmAnalytics();
  if (!demoEnabled()) return [];
  if (dt === DEMO_TYPES.target) return targets(user).map(t => ({ name: `${t.salesPerson}-${t.fiscalYear}`, doctype: "Sales Person", salesperson: t.user, sales_person: t.salesPerson, period: t.fiscalYear, target_amount: t.amount } as Doc));
  return scopedList(dt, user).filter(d => { const date = String(d["snapshot_date"] ?? d["spend_date"] ?? d["communication_date"] ?? d["period"] ?? d["creation"]).slice(0, 10); return (!f.from || date >= f.from) && (!f.to || date <= f.to) && (!f.owner || [d["salesperson"], d["custom_demo_assigned_to"], d["owner"]].includes(f.owner)); });
}
export function demoForecast(user: string, f: { from?: string | undefined; to?: string | undefined; owner?: string | undefined } = {}) {
  const deals = scopedList("CRM Deal", user), asOf = String(adapter.get("FCRM Settings", "FCRM Settings")?.["custom_demo_as_of"] ?? new Date().toISOString().slice(0, 10));
  return demoRows(DEMO_TYPES.forecast, user, f).map(snapshot => {
    const period = String(snapshot["period"]), closed = period < asOf.slice(0, 7);
    const actualDeals = deals.filter(d => d["status"] === "Won" && d["deal_owner"] === snapshot["salesperson"] && String(d["closed_date"]).slice(0, 7) === period);
    const actual = actualDeals.reduce((sum, d) => sum + Number(d["deal_value"] ?? 0), 0), system = Number(snapshot["system_forecast"] ?? 0), adjustment = Number(snapshot["adjustment"] ?? 0);
    return { snapshot, period, system, adjustment, adjusted: system + adjustment, actual, actualDeals, closed, error: closed ? Math.abs(system + adjustment - actual) : null };
  });
}
/**
 * W-053 forecast accuracy over closed months: snapshot (salesperson, period) is matched to that salesperson's Won deals whose
 * closed_date falls in the period. Accuracy = 1 − WAPE, WAPE = Σ|adjusted forecast − won value| ÷ Σ won value.
 * When the error is larger than the won value (WAPE > 100%) the accuracy is undefined, never clamped to a misleading 0%.
 */
export function forecastAccuracyDetail(user: string) {
  const rows = demoForecast(user).filter(r => r.closed), actual = rows.reduce((sum, r) => sum + r.actual, 0), error = rows.reduce((sum, r) => sum + (r.error ?? 0), 0);
  const forecast = rows.reduce((sum, r) => sum + r.adjusted, 0), wape = actual > 0 ? error / actual : null;
  const accuracy = wape === null || wape > 1 ? null : Math.round((1 - wape) * 1000) / 10;
  const reason = !rows.length ? "no-closed-snapshots" : wape === null ? "no-won-value" : wape > 1 ? "error-exceeds-won-value" : "";
  return { snapshots: rows.length, forecast, actual, error, wape: wape === null ? null : Math.round(wape * 1000) / 10, accuracy, reason };
}
export function forecastAccuracy(user: string) { return forecastAccuracyDetail(user).accuracy; }
export function demoCampaigns(user: string) {
  const leads = scopedList("CRM Lead", user), deals = scopedList("CRM Deal", user), spend = demoRows(DEMO_TYPES.spend, user);
  return scopedList("Campaign", user).map(campaign => {
    const ls = leads.filter(l => l["custom_demo_campaign"] === campaign.name), ds = deals.filter(d => d["custom_demo_campaign"] === campaign.name), expenses = spend.filter(s => s["campaign"] === campaign.name);
    const cost = expenses.reduce((sum, s) => sum + Number(s["amount"]), 0), revenue = ds.filter(d => d["status"] === "Won").reduce((sum, d) => sum + Number(d["deal_value"]), 0);
    return { campaign, leads: ls, deals: ds, expenses, cost, revenue, roi: cost > 0 ? Math.round((revenue - cost) / cost * 1000) / 10 : null };
  });
}
export function demoWhatsApp(user: string) {
  const messages = demoRows("Communication", user).filter(c => c["custom_demo_channel"] === "WhatsApp"), threads = new Map<string, Doc[]>();
  for (const message of messages) { const key = `${message["reference_doctype"]}|${message["reference_name"]}|${message["custom_demo_thread"]}`; const rows = threads.get(key) ?? []; rows.push(message); threads.set(key, rows); }
  const open: Doc[] = [], responseHours: number[] = [];
  for (const rows of threads.values()) {
    rows.sort((a, b) => String(a["communication_date"]).localeCompare(String(b["communication_date"])));
    const last = rows.at(-1); if (last?.["sent_or_received"] === "Received") open.push(last);
    for (const received of rows.filter(c => c["sent_or_received"] === "Received")) { const reply = rows.find(c => c["sent_or_received"] === "Sent" && String(c["communication_date"]) > String(received["communication_date"])); if (reply) responseHours.push((Date.parse(String(reply["communication_date"])) - Date.parse(String(received["communication_date"]))) / 3600000); }
  }
  const inboundThreads = [...threads.values()].filter(rows => rows.some(c => c["sent_or_received"] === "Received")).length;
  const repliedThreads = [...threads.values()].filter(rows => rows.some(r => r["sent_or_received"] === "Received" && rows.some(c => c["sent_or_received"] === "Sent" && String(c["communication_date"]) > String(r["communication_date"])))).length;
  return { messages, open, unassigned: open.filter(c => !c["custom_demo_assigned_to"]), responseHours, inboundThreads, repliedThreads };
}