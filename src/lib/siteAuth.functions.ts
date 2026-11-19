/**
 * DIGIT Core sign-in gate (app paths). Credentials are checked only on the server against the site's admin accounts and
 * the browser receives an httpOnly signed cookie, so the check cannot be bypassed by editing browser storage.
 * The simulated ERP "Switch User" session (src/lib/session.ts) is separate and unchanged.
 */
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

export const getSiteSession = createServerFn({ method: "GET" }).handler(async () => {
  const { SITE_COOKIE, isValidSiteToken } = await import("./siteAuth.server");
  return { signedIn: await isValidSiteToken(getCookie(SITE_COOKIE)) };
});

export const siteSignIn = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; password: string }) => ({ username: String(d?.username ?? "").trim().slice(0, 254), password: String(d?.password ?? "").slice(0, 200) }))
  .handler(async ({ data }) => {
    const { SITE_COOKIE, SITE_MAX_AGE, issueSiteToken, verifySiteAdmin } = await import("./siteAuth.server");
    const userId = await verifySiteAdmin(data.username.toLowerCase(), data.password);
    if (!userId) return { ok: false as const };
    setCookie(SITE_COOKIE, await issueSiteToken(userId), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SITE_MAX_AGE });
    return { ok: true as const };
  });

export const siteSignOut = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie("digit_site_session", { path: "/" });
  return { ok: true };
});
