/**
 * PRO P3-06 — the Purchase Invoice register of the Pro Documents & work hub shows approval and payment as two separate
 * columns (the Core Document Hub approval queue, same component as Construction C4-04). States come from arInsights.ts.
 * Without a workflow, approving a draft invoice is submitting it: offered only to a user with submit permission who did
 * not create it (no self-approval); every other change stays on the invoice itself.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { submitDocument } from "@/lib/documentApi";
import { hasPerm } from "@/lib/session";
import { activeWorkflow } from "@/lib/workflow";
import type { HubApprovalsSpec, HubColumn } from "@/components/hub/DocumentHub";
import { StatePill } from "@/components/enterprise/kit/ApprovalQueue";
import { invoiceApproval, invoicePayment, type InvState } from "./arInsights";

export const PI_APPROVAL_DOCTYPES = ["Purchase Invoice"] as const;
const isPi = (dt: string) => (PI_APPROVAL_DOCTYPES as readonly string[]).includes(dt);
const pill = (p: InvState, ar: boolean, col: string) => <StatePill s={{ key: p.key, label: ar ? p.ar : p.en, tone: p.tone, hint: p.hint ? (ar ? p.hint[1] : p.hint[0]) : undefined }} attrs={{ [`data-pi-${col}`]: p.key }} />;

export function piColumns(dt: string, ar: boolean): HubColumn[] {
  if (!isPi(dt)) return [];
  return [
    { key: "approval", label: ["Approval", "الاعتماد"], approval: true, cell: (d) => pill(invoiceApproval(dt, d), ar, "approval") },
    { key: "payment", label: ["Payment", "السداد"], cell: (d) => pill(invoicePayment(dt, d), ar, "payment") },
  ];
}
/** Decisions the user may take now: approve (= submit) a draft invoice someone else prepared, when no workflow governs it. */
export function piCan(dt: string, d: Doc, user: string): { approve?: boolean } {
  if (!isPi(dt) || Number(d.docstatus ?? 0) !== 0 || activeWorkflow(dt)) return {};
  const meta = cachedMeta(dt); if (!meta || !hasPerm(meta, "submit", d, user)) return {};
  return String(d["owner"] ?? "") && String(d["owner"]) === user ? {} : { approve: true };
}
export function piApprovals(ar: boolean, user: string): HubApprovalsSpec {
  return {
    columns: (dt) => piColumns(dt, ar),
    can: (dt, d) => piCan(dt, d, user),
    decide: (dt, d, k, comment) => {
      if (k !== "approve" || !piCan(dt, d, user).approve) return [ar ? "لا يحق لك اعتماد هذه الفاتورة." : "You may not approve this invoice."];
      const meta = cachedMeta(dt); if (!meta) return [ar ? "تعريف المستند غير متاح." : "The document definition is not available."];
      const errs = submitDocument(meta, d.name, user);
      if (!errs.length && comment.trim()) adapter.insertDoc("Comment", { comment_type: "Comment", reference_doctype: dt, reference_name: d.name, content: comment.trim(), comment_email: user });
      return errs;
    },
    summary: (dt, d) => isPi(dt) ? <div className="grid gap-1.5 rounded-lg border border-border p-3 text-sm" data-approval-summary={d.name}>
      <div className="font-semibold" data-no-i18n>{String(d["supplier_name"] || d["supplier"] || d.name)}</div>
      <div className="flex flex-wrap gap-1.5">{pill(invoiceApproval(dt, d), ar, "approval")}{pill(invoicePayment(dt, d), ar, "payment")}</div>
    </div> : null,
  };
}
