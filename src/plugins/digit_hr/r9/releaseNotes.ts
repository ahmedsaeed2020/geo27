/** SHL-08 release notes — digit_hr.capabilities.release_notes over the source release_notes.json (copied verbatim).
 * `status` is the source state only (candidate = in main, not released on a site); a site's deployed state is not known here. */
import NOTES from "./source/release_notes.json";

export type ReleaseNote = { version: string; date: string; status: string; title: { ar: string; en: string }; highlights: { ar: string; en: string; features?: string[] }[]; not_included?: { ar: string; en: string }[] };
export function releaseNotes(): ReleaseNote[] { return ((NOTES as { releases: ReleaseNote[] }).releases ?? []).slice(); }
