/**
 * Build stamp (owner recommendation ENT-OWN-020): which build is live — the commit the bundle was built from and the
 * build time — injected once by vite.config.ts `define` and shown read-only in the shared user menu, so a user can say
 * which version they are looking at. Tests and tools without the define see "dev".
 */
declare const __DIGIT_BUILD__: { commit: string; time: string } | undefined;

export interface BuildStamp { commit: string; time: string }

export const BUILD: BuildStamp = typeof __DIGIT_BUILD__ !== "undefined" && __DIGIT_BUILD__ ? __DIGIT_BUILD__ : { commit: "dev", time: "" };

/** "a1b2c3d · 2026-11-12 06:40 UTC" (time omitted when unknown). */
export function buildLabel(b: BuildStamp = BUILD): string {
  const t = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(b.time) ? `${b.time.slice(0, 10)} ${b.time.slice(11, 16)} UTC` : "";
  return [b.commit || "dev", t].filter(Boolean).join(" · ");
}
