/**
 * WF-07 — remaining research reports R-005 and R-039b on canonical records (adapter only).
 * R-005 Lead first-contact time: hours from CRM Lead.creation to the earliest logged timeline event
 *   (Communication, Email Queue, CRM Task, FCRM Note, CRM Call Log) linked to that lead. Leads with no
 *   logged event are reported separately — they are never averaged in as zero.
 * R-039b Promised close without follow-up: open deals that carry an expected_closure_date (a promise to
 *   the customer) but have no open CRM Task linked — value threshold does not apply (unlike R-020).
 */
import type { Doc } from "@/lib/adapter";
import { isOpenLead } from "./wf01";
import { isOpenDeal } from "./wf02";
import { dealFlags } from "./wf05";
import { firstCrmContact } from "@/lib/crmActivity";

/** Hours from lead creation to the first logged contact; null when no event is logged or creation is missing. */
export function firstContactHours(lead: Doc): number | null {
  const created = Date.parse(String(lead["creation"] ?? ""));
  if (!Number.isFinite(created)) return null;
  const first = firstCrmContact(lead);
  if (first === null) return null;
  return Math.max(0, Math.round(((first - created) / 36e5) * 10) / 10);
}

export type FirstContactStats = { contacted: number; noContact: Doc[]; avgHours: number | null; medianHours: number | null };

/** R-005 aggregate over open leads: average/median hours to first contact plus the no-contact list. */
export function firstContactStats(leads: Doc[]): FirstContactStats {
  const hours: number[] = [];
  const noContact: Doc[] = [];
  for (const l of leads.filter(isOpenLead)) {
    const h = firstContactHours(l);
    if (h === null) noContact.push(l); else hours.push(h);
  }
  hours.sort((a, b) => a - b);
  const avg = hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null;
  const median = hours.length ? hours[Math.floor((hours.length - 1) / 2)] ?? null : null;
  return { contacted: hours.length, noContact, avgHours: avg, medianHours: median };
}

/** R-039b: open deals with a promised close date (expected_closure_date) but no open follow-up task. */
export function promiseWithoutFollowUp(deals: Doc[]): Doc[] {
  return deals.filter((d) => isOpenDeal(d) && d["expected_closure_date"] && dealFlags(d).noNext);
}
