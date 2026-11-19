/**
 * DIGIT Pro Fixed Assets closure (-b parts), all read-only over native records through the user's scope:
 *  FA1-b / FIX-001-b  fixed-asset lines of a Purchase Invoice and the Asset draft values for one line
 *  FA8-b              posted disposal reconciliation: GL gain/loss = proceeds − value after depreciation
 *  FA10-b / FIX-009-b maintenance calendar (open logs + task next due dates) and repair cost vs book value
 *  FIX-016-b          book versus tax book: value after depreciation per Finance Book and the difference
 */
import { adapter, type Doc } from "@/lib/adapter";
import { assetAccounts } from "@/lib/assets";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, type SourceStatus } from "./finance";

const n = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
const s = (v: unknown) => String(v ?? "");
const rowsOf = (d: Doc, f: string) => ((d[f] as Doc[] | undefined) ?? []);

/* ---------- FA1-b ---------- */
export interface FixedAssetLine { idx: number; row: string; item: string; itemName: string; qty: number; amount: number; category: string; location: string; assets: string[] }
export function fixedAssetLines(pi: Doc, user = currentUser()): { status: SourceStatus; lines: FixedAssetLine[] } {
  const st = sourceStatus("Asset", user);
  const assets = st === "ok" ? scopedList("Asset", user).filter((a) => a["purchase_invoice"] === pi.name && n(a["docstatus"]) !== 2) : [];
  const lines: FixedAssetLine[] = [];
  for (const r of rowsOf(pi, "items")) {
    const item = s(r["item_code"]); if (!item) continue;
    const it = adapter.get("Item", item);
    if (!n(r["is_fixed_asset"]) && !n(it?.["is_fixed_asset"])) continue;
    const mine = assets.filter((a) => (a["purchase_invoice_item"] ? a["purchase_invoice_item"] === r["name"] : a["item_code"] === item)).map((a) => a.name);
    lines.push({ idx: n(r["idx"]) || lines.length + 1, row: s(r["name"]), item, itemName: s(r["item_name"] || it?.["item_name"] || item), qty: n(r["qty"]),
      amount: r2(n(r["base_net_amount"]) || n(r["net_amount"]) || n(r["amount"])), category: s(r["asset_category"] || it?.["asset_category"]), location: s(r["asset_location"]), assets: mine });
  }
  return { status: st === "ok" ? "ok" : st, lines };
}
/** Asset draft values for one invoice line (fields the native Asset form fetches from purchase_invoice / item_code). */
export function assetFromInvoiceLine(pi: Doc, line: FixedAssetLine): Record<string, unknown> {
  const date = s(pi["posting_date"]);
  return { company: pi["company"], item_code: line.item, item_name: line.itemName, asset_name: line.itemName, asset_category: line.category || undefined, location: line.location || undefined,
    purchase_invoice: pi.name, purchase_invoice_item: line.row || undefined, purchase_date: date, available_for_use_date: date, supplier: pi["supplier"],
    asset_quantity: line.qty || 1, net_purchase_amount: line.amount, purchase_amount: line.amount, cost_center: pi["cost_center"] || undefined };
}

/* ---------- FA8-b ---------- */
export interface PostedDisposal { asset: string; assetName: string; status: string; date: string; journal: string; cost: number; accumulated: number; proceeds: number; nbv: number; gainLoss: number; expected: number; reconciled: boolean; balanced: boolean }
export function postedDisposals(company: string, user = currentUser()): { status: SourceStatus; rows: PostedDisposal[] } {
  const st = sourceStatus("Asset", user); if (st !== "ok") return { status: st, rows: [] };
  if (sourceStatus("GL Entry", user) !== "ok") return { status: sourceStatus("GL Entry", user), rows: [] };
  const gl = scopedList("GL Entry", user).filter((g) => !n(g["is_cancelled"]));
  const rows: PostedDisposal[] = [];
  for (const a of scopedList("Asset", user)) {
    if ((company && a["company"] !== company) || !["Sold", "Scrapped"].includes(s(a["status"])) || !a["journal_entry_for_scrap"]) continue;
    const je = s(a["journal_entry_for_scrap"]); const acc = assetAccounts(a);
    const lines = gl.filter((g) => g["voucher_no"] === je);
    if (!lines.length) continue;
    const sum = (acct: string, side: "debit" | "credit") => r2(lines.filter((g) => g["account"] === acct).reduce((t, g) => t + n(g[side]), 0));
    const cost = r2(sum(acc.fixed, "credit") - sum(acc.fixed, "debit")), accumulated = r2(sum(acc.accumulated, "debit") - sum(acc.accumulated, "credit"));
    const proceeds = r2(sum(acc.bank, "debit") - sum(acc.bank, "credit")), gainLoss = r2(sum(acc.gainLoss, "credit") - sum(acc.gainLoss, "debit"));
    const nbv = r2(cost - accumulated), expected = r2(proceeds - nbv);
    const dr = r2(lines.reduce((t, g) => t + n(g["debit"]), 0)), cr = r2(lines.reduce((t, g) => t + n(g["credit"]), 0));
    rows.push({ asset: a.name, assetName: s(a["asset_name"]), status: s(a["status"]), date: s(a["disposal_date"] || lines[0]!["posting_date"]), journal: je, cost, accumulated, proceeds, nbv, gainLoss, expected, reconciled: Math.abs(gainLoss - expected) < 0.01, balanced: Math.abs(dr - cr) < 0.01 });
  }
  rows.sort((x, y) => y.date.localeCompare(x.date));
  return { status: "ok", rows };
}

/* ---------- FA10-b ---------- */
export interface MaintEvent { date: string; asset: string; task: string; kind: "log" | "task"; status: string; ref: string; refType: "Asset Maintenance Log" | "Asset Maintenance" }
export function maintenanceCalendar(company: string, month: string, user = currentUser()): { status: SourceStatus; days: Map<string, MaintEvent[]>; total: number; overdue: number } {
  const st = sourceStatus("Asset Maintenance", user); if (st !== "ok") return { status: st, days: new Map(), total: 0, overdue: 0 };
  const plans = scopedList("Asset Maintenance", user).filter((p) => !company || p["company"] === company);
  const planOf = new Map(plans.map((p) => [p.name, p]));
  const logs = sourceStatus("Asset Maintenance Log", user) === "ok" ? scopedList("Asset Maintenance Log", user).filter((l) => planOf.has(s(l["asset_maintenance"])) && n(l["docstatus"]) !== 2) : [];
  const ev: MaintEvent[] = []; const seen = new Set<string>();
  for (const l of logs) {
    const due = s(l["due_date"]).slice(0, 10); const status = s(l["maintenance_status"]);
    seen.add(`${l["asset_maintenance"]}|${l["task"]}|${due}`);
    if (!due || ["Completed", "Cancelled"].includes(status)) continue;
    ev.push({ date: due, asset: s(planOf.get(s(l["asset_maintenance"]))?.["asset_name"] ?? l["asset_name"]), task: s(l["task_name"] || l["task"]), kind: "log", status, ref: l.name, refType: "Asset Maintenance Log" });
  }
  for (const p of plans) for (const t of rowsOf(p, "asset_maintenance_tasks")) {
    const due = s(t["next_due_date"]).slice(0, 10); const status = s(t["maintenance_status"]);
    if (!due || status === "Cancelled" || seen.has(`${p.name}|${t["name"]}|${due}`)) continue;
    ev.push({ date: due, asset: s(p["asset_name"]), task: s(t["maintenance_task"]), kind: "task", status: status || "Planned", ref: p.name, refType: "Asset Maintenance" });
  }
  const days = new Map<string, MaintEvent[]>();
  for (const e of ev.filter((x) => x.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date) || a.asset.localeCompare(b.asset))) days.set(e.date, [...(days.get(e.date) ?? []), e]);
  return { status: "ok", days, total: [...days.values()].reduce((t, x) => t + x.length, 0), overdue: [...days.values()].flat().filter((x) => x.status === "Overdue").length };
}
export interface RepairVsNbv { asset: string; assetName: string; repairs: number; repairCost: number; nbv: number; ratio: number | null }
export function repairVsNbv(company: string, user = currentUser()): { status: SourceStatus; rows: RepairVsNbv[] } {
  const st = sourceStatus("Asset Repair", user); if (st !== "ok") return { status: st, rows: [] };
  const by = new Map<string, { repairs: number; cost: number }>();
  for (const r of scopedList("Asset Repair", user)) {
    if (n(r["docstatus"]) !== 1 || (company && r["company"] !== company)) continue;
    const k = s(r["asset"]); const cur = by.get(k) ?? { repairs: 0, cost: 0 };
    by.set(k, { repairs: cur.repairs + 1, cost: cur.cost + (n(r["total_repair_cost"]) || n(r["repair_cost"]) + n(r["consumed_items_cost"])) });
  }
  const assets = new Map(scopedList("Asset", user).map((a) => [a.name, a]));
  const rows = [...by.entries()].filter(([k]) => assets.has(k)).map(([k, v]) => { const a = assets.get(k)!; const nbv = r2(n(a["value_after_depreciation"] ?? a["net_purchase_amount"]));
    return { asset: k, assetName: s(a["asset_name"]), repairs: v.repairs, repairCost: r2(v.cost), nbv, ratio: nbv > 0 ? r2((v.cost / nbv) * 100) : null }; });
  rows.sort((a, b) => (b.ratio ?? Infinity) - (a.ratio ?? Infinity) || b.repairCost - a.repairCost);
  return { status: "ok", rows };
}

/* ---------- FIX-016-b ---------- */
export interface BookDifference { asset: string; assetName: string; book: string; other: string; bookValue: number; otherValue: number; difference: number }
export function bookTaxDifferences(company: string, user = currentUser()): { status: SourceStatus; rows: BookDifference[]; total: number } {
  const st = sourceStatus("Asset Depreciation Schedule", user); if (st !== "ok") return { status: st, rows: [], total: 0 };
  const per = new Map<string, Map<string, number>>();
  for (const d of scopedList("Asset Depreciation Schedule", user)) {
    if (n(d["docstatus"]) !== 1 || (company && d["company"] && d["company"] !== company)) continue;
    const m = per.get(s(d["asset"])) ?? new Map<string, number>(); m.set(s(d["finance_book"]), n(d["value_after_depreciation"])); per.set(s(d["asset"]), m);
  }
  const rows: BookDifference[] = [];
  for (const [asset, books] of per) {
    if (books.size < 2) continue;
    const a = adapter.get("Asset", asset); if (!a || (company && a["company"] !== company) || n(a["docstatus"]) !== 1) continue;
    const def = s(a["default_finance_book"]) || (books.has("") ? "" : s(rowsOf(a, "finance_books")[0]?.["finance_book"]));
    const base = books.get(def) ?? 0;
    for (const [fb, v] of books) if (fb !== def) rows.push({ asset, assetName: s(a["asset_name"]), book: def, other: fb, bookValue: r2(base), otherValue: r2(v), difference: r2(v - base) });
  }
  rows.sort((x, y) => Math.abs(y.difference) - Math.abs(x.difference));
  return { status: "ok", rows, total: r2(rows.reduce((t, r) => t + r.difference, 0)) };
}
