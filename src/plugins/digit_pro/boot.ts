/** Runtime boot of DIGIT Pro: registers its memory-only review samples on the shared sample layer (enabled app only, never on the Frappe-hosted build). Imported by src/plugins/builtinBoot.ts. */
import { registerVolumeProvider } from "@/lib/volume";
import { isServerHosted } from "@/lib/serverHost";
import { isEnabled } from "../runtime";
import { proSampleVolume } from "./sampleVolume";
import "./policyDefaults"; // owner policy defaults: submit gates registered on the shared adapter (active only while DIGIT Pro is enabled)

registerVolumeProvider("digit_pro", proSampleVolume, () => isEnabled("digit_pro") && !isServerHosted());

// S3 My Work: the header counter counts the same rows as the unified approval inbox (own + delegated)
import { registerWorkSource } from "@/lib/myWork";
import { defaultCompany } from "@/lib/sessionDefaults";
import { unifiedInbox } from "./approvalDelegation";
registerWorkSource({ id: "digit_pro:approvals", kind: "approval", label: ["Approvals for you", "اعتمادات بانتظارك"], active: () => isEnabled("digit_pro"),
  inbox: { to: "/pro/dashboard", label: ["Open the approval inbox", "افتح صندوق الاعتمادات"] },
  items: (user) => unifiedInbox(user, defaultCompany(user)).map((i) => ({ kind: "approval", doctype: i.doctype, name: i.name, title: i.party || i.name, hint: i.reason, ...(i.onBehalfOf ? { onBehalfOf: i.onBehalfOf } : {}) })) });
