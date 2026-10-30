import { loadPublished } from '@/lib/cms-query';
import { withSeo } from "@/lib/seo";
import { localizeData, translate } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import PackagePage from "@/components/PackagePage";
import arabicNodes from "@/content/pro.json";

const nodes = localizeData(arabicNodes);
export const Route = createFileRoute("/en/pro")({
 loader: ({ context, location }) => loadPublished(context.queryClient, location),
  head: ({ loaderData }) => withSeo("/en/pro", { meta: [
    { title: translate("باقة Pro — Digit | النظام المالي والتشغيلي") },
    { name: "description", content: translate("باقة Digit Pro تجمع المحاسبة والمبيعات والمشتريات والمخزون والأصول والتقارير في نظام مالي وتشغيلي واحد.") },
    { property: "og:title", content: translate("باقة Pro — Digit") },
    { property: "og:description", content: translate("نظام مالي وتشغيلي متكامل لمنشأتك مع Digit Pro. استعرض الموديولات واحجز عرضًا تجريبيًا.") },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }, loaderData),
  component: ProPage,
});

function ProPage() { return <PackagePage nodes={nodes} slug="pro" />; }