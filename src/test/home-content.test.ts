import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAPABILITY_CARDS, FINAL, HOME_FAQ, INDUSTRY_TILES, JOURNEY_STEPS, PROBLEM_SLIDES, SAUDI, SAUDI_TILES, journeyHref,
} from "@/content/home";
import * as HOME from "@/content/home";
import { PRODUCTS, MORE_SYSTEMS } from "@/content/catalog";
import { PRO_AREAS } from "@/content/pro/pro-pages";
import { HR_INDEX } from "@/content/hr/hr-index";
import { PROBLEM_SHOTS, HOME_SHOWCASE } from "@/content/product-proof";
import { screenById } from "@/content/screens";
import { SHOTS } from "@/content/product-shots";
import { requestPage, isRequestWording } from "@/lib/form-cta";
import { withSeo } from "@/lib/seo";
import selling from "@/content/pro/pages/selling";
import inventory from "@/content/pro/pages/inventory";
import accounting from "@/content/pro/pages/accounting";
import cfo from "@/content/pro/pages/cfo";

const ROUTES = resolve(__dirname, "../routes");
const PRO_AREA_PATHS = new Set(PRO_AREAS.map(a => a.path));
const HR_PATHS = new Set(HR_INDEX.map(m => `/hr/${m.slug}`));

/** True when a site path is served by a route file (static file, HR section page or DIGIT Pro area page). */
function routeExists(href: string): boolean {
  const path = href.split(/[?#]/)[0]!;
  if (path === "/") return true;
  if (HR_PATHS.has(path) || PRO_AREA_PATHS.has(path)) return true;
  const dotted = path.slice(1).replace(/\//g, ".");
  return [`${dotted}.tsx`, `${dotted}.index.tsx`].some(f => existsSync(resolve(ROUTES, f)));
}

describe("home page content", () => {
  it("keeps each journey angle's question identical to the DIGIT Pro workspace or CFO question it opens", () => {
    const pages: Record<string, unknown> = { "/modules/sales": selling, "/modules/inventory": inventory, "/modules/accounting": accounting, "/pro/cfo-decisions": cfo };
    for (const step of JOURNEY_STEPS) {
      const source = JSON.stringify(pages[step.page]);
      expect(source, step.ws).toContain(step.question.ar);
      expect(source, step.ws).toContain(step.question.en);
      expect(source, step.ws).toContain(step.ws.replace(/^q-/, ""));
      expect(SHOTS[step.shot], step.shot).toBeDefined();
    }
    expect(journeyHref(JOURNEY_STEPS[0]!)).toBe("/modules/sales#pv-SEL-CUSTOMER");
    expect(journeyHref(JOURNEY_STEPS[3]!)).toBe("/pro/cfo-decisions#pv-q-EXE-01");
  });

  it("links only to pages that exist", () => {
    const links = [
      ...JOURNEY_STEPS.map(s => s.page),
      ...CAPABILITY_CARDS.map(c => c.href),
      ...PROBLEM_SLIDES.map(s => s.href),
      ...INDUSTRY_TILES.map(t => t.href),
      ...SAUDI_TILES.flatMap(t => (t.href ? [t.href] : [])),
      SAUDI.onboardingHref,
      ...PRODUCTS.map(p => p.overview),
      ...MORE_SYSTEMS.map(m => m.path),
      ...HOME_SHOWCASE.tabs.map(t => t.href),
      "/demo", "/quote", "/blueprint", "/faq",
    ];
    for (const href of links) expect(routeExists(href), href).toBe(true);
  });

  it("sends demo wording to /demo, quote wording to /quote and the blueprint button to the builder", () => {
    expect(requestPage(FINAL.demo.ar)).toBe("/demo");
    expect(requestPage(FINAL.demo.en)).toBe("/demo");
    expect(requestPage(FINAL.quote.ar)).toBe("/quote");
    expect(requestPage(FINAL.quote.en)).toBe("/quote");
    expect(isRequestWording(FINAL.blueprint.ar)).toBe(false);
    expect(isRequestWording(FINAL.blueprint.en)).toBe(false);
    const pricing = PROBLEM_SLIDES.find(s => s.key === "pricing")!;
    expect(pricing.href).toBe("/quote");
    expect(requestPage(pricing.link.ar)).toBe("/quote");
  });

  it("makes no price, certification, compliance or official-integration claim", () => {
    const copy = JSON.stringify(HOME);
    for (const banned of [/متوافق/, /معتمد من/, /المرحلة الثانية/, /ثماني مراحل/, /من اليوم الأول/, /ر\.س|SAR|ريال/, /\bcompliant\b/i, /\bcertified\b/i, /phase (2|II)\b/i, /متصل ✓/, /ذكاء اصطناعي|الذكاء الاصطناعي|\bAI\b/]) {
      expect(copy, String(banned)).not.toMatch(banned);
    }
    expect(copy).toContain("يدعم الربط مع منظومة");
    // Payroll: official rules and integrations are confirmed per business, never asserted.
    expect(HOME_FAQ.find(f => f.q.en.includes("payroll"))!.a.ar).toContain("لا نعلن مطابقة رسمية");
  });

  it("describes delivery as six stages in the FAQ", () => {
    const answer = HOME_FAQ.find(f => f.q.en.startsWith("How long"))!.a;
    expect(answer.ar).toContain("ست مراحل");
    expect(answer.en).toContain("six stages");
  });

  it("names all six product families in the first FAQ answer", () => {
    for (const p of PRODUCTS) expect(HOME_FAQ[0]!.a.en).toContain(p.name.en);
  });

  it("publishes the visible FAQ as the home page's structured data in both languages", () => {
    for (const [path, lang] of [["/", "ar"], ["/en", "en"]] as const) {
      const scripts = (withSeo(path).scripts ?? []).map(s => JSON.parse(String((s as { children?: string }).children ?? "{}")));
      const faq = scripts.find(s => s["@type"] === "FAQPage");
      expect(faq, path).toBeDefined();
      expect(faq.mainEntity.map((q: { name: string }) => q.name)).toEqual(HOME_FAQ.map(f => f.q[lang]));
    }
  });

  it("backs challenge slides and showcase tabs with registered real screens only", () => {
    const keys = new Set(PROBLEM_SLIDES.map(s => s.key));
    for (const [key, id] of Object.entries(PROBLEM_SHOTS)) {
      expect(keys.has(key), key).toBe(true);
      expect(SHOTS[id], id).toBeDefined();
    }
    for (const tab of HOME_SHOWCASE.tabs) for (const id of [tab.lead, ...tab.smalls]) expect(screenById(id), id).toBeDefined();
  });
});
