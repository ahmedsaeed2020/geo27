/**
 * DIGIT CRM data context in the Final Core. The CRM source snapshot could switch the shared adapter into a separate
 * "enterprise demo" storage partition (adapter.selectDemoProfile). The Final Core keeps ONE shared record store for every
 * app (no duplicate stores), so that partition is not imported: DIGIT CRM always works on the shared, permission-scoped
 * Frappe CRM / ERPNext records, which the Core seed already provides. Recorded as CRM-G1 in
 * docs/digit-app-builder/crm/FINAL_CORE_IMPORT.md.
 */
/** Identifier the source used for its demo partition; kept so source-shaped tags and exports stay recognisable. */
export const CRM_DEMO_PROFILE = "DIGIT_CRM_ENTERPRISE_DEMO_V1";
let fixture = "";
/** Active demo partition: none in the Final Core app (shared records only); only a vitest fixture run marks it. */
export const activeDemoProfile = (): string => fixture;
/**
 * Test harness only (vitest): marks the in-memory shared store of a test file as holding the source's enterprise demo
 * fixture, so the source's widget/report reconciliation tests run against the same generated corpus. Throws in the app.
 */
export function markDemoFixture(on: boolean) {
  if (import.meta.env?.MODE !== "test") throw new Error("markDemoFixture is a test harness helper");
  fixture = on ? CRM_DEMO_PROFILE : "";
}
/**
 * Read-only preview worker (demoPreview.worker.ts): the generator needs the demo profile active, so the worker marks it in
 * its OWN module instance — separate memory from the app, no browser storage. Refuses to run in a page (window present).
 */
export function enterPreviewWorker() {
  if (typeof window !== "undefined" || typeof (globalThis as { importScripts?: unknown }).importScripts !== "function") throw new Error("enterPreviewWorker runs only inside the CRM demo preview worker");
  fixture = CRM_DEMO_PROFILE;
}
/** Whether the separate demo partition can be used here (never in the Final Core). */
export const demoPartitionAvailable = false;
