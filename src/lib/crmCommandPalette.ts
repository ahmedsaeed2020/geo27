/**
 * Port of crm/api/command_palette.py (search/recent/upcoming) and
 * frontend/src/utils/commandPalette.js (fuzzy ranking + grouping), run over the adapter.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser } from "@/lib/session";

export const UPCOMING_LIMIT = 5;
export const UPCOMING_TASK_DAYS = 7;
export const UPCOMING_SLA_HOURS = 24;
export const OVERDUE_GRACE_DAYS = 3;
const SLA_DUE_STATUSES = ["First Response Due", "Rolling Response Due"];
const CLOSED_TASK_STATUSES = ["Done", "Canceled"];
export const RECENT_LIMIT = 5;

export const SEARCH_TYPES: Record<string, [route: string, title: string, fields: string[]]> = {
  "CRM Lead": ["Lead", "lead_name", ["lead_name", "organization", "email", "mobile_no"]],
  "CRM Deal": ["Deal", "organization", ["organization", "email", "mobile_no"]],
  Contact: ["Contact", "full_name", ["full_name", "email_id", "mobile_no"]],
  "CRM Organization": ["Organization", "organization_name", ["organization_name", "website"]],
};

export type PaletteRecord = { doctype: string; name: string; title: string; route: string; keywords?: string };
export type Upcoming = { kind: "task" | "sla"; name: string; title: string; label: string; due: string; route: string; route_name: string | null };

const title = (d: Doc, field: string) => {
  if (field === "full_name") return String(d["full_name"] || [d["first_name"], d["last_name"]].filter(Boolean).join(" ") || d.name);
  if (field === "lead_name") return String(d["lead_name"] || [d["first_name"], d["last_name"]].filter(Boolean).join(" ") || d.name);
  return String(d[field] || d.name);
};
const value = (d: Doc, f: string) => f === "full_name" || f === "lead_name" ? title(d, f) : d[f];
const modDesc = (a: Doc, b: Doc) => String(b.modified ?? "").localeCompare(String(a.modified ?? ""));
const record = (d: Doc, dt: string): PaletteRecord => ({ doctype: dt, name: d.name, title: title(d, SEARCH_TYPES[dt]![1]), route: SEARCH_TYPES[dt]![0] });

export function search(query = "", recent: Record<string, string[]> = {}, now = new Date(), user = currentUser()) {
  const q = query.trim();
  return { matches: q.length >= 2 ? searchAll(q) : [], recent: q ? [] : getRecent(recent), upcoming: q ? [] : getUpcoming(now, user) };
}

function searchAll(q: string): PaletteRecord[] {
  const like = q.toLowerCase();
  return Object.entries(SEARCH_TYPES).flatMap(([dt, [, , fields]]) =>
    adapter.list(dt).filter(d => ["name", ...fields].some(f => String(value(d, f) ?? "").toLowerCase().includes(like))).sort(modDesc).slice(0, 5)
      .map(d => ({ ...record(d, dt), keywords: ["name", ...fields].map(f => value(d, f)).filter(Boolean).join(" ") })));
}

function getRecent(recent: Record<string, string[]>): PaletteRecord[] {
  return Object.entries(recent).flatMap(([dt, names]) => SEARCH_TYPES[dt] && Array.isArray(names)
    ? names.slice(0, 5).map(n => adapter.get(dt, n)).filter((d): d is Doc => !!d).map(d => record(d, dt)) : []);
}

function inWindow(due: string, now: Date, hours: number) {
  const t = new Date(due.replace(" ", "T")).getTime(); if (Number.isNaN(t)) return false;
  return t >= now.getTime() - OVERDUE_GRACE_DAYS * 864e5 && t <= now.getTime() + hours * 36e5;
}

export function getUpcoming(now = new Date(), user = currentUser()): Upcoming[] {
  const tasks: Upcoming[] = adapter.list("CRM Task").filter(t => !CLOSED_TASK_STATUSES.includes(String(t["status"])) && t["assigned_to"] === user && t["due_date"] && inWindow(String(t["due_date"]), now, UPCOMING_TASK_DAYS * 24))
    .map(t => { const ref = SEARCH_TYPES[String(t["reference_doctype"])]; return { kind: "task", name: t.name, title: String(t["title"] ?? t.name), label: "Task", due: String(t["due_date"]), route: ref && t["reference_docname"] ? ref[0] : "Tasks", route_name: ref ? String(t["reference_docname"] ?? "") || null : null }; });
  const slas: Upcoming[] = ["CRM Lead", "CRM Deal"].flatMap(dt => adapter.list(dt).filter(d => SLA_DUE_STATUSES.includes(String(d["sla_status"])) && d["response_by"] && inWindow(String(d["response_by"]), now, UPCOMING_SLA_HOURS) && String(d["_assign"] ?? "").includes(user))
    .map(d => ({ kind: "sla" as const, name: d.name, title: title(d, SEARCH_TYPES[dt]![1]), label: "Response due", due: String(d["response_by"]), route: SEARCH_TYPES[dt]![0], route_name: d.name })));
  return [...tasks, ...slas].sort((a, b) => a.due.localeCompare(b.due)).slice(0, UPCOMING_LIMIT);
}

// ---- utils/commandPalette.js ----
const SCORE = { prefix: 1000, word: 850, substring: 700, subsequence: 400 };
const norm = (v: unknown) => String(v ?? "").trim().toLocaleLowerCase();
export function fuzzyScore(v: unknown, q: string): number {
  const text = norm(v), term = norm(q); if (!term) return 0;
  if (text.startsWith(term)) return SCORE.prefix - (text.length - term.length);
  const m = text.match(new RegExp(`(?:^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)); if (m?.index != null && m.index >= 0) return SCORE.word - m.index;
  const i = text.indexOf(term); if (i >= 0) return SCORE.substring - i;
  let last = -1, gap = 0; for (const c of term) { const k = text.indexOf(c, last + 1); if (k < 0) return -1; gap += k - last - 1; last = k; }
  return SCORE.subsequence - gap;
}
export type Command = { id: string; title: string; group?: string; subtitle?: string; keywords?: string; weight?: number; rank?: number; translate?: boolean; icon?: string; perform?: () => void; children?: () => Command[] };
export function scoreCommand(c: Command, q: string) { if (c.rank != null) return c.rank; return Math.max(fuzzyScore(c.title, q), fuzzyScore(c.keywords, q) * 0.75) * (c.weight ?? 1); }
export function groupCommands(cmds: Command[], q = ""): { title: string; items: Command[] }[] {
  const ranked = cmds.map((command, index) => ({ command, index, score: scoreCommand(command, q) })).filter(x => x.score >= 0).sort((a, b) => b.score - a.score || a.index - b.index);
  const groups = new Map<string, Command[]>();
  for (const { command } of ranked) { const g = command.group || ""; if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(command); }
  return [...groups].map(([title, items]) => ({ title, items }));
}
export const GROUP_ORDER: Record<string, number> = { Upcoming: 400, Recent: 300, Create: 250, Navigate: 200, Account: 150 };
export function ordered(cmds: Command[], q: string) { return q.trim() ? cmds : cmds.map(c => c.rank != null ? c : { ...c, rank: GROUP_ORDER[c.group ?? ""] ?? 0 }); }

// ---- recents (useCRMCommands.js rememberRoute) ----
const recentKey = (user: string) => `crm-command-palette-recent:${user || "anonymous"}`;
export function readRecent(user = currentUser()): { doctype: string; name: string }[] {
  try { const r = JSON.parse(localStorage.getItem(recentKey(user)) || "[]"); return Array.isArray(r) ? r : []; } catch { return []; }
}
export function rememberRecent(doctype: string, name: string, user = currentUser()) {
  const recent = [{ doctype, name }, ...readRecent(user).filter(i => i.doctype !== doctype || i.name !== name)].slice(0, RECENT_LIMIT);
  localStorage.setItem(recentKey(user), JSON.stringify(recent));
}
export function recentNamesByDoctype(recent: { doctype: string; name: string }[]) {
  const out: Record<string, string[]> = {}; for (const { doctype, name } of recent) out[doctype] = [...(out[doctype] || []), name]; return out;
}
export function sortByRecency(records: PaletteRecord[], recent: { doctype: string; name: string }[]) {
  const pos = (r: PaletteRecord) => recent.findIndex(i => i.doctype === r.doctype && i.name === r.name);
  return [...records].sort((a, b) => pos(a) - pos(b));
}

export const SETTINGS_SECTIONS: { title: string; manager?: boolean; pages: string[] }[] = [
  { title: "My settings", pages: ["Profile", "Preferences", "Templates", "Telephony"] },
  { title: "Workspace", manager: true, pages: ["General", "Brand", "Dashboard", "Defaults", "Home Actions"] },
  { title: "Team", manager: true, pages: ["Users", "Invite User", "Sales Hierarchy", "Workflow Automations", "Assignment Rules"] },
  { title: "Integrations", manager: true, pages: ["SLA Policies", "Accounts", "ERPNext", "Lead Syncing"] },
];
