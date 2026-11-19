/**
 * Shared-experience declarations (src/plugins/experience/contract.ts), one line per app, mirroring slotRegistry.ts. Adding
 * an app's screen/block contract = one import + one entry here; the registry validates it strictly and rejects (fails
 * closed) anything malformed, unknown or not owned by the declaring app. Frappe-host-only members of the Enterprise host
 * (DIGIT Distribution) are declared by the host list itself, never as a virtual plugin.
 */
import type { ExperienceDeclaration } from "./experience/contract";
import { digitProExperience } from "./digit_pro/experience";
import { digitHrExperience } from "./digit_hr/experience";
import { digitConstructionExperience } from "./digit_construction/experience";
import { digitCrmExperience } from "./digit_crm/experience";
import { digitFsmExperience } from "./digit_fsm/experience";
import { hostOnlyExperiences } from "./experience/hostDeclarations";

/** Function (not a constant) so app modules are read only after they initialise. */
export function experienceDeclarations(): ExperienceDeclaration[] {
  return [digitProExperience(), digitHrExperience(), digitConstructionExperience(), digitCrmExperience(), digitFsmExperience(), ...hostOnlyExperiences()];
}
