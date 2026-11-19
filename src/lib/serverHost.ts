/**
 * True only in the Frappe-hosted build (frappe_apps/digit_enterprise/ui, define DIGIT_HOST = "frappe-v16"). There the
 * records belong to the real site, so the synthetic seeders and plugin fixtures/demo installers never run. In the
 * Lovable preview this is always false and nothing changes.
 */
export const isServerHosted = (): boolean => (import.meta.env as Record<string, unknown>)["DIGIT_HOST"] === "frappe-v16";
