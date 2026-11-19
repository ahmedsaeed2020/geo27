/**
 * Shared helpers of the HR R9 port: the same checks digit_hr.api.permission and frappe helpers make in the Python source
 * (is_hr, own_employees, has_app_permission, user enabled, add_comment), translated messages with {0} placeholders,
 * and the action flag the source controllers read (frappe.flags.digit_*_action). Preview simulation over the shared
 * adapter and the HR-scoped permission helpers; the real Frappe server stays the authority.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { t } from "@/i18n";
import { assertScoped } from "@/plugins/digit_hr/compat/scope";
import { currentUser, PermissionError, userRoles, type PType } from "@/plugins/digit_hr/compat/session";

export { PermissionError };
/** frappe.ValidationError: a refused input, shown as a message (not a permission problem). */
export class R9ValidationError extends Error { override name = "ValidationError"; }

/** frappe._(msg).format(...args): template translated first, then the values put in. */
export function _(msg: string, ...args: unknown[]): string {
  return t(msg).replace(/\{(\d+)\}/g, (m, i: string) => (args[Number(i)] === undefined ? m : String(args[Number(i)])));
}

export const s = (v: unknown): string => (v == null ? "" : String(v));
const pad = (n: number) => String(n).padStart(2, "0");
/** frappe.utils.now_datetime() as stored by the adapter ("YYYY-MM-DD HH:MM:SS", local time). */
export function nowDatetime(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function today(d = new Date()): string { return nowDatetime(d).slice(0, 10); }
export function addDays(dt: string, days: number): string { const d = toDate(dt); d.setDate(d.getDate() + days); return nowDatetime(d); }
export function addHours(dt: string, hours: number): string { const d = toDate(dt); d.setTime(d.getTime() + hours * 3600_000); return nowDatetime(d); }
/** getdate / get_datetime for the stored "YYYY-MM-DD[ HH:MM[:SS]]" or ISO strings. */
export function toDate(v: unknown): Date {
  const m = s(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return new Date(s(v));
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
}
export const dateOnly = (v: unknown) => s(v).slice(0, 10);

const HR_ROLES = ["HR Manager", "HR User", "System Manager"];
/** digit_hr.api.permission.is_hr */
export function isHr(user = currentUser()): boolean { return user === "Administrator" || userRoles(user).some((r) => HR_ROLES.includes(r)); }
/** has_app_permission: HR roles or the Employee role (data access is still decided per DocType). */
export function hasAppPermission(user = currentUser()): boolean { return isHr(user) || userRoles(user).includes("Employee"); }
/** own_employees: Employees whose user_id is the user. */
export function ownEmployees(user = currentUser()): string[] {
  if (!user || user === "Guest") return [];
  return adapter.list("Employee").filter((e) => s(e["user_id"]) === user).map((e) => e.name);
}
/** frappe.db.get_value("User", user, "enabled") */
export function userEnabled(user: unknown): boolean {
  const u = s(user); if (!u) return false;
  if (u === "Administrator") return true;
  const d = adapter.get("User", u); return !!d && Number(d["enabled"] ?? 0) === 1;
}
/** frappe.has_permission through the DIGIT HR scope (role rules, if_owner, User Permission, HR identity narrowing). */
export function can(dt: string, ptype: PType, doc?: Doc, user = currentUser()): boolean {
  try { assertScoped(dt, ptype, doc, user); return true; } catch { return false; }
}
export function requireApp(user = currentUser()): void {
  if (!hasAppPermission(user)) throw new PermissionError(_("You do not have access to DIGIT HR"));
}
/** doc.add_comment("Info", text) */
export function addInfoComment(dt: string, name: string, content: string, user = currentUser()): void {
  adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: dt, reference_name: name, content, owner: user, comment_email: user });
}

/** frappe.flags.digit_<x>_action — set only while an R9 action saves, read by the ported controller rules. */
const flags = new Set<string>();
export function flagged(name: string): boolean { return flags.has(name); }
export function withFlag<T>(name: string, fn: () => T): T { flags.add(name); try { return fn(); } finally { flags.delete(name); } }

/** Synchronous SHA-256 (hex) for the invite token hash (hashlib.sha256(token).hexdigest()). */
export function sha256Hex(text: string): string {
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const bytes = Array.from(new TextEncoder().encode(text));
  const bitLen = bytes.length * 8;
  bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(Math.floor(bitLen / 2 ** (i * 8)) & 0xff);
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const r = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  const W = new Array<number>(64).fill(0);
  for (let o = 0; o < bytes.length; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = ((bytes[o + i * 4]! << 24) | (bytes[o + i * 4 + 1]! << 16) | (bytes[o + i * 4 + 2]! << 8) | bytes[o + i * 4 + 3]!) >>> 0;
    for (let i = 16; i < 64; i++) {
      const w15 = W[i - 15]!, w2 = W[i - 2]!;
      W[i] = (W[i - 16]! + (r(w15, 7) ^ r(w15, 18) ^ (w15 >>> 3)) + W[i - 7]! + (r(w2, 17) ^ r(w2, 19) ^ (w2 >>> 10))) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + W[i]!) >>> 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0]! + a) >>> 0; H[1] = (H[1]! + b) >>> 0; H[2] = (H[2]! + c) >>> 0; H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0; H[5] = (H[5]! + f) >>> 0; H[6] = (H[6]! + g) >>> 0; H[7] = (H[7]! + h) >>> 0;
  }
  return H.map((x) => x.toString(16).padStart(8, "0")).join("");
}
/** secrets.token_urlsafe(32) */
export function tokenUrlsafe(nbytes = 32): string {
  const b = new Uint8Array(nbytes); globalThis.crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
