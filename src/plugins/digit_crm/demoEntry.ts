/**
 * Direct-link demo activation (?demo=activate) — Final Core adaptation. The source generated an isolated demo partition
 * on explicit request; the Final Core has one shared store, so the request is ignored (never seeds) and DIGIT CRM opens
 * on the shared records. Gap CRM-G1.
 */
import { activeDemoProfile, demoPartitionAvailable } from "./dataContext";

export function activateRequestedCrmDemo(_pathname: string, search: string) {
  const explicitActivation = new URLSearchParams(search).get("demo") === "activate";
  if (!demoPartitionAvailable || activeDemoProfile() || !explicitActivation) return false;
  return false;
}
