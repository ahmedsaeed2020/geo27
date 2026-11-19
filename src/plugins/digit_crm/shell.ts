import { registerCrmListExtensions } from "./register";
import { registerCrmSampleNamesEn } from "./sampleNamesEn";
import { registerCrmInsights } from "./Workspace";
import { registerCreateOverride } from "@/components/enterprise/CreatePanel";

/**
 * Final Core: registers DIGIT CRM's opt-in register extensions and insight panels (src/components/crm/listExt.ts). The
 * source also registered a prefix-based app shell (src/lib/appShells.ts); in the Final Core the shared experience slots
 * (./slots.tsx) provide the CRM navigation instead, so no app shell registry is imported. Called from builtinBoot.
 */
export function initializeCrmPresentation() {
  registerCrmListExtensions();
  registerCrmSampleNamesEn();
  registerCrmInsights();
  registerCreateOverride("CRM Lead", () => import("./LeadCreate").then((m) => ({ default: m.LeadCreatePanel })));
}
