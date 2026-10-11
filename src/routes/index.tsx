import { createFileRoute } from "@tanstack/react-router";
import HomePage from "@/components/HomePage";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Digit — منصة ERP سعودية | محاسبة، فوترة إلكترونية، نقاط بيع" },
      {
        name: "description",
        content:
          "Digit نظام ERP مالي وتشغيلي للسوق السعودي — محاسبة وفوترة إلكترونية ومبيعات ومشتريات ومخزون ونقاط بيع وتقارير، سحابياً أو داخل سيرفراتك.",
      },
      { property: "og:title", content: "Digit — منصة ERP سعودية" },
      {
        property: "og:description",
        content:
          "منصة واحدة تدير ماليتك وعملياتك ونقاط بيعك — محاسبة وفوترة إلكترونية ومخزون وتقارير، سحابياً أو داخل سيرفراتك.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

