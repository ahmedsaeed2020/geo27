import { describe, expect, it } from "vitest";
import manifest from "@/content/site/manifest.json";
import scenes from "@/content/page-scenes.json";

describe("Contextual page scenes", () => {
  it("provides distinct background and body images for all imported pages and packages", () => {
    const collection: Record<string, { background: string; body: string }> = scenes;
    const keys = [...manifest.map(page => page.key), "home", "starter", "pro"];
    for (const key of keys) {
      expect(collection[key], key).toBeDefined();
      expect(collection[key]?.background, key).toMatch(/^\/__l5e\/assets-v1\//);
      expect(collection[key]?.body, key).toMatch(/^\/__l5e\/assets-v1\//);
      expect(collection[key]?.body, key).not.toBe(collection[key]?.background);
    }
  });
});