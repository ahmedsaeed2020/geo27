/** S7 exception badge per workspace: the count of the section's most urgent queue (the same rule as the "queue:auto" panel), so the badge matches what the workspace shows. */
import { currentUser } from "@/lib/session";
import { financeContext } from "./finance";
import { evalQueue, sectionCtx, SPECS } from "./sections";
import type { Bi } from "./command";

export interface SectionBadge { count: number; queue: string; label: Bi; severity: string }
export function sectionBadge(pageId: string, user = currentUser(), asOf = new Date().toISOString().slice(0, 10)): SectionBadge | null {
  const spec = SPECS[pageId]; if (!spec) return null;
  const fc = financeContext(undefined, user); if (!fc.companies.length) return null;
  const ctx = sectionCtx(fc.company, fc.currency, asOf);
  const q = spec.queues(ctx).map((x) => evalQueue(x, ctx, user, 0)).find((x) => x.status === "ok" && x.count);
  return q ? { count: q.count, queue: q.id, label: q.label, severity: String(q.severity) } : null;
}
