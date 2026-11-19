/**
 * Experience declarations for Enterprise host members that have no Virtual Core plugin. DIGIT Distribution is a real
 * member of the host's app list (api/apps.py DIGIT_APPS, public/js/distribution-host.js) whose UI runs only on a Frappe
 * site, so it is declared FRAPPE_HOST: it stays in the registry (traceable, never dropped) and resolves NOT_INSTALLED in
 * this preview — no link, no data. Its screens are not declared because their source is not in this project.
 */
import type { ExperienceDeclaration } from "./contract";
import { EXPERIENCE_CONTRACT_VERSION } from "./contract";
import { ENTERPRISE_ARCHIVE } from "./hostApps";

export function hostOnlyExperiences(): ExperienceDeclaration[] {
  return [{
    experience: {
      appId: "digit_distribution", contractVersion: EXPERIENCE_CONTRACT_VERSION, runtime: "FRAPPE_HOST",
      sourceVersion: `${ENTERPRISE_ARCHIVE.file} sha256:${ENTERPRISE_ARCHIVE.sha256.slice(0, 12)} (public/js/distribution-host.js)`,
      entryRoute: "/digit/plugins/digit_distribution", owner: "digit_distribution", title: ["DIGIT Distribution", "ديجيت للتوزيع"],
      screens: [], supportedSharedPatterns: ["shell", "navigation", "rtl", "states"], registers: [],
    },
  }];
}
