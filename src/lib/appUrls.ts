/**
 * App address maps applied as the router's URL rewrite (src/router.tsx): an app that owns its own visible address space
 * (Construction: /construction/…, HR: /hr/…, FSM: /fsm/…) declares one input/output pair here, so the router keeps its internal paths while
 * every Link, navigate and redirect shows the app's address. Each pair returns undefined for addresses it does not own.
 */
import type { LocationRewrite } from "@tanstack/react-router";
import { conInput, conOutput } from "@/plugins/digit_construction/urls";
import { hrInput, hrOutput } from "@/plugins/digit_hr/product/urls";
import { fsmInput, fsmOutput } from "@/plugins/digit_fsm/urls";

type Pair = { input: (u: URL) => URL | undefined; output: (u: URL) => URL | undefined };
// merged site build: Construction / HR / FSM apps are off and /construction, /hr, /fsm are website pages
void conInput; void conOutput; void hrInput; void hrOutput; void fsmInput; void fsmOutput;
const MAPS: Pair[] = [];

export const appUrlRewrite: LocationRewrite = {
  input: ({ url }) => { for (const m of MAPS) { const r = m.input(url); if (r) return r; } return undefined; },
  output: ({ url }) => { for (const m of MAPS) { const r = m.output(url); if (r) return r; } return undefined; },
};
/** Visible href of an internal href (address-bar writes outside the router, copied links). */
export function publicHref(href: string): string {
  const u = new URL(href, "http://x");
  for (const m of MAPS) { const r = m.output(u); if (r) return `${r.pathname}${r.search}${r.hash}`; }
  return href;
}
/** Internal router path of a visible href (the inverse of publicHref): an app address such as /construction/doc/… maps back to /app/…. */
export function internalPath(href: string): string {
  const u = new URL(href, "http://x");
  for (const m of MAPS) { const r = m.input(u); if (r) return r.pathname; }
  return u.pathname;
}
