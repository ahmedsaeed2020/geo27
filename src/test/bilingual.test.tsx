import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { routeTree } from "@/routeTree.gen";
import manifest from "@/content/site/manifest.json";
import navigation from "@/content/site/navigation.json";
import { localeHref, localizeData, translate } from "@/lib/i18n";

describe("Bilingual site", () => {
  it("provides an English route for every page and menu destination", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const paths = new Set(["/", "/starter", "/pro", ...manifest.map(page => page.path), ...navigation.flatMap(group => [group.href, ...group.children.map(child => child.href)])]);
    for (const path of paths) {
      const english = localeHref(path, "en");
      expect(router.matchRoutes(english).at(-1)?.routeId, english).not.toBe(rootRouteId);
      expect(localeHref(english, "ar")).toBe(path);
    }
  });
  it("preserves external services, media URLs, numbers and HTML structure", () => {
    expect(localeHref("https://digit-erp.com/starter/#Checkout", "en")).toBe("https://digit-erp.com/starter/#Checkout");
    expect(localeHref("/__l5e/assets-v1/photo.jpg", "en")).toBe("/__l5e/assets-v1/photo.jpg");
    expect(localeHref("/en/modules/sales", "en")).toBe("/en/modules/sales");
    expect(localizeData({ href: "/modules/sales", price: 1499 })).toEqual({ href: "/en/modules/sales", price: 1499 });
    expect(translate('<span class="is-23">من المسؤول</span>')).toBe('<span class="is-23">Who is responsible</span>');
  });
});