import { getPublishedContent } from '@/lib/cms.functions';
import { withSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import ImportedPage from "@/components/ImportedPage";
import page from "@/content/site/industries-real-estate-2.json";
import "@/content/site/industries-real-estate-2.css";
export const Route = createFileRoute("/industries/real-estate-2")({
 loader: () => getPublishedContent(),
  head: ({ loaderData }) => withSeo("/industries/real-estate-2", { meta: [
    { title: page.title + " — Digit" },
    { name: "description", content: page.description },
    { property: "og:title", content: page.title + " — Digit" },
    { property: "og:description", content: page.description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }, loaderData),
  component: Page,
});
function Page() { return <ImportedPage page={page} pageKey="industries-real-estate-2" />; }
