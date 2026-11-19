/**
 * Source-aware Back (owner addendum C, document page anatomy): for every pushed history entry, remember the page it was
 * opened from (href, history index and the visible page heading at the moment of leaving). A document page then offers
 * "← Back to <that page>" — browser Back when it is the previous entry (filters, paging and scroll are restored), a
 * normal navigation otherwise. Deep links have no origin and fall back to the DocType list. Session-scoped, display
 * only; it never stores business data.
 */
import { useEffect, useState } from "react";
import { useRouter, useRouterState, type AnyRouter } from "@tanstack/react-router";
import type { HistoryLocation } from "@tanstack/history";

export interface NavOrigin { href: string; path: string; label: string; index: number }
const KEY = "digit-nav-origins";
const MAX = 200;
let installed = false;

type LocState = { __TSR_key?: string; key?: string; __TSR_index?: number } | undefined;
const keyOf = (state: unknown) => { const s = state as LocState; return s?.__TSR_key ?? s?.key ?? ""; };
const indexOf = (state: unknown) => (state as LocState)?.__TSR_index ?? 0;

function read(): Record<string, NavOrigin> {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "{}") as Record<string, NavOrigin>; } catch { return {}; }
}
function write(m: Record<string, NavOrigin>) {
  const keys = Object.keys(m); if (keys.length > MAX) for (const k of keys.slice(0, keys.length - MAX)) delete m[k];
  try { sessionStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage full or disabled: Back falls back to the list */ }
}

/** The heading the user sees on the page being left (main h1, else the last breadcrumb). */
function pageLabel(): string {
  const h = document.querySelector<HTMLElement>("[data-shell-main] h1, main h1");
  const crumb = document.querySelector<HTMLElement>("[data-crumb-doc], nav[aria-label='Breadcrumb'] > span:last-child");
  return ((h?.innerText || crumb?.innerText || document.title || "").replace(/\s+/g, " ").trim()).slice(0, 80);
}

/** Install once (Shell mount). Records origins only for PUSH navigations; Back/Forward/Replace keep what was stored. */
export function installNavOrigins(router: AnyRouter) {
  if (installed || typeof window === "undefined") return; installed = true;
  let prev = { href: router.state.location.href, path: router.state.location.pathname, index: indexOf(router.state.location.state) };
  router.history.subscribe(({ location, action }: { location: HistoryLocation; action: unknown }) => {
    const type = (action as { type?: string } | undefined)?.type;
    if (type === "PUSH" && location.pathname !== prev.path) {
      const key = keyOf(location.state);
      if (key) { const m = read(); m[key] = { href: prev.href, path: prev.path, label: pageLabel(), index: prev.index }; write(m); }
    }
    prev = { href: location.href, path: location.pathname, index: indexOf(location.state) };
  });
}

/** Origin of the current history entry (after hydration), or undefined for a deep link. */
export function useNavOrigin(): NavOrigin | undefined {
  const loc = useRouterState({ select: (r) => r.location });
  const [o, setO] = useState<NavOrigin | undefined>(undefined);
  const key = keyOf(loc.state);
  // the recorder writes in the same tick as the navigation, so read on the next one
  useEffect(() => { setO(read()[key]); const t = setTimeout(() => setO(read()[key]), 0); return () => clearTimeout(t); }, [key]);
  return o;
}

/** Go back to an origin: browser Back when it is the previous entry (restores scroll + list state), else navigate. */
export function useGoBack() {
  const router = useRouter();
  return (o: NavOrigin) => {
    const cur = indexOf(router.state.location.state);
    if (o.index === cur - 1) router.history.back(); else void router.navigate({ href: o.href });
  };
}
