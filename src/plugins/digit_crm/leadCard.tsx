/**
 * One lead card (owner notes C-05), shared by the qualification board and the lead list's kanban view; its own module so
 * neither page imports the other.
 */
import { Link } from "@tanstack/react-router";
import { peekRow } from "@/components/enterprise/QuickView";
import type { StageCard } from "@/components/enterprise/kit/StageBoard";
import { Avatar } from "@/components/enterprise/kit/RecordFrame";
import { LEAD_STATUS_HUE, type LeadRow } from "./leadDesk";
import { dueText, LeadScore, LeadSlaChip, OwnerTag, sar, tx } from "./CrmRecordParts";

const s = (v: unknown) => String(v ?? "");
export const LEAD_HUE_VAR: Record<string, string> = { blue: "var(--blue)", amber: "var(--amber)", violet: "var(--violet)", emerald: "var(--emerald)", teal: "var(--teal)", rose: "var(--rose)", grey: "var(--grey)" };

/** One lead card, shared by this board and the lead list's kanban view. */
export function leadCard(r: LeadRow, ar: boolean, keys: string[]): StageCard {
  const d = r.next ? dueText(r.nextDue, ar) : null;
  return {
    key: r.name, draggable: !Number(r.l["converted"]), onOpen: (el) => peekRow("CRM Lead", r.name, keys, el),
    title: <span className="flex min-w-0 items-center gap-2"><Avatar name={r.title} size={28} hue={LEAD_STATUS_HUE[r.stage] === "grey" ? "grey" : undefined} /><Link to="/digit-crm/leads/$leadId" params={{ leadId: r.name }} className="min-w-0 truncate text-primary hover:underline" data-no-i18n data-lead-link={r.name}>{r.title}</Link></span>,
    sub: <bdi data-no-i18n>{r.company || "—"}</bdi>, amountText: r.value ? sar(r.value) : undefined,
    flags: [...(r.open && !r.next ? [{ key: "nonext", tone: "warn" as const, label: tx(ar, "No next step", "لا توجد خطوة تالية") }] : [])],
    body: <div className="mt-1.5 grid gap-1.5 text-xs" data-lead-card={r.name}>
      <span className="flex flex-wrap items-center gap-1.5"><LeadScore r={r} ar={ar} plain /><LeadSlaChip sla={r.sla} ar={ar} /></span>
      {r.next && d && <span className="block min-w-0" data-next-tone={d.tone ?? "ok"}><span className="block truncate" data-no-i18n>{s(r.next["title"])}</span>
        <small className={d.tone === "bad" ? "font-semibold text-[var(--negative)]" : d.tone === "warn" ? "font-semibold text-[var(--warning)]" : "text-muted-foreground"} data-no-i18n>{d.text}</small></span>}
      <OwnerTag user={r.owner} ar={ar} />
    </div>,
  };
}

