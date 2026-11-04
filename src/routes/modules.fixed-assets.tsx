import { loadPublished } from '@/lib/cms-query';
import { withSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import ImportedPage from "@/components/ImportedPage";
import proFixedAssets from "@/content/pro/pages/fixed-assets";
import page from "@/content/site/modules-fixed-assets.json";
import "@/content/site/modules-fixed-assets.css";
export const Route = createFileRoute("/modules/fixed-assets")({
 loader: ({ context, location }) => loadPublished(context.queryClient, location),
  head: ({ loaderData }) => withSeo("/modules/fixed-assets", { meta: [
    { title: page.title + " — Digit" },
    { name: "description", content: page.description },
    { property: "og:title", content: page.title + " — Digit" },
    { property: "og:description", content: page.description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }, loaderData),
  component: Page,
});
function Page() { return <ImportedPage page={page} pageKey="modules-fixed-assets" pro={proFixedAssets} />; }
