/**
 * SC-P-02 Supplier reliability — read-only on-time delivery rules over native Core buying records.
 * Rules (source-backed, advisory only):
 *  - A submitted Purchase Receipt line matches a submitted Purchase Order via items.purchase_order.
 *  - The receipt is "on time" when its posting_date is on or before the PO schedule_date; otherwise "late".
 *  - POs without a schedule_date, and receipts without a PO link, are excluded and counted separately — never guessed.
 *  - Company scope is strict: records with a different company are excluded; company-less records are excluded in company views.
 * Permission-aware via src/lib/scope.ts; a source the user may not read reports "denied" and contributes no rows.
 */
import type { Doc } from "@/lib/adapter";
import { scopedList } from "@/lib/scope";
import { currentUser } from "@/lib/session";
import { sourceStatus, type SourceStatus } from "./finance";

const n = (v: unknown) => Number(v) || 0;
const coOk = (d: Doc, company: string) => !company || !d["company"] || d["company"] === company;

export interface SupplierReliabilityRow {
  supplier: string;
  matched: number;      // receipt lines matched to a PO with a schedule date
  onTime: number;
  late: number;
  onTimePct: number;    // 0..100, 0 when matched = 0
  avgDelayDays: number; // average positive delay over late lines, 0 when none
}

export interface SupplierReliability {
  status: SourceStatus;      // worst of the two source statuses
  rows: SupplierReliabilityRow[];
  excludedNoSchedule: number; // matched lines whose PO has no schedule_date
  excludedNoPoLink: number;   // submitted receipt lines with no purchase_order link
}

const dayMs = 86_400_000;
const delayDays = (receiptIso: string, scheduleIso: string) =>
  Math.round((Date.parse(receiptIso) - Date.parse(scheduleIso)) / dayMs);

export function supplierReliability(company: string, user = currentUser()): SupplierReliability {
  const poStatus = sourceStatus("Purchase Order", user);
  const prStatus = sourceStatus("Purchase Receipt", user);
  if (poStatus !== "ok" || prStatus !== "ok") {
    return { status: poStatus !== "ok" ? poStatus : prStatus, rows: [], excludedNoSchedule: 0, excludedNoPoLink: 0 };
  }

  const pos = scopedList("Purchase Order", user).filter((d) => coOk(d, company) && n(d.docstatus) === 1);
  const poByName = new Map(pos.map((d) => [d.name, d]));

  const prs = scopedList("Purchase Receipt", user).filter((d) => coOk(d, company) && n(d.docstatus) === 1);

  const acc = new Map<string, { matched: number; onTime: number; late: number; delaySum: number }>();
  let excludedNoSchedule = 0;
  let excludedNoPoLink = 0;

  for (const pr of prs) {
    const posting = String(pr["posting_date"] ?? "");
    if (!posting) continue;
    const items = Array.isArray(pr["items"]) ? (pr["items"] as Doc[]) : [];
    for (const line of items) {
      const poName = String(line["purchase_order"] ?? "");
      if (!poName) { excludedNoPoLink += 1; continue; }
      const po = poByName.get(poName);
      if (!po) { excludedNoPoLink += 1; continue; } // PO outside company scope or not submitted
      const schedule = String(po["schedule_date"] ?? "");
      if (!schedule) { excludedNoSchedule += 1; continue; }
      const supplier = String(po["supplier"] ?? "");
      if (!supplier) continue;
      const a = acc.get(supplier) ?? { matched: 0, onTime: 0, late: 0, delaySum: 0 };
      a.matched += 1;
      const delay = delayDays(posting, schedule);
      if (delay <= 0) a.onTime += 1;
      else { a.late += 1; a.delaySum += delay; }
      acc.set(supplier, a);
    }
  }

  const rows: SupplierReliabilityRow[] = [...acc.entries()]
    .map(([supplier, a]) => ({
      supplier,
      matched: a.matched,
      onTime: a.onTime,
      late: a.late,
      onTimePct: a.matched ? Math.round((a.onTime / a.matched) * 100) : 0,
      avgDelayDays: a.late ? Math.round((a.delaySum / a.late) * 10) / 10 : 0,
    }))
    .sort((x, y) => x.onTimePct - y.onTimePct || y.matched - x.matched);

  return { status: "ok", rows, excludedNoSchedule, excludedNoPoLink };
}
