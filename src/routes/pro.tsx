import { getPublishedContent } from '@/lib/cms.functions';
import { withSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import PackagePage from "@/components/PackagePage";
import nodes from "@/content/pro.json";

export const Route = createFileRoute("/pro")({
 loader: () => getPublishedContent(),
  head: ({ loaderData }) => withSeo("/pro", { meta: [
    { title: "باقة Pro — Digit | النظام المالي والتشغيلي" },
    { name: "description", content: "باقة Digit Pro تجمع المحاسبة والمبيعات والمشتريات والمخزون والأصول والتقارير في نظام مالي وتشغيلي واحد." },
    { property: "og:title", content: "باقة Pro — Digit" },
    { property: "og:description", content: "نظام مالي وتشغيلي متكامل لمنشأتك مع Digit Pro. استعرض الموديولات واحجز عرضًا تجريبيًا." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }, loaderData),
  component: ProPage,
});

function ProPage() { return <PackagePage nodes={nodes} slug="pro" />; }