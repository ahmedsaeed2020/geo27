import { describe, expect, it } from "vitest";
import manifest from "@/content/site/manifest.json";
import scenes from "@/content/page-scenes.json";
import { HR_MODULES } from "@/content/hr/hr-modules";

type SceneRow = { background: string; body: string; backgroundSmall?: string; bodySmall?: string };
const collection: Record<string, SceneRow> = scenes;

describe("Contextual page scenes", () => {
  it("provides distinct background and body images for all imported pages and packages", () => {
    const keys = [...manifest.map(page => page.key), "home", "starter", "pro"];
    for (const key of keys) {
      expect(collection[key], key).toBeDefined();
      expect(collection[key]?.background, key).toMatch(/^\/__l5e\/assets-v1\//);
      expect(collection[key]?.body, key).toMatch(/^\/__l5e\/assets-v1\//);
      expect(collection[key]?.body, key).not.toBe(collection[key]?.background);
    }
  });

  it("gives each of the 7 HR pages its own intro and closing character scene, with small-screen versions", () => {
    const urls = new Set<string>();
    for (const m of HR_MODULES) {
      const s = collection[`hr-${m.slug}`];
      expect(s, m.slug).toBeDefined();
      for (const u of [s.background, s.body, s.backgroundSmall, s.bodySmall]) {
        expect(u, m.slug).toMatch(/^\/__l5e\/assets-v1\//);
        urls.add(u!);
      }
    }
    expect(urls.size).toBe(HR_MODULES.length * 4);
  });

  it("never uses the photos that showed women with uncovered hair (owner rule 2026-11-04)", () => {
    // Asset ids of the original page photos that were replaced or retired for this rule.
    const retired = [
      "0fd70429", "30483e8f", "32206ba0", "35042483", "3866e5da", "6beee3e0", "7b279807", "875a0a60",
      "9aaebda4", "b7a6ca30", "c338d8ca", "cc6e2bf4", "dac6c66a", "dec35ada", "f9a26625",
    ];
    const used = JSON.stringify(scenes);
    for (const id of retired) expect(used.includes(`/assets-v1/${id}`), id).toBe(false);
  });
});
