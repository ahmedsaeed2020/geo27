/** Open/closed state of the DIGIT Assistant panel, shared by the dock button (rail + phone grid) and the panel host. */
import { useSyncExternalStore } from "react";

let open = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function setAssistantOpen(v: boolean) { if (open !== v) { open = v; emit(); } }
export const toggleAssistant = () => setAssistantOpen(!open);
export function useAssistantOpen(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => open, () => false);
}

/** One saved conversation per simulated user, in this browser only. */
export const historyKey = (user: string) => `digit-assistant:v1:${user}`;
export const MAX_SAVED_MESSAGES = 40;
