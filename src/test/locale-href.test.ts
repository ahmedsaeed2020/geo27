import { describe, expect, it } from "vitest";
import { localeHref } from "@/lib/i18n";

describe("localeHref keeps internal links on the canonical URL", () => {
  it("drops the trailing slash imported links carry", () => {
    expect(localeHref("/careers/", "ar")).toBe("/careers");
    expect(localeHref("/modules/crm/", "en")).toBe("/en/modules/crm");
  });
  it("keeps the home page, query strings and fragments", () => {
    expect(localeHref("/", "ar")).toBe("/");
    expect(localeHref("/", "en")).toBe("/en");
    expect(localeHref("/en/", "ar")).toBe("/");
    expect(localeHref("/demo/?from=/pro", "en")).toBe("/en/demo?from=/pro");
    expect(localeHref("/faq/#zatca", "ar")).toBe("/faq#zatca");
  });
  it("leaves files, media and external links alone", () => {
    expect(localeHref("/llms.txt", "en")).toBe("/llms.txt");
    expect(localeHref("https://example.com/a/", "en")).toBe("https://example.com/a/");
  });
});
