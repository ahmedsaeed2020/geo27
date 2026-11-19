/**
 * Notices for saves made by the Construction screens.
 * - Success: in the Virtual Core a save is final when the adapter call returns, so the notice shows at once. A host whose
 *   saves are confirmed later (the Frappe-hosted UI sends them to the server in a batch) installs a gate: the notice is
 *   held until the server accepts that batch and dropped if the server refuses it, so a screen never reports a save that
 *   did not happen.
 * - Error: never gated (it describes something that already failed). On Arabic screens rule refusals raised by the
 *   browser rules are shown with their Arabic template (i18n/ruleMessages.ts); other text is unchanged.
 */
import { toast } from "sonner";
import { localizeRuleMessage } from "../i18n/ruleMessages";

type Show = () => void;
/** saved runs when the server accepts the batch holding the screen's last write; refused when it does not. */
type Gate = (saved: Show, refused: Show) => void;
type ToastData = Parameters<typeof toast.error>[1];
let gate: Gate | null = null;

export function setSaveNoticeGate(g: Gate | null): void { gate = g; }

/** Runs `saved` once the screen's last write is final (at once in the Virtual Core), or `refused` if the host's server
 *  refuses it — e.g. to undo screen state that assumed the save. */
export function afterSave(saved: Show, refused: Show = () => {}): void {
  if (gate) gate(saved, refused); else saved();
}

export function notifySaved(message: Parameters<typeof toast.success>[0], data?: Parameters<typeof toast.success>[1]): void {
  afterSave(() => { toast.success(message, data); });
}

/** Shows a success notice immediately — only inside an afterSave `saved` step, where the save is already final. */
export function notifySavedNow(message: Parameters<typeof toast.success>[0], data?: Parameters<typeof toast.success>[1]): void {
  toast.success(message, data);
}

const arabicScreen = () => typeof document !== "undefined" && (document.documentElement.lang || "").startsWith("ar");

export function notifyError(message: Parameters<typeof toast.error>[0], data?: ToastData): void {
  const ar = arabicScreen();
  const msg = typeof message === "string" ? localizeRuleMessage(message, ar) : message;
  const desc = data && typeof data.description === "string" ? { ...data, description: localizeRuleMessage(data.description, ar) } : data;
  toast.error(msg, desc);
}
