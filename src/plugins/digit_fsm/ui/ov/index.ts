/**
 * Overview spec per generic destination workspace (ws/<key>). Each spec returns charts first, then KPI cards; the
 * shared OverviewFrame adds scope bar, queues, connected documents, recent changes and next steps. Dedicated pages
 * (Operations Center, Visits, Site Explorer, Technicians, Dispatch, …) render their own analytics.
 */
import type { OvFn } from "./ctx";
import { contracts, coverage, obligations, renewals, requests } from "./cr";
import { evidence, itmLead, published, results, runs } from "./itm";
import { aging, bySite, retests, risk } from "./def";
import { billing, commercial, labour, materials, profitability } from "./bill";
import { rptContracts, rptManager, rptQuality, rptTech } from "./rpt";
import { serviceHistory } from "./port";
import { comms, permissions, templates } from "./set";

export const OVERVIEWS: Record<string, OvFn> = {
  "service-history": serviceHistory,
  requests, contracts, coverage, obligations, renewals,
  "itm-lead": itmLead, runs, results, evidence, published,
  risk, "by-site": bySite, aging, retests,
  commercial, materials, labour, billing, profitability,
  "rpt-manager": rptManager, "rpt-tech": rptTech, "rpt-quality": rptQuality, "rpt-contracts": rptContracts,
  permissions, templates, comms,
};
