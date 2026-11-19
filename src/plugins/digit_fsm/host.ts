/**
 * Where the DIGIT FSM + ITM screens are running.
 *  - "virtual": the Virtual Core preview. Records live in the browser adapter and the demo installer is available.
 *  - "frappe": the Frappe-hosted UI (frappe_apps/digit_fsm/ui, served at /digit-fsm). Records come from and go to the
 *    Frappe server; business actions run as whitelisted server methods, and no browser demo data is ever written.
 * The Frappe entry sets the host before any FSM module runs; the default keeps the preview unchanged.
 */
export type FsmHost = "virtual" | "frappe";

let host: FsmHost = "virtual";

export const fsmHost = (): FsmHost => host;
export const isFsmFrappeHost = (): boolean => host === "frappe";
export function setFsmHost(h: FsmHost): void { host = h; }
