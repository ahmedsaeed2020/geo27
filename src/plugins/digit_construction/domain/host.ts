/**
 * Where the Construction screens are running.
 *  - "virtual": the Virtual Core preview. Records live in the browser adapter; the demo installer and the preview
 *    maintenance passes (company backfill, demo child-table repair) are available.
 *  - "frappe": the Frappe-hosted UI (frappe-v16/ui). Records are loaded from and saved to the Frappe server, so every
 *    browser-only demo or maintenance write is disabled — demo data is installed only by a System Manager through the
 *    opt-in server installer on a disposable site.
 * The Frappe entry sets the host before any Construction module runs; the default keeps the preview unchanged.
 */
export type ConstructionHost = "virtual" | "frappe";

let host: ConstructionHost = "virtual";

export const constructionHost = (): ConstructionHost => host;
export const isFrappeHost = (): boolean => host === "frappe";
export function setConstructionHost(h: ConstructionHost): void { host = h; }
