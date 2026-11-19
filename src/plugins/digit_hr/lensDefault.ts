/**
 * NB1-03 landing lens for the Employee & Manager Experience home (presentation only — never changes access).
 * Order: explicit URL lens → the user's saved preference → a manager with requests that name them (or their team)
 * opens on Team → a linked employee opens on Me → an HR role without an employee link opens on HR desk → Me.
 * A lens the user is not offered is ignored at every step, so a stale URL or preference cannot widen what is shown.
 */
export type Lens = "me" | "team" | "hr";
export type LensReason = "url" | "saved" | "team-approvals" | "linked" | "hr-role" | "fallback";

export function pickLens(o: { url?: unknown; saved?: string | null; lenses: Lens[]; linked: boolean; admin: boolean; actionableTeam: number }): { lens: Lens; reason: LensReason } {
  const ok = (v: unknown): v is Lens => typeof v === "string" && (o.lenses as string[]).includes(v);
  if (ok(o.url)) return { lens: o.url, reason: "url" };
  if (ok(o.saved)) return { lens: o.saved, reason: "saved" };
  if (o.lenses.includes("team") && o.actionableTeam > 0) return { lens: "team", reason: "team-approvals" };
  if (o.linked) return { lens: "me", reason: "linked" };
  if (o.admin && o.lenses.includes("hr")) return { lens: "hr", reason: "hr-role" };
  return { lens: "me", reason: "fallback" };
}

const KEY = "digit-hr:lens-pref:v1";
const read = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>; } catch { return {}; } };
/** Saved landing lens for one user (per browser); null before hydration or when none was chosen. */
export function savedLens(user: string): string | null { if (typeof window === "undefined") return null; return read()[user] ?? null; }
export function saveLens(user: string, lens: Lens | null) {
  if (typeof window === "undefined") return;
  const all = read(); if (lens) all[user] = lens; else delete all[user];
  localStorage.setItem(KEY, JSON.stringify(all));
}
