import { describe, expect, it } from "vitest";
import { SHOTS, THEMES } from "@/content/product-shots";
import { HOME_SHOWCASE, PAGE_PROOFS, PRO_SHOWCASE, PROBLEM_SHOTS, PROOF_COPY } from "@/content/product-proof";
import { withSeo } from "@/lib/seo";
import heroSource from "@/sections/Hero.tsx?raw";
import pricing from "@/content/site/pricing.json";
import pro from "@/content/pro.json";
import features from "@/content/site/features.json";

const pointers = import.meta.glob("/src/assets/product/*.asset.json", { eager: true });

describe("Real DIGIT Pro screenshots", () => {
  it("uses all 49 uploaded screenshots on /pro, grouped into the 10 themes in order", () => {
    expect(Object.keys(pointers)).toHaveLength(49);
    expect(Object.keys(SHOTS)).toHaveLength(49);
    expect(THEMES.map(theme => theme.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const onPro = THEMES.flatMap(theme => theme.shots);
    expect(new Set(onPro)).toEqual(new Set(Object.keys(SHOTS)));
  });

  it("places the requested screenshots on the home tabs and challenge slides", () => {
    expect(HOME_SHOWCASE.tabs.map(tab => [tab.lead, ...tab.smalls])).toEqual([
      ["01-cfo-01-e1", "01-cfo-02-e2", "01-cfo-04-f11"],
      ["02-cash-01-f9", "02-cash-03-f19", "02-cash-02-sl6"],
      ["03-doc-04-d5", "03-doc-01-d1", "03-doc-02-d2"],
      ["05-sales-01-sl2", "05-sales-02-sl5", "05-sales-03-sl7"],
      ["07-inv-01-in1", "07-inv-03-inv-014", "07-inv-02-in3"],
      ["08-ast-02-fa5", "08-ast-01-fa4", "08-ast-03-fix-003"],
      ["hr-s01", "hr-s16", "hr-s21"],
    ]);
    expect(Object.values(PROBLEM_SHOTS)).toEqual(["09-rep-04-l1", "10-ctl-03-s4", "04-360-01-sl1"]);
  });

  it("references only existing screenshots and keeps each block's lead in its list", () => {
    for (const [page, blocks] of Object.entries(PAGE_PROOFS)) {
      for (const block of blocks) {
        expect(block.shots, `${page}/${block.id}`).toContain(block.lead);
        for (const id of block.shots) expect(SHOTS[id], `${page}/${block.id}/${id}`).toBeDefined();
      }
    }
    expect(PAGE_PROOFS["modules-accounting"]?.map(block => block.id)).toEqual(["cfo", "collections"]);
    expect(PAGE_PROOFS["features"]?.map(block => block.id)).toEqual(["smart-document", "daily-control"]);
  });

  it("shows the Pro price only in the /pro showcase", () => {
    expect(PRO_SHOWCASE.price.ar).toBe("DIGIT Pro: 9,999 ر.س سنويًا (بدون ضريبة)، أو 12,999 ر.س مع ربط الفوترة الإلكترونية");
    const elsewhere = JSON.stringify([PAGE_PROOFS, HOME_SHOWCASE, PROOF_COPY, pricing, pro]);
    expect(elsewhere).not.toMatch(/9,999|12,999|9999|12999/);
  });

  it("avoids banned claims in all screenshot copy", () => {
    const copy = JSON.stringify([PAGE_PROOFS, HOME_SHOWCASE, PRO_SHOWCASE, PROOF_COPY, THEMES, Object.values(SHOTS).map(item => item.caption)]);
    for (const banned of ["certified", "معتمد من الهيئة", "AI يتنبأ", "مضمون", "الأفضل في السوق", "100%", "ERPNext", "Finance Book", "Scorecard"]) {
      expect(copy, banned).not.toContain(banned);
    }
  });
});

describe("Customer count", () => {
  it("says more than 200 Saudi establishments in both the hero and the home search description", () => {
    expect(heroSource).toContain("أكثر من 200 منشأة سعودية");
    const description = withSeo("/").meta?.find(tag => tag.name === "description")?.content ?? "";
    expect(description).toContain("أكثر من 200 منشأة سعودية");
    expect(JSON.stringify(withSeo("/"))).not.toContain("50 منشأة");
  });
});

describe("Features AI card", () => {
  it("describes real-time indicators instead of an assistant", () => {
    const text = JSON.stringify(features);
    expect(text).toContain("مؤشرات وتنبيهات لحظية مبنية على بيانات نظامك");
    expect(text).not.toContain("مساعدة ذكية في المهام");
    expect(text).not.toContain("قدرات ذكية مساعِدة");
  });
});
