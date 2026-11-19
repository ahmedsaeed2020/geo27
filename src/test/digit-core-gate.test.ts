import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueSiteToken, isValidSiteToken, siteTokenFromCookieHeader, verifySiteAdmin } from "@/lib/siteAuth.server";
import { handleAssistant } from "@/lib/ai/assistant.server";

const KEY = "test-signing-key-0123456789abcdef0123456789abcdef";

describe("DIGIT Core sign-in gate", () => {
  beforeEach(() => { process.env["DIGIT_CORE_SESSION_KEY"] = KEY; });
  afterEach(() => { vi.useRealTimers(); });

  it("accepts a session it issued", async () => {
    expect(await isValidSiteToken(await issueSiteToken("user-1"))).toBe(true);
  });

  it("rejects a session whose user part was changed", async () => {
    const [, exp, mac] = (await issueSiteToken("user-1")).split(".");
    expect(await isValidSiteToken(`user-2.${exp}.${mac}`)).toBe(false);
  });

  it("rejects a session after 7 days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T00:00:00Z"));
    const token = await issueSiteToken("user-1");
    vi.setSystemTime(new Date("2026-11-26T00:00:01Z"));
    expect(await isValidSiteToken(token)).toBe(false);
  });

  it("rejects every session when the signing secret is missing", async () => {
    const token = await issueSiteToken("user-1");
    delete process.env["DIGIT_CORE_SESSION_KEY"];
    expect(await isValidSiteToken(token)).toBe(false);
  });

  it("does not accept the old built-in admin/admin account", async () => {
    expect(await verifySiteAdmin("admin", "admin")).toBeNull();
  });

  it("reads the session from the cookie header", () => {
    expect(siteTokenFromCookieHeader("a=1; digit_site_session=abc.123.def; b=2")).toBe("abc.123.def");
    expect(siteTokenFromCookieHeader(null)).toBeUndefined();
  });

  it("assistant refuses visitors without a DIGIT Core session", async () => {
    process.env["LOVABLE_API_KEY"] = "test";
    const res = await handleAssistant(new Request("http://localhost/api/assistant", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }) }));
    expect(res.status).toBe(401);
  });
});
