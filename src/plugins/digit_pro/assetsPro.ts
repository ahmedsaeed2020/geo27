/**
 * SC-A-01 Assets Overview — read-only selectors over native Core Asset records and their
 * Asset Depreciation Schedule child rows. Permission-aware via src/lib/scope.ts; nothing is posted here.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, type SourceStatus } from "./finance";

const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
/** v16 field is net_purchase_amount; v15 / older records use gross_purchase_amount. */
export const assetCost = (a: Doc) => n(a["net_purchase_amount"] ?? a["gross_purchase_amount"]);

export interface CategoryValue { category: string; count: number; cost: number; book: number }
export interface DueDepreciation { asset: string; asset_name: string; date: string; amount: number }

export interface AssetsOverview {
  company: string;
  register: { status: SourceStatus; count: number; cost: number; book: number; depreciated: number; byCategory: CategoryValue[]; byStatus: Record<string, number>; drafts: { name: string; asset_name: string }[] };
  schedule: { status: SourceStatus; due: DueDepreciation[]; dueAmount: number };
}

export function assetsOverview(company: string, today: string, user = currentUser()): AssetsOverview {
  const coOk = (d: Doc) => !company || !d["company"] || d["company"] === company;
  const aStatus = sourceStatus("Asset", user);
  const all = aStatus === "ok" ? scopedList("Asset", user).filter(coOk) : [];
  const live = all.filter((a) => n(a.docstatus) === 1);
  const cat = new Map<string, CategoryValue>();
  const byStatus: Record<string, number> = {};
  for (const a of live) {
    const k = String(a["asset_category"] ?? "");
    const c = cat.get(k) ?? { category: k, count: 0, cost: 0, book: 0 };
    c.count += 1; c.cost = r2(c.cost + assetCost(a)); c.book = r2(c.book + n(a["value_after_depreciation"])); cat.set(k, c);
    const s = String(a["status"] ?? ""); byStatus[s] = (byStatus[s] ?? 0) + 1;
  }
  const cost = r2(live.reduce((s, a) => s + assetCost(a), 0));
  const book = r2(live.reduce((s, a) => s + n(a["value_after_depreciation"]), 0));

  // Next 30 days of scheduled depreciation from native schedule rows.
  const sStatus = sourceStatus("Asset Depreciation Schedule", user);
  const end = new Date(Date.parse(today) + 30 * 864e5).toISOString().slice(0, 10);
  const due: DueDepreciation[] = [];
  if (sStatus === "ok") for (const s of scopedList("Asset Depreciation Schedule", user).filter((d) => coOk(d) && n(d.docstatus) === 1))
    for (const row of (s["depreciation_schedule"] as Doc[] | undefined) ?? []) {
      const d = String(row["schedule_date"] ?? "");
      if (d >= today && d <= end) due.push({ asset: String(s["asset"]), asset_name: String(s["asset_name"] ?? ""), date: d, amount: n(row["depreciation_amount"]) });
    }
  due.sort((a, b) => a.date.localeCompare(b.date));

  return {
    company,
    register: { status: aStatus, count: live.length, cost, book, depreciated: r2(cost - book),
      byCategory: [...cat.values()].sort((a, b) => b.book - a.book), byStatus,
      drafts: all.filter((a) => n(a.docstatus) === 0).map((a) => ({ name: a.name, asset_name: String(a["asset_name"] ?? "") })).slice(0, 8) },
    schedule: { status: sStatus, due: due.slice(0, 10), dueAmount: r2(due.reduce((s, d) => s + d.amount, 0)) },
  };
}
