/**
 * App experience slot providers (src/plugins/experienceSlots.tsx), keyed by plugin name. Adding an app's shell slots =
 * one import line here, mirroring src/plugins/registry.ts; Core screens never import an app directly.
 */
import type { ExperienceSlots } from "./experienceSlots";
import { digitProSlots } from "./digit_pro/slots";
import { digitHrSlots } from "./digit_hr/slots";
import { digitConstructionSlots } from "./digit_construction/slots";
import { digitCrmSlots } from "./digit_crm/slots";
import { digitFsmSlots } from "./digit_fsm/slots";

/** Function (not a module-level constant) so app modules that cycle through the Core Shell are never read before they initialise. */
export function slotProviders(): Record<string, ExperienceSlots> { return { digit_pro: digitProSlots, digit_hr: digitHrSlots, digit_construction: digitConstructionSlots, digit_crm: digitCrmSlots, digit_fsm: digitFsmSlots }; }
