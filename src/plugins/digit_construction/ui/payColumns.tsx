/**
 * Phase 4 C4-02 / C4-04 on the Construction registers: the claim position bar per claim row and the three separate
 * status columns (approval · payment · payout) with the current approver's decisions, handed to the Core Document Hub
 * as its opt-in approval queue. Figures and statuses come from domain/payStates.ts; the Enterprise kit draws them.
 */
import type { ReactNode } from "react";
import type { Doc } from "@/lib/adapter";
import type { HubApprovalsSpec, HubColumn } from "@/components/hub/DocumentHub";
import { MiniDistBar, MiniDistLegend, StatePill } from "@/components/enterprise/kit/ApprovalQueue";
import type { DistSegment } from "@/components/enterprise/kit/DistributionBar";
import { applyDecision, approvalState, claimRowStages, decisionsFor, isPayDoctype, paymentState, payoutState, type ClaimStageFigs, type PayDoctype, type PayState } from "../domain/payStates";
import { compact, money } from "./kit";

const pill = (p: PayState, ar: boolean, col: string) => <StatePill s={{ key: p.key, label: ar ? p.ar : p.en, tone: p.tone, hint: p.hint ? (ar ? p.hint[1] : p.hint[0]) : undefined }} attrs={{ [`data-pay-${col}`]: p.key }} />;
export const claimSegments = (st: ClaimStageFigs, ar: boolean, full = false): DistSegment[] => [
  { key: "claimed", label: ar ? "مطالَب" : "Claimed", value: st.claimed, display: full ? money(st.claimed) : compact(st.claimed, ar), hue: "blue" },
  { key: "certified", label: ar ? "معتمد" : "Certified", value: st.certified, display: full ? money(st.certified) : compact(st.certified, ar), hue: "amber" },
  { key: "invoiced", label: ar ? "مفوتر" : "Invoiced", value: st.invoiced, display: full ? money(st.invoiced) : compact(st.invoiced, ar), hue: "teal" },
  { key: "collected", label: ar ? "محصّل" : "Collected", value: st.collected, display: full ? money(st.collected) : compact(st.collected, ar), hue: "emerald" },
];
export function ClaimRowBar({ claim, ar }: { claim: Doc; ar: boolean }) {
  return <MiniDistBar segments={claimSegments(claimRowStages(claim), ar)} attrs={{ "data-claim-row-bar": claim.name }} />;
}

export function payColumns(dt: PayDoctype, ar: boolean): HubColumn[] {
  const cols: HubColumn[] = [];
  if (dt === "Digit Client Claim") cols.push({ key: "position", label: ["Claim position", "موقف المستخلص"], cell: (d) => <span className="block w-20"><ClaimRowBar claim={d} ar={ar} /></span> });
  cols.push(
    { key: "approval", label: ["Approval", "الاعتماد"], approval: true, cell: (d) => pill(approvalState(dt, d), ar, "approval") },
    { key: "payment", label: ["Payment", "الفوترة والسداد"], cell: (d) => pill(paymentState(dt, d), ar, "payment") },
    { key: "payout", label: ["Retention payout", "صرف المحتجز"], cell: (d) => pill(payoutState(dt, d), ar, "payout") },
  );
  return cols;
}

/** The Construction approval queue spec for the Document Hub registers. */
export function payApprovals(ar: boolean, user: string, title: (d: Doc) => ReactNode): HubApprovalsSpec {
  return {
    columns: (dt) => (isPayDoctype(dt) ? payColumns(dt, ar) : []),
    can: (dt, d) => (isPayDoctype(dt) ? decisionsFor(dt, d, user) : {}),
    decide: (dt, d, k, c, f) => applyDecision(dt, d, k, c, f, user),
    legend: (dt) => (dt === "Digit Client Claim" ? <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{ar ? "موقف المستخلص:" : "Claim position:"} <MiniDistLegend segments={claimSegments({ claimed: 0, certified: 0, invoiced: 0, collected: 0 }, ar)} /></span> : null),
    summary: (dt, d) => isPayDoctype(dt) ? (
      <div className="grid gap-1.5 rounded-lg border border-border p-3 text-sm" data-approval-summary={d.name}>
        <div className="font-semibold">{title(d)}</div>
        <div className="flex flex-wrap gap-1.5">{pill(approvalState(dt, d), ar, "approval")}{pill(paymentState(dt, d), ar, "payment")}{pill(payoutState(dt, d), ar, "payout")}</div>
        {dt === "Digit Client Claim" && <ClaimRowBar claim={d} ar={ar} />}
      </div>) : null,
  };
}
