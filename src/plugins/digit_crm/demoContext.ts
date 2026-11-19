/**
 * DIGIT CRM data context — Final Core adaptation of the source's demo/own-records switch.
 * The source switched the shared adapter into a separate demo storage partition and remembered that choice per user.
 * The Final Core has one shared record store for every app (no duplicate stores), so there is nothing to switch:
 * DIGIT CRM always reads the shared, permission-scoped records. These functions keep the source's API so screens and
 * reports compile unchanged; they never write records or settings. Gap CRM-G1 (docs/digit-app-builder/crm/FINAL_CORE_IMPORT.md).
 */
export type CrmDataChoice = { owner: string; choice: { context: "records"; selected_at: string } };
/** Saved data choice of a user: always none in the Final Core (shared records only). */
export function crmDataChoice(_user?: string, _s?: unknown): CrmDataChoice | undefined { return undefined; }
/** No-op: there is no demo partition to remember. */
export function rememberCrmDemo(_owner: string, _demoUser = "Administrator") { /* shared records only */ }
/** No-op: own records are the only records. */
export function rememberOwnRecords(_owner: string) { /* shared records only */ }
/** No-op: switching experience never changes the data partition in the Final Core. */
export function syncCrmDemoContext(_experience: string) { /* shared records only */ }
export function forgetSuspendedCrmDemo() { /* shared records only */ }
