import { afterEach, describe, expect, it } from "vitest";
import { chapterAt, motionTier } from "@/motion/scenes";
import { motionIdentity } from "@/motion/identity";

const original = window.matchMedia;

/** Simulate a device: which media queries match. */
function device({ reduce = false, desktop = false }: { reduce?: boolean; desktop?: boolean }) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduce : query.includes("pointer: fine") ? desktop : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

afterEach(() => {
  Object.defineProperty(window, "matchMedia", { writable: true, value: original });
});

describe("Motion tiers", () => {
  it("turns all choreography off when the visitor asks for reduced motion, even on a desktop", () => {
    device({ reduce: true, desktop: true });
    expect(motionTier()).toBe("none");
  });

  it("keeps scroll-linked choreography for wide desktops with a fine pointer", () => {
    device({ desktop: true });
    expect(motionTier()).toBe("full");
  });

  it("uses the lighter tier on phones, tablets and touch screens", () => {
    device({});
    expect(motionTier()).toBe("lite");
  });
});

describe("Product theater chapters", () => {
  it("splits the scroll through the section into four equal angles", () => {
    expect(chapterAt(0, 4)).toBe(0);
    expect(chapterAt(0.24, 4)).toBe(0);
    expect(chapterAt(0.26, 4)).toBe(1);
    expect(chapterAt(0.6, 4)).toBe(2);
    expect(chapterAt(0.99, 4)).toBe(3);
  });

  it("stays on the first or last angle before and after the section", () => {
    expect(chapterAt(-0.5, 4)).toBe(0);
    expect(chapterAt(1, 4)).toBe(3);
    expect(chapterAt(3, 4)).toBe(3);
    expect(chapterAt(0.5, 1)).toBe(0);
  });
});

describe("Motion identities", () => {
  it("gives the home page its own identity in both languages", () => {
    expect(motionIdentity("/")).toBe("home");
    expect(motionIdentity("/en")).toBe("home");
  });

  it("gives each product family a distinct identity in Arabic and English", () => {
    expect(motionIdentity("/pro/cfo-decisions")).toBe("pro");
    expect(motionIdentity("/hr/payroll-rewards")).toBe("hr");
    expect(motionIdentity("/en/hr/core-hr")).toBe("hr");
    expect(motionIdentity("/construction/claims")).toBe("construction");
    expect(motionIdentity("/en/crm/opportunities")).toBe("crm");
    expect(motionIdentity("/modules/fsm-itm")).toBe("fsm");
    expect(motionIdentity("/pos-solutions/pharmacies")).toBe("pos");
  });

  it("falls back to the site identity on corporate pages", () => {
    expect(motionIdentity("/about")).toBe("site");
    expect(motionIdentity("/en/quote")).toBe("site");
  });
});
