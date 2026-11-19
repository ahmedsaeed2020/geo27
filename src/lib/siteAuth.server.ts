/**
 * Server-only DIGIT Core sign-in gate. Accepts the site's existing admin accounts (Lovable Cloud email + password with the
 * admin role) and issues an httpOnly cookie signed with the DIGIT_CORE_SESSION_KEY secret, so no credential or signing
 * key lives in source and the gate cannot be forged from browser storage.
 */
import { createClient } from "@supabase/supabase-js";

export const SITE_COOKIE = "digit_site_session";
export const SITE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function signingKey(): string {
  const k = process.env["DIGIT_CORE_SESSION_KEY"];
  if (!k || k.length < 32) throw new Error("DIGIT_CORE_SESSION_KEY is not configured");
  return k;
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(signingKey()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueSiteToken(userId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SITE_MAX_AGE;
  const body = `${userId}.${exp}`;
  return `${body}.${await sign(body)}`;
}

export async function isValidSiteToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [user, exp, mac] = token.split(".");
  if (!user || !exp || !mac || !(Number(exp) > Date.now() / 1000)) return false;
  try {
    return sameText(mac, await sign(`${user}.${exp}`));
  } catch {
    return false;
  }
}

export function siteTokenFromCookieHeader(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SITE_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** Returns the user id when the email/password belong to a site admin; null otherwise. */
export async function verifySiteAdmin(email: string, password: string): Promise<string | null> {
  const url = process.env["SUPABASE_URL"];
  const publishable = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (email && !email.includes("@")) email = `${email}@geointime.trilogy.com.sa`;
  if (!url || !publishable || !email.includes("@")) return null;
  const sb = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  const { data: isAdmin } = await sb.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
  await sb.auth.signOut({ scope: "local" }).catch(() => undefined);
  return isAdmin === true ? data.user.id : null;
}
